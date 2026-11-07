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
  'PAT_SHEET_HEADERS', 'MIC_SHEET_HEADERS', 'CAL_SHEET_HEADERS', 'PAT_REC_KEY', 'MIC_REC_KEY', 'CAL_REC_KEY', 'saveMicLocal', 'saveCalLocal',
  '_allAppStorageKeys', 'PRE'];
const H = {};
const envios = [];
let respuesta = 'ok';

/** Claves que «no caben»: escribirlas lanza, como un navegador sin espacio. */
const llenas = new Set();
/** Navegador LLENO que cuenta el valor viejo y el nuevo a la vez: reemplazar por algo más largo no cabe. */
let creceNoCabe = false;
const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (llenas.has(k)) throw new Error('QuotaExceededError');
      if (creceNoCabe && m.has(k) && String(v).length > m.get(k).length) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
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
  llenas.clear();
  creceNoCabe = false;
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

/* Revisión de la B (2026-11-07, usuario: «Todo o nada») · LA ANULACIÓN Y LA CORRECCIÓN, JUNTAS O NINGUNA. La anulación se
   guardaba antes que el análisis corregido: sin espacio para éste, quedaba sola, y el siguiente envío anulaba la fecha vieja
   en la hoja sin que la nueva existiera en ninguna parte. */
describe('A10 · corregir sin espacio en el equipo: todo o nada', () => {
  const patNuevo = (fecha) => {
    H.micTypeSet('pat'); H.renderPatNuevo();
    campo('pat-fm', fecha); campo('pat-corr', '585'); campo('pat-resp', 'Analista A');
    celda('pat_1_muestra', 'Camarón 1');
  };

  it('🔴 Patología: si el análisis corregido no cabe, no queda ninguna anulación (antes quedaba sola)', async () => {
    patNuevo(D1);
    await H.syncPat();
    H.renderPatNuevo(); campo('pat-fm', D2);
    respuestas = [true];
    llenas.add(H.PAT_REC_KEY);
    expect(H.savePatLocal()).toBe(-2);
    llenas.clear();
    expect(pendientes().pat).toBeUndefined();
    expect(H._patRaw().map((r) => r.data.fechaMuestreo)).toEqual([D1]);   // sigue como estaba
  });

  it('🔴 Patología: si la anulación no cabe, tampoco se guarda la corrección (antes salía dos veces en la hoja)', async () => {
    patNuevo(D1);
    await H.syncPat();
    H.renderPatNuevo(); campo('pat-fm', D2);
    respuestas = [true];
    llenas.add(H.LAB_ANULAR_KEY);
    expect(H.savePatLocal()).toBe(-2);
    llenas.clear();
    expect(H._patRaw().map((r) => r.data.fechaMuestreo)).toEqual([D1]);
    expect(pendientes().pat).toBeUndefined();
  });

  it('🔴 Microbiología: sin espacio para el análisis, ninguna anulación', async () => {
    H.micTypeSet('bact'); H.renderMicNuevo();
    campo('mic-fm', D1); campo('mic-corr', '585'); campo('mic-resp', 'Analista A');
    const ns = Array.from(document.querySelectorAll('[name^="mic_larv-muestra_1_"]')).map((e) => e.name);
    celda(ns.find((x) => /vamar/.test(x)) || ns.at(-1), '5');
    await H.syncMic();
    H.renderMicNuevo(); campo('mic-corr', '586');
    respuestas = [true];
    llenas.add(H.MIC_REC_KEY);
    expect(H.saveMicLocal()).toBe(-2);
    llenas.clear();
    expect(pendientes().mic).toBeUndefined();
    expect(H._micRaw().map((r) => r.data.corrida)).toEqual(['585']);
  });

  it('🔴 Calidad de Agua: sin espacio para el análisis, ninguna anulación', async () => {
    H.micTypeSet('cal'); H.renderCalNuevo();
    campo('cal-fm', D1); campo('cal-corr', '585'); campo('cal-resp', 'Analista A');
    celda('cal_larv_1_' + H.CAL_FORMATS.larv.params[0], '7');
    await H.syncCal();
    H.renderCalNuevo(); campo('cal-fm', D2);
    respuestas = [true];
    llenas.add(H.CAL_REC_KEY);
    expect(H.saveCalLocal()).toBe(-2);
    llenas.clear();
    expect(pendientes().cal).toBeUndefined();
    expect(H._calRaw().map((r) => r.data.fechaMuestreo)).toEqual([D1]);
  });

  it('una anulación que ya esperaba no se pierde por un intento que no cupo', async () => {
    patNuevo(D1);
    await H.syncPat();
    H.renderPatNuevo(); campo('pat-fm', D2);
    respuestas = [true];
    expect(H.savePatLocal()).toBe(1);                       // corregida: la anulación de D1 espera
    expect(pendientes().pat).toHaveLength(1);
    H.renderPatNuevo(); campo('pat-corr', '586');           // otra corrección, que no cabe
    respuestas = [true];
    llenas.add(H.PAT_REC_KEY);
    expect(H.savePatLocal()).toBe(-2);
    llenas.clear();
    expect(pendientes().pat).toHaveLength(1);              // la de antes sigue, igual
    expect(pendientes().pat[0].data.fechaMuestreo).toBe(D1);
  });

  /* 2.ª revisión de la B (07-11) · al VOLVER a la fecha de antes, su anulación sobra y sale: lo que se escribe es más corto
     que lo que había. Si después el análisis no cabe, deshacer era reemplazar por algo MÁS LARGO, y con el navegador
     lleno eso podía no caber: la anulación se perdía. Ahora se quita lo nuevo y se repone lo de antes, que cabía. */
  it('🔴 deshacer vuelve a lo de antes aunque fuera más largo, con el navegador lleno', async () => {
    patNuevo(D1);
    await H.syncPat();
    H.renderPatNuevo(); campo('pat-fm', D2);
    respuestas = [true];
    expect(H.savePatLocal()).toBe(1);                       // la anulación de D1 espera
    const antes = almacen.getItem(H.LAB_ANULAR_KEY);
    H.renderPatNuevo(); campo('pat-fm', D1);                // vuelve a D1: su anulación sobraría
    respuestas = [true];
    llenas.add(H.PAT_REC_KEY);
    creceNoCabe = true;
    expect(H.savePatLocal()).toBe(-2);
    creceNoCabe = false;
    llenas.clear();
    expect(almacen.getItem(H.LAB_ANULAR_KEY)).toBe(antes);
    expect(pendientes().pat[0].data.fechaMuestreo).toBe(D1);
  });
});

/* Revisión de la B (2026-11-07) · la clave de las anulaciones no llevaba el prefijo de la app: un respaldo restaurado en otro
   equipo las perdía. Lo guardado con el nombre viejo pasa al nuevo. */
describe('A10 · las anulaciones pendientes entran en el respaldo', () => {
  const corregirSinEnviar = async () => {
    H.micTypeSet('pat'); H.renderPatNuevo();
    campo('pat-fm', D1); campo('pat-corr', '585'); campo('pat-resp', 'Analista A');
    celda('pat_1_muestra', 'Camarón 1');
    await H.syncPat();
    H.renderPatNuevo(); campo('pat-fm', D2);
    respuestas = [true];
    expect(H.savePatLocal()).toBe(1);   // la anulación de D1 espera al siguiente envío
  };

  it('🔴 su clave es de la app: el respaldo la incluye (antes, no)', async () => {
    await corregirSinEnviar();
    expect(H.LAB_ANULAR_KEY.startsWith(H.PRE)).toBe(true);
    expect(H._allAppStorageKeys()).toContain(H.LAB_ANULAR_KEY);
  });

  it('🔴 lo guardado con el nombre viejo pasa al nuevo y sale con el siguiente envío', async () => {
    await corregirSinEnviar();
    const v = almacen.getItem(H.LAB_ANULAR_KEY);
    almacen.removeItem(H.LAB_ANULAR_KEY);
    almacen.setItem('lab_anular_v1', v);                 // como lo dejó la versión del 06-11
    H._lastSyncFingerprint.clear();
    await H.syncPat();
    expect(anuladas(ultimo(), H.PAT_SHEET_HEADERS)).toHaveLength(1);
    expect(almacen.getItem('lab_anular_v1')).toBeNull();
    expect(pendientes().pat).toBeUndefined();
  });
});
