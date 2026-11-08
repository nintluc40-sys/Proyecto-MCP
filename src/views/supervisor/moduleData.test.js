// @vitest-environment happy-dom
// Regresión de la capa de datos de la subvista Módulo:
//   · memo por identidad de store.globalData (no recalcular en cada render)
//   · `cwSamples` NO debe quedar reordenado al pintar la vista Tabla
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });

// Módulo M01 / corrida 573 con datos de Larvicultura, Biomol, Microbiología y Calidad de Agua.
function synth() {
  const rows = [];
  ['TQ1', 'TQ2'].forEach((tq, ti) => {
    ['01/06/2026', '05/06/2026', '10/06/2026'].forEach((f, i) => {
      rows.push(L({
        'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: f, Lote: 'AB',
        'Población': String(1000 - i * 100 - ti * 50), 'Estadío': ['N5', 'Z3', 'PL5'][i],
        Salinidad: '30', 'Estrés': '3', 'Intestino_Lleno': '90', 'Lípidos': '95',
      }));
    });
  });
  rows.push({
    _SheetOrigin: 'Biomol', Fecha: '05/06/2026', 'Código': 'BM1', Corrida: '573',
    Lugar: 'Módulo 1', Tanque: 'TQ1', 'Estadío': 'PL2',
    IHHNV: 'Negativo', WSSV: 'Positivo', 'AHPND/EMS': 'Negativo',
  });
  // Biomol de OTRO módulo: no debe entrar (y con el filtro previo ni se normaliza).
  rows.push({
    _SheetOrigin: 'Biomol', Fecha: '05/06/2026', 'Código': 'BM9', Corrida: '573',
    Lugar: 'Módulo 8', Tanque: 'TQ1', 'Estadío': 'PL2', IHHNV: 'Positivo',
  });
  rows.push({
    _SheetOrigin: 'Microbiología', 'Fecha muestreo': '05/06/2026', Corrida: '573',
    'Módulo/Sala': '1', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal',
    'TQ/N°': '1', 'Estadío': 'PL2', 'V.Totales UFC': '5000', 'V.Amarillos UFC': '1200',
  });
  // DOS muestras de Calidad de Agua en la MISMA fecha: el empate es lo que hace visible
  // la dependencia de orden de "última medición por parámetro".
  ['1', '2'].forEach((tq, i) => {
    rows.push({
      _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '07/06/2026', Corrida: '573',
      Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Tipo de muestra': 'Agua',
      'Módulo': '1', 'TQ/N°': tq, 'Estadío': 'PL5',
      pH: String(8.0 + i * 0.4), 'S‰': '32', Alcalinidad: String(130 - i * 15), Nitrito: '0.10',
    });
  });
  return rows;
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

function openModule() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  const card = root.querySelector('[data-nav="module"]');
  if (card) card.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return root;
}

describe('subvista Módulo · memo de los conjuntos por módulo+corrida', () => {
  // Cuenta los accesos a store.globalData durante un viaje ejecutiva → módulo.
  function contarViaje(root) {
    const real = store.globalData;
    let scans = 0;
    Object.defineProperty(store, 'globalData', { configurable: true, get() { scans++; return real; } });
    root.querySelector('[data-nav="modules"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    root.querySelector('[data-nav="module"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    delete store.globalData;
    store.globalData = real;
    return scans;
  }

  it('el mismo recorrido cuesta MENOS accesos al store con el memo caliente que en frío', () => {
    const root = openModule();
    expect(root.querySelector('.sv-banner')).toBeTruthy();

    const enCaliente = contarViaje(root);          // memo vigente
    store.globalData = synth();                     // array NUEVO ⇒ memo invalidado
    const enFrio = contarViaje(root);

    expect(enCaliente).toBeLessThan(enFrio);
  });

  it('un array de datos NUEVO invalida el memo', () => {
    openModule();
    const antes = store.globalData;
    store.globalData = synth(); // otra referencia, mismo contenido
    expect(store.globalData).not.toBe(antes);
    const root = openModule();
    // Si el memo no invalidara, el módulo se pintaría con filas del array viejo.
    expect(root.querySelector('.sv-banner')).toBeTruthy();
    expect(root.textContent).toContain('M01');
  });
});

describe('subvista Módulo · Biomol filtra por Lugar antes de normalizar', () => {
  it('solo entran las muestras del módulo abierto', () => {
    const root = openModule();
    const btn = root.querySelector('[data-biomol-open]');
    expect(btn).toBeTruthy();
    // 1 muestra (Módulo 1); la de "Módulo 8" queda fuera.
    expect(btn.textContent).toContain('(1)');
  });
});

describe('subvista Módulo · el modal de Calidad de Agua no se contamina entre pestañas', () => {
  it('abrir la vista Tabla no reordena el array compartido de muestras', () => {
    const root = openModule();
    const open = root.querySelector('[data-cw-open]');
    expect(open).toBeTruthy();
    open.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    const modal = root.querySelector('#svCwModal') || root.querySelector('[data-cwmodal]');
    expect(modal).toBeTruthy();
    const clic = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    /* B10 (2026-11-08) · antes buscaba las pestañas por `[data-cwview]`, que no existe: no visitaba ninguna y la prueba
       pasaba sin comprobar nada. Son `[data-cw-mode]`. Y el diagnóstico (WQI) no sirve de testigo: las dos muestras de
       la misma fecha dan el mismo WQI. Lo que el orden cambia es «el último valor de cada parámetro» con el empate de la
       fecha, que enseñan las pastillas de 📈 Tendencias (medido con la Tabla reordenando el array: pH 8,4 ↔ 8). */
    const tabs = [...modal.querySelectorAll('[data-cw-mode]')];
    expect(tabs.map((t) => t.dataset.cwMode)).toEqual(['tabla', 'fichas', 'matriz', 'tendencias']);
    const txt = (el) => el.textContent.replace(/\s+/g, ' ');
    const ver = (modo) => { clic(modal.querySelector(`[data-cw-mode="${modo}"]`)); return txt(modal.querySelector('#svCwBody')); };
    const wqiAntes = modal.querySelector('.cw-gauge-v')?.textContent ?? null;
    expect(wqiAntes, 'sin diagnóstico no hay nada que comparar').toMatch(/^\d/);
    const antes = { tendencias: ver('tendencias'), matriz: ver('matriz'), fichas: ver('fichas') };
    expect(antes.tendencias, 'las pastillas con el último valor de cada parámetro').toMatch(/pH \d/);

    ver('tabla');   // una sola vez: la Tabla ya se pintó al abrir, y dos visitas más podrían deshacer un reorden
    expect(modal.querySelectorAll('#svCwBody tbody tr').length, 'la Tabla se pintó').toBeGreaterThan(0);

    expect({ tendencias: ver('tendencias'), matriz: ver('matriz'), fichas: ver('fichas') }).toEqual(antes);
    // El diagnóstico se pinta al ABRIR: cerrar y volver a abrir lo hace leer el mismo array.
    clic(modal.querySelector('[data-cw-close]'));
    clic(root.querySelector('[data-cw-open]'));
    expect(modal.querySelector('.cw-gauge-v')?.textContent ?? null).toBe(wqiAntes);
  });
});
