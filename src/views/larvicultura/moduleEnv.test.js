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

  it('salinidad es informativa: fuera de banda NO marca nivel rojo', () => {
    store.globalData = [trow('M3', '2026-06-01', { Temperatura: 31, OD: 6, Salinidad: 50 })];
    const env = moduleEnv('M3');
    const sal = env.vars.find((v) => v.key === 'sal');
    expect(sal.status).toBe('info');   // nunca 'out', aunque 50 esté fuera de 28–36
    expect(env.level).toBe('verde');   // T°/OD en rango → módulo verde
  });

  it('respeta el filtro de corrida', () => {
    store.globalData = [
      trow('M1', '2026-06-01', { Corrida: '580', OD: 6, Temperatura: 31, Salinidad: 30 }),
      trow('M1', '2026-06-02', { Corrida: '581', OD: 3, Temperatura: 31, Salinidad: 30 }),
    ];
    const env = moduleEnv('M1', '580');
    expect(env.vars.find((v) => v.key === 'od').last).toBeCloseTo(6, 5);
  });

  it('sin corrida, acota a las corridas del mes (monthCorridas)', () => {
    store.globalData = [
      trow('M1', '2026-06-01', { Corrida: '580', OD: 6, Temperatura: 31, Salinidad: 30 }),
      trow('M1', '2026-05-01', { Corrida: '575', OD: 3, Temperatura: 31, Salinidad: 30 }), // fuera del mes
    ];
    const env = moduleEnv('M1', null, ['580']); // solo la 580 → no mezcla la 575
    expect(env.vars.find((v) => v.key === 'od').last).toBeCloseTo(6, 5);
  });

  it('sin corrida ni monthCorridas → todo el historial (backward-compat)', () => {
    store.globalData = [
      trow('M1', '2026-06-01', { Corrida: '580', OD: 6, Temperatura: 31, Salinidad: 30 }),
      trow('M1', '2026-06-02', { Corrida: '581', OD: 4, Temperatura: 31, Salinidad: 30 }),
    ];
    const env = moduleEnv('M1'); // 2 args como antes → promedia ambas corridas (last del 06-02 = 4)
    expect(env.vars.find((v) => v.key === 'od').last).toBeCloseTo(4, 5);
  });
});
