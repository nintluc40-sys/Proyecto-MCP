// @vitest-environment happy-dom
/* MADURACIÓN · la ficha 📈 Control Broodstock en el monolito arrancado entero (V1, 2026-09-18).
   El archivo se GENERA con SheetJS de verdad —la misma librería que sirve el repo, cargada en la ventana— y entra por
   el mismo camino que el del usuario: `madBsArchivo` → `XLSX.read` → lector → vista previa → envío. Así se prueba
   también lo que el lector recibe de SheetJS (los formatos de fecha y de %), que un fixture tecleado no garantiza. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_BS_HEADERS } from './ficha-maduracion-broodstock.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
const EXPORTAR = ['renderMadBroodstock', 'madBsArchivo', 'madBsElegir', 'madBsGuardar', 'madBsGuardarLocal', 'madBsVaciar', 'madLocLeer',
  'MAD_BS_LOG_KEY', 'MAD_LOC_PRE', '_gasVersionLocal'];
const H = {};
const avisos = [];
const envios = [];
let respuestaVer = null;

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
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
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, globalThis.localStorage, globalThis);
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  window.confirm = () => true;
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify(respuestaVer) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: 'no se esperaba' }) };
  };
});

/* ── El Excel, generado con SheetJS con la FORMA de los del usuario y valores FICTICIOS (usuario, 2026-09-18:
   las pruebas no llevan valores reales). ── */
const CAB = ['Piscina', 'Area (ha)', 'Fecha siembra', 'Cantidad Sembrada ', 'Densidad (cam/m2)', 'Peso de siembra ', 'FASE ACTUAL', 'PESOS', '', '', '', '',
  'Inc. Ult. Sem', 'Crecimiento fase actual', 'Sobrev. Estim (%)', 'Dias Cultivos Fase 1 (precria)', 'Dias en fase 2 (engorde)',
  'Dias de cultivo fase 3 (prereproductor)', 'Edad total (dias)', 'Psc. Orig', 'Camaronera', 'Codigo', 'OBSERVACION'];
//            A    B     C      D       E   F         G                 H   I   J   K   L     M   N   O     P  Q   R   S   T    U          V             W
const F810 = [810, 0.40, 46124, 333000, '', '120.pl', 'PRECRIA',        '', '', '', '', 0.12, '', '', 0.92, 7, '', '', '', '',  '',        'XPR1. F9',   'LÍNEA DE PRUEBA'];
const F815 = [815, 0.30, 46101, 2900,   '', 21,       'Pre-reproductor', 21, 27, 32, 38, 45,   '', '', 0.86, 0, 90, 30, '', 810, 'Chongón', 'XPR6.F6',    'LÍNEA DE PRUEBA'];
const F811 = [811, 0.30];
function hojaXlsx(X, corte, fechas, filas) {
  const aoa = [['RESUMEN SEMANAL DE PISCINAS · PRUEBA'], [], [corte], ['BROODSTOCK - PRUEBA'], CAB,
    ['', '', '', '', '', '', ''].concat(fechas)].concat(filas);
  const ws = X.utils.aoa_to_sheet(aoa);
  ws.A3.z = 'm/d/yy';
  fechas.forEach((_, i) => { ws[X.utils.encode_cell({ r: 5, c: 7 + i })].z = 'dd/mm/yy;@'; });
  filas.forEach((_, i) => {
    const c = ws[X.utils.encode_cell({ r: 6 + i, c: 2 })]; if (c && typeof c.v === 'number') c.z = 'd-mmm-yy';
    const o = ws[X.utils.encode_cell({ r: 6 + i, c: 14 })]; if (o && typeof o.v === 'number') o.z = '0%';
  });
  return ws;
}
/** Un .xlsx con dos semanas: la del 12-abr (la anterior) y la del 19-abr con la errata de K6 y una nota debajo. */
function libro({ repetida = false, ajena = false } = {}) {
  const X = window.XLSX, wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, hojaXlsx(X, 46124, [46096, 46103, 46110, 46117, 46124], [[815, 0.30, 46101, 2900, '', 21, 'Pre-reproductor', 21, 27, 32, 38, '', '', '', 0.85, 0, 90, 23, '', 810, 'Chongón', 'XPR6.F6', '']]), '12 Abr. 26');
  X.utils.book_append_sheet(wb, hojaXlsx(X, repetida ? 46124 : 46131, [46103, 46110, 46117, 46094, 46131],
    [F810, F815, F811, [], ['', '', 'NOTA: PISCINAS 836 Y 837 FUERON RALEADAS EL 13 DE ABRIL 2026']]), '19 Abr. 26 ');
  if (ajena) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Resumen de otra cosa'], [1, 2]]), 'Otra');
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}
const archivo = (bytes, name = 'HOJA BROODSTOCK.xlsx') => ({ files: [{ name, arrayBuffer: async () => bytes }], value: 'C:\\fakepath\\' + name });
const q = (s) => document.querySelector('#fp-broodstock ' + s);
const texto = (s) => (q(s) ? q(s).textContent.replace(/\s+/g, ' ') : '');
const valor = (p, h, i = 0) => p.rows[i][p.headers.indexOf(h)];

beforeEach(() => {
  avisos.length = 0;
  envios.length = 0;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };
  localStorage.removeItem(H.MAD_BS_LOG_KEY);
  localStorage.removeItem(H.MAD_LOC_PRE + 'broodstock');
  H.madBsVaciar();
  H.renderMadBroodstock();
});

describe('Control Broodstock · la ficha', () => {
  it('la pestaña está cableada, su panel existe y su hoja pasa por el portón del sello', () => {
    const src = readFileSync(ENGINE, 'utf8');
    expect(src).toContain('broodstock: ["📈","Broodstock"]');
    expect(src).toContain('if(t==="broodstock") renderMadBroodstock();');
    expect(src).toMatch(/const MAD_TABS\s+= \[[^\]]*"alimentacion","broodstock","reproductivo"/);
    expect(src).toMatch(/function _madHojaPideGasNuevo\(hoja\)\{[^}]*if\(hoja === MAD_BS_SHEET\) return true;/);
    expect(src).toMatch(/const MAD_LOC_FICHAS = \[[^\]]*"broodstock"\]/);
    expect(q('.fc-t').textContent).toBe('📈 Maduración · Control Broodstock');
    expect(q('#mb-archivo').getAttribute('onchange')).toBe('madBsArchivo(this)');
    expect(q('#mb-archivo').getAttribute('accept')).toContain('.xlsx');
  });

  it('🔴 un libro de dos semanas: se marca SÓLO la más reciente, con su vista previa, sus avisos y su nota', async () => {
    const inp = archivo(libro());
    await H.madBsArchivo(inp);
    expect(inp.value, 'el input se vacía para poder volver a elegir el mismo archivo corregido').toBe('');
    const marcas = [...document.querySelectorAll('#fp-broodstock .mb-hoja')].map((c) => c.checked);
    expect(marcas).toEqual([false, true]);
    expect(texto('#mb-nombre')).toBe('HOJA BROODSTOCK.xlsx · 2 semana(s)');
    expect(texto('#mb-prev')).toContain('Semana del 2026-04-19 · 2 piscina(s)');
    expect(texto('#mb-prev')).not.toContain('2026-04-12 ·');
    const filas = [...document.querySelectorAll('#fp-broodstock .mb-prev tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(filas.map((f) => f[0])).toEqual(['810', '815']);
    expect(filas[0][5], 'la precría: 120.pl son Pl/g').toBe('120');
    expect(filas[1][10], 'la sobrevivencia en %').toBe('86');
    const rep = texto('#mb-report');
    expect(rep).toContain('La columna de pesos K6 dice 2026-03-13');
    expect(rep).toContain('1 piscina(s) sin datos no se suben (811)');
    expect(rep).toContain('NOTA: PISCINAS 836 Y 837 FUERON RALEADAS');
    expect(rep).not.toContain('No se puede subir');
  });

  it('🔴 ☁️ con el GAS de esta app: UN envío, de la semana marcada, con la llave (Fecha de corte · Piscina) y reemplazo', async () => {
    await H.madBsArchivo(archivo(libro()));
    await H.madBsGuardar();
    expect(envios).toHaveLength(1);
    const p = envios[0];
    expect([p.sheetName, p.headers, p.keyCols, p.replaceKey]).toEqual(['Maduración Broodstock', MAD_BS_HEADERS, [0, 1], true]);
    expect(p.rows).toHaveLength(2);
    expect([valor(p, 'Fecha de corte'), valor(p, 'Piscina'), valor(p, 'Peso de siembra (g)'), valor(p, 'Pl/g'), valor(p, 'Fase actual')])
      .toEqual(['2026-04-19', '810', '', 120, 'Precría']);
    expect([valor(p, 'Peso actual (g)', 1), valor(p, 'Fecha del peso', 1), valor(p, 'Incremento última semana (g)', 1), valor(p, 'Sobrevivencia estimada (%)', 1), valor(p, 'Código genético', 1)])
      .toEqual([45, '2026-04-19', 7, 86, 'XPR6.F6']);
    expect(texto('#mb-log')).toContain('2026-04-19');
    expect(texto('#mb-nombre'), 'subido, la ficha queda limpia').toBe('Ningún archivo cargado.');
  });

  it('🔴 con OTRO GAS no se sube nada, se dice por qué y lo cargado sigue en pantalla', async () => {
    respuestaVer = { ok: true, version: 'otro000sello' };
    await H.madBsArchivo(archivo(libro()));
    await H.madBsGuardar();
    expect(envios).toHaveLength(0);
    expect(texto('#mb-report')).toContain('No se subió: el GAS desplegado no es el de esta app y podría escribir «Maduración Broodstock»');
    expect(texto('#mb-nombre')).toBe('HOJA BROODSTOCK.xlsx · 2 semana(s)');
  });

  it('🔴 marcando también la semana anterior salen DOS envíos, uno por corte', async () => {
    await H.madBsArchivo(archivo(libro()));
    H.madBsElegir(0, true);
    await H.madBsGuardar();
    expect(envios.map((p) => valor(p, 'Fecha de corte'))).toEqual(['2026-04-12', '2026-04-19']);
    // La semana anterior no tiene peso en L: el último es K (38, con la fecha de K6 = 46117 = 2026-04-05) y el incremento, K − J = 38 − 32.
    expect([valor(envios[0], 'Peso actual (g)'), valor(envios[0], 'Fecha del peso'), valor(envios[0], 'Incremento última semana (g)')]).toEqual([38, '2026-04-05', 6]);
  });

  it('🔴 dos hojas marcadas con el MISMO corte no se suben: la segunda pisaría a la primera', async () => {
    await H.madBsArchivo(archivo(libro({ repetida: true })));
    // Con los dos cortes iguales, la marcada por defecto es la primera: se marca a mano la otra.
    expect([...document.querySelectorAll('#fp-broodstock .mb-hoja')].map((c) => c.checked)).toEqual([true, false]);
    H.madBsElegir(1, true);
    await H.madBsGuardar();
    expect(envios).toHaveLength(0);
    expect(texto('#mb-report')).toContain('Hay dos hojas marcadas con el mismo corte (2026-04-12)');
  });

  it('sin ninguna semana marcada no se sube, y se dice', async () => {
    await H.madBsArchivo(archivo(libro()));
    H.madBsElegir(1, false);
    await H.madBsGuardar();
    expect(envios).toHaveLength(0);
    expect(texto('#mb-report')).toContain('Marca al menos una semana para subir.');
  });

  it('🔴 💾 guarda en el dispositivo (un envío por semana) y ☁️ lo manda después', async () => {
    await H.madBsArchivo(archivo(libro()));
    H.madBsGuardarLocal();
    const guardados = H.madLocLeer('broodstock');
    expect(guardados.map((e) => [e.fecha, e.filas, e.info.hoja])).toEqual([['2026-04-19', 2, '19 Abr. 26']]);
    expect(envios).toHaveLength(0);
    expect(texto('#mb-loc')).toContain('💾 Guardado en este dispositivo, sin enviar (1)');
    expect(texto('#mb-nombre')).toBe('Ningún archivo cargado.');
    await H.madBsGuardar();
    expect(envios.map((p) => valor(p, 'Fecha de corte'))).toEqual(['2026-04-19']);
    expect(H.madLocLeer('broodstock')).toHaveLength(0);
  });

  it('un libro sin ninguna hoja de Broodstock no se sube, y se dice; las hojas ajenas se cuentan aparte', async () => {
    const X = window.XLSX, wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Otra cosa'], [1]]), 'Hoja1');
    await H.madBsArchivo(archivo(X.write(wb, { type: 'array', bookType: 'xlsx' }), 'otro.xlsx'));
    expect(texto('#mb-nombre')).toBe('otro.xlsx · 0 semana(s) · 1 hoja(s) que no son de Broodstock');
    await H.madBsGuardar();
    expect(envios).toHaveLength(0);
    expect(texto('#mb-report')).toContain('no trae ninguna hoja con la forma del Control Broodstock');
    await H.madBsArchivo(archivo(libro({ ajena: true })));
    expect(texto('#mb-nombre')).toBe('HOJA BROODSTOCK.xlsx · 2 semana(s) · 1 hoja(s) que no son de Broodstock');
  });

  it('🔴 la nota que nombra una piscina con datos llega a su Observación en el envío, y la vista previa la enseña (punto 8)', async () => {
    const X = window.XLSX, wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, hojaXlsx(X, 46131, [46103, 46110, 46117, 46124, 46131],
      [F815, F811, [], ['', '', 'NOTA: PISCINAS 815 Y 811 FUERON RALEADAS']]), '19 Abr. 26');
    await H.madBsArchivo(archivo(X.write(wb, { type: 'array', bookType: 'xlsx' })));
    expect(texto('#mb-prev')).toContain('LÍNEA DE PRUEBA · NOTA: PISCINAS 815 Y 811 FUERON RALEADAS');
    expect(texto('#mb-report')).toContain('va a la Observación de la(s) piscina(s) 815.');
    expect(texto('#mb-report')).toContain('nombra la(s) piscina(s) 811, sin datos esta semana: ahí no se sube.');
    expect(texto('#mb-report'), 'ya no queda texto «que NO se sube»').not.toContain('que NO se sube');
    await H.madBsGuardar();
    expect(envios).toHaveLength(1);
    expect(envios[0].rows).toHaveLength(1);
    expect(valor(envios[0], 'Observación')).toBe('LÍNEA DE PRUEBA · NOTA: PISCINAS 815 Y 811 FUERON RALEADAS');
  });

  it('la vista previa enseña la piscina de origen y la camaronera separadas (punto 10)', async () => {
    const X = window.XLSX, wb = X.utils.book_new();
    const cabJul = CAB.filter((h) => h !== 'Camaronera');
    const julio = F815.slice(0, 19).concat(['902 ch', 'XPR6.F6', 'LÍNEA DE PRUEBA']);   // A–S igual; T origen, U código, V obs.
    const ws = hojaXlsx(X, 46131, [46103, 46110, 46117, 46124, 46131], [julio]);
    cabJul.forEach((h, c) => { ws[X.utils.encode_cell({ r: 4, c })] = { t: 's', v: h }; });
    delete ws[X.utils.encode_cell({ r: 4, c: 22 })];
    X.utils.book_append_sheet(wb, ws, '19 Abr. 26');
    await H.madBsArchivo(archivo(X.write(wb, { type: 'array', bookType: 'xlsx' })));
    const fila = [...document.querySelectorAll('#fp-broodstock .mb-prev tbody tr')][0];
    const celdas = [...fila.children].map((td) => td.textContent);
    expect(celdas.slice(-3)).toEqual(['902', 'Chongón', 'LÍNEA DE PRUEBA']);
  });

  it('sin SheetJS en la página no se lee nada, y se dice', async () => {
    const X = window.XLSX;
    try {
      window.XLSX = undefined;
      await H.madBsArchivo(archivo(new Uint8Array([1, 2, 3])));
      expect(avisos[avisos.length - 1].msg).toContain('falta la librería SheetJS');
      expect(texto('#mb-nombre')).toBe('Ningún archivo cargado.');
    } finally { window.XLSX = X; }
  });
});
