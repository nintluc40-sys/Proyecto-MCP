// @vitest-environment happy-dom
// Auditoría de cierre · Larvicultura. El chip de edad de cultivo (DOC) se pintaba con solo
// elegir módulo, pero `cultivoInfo` mide el SPAN de fechas de `d.rows`, y sin corrida ese
// conjunto abarca todas las corridas del módulo en el mes visible.
// Medido con dos corridas de 20 y 6 días: el chip declaraba «📅 Día 30 · Estadío PL5 ·
// esperado PL23 · ⏪ Atrasado» — una edad que no pertenece a ninguna de las dos, y un
// veredicto de atraso dictado sobre ella.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { larviculturaView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const noop = () => {};
const fakeCtx = new Proxy({}, { get: () => noop, set: () => true });
if (typeof globalThis.HTMLCanvasElement !== 'undefined') globalThis.HTMLCanvasElement.prototype.getContext = () => fakeCtx;

const L = (cor, fecha, est) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: cor, Tanque: 'TQ1',
  Fecha: fecha, 'Estadío': est, 'Población': '900000', Supervivencia: '90', Deformidad: '3',
});
// DOS corridas del mismo módulo en el mismo mes interno: 20 días y 6 días.
const dosCorridas = () => [
  L('573', '01/06/2026', 'N5'), L('573', '20/06/2026', 'PL12'),
  L('574', '25/06/2026', 'N5'), L('574', '30/06/2026', 'PL5'),
];

let root, errSpy;
const setSel = (name, val) => {
  const s = root.querySelector(`[data-filter="${name}"]`);
  const opt = [...s.options].find((o) => o.value === val);
  if (!opt) throw new Error(`sin opción ${val} en ${name}: ${[...s.options].map((o) => o.value)}`);
  [...s.options].forEach((o) => { o.selected = o === opt; o.removeAttribute('selected'); });
  opt.setAttribute('selected', 'selected');
  s.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const chip = () => root.querySelector('.lq-doc-chip');
const chipTxt = () => { const n = chip(); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };

beforeEach(() => {
  store.globalData = dosCorridas();
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('Larvicultura · la edad de cultivo (DOC) exige corrida', () => {
  it('con módulo pero SIN corrida, el chip no se pinta', () => {
    larviculturaView(root);
    setSel('modulo', 'M01');
    // Control: el bloque Resumen SÍ está, así que la ausencia del chip no es que falte todo.
    expect(root.textContent).toContain('Resumen');
    expect(chip()).toBeNull();
  });

  it('al elegir corrida aparece, y con la edad de ESA corrida', () => {
    larviculturaView(root);
    setSel('modulo', 'M01');
    setSel('corrida', '573');
    expect(chip()).not.toBeNull();
    expect(chipTxt()).toContain('Día 20');    // 01/06 → 20/06, inclusivo
    expect(chipTxt()).not.toContain('Día 30'); // el span de las dos corridas juntas
  });

  it('la otra corrida da su propia edad, no la fundida', () => {
    larviculturaView(root);
    setSel('modulo', 'M01');
    setSel('corrida', '574');
    expect(chipTxt()).toContain('Día 6');     // 25/06 → 30/06
  });
});
