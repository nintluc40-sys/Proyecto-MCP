// @vitest-environment happy-dom
// Test de regresión de navegación integral de Larvicultura: renderiza la vista con
// datos sintéticos y ejercita filtros (mes/corrida/módulo/tanque), estadío, rango,
// histograma, modos de población, los 4 modales y el modal de fisicoquímicos,
// verificando que no se produzca ningún error de runtime.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { larviculturaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}
// Contexto 2D falso para los sparklines (canvas real usa getContext, no makeChart).
const noop = () => {};
const fakeCtx = new Proxy({}, { get: () => noop, set: () => true });
if (typeof globalThis.HTMLCanvasElement !== 'undefined') {
  globalThis.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
}

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const T = (o) => ({ _SheetOrigin: 'Control_Tanque M01', ...o });

function synthData() {
  const rows = [];
  const dates = ['01/06/2026', '03/06/2026', '05/06/2026', '07/06/2026', '09/06/2026'];
  const estad = ['N5', 'Z1', 'Z3', 'M1', 'PL2'];
  ['TQ1', 'TQ2'].forEach((tq, ti) => {
    dates.forEach((f, i) => {
      rows.push(L({
        'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: f, 'Estadío': estad[i],
        'Población': String(1000 - i * 90 - ti * 30),
        'Intestino_Vacio': String(4 + i), 'Intestino_Lleno': String(90 - i), 'Intestino_Semilleno': String(6),
        Deformidad: String(3 + i), Retraso: String(10 + i), Hongos: String(2), 'No_Viables': String(5),
        Opacidad: String(4), 'Flácidez': String(3), Necrosis: String(2), Canibalismo: String(2), Parasitos: String(1),
        'Estrés': String(3 + (i % 3)), '% Actividad': String(88 - i), '% Espuma': '8', '% Suciedad': '6', '% Recambio': '40',
        'Cel/ml': String(30000 - i * 1000), Salinidad: '31', Supervivencia: String(95 - i * 2),
        Color: 'Café claro', Observaciones: i === 4 ? 'muestreo' : '',
      }));
    });
  });
  // Segunda corrida del módulo para "Comparar corridas"
  ['TQ1'].forEach((tq) => {
    ['02/05/2026', '04/05/2026'].forEach((f, i) => {
      rows.push(L({ 'Módulo': 'M01', Corrida: '567', Tanque: tq, Fecha: f, 'Estadío': i ? 'Z1' : 'N5', 'Población': String(900 - i * 80), 'Intestino_Vacio': '6', Deformidad: '4', Retraso: '12', Hongos: '2', 'No_Viables': '6', Supervivencia: '92' }));
    });
  });
  // Control_Tanque para fisicoquímicos (OD/Temp)
  ['TQ1', 'TQ2'].forEach((tq) => {
    ['05/06/2026', '07/06/2026'].forEach((f, i) => {
      rows.push(T({ 'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: f, OD: String(6 - i * 0.3), Temperatura: String(32 - i), Salinidad: '31' }));
    });
  });
  return rows;
}

function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function change(el, value) { if (el) { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); } }

let errSpy, root;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'larvicultura';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

// Lleva la vista a un módulo elegido (gate: sin módulo no se computa el tablero).
function mountReady() {
  larviculturaView(root);
  change(root.querySelector('[data-filter="modulo"]'), 'M01');
  return root;
}

describe('Larvicultura · harness de navegación integral', () => {
  it('gate: sin módulo muestra el prompt y no calcula el tablero', () => {
    larviculturaView(root);
    expect(root.textContent).toContain('Elige tu');
    expect(root.querySelector('[data-filter="modulo"]')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('elegir módulo computa el tablero completo (auto-corrida)', () => {
    mountReady();
    expect(root.querySelector('#lqResumen')).toBeTruthy();
    expect(root.querySelector('#lqDetalle')).toBeTruthy();
    expect(root.textContent).toContain('Comparativa del módulo');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('cambia estadío Larv↔Post-L, rango e histograma sin error', () => {
    mountReady();
    click(root.querySelector('[data-stage="postl"]'));
    expect(root.textContent).toContain('Post-Larva');
    click(root.querySelector('[data-stage="larv"]'));
    ['7', '30', 'all', '15'].forEach((r) => click(root.querySelector(`[data-range="${r}"]`)));
    click(root.querySelector('[data-histvar="actividad"]'));
    click(root.querySelector('[data-histvar="estres"]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('alterna modos de población (dumbbell/tendencia/proyección)', () => {
    mountReady();
    ['trend', 'forecast', 'dumbbell'].forEach((m) => click(root.querySelector(`[data-popmode="${m}"]`)));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('selección de tanque hace refresco parcial (Resumen+Detalle)', () => {
    mountReady();
    change(root.querySelector('#lqDetalle [data-filter="tanque"]'), 'TQ1');
    expect(root.querySelector('#lqResumen').textContent).toContain('TQ1');
    // toggle suavizar + bitácora
    click(root.querySelector('[data-evosmooth]'));
    const bita = root.querySelector('[data-bita-toggle]');
    if (bita) click(bita);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('abre los 4 modales de acción y el de fisicoquímicos', () => {
    mountReady();
    ['lq-modal-comp', 'lq-modal-corr', 'lq-modal-hist', 'lq-modal-dec'].forEach((id) => {
      click(root.querySelector(`[data-open-modal="${id}"]`));
      expect(root.querySelector('#' + id).classList.contains('lq-open')).toBe(true);
    });
    // Modal fisicoquímicos (KPI del Resumen)
    const envKpi = root.querySelector('[data-envopen]');
    expect(envKpi).toBeTruthy();
    click(envKpi);
    expect(root.querySelector('#lqEnvModal').classList.contains('lq-open')).toBe(true);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('interactúa dentro del modal Comparar (toggle tanque) y Comparar corridas (select)', () => {
    mountReady();
    click(root.querySelector('[data-open-modal="lq-modal-comp"]'));
    const pill = root.querySelector('#lq-modal-comp [data-comp-tank]');
    if (pill) { click(pill); click(pill); } // deselecciona y re-selecciona
    click(root.querySelector('[data-open-modal="lq-modal-corr"]'));
    const selB = root.querySelector('[data-corrsel="b"]');
    if (selB) change(selB, '567');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('navegación de mes resetea la selección', () => {
    mountReady();
    const prev = root.querySelector('[data-month-nav="-1"]');
    if (prev && !prev.disabled) {
      click(prev);
      // tras cambiar de mes vuelve al gate (módulo reseteado)
      expect(root.querySelector('[data-filter="modulo"]')).toBeTruthy();
    }
    expect(errSpy).not.toHaveBeenCalled();
  });
});
