/* ============================================================
   LECTOR del libro en segundo plano (cliente del Worker; P1, 2026-10-01)

   Lo registra main.js en sheets.js (setLectorLibro). sheets.js NO lo importa: el Worker
   empaqueta sheets.js, y si sheets.js creara el Worker, el Worker se incluiría a sí mismo.

   - disponible(): hay Worker, la página cargó SheetJS (su <script> da la URL que importa el
     Worker) y el Worker no se ha dado por ROTO.
   - Roto = no llegó a arrancar (su bloque no se pudo bajar, p. ej. sin red tras publicar) o no
     pudo cargar SheetJS: a partir de ahí se lee en el hilo principal, como antes.
   - Caído = se cayó DESPUÉS de arrancar (p. ej. sin memoria en un móvil) o no contestó a
     tiempo: se tira y se crea otro en la siguiente lectura.
   - A tiempo (A1, 2026-10-07, usuario) = sin pasar SILENCIO_MS callado. Antes era un tope FIJO de 165 s para toda la
     lectura: cortaba una red lenta que sí avanzaba (y el respaldo a medias), y en la primera carga la página repetía
     entonces toda la cadena (medido: 7,2 min con la red colgada, ~17 min con las pestañas en caché). Ahora cualquier
     mensaje de la petición —latido, aviso u hoja— reinicia la cuenta; el Worker late mientras atiende, así que sólo se
     corta si se traba en algo síncrono más de SILENCIO_MS.
   ============================================================ */

// Lo más que el Worker puede callar: su lectura del XLSX es síncrona y no late (~16 s en PC, medido el 03-10; ×4 en un
// celular lento). El doble de eso, con holgura.
export const SILENCIO_MS = 120000;

let worker = null;
let vivo = false;
let roto = false;
let seq = 0;
const enCurso = new Map(); // id → { resolve, timer }

function xlsxSrc() {
  if (typeof document === 'undefined') return '';
  const s = document.querySelector('script[src*="xlsx.full.min.js"]');
  return s ? s.src : '';
}

export function lectorDisponible() {
  return !roto && typeof Worker !== 'undefined' && !!xlsxSrc();
}

/** Resuelve todo lo pendiente con `motivo` y tira el Worker. */
function soltar(motivo) {
  for (const p of enCurso.values()) { clearTimeout(p.timer); p.resolve({ ok: false, motivo }); }
  enCurso.clear();
  if (worker) { try { worker.terminate(); } catch (_) { /* ya no está */ } }
  worker = null;
}

function crear() {
  vivo = false;
  const w = new Worker(new URL('./sheets.worker.js', import.meta.url));
  w.onmessage = (e) => {
    const m = e.data || {};
    if (m.vivo) { vivo = true; return; }
    // A1: el Worker late mientras atiende; un latido sólo reinicia la cuenta del silencio
    if (m.latido) { const q = enCurso.get(m.id); if (q) vigilar(m.id, q); return; }
    // un aviso de cómo va (punto 7): no termina la petición
    if (m.progreso) { const q = enCurso.get(m.id); if (q) { vigilar(m.id, q); if (q.alAvanzar) q.alAvanzar(m.progreso); } return; }
    // una hoja que cambió (2026-10-06, punto 5): llegan de a una —cada una se deserializa en su propia tarea, corta— y
    // se juntan aquí; la respuesta final las entrega en `cambiadas`, como antes
    if (m.hoja !== undefined) { const q = enCurso.get(m.id); if (q) { vigilar(m.id, q); (q.hojas || (q.hojas = {}))[m.hoja] = m.filas; } return; }
    const p = enCurso.get(m.id);
    if (!p) return;
    enCurso.delete(m.id);
    clearTimeout(p.timer);
    if (!m.ok && m.motivo === 'sin-xlsx') roto = true;
    // una respuesta buena SIEMPRE lleva `cambiadas`, vacía si no cambió ninguna hoja (07-10: sin ella, fundirDelta fallaba
    // en cada refresco sin cambios y la píldora decía «sin actualizar»; ⟳ sin cambios, un error)
    p.resolve(m.ok ? { ...m, cambiadas: { ...(m.cambiadas || {}), ...(p.hojas || {}) } } : m);
  };
  w.onerror = (ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!vivo) roto = true;
    soltar(vivo ? 'caido' : 'no-arranca');
  };
  return w;
}

/** (Re)arma el corte de la petición `id`: si pasan SILENCIO_MS sin oír nada de ella, «tiempo» y se tira el Worker. */
function vigilar(id, q) {
  clearTimeout(q.timer);
  q.timer = setTimeout(() => {
    if (!enCurso.has(id)) return;
    enCurso.delete(id);
    q.resolve({ ok: false, motivo: 'tiempo' });
    soltar('tiempo');
  }, SILENCIO_MS);
}

/** Lee el libro en el Worker. Nunca rechaza: resuelve { ok: true, orden, huellas, cambiadas } o
 *  { ok: false, motivo: 'no-arranca' | 'sin-xlsx' | 'xlsx' | 'sin-datos' | 'caido' | 'tiempo' }. Con `alAvanzar` (la
 *  primera carga, punto 7), el Worker avisa de cómo va la descarga y de cuándo empieza a leer. */
export function leerEnWorker({ realId, previas, alAvanzar }) {
  return new Promise((resolve) => {
    if (!lectorDisponible()) { resolve({ ok: false, motivo: 'no-arranca' }); return; }
    try {
      if (!worker) worker = crear();
    } catch (_) {
      roto = true;
      resolve({ ok: false, motivo: 'no-arranca' });
      return;
    }
    const id = ++seq;
    const q = { resolve, timer: 0, alAvanzar };
    enCurso.set(id, q);
    vigilar(id, q);
    worker.postMessage({ id, realId, xlsxUrl: xlsxSrc(), previas: previas || {}, conProgreso: !!alAvanzar });
  });
}

/** El lector que se registra en sheets.js (setLectorLibro). */
export const lectorWorker = { disponible: lectorDisponible, leer: leerEnWorker };

/** Sólo para las pruebas: vuelve al estado inicial. */
export function _reiniciarLector() {
  soltar('tiempo');
  vivo = false;
  roto = false;
}
