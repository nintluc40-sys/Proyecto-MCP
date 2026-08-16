/* ============================================================
   UI · Diálogos modales accesibles — pieza COMPARTIDA por las vistas.

   Vivía en `views/supervisor/ui.js`, así que sólo Supervisor tenía diálogos con
   semántica y foco atrapado: medido, sus 11 modales llevaban `role="dialog"` y
   `aria-modal`, y los 10 de Microbiología ninguno. Se sube a `ui/` para que ambas —y las
   que vengan— compartan una sola definición, igual que se hizo con la rejilla horaria y
   con Pearson.

   Dos niveles de uso, según lo que necesite la vista:

     · `makeAccessibleDialog(overlay)` — SÓLO la parte de accesibilidad (semántica de
       diálogo, trampa de Tab y devolución del foco). No decide cuándo se abre ni se
       cierra, así que se puede aplicar a un modal que ya gestiona su propia apertura,
       sin reescribirla. Es el camino para Microbiología.

     · `bindModal(root, overlay, opts)` — lo anterior MÁS el cableado completo de
       apertura/cierre (triggers, botón ✕, clic en el velo y Escape). Es lo que usa
       Supervisor.
   ============================================================ */
import { registerModalEscape } from './modalEscape.js';

const FOCUSABLE_SEL = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elementos enfocables VISIBLES del diálogo (los de ramas ocultas no deben recibir Tab). */
function focusablesIn(el) {
  return [...el.querySelectorAll(FOCUSABLE_SEL)]
    .filter((n) => !n.closest('[hidden]') && n.getAttribute('aria-hidden') !== 'true');
}

/**
 * Da a un overlay la semántica y el comportamiento de foco de un diálogo, SIN tocar
 * cómo se abre ni se cierra.
 *
 * Qué resuelve (el comentario original de Supervisor lo describía así): sin esto el
 * overlay no se anuncia como diálogo —un lector de pantalla sigue leyendo el fondo—, y
 * Tab pasea por los controles ocultos tras el velo, desde donde Enter navega de verdad,
 * dejando la vista cambiada con el modal todavía montado.
 *
 * Idempotente: repetir la llamada sobre el mismo overlay no duplica listeners.
 *
 * @param {Element} overlay  el `.modal` completo (velo incluido)
 * @returns {{focusFirst: Function, restoreFocus: Function}|null} ganchos para llamar al
 *   abrir y al cerrar; null si no hay overlay.
 */
export function makeAccessibleDialog(overlay) {
  if (!overlay) return null;
  if (overlay._dlgWired) return overlay._dlgWired;

  const card = overlay.querySelector('.sv-modal-card, .mic-modal-card, .modal-card') || overlay.firstElementChild || overlay;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
  const title = overlay.querySelector('.sv-modal-title, .mic-modal-title, .modal-title, h2, h3');
  if (title) {
    if (!title.id) title.id = 'dlgTitle-' + Math.random().toString(36).slice(2, 9);
    card.setAttribute('aria-labelledby', title.id);
  }

  let lastFocused = null;

  // Trampa de Tab: el recorrido queda circular DENTRO del diálogo.
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = focusablesIn(card);
    if (!f.length) { e.preventDefault(); card.focus?.(); return; }
    const first = f[0], last = f[f.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  });

  const api = {
    /** Llamar al ABRIR: recuerda de dónde venía el foco y lo mete en el diálogo. */
    focusFirst(trigger) {
      lastFocused = trigger || document.activeElement;
      const f = focusablesIn(card);
      (f[0] || card).focus?.();
    },
    /** Llamar al CERRAR: devuelve el foco al control que lo abrió, si sigue en el documento. */
    restoreFocus() {
      if (lastFocused && lastFocused.isConnected) lastFocused.focus?.();
      lastFocused = null;
    },
  };
  overlay._dlgWired = api;
  return api;
}

/**
 * Conecta un modal completo: semántica y foco (vía `makeAccessibleDialog`) MÁS los
 * triggers de apertura, el botón de cierre, el clic en el velo y Escape.
 *
 *  @param {Element} root        contenedor donde viven los triggers de apertura
 *  @param {Element} overlay     el `.sv-modal` a abrir/cerrar (null = no-op)
 *  @param {object}  opts
 *  @param {string}  opts.openSel    selector de los triggers de apertura (en `root`)
 *  @param {string}  opts.closeSel   selector del botón de cierre (en `overlay`)
 *  @param {Function}[opts.onOpen]   callback tras abrir; recibe el trigger pulsado
 *  @param {Function}[opts.onClose]  callback tras cerrar (limpieza extra)
 *  @param {boolean} [opts.keyboard] true → los triggers responden a Enter/Espacio
 *                                   (solo para chips `role="button"`; NO para <button>,
 *                                   que ya disparan click nativo y se duplicarían)
 *  @returns {{open: Function, close: Function}|null} controles programáticos
 */
export function bindModal(root, overlay, { openSel, closeSel, onOpen, onClose, keyboard = false } = {}) {
  if (!overlay) return null;
  // Escape cierra el overlay abierto reutilizando su backdrop (idempotente y global).
  registerModalEscape('.sv-modal.sv-open');

  const dlg = makeAccessibleDialog(overlay);

  const open = (trigger) => {
    overlay.classList.add('sv-open');
    document.body.classList.add('modal-open');
    if (onOpen) onOpen(trigger); // puede reconstruir el cuerpo: el foco se pone DESPUÉS
    dlg.focusFirst(trigger);
  };
  const close = () => {
    overlay.classList.remove('sv-open');
    document.body.classList.remove('modal-open');
    if (onClose) onClose();
    dlg.restoreFocus();
  };

  if (openSel) {
    root.querySelectorAll(openSel).forEach((b) => {
      b.addEventListener('click', () => open(b));
      if (keyboard) b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(b); }
      });
    });
  }
  if (closeSel) overlay.querySelector(closeSel)?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return { open, close };
}
