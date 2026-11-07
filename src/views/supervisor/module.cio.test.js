// @vitest-environment happy-dom
/* ============================================================
   A24 (2026-11-07, usuario: «Sí, los tres») · CIO ENSEÑA SU MICROBIOLOGÍA Y SU CALIDAD DE AGUA

   El módulo se emparejaba con las filas de Microbiología y Calidad de Agua por su NÚMERO, y CIO no tiene: la vista del
   módulo no ofrecía ninguna de las dos aunque el libro tuviera filas suyas. Ahora, por número y, sin él, por letras,
   como Biomol. Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));
globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const MIC = (o) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': '2026-06-05', 'Departamento': 'Larvicultura', Formato: 'larv-muestra', ...o });
const CW = (o) => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '2026-06-05', 'Departamento': 'Larvicultura', Formato: 'larv', ...o });

function datos(mod) {
  const rows = [];
  ['01/06/2026', '05/06/2026'].forEach((f, i) => rows.push(L({
    'Módulo': mod, Corrida: '573', Tanque: 'TQ1', Fecha: f, Lote: 'AB', 'Población': String(1000000 - i * 50000), 'Estadío': 'Z3',
  })));
  rows.push(MIC({ 'Módulo/Sala': mod, Corrida: '573', TQ: '1', 'Vibrio (UFC/ml)': '100' }));
  rows.push(CW({ 'Módulo': mod, Corrida: '573', TQ: '1', pH: '8.1' }));
  rows.push(MIC({ 'Módulo/Sala': 'M02', Corrida: '573', TQ: '1', 'Vibrio (UFC/ml)': '100' }));   // de otro módulo
  return rows;
}
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
function abrirModulo(mod) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  const volver = root.querySelector('[data-nav="modules"]');   // la vista recuerda el módulo de la prueba anterior
  if (volver) click(volver);
  const card = root.querySelector(`[data-nav="module"][data-mod="${mod}"]`);
  if (card) click(card);
  return root;
}

let errSpy;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('A24 · CIO en la vista del módulo', () => {
  it('🔴 ofrece su Microbiología y su Calidad de Agua (antes, ninguna)', () => {
    store.globalData = datos('CIO');
    const root = abrirModulo('CIO');
    expect(root.querySelector('[data-micro-open]')?.textContent).toContain('Microbiología (1)');
    expect(root.querySelector('[data-cw-open]')?.textContent).toContain('Calidad de Agua (1)');
  });

  it('un módulo con número sigue emparejando por número, sin las filas de otro', () => {
    store.globalData = datos('M01');
    const root = abrirModulo('M01');
    expect(root.querySelector('[data-micro-open]')?.textContent).toContain('Microbiología (1)');
  });

  /* 2.ª revisión de la B (07-11, usuario: «En la regla común») · con un número en un solo lado se comparaba por letras:
     una fila con módulo «M» a secas entraba en TODOS los módulos numerados. */
  it('🔴 una fila con módulo «M» a secas no entra en M01 (antes, en todos los numerados)', () => {
    store.globalData = [...datos('M01'),
      MIC({ 'Módulo/Sala': 'M', Corrida: '573', TQ: '1', 'Vibrio (UFC/ml)': '100' }),
      CW({ 'Módulo': 'M', Corrida: '573', TQ: '1', pH: '8.0' })];
    const root = abrirModulo('M01');
    expect(root.querySelector('[data-micro-open]')?.textContent).toContain('Microbiología (1)');
    expect(root.querySelector('[data-cw-open]')?.textContent).toContain('Calidad de Agua (1)');
  });
});
