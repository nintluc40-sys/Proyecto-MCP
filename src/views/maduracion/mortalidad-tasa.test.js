// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T2 · la mortalidad por hembra-noche (2026-09-27, usuario)

   El conteo bruto hacía parecer peor al tanque con más hembras: con los datos reales, Sala 2 · T18 era el peor por
   muertes (242) y por tasa está como cualquier tanque de Sala 1 (2,29 %/día; el peor, Sala 1 · T7, 2,53 %/día); por lote
   BP 0,39 · BJ 1,97 · BK 2,25 %/día. Decisión del usuario: el gráfico «Mortalidad por…» con un selector «% diario |
   Muertes» (por defecto % diario, ordenado por esa tasa; muertes y hembras-noche al pasar el ratón) y una columna
   «Mort./día» en Producción y eficiencia y en Productividad por familia. % diario = muertes ÷ hembras-noche × 100.
   Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { makeChart } from '../../core/charts.js';
import { buildReproModel, makeFilter, locationStats, productividadPorFamilia } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, tq, muerte = '') => ({ 'Trovan ID': t, Lote: tq === 'Tanque 1' ? 'L1' : 'L2', 'Sala actual': 'Sala 4', 'Tanque actual': tq, Estado: muerte ? 'Muerto' : 'Vivo', 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha, tq, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'Sala 4', Tanque: tq });
/* Del 01/06 al 10/06 (10 noches). T1: A y B vivas (20 hembras-noche, 0 muertes) → 0 %/día.
   T2: C muere el 02 (2 noches), D el 05 (5), E viva (10) → 2 muertes en 17 → 11,76 %/día.
   T3: F sola, muere el 03 (3 noches) → 1 en 3 → 33,33 %/día. Por muertes, T2 (2) va primero; por tasa, T3. */
const MATRIZ = [MZ('A', 'Tanque 1'), MZ('B', 'Tanque 1'), MZ('C', 'Tanque 2', '2026-06-02'), MZ('D', 'Tanque 2', '2026-06-05'), MZ('E', 'Tanque 2'), MZ('F', 'Tanque 3', '2026-06-03')];
const BITACORA = [EV('A', '2026-06-01', 'Tanque 1'), EV('A', '2026-06-10', 'Tanque 1'), EV('C', '2026-06-02', 'Tanque 2', 'Mortalidad'),
  EV('D', '2026-06-05', 'Tanque 2', 'Mortalidad'), EV('F', '2026-06-03', 'Tanque 3', 'Mortalidad')];
const r2 = (v) => Math.round(v * 100) / 100;

describe('Microchips · T2 · el modelo', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 cada tanque trae su tasa de mortalidad (muertes ÷ hembras-noche × 100)', () => {
    const st = locationStats(M(), makeFilter({}), 'tanque');
    expect(st.map((x) => [x.key, x.mortalidad, x.hembrasNoche, r2(x.tasaMortalidad)]).sort()).toEqual([
      ['Sala 4 · Tanque 1', 0, 20, 0], ['Sala 4 · Tanque 2', 2, 17, 11.76], ['Sala 4 · Tanque 3', 1, 3, 33.33]]);
  });

  it('🔴 y cada familia: sus muertes del período y su tasa', () => {
    const t = productividadPorFamilia(M(), makeFilter({}), 'lote');
    expect(t.map((x) => [x.familia, x.mortalidad, x.hembrasNoche, r2(x.tasaMortalidad)]).sort()).toEqual([['L1', 0, 20, 0], ['L2', 3, 20, 15]]);
  });
});

describe('Microchips · T2 · la vista', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  const cfg = (id) => { const l = makeChart.mock.calls.filter(([i]) => i === id); return l.length ? l[l.length - 1][1] : null; };
  const card = (t) => [...root.querySelectorAll('.mc-card')].find((c) => c.querySelector('.mc-card-h') && c.querySelector('.mc-card-h').textContent.includes(t));
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    makeChart.mockClear();
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="operativo"]'));
  });
  afterEach(() => {
    const b = root.querySelector('[data-mc-mortmodo="tasa"]'); if (b) click(b);
    click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore();
  });

  it('🔴 por defecto «% diario»: ordenado por la tasa, la cifra con 2 decimales y «%», y el detalle al pasar el ratón', () => {
    expect(root.querySelector('[data-mc-mortmodo="tasa"]').getAttribute('aria-pressed')).toBe('true');
    const c = cfg('mcMortBars');
    expect(c.data.labels).toEqual(['Sala 4 · Tanque 3', 'Sala 4 · Tanque 2', 'Sala 4 · Tanque 1']);
    expect(c.data.datasets[0].data.map(r2)).toEqual([33.33, 11.76, 0]);
    expect([c.options.plugins.mcCifras.decimales, c.options.plugins.mcCifras.sufijo]).toEqual([2, ' %']);
    const lbl = c.options.plugins.tooltip.callbacks.label({ dataIndex: 1 });
    expect(lbl).toBe(' 11,76 % por día · 2 muertes en 17 hembras-noche');
    const escritos = [];
    c.plugins[0].afterDatasetsDraw({ ctx: { save() {}, restore() {}, fillText: (t) => escritos.push(t) }, data: c.data, getDatasetMeta: () => ({ data: c.data.labels.map(() => ({ x: 0, y: 0 })) }) }, {}, c.options.plugins.mcCifras);
    expect(escritos).toEqual(['33,33 %', '11,76 %', '0,00 %']);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 «Muertes»: el conteo de siempre, sin decimales', () => {
    click(root.querySelector('[data-mc-mortmodo="muertes"]'));
    const c = cfg('mcMortBars');
    expect([c.data.labels, c.data.datasets[0].data]).toEqual([['Sala 4 · Tanque 2', 'Sala 4 · Tanque 3'], [2, 1]]);
    expect(c.options.plugins.mcCifras.decimales).toBeUndefined();
  });

  it('🔴 la columna «Mort./día» en Producción y eficiencia y en Productividad por familia', () => {
    const prod = card('Producción y eficiencia');
    const ths = [...prod.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const i = ths.indexOf('Mort./día');
    expect(i).toBeGreaterThan(-1);
    const fila = [...prod.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Tanque 3'));
    expect(fila.cells[i].textContent.trim()).toBe('33,33 %');
    click(root.querySelector('[data-mc-sub="panorama"]'));
    click(root.querySelector('[data-mc-familia="lote"]'));
    const fam = card('Productividad por familia');
    const fths = [...fam.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const j = fths.indexOf('Mort./día');
    expect([...fam.querySelectorAll('tbody tr')].map((tr) => [tr.cells[0].textContent.trim().slice(0, 2), tr.cells[j].textContent.trim()]).sort()).toEqual([['L1', '0,00 %'], ['L2', '15,00 %']]);
    click(root.querySelector('[data-mc-familia="codigo"]'));
  });
});
