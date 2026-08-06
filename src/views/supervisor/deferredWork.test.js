// @vitest-environment happy-dom
// Regresión del trabajo DIFERIDO de la vista: lo que solo consume un modal no debe
// calcularse ni construirse en el render de fondo, y lo que se cuelga de <body> debe
// soltarse al abandonar la sub-vista.
//   · L-02 el promedio del módulo (overlay de LARVIA) se calcula al ampliar, no antes.
//   · T-03 el historial de observaciones se construye al abrir su modal.
//   · B-01 el tooltip del heatmap Biomol no sobrevive al cambio de sub-vista.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// makeChart mockeado PERO registrando las configuraciones: así se puede comprobar
// cuántos datasets lleva cada gráfico sin necesitar un contexto 2D real.
const charts = [];
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts.push({ id, cfg }); return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

// rAF SÍNCRONO (se sobrescribe el de happy-dom, que sí es asíncrono): justamente lo que
// se está probando —el fullscreen de LARVIA y el heatmap Biomol— se dibuja dentro de un
// requestAnimationFrame en `onOpen`, así que sin esto no habría nada que observar.
globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// Dos tanques del mismo módulo con biometría LARVIA: hay promedio de módulo que solapar.
function synth() {
  const rows = [];
  ['TQ1', 'TQ2'].forEach((tq, t) => {
    for (let i = 0; i < 6; i++) {
      rows.push(L({
        'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: `0${i + 1}/06/2026`,
        'Estadío': 'PL5', 'Población': String(1000000 - i * 1000),
        'PL/g': String(200 - i * 3 + t * 10),
        'Peso promedio (mg)': String((1.2 + i * 0.3 + t * 0.1).toFixed(2)),
        'ID de Análisis': `AN-${tq}-${i}`,
        Observaciones: i % 2 === 0 ? `Observación ${i} de ${tq}` : '',
      }));
    }
  });
  rows.push({
    _SheetOrigin: 'Biomol', Fecha: '03/06/2026', 'Código': 'BM1', Corrida: '573',
    Lugar: 'Módulo 1', Tanque: 'TQ1', 'Estadío': 'PL5',
    IHHNV: 'Negativo', WSSV: 'Positivo', 'AHPND/EMS': 'Negativo',
  });
  return rows;
}

/** Landing → módulo. Devuelve el root ya en la vista de módulo. */
function gotoModule(root) {
  supervisorView(root);
  const back = root.querySelector('[data-nav="modules"]');
  if (back) click(back);
  click(root.querySelector('.sv-card[data-nav="module"]'));
  return root;
}

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null; store.globalData = synth();
  document.body.innerHTML = '';
  charts.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

describe('L-02 · el promedio del módulo se calcula al ampliar, no en el render', () => {
  const gotoLarvia = () => {
    gotoModule(root);
    click([...root.querySelectorAll('.sv-tank-card')].find((c) => c.textContent.includes('TQ1')));
    click(root.querySelector('[data-nav="larvia"]'));
  };

  it('los gráficos de la grilla NO llevan overlay de promedio', () => {
    gotoLarvia();
    const grid = charts.filter((c) => String(c.id).startsWith('svBio_'));
    expect(grid.length).toBeGreaterThan(0);
    grid.forEach((c) => expect(c.cfg.data.datasets).toHaveLength(1));
  });

  it('al ampliar una métrica SÍ aparece el overlay "Promedio módulo"', () => {
    gotoLarvia();
    charts.length = 0;
    click(root.querySelector('[data-biofs="plg"]'));

    const fs = charts.find((c) => c.id === 'svBioFsCanvas');
    expect(fs).toBeTruthy();
    expect(fs.cfg.data.datasets).toHaveLength(2);
    expect(fs.cfg.data.datasets[1].label).toBe('Promedio módulo');
    expect(fs.cfg.data.datasets[1].data.some((v) => v !== null)).toBe(true);
  });
});

describe('T-03 · el historial de observaciones se construye al abrir', () => {
  const gotoTank = () => {
    gotoModule(root);
    click([...root.querySelectorAll('.sv-tank-card')].find((c) => c.textContent.includes('TQ1')));
  };

  it('el cuerpo del modal nace vacío', () => {
    gotoTank();
    expect(root.querySelector('[data-obshist-body]').innerHTML).toBe('');
  });

  it('al abrirlo se rellena con las observaciones del tanque', () => {
    gotoTank();
    click(root.querySelector('[data-obshist-open]'));
    const body = root.querySelector('[data-obshist-body]');
    expect(body.querySelectorAll('.sv-hist-item').length).toBeGreaterThan(0);
    expect(body.textContent).toContain('Observación 0 de TQ1');
    expect(body.querySelector('.sv-hist-count')).toBeTruthy();
  });

  it('reabrirlo no duplica la lista', () => {
    gotoTank();
    const open = root.querySelector('[data-obshist-open]');
    click(open);
    const n = root.querySelectorAll('[data-obshist-body] .sv-hist-item').length;
    click(root.querySelector('[data-obshist-close]'));
    click(open);
    expect(root.querySelectorAll('[data-obshist-body] .sv-hist-item')).toHaveLength(n);
  });
});

describe('B-01 · el tooltip del heatmap Biomol no sobrevive a la sub-vista', () => {
  it('se crea al pasar el ratón y se suelta al volver a la landing', () => {
    gotoModule(root);
    click(root.querySelector('[data-biomol-open]'));

    const celda = root.querySelector('.sv-bm-cell[data-idx]');
    expect(celda).toBeTruthy();
    celda.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
    expect(document.querySelector('.sv-bm-tip')).toBeTruthy(); // cuelga de <body>

    // Salir del módulo sin cerrar el modal: antes el nodo quedaba huérfano en <body>.
    click(root.querySelector('[data-nav="modules"]'));
    expect(document.querySelector('.sv-bm-tip')).toBeNull();
  });
});
