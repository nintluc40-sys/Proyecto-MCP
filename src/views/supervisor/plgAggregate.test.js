import { describe, it, expect } from 'vitest';
import { plgAggregate, densSiembra } from './prodOmarsa.js';
import { abbrevTecnico, tecnicosShort } from './ui.js';

// Convención del laboratorio (confirmada por el usuario): el PL/g de un módulo es el
// promedio de lo registrado en sus tanques, y el agregado de varios módulos es el
// promedio simple de esos PL/g. NO se pondera por cosecha.
describe('plgAggregate · promedio simple de los PL/g de los módulos', () => {
  it('promedia sin ponderar, aunque los módulos sean de tamaño muy distinto', () => {
    expect(plgAggregate([200, 100])).toBe(150);
  });

  it('ignora los módulos sin PL/g', () => {
    expect(plgAggregate([180, null, 120, undefined])).toBe(150);
  });

  it('sin ningún valor devuelve null', () => {
    expect(plgAggregate([])).toBeNull();
    expect(plgAggregate([null, null])).toBeNull();
    expect(plgAggregate(null)).toBeNull();
  });

  it('un solo módulo devuelve su propio PL/g', () => {
    expect(plgAggregate([137.5])).toBe(137.5);
  });
});

describe('densSiembra · volumen fijo de 28 t por tanque', () => {
  it('(Σsiembra / nº tanques) / 28 / 1000 = nauplios/L', () => {
    // 8.600.000 en 2 tanques ⇒ (8.600.000/2)/28/1000 = 153,5714…
    expect(densSiembra(8600000, 2)).toBeCloseTo(153.5714, 3);
  });

  it('sin tanques sembrados o sin siembra → null', () => {
    expect(densSiembra(8600000, 0)).toBeNull();
    expect(densSiembra(null, 2)).toBeNull();
  });
});

describe('abbrevTecnico · inicial del nombre + resto íntegro', () => {
  it('abrevia el caso habitual', () => {
    expect(abbrevTecnico('Juan Murillo')).toBe('J. Murillo');
    expect(abbrevTecnico('ana perez')).toBe('A. perez');
  });

  it('conserva TODOS los tokens siguientes (no adivina cuál es el apellido)', () => {
    expect(abbrevTecnico('Juan Carlos Murillo')).toBe('J. Carlos Murillo');
  });

  it('un solo nombre se deja tal cual; vacío o nulo → cadena vacía', () => {
    expect(abbrevTecnico('Murillo')).toBe('Murillo');
    expect(abbrevTecnico('')).toBe('');
    expect(abbrevTecnico(null)).toBe('');
    expect(abbrevTecnico('   ')).toBe('');
  });

  it('tolera espacios múltiples', () => {
    expect(abbrevTecnico('  Juan   Murillo  ')).toBe('J. Murillo');
  });
});

describe('tecnicosShort · hasta 2 nombres y "+N" para el resto', () => {
  it('uno o dos técnicos se muestran completos (abreviados)', () => {
    expect(tecnicosShort(['Juan Murillo']).short).toBe('J. Murillo');
    expect(tecnicosShort(['Juan Murillo', 'Ana Pérez']).short).toBe('J. Murillo · A. Pérez');
  });

  it('a partir del tercero resume con +N y deja la lista completa en `full`', () => {
    const r = tecnicosShort(['Juan Murillo', 'Ana Pérez', 'Luis Vera', 'Eva Mora']);
    expect(r.short).toBe('J. Murillo · A. Pérez +2');
    expect(r.full).toBe('Juan Murillo · Ana Pérez · Luis Vera · Eva Mora');
  });

  it('sin técnicos devuelve cadenas vacías (la tarjeta no pinta el bloque)', () => {
    expect(tecnicosShort([])).toEqual({ short: '', full: '' });
    expect(tecnicosShort(null)).toEqual({ short: '', full: '' });
  });
});
