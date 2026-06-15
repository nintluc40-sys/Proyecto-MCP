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
  it('estadío esperado por DOC', () => {
    expect(expectedStage(1)).toBe('N');
    expect(expectedStage(4)).toBe('Z2');
    expect(expectedStage(8)).toBe('M3');
    expect(expectedStage(12)).toBe('PL4');
  });
  it('rank ordena correctamente', () => {
    expect(stageRank('Z2')).toBeLessThan(stageRank('M1'));
    expect(stageRank('M3')).toBeLessThan(stageRank('PL1'));
    expect(stageRank('PL5')).toBeGreaterThan(stageRank('PL2'));
  });
});

describe('cultivoInfo', () => {
  const row = (fecha, estadio) => ({ Fecha: fecha, Estadío: estadio });
  it('calcula DOC inclusivo y compara con esperado', () => {
    const rows = [row('2026-06-01', 'Z1'), row('2026-06-05', 'Z3')];
    const c = cultivoInfo(rows);
    expect(c.doc).toBe(5);          // 1→5 inclusivo
    expect(c.stage).toBe('Z3');
    expect(c.esperado).toBe('Z3');  // DOC 5 → Z3
    expect(c.status).toBe('en_tiempo');
  });
  it('sin fechas → null', () => {
    expect(cultivoInfo([{ Estadío: 'Z1' }])).toBeNull();
  });
});
