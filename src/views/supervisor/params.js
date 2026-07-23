/* ============================================================
   SUPERVISOR · Diagnóstico por parámetros (vista de Tanque)
   Clasifica las variables del sheet de Larvicultura en 3 grupos
   (Nutricionales / Morfológicos / Productivos) y, por CADA variable,
   muestra un mini-gráfico de tendencia diaria con su propia escala y
   su banda de referencia + una tarjeta con valor, objetivo e
   interpretación. Se adapta al estadío del tanque (Larv / Post-L).
   ============================================================ */
import { esc } from '../../core/format.js';
import { avg as mean } from '../../core/util.js';
import { parseAnyDate } from '../../core/dates.js';
import { parseNum, getField, F } from '../../core/fields.js';
import { getters } from './stats.js';
import { makeChart } from '../../core/charts.js';
import { bindModal } from './ui.js';

const ESTADIO_KEYS = ['Estadío', 'Estadio', 'estadío', 'estadio'];

const { gFec, gTnq, gPop } = getters;

// kind: pct=%, num=conteo, cel=cél/ml, idx=índice 0–10
const LV_VARS = [
  // Nutricionales (los 4 de intestino + lípidos se muestran SIEMPRE, sin filtro de estadío)
  { key: 'il',  group: 'nutri', label: 'Intestino Lleno',     keys: ['Intestino_Lleno', 'IntestinoLleno', 'intestino_lleno'], ref: { op: '>=', val: 90 }, color: '#2E7D32', stage: 'both',  kind: 'pct', hint: 'Alimentación insuficiente o baja disponibilidad de alimento.' },
  { key: 'is',  group: 'nutri', label: 'Intestino Semilleno', keys: ['Intestino_Semilleno', 'intestino_semilleno'], ref: { op: '<', val: 10 }, color: '#F9A825', stage: 'both', kind: 'pct', hint: 'Tránsito intestinal irregular; revisar frecuencia de alimentación.' },
  { key: 'iv',  group: 'nutri', label: 'Intestino Vacío',     keys: ['Intestino_Vacio', 'Intestino_Vacío', 'intestino_vacio'], ref: { op: '<', val: 10 }, color: '#E53935', stage: 'both', kind: 'pct', hint: 'Posible inanición/estrés; revisar alimento y calidad de agua.' },
  { key: 'lip', group: 'nutri', label: 'Lípidos',             keys: ['Lípidos', 'Lipidos', 'lipidos'], ref: { op: '>', val: 95 }, color: '#43A047', stage: 'both', kind: 'pct', hint: 'Reservas lipídicas bajas; reforzar enriquecimiento de la dieta.' },
  { key: 'cel', group: 'nutri', label: 'Cel/ml (algas)',      keys: ['Cel/ml', 'Cel_ml', 'cel/ml', 'Cel/Ml'], ref: { op: '>=', val: 25000 }, color: '#00897B', stage: 'both', kind: 'cel', hint: 'Densidad algal baja; reforzar dosificación/cultivo de microalgas.' },
  // Morfológicos
  { key: 'def', group: 'morfo', label: 'Deformidad',  keys: ['Deformidad', 'deformidad'], ref: { op: '<', val: 5 },  color: '#8E24AA', stage: 'larv', kind: 'pct', hint: 'Revisar incubación, T° y calidad de reproductores.' },
  { key: 'ret', group: 'morfo', label: 'Retraso',     keys: ['Retraso', 'retraso'], ref: { op: '<', val: 50 }, color: '#F07830', stage: 'larv', kind: 'pct', hint: 'Verificar T°, salinidad y oxigenación.' },
  { key: 'hng', group: 'morfo', label: 'Hongos',      keys: ['Hongos', 'hongos'], ref: { op: '<', val: 3 }, color: '#38c4f0', stage: 'larv', kind: 'pct', hint: 'Aumentar recambio e higiene; tratamiento antimicótico.' },
  { key: 'nvi', group: 'morfo', label: 'No Viables',  keys: ['No_Viables', '% No_viables', '%No_viables', '% No_Viables', 'no_viables', 'No viables'], ref: { op: '<', val: 10 }, color: '#e8303e', stage: 'larv', kind: 'pct', hint: 'Calidad genética/nutricional de reproductores.' },
  { key: 'op',  group: 'morfo', label: 'Opacidad',    keys: ['% Opacidad', 'Opacidad', 'opacidad', '%Opacidad'], ref: { op: '<', val: 10 }, color: '#f5b942', stage: 'postl', kind: 'pct', hint: 'Etiología bacteriana/ambiental; muestreo histológico.' },
  { key: 'fl',  group: 'morfo', label: 'Flácidez',    keys: ['Flácidez', 'Flacidez', 'flácidez', 'flacidez'], ref: { op: '<', val: 3 }, color: '#a78bfa', stage: 'postl', kind: 'pct', hint: 'Calidad nutricional y vibrios; reducir densidad.' },
  { key: 'ne',  group: 'morfo', label: 'Necrosis',    keys: ['Necrosis', 'necrosis'], ref: { op: '<', val: 3 }, color: '#e53935', stage: 'postl', kind: 'pct', hint: 'Posible infección bacteriana; aislar afectados.' },
  { key: 'ca',  group: 'morfo', label: 'Canibalismo', keys: ['Canibalismo', 'canibalismo'], ref: { op: '<', val: 3 }, color: '#f07830', stage: 'postl', kind: 'pct', hint: 'Reducir densidad; homogeneizar tallas; más alimento.' },
  { key: 'pa',  group: 'morfo', label: 'Parásitos',   keys: ['Parasitos', 'parasitos', 'Parásitos', 'parásitos'], ref: { op: '<', val: 4 }, color: '#26C6DA', stage: 'postl', kind: 'pct', hint: 'Muestreo parasitológico; bioseguridad.' },
  { key: 'act', group: 'morfo', label: '% Actividad', keys: ['% Actividad', 'Actividad', '%Actividad'], ref: { op: '>=', val: 90 }, color: '#1ec86a', stage: 'both', kind: 'pct', hint: 'Baja actividad: revisar O₂, T° y estrés.' },
  { key: 'est', group: 'morfo', label: 'Estrés',      keys: ['Estrés', 'Estres', 'estrés', 'estres'], ref: { op: '<', val: 5 }, color: '#607D8B', stage: 'both', kind: 'idx', hint: 'Estrés elevado: revisar O₂, T°, densidad y manejo.' },
  // Manejo de Agua (umbrales referenciales; ajustables). Recambio sin alerta (refLine = máximo normal).
  { key: 'esp', group: 'agua', label: '% Espuma',    keys: ['% Espuma', 'Espuma', 'espuma'], ref: { op: '<', val: 10 }, color: '#26C6DA', stage: 'both', kind: 'pct', hint: 'Exceso de espuma: revisar aireación, materia orgánica y recambio.' },
  { key: 'suc', group: 'agua', label: '% Suciedad',  keys: ['% Suciedad', 'Suciedad', 'suciedad'], ref: { op: '<', val: 10 }, color: '#8D6E63', stage: 'both', kind: 'pct', hint: 'Suciedad elevada: reforzar limpieza/sifoneo y recambio.' },
  { key: 'rec', group: 'agua', label: '% Recambio',  keys: ['% Recambio', 'Recambio', 'recambio'], refLine: 50, color: '#42A5F5', stage: 'both', kind: 'pct', hint: 'Recambio dentro de lo rutinario.' },
  // Productivos
  { key: 'plg',  group: 'prod', label: 'PL/g',          keys: ['PLG', 'Plg', 'plg', 'PL/g', 'pl/g'], ref: { op: '<', val: 200 }, color: '#00695C', stage: 'both', kind: 'num', hint: 'PL/g alto: revisar densidad/talla antes de cosecha.' },
  { key: 'plgm', group: 'prod', label: 'PL/g (manual)', keys: ['Plg (manual)', 'PLG (manual)', 'plg (manual)', 'Plg(manual)', 'PL/g (manual)'], ref: { op: '<', val: 200 }, color: '#1565C0', stage: 'both', kind: 'num', hint: 'PL/g (manual) alto: revisar densidad/talla antes de cosecha.' },
];
const LV_GROUPS = [
  { id: 'nutri', label: 'Parámetros Nutricionales', icon: '🍤' },
  { id: 'morfo', label: 'Parámetros Morfológicos', icon: '🔬' },
  { id: 'agua',  label: 'Manejo de Agua', icon: '💧' },
  { id: 'prod',  label: 'Parámetros Productivos', icon: '📦' },
];
const REF_SYM = { '>=': '≥', '>': '>', '<=': '≤', '<': '<' };
const lvK = (v) => { if (v === null || v === undefined) return '—'; if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k'; return String(Math.round(v)); };
function fmtVal(kind, v) {
  if (v === null || v === undefined) return '—';
  if (kind === 'pct') return v.toFixed(1) + '%';
  if (kind === 'cel') return lvK(v) + ' cel/ml';
  if (kind === 'idx') return v.toFixed(1);
  return lvK(v); // num
}
const unitSuffix = (kind) => (kind === 'pct' ? '%' : kind === 'cel' ? ' cel/ml' : '');
function evalRef(v, val) {
  if (val === null || val === undefined || !v.ref) return { ok: null };
  const { op, val: t } = v.ref;
  const ok = op === '>=' ? val >= t : op === '>' ? val > t : op === '<=' ? val <= t : val < t;
  return { ok };
}

/** Serie diaria (promedio por fecha) de cada variable + estadío por día. */
function lvDaily(rows) {
  const byDay = new Map();
  rows.forEach((r) => { const f = gFec(r); if (!f) return; if (!byDay.has(f)) byDay.set(f, []); byDay.get(f).push(r); });
  const days = [...byDay.keys()].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const stages = days.map((d) => {
    for (const r of byDay.get(d)) { const st = getField(r, ESTADIO_KEYS); if (st) return st; }
    return '';
  });
  const series = {};
  LV_VARS.forEach((v) => {
    series[v.key] = days.map((d) => {
      const vals = byDay.get(d).map((r) => parseNum(r, v.keys)).filter((x) => x !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  });
  // `byDay` se devuelve para que iclSeries no lo reconstruya: es el MISMO agrupado y
  // tenerlo definido en dos sitios invita a que uno de los dos derive con el tiempo.
  return { days, stages, series, byDay };
}

/* ---- ICL (Índice de Calidad Larvaria) ----
   ICL = (SV + %Actividad + Int.Lleno + Lípidos)
       − (Vacío + Semilleno + Deformidad + Estrés + Retraso + Necrosis
          + Hongos + No Viables + Opacidad + Flácidez + Canibalismo + Parásitos)
   Variable ausente un día = 0 (no contribuye). */
const ICL_POS = [{ key: 'sv', label: 'Supervivencia' }, { key: 'act', label: '% Actividad' }, { key: 'il', label: 'Intestino Lleno' }, { key: 'lip', label: 'Lípidos' }];
// `scale` lleva la variable a la MISMA escala que el resto antes de sumarla. Estrés es la
// única `kind: 'idx'` (0–10, alerta en ≥5); las otras quince son porcentajes 0–100, así que
// sumándolo en crudo un estrés catastrófico de 10/10 pesaba lo mismo que un 10 % de
// deformidad: contaba 10 veces menos de lo que le corresponde.
const ICL_NEG = [
  { key: 'iv', label: 'Intestino Vacío' }, { key: 'is', label: 'Intestino Semilleno' }, { key: 'def', label: 'Deformidad' },
  { key: 'est', label: 'Estrés (×10)', scale: 10 }, { key: 'ret', label: 'Retraso' }, { key: 'ne', label: 'Necrosis' }, { key: 'hng', label: 'Hongos' },
  { key: 'nvi', label: 'No Viables' }, { key: 'op', label: 'Opacidad' }, { key: 'fl', label: 'Flácidez' }, { key: 'ca', label: 'Canibalismo' }, { key: 'pa', label: 'Parásitos' },
];

/** SV por población por día (Σ última pob. >0 ≤ día por tanque / Σ primera pob. × 100,
 *  cap 100), coherente con survival()/moduleSvPopSeries del resto de la vista. Se usa
 *  SOLO para RELLENAR los días en que falta la columna cruda "Supervivencia" (que está
 *  dispersa); los días con SV cruda no se tocan, para no desviar la calibración del ICL. */
function svPopByDay(rows, days) {
  const tanks = [...new Set(rows.map(gTnq).filter(Boolean))];
  const pool = tanks.length ? tanks : [null];
  const seqByTank = new Map();
  let totalFirst = 0;
  pool.forEach((tq) => {
    const seq = rows.filter((r) => tq === null || gTnq(r) === tq)
      .map((r) => ({ t: parseAnyDate(gFec(r)), p: gPop(r) }))
      .filter((x) => x.t && x.p !== null && x.p > 0)
      .sort((a, b) => a.t - b.t);
    seqByTank.set(tq, seq);
    if (seq.length) totalFirst += seq[0].p;
  });
  return days.map((d) => {
    const dt = parseAnyDate(d);
    if (!dt || totalFirst <= 0) return null;
    let total = 0, any = false;
    pool.forEach((tq) => { const seq = seqByTank.get(tq); for (let i = seq.length - 1; i >= 0; i--) { if (seq[i].t <= dt) { total += seq[i].p; any = true; break; } } });
    return any ? Math.min((total / totalFirst) * 100, 100) : null;
  });
}

/** Serie diaria del ICL + desglose de variables negativas por día. */
export function iclSeries(rows) {
  const { days, stages, series, byDay } = lvDaily(rows);
  const svPop = svPopByDay(rows, days); // relleno para huecos de la columna cruda
  const svDaily = days.map((d, i) => { const vals = byDay.get(d).map((r) => parseNum(r, F.supervivencia)).filter((x) => x !== null); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : svPop[i]; });
  const getVal = (key, i) => (key === 'sv' ? svDaily[i] : (series[key] ? series[key][i] : null));
  const values = days.map((_, i) => {
    let pos = 0, neg = 0, any = false;
    ICL_POS.forEach((p) => { const v = getVal(p.key, i); if (v !== null && v !== undefined) { pos += v; any = true; } });
    ICL_NEG.forEach((p) => { const v = getVal(p.key, i); if (v !== null && v !== undefined) { neg += v * (p.scale || 1); any = true; } });
    return any ? pos - neg : null;
  });
  // El desglose muestra la CONTRIBUCIÓN al ICL (ya escalada), no el valor crudo de la hoja:
  // si no, el ranking de "variables que más restan" saldría mal ordenado. Por eso la
  // etiqueta de Estrés lleva el "×10" — la hoja dice 8 y aquí resta 80.
  const negByDay = days.map((_, i) => ICL_NEG
    .map((p) => { const v = getVal(p.key, i); return { label: p.label, val: (v === null || v === undefined) ? v : v * (p.scale || 1) }; })
    .filter((x) => x.val !== null && x.val !== undefined && x.val > 0)
    .sort((a, b) => b.val - a.val));
  return { days, stages, values, negByDay };
}

/** Alertas del último día: variables (con umbral) fuera de rango, con severidad.
 *  `alta` = la transgresión supera el 50% del umbral; `media` en caso contrario. */
export function paramAlerts(rows, stageClass) {
  const { series } = lvDaily(rows);
  const lastVal = (key) => { const a = series[key] || []; for (let i = a.length - 1; i >= 0; i--) { if (a[i] !== null && a[i] !== undefined) return a[i]; } return null; };
  const out = [];
  LV_VARS.forEach((v) => {
    if (!v.ref || !(v.stage === stageClass || v.stage === 'both')) return;
    const val = lastVal(v.key);
    if (val === null) return;
    if (evalRef(v, val).ok === false) {
      const gap = Math.abs(val - v.ref.val) / Math.max(Math.abs(v.ref.val), 1);
      out.push({ key: v.key, label: v.label, fmt: fmtVal(v.kind, val), obj: `${REF_SYM[v.ref.op]} ${v.ref.val}${unitSuffix(v.kind)}`, sev: gap >= 0.5 ? 'alta' : 'media', gap, hint: v.hint || 'Fuera de rango: revisar manejo.' });
    }
  });
  return out.sort((a, b) => (a.sev === b.sev ? b.gap - a.gap : (a.sev === 'alta' ? -1 : 1)));
}

/** Plugin: banda/línea de referencia (sombrea la zona "buena" + línea de umbral). */
function makeRefPlugin(ref) {
  const { op, val } = ref;
  const goodAbove = (op === '>' || op === '>=');
  return {
    id: 'lvRef',
    beforeDatasetsDraw(chart) {
      const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
      const py = y.getPixelForValue(val); if (isNaN(py)) return;
      const ctx = chart.ctx; ctx.save();
      ctx.fillStyle = 'rgba(30,200,106,.10)';
      if (goodAbove) ctx.fillRect(ca.left, ca.top, ca.right - ca.left, Math.max(0, py - ca.top));
      else ctx.fillRect(ca.left, py, ca.right - ca.left, Math.max(0, ca.bottom - py));
      ctx.strokeStyle = 'rgba(120,144,156,.7)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(ca.left, py); ctx.lineTo(ca.right, py); ctx.stroke();
      ctx.restore();
    },
  };
}

/** Mini-gráfico de tendencia de UNA variable (escala propia + banda).
 *  `stagesFull` alinea el estadío por fecha; `opts.big` = modo ampliado. */
function drawVarChart(canvasId, days, dataFull, v, stagesFull, opts = {}) {
  const first = dataFull.findIndex((x) => x !== null && x !== undefined);
  if (first === -1) return;
  let last = dataFull.length - 1;
  while (last > first && (dataFull[last] === null || dataFull[last] === undefined)) last--;
  const data = dataFull.slice(first, last + 1);
  const labels = days.slice(first, last + 1);
  const stages = (stagesFull || []).slice(first, last + 1);
  const present = data.filter((x) => x !== null && x !== undefined);
  let lo = Math.min(...present), hi = Math.max(...present);
  if (v.ref) { lo = Math.min(lo, v.ref.val); hi = Math.max(hi, v.ref.val); }
  if (v.refLine) { lo = Math.min(lo, v.refLine); hi = Math.max(hi, v.refLine); }
  const span = (hi - lo) || Math.max(Math.abs(hi) || 1, 1);
  const pad = span * 0.2;
  let yMin = lo - pad, yMax = hi + pad;
  if (v.kind === 'pct') { yMin = Math.max(0, yMin); yMax = Math.min(100, yMax); if (yMin >= yMax) { yMin = Math.max(0, yMin - 2); yMax = Math.min(100, yMax + 2); } }
  const big = !!opts.big;
  const datasets = [{ label: v.label, data, borderColor: v.color, backgroundColor: v.color + '22', tension: .3, pointRadius: big ? 4 : 2, pointHoverRadius: big ? 6 : 4, spanGaps: true, fill: true, borderWidth: big ? 2.5 : 2 }];
  // TQ1 · overlay del promedio del módulo (solo en fullscreen, alineado por fecha).
  if (big && opts.modMap) {
    datasets.push({ label: 'Promedio módulo', data: labels.map((d) => (opts.modMap.get(d) ?? null)), borderColor: '#90A4AE', borderDash: [5, 4], backgroundColor: 'transparent', tension: .3, pointRadius: 0, spanGaps: true, fill: false, borderWidth: 2 });
  }
  makeChart(canvasId, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: big ? { maxRotation: 45, autoSkip: true, maxTicksLimit: 12, font: { size: 11 } } : { display: false }, grid: { display: false } },
        y: { min: yMin, max: yMax, ticks: { font: { size: big ? 11 : 9 }, maxTicksLimit: big ? 6 : 4 }, grid: { color: '#eceff1' } },
      },
      plugins: {
        legend: { display: big && !!opts.modMap, labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: (it) => labels[it[0].dataIndex],
            afterTitle: (it) => { const st = stages[it[0].dataIndex]; return st ? 'Estadío: ' + st : ''; },
            label: (c) => `${c.dataset.label}: ${fmtVal(v.kind, c.parsed.y)}`,
          },
        },
      },
    },
    plugins: v.ref ? [makeRefPlugin(v.ref)] : (v.refLine ? [makeRefPlugin({ op: '<', val: v.refLine })] : []),
  });
}

/** Construye la sección (html + draw). `stageClass` = 'larv' | 'postl'.
 *  `modRows` (opcional) = filas de TODO el módulo, para el overlay de promedio
 *  del módulo en el fullscreen de cada variable (TQ1). */
/** Mini-semáforo de Manejo de Agua: combina Espuma/Suciedad/Color (Recambio = informativo). */
export function waterSemaforo(esp, suc, colorLevel) {
  const espBad = esp != null && esp >= 10;
  const sucBad = suc != null && suc >= 10;
  const colorBad = colorLevel === 'warn';
  if (colorBad || (espBad && sucBad) || (esp != null && esp >= 15) || (suc != null && suc >= 15)) return { level: 'rojo', label: 'Alerta', icon: '🔴' };
  if (espBad || sucBad) return { level: 'ambar', label: 'Revisar', icon: '⚠️' };
  return { level: 'verde', label: 'Normal', icon: '✅' };
}

/** Semáforo genérico de un grupo: nivel según nº de variables fuera de rango + detalle. */
function groupSemaforo(vars, lastVal) {
  let inRange = 0, evaluable = 0;
  const out = [];
  vars.forEach((v) => {
    const ev = evalRef(v, lastVal(v.key));
    if (ev.ok === null) return; // sin umbral o sin dato
    evaluable++;
    if (ev.ok) inRange++; else out.push(v.label);
  });
  const level = out.length >= 2 ? 'rojo' : out.length === 1 ? 'ambar' : 'verde';
  const icon = level === 'rojo' ? '🔴' : level === 'ambar' ? '⚠️' : '✅';
  const label = level === 'rojo' ? 'Alerta' : level === 'ambar' ? 'Revisar' : 'Normal';
  return { level, icon, label, inRange, evaluable, out };
}

/** Heatmap de parámetros morfológicos: filas = vars del grupo 'morfo', columnas = días. */
export function morphHeatmap(rows, stageClass) {
  const { days, series } = lvDaily(rows);
  const vars = LV_VARS.filter((v) => v.group === 'morfo' && (v.stage === stageClass || v.stage === 'both'));
  const out = vars.map((v) => ({
    key: v.key,
    label: v.label,
    kind: v.kind,
    cells: days.map((_, i) => {
      const val = series[v.key] ? series[v.key][i] : null;
      if (val === null || val === undefined) return { val: null, txt: '' };
      const ev = evalRef(v, val);
      return { val, ok: ev.ok, txt: fmtVal(v.kind, val) };
    }),
  }));
  return { days, rows: out };
}

/** Regresión lineal simple sobre una serie (ignora huecos). Devuelve {slope, intercept, future[]}. */
export function linForecast(values, horizon = 7) {
  const pts = [];
  values.forEach((y, x) => { if (y !== null && y !== undefined && !isNaN(y)) pts.push([x, y]); });
  if (pts.length < 2) return null;
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const lastX = values.length - 1;
  const future = [];
  for (let k = 1; k <= horizon; k++) { const x = lastX + k; future.push(slope * x + intercept); }
  return { slope, intercept, future, predict: (x) => slope * x + intercept };
}

export function buildParamSection(rows, stageClass, modRows, waterColor) {
  const { days, stages, series } = lvDaily(rows);

  // Promedio diario del módulo por variable (Map fecha→valor) para el overlay.
  const modAvg = {};
  if (modRows && modRows.length) {
    const md = lvDaily(modRows);
    LV_VARS.forEach((v) => { const m = new Map(); md.days.forEach((d, i) => { if (md.series[v.key][i] !== null && md.series[v.key][i] !== undefined) m.set(d, md.series[v.key][i]); }); modAvg[v.key] = m; });
  }
  const hasData = (key) => series[key] && series[key].some((v) => v !== null);
  const lastVal = (key) => { const a = series[key] || []; for (let i = a.length - 1; i >= 0; i--) { if (a[i] !== null && a[i] !== undefined) return a[i]; } return null; };
  const groups = LV_GROUPS.map((g) => ({
    ...g,
    vars: LV_VARS.filter((v) => v.group === g.id && (v.stage === stageClass || v.stage === 'both') && hasData(v.key)),
  })).filter((g) => g.vars.length);

  const titleRow = `<div class="sv-section-title" style="margin-top:6px">🧪 Diagnóstico por parámetros`;
  if (!days.length || !groups.length) {
    return { html: `${titleRow}</div><div class="empty-state">Sin variables de calidad registradas para este tanque.</div>`, draw: () => {} };
  }

  let outCount = 0, evalCount = 0;
  groups.forEach((g) => g.vars.forEach((v) => { const ev = evalRef(v, lastVal(v.key)); if (ev.ok !== null) { evalCount++; if (!ev.ok) outCount++; } }));

  let html = `${titleRow}
    <span class="lv-stage-pill">${stageClass === 'postl' ? 'Post-Larva' : 'Larvicultura'}</span>
    <span class="lv-out-pill ${outCount ? 'is-bad' : 'is-ok'}">${outCount}/${evalCount} fuera de rango</span>
  </div>`;

  groups.forEach((g) => {
    const cards = g.vars.map((v) => {
      const val = lastVal(v.key);
      const ev = evalRef(v, val);
      const cls = ev.ok === null ? 'lv-neutral' : ev.ok ? 'lv-ok' : 'lv-bad';
      const badge = ev.ok === null ? '·' : ev.ok ? '✓' : '!';
      const refTxt = v.ref ? `obj ${REF_SYM[v.ref.op]} ${v.ref.val}${unitSuffix(v.kind)}` : (v.refLine ? `máx. normal ${v.refLine}${unitSuffix(v.kind)}` : 'referencial');
      const tip = ev.ok === false ? (v.hint || 'Fuera de rango: revisar manejo.')
        : ev.ok === true ? 'En rango. Mantener protocolo.'
        : 'Variable sin umbral de referencia.';
      return `<div class="lv-vcard ${cls}">
        <div class="lv-vcard-head">
          <span class="lv-vcard-name">${esc(v.label)}</span>
          <span class="lv-vcard-actions">
            <button class="lv-fs-btn" data-lvfs="${v.key}" title="Ampliar gráfico" aria-label="Ampliar ${esc(v.label)}">⛶</button>
            <span class="lv-vcard-badge">${badge}</span>
          </span>
        </div>
        <div class="lv-vcard-meta"><span class="lv-vcard-val">${fmtVal(v.kind, val)}</span><span class="lv-vcard-obj">${refTxt}</span></div>
        <div class="lv-vcard-chart"><canvas id="lvv_${v.key}"></canvas></div>
        <div class="lv-vcard-tip">${esc(tip)}</div>
      </div>`;
    }).join('');
    let sem, detail;
    if (g.id === 'agua') {
      sem = waterSemaforo(lastVal('esp'), lastVal('suc'), waterColor ? waterColor.level : null);
      const fmtP = (k) => { const x = lastVal(k); return x == null ? '—' : fmtVal('pct', x); };
      detail = `Espuma ${fmtP('esp')} · Suciedad ${fmtP('suc')} · Recambio ${fmtP('rec')}${waterColor ? ' · Color: ' + esc(waterColor.name) : ''}`;
    } else {
      const gs = groupSemaforo(g.vars, lastVal);
      sem = gs;
      detail = gs.evaluable
        ? `${gs.inRange}/${gs.evaluable} en rango${gs.out.length ? ' · ⚠ Fuera: ' + gs.out.join(', ') : ''}`
        : 'Sin variables con umbral evaluable';
    }
    const groupHead = `<div class="lv-grp-sem lv-grp-${sem.level}">
      <span class="lv-grp-sem-status">${g.icon} ${esc(g.label)} · ${sem.icon} <b>${esc(sem.label)}</b> <span class="lv-grp-count">${g.vars.length} var.</span></span>
      <span class="lv-grp-sem-detail">${esc(detail)}</span>
    </div>`;
    html += groupHead + `<div class="lv-vgrid">${cards}</div>`;
  });

  // Modal de ampliación (fullscreen) reutilizando el patrón .sv-modal
  html += `<div class="sv-modal" id="lvFsModal" data-lvfs-overlay>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title" id="lvFsTitle">Variable</span>
        <button class="sv-modal-x" data-lvfs-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-kpis" id="lvFsMeta"></div>
        <div class="lv-fs-chart"><canvas id="lvFsCanvas"></canvas></div>
      </div>
    </div>
  </div>`;

  // Lookup de variables activas por key (para el modal de ampliación)
  const varByKey = {};
  const groupOf = {};
  groups.forEach((g) => g.vars.forEach((v) => { varByKey[v.key] = v; groupOf[v.key] = g; }));

  const draw = (root) => {
    groups.forEach((g) => g.vars.forEach((v) => drawVarChart('lvv_' + v.key, days, series[v.key], v, stages)));

    const scope = root || document;
    const overlay = scope.querySelector('#lvFsModal');
    if (!overlay) return;
    const titleEl = overlay.querySelector('#lvFsTitle');
    const metaEl = overlay.querySelector('#lvFsMeta');

    const openFs = (key) => {
      const v = varByKey[key]; if (!v) return;
      const g = groupOf[key];
      const val = lastVal(key); const ev = evalRef(v, val);
      titleEl.textContent = `${g ? g.icon + ' ' : ''}${v.label}`;
      const refTxt = v.ref ? `obj ${REF_SYM[v.ref.op]} ${v.ref.val}${unitSuffix(v.kind)}` : (v.refLine ? `máx. normal ${v.refLine}${unitSuffix(v.kind)}` : 'referencial');
      const estado = ev.ok === null ? '' : ev.ok ? '<span class="lv-fs-ok">✓ En rango</span>' : '<span class="lv-fs-bad">! Fuera de rango</span>';
      const arr = (series[key] || []).filter((x) => x !== null && x !== undefined);
      const avg = mean(arr);
      const mn = arr.length ? Math.min(...arr) : null, mx = arr.length ? Math.max(...arr) : null;
      metaEl.innerHTML = `<span class="sv-modal-kpi"><b>${fmtVal(v.kind, val)}</b>actual</span>`
        + `<span class="sv-modal-kpi"><b>${fmtVal(v.kind, avg)}</b>prom.</span>`
        + `<span class="sv-modal-kpi"><b>${fmtVal(v.kind, mn)}</b>mín.</span>`
        + `<span class="sv-modal-kpi"><b>${fmtVal(v.kind, mx)}</b>máx.</span>`
        + `<span class="sv-modal-kpi">${refTxt}</span>${estado}`;
      requestAnimationFrame(() => drawVarChart('lvFsCanvas', days, series[key], v, stages, { big: true, modMap: modAvg[key] }));
    };
    bindModal(scope, overlay, {
      openSel: '[data-lvfs]', closeSel: '[data-lvfs-close]',
      onOpen: (b) => openFs(b.dataset.lvfs),
    });
  };
  return { html, draw };
}
