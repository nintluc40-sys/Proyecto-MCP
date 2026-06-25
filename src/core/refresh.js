/* ============================================================
   AUTO-REFRESCO silencioso
   - Reintenta cada REFRESH_INTERVAL_S.
   - Usa fingerprint para evitar re-render si no hubo cambios.
   - Se pausa mientras el usuario interactúa o hay un overlay abierto.
   Portado de silentRefresh + _markInteracting del original.
   ============================================================ */
import { REFRESH_INTERVAL_S } from '../config.js';
import { store, emit, EV } from './store.js';
import { fetchAllSheets, dataFingerprint, isDegraded, applySheets } from './sheets.js';

let timer = null;
let lastFingerprint = '';
let interactingUntil = 0;

/** Marca interacción del usuario por `ms` (pausa el refresco). */
export function markInteracting(ms = 12000) { interactingUntil = Date.now() + ms; }

function isBusy() {
  if (Date.now() < interactingUntil) return true;
  return !!document.querySelector('.modal-open');
}

function bindInteraction() {
  ['click', 'scroll', 'keydown', 'touchstart'].forEach((ev) =>
    document.addEventListener(ev, () => markInteracting(12000), true));
  let mm = null;
  document.addEventListener('mousemove', () => {
    if (!mm) { mm = setTimeout(() => { mm = null; }, 2000); markInteracting(10000); }
  }, true);
}

async function tick() {
  if (!store.connected || store.refreshing || isBusy()) return schedule();
  store.refreshing = true;
  emit(EV.CONN, { state: 'refreshing', label: 'Actualizando…' });
  try {
    const sheets = await fetchAllSheets();
    const ts = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    // Descarga degradada (menos hojas que el set bueno ya cargado): conserva los
    // datos previos y NO actualiza la huella, para reintentar el set completo en el
    // próximo ciclo. Sin esto, un refresco transitorio dejaba la UI en 1 sola hoja
    // hasta que el usuario refrescaba a mano.
    if (isDegraded(sheets)) {
      emit(EV.CONN, { state: 'connected', label: `${store.sheetNames.length} hojas · ${ts}` });
      return;
    }
    const fp = dataFingerprint(sheets);
    if (fp === lastFingerprint) {
      emit(EV.CONN, { state: 'connected', label: `${store.sheetNames.length} hojas · ${ts} · sin cambios` });
    } else {
      lastFingerprint = fp;
      if (applySheets(sheets)) {
        emit(EV.DATA, { firstLoad: false });
        emit(EV.CONN, { state: 'connected', label: `${store.sheetNames.length} hojas · ${ts}` });
      }
    }
  } catch (_) {
    // silencioso: conserva los datos previos
  } finally {
    store.refreshing = false;
    schedule();
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(tick, REFRESH_INTERVAL_S * 1000);
}

export function startAutoRefresh(initialFingerprint = '') {
  lastFingerprint = initialFingerprint;
  bindInteraction();
  schedule();
}

export function stopAutoRefresh() { clearTimeout(timer); timer = null; }
