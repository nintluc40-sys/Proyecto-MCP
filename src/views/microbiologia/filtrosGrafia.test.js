// @vitest-environment happy-dom
// Auditoría de cierre · Microbiología · filtros sobre DATOS EN BRUTO.
// Las columnas de contexto las teclea una persona, así que la misma realidad llega con
// grafías distintas. `getField` recortaba los extremos pero nada plegaba mayúsculas,
// tildes ni espacios internos. Medido antes de corregir, con 5 filas del MISMO
// departamento real (4 grafías + 1 errata):
//   Opciones Departamento: "Larvicultura" "larvicultura" "LARVICULTURA" "Larvicutura"
//   Sin filtrar          → 5 muestras
//   Elijo «Larvicultura» → 2 muestras     ← 3 de 5 desaparecían sin aviso
// Y en Calidad de Agua era peor, porque `calCtx` no aplicaba las normalizaciones que
// `rowContext` sí aplica:
//   rowContext (Bacteriología): modulo="1"   tq="3"     ← intStr
//   calCtx     (Calidad Agua) : modulo="1.0" tq="3.0"   ← la celda cruda del Sheet
//   Tipo de muestra: "agua" "Agua" "AGUA"  (en Bacteriología era una sola opción)
// El tanque "3.0" era un NODO DISTINTO de "3" en el árbol Módulo→Tanque, con su propio WQI.
// Regla adoptada: agrupar solo lo TIPOGRÁFICO y mostrar la grafía más frecuente. Una
// errata de verdad («Larvicutura») es otra palabra: sigue apareciendo aparte.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';
import { filterKey, groupValues, rowContext } from './data.js';
import { calCtx } from './calagua.data.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': '05/06/2026', Corrida: '573', 'V.Totales UFC': '1000', ...o });
const A = (o) => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573', pH: '8.0', ...o });

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

const opciones = (sel) => {
  const el = root.querySelector(sel);
  return el ? [...el.options].slice(1).map((o) => o.value) : null;
};
/** Nº de muestras del KPI «🧪 Muestras» de la barra de Bacteriología. */
const nMuestras = () => Number((root.querySelector('.mic-kpis')?.textContent || '').match(/Muestras\s*([\d.,]+)/)?.[1]);

function montar(rows, sub) {
  store.globalData = rows;
  microbiologiaView(root);
  const b = root.querySelector(`[data-mic-sub="${sub}"]`);
  if (b && !b.classList.contains('is-active')) b.click();
}
function elegir(sel, valor) {
  const el = root.querySelector(sel);
  el.value = valor;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('filterKey / groupValues · solo pliegan lo tipográfico', () => {
  it('plega mayúsculas, tildes, espacios internos y el punto final', () => {
    const k = filterKey('Larvicultura');
    ['larvicultura', 'LARVICULTURA', '  Larvicultura  ', 'Larvicultura.', 'Larvicultúra'].forEach((v) => {
      expect(filterKey(v), v).toBe(k);
    });
    expect(filterKey('Reservorio  1')).toBe(filterKey('reservorio 1'));
  });

  it('NO plega palabras distintas: una errata sigue siendo otra cosa', () => {
    expect(filterKey('Larvicutura')).not.toBe(filterKey('Larvicultura'));
    expect(filterKey('Reservorio 1')).not.toBe(filterKey('Reservorio 2'));
    expect(filterKey('Maduración')).not.toBe(filterKey('Larvicultura'));
  });

  it('elige como etiqueta la grafía MÁS FRECUENTE', () => {
    const g = groupValues(['larvicultura', 'Larvicultura', 'Larvicultura', 'LARVICULTURA']);
    expect(g).toHaveLength(1);
    expect(g[0].value).toBe('Larvicultura');
    expect(g[0].variants).toHaveLength(3);
  });

  it('descarta los vacíos y no inventa grupos', () => {
    expect(groupValues(['', null, undefined, '   '])).toEqual([]);
  });
});

describe('Bacteriología · el filtro ya no pierde filas por la grafía', () => {
  const FILAS = [
    M({ Departamento: 'Larvicultura', Formato: 'Larvicultura · Muestra', Muestras: 'Reservorio 1', Etapa: 'Cosecha' }),
    M({ Departamento: 'larvicultura', Formato: 'Larvicultura · Muestra', Muestras: 'reservorio 1', Etapa: 'cosecha' }),
    M({ Departamento: 'LARVICULTURA', Formato: 'Larvicultura · muestra', Muestras: 'Reservorio  1', Etapa: 'Cosecha.' }),
    M({ Departamento: '  Larvicultura  ', Formato: 'Larvicultura · Muestra', Muestras: ' Reservorio 1 ', Etapa: 'Cosecha' }),
    M({ Departamento: 'Larvicutura', Formato: 'Larvicultura · Muestra', Muestras: 'Reservorio 2', Etapa: 'Siembra' }),
  ];

  it('ofrece UNA opción por realidad, y la errata aparte', () => {
    montar(FILAS, 'bacteriologia');
    expect(opciones('[data-micfilter="depto"]')).toEqual(['Larvicultura', 'Larvicutura']);
    expect(opciones('[data-micdim="muestras"]')).toEqual(['Reservorio 1', 'Reservorio 2']);
    expect(opciones('[data-micdim="etapa"]')).toEqual(['Cosecha', 'Siembra']);
  });

  it('elegir el departamento captura sus 4 grafías (antes solo 2 de 5)', () => {
    montar(FILAS, 'bacteriologia');
    expect(nMuestras()).toBe(5);
    elegir('[data-micfilter="depto"]', 'Larvicultura');
    expect(nMuestras()).toBe(4);
  });

  it('no se pasa de corrección: la errata sigue siendo seleccionable y separa su fila', () => {
    montar(FILAS, 'bacteriologia');
    elegir('[data-micfilter="depto"]', 'Larvicutura');
    expect(nMuestras()).toBe(1);
  });

  it('no se pasa de corrección: sigue filtrando de verdad, no muestra todo', () => {
    montar([
      M({ Departamento: 'Larvicultura', Formato: 'Larvicultura · Muestra' }),
      M({ Departamento: 'Maduración', Formato: 'Maduración · Principal' }),
      M({ Departamento: 'Algas', Formato: 'Algas Mensual' }),
    ], 'bacteriologia');
    expect(nMuestras()).toBe(3);
    elegir('[data-micfilter="depto"]', 'Maduración');
    expect(nMuestras()).toBe(1);
  });
});

describe('Calidad de Agua · calCtx normaliza igual que rowContext', () => {
  const CELDA = { 'Fecha muestreo': '05/06/2026', 'Módulo': '1.0', 'TQ/N°': '3.0', 'Módulo/Sala': '1.0', 'Tipo de muestra': 'agua' };

  it('aplica intStr a Módulo y TQ, como la capa de Bacteriología', () => {
    expect(calCtx(CELDA).modulo).toBe(rowContext(CELDA).modulo);
    expect(calCtx(CELDA).tq).toBe(rowContext(CELDA).tq);
    expect(calCtx(CELDA).tq).toBe('3');
  });

  it('aplica normTipoMuestra, como la capa de Bacteriología', () => {
    expect(calCtx(CELDA).tipoMuestra).toBe('Agua');
    expect(calCtx({ 'Tipo de muestra': 'AGUA' }).tipoMuestra).toBe('Agua');
  });

  it('«3» y «3.0» dejan de ser dos tanques y dos opciones de filtro', () => {
    montar([
      A({ 'Módulo': '1', 'TQ/N°': '3', Componente: 'Filtro', 'Tipo de muestra': 'Agua' }),
      A({ 'Módulo': '1.0', 'TQ/N°': '3.0', Componente: 'filtro', 'Tipo de muestra': 'agua' }),
      A({ 'Módulo': '1', 'TQ/N°': '3', Componente: 'FILTRO', 'Tipo de muestra': 'AGUA' }),
      A({ 'Módulo': '2', 'TQ/N°': '7', Componente: 'Bomba', 'Tipo de muestra': 'Animal' }),
    ], 'calidad');
    expect(opciones('[data-caldim="tq"]')).toEqual(['3', '7']);
    expect(opciones('[data-caldim="componente"]')).toEqual(['Bomba', 'Filtro']);
    expect(opciones('[data-caldim="tipoMuestra"]')).toEqual(['Agua', 'Animal']);
  });
});
