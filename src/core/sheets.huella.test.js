// @vitest-environment happy-dom
/* ============================================================
   HUELLA DE LA CARGA INICIAL = la que calcula el auto-refresco con los MISMOS bytes (2026-09-24)

   🔴 LO QUE PASABA. commit() calculaba la huella DESPUÉS de applySheets, y applySheets corre
   autoCalcMortalidad, que añade «Mortalidad» a las filas que traen Supervivencia sin ella. El
   auto-refresco calcula la suya sobre filas recién descargadas, sin esa columna. Resultado: el
   primer refresco tras abrir nunca decía «sin cambios» y repintaba la vista en balde.

   Aquí el Google es simulado (fetch) pero el Excel es REAL, escrito con el SheetJS del proyecto,
   y la lectura es la de producción (connectSheets → fetchAllSheets → workbookToSheets). Datos
   ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectSheets, fetchAllSheets, dataFingerprint, getLastFingerprint } from './sheets.js';
import { store } from './store.js';

const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
let fetchReal;
let bytes;

/** Un libro de DOS hojas de Larvicultura: Supervivencia SIN Mortalidad (la que autoCalcMortalidad completa). */
function libro() {
  const X = window.XLSX;
  const wb = X.utils.book_new();
  for (const [hoja, tq] of [['Larvicultura M01', 'T1'], ['Larvicultura M02', 'T2']]) {
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
      ['Fecha', 'Corrida', 'Tanque', 'Supervivencia'],
      ['01/09/2026', 900, tq, 85.5],
      ['02/09/2026', 900, tq, 80],
    ]), hoja);
  }
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}

beforeAll(() => {
  new Function(readFileSync(VENDOR, 'utf8'))(); // su cola UMD deja window.XLSX, como el <script> de index.html
  bytes = libro();
  fetchReal = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.slice(0) });
  store.connected = false;
  store.sheetNames = [];
  store.globalData = [];
});

afterAll(() => { globalThis.fetch = fetchReal; });

describe('commit · la huella se calcula sobre las filas tal como llegan', () => {
  it('la carga inicial siembra la MISMA huella que un refresco con los mismos bytes', async () => {
    expect(await connectSheets()).toBe(true);
    // Sonda del fixture: autoCalcMortalidad SÍ tocó las filas aplicadas; si no, esta prueba no probaría nada.
    expect(store.globalData.length).toBe(4);
    expect(store.globalData.every((r) => r.Mortalidad !== undefined)).toBe(true);
    const refresco = await fetchAllSheets();
    expect(Object.values(refresco).flat().some((r) => r.Mortalidad !== undefined)).toBe(false);
    expect(getLastFingerprint()).toBe(dataFingerprint(refresco));
  });
});
