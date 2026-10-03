// @vitest-environment happy-dom
/* ============================================================
   Microbiología · auditoría del 2026-09-25, BLOQUE D (aprobado 2026-10-03)

   · H-005 · la «Carta de control» usaba la σ poblacional de TODO el filtro (tanques, módulos y formatos mezclados):
     límites inflados que casi nunca marcaban nada. Ahora es una carta de individuos (I-MR: σ = MR̄/1,128, en orden de
     fecha) y sólo de UN proceso (`procesoDe`: la ubicación sin el estadío); con varios, avisa de elegir uno.
   · H-007 · la «cinética de crecimiento» (μ, tiempo de duplicación) salía de la SUMA diaria de UFC de todas las muestras:
     se rotula como lo que es —la tendencia de esa suma, en % por día— y sin «t. duplicación».
   · H-008 · el WQI dice sobre cuántos parámetros (los que tienen rango) en vez de «100 = todo en rango».
   (Las funciones puras —controlStats, procesoDe, parametrosConRango— están en calagua.data.test.js.)
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const charts = {};
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts[id] = cfg; return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';
import { parametrosConRango, CAL_PARAMS } from './calagua.data.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const agua = (o) => ({ _SheetOrigin: 'Calidad de Agua', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura',
  'Tipo de muestra': 'Agua', 'Módulo': '1', 'TQ/N°': '3', ...o });
const M = (o) => ({ _SheetOrigin: 'Microbiología', Corrida: '573', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', ...o });

let root;
beforeEach(() => {
  Object.keys(charts).forEach((k) => delete charts[k]);
  const s0 = {};
  globalThis.localStorage = { getItem: (k) => (k in s0 ? s0[k] : null), setItem: (k, v) => { s0[k] = String(v); }, removeItem: (k) => { delete s0[k]; } };
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); delete globalThis.localStorage; });

function cartaDeControl(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  click(root.querySelector('[data-mic-sub="calidad"]'));
  const anz = root.querySelector('[data-cal-ap="analizador"]');
  if (anz && !anz.classList.contains('is-active')) click(anz);
  const ph = root.querySelector('.cal-cart[data-cal-param="ph"]');
  if (ph && !ph.classList.contains('is-on')) click(ph);
  click(root.querySelector('[data-cal-chartmode="control"]'));
}

describe('H-005 · la carta de control es de UN proceso, con límites por rango móvil', () => {
  it('un mismo tanque en dos estadíos es UN proceso: hay carta, con los valores en orden de fecha', () => {
    cartaDeControl([
      agua({ 'Fecha muestreo': '07/06/2026', 'Estadío': 'PL1', pH: '8.4' }),
      agua({ 'Fecha muestreo': '05/06/2026', 'Estadío': 'Z2', pH: '8.0' }),
      agua({ 'Fecha muestreo': '06/06/2026', 'Estadío': 'M1', pH: '8.1' }),
    ]);
    expect(root.querySelector('#calTrendChart')).toBeTruthy();
    expect(root.querySelector('.cal-anz-screen').textContent).toContain('I-MR');
    expect(charts.calTrendChart.data.datasets[0].data).toEqual([8, 8.1, 8.4]);
  });

  it('dos tanques son dos procesos: ni carta ni límites, el aviso de elegir uno', () => {
    cartaDeControl([
      agua({ 'Fecha muestreo': '05/06/2026', pH: '8.0' }),
      agua({ 'Fecha muestreo': '06/06/2026', 'TQ/N°': '4', pH: '8.2' }),
    ]);
    expect(root.querySelector('#calTrendChart')).toBeNull();
    expect(charts.calTrendChart).toBeUndefined();
    const txt = root.querySelector('.cal-anz-screen').textContent;
    expect(txt).toContain('La carta de control es de UN proceso');
    expect(txt).toContain('2 ubicaciones');
  });
});

describe('H-007 · Tendencias: la tendencia de la SUMA diaria, sin «tiempo de duplicación»', () => {
  it('rotula la tendencia en % por día y ya no da μ ni t. duplicación', () => {
    store.globalData = [
      M({ 'Fecha muestreo': '01/06/2026', 'Pseudomonas UFC': '100' }),
      M({ 'Fecha muestreo': '02/06/2026', 'Pseudomonas UFC': '200' }),
      M({ 'Fecha muestreo': '03/06/2026', 'Pseudomonas UFC': '400' }),
    ];
    microbiologiaView(root);
    click(root.querySelector('[data-mic-sub="bacteriologia"]'));
    click(root.querySelector('[data-mic-ap="petri"]'));
    click(root.querySelector('[data-mic-petab="tendencias"]'));
    const txt = root.querySelector('.mic-th-detail').textContent;
    expect(txt).not.toContain('duplicación');
    expect(txt).not.toContain('μ crecimiento');
    expect(txt).toContain('tendencia de la suma diaria');
    expect(txt, 'se duplica cada día: +100 %/día').toContain('+100 %/día');
    expect(root.querySelector('.mic-tr-rank').textContent).toContain('Tendencia de la suma diaria');
  });
});

describe('H-008 · el WQI dice sobre cuántos parámetros', () => {
  it('el KPI «💧 WQI agua» lleva «sobre N parámetros» (N = los que tienen rango)', () => {
    store.globalData = [agua({ 'Fecha muestreo': '05/06/2026', pH: '8.0' })];
    microbiologiaView(root);
    click(root.querySelector('[data-mic-sub="general"]'));   // vState es del módulo: las pruebas de arriba lo movieron
    const n = parametrosConRango().length;
    expect(n).toBeLessThan(CAL_PARAMS.length);
    expect(root.textContent).toContain('sobre ' + n + ' parámetros');
    expect(root.textContent).not.toContain('100 = todo en rango');
  });
});
