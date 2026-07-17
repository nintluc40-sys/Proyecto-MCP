/* ============================================================
   LARVICULTURA · Calidad Larvaria — orquestador
   Jerarquía del tablero:
     1. Diagnóstico       → radar (estado) + evolución diaria
     2. Comparación       → score por tanque (lollipop) + histograma de calidad
     3. Población         → dumbbell inicial vs actual + KPIs
     4. Biología/alimento → composición (intestino/lípidos) + centro algal
     5. Manejo de agua    → espuma / suciedad / recambio
     6. Detalle           → registros diarios (bitácora desplegable)
   Modales: Comparar / Historial (observaciones) / Decisión.
   ============================================================ */
import { store } from '../../core/store.js';
import { STAGES, LARVI_COMBOS } from './stages.js';
import { buildLarviculturaData, dailySeries, lastState, iclOf, scoreOf, windowRows, buildTrendKpis, moduleEnv } from './compute.js';
import { radarChart, evolutionChart } from './charts.js';
import {
  buildPopData, popStats, buildScoreItems, buildAlgae, buildMgmt, buildComposition, buildHistogram, HIST_VARS,
  populationDumbbell, populationTrend, populationForecast, scoreLollipop, algaeChart, mgmtChart, compositionChart, qualityHistogram,
} from './extra.js';
import { destroyAllCharts, destroyChart, makeChart } from '../../core/charts.js';
import { larviColor, larviBg, larviLabel, esc } from '../../core/format.js';
import { modalsShellHTML, setSnapshot, openModal, closeModal, MODAL_IDS } from './modals.js';
import { presentMonths, corridasOfMonth, monthLabelAt } from '../../core/prodCalendar.js';
import { registerModalEscape } from '../../ui/modalEscape.js';
import { tankColorInfo } from '../../core/aguaColor.js';
import { diagSemaforo, popSemaforo, aguaSemaforo, cultivoInfo, semMeta } from './status.js';

const state = { stage: 'larv', month: null, modulo: null, corrida: null, tanque: null, histVar: 'estres', range: '15', popMode: 'dumbbell', evoSmooth: false };
const BITA_VISIBLE = 5; // registros visibles antes de desplegar

// Contexto del render vigente para refrescos PARCIALES (sin re-render total):
// histograma de calidad, centro algal y población se redibujan solos al alternar.
const view = {};

// Selector de rango temporal (acota los GRÁFICOS de la vista; la bitácora y la
// población conservan el historial completo por su naturaleza).
const RANGE_PILLS = [{ id: '7', label: '7 días' }, { id: '15', label: '15 días' }, { id: '30', label: '30 días' }, { id: 'all', label: 'Todo' }];
const RANGE_DAYS = { '7': 7, '15': 15, '30': 30, all: null };

function selectEl(name, value, options, placeholder) {
  return `<select class="lq-select" data-filter="${name}">
    <option value="">${placeholder}</option>
    ${options.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
  </select>`;
}

/** Tarjeta KPI con valor actual y delta (▲/▼) vs. el registro previo.
 *  En ICL/Superv/Score mayor = mejor → ▲ verde, ▼ rojo. */
function trendKpiCard(label, info, fmt) {
  const { cur, prev } = info;
  if (cur === null || cur === undefined) {
    return `<div class="lq-kpi"><div class="lq-kpi-lbl">${esc(label)}</div><div class="lq-kpi-val muted">—</div></div>`;
  }
  let deltaHtml = `<span class="lq-kpi-delta flat">— sin previo</span>`;
  if (prev !== null && prev !== undefined) {
    const dlt = cur - prev;
    const dir = dlt > 0.05 ? 'up' : dlt < -0.05 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▬';
    deltaHtml = `<span class="lq-kpi-delta ${dir}">${arrow} ${dlt >= 0 ? '+' : ''}${dlt.toFixed(1)}</span>`;
  }
  return `<div class="lq-kpi"><div class="lq-kpi-lbl">${esc(label)}</div><div class="lq-kpi-val">${fmt(cur)}</div>${deltaHtml}</div>`;
}

/** Dibuja un sparkline (línea mini, sin ejes) en un canvas dado. */
function drawSparkline(canvas, values, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // ≥2× como el resto de gráficos (core/charts.js) → línea y punto nítidos en 1x.
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 96, h = canvas.clientHeight || 30, pad = 3;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v !== null && p.v !== undefined && !isNaN(p.v));
  const n = values.length;
  if (!pts.length) return;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const span = hi - lo || 1;
  const X = (i) => n <= 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad);
  const Y = (v) => h - pad - ((v - lo) / span) * (h - 2 * pad);
  if (pts.length >= 2) {
    ctx.beginPath();
    pts.forEach((p, k) => { const x = X(p.i), y = Y(p.v); k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  }
  const last = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(X(last.i), Y(last.v), 2.4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}

/** Dibuja la franja de sparklines (uno por variable clave). */
function drawSparklines(root, daily, vars) {
  vars.forEach((v) => {
    const cv = root.querySelector(`#lqSpark-${v.key}`);
    drawSparkline(cv, daily.map((d) => d[v.key]), v.color);
  });
}

/* ---- Bloques internos reutilizables (render inicial + refresco parcial) ---- */
function histInnerHTML(hist, tankReady, corridaPrompt) {
  const host = !tankReady ? corridaPrompt
    : (hist && hist.total) ? '<canvas id="lqHist"></canvas>'
    : '<div class="empty-state">Sin datos de la variable.</div>';
  const foot = (tankReady && hist && hist.total) ? `<div class="lq-hist-foot">${hist.total} tanque(s) clasificados</div>` : '';
  return `<div class="lq-chart-host">${host}</div>${foot}`;
}

const TARGET_DOC = 20; // DOC objetivo de cosecha (PL10–12 aprox.) — ajustable.
function harvestNote(cInfo) {
  if (!cInfo || cInfo.doc == null) return '';
  const rem = TARGET_DOC - cInfo.doc;
  return rem > 0
    ? `· Cosecha estimada ~ día ${TARGET_DOC} (faltan ${rem} día(s))`
    : `· Cosecha estimada alcanzada (día ${cInfo.doc} ≥ ${TARGET_DOC})`;
}

function popInnerHTML(mode) {
  const legend = mode === 'trend'
    ? `<div class="lq-pop-legend"><span class="muted">Una línea por tanque · población a lo largo del tiempo</span></div>`
    : mode === 'forecast'
    ? `<div class="lq-pop-legend"><span class="muted">Histórico (sólido) + proyección lineal 7 días (punteado) por tanque ${esc(harvestNote(view.cInfo))}</span></div>`
    : `<div class="lq-pop-legend">
        <span><span class="lq-pop-dot" style="background:#90a4ae"></span>Inicial</span>
        <span><span class="lq-pop-dot" style="background:#00838F"></span>Actual</span>
        <span style="color:#E0413E">% pérdida</span>
      </div>`;
  return `${legend}<div class="lq-chart-host" style="height:360px"><canvas id="lqPop"></canvas></div>`;
}

/** Dibuja la población según el modo activo (dumbbell / tendencia / proyección). */
function drawPop(popData) {
  if (state.popMode === 'trend') return populationTrend('lqPop', popData);
  if (state.popMode === 'forecast') return populationForecast('lqPop', popData);
  return populationDumbbell('lqPop', popData);
}

/* ---- Refrescos parciales (no re-renderizan toda la vista) ---- */
function refreshHistogram(varId) {
  state.histVar = varId;
  const { root, draw } = view;
  if (!root) return;
  root.querySelectorAll('[data-histvar]').forEach((b) => b.classList.toggle('is-active', b.dataset.histvar === varId));
  const wrap = root.querySelector('#lqHistWrap'); if (!wrap) return;
  const hist = buildHistogram(view.wByCor, view.tanques, varId);
  wrap.innerHTML = histInnerHTML(hist, view.tankReady, view.corridaPrompt);
  if (view.tankReady && hist && hist.total) draw(() => qualityHistogram('lqHist', hist));
}


function refreshPop(mode) {
  state.popMode = mode;
  const { root, draw } = view;
  if (!root) return;
  root.querySelectorAll('[data-popmode]').forEach((b) => b.classList.toggle('is-active', b.dataset.popmode === mode));
  const wrap = root.querySelector('#lqPopWrap'); if (!wrap) return;
  wrap.innerHTML = popInnerHTML(mode);
  draw(() => drawPop(view.popData));
}

/** Registros diarios como bitácora desplegable (5 recientes + ver todo). */
function registrosTable(daily, vars) {
  const rows = [...daily].reverse(); // más reciente primero
  const hiddenN = Math.max(0, rows.length - BITA_VISIBLE);
  let body = '';
  rows.forEach((d, i) => {
    const score = scoreOf(d, vars);
    body += `<tr class="${i >= BITA_VISIBLE ? 'lq-bita-hidden' : ''}"><td>${esc(d.fecha)}</td>`;
    vars.forEach((v) => {
      const val = d[v.key];
      body += val === null
        ? '<td class="muted" style="text-align:center">—</td>'
        : `<td style="text-align:center"><span class="lq-pill" style="background:${larviBg(val)};border:1px solid ${larviColor(val)}">${val.toFixed(1)}%</span></td>`;
    });
    body += score !== null
      ? `<td style="text-align:center"><span class="lq-state" style="background:${larviColor(score)}">${larviLabel(score)}</span></td>`
      : '<td class="muted" style="text-align:center">—</td>';
    body += '</tr>';
  });
  const head = `<thead><tr><th>Fecha</th>${vars.map((v) => `<th>${esc(v.label)}</th>`).join('')}<th>Estado</th></tr></thead>`;
  return {
    hiddenN, total: rows.length,
    html: `<table class="lq-table">${head}<tbody>${body || `<tr><td colspan="${vars.length + 2}" class="muted" style="text-align:center;padding:18px">Sin registros.</td></tr>`}</tbody></table>`,
  };
}

/** Franja-semáforo de una sección (verde/ámbar/rojo) — mismo patrón que la vista de Tanque. */
function semFranja(title, sem) {
  const m = semMeta(sem.level);
  return `<div class="lq-sem lq-sem-${sem.level}">
    <span class="lq-sem-status">${m.icon} ${esc(title)}: <b>${esc(m.label)}</b></span>
    <span class="lq-sem-detail">${esc(sem.detail)}</span>
  </div>`;
}

const DOC_STATUS = {
  adelantado: ['⏩', 'Adelantado', '#2E9E5B'],
  atrasado: ['⏪', 'Atrasado', '#EF7D3B'],
  en_tiempo: ['✅', 'En tiempo', '#2E9E5B'],
  sin: ['•', '—', '#90a4ae'],
};
/** Chip de edad de cultivo (DOC) + estadío actual vs esperado. */
function docChip(cInfo) {
  if (!cInfo) return '';
  const [ic, lbl, col] = DOC_STATUS[cInfo.status] || DOC_STATUS.sin;
  return `<div class="lq-doc-chip" title="Edad de cultivo (DOC) y estadío esperado · cronograma estándar, ajustable">
    <span class="lq-doc-day">📅 Día ${cInfo.doc}</span>
    <span class="lq-doc-sep">·</span>
    <span>Estadío <b>${esc(cInfo.stage || '—')}</b></span>
    <span class="lq-doc-sep">·</span>
    <span class="muted">esperado ${esc(cInfo.esperado || '—')}</span>
    <span class="lq-doc-status" style="color:${col}">${ic} ${lbl}</span>
  </div>`;
}

/** KPI de fisicoquímicos del módulo (T°/OD/Sal) — clickeable, abre el modal de tendencia. */
function envKpi(env) {
  if (!env) return '';
  const col = env.level === 'rojo' ? '#E0413E' : '#2E9E5B';
  const txt = env.vars.map((v) => `${v.icon} ${v.last == null ? '—' : v.last.toFixed(1) + v.unit.trim()}`).join(' · ');
  return `<div class="lq-kpi lq-env-kpi" data-envopen role="button" tabindex="0" title="Ver tendencia diaria de T° / OD / Salinidad del módulo" style="border-color:${col}">
    <div class="lq-kpi-lbl">🌊 Fisicoquímicos · módulo</div>
    <div class="lq-kpi-val" style="font-size:15px">${esc(txt)}</div>
    <span class="lq-kpi-delta ${env.level === 'rojo' ? 'down' : 'up'}">${env.level === 'rojo' ? '⚠ fuera de rango' : '✓ en rango'}</span>
  </div>`;
}

/** Overlay del modal de fisicoquímicos (se rellena al abrir). */
function envModalHTML() {
  return `<div class="lq-modal" id="lqEnvModal" data-modal>
    <div class="lq-modal-card">
      <div class="lq-modal-head">
        <span class="lq-modal-title">🌊 Fisicoquímicos del módulo</span>
        <button class="lq-modal-x" data-env-close aria-label="Cerrar">✕</button>
      </div>
      <div class="lq-modal-body">
        <div id="lqEnvRows"></div>
        <div class="lq-modal-hint">Un gráfico por variable · tendencia diaria.</div>
      </div>
    </div>
  </div>`;
}

/** IDs de los mini-gráficos del modal (uno por variable). */
const ENV_CANVASES = ['lqEnvChart_tmp', 'lqEnvChart_od', 'lqEnvChart_sal'];

/** Dibuja un mini-gráfico por variable (con su etiqueta, último valor y fuente). */
function drawEnv() {
  const env = view.env; if (!env) return;
  const rowsEl = document.getElementById('lqEnvRows'); if (!rowsEl) return;
  rowsEl.innerHTML = env.vars.map((v) => {
    const stCol = v.status === 'ok' ? '#2E9E5B' : v.status === 'out' ? '#E0413E' : '#90a4ae';
    const stTxt = v.status === 'ok' ? 'En rango' : v.status === 'out' ? 'Fuera de rango' : v.status === 'info' ? 'Informativo' : 'Sin datos';
    const showRef = !v.informational; // sin rango de referencia para variables informativas (Salinidad)
    return `<div class="lq-env-row">
      <div class="lq-env-row-head">
        <span class="lq-env-row-ico">${v.icon}</span>
        <div>
          <div class="lq-env-row-lbl">${esc(v.label)}</div>
          <div class="muted" style="font-size:10px">prom ${v.avg == null ? '—' : v.avg.toFixed(1)}${showRef ? ` · ref ${v.band[0]}–${v.band[1]}` : ''}</div>
        </div>
        <span class="grow"></span>
        <span class="lq-env-row-val" style="color:${stCol}">${v.last == null ? '—' : v.last.toFixed(1) + v.unit}</span>
        <span class="lq-env-row-st" style="color:${stCol}">${stTxt}</span>
      </div>
      <div class="lq-env-row-chart"><canvas id="lqEnvChart_${v.key}"></canvas></div>
    </div>`;
  }).join('');
  env.vars.forEach((v) => {
    if (!v.series.length) return;
    makeChart(`lqEnvChart_${v.key}`, {
      type: 'line',
      data: { labels: v.days, datasets: [{ label: v.label, data: v.series, borderColor: v.color, backgroundColor: v.color + '22', tension: .3, pointRadius: 2, fill: true, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y == null ? '—' : c.parsed.y.toFixed(1) + v.unit}` } } },
        scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { font: { size: 9 } } } },
      },
    });
  });
}

/** Enlaza el KPI de fisicoquímicos del Resumen (se re-bindea tras refresh parcial). */
function bindResumen(root) {
  const res = root.querySelector('#lqResumen'); if (!res) return;
  const ov = root.querySelector('#lqEnvModal');
  res.querySelectorAll('[data-envopen]').forEach((el) => {
    const open = () => { if (!ov) return; ov.classList.add('lq-open'); document.body.classList.add('modal-open'); requestAnimationFrame(drawEnv); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

/** HTML del bloque Resumen (depende del tanque: KPIs, DOC, franja Diagnóstico). */
function resumenInner(c) {
  return `<div class="lq-section-title lq-block-title-row">
    <span>🩺 Resumen ${state.tanque ? '· ' + esc(state.tanque) : 'del módulo'}</span>
    ${docChip(c.cInfo)}
  </div>
  <div class="lq-kpi-strip">
    ${trendKpiCard('ICL‑Q · Calidad larvaria', c.trend.icl, (v) => v.toFixed(0))}
    ${trendKpiCard('Supervivencia', c.trend.surv, (v) => v.toFixed(0) + '%')}
    ${trendKpiCard('Score compuesto', c.trend.score, (v) => v.toFixed(0))}
    ${envKpi(c.env)}
  </div>
  ${semFranja('Diagnóstico', c.semDiag)}`;
}

/** Leyenda de Manejo de agua: último y promedio por variable + color de agua. */
function mgmtCap(mgmt) {
  const la = (arr) => { const v = (arr || []).filter((x) => x != null); return v.length ? { last: v[v.length - 1], avg: v.reduce((a, b) => a + b, 0) / v.length } : null; };
  const fmt = (o) => (o ? `${o.last.toFixed(1)}% <span class="muted">(prom ${o.avg.toFixed(1)}%)</span>` : '—');
  const ci = mgmt.lastColor ? tankColorInfo(mgmt.lastColor) : null;
  return `<div class="lq-mini-cap">
    Espuma <b>${fmt(la(mgmt.espuma))}</b> · Suciedad <b>${fmt(la(mgmt.suciedad))}</b> · Recambio <b>${fmt(la(mgmt.recambio))}</b>
    ${ci ? `· Color <span class="lq-color-sw" style="background:${ci.hex}"></span><b>${esc(ci.name)}</b>` : ''}
  </div>`;
}

/** HTML del bloque Detalle del tanque (radar/evolución/composición/algal/agua/registros). */
function detalleInner(c) {
  const compTitle = state.stage === 'postl' ? 'COMPOSICIÓN LIPÍDICA' : 'COMPOSICIÓN INTESTINAL';
  const reg = registrosTable(c.dailyFull, c.vars);
  const sparkCards = c.vars.map((v) => {
    let lastVal = null;
    for (let i = c.daily.length - 1; i >= 0; i--) { const x = c.daily[i][v.key]; if (x !== null && x !== undefined) { lastVal = x; break; } }
    return `<div class="lq-spark-card">
      <div class="lq-spark-lbl" style="color:${v.color}">${esc(v.short)}</div>
      <canvas class="lq-spark-cv" id="lqSpark-${v.key}"></canvas>
      <div class="lq-spark-val">${lastVal === null ? '—' : lastVal.toFixed(1) + '%'}</div>
    </div>`;
  }).join('');
  return `<div class="lq-block-title lq-block-title-row">
    <span>🔬 Detalle del tanque</span>
    <span class="lq-block-title-ctrl">${selectEl('tanque', state.tanque, c.d.tanques, 'Promedio del módulo')}</span>
  </div>
  <div class="lq-top-grid">
    <div class="card">
      <div class="lq-card-title">ESTADO ACTUAL · ${c.stageCfg.label.toUpperCase()} <span class="muted">· ${state.tanque ? esc(state.tanque) : 'promedio del módulo'}</span></div>
      <div class="lq-chart-host"><canvas id="lqRadar"></canvas></div>
      <div class="lq-legend">
        <span class="lq-legend-item" style="font-weight:800">↙ hacia el centro = mejor</span>
        ${[['Óptimo', '#2E9E5B'], ['Atención', '#F4B740'], ['Alerta', '#EF7D3B'], ['Crítico', '#E0413E']]
          .map(([t, col]) => `<span class="lq-legend-item"><span class="lq-leg-dot" style="background:${col}"></span>${t}</span>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="lq-card-head-row">
        <div class="lq-card-title" style="margin:0">EVOLUCIÓN DIARIA <span class="muted">· ${c.daily.length} día(s)</span></div>
        <div class="lq-hist-pills">
          <button class="lq-hist-pill ${state.evoSmooth ? 'is-active' : ''}" data-evosmooth title="Media móvil de 3 días para reducir el ruido diario">Suavizar</button>
        </div>
      </div>
      <div class="lq-chart-host"><canvas id="lqLine"></canvas></div>
    </div>
  </div>
  <div class="lq-grid-2">
    <div class="card">
      <div class="lq-card-title">${compTitle} <span class="muted">· diaria</span></div>
      <div class="lq-chart-host">${!c.tankReady ? c.corridaPrompt : c.comp.days.length ? '<canvas id="lqComp"></canvas>' : '<div class="empty-state">Sin datos de composición.</div>'}</div>
    </div>
    <div class="card">
      <div class="lq-card-title">CENTRO ALGAL <span class="muted">· N5 Z1 Z2 Z3 M1 · Cel/ml</span></div>
      <div class="lq-chart-host">${c.algae.days.length ? '<canvas id="lqAlgae"></canvas>' : '<div class="empty-state">Sin Cel/ml en estadios tempranos.</div>'}</div>
      ${c.algae.days.length ? '<div class="lq-mini-cap muted">🍤 El alimento natural se relaciona con el <b>Intestino lleno</b>: si la densidad algal cae, suele caer también el llenado intestinal.</div>' : ''}
    </div>
  </div>
  ${semFranja('Manejo de agua', c.semAgua)}
  <div class="card lq-mb">
    <div class="lq-card-title">MANEJO DE AGUA <span class="muted">· Espuma / Suciedad / Recambio</span></div>
    <div class="lq-chart-host">${c.mgmt.days.length ? '<canvas id="lqMgmt"></canvas>' : '<div class="empty-state">Sin variables de manejo.</div>'}</div>
    ${c.mgmt.days.length ? mgmtCap(c.mgmt) : ''}
  </div>
  <div class="lq-bita-head">
    <div class="lq-section-title" style="margin:0">📋 Registros diarios</div>
    ${reg.hiddenN > 0 ? `<button class="lq-bita-toggle" data-bita-toggle aria-expanded="false">Ver todo (${reg.total})</button>` : ''}
  </div>
  <div class="card lq-spark-card-wrap"><div class="lq-spark-strip">${sparkCards}</div></div>
  <div class="card" style="padding:0;overflow:auto">${reg.html}</div>`;
}

/** Refresco PARCIAL al cambiar de tanque: re-renderiza Resumen + Detalle y redibuja
 *  solo los gráficos del tanque. Los gráficos de Comparativa del módulo NO se tocan. */
function refreshTank(root) {
  const stageCfg = STAGES[state.stage];
  const vars = stageCfg.vars;
  const d = buildLarviculturaData(state, vars, view.monthCorridas);
  const winDays = RANGE_DAYS[state.range] || null;
  const wRows = windowRows(d.rows, winDays);
  const dailyFull = dailySeries(d.rows, vars);
  const daily = dailySeries(wRows, vars);
  const last = lastState(daily, vars);
  const trend = buildTrendKpis(daily, wRows, vars);
  const cInfo = cultivoInfo(d.rows);
  // Composición y Manejo de agua siguen al tanque (Centro algal permanece a nivel módulo).
  const wScope = state.tanque ? wRows : view.wByCor;
  const comp = buildComposition(wScope, state.stage);
  const mgmt = buildMgmt(wScope);
  const semAgua = aguaSemaforo(mgmt);
  view.cInfo = cInfo; view.daily = daily; view.vars = vars; view.comp = comp; view.mgmt = mgmt; view.semAgua = semAgua;
  // El cambio de tanque es un refresco PARCIAL (no re-render), así que el snapshot que
  // consume el modal "Decisión rápida" y el badge de patrones deben actualizarse aquí
  // también; si no, la Decisión mostraría el ICL/variables del módulo o del tanque previo.
  const icl = iclOf(last, vars);
  setSnapshot({ state, d, vars, daily, last, icl });
  const combos = last ? LARVI_COMBOS.filter((c) => c.keys.every((k) => last[k] != null && last[k] >= c.threshold)).length : 0;
  const decBtn = root.querySelector('[data-open-modal="lq-modal-dec"]');
  if (decBtn) decBtn.innerHTML = `⚡ Decisión${combos ? ` <span class="lq-action-badge">${combos}</span>` : ''}`;
  const ctx = {
    cInfo, trend, daily, dailyFull, vars, stageCfg, d,
    semDiag: diagSemaforo(last, vars), semAgua,
    comp, algae: view.algae, mgmt, env: view.env,
    tankReady: !!state.corrida, corridaPrompt: view.corridaPrompt,
  };
  // Libera los charts del Detalle antes de reemplazar su DOM (evita instancias huérfanas).
  ['lqRadar', 'lqLine', 'lqComp', 'lqAlgae', 'lqMgmt'].forEach(destroyChart);
  const rEl = root.querySelector('#lqResumen'); if (rEl) rEl.innerHTML = resumenInner(ctx);
  const dEl = root.querySelector('#lqDetalle'); if (dEl) dEl.innerHTML = detalleInner(ctx);
  bindResumen(root);
  const { draw } = view;
  draw(() => radarChart('lqRadar', last, vars, { level: ctx.semDiag.level }));
  draw(() => evolutionChart('lqLine', daily, vars, state.evoSmooth));
  draw(() => drawSparklines(root, daily, vars));
  if (ctx.tankReady) draw(() => compositionChart('lqComp', view.comp));
  draw(() => algaeChart('lqAlgae', view.algae));
  draw(() => mgmtChart('lqMgmt', view.mgmt));
  bindDetalle(root);
}

/** Enlaza los controles internos del bloque Detalle (se re-bindean tras refresh parcial). */
function bindDetalle(root) {
  const det = root.querySelector('#lqDetalle'); if (!det) return;
  det.querySelectorAll('[data-filter="tanque"]').forEach((sel) =>
    sel.addEventListener('change', () => { state.tanque = sel.value || null; refreshTank(root); }));
  const smoothBtn = det.querySelector('[data-evosmooth]');
  if (smoothBtn) smoothBtn.addEventListener('click', () => {
    state.evoSmooth = !state.evoSmooth;
    smoothBtn.classList.toggle('is-active', state.evoSmooth);
    destroyChart('lqLine');
    view.draw(() => evolutionChart('lqLine', view.daily, view.vars, state.evoSmooth));
  });
  const tog = det.querySelector('[data-bita-toggle]');
  if (tog) tog.addEventListener('click', () => {
    const exp = tog.getAttribute('aria-expanded') === 'true';
    det.querySelectorAll('.lq-bita-hidden').forEach((tr) => tr.classList.toggle('lq-bita-show', !exp));
    tog.setAttribute('aria-expanded', String(!exp));
    tog.textContent = exp ? `Ver todo (${det.querySelectorAll('.lq-table tbody tr').length})` : 'Ocultar';
  });
}

export function larviculturaView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }
  destroyAllCharts();
  const stageCfg = STAGES[state.stage];
  const vars = stageCfg.vars;

  // ── Barra de mes (alineada con Supervisor vía corrida→mes). Default = mes
  //    presente más reciente; acota las corridas/módulos a ese mes. ──
  const months = presentMonths();
  if (state.month == null || !months.includes(state.month)) state.month = months.length ? months[months.length - 1] : 0;
  const monthCorridas = corridasOfMonth(state.month);
  if (state.corrida && !monthCorridas.includes(state.corrida)) state.corrida = null;

  // Datos/desplegables (acotados al mes) — barato; alimenta los filtros aunque
  // todavía no se computen los gráficos.
  const d = buildLarviculturaData(state, vars, monthCorridas);

  // Gate: el técnico debe elegir SU módulo para que se calcule el tablero.
  // Sin módulo no computamos los gráficos (evita "calcular todos los módulos").
  const ready = !!state.modulo;

  // Cómputo pesado SÓLO cuando hay módulo elegido (defaults seguros si no).
  let winDays = null, wRows = [], wByCor = [], dailyFull = [], daily = [], last = null;
  let icl = null, trend = null, combosCount = 0;
  let popData = [], pStats = {}, scoreItems = [], algae = { days: [] }, mgmt = { days: [] }, comp = { days: [] }, hist = null;
  if (ready) {
    // Ventana temporal: acota los gráficos al rango elegido. La población y la
    // bitácora se quedan con el historial completo (inicial-vs-actual y log).
    winDays = RANGE_DAYS[state.range] || null;
    wRows = windowRows(d.rows, winDays);
    wByCor = windowRows(d.byCor, winDays);
    dailyFull = dailySeries(d.rows, vars); // bitácora (historial completo)
    daily = dailySeries(wRows, vars);      // gráficos (ventana)
    last = lastState(daily, vars);
    icl = iclOf(last, vars);
    trend = buildTrendKpis(daily, wRows, vars);
    // Patrones correlacionados activos (para el badge del botón Decisión).
    combosCount = last ? LARVI_COMBOS.filter((c) => c.keys.every((k) => last[k] != null && last[k] >= c.threshold)).length : 0;

    // Datos de los gráficos adicionales (alcance corrida+módulo, todos los tanques)
    popData = buildPopData(d.byCor); // SIEMPRE historia completa (inicial vs actual real)
    pStats = popStats(popData);
    scoreItems = buildScoreItems(wByCor, d.tanques, vars);
    // Composición y Manejo de agua siguen al tanque elegido (wRows = filas del
    // tanque en la ventana); sin tanque, promedio del módulo (wByCor).
    // El Centro algal queda a nivel módulo (por estadío temprano es muy disperso por tanque).
    const wScope = state.tanque ? wRows : wByCor;
    algae = buildAlgae(wByCor);
    mgmt = buildMgmt(wScope);
    comp = buildComposition(wScope, state.stage);
    hist = buildHistogram(wByCor, d.tanques, state.histVar);
  }

  // Los gráficos con identidad por-tanque ("TQ n") sólo son fiables con una corrida
  // elegida: sin filtro los nombres se repiten entre módulos y se mezclan.
  const tankReady = !!state.corrida;

  // Cada gráfico se dibuja aislado: un fallo en uno no debe impedir los demás.
  const draw = (fn) => { try { fn(); } catch (e) { console.error('[larvicultura] chart', e); } };
  const drawAll = () => {
    draw(() => radarChart('lqRadar', last, vars, { level: semDiag.level }));
    draw(() => evolutionChart('lqLine', daily, vars, state.evoSmooth));
    draw(() => drawSparklines(root, daily, vars));
    draw(() => algaeChart('lqAlgae', algae));
    draw(() => mgmtChart('lqMgmt', mgmt));
    if (tankReady) {
      draw(() => scoreLollipop('lqScore', scoreItems));
      draw(() => qualityHistogram('lqHist', hist));
      draw(() => drawPop(popData));
      draw(() => compositionChart('lqComp', comp));
    }
  };

  // Aviso reutilizable para los gráficos por-tanque cuando falta elegir corrida.
  const corridaPrompt = `<div class="empty-state">🔎 Elige una <b>corrida</b> para ver el detalle por tanque.<br><span class="muted" style="font-size:.85em">Sin corrida los nombres «TQ n» se repiten entre módulos y se mezclan.</span></div>`;

  // Snapshot para los modales (datos vigentes de la selección activa).
  setSnapshot({ state, d, vars, daily, last, icl });
  const cInfo = cultivoInfo(d.rows); // edad de cultivo (DOC); reutilizado en el ctx del Resumen
  // Contexto para refrescos parciales (histograma / algal / población)
  Object.assign(view, { root, draw, vars, tankReady, corridaPrompt, wByCor, tanques: d.tanques, popData, pStats, algae, cInfo });

  let h = `<div class="lq-head">
    <div>
      <div class="lq-title"><span class="lq-title-icon">🦐</span> Larvicultura · Calidad ${stageCfg.label}</div>
      <div class="lq-subtitle">Diagnóstico rápido · Semáforo 0–100 (menor = mejor)</div>
    </div>
    <div class="lq-controls">
      <div class="lq-monthbar">
        <button class="lq-month-nav" data-month-nav="-1" ${months.indexOf(state.month) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
        <span class="lq-month-lbl">📅 ${esc(monthLabelAt(state.month))}</span>
        <button class="lq-month-nav" data-month-nav="1" ${months.indexOf(state.month) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
      </div>
      <div class="lq-stage-toggle">
        <button class="${state.stage === 'larv' ? 'is-active' : ''}" data-stage="larv">Larv</button>
        <button class="${state.stage === 'postl' ? 'is-active' : ''}" data-stage="postl">Post-L</button>
      </div>
      ${selectEl('corrida', state.corrida, d.corridas, 'Todas las corridas')}
      ${selectEl('modulo', state.modulo, d.modulos, 'Todos los módulos')}
    </div>
  </div>`;

  h += `<div class="lq-actions">
    <button class="lq-action-btn" data-open-modal="lq-modal-comp">⚖ Comparar</button>
    <button class="lq-action-btn" data-open-modal="lq-modal-corr">🔄 Corridas</button>
    <button class="lq-action-btn" data-open-modal="lq-modal-hist">📜 Historial</button>
    <button class="lq-action-btn" data-open-modal="lq-modal-dec">⚡ Decisión${combosCount ? ` <span class="lq-action-badge">${combosCount}</span>` : ''}</button>
  </div>`;

  h += `<div class="lq-range">
    <span class="lq-range-lbl">⏱️ Rango de gráficos</span>
    ${RANGE_PILLS.map((p) => `<button class="lq-range-pill ${state.range === p.id ? 'is-active' : ''}" data-range="${p.id}">${p.label}</button>`).join('')}
    <span class="lq-range-hint muted">la bitácora y la población muestran el historial completo</span>
  </div>`;

  // Gate: sin módulo elegido NO se calculan/dibujan los gráficos. El técnico
  // ve la barra de filtros con su mes actual y elige su módulo para continuar.
  if (!ready) {
    h += `<div class="empty-state">👈 Elige tu <b>módulo</b> para ver el tablero de ${stageCfg.label}.<br>
      <span class="muted" style="font-size:.85em">Mostrando <b>${esc(monthLabelAt(state.month))}</b> · ${d.corridas.length} corrida(s) · ${d.modulos.length} módulo(s). Usa ◀ ▶ para cambiar de mes.</span></div>`;
    h += modalsShellHTML();
    root.innerHTML = h;
    bind(root);
    return;
  }

  if (!d.rows.length) {
    h += `<div class="empty-state">Sin datos de ${stageCfg.label} para la selección actual.</div>`;
    h += modalsShellHTML();
    root.innerHTML = h;
    bind(root);
    return;
  }

  // Estado por sección (franjas) + edad de cultivo (DOC).
  const semDiag = diagSemaforo(last, vars);
  const semPop = popSemaforo(pStats);
  const semAgua = aguaSemaforo(mgmt);
  // Fisicoquímicos del módulo (T°/OD/Sal) — nivel de módulo, estable al cambiar de tanque.
  const env = moduleEnv(state.modulo, state.corrida);

  // Contexto compartido para los bloques dependientes del tanque (Resumen + Detalle).
  Object.assign(view, { monthCorridas, comp, mgmt, semAgua, env, daily, vars });
  const ctx = { cInfo, trend, daily, dailyFull, vars, stageCfg, d, semDiag, semAgua, comp, algae, mgmt, tankReady, corridaPrompt, env };

  // ── Resumen (bloque dependiente del tanque) ──
  h += `<div id="lqResumen">${resumenInner(ctx)}</div>`;

  /* ═══════════ 🏭 COMPARATIVA DEL MÓDULO (estática al cambiar de tanque) ═══════════ */
  const lolliH = Math.max(170, d.tanques.length * 26 + 26);
  const histPills = HIST_VARS.map((v) => `<button class="lq-hist-pill ${state.histVar === v.id ? 'is-active' : ''}" data-histvar="${v.id}">${esc(v.label)}</button>`).join('');
  const stat = (val, lbl, col) => `<div class="lq-pop-stat"><div class="lq-pop-stat-val" style="color:${col}">${esc(val)}</div><div class="lq-pop-stat-lbl">${esc(lbl)}</div></div>`;
  const popReady = tankReady && pStats.validTanks;
  h += `<div class="lq-section-title lq-block-title">🏭 Comparativa del módulo</div>
  <div class="lq-grid-2">
    <div class="card">
      <div class="lq-card-title">SCORE POR TANQUE · LOLLIPOP <span class="muted">· 70% ICL‑Q + 30% Superv.</span></div>
      <div class="lq-chart-host" style="height:${lolliH}px">${!tankReady ? corridaPrompt : scoreItems.length ? '<canvas id="lqScore"></canvas>' : '<div class="empty-state">Sin score por tanque.</div>'}</div>
    </div>
    <div class="card">
      <div class="lq-card-head-row">
        <div class="lq-card-title" style="margin:0">HISTOGRAMA DE CALIDAD</div>
        <div class="lq-hist-pills">${histPills}</div>
      </div>
      <div id="lqHistWrap">${histInnerHTML(hist, tankReady, corridaPrompt)}</div>
    </div>
  </div>
  ${semFranja('Población', semPop)}
  <div class="card lq-mb">
    <div class="lq-card-head-row">
      <div class="lq-card-title" style="margin:0">POBLACIÓN POR TANQUE</div>
      ${popReady ? `<div class="lq-hist-pills">
        <button class="lq-hist-pill ${state.popMode === 'dumbbell' ? 'is-active' : ''}" data-popmode="dumbbell">Inicial vs Actual</button>
        <button class="lq-hist-pill ${state.popMode === 'trend' ? 'is-active' : ''}" data-popmode="trend">Tendencia</button>
        <button class="lq-hist-pill ${state.popMode === 'forecast' ? 'is-active' : ''}" data-popmode="forecast">Proyección</button>
      </div>` : ''}
    </div>
    <div id="lqPopWrap">${!tankReady ? corridaPrompt : popReady ? popInnerHTML(state.popMode) : '<div class="empty-state">Sin columna Población en los datos.</div>'}</div>
    ${popReady ? `<div class="lq-pop-stats">
      ${stat(fmtBig(pStats.totalCurr), 'Población total', '#00838F')}
      ${stat(pStats.pctLoss, 'Pérdida acumulada', '#E0413E')}
      ${stat(String(pStats.validTanks), 'Tanques', 'var(--c-text-soft)')}
      ${stat(pStats.bestTank || '—', 'Mayor población', '#2E9E5B')}
    </div>` : ''}
  </div>`;

  /* ═══════════ 🔬 DETALLE DEL TANQUE (bloque dependiente del tanque) ═══════════ */
  h += `<div id="lqDetalle">${detalleInner(ctx)}</div>`;

  h += modalsShellHTML();
  h += envModalHTML();

  root.innerHTML = h;
  drawAll();
  bind(root);
}

function fmtBig(v) {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(Math.round(v));
}

function bind(root) {
  root.querySelectorAll('[data-stage]').forEach((b) =>
    b.addEventListener('click', () => { state.stage = b.dataset.stage; larviculturaView(root); }));
  // Corrida/Módulo → re-render completo. El Tanque hace refresco PARCIAL (bindDetalle).
  root.querySelectorAll('[data-filter]').forEach((sel) => {
    if (sel.dataset.filter === 'tanque') return;
    sel.addEventListener('change', () => { state[sel.dataset.filter] = sel.value || null; larviculturaView(root); });
  });
  // Histograma / población: refresco PARCIAL (no re-render de la vista)
  root.querySelectorAll('[data-histvar]').forEach((b) =>
    b.addEventListener('click', () => refreshHistogram(b.dataset.histvar)));
  root.querySelectorAll('[data-popmode]').forEach((b) =>
    b.addEventListener('click', () => refreshPop(b.dataset.popmode)));
  root.querySelectorAll('[data-range]').forEach((b) =>
    b.addEventListener('click', () => { state.range = b.dataset.range; larviculturaView(root); }));
  // Barra de mes: navega entre meses presentes y resetea la selección del mes anterior.
  root.querySelectorAll('[data-month-nav]').forEach((b) =>
    b.addEventListener('click', () => {
      const ms = presentMonths();
      const ni = ms.indexOf(state.month) + Number(b.dataset.monthNav);
      if (ni >= 0 && ni < ms.length) {
        state.month = ms[ni];
        state.corrida = null; state.modulo = null; state.tanque = null;
        larviculturaView(root);
      }
    }));

  // Controles internos de los bloques re-renderizables (Resumen / Detalle).
  bindResumen(root);
  bindDetalle(root);

  // Modal de fisicoquímicos del módulo (cierre · ✕ o backdrop).
  const envOv = root.querySelector('#lqEnvModal');
  if (envOv) {
    const closeEnv = () => { envOv.classList.remove('lq-open'); document.body.classList.remove('modal-open'); ENV_CANVASES.forEach(destroyChart); };
    envOv.querySelector('[data-env-close]')?.addEventListener('click', closeEnv);
    envOv.addEventListener('click', (e) => { if (e.target === envOv) closeEnv(); });
  }

  // Modales: abrir
  root.querySelectorAll('[data-open-modal]').forEach((b) =>
    b.addEventListener('click', () => openModal(b.dataset.openModal)));
  // Modales: cerrar (botón ✕ o clic en el backdrop)
  MODAL_IDS.forEach((id) => {
    const el = root.querySelector('#' + id);
    if (!el) return;
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) closeModal(id); });
  });
  // Escape cierra el modal abierto (incluye el de fisicoquímicos) vía su backdrop.
  registerModalEscape('.lq-modal.lq-open');
}
