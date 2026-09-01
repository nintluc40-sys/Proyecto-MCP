/* ============================================================
   La cola de sincronización · qué se puede descartar y qué no

   Hay DOS sitios que descartan entradas previas de la cola cuando llega un envío con
   marca: `_purgeQueueMark` (tras un éxito directo) y el filtrado interno de
   `_enqueueSync` (al encolar uno nuevo). Los dos preguntaban lo mismo — ¿comparte
   ALGUNA llave? — y esa pregunta es demasiado laxa.

   ⚠⚠ EL DEFECTO QUE FIJA ESTE ARCHIVO. Con `keys.some(...)` basta UNA llave en común
   para tirar la entrada ENTERA. Medido: con la cola en `[ast:a,b,c,d,e]`, un envío
   suelto del registro `a` borraba el lote completo, y con él la entrega automática de
   b, c, d y e. No es pérdida de dato —siguen `synced:false` en local y el reenvío es
   idempotente por `reqId`—, pero se pierde justo lo que la cola existe para dar.

   Se volvió alcanzable el 2026-08-31, al darle marca a `syncOneAstFromList`: `ast` es
   el ÚNICO kind donde conviven una marca de UNA llave y un lote de VARIAS. Los demás
   (`bio` de una llave, `tras` en lotes disjuntos, `mic`/`cal`/`pat`/`mad` que mandan
   todo lo pendiente) no pueden solaparse a medias.

   La regla correcta: descartar una entrada sólo si lo que se acaba de enviar la cubre
   ENTERA. Lo que no queda cubierto se queda en la cola y se entrega — y es seguro
   porque el flush es FIFO (`for(const it of q)`) y `_enqueueSync` empuja al final: si
   una versión más nueva del mismo registro entra después, se escribe la última y gana.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

function fnDelMotor(nombres, extra = {}) {
  const code = nombres.map((n) => {
    const i = engine.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('no se halló ' + n + ' en engine.js');
    const j = engine.indexOf('\n}\n', i);
    return engine.slice(i, j + 2);
  }).join('\n');
  const ctx = { String, Number, Object, Array, JSON, Math, Date, Set, ...extra };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { ' + nombres.join(', ') + ' };').runInContext(ctx);
  return ctx.__api;
}

/** Caja con una cola en memoria. `escrituras` cuenta las veces que se persistió. */
function caja(inicial, fn = ['_purgeQueueMark']) {
  const est = { cola: inicial.slice(), escrituras: 0 };
  const api = fnDelMotor(fn, {
    _loadSyncQueue: () => est.cola.slice(),
    _saveSyncQueue: (x) => { est.cola = x; est.escrituras++; },
    SYNCQ_MAX: 50,
  });
  return { ...api, est };
}
const ids = (est) => est.cola.map((x) => x.id);
const ent = (id, kind, keys) => ({ id, mark: { kind, keys } });

/* ── A · _purgeQueueMark, tras un éxito DIRECTO ──────────────────────── */
describe('A · _purgeQueueMark', () => {
  it('descarta la entrada que el envío cubre ENTERA (su razón de existir)', () => {
    const c = caja([ent('q1', 'ast', ['a', 'b']), ent('q2', 'ast', ['z'])]);
    c._purgeQueueMark({ kind: 'ast', keys: ['a', 'b', 'c'] });
    expect(ids(c.est)).toEqual(['q2']);
  });

  it('NO descarta una entrada cubierta A MEDIAS', () => {
    // El defecto: el éxito de «a» se llevaba por delante a b, c, d y e.
    const c = caja([ent('q1', 'ast', ['a', 'b', 'c', 'd', 'e'])]);
    c._purgeQueueMark({ kind: 'ast', keys: ['a'] });
    expect(ids(c.est), 'el lote debe sobrevivir con b,c,d,e dentro').toEqual(['q1']);
  });

  it('no toca entradas de otro kind aunque compartan la llave', () => {
    const c = caja([ent('q1', 'mic', ['a'])]);
    c._purgeQueueMark({ kind: 'ast', keys: ['a'] });
    expect(ids(c.est)).toEqual(['q1']);
  });

  it('no toca entradas sin ninguna llave en común', () => {
    const c = caja([ent('q1', 'ast', ['z'])]);
    c._purgeQueueMark({ kind: 'ast', keys: ['a'] });
    expect(ids(c.est)).toEqual(['q1']);
  });

  it('no descarta una entrada SIN llaves', () => {
    // Con `every` sobre un array vacío la respuesta es `true`: sin la guarda de
    // longitud, una entrada sin llaves se borraría siempre y sin motivo.
    const c = caja([ent('q1', 'ast', [])]);
    c._purgeQueueMark({ kind: 'ast', keys: ['a'] });
    expect(ids(c.est)).toEqual(['q1']);
  });

  it('no escribe la cola si no descarta nada', () => {
    const c = caja([ent('q1', 'ast', ['z'])]);
    c._purgeQueueMark({ kind: 'ast', keys: ['a'] });
    expect(c.est.escrituras).toBe(0);
  });

  it('las guardas de entrada siguen: sin marca, sin kind o sin llaves no hace nada', () => {
    for (const m of [null, undefined, {}, { kind: 'ast' }, { kind: 'ast', keys: [] }]) {
      const c = caja([ent('q1', 'ast', ['a'])]);
      c._purgeQueueMark(m);
      expect(ids(c.est)).toEqual(['q1']);
      expect(c.est.escrituras).toBe(0);
    }
  });
});

/* ── B · _enqueueSync, al ENCOLAR uno nuevo ──────────────────────────── */
describe('B · el filtrado de _enqueueSync', () => {
  const payload = { rows: [{ a: 1 }] };

  it('encolar un registro suelto NO se lleva por delante un lote previo', () => {
    const c = caja([ent('q1', 'ast', ['a', 'b', 'c', 'd', 'e'])], ['_enqueueSync']);
    c._enqueueSync(payload, 'r1', 'u', { kind: 'ast', keys: ['a'] });
    expect(c.est.cola.length, 'el lote sigue, y el nuevo detrás').toBe(2);
    expect(c.est.cola[0].id).toBe('q1');
  });

  it('el nuevo va al FINAL: si repite un registro, se escribe el último y gana', () => {
    const c = caja([ent('q1', 'ast', ['a', 'b'])], ['_enqueueSync']);
    c._enqueueSync(payload, 'r1', 'u', { kind: 'ast', keys: ['a'] });
    expect(c.est.cola[c.est.cola.length - 1].mark).toEqual({ kind: 'ast', keys: ['a'] });
  });

  it('un envío que cubre ENTERO a uno previo sí lo descarta', () => {
    const c = caja([ent('q1', 'ast', ['a'])], ['_enqueueSync']);
    c._enqueueSync(payload, 'r1', 'u', { kind: 'ast', keys: ['a', 'b'] });
    expect(c.est.cola.length).toBe(1);
    expect(c.est.cola[0].id).toBeUndefined();   // sólo queda el recién encolado
  });

  it('sigue sin encolar dos veces la misma huella', () => {
    const c = caja([{ id: 'q1', reqId: 'r1', mark: null }], ['_enqueueSync']);
    c._enqueueSync(payload, 'r1', 'u', { kind: 'ast', keys: ['a'] });
    expect(c.est.cola.length).toBe(1);
  });

  it('sigue sin encolar un payload sin filas', () => {
    const c = caja([], ['_enqueueSync']);
    c._enqueueSync({ rows: [] }, 'r1', 'u', { kind: 'ast', keys: ['a'] });
    expect(c.est.cola.length).toBe(0);
  });
});

/* ── C · las dos copias de la regla dicen lo mismo ───────────────────── */
describe('C · la regla no puede divergir entre los dos sitios', () => {
  it('ninguno de los dos filtros usa ya `some`', () => {
    const laxos = engine.split('\n')
      .map((l, i) => ({ n: i + 1, t: l.trim() }))
      .filter((x) => /it\.mark\.keys\.some\(/.test(x.t));
    expect(laxos, 'quedan filtros laxos:\n' + laxos.map((x) => 'engine.js:' + x.n).join('\n')).toHaveLength(0);
  });

  it('los dos exigen cobertura TOTAL y guardan la longitud', () => {
    const estrictos = engine.split('\n').filter((l) => /it\.mark\.keys\.length && it\.mark\.keys\.every\(/.test(l));
    expect(estrictos).toHaveLength(2);
  });
});
