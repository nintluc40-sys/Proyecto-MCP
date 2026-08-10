// @vitest-environment happy-dom
// Auditoría de cierre · Microbiología · Placa Petri · pestaña Tendencias.
//
// L · La curva de ajuste exponencial se evaluaba sobre TODO el rango de días, no solo
//     sobre el tramo con datos. Medido con dos días consecutivos que saltan de 100 a
//     100.000 UFC y un rango que se estira 28 días más:
//       Serie Σ UFC : [100, 100000, null]
//       Ajuste      : [100, 100000, 1e+89]     ← extrapolación
//     El eje Y se escalaba a 1e89 y la serie real quedaba aplastada contra el cero, o sea
//     la curva destruía el gráfico que venía a anotar. Fuera del soporte el modelo tampoco
//     dice nada, así que ahora se dibuja solo entre el primer y el último día con UFC.
//
// M · El KPI rotulaba «Σ UFC último día» un valor que es la última MEDICIÓN del patógeno,
//     que no tiene por qué caer en el último día del rango: medido, 8.888 del 02 jun
//     presentado como «último día» con el rango terminando el 20 jun.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const charts = {};
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts[id] = cfg; return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', Corrida: '573', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', ...o });

let root, errSpy;
beforeEach(() => {
  Object.keys(charts).forEach((k) => delete charts[k]);
  const s0 = {};
  globalThis.localStorage = {
    getItem: (k) => (k in s0 ? s0[k] : null),
    setItem: (k, v) => { s0[k] = String(v); },
    removeItem: (k) => { delete s0[k]; },
  };
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); delete globalThis.localStorage; });

function tendencias(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  root.querySelector('[data-mic-sub="bacteriologia"]').click();
  root.querySelector('[data-mic-ap="petri"]').click();
  root.querySelector('[data-mic-petab="tendencias"]').click();
}
const serie = () => charts.micTrendChart.data.datasets[0].data;
const ajuste = () => charts.micTrendChart.data.datasets[1]?.data;
const kpis = () => [...root.querySelectorAll('.mic-th-kpi')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());

// Salto de 100 → 100.000 en dos días seguidos; el rango sigue 28 días más.
const SALTO = [
  M({ 'Fecha muestreo': '01/06/2026', 'Pseudomonas UFC': '100' }),
  M({ 'Fecha muestreo': '02/06/2026', 'Pseudomonas UFC': '100000' }),
  M({ 'Fecha muestreo': '30/06/2026', 'V.Totales UFC': '500' }),
];

describe('Tendencias · el ajuste exponencial no se extrapola', () => {
  it('no supera el orden de magnitud de los datos observados', () => {
    tendencias(SALTO);
    const maxSerie = Math.max(...serie().filter((x) => x != null));
    const maxFit = Math.max(...ajuste().filter((x) => x != null));
    expect(maxSerie).toBe(100000);
    expect(maxFit).toBeLessThanOrEqual(maxSerie * 1.01); // antes: 1e89
  });

  it('deja en null los días fuera del tramo con UFC', () => {
    tendencias(SALTO);
    const f = ajuste();
    expect(f[f.length - 1]).toBeNull();
  });

  it('no se pasa de corrección: dentro del tramo la curva sigue ahí y pasa por los datos', () => {
    tendencias(SALTO);
    const f = ajuste();
    expect(f[0]).toBeCloseTo(100, 6);
    expect(f[1]).toBeCloseTo(100000, 3);
  });

  it('no se pasa de corrección: la serie real no se toca', () => {
    tendencias(SALTO);
    expect(serie()).toEqual([100, 100000, null]);
  });
});

describe('Tendencias · el KPI de Σ UFC dice de qué día es', () => {
  const DESFASADO = [
    M({ 'Fecha muestreo': '01/06/2026', 'Pseudomonas UFC': '7777' }),
    M({ 'Fecha muestreo': '02/06/2026', 'Pseudomonas UFC': '8888' }),
    M({ 'Fecha muestreo': '20/06/2026', 'V.Totales UFC': '500' }),
  ];

  it('ya no rotula «último día» una medición de 18 días antes', () => {
    tendencias(DESFASADO);
    const kpi = kpis().find((s) => /Σ UFC/.test(s));
    expect(kpi).toContain('última medición');
    expect(kpi).not.toContain('último día');
  });

  it('muestra la fecha cuando la medición NO es del último día del rango', () => {
    tendencias(DESFASADO);
    expect(kpis().find((s) => /Σ UFC/.test(s))).toContain('02 jun 26');
  });

  it('no se pasa de corrección: si SÍ es del último día no añade fecha redundante', () => {
    tendencias([
      M({ 'Fecha muestreo': '01/06/2026', 'Pseudomonas UFC': '7777' }),
      M({ 'Fecha muestreo': '02/06/2026', 'Pseudomonas UFC': '8888' }),
    ]);
    const kpi = kpis().find((s) => /Σ UFC/.test(s));
    expect(kpi).toContain('última medición');
    expect(kpi).not.toContain('02 jun 26');
  });
});
