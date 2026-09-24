// @vitest-environment happy-dom
/* ============================================================
   LA COLA SE REINTENTA SOLA · el indicador la cuenta · nada sale sin avisar (punto 2a · corrección B, 2026-09-24)

   Hasta hoy la cola sólo se vaciaba a los 8 s de encolar, al pulsar Sincronizar, al volver la red o al abrir la app
   —el aviso prometía «se entregarán solos» y no era así—, el indicador decía «Todo sincronizado» con envíos
   esperando, y a las 24 h (o al llegar al tope de 50) lo que quedaba se borraba EN SILENCIO.
   Decisiones del usuario (las tres recomendadas):
   · reintento cada 60 s mientras quede algo, ESPACIÁNDOSE ×2 hasta 5 min si no avanza, de vuelta a 60 s en cuanto
     algo llega; sólo con la app a la vista y con red; SILENCIOSO con lo que espera;
   · el indicador cuenta la cola («N en cola») y nunca dice «Todo sincronizado» con algo en ella;
   · el plazo pasa a 7 días, y lo que caduca o sale por el tope SE AVISA (qué hoja, de cuándo).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['flushSyncQueue', '_enqueueSync', 'setSyncUI', '_syncUIResumen', 'syncQueueLen', 'COLA_REINTENTO_MS', 'SYNCQ_MAX'];
const H = {};
const COLA = 'larv4_syncqueue';
const avisos = [];
let posts = 0;
let respuesta = () => 'retry';

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
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}'
    + '\ntry{ H.pararReintento=function(){ clearTimeout(_colaTm); _colaTm=null; _colaEspera=COLA_REINTENTO_MS; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  /* ⚠ El monolito deja programada su limpieza de arranque —que VACÍA la cola— con requestIdleCallback (hasta 2 s REALES):
     bajo la carga de la suite completa caía en mitad de una prueba y sumaba un intento de más (visto dos veces, en dos
     pruebas distintas; sola, nunca). Aquí corre DURANTE el arranque, antes de la primera prueba. */
  const _ric = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (fn) => { fn(); return 1; };
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  globalThis.requestIdleCallback = _ric;
  H.setToast((m, t) => { avisos.push({ m: String(m), t: t || 'info' }); });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setVerify(async () => false);
  H.setPostOnce(async (body, url, info) => { posts++; const r = respuesta(body); if (r === 'rejected' && info) info.message = 'Hoja no permitida'; return r; });
  globalThis.fetch = async (url) => { throw new Error('fetch inesperado: ' + url); };
});

const visible = (v) => Object.defineProperty(document, 'visibilityState', { value: v ? 'visible' : 'hidden', configurable: true });
beforeEach(() => {
  avisos.length = 0;
  posts = 0;
  respuesta = () => 'retry';
  localStorage.removeItem(COLA);
  H.pararReintento();
  visible(true);
  vi.useFakeTimers();
});
afterEach(() => {
  H.pararReintento();
  vi.useRealTimers();
});

// Hojas que NO son de las selladas de Maduración: la cola las entrega sin preguntar por el sello.
const pl = (n) => ({ sheetName: 'Datos Larvicultura - M01', headers: ['A'], rows: [[n]] });
const cola = () => JSON.parse(localStorage.getItem(COLA) || '[]');
const lbl = () => document.getElementById('slbl').textContent;
const avanza = (ms) => vi.advanceTimersByTimeAsync(ms);

describe('Cola · se reintenta sola', () => {
  it('🔴 con algo en la cola lo intenta a los 60 s, y si no avanza se ESPACIA ×2 (hasta 5 min)', async () => {
    H._enqueueSync(pl(1), 'r1', '', null);
    await avanza(H.COLA_REINTENTO_MS - 1000);
    expect(posts, 'antes de 60 s, nada').toBe(0);
    await avanza(1000);
    expect(posts, 'a los 60 s, el primer intento').toBe(1);
    await avanza(60000);
    expect(posts, 'no avanzó: el siguiente ya no es a los 60 s').toBe(1);
    await avanza(60000);
    expect(posts, '…sino a los 120 s').toBe(2);
    await avanza(240000);
    expect(posts, '…y luego a los 240 s').toBe(3);
    await avanza(300000);
    expect(posts, 'el tope es 5 min, no 8').toBe(4);
    await avanza(300000);
    expect(posts).toBe(5);
  });

  it('🔴 en cuanto algo llega vuelve a 60 s, y con la cola vacía se para', async () => {
    H._enqueueSync(pl(1), 'r1', '', null);
    await avanza(60000);
    await avanza(120000);
    expect(posts).toBe(2);                   // dos intentos fallidos: el siguiente sería a los 240 s
    respuesta = () => 'ok';
    await avanza(240000);
    expect(posts).toBe(3);
    expect(cola()).toEqual([]);
    await avanza(3600000);
    expect(posts, 'con la cola vacía no se intenta nada').toBe(3);
    respuesta = () => 'retry';
    H._enqueueSync(pl(2), 'r2', '', null);
    await avanza(60000);
    expect(posts, 'lo nuevo espera 60 s, no los 240 del espaciado anterior').toBe(4);
  });

  it('🔴 si llega ALGO (aunque no todo), el siguiente intento vuelve a los 60 s', async () => {
    H._enqueueSync(pl(1), 'r1', '', null);
    H._enqueueSync(pl(2), 'r2', '', null);
    await avanza(60000);
    await avanza(120000);
    expect(posts).toBe(4);                   // dos vueltas sin avanzar (dos envíos cada una): el siguiente, a los 240 s
    respuesta = (b) => (b.reqId === 'r1' ? 'ok' : 'retry');
    await avanza(240000);
    expect(cola().map((i) => i.reqId)).toEqual(['r2']);
    const antes = posts;
    await avanza(60000);
    expect(posts, 'avanzó: a los 60 s otra vez, no a los 480').toBe(antes + 1);
  });

  it('🔴 lo que quedó de OTRA sesión (sin encolar ahora) también se reintenta tras el primer vaciado', async () => {
    localStorage.setItem(COLA, JSON.stringify([{ payload: pl(1), reqId: 'r1', url: '', ts: Date.now() - 60000, mark: null }]));
    await H.flushSyncQueue();                // el vaciado de al abrir la app
    expect(posts).toBe(1);
    await avanza(60000);
    expect(posts, 'queda algo: el reintento quedó en marcha').toBe(2);
  });

  it('🔴 con la app OCULTA no se intenta; al volver a ella, enseguida', async () => {
    H._enqueueSync(pl(1), 'r1', '', null);
    visible(false);
    await avanza(600000);
    expect(posts).toBe(0);
    visible(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await avanza(3000);
    expect(posts).toBe(1);
  });

  it('🔴 el reintento es SILENCIOSO con lo que espera; a mano, se avisa como siempre', async () => {
    respuesta = () => 'rejected';          // «Hoja no permitida»: de entorno, se queda esperando
    H._enqueueSync(pl(1), 'r1', '', null);
    await avanza(60000);
    expect(posts).toBe(1);
    expect(cola()).toHaveLength(1);
    expect(avisos.some((a) => a.m.includes('esperando en la cola')), 'sin aviso cada minuto').toBe(false);
    await H.flushSyncQueue();
    expect(avisos.some((a) => a.m.includes('esperando en la cola'))).toBe(true);
  });
});

describe('Cola · el indicador la cuenta', () => {
  it('🔴 con algo en la cola no dice «Todo sincronizado», lo pida quien lo pida', () => {
    H.setSyncUI('idle', 'Todo sincronizado');
    expect(lbl()).toBe('Todo sincronizado');
    H._enqueueSync(pl(1), 'r1', '', null);
    H._enqueueSync(pl(2), 'r2', '', null);
    expect(lbl(), 'encolar ya lo pone al día').toBe('2 en cola');
    H.setSyncUI('idle', 'Todo sincronizado');   // lo que hacen los envíos al terminar
    expect(lbl()).toBe('2 en cola');
    expect(document.getElementById('sdot').className).toBe('sdot pend');
  });

  it('🔴 con cosas pendientes en el dispositivo, suma lo que espera en la cola', () => {
    H._enqueueSync(pl(1), 'r1', '', null);
    H._syncUIResumen(3, 'registro(s)');
    expect(lbl()).toBe('3 registro(s) pendiente(s) · 1 en cola');
  });

  it('🔴 tras un vaciado que lo entrega todo, vuelve a «Todo sincronizado»', async () => {
    respuesta = () => 'ok';
    H._enqueueSync(pl(1), 'r1', '', null);
    expect(lbl()).toBe('1 en cola');
    await H.flushSyncQueue();
    H.setSyncUI('idle', 'Todo sincronizado');
    expect(lbl()).toBe('Todo sincronizado');
  });
});

describe('Cola · nada sale sin avisar', () => {
  it('🔴 al llegar al TOPE se descarta lo más viejo, pero se DICE qué', () => {
    for (let i = 1; i <= H.SYNCQ_MAX; i++) H._enqueueSync(pl(i), 'r' + i, '', null);
    expect(avisos.filter((a) => a.t === 'err')).toHaveLength(0);
    H._enqueueSync({ sheetName: 'Maduración Bitácora', headers: ['A'], rows: [['n']] }, 'rX', '', null);
    const q = cola();
    expect(q).toHaveLength(H.SYNCQ_MAX);
    expect(q[0].reqId).toBe('r2');
    const aviso = avisos.find((a) => a.t === 'err');
    expect(aviso && aviso.m).toContain('Datos Larvicultura - M01');
    expect(aviso.m).toContain('tope');
  });
});
