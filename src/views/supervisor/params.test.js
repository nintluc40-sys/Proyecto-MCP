import { describe, it, expect } from 'vitest';
import { waterSemaforo, linForecast, iclSeries } from './params.js';

describe('waterSemaforo', () => {
  it('todo en rango → verde', () => {
    expect(waterSemaforo(4, 5, 'ok').level).toBe('verde');
    expect(waterSemaforo(null, null, null).level).toBe('verde');
  });

  it('una variable sobre umbral → ámbar', () => {
    expect(waterSemaforo(12, 5, 'ok').level).toBe('ambar');
    expect(waterSemaforo(4, 11, 'ok').level).toBe('ambar');
  });

  it('color de problema → rojo aunque espuma/suciedad estén bien', () => {
    expect(waterSemaforo(2, 3, 'warn').level).toBe('rojo');
  });

  it('espuma y suciedad ambas altas → rojo', () => {
    expect(waterSemaforo(11, 12, 'ok').level).toBe('rojo');
  });

  it('un valor muy alto (≥15) → rojo', () => {
    expect(waterSemaforo(16, 3, 'ok').level).toBe('rojo');
  });
});

describe('iclSeries · término SV (híbrido: rellena huecos con SV por población)', () => {
  const row = (fecha, pob, extra) => ({
    _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1',
    Fecha: fecha, 'Población': String(pob), 'Intestino_Lleno': '90', ...extra,
  });
  it('día CON columna cruda usa el valor crudo (no lo pisa la SV por población)', () => {
    // pob 1000 (base) → SV por población sería 100; pero hay SV cruda 80 → ICL = 80 + IL 90.
    const { values } = iclSeries([row('01/06/2026', 1000, { 'Supervivencia': '80' })]);
    expect(values[0]).toBeCloseTo(170, 6);
  });
  it('día SIN columna cruda se rellena con SV por población (no se descarta el término)', () => {
    const rows = [
      row('01/06/2026', 1000, { 'Supervivencia': '80' }), // base de población = 1000
      row('05/06/2026', 500),                              // sin Supervivencia → 500/1000×100 = 50
    ];
    const { values } = iclSeries(rows);
    expect(values[0]).toBeCloseTo(170, 6); // 80 (cruda) + 90 (IL)
    expect(values[1]).toBeCloseTo(140, 6); // 50 (población) + 90 (IL) — antes habría sido 90
  });
});

describe('iclSeries · el Estrés se escala a 0–100 antes de restar', () => {
  const row = (extra) => ({
    _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1',
    Fecha: '01/06/2026', 'Supervivencia': '80', ...extra,
  });

  it('un Estrés de 8/10 resta 80, no 8', () => {
    // Estrés es la única variable `kind: idx` (0–10); el resto son porcentajes 0–100.
    // Sumándolo en crudo, un estrés catastrófico pesaba lo mismo que un 8 % de deformidad.
    const sinEstres = iclSeries([row({})]).values[0];
    const conEstres = iclSeries([row({ 'Estrés': '8' })]).values[0];
    expect(sinEstres - conEstres).toBeCloseTo(80, 6);
  });

  it('el desglose muestra la CONTRIBUCIÓN escalada y la etiqueta lo advierte', () => {
    const { negByDay } = iclSeries([row({ 'Estrés': '8', 'Deformidad': '30' })]);
    const est = negByDay[0].find((x) => /Estrés/.test(x.label));
    expect(est.val).toBeCloseTo(80, 6);
    expect(est.label).toContain('×10');
    // Y por tanto ordena bien: 80 de estrés resta más que 30 de deformidad.
    expect(negByDay[0][0].label).toContain('Estrés');
  });

  it('las variables porcentuales siguen restando en crudo', () => {
    const base = iclSeries([row({})]).values[0];
    const conDef = iclSeries([row({ 'Deformidad': '12' })]).values[0];
    expect(base - conDef).toBeCloseTo(12, 6);
  });
});

describe('linForecast', () => {
  it('tendencia lineal perfecta se proyecta exacta', () => {
    const r = linForecast([0, 2, 4, 6, 8], 3);
    expect(r.slope).toBeCloseTo(2, 6);
    expect(r.future).toEqual([10, 12, 14]);
  });

  it('ignora huecos (null) en la serie', () => {
    const r = linForecast([0, null, 4, null, 8], 2);
    expect(r.slope).toBeCloseTo(2, 6);
    expect(r.future[0]).toBeCloseTo(10, 6);
  });

  it('pendiente negativa proyecta a la baja', () => {
    const r = linForecast([100, 90, 80, 70], 1);
    expect(r.slope).toBeLessThan(0);
    expect(r.future[0]).toBeCloseTo(60, 6);
  });

  it('serie insuficiente → null', () => {
    expect(linForecast([5], 7)).toBeNull();
    expect(linForecast([null, null], 7)).toBeNull();
  });

  it('predict(x) coincide con la recta', () => {
    const r = linForecast([1, 3, 5], 1);
    expect(r.predict(0)).toBeCloseTo(1, 6);
    expect(r.predict(2)).toBeCloseTo(5, 6);
  });
});
