/* ============================================================
   MICROBIOLOGÍA · vista con sub-navegación interna
   Sub-vistas: General · Bacteriología · Calidad de Agua · Patología.
   Bacteriología (Larvicultura) tiene 2 apartados:
     A · Conglomerado  — KPIs + niveles por patógeno + Agua/Animal + tabla.
     B · Placa Petri   — placa de agar (colonia=patógeno, radio∝log₁₀UFC),
                          con navegador de día · Tendencias · Alertas · Export.
   La Placa Petri replica petri_dashboard_completo_v2.html, en tema claro/oscuro.
   ============================================================ */
import { store } from '../../core/store.js';
import { destroyAllCharts, makeChart } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import { fmtShort } from '../../core/dates.js';
import { monthIndexOfCorrida, monthLabelAt } from '../supervisor/prodOmarsa.js';
import {
  isMicroRow, pathogenRecords, rowContext, meltRow, PATHOGENS, PATHOGEN_COLOR,
  NIVELES, NIVEL_COLOR, NIVEL_RANK, isAlerta, FORMATO_LABEL,
} from './data.js';
import { petriSVG, sparklineSVG } from './petri.js';

// ── sub-vistas del módulo ──
const SUBS = [
  { key: 'general', label: 'General', icon: '📊' },
  { key: 'bacteriologia', label: 'Bacteriología', icon: '🧫' },
  { key: 'calidad', label: 'Calidad de Agua', icon: '💧' },
  { key: 'patologia', label: 'Patología en fresco', icon: '🔬' },
];

// Estado persistente entre re-render.
const vState = {
  sub: 'bacteriologia', month: null, depto: null, corrida: null, modulo: null,
  ubic: null, estadio: null, formato: null, tipo: null,
  apartado: 'conglomerado', petriTab: 'placa', petriDay: null,
};

// Datos del render actual (para tooltips de la placa y export).
const _scope = { rows: [], records: [], colonies: [], theme: 'light' };
const _charts = { stack: null, aa: null };

// Filas de Microbiología memoizadas por identidad de store.globalData.
let _cache = { src: null, rows: [] };
function microRows() {
  if (_cache.src !== store.globalData) _cache = { src: store.globalData, rows: store.globalData.filter(isMicroRow) };
  return _cache.rows;
}

const themeNow = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
const fmtNum = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-EC');
const natCmp = (a, b) => { const x = String(a).match(/\d+/), y = String(b).match(/\d+/); return (x && y && +x[0] !== +y[0]) ? +x[0] - +y[0] : String(a).localeCompare(String(b)); };
const distinctSorted = (rows, pick, cmp = natCmp) => [...new Set(rows.map(pick).filter(Boolean))].sort(cmp);

/* ============================================================
   VISTA
   ============================================================ */
export function microbiologiaView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }
  destroyAllCharts();
  document.body.classList.remove('modal-open', 'dropdown-open');

  let h = headHTML() + subnavHTML();
  if (vState.sub === 'bacteriologia') h += renderBacteriologia();
  else h += placeholderHTML(SUBS.find((s) => s.key === vState.sub));
  h += `<div class="mic-tt" id="micTT"></div>`; // tooltip de colonias

  root.innerHTML = h;

  if (vState.sub === 'bacteriologia') {
    if (vState.apartado === 'conglomerado') drawConglomeradoCharts();
  }
  bind(root);
}

function headHTML() {
  return `<div class="mic-head">
      <div class="mic-title"><span class="mic-title-ic">🧫</span> Microbiología</div>
      <div class="mic-sub">Vigilancia microbiológica · Larvicultura · Maduración · Algas</div>
    </div>`;
}
function subnavHTML() {
  return `<div class="mic-subnav" role="tablist">
    ${SUBS.map((s) => `<button class="mic-pill ${s.key === vState.sub ? 'is-active' : ''}" data-mic-sub="${s.key}" role="tab">${s.icon} ${esc(s.label)}</button>`).join('')}
  </div>`;
}
function placeholderHTML(sub) {
  const extra = sub.key === 'patologia'
    ? 'La hoja de Patología en fresco aún no está disponible en el Google Sheet origen; se conectará cuando exista.'
    : 'Esta sub-vista llega en una tanda posterior.';
  return `<div class="empty-state" style="padding:56px 20px">
      <div style="font-size:40px">${sub.icon}</div>
      <h2 style="margin:10px 0 6px;color:var(--c-brand)">${esc(sub.label)}</h2>
      <p class="muted">🚧 ${esc(extra)}</p>
    </div>`;
}

/* ============================================================
   BACTERIOLOGÍA (Larvicultura)
   ============================================================ */
function renderBacteriologia() {
  const all = microRows();
  if (!all.length) return `<div class="empty-state">No se encontraron registros en la hoja <b>Microbiología</b> del Google Sheet.</div>`;

  // ── Barra de mes (corrida → mes) ──
  const allCorridas = [...new Set(all.map((r) => rowContext(r).corrida).filter(Boolean))];
  const months = [...new Set(allCorridas.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (vState.month == null || !months.includes(vState.month)) vState.month = months.length ? months[months.length - 1] : 0;
  const inMonth = (r) => { const c = rowContext(r).corrida; return !c || monthIndexOfCorrida(+c) === vState.month; };
  const monthRows = all.filter(inMonth);

  // ── Filtros en cascada ──
  const ctxOf = rowContext;
  const optDepto = distinctSorted(monthRows, (r) => ctxOf(r).departamento, (a, b) => a.localeCompare(b));
  if (vState.depto && !optDepto.includes(vState.depto)) vState.depto = null;
  const optCorrida = distinctSorted(monthRows, (r) => ctxOf(r).corrida, (a, b) => (+a) - (+b));
  if (vState.corrida && !optCorrida.includes(vState.corrida)) vState.corrida = null;
  const optModulo = distinctSorted(monthRows, (r) => ctxOf(r).modulo);
  if (vState.modulo && !optModulo.includes(vState.modulo)) vState.modulo = null;
  const optUbic = distinctSorted(monthRows, (r) => ctxOf(r).ubicacion);
  if (vState.ubic && !optUbic.includes(vState.ubic)) vState.ubic = null;
  const optEstadio = distinctSorted(monthRows, (r) => ctxOf(r).estadio);
  if (vState.estadio && !optEstadio.includes(vState.estadio)) vState.estadio = null;
  const optFormato = [...new Set(monthRows.map((r) => ctxOf(r).formatoKey).filter(Boolean))];
  if (vState.formato && !optFormato.includes(vState.formato)) vState.formato = null;
  const optTipo = distinctSorted(monthRows, (r) => ctxOf(r).tipoMuestra, (a, b) => a.localeCompare(b));
  if (vState.tipo && !optTipo.includes(vState.tipo)) vState.tipo = null;

  const rows = monthRows.filter((r) => {
    const c = ctxOf(r);
    return (!vState.depto || c.departamento === vState.depto)
      && (!vState.corrida || c.corrida === vState.corrida)
      && (!vState.modulo || c.modulo === vState.modulo)
      && (!vState.ubic || c.ubicacion === vState.ubic)
      && (!vState.estadio || c.estadio === vState.estadio)
      && (!vState.formato || c.formatoKey === vState.formato)
      && (!vState.tipo || c.tipoMuestra === vState.tipo);
  });
  _scope.rows = rows;
  _scope.records = pathogenRecords(rows);
  _scope.theme = themeNow();

  // ── Derivados para KPIs ──
  const summaries = rows.map(rowSummary);
  const kAlerta = summaries.filter((s) => isAlerta(s.worst)).length;
  const kLumin = summaries.filter((s) => s.lumin === true).length;
  const kTotUfc = summaries.reduce((a, s) => a + (s.totalesUfc || 0), 0);
  const dom = dominantPathogen(rows);

  // ── HTML: filtros + KPIs + apartados ──
  let h = `<div class="mic-filters">
      <div class="mic-monthbar">
        <button class="mic-month-nav" data-mic-month="-1" ${months.indexOf(vState.month) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
        <span class="mic-month-lbl">📅 ${esc(monthLabelAt(vState.month))}</span>
        <button class="mic-month-nav" data-mic-month="1" ${months.indexOf(vState.month) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
      </div>
      ${optDepto.length > 1 ? micSelect('depto', vState.depto, optDepto, 'Todos los deptos.') : ''}
      ${micSelect('corrida', vState.corrida, optCorrida, 'Todas las corridas', (v) => 'C' + v)}
      ${micSelect('modulo', vState.modulo, optModulo, 'Todos los módulos', (v) => 'M' + v)}
      ${micSelect('ubic', vState.ubic, optUbic, 'TQ / Reservorio')}
      ${micSelect('estadio', vState.estadio, optEstadio, 'Todos los estadíos')}
      ${micSelect('formato', vState.formato, optFormato, 'Todos los formatos', (v) => FORMATO_LABEL[v] || v)}
      ${micSelect('tipo', vState.tipo, optTipo, 'Agua + Animal')}
    </div>`;

  h += `<div class="mic-kpis">
      ${kpi('🧪', 'Muestras', String(rows.length))}
      ${kpi('⚠️', 'Mod./Elevado', `${kAlerta}`, kAlerta > 0, rows.length ? (kAlerta / rows.length * 100).toFixed(0) + '% de muestras' : '')}
      ${kpi('✨', 'V. Luminiscentes', kLumin > 0 ? `${kLumin}` : '0', kLumin > 0, kLumin > 0 ? 'con presencia' : 'sin presencia')}
      ${kpi('🦠', 'Patógeno dominante', dom ? dom.label : '—', false, dom ? `${dom.alertas} alerta(s)` : '')}
      ${kpi('🧫', 'Σ UFC C. Totales', fmtNum(kTotUfc))}
    </div>`;

  h += `<div class="mic-apartados">
      <button class="mic-ap ${vState.apartado === 'conglomerado' ? 'is-active' : ''}" data-mic-ap="conglomerado">📊 Conglomerado</button>
      <button class="mic-ap ${vState.apartado === 'petri' ? 'is-active' : ''}" data-mic-ap="petri">🧫 Placa Petri</button>
    </div>`;

  h += vState.apartado === 'petri' ? renderPetri(rows, summaries) : renderConglomerado(rows, summaries);
  return h;
}

/* ---- Apartado A · Conglomerado (Tanda 1) ---- */
function renderConglomerado(rows, summaries) {
  const cong = congByNivel(rows);
  _charts.stack = cong.labels.length ? cong : null;
  const aa = aguaAnimalAlertas(rows);
  _charts.aa = aa.labels.length ? aa : null;

  let h = band('🧫', 'Conglomerado por patógeno', '#006064');
  h += `<div class="mic-charts">
      <div class="card mic-chart-card">
        <div class="mic-chart-title">📊 Niveles por patógeno <span class="muted">· nº de muestras por grado de carga</span></div>
        <div class="mic-chart-host" style="height:${Math.max(240, (_charts.stack ? _charts.stack.labels.length : 1) * 30 + 70)}px">
          ${_charts.stack ? '<canvas id="micStack"></canvas>' : emptyBox('Sin niveles registrados para el filtro actual.')}
        </div>
        ${_charts.stack ? nivelLegend() : ''}
      </div>
      <div class="card mic-chart-card">
        <div class="mic-chart-title">💧🦐 Agua vs Animal <span class="muted">· muestras en Moderado/Elevado por patógeno</span></div>
        <div class="mic-chart-host" style="height:${Math.max(240, (_charts.aa ? _charts.aa.labels.length : 1) * 30 + 70)}px">
          ${_charts.aa ? '<canvas id="micAA"></canvas>' : emptyBox('Sin alertas Moderado/Elevado en el filtro actual.')}
        </div>
      </div>
    </div>`;
  h += band('📋', 'Muestras', '#00838F');
  h += tableHTML(rows, summaries);
  return h;
}

/* ---- Apartado B · Placa Petri (Tanda 2) ---- */
function renderPetri(rows) {
  const days = daysOf(rows);
  if (vState.petriDay == null || !days.some((d) => d.key === vState.petriDay)) vState.petriDay = days.length ? days[days.length - 1].key : null;
  const dayIdx = days.findIndex((d) => d.key === vState.petriDay);
  const day = dayIdx >= 0 ? days[dayIdx] : null;

  const tabBtn = (key, label) => `<button class="mic-petab ${vState.petriTab === key ? 'is-active' : ''}" data-mic-petab="${key}">${label}</button>`;
  let h = `<div class="mic-petri-bar">
      <div class="mic-petabs">${tabBtn('placa', 'Placa')}${tabBtn('tendencias', 'Tendencias')}${tabBtn('alertas', 'Alertas')}</div>
      <div class="mic-export"><button class="mic-exp" data-mic-export="csv">⬇ CSV</button><button class="mic-exp" data-mic-export="json">⬇ JSON</button><button class="mic-exp" data-mic-export="txt">⬇ Reporte</button></div>
    </div>`;

  if (vState.petriTab === 'placa') h += petriPlacaHTML(days, dayIdx, day);
  else if (vState.petriTab === 'tendencias') h += petriTendenciasHTML(rows);
  else h += petriAlertasHTML(rows);
  return h;
}

function petriPlacaHTML(days, dayIdx, day) {
  const colonies = day ? coloniesForDay(day.rows) : [];
  _scope.colonies = colonies;
  const size = 340;
  const totUfc = colonies.filter((c) => c.key === 'totales').reduce((a, c) => a + c.ufc, 0) || colonies.reduce((a, c) => a + c.ufc, 0);
  const maxC = colonies.length ? colonies.reduce((a, b) => (a.ufc > b.ufc ? a : b)) : null;
  const nav = `<div class="mic-day-nav">
      <button class="mic-month-nav" data-mic-day="-1" ${dayIdx <= 0 ? 'disabled' : ''} aria-label="Día anterior">◀</button>
      <span class="mic-day-lbl">${day ? esc(day.label) : '—'}</span>
      <button class="mic-month-nav" data-mic-day="1" ${dayIdx < 0 || dayIdx >= days.length - 1 ? 'disabled' : ''} aria-label="Día siguiente">▶</button>
    </div>`;

  const legend = colonies.length
    ? `<div class="mic-pe-legend">${colonies.map((c) => `<div class="mic-pe-leg"><span class="mic-pe-dot" style="background:${c.color}"></span><span class="mic-pe-leg-l">${esc(c.label)}</span><span class="mic-pe-leg-v">${fmtNum(c.ufc)}</span></div>`).join('')}</div>`
    : '<div class="muted" style="font-size:12px">Sin colonias para este día.</div>';

  return `<div class="mic-petri-main">
      <div class="card mic-petri-card">
        <div class="mic-chart-title">🧫 Placa de agar <span class="muted">· colonia = patógeno · tamaño ∝ log₁₀(UFC)</span></div>
        ${nav}
        <div class="mic-petri-dish">${petriSVG(colonies, size, _scope.theme)}</div>
        <div class="mic-petri-foot">${day ? day.rows.length : 0} muestra(s) · ${colonies.length} patógeno(s) con UFC</div>
      </div>
      <div class="card mic-petri-side">
        <div class="mic-chart-title">Resumen del día</div>
        <div class="mic-pe-sum">
          <div class="mic-pe-st"><div class="mic-pe-st-v">${fmtNum(totUfc)}</div><div class="mic-pe-st-l">Σ UFC C.Totales</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v">${maxC ? fmtNum(maxC.ufc) : '—'}</div><div class="mic-pe-st-l">UFC máx</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v">${colonies.length}</div><div class="mic-pe-st-l">Patógenos</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v" style="font-size:13px">${maxC ? esc(maxC.label) : '—'}</div><div class="mic-pe-st-l">Dominante</div></div>
        </div>
        <div class="mic-chart-title" style="margin-top:12px">Patógenos</div>
        ${legend}
      </div>
    </div>`;
}

function petriTendenciasHTML(rows) {
  const t = pathogenTrends(rows);
  if (t.days.length < 2) return `<div class="empty-state" style="padding:36px">Se necesitan al menos 2 días con registro para ver tendencias.<br><span class="muted">Filtro actual: ${t.days.length} día(s).</span></div>`;
  const arrow = (d) => d > 0 ? '<span style="color:#E53935">↑</span>' : d < 0 ? '<span style="color:#1ec86a">↓</span>' : '<span class="muted">→</span>';
  const rowsHtml = t.perPathogen.map((p) => `<div class="mic-tr-row">
      <div class="mic-tr-name"><span class="mic-pe-dot" style="background:${p.color}"></span>${esc(p.label)}</div>
      ${sparklineSVG(p.vals, p.color, 150, 34)}
      <div class="mic-tr-val">${fmtNum(p.latest)}</div>
      <div class="mic-tr-arr">${arrow(p.delta)}</div>
    </div>`).join('');
  return `<div class="card mic-trend-card">
      <div class="mic-chart-title">📈 Tendencia por patógeno <span class="muted">· Σ UFC por día (${esc(fmtShort(t.days[0].d))} → ${esc(fmtShort(t.days[t.days.length - 1].d))})</span></div>
      ${rowsHtml || '<div class="muted">Sin series.</div>'}
      <div class="mic-tr-total">
        <div class="mic-chart-title" style="margin:6px 0">Σ UFC C.Totales (todos)</div>
        ${sparklineSVG(t.totalVals, '#26A69A', 320, 46) || '<div class="muted">—</div>'}
      </div>
    </div>`;
}

function petriAlertasHTML(rows) {
  const list = alertList(rows);
  if (!list.length) return `<div class="empty-state" style="padding:36px">✓ Sin alertas (Moderado/Elevado ni V.Luminiscentes) para el filtro actual.</div>`;
  const VISIBLE = 14;
  const strip = (a, hidden) => {
    if (a.kind === 'lumin') {
      return `<div class="mic-alert ${hidden ? 'mic-row-hidden' : ''}" style="--ac:#7E57C2">
        <div class="mic-alert-h">✨ V. Luminiscentes · PRESENCIA</div>
        <div class="mic-alert-s">${esc(a.ctx.tipoMuestra || '—')} · C${esc(a.ctx.corrida || '—')} · M${esc(a.ctx.modulo || '—')} ${a.ctx.ubicacion ? '· ' + esc(a.ctx.ubicacion) : ''} · ${a.ctx.fecha ? esc(fmtShort(a.ctx.fecha)) : '—'}</div>
      </div>`;
    }
    return `<div class="mic-alert ${hidden ? 'mic-row-hidden' : ''}" style="--ac:${NIVEL_COLOR[a.nivel]}">
      <div class="mic-alert-h">${esc(a.nivel).toUpperCase()} · ${esc(a.label)}</div>
      <div class="mic-alert-s">${fmtNum(a.ufc)} UFC · ${esc(a.ctx.tipoMuestra || '—')} · C${esc(a.ctx.corrida || '—')} · M${esc(a.ctx.modulo || '—')} ${a.ctx.ubicacion ? '· ' + esc(a.ctx.ubicacion) : ''} · ${a.ctx.fecha ? esc(fmtShort(a.ctx.fecha)) : '—'}</div>
    </div>`;
  };
  const hiddenN = Math.max(0, list.length - VISIBLE);
  return `<div class="card mic-collap">
      <div class="mic-collap-head">
        <div class="mic-collap-title">⚠️ Alertas <span class="muted" style="font-weight:600;font-size:12px">· ${list.length}</span></div>
        ${hiddenN > 0 ? `<button class="mic-toggle" data-mic-toggle aria-expanded="false">Ver todo (${list.length})</button>` : ''}
      </div>
      <div class="mic-alert-list">${list.map((a, i) => strip(a, i >= VISIBLE)).join('')}</div>
    </div>`;
}

/* ============================================================
   Cálculos
   ============================================================ */
function rowSummary(row) {
  const c = rowContext(row);
  const melt = meltRow(row);
  let worst = '', worstRank = -1, totalesUfc = null;
  const alerts = [];
  melt.forEach((m) => {
    if (m.key === 'totales') totalesUfc = m.ufc;
    if (m.nivel) {
      const rk = NIVEL_RANK[m.nivel];
      if (rk > worstRank) { worstRank = rk; worst = m.nivel; }
      if (isAlerta(m.nivel)) alerts.push({ label: m.label, nivel: m.nivel });
    }
  });
  alerts.sort((a, b) => NIVEL_RANK[b.nivel] - NIVEL_RANK[a.nivel]);
  return { row, ctx: c, worst, totalesUfc, alerts, lumin: c.lumin };
}

function dominantPathogen(rows) {
  const m = new Map();
  pathogenRecords(rows).forEach((r) => {
    if (!m.has(r.key)) m.set(r.key, { key: r.key, label: r.label, alertas: 0, ufc: 0 });
    const o = m.get(r.key);
    if (isAlerta(r.nivel)) o.alertas++;
    if (r.ufc) o.ufc += r.ufc;
  });
  const arr = [...m.values()].filter((o) => o.alertas > 0).sort((a, b) => (b.alertas - a.alertas) || (b.ufc - a.ufc));
  return arr[0] || null;
}

function congByNivel(rows) {
  const recs = pathogenRecords(rows).filter((r) => r.nivel);
  const byKey = new Map();
  recs.forEach((r) => {
    if (!byKey.has(r.key)) byKey.set(r.key, { counts: { 'Mínimo': 0, 'Leve': 0, 'Moderado': 0, 'Elevado': 0 } });
    byKey.get(r.key).counts[r.nivel]++;
  });
  const labels = [], data = { 'Mínimo': [], 'Leve': [], 'Moderado': [], 'Elevado': [] };
  PATHOGENS.forEach((p) => {
    if (!byKey.has(p.key)) return;
    labels.push(p.label);
    NIVELES.forEach((n) => data[n].push(byKey.get(p.key).counts[n]));
  });
  return { labels, data };
}

function aguaAnimalAlertas(rows) {
  const byKey = new Map();
  pathogenRecords(rows).filter((r) => isAlerta(r.nivel)).forEach((r) => {
    if (!byKey.has(r.key)) byKey.set(r.key, { agua: 0, animal: 0 });
    const o = byKey.get(r.key);
    if (r.tipoMuestra === 'Agua') o.agua++; else if (r.tipoMuestra === 'Animal') o.animal++;
  });
  const labels = [], agua = [], animal = [];
  PATHOGENS.forEach((p) => {
    if (!byKey.has(p.key)) return;
    const o = byKey.get(p.key);
    labels.push(p.label); agua.push(o.agua); animal.push(o.animal);
  });
  return { labels, agua, animal };
}

/** Días con registro (asc) sobre las filas filtradas. */
function daysOf(rows) {
  const byDay = new Map();
  rows.forEach((r) => {
    const c = rowContext(r);
    if (!c.fecha || isNaN(c.fecha)) return;
    const key = c.fecha.getFullYear() + '-' + String(c.fecha.getMonth() + 1).padStart(2, '0') + '-' + String(c.fecha.getDate()).padStart(2, '0');
    if (!byDay.has(key)) byDay.set(key, { key, d: c.fecha, label: fmtShort(c.fecha), rows: [] });
    byDay.get(key).rows.push(r);
  });
  return [...byDay.values()].sort((a, b) => a.d - b.d);
}

/** Colonias de un día: 1 por patógeno con UFC>0 (Σ UFC del día). */
function coloniesForDay(dayRows) {
  const byKey = new Map();
  pathogenRecords(dayRows).forEach((r) => {
    if (!(r.ufc > 0)) return;
    if (!byKey.has(r.key)) byKey.set(r.key, { id: r.key, key: r.key, label: r.label, color: PATHOGEN_COLOR[r.key] || '#90A4AE', ufc: 0, nMuestras: 0, worstRank: -1, worst: '' });
    const o = byKey.get(r.key);
    o.ufc += r.ufc; o.nMuestras++;
    const rk = NIVEL_RANK[r.nivel] ?? -1;
    if (rk > o.worstRank) { o.worstRank = rk; o.worst = r.nivel; }
  });
  return [...byKey.values()].sort((a, b) => b.ufc - a.ufc);
}

/** Series por patógeno (Σ UFC por día) + total de C.Totales por día. */
function pathogenTrends(rows) {
  const days = daysOf(rows);
  const dayKeys = days.map((d) => d.key);
  const idx = Object.fromEntries(dayKeys.map((k, i) => [k, i]));
  const per = new Map();
  const total = new Array(days.length).fill(0);
  days.forEach((day, i) => {
    pathogenRecords(day.rows).forEach((r) => {
      if (!(r.ufc > 0)) return;
      if (!per.has(r.key)) per.set(r.key, { key: r.key, label: r.label, color: PATHOGEN_COLOR[r.key] || '#90A4AE', vals: new Array(days.length).fill(0) });
      per.get(r.key).vals[i] += r.ufc;
      if (r.key === 'totales') total[i] += r.ufc;
    });
  });
  void idx;
  const perPathogen = [...per.values()].map((p) => {
    const latest = p.vals[p.vals.length - 1] || 0;
    const prev = p.vals[p.vals.length - 2] || 0;
    return { ...p, latest, delta: latest - prev };
  }).sort((a, b) => b.latest - a.latest).slice(0, 10);
  return { days, perPathogen, totalVals: total };
}

/** Lista de alertas (patógenos Mod/Elev + presencia de V.Luminiscentes). */
function alertList(rows) {
  const out = [];
  rows.forEach((row) => {
    const c = rowContext(row);
    meltRow(row).forEach((m) => { if (isAlerta(m.nivel)) out.push({ kind: 'nivel', ctx: c, label: m.label, nivel: m.nivel, ufc: m.ufc }); });
    if (c.lumin === true) out.push({ kind: 'lumin', ctx: c });
  });
  out.sort((a, b) => {
    const ra = a.kind === 'lumin' ? 99 : NIVEL_RANK[a.nivel];
    const rb = b.kind === 'lumin' ? 99 : NIVEL_RANK[b.nivel];
    return (rb - ra) || ((b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  });
  return out;
}

/* ---- gráficos del conglomerado ---- */
function drawConglomeradoCharts() {
  const draw = (fn) => { try { fn(); } catch (e) { console.error('[microbiologia] chart', e); } };
  if (_charts.stack) draw(() => makeChart('micStack', {
    type: 'bar',
    data: { labels: _charts.stack.labels, datasets: NIVELES.map((n) => ({ label: n, data: _charts.stack.data[n], backgroundColor: NIVEL_COLOR[n], borderWidth: 0, stack: 's', borderRadius: 2 })) },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(120,140,150,.12)' } }, y: { stacked: true, grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    },
  }));
  if (_charts.aa) draw(() => makeChart('micAA', {
    type: 'bar',
    data: { labels: _charts.aa.labels, datasets: [
      { label: 'Agua', data: _charts.aa.agua, backgroundColor: '#1E88E5', borderRadius: 3 },
      { label: 'Animal', data: _charts.aa.animal, backgroundColor: '#8E24AA', borderRadius: 3 },
    ] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(120,140,150,.12)' } }, y: { grid: { display: false } } },
      plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
    },
  }));
}

/* ---- tabla ---- */
function tableHTML(rows, summaries) {
  const order = [...summaries].sort((a, b) => {
    const r = (NIVEL_RANK[b.worst] ?? -1) - (NIVEL_RANK[a.worst] ?? -1);
    return r || ((b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  });
  const VISIBLE = 12;
  const cell = (v) => (v === '' || v == null) ? '<span class="muted">—</span>' : esc(v);
  const dCell = (c) => c.fecha ? fmtShort(c.fecha) : cell(c.fechaRaw);
  const chip = (a) => `<span class="mic-chip" style="--nv:${NIVEL_COLOR[a.nivel]}">${esc(a.label)} · ${esc(a.nivel)}</span>`;
  const luminCell = (s) => s.lumin === true ? '<span class="mic-lumin is-on" title="Presencia de V. Luminiscentes">✨ Pres.</span>' : (s.lumin === false ? '<span class="muted">Aus.</span>' : '<span class="muted">—</span>');

  const head = `<tr><th>Fecha</th><th>Corrida</th><th>Módulo</th><th>TQ/Res.</th><th>Estadío</th><th>Tipo</th><th>Formato</th><th style="text-align:right">UFC C.Tot.</th><th>Nivel máx</th><th>V.Lumin</th><th>Alertas</th></tr>`;
  const body = order.length ? order.map((s, i) => {
    const c = s.ctx;
    return `<tr class="${i >= VISIBLE ? 'mic-row-hidden' : ''}">
      <td>${dCell(c)}</td>
      <td>${c.corrida ? 'C' + esc(c.corrida) : '<span class="muted">—</span>'}</td>
      <td>${c.modulo ? 'M' + esc(c.modulo) : '<span class="muted">—</span>'}</td>
      <td>${cell(c.ubicacion)}</td>
      <td>${cell(c.estadio)}</td>
      <td>${cell(c.tipoMuestra)}</td>
      <td>${cell(FORMATO_LABEL[c.formatoKey] || c.formato)}</td>
      <td style="text-align:right">${fmtNum(s.totalesUfc)}</td>
      <td>${s.worst ? `<span class="mic-nivel" style="--nv:${NIVEL_COLOR[s.worst]}">${esc(s.worst)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${luminCell(s)}</td>
      <td>${s.alerts.length ? s.alerts.map(chip).join(' ') : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="11" class="muted" style="text-align:center;padding:18px">Sin muestras para el filtro actual.</td></tr>`;

  const hiddenN = Math.max(0, order.length - VISIBLE);
  return `<div class="card mic-collap">
      <div class="mic-collap-head">
        <div class="mic-collap-title">📋 Muestras <span class="muted" style="font-weight:600;font-size:12px">· ${order.length}</span></div>
        ${hiddenN > 0 ? `<button class="mic-toggle" data-mic-toggle aria-expanded="false">Ver todo (${order.length})</button>` : ''}
      </div>
      <div class="mic-table-wrap" style="max-height:420px">
        <table class="mic-table"><thead>${head}</thead><tbody>${body}</tbody></table>
      </div>
    </div>`;
}

/* ---- export ---- */
function doExport(fmt) {
  const recs = _scope.records;
  if (!recs.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  let blob, fn;
  if (fmt === 'csv') {
    const head = 'Fecha,Corrida,Departamento,Formato,TipoMuestra,Modulo,Ubicacion,Estadio,Patogeno,Crudo,UFC,Nivel\r\n';
    const body = recs.map((r) => [
      r.fecha ? fmtShort(r.fecha) : r.fechaRaw, r.corrida, r.departamento, FORMATO_LABEL[r.formatoKey] || r.formato,
      r.tipoMuestra, r.modulo, r.ubicacion, r.estadio, `"${r.label}"`, r.crudo ?? '', r.ufc ?? '', r.nivel,
    ].join(',')).join('\r\n');
    blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8;' });
    fn = `microbiologia_${stamp}.csv`;
  } else if (fmt === 'json') {
    blob = new Blob([JSON.stringify({ data: recs, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    fn = `microbiologia_${stamp}.json`;
  } else {
    const alerts = recs.filter((r) => isAlerta(r.nivel));
    const lines = [
      '='.repeat(52), 'REPORTE DE VIGILANCIA MICROBIOLÓGICA — Bacteriología',
      `Generado: ${new Date().toLocaleString('es-EC')}`, '='.repeat(52), '',
      `Muestras (filas): ${_scope.rows.length}   Registros patógeno: ${recs.length}`,
      `Alertas (Moderado/Elevado): ${alerts.length}`, '',
    ];
    if (alerts.length) {
      lines.push('ALERTAS', '─'.repeat(40));
      alerts.sort((a, b) => NIVEL_RANK[b.nivel] - NIVEL_RANK[a.nivel]).forEach((r) => lines.push(`  [${r.nivel}] ${r.label} — ${fmtNum(r.ufc)} UFC · C${r.corrida} · M${r.modulo} ${r.ubicacion || ''} · ${r.fecha ? fmtShort(r.fecha) : ''}`));
    }
    lines.push('', '='.repeat(52));
    blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    fn = `reporte_microbiologia_${stamp}.txt`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================================
   HTML helpers
   ============================================================ */
function band(icon, label, color) {
  return `<div class="mic-band" style="border-top-color:${color}"><span class="mic-band-title">${icon} ${esc(label)}</span></div>`;
}
function kpi(icon, label, value, alert = false, sub = '') {
  return `<div class="mic-kpi${alert ? ' is-alert' : ''}">
      <div class="mic-kpi-label">${icon} ${esc(label)}</div>
      <div class="mic-kpi-value">${esc(value)}</div>
      ${sub ? `<div class="mic-kpi-sub">${esc(sub)}</div>` : ''}
    </div>`;
}
function micSelect(dim, value, values, placeholder, label = (v) => v) {
  return `<select class="mic-select" data-micfilter="${dim}">
      <option value="">${esc(placeholder)}</option>
      ${values.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(label(o))}</option>`).join('')}
    </select>`;
}
function nivelLegend() {
  return `<div class="mic-legend">${NIVELES.map((n) => `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${NIVEL_COLOR[n]}"></span>${esc(n)}</span>`).join('')}</div>`;
}
const emptyBox = (msg) => `<div class="empty-state" style="padding:28px">${esc(msg)}</div>`;

/* ---- tooltip de colonias ---- */
function showColonyTT(root, g) {
  const tt = root.querySelector('#micTT'); if (!tt) return;
  const c = _scope.colonies.find((x) => x.id === g.dataset.cid); if (!c) return;
  const glow = g.querySelector('.mic-colony-glow'); if (glow) glow.setAttribute('opacity', '1');
  tt.style.borderColor = c.color;
  tt.innerHTML = `<div class="mic-tt-h" style="color:${c.color}">${esc(c.label)}</div>
    <div><span class="mic-tt-k">UFC (Σ):</span> <b>${fmtNum(c.ufc)}</b></div>
    <div><span class="mic-tt-k">Muestras:</span> ${c.nMuestras}</div>
    ${c.worst ? `<div><span class="mic-tt-k">Nivel máx:</span> <b style="color:${NIVEL_COLOR[c.worst]}">${esc(c.worst)}</b></div>` : ''}`;
  tt.style.display = 'block';
}
function moveColonyTT(root, e) {
  const tt = root.querySelector('#micTT'); if (!tt || tt.style.display !== 'block') return;
  tt.style.left = Math.min(e.clientX + 14, window.innerWidth - 210) + 'px';
  tt.style.top = Math.min(e.clientY - 8, window.innerHeight - 130) + 'px';
}
function hideColonyTT(root, g) {
  const tt = root.querySelector('#micTT'); if (tt) tt.style.display = 'none';
  const glow = g && g.querySelector('.mic-colony-glow'); if (glow) glow.setAttribute('opacity', '0');
}

/* ============================================================
   EVENTOS (delegados, una sola vez)
   ============================================================ */
function bind(root) {
  if (root._micBound) return;
  root._micBound = true;

  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-micfilter]');
    if (!sel) return;
    vState[sel.dataset.micfilter] = sel.value || null;
    vState.petriDay = null; // el día válido se recalcula con el nuevo filtro
    microbiologiaView(root);
  });

  root.addEventListener('click', (e) => {
    const sub = e.target.closest('[data-mic-sub]');
    if (sub) { if (vState.sub !== sub.dataset.micSub) { vState.sub = sub.dataset.micSub; microbiologiaView(root); } return; }

    const ap = e.target.closest('[data-mic-ap]');
    if (ap) { if (vState.apartado !== ap.dataset.micAp) { vState.apartado = ap.dataset.micAp; microbiologiaView(root); } return; }

    const pet = e.target.closest('[data-mic-petab]');
    if (pet) { if (vState.petriTab !== pet.dataset.micPetab) { vState.petriTab = pet.dataset.micPetab; microbiologiaView(root); } return; }

    const exp = e.target.closest('[data-mic-export]');
    if (exp) { doExport(exp.dataset.micExport); return; }

    const tog = e.target.closest('[data-mic-toggle]');
    if (tog) {
      const card = tog.closest('.mic-collap'); if (!card) return;
      const exp2 = tog.getAttribute('aria-expanded') === 'true';
      card.querySelectorAll('.mic-row-hidden').forEach((el) => el.classList.toggle('mic-row-show', !exp2));
      tog.setAttribute('aria-expanded', String(!exp2));
      tog.textContent = exp2 ? `Ver todo (${card.querySelectorAll('tbody tr, .mic-alert').length})` : 'Mostrar recientes';
      return;
    }

    const dnav = e.target.closest('[data-mic-day]');
    if (dnav && !dnav.disabled) {
      const days = daysOf(_scope.rows);
      const i = days.findIndex((d) => d.key === vState.petriDay) + Number(dnav.dataset.micDay);
      if (i >= 0 && i < days.length) { vState.petriDay = days[i].key; microbiologiaView(root); }
      return;
    }

    const nav = e.target.closest('[data-mic-month]');
    if (!nav || nav.disabled) return;
    const all = microRows();
    const ms = [...new Set(all.map((r) => rowContext(r).corrida).filter(Boolean).map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
    const ni = ms.indexOf(vState.month) + Number(nav.dataset.micMonth);
    if (ni >= 0 && ni < ms.length) {
      vState.month = ms[ni];
      vState.corrida = vState.modulo = vState.ubic = vState.estadio = vState.formato = vState.tipo = null;
      vState.petriDay = null;
      microbiologiaView(root);
    }
  });

  // Tooltips de la placa (delegación)
  root.addEventListener('mouseover', (e) => { const g = e.target.closest('.mic-colony'); if (g) showColonyTT(root, g); });
  root.addEventListener('mousemove', (e) => moveColonyTT(root, e));
  root.addEventListener('mouseout', (e) => { const g = e.target.closest('.mic-colony'); if (g) hideColonyTT(root, g); });
}
