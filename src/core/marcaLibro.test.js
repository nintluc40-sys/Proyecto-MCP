/* ============================================================
   MARCA DEL LIBRO (core/marcaLibro.js · punto 8, 2026-10-07)
   La consulta ligera devuelve la fecha de modificación del libro o null; con null el refresco descarga como siempre.
   Se exige: la marca de una respuesta {"ok":true,"mod":n}; null ante cualquier otra cosa (ok falso, mod raro, HTTP de
   error, red caída, respuesta que no llega a tiempo); y que con OTRO libro activo ni siquiera pregunte.
   ============================================================ */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { marcaDelLibro } from './marcaLibro.js';
import { store } from './store.js';
import { CONSULTA_CAMBIOS } from '../config.js';

const responde = (cuerpo, ok = true) => vi.fn(async () => ({ ok, json: async () => cuerpo }));
afterEach(() => { store.sheetsUrlOverride = ''; vi.useRealTimers(); });

describe('marcaDelLibro', () => {
  it('devuelve la marca de {"ok":true,"mod":n} y pregunta a la URL del script, sin caché', async () => {
    const pedir = responde({ ok: true, mod: 1791350026444 });
    expect(await marcaDelLibro(pedir)).toBe(1791350026444);
    expect(pedir).toHaveBeenCalledWith(CONSULTA_CAMBIOS.url, expect.objectContaining({ cache: 'no-store' }));
  });

  it('null ante ok falso, mod raro, HTTP de error o red caída', async () => {
    expect(await marcaDelLibro(responde({ ok: false, error: 'x' }))).toBe(null);
    expect(await marcaDelLibro(responde({ ok: true, mod: 'ayer' }))).toBe(null);
    expect(await marcaDelLibro(responde({ ok: true, mod: 0 }))).toBe(null);
    expect(await marcaDelLibro(responde({ ok: true, mod: 5 }, false))).toBe(null);
    expect(await marcaDelLibro(vi.fn(async () => { throw new Error('sin red'); }))).toBe(null);
  });

  it('null si no contesta a tiempo (se corta la petición)', async () => {
    vi.useFakeTimers();
    const pedir = vi.fn((url, { signal }) => new Promise((_, mal) => signal.addEventListener('abort', () => mal(new Error('abortada')))));
    const p = marcaDelLibro(pedir);
    await vi.advanceTimersByTimeAsync(CONSULTA_CAMBIOS.ms);
    expect(await p).toBe(null);
  });

  it('con OTRO libro activo no pregunta (la marca sería la de un archivo distinto)', async () => {
    store.sheetsUrlOverride = 'https://docs.google.com/spreadsheets/d/OTRO_LIBRO_123/edit';
    const pedir = responde({ ok: true, mod: 1 });
    expect(await marcaDelLibro(pedir)).toBe(null);
    expect(pedir).not.toHaveBeenCalled();
  });
});
