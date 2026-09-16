/* ============================================================
   LARVICULTURA · compute.js — el cálculo de la vista, sin DOM

   POR QUÉ ESTE ARCHIVO (P9). `compute.js` es la aritmética de toda la vista
   Larvicultura —selectores en cascada, serie diaria, último estado, ICL y los KPIs de
   tendencia— y de sus ocho exportaciones sólo UNA, `moduleEnv`, tenía prueba
   (`moduleEnv.test.js`). Las otras siete las consumen `index.js`, `modals.js` y
   `extra.js`, que sí se prueban, pero a través de la UI: un promedio equivocado allí se
   ve como un número plausible en una gráfica, que es la forma más cara de enterarse.

   Son de CARACTERIZACIÓN: fijan lo que el módulo hace hoy, incluidas las decisiones que
   no se deducen leyendo la firma —la ventana se mide contra la fecha más reciente DEL
   CONJUNTO y no contra hoy; el peso de una variable ausente no diluye el ICL; la
   supervivencia se recorta a 100 al componer—. Cada fixture está escrito para que la
   regla correcta y la equivocada den resultados DISTINTOS: un promedio de 10 y 20 no
   distingue `sum/n` de `sum/2`, así que ninguno tiene dos muestras iguales por casualidad.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import {
  buildLarviculturaData, windowRows, dailySeries, lastState,
  iclOf, scoreOf, compositeScore, buildTrendKpis,
} from './compute.js';

/* Dos variables con pesos DISTINTOS y que no suman 1: así se ve si el divisor es la suma
   de los pesos presentes (lo correcto) o una constante. */
const VARS = [
  { key: 'a', keys: ['A'], peso: 0.75 },
  { key: 'b', keys: ['B'], peso: 0.25 },
];
const fila = (fecha, extra) => ({ _SheetOrigin: 'Larvicultura', Fecha: fecha, ...extra });

describe('windowRows · la ventana se mide contra el conjunto, no contra hoy', () => {
  const rows = [fila('2026-06-01'), fila('2026-06-02'), fila('2026-06-05')];

  it('el fixture ejerce algo: sin ventana devuelve las mismas filas', () => {
    expect(windowRows(rows, null)).toHaveLength(3);
    expect(windowRows(rows, 0)).toHaveLength(3);
    expect(windowRows([], 7)).toHaveLength(0);
  });

  it('🔴 la referencia es la fecha MÁS RECIENTE del conjunto, no la de hoy', () => {
    // Con "hoy" como referencia, un histórico de junio de 2026 saldría siempre vacío.
    expect(windowRows(rows, 1).map((r) => r.Fecha)).toEqual(['2026-06-05']);
    expect(windowRows(rows, 4).map((r) => r.Fecha)).toEqual(['2026-06-02', '2026-06-05']);
    expect(windowRows(rows, 5).map((r) => r.Fecha)).toEqual(['2026-06-01', '2026-06-02', '2026-06-05']);
  });

  it('🔴 con ventana, una fila SIN fecha legible no pertenece a ningún «últimos N días»', () => {
    const conRota = [...rows, fila('vaya usted a saber')];
    expect(windowRows(conRota, 5)).toHaveLength(3);
    // …pero sin ventana no se pierde: el recorte es lo que la excluye, no el filtro.
    expect(windowRows(conRota, null)).toHaveLength(4);
  });

  it('si NINGUNA fila tiene fecha legible se devuelven todas: recortar a ciegas vaciaría la vista', () => {
    const sinFecha = [fila(''), fila('n/d')];
    expect(windowRows(sinFecha, 3)).toHaveLength(2);
  });
});

describe('dailySeries · promedio por fecha, en orden y sin confundir «falta» con 0', () => {
  it('🔴 agrupa por fecha y promedia aunque las filas lleguen desordenadas', () => {
    const d = dailySeries([
      fila('2026-06-03', { A: 10, B: 1 }),
      fila('2026-06-01', { A: 4, B: 9 }),
      fila('2026-06-01', { A: 10, B: 3 }),
    ], VARS);
    expect(d.map((x) => x.fecha)).toEqual(['2026-06-01', '2026-06-03']);
    expect(d[0].a).toBeCloseTo(7, 5);   // (4+10)/2 — dos muestras distintas a propósito
    expect(d[0].b).toBeCloseTo(6, 5);   // (9+3)/2
    expect(d[1].a).toBeCloseTo(10, 5);
  });

  it('🔴 una variable sin ningún valor ese día es null, no 0', () => {
    // Un 0 aquí arrastraría el promedio y el ICL hacia «perfecto» sin que falte el dato.
    const d = dailySeries([fila('2026-06-01', { A: 8 })], VARS);
    expect(d[0].a).toBeCloseTo(8, 5);
    expect(d[0].b).toBeNull();
  });

  it('el promedio del día ignora las filas que no traen esa variable', () => {
    const d = dailySeries([fila('2026-06-01', { A: 6 }), fila('2026-06-01', { B: 2 })], VARS);
    expect(d[0].a).toBeCloseTo(6, 5);
    expect(d[0].b).toBeCloseTo(2, 5);
  });

  it('una fila sin fecha no inventa un día', () => {
    expect(dailySeries([fila('', { A: 5 })], VARS)).toHaveLength(0);
  });
});

describe('lastState · el último valor de CADA variable, aunque sean de días distintos', () => {
  it('🔴 cada variable busca hacia atrás por su cuenta; la fecha es la del último día', () => {
    const daily = dailySeries([
      fila('2026-06-01', { A: 3, B: 9 }),
      fila('2026-06-02', { A: 7 }),
    ], VARS);
    const l = lastState(daily, VARS);
    expect(l.fecha).toBe('2026-06-02');
    expect(l.a).toBeCloseTo(7, 5);
    expect(l.b).toBeCloseTo(9, 5);   // del día 1: el 2 no midió B
  });

  it('una variable que nunca se midió queda en null', () => {
    const l = lastState(dailySeries([fila('2026-06-01', { A: 3 })], VARS), VARS);
    expect(l.b).toBeNull();
  });

  it('sin días no hay último estado', () => {
    expect(lastState([], VARS)).toBeNull();
  });
});

describe('ICL y score crudo · ponderados por el peso de lo que SÍ hay', () => {
  it('el fixture ejerce algo: con las dos variables, el peso manda', () => {
    // 0.75·20 + 0.25·0 = 15 → ICL 85. Con pesos iguales daría 10 → ICL 90.
    expect(scoreOf({ a: 20, b: 0 }, VARS)).toBeCloseTo(15, 5);
    expect(iclOf({ a: 20, b: 0 }, VARS)).toBeCloseTo(85, 5);
  });

  it('🔴 la variable ausente no diluye: el divisor es la suma de los pesos PRESENTES', () => {
    // Sólo `a` (peso 0.75) vale 20 → 20, no 15 (que sería dividir entre la suma total).
    expect(scoreOf({ a: 20, b: null }, VARS)).toBeCloseTo(20, 5);
    expect(iclOf({ a: 20, b: null }, VARS)).toBeCloseTo(80, 5);
  });

  it('sin una sola variable medida no hay índice (ni un 100 de regalo)', () => {
    expect(iclOf({ a: null, b: undefined }, VARS)).toBeNull();
    expect(scoreOf({ a: null, b: undefined }, VARS)).toBeNull();
    expect(iclOf(null, VARS)).toBeNull();
    expect(scoreOf(null, VARS)).toBeNull();
  });

  it('un 0 medido es un dato, no una ausencia', () => {
    expect(iclOf({ a: 0, b: null }, VARS)).toBeCloseTo(100, 5);
  });
});

describe('compositeScore · 70 % ICL + 30 % supervivencia', () => {
  it('🔴 con las dos, la mezcla; y la supervivencia se recorta a 100', () => {
    expect(compositeScore(80, 50)).toBeCloseTo(0.7 * 80 + 0.3 * 50, 5);
    // Una supervivencia >100 (redondeos del Sheet) no puede empujar el compuesto por encima.
    expect(compositeScore(80, 130)).toBeCloseTo(0.7 * 80 + 0.3 * 100, 5);
  });

  it('🔴 con una sola, esa manda sin ponderar: mezclar con un hueco daría un número falso', () => {
    expect(compositeScore(80, null)).toBe(80);
    expect(compositeScore(null, 60)).toBe(60);
  });

  it('sin ninguna, null', () => {
    expect(compositeScore(null, undefined)).toBeNull();
  });
});

describe('buildTrendKpis · último y anterior, saltándose los huecos', () => {
  const rows = [
    fila('2026-06-01', { A: 20, B: 0, Supervivencia: 50 }),
    fila('2026-06-02', { A: 40, B: 0 }),                      // sin supervivencia ese día
    fila('2026-06-03', { A: 0, B: 0, Supervivencia: 90 }),
  ];
  const daily = () => dailySeries(rows, VARS);

  it('🔴 el ICL actual y el anterior salen de días consecutivos con dato', () => {
    const k = buildTrendKpis(daily(), rows, VARS);
    expect(k.icl.cur).toBeCloseTo(100, 5);   // día 3: 0.75·0
    expect(k.icl.prev).toBeCloseTo(70, 5);   // día 2: 100 − 0.75·40
  });

  it('🔴 «anterior» SALTA el día sin dato en vez de darlo por null', () => {
    const k = buildTrendKpis(daily(), rows, VARS);
    expect(k.surv.cur).toBeCloseTo(90, 5);
    expect(k.surv.prev).toBeCloseTo(50, 5); // el día 2 no midió: el anterior es el día 1
  });

  it('la supervivencia del día es el promedio de sus filas', () => {
    const r2 = [fila('2026-06-01', { Supervivencia: 40 }), fila('2026-06-01', { Supervivencia: 80 })];
    const k = buildTrendKpis(dailySeries(r2, VARS), r2, VARS);
    expect(k.surv.cur).toBeCloseTo(60, 5);
    expect(k.surv.prev).toBeNull();
  });

  it('el score compuesto se calcula por día con la misma fórmula', () => {
    const k = buildTrendKpis(daily(), rows, VARS);
    expect(k.score.cur).toBeCloseTo(0.7 * 100 + 0.3 * 90, 5);
  });
});

describe('buildLarviculturaData · los selectores en cascada', () => {
  const r = (corrida, modulo, tanque, fecha) =>
    ({ _SheetOrigin: 'Larvicultura', Corrida: corrida, Modulo: modulo, Tanque: tanque, Fecha: fecha });

  beforeEach(() => {
    store.globalData = [
      r('C-10', 'M02', 'T2', '2026-06-02'),
      r('C-10', 'M02', 'T1', '2026-06-01'),
      r('C-10', 'M01', 'T1', '2026-06-03'),
      r('C-9', 'M01', 'T5', '2026-05-30'),
    ];
  });

  it('el fixture ejerce algo: corridas y módulos en orden natural, no alfabético', () => {
    const d = buildLarviculturaData({}, VARS);
    expect(d.corridas).toEqual(['C-9', 'C-10']);   // alfabético daría C-10 antes que C-9
    expect(d.modulos).toEqual(['M01', 'M02']);
  });

  it('🔴 el módulo y el tanque se acotan a lo elegido antes', () => {
    const st = { corrida: 'C-9' };
    const d = buildLarviculturaData(st, VARS);
    expect(d.modulos).toEqual(['M01']);
    expect(d.tanques).toEqual(['T5']);
  });

  it('🔴 una selección que ya no existe se limpia en vez de vaciar la vista', () => {
    const st = { corrida: 'C-9', modulo: 'M02' };   // M02 no está en C-9
    buildLarviculturaData(st, VARS);
    expect(st.modulo).toBeNull();
  });

  it('🔴 auto-corrida: con módulo elegido y UNA sola corrida suya, se fija', () => {
    const st = { modulo: 'M02' };
    buildLarviculturaData(st, VARS);
    expect(st.corrida).toBe('C-10');
  });

  it('con el módulo en dos corridas, NO se elige por el usuario', () => {
    // Se parte de `corrida: null` a propósito: así se ve que la auto-corrida NO la tocó,
    // y no que el campo simplemente no existía.
    const st = { modulo: 'M01', corrida: null };
    buildLarviculturaData(st, VARS);
    expect(st.corrida).toBeNull();
  });

  it('🔴 monthCorridas acota TODO el conjunto, no sólo el desplegable', () => {
    const d = buildLarviculturaData({}, VARS, ['C-9']);
    expect(d.corridas).toEqual(['C-9']);
    expect(d.rows).toHaveLength(1);
    expect(d.byCor).toHaveLength(1);
  });

  it('las filas salen en orden cronológico y byCor conserva todos los tanques del módulo', () => {
    const d = buildLarviculturaData({ corrida: 'C-10', modulo: 'M02' }, VARS);
    expect(d.rows.map((x) => x.Fecha)).toEqual(['2026-06-01', '2026-06-02']);
    expect(d.byCor).toHaveLength(2);
  });
});
