import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import { moduleEnv } from './compute.js';
import { THRESHOLDS } from '../../config.js';

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
    expect(tmp.status).toBe('out');     // 40 °C: «Grave» en la escala de config.js
    expect(env.level).toBe('rojo');
  });

  /* A23 (06-11, decisión del usuario «La del Supervisor»): T° y OD con la escala de config.js,
     la misma de `odLevel`/`tmpLevel` en Supervisor y Planta. Antes, fuera del óptimo era rojo aquí
     y «Bueno» allí: con OD 4,5 y T° 30, la misma lectura daba dos veredictos. */
  const varDe = (env, k) => env.vars.find((v) => v.key === k);

  it('A23 · OD 4,5 y T° 30: «Bueno» y en rango, como en el Supervisor', () => {
    store.globalData = [trow('M4', '2026-06-01', { OD: 4.5, Temperatura: 30, Salinidad: 30 })];
    const env = moduleEnv('M4');
    expect([varDe(env, 'od').nivel, varDe(env, 'tmp').nivel]).toEqual(['bueno', 'bueno']);
    expect([varDe(env, 'od').status, varDe(env, 'tmp').status]).toEqual(['ok', 'ok']);
    expect(env.level).toBe('verde');
  });

  it('A23 · «Regular» o «Grave» sí es fuera de rango (lo que alerta el Supervisor), por arriba y por abajo', () => {
    const casos = [
      [3.5, 32, 'od', 'malo'], [8.5, 32, 'od', 'malo'], [2, 32, 'od', 'grave'], [9.5, 32, 'od', 'grave'],
      [6, 28, 'tmp', 'malo'], [6, 36, 'tmp', 'malo'], [6, 26, 'tmp', 'grave'], [6, 40, 'tmp', 'grave'],
    ];
    for (const [od, t, clave, nivel] of casos) {
      store.globalData = [trow('M5', '2026-06-01', { OD: od, Temperatura: t, Salinidad: 30 })];
      const env = moduleEnv('M5');
      expect(varDe(env, clave).nivel, `OD ${od} · T° ${t}`).toBe(nivel);
      expect(varDe(env, clave).status, `OD ${od} · T° ${t}`).toBe('out');
      expect(env.level, `OD ${od} · T° ${t}`).toBe('rojo');
    }
  });

  it('A23 · los bordes son los de config.js: OD 4 y 8, T° 29 y 35 siguen en rango; 3,9 y 28,9 ya no', () => {
    const nivelYEstado = (od, t) => {
      store.globalData = [trow('M6', '2026-06-01', { OD: od, Temperatura: t, Salinidad: 30 })];
      const env = moduleEnv('M6');
      return [varDe(env, 'od').nivel, varDe(env, 'od').status, varDe(env, 'tmp').nivel, varDe(env, 'tmp').status];
    };
    expect(nivelYEstado(4, 29)).toEqual(['bueno', 'ok', 'bueno', 'ok']);
    expect(nivelYEstado(8, 35)).toEqual(['bueno', 'ok', 'bueno', 'ok']);
    expect(nivelYEstado(5, 31)).toEqual(['excelente', 'ok', 'excelente', 'ok']);
    expect(nivelYEstado(3.9, 28.9)).toEqual(['malo', 'out', 'malo', 'out']);
  });

  it('A23 · la referencia que se enseña es el óptimo de config.js; la salinidad no lleva nivel', () => {
    store.globalData = [trow('M7', '2026-06-01', { OD: 6, Temperatura: 32, Salinidad: 30 })];
    const env = moduleEnv('M7');
    expect(varDe(env, 'od').band).toEqual(THRESHOLDS.od.optimo);
    expect(varDe(env, 'tmp').band).toEqual(THRESHOLDS.tmp.optimo);
    expect(varDe(env, 'sal').nivel).toBeNull();
  });

  it('A23 · sin dato de OD: nivel «sin» y no cuenta como fuera de rango', () => {
    store.globalData = [trow('M8', '2026-06-01', { Temperatura: 32, Salinidad: 30 })];
    const env = moduleEnv('M8');
    expect([varDe(env, 'od').nivel, varDe(env, 'od').status]).toEqual(['sin', 'sin']);
    expect(env.level).toBe('verde');
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
