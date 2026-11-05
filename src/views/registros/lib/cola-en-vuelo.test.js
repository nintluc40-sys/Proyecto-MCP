// @vitest-environment happy-dom
/* ============================================================
   ENVÍO DIRECTO · LO CORREGIDO MIENTRAS SE ENVÍA NO SE DA POR ENVIADO (pauta 1.4, 2026-11-03)

   El defecto: se pulsa ☁️ con 1000; con mala señal la petición tarda, y mientras tanto se corrige a 999 con 💾. A la hoja llegaba 1000,
   y el equipo marcaba el 999 como enviado: el dato nuevo se quedaba sólo en la tablet, y nadie se enteraba.

   DECISIÓN DEL USUARIO (no re-preguntar): queda pendiente, y se avisa.

   Motor REAL sobre el shell real; la red, simulada, y el 💾 ocurre DURANTE el envío. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_loadSyncQueue', 'flushSyncQueue', 'postPayload', '_lastSyncFingerprint', '_marcarEnviado', '_marcaCorregida',
  'saveE', 'loadE', 'syncOneFicha', 'getStatus', 'loadHist', '_astRaw', '_astSave', 'syncAllPendingAst', 'syncOneAstFromList', '_trasRaw', '_trasSave', '_trasUpsert', 'syncAllPendingTras',
  'loadMad', 'saveMadList', 'syncMadSalasGrid', 'syncMadTanquesGrid', '_bioRaw', '_bioSave', '_micRaw', '_micSave', 'micSessionKey', '_calRaw', '_calSave', 'calSessionKey', '_patRaw', '_patSave', 'patSessionKey',
  'pushAlgHist', 'loadAlgHist', 'saveAlgHist', 'loadAlgLog', 'syncAll', '_marcaFichas'];
const H = {};
const hoja = [];
const toasts = [];
const red = { respuesta: () => 'ok', durante: null };
const _setTimeout = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _setTimeout; });
const fuente = readFileSync(ENGINE, 'utf8');

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
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.AST_MOD=AST_MOD; H.MAD_MOD=MAD_MOD; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', fuente + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasAlDia(async () => true);
  H.setGasUrl(() => URL);
  H.setPostOnce(async (body) => {
    const copia = JSON.parse(JSON.stringify(body));   // lo que viaja se decide ANTES del 💾
    if (red.durante) { const f = red.durante; red.durante = null; await f(); }
    const r = red.respuesta(body);
    if (r === 'ok') hoja.push(copia);
    return r;
  });
});

const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec';
const AVISO = 'sigue pendiente: vuélvelo a enviar';
const avisó = () => toasts.some((t) => t.includes(AVISO));
const REG = (id, data) => ({ id, ts: 1, synced: false, syncedAt: null, data });
const P = (...rows) => ({ sheetName: 'Registro_Supervisión', headers: ['ID', 'v'], rows });
/* El sello de una ficha es la hora del guardado, en milisegundos: dos 💾 en el mismo milisegundo no los da una persona, sí una prueba. */
const unMomento = () => new Promise((r) => _setTimeout(r, 5));

beforeEach(() => {
  globalThis.localStorage.clear();
  H._lastSyncFingerprint.clear();
  hoja.length = 0;
  toasts.length = 0;
  red.respuesta = () => 'ok';
  red.durante = null;
});

describe('🔴 las fichas de Larvicultura', () => {
  const ficha = (v) => ({ fecha: '2026-10-20', corrida: '600', po_0: v, tec: 'X' });

  it('🔴 lo corregido durante el envío queda pendiente, con su valor, y se avisa', async () => {
    H.setMod(1, 'poblacion');
    H.saveE(1, 'poblacion', ficha('1000'), false);
    red.durante = async () => { await unMomento(); H.saveE(1, 'poblacion', ficha('999'), false); };
    await H.syncOneFicha('poblacion');
    expect(JSON.stringify(hoja)).toContain('1000');
    expect(H.loadE(1, 'poblacion').data.po_0).toBe('999');
    expect(H.getStatus(1, 'poblacion'), 'se dio por enviado lo que no viajó').not.toBe('synced');
    expect(avisó()).toBe(true);
  });

  it('🔴 sin cambios: enviada, con su Historial, y sin aviso', async () => {
    H.setMod(1, 'poblacion');
    H.saveE(1, 'poblacion', ficha('1000'), false);
    await H.syncOneFicha('poblacion');
    expect(H.getStatus(1, 'poblacion')).toBe('synced');
    expect(H.loadE(1, 'poblacion').data.po_0).toBe('1000');
    expect(avisó()).toBe(false);
    expect(H.loadHist(1).length).toBeGreaterThan(0);
  });

  it('🔴 Desinfección también, y sin pasar por el Historial', async () => {
    H.setMod(1, 'desinfeccion');
    const d = (v) => ({ fecha: '2026-10-20', corrida: '600', tec: 'X', obs: v });
    H.saveE(1, 'desinfeccion', d('UNO'), false);
    const o = { mark: H._marcaFichas(1, ['desinfeccion']) };
    red.durante = async () => { await unMomento(); H.saveE(1, 'desinfeccion', d('DOS'), false); };
    await H.postPayload(P(['x']), URL, o);
    H._marcarEnviado(o);
    expect(H.getStatus(1, 'desinfeccion')).not.toBe('synced');
    expect(H.loadE(1, 'desinfeccion').data.obs).toBe('DOS');
    expect(avisó()).toBe(true);
  });

  it('🔴 una ficha de otro día se comprueba en su sitio', async () => {
    H.setMod(1, 'poblacion');
    H.saveE(1, 'poblacion', ficha('1000'), false);
    const o = { mark: H._marcaFichas(1, ['poblacion']) };
    expect(o.mark.keys[0].split('|').length).toBe(3);
    expect(H._marcaCorregida(o.mark)).toBe(false);
    await unMomento();
    H.saveE(1, 'poblacion', ficha('999'), false);
    expect(H._marcaCorregida(o.mark)).toBe(true);
  });
});

describe('🔴 As Técnico', () => {
  beforeEach(() => H.setMod(H.AST_MOD, 'ast'));
  const corrige = (id) => () => {
    const l = H._astRaw();
    l.find((r) => r.id === id).data.observaciones = 'CORREGIDO';
    H._astSave(l);
  };

  it('🔴 enviar uno: lo corregido durante el envío queda pendiente', async () => {
    H._astSave([REG('A-1', { fecha: '2026-10-20', observaciones: 'VIEJO' })]);
    red.durante = corrige('A-1');
    await H.syncOneAstFromList('A-1');
    expect(JSON.stringify(hoja)).toContain('VIEJO');
    expect(H._astRaw()[0].synced).toBe(false);
    expect(H._astRaw()[0].data.observaciones).toBe('CORREGIDO');
    expect(avisó()).toBe(true);
  });

  it('🔴 enviar todos: sólo el corregido queda pendiente', async () => {
    H._astSave([REG('A-1', { fecha: '2026-10-20', observaciones: 'VIEJO' }), REG('A-2', { fecha: '2026-10-20', observaciones: 'OTRO' })]);
    red.durante = corrige('A-1');
    await H.syncAllPendingAst();
    const de = (id) => H._astRaw().find((r) => r.id === id);
    expect(de('A-1').synced).toBe(false);
    expect(de('A-2').synced).toBe(true);
    expect(avisó()).toBe(true);
  });

  it('🔴 sin cambios: enviados, con fecha de envío, y sin aviso', async () => {
    H._astSave([REG('A-1', { fecha: '2026-10-20', observaciones: 'VIEJO' })]);
    await H.syncAllPendingAst();
    expect(H._astRaw()[0].synced).toBe(true);
    expect(H._astRaw()[0].syncedAt).toBeGreaterThan(0);
    expect(avisó()).toBe(false);
  });
});

describe('🔴 Traslado', () => {
  const viaje = (rev, quitados) => ({ fecha: '2026-10-20', corrida: '600', modulo: 'M01', camaronera: 'X', viajeRev: rev, _quitados: quitados });
  const guardar = (rev, quitados) => {
    const l = H._trasRaw();
    H._trasUpsert(l, 'V-1', viaje(rev, quitados));
    H._trasSave(l);
  };
  const v = () => H._trasRaw()[0];

  it('🔴 sin cambios: enviado, ya tiene filas, y lo quitado se olvida', async () => {
    guardar(1, ['-c3']);
    H._trasRaw();
    await H.postPayload(P(['V-1']), URL, (red.o = { mark: { kind: 'tras', keys: ['V-1'] } }));
    H._marcarEnviado(red.o);
    expect(v().synced).toBe(true);
    expect(v().everSynced).toBe(true);
    expect(v().data._quitados).toEqual([]);
    expect(avisó(), 'olvidar lo quitado no es una corrección').toBe(false);
  });

  it('🔴 corregido durante el envío: pendiente, ya tiene filas, y lo quitado se conserva', async () => {
    guardar(1, ['-c3']);
    red.durante = () => guardar(2, ['-c3', '-c4']);
    const o = { mark: { kind: 'tras', keys: ['V-1'] } };
    await H.postPayload(P(['V-1']), URL, o);
    H._marcarEnviado(o);
    expect(v().synced).toBe(false);
    expect(v().data.viajeRev).toBe(2);
    expect(v().everSynced, 'el viaje ya tiene filas en la hoja').toBe(true);
    expect(v().data._quitados, 'lo quitado después aún no se ha apagado').toEqual(['-c3', '-c4']);
    expect(avisó()).toBe(true);
  });

  it('🔴 por la cola, igual: ya tiene filas', async () => {
    guardar(1, []);
    red.respuesta = () => 'retry';
    await H.postPayload(P(['V-1']), URL, { mark: { kind: 'tras', keys: ['V-1'] } });
    expect(v().everSynced).toBeFalsy();
    red.respuesta = () => 'ok';
    await H.flushSyncQueue();
    expect(v().synced).toBe(true);
    expect(v().everSynced).toBe(true);
  });

  it('🔴 sin llegar, no se dice que ya tiene filas', async () => {
    guardar(1, ['-c3']);
    red.respuesta = () => 'retry';
    await H.postPayload(P(['V-1']), URL, { mark: { kind: 'tras', keys: ['V-1'] } });
    expect(v().everSynced).toBeFalsy();
    expect(v().data._quitados).toEqual(['-c3']);
  });
});

describe('🔴 las demás clases, por la función común', () => {
  const MIC = (v) => ({ fechaMuestreo: '2026-10-20', corrida: '600', departamento: 'D', formato: 'F', sid: 's1', valor: v });
  const CLASES = [
    ['mic', () => H._micRaw(), (l) => H._micSave(l), (r) => H.micSessionKey(r.data), MIC],
    ['cal', () => H._calRaw(), (l) => H._calSave(l), (r) => H.calSessionKey(r.data), MIC],
    ['pat', () => H._patRaw(), (l) => H._patSave(l), (r) => H.patSessionKey(r.data), MIC],
    ['bio', () => H._bioRaw(), (l) => H._bioSave(l), (r) => r.data.fecha + '|' + r.data.sid, (v) => ({ fecha: '2026-10-20', sid: 's1', fila: 1, codigo: v })],
    ['mad:salas', () => H.loadMad('salas'), (l) => H.saveMadList('salas', l), (r) => r.id, (v) => ({ fecha: '2026-10-20', sala: 'Sala 1', valor: v })],
    ['mad:tanques', () => H.loadMad('tanques'), (l) => H.saveMadList('tanques', l), (r) => r.id, (v) => ({ fecha: '2026-10-20', sala: 'Sala 1', valor: v })],
    ['mad:zonas', () => H.loadMad('zonas'), (l) => H.saveMadList('zonas', l), (r) => r.id, (v) => ({ fecha: '2026-10-20', sala: 'Sala 1', valor: v })],
  ];
  describe.each(CLASES)('%s', (kind, raw, save, keyOf, dato) => {
    it('🔴 corregido durante el envío: pendiente, y se avisa', async () => {
      save([REG('r1', dato('VIEJO'))]);
      const o = { mark: { kind, keys: raw().map(keyOf) } };
      red.durante = () => { const l = raw(); l[0].data = dato('NUEVO'); save(l); };
      expect(await H.postPayload(P(['r1']), URL, o)).toBe(true);
      H._marcarEnviado(o);
      expect(raw()[0].synced).toBe(false);
      expect(JSON.stringify(raw()[0].data)).toContain('NUEVO');
      expect(avisó()).toBe(true);
    });
    it('sin cambios: enviado, y sin aviso', async () => {
      save([REG('r1', dato('VIEJO'))]);
      const o = { mark: { kind, keys: raw().map(keyOf) } };
      await H.postPayload(P(['r1']), URL, o);
      H._marcarEnviado(o);
      expect(raw()[0].synced).toBe(true);
      expect(avisó()).toBe(false);
      expect(raw()[0].everSynced, 'eso es sólo de Traslado').toBeUndefined();
      expect(raw()[0].data._quitados).toBeUndefined();
    });
    it('🔴 borrado durante el envío: no hay nada que avisar', async () => {
      save([REG('r1', dato('VIEJO'))]);
      const o = { mark: { kind, keys: raw().map(keyOf) } };
      red.durante = () => save([]);
      await H.postPayload(P(['r1']), URL, o);
      H._marcarEnviado(o);
      expect(raw()).toEqual([]);
      expect(avisó()).toBe(false);
    });
  });

  it('🔴 Lab. Algas: lo ya retirado del historial no se da por corregido', async () => {
    H.pushAlgHist({ fecha: '2026-10-20', valor: 'A' });
    const o = { mark: { kind: 'alg', keys: H.loadAlgHist().map((h) => h.id) } };
    await H.postPayload({ sheetName: 'Lab_Algas', headers: ['v'], rows: [['A']] }, URL, o);
    H._marcarEnviado(o);
    expect(H.loadAlgHist()).toEqual([]);
    H._marcarEnviado(o);
    expect(avisó()).toBe(false);
  });

  it('🔴 Lab. Algas: lo corregido se queda en el historial, y se avisa', async () => {
    H.pushAlgHist({ fecha: '2026-10-20', valor: 'VIEJO' });
    H.pushAlgHist({ fecha: '2026-10-20', valor: 'OTRO' });
    const o = { mark: { kind: 'alg', keys: H.loadAlgHist().map((h) => h.id) } };
    red.durante = () => { const l = H.loadAlgHist(); l[0].data = { fecha: '2026-10-20', valor: 'NUEVO' }; H.saveAlgHist(l); };
    await H.postPayload({ sheetName: 'Lab_Algas', headers: ['v'], rows: [['VIEJO'], ['OTRO']] }, URL, o);
    H._marcarEnviado(o);
    expect(H.loadAlgHist().map((h) => h.data.valor)).toEqual(['NUEVO']);
    expect(H.loadAlgLog().length).toBe(1);
    expect(avisó()).toBe(true);
  });

  it('🔴 un envío sin marca no se rompe ni marca nada', () => {
    expect(H._marcarEnviado({})).toBe(false);
    expect(H._marcarEnviado(null)).toBe(false);
    expect(avisó()).toBe(false);
  });
});

/* Sin esto, una ficha nueva podría volver a marcar por su cuenta sin que ninguna prueba se enterara. */
describe('🔴 nadie marca «enviado» por su cuenta al terminar un envío', () => {
  const lineas = fuente.split('\n').map((t, i) => ({ n: i + 1, t }));
  const funcionDe = (n) => {
    for (let i = n - 1; i >= 0; i--) {
      const m = lineas[i].t.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
      if (m) return m[1];
    }
    return '';
  };

  it('🔴 sólo marcan quienes comparan la versión', () => {
    const marcan = lineas.filter((l) => /\.synced\s*=\s*true/.test(l.t)).map((l) => funcionDe(l.n));
    /* Score, Auditoría y Mantenimiento buscan el registro por id Y versión (x.ts === rec.ts): lo corregido no casa. */
    const fuera = [...new Set(marcan)].filter((f) => !['_reconcileFichas', '_reconcileMark'].includes(f) && !/Score|Aud|Mnt|mnt/.test(f));
    expect(fuera).toEqual([]);
  });

  it('🔴 y ninguna ficha se guarda como enviada sin comparar', () => {
    const marcan = lineas.filter((l) => /saveE\([^)]*,\s*true\s*\)/.test(l.t)).map((l) => funcionDe(l.n));
    expect([...new Set(marcan)].sort()).toEqual(['_reconcileAlgas', '_reconcileFichas']);
  });

  it('🔴 cada ruta de envío pasa por la función común', () => {
    const veces = {};
    lineas.filter((l) => l.t.includes('_marcarEnviado(opts)') && !l.t.includes('function')).forEach((l) => {
      const f = funcionDe(l.n);
      veces[f] = (veces[f] || 0) + 1;
    });
    expect(veces).toEqual({
      syncAll: 5,            // Algas, Salas/Zonas/Tanques, Datos, Parámetros y Desinfección
      syncOneFicha: 3,
      _syncMadSalasGrid: 1, _madZonasSync: 1, _syncMadTanquesGrid: 1,
      syncBioGrid: 1,
      syncOneAstFromList: 1, syncAllPendingAst: 1,
      syncAllPendingTras: 1,
      syncMic: 1, syncCal: 1, syncPat: 1,
    });
  });
});
