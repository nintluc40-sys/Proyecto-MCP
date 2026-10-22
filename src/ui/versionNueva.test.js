// @vitest-environment happy-dom
// B1 (2026-10-19) · el aviso de VERSIÓN NUEVA. Una pestaña o una PWA abierta seguía con el código con el que se abrió
// aunque se publicara otro. Se vigila: que avise SÓLO cuando lo publicado es otro build (ni sin sellar, ni sin red, ni con
// la misma huella), cuándo pregunta, que no se repita la franja, que × la cierre y vuelva en la siguiente comprobación,
// que «Recargar» recargue y que no recargue sola, y que le pida al service worker que mire si hay otro.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { huellaPropia, huellaPublicada, vigilarVersion, hayOtroBuild, CADA } from './versionNueva.js';

const PROPIA = 'aaaaaaaaaaaa';
const OTRA = 'bbbbbbbbbbbb';

function ponerMeta(valor) {
  document.head.innerHTML = valor === null ? '' : `<meta name="mcp-build" content="${valor}">`;
}
/** Red de mentira para version.json: devuelve `build`, o falla si es un Error. */
function red(build) {
  const llamadas = [];
  const fn = async (url, init) => {
    llamadas.push({ url, init });
    if (build instanceof Error) throw build;
    if (build === 404) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ build }) };
  };
  fn.llamadas = llamadas;
  return fn;
}
const franja = () => document.querySelector('.app-version-nueva');
const esperar = () => new Promise((r) => setTimeout(r, 0));

let parar = () => {};
let visibilidad = 'visible';
beforeEach(() => {
  document.body.innerHTML = '';
  visibilidad = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidad });
});
afterEach(() => { parar(); parar = () => {}; vi.useRealTimers(); });

describe('versionNueva · qué build corre y cuál está publicado', () => {
  it('la huella propia sale de la <meta>; sin ella o sin sellar (dev, pruebas) es null', () => {
    ponerMeta(PROPIA); expect(huellaPropia()).toBe(PROPIA);
    ponerMeta('sin-sellar'); expect(huellaPropia()).toBe(null);
    ponerMeta(null); expect(huellaPropia()).toBe(null);
  });

  it('🔴 la publicada se pide SIN caché, y sin red, 404 o respuesta rara es null (no se avisa a ciegas)', async () => {
    const f = red(OTRA);
    expect(await huellaPublicada(f)).toBe(OTRA);
    expect(f.llamadas[0].url).toBe('./version.json');
    expect(f.llamadas[0].init).toEqual({ cache: 'no-store' });
    expect(await huellaPublicada(red(new Error('sin conexión')))).toBe(null);
    expect(await huellaPublicada(red(404))).toBe(null);
    expect(await huellaPublicada(red(''))).toBe(null);
  });
});

describe('versionNueva · la franja', () => {
  it('🔴 con OTRO build publicado sale la franja, con Recargar y ×, y se le pide al service worker que mire', async () => {
    ponerMeta(PROPIA);
    const update = vi.fn(async () => {});
    parar = vigilarVersion({ fetchFn: red(OTRA), registro: () => ({ update }) });
    await esperar();
    expect(franja(), 'no avisó').toBeTruthy();
    expect(franja().textContent).toContain('Hay una versión nueva de la app');
    expect(franja().querySelector('[data-accion="recargar"]').textContent).toBe('Recargar');
    expect(franja().querySelector('[data-accion="cerrar"]').getAttribute('aria-label')).toBe('Cerrar el aviso');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('🔴 con el MISMO build, sin red o sin sellar, NO sale nada', async () => {
    ponerMeta(PROPIA);
    parar = vigilarVersion({ fetchFn: red(PROPIA) });
    await esperar();
    expect(franja()).toBe(null);
    parar();
    parar = vigilarVersion({ fetchFn: red(new Error('sin conexión')) });
    await esperar();
    expect(franja()).toBe(null);
    parar();
    ponerMeta('sin-sellar');
    const f = red(OTRA);
    parar = vigilarVersion({ fetchFn: f });
    await esperar();
    expect(franja()).toBe(null);
    expect(f.llamadas, 'sin sellar ni siquiera pregunta').toHaveLength(0);
  });

  it('🔴 «Recargar» recarga; la franja NO recarga sola', async () => {
    ponerMeta(PROPIA);
    const reload = vi.fn();
    const win = Object.assign(new EventTarget(), { location: { reload }, setInterval: (f, t) => setInterval(f, t), clearInterval: (id) => clearInterval(id) });
    parar = vigilarVersion({ fetchFn: red(OTRA), win });
    await esperar();
    expect(reload).not.toHaveBeenCalled();
    franja().querySelector('[data-accion="recargar"]').click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('🔴 × la cierra y vuelve en la siguiente comprobación; nunca salen dos', async () => {
    ponerMeta(PROPIA);
    parar = vigilarVersion({ fetchFn: red(OTRA) });
    await esperar();
    window.dispatchEvent(new Event('online'));
    await esperar();
    expect(document.querySelectorAll('.app-version-nueva')).toHaveLength(1);
    franja().querySelector('[data-accion="cerrar"]').click();
    expect(franja()).toBe(null);
    window.dispatchEvent(new Event('online'));
    await esperar();
    expect(franja(), 'no volvió').toBeTruthy();
  });
});

describe('versionNueva · cuándo pregunta', () => {
  it('🔴 al arrancar, al volver a primer plano y al recuperar la red; oculta, no', async () => {
    ponerMeta(PROPIA);
    const f = red(PROPIA);
    parar = vigilarVersion({ fetchFn: f });
    await esperar();
    expect(f.llamadas).toHaveLength(1);
    visibilidad = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    await esperar();
    expect(f.llamadas, 'preguntó con la app oculta').toHaveLength(1);
    visibilidad = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await esperar();
    expect(f.llamadas).toHaveLength(2);
    window.dispatchEvent(new Event('online'));
    await esperar();
    expect(f.llamadas).toHaveLength(3);
  });

  it('🔴 cada 30 min con la app a la vista, y al pararla deja de preguntar', async () => {
    vi.useFakeTimers();
    ponerMeta(PROPIA);
    const f = red(PROPIA);
    parar = vigilarVersion({ fetchFn: f });
    await vi.advanceTimersByTimeAsync(0);
    expect(CADA).toBe(30 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(CADA);
    expect(f.llamadas).toHaveLength(2);
    parar();
    await vi.advanceTimersByTimeAsync(CADA * 2);
    window.dispatchEvent(new Event('online'));
    expect(f.llamadas).toHaveLength(2);
  });
});

/* Pauta 5 (2026-10-22, usuario) · `hayOtroBuild`: lo que pregunta Registros antes de cargar su motor. Sólo dice «otro»
   cuando lo SABE; si no, deja pasar (sin sellar, sin red, 404 o sin respuesta a tiempo). */
describe('versionNueva · pauta 5 · hayOtroBuild', () => {
  it('🔴 true sólo con las dos huellas y distintas', async () => {
    ponerMeta(PROPIA);
    expect(await hayOtroBuild({ fetchFn: red(OTRA) })).toBe(true);
    expect(await hayOtroBuild({ fetchFn: red(PROPIA) })).toBe(false);
  });

  it('🔴 sin sellar no pregunta; sin red o con 404, false (no se frena a ciegas)', async () => {
    ponerMeta('sin-sellar');
    const f = red(OTRA);
    expect(await hayOtroBuild({ fetchFn: f })).toBe(false);
    expect(f.llamadas, 'sin huella propia no hace falta preguntar').toHaveLength(0);
    ponerMeta(PROPIA);
    expect(await hayOtroBuild({ fetchFn: red(new Error('sin red')) })).toBe(false);
    expect(await hayOtroBuild({ fetchFn: red(404) })).toBe(false);
  });

  it('🔴 sin respuesta en `espera` ms, false: Registros no se queda esperando', async () => {
    ponerMeta(PROPIA);
    const colgada = async () => new Promise(() => {});
    const t0 = Date.now();
    expect(await hayOtroBuild({ fetchFn: colgada, espera: 30 })).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
