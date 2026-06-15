/* ============================================================
   REGISTROS · herencia compartida entre fichas estándar
   Compone el `data` efectivo (guardado + herencia) reutilizando los helpers
   validados del motor. Las reglas son idénticas para todas las fichas estándar;
   cada ficha solo declara su id y qué campos por tanque hereda.
   ============================================================ */

// Scopes de herencia (espejo de engine.js).
export const ESTADIO_FICHAS = ['calidad', 'plg', 'poblacion', 'calagua', 'despacho'];
export const LOTE_FICHAS = ['poblacion', 'plg'];

const fn = (o, name) => (o && typeof o[name] === 'function' ? o[name].bind(o) : null);

/**
 * @param {object}  o
 * @param {object}  o.saved      datos guardados
 * @param {number}  o.mod        índice de módulo
 * @param {string}  o.ficha      id de la ficha (calidad|plg|params|poblacion…)
 * @param {number}  o.tankCount  nº de tanques
 * @param {Array}   o.perTank    columnas por tanque a heredar:
 *                               [{ code:'e', scope: ESTADIO_FICHAS },
 *                                { code:'lt', scope: LOTE_FICHAS, std:'getStdLote' }]
 * @param {object}  o.engine     funciones del motor (default globalThis)
 * @returns {object} data efectivo (copia; no muta `saved`)
 */
export function resolveInheritance({
  saved = {},
  mod,
  ficha,
  tankCount = 12,
  perTank = [],
  tec = true,
  engine = globalThis,
} = {}) {
  const eff = { ...saved };
  const inhShared = fn(engine, '_inheritShared');
  const inhTank = fn(engine, '_inheritPerTank');
  const getCorr = fn(engine, 'getCorr');
  const gcfg = fn(engine, 'gcfg');

  if (!eff.corrida) {
    eff.corrida = (inhShared && inhShared(mod, 'corrida', ficha)) || (getCorr && getCorr(mod)) || '';
  }
  // tec=false para fichas sin técnico (p.ej. desinfeccion).
  if (tec && !eff.tec) {
    eff.tec = (inhShared && inhShared(mod, 'tec', ficha)) || (gcfg && gcfg('tec', '')) || '';
  }
  for (const pt of perTank) {
    const stdFn = pt.std ? fn(engine, pt.std) : null;
    for (let i = 0; i < tankCount; i++) {
      const k = `${pt.code}_${i}`;
      if (eff[k]) continue;
      let v = (inhTank && inhTank(mod, pt.code, i, ficha, pt.scope)) || '';
      if (!v && stdFn) v = stdFn(mod, i) || '';
      if (v) eff[k] = String(v);
    }
  }
  return eff;
}
