import { describe, it, expect } from 'vitest';
import { diagSemaforo, popSemaforo, aguaSemaforo, expectedStage, stageRank, cultivoInfo } from './status.js';

const VARS = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }];

describe('diagSemaforo', () => {
  it('todas en óptimo → verde', () => {
    expect(diagSemaforo({ a: 10, b: 5, c: 20 }, VARS).level).toBe('verde');
  });
  it('una en alerta → ámbar', () => {
    expect(diagSemaforo({ a: 10, b: 60, c: 20 }, VARS).level).toBe('ambar');
  });
  it('una en crítico → rojo', () => {
    expect(diagSemaforo({ a: 10, b: 90, c: 20 }, VARS).level).toBe('rojo');
  });
  it('sin datos → verde con detalle', () => {
    expect(diagSemaforo(null, VARS).detail).toMatch(/Sin datos/);
  });
});

describe('popSemaforo', () => {
  it('pérdida baja → verde', () => {
    expect(popSemaforo({ validTanks: 2, totalInit: 100, totalCurr: 90 }).level).toBe('verde');
  });
  it('pérdida media → ámbar', () => {
    expect(popSemaforo({ validTanks: 2, totalInit: 100, totalCurr: 70 }).level).toBe('ambar');
  });
  it('pérdida alta → rojo', () => {
    expect(popSemaforo({ validTanks: 2, totalInit: 100, totalCurr: 50 }).level).toBe('rojo');
  });
});

describe('aguaSemaforo', () => {
  it('valores bajos → verde', () => {
    expect(aguaSemaforo({ espuma: [3], suciedad: [4], recambio: [50] }).level).toBe('verde');
  });
  it('una sobre umbral → ámbar', () => {
    expect(aguaSemaforo({ espuma: [12], suciedad: [4], recambio: [50] }).level).toBe('ambar');
  });
  it('ambas altas → rojo', () => {
    expect(aguaSemaforo({ espuma: [11], suciedad: [12], recambio: [50] }).level).toBe('rojo');
  });
});

describe('expectedStage / stageRank', () => {
  it('estadío esperado por DOC (cronograma 1 estadío/día desde N5=día1)', () => {
    expect(expectedStage(1)).toBe('N5');  // día 1 = N5
    expect(expectedStage(2)).toBe('Z1');
    expect(expectedStage(4)).toBe('Z3');
    expect(expectedStage(7)).toBe('M3');
    expect(expectedStage(8)).toBe('PL1');  // día 8 = PL1
    expect(expectedStage(12)).toBe('PL5'); // día 12 = PL5
  });
  it('rank ordena correctamente', () => {
    expect(stageRank('Z2')).toBeLessThan(stageRank('M1'));
    expect(stageRank('M3')).toBeLessThan(stageRank('PL1'));
    expect(stageRank('PL5')).toBeGreaterThan(stageRank('PL2'));
  });
});

describe('cultivoInfo', () => {
  const row = (fecha, estadio) => ({ Fecha: fecha, Estadío: estadio });
  const day = (n) => { const d = new Date(2026, 5, 1); d.setDate(d.getDate() + n - 1); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

  it('un cultivo EN HORARIO (1 estadío/día desde N5) sale "en tiempo" cada día', () => {
    // Reproduce el bug reportado: con el cronograma viejo esto daba "adelantado".
    const secuencia = [[1, 'N5'], [2, 'Z1'], [3, 'Z2'], [4, 'Z3'], [5, 'M1'], [6, 'M2'], [7, 'M3'], [8, 'PL1'], [9, 'PL2'], [13, 'PL6']];
    secuencia.forEach(([n, st]) => {
      const rows = secuencia.filter(([m]) => m <= n).map(([m, s]) => row(day(m), s));
      const c = cultivoInfo(rows);
      expect(c.doc).toBe(n);
      expect(c.stage).toBe(st);
      expect(c.esperado).toBe(st);       // esperado == registrado
      expect(c.status).toBe('en_tiempo');
    });
  });

  it('un cultivo LENTO (2 estadíos en 5 días) sale "atrasado"', () => {
    const rows = [row('2026-06-01', 'Z1'), row('2026-06-05', 'Z3')];
    const c = cultivoInfo(rows);
    expect(c.doc).toBe(5);          // 1→5 inclusivo
    expect(c.stage).toBe('Z3');
    expect(c.esperado).toBe('M1');  // DOC 5 → M1 (va por detrás)
    expect(c.status).toBe('atrasado');
  });
  it('sin fechas → null', () => {
    expect(cultivoInfo([{ Estadío: 'Z1' }])).toBeNull();
  });
});
