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

   IMPORTANTE — la ubicación del evento sale de DOS sitios, y el orden importa:
   1.º el snapshot Sala/Tanque de la propia fila de Bitácora, si viene;
   2.º si no viene, se DERIVA siguiendo al Trovan (MATRIZ + transferencias, ver
       `resolveEventLocation`).

   ⚠ Hasta el 2026-08-31 este bloque afirmaba que «la Bitácora REAL solo guarda
   Trovan/Fecha/Tipo (SIN Sala/Tanque)» y que por tanto «el caso normal es la
   derivación». **Es FALSO, y medido contra la hoja viva**: las 1.970 filas de la
   Bitácora traen Sala Y Tanque rellenos (1970/1970, GET ?p=rows, 2026-08-31). El caso
   normal es el SNAPSHOT; la derivación no llega a ejecutarse ni una vez.
   Se corrige porque el error invitaba a borrar la guarda `if (!sala && !tanque)`
   tomándola por código muerto — y eso cambiaría la ubicación de los 1.970 eventos a
   la posición ACTUAL de cada hembra, falseando producción y fertilidad POR TANQUE sin
   un solo síntoma. La derivación sigue haciendo falta: es el respaldo para las filas
   antiguas o parciales que no traigan ubicación.

   DEFINICIONES (documentadas para que el usuario pueda ajustarlas en revisión):
   · Un "desove"/"mortalidad" = una fila de Bitácora del Tipo correspondiente; su
     ubicación (Sala/Tanque) se deriva por Trovan (MATRIZ + transferencias).
   · Producción de un tanque/sala = nº de desoves con ESA ubicación snapshot.
   · Fertilidad % de un tanque/sala = hembras distintas que desovaron allí ÷ hembras
     observadas allí (con algún evento en el período ∪ ocupantes vivas actuales), ×100.
   · Eficiencia reproductiva = desoves ÷ hembras observadas (desoves por hembra).
   · 🆕 2026-09-26 (usuario) · TASA DE DESOVE = desoves ÷ hembras-noche × 100: el % de las hembras que desovan cada
     noche (referencia 5–15 %, FAO; la misma del tablero de Maduración). Hembras-noche = las noches que cada hembra
     estuvo VIVA dentro del período (de su ingreso a su muerte o al último dato). No satura como la fertilidad, que a lo
     largo de meses tiende al 100 % porque casi todas acaban desovando alguna vez.
   · 🆕 2026-09-26 · un TANQUE es sala + número: los números se repiten entre salas (Sala 1 tiene 1–15; Sala 4, 1–6) y
     agrupar sólo por número sumaba tanques distintos (medido: «Tanque 1» mezclaba 333 desoves de la Sala 4 con 38 de la 1).
   · Ventana de actividad = ACTIVITY_WINDOW_DAYS días hacia atrás desde la fecha más
     reciente de los datos; clasifica hembra Activa/Inactiva/Transferida (reciente).
   · Fertilidad en TENDENCIAS = hembras que desovaron en el bucket ÷ hembras VIVAS
     durante el bucket (ingreso ≤ fin del bucket y sin muerte previa), ×100.
   ============================================================ */
import { parseAnyDate, yearMonthKey } from '../../core/dates.js';
import { normTrovan, cadenaDelChip, individuoEnFecha, idsDeCadena, claveIndividuo } from '../../core/trovan.js';
import { MAD_TANQUES_POR_SALA } from '../registros/lib/ficha-maduracion-ingreso.schema.js';

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

// La normalización del Trovan es ahora DEFINICIÓN ÚNICA en `core/trovan.js`, compartida con
// la escritura (`registros/lib/reproductivo.data.js`). Esta copia «espejo» NO saneaba, así
// que un Trovan con `=`/`+`/`-`/`@` inicial —o de más de 200 caracteres— producía una clave
// distinta en cada lado y el cruce entre hojas se rompía en silencio (medido).
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

/* ── Resolución de ubicación por Trovan · RESPALDO, no el caso normal ──
   Sólo se llama cuando la fila de Bitácora NO trae Sala ni Tanque (ver el llamador).
   Reconstruye la ubicación siguiendo al Trovan: si hay transferencias, la vigente a la
   fecha del evento (último destino con fecha ≤ evento, o el origen del primer
   movimiento si el evento es anterior); si no las hay, la ubicación ACTUAL de la MATRIZ.
   ⚠ Ese último respaldo es el frágil: sin filas de Transferencias, un evento antiguo
   hereda la posición de HOY, que es errónea para toda hembra que se haya movido. Hoy no
   afecta a nadie —las 1970 filas traen su propio snapshot— pero el modelo cuenta cuántos
   eventos han tenido que derivarse (`derivedEvents`) para que deje de ser invisible.
   Se exporta para el cruce del tablero (F6.3, `operativo.cruce.js`): «dónde estaba la hembra ese día» tiene que
   ser la MISMA regla aquí y allí, o el cruce marcaría como discrepancia lo que esta vista da por bueno. */
export function resolveEventLocation(trovan, date, byTrovan, movByTrovan) {
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
 *   movimientos:Array, desovesByTrovan:Map, movByTrovan:Map, dataMaxDate:?Date, months:string[],
 *   duplicateTrovans:string[], futureEvents:Array, derivedEvents:number,
 *   transferRowCount:number}}
 *   `dataMaxDate` va acotada a hoy; `futureEvents` son los eventos con fecha posterior
 *   (típicamente un año mal tecleado) y `duplicateTrovans` los chips con filas en MATRIZ que no
 *   encajan en su cadena de hembras (un chip RECICLADO no es un repetido: ver ♻ más abajo).
 *   Cada hembra lleva `chip` (su Trovan ID) y `trovan` (su nombre: el chip, o chip·fecha de ingreso).
 *   `derivedEvents` = eventos sin ubicación propia que hubo que derivar por Trovan, y
 *   `transferRowCount` = filas útiles de «Maduración Transferencias». Los dos juntos
 *   dicen si la derivación está trabajando A CIEGAS (derivedEvents>0 y sin transferencias).
 */
export function buildReproModel(matrizRows, bitacoraRows, transferRows) {
  const females = [];
  const byTrovan = new Map();
  const dupSet = new Set();
  // Fechas que el Sheet trae escritas pero que el calendario no admite (día 32, 31 de
  // febrero, mes 13…). `parseAnyDate` las descarta, pero descartarlas EN SILENCIO es el
  // mismo fallo que aceptarlas mal: se recogen para avisarlo en pantalla, junto a los
  // eventos futuros y los Trovan repetidos que ya se avisaban.
  const invalidDates = [];
  const noteBadDate = (hoja, trovan, raw) => { if (raw) invalidDates.push({ hoja, trovan, fecha: String(raw) }); };
  // Eventos cuya ubicación NO venía en la fila y hubo que derivar. Medido el 2026-08-31
  // contra la hoja viva vale 0 (las 1970 filas traen su snapshot), y ése es justamente
  // el motivo de contarlo: si algún día deja de ser 0 mientras «Maduración
  // Transferencias» sigue vacía, la ubicación de esos eventos pasa a ser la posición de
  // HOY de cada hembra. Callarlo es el mismo fallo que este módulo ya evita con las
  // fechas imposibles y los Trovan repetidos.
  let derivedEvents = 0;
  /* ♻ UN CHIP, VARIOS INDIVIDUOS. Un Trovan ID es de un CHIP y la MATRIZ puede tener varios individuos suyos: desde
     el 2026-09-16 cada uno es su CUATERNA (Trovan · Piscina · Código genético · Lote), vivos o muertos, sin regla de
     fechas —la del 09-14, «sólo si la anterior murió antes de que ingresara la siguiente», se retiró con ella—. Las
     filas se agrupan por chip y se encadenan en orden de ingreso (core/trovan.js): cada eslabón es un individuo
     aparte; el último se llama como el chip y los anteriores, «chip·fecha de ingreso». Los eventos y los traslados se
     reparten por fecha (`hembraDe`). Sólo la MISMA cuaterna dos veces es un Trovan repetido: se avisa y la fila
     sobrante no se cuenta. Antes se contaba la PRIMERA fila de cada Trovan, y con un chip reutilizado la nueva habría
     heredado los desoves, el lote y el código de la anterior. */
  const todas = [];
  const filasPorChip = new Map();
  (matrizRows || []).forEach((o, pos) => {
    const trovan = normTrovan(gv(o, H.trovan));
    if (!trovan) return;
    const rawIngreso = gv(o, H.fIngreso), rawMuerte = gv(o, H.fMuerte);
    const dIngreso = parseAnyDate(rawIngreso), dMuerte = parseAnyDate(rawMuerte);
    if (rawIngreso && !dIngreso) noteBadDate('MATRIZ', trovan, rawIngreso);
    if (rawMuerte && !dMuerte) noteBadDate('MATRIZ', trovan, rawMuerte);
    const rec = {
      trovan, chip: trovan,
      numero: gv(o, H.numero), color: gv(o, H.color), piscina: gv(o, H.piscina),
      codigo: gv(o, H.codigo), lote: gv(o, H.lote),
      sala: gv(o, H.salaAct), tanque: gv(o, H.tanqueAct),
      estado: gv(o, H.estado) || ESTADO_VIVO,
      fechaMuerte: gv(o, H.fMuerte), fechaIngreso: gv(o, H.fIngreso),
      obs: gv(o, H.obs),
      _ingreso: dIngreso,
      _muerte: dMuerte,
    };
    todas.push(rec);
    if (!filasPorChip.has(trovan)) filasPorChip.set(trovan, []);
    /* `ind` = la cuaterna que IDENTIFICA al individuo (2026-09-16). Sin ella, `cadenaDelChip` no
       distingue «dos hembras distintas del mismo chip» —que desde ese día es lo normal— de «la
       misma fila repetida», que es el único duplicado de verdad. Y de eso depende el aviso de
       Trovan duplicados de esta vista: sin `ind` no avisaría NUNCA. */
    filasPorChip.get(trovan).push({ rec, pos, ingreso: dIngreso ? dayKey(dIngreso) : '', muerte: dMuerte ? dayKey(dMuerte) : '',
      muerto: rec.estado === ESTADO_MUERTO, ind: claveIndividuo(trovan, rec.piscina, rec.codigo, rec.lote) });
  });
  const cadenas = new Map();                // chip → sus hembras en orden de vida (sólo si son varias)
  const cuentan = new Set();
  filasPorChip.forEach((filas, chip) => {
    if (filas.length === 1) { cuentan.add(filas[0].rec); return; }
    const { cadena, conflictos } = cadenaDelChip(filas);
    if (conflictos.length) dupSet.add(chip);
    const ids = idsDeCadena(chip, cadena);
    cadena.forEach((f, k) => { f.rec.trovan = ids[k]; cuentan.add(f.rec); });
    if (cadena.length > 1) cadenas.set(chip, cadena);
  });
  todas.forEach((rec) => { if (cuentan.has(rec)) { byTrovan.set(rec.trovan, rec); females.push(rec); } });
  const duplicateTrovans = [...dupSet];
  /** Nombre de la hembra que llevaba el chip `chip` el día `date` (con un solo individuo, el chip).
   *  7b (2026-09-24): el día en que murió quien lo llevaba, sólo su MORTALIDAD es suya (`esMortalidad`); un desove o
   *  un traslado de ese día es de la siguiente. Ver `individuoEnFecha`. */
  const hembraDe = (chip, date, esMortalidad) => {
    const cadena = cadenas.get(chip);
    return cadena ? individuoEnFecha(cadena, date ? dayKey(date) : '', esMortalidad).rec.trovan : chip;
  };

  // Movimientos (transferencias) — se parsean ANTES de la bitácora para poder
  // derivar la ubicación de cada evento por Trovan.
  const movimientos = [];
  (transferRows || []).forEach((o) => {
    const chip = normTrovan(gv(o, H.trovan));
    const rawFecha = gv(o, H.fecha);
    const date = parseAnyDate(rawFecha);
    if (!chip) return;
    if (rawFecha && !date) noteBadDate('Transferencias', chip, rawFecha);
    movimientos.push({
      trId: gv(o, H.trId), trovan: hembraDe(chip, date, false), fecha: gv(o, H.fecha), date, tipo: gv(o, H.tipo),
      salaOrigen: gv(o, H.salaOrigen), tanqueOrigen: gv(o, H.tanqueOrigen),
      salaDestino: gv(o, H.salaDestino), tanqueDestino: gv(o, H.tanqueDestino),
    });
  });
  const movByTrovan = new Map();
  movimientos.forEach((m) => { if (!movByTrovan.has(m.trovan)) movByTrovan.set(m.trovan, []); movByTrovan.get(m.trovan).push(m); });
  movByTrovan.forEach((arr) => arr.sort((a, b) => (a.date || 0) - (b.date || 0)));

  const desoves = [], mortalidades = [];
  (bitacoraRows || []).forEach((o) => {
    const chip = normTrovan(gv(o, H.trovan));
    const tipo = gv(o, H.tipo);
    const raw = gv(o, H.fecha);
    const date = parseAnyDate(raw);
    if (!chip) return;
    if (!date) { noteBadDate('Bitácora', chip, raw); return; }
    const trovan = hembraDe(chip, date, tipo === EVENTO_MORTALIDAD);   // ♻ de qué hembra del chip es el evento
    // Ubicación del evento: manda el snapshot de la propia fila; sólo si no viene se
    // deriva por Trovan (MATRIZ + transferencias).
    // ⚠ El comentario anterior decía que la Bitácora real no trae Sala/Tanque y que
    // «el caso normal es la derivación». Medido el 2026-08-31 contra la hoja viva:
    // 1970/1970 filas traen ambas. El caso normal es ESTA línea, y la derivación es el
    // respaldo. No es código muerto: cúbrelo antes de tocarlo.
    let sala = gv(o, H.sala), tanque = gv(o, H.tanque);
    if (!sala && !tanque) {
      const loc = resolveEventLocation(trovan, date, byTrovan, movByTrovan);
      sala = loc.sala; tanque = loc.tanque;
      derivedEvents++;   // se cuenta para poder AVISAR cuando el respaldo entra en juego
    }
    // Lote y Código genético son de la HEMBRA (MATRIZ), no del evento: la Bitácora no los
    // trae. El evento los hereda para que los filtros globales de la vista lo alcancen. Un
    // Trovan que no está en la MATRIZ queda sin lote/código: cuenta sin filtro, no con él.
    const fem = byTrovan.get(trovan);
    const ev = { trovan, fecha: raw, date, sala, tanque, obs: gv(o, H.obs), lote: fem ? fem.lote : '', codigo: fem ? fem.codigo : '' };
    if (tipo === EVENTO_DESOVE) desoves.push(ev);
    else if (tipo === EVENTO_MORTALIDAD) mortalidades.push(ev);
  });
  const byDate = (a, b) => a.date - b.date;
  desoves.sort(byDate);
  mortalidades.sort(byDate);

  // Índice de desoves por Trovan.
  const desovesByTrovan = new Map();
  desoves.forEach((d) => { if (!desovesByTrovan.has(d.trovan)) desovesByTrovan.set(d.trovan, []); desovesByTrovan.get(d.trovan).push(d); });

  // Fecha máxima de los datos, ACOTADA A HOY: es la referencia de "ahora" para las
  // ventanas de actividad, y una sola fecha futura (typo de año en la Bitácora) se
  // convertía en esa referencia y arrastraba la ventana entera con ella → hembras que SÍ
  // habían desovado salían "inactivas", sin ningún aviso. Los eventos futuros se listan
  // aparte para avisarlo en pantalla en vez de corromper el cálculo en silencio.
  const hoyFin = new Date(); hoyFin.setHours(23, 59, 59, 999);
  let rawMax = null;
  const consider = (d) => { if (d && (!rawMax || d > rawMax)) rawMax = d; };
  desoves.forEach((e) => consider(e.date));
  mortalidades.forEach((e) => consider(e.date));
  movimientos.forEach((e) => consider(e.date));
  const futureEvents = desoves.concat(mortalidades, movimientos)
    .filter((e) => e.date && e.date > hoyFin)
    .sort((a, b) => a.date - b.date);
  const dataMaxDate = rawMax ? new Date(Math.min(rawMax.getTime(), hoyFin.getTime())) : null;

  // Meses presentes (de los eventos de bitácora), ascendente. Se EXCLUYEN los meses de
  // eventos futuros: si no, el stepper de período ofrecía un mes lejano (p. ej. "junio
  // 2062" por un año mal tecleado) que al seleccionarlo pintaba un panel con cifras de
  // aspecto normal. El evento sigue contando en "Todo el histórico" —no se oculta dato—
  // y el banner de `futureEvents` dice que hay que corregirlo en el Sheet.
  const monthSet = new Set();
  desoves.concat(mortalidades).forEach((e) => {
    if (e.date > hoyFin) return;
    const k = yearMonthKey(e.date); if (k) monthSet.add(k);
  });
  const months = [...monthSet].sort();

  return { females, byTrovan, desoves, mortalidades, movimientos, desovesByTrovan, movByTrovan, dataMaxDate, months, duplicateTrovans, futureEvents, invalidDates, derivedEvents, transferRowCount: movimientos.length };
}

/* ── Filtros ── */
/** ¿El evento pasa el filtro Sala/Tanque + Lote/Código + rango de fechas [from,to] (Date, opcional)? */
function passLoc(ev, f) {
  if (f.sala && String(ev.sala) !== f.sala) return false;
  if (f.tanque && String(ev.tanque) !== f.tanque) return false;
  if (f.lote && String(ev.lote) !== f.lote) return false;
  if (f.codigo && String(ev.codigo) !== f.codigo) return false;
  if (f.from && ev.date < f.from) return false;
  if (f.to && ev.date > f.to) return false;
  return true;
}
/** ¿La HEMBRA pasa el filtro? Ubicación ACTUAL (MATRIZ) + Lote/Código.
 *  Criterio ÚNICO para toda la población (KPIs, ubicación, nunca desovadas, estados, tendencias):
 *  antes cada función repetía su `(!f.sala || …) && (!f.tanque || …)`, y añadir un filtro a
 *  cinco copias es como una se queda sin él y la vista deja de cuadrar consigo misma. */
function passFem(r, f) {
  if (f.sala && String(r.sala) !== f.sala) return false;
  if (f.tanque && String(r.tanque) !== f.tanque) return false;
  if (f.lote && String(r.lote) !== f.lote) return false;
  if (f.codigo && String(r.codigo) !== f.codigo) return false;
  return true;
}
/** Rango [from,to] de un mes "yyyy-mm" (o null,null si key falsy). */
export function monthBounds(key) {
  if (!key) return { from: null, to: null };
  const [y, m] = String(key).split('-').map(Number);
  return { from: new Date(y, m - 1, 1, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59) };
}
/** Normaliza un objeto de filtro de UI a {sala,tanque,lote,codigo,from,to}. */
export function makeFilter({ sala = null, tanque = null, lote = null, codigo = null, month = null } = {}) {
  const { from, to } = monthBounds(month);
  return { sala: sala || null, tanque: tanque || null, lote: lote || null, codigo: codigo || null, from, to, month: month || null };
}

const desovesIn = (model, f) => model.desoves.filter((e) => passLoc(e, f));
const mortsIn = (model, f) => model.mortalidades.filter((e) => passLoc(e, f));

/* ── Tasa de desove (2026-09-26) ── */
/** La referencia de la tasa de desove, en % de las hembras por noche (la del tablero: `tasaDeDesove`, FAO). */
export const TASA_DESOVE_REF = { min: 5, max: 15, referencia: '5–15 % por noche' };
/** El período del filtro como [a, b] con fechas: su mes, o de la primera a la última fecha con eventos; el final nunca
 *  pasa del último dato (un mes en curso cuenta hasta hoy de los datos, no hasta su día 31). null si no hay eventos. */
function ventana(model, f) {
  const evs = model.desoves.concat(model.mortalidades);
  if (!evs.length) return null;
  let min = evs[0].date, max = evs[0].date;
  evs.forEach((e) => { if (e.date < min) min = e.date; if (e.date > max) max = e.date; });
  const a = f.from || min;
  const b = f.to && f.to < max ? f.to : max;
  return b >= a ? { a, b } : null;
}
const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Noches que una hembra estuvo VIVA dentro de la ventana: de su ingreso (o el inicio) a su muerte (o el final). */
function nochesViva(rec, v) {
  if (!v) return 0;
  const ini = rec._ingreso && rec._ingreso > v.a ? rec._ingreso : v.a;
  const fin = rec._muerte && rec._muerte < v.b ? rec._muerte : v.b;
  return fin < ini ? 0 : Math.round((dia0(fin) - dia0(ini)) / 864e5) + 1;
}
const tasa = (desoves, noches) => (noches ? (desoves / noches) * 100 : null);

/* ── KPIs globales ── */
export function kpis(model, f) {
  const des = desovesIn(model, f);
  const mor = mortsIn(model, f);
  const spawners = new Set(des.map((e) => e.trovan));
  // Población de hembras (según filtro de sala/tanque —ubicación ACTUAL en matriz— y lote/código).
  const pop = model.females.filter((r) => passFem(r, f));
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
  let fertilidadGlobal = vivas ? (vivasQueDesovaron / vivas) * 100 : 0;
  /* 2026-09-26 (usuario) · con un MES elegido, la fertilidad es la de ESE mes —la regla de Tendencias—: de las hembras
     vivas durante el mes, cuántas desovaron en él. Antes seguía siendo «alguna vez» y no cambiaba con el mes. */
  if (f.from) {
    const vivasMes = pop.filter((r) => aliveDuring(r, f.from, f.to));
    fertilidadGlobal = vivasMes.length ? (vivasMes.filter((r) => spawners.has(r.trovan)).length / vivasMes.length) * 100 : 0;
  }
  const v = ventana(model, f);
  const hembrasNoche = pop.reduce((acc, r) => acc + nochesViva(r, v), 0);
  return {
    totalHembras: pop.length, vivas, muertas,
    desoves: des.length, mortalidad: mor.length,
    spawners: spawners.size, fertilidadGlobal,
    desovesPorHembraViva: vivas ? des.length / vivas : 0,
    hembrasNoche, tasaDesove: tasa(des.length, hembrasNoche),
  };
}

/* ── T1 · Productividad por familia (2026-09-27, usuario) ── */
/** Una fila por familia (código genético o lote) con las MISMAS reglas que `kpis`: la población es la del filtro
 *  (`passFem`), la fertilidad la de siempre (con mes, la del mes), las hembras-noche y la tasa por noche de la ventana;
 *  más los desoves/hembra, los «otros» (los lotes de un código, o los códigos de un lote) y el PERÍODO en que desovó:
 *  las familias no tienen por qué ser contemporáneas. Ordenada por tasa. */
export function productividadPorFamilia(model, f, campo = 'codigo') {
  const clave = campo === 'lote' ? 'lote' : 'codigo', otro = clave === 'lote' ? 'codigo' : 'lote';
  const pop = model.females.filter((r) => passFem(r, f));
  const v = ventana(model, f), des = desovesIn(model, f);
  const alguna = new Set(model.desoves.map((e) => e.trovan)), enPeriodo = new Set(des.map((e) => e.trovan));
  const muertesDe = new Map();   // T2 · las mortalidades del período de cada hembra
  mortsIn(model, f).forEach((e) => muertesDe.set(e.trovan, (muertesDe.get(e.trovan) || 0) + 1));
  const grupos = new Map();
  const g = (k) => { if (!grupos.has(k)) grupos.set(k, { familia: k, pop: [], otros: new Set(), desoves: 0, desde: null, hasta: null }); return grupos.get(k); };
  pop.forEach((r) => { const x = g(dash(r[clave])); x.pop.push(r); if (String(r[otro] ?? '').trim()) x.otros.add(String(r[otro]).trim()); });
  const porTrovan = new Map(pop.map((r) => [r.trovan, r]));
  des.forEach((e) => {
    const r = porTrovan.get(e.trovan); if (!r) return;
    const x = g(dash(r[clave])); x.desoves++;
    if (!x.desde || e.date < x.desde) x.desde = e.date;
    if (!x.hasta || e.date > x.hasta) x.hasta = e.date;
  });
  return [...grupos.values()].map((x) => {
    const vivas = x.pop.filter((r) => r.estado !== ESTADO_MUERTO);
    let fertilidad = vivas.length ? (vivas.filter((r) => alguna.has(r.trovan)).length / vivas.length) * 100 : 0;
    if (f.from) { const vm = x.pop.filter((r) => aliveDuring(r, f.from, f.to)); fertilidad = vm.length ? (vm.filter((r) => enPeriodo.has(r.trovan)).length / vm.length) * 100 : 0; }
    const noches = x.pop.reduce((a, r) => a + nochesViva(r, v), 0);
    const mortalidad = x.pop.reduce((a, r) => a + (muertesDe.get(r.trovan) || 0), 0);
    return {
      familia: x.familia, otros: [...x.otros].sort(_ordenEs), hembras: x.pop.length, muertas: x.pop.length - vivas.length, fertilidad,
      desoves: x.desoves, desovesPorHembra: x.pop.length ? x.desoves / x.pop.length : 0, hembrasNoche: noches, tasa: tasa(x.desoves, noches),
      mortalidad, tasaMortalidad: tasa(mortalidad, noches),
      desde: x.desde ? dia0(x.desde) : null, hasta: x.hasta ? dia0(x.hasta) : null,
    };
  }).sort((a, b) => (b.tasa ?? -1) - (a.tasa ?? -1) || b.desoves - a.desoves);
}

/* ── T3 · Supervivencia Kaplan–Meier por familia (2026-09-27, usuario) ── */
/** Días desde el ingreso hasta la muerte; las vivas cuentan hasta el último dato de la granja (censuradas).
 *  S(t) = Π (1 − dᵢ/nᵢ) en cada día con muertes. Por familia (código genético o lote), con la población del filtro
 *  (`passFem`: sala/tanque/lote/código) y SIN el mes: se mide desde el ingreso. Cada curva termina en su seguimiento
 *  máximo (no se extrapola): `s15`/`s30` son null si ninguna hembra de la familia llegó a ese día. Una muerta sin fecha
 *  de muerte no se puede situar: se cuenta aparte (`sinFecha`). */
export function supervivenciaPorFamilia(model, f, campo = 'codigo') {
  const clave = campo === 'lote' ? 'lote' : 'codigo';
  const fin = model.dataMaxDate;
  const grupos = new Map();
  let sinFecha = 0;
  model.females.filter((r) => passFem(r, f) && r._ingreso).forEach((r) => {
    const muerta = r.estado === ESTADO_MUERTO;
    if (muerta && !r._muerte) { sinFecha++; return; }
    const hasta = muerta ? r._muerte : fin; if (!hasta) return;
    const t = Math.max(0, Math.round((dia0(hasta) - dia0(r._ingreso)) / 864e5));
    const k = dash(r[clave]); if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ t, muere: muerta });
  });
  const r1 = (v) => Math.round(v * 1000) / 10;
  return {
    sinFecha,
    grupos: [...grupos.entries()].sort((a, b) => _ordenEs(a[0], b[0])).map(([familia, arr]) => {
      const seguimiento = Math.max(...arr.map((x) => x.t));
      const dias = [...new Set(arr.filter((x) => x.muere).map((x) => x.t))].sort((a, b) => a - b);
      let S = 1, mediana = null;
      const puntos = [[0, 100]];
      for (const t of dias) {
        const n = arr.filter((x) => x.t >= t).length, d = arr.filter((x) => x.t === t && x.muere).length;
        S *= 1 - d / n;
        if (t === 0) puntos[0] = [0, r1(S)]; else puntos.push([t, r1(S)]);
        if (mediana == null && S <= 0.5) mediana = t;
      }
      if (puntos[puntos.length - 1][0] < seguimiento) puntos.push([seguimiento, puntos[puntos.length - 1][1]]);
      const en = (dia) => (seguimiento < dia ? null : puntos.reduce((v, [t, y]) => (t <= dia ? y : v), 100));
      return { familia, n: arr.length, muertes: arr.filter((x) => x.muere).length, seguimiento, puntos, mediana, s15: en(15), s30: en(30) };
    }),
  };
}

/* ── Producción / fertilidad por ubicación (tanque o sala) ── */
/** @param {'sala'|'tanque'|'loc'} level  agrupación: sala, tanque o Sala·Tanque. */
export function locationStats(model, f, level = 'tanque') {
  // 2026-09-26 · el tanque es sala + número (`locKey`): sólo por número se sumaban tanques de salas distintas.
  // Sin tanque, la fila «—» de siempre (eventos cuya ubicación no se pudo resolver).
  const keyOf = (o) => level === 'sala' ? dash(o.sala) : (String(o.tanque ?? '').trim() ? locKey(o.sala, o.tanque) : '—');
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
    if (!passFem(r, f)) return;
    const k = keyOf(r);
    // Sin tanque asignado NO se crea una fila fantasma... pero si la fila «—» ya existe
    // —la creó un evento cuya ubicación no se pudo resolver— hay que sumarle también estas
    // hembras. Dejarlas fuera hacía que su denominador contase solo a las que desovaron allí,
    // así que la fila salía SIEMPRE al 100 % de fertilidad (medido) y aparecía como el mejor
    // tanque del ranking. El guard sigue evitando crear la fila cuando no existe.
    if (level !== 'sala' && k === '—' && !map.has(k)) return;
    ensure(k, r).hembras.add(r.trovan);
  });
  const v = ventana(model, f);
  const porTrovan = new Map(model.females.map((r) => [r.trovan, r]));
  return [...map.values()].map((g) => {
    const hembras = g.hembras.size, spawners = g.spawners.size;
    // Hembras-noche del grupo: cada hembra UNA vez (medido: ninguna tiene eventos en dos tanques).
    let noches = 0; g.hembras.forEach((t) => { const r = porTrovan.get(t); if (r) noches += nochesViva(r, v); });
    return {
      key: g.key, sala: g.sala, tanque: g.tanque,
      desoves: g.desoves, mortalidad: g.mortalidad, hembras, spawners,
      fertilidad: hembras ? (spawners / hembras) * 100 : 0,
      eficiencia: hembras ? g.desoves / hembras : 0,
      hembrasNoche: noches, tasaDesove: tasa(g.desoves, noches),
      tasaMortalidad: tasa(g.mortalidad, noches),   // T2 (2026-09-27) · % diario: muertes ÷ hembras-noche × 100
    };
  }).sort((a, b) => b.desoves - a.desoves || b.fertilidad - a.fertilidad);
}

/* ── V1 · Mapa de salas por tasa de desove (2026-09-27, usuario) ── */
/** Las 4 bandas de la tasa por noche con la referencia 5–15 % (y «sin» = no hay hembras-noche en el período). */
export const BANDAS_TASA = [
  { clave: 'critica', etiqueta: '< 2,5 %' }, { clave: 'baja', etiqueta: '2,5–5 %' },
  { clave: 'rango', etiqueta: '5–15 % (ref.)' }, { clave: 'alta', etiqueta: '> 15 %' }, { clave: 'sin', etiqueta: 'sin hembras con chip' },
];
export function bandaTasa(v) {
  if (v == null || isNaN(v)) return 'sin';
  if (v < TASA_DESOVE_REF.min / 2) return 'critica';
  if (v < TASA_DESOVE_REF.min) return 'baja';
  return v <= TASA_DESOVE_REF.max ? 'rango' : 'alta';
}
const numTanque = (s) => { const m = /(\d+)\s*$/.exec(String(s ?? '').trim()); return m ? +m[1] : null; };
/** La planta entera: los tanques FÍSICOS de cada sala (MAD_TANQUES_POR_SALA), más los que los datos traigan fuera del
 *  catálogo, cada uno con su tasa por noche y su banda. Sigue el mes, el lote y el código del filtro pero NO la
 *  sala/tanque: el mapa es el que elige el tanque. `filtro` es el valor EXACTO de los datos que el clic pone en los
 *  filtros de la vista (null en un tanque sin hembras con chip: no hay nada que filtrar). */
export function mapaDeSalas(model, f) {
  const st = locationStats(model, { ...f, sala: null, tanque: null }, 'tanque').filter((x) => x.key !== '—');
  const porClave = new Map(st.map((x) => [String(x.sala).trim() + '|' + numTanque(x.tanque), x]));
  const salas = new Map(Object.entries(MAD_TANQUES_POR_SALA).map(([s, ts]) => [s, ts.map((n) => ({ num: n, fueraDeCatalogo: false }))]));
  for (const x of st) {
    const s = String(x.sala).trim(), n = numTanque(x.tanque); if (!s || n == null) continue;
    if (!salas.has(s)) salas.set(s, []);
    if (!salas.get(s).some((t) => t.num === n)) salas.get(s).push({ num: n, fueraDeCatalogo: true });
  }
  return [...salas.entries()].map(([sala, ts]) => ({
    sala,
    tanques: ts.sort((a, b) => a.num - b.num).map((t) => {
      const x = porClave.get(sala + '|' + t.num);
      const tasaV = x && x.hembrasNoche ? x.tasaDesove : null;
      return { num: t.num, fueraDeCatalogo: t.fueraDeCatalogo, desoves: x ? x.desoves : 0, hembras: x ? x.hembras : 0,
        hembrasNoche: x ? x.hembrasNoche : 0, tasa: tasaV, banda: bandaTasa(tasaV),
        filtro: x && x.hembrasNoche ? { sala: x.sala, tanque: x.tanque } : null };
    }),
  }));
}

/* ── 0v·4 (2026-09-29, usuario; punto 8 del plan 0t) · las hembras por su ÚLTIMO desove ── */
/* Sustituye al calendario de desoves (V2, 2026-09-27: tanque × día con el Nº de cada noche), retirado por decisión del
   usuario. Los tramos, con reglas ya medidas: la mitad central de los intervalos reales entre desoves dura de 3 a 7 días
   (T6) y la alerta de reemplazo salta pasados 21 (T5, su umbral por defecto). Los cortes, en `hembrasPorUltimoDesove`. */
export const TRAMOS_ULTIMO_DESOVE = [
  { k: 'reciente', etiqueta: '≤ 7 días' }, { k: 'medio', etiqueta: '8–21 días' },
  { k: 'antiguo', etiqueta: '> 21 días' }, { k: 'nunca', etiqueta: 'Nunca desovó' },
];
/** Las hembras VIVAS del filtro (`passFem`: su ubicación de HOY, lote y código; el mes NO: son las vivas de hoy), por su
 *  tanque, según los días desde su ÚLTIMO desove al último dato de la granja (como T5): ≤ 7 · 8–21 · > 21 · nunca desovó.
 *  Tanques en orden de sala y número; una viva sin sala o sin tanque no hace barra: se cuenta en `sinUbicacion`. */
export function hembrasPorUltimoDesove(model, f) {
  const ref = model.dataMaxDate;
  if (!ref) return { ref: null, total: 0, sinUbicacion: 0, tanques: [] };
  const hoy = dia0(ref);
  const porTanque = new Map();
  let sinUbicacion = 0;
  model.females.filter((r) => r.estado !== ESTADO_MUERTO && passFem(r, f)).forEach((r) => {
    if (!String(r.sala || '').trim() || !String(r.tanque || '').trim()) { sinUbicacion++; return; }
    const ds = model.desovesByTrovan.get(r.trovan) || [];
    const ultimo = ds.reduce((m, e) => (!m || e.date > m ? e.date : m), null);
    const dias = ultimo ? Math.round((hoy - dia0(ultimo)) / 864e5) : null;
    const key = locKey(r.sala, r.tanque);
    if (!porTanque.has(key)) porTanque.set(key, { key, sala: r.sala, tanque: r.tanque, reciente: 0, medio: 0, antiguo: 0, nunca: 0, total: 0 });
    const t = porTanque.get(key);
    t[dias == null ? 'nunca' : dias <= 7 ? 'reciente' : dias <= 21 ? 'medio' : 'antiguo']++;
    t.total++;
  });
  const tanques = [...porTanque.values()].sort((a, b) => String(a.sala).localeCompare(String(b.sala), 'es', { numeric: true }) || (numTanque(a.tanque) ?? 0) - (numTanque(b.tanque) ?? 0));
  return { ref: hoy, total: tanques.reduce((s, t) => s + t.total, 0), sinUbicacion, tanques };   // `total`: las de las barras
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
      muerte: rec._muerte || null,   // 2026-09-27 · para marcarla en el ranking con su fecha
      color: rec.color || '',   // V6 (2026-09-27) · el chip del color del anillo
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

/* ── V5 · La línea de vida de una hembra (2026-09-27, usuario) ── */
/** Del ingreso a la muerte (o al último dato de la granja si vive), en TRAMOS por ubicación: antes del primer traslado,
 *  su origen; después de cada uno, su destino; sin traslados, su ubicación de la MATRIZ (la regla de
 *  `resolveEventLocation`). Con sus desoves, sus traslados y su muerte. null si no está en la MATRIZ. */
export function lineaDeVida(model, trovan) {
  const h = femaleHistory(model, trovan);
  const r = h.rec; if (!r) return null;
  const corto = (s, t) => { const a = numTanque(s), b = numTanque(t); return (a != null ? 'S' + a : dash(s)) + '·' + (b != null ? 'T' + b : dash(t)); };
  const inicio = r._ingreso ? dia0(r._ingreso) : (h.desoves.length ? dia0(h.desoves[0].date) : null);
  if (!inicio) return null;
  const vive = r.estado !== ESTADO_MUERTO;
  const base = !vive && r._muerte ? r._muerte : (model.dataMaxDate || inicio);
  const fin = dia0(base < inicio ? inicio : base);
  const movs = h.movimientos.filter((m) => m.date && dia0(m.date) >= inicio && dia0(m.date) <= fin);
  const tramos = [];
  let desde = inicio, loc = movs.length ? [movs[0].salaOrigen, movs[0].tanqueOrigen] : [r.sala, r.tanque];
  for (const m of movs) {
    const d = dia0(m.date);
    tramos.push({ desde, hasta: d, sala: loc[0], tanque: loc[1], etiqueta: corto(loc[0], loc[1]) });
    desde = d; loc = [m.salaDestino, m.tanqueDestino];
  }
  tramos.push({ desde, hasta: fin, sala: loc[0], tanque: loc[1], etiqueta: corto(loc[0], loc[1]) });
  return {
    trovan: h.trovan, inicio, fin, vive, dias: Math.round((fin - inicio) / 864e5) + 1, tramos, desoves: h.desoves,
    traslados: movs.map((m) => ({ date: dia0(m.date), de: corto(m.salaOrigen, m.tanqueOrigen), a: corto(m.salaDestino, m.tanqueDestino) })),
    muerte: vive || !r._muerte ? null : dia0(r._muerte),
  };
}

/* ── T5 · Alerta de reemplazo (2026-09-27, usuario) ── */
/** Las hembras VIVAS del filtro (`passFem`: su ubicación actual, lote y código) que no desovan hace más de `umbral`
 *  días, o que nunca desovaron y llevan más de `umbral` días en sala; contado al último dato de la granja. Agrupadas por
 *  tanque (el que más tiene, primero; dentro, la que más lleva). `sinRegistros`: en ese tanque NADIE desovó en esos días
 *  (lo más probable, un hueco del registro, no un tanque entero sin desovar). */
export function alertaReemplazo(model, f, umbral = 21) {
  const ref = model.dataMaxDate;
  if (!ref) return { umbral, total: 0, grupos: [] };
  const hoy = dia0(ref), dias = (d) => Math.round((hoy - dia0(d)) / 864e5);
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - umbral);
  const grupos = new Map();
  model.females.filter((r) => r.estado !== ESTADO_MUERTO && passFem(r, f)).forEach((r) => {
    const ds = model.desovesByTrovan.get(r.trovan) || [];
    const ultimo = ds.reduce((m, e) => (!m || e.date > m ? e.date : m), null);
    const enSala = r._ingreso ? dias(r._ingreso) : null;
    const diasSin = ultimo ? dias(ultimo) : enSala;
    if (diasSin == null || diasSin <= umbral) return;
    const key = locKey(r.sala, r.tanque);
    if (!grupos.has(key)) grupos.set(key, { key, sala: r.sala, tanque: r.tanque, hembras: [] });
    grupos.get(key).hembras.push({ trovan: r.trovan, chip: r.chip || r.trovan, color: r.color || '', lote: r.lote || '',
      enSala, ultimo: ultimo ? dia0(ultimo) : null, diasSin, desoves: ds.length });
  });
  const lista = [...grupos.values()].map((g) => {
    g.hembras.sort((a, b) => b.diasSin - a.diasSin || _ordenEs(String(a.trovan), String(b.trovan)));
    g.sinRegistros = !model.desoves.some((e) => locKey(e.sala, e.tanque) === g.key && dia0(e.date) > desde);
    return g;
  }).sort((a, b) => b.hembras.length - a.hembras.length || _ordenEs(a.key, b.key));
  return { umbral, total: lista.reduce((s, g) => s + g.hembras.length, 0), grupos: lista };
}

/* ── Hembras que NUNCA han desovado (all-time; vivas, filtrable por ubicación) ── */
export function neverSpawned(model, f = {}) {
  const everSpawned = new Set(model.desoves.map((e) => e.trovan));
  return model.females.filter((r) => r.estado !== ESTADO_MUERTO
    && !everSpawned.has(r.trovan)
    && passFem(r, f))
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
/** 2026-09-27 (usuario) · el histograma va POR DÍA: con los tramos semanales de arriba el 78 % de los intervalos reales
 *  caía en «≤ 7 d» (medido: promedio 5,7 d, mediana 5, la mitad entre 3 y 7) y el gráfico no decía nada. Barras «≤ 1»,
 *  2 … 14 y «≥ 15». */
export const DIAS_HISTOGRAMA = 15;
/** Cuantil `p` (0–1) de una lista ORDENADA, interpolando entre vecinos: la mediana de un número par de valores es la
 *  media de los dos centrales. null si la lista está vacía. */
export function cuantil(ordenados, p) {
  if (!ordenados.length) return null;
  const pos = (ordenados.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (pos - lo);
}
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
  const orden = all.slice().sort((a, b) => a - b);
  const porDia = Array.from({ length: DIAS_HISTOGRAMA }, (_, i) => ({
    label: i === 0 ? '≤ 1' : i === DIAS_HISTOGRAMA - 1 ? '≥ ' + DIAS_HISTOGRAMA : String(i + 1), n: 0 }));
  all.forEach((v) => { porDia[Math.min(DIAS_HISTOGRAMA - 1, Math.max(0, Math.round(v) - 1))].n++; });
  return { intervals: all, bins, porDia, promedioGlobal, mediana: cuantil(orden, 0.5), p25: cuantil(orden, 0.25), p75: cuantil(orden, 0.75),
    hembrasConIntervalo: promedios.length };
}

/* ── T6 · La ventana de desove (2026-09-27, usuario) ── */
/** Retroprueba con los datos reales: «último desove + mediana» acierta el día ±1 sólo el 41 % (la mediana PROPIA de cada
 *  hembra no es mejor), así que no se da una fecha sino una VENTANA: la mitad central de los intervalos reales de TODA la
 *  granja (cuartiles, redondeados). Cada hembra VIVA del filtro con algún desove, a la PRÓXIMA noche (la siguiente al
 *  último dato): «aun» si lleva menos días que la ventana, «ventana» si está dentro, «pasada» si más. `acierto2` = % de
 *  los intervalos reales a ±2 días de la mediana (la precisión que se escribe en la tarjeta). */
export function ventanaDeDesove(model, f) {
  const rd = recoveryDistribution(model, makeFilter({}));
  const red = (v) => (v == null ? null : Math.round(v));
  const desde = red(rd.p25), hasta = red(rd.p75), mediana = red(rd.mediana);
  const acierto2 = rd.intervals.length && mediana != null
    ? Math.round((rd.intervals.filter((i) => Math.abs(i - mediana) <= 2).length / rd.intervals.length) * 1000) / 10 : null;
  const ref = model.dataMaxDate, porTrovan = new Map(), tanques = new Map();
  if (ref && desde != null) {
    const noche = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1);
    model.females.filter((r) => r.estado !== ESTADO_MUERTO && passFem(r, f)).forEach((r) => {
      const ds = model.desovesByTrovan.get(r.trovan) || []; if (!ds.length) return;
      const ult = ds.reduce((m, e) => (!m || e.date > m ? e.date : m), null);
      const dias = Math.round((noche - dia0(ult)) / 864e5);
      const estado = dias < desde ? 'aun' : dias <= hasta ? 'ventana' : 'pasada';
      porTrovan.set(r.trovan, { estado, dias });
      const key = locKey(r.sala, r.tanque);
      if (!tanques.has(key)) tanques.set(key, { key, ventana: 0, aun: 0, pasadas: 0 });
      const t = tanques.get(key);
      if (estado === 'ventana') t.ventana++; else if (estado === 'aun') t.aun++; else t.pasadas++;
    });
  }
  const tot = (t) => t.ventana + t.aun + t.pasadas;
  return { desde, hasta, mediana, acierto2, porTrovan,
    porTanque: [...tanques.values()].sort((a, b) => b.ventana - a.ventana || tot(b) - tot(a) || _ordenEs(a.key, b.key)) };
}

/* ── T7 · La mortalidad tras el desove (2026-09-27, usuario) ── */
/** ¿Mueren más en los 0–`V` días tras un desove? Para cada hembra del filtro (`passFem`) que desovó alguna vez, sus días
 *  desde el PRIMER desove hasta su muerte (o el último dato) se reparten en DENTRO (a ≤ `V` días de su último desove) y
 *  FUERA; su muerte cae en uno de los dos. Tasa diaria de cada parte y el riesgo relativo (dentro ÷ fuera). Medido con los
 *  datos reales: 0,42 con 2 días (mueren MENOS tras desovar). `nuncaDesovaron` = muertas sin ningún desove. */
export function mortalidadPostDesove(model, f, V = 2) {
  const fin = model.dataMaxDate;
  const nd = (d) => Math.round(dia0(d).getTime() / 864e5);   // el día como número entero
  let dd = 0, md = 0, df = 0, mf = 0, nunca = 0;
  const tq = new Map();
  if (fin) model.females.filter((r) => passFem(r, f)).forEach((r) => {
    const muerta = r.estado === ESTADO_MUERTO && !!r._muerte;
    const ds = [...new Set((model.desovesByTrovan.get(r.trovan) || []).map((e) => nd(e.date)))].sort((a, b) => a - b);
    if (!ds.length) { if (r.estado === ESTADO_MUERTO) nunca++; return; }
    const ultimo = muerta ? nd(r._muerte) : nd(fin);
    let k = 0;
    for (let t = ds[0]; t <= ultimo; t++) {
      while (k + 1 < ds.length && ds[k + 1] <= t) k++;
      const dentro = t - ds[k] <= V;
      if (dentro) dd++; else df++;
      if (muerta && t === ultimo) {
        if (dentro) md++; else mf++;
        const key = locKey(r.sala, r.tanque);
        if (!tq.has(key)) tq.set(key, { key, dentro: 0, fuera: 0 });
        tq.get(key)[dentro ? 'dentro' : 'fuera']++;
      }
    }
  });
  const td = tasa(md, dd), tf = tasa(mf, df);
  return {
    V, dentro: { dias: dd, muertes: md, tasa: td }, fuera: { dias: df, muertes: mf, tasa: tf },
    rr: td != null && tf ? td / tf : null, nuncaDesovaron: nunca,
    porTanque: [...tq.values()].sort((a, b) => b.dentro - a.dentro || b.fuera - a.fuera || _ordenEs(a.key, b.key)),
  };
}

/* ── T9 · Desoves y marea (2026-09-27, usuario) ── */
/** Las fases en el orden del ciclo lunar (los nombres de la hoja «Marea», INOCAR). */
export const FASES_CICLO = ['Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const numMarea = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace('%', '').replace(',', '.')); return isNaN(n) ? null : n; };
/** La hoja «Marea» por día: fase, % de iluminación, tipo (Viva/Muerta, tolerando mayúsculas) y amplitud (m). */
export function mareaPorDia(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    const d = parseAnyDate(r['Fecha']); if (!d) return;
    const t = String(r['Tipo de Marea'] || '').trim().toLowerCase();
    m.set(dayKey(d), { fase: String(r['Fase Lunar'] || '').trim(), ilum: numMarea(r['%Iluminación']),
      tipo: t.startsWith('viv') ? 'Viva' : t.startsWith('muer') ? 'Muerta' : '', amplitud: numMarea(r['Amplitud (m)']) });
  });
  return m;
}
function pearsonR(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let s = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { s += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; }
  return sx && sy ? s / Math.sqrt(sx * sy) : null;
}
/** Sólo las noches CON desoves del filtro (una noche sin ninguno es, casi siempre, un hueco del registro). La tasa de
 *  cada noche = desoves ÷ hembras del filtro vivas esa noche × 100; por grupo, Σ desoves ÷ Σ vivas. Por tipo de marea,
 *  por fase (en el orden del ciclo, también las que no tienen noches) y por día de la semana; la correlación de la tasa
 *  con la iluminación y la amplitud, y `rCrit` = 2/√n (con |r| menor, no se distingue del azar). */
export function desovesYMarea(model, marea, f) {
  const porDia = new Map();
  desovesIn(model, f).forEach((e) => { const k = dayKey(e.date); porDia.set(k, (porDia.get(k) || 0) + 1); });
  const pop = model.females.filter((r) => passFem(r, f));
  const noches = [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, des]) => {
    const a = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)), b = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59);
    return { k, d: a, des, vivas: pop.filter((r) => aliveDuring(r, a, b)).length, m: marea.get(k) || null };
  }).filter((n) => n.vivas > 0);
  const agrupa = (claves, claveDe, soloConMarea) => claves.map((k) => {
    const ns = noches.filter((n) => (!soloConMarea || n.m) && claveDe(n) === k);
    const des = ns.reduce((s, n) => s + n.des, 0), viv = ns.reduce((s, n) => s + n.vivas, 0);
    return { k, noches: ns.length, des, tasa: viv ? (des / viv) * 100 : null };
  });
  const conM = noches.filter((n) => n.m);
  const par = (campo) => { const ns = conM.filter((n) => n.m[campo] != null); return pearsonR(ns.map((n) => n.m[campo]), ns.map((n) => (n.des / n.vivas) * 100)); };
  return {
    noches: noches.length, conMarea: conM.length,
    tipo: agrupa(['Viva', 'Muerta'], (n) => n.m.tipo, true),
    fase: agrupa(FASES_CICLO, (n) => n.m.fase, true),
    dia: agrupa(DIAS_SEMANA, (n) => DIAS_SEMANA[(n.d.getDay() + 6) % 7], false),
    r: { ilum: par('ilum'), amp: par('amplitud') }, rCrit: conM.length ? 2 / Math.sqrt(conM.length) : null,
  };
}

/* ── T10 · La calidad del registro reproductivo (2026-09-27, usuario) ── */
const TROVAN_OK = /^[0-9A-F]{10}$/;
const chipDe = (t) => String(t || '').split('·')[0];
const dmaFecha = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '');
/** Las comprobaciones del registro contra sí mismo (MATRIZ ↔ Bitácora), las graves primero, y los cuatro avisos que ya
 *  existían (fechas futuras, imposibles, individuos repetidos, eventos sin ubicación). Cada una: su cuenta, su lista
 *  (Trovan, fecha, hoja, qué pasa; `abrible` si la hembra está en la MATRIZ) y qué corregir en el Sheet. NO depende de
 *  los filtros de la vista. Un Trovan con formato inválido NO se cuenta además como «huérfano»: es el mismo evento. */
export function calidadDelRegistro(model) {
  const K = (d) => (d ? dayKey(d) : '');
  const fem = (e) => model.byTrovan.get(e.trovan);
  const evs = model.desoves.map((e) => ({ ...e, tipo: EVENTO_DESOVE })).concat(model.mortalidades.map((e) => ({ ...e, tipo: EVENTO_MORTALIDAD })))
    .sort((a, b) => a.date - b.date);
  const it = (e, detalle, hoja = 'Bitácora') => ({ trovan: e.trovan, fecha: e.date || null, hoja, detalle, abrible: model.byTrovan.has(e.trovan) });
  const mortDe = new Map();
  model.mortalidades.forEach((e) => { if (!mortDe.has(e.trovan)) mortDe.set(e.trovan, []); mortDe.get(e.trovan).push(e); });
  const vistos = new Map();
  const repetidos = evs.filter((e) => { const k = e.trovan + '|' + K(e.date) + '|' + e.tipo; const n = vistos.get(k) || 0; vistos.set(k, n + 1); return n > 0; });
  const sinTraslados = !(model.transferRowCount > 0);
  const checks = [
    { clave: 'trovan-formato', titulo: 'Trovan con formato inválido', sev: 'alta', corregir: 'Reescribir el código leído del chip (10 caracteres 0-9 A-F); suele ser una fecha pegada en la columna del Trovan',
      items: evs.filter((e) => !TROVAN_OK.test(chipDe(e.trovan))).map((e) => it(e, `«${e.trovan}» no es un Trovan de 10 caracteres (0-9 A-F)`)) },
    { clave: 'huerfano', titulo: 'Eventos de un Trovan que no está en la MATRIZ', sev: 'alta', corregir: 'Verificar el código o dar de alta la hembra en la MATRIZ',
      items: evs.filter((e) => TROVAN_OK.test(chipDe(e.trovan)) && !fem(e)).map((e) => it(e, `${e.tipo} de un chip sin hembra en la MATRIZ`)) },
    { clave: 'desove-tras-muerte', titulo: 'Desoves posteriores a la muerte', sev: 'alta', corregir: 'Verificar la fecha del desove, el chip o la «Fecha muerte» de la MATRIZ',
      items: evs.filter((e) => e.tipo === EVENTO_DESOVE && fem(e) && fem(e)._muerte && K(e.date) > K(fem(e)._muerte)).map((e) => it(e, `Murió el ${dmaFecha(fem(e)._muerte)}`)) },
    { clave: 'mort-viva', titulo: 'Mortalidad con la hembra viva en la MATRIZ', sev: 'alta', corregir: 'Poner Estado = Muerto y su fecha en la MATRIZ, o anular la mortalidad',
      items: evs.filter((e) => e.tipo === EVENTO_MORTALIDAD && fem(e) && fem(e).estado !== ESTADO_MUERTO).map((e) => it(e, 'La MATRIZ la tiene «Vivo»')) },
    { clave: 'dos-mort', titulo: 'Dos mortalidades de la misma hembra', sev: 'alta', corregir: 'Eliminar la mortalidad repetida o revisar el chip',
      items: [...mortDe.values()].filter((a) => a.length > 1).flatMap((a) => a.slice().sort((x, y) => x.date - y.date).slice(1)).map((e) => it(e, 'Otra mortalidad de la misma hembra')) },
    { clave: 'futuros', titulo: 'Eventos con fecha futura', sev: 'alta', corregir: 'Corregir el año tecleado',
      items: (model.futureEvents || []).map((e) => ({ trovan: e.trovan || '', fecha: e.date || null, hoja: 'salaOrigen' in e ? 'Transferencias' : 'Bitácora', detalle: `Fecha futura: ${e.fecha}`, abrible: model.byTrovan.has(e.trovan) })) },
    { clave: 'fechas-imposibles', titulo: 'Fechas imposibles', sev: 'alta', corregir: 'Corregir la fecha (día 32, 31 de febrero, mes 13…): esas filas no se cuentan',
      items: (model.invalidDates || []).map((b) => ({ trovan: b.trovan || '', fecha: null, hoja: b.hoja, detalle: `Fecha imposible «${b.fecha}»`, abrible: model.byTrovan.has(b.trovan) })) },
    { clave: 'antes-ingreso', titulo: 'Eventos anteriores al ingreso', sev: 'media', corregir: 'Verificar la fecha del evento o la «Fecha ingreso» de la MATRIZ',
      items: evs.filter((e) => fem(e) && fem(e)._ingreso && K(e.date) < K(fem(e)._ingreso)).map((e) => it(e, `Ingresó el ${dmaFecha(fem(e)._ingreso)}`)) },
    { clave: 'mort-fecha', titulo: 'Mortalidad en fecha distinta de la «Fecha muerte»', sev: 'media', corregir: 'Igualar la fecha de la mortalidad y la «Fecha muerte» de la MATRIZ',
      items: evs.filter((e) => e.tipo === EVENTO_MORTALIDAD && fem(e) && fem(e).estado === ESTADO_MUERTO && fem(e)._muerte && K(e.date) !== K(fem(e)._muerte)).map((e) => it(e, `La MATRIZ dice ${dmaFecha(fem(e)._muerte)}`)) },
    { clave: 'sin-mort', titulo: 'Muerta sin su mortalidad en la Bitácora', sev: 'media', corregir: 'Registrar la mortalidad en la Bitácora (o revisar el Estado de la MATRIZ)',
      items: model.females.filter((r) => r.estado === ESTADO_MUERTO && !mortDe.has(r.trovan)).map((r) => ({ trovan: r.trovan, fecha: r._muerte || null, hoja: 'MATRIZ', detalle: 'Muerta en la MATRIZ sin mortalidad en la Bitácora', abrible: true })) },
    { clave: 'duplicado', titulo: 'Eventos repetidos el mismo día', sev: 'media', corregir: 'Eliminar la fila repetida de la Bitácora',
      items: repetidos.map((e) => it(e, `${e.tipo} repetido el mismo día`)) },
    { clave: 'chips-repetidos', titulo: 'Individuos repetidos en la MATRIZ', sev: 'media', corregir: 'Eliminar la fila sobrante (misma piscina, código genético y lote)',
      items: (model.duplicateTrovans || []).map((t) => ({ trovan: t, fecha: null, hoja: 'MATRIZ', detalle: 'La misma cuaterna dos veces: la fila sobrante no se cuenta', abrible: model.byTrovan.has(t) })) },
    { clave: 'derivados', titulo: 'Eventos sin Sala/Tanque ni traslados para situarlos', sev: 'media', corregir: 'Registrar los traslados en Registros → Maduración → Reproductivo',
      items: [], cuenta: model.derivedEvents > 0 && sinTraslados ? model.derivedEvents : 0 },
  ].map((c) => ({ ...c, cuenta: c.cuenta ?? c.items.length }));
  return { checks, total: checks.reduce((s, c) => s + c.cuenta, 0) };
}

/* ── Clasificación de hembras (activa/inactiva/transferida/fallecida) ── */
export function classifyFemale(rec, model, ref) {
  if (!rec) return 'inactiva';
  if (rec.estado === ESTADO_MUERTO) return 'fallecida';
  const winStart = ref ? new Date(ref.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS) : null;
  // Activa: desove dentro de la ventana. Se comprueba ANTES que "transferida" porque
  // PRODUCIR pesa más que ser reubicada: una hembra que desovó hace días y además fue
  // movida sigue siendo productiva, y antes se contabilizaba como "transferida" (su
  // desove desaparecía del recuento de activas). 'transferida' queda para las reubicadas
  // que NO han desovado en la ventana.
  const des = model.desovesByTrovan.get(rec.trovan);
  if (winStart && des && des.some((e) => e.date >= winStart)) return 'activa';
  // Transferida reciente: último movimiento dentro de la ventana.
  const mov = model.movByTrovan.get(rec.trovan);
  if (winStart && mov && mov.length) {
    const last = mov[mov.length - 1];
    if (last.date && last.date >= winStart) return 'transferida';
  }
  return 'inactiva';
}
/** Distribución de estados de la población (filtrable por ubicación actual). */
export function stateDistribution(model, f = {}) {
  const ref = model.dataMaxDate;
  const counts = { activa: 0, inactiva: 0, transferida: 0, fallecida: 0 };
  model.females.forEach((r) => {
    if (!passFem(r, f)) return;
    counts[classifyFemale(r, model, ref)]++;
  });
  return counts;
}

/* ── Mortalidad por sala y por tanque (eventos de bitácora, snapshot) ── */
export function mortalityBreakdown(model, f) {
  const bySala = new Map(), byTanque = new Map();
  const morts = mortsIn(model, f);   // una sola pasada (antes se filtraba dos veces)
  morts.forEach((e) => {
    bySala.set(dash(e.sala), (bySala.get(dash(e.sala)) || 0) + 1);
    byTanque.set(locKey(e.sala, e.tanque), (byTanque.get(locKey(e.sala, e.tanque)) || 0) + 1);
  });
  const toArr = (m) => [...m.entries()].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n);
  return { total: morts.length, porSala: toArr(bySala), porTanque: toArr(byTanque) };
}

/* ── Tendencias temporales (granularidad adaptativa) ── */
/** ¿Está viva la hembra durante [start,end]? (ingreso ≤ end y sin muerte previa a start).
 *  Una hembra marcada como muerta SIN fecha de muerte cuenta como presente en todos los
 *  buckets: no hay con qué acotarla. (Había una rama explícita para ese caso que devolvía
 *  `true`, exactamente igual que este `return` por defecto: se evaluaba y se descartaba.) */
function aliveDuring(rec, start, end) {
  if (rec._ingreso && rec._ingreso > end) return false;        // aún no ingresaba
  if (rec._muerte && rec._muerte < start) return false;        // ya había muerto
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
  // Población filtrada por ubicación actual y lote/código (para "vivas durante el bucket").
  const pop = model.females.filter((r) => passFem(r, f));
  // Reparto de eventos por CLAVE de bucket en UNA sola pasada. Antes se recorrían los
  // eventos TRES veces por bucket (desoves, mortalidades y otra vez desoves para contar
  // desovadoras distintas): con 30.000 eventos y 72 buckets son ~6,5 M de comparaciones
  // de fecha por repintado (medido: 1.511 ms por llamada).
  const keyOf = granularity === 'day' ? dayKey : yearMonthKey;
  const slots = new Map();
  buckets.forEach((b) => slots.set(b.key, { d: 0, m: 0, spawners: new Set() }));
  des.forEach((e) => { const s = slots.get(keyOf(e.date)); if (s) { s.d++; s.spawners.add(e.trovan); } });
  mor.forEach((e) => { const s = slots.get(keyOf(e.date)); if (s) s.m++; });

  const desoves = [], mortalidad = [], fertilidad = [];
  buckets.forEach((b) => {
    const s = slots.get(b.key);
    // Vivas de la ubicación ACTUAL presentes durante el bucket (denominador).
    const aliveSet = new Set();
    pop.forEach((r) => { if (aliveDuring(r, b.start, b.stop)) aliveSet.add(r.trovan); });
    // Numerador acotado a la INTERSECCIÓN desovadoras ∩ vivas de la ubicación: las
    // desovadoras salen del snapshot del evento (dónde desovaron) mientras que el
    // denominador es la ubicación ACTUAL, así que sin intersección una hembra que desovó
    // aquí y luego se trasladó contaba arriba pero no abajo → fertilidad > 100 %
    // (medido: 300 %). Sin traslados el resultado NO cambia: la desovadora está en `pop`
    // y viva durante el bucket en el que desovó.
    let spawners = 0;
    s.spawners.forEach((t) => { if (aliveSet.has(t)) spawners++; });
    desoves.push(s.d); mortalidad.push(s.m);
    fertilidad.push(aliveSet.size ? +((spawners / aliveSet.size) * 100).toFixed(1) : 0);
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
const _ordenEs = (a, b) => a.localeCompare(b, 'es', { numeric: true });
/** Lotes presentes en la MATRIZ (el lote es de la hembra, no del evento). */
export function lotesOf(model) {
  const set = new Set();
  model.females.forEach((r) => { if (r.lote) set.add(String(r.lote)); });
  return [...set].sort(_ordenEs);
}
/** Códigos genéticos presentes en la MATRIZ; con `lote`, sólo los de ese lote (cascada). */
export function codigosOf(model, lote) {
  const set = new Set();
  model.females.forEach((r) => { if (r.codigo && (!lote || String(r.lote) === lote)) set.add(String(r.codigo)); });
  return [...set].sort(_ordenEs);
}
export function tanquesOf(model, sala) {
  const set = new Set();
  const okF = (v) => (!sala || String(v.sala) === sala);
  model.females.forEach((r) => { if (r.tanque && okF(r)) set.add(String(r.tanque)); });
  model.desoves.concat(model.mortalidades).forEach((e) => { if (e.tanque && okF(e)) set.add(String(e.tanque)); });
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}
