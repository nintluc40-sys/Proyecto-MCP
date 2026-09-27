// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T9 · desoves y marea (2026-09-27, usuario)

   Sólo las noches con registro de desoves (una noche sin ninguno en la granja es, casi siempre, un hueco del registro).
   Tasa = desoves ÷ hembras vivas esa noche × 100, agrupada por tipo de marea (Viva/Muerta), por fase lunar (en el orden del
   ciclo, con sus noches) y por día de la semana; y la correlación de la tasa con la iluminación y la amplitud, con su
   lectura: |r| < 2/√n no se distingue del azar. Medido ese día (29 noches): Viva 5,98 % · Muerta 6,29 %; r iluminación
   −0,13 · r amplitud −0,23 (umbral 0,37): sin relación. La hoja «Marea» (INOCAR) es la que ya lee el Supervisor.
   Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, mareaPorDia, desovesYMarea } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, muerte = '') => ({ 'Trovan ID': t, 'Sala actual': 'Sala 4', 'Tanque actual': 'Tanque 1', Estado: muerte ? 'Muerto' : 'Vivo', 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha) => ({ 'Trovan ID': t, Fecha: fecha, Tipo: 'Desove', Sala: 'Sala 4', Tanque: 'Tanque 1' });
const MA = (fecha, fase, ilum, tipo, amp) => ({ Fecha: fecha, 'Fase Lunar': fase, '%Iluminación': ilum, 'Tipo de Marea': tipo, 'Amplitud (m)': amp });
/* D muere el 02/06: 4 vivas el 01 y el 02 (el día que muere cuenta), 3 el 03 — así la tasa NO es proporcional al conteo.
   01/06 (lunes, luna nueva, 0 %, viva, 2,0 m): 2 desoves → 50 %; 02/06 (martes, creciente, 10 %, viva, 1,8 m): 1 → 25 %;
   03/06 (miércoles, creciente, 20 %, muerta, 1,0 m): 1 de 3 → 33,3 %; 04/06: sin desoves → no cuenta. Viva 3 de 8 = 37,5 % ·
   Muerta 1 de 3 = 33,3 % · Creciente 2 de 7 = 28,6 %. r(tasa, iluminación) = −0,65 · r(tasa, amplitud) = 0,37 (con los
   CONTEOS saldría −0,87); con 3 noches el umbral es 2/√3 = 1,15: ninguna se distingue del azar. */
const MATRIZ = [MZ('A'), MZ('B'), MZ('C'), MZ('D', '2026-06-02')];
const BITACORA = [EV('A', '2026-06-01'), EV('B', '2026-06-01'), EV('C', '2026-06-02'), EV('A', '2026-06-03')];
const MAREA = [MA('2026-06-01', 'Luna nueva', 0, 'Viva', 2.0), MA('2026-06-02', 'Creciente', 10, 'Viva', 1.8),
  MA('2026-06-03', 'Creciente', 20, 'Muerta', 1.0), MA('2026-06-04', 'Cuarto creciente', 50, 'Muerta', 0.8)];
const r2 = (v) => Math.round(v * 100) / 100;

describe('Microchips · T9 · el modelo', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('la hoja de Marea, por día (tolera «viva/VIVA» y la coma decimal)', () => {
    const m = mareaPorDia([{ Fecha: '2026-06-05', 'Fase Lunar': 'Luna llena', '%Iluminación': '99', 'Tipo de Marea': 'VIVA', 'Amplitud (m)': '2,4' }]);
    expect(m.get('2026-06-05')).toEqual({ fase: 'Luna llena', ilum: 99, tipo: 'Viva', amplitud: 2.4 });
  });

  it('🔴 sólo las noches con desoves; la tasa por tipo de marea, por fase (en el orden del ciclo) y por día de la semana', () => {
    const d = desovesYMarea(M(), mareaPorDia(MAREA), makeFilter({}));
    expect([d.noches, d.conMarea]).toEqual([3, 3]);
    expect(d.tipo.map((x) => [x.k, x.noches, r2(x.tasa)])).toEqual([['Viva', 2, 37.5], ['Muerta', 1, 33.33]]);
    expect(d.fase.map((x) => [x.k, x.noches, x.tasa == null ? null : r2(x.tasa)])).toEqual([
      ['Luna nueva', 1, 50], ['Creciente', 2, 28.57], ['Cuarto creciente', 0, null], ['Gibosa creciente', 0, null],
      ['Luna llena', 0, null], ['Gibosa menguante', 0, null], ['Cuarto menguante', 0, null], ['Menguante', 0, null]]);
    expect(d.dia.map((x) => [x.k, x.noches])).toEqual([['Lun', 1], ['Mar', 1], ['Mié', 1], ['Jue', 0], ['Vie', 0], ['Sáb', 0], ['Dom', 0]]);
  });

  it('🔴 la correlación con la iluminación y la amplitud, y el umbral 2/√n', () => {
    const d = desovesYMarea(M(), mareaPorDia(MAREA), makeFilter({}));
    expect([r2(d.r.ilum), r2(d.r.amp), r2(d.rCrit)]).toEqual([-0.65, 0.37, 1.15]);
  });
});

describe('Microchips · T9 · la tarjeta en Panorama', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora')), ...MAREA.map(O('Marea'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => { root.remove(); errSpy.mockRestore(); });

  it('🔴 marea viva frente a muerta, la correlación leída y las noches que la sostienen', () => {
    const c = root.querySelector('.mc-marea-card');
    expect(c).not.toBeNull();
    expect(c.querySelector('.mc-card-h').textContent).toContain('3 noches con registro');
    expect([...c.querySelectorAll('.mc-marea-tipo')].map((x) => x.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Viva 37,5 % 2 noches', 'Muerta 33,3 % 1 noche']);
    expect(c.querySelector('.mc-marea-r').textContent.replace(/\s+/g, ' ').trim())
      .toBe('Correlación con la iluminación −0,65 · con la amplitud 0,37 → con 3 noches, |r| < 1,15 no se distingue del azar: sin relación demostrable');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 por fase lunar (con sus noches; «—» sin noches) y por día de la semana', () => {
    const c = root.querySelector('.mc-marea-card');
    const fases = [...c.querySelectorAll('.mc-marea-fase tbody tr')].map((tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    expect(fases.slice(0, 3)).toEqual([['Luna nueva', '1', '50 %'], ['Creciente', '2', '28,6 %'], ['Cuarto creciente', '0', '—']]);
    const dias = [...c.querySelectorAll('.mc-marea-dia td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
    expect(dias.slice(0, 4)).toEqual(['Lun 50 %', 'Mar 25 %', 'Mié 33,3 %', 'Jue —']);
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const k of ['.mc-marea-tipo {', '.mc-marea-r {', '.mc-marea-dia td {']) expect(css.includes(k), k).toBe(true);
  });

  it('sin hoja de Marea, lo dice', () => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    maduracionView(root);
    expect(root.querySelector('.mc-marea-card .mc-vacio-t').textContent).toBe('Sin datos de marea para las noches con desoves');
  });
});
