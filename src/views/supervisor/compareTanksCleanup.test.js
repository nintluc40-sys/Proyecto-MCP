// @vitest-environment happy-dom
// Ciclo de vida de los gráficos de «Comparar Tanques». `generate()` ya destruía las
// instancias antes de reemplazar sus canvas, pero las otras dos rutas que también los
// descartan —abrir el modal (que vacía el contenedor) y cerrarlo— no lo hacían: los
// objetos Chart quedaban en el registro apuntando a nodos desconectados, con sus
// listeners de resize, hasta el siguiente cambio de vista.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const destroyed = [];
vi.mock('../../core/charts.js', () => ({
  makeChart: (id) => { lastMade.push(id); return null; },
  destroyChart: (c) => { destroyed.push(typeof c === 'string' ? c : (c && c.id) || '(canvas)'); },
  destroyAllCharts: () => {},
  Chart: class {},
}));
const lastMade = [];

import { store } from '../../core/store.js';
import { compareTanksButtonHTML, compareTanksModalHTML, setupCompareTanks } from './compareTanks.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const data = () => [
  L({ 'Módulo': 'M01', Corrida: '570', Tanque: 'TQ1', Fecha: '01/03/2026', Supervivencia: '90' }),
  L({ 'Módulo': 'M01', Corrida: '570', Tanque: 'TQ1', Fecha: '02/03/2026', Supervivencia: '80' }),
  L({ 'Módulo': 'M01', Corrida: '571', Tanque: 'TQ2', Fecha: '10/05/2026', Supervivencia: '95' }),
  L({ 'Módulo': 'M01', Corrida: '571', Tanque: 'TQ2', Fecha: '11/05/2026', Supervivencia: '88' }),
];

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = compareTanksButtonHTML() + compareTanksModalHTML();
  setupCompareTanks(root);
  return root;
}
const open = (root) => root.querySelector('[data-ctt-open]').click();
const close = (root) => root.querySelector('[data-ctt-close]').click();

beforeEach(() => {
  document.body.innerHTML = '';
  destroyed.length = 0; lastMade.length = 0;
  store.globalData = data();
});

describe('«Comparar Tanques» suelta sus gráficos en las 3 rutas', () => {
  // Coloca un canvas en el contenedor de resultados, como haría un `generate()` real.
  const fakeResult = (root) => {
    const out = root.querySelector('#cttOutput');
    out.innerHTML = '<canvas id="cttLine"></canvas><canvas id="cttDiff"></canvas>';
    return out;
  };

  it('al CERRAR destruye los canvas del resultado', () => {
    const root = mount();
    open(root);
    fakeResult(root);
    destroyed.length = 0;
    close(root);
    expect(destroyed).toContain('cttLine');
    expect(destroyed).toContain('cttDiff');
  });

  it('al REABRIR destruye antes de vaciar el contenedor', () => {
    const root = mount();
    open(root);
    fakeResult(root);
    destroyed.length = 0;
    open(root); // segunda apertura: onOpen vacía #cttOutput
    expect(destroyed).toContain('cttLine');
    expect(destroyed).toContain('cttDiff');
  });

  it('y el contenedor queda vacío tras cerrar', () => {
    const root = mount();
    open(root);
    fakeResult(root);
    close(root);
    expect(root.querySelector('#cttOutput').innerHTML).toBe('');
  });
});
