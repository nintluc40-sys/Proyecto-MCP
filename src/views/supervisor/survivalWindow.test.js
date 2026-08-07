// Regresión del defecto S-01: con un filtro de fecha activo, un tanque cuyas filas caían
// FUERA de la ventana aportaba su siembra al denominador de la supervivencia sin aportar
// población al numerador. El KPI del Resumen Operativo se desplomaba (90 % → 45 %) y
// contradecía al gráfico que ese mismo KPI abre, que sí excluye al tanque de ambos lados.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildContext, modStats, tankStats } from './stats.js';
import { moduleSvPopSeries } from './moduleTrends.js';
import { fullCtx } from './executive.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });

// TQ1 se registra todo junio. TQ2 deja de registrarse el 05/06 (descartado, agrupado…).
const rows = () => [
  L({ Tanque: 'TQ1', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
  L({ Tanque: 'TQ1', Fecha: '20/06/2026', 'Estadío': 'PL8', 'Población': '900000' }),
  L({ Tanque: 'TQ2', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
  L({ Tanque: 'TQ2', Fecha: '05/06/2026', 'Estadío': 'PL2', 'Población': '950000' }),
];

const ventana = (desde, hasta) => { store.dateFrom = desde; store.dateTo = hasta; };
const ctx = () => buildContext({ corrida: null });

beforeEach(() => { store.globalData = rows(); store.dateFrom = null; store.dateTo = null; });
afterEach(() => { store.globalData = []; store.dateFrom = null; store.dateTo = null; });

describe('S-01 · supervivencia del módulo con filtro de fecha', () => {
  it('sin filtro NO cambia nada: los dos tanques cuentan en ambos lados', () => {
    const s = modStats(ctx(), 'M01', '573');
    expect(s.sv).toBeCloseTo(92.5, 6);   // (900k + 950k) / 2M
    expect(s.pop).toBe(1850000);
    expect(s.popFirst).toBe(2000000);
  });

  it('con una ventana que excluye a TQ2, la SV es la de los tanques que sí se ven', () => {
    ventana(new Date(2026, 5, 15), new Date(2026, 5, 30));
    const s = modStats(ctx(), 'M01', '573');
    expect(s.sv).toBeCloseTo(90, 6);     // 900k / 1M — antes daba 45 % (900k / 2M)
    expect(s.pop).toBe(900000);
    expect(s.popFirst).toBe(1000000);    // solo la siembra de TQ1
    expect(s.mort).toBeCloseTo(10, 6);
  });

  it('el KPI y el gráfico que él mismo abre coinciden', () => {
    ventana(new Date(2026, 5, 15), new Date(2026, 5, 30));
    const c = ctx();
    const kpi = modStats(c, 'M01', '573').sv;
    const serie = moduleSvPopSeries(c, 'M01', '573');
    expect(kpi).toBeCloseTo(serie.sv[serie.sv.length - 1], 6);
  });

  it('la Vista Ejecutiva sigue dando la SV de la corrida completa (ignora el filtro)', () => {
    ventana(new Date(2026, 5, 15), new Date(2026, 5, 30));
    // La landing usa fullCtx: ventana := corrida completa.
    expect(modStats(fullCtx(ctx()), 'M01', '573').sv).toBeCloseTo(92.5, 6);
  });

  it('un tanque sin lectura en la ventana no reporta SV propia (ni antes ni ahora)', () => {
    ventana(new Date(2026, 5, 15), new Date(2026, 5, 30));
    const t = tankStats(ctx(), 'M01', 'TQ2', '573');
    expect(t.sv).toBeNull();
    expect(t.pop).toBeNull();
  });

  it('un tanque SIN población registrada nunca infla el denominador', () => {
    // TQ3 solo tiene filas sin población: no puede aportar siembra a la supervivencia.
    store.globalData = [
      ...rows(),
      L({ Tanque: 'TQ3', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '' }),
    ];
    const s = modStats(ctx(), 'M01', '573');
    expect(s.popFirst).toBe(2000000);
    expect(s.sv).toBeCloseTo(92.5, 6);
  });
});
