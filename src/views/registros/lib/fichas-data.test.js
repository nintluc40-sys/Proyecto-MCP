import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isDataLayerReady, loadFicha, loadFichaEntry, saveFicha, fichaStatus,
} from './fichas-data.js';

// El motor expone su capa de datos como funciones globales (engine.js es script
// clásico). Aquí las simulamos sobre globalThis para probar el adaptador aislado.
const original = {};
beforeEach(() => {
  for (const k of ['loadE', 'saveE', 'getStatus']) original[k] = globalThis[k];
});
afterEach(() => {
  for (const k of ['loadE', 'saveE', 'getStatus']) {
    if (original[k] === undefined) delete globalThis[k];
    else globalThis[k] = original[k];
  }
});

describe('isDataLayerReady', () => {
  it('false sin motor, true con motor', () => {
    delete globalThis.loadE;
    delete globalThis.saveE;
    expect(isDataLayerReady()).toBe(false);
    globalThis.loadE = () => null;
    globalThis.saveE = () => true;
    expect(isDataLayerReady()).toBe(true);
  });
});

describe('adaptador sobre el motor', () => {
  it('loadFicha devuelve solo data (o null)', () => {
    globalThis.saveE = () => true;
    globalThis.loadE = vi.fn((m, f) => ({ mod: m, ficha: f, synced: false, data: { corrida: '552' } }));
    expect(loadFicha(1, 'calidad')).toEqual({ corrida: '552' });

    globalThis.loadE = () => null;
    expect(loadFicha(1, 'calidad')).toBeNull();
  });

  it('loadFichaEntry devuelve la entrada completa', () => {
    globalThis.saveE = () => true;
    const entry = { mod: 2, ficha: 'plg', synced: true, data: {} };
    globalThis.loadE = () => entry;
    expect(loadFichaEntry(2, 'plg')).toBe(entry);
  });

  it('saveFicha delega en saveE con synced booleanizado', () => {
    globalThis.loadE = () => null;
    const saveE = vi.fn(() => true);
    globalThis.saveE = saveE;
    expect(saveFicha(3, 'calidad', { x: 1 })).toBe(true);
    expect(saveE).toHaveBeenCalledWith(3, 'calidad', { x: 1 }, false);
  });

  it('fichaStatus delega en getStatus', () => {
    globalThis.loadE = () => null;
    globalThis.saveE = () => true;
    globalThis.getStatus = () => 'pending';
    expect(fichaStatus(1, 'calidad')).toBe('pending');
  });

  it('lanza un error claro si el motor no está cargado', () => {
    delete globalThis.loadE;
    delete globalThis.saveE;
    expect(() => loadFicha(1, 'calidad')).toThrow(/engine\.js/);
  });
});
