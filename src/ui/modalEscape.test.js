// @vitest-environment happy-dom
// Contrato del helper transversal de cierre con Escape: al pulsar Escape se hace
// click en el overlay ABIERTO (lo que dispara su cierre real por backdrop), y solo
// cuando hay un modal abierto (body.modal-open). No-op en cualquier otro caso.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerModalEscape } from './modalEscape.js';

function pressEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function makeOverlay(openClass) {
  const ov = document.createElement('div');
  ov.className = `test-modal ${openClass}`;
  let clicks = 0;
  ov.addEventListener('click', (e) => { if (e.target === ov) clicks++; });
  document.body.appendChild(ov);
  return { ov, clicks: () => clicks };
}

describe('registerModalEscape', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.classList.remove('modal-open');
  });
  afterEach(() => {
    document.body.classList.remove('modal-open');
  });

  it('cierra (hace click) el overlay abierto al pulsar Escape con modal-open', () => {
    registerModalEscape('.test-modal.tm-open');
    const m = makeOverlay('tm-open');
    document.body.classList.add('modal-open');
    pressEscape();
    expect(m.clicks()).toBe(1);
  });

  it('es no-op si no hay modal abierto (sin body.modal-open)', () => {
    registerModalEscape('.test-modal.tm-open');
    const m = makeOverlay('tm-open');
    // falta document.body.classList.add('modal-open')
    pressEscape();
    expect(m.clicks()).toBe(0);
  });

  it('es no-op si el overlay no está en estado abierto', () => {
    registerModalEscape('.test-modal.tm-open');
    const m = makeOverlay('tm-closed'); // no coincide con el selector abierto
    document.body.classList.add('modal-open');
    expect(() => pressEscape()).not.toThrow();
    expect(m.clicks()).toBe(0);
  });

  it('ignora teclas que no son Escape', () => {
    registerModalEscape('.test-modal.tm-open');
    const m = makeOverlay('tm-open');
    document.body.classList.add('modal-open');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(m.clicks()).toBe(0);
  });
});
