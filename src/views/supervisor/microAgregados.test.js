// @vitest-environment happy-dom
// Auditoría de cierre · Módulo → modal de Microbiología, pestaña Placa.
// El KPI «Σ UFC total» excluía SOLO «C. Totales», mientras la capa de datos declara DOS
// conteos agregados —`AGGREGATE_KEYS = {'totales','bactTot'}`— y el KPI «Dominante», dos
// líneas más abajo en el mismo bloque, sí los excluye a los dos. Resultado: «Bact. Totales»
// (una suma, y de las grandes) se sumaba a los patógenos específicos e inflaba el total.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';
import { AGGREGATE_KEYS } from '../microbiologia/data.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });

// Un módulo mínimo con vida + UNA muestra de microbiología con dos específicos y los DOS
// agregados. Valores elegidos para que el error sea inconfundible: el total correcto es
// 150 y el equivocado 10.150.
const ESPECIFICOS = 100 + 50;
const BACT_TOTALES = 10000;
function synth() {
  return [
    L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', Fecha: '01/06/2026', 'Población': '1000000', 'Estadío': 'N5' }),
    L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', Fecha: '10/06/2026', 'Población': '800000', 'Estadío': 'PL5' }),
    {
      _SheetOrigin: 'Microbiología', 'Módulo': 'M01', Corrida: '573', 'Fecha muestreo': '05/06/2026',
      'V.Amarillos UFC': '100',      // específico
      'V.Verdes UFC': '50',          // específico
      'V.Totales UFC': '150',        // AGREGADO (amarillas + verdes)
      'Bact.Totales UFC': String(BACT_TOTALES), // AGREGADO
    },
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

function abrirMicro() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  // `vState` del Supervisor persiste entre pruebas: si una anterior ya entró al módulo,
  // este render arranca dentro de él y no hay tarjeta de la landing que pulsar.
  const card = root.querySelector('[data-nav="module"]');
  if (card) click(card);
  const btn = root.querySelector('[data-micro-open]');
  expect(btn, 'el botón de Microbiología debe existir con una muestra del módulo').toBeTruthy();
  click(btn);
  return root;
}
// Valor del KPI cuya etiqueta es `label` dentro del modal de microbiología.
function kpi(root, label) {
  const st = [...root.querySelectorAll('.mic-pe-st')].find((n) => n.textContent.includes(label));
  return st ? st.querySelector('.mic-pe-st-v').textContent.trim() : null;
}

describe('Σ UFC total · los conteos AGREGADOS no se suman a los específicos', () => {
  it('control: la capa de datos declara dos agregados, no uno', () => {
    expect([...AGGREGATE_KEYS].sort()).toEqual(['bactTot', 'totales']);
  });

  it('«Bact. Totales» queda fuera del total, igual que «C. Totales»', () => {
    const root = abrirMicro();
    expect(kpi(root, 'Σ UFC total')).toBe(String(ESPECIFICOS));
    // El valor inflado que daba antes (100 + 50 + 10.000) no debe aparecer.
    expect(kpi(root, 'Σ UFC total')).not.toBe(String(ESPECIFICOS + BACT_TOTALES));
  });

  it('los agregados SIGUEN mostrándose como colonias y en la leyenda', () => {
    const root = abrirMicro();
    const txt = root.querySelector('.sv-micro-side').textContent;
    // Excluirlos del SUMATORIO no es ocultarlos: siguen listados con su UFC.
    expect(txt).toContain('Bact. Totales');
    expect(txt).toContain('C. Totales');
    expect(kpi(root, 'Patógenos')).toBe('4'); // los 4 con UFC, agregados incluidos
  });

  it('el «Dominante» tampoco es un agregado (no se rompe lo que ya estaba bien)', () => {
    const root = abrirMicro();
    expect(kpi(root, 'Dominante')).toBe('C. Amarillas'); // el mayor de los ESPECÍFICOS
  });
});
