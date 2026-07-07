// @vitest-environment happy-dom
// Test de integración del cableado de eventos de TODAS las fichas de Registros:
// renderiza cada ficha, adjunta un motor simulado y dispara cada evento delegado
// (data-*), verificando que enruta a la función correcta del motor sin errores.
// Complementa ficha-events.test.js (que solo cubre calidad/calagua).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachFichaEvents } from './ficha-events.js';
import { renderCalidadFicha } from './calidad.render.js';
import { renderPlgFicha } from './plg.render.js';
import { renderParamsFicha } from './params.render.js';
import { renderPoblacionFicha } from './poblacion.render.js';
import { renderCalaguaFicha } from './calagua.render.js';
import { renderDespachoFicha } from './despacho.render.js';
import { renderDesinfeccionFicha } from './desinfeccion.render.js';

function fullEngine() {
  return {
    upInp: vi.fn(), rcPob: vi.fn(), chkParam: vi.fn(),
    rcDespSv: vi.fn(), rcDespBiomasa: vi.fn(), rcDespDensidad: vi.fn(),
    localSave: vi.fn(), localSync: vi.fn(), clearFicha: vi.fn(), recoverFicha: vi.fn(),
    downloadPDF: vi.fn(), shareFichaPDF: vi.fn(), downloadDesinfeccionPDF: vi.fn(),
    openCS: vi.fn(), openTON: vi.fn(), onTqNameChange: vi.fn(), aguaSyncRowColor: vi.fn(),
    dxFechaChange: vi.fn(), dxSwitchType: vi.fn(),
  };
}

function mount(html, engine) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  attachFichaEvents(root, engine);
  return root;
}
const input = (el) => el.dispatchEvent(new window.Event('input', { bubbles: true }));
const change = (el) => el.dispatchEvent(new window.Event('change', { bubbles: true }));

let engine;
beforeEach(() => { document.body.innerHTML = ''; engine = fullEngine(); });

describe('Registros · cableado de eventos por ficha', () => {
  it('todas las fichas renderizan HTML no vacío con la botonera estándar', () => {
    const opts = { modLabel: 'M01' };
    const fichas = {
      calidad: renderCalidadFicha(opts),
      plg: renderPlgFicha(opts),
      params: renderParamsFicha(opts),
      poblacion: renderPoblacionFicha(opts),
      calagua: renderCalaguaFicha(opts),
      despacho: renderDespachoFicha({ ...opts, destinos: ['Piscina 1'] }),
    };
    Object.entries(fichas).forEach(([id, html]) => {
      expect(html, id).toContain('data-action="save"');
      expect(html, id).toContain(`data-ficha="${id}"`);
    });
  });

  it('params: input en celda OD/°C dispara chkParam(el, min, max)', () => {
    const root = mount(renderParamsFicha({ modLabel: 'M01' }), engine);
    const cell = root.querySelector('input[data-chkmin]');
    expect(cell).toBeTruthy();
    input(cell);
    expect(engine.chkParam).toHaveBeenCalledWith(cell, Number(cell.dataset.chkmin), Number(cell.dataset.chkmax));
  });

  it('despacho: input en Población dispara los 3 recalcs; PLG solo biomasa', () => {
    const root = mount(renderDespachoFicha({ modLabel: 'M01', destinos: ['P1'] }), engine);
    const po = root.querySelector('input[data-desp-po]');
    const pgm = root.querySelector('input[data-desp-pgm]');
    expect(po).toBeTruthy(); expect(pgm).toBeTruthy();
    input(po);
    expect(engine.rcDespSv).toHaveBeenCalled();
    expect(engine.rcDespBiomasa).toHaveBeenCalledTimes(1);
    expect(engine.rcDespDensidad).toHaveBeenCalled();
    input(pgm);
    expect(engine.rcDespBiomasa).toHaveBeenCalledTimes(2); // +1 por PLG
    expect(engine.rcDespSv).toHaveBeenCalledTimes(1);       // PLG NO re-dispara sv
  });

  it('despacho: botón TON → openTON', () => {
    const root = mount(renderDespachoFicha({ modLabel: 'M01', destinos: ['P1'] }), engine);
    root.querySelector('[data-action="ton"]').click();
    expect(engine.openTON).toHaveBeenCalled();
  });

  it('poblacion: input en Población dispara rcPob; botón CS → openCS', () => {
    const root = mount(renderPoblacionFicha({ modLabel: 'M01' }), engine);
    input(root.querySelector('input[data-feeds="poblacion"]'));
    expect(engine.rcPob).toHaveBeenCalled();
    root.querySelector('[data-action="cs"]').click();
    expect(engine.openCS).toHaveBeenCalled();
  });

  it('calagua: change en estadío → aguaSyncRowColor', () => {
    const root = mount(renderCalaguaFicha({ modLabel: 'M01' }), engine);
    const est = root.querySelector('input[data-agua-est]');
    change(est);
    expect(engine.aguaSyncRowColor).toHaveBeenCalledWith(est);
  });

  it('desinfeccion: cambio de fecha → dxFechaChange; tipo → dxSwitchType; PDF propio', () => {
    const types = [{ n: 1, label: 'Módulo', cats: ['Paredes'], obsGen: true }, { n: 2, label: 'Materiales', cats: ['Mangueras'], obsGen: false }];
    const catTable = (t, cat) => `<div class="dx-cat"><input name="dx_${t.n}_${cat}_0"></div>`;
    const root = mount(renderDesinfeccionFicha({ modLabel: 'M01', types, catTable }), engine);
    const fecha = root.querySelector('[data-dx-fecha]');
    fecha.value = '2026-06-10'; change(fecha);
    expect(engine.dxFechaChange).toHaveBeenCalledWith('2026-06-10');
    const tipo = root.querySelector('[data-dx-tipo]');
    tipo.value = '2'; change(tipo);
    expect(engine.dxSwitchType).toHaveBeenCalledWith('2');
    root.querySelector('[data-action="pdfdesinf"]').click();
    expect(engine.downloadDesinfeccionPDF).toHaveBeenCalledWith('desinfeccion');
    // Desinfección NO ofrece botón Compartir
    expect(root.querySelector('[data-action="share"]')).toBeNull();
  });

  it('tqname: tanque personalizado (i>=12) → onTqNameChange(idx, el)', () => {
    const root = mount(renderCalidadFicha({ modLabel: 'M01', tankCount: 13 }), engine);
    const custom = root.querySelector('input[data-action="tqname"]');
    expect(custom).toBeTruthy();
    expect(Number(custom.dataset.tank)).toBe(12);
    change(custom);
    expect(engine.onTqNameChange).toHaveBeenCalledWith(12, custom);
  });

  it('estadío (data-upper) en cada ficha con tanques dispara upInp', () => {
    [renderCalidadFicha, renderPlgFicha, renderPoblacionFicha, renderCalaguaFicha]
      .forEach((fn) => {
        document.body.innerHTML = '';
        const eng = fullEngine();
        const root = mount(fn({ modLabel: 'M01' }), eng);
        const up = root.querySelector('input[data-upper]');
        expect(up).toBeTruthy();
        input(up);
        expect(eng.upInp).toHaveBeenCalledWith(up);
      });
  });
});
