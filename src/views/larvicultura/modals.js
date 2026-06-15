/* ============================================================
   LARVICULTURA · modales Comparar / Historia / Decisión
   Portado y refinado de _lqRenderComparator / _lqRenderHistoria /
   _lqRenderDecision del original.
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow } from '../../core/fields.js';
import { larviColor, larviLabel, larviZone, esc } from '../../core/format.js';
import { parseAnyDate, fmtShort } from '../../core/dates.js';
import { makeChart, destroyChart } from '../../core/charts.js';
import { dailySeries, lastState, iclOf } from './compute.js';
import { LARVI_COMBOS } from './stages.js';
import { obsHistorial } from './extra.js';

const natCmp = (a, b) => { const ra = String(a).match(/\d+/), rb = String(b).match(/\d+/); if (ra && rb && +ra[0] !== +rb[0]) return +ra[0] - +rb[0]; return String(a).localeCompare(String(b), 'es', { numeric: true }); };
const fechaTxt = (r) => { const d = parseAnyDate(getField(r, F.fecha)); return d ? fmtShort(d) : esc(getField(r, F.fecha) || '—'); };

const TANK_COLORS = ['#1E88E5', '#E53935', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1'];

// Estado local del comparador (tanques seleccionados, máx. 4)
const compSel = new Set();
let snap = null; // snapshot vigente { d, vars, daily, last, icl, state }

export const MODAL_IDS = ['lq-modal-comp', 'lq-modal-corr', 'lq-modal-hist', 'lq-modal-dec'];

const TITLES = {
  'lq-modal-comp': '⚖ Comparar tanques',
  'lq-modal-corr': '🔄 Comparar corridas',
  'lq-modal-hist': '📜 Historial de observaciones',
  'lq-modal-dec': '⚡ Decisión rápida',
};

/** HTML de los 3 overlays (cuerpos vacíos, se rellenan al abrir). */
export function modalsShellHTML() {
  return MODAL_IDS.map((id) => `
    <div class="lq-modal" id="${id}" data-modal>
      <div class="lq-modal-card">
        <div class="lq-modal-head">
          <span class="lq-modal-title">${TITLES[id]}</span>
          <button class="lq-modal-x" data-close="${id}" aria-label="Cerrar">✕</button>
        </div>
        <div class="lq-modal-body" id="${id}-body"></div>
      </div>
    </div>`).join('');
}

export function setSnapshot(s) { snap = s; }

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el || !snap) return;
  el.classList.add('lq-open');
  document.body.classList.add('modal-open');
  const body = document.getElementById(id + '-body');
  if (id === 'lq-modal-comp') renderComparator(body);
  else if (id === 'lq-modal-corr') renderCorrComp(body);
  else if (id === 'lq-modal-hist') { syncHistFromState(); renderHistoria(body); }
  else if (id === 'lq-modal-dec') renderDecision(body);
}

/** Alinea los filtros del Historial con la selección activa de la vista
 *  (Corrida/Módulo/Tanque de la barra superior) para no re-buscar. */
function syncHistFromState() {
  const st = (snap && snap.state) ? snap.state : {};
  histF.corrida = st.corrida || '';
  histF.modulo = st.modulo || '';
  histF.tanque = st.tanque || '';
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('lq-open');
  document.body.classList.remove('modal-open');
  // Libera SÓLO los charts propios del modal; los gráficos base de la vista nunca
  // se destruyeron, así que no hay que recalcularlos al cerrar (evita el parpadeo).
  destroyChart('lqCompChart');
  destroyChart('lqCorrRadar');
}

/* ---------- helpers de datos por tanque ---------- */
function tankLast(tq, vars) {
  const rows = snap.d.byCor.filter((r) => getField(r, F.tanque) === tq);
  return lastState(dailySeries(rows, vars), vars);
}

/* ============================================================
   COMPARAR
   ============================================================ */
function renderComparator(body) {
  const { d } = snap;
  const tanks = d.tanques;
  if (!tanks.length) { body.innerHTML = '<div class="empty-state">Selecciona un módulo/corrida con tanques para comparar.</div>'; return; }

  // Preselección: hasta 3 primeros si no hay selección previa
  if (!compSel.size) tanks.slice(0, Math.min(3, tanks.length)).forEach((t) => compSel.add(t));
  // Limpia selección obsoleta
  [...compSel].forEach((t) => { if (!tanks.includes(t)) compSel.delete(t); });

  const h = `<div class="lq-comp-pills">
    ${tanks.map((t) => `<button class="pill-btn ${compSel.has(t) ? 'is-active' : ''}" data-comp-tank="${esc(t)}">${esc(t)}</button>`).join('')}
  </div>
  <div class="lq-modal-hint">Hasta 4 tanques · menor valor = mejor</div>
  <div class="lq-chart-host lg"><canvas id="lqCompChart"></canvas></div>
  <div id="lqCompTable"></div>`;
  body.innerHTML = h;

  drawComparator();

  body.querySelectorAll('[data-comp-tank]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.compTank;
      if (compSel.has(t)) compSel.delete(t);
      else if (compSel.size < 4) compSel.add(t);
      renderComparator(body);
    }));
}

function drawComparator() {
  const { vars } = snap;
  const selected = [...compSel];
  const perTank = selected.map((t, i) => ({ tank: t, last: tankLast(t, vars), color: TANK_COLORS[i % TANK_COLORS.length] }));

  // Ejes sensibles: auto-escala al rango real (muchos registros son bajos).
  const allVals = perTank.flatMap((pt) => vars.map((v) => (pt.last && pt.last[v.key] != null) ? pt.last[v.key] : null)).filter((x) => x !== null);
  const lo = allVals.length ? Math.min(...allVals) : 0;
  const hi = allVals.length ? Math.max(...allVals) : 100;
  const pad = Math.max((hi - lo) * 0.2, 1);
  const yMin = Math.max(0, lo - pad), yMax = Math.min(100, hi + pad);

  makeChart('lqCompChart', {
    type: 'bar',
    data: {
      labels: vars.map((v) => v.short),
      datasets: perTank.map((pt) => ({
        label: pt.tank,
        data: vars.map((v) => (pt.last && pt.last[v.key] != null) ? pt.last[v.key] : null),
        backgroundColor: pt.color + 'cc',
        borderColor: pt.color,
        borderWidth: 1,
        borderRadius: 4,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { min: yMin, max: yMax, ticks: { callback: (v) => v + '%' } } },
      plugins: { legend: { labels: { boxWidth: 12 } } },
    },
  });

  // Tabla ICL por tanque
  const tableEl = document.getElementById('lqCompTable');
  if (tableEl) {
    const ranked = perTank.map((pt) => ({ tank: pt.tank, color: pt.color, icl: iclOf(pt.last, snap.vars) }))
      .sort((a, b) => (b.icl ?? -1) - (a.icl ?? -1));
    tableEl.innerHTML = `<div class="lq-comp-icl">${ranked.map((r) => `
      <div class="lq-comp-icl-row">
        <span class="lq-dot-sm" style="background:${r.color}"></span>
        <b>${esc(r.tank)}</b>
        <span class="grow"></span>
        <span style="color:${larviColor(r.icl != null ? 100 - r.icl : null)};font-weight:900">ICL‑Q ${r.icl != null ? r.icl.toFixed(0) : '—'}</span>
      </div>`).join('')}</div>`;
  }
}

/* ============================================================
   COMPARAR CORRIDAS (LQ1)
   ============================================================ */
const corrSel = { a: '', b: '' };

/** Resumen de una corrida con las vars vigentes. Si `mod` está definido, acota al módulo. */
function corridaSummary(corr, vars, mod) {
  const rows = store.globalData.filter((r) => isLarviculturaRow(r) && getField(r, F.corrida) === corr && (!mod || getField(r, F.modulo) === mod));
  const daily = dailySeries(rows, vars);
  const last = lastState(daily, vars);
  const icl = iclOf(last, vars);
  const svVals = rows.map((r) => parseNum(r, F.supervivencia)).filter((x) => x !== null);
  const sv = svVals.length ? svVals.reduce((a, b) => a + b, 0) / svVals.length : null;
  const score = (icl !== null && sv !== null) ? 0.7 * icl + 0.3 * Math.min(sv, 100) : icl;
  return { rows, last, icl, sv, score };
}

function renderCorrComp(body) {
  const { vars } = snap;
  // Acota las corridas comparables al MÓDULO seleccionado en el filtro principal
  // (comparar el mismo módulo entre sus corridas). Sin módulo → todas.
  const mod = (snap.state && snap.state.modulo) || null;
  const corridas = [...new Set(store.globalData.filter(isLarviculturaRow)
    .filter((r) => !mod || getField(r, F.modulo) === mod)
    .map((r) => getField(r, F.corrida)).filter(Boolean))].sort(natCmp);
  if (!corridas.length) { body.innerHTML = '<div class="empty-state">Sin corridas para comparar.</div>'; return; }
  // A por defecto = la del filtro principal; B = otra corrida del mismo módulo (a escoger).
  if (!corrSel.a || !corridas.includes(corrSel.a)) corrSel.a = (snap.state && snap.state.corrida) || corridas[corridas.length - 1];
  if (!corrSel.b || !corridas.includes(corrSel.b)) corrSel.b = corridas.find((c) => c !== corrSel.a) || corrSel.a;

  const A = corridaSummary(corrSel.a, vars, mod), B = corridaSummary(corrSel.b, vars, mod);
  const opt = (val, cur) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(val)}</option>`;
  const sel = (dim, cur) => `<select class="lq-select" data-corrsel="${dim}">${corridas.map((c) => opt(c, cur)).join('')}</select>`;
  const fmtN = (v, d = 0, suf = '') => (v === null || v === undefined ? '—' : v.toFixed(d) + suf);
  const cmpRow = (label, a, b, d = 0, suf = '', up = true) => {
    let tag = '';
    if (a !== null && b !== null && Math.abs(a - b) > 1e-9) { const aBetter = up ? a > b : a < b; tag = ` <span class="lq-dot-sm" style="background:${aBetter ? '#1E88E5' : '#E53935'}"></span>`; }
    return `<tr><td><b>${label}</b></td><td>${fmtN(a, d, suf)}${tag}</td><td>${fmtN(b, d, suf)}</td></tr>`;
  };

  body.innerHTML = `
    <div class="lq-corr-controls">
      <label class="lq-hist-field"><span>🔵 Corrida A</span>${sel('a', corrSel.a)}</label>
      <label class="lq-hist-field"><span>🔴 Corrida B</span>${sel('b', corrSel.b)}</label>
    </div>
    <div class="lq-modal-hint">${mod ? `Módulo <b>${esc(mod)}</b> · ` : ''}Barras por variable (0–100, menor = mejor). El punto azul marca la corrida que gana la métrica.</div>
    <div class="lq-chart-host lg"><canvas id="lqCorrRadar"></canvas></div>
    <table class="lq-table lq-corr-table">
      <thead><tr><th>Métrica</th><th>🔵 C ${esc(corrSel.a)}</th><th>🔴 C ${esc(corrSel.b)}</th></tr></thead>
      <tbody>
        ${cmpRow('ICL‑Q (calidad)', A.icl, B.icl, 0, '', true)}
        ${cmpRow('Supervivencia', A.sv, B.sv, 1, '%', true)}
        ${cmpRow('Score compuesto', A.score, B.score, 0, '', true)}
      </tbody>
    </table>`;

  // Ejes sensibles: auto-escala al rango real de los datos (registros bajos).
  const allVals = vars.flatMap((v) => [A.last ? A.last[v.key] : null, B.last ? B.last[v.key] : null]).filter((x) => x !== null && x !== undefined);
  const lo = allVals.length ? Math.min(...allVals) : 0;
  const hi = allVals.length ? Math.max(...allVals) : 100;
  const pad = Math.max((hi - lo) * 0.2, 1);
  const yMin = Math.max(0, lo - pad), yMax = Math.min(100, hi + pad);
  makeChart('lqCorrRadar', {
    type: 'bar',
    data: {
      labels: vars.map((v) => v.short),
      datasets: [
        { label: 'C ' + corrSel.a, data: vars.map((v) => (A.last ? A.last[v.key] : null)), backgroundColor: '#1E88E5cc', borderColor: '#1E88E5', borderWidth: 1, borderRadius: 4 },
        { label: 'C ' + corrSel.b, data: vars.map((v) => (B.last ? B.last[v.key] : null)), backgroundColor: '#E53935cc', borderColor: '#E53935', borderWidth: 1, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { min: yMin, max: yMax, ticks: { callback: (v) => v + '%' } }, x: { grid: { display: false } } },
      plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? '—' : c.parsed.y.toFixed(1)}` } } },
    },
  });

  body.querySelectorAll('[data-corrsel]').forEach((s) => s.addEventListener('change', () => { corrSel[s.dataset.corrsel] = s.value; renderCorrComp(body); }));
}

/* ============================================================
   HISTORIAL · observaciones por tanque (Corrida → Módulo → Tanque)
   ============================================================ */
const histF = { corrida: '', modulo: '', tanque: '' };

function renderHistoria(body) {
  const all = store.globalData.filter(isLarviculturaRow);

  const corridas = [...new Set(all.map((r) => getField(r, F.corrida)).filter(Boolean))].sort(natCmp);
  if (histF.corrida && !corridas.includes(histF.corrida)) histF.corrida = '';
  const byCorr = all.filter((r) => !histF.corrida || getField(r, F.corrida) === histF.corrida);

  const modulos = [...new Set(byCorr.map((r) => getField(r, F.modulo)).filter(Boolean))].sort(natCmp);
  if (histF.modulo && !modulos.includes(histF.modulo)) histF.modulo = '';
  const byMod = byCorr.filter((r) => !histF.modulo || getField(r, F.modulo) === histF.modulo);

  const tanques = [...new Set(byMod.map((r) => getField(r, F.tanque)).filter(Boolean))].sort(natCmp);
  if (histF.tanque && !tanques.includes(histF.tanque)) histF.tanque = '';

  const opt = (val, cur, ph) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(val || ph)}</option>`;
  const sel = (dim, label, values, cur, ph) => `<label class="lq-hist-field"><span>${label}</span>
    <select class="lq-select" data-histf="${dim}">${opt('', cur, ph)}${values.map((v) => opt(String(v), cur, ph)).join('')}</select></label>`;

  const rows = obsHistorial(histF);
  const listHTML = rows.length
    ? `<div class="lq-hist-count">${rows.length} observación(es)</div>` + rows.map((r) => `
        <div class="lq-hist-item">
          <span class="lq-hist-date">${fechaTxt(r)}</span>
          <div class="lq-hist-meta">${esc(getField(r, F.modulo))} · ${esc(getField(r, F.tanque))}${getField(r, F.corrida) ? ' · C' + esc(getField(r, F.corrida)) : ''}</div>
          <p class="lq-hist-text">${esc(getField(r, ['Observaciones', 'observaciones', 'Observación']))}</p>
        </div>`).join('')
    : '<div class="empty-state">Sin observaciones para la combinación elegida.</div>';

  body.innerHTML = `<div class="lq-hist-filters">
      ${sel('corrida', 'Corrida', corridas, histF.corrida, 'Todas')}
      ${sel('modulo', 'Módulo', modulos, histF.modulo, 'Todos')}
      ${sel('tanque', 'Tanque', tanques, histF.tanque, 'Todos')}
    </div>
    <div class="lq-hist-list">${listHTML}</div>`;

  body.querySelectorAll('[data-histf]').forEach((s) =>
    s.addEventListener('change', () => { histF[s.dataset.histf] = s.value; renderHistoria(body); }));
}

/* ============================================================
   DECISIÓN RÁPIDA
   ============================================================ */
function renderDecision(body) {
  const { last, vars, icl } = snap;
  if (!last) { body.innerHTML = '<div class="empty-state">Sin datos para diagnosticar.</div>'; return; }

  const iclCol = larviColor(icl != null ? 100 - icl : null);
  let h = `<div class="lq-dec-icl" style="border-color:${iclCol}">
    <div class="lq-dec-icl-val" style="color:${iclCol}">${icl != null ? icl.toFixed(0) : '—'}</div>
    <div><div class="lq-dec-icl-lbl">Índice de Calidad Larvaria (ICL‑Q · 0–100)</div>
    <div class="muted">${larviLabel(icl != null ? 100 - icl : null)} · ${esc(snap.state.tanque || snap.state.modulo || 'Selección global')}</div></div>
  </div>`;

  // Variables ordenadas por severidad (peor primero)
  const ranked = vars.map((v) => ({ v, val: last[v.key] }))
    .filter((x) => x.val != null)
    .sort((a, b) => b.val - a.val);

  h += '<div class="lq-section-title">🔎 Variables por prioridad</div><div class="lq-dec-list">';
  ranked.forEach(({ v, val }) => {
    const zone = larviZone(val);
    const tip = zone !== 'optimo' && v.tips ? v.tips[zone] : 'En rango óptimo. Mantener protocolo.';
    h += `<div class="lq-dec-row">
      <span class="lq-state" style="background:${larviColor(val)}">${val.toFixed(0)}</span>
      <div class="grow">
        <div class="lq-dec-var">${esc(v.label)} · <span style="color:${larviColor(val)}">${larviLabel(val)}</span></div>
        <div class="lq-dec-tip">${esc(tip)}</div>
      </div>
    </div>`;
  });
  h += '</div>';

  // Combos correlacionados disparados
  const triggered = LARVI_COMBOS.filter((c) =>
    c.keys.every((k) => last[k] != null) && c.keys.every((k) => last[k] >= c.threshold));
  if (triggered.length) {
    h += '<div class="lq-section-title">⚠️ Patrones correlacionados</div><div class="lq-dec-combos">';
    triggered.forEach((c) => { h += `<div class="lq-dec-combo">${esc(c.msg)}</div>`; });
    h += '</div>';
  }

  body.innerHTML = h;
}
