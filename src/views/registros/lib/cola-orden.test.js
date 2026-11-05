// @vitest-environment happy-dom
/* ============================================================
   COLA · LO QUE SE PISA SALE EN ORDEN (pauta A1, 2026-11-04)

   El defecto: el vaciado salta lo que no puede salir y sigue con lo siguiente. Si eso siguiente corrige lo saltado, llega antes; y cuando
   lo viejo por fin sale, escribe encima el dato VIEJO, con la app diciendo «enviado». Por otro camino, un formulario corregido con señal
   salía directo aunque su versión vieja esperara en la cola: su marca es el ENVÍO, no la fila, y `_colaSolapa` no los veía relacionados.

   DECISIÓN DEL USUARIO (no re-preguntar): espera «solo lo que se pisa»; si las marcas no lo dicen (formularios y envíos sin marca), todo
   lo de esa hoja. Lo demás sigue saliendo: un envío trabado no frena al resto.

   Motor REAL sobre el shell real; la red, simulada. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', '_saveSyncQueue', '_loadSyncQueue', 'flushSyncQueue', 'postPayload', '_colaSolapa', '_colaSePisan', '_colaSinLlaves', '_lastSyncFingerprint', '_madHojaPideGasNuevo'];
const H = {};
const hoja = [];
const intentos = [];
const verificados = [];
const toasts = [];
const red = { respuesta: () => 'ok', motivo: '', sello: async () => true };
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
    + '\ntry{ H.setGasAlDia=function(f){_madIngGasAlDia=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, almacen, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async (id) => { verificados.push(id); return false; });
  H.setGasUrl(() => URL);
  H.setGasAlDia((u) => red.sello(u));
  H.setPostOnce(async (body, _url, info) => {
    intentos.push(body.reqId);
    const r = red.respuesta(body);
    if (r === 'ok') hoja.push(JSON.parse(JSON.stringify(body.rows)));
    if (r === 'rejected' && info) info.message = red.motivo;
    return r;
  });
});

const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec';
const URL2 = 'https://script.google.com/macros/s/AKfycbOTRO_otro_otro_otro_otro_otro_otro/exec';
const HOJA = 'Registro_Supervisión';
const P = (...rows) => ({ sheetName: HOJA, headers: ['ID', 'v'], rows });
const OTRA = (...rows) => ({ sheetName: 'Otra hoja', headers: ['ID', 'v'], rows });
const FORM = (...rows) => ({ sheetName: 'Maduración Movimientos', headers: ['ID', 'v'], rows });
const MARK = (...keys) => ({ kind: 'ast', keys });
const ENVIO = (id) => ({ kind: 'madlog:movimientos', keys: [id] });
const OK = () => 'ok';
const cola = () => H._loadSyncQueue().map((i) => i.reqId);
const enLaHoja = () => { const f = {}; hoja.flat().forEach(([k, v]) => { f[k] = v; }); return f; };
/* «ocupado» mientras la fila lleve este valor: el fallo pasajero de sólo ese envío. */
const fallaSi = (v) => (body) => (body.rows.some((r) => r[1] === v) ? 'retry' : 'ok');

beforeEach(() => {
  almacen.clear();
  H._lastSyncFingerprint.clear();
  hoja.length = 0;
  intentos.length = 0;
  verificados.length = 0;
  toasts.length = 0;
  red.respuesta = OK;
  red.motivo = '';
  red.sello = async () => true;
});

describe('🔴 el vaciado: lo que se pisa con lo que no salió, espera', () => {
  it('🔴 un lote falla un momento: la corrección de uno de sus registros no pasa delante, y al final gana', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MARK('a', 'b'));
    red.respuesta = fallaSi(1);
    const o = { mark: MARK('a') };
    const ok = await H.postPayload(P(['a', 99]), URL, o);
    expect(ok).toBe(false);
    expect(o.outcome, 'está a salvo, y no llegó todavía').toBe('queued');
    expect(hoja).toEqual([]);
    red.respuesta = OK;
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 1], ['b', 2]], [['a', 99]]]);
    expect(enLaHoja()).toEqual({ a: 99, b: 2 });
    expect(cola()).toEqual([]);
  });

  it('🔴 dos versiones de un formulario en cola: la nueva no pasa delante de la vieja', async () => {
    H._enqueueSync(FORM(['X', 5]), 'req-viejo', URL, ENVIO('e1'));
    H._enqueueSync(FORM(['X', 6]), 'req-nuevo', URL, ENVIO('e2'));
    red.respuesta = fallaSi(5);
    await H.flushSyncQueue();
    expect(hoja).toEqual([]);
    expect(cola()).toEqual(['req-viejo', 'req-nuevo']);
    red.respuesta = OK;
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ X: 6 });
  });

  it('🔴 dos envíos sin marca de la misma hoja: también en orden', async () => {
    H._enqueueSync(P(['a', 1]), 'req-v', URL, null);
    H._enqueueSync(P(['a', 2]), 'req-n', URL, null);
    red.respuesta = fallaSi(1);
    await H.flushSyncQueue();
    expect(hoja).toEqual([]);
    red.respuesta = OK;
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 2 });
  });

  it('🔴 lo que espera no gasta red: ni se verifica ni se intenta', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MARK('a', 'b'));
    H._enqueueSync(P(['a', 99]), 'req-a', URL, MARK('a'));
    red.respuesta = () => 'retry';
    await H.flushSyncQueue();
    expect(intentos).toEqual(['req-lote']);
    expect(verificados).toEqual(['req-lote']);
  });

  it('🔴 en cadena: lo que espera también retiene a lo que se pisa con ello', async () => {
    H._enqueueSync(P(['a', 1], ['b', 1]), 'req-1', URL, MARK('a', 'b'));
    H._enqueueSync(P(['b', 2], ['c', 2]), 'req-2', URL, MARK('b', 'c'));
    H._enqueueSync(P(['c', 3]), 'req-3', URL, MARK('c'));
    red.respuesta = fallaSi(1);
    await H.flushSyncQueue();
    expect(hoja).toEqual([]);
    expect(cola()).toEqual(['req-1', 'req-2', 'req-3']);
    red.respuesta = OK;
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('🔴 un rechazo de ENTORNO, que sigue en la cola, también retiene', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MARK('a', 'b'));
    H._enqueueSync(P(['a', 99]), 'req-a', URL, MARK('a'));
    red.respuesta = (body) => (body.rows.some((r) => r[1] === 1) ? 'rejected' : 'ok');
    red.motivo = 'Hoja no permitida';
    await H.flushSyncQueue();
    expect(hoja).toEqual([]);
    expect(cola()).toEqual(['req-lote', 'req-a']);
  });

  it('🔴 el sello sin confirmar de un GAS también retiene lo que iría a otro', async () => {
    expect(H._madHojaPideGasNuevo('Maduración Ingreso')).toBe(true);
    const S = (...rows) => ({ sheetName: 'Maduración Ingreso', headers: ['ID', 'v'], rows });
    H._enqueueSync(S(['a', 1], ['b', 2]), 'req-lote', URL, { kind: 'mad:x', keys: ['a', 'b'] });
    H._enqueueSync(S(['a', 99]), 'req-a', URL2, { kind: 'mad:x', keys: ['a'] });
    red.sello = async (u) => (u === URL ? null : true);
    await H.flushSyncQueue();
    expect(hoja).toEqual([]);
    expect(cola()).toEqual(['req-lote', 'req-a']);
  });

  it('🔴 con versiones: la posterior del mismo registro espera a la anterior', async () => {
    H._saveSyncQueue([
      { payload: OTRA(['r', 1]), reqId: 'req-v1', url: URL, ts: Date.now(), mark: { kind: 'score', keys: ['r@1'] } },
      { payload: OTRA(['r', 2]), reqId: 'req-v2', url: URL, ts: Date.now(), mark: { kind: 'score', keys: ['r@2'] } },
    ]);
    red.respuesta = fallaSi(1);
    await H.flushSyncQueue();
    expect(hoja).toEqual([]);
    expect(cola()).toEqual(['req-v1', 'req-v2']);
  });
});

describe('🔵 lo que no se pisa sigue saliendo: un envío trabado no frena al resto', () => {
  it('🔴 otros registros de la misma hoja', async () => {
    H._enqueueSync(P(['a', 1]), 'req-a', URL, MARK('a'));
    H._enqueueSync(P(['c', 3]), 'req-c', URL, MARK('c'));
    red.respuesta = fallaSi(1);
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['c', 3]]]);
    expect(cola()).toEqual(['req-a']);
  });

  it('🔴 lo de otra hoja, aunque no tenga marca', async () => {
    H._enqueueSync(P(['a', 1]), 'req-a', URL, null);
    H._enqueueSync(OTRA(['a', 2]), 'req-o', URL, null);
    red.respuesta = fallaSi(1);
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 2]]]);
    expect(cola()).toEqual(['req-a']);
  });

  it('🔴 otra clase de envío con la misma llave', async () => {
    H._enqueueSync(P(['a', 1]), 'req-a', URL, MARK('a'));
    H._enqueueSync(P(['a', 2]), 'req-t', URL, { kind: 'tras', keys: ['a'] });
    red.respuesta = fallaSi(1);
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 2]]]);
  });

  it('🔴 lo que la hoja rechazó por sus DATOS no retiene: ya no va a salir', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MARK('a', 'b'));
    H._enqueueSync(P(['a', 99]), 'req-a', URL, MARK('a'));
    red.respuesta = (body) => (body.rows.some((r) => r[1] === 1) ? 'rejected' : 'ok');
    red.motivo = 'Fecha no válida';
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 99]]]);
    expect(cola()).toEqual([]);
  });

  it('🔴 lo que no puede salir nunca, por una dirección no válida, no retiene: no puede pisar a nadie', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-mala', 'https://no-es-valida.example/exec', MARK('a', 'b'));
    H._enqueueSync(P(['a', 99]), 'req-a', URL, MARK('a'));
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 99]]]);
    expect(cola()).toEqual(['req-mala']);
  });

  it('lo que salió antes no retiene a nada', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MARK('a', 'b'));
    H._enqueueSync(P(['a', 99]), 'req-a', URL, MARK('a'));
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 99, b: 2 });
    expect(cola()).toEqual([]);
  });
});

describe('🔴 el envío directo: lo que espera en la cola va primero', () => {
  it('🔴 un formulario corregido con señal, con su versión vieja en cola, y SIN ningún fallo', async () => {
    H._enqueueSync(FORM(['X', 5]), 'req-viejo', URL, ENVIO('e1'));
    const o = { mark: ENVIO('e2') };
    const ok = await H.postPayload(FORM(['X', 6]), URL, o);
    expect(ok).toBe(true);
    expect(o.outcome).toBe('ok');
    expect(hoja).toEqual([[['X', 5]], [['X', 6]]]);
    expect(cola()).toEqual([]);
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ X: 6 });
  });

  it('🔴 un envío sin marca, con lo de su hoja en cola', async () => {
    H._enqueueSync(P(['a', 1]), 'req-v', URL, null);
    const ok = await H.postPayload(P(['a', 2]), URL, { sinAvisos: true });
    expect(ok).toBe(true);
    expect(hoja).toEqual([[['a', 1]], [['a', 2]]]);
  });

  it('🔴 sin marca, con un lote con marca de su hoja en cola', async () => {
    H._enqueueSync(P(['a', 1]), 'req-v', URL, MARK('a'));
    await H.postPayload(P(['a', 2]), URL, { sinAvisos: true });
    expect(hoja).toEqual([[['a', 1]], [['a', 2]]]);
  });

  it('🔴 si lo viejo no sale, el nuevo se queda detrás, a salvo', async () => {
    H._enqueueSync(FORM(['X', 5]), 'req-viejo', URL, ENVIO('e1'));
    red.respuesta = fallaSi(5);
    const o = { mark: ENVIO('e2') };
    expect(await H.postPayload(FORM(['X', 6]), URL, o)).toBe(false);
    expect(o.outcome).toBe('queued');
    expect(cola().length).toBe(2);
    expect(hoja).toEqual([]);
  });

  it('🔵 sin nada de su hoja en cola, sale directo', async () => {
    H._enqueueSync(OTRA(['a', 1]), 'req-o', URL, null);
    expect(await H.postPayload(FORM(['X', 6]), URL, { mark: ENVIO('e2') })).toBe(true);
    expect(hoja).toEqual([[['X', 6]]]);
    expect(cola()).toEqual(['req-o']);
  });

  it('🔵 un formulario de OTRA ficha en la misma hoja no lo retiene', async () => {
    H._enqueueSync(FORM(['X', 5]), 'req-o', URL, { kind: 'madlog:ingreso', keys: ['e1'] });
    expect(await H.postPayload(FORM(['X', 6]), URL, { mark: ENVIO('e2') })).toBe(true);
    expect(hoja).toEqual([[['X', 6]]]);
    expect(cola()).toEqual(['req-o']);
  });
});

describe('🔴 las reglas, una a una', () => {
  const IT = (payload, mark) => ({ payload, mark, reqId: 'r', url: URL, ts: 1 });

  it('`_colaSinLlaves`: sin marca, o el mismo formulario; no dos marcas con llaves', () => {
    expect(H._colaSinLlaves(null, MARK('a'))).toBe(true);
    expect(H._colaSinLlaves(MARK('a'), null)).toBe(true);
    expect(H._colaSinLlaves(MARK('a'), { kind: 'ast', keys: [] })).toBe(true);
    expect(H._colaSinLlaves(ENVIO('e1'), ENVIO('e2'))).toBe(true);
    expect(H._colaSinLlaves(ENVIO('e1'), { kind: 'madlog:ingreso', keys: ['e2'] })).toBe(false);
    expect(H._colaSinLlaves(MARK('a'), MARK('b'))).toBe(false);
  });

  it('`_colaSePisan`: la hoja manda, y luego las llaves', () => {
    expect(H._colaSePisan(IT(P(), MARK('a', 'b')), IT(P(), MARK('b')))).toBe(true);
    expect(H._colaSePisan(IT(P(), MARK('b')), IT(P(), MARK('a', 'b')))).toBe(true);
    expect(H._colaSePisan(IT(P(), MARK('a')), IT(P(), MARK('b')))).toBe(false);
    expect(H._colaSePisan(IT(P(), MARK('a')), IT(OTRA(), MARK('a')))).toBe(false);
    expect(H._colaSePisan(IT(P(), null), IT(OTRA(), null))).toBe(false);
    expect(H._colaSePisan(IT(P(), null), IT(P(), null))).toBe(true);
    expect(H._colaSePisan(null, IT(P(), null))).toBe(false);
    expect(H._colaSePisan(IT(P(), null), null)).toBe(false);
    expect(H._colaSePisan({ mark: null }, IT(P(), null))).toBe(false);
  });

  it('`_colaSolapa` con la hoja: lo que no dice qué toca, y lo demás como siempre', () => {
    H._enqueueSync(FORM(['X', 5]), 'req-f', URL, ENVIO('e1'));
    expect(H._colaSolapa(ENVIO('e2'), FORM().sheetName)).toBe(true);
    expect(H._colaSolapa(null, FORM().sheetName)).toBe(true);
    expect(H._colaSolapa(null, HOJA)).toBe(false);
    expect(H._colaSolapa(ENVIO('e2'))).toBe(false);
    expect(H._colaSolapa(MARK('a'), FORM().sheetName), 'otra clase de envío: la regla de siempre').toBe(false);
  });
});
