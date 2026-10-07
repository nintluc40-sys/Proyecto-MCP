// @vitest-environment happy-dom
/* ============================================================
   DESCARGA CON LA RED ATASCADA (punto 9 del usuario, 2026-10-07)

   🔴 LO QUE PASABA. El reloj de cada descarga (fetchWithTimeout) se apagaba al llegar las cabeceras y el cuerpo se leía
   sin límite: con la red atascada a mitad del libro, la descarga esperaba PARA SIEMPRE, sin reintentar ni fallar, con
   la píldora fija en «Descargando el libro… 0,5 MB» (medido el 06-10: 14 min; reproducido el 07-10 con la función real).

   🔑 AHORA: el cuerpo se corta si pasan SIN_DATOS_MS sin recibir nada, y entran los reintentos (3) y el respaldo de
   siempre; con `avisar` (la primera carga) cada reintento lo dice. Una red LENTA que sigue llegando NO se corta.
   Google simulado con un flujo (ReadableStream) que se puede atascar; el libro lento es un XLSX real (SheetJS del repo).
   ============================================================ */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchXlsxSheets, textoProgreso } from './sheets.js';
import { SIN_DATOS_MS } from '../config.js';

const KB = 1024;
beforeAll(() => { new Function(readFileSync(join(process.cwd(), 'public/vendor/xlsx.full.min.js'), 'utf8'))(); });
afterEach(() => { vi.useRealTimers(); delete globalThis.fetch; });

/** Google que entrega `trozos` (uno cada `cada` ms) y después se queda callado (atascado) o cierra. */
function google({ trozos, cada = 0, atascar }) {
  const pedidas = [];
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    pedidas.push(url);
    const cuerpo = new ReadableStream({
      start(c) {
        if (opts.signal) opts.signal.addEventListener('abort', () => { try { c.error(new DOMException('cortada', 'AbortError')); } catch (_) { /* ya cerrado */ } });
        trozos.forEach((t, i) => setTimeout(() => { try { c.enqueue(t); if (i === trozos.length - 1 && !atascar) c.close(); } catch (_) { /* cortada */ } }, cada * (i + 1)));
      },
    });
    return new Response(cuerpo, { status: 200 });
  });
  return pedidas;
}
const xlsxReal = () => {
  const X = window.XLSX, wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Fecha', 'Tanque', 'Valor'], ['01/09/2026', 'T1', 7], ['01/09/2026', 'T2', 8]]), 'Larvicultura M01');
  return new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
};

describe('descarga del libro · la red se atasca a mitad del cuerpo', () => {
  it('se corta a los SIN_DATOS_MS sin datos, REINTENTA (3 en total) diciéndolo, y deja paso al respaldo', async () => {
    vi.useFakeTimers();
    const pedidas = google({ trozos: [new Uint8Array(600 * KB)], cada: 10, atascar: true });
    const avisos = [];
    let fin = null;
    fetchXlsxSheets({ type: 'real', realId: 'X' }, () => window.XLSX, (p) => avisos.push(p)).then((r) => { fin = r; });
    await vi.advanceTimersByTimeAsync(SIN_DATOS_MS - 1000);
    expect(fin).toBe(null);
    expect(pedidas).toHaveLength(1);   // antes de los SIN_DATOS_MS sigue esperando…
    await vi.advanceTimersByTimeAsync(1000 + 600 + 20);
    expect(pedidas).toHaveLength(2);   // …y al cumplirse se corta y reintenta
    expect(avisos.find((a) => a.fase === 'reintento')).toEqual({ fase: 'reintento', intento: 2, de: 3, bytes: 600 * KB, atascada: true });
    await vi.advanceTimersByTimeAsync(SIN_DATOS_MS + 1200 + 20);
    expect(pedidas).toHaveLength(3);
    expect(avisos.filter((a) => a.fase === 'reintento').map((a) => a.intento)).toEqual([2, 3]);
    expect(avisos.some((a) => a.fase === 'descarga' && a.intento === 3)).toBe(true);   // el intento en curso va en sus avisos
    await vi.advanceTimersByTimeAsync(SIN_DATOS_MS + 20);
    expect(fin).toBe(null);            // los 3 cortados: null = el llamador pasa al respaldo hoja a hoja
    expect(pedidas).toHaveLength(3);
  });

  it('una red LENTA que sigue llegando no se corta: trozos cada (SIN_DATOS_MS − 5 s) y el libro se lee entero', async () => {
    vi.useFakeTimers();
    const libro = xlsxReal(), mitad = Math.ceil(libro.length / 3);
    const trozos = [libro.slice(0, mitad), libro.slice(mitad, 2 * mitad), libro.slice(2 * mitad)];
    const pedidas = google({ trozos, cada: SIN_DATOS_MS - 5000 });
    let fin = null;
    fetchXlsxSheets({ type: 'real', realId: 'X' }, () => window.XLSX, () => {}).then((r) => { fin = r; });
    await vi.advanceTimersByTimeAsync(3 * SIN_DATOS_MS);
    expect(pedidas).toHaveLength(1);   // ni un reintento: nunca pasaron SIN_DATOS_MS sin datos
    expect(Object.keys(fin)).toEqual(['Larvicultura M01']);
    expect(fin['Larvicultura M01'].map((r) => r.Valor)).toEqual(['7', '8']);
  });
});

describe('aviso de carga · reintentos y respaldo (textoProgreso)', () => {
  it('dice cuándo la red no avanzó y en qué intento va; y cuándo pasa a hoja por hoja', () => {
    expect(textoProgreso({ fase: 'reintento', intento: 2, de: 3, bytes: 512 * KB, atascada: true })).toBe('Descargando el libro… 0,5 MB · la red no avanza, reintento 2 de 3');
    expect(textoProgreso({ fase: 'reintento', intento: 3, de: 3, bytes: 0, atascada: false })).toBe('Descargando el libro… 0,0 MB · reintento 3 de 3');
    expect(textoProgreso({ fase: 'descarga', bytes: 1024 * KB, intento: 2, de: 3 })).toBe('Descargando el libro… 1,0 MB · intento 2 de 3');
    expect(textoProgreso({ fase: 'descarga', bytes: 1024 * KB })).toBe('Descargando el libro… 1,0 MB');
    expect(textoProgreso({ fase: 'respaldo' })).toBe('El libro entero no llegó: probando hoja por hoja…');
  });
});
