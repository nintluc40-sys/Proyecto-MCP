/* ============================================================
   LIBRO GUARDADO en el equipo (P4 del plan de carga y refresco, 2026-10-01)

   El último libro leído se guarda en IndexedDB para que el MCP abra AL INSTANTE con él —también
   sin señal— mientras el auto-refresco lo revalida por detrás («datos de las hh:mm ·
   actualizando…»). Decisiones del usuario (2026-10-01): se guarda en cada equipo y CADUCA a los
   7 días: más viejo, se borra y se espera a la descarga.

   · Lo escribe el Worker de lectura (sheets.worker.js) después de cada lectura: ni la copia ni
     la escritura le cuestan nada a la pantalla. Sólo se escriben las hojas cuya huella cambió
     respecto a lo GUARDADO, y la meta (orden, huellas, huella global, fecha) va en la MISMA
     transacción: o queda todo o no queda nada.
   · Lo lee el hilo principal la primera vez que una vista necesita el libro (refresh.js ·
     asegurarLibro). Si algo no cuadra (versión, una hoja que falta o con otra huella), se ignora.
   · Sin Worker no se guarda nada (el camino de siempre ya congela; no se le suma la escritura).

   El almacén es un adaptador ({ leerMeta, leerHojas, escribir, vaciar }): almacenIDB() es el de
   verdad; las pruebas usan uno en memoria con la misma forma.
   ============================================================ */

export const CADUCIDAD_MS = 7 * 24 * 60 * 60 * 1000;
// Sube si cambia la forma de lo guardado (o de las filas que produce la lectura): lo anterior se ignora.
export const VERSION_GUARDADO = 1;

/** Guarda un libro leído: { sheets, huellas, orden, fp, t }. Devuelve cuántas hojas escribió. */
export async function guardarLibro({ sheets, huellas, orden, fp, t }, almacen) {
  let meta = null;
  try { meta = await almacen.leerMeta(); } catch (_) { meta = null; }
  const previas = (meta && meta.v === VERSION_GUARDADO && meta.huellas) || {};
  const poner = orden.filter((n) => previas[n] !== huellas[n]).map((n) => [n, { rows: sheets[n], huella: huellas[n] }]);
  const quitar = ((meta && meta.orden) || []).filter((n) => !orden.includes(n));
  await almacen.escribir({ poner, quitar, meta: { v: VERSION_GUARDADO, orden, huellas, fp, t } });
  return poner.length;
}

/** El libro guardado como una descarga ({ sheets, huellas, fp, t }), o null si no hay, es de otra
 *  versión, no cuadra o tiene más de 7 días (en ese caso, además, se borra). */
export async function cargarLibroGuardado(almacen, ahora = Date.now()) {
  const meta = await almacen.leerMeta();
  if (!meta || meta.v !== VERSION_GUARDADO || !Array.isArray(meta.orden) || !meta.orden.length) return null;
  if (!(ahora - meta.t <= CADUCIDAD_MS)) {
    try { await almacen.vaciar(); } catch (_) { /* se reintentará la próxima vez */ }
    return null;
  }
  const regs = await almacen.leerHojas(meta.orden);
  const sheets = {};
  for (let i = 0; i < meta.orden.length; i++) {
    const n = meta.orden[i];
    const r = regs[i];
    if (!r || !Array.isArray(r.rows) || r.huella !== meta.huellas[n]) return null;
    sheets[n] = r.rows;
  }
  return { sheets, huellas: meta.huellas, fp: meta.fp, t: meta.t };
}

/* ---------- almacén IndexedDB (hilo principal y Worker) ---------- */
const DB = 'mcp-libro';
const HOJAS = 'hojas';
const META = 'meta';

const pedir = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const terminar = (t) => new Promise((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error || new Error('transacción abortada'));
});

/** Adaptador sobre IndexedDB (base `mcp-libro`: «hojas» = { rows, huella } por nombre; «meta»). */
export function almacenIDB(idb = globalThis.indexedDB) {
  let abierta = null;
  const db = () => {
    if (!abierta) {
      abierta = new Promise((resolve, reject) => {
        if (!idb) { reject(new Error('IndexedDB no disponible')); return; }
        const r = idb.open(DB, 1);
        r.onupgradeneeded = () => { r.result.createObjectStore(HOJAS); r.result.createObjectStore(META); };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      abierta.catch(() => { abierta = null; });
    }
    return abierta;
  };
  return {
    async leerMeta() {
      const d = await db();
      return (await pedir(d.transaction(META).objectStore(META).get('libro'))) || null;
    },
    async leerHojas(nombres) {
      const d = await db();
      const s = d.transaction(HOJAS).objectStore(HOJAS);
      return Promise.all(nombres.map((n) => pedir(s.get(n))));
    },
    async escribir({ poner, quitar, meta }) {
      const d = await db();
      const t = d.transaction([HOJAS, META], 'readwrite');
      const h = t.objectStore(HOJAS);
      poner.forEach(([n, v]) => h.put(v, n));
      quitar.forEach((n) => h.delete(n));
      t.objectStore(META).put(meta, 'libro');
      await terminar(t);
    },
    async vaciar() {
      const d = await db();
      const t = d.transaction([HOJAS, META], 'readwrite');
      t.objectStore(HOJAS).clear();
      t.objectStore(META).clear();
      await terminar(t);
    },
  };
}
