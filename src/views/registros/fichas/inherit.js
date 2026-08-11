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

/* MISMA definición de «presente» que `_inheritShared`/`_inheritPerTank` en engine.js
   (`v !== undefined && v !== null && v !== "" && String(v).trim() !== ""`). Con un falsy
   simple, un valor de SOLO ESPACIOS —truthy en JS— bloqueaba la herencia: la ficha se abría
   con Corrida y Estadío visualmente en blanco habiendo un valor disponible para heredar
   (medido), y el técnico tenía que re-teclearlo o lo guardaba vacío. La capa modular
   contradecía así al motor que dice espejar. */
const present = (v) => v !== undefined && v !== null && String(v).trim() !== '';

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

  if (!present(eff.corrida)) {
    eff.corrida = (inhShared && inhShared(mod, 'corrida', ficha)) || (getCorr && getCorr(mod)) || '';
  }
  // tec=false para fichas sin técnico (p.ej. desinfeccion).
  if (tec && !present(eff.tec)) {
    eff.tec = (inhShared && inhShared(mod, 'tec', ficha)) || (gcfg && gcfg('tec', '')) || '';
  }
  for (const pt of perTank) {
    const stdFn = pt.std ? fn(engine, pt.std) : null;
    for (let i = 0; i < tankCount; i++) {
      const k = `${pt.code}_${i}`;
      if (present(eff[k])) continue;
      let v = (inhTank && inhTank(mod, pt.code, i, ficha, pt.scope)) || '';
      if (!v && stdFn) v = stdFn(mod, i) || '';
      if (v) eff[k] = String(v);
    }
  }
  return eff;
}
