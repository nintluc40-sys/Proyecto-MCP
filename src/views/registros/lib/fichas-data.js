/* ============================================================
   REGISTROS · adaptador de la capa de datos (reutiliza el motor)
   Reconstrucción nativa de las fichas: en lugar de reimplementar la
   persistencia/sync (que ESCRIBE a producción), los módulos nativos llaman a
   este adaptador, que delega en las funciones YA VALIDADAS del monolito
   engine.js, expuestas globalmente (window.loadE/saveE/getStatus...).

   Esto es el seam de "reutilizar la capa de datos": cero reimplementación del
   guardado/sync. Cuando esa capa se extraiga a módulos propios, solo cambia el
   interior de este adaptador; los módulos nativos no se enteran.
   ============================================================ */

/** Devuelve el objeto global del motor o lanza si engine.js no está cargado. */
function eng() {
  const w = globalThis;
  if (typeof w.loadE !== 'function' || typeof w.saveE !== 'function') {
    throw new Error('engine.js (motor de Registros) no cargado: capa de datos no disponible.');
  }
  return w;
}

/** ¿Está disponible la capa de datos del motor? (sin lanzar) */
export function isDataLayerReady() {
  const w = globalThis;
  return typeof w.loadE === 'function' && typeof w.saveE === 'function';
}

/** Datos guardados de una ficha (solo el objeto `data`), o null si no hay. */
export function loadFicha(mod, ficha) {
  const entry = eng().loadE(mod, ficha);
  return entry ? entry.data : null;
}

/** Entrada completa de la ficha {mod, ficha, date, savedAt, updatedAt, synced, data}. */
export function loadFichaEntry(mod, ficha) {
  return eng().loadE(mod, ficha);
}

/** Guarda los datos de una ficha. Devuelve true si el navegador persistió de
 *  verdad (el motor hace lectura-tras-escritura). `synced=false` = pendiente. */
export function saveFicha(mod, ficha, data, synced = false) {
  return eng().saveE(mod, ficha, data, !!synced);
}

/** Estado de la ficha: 'empty' | 'pending' | 'synced'. */
export function fichaStatus(mod, ficha) {
  return eng().getStatus(mod, ficha);
}
