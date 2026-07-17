/* ============================================================
   ALGAS · constructores de gráficos (Chart.js gestionado)
   Reciben datos YA extraídos (no tocan filas crudas): el índice arma las
   series y aquí solo se dibuja. Eje de día de proceso (crecimiento/velocidad)
   y eje de fecha (protozoarios/salinidad/pH/luz, estilo Larvicultura).
   ============================================================ */
import { makeChart } from '../../core/charts.js';
import { dayNum, rangeLabel } from '../../core/dates.js';

// Paleta "Algas" cohesionada (tonos bajos, en sintonía con el resto de vistas):
// anclas teal/oliva/rosa/verde/ocre + variantes apagadas para hasta 14 líneas.
const ALG_PAL = ['#015B76', '#739842', '#CA6378', '#186447', '#A06B27', '#4F8DA0', '#9CB36A', '#D49AAA', '#2E7D5E', '#C39A6A', '#2A6E84', '#5E7A3C', '#A86F84', '#46705C'];
export const algColor = (i) => ALG_PAL[i % ALG_PAL.length];
// Color por categoría de sistema (compartido por la sección de análisis).
export const CAT_COLOR = { Masivos: '#186447', Premasivos: '#739842', Fundas: '#015B76', Carboys: '#A06B27', PBR: '#CA6378', Otros: '#B7A59B' };

export const fmtK = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(Math.round(v));
};

// Estilo de ejes con MÁS contraste: los ticks por defecto (#546e7a/#78909c) se
// perciben "borrosos"; subimos color y peso (la resolución ya es 2× por DPR).
const AXIS_TICK = { color: '#37474f', font: { size: 11, weight: '600' } };
const AXIS_TITLE = { color: '#455a64', font: { size: 11, weight: '700' } };
// Leyenda como SEGMENTO DE LÍNEA del color de la serie (no un cuadrito), clicable.
const LINE_LEGEND = { usePointStyle: true, pointStyle: 'line', boxWidth: 24, boxHeight: 0, font: { size: 10 }, color: '#37474f' };
// Número COMPLETO sin abreviar ni separador de miles (80000, 145000).
const fmtFull = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : String(Math.round(v));
// Tick decimal LIMPIO: Chart.js autoescala ejes de rango estrecho (p.ej. Temperatura
// 22.90…22.98) y arrastra ruido de coma flotante (22.9000000000002). Redondeamos a un
// máx. de 2 decimales y descartamos ceros finales (+toFixed) para preservar la linealidad.
const fmtTick = (v) => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(2) : v;

// Eje X por fecha (cruda): nº de día + mes/año como subtítulo (estilo Larvicultura).
const dateAxis = (days) => ({
  ticks: { callback: (v, i) => dayNum(days[i]), maxRotation: 0, color: AXIS_TICK.color, font: { size: 11, weight: '700' } },
  grid: { display: false },
  title: { display: !!rangeLabel(days), text: rangeLabel(days), color: AXIS_TITLE.color, font: { size: 10.5, weight: '700' } },
});

/** Leyenda HTML en chips: cada serie es un recuadro (píldora) tintado con el color
 *  de su línea, con el nombre dentro. Clic = oculta/muestra esa línea. Reemplaza la
 *  leyenda nativa (display:false) y se rellena en el contenedor `legendId`. */
function htmlChipLegend(legendId) {
  return {
    id: 'algChipLegend',
    afterUpdate(chart) {
      const box = document.getElementById(legendId);
      if (!box) return;
      box.innerHTML = '';
      chart.data.datasets.forEach((ds, i) => {
        const col = ds.borderColor || '#015B76';
        const visible = chart.isDatasetVisible(i);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'alg-leg-chip' + (visible ? '' : ' is-off');
        chip.style.borderColor = col;
        chip.style.background = col + (visible ? '22' : '11');
        chip.style.color = '#37474f';
        chip.textContent = ds.label;
        chip.title = (visible ? 'Ocultar ' : 'Mostrar ') + ds.label;
        chip.addEventListener('click', () => { chart.setDatasetVisibility(i, !chart.isDatasetVisible(i)); chart.update(); });
        box.appendChild(chip);
      });
    },
  };
}

/** Curva de crecimiento (línea por lote · eje = día de proceso).
 *  `legendId` (opcional) = contenedor para la leyenda en chips de color; si se omite,
 *  usa la leyenda nativa de segmentos de línea.
 *  `opts.norm` = normaliza cada serie a % de su propio pico (compara la FORMA del crecimiento). */
export function drawGrowth(canvasId, dayLabels, series, legendId, opts = {}) {
  const norm = !!opts.norm;
  const proc = norm
    ? series.map((s) => { const vals = s.data.filter((v) => v !== null && v !== undefined); const mx = vals.length ? Math.max(...vals) : 0; return { label: s.label, data: s.data.map((v) => (v === null || v === undefined || !mx) ? null : +(v / mx * 100).toFixed(1)) }; })
    : series;
  const datasets = proc.map((s, i) => { const col = algColor(i); return { label: s.label, data: s.data, borderColor: col, backgroundColor: col + '22', tension: .3, pointRadius: 2, spanGaps: true, borderWidth: 2 }; });
  const yScale = norm
    ? { min: 0, max: 105, ticks: { callback: (v) => v + '%', color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: '% del pico', color: AXIS_TITLE.color, font: AXIS_TITLE.font }, grid: { color: 'rgba(120,144,156,.15)' } }
    // Auto-escala (sin forzar 0) + margen 8% → resalta las variaciones diarias. Valores COMPLETOS.
    : { grace: '8%', ticks: { callback: (v) => fmtFull(v), color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'cel/ml', color: AXIS_TITLE.color, font: AXIS_TITLE.font }, grid: { color: 'rgba(120,144,156,.15)' } };
  const tipLabel = norm ? (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : c.parsed.y + '%'}` : (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : fmtFull(c.parsed.y)}`;
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: dayLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, right: 10 } },
      scales: {
        y: yScale,
        x: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'Día de proceso', color: AXIS_TITLE.color, font: AXIS_TITLE.font } },
      },
      plugins: {
        legend: legendId ? { display: false } : { labels: LINE_LEGEND },
        tooltip: { callbacks: { label: tipLabel } },
      },
    },
    plugins: legendId ? [htmlChipLegend(legendId)] : [],
  });
}

/** Mini-curva (small-multiples): una línea compacta por lote/sistema, sin leyenda. */
export function drawGrowthMini(canvasId, dayLabels, data, color) {
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: dayLabels, datasets: [{ data, borderColor: color, backgroundColor: color + '22', tension: .3, pointRadius: 1.5, spanGaps: true, borderWidth: 2, fill: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { grace: '10%', ticks: { callback: (v) => fmtK(v), font: { size: 9 }, color: AXIS_TICK.color, maxTicksLimit: 4 }, grid: { color: 'rgba(120,144,156,.12)' } },
        x: { ticks: { font: { size: 9 }, color: AXIS_TICK.color, maxTicksLimit: 5 }, grid: { display: false } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + fmtFull(c.parsed.y) } } },
    },
  });
}

/** Crecimiento como BARRAS (sistemas sin tendencia: Fundas de producción / Carboys).
 *  Una barra por lote = densidad pico registrada. */
export function drawGrowthBar(canvasId, labels, values, color = '#2E7D32') {
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Densidad', data: values, backgroundColor: color + 'cc', borderColor: color, borderWidth: 1, borderRadius: 4, maxBarThickness: 46 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      // Valores cel/ml COMPLETOS (85000), no abreviados — coherente con la curva.
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtFull(v), color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'cel/ml', color: AXIS_TITLE.color, font: AXIS_TITLE.font } }, x: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: { size: 10 }, maxRotation: 30 } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' Densidad: ' + fmtFull(c.parsed.y) } } },
    },
  });
}

/** Tasa de crecimiento ESPECÍFICA: una barra por lote = μ (día⁻¹) = ln(final/inicial)/días.
 *  Verde si creció, rojo si decreció. `meta[i]` (opcional) añade al tooltip las
 *  duplicaciones/día, el tiempo de duplicación y el % total, que son la lectura
 *  práctica de μ para el laboratorio. */
export function drawTasa(canvasId, labels, values, meta = null) {
  const colors = values.map((v) => (v >= 0 ? '#186447' : '#CA6378'));
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'μ', data: values, backgroundColor: colors.map((c) => c + 'cc'), borderColor: colors, borderWidth: 1, borderRadius: 4, maxBarThickness: 46 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 4, right: 10 } },
      scales: {
        y: { ticks: { callback: (v) => v + ' /d', color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'μ · tasa específica (día⁻¹)', color: AXIS_TITLE.color, font: AXIS_TITLE.font }, grid: { color: (c) => (c.tick.value === 0 ? '#90a4ae' : 'rgba(120,144,156,.15)') } },
        x: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: AXIS_TICK.font, maxRotation: 30 } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => items.length ? String(items[0].label) : '',
          label: (c) => ` μ = ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(2)} /día`,
          afterBody: (items) => {
            const m = meta && items.length ? meta[items[0].dataIndex] : null;
            if (!m) return '';
            const dbl = (m.dbl >= 0 ? '' : '−') + Math.abs(m.dbl).toFixed(2);
            const td = (m.tDouble === null || m.tDouble === undefined) ? '—'
              : (m.tDouble > 0 ? m.tDouble.toFixed(1) + ' d/dupl.' : 'decrece');
            const pct = (m.pctTotal >= 0 ? '+' : '') + m.pctTotal.toFixed(0) + '%';
            return [`${dbl} duplicaciones/día`, `t. duplicación: ${td}`, `${pct} total · ${m.days} día(s)`];
          },
        } },
      },
    },
  });
}

/** Protozoarios + Ciliados + Filamentosos (línea por día). El `limit` (protozoarios)
 *  se marca SOLO con una línea de referencia "obj" (sin banda sombreada). */
export function drawProto(canvasId, days, proto, ciliados, filamentosos, limit = 5) {
  const mk = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color + '22', tension: .3, pointRadius: 2, spanGaps: true, borderWidth: 2 });
  const limitBand = {
    id: 'algProtoLimit',
    beforeDatasetsDraw(chart) {
      const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
      const py = y.getPixelForValue(limit); if (isNaN(py)) return;
      const ctx = chart.ctx; ctx.save();
      // Solo línea de referencia gris punteada + etiqueta "obj" (sin banda sombreada).
      ctx.strokeStyle = 'rgba(120,144,156,.75)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(ca.left, py); ctx.lineTo(ca.right, py); ctx.stroke();
      if (py > ca.top + 10 && py < ca.bottom) {
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(96,125,139,.95)'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('obj < ' + limit, ca.right - 5, py - 3);
      }
      ctx.restore();
    },
  };
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: days, datasets: [mk('Protozoarios', proto, '#CA6378'), mk('Ciliados', ciliados, '#015B76'), mk('Filamentosos', filamentosos, '#739842')] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, ticks: { precision: 0, color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'nº por campo', color: AXIS_TITLE.color, font: AXIS_TITLE.font } }, x: dateAxis(days) },
      // Tooltip sin la palabra de la serie (el color de cada línea ya la identifica).
      plugins: { legend: { labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 18, boxHeight: 0, font: { size: 10 } } }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1)}` } } },
    },
    plugins: [limitBand],
  });
}

/** Uso por sistema (barras horizontales) — ¿qué sistema se hace más? Color por categoría. */
export function drawUsoSistema(canvasId, labels, values, colors) {
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Registros', data: values, backgroundColor: colors.map((c) => c + 'cc'), borderColor: colors, borderWidth: 1, borderRadius: 4, maxBarThickness: 30 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'nº de registros' } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.x} registro(s)` } } },
    },
  });
}

/** Biomasa por módulo de larvicultura (barras horizontales · Σ cel/ml). */
export function drawModuloBiomasa(canvasId, labels, values) {
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Biomasa', data: values, backgroundColor: labels.map((_, i) => algColor(i) + 'cc'), borderColor: labels.map((_, i) => algColor(i)), borderWidth: 1, borderRadius: 4, maxBarThickness: 30 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { beginAtZero: true, ticks: { callback: (v) => fmtFull(v), color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'Σ cel/ml', color: AXIS_TITLE.color, font: AXIS_TITLE.font } }, y: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: AXIS_TICK.font } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + fmtFull(c.parsed.x) + ' cel/ml' } } },
    },
  });
}

/** % por categoría (barras verticales) — usado por Tasa de descarte. Color por severidad. */
export function drawCatPct(canvasId, labels, values) {
  const colors = values.map((v) => (v >= 20 ? '#CA6378' : v >= 10 ? '#A06B27' : '#186447'));
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ label: '%', data: values, backgroundColor: colors.map((c) => c + 'cc'), borderColor: colors, borderWidth: 1, borderRadius: 4, maxBarThickness: 48 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%', color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: '% descarte', color: AXIS_TITLE.color, font: AXIS_TITLE.font } }, x: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: AXIS_TICK.font } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + c.parsed.y.toFixed(1) + '%' } } },
    },
  });
}

/** Serie diaria genérica (Salinidad / pH / Luz / Temperatura / Descarte).
 *  `zero` = forzar base en 0 (p.ej. % de descarte, para no exagerar variaciones). */
export function drawDaily(canvasId, days, values, label, color, unit = '', zero = false) {
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: days, datasets: [{ label, data: values, borderColor: color, backgroundColor: color + '22', tension: .3, pointRadius: 2.5, fill: true, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: zero, ticks: { callback: (v) => fmtTick(v) + unit, color: AXIS_TICK.color, font: AXIS_TICK.font } }, x: dateAxis(days) },
      // Tooltip sin la palabra de la serie (el título de la tarjeta ya la indica).
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1) + unit}` } } },
    },
  });
}

// Composición celular: Vacías/Semillenas/Alargadas en tonos neutros; "Muertas" en tono
// negativo (rojo-ladrillo). Antes el header era "En División" (verde óptimo #186447);
// al renombrarse la columna a "Muertas" ese verde-mejor pasó a ser engañoso.
const CELL_COLORS = { vacias: '#B7A59B', semillenas: '#A06B27', alargadas: '#4F8DA0', llenas: '#8A4B4B' };
const CELL_LABELS = { vacias: 'Vacías', semillenas: 'Semillenas', alargadas: 'Alargadas', llenas: 'Muertas' };

/** Calidad morfológica: barras APILADAS al 100% con la proporción de células
 *  Vacías/Semillenas/Alargadas/Llenas por día. `series` = {vacias,semillenas,alargadas,
 *  llenas} (conteos por día, alineados a `days`). El tooltip muestra % y el conteo crudo. */
export function drawCellQuality(canvasId, days, series) {
  const keys = ['vacias', 'semillenas', 'alargadas', 'llenas'];
  const totals = days.map((_, i) => keys.reduce((s, k) => s + (series[k][i] || 0), 0));
  const datasets = keys.map((k) => ({
    label: CELL_LABELS[k],
    data: days.map((_, i) => totals[i] > 0 ? +((series[k][i] || 0) / totals[i] * 100).toFixed(1) : 0),
    _raw: series[k],
    backgroundColor: CELL_COLORS[k] + 'e0', borderColor: CELL_COLORS[k], borderWidth: 1, maxBarThickness: 46,
  }));
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels: days, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: Object.assign({ stacked: true }, dateAxis(days)),
        y: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => v + '%', color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: '% de células', color: AXIS_TITLE.color, font: AXIS_TITLE.font }, grid: { color: 'rgba(120,144,156,.15)' } },
      },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, font: { size: 10 }, color: '#37474f' } },
        tooltip: { callbacks: { title: () => '', label: (c) => { const raw = c.dataset._raw ? c.dataset._raw[c.dataIndex] : null; return ` ${c.dataset.label}: ${c.parsed.y}%${(raw != null && !isNaN(raw)) ? ' (' + fmtFull(raw) + ')' : ''}`; } } },
      },
    },
  });
}

/** Litros despachados por módulo: barras HORIZONTALES (una por módulo). */
export function drawDispatchBars(canvasId, labels, values, color = '#015B76') {
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Litros', data: values, backgroundColor: color + 'cc', borderColor: color, borderWidth: 1, borderRadius: 4, maxBarThickness: 30 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v) => fmtFull(v), color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'Litros', color: AXIS_TITLE.color, font: AXIS_TITLE.font }, grid: { color: 'rgba(120,144,156,.15)' } },
        y: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: AXIS_TICK.font } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + fmtFull(c.parsed.x) + ' L' } } },
    },
  });
}
