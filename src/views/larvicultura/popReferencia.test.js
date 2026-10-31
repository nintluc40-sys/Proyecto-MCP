// @vitest-environment happy-dom
// Larvicultura · el semáforo de Población frente a lo NORMAL de la planta el mismo día de cultivo
// (2026-10-30, usuario: «Ajustarlo por etapa», «Sí, con mínimo 5 % y 10 %»). Con 20 % / 40 % fijos
// la pérdida, que crece con los días, decía cuánto había avanzado la corrida, no si iba mal. Todas
// las cifras de estas pruebas son INVENTADAS (las pruebas no llevan valores reales: el repo es público).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { larviculturaView } from './index.js';
import { buildPopData, popStats } from './extra.js';
import { curvasDePerdida, referenciaDelDia, referenciaPoblacion, claveCorrida, REF_MIN_CORRIDAS } from './popReferencia.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const noop = () => {};
const fakeCtx = new Proxy({}, { get: () => noop, set: () => true });
if (typeof globalThis.HTMLCanvasElement !== 'undefined') globalThis.HTMLCanvasElement.prototype.getContext = () => fakeCtx;

const L = (cor, tq, fecha, pob, mod = 'M01') => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': mod, Corrida: cor, Tanque: tq,
  Fecha: fecha, 'Estadío': 'N5', 'Población': pob === null ? '' : String(pob), Supervivencia: '90',
});
const perdida = (s) => (s.totalInit - s.totalCurr) / s.totalInit * 100;

describe('curvasDePerdida · la pérdida de cada corrida·módulo por día de cultivo', () => {
  // TQ1 no se contó el día 1 (0 = sin contar), 900 k el día 3 y 600 k el día 5; TQ2 1 M → 800 k el
  // día 3 → vaciado (0) el día 5; TQ3 sin ninguna población. El día 1 lo fija la PRIMERA fecha de la
  // corrida, aunque sea de una fila sin población (como el DOC de `cultivoInfo`).
  const rows = [
    L('600', 'TQ3', '01/10/2026', null),
    L('600', 'TQ1', '01/10/2026', 0), L('600', 'TQ2', '02/10/2026', 1000000),
    L('600', 'TQ1', '03/10/2026', 900000), L('600', 'TQ2', '03/10/2026', 800000),
    L('600', 'TQ1', '05/10/2026', 600000), L('600', 'TQ2', '05/10/2026', 0),
  ];
  const c = curvasDePerdida(rows)[claveCorrida('600', 'M01')];

  it('cada día, con las lecturas hasta ese día: primera > 0 como base, la última como actual', () => {
    expect(c[1]).toBeUndefined();                    // ningún tanque con base todavía
    expect(c[2]).toBeCloseTo(0, 6);                  // sólo TQ2: 1 M → 1 M
    expect(c[3]).toBeCloseTo((1900000 - 1700000) / 1900000 * 100, 6);
    expect(c[4]).toBeCloseTo(c[3], 6);               // sin lecturas nuevas: la misma
    expect(c[5]).toBeCloseTo((1900000 - 600000) / 1900000 * 100, 6); // el 0 del final cuenta
    expect(Object.keys(c).map(Number)).toEqual([2, 3, 4, 5]);
  });

  it('las filas pueden venir en cualquier orden: el día 1 sigue siendo la fecha más antigua', () => {
    expect(curvasDePerdida([...rows].reverse())[claveCorrida('600', 'M01')]).toEqual(c);
  });

  it('el último día da la MISMA pérdida que `popStats` (la que pinta la franja)', () => {
    expect(c[5]).toBeCloseTo(perdida(popStats(buildPopData(rows))), 9);
  });

  it('separa corridas y módulos: la misma corrida en otro módulo es otra curva', () => {
    const cur = curvasDePerdida([...rows, L('600', 'TQ1', '01/10/2026', 500000, 'M02'), L('600', 'TQ1', '03/10/2026', 250000, 'M02')]);
    expect(Object.keys(cur).sort()).toEqual([claveCorrida('600', 'M01'), claveCorrida('600', 'M02')]);
    expect(cur[claveCorrida('600', 'M02')][3]).toBeCloseTo(50, 6);
    expect(cur[claveCorrida('600', 'M01')][5]).toBeCloseTo(c[5], 9);
  });
});

describe('referenciaDelDia · lo normal de las OTRAS corridas ese día', () => {
  // 20 corridas con pérdidas 1, 2, …, 20 % el día 10; sólo 5 de ellas llegan al día 12.
  const curvas = {};
  for (let i = 1; i <= 20; i++) curvas[`C${i}`] = { 10: i, ...(i <= 5 ? { 12: 50 + i } : {}) };

  it('p75 = no la superan 3 de cada 4; p90 = 9 de cada 10 (sin la corrida que se juzga)', () => {
    expect(referenciaDelDia(curvas, 'nadie', 10)).toEqual({ dia: 10, n: 20, p75: 15, p90: 18 });
    // Sin C20 (la propia) quedan 19: 3 de cada 4 → la 15.ª (15 %), 9 de cada 10 → la 18.ª (18 %).
    expect(referenciaDelDia(curvas, 'C20', 10)).toEqual({ dia: 10, n: 19, p75: 15, p90: 18 });
    expect(referenciaDelDia(curvas, 'C1', 10)).toEqual({ dia: 10, n: 19, p75: 16, p90: 19 });
  });

  it(`con menos de ${REF_MIN_CORRIDAS} corridas ese día, el último día anterior que sí las tiene`, () => {
    expect(referenciaDelDia(curvas, 'nadie', 12)).toMatchObject({ dia: 10, n: 20 });
    expect(referenciaDelDia(curvas, 'nadie', 12, 5)).toMatchObject({ dia: 12, n: 5, p75: 54, p90: 55 });
  });

  it('sin ningún día con historia suficiente: null', () => {
    expect(referenciaDelDia(curvas, 'nadie', 9)).toBeNull();
    expect(referenciaDelDia({ C1: { 3: 10 } }, 'nadie', 3)).toBeNull();
  });
});

// La planta: 12 corridas de ENERO (otro mes) que el día 10 perdían de 50 % a 61 %, y la corrida 600
// (la de octubre) con 45 % el día 10. Con 20 % / 40 % fijos sería ROJA; frente a su planta, normal.
const historia = () => {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const cor = String(550 + i);
    out.push(L(cor, 'TQ1', '01/01/2026', 1000000), L(cor, 'TQ1', '10/01/2026', 1000000 - (50 + i) * 10000));
  }
  return out;
};
const corrida600 = (pob10) => [L('600', 'TQ1', '01/10/2026', 1000000), L('600', 'TQ1', '10/10/2026', pob10)];

describe('referenciaPoblacion · con TODO el historial', () => {
  it('toma las corridas de otros meses y deja fuera las filas que no son de Larvicultura', () => {
    // Una corrida 570 que sólo está en filas de otra hoja: si se colara, serían 13 corridas.
    const otra = (fecha, pob) => ({ ...L('570', 'TQ1', fecha, pob), _SheetOrigin: 'Algas' });
    const ref = referenciaPoblacion([...historia(), otra('01/01/2026', 1000000), otra('10/01/2026', 0), ...corrida600(550000)], '600', 'M01');
    expect(ref).toMatchObject({ diaCorrida: 10, dia: 10, n: 12 });
    expect(ref.p75).toBeCloseTo(58, 9);
    expect(ref.p90).toBeCloseTo(60, 9);
  });

  it('se recalcula cuando llega otro `globalData` (la memoria va por la identidad del arreglo)', () => {
    const a = [...historia(), ...corrida600(550000)];
    expect(referenciaPoblacion(a, '600', 'M01').n).toBe(12);
    const b = [...a, L('562', 'TQ1', '01/01/2026', 1000000), L('562', 'TQ1', '10/01/2026', 100000)];
    expect(referenciaPoblacion(b, '600', 'M01').n).toBe(13);
    expect(referenciaPoblacion(b, '600', 'M01').p90).toBeCloseTo(61, 9);
  });

  it('sin historia suficiente, o una corrida sin pérdida calculable: null', () => {
    expect(referenciaPoblacion(corrida600(550000), '600', 'M01')).toBeNull();
    expect(referenciaPoblacion(historia(), '600', 'M01')).toBeNull();
    expect(referenciaPoblacion(historia(), '', 'M01')).toBeNull();
  });
});

describe('Larvicultura · la franja de Población juzga la corrida frente a su planta (vista real)', () => {
  let root, errSpy;
  const setSel = (name, val) => {
    const s = root.querySelector(`[data-filter="${name}"]`);
    const opt = [...s.options].find((o) => o.value === val);
    if (!opt) throw new Error(`sin opción ${val} en ${name}: ${[...s.options].map((o) => o.value)}`);
    [...s.options].forEach((o) => { o.selected = o === opt; o.removeAttribute('selected'); });
    opt.setAttribute('selected', 'selected');
    s.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const franja = () => [...root.querySelectorAll('.lq-sem')].find((n) => n.textContent.includes('Población:'));
  const abrir = (datos) => {
    store.globalData = datos;
    larviculturaView(root);
    setSel('modulo', 'M01');
    setSel('corrida', '600');
    return franja();
  };
  beforeEach(() => {
    store.dateFrom = null; store.dateTo = null;
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

  it('45 % el día 10, cuando lo normal ese día es perder más: VERDE (con 20/40 fijos sería roja)', () => {
    const f = abrir([...historia(), ...corrida600(550000)]);
    expect(f.className).toContain('lq-sem-verde');
    expect(f.textContent).toContain('Pérdida acumulada 45.0% · día 10: de 12 corridas, 3 de cada 4 perdían hasta 58.0% y 9 de cada 10 hasta 60.0%');
  });

  it('peor que 9 de cada 10 corridas ese día: ROJA', () => {
    const f = abrir([...historia(), ...corrida600(380000)]);   // 62 %
    expect(f.className).toContain('lq-sem-rojo');
  });

  it('sin historia en la planta: vuelve a 20 % / 40 % y lo dice', () => {
    const f = abrir(corrida600(550000));
    expect(f.className).toContain('lq-sem-rojo');
    expect(f.textContent).toContain('sin historia suficiente: umbral fijo 20% / 40%');
  });
});
