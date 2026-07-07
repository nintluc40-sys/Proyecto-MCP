// src/ui/modalEscape.js — Helper transversal para cerrar modales con la tecla Escape.
//
// Contexto: cada vista cierra sus modales por el botón ✕ y por clic en el backdrop
// (un manejador que comprueba `e.target === overlay`). Biología Molecular, Microbiología
// y Visitante ya añaden Escape con un guard `docWired` propio; este helper lleva ese
// mismo comportamiento a Supervisor, Larvicultura, Algas y Revisiones de forma uniforme.
//
// Cómo: cada vista registra los SELECTORES de sus overlays en estado ABIERTO. Al pulsar
// Escape se localiza el primero presente y se le hace `overlay.click()`, lo que dispara
// el manejador de backdrop YA EXISTENTE del overlay y, por tanto, su cierre REAL (destruye
// sus charts, quita `body.modal-open`, ejecuta los callbacks onClose). Así no se duplica
// la lógica de cierre ni sus limpiezas.
//
// El listener global se registra UNA sola vez (idempotente entre navegaciones) y es no-op
// cuando no hay ningún modal abierto (revisa el DOM en cada pulsación).

const overlaySelectors = new Set();
let wired = false;

/**
 * Registra selectores de overlays de una vista para cerrarlos con Escape.
 * Idempotente: repetir el mismo selector no lo duplica y el listener global se
 * conecta una única vez.
 * @param {...string} selectors  selectores CSS de overlays en estado ABIERTO
 *   (p.ej. '.sv-modal.sv-open'). Deben coincidir SOLO cuando el modal está visible.
 */
export function registerModalEscape(...selectors) {
  selectors.forEach((s) => overlaySelectors.add(s));
  if (wired) return;
  wired = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.body.classList.contains('modal-open')) return;
    for (const sel of overlaySelectors) {
      const ov = document.querySelector(sel);
      if (ov) {
        ov.click();
        return;
      }
    }
  });
}
