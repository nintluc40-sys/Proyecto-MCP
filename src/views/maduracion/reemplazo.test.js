// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T5 · alerta de reemplazo (2026-09-27, usuario)

   Hembras VIVAS que no desovan hace más de N días (o que nunca desovaron y llevan más de N días en sala), contadas al
   último dato. Umbral 10 | 14 | 21 | 30 días (por defecto 21: 3× el intervalo típico, mediana 5 d). Agrupadas por tanque
   (su ubicación actual), el peor primero; si NADIE desovó en el tanque en esos días, el aviso «¿hueco del registro?»
   (medido ese día: Sala 1 sin ningún desove registrado desde el 11/07). Sigue sala/tanque/lote/código (no el mes: es el
   estado de hoy). Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, alertaReemplazo } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, tq, ingreso = '2026-06-01', muerte = '') => ({ 'Trovan ID': t, Lote: 'L1', 'Color anillo': 'Verde', 'Sala actual': 'Sala 4', 'Tanque actual': tq, Estado: muerte ? 'Muerto' : 'Vivo', 'Fecha ingreso': ingreso, 'Fecha muerte': muerte });
const EV = (t, fecha, tq, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'Sala 4', Tanque: tq });
/* Último dato: 30/06. T1: A desovó el 28/06 (2 d), B el 05/06 (25 d), C nunca (29 d en sala). T2: D nunca (29 d), E muerta
   (fuera). T3: F ingresó el 20/06 y nunca desovó (10 d). Con 21 días: T1 → C (29), B (25); T2 → D (29) y en T2 nadie desovó
   en 21 días (¿hueco?); en T1 sí (A, el 28/06). */
const MATRIZ = [MZ('A', 'Tanque 1'), MZ('B', 'Tanque 1'), MZ('C', 'Tanque 1'), MZ('D', 'Tanque 2'), MZ('E', 'Tanque 2', '2026-06-01', '2026-06-10'), MZ('F', 'Tanque 3', '2026-06-20')];
const BITACORA = [EV('A', '2026-06-28', 'Tanque 1'), EV('A', '2026-06-10', 'Tanque 1'), EV('B', '2026-06-05', 'Tanque 1'), EV('E', '2026-06-10', 'Tanque 2', 'Mortalidad'), EV('F', '2026-06-30', 'Tanque 3', 'Mortalidad')];
/* (F «muere» en la Bitácora el 30/06 sólo para fijar el último dato; en la MATRIZ sigue viva.) */

describe('Microchips · T5 · el modelo', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 con 21 días: por tanque (el peor primero), cada hembra con sus días sin desovar, y el aviso de hueco', () => {
    const a = alertaReemplazo(M(), makeFilter({}), 21);
    expect(a.total).toBe(3);
    expect(a.grupos.map((g) => [g.key, g.sinRegistros, g.hembras.map((h) => [h.trovan, h.ultimo ? 'desovó' : 'nunca', h.diasSin, h.enSala, h.desoves])])).toEqual([
      ['Sala 4 · Tanque 1', false, [['C', 'nunca', 29, 29, 0], ['B', 'desovó', 25, 29, 1]]],
      ['Sala 4 · Tanque 2', true, [['D', 'nunca', 29, 29, 0]]],
    ]);
  });

  it('🔴 el umbral decide: con 10 días entra F (10 d en sala) sólo si pasa de 10; con 30, nadie', () => {
    expect(alertaReemplazo(M(), makeFilter({}), 10).total).toBe(3);
    expect(alertaReemplazo(M(), makeFilter({}), 30).total).toBe(0);
    expect(alertaReemplazo(M(), makeFilter({}), 24).grupos.flatMap((g) => g.hembras.map((h) => h.trovan))).toEqual(['C', 'B', 'D']);
    expect(alertaReemplazo(M(), makeFilter({}), 25).grupos.flatMap((g) => g.hembras.map((h) => h.trovan))).toEqual(['C', 'D']);
  });

  it('🔴 sigue la sala/tanque/lote/código (ubicación actual) y deja fuera a las muertas', () => {
    const a = alertaReemplazo(M(), makeFilter({ sala: 'Sala 4', tanque: 'Tanque 2' }), 21);
    expect(a.grupos.map((g) => [g.key, g.hembras.map((h) => h.trovan)])).toEqual([['Sala 4 · Tanque 2', ['D']]]);
  });
});

describe('Microchips · T5 · la tarjeta en «Hembras»', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  const card = () => root.querySelector('.mc-reemp-card');
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="hembras"]'));
  });
  afterEach(() => {
    const b = root.querySelector('[data-mc-umbral="21"]'); if (b) click(b);
    click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); document.body.classList.remove('modal-open');
  });

  it('🔴 arriba de «Hembras», con 21 días por defecto, agrupada por tanque y con el aviso de hueco', () => {
    expect(root.querySelector('.mc-body .mc-grid').firstElementChild).toBe(card());
    expect(root.querySelector('[data-mc-umbral="21"]').getAttribute('aria-pressed')).toBe('true');
    const grupos = [...card().querySelectorAll('tr.mc-alerta-grupo')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());
    expect(grupos[0]).toBe('Sala 4 · Tanque 1 2 hembras');
    expect(grupos[1]).toBe('Sala 4 · Tanque 2 1 hembra ⚠ ningún desove registrado en el tanque en 21 días: ¿hueco del registro?');
    const filas = [...card().querySelectorAll('tbody tr:not(.mc-alerta-grupo)')].map((tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    expect(filas[0]).toEqual(['C', 'L1', '29 d', 'nunca', '29 d', '0']);
    expect(filas[1]).toEqual(['B', 'L1', '29 d', '05/06', '25 d', '1']);
    expect(card().querySelector('.mc-card-h').textContent).toContain('3 hembras');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 el chip del anillo y el Trovan abre su historial', () => {
    const b = card().querySelector('[data-mc-female="C"]');
    expect(b.parentElement.querySelector('.mc-anillo.is-verde')).not.toBeNull();
    click(b);
    expect(root.querySelector('#mcFemaleModal').classList.contains('sv-open')).toBe(true);
  });

  it('🔴 el umbral cambia la lista; sin nadie, el vacío lo dice', () => {
    click(root.querySelector('[data-mc-umbral="30"]'));
    expect(card().querySelector('.mc-vacio-t').textContent).toBe('Ninguna hembra viva lleva más de 30 días sin desovar');
  });

  it('🔴 cada tanque sale con su cabecera aunque tenga muchas: de cada uno, las 25 que más llevan y «+N más»', () => {
    const muchas = Array.from({ length: 27 }, (_, i) => MZ('Z' + String(i).padStart(2, '0'), 'Tanque 9'));
    store.globalData = [...[...MATRIZ, ...muchas].map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    click(root.querySelector('[data-mc-sub="panorama"]')); click(root.querySelector('[data-mc-sub="hembras"]'));
    const grupos = [...card().querySelectorAll('tr.mc-alerta-grupo')].map((tr) => tr.querySelector('th').childNodes[0].textContent.trim());
    expect(grupos).toEqual(['Sala 4 · Tanque 9', 'Sala 4 · Tanque 1', 'Sala 4 · Tanque 2']);
    expect(card().querySelector('tr.mc-alerta-mas').textContent).toBe('+2 más en este tanque (filtra por él para verlas todas)');
    expect(card().querySelectorAll('tbody tr:not(.mc-alerta-grupo):not(.mc-alerta-mas)').length).toBe(25 + 2 + 1);
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-alerta-grupo th {', '.mc-hueco {', '.mc-alerta-mas td {']) expect(css.includes(c), c).toBe(true);
  });
});
