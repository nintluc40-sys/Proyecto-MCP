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
import { buildReproModel, makeFilter, productividadPorFamilia, kpis, locationStats } from './data.js';
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

  it('🔴 A27 · la baldosa «Desoves / hembra»: 4 desoves ÷ las 4 hembras (C está muerta) = 1, y lo dice', () => {
    const t = [...root.querySelectorAll('.mc-kpi')].find((x) => x.querySelector('.mc-kpi-lb').textContent === 'Desoves / hembra');
    expect(t.querySelector('.mc-kpi-v').textContent).toBe('1');
    expect(t.querySelector('.mc-kpi-sub').textContent).toBe('entre todas sus hembras, vivas y muertas');
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

/* ============================================================
   A27 (2026-11-06, decisiones del usuario: «Todas las hembras» y «Contar donde desovó»)
   · «Desoves / hembra» del KPI divide entre TODAS las hembras del filtro, vivas y muertas, como la tabla por familia.
     Antes, entre las vivas: con 4 desoves de una viva y otra muerta, el KPI daba 4 y la familia 2.
   · Con sala o tanque, el KPI y la familia cuentan también las hembras que tuvieron desoves o muertes ALLÍ en el período,
     como la tabla por sala: una hembra que desovó en la Sala 2 y hoy está en la 1 ya no deja a la Sala 2 con sus
     desoves y ninguna hembra («tasa —»).
   Fixture ficticio: X (viva, hoy en la Sala 1) desova cuatro veces en la Sala 2 entre el 11 y el 14/09; Y, de la Sala 1,
   muere el 02/09 (allí).
   ============================================================ */
describe('Microchips · A27 · la población de los KPI y de la familia', () => {
  const MZ2 = (t, sala, estado = 'Vivo', muerte = '') => ({ 'Trovan ID': t, Lote: 'LZ', 'Código genético': 'CZ', 'Sala actual': sala, 'Tanque actual': 'Tanque 1', Estado: estado, 'Fecha ingreso': '2026-09-01', 'Fecha muerte': muerte });
  const EV2 = (t, fecha, sala, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: sala, Tanque: 'Tanque 1' });
  const M = () => buildReproModel(
    [MZ2('X', 'Sala 1'), MZ2('Y', 'Sala 1', 'Muerto', '2026-09-02')],
    [EV2('X', '2026-09-11', 'Sala 2'), EV2('X', '2026-09-12', 'Sala 2'), EV2('X', '2026-09-13', 'Sala 2'), EV2('X', '2026-09-14', 'Sala 2'),
      EV2('Y', '2026-09-02', 'Sala 1', 'Mortalidad')], []);

  it('🔴 «Desoves / hembra»: entre todas las hembras, vivas y muertas; el KPI y la familia dan lo mismo', () => {
    const k = kpis(M(), makeFilter({}));
    expect([k.desoves, k.totalHembras, k.vivas, k.desovesPorHembra]).toEqual([4, 2, 1, 2]);
    expect(productividadPorFamilia(M(), makeFilter({}), 'codigo')[0].desovesPorHembra).toBe(2);
    expect(k.desovesPorHembraViva).toBeUndefined();   // el nombre viejo ya no existe: decía «viva» y no lo es
  });

  it('🔴 con la sala donde desovó: la hembra trasladada cuenta allí; el KPI cuadra con la tabla por sala', () => {
    const m = M();
    const k2 = kpis(m, makeFilter({ sala: 'Sala 2' }));
    expect([k2.desoves, k2.totalHembras, k2.vivas, k2.desovesPorHembra]).toEqual([4, 1, 1, 4]);
    const filaS2 = locationStats(m, makeFilter({}), 'sala').find((x) => x.key === 'Sala 2');
    expect(k2.tasaDesove).toBe(filaS2.tasaDesove);
    expect(k2.hembrasNoche).toBe(filaS2.hembrasNoche);
    expect(k2.tasaDesove).not.toBeNull();   // antes: «—», sin hembras
    const fam2 = productividadPorFamilia(m, makeFilter({ sala: 'Sala 2' }), 'codigo');
    expect(fam2.map((x) => [x.familia, x.hembras, x.desoves, x.desovesPorHembra])).toEqual([['CZ', 1, 4, 4]]);   // antes: 0 desoves
  });

  it('🔴 la sala donde está hoy sigue contándola; una sala sin nada suyo, nada', () => {
    const m = M();
    const k1 = kpis(m, makeFilter({ sala: 'Sala 1' }));
    expect([k1.desoves, k1.totalHembras, k1.vivas, k1.muertas]).toEqual([0, 2, 1, 1]);
    const k9 = kpis(m, makeFilter({ sala: 'Sala 9' }));
    expect([k9.desoves, k9.totalHembras]).toEqual([0, 0]);
  });

  it('🔴 una MUERTE allí también cuenta a la hembra en esa sala (no sólo un desove)', () => {
    const m = buildReproModel(
      [MZ2('W', 'Sala 1', 'Muerto', '2026-09-05')],
      [EV2('W', '2026-09-05', 'Sala 2', 'Mortalidad')], []);
    const k2 = kpis(m, makeFilter({ sala: 'Sala 2' }));
    expect([k2.mortalidad, k2.totalHembras, k2.muertas]).toEqual([1, 1, 1]);
  });

  it('🔴 sin sala ni tanque, la población es la de siempre (el lote y el código no suman hembras de fuera)', () => {
    const m = M();
    expect(kpis(m, makeFilter({ lote: 'LZ' })).totalHembras).toBe(2);
    expect(kpis(m, makeFilter({ lote: 'OTRO' })).totalHembras).toBe(0);
  });
});
