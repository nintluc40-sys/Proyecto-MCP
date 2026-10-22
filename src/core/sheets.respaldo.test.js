// @vitest-environment happy-dom
/* ============================================================
   EL RESPALDO DE LA LECTURA Y LOS FILTROS DE LA HOJA (2026-10-01)

   Cuando el XLSX del libro entero falla, el MCP baja las hojas una a una. Lo hacía por gviz
   (CSV), que sólo da las filas VISIBLES: con un FILTRO puesto en la hoja —el laboratorio los deja
   a menudo— llegaban recortadas (medido en producción: Datos M03, 20 de 1 579 filas) y el set
   recortado pisaba el bueno sin avisar (`isDegraded` sólo cuenta hojas). Aquí se fija:
   · cada hoja se pide por su XLSX (por gid), que las da TODAS, y no por gviz;
   · sus filas son las MISMAS que las del libro entero (mismas opciones de lectura);
   · si el XLSX de UNA hoja falla —o lo que llega no es un XLSX—, sólo ésa va al CSV de siempre;
   · sin SheetJS, el CSV de siempre;
   · en el WORKER (donde lee el MCP): si el libro entero no llega, el Worker hace el respaldo él
     mismo —leer cada hoja grande por XLSX en la página la congelaba ~1,3 s en PC— y sólo GUARDA el
     libro en el equipo (P4) si todas las hojas llegaron por su XLSX.
   B4 (2026-10-22, usuario) · «el CSV de siempre» es primero el de EXPORTACIÓN (no recorta por filtros) y gviz sólo si
   ése no llega; y gviz con MENOS filas que lo aplicado no pisa la hoja: cuenta como perdida.
   Google simulado (fetch); datos ficticios. El filtro se simula con un CSV que trae menos filas.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAllSheets, workbookToSheets, XLSX_LECTURA, textoProgreso, setLectorLibro, descargarLibro } from './sheets.js';
import { atenderLectura } from './sheets.worker.js';
import { parseNum } from './fields.js';

const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
const serie = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5);

const H1 = 'Datos Larvicultura - M03';
const H2 = 'Control_Tanque M10';
const HTML = [
  `items.push({name: "${H1}", pageUrl: "https://docs.google.com/spreadsheets/d/X/htmlview/sheet?headers=true&gid=1111"});`,
  `items.push({name: "${H2}", pageUrl: "https://docs.google.com/spreadsheets/d/X/htmlview/sheet?headers=true&gid=2222"});`,
].join('\n');

/** La hoja 1 con las celdas que más cuesta leer igual (fecha, número con decimales, texto con salto). */
function hoja1() {
  const X = window.XLSX;
  const ws = X.utils.aoa_to_sheet([
    ['Fecha', 'Tanque', 'Supervivencia', 'Observaciones'],
    [null, 'T1', 85.5, 'línea 1\nlínea 2'],
    [null, 'T2', 80, ''],
    [null, 'T3', 77.25, 'con "comillas"'],
  ]);
  ws.A2 = { t: 'n', v: serie(2026, 9, 1), z: 'dd/mm/yyyy' };
  ws.A3 = { t: 'n', v: serie(2026, 9, 2), z: 'dd/mm/yyyy' };
  ws.A4 = { t: 'n', v: serie(2026, 9, 3), z: 'dd/mm/yyyy' };
  return ws;
}
function hoja2() {
  return window.XLSX.utils.aoa_to_sheet([['Fecha', 'Tanque', 'pH'], ['01/09/2026', 'A1', 8.1], ['02/09/2026', 'A2', 8.2]]);
}
/** Los bytes de un XLSX con UNA hoja, como el export por gid. */
function xlsxDe(nombre, ws) {
  const X = window.XLSX;
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, nombre);
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}
// El «filtro»: gviz da sólo la cabecera y UNA fila de la hoja 1; de la hoja 2, todo. Con el formato regional del libro
// (es), como el gviz real (B3, medido el 22-10); hasta ese día la hoja 2 iba en en-US («8.1»), que gviz no da.
const CSV = {
  1111: 'Fecha,Tanque,Supervivencia,Observaciones\n01/09/2026,T1,"85,5",x\n',
  2222: 'Fecha,Tanque,pH\n01/09/2026,A1,"8,1"\n02/09/2026,A2,"8,2"\n',
};

let fetchReal;
let xlsxPorGid; // gid → bytes del XLSX | número (status de error) | 'html' (una página, no un XLSX)
let gvizCae;    // true → gviz tampoco contesta (sin señal)
let exportCsv;  // gid → texto del CSV de EXPORTACIÓN (B4); sin él, 404
let htmlCae;    // true → /htmlview no contesta: no se sabe qué pestañas hay
const pedidas = [];
const ok = (cuerpo) => ({ ok: true, status: 200, text: async () => cuerpo, arrayBuffer: async () => cuerpo });
const error = (status) => ({ ok: false, status, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) });
beforeAll(() => {
  new Function(readFileSync(VENDOR, 'utf8'))(); // deja window.XLSX, como el <script> de index.html
  fetchReal = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    pedidas.push(u);
    const gid = (u.match(/[?&]gid=(\d+)/) || [])[1];
    if (/\/htmlview/.test(u)) return htmlCae ? error(500) : ok(HTML);
    if (/export\?format=xlsx/.test(u)) {
      if (!gid) return error(403);                           // el libro ENTERO falla → respaldo
      const r = xlsxPorGid[gid];
      if (typeof r === 'number') return error(r);
      // Una página de acceso con una TABLA: SheetJS la leería como una hoja (filas basura) si no se mirara que es un ZIP.
      if (r === 'html') return ok(new TextEncoder().encode('<!DOCTYPE html><html><body><table><tr><td>Iniciar sesión</td></tr><tr><td>Correo</td></tr></table></body></html>').buffer);
      return ok(r.slice(0));
    }
    if (/export\?format=csv/.test(u)) return exportCsv[gid] ? ok(exportCsv[gid]) : error(404);
    if (/gviz/.test(u) && CSV[gid] && !gvizCae) return ok(CSV[gid]);
    return error(404);
  };
});
afterAll(() => { globalThis.fetch = fetchReal; });
beforeEach(() => {
  pedidas.length = 0;
  try { localStorage.clear(); } catch (_) {}
  xlsxPorGid = { 1111: xlsxDe(H1, hoja1()), 2222: xlsxDe(H2, hoja2()) };
  gvizCae = false;
  exportCsv = {};
  htmlCae = false;
});
const gvizDe = (gid) => pedidas.filter((u) => /gviz/.test(u) && new RegExp('[?&]gid=' + gid + '(\\D|$)').test(u));

describe('el respaldo lee cada hoja por su XLSX (los filtros de la hoja no la recortan)', () => {
  it('una hoja con FILTRO llega ENTERA: se pide su XLSX por gid y no gviz', async () => {
    const s = await fetchAllSheets();
    expect(s[H1]).toHaveLength(3);                           // gviz habría dado 1
    expect(s[H2]).toHaveLength(2);
    expect(pedidas.filter((u) => /export\?format=xlsx/.test(u) && /[?&]gid=1111/.test(u))).toHaveLength(1);
    expect(gvizDe(1111)).toEqual([]);
    expect(gvizDe(2222)).toEqual([]);
  });

  it('sus filas son las MISMAS que las del libro entero (mismas opciones de lectura)', async () => {
    const X = window.XLSX;
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, hoja1(), H1);
    X.utils.book_append_sheet(wb, hoja2(), H2);
    const libro = workbookToSheets(X.read(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })), XLSX_LECTURA), X);
    const s = await fetchAllSheets();
    expect(s[H1]).toEqual(libro[H1]);
    expect(s[H2]).toEqual(libro[H2]);
    expect(s[H1][0].Fecha).toBe('01/09/2026');               // sonda: la celda difícil está de verdad
    expect(s[H1][0].Observaciones).toBe('línea 1\nlínea 2');
  });

  it('si el XLSX de UNA hoja falla, sólo ésa va al CSV', async () => {
    xlsxPorGid[2222] = 404;
    const s = await fetchAllSheets();
    expect(s[H1]).toHaveLength(3);                           // por su XLSX
    expect(s[H2]).toHaveLength(2);                           // por el CSV
    expect(gvizDe(1111)).toEqual([]);
    expect(gvizDe(2222).length).toBeGreaterThan(0);
  });

  it('si lo que llega no es un XLSX (p. ej. una página de acceso), esa hoja va al CSV', async () => {
    xlsxPorGid[1111] = 'html';
    const s = await fetchAllSheets();
    expect(s[H1]).toHaveLength(1);                           // el CSV (recortado: es el último recurso)
    expect(s[H1][0].Tanque).toBe('T1');
    expect(gvizDe(1111).length).toBeGreaterThan(0);
  });

  it('sin SheetJS, el CSV de siempre', async () => {
    const X = window.XLSX;
    delete window.XLSX;
    try {
      const s = await fetchAllSheets();
      expect(s[H1]).toHaveLength(1);
      expect(s[H2]).toHaveLength(2);
      expect(pedidas.some((u) => /export\?format=xlsx/.test(u) && /[?&]gid=/.test(u))).toBe(false);
    } finally { window.XLSX = X; }
  });
});

describe('en el Worker: el respaldo se hace allí, no en la página', () => {
  const entorno = () => ({ cargarXLSX: vi.fn(), obtenerXLSX: () => window.XLSX, guardar: vi.fn(async () => {}) });
  const tic = () => new Promise((r) => setTimeout(r, 0));

  it('si el libro entero no llega, el Worker lee las hojas una a una por XLSX, contesta con TODAS y guarda el libro', async () => {
    const e = entorno();
    const r = await atenderLectura({ id: 1, realId: 'X', previas: {} }, e);
    expect(r).toMatchObject({ id: 1, ok: true, completo: true });   // A4: llegaron todas sus pestañas
    expect(r.orden).toEqual([H1, H2]);
    expect(r.cambiadas[H1]).toHaveLength(3);                 // entera, aunque gviz la diera recortada
    expect(gvizDe(1111)).toEqual([]);
    await tic();
    expect(e.guardar).toHaveBeenCalledTimes(1);
  });

  it('si una hoja llegó por el CSV (puede venir recortada), contesta con ella pero NO guarda el libro', async () => {
    xlsxPorGid[1111] = 404;
    const e = entorno();
    const r = await atenderLectura({ id: 2, realId: 'X', previas: {} }, e);
    expect(r).toMatchObject({ id: 2, ok: true, completo: true });   // A4: llegó (recortada o no): la lista vale
    expect(r.cambiadas[H1]).toHaveLength(1);
    await tic();
    expect(e.guardar).not.toHaveBeenCalled();
  });

  it('si una hoja no llega por ningún camino, contesta con las demás pero NO guarda el libro', async () => {
    xlsxPorGid[2222] = 404;
    gvizCae = true;
    const e = entorno();
    const r = await atenderLectura({ id: 3, realId: 'X', previas: {} }, e);
    expect(r).toMatchObject({ id: 3, ok: true, completo: false });  // A4: una NO llegó: no se sabe si existe
    expect(r.orden).toEqual([H1]);
    await tic();
    expect(e.guardar).not.toHaveBeenCalled();
  });

  it('si no se sabe qué pestañas hay: lee la primera, con el nombre que trae su XLSX, pero NO guarda el libro', async () => {
    htmlCae = true;
    xlsxPorGid[0] = xlsxDe(H1, hoja1());
    const e = entorno();
    const r = await atenderLectura({ id: 5, realId: 'X', previas: {} }, e);
    expect(r).toMatchObject({ id: 5, ok: true, completo: false });  // A4: sin pestañas, la lista no vale
    expect(r.orden).toEqual([H1]);                           // el nombre de su XLSX, no una adivinanza por columnas
    await tic();
    expect(e.guardar).not.toHaveBeenCalled();
  });

  it('carga lenta D (2026-10-19) · con /htmlview caído y la lista que recuerda la página, el respaldo lee TODAS sus pestañas', async () => {
    htmlCae = true;
    const r = await atenderLectura({ id: 8, realId: 'X', previas: {}, pestanas: [{ gid: 1111, title: H1 }, { gid: 2222, title: H2 }] }, entorno());
    expect(r).toMatchObject({ id: 8, ok: true, completo: true });
    expect(r.orden).toEqual([H1, H2]);
    expect(r.cambiadas[H1]).toHaveLength(3);                 // por su XLSX, entera
  });

  it('si no llega ninguna hoja: «sin-datos» (A1, 2026-10-07: la página ya no lo repite)', async () => {
    xlsxPorGid = { 1111: 404, 2222: 404 };
    gvizCae = true;
    expect(await atenderLectura({ id: 4, realId: 'X', previas: {} }, entorno())).toMatchObject({ id: 4, ok: false, motivo: 'sin-datos' });
  });

  it('A1: en la primera carga, el aviso del respaldo cuenta las hojas que terminan (también las que fallan)', async () => {
    xlsxPorGid[2222] = 404;
    gvizCae = true;                                          // la 2222 no llega por ningún camino: cuenta igual
    const avisos = [];
    const e = { ...entorno(), avisar: (id, p) => avisos.push(p) };
    await atenderLectura({ id: 6, realId: 'X', previas: {}, conProgreso: true }, e);
    expect(avisos.filter((p) => p.fase === 'respaldo')).toEqual([
      { fase: 'respaldo' }, { fase: 'respaldo', hechas: 1, de: 2 }, { fase: 'respaldo', hechas: 2, de: 2 },
    ]);
    expect(textoProgreso({ fase: 'respaldo', hechas: 1, de: 2 })).toBe('El libro entero no llegó: probando hoja por hoja… 1 de 2');
    expect(textoProgreso({ fase: 'respaldo' })).toBe('El libro entero no llegó: probando hoja por hoja…');
  });
});

describe('B4 (2026-10-22) · el CSV del respaldo es el de EXPORTACIÓN, y gviz no pisa una hoja con más filas', () => {
  // La hoja 1 ENTERA, como la da el CSV de exportación de un libro en formato es (coma decimal, CRLF)
  const EXPORTACION_H1 = 'Fecha,Tanque,Supervivencia,Observaciones\r\n01/09/2026,T1,"85,5","línea 1\nlínea 2"\r\n'
    + '02/09/2026,T2,80,\r\n03/09/2026,T3,"77,25","con ""comillas"""\r\n';
  const entorno = () => ({ cargarXLSX: vi.fn(), obtenerXLSX: () => window.XLSX, guardar: vi.fn(async () => {}) });
  const previas = (n1, n2) => ({ [H1]: `${H1}:${n1}:1;`, [H2]: `${H2}:${n2}:2;` });
  // El respaldo de la página TAL CUAL: el Worker contesta «xlsx» y descargarLibro va directo a fetchViaCsv. (Con
  // fetchAllSheets, desde la pauta 17 la lectura por CSV de hojasPorCsv va delante y la hoja llegaría por ella.)
  const respaldoDeLaPagina = async () => {
    setLectorLibro({ disponible: () => true, leer: async () => ({ ok: false, motivo: 'xlsx' }) });
    try { return (await descargarLibro()).sheets; } finally { setLectorLibro(null); }
  };

  it('si el XLSX de una hoja falla, va su CSV de exportación: ENTERA, con las filas del libro y sin pedir gviz', async () => {
    xlsxPorGid[1111] = 404;
    exportCsv[1111] = EXPORTACION_H1;
    const X = window.XLSX;
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, hoja1(), H1);
    const libro = workbookToSheets(X.read(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })), XLSX_LECTURA), X);
    const s = await respaldoDeLaPagina();
    expect(s[H1]).toEqual(libro[H1]);                        // 3 filas; «85,5» → '85.5', como el XLSX
    expect(s[H1][0].Supervivencia).toBe('85.5');
    expect(gvizDe(1111)).toEqual([]);
  });

  it('si el CSV de exportación viene en otro formato regional (en-US), no se usa: la hoja falta', async () => {
    xlsxPorGid[1111] = 404;
    exportCsv[1111] = 'Fecha,Tanque,Supervivencia\n01/09/2026,T1,85.55\n02/09/2026,T2,80.25\n';
    const s = await respaldoDeLaPagina();
    expect(s[H1]).toBeUndefined();
    expect(s[H2]).toHaveLength(2);
  });

  it('Worker · gviz con MENOS filas que lo aplicado: la hoja cuenta como perdida y no se manda (completo: false)', async () => {
    xlsxPorGid[1111] = 404;                                  // ni su XLSX ni su CSV de exportación: sólo gviz (1 fila)
    const r = await atenderLectura({ id: 9, realId: 'X', previas: previas(3, 2) }, entorno());
    expect(r).toMatchObject({ id: 9, ok: true, completo: false });
    expect(r.orden).toEqual([H2]);
    expect(gvizDe(1111).length).toBeGreaterThan(0);          // se pidió, pero no pisa las 3 aplicadas
  });

  it('Worker · gviz con las MISMAS filas que lo aplicado sí vale', async () => {
    xlsxPorGid[1111] = 404;
    const r = await atenderLectura({ id: 10, realId: 'X', previas: previas(1, 2) }, entorno());
    expect(r).toMatchObject({ id: 10, ok: true, completo: true });
    expect(r.orden).toEqual([H1, H2]);
  });

  it('página sin Worker · lo mismo, con las huellas que ya aplicó (fetchViaCsv se las pasa)', async () => {
    vi.resetModules();                                       // un sheets.js nuevo: lo aplicado no se queda para otras pruebas
    const S = await import('./sheets.js');
    const buenas = { [H1]: [{ a: '1' }, { a: '2' }, { a: '3' }], [H2]: [{ a: '1' }, { a: '2' }] };
    const huellas = S.huellasPorHoja(buenas);
    expect(S.aplicarDescarga({ sheets: buenas, huellas, fp: S.huellaDe(huellas) })).toBe(5);
    xlsxPorGid[1111] = 404;
    const s = await S.fetchAllSheets();
    expect(s[H1]).toBeUndefined();                           // gviz trajo 1 de 3: no la pisa
    expect(s[H2]).toHaveLength(2);
  });
});

/* B3 (2026-10-22, usuario) · LOS MILES DE LOS CAMINOS DE RESERVA. Por el XLSX, SheetJS da cada número con el formato de su
   celda y a la inglesa («7,400,000.0», «1,061»), y `parseNum` los leía 7,4 y 1,061; por gviz salen en el formato del libro
   (es: «7.400.000,0», «85,5»), crudos. Ahora el XLSX quita la coma de miles en las celdas NUMÉRICAS (los textos, intactos)
   y gviz se convierte como el CSV de exportación, con su misma guarda de formato regional. */
describe('B3 (2026-10-22) · los miles del XLSX y de gviz llegan como los del CSV de exportación', () => {
  /** Una hoja con números con separador de miles (formato de la celda), un decimal sin formato y textos con coma. */
  function hojaMiles() {
    const ws = window.XLSX.utils.aoa_to_sheet([
      ['Tanque', 'Población', 'Plg', 'Balance', 'Supervivencia', 'Piscina', 'Nota'],
      ['T1', 7400000, 1061, -12345.5, 85.5, '556,557', '7,5'],
    ]);
    ws.B2.z = '#,##0.0'; ws.C2.z = '#,##0'; ws.D2.z = '#,##0.0';
    return ws;
  }
  /* El respaldo de la página tal cual (como en B4), con un sheets.js NUEVO: así lo aplicado por otras pruebas (3 filas de
     la hoja 1) no hace saltar la guarda B4 de gviz, que no es lo que se mira aquí. */
  const respaldoDeLaPagina = async () => {
    vi.resetModules();
    const S = await import('./sheets.js');
    S.setLectorLibro({ disponible: () => true, leer: async () => ({ ok: false, motivo: 'xlsx' }) });
    try { return (await S.descargarLibro()).sheets; } finally { S.setLectorLibro(null); }
  };

  it('el libro entero: los números con miles salen sin ellos; el decimal y los TEXTOS con coma, intactos', () => {
    const X = window.XLSX;
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, hojaMiles(), H1);
    const bytes = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
    const sinCorregir = X.utils.sheet_to_json(X.read(bytes, XLSX_LECTURA).Sheets[H1], { defval: '', raw: false });
    expect([sinCorregir[0]['Población'], sinCorregir[0].Plg], 'control: SheetJS sí los da con coma de miles').toEqual(['7,400,000.0', '1,061']);
    for (const dense of [true, false]) {
      const [f] = workbookToSheets(X.read(bytes, { ...XLSX_LECTURA, dense }), X)[H1];
      expect([f['Población'], f.Plg, f.Balance, f.Supervivencia], 'dense ' + dense).toEqual(['7400000.0', '1061', '-12345.5', '85.5']);
      expect([f.Piscina, f.Nota], 'los textos no se tocan').toEqual(['556,557', '7,5']);
      expect([parseNum(f, ['Población']), parseNum(f, ['Plg'])]).toEqual([7400000, 1061]);
    }
  });

  it('el respaldo por hojas: el XLSX de cada hoja, igual que el libro entero', async () => {
    xlsxPorGid[1111] = xlsxDe(H1, hojaMiles());
    const [f] = (await fetchAllSheets())[H1];
    expect([f['Población'], f.Plg, f.Piscina]).toEqual(['7400000.0', '1061', '556,557']);
  });

  it('gviz (sin XLSX ni CSV de exportación): sus números en formato es se convierten como los del CSV de exportación', async () => {
    xlsxPorGid[1111] = 404;
    const antes = CSV[1111];
    CSV[1111] = 'Fecha,Tanque,Supervivencia,Población,Piscina\n01/09/2026,T1,"85,5","7.400.000,0",556\n';
    try {
      const [f] = (await respaldoDeLaPagina())[H1];
      expect([f.Supervivencia, f['Población'], f.Piscina]).toEqual(['85.5', '7400000.0', '556']);
      expect(gvizDe(1111).length, 'control: llegó por gviz').toBeGreaterThan(0);
    } finally { CSV[1111] = antes; }
  });

  it('gviz en otro formato regional (en-US) no se convierte a ciegas: la hoja falta, como con el CSV de exportación', async () => {
    xlsxPorGid[1111] = 404;
    const antes = CSV[1111];
    CSV[1111] = 'Fecha,Tanque,Supervivencia\n01/09/2026,T1,85.55\n02/09/2026,T2,80.25\n03/09/2026,T3,77.75\n';
    try {
      const s = await respaldoDeLaPagina();
      expect(s[H1]).toBeUndefined();
      expect(s[H2]).toHaveLength(2);
    } finally { CSV[1111] = antes; }
  });
});
