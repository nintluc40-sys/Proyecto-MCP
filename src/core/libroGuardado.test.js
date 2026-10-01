/* ============================================================
   LIBRO GUARDADO en el equipo (P4 del plan de carga y refresco, 2026-10-01)

   La lógica —qué se escribe, cuándo caduca, cuándo NO se fía— sobre un almacén EN MEMORIA con la
   misma forma que almacenIDB(). El adaptador de IndexedDB se valida en Chrome real
   (Documents\validacion-2026-10-01\p4-guardado\). Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';
import { guardarLibro, cargarLibroGuardado, almacenIDB, CADUCIDAD_MS, VERSION_GUARDADO } from './libroGuardado.js';
import { huellasPorHoja, huellaDe } from './sheets.js';

function almacenMemoria() {
  const hojas = new Map();
  let meta = null;
  return {
    hojas,
    get meta() { return meta; },
    escrituras: [],
    leerMeta: vi.fn(async () => meta),
    leerHojas: vi.fn(async (ns) => ns.map((n) => hojas.get(n))),
    escribir: vi.fn(async function ({ poner, quitar, meta: m }) {
      this.escrituras.push(poner.map(([n]) => n));
      poner.forEach(([n, v]) => hojas.set(n, v));
      quitar.forEach((n) => hojas.delete(n));
      meta = m;
    }),
    vaciar: vi.fn(async () => { hojas.clear(); meta = null; }),
  };
}
const libro = (sheets, t = 1000) => {
  const huellas = huellasPorHoja(sheets);
  const orden = Object.keys(huellas);
  return { sheets, huellas, orden, fp: huellaDe(huellas, orden), t };
};
const S = (v) => ({ A: [{ x: v }], B: [{ y: 1 }] });

describe('guardarLibro', () => {
  it('la primera vez escribe todas las hojas y la meta', async () => {
    const a = almacenMemoria();
    expect(await guardarLibro(libro(S(1)), a)).toBe(2);
    expect([...a.hojas.keys()]).toEqual(['A', 'B']);
    expect(a.meta).toMatchObject({ v: VERSION_GUARDADO, orden: ['A', 'B'], t: 1000 });
    expect(a.meta.fp).toBe(huellaDe(huellasPorHoja(S(1))));
  });

  it('después, SÓLO las hojas que cambiaron respecto a lo GUARDADO; las que ya no están, se borran', async () => {
    const a = almacenMemoria();
    await guardarLibro(libro(S(1)), a);
    expect(await guardarLibro(libro(S(1), 2000), a)).toBe(0);
    expect(await guardarLibro(libro(S(2), 3000), a)).toBe(1);
    expect(a.escrituras.at(-1)).toEqual(['A']);
    expect(a.hojas.get('A').rows).toEqual([{ x: 2 }]);
    await guardarLibro(libro({ A: [{ x: 2 }] }, 4000), a);
    expect([...a.hojas.keys()]).toEqual(['A']);
    expect(a.meta.t).toBe(4000);
  });

  it('una meta de otra versión no cuenta: se reescribe todo', async () => {
    const a = almacenMemoria();
    await guardarLibro(libro(S(1)), a);
    a.meta.v = VERSION_GUARDADO + 1;
    expect(await guardarLibro(libro(S(1)), a)).toBe(2);
  });
});

describe('cargarLibroGuardado', () => {
  it('devuelve lo guardado como una descarga (hojas, huellas, huella global, fecha)', async () => {
    const a = almacenMemoria();
    const l = libro(S(1), 5000);
    await guardarLibro(l, a);
    const g = await cargarLibroGuardado(a, 5000 + 60000);
    expect(g).toEqual({ sheets: S(1), huellas: l.huellas, fp: l.fp, t: 5000 });
  });

  it('sin nada guardado, o de otra versión: null', async () => {
    const a = almacenMemoria();
    expect(await cargarLibroGuardado(a, 1)).toBeNull();
    await guardarLibro(libro(S(1)), a);
    a.meta.v = 99;
    expect(await cargarLibroGuardado(a, 1000)).toBeNull();
  });

  it('🔴 con MÁS de 7 días caduca: null y se borra (decisión del usuario)', async () => {
    const a = almacenMemoria();
    await guardarLibro(libro(S(1), 0), a);
    expect(await cargarLibroGuardado(a, CADUCIDAD_MS)).not.toBeNull(); // justo 7 días: aún vale
    expect(a.vaciar).not.toHaveBeenCalled();
    expect(await cargarLibroGuardado(a, CADUCIDAD_MS + 1)).toBeNull();
    expect(a.vaciar).toHaveBeenCalledTimes(1);
    expect(a.hojas.size).toBe(0);
  });

  it('si no cuadra (una hoja que falta o con otra huella), no se fía: null', async () => {
    const a = almacenMemoria();
    await guardarLibro(libro(S(1)), a);
    a.hojas.set('B', { rows: [{ y: 9 }], huella: 'otra' });
    expect(await cargarLibroGuardado(a, 1000)).toBeNull();
    const b = almacenMemoria();
    await guardarLibro(libro(S(1)), b);
    b.hojas.delete('A');
    expect(await cargarLibroGuardado(b, 1000)).toBeNull();
  });
});

describe('almacenIDB', () => {
  it('sin IndexedDB, falla (y quien lo usa lo trata como «no hay nada guardado»)', async () => {
    await expect(almacenIDB(undefined).leerMeta()).rejects.toThrow(/IndexedDB/);
  });
});
