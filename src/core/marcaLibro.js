/* ============================================================
   MARCA DEL LIBRO · ¿cambió desde la última descarga? (2026-10-07, usuario, punto 8)

   El refresco de cada 5 min bajaba el XLSX ENTERO (~14 MB) sólo para descubrir, después de leerlo, que no había
   cambiado nada: ~170 MB/h con la pestaña a la vista. La exportación de Google no ayuda (sin ETag ni Last-Modified, y
   su tamaño varía sin cambios: medido el 07-10), así que la señal es la fecha de modificación del archivo en Drive, que
   da un Apps Script APARTE («MCP · consulta ligera», sólo un doGet → {"ok":true,"mod":ms}); no es el GAS del Registro.

   Devuelve la marca (ms) o null cuando no se puede saber —otro libro activo, sin red, lento (CONSULTA_CAMBIOS.ms),
   respuesta rara—: refresh.js entonces descarga como siempre, así que un fallo de la consulta nunca deja datos viejos.
   ============================================================ */
import { CONSULTA_CAMBIOS } from '../config.js';
import { parseSheetsIds, activeUrl } from './sheets.js';

export async function marcaDelLibro(pedir = globalThis.fetch) {
  const { url, libro, ms } = CONSULTA_CAMBIOS;
  const ids = parseSheetsIds(activeUrl());
  if (!url || !ids || ids.type !== 'real' || ids.realId !== libro || typeof pedir !== 'function') return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const reloj = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms);
  try {
    const r = await pedir(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
    if (!r || !r.ok) return null;
    const j = await r.json();
    return j && j.ok === true && Number.isFinite(j.mod) && j.mod > 0 ? j.mod : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}
