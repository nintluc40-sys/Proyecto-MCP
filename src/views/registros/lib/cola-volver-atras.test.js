// @vitest-environment happy-dom
/* ============================================================
   ENVÍOS · VOLVER A UN VALOR ANTERIOR ANTES DE 10 MINUTOS (pauta A5, 2026-11-04)

   El defecto: el GAS recuerda 10 minutos cada reqId ya escrito, y el reqId era la huella del contenido. Con 28, 29 y otra vez 28, el tercero
   parecía un reintento del primero: contestaba «ok» sin escribir, y la hoja se quedaba en 29 con el equipo diciendo «28, enviado».

   DECISIÓN DEL USUARIO (no re-preguntar): «Solo en la app». Un contenido que vuelve después de otro distinto lleva otro reqId. Un reintento
   conserva el suyo, también si acaba en la cola: el GAS sigue sin escribir de más. En el GAS, un reqId por hoja reemplazaría esta protección
   por otra peor: un reintento tardío escribiría lo viejo sobre lo nuevo.

   Motor REAL sobre el shell real. La hoja, simulada: recuerda el reqId como el GAS (ver las guardas del final, que lo leen de Code.gs).
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const GAS = join(process.cwd(), 'GAS/Code.gs');
const EXPORTAR = ['_enqueueSync', '_loadSyncQueue', 'flushSyncQueue', 'postPayload', '_lastSyncFingerprint', '_reqIdDeEnvio', '_reqSesion',
  '_madPostConSello'];
const H = {};
const hoja = [];
const idem = new Set();
const peticiones = [];
const toasts = [];
/* `fallo`: lo que contesta la red. `sinRespuesta`: la hoja escribe y la respuesta no vuelve. */
const red = { fallo: null, sinRespuesta: 0 };
const _st = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _st; });

beforeAll(async () => {
  /* Sin señal, el motor reintenta a los 1,2 s y vacía la cola a los 8 s: sin esto, ese vaciado caería en medio de otra prueba. */
  globalThis.setTimeout = (f, ms, ...r) => (ms === 8000 ? 0 : _st(f, ms === 1200 ? 0 : ms, ...r));
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
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.limpiarGen=function(){ try{ _reqGen.clear(); }catch(_){} }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasUrl(() => URL);
  /* Como el GAS: un reqId ya escrito contesta ok SIN escribir. Con el mismo corte a 120 caracteres que Code.gs. */
  H.setPostOnce(async (body) => {
    peticiones.push(body);
    if (red.fallo) return red.fallo;
    const id = String(body.reqId || '').slice(0, 120);
    if (!(id && idem.has(id))) {
      hoja.push(JSON.parse(JSON.stringify(body.rows)));
      if (id) idem.add(id);
    }
    if (red.sinRespuesta > 0) { red.sinRespuesta -= 1; return 'retry'; }
    return 'ok';
  });
});

const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec';
const P = (...rows) => ({ sheetName: 'Registro_Supervisión', headers: ['ID', 'v'], rows });
const OTRA = (...rows) => ({ sheetName: 'Otra hoja', headers: ['ID', 'v'], rows });
const MK = (...keys) => ({ kind: 'ast', keys });
const enviar = async (v, payload = P, opts = {}) => {
  const o = { mark: MK('a'), ...opts };
  const ok = await H.postPayload(payload(['a', v]), URL, o);
  return { ok, outcome: o.outcome };
};
const enLaHoja = () => { const f = {}; hoja.flat().forEach(([k, v]) => { f[k] = v; }); return f; };
const ids = () => peticiones.map((b) => b.reqId);

beforeEach(() => {
  globalThis.localStorage.clear();
  H._lastSyncFingerprint.clear();
  H.limpiarGen();
  hoja.length = 0;
  idem.clear();
  peticiones.length = 0;
  toasts.length = 0;
  red.fallo = null;
  red.sinRespuesta = 0;
});

describe('🔴 volver a un valor anterior se escribe', () => {
  it('🔴 28, 29 y otra vez 28: en la hoja queda 28', async () => {
    await enviar(28);
    await enviar(29);
    const r = await enviar(28);
    expect(r).toEqual({ ok: true, outcome: 'ok' });
    expect(enLaHoja()).toEqual({ a: 28 });
    expect(hoja.length).toBe(3);
    expect(new Set(ids()).size).toBe(3);
  });

  it('🔴 también con un salt de identidad (As Técnico, Traslado)', async () => {
    const o = { dedupeSalt: 'id-1' };
    await enviar(28, P, o);
    await enviar(29, P, o);
    await enviar(28, P, o);
    expect(enLaHoja()).toEqual({ a: 28 });
  });

  it('🔴 con un salt largo: el GAS corta a 120 caracteres, y la diferencia va delante', async () => {
    const o = { dedupeSalt: 'x'.repeat(300) };
    await enviar(28, P, o);
    await enviar(29, P, o);
    await enviar(28, P, o);
    expect(enLaHoja()).toEqual({ a: 28 });
    expect(hoja.length).toBe(3);
  });

  it('🔴 lo que se quedó en la cola: al volver, llega lo último', async () => {
    red.fallo = 'retry';
    await enviar(28);
    await enviar(29);
    red.fallo = null;
    await enviar(28);
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 28 });
    expect(H._loadSyncQueue()).toEqual([]);
  });
});

describe('🔴 un reintento sigue sin escribir de más', () => {
  it('🔴 dentro del mismo envío: el mismo reqId', async () => {
    red.sinRespuesta = 1;
    const r = await enviar(28);
    expect(r).toEqual({ ok: true, outcome: 'ok' });
    expect(peticiones.length).toBe(2);
    expect(new Set(ids()).size).toBe(1);
    expect(hoja.length, 'llegó la primera vez: la segunda no escribe').toBe(1);
  });

  it('🔴 si acaba en la cola: el mismo reqId, y una sola escritura', async () => {
    red.sinRespuesta = 2;
    const r = await enviar(28);
    expect(r.outcome).toBe('queued');
    expect(H._loadSyncQueue()[0].reqId).toBe(ids()[0]);
    await H.flushSyncQueue();
    expect(new Set(ids()).size).toBe(1);
    expect(hoja.length).toBe(1);
  });

  it('🔴 por el camino de la cola, lo que no sale sigue «en cola»: no se da por enviado', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MK('a', 'b'));
    red.fallo = 'retry';
    const r = await enviar(99);
    expect(r).toEqual({ ok: false, outcome: 'queued' });
    expect(H._loadSyncQueue().length).toBe(2);
  });

  it('🔴 aunque entre medias se haya enviado otro valor: el reintento tardío no pisa lo nuevo', async () => {
    red.fallo = 'retry';
    await enviar(28);
    const enCola = H._loadSyncQueue()[0];
    red.fallo = null;
    await enviar(29);
    // Aquel 28 sí llegó a escribirse, aunque no volvió la respuesta; su reintento se presenta ahora con el reqId que tenía.
    idem.add(String(enCola.reqId).slice(0, 120));
    H._enqueueSync(enCola.payload, enCola.reqId, URL, null);
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 29 });
  });

  it('🔴 el mismo contenido seguido, ya pasado el antidoble clic: no reescribe', async () => {
    await enviar(28);
    H._lastSyncFingerprint.clear();
    await enviar(28);
    expect(peticiones.length).toBe(2);
    expect(new Set(ids()).size).toBe(1);
    expect(hoja.length).toBe(1);
  });

  it('🔵 el antidoble clic sigue: el segundo ni viaja', async () => {
    await enviar(28);
    await enviar(28);
    expect(peticiones.length).toBe(1);
  });
});

/* 2026-11-05 (auditoría de la A, usuario: «Igual que el resto») · Maduración, con el GAS sin confirmar, no envía: encola (_madPostConSello).
   Ese camino seguía con la huella sola. Cada guardado lleva la marca de SU entrada del historial, así que ninguno retira al anterior. */
describe('🔴 por la cola, sin el sello confirmado (Maduración)', () => {
  const MAD = (id) => ({ kind: 'madlog:desoves', keys: [id] });
  const encolar = async (v, id) => {
    const o = { mark: MAD(id), silencioso: true };
    const ok = await H._madPostConSello(P(['a', v]), null, o);
    return { ok, outcome: o.outcome };
  };

  it('🔴 28, 29 y otra vez 28 en la cola: llegan los tres, en orden, y queda 28', async () => {
    expect(await encolar(28, 'e1')).toEqual({ ok: false, outcome: 'queued' });
    await encolar(29, 'e2');
    await encolar(28, 'e3');
    expect(H._loadSyncQueue().length, 'el tercero no es el primero otra vez').toBe(3);
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 28 });
    expect(hoja.length).toBe(3);
  });

  it('🔴 y si el primero ya llegó: el tercero no se da por ya escrito', async () => {
    await encolar(28, 'e1');
    await H.flushSyncQueue();
    await encolar(29, 'e2');
    await H.flushSyncQueue();
    await encolar(28, 'e3');
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 28 });
    expect(hoja.length).toBe(3);
  });

  it('🔴 y si en medio el 29 salió directo: igual', async () => {
    await encolar(28, 'e1');
    await H.flushSyncQueue();
    await enviar(29);
    await encolar(28, 'e3');
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ a: 28 });
  });

  it('🔵 el mismo contenido dos veces seguidas: espera una sola vez, y llega una sola', async () => {
    await encolar(28, 'e1');
    await encolar(28, 'e2');
    const c = H._loadSyncQueue();
    expect(c.length).toBe(1);
    expect(c[0].mark.keys, 'las dos entradas se enteran de la entrega').toEqual(['e1', 'e2']);
    await H.flushSyncQueue();
    expect(hoja.length).toBe(1);
  });

  it('🔴 lleva la identidad de esta carga de la página, como los demás', async () => {
    await encolar(28, 'e1');
    expect(H._loadSyncQueue()[0].reqId.indexOf(H._reqSesion + '.')).toBe(0);
  });
});

describe('🔴 cada cosa con lo suyo', () => {
  it('🔴 cada hoja lleva su cuenta: lo de otra hoja en medio no cambia el reqId de ésta', async () => {
    await enviar(28);
    await enviar(99, OTRA);
    H._lastSyncFingerprint.clear();
    await enviar(28);
    expect(hoja.length, 'la de esta hoja no se reescribe').toBe(2);
    expect(ids()[0]).toBe(ids()[2]);
  });

  it('🔴 cada carga de la página, su identidad: tras recargar, un envío no choca con los de antes', () => {
    expect(H._reqIdDeEnvio('h', 'contenido').indexOf(H._reqSesion)).toBe(0);
    expect(H._reqSesion.length).toBeGreaterThan(8);
  });

  it('🔴 lo que no tiene huella no lleva reqId', () => {
    expect(H._reqIdDeEnvio('h', null)).toBeNull();
    expect(H._reqIdDeEnvio('h', '')).toBe('');
  });
});

describe('🔴 lo que esto da por cierto en el GAS', () => {
  const gas = readFileSync(GAS, 'utf8');
  const motor = readFileSync(ENGINE, 'utf8');

  it('🔴 recuerda el reqId, cortado a 120 caracteres: la diferencia tiene que ir delante', () => {
    expect(gas).toMatch(/String\(payload\.reqId\)\.slice\(0, 120\)/);
    expect(gas).toMatch(/get\("idem_" \+ reqId\)/);
  });

  it('🔴 volver a escribir no duplica: lo que podría añadir filas siempre dice su clave', () => {
    // En el GAS, Biomol, Microbiología, Calidad, Patología y Mareas sólo añaden filas si el envío no trae `replaceKey`.
    expect(gas.match(/if \(payload\.replaceKey && Array\.isArray\(payload\.keyCols\)\) result = replaceByKeyRows/g).length).toBe(5);
    [/sheetName: ?MIC_SHEET[^\n]*replaceKey: ?true/, /sheetName: ?CAL_SHEET[^\n]*replaceKey: ?true/, /sheetName: ?PAT_SHEET[^\n]*replaceKey: ?true/, /sheetName: ?MAREA_SHEET[^\n]*replaceKey: ?true/]
      .forEach((re) => expect(motor, String(re)).toMatch(re));
    expect(motor).toMatch(/Object\.assign\(base, \{ replaceKey: true, keyCols: \[BIO_GRID_HEADERS\.indexOf\("Sesión"\)\] \}\)/);
  });
});
