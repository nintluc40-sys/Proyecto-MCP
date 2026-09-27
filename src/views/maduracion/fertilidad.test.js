// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · la fertilidad y la TASA DE DESOVE (2026-09-26, usuario: «salen valores de casi 100 %»)

   Lo medido ese día con los datos reales, y lo que se corrigió:
   · «Por tanque» agrupaba por NÚMERO y los números se repiten entre salas: «Tanque 1» sumaba el de la Sala 4 (333
     desoves) y el de la Sala 1 (38). Un tanque es ahora sala + número.
   · El KPI de fertilidad no seguía el mes elegido (siempre «vivas que han desovado ALGUNA VEZ»): con un mes, es ahora
     la regla de Tendencias —de las vivas durante el mes, cuántas desovaron en él—.
   · La fertilidad es «% de hembras que desovaron en el período», que a lo largo de meses tiende al 100 %. Se añade la
     TASA DE DESOVE: desoves ÷ hembras-noche vivas en el período (referencia 5–15 % por noche).
   Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, kpis, locationStats, TASA_DESOVE_REF } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, sala, tanque, estado, ingreso, muerte = '') => ({ 'Trovan ID': t, 'Sala actual': sala, 'Tanque actual': tanque, Estado: estado, 'Fecha ingreso': ingreso, 'Fecha muerte': muerte });
const EV = (t, fecha, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo });
/* P1, P2 y P3 en la Sala 1 · tanque T1; Q1 en la Sala 4 · tanque T1 (el MISMO número). P2 ingresa el 16/06; P3 muere el
   10/06. Junio: P1 desova 3 veces, P2 y Q1 una. Julio (el último dato, el 05/07): P1 una vez. */
const MATRIZ = [MZ('P1', 'S1', 'T1', 'Vivo', '2026-06-01'), MZ('P2', 'S1', 'T1', 'Vivo', '2026-06-16'),
  MZ('P3', 'S1', 'T1', 'Muerto', '2026-06-01', '2026-06-10'), MZ('Q1', 'S4', 'T1', 'Vivo', '2026-06-01')];
const BITACORA = [EV('P1', '2026-06-02'), EV('P1', '2026-06-05'), EV('P1', '2026-06-20'), EV('P2', '2026-06-20'), EV('Q1', '2026-06-03'),
  EV('P3', '2026-06-10', 'Mortalidad'), EV('P1', '2026-07-05')];
const M = buildReproModel(MATRIZ, BITACORA, []);
const junio = makeFilter({ month: '2026-06' });
const r2 = (x) => Math.round(x * 100) / 100;

describe('Microchips · un tanque es sala + número', () => {
  it('🔴 el T1 de la Sala 1 y el de la Sala 4 son filas DISTINTAS', () => {
    const t = locationStats(M, junio, 'tanque');
    expect(t.map((x) => [x.key, x.desoves])).toEqual([['S1 · T1', 4], ['S4 · T1', 1]]);
  });
});

describe('Microchips · la fertilidad del KPI sigue el período', () => {
  it('🔴 con un mes: de las vivas DURANTE el mes, las que desovaron en él', () => {
    expect(kpis(M, junio).fertilidadGlobal).toBe(75);                                   // P1, P2, Q1 de P1, P2, P3, Q1
    expect(r2(kpis(M, makeFilter({ month: '2026-07' })).fertilidadGlobal)).toBe(33.33);  // sólo P1 de P1, P2, Q1
  });
  it('sin mes, como siempre: vivas que han desovado alguna vez', () => {
    expect(kpis(M, makeFilter({})).fertilidadGlobal).toBe(100);
  });
});

describe('Microchips · la TASA DE DESOVE por noche', () => {
  it('🔴 junio: 5 desoves ÷ 85 hembras-noche (P1 30 · P2 15 desde su ingreso · P3 10 hasta su muerte · Q1 30)', () => {
    const k = kpis(M, junio);
    expect(k.hembrasNoche).toBe(85);
    expect(r2(k.tasaDesove)).toBe(5.88);
  });
  it('🔴 por tanque: cada uno con SUS hembras-noche', () => {
    const t = Object.fromEntries(locationStats(M, junio, 'tanque').map((x) => [x.key, x]));
    expect([t['S1 · T1'].hembrasNoche, r2(t['S1 · T1'].tasaDesove)]).toEqual([55, 7.27]);
    expect([t['S4 · T1'].hembrasNoche, r2(t['S4 · T1'].tasaDesove)]).toEqual([30, 3.33]);
  });
  it('🔴 un mes en curso cuenta hasta el ÚLTIMO dato (05/07), no hasta el 31', () => {
    const k = kpis(M, makeFilter({ month: '2026-07' }));
    expect([k.hembrasNoche, r2(k.tasaDesove)]).toEqual([15, 6.67]);
  });
  it('sin mes: de la primera a la última fecha con eventos (02/06 → 05/07)', () => {
    const k = kpis(M, makeFilter({}));
    expect([k.hembrasNoche, r2(k.tasaDesove)]).toEqual([97, 6.19]);   // P1 34 · P2 20 · P3 9 · Q1 34
  });
  it('sin eventos, sin tasa (no un 0 inventado)', () => {
    expect(kpis(buildReproModel(MATRIZ, [], []), makeFilter({})).tasaDesove).toBe(null);
    expect(TASA_DESOVE_REF).toMatchObject({ min: 5, max: 15 });
  });
});

describe('Microchips · la vista enseña la tasa', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => { root.remove(); errSpy.mockRestore(); });

  it('🔴 el KPI «Tasa de desove», con su referencia', () => {
    const t = [...root.querySelectorAll('.mc-kpi')].find((x) => x.querySelector('.mc-kpi-lb').textContent === 'Tasa de desove');
    expect(t.querySelector('.mc-kpi-v').textContent).toBe('6.2%');
    expect(t.querySelector('.mc-kpi-sub').textContent).toContain('ref. 5–15 % por noche');
  });

  it('🔴 «Top tanques»: cada tanque con su sala, y su tasa por noche', () => {
    const tabla = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('Top tanques')).querySelector('table');
    expect([...tabla.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Tanque', 'Desoves', 'Fertilidad', 'Tasa/noche']);
    // Todo el período: S1·T1 5 desoves, 2 de 3 hembras desovaron, 5 ÷ 63 hembras-noche; S4·T1 1 desove, 1 de 1, 1 ÷ 34.
    expect([...tabla.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent)))
      .toEqual([['S1 · T1', '5', '66.7%', '7.9%'], ['S4 · T1', '1', '100%', '2.9%']]);
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe('Microchips · «Salas y Tanques» enseña la tasa, con su semáforo', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
    root.querySelector('[data-mc-sub="operativo"]').dispatchEvent(new Event('click', { bubbles: true }));
  });
  afterEach(() => {
    root.querySelector('[data-mc-sub="panorama"]').dispatchEvent(new Event('click', { bubbles: true }));   // el estado de la vista vive la sesión
    root.remove(); errSpy.mockRestore();
  });

  it('🔴 «Producción y eficiencia»: la columna Tasa/noche y su semáforo contra 5–15 %', () => {
    const tabla = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('Producción y eficiencia')).querySelector('table');
    const cab = [...tabla.querySelectorAll('th')].map((th) => th.textContent);
    expect(cab).toContain('Tasa/noche');
    const i = cab.indexOf('Tasa/noche');
    const celda = (k) => [...tabla.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(k)).cells[i].querySelector('.mc-fert');
    expect([celda('S1 · T1').textContent, celda('S1 · T1').classList.contains('is-good')]).toEqual(['7.9%', true]);   // todo el período: 5 desoves ÷ 63 hembras-noche (P1 34 · P2 20 · P3 9)
    expect(celda('S4 · T1').classList.contains('is-low'), 'por debajo del 5 %').toBe(true);
    expect(tabla.closest('.mc-card').textContent).toContain('Un tanque es sala + número');
    expect(errSpy).not.toHaveBeenCalled();
  });
});
