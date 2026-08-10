// Auditoría de cierre · `survival()` de views/supervisor/stats.js — la población INICIAL.
// `modCorStatsCompute` (core/prodCalendar.js) exige la primera población REAL (>0) y lo
// declara; `survival()` aceptaba la primera NO NULA, y `gPop` admite el 0. Un tanque cuyo
// N5 se anotó con 0 aportaba su `last` al numerador pero 0 al denominador, así que:
//   · la supervivencia del MÓDULO salía inflada (el tope del 100 % lo disimulaba), y
//   · el KPI del Supervisor discrepaba de la columna «Superv.» de Producción Omarsa para
//     el mismo módulo+corrida — dos cifras del mismo hecho en pantallas contiguas;
//   · la del TANQUE salía «—» (firstSum 0 ⇒ null) pese a tener datos de sobra.
// Es la misma regla ya corregida en siembras.js y despacho.js; ésta es la de mayor alcance
// porque `survival()` alimenta tankStats y modStats (Ejecutiva, Módulo, Tanque y OM/Tex).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildContext, modStats, tankStats } from './stats.js';
import { modCorStats } from '../../core/prodCalendar.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });

// TQ1: N5 anotado con 0, conteo real 900 k después → cosecha 700 k.
// TQ2: siembra normal 1 M → cosecha 800 k.
// Siembra real = 1,9 M · cosecha = 1,5 M ⇒ 78,9 %.  Con el 0: 1,5 M ÷ 1 M = 150 % → tope 100 %.
const conCero = () => [
  L({ Tanque: 'TQ1', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '0' }),
  L({ Tanque: 'TQ1', Fecha: '05/06/2026', 'Estadío': 'Z2', 'Población': '900000' }),
  L({ Tanque: 'TQ1', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '700000' }),
  L({ Tanque: 'TQ2', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
  L({ Tanque: 'TQ2', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '800000' }),
];

const ctxOf = () => buildContext({ corrida: null, mod: null, tank: null, view: 'modules' });

beforeEach(() => { store.globalData = []; store.dateFrom = null; store.dateTo = null; });
afterEach(() => { store.globalData = []; });

describe('survival() · la población inicial es la primera lectura REAL (>0)', () => {
  it('el módulo NO infla su supervivencia por un 0 en la primera lectura', () => {
    store.globalData = conCero();
    const s = modStats(ctxOf(), 'M01', '573');
    expect(s.popFirst).toBe(1900000);   // 900 k + 1 M, no 1 M
    expect(s.pop).toBe(1500000);        // 700 k + 800 k
    expect(s.sv).toBeCloseTo(78.947, 2);
    expect(s.sv).not.toBe(100);         // antes: 150 % topado a 100
  });

  it('el KPI del Supervisor y Producción Omarsa dan la MISMA cifra', () => {
    store.globalData = conCero();
    const sup = modStats(ctxOf(), 'M01', '573');
    const core = modCorStats('M01', '573');
    expect(sup.popFirst).toBe(core.siembra);
    expect(sup.pop).toBe(core.cosecha);
    expect(sup.sv).toBeCloseTo(core.superv, 6);
  });

  it('el tanque con el 0 deja de mostrar «—» y da su supervivencia real', () => {
    store.globalData = conCero();
    const t = tankStats(ctxOf(), 'M01', 'TQ1', '573');
    expect(t.popFirst).toBe(900000);
    expect(t.sv).toBeCloseTo(77.78, 2);  // 700 k ÷ 900 k; antes null
  });
});

describe('no pasarse de corrección · el 0 en la ÚLTIMA lectura sí es real', () => {
  it('un tanque vaciado conserva población 0 y supervivencia 0 %', () => {
    store.globalData = [
      L({ Tanque: 'TQ1', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
      L({ Tanque: 'TQ1', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '0' }),
    ];
    const t = tankStats(ctxOf(), 'M01', 'TQ1', '573');
    expect(t.popFirst).toBe(1000000);
    expect(t.pop).toBe(0);
    expect(t.sv).toBe(0);   // no null: la producción se perdió, y eso es un dato
  });

  it('un tanque cuyas lecturas son TODAS 0 no inventa supervivencia', () => {
    store.globalData = [
      L({ Tanque: 'TQ1', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '0' }),
      L({ Tanque: 'TQ1', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '0' }),
    ];
    const t = tankStats(ctxOf(), 'M01', 'TQ1', '573');
    expect(t.popFirst).toBeNull();
    expect(t.sv).toBeNull();
  });
});
