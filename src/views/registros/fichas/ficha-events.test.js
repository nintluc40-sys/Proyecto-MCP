// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachFichaEvents } from './ficha-events.js';
import { renderCalidadFicha } from './calidad.render.js';
import { renderCalaguaFicha } from './calagua.render.js';

function mount(engine) {
  const root = document.createElement('div');
  root.innerHTML = renderCalidadFicha({ modLabel: 'M01' });
  document.body.appendChild(root);
  attachFichaEvents(root, engine);
  return root;
}

describe('attachFichaEvents', () => {
  let engine;
  beforeEach(() => {
    document.body.innerHTML = '';
    engine = {
      upInp: vi.fn(),
      rcPob: vi.fn(),
      localSave: vi.fn(),
      localSync: vi.fn(),
      onTqNameChange: vi.fn(),
      clearFicha: vi.fn(),
      recoverFicha: vi.fn(),
      downloadPDF: vi.fn(),
      shareFichaPDF: vi.fn(),
      openCS: vi.fn(),
      aguaSyncRowColor: vi.fn(),
    };
  });

  it('input en estadio (data-upper) llama upInp', () => {
    const root = mount(engine);
    const est = root.querySelector('input[name="e_0"]');
    est.dispatchEvent(new Event('input', { bubbles: true }));
    expect(engine.upInp).toHaveBeenCalledWith(est);
  });

  it('input en %Mortalidad (data-feeds) llama rcPob', () => {
    const root = mount(engine);
    const mo = root.querySelector('input[name="mo_0"]');
    expect(mo.getAttribute('data-feeds')).toBe('poblacion');
    mo.dispatchEvent(new Event('input', { bubbles: true }));
    expect(engine.rcPob).toHaveBeenCalled();
  });

  it('input en un campo numérico normal NO dispara nada', () => {
    const root = mount(engine);
    root.querySelector('input[name="ll_0"]').dispatchEvent(new Event('input', { bubbles: true }));
    expect(engine.upInp).not.toHaveBeenCalled();
    expect(engine.rcPob).not.toHaveBeenCalled();
  });

  it('click en Guardar local → localSave(ficha)', () => {
    const root = mount(engine);
    root.querySelector('[data-action="save"]').click();
    expect(engine.localSave).toHaveBeenCalledWith('calidad');
  });

  it('click en Guardar y sincronizar → localSync(ficha)', () => {
    const root = mount(engine);
    root.querySelector('[data-action="sync"]').click();
    expect(engine.localSync).toHaveBeenCalledWith('calidad');
  });

  it('botonera: Borrar/PDF/Compartir delegan en el motor', () => {
    const root = mount(engine);
    root.querySelector('[data-action="clear"]').click();
    expect(engine.clearFicha).toHaveBeenCalledWith('calidad');
    root.querySelector('[data-action="pdf"]').click();
    expect(engine.downloadPDF).toHaveBeenCalledWith('calidad');
    root.querySelector('[data-action="share"]').click();
    expect(engine.shareFichaPDF).toHaveBeenCalledWith('calidad');
  });

  it('Recuperar (cuando hay autoguardado) llama recoverFicha', () => {
    const root = document.createElement('div');
    root.innerHTML = renderCalidadFicha({ modLabel: 'M01', recover: { label: '08:30' } });
    document.body.appendChild(root);
    attachFichaEvents(root, engine);
    root.querySelector('[data-action="recover"]').click();
    expect(engine.recoverFicha).toHaveBeenCalledWith('calidad');
  });

  it('calagua: change en estadío (data-agua-est) llama aguaSyncRowColor', () => {
    const root = document.createElement('div');
    root.innerHTML = renderCalaguaFicha({ modLabel: 'M01' });
    document.body.appendChild(root);
    attachFichaEvents(root, engine);
    const est = root.querySelector('input[name="e_0"]');
    est.dispatchEvent(new Event('change', { bubbles: true }));
    expect(engine.aguaSyncRowColor).toHaveBeenCalledWith(est);
  });

  it('es idempotente: no duplica listeners al re-adjuntar', () => {
    const root = mount(engine);
    attachFichaEvents(root, engine); // segundo intento
    root.querySelector('[data-action="save"]').click();
    expect(engine.localSave).toHaveBeenCalledTimes(1);
  });

  it('no falla si el motor aún no expone una función', () => {
    const root = mount({}); // motor vacío
    expect(() => root.querySelector('[data-action="save"]').click()).not.toThrow();
  });
});
