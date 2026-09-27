// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · las hembras MUERTAS del ranking, a primera vista (2026-09-27, usuario)

   Medido ese día: 711 de las 1 407 hembras del ranking (51 %) están muertas, 21 dentro de las 200 filas que se enseñan,
   y nada las distinguía. Decisión del usuario: su fila ATENUADA, «✝ muerta dd/mm» junto al Trovan (su fecha de muerte,
   que la MATRIZ trae en todas), y un filtro rápido Todas · Vivas · Muertas, con sus cuentas. Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, femaleRanking } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, estado, muerte = '') => ({ 'Trovan ID': t, 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: estado, 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo });
/* V1 desova 3 veces (viva); M1 2 (muerta el 12/06, con su mortalidad); V2 1 (viva). */
const MATRIZ = [MZ('V1', 'Vivo'), MZ('M1', 'Muerto', '2026-06-12'), MZ('V2', 'Vivo')];
const BITACORA = [EV('V1', '2026-06-02'), EV('V1', '2026-06-06'), EV('V1', '2026-06-10'), EV('M1', '2026-06-03'), EV('M1', '2026-06-08'),
  EV('M1', '2026-06-12', 'Mortalidad'), EV('V2', '2026-06-05')];

describe('Microchips · el ranking sabe quién murió y cuándo', () => {
  it('cada fila trae su estado y su fecha de muerte', () => {
    const rk = femaleRanking(buildReproModel(MATRIZ, BITACORA, []), makeFilter({}));
    expect(rk.map((r) => [r.trovan, r.estado, r.muerte ? r.muerte.getDate() : null])).toEqual([['V1', 'Vivo', null], ['M1', 'Muerto', 12], ['V2', 'Vivo', null]]);
  });
});

describe('Microchips · el ranking marca a las muertas', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  const tabla = () => [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('Ranking de hembras')).querySelector('table');
  const filas = () => [...tabla().querySelectorAll('tbody tr')];
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
    click(root.querySelector('[data-mc-sub="hembras"]'));
  });
  afterEach(() => {
    const t = root.querySelector('[data-mc-rankestado="todas"]'); if (t) click(t);   // el estado de la vista vive la sesión
    click(root.querySelector('[data-mc-sub="panorama"]'));
    root.remove(); errSpy.mockRestore();
  });

  it('🔴 la fila de una muerta va atenuada y dice «✝ muerta dd/mm», con la fecha completa al pasar el ratón', () => {
    const m1 = filas().find((tr) => tr.textContent.includes('M1'));
    expect(m1.classList.contains('mc-rank-muerta')).toBe(true);
    const tag = m1.querySelector('.mc-muerta');
    expect(tag.textContent).toBe('✝ muerta 12/06');
    expect(tag.getAttribute('title')).toMatch(/^Murió el /);
    const v1 = filas().find((tr) => tr.textContent.includes('V1'));
    expect([v1.classList.contains('mc-rank-muerta'), v1.querySelector('.mc-muerta')]).toEqual([false, null]);
  });

  it('🔴 el filtro rápido: Todas · Vivas · Muertas, con sus cuentas', () => {
    const seg = [...root.querySelectorAll('[data-mc-rankestado]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    expect(seg).toEqual(['Todas 3', 'Vivas 2', '✝ Muertas 1']);
    click(root.querySelector('[data-mc-rankestado="muertas"]'));
    expect(filas().map((tr) => tr.cells[1].querySelector('.mc-trovan').textContent)).toEqual(['M1']);
    expect(root.querySelector('[data-mc-rankestado="muertas"]').getAttribute('aria-pressed')).toBe('true');
    click(root.querySelector('[data-mc-rankestado="vivas"]'));
    expect(filas().map((tr) => tr.cells[1].querySelector('.mc-trovan').textContent)).toEqual(['V1', 'V2']);
    expect(filas().map((tr) => tr.cells[0].textContent), 'el # cuenta dentro de lo filtrado').toEqual(['1', '2']);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔑 las clases nuevas tienen su estilo en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-rank-muerta td', '.mc-muerta {', '.mc-rank-seg {']) expect(css.includes(c), c).toBe(true);
  });
});
