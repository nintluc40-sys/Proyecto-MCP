// @vitest-environment happy-dom
// Regresión del ciclo de vida de los modales del Resumen Operativo:
//   · R-08 los gráficos de Comparativa y Métrica se destruyen al cerrar
//   · R-09 el cuadro de Siembras se construye al ABRIR, no en cada render del módulo
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Registro de instancias para poder afirmar creación/destrucción.
const charts = { creados: [], destruidos: [] };
vi.mock('../../core/charts.js', () => ({
  makeChart: (id) => { charts.creados.push(id); return null; },
  destroyChart: (id) => { charts.destruidos.push(typeof id === 'string' ? id : '(canvas)'); },
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

// rAF SÍNCRONO (se sobrescribe siempre, también el de happy-dom, que es asíncrono):
// Comparativa y Métrica dibujan dentro de un rAF, así que sin esto se afirmaría antes
// de que el gráfico llegue a crearse.
globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const T = (o) => ({ _SheetOrigin: 'Control_Tanque', ...o });

function synth() {
  const rows = [];
  ['TQ1', 'TQ2'].forEach((tq, ti) => {
    ['01/06/2026', '05/06/2026', '10/06/2026'].forEach((f, i) => {
      rows.push(L({
        'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: f, Lote: 'AB',
        'Población': String(1000000 - i * 100000 - ti * 50000),
        'Estadío': ['N5', 'Z3', 'PL5'][i], Salinidad: '30', 'Estrés': '3',
        'Intestino_Lleno': '90', 'Lípidos': '95', 'Técnico': 'Juan Murillo',
      }));
      rows.push(T({ 'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: f, Hora: '8:00:00', OD: '6.2', Temperatura: '31' }));
    });
  });
  return rows;
}

let errSpy;
beforeEach(() => {
  charts.creados.length = 0; charts.destruidos.length = 0;
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = synth();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

function abrirModulo() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  const card = root.querySelector('[data-nav="module"]');
  if (card) click(card);
  return root;
}

describe('R-08 · los gráficos de los modales se destruyen al cerrar', () => {
  it('Comparativa de tanques crea svModCmp al abrir y lo destruye al cerrar', () => {
    const root = abrirModulo();
    const abrir = root.querySelector('[data-modcmp-open]');
    expect(abrir).toBeTruthy();
    click(abrir);
    expect(charts.creados).toContain('svModCmp');
    click(root.querySelector('[data-modcmp-close]'));
    expect(charts.destruidos).toContain('svModCmp');
  });

  it('el modal de Métrica destruye svModMetricCanvas al cerrar', () => {
    const root = abrirModulo();
    const chip = root.querySelector('[data-modmetric="sv"]');
    expect(chip).toBeTruthy();
    click(chip);
    expect(charts.creados).toContain('svModMetricCanvas');
    click(root.querySelector('[data-modmetric-close]'));
    expect(charts.destruidos).toContain('svModMetricCanvas');
  });
});

describe('R-09 · el cuadro de Siembras se construye al abrir', () => {
  it('el contenedor llega VACÍO al render y se rellena al abrir el modal', () => {
    const root = abrirModulo();
    const host = root.querySelector('#svSieContent');
    expect(host).toBeTruthy();
    expect(host.innerHTML.trim()).toBe(''); // no se generó en el render del módulo

    click(root.querySelector('[data-siembras-open]'));
    expect(host.innerHTML).toContain('Sembrado');
    expect(host.innerHTML).toContain('Proyectado');
  });

  it('cambiar la merma repinta el contenido y conserva la cabecera con el selector', () => {
    const root = abrirModulo();
    click(root.querySelector('[data-siembras-open]'));
    const sel = root.querySelector('[data-sie-merma]');
    expect(sel).toBeTruthy();

    const host = root.querySelector('#svSieContent');
    expect(host.innerHTML).toContain('Proyectado −10%');

    sel.value = '15';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(host.innerHTML).toContain('Proyectado −15%');
    // La cabecera NO se rehace: el mismo <select> sigue en el DOM.
    expect(root.querySelector('[data-sie-merma]')).toBe(sel);
  });
});

/* ============================================================
   Los tres modales hermanos (Biomol · Microbiología · Calidad de Agua) deben volver a
   su pestaña por defecto al ABRIR. Biomol era el único que conservaba la última vista:
   dejarlo en «E.D.T.» y reabrirlo abría en E.D.T., mientras Micro y CalAgua sí volvían.
   ============================================================ */
describe('los modales vuelven a su pestaña por defecto al reabrir', () => {
  const B = (o) => ({ _SheetOrigin: 'Biomol', ...o });

  beforeEach(() => {
    // Dos análisis moleculares del módulo M01 / corrida 573, en estadío NO reproductor.
    store.globalData = [
      ...synth(),
      B({ Fecha: '05/06/2026', Lugar: 'Módulo 1', Corrida: '573', Tanque: 'TQ1', 'Estadío': 'PL5', IHHNV: 'Negativo', WSSV: 'Negativo' }),
      B({ Fecha: '10/06/2026', Lugar: 'Módulo 1', Corrida: '573', Tanque: 'TQ2', 'Estadío': 'PL5', IHHNV: 'Positivo', WSSV: 'Negativo' }),
    ];
  });

  it('Biomol reabre en «Heatmap · Tanque» aunque se dejara en «E.D.T.»', () => {
    const root = abrirModulo();
    const abrir = root.querySelector('[data-biomol-open]');
    expect(abrir).toBeTruthy(); // el botón sólo existe si hay filas Biomol

    click(abrir);
    const activo = () => root.querySelector('[data-bmmode].is-active')?.dataset.bmmode;
    expect(activo()).toBe('tank');

    // El supervisor se pasa al E.D.T. y cierra el modal.
    click(root.querySelector('[data-bmmode="gel"]'));
    expect(activo()).toBe('gel');
    click(root.querySelector('[data-biomol-close]'));

    // Al reabrir NO debe seguir en el E.D.T.
    click(abrir);
    expect(activo()).toBe('tank');
  });
});
