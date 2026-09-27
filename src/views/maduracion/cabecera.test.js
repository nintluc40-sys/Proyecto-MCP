// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · el emoji de la vista (2026-09-27, usuario)

   La cabecera y el aviso «sin datos» decían 🥚 mientras el botón que abre la vista dice «🧬 Microchips». Decisión del
   usuario: 🧬 también en la vista (una sola identidad). El 🥚 de Maduración en el menú y el de la sub-vista
   «Reproducción» del tablero se quedan. Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { maduracionView } from './index.js';

const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
let root;
const pintar = (filas) => { store.globalData = filas; root = document.createElement('div'); document.body.appendChild(root); maduracionView(root); };
afterEach(() => root.remove());

describe('Microchips · el emoji de la vista', () => {
  it('🔴 la cabecera dice 🧬, como el botón «🧬 Microchips»', () => {
    pintar([O('Maduración MATRIZ')({ 'Trovan ID': 'A', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' })]);
    expect(root.querySelector('.mc-head-ic').textContent).toBe('🧬');
    expect(root.innerHTML.includes('🥚')).toBe(false);
  });

  it('🔴 el aviso «sin datos» también (hay datos de otras hojas, ninguno del Registro Reproductivo)', () => {
    pintar([O('Control_Tanque')({ Tanque: 'T1' })]);
    expect(root.querySelector('.empty-state').textContent).toContain('🧬');
    expect(root.innerHTML.includes('🥚')).toBe(false);
  });
});
