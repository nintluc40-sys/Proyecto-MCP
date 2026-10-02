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

/** Sandbox con red guionizada: cada fetch consume un paso de `net`.
 *  1c (2026-09-22) · un paso `{ red: true }` es un CORTE (el TypeError «Failed to fetch» de fetch); `tarda` adelanta el
 *  reloj de `opts.reloj` antes de contestar, y `sleeps` anota cada espera pedida entre intentos (que aquí no espera). */
function sandbox(code, net, opts = {}) {
  const store = { ...(opts.localStorage || {}) };
  const calls = [];
  const sleeps = [];
  const reloj = opts.reloj;
  const RelojDate = reloj ? class extends Date { static now() { return reloj.t; } } : Date;
  const ctx = {
    console, setTimeout, clearTimeout, AbortController,
    Promise, JSON, Date: RelojDate, Math, String, Number, Object, Array, Error, RegExp, Boolean,
    ...(opts.navigator ? { navigator: opts.navigator } : {}),
    _sleep: (ms) => { sleeps.push(ms); return new Promise((r) => setTimeout(r, 0)); },
    gasUrl: () => 'https://script.google.com/macros/s/AAA/exec',
    // D (2026-09-24) · el lector prueba antes la exportación de Google, pero sólo con el GAS de producción y desde una
    // página https (`_exportPuede`). Éstas son las pruebas del camino del GAS: página http, como las de happy-dom. La
    // exportación la cubre lectura-exportacion.test.js.
    DEFAULT_GAS_URL: 'https://script.google.com/macros/s/AAA/exec',
    location: { protocol: 'http:' },
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
      if (step.tarda && reloj) reloj.t += step.tarda;
      if (step.red) throw new TypeError('Failed to fetch');
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
      _REPRO_SHEETS, _REPRO_MATRIZ_COLS, _reproMatrixBannerHTML,
      origen: _reproMatrixOrigen,
      get state(){ return _reproSheetsState; },
      get err(){ return _reproSheetsErr; },
    };`).runInContext(ctx);
  return { api: ctx.__api, ctx, store, calls, sleeps };
}

/* Punto 5 (2026-10-01) · un 404 es un fallo de ENTREGA de Google y se reintenta hasta 4 veces: «el GAS no entrega» son 4. */
const caido = () => [{ ok: false, status: 404, body: HTML_404 }, { ok: false, status: 404, body: HTML_404 }, { ok: false, status: 404, body: HTML_404 }, { ok: false, status: 404, body: HTML_404 }];
/* RD1 (2026-09-16) · la copia anota qué columnas guardó (`cols`), y sin las que hoy se leen no se usa. Se
   sacan del propio motor: si un día se lee una columna más, estas copias siguen siendo «de ahora». */
const colsDelMotor = () => JSON.parse(/const _REPRO_MATRIZ_COLS = (\[[^\]]*\]);/.exec(code)[1]);
const cacheCon = (edadMs, filas = 1, cols = colsDelMotor()) => JSON.stringify({
  ts: Date.now() - edadMs,
  cols,
  rows: Array.from({ length: filas }, (_, i) => ({
    'Trovan ID': '000821AFF' + i, 'Piscina': 'P1', 'Código genético': 'G01', 'Lote': 'L1',
    'Sala actual': 'S2', 'Tanque actual': 'T9', 'Estado': 'Vivo',
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
    const net = Array.from({ length: 4 }, () => ({ ok: true, status: 200, body: HTML_404 }));   // punto 5: 4 intentos
    const { api } = sandbox(code, net);
    await expect(api._reproFetchSheet('X', null)).rejects.toThrow(/página de error/);
  });

  it('reintenta: si el primer intento falla, el segundo entrega las filas', async () => {
    const { api } = sandbox(code, [{ ok: false, status: 404, body: HTML_404 }, { body: okBody(3) }]);
    await expect(api._reproFetchSheet('M', null)).resolves.toHaveLength(3);
  });

  it('un timeout se traduce a "Google no respondió", no a AbortError', async () => {
    const { api } = sandbox(code, [{ abort: true }, { abort: true }, { abort: true }, { abort: true }]); // punto 5: hasta 4
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

  /* 🔴 RD1 (2026-09-16) · la copia guardaba sólo Trovan, Sala, Tanque y Estado. Con Google caído, la
     mortalidad y el traslado salían de ella SIN piscina, código ni lote, y con la llave de la MATRIZ por
     cuaterna la hoja ganaba una fila suelta en vez de actualizar la de la hembra. */
  it('🔴 RD1 · la copia guarda la IDENTIDAD: justo las columnas que se leen, y anota cuáles', async () => {
    /* 2026-09-24 · la fila trae las dos FECHAS, como las devuelve ya el GAS (con la muerte en blanco, que es como llega
       la de una viva): desde ese día se piden, y la copia tiene que guardarlas o una copia de hoy nacería sin ellas. */
    const fila = { 'Trovan ID': '0007219380', 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20',
      'Sala actual': 'S3', 'Tanque actual': 'T4', 'Estado': 'Vivo', 'Fecha ingreso': '2026-08-01', 'Fecha muerte': '',
      'Observaciones': 'la manda un GAS que ignora «cols»' };
    const { api, store } = sandbox(code, [{ body: JSON.stringify({ ok: true, rows: [fila] }) }]);
    await api._reproEnsureMatrix();
    const copia = JSON.parse(store['larv4_mad_matriz']);
    expect(copia.cols).toEqual([...api._REPRO_MATRIZ_COLS]);
    expect(Object.keys(copia.rows[0]).sort()).toEqual([...api._REPRO_MATRIZ_COLS].sort());   // ni más (el peso) ni menos
    for (const c of ['Piscina', 'Código genético', 'Lote']) expect(copia.rows[0][c], c).toBe(fila[c]);
    expect(copia.rows[0]['Fecha ingreso'], 'y la fecha que decide de qué hembra es un evento').toBe('2026-08-01');
  });

  it('🔴 RD1 · una copia SIN la identidad no se usa por reciente que sea: la de antes, o a la que le falte una columna', async () => {
    const deAntes = JSON.stringify({ ts: Date.now() - 3600e3,
      rows: [{ 'Trovan ID': '000821AFF0', 'Sala actual': 'S2', 'Tanque actual': 'T9', 'Estado': 'Vivo' }] });
    const sinLote = cacheCon(3600e3, 1, colsDelMotor().filter((c) => c !== 'Lote'));
    /* 2026-09-24 · la que ya tienen los dispositivos al actualizar: sin las dos FECHAS. Decisión del usuario: no se usa,
       o en una copia así volvería a pasar lo de index (8) —la mortalidad atrasada de la anterior, a la nueva—. */
    const sinFechas = cacheCon(3600e3, 1, colsDelMotor().filter((c) => !c.startsWith('Fecha ')));
    for (const [caso, copia] of [['la de antes de RD1', deAntes], ['sin «Lote»', sinLote], ['sin las FECHAS (la de antes del 24-09)', sinFechas]]) {
      const { api } = sandbox(code, caido(), { localStorage: { 'larv4_mad_matriz': copia } });
      await api._reproEnsureMatrix();
      expect(api.state, caso).toBe('error');
      expect(api.origen(), caso).toBe('');
      expect(api._reproMatrixIndex(), caso).toBeNull();
    }
    // el fixture ejerce algo: la misma copia, con todas sus columnas, sí se usa
    const { api } = sandbox(code, caido(), { localStorage: { 'larv4_mad_matriz': cacheCon(3600e3) } });
    await api._reproEnsureMatrix();
    expect(api.origen()).toBe('cache');
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
      ...caido(),                                                              // Bitácora cae
      { body: JSON.stringify({ ok: true, rows: [] }) },                        // Transferencias ok
    ];
    const { api } = sandbox(code, net);
    await api._reproLoadSheets();
    expect(api.state).toBe('ready');
    expect(api._reproReadRows('Maduración MATRIZ')).toHaveLength(4);
    expect(api.err).toMatch(/Bit/); // se informa QUÉ falló, sin tumbar el resto
  });

  it('si el store del dashboard ya trae la MATRIZ, no se toca la red', async () => {
    const storeRows = [{ 'Trovan ID': '000721AFF4', 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo' }];
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
    const rows = [{ 'Trovan ID': '000721AFF4', 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo' }];
    let storeListo = false;
    const { api, ctx } = sandbox(code, caido(), {
      localStorage: { 'larv4_mad_matriz': JSON.stringify({ ts: Date.now() - 3600e3, cols: colsDelMotor(), rows }) },
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
      { body: okBody(2) }, ...caido(),
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

/* 🔴 1c (2026-09-22) · UN CORTE DE CONEXIÓN SE REINTENTA MÁS, Y SIN RED NO SE CULPA A GOOGLE. Lo reportó el usuario: la
   Consulta se quedaba en «Google no respondió: MATRIZ (Failed to fetch) · Bitácora (Failed to fetch) · Transferencias
   (Failed to fetch)». Decisiones del usuario: un corte, hasta 4 intentos con esperas de 1,5 · 3 · 6 s y un tope de 30 s;
   lo demás, 2 como antes; y sin red, «sin conexión a internet». */
describe('registros · lector del reproductivo · 1c · cortes de conexión y sin red', () => {
  const corte = { red: true };
  const sinRed = { onLine: false };

  it('🔴 un corte («Failed to fetch») se reintenta hasta 4 veces, con esperas de 1,5 · 3 · 6 s', async () => {
    const { api, calls, sleeps } = sandbox(code, [corte, corte, corte, { body: okBody(3) }]);
    await expect(api._reproFetchSheet('M', null)).resolves.toHaveLength(3);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1500, 3000, 6000]);
  });

  it('tras 4 cortes se rinde con el motivo del corte, y no pide un quinto', async () => {
    // Guion holgado a propósito: con cuatro pasos justos, un quinto intento fallaría por agotamiento y parecería la regla.
    const { api, calls } = sandbox(code, [corte, corte, corte, corte, { body: okBody(1) }]);
    await expect(api._reproFetchSheet('M', null)).rejects.toThrow(/Failed to fetch/);
    expect(calls).toHaveLength(4);
  });

  /* 2026-10-01 (punto 5) · el HTTP 404 y el timeout salieron de aquí: son fallos de ENTREGA de Google y van abajo. Lo que
     sigue en 2: un rechazo que no es de entrega (403: permiso o token). */
  it('lo que no es un corte ni un fallo de entrega sigue con 2 intentos', async () => {
    const no = (status) => ({ ok: false, status, body: HTML_404 });
    const casos = [
      ['HTTP 403', [no(403), no(403), no(403), no(403), { body: okBody(1) }], /HTTP 403/],
    ];
    for (const [caso, net, motivo] of casos) {
      const { api, calls, sleeps } = sandbox(code, net);
      await expect(api._reproFetchSheet('M', null), caso).rejects.toThrow(motivo);
      expect(calls, caso).toHaveLength(2);
      expect(sleeps, caso).toEqual([1500]);
    }
  });

  it('🔴 con tope: pasados 30 s leyendo no se empieza otro intento (y por debajo, sí)', async () => {
    const lento = sandbox(code, [{ red: true, tarda: 20000 }, { red: true, tarda: 15000 }, { body: okBody(1) }], { reloj: { t: 1e12 } });
    await expect(lento.api._reproFetchSheet('M', null)).rejects.toThrow(/Failed to fetch/);
    expect(lento.calls).toHaveLength(2);                      // 35 s leyendo: el tercero ya no sale
    // el fixture ejerce algo: los mismos cortes, más rápidos, sí llegan al tercer intento
    const rapido = sandbox(code, [{ red: true, tarda: 5000 }, { red: true, tarda: 5000 }, { body: okBody(1) }], { reloj: { t: 1e12 } });
    await expect(rapido.api._reproFetchSheet('M', null)).resolves.toHaveLength(1);
    expect(rapido.calls).toHaveLength(3);
  });

  /* 🔴 PUNTO 5 (2026-10-01) · LOS FALLOS DE ENTREGA DE GOOGLE SE REINTENTAN COMO LOS CORTES. Medido contra el GAS
     desplegado: el GAS se EJECUTA siempre bien (`/exec` → 302); lo que falla, de vez en cuando, es el segundo salto en el
     que Google entrega la respuesta (`script.googleusercontent.com`): un 404 —o una página en vez de datos— tras 20–40 s.
     Es puntual en cada petición (tras un fallo, el siguiente falla un 22 %), así que insistir SÍ sirve. Decisión del
     usuario: hasta 4 intentos, con las esperas de los cortes, y sin empezar otro pasados 90 s leyendo esa hoja. */
  describe('fallos de entrega de Google (404, 429, 5xx o una página en vez de datos)', () => {
    const p404 = { ok: false, status: 404, body: HTML_404 };
    it('🔴 se reintentan hasta 4 veces, con esperas de 1,5 · 3 · 6 s', async () => {
      const pagina = { ok: true, status: 200, body: HTML_404 };
      const { api, calls, sleeps } = sandbox(code, [p404, pagina, { ok: false, status: 503, body: '' }, { body: okBody(3) }]);
      await expect(api._reproFetchSheet('M', null)).resolves.toHaveLength(3);
      expect(calls).toHaveLength(4);
      expect(sleeps).toEqual([1500, 3000, 6000]);
    });

    it('un 429 también es de entrega', async () => {
      const { api, calls } = sandbox(code, [{ ok: false, status: 429, body: '' }, { ok: false, status: 429, body: '' }, { body: okBody(1) }]);
      await expect(api._reproFetchSheet('M', null)).resolves.toHaveLength(1);
      expect(calls).toHaveLength(3);
    });

    it('tras 4 se rinde con el motivo legible, y no pide un quinto', async () => {
      const { api, calls } = sandbox(code, [p404, p404, p404, p404, { body: okBody(1) }]);
      await expect(api._reproFetchSheet('M', null)).rejects.toThrow(/HTTP 404/);
      expect(calls).toHaveLength(4);
    });

    it('🔴 con tope de 90 s: pasados 90 s leyendo no se empieza otro intento (y por debajo, sí)', async () => {
      const lento = (ms) => ({ ...p404, tarda: ms });
      const largo = sandbox(code, [lento(40000), lento(40000), lento(15000), { body: okBody(1) }], { reloj: { t: 1e12 } });
      await expect(largo.api._reproFetchSheet('M', null)).rejects.toThrow(/HTTP 404/);
      expect(largo.calls).toHaveLength(3);                     // 95 s leyendo: el cuarto ya no sale
      // el fixture ejerce algo: con 35 s ya no habría pasado del primero si el tope fuera el de los cortes (30 s)
      const medio = sandbox(code, [lento(35000), lento(35000), { body: okBody(1) }], { reloj: { t: 1e12 } });
      await expect(medio.api._reproFetchSheet('M', null)).resolves.toHaveLength(1);
      expect(medio.calls).toHaveLength(3);
    });

    /* Y el «no respondió en 30 s» (decisión del usuario, cambia la del 1c): el 45 % de los 404 de entrega llega pasados
       30 s, y aquí se ven como un tiempo agotado. Con el tope de 90 s, como mucho 3 intentos de 30 s. */
    it('🔴 un «no respondió en 30 s» también es de entrega: se reintenta', async () => {
      const { api, calls, sleeps } = sandbox(code, [{ abort: true }, { abort: true }, { body: okBody(2) }]);
      await expect(api._reproFetchSheet('M', null)).resolves.toHaveLength(2);
      expect(calls).toHaveLength(3);
      expect(sleeps).toEqual([1500, 3000]);
    });

    it('🔴 tres «no respondió» de 30 s llegan al tope de 90 s: no sale un cuarto', async () => {
      const t30 = { abort: true, tarda: 30000 };
      const { api, calls } = sandbox(code, [t30, t30, t30, { body: okBody(1) }], { reloj: { t: 1e12 } });
      await expect(api._reproFetchSheet('M', null)).rejects.toThrow(/no respondió/);
      expect(calls).toHaveLength(3);
    });

    it('un error que da el propio GAS (no de entrega) sigue con 2', async () => {
      const gasNo = { body: JSON.stringify({ ok: false, error: 'Hoja no encontrada' }) };
      const { api, calls } = sandbox(code, [gasNo, gasNo, gasNo, { body: okBody(1) }]);
      await expect(api._reproFetchSheet('M', null)).rejects.toThrow(/Hoja no encontrada/);
      expect(calls).toHaveLength(2);
    });
  });

  it('🔴 sin red no se reintenta, y el motivo es «sin conexión a internet», no Google', async () => {
    const { api, calls, sleeps } = sandbox(code, [corte, { body: okBody(1) }], { navigator: sinRed });
    await expect(api._reproFetchSheet('M', null)).rejects.toThrow('sin conexión a internet');
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('sin red la lectura se INTENTA igual: `navigator.onLine` sólo decide no reintentar', async () => {
    const { api, calls } = sandbox(code, [{ body: okBody(2) }], { navigator: sinRed });
    await expect(api._reproFetchSheet('M', null)).resolves.toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it('sin red, la Consulta no reintenta ninguna de sus tres hojas', async () => {
    const { api, calls, sleeps } = sandbox(code, [corte, corte, corte, { body: okBody(1) }], { navigator: sinRed });
    await api._reproLoadSheets();
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([]);
    expect(api.err).toContain('sin conexión a internet');
  });

  it('🔴 el aviso de la copia local dice «sin conexión a internet» sin red, y «Google no respondió» con ella', async () => {
    const copia = { localStorage: { 'larv4_mad_matriz': cacheCon(3600e3) } };
    const off = sandbox(code, [corte], { ...copia, navigator: sinRed });
    await off.api._reproEnsureMatrix();
    expect(off.api.origen()).toBe('cache');
    expect(off.api._reproMatrixBannerHTML()).toContain('(sin conexión a internet)');
    expect(off.api._reproMatrixBannerHTML()).not.toContain('Google');
    const on = sandbox(code, [corte, corte, corte, corte], copia);   // con red, el que no contesta es Google
    await on.api._reproEnsureMatrix();
    expect(on.api.origen()).toBe('cache');
    expect(on.api._reproMatrixBannerHTML()).toContain('(Google no respondió: Failed to fetch)');
  });

  it('🔴 sin red y sin copia, el aviso lo dice y no culpa al servidor de Google (con red, sí)', async () => {
    const off = sandbox(code, [corte], { navigator: sinRed });
    await off.api._reproEnsureMatrix();
    expect(off.api.state).toBe('error');
    expect(off.api._reproMatrixBannerHTML()).toContain('sin conexión a internet');
    expect(off.api._reproMatrixBannerHTML()).toContain('Comprueba la conexión del dispositivo');
    expect(off.api._reproMatrixBannerHTML()).not.toContain('servidor de Google');
    const on = sandbox(code, [corte, corte, corte, corte]);
    await on.api._reproEnsureMatrix();
    expect(on.api._reproMatrixBannerHTML()).toContain('servidor de Google');
  });
});
