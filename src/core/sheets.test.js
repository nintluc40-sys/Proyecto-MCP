import { describe, it, expect, beforeEach } from 'vitest';
import { parseSheetsIds, dataFingerprint, isDegraded } from './sheets.js';
import { store } from './store.js';

describe('parseSheetsIds', () => {
  it('detecta una URL de hoja "real" (/spreadsheets/d/ID)', () => {
    const ids = parseSheetsIds('https://docs.google.com/spreadsheets/d/ABC123/edit?usp=sharing');
    expect(ids).toEqual({ type: 'real', realId: 'ABC123' });
  });

  it('detecta una URL publicada (/d/e/ID)', () => {
    const ids = parseSheetsIds('https://docs.google.com/spreadsheets/d/e/PUB456/pubhtml');
    expect(ids).toEqual({ type: 'pub', pubId: 'PUB456' });
  });

  it('null para una URL inválida', () => {
    expect(parseSheetsIds('https://example.com/foo')).toBeNull();
  });
});

describe('dataFingerprint', () => {
  it('es estable: misma entrada → misma huella', () => {
    const sheets = { A: [{ x: 1 }, { x: 2 }] };
    expect(dataFingerprint(sheets)).toBe(dataFingerprint({ A: [{ x: 1 }, { x: 2 }] }));
  });

  it('cambia cuando cambia el número de filas', () => {
    const a = dataFingerprint({ A: [{ x: 1 }] });
    const b = dataFingerprint({ A: [{ x: 1 }, { x: 2 }] });
    expect(a).not.toBe(b);
  });

  it('cambia cuando cambia la primera o la última fila', () => {
    const base = dataFingerprint({ A: [{ x: 1 }, { x: 2 }, { x: 3 }] });
    const firstChanged = dataFingerprint({ A: [{ x: 9 }, { x: 2 }, { x: 3 }] });
    const lastChanged = dataFingerprint({ A: [{ x: 1 }, { x: 2 }, { x: 9 }] });
    expect(firstChanged).not.toBe(base);
    expect(lastChanged).not.toBe(base);
  });

  it('detecta un cambio en una fila interior no muestreada (fix D3)', () => {
    // n=6: el muestreo antiguo solo miraba los índices 0, 5 y 3 (medio).
    // El índice 1 quedaba fuera de la muestra → cambio invisible.
    const rows = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }, { x: 6 }];
    const changed = [{ x: 1 }, { x: 99 }, { x: 3 }, { x: 4 }, { x: 5 }, { x: 6 }];
    expect(dataFingerprint({ A: rows })).not.toBe(dataFingerprint({ A: changed }));
  });
});

describe('isDegraded (guarda contra "se cargó 1 sola hoja")', () => {
  beforeEach(() => { store.connected = false; store.sheetNames = []; });

  it('es false en la primera carga (no hay set previo con qué comparar)', () => {
    store.connected = false;
    store.sheetNames = [];
    expect(isDegraded({ Hoja1: [{}] })).toBe(false);
  });

  it('es true cuando llegan MENOS hojas que las ya cargadas', () => {
    store.connected = true;
    store.sheetNames = ['Larvicultura', 'Control_Tanque', 'Maduracion', 'Lab_Algas', 'Biomol'];
    expect(isDegraded({ Larvicultura: [{}] })).toBe(true); // 1 < 5 → degradado
  });

  it('es false al recibir igual número o más hojas (no degrada un upgrade)', () => {
    store.connected = true;
    store.sheetNames = ['A', 'B'];
    expect(isDegraded({ A: [{}], B: [{}] })).toBe(false);
    expect(isDegraded({ A: [{}], B: [{}], C: [{}] })).toBe(false);
  });

  it('es false si la descarga vino vacía (es otro fallo, no una degradación parcial)', () => {
    store.connected = true;
    store.sheetNames = ['A', 'B'];
    expect(isDegraded({})).toBe(false);
  });
});
