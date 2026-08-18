import { describe, it, expect } from 'vitest';
import { plgAggregate, densSiembra, volumenSiembra } from './prodOmarsa.js';
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

/* La densidad de siembra dejó de estimarse con 28 t FIJAS por tanque: ahora divide por el
   volumen real de los tanques, que sale de la columna «Toneladas» de "Datos Larvicultura".
   Las 28 t siguen existiendo, pero como respaldo TANQUE A TANQUE, no como constante.

   El caso que de verdad importa es el mixto: un módulo medido a medias tiene que aprovechar
   lo que sí se midió, en vez de descartarlo y volver entero al valor por defecto. */
describe('volumenSiembra · lo registrado + 28 t por cada tanque sin dato', () => {
  it('sin ningún tonelaje registrado equivale al volumen fijo de siempre', () => {
    expect(volumenSiembra(0, 2)).toBe(56);            // 2 tanques × 28 t
  });

  it('con todos los tanques medidos usa SOLO lo registrado', () => {
    expect(volumenSiembra(65, 0)).toBe(65);
  });

  it('mezcla medidos y sin medir dentro del mismo módulo', () => {
    expect(volumenSiembra(30, 1)).toBe(58);           // 30 t medidas + 1 tanque × 28 t
  });

  it('sin tanques sembrados → null (no hay volumen por el que dividir)', () => {
    expect(volumenSiembra(0, 0)).toBeNull();
    expect(volumenSiembra(null, null)).toBeNull();
  });
});

describe('densSiembra · Σ siembra ÷ volumen ÷ 1000', () => {
  it('con la columna vacía da lo MISMO que la fórmula anterior de 28 t fijas', () => {
    // 8.600.000 en 2 tanques sin tonelaje ⇒ 8.600.000/(2×28)/1000 = 153,5714…
    expect(densSiembra(8600000, volumenSiembra(0, 2))).toBeCloseTo(153.5714, 3);
  });

  it('el tonelaje registrado cambia la densidad', () => {
    // Los mismos nauplios en un tanque de 30 t y otro sin medir ⇒ 8.600.000/(58×1000)
    expect(densSiembra(8600000, volumenSiembra(30, 1))).toBeCloseTo(148.2759, 3);
  });

  it('sin volumen o sin siembra → null', () => {
    expect(densSiembra(8600000, null)).toBeNull();
    expect(densSiembra(8600000, 0)).toBeNull();
    expect(densSiembra(null, 56)).toBeNull();
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
