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
   Google simulado (fetch); datos ficticios. El filtro se simula con un CSV que trae menos filas.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAllSheets, workbookToSheets, XLSX_LECTURA } from './sheets.js';
import { atenderLectura } from './sheets.worker.js';

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
// El «filtro»: gviz da sólo la cabecera y UNA fila de la hoja 1; de la hoja 2, todo.
const CSV = {
  1111: 'Fecha,Tanque,Supervivencia,Observaciones\n01/09/2026,T1,"85,5",x\n',
  2222: 'Fecha,Tanque,pH\n01/09/2026,A1,8.1\n02/09/2026,A2,8.2\n',
};

let fetchReal;
let xlsxPorGid; // gid → bytes del XLSX | número (status de error) | 'html' (una página, no un XLSX)
let gvizCae;    // true → gviz tampoco contesta (sin señal)
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
    expect(r).toMatchObject({ id: 1, ok: true });
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
    expect(r).toMatchObject({ id: 2, ok: true });
    expect(r.cambiadas[H1]).toHaveLength(1);
    await tic();
    expect(e.guardar).not.toHaveBeenCalled();
  });

  it('si una hoja no llega por ningún camino, contesta con las demás pero NO guarda el libro', async () => {
    xlsxPorGid[2222] = 404;
    gvizCae = true;
    const e = entorno();
    const r = await atenderLectura({ id: 3, realId: 'X', previas: {} }, e);
    expect(r).toMatchObject({ id: 3, ok: true });
    expect(r.orden).toEqual([H1]);
    await tic();
    expect(e.guardar).not.toHaveBeenCalled();
  });

  it('si no se sabe qué pestañas hay: lee la primera, con el nombre que trae su XLSX, pero NO guarda el libro', async () => {
    htmlCae = true;
    xlsxPorGid[0] = xlsxDe(H1, hoja1());
    const e = entorno();
    const r = await atenderLectura({ id: 5, realId: 'X', previas: {} }, e);
    expect(r).toMatchObject({ id: 5, ok: true });
    expect(r.orden).toEqual([H1]);                           // el nombre de su XLSX, no una adivinanza por columnas
    await tic();
    expect(e.guardar).not.toHaveBeenCalled();
  });

  it('si no llega ninguna hoja: «xlsx» (la página hace su último intento)', async () => {
    xlsxPorGid = { 1111: 404, 2222: 404 };
    gvizCae = true;
    expect(await atenderLectura({ id: 4, realId: 'X', previas: {} }, entorno())).toMatchObject({ id: 4, ok: false, motivo: 'xlsx' });
  });
});
