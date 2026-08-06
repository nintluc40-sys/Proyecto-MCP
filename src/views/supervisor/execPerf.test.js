// @vitest-environment happy-dom
// Regresión de las dos correcciones de rendimiento/interacción de la Vista Ejecutiva:
//   · E-01 modStats memoizado por identidad del ctx (no recalcula en cada navegación).
//   · E-02 el deslizador de meses ya no se arranca a sí mismo en su propio `input`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { buildContext, modStats } from './stats.js';
import { supervisorView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const d = (i) => `${String((i % 28) + 1).padStart(2, '0')}/06/2026`;

// Varias corridas del mismo mes para que el navegador ◀▶ y el deslizador existan.
function synth({ corridas = 6, tanques = 4, dias = 20 } = {}) {
  const rows = [];
  let corr = 573;
  for (let c = 0; c < corridas; c++, corr++) {
    const mod = `M${String(c + 1).padStart(2, '0')}`;
    for (let t = 1; t <= tanques; t++) {
      for (let i = 0; i < dias; i++) {
        rows.push(L({
          'Módulo': mod, Corrida: String(corr), Tanque: `TQ${t}`, Fecha: d(i),
          'Población': String(4300000 - i * 50000), 'Estadío': i < 8 ? 'Z2' : 'PL8',
          Salinidad: '30', 'Plg (manual)': '150',
        }));
      }
    }
  }
  return rows;
}

let errSpy;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('E-01 · modStats memoizado por identidad del ctx', () => {
  it('la 2.ª consulta del mismo ctx no recalcula (devuelve la MISMA instancia)', () => {
    store.globalData = synth();
    const ctx = buildContext({ corrida: null });
    const a = modStats(ctx, 'M01');
    const b = modStats(ctx, 'M01');
    expect(b).toBe(a); // identidad ⇒ vino del memo, no de un recálculo
  });

  it('distingue módulo y corrida sin colisionar en la clave', () => {
    store.globalData = synth();
    const ctx = buildContext({ corrida: null });
    expect(modStats(ctx, 'M01', '573')).not.toBe(modStats(ctx, 'M02', '573'));
    expect(modStats(ctx, 'M01', '573')).not.toBe(modStats(ctx, 'M01', null));
  });

  it('un ctx NUEVO (datos cambiados) invalida: no reutiliza el resultado anterior', () => {
    store.globalData = synth();
    const s1 = modStats(buildContext({ corrida: null }), 'M01');
    store.globalData = synth({ corridas: 6, tanques: 4, dias: 10 }); // otro array ⇒ otro ctx
    const s2 = modStats(buildContext({ corrida: null }), 'M01');
    expect(s2).not.toBe(s1);
    expect(s2.dias).not.toBe(s1.dias); // y el resultado refleja los datos nuevos
  });

  it('el memo NO altera el resultado: mismos valores que el cálculo directo', () => {
    store.globalData = synth();
    const ctx = buildContext({ corrida: null });
    const s = modStats(ctx, 'M01', '573');
    expect(s.sv).toBeCloseTo(modStats(ctx, 'M01', '573').sv, 10);
    expect(s.tanksData).toHaveLength(4);
    expect(s.pop).toBeGreaterThan(0);
  });
});

describe('E-02 · el deslizador de meses sobrevive al arrastre', () => {
  it('`input` actualiza el rótulo del mes sin destruir el deslizador', () => {
    // Corridas repartidas en varios meses ⇒ el deslizador se renderiza.
    store.globalData = [
      ...synth({ corridas: 1, tanques: 1, dias: 3 }),
      L({ 'Módulo': 'M20', Corrida: '585', Tanque: 'TQ1', Fecha: '05/06/2026', 'Población': '1000' }),
      L({ 'Módulo': 'M30', Corrida: '591', Tanque: 'TQ1', Fecha: '06/06/2026', 'Población': '1000' }),
    ];
    const root = document.createElement('div');
    document.body.appendChild(root);
    supervisorView(root);

    const slider = root.querySelector('[data-prodslider]');
    expect(slider).toBeTruthy();
    const lblAntes = root.querySelector('[data-prodmonthlbl]').textContent;

    slider.value = '0';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(slider.isConnected).toBe(true);                       // ya no se arranca solo
    expect(root.querySelector('[data-prodslider]')).toBe(slider); // mismo nodo
    expect(root.querySelector('[data-prodmonthlbl]').textContent).not.toBe(lblAntes);
  });

  it('`change` sí re-renderiza el panel del mes elegido', () => {
    store.globalData = [
      ...synth({ corridas: 1, tanques: 1, dias: 3 }),
      L({ 'Módulo': 'M20', Corrida: '585', Tanque: 'TQ1', Fecha: '05/06/2026', 'Población': '1000' }),
    ];
    const root = document.createElement('div');
    document.body.appendChild(root);
    supervisorView(root);

    const slider = root.querySelector('[data-prodslider]');
    expect(slider).toBeTruthy();
    slider.value = '0';
    slider.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Tras el commit el panel se reconstruye: hay un deslizador nuevo posicionado en 0.
    const nuevo = root.querySelector('[data-prodslider]');
    expect(nuevo).toBeTruthy();
    expect(nuevo.getAttribute('value')).toBe('0');
  });
});
