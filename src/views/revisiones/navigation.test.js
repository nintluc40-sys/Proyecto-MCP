// @vitest-environment happy-dom
// Test de regresión de navegación integral de Revisiones: renderiza la vista con
// datos sintéticos de Registro_Supervisión y ejercita filtros en cascada, fase 1↔2,
// comparativa de periodos, navegación de mes, drill-downs (Calidad/treemap/Sankey/
// timeline) y todos los modales, verificando ausencia de errores de runtime.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { revisionesView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', ...o });

function synthData() {
  const rows = [];
  const dates = ['20/05/2026', '22/05/2026', '02/06/2026', '04/06/2026', '06/06/2026', '08/06/2026'];
  const mods = ['Módulo 1', 'Módulo 2'];
  const sups = ['Ana', 'Beto'];
  dates.forEach((f, di) => {
    mods.forEach((m, mi) => {
      rows.push(R({
        Corrida: di < 2 ? '567' : '573', 'Módulo': m, Siembra: String((mi % 2) + 1),
        Supervisor: sups[(di + mi) % 2], Fecha: f, 'Estadío_observado': ['Z2', 'M1', 'PL2'][di % 3],
        'Tipo_revisión': mi ? 'Vespertina' : 'Matutina',
        'Deformidad_%': String(3 + di), '% Atraso': String(10 + di), '% Protusión': String(2 + mi),
        '% No viables': String(4 + mi), 'Semillenas (%)': String(20 - di), 'Vacías (%)': String(5 + di),
        'Asimilación': ['Alta', 'Media', 'Baja'][di % 3], 'Actividad': ['Alta', 'Media', 'Baja'][mi],
        Intestino: ['Buena', 'Regular', 'Deficiente'][di % 3], 'Condición_biológica': ['Óptima', 'Regular', 'Crítica'][mi],
        Opacidad: ['Leve', 'Acentuada'][di % 2], 'Protusión': ['Leve', 'Acentuada'][mi],
        Observaciones: mi ? 'Vigilar, Continuar' : 'Continuar',
        'Acción': mi ? 'Ajustar alimentación' : 'Continuar',
        'Comentario (matutino)': mi ? '' : 'Sin novedad matutino',
        'Comentario (vespertino)': mi ? 'Revisar densidad' : '',
      }));
    });
  });
  return rows;
}

function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function change(el, value) { if (el) { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); } }

// vState es singleton de módulo (persiste entre tests como en una sesión real):
// renderiza y normaliza a Fase 1 limpiando los filtros de la barra.
function mount() {
  revisionesView(root);
  for (let i = 0; i < 4; i++) {
    const mod = root.querySelector('[data-rvfilter="mod"]');
    if (mod && mod.value) { change(mod, ''); continue; }
    const cor = root.querySelector('[data-rvfilter="corrida"]');
    if (cor && cor.value) { change(cor, ''); continue; }
    const sie = root.querySelector('[data-rvfilter="siembra"]');
    if (sie && sie.value) { change(sie, ''); continue; }
    break;
  }
  return root;
}

let errSpy, root;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'revisiones';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('Revisiones · harness de navegación integral', () => {
  it('render base (Fase 1) con KPIs, secciones y sin error', () => {
    mount();
    expect(root.querySelector('.rv-kpis')).toBeTruthy();
    expect(root.textContent).toContain('Panorama general');
    expect(root.querySelector('.rv-tl')).toBeTruthy(); // timeline de cobertura (solo Fase 1)
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('elegir módulo pasa a Fase 2 (detalle del módulo)', () => {
    mount();
    change(root.querySelector('[data-rvfilter="mod"]'), 'Módulo 1');
    expect(root.textContent).toContain('Detalle del módulo');
    // timeline (cross-módulo) desaparece en Fase 2
    expect(root.querySelector('.rv-tl')).toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('filtros corrida/siembra y pills de comparativa', () => {
    mount();
    change(root.querySelector('[data-rvfilter="corrida"]'), '573');
    change(root.querySelector('[data-rvfilter="siembra"]'), '1');
    [14, 30, 7].forEach((d) => click(root.querySelector(`[data-cmp-days="${d}"]`)));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('drill-downs: tile de Calidad, celda de treemap y cinta de Sankey', () => {
    mount();
    click(root.querySelector('[data-drillqual]'));
    expect(root.querySelector('#rv-drill-modal').classList.contains('rv-open')).toBe(true);
    click(root.querySelector('[data-drill-close]'));
    const tm = root.querySelector('[data-drillval]');
    if (tm) { click(tm); expect(root.querySelector('#rv-drill-modal').classList.contains('rv-open')).toBe(true); click(root.querySelector('[data-drill-close]')); }
    const sk = root.querySelector('[data-sk-obs]');
    if (sk) { click(sk); expect(root.querySelector('#rv-sankey-info').textContent).toMatch(/%/); }
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Historial con filtros en cascada', () => {
    mount();
    click(root.querySelector('[data-hist-open]'));
    expect(root.querySelector('#rv-hist-modal').classList.contains('rv-open')).toBe(true);
    change(root.querySelector('[data-hist-sel="corrida"]'), '573');
    change(root.querySelector('[data-hist-sel="mod"]'), 'Módulo 1');
    click(root.querySelector('[data-hist-close]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('timeline: detalle de módulo (🔎) y celda de cobertura (día×módulo)', () => {
    mount();
    click(root.querySelector('[data-moddetail]'));
    expect(root.querySelector('#rv-mod-modal').classList.contains('rv-open')).toBe(true);
    click(root.querySelector('[data-mod-close]'));
    const dc = root.querySelector('[data-daycell]');
    expect(dc).toBeTruthy();
    click(dc);
    expect(root.querySelector('#rv-daycell-modal').classList.contains('rv-open')).toBe(true);
    // filtro de supervisor dentro del modal (si hay ≥2)
    const supSel = root.querySelector('[data-daycell-sup]');
    if (supSel) change(supSel, supSel.options[supSel.options.length - 1].value);
    click(root.querySelector('[data-daycell-close]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('bitácora desplegable + navegación de mes', () => {
    mount();
    const tog = root.querySelector('[data-bita-toggle]');
    if (tog) { click(tog); click(tog); }
    const prev = root.querySelector('[data-month-nav="-1"]');
    if (prev && !prev.disabled) click(prev);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
