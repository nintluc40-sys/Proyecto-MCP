// @vitest-environment happy-dom
/* ============================================================
   ENVÍOS · LA HUELLA ES LA DE LO QUE VIAJA (pautas A2 y A15, 2026-11-04)

   El defecto (A2, reabre el 1.4): varias rutas arman el envío, ESPERAN (leer la hoja, el lote anterior, Salas antes que Zonas) y sólo
   entonces tomaban la huella. Lo corregido en esa espera entraba en la huella sin haber viajado y quedaba «enviado», sin aviso.
   A15: 💾 sin cambios dejaba la ficha pendiente, porque comparaba la hora; la entrega por la cola daba ✏️ falsos; y quien enviaba por la
   cola retenía su hoja todo el vaciado.
   Defecto nuevo: lo tecleado sin guardar mientras ☁️ espera se borraba sin aviso al repintar la grilla.

   DECISIONES DEL USUARIO (no re-preguntar): «Corregir todo» y «Bloquear la grilla». El vaciado espera 45 s como mucho.

   Motor REAL sobre el shell real; la red y la hoja, simuladas. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', '_loadSyncQueue', 'flushSyncQueue', 'postPayload', '_lastSyncFingerprint', 'loadMad', 'saveMadList',
  'syncMadTanquesGrid', 'syncMadSalasGrid', 'syncAll', 'syncAllPendingTras', '_trasRaw', '_trasSave', 'saveE', 'loadE', '_marcaFichas',
  '_marcarEnviado', '_marcaSellar', '_reconcileMark', '_astRaw', '_astSave', '_bioRaw', '_bioSave', 'renderMadTanques', 'renderMadSalas',
  'madTanquesSalaChange', 'MAD_MOD', '_madTqConfirmarRepetidas'];
const H = {};
const hoja = [];
const intentos = [];
const toasts = [];
const red = { respuesta: () => 'ok', antes: null };
const _st = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _st; });
/* Un almacén propio: con `lleno`, la cola no puede crecer. */
let lleno = false;
const mem = new Map();
const almacen = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    const s = String(v);
    if (lleno && k === 'larv4_syncqueue' && (!mem.has(k) || s.length > mem.get(k).length)) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
    mem.set(k, s);
  },
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
  key: (i) => Array.from(mem.keys())[i] ?? null, get length() { return mem.size; },
};

beforeAll(async () => {
  /* Sin señal, el motor reintenta a los 1,2 s y vacía la cola a los 8 s: sin esto, ese vaciado caería en medio de otra prueba. */
  globalThis.setTimeout = (f, ms, ...r) => (ms === 8000 ? 0 : _st(f, ms === 1200 ? 0 : ms, ...r));
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  globalThis.confirm = () => true;
  window.confirm = () => true;
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setGasAlDia=function(f){_madIngGasAlDia=f;}; }catch(_){}'
    + '\ntry{ H.setRepetidas=function(f){_madTqConfirmarRepetidas=f;}; }catch(_){}'
    + '\ntry{ H.setTras=function(b,l){buildTrasPayload=b;_trasLotes=l;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, almacen, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasAlDia(async () => true);
  H.setGasUrl(() => URL);
  H.setPostOnce(async (body) => {
    intentos.push(body.reqId);
    if (red.antes) { const f = red.antes; red.antes = null; await f(); }
    const r = red.respuesta(body);
    if (r === 'ok') hoja.push(JSON.parse(JSON.stringify(body.rows)));
    return r;
  });
});

const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec';
const FECHA = '2026-10-20';
const P = (...rows) => ({ sheetName: 'Registro_Supervisión', headers: ['ID', 'v'], rows });
const MK = (...keys) => ({ kind: 'ast', keys });
const REG = (id, data, extra = {}) => ({ id, ts: 1, synced: false, syncedAt: null, data, ...extra });
const RONDA = (mm) => REG('t1', { fecha: FECHA, sala: 'Sala 1', tanque: 1, hora: '08:00', parte: 1, machos_muertos: mm });
const corregirRonda = () => { const l = H.loadMad('tanques'); l[0].data = { ...l[0].data, machos_muertos: 999 }; H.saveMadList('tanques', l); };
const unMomento = () => new Promise((r) => _st(r, 3));
const avisoCorregido = () => toasts.some((t) => t.includes('✏️'));
const viajo = (v) => JSON.stringify(hoja).includes(String(v));
const cola = () => H._loadSyncQueue().map((i) => i.reqId);
const enLaHoja = () => { const f = {}; hoja.flat().forEach(([k, v]) => { f[k] = v; }); return f; };
const celdas = () => document.querySelectorAll('#fp-tanques [name$="_hembras_muertas"]');
const irATanques = () => {
  H.setMod(H.MAD_MOD, 'tanques');
  document.getElementById('fp-tanques').innerHTML = '';
  H.renderMadTanques();
  const s = document.getElementById('mad-tanques-sala');
  s.value = 'Sala 2';
  H.madTanquesSalaChange();
};

beforeEach(() => {
  almacen.clear();
  lleno = false;
  H._lastSyncFingerprint.clear();
  hoja.length = 0;
  intentos.length = 0;
  toasts.length = 0;
  red.respuesta = () => 'ok';
  red.antes = null;
  H.setRepetidas(H._madTqConfirmarRepetidas);
  H.setMod(H.MAD_MOD, 'tanques');
});
afterEach(() => { vi.useRealTimers(); });

describe('🔴 lo corregido durante la espera no queda «enviado» (A2)', () => {
  it('🔴 ☁️ Tanques: corregir y guardar mientras comprueba la hoja', async () => {
    H.saveMadList('tanques', [RONDA(1000)]);
    H.setRepetidas(async () => { corregirRonda(); return true; });
    await H.syncMadTanquesGrid();
    expect(viajo(1000), 'viaja lo de antes de la espera').toBe(true);
    const r = H.loadMad('tanques')[0];
    expect(r.data.machos_muertos).toBe(999);
    expect(r.synced, 'lo corregido no viajó').toBe(false);
    expect(avisoCorregido()).toBe(true);
  });

  it('🔴 🔄 global: lo mismo con Tanques', async () => {
    H.saveMadList('tanques', [RONDA(1000)]);
    H.setRepetidas(async () => { corregirRonda(); return true; });
    await H.syncAll();
    expect(viajo(1000)).toBe(true);
    expect(H.loadMad('tanques')[0].synced).toBe(false);
    expect(avisoCorregido()).toBe(true);
  });

  it('🔴 ☁️ Salas y luego Zonas: corregir una zona mientras viajan las salas', async () => {
    H.setMod(H.MAD_MOD, 'salas');
    H.saveMadList('salas', [REG('s1', { fecha: FECHA, sala: 'Sala 1' })]);
    H.saveMadList('zonas', [REG('z1', { fecha: FECHA, zona: 'Zona 1', tanque: 1, nota: 'vieja' })]);
    red.antes = async () => { const l = H.loadMad('zonas'); l[0].data = { ...l[0].data, nota: 'nueva' }; H.saveMadList('zonas', l); };
    await H.syncMadSalasGrid();
    expect(hoja.length, 'salió también la zona').toBe(2);
    expect(H.loadMad('salas')[0].synced).toBe(true);
    expect(H.loadMad('zonas')[0].synced).toBe(false);
    expect(avisoCorregido()).toBe(true);
  });

  it('🔴 Traslado con 2 lotes: corregir uno del segundo mientras viaja el primero', async () => {
    H.setTras(
      (lote) => ({ sheetName: 'Traslado prueba', headers: ['ID', 'v'], rows: lote.map((r) => [r.id, r.data.obs]) }),
      (p) => p.map((r) => [r]),
    );
    H._trasSave([REG('v1', { fecha: FECHA, obs: 'UNO' }), REG('v2', { fecha: FECHA, obs: 'DOS' })]);
    red.antes = async () => { const l = H._trasRaw(); l.find((r) => r.id === 'v2').data.obs = 'DOS CORREGIDO'; H._trasSave(l); };
    await H.syncAllPendingTras();
    expect(viajo('DOS CORREGIDO'), 'el lote se armó antes').toBe(false);
    const l = H._trasRaw();
    expect(l.find((r) => r.id === 'v1').synced).toBe(true);
    expect(l.find((r) => r.id === 'v2').synced).toBe(false);
    expect(avisoCorregido()).toBe(true);
  });

  it('🔴 si acaba en la cola: al entregarse, lo corregido tampoco se marca', async () => {
    H.saveMadList('tanques', [RONDA(1000)]);
    H.setRepetidas(async () => { corregirRonda(); return true; });
    red.respuesta = () => 'retry';
    await H.syncMadTanquesGrid();
    expect(cola().length).toBe(1);
    red.respuesta = () => 'ok';
    await H.flushSyncQueue();
    expect(viajo(1000)).toBe(true);
    expect(H.loadMad('tanques')[0].synced).toBe(false);
  });

  it('🔵 sin corregir nada: se marca y no hay aviso', async () => {
    H.saveMadList('tanques', [RONDA(1000)]);
    H.setRepetidas(async () => true);
    await H.syncMadTanquesGrid();
    expect(H.loadMad('tanques')[0].synced).toBe(true);
    expect(avisoCorregido()).toBe(false);
  });

  it('`_marcaSellar`: con una lista sella esa; sin ella, lo guardado; y no sella dos veces', () => {
    H._astSave([REG('a', { v: 2 })]);
    const conLista = { kind: 'ast', keys: ['a'] };
    H._marcaSellar(conLista, [REG('a', { v: 1 })]);
    const sinLista = { kind: 'ast', keys: ['a'] };
    H._marcaSellar(sinLista);
    expect(conLista.sellos.a).not.toBe(sinLista.sellos.a);
    const antes = conLista.sellos.a;
    H._marcaSellar(conLista);
    expect(conLista.sellos.a).toBe(antes);
  });
});

describe('🔴 💾 sin cambios no deja pendiente la ficha (A15)', () => {
  const DATOS = { fecha: FECHA, corrida: '600', v: 1 };
  const ficha = () => H.loadE(1, 'calidad');
  const enviar = async (durante) => {
    H.saveE(1, 'calidad', DATOS, false);
    const opts = { mark: H._marcaFichas(1, ['calidad']) };
    red.antes = durante;
    const ok = await H.postPayload(P(['a', 1]), URL, opts);
    if (ok) H._marcarEnviado(opts);
    return opts;
  };

  it('🔴 💾 sin cambios durante el envío: queda enviada, y sin aviso', async () => {
    await enviar(async () => { await unMomento(); H.saveE(1, 'calidad', { ...DATOS }, false); });
    expect(ficha().synced).toBe(true);
    expect(avisoCorregido()).toBe(false);
  });

  it('🔴 con un cambio de verdad: sigue pendiente, y con aviso', async () => {
    await enviar(async () => { await unMomento(); H.saveE(1, 'calidad', { ...DATOS, v: 2 }, false); });
    expect(ficha().synced).toBe(false);
    expect(avisoCorregido()).toBe(true);
  });

  it('🔴 por la cola: 💾 sin cambios también queda enviada', async () => {
    H.saveE(1, 'calidad', DATOS, false);
    const marca = H._marcaFichas(1, ['calidad']);
    await unMomento();
    H.saveE(1, 'calidad', { ...DATOS }, false);
    H._reconcileMark(JSON.parse(JSON.stringify(marca)));
    expect(ficha().synced).toBe(true);
  });

  it('🔴 la marca sin día, igual', async () => {
    H.saveE(1, 'calidad', DATOS, false);
    const m = H._marcaFichas(1, ['calidad']);
    const k = '1|calidad';
    const marca = { kind: 'fichas', keys: [k], stamps: { [k]: Object.values(m.stamps)[0] }, huellas: { [k]: Object.values(m.huellas)[0] } };
    await unMomento();
    H.saveE(1, 'calidad', { ...DATOS }, false);
    H._reconcileMark(marca);
    expect(ficha().synced).toBe(true);
  });

  it('🔴 una marca de antes, sin huella: por la hora, como hasta ahora', async () => {
    H.saveE(1, 'calidad', DATOS, false);
    const m = H._marcaFichas(1, ['calidad']);
    const vieja = { kind: 'fichas', keys: m.keys, stamps: m.stamps };
    await unMomento();
    H.saveE(1, 'calidad', { ...DATOS }, false);
    H._reconcileMark(vieja);
    expect(ficha().synced).toBe(false);
    H.saveE(1, 'calidad', { ...DATOS }, false);
    H._reconcileMark({ ...vieja, stamps: { [m.keys[0]]: ficha().updatedAt } });
    expect(ficha().synced).toBe(true);
  });

  it('🔴 con una marca de antes, ya entregada por la cola, tampoco se avisa: marcarla cambia su hora', async () => {
    H.saveE(1, 'calidad', DATOS, false);
    const k = '1|calidad';   // sin día: es la que, al marcarla, vuelve a guardar la ficha con otra hora
    const vieja = { kind: 'fichas', keys: [k], stamps: { [k]: ficha().updatedAt } };
    await unMomento();
    H._reconcileMark(JSON.parse(JSON.stringify(vieja)));
    expect(ficha().synced).toBe(true);
    await unMomento();
    H._marcarEnviado({ mark: vieja });
    expect(avisoCorregido()).toBe(false);
  });

  it('🔴 ya marcada por la cola no se avisa de nada', async () => {
    H.saveE(1, 'calidad', DATOS, false);
    const m = H._marcaFichas(1, ['calidad']);
    H._enqueueSync(P(['a', 0]), 'req-viejo', URL, JSON.parse(JSON.stringify(m)));
    const opts = { mark: m };
    await unMomento();
    const ok = await H.postPayload(P(['a', 1]), URL, opts);
    expect(ok).toBe(true);
    H._marcarEnviado(opts);
    expect(ficha().synced).toBe(true);
    expect(avisoCorregido()).toBe(false);
  });
});

describe('🔴 sin ✏️ falsos por el camino de la cola (A15)', () => {
  it('🔴 Traslado: llegó bien por la cola, aunque marcarlo le retoque los datos', async () => {
    H._trasSave([REG('v1', { fecha: FECHA, obs: 'A', _quitados: ['x'] }), REG('v2', { fecha: FECHA, obs: 'B' })]);
    H._enqueueSync(P(['v1', 'A'], ['v2', 'B']), 'req-lote', URL, { kind: 'tras', keys: ['v1', 'v2'] });
    const opts = { mark: { kind: 'tras', keys: ['v1'] } };
    const ok = await H.postPayload(P(['v1', 'A']), URL, opts);
    expect(ok).toBe(true);
    H._marcarEnviado(opts);
    expect(H._trasRaw().find((r) => r.id === 'v1').synced).toBe(true);
    expect(avisoCorregido()).toBe(false);
  });

  it('🔴 Traslado: si de verdad se corrigió, sigue avisando', async () => {
    H._trasSave([REG('v1', { fecha: FECHA, obs: 'A' })]);
    const opts = { mark: { kind: 'tras', keys: ['v1'] } };
    red.antes = async () => { const l = H._trasRaw(); l[0].data.obs = 'A2'; H._trasSave(l); };
    const ok = await H.postPayload(P(['v1', 'A']), URL, opts);
    expect(ok).toBe(true);
    H._marcarEnviado(opts);
    expect(H._trasRaw()[0].synced).toBe(false);
    expect(avisoCorregido()).toBe(true);
  });

  it('🔴 una clave con varios registros, y alguno ya enviado, no se da por corregida', async () => {
    const k = FECHA + '|s1';
    H._bioSave([REG('b1', { fecha: FECHA, sid: 's1', x: 1 }, { synced: true }), REG('b2', { fecha: FECHA, sid: 's1', x: 2 })]);
    const opts = { mark: { kind: 'bio', keys: [k] } };
    const ok = await H.postPayload(P(['b2', 2]), URL, opts);
    expect(ok).toBe(true);
    H._marcarEnviado(opts);
    expect(avisoCorregido()).toBe(false);
  });
});

describe('🔴 enviar por la cola no retiene la hoja todo el vaciado (A15)', () => {
  const trabar = () => { let soltar; red.antes = () => new Promise((r) => { soltar = r; }); return () => soltar(); };

  it('🔴 si tarda más de 45 s: dice «en cola», está a salvo y la hoja queda libre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MK('a', 'b'));
    const soltar = trabar();
    const o = { mark: MK('a') };
    let termino = false;
    const envio = H.postPayload(P(['a', 99]), URL, o).then((v) => { termino = true; return v; });
    await vi.advanceTimersByTimeAsync(44000);
    expect(termino, 'hasta el tope, espera').toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await envio).toBe(false);
    expect(o.outcome).toBe('queued');
    expect(cola().length).toBe(2);
    const otro = { mark: MK('z') };
    expect(await H.postPayload(P(['z', 1]), URL, otro), 'la hoja está libre').toBe(true);
    expect(otro.outcome).toBe('ok');
    vi.useRealTimers();
    soltar();
    await unMomento();
    await H.flushSyncQueue();
    expect(enLaHoja()).toEqual({ z: 1, a: 99, b: 2 });
    expect(cola()).toEqual([]);
  });

  it('🔴 si el vaciado acaba antes del tope, sale como siempre', async () => {
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MK('a', 'b'));
    const o = { mark: MK('a') };
    expect(await H.postPayload(P(['a', 99]), URL, o)).toBe(true);
    expect(o.outcome).toBe('ok');
  });

  it('🔴 sin sitio en la cola: también con tope, y sin pasar delante de lo que viaja', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    H._enqueueSync(P(['a', 1], ['b', 2]), 'req-lote', URL, MK('a', 'b'));
    const soltar = trabar();
    lleno = true;
    const o = { mark: MK('a') };
    const envio = H.postPayload(P(['a', 99]), URL, o);
    await vi.advanceTimersByTimeAsync(46000);
    expect(await envio).toBe(false);
    expect(o.outcome).toBe('error');
    lleno = false;
    expect(seIntentaLoNuevo()).toBe(false);
    vi.useRealTimers();
    soltar();
    await unMomento();
  });
  const seIntentaLoNuevo = () => JSON.stringify(hoja).includes('99');
});

describe('🔴 mientras ☁️ envía, la grilla no admite tecleo (lo tecleado se borraba sin aviso)', () => {
  it('🔴 Tanques: bloqueada durante el envío y libre al terminar', async () => {
    irATanques();
    celdas()[0].value = '5';
    const fp = document.getElementById('fp-tanques');
    let durante = null;
    H.setRepetidas(async () => { durante = { inert: fp.inert, opacidad: fp.style.opacity, punteros: fp.style.pointerEvents }; return true; });
    await H.syncMadTanquesGrid();
    expect(durante.inert).toBe(true);
    expect(durante.opacidad).not.toBe('');
    expect(durante.punteros).toBe('none');
    expect(fp.inert).toBe(false);
    expect(fp.style.opacity).toBe('');
    expect(fp.style.pointerEvents).toBe('');
  });

  it('🔴 Salas: bloqueada durante el envío y libre al terminar', async () => {
    H.setMod(H.MAD_MOD, 'salas');
    H.saveMadList('salas', [REG('s1', { fecha: FECHA, sala: 'Sala 1' })]);
    const fp = document.getElementById('fp-salas');
    let durante = null;
    red.antes = async () => { durante = fp.inert; };
    await H.syncMadSalasGrid();
    expect(durante).toBe(true);
    expect(fp.inert).toBe(false);
  });

  it('🔴 si el envío se rompe, la grilla no se queda bloqueada', async () => {
    irATanques();
    celdas()[0].value = '5';
    const fp = document.getElementById('fp-tanques');
    H.setRepetidas(async () => { throw new Error('roto'); });
    await expect(H.syncMadTanquesGrid()).rejects.toThrow('roto');
    expect(fp.inert).toBe(false);
    expect(fp.style.pointerEvents).toBe('');
  });

  it('🔴 🔄 global: con algo tecleado sin guardar, no repinta', async () => {
    H.saveMadList('tanques', [RONDA(1)]);
    H.setRepetidas(async () => true);
    irATanques();
    const c = celdas()[1];
    c.value = '7';
    c.dispatchEvent(new Event('input', { bubbles: true }));
    await H.syncAll();
    expect(H.loadMad('tanques')[0].synced).toBe(true);
    expect(celdas()[1].value).toBe('7');
  });

  it('🔴 🔄 global: sin nada tecleado, repinta como siempre', async () => {
    H.saveMadList('tanques', [RONDA(1)]);
    H.setRepetidas(async () => true);
    irATanques();
    const antes = celdas()[1];
    await H.syncAll();
    expect(celdas()[1]).not.toBe(antes);
  });

  it('🔴 🔄 global: en 🏠 Salas tampoco repinta por lo de las zonas si hay algo tecleado', async () => {
    H.setMod(H.MAD_MOD, 'salas');
    document.getElementById('fp-salas').innerHTML = '';
    H.renderMadSalas();
    H.saveMadList('zonas', [REG('z1', { fecha: FECHA, zona: 'Zona 1', tanque: 1 })]);
    const c = document.querySelector('#fp-salas [name="sg_0_temp_02"]');
    c.value = '28';
    c.dispatchEvent(new Event('input', { bubbles: true }));
    await H.syncAll();
    expect(document.querySelector('#fp-salas [name="sg_0_temp_02"]').value).toBe('28');
  });
});
