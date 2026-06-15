import { describe, it, expect } from 'vitest';
import { parseAnyDate, fmtShort, yearMonthKey, dayNum, isToday } from './dates.js';

// Tests de caracterización: fijan el comportamiento ACTUAL de parseo de fechas.
describe('parseAnyDate', () => {
  it('parsea dd/mm/yyyy a fecha local al mediodía', () => {
    const d = parseAnyDate('15/03/2024');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2); // marzo = 2
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(12);
  });

  it('parsea ISO yyyy-mm-dd', () => {
    const d = parseAnyDate('2024-03-15');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it('parsea un serial de Excel dentro de la ventana válida', () => {
    const d = parseAnyDate('45000'); // ~2023
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2023);
  });

  it('devuelve null para vacío, null y texto no fecha', () => {
    expect(parseAnyDate('')).toBeNull();
    expect(parseAnyDate(null)).toBeNull();
    expect(parseAnyDate('no-es-fecha')).toBeNull();
  });

  it('un serial fuera de la ventana cae al parser nativo (quirk D2)', () => {
    // Caracteriza D2: '20000' NO entra en la rama de serial Excel (asNum <= 25569),
    // así que `new Date('20000')` lo interpreta como el AÑO 20000, no como una fecha
    // de calendario plausible. Comportamiento actual a corregir en Fase B.
    const d = parseAnyDate('20000');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(20000);
  });

  it('cachea: misma cadena devuelve la misma instancia', () => {
    const a = parseAnyDate('15/03/2024');
    const b = parseAnyDate('15/03/2024');
    expect(a).toBe(b);
  });
});

describe('formato de fechas', () => {
  it('fmtShort vacío para null', () => {
    expect(fmtShort(null)).toBe('');
  });

  it('yearMonthKey produce YYYY-MM con cero a la izquierda', () => {
    expect(yearMonthKey(new Date(2024, 2, 5))).toBe('2024-03');
    expect(yearMonthKey(null)).toBeNull();
  });

  it('dayNum extrae el día', () => {
    expect(dayNum('15/03/2024')).toBe('15');
  });

  it('isToday es false para vacío', () => {
    expect(isToday('')).toBe(false);
  });
});
