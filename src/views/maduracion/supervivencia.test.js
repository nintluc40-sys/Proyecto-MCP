// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T3 · supervivencia Kaplan–Meier por familia (2026-09-27, usuario)

   Días desde el ingreso hasta la muerte; las vivas cuentan hasta el último dato (censuradas). S(t) = Π (1 − dᵢ/nᵢ).
   En Panorama, con el MISMO selector Código genético | Lote de Productividad: una línea escalonada por familia que
   termina en su seguimiento máximo (sin extrapolar), la referencia del 50 %, y debajo n, muertes, seguimiento, % vivas a
   15 y 30 días (vacío si no se ha llegado) y la MEDIANA. Sigue sala/tanque/lote/código, no el mes (se mide desde el
   ingreso). Medido ese día: medianas BJ 38 d · BK 34 d; BP (28 d de seguimiento) 97,7 % a 15 d. Fixture ficticio.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { makeChart } from '../../core/charts.js';
import { buildReproModel, makeFilter, supervivenciaPorFamilia } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, lote, muerte = '') => ({ 'Trovan ID': t, Lote: lote, 'Código genético': 'C-' + lote, 'Sala actual': 'Sala 4', 'Tanque actual': 'Tanque 1', Estado: muerte ? 'Muerto' : 'Vivo', 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
/* Último dato: 30/06 (t = 29 para las vivas). L1: A muere el día 10, B el 20, C y D vivas →
   S(10) = 3/4 = 75 %, S(20) = 75 % × 2/3 = 50 % (mediana 20), sigue hasta el 29. L2: E muere el día 5, F viva → 50 % (mediana 5). */
const MATRIZ = [MZ('A', 'L1', '2026-06-11'), MZ('B', 'L1', '2026-06-21'), MZ('C', 'L1'), MZ('D', 'L1'), MZ('E', 'L2', '2026-06-06'), MZ('F', 'L2')];
const EV = (t, fecha, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'Sala 4', Tanque: 'Tanque 1' });
const BITACORA = [EV('C', '2026-06-02'), EV('C', '2026-06-30'), EV('A', '2026-06-11', 'Mortalidad'), EV('B', '2026-06-21', 'Mortalidad'), EV('E', '2026-06-06', 'Mortalidad')];

describe('Microchips · T3 · el modelo', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 la curva escalonada de cada familia, hasta su seguimiento máximo, con su mediana', () => {
    const s = supervivenciaPorFamilia(M(), makeFilter({}), 'lote');
    expect(s.grupos.map((g) => [g.familia, g.n, g.muertes, g.seguimiento, g.mediana])).toEqual([['L1', 4, 2, 29, 20], ['L2', 2, 1, 29, 5]]);
    expect(s.grupos[0].puntos).toEqual([[0, 100], [10, 75], [20, 50], [29, 50]]);
    expect(s.grupos[1].puntos).toEqual([[0, 100], [5, 50], [29, 50]]);
  });

  it('🔴 el % a 15 y a 30 días; sin seguimiento hasta ese día, null (no se extrapola)', () => {
    const s = supervivenciaPorFamilia(M(), makeFilter({}), 'lote');
    expect(s.grupos.map((g) => [g.s15, g.s30])).toEqual([[75, null], [50, null]]);
  });

  it('🔴 sigue el lote/código pero no el mes (se mide desde el ingreso)', () => {
    const conMes = supervivenciaPorFamilia(M(), makeFilter({ month: '2026-06', lote: 'L2' }), 'lote');
    expect(conMes.grupos.map((g) => [g.familia, g.n, g.mediana])).toEqual([['L2', 2, 5]]);
  });
});

describe('Microchips · T3 · la tarjeta en Panorama', () => {
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
  });
  afterEach(() => { const b = root.querySelector('[data-mc-familia="codigo"]'); if (b) click(b); root.remove(); errSpy.mockRestore(); });

  it('🔴 el gráfico: una línea ESCALONADA por familia (x = días en sala, y = % vivas) y la referencia del 50 %', () => {
    click(root.querySelector('[data-mc-familia="lote"]'));
    const c = cfg('mcSurv');
    expect(c.data.datasets.map((d) => [d.label, d.stepped, d.data.map((p) => [p.x, p.y])])).toEqual([
      ['L1', 'after', [[0, 100], [10, 75], [20, 50], [29, 50]]], ['L2', 'after', [[0, 100], [5, 50], [29, 50]]]]);
    expect([c.options.scales.x.type, c.options.scales.y.min, c.options.scales.y.max]).toEqual(['linear', 0, 100]);
    expect(c.plugins.map((p) => p.id)).toEqual(['mcMitad']);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 la tabla: n, muertes, seguimiento, % a 15 y 30 días y la mediana; sigue al selector de familias', () => {
    // La tarjeta se busca cada vez: repintar reemplaza el nodo.
    const filas = () => [...root.querySelector('.mc-surv-card').querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    expect(filas().map((r) => r[0])).toEqual(['C-L1', 'C-L2']);
    click(root.querySelector('[data-mc-familia="lote"]'));
    expect(filas()).toEqual([['L1', '4', '2', '29 d', '75 %', '—', '20 d'], ['L2', '2', '1', '29 d', '50 %', '—', '5 d']]);
  });

  it('el 50 % dibujado donde toca', () => {
    const c = cfg('mcSurv');
    const trazos = [];
    const ctx = { save() {}, restore() {}, beginPath() {}, stroke() {}, setLineDash() {}, fillText() {}, moveTo: (x, y) => trazos.push(['m', x, y]), lineTo: (x, y) => trazos.push(['l', x, y]) };
    c.plugins[0].afterDatasetsDraw({ ctx, chartArea: { left: 10, right: 110 }, scales: { y: { getPixelForValue: (v) => 200 - v } } });
    expect(trazos).toEqual([['m', 10, 150], ['l', 110, 150]]);
  });
});
