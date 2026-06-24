/* ============================================================
   REGISTROS · esquema de la ficha "Despacho" (despacho)
   Modelo PURO extraído de renderDespacho() del monolito.

   data: cabecera (fecha, hora, corrida) + por tanque i:
     e, po(miles), sv(auto si CS), pgm, pg, dc(computado), bm(computado),
     cj, de(select Destino), ps(piscina) + pie tec.
   Destino usa DESTINO_OPTS (lo pasa el motor en runtime). sv/dc/bm son auto.
   ============================================================ */

/** Cabecera (Fecha, Hora, Corrida). */
export const DESPACHO_HEADER = [
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'hora', label: 'Hora', type: 'time' },
  { name: 'corrida', label: 'Corrida', type: 'text', placeholder: 'Ej. 552' },
];

/** Columnas por tanque (orden visual). `kind` decide el render. */
export const DESPACHO_COLUMNS = [
  { code: 'e', label: 'Estadío', kind: 'estadio' },
  { code: 'po', label: 'Población (miles)', kind: 'number', placeholder: 'miles', recalc: 'po' },
  { code: 'sv', label: '% Superv.', kind: 'sv' },
  { code: 'pgm', label: 'PLG (manual)', kind: 'number', step: 0.001, placeholder: '0.000', recalc: 'pgm' },
  { code: 'pg', label: 'PL / Gramo', kind: 'number', step: 0.001, placeholder: '0.000' },
  { code: 'dc', label: 'Densidad cosechada', kind: 'computed', title: 'Calculado: Población ÷ Toneladas (TON)' },
  { code: 'bm', label: 'Biomasa', kind: 'computed', title: 'Calculado: Población (×1000) ÷ PLG (manual)' },
  { code: 'cj', label: 'Cajas/Tinas', kind: 'number', step: 1, min: 0, placeholder: '0' },
  { code: 'de', label: 'Destino', kind: 'destino' },
  { code: 'ps', label: 'Piscina', kind: 'piscina', placeholder: '55 ó 55-60' },
];

/** Construye el nombre de campo por tanque: ('dc', 3) → 'dc_3'. */
export function fieldName(code, tank) {
  return `${code}_${tank}`;
}

/** Nº de tanques con Toneladas (TON) cargadas. */
export function tonCount(ton) {
  return Object.keys(ton || {}).filter(
    (k) => k.startsWith('ton_') && ton[k] !== '' && ton[k] !== null && ton[k] !== undefined,
  ).length;
}
