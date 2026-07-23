import { describe, it, expect } from 'vitest';
import { isotonicDecreasing, monotoneDown, normHr, STD_HRS } from './tank.js';

describe('normHr (hora de la hoja → "H:MM:SS" 24h)', () => {
  it('formatos con dos puntos, con y sin segundos, y AM/PM', () => {
    expect(normHr('8:00:00')).toBe('8:00:00');
    expect(normHr('08:00')).toBe('8:00:00');
    expect(normHr('10:00')).toBe('10:00:00');
    expect(normHr('2:00 PM')).toBe('14:00:00');
    expect(normHr('12:00 AM')).toBe('0:00:00');
  });

  it('formato COMPACTO sin dos puntos (HMM / HHMM): antes se descartaba', () => {
    // Devolvía null y el llamante hace STD_HRS.indexOf(null) = -1, así que la lectura
    // desaparecía del perfil horario y del PDF de Parámetros, sin aviso.
    expect(normHr('800')).toBe('8:00:00');
    expect(normHr('0800')).toBe('8:00:00');
    expect(normHr('1000')).toBe('10:00:00');
    expect(normHr('0000')).toBe('0:00:00');
    expect(normHr('130')).toBe('1:30:00');
  });

  it('las horas compactas estándar caen en su franja de STD_HRS', () => {
    ['800', '0800'].forEach((h) => expect(STD_HRS.indexOf(normHr(h)), h).toBe(3));   // 8:00
    expect(STD_HRS.indexOf(normHr('1000'))).toBe(4);                                  // 10:00
    expect(STD_HRS.indexOf(normHr('0000'))).toBe(11);                                 // medianoche
    // Una hora no estándar se normaliza pero NO tiene franja: se descarta con razón.
    expect(STD_HRS.indexOf(normHr('130'))).toBe(-1);
  });

  it('valores imposibles o ambiguos siguen siendo null (no se inventa una hora)', () => {
    expect(normHr('2400')).toBeNull();   // hora ≥ 24
    expect(normHr('999')).toBeNull();    // minutos ≥ 60
    expect(normHr('8')).toBeNull();      // un solo dígito es ambiguo: no se adivina
    expect(normHr('abc')).toBeNull();
    expect(normHr('')).toBeNull();
    expect(normHr(null)).toBeNull();
  });
});

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
  it('con `cap` la curva nunca arranca por encima del tope (ancla a lo sembrado)', () => {
    // Pico temprano (1500) por encima del sembrado (1000): sin tope la isótona subiría
    // el arranque; con cap=1000 se ancla y desciende.
    const out = monotoneDown([1000, 1500, 800, 300], 1000);
    expect(out[0]).toBeLessThanOrEqual(1000);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeLessThanOrEqual(out[i - 1]);
  });
});
