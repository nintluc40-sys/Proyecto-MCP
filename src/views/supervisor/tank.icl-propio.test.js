// @vitest-environment happy-dom
/* ============================================================
   A24 (2026-11-07, usuario: «Sí, los tres») · EL ICL DEL TANQUE, CON LAS FILAS DEL TANQUE

   LO QUE PASABA: la vista Tanque calculaba su ICL con las filas del tanque MÁS las de Larvicultura sin tanque (registros
   a nivel de módulo), mientras la comparativa de tanques del módulo y OM vs Tex lo calculan sólo con las del tanque. Con
   los mismos datos, el mismo tanque daba dos ICL distintos. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildContext } from './stats.js';
import { renderTank } from './tank.js';
import { iclSeries } from './params.js';

const row = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });
const ctxFor = (rows) => {
  store.globalData = rows;
  store.dateFrom = null;
  store.dateTo = null;
  const ctx = buildContext({ corrida: null });
  ctx.vState = { corrida: null };
  return ctx;
};
const kpiIcl = (html) => (html.match(/🧪 ICL<\/div>\s*<div class="sv-kpi-value">([^<]*)</) || [])[1];

beforeEach(() => { store.dateFrom = null; store.dateTo = null; });

describe('A24 · el ICL del tanque', () => {
  it('🔴 no mezcla las filas del módulo sin tanque (antes, sí: otra cifra que en el módulo)', () => {
    const propias = [
      row({ Tanque: '1', Fecha: '2026-06-01', 'Población': '1000000', '% Actividad': '90', Deformidad: '2', 'Estadío': 'Z2' }),
      row({ Tanque: '1', Fecha: '2026-06-02', 'Población': '950000', '% Actividad': '92', Deformidad: '1', 'Estadío': 'Z3' }),
    ];
    const delModulo = row({ Fecha: '2026-06-02', Deformidad: '40', 'Estadío': 'Z3' });   // sin tanque
    const { html } = renderTank(ctxFor([...propias, delModulo]), 'M01', '1');
    const esperado = iclSeries(propias).values.filter((v) => v !== null && v !== undefined).at(-1);
    expect(kpiIcl(html)).toBe(String(Math.round(esperado)));
    const conModulo = iclSeries([...propias, delModulo]).values.filter((v) => v !== null && v !== undefined).at(-1);
    expect(Math.round(conModulo)).not.toBe(Math.round(esperado));   // el caso distingue
  });
});

describe('B5 · la fórmula del ICL que enseña el modal', () => {
  it('dice «Estrés × 10», que es como resta: un 8 en la hoja quita 80', () => {
    const base = { Tanque: '1', Fecha: '2026-06-01', 'Población': '1000000', '% Actividad': '90', 'Estadío': 'Z2' };
    const sin = iclSeries([row(base)]).values.at(-1);
    const con = iclSeries([row({ ...base, 'Estrés': '8' })]).values.at(-1);
    expect(sin - con).toBe(80);
    const { html } = renderTank(ctxFor([row({ ...base, 'Estrés': '8' })]), 'M01', '1');
    const nota = html.match(/ICL = \(SV[^<]*/)[0];
    expect(nota).toContain('Deformidad + Estrés × 10 + Retraso');
    expect(nota).toContain('por eso se multiplica por 10');
  });
});
