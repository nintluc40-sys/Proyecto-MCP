// @vitest-environment happy-dom
/* ============================================================
   EL «SÍ» DEL GAS SE RECUERDA 30 MIN (punto 2a · corrección C, 2026-09-24)

   Dieciséis sitios preguntaban ?p=ver antes de actuar, y con el GAS de producción medido el 09-24 (3–45 s, 7 de 11
   fallos) casi nunca contestaba a tiempo: el envío iba a la cola «sin enviar» y cada pregunta cargaba más a un GAS
   saturado. Decisiones del usuario: cuando el GAS CONFIRMA que es el de esta app se recuerda 30 MIN, también al
   recargar (en el dispositivo, con su hora, para ESE GAS y ESTA versión de la app). Sólo el «sí»; un «no» o un
   silencio se vuelven a preguntar. Un rechazo de ENTORNO lo olvida: es la señal de que el GAS cambió.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_madIngGasAlDia', '_postOnce', 'MAD_GAS_OK_KEY', 'MAD_GAS_OK_MS', '_gasVersionLocal'];
const H = {};
const URL_GAS = 'https://script.google.com/macros/s/AKfycbPRUEBA/exec';
let respuestaVer = null;
let respuestaPost = null;
let preguntas = 0;

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  const _ric = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (fn) => { fn(); return 1; };   // la limpieza de arranque, ANTES de las pruebas
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  globalThis.requestIdleCallback = _ric;
  H.setToast(() => {});
  H.setGasUrl(() => URL_GAS);
  globalThis.fetch = async (url, opts) => {
    if (opts && opts.method === 'POST') return { ok: true, status: 200, text: async () => JSON.stringify(respuestaPost) };
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    preguntas++;
    if (respuestaVer === 'red') throw new Error('sin red');
    return { ok: true, status: 200, text: async () => (typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer)) };
  };
});

const guardado = () => JSON.parse(localStorage.getItem(H.MAD_GAS_OK_KEY) || 'null');
beforeEach(() => {
  localStorage.removeItem(H.MAD_GAS_OK_KEY);
  preguntas = 0;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };
});

describe('El «sí» del GAS · se recuerda', () => {
  it('🔴 tras un «sí», durante 30 min no se vuelve a preguntar (aunque el GAS ya no conteste)', async () => {
    expect(await H._madIngGasAlDia()).toBe(true);
    expect(preguntas).toBe(1);
    respuestaVer = 'red';
    expect(await H._madIngGasAlDia(), 'recordado').toBe(true);
    expect(await H._madIngGasAlDia()).toBe(true);
    expect(preguntas, 'ninguna pregunta más').toBe(1);
  });

  it('🔴 se guarda EN EL DISPOSITIVO, para ESE GAS y ESTA versión de la app, con su hora (sobrevive a recargar)', async () => {
    const antes = Date.now();
    await H._madIngGasAlDia();
    const g = guardado();
    expect([g.url, g.sello]).toEqual([URL_GAS, H._gasVersionLocal()]);
    expect(g.ts).toBeGreaterThanOrEqual(antes);
  });

  it('🔴 a los 30 min VENCE y se vuelve a preguntar', async () => {
    expect(H.MAD_GAS_OK_MS, 'decisión del usuario: 30 minutos').toBe(30 * 60 * 1000);
    localStorage.setItem(H.MAD_GAS_OK_KEY, JSON.stringify({ url: URL_GAS, sello: H._gasVersionLocal(), ts: Date.now() - H.MAD_GAS_OK_MS - 1000 }));
    respuestaVer = 'red';
    expect(await H._madIngGasAlDia()).toBe(null);
    expect(preguntas).toBe(1);
    localStorage.setItem(H.MAD_GAS_OK_KEY, JSON.stringify({ url: URL_GAS, sello: H._gasVersionLocal(), ts: Date.now() - H.MAD_GAS_OK_MS + 60000 }));
    expect(await H._madIngGasAlDia(), 'a falta de un minuto, aún vale').toBe(true);
    expect(preguntas).toBe(1);
  });

  it('🔴 lo recordado para OTRO GAS u OTRA versión de la app no vale: se pregunta', async () => {
    localStorage.setItem(H.MAD_GAS_OK_KEY, JSON.stringify({ url: 'https://script.google.com/macros/s/AKfycbOTRO/exec', sello: H._gasVersionLocal(), ts: Date.now() }));
    respuestaVer = 'red';
    expect(await H._madIngGasAlDia()).toBe(null);
    localStorage.setItem(H.MAD_GAS_OK_KEY, JSON.stringify({ url: URL_GAS, sello: '000000000000', ts: Date.now() }));
    expect(await H._madIngGasAlDia()).toBe(null);
    expect(preguntas).toBe(2);
  });

  it('🔴 sólo se recuerda el «sí»: un «no», el GAS viejo o un silencio se vuelven a preguntar', async () => {
    for (const r of [{ ok: true, version: 'abc123def456' }, 'FichasLarv-OK', 'red']) {
      respuestaVer = r;
      await H._madIngGasAlDia();
      expect(guardado(), JSON.stringify(r)).toBeNull();
    }
    respuestaVer = { ok: true, version: H._gasVersionLocal() };
    expect(await H._madIngGasAlDia()).toBe(true);
    expect(preguntas).toBe(4);
  });
});

describe('El «sí» del GAS · lo olvida un rechazo de ENTORNO', () => {
  it('🔴 un envío rechazado por su entorno («Esquema desactualizado», «Hoja no permitida»…) lo olvida', async () => {
    for (const m of ['Esquema desactualizado en «X» (columna 3)', 'Hoja no permitida', 'Límite de columnas excedido']) {
      await H._madIngGasAlDia();
      expect(guardado()).not.toBeNull();
      respuestaPost = { status: 'error', message: m };
      expect(await H._postOnce({ sheetName: 'X', rows: [] }, URL_GAS, {})).toBe('rejected');
      expect(guardado(), m).toBeNull();
    }
  });

  it('🔴 un rechazo por los DATOS no lo olvida (el GAS es el mismo)', async () => {
    await H._madIngGasAlDia();
    respuestaPost = { status: 'error', message: 'Formato inválido' };
    expect(await H._postOnce({ sheetName: 'X', rows: [] }, URL_GAS, {})).toBe('rejected');
    expect(guardado()).not.toBeNull();
    respuestaPost = { status: 'ok' };
    expect(await H._postOnce({ sheetName: 'X', rows: [] }, URL_GAS, {})).toBe('ok');
    expect(guardado(), 'ni un envío bueno').not.toBeNull();
  });
});
