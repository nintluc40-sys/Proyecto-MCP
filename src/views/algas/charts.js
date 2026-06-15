/* ============================================================
   ALGAS · constructores de gráficos (Chart.js gestionado)
   Reciben datos YA extraídos (no tocan filas crudas): el índice arma las
   series y aquí solo se dibuja. Eje de día de proceso (crecimiento/velocidad)
   y eje de fecha (protozoarios/salinidad/pH/luz, estilo Larvicultura).
   ============================================================ */
import { makeChart } from '../../core/charts.js';
import { dayNum, rangeLabel } from '../../core/dates.js';

export const ALG_PAL = ['#2E7D32', '#1E88E5', '#8E24AA', '#FB8C00', '#00ACC1', '#6D4C41', '#C0CA33', '#5E35B1', '#E53935', '#00897B', '#3949AB', '#F4511E', '#43A047', '#AD1457'];
export const algColor = (i) => ALG_PAL[i % ALG_PAL.length];
// Color por categoría de sistema (compartido por la sección de análisis).
export const CAT_COLOR = { Masivos: '#2E7D32', Premasivos: '#43A047', Fundas: '#1E88E5', Carboys: '#FB8C00', PBR: '#8E24AA', Otros: '#90A4AE' };

const fmtK = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(Math.round(v));
};

// Eje X por fecha (cruda): nº de día + mes/año como subtítulo (estilo Larvicultura).
const dateAxis = (days) => ({
  ticks: { callback: (v, i) => dayNum(days[i]), maxRotation: 0, font: { size: 11, weight: '700' } },
  grid: { display: false },
  title: { display: !!rangeLabel(days), text: rangeLabel(days), color: '#78909c', font: { size: 10.5, weight: '700' } },
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
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtK(v) }, title: { display: true, text: 'cel/ml' } }, x: { grid: { display: false }, title: { display: true, text: 'Día de proceso' } } },
      plugins: {
        legend: { labels: { boxWidth: 10, font: { size: 9 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : fmtK(c.parsed.y)}` } },
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
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtK(v) }, title: { display: true, text: 'cel/ml' } }, x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 30 } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' Densidad: ' + fmtK(c.parsed.y) + ' cel/ml' } } },
    },
  });
}

/** Velocidad de crecimiento (% por día · línea por lote). */
export function drawVelocity(canvasId, dayLabels, series) {
  const datasets = series.map((s, i) => { const col = algColor(i); return { label: s.label, data: s.data, borderColor: col, backgroundColor: col + '22', tension: .3, pointRadius: 2, spanGaps: true, borderWidth: 2 }; });
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: dayLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { ticks: { callback: (v) => v + '%' }, title: { display: true, text: '% crecimiento' }, grid: { color: (c) => (c.tick.value === 0 ? '#90a4ae' : '#eceff1') } }, x: { grid: { display: false }, title: { display: true, text: 'Día de proceso' } } },
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 9 } } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1) + '%'}` } } },
    },
  });
}

/** Protozoarios + Ciliados + Filamentosos (línea por día). El `limit` (protozoarios)
 *  se dibuja como BANDA/zona aceptable + línea de límite (estilo gráfico de tanque),
 *  no como una serie en la leyenda. */
export function drawProto(canvasId, days, proto, ciliados, filamentosos, limit = 5) {
  const mk = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color + '22', tension: .3, pointRadius: 2, spanGaps: true, borderWidth: 2 });
  const limitBand = {
    id: 'algProtoLimit',
    beforeDatasetsDraw(chart) {
      const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
      const py = y.getPixelForValue(limit); if (isNaN(py)) return;
      const ctx = chart.ctx; ctx.save();
      const top = Math.max(ca.top, py);
      // Zona aceptable (≤ límite) sombreada en verde tenue.
      ctx.fillStyle = 'rgba(46,158,91,.10)';
      ctx.fillRect(ca.left, top, ca.right - ca.left, ca.bottom - top);
      // Línea de límite (punteada).
      ctx.strokeStyle = 'rgba(229,57,53,.7)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(ca.left, py); ctx.lineTo(ca.right, py); ctx.stroke();
      if (py > ca.top + 10 && py < ca.bottom) {
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(229,57,53,.9)'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('Límite ' + limit, ca.right - 5, py - 3);
      }
      ctx.restore();
    },
  };
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: days, datasets: [mk('Protozoarios', proto, '#E53935'), mk('Ciliados', ciliados, '#8E24AA'), mk('Filamentosos', filamentosos, '#00897B')] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'nº por campo' } }, x: dateAxis(days) },
      plugins: { legend: { labels: { boxWidth: 11, font: { size: 10 } } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1)}` } } },
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

/** Serie diaria genérica (Salinidad / pH / Luz). */
export function drawDaily(canvasId, days, values, label, color, unit = '') {
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: days, datasets: [{ label, data: values, borderColor: color, backgroundColor: color + '22', tension: .3, pointRadius: 2.5, fill: true, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: false, ticks: { callback: (v) => v + unit } }, x: dateAxis(days) },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${label}: ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1) + unit}` } } },
    },
  });
}
