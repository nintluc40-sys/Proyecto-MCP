/* ============================================================
   PLANTA · el plano trae los 10 módulos y las 5 salas con la numeración del dibujo
   (ARQ-A3 V4). Si alguien toca una fila, una columna o la regla de numeración de un módulo,
   la maqueta pintaría un tanque con el número de otro: aquí se nota.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { LARV, MAT, NUM_A, NUM_B, OTHERS, tanquesDeSala } from './plano.js';
import { MAD_SALA_OPTS, MAD_TANQUES_POR_SALA } from '../registros/lib/ficha-maduracion-ingreso.schema.js';

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

describe('plano · otras áreas (opción F)', () => {
  it('cada área lleva nombre; el canal sedimentador es un canal, no un edificio', () => {
    expect(OTHERS.every((o) => typeof o[6] === 'string' && o[6].length > 3)).toBe(true);
    expect(OTHERS.find((o) => /Canal sedimentador/.test(o[6]))[5]).toBe('canal');
    expect(OTHERS.filter((o) => o[7]).map((o) => o[7]).sort()).toEqual(['admin', 'comedor', 'diesel', 'filtros', 'lab', 'maquinas']);
  });
});

describe('plano · maduración', () => {
  it('5 salas, S1 a S5, con el nombre de sala del MCP', () => {
    expect(MAT.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(MAT.map((s) => s.sala)).toEqual(MAD_SALA_OPTS);
  });

  it('cada sala tiene EXACTAMENTE los tanques del catálogo del MCP (las salas 4 y 5 siguen al MCP, no al plano)', () => {
    for (const s of MAT) {
      const nums = s.circ ? s.circ.zs.flatMap((_, r) => s.circ.xs.map((_x, c) => s.circ.num(r, c))) : tanquesDeSala(s).map((t) => t.num);
      expect([...nums].sort((a, b) => a - b), s.sala).toEqual(MAD_TANQUES_POR_SALA[s.sala]);
    }
  });

  it('la Sala 1 conserva sus 6 tanques de desove (sin registro por tanque en el MCP)', () => {
    expect(MAT[0].desove.xs.length * MAT[0].desove.zs.length).toBe(6);
  });
});
