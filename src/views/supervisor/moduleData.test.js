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

    // Diagnóstico ANTES de visitar Tabla.
    const wqiAntes = modal.querySelector('.cw-gauge-v')?.textContent ?? null;

    // Visita todas las vistas disponibles (incluida Tabla) y vuelve.
    const tabs = [...modal.querySelectorAll('[data-cwview]')];
    tabs.forEach((t) => t.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })));
    if (tabs.length) tabs[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    const wqiDespues = modal.querySelector('.cw-gauge-v')?.textContent ?? null;
    expect(wqiDespues).toBe(wqiAntes); // el diagnóstico no cambia por haber abierto Tabla
  });
});
