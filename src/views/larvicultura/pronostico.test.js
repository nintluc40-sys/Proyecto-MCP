/* ============================================================
   A24 (2026-11-07, usuario: «Sí, los tres») · EL PRONÓSTICO DE POBLACIÓN DE LARVICULTURA NO SUBE

   Con conteos 100, 110 y 120 la recta prometía 190 a siete días: una población que crece, que en el cultivo no existe.
   Ahora sigue la regla común (core/proyeccion.js), la misma que el pronóstico del tanque del Supervisor. Ficticios.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { seriesPronosticoPoblacion } from './extra.js';

const conteos = (fechas, valores) => fechas.map((fecha, i) => ({ fecha, poblacion: valores[i], _d: new Date(fecha + 'T00:00:00') }));

describe('A24 · el pronóstico de Larvicultura', () => {
  it('🔴 no sube: con 100, 110, 120 se queda en 120', () => {
    const sp = seriesPronosticoPoblacion({ 1: conteos(['2026-06-01', '2026-06-02', '2026-06-03'], [100, 110, 120]) }, 7);
    const proy = sp.series[0].proy;
    expect(proy[sp.days.length + 6]).toBe(120);
    expect(proy.slice(sp.days.length)).toEqual(Array(7).fill(120));
  });

  it('bajando, proyecta por días de calendario desde el último día del gráfico', () => {
    const sp = seriesPronosticoPoblacion({
      1: conteos(['2026-06-01', '2026-06-02', '2026-06-10'], [1000, 990, 910]),
      2: conteos(['2026-06-01', '2026-06-02'], [500, 495]),
    }, 3);
    const p2 = sp.series.find((s) => s.k === '2').proy;
    // TQ2 baja 5 al día; el gráfico acaba el 10/06, así que parte de 495 − 5 × 8 = 455.
    expect(p2[sp.days.length - 1]).toBeCloseTo(455, 6);
    expect(p2[sp.days.length]).toBeCloseTo(450, 6);
  });
});
