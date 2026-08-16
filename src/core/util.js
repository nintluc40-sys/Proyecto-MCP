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

/** Coeficiente de correlación de Pearson sobre pares [x, y]. DEFINICIÓN ÚNICA.
 *
 *  Vivían dos copias equivalentes —`views/supervisor/mareas.js` (correlación marea ↔
 *  laboratorio) y `views/supervisor/compareTanks.js` (comparativa A vs B)—, escritas con
 *  fórmulas distintas: una por sumas de cuadrados y otra por desviaciones respecto a la
 *  media. Daban el mismo número, así que no había defecto, pero es el patrón que en este
 *  proyecto ya salió caro dos veces (las dos `normTrovan` que sí divergían y las cuatro
 *  copias de la banda del WQI). Se conserva la forma por DESVIACIONES, numéricamente más
 *  estable: restar la media antes de acumular evita la cancelación catastrófica que sufre
 *  `n·Σxy − Σx·Σy` cuando los valores son grandes y su varianza pequeña.
 *
 *  Devuelve null con menos de 2 pares o si alguna de las series no tiene varianza
 *  (una recta horizontal no correlaciona con nada: el denominador sería 0).
 */
export function pearson(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  const ma = pairs.reduce((s, p) => s + p[0], 0) / n;
  const mb = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, da = 0, db = 0;
  pairs.forEach(([a, b]) => { const u = a - ma, v = b - mb; num += u * v; da += u * u; db += v * v; });
  return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : null;
}

/** Claves que NUNCA deben usarse como nombre al fusionar datos externos en un objeto.
 *  `JSON.parse` crea "__proto__" como propiedad PROPIA (no invoca el setter), pero la
 *  ASIGNACIÓN posterior `destino[k] = …` SÍ lo invoca y cambia el prototipo del destino.
 *  Sin este guard, un override de localStorage podía inyectar entradas que nadie configuró
 *  —y, cuando la fusión tiene dos niveles, escribir directamente en `Object.prototype`,
 *  afectando a toda la app. Úsalo en cualquier merge de datos que vengan de fuera. */
export const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];
export const isUnsafeKey = (k) => UNSAFE_KEYS.includes(k);
