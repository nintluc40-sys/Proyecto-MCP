/* ============================================================
   UTILIDADES PURAS compartidas (sin DOM)
   Consolidan helpers que estaban reimplementados en varias vistas
   (avg, natCmp, fmtPct). Comportamiento idéntico al de esas copias.
   ============================================================ */

/** Promedio numérico; ignora null/undefined/NaN. null si no queda ningún valor.
 *  Superset seguro de las variantes por-vista (las que no filtraban recibían
 *  arrays ya filtrados, así que el resultado no cambia). */
export function avg(arr) {
  const v = (arr || []).filter((x) => x !== null && x !== undefined && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Orden natural: por el primer número embebido y, si empata, alfabético.
 *  (p.ej. "TQ2" < "TQ10"; "M03" < "M9"). */
export function natCmp(a, b) {
  const x = String(a).match(/\d+/), y = String(b).match(/\d+/);
  return (x && y && +x[0] !== +y[0]) ? +x[0] - +y[0] : String(a).localeCompare(String(b));
}

/** Orden natural con desempate por collation español-numérica (`'es', {numeric}`).
 *  Igual que natCmp salvo el criterio de desempate alfabético. */
export function natCmpEs(a, b) {
  const ra = String(a).match(/\d+/), rb = String(b).match(/\d+/);
  if (ra && rb && +ra[0] !== +rb[0]) return +ra[0] - +rb[0];
  return String(a).localeCompare(String(b), 'es', { numeric: true });
}

/** Porcentaje con 1 decimal; "—" para no numérico. */
export function fmtPct(v) {
  return (v === null || v === undefined || isNaN(v)) ? '—' : v.toFixed(1) + '%';
}

/** Claves que NUNCA deben usarse como nombre al fusionar datos externos en un objeto.
 *  `JSON.parse` crea "__proto__" como propiedad PROPIA (no invoca el setter), pero la
 *  ASIGNACIÓN posterior `destino[k] = …` SÍ lo invoca y cambia el prototipo del destino.
 *  Sin este guard, un override de localStorage podía inyectar entradas que nadie configuró
 *  —y, cuando la fusión tiene dos niveles, escribir directamente en `Object.prototype`,
 *  afectando a toda la app. Úsalo en cualquier merge de datos que vengan de fuera. */
export const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];
export const isUnsafeKey = (k) => UNSAFE_KEYS.includes(k);
