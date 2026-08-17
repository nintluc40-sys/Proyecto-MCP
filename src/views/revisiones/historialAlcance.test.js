// @vitest-environment happy-dom
// Auditoría definitiva · Revisiones → KPI «🗂️ Historial» y la ventana que abre.
//
// El KPI contaba sobre `rows`, que ya viene filtrado por mes + corrida + módulo + siembra +
// fecha global; la ventana partía de `store.globalData` y no aplicaba NI el mes NI la fecha.
// Medido sobre la hoja real (719 filas, todas con comentario matutino): en el mes por
// defecto —el más reciente— el KPI decía 1 y la ventana abría 719; en junio/julio/agosto,
// 188/250/278 frente a 719. Con el filtro de módulo puesto, 1 frente a 719.
//
// El lado correcto ya estaba escrito en el modal GEMELO «Historial de Asistencia Técnica»
// del Supervisor (supervisor/module.js): arma `atRows` UNA vez, y de ese mismo array salen
// tanto el número del botón como la lista, así que no pueden discrepar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { revisionesView } from './index.js';
import { monthIndexOfCorrida } from '../../core/prodCalendar.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', Supervisor: 'Ana', ...o });

// DOS meses de producción distintos, ambos con comentarios, y dentro del mes reciente dos
// módulos. Sin el segundo mes el fixture no distinguiría nada: la ventana sin filtrar y la
// filtrada devolverían lo mismo.
const C_VIEJA = '574';   // junio
const C_RECIENTE = '584'; // julio
const synth = () => [
  R({ Corrida: C_VIEJA, 'Módulo': 'Módulo 1', Fecha: '02/06/2026', Siembra: '1', 'Comentario (matutino)': 'comentario de JUNIO uno' }),
  R({ Corrida: C_VIEJA, 'Módulo': 'Módulo 1', Fecha: '03/06/2026', Siembra: '1', 'Comentario (matutino)': 'comentario de JUNIO dos' }),
  R({ Corrida: C_VIEJA, 'Módulo': 'Módulo 2', Fecha: '04/06/2026', Siembra: '1', 'Comentario (matutino)': 'comentario de JUNIO tres' }),
  R({ Corrida: C_RECIENTE, 'Módulo': 'Módulo 1', Fecha: '02/07/2026', Siembra: '1', 'Comentario (matutino)': 'comentario de JULIO uno' }),
  R({ Corrida: C_RECIENTE, 'Módulo': 'Módulo 2', Fecha: '03/07/2026', Siembra: '1', 'Comentario (matutino)': 'comentario de JULIO dos' }),
];

let root, errSpy;
beforeEach(() => {
  store.globalData = synth();
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  // `vState` de la vista es de módulo y PERSISTE entre pruebas (es su diseño: sobrevive a
  // los re-render por filtro). Si una prueba anterior dejó un módulo elegido, la siguiente
  // arrancaría ya filtrada. Se limpia por la propia UI, que es la única vía pública.
  revisionesView(root);
  ['corrida', 'mod', 'siembra'].forEach((dim) => {
    const sel = root.querySelector(`[data-rvfilter="${dim}"]`);
    if (sel && sel.value) { sel.value = ''; sel.dispatchEvent(new window.Event('change', { bubbles: true })); }
  });
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

/** Número que muestra el KPI «Historial» de la cabecera. */
const kpiHistorial = () => {
  const btn = root.querySelector('[data-hist-open]');
  return btn ? btn.querySelector('.rv-kpi-value').textContent.trim() : null;
};
/** Nº de comentarios que declara la ventana ("N comentario(s)"). */
const ventanaN = () => {
  const m = document.getElementById('rv-hist-content').textContent.match(/(\d+)\s+comentario\(s\)/);
  return m ? m[1] : null;
};
const cuerpoVentana = () => document.getElementById('rv-hist-content').textContent;
const opciones = (dim) => [...document.querySelector(`[data-hist-sel="${dim}"]`).options].map((o) => o.value);
const abrir = () => { revisionesView(root); click(root.querySelector('[data-hist-open]')); };
const elegirModulo = (v) => {
  const sel = root.querySelector('[data-rvfilter="mod"]');
  sel.value = v;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
};

describe('Historial · el KPI y su ventana cuentan lo MISMO', () => {
  it('control: el fixture tiene dos meses de producción distintos', () => {
    // Sin esto, el resto de la suite podría pasar con un fixture degenerado.
    expect(monthIndexOfCorrida(+C_VIEJA)).not.toBe(monthIndexOfCorrida(+C_RECIENTE));
  });

  it('la ventana lista solo el mes activo, no la hoja entera', () => {
    abrir();
    expect(kpiHistorial()).toBe('2');       // los 2 de julio (mes por defecto = el reciente)
    expect(ventanaN()).toBe('2');
    expect(cuerpoVentana()).toContain('comentario de JULIO uno');
    expect(cuerpoVentana()).not.toContain('comentario de JUNIO uno');
  });

  it('el número del KPI y el de la ventana coinciden también con un módulo filtrado', () => {
    revisionesView(root);
    elegirModulo('Módulo 1');
    click(root.querySelector('[data-hist-open]'));
    expect(kpiHistorial()).toBe('1');
    expect(ventanaN()).toBe('1');
    expect(cuerpoVentana()).toContain('comentario de JULIO uno');
    expect(cuerpoVentana()).not.toContain('comentario de JULIO dos'); // es del Módulo 2
  });

  it('los desplegables de la ventana tampoco ofrecen lo que ya quedó fuera de alcance', () => {
    // Ofrecer la corrida de junio devolvería «Sin comentarios», que es justo el vacío que
    // la corrección anterior de esta ventana vino a eliminar.
    abrir();
    expect(opciones('corrida')).toContain(C_RECIENTE);
    expect(opciones('corrida')).not.toContain(C_VIEJA);
  });

  it('no se pasa de corrección: dentro del alcance la cascada sigue afinando', () => {
    abrir();
    expect(opciones('mod')).toEqual(expect.arrayContaining(['', 'Módulo 1', 'Módulo 2']));
    const sel = document.querySelector('[data-hist-sel="mod"]');
    sel.value = 'Módulo 2';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(ventanaN()).toBe('1');
    expect(cuerpoVentana()).toContain('comentario de JULIO dos');
  });
});
