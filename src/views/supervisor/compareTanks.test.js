// @vitest-environment happy-dom
// Modal "Comparar Tanques" · modo "Módulo (masivo)": todas las corridas de un
// módulo alineadas por día relativo, conmutable superpuesto ⇄ apilado.
// Se mockea core/charts.js capturando cada makeChart(id, cfg) para verificar
// datasets, etiquetas, colores y escala común sin canvas real.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chartCalls = [];
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { chartCalls.push({ id, cfg }); return null; },
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { compareTanksButtonHTML, compareTanksModalHTML, setupCompareTanks } from './compareTanks.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });

// M01: C570 (3 días) y C571 (4 días) · M02: C900 (2 días) → no debe colarse.
function synthData() {
  const rows = [];
  const days570 = [['01/03/2026', '90'], ['02/03/2026', '80'], ['03/03/2026', '70']];
  const days571 = [['10/05/2026', '95'], ['11/05/2026', '88'], ['12/05/2026', '84'], ['13/05/2026', '80']];
  days570.forEach(([f, sv]) => rows.push(L({ 'Módulo': 'M01', Corrida: '570', Tanque: 'TQ1', Fecha: f, Supervivencia: sv })));
  days571.forEach(([f, sv]) => rows.push(L({ 'Módulo': 'M01', Corrida: '571', Tanque: 'TQ2', Fecha: f, Supervivencia: sv })));
  [['20/06/2026', '60'], ['21/06/2026', '55']].forEach(([f, sv]) =>
    rows.push(L({ 'Módulo': 'M02', Corrida: '900', Tanque: 'TQ9', Fecha: f, Supervivencia: sv })));
  return rows;
}

function mountModal() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = compareTanksButtonHTML() + compareTanksModalHTML();
  setupCompareTanks(root);
  root.querySelector('[data-ctt-open]').click(); // abre y renderiza la config
  return root;
}

const clickModo = (root) => root.querySelector('[data-ctmode="modulo"]').click();
function pickModulo(root, mod) {
  const sel = root.querySelector('[data-ctmodsel]');
  sel.value = mod;
  sel.dispatchEvent(new Event('change'));
}
const generate = (root) => root.querySelector('[data-ct-generate]').click();

describe('Comparar Tanques · modo Módulo (masivo)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    chartCalls.length = 0;
    store.globalData = synthData();
  });

  it('el modo masivo muestra selector de módulo, presentación y eje fijo', () => {
    const root = mountModal();
    clickModo(root);
    expect(root.querySelector('[data-ctmodsel]')).toBeTruthy();
    expect(root.querySelector('[data-ctlayout="overlay"]')).toBeTruthy();
    expect(root.querySelector('[data-ctlayout="stack"]')).toBeTruthy();
    // El eje calendario desaparece: en masivo el día relativo es obligatorio.
    expect(root.querySelector('[data-ctaxis]')).toBeNull();
    expect(root.querySelector('#cttConfig').textContent).toContain('Día relativo (fijo)');
  });

  it('sin módulo elegido pide la selección en vez de graficar', () => {
    const root = mountModal();
    clickModo(root);
    generate(root);
    expect(root.querySelector('#cttOutput').textContent).toContain('Selecciona un módulo');
    expect(chartCalls.length).toBe(0);
  });

  it('superpuesto: un gráfico con una línea por corrida del módulo (y solo de ese módulo)', () => {
    const root = mountModal();
    clickModo(root);
    pickModulo(root, 'M01');
    generate(root);

    expect(chartCalls.length).toBe(1);
    const { id, cfg } = chartCalls[0];
    expect(id).toBe('cttMassChart');
    expect(cfg.type).toBe('line');
    // Día relativo: 4 días (la corrida más larga, C571) y corridas C570/C571 (no C900 de M02).
    expect(cfg.data.labels).toEqual(['Día 1', 'Día 2', 'Día 3', 'Día 4']);
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['C570', 'C571']);
    // C570 (3 días) se rellena con null hasta el largo común.
    expect(cfg.data.datasets[0].data).toEqual([90, 80, 70, null]);
    expect(cfg.data.datasets[1].data).toEqual([95, 88, 84, 80]);
    // Colores distintos por corrida (paleta categórica en orden fijo).
    expect(cfg.data.datasets[0].borderColor).not.toBe(cfg.data.datasets[1].borderColor);

    // Tabla de estadísticos: una fila por corrida.
    const rows = root.querySelectorAll('#cttOutput tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('C570');
    expect(rows[1].textContent).toContain('C571');
  });

  it('apilado: un mini-gráfico por corrida con escala Y común', () => {
    const root = mountModal();
    clickModo(root);
    pickModulo(root, 'M01');
    generate(root);
    chartCalls.length = 0;

    root.querySelector('[data-ctlayout="stack"]').click(); // re-genera solo

    expect(chartCalls.map((c) => c.id)).toEqual(['cttMass_0', 'cttMass_1']);
    const [a, b] = chartCalls.map((c) => c.cfg);
    expect(a.data.datasets.length).toBe(1);
    expect(b.data.datasets.length).toBe(1);
    // Escala común: mismos extremos en ambos mini-gráficos, cubriendo 70–95.
    expect(a.options.scales.y.min).toBe(b.options.scales.y.min);
    expect(a.options.scales.y.max).toBe(b.options.scales.y.max);
    expect(a.options.scales.y.min).toBeLessThanOrEqual(70);
    expect(a.options.scales.y.max).toBeGreaterThanOrEqual(95);
    // Identidad por título directo (leyenda apagada en mini-gráficos).
    expect(a.options.plugins.legend.display).toBe(false);
    const titles = [...root.querySelectorAll('.ctt-mass-row-title')].map((t) => t.textContent);
    expect(titles[0]).toContain('C570');
    expect(titles[1]).toContain('C571');
    // Volver a superpuesto re-dibuja el gráfico único.
    chartCalls.length = 0;
    root.querySelector('[data-ctlayout="overlay"]').click();
    expect(chartCalls.length).toBe(1);
    expect(chartCalls[0].id).toBe('cttMassChart');
  });

  it('los otros modos siguen funcionando (regresión: tanque A vs B por fecha)', () => {
    const root = mountModal();
    // Volver al modo tanque (el estado del modal es persistente entre aperturas).
    root.querySelector('[data-ctmode="tank"]').click();
    const set = (attr, v) => {
      const el = root.querySelector(`select[data-ct="${attr}"]`);
      el.value = v; el.dispatchEvent(new Event('change'));
    };
    set('A.mod', 'M01'); set('A.cor', '570'); set('A.tq', 'TQ1');
    set('B.mod', 'M01'); set('B.cor', '571'); set('B.tq', 'TQ2');
    generate(root);
    // Línea + diferencia, como siempre.
    expect(chartCalls.map((c) => c.id)).toEqual(['cttLine', 'cttDiff']);
    expect(chartCalls[0].cfg.data.datasets.length).toBe(2);
  });
});
