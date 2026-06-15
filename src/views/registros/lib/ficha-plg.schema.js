/* ============================================================
   REGISTROS · esquema de la ficha "PL Gramo Externo" (plg)
   Modelo de datos PURO extraído de renderPlg() del monolito.

   Estructura del objeto `data`:
     - cabecera: fecha, corrida, siembra
     - por tanque i (0..TQS-1): lt_i (lote), e_i (estadio), pg_i (PL/gramo), pgm_i (manual)
     - pie: tec
   Campos pg/pgm: numéricos, step 0.001. lote/estadio: texto en mayúsculas.
   ============================================================ */

/** Campos de cabecera (orden del monolito: Fecha, Corrida, N° Siembra). */
export const PLG_HEADER = [
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'corrida', label: 'Corrida', type: 'text', placeholder: 'Ej. 552' },
  { name: 'siembra', label: 'N° Siembra', type: 'text', placeholder: '1' },
];

/** Columnas por tanque (orden visual de la tabla). */
export const PLG_COLUMNS = [
  { code: 'lt', label: 'Lote', type: 'text', upper: true, placeholder: 'Lote' },
  { code: 'e', label: 'Estadio', type: 'text', upper: true, placeholder: 'PL12…' },
  { code: 'pg', label: 'PL / Gramo', type: 'number', step: 0.001, placeholder: '0.000' },
  { code: 'pgm', label: 'Plg (manual)', type: 'number', step: 0.001, placeholder: '0.000' },
];

/** Construye el nombre de campo por tanque: ('pg', 3) → 'pg_3'. */
export function fieldName(code, tank) {
  return `${code}_${tank}`;
}
