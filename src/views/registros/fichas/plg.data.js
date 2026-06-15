/* ============================================================
   REGISTROS · resolución de datos efectivos de la ficha "plg"
   Wrapper de resolveInheritance: corrida/tec + estadio + lote (con getStdLote).
   ============================================================ */
import { resolveInheritance, ESTADIO_FICHAS, LOTE_FICHAS } from './inherit.js';

export { LOTE_FICHAS };

export function resolvePlgData({ saved = {}, mod, tankCount = 12, engine = globalThis } = {}) {
  return resolveInheritance({
    saved,
    mod,
    ficha: 'plg',
    tankCount,
    perTank: [
      { code: 'e', scope: ESTADIO_FICHAS },
      { code: 'lt', scope: LOTE_FICHAS, std: 'getStdLote' },
    ],
    engine,
  });
}
