// @vitest-environment happy-dom
// Auditoría de cierre · Microbiología · Calidad de Agua · «Por ubicación» · ficha temporal.
// La tabla «Mediciones por fecha» resolvía cada celda con `d.pts.find(...)`, o sea la
// PRIMERA lectura de ese día, y ocultaba las demás sin decirlo. Un tanque puede tener
// varias lecturas el mismo día — el caso típico es un re-test tras un valor fuera de rango.
// Medido con pH 9,6 y re-test 8,0 el mismo día, más 8,1 al día siguiente:
//   Encabezado de la fila pH : 8.1 ▲                    ← ya reflejaba el re-test
//   Fila pH en la tabla      : ["9.6", "8.1"]           ← mostraba la lectura descartada
//   Severidad de las celdas  : ["critico", "optimo"]    ← y la pintaba crítico
// El sparkline de la misma fila sí dibujaba los tres puntos, así que la tabla contradecía
// a su propia cabecera. Ahora la celda muestra la ÚLTIMA lectura del día —que es lo que
// significa «medición» en el resto de la vista (`calLatestByParam`, `t.last`)— y declara
// las demás con «×n» y el detalle en el tooltip.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const A = (o) => ({ _SheetOrigin: 'Calidad de Agua', Corrida: '573', 'Módulo': '1', 'TQ/N°': '1', ...o });

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

/** Abre la ficha temporal del primer tanque y devuelve helpers de lectura. */
function abrirFicha(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  root.querySelector('[data-mic-sub="calidad"]').click();
  root.querySelector('[data-cal-ap="ubicacion"]').click();
  root.querySelector('[data-cal-ficha]').click();
  const tabla = root.querySelector('.cal-ft-table');
  const filaPH = [...(tabla ? tabla.querySelectorAll('tbody tr') : [])]
    .find((tr) => /pH/i.test(tr.querySelector('th')?.textContent || ''));
  return {
    cabeceraVal: [...root.querySelectorAll('.cal-ft-row')]
      .find((e) => /pH/i.test(e.textContent))?.querySelector('.cal-ft-val')?.textContent.trim(),
    celdas: filaPH ? [...filaPH.querySelectorAll('td')] : [],
  };
}

// pH objetivo 7,5–8,5. El 05 jun hay dos lecturas: una fuera y su re-test en rango.
const CON_RETEST = [
  A({ 'Fecha muestreo': '05/06/2026', pH: '9.6' }),
  A({ 'Fecha muestreo': '05/06/2026', pH: '8.0' }),
  A({ 'Fecha muestreo': '06/06/2026', pH: '8.1' }),
];

describe('Ficha temporal · varias lecturas el mismo día', () => {
  it('la celda del día muestra la ÚLTIMA lectura, no la primera', () => {
    const { celdas } = abrirFicha(CON_RETEST);
    expect(celdas[0].textContent).toContain('8');
    expect(celdas[0].textContent).not.toContain('9.6');
  });

  it('la celda deja de contradecir a la cabecera de su propia fila', () => {
    const { celdas } = abrirFicha(CON_RETEST);
    expect(celdas[0].className).toContain('cal-sev--optimo'); // antes: critico
  });

  it('declara que hubo más de una lectura, con el detalle en el tooltip', () => {
    const { celdas } = abrirFicha(CON_RETEST);
    expect(celdas[0].querySelector('.cal-ft-multi')?.textContent).toBe('×2');
    expect(celdas[0].getAttribute('title')).toBe('2 lecturas ese día: 9.6 → 8');
  });

  it('no se pasa de corrección: con UNA lectura por día no cambia nada', () => {
    const { celdas } = abrirFicha([
      A({ 'Fecha muestreo': '05/06/2026', pH: '9.6' }),
      A({ 'Fecha muestreo': '06/06/2026', pH: '8.1' }),
    ]);
    expect(celdas[0].textContent).toBe('9.6');
    expect(celdas[0].className).toContain('cal-sev--critico');
    expect(celdas[0].querySelector('.cal-ft-multi')).toBeNull();
    expect(celdas[0].getAttribute('title')).toBeNull();
  });

  it('no se pasa de corrección: los días sin medición siguen en «—»', () => {
    const { celdas } = abrirFicha([
      A({ 'Fecha muestreo': '05/06/2026', pH: '8.0' }),
      A({ 'Fecha muestreo': '06/06/2026', Alcalinidad: '130' }),
    ]);
    expect(celdas[1].textContent).toBe('—');
  });

  it('la cabecera de la fila sigue mostrando la última medición global', () => {
    expect(abrirFicha(CON_RETEST).cabeceraVal).toContain('8.1');
  });
});
