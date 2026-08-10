// @vitest-environment happy-dom
// Auditoría de cierre · Revisiones → ventana «Historial de comentarios». Los desplegables en
// cascada (Corrida → Módulo → Siembra) se construían sobre TODAS las revisiones, pero la
// lista solo muestra las que tienen comentario (`histRows` filtra por `hasComment`). El
// desplegable ofrecía así opciones sin un solo comentario: elegir una legítima devolvía
// «Sin comentarios para la combinación elegida».
// Mismo criterio que el modal «Historial de Asistencia Técnica» del Supervisor, que arma sus
// listas sobre filas ya filtradas por comentario.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { revisionesView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', Supervisor: 'Ana', ...o });

// C544/Módulo 1 tienen comentarios. C545 y «Módulo 9» NO tienen ninguno.
const synth = () => [
  R({ Corrida: '544', 'Módulo': 'Módulo 1', Fecha: '02/06/2026', Siembra: '1', 'Comentario (matutino)': 'Todo en orden' }),
  R({ Corrida: '544', 'Módulo': 'Módulo 1', Fecha: '03/06/2026', Siembra: '1', 'Comentario (vespertino)': 'Revisar aireación' }),
  R({ Corrida: '545', 'Módulo': 'Módulo 9', Fecha: '04/06/2026', Siembra: '2', Observaciones: 'Malla rota' }),
];

let root, errSpy;
beforeEach(() => {
  store.globalData = synth();
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

const abrirHist = () => { revisionesView(root); click(root.querySelector('[data-hist-open]')); };
const opciones = (dim) => [...document.querySelector(`[data-hist-sel="${dim}"]`).options].map((o) => o.value);
const lista = () => document.getElementById('rv-hist-list').textContent;

describe('Historial · los desplegables solo ofrecen lo que tiene comentarios', () => {
  it('una corrida sin ningún comentario no se ofrece', () => {
    abrirHist();
    expect(opciones('corrida')).toContain('544');
    expect(opciones('corrida')).not.toContain('545');
  });

  it('un módulo sin ningún comentario tampoco', () => {
    abrirHist();
    expect(opciones('mod')).toContain('Módulo 1');
    expect(opciones('mod')).not.toContain('Módulo 9');
  });

  it('la siembra de la revisión sin comentario tampoco', () => {
    abrirHist();
    expect(opciones('siembra')).toContain('1');
    expect(opciones('siembra')).not.toContain('2');
  });

  it('no se pasa de corrección: los comentarios siguen listándose completos', () => {
    abrirHist();
    expect(lista()).toContain('2 comentario(s)');
    expect(lista()).toContain('Todo en orden');
    expect(lista()).toContain('Revisar aireación');
  });

  it('siempre queda la opción vacía «Todas» para no filtrar', () => {
    abrirHist();
    expect(opciones('corrida')[0]).toBe('');
  });
});
