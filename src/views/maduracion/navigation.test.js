// @vitest-environment happy-dom
// Test de humo de la vista Microchips: renderiza con datos sintéticos, recorre las
// 3 sub-vistas, cambia período/filtros y abre el modal de historial de una hembra,
// verificando que no haya errores de runtime.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { maduracionView } from './index.js';

const M = (o) => ({ _SheetOrigin: 'Maduración MATRIZ', ...o });
const B = (o) => ({ _SheetOrigin: 'Maduración Bitácora', ...o });
const TR = (o) => ({ _SheetOrigin: 'Maduración Transferencias', ...o });

function synthData() {
  return [
    M({ 'Trovan ID': 'A1', 'Número': '1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' }),
    M({ 'Trovan ID': 'A2', 'Número': '2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' }),
    M({ 'Trovan ID': 'A3', 'Número': '3', 'Sala actual': 'S2', 'Tanque actual': 'T3', Estado: 'Muerto', 'Fecha ingreso': '2026-05-01', 'Fecha muerte': '2026-06-20' }),
    // Bitácora real: solo Trovan/Fecha/Tipo → la ubicación se deriva por Trovan (MATRIZ).
    B({ 'Trovan ID': 'A1', Fecha: '2026-06-01', Tipo: 'Desove' }),
    B({ 'Trovan ID': 'A1', Fecha: '2026-06-12', Tipo: 'Desove' }),
    B({ 'Trovan ID': 'A2', Fecha: '2026-06-05', Tipo: 'Desove' }),
    B({ 'Trovan ID': 'A3', Fecha: '2026-06-20', Tipo: 'Mortalidad' }),
    TR({ 'TR-ID': 'TR-000001', Fecha: '2026-06-10', Tipo: 'Traslado', 'Trovan ID': 'A2', 'Sala origen': 'S1', 'Tanque origen': 'T1', 'Sala destino': 'S1', 'Tanque destino': 'T2' }),
  ];
}

const click = (el) => el && el.dispatchEvent(new Event('click', { bubbles: true }));

describe('Microchips · navegación integral', () => {
  let root, errSpy;
  beforeEach(() => {
    store.globalData = synthData();
    root = document.createElement('div');
    document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { root.remove(); errSpy.mockRestore(); });

  it('renderiza Panorama con KPIs y tendencias', () => {
    maduracionView(root);
    expect(root.querySelector('.mc-title').textContent).toContain('Microchips');
    expect(root.querySelectorAll('.mc-kpi').length).toBeGreaterThanOrEqual(6);
    expect(root.querySelector('#mcTrend')).toBeTruthy();
    expect(root.querySelector('#mcStateDonut')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('cambia a Salas y Tanques y alterna el nivel', () => {
    maduracionView(root);
    click([...root.querySelectorAll('[data-mc-sub]')].find((b) => b.dataset.mcSub === 'operativo'));
    expect(root.querySelector('.mc-table')).toBeTruthy();
    // Toggle Por sala.
    click([...root.querySelectorAll('[data-mc-level]')].find((b) => b.dataset.mcLevel === 'sala'));
    expect(root.querySelector('.mc-table')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('en Hembras abre el historial de una hembra desde el ranking', () => {
    maduracionView(root);
    click([...root.querySelectorAll('[data-mc-sub]')].find((b) => b.dataset.mcSub === 'hembras'));
    const fem = root.querySelector('[data-mc-female]');
    expect(fem).toBeTruthy();
    click(fem);
    const modal = root.querySelector('#mcFemaleModal');
    expect(modal.classList.contains('sv-open')).toBe(true);
    expect(root.querySelector('#mcFemBody').innerHTML).toContain('Desoves');
    // Cierra.
    click(root.querySelector('[data-mc-fem-close]'));
    expect(modal.classList.contains('sv-open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('el stepper de período filtra a un mes', () => {
    maduracionView(root);
    // Avanza de "Todo el histórico" al primer mes.
    click(root.querySelector('[data-mc-monthnav="1"]'));
    expect(root.querySelector('.mc-mlbl').textContent).toContain('2026');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('muestra estado vacío sin datos de Maduración', () => {
    store.globalData = [{ _SheetOrigin: 'Larvicultura', Fecha: '2026-06-01' }];
    maduracionView(root);
    expect(root.textContent).toContain('Sin datos del Registro Reproductivo');
    expect(errSpy).not.toHaveBeenCalled();
  });
});
