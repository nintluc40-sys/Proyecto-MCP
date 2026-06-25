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

/** Porcentaje con 1 decimal; "—" para no numérico. */
export function fmtPct(v) {
  return (v === null || v === undefined || isNaN(v)) ? '—' : v.toFixed(1) + '%';
}
