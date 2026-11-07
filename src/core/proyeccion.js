/* ============================================================
   A24 (2026-11-07, usuario: «Sí, los tres») · LA PROYECCIÓN DE POBLACIÓN Y SUPERVIVENCIA, UNA SOLA REGLA

   La usan el pronóstico del tanque (Supervisor, tank.js) y el de Larvicultura (larvicultura/extra.js). Antes cada uno
   tenía la suya: la de Larvicultura podía SUBIR (con conteos 100, 110, 120 prometía 190 a siete días) y la del tanque no
   subía pero contaba REGISTROS en vez de días (con conteos separados por días distintos, «+7d» eran siete registros).

   LA REGLA:
   · una recta por DÍAS de calendario desde el primer conteo (`diasDesde`);
   · que NUNCA SUBE: no hay natalidad en el cultivo. Si la recta sale con pendiente positiva (el ruido del conteo
     manual), se proyecta PLANO desde el último dato real, que es lo más que cabe afirmar. Es la misma regla física que
     la proyección del módulo (`rate = Math.min(b, 0)`, supervisor/moduleTrends.js).
   ============================================================ */
import { parseAnyDate } from './dates.js';

/** Días de calendario de cada fecha desde la primera legible (null si una no se lee). */
export function diasDesde(fechas) {
  const ms = (fechas || []).map((f) => { const d = f instanceof Date ? f : parseAnyDate(f); return d && !isNaN(d) ? d.getTime() : null; });
  const base = ms.find((m) => m !== null);
  return ms.map((m) => (m === null || base === undefined ? null : Math.round((m - base) / 86400000)));
}

/** Recta por (días, valores) proyectada `horizonte` días, sin subir nunca. Parte del último día con dato, o de `xDesde`
 *  si se da (un gráfico con varias series parte del último día de TODAS).
 *  → { slope (por día; 0 si plana), desde (el valor en el día de partida), future: [+1d … +horizonte], plano } o null
 *  (menos de dos puntos, o todos el mismo día). */
export function proyeccionSinSubir(xs, ys, horizonte = 7, xDesde = null) {
  const pts = [];
  (ys || []).forEach((y, i) => { const x = xs[i]; if (y !== null && y !== undefined && !Number.isNaN(y) && x !== null && x !== undefined) pts.push([x, y]); });
  if (pts.length < 2) return null;
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  if (slope > 0) {
    const ultimo = pts[pts.length - 1][1];
    return { slope: 0, desde: ultimo, future: Array(horizonte).fill(ultimo), plano: true };
  }
  const xUlt = xDesde !== null && xDesde !== undefined ? xDesde : pts[pts.length - 1][0];
  const f = (x) => slope * x + intercept;
  return { slope, desde: f(xUlt), future: Array.from({ length: horizonte }, (_, k) => f(xUlt + k + 1)), plano: false };
}
