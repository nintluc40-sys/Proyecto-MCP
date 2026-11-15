// @vitest-environment happy-dom
/* ============================================================
   LABORATORIO · CORREGIR LA FECHA DE UN ANÁLISIS QUE YA LLEGÓ A LA HOJA (punto 5 de la pauta del 2026-11-12)

   Lo que pasaba (medido en el código el 14-11): al corregir la fecha (o la corrida) de un análisis ya enviado, la sesión vieja se
   anula en la hoja (A10) sólo si sus registros siguen marcados como enviados. No lo están en dos casos:
   · si se volvió a guardar con 💾 después de enviarse (sus registros se rehacen «sin enviar»);
   · si su envío espera todavía en la cola (sin señal).
   En los dos, la hoja se quedaba con el análisis DOS veces. Y con la sesión vieja en la cola, la anulación podía adelantarla: al
   llegar después, la vieja volvía.
   🗑 de la corrección antes de enviarla dejaba su anulación pendiente: la hoja perdía el análisis entero, aunque el aviso de 🗑
   promete que la hoja no cambia. Decisión del usuario: «Se queda como estaba».

   Motor REAL sobre el shell real; la red, simulada. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['savePatLocal', 'syncPat', '_patRaw', 'renderPatNuevo', 'patDeleteSession', 'patSessionKey', 'PAT_REC_KEY', 'PAT_SHEET_HEADERS',
  'saveMicLocal', 'syncMic', '_micRaw', 'renderMicNuevo', 'micDeleteSession', 'micSessionKey', 'MIC_SHEET_HEADERS',
  'saveCalLocal', 'syncCal', '_calRaw', 'renderCalNuevo', 'calDeleteSession', 'calSessionKey', 'CAL_SHEET_HEADERS', 'CAL_FORMATS',
  'micTypeSet', 'LAB_ANULAR_KEY', '_lastSyncFingerprint', '_loadSyncQueue'];
const H = {};
const envios = [];
const avisos = [];
/** Lo que contesta la red: 'ok', o 'retry' (sin señal: tras los reintentos, a la cola). */
let red = 'ok';

const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return red; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
});

/** Las respuestas a «¿corrección?» y «¿otro análisis?», en orden. */
let si = [];
beforeEach(() => {
  almacen.clear(); envios.length = 0; avisos.length = 0; red = 'ok'; si = [];
  H._lastSyncFingerprint.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => (si.length ? si.shift() : true);
});
afterEach(() => { vi.useRealTimers(); });

const D1 = '2026-11-03', D2 = '2026-11-04';
const campo = (id, v) => { const e = document.getElementById(id); if (!e) throw new Error('sin #' + id); e.value = v; };
const celda = (n, v) => { const e = document.querySelector(`[name="${n}"]`); if (!e) throw new Error('sin ' + n); e.value = v; };
const pendientes = () => JSON.parse(almacen.getItem(H.LAB_ANULAR_KEY) || '{}');
const anuladas = (env, cab) => env.rows.filter((r) => String(r[cab.indexOf('Responsable')]).startsWith('⛔ ANULADA'));
const reales = (env, cab) => env.rows.filter((r) => !String(r[cab.indexOf('Responsable')]).startsWith('⛔ ANULADA'));
const aviso = (re) => avisos.some((a) => re.test(a));
/** Corre un envío dejando pasar los reintentos (esperan con temporizadores). */
const conEspera = async (fn) => {
  let fin = false;
  const p = fn().then(() => { fin = true; });
  for (let i = 0; i < 60 && !fin; i++) await vi.advanceTimersByTimeAsync(500);
  await p;
};

describe('🧫 Patología', () => {
  const PH = () => H.PAT_SHEET_HEADERS;
  const nuevo = (fecha) => {
    H.micTypeSet('pat'); H.renderPatNuevo();
    campo('pat-fm', fecha); campo('pat-corr', '585'); campo('pat-resp', 'Analista A');
    celda('pat_1_muestra', 'Camarón 1');
  };
  const cambiarFecha = (fecha) => { H.renderPatNuevo(); campo('pat-fm', fecha); };

  it('🔴 enviada y vuelta a guardar con 💾: al corregir la fecha, la vieja SE ANULA (antes salía dos veces)', async () => {
    nuevo(D1);
    await H.syncPat();
    H.renderPatNuevo();
    expect(H.savePatLocal()).toBe(1);                                   // 💾 otra vez, la misma fecha
    expect(H._patRaw().every((r) => !r.synced && !r.syncedAt), 'el caso: lo rehecho ya no está «enviado»').toBe(true);
    cambiarFecha(D2);
    si = [true];
    await H.syncPat();
    const an = anuladas(envios.at(-1), PH());
    expect(an, 'la fecha vieja se quedó en la hoja').toHaveLength(1);
    expect(an[0][PH().indexOf('Fecha muestreo')]).toBe(D1);
  });

  it('lo que nunca salió, aunque se guarde dos veces, no se anula (control)', async () => {
    nuevo(D1);
    expect(H.savePatLocal()).toBe(1);
    H.renderPatNuevo();
    expect(H.savePatLocal()).toBe(1);
    cambiarFecha(D2);
    si = [true];
    await H.syncPat();
    expect(anuladas(envios.at(-1), PH())).toHaveLength(0);
  });

  it('🔴 con su envío esperando en la cola: la corrección la anula, y la anulación sale DETRÁS de ella', async () => {
    nuevo(D1);
    red = 'retry';
    await conEspera(() => H.syncPat());
    expect(H._loadSyncQueue(), 'el caso: la sesión vieja espera en la cola').toHaveLength(1);
    cambiarFecha(D2);
    si = [true];
    expect(H.savePatLocal()).toBe(1);
    expect(pendientes().pat, 'no se preparó la anulación').toHaveLength(1);
    red = 'ok';
    envios.length = 0;
    H._lastSyncFingerprint.clear();
    await conEspera(() => H.syncPat());
    /* Dos finales buenos: la vieja llega ANTES que su anulación, o la cola la retira porque el envío nuevo cubre su clave (y en la
       hoja sólo queda la fila «ANULADA»). El malo: la vieja llega después, o se queda en la cola para llegar después. */
    const esViejo = (p) => reales(p, PH()).some((r) => r[PH().indexOf('Fecha muestreo')] === D1);
    const iViejo = envios.map(esViejo).lastIndexOf(true);
    const iAnul = envios.findIndex((e) => anuladas(e, PH()).length > 0);
    expect(iAnul, 'no salió la anulación').toBeGreaterThanOrEqual(0);
    expect(iViejo, 'la sesión vieja llegó DESPUÉS de anularse: vuelve a la hoja').toBeLessThan(iAnul);
    expect(H._loadSyncQueue().some((it) => it && it.payload && esViejo(it.payload)), 'la sesión vieja sigue en la cola: llegará después de anularse').toBe(false);
  });

  it('🔴 🗑 de la corrección sin enviar: la hoja conserva la fecha vieja (su anulación se retira) y se dice', async () => {
    nuevo(D1);
    await H.syncPat();
    cambiarFecha(D2);
    si = [true];
    expect(H.savePatLocal()).toBe(1);
    expect(pendientes().pat).toHaveLength(1);
    H.patDeleteSession(H.patSessionKey(H._patRaw()[0].data));
    expect(H._patRaw()).toHaveLength(0);
    expect(pendientes().pat, 'la anulación seguía pendiente: la hoja perdería el análisis').toBeUndefined();
    expect(aviso(/sigue como estaba el análisis del 03\/11\/2026 · corrida 585, que ya no se anula/), avisos.join(' | ')).toBe(true);
  });

  it('🗑 de OTRA sesión no toca la anulación pendiente de ésta (control)', async () => {
    nuevo(D1);
    await H.syncPat();
    cambiarFecha(D2);
    si = [true];
    expect(H.savePatLocal()).toBe(1);                                   // anulación de D1 pendiente
    // Otro análisis sin enviar, de otra sesión.
    const otra = { ...H._patRaw()[0], id: 'otra', data: { ...H._patRaw()[0].data, sid: 'OTRA', fechaMuestreo: '2026-11-01' } };
    almacen.setItem(H.PAT_REC_KEY, JSON.stringify(H._patRaw().concat([otra])));
    H.patDeleteSession(H.patSessionKey(otra.data));
    expect(pendientes().pat).toHaveLength(1);
  });

  it('🗑 de una corrección que YA llegó a la hoja no retira la anulación: la vieja tiene que anularse igual (control)', async () => {
    nuevo(D1);
    await H.syncPat();
    cambiarFecha(D2);
    si = [true];
    expect(H.savePatLocal()).toBe(1);
    // Estado forzado: la corrección consta como llegada a la hoja y la anulación sigue pendiente.
    almacen.setItem(H.PAT_REC_KEY, JSON.stringify(H._patRaw().map((r) => ({ ...r, enHoja: true }))));
    H.patDeleteSession(H.patSessionKey(H._patRaw()[0].data));
    expect(pendientes().pat).toHaveLength(1);
  });
});

describe('🦠 Microbiología y 💧 Calidad de Agua', () => {
  const micNuevo = () => {
    H.micTypeSet('bact'); H.renderMicNuevo();
    campo('mic-fm', D1); campo('mic-corr', '585'); campo('mic-resp', 'Analista A');
    const ns = Array.from(document.querySelectorAll('[name^="mic_larv-muestra_1_"]')).map((e) => e.name);
    celda(ns.find((x) => /vamar/.test(x)) || ns.at(-1), '5');
  };
  const calNuevo = () => {
    H.micTypeSet('cal'); H.renderCalNuevo();
    campo('cal-fm', D1); campo('cal-corr', '585'); campo('cal-resp', 'Analista A');
    celda('cal_larv_1_' + H.CAL_FORMATS.larv.params[0], '7');
  };

  it('🔴 Microbiología: enviada y vuelta a guardar con 💾, al corregir la corrida la vieja se anula', async () => {
    micNuevo();
    await H.syncMic();
    H.renderMicNuevo();
    expect(H.saveMicLocal()).toBe(1);
    H.renderMicNuevo(); campo('mic-corr', '586');
    si = [true];
    await H.syncMic();
    const an = anuladas(envios.at(-1), H.MIC_SHEET_HEADERS);
    expect(an).toHaveLength(1);
    expect(an[0][H.MIC_SHEET_HEADERS.indexOf('Corrida')]).toBe('585');
  });

  it('🔴 Microbiología: 🗑 de la corrección sin enviar retira su anulación', async () => {
    micNuevo();
    await H.syncMic();
    H.renderMicNuevo(); campo('mic-corr', '586');
    si = [true];
    expect(H.saveMicLocal()).toBe(1);
    expect(pendientes().mic).toHaveLength(1);
    H.micDeleteSession(H.micSessionKey(H._micRaw()[0].data));
    expect(pendientes().mic).toBeUndefined();
  });

  it('🔴 Calidad de Agua: enviada y vuelta a guardar con 💾, al corregir la fecha la vieja se anula', async () => {
    calNuevo();
    await H.syncCal();
    H.renderCalNuevo();
    expect(H.saveCalLocal()).toBe(1);
    H.renderCalNuevo(); campo('cal-fm', D2);
    si = [true];
    await H.syncCal();
    const an = anuladas(envios.at(-1), H.CAL_SHEET_HEADERS);
    expect(an).toHaveLength(1);
    expect(an[0][H.CAL_SHEET_HEADERS.indexOf('Fecha muestreo')]).toBe(D1);
  });

  it('🔴 Calidad de Agua: 🗑 de la corrección sin enviar retira su anulación', async () => {
    calNuevo();
    await H.syncCal();
    H.renderCalNuevo(); campo('cal-fm', D2);
    si = [true];
    expect(H.saveCalLocal()).toBe(1);
    expect(pendientes().cal).toHaveLength(1);
    H.calDeleteSession(H.calSessionKey(H._calRaw()[0].data));
    expect(pendientes().cal).toBeUndefined();
  });
});
