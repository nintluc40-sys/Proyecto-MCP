// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · T6 · la ventana de desove: esperadas la próxima noche (2026-09-27, usuario)

   Retroprueba con los datos reales ese día: «último desove + la mediana» acierta el día ±1 sólo el 41 % (la mediana
   PROPIA de cada hembra no es mejor: 40,7 % con 204 casos; la de la granja, ±2 d el 71 %). Decisión del usuario: una
   VENTANA, no una fecha. Una hembra viva con algún desove está «en ventana» si los días desde su último desove hasta la
   PRÓXIMA noche (la siguiente al último dato) caen en la mitad central de los intervalos reales de la granja (hoy 3–7 d);
   «aún no» si son menos, «pasada» si son más. Por tanque en «Salas y Tanques», y su estado en el ranking; la precisión
   (±2 d de la mediana) se calcula con los datos y se escribe en la tarjeta. Fixture ficticio con cuentas a mano.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { buildReproModel, makeFilter, ventanaDeDesove } from './data.js';
import { maduracionView } from './index.js';

const MZ = (t, tq, muerte = '') => ({ 'Trovan ID': t, 'Sala actual': 'Sala 4', 'Tanque actual': tq, Estado: muerte ? 'Muerto' : 'Vivo', 'Fecha ingreso': '2026-06-01', 'Fecha muerte': muerte });
const EV = (t, fecha, tq) => ({ 'Trovan ID': t, Fecha: fecha, Tipo: 'Desove', Sala: 'Sala 4', Tanque: tq });
/* Intervalos de la granja: A 3 y 7, B 3 y 7 → cuartiles 3 y 7, mediana 5; los cuatro a ±2 de la mediana → 100 %.
   Último dato 30/06 → la próxima noche es el 01/07: A (último el 30/06) lleva 1 d → aún no; B (27/06) 4 d → en ventana;
   C (sólo el 10/06) 21 d → pasada; D nunca desovó → fuera. Los bordes: E (24/06) 7 d y F (28/06) 3 d → en ventana (los
   dos extremos cuentan); G desovó el 24/06 pero murió el 25 → fuera. */
const MATRIZ = [MZ('A', 'Tanque 1'), MZ('B', 'Tanque 1'), MZ('C', 'Tanque 2'), MZ('D', 'Tanque 2'), MZ('E', 'Tanque 2'), MZ('F', 'Tanque 2'), MZ('G', 'Tanque 1', '2026-06-25')];
const BITACORA = [EV('A', '2026-06-20', 'Tanque 1'), EV('A', '2026-06-23', 'Tanque 1'), EV('A', '2026-06-30', 'Tanque 1'),
  EV('B', '2026-06-17', 'Tanque 1'), EV('B', '2026-06-20', 'Tanque 1'), EV('B', '2026-06-27', 'Tanque 1'), EV('C', '2026-06-10', 'Tanque 2'),
  EV('E', '2026-06-24', 'Tanque 2'), EV('F', '2026-06-28', 'Tanque 2'), EV('G', '2026-06-24', 'Tanque 1')];

describe('Microchips · T6 · el modelo', () => {
  const M = () => buildReproModel(MATRIZ, BITACORA, []);
  it('🔴 la ventana (cuartiles de los intervalos de la granja), la mediana y su acierto ±2 d', () => {
    const v = ventanaDeDesove(M(), makeFilter({}));
    expect([v.desde, v.hasta, v.mediana, v.acierto2]).toEqual([3, 7, 5, 100]);
  });

  it('🔴 cada hembra a la próxima noche: aún no / en ventana / pasada (las que nunca desovaron, fuera)', () => {
    const v = ventanaDeDesove(M(), makeFilter({}));
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t) => v.porTrovan.get(t) || null)).toEqual([
      { estado: 'aun', dias: 1 }, { estado: 'ventana', dias: 4 }, { estado: 'pasada', dias: 21 }, null,
      { estado: 'ventana', dias: 7 }, { estado: 'ventana', dias: 3 }, null]);
  });

  it('🔴 por tanque, el que más tiene en ventana primero; sigue sala/tanque/lote/código', () => {
    const v = ventanaDeDesove(M(), makeFilter({}));
    expect(v.porTanque.map((t) => [t.key, t.ventana, t.aun, t.pasadas])).toEqual([['Sala 4 · Tanque 2', 2, 0, 1], ['Sala 4 · Tanque 1', 1, 1, 0]]);
    expect(ventanaDeDesove(M(), makeFilter({ sala: 'Sala 4', tanque: 'Tanque 2' })).porTanque.map((t) => t.key)).toEqual(['Sala 4 · Tanque 2']);
  });
});

describe('Microchips · T6 · la vista', () => {
  const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
  const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maduracionView(root);
  });
  afterEach(() => { click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); });

  /* 0v·4 (2026-09-29) · el calendario de desoves se retiró: en su sitio, «Hembras por su último desove»; la ventana sigue debajo. */
  it('🔴 «Salas y Tanques»: la tarjeta bajo la de las hembras por su último desove, con la ventana y su precisión, por tanque', () => {
    click(root.querySelector('[data-mc-sub="operativo"]'));
    const card = root.querySelector('.mc-ventana-card');
    expect(root.querySelector('.mc-ultdes-card').nextElementSibling).toBe(card);
    expect(card.querySelector('.mc-card-h').textContent.replace(/\s+/g, ' ')).toContain('ventana 3–7 d desde el último desove · la mediana (5 d) acierta ±2 d el 100 %');
    const filas = [...card.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    expect(filas).toEqual([['Sala 4 · Tanque 2', '2', '0', '1'], ['Sala 4 · Tanque 1', '1', '1', '0']]);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 el ranking dice el estado de cada hembra para la próxima noche', () => {
    click(root.querySelector('[data-mc-sub="hembras"]'));
    const card = [...root.querySelectorAll('.mc-card')].find((c) => c.textContent.includes('Ranking de hembras'));
    const ths = [...card.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const j = ths.indexOf('Próxima noche');
    expect(j).toBeGreaterThan(-1);
    const est = Object.fromEntries([...card.querySelectorAll('tbody tr')].map((tr) => [tr.querySelector('.mc-trovan').textContent, tr.cells[j].textContent.replace(/\s+/g, ' ').trim()]));
    expect(est).toEqual({ A: 'aún no · 1 d', B: 'en ventana · 4 d', C: 'pasada · 21 d', E: 'en ventana · 7 d', F: 'en ventana · 3 d', G: '—' });
    expect(card.querySelector('.mc-vent.is-ventana')).not.toBeNull();
  });

  it('🔑 los estilos en maduracion.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/maduracion/maduracion.css', 'utf8');
    for (const c of ['.mc-vent {', '.mc-vent.is-ventana {', '.mc-vent.is-pasada {']) expect(css.includes(c), c).toBe(true);
  });
});
