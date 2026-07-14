/* ============================================================
   ALGAS · Laboratorio de microalgas (hoja Lab_Algas)
   TANDA 1: capa de datos + barra de mes + barra de filtros (cascada)
   + KPIs + tabla de validación. Los gráficos por categoría de sistema
   y la sección de análisis llegan en las siguientes tandas.

   Datos (19 columnas A–S de Lab_Algas): Fecha · Corrida_Larv · Modulo_Larv ·
   Área_Algas · Sistema · Lote · Dia_Proceso · Cel_ml · Protozoarios · Especie ·
   Salinidad_ppt · pH · Temperatura_C · Intensidad_Luz_% · Descartado ·
   Observaciones · Ciliados · Filamentosos · Técnico.
   ============================================================ */
import { store } from '../../core/store.js';
import { destroyAllCharts, destroyChart } from '../../core/charts.js';
import { getField, parseNum, normalizeTecnico } from '../../core/fields.js';
import { parseAnyDate, fmtShort } from '../../core/dates.js';
import { esc } from '../../core/format.js';
import { avg, natCmp } from '../../core/util.js';
import { monthIndexOfCorrida, monthLabelAt } from '../../core/prodCalendar.js';
import { registerModalEscape } from '../../ui/modalEscape.js';
import { toast } from '../../ui/toast.js';
import { drawGrowth, drawGrowthBar, drawGrowthMini, drawTasa, drawProto, drawDaily, drawUsoSistema, drawModuloBiomasa, drawCatPct, drawCellQuality, drawDispatchBars, CAT_COLOR, algColor, fmtK } from './charts.js';

// ── Acceso tolerante a las cabeceras de Lab_Algas ──
const AF = {
  fecha:        ['Fecha', 'fecha'],
  corrida:      ['Corrida_Larv', 'Corrida_larv', 'corrida_larv', 'Corrida', 'corrida'],
  modulo:       ['Modulo_Larv', 'Módulo_Larv', 'modulo_larv', 'Modulo', 'Módulo'],
  area:         ['Área_Algas', 'Area_Algas', 'área_algas', 'area_algas', 'Área', 'Area'],
  sistema:      ['Sistema', 'sistema'],
  lote:         ['Lote', 'lote'],
  dia:          ['Dia_Proceso', 'Día_Proceso', 'dia_proceso', 'Dia proceso', 'Día de proceso'],
  cel:          ['Cel_ml', 'Cel/ml', 'cel_ml', 'Cel_mL', 'Cel/mL'],
  protozoarios: ['Protozoarios', 'protozoarios'],
  especie:      ['Especie', 'especie'],
  salinidad:    ['Salinidad_ppt', 'Salinidad', 'salinidad_ppt', 'salinidad'],
  ph:           ['pH', 'PH', 'ph', 'Ph'],
  temp:         ['Temperatura_C', 'Temperatura', 'temperatura_c', 'Temp'],
  luz:          ['Intensidad_Luz_%', 'Intensidad_Luz', 'intensidad_luz_%', 'Intensidad de Luz'],
  descartado:   ['Descartado', 'descartado'],
  obs:          ['Observaciones', 'observaciones', 'Observación', 'observación'],
  ciliados:     ['Ciliados', 'ciliados'],
  filamentosos: ['Filamentosos', 'filamentosos'],
  tecnico:      ['Técnico', 'Tecnico', 'técnico', 'tecnico'],
  cel_vacias:     ['Células Vacías', 'Celulas Vacías', 'Células Vacias', 'Celulas Vacias', 'cel_vacias'],
  cel_semillenas: ['Células Semillenas', 'Celulas Semillenas', 'cel_semillenas'],
  cel_alargadas:  ['Células Alargadas', 'Celulas Alargadas', 'cel_alargadas'],
  cel_llenas:     ['Células en División', 'Celulas en Division', 'Células Llenas', 'Celulas Llenas', 'cel_llenas'],
  vol_despacho:   ['Volumen de Despacho', 'Volumen Despacho', 'vol_despacho'],
};

const isAlgaeRow = (r) => r && r._SheetOrigin === 'Lab_Algas';
const g = (r, key) => getField(r, AF[key]);
const num = (r, key) => parseNum(r, AF[key]);

// Filas de Lab_Algas memoizadas por identidad de store.globalData (se recalculan
// solo cuando entran datos nuevos). Evita re-filtrar en cada uso/modal.
let _algaeCache = { src: null, rows: [] };
function algaeRows() {
  if (_algaeCache.src !== store.globalData) _algaeCache = { src: store.globalData, rows: store.globalData.filter(isAlgaeRow) };
  return _algaeCache.rows;
}

// ── Categoría de sistema de cultivo (mapeo confirmado con el laboratorio) ──
// PBR · PM*→Premasivos · FM/FP→Fundas · C#→Carboys · M#→Masivos · resto→Otros.
// 'Otros' garantiza que un sistema no contemplado sea visible (subvista + análisis)
// en lugar de desaparecer silenciosamente.
export const SYS_CATS = ['Masivos', 'Premasivos', 'Fundas', 'Carboys', 'PBR', 'Otros'];
export function sysCat(sistema) {
  const s = String(sistema || '').trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('PBR')) return 'PBR';
  if (s.startsWith('PM')) return 'Premasivos';
  if (s === 'FM' || s === 'FP' || /^F/.test(s)) return 'Fundas';
  if (/^C\d/.test(s)) return 'Carboys';
  if (/^M\d/.test(s)) return 'Masivos';
  return 'Otros';
}

// Nombre completo de especie (abreviaturas del laboratorio).
const ESPECIE = { TW: 'Thalassiosira weissflogii', IS: 'Isochrysis', TT: 'Tetraselmis', CH: 'Chaetoceros' };
const especieLabel = (e) => { const k = String(e || '').trim().toUpperCase(); return ESPECIE[k] ? `${e} · ${ESPECIE[k]}` : (e || '—'); };

const isDescartado = (r) => /^s[ií]$/i.test(String(g(r, 'descartado')).trim());
const dCell = (r) => { const d = parseAnyDate(g(r, 'fecha')); return d ? fmtShort(d) : esc(g(r, 'fecha') || '—'); };
const cellTxt = (v) => (v === '' || v === null || v === undefined) ? '<span class="muted">—</span>' : esc(v);

// Estado persistente entre re-render. `sub` = subvista de sistema (pestaña activa);
// `sysSel` = sistema concreto dentro de la subvista (filtra stats + gráficos).
const vState = { month: null, corrida: null, modulo: null, especie: null, area: null, sub: null, sysSel: null, growthView: 'lines' };
// Modos del gráfico de Curva de Crecimiento (conmutador junto al ⛶).
const GROWTH_MODES = [['lines', 'Líneas'], ['norm', 'Normalizado'], ['smult', 'Mini-curvas'], ['heatmap', 'Heatmap']];

// ── Índices del mes (editables) ──
// Rangos óptimos fisicoquímicos para la "estabilidad fisicoquímica" (% en rango).
const ALG_OPT_RANGES = { salinidad: [25, 35], ph: [7.5, 8.5], temp: [24, 28] };
// Umbrales del índice de contaminación combinado (Protoz.+Ciliados+Filamentosos por registro):
// < bajo = Bajo · entre bajo y alto = Medio · > alto = Alto.
const ALG_CONTAM_LEVELS = { bajo: 6, alto: 15 };

// Cierres de dibujo por gráfico (reutilizados para el render inline y el fullscreen
// estilo Supervisor). Se reasignan en cada algasView con los datos vigentes.
let fsDraw = {};
// Stats (actual/prom/mín/máx) por gráfico para el strip del fullscreen.
let fsStats = {};
// Índice del día activo en el modal "Resumen del día" (sobre TODO el histórico).
let daySumIdx = null;
const FS_TITLE = {
  growth: '📈 Curva de Crecimiento — Densidad Celular',
  tasa: '📈 Tasa de Crecimiento específica · μ (día⁻¹)',
  proto: '🦠 Protozoarios · Ciliados · Filamentosos',
  sal: '🧂 Salinidad',
  ph: '⚗️ pH',
  temp: '🌡️ Temperatura',
  luz: '💡 Intensidad de luz',
  cellq: '🔬 Calidad celular · composición por día',
  dispatch: '🚚 Volumen de Despacho por módulo',
};
const BITA_VISIBLE = 6; // observaciones visibles antes de desplegar
const REG_VISIBLE = 10; // registros visibles antes de desplegar

/* ============================================================
   Construcción de series para los gráficos
   ============================================================ */

/** Serie diaria (promedio por fecha) de una variable. */
function dailySeries(rows, key) {
  const byDay = new Map();
  rows.forEach((r) => { const f = g(r, 'fecha'); const v = num(r, key); if (!f || v === null) return; if (!byDay.has(f)) byDay.set(f, []); byDay.get(f).push(v); });
  const days = [...byDay.keys()].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  return { days, values: days.map((d) => { const a = byDay.get(d); return a.reduce((x, y) => x + y, 0) / a.length; }) };
}

/** Varias variables en el MISMO eje de días (promedio por fecha; null si falta). */
function dailyMulti(rows, keys) {
  const dayset = new Set(); const per = {}; keys.forEach((k) => (per[k] = new Map()));
  rows.forEach((r) => { const f = g(r, 'fecha'); if (!f) return; keys.forEach((k) => { const v = num(r, k); if (v !== null) { dayset.add(f); if (!per[k].has(f)) per[k].set(f, []); per[k].get(f).push(v); } }); });
  const days = [...dayset].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const series = {};
  keys.forEach((k) => { series[k] = days.map((d) => { const a = per[k].get(d); return a ? a.reduce((x, y) => x + y, 0) / a.length : null; }); });
  return { days, series };
}

/** Separa los puntos de un mismo sistema/lote en SIEMBRAS (ciclos de cultivo).
 *  Un sistema (p. ej. un masivo) puede recultivarse dentro de la misma corrida: al
 *  resembrar, el Día de proceso vuelve a empezar. Cada reinicio abre un ciclo nuevo
 *  para NO promediar entre siembras distintas (se verían como una sola curva falsa).
 *  Señal primaria: `Dia_Proceso` que decrece (…6,7 → 1). Respaldo sin Dia_Proceso:
 *  un salto de fecha grande (> UMBRAL días) también abre ciclo. Devuelve [[pts],…]. */
const RESEED_GAP_DAYS = 14;
function splitSiembras(pts) {
  // Orden cronológico estable; con Dia_Proceso como desempate del mismo día.
  const sorted = [...pts].sort((a, b) => {
    const ta = a.d ? a.d.getTime() : 0, tb = b.d ? b.d.getTime() : 0;
    return ta - tb || ((a.dia ?? 0) - (b.dia ?? 0));
  });
  const cycles = [];
  let cur = [];
  let prevDia = null, prevMs = null;
  sorted.forEach((p) => {
    const dia = (p.dia === null || p.dia === undefined || isNaN(p.dia)) ? null : p.dia;
    const ms = p.d ? p.d.getTime() : null;
    let reseed = false;
    if (cur.length) {
      if (dia !== null && prevDia !== null && dia < prevDia) reseed = true; // reinicio de día de proceso
      else if (dia === null && prevDia === null && ms !== null && prevMs !== null
        && (ms - prevMs) / 86400000 > RESEED_GAP_DAYS) reseed = true; // sin día → salto de fecha
    }
    if (reseed) { cycles.push(cur); cur = []; }
    cur.push(p);
    if (dia !== null) prevDia = dia;
    if (ms !== null) prevMs = ms;
  });
  if (cur.length) cycles.push(cur);
  return cycles;
}

/** Etiqueta de DISPLAY compacta para las series de crecimiento. La AGRUPACIÓN ya está
 *  hecha por la clave completa (`l.key`); esto es PURAMENTE VISUAL y NO mezcla registros:
 *  solo omite del texto los componentes que NO distinguen ninguna serie del conjunto.
 *  El sistema se muestra siempre (ancla, nunca etiqueta vacía). Un componente se muestra
 *  si varía en el conjunto — y cuento el vacío como valor, de modo que si unas series
 *  traen Área/Especie y otras no, ese componente SÍ se muestra (distingue). Por
 *  construcción, dos series que difieran en cualquier componente muestran ese componente
 *  → etiquetas únicas. Aun así, red de seguridad: cualquier colisión revierte a `l.key`. */
function assignDisplayLabels(lotes) {
  const varies = (sel) => new Set(lotes.map((l) => sel(l.comps) || '')).size > 1;
  const showArea = varies((c) => c.area), showEsp = varies((c) => c.esp), showLote = varies((c) => c.lote);
  lotes.forEach((l) => {
    const c = l.comps;
    const parts = [];
    if (c.area && showArea) parts.push(c.area);
    parts.push(c.sis);
    if (c.esp && showEsp) parts.push(c.esp);
    if (c.lote && showLote) parts.push(`L${c.lote}`);
    l.label = parts.filter(Boolean).join(' · ') + (l.siembra ? ` · S${l.siembra}` : '');
  });
  const count = new Map();
  lotes.forEach((l) => count.set(l.label, (count.get(l.label) || 0) + 1));
  lotes.forEach((l) => { if (count.get(l.label) > 1) l.label = l.key; }); // colisión → clave única
}

/** Lotes con sus puntos (día de proceso → Cel/ml). Día = Dia_Proceso si existe,
 *  si no se deriva de la fecha relativa al primer día del lote.
 *  Clave de agrupación (`l.key`, identidad ÚNICA) = Área · Sistema · Especie · Lote: el
 *  mismo nombre de sistema en áreas/especies/lotes distintos NO se fusiona. El LOTE solo
 *  entra en la clave donde es real (Fundas: FP/FM); en el resto (Masivos/Premasivos/
 *  Carboys/PBR) la unidad es el sistema y el Lote podría traer ruido → se ignora. La
 *  etiqueta MOSTRADA (`l.label`) es una versión compacta, ver assignDisplayLabels.
 *  Cada resiembra de esa misma unidad es una serie aparte (sufijo · S2, S3…). */
export function growthByLote(rows) {
  const byLote = new Map();
  const compsByKey = new Map(); // clave → { area, sis, esp, lote }
  rows.forEach((r) => {
    const cel = num(r, 'cel'); if (cel === null) return;
    const area = String(g(r, 'area') || '').trim();
    const sis = String(g(r, 'sistema') || '').trim() || '?';
    const esp = String(g(r, 'especie') || '').trim();
    const loteRaw = String(g(r, 'lote') || '').trim();
    const lote = (sysCat(sis) === 'Fundas') ? loteRaw : ''; // Lote solo distingue en Fundas
    const key = [area, sis, esp, lote ? `L${lote}` : ''].filter(Boolean).join(' · ');
    if (!byLote.has(key)) { byLote.set(key, []); compsByKey.set(key, { area, sis, esp, lote }); }
    byLote.get(key).push({ dia: num(r, 'dia'), d: parseAnyDate(g(r, 'fecha')), cel });
  });
  const lotes = [];
  byLote.forEach((pts, key) => {
    // Divide en siembras: cada ciclo se numera solo si hay ≥2 (para no cambiar la
    // etiqueta del caso normal de una sola siembra).
    const siembras = splitSiembras(pts);
    siembras.forEach((cyclePts, ci) => {
      const times = cyclePts.map((p) => (p.d ? p.d.getTime() : null)).filter((x) => x !== null);
      const minMs = times.length ? Math.min(...times) : null;
      const byDay = new Map();
      cyclePts.forEach((p) => {
        let day = p.dia;
        if (day === null || day === undefined || isNaN(day)) day = (p.d && minMs !== null) ? Math.round((p.d.getTime() - minMs) / 86400000) : 0;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(p.cel);
      });
      const points = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, arr]) => ({ day, cel: arr.reduce((x, y) => x + y, 0) / arr.length }));
      const siembra = siembras.length > 1 ? ci + 1 : null;
      lotes.push({ key: siembra ? `${key} · S${ci + 1}` : key, comps: compsByKey.get(key), siembra, points });
    });
  });
  assignDisplayLabels(lotes); // etiqueta corta (solo visual; la agrupación ya está hecha)
  lotes.sort((a, b) => natCmp(a.key, b.key));
  // Sin tope: se grafican TODOS los lotes/sistemas del filtro. En modo Líneas la
  // leyenda en chips permite ocultar/mostrar series; los modos Mini-curvas y Heatmap
  // escalan de forma natural a muchas series (antes se recortaba a 14 y se ocultaban).
  return lotes;
}

/** Datos de la curva de crecimiento (eje día + serie por lote). */
function growthChartData(lotes) {
  const dayset = new Set(); lotes.forEach((l) => l.points.forEach((p) => dayset.add(p.day)));
  const days = [...dayset].sort((a, b) => a - b);
  const series = lotes.map((l) => { const m = new Map(l.points.map((p) => [p.day, p.cel])); return { label: l.label || l.key, data: days.map((d) => (m.has(d) ? m.get(d) : null)) }; });
  return { days, dayLabels: days.map((d) => 'Día ' + d), series };
}

/** Estadísticas del período (de la subvista activa). */
export function periodStats(rows) {
  const cel = rows.map((r) => num(r, 'cel')).filter((v) => v !== null);
  const proto = rows.map((r) => num(r, 'protozoarios')).filter((v) => v !== null);
  const sal = rows.map((r) => num(r, 'salinidad')).filter((v) => v !== null);
  const ph = rows.map((r) => num(r, 'ph')).filter((v) => v !== null);
  const t = rows.map((r) => parseAnyDate(g(r, 'fecha'))).filter(Boolean).map((d) => d.getTime());
  return {
    n: rows.length,
    lotes: new Set(rows.map((r) => g(r, 'lote')).filter(Boolean)).size,
    sistemas: new Set(rows.map((r) => g(r, 'sistema')).filter(Boolean)).size,
    densMin: cel.length ? Math.min(...cel) : null, densAvg: avg(cel), densMax: cel.length ? Math.max(...cel) : null,
    protoAvg: avg(proto), protoAlert: proto.filter((v) => v >= 5).length,
    salAvg: avg(sal), phAvg: avg(ph),
    from: t.length ? new Date(Math.min(...t)) : null, to: t.length ? new Date(Math.max(...t)) : null,
  };
}

/** Composición celular (calidad) por día: suma de Vacías/Semillenas/Alargadas/Llenas por
 *  FECHA (asc). Devuelve {days:[Date], series:{vacias,semillenas,alargadas,llenas}, pctLlenas, n}.
 *  Solo cuenta filas con al menos uno de los 4 conteos. */
export function cellCompositionByDay(rows) {
  const byDay = new Map();
  let sumLlenas = 0, sumTot = 0;
  (rows || []).forEach((r) => {
    const d = parseAnyDate(g(r, 'fecha')); if (!d) return;
    const v = num(r, 'cel_vacias'), s = num(r, 'cel_semillenas'), a = num(r, 'cel_alargadas'), l = num(r, 'cel_llenas');
    if (v === null && s === null && a === null && l === null) return;
    const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (!byDay.has(key)) byDay.set(key, { d, vacias: 0, semillenas: 0, alargadas: 0, llenas: 0 });
    const o = byDay.get(key);
    o.vacias += v || 0; o.semillenas += s || 0; o.alargadas += a || 0; o.llenas += l || 0;
    sumLlenas += l || 0; sumTot += (v || 0) + (s || 0) + (a || 0) + (l || 0);
  });
  const entries = [...byDay.values()].sort((x, y) => x.d - y.d);
  return {
    days: entries.map((e) => e.d),
    series: {
      vacias: entries.map((e) => e.vacias),
      semillenas: entries.map((e) => e.semillenas),
      alargadas: entries.map((e) => e.alargadas),
      llenas: entries.map((e) => e.llenas),
    },
    pctLlenas: sumTot > 0 ? Math.round(sumLlenas / sumTot * 100) : null,
    n: entries.length,
  };
}

/** Litros despachados por módulo: Σ Volumen de Despacho agrupado por Modulo_Larv (orden
 *  natural) + total del período. Solo filas con volumen numérico. */
export function dispatchByModule(rows) {
  const byMod = new Map();
  let total = 0;
  (rows || []).forEach((r) => {
    const v = num(r, 'vol_despacho'); if (v === null) return;
    const m = String(g(r, 'modulo') || '').trim() || '—';
    byMod.set(m, (byMod.get(m) || 0) + v);
    total += v;
  });
  const items = [...byMod.entries()].map(([modulo, litros]) => ({ modulo, litros })).sort((a, b) => natCmp(a.modulo, b.modulo));
  return { items, total, n: items.length };
}

/** Tasa de crecimiento ESPECÍFICA por lote (μ, día⁻¹): μ = ln(Nf/N0)/días.
 *  Es el estándar en microalgas y sí considera el tiempo transcurrido (a diferencia
 *  del "% ganado" total, que para un cultivo largo da cifras enormes y poco útiles
 *  como 1016%). `meta` lleva, por barra, duplicaciones/día, tiempo de duplicación y
 *  el % total (para el tooltip). Una barra por lote/siembra. */
export function tasaChartData(lotes) {
  const out = [];
  lotes.forEach((l) => {
    if (l.points.length < 2) return; // necesita inicial y final
    const first = l.points[0], last = l.points[l.points.length - 1];
    const n0 = first.cel, nf = last.cel;
    const days = last.day - first.day;
    if (!(n0 > 0) || !(nf > 0) || !(days > 0)) return; // sin base válida o sin tiempo → no computable
    const mu = Math.log(nf / n0) / days;              // día⁻¹ (puede ser negativa)
    const dbl = mu / Math.LN2;                         // duplicaciones/día
    const tDouble = mu !== 0 ? Math.LN2 / mu : null;   // días para duplicar (null si μ=0)
    const pctTotal = (nf - n0) / n0 * 100;             // % total (referencia)
    out.push({ label: l.label || l.key, val: +mu.toFixed(3), mu, dbl, tDouble, pctTotal, days, n0, nf });
  });
  return { labels: out.map((o) => o.label), values: out.map((o) => o.val), meta: out };
}

/* ============================================================
   VISTA
   ============================================================ */
export function algasView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }
  destroyAllCharts();
  // Se re-renderiza por filtros/mes sin pasar por el router → limpiar overlays huérfanos.
  document.body.classList.remove('modal-open');

  const all = algaeRows();
  if (!all.length) {
    root.innerHTML = headHTML(0)
      + `<div class="empty-state">No se encontraron registros en la hoja <b>Lab_Algas</b> del Google Sheet.</div>`;
    bind(root);
    return;
  }

  // ── Barra de mes (corrida→mes, alineada con Supervisor/Larvicultura) ──
  const allCorridas = [...new Set(all.map((r) => g(r, 'corrida')).filter(Boolean))];
  const months = [...new Set(allCorridas.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (vState.month == null || !months.includes(vState.month)) vState.month = months.length ? months[months.length - 1] : 0;
  const monthCorridas = allCorridas.filter((c) => monthIndexOfCorrida(+c) === vState.month).sort((a, b) => (+a) - (+b));
  const monthSet = new Set(monthCorridas);
  const inMonth = (r) => !monthSet.size || monthSet.has(g(r, 'corrida'));

  // ── Filtros: Corrida + Módulo + Especie + Área (el SISTEMA es una subvista, no un filtro) ──
  const corridas = monthCorridas;
  if (vState.corrida && !corridas.includes(vState.corrida)) vState.corrida = null;
  const modulos = [...new Set(all.filter(inMonth).map((r) => g(r, 'modulo')).filter(Boolean))].sort(natCmp);
  if (vState.modulo && !modulos.includes(vState.modulo)) vState.modulo = null;
  const especies = [...new Set(all.filter(inMonth).map((r) => g(r, 'especie')).filter(Boolean))].sort();
  if (vState.especie && !especies.includes(vState.especie)) vState.especie = null;
  const areas = [...new Set(all.filter(inMonth).map((r) => g(r, 'area')).filter(Boolean))].sort(natCmp);
  if (vState.area && !areas.includes(vState.area)) vState.area = null;

  const baseRows = all.filter((r) => inMonth(r)
    && (!vState.corrida || g(r, 'corrida') === vState.corrida)
    && (!vState.modulo || g(r, 'modulo') === vState.modulo)
    && (!vState.especie || g(r, 'especie') === vState.especie)
    && (!vState.area || g(r, 'area') === vState.area));

  // ── Subvistas por sistema (pestañas; no es un filtro) ──
  const subsPresent = SYS_CATS.filter((c) => baseRows.some((r) => sysCat(g(r, 'sistema')) === c));
  if (!vState.sub || !subsPresent.includes(vState.sub)) { vState.sub = subsPresent[0] || null; vState.sysSel = null; }
  const rows = baseRows.filter((r) => sysCat(g(r, 'sistema')) === vState.sub);

  // ── Sistema concreto dentro de la subvista (selector junto a Estadísticas).
  //    Afina stats + los gráficos analíticos; los KPIs siguen a nivel de categoría.
  const sysOptions = [...new Set(rows.map((r) => g(r, 'sistema')).filter(Boolean))].sort(natCmp);
  if (vState.sysSel && !sysOptions.includes(vState.sysSel)) vState.sysSel = null;
  const chartRows = vState.sysSel ? rows.filter((r) => g(r, 'sistema') === vState.sysSel) : rows;

  // ── HTML ──
  let h = headHTML(baseRows.length);

  h += `<div class="alg-filters">
      <div class="alg-monthbar">
        <button class="alg-month-nav" data-month-nav="-1" ${months.indexOf(vState.month) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
        <span class="alg-month-lbl">📅 ${esc(monthLabelAt(vState.month))}</span>
        <button class="alg-month-nav" data-month-nav="1" ${months.indexOf(vState.month) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
      </div>
      ${algSelect('corrida', vState.corrida, corridas, 'Todas las corridas')}
      ${algSelect('modulo', vState.modulo, modulos, 'Todos los módulos')}
      ${algSelect('especie', vState.especie, especies, 'Todas las especies')}
      ${algSelect('area', vState.area, areas, 'Todas las áreas')}
      <button class="alg-daybtn" data-alg-daysum title="Resumen diario de lo registrado en el Google Sheet">📅 Resumen del día</button>
      <button class="alg-daybtn" data-alg-indices title="Índices del mes: contaminación, estabilidad fisicoquímica y rendimiento por técnico">📊 Índices</button>
    </div>`;

  // Subnav: una pestaña por sistema (Masivos/Premasivos/PBR/Fundas/Carboys).
  h += `<div class="alg-subnav" role="tablist">${subsPresent.length
    ? subsPresent.map((c) => `<button class="alg-pill ${c === vState.sub ? 'is-active' : ''}" data-alg-sub="${esc(c)}" style="--cat:${CAT_COLOR[c]}">${esc(c)}</button>`).join('')
    : '<span class="muted">Sin sistemas con datos en el mes.</span>'}</div>`;

  // Solo las Fundas (FP/FM) manejan Lote; en el resto el KPI/columna Lote no aplica.
  const isFunda = vState.sub === 'Fundas';

  // ── KPIs de la subvista activa ──
  const densProm = avg(rows.map((r) => num(r, 'cel')).filter((v) => v !== null));
  const protoAlert = rows.map((r) => num(r, 'protozoarios')).filter((v) => v !== null).filter((v) => v >= 5).length;
  h += `<div class="alg-kpis">
      ${kpi('📋', 'Registros', String(rows.length))}
      ${kpi('🔬', 'Densidad prom.', densProm === null ? '—' : fmtK(densProm) + ' cel/ml')}
      ${kpi('🦠', 'Protozoarios ≥ 5', `${protoAlert}`, protoAlert > 0)}
      ${isFunda ? kpi('🧫', 'Lotes', String(new Set(rows.map((r) => g(r, 'lote')).filter(Boolean)).size)) : ''}
      ${kpi('⚙️', 'Sistemas', String(new Set(rows.map((r) => g(r, 'sistema')).filter(Boolean)).size))}
      ${kpi('🗑️', 'Descartados', String(rows.filter(isDescartado).length))}
    </div>`;

  // ── Datos + gráficos de la subvista (afinados por el sistema elegido) ──
  const isBarCat = vState.sub === 'Fundas' || vState.sub === 'Carboys'; // sin tendencia → barras
  const isPBR = vState.sub === 'PBR';
  const catColor = CAT_COLOR[vState.sub] || '#015B76';
  const growthLotes = growthByLote(chartRows);
  const gd = growthChartData(growthLotes);
  const tasa = tasaChartData(growthLotes);
  const barLabels = growthLotes.map((l) => l.label || l.key);
  const barValues = growthLotes.map((l) => Math.max(...l.points.map((p) => p.cel)));
  const proto = dailyMulti(chartRows, ['protozoarios', 'ciliados', 'filamentosos']);
  const sal = dailySeries(chartRows, 'salinidad');
  const ph = dailySeries(chartRows, 'ph');
  const temp = dailySeries(chartRows, 'temp');
  const luz = dailySeries(chartRows, 'luz');
  const stats = periodStats(chartRows);
  const cellQ = cellCompositionByDay(chartRows);
  const disp = dispatchByModule(chartRows);

  // Cierres de dibujo reutilizables (render inline + fullscreen estilo Supervisor).
  fsDraw = {
    growth: (hostId, legendId) => {
      const box = document.getElementById(hostId); if (!box) return;
      if (legendId) { const lg = document.getElementById(legendId); if (lg) lg.innerHTML = ''; }
      // Categorías sin tendencia (Fundas/Carboys) → barras, sin conmutador.
      if (isBarCat) { box.style.height = ''; box.innerHTML = `<canvas id="${hostId}_cv"></canvas>`; drawGrowthBar(`${hostId}_cv`, barLabels, barValues, catColor); return; }
      const mode = vState.growthView || 'lines';
      // Heatmap y mini-curvas son HTML/grid → la altura crece con el contenido; el
      // canvas (líneas/normalizado) usa la altura fija de la clase del host.
      box.style.height = (mode === 'heatmap' || mode === 'smult') ? 'auto' : '';
      if (mode === 'heatmap') { box.innerHTML = growthHeatmapHTML(growthLotes, gd.days); return; }
      if (mode === 'smult') { renderSmallMultiples(box, growthLotes); return; }
      box.innerHTML = `<canvas id="${hostId}_cv"></canvas>`;
      drawGrowth(`${hostId}_cv`, gd.dayLabels, gd.series, legendId, { norm: mode === 'norm' });
    },
    tasa: (cid) => drawTasa(cid, tasa.labels, tasa.values, tasa.meta),
    proto: (cid) => drawProto(cid, proto.days, proto.series.protozoarios, proto.series.ciliados, proto.series.filamentosos),
    sal: (cid) => drawDaily(cid, sal.days, sal.values, 'Salinidad', '#015B76'),
    ph: (cid) => drawDaily(cid, ph.days, ph.values, 'pH', '#739842'),
    temp: (cid) => drawDaily(cid, temp.days, temp.values, 'Temperatura', '#CA6378', ' °C'),
    luz: (cid) => drawDaily(cid, luz.days, luz.values, 'Intensidad de luz', '#A06B27', '%'),
    cellq: (cid) => drawCellQuality(cid, cellQ.days, cellQ.series),
    dispatch: (cid) => drawDispatchBars(cid, disp.items.map((x) => 'Mód ' + x.modulo), disp.items.map((x) => x.litros)),
  };

  // Stats del strip del fullscreen (mismos 4: Actual/Prom/Mín/Máx, sobre lo registrado).
  const last = (a) => (a.length ? a[a.length - 1] : null);
  const fK = (v) => fmtK(v);               // densidad cel/ml (abreviada)
  const f1 = (u) => (v) => v.toFixed(1) + u;
  const fMu = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : v.toFixed(2) + ' /d';
  const growthFlat = isBarCat ? barValues.slice() : gd.series.reduce((acc, s) => acc.concat(s.data), []);
  const growthActual = isBarCat
    ? last(barValues)
    : (() => { const li = gd.days.length - 1; const v = gd.series.map((s) => s.data[li]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; })();
  fsStats = {
    growth: statStrip(growthFlat, growthActual, fK),
    tasa: statStrip(tasa.values, last(tasa.values), fMu),
    sal: statStrip(sal.values, last(sal.values), f1(' ppt')),
    ph: statStrip(ph.values, last(ph.values), f1('')),
    temp: statStrip(temp.values, last(temp.values), f1(' °C')),
    luz: statStrip(luz.values, last(luz.values), f1('%')),
  };

  const host = (id, has) => has ? `<canvas id="${id}"></canvas>` : '<div class="empty-state" style="padding:24px">Sin datos para esta subvista.</div>';

  // El acento de los gráficos sigue el color de la categoría activa (--alg-cat).
  const catVar = `--alg-cat:${catColor}`;

  // ── Franja 1 · Desarrollo algal (curva + tasa + estadísticas) ──
  h += algBand('🌱', 'Desarrollo algal', '#186447');
  h += `<div class="alg-an-row" style="${catVar}">
      <div class="card alg-chart-card alg-fs-card">${chHead('📈 Curva de Crecimiento — Densidad Celular ' + (isBarCat ? `<span class="muted">· por ${isFunda ? 'lote' : 'sistema'} (sin tendencia → barras)</span>` : '<span class="muted">· por día · línea = lote/sistema</span>'), growthLotes.length > 0 ? 'growth' : null, isBarCat ? '' : growthModeSelect())}<div class="alg-chart-host alg-host-lg" id="algGrowthHost">${growthLotes.length ? '' : '<div class="empty-state" style="padding:24px">Sin datos para esta subvista.</div>'}</div><div class="alg-legend" id="algGrowthLegend"></div></div>
      <div class="card alg-chart-card">${chHead('📊 Estadísticas del Período <span class="muted">· ' + esc(vState.sub || '') + '</span>', null, algSysSelect(sysOptions, vState.sysSel))}<div class="alg-stats">${statsHTML(stats, isFunda)}</div></div>
    </div>
    ${!isBarCat ? `<div class="alg-charts" style="${catVar}"><div class="card alg-chart-card alg-fs-card">${chHead('📈 Tasa de Crecimiento específica <span class="muted">· μ = ln(final/inicial)/días · día⁻¹</span>', tasa.values.length > 0 ? 'tasa' : null)}<div class="alg-chart-host">${host('algTasa', tasa.values.length > 0)}</div></div></div>` : ''}`;

  // ── Franja · Calidad celular (composición morfológica 100% por día) ──
  h += algBand('🔬', 'Calidad celular', '#A06B27');
  h += `<div class="alg-charts" style="${catVar}">
      <div class="card alg-chart-card alg-fs-card">${chHead('🔬 Composición celular <span class="muted">· % por día · Vacías/Semillenas/Alargadas/En División</span>' + (cellQ.pctLlenas != null ? ` <span style="margin-left:8px;font-size:11px;font-weight:800;color:#186447;background:#18644722;padding:1px 8px;border-radius:999px">✅ ${cellQ.pctLlenas}% en división</span>` : ''), cellQ.days.length > 0 ? 'cellq' : null)}<div class="alg-chart-host alg-host-md">${host('algCellQ', cellQ.days.length > 0)}</div></div>
    </div>`;

  // ── Franja 2 · Parámetros fisicoquímicos (mini-gráficos compactos 4-up) ──
  h += algBand('🧪', 'Parámetros fisicoquímicos', '#015B76');
  h += `<div class="alg-charts alg-charts-mini" style="${catVar}">
      <div class="card alg-chart-card alg-fs-card">${chHead('🧂 Salinidad <span class="muted">· ppt</span>', sal.days.length > 0 ? 'sal' : null)}<div class="alg-chart-host alg-host-sm">${host('algSal', sal.days.length > 0)}</div></div>
      <div class="card alg-chart-card alg-fs-card">${chHead('⚗️ pH', ph.days.length > 0 ? 'ph' : null)}<div class="alg-chart-host alg-host-sm">${host('algPh', ph.days.length > 0)}</div></div>
      <div class="card alg-chart-card alg-fs-card">${chHead('🌡️ Temperatura <span class="muted">· °C</span>', temp.days.length > 0 ? 'temp' : null)}<div class="alg-chart-host alg-host-sm">${host('algTemp', temp.days.length > 0)}</div></div>
      ${isPBR ? `<div class="card alg-chart-card alg-fs-card">${chHead('💡 Intensidad de luz <span class="muted">· %</span>', luz.days.length > 0 ? 'luz' : null)}<div class="alg-chart-host alg-host-sm">${host('algLuz', luz.days.length > 0)}</div></div>` : ''}
    </div>`;

  // ── Franja 3 · Sanidad / Contaminación (gráfico medio + watchlist al lado) ──
  // Watchlist: sistemas de la categoría con protozoarios ≥5 o descartes (acción rápida).
  const sanMap = new Map();
  rows.forEach((r) => {
    const s = g(r, 'sistema'); if (!s) return;
    if (!sanMap.has(s)) sanMap.set(s, { proto: 0, protoMax: 0, desc: 0 });
    const o = sanMap.get(s);
    const p = num(r, 'protozoarios'); if (p !== null) { if (p >= 5) o.proto++; if (p > o.protoMax) o.protoMax = p; }
    if (isDescartado(r)) o.desc++;
  });
  const watch = [...sanMap.entries()].map(([s, o]) => ({ s, ...o }))
    .filter((x) => x.proto > 0 || x.desc > 0)
    .sort((a, b) => (b.proto - a.proto) || (b.protoMax - a.protoMax) || (b.desc - a.desc))
    .slice(0, 8);
  const plur = (n, sing, plu) => `${n} ${n === 1 ? sing : plu}`;
  const watchHTML = watch.length
    ? `<div class="alg-watch-list">${watch.map((x) => `<div class="alg-watch-item"><span class="alg-watch-sys">${esc(x.s)}</span><span class="alg-watch-badges">${x.proto ? `<span class="alg-watch-b is-proto" title="días con protozoarios ≥ 5">🦠 ${plur(x.proto, 'día', 'días')} con protozoarios ≥ 5${x.protoMax ? ` · máx ${x.protoMax.toFixed(0)}` : ''}</span>` : ''}${x.desc ? `<span class="alg-watch-b is-desc" title="cultivos descartados">🗑️ ${plur(x.desc, 'descartado', 'descartados')}</span>` : ''}</span></div>`).join('')}</div>`
    : '<div class="alg-watch-ok">✓ Sin alertas de sanidad en el período.</div>';

  h += algBand('🦠', 'Sanidad / Contaminación', '#CA6378');
  h += `<div class="alg-sanidad-row" style="${catVar}">
      <div class="card alg-chart-card alg-fs-card">${chHead('🦠 Protozoarios · Ciliados · Filamentosos <span class="muted">· obj &lt; 5</span>', proto.days.length > 0 ? 'proto' : null)}<div class="alg-chart-host alg-host-md">${host('algProto', proto.days.length > 0)}</div></div>
      <div class="card alg-chart-card alg-watch">${chHead('⚠️ Watchlist de sanidad <span class="muted">· sistemas a vigilar</span>', null)}${watchHTML}</div>
    </div>`;

  // ── Franja · Despacho de cultivo (litros entregados por módulo) ──
  h += algBand('🚚', 'Despacho de cultivo', '#4F8DA0');
  h += `<div class="alg-charts" style="${catVar}">
      <div class="card alg-chart-card alg-fs-card">${chHead('🚚 Volumen de Despacho por módulo <span class="muted">· litros entregados</span>' + (disp.total > 0 ? ` <span style="margin-left:8px;font-size:11px;font-weight:800;color:#015B76;background:#015B7622;padding:1px 8px;border-radius:999px">💧 ${Math.round(disp.total).toLocaleString('es-EC')} L en el período</span>` : ''), disp.items.length > 0 ? 'dispatch' : null)}<div class="alg-chart-host alg-host-md">${host('algDispatch', disp.items.length > 0)}</div></div>
    </div>`;

  // ── Análisis del mes (independiente del drill-down: responde preguntas del mes) ──
  const monthRows = all.filter(inMonth);
  // ¿Qué se hace más? AGRUPADO POR CATEGORÍA (Masivos, Premasivos, Carboys…),
  // no por sistema individual, para leer el peso de cada naturaleza.
  const catCount = new Map();
  monthRows.forEach((r) => { const c = sysCat(g(r, 'sistema')); if (c && SYS_CATS.includes(c)) catCount.set(c, (catCount.get(c) || 0) + 1); });
  const uso = [...catCount.entries()].sort((a, b) => b[1] - a[1]);
  const usoLabels = uso.map((e) => e[0]);
  const usoValues = uso.map((e) => e[1]);
  const usoColors = usoLabels.map((c) => CAT_COLOR[c] || '#90A4AE');

  // Matriz Corrida × Categoría: biomasa = Σ Cel/ml (Opción 1) + nº de registros (Opción 3).
  const catsPresent = SYS_CATS.filter((c) => monthRows.some((r) => sysCat(g(r, 'sistema')) === c));
  const cellM = {}, corTot = {}, catTot = {};
  monthRows.forEach((r) => {
    const cor = g(r, 'corrida'), cat = sysCat(g(r, 'sistema')), cel = num(r, 'cel');
    if (!cor || !catsPresent.includes(cat)) return;
    const k = cor + '|' + cat;
    cellM[k] = cellM[k] || { cel: 0, n: 0 };
    cellM[k].n++;
    if (cel !== null) { cellM[k].cel += cel; corTot[cor] = (corTot[cor] || 0) + cel; catTot[cat] = (catTot[cat] || 0) + cel; }
  });
  let grand = 0; Object.values(catTot).forEach((v) => (grand += v));
  // Cada celda: Σ cel/ml (negrita) + nº de registros ("· N reg") para no confundir
  // las dos cifras (antes salía "2K·37" sin contexto).
  const mxCell = (o) => o ? `<b>${fmtK(o.cel)}</b> <span class="alg-mx-n" title="registros">· ${o.n} reg</span>` : '<span class="muted">—</span>';
  const matrixTable = `<table class="alg-table alg-matrix">
      <thead><tr><th>Corrida</th>${catsPresent.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        ${monthCorridas.map((cor) => `<tr><td><b>C${esc(cor)}</b></td>${catsPresent.map((c) => `<td style="text-align:right">${mxCell(cellM[cor + '|' + c])}</td>`).join('')}<td style="text-align:right"><b>${fmtK(corTot[cor] || 0)}</b></td></tr>`).join('')}
        <tr class="alg-mx-total"><td><b>Total</b></td>${catsPresent.map((c) => `<td style="text-align:right"><b>${fmtK(catTot[c] || 0)}</b></td>`).join('')}<td style="text-align:right"><b>${fmtK(grand)}</b></td></tr>
      </tbody>
    </table>`;

  // Indicadores del mes (etiquetas clicables → modales): Biomasa total, Tasa de
  // descarte, Cobertura de registro. Δ vs el mes anterior CON DATOS.
  const ms = algMonthsList();
  const prevMonth = (() => { const i = ms.indexOf(vState.month); return i > 0 ? ms[i - 1] : null; })();
  const prevMonthRows = prevMonth != null ? algMonthRows(prevMonth) : [];
  const bioNow = totalCel(monthRows), bioPrev = totalCel(prevMonthRows);
  const bioD = bioPrev ? (bioNow - bioPrev) / bioPrev * 100 : null;
  const descNow = monthRows.length ? monthRows.filter(isDescartado).length / monthRows.length * 100 : 0;
  const descPrev = prevMonthRows.length ? prevMonthRows.filter(isDescartado).length / prevMonthRows.length * 100 : null;
  const descD = (descPrev !== null) ? descNow - descPrev : null; // puntos porcentuales
  // Días con registro DENTRO del mes calendario de referencia (mismo criterio que
  // el calendario del modal; evita colisión de días entre meses por corridas que
  // cruzan el cambio de mes).
  const covRef = monthRows.map((r) => parseAnyDate(g(r, 'fecha'))).find(Boolean);
  const covDays = covRef ? new Set(monthRows.map((r) => parseAnyDate(g(r, 'fecha'))).filter((d) => d && d.getMonth() === covRef.getMonth() && d.getFullYear() === covRef.getFullYear()).map((d) => d.getDate())).size : 0;
  const covTotal = monthDaysOf(monthRows);

  h += `<div class="alg-section-title">📊 Análisis del mes <span class="muted" style="font-weight:600;font-size:12px">· ${esc(monthLabelAt(vState.month))}</span></div>
    <div class="alg-mind-row">
      ${mindCard('bio', '🧪', 'Biomasa total del mes', fmtK(bioNow) + ' cel/ml', deltaArrow(bioD, '%'))}
      ${mindCard('desc', '🗑️', 'Tasa de descarte', descNow.toFixed(1) + '%', descD === null ? '' : deltaArrowPts(descD))}
      ${mindCard('cov', '📅', 'Cobertura de registro', `${covDays}${covTotal ? '/' + covTotal : ''} días`, '')}
    </div>
    <div class="alg-charts">
      <div class="card alg-chart-card"><div class="alg-chart-title">⚙️ ¿Qué categoría se hace más? <span class="muted">· nº de registros</span></div><div class="alg-chart-host" style="height:${Math.max(220, usoLabels.length * 34 + 40)}px">${usoLabels.length ? '<canvas id="algUso"></canvas>' : '<div class="empty-state" style="padding:24px">Sin datos del mes.</div>'}</div></div>
      <div class="card alg-chart-card"><div class="alg-chart-title">🧪 Biomasa por corrida × categoría <span class="muted">· cada celda: Σ cel/ml · n.º de registros</span></div><div class="alg-table-wrap" style="max-height:300px">${catsPresent.length ? matrixTable : '<div class="empty-state" style="padding:24px">Sin datos del mes.</div>'}</div></div>
    </div>`;

  // ── Bitácora de observaciones (plegable · recientes) ──
  const obsRows = rows.filter((r) => g(r, 'obs')).sort((a, b) => (parseAnyDate(g(b, 'fecha')) || 0) - (parseAnyDate(g(a, 'fecha')) || 0));
  // La columna Lote solo aplica a Fundas (FP/FM); fuera de ellas se omite.
  const obsHead = `<tr><th>Fecha</th><th>Sistema</th>${isFunda ? '<th>Lote</th>' : ''}<th>Día</th><th>Observación</th><th>Técnico</th></tr>`;
  const obsCells = obsRows.map((r) => `<td>${dCell(r)}</td><td><b>${cellTxt(g(r, 'sistema'))}</b></td>${isFunda ? `<td>${cellTxt(g(r, 'lote'))}</td>` : ''}<td>${cellTxt(g(r, 'dia'))}</td><td style="white-space:normal">${cellTxt(g(r, 'obs'))}</td><td>${cellTxt(g(r, 'tecnico'))}</td>`);
  h += collapsibleCard('📝', 'Bitácora de observaciones', obsHead, obsCells, BITA_VISIBLE, 'Sin observaciones para esta subvista.');

  // ── Registros (plegable · recientes) ──
  const sortedRows = [...rows].sort((a, b) => (parseAnyDate(g(b, 'fecha')) || 0) - (parseAnyDate(g(a, 'fecha')) || 0));
  const numCell = (v) => (v === null) ? '<span class="muted">—</span>' : esc(fmtK(v));
  const regCols = ['Fecha', 'Corrida', 'Sistema', 'Área', ...(isFunda ? ['Lote'] : []), 'Día', 'Cel/ml', 'Protoz.', 'Especie', 'Sal.', 'pH', 'Técnico'];
  const regHead = '<tr>' + regCols.map((x) => `<th>${x}</th>`).join('') + '</tr>';
  const regCells = sortedRows.map((r) => `<td>${dCell(r)}</td><td>${cellTxt(g(r, 'corrida'))}</td><td><b>${cellTxt(g(r, 'sistema'))}</b></td><td>${cellTxt(g(r, 'area'))}</td>${isFunda ? `<td>${cellTxt(g(r, 'lote'))}</td>` : ''}<td>${cellTxt(g(r, 'dia'))}</td><td style="text-align:right">${numCell(num(r, 'cel'))}</td><td style="text-align:center">${cellTxt(g(r, 'protozoarios'))}</td><td>${cellTxt(g(r, 'especie'))}</td><td style="text-align:right">${cellTxt(g(r, 'salinidad'))}</td><td style="text-align:right">${cellTxt(g(r, 'ph'))}</td><td>${cellTxt(g(r, 'tecnico'))}</td>`);
  const exportBtn = `<button class="alg-toggle alg-export-btn" data-alg-export title="Descargar Excel por rango de fechas">⬇️ Excel</button>`;
  h += collapsibleCard('📋', 'Registros · ' + (vState.sub || ''), regHead, regCells, REG_VISIBLE, 'Sin registros para esta subvista.', exportBtn);

  // Modal de ampliación (fullscreen) — reutiliza el patrón .sv-modal del Supervisor.
  h += algFsModalHTML();
  // Modal "Resumen del día" (digest diario del Google Sheet).
  h += algDayModalHTML();
  // Modales de los indicadores del mes (Biomasa, Tasa de descarte, Cobertura).
  h += monthModalShell('algBioModal', '🧪 Biomasa total del mes')
    + monthModalShell('algDescModal', '🗑️ Tasa de descarte')
    + monthModalShell('algCovModal', '📅 Cobertura de registro')
    + monthModalShell('algIndicesModal', '📊 Índices del mes');
  // Modal de descarga Excel (pide rango de fechas).
  h += algExportModalHTML();

  root.innerHTML = h;

  // Dibujo aislado: el fallo de un gráfico no rompe los demás.
  const draw = (fn) => { try { fn(); } catch (e) { console.error('[algas] chart', e); } };
  if (growthLotes.length) draw(() => fsDraw.growth('algGrowthHost', 'algGrowthLegend'));
  if (!isBarCat && tasa.values.length) draw(() => fsDraw.tasa('algTasa'));
  if (proto.days.length) draw(() => fsDraw.proto('algProto'));
  if (sal.days.length) draw(() => fsDraw.sal('algSal'));
  if (ph.days.length) draw(() => fsDraw.ph('algPh'));
  if (temp.days.length) draw(() => fsDraw.temp('algTemp'));
  if (isPBR && luz.days.length) draw(() => fsDraw.luz('algLuz'));
  if (cellQ.days.length) draw(() => fsDraw.cellq('algCellQ'));
  if (disp.items.length) draw(() => fsDraw.dispatch('algDispatch'));
  if (usoLabels.length) draw(() => drawUsoSistema('algUso', usoLabels, usoValues, usoColors));

  bind(root);
}

/* ============================================================
   HTML helpers
   ============================================================ */
function headHTML(n) {
  return `<div class="alg-head">
      <div>
        <div class="alg-title"><span class="alg-title-ic">🌿</span> Algas · Laboratorio de microalgas</div>
        <div class="alg-sub">Cultivos por corrida y sistema · ${n} registro(s)</div>
      </div>
    </div>`;
}

/** Franja divisoria de sección (acento superior, como los KPIs principales). */
function algBand(icon, label, color) {
  return `<div class="alg-band" style="border-top-color:${color}"><span class="alg-band-title">${icon} ${esc(label)}</span></div>`;
}

/** Cabecera de tarjeta de gráfico: título + (opcional) botón ⛶ de ampliación y/o
 *  un control extra a la derecha (p.ej. el selector de sistema). */
function chHead(titleHtml, fsKey, extraHtml = '') {
  const right = (extraHtml || '') + (fsKey ? `<button class="alg-fs-btn" data-alg-fs="${esc(fsKey)}" title="Ampliar gráfico" aria-label="Ampliar gráfico">⛶</button>` : '');
  return `<div class="alg-chart-head"><div class="alg-chart-title">${titleHtml}</div>${right ? `<div class="alg-chart-actions">${right}</div>` : ''}</div>`;
}

/** Selector de sistema concreto dentro de la subvista (junto a Estadísticas). */
function algSysSelect(options, value) {
  if (!options.length) return '';
  return `<select class="alg-select alg-select-sm" data-algfilter="sysSel" title="Filtrar por sistema">
      <option value="">Todos los sistemas</option>
      ${options.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
}

/** Conmutador del tipo de gráfico de la Curva de Crecimiento (junto al ⛶). */
function growthModeSelect() {
  return `<select class="alg-select alg-select-sm" data-algfilter="growthView" title="Tipo de gráfico de la curva">
      ${GROWTH_MODES.map(([v, l]) => `<option value="${v}" ${vState.growthView === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
    </select>`;
}

/** Heatmap día × lote/sistema: filas = cultivo, columnas = día, color = densidad (cel/ml). */
function growthHeatmapHTML(lotes, days) {
  if (!lotes.length || !days.length) return '<div class="empty-state" style="padding:24px">Sin datos para esta subvista.</div>';
  let mx = 0; lotes.forEach((l) => l.points.forEach((p) => { if (p.cel > mx) mx = p.cel; }));
  const bg = (v) => { if (v === null || v === undefined) return ''; const t = mx ? v / mx : 0; return `background:rgba(1,91,118,${(0.12 + 0.8 * t).toFixed(2)});color:${t > 0.5 ? '#fff' : '#0a3d44'}`; };
  const head = `<tr><th class="alg-gh-rowh">Lote / Sistema</th>${days.map((d) => `<th>Día ${d}</th>`).join('')}</tr>`;
  const body = lotes.map((l) => {
    const m = new Map(l.points.map((p) => [p.day, p.cel]));
    const cells = days.map((d) => { const v = m.has(d) ? m.get(d) : null; return `<td style="${bg(v)}" title="${v === null ? 'sin dato' : fmtK(v) + ' cel/ml'}">${v === null ? '·' : fmtK(v)}</td>`; }).join('');
    return `<tr><th class="alg-gh-rowh">${esc(l.label || l.key)}</th>${cells}</tr>`;
  }).join('');
  return `<div class="alg-gh-wrap"><table class="alg-gh-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="alg-gh-legend"><span>menor</span><span class="alg-gh-bar"></span><span>mayor densidad</span></div>`;
}

/** Small-multiples: una mini-curva por lote/sistema en una rejilla. */
function renderSmallMultiples(box, lotes) {
  if (!lotes.length) { box.innerHTML = '<div class="empty-state" style="padding:24px">Sin datos para esta subvista.</div>'; return; }
  box.innerHTML = `<div class="alg-smult">${lotes.map((l, i) => `<div class="alg-smult-cell"><div class="alg-smult-title" style="color:${algColor(i)}">${esc(l.label || l.key)}</div><div class="alg-smult-host"><canvas id="algSm_${box.id}_${i}"></canvas></div></div>`).join('')}</div>`;
  lotes.forEach((l, i) => { try { drawGrowthMini(`algSm_${box.id}_${i}`, l.points.map((p) => 'D' + p.day), l.points.map((p) => p.cel), algColor(i)); } catch (e) { console.error('[algas] smult', e); } });
}

/** HTML del modal de ampliación (un canvas grande reutilizado por todos los gráficos). */
function algFsModalHTML() {
  return `<div class="sv-modal" id="algFsModal" data-alg-fs-overlay>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head"><span class="sv-modal-title" id="algFsTitle">Gráfico</span><button class="sv-modal-x" data-alg-fs-close aria-label="Cerrar">✕</button></div>
      <div class="sv-modal-body"><div class="sv-modal-kpis" id="algFsMeta"></div><div class="lv-fs-chart" id="algFsChart"><canvas id="algFsCanvas"></canvas></div><div class="alg-legend" id="algFsLegend"></div></div>
    </div>
  </div>`;
}

/** Resumen Actual/Promedio/Mín/Máx para el strip del fullscreen (estilo Vista Tanque). */
function statStrip(arr, actual, fmt) {
  const a = arr.filter((v) => v !== null && v !== undefined && !isNaN(v));
  if (!a.length) return null;
  return { actual: (actual === null || actual === undefined || isNaN(actual)) ? null : actual, prom: a.reduce((x, y) => x + y, 0) / a.length, min: Math.min(...a), max: Math.max(...a), fmt };
}
function fsMetaHTML(s) {
  if (!s) return '';
  const cell = (v, lbl) => `<span class="sv-modal-kpi"><b>${v === null ? '—' : s.fmt(v)}</b>${lbl}</span>`;
  return cell(s.actual, 'actual') + cell(s.prom, 'prom.') + cell(s.min, 'mín.') + cell(s.max, 'máx.');
}

function openAlgFs(root, key) {
  const overlay = root.querySelector('#algFsModal');
  if (!overlay || !fsDraw[key]) return;
  const t = root.querySelector('#algFsTitle'); if (t) t.textContent = FS_TITLE[key] || 'Gráfico';
  const meta = root.querySelector('#algFsMeta'); if (meta) meta.innerHTML = fsMetaHTML(fsStats[key]); // Actual/Prom/Mín/Máx
  const leg = root.querySelector('#algFsLegend'); if (leg) leg.innerHTML = ''; // la leyenda-chip solo la rellena la curva
  const box = root.querySelector('#algFsChart');
  destroyFsCharts(root);
  overlay.classList.add('sv-open');
  document.body.classList.add('modal-open'); // pausa el auto-refresco mientras está abierto
  if (key === 'growth') {
    // El render de crecimiento gestiona su propio contenido (canvas / mini-curvas / heatmap).
    requestAnimationFrame(() => { try { fsDraw.growth('algFsChart', 'algFsLegend'); } catch (e) { console.error('[algas] fs', e); } });
  } else {
    if (box) box.innerHTML = '<canvas id="algFsCanvas"></canvas>';
    requestAnimationFrame(() => { try { fsDraw[key]('algFsCanvas'); } catch (e) { console.error('[algas] fs', e); } });
  }
}

/** Destruye los charts que pudo crear el fullscreen (canvas único o mini-curvas). */
function destroyFsCharts(root) {
  destroyChart('algFsCanvas');
  const box = root.querySelector('#algFsChart');
  if (box) box.querySelectorAll('canvas[id]').forEach((c) => destroyChart(c.id));
}

function closeAlgFs(root) {
  const overlay = root.querySelector('#algFsModal');
  if (overlay) overlay.classList.remove('sv-open');
  document.body.classList.remove('modal-open');
  destroyFsCharts(root);
}

/* ---- Resumen del día (modal) ---- */
/** Días con registro en TODO el histórico de Lab_Algas (asc por fecha). */
function algDayIndex() {
  const byDay = new Map();
  algaeRows().forEach((r) => {
    const d = parseAnyDate(g(r, 'fecha'));
    if (!d || isNaN(d)) return;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!byDay.has(key)) byDay.set(key, { key, dateMs: d.getTime(), label: fmtShort(d), rows: [] });
    byDay.get(key).rows.push(r);
  });
  return [...byDay.values()].sort((a, b) => a.dateMs - b.dateMs);
}

function algDayModalHTML() {
  return `<div class="sv-modal" id="algDayModal" data-alg-day-overlay>
    <div class="sv-modal-card alg-day-card">
      <div class="sv-modal-head"><span class="sv-modal-title">📅 Resumen diario</span><button class="sv-modal-x" data-alg-day-close aria-label="Cerrar">✕</button></div>
      <div class="alg-day-nav">
        <button class="alg-month-nav" data-alg-day-nav="-1" aria-label="Día anterior">◀</button>
        <span class="alg-day-label" id="algDayLabel">—</span>
        <button class="alg-month-nav" data-alg-day-nav="1" aria-label="Día siguiente">▶</button>
      </div>
      <div class="sv-modal-body" id="algDayBody"></div>
    </div>
  </div>`;
}

function openDaySum(root) {
  const overlay = root.querySelector('#algDayModal'); if (!overlay) return;
  const days = algDayIndex();
  if (daySumIdx === null || daySumIdx < 0 || daySumIdx >= days.length) daySumIdx = days.length - 1;
  renderDaySum(root, days);
  overlay.classList.add('sv-open');
  document.body.classList.add('modal-open'); // pausa el auto-refresco mientras está abierto
}

function stepDaySum(root, dir) {
  const days = algDayIndex();
  const ni = (daySumIdx == null ? days.length - 1 : daySumIdx) + dir;
  if (ni < 0 || ni >= days.length) return;
  daySumIdx = ni;
  renderDaySum(root, days);
}

function renderDaySum(root, days) {
  const lbl = root.querySelector('#algDayLabel'); const body = root.querySelector('#algDayBody');
  const prevBtn = root.querySelector('[data-alg-day-nav="-1"]'); const nextBtn = root.querySelector('[data-alg-day-nav="1"]');
  if (lbl) lbl.textContent = days.length && daySumIdx != null ? days[daySumIdx].label : '—';
  if (prevBtn) prevBtn.disabled = !(daySumIdx > 0);
  if (nextBtn) nextBtn.disabled = !(daySumIdx < days.length - 1);
  if (body) body.innerHTML = daySummaryBody(days, daySumIdx);
}

function closeDaySum(root) {
  const overlay = root.querySelector('#algDayModal'); if (overlay) overlay.classList.remove('sv-open');
  document.body.classList.remove('modal-open');
}

/** Cuerpo del resumen de un día: KPIs + por categoría + fisicoquímicos +
 *  especies/técnicos + observaciones, con comparativa vs el día anterior. */
function daySummaryBody(days, idx) {
  if (!days.length || idx == null) return '<div class="empty-state" style="padding:30px">Sin días con registro.</div>';
  const day = days[idx];
  const prev = idx > 0 ? days[idx - 1] : null;
  const R = day.rows;

  const cels = R.map((r) => num(r, 'cel')).filter((v) => v !== null);
  const densAvg = avg(cels);
  const protoAlert = R.map((r) => num(r, 'protozoarios')).filter((v) => v !== null).filter((v) => v >= 5).length;
  const descart = R.filter(isDescartado).length;
  const sistemas = new Set(R.map((r) => g(r, 'sistema')).filter(Boolean)).size;

  const prevAvg = prev ? avg(prev.rows.map((r) => num(r, 'cel')).filter((v) => v !== null)) : null;
  const dDens = (densAvg !== null && prevAvg) ? (densAvg - prevAvg) / prevAvg * 100 : null;
  const dReg = prev ? R.length - prev.rows.length : null;
  const arrowP = (x) => x === null ? '' : x > 0 ? `<span class="alg-up">▲${Math.abs(x).toFixed(0)}%</span>` : x < 0 ? `<span class="alg-down">▼${Math.abs(x).toFixed(0)}%</span>` : '<span class="muted">=</span>';
  const arrowN = (x) => x === null ? '' : x > 0 ? `<span class="alg-up">▲${x}</span>` : x < 0 ? `<span class="alg-down">▼${Math.abs(x)}</span>` : '<span class="muted">=</span>';
  const pill = (label, val, extra = '') => `<span class="alg-day-kpi"><b>${esc(String(val))}</b>${esc(label)}${extra ? ` <span class="alg-day-delta">${extra}</span>` : ''}</span>`;

  const kpis = `<div class="alg-day-kpis">
    ${pill('registros', R.length, arrowN(dReg))}
    ${pill('sistemas', sistemas)}
    ${pill('densidad prom.', densAvg === null ? '—' : fmtK(densAvg), arrowP(dDens))}
    ${pill('protoz. ≥5', protoAlert)}
    ${pill('descartados', descart)}
  </div>`;

  const catRows = SYS_CATS.map((c) => {
    const rr = R.filter((r) => sysCat(g(r, 'sistema')) === c);
    if (!rr.length) return null;
    return { c, n: rr.length, avg: avg(rr.map((r) => num(r, 'cel')).filter((v) => v !== null)) };
  }).filter(Boolean);
  const catTable = catRows.length
    ? `<table class="alg-table"><thead><tr><th>Categoría</th><th style="text-align:right">Registros</th><th style="text-align:right">Densidad prom.</th></tr></thead><tbody>${catRows.map((x) => `<tr><td><b>${esc(x.c)}</b></td><td style="text-align:right">${x.n}</td><td style="text-align:right">${x.avg === null ? '—' : fmtK(x.avg) + ' cel/ml'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="muted" style="padding:8px">Sin categorías.</div>';

  const pAvg = (key) => { const a = R.map((r) => num(r, key)).filter((v) => v !== null); return a.length ? avg(a) : null; };
  const fq = [['🧂 Salinidad', pAvg('salinidad'), ' ppt'], ['⚗️ pH', pAvg('ph'), ''], ['🌡️ Temperatura', pAvg('temp'), ' °C'], ['💡 Luz', pAvg('luz'), ' %']];
  const fqHtml = `<div class="alg-day-fq">${fq.map(([lbl, v, u]) => `<div class="alg-day-fq-item"><span class="alg-day-fq-lbl">${lbl}</span><span class="alg-day-fq-val">${v === null ? '—' : v.toFixed(1) + u}</span></div>`).join('')}</div>`;

  const countBy = (key, norm) => { const m = new Map(); R.forEach((r) => { const v = norm ? norm(g(r, key)) : g(r, key); if (v) m.set(v, (m.get(v) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const espChips = countBy('especie').map(([e, n]) => `<span class="alg-chip">${esc(especieLabel(e))} <b>${n}</b></span>`).join('') || '<span class="muted">—</span>';
  // Técnicos normalizados (unifica variantes de tipeo del mismo nombre).
  const tecChips = countBy('tecnico', normalizeTecnico).map(([t, n]) => `<span class="alg-chip">${esc(t)} <b>${n}</b></span>`).join('') || '<span class="muted">—</span>';

  const obs = R.filter((r) => g(r, 'obs'));
  const obsHtml = obs.length
    ? `<ul class="alg-day-obs-list">${obs.map((r) => `<li><b>${esc(g(r, 'sistema') || '—')}</b>${g(r, 'lote') ? ' · L' + esc(g(r, 'lote')) : ''}: ${esc(g(r, 'obs'))}</li>`).join('')}</ul>`
    : '<div class="muted">Sin observaciones.</div>';

  return kpis + `<div class="alg-day-grid">
    <div class="alg-day-block alg-day-block-wide"><h4 class="alg-day-h">⚙️ Por categoría</h4>${catTable}</div>
    <div class="alg-day-block"><h4 class="alg-day-h">🧪 Fisicoquímicos</h4>${fqHtml}</div>
    <div class="alg-day-block"><h4 class="alg-day-h">🦠 Especies</h4><div class="alg-chips">${espChips}</div></div>
    <div class="alg-day-block alg-day-block-wide"><h4 class="alg-day-h">🧑‍🔬 Técnicos</h4><div class="alg-chips">${tecChips}</div></div>
  </div>
  <div class="alg-day-block" style="margin-top:12px"><h4 class="alg-day-h">📝 Observaciones del día <span class="muted">· ${obs.length}</span></h4>${obsHtml}</div>`;
}

/* ---- Indicadores del mes: helpers + modales ---- */
/** Meses (índices) presentes en TODO el histórico de Lab_Algas (asc). */
function algMonthsList() {
  const cor = [...new Set(algaeRows().map((r) => g(r, 'corrida')).filter(Boolean))];
  return [...new Set(cor.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
}
/** Filas de Lab_Algas cuyo mes (por corrida) es `monthIdx`. */
function algMonthRows(monthIdx) {
  return algaeRows().filter((r) => { const c = g(r, 'corrida'); return c && monthIndexOfCorrida(+c) === monthIdx; });
}
const totalCel = (rows) => rows.reduce((s, r) => { const v = num(r, 'cel'); return s + (v || 0); }, 0);
/** Nº de días del mes calendario al que pertenecen las filas (para la cobertura). */
function monthDaysOf(rows) {
  const d = rows.map((r) => parseAnyDate(g(r, 'fecha'))).find(Boolean);
  return d ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() : 0;
}

/** Flecha ▲▼ de variación porcentual (Δ%) con color. */
function deltaArrow(pct, suffix = '%') {
  if (pct === null || pct === undefined || isNaN(pct)) return '';
  if (pct > 0) return `<span class="alg-up">▲ ${Math.abs(pct).toFixed(0)}${suffix} vs mes ant.</span>`;
  if (pct < 0) return `<span class="alg-down">▼ ${Math.abs(pct).toFixed(0)}${suffix} vs mes ant.</span>`;
  return '<span class="muted">= vs mes ant.</span>';
}
/** Flecha en PUNTOS porcentuales (para la tasa de descarte). Subir descarte es malo. */
function deltaArrowPts(pts) {
  if (pts === null || pts === undefined || isNaN(pts)) return '';
  if (pts > 0) return `<span class="alg-down">▲ ${Math.abs(pts).toFixed(1)} pp vs mes ant.</span>`;
  if (pts < 0) return `<span class="alg-up">▼ ${Math.abs(pts).toFixed(1)} pp vs mes ant.</span>`;
  return '<span class="muted">= vs mes ant.</span>';
}

/** Tarjeta-indicador clicable (abre su modal). */
function mindCard(key, icon, label, value, delta) {
  return `<button class="alg-mind" data-alg-open="${key}" title="Ver detalle">
      <span class="alg-mind-ic">${icon}</span>
      <span class="alg-mind-body">
        <span class="alg-mind-lbl">${esc(label)}</span>
        <span class="alg-mind-val">${value}</span>
        ${delta ? `<span class="alg-mind-delta">${delta}</span>` : ''}
      </span>
      <span class="alg-mind-go">⤢</span>
    </button>`;
}

/** Cáscara de modal de mes (cabecera + cuerpo vacío que se rellena al abrir). */
function monthModalShell(id, title) {
  return `<div class="sv-modal" id="${id}" data-alg-moverlay>
    <div class="sv-modal-card alg-month-card">
      <div class="sv-modal-head"><span class="sv-modal-title">${title}</span><button class="sv-modal-x" data-alg-mclose aria-label="Cerrar">✕</button></div>
      <div class="sv-modal-body" id="${id}Body"></div>
    </div>
  </div>`;
}

function closeMonthModals(root) {
  ['algBioModal', 'algDescModal', 'algCovModal', 'algIndicesModal'].forEach((id) => { const m = root.querySelector('#' + id); if (m) m.classList.remove('sv-open'); });
  document.body.classList.remove('modal-open');
  ['algBioCanvas', 'algDescLine', 'algDescBars'].forEach(destroyChart);
}

/** Abre el modal de Índices del mes (contaminación · estabilidad fisicoquímica · técnico). */
function openIndices(root) {
  fillIndicesModal(root);
  const m = root.querySelector('#algIndicesModal');
  if (m) { m.classList.add('sv-open'); document.body.classList.add('modal-open'); }
}

/** Calcula y pinta los Índices sobre el mes activo. */
function fillIndicesModal(root) {
  const body = root.querySelector('#algIndicesModalBody'); if (!body) return;
  const R = algMonthRows(vState.month);
  if (!R.length) { body.innerHTML = '<div class="empty-state" style="padding:24px">Sin registros en el mes.</div>'; return; }

  // 1) Índice de contaminación (Protozoarios + Ciliados + Filamentosos)
  const comp = (key) => { const a = R.map((r) => num(r, key)).filter((v) => v !== null); return { avg: a.length ? avg(a) : null, max: a.length ? Math.max(...a) : null, n: a.length }; };
  const comps = [['🦠 Protozoarios', comp('protozoarios')], ['🌀 Ciliados', comp('ciliados')], ['🧵 Filamentosos', comp('filamentosos')]];
  const combVals = R.map((r) => { const p = num(r, 'protozoarios'), ci = num(r, 'ciliados'), fi = num(r, 'filamentosos'); return (p === null && ci === null && fi === null) ? null : (p || 0) + (ci || 0) + (fi || 0); }).filter((v) => v !== null);
  const combAvg = combVals.length ? avg(combVals) : null;
  const protoMeas = R.map((r) => num(r, 'protozoarios')).filter((v) => v !== null);
  const protoAlertPct = protoMeas.length ? protoMeas.filter((v) => v >= 5).length / protoMeas.length * 100 : null;
  const lvl = combAvg === null ? { t: '—', c: 'var(--c-text-muted)' } : combAvg < ALG_CONTAM_LEVELS.bajo ? { t: 'Bajo', c: '#186447' } : combAvg <= ALG_CONTAM_LEVELS.alto ? { t: 'Medio', c: '#A06B27' } : { t: 'Alto', c: '#CA6378' };
  const f1 = (v, u = '') => v === null ? '—' : v.toFixed(1) + u;
  const contamCard = `<div class="alg-month-block">
      <h4 class="alg-day-h">🦠 Índice de contaminación <span class="muted">· Protozoarios + Ciliados + Filamentosos por registro</span></h4>
      <div class="alg-day-kpis">
        <span class="alg-day-kpi"><b style="color:${lvl.c}">${esc(lvl.t)}</b>nivel</span>
        <span class="alg-day-kpi"><b>${f1(combAvg)}</b>índice combinado</span>
        <span class="alg-day-kpi"><b>${f1(protoAlertPct, '%')}</b>registros protoz. ≥ 5</span>
      </div>
      <table class="alg-table"><thead><tr><th>Componente</th><th style="text-align:right">Promedio</th><th style="text-align:right">Máx.</th><th style="text-align:right">Registros</th></tr></thead>
        <tbody>${comps.map(([l, c]) => `<tr><td><b>${l}</b></td><td style="text-align:right">${f1(c.avg)}</td><td style="text-align:right">${c.max === null ? '—' : c.max.toFixed(0)}</td><td style="text-align:right">${c.n}</td></tr>`).join('')}</tbody></table>
      <div class="muted" style="font-size:11px;margin-top:8px">Niveles: &lt; ${ALG_CONTAM_LEVELS.bajo} Bajo · ${ALG_CONTAM_LEVELS.bajo}–${ALG_CONTAM_LEVELS.alto} Medio · &gt; ${ALG_CONTAM_LEVELS.alto} Alto.</div>
    </div>`;

  // 2) Estabilidad fisicoquímica (% de registros dentro de rango óptimo)
  const stab = (key, range) => { const a = R.map((r) => num(r, key)).filter((v) => v !== null); const inR = a.filter((v) => v >= range[0] && v <= range[1]).length; return { n: a.length, in: inR, pct: a.length ? inR / a.length * 100 : null, lo: range[0], hi: range[1] }; };
  const stabs = [['🧂 Salinidad', stab('salinidad', ALG_OPT_RANGES.salinidad), ' ppt'], ['⚗️ pH', stab('ph', ALG_OPT_RANGES.ph), ''], ['🌡️ Temperatura', stab('temp', ALG_OPT_RANGES.temp), ' °C']];
  const stabValid = stabs.map((s) => s[1]).filter((s) => s.pct !== null);
  const stabOverall = stabValid.length ? avg(stabValid.map((s) => s.pct)) : null;
  const stabCard = `<div class="alg-month-block">
      <h4 class="alg-day-h">🧪 Estabilidad fisicoquímica <span class="muted">· % de registros dentro de rango óptimo</span></h4>
      <div class="alg-day-kpis"><span class="alg-day-kpi"><b>${f1(stabOverall, '%')}</b>estabilidad global</span></div>
      <table class="alg-table"><thead><tr><th>Parámetro</th><th style="text-align:right">Rango óptimo</th><th style="text-align:right">En rango</th><th style="text-align:right">% estable</th></tr></thead>
        <tbody>${stabs.map(([l, s, u]) => `<tr><td><b>${l}</b></td><td style="text-align:right">${s.lo}–${s.hi}${u}</td><td style="text-align:right">${s.in}/${s.n}</td><td style="text-align:right"><b>${f1(s.pct, '%')}</b></td></tr>`).join('')}</tbody></table>
    </div>`;

  // 3) Rendimiento por técnico
  const tecMap = new Map();
  R.forEach((r) => { const t = normalizeTecnico(g(r, 'tecnico')) || '—'; if (!tecMap.has(t)) tecMap.set(t, []); tecMap.get(t).push(r); });
  const tecRows = [...tecMap.entries()].map(([t, rr]) => {
    const dens = rr.map((r) => num(r, 'cel')).filter((v) => v !== null);
    const desc = rr.filter(isDescartado).length;
    const protoA = rr.map((r) => num(r, 'protozoarios')).filter((v) => v !== null).filter((v) => v >= 5).length;
    return { t, n: rr.length, dens: dens.length ? avg(dens) : null, descPct: rr.length ? desc / rr.length * 100 : 0, protoA };
  }).sort((a, b) => b.n - a.n);
  const tecCard = `<div class="alg-month-block">
      <h4 class="alg-day-h">🧑‍🔬 Rendimiento por técnico <span class="muted">· del mes</span></h4>
      <table class="alg-table"><thead><tr><th>Técnico</th><th style="text-align:right">Registros</th><th style="text-align:right">Densidad media</th><th style="text-align:right">% descarte</th><th style="text-align:right">Protoz. ≥ 5</th></tr></thead>
        <tbody>${tecRows.map((x) => `<tr><td><b>${esc(x.t)}</b></td><td style="text-align:right">${x.n}</td><td style="text-align:right">${x.dens === null ? '—' : fmtK(x.dens) + ' cel/ml'}</td><td style="text-align:right">${x.descPct.toFixed(1)}%</td><td style="text-align:right">${x.protoA}</td></tr>`).join('')}</tbody></table>
    </div>`;

  body.innerHTML = `<div class="alg-month-headline muted">${esc(monthLabelAt(vState.month))} · ${R.length} registro(s) del mes</div>${contamCard}${stabCard}${tecCard}`;
}

function openMonthModal(root, key) {
  closeMonthModals(root);
  const id = { bio: 'algBioModal', desc: 'algDescModal', cov: 'algCovModal' }[key];
  const overlay = id && root.querySelector('#' + id);
  if (!overlay) return;
  if (key === 'bio') fillBioModal(root);
  else if (key === 'desc') fillDescModal(root);
  else if (key === 'cov') fillCovModal(root);
  overlay.classList.add('sv-open');
  document.body.classList.add('modal-open'); // pausa el auto-refresco
}

/** Contexto del mes activo + mes anterior con datos. */
function monthCtx() {
  const ms = algMonthsList();
  const i = ms.indexOf(vState.month);
  const prev = i > 0 ? ms[i - 1] : null;
  return { now: vState.month, prev, rows: algMonthRows(vState.month), prevRows: prev != null ? algMonthRows(prev) : [] };
}

/** Biomasa: tabla comparativa POR CORRIDA (mes actual y anterior) + alga→módulo. */
function fillBioModal(root) {
  const body = root.querySelector('#algBioModalBody'); if (!body) return;
  const ctx = monthCtx();
  const sumByCorrida = (rows) => { const m = new Map(); rows.forEach((r) => { const c = g(r, 'corrida'), v = num(r, 'cel'); if (c && v !== null) m.set(c, (m.get(c) || 0) + v); }); return [...m.entries()].sort((a, b) => (+a[0]) - (+b[0])); };
  const nowBy = sumByCorrida(ctx.rows), prevBy = sumByCorrida(ctx.prevRows);
  const nowTot = totalCel(ctx.rows), prevTot = totalCel(ctx.prevRows);
  const d = prevTot ? (nowTot - prevTot) / prevTot * 100 : null;

  const corrTable = (title, entries, tot) => `<div class="alg-month-block">
      <h4 class="alg-day-h">${esc(title)} <span class="muted">· Total ${fmtK(tot)} cel/ml</span></h4>
      ${entries.length ? `<table class="alg-table"><thead><tr><th>Corrida</th><th style="text-align:right">Σ cel/ml</th></tr></thead><tbody>${entries.map(([c, v]) => `<tr><td><b>C${esc(c)}</b></td><td style="text-align:right">${fmtK(v)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted" style="padding:8px">Sin datos.</div>'}
    </div>`;

  // Vínculo alga → módulo: Σ cel/ml por Modulo_Larv del mes actual.
  const modMap = new Map();
  ctx.rows.forEach((r) => { const mod = g(r, 'modulo'), v = num(r, 'cel'); if (mod && v !== null) modMap.set(mod, (modMap.get(mod) || 0) + v); });
  const modEntries = [...modMap.entries()].sort((a, b) => b[1] - a[1]);

  // ── Cultivos por módulo: cuántos cultivos de cada categoría abastecen cada módulo.
  //    Un "cultivo" = Sistema distinto dentro de una corrida (agrupa sus 3-4 registros).
  const cultByMod = new Map(); // módulo → categoría → Set("corrida|sistema")
  const cultDetail = new Map(); // módulo → categoría → Set(sistema) (para el tooltip)
  ctx.rows.forEach((r) => {
    const mod = g(r, 'modulo'), sis = g(r, 'sistema'), cor = g(r, 'corrida'); const cat = sysCat(sis);
    if (!mod || !sis || !cat || !SYS_CATS.includes(cat)) return;
    if (!cultByMod.has(mod)) { cultByMod.set(mod, new Map()); cultDetail.set(mod, new Map()); }
    const bc = cultByMod.get(mod), bd = cultDetail.get(mod);
    if (!bc.has(cat)) { bc.set(cat, new Set()); bd.set(cat, new Set()); }
    bc.get(cat).add((cor || '') + '|' + sis); bd.get(cat).add(sis);
  });
  const cultMods = [...cultByMod.keys()].sort(natCmp);
  const cultCats = SYS_CATS.filter((c) => cultMods.some((m) => cultByMod.get(m).has(c)));
  const cultCell = (m, c) => {
    const n = cultByMod.get(m).get(c)?.size || 0;
    if (!n) return '<span class="muted">—</span>';
    const sysList = [...cultDetail.get(m).get(c)].sort(natCmp).join(', ');
    return `<b title="${esc(sysList)}">${n}</b>`;
  };
  const cultTotal = (m) => cultCats.reduce((a, c) => a + (cultByMod.get(m).get(c)?.size || 0), 0);
  const cultTable = cultMods.length
    ? `<table class="alg-table"><thead><tr><th>Módulo</th>${cultCats.map((c) => `<th style="text-align:right">${esc(c)}</th>`).join('')}<th style="text-align:right">Total</th></tr></thead>
        <tbody>${cultMods.map((m) => `<tr><td><b>${esc(m)}</b></td>${cultCats.map((c) => `<td style="text-align:right">${cultCell(m, c)}</td>`).join('')}<td style="text-align:right"><b>${cultTotal(m)}</b></td></tr>`).join('')}</tbody></table>`
    : '<div class="muted" style="padding:8px">Sin dato de módulo (columna Modulo_Larv vacía).</div>';

  body.innerHTML = `
    <div class="alg-month-headline">Mes actual <b>${fmtK(nowTot)}</b> cel/ml ${deltaArrow(d)}</div>
    <div class="alg-month-2col">
      ${corrTable('Mes actual', nowBy, nowTot)}
      ${corrTable('Mes anterior', prevBy, prevTot)}
    </div>
    <div class="alg-month-block">
      <h4 class="alg-day-h">🔗 Vínculo alga → módulo <span class="muted">· qué módulo de larvicultura abastece (Σ cel/ml, mes actual)</span></h4>
      <div class="alg-chart-host" style="height:${Math.max(180, modEntries.length * 30 + 40)}px">${modEntries.length ? '<canvas id="algBioCanvas"></canvas>' : '<div class="empty-state" style="padding:20px">Sin dato de módulo (columna Modulo_Larv vacía).</div>'}</div>
    </div>
    <div class="alg-month-block">
      <h4 class="alg-day-h">🧮 Cultivos por módulo <span class="muted">· nº de cultivos (sistema × corrida) de cada categoría que abastecen cada módulo · pasa el cursor para ver los sistemas</span></h4>
      <div class="alg-table-wrap" style="max-height:260px">${cultTable}</div>
    </div>`;

  if (modEntries.length) requestAnimationFrame(() => { try { drawModuloBiomasa('algBioCanvas', modEntries.map((e) => e[0]), modEntries.map((e) => e[1])); } catch (e) { console.error('[algas] bio', e); } });
}

/** Tasa de descarte: línea por día + barras por categoría. */
function fillDescModal(root) {
  const body = root.querySelector('#algDescModalBody'); if (!body) return;
  const ctx = monthCtx();
  const R = ctx.rows;
  // Por día
  const byDay = new Map();
  R.forEach((r) => { const f = g(r, 'fecha'); if (!f) return; if (!byDay.has(f)) byDay.set(f, { d: 0, t: 0 }); const o = byDay.get(f); o.t++; if (isDescartado(r)) o.d++; });
  const days = [...byDay.keys()].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const dayVals = days.map((k) => { const o = byDay.get(k); return o.t ? o.d / o.t * 100 : 0; });
  // Por categoría
  const cats = SYS_CATS.filter((c) => R.some((r) => sysCat(g(r, 'sistema')) === c));
  const catDetail = cats.map((c) => { const rr = R.filter((r) => sysCat(g(r, 'sistema')) === c); const d = rr.filter(isDescartado).length; return { c, d, t: rr.length, pct: rr.length ? d / rr.length * 100 : 0 }; });

  const totD = R.filter(isDescartado).length, totT = R.length;
  body.innerHTML = `
    <div class="alg-month-headline">Mes: <b>${totT ? (totD / totT * 100).toFixed(1) : '0'}%</b> descartado <span class="muted">· ${totD} de ${totT} registros</span></div>
    <div class="alg-month-block"><h4 class="alg-day-h">📉 Tendencia diaria</h4><div class="alg-chart-host" style="height:230px">${days.length ? '<canvas id="algDescLine"></canvas>' : '<div class="empty-state" style="padding:20px">Sin datos.</div>'}</div></div>
    <div class="alg-month-2col">
      <div class="alg-month-block"><h4 class="alg-day-h">📊 Por categoría</h4><div class="alg-chart-host" style="height:220px">${cats.length ? '<canvas id="algDescBars"></canvas>' : '<div class="empty-state" style="padding:20px">Sin datos.</div>'}</div></div>
      <div class="alg-month-block"><h4 class="alg-day-h">🧾 Detalle</h4><table class="alg-table"><thead><tr><th>Categoría</th><th style="text-align:right">Desc.</th><th style="text-align:right">Total</th><th style="text-align:right">%</th></tr></thead><tbody>${catDetail.map((x) => `<tr><td><b>${esc(x.c)}</b></td><td style="text-align:right">${x.d}</td><td style="text-align:right">${x.t}</td><td style="text-align:right">${x.pct.toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>
    </div>`;

  requestAnimationFrame(() => {
    try { if (days.length) drawDaily('algDescLine', days, dayVals, 'Descarte', '#CA6378', '%', true); } catch (e) { console.error('[algas] desc-line', e); }
    try { if (cats.length) drawCatPct('algDescBars', cats, catDetail.map((x) => x.pct)); } catch (e) { console.error('[algas] desc-bars', e); }
  });
}

/** Cobertura de registro: calendario heatmap POR CATEGORÍA × días del mes. */
function fillCovModal(root) {
  const body = root.querySelector('#algCovModalBody'); if (!body) return;
  const ctx = monthCtx();
  const R = ctx.rows;
  const ref = R.map((r) => parseAnyDate(g(r, 'fecha'))).find(Boolean);
  if (!ref) { body.innerHTML = '<div class="empty-state" style="padding:24px">Sin registros en el mes.</div>'; return; }
  const y = ref.getFullYear(), mo = ref.getMonth();
  const dim = new Date(y, mo + 1, 0).getDate();
  const cats = SYS_CATS.filter((c) => R.some((r) => sysCat(g(r, 'sistema')) === c));
  const cnt = {}; cats.forEach((c) => (cnt[c] = new Array(dim + 1).fill(0)));
  R.forEach((r) => { const c = sysCat(g(r, 'sistema')); const d = parseAnyDate(g(r, 'fecha')); if (cats.includes(c) && d && d.getMonth() === mo && d.getFullYear() === y) cnt[c][d.getDate()]++; });

  const headCells = Array.from({ length: dim }, (_, i) => `<th>${i + 1}</th>`).join('');
  const rowsHtml = cats.map((c) => {
    const cells = Array.from({ length: dim }, (_, i) => { const n = cnt[c][i + 1]; return n ? `<td class="alg-cal-on alg-cal-click" data-cov-day="${i + 1}" role="button" tabindex="0" title="${n} reg · día ${i + 1} · clic = ver registros">${n}</td>` : '<td class="alg-cal-off" title="sin registro"></td>'; }).join('');
    const tot = cnt[c].reduce((a, b) => a + b, 0);
    return `<tr><th class="alg-cal-rowh">${esc(c)} <span class="muted">${tot}</span></th>${cells}</tr>`;
  }).join('');

  body.innerHTML = `<div class="alg-month-headline muted">${esc(monthLabelAt(vState.month))} · ■ con registro · □ sin registro · clic en un día = ver sus registros</div>
    <div class="alg-cal-wrap"><table class="alg-cal"><thead><tr><th class="alg-cal-rowh">Categoría</th>${headCells}</tr></thead><tbody>${rowsHtml}</tbody></table></div>
    <div id="algCovDayDetail" class="alg-cov-detail"></div>`;
}

/** Lista los registros de un día del mes activo (clic en el calendario de Cobertura). */
function renderCovDay(root, dayNum) {
  const box = root.querySelector('#algCovDayDetail'); if (!box) return;
  const R = algMonthRows(vState.month);
  const ref = R.map((r) => parseAnyDate(g(r, 'fecha'))).find(Boolean);
  if (!ref) { box.innerHTML = ''; return; }
  const mo = ref.getMonth(), y = ref.getFullYear();
  const day = R.filter((r) => { const dt = parseAnyDate(g(r, 'fecha')); return dt && dt.getDate() === dayNum && dt.getMonth() === mo && dt.getFullYear() === y; })
    .sort((a, b) => natCmp(g(a, 'sistema'), g(b, 'sistema')));
  const cols = ['Corrida', 'Módulo', 'Sistema', 'Área', 'Lote', 'Día', 'Cel/ml', 'Protoz.', 'Especie', 'Sal.', 'pH', 'Desc.', 'Técnico'];
  const numCell = (v) => (v === null) ? '<span class="muted">—</span>' : esc(fmtK(v));
  const rowsH = day.map((r) => `<tr><td>${cellTxt(g(r, 'corrida'))}</td><td>${cellTxt(g(r, 'modulo'))}</td><td><b>${cellTxt(g(r, 'sistema'))}</b></td><td>${cellTxt(g(r, 'area'))}</td><td>${cellTxt(g(r, 'lote'))}</td><td>${cellTxt(g(r, 'dia'))}</td><td style="text-align:right">${numCell(num(r, 'cel'))}</td><td style="text-align:center">${cellTxt(g(r, 'protozoarios'))}</td><td>${cellTxt(g(r, 'especie'))}</td><td style="text-align:right">${cellTxt(g(r, 'salinidad'))}</td><td style="text-align:right">${cellTxt(g(r, 'ph'))}</td><td style="text-align:center">${isDescartado(r) ? '🗑️' : ''}</td><td>${cellTxt(g(r, 'tecnico'))}</td></tr>`).join('');
  box.innerHTML = `<h4 class="alg-day-h" style="margin-top:14px">📋 Registros del día ${dayNum} <span class="muted">· ${day.length}</span></h4>
    <div class="alg-table-wrap" style="max-height:260px"><table class="alg-table"><thead><tr>${cols.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rowsH || `<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:14px">Sin registros ese día.</td></tr>`}</tbody></table></div>`;
}

/* ---- Descarga Excel de Registros (rango de fechas) ---- */
// Columnas exportadas (cabecera del Sheet → clave de acceso AF).
const ALG_EXPORT_COLS = [
  ['Fecha', 'fecha'], ['Corrida_Larv', 'corrida'], ['Modulo_Larv', 'modulo'], ['Área_Algas', 'area'],
  ['Sistema', 'sistema'], ['Lote', 'lote'], ['Dia_Proceso', 'dia'], ['Cel_ml', 'cel'],
  ['Protozoarios', 'protozoarios'], ['Especie', 'especie'], ['Salinidad_ppt', 'salinidad'], ['pH', 'ph'],
  ['Temperatura_C', 'temp'], ['Intensidad_Luz_%', 'luz'], ['Descartado', 'descartado'],
  ['Ciliados', 'ciliados'], ['Filamentosos', 'filamentosos'], ['Observaciones', 'obs'], ['Técnico', 'tecnico'],
  ['Células Vacías', 'cel_vacias'], ['Células Semillenas', 'cel_semillenas'], ['Células Alargadas', 'cel_alargadas'],
  ['Células en División', 'cel_llenas'], ['Volumen de Despacho', 'vol_despacho'],
];

/** Filas de la categoría (subvista) activa respetando los filtros activos, SIN el mes
 *  (el rango de fechas del modal es el filtro temporal). Base para la exportación. */
function exportBaseRows() {
  return algaeRows().filter((r) =>
    sysCat(g(r, 'sistema')) === vState.sub
    && (!vState.corrida || g(r, 'corrida') === vState.corrida)
    && (!vState.modulo || g(r, 'modulo') === vState.modulo)
    && (!vState.especie || g(r, 'especie') === vState.especie)
    && (!vState.area || g(r, 'area') === vState.area));
}

const isoDate = (d) => d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';

function algExportModalHTML() {
  return `<div class="sv-modal" id="algExportModal" data-alg-exp-overlay>
    <div class="sv-modal-card alg-export-card">
      <div class="sv-modal-head"><span class="sv-modal-title">⬇️ Descargar Excel — Registros</span><button class="sv-modal-x" data-alg-exp-close aria-label="Cerrar">✕</button></div>
      <div class="sv-modal-body">
        <p class="muted" id="algExpScope" style="margin:0 0 12px"></p>
        <div class="alg-export-range">
          <label class="alg-export-fld">Desde <input type="date" id="algExpFrom" class="alg-select"></label>
          <label class="alg-export-fld">Hasta <input type="date" id="algExpTo" class="alg-select"></label>
        </div>
        <div id="algExpInfo" class="muted" style="margin:10px 0"></div>
        <button class="alg-daybtn" data-alg-exp-go>⬇️ Descargar Excel</button>
      </div>
    </div>
  </div>`;
}

function openExport(root) {
  const overlay = root.querySelector('#algExportModal'); if (!overlay) return;
  const base = exportBaseRows();
  const dates = base.map((r) => parseAnyDate(g(r, 'fecha'))).filter(Boolean).sort((a, b) => a - b);
  const fromEl = root.querySelector('#algExpFrom'), toEl = root.querySelector('#algExpTo');
  if (fromEl) fromEl.value = dates.length ? isoDate(dates[0]) : '';
  if (toEl) toEl.value = dates.length ? isoDate(dates[dates.length - 1]) : '';
  const scope = root.querySelector('#algExpScope');
  if (scope) scope.innerHTML = `Categoría: <b>${esc(vState.sub || '—')}</b>${vState.corrida ? ' · Corrida ' + esc(vState.corrida) : ''}${vState.modulo ? ' · Módulo ' + esc(vState.modulo) : ''}${vState.especie ? ' · ' + esc(vState.especie) : ''}${vState.area ? ' · ' + esc(vState.area) : ''} · ${base.length} registro(s) en total`;
  updateExportInfo(root);
  overlay.classList.add('sv-open');
  document.body.classList.add('modal-open');
}
function closeExport(root) { const o = root.querySelector('#algExportModal'); if (o) o.classList.remove('sv-open'); document.body.classList.remove('modal-open'); }

/** Filas a exportar según el rango de fechas elegido (inclusive). */
function exportRowsInRange(root) {
  const fromEl = root.querySelector('#algExpFrom'), toEl = root.querySelector('#algExpTo');
  const from = fromEl && fromEl.value ? new Date(fromEl.value + 'T00:00:00') : null;
  const to = toEl && toEl.value ? new Date(toEl.value + 'T23:59:59') : null;
  return exportBaseRows().filter((r) => { const d = parseAnyDate(g(r, 'fecha')); if (!d) return false; if (from && d < from) return false; if (to && d > to) return false; return true; })
    .sort((a, b) => (parseAnyDate(g(a, 'fecha')) || 0) - (parseAnyDate(g(b, 'fecha')) || 0));
}

function updateExportInfo(root) {
  const info = root.querySelector('#algExpInfo'); if (!info) return;
  info.textContent = `Se exportarán ${exportRowsInRange(root).length} registro(s) en el rango elegido.`;
}

function runExport(root) {
  const XLSX = window.XLSX;
  if (!XLSX) { toast('No se pudo cargar el componente de Excel (SheetJS).', 'err'); return; }
  const rows = exportRowsInRange(root);
  if (!rows.length) { toast('No hay registros en el rango elegido.', 'warn'); return; }
  const header = ALG_EXPORT_COLS.map((c) => c[0]);
  const aoa = [header, ...rows.map((r) => ALG_EXPORT_COLS.map(([, key]) => { const v = g(r, key); return (v === '' || v === null || v === undefined) ? '' : v; }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Algas');
  const fromEl = root.querySelector('#algExpFrom'), toEl = root.querySelector('#algExpTo');
  const tag = String(vState.sub || 'Algas').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Algas_${tag}_${(fromEl && fromEl.value) || 'inicio'}_a_${(toEl && toEl.value) || 'fin'}.xlsx`);
}

function algSelect(dim, value, values, placeholder) {
  return `<select class="alg-select" data-algfilter="${dim}">
      <option value="">${esc(placeholder)}</option>
      ${values.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(dim === 'especie' ? especieLabel(o) : o)}</option>`).join('')}
    </select>`;
}

function kpi(icon, label, value, alert = false) {
  return `<div class="alg-kpi${alert ? ' is-alert' : ''}">
      <div class="alg-kpi-label">${icon} ${esc(label)}</div>
      <div class="alg-kpi-value">${esc(value)}</div>
    </div>`;
}

/** Panel "Estadísticas del Período" (lista de pares etiqueta/valor).
 *  `isFunda` = la fila "Lotes" solo se muestra en Fundas (únicas con lote). */
function statsHTML(s, isFunda = false) {
  const dens = (v) => (v === null ? '—' : fmtK(v) + ' cel/ml');
  const row = (lbl, val) => `<div class="alg-stat"><span class="alg-stat-lbl">${esc(lbl)}</span><span class="alg-stat-val">${val}</span></div>`;
  return row('Registros', s.n)
    + (isFunda ? row('Lotes', s.lotes) : '')
    + row('Sistemas', s.sistemas)
    + row('Densidad mín.', dens(s.densMin))
    + row('Densidad prom.', dens(s.densAvg))
    + row('Densidad máx.', dens(s.densMax))
    + row('Protozoarios prom.', s.protoAvg === null ? '—' : s.protoAvg.toFixed(1))
    + row('Protoz. ≥ 5', `<b style="color:${s.protoAlert > 0 ? 'var(--c-malo,#D64545)' : 'inherit'}">${s.protoAlert}</b>`)
    + row('Salinidad prom.', s.salAvg === null ? '—' : s.salAvg.toFixed(1) + ' ppt')
    + row('pH prom.', s.phAvg === null ? '—' : s.phAvg.toFixed(1))
    + row('Período', `${s.from ? fmtShort(s.from) : '—'} → ${s.to ? fmtShort(s.to) : '—'}`);
}

/** Tarjeta con tabla PLEGABLE: muestra `visibleN` filas y un botón "Ver todo".
 *  `cells` = array de HTML interno de cada fila (sin <tr>). */
function collapsibleCard(icon, title, theadHtml, cells, visibleN, emptyMsg, extraBtnHtml = '') {
  const total = cells.length;
  const cols = (theadHtml.match(/<th/g) || []).length || 1;
  const hiddenN = Math.max(0, total - visibleN);
  const body = total
    ? cells.map((c, i) => `<tr class="${i >= visibleN ? 'alg-row-hidden' : ''}">${c}</tr>`).join('')
    : `<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:18px">${esc(emptyMsg || 'Sin datos.')}</td></tr>`;
  return `<div class="card alg-collap">
      <div class="alg-collap-head">
        <div class="alg-collap-title">${icon} ${esc(title)} <span class="muted" style="font-weight:600;font-size:12px">· ${total}</span></div>
        <div class="alg-collap-actions">${extraBtnHtml}${hiddenN > 0 ? `<button class="alg-toggle" data-alg-toggle aria-expanded="false">Ver todo (${total})</button>` : ''}</div>
      </div>
      <div class="alg-table-wrap" style="max-height:340px">
        <table class="alg-table"><thead>${theadHtml}</thead><tbody>${body}</tbody></table>
      </div>
    </div>`;
}

/* ============================================================
   EVENTOS (delegados, una sola vez)
   ============================================================ */
function bind(root) {
  if (root._algBound) return;
  root._algBound = true;

  // Escape cierra el overlay abierto (fullscreen/día/mes/export) vía su backdrop.
  registerModalEscape('.sv-modal.sv-open');

  root.addEventListener('change', (e) => {
    // Rango de fechas del modal de exportación: recalcula el conteo, no re-renderiza.
    if (e.target.id === 'algExpFrom' || e.target.id === 'algExpTo') { updateExportInfo(root); return; }
    const sel = e.target.closest('[data-algfilter]');
    if (!sel) return;
    // El conmutador de la curva solo cambia su estilo → redibuja SOLO ese gráfico
    // (antes re-renderizaba toda la vista y refrescaba los demás charts innecesariamente).
    if (sel.dataset.algfilter === 'growthView') {
      vState.growthView = sel.value || 'lines';
      if (fsDraw.growth) { try { fsDraw.growth('algGrowthHost', 'algGrowthLegend'); } catch (err) { console.error('[algas] growthView', err); } }
      return;
    }
    vState[sel.dataset.algfilter] = sel.value || null;
    algasView(root);
  });

  // Accesibilidad: los días del calendario de Cobertura (role=button) responden a Enter/Espacio.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const covDay = e.target.closest('[data-cov-day]');
    if (!covDay) return;
    e.preventDefault();
    renderCovDay(root, Number(covDay.dataset.covDay));
  });

  root.addEventListener('click', (e) => {
    // Ampliar gráfico (fullscreen estilo Supervisor)
    const fsBtn = e.target.closest('[data-alg-fs]');
    if (fsBtn) { openAlgFs(root, fsBtn.dataset.algFs); return; }
    if (e.target.closest('[data-alg-fs-close]') || e.target.matches('[data-alg-fs-overlay]')) { closeAlgFs(root); return; }

    // Resumen del día (modal)
    if (e.target.closest('[data-alg-daysum]')) { openDaySum(root); return; }
    if (e.target.closest('[data-alg-day-close]') || e.target.matches('[data-alg-day-overlay]')) { closeDaySum(root); return; }
    const dnav = e.target.closest('[data-alg-day-nav]');
    if (dnav && !dnav.disabled) { stepDaySum(root, Number(dnav.dataset.algDayNav)); return; }

    // Indicadores del mes (Biomasa / Descarte / Cobertura)
    const mind = e.target.closest('[data-alg-open]');
    if (mind) { openMonthModal(root, mind.dataset.algOpen); return; }
    if (e.target.closest('[data-alg-indices]')) { openIndices(root); return; }
    if (e.target.closest('[data-alg-mclose]') || e.target.matches('[data-alg-moverlay]')) { closeMonthModals(root); return; }

    // Cobertura: clic en un día del calendario → lista los registros de ese día
    const covDay = e.target.closest('[data-cov-day]');
    if (covDay) { renderCovDay(root, Number(covDay.dataset.covDay)); return; }

    // Descarga Excel de Registros (pide rango de fechas)
    if (e.target.closest('[data-alg-export]')) { openExport(root); return; }
    if (e.target.closest('[data-alg-exp-close]') || e.target.matches('[data-alg-exp-overlay]')) { closeExport(root); return; }
    if (e.target.closest('[data-alg-exp-go]')) { runExport(root); return; }

    // Pestaña de sistema (subvista) — reinicia el sistema concreto elegido
    const pill = e.target.closest('[data-alg-sub]');
    if (pill) { vState.sub = pill.dataset.algSub; vState.sysSel = null; algasView(root); return; }

    // Plegar / desplegar tablas (bitácora · registros)
    const tog = e.target.closest('[data-alg-toggle]');
    if (tog) {
      const card = tog.closest('.alg-collap'); if (!card) return;
      const exp = tog.getAttribute('aria-expanded') === 'true';
      card.querySelectorAll('.alg-row-hidden').forEach((tr) => tr.classList.toggle('alg-row-show', !exp));
      tog.setAttribute('aria-expanded', String(!exp));
      tog.textContent = exp ? `Ver todo (${card.querySelectorAll('tbody tr').length})` : 'Mostrar recientes';
      return;
    }

    // Navegación de mes (resetea la selección dependiente)
    const nav = e.target.closest('[data-month-nav]');
    if (!nav || nav.disabled) return;
    const allRows = algaeRows();
    const ms = [...new Set(allRows.map((r) => g(r, 'corrida')).filter(Boolean).map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
    const ni = ms.indexOf(vState.month) + Number(nav.dataset.monthNav);
    if (ni >= 0 && ni < ms.length) {
      vState.month = ms[ni];
      vState.corrida = null; vState.modulo = null; vState.especie = null; vState.area = null; vState.sub = null; vState.sysSel = null;
      algasView(root);
    }
  });
}
