// @vitest-environment happy-dom
/* ============================================================
   A24 (2026-11-07, usuario: «Darles el lote de su tanque») · OD Y T° AL COMPARAR «POR LOTE»

   Control_Tanque no anota el lote, así que comparar dos lotes en oxígeno o temperatura daba siempre «Sin datos». Ahora
   cada lectura toma el lote que tenía su tanque ese día en Datos Larvicultura. Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { compareTanksButtonHTML, compareTanksModalHTML, setupCompareTanks, loteDeLectura } from './compareTanks.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });
const T = (o) => ({ _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '573', Hora: '08:00', ...o });
const datos = () => [
  L({ Tanque: 'TQ 1', Fecha: '01/06/2026', Lote: 'AB', Supervivencia: '90' }),
  L({ Tanque: 'TQ 2', Fecha: '01/06/2026', Lote: 'L1', Supervivencia: '85' }),
  L({ Tanque: 'TQ 1', Fecha: '02/06/2026', Lote: 'AB', Supervivencia: '88' }),
  L({ Tanque: 'TQ 2', Fecha: '02/06/2026', Lote: 'L1', Supervivencia: '80' }),
  T({ Tanque: 'TQ 1', Fecha: '2026-06-01', OD: '6.0', Temperatura: '30' }),   // la fecha, escrita de otra forma
  T({ Tanque: 'TQ 2', Fecha: '2026-06-01', OD: '5.0', Temperatura: '31' }),
  T({ Tanque: 'TQ 1', Fecha: '2026-06-02', OD: '6.2', Temperatura: '30' }),
  T({ Tanque: 'TQ 2', Fecha: '2026-06-02', OD: '5.1', Temperatura: '31' }),
  T({ Tanque: 'TQ 3', Fecha: '2026-06-02', OD: '9.9', Temperatura: '29' }),   // tanque sin lote ese día: no entra
];

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = compareTanksButtonHTML() + compareTanksModalHTML();
  setupCompareTanks(root);
  root.querySelector('[data-ctt-open]').click();
  return root;
}
function elegir(sel, val) {
  const opt = [...sel.options].find((o) => o.value === val);
  if (!opt) throw new Error(`sin opción ${val}: ${[...sel.options].map((o) => o.value)}`);
  [...sel.options].forEach((o) => { o.selected = o === opt; o.removeAttribute('selected'); });
  opt.setAttribute('selected', 'selected');
  sel.dispatchEvent(new Event('change'));
}

beforeEach(() => { document.body.innerHTML = ''; store.globalData = datos(); });

describe('A24 · el lote de cada lectura de Control_Tanque', () => {
  it('es el de su tanque ese día; sin lote ese día, ninguno', () => {
    const [, , , , t1, t2, , , t3] = store.globalData;
    expect(loteDeLectura(t1)).toBe('AB');
    expect(loteDeLectura(t2)).toBe('L1');
    expect(loteDeLectura(t3)).toBe('');
  });

  it('🔴 comparar dos lotes en OXÍGENO ya no da «Sin datos» (antes, siempre)', () => {
    const root = mount();
    root.querySelector('[data-ctmode="lote"]').click();
    elegir(root.querySelector('[data-ct="var"]'), 'od');
    elegir(root.querySelector('[data-ctlote="A"]'), 'AB');
    elegir(root.querySelector('[data-ctlote="B"]'), 'L1');
    root.querySelector('[data-ct-generate]').click();
    const out = root.querySelector('#cttOutput').textContent;
    expect(out).not.toContain('Sin datos de la variable');
    expect(out).toContain('Evolución diaria');
  });
});
