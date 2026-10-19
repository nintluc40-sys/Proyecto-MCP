// @vitest-environment happy-dom
/* ============================================================
   4.2-B (2026-10-11, usuario) · CADA HOJA POR SU CSV DE EXPORTACIÓN, en el Worker
   El libro entero en XLSX eran 14,5 MB y 12–16 s de lectura; las hojas por `export?format=csv&gid=` son ~1,4 MB y ~2 s,
   con las mismas filas (medido con el libro real el 11-10: 99,998 % de celdas idénticas). Aquí se fija:
   · valorDeCsv: el formato regional del CSV (coma decimal, punto de miles) pasa a la forma del XLSX; lo demás, intacto;
   · filasDeCsv: las MISMAS claves y filas que sheet_to_json del XLSX (columnas sin nombre, repetidas, filas en blanco,
     espacios, saltos de línea entre comillas);
   · hojasPorCsv: todas las hojas con su origen; la que no llega por CSV —o trae menos filas que lo aplicado— por su XLSX;
     `completo`; y que se aparta (null → el libro entero, como antes) sin pestañas, con una sin nombre, si el formato
     regional no es el esperado o si nada llega (deja de insistir cuando falla la primera tanda entera, CSV_A_LA_VEZ);
   · el Worker lo usa PRIMERO y sólo pide el libro entero si no sirve o queda incompleto.
   Google simulado (fetch); datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { valorDeCsv, filasDeCsv, hojasPorCsv, workbookToSheets, XLSX_LECTURA, textoProgreso, CSV_A_LA_VEZ } from './sheets.js';
import { atenderLectura } from './sheets.worker.js';

const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
const H1 = 'Datos Larvicultura - M03';
const H2 = 'Control_Tanque M10';
const HTML = (titulos = [H1, H2]) => titulos.map((t, i) => `items.push({name: "${t}", pageUrl: "https://docs.google.com/spreadsheets/d/X/htmlview/sheet?headers=true&gid=${1111 * (i + 1)}"});`).join('\n');
const CSV = {
  1111: '﻿Fecha,Tanque,Supervivencia,Población\n01/09/2026,TQ 1,"85,5","7.400.000,0"\n02/09/2026,TQ 2,80,1.061\n',
  2222: 'Fecha,Tanque,OD\n01/09/2026,A1,"5,2"\n02/09/2026,A2,"5,6"\n03/09/2026,A3,"5,1"\n',
};
function xlsxDe(nombre, aoa) {
  const X = window.XLSX, wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), nombre);
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}
let fetchReal, html, csvPorGid, xlsxPorGid, libroEntero;
const pedidas = [];
const ok = (cuerpo) => ({ ok: true, status: 200, text: async () => cuerpo, arrayBuffer: async () => (typeof cuerpo === 'string' ? new TextEncoder().encode(cuerpo).buffer : cuerpo) });
const error = (status) => ({ ok: false, status, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) });
beforeAll(() => {
  new Function(readFileSync(VENDOR, 'utf8'))(); // deja window.XLSX, como el <script> de index.html
  fetchReal = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url); pedidas.push(u);
    const gid = (u.match(/[?&]gid=(\d+)/) || [])[1];
    if (/\/htmlview/.test(u)) return html === null ? error(500) : ok(html);
    if (/export\?format=csv/.test(u)) {
      let r = csvPorGid[gid];
      if (r && typeof r === 'object') { await new Promise((res) => setTimeout(res, r.tarda)); r = r.r; }   // R1 · { tarda: ms, r }: llega tarde
      return typeof r === 'string' ? ok(r) : error(r || 404);
    }
    if (/export\?format=xlsx/.test(u)) {
      if (!gid) return libroEntero ? ok(libroEntero.slice(0)) : error(403);
      const r = xlsxPorGid[gid]; return r && typeof r !== 'number' ? ok(r.slice(0)) : error(r || 404);
    }
    return error(404);
  };
});
afterAll(() => { globalThis.fetch = fetchReal; });
beforeEach(() => {
  pedidas.length = 0;
  try { localStorage.clear(); } catch (_) {}
  html = HTML(); csvPorGid = { ...CSV }; libroEntero = null;
  xlsxPorGid = { 1111: xlsxDe(H1, [['Fecha', 'Tanque', 'Supervivencia', 'Población'], ['01/09/2026', 'TQ 1', 85.5, 7400000], ['02/09/2026', 'TQ 2', 80, 1061], ['03/09/2026', 'TQ 3', 70, 1]]) };
});
const ids = { type: 'real', realId: 'X' };
const xlsx = () => window.XLSX;

describe('valorDeCsv · el formato regional del CSV (es) a la forma del XLSX', () => {
  it('coma decimal → punto; punto de miles fuera; porcentaje, negativo y exponente; textos, fechas y horas intactos', () => {
    expect(valorDeCsv('85,5')).toBe('85.5');
    expect(valorDeCsv('-3,25')).toBe('-3.25');
    expect(valorDeCsv('12,5%')).toBe('12.5%');
    expect(valorDeCsv('1,5E-3')).toBe('1.5E-3');
    expect(valorDeCsv('7.400.000,0')).toBe('7400000.0');
    expect(valorDeCsv('1.061')).toBe('1061');
    expect(valorDeCsv('24.064')).toBe('24064');
    for (const s of ['TQ 1', '01/09/2026', '10:30', '1.5', '8.47', 'BM+BO', '2026-10-01', ' Orrala', '']) expect(valorDeCsv(s)).toBe(s);
  });
});

describe('filasDeCsv · las mismas filas y claves que el camino del XLSX', () => {
  it('columna sin nombre (__EMPTY), repetida (_1), fila en blanco fuera, espacios y saltos de línea conservados', () => {
    const texto = 'Fecha,Tanque,Supervivencia,,Tanque,Observaciones\n'
      + '01/09/2026,TQ 1,"85,5",x,dup,"línea 1\nlínea 2"\n'
      + ',,,,,\n'
      + '02/09/2026, TQ 2 ,80,,,"con ""comillas"""\n';
    const senales = { es: 0, en: 0 };
    const filas = filasDeCsv(texto, xlsx(), senales);
    expect(filas).toEqual([
      { Fecha: '01/09/2026', Tanque: 'TQ 1', Supervivencia: '85.5', __EMPTY: 'x', Tanque_1: 'dup', Observaciones: 'línea 1\nlínea 2' },
      { Fecha: '02/09/2026', Tanque: ' TQ 2 ', Supervivencia: '80', __EMPTY: '', Tanque_1: '', Observaciones: 'con "comillas"' },
    ]);
    expect(senales).toEqual({ es: 1, en: 0 });
    // las mismas claves que sheet_to_json de un XLSX con esa cabecera
    const X = xlsx(), wb = X.read(xlsxDe('H', [['Fecha', 'Tanque', 'Supervivencia', null, 'Tanque', 'Observaciones'], ['01/09/2026', 'TQ 1', 85.5, 'x', 'dup', 'a']]), XLSX_LECTURA);
    expect(Object.keys(workbookToSheets(wb, X).H[0]).filter((k) => k !== '_SheetOrigin')).toEqual(Object.keys(filas[0]));
  });
});

describe('hojasPorCsv', () => {
  it('todas las hojas con su origen y sus valores convertidos; completo; avisa «N de M»', async () => {
    const avisos = [];
    const r = await hojasPorCsv(ids, xlsx, (p) => avisos.push(p));
    expect(Object.keys(r.sheets)).toEqual([H1, H2]);
    expect(r.completo).toBe(true);
    expect(r.porXlsx).toBe(0);
    expect(r.sheets[H1][0]).toMatchObject({ Tanque: 'TQ 1', Supervivencia: '85.5', 'Población': '7400000.0', _SheetOrigin: 'Larvicultura', 'Módulo': 'M03' });
    expect(r.sheets[H1][1]['Población']).toBe('1061');
    expect(r.sheets[H2]).toHaveLength(3);
    expect(avisos.at(-1)).toEqual({ fase: 'hojas', hechas: 2, de: 2 });
    expect(textoProgreso(avisos.at(-1))).toBe('Descargando las hojas… 2 de 2');
    expect(pedidas.some((u) => /export\?format=xlsx/.test(u))).toBe(false);
  });

  it('la hoja cuyo CSV no llega —o trae MENOS filas que lo aplicado— se pide por su XLSX; si tampoco, falta y no es completo', async () => {
    csvPorGid[1111] = 500;
    let r = await hojasPorCsv(ids, xlsx);
    expect(r.porXlsx).toBe(1);
    expect(r.sheets[H1]).toHaveLength(3);                       // las del XLSX
    expect(r.completo).toBe(true);
    csvPorGid = { ...CSV };
    r = await hojasPorCsv(ids, xlsx, null, { [H1]: H1 + ':3:123;' });   // aplicadas 3, el CSV trae 2
    expect(r.porXlsx).toBe(1);
    expect(r.sheets[H1]).toHaveLength(3);
    csvPorGid[2222] = 500;
    r = await hojasPorCsv(ids, xlsx);
    expect(Object.keys(r.sheets)).toEqual([H1]);
    expect(r.completo).toBe(false);
  });

  it('se aparta (null) sin pestañas, con una pestaña sin nombre o si el libro no está en formato es', async () => {
    html = null;
    expect(await hojasPorCsv(ids, xlsx)).toBe(null);
    html = HTML() + '\n"gid":"98765"';                           // un gid suelto, sin nombre
    expect(await hojasPorCsv(ids, xlsx)).toBe(null);
    html = HTML();
    csvPorGid = { 1111: 'Fecha,OD\n01/09/2026,5.25\n02/09/2026,5.5\n', 2222: 'Fecha,OD\n01/09/2026,5.1\n' };   // en-US
    expect(await hojasPorCsv(ids, xlsx)).toBe(null);
  });

  it('si nada llega, deja de insistir cuando falla la primera tanda entera y se aparta', async () => {
    expect(CSV_A_LA_VEZ).toBe(16);   // pauta 3.5 (2026-10-15): 10 a la vez · 2026-10-18 (opción A de la carga lenta): 16
    html = HTML(Array.from({ length: 30 }, (_, i) => 'Hoja ' + i));
    csvPorGid = {};
    expect(await hojasPorCsv(ids, xlsx)).toBe(null);
    // no 30 hojas × 2 intentos: la primera tanda, una vez cada hoja (R1, 2026-10-18: antes valía «hasta el doble», y un
    // umbral doblado —el doble de espera con la red colgada— pasaba sin que nadie lo viera)
    expect(pedidas.filter((u) => /export\?format=csv/.test(u)).length).toBe(CSV_A_LA_VEZ);
  });

  it('unos rechazos RÁPIDOS al empezar no tiran el CSV si el resto de la primera tanda llega (pauta 3.5)', async () => {
    // 10 hojas: las 6 primeras rechazan al instante (p. ej. un 429 de Google) y las 4 siguientes llegan. Con un umbral
    // menor que la tanda (los 6 de antes con 10 a la vez) se abandonaba todo y se bajaba el libro entero.
    const titulos = Array.from({ length: 10 }, (_, i) => 'Hoja ' + i);
    html = HTML(titulos);
    csvPorGid = {}; xlsxPorGid = {};
    titulos.forEach((_, i) => { csvPorGid[1111 * (i + 1)] = i < 6 ? 429 : 'Fecha,Valor\n01/09/2026,"' + i + ',5"\n'; });
    const r = await hojasPorCsv(ids, xlsx);
    expect(r).not.toBe(null);
    expect(Object.keys(r.sheets)).toEqual(['Hoja 6', 'Hoja 7', 'Hoja 8', 'Hoja 9']);
    expect(r.completo).toBe(false);   // las 6 rechazadas tampoco llegan por su XLSX: falta, y el Worker pedirá el libro
  });

  it('R1 · se cuentan HOJAS de la primera tanda, no intentos: los rechazos rápidos no tiran el CSV mientras el resto de esa tanda llega', async () => {
    // El escenario sale de CSV_A_LA_VEZ (pauta 1.2, 2026-10-19: eran 15 hojas FIJAS y, con 16 a la vez, todas cabían en la
    // primera tanda: contar también las de fuera pasaba sin que nadie lo viera). Con 16: en la primera tanda, 9 hojas
    // rechazan al instante (con su reintento, 18 intentos fallidos: más que la tanda) y 7 llegan TARDE (después del
    // reintento); detrás, 8 más —que entran en cuanto quedan huecos— rechazan también al instante (9 + 8 primeros intentos:
    // también más que la tanda). Antes (auditoría del 1.1, 2026-10-18) se abandonaba al contar intentos, se descartaban
    // las que estaban llegando y el Worker bajaba el libro entero.
    const S = CSV_A_LA_VEZ, rapidas = Math.floor(S / 2) + 1, tardias = S - rapidas, detras = tardias + 1;
    const titulos = Array.from({ length: S + detras }, (_, i) => 'Hoja ' + i);
    const llegaTarde = (i) => i >= rapidas && i < S;
    html = HTML(titulos);
    csvPorGid = {}; xlsxPorGid = {};
    titulos.forEach((_, i) => { csvPorGid[1111 * (i + 1)] = llegaTarde(i) ? { tarda: 1500, r: 'Fecha,Valor\n01/09/2026,"' + i + ',5"\n' } : 429; });
    expect(2 * rapidas, 'control: contando intentos se pasaría de la tanda').toBeGreaterThanOrEqual(S);
    expect(rapidas + detras, 'control: contando también las de fuera, igual').toBeGreaterThanOrEqual(S);
    const r = await hojasPorCsv(ids, xlsx);
    expect(r).not.toBe(null);
    expect(Object.keys(r.sheets)).toEqual(titulos.filter((_, i) => llegaTarde(i)));
    expect(r.completo).toBe(false);
    // las rechazadas siguieron su camino: su reintento por CSV y su XLSX propio
    const rechazadas = rapidas + detras;
    expect(pedidas.filter((u) => /export\?format=csv/.test(u)).length).toBe(rechazadas * 2 + tardias);
    expect(pedidas.filter((u) => /export\?format=xlsx&gid=/.test(u)).length).toBe(rechazadas * 2);   // su XLSX, también con reintento
  });
});

describe('el Worker lee PRIMERO por CSV', () => {
  const entorno = () => ({ cargarXLSX: vi.fn(), obtenerXLSX: () => window.XLSX, guardar: vi.fn(async () => {}) });
  const tic = () => new Promise((r) => setTimeout(r, 0));
  it('completo por CSV: no pide el libro entero, contesta completo y guarda el libro en el equipo', async () => {
    libroEntero = xlsxDe(H1, [['Fecha'], ['x']]);
    const e = entorno();
    const r = await atenderLectura({ id: 1, realId: 'X', previas: {} }, e);
    expect(r).toMatchObject({ id: 1, ok: true, completo: true, orden: [H1, H2] });
    expect(r.cambiadas[H1][0].Supervivencia).toBe('85.5');
    expect(pedidas.some((u) => /export\?format=xlsx/.test(u) && !/gid=/.test(u))).toBe(false);
    await tic();
    expect(e.guardar).toHaveBeenCalledTimes(1);
  });

  it('incompleto por CSV: pide el libro entero (y usa ése)', async () => {
    csvPorGid[2222] = 500;
    libroEntero = xlsxDe(H2, [['Fecha', 'OD'], ['01/09/2026', 5]]);
    const r = await atenderLectura({ id: 2, realId: 'X', previas: {} }, entorno());
    expect(pedidas.some((u) => /export\?format=xlsx/.test(u) && !/gid=/.test(u))).toBe(true);
    expect(r.orden).toEqual([H2]);
    expect(r.completo).toBe(true);
  });
});
