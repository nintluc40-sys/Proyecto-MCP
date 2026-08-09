// @vitest-environment happy-dom
// Auditoría de cierre · Despacho. El KPI «Rendimiento cosecha» = cosechada ÷ población
// inicial. La población inicial se tomaba como la primera lectura NO NULA, aceptando el 0,
// mientras el núcleo (`modCorStatsCompute`) y el cuadro de Siembras usan la primera lectura
// REAL (>0). Un tanque cuyo N5 se anotó con 0 no aportaba denominador pero sí numerador, así
// que el rendimiento salía inflado y el tope del 100 % lo disimulaba.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });

// TQ1: el N5 se anotó con 0 y el conteo real llega después (900 k) → cosecha 700 k.
// TQ2: siembra normal 1 M → cosecha 800 k.
// Correcto: 1,5 M ÷ 1,9 M = 78,9 %.  Con el 0 como siembra: 1,5 M ÷ 1 M = 150 % → tope 100 %.
function synth() {
  return [
    L({ Tanque: 'TQ1', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '0' }),
    L({ Tanque: 'TQ1', Fecha: '05/06/2026', 'Estadío': 'Z2', 'Población': '900000' }),
    L({ Tanque: 'TQ1', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '700000', Destino: 'Piscina 1', Biomasa: '10' }),
    L({ Tanque: 'TQ2', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
    L({ Tanque: 'TQ2', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '800000', Destino: 'Piscina 1', Biomasa: '12' }),
  ];
}

let errSpy;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = synth();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

function abrirDespacho() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  // `vState` persiste entre pruebas: puede que ya estemos dentro del módulo.
  const card = root.querySelector('[data-nav="module"]');
  if (card) click(card);
  const btn = root.querySelector('[data-nav="despacho"]');
  expect(btn, 'debe existir el botón de Despacho en el módulo').toBeTruthy();
  click(btn);
  return root;
}
const kpi = (root, label) => {
  const n = [...root.querySelectorAll('.sv-kpi-glass')].find((x) => x.textContent.includes(label));
  return n ? n.querySelector('.sv-kpi-value').textContent.trim() : null;
};

describe('Despacho · la población inicial usa la primera lectura REAL (>0)', () => {
  it('un N5 anotado con 0 no deflacta el denominador del rendimiento', () => {
    const root = abrirDespacho();
    expect(kpi(root, 'Rendimiento cosecha')).toBe('78,9%');
    expect(kpi(root, 'Rendimiento cosecha')).not.toBe('100,0%'); // el tope disimulaba el 150 %
  });

  it('la cantidad cosechada NO cambia: ahí el 0 sí es un dato real', () => {
    const root = abrirDespacho();
    // 700 k + 800 k. El último registro es el que manda, aunque sea 0 (tanque vaciado).
    expect(kpi(root, 'Cantidad cosechada')).toBe('1.500.000');
  });

  it('un tanque vaciado (última población 0) sigue contando su siembra', () => {
    store.globalData = [
      L({ Tanque: 'TQ1', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
      L({ Tanque: 'TQ1', Fecha: '20/06/2026', 'Estadío': 'PL10', 'Población': '0', Destino: 'Piscina 1' }),
    ];
    const root = abrirDespacho();
    expect(kpi(root, 'Rendimiento cosecha')).toBe('0,0%'); // 0 ÷ 1 M, no «—»
  });
});
