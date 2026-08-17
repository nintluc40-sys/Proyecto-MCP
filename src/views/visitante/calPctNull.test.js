// @vitest-environment happy-dom
// Auditoría definitiva · Visitante → bloque «🧫 Laboratorio de agua y sanidad».
//
// `calPct` es null cuando hay muestras de agua pero NINGUNA medición evaluable (todos sus
// parámetros salen `sin-rango`), y se interpolaba sin guarda: la tarjeta y el detalle
// imprimían el literal «null% en rango». En la MISMA línea el WQI sí llevaba su guarda, la
// tarjeta hermana de Microbiología usa `micPctTxt` (que resuelve null → «—»), y dos líneas
// más abajo el detalle ya declara «Sin parámetros con rango objetivo»: la rama estaba
// reconocida en un sitio y producía «null%» en el otro.
//
// Medido sobre la hoja real de Calidad de Agua (1.324 filas): 1.392 de 4.373 mediciones
// (32 %) salen `sin-rango`, y 90 filas no traen ninguna evaluable — p. ej. Formato «Algas»,
// cuyo único parámetro medido es cloro libre, que no tiene rango objetivo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { visitanteView } from './index.js';
import { calMeasured, loadCalRanges } from '../microbiologia/calagua.data.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

// Larvicultura mínima para que exista un mes con corridas (Visitante se ancla a ellas).
const L = (o) => ({ _SheetOrigin: 'Larvicultura', Corrida: '574', 'Módulo': 'M01', Tanque: 'TQ1', ...o });
// Muestra de agua cuyo ÚNICO parámetro medido no tiene rango objetivo (caso real: «Algas»).
const AGUA = {
  _SheetOrigin: 'Calidad de Agua', Corrida: '574', Formato: 'Algas',
  // La cabecera es EXACTA (`CAL_PARAMS`): con «Cloro libre» a secas no se mide nada y el
  // caso se dispararía por falta de mediciones, no por falta de rango — el test pasaría
  // por la razón equivocada. Lo fija la prueba de control de abajo.
  'Fecha muestreo': '10/06/2026', 'Cloro libre (mg/L)': '0.2',
};

let root, errSpy;
beforeEach(() => {
  const s0 = {};
  globalThis.localStorage = {
    getItem: (k) => (k in s0 ? s0[k] : null),
    setItem: (k, v) => { s0[k] = String(v); },
    removeItem: (k) => { delete s0[k]; },
  };
  store.globalData = [
    L({ Fecha: '01/06/2026', 'Población': '1000000' }),
    L({ Fecha: '20/06/2026', 'Población': '700000' }),
    AGUA,
  ];
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); delete globalThis.localStorage; });

describe('Visitante · Calidad del agua sin ningún parámetro evaluable', () => {
  it('control: el fixture SÍ produce mediciones, pero ninguna evaluable', () => {
    // Si el fixture no midiera nada, `calRows` seguiría contando y el caso se dispararía
    // igual, pero por otra vía: conviene dejar fijado que es el caso `sin-rango`.
    const ms = calMeasured(AGUA, loadCalRanges());
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.some((m) => m.estado === 'dentro' || m.estado === 'fuera')).toBe(false);
  });

  it('la TARJETA no imprime «null%»', () => {
    visitanteView(root);
    const txt = root.textContent;
    expect(txt).toContain('Calidad del agua');
    expect(txt).not.toContain('null%');
    expect(txt).toContain('— en rango');
  });

  it('el DETALLE tampoco imprime «null%»', () => {
    visitanteView(root);
    const card = [...root.querySelectorAll('[data-sum]')].find((c) => c.dataset.sum === 'labAgua');
    expect(card, 'la tarjeta de Calidad del agua debe existir').toBeTruthy();
    click(card);
    const body = document.getElementById('vtSumBody').textContent;
    expect(body).not.toContain('null%');
    expect(body).toContain('de parámetros en rango');
    // Y el mensaje que ya contemplaba este caso sigue saliendo.
    expect(body).toContain('Sin parámetros con rango objetivo');
  });

  it('no se pasa de corrección: con parámetros evaluables sigue saliendo el porcentaje', () => {
    store.globalData = [
      ...store.globalData.filter((r) => r._SheetOrigin === 'Larvicultura'),
      { _SheetOrigin: 'Calidad de Agua', Corrida: '574', Formato: 'Larvicultura · Agua', 'Fecha muestreo': '10/06/2026', pH: '8.0' },
    ];
    visitanteView(root);
    const txt = root.textContent;
    expect(txt).not.toContain('null%');
    expect(txt).toMatch(/\d+% en rango/);
  });
});
