/* ============================================================
   REGISTROS · esquema de la ficha "Población" (poblacion)
   Modelo PURO extraído de renderPoblacion() del monolito.

   data: cabecera (fecha, hora, corrida, siembra; cta es computado) +
         por tanque i: sv_i, po_i, lt_i, e_i, sal_i +
         computados (total_p, sobrev, mort_d) + obs + tec.
   Población se ingresa "en miles" (×1000). sv puede ser auto (desde CS).
   ============================================================ */

/** Cabecera editable (cta se calcula desde CS, se trata aparte). */
export const POBLACION_HEADER = [
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'hora', label: 'Hora', type: 'time' },
  { name: 'corrida', label: 'Corrida', type: 'text', placeholder: 'Ej. 552' },
  { name: 'siembra', label: 'N° Siembra', type: 'text', placeholder: '1' },
];

/** Columnas por tanque (orden visual). sv tiene modo auto (readonly desde CS). */
export const POBLACION_COLUMNS = [
  { code: 'sv', label: '% Supervivencia' },
  { code: 'po', label: 'Población', feedsTotal: true },
  { code: 'lt', label: 'Lote', text: true },
  { code: 'e', label: 'Estadío', text: true },
  { code: 'sal', label: 'Salinidad' },
];

/** Construye el nombre de campo por tanque: ('po', 3) → 'po_3'. */
export function fieldName(code, tank) {
  return `${code}_${tank}`;
}

/** ¿El tanque i tiene Cantidad Sembrada cargada? (→ sv auto). */
export function hasCS(cs, i) {
  return !!cs && cs['si_' + i] !== undefined && cs['si_' + i] !== '' && cs['si_' + i] !== null;
}

/** Nº de tanques con CS y suma total de CS (en miles). */
export function csSummary(cs) {
  let count = 0;
  let total = 0;
  Object.keys(cs || {}).forEach((k) => {
    if (!k.startsWith('si_')) return;
    const raw = cs[k];
    if (raw !== '' && raw !== null && raw !== undefined) count += 1;
    const v = parseFloat(raw);
    if (isFinite(v) && v > 0) total += v;
  });
  return { count, total };
}
