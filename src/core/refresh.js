/* ============================================================
   AUTO-REFRESCO silencioso
   - Comprueba cada REFRESH_INTERVAL_S (5 min) y SÓLO con la pestaña a la vista: oculta,
     no descarga (nadie mira y gasta datos); al volver, comprueba en ese momento si ya
     tocaba.
   - Usa fingerprint para evitar re-render si no hubo cambios.
   - Con el libro leído en un Worker (P1) descarga aunque el usuario esté trabajando: no
     congela. Sin Worker (navegador sin él, o roto), no DESCARGA mientras el usuario
     interactúa o hay un overlay abierto: leer el Excel aquí congela la pantalla.
   - Los datos nuevos se APLICAN sólo en reposo (sin interacción reciente, sin overlay y sin
     un campo de texto con el foco). Hasta entonces quedan PENDIENTES —uno solo: el más
     nuevo sustituye al anterior— y se reintenta cada APPLY_RETRY_MS.
   - ⟳ y la píldora usan refrescoManual(): nunca dos descargas a la vez.
   - P4: la primera vez que hace falta el libro, si hay uno GUARDADO en el equipo (y no caducó),
     se enseña YA («datos de las hh:mm · actualizando…») y se revalida en el acto.
   Portado de silentRefresh + _markInteracting del original; política de refresco del
   2026-09-24 (P2 del plan de carga y refresco).
   ============================================================ */
import { REFRESH_INTERVAL_S } from '../config.js';
import { store, emit, EV } from './store.js';
import {
  descargarLibro, aplicarDescarga, aplicarLibroGuardado, lecturaEnSegundoPlano, connectSheets, isDegraded,
  getLastFingerprint,
} from './sheets.js';

const INTERVAL_MS = REFRESH_INTERVAL_S * 1000;
const APPLY_RETRY_MS = 2000;

let timer = null;
let applyTimer = null;
let interactingUntil = 0;
let pending = null;  // { d, ts }: descarga nueva (d = { sheets, huellas, fp }) que espera al reposo
let started = false;
// P4: mientras lo que se ve es el libro GUARDADO y aún no se ha confirmado: «de las hh:mm» / «del dd/mm hh:mm».
let datosDe = '';

/** Marca interacción del usuario por `ms` (pausa el refresco). */
function markInteracting(ms = 12000) { interactingUntil = Date.now() + ms; }

function isBusy() {
  if (Date.now() < interactingUntil) return true;
  return !!document.querySelector('.modal-open');
}

/** ¿Hay un campo de TEXTO con el foco? Repintar se llevaría el foco y lo tecleado. Los
 *  desplegables, casillas y botones no cuentan: conservan el foco después de usarlos, y un
 *  tablero que se queda con un filtro enfocado (una pantalla de Visitante) no se
 *  actualizaría nunca; el rato en que se están usando ya lo cubre la ventana de interacción. */
const TEXT_TYPES = /^(text|search|number|email|tel|url|password|date|time|datetime-local|month|week)$/;
function hasTextFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  if (el.disabled || el.readOnly) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_TYPES.test(String(el.type || 'text').toLowerCase());
}

const onInteraction = () => markInteracting(12000);
let mm = null;
const onMouseMove = () => {
  if (!mm) { mm = setTimeout(() => { mm = null; }, 2000); markInteracting(10000); }
};
const INTERACTION_EVENTS = ['click', 'scroll', 'keydown', 'touchstart'];

const hora = () => new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
/** «de las 14:05» si es de hoy; «del 28/09 14:05» si no. */
function cuando(t) {
  const d = new Date(t);
  const hm = d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return 'de las ' + hm;
  return `del ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
}
const etiqueta = (ts, extra = '') => `${store.sheetNames.length} hojas · ${ts}${extra}`;

/** Aplica el set pendiente si hay reposo. Devuelve true si lo aplicó. */
function tryApply() {
  clearTimeout(applyTimer);
  applyTimer = null;
  if (!pending) return false;
  if (document.hidden) return false; // al volver a la pestaña lo reintenta onVisible()
  if (isBusy() || hasTextFocus()) {
    applyTimer = setTimeout(tryApply, APPLY_RETRY_MS);
    return false;
  }
  const { d, ts } = pending;
  pending = null;
  // aplicarDescarga fija la huella (y las de cada hoja) al APLICAR: el siguiente ciclo se
  // compara con lo que de verdad está en pantalla, no con un pendiente que quizá nunca llegó
  // a aplicarse.
  if (!aplicarDescarga(d)) return false;
  datosDe = '';
  emit(EV.DATA, { firstLoad: false });
  emit(EV.CONN, { state: 'connected', label: etiqueta(ts) });
  return true;
}

async function check() {
  store.refreshing = true;
  emit(EV.CONN, { state: 'refreshing', label: datosDe ? etiqueta('datos ' + datosDe, ' · actualizando…') : 'Actualizando…' });
  try {
    const d = await descargarLibro();
    const ts = hora();
    // Un libro sin ninguna hoja con filas es una descarga FALLIDA —sin señal, el XLSX y el CSV de
    // respaldo no traen nada—: se conservan los datos y se dice, como cualquier otro fallo (antes
    // entraba como «datos nuevos en espera» y la píldora se quedaba diciéndolo; medido el 01-10).
    if (!Object.keys(d.huellas || {}).length) throw new Error('El libro llegó vacío.');
    // Descarga degradada (menos hojas que el set bueno ya cargado): conserva los
    // datos previos y NO actualiza la huella, para reintentar el set completo en el
    // próximo ciclo. Sin esto, un refresco transitorio dejaba la UI en 1 sola hoja
    // hasta que el usuario refrescaba a mano.
    if (isDegraded(d.sheets)) {
      emit(EV.CONN, { state: 'connected', label: etiqueta(ts) });
      return;
    }
    if (d.fp === getLastFingerprint()) {
      pending = null; // lo que está en pantalla ya es lo último: un pendiente anterior sobra
      clearTimeout(applyTimer);
      applyTimer = null;
      datosDe = ''; // lo guardado ERA lo último
      emit(EV.CONN, { state: 'connected', label: etiqueta(ts, ' · sin cambios') });
    } else {
      pending = { d, ts };
      if (!tryApply()) emit(EV.CONN, { state: 'connected', label: etiqueta(ts, ' · datos nuevos en espera') });
    }
  } catch (_) {
    // Conserva los datos previos y lo dice (antes la píldora se quedaba en «Actualizando…»).
    emit(EV.CONN, { state: 'connected', label: `${store.sheetNames.length} hojas · ${datosDe ? 'datos ' + datosDe + ' · ' : ''}sin actualizar (se reintenta)` });
  } finally {
    store.refreshing = false;
    schedule();
  }
}

function tick() {
  timer = null;
  if (document.hidden) return; // el bucle se para; onVisible() lo reanuda
  if (!store.connected || store.refreshing || (isBusy() && !lecturaEnSegundoPlano())) { schedule(); return; }
  check();
}

function schedule(ms = INTERVAL_MS) {
  clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

/** Al volver a la pestaña: aplica lo pendiente y, si el bucle se paró estando oculta, comprueba
 *  ya. Parado (sin temporizador ni descarga en curso) sólo puede estar porque el ciclo tocó con la
 *  pestaña oculta: ya pasó el intervalo. Si no tocó, su temporizador sigue en pie y no se adelanta. */
function onVisible() {
  if (document.hidden) return;
  tryApply();
  if (!timer && !store.refreshing) tick();
}

/** Refresco pedido a mano (⟳ y la píldora): descarga y aplica YA, aunque haya un campo con
 *  el foco —lo pidió el usuario—. No arranca si ya hay una descarga en curso (devuelve
 *  null); descarta el pendiente y reprograma el siguiente ciclo automático. */
export async function refrescoManual() {
  if (store.refreshing) return null;
  store.refreshing = true;
  pending = null;
  clearTimeout(applyTimer);
  applyTimer = null;
  clearTimeout(timer);
  timer = null;
  try {
    const ok = await connectSheets();
    if (ok) datosDe = '';
    return ok;
  } finally {
    store.refreshing = false;
    if (started) schedule();
  }
}

// P4: de dónde sale el libro guardado en el equipo (main.js registra libroGuardado.js); sin él,
// la primera vez siempre se descarga.
let _guardado = null;
export function setLibroGuardado(fn) { _guardado = fn; }
let asegurando = false;

/** Primera carga del libro (P3, 2026-10-01): la pide el router cuando enseña una vista sin datos.
 *  No hace nada si ya está cargado, si hay una descarga en curso o si ya se está buscando lo
 *  guardado. P4: si hay un libro GUARDADO en el equipo y no caducó, se aplica YA y se revalida
 *  en el acto (aplica en reposo, como cualquier refresco); si no, se descarga (refrescoManual,
 *  para que ⟳ no pueda lanzar otra a la vez). */
export function asegurarLibro() {
  if (store.connected || store.refreshing || asegurando) return null;
  if (!_guardado) return refrescoManual();
  asegurando = true;
  return (async () => {
    let g = null;
    try { g = await _guardado(); } catch (_) { g = null; }
    asegurando = false;
    if (store.connected || store.refreshing) return null;
    if (g && aplicarLibroGuardado(g)) {
      datosDe = cuando(g.t);
      check();
      return true;
    }
    return refrescoManual();
  })();
}

/** Arranca el loop. La huella inicial vive en sheets.js (la siembra commit()
 *  en la carga inicial), así que aquí no hay estado que sembrar. */
export function startAutoRefresh() {
  if (started) return;
  started = true;
  INTERACTION_EVENTS.forEach((ev) => document.addEventListener(ev, onInteraction, true));
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('visibilitychange', onVisible);
  schedule();
}

/** Para el loop y suelta sus escuchas (las pruebas lo usan para empezar cada caso de cero). */
export function stopAutoRefresh() {
  started = false;
  clearTimeout(timer);
  clearTimeout(applyTimer);
  clearTimeout(mm);
  timer = applyTimer = mm = null;
  pending = null;
  interactingUntil = 0;
  datosDe = '';
  asegurando = false;
  INTERACTION_EVENTS.forEach((ev) => document.removeEventListener(ev, onInteraction, true));
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('visibilitychange', onVisible);
}
