// @vitest-environment happy-dom
/* Punto 23 de la pauta del 12-11 (usuario: «Que valga ahora y avisar») · la meta de 🏭 Planta cuando el equipo NO puede
   guardarla (almacenamiento lleno o bloqueado). Antes se perdía sin aviso: la del mes se veía en esa pantalla y volvía a la
   anterior al cambiar de modo (cada pintado relee la guardada) o al recargar; la diaria de N5 ni se veía (su pintado la relee).
   Ahora vale en las dos pantallas hasta recargar, y un aviso lo dice. Cifras INVENTADAS. */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { montarAnalisis } from './analisis.js';
import { leerMeta, guardarMeta, leerMetaN5, guardarMetaN5, AVISO_META_SIN_GUARDAR } from './meta.js';
import { META_POR_DEFECTO, META_N5_DIA } from './cifras.js';

globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0));

/* Un almacén propio como `localStorage` (un espía sobre Storage.prototype NO alcanza al de happy-dom: la prueba pasaba en
   vacío). «lleno»: escribir falla como con la cuota agotada; «bloqueado»: también leer (almacenamiento desactivado). */
let modo = 'ok';
const mem = new Map();
const falla = (n) => { const e = new Error(n); e.name = n; throw e; };
const almacen = {
  getItem: (k) => (modo === 'bloqueado' ? falla('SecurityError') : mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => (modo !== 'ok' ? falla('QuotaExceededError') : void mem.set(k, String(v))),
  removeItem: (k) => (modo === 'bloqueado' ? falla('SecurityError') : void mem.delete(k)),
};
const lleno = () => { modo = 'lleno'; };
const bloqueado = () => { modo = 'bloqueado'; };
const sano = () => { modo = 'ok'; };
const avisos = () => [...document.querySelectorAll('.app-toast')].map((t) => [t.className.includes('app-toast--warn'), t.textContent]);

beforeAll(() => { vi.stubGlobal('localStorage', almacen); });
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  sano(); mem.clear();
  document.body.innerHTML = '';
  // con el almacenamiento sano: guardar la de por defecto suelta también la que quedara en memoria de otra prueba
  guardarMeta(META_POR_DEFECTO); guardarMetaN5(META_N5_DIA);
});
afterEach(() => { sano(); guardarMeta(META_POR_DEFECTO); guardarMetaN5(META_N5_DIA); });

it('control del almacén falso: lleno, de verdad no guarda', () => {
  lleno();
  expect(() => localStorage.setItem('x', '1')).toThrow();
  sano();
  localStorage.setItem('x', '1');
  expect(localStorage.getItem('x')).toBe('1');
});

describe('punto 23 · meta.js: sin poder guardar, la meta vale hasta recargar y se avisa', () => {
  it('🔴 la del mes: guardar devuelve false, leer da la NUEVA y sale el aviso (warn)', () => {
    lleno();
    expect(guardarMeta(450e6)).toBe(false);
    expect(leerMeta()).toBe(450e6);
    expect(avisos()).toEqual([[true, AVISO_META_SIN_GUARDAR]]);
    expect(AVISO_META_SIN_GUARDAR).toBe('No se pudo guardar la meta en este equipo (almacenamiento lleno o bloqueado): vale hasta que recargues la página.');
  });
  it('🔴 la diaria de N5, igual (y cada una la suya)', () => {
    lleno();
    expect(guardarMetaN5(80e6)).toBe(false);
    expect(leerMetaN5()).toBe(80e6);
    expect(leerMeta(), 'la del mes no se toca').toBe(META_POR_DEFECTO);
    expect(avisos()).toHaveLength(1);
  });
  it('🔴 con el almacenamiento BLOQUEADO (ni leer): la nueva, no la de por defecto', () => {
    bloqueado();
    expect(guardarMeta(300e6)).toBe(false);
    expect(leerMeta()).toBe(300e6);
  });
  it('cuando vuelve a poder guardar, manda lo guardado (la de memoria se suelta) y no hay aviso', () => {
    lleno();
    guardarMeta(450e6);
    sano();
    document.body.innerHTML = '';
    expect(guardarMeta(500e6)).toBe(true);
    expect(localStorage.getItem('planta_meta_mes')).toBe('500000000');
    localStorage.removeItem('planta_meta_mes');                 // como si otro modo la volviera a la de por defecto
    expect(leerMeta(), 'la de memoria ya no manda').toBe(META_POR_DEFECTO);
    expect(avisos()).toEqual([]);
  });
  it('control: guardando bien, true, sin aviso, y «Volver a» la de por defecto la quita del equipo', () => {
    expect(guardarMetaN5(70e6)).toBe(true);
    expect(localStorage.getItem('planta_meta_n5_dia')).toBe('70000000');
    expect(guardarMetaN5(META_N5_DIA)).toBe(true);
    expect(localStorage.getItem('planta_meta_n5_dia')).toBeNull();
    expect(avisos()).toEqual([]);
  });
});

describe('punto 23 · en 📊 Análisis (la pantalla real), con el almacenamiento lleno', () => {
  let host, v;
  const $ = (k) => host.querySelector('[data-k="' + k + '"]');
  const n5 = (k) => host.querySelector('[data-k="n5"] [data-n5="' + k + '"]');
  const estado = () => ({ modulos: {}, resumen: null, mad: { salas: {}, resumen: null, reemplazo: null }, cifras: null, mes: null,
    crono: { hasta: '2026-10-06', modulos: {} }, nauplios: { n5: 110e6, desoves: 10, desde: '2026-10-01', hasta: '2026-10-01',
      dias: [{ fecha: '2026-10-01', desoves: 10, n5: 110e6, pendientes: 0, lotes: [] }] } });
  beforeEach(() => { host = document.createElement('div'); document.body.append(host); v = montarAnalisis(host); v.pintarEstado(estado()); });

  it('🔴 la diaria de N5: se VE la nueva (antes seguía la de 65) y se avisa', () => {
    lleno();
    n5('meta-btn').click();
    n5('meta-in').value = '70';
    n5('meta-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(n5('mes-meta').textContent).toBe('de 1.820 M');           // 70 × 26
    expect(avisos().map(([w, t]) => [w, t])).toEqual([[true, AVISO_META_SIN_GUARDAR]]);
    v.pintarEstado(estado());                                         // el refresco la relee: sigue la nueva
    expect(n5('mes-meta').textContent).toBe('de 1.820 M');
  });

  it('🔴 la del mes: sigue la nueva al repintar (antes volvía a la guardada) y se avisa', () => {
    lleno();
    $('meta-btn').click();
    $('meta-in').value = '450';
    $('meta-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect($('prod-meta').textContent).toBe('de 450 M');
    v.pintarEstado(estado());
    expect($('prod-meta').textContent, 'como al volver de la maqueta').toBe('de 450 M');
    expect(avisos()).toHaveLength(1);
  });

  it('control: con el almacenamiento sano, sin aviso', () => {
    $('meta-btn').click();
    $('meta-in').value = '450';
    $('meta-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect($('prod-meta').textContent).toBe('de 450 M');
    expect(avisos()).toEqual([]);
  });
});
