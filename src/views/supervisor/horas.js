/* ============================================================
   SUPERVISOR · rejilla horaria de las tomas de Control_Tanque

   Vive aparte porque lo comparten CUATRO módulos de la vista: `tank.js` (perfil horario
   del tanque), `module.js` (promedio horario del módulo), `moduleTrends.js` (series por
   hora) y `trazabilidad.js` (ficha de Parámetros en PDF). Antes lo exportaba `tank.js`,
   de modo que una sub-vista hacía de librería de las otras tres y abrirlas obligaba a
   cargar el detalle de tanque entero.

   `STD_HRS` y `HR_LABELS` son PARALELOS: mismo índice = misma toma. Quien añada o quite
   una hora debe tocar los dos, o las etiquetas del eje dejarán de corresponder con los
   datos. (`trazabilidad.js` mantiene además su propio `PTIMES` paralelo, con el formato
   'HH:MM' que exige la ficha impresa.)
   ============================================================ */

// 12 tomas estándar cada 2 h, en el orden 2 AM → 12 AM (medianoche al final).
export const STD_HRS = ['2:00:00', '4:00:00', '6:00:00', '8:00:00', '10:00:00', '12:00:00', '14:00:00', '16:00:00', '18:00:00', '20:00:00', '22:00:00', '0:00:00'];
export const HR_LABELS = ['2 AM', '4 AM', '6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM', '12 AM'];

/** Normaliza la hora ("2:00 AM" / "14:00" / "2:00:00" / "800" / "0800") a "H:MM:SS" 24h.
 *  Devuelve null si no se reconoce; los llamantes comparan contra STD_HRS, así que un null
 *  hace que la lectura se DESCARTE (no se dibuja en el perfil horario ni sale en el PDF de
 *  Parámetros). Por eso los formatos compactos sin dos puntos tienen su propia rama: la hoja
 *  los trae cuando la hora se teclea, y antes se perdían en silencio. */
export function normHr(h) {
  const s = String(h || '').trim();
  if (!s) return null;
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let hr = parseInt(ampm[1], 10); const mn = ampm[2], sc = ampm[3] || '00';
    const pm = ampm[4].toUpperCase() === 'PM';
    if (pm && hr !== 12) hr += 12;
    if (!pm && hr === 12) hr = 0;
    return hr + ':' + mn + ':' + sc;
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) { const p = s.split(':'); return parseInt(p[0], 10) + ':' + p[1] + ':' + p[2]; }
  const m2 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) return parseInt(m2[1], 10) + ':' + m2[2] + ':00';
  // Compacto sin dos puntos: HMM o HHMM ("800" = 8:00, "0800" = 8:00, "1000" = 10:00).
  // Devolvía null y la lectura se descartaba. Horas ≥ 24 o minutos ≥ 60 siguen siendo null.
  const m3 = s.match(/^(\d{1,2})(\d{2})$/);
  if (m3) { const hr = parseInt(m3[1], 10); if (hr < 24 && +m3[2] < 60) return hr + ':' + m3[2] + ':00'; }
  return null;
}
