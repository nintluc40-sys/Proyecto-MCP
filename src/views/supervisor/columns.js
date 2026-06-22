/* ============================================================
   SUPERVISOR · constantes compartidas de columnas y orden
   Centraliza variantes de cabecera y comparadores que antes estaban
   duplicados en varias sub-vistas (stats, prodOmarsa, despacho, omtex,
   larvia, compareTanks). Un solo lugar que tocar si cambia el Sheet.
   ============================================================ */

// Variantes de la columna PL/g (análisis biométrico / Larvicultura).
export const PLG_KEYS = ['PLG', 'Plg', 'plg', 'PL/g', 'pl/g'];

// Variantes de la columna PL/g (manual) de cosecha.
export const PLGM_KEYS = ['Plg (manual)', 'PLG (manual)', 'plg (manual)', 'Plg(manual)', 'PL/g (manual)', 'pl/g (manual)'];

/** Orden natural: por el primer número embebido y, si empata, alfabético.
 *  (p.ej. "TQ2" < "TQ10"; "M03" < "M9"). */
export const natCmp = (a, b) => {
  const x = String(a).match(/\d+/), y = String(b).match(/\d+/);
  return (x && y && +x[0] !== +y[0]) ? +x[0] - +y[0] : String(a).localeCompare(String(b));
};
