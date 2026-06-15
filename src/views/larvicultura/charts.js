/* ============================================================
   LARVICULTURA · constructores de gráficos (radar + evolución)
   ============================================================ */
import { makeChart } from '../../core/charts.js';
import { larviColor } from '../../core/format.js';
import { dayNum, rangeLabel } from '../../core/dates.js';
import { SEM } from './palette.js';

/** Radar del último estado (un punto por variable, 0–100, menor = mejor).
 *  opts: { prev (penúltimo estado para Δ), level ('verde'|'ambar'|'rojo') para el relleno }. */
const RADAR_FILL = { verde: SEM.optimo + '29', ambar: SEM.atencion + '2e', rojo: SEM.critico + '29' };
const RADAR_BORDER = { verde: SEM.optimo, ambar: SEM.atencion, rojo: SEM.critico };
const RADAR_OBJ = 25; // límite de la zona Óptimo (larviZone ≤ 25)
export function radarChart(canvasId, last, vars, opts = {}) {
  const { level = 'verde' } = opts;
  // Variable sin dato → null (hueco), NO 0: en esta escala "menor = mejor", un 0
  // se leería como óptimo (verde) y haría parecer perfecta una variable sin registro.
  const data = vars.map((v) => (last[v.key] ?? null));
  const colors = vars.map((v) => larviColor(last[v.key]));
  return makeChart(canvasId, {
    type: 'radar',
    data: {
      labels: vars.map((v) => v.short),
      datasets: [
        // Polígono objetivo (límite óptimo): lo que quede DENTRO está en óptimo.
        { label: 'Límite óptimo', data: vars.map(() => RADAR_OBJ), fill: false, borderColor: 'rgba(120,144,156,.7)', borderDash: [4, 3], borderWidth: 1.2, pointRadius: 0 },
        {
          label: 'Estado actual',
          data,
          fill: true,
          backgroundColor: RADAR_FILL[level] || RADAR_FILL.verde,
          borderColor: RADAR_BORDER[level] || '#00838F',
          pointBackgroundColor: colors,
          pointBorderColor: '#fff',
          pointRadius: 5,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, font: { size: 8 } },
          pointLabels: {
            color: '#263238', font: { size: 10, weight: '700' }, padding: 6,
            // Nombre de la variable y, debajo, su valor.
            callback: (lbl, idx) => { const v = vars[idx] ? last[vars[idx].key] : null; return [lbl, (v === null || v === undefined) ? '—' : (v.toFixed(1) + '%')]; },
          },
        },
      },
      plugins: {
        legend: { display: false },
        // Un solo tooltip con TODAS las variables (al pasar por cualquier vértice).
        tooltip: {
          filter: (item) => item.datasetIndex === 1,
          displayColors: false,
          callbacks: {
            title: () => 'Estado actual',
            label: () => vars.map((v) => `${v.short}: ${last[v.key] == null ? '—' : last[v.key].toFixed(1) + '%'}`),
          },
        },
      },
    },
  });
}

/** Media móvil de 3 puntos (suavizado), respetando huecos. */
function smooth3(arr) {
  return arr.map((v, i) => {
    const w = [arr[i - 1], arr[i], arr[i + 1]].filter((x) => x != null && !isNaN(x));
    return w.length ? w.reduce((s, x) => s + x, 0) / w.length : v;
  });
}

/** Líneas de evolución diaria (una serie por variable). `smooth` aplica media móvil. */
export function evolutionChart(canvasId, daily, vars, smooth = false) {
  // Solo días con dato de alguna de las variables (no arrastrar días vacíos al inicio/fin).
  daily = daily.filter((d) => vars.some((v) => d[v.key] != null));
  const labels = daily.map((d) => d.fecha);
  // Variable "peor" hoy (mayor último valor, menor = mejor) → se resalta más gruesa.
  let worstKey = null, worstVal = -Infinity;
  vars.forEach((v) => {
    for (let i = daily.length - 1; i >= 0; i--) { const x = daily[i][v.key]; if (x != null) { if (x > worstVal) { worstVal = x; worstKey = v.key; } break; } }
  });
  // Eje Y sensible: se ajusta al rango real de los datos (con margen) en vez de
  // 0–100 fijo, para que diferencias pequeñas entre porcentajes se aprecien.
  const allVals = [];
  daily.forEach((d) => vars.forEach((v) => { const x = d[v.key]; if (x !== null && x !== undefined && !isNaN(x)) allVals.push(x); }));
  let yMin = 0, yMax = 100;
  if (allVals.length) {
    const lo = Math.min(...allVals), hi = Math.max(...allVals);
    const pad = Math.max((hi - lo) * 0.25, 1.5);
    yMin = Math.max(0, Math.floor(lo - pad));
    yMax = Math.min(100, Math.ceil(hi + pad));
    if (yMin >= yMax) { yMin = Math.max(0, yMin - 2); yMax = Math.min(100, yMax + 2); }
  }
  return makeChart(canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: vars.map((v) => {
        const raw = daily.map((d) => d[v.key]);
        const isWorst = v.key === worstKey;
        return {
          label: v.short + (isWorst ? ' ⚠' : ''),
          data: smooth ? smooth3(raw) : raw,
          borderColor: v.color,
          backgroundColor: v.color + '22',
          tension: smooth ? .45 : .3,
          pointRadius: isWorst ? 3 : 2,
          borderWidth: isWorst ? 3.2 : 1.8,
          spanGaps: true,
          order: isWorst ? 0 : 1,
        };
      }),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { min: yMin, max: yMax, ticks: { callback: (v) => v + '%' } },
        x: {
          // Eje X sólo con el día; el mes/año va como frase debajo (cambia con el rango).
          ticks: { callback: (val, idx) => dayNum(labels[idx]), maxRotation: 0, autoSkip: false, font: { size: 11, weight: '700' } },
          grid: { display: false },
          title: rangeLabel(daily) ? { display: true, text: rangeLabel(daily), color: '#78909c', font: { size: 10.5, weight: '700' }, padding: { top: 6 } } : { display: false },
        },
      },
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } },
    },
  });
}
