/* ============================================================
   REGISTROS · resolución de datos efectivos de la ficha "poblacion"
   Wrapper de resolveInheritance: corrida/tec + estadio + lote (igual que plg).
   ============================================================ */
import { resolveInheritance, ESTADIO_FICHAS, LOTE_FICHAS } from './inherit.js';

export function resolvePoblacionData({ saved = {}, mod, tankCount = 12, engine = globalThis } = {}) {
  return resolveInheritance({
    saved,
    mod,
    ficha: 'poblacion',
    tankCount,
    perTank: [
      { code: 'e', scope: ESTADIO_FICHAS },
      { code: 'lt', scope: LOTE_FICHAS, std: 'getStdLote' },
    ],
    engine,
  });
}
