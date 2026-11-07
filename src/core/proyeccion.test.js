/* ============================================================
   A24 (2026-11-07, usuario: «Sí, los tres») · LA PROYECCIÓN DE POBLACIÓN: POR DÍAS Y SIN SUBIR

   La regla común del pronóstico del tanque (Supervisor) y del de Larvicultura. Datos ficticios.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { diasDesde, proyeccionSinSubir } from './proyeccion.js';

describe('A24 · diasDesde', () => {
  it('cuenta días de calendario desde la primera fecha legible', () => {
    expect(diasDesde(['01/06/2026', '02/06/2026', '10/06/2026'])).toEqual([0, 1, 9]);
    expect(diasDesde(['x', '2026-06-01', '2026-06-03'])).toEqual([null, 0, 2]);
  });
});

describe('A24 · proyeccionSinSubir', () => {
  it('🔴 la recta va por DÍAS, no por número de registro', () => {
    // 1 000 → 990 en un día y → 910 en ocho más: por días, −10 al día; por registro saldría −45 por paso.
    const p = proyeccionSinSubir([0, 1, 9], [1000, 990, 910], 7);
    expect(p.slope).toBeCloseTo(-10, 0);
    expect(p.future[6]).toBeCloseTo(p.desde + 7 * p.slope, 6);
    expect(p.plano).toBe(false);
  });

  it('🔴 nunca sube: con 100, 110, 120 se queda en 120 (antes, 190 a siete días)', () => {
    const p = proyeccionSinSubir([0, 1, 2], [100, 110, 120], 7);
    expect(p.plano).toBe(true);
    expect(p.slope).toBe(0);
    expect(p.desde).toBe(120);
    expect(p.future).toEqual(Array(7).fill(120));
  });

  it('parte del día que se le diga (el último del gráfico), con la misma recta', () => {
    const p = proyeccionSinSubir([0, 1, 2], [100, 90, 80], 2, 4);
    expect(p.desde).toBeCloseTo(60, 6);
    expect(p.future).toEqual([50, 40].map((v) => expect.closeTo(v, 6)));
  });

  it('con menos de dos puntos, o todos el mismo día, no hay proyección', () => {
    expect(proyeccionSinSubir([0], [100], 7)).toBeNull();
    expect(proyeccionSinSubir([0, 0], [100, 90], 7)).toBeNull();
    expect(proyeccionSinSubir([0, null, 2], [100, 90, null], 7)).toBeNull();
  });
});
