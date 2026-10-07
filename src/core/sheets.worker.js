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

   P4 (2026-10-01): después de contestar, guarda el libro leído en IndexedDB (libroGuardado.js)
   para que la próxima vez el MCP abra al instante con él. Lo hace aquí para que ni la copia ni
   la escritura le cuesten nada a la pantalla; si falla, no pasa nada (se reintenta en la próxima
   lectura).

   Protocolo (cliente: sheets.lector.js):
     → { id, realId, xlsxUrl, previas, conProgreso }
     ← { vivo: true }                                   al arrancar
     ← { id, progreso: { fase, bytes } }                con conProgreso (la primera carga, punto 7): cómo va
     ← { id, hoja, filas }                              una por cada hoja que cambió (2026-10-06, abajo)
     ← { id, ok: true, orden, huellas }                 al final; el lector junta las hojas en `cambiadas`
     ← { id, ok: false, motivo: 'sin-xlsx' | 'xlsx', error }

   Hojas de a una (2026-10-06, usuario, punto 5): la página deserializa cada mensaje al leerlo, y con TODAS las hojas
   en uno solo eran ~600 ms seguidos en escritorio (×4 en un celular) sin que la pantalla respondiera, más lo que venía
   detrás en la misma tarea. Un mensaje por hoja reparte ese trabajo en tareas cortas (la mayor, la hoja más grande).
   ============================================================ */
import { fetchXlsxSheets, respaldoPorHojas, planDelta, huellaDe } from './sheets.js';
import { guardarLibro, almacenIDB } from './libroGuardado.js';

/** Atiende una petición. `entorno` da cómo cargar SheetJS y cómo obtenerlo (en el Worker:
 *  importScripts y self.XLSX) y, si lo trae, cómo GUARDAR el libro leído (sin esperar: la
 *  respuesta no se retrasa por guardar); separado para poder probarlo fuera de un Worker. */
export async function atenderLectura(m, entorno) {
  const { cargarXLSX, obtenerXLSX } = entorno;
  const id = m && m.id;
  try {
    if (!obtenerXLSX()) cargarXLSX(m.xlsxUrl);
    if (!obtenerXLSX()) throw new Error('SheetJS no quedó disponible en el worker.');
  } catch (err) {
    return { id, ok: false, motivo: 'sin-xlsx', error: String((err && err.message) || err) };
  }
  try {
    const ids = { type: 'real', realId: m.realId };
    const avisar = m.conProgreso && entorno.avisar ? (p) => entorno.avisar(id, p) : null;
    let sheets = await fetchXlsxSheets(ids, obtenerXLSX, avisar);
    let guardable = !!sheets;
    /* 2026-10-01 (usuario) · si el libro entero no llega, el RESPALDO (cada hoja por su XLSX, inmune a los filtros de
       la hoja; si el de una falla, su CSV) se hace AQUÍ: en la página, cada hoja grande por XLSX la congelaba ~1,3 s en
       PC. El libro sólo se GUARDA en el equipo (P4) si llegó completo y todo por XLSX: una hoja por CSV puede venir
       recortada por un filtro, y una que faltara se quedaría así hasta 7 días al abrir. */
    if (!sheets) {
      const r = await respaldoPorHojas(ids, obtenerXLSX);
      if (Object.keys(r.sheets).length) {
        sheets = r.sheets;
        guardable = !r.porCsv && !r.perdidas && !r.sinPestanas;
      }
    }
    if (!sheets) return { id, ok: false, motivo: 'xlsx', error: 'El export XLSX no se pudo leer.' };
    const d = planDelta(m.previas || {}, sheets);
    if (entorno.guardar && guardable) {
      const libro = { sheets, huellas: d.huellas, orden: d.orden, fp: huellaDe(d.huellas, d.orden), t: Date.now() };
      Promise.resolve().then(() => entorno.guardar(libro)).catch(() => { /* se reintenta en la próxima lectura */ });
    }
    return { id, ok: true, ...d };
  } catch (err) {
    return { id, ok: false, motivo: 'xlsx', error: String((err && err.message) || err) };
  }
}

/** Envía la respuesta de atenderLectura con `post`: si trae hojas, cada una en su mensaje { id, hoja, filas } y al final
 *  la respuesta sin ellas (ver «Hojas de a una» arriba); si no, tal cual. */
export function responder(r, post) {
  if (!r || !r.ok || !r.cambiadas) { post(r); return; }
  const { cambiadas, ...resto } = r;
  for (const hoja of Object.keys(cambiadas)) post({ id: r.id, hoja, filas: cambiadas[hoja] });
  post(resto);
}

/* global WorkerGlobalScope, importScripts */
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const almacen = almacenIDB();
  const entorno = {
    cargarXLSX: (url) => importScripts(url),
    obtenerXLSX: () => self.XLSX,
    guardar: (libro) => guardarLibro(libro, almacen),
    avisar: (id, progreso) => self.postMessage({ id, progreso }),
  };
  self.onmessage = async (e) => { responder(await atenderLectura(e.data || {}, entorno), (m) => self.postMessage(m)); };
  self.postMessage({ vivo: true });
}
