/* ============================================================
   WORKER de lectura del libro (P1 del plan de carga y refresco, 2026-10-01)

   Descarga el export XLSX y lo lee FUERA del hilo principal: la lectura de ~200 000 filas
   congelaba la pantalla 12–21 s en cada carga y cada refresco (medido el 01-10). Devuelve la
   huella de cada hoja y SÓLO las filas de las que cambiaron respecto a lo aplicado
   (`previas`), así que un refresco sin cambios no le cuesta nada a la pantalla.

   Es un worker CLÁSICO (Vite lo empaqueta como IIFE): así puede cargar SheetJS con
   `importScripts` —el mismo archivo de public/vendor que usa la página— y funciona también en
   navegadores sin workers de módulo. La descarga, los reintentos y la lectura son los de
   sheets.js (fetchXlsxSheets): una sola implementación.

   Protocolo (cliente: sheets.lector.js):
     → { id, realId, xlsxUrl, previas }
     ← { vivo: true }                                   al arrancar
     ← { id, ok: true, orden, huellas, cambiadas }
     ← { id, ok: false, motivo: 'sin-xlsx' | 'xlsx', error }
   ============================================================ */
import { fetchXlsxSheets, planDelta } from './sheets.js';

/** Atiende una petición. `entorno` da cómo cargar SheetJS y cómo obtenerlo (en el Worker:
 *  importScripts y self.XLSX); separado para poder probarlo fuera de un Worker. */
export async function atenderLectura(m, { cargarXLSX, obtenerXLSX }) {
  const id = m && m.id;
  try {
    if (!obtenerXLSX()) cargarXLSX(m.xlsxUrl);
    if (!obtenerXLSX()) throw new Error('SheetJS no quedó disponible en el worker.');
  } catch (err) {
    return { id, ok: false, motivo: 'sin-xlsx', error: String((err && err.message) || err) };
  }
  try {
    const sheets = await fetchXlsxSheets({ type: 'real', realId: m.realId }, obtenerXLSX);
    if (!sheets) return { id, ok: false, motivo: 'xlsx', error: 'El export XLSX no se pudo leer.' };
    return { id, ok: true, ...planDelta(m.previas || {}, sheets) };
  } catch (err) {
    return { id, ok: false, motivo: 'xlsx', error: String((err && err.message) || err) };
  }
}

/* global WorkerGlobalScope, importScripts */
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const entorno = { cargarXLSX: (url) => importScripts(url), obtenerXLSX: () => self.XLSX };
  self.onmessage = async (e) => { self.postMessage(await atenderLectura(e.data || {}, entorno)); };
  self.postMessage({ vivo: true });
}
