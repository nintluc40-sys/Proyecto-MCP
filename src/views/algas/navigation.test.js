// @vitest-environment happy-dom
// Test de regresión de navegación integral de Algas: renderiza la vista con datos
// sintéticos de Lab_Algas y ejercita sub-vistas por categoría, filtros, modos de la
// curva de crecimiento, fullscreen, Resumen del día, los indicadores del mes
// (Biomasa/Descarte/Cobertura), Índices, export y navegación de mes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { algasView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const A = (o) => ({ _SheetOrigin: 'Lab_Algas', ...o });

function synthData() {
  const rows = [];
  // Sistemas de varias categorías, con series diarias para curvas.
  const sysList = [
    ['M1', 'Masivos'], ['M2', 'Masivos'], ['PM1', 'Premasivos'],
    ['C1', 'Carboys'], ['PBR1', 'PBR'],
  ];
  const dates = ['02/06/2026', '04/06/2026', '06/06/2026'];
  sysList.forEach(([sis], si) => {
    dates.forEach((f, di) => {
      rows.push(A({
        Fecha: f, Corrida_Larv: '573', Modulo_Larv: 'M0' + ((si % 3) + 1), 'Área_Algas': 'A1',
        Sistema: sis, Dia_Proceso: String(di + 1), Cel_ml: String(1000 + di * 800 + si * 200),
        Protozoarios: String(di === 2 ? 6 : 2), Ciliados: String(1), Filamentosos: String(0),
        Especie: ['TW', 'IS', 'TT'][si % 3], Salinidad_ppt: '30', pH: '8.0', Temperatura_C: '26',
        'Intensidad_Luz_%': '80', Descartado: di === 2 && si === 0 ? 'Sí' : 'No',
        Observaciones: di === 2 ? 'revisar densidad' : '', 'Técnico': 'Ana',
      }));
    });
  });
  // Fundas (categoría de barras, con Lote) — dos lotes.
  ['A', 'B'].forEach((lote, li) => {
    ['02/06/2026', '04/06/2026'].forEach((f, di) => {
      rows.push(A({
        Fecha: f, Corrida_Larv: '573', Modulo_Larv: 'M01', 'Área_Algas': 'A2',
        Sistema: 'FP', Lote: lote, Dia_Proceso: String(di + 1), Cel_ml: String(500 + di * 300 + li * 100),
        Protozoarios: '1', Especie: 'CH', Salinidad_ppt: '31', pH: '8.1', Temperatura_C: '25', 'Técnico': 'Beto',
      }));
    });
  });
  // Mes anterior (mayo, corrida 567) para deltas vs mes previo.
  rows.push(A({ Fecha: '10/05/2026', Corrida_Larv: '567', Modulo_Larv: 'M02', Sistema: 'M1', Dia_Proceso: '1', Cel_ml: '900', Protozoarios: '2', Descartado: 'No', 'Técnico': 'Ana' }));
  return rows;
}

function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function change(el, value) { if (el) { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); } }

let errSpy, root;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'algas';
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

// vState es singleton de módulo: normaliza a la categoría Masivos y modo Líneas.
function mount() {
  algasView(root);
  const masivos = root.querySelector('[data-alg-sub="Masivos"]');
  if (masivos && !masivos.classList.contains('is-active')) click(masivos);
  const gv = root.querySelector('[data-algfilter="growthView"]');
  if (gv && gv.value !== 'lines') change(gv, 'lines');
  return root;
}

describe('Algas · harness de navegación integral', () => {
  it('render base con KPIs, subnav por categoría y análisis del mes', () => {
    mount();
    expect(root.querySelector('.alg-kpis')).toBeTruthy();
    expect(root.querySelector('.alg-subnav')).toBeTruthy();
    expect(root.querySelector('.alg-mind-row')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('cambia de subvista de categoría (Masivos→Fundas→PBR)', () => {
    mount();
    ['Fundas', 'PBR', 'Masivos'].forEach((cat) => {
      const pill = root.querySelector(`[data-alg-sub="${cat}"]`);
      if (pill) {
        click(pill);
        // el clic re-renderiza toda la vista → re-consultar el pill actualizado
        const active = root.querySelector(`[data-alg-sub="${cat}"]`);
        expect(active && active.classList.contains('is-active')).toBe(true);
      }
    });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modos de la curva de crecimiento + selector de sistema', () => {
    mount();
    const gv = root.querySelector('[data-algfilter="growthView"]');
    if (gv) ['norm', 'smult', 'heatmap', 'lines'].forEach((m) => change(gv, m));
    const sysSel = root.querySelector('[data-algfilter="sysSel"]');
    if (sysSel && sysSel.options.length > 1) change(sysSel, sysSel.options[1].value);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('fullscreen de un gráfico (⛶) abre y cierra', () => {
    mount();
    const fs = root.querySelector('[data-alg-fs]');
    expect(fs).toBeTruthy();
    click(fs);
    expect(root.querySelector('#algFsModal').classList.contains('sv-open')).toBe(true);
    click(root.querySelector('[data-alg-fs-close]'));
    expect(root.querySelector('#algFsModal').classList.contains('sv-open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('Resumen del día: abre, navega y cierra', () => {
    mount();
    click(root.querySelector('[data-alg-daysum]'));
    expect(root.querySelector('#algDayModal').classList.contains('sv-open')).toBe(true);
    const prev = root.querySelector('[data-alg-day-nav="-1"]');
    if (prev && !prev.disabled) click(prev);
    click(root.querySelector('[data-alg-day-close]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('indicadores del mes: Biomasa, Descarte, Cobertura (con clic de día) e Índices', () => {
    mount();
    click(root.querySelector('[data-alg-open="bio"]'));
    expect(root.querySelector('#algBioModal').classList.contains('sv-open')).toBe(true);
    click(root.querySelector('[data-alg-open="desc"]'));
    expect(root.querySelector('#algDescModal').classList.contains('sv-open')).toBe(true);
    click(root.querySelector('[data-alg-open="cov"]'));
    expect(root.querySelector('#algCovModal').classList.contains('sv-open')).toBe(true);
    const covDay = root.querySelector('[data-cov-day]');
    if (covDay) { click(covDay); expect(root.querySelector('#algCovDayDetail').textContent).toContain('Registros del día'); }
    click(root.querySelector('[data-alg-indices]'));
    expect(root.querySelector('#algIndicesModal').classList.contains('sv-open')).toBe(true);
    expect(root.querySelector('#algIndicesModalBody').textContent).toContain('contaminación');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('export Excel: abre modal, ajusta rango y cierra', () => {
    mount();
    const expBtn = root.querySelector('[data-alg-export]');
    if (expBtn) {
      click(expBtn);
      expect(root.querySelector('#algExportModal').classList.contains('sv-open')).toBe(true);
      const from = root.querySelector('#algExpFrom');
      if (from) change(from, '2026-06-01');
      click(root.querySelector('[data-alg-exp-close]'));
    }
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('toggles de tablas y navegación de mes', () => {
    mount();
    root.querySelectorAll('[data-alg-toggle]').forEach((t) => { click(t); click(t); });
    const prev = root.querySelector('[data-month-nav="-1"]');
    if (prev && !prev.disabled) click(prev);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
