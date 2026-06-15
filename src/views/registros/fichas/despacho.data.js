/* ============================================================
   REGISTROS · resolución de datos efectivos de la ficha "despacho"
   Wrapper de resolveInheritance: corrida/tec + estadio por tanque (sin lote).
   ============================================================ */
import { resolveInheritance, ESTADIO_FICHAS } from './inherit.js';

export function resolveDespachoData({ saved = {}, mod, tankCount = 12, engine = globalThis } = {}) {
  return resolveInheritance({
    saved,
    mod,
    ficha: 'despacho',
    tankCount,
    perTank: [{ code: 'e', scope: ESTADIO_FICHAS }],
    engine,
  });
}
