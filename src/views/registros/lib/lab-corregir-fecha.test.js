// @vitest-environment happy-dom
/* ============================================================
   LABORATORIO · CORREGIR LA FECHA (O LA CORRIDA) DE UN ANÁLISIS YA GUARDADO (A10, 2026-11-06)

   LO QUE PASABA: Microbiología, Calidad de Agua y Patología reemplazan cada SESIÓN en la hoja por su clave (fecha,
   corrida, [departamento, formato,] sesión). Al corregir la fecha o la corrida de un análisis ya enviado, la clave era
   otra: el análisis viejo se quedaba en la hoja y en el historial, y salía dos veces.

   AHORA (usuario: «Sin tocar el Apps Script», «Preguntar cada vez», «Sí, así»): al guardar otra fecha o corrida de una
   sesión ya guardada se pregunta si es una CORRECCIÓN u OTRO análisis. Corrección: lo viejo sale del historial y, si
   llegó a la hoja, su sesión se sustituye allí por UNA fila con «⛔ ANULADA · pasó al …» en Responsable, con su clave
   exacta, en el mismo envío. Otro: sesión nueva, y lo viejo se queda. Cancelar: no se guarda nada.

   Motor REAL sobre el shell real; la red, simulada. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['savePatLocal', 'syncPat', '_patRaw', 'renderPatNuevo', 'syncMic', '_micRaw', 'renderMicNuevo',
  'syncCal', '_calRaw', 'renderCalNuevo', 'CAL_FORMATS', 'MIC_FORMATS', 'micFmtChange', 'micTypeSet', 'LAB_ANULAR_KEY', '_lastSyncFingerprint',
  'PAT_SHEET_HEADERS', 'MIC_SHEET_HEADERS', 'CAL_SHEET_HEADERS'];
const H = {};
const envios = [];
let respuesta = 'ok';

const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
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
  H.setToast(() => {});
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return respuesta; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
});

const D1 = '2026-11-03', D2 = '2026-11-04';
const campo = (id, v) => { const e = document.getElementById(id); if (!e) throw new Error('sin #' + id); e.value = v; };
const celda = (n, v) => { const e = document.querySelector(`[name="${n}"]`); if (!e) throw new Error('sin ' + n); e.value = v; };
/** Las respuestas a las dos preguntas, en orden: [¿corrección?, ¿otro?]. */
let respuestas = [];
const preguntas = [];
const ultimo = () => envios.at(-1);
const anuladas = (env, cab) => env.rows.filter((r) => String(r[cab.indexOf('Responsable')]).startsWith('⛔ ANULADA'));
const pendientes = () => JSON.parse(almacen.getItem(H.LAB_ANULAR_KEY) || '{}');

beforeEach(() => {
  almacen.clear();
  envios.length = 0;
  respuesta = 'ok';
  respuestas = [];
  preguntas.length = 0;
  H._lastSyncFingerprint.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = (msg) => { preguntas.push(String(msg)); return respuestas.length ? respuestas.shift() : true; };
});
afterEach(() => { vi.useRealTimers(); });

describe('A10 · Patología: corregir la fecha', () => {
  const PH = () => H.PAT_SHEET_HEADERS;
  const nuevo = (fecha) => {
    H.micTypeSet('pat'); H.renderPatNuevo();
    campo('pat-fm', fecha); campo('pat-corr', '585'); campo('pat-resp', 'Analista A');
    celda('pat_1_muestra', 'Camarón 1');
  };
  const cambiarFecha = (fecha) => { H.renderPatNuevo(); campo('pat-fm', fecha); };

  it('🔴 corrección: el envío lleva el análisis en su fecha nueva y UNA fila «ANULADA» con la clave vieja exacta', async () => {
    nuevo(D1);
    await H.syncPat();
    const sid = ultimo().rows[0][PH().indexOf('Sesión')];
    cambiarFecha(D2);
    respuestas = [true];
    await H.syncPat();
    expect(preguntas[0]).toMatch(/03\/11\/2026 · corrida 585[\s\S]*CORRECCIÓN[\s\S]*04\/11\/2026 · corrida 585/);
    const env = ultimo();
    const an = anuladas(env, PH());
    expect(an).toHaveLength(1);
    const c = (n) => an[0][PH().indexOf(n)];
    expect([c('Fecha muestreo'), c('Corrida'), c('Sesión')]).toEqual([D1, '585', sid]);
    expect(c('Responsable')).toBe('⛔ ANULADA · pasó al 04/11/2026 · corrida 585');
    expect(c('Muestra')).toBe('');
    const reales = env.rows.filter((r) => !an.includes(r));
    expect(reales.map((r) => r[PH().indexOf('Fecha muestreo')])).toEqual([D2]);
    expect(env.keyCols).toEqual([0, 2, PH().indexOf('Sesión')]);   // la clave de siempre: nada se borra «por sesión»
    expect(H._patRaw().map((r) => r.data.fechaMuestreo)).toEqual([D2]);   // y el historial ya no lo tiene dos veces
    expect(pendientes().pat).toBeUndefined();   // salió: no se repite
  });

  it('🔴 «otro análisis»: sesión nueva, sin anular nada, y lo viejo se queda', async () => {
    nuevo(D1);
    await H.syncPat();
    const sid = ultimo().rows[0][PH().indexOf('Sesión')];
    cambiarFecha(D2);
    respuestas = [false, true];
    await H.syncPat();
    expect(anuladas(ultimo(), PH())).toHaveLength(0);
    expect(ultimo().rows[0][PH().indexOf('Sesión')]).not.toBe(sid);
    expect(H._patRaw().map((r) => r.data.fechaMuestreo).sort()).toEqual([D1, D2]);
  });

  it('cancelar las dos preguntas no guarda nada', async () => {
    nuevo(D1);
    await H.syncPat();
    cambiarFecha(D2);
    respuestas = [false, false];
    expect(H.savePatLocal()).toBe(-1);
    expect(H._patRaw().map((r) => r.data.fechaMuestreo)).toEqual([D1]);
  });

  it('lo que nunca salió no se anula en la hoja (sólo sale del historial)', async () => {
    nuevo(D1);
    expect(H.savePatLocal()).toBe(1);
    cambiarFecha(D2);
    respuestas = [true];
    await H.syncPat();
    expect(anuladas(ultimo(), H.PAT_SHEET_HEADERS)).toHaveLength(0);
    expect(H._patRaw().map((r) => r.data.fechaMuestreo)).toEqual([D2]);
  });

  it('🔴 si el envío se rechaza, la anulación espera y sale con el siguiente', async () => {
    nuevo(D1);
    await H.syncPat();
    cambiarFecha(D2);
    respuestas = [true];
    respuesta = 'rejected';
    await H.syncPat();
    expect(pendientes().pat).toHaveLength(1);
    respuesta = 'ok';
    H._lastSyncFingerprint.clear();
    await H.syncPat();
    expect(anuladas(ultimo(), H.PAT_SHEET_HEADERS)).toHaveLength(1);
    expect(pendientes().pat).toBeUndefined();
  });

  it('volver a la fecha vieja antes de enviar quita su anulación (no se anula lo que vuelve)', async () => {
    nuevo(D1);
    await H.syncPat();
    cambiarFecha(D2);
    respuestas = [true];
    expect(H.savePatLocal()).toBe(1);
    expect(pendientes().pat).toHaveLength(1);
    cambiarFecha(D1);
    respuestas = [true];
    await H.syncPat();
    expect(anuladas(ultimo(), H.PAT_SHEET_HEADERS)).toHaveLength(0);
    expect(ultimo().rows.map((r) => r[0])).toEqual([D1]);
  });

  it('guardar otra vez la MISMA fecha no pregunta', async () => {
    nuevo(D1);
    await H.syncPat();
    H.renderPatNuevo();
    expect(H.savePatLocal()).toBe(1);
    expect(preguntas).toHaveLength(0);
  });
});

describe('A10 · Microbiología y Calidad de Agua: lo mismo, con departamento y formato', () => {
  it('🔴 Microbiología', async () => {
    H.micTypeSet('bact'); H.renderMicNuevo();
    campo('mic-fm', D1); campo('mic-corr', '585'); campo('mic-resp', 'Analista A');
    const ns = Array.from(document.querySelectorAll('[name^="mic_larv-muestra_1_"]')).map((e) => e.name);
    celda(ns.find((x) => /vamar/.test(x)) || ns.at(-1), '5');
    await H.syncMic();
    H.renderMicNuevo(); campo('mic-corr', '586');   // ahora, la corrida
    respuestas = [true];
    await H.syncMic();
    const MH = H.MIC_SHEET_HEADERS;
    const an = anuladas(ultimo(), MH);
    expect(an).toHaveLength(1);
    expect([an[0][MH.indexOf('Fecha muestreo')], an[0][MH.indexOf('Corrida')], an[0][MH.indexOf('Departamento')]]).toEqual([D1, '585', 'Larvicultura']);
    expect(an[0][MH.indexOf('Formato')]).toBe(ultimo().rows[0][MH.indexOf('Formato')]);   // el formato, con su ROTULO de la hoja
    expect(an[0][MH.indexOf('Responsable')]).toBe('⛔ ANULADA · pasó al 03/11/2026 · corrida 586');
    expect(H._micRaw().map((r) => r.data.corrida)).toEqual(['586']);
  });

  it('otro FORMATO del mismo análisis, con la misma fecha, no es un cambio de fecha: no pregunta ni anula', async () => {
    const llenar = (fmt) => {
      const ns = Array.from(document.querySelectorAll(`[name^="mic_${fmt}_1_"]`)).map((e) => e.name);
      const p = H.MIC_FORMATS[fmt].params.find((k) => k !== 'vtot' && ns.includes(`mic_${fmt}_1_${k}`));
      celda(`mic_${fmt}_1_${p}`, '5');
    };
    H.micTypeSet('bact'); H.renderMicNuevo();
    campo('mic-fm', D1); campo('mic-corr', '585'); campo('mic-resp', 'Analista A');
    llenar('larv-muestra');
    await H.syncMic();
    const f2 = Object.keys(H.MIC_FORMATS).find((k) => k !== 'larv-muestra' && H.MIC_FORMATS[k].depto === 'Larvicultura');
    H.micFmtChange(f2);
    llenar(f2);
    await H.syncMic();
    expect(preguntas).toHaveLength(0);
    expect(anuladas(ultimo(), H.MIC_SHEET_HEADERS)).toHaveLength(0);
    expect(H._micRaw().map((r) => r.data.formato).sort()).toEqual(['larv-muestra', f2].sort());
  });

  it('🔴 Calidad de Agua', async () => {
    H.micTypeSet('cal'); H.renderCalNuevo();
    campo('cal-fm', D1); campo('cal-corr', '585'); campo('cal-resp', 'Analista A');
    celda('cal_larv_1_' + H.CAL_FORMATS.larv.params[0], '7');
    await H.syncCal();
    H.renderCalNuevo(); campo('cal-fm', D2);
    respuestas = [true];
    await H.syncCal();
    const CH = H.CAL_SHEET_HEADERS;
    const an = anuladas(ultimo(), CH);
    expect(an).toHaveLength(1);
    expect([an[0][CH.indexOf('Fecha muestreo')], an[0][CH.indexOf('Departamento')]]).toEqual([D1, 'Larvicultura']);
    expect(H._calRaw().map((r) => r.data.fechaMuestreo)).toEqual([D2]);
  });
});
