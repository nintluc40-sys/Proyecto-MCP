// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · V6 · barras en la celda y el chip del color del anillo (2026-09-27, usuario)

   La cifra de Desoves lleva detrás una barra proporcional al máximo de su tabla en las 4 tablas (Ranking de hembras,
   Producción y eficiencia, Top tanques y Top salas); en Producción, también Mortalidad (en rojo). El color del anillo,
   como chip delante del Trovan en el ranking, en el dato «Color anillo» del historial y en «Nunca han desovado».
   Medido en la MATRIZ ese día: Transparente 705 · Verde 583 · Amarillo 529 · Azul 444 · Rojo 186 (Transparente = aro
   hueco; un color que no está en la lista, gris con «?»). Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, femaleRanking } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, color, tq, estado = 'Vivo', muerte = '') => ({ 'Trovan ID': t, 'Color anillo': color, 'Sala actual': 'Sala 4', 'Tanque actual': tq, Estado: estado, 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha, tq, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'Sala 4', Tanque: tq });
/* A (Verde) 4 desoves en T1 · D (sin color) 2 en T1 · B (Transparente) 1 en T2 · C (Plateado: fuera de la lista) viva sin
   desoves · E (Rojo) muere en T2. Tanques: T1 = 6 desoves y 0 muertes; T2 = 1 desove y 1 muerte. */
const MATRIZ = [MZ('A', 'Verde', 'Tanque 1'), MZ('B', 'Transparente', 'Tanque 2'), MZ('C', 'Plateado', 'Tanque 2'), MZ('D', '', 'Tanque 1'), MZ('E', 'Rojo', 'Tanque 2', 'Muerto', '2026-06-06')];
const BITACORA = [EV('A', '2026-06-01', 'Tanque 1'), EV('A', '2026-06-03', 'Tanque 1'), EV('A', '2026-06-05', 'Tanque 1'), EV('A', '2026-06-07', 'Tanque 1'),
  EV('D', '2026-06-02', 'Tanque 1'), EV('D', '2026-06-04', 'Tanque 1'), EV('B', '2026-06-03', 'Tanque 2'), EV('E', '2026-06-06', 'Tanque 2', 'Mortalidad')];

describe('Microchips · V6 · el ranking trae el color del anillo', () => {
  it('cada fila con su «Color anillo» de la MATRIZ', () => {
    const rk = femaleRanking(buildReproModel(MATRIZ, BITACORA, []), makeFilter({}));
    expect(rk.map((r) => [r.trovan, r.color])).toEqual([['A', 'Verde'], ['D', ''], ['B', 'Transparente']]);
  });
});

describe('Microchips · V6 · las celdas', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  const card = (t) => [...root.querySelectorAll('.mc-card')].find((c) => c.querySelector('.mc-card-h') && c.querySelector('.mc-card-h').textContent.includes(t));
  const barras = (c, sel = '.mc-bar') => [...c.querySelectorAll('tbody ' + sel)].map((b) => [b.querySelector('b').textContent, b.querySelector('i').style.width]);
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => { click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); document.body.classList.remove('modal-open'); });

  it('🔴 Top tanques y Top salas del Panorama: la barra de Desoves, proporcional al máximo de la tabla', () => {
    expect(barras(card('Top tanques'))).toEqual([['6', '100%'], ['1', '16.7%']]);
    expect(barras(card('Top salas'))).toEqual([['7', '100%']]);
  });

  it('🔴 Producción y eficiencia: la barra de Desoves y la de Mortalidad (en rojo)', () => {
    click(root.querySelector('[data-mc-sub="operativo"]'));
    const c = card('Producción y eficiencia');
    expect(barras(c, '.mc-bar:not(.is-mort)')).toEqual([['6', '100%'], ['1', '16.7%']]);
    expect(barras(c, '.mc-bar.is-mort')).toEqual([['0', '0%'], ['1', '100%']]);
  });

  it('🔴 Ranking de hembras: la barra de Desoves y el chip del anillo delante del Trovan (aro hueco si es Transparente)', () => {
    click(root.querySelector('[data-mc-sub="hembras"]'));
    const c = card('Ranking de hembras');
    expect(barras(c)).toEqual([['4', '100%'], ['2', '50%'], ['1', '25%']]);
    const chips = [...c.querySelectorAll('tbody tr')].map((tr) => { const i = tr.querySelector('.mc-anillo'); return i ? [i.className, i.getAttribute('title')] : null; });
    expect(chips).toEqual([['mc-anillo is-verde', 'Anillo Verde'], null, ['mc-anillo is-transparente', 'Anillo Transparente']]);
    expect(c.querySelector('.mc-anillo.is-verde').style.getPropertyValue('--mc-anillo')).toBe('#2e9e5b');
    expect(c.querySelector('.mc-anillo.is-transparente').getAttribute('style')).toBeNull();   // aro hueco: sin relleno
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 «Nunca han desovado»: el chip en cada hembra; un color fuera de la lista, gris con «?»', () => {
    click(root.querySelector('[data-mc-sub="hembras"]'));
    const chipC = card('Nunca han desovado').querySelector('[data-mc-female="C"] .mc-anillo');
    expect([chipC.className, chipC.textContent, chipC.getAttribute('title')]).toEqual(['mc-anillo is-otro', '?', 'Anillo Plateado']);
  });

  it('🔴 en el historial, «Color anillo» con su chip', () => {
    click(root.querySelector('[data-mc-sub="hembras"]'));
    click(root.querySelector('[data-mc-female="A"]'));
    const celda = [...root.querySelectorAll('#mcFemBody .mc-fem-f')].find((x) => x.textContent.includes('Color anillo'));
    expect(celda.querySelector('.mc-anillo.is-verde')).not.toBeNull();
    expect(celda.querySelector('.mc-fem-v').textContent.trim()).toBe('Verde');
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-bar {', '.mc-bar i {', '.mc-bar.is-mort i {', '.mc-anillo {', '.mc-anillo.is-transparente {', '.mc-anillo.is-otro {']) expect(css.includes(c), c).toBe(true);
  });
});
