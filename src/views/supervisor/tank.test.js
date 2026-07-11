import { describe, it, expect } from 'vitest';
import { isotonicDecreasing, monotoneDown } from './tank.js';

describe('isotonicDecreasing (envolvente monótona no creciente)', () => {
  it('una serie ya descendente queda intacta', () => {
    expect(isotonicDecreasing([100, 80, 60, 40])).toEqual([100, 80, 60, 40]);
  });
  it('promedia los picos que romperían la monotonía (nunca sube)', () => {
    // El pico 90 (> 60) se promedia con el 60 anterior → bloque {75,75}.
    const out = isotonicDecreasing([100, 60, 90, 40]);
    expect(out).toEqual([100, 75, 75, 40]);
    // resultado no creciente
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeLessThanOrEqual(out[i - 1]);
  });
  it('conserva el primer y el último valor cuando ya son extremos', () => {
    const out = isotonicDecreasing([1000, 1200, 800, 300]);
    expect(out[0]).toBeGreaterThanOrEqual(out[out.length - 1]);
    expect(out[out.length - 1]).toBe(300);
  });
});

describe('monotoneDown (conserva huecos y posiciones)', () => {
  it('deja los null en su sitio y normaliza el resto', () => {
    const out = monotoneDown([100, null, 130, 50]);
    expect(out[1]).toBeNull();
    // sin contar el hueco, el resto es no creciente
    const vals = out.filter((v) => v !== null);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeLessThanOrEqual(vals[i - 1]);
  });
  it('con menos de 2 valores devuelve la serie tal cual', () => {
    expect(monotoneDown([500])).toEqual([500]);
    expect(monotoneDown([])).toEqual([]);
  });
});
