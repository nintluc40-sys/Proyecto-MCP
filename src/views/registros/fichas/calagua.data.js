/* ============================================================
   REGISTROS · resolución de datos efectivos de la ficha "calagua"
   Wrapper de resolveInheritance: corrida/tec + estadio por tanque (sin lote).
   ============================================================ */
import { resolveInheritance, ESTADIO_FICHAS } from './inherit.js';

export function resolveCalaguaData({ saved = {}, mod, tankCount = 12, engine = globalThis } = {}) {
  return resolveInheritance({
    saved,
    mod,
    ficha: 'calagua',
    tankCount,
    perTank: [{ code: 'e', scope: ESTADIO_FICHAS }],
    engine,
  });
}
