// @vitest-environment happy-dom
/* ============================================================
   COLA · LO CORREGIDO MIENTRAS EL ENVÍO ESPERA NO SE DA POR ENVIADO (pauta 1.3, 2026-11-03)

   El defecto: sin señal, un registro queda en la cola. Lo corrigen con 💾. Al volver la señal se entrega la versión vieja, y la marca
   —que sólo decía QUÉ registro, no QUÉ versión— lo daba por enviado: la corrección no viajaba, y a los 7 días salía del equipo.

   DECISIÓN DEL USUARIO (no re-preguntar): queda pendiente, y sale con el siguiente envío. Como las fichas de Larvicultura.

   Motor REAL sobre el shell real; la red, simulada. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', '_loadSyncQueue', 'flushSyncQueue', 'postPayload', '_lastSyncFingerprint', '_marcaSellar', '_madPostConSello', '_madTanquesEnviar', '_madZonasEnviar',
  '_astRaw', '_astSave', 'syncAllPendingAst', 'syncOneAstFromList', '_trasRaw', '_trasSave', '_trasUpsert', '_bioRaw', '_bioSave', '_micRaw', '_micSave', 'micSessionKey', '_calRaw', '_calSave', 'calSessionKey',
  '_patRaw', '_patSave', 'patSessionKey', 'loadMad', 'saveMadList', 'pushAlgHist', 'loadAlgHist', 'saveAlgHist', 'loadAlgLog', '_reconcileMark'];
const H = {};
const hoja = [];
const red = { respuesta: () => 'ok', gasAlDia: true };
const _setTimeout = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _setTimeout; });

beforeAll(async () => {
  /* Sin señal, el motor reintenta a los 1,2 s y vacía la cola a los 8 s: sin esto, ese vaciado caería en medio de otra prueba. */
  globalThis.setTimeout = (f, ms, ...r) => (ms === 8000 ? 0 : _setTimeout(f, ms === 1200 ? 0 : ms, ...r));
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
    + '\ntry{ H.setGasAlDia=function(f){_madIngGasAlDia=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.AST_MOD=AST_MOD; H.ALGHIST_PRE=ALGHIST_PRE; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasUrl(() => URL);
  H.setPostOnce(async (body) => {
    const r = red.respuesta(body);
    if (r === 'ok') hoja.push(JSON.parse(JSON.stringify(body)));
    return r;
  });
});

const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec';
const SIN_SENAL = () => 'retry';
const SENAL = () => 'ok';
const cola = () => H._loadSyncQueue();
const P = (...rows) => ({ sheetName: 'Registro_Supervisión', headers: ['ID', 'v'], rows });

beforeEach(() => {
  globalThis.localStorage.clear();
  H._lastSyncFingerprint.clear();
  hoja.length = 0;
  red.respuesta = SENAL;
});

/* Todas las clases de envío, por el mismo camino: { sus registros, cómo se leen y guardan, y cuál es su clave }. */
const REG = (id, data) => ({ id, ts: 1, synced: false, syncedAt: null, data });
const MIC = (v) => ({ fechaMuestreo: '2026-10-20', corrida: '600', departamento: 'D', formato: 'F', sid: 's1', valor: v });
const CLASES = [
  ['mic', () => H._micRaw(), (l) => H._micSave(l), (r) => H.micSessionKey(r.data), MIC],
  ['cal', () => H._calRaw(), (l) => H._calSave(l), (r) => H.calSessionKey(r.data), MIC],
  ['pat', () => H._patRaw(), (l) => H._patSave(l), (r) => H.patSessionKey(r.data), MIC],
  ['bio', () => H._bioRaw(), (l) => H._bioSave(l), (r) => r.data.fecha + '|' + r.data.sid, (v) => ({ fecha: '2026-10-20', sid: 's1', fila: 1, codigo: v })],
  ['ast', () => H._astRaw(), (l) => H._astSave(l), (r) => r.id, (v) => ({ fecha: '2026-10-20', valor: v })],
  ['tras', () => H._trasRaw(), (l) => H._trasSave(l), (r) => r.id, (v) => ({ fecha: '2026-10-20', valor: v })],
  ['mad:salas', () => H.loadMad('salas'), (l) => H.saveMadList('salas', l), (r) => r.id, (v) => ({ fecha: '2026-10-20', sala: 'Sala 1', valor: v })],
  ['mad:tanques', () => H.loadMad('tanques'), (l) => H.saveMadList('tanques', l), (r) => r.id, (v) => ({ fecha: '2026-10-20', sala: 'Sala 1', valor: v })],
  ['mad:zonas', () => H.loadMad('zonas'), (l) => H.saveMadList('zonas', l), (r) => r.id, (v) => ({ fecha: '2026-10-20', sala: 'Sala 1', valor: v })],
];

describe.each(CLASES)('🔴 %s', (kind, raw, save, keyOf, dato) => {
  const preparar = () => {
    save([REG('r1', dato('VIEJO'))]);
    return { kind, keys: raw().map(keyOf) };
  };
  const enCola = async (mark) => {
    red.respuesta = SIN_SENAL;
    const o = { mark };
    await H.postPayload(P(['r1', 'VIEJO']), URL, o);
    expect(o.outcome).toBe('queued');
    expect(cola().length).toBe(1);
    red.respuesta = SENAL;
  };
  const corregir = (v) => {
    const l = raw();
    l[0].data = dato(v);
    l[0].ts = 2;
    save(l);
  };

  it('sin corregir: al entregarse queda enviado', async () => {
    await enCola(preparar());
    await H.flushSyncQueue();
    expect(raw()[0].synced).toBe(true);
    expect(cola()).toEqual([]);
  });

  it('🔴 corregido con 💾: lo viejo se entrega, y la corrección sigue PENDIENTE y con su valor', async () => {
    await enCola(preparar());
    corregir('NUEVO');
    await H.flushSyncQueue();
    expect(hoja.length, 'lo viejo tiene que llegar igual').toBe(1);
    expect(cola()).toEqual([]);
    expect(raw()[0].synced, 'se dio por enviada una corrección que no viajó').toBe(false);
    expect(JSON.stringify(raw()[0].data)).toContain('NUEVO');
  });

  it('🔴 💾 sin cambiar nada no cuenta como corrección', async () => {
    await enCola(preparar());
    const l = raw();
    l[0].ts = 99;   // sólo cambia la hora del guardado
    save(l);
    await H.flushSyncQueue();
    expect(raw()[0].synced).toBe(true);
  });
});

describe('🔴 en un lote, cada registro por su lado', () => {
  it('🔴 sólo se queda pendiente el corregido', async () => {
    H._astSave([REG('a', { valor: 1 }), REG('b', { valor: 2 })]);
    red.respuesta = SIN_SENAL;
    await H.postPayload(P(['a', 1], ['b', 2]), URL, { mark: { kind: 'ast', keys: ['a', 'b'] } });
    const l = H._astRaw();
    l.find((r) => r.id === 'a').data = { valor: 99 };
    H._astSave(l);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    const de = (id) => H._astRaw().find((r) => r.id === id);
    expect(de('a').synced).toBe(false);
    expect(de('b').synced).toBe(true);
  });

  it('🔴 un registro nuevo en la misma sesión la deja pendiente: aún no viajó', async () => {
    H._micSave([REG('m1', MIC('X'))]);
    const key = H.micSessionKey(H._micRaw()[0].data);
    red.respuesta = SIN_SENAL;
    await H.postPayload(P(['m1', 'X']), URL, { mark: { kind: 'mic', keys: [key] } });
    H._micSave([...H._micRaw(), REG('m2', MIC('Y'))]);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(H._micRaw().every((r) => !r.synced)).toBe(true);
  });
});

describe('🔴 Lab. Algas: lo corregido se queda en su historial', () => {
  const enCola = async () => {
    H.pushAlgHist({ fecha: '2026-10-20', valor: 'VIEJO' });
    H.pushAlgHist({ fecha: '2026-10-20', valor: 'OTRO' });
    const keys = H.loadAlgHist().map((h) => h.id);
    red.respuesta = SIN_SENAL;
    await H.postPayload({ sheetName: 'Lab_Algas', headers: ['v'], rows: [['VIEJO'], ['OTRO']] }, URL, { mark: { kind: 'alg', keys } });
    red.respuesta = SENAL;
  };

  it('sin corregir: salen del historial y pasan a enviados', async () => {
    await enCola();
    await H.flushSyncQueue();
    expect(H.loadAlgHist()).toEqual([]);
    expect(H.loadAlgLog().length).toBe(2);
  });

  it('🔴 lo que ya estaba en cola al actualizar, sin sello, sale del historial como antes', async () => {
    H.pushAlgHist({ fecha: '2026-10-20', valor: 'DE ANTES' });
    const keys = H.loadAlgHist().map((h) => h.id);
    H._enqueueSync({ sheetName: 'Lab_Algas', headers: ['v'], rows: [['DE ANTES']] }, 'req-alg', URL, { kind: 'alg', keys });
    await H.flushSyncQueue();
    expect(H.loadAlgHist()).toEqual([]);
    expect(H.loadAlgLog().length).toBe(1);
  });

  it('🔴 corregido: se queda en el historial, y el otro sí sale', async () => {
    await enCola();
    const l = H.loadAlgHist();
    l[0].data = { fecha: '2026-10-20', valor: 'NUEVO' };
    H.saveAlgHist(l);
    await H.flushSyncQueue();
    expect(H.loadAlgHist().map((h) => h.data.valor)).toEqual(['NUEVO']);
    expect(H.loadAlgLog().map((d) => (d.data || d).valor)).toEqual(['OTRO']);
  });
});

describe('🔵 lo demás', () => {
  it('🔴 con los botones reales del As Técnico: la corrección sale con el siguiente envío', async () => {
    H.setMod(H.AST_MOD, 'ast');
    H._astSave([REG('A-1', { fecha: '2026-10-20', observaciones: 'VIEJO' })]);
    red.respuesta = SIN_SENAL;
    await H.syncAllPendingAst();
    const l = H._astRaw();
    l[0].data = { ...l[0].data, observaciones: 'CORREGIDO' };
    H._astSave(l);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(H._astRaw()[0].synced).toBe(false);
    await H.syncAllPendingAst();
    expect(JSON.stringify(hoja.at(-1).rows)).toContain('CORREGIDO');
    expect(H._astRaw()[0].synced).toBe(true);
  });

  it('🔴 Traslado: el viaje corregido en cola no se da por enviado', async () => {
    const l = H._trasRaw();
    H._trasUpsert(l, 'V-1', { fecha: '2026-10-20', viajeRev: 1 });
    H._trasSave(l);
    red.respuesta = SIN_SENAL;
    await H.postPayload({ sheetName: 'Registro_Traslado', headers: ['ID'], rows: [['V-1-v1']] }, URL, { mark: { kind: 'tras', keys: ['V-1'] } });
    const l2 = H._trasRaw();
    H._trasUpsert(l2, 'V-1', { fecha: '2026-10-20', viajeRev: 2 });
    H._trasSave(l2);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(H._trasRaw()[0].synced).toBe(false);
    expect(H._trasRaw()[0].data.viajeRev).toBe(2);
  });

  it('🔴 lo que ya estaba en cola al actualizar, sin sello, sigue con la regla de antes', async () => {
    H._astSave([REG('a', { valor: 1 })]);
    H._enqueueSync(P(['a', 1]), 'req-antes', URL, { kind: 'ast', keys: ['a'] });
    const l = H._astRaw();
    l[0].data = { valor: 2 };
    H._astSave(l);
    await H.flushSyncQueue();
    expect(H._astRaw()[0].synced).toBe(true);
  });

  it('🔴 el sello viaja en la cola: sobrevive a cerrar la app', async () => {
    H._astSave([REG('a', { valor: 1 })]);
    red.respuesta = SIN_SENAL;
    await H.postPayload(P(['a', 1]), URL, { mark: { kind: 'ast', keys: ['a'] } });
    expect(Object.keys(cola()[0].mark.sellos)).toEqual(['a']);
  });

  it('🔴 sella ANTES de esperar al GAS: lo corregido durante esa espera no es lo que viaja', async () => {
    H.saveMadList('tanques', [REG('t1', { fecha: '2026-10-20', sala: 'Sala 1', valor: 'VIEJO' })]);
    const opts = { mark: { kind: 'mad:tanques', keys: ['t1'] } };
    H.setGasAlDia(async () => {
      const l = H.loadMad('tanques');
      l[0].data = { ...l[0].data, valor: 'NUEVO' };
      H.saveMadList('tanques', l);
      return true;
    });
    red.respuesta = SIN_SENAL;
    await H._madTanquesEnviar({ sheetName: 'Maduración Tanques', headers: ['v'], rows: [['VIEJO']] }, opts);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(H.loadMad('tanques')[0].synced, 'el sello se tomó después de la corrección').toBe(false);
  });

  it('🔴 lo mismo en Zonas', async () => {
    H.saveMadList('zonas', [REG('z1', { fecha: '2026-10-20', sala: 'Sala 1', valor: 'VIEJO' })]);
    const opts = { mark: { kind: 'mad:zonas', keys: ['z1'] } };
    H.setGasAlDia(async () => {
      const l = H.loadMad('zonas');
      l[0].data = { ...l[0].data, valor: 'NUEVO' };
      H.saveMadList('zonas', l);
      return true;
    });
    red.respuesta = SIN_SENAL;
    await H._madZonasEnviar({ sheetName: 'Maduración Zonas', headers: ['v'], rows: [['VIEJO']] }, opts);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(H.loadMad('zonas')[0].synced).toBe(false);
  });

  it('🔴 con el GAS sin confirmar, el envío a la cola también va sellado', async () => {
    H.saveMadList('salas', [REG('s1', { fecha: '2026-10-20', sala: 'Sala 1', valor: 'VIEJO' })]);
    const opts = { mark: { kind: 'mad:salas', keys: ['s1'] } };
    await H._madPostConSello({ sheetName: 'Maduración Sala', headers: ['v'], rows: [['VIEJO']] }, null, opts);
    expect(cola()[0].mark.sellos).toBeTruthy();
    expect(Object.keys(cola()[0].mark.sellos)).toEqual(['s1']);
  });

  it('una clase sin registros locales no se rompe, ni las marcas que no se sellan', () => {
    ['fichas', 'madlog:desoves', 'score', 'auditoria', 'mntronda', 'mnttrabajo'].forEach((kind) => {
      const m = { kind, keys: ['x'] };
      H._marcaSellar(m);
      expect(m.sellos, kind).toBeUndefined();
    });
    H._marcaSellar(null);
    const sinNada = { kind: 'ast', keys: ['no-existe'] };
    H._marcaSellar(sinNada);
    expect(sinNada.sellos).toEqual({});
  });

  it('🔴 un sello ya puesto no se vuelve a tomar', () => {
    H._astSave([REG('a', { valor: 1 })]);
    const m = { kind: 'ast', keys: ['a'] };
    H._marcaSellar(m);
    const primero = m.sellos.a;
    const l = H._astRaw();
    l[0].data = { valor: 2 };
    H._astSave(l);
    H._marcaSellar(m);
    expect(m.sellos.a).toBe(primero);
  });
});
