// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T7 · la mortalidad tras el desove (2026-09-27, usuario)

   ¿Mueren más en los 0–N días tras un desove? Tasa diaria DENTRO de esa ventana frente al RESTO del tiempo (desde el
   primer desove de cada hembra hasta su muerte o el último dato), y el riesgo relativo con su lectura. Medido ese día:
   0–2 d → 1,01 %/día frente a 2,42 %/día (riesgo relativo 0,42: mueren MENOS tras desovar); 692 muertas nunca desovaron.
   Selector 1 | 2 | 3 días (2 por defecto); por tanque; vigila si algún día pasa de 1. Fixture ficticio (con un riesgo
   relativo > 1, para leer la otra rama) y cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, mortalidadPostDesove } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, tq, muerte = '') => ({ 'Trovan ID': t, 'Sala actual': 'Sala 4', 'Tanque actual': tq, Estado: muerte ? 'Muerto' : 'Vivo', 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha, tq, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'Sala 4', Tanque: tq });
/* Último dato: 11/06. Con 2 días: A (T1) desova el 05 y el 10 y muere el 11 → de sus 7 días (05–11) 5 dentro y 2 fuera,
   muere DENTRO; B (T1) desova el 02 y muere el 09 → 3 dentro y 5 fuera, muere FUERA; C (T2) viva, desova el 01 → 3 dentro
   y 8 fuera; D (T2) muere el 04 sin desovar. Dentro 1 en 11 (9,09 %/día), fuera 1 en 15 (6,67 %/día) → 1,36. */
const MATRIZ = [MZ('A', 'Tanque 1', '2026-06-11'), MZ('B', 'Tanque 1', '2026-06-09'), MZ('C', 'Tanque 2'), MZ('D', 'Tanque 2', '2026-06-04')];
const BITACORA = [EV('A', '2026-06-05', 'Tanque 1'), EV('A', '2026-06-10', 'Tanque 1'), EV('A', '2026-06-11', 'Tanque 1', 'Mortalidad'),
  EV('B', '2026-06-02', 'Tanque 1'), EV('B', '2026-06-09', 'Tanque 1', 'Mortalidad'), EV('C', '2026-06-01', 'Tanque 2'), EV('D', '2026-06-04', 'Tanque 2', 'Mortalidad')];
const r2 = (v) => Math.round(v * 100) / 100;

describe('Microchips · T7 · el modelo', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 con 2 días: hembra-días y muertes dentro y fuera, sus tasas, el riesgo relativo y las que nunca desovaron', () => {
    const p = mortalidadPostDesove(M(), makeFilter({}), 2);
    expect([p.dentro.dias, p.dentro.muertes, r2(p.dentro.tasa), p.fuera.dias, p.fuera.muertes, r2(p.fuera.tasa), r2(p.rr), p.nuncaDesovaron])
      .toEqual([11, 1, 9.09, 15, 1, 6.67, 1.36, 1]);
  });

  it('🔴 la ventana cambia el reparto (con 1 día: 8 dentro y 18 fuera)', () => {
    const p = mortalidadPostDesove(M(), makeFilter({}), 1);
    expect([p.dentro.dias, p.fuera.dias, r2(p.rr)]).toEqual([8, 18, 2.25]);
  });

  it('🔴 por tanque, las muertes dentro y fuera (sólo tanques con muertes de desovadoras)', () => {
    const p = mortalidadPostDesove(M(), makeFilter({}), 2);
    expect(p.porTanque.map((t) => [t.key, t.dentro, t.fuera])).toEqual([['Sala 4 · Tanque 1', 1, 1]]);
  });
});

describe('Microchips · T7 · la tarjeta', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  const card = () => root.querySelector('.mc-post-card');
  const filas = () => [...card().querySelectorAll('.mc-post-res tr')].map((tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="operativo"]'));
  });
  afterEach(() => {
    const b = root.querySelector('[data-mc-postv="2"]'); if (b) click(b);
    click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore();
  });

  it('🔴 en «Salas y Tanques», con 2 días por defecto: dentro, resto, riesgo relativo leído y las que nunca desovaron', () => {
    expect(card()).not.toBeNull();
    expect(root.querySelector('[data-mc-postv="2"]').getAttribute('aria-pressed')).toBe('true');
    expect(filas()).toEqual([
      ['En los 0–2 días tras desovar', '9,09 %/día', '1 muerte en 11 hembra-días'],
      ['El resto del tiempo', '6,67 %/día', '1 muerte en 15 hembra-días'],
      ['Riesgo relativo', '1,36', 'mueren MÁS tras desovar: posible estrés post-desove'],
      ['Muertas que nunca desovaron', '1', ''],
    ]);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 el selector de días', () => {
    click(root.querySelector('[data-mc-postv="1"]'));
    expect(filas()[0][0]).toBe('En los 0–1 días tras desovar');
    expect(filas()[2][1]).toBe('2,25');
  });

  it('🔴 la otra lectura: si mueren LEJOS del desove, «mueren MENOS»', () => {
    /* E desova el 01 y muere el 11 (fuera); F viva desova el 01: dentro 0 muertes → riesgo 0. */
    store.globalData = [MZ('E', 'Tanque 3', '2026-06-11'), MZ('F', 'Tanque 3')].map(O('Maduración MATRIZ'))
      .concat([EV('E', '2026-06-01', 'Tanque 3'), EV('E', '2026-06-11', 'Tanque 3', 'Mortalidad'), EV('F', '2026-06-01', 'Tanque 3')].map(O('Maduración Bitácora')));
    click(root.querySelector('[data-mc-sub="panorama"]')); click(root.querySelector('[data-mc-sub="operativo"]'));
    expect(filas()[2]).toEqual(['Riesgo relativo', '0,00', 'mueren MENOS tras desovar: sin señal de estrés post-desove']);
    expect(card().querySelector('.mc-post-rr.is-menos')).not.toBeNull();
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-post-res td {', '.mc-post-rr.is-mas {', '.mc-post-rr.is-menos {']) expect(css.includes(c), c).toBe(true);
  });
});
