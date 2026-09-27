// @vitest-environment happy-dom
/* ============================================================
   MICROCHIPS · la legibilidad de TODOS los gráficos (2026-09-27, usuario)

   «Se ven borrosos, transparentosos, y no se aprecian las cantidades de los ejes». Medido ese día en Chrome: los lienzos
   ya salen a 2x (no es un problema de píxeles; a 125 % el 2x forzado sale incluso algo más nítido que el exacto); lo que
   se ve mal es el ESTILO: ejes a 10 px en gris claro #78909c, barras al 80 % de opacidad, cuadrícula al 16 %, y líneas de
   Tendencias curvas que inventan valores entre meses. Decisión del usuario: ejes 12 px oscuros y según el tema, títulos
   de eje 11 px, leyenda 12 px, barras SÓLIDAS, cuadrícula más marcada, líneas rectas, y la CIFRA al final de cada barra
   en Desoves/Mortalidad por tanque. Esta prueba barre la configuración de los seis gráficos de la vista. Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: vi.fn(), destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { makeChart } from '../../core/charts.js';
import { maduracionView } from './index.js';

const MZ = (t, tq) => ({ 'Trovan ID': t, 'Sala actual': 'S1', 'Tanque actual': tq, Estado: 'Vivo', 'Fecha ingreso': '2026-05-01' });
const EV = (t, fecha, tq, tipo = 'Desove') => ({ 'Trovan ID': t, Fecha: fecha, Tipo: tipo, Sala: 'S1', Tanque: tq });
/* A (T1): 1 234 desoves no caben en un fixture; basta con que la cifra se escriba con el formato de la vista. */
const MATRIZ = [MZ('A', 'T1'), MZ('B', 'T2'), MZ('C', 'T2')];
const BITACORA = [EV('A', '2026-06-01', 'T1'), EV('A', '2026-06-04', 'T1'), EV('A', '2026-06-09', 'T1'), EV('B', '2026-06-01', 'T2'),
  EV('B', '2026-06-21', 'T2'), EV('C', '2026-06-02', 'T2'), EV('C', '2026-06-20', 'T2', 'Mortalidad')];

const O = (hoja) => (o) => ({ _SheetOrigin: hoja, ...o });
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
const cfg = (id) => { const l = makeChart.mock.calls.filter(([i]) => i === id); return l.length ? l[l.length - 1][1] : null; };

describe('Microchips · los seis gráficos se leen', () => {
  let root, errSpy;
  beforeEach(() => {
    store.globalData = [...MATRIZ.map(O('Maduración MATRIZ')), ...BITACORA.map(O('Maduración Bitácora'))];
    root = document.createElement('div'); document.body.appendChild(root);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    makeChart.mockClear();
    maduracionView(root);                                                   // Panorama: mcTrend + mcStateDonut
    click(root.querySelector('[data-mc-sub="operativo"]'));                 // mcLocBars + mcMortBars
    click(root.querySelector('[data-mc-sub="hembras"]'));                   // mcInterval
    click(root.querySelector('[data-mc-female="A"]'));                      // mcFemChart
  });
  afterEach(() => { click(root.querySelector('[data-mc-sub="panorama"]')); root.remove(); errSpy.mockRestore(); document.documentElement.style.removeProperty('--c-text'); });

  const IDS = ['mcTrend', 'mcStateDonut', 'mcLocBars', 'mcMortBars', 'mcInterval', 'mcFemChart'];

  it('se dibujan los seis', () => {
    expect(IDS.filter((id) => !cfg(id))).toEqual([]);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 ejes a 12 px y NO en el gris claro de antes; títulos de eje a 11 px', () => {
    for (const id of IDS.filter((i) => i !== 'mcStateDonut')) {
      for (const [eje, s] of Object.entries(cfg(id).options.scales)) {
        expect(s.ticks.font.size, `${id}.${eje} ticks`).toBeGreaterThanOrEqual(12);
        expect(String(s.ticks.color).toLowerCase(), `${id}.${eje} color`).not.toBe('#78909c');
        if (s.title && s.title.display) expect(s.title.font.size, `${id}.${eje} título`).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it('🔴 barras SÓLIDAS: ningún relleno con transparencia (#rrggbbaa)', () => {
    for (const id of IDS) {
      for (const d of cfg(id).data.datasets) {
        for (const c of [].concat(d.backgroundColor)) expect(String(c), `${id} · ${d.label}`).not.toMatch(/^#[0-9a-f]{8}$/i);
      }
    }
  });

  it('🔴 Tendencias: líneas RECTAS (sin curva entre meses), puntos visibles y leyenda a 12 px', () => {
    const c = cfg('mcTrend');
    const lineas = c.data.datasets.filter((d) => d.type === 'line');
    expect(lineas.map((d) => [d.label, d.tension, d.pointRadius >= 3])).toEqual([['Mortalidad', 0, true], ['Fertilidad %', 0, true]]);
    expect(c.options.plugins.legend.labels.font.size).toBeGreaterThanOrEqual(12);
  });

  it('🔴 el donut separa sus porciones con el color de la tarjeta (no con blanco translúcido)', () => {
    expect(cfg('mcStateDonut').data.datasets[0].borderColor).toBe('#ffffff');   // --c-surface; sin hoja de estilos, su valor por defecto
  });

  it('🔴 la cuadrícula se ve (opacidad ≥ .3)', () => {
    const a = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(cfg('mcLocBars').options.scales.x.grid.color)[1]);
    expect(a).toBeGreaterThanOrEqual(0.3);
  });

  it('🔴 Desoves y Mortalidad por tanque escriben la CIFRA al final de cada barra, con el formato de la vista', () => {
    for (const id of ['mcLocBars', 'mcMortBars']) {
      const c = cfg(id);
      expect(c.plugins.map((p) => p.id), id).toEqual(['mcCifras']);
      expect(c.options.layout.padding.right, id + ' deja sitio a la cifra').toBeGreaterThanOrEqual(30);
      const escritos = [];
      const ctx = { save() {}, restore() {}, fillText: (t, x, y) => escritos.push([t, x, y]) };
      const datos = c.data.datasets[0].data;
      const chart = { ctx, data: c.data, getDatasetMeta: () => ({ data: datos.map((_, i) => ({ x: 100 + i, y: 10 * i })) }) };
      c.plugins[0].afterDatasetsDraw(chart, {}, c.options.plugins.mcCifras);
      /* T2 (2026-09-27, usuario) · Mortalidad va por defecto en «% diario»: la cifra de una tasa, con 2 decimales y «%». */
      const o = c.options.plugins.mcCifras;
      const fmt = (v) => (o.decimales != null ? v.toLocaleString('es-EC', { minimumFractionDigits: o.decimales, maximumFractionDigits: o.decimales }) + o.sufijo : v.toLocaleString('es-EC'));
      expect(escritos, id).toEqual(datos.map((v, i) => [fmt(v), 100 + i + 6, 10 * i]));
    }
    const c = cfg('mcLocBars'), escritos = [];
    c.plugins[0].afterDatasetsDraw({ ctx: { save() {}, restore() {}, fillText: (t) => escritos.push(t) }, data: { datasets: [{ data: [1234] }] },
      getDatasetMeta: () => ({ data: [{ x: 0, y: 0 }] }) }, {}, c.options.plugins.mcCifras);
    expect(escritos).toEqual([(1234).toLocaleString('es-EC')]);
  });

  it('🔑 el color de los ejes sigue al TEMA (lo lee de --c-text al dibujar)', () => {
    document.documentElement.style.setProperty('--c-text', '#abcdef');
    makeChart.mockClear();
    click(root.querySelector('[data-mc-sub="operativo"]'));
    expect(cfg('mcLocBars').options.scales.x.ticks.color).toBe('#abcdef');
    expect(cfg('mcLocBars').options.plugins.mcCifras.color).toBe('#abcdef');
  });
});
