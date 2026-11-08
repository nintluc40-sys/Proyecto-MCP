/* ============================================================
   LARVICULTURA · la paleta · B10 (2026-11-08, usuario: «Los seis con lógica»)
   `catColor` da los 5 colores curados y, desde el 6.º, uno sintetizado. Lo que se promete:
   · HEX de 6 cifras, nunca `hsl(...)`: los gráficos le pegan un alfa (`color + '22'`), que sólo vale sobre hex;
   · dos tanques no comparten color, también con más de 5;
   · es estable: el mismo índice, el mismo color.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { ACCENT, NEUTRAL, SEM, CAT, catColor } from './palette.js';

const HEX = /^#[0-9a-f]{6}$/i;

describe('palette · catColor', () => {
  it('los 5 primeros son los curados', () => {
    expect([0, 1, 2, 3, 4].map(catColor)).toEqual(CAT);
  });

  it('desde el 6.º, HEX de 6 cifras: admite el alfa que le pegan los gráficos', () => {
    for (let i = 0; i < 40; i++) {
      expect(catColor(i), String(i)).toMatch(HEX);
      expect(catColor(i) + '22', String(i)).toMatch(/^#[0-9a-f]{8}$/i);
    }
  });

  it('con 24 tanques, ninguno repite color', () => {
    const colores = Array.from({ length: 24 }, (_, i) => catColor(i).toLowerCase());
    expect(new Set(colores).size).toBe(24);
  });

  it('es estable', () => {
    expect(catColor(7)).toBe(catColor(7));
    expect(catColor(13)).toBe(catColor(13));
  });
});

describe('palette · los colores fijos', () => {
  it('todos HEX, y el semáforo con sus cinco escalones en orden bueno → malo', () => {
    [ACCENT, NEUTRAL, ...CAT, ...Object.values(SEM)].forEach((c) => expect(c).toMatch(HEX));
    expect(Object.keys(SEM)).toEqual(['optimo', 'bueno', 'atencion', 'alerta', 'critico']);
  });
});
