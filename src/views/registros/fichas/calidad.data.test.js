import { describe, it, expect, vi } from 'vitest';
import { resolveCalidadData, ESTADIO_FICHAS } from './calidad.data.js';

// Motor simulado: helpers de herencia del monolito.
function fakeEngine(overrides = {}) {
  return {
    _inheritShared: vi.fn(() => ''),
    _inheritPerTank: vi.fn(() => ''),
    getCorr: vi.fn(() => ''),
    gcfg: vi.fn(() => ''),
    ...overrides,
  };
}

describe('resolveCalidadData', () => {
  it('respeta los valores guardados (no los pisa con herencia)', () => {
    const engine = fakeEngine({
      _inheritShared: () => 'HEREDADO',
      getCorr: () => '999',
    });
    const eff = resolveCalidadData({
      saved: { corrida: '552', tec: 'Ana', e_0: 'PL5' },
      mod: 1,
      tankCount: 2,
      engine,
    });
    expect(eff.corrida).toBe('552');
    expect(eff.tec).toBe('Ana');
    expect(eff.e_0).toBe('PL5');
  });

  it('hereda corrida desde otra ficha, y cae a getCorr si no hay herencia', () => {
    const fromOther = resolveCalidadData({
      saved: {},
      mod: 1,
      tankCount: 0,
      engine: fakeEngine({ _inheritShared: (m, field) => (field === 'corrida' ? '600' : '') }),
    });
    expect(fromOther.corrida).toBe('600');

    const fromCorr = resolveCalidadData({
      saved: {},
      mod: 1,
      tankCount: 0,
      engine: fakeEngine({ getCorr: () => '601' }),
    });
    expect(fromCorr.corrida).toBe('601');
  });

  it('hereda técnico desde herencia compartida o gcfg', () => {
    const eff = resolveCalidadData({
      saved: {},
      mod: 1,
      tankCount: 0,
      engine: fakeEngine({ gcfg: (k, d) => (k === 'tec' ? 'Téc. Config' : d) }),
    });
    expect(eff.tec).toBe('Téc. Config');
  });

  it('hereda estadio por tanque usando ESTADIO_FICHAS y el índice correcto', () => {
    const inhTank = vi.fn((m, prefix, i) => (i === 1 ? 'M3' : ''));
    const eff = resolveCalidadData({
      saved: {},
      mod: 2,
      tankCount: 3,
      engine: fakeEngine({ _inheritPerTank: inhTank }),
    });
    expect(eff.e_0).toBeUndefined(); // sin herencia → no se crea
    expect(eff.e_1).toBe('M3');
    expect(inhTank).toHaveBeenCalledWith(2, 'e', 1, 'calidad', ESTADIO_FICHAS);
  });

  it('no muta el objeto saved original', () => {
    const saved = { corrida: '' };
    resolveCalidadData({ saved, mod: 1, tankCount: 1, engine: fakeEngine({ getCorr: () => '7' }) });
    expect(saved.corrida).toBe('');
  });

  it('no falla si el motor no expone los helpers', () => {
    const eff = resolveCalidadData({ saved: { corrida: '5' }, mod: 1, tankCount: 2, engine: {} });
    expect(eff.corrida).toBe('5');
  });
});
