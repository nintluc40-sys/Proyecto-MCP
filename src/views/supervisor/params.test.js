import { describe, it, expect } from 'vitest';
import { waterSemaforo, linForecast } from './params.js';

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
