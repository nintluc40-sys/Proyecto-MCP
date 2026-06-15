/* ============================================================
   REGISTROS · resolución de datos efectivos de la ficha "params"
   Wrapper de resolveInheritance: SOLO corrida/tec (estadío no hereda).
   ============================================================ */
import { resolveInheritance } from './inherit.js';

export function resolveParamsData({ saved = {}, mod, engine = globalThis } = {}) {
  return resolveInheritance({ saved, mod, ficha: 'params', perTank: [], engine });
}
