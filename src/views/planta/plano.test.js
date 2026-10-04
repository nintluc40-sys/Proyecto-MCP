/* ============================================================
   PLANTA · el plano trae los 10 módulos y las 5 salas con la numeración del dibujo
   (ARQ-A3 V4). Si alguien toca una fila, una columna o la regla de numeración de un módulo,
   la maqueta pintaría un tanque con el número de otro: aquí se nota.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { LARV, MAT, NUM_A, NUM_B } from './plano.js';

const numeros = (m) => m.rows.flatMap((_, r) => m.cols.map((_c, c) => m.num(r, c)));

describe('plano · larvicultura', () => {
  it('10 módulos, M1 a M10, con 112 tanques en total', () => {
    expect(LARV.map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10']);
    expect(LARV.reduce((s, m) => s + m.rows.length * m.cols.length, 0)).toBe(112);
  });

  it('cada módulo numera sus tanques del 1 al N, sin repetir ni saltar', () => {
    for (const m of LARV) {
      const n = numeros(m);
      expect([...n].sort((a, b) => a - b), m.id).toEqual(Array.from({ length: n.length }, (_, i) => i + 1));
    }
  });

  it('la numeración es la del plano: M1–M3 de 12 a 1 por filas, M4–M10 en pares (2·1, 4·3…)', () => {
    // M1–M3: fila de arriba 12 11 · 5 6; abajo 8 7 · 1 2 (plano)
    expect([0, 1, 2, 3].map((c) => NUM_A(0, c))).toEqual([12, 11, 5, 6]);
    expect([0, 1, 2, 3].map((c) => NUM_A(2, c))).toEqual([8, 7, 1, 2]);
    // M4–M10: columna izquierda los pares, derecha los impares
    expect([0, 1].map((c) => NUM_B(0, c))).toEqual([2, 1]);
    expect([0, 1].map((c) => NUM_B(4, c))).toEqual([10, 9]);
  });
});

describe('plano · maduración', () => {
  it('5 salas, S1 a S5: 15 circulares + 6 de desove en la 1, 6 + 6 en la 2 y la 3, 4 + 4 en la 4 y la 5', () => {
    expect(MAT.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    const s1 = MAT[0];
    expect(s1.circ.xs.length * s1.circ.zs.length).toBe(15);
    expect(s1.desove.xs.length * s1.desove.zs.length).toBe(6);
    expect(MAT.slice(1).map((s) => s.rows.length * s.cols.length)).toEqual([6, 6, 4, 4]);
  });

  it('los números de los tanques de maduración no se repiten entre salas (1 a 35)', () => {
    const s1 = MAT[0];
    const todos = [
      ...s1.circ.zs.flatMap((_, r) => s1.circ.xs.map((_x, c) => s1.circ.num(r, c))),
      ...MAT.slice(1).flatMap(numeros),
    ];
    expect([...todos].sort((a, b) => a - b)).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
  });
});
