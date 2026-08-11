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

describe('parseAnyDate · fechas que el calendario NO admite', () => {
  // `new Date(y, m-1, d)` desborda en vez de fallar, así que `isNaN` nunca las detectaba y
  // entraban como buenas: '32/01/2026' se contabilizaba como 1 de FEBRERO.
  it('descarta el día desbordado en vez de correrlo al mes siguiente', () => {
    expect(parseAnyDate('32/01/2026')).toBeNull();   // daba 2026-02-01
    expect(parseAnyDate('00/01/2026')).toBeNull();   // daba 2025-12-31
  });

  it('descarta el mes imposible en vez de saltar de año', () => {
    expect(parseAnyDate('15/13/2026')).toBeNull();   // daba 2027-01-15
    expect(parseAnyDate('45/45/2026')).toBeNull();   // daba 2029-10-15
  });

  it('la rama ISO se valida igual que la rama dd/mm/yyyy', () => {
    expect(parseAnyDate('2026-13-15')).toBeNull();
    expect(parseAnyDate('2026-02-31')).toBeNull();
  });

  it('valida contra el calendario REAL, no contra un rango fijo 1–31', () => {
    // Estas 4 son la prueba de fuego: un chequeo perezoso `d>=1 && d<=31 && m>=1 && m<=12`
    // aceptaría el 29 de febrero de un año NO bisiesto y el 31 de abril, que no existen.
    expect(parseAnyDate('29/02/2024')).not.toBeNull();  // 2024 es bisiesto → sí existe
    expect(parseAnyDate('29/02/2026')).toBeNull();      // 2026 no lo es → no existe
    expect(parseAnyDate('30/04/2026')).not.toBeNull();  // abril tiene 30
    expect(parseAnyDate('31/04/2026')).toBeNull();      // abril NO tiene 31
  });

  it('no se pasa de corrección: las fechas válidas siguen entrando igual', () => {
    const d = parseAnyDate('31/12/2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
    expect(parseAnyDate('2026-07-26').getDate()).toBe(26);
    expect(parseAnyDate('45000')).toBeInstanceOf(Date);   // el serial de Excel no se toca
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
