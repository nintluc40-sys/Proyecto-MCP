// @vitest-environment happy-dom
// 2026-10-01 (usuario: «que se puedan englobar todos los resultados de cada departamento, tipo de análisis y demás»).
// La barra de mes de General, Bacteriología y Calidad de Agua tiene una parada más, «Todo el registro», tras el último
// mes; y una muestra SIN corrida (Maduración, Algas, Otras) va al mes de su FECHA de muestreo en vez de colarse en
// TODOS los meses (hallazgo H-001 de la auditoría de esta vista).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';
import { monthIndexOfDate } from '../../core/prodCalendar.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Tanque: 'TQ1', 'Población': '1000', ...o });
const M = (o) => ({ _SheetOrigin: 'Microbiología', ...o });
const C = (o) => ({ _SheetOrigin: 'Calidad de Agua', ...o });

// Julio = corridas 579–584, Agosto = 585–590 (calendario de producción). El año sale de las fechas de Larvicultura.
const DATOS = () => [
  L({ Corrida: '579', Fecha: '05/07/2026' }), L({ Corrida: '585', Fecha: '05/08/2026' }),
  M({ 'Fecha muestreo': '05/07/2026', Corrida: '579', Departamento: 'Larvicultura', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', 'V.Amarillos UFC': '100' }),
  M({ 'Fecha muestreo': '05/08/2026', Corrida: '585', Departamento: 'Larvicultura', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '2', 'V.Amarillos UFC': '200' }),
  M({ 'Fecha muestreo': '20/07/2026', Departamento: 'Maduración', Formato: 'Maduración · Principal', 'Módulo/Sala': 'Sala 1', 'V.Amarillos UFC': '300' }),
  M({ 'Fecha muestreo': '10/08/2026', Departamento: 'Algas', Formato: 'Algas Hisopado', 'V.Amarillos UFC': '400' }),
  C({ 'Fecha muestreo': '06/07/2026', Corrida: '579', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', 'TQ/N°': '1', pH: '8.0' }),
  C({ 'Fecha muestreo': '12/08/2026', Departamento: 'Maduración', Formato: 'Maduración', Sala: 'Sala 1', 'TQ/N°': '2', pH: '7.9' }),
];

let root, errSpy;
beforeEach(() => {
  store.globalData = DATOS();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

const etiqueta = (attr) => root.querySelector(`[${attr}="1"]`).closest('.mic-monthbar').querySelector('.mic-month-lbl').textContent.replace('📅', '').trim();
const paso = (attr, d) => click(root.querySelector(`[${attr}="${d}"]`));
// El estado de la vista (sub-vista y mes) sobrevive entre pruebas: se abre la sub-vista pedida y se deja la barra en el
// ÚLTIMO mes, el que se abre por defecto (hasta «Todo el registro» y un paso atrás).
const alUltimoMes = (attr) => {
  while (etiqueta(attr) !== 'Todo el registro' && !root.querySelector(`[${attr}="1"]`).disabled) paso(attr, 1);
  if (etiqueta(attr) === 'Todo el registro') paso(attr, -1);
};
const abrir = (sub, attr) => {
  microbiologiaView(root);
  click(root.querySelector(`[data-mic-sub="${sub}"]`));
  alUltimoMes(attr);
};
const muestras = () => root.querySelector('.mic-kpis').textContent.match(/Muestras\s*(\d+)/)[1];

describe('Bacteriología · el mes y «Todo el registro»', () => {
  it('🔴 una muestra SIN corrida va al mes de su fecha: ya no se cuela en todos los meses', () => {
    abrir('bacteriologia', 'data-mic-month');
    expect(etiqueta('data-mic-month')).toBe('Agosto');
    expect(muestras(), 'agosto: la de la corrida 585 y la de Algas del 10-08 (no la de Maduración del 20-07)').toBe('2');
    paso('data-mic-month', -1);
    expect(etiqueta('data-mic-month')).toBe('Julio');
    expect(muestras(), 'julio: la de la corrida 579 y la de Maduración del 20-07').toBe('2');
  });

  it('🔴 tras el último mes, «Todo el registro» engloba los resultados de todos los meses', () => {
    abrir('bacteriologia', 'data-mic-month');
    paso('data-mic-month', 1);
    expect(etiqueta('data-mic-month')).toBe('Todo el registro');
    expect(muestras()).toBe('4');
    expect(root.querySelector('[data-mic-month="1"]').disabled, 'después de «Todo el registro» no hay más').toBe(true);
    paso('data-mic-month', -1);
    expect(etiqueta('data-mic-month'), '◀ vuelve al último mes').toBe('Agosto');
  });

  it('🔴 una corrida que es un RANGO («579-580») va al mes de su primera corrida, no se queda sin mes', () => {
    store.globalData = [...DATOS(), M({ 'Fecha muestreo': '28/08/2026', Corrida: '579-580', Departamento: 'Maduración', Formato: 'Maduración · Despacho', 'V.Amarillos UFC': '500' })];
    abrir('bacteriologia', 'data-mic-month');
    paso('data-mic-month', -1);
    expect(etiqueta('data-mic-month')).toBe('Julio');
    expect(muestras(), 'julio: la de la corrida 579, la de Maduración del 20-07 y la de la corrida «579-580»').toBe('3');
  });

  it('la barra dice que lo que no tiene corrida va por su fecha (y no lo dice en «Todo el registro»)', () => {
    abrir('bacteriologia', 'data-mic-month');
    expect(root.querySelector('.mic-month-nota').textContent).toContain('por fecha de muestreo');
    paso('data-mic-month', 1);
    expect(root.querySelector('.mic-month-nota')).toBeNull();
  });
});

describe('Calidad de Agua y General · la misma barra', () => {
  it('🔴 Calidad de Agua: agosto sólo con lo de agosto; «Todo el registro» con todo', () => {
    abrir('calidad', 'data-cal-month');
    expect(etiqueta('data-cal-month')).toBe('Agosto');
    const enPantalla = () => root.querySelector('.mic-calagua').textContent;
    expect(enPantalla()).toContain('Maduración');
    paso('data-cal-month', 1);
    expect(etiqueta('data-cal-month')).toBe('Todo el registro');
    expect(enPantalla()).toContain('Larvicultura');
    expect(enPantalla()).toContain('Maduración');
  });

  it('🔴 General: «Todo el registro» y, al saltar a una sub-vista, ésta abre también en «Todo el registro»', () => {
    abrir('general', 'data-gen-month');
    paso('data-gen-month', 1);
    expect(etiqueta('data-gen-month')).toBe('Todo el registro');
    click(root.querySelector('[data-gen-goto="bacteriologia"]'));
    expect(etiqueta('data-mic-month')).toBe('Todo el registro');
    expect(muestras()).toBe('4');
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe('monthIndexOfDate · el mes interno de una fecha', () => {
  it('mismo índice que el de las corridas (Julio 2026 = 6, Agosto = 7) y el ciclo siguiente suma 12', () => {
    expect(monthIndexOfDate(new Date(2026, 6, 20))).toBe(6);
    expect(monthIndexOfDate(new Date(2026, 7, 10))).toBe(7);
    expect(monthIndexOfDate(new Date(2027, 0, 15))).toBe(12);
    expect(monthIndexOfDate(null)).toBe(-1);
  });

  it('sin ninguna fila con corrida y fecha no hay año base: -1 (sólo se ve en «Todo el registro»)', () => {
    store.globalData = [M({ 'Fecha muestreo': '20/07/2026', Departamento: 'Algas', Formato: 'Algas Hisopado' })];
    expect(monthIndexOfDate(new Date(2026, 6, 20))).toBe(-1);
  });
});
