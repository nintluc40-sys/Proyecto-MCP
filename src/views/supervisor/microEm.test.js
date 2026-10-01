// @vitest-environment happy-dom
// 2026-09-30 (usuario) · Módulo → modal de Microbiología: «Larvicultura · EM» (pH + conteos de BA y Levaduras)
// tiene su PROPIA pestaña «🧪 EM», detrás de Tendencias, y ya no aparece en Placa, Tabla, Heatmap ni Tendencias
// (allí sólo ponía muestras y días VACÍOS: sus columnas no son de ningún patógeno del catálogo).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { charts } = vi.hoisted(() => ({ charts: [] }));
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts.push({ id, cfg }); return null; }, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';
import { emDeFila } from '../microbiologia/data.js';
import { fmtShort, parseAnyDate } from '../../core/dates.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const MIC = (o) => ({ _SheetOrigin: 'Microbiología', 'Módulo/Sala': '1', Corrida: '573', Departamento: 'Larvicultura', ...o });
const es = (n) => n.toLocaleString('es-EC');

const LARV = [
  L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', Fecha: '01/06/2026', 'Población': '1000000', 'Estadío': 'N5' }),
  L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', Fecha: '10/06/2026', 'Población': '800000', 'Estadío': 'PL5' }),
];
// Una muestra de patógenos (TQ 1, el 05/06) y dos análisis EM (sin tanque, el 07/06 y el 09/06; pH con coma y con punto).
const PATOGENOS = MIC({ Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'TQ/N°': '1', 'Fecha muestreo': '05/06/2026', 'V.Amarillos UFC': '100' });
const EM1 = MIC({ Formato: 'Larvicultura · EM', 'Fecha muestreo': '07/06/2026', 'Fecha resultados': '08/06/2026', pH: '4,6',
  'Conteo BA (crudo)': '66', 'Conteo BA UFC': '132000000', 'Conteo Lev. (crudo)': '2,1', 'Conteo Lev. UFC': '3360000' });
const EM2 = MIC({ Formato: 'Larvicultura · EM', 'Fecha muestreo': '09/06/2026', 'Fecha resultados': '10/06/2026', pH: '3.96',
  'Conteo BA (crudo)': '103,25', 'Conteo BA UFC': '206500000', 'Conteo Lev. (crudo)': '1,57', 'Conteo Lev. UFC': '2512000',
  Observaciones: 'Olor a fermento' });

let errSpy;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = [...LARV, PATOGENOS, EM1, EM2];
  document.body.innerHTML = '';
  charts.length = 0;
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

function abrirMicro() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  const card = root.querySelector('[data-nav="module"]'); // vState persiste: puede arrancar ya dentro del módulo
  if (card) click(card);
  click(root.querySelector('[data-micro-open]'));
  return root;
}
const pestana = (root, modo) => { click(root.querySelector(`[data-micmode="${modo}"]`)); return root.querySelector('#svMicroBody'); };

describe('🧪 EM · su propia pestaña, detrás de Tendencias', () => {
  it('la barra del modal: Placa · Tabla · Heatmap · Tendencias · EM', () => {
    const root = abrirMicro();
    expect([...root.querySelectorAll('[data-micmode]')].map((b) => b.dataset.micmode)).toEqual(['placa', 'tabla', 'heatmap', 'tendencias', 'em']);
    expect(root.querySelector('[data-micro-open]').textContent).toContain('(3)'); // el botón sigue contando las tres muestras
  });

  it('el último análisis arriba y la tabla de todos, del más reciente al más antiguo (pH con coma o punto)', () => {
    const body = pestana(abrirMicro(), 'em');
    const kpis = [...body.querySelectorAll('.sv-mtrend-kpi')].map((k) => k.querySelector('b').textContent);
    expect(kpis).toEqual([(3.96).toLocaleString('es-EC'), es(206500000), es(2512000)]);
    expect(body.querySelector('.sv-mtrend-dname').textContent).toContain(fmtShort(parseAnyDate('09/06/2026')));
    const filas = [...body.querySelectorAll('.sv-table tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim()));
    expect(filas).toHaveLength(2);
    expect(filas[0]).toEqual([fmtShort(parseAnyDate('09/06/2026')), fmtShort(parseAnyDate('10/06/2026')), '573', (3.96).toLocaleString('es-EC'),
      (103.25).toLocaleString('es-EC'), es(206500000), (1.57).toLocaleString('es-EC'), es(2512000), 'Olor a fermento']);
    expect(filas[1][3]).toBe((4.6).toLocaleString('es-EC'));
    expect(filas[1][8]).toBe('—');
  });

  it('la evolución: BA y Lev. en UFC (log) y el pH en su eje, en orden cronológico', () => {
    pestana(abrirMicro(), 'em');
    const g = charts.filter((c) => c.id === 'svMicEmChart').pop();
    expect(g).toBeTruthy();
    expect(g.cfg.options.scales.y.type).toBe('logarithmic');
    expect(g.cfg.data.datasets.map((d) => [d.label, d.yAxisID, d.data])).toEqual([
      ['BA (UFC)', 'y', [132000000, 206500000]],
      ['Lev. (UFC)', 'y', [3360000, 2512000]],
      ['pH', 'y2', [4.6, 3.96]],
    ]);
  });
});

describe('🧪 EM · ya no aparece en Placa, Tabla, Heatmap ni Tendencias', () => {
  it('Placa: un solo día, una muestra y sin «Sin TQ» (los EM no tienen tanque)', () => {
    const body = abrirMicro().querySelector('#svMicroBody');
    expect(body.querySelector('.sv-micro-daylbl').textContent).toContain('(1/1)');
    expect(body.querySelector('.mic-petri-foot').textContent).toMatch(/^1 muestra/);
    expect([...body.querySelectorAll('[data-micro-tank] option')].map((o) => o.textContent)).toEqual(['Todos los tanques', 'TQ 1']);
  });

  it('Tabla: sólo la muestra de patógenos', () => {
    const body = pestana(abrirMicro(), 'tabla');
    expect(body.querySelectorAll('.sv-table tbody tr')).toHaveLength(1);
    expect(body.textContent).not.toContain('EM');
  });

  it('Heatmap y Tendencias: sólo el día de la muestra de patógenos', () => {
    const root = abrirMicro();
    expect([...pestana(root, 'heatmap').querySelectorAll('.sv-micro-hm thead th')].slice(1).map((th) => th.textContent))
      .toEqual([fmtShort(parseAnyDate('05/06/2026'))]);
    pestana(root, 'tendencias');
    expect(charts.filter((c) => c.id === 'svMicTrendChart').pop().cfg.data.labels).toEqual([fmtShort(parseAnyDate('05/06/2026'))]);
  });
});

describe('🧪 EM · cuándo sale la pestaña', () => {
  it('sin análisis EM no hay pestaña', () => {
    store.globalData = [...LARV, PATOGENOS];
    expect(abrirMicro().querySelector('[data-micmode="em"]')).toBeNull();
  });

  it('con SÓLO análisis EM el modal abre en su pestaña', () => {
    store.globalData = [...LARV, EM1, EM2];
    const root = abrirMicro();
    expect(root.querySelector('[data-micmode="em"]').classList.contains('is-active')).toBe(true);
    expect(root.querySelector('[data-micmode="placa"]').classList.contains('is-active')).toBe(false);
    expect(root.querySelectorAll('#svMicroBody .sv-table tbody tr')).toHaveLength(2);
  });
});

describe('emDeFila · lee las columnas EM de la hoja', () => {
  it('coma o punto decimal, y null donde no hay dato', () => {
    expect(emDeFila(EM1)).toMatchObject({ ph: 4.6, baCrudo: 66, baUfc: 132000000, levCrudo: 2.1, levUfc: 3360000 });
    expect(emDeFila(EM2).ph).toBe(3.96);
    expect(emDeFila(PATOGENOS)).toMatchObject({ ph: null, baCrudo: null, baUfc: null, levCrudo: null, levUfc: null });
  });
});
