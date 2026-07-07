/* ============================================================
   LARVICULTURA · gráficos y datos adicionales
   - Población por tanque (dumbbell inicial vs actual)
   - Score por tanque (lollipop = 70% ICL + 30% Supervivencia)
   - Centro algal (Cel/ml en estadios tempranos)
   - Variables de manejo (Espuma / Suciedad / Recambio)
   - Composición (intestino en Larvas · lípidos en Post-L)
   - Histograma de calidad (Estrés · % Actividad)
   - Historial de observaciones (datos para el modal)
   Aislado de charts.js para una integración quirúrgica.
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow } from '../../core/fields.js';
import { parseAnyDate, dayNum, rangeLabel } from '../../core/dates.js';
import { makeChart } from '../../core/charts.js';
import { avg } from '../../core/util.js';
import { dailySeries, lastState, iclOf, compositeScore } from './compute.js';
import { ACCENT, NEUTRAL, SEM, CAT, catColor } from './palette.js';

const EARLY_STAGES = ['N5', 'Z1', 'Z2', 'Z3', 'M1'];
const fechaSorted = (rows) => [...rows].sort((a, b) => (parseAnyDate(getField(a, F.fecha)) || 0) - (parseAnyDate(getField(b, F.fecha)) || 0));

function lastNum(rows, keys) {
  const s = fechaSorted(rows);
  for (let i = s.length - 1; i >= 0; i--) { const v = parseNum(s[i], keys); if (v !== null) return v; }
  return null;
}

/* ============================================================
   DATOS
   ============================================================ */
/** Población por tanque: { tanque: [{fecha, poblacion}] } ordenado por fecha. */
export function buildPopData(byCor) {
  const map = {};
  byCor.forEach((r) => {
    const tq = getField(r, F.tanque); if (!tq) return;
    const pob = parseNum(r, F.poblacion);
    // Un 0 registrado es un valor REAL (tanque vaciado/agrupado): se incluye para que
    // el gráfico de "Población por tanque" refleje la caída a 0 y no se omita el dato.
    if (pob === null || pob < 0) return;
    (map[tq] ||= []).push({ fecha: getField(r, F.fecha), poblacion: pob, _d: parseAnyDate(getField(r, F.fecha)) });
  });
  Object.values(map).forEach((arr) => arr.sort((a, b) => (a._d || 0) - (b._d || 0)));
  return map;
}

export function popStats(popData) {
  let totalCurr = 0, totalInit = 0, validTanks = 0, bestTank = null, bestVal = -1;
  Object.keys(popData).forEach((k) => {
    const arr = popData[k]; if (!arr.length) return;
    const cur = arr[arr.length - 1].poblacion, ini = arr[0].poblacion;
    totalCurr += cur; totalInit += ini; validTanks++;
    if (cur > bestVal) { bestVal = cur; bestTank = k; }
  });
  const pctLoss = totalInit > 0 ? ((totalInit - totalCurr) / totalInit * 100).toFixed(1) + '%' : '—';
  return { totalCurr, totalInit, pctLoss, validTanks, bestTank };
}

/** Score por tanque = 70% ICL + 30% Supervivencia (mayor = mejor). */
export function buildScoreItems(byCor, tanks, vars) {
  return tanks.map((tq) => {
    const tRows = byCor.filter((r) => getField(r, F.tanque) === tq);
    const last = lastState(dailySeries(tRows, vars), vars);
    const icl = iclOf(last, vars);
    const surv = lastNum(tRows, F.supervivencia);
    return { tank: tq, score: compositeScore(icl, surv), icl, surv };
  }).filter((x) => x.score !== null).sort((a, b) => b.score - a.score);
}

/** Cel/ml por día en estadios tempranos (N5..M1).
 *  `values` = promedio diario (todos los estadios); `series` = una serie por
 *  estadío (N5, Z1, Z2, Z3, M1) alineada a `days` para la vista por estadío. */
export function buildAlgae(byCor) {
  const CEL = ['Cel/ml', 'Cel_ml', 'cel/ml', 'Cel/Ml'];
  const rows = byCor.filter((r) => EARLY_STAGES.includes(getField(r, F.estadio).toUpperCase()));
  const byDay = {}, byStage = {};
  rows.forEach((r) => {
    const cel = parseNum(r, CEL); if (cel === null) return;
    const f = getField(r, F.fecha); if (!f) return;
    const st = getField(r, F.estadio).toUpperCase();
    (byDay[f] ||= []).push(cel);
    ((byStage[st] ||= {})[f] ||= []).push(cel);
  });
  const days = Object.keys(byDay).filter(Boolean).sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const series = EARLY_STAGES.filter((s) => byStage[s]).map((s) => ({
    stage: s,
    data: days.map((d) => (byStage[s][d] ? avg(byStage[s][d]) : null)),
  }));
  return { days, values: days.map((d) => avg(byDay[d])), series };
}

/** Variables de manejo por día: % Espuma / % Suciedad / % Recambio. */
export function buildMgmt(byCor) {
  const byDay = {};
  byCor.forEach((r) => { const f = getField(r, F.fecha); if (!f) return; (byDay[f] ||= []).push(r); });
  const days = Object.keys(byDay).sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const ser = (keys) => days.map((d) => avg(byDay[d].map((r) => parseNum(r, keys))));
  // Último color de agua registrado (campo "Color"), de la fecha más reciente con dato.
  let lastColor = null;
  for (let i = days.length - 1; i >= 0 && lastColor === null; i--) {
    for (const r of byDay[days[i]]) { const c = getField(r, ['Color', 'color', 'COLOR', 'Color_agua']); if (c) { lastColor = c; break; } }
  }
  return {
    days,
    espuma: ser(['% Espuma', 'Espuma', '%Espuma']),
    suciedad: ser(['% Suciedad', 'Suciedad', '%Suciedad']),
    recambio: ser(['% Recambio', 'Recambio', '%Recambio']),
    lastColor,
  };
}

/** Composición diaria: intestino (Larvas) o lípidos (Post-L). */
export function buildComposition(byCor, stage) {
  const byDay = {};
  byCor.forEach((r) => { const f = getField(r, F.fecha); if (!f) return; (byDay[f] ||= []).push(r); });
  const days = Object.keys(byDay).sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const ser = (keys) => days.map((d) => avg(byDay[d].map((r) => parseNum(r, keys))));
  if (stage === 'postl') {
    const lip = ser(['Lípidos', 'Lipidos', 'lipidos']);
    return {
      days,
      stacks: [
        { label: 'Lípidos', color: SEM.optimo, data: lip },
        { label: 'Déficit', color: NEUTRAL, data: lip.map((v) => (v === null ? null : Math.max(0, 100 - v))) },
      ],
    };
  }
  return {
    days,
    stacks: [
      { label: 'Lleno', color: SEM.optimo, data: ser(['Intestino_Lleno', 'IntestinoLleno', 'intestino_lleno']) },
      { label: 'Semilleno', color: SEM.atencion, data: ser(['Intestino_Semilleno', 'intestino_semilleno']) },
      { label: 'Vacío', color: SEM.critico, data: ser(['Intestino_Vacio', 'Intestino_Vacío', 'intestino_vacio']) },
    ],
  };
}

/** Histograma de calidad: variables no representadas en otros gráficos. */
export const HIST_VARS = [{ id: 'estres', label: 'Estrés' }, { id: 'actividad', label: '% Actividad' }];
const HIST_CFG = {
  estres: {
    keys: ['Estrés', 'Estres', 'estrés', 'estres'], dir: 'low',
    bins: [{ t: 3, label: 'Óptimo (0–3)', color: SEM.optimo }, { t: 6, label: 'Atención (4–6)', color: SEM.atencion }, { t: 8, label: 'Alerta (7–8)', color: SEM.alerta }, { t: Infinity, label: 'Crítico (>8)', color: SEM.critico }],
  },
  actividad: {
    keys: ['% Actividad', 'Actividad', '%Actividad'], dir: 'high',
    bins: [{ t: 90, label: 'Óptimo (≥90)', color: SEM.optimo }, { t: 75, label: 'Bueno (75–90)', color: SEM.bueno }, { t: 50, label: 'Regular (50–75)', color: SEM.atencion }, { t: -Infinity, label: 'Bajo (<50)', color: SEM.critico }],
  },
};
export function buildHistogram(byCor, tanks, varId) {
  const cfg = HIST_CFG[varId]; if (!cfg) return null;
  const vals = tanks.map((tq) => lastNum(byCor.filter((r) => getField(r, F.tanque) === tq), cfg.keys)).filter((v) => v !== null);
  const bins = cfg.bins.map((b) => ({ label: b.label, color: b.color, count: 0 }));
  vals.forEach((v) => {
    let idx = cfg.dir === 'low' ? cfg.bins.findIndex((b) => v <= b.t) : cfg.bins.findIndex((b) => v >= b.t);
    if (idx < 0) idx = bins.length - 1;
    bins[idx].count++;
  });
  return { bins, total: vals.length };
}

/** Filas de Larvicultura con Observaciones, para el Historial (modal). */
export function obsHistorial(filters) {
  return store.globalData.filter(isLarviculturaRow)
    .filter((r) => getField(r, ['Observaciones', 'observaciones', 'Observación']) &&
      (!filters.corrida || getField(r, F.corrida) === filters.corrida) &&
      (!filters.modulo || getField(r, F.modulo) === filters.modulo) &&
      (!filters.tanque || getField(r, F.tanque) === filters.tanque))
    .sort((a, b) => (parseAnyDate(getField(b, F.fecha)) || 0) - (parseAnyDate(getField(a, F.fecha)) || 0));
}

/* ============================================================
   GRÁFICOS
   ============================================================ */
const fmtK = (v) => { if (v === null || v === undefined) return '—'; if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k'; return String(Math.round(v)); };
const natCmp = (a, b) => { const ra = String(a).match(/\d+/), rb = String(b).match(/\d+/); if (ra && rb && +ra[0] !== +rb[0]) return +ra[0] - +rb[0]; return String(a).localeCompare(String(b), 'es', { numeric: true }); };
// Umbrales del Score (mayor = mejor): Crítico ≤ 60 · Atención 60–80 · Óptimo ≥ 80.
const SCORE_CRIT = 60, SCORE_OPT = 80;

/** Dumbbell: población inicial vs actual por tanque. */
export function populationDumbbell(canvasId, popData) {
  const keys = Object.keys(popData).sort(natCmp);
  if (!keys.length) return null;
  const iniData = [], curData = [], lossPct = [];
  keys.forEach((k) => {
    const arr = popData[k];
    const ini = arr[0].poblacion, cur = arr[arr.length - 1].poblacion;
    iniData.push(ini); curData.push(cur);
    lossPct.push(ini > 0 ? (ini - cur) / ini * 100 : null);
  });
  const all = iniData.concat(curData).filter((v) => v !== null && !isNaN(v));
  let yMin = 0, yMax = 100;
  if (all.length) { const rmin = Math.min(...all), rmax = Math.max(...all), pad = Math.max(rmax - rmin, 1) * 0.22; yMin = Math.max(0, rmin - pad); yMax = rmax + pad; }

  const dumbbell = {
    id: 'lqDumbbell',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx, dI = chart.getDatasetMeta(0), dC = chart.getDatasetMeta(1);
      ctx.save();
      for (let i = 0; i < keys.length; i++) {
        const pI = dI.data[i], pC = dC.data[i]; if (!pI || !pC) continue;
        ctx.beginPath(); ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.strokeStyle = (curData[i] < iniData[i]) ? SEM.critico + '8c' : SEM.optimo + '8c';
        ctx.moveTo(pI.x, pI.y); ctx.lineTo(pC.x, pC.y); ctx.stroke();
        const loss = lossPct[i];
        if (loss !== null && !isNaN(loss)) {
          const txt = (loss >= 0 ? '-' : '+') + Math.abs(loss).toFixed(1) + '%';
          ctx.font = '800 11px system-ui, sans-serif';
          // Coordenadas redondeadas a píxel entero → texto nítido (sin subpíxeles).
          const tw = Math.ceil(ctx.measureText(txt).width);
          const cx = Math.round(pI.x), bw = tw + 12, bx = Math.round(cx - bw / 2);
          const by = Math.round(Math.min(pI.y, pC.y) - 24);
          ctx.fillStyle = loss >= 5 ? SEM.critico : loss >= 0 ? SEM.atencion : SEM.optimo;
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, bw, 18, 9); ctx.fill(); } else ctx.fillRect(bx, by, bw, 18);
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, cx, by + 10);
        }
      }
      ctx.restore();
    },
  };

  return makeChart(canvasId, {
    type: 'scatter',
    data: {
      labels: keys,
      datasets: [
        { label: 'Inicial', data: keys.map((k, i) => ({ x: k, y: iniData[i] })), backgroundColor: NEUTRAL, borderColor: '#fff', borderWidth: 2, pointRadius: 8, pointHoverRadius: 10, showLine: false },
        { label: 'Actual', data: keys.map((k, i) => ({ x: k, y: curData[i] })), backgroundColor: ACCENT, borderColor: '#fff', borderWidth: 2, pointRadius: 9, pointHoverRadius: 11, showLine: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24, right: 14, bottom: 6, left: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (it) => { const k = (it[0].raw && it[0].raw.x) ? it[0].raw.x : keys[it[0].dataIndex]; return /^\s*TQ/i.test(k) ? k : 'Tanque ' + k; },
            label: (it) => {
              const arr = popData[keys[it.dataIndex]] || [];
              if (it.datasetIndex === 0) return ` Inicial (${arr.length ? arr[0].fecha : ''}): ${fmtK(iniData[it.dataIndex])}`;
              return ` Actual (${arr.length ? arr[arr.length - 1].fecha : ''}): ${fmtK(curData[it.dataIndex])}`;
            },
            afterBody: (it) => {
              const idx = it[0].dataIndex, loss = lossPct[idx], arr = popData[keys[idx]] || [];
              const lines = ['─────────'];
              if (loss !== null) lines.push('Pérdida: ' + (loss >= 0 ? '-' : '+') + Math.abs(loss).toFixed(1) + '%');
              lines.push('Registros: ' + arr.length);
              return lines;
            },
          },
        },
      },
      scales: {
        x: { type: 'category', labels: keys, offset: true, ticks: { font: { size: 11, weight: '700' } }, grid: { display: false } },
        y: { min: yMin, max: yMax, ticks: { font: { size: 10 }, callback: (v) => fmtK(v) }, grid: { color: '#cfd8dc' }, title: { display: true, text: 'Población', color: '#78909c', font: { size: 10.5, weight: '700' } } },
      },
    },
    plugins: [dumbbell],
  });
}

/** Lollipop horizontal: score por tanque (tallo + punto), ordenado peor→mejor. */
export function scoreLollipop(canvasId, items) {
  if (!items.length) return null;
  const ordered = [...items].sort((a, b) => a.score - b.score);
  const zoneLabel = (s) => (s >= SCORE_OPT ? 'Óptimo' : s >= SCORE_CRIT ? 'Atención' : 'Crítico');
  // Bandas de zona de fondo (sin líneas de referencia).
  const zones = {
    id: 'lqScoreZones',
    beforeDatasetsDraw(chart) {
      const { ctx, scales: { x }, chartArea: { top, bottom } } = chart;
      const seg = [[0, SCORE_CRIT, SEM.critico + '16'], [SCORE_CRIT, SCORE_OPT, SEM.atencion + '1a'], [SCORE_OPT, 100, SEM.optimo + '1a']];
      seg.forEach(([a, b, col]) => { const xa = x.getPixelForValue(a), xb = x.getPixelForValue(b); ctx.fillStyle = col; ctx.fillRect(xa, top, xb - xa, bottom - top); });
    },
  };
  const dot = {
    id: 'lqLollipop',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      chart.getDatasetMeta(0).data.forEach((bar) => {
        ctx.save();
        ctx.beginPath(); ctx.arc(bar.x, bar.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.restore();
      });
    },
  };
  return makeChart(canvasId, {
    type: 'bar',
    data: {
      labels: ordered.map((x) => x.tank),
      datasets: [{ data: ordered.map((x) => +x.score.toFixed(1)), backgroundColor: ACCENT + '66', borderWidth: 0, barThickness: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      layout: { padding: { right: 8 } },
      scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v } }, y: { grid: { display: false } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => { const it = ordered[c.dataIndex]; return [`Score: ${it.score.toFixed(1)} · ${zoneLabel(it.score)}`, `ICL‑Q: ${it.icl != null ? it.icl.toFixed(0) : '—'} · Superv.: ${it.surv != null ? it.surv.toFixed(0) + '%' : '—'} (70/30)`]; } } },
      },
    },
    plugins: [zones, dot],
  });
}

/** Centro algal: Cel/ml por día (barras, promedio diario). Color por suficiencia. */
const ALGAE_TARGET = 25000; // densidad algal mínima recomendada (cél/ml), ajustable.
export function algaeChart(canvasId, algae) {
  if (!algae.days.length) return null;
  const xAxis = { ticks: { callback: (v, i) => dayNum(algae.days[i]), maxRotation: 0, font: { size: 11, weight: '700' } }, grid: { display: false }, title: { display: !!rangeLabel(algae.days), text: rangeLabel(algae.days), color: '#78909c', font: { size: 10, weight: '700' } } };
  // Color por suficiencia: verde ≥ objetivo, ámbar 60–100%, rojo < 60%.
  const suf = (v) => (v == null ? '#cfd8dc' : v >= ALGAE_TARGET ? SEM.optimo : v >= ALGAE_TARGET * 0.6 ? SEM.atencion : SEM.critico);
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels: algae.days, datasets: [{ label: 'Cel/ml', data: algae.values, backgroundColor: algae.values.map((v) => suf(v) + 'cc'), borderColor: algae.values.map(suf), borderWidth: 1, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: xAxis, y: { beginAtZero: true, ticks: { callback: (v) => fmtK(v) } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` Cel/ml: ${c.parsed.y == null ? '—' : fmtK(c.parsed.y)}` } } },
    },
  });
}

/** Tendencia de población: una línea por tanque a lo largo del tiempo. */
export function populationTrend(canvasId, popData) {
  const keys = Object.keys(popData).sort(natCmp);
  if (!keys.length) return null;
  const dateSet = new Map();
  keys.forEach((k) => popData[k].forEach((p) => { if (!dateSet.has(p.fecha)) dateSet.set(p.fecha, p._d ? p._d.getTime() : 0); }));
  const days = [...dateSet.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  const datasets = keys.map((k, i) => {
    const map = {}; popData[k].forEach((p) => { map[p.fecha] = p.poblacion; });
    const color = catColor(i);
    return { label: /^\s*TQ/i.test(k) ? k : 'TQ ' + k, data: days.map((d) => (d in map ? map[d] : null)), borderColor: color, backgroundColor: color + '22', tension: .3, pointRadius: 2, spanGaps: true, borderWidth: 2 };
  });
  return makeChart(canvasId, {
    type: 'line',
    data: { labels: days, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { callback: (v, i) => dayNum(days[i]), maxRotation: 0, font: { size: 10, weight: '700' } }, grid: { display: false }, title: { display: !!rangeLabel(days), text: rangeLabel(days), color: '#78909c', font: { size: 10, weight: '700' } } },
        y: { beginAtZero: false, ticks: { callback: (v) => fmtK(v) }, grid: { color: '#eceff1' }, title: { display: true, text: 'Población', color: '#78909c', font: { size: 10.5, weight: '700' } } },
      },
      plugins: {
        legend: { labels: { boxWidth: 10, font: { size: 9 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : fmtK(c.parsed.y)}` } },
      },
    },
  });
}

/** Ajuste lineal simple sobre una serie (ignora huecos). Devuelve {predict(x)} o null. */
function linFit(values) {
  const pts = [];
  values.forEach((y, x) => { if (y != null && !isNaN(y)) pts.push([x, y]); });
  if (pts.length < 2) return null;
  const n = pts.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
  const den = n * sxx - sx * sx; if (den === 0) return null;
  const m = (n * sxy - sx * sy) / den, b = (sy - m * sx) / n;
  return { predict: (x) => m * x + b };
}

/** Proyección: población por tanque (histórico sólido) + tendencia lineal a `horizon` días (punteado). */
export function populationForecast(canvasId, popData, horizon = 7) {
  const keys = Object.keys(popData).sort(natCmp);
  if (!keys.length) return null;
  const dateSet = new Map();
  keys.forEach((k) => popData[k].forEach((p) => { if (!dateSet.has(p.fecha)) dateSet.set(p.fecha, p._d ? p._d.getTime() : 0); }));
  const days = [...dateSet.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  const futLabels = Array.from({ length: horizon }, (_, i) => `+${i + 1}d`);
  const labels = [...days, ...futLabels];
  const tqLabel = (k) => (/^\s*TQ/i.test(k) ? k : 'TQ ' + k);
  const datasets = [];
  keys.forEach((k, i) => {
    const map = {}; popData[k].forEach((p) => { map[p.fecha] = p.poblacion; });
    const histVals = days.map((d) => (d in map ? map[d] : null));
    const color = catColor(i);
    datasets.push({ label: tqLabel(k), data: [...histVals, ...Array(horizon).fill(null)], borderColor: color, backgroundColor: color + '22', tension: .3, pointRadius: 2, spanGaps: true, borderWidth: 2 });
    const fc = linFit(histVals);
    if (fc) {
      const arr = Array(labels.length).fill(null);
      arr[days.length - 1] = Math.max(0, fc.predict(days.length - 1));
      for (let hh = 0; hh < horizon; hh++) arr[days.length + hh] = Math.max(0, fc.predict(days.length + hh));
      datasets.push({ label: tqLabel(k) + ' (proy.)', data: arr, borderColor: color, borderDash: [5, 4], pointRadius: 0, spanGaps: true, borderWidth: 1.5, _proj: true });
    }
  });
  return makeChart(canvasId, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxRotation: 0, font: { size: 10, weight: '700' } }, grid: { display: false } },
        y: { beginAtZero: false, ticks: { callback: (v) => fmtK(v) }, grid: { color: '#eceff1' }, title: { display: true, text: 'Población', color: '#78909c', font: { size: 10.5, weight: '700' } } },
      },
      plugins: {
        legend: { labels: { boxWidth: 10, font: { size: 9 }, filter: (it) => !/\(proy\.\)$/.test(it.text) } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : fmtK(c.parsed.y)}` } },
      },
    },
  });
}

/** Variables de manejo: barras agrupadas por día (Espuma / Suciedad / Recambio). */
export function mgmtChart(canvasId, mgmt) {
  if (!mgmt.days.length) return null;
  const mk = (label, data, color) => ({ label, data, backgroundColor: color + 'cc', borderColor: color, borderWidth: 1, borderRadius: 3, maxBarThickness: 20, order: 2 });
  // Recambio: línea separada (rutinario, no-alerta) sobre las barras de Espuma/Suciedad.
  const rec = { type: 'line', label: 'Recambio', data: mgmt.recambio, borderColor: CAT[2], backgroundColor: CAT[2] + '22', borderDash: [5, 3], tension: .3, pointRadius: 2, borderWidth: 2, spanGaps: true, order: 0 };
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels: mgmt.days, datasets: [mk('Espuma', mgmt.espuma, CAT[0]), mk('Suciedad', mgmt.suciedad, CAT[1]), rec] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: { callback: (v, i) => dayNum(mgmt.days[i]), maxRotation: 0, font: { size: 11, weight: '700' } }, grid: { display: false }, title: { display: !!rangeLabel(mgmt.days), text: rangeLabel(mgmt.days), color: '#78909c', font: { size: 10, weight: '700' } } }, y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } } },
      plugins: {
        legend: { labels: { boxWidth: 10, font: { size: 10 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1) + '%'}` } },
      },
    },
  });
}

/** Composición diaria apilada (intestino o lípidos). */
export function compositionChart(canvasId, comp) {
  if (!comp.days.length) return null;
  // Solo días con dato de algún segmento (no arrastrar días vacíos al inicio/fin).
  const idx = comp.days.map((_, i) => i).filter((i) => comp.stacks.some((s) => s.data[i] != null));
  if (!idx.length) return null;
  const days = idx.map((i) => comp.days[i]);
  const stacks = comp.stacks.map((s) => ({ ...s, data: idx.map((i) => s.data[i]) }));
  return makeChart(canvasId, {
    type: 'bar',
    data: { labels: days, datasets: stacks.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.color, borderWidth: 0 })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: { x: { stacked: true, ticks: { callback: (v, i) => dayNum(days[i]), maxRotation: 0, font: { size: 11, weight: '700' } }, grid: { display: false }, title: { display: !!rangeLabel(days), text: rangeLabel(days), color: '#78909c', font: { size: 10, weight: '700' } } }, y: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => v + '%' } } },
      plugins: {
        legend: { labels: { boxWidth: 11, font: { size: 10 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? '—' : c.parsed.y.toFixed(1) + '%'}` } },
      },
    },
  });
}

/** Histograma de calidad: nº de tanques por zona (bueno→malo), con % y realce del Crítico. */
export function qualityHistogram(canvasId, hist) {
  if (!hist || !hist.bins.length) return null;
  const total = hist.total || hist.bins.reduce((s, b) => s + b.count, 0);
  const pct = (c) => (total ? (c / total * 100) : 0);
  const lastIdx = hist.bins.length - 1; // zona peor (Crítico / Bajo)
  const critAlert = hist.bins[lastIdx] && hist.bins[lastIdx].count > 0;
  return makeChart(canvasId, {
    type: 'bar',
    data: {
      labels: hist.bins.map((b) => b.label),
      datasets: [{
        data: hist.bins.map((b) => b.count),
        backgroundColor: hist.bins.map((b) => b.color),
        borderColor: hist.bins.map((b, i) => (i === lastIdx && critAlert ? '#b71c1c' : 'transparent')),
        borderWidth: hist.bins.map((b, i) => (i === lastIdx && critAlert ? 2.5 : 0)),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.y} tanque(s) · ${pct(c.parsed.y).toFixed(0)}% del total` } },
      },
    },
  });
}
