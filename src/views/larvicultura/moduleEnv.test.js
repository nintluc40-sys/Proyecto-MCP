import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import { moduleEnv } from './compute.js';

// Fila de Larvicultura / Control_Tanque con _SheetOrigin.
const lrow = (mod, fecha, extra) => ({ _SheetOrigin: 'Larvicultura', Modulo: mod, Fecha: fecha, ...extra });
const trow = (mod, fecha, extra) => ({ _SheetOrigin: 'Control_Tanque_1', Modulo: mod, Fecha: fecha, ...extra });

describe('moduleEnv', () => {
  beforeEach(() => { store.globalData = []; });

  it('sin módulo → null', () => {
    expect(moduleEnv(null)).toBeNull();
  });

  it('OD/Temp se leen de Tomas si Larvicultura no los trae; Salinidad de Larvicultura', () => {
    store.globalData = [
      lrow('M1', '2026-06-01', { Salinidad: 30 }),
      lrow('M1', '2026-06-02', { Salinidad: 31 }),
      trow('M1', '2026-06-01', { OD: 6, Temperatura: 31 }),
      trow('M1', '2026-06-02', { OD: 5.5, Temperatura: 32 }),
    ];
    const env = moduleEnv('M1');
    const byKey = Object.fromEntries(env.vars.map((v) => [v.key, v]));
    expect(byKey.sal.srcName).toBe('Larvicultura');
    expect(byKey.od.srcName).toBe('Tomas');
    expect(byKey.tmp.srcName).toBe('Tomas');
    expect(byKey.od.last).toBeCloseTo(5.5, 5);
    expect(byKey.sal.last).toBeCloseTo(31, 5);
  });

  it('estado out cuando un valor sale de su banda', () => {
    store.globalData = [trow('M2', '2026-06-01', { Temperatura: 40, OD: 6, Salinidad: 30 })];
    const env = moduleEnv('M2');
    const tmp = env.vars.find((v) => v.key === 'tmp');
    expect(tmp.status).toBe('out');     // 40°C fuera de 30–33
    expect(env.level).toBe('rojo');
  });

  it('respeta el filtro de corrida', () => {
    store.globalData = [
      trow('M1', '2026-06-01', { Corrida: '580', OD: 6, Temperatura: 31, Salinidad: 30 }),
      trow('M1', '2026-06-02', { Corrida: '581', OD: 3, Temperatura: 31, Salinidad: 30 }),
    ];
    const env = moduleEnv('M1', '580');
    expect(env.vars.find((v) => v.key === 'od').last).toBeCloseTo(6, 5);
  });
});
