// @vitest-environment happy-dom
/* ============================================================
   ALGAS · lo que DICE cada gráfico (punto 37 de la pauta del 12-11, usuario: «Lo que el gráfico dice»).
   `makeChart` se sustituye por uno que devuelve la configuración: aquí se mira lo que el gráfico enseña —los datos, el
   color de cada barra o línea, las líneas de límite, las unidades de los ejes, los textos de la ayuda— y qué hace sin
   datos. Cifras INVENTADAS (el repo es público).
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: (canvasId, config) => ({ canvasId, ...config }) }));
import {
  algColor, CAT_COLOR, fmtK, drawGrowth, drawGrowthMini, drawGrowthBar, drawTasa, drawProto, drawUsoSistema, drawModuloBiomasa,
  drawSanitBars, drawDescClases, drawDaily, drawCellQuality, drawDispatchBars,
} from './charts.js';
import { dayNum, rangeLabel } from '../../core/dates.js';

const tick = (eje, v, i = 0) => eje.ticks.callback(v, i);
const ayuda = (cfg, punto) => cfg.options.plugins.tooltip.callbacks.label(punto);
const DIAS = ['01/10/2026', '02/10/2026', '03/10/2026'];

describe('las utilidades', () => {
  it('fmtK abrevia: millones con 2 decimales, miles sin decimales; sin dato, «—»', () => {
    expect([fmtK(1234567), fmtK(85000), fmtK(2400), fmtK(1000), fmtK(999), fmtK(12.6)]).toEqual(['1.23M', '85K', '2K', '1K', '999', '13']);
    expect([fmtK(null), fmtK(undefined), fmtK(NaN)]).toEqual(['—', '—', '—']);
    expect(fmtK(-2500000)).toBe('-2.50M');
  });
  it('algColor: 14 colores distintos y luego vuelve a empezar', () => {
    const catorce = Array.from({ length: 14 }, (_, i) => algColor(i));
    expect(new Set(catorce).size).toBe(14);
    expect(algColor(14)).toBe(algColor(0));
  });
  it('cada categoría de sistema tiene su color, y «Otros» uno neutro', () => {
    expect(Object.keys(CAT_COLOR)).toEqual(['Masivos', 'Premasivos', 'Fundas', 'Carboys', 'PBR', 'Otros']);
    expect(new Set(Object.values(CAT_COLOR)).size).toBe(6);
  });
});

describe('drawGrowth · la curva de crecimiento', () => {
  const series = [{ label: 'Lote A', data: [10000, 20000, null, 40000] }, { label: 'Lote B', data: [5000, 5000, 6000, 8000] }];
  it('una línea por lote, con su color de la paleta; eje en cel/ml con el número COMPLETO', () => {
    const c = drawGrowth('cv', ['1', '2', '3', '4'], series);
    expect(c.type).toBe('line');
    expect(c.data.datasets.map((d) => [d.label, d.borderColor])).toEqual([['Lote A', algColor(0)], ['Lote B', algColor(1)]]);
    expect(c.data.datasets[0].data).toEqual([10000, 20000, null, 40000]);
    expect(c.options.scales.y.title.text).toBe('cel/ml');
    expect(tick(c.options.scales.y, 85000)).toBe('85000');
    expect(c.options.scales.x.title.text).toBe('Día de proceso');
    expect(ayuda(c, { dataset: { label: 'Lote A' }, parsed: { y: 85000 } })).toBe(' Lote A: 85000');
    expect(ayuda(c, { dataset: { label: 'Lote A' }, parsed: { y: null } })).toBe(' Lote A: —');
  });
  it('normalizada: cada lote en % de SU pico (compara la forma), eje 0–105 «% del pico»', () => {
    const c = drawGrowth('cv', ['1', '2', '3', '4'], series, null, { norm: true });
    expect(c.data.datasets[0].data).toEqual([25, 50, null, 100]);
    expect(c.data.datasets[1].data).toEqual([62.5, 62.5, 75, 100]);
    expect([c.options.scales.y.min, c.options.scales.y.max, c.options.scales.y.title.text]).toEqual([0, 105, '% del pico']);
    expect(tick(c.options.scales.y, 50)).toBe('50%');
    expect(ayuda(c, { dataset: { label: 'Lote B' }, parsed: { y: 75 } })).toBe(' Lote B: 75%');
  });
  it('normalizada sin ningún dato: todo hueco (no divide entre cero)', () => {
    const c = drawGrowth('cv', ['1', '2'], [{ label: 'Vacío', data: [null, 0] }], null, { norm: true });
    expect(c.data.datasets[0].data).toEqual([null, null]);
  });
  it('con contenedor de leyenda: la nativa se apaga y se pintan chips que ocultan/enseñan cada línea', () => {
    const c = drawGrowth('cv', ['1'], series, 'leg');
    expect(c.options.plugins.legend.display).toBe(false);
    expect(c.plugins).toHaveLength(1);
    document.body.innerHTML = '<div id="leg"></div>';
    const visibles = [true, false];
    const chart = { data: { datasets: c.data.datasets }, isDatasetVisible: (i) => visibles[i],
      setDatasetVisibility: vi.fn((i, v) => { visibles[i] = v; }), update: vi.fn() };
    c.plugins[0].afterUpdate(chart);
    const chips = [...document.querySelectorAll('#leg .alg-leg-chip')];
    expect(chips.map((b) => [b.textContent, b.classList.contains('is-off'), b.title])).toEqual([
      ['Lote A', false, 'Ocultar Lote A'], ['Lote B', true, 'Mostrar Lote B']]);
    chips[1].click();
    expect(chart.setDatasetVisibility).toHaveBeenCalledWith(1, true);
    expect(chart.update).toHaveBeenCalled();
  });
  it('sin contenedor: la leyenda nativa, de segmentos de línea', () => {
    const c = drawGrowth('cv', ['1'], series);
    expect(c.options.plugins.legend.labels.pointStyle).toBe('line');
    expect(c.plugins).toEqual([]);
  });
});

describe('las curvas pequeñas y las barras de densidad', () => {
  it('drawGrowthMini: la línea rellena del color dado, sin leyenda, con el eje abreviado', () => {
    const c = drawGrowthMini('cv', ['1', '2'], [1000, 250000], '#123456');
    expect(c.data.datasets[0]).toMatchObject({ data: [1000, 250000], borderColor: '#123456', fill: true });
    expect(c.options.plugins.legend.display).toBe(false);
    expect(tick(c.options.scales.y, 250000)).toBe('250K');
    expect(ayuda(c, { parsed: { y: 250000 } })).toBe(' 250000');
  });
  it('drawGrowthBar: una barra por lote desde 0, en cel/ml completas', () => {
    const c = drawGrowthBar('cv', ['L1', 'L2'], [85000, 120000]);
    expect(c.type).toBe('bar');
    expect(c.data.datasets[0].data).toEqual([85000, 120000]);
    expect(c.options.scales.y.beginAtZero).toBe(true);
    expect(c.options.scales.y.title.text).toBe('cel/ml');
    expect(ayuda(c, { parsed: { y: 85000 } })).toBe(' Densidad: 85000');
  });
});

describe('drawTasa · la tasa de crecimiento específica', () => {
  it('verde si creció, rojo si decreció (cero cuenta como creció)', () => {
    const c = drawTasa('cv', ['L1', 'L2', 'L3'], [0.35, -0.12, 0]);
    expect(c.data.datasets[0].borderColor).toEqual(['#186447', '#CA6378', '#186447']);
    expect(c.data.datasets[0].backgroundColor).toEqual(['#186447cc', '#CA6378cc', '#186447cc']);
  });
  it('el eje en /d, con la línea del cero marcada', () => {
    const y = drawTasa('cv', ['L1'], [0.3]).options.scales.y;
    expect(tick(y, 0.5)).toBe('0.5 /d');
    expect(y.title.text).toBe('μ · tasa específica (día⁻¹)');
    expect(y.grid.color({ tick: { value: 0 } })).not.toBe(y.grid.color({ tick: { value: 0.5 } }));
  });
  it('la ayuda: μ con dos decimales y, con `meta`, duplicaciones, tiempo de duplicación y % total', () => {
    const meta = [{ dbl: 0.5, tDouble: 2, pctTotal: 180, days: 4 }, { dbl: -0.25, tDouble: -1, pctTotal: -30, days: 3 }, { dbl: 0, tDouble: null, pctTotal: 0, days: 1 }];
    const c = drawTasa('cv', ['L1', 'L2', 'L3'], [0.35, -0.17, 0], meta);
    const cb = c.options.plugins.tooltip.callbacks;
    expect(cb.label({ parsed: { y: 0.3456 } })).toBe(' μ = 0.35 /día');
    expect(cb.title([{ label: 'L1' }])).toBe('L1');
    expect(cb.afterBody([{ dataIndex: 0 }])).toEqual(['0.50 duplicaciones/día', 't. duplicación: 2.0 d/dupl.', '+180% total · 4 día(s)']);
    expect(cb.afterBody([{ dataIndex: 1 }])).toEqual(['−0.25 duplicaciones/día', 't. duplicación: decrece', '-30% total · 3 día(s)']);
    expect(cb.afterBody([{ dataIndex: 2 }])[1]).toBe('t. duplicación: —');
    expect(drawTasa('cv', ['L1'], [0.3]).options.plugins.tooltip.callbacks.afterBody([{ dataIndex: 0 }]), 'sin meta, nada más').toBe('');
  });
});

describe('drawProto · protozoarios, ciliados y filamentosos con su límite', () => {
  // un gráfico de mentira: el eje Y convierte valor → píxel (y = 200 − 10·v) y el contexto apunta lo que se dibuja
  const lienzo = () => {
    const hecho = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'fillText' || k === 'moveTo' || k === 'lineTo') ? (...a) => hecho.push([k, ...a]) : () => {}, set: () => true });
    return { hecho, chart: { ctx, chartArea: { left: 10, right: 310, top: 0, bottom: 200 }, scales: { y: { getPixelForValue: (v) => 200 - 10 * v } } } };
  };
  it('tres líneas con sus nombres y colores; eje «nº por campo» desde 0, enteros', () => {
    const c = drawProto('cv', DIAS, [1, 6, 2], [0, 1, 0], [3, 2, 1]);
    expect(c.data.datasets.map((d) => [d.label, d.borderColor])).toEqual([['Protozoarios', '#CA6378'], ['Ciliados', '#015B76'], ['Filamentosos', '#739842']]);
    expect(c.data.datasets[0].data).toEqual([1, 6, 2]);
    expect(c.options.scales.y).toMatchObject({ beginAtZero: true, ticks: { precision: 0 }, title: { text: 'nº por campo' } });
    expect(ayuda(c, { parsed: { y: 6 } })).toBe(' 6.0');
  });
  it('🔴 la línea de referencia va a la altura del LÍMITE y dice «obj < límite» (5 por defecto, o el que se pase)', () => {
    for (const [limite, texto] of [[undefined, 'obj < 5'], [8, 'obj < 8']]) {
      const c = limite === undefined ? drawProto('cv', DIAS, [1], [0], [0]) : drawProto('cv', DIAS, [1], [0], [0], limite);
      const { hecho, chart } = lienzo();
      c.plugins[0].beforeDatasetsDraw(chart);
      const alto = 200 - 10 * (limite || 5);
      expect(hecho).toContainEqual(['moveTo', 10, alto]);
      expect(hecho).toContainEqual(['lineTo', 310, alto]);
      expect(hecho.find((h) => h[0] === 'fillText')[1]).toBe(texto);
    }
  });
  it('sin eje (aún no montado), no dibuja nada ni falla', () => {
    const c = drawProto('cv', DIAS, [1], [0], [0]);
    const { hecho, chart } = lienzo();
    c.plugins[0].beforeDatasetsDraw({ ...chart, scales: {} });
    expect(hecho).toEqual([]);
  });
  it('el eje X por fecha: el número de día y, de título, el mes', () => {
    const x = drawProto('cv', DIAS, [1, 1, 1], [0, 0, 0], [0, 0, 0]).options.scales.x;
    expect(tick(x, null, 1)).toBe(dayNum(DIAS[1]));
    expect(x.title.text).toBe(rangeLabel(DIAS));
  });
});

describe('las barras horizontales', () => {
  it('drawUsoSistema: una barra por sistema con SU color, en nº de registros', () => {
    const c = drawUsoSistema('cv', ['Masivos', 'PBR'], [12, 3], [CAT_COLOR.Masivos, CAT_COLOR.PBR]);
    expect(c.options.indexAxis).toBe('y');
    expect(c.data.datasets[0].borderColor).toEqual([CAT_COLOR.Masivos, CAT_COLOR.PBR]);
    expect(c.options.scales.x.title.text).toBe('nº de registros');
    expect(ayuda(c, { parsed: { x: 3 } })).toBe(' 3 registro(s)');
  });
  it('drawModuloBiomasa: un color de la paleta por módulo, en Σ cel/ml completas', () => {
    const c = drawModuloBiomasa('cv', ['M01', 'M02'], [900000, 450000]);
    expect(c.data.datasets[0].borderColor).toEqual([algColor(0), algColor(1)]);
    expect(c.options.scales.x.title.text).toBe('Σ cel/ml');
    expect(tick(c.options.scales.x, 900000)).toBe('900000');
    expect(ayuda(c, { parsed: { x: 450000 } })).toBe(' 450000 cel/ml');
  });
  it('drawSanitBars: el % de análisis en alerta, de 0 a 100, con el color del peor nivel de cada patógeno', () => {
    const c = drawSanitBars('cv', ['Vibrio', 'Hongos'], [12.5, 0], ['#e8303e', '#1ec86a']);
    expect(c.data.datasets[0].borderColor).toEqual(['#e8303e', '#1ec86a']);
    expect([c.options.scales.x.min, c.options.scales.x.max]).toEqual([undefined, 100]);
    expect(tick(c.options.scales.x, 40)).toBe('40%');
    expect(ayuda(c, { parsed: { x: 12.5 } })).toBe(' 12.5% en alerta');
  });
  it('drawDispatchBars: litros por módulo', () => {
    const c = drawDispatchBars('cv', ['M01'], [1200]);
    expect(c.options.indexAxis).toBe('y');
    expect(c.options.scales.x.title.text).toBe('Litros');
    expect(ayuda(c, { parsed: { x: 1200 } })).toBe(' 1200 L');
  });
});

describe('drawDescClases · el descarte por clase, apilado', () => {
  const CLASES = [{ clave: 'bueno', etiqueta: 'Por bueno', color: '#111111' }, { clave: 'nouso', etiqueta: 'Por no uso', color: '#222222' }];
  it('un tramo por clase, en su orden y color, apilados en %', () => {
    const c = drawDescClases('cv', ['Masivos', 'PBR'], { bueno: [5, 2], nouso: [1, 0] }, CLASES);
    expect(c.data.datasets.map((d) => [d.label, d.data, d.borderColor, d.stack])).toEqual([
      ['Por bueno', [5, 2], '#111111', 'desc'], ['Por no uso', [1, 0], '#222222', 'desc']]);
    expect([c.options.scales.y.stacked, c.options.scales.x.stacked]).toEqual([true, true]);
    expect(tick(c.options.scales.y, 6)).toBe('6%');
    expect(ayuda(c, { dataset: { label: 'Por bueno' }, parsed: { y: 5 } })).toBe(' Por bueno: 5.0%');
  });
  it('por fechas: el eje X es el de días (número del día, mes de título), y sigue apilado', () => {
    const x = drawDescClases('cv', DIAS, { bueno: [1, 2, 3], nouso: [0, 0, 0] }, CLASES, true).options.scales.x;
    expect(x.stacked).toBe(true);
    expect(tick(x, null, 2)).toBe(dayNum(DIAS[2]));
    expect(x.title.text).toBe(rangeLabel(DIAS));
  });
});

describe('drawDaily · la serie diaria (salinidad, pH, luz…)', () => {
  it('con su unidad en el eje y en la ayuda; sin ruido de coma flotante en el eje', () => {
    const c = drawDaily('cv', DIAS, [22.9, 22.95, 22.98], 'Temperatura', '#123456', ' °C');
    expect(c.data.datasets[0]).toMatchObject({ label: 'Temperatura', data: [22.9, 22.95, 22.98], borderColor: '#123456' });
    expect(tick(c.options.scales.y, 22.9000000000002)).toBe('22.9 °C');
    expect(ayuda(c, { parsed: { y: 22.96 } })).toBe(' 23.0 °C');
    expect(ayuda(c, { parsed: { y: null } })).toBe(' —');
  });
  it('`zero` fuerza la base en 0 (para no exagerar variaciones); sin él, autoescala', () => {
    expect(drawDaily('cv', DIAS, [1, 2, 3], '% descarte', '#123456', '%', true).options.scales.y.beginAtZero).toBe(true);
    expect(drawDaily('cv', DIAS, [1, 2, 3], 'pH', '#123456').options.scales.y.beginAtZero).toBe(false);
  });
});

describe('drawCellQuality · la composición celular', () => {
  const series = { vacias: [10, 0], semillenas: [20, 0], alargadas: [30, 0], muertas: [40, 0] };
  it('cada día en % de sus células (suman 100); un día sin células, todo 0', () => {
    const c = drawCellQuality('cv', ['01/10/2026', '02/10/2026'], series);
    expect(c.data.datasets.map((d) => d.label)).toEqual(['Vacías', 'Semillenas', 'Alargadas', 'Muertas']);
    expect(c.data.datasets.map((d) => d.data[0])).toEqual([10, 20, 30, 40]);
    expect(c.data.datasets.map((d) => d.data[1])).toEqual([0, 0, 0, 0]);
    expect([c.options.scales.y.min, c.options.scales.y.max, c.options.scales.y.stacked]).toEqual([0, 100, true]);
  });
  it('«Muertas» en tono negativo, distinto de las demás', () => {
    const c = drawCellQuality('cv', ['01/10/2026'], { vacias: [1], semillenas: [1], alargadas: [1], muertas: [1] });
    const muertas = c.data.datasets[3].borderColor;
    expect(c.data.datasets.slice(0, 3).map((d) => d.borderColor)).not.toContain(muertas);
  });
  it('la ayuda da el % y el conteo crudo', () => {
    const c = drawCellQuality('cv', ['01/10/2026', '02/10/2026'], series);
    const d = c.data.datasets[3];
    expect(ayuda(c, { dataset: d, dataIndex: 0, parsed: { y: 40 } })).toBe(' Muertas: 40% (40)');
    expect(ayuda(c, { dataset: { label: 'X' }, dataIndex: 0, parsed: { y: 5 } }), 'sin conteo crudo, sólo el %').toBe(' X: 5%');
  });
});
