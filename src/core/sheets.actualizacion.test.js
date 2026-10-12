// @vitest-environment happy-dom
/* ============================================================
   ⟳ Y LA PÍLDORA (connectSheets → commit) · correcciones de la actualización (2026-10-11, usuario, punto 4.2-A)

   🔴 A2 · LO QUE PASABA. Cada ⟳ aplicaba lo descargado y emitía EV.DATA aunque fuera exactamente lo que ya estaba en
   pantalla: las vistas recalculaban en balde y Planta sacaba «Hay datos nuevos» sin haberlos.

   Google simulado (fetch) con un Excel REAL escrito con el SheetJS del proyecto; la lectura es la de producción
   (sin Worker: connectSheets → descargarLibro → fetchAllSheets). Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectSheets, setLectorLibro, getLastFingerprint } from './sheets.js';
import { store, on, EV } from './store.js';

const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
let fetchReal;
let bytes;

/** Un libro de las hojas `hojas`, cada una con un valor que distingue la versión. */
function libro(v, hojas = ['Larvicultura M01', 'Larvicultura M02']) {
  const X = window.XLSX;
  const wb = X.utils.book_new();
  hojas.forEach((hoja, i) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
    ['Fecha', 'Corrida', 'Tanque', 'Valor'], ['01/09/2026', 900, 'T' + (i + 1), v],
  ]), hoja));
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}

let datos, etiquetas, offs;
beforeAll(() => {
  new Function(readFileSync(VENDOR, 'utf8'))(); // su cola UMD deja window.XLSX, como el <script> de index.html
  fetchReal = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.slice(0) });
  setLectorLibro(null);
});
afterAll(() => { globalThis.fetch = fetchReal; });
beforeEach(async () => {
  store.connected = false; store.sheetNames = []; store.globalData = [];
  bytes = libro(1);
  expect(await connectSheets()).toBe(true);   // la carga inicial
  datos = []; etiquetas = [];
  offs = [on(EV.DATA, (d) => datos.push(d)), on(EV.CONN, (e) => etiquetas.push(e.label))];
  return () => offs.forEach((f) => f());
});

describe('A2 · ⟳ con lo mismo que ya está aplicado', () => {
  it('no aplica ni emite EV.DATA, y la píldora dice «sin cambios»; con cambios, aplica y avisa', async () => {
    const antes = store.globalData, huella = getLastFingerprint();
    expect(await connectSheets()).toBe(true);
    expect(datos).toEqual([]);
    expect(store.globalData).toBe(antes);
    expect(getLastFingerprint()).toBe(huella);
    expect(etiquetas.at(-1)).toMatch(/^2 hojas · .* · sin cambios$/);
    bytes = libro(2);
    expect(await connectSheets()).toBe(true);
    expect(datos).toHaveLength(1);
    expect(datos[0]).toMatchObject({ firstLoad: false, manual: true });   // A1: lo pidió el usuario (Planta lo pinta ya)
    expect(store.globalData.find((r) => r.Tanque === 'T1').Valor).toBe('2');
    expect(etiquetas.at(-1)).not.toMatch(/sin cambios/);
  });
});

/* 🔴 A4 · LO QUE PASABA. Una descarga con MENOS hojas que las aplicadas se descartaba siempre y en silencio: si una
   pestaña se vaciaba o se borraba, cada refresco quedaba descartado (la píldora en «N hojas · hh:mm») hasta recargar. */
describe('A4 · ⟳ con hojas de menos', () => {
  it('con el libro ENTERO (lista completa), la que falta se vació o se borró: se aplica y la píldora lo dice', async () => {
    bytes = libro(1, ['Larvicultura M01']);
    expect(await connectSheets()).toBe(true);
    expect(datos).toHaveLength(1);
    expect(store.sheetNames).toEqual(['Larvicultura M01']);
    expect(etiquetas.at(-1)).toMatch(/^1 hoja · .* · 1 hoja vacía o borrada$/);
  });

  it('con una descarga INCOMPLETA (alguna hoja no llegó) no se aplica, y la píldora lo dice; completa, se aplica', async () => {
    const soloM01 = (completo) => ({ disponible: () => true, leer: async ({ previas }) => ({
      ok: true, orden: ['Larvicultura M01'], huellas: { 'Larvicultura M01': previas['Larvicultura M01'] }, cambiadas: {}, completo }) });
    try {
      setLectorLibro(soloM01(false));
      expect(await connectSheets()).toBe(true);
      expect(datos).toEqual([]);
      expect(store.sheetNames).toHaveLength(2);
      expect(etiquetas.at(-1)).toMatch(/· faltó 1 hoja \(se reintenta\)$/);
      setLectorLibro(soloM01(true));
      expect(await connectSheets()).toBe(true);
      expect(datos).toHaveLength(1);
      expect(store.sheetNames).toEqual(['Larvicultura M01']);
    } finally { setLectorLibro(null); }
  });
});
