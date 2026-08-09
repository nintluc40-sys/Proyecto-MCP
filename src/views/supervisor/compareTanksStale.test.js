// @vitest-environment happy-dom
// Auditoría de cierre · «Comparar Tanques»: la configuración debe sanearse contra los datos
// ACTUALES. `renderConfig` revalidaba el módulo, el lote, la corrida (modos Lote/Corrida) y
// el módulo masivo, pero NO la corrida ni el tanque del modo Tanque: si un refresco se
// llevaba por delante la corrida elegida, el desplegable quedaba vacío en pantalla mientras
// `ctState` conservaba el valor viejo y «Generar» comparaba algo que ya no se mostraba.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { compareTanksButtonHTML, compareTanksModalHTML, setupCompareTanks } from './compareTanks.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const con570 = () => [
  L({ 'Módulo': 'M01', Corrida: '570', Tanque: 'TQ1', Fecha: '01/03/2026', Supervivencia: '90' }),
  L({ 'Módulo': 'M01', Corrida: '570', Tanque: 'TQ1', Fecha: '02/03/2026', Supervivencia: '80' }),
  L({ 'Módulo': 'M01', Corrida: '571', Tanque: 'TQ2', Fecha: '10/05/2026', Supervivencia: '95' }),
  L({ 'Módulo': 'M01', Corrida: '571', Tanque: 'TQ2', Fecha: '11/05/2026', Supervivencia: '88' }),
];
const sin570 = () => con570().filter((r) => r.Corrida !== '570');

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = compareTanksButtonHTML() + compareTanksModalHTML();
  setupCompareTanks(root);
  root.querySelector('[data-ctt-open]').click();
  return root;
}
// happy-dom no refleja `.value` de forma fiable sobre un <select> recién parseado: se
// selecciona la OPCIÓN concreta y se marca su atributo, que es lo que lee `e.target.value`.
function pick(root, attr, val) {
  const s = root.querySelector(`[data-ct="${attr}"]`);
  const opt = [...s.options].find((o) => o.value === val);
  if (!opt) throw new Error(`sin opción ${val} en ${attr}: ${[...s.options].map((o) => o.value)}`);
  [...s.options].forEach((o) => { o.selected = o === opt; o.removeAttribute('selected'); });
  opt.setAttribute('selected', 'selected');
  s.dispatchEvent(new Event('change'));
}
const optsOf = (root, attr) => [...root.querySelector(`[data-ct="${attr}"]`).options].map((o) => o.value);
const generar = (root) => { root.querySelector('[data-ct-generate]').click(); return root.querySelector('#cttOutput').textContent; };

beforeEach(() => { document.body.innerHTML = ''; });

describe('Comparar Tanques · saneo de la selección tras un refresco', () => {
  it('una corrida que desaparece deja de compararse en silencio', () => {
    store.globalData = con570();
    let root = mount();
    pick(root, 'A.mod', 'M01'); pick(root, 'A.cor', '570'); pick(root, 'A.tq', 'TQ1');
    pick(root, 'B.mod', 'M01'); pick(root, 'B.cor', '571'); pick(root, 'B.tq', 'TQ2');
    // Precondición REAL de la prueba: A quedó anclada a la corrida 570 concreta. Se
    // comprueba por los tanques ofrecidos (los de 570), no por `.value` del <select>.
    expect(optsOf(root, 'A.tq')).toContain('TQ1');
    expect(generar(root)).toContain('Evolución diaria'); // con datos, compara

    // Refresco: la corrida 570 ya no está. El módulo M01 sigue existiendo.
    store.globalData = sin570();
    document.body.innerHTML = '';
    root = mount();

    // El desplegable ya no ofrece 570 …
    expect(optsOf(root, 'A.cor')).not.toContain('570');
    // … y el estado tampoco la conserva: sin selección válida, la app la PIDE en vez de
    // comparar una corrida fantasma que el formulario no muestra.
    expect(generar(root)).toContain('Selecciona');
  });

  it('«— Todos —» sobrevive al refresco (no se sanea de más)', () => {
    store.globalData = con570();
    let root = mount();
    pick(root, 'A.mod', 'M01'); pick(root, 'A.cor', '*');
    pick(root, 'B.mod', 'M01'); pick(root, 'B.cor', '*');
    store.globalData = sin570();
    document.body.innerHTML = '';
    root = mount();
    // '*' no nombra ninguna corrida concreta: sigue siendo una selección válida.
    expect(generar(root)).toContain('Evolución diaria');
  });
});
