// @vitest-environment happy-dom
// Auditoría de cierre · Larvicultura. `buildPopData` indexa por NOMBRE de tanque, así que
// sin corrida elegida el «TQ1» de dos corridas del mismo módulo se funde en UNA sola serie.
// El gráfico de población, sus pastillas y sus KPIs ya exigían corrida por ese motivo —el
// propio aviso lo explica—, pero la franja-semáforo «Población» se pintaba igualmente.
// Medido: dos corridas que perdieron 20 % y 25 % daban una franja VERDE de «10,0 % ·
// 1 tanque(s)», que no representa a ninguna de las dos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { larviculturaView } from './index.js';
import { buildPopData, popStats } from './extra.js';
import { popSemaforo } from './status.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const noop = () => {};
const fakeCtx = new Proxy({}, { get: () => noop, set: () => true });
if (typeof globalThis.HTMLCanvasElement !== 'undefined') globalThis.HTMLCanvasElement.prototype.getContext = () => fakeCtx;

const L = (cor, tq, fecha, pob, est) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: cor, Tanque: tq,
  Fecha: fecha, 'Estadío': est, 'Población': String(pob), Supervivencia: '90',
});
// Dos corridas del MISMO módulo con el MISMO nombre de tanque.
// C573 pierde 20 % (1,0 M → 800 k) · C574 pierde 25 % (1,2 M → 900 k).
const dosCorridas = () => [
  L('573', 'TQ1', '01/06/2026', 1000000, 'N5'), L('573', 'TQ1', '20/06/2026', 800000, 'PL2'),
  L('574', 'TQ1', '01/07/2026', 1200000, 'N5'), L('574', 'TQ1', '20/07/2026', 900000, 'PL2'),
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
// El marcado es `<span class="lq-sem-status">🟢 Población: <b>Óptimo</b></span>`, así que
// hay que buscar por subcadena: una igualdad exacta con 'Población' NO casa nunca y dejaría
// pasar la prueba en vacío.
const franjaPoblacion = () => [...root.querySelectorAll('.lq-sem-status')]
  .some((n) => n.textContent.includes('Población:'));

beforeEach(() => {
  store.globalData = dosCorridas();
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('Larvicultura · la franja de Población exige corrida', () => {
  it('control: fundir dos corridas da una pérdida que no es la de ninguna', () => {
    const s = popStats(buildPopData(dosCorridas()));
    expect(s.validTanks).toBe(1);          // los dos TQ1 se funden
    expect(s.pctLoss).toBe('10.0%');       // ni 20 % ni 25 %
    expect(popSemaforo(s).level).toBe('verde');
  });

  it('con módulo pero SIN corrida, la franja no se pinta', () => {
    larviculturaView(root);
    setSel('modulo', 'M01');
    expect(root.textContent).toContain('Elige una');   // el aviso de corrida sí está
    // Control del selector: OTRAS franjas sí están, así que un `false` aquí significa que
    // falta la de Población, no que el selector no encuentre ninguna franja.
    expect(root.querySelectorAll('.lq-sem-status').length).toBeGreaterThan(0);
    expect(franjaPoblacion()).toBe(false);
  });

  it('al elegir corrida, la franja aparece y ya es fiable', () => {
    larviculturaView(root);
    setSel('modulo', 'M01');
    setSel('corrida', '573');
    expect(franjaPoblacion()).toBe(true);
  });
});
