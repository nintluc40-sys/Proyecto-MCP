/* ============================================================
   H1 · la ruta que se quedó fuera: «sincronizar UN registro de AsT»

   H1 arregló 16 rutas para que dejaran de llamar error a un envío que en realidad
   quedó ENCOLADO. `syncOneAstFromList` —el botón de sincronizar un solo registro
   desde la lista— era la 17.ª y se quedó atrás. Hacía dos cosas mal, las dos
   silenciosas desde el camión:

     · con el envío encolado mostraba «No fue posible sincronizar», empujando al
       chequeador a reenviar a mano algo que ya estaba a salvo en la cola;
     · no pasaba `mark`, así que cuando la cola entregaba el dato nadie reconciliaba
       el estado local: el registro se quedaba «pendiente» para siempre.

   ⚠⚠ POR QUÉ NO LO CAZÓ LA PRUEBA QUE YA EXISTÍA. `h1-opts.test.js` fija que ninguna
   llamada a postPayload vaya SIN `opts` — y ésta sí pasaba `opts` (`{dedupeSalt: id}`).
   Nadie comprobaba que el `else` CONSULTARA el resultado. El bloque A de abajo cierra
   ese punto ciego a nivel de CLASE: ninguna ruta puede volver a tratar un envío
   fallido con el mensaje crudo en vez de `_syncNotOkUI`, que es quien sabe distinguir
   «encolado» de «error de verdad».
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** Extrae una función del motor y la corre en una caja con los stubs que pida. */
function fnDelMotor(nombres, extra = {}) {
  const code = nombres.map((n) => {
    const i = engine.indexOf('async function ' + n + '(') >= 0
      ? engine.indexOf('async function ' + n + '(')
      : engine.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('no se halló ' + n + ' en engine.js');
    const j = engine.indexOf('\n}\n', i);
    return engine.slice(i, j + 2);
  }).join('\n');
  const ctx = { String, Number, Object, Array, JSON, Math, Date, ...extra };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { ' + nombres.join(', ') + ' };').runInContext(ctx);
  return ctx.__api;
}

/* ── A · la regla de CLASE, no el caso ───────────────────────────────── */
describe('A · toda ruta que envía CONSULTA el resultado', () => {
  /* El invariante de verdad: una función que llama a postPayload no puede decidir qué
     enseñar sin mirar `outcome`. Da igual cómo lo mire —`_syncNotOkUI`, el clasificador
     `_syncAllBucket`, `_madReproNotOk` o el propio `.outcome`—; lo que no vale es
     tratar el `false` como error a secas, porque «encolado» también devuelve `false`.

     ⚠ Fijarse sólo en `setSyncUI("err", …)` no sirve: lo usan legítimamente la propia
     `_syncNotOkUI` y los RESÚMENES agregados de `syncAll` y `syncAllPendingTras`, que
     ya han clasificado antes. Se mide por función, no por línea. */

  /** Funciones del motor que contienen una llamada `await postPayload(`. */
  function rutasQueEnvian() {
    const L = engine.split('\n');
    const bordes = [];
    L.forEach((l, i) => {
      const m = l.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
      if (m) bordes.push({ i, name: m[1] });
    });
    const out = new Map();
    L.forEach((l, i) => {
      if (!/await postPayload\(/.test(l)) return;
      let c = null;
      for (const b of bordes) { if (b.i <= i) c = b; else break; }
      if (!c || out.has(c.name)) return;
      const fin = (bordes.find((b) => b.i > c.i) || { i: L.length }).i;
      out.set(c.name, L.slice(c.i, fin).join('\n'));
    });
    return out;
  }

  /* ✅ YA NO HAY EXCEPCIONES: TODAS las rutas que envían consultan el desenlace.
     La última era `recalcSurvivalForCorrida`, que pintaba `_recalcStatus[f]` como "err"
     con el envío ENCOLADO. Se corrigió el 2026-09-01 y se retiró de esta lista, que es
     justo lo que pedía la nota que había aquí: una anotación huérfana —para una función
     ya arreglada, o que ya no envía— es ruido que esconde el fallo siguiente.
     Su caso concreto vive ahora en `recalc-outcome.test.js`; esta lista sigue existiendo
     para que, si algún día hay que admitir otra excepción, tenga que ir NOMBRADA y no
     pueda colarse en silencio. */
  const EXCEPCIONES = [];

  const rutas = rutasQueEnvian();

  it('hay rutas que auditar (el fixture no se ha quedado vacío)', () => {
    expect(rutas.size).toBeGreaterThanOrEqual(18);
    expect(rutas.has('syncOneAstFromList')).toBe(true);
  });

  it('todas consultan el resultado, salvo las excepciones anotadas', () => {
    const ciegas = [...rutas.entries()]
      .filter(([n, cuerpo]) => !EXCEPCIONES.includes(n)
        && !/_syncNotOkUI|_syncAllBucket|_madReproNotOk|\.outcome/.test(cuerpo))
      .map(([n]) => n);
    expect(ciegas, 'rutas que tratan un envío encolado como error:\n' + ciegas.join('\n')).toHaveLength(0);
  });

  it('las excepciones anotadas siguen existiendo (si no, sobra la anotación)', () => {
    // Una excepción para una función que ya no existe es ruido que oculta el siguiente fallo.
    for (const e of EXCEPCIONES) expect(rutas.has(e), e + ' ya no envía: quítala de EXCEPCIONES').toBe(true);
  });
});

/* ── B · la ruta concreta: marca y UI veraz ──────────────────────────── */
describe('B · syncOneAstFromList', () => {
  function caja(outcome) {
    const visto = {};
    const ui = [], toasts = [], notOk = [];
    let guardado = null;
    const api = fnDelMotor(['syncOneAstFromList'], {
      gasUrl: () => 'https://script.google.com/macros/s/X/exec',
      isValidGasUrl: () => true,
      syncRateOk: () => true,
      _astRaw: () => [{ id: 'a1', synced: false }, { id: 'a2', synced: false }],
      _astSave: (l) => { guardado = l; },
      buildAstPayload: () => ({ sheetName: 'Registro_Supervisión', headers: [], rows: [] }),
      postPayload: async (p, u, o) => { Object.assign(visto, o); o.outcome = outcome; return outcome === 'ok'; },
      setSyncUI: (a, b) => ui.push([a, b]),
      toast: (...a) => toasts.push(a),
      _syncNotOkUI: (...a) => notOk.push(a),
      renderAst: () => {}, updateDots: () => {}, updateSyncUI: () => {}, buildGrid: () => {},
      setTimeout: () => {},
      curTab: 'ast',
    });
    return { api, visto, ui, toasts, notOk, guardado: () => guardado };
  }

  it('pasa una marca de reconciliación con el kind que _reconcileMark sabe despachar', async () => {
    const c = caja('ok');
    await c.api.syncOneAstFromList('a1');
    expect(c.visto.mark).toEqual({ kind: 'ast', keys: ['a1'] });
  });

  it('la marca lleva SÓLO el registro que se pidió, no toda la lista', async () => {
    // Marcar de más reconciliaría registros que nunca viajaron: mentir sobre el dato.
    const c = caja('ok');
    await c.api.syncOneAstFromList('a1');
    expect(c.visto.mark.keys).toEqual(['a1']);
  });

  it('ENCOLADO no se anuncia como fallo', async () => {
    const c = caja('queued');
    await c.api.syncOneAstFromList('a1');
    expect(c.notOk, 'debería delegar en _syncNotOkUI').toHaveLength(1);
    expect(c.notOk[0][0]).toBe('queued');
    const gritos = c.toasts.filter((t) => String(t[0]).includes('No fue posible sincronizar'));
    expect(gritos, 'el toast crudo de error no debe salir con el dato en cola').toHaveLength(0);
  });

  it('un rechazo de verdad sigue avisando, y con su motivo', async () => {
    const c = caja('rejected');
    await c.api.syncOneAstFromList('a1');
    expect(c.notOk).toHaveLength(1);
    expect(c.notOk[0][0]).toBe('rejected');
  });

  it('con envío OK marca el registro localmente, como antes', async () => {
    const c = caja('ok');
    await c.api.syncOneAstFromList('a1');
    const l = c.guardado();
    expect(l.find((r) => r.id === 'a1').synced).toBe(true);
    expect(l.find((r) => r.id === 'a2').synced).toBe(false);
  });

  it('ENCOLADO no marca nada como sincronizado en local', async () => {
    // El dato está en la cola, no en Sheets. Marcarlo aquí sería la mentira opuesta.
    const c = caja('queued');
    await c.api.syncOneAstFromList('a1');
    const l = c.guardado();
    if (l) expect(l.find((r) => r.id === 'a1').synced).toBe(false);
  });
});
