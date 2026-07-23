import { describe, it, expect } from 'vitest';
import { tankColorInfo } from './aguaColor.js';

describe('tankColorInfo', () => {
  it('color normal → nivel ok y mensaje normal', () => {
    const r = tankColorInfo('Café claro');
    expect(r.level).toBe('ok');
    expect(r.message).toBe('Coloración normal');
    expect(r.hex).toBe('#C9A66B');
  });

  it('color de problema → nivel warn y mensaje específico', () => {
    const r = tankColorInfo('Blanco lechoso');
    expect(r.level).toBe('warn');
    expect(r.message).toMatch(/mortalidad|bacteriana/i);
    expect(r.hex).toBe('#ECEAE0');
  });

  it('tolera tildes/mayúsculas', () => {
    expect(tankColorInfo('cafe claro').name).toBe('Café claro');
    expect(tankColorInfo('NEGRO VERDOSO').level).toBe('warn');
  });

  it('color desconocido → warn con hex por defecto', () => {
    const r = tankColorInfo('Fucsia');
    expect(r.name).toBe('Fucsia');
    expect(r.level).toBe('warn');
    expect(r.hex).toBe('#cfd8dc');
  });

  it('vacío → null', () => {
    expect(tankColorInfo('')).toBeNull();
    expect(tankColorInfo(null)).toBeNull();
  });
});

describe('tankColorInfo · claves heredadas del prototipo (valor libre del Sheet)', () => {
  // `HEX[key]` resolvía por la cadena de prototipos: estos valores devolvían una FUNCIÓN
  // (truthy), así que el fallback '#cfd8dc' nunca actuaba y ese valor acababa interpolado
  // como color en el style del cuadrito del PDF de Calidad de Agua.
  const HEREDADAS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
    'propertyIsEnumerable', 'toLocaleString', '__proto__', '__defineGetter__'];

  it('se tratan como color desconocido, no como una función', () => {
    HEREDADAS.forEach((v) => {
      const r = tankColorInfo(v);
      expect(typeof r.hex, `hex de "${v}"`).toBe('string');
      expect(r.hex, `hex de "${v}"`).toBe('#cfd8dc');
      expect(typeof r.message, `message de "${v}"`).toBe('string');
      expect(r.message, `message de "${v}"`).toBe('Revisar coloración');
      expect(r.level, `level de "${v}"`).toBe('warn');
      expect(r.name, `name de "${v}"`).toBe(v);
    });
  });

  it('el hex resultante es siempre un color válido para interpolar en un style', () => {
    [...HEREDADAS, 'Fucsia', 'Café claro', 'Blanco lechoso'].forEach((v) => {
      expect(tankColorInfo(v).hex, `hex de "${v}"`).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('los colores conocidos y el desconocido corriente NO cambian', () => {
    expect(tankColorInfo('Café claro').hex).toBe('#C9A66B');
    expect(tankColorInfo('Café claro').level).toBe('ok');
    expect(tankColorInfo('Blanco lechoso').hex).toBe('#ECEAE0');
    expect(tankColorInfo('Fucsia').hex).toBe('#cfd8dc');
    expect(tankColorInfo('Fucsia').message).toBe('Revisar coloración');
  });
});
