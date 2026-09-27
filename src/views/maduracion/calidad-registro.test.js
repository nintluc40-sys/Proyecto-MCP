// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T10 · la calidad del registro reproductivo (2026-09-27, usuario)

   Una cuarta sub-vista «🩺 Calidad» con las comprobaciones del registro contra sí mismo (MATRIZ ↔ Bitácora), cada una con
   su cuenta y, al desplegarla, su lista (Trovan —abre su historial si existe—, fecha, hoja, qué pasa) y qué corregir en el
   Sheet; reúne también los cuatro avisos que ya existían (fechas futuras, imposibles, chips repetidos, eventos sin
   ubicación). La pestaña lleva el número de problemas abiertos. Medido ese día (las mismas cifras que la auditoría del
   libro): 4 Trovan con formato inválido —son fechas, p. ej. «15/02/24405», en 6 eventos que son a la vez los 6
   «huérfanos»—, 6 desoves tras la muerte, 4 eventos antes del ingreso, 1 mortalidad con la hembra viva, 8 mortalidades
   con otra fecha, 3 muertas sin su mortalidad. Fixture ficticio con UN caso de cada problema.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, calidadDelRegistro } from './data.js';
import { maduracionView } from './index.js';

const T = { A: 'AAAAAAAAAA', B: 'BBBBBBBBBB', C: 'CCCCCCCCCC', D: 'DDDDDDDDDD', E: 'EEEEEEEEEE' };
const MZ = (t, muerte = '') => ({ 'Trovan ID': t, 'Sala actual': 'Sala 4', 'Tanque actual': 'Tanque 1', Estado: muerte ? 'Muerto' : 'Vivo', 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'Sala 4', Tanque: 'Tanque 1' });
/* A viva: desova el 05/06 DOS veces (repetido) y el 20/05 (antes de su ingreso). B muere el 10/06: desova el 12/06 (tras la
   muerte) y tiene DOS mortalidades (10/06 y 11/06: la segunda, además, en otra fecha). C muere el 15/06 y su mortalidad
   dice 14/06. D muerta sin mortalidad. E viva con una mortalidad. «15/02/24405» (una fecha en la columna del chip) y
   FFFFFFFFFF (bien escrito, sin hembra en la MATRIZ) desovan. Total: 1+1+1+1+1+2+1+1+1 = 10. */
const MATRIZ = [MZ(T.A), MZ(T.B, '2026-06-10'), MZ(T.C, '2026-06-15'), MZ(T.D, '2026-06-20'), MZ(T.E)];
const BITACORA = [EV(T.A, '2026-06-05'), EV(T.A, '2026-06-05'), EV(T.A, '2026-05-20'), EV(T.B, '2026-06-12'), EV(T.B, '2026-06-10', 'Mortalidad'),
  EV(T.B, '2026-06-11', 'Mortalidad'), EV(T.C, '2026-06-14', 'Mortalidad'), EV(T.E, '2026-06-12', 'Mortalidad'), EV('15/02/24405', '2026-06-03'), EV('FFFFFFFFFF', '2026-06-04')];

describe('Microchips · T10 · el modelo', () => {
  const Q = () => calidadDelRegistro(buildReproModel(MATRIZ, BITACORA, []));
  it('🔴 cada comprobación con su cuenta (un caso de cada) y el total', () => {
    const q = Q();
    expect(Object.fromEntries(q.checks.map((c) => [c.clave, c.cuenta]))).toEqual({
      'trovan-formato': 1, huerfano: 1, 'desove-tras-muerte': 1, 'mort-viva': 1, 'dos-mort': 1,
      'antes-ingreso': 1, 'mort-fecha': 2, 'sin-mort': 1, duplicado: 1,
      futuros: 0, 'fechas-imposibles': 0, 'chips-repetidos': 0, derivados: 0,
    });
    expect(q.total).toBe(10);
  });

  it('🔴 cada caso dice su Trovan, su fecha, su hoja y qué pasa; los que no tienen hembra no se pueden abrir', () => {
    const q = Q(), de = (k) => q.checks.find((c) => c.clave === k).items;
    const dma = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '');
    expect(de('desove-tras-muerte').map((i) => [i.trovan, dma(i.fecha), i.hoja, i.detalle, i.abrible])).toEqual([[T.B, '12/06/2026', 'Bitácora', 'Murió el 10/06/2026', true]]);
    expect(de('trovan-formato').map((i) => [i.trovan, i.abrible])).toEqual([['15/02/24405', false]]);
    expect(de('mort-fecha').map((i) => [i.trovan, i.detalle]).sort()).toEqual([[T.B, 'La MATRIZ dice 10/06/2026'], [T.C, 'La MATRIZ dice 15/06/2026']]);
    expect(de('sin-mort').map((i) => [i.trovan, i.hoja])).toEqual([[T.D, 'MATRIZ']]);
  });

  it('sin problemas, todo a cero', () => {
    const q = calidadDelRegistro(buildReproModel([MZ(T.A)], [EV(T.A, '2026-06-05')], []));
    expect(q.total).toBe(0);
  });
});

describe('Microchips · T10 · la sub-vista «🩺 Calidad»', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => { click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); document.body.classList.remove('modal-open'); });

  it('🔴 la pestaña con el número de problemas abiertos', () => {
    expect(root.querySelector('[data-mc-sub="calidad"]').textContent.replace(/\s+/g, ' ').trim()).toBe('🩺 Calidad 10');
  });

  it('🔴 las comprobaciones con problemas primero (las graves antes), desplegables; las limpias, con ✓', () => {
    click(root.querySelector('[data-mc-sub="calidad"]'));
    const chk = [...root.querySelectorAll('.mc-chk')];
    expect(chk.slice(0, 5).map((d) => [d.querySelector('.mc-chk-t').textContent, d.querySelector('.mc-chk-n').textContent, d.classList.contains('is-alta')])).toEqual([
      ['Trovan con formato inválido', '1', true], ['Eventos de un Trovan que no está en la MATRIZ', '1', true], ['Desoves posteriores a la muerte', '1', true],
      ['Mortalidad con la hembra viva en la MATRIZ', '1', true], ['Dos mortalidades de la misma hembra', '1', true]]);
    expect(chk[0].tagName).toBe('DETAILS');
    const limpias = [...root.querySelectorAll('.mc-chk-ok')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    expect(limpias).toContain('✓ Eventos con fecha futura');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 la lista de cada una: el Trovan abre su historial; qué corregir en el Sheet', () => {
    click(root.querySelector('[data-mc-sub="calidad"]'));
    const d = [...root.querySelectorAll('.mc-chk')].find((x) => x.textContent.includes('Desoves posteriores a la muerte'));
    const fila = [...d.querySelectorAll('tbody tr')][0];
    expect([...fila.cells].map((td) => td.textContent.trim())).toEqual([T.B, '12/06/2026', 'Bitácora', 'Murió el 10/06/2026']);
    expect(d.querySelector('.mc-chk-corr').textContent).toContain('Verificar la fecha del desove');
    click(fila.querySelector('[data-mc-female]'));
    expect(root.querySelector('#mcFemaleModal').classList.contains('sv-open')).toBe(true);
    const f = [...root.querySelectorAll('.mc-chk')].find((x) => x.textContent.includes('Trovan con formato inválido'));
    expect(f.querySelector('tbody [data-mc-female]')).toBeNull();
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-chk {', '.mc-chk.is-alta {', '.mc-chk-ok {', '.mc-pill-n {']) expect(css.includes(c), c).toBe(true);
  });
});
