// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · «Microchips» · filtros GLOBALES de Lote y Código genético (2026-09-13)

   Pedido del usuario: «así como se tiene un filtro para el mes, para la sala y tanque, añadir
   uno para el lote y otro para el código genético que afecte a nivel global así como los
   anteriores».

   🔑 DE DÓNDE SALEN. Lote y Código genético son de la HEMBRA (columnas de «Maduración MATRIZ»);
   la Bitácora sólo trae Trovan, fecha, tipo y ubicación. Así que un desove o una mortalidad
   heredan el lote y el código de su hembra, y la población (vivas, fertilidad, estados, nunca
   desovadas) se filtra por los de cada hembra. Medido el 2026-09-13: 1665 hembras en 3 lotes
   (BK, BJ, BP) con 3 códigos, uno por lote hoy — pero nada obliga a que siga así, por eso los
   dos filtros son independientes y la lista de códigos se acota al lote elegido (cascada, como
   Sala → Tanque).

   «Global» se comprueba función a función: TODAS las que reciben el filtro lo respetan, no sólo
   los KPIs. Sin filtro de lote/código el resultado es el de siempre (lo vigila data.test.js).
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { makeChart } from '../../core/charts.js';
import {
  buildReproModel, makeFilter, kpis, locationStats, femaleRanking, neverSpawned,
  recoveryDistribution, stateDistribution, mortalityBreakdown, trends, lotesOf, codigosOf,
} from './data.js';
import { maduracionView } from './index.js';

// Dos lotes; el lote L1 con DOS códigos (para que la cascada tenga algo que acotar).
const matriz = [
  { 'Trovan ID': 'A1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01', Lote: 'L1', 'Código genético': 'C1' },
  { 'Trovan ID': 'A2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01', Lote: 'L1', 'Código genético': 'C2' },
  { 'Trovan ID': 'B1', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01', Lote: 'L2', 'Código genético': 'C3' },
  { 'Trovan ID': 'B2', 'Sala actual': 'S2', 'Tanque actual': 'T2', Estado: 'Muerto', 'Fecha ingreso': '2026-05-01', 'Fecha muerte': '2026-06-20', Lote: 'L2', 'Código genético': 'C3' },
  { 'Trovan ID': 'B3', 'Sala actual': 'S2', 'Tanque actual': 'T2', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01', Lote: 'L2', 'Código genético': 'C3' },
];
// La Bitácora real trae su propia ubicación (snapshot).
const bitacora = [
  { 'Trovan ID': 'A1', Fecha: '2026-06-01', Tipo: 'Desove', Sala: 'S1', Tanque: 'T1' },
  { 'Trovan ID': 'A1', Fecha: '2026-06-11', Tipo: 'Desove', Sala: 'S1', Tanque: 'T1' },
  { 'Trovan ID': 'A2', Fecha: '2026-06-05', Tipo: 'Desove', Sala: 'S1', Tanque: 'T1' },
  { 'Trovan ID': 'B1', Fecha: '2026-06-03', Tipo: 'Desove', Sala: 'S1', Tanque: 'T1' },
  { 'Trovan ID': 'B1', Fecha: '2026-06-13', Tipo: 'Desove', Sala: 'S1', Tanque: 'T1' },
  { 'Trovan ID': 'B1', Fecha: '2026-06-23', Tipo: 'Desove', Sala: 'S1', Tanque: 'T1' },
  { 'Trovan ID': 'B2', Fecha: '2026-06-20', Tipo: 'Mortalidad', Sala: 'S2', Tanque: 'T2' },
  { 'Trovan ID': 'ZZ9', Fecha: '2026-06-07', Tipo: 'Desove', Sala: 'S1', Tanque: 'T1' },   // no está en MATRIZ
];
const model = buildReproModel(matriz, bitacora, []);
const L1 = makeFilter({ lote: 'L1' });
const L2 = makeFilter({ lote: 'L2' });
const C2 = makeFilter({ codigo: 'C2' });

describe('Maduración · filtro de Lote y Código genético · datos', () => {
  it('🔴 el filtro los lleva, y sin ellos queda como siempre', () => {
    expect(makeFilter({ lote: 'L1', codigo: 'C2' })).toMatchObject({ lote: 'L1', codigo: 'C2' });
    expect(makeFilter({})).toMatchObject({ lote: null, codigo: null, sala: null, tanque: null });
  });

  it('🔴 cada evento hereda el lote y el código de SU hembra', () => {
    const b1 = model.desoves.find((e) => e.trovan === 'B1');
    expect(b1).toMatchObject({ lote: 'L2', codigo: 'C3' });
    expect(model.desoves.find((e) => e.trovan === 'ZZ9')).toMatchObject({ lote: '', codigo: '' });
  });

  it('el fixture ejerce algo: sin filtro cuenta TODO (incluido el desove huérfano)', () => {
    const k = kpis(model, makeFilter({}));
    expect(k.totalHembras).toBe(5);
    expect(k.desoves).toBe(7);
  });

  it('🔴 KPIs: población, desoves, mortalidad y fertilidad del lote', () => {
    const k1 = kpis(model, L1);
    expect(k1).toMatchObject({ totalHembras: 2, vivas: 2, muertas: 0, desoves: 3, mortalidad: 0, spawners: 2 });
    expect(k1.fertilidadGlobal).toBe(100);
    const k2 = kpis(model, L2);
    expect(k2).toMatchObject({ totalHembras: 3, vivas: 2, muertas: 1, desoves: 3, mortalidad: 1, spawners: 1 });
    expect(k2.fertilidadGlobal).toBe(50);
  });

  it('🔴 KPIs por código genético (dentro del mismo lote)', () => {
    expect(kpis(model, C2)).toMatchObject({ totalHembras: 1, desoves: 1, spawners: 1 });
  });

  it('🔴 lote Y código a la vez se combinan (y si no casan, no hay nada)', () => {
    expect(kpis(model, makeFilter({ lote: 'L1', codigo: 'C1' }))).toMatchObject({ totalHembras: 1, desoves: 2 });
    expect(kpis(model, makeFilter({ lote: 'L2', codigo: 'C1' }))).toMatchObject({ totalHembras: 0, desoves: 0 });
  });

  it('🔴 y se combinan con los de siempre (sala, tanque, mes)', () => {
    expect(kpis(model, makeFilter({ lote: 'L2', sala: 'S2' }))).toMatchObject({ totalHembras: 2, desoves: 0, mortalidad: 1 });
    expect(kpis(model, makeFilter({ lote: 'L2', month: '2026-06' }))).toMatchObject({ desoves: 3 });
  });

  it('🔴 producción por ubicación', () => {
    const t1 = locationStats(model, L2, 'tanque').find((r) => r.key === 'T1');
    expect(t1).toMatchObject({ desoves: 3, hembras: 1, spawners: 1 });
    expect(locationStats(model, L1, 'tanque').map((r) => r.key)).toEqual(['T1']);
  });

  it('🔴 ranking de hembras', () => {
    expect(femaleRanking(model, L1).map((r) => r.trovan)).toEqual(['A1', 'A2']);
    expect(femaleRanking(model, L2).map((r) => r.trovan)).toEqual(['B1']);
  });

  it('🔴 hembras que nunca han desovado', () => {
    expect(neverSpawned(model, L2).map((r) => r.trovan)).toEqual(['B3']);
    expect(neverSpawned(model, L1)).toEqual([]);
  });

  it('🔴 intervalos de recuperación', () => {
    expect(recoveryDistribution(model, L1).intervals).toEqual([10]);
    expect(recoveryDistribution(model, L2).intervals).toEqual([10, 10]);
  });

  it('🔴 distribución de estados', () => {
    const s = stateDistribution(model, L2);
    expect(s.fallecida).toBe(1);
    expect(s.activa + s.inactiva + s.transferida + s.fallecida).toBe(3);
  });

  it('🔴 mortalidad por sala y tanque', () => {
    expect(mortalityBreakdown(model, L1).total).toBe(0);
    expect(mortalityBreakdown(model, L2).total).toBe(1);
  });

  it('🔴 tendencias', () => {
    const t = trends(model, L1, 'month');
    expect(t.desoves.reduce((a, b) => a + b, 0)).toBe(3);
    expect(t.mortalidad.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('🔴 listas para los desplegables: lotes, y códigos acotados al lote', () => {
    expect(lotesOf(model)).toEqual(['L1', 'L2']);
    expect(codigosOf(model)).toEqual(['C1', 'C2', 'C3']);
    expect(codigosOf(model, 'L1')).toEqual(['C1', 'C2']);
    expect(codigosOf(model, 'L2')).toEqual(['C3']);
  });
});

/* ── La vista: los dos desplegables y su efecto en pantalla ── */
const M = (o) => ({ _SheetOrigin: 'Maduración MATRIZ', ...o });
const B = (o) => ({ _SheetOrigin: 'Maduración Bitácora', ...o });
const desovesKpi = (root) => {
  const t = [...root.querySelectorAll('.mc-kpi')].find((x) => x.querySelector('.mc-kpi-lb').textContent === 'Desoves');
  return t ? t.querySelector('.mc-kpi-v').textContent : null;
};
/* ⚠ happy-dom devuelve mal `select.value` cuando la opción marcada con `selected` no es la
   primera (medido: el HTML dice L2 y `.value` da L1). Se lee la opción MARCADA, que es lo que
   pinta el navegador. */
const elegido = (root, dim) => {
  const o = root.querySelector(`[data-mc-filter="${dim}"] option[selected]`);
  return o ? o.value : '';
};
const elegir = (root, dim, v) => {
  const s = root.querySelector(`[data-mc-filter="${dim}"]`);
  s.value = v;
  s.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('Maduración · filtro de Lote y Código genético · vista', () => {
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...matriz.map(M), ...bitacora.map(B)];
    root = document.createElement('div');
    document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    // vState es del módulo: se deja limpio para el caso siguiente.
    ['codigo', 'lote', 'tanque', 'sala'].forEach((d) => { if (root.querySelector(`[data-mc-filter="${d}"]`)) elegir(root, d, ''); });
    root.remove(); errSpy.mockRestore();
  });

  it('🔴 la barra de filtros trae Lote y Código genético junto a Mes, Sala y Tanque', () => {
    maduracionView(root);
    const lote = root.querySelector('.mc-filters [data-mc-filter="lote"]');
    const cod = root.querySelector('.mc-filters [data-mc-filter="codigo"]');
    expect(lote, 'falta el filtro de Lote').toBeTruthy();
    expect(cod, 'falta el filtro de Código genético').toBeTruthy();
    expect([...lote.options].map((o) => o.value)).toEqual(['', 'L1', 'L2']);
    expect([...cod.options].map((o) => o.value)).toEqual(['', 'C1', 'C2', 'C3']);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 elegir un lote cambia las cifras de la vista y acota los códigos', () => {
    maduracionView(root);
    expect(desovesKpi(root)).toBe('7');
    elegir(root, 'lote', 'L1');
    expect(desovesKpi(root)).toBe('3');
    expect([...root.querySelector('[data-mc-filter="codigo"]').options].map((o) => o.value)).toEqual(['', 'C1', 'C2']);
    elegir(root, 'codigo', 'C2');
    expect(desovesKpi(root)).toBe('1');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 cambiar de lote descarta un código que ya no le pertenece', () => {
    maduracionView(root);
    elegir(root, 'lote', 'L1');
    elegir(root, 'codigo', 'C2');
    elegir(root, 'lote', 'L2');
    expect(elegido(root, 'codigo')).toBe('');
    expect(desovesKpi(root)).toBe('3');
  });

  it('el filtro sigue vigente al cambiar de pestaña (es global)', () => {
    maduracionView(root);
    elegir(root, 'lote', 'L2');
    root.querySelector('[data-mc-sub="hembras"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(elegido(root, 'lote')).toBe('L2');
    expect(root.textContent).toContain('B1');
    expect(root.textContent).not.toContain('A1');
    expect(root.textContent).toContain('filtrado por lote');
  });

  it('🔴 la gráfica de Tendencias también va filtrada', () => {
    const sumaDesoves = () => {
      const c = [...makeChart.mock.calls].reverse().find((x) => x[0] === 'mcTrend');
      return c[1].data.datasets.find((d) => d.label === 'Desoves').data.reduce((a, b) => a + b, 0);
    };
    maduracionView(root);
    // vState es del módulo: un caso anterior pudo dejar otra pestaña. Tendencias vive en Panorama.
    root.querySelector('[data-mc-sub="panorama"]').dispatchEvent(new Event('click', { bubbles: true }));
    makeChart.mockClear();
    maduracionView(root);
    expect(sumaDesoves()).toBe(7);
    elegir(root, 'lote', 'L1');
    expect(sumaDesoves()).toBe(3);
    elegir(root, 'codigo', 'C1');
    expect(sumaDesoves()).toBe(2);
  });
});
