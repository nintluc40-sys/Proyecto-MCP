/* ============================================================
   MADURACIÓN · OPERATIVO — LA TASA DE CÓPULA, tarjeta de 📊 Estado actual (2026-10-27, usuario, ronda 8 · tarea 4)

   Decisiones del usuario: «📊 Estado actual, como indicador» (una tarjeta más que abre su gráfico) y «Tasa del día +
   acumulada». La regla es la del ⚖️ Saldo y la de 🌊 Mareas, sobre su misma base (`partesConHembras`):
   · cada día, Σ cópulas de los partes de Tanques ÷ Σ hembras que el libro tenía en esos tanques al CIERRE de ese día × 100;
     el período, Σ ÷ Σ. QM pierde la mitad de sus hembras el 11/09: ese día su tasa es 2 ÷ 10, no 2 ÷ 20;
   · el parte de un tanque sin hembras en el libro no cuenta (el tanque 2 de la Sala 1 está vacío y trae 3 cópulas);
   · un día en que NINGÚN tanque de la granja anota cópulas es un HUECO (el 18/09), no un cero: fuera, y se cuenta; con un
     filtro, el 0 de un día en que la granja sí anotó sigue siendo un 0 (la Sala 2 el 10/09);
   · aplican la sala, el tanque, el lote y el código (cuentan ENTEROS los tanques que los tienen); lo demás se dice.
   🔑 El gráfico sale de la MISMA función que la tarjeta: su acumulada termina en la cifra de la tarjeta, y cada día es el
   de 🌊 Mareas. Planta FICTICIA: la de operativo.mareas.test.js.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { partesConHembras, copulasYMarea } from './operativo.mareas.js';
import { modeloOperativo, diasDeTanque } from './operativo.data.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { kpiCopula, normalizarFiltro } from './operativo.tablero.js';
import { graficoCopula, graficoDeKpi, KPIS_CON_GRAFICO } from './operativo.kpis.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CG') => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha, Lote: lote,
  'Código genético': cg, 'Piscina Broodstock': 'P9', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
/* QM — Sala 1, tanque 1 (10♂ 20♀), código CG; el 11/09 mueren 10 hembras. QN — Sala 2, tanque 16 (10♂ 10♀), código CH.
   El tanque 2 de la Sala 1, vacío. El 18/09 nadie anota cópulas (hueco); el 13–16/09 y el 19–20/09, sin partes. */
const PLANTA = [
  ING('2026-08-01', 'QM', 'Sala 1', 1, 10, 20),
  ING('2026-09-05', 'QN', 'Sala 2', 16, 10, 10, 'CH'),
  TQ('2026-09-10', 'Sala 1', 1, { 'Cópulas': 4 }),
  TQ('2026-09-10', 'Sala 2', 16, { 'Cópulas': 0 }),
  TQ('2026-09-10', 'Sala 1', 2, { 'Cópulas': 3 }),
  TQ('2026-09-11', 'Sala 1', 1, { 'Cópulas': 2, 'Hembras muertas': 10 }),
  TQ('2026-09-12', 'Sala 1', 1, { 'Cópulas': 2 }),
  TQ('2026-09-17', 'Sala 1', 1, { 'Cópulas': 1 }),
  TQ('2026-09-17', 'Sala 2', 16, { 'Cópulas': 0 }),
  TQ('2026-09-18', 'Sala 1', 1, { 'Cópulas': '' }),
  TQ('2026-09-18', 'Sala 2', 16, {}),
  TQ('2026-09-21', 'Sala 2', 16, { 'Cópulas': 1 }),
];
const FOTO = '2026-09-21';
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const BASE = partesConHembras(M.fuentes, diasDeTanque(M.fuentes.tanques));
const P = { desde: '2026-09-10', hasta: '2026-09-21' };
const F = (o = {}) => normalizarFiltro(o);
const r2 = (v) => (v == null ? v : Math.round(v * 100) / 100);

describe('Maduración · tasa de cópula · la tarjeta (kpiCopula)', () => {
  it('🔴 el período: Σ cópulas ÷ Σ hembras del libro al cierre de cada día; el hueco y el tanque vacío fuera, y contados', () => {
    const k = kpiCopula(BASE, P, F());
    // 10/09: 4 / (20 + 10) · 11/09: 2 / 10 · 12/09: 2 / 10 · 17/09: 1 / (10 + 10) · 21/09: 1 / 10
    expect([k.copulas, k.hembras, r2(k.tasa), k.dias, k.huecos, k.sinHembras]).toEqual([10, 80, 12.5, 5, 1, 1]);
    expect([...k.porDia.entries()].map(([f, o]) => f.slice(8) + ':' + o.copulas + '/' + o.hembras))
      .toEqual(['10:4/30', '11:2/10', '12:2/10', '17:1/20', '21:1/10']);
    expect(k.ignora).toEqual([]);
  });

  it('🔴 con la sala: el 0 de la Sala 2 un día en que la granja sí anotó es un 0, no un hueco', () => {
    const k = kpiCopula(BASE, P, F({ sala: 'Sala 2' }));
    expect([k.copulas, k.hembras, r2(k.tasa), k.dias, k.huecos]).toEqual([1, 30, 3.33, 3, 1]);
  });

  it('el tanque, el lote y el código (cuentan enteros los tanques que los tienen)', () => {
    const qm = [9, 50, 18];
    expect(((k) => [k.copulas, k.hembras, r2(k.tasa)])(kpiCopula(BASE, P, F({ sala: 'Sala 1', tanque: 1 })))).toEqual(qm);
    expect(((k) => [k.copulas, k.hembras, r2(k.tasa)])(kpiCopula(BASE, P, F({ lote: 'QM' })))).toEqual(qm);
    expect(((k) => [k.copulas, k.hembras, r2(k.tasa)])(kpiCopula(BASE, P, F({ codigo: 'CH' })))).toEqual([1, 30, 3.33]);
  });

  it('el período acota (el 10/09 fuera) y lo que no aplica se DICE', () => {
    const k = kpiCopula(BASE, { desde: '2026-09-11', hasta: '2026-09-21' }, F({ estado: 'Producción', sexo: 'hembras' }));
    expect([k.copulas, k.hembras, k.dias]).toEqual([6, 50, 4]);
    expect(k.ignora).toEqual(['estado', 'sexo']);
  });

  it('sin partes con hembras, sin tasa (null, no 0)', () => {
    const k = kpiCopula(BASE, { desde: '2026-09-13', hasta: '2026-09-16' }, F());
    expect([k.tasa, k.dias, k.huecos]).toEqual([null, 0, 0]);
  });

  it('🔑 cada día es el MISMO que el de 🌊 Mareas (la misma regla, la misma base)', () => {
    const k = kpiCopula(BASE, P, F());
    const mareas = new Map(copulasYMarea(BASE, new Map()).dias.map((d) => [d.fecha, d.tasa]));
    for (const [f, o] of k.porDia) expect(r2((o.copulas / o.hembras) * 100), f).toBe(r2(mareas.get(f)));
    expect(mareas.size).toBe(k.porDia.size);
  });
});

describe('Maduración · tasa de cópula · su gráfico (graficoCopula)', () => {
  it('🔴 la tasa de cada día y la acumulada; un hueco o un día sin partes, en blanco en la del día', () => {
    const g = graficoCopula(BASE, P, F());
    expect(g.aplica).toBe(true);
    expect(g.tipo).toBe('lineas');
    expect(g.etiquetas).toEqual(Array.from({ length: 12 }, (_, i) => '2026-09-' + String(10 + i)));
    const [dia, acum] = g.series;
    expect(dia.datos.map(r2)).toEqual([13.33, 20, 20, null, null, null, null, 5, null, null, null, 10]);
    // la acumulada: 4/30, 6/40, 8/50 … 9/70 … 10/80; sigue como iba en los días en blanco
    expect(acum.datos.map(r2)).toEqual([13.33, 15, 16, 16, 16, 16, 16, 12.86, 12.86, 12.86, 12.86, 12.5]);
    expect([g.huecos, g.sinHembras]).toEqual([1, 1]);
  });

  it('🔴 la acumulada TERMINA en la cifra de la tarjeta, también con un filtro', () => {
    for (const f of [F(), F({ sala: 'Sala 2' }), F({ lote: 'QM' })]) {
      const g = graficoCopula(BASE, P, f);
      const k = kpiCopula(BASE, P, f);
      expect(g.series[1].datos[g.series[1].datos.length - 1]).toBeCloseTo(k.tasa, 10);
    }
  });

  it('antes del primer día con dato, la acumulada va en blanco', () => {
    const g = graficoCopula(BASE, { desde: '2026-09-08', hasta: '2026-09-11' }, F());
    expect(g.series[1].datos.map(r2)).toEqual([null, null, 13.33, 15]);
  });

  it('sólo con huecos o sin partes no hay gráfico, y se dice por qué', () => {
    expect(graficoCopula(BASE, { desde: '2026-09-18', hasta: '2026-09-18' }, F())).toEqual({ aplica: false,
      nota: 'En el período nadie anotó cópulas en ningún tanque de la granja: son huecos del registro, no ceros.' });
    expect(graficoCopula(BASE, { desde: '2026-09-13', hasta: '2026-09-16' }, F()).aplica).toBe(false);
  });

  it('es la tarjeta «copula» de 📊 Estado actual, antes de Biomasa, y graficoDeKpi la reparte con su base', () => {
    const i = KPIS_CON_GRAFICO.findIndex((x) => x.clave === 'copula');
    expect(KPIS_CON_GRAFICO[i]).toEqual({ clave: 'copula', titulo: 'Tasa de cópula' });
    expect(KPIS_CON_GRAFICO[i + 1].clave).toBe('biomasa');
    expect(graficoDeKpi('copula', { M, serie: [], partes: [], periodo: P, F: F(), copulas: BASE })).toEqual(graficoCopula(BASE, P, F()));
  });
});
