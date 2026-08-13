// @vitest-environment happy-dom
/* ============================================================
   REVISIONES · auditoría de la tanda 2026-08-13

   No prueba funcionalidad nueva: MIDE los efectos colaterales de haber unificado las
   listas de variables en un registro, para que queden documentados y fijados.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { revisionesView } from './index.js';
import { KPI_ORDER } from './metrics.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', ...o });

/** Dos módulos, corrida 573 (mes 5), 4 fechas seguidas para que la comparativa
 *  de 7 días tenga ventana actual Y previa. */
function datos({ nuevas = true } = {}) {
  const rows = [];
  const fechas = ['26/05/2026', '28/05/2026', '02/06/2026', '04/06/2026'];
  [['Módulo 1', 10], ['Módulo 2', 40]].forEach(([mod, base], mi) => {
    fechas.forEach((f, di) => {
      rows.push(R({
        Corrida: '573', 'Módulo': mod, Siembra: String(mi + 1), Supervisor: 'Ana', Fecha: f,
        'Estadío_observado': 'M1', 'Tipo_revisión': 'Matutina',
        'Deformidad_%': String(base + di), '% Atraso': String(base + 1), '% Protusión': String(base + 2),
        '% No viables': String(base + 3), 'Semillenas (%)': String(base + 4), 'Vacías (%)': String(base + 5),
        ...(nuevas ? { Flacidez: String(base), Necrosis: String(base + 6), Disparidad: String(base + 7) } : {}),
        Observaciones: 'Continuar', 'Acción': 'Continuar',
        'Comentario (matutino)': 'Nota ' + di,
      }));
    });
  });
  return rows;
}

const change = (el, v) => { if (el) { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); } };
const click = (el) => { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };

let root, errSpy;
function mount() {
  revisionesView(root);
  for (let i = 0; i < 4; i++) {
    const f = ['mod', 'corrida', 'siembra'].map((d) => root.querySelector(`[data-rvfilter="${d}"]`)).find((el) => el && el.value);
    if (!f) break;
    change(f, '');
  }
  return root;
}

beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'revisiones';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = datos();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('revisiones · auditoría · comparativa de periodos', () => {
  it('las 9 cuantitativas entran en la comparativa cuando tienen datos', () => {
    mount();
    const grid = root.querySelector('.rv-cmp-grid');
    expect(grid).toBeTruthy();
    const txt = grid.textContent;
    // Las 3 de conteo que ya había…
    ['Revisiones', 'Hallazgos', 'Acciones'].forEach((l) => expect(txt).toContain(l));
    // …y ahora TODAS las cuantitativas, no sólo Deformidad y Vacías.
    ['Deformidad prom.', 'Atraso prom.', 'Protusión prom.', 'No viables prom.',
      'Vacías prom.', 'Semillenas prom.', 'Flacidez prom.', 'Necrosis prom.',
      'Disparidad prom.'].forEach((l) => expect(txt).toContain(l));
  });

  it('⚠ efecto colateral medido: la comparativa pasa de 5 a 12 tarjetas', () => {
    // Antes: Revisiones, Hallazgos, Acciones, Deformidad y Vacías (si tenía datos).
    // Ahora: esas 3 + las 9 cuantitativas = 12. Queda anotado por si se decide recortar.
    mount();
    expect(root.querySelectorAll('.rv-cmp-grid > *')).toHaveLength(3 + KPI_ORDER.length);
  });

  it('sin datos nuevos la comparativa NO inventa tarjetas vacías', () => {
    store.globalData = datos({ nuevas: false });
    mount();
    const txt = root.querySelector('.rv-cmp-grid').textContent;
    ['Flacidez', 'Necrosis', 'Disparidad'].forEach((l) => expect(txt).not.toContain(l));
    // Las que siempre se muestran siguen: 3 de conteo + 6 con datos.
    expect(root.querySelectorAll('.rv-cmp-grid > *')).toHaveLength(3 + 6);
  });
});

describe('revisiones · auditoría · KPIs del detalle de módulo', () => {
  it('el modal de módulo recorre el MISMO registro (antes le faltaba Semillenas)', () => {
    mount();
    click(root.querySelector('[data-moddetail]'));
    const det = root.querySelector('.rv-det-kpis');
    expect(det).toBeTruthy();
    const txt = det.textContent;
    ['Deformidad prom.', 'Atraso prom.', 'Protusión prom.', 'No viables prom.',
      'Vacías prom.', 'Semillenas prom.', 'Flacidez prom.', 'Necrosis prom.',
      'Disparidad prom.'].forEach((l) => expect(txt).toContain(l));
  });

  it('esos KPIs NO son clicables: abrirían un modal dentro de otro modal', () => {
    mount();
    click(root.querySelector('[data-moddetail]'));
    const det = root.querySelector('.rv-det-kpis');
    expect(det.querySelectorAll('[data-rvtrend]')).toHaveLength(0);
    expect(det.querySelectorAll('button.rv-kpi-btn')).toHaveLength(0);
  });

  it('los KPIs de CABECERA sí son clicables (no se rompió lo de la tarea 3)', () => {
    mount();
    expect(root.querySelectorAll('.rv-kpis:not(.rv-det-kpis) [data-rvtrend]').length)
      .toBe(KPI_ORDER.length);
  });
});

describe('revisiones · auditoría · ficha de detalle de una revisión', () => {
  it('lista las 9 cuantitativas', () => {
    mount();
    // Abre una celda del timeline de cobertura → ficha(s) de revisión del día.
    const celda = root.querySelector('[data-daycell]');
    expect(celda).toBeTruthy();
    click(celda);
    const cuerpo = document.querySelector('#rv-daycell-content') || root;
    const txt = cuerpo.textContent;
    ['Deformidad', 'Atraso', 'Protusión', 'No viables', 'Vacías', 'Semillenas',
      'Flacidez', 'Necrosis', 'Disparidad'].forEach((l) => expect(txt).toContain(l));
    expect(errSpy).not.toHaveBeenCalled();
  });
});
