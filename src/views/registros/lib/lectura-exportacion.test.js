// @vitest-environment happy-dom
/* ============================================================
   D · SE LEE POR LA EXPORTACIÓN DE GOOGLE, CON EL GAS DE RESPALDO (punto 2a · corrección D, 2026-09-24)

   Medido ese día contra producción (sólo lectura): el GAS tardaba de 17 a 140 s por hoja y fallaba la mitad de las
   veces; la exportación, de 0,4 a 5 s. Decisiones del usuario (las tres recomendadas): TODAS las lecturas, también justo
   después de guardar; el GAS de respaldo, y la confirmación de un chip dudoso (1a) por el GAS. Lo que se lee así tiene
   que ser EXACTAMENTE lo que daría ?p=rows.

   0v·2 (2026-09-29, usuario) · EL XLSX DE LA HOJA, no gviz + CSV. Con un FILTRO puesto en la hoja (el laboratorio los
   deja: MATRIZ, Bitácora y Tanques ese día) gviz sólo da las filas visibles —por nombre, por gid, con `range` o con
   `select *`, medido— y el emparejamiento con el CSV se descuadraba: todo iba al GAS. El XLSX de UNA hoja
   (`export?format=xlsx&gid=`) trae todas sus filas con el tipo de cada celda: medido, 11 hojas y 7 336 filas IDÉNTICAS
   al GAS celda a celda, en 0,5–1,8 s. Decisión del usuario: sustituir gviz + CSV por él; lo que no se sabe imitar va al
   GAS. gviz sigue sólo para saber si una hoja que no está en la lista existe.

   El Google de estas pruebas se porta como el medido: el XLSX de una hoja es un libro de UNA hoja con su nombre, que
   empieza en A1, con cada celda de su tipo (y los formatos de fecha); gviz, por un nombre que no existe, responde con la
   hoja por defecto. Los XLSX se escriben con el SheetJS del proyecto, el mismo que lee la página.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
const EXPORTAR = ['_reproFetchSheet', '_reproMatrizFresca', 'madSaldoCargar', 'DEFAULT_GAS_URL', 'MAD_LIBRO_ID', '_EXPORT_MS'];
const H = {};
const PAGINA = 'https://nintluc40-sys.github.io/Proyecto-MCP/';
const LOTES = 'Maduración Lotes';
const MATRIZ = 'Maduración MATRIZ';

/* ── Celdas del XLSX como las escribe Google ──────────────────────────────────────────────────────────────────────── */
/** El número de serie de una fecha (días desde el 30-12-1899), sin zona horaria. */
const serie = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5);
const F = (y, m, d, fraccion = 0, z = 'dd/mm/yyyy') => ({ t: 'n', v: serie(y, m, d) + fraccion, z });
const HORA = (fraccion) => ({ t: 'n', v: fraccion, z: 'h:mm' });
const NA = { t: 'e', v: 0x2A };   // #N/A
/** Un XLSX de UNA hoja (o de varias) con estas filas: null es una celda vacía; un objeto con `t`, la celda tal cual. */
const xlsxDe = (hojas, opciones = {}) => {
  const X = window.XLSX;
  const wb = X.utils.book_new();
  if (opciones.fecha1904) wb.Workbook = { WBProps: { date1904: true } };
  for (const [nombre, aoa] of Object.entries(hojas)) {
    const ws = {};
    const desde = opciones.desde || { r: 0, c: 0 };
    let ultimaC = 0;
    aoa.forEach((fila, r) => fila.forEach((v, c) => {
      ultimaC = Math.max(ultimaC, c);
      if (v === null || v === undefined) return;
      const celda = typeof v === 'object' ? v : typeof v === 'number' ? { t: 'n', v } : typeof v === 'boolean' ? { t: 'b', v } : { t: 's', v: String(v) };
      ws[X.utils.encode_cell({ r: r + desde.r, c: c + desde.c })] = celda;
    }));
    if (aoa.length) ws['!ref'] = X.utils.encode_range({ s: desde, e: { r: desde.r + aoa.length - 1, c: desde.c + ultimaC } });
    X.utils.book_append_sheet(wb, ws, nombre);
  }
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
};

/* ── La hoja de desoves tal como la guarda Google ─────────────────────────────────────────────────────────────────── */
const CAB_LOTES = ['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Desoves', 'Fecha N2', ' Observaciones ', ''];
const AOA_LOTES = [
  CAB_LOTES,
  // una pareja de piscinas («NNN/NNN») en una columna de números: gviz la dejaba en blanco (17 de 50, medido); una fecha
  // con hora; un texto VACÍO; y algo escrito en la columna SIN cabecera, que el GAS no devuelve
  [F(2026, 8, 25), 'XA', 'GEN1.A/GEN2.B', '901/903', 85, F(2026, 8, 25, 0.4375, 'dd/mm/yyyy hh:mm'), '', 'suelto'],
  // un cero; espacios que se conservan; y una fecha a las 23:59:59,6 (su día, no el siguiente)
  [F(2026, 8, 30), 'XB', 'GEN1.A', 904, 0, F(2026, 8, 30, 0.999995, 'dd/mm/yyyy hh:mm:ss'), '  con espacios ', null],
  // una fila vacía en lo que se devuelve (sólo la columna sin cabecera): el GAS no la da
  [null, null, null, null, null, null, null, 'sólo aquí'],
  // «n/d» en otra columna de números; y un texto con coma, comillas y salto de línea
  [F(2026, 9, 2), 'XB', 'X', 905, 'n/d', null, 'a, "b"\nsegunda línea', null],
  [F(2026, 9, 3), null, null, null, 5, null, null, null],
];
// Lo que devuelve ?p=rows de esa hoja (ver sheetRows en el GAS): cabeceras recortadas, sin la columna sin cabecera,
// fechas «yyyy-MM-dd» (sin la hora), números con su tipo, el texto tal cual, lo vacío como "" y sin la fila vacía.
const FILAS_LOTES = [
  { Fecha: '2026-08-25', Lote: 'XA', 'Código genético': 'GEN1.A/GEN2.B', 'Piscina Broodstock': '901/903', Desoves: 85, 'Fecha N2': '2026-08-25', Observaciones: '' },
  { Fecha: '2026-08-30', Lote: 'XB', 'Código genético': 'GEN1.A', 'Piscina Broodstock': 904, Desoves: 0, 'Fecha N2': '2026-08-30', Observaciones: '  con espacios ' },
  { Fecha: '2026-09-02', Lote: 'XB', 'Código genético': 'X', 'Piscina Broodstock': 905, Desoves: 'n/d', 'Fecha N2': '', Observaciones: 'a, "b"\nsegunda línea' },
  { Fecha: '2026-09-03', Lote: '', 'Código genético': '', 'Piscina Broodstock': '', Desoves: 5, 'Fecha N2': '', Observaciones: '' },
];
/** La hoja de desoves con una celda cambiada (fila y columna del AOA). */
const lotesCon = (r, c, v) => AOA_LOTES.map((f, i) => (i === r ? f.map((x, j) => (j === c ? v : x)) : f));

/** Una hoja con sólo su cabecera (y lo que gviz diría de ella, para las que se preguntan por nombre). */
const vacia = (gid, cab) => ({ gid, aoa: [cab], tabla: { cols: cab.map((h, i) => ({ id: String.fromCharCode(65 + i), label: h, type: 'string' })), rows: [], parsedNumHeaders: 1 } });
const HOJAS = {
  [LOTES]: { gid: '111', aoa: AOA_LOTES },
  'Maduración Ingreso': vacia('222', ['Fecha', 'Lote', 'Sala', 'Tanque', 'Machos', 'Hembras']),
  'Maduración Movimientos': vacia('333', ['Fecha', 'Tipo', 'Sala origen', 'Tanque origen']),
  'Maduración Tanques': vacia('444', ['Fecha', 'Sala', 'Tanque', 'Hembras muertas']),
  // un nombre con «&» (Google lo escribe «\x26» en la lista) y una columna de VERDADERO/FALSO
  'Calidad & Agua': { gid: '777', aoa: [['Fecha', 'Sala', 'Revisado'], [F(2026, 9, 1), 'Sala 2', true], [F(2026, 9, 2), 'Sala 3', false]] },
  // dos columnas con la MISMA cabecera: en el GAS manda la de más a la derecha
  'Maduración Repetida': { gid: '888', aoa: [['Lote', 'Sala', 'Lote'], ['QA', 'Sala 1', 'QB']] },
  [MATRIZ]: vacia('666', ['Trovan ID', 'Piscina', 'Código genético', 'Lote', 'Sala actual', 'Tanque actual', 'Estado', 'Fecha ingreso', 'Fecha muerte']),
};
// La hoja por defecto: la que gviz devuelve, sin avisar, por un nombre que no existe.
const DEFECTO = {
  gid: '0',
  tabla: { cols: [{ id: 'A', label: 'Fecha', type: 'date' }, { id: 'B', label: 'Supervisor', type: 'string' }], rows: [{ c: [{ v: 'Date(2026,8,1)' }, { v: 'Ana' }] }, { c: [{ v: 'Date(2026,8,2)' }, { v: 'Luis' }] }], parsedNumHeaders: 1 },
};
// Google escribe los nombres como literales de JavaScript: una letra con tilde, «\u» y cuatro cifras; «&», \x26.
const jsLit = (s) => s.replace(/[^\x20-\x7e]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')).replace(/&/g, '\\x26');
const htmlview = (listadas) => '<html><body><script>var items = [];'
  + Object.entries(listadas).map(([n, g]) => 'items.push({name: "' + jsLit(n) + '", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/' + 'X' + '\\/htmlview\\/sheet?headers\\x3dtrue\\x26gid\\x3d' + g + '", gid: "' + g + '",initialSheet: ' + (g === '0') + '});').join('\n')
  + '</script></body></html>';
const gvizTexto = (tabla) => '/*O_o*/\ngoogle.visualization.Query.setResponse(' + JSON.stringify({ version: '0.6', reqId: '0', status: 'ok', sig: '1', table: tabla }) + ');';
const responder = (body, status = 200) => ({ ok: status < 400, status, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer });
const responderXlsx = (bytes) => ({ ok: true, status: 200, arrayBuffer: async () => bytes, text: async () => { throw new Error('un XLSX no se lee como texto'); } });
const colgar = (opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))));

let listadas;       // lo que dice /htmlview: nombre → gid
let peticiones;     // todas las URL pedidas, en orden
let gasFilas;       // lo que responde ?p=rows por hoja
let gasRespuesta;   // si se da, lo que responde el GAS (texto) en vez de las filas
let rotas;          // ganchos por prueba: htmlview(), gviz(hoja, url, opts), xlsx(gid, opts)
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
  new Function(readFileSync(VENDOR, 'utf8'))();          // su cola UMD deja window.XLSX, como el <script> de index.html
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
      const h = (HOJAS[hoja] && HOJAS[hoja].tabla) ? HOJAS[hoja] : DEFECTO;
      const tabla = u.searchParams.get('tq') === 'limit 1' ? { ...h.tabla, rows: h.tabla.rows.slice(0, 1) } : h.tabla;
      return responder(gvizTexto(tabla));
    }
    if (u.pathname.endsWith('/export') && u.searchParams.get('format') === 'xlsx') {
      const gid = u.searchParams.get('gid');
      const r = rotas.xlsx && rotas.xlsx(gid, opts);
      if (r) return r;
      const e = Object.entries(HOJAS).find(([, x]) => x.gid === gid);
      if (!e) return responder('<html>404</html>', 404);
      return responderXlsx(xlsxDe({ [e[0]]: e[1].aoa }));
    }
    throw new Error('fetch inesperado: ' + s);   // 0v·2 · ni CSV ni gviz para una hoja que está en la lista
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

  it('🔴 0v·2 · con un FILTRO puesto en la hoja (gviz sólo daría las filas visibles) llegan TODAS, por la exportación', async () => {
    rotas.gviz = (hoja) => (hoja === LOTES ? responder(gvizTexto({ cols: [], rows: [], parsedNumHeaders: 1 })) : null);
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(filas).toEqual(FILAS_LOTES);
    expect(H.via()[LOTES]).toBe('export');
    expect(alGas()).toEqual([]);
  });

  it('🔴 0v·2 · UNA petición por hoja: su XLSX, por su gid (ni gviz ni CSV)', async () => {
    await H._reproFetchSheet(LOTES, null);
    const deLaHoja = aGoogle().filter((u) => !u.endsWith('/htmlview'));
    expect(deLaHoja).toHaveLength(1);
    expect(deLaHoja[0]).toContain('/export?format=xlsx&gid=111');
  });

  it('🔴 una columna que mezcla números y texto llega ENTERA (gviz dejaba en blanco lo minoritario): la «901/903» y la «n/d»', async () => {
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(filas[0]['Piscina Broodstock']).toBe('901/903');
    expect(filas[1]['Piscina Broodstock']).toBe(904);
    expect(filas[2].Desoves).toBe('n/d');
  });

  it('🔴 idéntico a lo que da el GAS de la misma hoja, celda a celda', async () => {
    const porExportacion = await H._reproFetchSheet(LOTES, null);
    const porGas = await H._reproFetchSheet(LOTES, null, { soloGas: true });
    expect(H.via()[LOTES]).toBe('gas');
    expect(porExportacion).toEqual(porGas);
  });

  it('las fechas (también con hora, y a las 23:59:59) salen «yyyy-MM-dd» de SU día, como el GAS', async () => {
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(filas.map((f) => f.Fecha)).toEqual(['2026-08-25', '2026-08-30', '2026-09-02', '2026-09-03']);
    expect(filas.map((f) => f['Fecha N2'])).toEqual(['2026-08-25', '2026-08-30', '', '']);
  });

  it('la columna sin cabecera no se devuelve, y una fila con algo SÓLO ahí es una fila vacía (como el GAS)', async () => {
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(filas).toHaveLength(4);
    expect(filas.every((f) => !('' in f))).toBe(true);
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

  it('los booleanos llegan con su tipo; dos columnas con la MISMA cabecera, la de más a la derecha (como el GAS)', async () => {
    expect(await H._reproFetchSheet('Calidad & Agua', null)).toEqual([
      { Fecha: '2026-09-01', Sala: 'Sala 2', Revisado: true }, { Fecha: '2026-09-02', Sala: 'Sala 3', Revisado: false }]);
    expect(await H._reproFetchSheet('Maduración Repetida', null)).toEqual([{ Lote: 'QB', Sala: 'Sala 1' }]);
  });

  it('una hoja que existe pero no tiene NADA (ni cabecera) llega vacía, como el GAS, sin preguntarle', async () => {
    rotas.xlsx = (gid) => (gid === '222' ? responderXlsx(xlsxDe({ 'Maduración Ingreso': [] })) : null);
    expect(await H._reproFetchSheet('Maduración Ingreso', null)).toEqual([]);
    expect(H.via()['Maduración Ingreso']).toBe('export');
    expect(alGas()).toEqual([]);
  });

  it('la exportación no recorta: la lectura deja de decir «recortada» aunque la anterior del GAS lo dijera', async () => {
    gasRespuesta = JSON.stringify({ ok: true, rows: FILAS_LOTES, truncated: true, limit: 20000 });
    await H._reproFetchSheet(LOTES, null, { soloGas: true });
    expect(H.trunc()[LOTES]).toBe(true);
    gasRespuesta = null;
    await H._reproFetchSheet(LOTES, null);
    expect(H.trunc()[LOTES]).toBe(false);
  });

  it('un nombre de hoja con «&» (Google lo escribe «\\x26») se reconoce en la lista y se lee por SU gid', async () => {
    expect(await H._reproFetchSheet('Calidad & Agua', null)).toHaveLength(2);
    expect(alGas()).toEqual([]);
    expect(peticiones.some((u) => u.includes('gid=777')), 'se leyó por SU gid').toBe(true);
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

  it('🔴 una respuesta de gviz con estado de ERROR no se toma por la hoja por defecto: GAS', async () => {
    const error = (tabla) => responder(gvizTexto(tabla).replace('"status":"ok"', '"status":"error"'));
    rotas.gviz = (hoja) => (hoja !== LOTES ? error(DEFECTO.tabla) : null);
    await H._reproFetchSheet('Maduración Transferencias', null);
    expect(H.via()['Maduración Transferencias']).toBe('gas');
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

describe('D · lo que no se sabe imitar, o no es la hoja, se lee por el GAS', () => {
  const porGas = async (etiqueta, cols = null) => {
    const filas = await H._reproFetchSheet(LOTES, cols);
    expect(H.via()[LOTES], etiqueta).toBe('gas');
    expect(alGas().length, etiqueta).toBeGreaterThan(0);
    expect(filas).toEqual(cols ? expect.any(Array) : FILAS_LOTES);
  };
  const conLotes = (aoa, opciones) => { rotas.xlsx = (gid) => (gid === '111' ? responderXlsx(xlsxDe({ [LOTES]: aoa }, opciones)) : null); };

  it('🔴 un XLSX de OTRA hoja (otro nombre) no se toma por ésta', async () => {
    rotas.xlsx = (gid) => (gid === '111' ? responderXlsx(xlsxDe({ 'Maduración Ingreso': AOA_LOTES })) : null);
    await porGas('otro nombre');
  });

  it('🔴 un XLSX con MÁS de una hoja (no es el de una hoja)', async () => {
    rotas.xlsx = (gid) => (gid === '111' ? responderXlsx(xlsxDe({ [LOTES]: AOA_LOTES, Otra: [['A'], [1]] })) : null);
    await porGas('dos hojas');
  });

  it('🔴 una HORA sola en una columna que se devuelve (el GAS la da como fecha de 1899: no se imita); en otra, no estorba', async () => {
    conLotes(lotesCon(1, 5, HORA(0.4375)));
    await porGas('hora sola');
    H.reiniciar(); peticiones = [];
    conLotes(lotesCon(1, 5, HORA(0.4375)));
    expect(await H._reproFetchSheet(LOTES, ['Lote'])).toEqual([{ Lote: 'XA' }, { Lote: 'XB' }, { Lote: 'XB' }]);
    expect(H.via()[LOTES], 'la hora no estaba en lo pedido').toBe('export');
  });

  it('🔴 una fecha anterior al 1-3-1900 (Excel cuenta un 29-2-1900 que no existió) se lee por el GAS; el 1-3-1900, no', async () => {
    conLotes(lotesCon(1, 0, { t: 'n', v: 60, z: 'dd/mm/yyyy' }));
    await porGas('serie 60');
    H.reiniciar(); peticiones = [];
    conLotes(lotesCon(1, 0, { t: 'n', v: 61, z: 'dd/mm/yyyy' }));
    const filas = await H._reproFetchSheet(LOTES, null);
    expect(H.via()[LOTES]).toBe('export');
    expect(filas[0].Fecha).toBe('1900-03-01');
  });

  it('🔴 un error de la hoja (#N/A) en lo que se devuelve', async () => {
    conLotes(lotesCon(2, 4, NA));
    await porGas('#N/A');
  });

  it('🔴 una cabecera que es una FECHA (el GAS la escribe a su manera: no se imita)', async () => {
    conLotes(AOA_LOTES.map((f, i) => (i === 0 ? f.map((x, j) => (j === 1 ? F(2026, 1, 1) : x)) : f)));
    await porGas('cabecera fecha');
  });

  it('🔴 una hoja que no empieza en A1 (la cabecera del GAS es la fila 1)', async () => {
    conLotes(AOA_LOTES, { desde: { r: 1, c: 0 } });
    await porGas('empieza en la fila 2');
  });

  it('🔴 un libro con el sistema de fechas de 1904 (las series serían otras)', async () => {
    conLotes(AOA_LOTES, { fecha1904: true });
    await porGas('1904');
  });

  it('🔴 sin SheetJS en la página, la exportación no se puede leer: GAS', async () => {
    const X = window.XLSX;
    try {
      delete window.XLSX;
      await porGas('sin SheetJS');
    } finally { window.XLSX = X; }
  });

  it('una página en vez de datos, un error de Google o un corte de red', async () => {
    rotas.xlsx = (gid) => (gid === '111' ? responder('<!DOCTYPE html><html>Inicia sesión</html>') : null);
    await porGas('una página');
    H.reiniciar(); peticiones = []; rotas = { xlsx: (gid) => (gid === '111' ? responder('Fecha,Lote\n01/01/2026,X') : null) };
    await porGas('un CSV (SheetJS lo abriría como «Sheet1»)');
    H.reiniciar(); peticiones = []; rotas = { xlsx: () => responder('', 500) };
    await porGas('HTTP 500');
    H.reiniciar(); peticiones = []; rotas = { xlsx: () => { throw new TypeError('Failed to fetch'); } };
    await porGas('corte de red');
  });

  it('🔴 a los 20 s sin respuesta se deja la exportación y se pregunta al GAS (y no antes)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    rotas.xlsx = (gid, opts) => (gid === '111' ? colgar(opts) : null);
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
