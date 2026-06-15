/* ============================================================
   REGISTROS · esquema de la ficha "Parámetros" (params)
   Modelo PURO extraído de renderParams() del monolito.

   Estructura del objeto `data`:
     - cabecera: fecha, corrida, estadio
     - por tanque i × horario t: od_<i>_<t> (OD) y tc_<i>_<t> (°C)
     - pie: obs (observaciones), tec
   Los horarios (PTIMES) los pasa el motor en runtime (no se espejan aquí para
   evitar drift); DEFAULT_PTIMES es solo un fallback/los de hoy.
   ============================================================ */

/** Campos de cabecera (orden del monolito: Fecha, Corrida, Estadío). */
export const PARAMS_HEADER = [
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'corrida', label: 'Corrida', type: 'text', placeholder: 'Ej. 552' },
  { name: 'estadio', label: 'Estadío', type: 'text', upper: true, placeholder: 'Ej. PL1' },
];

/** Métricas por celda (orden visual: OD luego °C) con sus rangos de alerta. */
export const PARAMS_METRICS = [
  { code: 'od', label: 'OD', min: 3, max: 10 },
  { code: 'tc', label: '°C', min: 20, max: 40 },
];

/** Horarios por defecto (espejo de PTIMES; el motor pasa la lista autoritativa). */
export const DEFAULT_PTIMES = [
  '02:00', '04:00', '06:00', '08:00', '10:00', '12:00',
  '14:00', '16:00', '18:00', '20:00', '22:00', '00:00',
];

/** Nombre de campo: ('od', 0, '02:00') → 'od_0_02:00'. */
export function fieldName(code, tank, time) {
  return `${code}_${tank}_${time}`;
}
