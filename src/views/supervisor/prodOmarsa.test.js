import { describe, it, expect } from 'vitest';
import { monthIndexOfCorrida, monthLabelAt } from './prodOmarsa.js';

// MESES_PROD definido: Enero(544) … Junio(573). Auto-extensión +6 desde Junio.
describe('monthIndexOfCorrida (auto-extensión +6)', () => {
  it('mapea corridas dentro de los meses definidos', () => {
    expect(monthIndexOfCorrida(544)).toBe(0); // Enero
    expect(monthIndexOfCorrida(573)).toBe(5); // Junio
    expect(monthIndexOfCorrida(578)).toBe(5); // sigue Junio (578-573 < 6)
  });

  it('Julio (579+) ya NO cae en Junio sino en el mes siguiente', () => {
    expect(monthIndexOfCorrida(579)).toBe(6); // Julio (virtual)
    expect(monthIndexOfCorrida(584)).toBe(6); // sigue Julio
    expect(monthIndexOfCorrida(585)).toBe(7); // Agosto
  });

  it('corridas por debajo del primer mes → -1; no numérico → -1', () => {
    expect(monthIndexOfCorrida(500)).toBe(-1);
    expect(monthIndexOfCorrida(NaN)).toBe(-1);
  });
});

describe('monthLabelAt (etiquetas, incl. meses virtuales)', () => {
  it('meses definidos', () => {
    expect(monthLabelAt(0)).toBe('Enero');
    expect(monthLabelAt(5)).toBe('Junio');
  });
  it('meses virtuales continúan la secuencia y reinician a Enero', () => {
    expect(monthLabelAt(6)).toBe('Julio');
    expect(monthLabelAt(7)).toBe('Agosto');
    expect(monthLabelAt(11)).toBe('Diciembre');
    expect(monthLabelAt(12)).toBe('Enero'); // ciclo
  });
});
