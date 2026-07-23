/* ============================================================
   SUPERVISOR · Modal "Comparar Tanques" (Vista Ejecutiva)
   Compara la evolución diaria de una variable entre dos tanques
   cualesquiera (módulo/corrida/tanque A y B). Genera:
     · línea: evolución diaria de A y B
     · barras: diferencia diaria A−B (azul = A mayor, rojo = B mayor)
     · análisis de variabilidad (estadísticos + comparación)
   Modo "Módulo (masivo)": grafica TODAS las corridas de un módulo
   alineadas por día relativo (las fechas reales de cada corrida no
   coinciden), conmutable entre superpuesto y mini-gráficos apilados.
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow, isTanqueRow } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { makeChart, destroyChart } from '../../core/charts.js';
import { iclSeries } from './params.js';
import { esc } from '../../core/format.js';
import { natCmp } from '../../core/util.js';
import { bindModal } from './ui.js';

// src: 'larv' (Larvicultura) · 'tanque' (Control_Tanque) · 'icl' (compuesto)
// dir: 'up' (mayor = mejor) · 'down' (menor = mejor) · ausente = sin dirección de mejora
//      (variables con rango óptimo o de manejo: el veredicto NO corona ganador, solo compara).
const CMP_VARS = [
  // Ambiente y población
  { key: 'sv',  label: '% Supervivencia', group: 'Ambiente y población', src: 'larv',   keys: F.supervivencia, unit: '%', dec: 1, dir: 'up' },
  { key: 'od',  label: 'OD (mg/L)',       group: 'Ambiente y población', src: 'tanque', keys: F.od, unit: ' mg/L', dec: 2 },
  { key: 'tmp', label: 'Temperatura (°C)', group: 'Ambiente y población', src: 'tanque', keys: F.temp, unit: ' °C', dec: 1 },
  { key: 'sal', label: 'Salinidad (ppt)', group: 'Ambiente y población', src: 'larv',   keys: F.salinidad, unit: ' ppt', dec: 1 },
  { key: 'pop', label: 'Población',       group: 'Ambiente y población', src: 'larv',   keys: F.poblacion, unit: '', dec: 0, dir: 'up' },
  // Calidad larvaria
  { key: 'il',  label: 'Intestino Lleno (%)', group: 'Calidad larvaria', src: 'larv', keys: ['Intestino_Lleno', 'IntestinoLleno', 'intestino_lleno'], unit: '%', dec: 1, dir: 'up' },
  { key: 'lip', label: 'Lípidos (%)',     group: 'Calidad larvaria', src: 'larv',   keys: ['Lípidos', 'Lipidos', 'lipidos'], unit: '%', dec: 1, dir: 'up' },
  { key: 'def', label: 'Deformidad (%)',  group: 'Calidad larvaria', src: 'larv',   keys: ['Deformidad', 'deformidad'], unit: '%', dec: 1, dir: 'down' },
  { key: 'est', label: 'Estrés',          group: 'Calidad larvaria', src: 'larv',   keys: ['Estrés', 'Estres', 'estrés', 'estres'], unit: '', dec: 1, dir: 'down' },
  { key: 'act', label: '% Actividad',     group: 'Calidad larvaria', src: 'larv',   keys: ['% Actividad', 'Actividad', '%Actividad'], unit: '%', dec: 1, dir: 'up' },
  { key: 'plg', label: 'PL/g',            group: 'Calidad larvaria', src: 'larv',   keys: ['PLG', 'Plg', 'plg', 'PL/g', 'pl/g'], unit: '', dec: 1, dir: 'down' },
  { key: 'icl', label: 'ICL',             group: 'Calidad larvaria', src: 'icl',    unit: '', dec: 0, dir: 'up' },
  // Manejo de agua
  { key: 'esp', label: '% Espuma',        group: 'Manejo de agua', src: 'larv', keys: ['% Espuma', 'Espuma', 'espuma'], unit: '%', dec: 1, dir: 'down' },
  { key: 'suc', label: '% Suciedad',      group: 'Manejo de agua', src: 'larv', keys: ['% Suciedad', 'Suciedad', 'suciedad'], unit: '%', dec: 1, dir: 'down' },
  { key: 'rec', label: '% Recambio',      group: 'Manejo de agua', src: 'larv', keys: ['% Recambio', 'Recambio', 'recambio'], unit: '%', dec: 1 },
  { key: 'tra', label: '% Transparencia', group: 'Manejo de agua', src: 'larv', keys: ['% Transparencia', 'Transparencia', 'transparencia'], unit: '%', dec: 1 },
  { key: 'cel', label: 'Cel/ml (algas)',  group: 'Manejo de agua', src: 'larv', keys: ['Cel/ml', 'Cel_ml', 'cel/ml', 'Cel/Ml'], unit: '', dec: 0, dir: 'up' },
  // LARVIA biométrico
  { key: 'peso',   label: 'Peso prom. (mg)',     group: 'LARVIA biométrico', src: 'larv', keys: ['Peso promedio (mg)', 'Peso_promedio', 'peso_promedio', 'Peso promedio'], unit: ' mg', dec: 2, dir: 'up' },
  { key: 'long',   label: 'Longitud prom. (mm)', group: 'LARVIA biométrico', src: 'larv', keys: ['Longitud promedio (mm)', 'Longitud_promedio', 'longitud_promedio', 'Longitud promedio'], unit: ' mm', dec: 2, dir: 'up' },
  { key: 'upeso',  label: 'Uniformidad de peso', group: 'LARVIA biométrico', src: 'larv', keys: ['Uniformidad de peso', 'Uniformidad_de_peso', 'Uniformidad_peso'], unit: '', dec: 1, dir: 'up' },
  { key: 'ulong',  label: 'Uniformidad de longitud', group: 'LARVIA biométrico', src: 'larv', keys: ['Uniformidad de longitud', 'Uniformidad_de_longitud', 'Uniformidad_longitud'], unit: '', dec: 1, dir: 'up' },
  { key: 'cvpeso', label: 'CV de peso',          group: 'LARVIA biométrico', src: 'larv', keys: ['CV de peso', 'CV_de_peso', 'CV_peso'], unit: '', dec: 1, dir: 'down' },
  { key: 'cvlong', label: 'CV de longitud',      group: 'LARVIA biométrico', src: 'larv', keys: ['CV de longitud', 'CV_de_longitud', 'CV_longitud'], unit: '', dec: 1, dir: 'down' },
  { key: 'pigm',   label: 'Pigmentación',        group: 'LARVIA biométrico', src: 'larv', keys: ['Pigmentación', 'Pigmentacion', 'pigmentacion'], unit: '', dec: 1, dir: 'up' },
];
const VAR_GROUPS = ['Ambiente y población', 'Calidad larvaria', 'Manejo de agua', 'LARVIA biométrico'];

// mode: 'tank' (Módulo·Corrida·Tanque) · 'lote' · 'corrida' · 'modulo' (masivo:
//       todas las corridas de un módulo; el eje es SIEMPRE día relativo).
// axis: 'fecha' (calendario) · 'rel' (día relativo 1.º,2.º… → superpone periodos distintos).
// massLayout: 'overlay' (un gráfico superpuesto) · 'stack' (mini-gráficos apilados).
const ctState = {
  var: 'sv', mode: 'tank', axis: 'fecha',
  A: { mod: '', cor: '', tq: '' }, B: { mod: '', cor: '', tq: '' },
  lote: { A: '', B: '' }, corrida: { A: '', B: '' },
  modulo: '', massLayout: 'overlay',
};

// Paleta categórica del modo masivo, validada (banda de luminosidad, croma,
// separación para daltonismo y contraste) para tema claro y oscuro. El ORDEN es
// el mecanismo de seguridad CVD — no reordenar ni ciclar: de la 9.ª corrida en
// adelante se reutiliza el color con línea DISCONTINUA (codificación secundaria)
// y la tabla de estadísticos por corrida actúa como vista-tabla de apoyo.
const MASS_COLORS_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const MASS_COLORS_DARK  = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
const massPalette = () =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? MASS_COLORS_DARK : MASS_COLORS_LIGHT;

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

/**
 * Veredicto de la comparación A vs B para una variable, CONSIDERANDO su dirección de
 * mejora (`vdef.dir`): en Supervivencia mayor es mejor, en Deformidad/Estrés menor es
 * mejor. Sin esto, "A > B" engaña en las variables donde más es peor. PURA, exportada.
 * @returns {{kind:'nodata'}|{kind:'neutral',...}|{kind:'verdict',winner,tie,...}}
 */
export function compareVerdict(vdef, sa, sb, pairs) {
  if (!sa || !sb || !pairs || !pairs.length) return { kind: 'nodata' };
  const dMean = sa.mean - sb.mean;           // A − B
  const meanGap = Math.abs(dMean);
  const round = (v) => (vdef.dec === 0 ? Math.round(v) : +v.toFixed(vdef.dec));
  // Variables sin dirección de mejora (rango óptimo / manejo): no se corona ganador.
  if (!vdef.dir) return { kind: 'neutral', dMean, meanA: sa.mean, meanB: sb.mean };
  const isDown = vdef.dir === 'down';
  const better = (x, y) => (isDown ? x < y : x > y);
  let aBetter = 0, bBetter = 0, ties = 0;
  pairs.forEach(([a, b]) => { if (a === b) { ties++; return; } if (better(a, b)) aBetter++; else bBetter++; });
  // Empate técnico si las medias redondeadas a los decimales de la variable coinciden.
  const tie = round(sa.mean) === round(sb.mean);
  const winner = tie ? null : (better(sa.mean, sb.mean) ? 'A' : 'B');
  const winBetterDays = winner === 'A' ? aBetter : winner === 'B' ? bBetter : 0;
  return { kind: 'verdict', winner, tie, dir: vdef.dir, dMean, meanGap, aBetter, bBetter, ties, comparables: pairs.length, winBetterDays };
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

  bindModal(root, overlay, {
    openSel: '[data-ctt-open]', closeSel: '[data-ctt-close]',
    onOpen: () => { renderConfig(); out.innerHTML = ''; },
  });

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
    if (ctState.mode === 'modulo') {
      if (ctState.modulo && !mods.includes(ctState.modulo)) ctState.modulo = '';
      const layoutPill = (l, label) => `<button type="button" class="sv-bm-mode-btn ${ctState.massLayout === l ? 'is-active' : ''}" data-ctlayout="${l}">${label}</button>`;
      seriesHTML = `<div class="ctt-series">
        <div class="ctt-col">
          <div class="ctt-col-title" style="color:var(--c-brand)">🧩 Comparación masiva</div>
          <label class="ctt-field"><span>MÓDULO</span>
            <select data-ctmodsel class="sv-modal-select"><option value="">Módulo</option>${mods.map((m) => `<option value="${esc(m)}" ${m === ctState.modulo ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
          </label>
          <div class="ctt-mass-note">Grafica <b>todas las corridas</b> del módulo alineadas por <b>día relativo</b> (Día 1, 2, 3…): como cada corrida tiene fechas distintas, el calendario real no permite compararlas.</div>
        </div>
        <div class="ctt-col">
          <div class="ctt-col-title">🗂️ Presentación</div>
          <div class="ctt-mass-layouts">${layoutPill('overlay', '🔀 Superpuesto')}${layoutPill('stack', '📚 Apilado')}</div>
          <div class="ctt-mass-note">${ctState.massLayout === 'overlay'
            ? 'Un solo gráfico con una línea por corrida (clic en la leyenda para ocultar corridas).'
            : 'Un mini-gráfico por corrida, apilados con la misma escala para comparar de un vistazo.'}</div>
        </div>
      </div>`;
    } else if (ctState.mode === 'lote') {
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
        ${modePill('tank', 'Tanque')}${modePill('lote', '📦 Lote')}${modePill('corrida', '🔄 Corrida')}${modePill('modulo', '🧩 Módulo (masivo)')}
        <span class="ctt-mode-gap"></span>
        <span class="ctt-mode-lbl">Eje</span>
        ${ctState.mode === 'modulo'
          ? '<span class="chip" title="En la comparación masiva el eje es siempre el día relativo de cada corrida">📈 Día relativo (fijo)</span>'
          : axisPill('fecha', '📅 Fecha') + axisPill('rel', '📈 Día relativo')}
      </div>
      ${seriesHTML}
      <button class="sv-action-btn ctt-gen" data-ct-generate>📈 Generar comparación</button>`;
    cfg.querySelectorAll('[data-ct]').forEach((el) => el.addEventListener('change', onChange));
    cfg.querySelectorAll('[data-ctlote]').forEach((el) => el.addEventListener('change', () => { ctState.lote[el.dataset.ctlote] = el.value; }));
    cfg.querySelectorAll('[data-ctcor]').forEach((el) => el.addEventListener('change', () => { ctState.corrida[el.dataset.ctcor] = el.value; }));
    cfg.querySelector('[data-ctmodsel]')?.addEventListener('change', (e) => { ctState.modulo = e.target.value; });
    cfg.querySelectorAll('[data-ctlayout]').forEach((b) => b.addEventListener('click', () => {
      if (ctState.massLayout === b.dataset.ctlayout) return;
      ctState.massLayout = b.dataset.ctlayout;
      renderConfig(); // refresca pills activas + nota descriptiva
      if (out.firstElementChild) generate(); // re-dibuja si ya hay una comparación
    }));
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
    // Los canvases del resultado anterior van a ser reemplazados: destruye sus
    // instancias de Chart ANTES de perder la referencia (evita acumular
    // instancias huérfanas en el registro hasta el cambio de vista).
    out.querySelectorAll('canvas').forEach((c) => destroyChart(c));
    if (ctState.mode === 'modulo') { generateMass(vdef); return; }
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

    // Veredicto: conclusión de qué serie rinde mejor SEGÚN la dirección de la variable.
    const COL_A = '#1E88E5', COL_B = '#E53935';
    const verd = compareVerdict(vdef, sa, sb, pairs);
    let verdictBanner = '';
    if (verd.kind === 'verdict') {
      const dirNote = verd.dir === 'down' ? ' <span class="muted" style="font-weight:600">(menos es mejor)</span>' : '';
      if (verd.tie) {
        verdictBanner = `<div class="ctt-verdict ctt-verdict-tie">🤝 <b>Empate técnico</b> en ${esc(vdef.label)}${dirNote} — medias equivalentes (${fmtV(vdef, sa.mean)} vs ${fmtV(vdef, sb.mean)}).</div>`;
      } else {
        const wLab = verd.winner === 'A' ? labA : labB, wCol = verd.winner === 'A' ? COL_A : COL_B;
        const wMean = verd.winner === 'A' ? sa.mean : sb.mean, lMean = verd.winner === 'A' ? sb.mean : sa.mean;
        verdictBanner = `<div class="ctt-verdict" style="border-left-color:${wCol}">🏆 <b style="color:${wCol}">${esc(wLab)}</b> rinde mejor en ${esc(vdef.label)}${dirNote} — media ${fmtV(vdef, wMean)} vs ${fmtV(vdef, lMean)} (Δ ${fmtV(vdef, verd.meanGap)}) · mejor en <b>${verd.winBetterDays}</b> de ${verd.comparables} ${unit} comparables.</div>`;
      }
    } else if (verd.kind === 'neutral') {
      verdictBanner = `<div class="ctt-verdict ctt-verdict-neutral">⚖️ <b>${esc(vdef.label)}</b> no tiene un valor «mejor» definido (rango óptimo o de manejo): se comparan sin coronar ganador — <span style="color:${COL_A}">${esc(labA)}</span> ${fmtV(vdef, sa.mean)} · <span style="color:${COL_B}">${esc(labB)}</span> ${fmtV(vdef, sb.mean)} (Δ A−B ${fmtV(vdef, verd.dMean)}).</div>`;
    }

    out.innerHTML = `
      <div class="sv-modal-note" style="margin:2px 0 8px">${axisNote}</div>
      ${verdictBanner}
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

  /** Comparación MASIVA: todas las corridas del módulo elegido, alineadas por
   *  día relativo. `massLayout` decide superpuesto (un gráfico, una línea por
   *  corrida) o apilado (mini-gráficos con escala Y común). */
  function generateMass(vdef) {
    const mod = ctState.modulo;
    if (!mod) { out.innerHTML = '<div class="empty-state">Selecciona un módulo.</div>'; return; }
    const cors = corridasOf(mod);
    if (!cors.length) { out.innerHTML = '<div class="empty-state">Ese módulo no tiene corridas registradas.</div>'; return; }

    // Serie por corrida, ordenada por fecha y reducida a ordinales (día relativo).
    const pal = massPalette();
    const withData = [];
    let skipped = 0;
    cors.forEach((c) => {
      const m = buildSeries(vdef, (r) => getField(r, F.modulo) === mod && getField(r, F.corrida) === c);
      const vals = [...m.entries()]
        .sort((a, b) => (parseAnyDate(a[0]) || 0) - (parseAnyDate(b[0]) || 0))
        .map((e) => e[1]);
      if (!vals.length) { skipped++; return; }
      withData.push({ cor: c, vals, st: statsOf(vals) });
    });
    if (!withData.length) { out.innerHTML = '<div class="empty-state">Sin datos de la variable para las corridas de ese módulo.</div>'; return; }
    // Color estable por corrida (misma asignación en superpuesto y apilado).
    withData.forEach((s, i) => { s.color = pal[i % pal.length]; s.dash = i >= pal.length ? [6, 4] : null; });

    const n = Math.max(...withData.map((s) => s.vals.length));
    const labels = Array.from({ length: n }, (_, i) => 'Día ' + (i + 1));
    const padded = (vals) => Array.from({ length: n }, (_, i) => (i < vals.length ? vals[i] : null));

    // Extremos comunes (escala Y compartida del layout apilado, con 5% de aire).
    const flat = withData.flatMap((s) => s.vals).filter((v) => v !== null && v !== undefined);
    const lo = Math.min(...flat), hi = Math.max(...flat);
    const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.05 || 1;

    const best = withData.reduce((a, s) => (s.st && (!a || s.st.mean > a.st.mean) ? s : a), null);
    const worst = withData.reduce((a, s) => (s.st && (!a || s.st.mean < a.st.mean) ? s : a), null);

    const chipOf = (s) => `<span class="ctt-mass-chip" style="background:${s.color}"></span>`;
    const statRows = withData.map((s) => s.st ? `<tr>
        <td>${chipOf(s)}<b>C${esc(s.cor)}</b></td>
        <td>${fmtV(vdef, s.st.mean)}</td><td>${fmtV(vdef, s.st.min)}</td><td>${fmtV(vdef, s.st.max)}</td>
        <td>${s.st.std.toFixed(vdef.dec === 0 ? 0 : 2)}</td><td>${s.st.cv === null ? '—' : s.st.cv.toFixed(1) + '%'}</td><td>${s.st.n}</td>
      </tr>` : '').join('');

    const overlay = ctState.massLayout === 'overlay';
    const chartsHTML = overlay
      ? `<div class="sv-chart-host" style="height:340px"><canvas id="cttMassChart"></canvas></div>`
      : withData.map((s, i) => `<div class="ctt-mass-row">
          <div class="ctt-mass-row-title"><span style="color:${s.color}">▉</span> C${esc(s.cor)} <span class="muted">· media ${fmtV(vdef, s.st ? s.st.mean : null)} · ${s.vals.length} día(s)</span></div>
          <div class="sv-chart-host" style="height:120px"><canvas id="cttMass_${i}"></canvas></div>
        </div>`).join('');

    out.innerHTML = `
      <div class="sv-modal-note" style="margin:2px 0 8px">Eje por <b>día relativo</b> (1.º, 2.º… registro de cada corrida): alinea corridas con fechas distintas para ver sus tendencias juntas.${skipped ? ` <b>${skipped}</b> corrida(s) sin datos de esta variable quedaron fuera.` : ''}</div>
      <div class="ctt-out-title">📈 ${esc(mod)} · todas las corridas · ${esc(vdef.label)} <span class="muted" style="font-weight:600;font-size:11px">· ${withData.length} corrida(s)</span></div>
      ${chartsHTML}
      <div class="ctt-out-title">🧮 Estadísticos por corrida</div>
      <div class="card" style="padding:0;overflow:auto;margin-bottom:12px">
        <table class="sv-table">
          <thead><tr><th>Corrida</th><th>Media</th><th>Mín</th><th>Máx</th><th>Desv. est.</th><th>CV</th><th>n</th></tr></thead>
          <tbody>${statRows}</tbody>
        </table>
      </div>
      <div class="ctt-cmp">
        <span class="sv-modal-kpi"><b>${withData.length}</b>corridas</span>
        <span class="sv-modal-kpi"><b>${n}</b>día(s) máx</span>
        <span class="sv-modal-kpi"><b>${best ? 'C' + esc(best.cor) : '—'}</b>media más alta</span>
        <span class="sv-modal-kpi"><b>${worst ? 'C' + esc(worst.cor) : '—'}</b>media más baja</span>
      </div>`;

    const dsOf = (s) => ({
      label: 'C' + s.cor, data: padded(s.vals), borderColor: s.color,
      backgroundColor: s.color + '1a', tension: .3, spanGaps: true, pointRadius: 2,
      fill: false, borderWidth: 2, ...(s.dash ? { borderDash: s.dash } : {}),
    });
    const yTicks = { callback: (v) => fmtV(vdef, v) };
    const xTicks = { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 };
    if (overlay) {
      makeChart('cttMassChart', {
        type: 'line',
        data: { labels, datasets: withData.map(dsOf) },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          scales: { y: { ticks: yTicks }, x: { ticks: xTicks } },
          plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtV(vdef, c.parsed.y)}` } } },
        },
      });
    } else {
      withData.forEach((s, i) => makeChart('cttMass_' + i, {
        type: 'line',
        data: { labels, datasets: [dsOf(s)] },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          // Escala Y COMÚN: sin ella cada mini-gráfico se auto-escala y las
          // tendencias dejarían de ser comparables entre corridas.
          scales: { y: { min: lo - pad, max: hi + pad, ticks: yTicks }, x: { ticks: xTicks } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `C${s.cor}: ${fmtV(vdef, c.parsed.y)}` } } },
        },
      }));
    }
  }
}
