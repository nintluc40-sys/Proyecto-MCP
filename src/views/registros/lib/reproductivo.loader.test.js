/* ============================================================
   REGISTROS · Maduración · lector de las hojas del Registro Reproductivo
   Cubre el bloque de LECTURA que vive en el monolito `public/registros/engine.js`
   (fuera del alcance de los módulos ES). Primer test que toca el monolito.

   Por qué existe: el 2026-08-12 se midió el despliegue real y el endpoint ?p=rows
   respondía entre 2 s y 52 s para la MISMA hoja, devolviendo de forma intermitente
   una página HTML de error (HTTP 404) en lugar de JSON. El lector anterior pedía las
   3 hojas con Promise.all, timeout de 15 s, sin comprobar r.ok y sin reintentos:
   falló 4 de 4 veces contra producción y dejaba el registro de desoves bloqueado con
   un mensaje que culpaba al token. Estas pruebas fijan el contrato del lector nuevo.

   Método: NO se prueba una copia del código. Se EXTRAE el bloque real del archivo por
   anclas de texto y se ejecuta en un sandbox `vm` con fetch/localStorage/DOM simulados,
   de modo que el test se entera si alguien cambia el fuente.
   ⚠ En un `vm` los `const` no se adhieren al contexto: se exponen al final del script.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const START = 'const _REPRO_SHEETS = {';
const END = '  else _reproPaintMatrixBanner();\n}';

/** Bloque REAL del monolito, aislado por anclas de texto. */
function extractLoader() {
  const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');
  const i = src.indexOf(START);
  const j = src.indexOf(END, i);
  if (i < 0 || j < 0) throw new Error('Anclas del lector reproductivo no encontradas en engine.js');
  return src.slice(i, j + END.length);
}

const HTML_404 = '<!DOCTYPE html><html><title>No se encontró la página</title></html>';
const okBody = (n) => JSON.stringify({
  ok: true,
  rows: Array.from({ length: n }, (_, i) => ({
    'Trovan ID': '00082' + String(i).padStart(5, '0'),
    'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo',
  })),
});

/** Sandbox con red guionizada: cada fetch consume un paso de `net`. */
function sandbox(code, net, opts = {}) {
  const store = { ...(opts.localStorage || {}) };
  const calls = [];
  const ctx = {
    console, setTimeout, clearTimeout, AbortController,
    Promise, JSON, Date, Math, String, Number, Object, Array, Error, RegExp, Boolean,
    _sleep: () => new Promise((r) => setTimeout(r, 0)),
    gasUrl: () => 'https://script.google.com/macros/s/AAA/exec',
    isValidGasUrl: () => true,
    gcfg: (_k, d) => d,
    safeSetItem: (k, v) => { store[k] = v; },
    escapeHtml: (s) => String(s),
    toast: () => {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    },
    document: { getElementById: () => null },
    _reproSub: 'eventos',
    renderMadReproductivo: () => {},
    window: {
      __rgLib: {
        reproReadSheet: () => (opts.storeRows || []),
        matrixIndexFromRows: (rows) => new Map((rows || []).map((r) => [r['Trovan ID'], r])),
      },
    },
    fetch: async (url) => {
      const step = net.shift();
      if (!step) throw new Error('guion de red agotado: ' + url);
      calls.push(url);
      if (step.abort) {
        const e = new Error('aborted'); e.name = 'AbortError';
        return await new Promise((_res, rej) => setTimeout(() => rej(e), 0));
      }
      return { ok: step.ok !== false, status: step.status || 200, text: async () => step.body };
    },
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + `
    ;globalThis.__api = {
      _reproFetchSheet, _reproEnsureMatrix, _reproLoadSheets, _reproMatrixIndex, _reproReadRows,
      _REPRO_SHEETS,
      origen: _reproMatrixOrigen,
      get state(){ return _reproSheetsState; },
      get err(){ return _reproSheetsErr; },
    };`).runInContext(ctx);
  return { api: ctx.__api, ctx, store, calls };
}

const caido = () => [{ ok: false, status: 404, body: HTML_404 }, { ok: false, status: 404, body: HTML_404 }];
const cacheCon = (edadMs, filas = 1) => JSON.stringify({
  ts: Date.now() - edadMs,
  rows: Array.from({ length: filas }, (_, i) => ({
    'Trovan ID': '000821AFF' + i, 'Sala actual': 'S2', 'Tanque actual': 'T9', 'Estado': 'Vivo',
  })),
});

let code;
beforeAll(() => { code = extractLoader(); });

describe('registros · lector del reproductivo · respuestas anómalas del GAS', () => {
  it('un 404 con página HTML da un motivo legible, no un error de parseo', async () => {
    const { api } = sandbox(code, caido());
    await expect(api._reproFetchSheet('Maduración MATRIZ', null)).rejects.toThrow(/HTTP 404/);
  });

  it('un HTTP 200 cuyo cuerpo es HTML se detecta ANTES de JSON.parse', async () => {
    // Caso medido en producción: el usuario recibía "Unexpected token '<'".
    const net = [{ ok: true, status: 200, body: HTML_404 }, { ok: true, status: 200, body: HTML_404 }];
    const { api } = sandbox(code, net);
    await expect(api._reproFetchSheet('X', null)).rejects.toThrow(/página de error/);
  });

  it('reintenta: si el primer intento falla, el segundo entrega las filas', async () => {
    const { api } = sandbox(code, [{ ok: false, status: 404, body: HTML_404 }, { body: okBody(3) }]);
    await expect(api._reproFetchSheet('M', null)).resolves.toHaveLength(3);
  });

  it('un timeout se traduce a "Google no respondió", no a AbortError', async () => {
    const { api } = sandbox(code, [{ abort: true }, { abort: true }]);
    await expect(api._reproFetchSheet('M', null)).rejects.toThrow(/no respondió/);
  });
});

describe('registros · lector del reproductivo · caché local de la MATRIZ', () => {
  it('una lectura buena deja copia local para el próximo corte de red', async () => {
    const { api, store } = sandbox(code, [{ body: okBody(5) }]);
    await api._reproEnsureMatrix();
    expect(api.origen()).toBe('red');
    expect(JSON.parse(store['larv4_mad_matriz']).rows).toHaveLength(5);
  });

  it('con la red caída y copia reciente SE PUEDE seguir registrando', async () => {
    const { api } = sandbox(code, caido(), { localStorage: { 'larv4_mad_matriz': cacheCon(3600e3) } });
    await api._reproEnsureMatrix();
    expect(api.state).toBe('ready');
    expect(api.origen()).toBe('cache');
    expect(api._reproMatrixIndex().size).toBe(1); // hay índice → buildEventBatch puede construir
  });

  it('una copia de más de 15 días NO se usa: caduca', async () => {
    const { api } = sandbox(code, caido(), { localStorage: { 'larv4_mad_matriz': cacheCon(20 * 24 * 3600e3) } });
    await api._reproEnsureMatrix();
    expect(api.state).toBe('error');
    expect(api.origen()).toBe('');
  });

  it('sin red y sin copia, el motivo es real y NO culpa al token', async () => {
    const { api } = sandbox(code, caido());
    await api._reproEnsureMatrix();
    expect(api.state).toBe('error');
    expect(api.err).toMatch(/HTTP 404/);
    expect(api.err).not.toMatch(/token/i);
  });
});

describe('registros · lector del reproductivo · alcance y tolerancia', () => {
  it('registrar un evento pide SOLO la MATRIZ, no las 3 hojas', async () => {
    // Guion holgado a propósito: con una sola respuesta, una petición de más fallaría
    // por agotamiento y el test pasaría por el motivo equivocado.
    const { api, calls } = sandbox(code, [{ body: okBody(2) }, { body: okBody(2) }, { body: okBody(2) }]);
    await api._reproEnsureMatrix();
    expect(calls).toHaveLength(1);
    expect(decodeURIComponent(calls[0])).toMatch(/MATRIZ/);
  });

  it('proyecta las columnas que realmente usa (392 KB → 65 KB)', async () => {
    const { api, calls } = sandbox(code, [{ body: okBody(2) }]);
    await api._reproEnsureMatrix();
    const u = decodeURIComponent(calls[0]);
    expect(u).toMatch(/cols=/);
    ['Trovan ID', 'Sala actual', 'Tanque actual', 'Estado'].forEach((c) => expect(u).toContain(c));
  });

  it('si cae la Bitácora pero la MATRIZ llega, la sección sigue utilizable', async () => {
    const net = [
      { body: okBody(4) },                                                     // MATRIZ ok
      { ok: false, status: 404, body: HTML_404 }, { ok: false, status: 404, body: HTML_404 }, // Bitácora cae
      { body: JSON.stringify({ ok: true, rows: [] }) },                        // Transferencias ok
    ];
    const { api } = sandbox(code, net);
    await api._reproLoadSheets();
    expect(api.state).toBe('ready');
    expect(api._reproReadRows('Maduración MATRIZ')).toHaveLength(4);
    expect(api.err).toMatch(/Bit/); // se informa QUÉ falló, sin tumbar el resto
  });

  it('si el store del dashboard ya trae la MATRIZ, no se toca la red', async () => {
    const storeRows = [{ 'Trovan ID': '000821AFF4', 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo' }];
    // Guion con respuesta VÁLIDA a propósito: lo que se afirma es que no hubo NI UNA
    // llamada. Con el guion vacío el test pasaba por excepción, no por la regla.
    const { api, calls } = sandbox(code, [{ body: okBody(1) }], { storeRows });
    await api._reproEnsureMatrix();
    expect(calls).toHaveLength(0);
    expect(api.origen()).toBe('store');
  });
});

/* Hallazgos de la auditoría posterior a la implementación (2026-08-12). Cada uno
   se verificó por mutación antes de darlo por corregido. */
describe('registros · lector del reproductivo · auditoría', () => {
  it('el origen se DERIVA: si el tablero carga después, el aviso deja de decir "copia local"', async () => {
    const rows = [{ 'Trovan ID': '000821AFF4', 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo' }];
    let storeListo = false;
    const { api, ctx } = sandbox(code, caido(), {
      localStorage: { 'larv4_mad_matriz': JSON.stringify({ ts: Date.now() - 3600e3, rows }) },
    });
    ctx.window.__rgLib.reproReadSheet = () => (storeListo ? rows : []);
    await api._reproEnsureMatrix();
    expect(api.origen()).toBe('cache');   // red caída → copia local
    storeListo = true;                     // el dashboard termina de cargar
    expect(api.origen()).toBe('store');   // ...y el aviso deja de mentir
  });

  it('no pide la MATRIZ dos veces si la carga completa ya va en vuelo', async () => {
    const vacio = JSON.stringify({ ok: true, rows: [] });
    const { api, calls } = sandbox(code, [{ body: okBody(3) }, { body: vacio }, { body: vacio }]);
    const enVuelo = api._reproLoadSheets();      // sin await
    await api._reproEnsureMatrix();              // debe engancharse a la anterior
    await enVuelo;
    expect(calls.filter((u) => /MATRIZ/.test(decodeURIComponent(u)))).toHaveLength(1);
  });

  it('tras un fallo parcial, volver a entrar REINTENTA (no sirve lo incompleto para siempre)', async () => {
    const vacio = JSON.stringify({ ok: true, rows: [] });
    const net = [
      { body: okBody(2) }, { ok: false, status: 404, body: HTML_404 }, { ok: false, status: 404, body: HTML_404 },
      { body: vacio },
      { body: okBody(2) }, { body: JSON.stringify({ ok: true, rows: [{ 'Trovan ID': 'X' }] }) }, { body: vacio },
    ];
    const { api } = sandbox(code, net);
    await api._reproLoadSheets();
    expect(api._reproReadRows('Maduración Bitácora')).toHaveLength(0); // cayó
    await api._reproLoadSheets();                                      // SIN force
    expect(api._reproReadRows('Maduración Bitácora')).toHaveLength(1); // reintentó
    expect(api.err).toBe('');
  });
});
