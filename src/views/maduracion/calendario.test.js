// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · V2 · calendario de desoves (2026-09-27, usuario)

   Matriz tanque × día bajo el mapa de «Salas y Tanques»: filas = tanques con hembras con chip, más una fila «Granja»
   con el total; columnas = los días del mes elegido (en «Todo el histórico», todos los días del período); el color es
   el Nº de desoves de esa noche, en intensidad. Los días sin NINGÚN desove en la granja van rayados: son los huecos
   del registro (medido ese día: desoves registrados sólo del 1 al 11 de julio y del 8 al 26 de septiembre; 59 de 88
   días sin ninguno). Sigue el mes, el lote, el código y el tanque elegido; los huecos son de la GRANJA (no dependen del
   tanque elegido). Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, calendarioDesoves } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, sala, tq) => ({ 'Trovan ID': t, 'Sala actual': sala, 'Tanque actual': tq, Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' });
const EV = (t, fecha, sala, tq) => ({ 'Trovan ID': t, Fecha: fecha, Tipo: 'Desove', Sala: sala, Tanque: tq });
/* Junio 1–5: S4·T1 (A, B) desova el 1 (×2) y el 3; S1·T2 (C) el 1 y el 5; el 2 y el 4, nadie → huecos. */
const MATRIZ = [MZ('A', 'Sala 4', 'Tanque 1'), MZ('B', 'Sala 4', 'Tanque 1'), MZ('C', 'Sala 1', 'Tanque 2')];
const BITACORA = [EV('A', '2026-06-01', 'Sala 4', 'Tanque 1'), EV('B', '2026-06-01', 'Sala 4', 'Tanque 1'), EV('A', '2026-06-03', 'Sala 4', 'Tanque 1'),
  EV('C', '2026-06-01', 'Sala 1', 'Tanque 2'), EV('C', '2026-06-05', 'Sala 1', 'Tanque 2')];

describe('Microchips · V2 · el modelo del calendario', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 los días del período, la fila Granja, una fila por tanque (sala y número en orden) y los huecos', () => {
    const c = calendarioDesoves(M(), makeFilter({}));
    expect(c.dias).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
    expect(c.granja).toEqual([3, 0, 1, 0, 1]);
    expect(c.filas.map((r) => [r.key, r.n, r.total])).toEqual([['Sala 1 · Tanque 2', [1, 0, 0, 0, 1], 2], ['Sala 4 · Tanque 1', [2, 0, 1, 0, 0], 3]]);
    expect(c.huecos).toEqual([false, true, false, true, false]);
    expect([c.max, c.maxGranja]).toEqual([2, 3]);
  });

  it('🔴 con un mes, todos sus días hasta el último dato (no hasta el 30)', () => {
    const c = calendarioDesoves(M(), makeFilter({ month: '2026-06' }));
    expect(c.dias[0]).toBe('2026-06-01');
    expect(c.dias[c.dias.length - 1]).toBe('2026-06-05');
  });

  it('🔴 con un tanque elegido, sólo su fila; la Granja y los huecos siguen siendo de TODA la granja', () => {
    const c = calendarioDesoves(M(), makeFilter({ sala: 'Sala 1', tanque: 'Tanque 2' }));
    expect(c.filas.map((r) => r.key)).toEqual(['Sala 1 · Tanque 2']);
    expect(c.granja).toEqual([3, 0, 1, 0, 1]);
    expect(c.huecos).toEqual([false, true, false, true, false]);
  });

  it('sin eventos, vacío (sin reventar)', () => {
    const c = calendarioDesoves(buildReproModel(MATRIZ, [], []), makeFilter({}));
    expect([c.dias, c.filas, c.granja]).toEqual([[], [], []]);
  });
});

describe('Microchips · V2 · la tarjeta del calendario', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="operativo"]'));
  });
  afterEach(() => { click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); });

  it('🔴 bajo el mapa, con la fila Granja, una fila por tanque y las cifras de cada noche', () => {
    const card = root.querySelector('.mc-cal-card');
    expect(card).not.toBeNull();
    expect(root.querySelector('.mc-mapa-card').nextElementSibling).toBe(card);
    const filas = [...card.querySelectorAll('tbody tr')];
    expect(filas.map((tr) => tr.querySelector('th').textContent.trim())).toEqual(['Granja', 'Sala 1 · Tanque 2', 'Sala 4 · Tanque 1']);
    expect([...filas[2].querySelectorAll('td')].map((td) => td.textContent.trim())).toEqual(['2', '', '1', '', '']);
    expect(filas[2].querySelector('td').getAttribute('title')).toBe('Sala 4 · Tanque 1 · 01/06/2026: 2 desoves');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 los días sin ningún desove en la granja van rayados, y la nota los cuenta', () => {
    const card = root.querySelector('.mc-cal-card');
    const cab = [...card.querySelectorAll('thead th.mc-cal-d')];
    expect(cab.map((th) => th.classList.contains('is-hueco'))).toEqual([false, true, false, true, false]);
    expect([...card.querySelectorAll('tbody tr')[1].querySelectorAll('td')].map((td) => td.classList.contains('is-hueco'))).toEqual([false, true, false, true, false]);
    expect(card.querySelector('.mc-cal-nota').textContent).toContain('2 de 5 días sin ningún desove en la granja');
  });

  it('🔴 la intensidad crece con los desoves (la celda más alta, al máximo; el cero, sin color)', () => {
    const tds = [...root.querySelectorAll('.mc-cal-card tbody tr')[2].querySelectorAll('td')];
    expect(tds[0].style.getPropertyValue('--mc-cal-a')).toBe('1');
    expect(Number(tds[2].style.getPropertyValue('--mc-cal-a'))).toBeLessThan(1);
    expect(tds[1].classList.contains('is-0')).toBe(true);
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-cal-wrap {', '.mc-cal td {', '.mc-cal td.is-hueco, .mc-cal th.is-hueco {', '.mc-cal td.is-0 {']) expect(css.includes(c), c).toBe(true);
  });
});
