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
export const ALG_PAL = ['#015B76', '#739842', '#CA6378', '#186447', '#A06B27', '#4F8DA0', '#9CB36A', '#D49AAA', '#2E7D5E', '#C39A6A', '#2A6E84', '#5E7A3C', '#A86F84', '#46705C'];
export const algColor = (i) => ALG_PAL[i % ALG_PAL.length];
// Color por categoría de sistema (compartido por la sección de análisis).
export const CAT_COLOR = { Masivos: '#186447', Premasivos: '#739842', Fundas: '#015B76', Carboys: '#A06B27', PBR: '#CA6378', Otros: '#B7A59B' };

const fmtK = (v) => {
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

// Eje X por fecha (cruda): nº de día + mes/año como subtítulo (estilo Larvicultura).
const dateAxis = (days) => ({
  ticks: { callback: (v, i) => dayNum(days[i]), maxRotation: 0, color: AXIS_TICK.color, font: { size: 11, weight: '700' } },
  grid: { display: false },
  title: { display: !!rangeLabel(days), text: rangeLabel(days), color: AXIS_TITLE.color, font: { size: 10.5, weight: '700' } },
});

/** Densidad media por corrida (barras). */
export function drawDensidadCorrida(canvasId, labels, values) {
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels: labels.map((c) => 'C' + c), datasets: [{ label: 'Densidad media', data: values, backgroundColor: labels.map((_, i) => algColor(i) + 'cc'), borderColor: labels.map((_, i) => algColor(i)), borderWidth: 1, borderRadius: 5, maxBarThickness: 64 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtK(v) }, title: { display: true, text: 'cel/ml' } }, x: { grid: { display: false }, title: { display: true, text: 'Corrida' } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' Densidad: ' + fmtK(c.parsed.y) + ' cel/ml' } } },
    },
  });
}

/** Curva de crecimiento (línea por lote · eje = día de proceso). */
export function drawGrowth(canvasId, dayLabels, series) {
  const datasets = series.map((s, i) => { const col = algColor(i); return { label: s.label, data: s.data, borderColor: col, backgroundColor: col + '22', tension: .3, pointRadius: 2, spanGaps: true, borderWidth: 2 }; });
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: dayLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, right: 10 } },
      scales: {
        // Auto-escala (sin forzar 0) + margen 8% → resalta las variaciones diarias.
        // Valores cel/ml COMPLETOS (80000, 145000), no abreviados.
        y: { grace: '8%', ticks: { callback: (v) => fmtFull(v), color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'cel/ml', color: AXIS_TITLE.color, font: AXIS_TITLE.font }, grid: { color: 'rgba(120,144,156,.15)' } },
        x: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: 'Día de proceso', color: AXIS_TITLE.color, font: AXIS_TITLE.font } },
      },
      plugins: {
        legend: { labels: LINE_LEGEND },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : fmtFull(c.parsed.y)}` } },
      },
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

/** Tasa de crecimiento: una barra por lote = % ganado del inicial al final
 *  (densidad final − inicial)/inicial ×100. Verde si creció, rojo si decreció.
 *  El eje ya indica %, por eso el tooltip muestra solo el número. */
export function drawTasa(canvasId, labels, values) {
  const colors = values.map((v) => (v >= 0 ? '#186447' : '#CA6378'));
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Tasa', data: values, backgroundColor: colors.map((c) => c + 'cc'), borderColor: colors, borderWidth: 1, borderRadius: 4, maxBarThickness: 46 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 4, right: 10 } },
      scales: {
        y: { ticks: { callback: (v) => v + '%', color: AXIS_TICK.color, font: AXIS_TICK.font }, title: { display: true, text: '% crecimiento (inicial→final)', color: AXIS_TITLE.color, font: AXIS_TITLE.font }, grid: { color: (c) => (c.tick.value === 0 ? '#90a4ae' : 'rgba(120,144,156,.15)') } },
        x: { grid: { display: false }, ticks: { color: AXIS_TICK.color, font: AXIS_TICK.font, maxRotation: 30 } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1)}` } } },
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
      scales: { y: { beginAtZero: zero, ticks: { callback: (v) => v + unit, color: AXIS_TICK.color, font: AXIS_TICK.font } }, x: dateAxis(days) },
      // Tooltip sin la palabra de la serie (el título de la tarjeta ya la indica).
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1) + unit}` } } },
    },
  });
}
