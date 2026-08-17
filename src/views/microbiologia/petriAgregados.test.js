// @vitest-environment happy-dom
// Auditoría definitiva · Microbiología · Placa Petri, pestaña Placa.
//
// El KPI «Σ UFC total» excluía a mano SOLO «C. Totales» (`c.key !== 'totales'`), mientras
// la capa de datos declara DOS conteos agregados —`AGGREGATE_KEYS = {'totales','bactTot'}`—
// y el KPI «Dominante», dos líneas más abajo en la MISMA función, sí los excluye a los dos.
// Resultado: «Bact. Totales» (una suma, y de las grandes) se sumaba a los patógenos
// específicos e inflaba el total.
//
// Es el mismo defecto que su panel GEMELO del Supervisor (`microAgregados.test.js`), que ya
// había sido corregido: `coloniesForDay` (microbiologia/index.js) y `microColonies`
// (supervisor/module.js) son la misma función, y solo uno de los dos lados recibió el
// arreglo.
//
// Medido sobre la hoja real de Microbiología (3.228 registros, 64 días):
//   56 de 64 días mostraban un total inflado · ×5,14 de inflación global
//   (193.113.973 mostrado vs 37.542.606 correcto)
//   peor día 20/06/2026: mostraba 1.061.010 donde correspondía 10.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';
import { AGGREGATE_KEYS } from './data.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', Corrida: '573', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', ...o });

// Un día con DOS específicos y los DOS agregados. Los valores separan las dos fórmulas sin
// ambigüedad: el total correcto es 150 y el equivocado 10.150. Que los específicos sumen
// exactamente lo que declara «C. Totales» es a propósito: así el fixture distingue también
// a un tercero que excluyera el agregado equivocado.
const ESPECIFICOS = 100 + 50;
const BACT_TOTALES = 10000;
const DIA = [
  M({
    'Fecha muestreo': '05/06/2026',
    'V.Amarillos UFC': '100',                 // específico
    'V.Verdes UFC': '50',                     // específico
    'V.Totales UFC': '150',                   // AGREGADO (amarillas + verdes)
    'Bact.Totales UFC': String(BACT_TOTALES), // AGREGADO
  }),
];

let root, errSpy;
beforeEach(() => {
  const s0 = {};
  globalThis.localStorage = {
    getItem: (k) => (k in s0 ? s0[k] : null),
    setItem: (k, v) => { s0[k] = String(v); },
    removeItem: (k) => { delete s0[k]; },
  };
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); delete globalThis.localStorage; });

function placa(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  root.querySelector('[data-mic-sub="bacteriologia"]').click();
  root.querySelector('[data-mic-ap="petri"]').click();
  root.querySelector('[data-mic-petab="placa"]').click();
}
/** Valor del KPI cuya etiqueta contiene `label`, dentro del panel lateral de la placa. */
function kpi(label) {
  const st = [...root.querySelectorAll('.mic-pe-st')].find((n) => n.textContent.includes(label));
  return st ? st.querySelector('.mic-pe-st-v').textContent.trim() : null;
}
const es = (n) => n.toLocaleString('es-EC');

describe('Placa · Σ UFC total no suma los conteos AGREGADOS', () => {
  it('control: la capa de datos declara dos agregados, no uno', () => {
    expect([...AGGREGATE_KEYS].sort()).toEqual(['bactTot', 'totales']);
  });

  it('«Bact. Totales» queda fuera del total, igual que «C. Totales»', () => {
    placa(DIA);
    expect(kpi('Σ UFC total')).toBe(es(ESPECIFICOS));
    // El valor inflado que daba antes (100 + 50 + 10.000) no debe aparecer.
    expect(kpi('Σ UFC total')).not.toBe(es(ESPECIFICOS + BACT_TOTALES));
  });

  it('coincide con su panel GEMELO del Supervisor, que ya excluía los dos', () => {
    // El acuerdo es la constante compartida, no una lista escrita a mano en cada vista.
    placa(DIA);
    const esperado = [...new Set(['amarillos', 'verdes', 'totales', 'bactTot'])]
      .filter((k) => !AGGREGATE_KEYS.has(k)).length;
    expect(esperado).toBe(2);                 // solo los dos específicos entran
    expect(kpi('Σ UFC total')).toBe(es(ESPECIFICOS));
  });

  it('los agregados SIGUEN mostrándose como colonias y en la leyenda', () => {
    placa(DIA);
    // Excluirlos del SUMATORIO no es ocultarlos: siguen listados con su UFC.
    const txt = root.querySelector('.mic-petri-side').textContent;
    expect(txt).toContain('Bact. Totales');
    expect(txt).toContain('C. Totales');
    expect(kpi('Patógenos')).toBe('4'); // los 4 con UFC, agregados incluidos
  });

  it('el «Dominante» tampoco es un agregado (no se rompe lo que ya estaba bien)', () => {
    placa(DIA);
    expect(kpi('Dominante')).toBe('C. Amarillas'); // el mayor de los ESPECÍFICOS
  });

  it('sin ningún patógeno específico con UFC el total es «—», no el agregado', () => {
    placa([M({ 'Fecha muestreo': '05/06/2026', 'Bact.Totales UFC': String(BACT_TOTALES) })]);
    expect(kpi('Σ UFC total')).toBe('—');
    expect(kpi('Patógenos')).toBe('1'); // la colonia sigue dibujándose
  });
});
