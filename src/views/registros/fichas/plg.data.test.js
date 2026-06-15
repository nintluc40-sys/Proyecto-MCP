import { describe, it, expect, vi } from 'vitest';
import { resolvePlgData, LOTE_FICHAS } from './plg.data.js';

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

describe('resolvePlgData', () => {
  it('respeta los valores guardados', () => {
    const eff = resolvePlgData({
      saved: { corrida: '552', tec: 'Ana', e_0: 'PL5', lt_0: 'L1' },
      mod: 1,
      tankCount: 1,
      engine: fakeEngine({ getStdLote: () => 'OTRO' }),
    });
    expect(eff.corrida).toBe('552');
    expect(eff.lt_0).toBe('L1');
  });

  it('hereda lote desde otra ficha, y cae a getStdLote si no hay herencia', () => {
    const fromOther = resolvePlgData({
      saved: {},
      mod: 1,
      tankCount: 1,
      engine: fakeEngine({ _inheritPerTank: (m, p) => (p === 'lt' ? 'LH' : '') }),
    });
    expect(fromOther.lt_0).toBe('LH');

    const fromStd = resolvePlgData({
      saved: {},
      mod: 1,
      tankCount: 1,
      engine: fakeEngine({ getStdLote: (m, i) => `STD${i}` }),
    });
    expect(fromStd.lt_0).toBe('STD0');
  });

  it('usa LOTE_FICHAS para la herencia de lote', () => {
    const inhTank = vi.fn(() => '');
    resolvePlgData({ saved: {}, mod: 2, tankCount: 1, engine: fakeEngine({ _inheritPerTank: inhTank }) });
    expect(inhTank).toHaveBeenCalledWith(2, 'lt', 0, 'plg', LOTE_FICHAS);
  });

  it('hereda corrida/tec/estadio como en calidad', () => {
    const eff = resolvePlgData({
      saved: {},
      mod: 1,
      tankCount: 1,
      engine: fakeEngine({
        _inheritShared: (m, f) => (f === 'corrida' ? '600' : f === 'tec' ? 'Téc' : ''),
        _inheritPerTank: (m, p) => (p === 'e' ? 'M3' : ''),
      }),
    });
    expect(eff.corrida).toBe('600');
    expect(eff.tec).toBe('Téc');
    expect(eff.e_0).toBe('M3');
  });

  it('no muta saved ni falla sin motor', () => {
    const saved = { corrida: '' };
    const eff = resolvePlgData({ saved, mod: 1, tankCount: 1, engine: {} });
    expect(saved.corrida).toBe('');
    expect(eff.corrida).toBe('');
  });
});
