// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T1 · productividad por familia (código genético | lote) (2026-09-27, usuario)

   Una fila por familia, con las MISMAS reglas que los KPI de la vista: hembras (las del filtro), muertas, fertilidad,
   desoves, desoves/hembra, hembras-noche, tasa por noche (con las bandas de V1) y el PERÍODO en que desovó (las familias
   no tienen por qué ser contemporáneas). Ordenada por tasa. Medido ese día: BP 4,9 %/noche · BJ 1,8 % · BK 1,2 % (código
   y lote van 1 a 1 hoy). Fixture ficticio, con código y lote que NO van 1 a 1, y cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, productividadPorFamilia } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, lote, cod, estado = 'Vivo', muerte = '') => ({ 'Trovan ID': t, Lote: lote, 'Código genético': cod, 'Sala actual': 'Sala 4', 'Tanque actual': 'Tanque 1', Estado: estado, 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'Sala 4', Tanque: 'Tanque 1' });
/* Del 01/06 al 10/06 (10 noches). C1 = A, B (lote L1) y D (lote L3); C2 = C (lote L2), que muere el 04/06.
   A desova el 01, el 03 y el 05; C el 02; B y D, nunca. */
const MATRIZ = [MZ('A', 'L1', 'C1'), MZ('B', 'L1', 'C1'), MZ('D', 'L3', 'C1'), MZ('C', 'L2', 'C2', 'Muerto', '2026-06-04')];
const BITACORA = [EV('A', '2026-06-01'), EV('A', '2026-06-03'), EV('A', '2026-06-05'), EV('C', '2026-06-02'), EV('C', '2026-06-04', 'Mortalidad'), EV('B', '2026-06-10', 'Mortalidad')];
/* (B «muere» en la Bitácora el 10/06 pero la MATRIZ la tiene viva: sólo alarga la ventana hasta el 10.) */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Microchips · T1 · el modelo', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 por código genético: hembras, muertas, desoves, hembras-noche, tasa, desoves/hembra, período, sus lotes; por tasa', () => {
    const t = productividadPorFamilia(M(), makeFilter({}), 'codigo');
    expect(t.map((x) => [x.familia, x.hembras, x.muertas, x.desoves, x.hembrasNoche, Math.round(x.tasa * 10) / 10, Math.round(x.desovesPorHembra * 100) / 100, x.otros]))
      .toEqual([['C2', 1, 1, 1, 4, 25, 1, ['L2']], ['C1', 3, 0, 3, 30, 10, 1, ['L1', 'L3']]]);
    const c1 = t.find((x) => x.familia === 'C1');
    expect([iso(c1.desde), iso(c1.hasta)]).toEqual(['2026-06-01', '2026-06-05']);
    expect(Math.round(c1.fertilidad * 10) / 10).toBe(33.3);   // de las vivas (A, B, D), desovó A
  });

  it('🔴 por lote, otro reparto (el mismo código en dos lotes)', () => {
    const t = productividadPorFamilia(M(), makeFilter({}), 'lote');
    expect(t.map((x) => [x.familia, x.hembras, x.desoves, x.hembrasNoche, x.tasa, x.otros])).toEqual([
      ['L2', 1, 1, 4, 25, ['C2']], ['L1', 2, 3, 20, 15, ['C1']], ['L3', 1, 0, 10, 0, ['C1']],
    ]);
  });

  it('🔴 con un mes, la fertilidad del MES (la regla de los KPI): C, muerta el 04/06, vivió y desovó en junio', () => {
    const todo = productividadPorFamilia(M(), makeFilter({}), 'codigo').find((x) => x.familia === 'C2');
    const junio = productividadPorFamilia(M(), makeFilter({ month: '2026-06' }), 'codigo').find((x) => x.familia === 'C2');
    expect([todo.fertilidad, junio.fertilidad]).toEqual([0, 100]);   // sin mes: de las VIVAS (ninguna); en junio: 1 de 1
  });

  it('🔴 sigue los filtros de la vista (un lote deja sólo su familia)', () => {
    expect(productividadPorFamilia(M(), makeFilter({ lote: 'L3' }), 'codigo').map((x) => [x.familia, x.hembras, x.desoves])).toEqual([['C1', 1, 0]]);
  });
});

describe('Microchips · T1 · la tarjeta en Panorama', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  const card = () => root.querySelector('.mc-fam-card');
  const filas = () => [...card().querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => { const b = root.querySelector('[data-mc-familia="codigo"]'); if (b) click(b); root.remove(); errSpy.mockRestore(); });

  it('🔴 por código genético: una fila por familia con sus lotes, su tasa en banda y su período', () => {
    expect(card()).not.toBeNull();
    expect(root.querySelector('[data-mc-familia="codigo"]').getAttribute('aria-pressed')).toBe('true');
    const f = filas();
    expect(f.map((r) => r[0])).toEqual(['C2 · L2', 'C1 · L1, L3']);
    expect(f[1]).toEqual(['C1 · L1, L3', '3', '0', '33.3%', '3', '1', '30', '10 %', '3,33 %', '01/06–05/06']);   // T2 · + «Mort./día» (la de B, el 10/06)
    expect(card().querySelector('tbody tr .mc-tasa-b').className).toBe('mc-tasa-b is-b-alta');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 el selector cambia a Lote', () => {
    click(root.querySelector('[data-mc-familia="lote"]'));
    expect(filas().map((r) => r[0])).toEqual(['L2 · C2', 'L1 · C1', 'L3 · C1']);
    expect(root.querySelector('[data-mc-familia="lote"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-tasa-b {', '.mc-tasa-b.is-b-critica', '.mc-tasa-b.is-b-rango', '.mc-fam-otros {']) expect(css.includes(c), c).toBe(true);
  });
});
