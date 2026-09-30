// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · 0v·4 · las hembras por su ÚLTIMO desove (2026-09-29, usuario; punto 8 del plan 0t)

   Sustituye al «📅 Calendario de desoves» (V2) en «Salas y Tanques», en su mismo sitio (tras el mapa): por tanque, barras
   apiladas de sus hembras VIVAS según los días desde su último desove al último dato de la granja: ≤ 7 (la mitad de los
   intervalos reales dura de 3 a 7 d) · 8–21 · > 21 (la alerta de reemplazo, T5) · nunca desovó. Con las reglas de T5/T6:
   la hembra en su tanque de HOY (`passFem`: ubicación actual, lote y código), sin el mes (son las vivas de hoy). Tanques
   en orden de sala y número. Fixture ficticio con cuentas a mano; el último dato de la granja es el 30/06/2026.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { makeChart } from '../../core/charts.js';
import { buildReproModel, makeFilter, hembrasPorUltimoDesove } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, sala, tq, extra = {}) => ({ 'Trovan ID': t, 'Sala actual': sala, 'Tanque actual': tq, Estado: 'Vivo', Lote: 'QA', 'Código genético': 'CG1', 'Fecha ingreso': '2026-05-01', ...extra });
const DES = (t, fecha, sala, tq) => ({ 'Trovan ID': t, Fecha: fecha, Tipo: 'Desove', Sala: sala, Tanque: tq });
/* Sala 4 · Tanque 1: A (0 d), B (10 d), C (29 d), D nunca y E MUERTA (desovó el 29).
   Sala 1 · Tanque 2: F (0 d), G (7 d, el borde de ≤ 7), H (8 d), I (21 d, el borde de 8–21), J (22 d) y K, de otro lote, nunca.
   Sala 1 · Tanque 10: L nunca (el 10 va DETRÁS del 2). */
const MATRIZ = [
  MZ('A', 'Sala 4', 'Tanque 1'), MZ('B', 'Sala 4', 'Tanque 1'), MZ('C', 'Sala 4', 'Tanque 1'), MZ('D', 'Sala 4', 'Tanque 1'),
  MZ('E', 'Sala 4', 'Tanque 1', { Estado: 'Muerto', 'Fecha muerte': '2026-06-29' }),
  MZ('F', 'Sala 1', 'Tanque 2'), MZ('G', 'Sala 1', 'Tanque 2'), MZ('H', 'Sala 1', 'Tanque 2'), MZ('I', 'Sala 1', 'Tanque 2'),
  MZ('J', 'Sala 1', 'Tanque 2'), MZ('K', 'Sala 1', 'Tanque 2', { Lote: 'QB', 'Código genético': 'CG2' }),
  MZ('L', 'Sala 1', 'Tanque 10'),
];
const BITACORA = [
  DES('A', '2026-06-30', 'Sala 4', 'Tanque 1'), DES('A', '2026-06-20', 'Sala 4', 'Tanque 1'), DES('B', '2026-06-20', 'Sala 4', 'Tanque 1'),
  DES('C', '2026-06-01', 'Sala 4', 'Tanque 1'), DES('E', '2026-06-29', 'Sala 4', 'Tanque 1'),
  DES('F', '2026-06-30', 'Sala 1', 'Tanque 2'), DES('G', '2026-06-23', 'Sala 1', 'Tanque 2'), DES('H', '2026-06-22', 'Sala 1', 'Tanque 2'),
  DES('I', '2026-06-09', 'Sala 1', 'Tanque 2'), DES('J', '2026-06-08', 'Sala 1', 'Tanque 2'),
];
const M = () => buildReproModel(MATRIZ, BITACORA, []);
const fila = (r) => [r.key, r.reciente, r.medio, r.antiguo, r.nunca, r.total];

describe('Microchips · 0v·4 · las hembras por su último desove (el modelo)', () => {
  it('🔴 cada VIVA en su tanque de hoy, por los días desde su último desove al último dato (≤ 7 · 8–21 · > 21 · nunca)', () => {
    const x = hembrasPorUltimoDesove(M(), makeFilter({}));
    expect(x.ref.getDate()).toBe(30);
    expect(x.tanques.map(fila)).toEqual([
      ['Sala 1 · Tanque 2', 2, 2, 1, 1, 6],
      ['Sala 1 · Tanque 10', 0, 0, 0, 1, 1],
      ['Sala 4 · Tanque 1', 1, 1, 1, 1, 4],
    ]);
    expect(x.total).toBe(11);
  });

  it('🔴 los bordes: 7 días aún es «≤ 7» y 21 aún es «8–21»; 8 y 22, el tramo siguiente', () => {
    const t = hembrasPorUltimoDesove(M(), makeFilter({})).tanques.find((r) => r.key === 'Sala 1 · Tanque 2');
    expect([t.reciente, t.medio, t.antiguo]).toEqual([2, 2, 1]);   // F (0) y G (7) · H (8) e I (21) · J (22)
  });

  it('🔴 la muerta no cuenta (aunque desovara ayer); una hembra cuenta por su ÚLTIMO desove, no por el primero', () => {
    const t = hembrasPorUltimoDesove(M(), makeFilter({})).tanques.find((r) => r.key === 'Sala 4 · Tanque 1');
    expect(t.total).toBe(4);
    expect(t.reciente).toBe(1);   // A desovó el 20 y el 30: cuenta el 30
  });

  it('🔴 sigue la sala, el tanque, el lote y el código (su ubicación de HOY); el mes NO (son las vivas de hoy)', () => {
    expect(hembrasPorUltimoDesove(M(), makeFilter({ sala: 'Sala 4' })).tanques.map((r) => r.key)).toEqual(['Sala 4 · Tanque 1']);
    expect(hembrasPorUltimoDesove(M(), makeFilter({ sala: 'Sala 1', tanque: 'Tanque 10' })).tanques.map(fila)).toEqual([['Sala 1 · Tanque 10', 0, 0, 0, 1, 1]]);
    expect(hembrasPorUltimoDesove(M(), makeFilter({ lote: 'QB' })).tanques.map(fila)).toEqual([['Sala 1 · Tanque 2', 0, 0, 0, 1, 1]]);
    expect(hembrasPorUltimoDesove(M(), makeFilter({ codigo: 'CG2' })).total).toBe(1);
    expect(hembrasPorUltimoDesove(M(), makeFilter({ month: '2026-05' })).tanques.map(fila)).toEqual(hembrasPorUltimoDesove(M(), makeFilter({})).tanques.map(fila));
  });

  it('🔑 sin ningún dato, vacío (sin reventar); una viva sin ubicación no hace una barra «—» y se cuenta aparte', () => {
    expect(hembrasPorUltimoDesove(buildReproModel(MATRIZ, [], []), makeFilter({}))).toMatchObject({ ref: null, total: 0, tanques: [] });
    const x = hembrasPorUltimoDesove(buildReproModel([...MATRIZ, MZ('Z', '', '')], BITACORA, []), makeFilter({}));
    expect(x.tanques.some((r) => r.key.includes('—'))).toBe(false);
    expect([x.sinUbicacion, x.total]).toEqual([1, 11]);
  });
});

describe('Microchips · 0v·4 · la tarjeta (en lugar del calendario de desoves)', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  const cfg = (id) => { const l = makeChart.mock.calls.filter(([i]) => i === id); return l.length ? l[l.length - 1][1] : null; };
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    makeChart.mockClear();
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="operativo"]'));
  });
  afterEach(() => { click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); });

  it('🔴 va donde estaba el calendario (tras el mapa), y el calendario ya no está', () => {
    const card = root.querySelector('.mc-ultdes-card');
    expect(card).not.toBeNull();
    expect(root.querySelector('.mc-mapa-card').nextElementSibling).toBe(card);
    expect(root.querySelector('.mc-cal-card')).toBeNull();
    expect(card.querySelector('.mc-card-h').textContent).toContain('Hembras por su último desove');
    expect(card.querySelector('.mc-card-h .mc-h-note').textContent).toBe('11 vivas al 30/06/2026');
    expect(card.querySelector('canvas#mcUltDesove')).not.toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 el gráfico: barras horizontales APILADAS, un tanque por barra (sala y número) y las cuatro series en su orden', () => {
    const c = cfg('mcUltDesove');
    expect([c.type, c.options.indexAxis, c.options.scales.x.stacked, c.options.scales.y.stacked]).toEqual(['bar', 'y', true, true]);
    expect(c.data.labels).toEqual(['Sala 1 · Tanque 2', 'Sala 1 · Tanque 10', 'Sala 4 · Tanque 1']);
    expect(c.data.datasets.map((d) => [d.label, d.data])).toEqual([
      ['≤ 7 días', [2, 0, 1]], ['8–21 días', [2, 0, 1]], ['> 21 días', [1, 0, 1]], ['Nunca desovó', [1, 1, 1]]]);
    expect(c.data.datasets.map((d) => d.backgroundColor), 'verde, ámbar, rojo y gris: lo reciente es lo bueno')
      .toEqual(['#2e9e5b', '#e0a82b', '#e0533b', '#90a4ae']);
    expect(c.options.plugins.legend.display).toBe(true);
  });

  it('🔴 el globo dice cuántas y qué parte de su tanque; al final de cada barra, el total del tanque', () => {
    const c = cfg('mcUltDesove');
    const et = c.options.plugins.tooltip.callbacks.label({ dataset: c.data.datasets[3], dataIndex: 0, raw: 1 });
    expect(et).toBe(' Nunca desovó: 1 de 6 (17 %)');
    const escritos = [];
    const meta = (i) => ({ data: [0, 1, 2].map((k) => ({ x: 100 * (i + 1) + k, y: 10 * k })) });
    const ch = { ctx: { save() {}, restore() {}, fillText: (t, x, y) => escritos.push([t, x, y]) }, data: c.data, getDatasetMeta: meta };
    const p = c.plugins.find((x) => x.id === 'mcTotales');
    p.afterDatasetsDraw(ch, {}, c.options.plugins.mcTotales);
    expect(escritos).toEqual([['6', 406, 0], ['1', 407, 10], ['4', 408, 20]]);   // tras la ÚLTIMA serie (la punta de la pila)
  });

  it('🔴 la nota explica los tramos y que no sigue el mes', () => {
    const nota = root.querySelector('.mc-ultdes-card .mc-note').textContent;
    expect(nota).toContain('30/06/2026');
    expect(nota).toContain('No sigue el mes');
  });

  it('🔑 el CSS del calendario ya no está en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/views/maduracion/maduracion.css', 'utf8')).not.toMatch(/\.mc-cal[\s{.-]/);
  });
});
