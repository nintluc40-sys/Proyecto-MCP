// @vitest-environment happy-dom
// Auditoría de cierre · Larvicultura → modal «Historial de observaciones». Los desplegables
// en cascada (Corrida → Módulo → Tanque) se construían sobre TODAS las filas de
// Larvicultura, pero la lista solo muestra las que tienen Observaciones (`obsHistorial`).
// El desplegable ofrecía así combinaciones sin una sola observación: elegir una opción
// legítima devolvía «Sin observaciones para la combinación elegida».
//
// Tercera aparición del patrón: ya corregido en Revisiones (af2ab9f) y evitado desde el
// principio por el modal «Historial de Asistencia Técnica» del Supervisor.
//
// De paso, `obsHistorial` leía solo 3 variantes de la cabecera y se perdía «observación»
// (minúscula con tilde); ahora usa `OBS_KEYS` de core/fields.js, la lista canónica de 4.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { setSnapshot, openModal } from './modals.js';
import { obsHistorial } from './extra.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
// C573/M01/TQ1 tiene observación. C574/M09/TQ9 no tiene ninguna.
const rows = () => [
  L({ Corrida: '573', 'Módulo': 'M01', Tanque: 'TQ1', Fecha: '02/06/2026', Observaciones: 'Espuma alta' }),
  L({ Corrida: '573', 'Módulo': 'M01', Tanque: 'TQ1', Fecha: '03/06/2026', Observaciones: 'Recambio' }),
  L({ Corrida: '574', 'Módulo': 'M09', Tanque: 'TQ9', Fecha: '04/06/2026' }),
];

let body;
beforeEach(() => {
  store.globalData = rows();
  document.body.innerHTML = `<div class="lq-modal" id="lq-modal-hist"><div id="lq-modal-hist-body"></div></div>`;
  body = document.getElementById('lq-modal-hist-body');
  // Snapshot mínimo: el modal solo necesita `state` para alinear sus filtros.
  setSnapshot({ state: {}, d: { byCor: [], tanques: [] }, vars: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

const opciones = (dim) => [...body.querySelector(`[data-histf="${dim}"]`).options].map((o) => o.value);

describe('Larvicultura·Historial · los desplegables solo ofrecen lo que tiene observaciones', () => {
  it('una corrida sin ninguna observación no se ofrece', () => {
    openModal('lq-modal-hist');
    expect(opciones('corrida')).toContain('573');
    expect(opciones('corrida')).not.toContain('574');
  });

  it('un módulo sin ninguna observación tampoco', () => {
    openModal('lq-modal-hist');
    expect(opciones('modulo')).toContain('M01');
    expect(opciones('modulo')).not.toContain('M09');
  });

  it('ni el tanque', () => {
    openModal('lq-modal-hist');
    expect(opciones('tanque')).toContain('TQ1');
    expect(opciones('tanque')).not.toContain('TQ9');
  });

  it('no se pasa de corrección: las observaciones se listan completas', () => {
    openModal('lq-modal-hist');
    expect(body.textContent).toContain('2 observación(es)');
    expect(body.textContent).toContain('Espuma alta');
    expect(body.textContent).toContain('Recambio');
    expect(opciones('corrida')[0]).toBe(''); // la opción «Todas» permanece
  });

  it('reconoce la cabecera «observación» (minúscula con tilde)', () => {
    store.globalData = [L({ Corrida: '573', 'Módulo': 'M01', Tanque: 'TQ1', Fecha: '02/06/2026', 'observación': 'Malla suelta' })];
    expect(obsHistorial({}).length).toBe(1);
  });
});
