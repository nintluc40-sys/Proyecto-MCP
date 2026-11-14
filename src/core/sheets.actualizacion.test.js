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
import { connectSheets, setLectorLibro, getLastFingerprint, huellasPorHoja } from './sheets.js';
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

  /* 🔴 PUNTO 3 (pauta del 12-11) · LO QUE PASABA. En la PRIMERA carga, la lista de hojas que faltan se forzaba a vacía
     (no había set previo con el que comparar) y el aviso sólo saltaba con 1 hoja o menos: un libro que llegaba con 40 de
     44 hojas abría con la píldora en «40 hojas · hh:mm», como si todo estuviera bien, y esas vistas vacías sin explicación.
     🔑 AHORA (usuario: «Avisar hasta que llegue completo»): la descarga dice qué hojas NO llegaron (`faltantes`); la
     píldora lo dice y el evento lleva `incompleta` para que el shell saque un aviso con sus nombres. */
  describe('punto 3 · una carga INCOMPLETA se dice también la primera vez', () => {
    const conLector = (hojas, extra) => ({ disponible: () => true, leer: async () => {
      const cambiadas = Object.fromEntries(hojas.map((h, i) => [h, [{ Fecha: '01/09/2026', Corrida: '900', Tanque: 'T' + (i + 1), Valor: '1' }]]));
      return { ok: true, orden: hojas, huellas: huellasPorHoja(cambiadas), cambiadas, ...extra };
    } });
    let eventos;
    beforeEach(() => { store.connected = false; store.sheetNames = []; eventos = []; offs.push(on(EV.CONN, (e) => eventos.push(e))); });
    const final = () => eventos.filter((e) => e.state === 'connected').at(-1);

    it('primera carga con hojas de menos y su lista: «faltó 1 hoja (se reintenta)» e `incompleta` con su nombre', async () => {
      try {
        setLectorLibro(conLector(['Larvicultura M01', 'Larvicultura M02'], { completo: false, faltantes: ['Larvicultura M03'] }));
        expect(await connectSheets()).toBe(true);
        expect(store.sheetNames).toEqual(['Larvicultura M01', 'Larvicultura M02']);   // se aplica lo que llegó
        expect(final().label).toMatch(/^2 hojas · [^·]+ · faltó 1 hoja \(se reintenta\)$/);
        expect(final()).toMatchObject({ warn: false, incompleta: { faltan: ['Larvicultura M03'] } });
      } finally { setLectorLibro(null); }
    });

    it('sin saber qué pestañas hay (faltantes null): «llegó incompleto» y `incompleta` sin nombres', async () => {
      try {
        setLectorLibro(conLector(['Larvicultura M01', 'Larvicultura M02'], { completo: false }));
        await connectSheets();
        expect(final().label).toMatch(/^2 hojas · [^·]+ · llegó incompleto \(se reintenta\)$/);
        expect(final()).toMatchObject({ incompleta: { faltan: null } });
      } finally { setLectorLibro(null); }
    });

    it('completa: ni texto ni `incompleta` (control: la misma carga, con completo)', async () => {
      try {
        setLectorLibro(conLector(['Larvicultura M01', 'Larvicultura M02'], { completo: true }));
        await connectSheets();
        expect(final().label).toMatch(/^2 hojas · [^·]+$/);
        expect(final().incompleta).toBeUndefined();
      } finally { setLectorLibro(null); }
    });

    it('con 1 hoja sigue el aviso de siempre (`warn`), no el de incompleta', async () => {
      try {
        setLectorLibro(conLector(['Larvicultura M01'], { completo: false, faltantes: ['Larvicultura M02'] }));
        await connectSheets();
        expect(final()).toMatchObject({ warn: true });
        expect(final().incompleta).toBeUndefined();
      } finally { setLectorLibro(null); }
    });
  });

  it('carga lenta D (2026-10-19) · la página le pasa al Worker las pestañas que recuerda y guarda las que él trae', async () => {
    const LISTA = [{ gid: 11, title: 'Larvicultura M01' }, { gid: 22, title: 'Larvicultura M02' }];
    const recibidas = [];
    const lector = { disponible: () => true, leer: async ({ previas, pestanas }) => { recibidas.push(pestanas); return {
      ok: true, orden: ['Larvicultura M01'], huellas: { 'Larvicultura M01': previas['Larvicultura M01'] }, cambiadas: {}, completo: true, pestanas: LISTA }; } };
    try {
      localStorage.removeItem('larv4_sheet_tabs');
      setLectorLibro(lector);
      await connectSheets();
      expect(recibidas[0], 'la primera vez no recuerda ninguna').toEqual([]);
      expect(Object.values(JSON.parse(localStorage.getItem('larv4_sheet_tabs')))).toEqual([LISTA]);
      await connectSheets();
      expect(recibidas[1], 'la siguiente lleva la que trajo el Worker').toEqual(LISTA);
    } finally { setLectorLibro(null); localStorage.removeItem('larv4_sheet_tabs'); }
  });
});
