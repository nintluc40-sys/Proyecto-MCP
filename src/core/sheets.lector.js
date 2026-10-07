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
   ============================================================ */
import { XLSX_TIMEOUT_MS } from '../config.js';

// Tres intentos de descarga con sus pausas, más la lectura: con holgura.
const LIMITE_MS = XLSX_TIMEOUT_MS * 3 + 30000;

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
    // un aviso de cómo va (punto 7): no termina la petición
    if (m.progreso) { const q = enCurso.get(m.id); if (q && q.alAvanzar) q.alAvanzar(m.progreso); return; }
    // una hoja que cambió (2026-10-06, punto 5): llegan de a una —cada una se deserializa en su propia tarea, corta— y
    // se juntan aquí; la respuesta final las entrega en `cambiadas`, como antes
    if (m.hoja !== undefined) { const q = enCurso.get(m.id); if (q) (q.hojas || (q.hojas = {}))[m.hoja] = m.filas; return; }
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

/** Lee el libro en el Worker. Nunca rechaza: resuelve { ok: true, orden, huellas, cambiadas } o
 *  { ok: false, motivo: 'no-arranca' | 'sin-xlsx' | 'xlsx' | 'caido' | 'tiempo' }. Con `alAvanzar` (la primera
 *  carga, punto 7), el Worker avisa de cómo va la descarga y de cuándo empieza a leer. */
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
    const timer = setTimeout(() => {
      if (!enCurso.has(id)) return;
      enCurso.delete(id);
      resolve({ ok: false, motivo: 'tiempo' });
      soltar('tiempo');
    }, LIMITE_MS);
    enCurso.set(id, { resolve, timer, alAvanzar });
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
