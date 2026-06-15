/* ============================================================
   REGISTROS · esquema de la ficha "Desinfección" (desinfeccion)
   Modelo PURO extraído de renderDesinfeccion() del monolito.

   Estructura particular: la ficha se organiza por TIPOS de registro
   (DESINF_TYPES) → categorías → elementos, que el motor pasa en runtime junto
   con el generador de tablas `_dxCatTable`. El esquema nativo solo cubre la
   cabecera; el resto se reutiliza del motor (igual que el widget de color).

   data: cabecera (fecha, corrida) + _tipo (tipo activo) +
     por elemento: dx_<n>_<cat>_<idx>_{estado,obs,fec,nom} + dx_<n>_obsgen.
   SIN técnico (esta ficha no lo registra).
   ============================================================ */

/** Cabecera editable (Fecha + Corrida; el Tipo es un select aparte). */
export const DESINF_HEADER = [
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'corrida', label: 'Corrida', type: 'text', placeholder: 'Ej. 552' },
];
