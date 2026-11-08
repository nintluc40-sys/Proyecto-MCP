// @vitest-environment happy-dom
/* ============================================================
   COLA · BIOMOL: DOS ANÁLISIS DEL MISMO DÍA, SIN SEÑAL (pauta 1.1, 2026-11-03)

   El defecto: la marca del envío era la fecha sola. El segundo análisis del día expulsaba al primero de la cola, creyéndolo una
   versión vieja de sí mismo, y al entregarse marcaba a los dos como enviados: el primero no llegaba nunca, y nadie se enteraba.
   La hoja sí los distingue, por su columna Sesión.

   Motor REAL sobre el shell real; la red, simulada. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', '_loadSyncQueue', '_saveSyncQueue', 'flushSyncQueue', 'postPayload', 'renderBiomol', 'bioSesCrear', 'saveBioGrid', 'syncBioGrid', '_bioRaw', '_bioSave', '_bioSesAll', '_bioSesSave', 'BIO_SHEET'];
const H = {};
const hoja = [];
/* Sin señal, el motor reintenta a los 1,2 s y vacía la cola a los 8 s: sin esto, ese vaciado caería en medio de otra prueba. */
const _setTimeout = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _setTimeout; });
const red = { respuesta: () => 'ok' };

beforeAll(async () => {
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
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.BIO_MOD=BIO_MOD; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec');
  H.setPostOnce(async (body) => {
    const r = red.respuesta(body);
    if (r === 'ok') hoja.push(JSON.parse(JSON.stringify(body)));
    return r;
  });
});

const FECHA = '2026-10-20';
const SIN_SENAL = () => 'retry';
const SENAL = () => 'ok';
const cod = (p) => p.rows.map((f) => f[1]);
const cola = () => H._loadSyncQueue();
const pendientes = (sid) => H._bioRaw().filter((r) => r.data.sid === sid && !r.synced).length;

/* Un análisis nuevo con una muestra, guardado y en pantalla, como lo deja el analista. */
const analisis = (nombre, codigo, fecha = FECHA) => {
  document.getElementById('bio-grid-fecha').value = fecha;
  const sid = H.bioSesCrear(fecha, nombre);
  H.renderBiomol();
  document.getElementById('bio-grid-fecha').value = fecha;
  const panel = document.getElementById('fp-biomol');
  panel.querySelector('[name="bg_1_codigo"]').value = codigo;
  panel.querySelector('[name="bg_1_lugar"]').value = 'Sala 1';
  H.saveBioGrid({ noRender: true });
  return sid;
};
const enviar = () => H.syncBioGrid({ rotar: false });

beforeEach(() => {
  globalThis.localStorage.clear();
  hoja.length = 0;
  red.respuesta = SENAL;
  H.setMod(H.BIO_MOD, 'biomol');
  H.renderBiomol();
});

describe('🔴 dos análisis del mismo día, sin señal', () => {
  it('🔴 los dos esperan en la cola, y cada uno con su marca', async () => {
    red.respuesta = SIN_SENAL;
    const a = analisis('A', 'XA1');
    await enviar();
    const b = analisis('B', 'XB1');
    await enviar();
    expect(cola().map((it) => it.mark.keys)).toEqual([[FECHA + '|' + a], [FECHA + '|' + b]]);
  });

  it('🔴 al volver la señal llegan los DOS a la hoja, y sólo entonces quedan enviados', async () => {
    red.respuesta = SIN_SENAL;
    const a = analisis('A', 'XA1');
    await enviar();
    const b = analisis('B', 'XB1');
    await enviar();
    expect(pendientes(a)).toBe(1);
    expect(pendientes(b)).toBe(1);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(hoja.map(cod)).toEqual([['XA1'], ['XB1']]);
    expect(pendientes(a)).toBe(0);
    expect(pendientes(b)).toBe(0);
    expect(cola()).toEqual([]);
  });

  it('🔴 si sólo llega uno, el otro sigue pendiente y en la cola', async () => {
    red.respuesta = SIN_SENAL;
    const a = analisis('A', 'XA1');
    await enviar();
    const b = analisis('B', 'XB1');
    await enviar();
    red.respuesta = (p) => (cod(p).includes('XA1') ? 'ok' : 'retry');
    await H.flushSyncQueue();
    expect(hoja.map(cod)).toEqual([['XA1']]);
    expect(pendientes(a)).toBe(0);
    expect(pendientes(b), 'se dio por enviado lo que no llegó').toBe(1);
    expect(cola().map((it) => it.mark.keys)).toEqual([[FECHA + '|' + b]]);
  });

  it('🔴 rechazado por sus datos: no se da por enviado', async () => {
    red.respuesta = SIN_SENAL;
    const a = analisis('A', 'XA1');
    await enviar();
    red.respuesta = () => 'rejected';
    await H.flushSyncQueue();
    expect(hoja).toEqual([]);
    expect(pendientes(a)).toBe(1);
  });

  it('🔴 un envío directo de otro análisis no se lleva por delante al que espera', async () => {
    red.respuesta = SIN_SENAL;
    const a = analisis('A', 'XA1');
    await enviar();
    red.respuesta = SENAL;
    const b = analisis('B', 'XB1');
    await enviar();
    expect(hoja.map(cod)).toEqual([['XB1']]);
    expect(pendientes(b), 'B10 · el envío directo de B queda marcado como enviado').toBe(0);
    expect(cola().map((it) => it.mark.keys), 'el directo purgó al otro análisis').toEqual([[FECHA + '|' + a]]);
    await H.flushSyncQueue();
    expect(hoja.map(cod)).toEqual([['XB1'], ['XA1']]);
    expect(pendientes(a)).toBe(0);
  });
});

describe('🔵 lo que ya funcionaba sigue igual', () => {
  it('reenviar el MISMO análisis reemplaza al que esperaba: viaja sólo lo último', async () => {
    red.respuesta = SIN_SENAL;
    const a = analisis('A', 'XA1');
    await enviar();
    document.querySelector('#fp-biomol [name="bg_1_codigo"]').value = 'XA2';
    await enviar();
    expect(cola().length).toBe(1);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(hoja.map(cod)).toEqual([['XA2']]);
    expect(pendientes(a)).toBe(0);
  });

  it('un envío directo del MISMO análisis retira al que esperaba', async () => {
    red.respuesta = SIN_SENAL;
    analisis('A', 'XA1');
    await enviar();
    red.respuesta = SENAL;
    document.querySelector('#fp-biomol [name="bg_1_codigo"]').value = 'XA2';
    await enviar();
    expect(hoja.map(cod)).toEqual([['XA2']]);
    expect(cola()).toEqual([]);
  });

  it('un análisis de otro día no se toca', async () => {
    red.respuesta = SIN_SENAL;
    const a = analisis('A', 'XA1');
    await enviar();
    const otro = analisis('C', 'XC1', '2026-10-21');
    await enviar();
    red.respuesta = (p) => (cod(p).includes('XA1') ? 'ok' : 'retry');
    await H.flushSyncQueue();
    expect(pendientes(a)).toBe(0);
    expect(pendientes(otro)).toBe(1);
  });

  it('🔴 un día heredado viaja entero, y al llegar marca a todos sus análisis', async () => {
    const a = analisis('A', 'XA1');
    const b = analisis('B', 'XB1');
    const ses = H._bioSesAll();
    ses[a].legacy = true;
    H._bioSesSave(ses);
    red.respuesta = SIN_SENAL;
    await enviar();
    expect(cola().length).toBe(1);
    expect([...cola()[0].mark.keys].sort()).toEqual([FECHA + '|' + a, FECHA + '|' + b].sort());
    expect(cola()[0].payload.replaceDate).toBe(FECHA);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(pendientes(a)).toBe(0);
    expect(pendientes(b)).toBe(0);
  });
});

describe('🟡 lo que estaba en cola al actualizar', () => {
  /* Una tablet puede tener envíos en cola con la marca de antes, que sólo dice la fecha. */
  const envioDeAntes = () => H._enqueueSync({ sheetName: H.BIO_SHEET, headers: ['Fecha', 'Código'], rows: [[FECHA, 'XVIEJO']] }, 'req-antes', '', { kind: 'bio', keys: [FECHA] });

  it('🔴 se entrega igual, sin dar por enviado lo que no se sabe si viajó', async () => {
    const a = analisis('A', 'XA1');
    envioDeAntes();
    await H.flushSyncQueue();
    expect(hoja.map(cod)).toEqual([['XVIEJO']]);
    expect(cola()).toEqual([]);
    expect(pendientes(a)).toBe(1);
  });

  it('🔴 un envío nuevo del mismo día no lo expulsa', async () => {
    envioDeAntes();
    red.respuesta = SIN_SENAL;
    analisis('A', 'XA1');
    await enviar();
    expect(cola().length).toBe(2);
    red.respuesta = SENAL;
    await H.flushSyncQueue();
    expect(hoja.map(cod)).toEqual([['XVIEJO'], ['XA1']]);
  });
});
