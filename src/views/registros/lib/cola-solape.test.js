// @vitest-environment happy-dom
/* ============================================================
   COLA · UNA CORRECCIÓN DIRECTA Y UN LOTE VIEJO QUE LA CONTIENE (pauta 1.2, 2026-11-03)

   El defecto: con [a,b] esperando en la cola, corregir `a` y enviarlo solo llegaba bien; pero _purgeQueueMark no retira un lote que
   no cubre entero, y al vaciarse la cola volvía a escribir el dato VIEJO de `a` en la hoja, con la app diciendo «enviado».
   El arreglo respeta el orden: ese envío entra en la cola detrás del lote, y la cola se vacía enseguida. Gana lo último.

   Motor REAL sobre el shell real; la red, simulada. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', '_loadSyncQueue', 'flushSyncQueue', 'postPayload', '_colaSolapa', 'syncOneAstFromList', 'syncAllPendingAst', '_astRaw', '_astSave', '_lastSyncFingerprint'];
const H = {};
const hoja = [];
const toasts = [];
const red = { respuesta: () => 'ok', motivo: '', antesDeEscribir: null };
const _setTimeout = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _setTimeout; });
/* Un almacenamiento propio: con `lleno`, guardar la COLA falla como falla el navegador sin espacio. */
let lleno = false;
const mem = new Map();
const almacen = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (lleno && k === 'larv4_syncqueue') { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
    mem.set(k, String(v));
  },
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
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.AST_MOD=AST_MOD; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, almacen, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasUrl(() => URL);
  H.setPostOnce(async (body, _url, info) => {
    if (red.antesDeEscribir) { const f = red.antesDeEscribir; red.antesDeEscribir = null; await f(); }
    const r = red.respuesta(body);
    if (r === 'ok') hoja.push(JSON.parse(JSON.stringify(body.rows)));
    if (r === 'rejected' && info) info.message = red.motivo;
    return r;
  });
});

const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec';
const HOJA = 'Registro_Supervisión';
const P = (...rows) => ({ sheetName: HOJA, headers: ['ID', 'v'], rows });
const MARK = (...keys) => ({ kind: 'ast', keys });
const SIN_SENAL = () => 'retry';
const SENAL = () => 'ok';
const cola = () => H._loadSyncQueue();
const lote = () => H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MARK('a', 'b'));
const corregirA = async (opts = {}) => {
  const o = { mark: MARK('a'), ...opts };
  const ok = await H.postPayload(P(['a', 99]), URL, o);
  return { ok, outcome: o.outcome, gasMessage: o.gasMessage };
};

beforeEach(() => {
  almacen.clear();
  lleno = false;
  H._lastSyncFingerprint.clear();   // el motor recuerda 30 s el último envío idéntico: no puede pasar de una prueba a otra
  hoja.length = 0;
  toasts.length = 0;
  red.respuesta = SENAL;
  red.motivo = '';
  red.antesDeEscribir = null;
});

describe('🔴 la corrección directa no la pisa el lote viejo', () => {
  it('🔴 llega primero el lote y luego la corrección: gana lo último', async () => {
    lote();
    const r = await corregirA();
    expect(hoja).toEqual([[['a', 1], ['b', 2]], [['a', 99]]]);
    expect(r).toMatchObject({ ok: true, outcome: 'ok' });
    expect(cola()).toEqual([]);
  });

  it('🔴 y vaciar después la cola no vuelve a escribir nada', async () => {
    lote();
    await corregirA();
    const n = hoja.length;
    await H.flushSyncQueue();
    expect(hoja.length).toBe(n);
  });

  it('🔴 sin señal: los dos esperan en orden, y al volver gana lo último', async () => {
    lote();
    red.respuesta = SIN_SENAL;
    const r = await corregirA();
    expect(r).toMatchObject({ ok: false, outcome: 'queued' });
    expect(cola().map((it) => it.mark.keys)).toEqual([['a', 'b'], ['a']]);
    expect(toasts.at(-1)).toContain('en cola');
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 1], ['b', 2]], [['a', 99]]]);
    expect(cola()).toEqual([]);
  });

  it('🔴 si la corrección no sale, sigue en la cola, aunque el lote haya llegado', async () => {
    lote();
    red.respuesta = (b) => (b.rows.length === 2 ? 'ok' : 'retry');
    const r = await corregirA();
    expect(r).toMatchObject({ ok: false, outcome: 'queued' });
    expect(hoja).toEqual([[['a', 1], ['b', 2]]]);
    expect(cola().map((it) => it.mark.keys)).toEqual([['a']]);
  });

  it('🔴 si la hoja la rechaza, se dice rechazada, con su motivo, y no «enviada»', async () => {
    lote();
    red.motivo = 'Fila no válida';
    red.respuesta = (b) => (b.rows.length === 2 ? 'ok' : 'rejected');
    const r = await corregirA();
    expect(r).toMatchObject({ ok: false, outcome: 'rejected', gasMessage: 'Fila no válida' });
    expect(hoja).toEqual([[['a', 1], ['b', 2]]]);
    expect(cola()).toEqual([]);
  });

  it('🔴 si la rechazada es OTRA de la cola, ésta sigue siendo un éxito', async () => {
    lote();
    red.motivo = 'Lote no válido';
    red.respuesta = (b) => (b.rows.length === 2 ? 'rejected' : 'ok');
    const r = await corregirA();
    expect(r).toMatchObject({ ok: true, outcome: 'ok' });
    expect(hoja).toEqual([[['a', 99]]]);
  });

  it('🔴 un rechazo anterior del mismo contenido no se confunde con el de ahora', async () => {
    // El mismo envío, en cola sin señal y rechazado en un vaciado normal, sin solape.
    red.respuesta = SIN_SENAL;
    await corregirA();
    red.motivo = 'De antes';
    red.respuesta = () => 'rejected';
    await H.flushSyncQueue();
    expect(cola()).toEqual([]);
    // Y ahora vuelve a salir, con el lote esperando y todo bien.
    lote();
    red.respuesta = SENAL;
    const r = await corregirA();
    expect(r).toMatchObject({ ok: true, outcome: 'ok' });
    expect(hoja.at(-1)).toEqual([['a', 99]]);
  });

  it('🔴 con un vaciado ya en marcha no se pierde: queda en la cola y llega después', async () => {
    lote();
    let enVuelo = null;
    red.antesDeEscribir = async () => { enVuelo = corregirA(); await enVuelo; };
    const vaciado = H.flushSyncQueue();
    await vaciado;
    expect((await enVuelo).outcome).toBe('queued');
    expect(hoja).toEqual([[['a', 1], ['b', 2]]]);
    expect(cola().map((it) => it.mark.keys)).toEqual([['a']]);
    await H.flushSyncQueue();
    expect(hoja).toEqual([[['a', 1], ['b', 2]], [['a', 99]]]);
  });

  it('sin espacio para encolar lo dice, en vez de darlo por a salvo', async () => {
    lote();
    lleno = true;
    const r = await corregirA();
    lleno = false;
    expect(r.ok).toBe(false);
    expect(r.outcome).toBe('error');
    expect(hoja, 'con el lote esperando no puede salir directo').toEqual([]);
  });
});

describe('🔵 lo que no se solapa sigue saliendo directo', () => {
  it('sin nada en la cola, directo', async () => {
    const r = await corregirA();
    expect(r).toMatchObject({ ok: true, outcome: 'ok' });
    expect(hoja).toEqual([[['a', 99]]]);
  });

  it('🔴 un lote con OTRAS llaves no lo retiene ni se lo lleva', async () => {
    H._enqueueSync(P(['c', 3]), 'req-c', URL, MARK('c', 'd'));
    await corregirA();
    expect(hoja).toEqual([[['a', 99]]]);
    expect(cola().map((it) => it.mark.keys)).toEqual([['c', 'd']]);
  });

  it('🔴 un envío que cubre el lote entero lo reemplaza: lo viejo no viaja', async () => {
    lote();
    const o = { mark: MARK('a', 'b') };
    const ok = await H.postPayload(P(['a', 99], ['b', 2]), URL, o);
    expect(ok).toBe(true);
    expect(hoja).toEqual([[['a', 99], ['b', 2]]]);
    expect(cola()).toEqual([]);
  });

  it('🔴 otra clase de envío con la misma llave no es solape', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-otra', URL, { kind: 'tras', keys: ['a', 'b'] });
    await corregirA();
    expect(hoja).toEqual([[['a', 99]]]);
    expect(cola().length).toBe(1);
  });

  it('🔴 `_colaSolapa`: alguna llave compartida, aunque cubra el lote entero (pauta A4)', () => {
    expect(H._colaSolapa(MARK('a'))).toBe(false);
    lote();
    expect(H._colaSolapa(MARK('a'))).toBe(true);
    expect(H._colaSolapa(MARK('b', 'z'))).toBe(true);
    expect(H._colaSolapa(MARK('a', 'b'))).toBe(true);
    expect(H._colaSolapa(MARK('a', 'b', 'c'))).toBe(true);
    expect(H._colaSolapa(MARK('z'))).toBe(false);
    expect(H._colaSolapa({ kind: 'tras', keys: ['a'] })).toBe(false);
    expect(H._colaSolapa(null)).toBe(false);
    expect(H._colaSolapa({ kind: 'ast', keys: [] })).toBe(false);
  });
});

describe('🔴 con el botón real del As Técnico', () => {
  const reg = (id, extra) => ({ id, ts: 1, synced: false, data: { fecha: '2026-10-20', ...extra } });
  const filasConId = (id) => hoja.flat().filter((f) => f.includes(id));

  it('🔴 «Enviar todos» sin señal, corregir uno y enviarlo solo: en la hoja queda lo corregido', async () => {
    H.setMod(H.AST_MOD, 'ast');
    H._astSave([reg('A-1', { observaciones: 'VIEJO' }), reg('A-2', { observaciones: 'OTRO' })]);
    red.respuesta = SIN_SENAL;
    await H.syncAllPendingAst();
    expect(cola().map((it) => it.mark.keys)).toEqual([['A-1', 'A-2']]);
    const l = H._astRaw();
    l.find((r) => r.id === 'A-1').data.observaciones = 'CORREGIDO';
    H._astSave(l);
    red.respuesta = SENAL;
    await H.syncOneAstFromList('A-1');
    const deA = filasConId('A-1');
    expect(deA.length).toBe(2);
    expect(deA.at(-1)).toContain('CORREGIDO');
    expect(cola()).toEqual([]);
    expect(H._astRaw().every((r) => r.synced)).toBe(true);
  });
});
