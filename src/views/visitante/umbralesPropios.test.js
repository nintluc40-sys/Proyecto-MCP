// @vitest-environment happy-dom
// H-003 (auditoría de Microbiología del 2026-09-25, aprobado 2026-10-03) · Visitante usa las MISMAS funciones de
// umbrales y rangos de laboratorio que Microbiología, que viven en el navegador: si este equipo tiene otros, su bloque
// «🧫 Laboratorio de agua y sanidad» lo dice (sólo el aviso: desde Visitante no se cambian).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => { _ls.set(k, String(v)); },
  removeItem: (k) => { _ls.delete(k); },
  clear: () => { _ls.clear(); },
};

const { store } = await import('../../core/store.js');
const { visitanteView } = await import('./index.js');
const { CAL_RANGES_KEY } = await import('../microbiologia/calagua.data.js');

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const datos = () => [
  L({ 'Módulo': 'M01', Corrida: '544', Tanque: 'TQ1', Fecha: '01/06/2026', 'Población': '1000000' }),
  L({ 'Módulo': 'M01', Corrida: '544', Tanque: 'TQ1', Fecha: '11/06/2026', 'Población': '800000' }),
  { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '10/06/2026', Corrida: '544', 'pH': '8.0' },
];
const AVISO = 'Este equipo usa umbrales de laboratorio propios';

let root;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  _ls.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); _ls.clear(); });

describe('Visitante · aviso de umbrales de laboratorio propios del equipo', () => {
  it('con los de base, no hay aviso (control: el bloque de laboratorio sí está)', () => {
    store.globalData = datos();
    visitanteView(root);
    expect(root.textContent).toContain('Laboratorio de agua y sanidad');
    expect(root.textContent).not.toContain(AVISO);
  });

  it('con un rango de agua cambiado en este equipo, lo dice', () => {
    _ls.set(CAL_RANGES_KEY, JSON.stringify({ ph: { min: 9, max: 10 } }));
    store.globalData = datos();
    visitanteView(root);
    expect(root.textContent).toContain(AVISO);
  });
});
