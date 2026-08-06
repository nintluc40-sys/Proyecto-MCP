// @vitest-environment happy-dom
// Regresión de la gestión de foco de `bindModal` (M-05), común a los ~15 modales del
// Supervisor: semántica de diálogo, foco inicial dentro, trampa de Tab y devolución.
import { describe, it, expect, beforeEach } from 'vitest';
import { bindModal } from './ui.js';

function montar() {
  document.body.innerHTML = `
    <div id="root">
      <button data-abrir>Abrir</button>
      <button id="detras">Control de la página de detrás</button>
      <div class="sv-modal" id="ov">
        <div class="sv-modal-card">
          <div class="sv-modal-head">
            <span class="sv-modal-title">Título</span>
            <button class="sv-modal-x" data-cerrar>✕</button>
          </div>
          <div class="sv-modal-body">
            <input id="campo">
            <button id="ultimo">Último</button>
          </div>
        </div>
      </div>
    </div>`;
  const root = document.querySelector('#root');
  const overlay = document.querySelector('#ov');
  const api = bindModal(root, overlay, { openSel: '[data-abrir]', closeSel: '[data-cerrar]' });
  return { root, overlay, api, card: overlay.querySelector('.sv-modal-card') };
}

const tab = (shift = false) => document.activeElement.dispatchEvent(
  new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }));

beforeEach(() => { document.body.innerHTML = ''; });

describe('bindModal · semántica de diálogo', () => {
  it('marca la tarjeta como diálogo modal y la enlaza con su título', () => {
    const { card, overlay } = montar();
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    const t = overlay.querySelector('.sv-modal-title');
    expect(card.getAttribute('aria-labelledby')).toBe(t.id);
    expect(t.id).toBeTruthy();
  });
});

describe('bindModal · foco', () => {
  it('al abrir, el foco entra en el diálogo (primer enfocable: el botón de cierre)', () => {
    const { root } = montar();
    root.querySelector('[data-abrir]').click();
    expect(document.activeElement).toBe(document.querySelector('[data-cerrar]'));
  });

  it('al cerrar, el foco vuelve al control que abrió el modal', () => {
    const { root } = montar();
    const abrir = root.querySelector('[data-abrir]');
    abrir.click();
    expect(document.activeElement).not.toBe(abrir);
    document.querySelector('[data-cerrar]').click();
    expect(document.activeElement).toBe(abrir);
  });

  it('Tab en el ÚLTIMO enfocable vuelve al primero, no se escapa al fondo', () => {
    const { root } = montar();
    root.querySelector('[data-abrir]').click();
    document.querySelector('#ultimo').focus();
    tab();
    expect(document.activeElement).toBe(document.querySelector('[data-cerrar]'));
  });

  it('Shift+Tab en el PRIMERO va al último, no al control de detrás', () => {
    const { root } = montar();
    root.querySelector('[data-abrir]').click();
    document.querySelector('[data-cerrar]').focus();
    tab(true);
    expect(document.activeElement).toBe(document.querySelector('#ultimo'));
    expect(document.activeElement).not.toBe(document.querySelector('#detras'));
  });

  it('el cierre por backdrop también devuelve el foco', () => {
    const { root, overlay } = montar();
    const abrir = root.querySelector('[data-abrir]');
    abrir.click();
    overlay.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).toBe(abrir);
  });
});
