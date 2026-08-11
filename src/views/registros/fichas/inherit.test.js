/* Herencia compartida entre fichas estándar. Es código de PRODUCCIÓN vivo —engine.js
   delega en él vía `window.__rgLib`— y no tenía ninguna prueba. */
import { describe, it, expect } from 'vitest';
import { resolveInheritance, ESTADIO_FICHAS, LOTE_FICHAS } from './inherit.js';

/* Motor falso que reproduce la semántica REAL de engine.js `_inheritShared`/
   `_inheritPerTank`: ambos consideran AUSENTE un valor cuyo String(v).trim() sea "". */
function makeEngine(store) {
  const present = (v) => v !== undefined && v !== null && v !== '' && String(v).trim() !== '';
  const FICHAS = ['calidad', 'plg', 'params', 'poblacion', 'calagua', 'despacho', 'desinfeccion'];
  return {
    _inheritShared: (m, field, except) => {
      for (const f of FICHAS) {
        if (f === except) continue;
        const v = store[`${m}|${f}`] && store[`${m}|${f}`][field];
        if (present(v)) return String(v);
      }
      return '';
    },
    _inheritPerTank: (m, prefix, i, except, scope) => {
      for (const f of scope) {
        if (f === except) continue;
        const v = store[`${m}|${f}`] && store[`${m}|${f}`][`${prefix}_${i}`];
        if (present(v)) return String(v);
      }
      return '';
    },
    getCorr: () => 'C-DEFECTO',
    gcfg: (k, d) => (k === 'tec' ? 'TEC-CFG' : d),
    getStdLote: (m, i) => 'LOTE-STD-' + i,
  };
}

describe('registros · resolveInheritance', () => {
  it('un valor de SOLO ESPACIOS no bloquea la herencia (misma regla que el motor)', () => {
    // "   " es TRUTHY en JS: con un falsy simple la ficha se quedaba con los espacios y se
    // abría visualmente en blanco habiendo un valor que heredar. El motor, dos funciones
    // más arriba, sí lo trata como ausente.
    const engine = makeEngine({ '3|plg': { corrida: 'C-HEREDADA', tec: 'ANA', e_0: 'PL10' } });
    const eff = resolveInheritance({
      saved: { corrida: '   ', tec: '\t', e_0: '  ' },
      mod: 3, ficha: 'calidad', tankCount: 2,
      perTank: [{ code: 'e', scope: ESTADIO_FICHAS }], engine,
    });
    expect(eff.corrida).toBe('C-HEREDADA');
    expect(eff.tec).toBe('ANA');
    expect(eff.e_0).toBe('PL10');
  });

  it('pero un valor REAL del usuario nunca se pisa', () => {
    // El guard tiene que seguir distinguiendo "lo escribió el técnico" de "está vacío":
    // si se pasara de corrección, la herencia machacaría datos tecleados a mano.
    const engine = makeEngine({ '3|plg': { corrida: 'C-HEREDADA', tec: 'ANA', e_0: 'PL10' } });
    const eff = resolveInheritance({
      saved: { corrida: 'C-MIA', tec: 'BETO', e_0: 'PL20' },
      mod: 3, ficha: 'calidad', tankCount: 2,
      perTank: [{ code: 'e', scope: ESTADIO_FICHAS }], engine,
    });
    expect(eff.corrida).toBe('C-MIA');
    expect(eff.tec).toBe('BETO');
    expect(eff.e_0).toBe('PL20');
  });

  it('no muta el objeto `saved` que recibe', () => {
    const saved = { corrida: '', e_0: '' };
    resolveInheritance({
      saved, mod: 3, ficha: 'calidad', tankCount: 3,
      perTank: [{ code: 'e', scope: ESTADIO_FICHAS }],
      engine: makeEngine({ '3|plg': { corrida: 'C1', e_0: 'PL5' } }),
    });
    expect(saved).toEqual({ corrida: '', e_0: '' });
  });

  it('combina herencia por tanque y fallback `std`, tanque a tanque', () => {
    // El tanque 1 lo hereda de una ficha vecina; los otros dos caen al lote estándar. Un
    // fixture con un solo tanque no distinguiría las dos rutas.
    const eff = resolveInheritance({
      saved: {}, mod: 3, ficha: 'plg', tankCount: 3,
      perTank: [{ code: 'lt', scope: LOTE_FICHAS, std: 'getStdLote' }],
      engine: makeEngine({ '3|poblacion': { lt_1: 'LOTE-VECINA' } }),
    });
    expect([eff.lt_0, eff.lt_1, eff.lt_2]).toEqual(['LOTE-STD-0', 'LOTE-VECINA', 'LOTE-STD-2']);
  });

  it('respeta el scope: el lote NO se hereda de una ficha fuera de LOTE_FICHAS', () => {
    const eff = resolveInheritance({
      saved: {}, mod: 3, ficha: 'plg', tankCount: 1,
      perTank: [{ code: 'lt', scope: LOTE_FICHAS }],
      engine: makeEngine({ '3|calidad': { lt_0: 'NO-DEBERIA' } }),   // calidad ∉ LOTE_FICHAS
    });
    expect(eff.lt_0).toBeUndefined();
  });

  it('tec=false (fichas sin técnico, p. ej. desinfección) no inventa el campo', () => {
    const eff = resolveInheritance({
      saved: {}, mod: 3, ficha: 'desinfeccion', tankCount: 1, tec: false,
      engine: makeEngine({ '3|calidad': { tec: 'ANA' } }),
    });
    expect(eff.corrida).toBe('C-DEFECTO');
    expect(eff.tec).toBeUndefined();
  });

  it('los scopes siguen coincidiendo con los de engine.js', () => {
    // Se declaran "espejo de engine.js": si allí cambian y aquí no, la herencia diverge
    // entre el monolito y la capa modular sin que nada falle.
    expect(ESTADIO_FICHAS).toEqual(['calidad', 'plg', 'poblacion', 'calagua', 'despacho']);
    expect(LOTE_FICHAS).toEqual(['poblacion', 'plg']);
  });
});
