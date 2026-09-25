// @vitest-environment happy-dom
/* ============================================================
   D · SE LEE POR LA EXPORTACIÓN DE GOOGLE, CON EL GAS DE RESPALDO (punto 2a · corrección D, 2026-09-24)

   Medido ese día contra producción (sólo lectura): el GAS tardaba de 17 a 140 s por hoja y fallaba la mitad de las
   veces; la exportación, de 0,4 a 5 s. Pero gviz SOLO devuelve VACÍAS las celdas del tipo minoritario de una columna
   que mezcla números y texto (17 de las 50 «NNN/NNN» de Maduración Lotes) y, con una hoja que no existe, OTRA hoja sin
   avisar. Decisiones del usuario (las tres recomendadas): las DOS exportaciones combinadas —gviz con tipos y el CSV de
   la hoja—, para TODAS las lecturas, también justo después de guardar; el GAS de respaldo, y la confirmación de un chip
   dudoso (1a) por el GAS. Lo que se lee así tiene que ser EXACTAMENTE lo que daría ?p=rows.

   El Google de estas pruebas se porta como el medido: gviz deja en blanco lo minoritario y, por un nombre que no existe,
   responde con la hoja por defecto; el CSV trae el texto tal cual se ve.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_reproFetchSheet', '_reproMatrizFresca', 'madSaldoCargar', 'DEFAULT_GAS_URL', 'MAD_LIBRO_ID', '_EXPORT_MS', '_exportPos', '_exportFecha'];
const H = {};
const PAGINA = 'https://nintluc40-sys.github.io/Proyecto-MCP/';
const LOTES = 'Maduración Lotes';
const MATRIZ = 'Maduración MATRIZ';

/* ── La hoja de desoves tal como la ve Google ─────────────────────────────────────────────────────────────────────── */
const TABLA_LOTES = {
  cols: [
    { id: 'A', label: 'Fecha', type: 'date', pattern: 'dd/MM/yyyy' },
    { id: 'B', label: 'Lote', type: 'string' },
    { id: 'C', label: 'Código genético', type: 'string' },
    { id: 'D', label: 'Piscina Broodstock', type: 'number', pattern: 'General' },
    { id: 'E', label: 'Desoves', type: 'number', pattern: 'General' },
    { id: 'F', label: 'Fecha N2', type: 'datetime' },
    { id: 'G', label: ' Observaciones ', type: 'string' },
    { id: 'H', label: '', type: 'string' },
  ],
  rows: [
    // una pareja de piscinas («NNN/NNN») en una columna de números: gviz la deja en blanco (medido en producción)
    // (un texto VACÍO de gviz —p. ej. una fórmula que da ""— no es un valor que el CSV deba traer)
    { c: [{ v: 'Date(2026,7,25)', f: '25/08/2026' }, { v: 'XA' }, { v: 'GEN1.A/GEN2.B' }, null, { v: 85, f: '85' }, { v: 'Date(2026,7,25,10,30,0)', f: '25/08/2026 10:30:00' }, { v: '' }, null] },
    { c: [{ v: 'Date(2026,7,30)', f: '30/08/2026' }, { v: 'XB' }, { v: 'GEN1.A' }, { v: 904, f: '904' }, { v: 0, f: '0' }, null, { v: '  con espacios ' }, null] },
    { c: [null, null, null, null, null, null, null, null] },
    // «n/d» en otra columna de números; y un texto con coma, comillas y salto de línea
    { c: [{ v: 'Date(2026,8,2)', f: '02/09/2026' }, { v: 'XB' }, { v: 'X' }, { v: 905, f: '905' }, null, null, { v: 'a, "b"\nsegunda línea' }, null] },
    { c: [{ v: 'Date(2026,8,3)', f: '03/09/2026' }, null, null, null, { v: 5, f: '5' }, null, null, null] },
  ],
  parsedNumHeaders: 1,
};
const CSV_LOTES = [
  'Fecha,Lote,Código genético,Piscina Broodstock,Desoves,Fecha N2, Observaciones ,',
  '25/08/2026,XA,GEN1.A/GEN2.B,901/903,85,25/08/2026 10:30:00,,',
  '30/08/2026,XB,GEN1.A,904,0,,  con espacios ,',
  ',,,,,,,',
  '02/09/2026,XB,X,905,n/d,,"a, ""b""\nsegunda línea",',
  '03/09/2026,,,,5,,,',
].join('\r\n');
// Lo que devuelve ?p=rows de esa hoja (ver sheetRows en el GAS): cabeceras recortadas, sin la columna sin cabecera,
// fechas «yyyy-MM-dd», números con su tipo, lo minoritario como texto y sin la fila vacía.
const FILAS_LOTES = [
  { Fecha: '2026-08-25', Lote: 'XA', 'Código genético': 'GEN1.A/GEN2.B', 'Piscina Broodstock': '901/903', Desoves: 85, 'Fecha N2': '2026-08-25', Observaciones: '' },
  { Fecha: '2026-08-30', Lote: 'XB', 'Código genético': 'GEN1.A', 'Piscina Broodstock': 904, Desoves: 0, 'Fecha N2': '', Observaciones: '  con espacios ' },
  { Fecha: '2026-09-02', Lote: 'XB', 'Código genético': 'X', 'Piscina Broodstock': 905, Desoves: 'n/d', 'Fecha N2': '', Observaciones: 'a, "b"\nsegunda línea' },
  { Fecha: '2026-09-03', Lote: '', 'Código genético': '', 'Piscina Broodstock': '', Desoves: 5, 'Fecha N2': '', Observaciones: '' },
];

const vacia = (gid, cab) => ({ gid, tabla: { cols: cab.map((h, i) => ({ id: String.fromCharCode(65 + i), label: h, type: 'string' })), rows: [], parsedNumHeaders: 1 }, csv: cab.join(',') });
const HOJAS = {
  [LOTES]: { gid: '111', tabla: TABLA_LOTES, csv: CSV_LOTES },
  'Maduración Ingreso': vacia('222', ['Fecha', 'Lote', 'Sala', 'Tanque', 'Machos', 'Hembras']),
  'Maduración Movimientos': vacia('333', ['Fecha', 'Tipo', 'Sala origen', 'Tanque origen']),
  'Maduración Tanques': vacia('444', ['Fecha', 'Sala', 'Tanque', 'Hembras muertas']),
  // (su última columna es de texto y su CSV acaba cada línea en \r\n: el \r no puede quedarse pegado al texto)
  'Calidad & Agua': {
    gid: '777',
    tabla: { cols: [{ id: 'A', label: 'Fecha', type: 'date' }, { id: 'B', label: 'Sala', type: 'string' }], rows: [{ c: [{ v: 'Date(2026,8,1)' }, { v: 'Sala 2' }] }], parsedNumHeaders: 1 },
    csv: 'Fecha,Sala\r\n01/09/2026,Sala 2\r\n',
  },
  [MATRIZ]: vacia('666', ['Trovan ID', 'Piscina', 'Código genético', 'Lote', 'Sala actual', 'Tanque actual', 'Estado', 'Fecha ingreso', 'Fecha muerte']),
};
// La hoja por defecto: la que gviz devuelve, sin avisar, por un nombre que no existe.
const DEFECTO = {
  gid: '0',
  tabla: { cols: [{ id: 'A', label: 'Fecha', type: 'date' }, { id: 'B', label: 'Supervisor', type: 'string' }], rows: [{ c: [{ v: 'Date(2026,8,1)' }, { v: 'Ana' }] }, { c: [{ v: 'Date(2026,8,2)' }, { v: 'Luis' }] }], parsedNumHeaders: 1 },
  csv: 'Fecha,Supervisor\r\n01/09/2026,Ana\r\n02/09/2026,Luis',
};
// Google escribe los nombres como literales de JavaScript: una letra con tilde, «\u» y cuatro cifras; «&», \x26.
const jsLit = (s) => s.replace(/[^\x20-\x7e]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')).replace(/&/g, '\\x26');
const htmlview = (listadas) => '<html><body><script>var items = [];'
  + Object.entries(listadas).map(([n, g]) => 'items.push({name: "' + jsLit(n) + '", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/' + 'X' + '\\/htmlview\\/sheet?headers\\x3dtrue\\x26gid\\x3d' + g + '", gid: "' + g + '",initialSheet: ' + (g === '0') + '});').join('\n')
  + '</script></body></html>';
const gvizTexto = (tabla) => '/*O_o*/\ngoogle.visualization.Query.setResponse(' + JSON.stringify({ version: '0.6', reqId: '0', status: 'ok', sig: '1', table: tabla }) + ');';
const responder = (body, status = 200) => ({ ok: status < 400, status, text: async () => body });
const colgar = (opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))));

let listadas;       // lo que dice /htmlview: nombre → gid
let peticiones;     // todas las URL pedidas, en orden
let gasFilas;       // lo que responde ?p=rows por hoja
let gasRespuesta;   // si se da, lo que responde el GAS (texto) en vez de las filas
let rotas;          // ganchos por prueba: htmlview(), gviz(hoja, url, opts), csv(gid, opts)
const alGas = () => peticiones.filter((u) => u.includes('script.google.com'));
const aGoogle = () => peticiones.filter((u) => u.includes('docs.google.com'));
const deHtmlview = () => peticiones.filter((u) => u.endsWith('/htmlview'));

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
    + '\ntry{ H.gasUrlOriginal=gasUrl; H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.reiniciar=function(){ _exportMapaCache=null; _exportMapaEnVuelo=null; _exportMapaFallo=0; _exportDefecto=null;'
    + ' _reproSheets=null; _reproTrunc={}; _reproVia={}; _reproMatrixPromise=null; _reproLoadPromise=null; _reproFresca=null; _reproMatrixSrc=""; }; }catch(_){}'
    + '\ntry{ H.envejecerMapa=function(ms){ if(_exportMapaCache) _exportMapaCache.ts-=ms; }; }catch(_){}'
    // Una lectura de la MATRIZ por la exportación que sigue «en vuelo» cuando se pide confirmar (la ventana es de
    // microtareas: aquí se fabrica), con su hora posterior a la pregunta.
    + '\ntry{ H.simularLecturaEnVuelo=function(){ _reproMatrixPromise=Promise.resolve(); _reproMatrixSrc="red";'
    + ' _reproMatrixTs=Date.now()+60000; _reproVia[_REPRO_SHEETS.matriz]="export"; }; }catch(_){}'
    + '\ntry{ H.via=function(){ return _reproVia; }; H.trunc=function(){ return _reproTrunc; }; H.libro=function(){ return _madLibro; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  const _ric = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (fn) => { fn(); return 1; };   // la limpieza de arranque, ANTES de las pruebas
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  globalThis.requestIdleCallback = _ric;
  H.setToast(() => {});
  globalThis.fetch = async (url, opts = {}) => {
    const s = String(url), u = new URL(s);
    peticiones.push(s);
    if (u.hostname === 'script.google.com') {
      if (gasRespuesta) return responder(gasRespuesta);
      return responder(JSON.stringify({ ok: true, sheet: u.searchParams.get('sheet'), rows: gasFilas[u.searchParams.get('sheet')] || [] }));
    }
    if (u.hostname !== 'docs.google.com' || !u.pathname.startsWith('/spreadsheets/d/' + H.MAD_LIBRO_ID + '/')) throw new Error('fetch inesperado: ' + s);
    if (u.pathname.endsWith('/htmlview')) return rotas.htmlview ? rotas.htmlview(opts) : responder(htmlview(listadas));
    if (u.pathname.endsWith('/gviz/tq')) {
      const hoja = u.searchParams.get('sheet');
      const r = rotas.gviz && rotas.gviz(hoja, s, opts);
      if (r) return r;
      const h = HOJAS[hoja] || DEFECTO;
      const tabla = u.searchParams.get('tq') === 'limit 1' ? { ...h.tabla, rows: h.tabla.rows.slice(0, 1) } : h.tabla;
      return responder(gvizTexto(tabla));
    }
    if (u.pathname.endsWith('/export') && u.searchParams.get('format') === 'csv') {
      const gid = u.searchParams.get('gid');
      const r = rotas.csv && rotas.csv(gid, opts);
      if (r) return r;
      const h = Object.values(HOJAS).find((x) => x.gid === gid) || DEFECTO;
      return responder(h.csv);
    }
    throw new Error('fetch inesperado: ' + s);
  };
});

beforeEach(() => {
  H.reiniciar();
  H.setGasUrl(H.gasUrlOriginal);
  window.happyDOM.setURL(PAGINA);
  localStorage.removeItem('larv4_mad_matriz');
  listadas = { 'Registro_Supervisión': '0', ...Object.fromEntries(Object.entries(HOJAS).map(([n, h]) => [n, h.gid])) };
  peticiones = [];
  gasFilas = { [LOTES]: FILAS_LOTES };
  gasRespuesta = null;
  rotas = {};
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('D · se lee por la exportación, y da lo MISMO que el GAS', () => {
  it('🔴 con el GAS de producción y una página https, la hoja llega por la exportación SIN preguntar al GAS', async () => {
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(alGas(), 'el GAS no se toca').toEqual([]);
    expect(H.via()[LOTES]).toBe('export');
    expect(filas).toEqual(FILAS_LOTES);
  });

  it('🔴 lo que gviz deja en blanco (una columna que mezcla números y texto) llega del CSV: la «901/903» y la «n/d»', async () => {
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(filas[0]['Piscina Broodstock'], 'gviz sola la perdía (17 de 50, medido)').toBe('901/903');
    expect(filas[2].Desoves).toBe('n/d');
  });

  it('🔴 idéntico a lo que da el GAS de la misma hoja, celda a celda', async () => {
    const porExportacion = await H._reproFetchSheet(LOTES, null);
    const porGas = await H._reproFetchSheet(LOTES, null, { soloGas: true });
    expect(H.via()[LOTES]).toBe('gas');
    expect(porExportacion).toEqual(porGas);
  });

  it('las fechas (también con hora) salen «yyyy-MM-dd» con el mes de gviz corrido (empieza en 0)', async () => {
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(filas.map((f) => f.Fecha)).toEqual(['2026-08-25', '2026-08-30', '2026-09-02', '2026-09-03']);
    expect(filas[0]['Fecha N2']).toBe('2026-08-25');
  });

  it('con `cols` devuelve sólo esas columnas y quita las filas que quedan vacías (como el GAS); si ninguna existe, todas', async () => {
    const proyectadas = await H._reproFetchSheet(LOTES, ['Lote', 'Piscina Broodstock']);
    expect(proyectadas).toEqual([
      { Lote: 'XA', 'Piscina Broodstock': '901/903' },
      { Lote: 'XB', 'Piscina Broodstock': 904 },
      { Lote: 'XB', 'Piscina Broodstock': 905 },
    ]);
    expect(await H._reproFetchSheet(LOTES, ['No existe'])).toEqual(FILAS_LOTES);
  });

  it('la exportación no recorta: la lectura deja de decir «recortada» aunque la anterior del GAS lo dijera', async () => {
    gasRespuesta = JSON.stringify({ ok: true, rows: FILAS_LOTES, truncated: true, limit: 20000 });
    await H._reproFetchSheet(LOTES, null, { soloGas: true });
    expect(H.trunc()[LOTES]).toBe(true);
    gasRespuesta = null;
    await H._reproFetchSheet(LOTES, null);
    expect(H.trunc()[LOTES]).toBe(false);
  });

  it('un nombre de hoja con «&» (Google lo escribe «\\x26») se reconoce en la lista, y un CSV con \\r\\n se lee limpio', async () => {
    expect(await H._reproFetchSheet('Calidad & Agua', null)).toEqual([{ Fecha: '2026-09-01', Sala: 'Sala 2' }]);
    expect(alGas()).toEqual([]);
    expect(peticiones.some((u) => u.includes('gid=777')), 'se leyó por SU gid').toBe(true);
  });

  it('fechas de gviz → «yyyy-MM-dd» como el GAS (año con cuatro cifras, mes y día con dos); lo que no es Date(…), null', () => {
    expect(H._exportFecha('Date(2026,11,31,23,59,59)')).toBe('2026-12-31');
    expect(H._exportFecha('Date(202,0,5)')).toBe('0202-01-05');
    expect(H._exportFecha('25/08/2026')).toBe(null);
  });
});

describe('D · una hoja que NO existe', () => {
  it('🔴 no se toma la hoja por defecto que gviz devuelve sin avisar: se da por VACÍA, como el GAS, y sin preguntarle', async () => {
    expect(await H._reproFetchSheet('Maduración Transferencias', null)).toEqual([]);
    expect(alGas()).toEqual([]);
    expect(H.via()['Maduración Transferencias']).toBe('export');
    expect(deHtmlview(), 'la lista recién pedida no se vuelve a pedir').toHaveLength(1);
  });

  it('si al renovar la lista Google no contesta, se sigue con la que había (y la hoja que no está, vacía)', async () => {
    await H._reproFetchSheet(LOTES, null);
    H.envejecerMapa(61000);
    rotas.htmlview = () => responder('', 503);
    expect(await H._reproFetchSheet('Maduración Transferencias', null)).toEqual([]);
    expect(alGas()).toEqual([]);
  });

  it('🔴 si no está en la lista pero gviz trae OTRA cosa que la hoja por defecto (¿oculta?), se lee por el GAS', async () => {
    rotas.gviz = (hoja) => (hoja === 'Maduración Oculta' ? responder(gvizTexto(HOJAS['Maduración Ingreso'].tabla)) : null);
    gasFilas['Maduración Oculta'] = [{ Fecha: '2026-09-01' }];
    expect(await H._reproFetchSheet('Maduración Oculta', null)).toEqual([{ Fecha: '2026-09-01' }]);
    expect(H.via()['Maduración Oculta']).toBe('gas');
  });

  it('si la hoja por defecto no se puede leer, no se concluye nada: GAS', async () => {
    rotas.gviz = (hoja) => (hoja !== LOTES ? responder('', 500) : null);
    await H._reproFetchSheet('Maduración Transferencias', null);
    expect(H.via()['Maduración Transferencias']).toBe('gas');
  });

  it('una hoja creada después de pedir la lista: se vuelve a pedir la lista (pasado un minuto) y se lee', async () => {
    const { [LOTES]: _fuera, ...sin } = listadas;
    listadas = sin;
    await H._reproFetchSheet('Maduración Ingreso', null);
    listadas = { ...sin, [LOTES]: '111' };
    H.envejecerMapa(61000);
    expect(await H._reproFetchSheet(LOTES, null)).toEqual(FILAS_LOTES);
    expect(H.via()[LOTES]).toBe('export');
    expect(deHtmlview()).toHaveLength(2);
  });
});

describe('D · lo que no cuadra se lee por el GAS', () => {
  const porGas = async (etiqueta) => {
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(H.via()[LOTES], etiqueta).toBe('gas');
    expect(alGas().length, etiqueta).toBeGreaterThan(0);
    expect(filas).toEqual(FILAS_LOTES);
  };

  it('🔴 una cabecera del CSV distinta de la de gviz (otra hoja u otro orden)', async () => {
    rotas.csv = (gid) => (gid === '111' ? responder(CSV_LOTES.replace('Lote,', 'Lote nuevo,')) : null);
    await porGas('cabecera distinta');
  });

  it('🔴 una columna con cabecera que gviz no trae', async () => {
    rotas.csv = (gid) => (gid === '111' ? responder(CSV_LOTES.replace(' Observaciones ,', ' Observaciones ,,Extra')) : null);
    await porGas('columna de más');
  });

  it('🔴 las filas desplazadas: un texto de gviz que el CSV no dice igual en su sitio', async () => {
    rotas.csv = (gid) => (gid === '111' ? responder(CSV_LOTES.replace('\r\n25/08/2026', '\r\n01/01/2026,ZZ,Q,1,1,,,\r\n25/08/2026')) : null);
    await porGas('fila de más arriba');
  });

  // La fila de más arriba de la prueba anterior la delata también un hueco (su «Fecha N2» vacía donde gviz trae una);
  // aquí los huecos son los MISMOS y sólo difiere un texto: una fila que cambió entre las dos peticiones.
  it('🔴 los mismos huecos en las mismas celdas pero OTRO texto en su sitio (la fila cambió entre las dos peticiones)', async () => {
    rotas.csv = (gid) => (gid === '111' ? responder(CSV_LOTES.replace('30/08/2026,XB,', '30/08/2026,XZ,')) : null);
    await porGas('otro texto, mismos huecos');
  });

  it('🔴 un valor que gviz trae y el CSV deja en blanco (desplazada sin textos que comparar)', async () => {
    rotas.csv = (gid) => (gid === '111' ? responder(CSV_LOTES.replace(',901/903,85,', ',901/903,,')) : null);
    await porGas('número sin texto');
  });

  it('una fila del CSV que gviz no trae', async () => {
    rotas.csv = (gid) => (gid === '111' ? responder(CSV_LOTES + '\r\n04/09/2026,BZ,Y,1,1,,,') : null);
    await porGas('fila de menos en gviz');
  });

  it('una columna de HORAS (el GAS la da como fecha de 1899: no se imita)', async () => {
    const t = JSON.parse(JSON.stringify(TABLA_LOTES));
    t.cols[5].type = 'timeofday';
    rotas.gviz = (hoja) => (hoja === LOTES ? responder(gvizTexto(t)) : null);
    await porGas('timeofday');
  });

  it('una fecha que gviz no escribe como Date(…)', async () => {
    const t = JSON.parse(JSON.stringify(TABLA_LOTES));
    t.rows[0].c[0].v = '25/08/2026';
    rotas.gviz = (hoja) => (hoja === LOTES ? responder(gvizTexto(t)) : null);
    await porGas('fecha rara');
  });

  it('una página en vez de datos, un error de Google o un corte de red', async () => {
    rotas.csv = (gid) => (gid === '111' ? responder('<!DOCTYPE html><html>Inicia sesión</html>') : null);
    await porGas('CSV que es una página');
    H.reiniciar(); rotas = { gviz: (hoja) => (hoja === LOTES ? responder('<html>error</html>') : null) };
    await porGas('gviz que es una página');
    H.reiniciar(); rotas = { gviz: (hoja) => (hoja === LOTES ? responder(gvizTexto(TABLA_LOTES).replace('"status":"ok"', '"status":"error"')) : null) };
    await porGas('gviz con status error');
    H.reiniciar(); rotas = { csv: () => responder('', 500) };
    await porGas('HTTP 500');
    H.reiniciar(); rotas = { csv: () => { throw new TypeError('Failed to fetch'); } };
    await porGas('corte de red');
  });

  it('🔴 a los 20 s sin respuesta se deja la exportación y se pregunta al GAS (y no antes)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    rotas.gviz = (hoja, url, opts) => (hoja === LOTES ? colgar(opts) : null);
    const lectura = H._reproFetchSheet(LOTES, null);
    await vi.advanceTimersByTimeAsync(H._EXPORT_MS - 1000);
    expect(alGas(), 'a los 19 s aún se espera a Google').toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await lectura).toEqual(FILAS_LOTES);
    expect(H.via()[LOTES]).toBe('gas');
    expect(H._EXPORT_MS).toBe(20000);
  });

  it('un gid viejo (la hoja se borró y se volvió a crear): con la lista de hace más de un minuto se pide otra y se lee por el nuevo', async () => {
    listadas[LOTES] = '999';
    await H._reproFetchSheet(LOTES, null);
    expect(H.via()[LOTES], 'con la lista recién pedida no se vuelve a pedir: GAS').toBe('gas');
    listadas[LOTES] = '111';
    H.envejecerMapa(61000);
    peticiones = [];
    expect(await H._reproFetchSheet(LOTES, null)).toEqual(FILAS_LOTES);
    expect(H.via()[LOTES]).toBe('export');
    expect(peticiones.some((u) => u.includes('gid=111'))).toBe(true);
  });
});

describe('D · la lista de hojas', () => {
  it('se pide UNA vez por sesión, también cuando 🔄 Recalcular lee cinco hojas a la vez', async () => {
    await H._reproFetchSheet(LOTES, null);
    await H._reproFetchSheet('Maduración Ingreso', null);
    expect(deHtmlview()).toHaveLength(1);
    H.reiniciar(); peticiones = [];
    await Promise.all([LOTES, 'Maduración Ingreso', 'Maduración Tanques', 'Maduración Movimientos'].map((h) => H._reproFetchSheet(h, null)));
    expect(deHtmlview()).toHaveLength(1);
  });

  it('si no llega o no se reconoce, se lee por el GAS y no se vuelve a intentar en 2 minutos', async () => {
    rotas.htmlview = () => responder('<html>sin lista</html>');
    await H._reproFetchSheet(LOTES, null);
    expect(H.via()[LOTES]).toBe('gas');
    await H._reproFetchSheet(LOTES, null);
    expect(deHtmlview(), 'la segunda no la pide').toHaveLength(1);
    expect(aGoogle(), 'ni pregunta nada más a Google: va directa al GAS').toHaveLength(1);
    const ahora = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(ahora + 2 * 60 * 1000 + 1);
    rotas = {};
    await H._reproFetchSheet(LOTES, null);
    expect(deHtmlview()).toHaveLength(2);
    expect(H.via()[LOTES]).toBe('export');
  });

  it('columnas de gviz a partir de la Z: AA es la 27.ª del CSV', () => {
    expect(['A', 'Z', 'AA', 'AZ', 'BA', '', 'a', 'A1'].map(H._exportPos)).toEqual([0, 25, 26, 51, 52, -1, -1, -1]);
  });
});

describe('D · cuándo NO se usa la exportación', () => {
  it('🔴 con otro GAS (otro libro): ni se mira a Google, se lee por ese GAS', async () => {
    H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbOTRO/exec');
    await H._reproFetchSheet(LOTES, null);
    expect(aGoogle()).toEqual([]);
    expect(alGas()[0]).toContain('AKfycbOTRO');
  });

  it('🔴 desde una página que no es https (abierta como archivo, Google no la deja leer): GAS', async () => {
    window.happyDOM.setURL('http://localhost:3000/');
    await H._reproFetchSheet(LOTES, null);
    expect(aGoogle()).toEqual([]);
    expect(H.via()[LOTES]).toBe('gas');
  });

  it('🔴 la confirmación de un chip dudoso (1a) va por el GAS, aunque la exportación pudiera leerla', async () => {
    gasFilas[MATRIZ] = [{ 'Trovan ID': '0006A1B2C3', Piscina: 1, 'Código genético': 'X', Lote: 'XB', 'Sala actual': 'Sala 1', 'Tanque actual': 3, Estado: 'Vivo', 'Fecha ingreso': '2026-09-01', 'Fecha muerte': '' }];
    expect(await H._reproMatrizFresca()).toBe(true);
    expect(alGas().filter((u) => decodeURIComponent(u).includes(MATRIZ))).toHaveLength(1);
    expect(aGoogle().filter((u) => decodeURIComponent(u).includes(MATRIZ)), 'ni se le pregunta').toEqual([]);
  });

  it('🔴 una lectura de la EXPORTACIÓN que ya iba en vuelo tampoco cuenta como confirmación', async () => {
    H.simularLecturaEnVuelo();
    expect(await H._reproMatrizFresca()).toBe(false);
  });

  it('🔴 y si el GAS no confirma, NO cuenta como confirmada (aunque la exportación sí la leyera)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    gasRespuesta = JSON.stringify({ ok: false, error: 'Servicio no disponible' });
    const r = H._reproMatrizFresca();
    await vi.advanceTimersByTimeAsync(120000);
    expect(await r).toBe(false);
  });
});

describe('D · 🔄 Recalcular (el libro de Maduración) ya no espera al GAS', () => {
  it('🔴 lee sus cinco hojas por la exportación —las que aún no existen, vacías— y el libro sale COMPLETO', async () => {
    await H.madSaldoCargar(true, true);
    expect(alGas(), 'ni una lectura al GAS').toEqual([]);
    expect(H.libro().fallos).toEqual([]);
    expect(H.libro().recortadas).toEqual([]);
    expect(deHtmlview()).toHaveLength(1);
  });
});
