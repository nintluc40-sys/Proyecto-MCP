// @vitest-environment happy-dom
/* ============================================================
   DESINFECCIÓN · LO QUE VUELVE A «—» TAMBIÉN SE CORRIGE EN LA HOJA (A10, 2026-11-06)

   LO QUE PASABA: «Registro_Desinfección» se escribe por llave (Fecha+Módulo+Tipo+Categoría+Elemento, upsert), y el envío
   sólo llevaba los elementos con estado u observación propia. Uno marcado «Sí», enviado, y vuelto a «—» después, no
   viajaba: la hoja se quedaba con su «Sí».

   AHORA (usuario: «Sin tocar el Apps Script»): se anota, por módulo y fecha, lo que viaja con contenido; si después falta,
   viaja EN BLANCO y la fila de la hoja queda en «—». Lo que ya viajó en blanco se olvida. Por los tres caminos de envío:
   ☁️ de la ficha, 🔄 de hoy y 🔄 de los días anteriores.

   Motor REAL sobre el shell real; la red, simulada. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['saveE', 'syncOneFicha', 'syncAll', '_previasEnviarFichas', 'DX_ENV_KEY', 'PRE', '_invalidateLoadE', '_lastSyncFingerprint'];
const H = {};
const envios = [];

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
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast(() => {});
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
});

const MOD = 1;
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const HOY = iso(new Date());
const AYER = iso(new Date(Date.now() - 864e5));
const RES = 'dx_1_materiales_0';   // Tipo 1 · Materiales · «Reservorio»
const LIN = 'dx_1_materiales_1';   // Tipo 1 · Materiales · «Líneas de agua»
const BOT = 'dx_1_personal_0';     // Tipo 1 · Personal · «Botas»
const ficha = (extra) => ({ fecha: HOY, corrida: '601', ...extra });
const desinf = () => envios.filter((e) => e.sheetName === 'Registro_Desinfección');
const ultimo = () => desinf().at(-1);
/** La fila del elemento en el envío, o undefined: [Estado, Observaciones]. */
const fila = (env, elem) => { const r = env.rows.find((x) => x[5] === elem); return r && [r[6], r[7]]; };
const enviarHoy = async (data) => { H.saveE(MOD, 'desinfeccion', data, false); await H.syncOneFicha('desinfeccion'); };

beforeEach(() => {
  almacen.clear();
  H._invalidateLoadE();
  envios.length = 0;
  H._lastSyncFingerprint.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
  H.setVista(MOD, 'desinfeccion');
});
afterEach(() => { vi.useRealTimers(); });

describe('A10 · Desinfección: lo que vuelve a «—»', () => {
  it('🔴 un elemento enviado «Sí» y vuelto a «—» viaja EN BLANCO (antes no viajaba y la hoja seguía en «Sí»)', async () => {
    await enviarHoy(ficha({ [RES + '_estado']: 'Sí', [LIN + '_estado']: 'No' }));
    expect(fila(ultimo(), 'Reservorio')).toEqual(['Sí', '']);
    await enviarHoy(ficha({ [LIN + '_estado']: 'No' }));
    expect(desinf()).toHaveLength(2);
    expect(fila(ultimo(), 'Reservorio')).toEqual(['', '']);
    expect(fila(ultimo(), 'Líneas de agua')).toEqual(['No', '']);
    expect(ultimo().rows.find((x) => x[5] === 'Reservorio').slice(0, 2)).toEqual([HOY, 'M01']);   // la MISMA llave de la hoja
  });

  it('lo que ya viajó en blanco se olvida: el envío siguiente no lo repite', async () => {
    await enviarHoy(ficha({ [RES + '_estado']: 'Sí', [LIN + '_estado']: 'No' }));
    await enviarHoy(ficha({ [LIN + '_estado']: 'No' }));
    await enviarHoy(ficha({ [LIN + '_estado']: 'Sí' }));
    expect(fila(ultimo(), 'Reservorio')).toBeUndefined();
  });

  it('🔴 con todo vuelto a «—», se envía igual: la hoja se vacía de ese día (antes, «no se envió nada»)', async () => {
    await enviarHoy(ficha({ [RES + '_estado']: 'Sí', [BOT + '_obs']: 'Lavadas dos veces' }));
    await enviarHoy(ficha({}));
    expect(desinf()).toHaveLength(2);
    expect(fila(ultimo(), 'Reservorio')).toEqual(['', '']);
    expect(fila(ultimo(), 'Botas')).toEqual(['', '']);
  });

  it('una observación propia también es contenido: al borrarla, viaja en blanco', async () => {
    await enviarHoy(ficha({ [BOT + '_obs']: 'Lavadas dos veces' }));
    expect(fila(ultimo(), 'Botas')).toEqual(['', 'Lavadas dos veces']);
    await enviarHoy(ficha({ [LIN + '_estado']: 'Sí' }));
    expect(fila(ultimo(), 'Botas')).toEqual(['', '']);
  });

  it('lo de una fecha no se manda en blanco en otra', async () => {
    await enviarHoy(ficha({ fecha: AYER, [RES + '_estado']: 'Sí' }));
    await enviarHoy(ficha({ [LIN + '_estado']: 'Sí' }));
    expect(fila(ultimo(), 'Reservorio')).toBeUndefined();
  });

  it('🔴 también por 🔄 de los días ANTERIORES', async () => {
    const clave = H.PRE + 'M01_desinfeccion_' + AYER;
    const guardar = (data) => {
      almacen.setItem(clave, JSON.stringify({ mod: MOD, ficha: 'desinfeccion', date: AYER, savedAt: 1, updatedAt: Date.now(), synced: false, data }));
      H._invalidateLoadE();
    };
    guardar({ fecha: AYER, corrida: '601', [RES + '_estado']: 'Sí', [LIN + '_estado']: 'No' });
    await H._previasEnviarFichas(MOD, 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
    expect(fila(ultimo(), 'Reservorio')).toEqual(['Sí', '']);
    H._lastSyncFingerprint.clear();
    guardar({ fecha: AYER, corrida: '601', [LIN + '_estado']: 'No' });
    await H._previasEnviarFichas(MOD, 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
    expect(fila(ultimo(), 'Reservorio')).toEqual(['', '']);
  });

  it('🔴 y por 🔄 de hoy (syncAll)', async () => {
    H.saveE(MOD, 'desinfeccion', ficha({ [RES + '_estado']: 'Sí' }), false);
    await H.syncAll();
    expect(fila(ultimo(), 'Reservorio')).toEqual(['Sí', '']);
    H._lastSyncFingerprint.clear();
    H.saveE(MOD, 'desinfeccion', ficha({ [LIN + '_estado']: 'Sí' }), false);
    await H.syncAll();
    expect(fila(ultimo(), 'Reservorio')).toEqual(['', '']);
  });
});
