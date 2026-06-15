/* ============================================================
   REGISTROS · esquema de la ficha "Calidad de Agua" (calagua)
   Modelo PURO extraído de renderCalidadAgua() del monolito.

   data: cabecera (fecha, corrida, siembra) + por tanque i:
     e_i (estadio), cm_i (Cel/ml), tr_i (Color), ep_i (%Espuma),
     sc_i (%Suciedad), rc_i (%Recambio), ob_i (Observación) + pie tec.
   La columna Color reutiliza el widget del motor (aguaColorSelectHtml).
   ============================================================ */

/** Cabecera (orden del monolito: Fecha, Corrida, N° Siembra). */
export const CALAGUA_HEADER = [
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'corrida', label: 'Corrida', type: 'text', placeholder: 'Ej. 552' },
  { name: 'siembra', label: 'N° Siembra', type: 'text', placeholder: '1' },
];

/** Columnas por tanque (orden visual). `kind` decide cómo se renderiza. */
export const CALAGUA_COLUMNS = [
  { code: 'e', label: 'Estadío', kind: 'estadio' },
  { code: 'cm', label: 'Cel/ml', kind: 'number', step: 1, placeholder: 'Cel/ml' },
  { code: 'tr', label: 'Color', kind: 'color' },
  { code: 'ep', label: '% Espuma', kind: 'number', min: 0, max: 100, step: 0.1, placeholder: '%' },
  { code: 'sc', label: '% Suciedad', kind: 'number', min: 0, max: 100, step: 0.1, placeholder: '%' },
  { code: 'rc', label: '% Recambio', kind: 'number', min: 0, max: 100, step: 0.1, placeholder: '%' },
  { code: 'ob', label: 'Observaciones', kind: 'text', placeholder: 'Observación del tanque' },
];

/** Construye el nombre de campo por tanque: ('cm', 3) → 'cm_3'. */
export function fieldName(code, tank) {
  return `${code}_${tank}`;
}
