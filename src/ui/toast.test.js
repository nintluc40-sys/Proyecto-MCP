// @vitest-environment happy-dom
/* ============================================================
   UI · el aviso efímero (toast) · B10 (2026-11-08, usuario: «Los seis con lógica»)
   Lo que promete su cabecera: no bloquea, se apila, se descarta solo o con un clic, y el texto va con textContent
   (sin riesgo de XSS). Un solo contenedor, accesible (role=status, aria-live=polite).
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toast } from './toast.js';

const caja = () => document.querySelector('.app-toasts');

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] });
});
afterEach(() => { vi.useRealTimers(); });

describe('toast', () => {
  it('el texto va como TEXTO: un «<b>» no se convierte en HTML', () => {
    const el = toast('<b>hola</b> & <img src=x onerror=alert(1)>');
    expect(el.textContent).toBe('<b>hola</b> & <img src=x onerror=alert(1)>');
    expect(el.querySelector('b, img')).toBe(null);
  });

  it('el tipo da la clase (por defecto «info») y entra con su animación', () => {
    expect(toast('a').className).toBe('app-toast app-toast--info');
    const err = toast('b', 'err');
    expect(err.classList.contains('app-toast--err')).toBe(true);
    expect(err.classList.contains('is-in')).toBe(false);
    vi.advanceTimersToNextFrame();
    expect(err.classList.contains('is-in')).toBe(true);
  });

  it('un solo contenedor accesible para todos, y se apilan en orden', () => {
    toast('uno'); toast('dos');
    expect(document.querySelectorAll('.app-toasts')).toHaveLength(1);
    expect(caja().getAttribute('role')).toBe('status');
    expect(caja().getAttribute('aria-live')).toBe('polite');
    expect([...caja().children].map((e) => e.textContent)).toEqual(['uno', 'dos']);
  });

  it('se descarta solo a su tiempo (más la salida de 220 ms), no antes', () => {
    const el = toast('x', 'ok', 1000);
    vi.advanceTimersByTime(999);
    expect(caja().contains(el)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.classList.contains('is-in')).toBe(false);
    expect(caja().contains(el), 'aún sale (220 ms)').toBe(true);
    vi.advanceTimersByTime(220);
    expect(caja().contains(el)).toBe(false);
  });

  it('un clic lo descarta antes de tiempo', () => {
    const el = toast('x', 'warn', 60000);
    el.click();
    vi.advanceTimersByTime(220);
    expect(caja().contains(el)).toBe(false);
  });

  it('si alguien vació la página, el contenedor vuelve a crearse', () => {
    toast('antes');
    document.body.innerHTML = '';
    const el = toast('después');
    expect(caja()).not.toBe(null);
    expect(caja().contains(el)).toBe(true);
  });
});
