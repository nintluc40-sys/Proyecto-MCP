// @vitest-environment happy-dom
// `makeAccessibleDialog` es la pieza COMPARTIDA de accesibilidad de los diálogos.
// Vivía dentro de views/supervisor/ui.js, así que sólo Supervisor tenía semántica de
// diálogo y foco atrapado: sus 11 modales llevaban role="dialog" y los 10 de
// Microbiología, ninguno.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeAccessibleDialog } from './modal.js';

function overlayHTML() {
  const ov = document.createElement('div');
  ov.className = 'sv-modal';
  ov.innerHTML = `<div class="sv-modal-card">
      <span class="sv-modal-title">Título del diálogo</span>
      <button id="b1">uno</button>
      <button id="b2">dos</button>
    </div>`;
  document.body.appendChild(ov);
  return ov;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('makeAccessibleDialog', () => {
  it('marca la tarjeta como diálogo y la etiqueta con su título', () => {
    const ov = overlayHTML();
    makeAccessibleDialog(ov);
    const card = ov.querySelector('.sv-modal-card');
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(card.getAttribute('tabindex')).toBe('-1');
    const titleId = ov.querySelector('.sv-modal-title').id;
    expect(titleId).toBeTruthy();
    expect(card.getAttribute('aria-labelledby')).toBe(titleId);
  });

  it('mete el foco dentro al abrir y lo devuelve al trigger al cerrar', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const ov = overlayHTML();
    const dlg = makeAccessibleDialog(ov);

    dlg.focusFirst(trigger);
    expect(document.activeElement.id).toBe('b1');   // primer enfocable del diálogo

    dlg.restoreFocus();
    expect(document.activeElement).toBe(trigger);   // vuelve de donde vino
  });

  it('Tab queda circular DENTRO del diálogo (no se escapa al fondo)', () => {
    const ov = overlayHTML();
    makeAccessibleDialog(ov);
    const b1 = ov.querySelector('#b1'), b2 = ov.querySelector('#b2');

    b2.focus();
    const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ov.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);        // no deja pasar al fondo
    expect(document.activeElement).toBe(b1);        // vuelve al primero

    b1.focus();
    const shiftTab = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    ov.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2);        // y hacia atrás, al último
  });

  it('es idempotente: repetirlo no duplica el cableado', () => {
    const ov = overlayHTML();
    const a = makeAccessibleDialog(ov);
    const b = makeAccessibleDialog(ov);
    expect(b).toBe(a);
  });

  it('sin overlay devuelve null en vez de reventar', () => {
    expect(makeAccessibleDialog(null)).toBeNull();
  });
});
