import { describe, it, expect } from 'vitest';
import {
  CALIDAD_HEADER, CALIDAD_GROUPS, CALIDAD_CODES, fieldName,
} from './ficha-calidad.schema.js';

describe('esquema ficha Calidad', () => {
  it('cabecera tiene corrida, fecha y hora', () => {
    expect(CALIDAD_HEADER.map((f) => f.name)).toEqual(['corrida', 'fecha', 'hora']);
  });

  it('tiene 16 columnas numéricas, fieles al monolito', () => {
    expect(CALIDAD_CODES).toEqual([
      'll', 'sl', 'va', // Intestino
      'df', 'rt', 'mo', // Morfología General
      'hg', 'nv', 'op', // Otros
      'lp', // Hepatopáncreas
      'fl', 'nc', 'cb', 'pr', // Morfología PL
      'cos', 'es', // Calidad
    ]);
    expect(CALIDAD_CODES).toHaveLength(16);
  });

  it('los códigos son únicos', () => {
    expect(new Set(CALIDAD_CODES).size).toBe(CALIDAD_CODES.length);
  });

  it('los colspans de banda coinciden con el monolito (9 + 5 + 2)', () => {
    const byBand = (b) =>
      CALIDAD_GROUPS.filter((g) => g.band === b).reduce((n, g) => n + g.cols.length, 0);
    expect(byBand('Sanidad N5–M3')).toBe(9);
    expect(byBand('Post-larva')).toBe(5);
    expect(byBand('Calidad')).toBe(2);
  });

  it('fieldName compone <code>_<tank>', () => {
    expect(fieldName('ll', 3)).toBe('ll_3');
    expect(fieldName('cos', 12)).toBe('cos_12');
  });
});
