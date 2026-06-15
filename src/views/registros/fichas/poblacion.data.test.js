import { describe, it, expect, vi } from 'vitest';
import { resolvePoblacionData } from './poblacion.data.js';
import { LOTE_FICHAS } from './inherit.js';

function fakeEngine(overrides = {}) {
  return {
    _inheritShared: vi.fn(() => ''),
    _inheritPerTank: vi.fn(() => ''),
    getCorr: vi.fn(() => ''),
    gcfg: vi.fn(() => ''),
    getStdLote: vi.fn(() => ''),
    ...overrides,
  };
}

describe('resolvePoblacionData', () => {
  it('hereda corrida/tec/estadio y lote (con fallback getStdLote) como plg', () => {
    const eff = resolvePoblacionData({
      saved: {},
      mod: 1,
      tankCount: 1,
      engine: fakeEngine({
        _inheritShared: (m, f) => (f === 'corrida' ? '600' : ''),
        _inheritPerTank: (m, p) => (p === 'e' ? 'M3' : ''),
        getStdLote: () => 'STD',
      }),
    });
    expect(eff.corrida).toBe('600');
    expect(eff.e_0).toBe('M3');
    expect(eff.lt_0).toBe('STD'); // sin herencia de lote → getStdLote
  });

  it('usa la ficha "poblacion" y LOTE_FICHAS en la herencia de lote', () => {
    const inhTank = vi.fn(() => '');
    resolvePoblacionData({ saved: {}, mod: 2, tankCount: 1, engine: fakeEngine({ _inheritPerTank: inhTank }) });
    expect(inhTank).toHaveBeenCalledWith(2, 'lt', 0, 'poblacion', LOTE_FICHAS);
  });

  it('respeta valores guardados y no muta saved', () => {
    const saved = { corrida: '552', lt_0: 'L1' };
    const eff = resolvePoblacionData({ saved, mod: 1, tankCount: 1, engine: fakeEngine({ getStdLote: () => 'X' }) });
    expect(eff.corrida).toBe('552');
    expect(eff.lt_0).toBe('L1');
    expect(saved.lt_0).toBe('L1');
  });
});
