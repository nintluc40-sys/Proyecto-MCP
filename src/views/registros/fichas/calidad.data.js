/* ============================================================
   REGISTROS · resolución de datos efectivos de la ficha "Calidad"
   Wrapper de resolveInheritance: hereda corrida/tec + estadio por tanque.
   ============================================================ */
import { resolveInheritance, ESTADIO_FICHAS } from './inherit.js';

export { ESTADIO_FICHAS };

export function resolveCalidadData({ saved = {}, mod, tankCount = 12, engine = globalThis } = {}) {
  return resolveInheritance({
    saved,
    mod,
    ficha: 'calidad',
    tankCount,
    perTank: [{ code: 'e', scope: ESTADIO_FICHAS }],
    engine,
  });
}
