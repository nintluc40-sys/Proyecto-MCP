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
