/* ============================================================
   REGISTROS · los datos efectivos de la ficha Desinfección · B10 (2026-11-08, usuario: «Los seis con lógica»)
   `resolveDesinfeccionData` hereda SÓLO la corrida: esta ficha no registra técnico ni lleva nada por tanque. Lo
   guardado manda sobre lo heredado. Se ejerce con un motor de mentira que dice qué se le preguntó.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { resolveDesinfeccionData } from './desinfeccion.data.js';

/** Un motor que contesta a todo (corrida, técnico, tanques) y apunta lo que se le pide. */
function motor() {
  const pedido = [];
  return {
    pedido,
    _inheritShared: (mod, campo, ficha) => { pedido.push(['shared', mod, campo, ficha]); return campo === 'corrida' ? '552' : 'Técnico X'; },
    _inheritPerTank: (...a) => { pedido.push(['tank', ...a]); return '9'; },
    getCorr: () => '999',
    gcfg: () => 'Técnico Y',
  };
}

describe('resolveDesinfeccionData', () => {
  it('sin corrida guardada, la hereda de las fichas del módulo, como «desinfeccion»', () => {
    const e = motor();
    const d = resolveDesinfeccionData({ saved: {}, mod: 'M03', engine: e });
    expect(d.corrida).toBe('552');
    expect(e.pedido).toContainEqual(['shared', 'M03', 'corrida', 'desinfeccion']);
  });

  it('SIN técnico ni campos por tanque, aunque el motor los ofrezca', () => {
    const e = motor();
    const d = resolveDesinfeccionData({ saved: {}, mod: 'M03', engine: e });
    expect('tec' in d).toBe(false);
    expect(Object.keys(d)).toEqual(['corrida']);
    expect(e.pedido.every((p) => p[0] === 'shared' && p[2] === 'corrida')).toBe(true);
  });

  it('lo guardado manda: no se pregunta por la corrida, y lo demás pasa tal cual', () => {
    const e = motor();
    const saved = { corrida: '601', fecha: '2026-11-01', dx_1_a_0_estado: 'OK' };
    const d = resolveDesinfeccionData({ saved, mod: 'M03', engine: e });
    expect(d).toEqual(saved);
    expect(d).not.toBe(saved);   // una copia: no toca lo guardado
    expect(e.pedido).toEqual([]);
  });

  it('sin nada que heredar, la de `getCorr`; y sin motor que sepa, vacía', () => {
    const e = { getCorr: () => '777' };
    expect(resolveDesinfeccionData({ saved: {}, mod: 'M01', engine: e }).corrida).toBe('777');
    expect(resolveDesinfeccionData({ saved: {}, mod: 'M01', engine: {} }).corrida).toBe('');
  });
});
