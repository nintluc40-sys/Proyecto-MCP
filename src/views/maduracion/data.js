/* ============================================================
   MADURACIÓN · "Microchips" — CAPA DE DATOS PURA
   Analítica del Registro Reproductivo (trazabilidad de hembras por Trovan ID).
   Funciones PURAS (sin DOM ni store): reciben las filas crudas de las 3 hojas
   (objetos con claves = cabecera, tal como los entrega el store) y devuelven el
   modelo normalizado + KPIs, rankings, tendencias e indicadores.

   Fuentes (store `_SheetOrigin`, nombres EXACTOS fijados en sheets.classifyOrigin):
   · "Maduración MATRIZ"          → estado ACTUAL por individuo.
   · "Maduración Bitácora"        → 1 fila por evento (Desove | Mortalidad) + snapshot Sala/Tanque.
   · "Maduración Transferencias"  → 1 fila por (TR-ID × Trovan) movido.

   IMPORTANTE — la hoja Bitácora REAL solo guarda Trovan/Fecha/Tipo (SIN Sala/Tanque
   ni Observaciones). La ubicación de cada evento se DERIVA siguiendo al Trovan: por
   la MATRIZ (Sala/Tanque actual) y, si hay transferencias, reconstruyendo la
   ubicación vigente a la fecha del evento (ver resolveEventLocation).

   DEFINICIONES (documentadas para que el usuario pueda ajustarlas en revisión):
   · Un "desove"/"mortalidad" = una fila de Bitácora del Tipo correspondiente; su
     ubicación (Sala/Tanque) se deriva por Trovan (MATRIZ + transferencias).
   · Producción de un tanque/sala = nº de desoves con ESA ubicación snapshot.
   · Fertilidad % de un tanque/sala = hembras distintas que desovaron allí ÷ hembras
     observadas allí (con algún evento en el período ∪ ocupantes vivas actuales), ×100.
   · Eficiencia reproductiva = desoves ÷ hembras observadas (desoves por hembra).
   · Ventana de actividad = ACTIVITY_WINDOW_DAYS días hacia atrás desde la fecha más
     reciente de los datos; clasifica hembra Activa/Inactiva/Transferida (reciente).
   · Fertilidad en TENDENCIAS = hembras que desovaron en el bucket ÷ hembras VIVAS
     durante el bucket (ingreso ≤ fin del bucket y sin muerte previa), ×100.
   ============================================================ */
import { parseAnyDate, yearMonthKey } from '../../core/dates.js';

export const MAD_MATRIZ_ORIGIN = 'Maduración MATRIZ';
export const MAD_BITACORA_ORIGIN = 'Maduración Bitácora';
export const MAD_TRANSFER_ORIGIN = 'Maduración Transferencias';

export const ESTADO_VIVO = 'Vivo';
export const ESTADO_MUERTO = 'Muerto';
export const EVENTO_DESOVE = 'Desove';
export const EVENTO_MORTALIDAD = 'Mortalidad';

// Ventana (días) para clasificar actividad reproductiva y transferencia reciente.
export const ACTIVITY_WINDOW_DAYS = 45;

// Estados de la hembra (mutuamente excluyentes; ver classifyFemale).
export const FEMALE_STATES = ['activa', 'inactiva', 'transferida', 'fallecida'];
export const FEMALE_STATE_META = {
  activa:      { label: 'Activa',      color: '#2e9e5b', desc: 'Viva y con desove reciente' },
  inactiva:    { label: 'Inactiva',    color: '#d99a00', desc: 'Viva, sin desove reciente' },
  transferida: { label: 'Transferida', color: '#3f7fd0', desc: 'Viva y reubicada recientemente' },
  fallecida:   { label: 'Fallecida',   color: '#e0533b', desc: 'Registrada como muerta' },
};

/* ── Acceso tolerante a cabeceras ── */
const gv = (o, names) => {
  for (let i = 0; i < names.length; i++) {
    const v = o[names[i]];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};
const H = {
  trovan: ['Trovan ID', 'Trovan', 'TrovanID', 'trovan'],
  numero: ['Número', 'Numero', 'numero'],
  color: ['Color anillo', 'Color'],
  piscina: ['Piscina'],
  codigo: ['Código genético', 'Codigo genético', 'Código', 'Codigo'],
  lote: ['Lote'],
  salaAct: ['Sala actual', 'Sala'],
  tanqueAct: ['Tanque actual', 'Tanque'],
  estado: ['Estado'],
  fMuerte: ['Fecha muerte', 'Fecha de muerte'],
  fIngreso: ['Fecha ingreso', 'Fecha de ingreso'],
  fecha: ['Fecha'],
  tipo: ['Tipo'],
  sala: ['Sala'],
  tanque: ['Tanque'],
  obs: ['Observaciones', 'Observación'],
  trId: ['TR-ID', 'TR ID', 'TRID'],
  salaOrigen: ['Sala origen'],
  tanqueOrigen: ['Tanque origen'],
  salaDestino: ['Sala destino'],
  tanqueDestino: ['Tanque destino'],
};

// Canónico: quita espacios y MAYÚSCULAS (espeja el write-side reproductivo.data.js;
// los Trovan son hex y desde 2026-07-14 la captura los guarda en mayúsculas → evita
// que un caso mixto legado rompa en silencio los cruces entre hojas por Trovan).
const normTrovan = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
const dash = (s) => (s && String(s).trim()) ? String(s).trim() : '—';
/** Clave de ubicación Sala · Tanque (para agregados). */
export const locKey = (sala, tanque) => `${dash(sala)} · ${dash(tanque)}`;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Etiqueta legible de una clave de mes "yyyy-mm". */
export function monthLabel(key) {
  if (!key) return '';
  const [y, m] = String(key).split('-');
  const idx = (+m) - 1;
  return `${MESES_FULL[idx] || m} ${y}`;
}
const DAY_MS = 86400000;

/* ── Resolución de ubicación por Trovan ──
   La hoja Bitácora REAL solo trae Trovan/Fecha/Tipo (sin Sala/Tanque). La ubicación
   de un evento se DERIVA siguiendo al Trovan: si hay transferencias, se reconstruye
   la ubicación vigente a la fecha del evento (último destino con fecha ≤ evento, o el
   origen del primer movimiento si el evento es anterior); si no, la ubicación ACTUAL
   de la MATRIZ (que, sin transferencias, es la única que ha tenido). */
function resolveEventLocation(trovan, date, byTrovan, movByTrovan) {
  const movs = movByTrovan.get(trovan);
  if (movs && movs.length && date) {
    let loc = null;
    for (let i = 0; i < movs.length; i++) {
      const m = movs[i];
      if (m.date && m.date <= date) loc = { sala: m.salaDestino, tanque: m.tanqueDestino };
    }
    if (loc && (loc.sala || loc.tanque)) return loc;
    const first = movs.find((m) => m.date);
    if (first && (first.salaOrigen || first.tanqueOrigen)) return { sala: first.salaOrigen, tanque: first.tanqueOrigen };
  }
  const rec = byTrovan.get(trovan);
  if (rec) return { sala: rec.sala, tanque: rec.tanque };
  return { sala: '', tanque: '' };
}

/* ── Modelo normalizado ── */
/**
 * Construye el modelo del Registro Reproductivo a partir de las filas crudas.
 * @returns {{females:Array, byTrovan:Map, desoves:Array, mortalidades:Array,
 *   movimientos:Array, desovesByTrovan:Map, movByTrovan:Map, dataMaxDate:?Date, months:string[]}}
 */
export function buildReproModel(matrizRows, bitacoraRows, transferRows) {
  const females = [];
  const byTrovan = new Map();
  (matrizRows || []).forEach((o) => {
    const trovan = normTrovan(gv(o, H.trovan));
    if (!trovan) return;
    const rec = {
      trovan,
      numero: gv(o, H.numero), color: gv(o, H.color), piscina: gv(o, H.piscina),
      codigo: gv(o, H.codigo), lote: gv(o, H.lote),
      sala: gv(o, H.salaAct), tanque: gv(o, H.tanqueAct),
      estado: gv(o, H.estado) || ESTADO_VIVO,
      fechaMuerte: gv(o, H.fMuerte), fechaIngreso: gv(o, H.fIngreso),
      obs: gv(o, H.obs),
      _ingreso: parseAnyDate(gv(o, H.fIngreso)),
      _muerte: parseAnyDate(gv(o, H.fMuerte)),
    };
    if (!byTrovan.has(trovan)) { byTrovan.set(trovan, rec); females.push(rec); }
  });

  // Movimientos (transferencias) — se parsean ANTES de la bitácora para poder
  // derivar la ubicación de cada evento por Trovan.
  const movimientos = [];
  (transferRows || []).forEach((o) => {
    const trovan = normTrovan(gv(o, H.trovan));
    const date = parseAnyDate(gv(o, H.fecha));
    if (!trovan) return;
    movimientos.push({
      trId: gv(o, H.trId), trovan, fecha: gv(o, H.fecha), date, tipo: gv(o, H.tipo),
      salaOrigen: gv(o, H.salaOrigen), tanqueOrigen: gv(o, H.tanqueOrigen),
      salaDestino: gv(o, H.salaDestino), tanqueDestino: gv(o, H.tanqueDestino),
    });
  });
  const movByTrovan = new Map();
  movimientos.forEach((m) => { if (!movByTrovan.has(m.trovan)) movByTrovan.set(m.trovan, []); movByTrovan.get(m.trovan).push(m); });
  movByTrovan.forEach((arr) => arr.sort((a, b) => (a.date || 0) - (b.date || 0)));

  const desoves = [], mortalidades = [];
  (bitacoraRows || []).forEach((o) => {
    const trovan = normTrovan(gv(o, H.trovan));
    const tipo = gv(o, H.tipo);
    const raw = gv(o, H.fecha);
    const date = parseAnyDate(raw);
    if (!trovan || !date) return;
    // Ubicación del evento: usa el snapshot de la fila SÓLO si viene (compatibilidad);
    // si no, la deriva por Trovan (MATRIZ + transferencias). La Bitácora real solo
    // trae Trovan/Fecha/Tipo, así que el caso normal es la derivación.
    let sala = gv(o, H.sala), tanque = gv(o, H.tanque);
    if (!sala && !tanque) { const loc = resolveEventLocation(trovan, date, byTrovan, movByTrovan); sala = loc.sala; tanque = loc.tanque; }
    const ev = { trovan, fecha: raw, date, sala, tanque, obs: gv(o, H.obs) };
    if (tipo === EVENTO_DESOVE) desoves.push(ev);
    else if (tipo === EVENTO_MORTALIDAD) mortalidades.push(ev);
  });
  const byDate = (a, b) => a.date - b.date;
  desoves.sort(byDate);
  mortalidades.sort(byDate);

  // Índice de desoves por Trovan.
  const desovesByTrovan = new Map();
  desoves.forEach((d) => { if (!desovesByTrovan.has(d.trovan)) desovesByTrovan.set(d.trovan, []); desovesByTrovan.get(d.trovan).push(d); });

  // Fecha máxima de los datos (referencia de "ahora" para ventanas de actividad).
  let dataMaxDate = null;
  const consider = (d) => { if (d && (!dataMaxDate || d > dataMaxDate)) dataMaxDate = d; };
  desoves.forEach((e) => consider(e.date));
  mortalidades.forEach((e) => consider(e.date));
  movimientos.forEach((e) => consider(e.date));

  // Meses presentes (de los eventos de bitácora), ascendente.
  const monthSet = new Set();
  desoves.concat(mortalidades).forEach((e) => { const k = yearMonthKey(e.date); if (k) monthSet.add(k); });
  const months = [...monthSet].sort();

  return { females, byTrovan, desoves, mortalidades, movimientos, desovesByTrovan, movByTrovan, dataMaxDate, months };
}

/* ── Filtros ── */
/** ¿El evento pasa el filtro Sala/Tanque + rango de fechas [from,to] (Date, opcional)? */
function passLoc(ev, f) {
  if (f.sala && String(ev.sala) !== f.sala) return false;
  if (f.tanque && String(ev.tanque) !== f.tanque) return false;
  if (f.from && ev.date < f.from) return false;
  if (f.to && ev.date > f.to) return false;
  return true;
}
/** Rango [from,to] de un mes "yyyy-mm" (o null,null si key falsy). */
export function monthBounds(key) {
  if (!key) return { from: null, to: null };
  const [y, m] = String(key).split('-').map(Number);
  return { from: new Date(y, m - 1, 1, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59) };
}
/** Normaliza un objeto de filtro de UI a {sala,tanque,from,to}. */
export function makeFilter({ sala = null, tanque = null, month = null } = {}) {
  const { from, to } = monthBounds(month);
  return { sala: sala || null, tanque: tanque || null, from, to, month: month || null };
}

const desovesIn = (model, f) => model.desoves.filter((e) => passLoc(e, f));
const mortsIn = (model, f) => model.mortalidades.filter((e) => passLoc(e, f));

/* ── KPIs globales ── */
export function kpis(model, f) {
  const des = desovesIn(model, f);
  const mor = mortsIn(model, f);
  const spawners = new Set(des.map((e) => e.trovan));
  // Población de hembras (según filtro de sala/tanque, por ubicación ACTUAL en matriz).
  const pop = model.females.filter((r) => (!f.sala || String(r.sala) === f.sala) && (!f.tanque || String(r.tanque) === f.tanque));
  const vivas = pop.filter((r) => r.estado !== ESTADO_MUERTO).length;
  const muertas = pop.length - vivas;
  // Fertilidad = % de hembras VIVAS (en la ubicación) que ALGUNA VEZ han desovado.
  // Antes el numerador contaba TODAS las hembras que desovaron en la ubicación (por
  // snapshot de evento, incl. muertas/transferidas fuera): al mezclarse con el
  // denominador "vivas actuales" podía SUPERAR el 100 % y no coincidía con su etiqueta
  // ("% de vivas que han desovado") ni con `neverSpawned` (su complemento). Ahora el
  // numerador son las vivas de la ubicación que constan como desovadoras → acotado 0–100.
  const everSpawnedAnywhere = new Set(model.desoves.map((e) => e.trovan));
  const vivasQueDesovaron = pop.filter((r) => r.estado !== ESTADO_MUERTO && everSpawnedAnywhere.has(r.trovan)).length;
  const fertilidadGlobal = vivas ? (vivasQueDesovaron / vivas) * 100 : 0;
  return {
    totalHembras: pop.length, vivas, muertas,
    desoves: des.length, mortalidad: mor.length,
    spawners: spawners.size, fertilidadGlobal,
    desovesPorHembraViva: vivas ? des.length / vivas : 0,
  };
}

/* ── Producción / fertilidad por ubicación (tanque o sala) ── */
/** @param {'sala'|'tanque'|'loc'} level  agrupación: sala, tanque o Sala·Tanque. */
export function locationStats(model, f, level = 'tanque') {
  const keyOf = (o) => level === 'sala' ? dash(o.sala) : level === 'loc' ? locKey(o.sala, o.tanque) : dash(o.tanque);
  const map = new Map();
  const ensure = (k, sample) => {
    if (!map.has(k)) map.set(k, { key: k, sala: sample.sala || '', tanque: sample.tanque || '', desoves: 0, mortalidad: 0, hembras: new Set(), spawners: new Set() });
    return map.get(k);
  };
  desovesIn(model, f).forEach((e) => { const g = ensure(keyOf(e), e); g.desoves++; g.hembras.add(e.trovan); g.spawners.add(e.trovan); });
  mortsIn(model, f).forEach((e) => { const g = ensure(keyOf(e), e); g.mortalidad++; g.hembras.add(e.trovan); });
  // Ocupantes vivas actuales (aunque no tengan eventos en el período) — denominador de fertilidad.
  model.females.forEach((r) => {
    if (r.estado === ESTADO_MUERTO) return;
    if (f.sala && String(r.sala) !== f.sala) return;
    if (f.tanque && String(r.tanque) !== f.tanque) return;
    const k = level === 'sala' ? dash(r.sala) : level === 'loc' ? locKey(r.sala, r.tanque) : dash(r.tanque);
    if (level !== 'sala' && k === '—') return; // sin tanque asignado no crea fila fantasma
    ensure(k, r).hembras.add(r.trovan);
  });
  return [...map.values()].map((g) => {
    const hembras = g.hembras.size, spawners = g.spawners.size;
    return {
      key: g.key, sala: g.sala, tanque: g.tanque,
      desoves: g.desoves, mortalidad: g.mortalidad, hembras, spawners,
      fertilidad: hembras ? (spawners / hembras) * 100 : 0,
      eficiencia: hembras ? g.desoves / hembras : 0,
    };
  }).sort((a, b) => b.desoves - a.desoves || b.fertilidad - a.fertilidad);
}

/* ── Ranking de hembras por nº de desoves ── */
export function femaleRanking(model, f) {
  const map = new Map();
  desovesIn(model, f).forEach((e) => {
    if (!map.has(e.trovan)) map.set(e.trovan, { trovan: e.trovan, desoves: 0, last: null, first: null });
    const g = map.get(e.trovan);
    g.desoves++;
    if (!g.last || e.date > g.last) g.last = e.date;
    if (!g.first || e.date < g.first) g.first = e.date;
  });
  return [...map.values()].map((g) => {
    const rec = model.byTrovan.get(g.trovan) || {};
    const arr = (model.desovesByTrovan.get(g.trovan) || []).filter((e) => passLoc(e, f)).map((e) => e.date);
    return {
      trovan: g.trovan, desoves: g.desoves, ultimoDesove: g.last, primerDesove: g.first,
      sala: rec.sala || '', tanque: rec.tanque || '', estado: rec.estado || '',
      intervaloPromedio: avgInterval(arr),
    };
  }).sort((a, b) => b.desoves - a.desoves || (b.ultimoDesove || 0) - (a.ultimoDesove || 0));
}

/** Intervalos (días) entre desoves consecutivos de una lista de fechas Date (asc). */
export function intervalsOf(dates) {
  const ds = [...dates].sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < ds.length; i++) out.push(Math.round((ds[i] - ds[i - 1]) / DAY_MS));
  return out;
}
function avgInterval(dates) {
  const iv = intervalsOf(dates);
  return iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : null;
}

/* ── Historial completo de una hembra (SIEMPRE all-time) ── */
export function femaleHistory(model, trovan) {
  const id = normTrovan(trovan);
  const rec = model.byTrovan.get(id) || null;
  const desoves = (model.desovesByTrovan.get(id) || []).slice().sort((a, b) => a.date - b.date);
  const dates = desoves.map((e) => e.date);
  const intervals = intervalsOf(dates);
  const movimientos = (model.movByTrovan.get(id) || []).slice();
  const mortalidad = model.mortalidades.filter((e) => e.trovan === id);
  return {
    trovan: id, rec, desoves, intervals, movimientos, mortalidad,
    totalDesoves: desoves.length,
    intervaloPromedio: intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null,
    intervaloMin: intervals.length ? Math.min(...intervals) : null,
    intervaloMax: intervals.length ? Math.max(...intervals) : null,
    primerDesove: dates.length ? dates[0] : null,
    ultimoDesove: dates.length ? dates[dates.length - 1] : null,
  };
}

/* ── Hembras que NUNCA han desovado (all-time; vivas, filtrable por ubicación) ── */
export function neverSpawned(model, f = {}) {
  const everSpawned = new Set(model.desoves.map((e) => e.trovan));
  return model.females.filter((r) => r.estado !== ESTADO_MUERTO
    && !everSpawned.has(r.trovan)
    && (!f.sala || String(r.sala) === f.sala)
    && (!f.tanque || String(r.tanque) === f.tanque))
    .sort((a, b) => (a.trovan < b.trovan ? -1 : 1));
}

/* ── Distribución de intervalos de recuperación (histograma) ── */
export const INTERVAL_BINS = [
  { label: '≤ 7 d', lo: 0, hi: 7 },
  { label: '8–14 d', lo: 8, hi: 14 },
  { label: '15–21 d', lo: 15, hi: 21 },
  { label: '22–28 d', lo: 22, hi: 28 },
  { label: '29–35 d', lo: 29, hi: 35 },
  { label: '≥ 36 d', lo: 36, hi: Infinity },
];
/** Todos los intervalos entre desoves (por hembra) del universo filtrado + histograma. */
export function recoveryDistribution(model, f) {
  const perFemale = new Map();
  desovesIn(model, f).forEach((e) => { if (!perFemale.has(e.trovan)) perFemale.set(e.trovan, []); perFemale.get(e.trovan).push(e.date); });
  const all = [];
  const promedios = [];
  perFemale.forEach((dates) => {
    const iv = intervalsOf(dates);
    if (iv.length) { all.push(...iv); promedios.push(iv.reduce((a, b) => a + b, 0) / iv.length); }
  });
  const bins = INTERVAL_BINS.map((b) => ({ label: b.label, n: all.filter((v) => v >= b.lo && v <= b.hi).length }));
  const promedioGlobal = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
  return { intervals: all, bins, promedioGlobal, hembrasConIntervalo: promedios.length };
}

/* ── Clasificación de hembras (activa/inactiva/transferida/fallecida) ── */
export function classifyFemale(rec, model, ref) {
  if (!rec) return 'inactiva';
  if (rec.estado === ESTADO_MUERTO) return 'fallecida';
  const winStart = ref ? new Date(ref.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS) : null;
  // Transferida reciente: último movimiento dentro de la ventana.
  const mov = model.movByTrovan.get(rec.trovan);
  if (winStart && mov && mov.length) {
    const last = mov[mov.length - 1];
    if (last.date && last.date >= winStart) return 'transferida';
  }
  // Activa: desove dentro de la ventana.
  const des = model.desovesByTrovan.get(rec.trovan);
  if (winStart && des && des.some((e) => e.date >= winStart)) return 'activa';
  return 'inactiva';
}
/** Distribución de estados de la población (filtrable por ubicación actual). */
export function stateDistribution(model, f = {}) {
  const ref = model.dataMaxDate;
  const counts = { activa: 0, inactiva: 0, transferida: 0, fallecida: 0 };
  model.females.forEach((r) => {
    if (f.sala && String(r.sala) !== f.sala) return;
    if (f.tanque && String(r.tanque) !== f.tanque) return;
    counts[classifyFemale(r, model, ref)]++;
  });
  return counts;
}

/* ── Mortalidad por sala y por tanque (eventos de bitácora, snapshot) ── */
export function mortalityBreakdown(model, f) {
  const bySala = new Map(), byTanque = new Map();
  mortsIn(model, f).forEach((e) => {
    bySala.set(dash(e.sala), (bySala.get(dash(e.sala)) || 0) + 1);
    byTanque.set(locKey(e.sala, e.tanque), (byTanque.get(locKey(e.sala, e.tanque)) || 0) + 1);
  });
  const toArr = (m) => [...m.entries()].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n);
  return { total: mortsIn(model, f).length, porSala: toArr(bySala), porTanque: toArr(byTanque) };
}

/* ── Tendencias temporales (granularidad adaptativa) ── */
/** ¿Está viva la hembra durante [start,end]? (ingreso ≤ end y sin muerte previa a start). */
function aliveDuring(rec, start, end) {
  if (rec._ingreso && rec._ingreso > end) return false;        // aún no ingresaba
  if (rec._muerte && rec._muerte < start) return false;        // ya había muerto
  if (!rec._muerte && rec.estado === ESTADO_MUERTO) return true; // muerta sin fecha → cuenta como presente
  return true;
}
/**
 * Series temporales de desoves, mortalidad y fertilidad%.
 * granularity 'month' (buckets = meses continuos) o 'day' (días del mes activo).
 */
export function trends(model, f, granularity = 'month') {
  const des = desovesIn(model, f), mor = mortsIn(model, f);
  const evs = des.concat(mor);
  if (!evs.length) return { buckets: [], labels: [], desoves: [], mortalidad: [], fertilidad: [] };
  let minD = evs[0].date, maxD = evs[0].date;
  evs.forEach((e) => { if (e.date < minD) minD = e.date; if (e.date > maxD) maxD = e.date; });
  const buckets = [];
  if (granularity === 'day') {
    const d = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate());
    const end = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate());
    while (d <= end) {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const stop = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      buckets.push({ key: dayKey(d), label: String(d.getDate()), start, stop });
      d.setDate(d.getDate() + 1);
    }
  } else {
    const d = new Date(minD.getFullYear(), minD.getMonth(), 1);
    const end = new Date(maxD.getFullYear(), maxD.getMonth(), 1);
    while (d <= end) {
      const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
      const stop = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      buckets.push({ key: yearMonthKey(start), label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, start, stop });
      d.setMonth(d.getMonth() + 1);
    }
  }
  // Población filtrada por ubicación actual (para "vivas durante el bucket").
  const pop = model.females.filter((r) => (!f.sala || String(r.sala) === f.sala) && (!f.tanque || String(r.tanque) === f.tanque));
  const desoves = [], mortalidad = [], fertilidad = [];
  buckets.forEach((b) => {
    const dCount = des.filter((e) => e.date >= b.start && e.date <= b.stop).length;
    const mCount = mor.filter((e) => e.date >= b.start && e.date <= b.stop).length;
    const spawners = new Set(des.filter((e) => e.date >= b.start && e.date <= b.stop).map((e) => e.trovan)).size;
    const alive = pop.filter((r) => aliveDuring(r, b.start, b.stop)).length;
    desoves.push(dCount); mortalidad.push(mCount);
    fertilidad.push(alive ? +((spawners / alive) * 100).toFixed(1) : 0);
  });
  return { buckets, labels: buckets.map((b) => b.label), desoves, mortalidad, fertilidad };
}

/* ── Utilidades de dominio para la UI (listas de salas/tanques presentes) ── */
export function salasOf(model) {
  const set = new Set();
  model.females.forEach((r) => { if (r.sala) set.add(String(r.sala)); });
  model.desoves.concat(model.mortalidades).forEach((e) => { if (e.sala) set.add(String(e.sala)); });
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}
export function tanquesOf(model, sala) {
  const set = new Set();
  const okF = (v) => (!sala || String(v.sala) === sala);
  model.females.forEach((r) => { if (r.tanque && okF(r)) set.add(String(r.tanque)); });
  model.desoves.concat(model.mortalidades).forEach((e) => { if (e.tanque && okF(e)) set.add(String(e.tanque)); });
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}
