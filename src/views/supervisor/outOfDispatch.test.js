// @vitest-environment happy-dom
// Regresión de las marcas de tanque FUERA DE DESPACHO (agrupado / descartado):
//   · T-01 la marca se deriva de la corrida completa, no de la ventana de fecha visible.
//   · T-02 el tanque descartado tiene rótulo propio, distinto del agrupado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { buildContext, modStats, tankStats } from './stats.js';
import { supervisorView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const d = (i) => `${String(i + 1).padStart(2, '0')}/06/2026`;

/** Un módulo con TQ1 marcado en Observaciones el día `markDay` y TQ2 normal. */
function synth(mark, markDay = 3) {
  const rows = [];
  ['TQ1', 'TQ2'].forEach((tq) => {
    for (let i = 0; i < 25; i++) {
      rows.push(L({
        'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: d(i), 'Estadío': 'PL8',
        'Población': tq === 'TQ1' && i >= 5 ? '0' : String(4000000 - i * 10000),
        Observaciones: (tq === 'TQ1' && i === markDay) ? mark : '',
      }));
    }
  });
  return rows;
}

const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// `vState` de index.js es estado de MÓDULO: sobrevive entre tests igual que sobrevive
// entre montajes de la vista. Se vuelve a la landing por la miga de pan antes de navegar.
function gotoLanding(root) {
  supervisorView(root);
  const back = root.querySelector('[data-nav="modules"]');
  if (back) click(back);
  return root;
}

/** Landing → módulo → devuelve la tarjeta del tanque pedido. */
function tankCard(root, tq) {
  gotoLanding(root);
  click(root.querySelector('.sv-card[data-nav="module"]'));
  return [...root.querySelectorAll('.sv-tank-card')].find((c) => c.textContent.includes(tq));
}

beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; store.dateFrom = null; store.dateTo = null; vi.restoreAllMocks(); });

describe('T-01 · la marca no depende de la ventana de fecha', () => {
  it('"Agrupado" anotado fuera de la ventana visible SIGUE marcando el tanque', () => {
    store.globalData = synth('Tanque Agrupado con TQ2', 3);

    // Sin filtro: la marca está.
    let ctx = buildContext({ corrida: null });
    expect(tankStats(ctx, 'M01', 'TQ1', '573').grouped).toBe(true);

    // Ventana que EXCLUYE el día de la anotación (el día 4 de junio).
    store.dateFrom = new Date(2026, 5, 20);
    store.dateTo = new Date(2026, 5, 28);
    ctx = buildContext({ corrida: null });
    expect(tankStats(ctx, 'M01', 'TQ1', '573').grouped).toBe(true);
  });

  it('coincide con el `outOfDispatch` que la Vista Ejecutiva usa para las alertas', () => {
    store.globalData = synth('Tanque Agrupado con TQ2', 3);
    store.dateFrom = new Date(2026, 5, 20);
    store.dateTo = new Date(2026, 5, 28);
    const ctx = buildContext({ corrida: null });
    const tq1 = modStats(ctx, 'M01', '573').tanksData.find((t) => t.tq === 'TQ1');
    // Las dos lecturas del mismo hecho ya no se contradicen.
    expect(tankStats(ctx, 'M01', 'TQ1', '573').grouped).toBe(tq1.outOfDispatch);
  });

  it('un tanque sin anotación no se marca', () => {
    store.globalData = synth('Tanque Agrupado con TQ2', 3);
    const ctx = buildContext({ corrida: null });
    const ts = tankStats(ctx, 'M01', 'TQ2', '573');
    expect(ts.grouped).toBe(false);
    expect(ts.discarded).toBe(false);
  });
});

describe('T-02 · el tanque descartado tiene rótulo propio', () => {
  it('`discarded` se expone y no se confunde con `grouped`', () => {
    store.globalData = synth('Tanque Descartado por malos cuidados', 3);
    const ctx = buildContext({ corrida: null });
    const ts = tankStats(ctx, 'M01', 'TQ1', '573');
    expect(ts.discarded).toBe(true);
    expect(ts.grouped).toBe(false);
    // Y sigue fuera del recuento de alertas, como antes.
    expect(modStats(ctx, 'M01', '573').tanksData.find((t) => t.tq === 'TQ1').outOfDispatch).toBe(true);
  });

  it('la tarjeta de tanque del módulo lo rotula 🗑️ Descartado', () => {
    store.globalData = synth('Tanque Descartado por malos cuidados', 3);
    const root = document.createElement('div');
    document.body.appendChild(root);

    const card = tankCard(root, 'TQ1');
    expect(card.className).toContain('is-discarded');
    expect(card.querySelector('.sv-tank-discarded')).toBeTruthy();
    expect(card.getAttribute('aria-label')).toContain('descartado');
    expect(card.querySelector('.sv-tank-grouped')).toBeNull();
  });

  it('la tarjeta del tanque agrupado conserva su rótulo 🔗 Agrupado', () => {
    store.globalData = synth('Tanque Agrupado con TQ2', 3);
    const root = document.createElement('div');
    document.body.appendChild(root);

    const card = tankCard(root, 'TQ1');
    expect(card.className).toContain('is-grouped');
    expect(card.querySelector('.sv-tank-grouped')).toBeTruthy();
    expect(card.querySelector('.sv-tank-discarded')).toBeNull();
  });

  it('la Visualización del Tanque muestra el banner que corresponde', () => {
    store.globalData = synth('Tanque Descartado por malos cuidados', 3);
    const root = document.createElement('div');
    document.body.appendChild(root);

    click(tankCard(root, 'TQ1'));
    expect(root.querySelector('.sv-discarded-note')).toBeTruthy();
    expect(root.querySelector('.sv-grouped-note')).toBeNull();
  });
});
