/* ============================================================
   H1 · la otra mitad: marcas de reconciliación para Algas, Datos, Parámetros
   y Desinfección.

   Sin marca, un envío que acababa EN LA COLA se entregaba solo pero nadie tocaba el
   estado local: la ficha seguía diciendo «⏳ Guardado local» para siempre y el usuario la
   reenviaba a mano. Inocuo (el GAS hace upsert y es idempotente por reqId), pero enseña
   un estado FALSO.

   ⚠⚠ LO QUE MÁS IMPORTA AQUÍ ES EL SELLO. Estas fichas guardan UNA entrada por
   (módulo, ficha) y editarlas NO reenvía. Si la reconciliación marcara a ciegas, una
   entrega tardía pintaría «✅ En Google Sheets» encima de una edición POSTERIOR que no ha
   viajado — mentir sobre el dato de producción, en silencio. Media docena de estas
   pruebas existen sólo para fijar que NO lo hace.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** Extrae funciones del motor y las corre en una caja con los stubs que se le den. */
function fnDelMotor(nombres, extra = {}) {
  const code = nombres.map((n) => {
    const i = engine.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('no se halló ' + n + ' en engine.js');
    const j = engine.indexOf('\n}\n', i);
    return engine.slice(i, j + 2);
  }).join('\n');
  const ctx = { String, Set, Object, Array, Date, JSON, ...extra };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { ' + nombres.join(', ') + ' };').runInContext(ctx);
  return ctx.__api;
}

/* ── A · _marcaFichas sella el updatedAt ─────────────────────────────── */
describe('A · _marcaFichas', () => {
  const conEntradas = (mapa) => fnDelMotor(['_marcaFichas'], {
    loadE: (m, f) => mapa[m + '|' + f] || null,
  });

  it('sella el updatedAt de cada ficha', () => {
    const { _marcaFichas } = conEntradas({
      'M01|calidad': { updatedAt: 111 }, 'M01|plg': { updatedAt: 222 },
    });
    expect(_marcaFichas('M01', ['calidad', 'plg'])).toEqual({
      kind: 'fichas',
      keys: ['M01|calidad', 'M01|plg'],
      stamps: { 'M01|calidad': 111, 'M01|plg': 222 },
    });
  });

  it('omite las fichas que no existen', () => {
    const { _marcaFichas } = conEntradas({ 'M01|calidad': { updatedAt: 111 } });
    const m = _marcaFichas('M01', ['calidad', 'nohay']);
    expect(m.keys).toEqual(['M01|calidad']);
  });

  it('devuelve null si no hay nada que sellar (postPayload lo trata como sin marca)', () => {
    const { _marcaFichas } = conEntradas({});
    expect(_marcaFichas('M01', ['calidad'])).toBe(null);
    expect(_marcaFichas('M01', [])).toBe(null);
    expect(_marcaFichas('M01', null)).toBe(null);
  });

  it('el kind que emite es uno que _reconcileMark sabe despachar', () => {
    const i = engine.indexOf('function _reconcileMark(');
    const cuerpo = engine.slice(i, engine.indexOf('\n}\n', i));
    expect(cuerpo).toContain('mark.kind === "fichas"');
    expect(cuerpo).toContain('mark.kind === "alg"');
  });
});

/* ── B · _reconcileFichas: el sello manda ────────────────────────────── */
describe('B · _reconcileFichas', () => {
  function caja(entradas) {
    const store = JSON.parse(JSON.stringify(entradas));
    const hist = [];
    const api = fnDelMotor(['_reconcileFichas'], {
      loadE: (m, f) => store[m + '|' + f] || null,
      saveE: (m, f, data, synced) => {
        const k = m + '|' + f;
        if (!store[k]) return false;
        store[k] = { ...store[k], data, synced };
        return true;
      },
      pushHist: (m, f, data) => { hist.push({ m, f, data }); },
    });
    return { ...api, store, hist };
  }
  const marca = (keys, stamps) => ({ kind: 'fichas', keys, stamps });

  it('marca la ficha cuando el sello COINCIDE', () => {
    const c = caja({ 'M01|calidad': { updatedAt: 111, synced: false, data: { a: 1 } } });
    expect(c._reconcileFichas(marca(['M01|calidad'], { 'M01|calidad': 111 }))).toBe(true);
    expect(c.store['M01|calidad'].synced).toBe(true);
    expect(c.hist).toHaveLength(1);
  });

  // ⚠⚠ LA PRUEBA QUE JUSTIFICA EL SELLO.
  it('🔴 NO marca si la ficha se EDITÓ después de encolarse', () => {
    // updatedAt en el almacén (222) ≠ el sellado al enviar (111): hay una edición que
    // NO ha viajado. Marcarla diría que está en Sheets, y sería mentira.
    const c = caja({ 'M01|calidad': { updatedAt: 222, synced: false, data: { a: 2 } } });
    expect(c._reconcileFichas(marca(['M01|calidad'], { 'M01|calidad': 111 }))).toBe(false);
    expect(c.store['M01|calidad'].synced, 'marcó una edición que no se envió').toBe(false);
    expect(c.hist, 'ni la metió en el Historial').toHaveLength(0);
  });

  it('sin sello no marca nada: una marca vieja o corrupta se abstiene', () => {
    const c = caja({ 'M01|calidad': { updatedAt: 111, synced: false, data: {} } });
    expect(c._reconcileFichas({ kind: 'fichas', keys: ['M01|calidad'] })).toBe(false);
    expect(c.store['M01|calidad'].synced).toBe(false);
  });

  it('no re-marca ni re-historia lo que ya estaba sincronizado', () => {
    const c = caja({ 'M01|calidad': { updatedAt: 111, synced: true, data: {} } });
    expect(c._reconcileFichas(marca(['M01|calidad'], { 'M01|calidad': 111 }))).toBe(false);
    expect(c.hist).toHaveLength(0);
  });

  it('la ficha de otro día no existe bajo la clave de hoy: se abstiene', () => {
    // `skey()` va acotada por today(); si la entrega cruza la medianoche, loadE devuelve
    // null. No marcar es lo correcto — y además la ficha de ayer no se ve en ningún sitio.
    const c = caja({});
    expect(c._reconcileFichas(marca(['M01|calidad'], { 'M01|calidad': 111 }))).toBe(false);
  });

  it('cada ficha se juzga por su cuenta: una edita, la otra no', () => {
    const c = caja({
      'M01|calidad': { updatedAt: 111, synced: false, data: {} },   // intacta
      'M01|plg': { updatedAt: 999, synced: false, data: {} },       // editada después
    });
    const r = c._reconcileFichas(marca(['M01|calidad', 'M01|plg'], { 'M01|calidad': 111, 'M01|plg': 222 }));
    expect(r).toBe(true);
    expect(c.store['M01|calidad'].synced).toBe(true);
    expect(c.store['M01|plg'].synced, 'la editada NO debe marcarse').toBe(false);
  });

  it('aguanta claves mal formadas sin romper', () => {
    const c = caja({ 'M01|calidad': { updatedAt: 111, synced: false, data: {} } });
    expect(() => c._reconcileFichas(marca(['basura', 'a|b|c', 'M01|calidad'], { 'M01|calidad': 111 }))).not.toThrow();
    expect(c.store['M01|calidad'].synced).toBe(true);
  });
});

/* ── C · _reconcileAlgas: retira, no marca ───────────────────────────── */
describe('C · _reconcileAlgas', () => {
  function caja(historial, entradaAlgas) {
    let hist = historial.slice();
    const log = [];
    const store = entradaAlgas ? { 'LAB|algas': { ...entradaAlgas } } : {};
    const api = fnDelMotor(['_reconcileAlgas'], {
      loadAlgHist: () => hist,
      saveAlgHist: (l) => { hist = l; },
      pushAlgLog: (d) => { log.push(d); },
      loadE: (m, f) => store[m + '|' + f] || null,
      saveE: (m, f, data, synced) => { const k = m + '|' + f; if (!store[k]) return false; store[k] = { ...store[k], synced }; return true; },
    });
    return { ...api, get hist() { return hist; }, log, store };
  }

  it('pasa a la Bitácora y RETIRA del historial lo entregado', () => {
    const c = caja([{ id: 'a1', data: { x: 1 } }, { id: 'a2', data: { x: 2 } }], { synced: false, data: {} });
    expect(c._reconcileAlgas({ kind: 'alg', keys: ['a1'], mod: 'LAB' })).toBe(true);
    expect(c.log).toEqual([{ x: 1 }]);
    expect(c.hist.map((h) => h.id), 'a2 no se envió: debe quedarse').toEqual(['a2']);
    expect(c.store['LAB|algas'].synced).toBe(true);
  });

  it('no toca nada si ninguno de los ids está (otro día u otra sesión)', () => {
    const c = caja([{ id: 'z9', data: { x: 9 } }], { synced: false, data: {} });
    expect(c._reconcileAlgas({ kind: 'alg', keys: ['a1'], mod: 'LAB' })).toBe(false);
    expect(c.log).toHaveLength(0);
    expect(c.hist.map((h) => h.id)).toEqual(['z9']);
    expect(c.store['LAB|algas'].synced, 'no puede marcar sin haber entregado nada').toBe(false);
  });

  it('entrega parcial: sólo se van los ids de la marca', () => {
    const c = caja([{ id: 'a1', data: {} }, { id: 'a2', data: {} }, { id: 'a3', data: {} }], null);
    c._reconcileAlgas({ kind: 'alg', keys: ['a1', 'a3'] });
    expect(c.hist.map((h) => h.id)).toEqual(['a2']);
  });
});

/* ── D · las rutas emiten la marca ───────────────────────────────────── */
describe('D · las cuatro rutas llevan su marca', () => {
  const iSync = engine.indexOf('async function syncAll(){');
  const syncAll = engine.slice(iSync, engine.indexOf('\n}\n\n', iSync));

  it('no queda ninguna ruta de syncAll con opts vacío', () => {
    expect(syncAll).not.toContain('const opts = {};');
  });

  it('Lab Algas manda los ids del historial y su módulo', () => {
    expect(syncAll).toContain('kind:"alg", keys: histSnapshot.map(h => h && h.id).filter(Boolean), mod: curMod');
  });

  it('Datos sella EXACTAMENTE las fichas pendientes que envió', () => {
    // Sellar otras dejaría marcada como sincronizada una ficha que no viajó.
    expect(syncAll).toContain('_marcaFichas(curMod, pendDatos)');
  });

  it('Parámetros y Desinfección sellan la suya', () => {
    expect(syncAll).toContain('_marcaFichas(curMod, ["params"])');
    expect(syncAll).toContain('_marcaFichas(curMod, ["desinfeccion"])');
  });

  it('syncOneFicha sella la ficha que le pidieron, no todas', () => {
    const i = engine.indexOf('async function syncOneFicha(fid){');
    const cuerpo = engine.slice(i, engine.indexOf('\n}\n', i));
    expect(cuerpo).toContain('_marcaFichas(curMod, [fid])');
  });

  it('las rutas SIN estado local pendiente siguen sin marca, a propósito', () => {
    // Marea, Blanco y el Registro reproductivo no dejan nada «pendiente» al tener éxito:
    // inventarles una marca sería código que no reconcilia nada.
    for (const fn of ['syncMareaGrid', 'syncBlanco']) {
      const i = engine.indexOf('async function ' + fn + '(');
      const cuerpo = engine.slice(i, engine.indexOf('\n}\n', i));
      expect(cuerpo, fn + ' no debería llevar marca').not.toContain('mark:');
    }
  });
});
