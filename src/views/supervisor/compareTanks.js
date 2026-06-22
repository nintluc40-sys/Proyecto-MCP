/* ============================================================
   SUPERVISOR · Modal "Comparar Tanques" (Vista Ejecutiva)
   Compara la evolución diaria de una variable entre dos tanques
   cualesquiera (módulo/corrida/tanque A y B). Genera:
     · línea: evolución diaria de A y B
     · barras: diferencia diaria A−B (azul = A mayor, rojo = B mayor)
     · análisis de variabilidad (estadísticos + comparación)
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow, isTanqueRow } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { makeChart } from '../../core/charts.js';
import { iclSeries } from './params.js';
import { esc } from '../../core/format.js';
import { natCmp } from './columns.js';

// src: 'larv' (Larvicultura) · 'tanque' (Control_Tanque) · 'icl' (compuesto)
const CMP_VARS = [
  // Ambiente y población
  { key: 'sv',  label: '% Supervivencia', group: 'Ambiente y población', src: 'larv',   keys: F.supervivencia, unit: '%', dec: 1 },
  { key: 'od',  label: 'OD (mg/L)',       group: 'Ambiente y población', src: 'tanque', keys: F.od, unit: ' mg/L', dec: 2 },
  { key: 'tmp', label: 'Temperatura (°C)', group: 'Ambiente y población', src: 'tanque', keys: F.temp, unit: ' °C', dec: 1 },
  { key: 'sal', label: 'Salinidad (ppt)', group: 'Ambiente y población', src: 'larv',   keys: F.salinidad, unit: ' ppt', dec: 1 },
  { key: 'pop', label: 'Población',       group: 'Ambiente y población', src: 'larv',   keys: F.poblacion, unit: '', dec: 0 },
  // Calidad larvaria
  { key: 'il',  label: 'Intestino Lleno (%)', group: 'Calidad larvaria', src: 'larv', keys: ['Intestino_Lleno', 'IntestinoLleno', 'intestino_lleno'], unit: '%', dec: 1 },
  { key: 'lip', label: 'Lípidos (%)',     group: 'Calidad larvaria', src: 'larv',   keys: ['Lípidos', 'Lipidos', 'lipidos'], unit: '%', dec: 1 },
  { key: 'def', label: 'Deformidad (%)',  group: 'Calidad larvaria', src: 'larv',   keys: ['Deformidad', 'deformidad'], unit: '%', dec: 1 },
  { key: 'est', label: 'Estrés',          group: 'Calidad larvaria', src: 'larv',   keys: ['Estrés', 'Estres', 'estrés', 'estres'], unit: '', dec: 1 },
  { key: 'act', label: '% Actividad',     group: 'Calidad larvaria', src: 'larv',   keys: ['% Actividad', 'Actividad', '%Actividad'], unit: '%', dec: 1 },
  { key: 'plg', label: 'PL/g',            group: 'Calidad larvaria', src: 'larv',   keys: ['PLG', 'Plg', 'plg', 'PL/g', 'pl/g'], unit: '', dec: 1 },
  { key: 'icl', label: 'ICL',             group: 'Calidad larvaria', src: 'icl',    unit: '', dec: 0 },
  // Manejo de agua
  { key: 'esp', label: '% Espuma',        group: 'Manejo de agua', src: 'larv', keys: ['% Espuma', 'Espuma', 'espuma'], unit: '%', dec: 1 },
  { key: 'suc', label: '% Suciedad',      group: 'Manejo de agua', src: 'larv', keys: ['% Suciedad', 'Suciedad', 'suciedad'], unit: '%', dec: 1 },
  { key: 'rec', label: '% Recambio',      group: 'Manejo de agua', src: 'larv', keys: ['% Recambio', 'Recambio', 'recambio'], unit: '%', dec: 1 },
  { key: 'tra', label: '% Transparencia', group: 'Manejo de agua', src: 'larv', keys: ['% Transparencia', 'Transparencia', 'transparencia'], unit: '%', dec: 1 },
  { key: 'cel', label: 'Cel/ml (algas)',  group: 'Manejo de agua', src: 'larv', keys: ['Cel/ml', 'Cel_ml', 'cel/ml', 'Cel/Ml'], unit: '', dec: 0 },
  // LARVIA biométrico
  { key: 'peso',   label: 'Peso prom. (mg)',     group: 'LARVIA biométrico', src: 'larv', keys: ['Peso promedio (mg)', 'Peso_promedio', 'peso_promedio', 'Peso promedio'], unit: ' mg', dec: 2 },
  { key: 'long',   label: 'Longitud prom. (mm)', group: 'LARVIA biométrico', src: 'larv', keys: ['Longitud promedio (mm)', 'Longitud_promedio', 'longitud_promedio', 'Longitud promedio'], unit: ' mm', dec: 2 },
  { key: 'upeso',  label: 'Uniformidad de peso', group: 'LARVIA biométrico', src: 'larv', keys: ['Uniformidad de peso', 'Uniformidad_de_peso', 'Uniformidad_peso'], unit: '', dec: 1 },
  { key: 'ulong',  label: 'Uniformidad de longitud', group: 'LARVIA biométrico', src: 'larv', keys: ['Uniformidad de longitud', 'Uniformidad_de_longitud', 'Uniformidad_longitud'], unit: '', dec: 1 },
  { key: 'cvpeso', label: 'CV de peso',          group: 'LARVIA biométrico', src: 'larv', keys: ['CV de peso', 'CV_de_peso', 'CV_peso'], unit: '', dec: 1 },
  { key: 'cvlong', label: 'CV de longitud',      group: 'LARVIA biométrico', src: 'larv', keys: ['CV de longitud', 'CV_de_longitud', 'CV_longitud'], unit: '', dec: 1 },
  { key: 'pigm',   label: 'Pigmentación',        group: 'LARVIA biométrico', src: 'larv', keys: ['Pigmentación', 'Pigmentacion', 'pigmentacion'], unit: '', dec: 1 },
];
const VAR_GROUPS = ['Ambiente y población', 'Calidad larvaria', 'Manejo de agua', 'LARVIA biométrico'];

// mode: 'tank' (Módulo·Corrida·Tanque) · 'lote' · 'corrida'.
// axis: 'fecha' (calendario) · 'rel' (día relativo 1.º,2.º… → superpone periodos distintos).
const ctState = {
  var: 'sv', mode: 'tank', axis: 'fecha',
  A: { mod: '', cor: '', tq: '' }, B: { mod: '', cor: '', tq: '' },
  lote: { A: '', B: '' }, corrida: { A: '', B: '' },
};

const larvRows = () => store.globalData.filter(isLarviculturaRow);
const distinct = (arr) => [...new Set(arr.filter(Boolean))];

const modules = () => distinct(larvRows().map((r) => getField(r, F.modulo))).sort(natCmp);
const corridasOf = (mod) => distinct(larvRows().filter((r) => getField(r, F.modulo) === mod).map((r) => getField(r, F.corrida))).sort(natCmp);
const tanksOf = (mod, cor) => distinct(larvRows().filter((r) => getField(r, F.modulo) === mod && getField(r, F.corrida) === cor).map((r) => getField(r, F.tanque))).sort(natCmp);
// Listas globales (cruzan módulos y corridas) para los modos Lote y Corrida.
const allLotes = () => distinct(larvRows().map((r) => getField(r, F.lote))).sort(natCmp);
const allCorridasList = () => distinct(larvRows().map((r) => getField(r, F.corrida))).sort(natCmp);

/** Serie diaria (Map fecha→valor) de la variable, sobre las filas que cumplen `match`. */
function buildSeries(vdef, match) {
  if (vdef.src === 'icl') {
    const s = iclSeries(store.globalData.filter((r) => isLarviculturaRow(r) && match(r)));
    const m = new Map(); s.days.forEach((d, i) => { if (s.values[i] !== null && s.values[i] !== undefined) m.set(d, s.values[i]); });
    return m;
  }
  const base = vdef.src === 'tanque' ? store.globalData.filter(isTanqueRow) : larvRows();
  const rows = base.filter(match);
  const byDay = new Map();
  rows.forEach((r) => { const f = getField(r, F.fecha); const v = parseNum(r, vdef.keys); if (!f || v === null) return; if (!byDay.has(f)) byDay.set(f, []); byDay.get(f).push(v); });
  const out = new Map();
  byDay.forEach((vals, f) => out.set(f, vals.reduce((a, b) => a + b, 0) / vals.length));
  return out;
}

/** Predicado de filtrado de la serie `side` ('A'|'B') según el modo activo. null si incompleta. */
function matchFor(side) {
  if (ctState.mode === 'lote') { const l = ctState.lote[side]; return l ? (r) => getField(r, F.lote) === l : null; }
  if (ctState.mode === 'corrida') { const c = ctState.corrida[side]; return c ? (r) => getField(r, F.corrida) === c : null; }
  const s = ctState[side];
  if (!s.mod || !s.cor || !s.tq) return null;
  return (r) => getField(r, F.modulo) === s.mod
    && (s.cor === '*' || getField(r, F.corrida) === s.cor)
    && (s.tq === '*' || getField(r, F.tanque) === s.tq);
}

/** Etiqueta legible de la serie `side` según el modo. */
function sideLabel(side) {
  if (ctState.mode === 'lote') return ctState.lote[side] ? 'Lote ' + ctState.lote[side] : '—';
  if (ctState.mode === 'corrida') return ctState.corrida[side] ? 'C' + ctState.corrida[side] : '—';
  const s = ctState[side];
  return `${s.mod}·C${s.cor === '*' ? 'Todas' : s.cor}·${s.tq === '*' ? 'Todos' : s.tq}`;
}

const fmtV = (vdef, v) => (v === null || v === undefined) ? '—' : (vdef.dec === 0 ? Math.round(v).toLocaleString('es-EC') : v.toFixed(vdef.dec)) + vdef.unit;

function statsOf(vals) {
  const a = vals.filter((v) => v !== null && v !== undefined);
  if (!a.length) return null;
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const std = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length);
  return { n: a.length, mean, min: Math.min(...a), max: Math.max(...a), std, cv: mean !== 0 ? std / Math.abs(mean) * 100 : null };
}

function pearson(pairs) {
  const n = pairs.length; if (n < 2) return null;
  const ma = pairs.reduce((s, p) => s + p[0], 0) / n, mb = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, da = 0, db = 0;
  pairs.forEach(([a, b]) => { const u = a - ma, v = b - mb; num += u * v; da += u * u; db += v * v; });
  return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : null;
}

/** HTML del botón que abre el modal. */
export const compareTanksButtonHTML = () => `<button class="sv-action-btn sv-ctt-btn" data-ctt-open>⚖️ Comparar Tanques</button>`;

/** HTML del modal (cuerpo se rellena en setup). */
export const compareTanksModalHTML = () => `<div class="sv-modal" id="svCmpTankModal" data-cttmodal>
  <div class="sv-modal-card lv-fs-card">
    <div class="sv-modal-head">
      <span class="sv-modal-title">⚖️ Comparar Tanques</span>
      <button class="sv-modal-x" data-ctt-close aria-label="Cerrar">✕</button>
    </div>
    <div class="sv-modal-body">
      <div id="cttConfig"></div>
      <div id="cttOutput"></div>
    </div>
  </div>
</div>`;

/** Conecta el modal: cascada de selects, generar y gráficos. */
export function setupCompareTanks(root) {
  const overlay = root.querySelector('#svCmpTankModal');
  if (!overlay) return;
  const cfg = overlay.querySelector('#cttConfig');
  const out = overlay.querySelector('#cttOutput');

  const open = () => { renderConfig(); out.innerHTML = ''; overlay.classList.add('sv-open'); document.body.classList.add('modal-open'); };
  const close = () => { overlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
  root.querySelectorAll('[data-ctt-open]').forEach((b) => b.addEventListener('click', open));
  overlay.querySelector('[data-ctt-close]')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // `withAll` = anteponer opción "Todos" (valor '*').
  function selHTML(attr, cur, list, ph, withAll) {
    const allOpt = withAll ? `<option value="*" ${cur === '*' ? 'selected' : ''}>— Todos —</option>` : '';
    return `<select data-ct="${attr}" class="sv-modal-select"><option value="">${esc(ph)}</option>${allOpt}${list.map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  }

  function varSelectHTML() {
    const groups = VAR_GROUPS.map((g) => {
      const opts = CMP_VARS.filter((v) => v.group === g).map((v) => `<option value="${v.key}" ${v.key === ctState.var ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
      return `<optgroup label="${esc(g)}">${opts}</optgroup>`;
    }).join('');
    return `<select data-ct="var" class="sv-modal-select">${groups}</select>`;
  }

  // Columna simple (un solo select) para los modos Lote y Corrida.
  const simpleCol = (key, dimAttr, value, list, lbl, color, icon) => `<div class="ctt-col">
        <div class="ctt-col-title" style="color:${color}">${icon} Serie ${key}</div>
        <label class="ctt-field"><span>${lbl} ${key}</span>
          <select data-${dimAttr}="${key}" class="sv-modal-select"><option value="">${lbl}</option>${list.map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
        </label>
      </div>`;
  const modePill = (m, label) => `<button type="button" class="sv-bm-mode-btn ${ctState.mode === m ? 'is-active' : ''}" data-ctmode="${m}">${label}</button>`;
  const axisPill = (a, label) => `<button type="button" class="sv-bm-mode-btn ${ctState.axis === a ? 'is-active' : ''}" data-ctaxis="${a}">${label}</button>`;

  function renderConfig() {
    const mods = modules();
    ['A', 'B'].forEach((s) => { if (ctState[s].mod && !mods.includes(ctState[s].mod)) ctState[s] = { mod: '', cor: '', tq: '' }; });
    const A = ctState.A, B = ctState.B;
    // Tanques: si corrida = "Todos" o sin corrida, solo se ofrece "Todos".
    const tankList = (st) => (st.mod && st.cor && st.cor !== '*') ? tanksOf(st.mod, st.cor) : [];
    const colHTML = (key, st, color, icon) => `<div class="ctt-col">
        <div class="ctt-col-title" style="color:${color}">${icon} Serie ${key}</div>
        <label class="ctt-field"><span>MÓDULO ${key}</span>${selHTML(key + '.mod', st.mod, mods, 'Módulo', false)}</label>
        <label class="ctt-field"><span>CORRIDA ${key}</span>${selHTML(key + '.cor', st.cor, st.mod ? corridasOf(st.mod) : [], 'Corrida', !!st.mod)}</label>
        <label class="ctt-field"><span>TANQUE ${key}</span>${selHTML(key + '.tq', st.tq, tankList(st), 'Tanque', !!st.mod && !!st.cor)}</label>
      </div>`;

    let seriesHTML;
    if (ctState.mode === 'lote') {
      const lotes = allLotes();
      ['A', 'B'].forEach((s) => { if (ctState.lote[s] && !lotes.includes(ctState.lote[s])) ctState.lote[s] = ''; });
      seriesHTML = `<div class="ctt-series">${simpleCol('A', 'ctlote', ctState.lote.A, lotes, 'LOTE', '#1E88E5', '🔵')}${simpleCol('B', 'ctlote', ctState.lote.B, lotes, 'LOTE', '#E53935', '🔴')}</div>`;
    } else if (ctState.mode === 'corrida') {
      const cors = allCorridasList();
      ['A', 'B'].forEach((s) => { if (ctState.corrida[s] && !cors.includes(ctState.corrida[s])) ctState.corrida[s] = ''; });
      seriesHTML = `<div class="ctt-series">${simpleCol('A', 'ctcor', ctState.corrida.A, cors, 'CORRIDA', '#1E88E5', '🔵')}${simpleCol('B', 'ctcor', ctState.corrida.B, cors, 'CORRIDA', '#E53935', '🔴')}</div>`;
    } else {
      seriesHTML = `<div class="ctt-series">${colHTML('A', A, '#1E88E5', '🔵')}${colHTML('B', B, '#E53935', '🔴')}</div>`;
    }

    cfg.innerHTML = `
      <label class="ctt-field ctt-var"><span>VARIABLE</span>${varSelectHTML()}</label>
      <div class="ctt-modebar">
        <span class="ctt-mode-lbl">Comparar por</span>
        ${modePill('tank', '🐟 Tanque')}${modePill('lote', '📦 Lote')}${modePill('corrida', '🔄 Corrida')}
        <span class="ctt-mode-gap"></span>
        <span class="ctt-mode-lbl">Eje</span>
        ${axisPill('fecha', '📅 Fecha')}${axisPill('rel', '📈 Día relativo')}
      </div>
      ${seriesHTML}
      <button class="sv-action-btn ctt-gen" data-ct-generate>📈 Generar comparación</button>`;
    cfg.querySelectorAll('[data-ct]').forEach((el) => el.addEventListener('change', onChange));
    cfg.querySelectorAll('[data-ctlote]').forEach((el) => el.addEventListener('change', () => { ctState.lote[el.dataset.ctlote] = el.value; }));
    cfg.querySelectorAll('[data-ctcor]').forEach((el) => el.addEventListener('change', () => { ctState.corrida[el.dataset.ctcor] = el.value; }));
    cfg.querySelectorAll('[data-ctmode]').forEach((b) => b.addEventListener('click', () => { ctState.mode = b.dataset.ctmode; renderConfig(); }));
    cfg.querySelectorAll('[data-ctaxis]').forEach((b) => b.addEventListener('click', () => {
      ctState.axis = b.dataset.ctaxis;
      cfg.querySelectorAll('[data-ctaxis]').forEach((x) => x.classList.toggle('is-active', x === b));
      if (out.querySelector('#cttLine')) generate(); // re-dibuja si ya hay una comparación
    }));
    cfg.querySelector('[data-ct-generate]').addEventListener('click', generate);
  }

  function onChange(e) {
    const attr = e.target.dataset.ct, val = e.target.value;
    if (attr === 'var') { ctState.var = val; return; }
    const [s, field] = attr.split('.');
    ctState[s][field] = val;
    if (field === 'mod') { ctState[s].cor = ''; ctState[s].tq = ''; }
    if (field === 'cor') { ctState[s].tq = (val === '*') ? '*' : ''; } // Corrida=Todos → Tanque=Todos
    renderConfig();
  }

  function generate() {
    const vdef = CMP_VARS.find((v) => v.key === ctState.var);
    const mA = matchFor('A'), mB = matchFor('B');
    if (!mA || !mB) {
      const what = ctState.mode === 'lote' ? 'un lote para A y B'
        : ctState.mode === 'corrida' ? 'una corrida para A y B'
        : 'módulo, corrida y tanque para A y B';
      out.innerHTML = `<div class="empty-state">Selecciona ${what}.</div>`; return;
    }
    const seA = buildSeries(vdef, mA), seB = buildSeries(vdef, mB);

    // Eje: 'fecha' = calendario (une las fechas de ambas series) · 'rel' = día
    // relativo (ordinal 1.º,2.º… de cada serie) → superpone periodos distintos.
    const rel = ctState.axis === 'rel';
    let labels, va, vb;
    if (rel) {
      const ordered = (m) => [...m.entries()].sort((a, b) => (parseAnyDate(a[0]) || 0) - (parseAnyDate(b[0]) || 0)).map((e) => e[1]);
      const aV = ordered(seA), bV = ordered(seB), n = Math.max(aV.length, bV.length);
      if (!n) { out.innerHTML = '<div class="empty-state">Sin datos de la variable para esa selección.</div>'; return; }
      labels = Array.from({ length: n }, (_, i) => 'Día ' + (i + 1));
      va = labels.map((_, i) => (i < aV.length ? aV[i] : null));
      vb = labels.map((_, i) => (i < bV.length ? bV[i] : null));
    } else {
      const dates = [...new Set([...seA.keys(), ...seB.keys()])].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
      if (!dates.length) { out.innerHTML = '<div class="empty-state">Sin datos de la variable para esa selección.</div>'; return; }
      labels = dates;
      va = dates.map((d) => (seA.has(d) ? seA.get(d) : null));
      vb = dates.map((d) => (seB.has(d) ? seB.get(d) : null));
    }
    const diff = labels.map((_, i) => (va[i] !== null && vb[i] !== null) ? va[i] - vb[i] : null);

    const sa = statsOf(va), sb = statsOf(vb);
    const pairs = labels.map((_, i) => [va[i], vb[i]]).filter((p) => p[0] !== null && p[1] !== null);
    const avgDiff = pairs.length ? pairs.reduce((s, p) => s + (p[0] - p[1]), 0) / pairs.length : null;
    const aWins = pairs.filter((p) => p[0] > p[1]).length;
    const bWins = pairs.filter((p) => p[1] > p[0]).length;
    const r = pearson(pairs);

    const labA = sideLabel('A'), labB = sideLabel('B');
    const unit = rel ? 'punto(s)' : 'día(s)';
    const evoTitle = rel ? 'Evolución por día relativo' : 'Evolución diaria';
    const axisNote = rel
      ? 'Eje por <b>día relativo</b> (1.º, 2.º… registro de cada serie): superpone periodos distintos para comparar línea sobre línea.'
      : 'Eje por <b>fecha</b> de calendario (periodos distintos se ven separados).';
    const statRow = (lab, st, color) => st ? `<tr>
        <td><b style="color:${color}">${esc(lab)}</b></td>
        <td>${fmtV(vdef, st.mean)}</td><td>${fmtV(vdef, st.min)}</td><td>${fmtV(vdef, st.max)}</td>
        <td>${st.std.toFixed(vdef.dec === 0 ? 0 : 2)}</td><td>${st.cv === null ? '—' : st.cv.toFixed(1) + '%'}</td><td>${st.n}</td>
      </tr>` : '';

    out.innerHTML = `
      <div class="sv-modal-note" style="margin:2px 0 8px">${axisNote}</div>
      <div class="ctt-out-title">📈 ${evoTitle} · ${esc(vdef.label)} <span class="muted" style="font-weight:600;font-size:11px">· 🔵 ${esc(labA)} vs 🔴 ${esc(labB)}</span></div>
      <div class="sv-chart-host" style="height:300px"><canvas id="cttLine"></canvas></div>
      <div class="ctt-out-title">📊 Diferencia (A − B) <span class="muted" style="font-weight:600;font-size:11px">azul = A mayor · rojo = B mayor</span></div>
      <div class="sv-chart-host" style="height:220px"><canvas id="cttDiff"></canvas></div>
      <div class="ctt-out-title">🧮 Análisis de Variabilidad</div>
      <div class="card" style="padding:0;overflow:auto;margin-bottom:12px">
        <table class="sv-table">
          <thead><tr><th>Serie</th><th>Media</th><th>Mín</th><th>Máx</th><th>Desv. est.</th><th>CV</th><th>n</th></tr></thead>
          <tbody>${statRow(labA, sa, '#1E88E5')}${statRow(labB, sb, '#E53935')}</tbody>
        </table>
      </div>
      <div class="ctt-cmp">
        <span class="sv-modal-kpi"><b>${avgDiff === null ? '—' : (avgDiff >= 0 ? '+' : '') + avgDiff.toFixed(vdef.dec === 0 ? 0 : 2)}</b>Δ medio A−B</span>
        <span class="sv-modal-kpi"><b>${aWins}</b>A&gt;B</span>
        <span class="sv-modal-kpi"><b>${bWins}</b>B&gt;A</span>
        <span class="sv-modal-kpi"><b>${r === null ? '—' : r.toFixed(2)}</b>correlación</span>
        <span class="sv-modal-kpi"><b>${pairs.length}</b>${unit} comparables</span>
      </div>`;

    makeChart('cttLine', {
      type: 'line',
      data: { labels, datasets: [
        { label: labA, data: va, borderColor: '#1E88E5', backgroundColor: 'rgba(30,136,229,.10)', tension: .3, spanGaps: true, pointRadius: 2, fill: false },
        { label: labB, data: vb, borderColor: '#E53935', backgroundColor: 'rgba(229,57,53,.10)', tension: .3, spanGaps: true, pointRadius: 2, fill: false },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: { y: { ticks: { callback: (v) => fmtV(vdef, v) } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } } },
        plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtV(vdef, c.parsed.y)}` } } },
      },
    });
    makeChart('cttDiff', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'A − B', data: diff, backgroundColor: diff.map((d) => d === null ? '#cfd8dc' : d >= 0 ? '#1E88E5cc' : '#E53935cc'), borderColor: diff.map((d) => d === null ? '#cfd8dc' : d >= 0 ? '#1E88E5' : '#E53935'), borderWidth: 1 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { ticks: { callback: (v) => fmtV(vdef, v) }, grid: { color: (c) => (c.tick.value === 0 ? '#90a4ae' : '#eceff1') } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `A−B: ${fmtV(vdef, c.parsed.y)}` } } },
      },
    });
  }
}
