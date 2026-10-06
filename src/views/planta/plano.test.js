/* ============================================================
   PLANTA · el plano trae los 10 módulos y las 5 salas con la numeración del dibujo
   (ARQ-A3 V4). Si alguien toca una fila, una columna o la regla de numeración de un módulo,
   la maqueta pintaría un tanque con el número de otro: aquí se nota.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { LARV, MAT, NUM_A, NUM_B, OTHERS, STREET, tanquesDeSala, formasDelPlano } from './plano.js';
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

describe('plano 2D (T4 de 📊 Análisis)', () => {
  const P = formasDelPlano();
  const caja = (t) => (t.forma === 'circ' ? [t.cx - t.r, t.cz - t.r, t.cx + t.r, t.cz + t.r] : [t.x, t.z, t.x + t.w, t.z + t.h]);
  it('los mismos tanques que la maqueta: 112 de larvicultura; en maduración los del catálogo y los 6 de desove de la Sala 1', () => {
    expect(P.grupos.map((g) => g.id)).toEqual([...LARV.map((m) => m.id), ...MAT.map((m) => m.id)]);
    expect(P.grupos.filter((g) => g.kind === 'larv').reduce((s, g) => s + g.tanques.length, 0)).toBe(112);
    for (const s of MAT) {
      const g = P.grupos.find((x) => x.id === s.id);
      expect(g.tanques.filter((t) => !t.desove).map((t) => t.num).sort((a, b) => a - b), s.sala).toEqual(MAD_TANQUES_POR_SALA[s.sala]);
    }
    expect(P.grupos.find((g) => g.id === 'S1').tanques.filter((t) => t.desove).length).toBe(6);
    // la esquina y el largo de la maqueta (escena.js: centro = esquina + L/2, W/2)
    expect(P.grupos[0].tanques[0]).toEqual({ num: NUM_A(0, 0), forma: 'rect', x: LARV[0].cols[0], z: LARV[0].rows[0], w: LARV[0].L, h: LARV[0].W });
  });
  it('cada tanque dentro de su módulo o sala, sin pisar a otro; todo dentro de la vista', () => {
    for (const g of P.grupos) {
      const cs = g.tanques.map(caja);
      cs.forEach((c, i) => {
        expect(c[0] >= g.x - 0.01 && c[1] >= g.z - 0.01 && c[2] <= g.x + g.w + 0.01 && c[3] <= g.z + g.h + 0.01, g.id + ' tanque ' + g.tanques[i].num).toBe(true);
        cs.slice(i + 1).forEach((d) => expect(c[0] < d[2] && d[0] < c[2] && c[1] < d[3] && d[1] < c[3], g.id + ' solape').toBe(false));
      });
      expect(g.x >= P.vista.x && g.z >= P.vista.z && g.x + g.w <= P.vista.x + P.vista.w && g.z + g.h <= P.vista.z + P.vista.h, g.id).toBe(true);
    }
  });
  it('delante, en orden: grava, la calle a escala, playa y mar; las otras áreas con su nombre', () => {
    expect(P.bandas.map((b) => b.tipo)).toEqual(['grava', 'calle', 'playa', 'mar']);
    const calle = P.bandas[1];
    expect([calle.z, calle.z + calle.h]).toEqual(STREET);
    P.bandas.slice(1).forEach((b, i) => expect(b.z).toBeCloseTo(P.bandas[i].z + P.bandas[i].h, 5));
    const ult = P.bandas[3];
    expect(ult.z + ult.h).toBeCloseTo(P.vista.h, 5);
    expect(P.otras.length).toBe(OTHERS.length);
    expect(P.otras.every((o) => o.nombre && o.w > 0 && o.h > 0)).toBe(true);
  });
});
