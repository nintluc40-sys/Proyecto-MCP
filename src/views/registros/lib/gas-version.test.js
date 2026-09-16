// @vitest-environment happy-dom
/* ============================================================
   GAS · LA PRUEBA DE VERSIÓN (D8, 2026-09-13)

   Hasta hoy NO había forma de saber qué GAS está desplegado. Se deducía por efectos
   secundarios —«si esta hoja responde "Hoja no permitida", es el viejo»— y dos veces el
   punto de guardado afirmó un estado del despliegue que nadie había medido.

   Ahora `?p=ver` devuelve un SELLO, y el sello no puede mentir por construcción:
     · es la HUELLA (sha-256, 12 caracteres) del resto de `GAS/Code.gs`;
     · esta prueba lo recalcula, así que tocar el GAS sin actualizarlo pone la suite en rojo
       —y el mensaje dice el sello nuevo—;
     · y comprueba que el código que el usuario COPIA desde ⚙ Config es `Code.gs` byte a byte,
       así que el sello de la app y el del repo son el mismo.
   «Probar conexión» compara el sello desplegado con el de la app y dice si hay que volver a
   desplegar. Es la única vía que tiene el usuario de verificarlo sin herramientas.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContext, Script } from 'node:vm';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const CODE = join(process.cwd(), 'GAS/Code.gs');
const leer = (f) => readFileSync(f, 'utf8').split('\r\n').join('\n');
const code = leer(CODE);
const engine = leer(ENGINE);

const LINEA = /\nconst GAS_VERSION = "([0-9a-f]*)";\n/;
const selloDeclarado = () => { const m = code.match(LINEA); return m ? m[1] : null; };
const huella = (texto) => createHash('sha256')
  .update(texto.replace(LINEA, '\nconst GAS_VERSION = "";\n'), 'utf8').digest('hex').slice(0, 12);

describe('GAS · el sello de versión no puede quedarse atrás', () => {
  it('Code.gs declara un sello de 12 caracteres', () => {
    expect(selloDeclarado(), 'falta «const GAS_VERSION = "…";» en Code.gs').toMatch(/^[0-9a-f]{12}$/);
  });

  it('🔴 el sello ES la huella del resto del archivo', () => {
    const esperado = huella(code);
    expect(selloDeclarado(),
      'Code.gs cambió y su sello no. Pon GAS_VERSION = "' + esperado + '" en Code.gs y en las plantillas GAS() de engine.js e index (8)')
      .toBe(esperado);
  });

  it('🔑 lo que el usuario copia desde la app ES Code.gs, byte a byte', () => {
    /* Si la plantilla y el archivo se separan, el usuario despliega un código distinto del
       que dice el sello — y la prueba de versión mentiría. */
    const a = '  _gasCache = `';
    const i = engine.indexOf(a) + a.length;
    const j = engine.indexOf('`;\n  return _gasCache;', i);
    const folder = engine.match(/\nconst EV_FOLDER_ID = "([^"]+)";/)[1];
    const token = engine.match(/\nconst EV_TOKEN {5}= "([^"]+)";/)[1];
    const render = new Function('EV_FOLDER_ID', 'EV_TOKEN', 'return `' + engine.slice(i, j) + '`;')(folder, token);
    expect(render === code, 'la plantilla GAS() de engine.js ya no rinde Code.gs').toBe(true);
  });

  it('?p=ver responde el sello sin pedir token y sin abrir ninguna hoja', () => {
    const ctx = {
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ texto: s, setMimeType() { return this; } }) },
      SpreadsheetApp: { openById() { throw new Error('?p=ver no puede abrir hojas'); } },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'token-activo' }) },
      CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
      console: { error() {} },
    };
    ctx.globalThis = ctx;
    createContext(ctx);
    new Script(code + '\n;globalThis.__get = doGet;').runInContext(ctx);
    const r = ctx.__get({ parameter: { p: 'ver' } });
    // Y lo que sabe hacer. 2026-09-15 · «mad-alimentacion»: la ficha de Alimentación no envía a un
    // GAS que no conoce su hoja. 2026-09-16 · «matriz-cuaterna» SUSTITUYE a «matriz-reciclaje»:
    // la MATRIZ se llavea por (Trovan · Piscina · Código genético · Lote), así que el mismo chip
    // admite varios individuos. La capacidad cambia de nombre porque nombra OTRA regla.
    expect(JSON.parse(r.texto)).toEqual({ ok: true, version: selloDeclarado(), caps: ['matriz-cuaterna', 'mad-alimentacion'] });
    // y la raíz sigue igual: es la que usa la comprobación de conexión de siempre
    expect(ctx.__get({ parameter: {} }).texto).toBe('FichasLarv-OK');
  });
});

/* ── El cliente: «🔗 Probar conexión» dice si el GAS desplegado es el de la app ── */
const H = {};
const avisos = [];
let respuestas = {};

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
  const EXPORTAR = ['testConn', '_gasVersionLocal'];
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  /* fetch falso: la raíz y ?p=ver responden lo que diga cada caso. */
  globalThis.fetch = async (url) => {
    const clave = String(url).includes('p=ver') ? 'ver' : 'raiz';
    const r = respuestas[clave];
    if (r instanceof Error) throw r;
    return { text: async () => r };
  };
});

const URL_GAS = 'https://script.google.com/macros/s/AKfycbPRUEBA/exec';
beforeEach(() => {
  avisos.length = 0;
  document.getElementById('cfg-url').value = URL_GAS;
});
const ultimo = () => avisos[avisos.length - 1] || { msg: '', tipo: '' };

describe('Config · «Probar conexión» compara el GAS desplegado con el de la app (D8)', () => {
  it('la app conoce su propio sello, y es el de Code.gs', () => {
    expect(H._gasVersionLocal()).toBe(selloDeclarado());
  });

  it('el fixture ejerce algo: con el MISMO sello dice que está al día', async () => {
    respuestas = { raiz: 'FichasLarv-OK', ver: JSON.stringify({ ok: true, version: selloDeclarado() }) };
    await H.testConn();
    expect(ultimo().tipo).toBe('ok');
    expect(ultimo().msg).toContain(selloDeclarado());
  });

  it('🔴 con OTRO sello avisa de que hay que volver a desplegar, y nombra los dos', async () => {
    respuestas = { raiz: 'FichasLarv-OK', ver: JSON.stringify({ ok: true, version: 'aaaaaaaaaaaa' }) };
    await H.testConn();
    expect(ultimo().tipo).toBe('warn');
    expect(ultimo().msg).toContain('aaaaaaaaaaaa');
    expect(ultimo().msg).toContain(selloDeclarado());
    expect(ultimo().msg).toContain('vuelve a desplegarlo');
  });

  it('🔴 un GAS anterior a la prueba de versión (responde texto en ?p=ver) también manda a desplegar', async () => {
    respuestas = { raiz: 'FichasLarv-OK', ver: 'FichasLarv-OK' };
    await H.testConn();
    expect(ultimo().tipo).toBe('warn');
    expect(ultimo().msg).toContain('anterior a la prueba de versión');
  });

  it('si ?p=ver no responde, NO afirma nada del despliegue: pide reintentar', async () => {
    respuestas = { raiz: 'FichasLarv-OK', ver: new Error('sin red') };
    await H.testConn();
    expect(ultimo().tipo).toBe('warn');
    expect(ultimo().msg).toContain('no se pudo comprobar');
    expect(ultimo().msg).not.toContain('vuelve a desplegarlo');
  });

  it('una raíz que no es el GAS sigue diciéndose como antes, sin preguntar la versión', async () => {
    respuestas = { raiz: '<html>login de Google</html>', ver: new Error('no debería llegar aquí') };
    await H.testConn();
    expect(ultimo().msg).toContain('Respuesta:');
  });

  it('los avisos no duplican el icono que ya pone toast()', async () => {
    respuestas = { raiz: 'FichasLarv-OK', ver: JSON.stringify({ ok: true, version: selloDeclarado() }) };
    await H.testConn();
    expect(ultimo().msg.startsWith('✅')).toBe(false);
  });
});
