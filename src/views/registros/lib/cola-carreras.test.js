// @vitest-environment happy-dom
/* ============================================================
   COLA · CARRERAS ENTRE EL ENVÍO DIRECTO, EL VACIADO Y EL ANTIDOBLE CLIC (pauta A4, 2026-11-04)

   Los defectos: el antidoble clic de 30 s contestaba «ya está en la hoja» con otra versión esperando en la cola. Y el vaciado recorre la
   foto que tomó al empezar: mandaba lo que un envío más nuevo ya había retirado, y podía coincidir en el aire con un envío directo de los
   mismos registros. En todos, la hoja acaba con el dato viejo y el equipo diciendo «enviado».

   DECISIÓN DEL USUARIO (no re-preguntar): «las tres piezas». El antidoble clic olvida al encolar; el vaciado comprueba que cada envío sigue
   en la cola; y lo que comparte registros con algo en cola va siempre por la cola, aunque lo cubra entero.

   ⚠ Volver a un valor anterior YA ENTREGADO lo termina de resolver la pauta A5: aquí se prueba que se intenta, y este simulador escribe
   siempre; el GAS real, que recuerda el contenido 10 minutos, contestaría sin escribir.

   Motor REAL sobre el shell real; la red, simulada. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', '_loadSyncQueue', 'flushSyncQueue', 'postPayload', '_lastSyncFingerprint'];
const H = {};
const hoja = [];
const intentos = [];
const toasts = [];
/* `antes`: mientras la petición viaja, sin escribir aún. `tras`: ya escrito, y sin contestar todavía. Cada uno, una sola vez. */
const red = { respuesta: () => 'ok', antes: null, tras: null };
const _setTimeout = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _setTimeout; });
const mem = new Map();
const almacen = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
  key: (i) => Array.from(mem.keys())[i] ?? null, get length() { return mem.size; },
};

beforeAll(async () => {
  /* Sin señal, el motor reintenta a los 1,2 s y vacía la cola a los 8 s: sin esto, ese vaciado caería en medio de otra prueba. */
  globalThis.setTimeout = (f, ms, ...r) => (ms === 8000 ? 0 : _setTimeout(f, ms === 1200 ? 0 : ms, ...r));
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, almacen, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasUrl(() => URL);
  H.setPostOnce(async (body) => {
    intentos.push(JSON.stringify(body.rows));
    if (red.antes) { const f = red.antes; red.antes = null; await f(); }
    const r = red.respuesta(body);
    if (r === 'ok') hoja.push(JSON.parse(JSON.stringify(body.rows)));
    if (red.tras) { const f = red.tras; red.tras = null; await f(); }
    return r;
  });
});

const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec';
const P = (...rows) => ({ sheetName: 'Registro_Supervisión', headers: ['ID', 'v'], rows });
const OTRA = (...rows) => ({ sheetName: 'Otra hoja', headers: ['ID', 'v'], rows });
const MARK = (...keys) => ({ kind: 'ast', keys });
const enviar = async (payload, ...keys) => {
  const o = { mark: MARK(...keys) };
  const ok = await H.postPayload(payload, URL, o);
  return { ok, outcome: o.outcome };
};
const cola = () => H._loadSyncQueue().map((i) => i.reqId);
const enLaHoja = () => { const f = {}; hoja.flat().forEach(([k, v]) => { f[k] = v; }); return f; };
const seIntento = (fila) => intentos.includes(JSON.stringify([fila]));

beforeEach(() => {
  almacen.clear();
  H._lastSyncFingerprint.clear();
  hoja.length = 0;
  intentos.length = 0;
  toasts.length = 0;
  red.respuesta = () => 'ok';
  red.antes = null;
  red.tras = null;
});

describe('🔴 el antidoble clic no da por enviado lo que ya no es lo último', () => {
  it('🔴 con otra versión en cola: vuelve al valor de antes, lo escribe y retira lo que esperaba', async () => {
    await enviar(P(['a', 1]), 'a');
    red.respuesta = () => 'retry';
    expect((await enviar(P(['a', 2]), 'a')).outcome).toBe('queued');
    red.respuesta = () => 'ok';
    intentos.length = 0;
    const r = await enviar(P(['a', 1]), 'a');
    expect(r).toEqual({ ok: true, outcome: 'ok' });
    expect(intentos.length, 'se intenta de verdad').toBe(1);
    expect(cola()).toEqual([]);
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 1 });
    expect(seIntento(['a', 2]), 'lo que esperaba no llega a viajar').toBe(false);
  });

  it('🔴 con otra versión ya entregada por la cola: también se intenta (lo termina la pauta A5)', async () => {
    await enviar(P(['a', 1]), 'a');
    red.respuesta = () => 'retry';
    await enviar(P(['a', 2]), 'a');
    red.respuesta = () => 'ok';
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 2 });
    intentos.length = 0;
    await enviar(P(['a', 1]), 'a');
    expect(intentos.length).toBe(1);
    expect(enLaHoja()).toEqual({ a: 1 });
  });

  it('🔵 sin nada encolado sigue siendo un antidoble clic: el segundo no viaja', async () => {
    await enviar(P(['a', 1]), 'a');
    intentos.length = 0;
    expect(await enviar(P(['a', 1]), 'a')).toEqual({ ok: true, outcome: 'ok' });
    expect(intentos.length).toBe(0);
    expect(toasts.at(-1)).toContain('idéntico');
  });

  it('🔵 lo encolado de OTRA hoja no le quita la memoria a ésta', async () => {
    await enviar(P(['a', 1]), 'a');
    H._enqueueSync(OTRA(['z', 1]), 'req-otra', URL, MARK('z'));
    intentos.length = 0;
    await enviar(P(['a', 1]), 'a');
    expect(intentos.length).toBe(0);
  });
});

describe('🔴 el vaciado no manda lo que ya se retiró de la cola', () => {
  it('🔴 lo retirado mientras viajaba otro envío no sale, y lo que lo superó llega después', async () => {
    H._enqueueSync(P(['x', 0]), 'req-x', URL, MARK('x'));
    H._enqueueSync(P(['a', 1]), 'req-viejo', URL, MARK('a'));
    let dentro = null;
    red.antes = async () => { dentro = await enviar(P(['a', 99]), 'a'); };
    const r = await H.flushSyncQueue();
    expect(dentro).toEqual({ ok: false, outcome: 'queued' });
    expect(seIntento(['a', 1]), 'lo viejo no viaja').toBe(false);
    expect(r.sent, 'lo que no salió no cuenta como entregado').toBe(1);
    expect(cola().length).toBe(1);
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ x: 0, a: 99 });
    expect(cola()).toEqual([]);
  });

  it('🔴 también si lo retira un envío que entra directo en la cola', async () => {
    H._enqueueSync(P(['x', 0]), 'req-x', URL, MARK('x'));
    H._enqueueSync(P(['a', 1]), 'req-viejo', URL, MARK('a'));
    red.antes = async () => { H._enqueueSync(P(['a', 99]), 'req-nuevo', URL, MARK('a')); };
    await H.flushSyncQueue();
    expect(seIntento(['a', 1])).toBe(false);
    expect(cola()).toEqual(['req-nuevo']);
  });

  it('🔵 lo que sigue en la cola sale con normalidad', async () => {
    H._enqueueSync(P(['a', 1]), 'req-a', URL, MARK('a'));
    H._enqueueSync(P(['b', 2]), 'req-b', URL, MARK('b'));
    const r = await H.flushSyncQueue();
    expect(r.sent).toBe(2);
    expect(enLaHoja()).toEqual({ a: 1, b: 2 });
    expect(cola()).toEqual([]);
  });
});

describe('🔴 un envío directo y un vaciado no coinciden sobre lo mismo', () => {
  it('🔴 el vaciado arranca con un envío en el aire: lo que éste cubre ya no está en la cola', async () => {
    H._enqueueSync(P(['a', 1]), 'req-viejo', URL, MARK('a'));
    red.tras = async () => { await H.flushSyncQueue(); };
    const r = await enviar(P(['a', 99]), 'a');
    expect(r).toEqual({ ok: true, outcome: 'ok' });
    expect(seIntento(['a', 1])).toBe(false);
    expect(enLaHoja()).toEqual({ a: 99 });
  });

  it('🔴 lo viejo ya está en el aire: lo nuevo espera su turno y llega después', async () => {
    H._enqueueSync(P(['a', 1]), 'req-viejo', URL, MARK('a'));
    let dentro = null;
    red.antes = async () => { dentro = await enviar(P(['a', 99]), 'a'); };
    await H.flushSyncQueue();
    expect(dentro).toEqual({ ok: false, outcome: 'queued' });
    expect(hoja).toEqual([[['a', 1]]]);
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 1]], [['a', 99]]]);
  });

  it('🔴 lo cubre entero, sin ningún vaciado en marcha: sale enseguida y lo viejo no viaja', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-viejo', URL, MARK('a', 'b'));
    const r = await enviar(P(['a', 9], ['b', 9]), 'a', 'b');
    expect(r).toEqual({ ok: true, outcome: 'ok' });
    expect(hoja).toEqual([[['a', 9], ['b', 9]]]);
    expect(cola()).toEqual([]);
  });

  it('🔴 lo cubre entero y no sale: queda él, una sola vez, y lo viejo ya no', async () => {
    H._enqueueSync(P(['a', 1]), 'req-viejo', URL, MARK('a'));
    red.respuesta = () => 'retry';
    const r = await enviar(P(['a', 99]), 'a');
    expect(r).toEqual({ ok: false, outcome: 'queued' });
    expect(cola().length).toBe(1);
    expect(cola()).not.toContain('req-viejo');
  });

  it('🔵 lo que no comparte registros sale directo, aunque haya un vaciado en marcha', async () => {
    H._enqueueSync(P(['x', 0]), 'req-x', URL, MARK('x'));
    let dentro = null;
    red.antes = async () => { dentro = await enviar(P(['c', 3]), 'c'); };
    await H.flushSyncQueue();
    expect(dentro).toEqual({ ok: true, outcome: 'ok' });
    expect(enLaHoja()).toEqual({ c: 3, x: 0 });
  });
});
