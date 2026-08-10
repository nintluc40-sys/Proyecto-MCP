// @vitest-environment happy-dom
// Auditoría de cierre · Revisiones → mosaico de Calidad. El nivel DOMINANTE de cada tile se
// resolvía con `counts.indexOf(Math.max(...counts))`, e `indexOf` devuelve el PRIMER índice
// con el máximo: ante un empate ganaba siempre el índice 0, que es «Bueno». Con 2 revisiones
// «Alta» y 2 «Baja», el tile anunciaba 🟢 Bueno con borde verde y ocultaba que la mitad
// estaba en Malo. Igual en el drill-down por módulo.
//
// El desempate pasa a ir al nivel PEOR de los empatados: en un panel de supervisión, un
// resumen no puede afirmar que las cosas están mejor de lo que una lectura empatada sostiene.
// Mismo criterio que OM vs Tex y Comparar Tanques, que ya se niegan a adjudicar empates.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { revisionesView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', Corrida: '544', 'Módulo': 'Módulo 1', Supervisor: 'Ana', ...o });

/** `act` = valores de la columna Actividad, uno por revisión. */
const conActividad = (...act) => act.map((a, i) => R({ Fecha: `0${i + 1}/06/2026`, Actividad: a }));

let root, errSpy;
beforeEach(() => {
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

/** Texto del nivel dominante del tile de una variable. */
function tileDom(label) {
  const tile = [...root.querySelectorAll('.rv-tile')].find((n) => n.dataset.drillqual === label);
  return tile ? tile.querySelector('.rv-tile-dom').textContent.trim() : null;
}

describe('Calidad · un empate no se adjudica al mejor nivel', () => {
  it('2 «Alta» y 2 «Baja» no es «Bueno»: manda el peor de los empatados', () => {
    store.globalData = conActividad('Alta', 'Alta', 'Baja', 'Baja');
    revisionesView(root);
    expect(tileDom('Actividad')).toContain('Malo');
    expect(tileDom('Actividad')).not.toContain('Bueno');
    expect(tileDom('Actividad')).toContain('50%'); // el porcentaje sigue siendo el real
  });

  it('empate entre Bueno y Medio se resuelve como Medio', () => {
    store.globalData = conActividad('Alta', 'Alta', 'Media', 'Media');
    revisionesView(root);
    expect(tileDom('Actividad')).toContain('Medio');
  });

  it('sin empate, gana la mayoría de siempre (no se pasa de corrección)', () => {
    store.globalData = conActividad('Alta', 'Alta', 'Alta', 'Baja');
    revisionesView(root);
    expect(tileDom('Actividad')).toContain('Bueno');
    expect(tileDom('Actividad')).toContain('75%');
  });

  it('una mayoría clara de Malo sigue saliendo Malo', () => {
    store.globalData = conActividad('Baja', 'Baja', 'Baja', 'Alta');
    revisionesView(root);
    expect(tileDom('Actividad')).toContain('Malo');
  });

  it('el drill-down por módulo aplica el mismo desempate', () => {
    store.globalData = conActividad('Alta', 'Alta', 'Baja', 'Baja');
    revisionesView(root);
    const tile = [...root.querySelectorAll('.rv-tile')].find((n) => n.dataset.drillqual === 'Actividad');
    click(tile);
    const txt = document.getElementById('rv-drill-content').textContent;
    expect(txt).toContain('🔴'); // el módulo empatado se marca con el peor nivel
    expect(txt).not.toContain('🟢');
  });
});
