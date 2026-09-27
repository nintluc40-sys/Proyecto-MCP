// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · V5 · la línea de vida de la hembra (2026-09-27, usuario)

   En su historial, bajo los datos de la MATRIZ: una franja del ingreso a la muerte (o al último dato si vive) partida
   en TRAMOS por ubicación (cada tanque en que estuvo, según sus traslados), un punto por desove, una marca en cada
   traslado y ✝ al morir; los meses debajo. HTML con posiciones en % (el SVG estirado se deformaba). Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, lineaDeVida } from './data.js';
import { maduracionView } from './index.js';

/* A: ingresa el 01/06 en S4·T3, desova el 03 y el 10, pasa a T1 el 15/06, desova el 20 y muere el 30/06.
   B: viva, sin traslados, en S1·T2; desova el 05/06 (el último dato de la granja es el 30/06). */
const MATRIZ = [
  { 'Trovan ID': 'AAAAAAAAAA', 'Sala actual': 'Sala 4', 'Tanque actual': 'Tanque 1', Estado: 'Muerto', 'Fecha ingreso': '2026-06-01', 'Fecha muerte': '2026-06-30' },
  { 'Trovan ID': 'BBBBBBBBBB', 'Sala actual': 'Sala 1', 'Tanque actual': 'Tanque 2', Estado: 'Vivo', 'Fecha ingreso': '2026-06-01' },
];
const EV = (t, fecha, sala, tq, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: sala, Tanque: tq });
const BITACORA = [EV('AAAAAAAAAA', '2026-06-03', 'Sala 4', 'Tanque 3'), EV('AAAAAAAAAA', '2026-06-10', 'Sala 4', 'Tanque 3'), EV('AAAAAAAAAA', '2026-06-20', 'Sala 4', 'Tanque 1'),
  EV('AAAAAAAAAA', '2026-06-30', 'Sala 4', 'Tanque 1', 'Mortalidad'), EV('BBBBBBBBBB', '2026-06-05', 'Sala 1', 'Tanque 2')];
const TRANSF = [{ 'TR-ID': 'TR-000001', Fecha: '2026-06-15', Tipo: 'Traslado', 'Trovan ID': 'AAAAAAAAAA', 'Sala origen': 'Sala 4', 'Tanque origen': 'Tanque 3', 'Sala destino': 'Sala 4', 'Tanque destino': 'Tanque 1' }];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Microchips · V5 · el modelo de la línea de vida', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, TRANSF);
  it('🔴 del ingreso a la muerte, en tramos por ubicación, con sus desoves, traslados y la muerte', () => {
    const lv = lineaDeVida(M(), 'AAAAAAAAAA');
    expect([iso(lv.inicio), iso(lv.fin), lv.vive, lv.dias]).toEqual(['2026-06-01', '2026-06-30', false, 30]);
    expect(lv.tramos.map((t) => [iso(t.desde), iso(t.hasta), t.etiqueta])).toEqual([['2026-06-01', '2026-06-15', 'S4·T3'], ['2026-06-15', '2026-06-30', 'S4·T1']]);
    expect(lv.desoves.map((e) => iso(e.date))).toEqual(['2026-06-03', '2026-06-10', '2026-06-20']);
    expect(lv.traslados.map((t) => [iso(t.date), t.de, t.a])).toEqual([['2026-06-15', 'S4·T3', 'S4·T1']]);
    expect(iso(lv.muerte)).toBe('2026-06-30');
  });

  it('🔴 viva y sin traslados: un solo tramo (su ubicación de la MATRIZ) hasta el último dato', () => {
    const lv = lineaDeVida(M(), 'BBBBBBBBBB');
    expect([iso(lv.inicio), iso(lv.fin), lv.vive, lv.muerte]).toEqual(['2026-06-01', '2026-06-30', true, null]);
    expect(lv.tramos.map((t) => t.etiqueta)).toEqual(['S1·T2']);
  });

  it('una hembra que no está en la MATRIZ no tiene línea de vida', () => {
    expect(lineaDeVida(M(), 'CCCCCCCCCC')).toBeNull();
  });
});

describe('Microchips · V5 · la franja en el historial', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  const abrir = (t) => { const b = document.createElement('button'); b.className = 'mc-trovan'; b.dataset.mcFemale = t; root.appendChild(b); click(b); };
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora')), ...TRANSF.map(O('Maduración Transferencias'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => { root.remove(); errSpy.mockRestore(); document.body.classList.remove('modal-open'); });

  it('🔴 bajo los datos de la MATRIZ: tramos con su etiqueta, un punto por desove, el traslado y la muerte', () => {
    abrir('AAAAAAAAAA');
    const body = root.querySelector('#mcFemBody');
    const lv = body.querySelector('.mc-lv');
    expect(lv).not.toBeNull();
    expect(body.querySelector('.mc-fem-info').nextElementSibling).toBe(lv);
    expect([...lv.querySelectorAll('.mc-lv-tramo')].map((r) => r.getAttribute('data-etiqueta'))).toEqual(['S4·T3', 'S4·T1']);
    expect(lv.querySelectorAll('.mc-lv-desove')).toHaveLength(3);
    expect(lv.querySelectorAll('.mc-lv-traslado')).toHaveLength(1);
    expect(lv.querySelector('.mc-lv-traslado').getAttribute('title')).toBe('Traslado 15/06/2026: S4·T3 → S4·T1');
    expect(lv.querySelector('.mc-lv-muerte').getAttribute('title')).toBe('Muerte 30/06/2026');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 cada marca cae en su fecha: la x crece con el tiempo y el traslado parte los tramos', () => {
    abrir('AAAAAAAAAA');
    const lv = root.querySelector('.mc-lv');
    const xs = [...lv.querySelectorAll('.mc-lv-desove')].map((c) => Number(c.getAttribute('data-x')));
    expect(xs[0]).toBeLessThan(xs[1]); expect(xs[1]).toBeLessThan(xs[2]);
    expect(xs[0]).toBeCloseTo(8.333, 2);   // el 03/06, en el CENTRO de su día: 2,5 días de 30 = 8,333 %
    const [t1, t2] = [...lv.querySelectorAll('.mc-lv-tramo')];
    const fin1 = Number(t1.getAttribute('data-x')) + Number(t1.getAttribute('data-w'));
    expect(Math.abs(fin1 - Number(t2.getAttribute('data-x')))).toBeLessThan(0.01);
    expect(Number(t2.getAttribute('data-x')) + Number(t2.getAttribute('data-w'))).toBeCloseTo(100, 2);   // días enteros: el último también tiene ancho
    const xTr = Number(lv.querySelector('.mc-lv-traslado').getAttribute('data-x'));
    expect(Math.abs(xTr - Number(t2.getAttribute('data-x')))).toBeLessThan(0.01);
    expect(xs[1]).toBeLessThan(xTr); expect(xs[2]).toBeGreaterThan(xTr);
  });

  it('🔴 viva: sin ✝, y el final dice «último dato»', () => {
    abrir('BBBBBBBBBB');
    const lv = root.querySelector('.mc-lv');
    expect(lv.querySelector('.mc-lv-muerte')).toBeNull();
    expect(lv.textContent).toContain('último dato 30/06');
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-lv {', '.mc-lv-pista {', '.mc-lv-tramo {', '.mc-lv-desove {', '.mc-lv-traslado {', '.mc-lv-muerte {']) expect(css.includes(c), c).toBe(true);
  });
});
