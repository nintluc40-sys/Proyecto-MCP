// @vitest-environment happy-dom
/* ============================================================
   LECTURA POR HOJAS (P1 del plan de carga y refresco, 2026-10-01)

   El libro se lee en un Worker y sólo viajan las hojas que cambiaron. Aquí se fija:
   · `dense: true` no cambia NADA de lo que se lee (Excel REAL con fechas, horas, textos con salto
     de línea, números, booleanos, vacíos y errores), sólo cómo lo guarda SheetJS por dentro;
   · la huella por hoja reproduce exactamente dataFingerprint;
   · el delta y su fusión (lo que no cambió sale de lo APLICADO);
   · descargarLibro: con el lector, sólo las hojas cambiadas; si el Worker no lee el XLSX, el CSV;
     si no arranca, el camino de siempre; si se CAE con datos cargados, error (no se lee aquí);
   · la lógica del Worker (atenderLectura) con el SheetJS del proyecto.
   Google simulado (fetch); datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  XLSX_LECTURA, workbookToSheets, dataFingerprint, huellasPorHoja, huellaDe, planDelta, fundirDelta,
  descargarLibro, aplicarDescarga, setLectorLibro, lecturaEnSegundoPlano, getLastFingerprint,
} from './sheets.js';
import { atenderLectura, responder } from './sheets.worker.js';
import { store } from './store.js';

const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
const serie = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5);

/** Un libro con las celdas que más cuesta leer bien, en dos hojas. */
function libroDificil(sv = 85.5) {
  const X = window.XLSX;
  const wb = X.utils.book_new();
  const ws = X.utils.aoa_to_sheet([
    ['Fecha', 'Hora', 'Tanque', 'Supervivencia', 'Observaciones', 'Activo', 'Cálculo', 'Vacía'],
    [null, null, 'T1', sv, 'línea 1\nlínea 2', true, null, null],
    [null, null, 'T2', 80, '', false, null, ''],
    [null, null, 'T3', '85,5', 'con "comillas"', null, null, null],
  ]);
  ws.A2 = { t: 'n', v: serie(2026, 9, 1), z: 'dd/mm/yyyy' };
  ws.A3 = { t: 'n', v: serie(2026, 9, 2) + 0.5, z: 'dd/mm/yyyy hh:mm' };
  ws.A4 = { t: 'd', v: new Date(Date.UTC(2026, 8, 3)) };
  ws.B2 = { t: 'n', v: 0.25, z: 'h:mm' };
  ws.G2 = { t: 'e', v: 0x2A };
  ws.G3 = { t: 'n', v: 3, f: 'A1+1' };
  X.utils.book_append_sheet(wb, ws, 'Larvicultura M01');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Fecha', 'Tanque', 'pH'], ['01/09/2026', 'A1', 8.1]]), 'Control_Tanque M01');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([]), 'Vacía');
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}

let fetchReal;
let servir; // bytes del export XLSX que contesta el Google simulado (null = 404)
const pedidas = [];
beforeAll(() => {
  new Function(readFileSync(VENDOR, 'utf8'))(); // su cola UMD deja window.XLSX, como el <script> de index.html
  fetchReal = globalThis.fetch;
  globalThis.fetch = async (url) => {
    pedidas.push(String(url));
    if (/export\?format=xlsx/.test(String(url)) && servir) return { ok: true, status: 200, arrayBuffer: async () => servir.slice(0) };
    return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  };
});
afterAll(() => { globalThis.fetch = fetchReal; setLectorLibro(null); });
beforeEach(() => { pedidas.length = 0; servir = libroDificil(); });

describe('dense: true no cambia lo que se lee', () => {
  it('mismas filas, mismas claves, mismos valores que sin dense (Excel real)', () => {
    const X = window.XLSX;
    const bytes = new Uint8Array(libroDificil());
    expect(XLSX_LECTURA.dense).toBe(true);
    const conDense = workbookToSheets(X.read(bytes, XLSX_LECTURA), X);
    const sinDense = workbookToSheets(X.read(bytes, { ...XLSX_LECTURA, dense: false }), X);
    expect(Object.keys(conDense)).toEqual(['Larvicultura M01', 'Control_Tanque M01']); // la vacía no entra
    expect(conDense).toEqual(sinDense);
    // Sonda del fixture: las celdas difíciles están de verdad en lo leído.
    const f = conDense['Larvicultura M01'];
    expect(f[0].Observaciones).toBe('línea 1\nlínea 2');
    expect(f[0].Fecha).toBe('01/09/2026');
    expect(f.length).toBe(3);
  });
});

describe('huellas por hoja, delta y fusión', () => {
  const s = (v) => ({ A: [{ x: v }], B: [{ y: 1 }, { y: 2 }], C: [] });
  it('las huellas de cada hoja, unidas, son exactamente dataFingerprint', () => {
    expect(huellaDe(huellasPorHoja(s(1)))).toBe(dataFingerprint(s(1)));
    expect(Object.keys(huellasPorHoja(s(1)))).toEqual(['A', 'B']);
  });
  it('sin previas, todas cambian; con las mismas, ninguna; si cambia una, sólo esa', () => {
    expect(Object.keys(planDelta({}, s(1)).cambiadas)).toEqual(['A', 'B']);
    const h = huellasPorHoja(s(1));
    expect(Object.keys(planDelta(h, s(1)).cambiadas)).toEqual([]);
    const d = planDelta(h, s(2));
    expect(Object.keys(d.cambiadas)).toEqual(['A']);
    expect(d.orden).toEqual(['A', 'B']);
    expect(huellaDe(d.huellas, d.orden)).toBe(dataFingerprint(s(2)));
  });
  it('una hoja nueva viaja; una que desaparece deja de estar en el orden', () => {
    const h = huellasPorHoja(s(1));
    const d = planDelta(h, { A: [{ x: 1 }], D: [{ z: 1 }] });
    expect(Object.keys(d.cambiadas)).toEqual(['D']);
    expect(d.orden).toEqual(['A', 'D']);
  });
  it('fundir: lo cambiado nuevo, lo demás de lo aplicado, en el orden del libro', () => {
    const aplicadas = s(1);
    const d = planDelta(huellasPorHoja(aplicadas), { B: aplicadas.B, A: [{ x: 9 }] });
    const f = fundirDelta(aplicadas, d);
    expect(Object.keys(f)).toEqual(['B', 'A']);
    expect(f.A).toEqual([{ x: 9 }]);
    expect(f.B).toBe(aplicadas.B); // la MISMA referencia: no se copia lo que no cambió
  });
  it('un delta incoherente (hoja sin cambios que no está aplicada) es un error', () => {
    expect(() => fundirDelta({}, { orden: ['A'], cambiadas: {} })).toThrow(/incoherente/);
  });
});

describe('descargarLibro', () => {
  const lector = (respuesta) => ({ disponible: () => true, leer: vi.fn(async () => respuesta) });
  beforeEach(() => {
    setLectorLibro(null);
    store.connected = false;
    store.sheetNames = [];
    store.globalData = [];
  });

  it('sin lector (o sin Worker), lee aquí el libro entero con su huella', async () => {
    const d = await descargarLibro();
    expect(Object.keys(d.sheets)).toEqual(['Larvicultura M01', 'Control_Tanque M01']);
    expect(d.fp).toBe(dataFingerprint(d.sheets));
    expect(pedidas.some((u) => /export\?format=xlsx/.test(u))).toBe(true);
    expect(lecturaEnSegundoPlano()).toBe(false);
  });

  it('con el lector, funde las hojas cambiadas con lo aplicado y le pasa las huellas aplicadas', async () => {
    const base = await descargarLibro();
    aplicarDescarga(base);
    const nuevaM01 = [{ Fecha: '01/09/2026', Tanque: 'T1', Supervivencia: 70 }];
    const ahora = { ...base.sheets, 'Larvicultura M01': nuevaM01 };
    const delta = planDelta(base.huellas, ahora);
    const l = lector({ ok: true, ...delta, cambiadas: { 'Larvicultura M01': nuevaM01 } });
    setLectorLibro(l);
    pedidas.length = 0;
    const d = await descargarLibro();
    expect(l.leer).toHaveBeenCalledWith(expect.objectContaining({ previas: base.huellas }));
    expect(d.sheets['Larvicultura M01']).toBe(nuevaM01);
    expect(d.sheets['Control_Tanque M01']).toBe(base.sheets['Control_Tanque M01']);
    expect(d.fp).toBe(dataFingerprint(ahora));
    expect(pedidas).toEqual([]); // el hilo principal no descargó nada
    expect(lecturaEnSegundoPlano()).toBe(true);
  });

  it('aplicarDescarga fija la huella global y la de cada hoja', async () => {
    const d = await descargarLibro();
    expect(aplicarDescarga(d)).toBeGreaterThan(0);
    expect(getLastFingerprint()).toBe(d.fp);
    const l = lector({ ok: true, orden: [], huellas: {}, cambiadas: {} });
    setLectorLibro(l);
    await descargarLibro().catch(() => {});
    expect(l.leer.mock.calls[0][0].previas).toBe(d.huellas);
  });

  /* 2026-10-01 · el respaldo pide ahora cada hoja por SU XLSX (`&gid=`, inmune a los filtros: sheets.respaldo.test.js);
     lo que aquí se fija es que el libro ENTERO (sin gid) no se reintenta en la página. */
  it('si el Worker no puede leer el XLSX, va al respaldo por hojas (no reintenta el libro entero aquí)', async () => {
    setLectorLibro(lector({ ok: false, motivo: 'xlsx' }));
    await descargarLibro();
    expect(pedidas.some((u) => /export\?format=xlsx/.test(u) && !/[?&]gid=/.test(u))).toBe(false);
    expect(pedidas.some((u) => /htmlview/.test(u))).toBe(true);
  });

  it('si el Worker no arranca, el camino de siempre', async () => {
    setLectorLibro(lector({ ok: false, motivo: 'no-arranca' }));
    const d = await descargarLibro();
    expect(Object.keys(d.sheets).length).toBe(2);
    expect(pedidas.some((u) => /export\?format=xlsx/.test(u))).toBe(true);
  });

  it('si se CAE con datos ya cargados: error y no se lee aquí; en la carga inicial, sí se lee aquí', async () => {
    store.connected = true;
    setLectorLibro(lector({ ok: false, motivo: 'caido' }));
    await expect(descargarLibro()).rejects.toThrow(/segundo plano/);
    expect(pedidas).toEqual([]);
    setLectorLibro(lector({ ok: false, motivo: 'tiempo' }));
    await expect(descargarLibro()).rejects.toThrow(/segundo plano/);
    store.connected = false;
    setLectorLibro(lector({ ok: false, motivo: 'caido' }));
    const d = await descargarLibro();
    expect(Object.keys(d.sheets).length).toBe(2);
  });
});

describe('Worker · responder (hojas de a una, 2026-10-06)', () => {
  it('cada hoja cambiada en su mensaje { id, hoja, filas } y al final la respuesta SIN las filas', () => {
    const enviados = [];
    const A = [{ x: 1 }], B = [{ y: 2 }];
    responder({ id: 7, ok: true, orden: ['A', 'B', 'C'], huellas: { A: 'a', B: 'b', C: 'c' }, cambiadas: { A, B } }, (m) => enviados.push(m));
    expect(enviados).toEqual([
      { id: 7, hoja: 'A', filas: A },
      { id: 7, hoja: 'B', filas: B },
      { id: 7, ok: true, orden: ['A', 'B', 'C'], huellas: { A: 'a', B: 'b', C: 'c' } },
    ]);
  });
  it('sin hojas cambiadas, o con un fallo, un solo mensaje tal cual', () => {
    const enviados = [];
    responder({ id: 1, ok: true, orden: ['A'], huellas: { A: 'a' }, cambiadas: {} }, (m) => enviados.push(m));
    responder({ id: 2, ok: false, motivo: 'xlsx', error: 'x' }, (m) => enviados.push(m));
    expect(enviados).toEqual([{ id: 1, ok: true, orden: ['A'], huellas: { A: 'a' } }, { id: 2, ok: false, motivo: 'xlsx', error: 'x' }]);
  });
});

describe('Worker · atenderLectura', () => {
  const entorno = () => {
    let X = null;
    return { cargarXLSX: vi.fn(() => { X = window.XLSX; }), obtenerXLSX: () => X };
  };

  it('carga SheetJS una vez, lee y devuelve SÓLO las hojas cambiadas', async () => {
    const e = entorno();
    const r1 = await atenderLectura({ id: 1, realId: 'X', xlsxUrl: 'vendor/xlsx.full.min.js', previas: {} }, e);
    expect(r1.ok).toBe(true);
    expect(r1.id).toBe(1);
    expect(e.cargarXLSX).toHaveBeenCalledWith('vendor/xlsx.full.min.js');
    expect(Object.keys(r1.cambiadas)).toEqual(['Larvicultura M01', 'Control_Tanque M01']);
    servir = libroDificil(70);
    const r2 = await atenderLectura({ id: 2, realId: 'X', xlsxUrl: 'vendor/xlsx.full.min.js', previas: r1.huellas }, e);
    expect(e.cargarXLSX).toHaveBeenCalledTimes(1);
    expect(Object.keys(r2.cambiadas)).toEqual(['Larvicultura M01']);
    expect(r2.orden).toEqual(r1.orden);
  });

  it('P4: después de leer, GUARDA el libro ENTERO (aunque no viaje ninguna hoja) con su huella y su fecha', async () => {
    const e = entorno();
    const r1 = await atenderLectura({ id: 6, realId: 'X', previas: {} }, e);
    e.guardar = vi.fn(async () => {});
    const antes = Date.now();
    const r2 = await atenderLectura({ id: 7, realId: 'X', previas: r1.huellas }, e);
    expect(Object.keys(r2.cambiadas)).toEqual([]); // no viajó nada…
    await new Promise((r) => setTimeout(r, 0));
    expect(e.guardar).toHaveBeenCalledTimes(1); // …pero se guarda el libro entero
    const l = e.guardar.mock.calls[0][0];
    expect(Object.keys(l.sheets)).toEqual(['Larvicultura M01', 'Control_Tanque M01']);
    expect(l.orden).toEqual(r2.orden);
    expect(l.huellas).toEqual(r2.huellas);
    expect(l.fp).toBe(huellaDe(r2.huellas, r2.orden));
    expect(l.t).toBeGreaterThanOrEqual(antes);
  });

  it('P4: si guardar falla, la lectura contesta igual', async () => {
    const e = entorno();
    e.guardar = () => Promise.reject(new Error('cuota'));
    expect(await atenderLectura({ id: 8, realId: 'X', previas: {} }, e)).toMatchObject({ id: 8, ok: true });
  });

  it('la huella del Worker es la misma que la del hilo principal con los mismos bytes', async () => {
    const r = await atenderLectura({ id: 3, realId: 'X', previas: {} }, entorno());
    const aqui = await descargarLibro();
    expect(huellaDe(r.huellas, r.orden)).toBe(aqui.fp);
  });

  it('sin SheetJS: «sin-xlsx»; export que no se puede leer: «xlsx»', async () => {
    const roto = { cargarXLSX: () => { throw new Error('404'); }, obtenerXLSX: () => null };
    expect(await atenderLectura({ id: 4, realId: 'X' }, roto)).toMatchObject({ id: 4, ok: false, motivo: 'sin-xlsx' });
    servir = null; // 404 → reintenta (pausas de 0,6 y 1,2 s) y se rinde
    expect(await atenderLectura({ id: 5, realId: 'X' }, entorno())).toMatchObject({ id: 5, ok: false, motivo: 'xlsx' });
  });
});
