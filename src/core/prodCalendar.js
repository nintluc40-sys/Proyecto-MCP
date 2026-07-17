/* ============================================================
   CALENDARIO DE PRODUCCIÓN (corrida → mes) — capa pura, sin DOM
   Define el "mes interno" como un rango contiguo de corridas y agrega por
   módulo+corrida la siembra/cosecha/PL-g/supervivencia. Compartido por las
   vistas Supervisor, Larvicultura, Revisiones, Algas, Microbiología y
   Visitante (antes vivía en views/supervisor/prodOmarsa.js, lo que acoplaba
   5 vistas a un módulo de otra vista).

   Agregación por tanque del módulo+corrida:
     · Siembra  = Σ primera población REAL (>0) de cada tanque
     · Cosecha  = Σ última población registrada de cada tanque (honra el 0)
     · PL/g (manual) = promedio del último PL/g manual de cada tanque
     · Supervivencia = Σ última pob. / Σ primera pob. × 100

   Mes interno definido por su corrida inicial (editar MESES_PROD).
   ============================================================ */
import { store } from './store.js';
import { getField, parseNum, F, isLarviculturaRow, PLGM_KEYS } from './fields.js';
import { parseAnyDate } from './dates.js';
import { natCmp } from './util.js';

// ▼▼ EDITAR AQUÍ al iniciar un mes nuevo: añade { label, desde: <corrida inicial> } ▼▼
// (la corrida inicial es la de los módulos 6-7; el mes cierra con la de los módulos 9-10).
const MESES_PROD = [
  { label: 'Enero',   desde: 544 },
  { label: 'Febrero', desde: 549 },
  { label: 'Marzo',   desde: 555 },
  { label: 'Abril',   desde: 561 },
  { label: 'Mayo',    desde: 567 },
  { label: 'Junio',   desde: 573 },
];

// Auto-extensión de meses: a partir del último mes definido en MESES_PROD, los
// meses siguientes se generan automáticamente cada MONTH_SPAN corridas (patrón
// observado: +6). Así un mes nuevo (p. ej. Julio = 579) NO cae dentro del anterior
// sin tener que editar MESES_PROD. Si el patrón cambia, basta fijar el mes en MESES_PROD.
const MONTH_SPAN = 6;
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const larvRows = () => store.globalData.filter(isLarviculturaRow);
const distinct = (a) => [...new Set(a.filter(Boolean))];

// Señal de "despacho" de la ficha de Despacho (hoja "Datos Larvicultura"): una fila
// cuenta como despachada si trae dato en alguna de estas columnas de cosecha/salida.
// Mismo conjunto que el badge "Despachado" de la Vista Ejecutiva y la vista Despacho
// (NO incluye "Piscina": la asignación de piscina por sí sola no implica cosecha).
const DESPACHO_COLS = [
  ['Densidad cosechada', 'Densidad Cosechada', 'densidad cosechada'],
  ['Biomasa', 'biomasa'],
  ['Cajas/Tinas', 'Cajas / Tinas', 'cajas/tinas', 'Cajas-Tinas'],
  ['Destino', 'destino'],
];
export const isDespachoRow = (r) => DESPACHO_COLS.some((names) => getField(r, names) !== '');

// Tanque fuera de despacho: el operador anota "Agrupado"/"Descartado" en Observaciones
// (se unió a otro tanque o se perdió) → no llega al despacho, así que no cuenta para
// exigir la completitud del despacho de la corrida.
const OBS_KEYS = ['Observaciones', 'observaciones', 'Observación', 'observación'];
const isOutOfDispatchRow = (r) => /agrupad|descartad/i.test(getField(r, OBS_KEYS));

/** ¿El módulo+corrida está COMPLETAMENTE despachado? = existe ≥1 tanque real (no
 *  agrupado/descartado) y TODOS los tanques reales tienen ≥1 fila con datos de la
 *  ficha de Despacho. Fuente ÚNICA del estado "Despachado" (badge de la Vista Ejecutiva
 *  y "Subtotal actual" de Producción Omarsa), para que no se contradigan entre sí. */
function fullyDispatched(rsAll) {
  const tanks = distinct(rsAll.map((r) => getField(r, F.tanque)));
  const tankRows = (tq) => rsAll.filter((r) => getField(r, F.tanque) === tq);
  const realTanks = tanks.filter((tq) => !tankRows(tq).some(isOutOfDispatchRow));
  return realTanks.length > 0 && realTanks.every((tq) => tankRows(tq).some(isDespachoRow));
}
export function modCorDispatched(mod, cor) {
  return fullyDispatched(larvRows().filter((r) => getField(r, F.modulo) === mod && getField(r, F.corrida) === cor));
}

export function monthIndexOfCorrida(num) {
  if (isNaN(num)) return -1;
  let idx = -1;
  for (let i = 0; i < MESES_PROD.length; i++) if (num >= MESES_PROD[i].desde) idx = i;
  if (idx < 0) return -1;
  // Más allá del último mes definido → meses virtuales cada MONTH_SPAN corridas.
  if (idx === MESES_PROD.length - 1) {
    const extra = Math.floor((num - MESES_PROD[idx].desde) / MONTH_SPAN);
    if (extra > 0) return idx + extra;
  }
  return idx;
}

/** Índices de meses (en MESES_PROD) con datos, de viejo a reciente. */
export function presentMonths() {
  const present = new Set();
  larvRows().forEach((r) => { const n = +getField(r, F.corrida); if (!isNaN(n)) { const i = monthIndexOfCorrida(n); if (i >= 0) present.add(i); } });
  return [...present].sort((a, b) => a - b);
}

/** Corridas (con datos) del mes, ordenadas ascendente. */
export function corridasOfMonth(mIdx) {
  const set = new Set();
  larvRows().forEach((r) => { const c = getField(r, F.corrida), n = +c; if (!isNaN(n) && monthIndexOfCorrida(n) === mIdx) set.add(c); });
  return [...set].sort((a, b) => (+a) - (+b));
}

/** Módulos (con datos) de una corrida, en orden natural. */
export function modulesOfCorrida(cor) {
  return distinct(larvRows().filter((r) => getField(r, F.corrida) === cor).map((r) => getField(r, F.modulo))).sort(natCmp);
}

/** Etiqueta del mes. Para meses virtuales (auto-extensión) continúa la secuencia
 *  de nombres desde el último mes definido (Junio → Julio → … → Diciembre → Enero). */
export function monthLabelAt(mIdx) {
  if (MESES_PROD[mIdx]) return MESES_PROD[mIdx].label;
  const lastIdx = MESES_PROD.length - 1;
  const lastNameIdx = MONTH_NAMES.indexOf(MESES_PROD[lastIdx].label);
  if (lastNameIdx < 0 || mIdx < 0) return `Mes ${mIdx + 1}`;
  return MONTH_NAMES[(lastNameIdx + (mIdx - lastIdx)) % 12];
}

/** Agrega por tanque la siembra/cosecha/PL-g/supervivencia de un módulo+corrida. */
export function modCorStats(mod, cor) {
  const rsAll = larvRows().filter((r) => getField(r, F.modulo) === mod && getField(r, F.corrida) === cor);
  const tanks = distinct(rsAll.map((r) => getField(r, F.tanque)));
  let firstSum = 0, lastSum = 0, hasFirst = false, hasLast = false, nSie = 0; const plgs = [];
  tanks.forEach((tq) => {
    const rs = rsAll.filter((r) => getField(r, F.tanque) === tq)
      .sort((a, b) => (parseAnyDate(getField(a, F.fecha)) || 0) - (parseAnyDate(getField(b, F.fecha)) || 0));
    let first = null, last = null, plg = null;
    // Siembra = primera población REAL (>0). Cosecha = última población registrada,
    // honrando el 0 (tanque vaciado/agrupado): así no se arrastra el valor anterior.
    rs.forEach((r) => { const p = parseNum(r, F.poblacion); if (p === null || p < 0) return; if (p > 0 && first === null) first = p; last = p; });
    for (let i = rs.length - 1; i >= 0; i--) { const v = parseNum(rs[i], PLGM_KEYS); if (v !== null && v > 0) { plg = v; break; } }
    if (first !== null) { firstSum += first; hasFirst = true; nSie++; }
    if (last !== null) { lastSum += last; hasLast = true; }
    if (plg !== null) plgs.push(plg);
  });
  const siembra = hasFirst ? firstSum : null;
  const cosecha = hasLast ? lastSum : null;
  const plg = plgs.length ? plgs.reduce((a, b) => a + b, 0) / plgs.length : null;
  // cosecha === 0 es válido (tanque vaciado/agrupado) → superv 0, no null.
  const superv = (siembra !== null && siembra > 0 && cosecha !== null) ? Math.min(cosecha / siembra * 100, 100) : null;
  // despachado = el módulo+corrida ya tiene ≥1 registro con datos de la ficha de Despacho.
  const despachado = rsAll.some(isDespachoRow);
  // despachadoFull = TODOS los tanques reales despachados (mismo criterio que el badge
  // "Despachado" de las tarjetas); es el que usa el "Subtotal actual" de Prod. Omarsa.
  const despachadoFull = fullyDispatched(rsAll);
  // nSie = nº de tanques con siembra (para la densidad de siembra promedio por tanque).
  return { siembra, cosecha, plg, superv, nSie, despachado, despachadoFull };
}
