import { describe, it, expect, vi } from 'vitest';
import { resolveParamsData } from './params.data.js';

function fakeEngine(overrides = {}) {
  return {
    _inheritShared: vi.fn(() => ''),
    getCorr: vi.fn(() => ''),
    gcfg: vi.fn(() => ''),
    ...overrides,
  };
}

describe('resolveParamsData', () => {
  it('respeta valores guardados', () => {
    const eff = resolveParamsData({
      saved: { corrida: '552', tec: 'Ana' },
      mod: 1,
      engine: fakeEngine({ getCorr: () => '999' }),
    });
    expect(eff.corrida).toBe('552');
    expect(eff.tec).toBe('Ana');
  });

  it('hereda corrida (compartida → getCorr) y tec (compartida → gcfg)', () => {
    const fromShared = resolveParamsData({
      saved: {},
      mod: 1,
      engine: fakeEngine({
        _inheritShared: (m, f) => (f === 'corrida' ? '600' : ''),
        gcfg: (k) => (k === 'tec' ? 'TécCfg' : ''),
      }),
    });
    expect(fromShared.corrida).toBe('600');
    expect(fromShared.tec).toBe('TécCfg');
  });

  it('NO inventa estadio (no hereda; queda como esté en saved)', () => {
    const eff = resolveParamsData({ saved: {}, mod: 1, engine: fakeEngine() });
    expect(eff.estadio).toBeUndefined();
  });

  it('no muta saved ni falla sin motor', () => {
    const saved = { corrida: '' };
    const eff = resolveParamsData({ saved, mod: 1, engine: {} });
    expect(saved.corrida).toBe('');
    expect(eff.corrida).toBe('');
  });
});
