// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · cuántos días tardan las hembras en volver a desovar (2026-09-27, usuario)

   Medido ese día con los datos reales: 5,7 días de promedio, mediana 5, la mitad entre 3 y 7; y con los tramos semanales
   del histograma, el 78 % de los intervalos caía en «≤ 7 d». Decisión del usuario: un TITULAR con el promedio (y la
   mediana y el rango central), y el histograma POR DÍA (≤ 1, 2 … 14, ≥ 15) con las líneas del promedio y la mediana.
   Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { makeChart } from '../../core/charts.js';
import { buildReproModel, makeFilter, recoveryDistribution, cuantil, DIAS_HISTOGRAMA } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t) => ({ 'Trovan ID': t, 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' });
const EV = (t, fecha) => ({ 'Trovan ID': t, Fecha: fecha, Tipo: 'Desove' });
/* A: 01/06 → 04/06 → 09/06 (3 y 5 días) · B: 01/06 → 21/06 (20 días) · C: un solo desove (sin intervalo). */
const MATRIZ = [MZ('A'), MZ('B'), MZ('C')];
const BITACORA = [EV('A', '2026-06-01'), EV('A', '2026-06-04'), EV('A', '2026-06-09'), EV('B', '2026-06-01'), EV('B', '2026-06-21'), EV('C', '2026-06-02')];

describe('Microchips · el intervalo entre desoves', () => {
  it('el cuantil interpola: la mediana de un número par es la media de los dos centrales', () => {
    expect([cuantil([1, 2, 3, 4], 0.5), cuantil([1, 2, 3, 4], 0.25), cuantil([7], 0.5), cuantil([], 0.5)]).toEqual([2.5, 1.75, 7, null]);
  });

  it('🔴 promedio, mediana, el rango central y el histograma POR DÍA', () => {
    const r = recoveryDistribution(buildReproModel(MATRIZ, BITACORA, []), makeFilter({}));
    expect(r.intervals.slice().sort((a, b) => a - b)).toEqual([3, 5, 20]);
    expect([Math.round(r.promedioGlobal * 100) / 100, r.mediana, r.p25, r.p75]).toEqual([9.33, 5, 4, 12.5]);
    expect(r.porDia).toHaveLength(DIAS_HISTOGRAMA);
    expect(r.porDia.map((b) => b.label)).toEqual(['≤ 1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '≥ 15']);
    expect(r.porDia.map((b) => b.n)).toEqual([0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);   // 3 · 5 · 20 (→ «≥ 15»)
  });
});

describe('Microchips · la tarjeta del intervalo', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  const cfg = () => { const l = makeChart.mock.calls.filter(([id]) => id === 'mcInterval'); return l.length ? l[l.length - 1][1] : null; };
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    makeChart.mockClear();
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="hembras"]'));
  });
  afterEach(() => { click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); });

  it('🔴 el titular: «Vuelven a desovar en 9,3 días de promedio», con la mediana y la mitad central', () => {
    const card = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('Intervalo de recuperación'));
    expect(card.querySelector('.mc-rec-hl').textContent.replace(/\s+/g, ' ').trim()).toBe('Vuelven a desovar en 9,3 días de promedio');
    expect(card.querySelector('.mc-rec-sub').textContent).toBe('mediana 5 · la mitad entre 4 y 12,5 días');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 el gráfico: barras por día y las líneas del promedio y la mediana', () => {
    const c = cfg();
    expect(c.data.labels[0]).toBe('≤ 1');
    expect(c.data.datasets[0].data[2]).toBe(1);
    expect(c.plugins.map((p) => p.id)).toEqual(['mcLineasRef']);
    expect(c.options.plugins.mcLineasRef.lineas.map((l) => [l.etiqueta, Math.round(l.valor * 100) / 100])).toEqual([['prom.', 9.33], ['mediana', 5]]);
  });

  it('🔴 la línea cae donde toca: el valor v, en la posición v − 1 del eje (entre barras si no es entero)', () => {
    const c = cfg();
    const trazos = [];
    const ctx = { save() {}, restore() {}, beginPath() {}, stroke() {}, setLineDash() {}, fillText() {},
      moveTo: (x) => trazos.push(Math.round(x * 100) / 100), lineTo() {} };
    const chart = { ctx, data: c.data, scales: { x: { getPixelForValue: (i) => i * 10 }, y: { top: 0, bottom: 100 } } };
    c.plugins[0].afterDatasetsDraw(chart, {}, c.options.plugins.mcLineasRef);
    expect(trazos).toEqual([83.33, 40]);   // 9,33 → posición 8,33 · 5 → posición 4
  });

  it('🔑 el titular tiene estilo en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-rec-hl {', '.mc-rec-v {', '.mc-rec-sub {']) expect(css.includes(c), c).toBe(true);
  });
});
