// @vitest-environment happy-dom
/* ============================================================
   LA COLA DE SINCRONIZACIÓN · lo que pasa MIENTRAS se vacía (punto 2a · corrección A, 2026-09-24)

   `flushSyncQueue` tomaba una foto de la cola al empezar y, al terminar, escribía esa foto menos lo entregado.
   Con el GAS lento un vaciado dura minutos (medido el 09-24: ?p=ver 3–45 s, lecturas hasta 60 s), y todo lo que
   pasaba en la cola entre medias se deshacía:
   · lo que se guardaba y se encolaba mientras tanto se PERDÍA;
   · lo que un envío más nuevo del mismo registro había purgado RESUCITABA, y al reenviarse pisaba lo bueno;
   · la marca de un guardado idéntico que se sumaba mientras tanto se perdía, y su fila acababa «⚠ no llegó».
   Ahora se RELEE la cola al terminar y sólo se quita lo que ese vaciado resolvió (y lo caducado).
   Los GAS de estas pruebas los contesta la propia prueba, CUANDO ella quiere: así cabe algo «mientras tanto».
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['flushSyncQueue', '_enqueueSync', '_purgeQueueMark', 'madDesLogLeer', 'MAD_DES_LOG_KEY', 'SYNCQ_TTL'];
const H = {};
const COLA = 'larv4_syncqueue';
let posts = [];      // cada POST de la cola espera aquí a que la prueba lo conteste
let verifs = [];     // ídem para ?p=verify

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  /* ⚠ La limpieza de arranque del monolito VACÍA la cola por requestIdleCallback (hasta 2 s REALES): bajo carga caería en
     mitad de una prueba. Aquí corre DURANTE el arranque (ver cola-reintento.test.js, donde se vio). */
  const _ric = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (fn) => { fn(); return 1; };
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  globalThis.requestIdleCallback = _ric;
  H.setToast(() => {});
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => { throw new Error('fetch inesperado: ' + url); };
});

beforeEach(() => {
  posts = [];
  verifs = [];
  localStorage.removeItem(COLA);
  localStorage.removeItem(H.MAD_DES_LOG_KEY);
  H.setPostOnce((body, url, info) => new Promise((res) => posts.push({ body, info, res })));
  H.setVerify(() => new Promise((res) => verifs.push(res)));
});

// Una hoja que NO es de las selladas de Maduración: la cola la entrega sin preguntar por el sello.
const pl = (n) => ({ sheetName: 'Datos Larvicultura - M01', headers: ['A'], rows: [[n]] });
const envio = (n, extra) => ({ payload: pl(n), reqId: 'r' + n, url: '', ts: Date.now() - 60000, mark: null, ...(extra || {}) });
const cola = () => JSON.parse(localStorage.getItem(COLA) || '[]');
const pon = (l) => localStorage.setItem(COLA, JSON.stringify(l));
const esperaA = async (cond) => { for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 1)); expect(cond()).toBe(true); };
// El vaciado pregunta ?p=verify antes de cada POST: «no procesado» deja pasar al POST.
const contestaVerify = async (procesado) => { await esperaA(() => verifs.length > 0); verifs.shift()(procesado); };

describe('Cola · lo que pasa MIENTRAS se vacía se respeta', () => {
  it('🔴 lo que se ENCOLA mientras se vacía se conserva (antes se perdía)', async () => {
    pon([envio(1)]);
    const v = H.flushSyncQueue();
    await contestaVerify(false);
    await esperaA(() => posts.length === 1);
    H._enqueueSync(pl(2), 'r2', '', null);          // alguien guarda algo mientras tanto
    posts[0].res('ok');
    await v;
    expect(cola().map((i) => i.reqId)).toEqual(['r2']);
  });

  it('🔴 lo que se PURGA mientras se vacía no resucita (pisaría lo nuevo con lo viejo)', async () => {
    pon([envio(1, { mark: { kind: 'ast', keys: ['k1'] } })]);
    const v = H.flushSyncQueue();
    await contestaVerify(false);
    await esperaA(() => posts.length === 1);
    H._purgeQueueMark({ kind: 'ast', keys: ['k1'] });   // una versión más nueva del mismo registro llegó directa
    posts[0].res('retry');                                // y el intento del vaciado falló: antes lo conservaba
    await v;
    expect(cola()).toEqual([]);
  });

  it('🔴 un guardado IDÉNTICO que se suma mientras tanto también se da por llegado (su fila no acaba «⚠ no llegó»)', async () => {
    localStorage.setItem(H.MAD_DES_LOG_KEY, JSON.stringify([
      { id: 'e1', marca: true, ts: Date.now() - 3600e3, fecha: '2026-09-20', filas: 1, estado: 'cola', desoves: [] },
      { id: 'e2', marca: true, ts: Date.now() - 1800e3, fecha: '2026-09-20', filas: 1, estado: 'cola', desoves: [] },
    ]));
    pon([envio(1, { mark: { kind: 'madlog:desoves', keys: ['e1'] } })]);
    const v = H.flushSyncQueue();
    await contestaVerify(false);
    await esperaA(() => posts.length === 1);
    H._enqueueSync(pl(1), 'r1', '', { kind: 'madlog:desoves', keys: ['e2'] });   // mismo contenido: su marca se suma a la que espera
    posts[0].res('ok');
    await v;
    expect(H.madDesLogLeer().map((e) => [e.id, e.estado])).toEqual([['e1', 'ok'], ['e2', 'ok']]);
    expect(cola()).toEqual([]);
  });

  it('🔴 lo mismo si el GAS ya lo tenía (?p=verify): la marca sumada también llega', async () => {
    localStorage.setItem(H.MAD_DES_LOG_KEY, JSON.stringify([
      { id: 'e1', marca: true, ts: Date.now() - 3600e3, fecha: '2026-09-20', filas: 1, estado: 'cola', desoves: [] },
      { id: 'e2', marca: true, ts: Date.now() - 1800e3, fecha: '2026-09-20', filas: 1, estado: 'cola', desoves: [] },
    ]));
    pon([envio(1, { mark: { kind: 'madlog:desoves', keys: ['e1'] } })]);
    const v = H.flushSyncQueue();
    await esperaA(() => verifs.length === 1);
    H._enqueueSync(pl(1), 'r1', '', { kind: 'madlog:desoves', keys: ['e2'] });
    verifs.shift()(true);                                  // ya estaba escrito: no hace falta el POST
    await v;
    expect(posts).toHaveLength(0);
    expect(H.madDesLogLeer().map((e) => e.estado)).toEqual(['ok', 'ok']);
    expect(cola()).toEqual([]);
  });
});

describe('Cola · qué sale y qué se queda al terminar', () => {
  it('🔴 sale lo entregado y lo rechazado por sus DATOS; se queda lo transitorio', async () => {
    pon([envio(1), envio(2), envio(3)]);
    H.setVerify(async () => false);
    H.setPostOnce(async (body, url, info) => {
      if (body.reqId === 'r1') return 'ok';
      if (body.reqId === 'r2') return 'retry';
      info.message = 'Formato inválido';
      return 'rejected';
    });
    await H.flushSyncQueue();
    expect(cola().map((i) => i.reqId)).toEqual(['r2']);
  });

  it('🔴 dos envíos SIN huella se distinguen por su momento: sale sólo el entregado', async () => {
    pon([{ ...envio(1), reqId: '', ts: Date.now() - 5000 }, { ...envio(2), reqId: '', ts: Date.now() - 4000 }]);
    H.setVerify(async () => false);
    H.setPostOnce(async (body) => (body.rows[0][0] === 1 ? 'ok' : 'retry'));
    await H.flushSyncQueue();
    expect(cola().map((i) => i.payload.rows[0][0])).toEqual([2]);
  });

  it('🔴 lo caducado (24 h) sigue saliendo, también si se encoló antes y nadie lo tocó', async () => {
    pon([envio(1, { ts: Date.now() - H.SYNCQ_TTL - 1000 }), envio(2)]);
    H.setVerify(async () => false);
    H.setPostOnce(async () => 'retry');
    await H.flushSyncQueue();
    expect(cola().map((i) => i.reqId)).toEqual(['r2']);
  });
});
