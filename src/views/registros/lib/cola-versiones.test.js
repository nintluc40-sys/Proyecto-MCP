// @vitest-environment happy-dom
/* ============================================================
   LA COLA Y LAS VERSIONES (2026-10-28, usuario: «Las 4 fichas con versión»)

   🎯 Score, 🧾 Auditoría y las dos fichas de 🔧 Mantenimiento marcan sus envíos con la VERSIÓN del registro («id@ts»), para
   que una entrega de la cola no dé por enviado uno corregido después. Pero la cola sólo retiraba lo que tuviera las claves
   EXACTAS: una versión vieja encolada sin señal seguía allí cuando la corregida salía directa, y al vaciarse la pisaba en la
   hoja —el GAS cambia las filas por su ID, sin merge— mientras el dispositivo la daba por enviada. Ahora una versión
   POSTERIOR del mismo registro cubre a las anteriores, al encolar y al salir bien una directa. Motor REAL sobre el shell
   real; la red y la hoja, simuladas (la hoja cambia la fila por su «ID», como upsertAstRows).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', '_purgeQueueMark', '_loadSyncQueue', 'flushSyncQueue', 'selTab', 'mntRondaCelda',
  'mntRondaEnviar', 'mntRondaAbrirEl', 'loadMntRondas'];
const H = {};
const hoja = new Map();      // ID → fila
const red = { modo: 'ok' };

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; }catch(_){}'
    + '\ntry{ H.olvidar=function(){ _mntRonda=null; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec');
  H.setPostOnce(async (body) => {
    if (red.modo !== 'ok') return red.modo;
    const id = body.headers.indexOf('ID');
    body.rows.forEach((r) => hoja.set(r[id], r.slice()));
    return 'ok';
  });
  H.setMod(16, 'mntronda');
});

beforeEach(() => {
  globalThis.localStorage.clear();
  hoja.clear();
  red.modo = 'ok';
  H.olvidar();
});

let _n = 0;
const encolar = (kind, keys) => H._enqueueSync({ sheetName: 'S', headers: ['ID'], rows: [['x']] }, 'req-' + (++_n), '', { kind, keys });
const enCola = () => H._loadSyncQueue().map((it) => it.mark.kind + ':' + it.mark.keys.join(','));

describe('la cola · una versión POSTERIOR del mismo registro cubre a las anteriores (las 4 fichas con versión)', () => {
  it.each(['score', 'auditoria', 'mntronda', 'mnttrabajo'])('%s: al ENCOLAR la nueva, la vieja sale de la cola', (kind) => {
    encolar(kind, ['R1@100']);
    encolar(kind, ['R1@200']);
    expect(enCola()).toEqual([kind + ':R1@200']);
  });

  it.each(['score', 'auditoria', 'mntronda', 'mnttrabajo'])('🔴 %s: si la nueva sale bien DIRECTA, la vieja sale de la cola', (kind) => {
    encolar(kind, ['R1@100']);
    H._purgeQueueMark({ kind, keys: ['R1@200'] });
    expect(enCola()).toEqual([]);
  });

  it('una versión MÁS NUEVA que espera no la retira una vieja; otro registro u otra ficha, tampoco', () => {
    encolar('score', ['R1@200']);
    encolar('score', ['R2@100']);
    encolar('auditoria', ['R3@100']);
    H._purgeQueueMark({ kind: 'score', keys: ['R1@100'] });
    H._purgeQueueMark({ kind: 'score', keys: ['R9@300'] });
    H._purgeQueueMark({ kind: 'score', keys: ['R3@300'] });
    expect(enCola()).toEqual(['score:R1@200', 'score:R2@100', 'auditoria:R3@100']);
  });

  it('sigue siendo ENTERO: un envío de dos registros no sale si la nueva versión cubre sólo uno', () => {
    encolar('mntronda', ['R1@100', 'R2@100']);
    H._purgeQueueMark({ kind: 'mntronda', keys: ['R1@200'] });
    expect(enCola()).toEqual(['mntronda:R1@100,R2@100']);
    H._purgeQueueMark({ kind: 'mntronda', keys: ['R1@200', 'R2@150'] });
    expect(enCola()).toEqual([]);
  });

  it('las demás fichas siguen comparando la clave EXACTA (su clave no es una versión)', () => {
    encolar('tras', ['T1@100']);
    encolar('ast', ['A1']);
    H._purgeQueueMark({ kind: 'tras', keys: ['T1@200'] });
    expect(enCola()).toEqual(['tras:T1@100', 'ast:A1']);
    H._purgeQueueMark({ kind: 'ast', keys: ['A1'] });
    expect(enCola()).toEqual(['tras:T1@100']);
  });
});

describe('🔴 el caso de la ronda: corregida y enviada directa, la vieja de la cola ya no la pisa en la hoja', () => {
  const celda = (q, v) => {
    const el = document.querySelector(`#fp-mntronda input[data-mq="${q}"][data-mk="horometro"]`);
    el.value = v;
    H.mntRondaCelda(el);
  };

  it('sin señal: 1 500 h a la cola; con señal, corregida a 1 050 directa; la cola se vacía y la hoja se queda en 1 050', async () => {
    H.selTab('mntronda');
    celda('BLW-01', '1500');
    red.modo = 'retry';
    await H.mntRondaEnviar();
    expect(H._loadSyncQueue()).toHaveLength(1);
    const r = H.loadMntRondas()[0];
    const btn = document.createElement('button');
    btn.setAttribute('data-mnt-id', r.id);
    H.mntRondaAbrirEl(btn);
    celda('BLW-01', '1050');
    red.modo = 'ok';
    await H.mntRondaEnviar();
    expect(H.loadMntRondas()[0].synced).toBe(true);
    expect(H._loadSyncQueue(), 'la versión vieja sale de la cola').toHaveLength(0);
    await H.flushSyncQueue();
    expect(hoja.get(r.id + '-BLW-01')[3]).toBe(1050);
  }, 30000);
});
