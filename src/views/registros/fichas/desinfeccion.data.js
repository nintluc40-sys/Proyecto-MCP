/* ============================================================
   REGISTROS · resolución de datos efectivos de la ficha "desinfeccion"
   Wrapper de resolveInheritance: SOLO corrida (sin técnico, sin per-tank).
   ============================================================ */
import { resolveInheritance } from './inherit.js';

export function resolveDesinfeccionData({ saved = {}, mod, engine = globalThis } = {}) {
  return resolveInheritance({ saved, mod, ficha: 'desinfeccion', perTank: [], tec: false, engine });
}
