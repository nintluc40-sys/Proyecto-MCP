// @vitest-environment happy-dom
/* ============================================================
   Microbiología · auditoría del 2026-09-25, BLOQUE F (aprobado 2026-10-03)

   · H-012 · el tamaño de las colonias iba del mínimo al máximo DEL DÍA: 10² un día podía verse como 10⁶ otro. Ahora la
     escala es fija, de 10⁰ a 10⁷ (lo que pase de 10⁷, al tamaño máximo).
   · H-013 · el color por defecto de ejes y leyendas de TODOS los gráficos del MCP estaba fijo (#546e7a, ilegible en
     oscuro): sale del tema (--c-text-soft), que en claro vale lo mismo.
   · H-014 · las pestañas de Microbiología (sub-vistas y Placa/Matriz/Tendencias) llevan aria-selected, foco itinerante
     y ← → Inicio Fin.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Chart } from 'chart.js';
import { makeChart, colorDelTema } from '../../core/charts.js';
import { ufcRadius, colonyLayout, UFC_ESCALA } from './petri.js';
import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

describe('H-012 · la escala del tamaño de las colonias es FIJA (10⁰–10⁷)', () => {
  it('el mismo UFC tiene el mismo radio en dos días distintos', () => {
    const solo = colonyLayout([{ key: 'a', ufc: 100 }], 120);
    const conOtra = colonyLayout([{ key: 'a', ufc: 100 }, { key: 'b', ufc: 1e6 }], 120);
    const r100 = (l) => l.find((x) => x.c.ufc === 100).r;
    expect(r100(conOtra)).toBeCloseTo(r100(solo), 9);
    expect(r100(solo)).toBeCloseTo(ufcRadius(100, UFC_ESCALA.min, UFC_ESCALA.max), 9);
    expect(r100(solo), 'ya no es el radio medio de un día con una sola colonia').not.toBeCloseTo(20, 3);
  });
  it('por encima de 10⁷ no crece más que el máximo', () => {
    expect(ufcRadius(1e9, 1, 1e7)).toBe(ufcRadius(1e7, 1, 1e7));
    expect(ufcRadius(1e9, 1, 1e7)).toBe(34);
  });
});

describe('H-013 · el color por defecto de los gráficos sale del tema', () => {
  afterEach(() => { document.documentElement.style.removeProperty('--c-text-soft'); });
  it('lee --c-text-soft (y el de siempre si no hay)', () => {
    expect(colorDelTema()).toBe('#546e7a');
    document.documentElement.style.setProperty('--c-text-soft', '#9fb2bc');
    expect(colorDelTema()).toBe('#9fb2bc');
  });
  it('makeChart lo aplica al crear cada gráfico', () => {
    document.documentElement.style.setProperty('--c-text-soft', '#9fb2bc');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lienzo = document.createElement('canvas');
    document.body.appendChild(lienzo);
    try { makeChart(lienzo, { type: 'bar', data: { labels: [], datasets: [] } }); } catch (_) { /* sin contexto 2d en happy-dom */ }
    expect(Chart.defaults.color).toBe('#9fb2bc');
    err.mockRestore();
  });
});

describe('H-014 · las pestañas de Microbiología, accesibles', () => {
  let root;
  beforeEach(() => {
    const s0 = {};
    globalThis.localStorage = { getItem: (k) => (k in s0 ? s0[k] : null), setItem: (k, v) => { s0[k] = String(v); }, removeItem: (k) => { delete s0[k]; } };
    store.role = 'administrativo';
    store.currentView = 'microbiologia';
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    store.globalData = [{ _SheetOrigin: 'Microbiología', Corrida: '573', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1',
      'Fecha muestreo': '05/06/2026', 'V.Amarillos UFC': '100' }];
    microbiologiaView(root);
    root.querySelector('[data-mic-sub="general"]').click();
  });
  afterEach(() => { store.globalData = []; delete globalThis.localStorage; });
  const tecla = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));

  it('la activa lleva aria-selected="true" y es la única en el orden del Tab', () => {
    const tabs = [...root.querySelectorAll('.mic-subnav [role="tab"]')];
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.dataset.micSub)).toEqual(['general']);
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0').map((t) => t.dataset.micSub)).toEqual(['general']);
  });

  it('→ activa la siguiente y le deja el foco; Fin, la última; Inicio, la primera', () => {
    const subs = [...root.querySelectorAll('.mic-subnav [role="tab"]')].map((t) => t.dataset.micSub);
    tecla(root.querySelector('[data-mic-sub="general"]'), 'ArrowRight');
    const act = root.querySelector('.mic-subnav [aria-selected="true"]');
    expect(act.dataset.micSub).toBe(subs[1]);
    expect(document.activeElement).toBe(act);
    tecla(act, 'End');
    expect(root.querySelector('.mic-subnav [aria-selected="true"]').dataset.micSub).toBe(subs[subs.length - 1]);
    tecla(root.querySelector('.mic-subnav [aria-selected="true"]'), 'Home');
    expect(root.querySelector('.mic-subnav [aria-selected="true"]').dataset.micSub).toBe(subs[0]);
  });

  it('Placa · Matriz · Tendencias también son pestañas, con ← que da la vuelta', () => {
    root.querySelector('[data-mic-sub="bacteriologia"]').click();
    root.querySelector('[data-mic-ap="petri"]').click();
    root.querySelector('[data-mic-petab="placa"]').click();
    expect(root.querySelector('.mic-petabs').getAttribute('role')).toBe('tablist');
    expect(root.querySelector('[data-mic-petab="placa"]').getAttribute('aria-selected')).toBe('true');
    tecla(root.querySelector('[data-mic-petab="placa"]'), 'ArrowLeft');
    const act = root.querySelector('.mic-petabs [aria-selected="true"]');
    expect(act.dataset.micPetab).toBe('tendencias');
    expect(document.activeElement).toBe(act);
  });
});
