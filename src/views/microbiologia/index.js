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
import { fmtShort, dayNum, rangeLabel } from '../../core/dates.js';
import { natCmp } from '../../core/util.js';
import { monthIndexOfCorrida, monthLabelAt } from '../../core/prodCalendar.js';
import { toast } from '../../ui/toast.js';
import {
  isMicroRow, pathogenRecords, rowContext, meltRow, PATHOGENS, PATHOGEN_COLOR,
  NIVELES, NIVEL_COLOR, NIVEL_RANK, isAlerta, FORMATO_LABEL, AGGREGATE_KEYS,
  DEPARTAMENTOS, DEPTO_FORMATS, deptoOfFormato, PATHOGEN_AGAR,
} from './data.js';
import { petriSVG } from './petri.js';
import { calAguaRows, calCtx, calMeasured, calLocation, loadCalRanges, calRangeText, calEnsayoData, CAL_PARAMS, calDiagnosis, calGroupTree, calWQI, controlStats, boxStats, calSeverity, calStageCmp, CAL_RISK, CAL_SEV } from './calagua.data.js';

// ── sub-vistas del módulo ──
const SUBS = [
  { key: 'general', label: 'General', icon: '📊' },
  { key: 'bacteriologia', label: 'Bacteriología', icon: '🧫' },
  { key: 'calidad', label: 'Calidad de Agua', icon: '💧' },
  { key: 'patologia', label: 'Patología en fresco', icon: '🔬' },
];

// Estado persistente entre re-render.
const vState = {
  sub: 'general', month: null, genMonth: null, depto: null, formato: null,
  dims: {}, // filtros de contexto dinámicos (key → valor); se adaptan al formato/datos
  apartado: 'conglomerado', petriTab: 'placa', petriDay: null,
  petriTheme: 'light', // tema SOLO de la placa de agar (claro por defecto; el botón ☀️/🌙 alterna)
  petriTrendKey: null, // patógeno seleccionado en la pestaña Tendencias (ranking + cinética)
  petriTrendSort: 'mu', // orden del ranking: 'mu' (crecimiento) | 'ufc' | 'alertas'
  calMonth: null, // mes activo de la sub-vista Calidad de Agua (independiente de Bacteriología)
  calDepto: null, calFormato: null, calDims: {}, // filtros en cascada de Calidad de Agua
  calApartado: 'analizador', // doble lente: 'analizador' (por parámetro) | 'ubicacion' (fichas Módulo→Tanque) | 'ensayo'
  calTrendKey: null, // parámetro activo en el Analizador de Calidad de Agua (cartucho seleccionado)
  calChartMode: 'tendencia', // modo del gráfico del Analizador: 'tendencia' | 'control' (Shewhart) | 'distribucion' (boxplot)
  calLocOpen: {}, // módulos expandidos en "Por ubicación" (por etiqueta; undefined = default por riesgo)
  calCmpView: 'paralelas', // comparador de tanques: 'paralelas' | 'multiples' (small multiples)
};

// Dimensiones de filtro de contexto. Cada una se muestra (en cascada) SOLO si tiene
// ≥2 valores distintos en los datos vigentes → la barra se adapta a cada formato
// (Larvicultura: Módulo/TQ/Estadío/Tipo · Maduración: Sala/Sexo/TQ/Componente/… · Otros: Punto/Laboratorio/…).
const numCmp = (a, b) => (+a) - (+b);
const FILTER_DIMS = [
  { key: 'corrida', label: 'Corrida', pick: (c) => c.corrida, fmt: (v) => 'C' + v, cmp: numCmp },
  { key: 'modulo', label: 'Módulo', pick: (c) => c.modulo, fmt: (v) => 'M' + v, cmp: numCmp },
  { key: 'sala', label: 'Sala', pick: (c) => c.sala },
  { key: 'tq', label: 'TQ/N°', pick: (c) => c.tq, fmt: (v) => 'TQ ' + v, cmp: numCmp },
  { key: 'reservorio', label: 'Reservorio', pick: (c) => c.reservorio, fmt: (v) => 'R' + v, cmp: numCmp },
  { key: 'sexo', label: 'Sexo', pick: (c) => c.sexo },
  { key: 'estadio', label: 'Estadío', pick: (c) => c.estadio },
  { key: 'tipo', label: 'Tipo', pick: (c) => c.tipoMuestra },
  { key: 'muestras', label: 'Muestra', pick: (c) => c.muestras },
  { key: 'punto', label: 'Punto de muestreo', pick: (c) => c.punto },
  { key: 'componente', label: 'Componente', pick: (c) => c.componente },
  { key: 'origen', label: 'Origen/Tipo', pick: (c) => c.origen },
  { key: 'etapa', label: 'Etapa', pick: (c) => c.etapa },
  { key: 'laboratorio', label: 'Laboratorio', pick: (c) => c.laboratorio },
  { key: 'raceways', label: 'Raceways', pick: (c) => c.raceways },
  { key: 'tanques', label: 'Tanques', pick: (c) => c.tanques },
  { key: 'carro', label: 'Carro', pick: (c) => c.carro },
  { key: 'tina', label: 'Tina', pick: (c) => c.tina },
  { key: 'siembra', label: 'Siembra', pick: (c) => c.siembra },
];

// Datos del render actual (para tooltips de la placa y export).
const _scope = { rows: [], records: [], colonies: [], theme: 'light' };
const _charts = { stack: null, aa: null };
let _calTrend = null; // datos del gráfico de Tendencias de Calidad de Agua (dibujo post-render)
let _calEnsayo = null; // datos del gráfico Ensayo antes/después (dibujo post-render)
let _calScope = { samples: [] }; // muestras filtradas actuales (para alertas y export de Calidad de Agua)
let _calKpiData = null; // agregados de los KPIs de Calidad de Agua (para sus modales de detalle)
let _calLocTree = null; // árbol Módulo→Tanque actual (para el modal de ficha técnica en "Por ubicación")
let _genScope = null; // alcance del panorama General (summaries + samples + ranges) para el modal de desglose por área
let _genKpiData = null; // agregados de los 5 KPIs del panorama General (para sus modales de resumen)

// Filas de Microbiología memoizadas por identidad de store.globalData.
let _cache = { src: null, rows: [] };
function microRows() {
  if (_cache.src !== store.globalData) _cache = { src: store.globalData, rows: store.globalData.filter(isMicroRow) };
  return _cache.rows;
}

const fmtNum = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-EC');
const PAT_LABEL = Object.fromEntries(PATHOGENS.map((p) => [p.key, p.label]));

/* ============================================================
   VISTA
   ============================================================ */
export function microbiologiaView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }
  destroyAllCharts();
  document.body.classList.remove('modal-open');

  let h = headHTML() + subnavHTML();
  // Bacteriología va dentro de un panel con estética SCADA/ERP (.mic-scada).
  if (vState.sub === 'bacteriologia') h += `<div class="mic-scada">${renderBacteriologia()}</div>` + alertModalHTML() + xlsxModalHTML();
  else if (vState.sub === 'calidad') h += renderCalidadAgua();
  else if (vState.sub === 'general') h += renderGeneral();
  else h += placeholderHTML(SUBS.find((s) => s.key === vState.sub));
  h += `<div class="mic-tt" id="micTT"></div>`; // tooltip de colonias

  root.innerHTML = h;

  if (vState.sub === 'bacteriologia') {
    if (vState.apartado === 'conglomerado') drawConglomeradoCharts();
    else if (vState.apartado === 'petri' && vState.petriTab === 'tendencias') drawPetriTrendChart();
  } else if (vState.sub === 'calidad') {
    if (vState.calApartado === 'analizador' && vState.calChartMode !== 'distribucion') drawCalTrendChart();
    else if (vState.calApartado === 'ensayo') drawCalEnsayoChart();
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
   GENERAL · panorama integral del módulo (Bacteriología + Calidad de Agua)
   Resumen ejecutivo MENSUAL para entrar de un vistazo: estado global, estado por
   departamento y síntesis de Calidad de Agua, con accesos directos a cada sub-vista.
   Reutiliza la capa de datos pura de ambas sub-vistas (sin datos nuevos).
   ============================================================ */
function renderGeneral() {
  const micAll = microRows();
  const calAll = calAguaRows();
  if (!micAll.length && !calAll.length) {
    return `<div class="mic-general">${emptyBox('No se encontraron registros de Microbiología ni de Calidad de Agua en el Google Sheet.')}</div>`;
  }

  const ranges = loadCalRanges();
  const micCtxCache = new Map();
  const mCtx = (r) => { if (!micCtxCache.has(r)) micCtxCache.set(r, rowContext(r)); return micCtxCache.get(r); };
  const calCtxCache = new Map();
  const cCtx = (r) => { if (!calCtxCache.has(r)) calCtxCache.set(r, calCtx(r)); return calCtxCache.get(r); };

  // ── Barra de mes COMPARTIDA (corrida → mes; ambas fuentes usan el mismo calendario) ──
  const corridas = [...micAll.map((r) => mCtx(r).corrida), ...calAll.map((r) => cCtx(r).corrida)].filter(Boolean);
  const months = [...new Set(corridas.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (vState.genMonth == null || (months.length && !months.includes(vState.genMonth))) vState.genMonth = months.length ? months[months.length - 1] : 0;
  const inMonth = (ctxFn) => (r) => { const c = ctxFn(r).corrida; return !c || !months.length || monthIndexOfCorrida(+c) === vState.genMonth; };
  const micRows = micAll.filter(inMonth(mCtx));
  const calRows = calAll.filter(inMonth(cCtx));

  // ── Bacteriología (los 3 departamentos) ──
  const records = pathogenRecords(micRows);
  const summaries = micRows.map(rowSummary);
  const kAlerta = summaries.filter((s) => isAlerta(s.worst)).length;
  const dom = dominantPathogen(micRows, records);
  const pat = genPatByAlert(records);

  // ── Calidad de Agua (hoja propia, fisicoquímica) ──
  const samples = calRows.map((r) => ({ ctx: cCtx(r), meas: calMeasured(r, ranges) })).filter((s) => s.meas.length);
  const diag = calDiagnosis(samples, ranges);

  // Alcance para el modal de desglose por área (se recomputa por área al hacer clic).
  _genScope = { summaries, samples, ranges };

  // ── Agregados para la franja de instrumentos (mismo estilo que Calidad de Agua) ──
  const dayKey = (f) => (f && !isNaN(f)) ? Math.floor(+f / 86400000) : null;
  const micByDay = new Map();
  micRows.forEach((r) => { const k = dayKey(mCtx(r).fecha); if (k != null) micByDay.set(k, (micByDay.get(k) || 0) + 1); });
  const dayKeys = [...micByDay.keys()].sort((a, b) => a - b);
  const alertByDay = new Map();
  summaries.forEach((s) => { if (!isAlerta(s.worst)) return; const k = dayKey(s.ctx.fecha); if (k != null) alertByDay.set(k, (alertByDay.get(k) || 0) + 1); });
  const waterSev = { optimo: 0, vigilancia: 0, fuera: 0, critico: 0 };
  samples.forEach((s) => s.meas.forEach((m) => { if (waterSev[m.severity] != null) waterSev[m.severity]++; }));
  const kpiData = {
    micCount: micRows.length, micDays: dayKeys.map((k) => micByDay.get(k)),
    alertCount: kAlerta, alertRatio: micRows.length ? Math.round(kAlerta / micRows.length * 100) : 0,
    alertSeries: dayKeys.map((k) => alertByDay.get(k) || 0),
    dom, patTop: pat.labels.slice(0, 3).map((label, i) => ({ label, n: pat.values[i] })),
    waterSev, wqi: diag.wqi, wband: calWqiBand(diag.wqi),
    outCount: diag.outCount, outEvaluated: diag.evaluated, outTop: diag.topParams.map((p) => ({ label: p.label, n: p.n })),
  };

  // ── Estado por área (tabla-semáforo Bacteriología + Calidad de Agua) ──
  const areas = genAreaStats(summaries, samples, ranges);

  // ── HTML ──
  const monthBar = months.length ? `<div class="mic-monthbar">
      <button class="mic-month-nav" data-gen-month="-1" ${months.indexOf(vState.genMonth) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
      <span class="mic-month-lbl">📅 ${esc(monthLabelAt(vState.genMonth))}</span>
      <button class="mic-month-nav" data-gen-month="1" ${months.indexOf(vState.genMonth) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
    </div>` : '';

  let h = `<div class="mic-general">`;
  h += `<div class="mic-filters">${monthBar}<span class="gen-hint muted">Panorama del módulo · un vistazo del mes</span></div>`;
  _genKpiData = kpiData;
  h += genKpiStripHTML(kpiData);

  h += band('🚦', 'Estado por área', '#006064');
  h += genScorecardHTML(areas);
  h += `<div class="gen-cta">
      <button class="gen-goto" data-gen-goto="bacteriologia">🧫 Ver Bacteriología en detalle →</button>
      ${calAll.length ? '<button class="gen-goto" data-gen-goto="calidad">💧 Ver Calidad de Agua en detalle →</button>' : ''}
    </div>`;
  h += genDeptoModalHTML();
  h += genKpiModalHTML();
  h += `</div>`;
  return h;
}

/* ---- Panorama General · modal de resumen por KPI ---- */
const GEN_KPI_TITLE = {
  muestras: '🧪 Muestras de microbiología',
  alerta: '⚠️ Muestras en alerta',
  dominante: '🦠 Patógeno dominante',
  wqi: '💧 WQI · Calidad de Agua',
  fuera: '⚗️ Mediciones de agua fuera de rango',
};
function genKpiModalHTML() {
  return `<div class="mic-modal" id="genKpiModal" data-gen-kpi-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title" id="genKpiTitle">Resumen</span>
          <button class="mic-modal-x" data-gen-kpi-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body" id="genKpiBody"></div>
      </div>
    </div>`;
}
function genKpiBodyHTML(which) {
  const k = _genKpiData, sc = _genScope;
  if (!k || !sc) return '';
  const chips = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([kk, v]) => `<span class="cal-kpi-chip">${esc(kk)} <b>${v}</b></span>`).join('') || '—';
  const rankBars = (arr) => {
    if (!arr.length) return '<span class="cal-inst-ok">✓ sin datos</span>';
    const mx = Math.max(1, ...arr.map((t) => t.n));
    return `<div class="cal-inst-tops">${arr.map((t) => `<div class="cal-inst-top"><span class="cal-inst-top-l" title="${esc(t.label)}">${esc(t.label)}</span><span class="cal-inst-top-bar"><i style="width:${Math.round(t.n / mx * 100)}%"></i></span><b>${t.n}</b></div>`).join('')}</div>`;
  };

  if (which === 'muestras') {
    const byDepto = new Map();
    sc.summaries.forEach((s) => { const d = deptoOfFormato(s.ctx.formatoKey) || '—'; byDepto.set(d, (byDepto.get(d) || 0) + 1); });
    return `<p class="cal-kpi-lead">Se registraron <b>${k.micCount}</b> muestra(s) de microbiología en <b>${k.micDays.length}</b> día(s) de muestreo del mes.</p>
      <div class="cal-kpi-sec"><h4>Por departamento</h4><div class="cal-kpi-chips">${chips(byDepto)}</div></div>
      <div class="cal-kpi-sec"><h4>Muestras por día</h4>${genDayBars(k.micDays)}</div>`;
  }
  if (which === 'alerta') {
    const byDepto = new Map();
    sc.summaries.forEach((s) => { if (isAlerta(s.worst)) { const d = deptoOfFormato(s.ctx.formatoKey) || '—'; byDepto.set(d, (byDepto.get(d) || 0) + 1); } });
    return `<p class="cal-kpi-lead"><b>${k.alertCount}</b> muestra(s) en alerta ${k.micCount ? `(<b>${k.alertRatio}%</b> del total)` : ''}.</p>
      <p class="cal-kpi-note">"En alerta" = la muestra tiene al menos un patógeno en nivel Moderado o Elevado.</p>
      <div class="cal-kpi-sec"><h4>Patógenos que más disparan alertas</h4>${rankBars(k.patTop.filter((t) => t.n))}</div>
      <div class="cal-kpi-sec"><h4>Alertas por departamento</h4><div class="cal-kpi-chips">${chips(byDepto)}</div></div>`;
  }
  if (which === 'dominante') {
    return `<p class="cal-kpi-lead">${k.dom ? `El patógeno dominante del mes es <b>${esc(k.dom.label)}</b> con <b>${k.dom.alertas}</b> alerta(s).` : 'No hay patógenos en alerta este mes.'}</p>
      <div class="cal-kpi-sec"><h4>Ranking de patógenos en alerta</h4>${rankBars(k.patTop.filter((t) => t.n))}</div>`;
  }
  if (which === 'wqi') {
    const wsOrder = ['optimo', 'vigilancia', 'fuera', 'critico'];
    const tot = wsOrder.reduce((a, x) => a + (k.waterSev[x] || 0), 0);
    const rows = tot ? wsOrder.map((x) => { const c = k.waterSev[x] || 0; const pct = Math.round(c / tot * 100); return `<div class="cal-kpi-sevrow cal-sev--${x}"><span class="cal-kpi-sevname">${esc(CAL_SEV[x].label)}</span><span class="cal-kpi-sevbar"><i style="width:${pct}%"></i></span><b>${c}</b><span class="cal-kpi-sevpct">${pct}%</span></div>`; }).join('') : '<span class="muted">Sin mediciones de agua.</span>';
    return `<p class="cal-kpi-lead">${k.wqi == null ? 'No hay datos de calidad de agua este mes.' : `Índice de calidad de agua (WQI) del mes: <b>${k.wqi}</b> · <b>${esc(k.wband.label)}</b>.`}</p>
      <p class="cal-kpi-note">El WQI resume qué tan dentro de rango están todos los parámetros fisicoquímicos (100 = todo en rango).</p>
      <div class="cal-kpi-sec"><h4>Severidad de las mediciones</h4><div class="cal-kpi-sevlist">${rows}</div></div>`;
  }
  // fuera
  const byDepto = new Map();
  sc.samples.forEach((s) => { const d = s.ctx.depto || '—'; s.meas.forEach((m) => { if (m.estado === 'fuera') byDepto.set(d, (byDepto.get(d) || 0) + 1); }); });
  return `<p class="cal-kpi-lead"><b>${k.outCount}</b> medición(es) de agua fuera de rango${k.outEvaluated ? ` de <b>${k.outEvaluated}</b> evaluadas` : ''}.</p>
    <div class="cal-kpi-sec"><h4>Parámetros más incumplidos</h4>${rankBars(k.outTop)}</div>
    <div class="cal-kpi-sec"><h4>Fuera de rango por departamento</h4><div class="cal-kpi-chips">${chips(byDepto)}</div></div>`;
}
// Mini-barras de muestras por día (para el modal de "Muestras micro").
function genDayBars(days) {
  if (!days || !days.length) return '<span class="muted">Sin fechas registradas.</span>';
  const mx = Math.max(1, ...days);
  return `<div class="gen-daybars" role="img" aria-label="Muestras por día">${days.map((n) => `<span style="height:${Math.max(8, Math.round(n / mx * 100))}%" title="${n} muestra(s)"><i>${n}</i></span>`).join('')}</div>`;
}
function openGenKpi(root, which) {
  const title = root.querySelector('#genKpiTitle'); if (title) title.textContent = GEN_KPI_TITLE[which] || 'Resumen';
  const body = root.querySelector('#genKpiBody'); if (body) body.innerHTML = genKpiBodyHTML(which);
  const m = root.querySelector('#genKpiModal');
  if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); }
}
function closeGenKpi(root) {
  const m = root.querySelector('#genKpiModal');
  if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

/** Franja de instrumentos del panorama (mismo sistema visual que Calidad de Agua:
 *  índice + etiqueta + valor grande + micro-viz + pie). */
function genKpiStripHTML(k) {
  // Cada tile es clicable (Enter/Espacio/clic) → modal de resumen (data-gen-kpi).
  const kpiClick = (which) => `data-gen-kpi="${which}" role="button" tabindex="0" title="Ver resumen"`;
  const inst = (ix, sev, label, valueHtml, vizHtml, footHtml, attrs) => `
    <div class="cal-inst${sev ? ' cal-sev--' + sev : ''}"${attrs ? ' ' + attrs : ''}>
      <div class="cal-inst-h"><span class="cal-inst-ix">${ix}</span>${label}</div>
      <div class="cal-inst-main"><div class="cal-inst-v">${valueHtml}</div>${vizHtml}</div>
      ${footHtml ? `<div class="cal-inst-foot">${footHtml}</div>` : ''}
    </div>`;
  const tlMax = Math.max(1, ...k.micDays);
  const timeline = k.micDays.length
    ? `<div class="cal-inst-tl" role="img" aria-label="Muestras por día">${k.micDays.map((n) => `<span style="height:${Math.max(14, Math.round(n / tlMax * 100))}%" title="${n} muestra(s)"></span>`).join('')}</div>`
    : '<span class="cal-inst-hint">sin fechas</span>';
  const bars = (arr) => {
    if (!arr.length) return '<span class="cal-inst-ok">✓ sin alertas</span>';
    const mx = Math.max(1, ...arr.map((t) => t.n));
    return `<div class="cal-inst-tops">${arr.map((t) => `<div class="cal-inst-top"><span class="cal-inst-top-l" title="${esc(t.label)}">${esc(t.label)}</span><span class="cal-inst-top-bar"><i style="width:${Math.round(t.n / mx * 100)}%"></i></span><b>${t.n}</b></div>`).join('')}</div>`;
  };
  const wsOrder = ['optimo', 'vigilancia', 'fuera', 'critico'];
  const wsTot = wsOrder.reduce((a, x) => a + (k.waterSev[x] || 0), 0);
  const wsSeg = wsTot
    ? `<div class="cal-inst-seg" role="img" aria-label="Severidad de las mediciones de agua">${wsOrder.map((x) => k.waterSev[x] ? `<span class="cal-sev--${x}" style="flex:${k.waterSev[x]}" title="${esc(CAL_SEV[x].label)}: ${k.waterSev[x]}"></span>` : '').join('')}</div>`
    : '<span class="cal-inst-hint">sin datos</span>';
  const alertSev = k.alertRatio >= 15 ? 'critico' : k.alertRatio >= 5 ? 'fuera' : k.alertCount > 0 ? 'vigilancia' : 'optimo';

  return `<div class="cal-inst-strip">
    ${inst('01', '', '🧪 Muestras micro', String(k.micCount), timeline, `${k.micDays.length} día(s) de muestreo`, kpiClick('muestras'))}
    ${inst('02', k.alertCount > 0 ? alertSev : 'optimo', '⚠️ En alerta', String(k.alertCount), calSpark(k.alertSeries), k.micCount ? `${k.alertRatio}% de muestras` : 'sin muestras', kpiClick('alerta'))}
    ${inst('03', '', '🦠 Dominante', k.dom ? String(k.dom.alertas) : '0', bars(k.patTop.filter((t) => t.n)), k.dom ? esc(k.dom.label) : 'sin alertas', kpiClick('dominante'))}
    ${inst('04', k.wqi == null ? '' : k.wband.sev, '💧 WQI agua', k.wqi == null ? '—' : String(k.wqi), wsSeg, k.wqi == null ? 'sin datos' : esc(k.wband.label), kpiClick('wqi'))}
    ${inst('05', k.outCount > 0 ? 'fuera' : 'optimo', '⚗️ Agua fuera', String(k.outCount), k.outCount ? bars(k.outTop) : '<span class="cal-inst-ok">✓ todo en rango</span>', k.outEvaluated ? `de ${k.outEvaluated} evaluados` : 'sin evaluar', kpiClick('fuera'))}
  </div>`;
}

// Mapea el departamento de una muestra de agua a las 3 áreas canónicas de Bacteriología.
const genAreaOf = (dep) => (dep === 'Larvicultura' || dep === 'Maduración') ? dep : 'Otros';

/** Estadísticos por área (une Bacteriología + Calidad de Agua): muestras, alertas,
 *  peor nivel, WQI y cumplimiento. Solo áreas con datos en alguna de las dos fuentes. */
function genAreaStats(summaries, samples, ranges) {
  return DEPARTAMENTOS.map((area) => {
    const bl = summaries.filter((s) => deptoOfFormato(s.ctx.formatoKey) === area);
    const dist = { 'Mínimo': 0, 'Leve': 0, 'Moderado': 0, 'Elevado': 0 };
    bl.forEach((s) => { if (s.worst && dist[s.worst] !== undefined) dist[s.worst]++; });
    const worstSev = dist.Elevado > 0 ? 'critico' : dist.Moderado > 0 ? 'fuera' : (bl.length ? 'optimo' : 'sin-rango');
    const ws = samples.filter((s) => genAreaOf(s.ctx.depto) === area);
    const meas = ws.flatMap((s) => s.meas);
    const w = calWQI(meas, ranges);
    let inC = 0, outC = 0;
    meas.forEach((m) => { if (m.estado === 'dentro') inC++; else if (m.estado === 'fuera') outC++; });
    return {
      area, n: bl.length, alertas: bl.filter((s) => isAlerta(s.worst)).length, worstSev,
      wqi: w.wqi, cump: (inC + outC) ? Math.round(inC / (inC + outC) * 100) : null, wn: ws.length,
    };
  }).filter((r) => r.n > 0 || r.wn > 0);
}

/** Tabla-semáforo por área. Cada fila (botón) abre el desglose del área. */
function genScorecardHTML(areas) {
  if (!areas.length) return emptyBox('Sin muestras en el mes seleccionado.');
  const rows = areas.map((a) => {
    const wqiSev = a.wqi == null ? 'sin-rango' : calWqiBand(a.wqi).sev;
    const cumpSev = a.cump == null ? 'sin-rango' : a.cump >= 90 ? 'optimo' : a.cump >= 70 ? 'vigilancia' : 'fuera';
    return `<button class="gen-sc-row" data-gen-depto="${esc(a.area)}" title="Ver desglose de ${esc(a.area)}">
        <span class="gen-sc-area">${esc(a.area)}</span>
        <span class="gen-sc-n">${a.n || '—'}</span>
        <span class="gen-sc-alert">${a.n ? `<span class="gen-sc-dot cal-sev--${a.worstSev}"></span>${a.alertas}` : '<span class="muted">—</span>'}</span>
        <span class="gen-sc-wqi cal-sev--${wqiSev}">${a.wqi == null ? '—' : a.wqi}</span>
        <span class="gen-sc-cump cal-sev--${cumpSev}">${a.cump == null ? '—' : a.cump + '%'}</span>
      </button>`;
  }).join('');
  return `<div class="gen-sc">
      <div class="gen-sc-head"><span>Área</span><span>Muestras</span><span>Alerta</span><span>WQI</span><span>Cumplim.</span></div>
      ${rows}
    </div>`;
}

/** Nº de muestras en alerta (Mod/Elev) por patógeno específico (excluye agregados). */
function genPatByAlert(records) {
  const m = new Map();
  records.forEach((r) => {
    if (AGGREGATE_KEYS.has(r.key) || !isAlerta(r.nivel)) return;
    m.set(r.key, (m.get(r.key) || 0) + 1);
  });
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { keys: arr.map(([k]) => k), labels: arr.map(([k]) => PAT_LABEL[k] || k), values: arr.map(([, v]) => v) };
}

/* ---- Panorama General · modal de desglose por área ---- */
const genCtxLabel = (ctx) => [ctx.modulo ? 'M' + ctx.modulo : '', ctx.sala, ctx.tq ? 'TQ ' + ctx.tq : '', ctx.estadio].filter(Boolean).join(' · ') || '—';
function genDeptoModalHTML() {
  return `<div class="mic-modal" id="genDeptoModal" data-gen-depto-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title" id="genDeptoTitle">Desglose</span>
          <button class="mic-modal-x" data-gen-depto-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body" id="genDeptoBody"></div>
      </div>
    </div>`;
}
function genDeptoBodyHTML(area) {
  const sc = _genScope; if (!sc) return '';
  const bl = sc.summaries.filter((s) => deptoOfFormato(s.ctx.formatoKey) === area);
  const dist = { 'Mínimo': 0, 'Leve': 0, 'Moderado': 0, 'Elevado': 0 };
  const pm = new Map(), byFmt = new Map(), byTipo = new Map();
  bl.forEach((s) => {
    if (s.worst && dist[s.worst] !== undefined) dist[s.worst]++;
    s.alerts.forEach((a) => pm.set(a.label, (pm.get(a.label) || 0) + 1));
    byFmt.set(FORMATO_LABEL[s.ctx.formatoKey] || s.ctx.formatoKey || '—', (byFmt.get(FORMATO_LABEL[s.ctx.formatoKey] || s.ctx.formatoKey || '—') || 0) + 1);
    byTipo.set(s.ctx.tipoMuestra || '—', (byTipo.get(s.ctx.tipoMuestra || '—') || 0) + 1);
  });
  const distTot = NIVELES.reduce((a, n) => a + dist[n], 0);
  const distBar = distTot
    ? `<div class="gen-dm-seg">${NIVELES.map((n) => dist[n] ? `<span style="flex:${dist[n]};background:${NIVEL_COLOR[n]}" title="${esc(n)}: ${dist[n]}"></span>` : '').join('')}</div>
       <div class="gen-dm-seglg">${NIVELES.map((n) => `<span><i style="background:${NIVEL_COLOR[n]}"></i>${esc(n)} <b>${dist[n]}</b></span>`).join('')}</div>`
    : '<span class="muted">Sin niveles registrados.</span>';
  const chips = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="cal-kpi-chip">${esc(k)} <b>${v}</b></span>`).join('') || '—';
  const topPat = [...pm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topPatH = topPat.length ? `<div class="cal-kpi-chips">${topPat.map(([k, v]) => `<span class="cal-kpi-chip">${esc(k)} <b>×${v}</b></span>`).join('')}</div>` : '<span class="cal-inst-ok">✓ sin alertas</span>';
  const alerts = [];
  bl.forEach((s) => s.alerts.forEach((a) => alerts.push({ label: a.label, nivel: a.nivel, ctx: s.ctx })));
  alerts.sort((a, b) => (NIVEL_RANK[b.nivel] - NIVEL_RANK[a.nivel]) || ((b.ctx.fecha || 0) - (a.ctx.fecha || 0)));
  const alertList = alerts.slice(0, 8).map((a) => `<div class="mic-alert" style="--ac:${NIVEL_COLOR[a.nivel]}">
      <div class="mic-alert-h">${esc(a.label)} · <b style="color:${NIVEL_COLOR[a.nivel]}">${esc(a.nivel)}</b></div>
      <div class="mic-alert-s">${a.ctx.fecha ? esc(fmtShort(a.ctx.fecha)) : '—'} · ${esc(genCtxLabel(a.ctx))}</div>
    </div>`).join('');
  // Calidad de Agua del área.
  const ws = sc.samples.filter((s) => genAreaOf(s.ctx.depto) === area);
  const meas = ws.flatMap((s) => s.meas);
  const w = calWQI(meas, sc.ranges);
  let inC = 0, outC = 0; const outByP = new Map();
  meas.forEach((m) => { if (m.estado === 'dentro') inC++; else if (m.estado === 'fuera') { outC++; outByP.set(m.label, (outByP.get(m.label) || 0) + 1); } });
  const cump = (inC + outC) ? Math.round(inC / (inC + outC) * 100) : null;
  const waterSec = ws.length ? `<div class="cal-kpi-sec"><h4>💧 Calidad de Agua</h4>
      <p class="cal-kpi-note">WQI <b>${w.wqi == null ? '—' : w.wqi}</b> · cumplimiento <b>${cump == null ? '—' : cump + '%'}</b> · <b>${outC}</b> medición(es) fuera de rango en <b>${ws.length}</b> muestra(s).</p>
      ${outByP.size ? `<div class="cal-kpi-chips">${[...outByP.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `<span class="cal-kpi-chip">${esc(k)} <b>×${v}</b></span>`).join('')}</div>` : '<span class="cal-inst-ok">✓ todo en rango</span>'}
    </div>` : '';

  return `<p class="cal-kpi-lead"><b>${bl.length}</b> muestra(s) de Bacteriología · <b>${bl.filter((s) => isAlerta(s.worst)).length}</b> en alerta.</p>
    <div class="cal-kpi-sec"><h4>Distribución por nivel</h4>${distBar}</div>
    <div class="cal-kpi-sec"><h4>Patógenos en alerta</h4>${topPatH}</div>
    <div class="cal-kpi-sec"><h4>Por formato</h4><div class="cal-kpi-chips">${chips(byFmt)}</div></div>
    <div class="cal-kpi-sec"><h4>Por tipo de muestra</h4><div class="cal-kpi-chips">${chips(byTipo)}</div></div>
    ${alertList ? `<div class="cal-kpi-sec"><h4>Alertas recientes</h4><div class="mic-alert-list">${alertList}</div></div>` : ''}
    ${waterSec}`;
}
function openGenDepto(root, area) {
  const title = root.querySelector('#genDeptoTitle'); if (title) title.textContent = `🏭 ${area}`;
  const body = root.querySelector('#genDeptoBody'); if (body) body.innerHTML = genDeptoBodyHTML(area);
  const m = root.querySelector('#genDeptoModal');
  if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); }
}
function closeGenDepto(root) {
  const m = root.querySelector('#genDeptoModal');
  if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

/* ============================================================
   CALIDAD DE AGUA (fisicoquímica · rango dentro/fuera) — Tandas A–C
   Barra de mes + filtros en CASCADA + KPIs de cumplimiento + apartados:
   Perfil (tarjetas "perfil iónico") · Matriz (muestra × parámetro).
   Tendencias / ensayo / alertas / export llegan en tandas siguientes.
   ============================================================ */
/** Número limpio: entero tal cual; decimal a ≤2 sin ceros finales. */
function calFmt(v) { return v == null || isNaN(v) ? '—' : String(Number.isInteger(v) ? v : +v.toFixed(2)); }

// Dimensiones de contexto de Calidad de Agua (cascada; cada una se muestra si ≥2
// valores distintos en el pool). Se adaptan al departamento/formato de cada muestra.
const CAL_DIMS = [
  { key: 'tipoMuestra', label: 'Tipo de muestra', pick: (c) => c.tipoMuestra },
  { key: 'modulo', label: 'Módulo', pick: (c) => c.modulo, fmt: (v) => 'M' + v, cmp: (a, b) => (+a) - (+b), multi: true },
  { key: 'sala', label: 'Sala', pick: (c) => c.sala },
  { key: 'estadio', label: 'Estadío', pick: (c) => c.estadio, cmp: calStageCmp },
  { key: 'tq', label: 'TQ/N°', pick: (c) => c.tq, fmt: (v) => 'TQ ' + v, cmp: (a, b) => (+a) - (+b) },
  { key: 'componente', label: 'Componente', pick: (c) => c.componente },
  { key: 'muestras', label: 'Muestra', pick: (c) => c.muestras },
  { key: 'estado', label: 'Estado', pick: (c) => c.estado },
];
const calSelect = (attr, value, values, placeholder, label = (v) => v) => `<select class="mic-select" data-calfilter="${attr}">
    <option value="">${esc(placeholder)}</option>
    ${values.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(label(o))}</option>`).join('')}
  </select>`;
const calDimSelect = (dim, value, values) => `<select class="mic-select" data-caldim="${dim.key}">
    <option value="">Todos · ${esc(dim.label)}</option>
    ${values.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(dim.fmt ? dim.fmt(o) : o)}</option>`).join('')}
  </select>`;
/** Filtro de selección MÚLTIPLE por chips (p. ej. Módulo): permite agrupar varios valores. */
const calDimChips = (dim, selected, values) => `<div class="cal-mchips" role="group" aria-label="Filtro por ${esc(dim.label)}">
    <span class="cal-mchips-lbl">${esc(dim.label)}:</span>
    ${values.map((o) => { const on = selected.includes(o); return `<button type="button" class="cal-mchip${on ? ' is-on' : ''}" data-caldim-chip="${dim.key}" data-caldim-val="${esc(o)}" aria-pressed="${on}">${esc(dim.fmt ? dim.fmt(o) : o)}</button>`; }).join('')}
  </div>`;

/* ---- Calidad de Agua · Panel del Analista (síntesis técnica autogenerada) ---- */
// Banda del WQI global (0–100) → severidad para color + etiqueta.
function calWqiBand(wqi) {
  if (wqi == null) return { sev: 'sin-rango', label: 'Sin datos' };
  if (wqi >= 85) return { sev: 'optimo', label: 'Óptimo' };
  if (wqi >= 70) return { sev: 'vigilancia', label: 'Vigilancia' };
  if (wqi >= 50) return { sev: 'fuera', label: 'Deficiente' };
  return { sev: 'critico', label: 'Crítico' };
}
function calAnalystHTML(samples, ranges) {
  const d = calDiagnosis(samples, ranges);
  const band = calWqiBand(d.wqi);
  const wqiTxt = d.wqi == null ? '—' : String(d.wqi);
  const deg = d.wqi == null ? 0 : Math.round(d.wqi * 3.6); // 0–100 → 0–360°
  // Diagnóstico en lenguaje técnico. Solo se interpolan NÚMEROS dentro de <b> (seguro);
  // las etiquetas de parámetro/tanque van escapadas en los chips de abajo.
  const parts = [`Se analizaron <b>${d.total}</b> muestra(s) en <b>${d.tankCount}</b> punto(s).`];
  if (d.evaluated) {
    if (d.outCount === 0) parts.push('Todos los parámetros evaluados están dentro de rango. ✓');
    else parts.push(`<b>${d.outCount}</b> medición(es) fuera de rango${d.critCount ? ` (<b>${d.critCount}</b> en nivel crítico)` : ''}.`);
  } else {
    parts.push('No hay parámetros con rango objetivo definido en el filtro actual.');
  }
  if (d.riskTanks.length) parts.push(`<b>${d.riskTanks.length}</b> punto(s) requieren atención.`);
  const paramChips = d.topParams.map((p) => `<span class="cal-an-chip cal-an-chip--param" title="${esc(p.label)}: ${p.n} medición(es) fuera de rango">${esc(p.label)} <b>×${p.n}</b></span>`).join('');
  const tankChips = d.riskTanks.slice(0, 6).map((t) => `<span class="cal-an-chip cal-an-chip--risk cal-risk--${t.risk}" title="${esc(CAL_RISK[t.risk].label)}${t.wqi != null ? ` · WQI ${t.wqi}` : ''}">${esc(t.modulo)} · ${esc(t.label)}</span>`).join('');
  const chips = paramChips + tankChips;
  return `<div class="cal-analyst">
      <div class="cal-an-gauge cal-sev--${band.sev}" style="--deg:${deg}deg" role="img" aria-label="Índice de calidad de agua ${wqiTxt} de 100, ${esc(band.label)}">
        <div class="cal-an-gauge-in"><span class="cal-an-wqi">${wqiTxt}</span><span class="cal-an-wqi-u">WQI</span></div>
      </div>
      <div class="cal-an-body">
        <div class="cal-an-head"><span class="cal-an-title">🔬 Panel del Analista</span><span class="cal-an-band cal-sev--${band.sev}">${esc(band.label)}</span></div>
        <p class="cal-an-text">${parts.join(' ')}</p>
        ${chips ? `<div class="cal-an-chips">${chips}</div>` : ''}
        ${calWqiScaleHTML(d.wqi)}
      </div>
    </div>`;
}

/** Franja de semaforización del WQI (0–100): 4 zonas con sus umbrales + marcador en el
 *  valor actual. Hace explícita la clasificación (Crítico/Deficiente/Vigilancia/Óptimo). */
function calWqiScaleHTML(wqi) {
  const zones = [
    { sev: 'critico', label: 'Crítico', lo: 0, hi: 50 },
    { sev: 'fuera', label: 'Deficiente', lo: 50, hi: 70 },
    { sev: 'vigilancia', label: 'Vigilancia', lo: 70, hi: 85 },
    { sev: 'optimo', label: 'Óptimo', lo: 85, hi: 100 },
  ];
  const segs = zones.map((z) => `<span class="cal-wqisc-seg cal-sev--${z.sev}" style="flex:${z.hi - z.lo}"><i>${z.lo}</i></span>`).join('');
  const mark = wqi == null ? '' : `<span class="cal-wqisc-mark" style="left:${Math.max(0, Math.min(100, wqi))}%"></span>`;
  return `<div class="cal-wqisc">
      <div class="cal-wqisc-cap">Clasificación del WQI ${wqi == null ? '' : `· actual <b>${wqi}</b>`}</div>
      <div class="cal-wqisc-bar" role="img" aria-label="Escala del WQI de 0 a 100${wqi == null ? '' : `, valor actual ${wqi}`}">${segs}${mark}</div>
      <div class="cal-wqisc-legend">${zones.map((z) => `<span class="cal-sev--${z.sev}"><i></i>${esc(z.label)} <b>${z.lo === 0 ? '&lt;' + z.hi : '≥' + z.lo}</b></span>`).join('')}</div>
    </div>`;
}

/* ── Micro-visualización: sparkline (SVG inline, hereda color por `currentColor`). ── */
function calSpark(vals, w = 74, h = 22, pad = 2) {
  const pts = vals.map((v, i) => ({ i, v })).filter((p) => p.v != null && !isNaN(p.v));
  if (pts.length < 2) return `<svg class="cal-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const n = vals.length;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)), span = hi - lo || 1;
  const X = (i) => pad + (i / (n - 1)) * (w - 2 * pad);
  const Y = (v) => h - pad - ((v - lo) / span) * (h - 2 * pad);
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = `M${X(pts[0].i).toFixed(1)} ${h - pad} ${pts.map((p) => `L${X(p.i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ')} L${X(last.i).toFixed(1)} ${h - pad} Z`;
  return `<svg class="cal-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="currentColor" fill-opacity=".13"/>
    <path d="${line}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${X(last.i).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="1.8" fill="currentColor"/>
  </svg>`;
}

/** Franja de INSTRUMENTOS de Calidad de Agua: KPIs con identidad visual + micro-viz.
 *  Cada tarjeta responde una pregunta (cuántas · cumplimiento/tendencia · severidad · dónde),
 *  reutilizando el sistema de color --sev de la vista para cohesión con el gauge/mapa de riesgo. */
function calKpiStripHTML(samples, { outC, fullOk, pctOk, evaluated, evalCount, outByParam, alertAttrs }) {
  // Perfil de severidad (4 niveles) sobre TODAS las mediciones con rango.
  const sevOrder = ['optimo', 'vigilancia', 'fuera', 'critico'];
  const sevCount = { optimo: 0, vigilancia: 0, fuera: 0, critico: 0 };
  samples.forEach((s) => s.meas.forEach((m) => { if (sevCount[m.severity] != null) sevCount[m.severity]++; }));
  const sevTot = sevOrder.reduce((a, k) => a + sevCount[k], 0) || 1;
  const pctOpt = Math.round(sevCount.optimo / sevTot * 100);

  // Series por día: cobertura (nº muestras) + cumplimiento (% mediciones en rango).
  const byDay = new Map();
  samples.forEach((s) => {
    const t = s.ctx.fecha ? +s.ctx.fecha : null; if (t == null || isNaN(t)) return;
    const k = Math.floor(t / 86400000);
    const b = byDay.get(k) || { n: 0, in: 0, out: 0 };
    b.n++; s.meas.forEach((m) => { if (m.estado === 'dentro') b.in++; else if (m.estado === 'fuera') b.out++; });
    byDay.set(k, b);
  });
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const tlMax = Math.max(1, ...days.map((k) => byDay.get(k).n));
  const compSeries = days.map((k) => { const b = byDay.get(k); const ev = b.in + b.out; return ev ? Math.round(b.in / ev * 100) : null; });
  const compVals = compSeries.filter((v) => v != null);
  const compDelta = compVals.length >= 2 ? compVals[compVals.length - 1] - compVals[compVals.length - 2] : null;
  const dArrow = compDelta == null ? '' : compDelta > 0 ? 'up' : compDelta < 0 ? 'dn' : '';

  const compSev = pctOk == null ? '' : pctOk >= 90 ? 'optimo' : pctOk >= 70 ? 'vigilancia' : 'critico';
  const sevProfileSev = pctOpt >= 80 ? 'optimo' : pctOpt >= 60 ? 'vigilancia' : 'fuera';

  // 01 · Timeline compacto (cobertura de muestreo por día).
  const timeline = days.length
    ? `<div class="cal-inst-tl" role="img" aria-label="Muestras por día de muestreo">${days.map((k) => `<span style="height:${Math.max(14, Math.round(byDay.get(k).n / tlMax * 100))}%" title="${byDay.get(k).n} muestra(s)"></span>`).join('')}</div>`
    : '<span class="cal-inst-hint">sin fechas</span>';

  // 03 · Barra segmentada de severidad + leyenda de conteos.
  const segBar = `<div class="cal-inst-seg" role="img" aria-label="Distribución de severidad de las mediciones">${sevOrder.map((k) => sevCount[k] ? `<span class="cal-sev--${k}" style="flex:${sevCount[k]}" title="${esc(CAL_SEV[k].label)}: ${sevCount[k]}"></span>` : '').join('')}</div>`;
  const segLegend = `<div class="cal-inst-seglg">${sevOrder.map((k) => `<span class="cal-sev--${k}" title="${esc(CAL_SEV[k].label)}"><i></i>${sevCount[k]}</span>`).join('')}</div>`;

  // 04 · Top parámetros fuera de rango (mini-bullets).
  const tops = [...outByParam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topMax = Math.max(1, ...tops.map((t) => t[1]));
  const topBars = tops.length
    ? `<div class="cal-inst-tops">${tops.map(([p, c]) => `<div class="cal-inst-top"><span class="cal-inst-top-l" title="${esc(p)}">${esc(p)}</span><span class="cal-inst-top-bar"><i style="width:${Math.round(c / topMax * 100)}%"></i></span><b>${c}</b></div>`).join('')}</div>`
    : '<span class="cal-inst-ok">✓ Todo en rango</span>';

  const inst = (ix, sev, label, valueHtml, vizHtml, footHtml, attrs = '') => `
    <div class="cal-inst${sev ? ' cal-sev--' + sev : ''}"${attrs ? ' ' + attrs : ''}>
      <div class="cal-inst-h"><span class="cal-inst-ix">${ix}</span>${label}</div>
      <div class="cal-inst-main"><div class="cal-inst-v">${valueHtml}</div>${vizHtml}</div>
      ${footHtml ? `<div class="cal-inst-foot">${footHtml}</div>` : ''}
    </div>`;

  const compFoot = pctOk == null
    ? 'sin parámetros con rango objetivo'
    : `${fullOk} de ${evalCount} al 100%${compDelta != null ? ` · <b class="cal-inst-d ${dArrow}">${compDelta > 0 ? '▲' : compDelta < 0 ? '▼' : '▬'} ${Math.abs(compDelta)}pt</b>` : ''}`;

  // Datos para los modales de detalle de cada KPI (se llenan al hacer clic).
  _calKpiData = {
    samples, sevOrder, sevCount, sevTot, pctOpt, pctOk, fullOk, outC, evaluated, evalCount, outByParam,
    dayStats: days.map((k) => ({ k, ...byDay.get(k) })),
  };
  const kpiClick = (which) => `data-cal-kpi="${which}" role="button" tabindex="0" title="Ver detalle"`;

  return `<div class="cal-inst-strip">
    ${inst('01', '', '💧 Muestras', String(samples.length), timeline, `${days.length} día(s) de muestreo`, kpiClick('muestras'))}
    ${inst('02', compSev, '✅ Cumplimiento', pctOk == null ? '—' : `${pctOk}<small>%</small>`, calSpark(compSeries), compFoot, kpiClick('cumplimiento'))}
    ${inst('03', sevProfileSev, '🧭 Perfil de severidad', `${pctOpt}<small>% óptimo</small>`, `<div class="cal-inst-segwrap">${segBar}${segLegend}</div>`, '', kpiClick('perfil'))}
    ${inst('04', outC > 0 ? 'fuera' : 'optimo', '⚠️ Fuera de rango', String(outC), topBars, evaluated ? `${(outC / evaluated * 100).toFixed(0)}% de evaluados` : 'sin evaluar', alertAttrs)}
  </div>`;
}

function renderCalidadAgua() {
  const all = calAguaRows();
  if (!all.length) return `<div class="mic-calagua">${emptyBox('No se encontraron registros en la hoja "Calidad de Agua" del Google Sheet.')}</div>`;
  const ranges = loadCalRanges();
  const ctxCache = new Map();
  const ctxOf = (r) => { if (!ctxCache.has(r)) ctxCache.set(r, calCtx(r)); return ctxCache.get(r); };

  // Barra de mes (corrida → mes; las filas sin corrida pasan en cualquier mes).
  const corridas = [...new Set(all.map((r) => ctxOf(r).corrida).filter(Boolean))];
  const months = [...new Set(corridas.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (vState.calMonth == null || (months.length && !months.includes(vState.calMonth))) vState.calMonth = months.length ? months[months.length - 1] : 0;
  const inMonth = (r) => { const c = ctxOf(r).corrida; return !c || !months.length || monthIndexOfCorrida(+c) === vState.calMonth; };

  // Filtros en CASCADA: departamento → formato → dimensiones de contexto dinámicas.
  let pool = all.filter(inMonth);
  const deptos = [...new Set(pool.map((r) => ctxOf(r).depto).filter(Boolean))].sort(natCmp);
  if (vState.calDepto && !deptos.includes(vState.calDepto)) vState.calDepto = null;
  if (!vState.calDepto) vState.calFormato = null;
  if (vState.calDepto) pool = pool.filter((r) => ctxOf(r).depto === vState.calDepto);
  const formatos = vState.calDepto ? [...new Set(pool.map((r) => ctxOf(r).formato).filter(Boolean))].sort(natCmp) : [];
  if (vState.calFormato && !formatos.includes(vState.calFormato)) vState.calFormato = null;
  if (vState.calFormato) pool = pool.filter((r) => ctxOf(r).formato === vState.calFormato);
  const dimFilters = [];
  CAL_DIMS.forEach((dim) => {
    const vals = [...new Set(pool.map((r) => dim.pick(ctxOf(r))).filter((v) => v !== '' && v != null))].sort(dim.cmp || natCmp);
    if (dim.multi) {
      // Selección MÚLTIPLE (chips): array de valores; se depura a los presentes en el pool.
      const sel = (Array.isArray(vState.calDims[dim.key]) ? vState.calDims[dim.key] : []).filter((v) => vals.includes(v));
      vState.calDims[dim.key] = sel.length ? sel : null;
      if (vals.length < 2) { vState.calDims[dim.key] = null; return; }
      dimFilters.push({ dim, options: vals });
      if (sel.length) pool = pool.filter((r) => sel.includes(dim.pick(ctxOf(r))));
    } else {
      if (vState.calDims[dim.key] && !vals.includes(vState.calDims[dim.key])) vState.calDims[dim.key] = null;
      if (vals.length < 2) { vState.calDims[dim.key] = null; return; }
      dimFilters.push({ dim, options: vals });
      if (vState.calDims[dim.key]) pool = pool.filter((r) => dim.pick(ctxOf(r)) === vState.calDims[dim.key]);
    }
  });

  // Muestras con sus parámetros medidos + estado (más reciente primero).
  const samples = pool.map((r) => ({ ctx: ctxOf(r), meas: calMeasured(r, ranges) }))
    .filter((s) => s.meas.length)
    .sort((a, b) => (b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  _calScope = { samples }; // para el modal de alertas y el export

  // KPIs de cumplimiento.
  let inC = 0, outC = 0; const outByParam = new Map();
  samples.forEach((s) => s.meas.forEach((m) => {
    if (m.estado === 'dentro') inC++;
    else if (m.estado === 'fuera') { outC++; outByParam.set(m.label, (outByParam.get(m.label) || 0) + 1); }
  }));
  const evaluated = inC + outC; // parámetros con rango (no "sin-rango")
  // Cumplimiento SOLO sobre muestras con ≥1 parámetro evaluable (con rango): una muestra
  // que únicamente mide parámetros sin rango objetivo no es "100% en rango" (no hay nada
  // que evaluar), así que se excluye para no inflar el % a un falso 100 %.
  const evalSamples = samples.filter((s) => s.meas.some((m) => m.estado === 'dentro' || m.estado === 'fuera'));
  const fullOk = evalSamples.filter((s) => s.meas.every((m) => m.estado !== 'fuera')).length;
  const pctOk = evalSamples.length ? Math.round((fullOk / evalSamples.length) * 100) : null;

  const monthBar = months.length ? `<div class="mic-monthbar">
      <button class="mic-month-nav" data-cal-month="-1" ${months.indexOf(vState.calMonth) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
      <span class="mic-month-lbl">📅 ${esc(monthLabelAt(vState.calMonth))}</span>
      <button class="mic-month-nav" data-cal-month="1" ${months.indexOf(vState.calMonth) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
    </div>` : '';

  let h = `<div class="mic-calagua">`;
  h += `<div class="mic-filters">
      ${monthBar}
      ${deptos.length ? calSelect('calDepto', vState.calDepto, deptos, 'Todos los deptos.') : ''}
      ${vState.calDepto && formatos.length ? calSelect('calFormato', vState.calFormato, formatos, 'Todos los formatos') : ''}
      ${dimFilters.map(({ dim, options }) => dim.multi ? calDimChips(dim, vState.calDims[dim.key] || [], options) : calDimSelect(dim, vState.calDims[dim.key], options)).join('')}
      <div class="mic-export"><button class="mic-exp" data-cal-factors title="Editar rangos objetivo (mín/máx) por parámetro">⚙️ Rangos</button><button class="mic-exp" data-cal-export title="Descargar reporte de texto de las muestras filtradas">⬇ Reporte</button><button class="mic-exp" data-cal-xlsx title="Descargar Excel de las muestras filtradas">⬇ Excel</button></div>
    </div>`;
  const alertAttrs = outC > 0 ? 'data-cal-alerts role="button" tabindex="0" title="Ver listado de mediciones fuera de rango"' : '';
  h += calKpiStripHTML(samples, { outC, fullOk, pctOk, evaluated, evalCount: evalSamples.length, outByParam, alertAttrs });

  // Panel del Analista: síntesis técnica autogenerada (WQI global + diagnóstico).
  h += calAnalystHTML(samples, ranges);

  // Doble lente: Por parámetro (Analizador) · Por ubicación (fichas Módulo→Tanque +
  // mapa de riesgo) · Ensayo (solo si hay parejas antes/después, p. ej. Maduración).
  const ensayo = calEnsayoData(pool);
  _calTrend = null; _calEnsayo = null; _calLocTree = null; // se rellenan solo al dibujar/render su apartado
  const validAps = ['analizador', 'ubicacion', ...(ensayo.length ? ['ensayo'] : [])];
  const ap = validAps.includes(vState.calApartado) ? vState.calApartado : 'analizador';
  h += `<div class="mic-apartados">
      <button class="mic-ap ${ap === 'analizador' ? 'is-active' : ''}" data-cal-ap="analizador">🔬 Por parámetro</button>
      <button class="mic-ap ${ap === 'ubicacion' ? 'is-active' : ''}" data-cal-ap="ubicacion">📍 Por ubicación</button>
      ${ensayo.length ? `<button class="mic-ap ${ap === 'ensayo' ? 'is-active' : ''}" data-cal-ap="ensayo">⚗️ Ensayo</button>` : ''}
    </div>`;
  if (ap === 'ubicacion') h += calSevLegendHTML();

  if (ap === 'ensayo') h += calEnsayoHTML(ensayo);
  else if (!samples.length) h += emptyBox('Sin muestras con parámetros medidos para el filtro actual.');
  else if (ap === 'ubicacion') h += calUbicacionHTML(samples, ranges);
  else h += calAnalizadorHTML(samples, ranges);
  h += calAlertModalHTML();
  h += calKpiModalHTML();
  h += calTankModalHTML();
  h += calFichaModalHTML();
  h += calFactModalHTML(ranges);
  h += `</div>`;
  return h;
}

/* ---- Calidad de Agua · modales de detalle de los KPIs (Muestras/Cumplimiento/Perfil) ---- */
const CAL_KPI_TITLE = { muestras: '💧 Muestras', cumplimiento: '✅ Cumplimiento', perfil: '🧭 Perfil de severidad' };
function calKpiModalHTML() {
  return `<div class="mic-modal" id="calKpiModal" data-cal-kpi-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title" id="calKpiTitle">Detalle</span>
          <button class="mic-modal-x" data-cal-kpi-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body" id="calKpiBody"></div>
      </div>
    </div>`;
}
function calKpiBodyHTML(which) {
  const d = _calKpiData; if (!d) return '';
  const dayDate = (k) => fmtShort(new Date(k * 86400000));
  const chips = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="cal-kpi-chip">${esc(k)} <b>${v}</b></span>`).join('') || '—';
  if (which === 'muestras') {
    const byDepto = new Map(), byTipo = new Map();
    d.samples.forEach((s) => {
      byDepto.set(s.ctx.depto || '—', (byDepto.get(s.ctx.depto || '—') || 0) + 1);
      byTipo.set(s.ctx.tipoMuestra || '—', (byTipo.get(s.ctx.tipoMuestra || '—') || 0) + 1);
    });
    const dayRows = d.dayStats.map((x) => { const ev = x.in + x.out; const pct = ev ? Math.round(x.in / ev * 100) : null; return `<tr><td>${esc(dayDate(x.k))}</td><td>${x.n}</td><td>${pct == null ? '—' : pct + '%'}</td></tr>`; }).join('');
    return `<p class="cal-kpi-lead">Se registraron <b>${d.samples.length}</b> muestra(s) en <b>${d.dayStats.length}</b> día(s) de muestreo del filtro actual.</p>
      <div class="cal-kpi-sec"><h4>Por departamento</h4><div class="cal-kpi-chips">${chips(byDepto)}</div></div>
      <div class="cal-kpi-sec"><h4>Por tipo de muestra</h4><div class="cal-kpi-chips">${chips(byTipo)}</div></div>
      <div class="cal-kpi-sec"><h4>Por día</h4><table class="cal-kpi-table"><thead><tr><th>Fecha</th><th>Muestras</th><th>% en rango</th></tr></thead><tbody>${dayRows || '<tr><td colspan="3">Sin fechas registradas.</td></tr>'}</tbody></table></div>`;
  }
  if (which === 'cumplimiento') {
    const inC = d.evaluated - d.outC;
    const dayRows = d.dayStats.map((x) => { const ev = x.in + x.out; const pct = ev ? Math.round(x.in / ev * 100) : null; return `<tr><td>${esc(dayDate(x.k))}</td><td>${x.in}</td><td>${x.out}</td><td>${pct == null ? '—' : pct + '%'}</td></tr>`; }).join('');
    const lead = d.pctOk == null
      ? 'Ninguna muestra del filtro tiene parámetros con rango objetivo, por lo que no hay cumplimiento que evaluar.'
      : `<b>${d.pctOk}%</b> de cumplimiento: <b>${d.fullOk}</b> de <b>${d.evalCount}</b> muestra(s) con parámetros evaluables tienen TODOS sus parámetros dentro de rango.`;
    return `<p class="cal-kpi-lead">${lead}</p>
      <p class="cal-kpi-note">"En rango" = valor dentro de [mín, máx] del parámetro. De <b>${d.evaluated}</b> medición(es) con rango objetivo, <b>${inC}</b> están dentro y <b>${d.outC}</b> fuera.</p>
      <div class="cal-kpi-sec"><h4>Cumplimiento por día</h4><table class="cal-kpi-table"><thead><tr><th>Fecha</th><th>Dentro</th><th>Fuera</th><th>% en rango</th></tr></thead><tbody>${dayRows || '<tr><td colspan="4">Sin fechas registradas.</td></tr>'}</tbody></table></div>`;
  }
  // perfil de severidad
  const meaning = {
    optimo: 'valor holgadamente dentro de rango (excursión ≤ 0.9).',
    vigilancia: 'dentro de rango pero rozando el borde (0.9–1.0).',
    fuera: 'fuera de rango (excursión 1.0–2.0).',
    critico: 'muy fuera de rango (excursión &gt; 2.0).',
  };
  const rows = d.sevOrder.map((k) => { const c = d.sevCount[k]; const pct = d.sevTot ? Math.round(c / d.sevTot * 100) : 0; return `<div class="cal-kpi-sevrow cal-sev--${k}"><span class="cal-kpi-sevname">${esc(CAL_SEV[k].label)}</span><span class="cal-kpi-sevbar"><i style="width:${pct}%"></i></span><b>${c}</b><span class="cal-kpi-sevpct">${pct}%</span></div>`; }).join('');
  const notes = d.sevOrder.map((k) => `<li class="cal-sev--${k}"><b>${esc(CAL_SEV[k].label)}:</b> ${meaning[k]}</li>`).join('');
  return `<p class="cal-kpi-lead">Distribución de <b>${d.sevTot}</b> medición(es) con rango objetivo por nivel de severidad.</p>
    <div class="cal-kpi-sevlist">${rows}</div>
    <div class="cal-kpi-sec"><h4>Qué significa cada nivel</h4><ul class="cal-kpi-legend">${notes}</ul></div>`;
}
function openCalKpi(root, which) {
  const title = root.querySelector('#calKpiTitle'); if (title) title.textContent = CAL_KPI_TITLE[which] || 'Detalle';
  const body = root.querySelector('#calKpiBody'); if (body) body.innerHTML = calKpiBodyHTML(which);
  const m = root.querySelector('#calKpiModal');
  if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); }
}
function closeCalKpi(root) {
  const m = root.querySelector('#calKpiModal');
  if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

/* ---- Calidad de Agua · modal de alertas (mediciones fuera de rango) ---- */
function calAlertList(samples) {
  const out = [];
  samples.forEach((s) => s.meas.forEach((m) => { if (m.estado === 'fuera') out.push({ ctx: s.ctx, m }); }));
  return out.sort((a, b) => (b.ctx.fecha || 0) - (a.ctx.fecha || 0));
}
function calAlertBodyHTML(samples) {
  const list = calAlertList(samples);
  if (!list.length) return '<div class="empty-state" style="padding:36px">✓ Sin parámetros fuera de rango para el filtro actual.</div>';
  const strip = (a) => `<div class="mic-alert" style="--ac:#e8303e">
      <div class="mic-alert-h">${esc(a.m.label)} · ${esc(calFmt(a.m.value))}${a.m.unit ? ' ' + esc(a.m.unit) : ''} <span style="font-weight:600;color:var(--c-text-soft)">(objetivo ${esc(a.m.range || '—')})</span></div>
      <div class="mic-alert-s">${a.ctx.fecha ? esc(fmtShort(a.ctx.fecha)) : '—'} · ${esc([a.ctx.depto, a.ctx.formato].filter(Boolean).join(' · ') || '—')} · ${esc(calLocation(a.ctx))}</div>
    </div>`;
  return `<div class="mic-alert-count">${list.length} medición(es) fuera de rango · ordenadas por fecha</div><div class="mic-alert-list">${list.map(strip).join('')}</div>`;
}
function calAlertModalHTML() {
  return `<div class="mic-modal" id="calAlertModal" data-cal-alert-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title">⚠️ Parámetros fuera de rango</span>
          <button class="mic-modal-x" data-cal-alert-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body" id="calAlertBody"></div>
      </div>
    </div>`;
}
function openCalAlert(root) {
  const body = root.querySelector('#calAlertBody');
  if (body) body.innerHTML = calAlertBodyHTML(_calScope.samples);
  const m = root.querySelector('#calAlertModal');
  if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); }
}
function closeCalAlert(root) {
  const m = root.querySelector('#calAlertModal');
  if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

/* ---- Calidad de Agua · export (Reporte TXT + Excel de las muestras filtradas) ---- */
function calExportCols(samples) {
  const present = new Set();
  samples.forEach((s) => s.meas.forEach((m) => present.add(m.key)));
  return CAL_PARAMS.filter((p) => present.has(p.key));
}
function calStamp() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }
function calExportXlsx() {
  const XLSX = window.XLSX;
  if (!XLSX) { toast('Exportación no disponible: SheetJS (XLSX) no se cargó.', 'err'); return; }
  const samples = _calScope.samples || [];
  if (!samples.length) { toast('Sin muestras para exportar.', 'warn'); return; }
  const cols = calExportCols(samples);
  const header = ['Fecha', 'Departamento', 'Formato', 'Ubicación', ...cols.map((c) => c.unit ? `${c.label} (${c.unit})` : c.label)];
  const aoa = [header, ...samples.map((s) => {
    const byKey = Object.fromEntries(s.meas.map((m) => [m.key, m]));
    return [s.ctx.fecha ? fmtShort(s.ctx.fecha) : '', s.ctx.depto || '', s.ctx.formato || '', calLocation(s.ctx), ...cols.map((c) => (byKey[c.key] ? byKey[c.key].value : ''))];
  })];
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Calidad de Agua');
  XLSX.writeFile(wb, `calidad_agua_${calStamp()}.xlsx`);
}
function calExportTxt() {
  const samples = _calScope.samples || [];
  if (!samples.length) { toast('Sin muestras para exportar.', 'warn'); return; }
  const lines = ['='.repeat(52), 'REPORTE DE CALIDAD DE AGUA (fisicoquímica)', `Generado: ${new Date().toLocaleString('es-EC')}`, `Muestras: ${samples.length}`, '='.repeat(52), ''];
  samples.forEach((s) => {
    lines.push(`• ${s.ctx.fecha ? fmtShort(s.ctx.fecha) : '—'} · ${[s.ctx.depto, s.ctx.formato].filter(Boolean).join(' · ') || '—'} · ${calLocation(s.ctx)}`);
    s.meas.forEach((m) => {
      const flag = m.estado === 'fuera' ? '  ⚠ FUERA' : m.estado === 'dentro' ? '  ✓' : '';
      lines.push(`    - ${m.label}: ${calFmt(m.value)}${m.unit ? ' ' + m.unit : ''}${m.range ? ` (objetivo ${m.range})` : ''}${flag}`);
    });
    lines.push('');
  });
  lines.push('='.repeat(52));
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `reporte_calidad_agua_${calStamp()}.txt`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- Calidad de Agua · editor de rangos objetivo ("Factores") ---- */
const CAL_RANGES_KEY = 'larv4_cal_ranges'; // misma clave que la capa de datos / app de captura
function calFactModalHTML(ranges) {
  const rows = CAL_PARAMS.map((p) => {
    const r = ranges[p.key] || {};
    return `<div class="cal-fact-row">
        <span class="cal-fact-l">${esc(p.label)}${p.unit ? ` <span class="muted">(${esc(p.unit)})</span>` : ''}</span>
        <input type="number" step="any" class="cal-fact-in" data-cal-rmin="${esc(p.key)}" placeholder="mín" aria-label="Mínimo de ${esc(p.label)}" value="${r.min != null ? esc(String(r.min)) : ''}">
        <input type="number" step="any" class="cal-fact-in" data-cal-rmax="${esc(p.key)}" placeholder="máx" aria-label="Máximo de ${esc(p.label)}" value="${r.max != null ? esc(String(r.max)) : ''}">
      </div>`;
  }).join('');
  return `<div class="mic-modal" id="calFactModal" data-cal-fact-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title">⚙️ Rangos objetivo · Calidad de Agua</span>
          <button class="mic-modal-x" data-cal-fact-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body">
          <p class="muted" style="margin:0 0 12px;font-size:12px">Ajusta el rango de aceptación (mín/máx) por parámetro. Deja un campo vacío para no fijar ese límite. Se guardan en este navegador, igual que en la app de captura.</p>
          <div class="cal-fact-grid">
            <div class="cal-fact-head"><span></span><span>mín</span><span>máx</span></div>
            ${rows}
          </div>
          <div class="cal-fact-actions">
            <button class="mic-exp" data-cal-fact-reset>↺ Restablecer</button>
            <button class="mic-exp cal-fact-save" data-cal-fact-save>✓ Guardar</button>
          </div>
        </div>
      </div>
    </div>`;
}
function openCalFact(root) { const m = root.querySelector('#calFactModal'); if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); } }
function closeCalFact(root) { const m = root.querySelector('#calFactModal'); if (m) m.classList.remove('is-open'); document.body.classList.remove('modal-open'); }
function saveCalFactors(root) {
  let stored = {};
  try { const raw = localStorage.getItem(CAL_RANGES_KEY); if (raw) stored = JSON.parse(raw) || {}; } catch (_) { stored = {}; }
  // 1ª pasada: parsea + valida min≤max. Si algún rango está invertido, aborta el
  // guardado ENTERO (no persiste nada) para no dejar un estado parcial confuso.
  const edits = [], bad = [];
  CAL_PARAMS.forEach((p) => {
    const mn = root.querySelector(`[data-cal-rmin="${p.key}"]`);
    const mx = root.querySelector(`[data-cal-rmax="${p.key}"]`);
    const min = mn && mn.value.trim() !== '' ? parseFloat(mn.value) : null;
    const max = mx && mx.value.trim() !== '' ? parseFloat(mx.value) : null;
    const o = {};
    if (min != null && !isNaN(min)) o.min = min;
    if (max != null && !isNaN(max)) o.max = max;
    if (o.min != null && o.max != null && o.min > o.max) { bad.push(p.label); return; }
    edits.push({ key: p.key, o });
  });
  if (bad.length) { toast(`Rango inválido (mín > máx): ${bad.join(', ')}. Corrígelo antes de guardar.`, 'err'); return; }
  edits.forEach(({ key, o }) => { if (Object.keys(o).length) stored[key] = o; else delete stored[key]; });
  try { localStorage.setItem(CAL_RANGES_KEY, JSON.stringify(stored)); } catch (_) { toast('No se pudieron guardar los rangos (almacenamiento no disponible).', 'err'); return; }
  closeCalFact(root); toast('Rangos guardados.', 'ok'); microbiologiaView(root);
}
function resetCalFactors(root) {
  try { localStorage.removeItem(CAL_RANGES_KEY); } catch (_) { /* sin almacenamiento */ }
  closeCalFact(root); toast('Rangos restablecidos a los valores por defecto.', 'ok'); microbiologiaView(root);
}

// Severidad → clave de color equivalente para el nivel de riesgo de un nodo.
const RISK_TO_SEV = { bajo: 'optimo', medio: 'vigilancia', alto: 'fuera', critico: 'critico', 'sin-datos': 'sin-rango' };
// Leyenda de severidad (4 niveles) para el modo "Por ubicación".
const calSevLegendHTML = () => `<div class="cal-legend">
    ${['optimo', 'vigilancia', 'fuera', 'critico'].map((k) => `<span class="cal-legend-item"><span class="cal-dot cal-sev--${k}"></span>${esc(CAL_SEV[k].label)}</span>`).join('')}
  </div>`;

/** Última medición por parámetro en una lista de muestras (ordenada desc por fecha:
 *  la primera aparición de cada parámetro es la más reciente). */
function calLatestByParam(sampleList) {
  const latest = new Map();
  sampleList.forEach((s) => s.meas.forEach((m) => { if (!latest.has(m.key)) latest.set(m.key, m); }));
  return latest;
}

/** Apartado "Por ubicación": mapa de riesgo (Matriz ⇄ Red) + comparador de tanques
 *  (Coordenadas paralelas ⇄ Small multiples) + fichas técnicas jerárquicas. */
function calUbicacionHTML(samples, ranges) {
  const tree = calGroupTree(samples, ranges);
  _calLocTree = tree;
  if (!tree.length) return emptyBox('Sin ubicaciones con parámetros medidos para el filtro actual.');

  // ── Mapa de riesgo · Matriz (heatmap Módulo × Tanque) ──
  const riskSec = `<div class="cal-loc-sec">
      <div class="cal-loc-sechead"><span class="cal-loc-sectitle">🗺️ Mapa de riesgo · Módulo × Tanque</span></div>
      ${calRiskMatrixHTML(tree)}
    </div>`;

  // ── Comparador de tanques · dos estilos (Paralelas / Small multiples) ──
  const { axes, tanks } = calCmpData(tree, ranges);
  let cmpSec = '';
  if (axes.length >= 2 && tanks.length >= 2) {
    const cmpView = vState.calCmpView === 'multiples' ? 'multiples' : 'paralelas';
    const cmpToggle = calViewToggle('cal-cmpview', [['paralelas', '🧵 Paralelas'], ['multiples', '▤ Small multiples']], cmpView);
    const hint = cmpView === 'multiples'
      ? '· un panel por parámetro · cada barra es un tanque contra la banda objetivo'
      : '· cada línea es un tanque a través de los parámetros · banda verde = zona objetivo';
    cmpSec = `<div class="cal-loc-sec">
        <div class="cal-loc-sechead"><span class="cal-loc-sectitle">🧪 Comparador de tanques <span class="cal-loc-secsub">${hint}</span></span>${cmpToggle}</div>
        ${cmpView === 'multiples' ? calSmallMultiplesHTML(axes, tanks, ranges) : calParallelBody(axes, tanks, ranges)}
      </div>`;
  }

  // Fichas técnicas jerárquicas: módulo colapsable → tarjetas de tanque. Por defecto
  // solo se expande el módulo de peor riesgo (el primero); el resto queda colapsado.
  const fichas = tree.map((mo, mi) => {
    const openState = vState.calLocOpen[mo.label];
    const open = openState === undefined ? (mi === 0) : openState;
    const cards = mo.tanks.map((t, ti) => calFichaHTML(mi, ti, t)).join('');
    return `<div class="cal-loc-mod">
        <button class="cal-loc-head cal-risk--${mo.risk}" data-cal-mod="${esc(mo.label)}" aria-expanded="${open}">
          <span class="cal-loc-caret">${open ? '▾' : '▸'}</span>
          <span class="cal-loc-modname">${esc(mo.label)}</span>
          <span class="cal-loc-modrisk cal-risk--${mo.risk}">${esc(CAL_RISK[mo.risk].label)}</span>
          ${mo.wqi != null ? `<span class="cal-loc-modwqi">WQI ${mo.wqi}</span>` : ''}
          <span class="cal-loc-modn">${mo.tanks.length} tanque(s)</span>
        </button>
        ${open ? `<div class="cal-loc-cards">${cards}</div>` : ''}
      </div>`;
  }).join('');

  return `${riskSec}${cmpSec}<div class="cal-fichas-t">🗂️ Fichas técnicas por tanque <span>· toca un módulo para desplegar sus tanques · toca una ficha para el detalle</span></div><div class="cal-fichas">${fichas}</div>`;
}

// Conmutador de estilo (dos vistas). `attr` → data-<attr>; options = [[key,label],...].
function calViewToggle(attr, options, active) {
  return `<div class="cal-vtoggle" role="group" aria-label="Estilo de visualización">${options.map(([k, lbl]) =>
    `<button class="cal-vt${k === active ? ' is-on' : ''}" data-${attr}="${k}" aria-pressed="${k === active}">${lbl}</button>`).join('')}</div>`;
}

/** Mapa de riesgo · MATRIZ (heatmap Módulo×Tanque). */
function calRiskMatrixHTML(tree) {
  return `<div class="cal-riskmap"><div class="cal-rm-rows">
        ${tree.map((mo, mi) => `<div class="cal-rm-row">
            <div class="cal-rm-mod cal-risk--${mo.risk}"><b>${esc(mo.label)}</b>${mo.wqi != null ? `<span>WQI ${mo.wqi}</span>` : ''}</div>
            <div class="cal-rm-cells">
              ${mo.tanks.map((t, ti) => `<button class="cal-rm-cell cal-risk--${t.risk}" data-cal-tank="${mi}-${ti}" title="${esc(mo.label)} · ${esc(t.label)} — ${esc(CAL_RISK[t.risk].label)}${t.wqi != null ? ' · WQI ' + t.wqi : ''}">${esc(t.label)}${t.wqi != null ? `<small>${t.wqi}</small>` : ''}</button>`).join('')}
            </div>
          </div>`).join('')}
      </div></div>`;
}

/** Datos del comparador: ejes (parámetros con rango presentes) + tanques con su última medición. */
function calCmpData(tree, ranges) {
  const present = new Set();
  tree.forEach((mo) => mo.tanks.forEach((t) => t.samples.forEach((s) => s.meas.forEach((m) => present.add(m.key)))));
  const axes = CAL_PARAMS.filter((p) => present.has(p.key) && ranges[p.key]);
  const tanks = [];
  tree.forEach((mo, mi) => mo.tanks.forEach((t, ti) => tanks.push({ mi, ti, label: mo.label + ' · ' + t.label, tqLabel: t.label, risk: t.risk, wqi: t.wqi, latest: calLatestByParam(t.samples) })));
  return { axes, tanks };
}

/** Comparador · COORDENADAS PARALELAS: cada tanque es una polilínea a través de los
 *  parámetros con rango (normalizados por `calScale`, escala 0–100 con la zona objetivo
 *  como banda); línea coloreada por riesgo, vértices por severidad. Clic/Enter → ficha. */
function calParallelBody(axes, tanks, ranges) {
  const W = 660, H = 300, padT = 26, padB = 48, padL = 30, padR = 30;
  const plotT = padT, plotB = H - padB, plotH = plotB - plotT;
  const axX = (i) => padL + (i / (axes.length - 1)) * (W - padL - padR);
  const y = (pos) => plotB - (pos / 100) * plotH;
  const axisSVG = axes.map((p, i) => {
    const x = axX(i); const sc = calScale(ranges[p.key], null);
    const yTop = y(sc.hiPct != null ? sc.hiPct : 100), yBot = y(sc.loPct != null ? sc.loPct : 0);
    const band = sc.has ? `<rect x="${(x - 5).toFixed(1)}" y="${Math.min(yTop, yBot).toFixed(1)}" width="10" height="${Math.abs(yBot - yTop).toFixed(1)}" rx="2" class="cal-pc-band"/>` : '';
    return `${band}<line x1="${x.toFixed(1)}" y1="${plotT}" x2="${x.toFixed(1)}" y2="${plotB}" class="cal-pc-axis"/>
      <text x="${x.toFixed(1)}" y="${(plotB + 16).toFixed(1)}" class="cal-pc-axlbl" text-anchor="middle">${esc(p.label)}</text>
      <text x="${x.toFixed(1)}" y="${(plotB + 28).toFixed(1)}" class="cal-pc-axrange" text-anchor="middle">${esc(calRangeText(p.key, ranges))}${p.unit ? ' ' + esc(p.unit) : ''}</text>`;
  }).join('');
  const lines = tanks.map((tk) => {
    const sv = RISK_TO_SEV[tk.risk] || 'sin-rango';
    const runs = []; let cur = [];
    axes.forEach((p, i) => {
      const m = tk.latest.get(p.key);
      if (!m) { if (cur.length) { runs.push(cur); cur = []; } return; }
      const sc = calScale(ranges[p.key], m.value);
      cur.push({ x: axX(i), yy: y(sc.pos != null ? sc.pos : 0), sev: m.severity });
    });
    if (cur.length) runs.push(cur);
    const pts = (run) => run.map((pt) => pt.x.toFixed(1) + ',' + pt.yy.toFixed(1)).join(' ');
    const polys = runs.filter((r) => r.length >= 2).map((r) => `<polyline points="${pts(r)}" class="cal-pc-line"/>`).join('');
    const hit = runs.filter((r) => r.length >= 2).map((r) => `<polyline points="${pts(r)}" class="cal-pc-hit"/>`).join('');
    const dots = runs.flat().map((pt) => `<circle cx="${pt.x.toFixed(1)}" cy="${pt.yy.toFixed(1)}" r="2.6" class="cal-pc-dot cal-sev--${pt.sev}"/>`).join('');
    return `<g class="cal-pc-tank cal-sev--${sv}" data-cal-tank="${tk.mi}-${tk.ti}" tabindex="0" role="button" aria-label="Ficha de ${esc(tk.label)}"><title>${esc(tk.label)}${tk.wqi != null ? ' · WQI ' + tk.wqi : ''}</title>${hit}${polys}${dots}</g>`;
  }).join('');
  return `<div class="cal-parallel"><div class="cal-pc-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="cal-pc-svg" role="img" aria-label="Comparador de tanques por parámetro">${axisSVG}${lines}</svg></div></div>`;
}

/** Comparador · SMALL MULTIPLES: un panel por parámetro; cada tanque es un bullet contra
 *  la banda objetivo (reusa `calScale`). Ordenado peor→mejor. Clic → ficha del tanque. */
function calSmallMultiplesHTML(axes, tanks, ranges) {
  const cells = axes.map((p) => {
    const range = ranges[p.key];
    const rows = tanks.map((tk) => ({ tk, m: tk.latest.get(p.key) })).filter((o) => o.m)
      .sort((a, b) => sevRank(b.m.severity) - sevRank(a.m.severity));
    if (!rows.length) return '';
    const scB = calScale(range, null);
    const bLo = scB.loPct != null ? scB.loPct : 0, bHi = scB.hiPct != null ? scB.hiPct : 100;
    const bandW = Math.max(0, bHi - bLo);
    const rowsHtml = rows.map(({ tk, m }) => {
      const sc = calScale(range, m.value);
      const pos = sc.pos != null ? sc.pos : 0;
      return `<button class="cal-sm-row cal-sev--${m.severity}" data-cal-tank="${tk.mi}-${tk.ti}" title="${esc(tk.label)} · ${esc(calFmt(m.value))}${p.unit ? ' ' + esc(p.unit) : ''} — ${esc(CAL_SEV[m.severity] ? CAL_SEV[m.severity].label : '')}">
          <span class="cal-sm-tq">${esc(tk.tqLabel)}</span>
          <span class="cal-sm-track"><span class="cal-sm-band" style="left:${bLo.toFixed(1)}%;width:${bandW.toFixed(1)}%"></span><span class="cal-sm-mark" style="left:${pos.toFixed(1)}%"></span></span>
          <span class="cal-sm-val">${esc(calFmt(m.value))}</span>
        </button>`;
    }).join('');
    return `<div class="cal-sm-cell">
        <div class="cal-sm-h"><span>${esc(p.label)}</span><span>${esc(calRangeText(p.key, ranges))}${p.unit ? ' ' + esc(p.unit) : ''}</span></div>
        <div class="cal-sm-rows">${rowsHtml}</div>
      </div>`;
  }).filter(Boolean).join('');
  return `<div class="cal-smult"><div class="cal-sm-grid">${cells}</div></div>`;
}

/** Ficha técnica de un tanque (tarjeta clicable → modal de detalle). */
function calFichaHTML(mi, ti, t) {
  const sev = RISK_TO_SEV[t.risk] || 'sin-rango';
  const critTxt = t.crit.length
    ? t.crit.slice(0, 4).map((c) => `<span class="cal-ficha-crit-i">● ${esc(c)}</span>`).join('') + (t.crit.length > 4 ? ` <span class="cal-ficha-crit-i">+${t.crit.length - 4}</span>` : '')
    : '<span class="cal-ficha-ok">✓ sin incumplimientos</span>';
  return `<button class="cal-ficha cal-sev--${sev}" data-cal-ficha="${mi}-${ti}" title="Ver perfil temporal de ${esc(t.label)}">
      <div class="cal-ficha-h"><span class="cal-ficha-tq">${esc(t.label)}</span><span class="cal-ficha-risk cal-sev--${sev}">${esc(CAL_RISK[t.risk].label)}</span></div>
      <div class="cal-ficha-wqi"><div class="cal-ficha-wqibar"><span class="cal-sev--${sev}" style="width:${t.wqi != null ? t.wqi : 0}%"></span></div><span class="cal-ficha-wqinum">${t.wqi != null ? t.wqi : '—'}</span></div>
      <div class="cal-ficha-crit">${critTxt}</div>
      <div class="cal-ficha-foot">${t.last ? '📅 ' + esc(fmtShort(new Date(t.last))) : 'sin fecha'} · ${t.n} muestra(s)</div>
    </button>`;
}

/* ---- Calidad de Agua · modal de ficha técnica de un tanque ---- */
function calTankModalHTML() {
  return `<div class="mic-modal" id="calTankModal" data-cal-tank-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title" id="calTankTitle">Ficha técnica</span>
          <button class="mic-modal-x" data-cal-tank-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body" id="calTankBody"></div>
      </div>
    </div>`;
}
function calTankBodyHTML(t) {
  const sev = RISK_TO_SEV[t.risk] || 'sin-rango';
  const latest = calLatestByParam(t.samples);
  const chips = CAL_PARAMS.filter((p) => latest.has(p.key)).map((p) => {
    const m = latest.get(p.key);
    return `<div class="cal-tk-chip cal-sev--${m.severity}">
        <span class="cal-tk-chip-l">${esc(p.label)}</span>
        <span class="cal-tk-chip-v">${esc(calFmt(m.value))}${p.unit ? ' ' + esc(p.unit) : ''}</span>
        <span class="cal-tk-chip-r">${m.range ? 'obj. ' + esc(m.range) : 'sin rango'}</span>
      </div>`;
  }).join('');
  return `<div class="cal-tk-top">
      <span class="cal-tk-risk cal-sev--${sev}">${esc(CAL_RISK[t.risk].label)}</span>
      <span class="cal-tk-wqi">WQI <b class="cal-sev--${sev}">${t.wqi != null ? t.wqi : '—'}</b></span>
      <span class="cal-tk-meta">${t.last ? '📅 ' + esc(fmtShort(new Date(t.last))) : 'sin fecha'} · ${t.n} muestra(s)</span>
    </div>
    <div class="cal-tk-chips">${chips || '<span class="muted">Sin parámetros medidos.</span>'}</div>`;
}
function openCalTankModal(root, key) {
  if (!_calLocTree) return;
  const [mi, ti] = key.split('-').map(Number);
  const mo = _calLocTree[mi]; const t = mo && mo.tanks[ti]; if (!t) return;
  const title = root.querySelector('#calTankTitle');
  if (title) title.textContent = `${mo.label} · ${t.label}`;
  const body = root.querySelector('#calTankBody');
  if (body) body.innerHTML = calTankBodyHTML(t);
  const m = root.querySelector('#calTankModal');
  if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); }
}
function closeCalTankModal(root) {
  const m = root.querySelector('#calTankModal');
  if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

/* ---- Calidad de Agua · ficha técnica de tanque: PERFIL TEMPORAL (evolución) ---- */
function calFichaModalHTML() {
  return `<div class="mic-modal" id="calFichaModal" data-cal-ficha-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title" id="calFichaTitle">Perfil temporal</span>
          <button class="mic-modal-x" data-cal-ficha-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body" id="calFichaBody"></div>
      </div>
    </div>`;
}
/** Cuerpo de la ficha técnica: por parámetro, valor actual + sparkline del histórico +
 *  objetivo; y tabla de mediciones por fecha (evolución). Distinto del detalle-foto del mapa. */
function calFichaBodyHTML(t) {
  const sev = RISK_TO_SEV[t.risk] || 'sin-rango';
  const sorted = [...t.samples].sort((a, b) => (a.ctx.fecha || 0) - (b.ctx.fecha || 0));
  // Mediciones por parámetro a lo largo del tiempo.
  const byParam = new Map();
  sorted.forEach((s) => s.meas.forEach((m) => {
    if (!byParam.has(m.key)) byParam.set(m.key, { label: m.label, unit: m.unit, range: m.range, pts: [] });
    byParam.get(m.key).pts.push({ t: s.ctx.fecha ? +s.ctx.fecha : null, value: m.value, severity: m.severity });
  }));
  const paramList = CAL_PARAMS.filter((p) => byParam.has(p.key));
  const rows = paramList.map((p) => {
    const d = byParam.get(p.key);
    const last = d.pts[d.pts.length - 1];
    const trend = d.pts.length >= 2 ? (last.value - d.pts[d.pts.length - 2].value) : null;
    const arrow = trend == null ? '' : trend > 0 ? '▲' : trend < 0 ? '▼' : '▬';
    return `<div class="cal-ft-row cal-sev--${last.severity}">
        <span class="cal-ft-name">${esc(d.label)}</span>
        <span class="cal-ft-val">${esc(calFmt(last.value))}${d.unit ? ' ' + esc(d.unit) : ''} <span class="cal-ft-arr">${arrow}</span></span>
        <span class="cal-ft-spark">${calSpark(d.pts.map((x) => x.value), 96, 24)}</span>
        <span class="cal-ft-obj">${d.range ? 'obj. ' + esc(d.range) : 'sin rango'}</span>
      </div>`;
  }).join('');
  // Tabla de mediciones por fecha (dedup por día, asc).
  const dayOf = (tt) => tt == null ? null : Math.floor(tt / 86400000);
  const days = [...new Set(sorted.map((s) => dayOf(s.ctx.fecha ? +s.ctx.fecha : null)).filter((x) => x != null))].sort((a, b) => a - b);
  const head = `<tr><th>Parámetro</th>${days.map((k) => `<th>${esc(fmtShort(new Date(k * 86400000)))}</th>`).join('')}</tr>`;
  const body = paramList.map((p) => {
    const d = byParam.get(p.key);
    const cells = days.map((k) => {
      const pt = d.pts.find((x) => dayOf(x.t) === k);
      return pt ? `<td class="cal-sev--${pt.severity}">${esc(calFmt(pt.value))}</td>` : '<td class="muted">—</td>';
    }).join('');
    return `<tr><th class="cal-ft-th">${esc(d.label)}</th>${cells}</tr>`;
  }).join('');
  const table = days.length ? `<div class="cal-kpi-sec"><h4>Mediciones por fecha</h4>
      <div class="cal-ft-tablewrap"><table class="cal-ft-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>` : '';

  return `<div class="cal-tk-top">
      <span class="cal-tk-risk cal-sev--${sev}">${esc(CAL_RISK[t.risk].label)}</span>
      <span class="cal-tk-wqi">WQI <b class="cal-sev--${sev}">${t.wqi != null ? t.wqi : '—'}</b></span>
      <span class="cal-tk-meta">📅 ${t.last ? esc(fmtShort(new Date(t.last))) : 'sin fecha'} · ${t.n} muestra(s) · ${days.length} día(s)</span>
    </div>
    <div class="cal-ft-rows">${rows || '<span class="muted">Sin parámetros medidos.</span>'}</div>
    ${table}`;
}
function openCalFicha(root, key) {
  if (!_calLocTree) return;
  const [mi, ti] = key.split('-').map(Number);
  const mo = _calLocTree[mi]; const t = mo && mo.tanks[ti]; if (!t) return;
  const title = root.querySelector('#calFichaTitle');
  if (title) title.textContent = `${mo.label} · ${t.label} · perfil temporal`;
  const body = root.querySelector('#calFichaBody');
  if (body) body.innerHTML = calFichaBodyHTML(t);
  const m = root.querySelector('#calFichaModal');
  if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); }
}
function closeCalFicha(root) {
  const m = root.querySelector('#calFichaModal');
  if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

/** Serie temporal de un parámetro: promedio por día (asc). */
function calParamSeries(samples, paramKey) {
  const byDay = new Map();
  samples.forEach((s) => {
    if (!s.ctx.fecha || isNaN(s.ctx.fecha)) return;
    const m = s.meas.find((x) => x.key === paramKey);
    if (!m) return;
    const d = s.ctx.fecha;
    const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    if (!byDay.has(key)) byDay.set(key, { d, label: fmtShort(d), vals: [] });
    byDay.get(key).vals.push(m.value);
  });
  return [...byDay.values()].sort((a, b) => a.d - b.d)
    .map((o) => ({ d: o.d, label: o.label, avg: o.vals.reduce((s, v) => s + v, 0) / o.vals.length, n: o.vals.length }));
}

// Gravedad numérica de una severidad (para ordenar peor→mejor).
const sevRank = (s) => (CAL_SEV[s] ? CAL_SEV[s].rank : -1);

// Etiqueta de agrupación por tanque (coherente con el árbol Módulo→Tanque de "Por ubicación").
function calTankGroupLabel(ctx) {
  const mod = ctx.modulo ? 'M' + ctx.modulo : (ctx.depto || '—');
  const tq = ctx.tq ? 'TQ ' + ctx.tq : (ctx.componente || ctx.muestras || ctx.sala || '—');
  return mod + ' · ' + tq;
}

/** Boxplot horizontal por tanque para el parámetro activo (modo "Distribución").
 *  Caja Q1–mediana–Q3, bigotes 1.5·IQR, atípicos como puntos, banda de rango detrás.
 *  SVG puro, coloreado por la severidad de la mediana de cada grupo. */
function calBoxplotSVG(groups, param, range) {
  const gs = groups.filter((g) => g.stats).sort((a, b) => b.stats.med - a.stats.med);
  if (!gs.length) return '<div class="cal-anz-norange">Sin datos suficientes para la distribución.</div>';
  const ranges = loadCalRanges();
  let lo = Infinity, hi = -Infinity;
  gs.forEach((g) => { lo = Math.min(lo, g.stats.min); hi = Math.max(hi, g.stats.max); });
  if (range) { if (range.min != null) lo = Math.min(lo, range.min); if (range.max != null) hi = Math.max(hi, range.max); }
  if (!(hi > lo)) hi = lo + 1;
  const span = hi - lo; const pad = span * 0.06 || 1; lo -= pad; hi += pad;
  const W = 560, rowH = 26, padL = 108, padR = 16, padT = 8, padB = 26, half = 6;
  const plotT = padT, plotH = gs.length * rowH;
  const H = padT + plotH + padB;
  const x = (v) => padL + ((v - lo) / (hi - lo)) * (W - padL - padR);
  // Cuadrícula de referencia: 5 líneas verticales con su valor abajo.
  const ticks = Array.from({ length: 5 }, (_, k) => lo + (hi - lo) * (k / 4));
  const grid = ticks.map((tv) => `<line x1="${x(tv).toFixed(1)}" y1="${plotT}" x2="${x(tv).toFixed(1)}" y2="${plotT + plotH}" class="cal-bx-grid"/><text x="${x(tv).toFixed(1)}" y="${H - 8}" class="cal-bx-tick" text-anchor="middle">${esc(calFmt(tv))}</text>`).join('');
  const band = range ? `<rect x="${x(range.min != null ? range.min : lo).toFixed(1)}" y="${plotT}" width="${Math.max(0, x(range.max != null ? range.max : hi) - x(range.min != null ? range.min : lo)).toFixed(1)}" height="${plotH}" class="cal-bx-band"/>` : '';
  const rows = gs.map((g, i) => {
    const s = g.stats; const cy = plotT + i * rowH + rowH / 2;
    const sv = calSeverity(param.key, s.med, ranges);
    const outl = s.outliers.map((o) => `<circle cx="${x(o).toFixed(1)}" cy="${cy}" r="2.4" class="cal-bx-out"/>`).join('');
    return `<g class="cal-sev--${sv}">
        <line x1="${x(s.whiskLo).toFixed(1)}" y1="${cy}" x2="${x(s.whiskHi).toFixed(1)}" y2="${cy}" class="cal-bx-whisk"/>
        <line x1="${x(s.whiskLo).toFixed(1)}" y1="${cy - 4}" x2="${x(s.whiskLo).toFixed(1)}" y2="${cy + 4}" class="cal-bx-cap"/>
        <line x1="${x(s.whiskHi).toFixed(1)}" y1="${cy - 4}" x2="${x(s.whiskHi).toFixed(1)}" y2="${cy + 4}" class="cal-bx-cap"/>
        <rect x="${x(s.q1).toFixed(1)}" y="${(cy - half).toFixed(1)}" width="${Math.max(1, x(s.q3) - x(s.q1)).toFixed(1)}" height="${half * 2}" rx="1.5" class="cal-bx-box"/>
        <line x1="${x(s.med).toFixed(1)}" y1="${cy - half}" x2="${x(s.med).toFixed(1)}" y2="${cy + half}" class="cal-bx-med"/>
        ${outl}
        <text x="${padL - 8}" y="${cy + 3.5}" class="cal-bx-lbl" text-anchor="end">${esc(g.label)}</text>
        <text x="${(x(s.med) + 5).toFixed(1)}" y="${cy - half - 2}" class="cal-bx-val" text-anchor="middle">${esc(calFmt(s.med))}</text>
        <title>${esc(g.label)} — n=${s.n} · mín ${esc(calFmt(s.min))} · Q1 ${esc(calFmt(s.q1))} · mediana ${esc(calFmt(s.med))} · Q3 ${esc(calFmt(s.q3))} · máx ${esc(calFmt(s.max))}</title>
      </g>`;
  }).join('');
  return `<div class="cal-anz-box"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="cal-bx-svg" role="img" aria-label="Distribución de ${esc(param.label)} por tanque">${grid}${band}${rows}</svg></div>`;
}

/** Posición (0–100%) de un valor en una escala centrada en el rango objetivo, para
 *  las barras tipo "analizador" (cartucho + gauge). Devuelve también las posiciones
 *  de los límites. `has:false` si el parámetro no tiene rango. */
function calScale(range, value) {
  if (!range) return { has: false };
  const { min, max } = range;
  let lo, hi, loMark = null, hiMark = null;
  if (min != null && max != null) { const span = (max - min) || Math.abs(max) || 1; lo = min - span; hi = max + span; loMark = min; hiMark = max; }
  else if (max != null) { lo = 0; hi = (max * 2) || 1; hiMark = max; }
  else { lo = 0; hi = (min * 2) || 1; loMark = min; }
  const clamp = (x) => Math.max(0, Math.min(100, x));
  const toPct = (v) => (hi === lo ? 0 : clamp(((v - lo) / (hi - lo)) * 100));
  return { has: true, lo, hi, pos: value == null ? null : toPct(value), loPct: loMark == null ? null : toPct(loMark), hiPct: hiMark == null ? null : toPct(hiMark) };
}

/** Apartado "Analizador" (por parámetro): una PANTALLA principal del parámetro
 *  seleccionado (lectura digital + escala del analizador + estadísticos + tendencia
 *  con banda de rango + puntos afectados) sobre un BANCO de cartuchos, uno por
 *  parámetro medido. Metáfora de analizador multiparamétrico de laboratorio. */
function calAnalizadorHTML(samples, ranges) {
  const measuredKeys = new Set();
  samples.forEach((s) => s.meas.forEach((m) => measuredKeys.add(m.key)));
  const params = CAL_PARAMS.filter((p) => measuredKeys.has(p.key));
  if (!params.length) return emptyBox('Sin parámetros medidos para el filtro actual.');
  if (!vState.calTrendKey || !params.some((p) => p.key === vState.calTrendKey)) {
    vState.calTrendKey = (params.find((p) => ranges[p.key]) || params[0]).key; // preferir uno con rango
  }
  const param = params.find((p) => p.key === vState.calTrendKey);
  const range = ranges[param.key] || null;
  const u = param.unit ? ' ' + param.unit : '';

  // Última medición + severidad de CADA parámetro (samples viene ordenado desc por fecha).
  const latest = new Map();
  samples.forEach((s) => s.meas.forEach((m) => { if (!latest.has(m.key)) latest.set(m.key, m); }));

  // Mediciones del parámetro activo: valores del pool, individuales (asc por fecha,
  // para la carta de control) y agrupadas por tanque (para el boxplot de distribución).
  const allVals = []; let inR = 0, withR = 0;
  const indiv = []; const boxMap = new Map();
  samples.forEach((s) => {
    const m = s.meas.find((x) => x.key === param.key); if (!m) return;
    allVals.push(m.value);
    if (m.severity !== 'sin-rango') { withR++; if (m.severity === 'optimo' || m.severity === 'vigilancia') inR++; }
    if (s.ctx.fecha && !isNaN(s.ctx.fecha)) indiv.push({ d: s.ctx.fecha, value: m.value, sev: m.severity });
    const gl = calTankGroupLabel(s.ctx); if (!boxMap.has(gl)) boxMap.set(gl, []); boxMap.get(gl).push(m.value);
  });
  indiv.sort((a, b) => a.d - b.d);
  const mean = allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : null;
  const mn = allVals.length ? Math.min(...allVals) : null;
  const mx = allVals.length ? Math.max(...allVals) : null;
  const lastM = latest.get(param.key);
  const pctIn = withR ? Math.round((inR / withR) * 100) : null;
  const boxGroups = [...boxMap.entries()].map(([label, vals]) => ({ label, stats: boxStats(vals), n: vals.length }));

  // Datos para el gráfico (dibujo post-render; el modo elige tendencia/control).
  const mode = vState.calChartMode;
  _calTrend = { days: calParamSeries(samples, param.key), indiv, ctrl: controlStats(allVals), param, range, color: '#00838f', mode };

  // Puntos afectados (fuera/crítico en el parámetro activo), únicos, peor primero.
  const affMap = new Map();
  samples.forEach((s) => {
    const m = s.meas.find((x) => x.key === param.key);
    if (!m || (m.severity !== 'fuera' && m.severity !== 'critico')) return;
    const label = calLocation(s.ctx); const prev = affMap.get(label);
    if (!prev || sevRank(m.severity) > sevRank(prev.severity)) affMap.set(label, { label, value: m.value, severity: m.severity });
  });
  const affected = [...affMap.values()].sort((a, b) => sevRank(b.severity) - sevRank(a.severity)).slice(0, 8);

  const sev = lastM ? lastM.severity : 'sin-rango';
  const sc = calScale(range, lastM ? lastM.value : null);
  const gaugeHTML = sc.has ? `<div class="cal-anz-gauge">
      <div class="cal-anz-track">
        <span class="cal-anz-zone" style="left:${sc.loPct != null ? sc.loPct : 0}%;right:${sc.hiPct != null ? (100 - sc.hiPct) : 0}%"></span>
        ${sc.loPct != null ? `<span class="cal-anz-lim" style="left:${sc.loPct}%"></span>` : ''}
        ${sc.hiPct != null ? `<span class="cal-anz-lim" style="left:${sc.hiPct}%"></span>` : ''}
        ${sc.pos != null ? `<span class="cal-anz-needle cal-sev--${sev}" style="left:${sc.pos}%"></span>` : ''}
      </div>
      <div class="cal-anz-scale"><span>${esc(calFmt(sc.lo))}</span><span class="cal-anz-target">🟩 rango objetivo ${esc(calRangeText(param.key, ranges))}</span><span>${esc(calFmt(sc.hi))}</span></div>
    </div>` : '<div class="cal-anz-norange">Sin rango objetivo definido · solo registro histórico</div>';

  const stat = (label, v) => `<div class="cal-anz-stat"><b>${v == null ? '—' : esc(calFmt(v)) + u}</b><span>${esc(label)}</span></div>`;
  const screen = `<div class="cal-anz-screen cal-sev--${sev}">
      <div class="cal-anz-top">
        <div class="cal-anz-id">
          <span class="cal-anz-name">${esc(param.label)}</span>
          <span class="cal-anz-sub">${range ? 'Objetivo ' + esc(calRangeText(param.key, ranges)) + esc(u) : 'Sin rango objetivo'} · ${allVals.length} medición(es)</span>
        </div>
        <div class="cal-anz-read cal-sev--${sev}">
          <span class="cal-anz-val">${lastM ? esc(calFmt(lastM.value)) : '—'}</span>
          <span class="cal-anz-unit">${esc(param.unit || '')}</span>
          <span class="cal-anz-badge cal-sev--${sev}">${esc(CAL_SEV[sev].label)}</span>
        </div>
      </div>
      ${gaugeHTML}
      <div class="cal-anz-stats">
        ${stat('último', lastM ? lastM.value : null)}${stat('promedio', mean)}${stat('mín', mn)}${stat('máx', mx)}
        <div class="cal-anz-stat"><b>${pctIn == null ? '—' : pctIn + '%'}</b><span>en rango</span></div>
      </div>
      <div class="cal-anz-modes" role="tablist" aria-label="Modo de gráfico">
        <button class="cal-anz-mode${mode === 'tendencia' ? ' is-on' : ''}" data-cal-chartmode="tendencia" aria-selected="${mode === 'tendencia'}">📈 Tendencia</button>
        <button class="cal-anz-mode${mode === 'control' ? ' is-on' : ''}" data-cal-chartmode="control" aria-selected="${mode === 'control'}">📊 Control</button>
        <button class="cal-anz-mode${mode === 'distribucion' ? ' is-on' : ''}" data-cal-chartmode="distribucion" aria-selected="${mode === 'distribucion'}">📦 Distribución</button>
      </div>
      <div class="cal-anz-chart-t">${mode === 'control'
        ? '📊 Carta de control (Shewhart) · valores individuales · LC = media, LSC/LIC = ±3σ · puntos rojos = fuera de control'
        : mode === 'distribucion'
          ? '📦 Distribución por tanque · caja = Q1–mediana–Q3 · bigotes 1.5·IQR' + (range ? ' · banda verde = rango objetivo' : '')
          : '📈 Tendencia · promedio por día' + (range ? ' · banda verde = rango objetivo' : '')}</div>
      ${mode === 'distribucion' ? calBoxplotSVG(boxGroups, param, range) : '<div class="cal-anz-chart"><canvas id="calTrendChart"></canvas></div>'}
      ${affected.length ? `<div class="cal-anz-aff">
        <div class="cal-anz-aff-t">⚠️ Puntos afectados en ${esc(param.label)}</div>
        <div class="cal-anz-aff-list">${affected.map((a) => `<span class="cal-anz-aff-chip cal-sev--${a.severity}" title="${esc(CAL_SEV[a.severity].label)}">${esc(a.label)} · <b>${esc(calFmt(a.value))}${esc(u)}</b></span>`).join('')}</div>
      </div>` : ''}
    </div>`;

  // Banco de cartuchos (uno por parámetro medido; muestra su último valor + severidad).
  const cart = (p) => {
    const m = latest.get(p.key);
    const r = ranges[p.key] || null;
    const s = calScale(r, m ? m.value : null);
    const sv = m ? m.severity : 'sin-rango';
    const on = p.key === param.key;
    const bar = (s.has && s.pos != null)
      ? `<span class="cal-cart-bar"><span class="cal-cart-fill cal-sev--${sv}" style="width:${s.pos}%"></span>${s.hiPct != null ? `<span class="cal-cart-lim" style="left:${s.hiPct}%"></span>` : ''}${s.loPct != null ? `<span class="cal-cart-lim" style="left:${s.loPct}%"></span>` : ''}</span>`
      : '<span class="cal-cart-bar cal-cart-bar--flat"></span>';
    return `<button class="cal-cart cal-sev--${sv}${on ? ' is-on' : ''}" data-cal-param="${esc(p.key)}" role="tab" aria-selected="${on}" title="${esc(p.label)}${r ? ' · objetivo ' + esc(calRangeText(p.key, ranges)) : ''}">
        <span class="cal-cart-h"><span class="cal-cart-dot cal-sev--${sv}"></span><span class="cal-cart-name">${esc(p.label)}</span></span>
        <span class="cal-cart-val">${m ? esc(calFmt(m.value)) : '—'}<i>${esc(p.unit || '')}</i></span>
        ${bar}
      </button>`;
  };
  return `<div class="cal-analyzer">
      <div class="cal-cartridges" role="tablist" aria-label="Parámetros analíticos">${params.map(cart).join('')}</div>
      ${screen}
    </div>`;
}

/** Dibuja el gráfico del Analizador según el modo activo: Tendencia (promedio por
 *  día + banda de rango) o Control (Shewhart, valores individuales + límites ±3σ).
 *  El modo Distribución no usa canvas (SVG en el HTML). Post-render. */
function drawCalTrendChart() {
  const t = _calTrend; if (!t) return;
  if (t.mode === 'control') { drawCalControlChart(t); return; }
  if (!t.days.length) return;
  const dates = t.days.map((d) => d.d);
  const labels = t.days.map((d) => d.label);
  const data = t.days.map((d) => +d.avg.toFixed(2));
  // Banda del rango objetivo: rectángulo verde entre min y max (o desde/ hasta el borde).
  const bandPlugin = {
    id: 'calBand',
    beforeDatasetsDraw(chart) {
      const r = t.range; if (!r) return;
      const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
      const pMax = r.max != null ? y.getPixelForValue(r.max) : ca.top;
      const pMin = r.min != null ? y.getPixelForValue(r.min) : ca.bottom;
      const y0 = Math.max(ca.top, Math.min(pMax, pMin));
      const y1 = Math.min(ca.bottom, Math.max(pMax, pMin));
      if (y1 <= y0) return;
      const ctx = chart.ctx; ctx.save();
      ctx.fillStyle = 'rgba(46,158,91,.13)';
      ctx.fillRect(ca.left, y0, ca.right - ca.left, y1 - y0);
      ctx.restore();
    },
  };
  makeChart('calTrendChart', {
    type: 'line',
    data: { labels, datasets: [{ label: t.param.label, data, borderColor: t.color, backgroundColor: t.color + '22', tension: 0.3, spanGaps: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, fill: false }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { grid: { color: 'rgba(128,128,128,.12)' }, border: { display: false }, ticks: { callback: (v) => calFmt(v) }, title: { display: !!t.param.unit, text: t.param.unit } },
        x: { grid: { display: false }, border: { display: false }, ticks: { callback: (v, i) => dayNum(dates[i]), autoSkip: true, maxTicksLimit: 14, maxRotation: 0, minRotation: 0 }, title: { display: !!rangeLabel(dates), text: rangeLabel(dates) } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${calFmt(c.parsed.y)}${t.param.unit ? ' ' + t.param.unit : ''}` } } },
    },
    plugins: [bandPlugin],
  });
}

/** Carta de control de Shewhart: valores individuales del parámetro en el tiempo con
 *  línea central (media) y límites de control ±3σ; puntos fuera de control en rojo. */
function drawCalControlChart(t) {
  const pts = t.indiv || []; const c = t.ctrl;
  if (!pts.length) return;
  const dates = pts.map((p) => p.d);
  const labels = dates.map((d) => fmtShort(d));
  const data = pts.map((p) => +p.value.toFixed(4));
  const isOut = pts.map((p) => !!c && (p.value > c.ucl || p.value < c.lcl));
  const ptColor = isOut.map((o) => (o ? '#e8303e' : t.color));
  // Líneas de control (LC/LSC/LIC) dibujadas sobre el área del gráfico.
  const limitsPlugin = {
    id: 'calCtrlLimits',
    afterDatasetsDraw(chart) {
      if (!c) return;
      const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
      const ctx = chart.ctx; ctx.save();
      const line = (val, color, dash, label) => {
        const py = y.getPixelForValue(val);
        if (py < ca.top || py > ca.bottom) return;
        ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(ca.left, py); ctx.lineTo(ca.right, py); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(label, ca.right - 2, py - 3);
      };
      line(c.ucl, '#e8730c', [5, 4], 'LSC ' + calFmt(c.ucl));
      line(c.mean, '#00838f', [], 'LC ' + calFmt(c.mean));
      line(c.lcl, '#e8730c', [5, 4], 'LIC ' + calFmt(c.lcl));
      ctx.restore();
    },
  };
  makeChart('calTrendChart', {
    type: 'line',
    data: { labels, datasets: [{ label: t.param.label, data, borderColor: t.color, backgroundColor: t.color + '18', tension: 0, spanGaps: true, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: ptColor, pointBorderColor: ptColor, borderWidth: 2, fill: false }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { grid: { color: 'rgba(128,128,128,.12)' }, border: { display: false }, ticks: { callback: (v) => calFmt(v) }, title: { display: !!t.param.unit, text: t.param.unit } },
        x: { grid: { display: false }, border: { display: false }, ticks: { callback: (v, i) => dayNum(dates[i]), autoSkip: true, maxTicksLimit: 14, maxRotation: 0, minRotation: 0 }, title: { display: !!rangeLabel(dates), text: rangeLabel(dates) } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ci) => ` ${calFmt(ci.parsed.y)}${t.param.unit ? ' ' + t.param.unit : ''}${isOut[ci.dataIndex] ? ' · ⚠ fuera de control' : ''}` } } },
    },
    plugins: [limitsPlugin],
  });
}

/** Apartado Ensayo antes/después: gráfico de dumbbell (normalizado a % del "antes")
 *  + tabla con promedios antes/después, Δ y Δ%. */
function calEnsayoHTML(ensayo) {
  _calEnsayo = ensayo;
  const cell = (v, u) => v == null ? '—' : esc(calFmt(v)) + (u ? ' ' + esc(u) : '');
  const rowsH = ensayo.map((p) => {
    const cls = p.pct == null ? '' : p.pct > 0 ? 'cal-en-up' : p.pct < 0 ? 'cal-en-dn' : '';
    const dTxt = p.delta == null ? '—' : (p.delta >= 0 ? '+' : '') + calFmt(p.delta) + (p.unit ? ' ' + p.unit : '');
    const pTxt = p.pct == null ? '—' : (p.pct >= 0 ? '+' : '') + p.pct.toFixed(1) + '%';
    return `<tr>
        <th class="cal-en-rowh">${esc(p.label)}${p.unit ? ` <span class="muted">(${esc(p.unit)})</span>` : ''}</th>
        <td>${cell(p.antes)}</td><td>${cell(p.desp)}</td>
        <td class="${cls}">${dTxt}</td><td class="${cls}">${pTxt}</td>
        <td class="muted">${p.n}</td>
      </tr>`;
  }).join('');
  return `<div class="card cal-en-card">
      <div class="mic-chart-title">⚗️ Ensayo antes/después <span class="muted">· acondicionamiento iónico · promedio de las muestras filtradas · barra = % respecto al "antes"</span></div>
      <div class="cal-en-chart"><canvas id="calEnsayoChart"></canvas></div>
      <div class="cal-en-wrap"><table class="cal-en-table">
        <thead><tr><th class="cal-en-rowh">Parámetro</th><th>Antes</th><th>Después</th><th>Δ</th><th>Δ%</th><th>n</th></tr></thead>
        <tbody>${rowsH}</tbody></table></div>
    </div>`;
}

/** Dibuja el dumbbell del Ensayo: por parámetro, "antes" en 100% y "después" en el %
 *  relativo, unidos por una línea (misma escala para iones de magnitudes distintas). */
function drawCalEnsayoChart() {
  const pairs = (_calEnsayo || []).filter((p) => p.antes != null && p.desp != null && p.antes !== 0);
  if (!pairs.length) return;
  const labels = pairs.map((p) => p.label);
  const linePlugin = {
    id: 'calDumbbell',
    beforeDatasetsDraw(chart) {
      const x = chart.scales.x, y = chart.scales.y; if (!x || !y) return;
      const ctx = chart.ctx; ctx.save();
      ctx.strokeStyle = 'rgba(120,144,156,.55)'; ctx.lineWidth = 2;
      pairs.forEach((p, i) => {
        const yp = y.getPixelForValue(i);
        ctx.beginPath(); ctx.moveTo(x.getPixelForValue(100), yp); ctx.lineTo(x.getPixelForValue(100 + p.pct), yp); ctx.stroke();
      });
      ctx.restore();
    },
  };
  makeChart('calEnsayoChart', {
    type: 'scatter',
    data: { datasets: [
      { label: 'Antes', data: pairs.map((p, i) => ({ x: 100, y: i })), backgroundColor: '#90A4AE', pointRadius: 6, pointHoverRadius: 7 },
      { label: 'Después', data: pairs.map((p, i) => ({ x: 100 + p.pct, y: i })), backgroundColor: '#00838f', pointRadius: 6, pointHoverRadius: 7 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: '% respecto al "antes" (base 100%)' }, ticks: { callback: (v) => v + '%' } },
        y: { type: 'linear', min: -0.6, max: pairs.length - 0.4, offset: true, ticks: { stepSize: 1, callback: (v) => labels[v] || '' }, grid: { display: false } },
      },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 10 } },
        tooltip: { callbacks: { label: (c) => { const p = pairs[Math.round(c.parsed.y)]; if (!p) return ''; const which = c.datasetIndex === 0 ? 'Antes' : 'Después'; const val = c.datasetIndex === 0 ? p.antes : p.desp; return ` ${which}: ${calFmt(val)}${p.unit ? ' ' + p.unit : ''}`; } } },
      },
    },
    plugins: [linePlugin],
  });
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

  // ── Filtros en CASCADA PROGRESIVA ──
  // Cada filtro solo ofrece los valores DISPONIBLES dado lo ya elegido en los filtros
  // anteriores (depto → formato → corrida → módulo → ubicación → estadío → tipo). Así,
  // si en el módulo 3 solo hay tanques 1/3/4, el filtro de tanque no ofrece los demás.
  const _ctxCache = new Map();
  const ctxOf = (r) => { if (!_ctxCache.has(r)) _ctxCache.set(r, rowContext(r)); return _ctxCache.get(r); };
  let pool = monthRows;

  // Departamento DERIVADO del formato (no de la columna cruda) → 3 grupos exactos.
  const presentDeptos = new Set(pool.map((r) => deptoOfFormato(ctxOf(r).formatoKey)).filter(Boolean));
  const optDepto = DEPARTAMENTOS.filter((d) => presentDeptos.has(d));
  if (vState.depto && !optDepto.includes(vState.depto)) vState.depto = null;
  if (!vState.depto) vState.formato = null; // sin departamento → sin sub-filtro de formato
  if (vState.depto) pool = pool.filter((r) => deptoOfFormato(ctxOf(r).formatoKey) === vState.depto);

  // Formato (sub-filtro del departamento; solo los que tengan datos en el pool actual).
  const optFormato = vState.depto ? DEPTO_FORMATS[vState.depto].filter((k) => pool.some((r) => ctxOf(r).formatoKey === k)) : [];
  if (vState.formato && !optFormato.includes(vState.formato)) vState.formato = null;
  if (vState.formato) pool = pool.filter((r) => ctxOf(r).formatoKey === vState.formato);

  // Dimensiones de contexto DINÁMICAS (en cascada): cada una se muestra solo si tiene
  // ≥2 valores distintos en el pool actual → la barra se adapta al formato elegido.
  const dimFilters = [];
  FILTER_DIMS.forEach((dim) => {
    const vals = [...new Set(pool.map((r) => dim.pick(ctxOf(r))).filter((v) => v !== '' && v != null))].sort(dim.cmp || natCmp);
    if (vState.dims[dim.key] && !vals.includes(vState.dims[dim.key])) vState.dims[dim.key] = null;
    if (vals.length < 2) { vState.dims[dim.key] = null; return; } // nada que elegir → no se muestra
    dimFilters.push({ dim, options: vals });
    if (vState.dims[dim.key]) pool = pool.filter((r) => dim.pick(ctxOf(r)) === vState.dims[dim.key]);
  });

  const rows = pool;
  _scope.rows = rows;
  _scope.records = pathogenRecords(rows);
  _scope.theme = vState.petriTheme; // la placa usa su propio tema (oscuro por defecto)

  // ── Derivados para KPIs ──
  const summaries = rows.map(rowSummary);
  const kAlerta = summaries.filter((s) => isAlerta(s.worst)).length;
  const kLumin = summaries.filter((s) => s.lumin === true).length;
  const kTotUfc = summaries.reduce((a, s) => a + (s.totalesUfc || 0), 0);
  const dom = dominantPathogen(rows, _scope.records);

  // ── HTML: filtros + KPIs + apartados ──
  let h = `<div class="mic-filters">
      <div class="mic-monthbar">
        <button class="mic-month-nav" data-mic-month="-1" ${months.indexOf(vState.month) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
        <span class="mic-month-lbl">📅 ${esc(monthLabelAt(vState.month))}</span>
        <button class="mic-month-nav" data-mic-month="1" ${months.indexOf(vState.month) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
      </div>
      ${optDepto.length ? micSelect('depto', vState.depto, optDepto, 'Todos los deptos.') : ''}
      ${vState.depto && optFormato.length ? micSelect('formato', vState.formato, optFormato, 'Todos los formatos', (v) => FORMATO_LABEL[v] || v) : ''}
      ${dimFilters.map(({ dim, options }) => micDimSelect(dim, vState.dims[dim.key], options)).join('')}
    </div>`;

  h += `<div class="mic-kpis">
      ${kpi('🧪', 'Muestras', String(rows.length))}
      ${kpi('⚠️', 'Mod./Elevado', `${kAlerta}`, kAlerta > 0, rows.length ? (kAlerta / rows.length * 100).toFixed(0) + '% de muestras' : '', 'data-mic-alerts role="button" tabindex="0" title="Ver listado de alertas (por fecha)"')}
      ${kpi('✨', 'V. Luminiscentes', kLumin > 0 ? `${kLumin}` : '0', kLumin > 0, kLumin > 0 ? 'con presencia' : 'sin presencia')}
      ${kpi('🦠', 'Patógeno dominante', dom ? dom.label : '—', false, dom ? `${dom.alertas} alerta(s)` : '')}
      ${kpi('🧫', 'Σ UFC C. Totales', fmtNum(kTotUfc))}
    </div>`;

  h += `<div class="mic-apartados">
      <button class="mic-ap ${vState.apartado === 'conglomerado' ? 'is-active' : ''}" data-mic-ap="conglomerado">📊 Conglomerado</button>
      <button class="mic-ap ${vState.apartado === 'petri' ? 'is-active' : ''}" data-mic-ap="petri">🧫 Placa Petri</button>
    </div>`;

  h += vState.apartado === 'petri' ? renderPetri(rows) : renderConglomerado(rows, summaries);
  return h;
}

/* ---- Apartado A · Conglomerado (Tanda 1) ---- */
function renderConglomerado(rows, summaries) {
  const records = _scope.records; // pathogenRecords(rows) ya computado en el render
  const cong = congByNivel(rows, records);
  _charts.stack = cong.labels.length ? cong : null;
  const aa = aguaAnimalAlertas(rows, records);
  _charts.aa = aa.labels.length ? aa : null;
  const ufc = ufcByPathogen(rows, records);
  _charts.ufc = ufc.labels.length ? ufc : null;
  const dist = nivelDistribution(rows, records);
  _charts.dist = dist.total > 0 ? dist : null;

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

  // ── Análisis general (2 gráficos transversales sobre los patógenos registrados) ──
  h += band('📈', 'Análisis general de patógenos', '#56334B');
  h += `<div class="mic-charts">
      <div class="card mic-chart-card">
        <div class="mic-chart-title">🧫 Carga total por patógeno <span class="muted">· Σ UFC del filtro (excl. agregados)</span></div>
        <div class="mic-chart-host" style="height:${Math.max(240, (_charts.ufc ? _charts.ufc.labels.length : 1) * 28 + 70)}px">
          ${_charts.ufc ? '<canvas id="micUfc"></canvas>' : emptyBox('Sin UFC registrado para el filtro actual.')}
        </div>
      </div>
      <div class="card mic-chart-card">
        <div class="mic-chart-title">🚦 Distribución por nivel <span class="muted">· % de registros por grado de carga</span></div>
        <div class="mic-chart-host" style="height:280px">
          ${_charts.dist ? '<canvas id="micDist"></canvas>' : emptyBox('Sin niveles registrados para el filtro actual.')}
        </div>
      </div>
    </div>`;

  h += band('📋', 'Muestras', '#00838F');
  h += tableHTML(rows, summaries);
  return h;
}

/** Σ UFC por patógeno específico (excluye agregados C./Bact. Totales que dominarían).
 *  `records` = pathogenRecords(rows) precomputado (se reutiliza en el render). */
function ufcByPathogen(rows, records = pathogenRecords(rows)) {
  const m = new Map();
  records.forEach((r) => {
    if (AGGREGATE_KEYS.has(r.key) || !(r.ufc > 0)) return;
    m.set(r.key, (m.get(r.key) || 0) + r.ufc);
  });
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { keys: arr.map(([k]) => k), labels: arr.map(([k]) => PAT_LABEL[k] || k), values: arr.map(([, v]) => v) };
}

/** Distribución global de registros-patógeno por nivel (semáforo). */
function nivelDistribution(rows, records = pathogenRecords(rows)) {
  const counts = { 'Mínimo': 0, 'Leve': 0, 'Moderado': 0, 'Elevado': 0 };
  let total = 0;
  records.forEach((r) => { if (r.nivel && counts[r.nivel] !== undefined) { counts[r.nivel]++; total++; } });
  return { counts, total };
}

/* ---- Apartado B · Placa Petri (Tanda 2) ---- */
function renderPetri(rows) {
  const days = daysOf(rows);
  if (vState.petriDay == null || !days.some((d) => d.key === vState.petriDay)) vState.petriDay = days.length ? days[days.length - 1].key : null;
  const dayIdx = days.findIndex((d) => d.key === vState.petriDay);
  const day = dayIdx >= 0 ? days[dayIdx] : null;

  if (!['placa', 'matriz', 'tendencias'].includes(vState.petriTab)) vState.petriTab = 'placa';
  const tabBtn = (key, label) => `<button class="mic-petab ${vState.petriTab === key ? 'is-active' : ''}" data-mic-petab="${key}">${label}</button>`;
  let h = `<div class="mic-petri-bar">
      <div class="mic-petabs">${tabBtn('placa', 'Placa')}${tabBtn('matriz', 'Matriz')}${tabBtn('tendencias', 'Tendencias')}</div>
      <div class="mic-export"><button class="mic-exp" data-mic-export="txt">⬇ Reporte</button><button class="mic-exp" data-mic-xlsx title="Exportar Excel por rango de fechas (columnas con datos)">⬇ Excel</button></div>
    </div>`;

  if (vState.petriTab === 'matriz') h += petriMatrizHTML(rows);
  else if (vState.petriTab === 'tendencias') h += petriTendenciasHTML(rows);
  else h += petriPlacaHTML(days, dayIdx, day);
  return h;
}

/* ---- Apartado B · Matriz Patógeno × Ubicación (heatmap semaforizado) ---- */
function petriMatrizHTML(rows) {
  const recs = pathogenRecords(rows);
  if (!recs.length) return `<div class="empty-state" style="padding:36px">Sin registros para el filtro actual.</div>`;
  const colOf = (r) => r.ubicacion || '—';
  const ubics = [...new Set(recs.map(colOf))].sort(natCmp);
  const presentKeys = new Set(recs.map((r) => r.key));
  const pats = PATHOGENS.filter((p) => presentKeys.has(p.key));
  // Agrega por (patógeno × ubicación): peor nivel + Σ UFC + nº muestras.
  const cell = new Map();
  recs.forEach((r) => {
    const k = r.key + '|' + colOf(r);
    if (!cell.has(k)) cell.set(k, { ufc: 0, n: 0, worstRank: -1, worst: '' });
    const o = cell.get(k);
    if (r.ufc) o.ufc += r.ufc;
    o.n++;
    const rk = NIVEL_RANK[r.nivel] ?? -1;
    if (rk > o.worstRank) { o.worstRank = rk; o.worst = r.nivel; }
  });
  const head = `<tr><th class="mic-mx-rowh">Patógeno \\ Ubicación</th>${ubics.map((u) => `<th>${esc(u)}</th>`).join('')}</tr>`;
  const body = pats.map((p) => {
    const tds = ubics.map((u) => {
      const o = cell.get(p.key + '|' + u);
      if (!o) return `<td class="mic-mx-empty" title="${esc(p.label)} · ${esc(u)}: sin dato">·</td>`;
      const col = o.worst ? NIVEL_COLOR[o.worst] : '';
      const style = col ? ` style="background:${col};color:#fff"` : '';
      return `<td class="mic-mx-cell"${style} title="${esc(p.label)} · ${esc(u)} — ${esc(o.worst || 'sin nivel')} · ${fmtNum(o.ufc)} UFC · ${o.n} muestra(s)">${fmtNum(o.ufc)}</td>`;
    }).join('');
    return `<tr><th class="mic-mx-rowh"><span class="mic-pe-dot" style="background:${PATHOGEN_COLOR[p.key] || '#90A4AE'}"></span>${esc(p.label)}</th>${tds}</tr>`;
  }).join('');
  return `<div class="card mic-mx-card">
      <div class="mic-chart-title">🗺️ Matriz Patógeno × Ubicación <span class="muted">· color = nivel (semáforo) · valor = Σ UFC · período filtrado</span></div>
      <div class="mic-mx-wrap"><table class="mic-mx-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      ${nivelLegend()}
    </div>`;
}

function petriPlacaHTML(days, dayIdx, day) {
  const colonies = day ? coloniesForDay(day.rows) : [];
  _scope.colonies = colonies;
  const size = 340;
  const totUfc = colonies.filter((c) => c.key === 'totales').reduce((a, c) => a + c.ufc, 0) || colonies.reduce((a, c) => a + c.ufc, 0);
  // "UFC máx" y "Dominante" sobre patógenos ESPECÍFICOS (los agregados ganarían siempre).
  const specific = colonies.filter((c) => !AGGREGATE_KEYS.has(c.key));
  const maxC = specific.length ? specific.reduce((a, b) => (a.ufc > b.ufc ? a : b)) : null;
  const nav = `<div class="mic-day-nav">
      <button class="mic-month-nav" data-mic-day="-1" ${dayIdx <= 0 ? 'disabled' : ''} aria-label="Día anterior">◀</button>
      <span class="mic-day-lbl">${day ? esc(day.label) : '—'}</span>
      <button class="mic-month-nav" data-mic-day="1" ${dayIdx < 0 || dayIdx >= days.length - 1 ? 'disabled' : ''} aria-label="Día siguiente">▶</button>
    </div>`;

  const legend = colonies.length
    ? `<div class="mic-pe-legend">${colonies.map((c) => `<div class="mic-pe-leg"><span class="mic-pe-dot" style="background:${c.color}"></span><span class="mic-pe-leg-l">${esc(c.label)}</span><span class="mic-pe-leg-v">${fmtNum(c.ufc)}</span></div>`).join('')}</div>`
    : '<div class="muted" style="font-size:12px">Sin colonias para este día.</div>';

  // Agar(es) utilizado(s): inferido de los patógenos observados ese día (cada patógeno
  // crece en un agar específico). Entero./Bacterias Rojas no tienen agar definido aún.
  const agares = [...new Set(colonies.map((c) => PATHOGEN_AGAR[c.key]).filter(Boolean))].sort();
  const agarHTML = `<div class="mic-pe-agar">
      <div class="mic-pe-agar-l">🧪 Agar utilizado</div>
      <div class="mic-pe-agar-chips">${agares.length ? agares.map((a) => `<span class="mic-agar-chip">${esc(a)}</span>`).join('') : '<span class="muted" style="font-size:12px">—</span>'}</div>
    </div>`;

  return `<div class="mic-petri-main">
      <div class="card mic-petri-card">
        <div class="mic-chart-title">🧫 Placa de agar <span class="muted">· colonia = patógeno · tamaño ∝ log₁₀(UFC)</span></div>
        ${nav}
        <div class="mic-petri-dish" style="position:relative">${petriSVG(colonies, size, _scope.theme)}<button class="mic-petheme-fab" data-mic-petheme title="Tema de la placa (claro/oscuro)" aria-label="Cambiar tema de la placa">${vState.petriTheme === 'dark' ? '☀️' : '🌙'}</button></div>
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
        ${agarHTML}
        <div class="mic-chart-title" style="margin-top:12px">Patógenos</div>
        ${legend}
      </div>
    </div>`;
}

/** Cinética de crecimiento por regresión log-lineal de ΣUFC vs día:
 *  ln(UFC) = a + μ·día → μ = tasa específica (día⁻¹), t½ = ln2/μ (si μ>0), R² = ajuste.
 *  `pts` = [{x: día relativo, y: ΣUFC>0}]. Devuelve nulls si <2 puntos. */
function kinetics(pts) {
  const n = pts.length;
  if (n < 2) return { mu: null, doubling: null, r2: null, a: null, n };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => Math.log(p.y));
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  if (sxx === 0) return { mu: null, doubling: null, r2: null, a: null, n };
  const mu = sxy / sxx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
  return { mu, doubling: mu > 0 ? Math.log(2) / mu : null, r2, a: my - mu * mx, n };
}

/** Matriz de tendencias: por patógeno, ΣUFC y peor nivel POR DÍA (para el heatmap) +
 *  cinética de crecimiento. Días asc; hasta 12 patógenos por valor reciente. */
function petriTrendMatrix(rows) {
  const days = daysOf(rows);
  const per = new Map();
  days.forEach((day, i) => {
    pathogenRecords(day.rows).forEach((r) => {
      if (!per.has(r.key)) per.set(r.key, {
        key: r.key, label: r.label, color: PATHOGEN_COLOR[r.key] || '#90A4AE',
        ufc: new Array(days.length).fill(0), has: new Array(days.length).fill(false),
        rank: new Array(days.length).fill(-1), nivel: new Array(days.length).fill(''),
      });
      const o = per.get(r.key);
      if (r.ufc > 0) { o.ufc[i] += r.ufc; o.has[i] = true; }
      const rk = NIVEL_RANK[r.nivel] ?? -1;
      if (rk >= 0) { o.has[i] = true; if (rk > o.rank[i]) { o.rank[i] = rk; o.nivel[i] = r.nivel; } }
    });
  });
  const t0 = days.length ? days[0].d.getTime() : 0;
  const gap = days.map((d) => (d.d.getTime() - t0) / 86400000);
  const pathogens = [...per.values()].map((p) => {
    const presentIdx = p.ufc.map((_, i) => i).filter((i) => p.has[i]);
    const ufcPts = [];
    p.ufc.forEach((v, i) => { if (p.has[i] && v > 0) ufcPts.push({ x: gap[i], y: v }); });
    const latIdx = presentIdx.length ? presentIdx[presentIdx.length - 1] : -1;
    const prvIdx = presentIdx.length > 1 ? presentIdx[presentIdx.length - 2] : -1;
    const latest = latIdx >= 0 ? p.ufc[latIdx] : 0;
    const prev = prvIdx >= 0 ? p.ufc[prvIdx] : 0;
    const alertDays = p.rank.filter((r) => r >= NIVEL_RANK['Moderado']).length; // días Moderado/Elevado
    return { ...p, latest, delta: latest - prev, max: ufcPts.length ? Math.max(...ufcPts.map((q) => q.y)) : 0, nUfc: ufcPts.length, alertDays, kin: kinetics(ufcPts) };
  }).sort((a, b) => b.latest - a.latest).slice(0, 12);
  return { days, gap, pathogens };
}

/** Pestaña Tendencias (Placa Petri): RANKING de patógenos en barras ordenables
 *  (μ crecimiento / Σ UFC / alertas) como estructura principal + DETALLE del patógeno
 *  elegido con su cinética (μ / t. duplicación / R²) y el gráfico de tendencia. */
function petriTendenciasHTML(rows) {
  const t = petriTrendMatrix(rows);
  if (t.days.length < 2) return `<div class="empty-state" style="padding:36px">Se necesitan al menos 2 días con registro para ver tendencias.<br><span class="muted">Filtro actual: ${t.days.length} día(s).</span></div>`;
  if (!t.pathogens.length) return `<div class="empty-state" style="padding:36px">Sin UFC/nivel registrado para el filtro actual.</div>`;
  if (!vState.petriTrendKey || !t.pathogens.some((p) => p.key === vState.petriTrendKey)) vState.petriTrendKey = t.pathogens[0].key;
  _scope.trend = t; // para el dibujo del gráfico (post-render)
  const active = t.pathogens.find((p) => p.key === vState.petriTrendKey) || t.pathogens[0];
  const arrow = (d) => d > 0 ? '<span style="color:#E53935">↑</span>' : d < 0 ? '<span style="color:#1ec86a">↓</span>' : '<span class="muted">→</span>';

  // Ranking: filas = patógenos (clic/Enter selecciona). Ordena por la métrica elegida;
  // barra ∝ métrica (normalizada al máximo). Distinto del heatmap de la Matriz.
  const sort = ['mu', 'ufc', 'alertas'].includes(vState.petriTrendSort) ? vState.petriTrendSort : 'mu';
  const metric = (p) => sort === 'ufc' ? p.latest : sort === 'alertas' ? p.alertDays : (p.kin.mu == null ? -Infinity : p.kin.mu);
  const ranked = [...t.pathogens].sort((a, b) => metric(b) - metric(a));
  const maxM = Math.max(1, ...ranked.map((p) => { const m = metric(p); return m === -Infinity ? 0 : Math.max(0, m); }));
  const valOf = (p) => sort === 'ufc' ? fmtNum(p.latest)
    : sort === 'alertas' ? `${p.alertDays} alerta${p.alertDays !== 1 ? 's' : ''}`
    : (p.kin.mu == null ? '—' : (p.kin.mu >= 0 ? '+' : '') + p.kin.mu.toFixed(2) + '/d');
  const sortBtn = (key, label) => `<button class="mic-tr-sortb${sort === key ? ' is-on' : ''}" data-mic-trendsort="${key}">${label}</button>`;
  const bars = ranked.map((p) => {
    const on = p.key === vState.petriTrendKey;
    const m = metric(p);
    const w = (m === -Infinity || m <= 0) ? 3 : Math.max(4, (m / maxM) * 100);
    return `<div class="mic-tr-bar-row${on ? ' is-sel' : ''}" data-mic-trendsel="${esc(p.key)}" role="button" tabindex="0" aria-pressed="${on}" title="${esc(p.label)}">
        <span class="mic-tr-bar-name"><span class="mic-pe-dot" style="background:${p.color}"></span>${esc(p.label)}</span>
        <span class="mic-tr-bar-track"><span class="mic-tr-bar-fill" style="width:${w.toFixed(1)}%;background:${p.color}"></span></span>
        <span class="mic-tr-bar-val">${valOf(p)} ${arrow(p.delta)}</span>
      </div>`;
  }).join('');
  const rankHtml = `<div class="card mic-tr-rank">
      <div class="mic-chart-title">📊 Ranking de crecimiento por patógeno <span class="muted">· Σ UFC por día (${esc(fmtShort(t.days[0].d))} → ${esc(fmtShort(t.days[t.days.length - 1].d))}) · elige uno para su cinética</span></div>
      <div class="mic-tr-sort"><span class="mic-tr-sort-l">Ordenar por:</span>${sortBtn('mu', 'μ crecim.')}${sortBtn('ufc', 'Σ UFC')}${sortBtn('alertas', 'alertas')}</div>
      <div class="mic-tr-list">${bars}</div>
    </div>`;

  // Detalle: cinética de crecimiento + gráfico de tendencia del patógeno activo.
  const k = active.kin;
  const muTxt = k.mu == null ? '—' : (k.mu >= 0 ? '+' : '') + k.mu.toFixed(2) + '/d';
  const dobTxt = k.doubling == null ? '—' : k.doubling.toFixed(1) + ' d';
  const r2Txt = k.r2 == null ? '—' : k.r2.toFixed(2);
  const detail = `<div class="card mic-th-detail">
      <div class="mic-th-dhead"><span class="mic-pe-dot" style="background:${active.color}"></span><span class="mic-th-dname">${esc(active.label)}</span></div>
      <div class="mic-th-kpis">
        <span class="mic-th-kpi" title="Tasa específica de crecimiento μ (pendiente de la regresión log-lineal de ΣUFC)"><b>${muTxt}</b>μ crecimiento</span>
        <span class="mic-th-kpi" title="Tiempo de duplicación = ln2/μ (solo si μ>0)"><b>${dobTxt}</b>t. duplicación</span>
        <span class="mic-th-kpi" title="Bondad de ajuste del modelo exponencial (0–1)"><b>${r2Txt}</b>R²</span>
        <span class="mic-th-kpi"><b>${fmtNum(active.latest)}</b>Σ UFC último día</span>
        <span class="mic-th-kpi"><b>${fmtNum(active.max)}</b>máx</span>
      </div>
      <div class="mic-th-chart"><canvas id="micTrendChart"></canvas></div>
      <div class="mic-th-note muted">μ = pendiente de ln(ΣUFC) vs día · curva punteada = ajuste exponencial (${active.nUfc} día(s) con UFC).</div>
    </div>`;
  return rankHtml + detail;
}

/** Dibuja el gráfico de tendencia del patógeno activo (línea Σ UFC + curva de ajuste
 *  exponencial de la cinética). Post-render; ver microbiologiaView. */
function drawPetriTrendChart() {
  const t = _scope.trend; if (!t) return;
  const p = t.pathogens.find((x) => x.key === vState.petriTrendKey); if (!p) return;
  const dates = t.days.map((d) => d.d);
  const labels = t.days.map((d) => d.label); // completo → título del tooltip
  const data = p.ufc.map((v, i) => (p.has[i] ? v : null));
  const datasets = [{ label: 'Σ UFC', data, borderColor: p.color, backgroundColor: p.color + '22', tension: 0.3, spanGaps: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, fill: true }];
  if (p.kin.mu != null && p.kin.a != null) {
    const fit = t.gap.map((g) => Math.exp(p.kin.a + p.kin.mu * g));
    datasets.push({ label: 'Ajuste exponencial', data: fit, borderColor: p.color, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, tension: 0, fill: false });
  }
  makeChart('micTrendChart', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => fmtNum(v) }, title: { display: true, text: 'Σ UFC / día' } },
        // Eje X compacto: número de día + mes/año UNA vez en el título (ej. "enero 2026").
        x: { grid: { display: false }, ticks: { callback: (v, i) => dayNum(dates[i]), autoSkip: true, maxTicksLimit: 14, maxRotation: 0, minRotation: 0 }, title: { display: !!rangeLabel(dates), text: rangeLabel(dates) } },
      },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 14, font: { size: 10 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y == null ? '—' : fmtNum(Math.round(c.parsed.y))}` } },
      },
    },
  });
}

/** Cuerpo del modal de Alertas (clic en el KPI "Mod./Elevado"), ORDENADO POR FECHA
 *  (más reciente primero). Incluye Moderado/Elevado por patógeno + V. Luminiscentes. */
function alertModalBodyHTML(rows) {
  const list = alertList(rows).slice().sort((a, b) => (b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  if (!list.length) return `<div class="empty-state" style="padding:36px">✓ Sin alertas (Moderado/Elevado ni V.Luminiscentes) para el filtro actual.</div>`;
  const strip = (a) => {
    if (a.kind === 'lumin') {
      return `<div class="mic-alert" style="--ac:#7E57C2">
        <div class="mic-alert-h">✨ V. Luminiscentes · PRESENCIA</div>
        <div class="mic-alert-s">${a.ctx.fecha ? esc(fmtShort(a.ctx.fecha)) : '—'} · ${esc(a.ctx.tipoMuestra || '—')} · C${esc(a.ctx.corrida || '—')} · M${esc(a.ctx.modulo || '—')} ${a.ctx.ubicacion ? '· ' + esc(a.ctx.ubicacion) : ''}</div>
      </div>`;
    }
    return `<div class="mic-alert" style="--ac:${NIVEL_COLOR[a.nivel]}">
      <div class="mic-alert-h">${esc(a.nivel).toUpperCase()} · ${esc(a.label)}</div>
      <div class="mic-alert-s">${a.ctx.fecha ? esc(fmtShort(a.ctx.fecha)) : '—'} · ${fmtNum(a.ufc)} UFC · ${esc(a.ctx.tipoMuestra || '—')} · C${esc(a.ctx.corrida || '—')} · M${esc(a.ctx.modulo || '—')} ${a.ctx.ubicacion ? '· ' + esc(a.ctx.ubicacion) : ''}</div>
    </div>`;
  };
  return `<div class="mic-alert-count">${list.length} alerta(s) · ordenadas por fecha</div><div class="mic-alert-list">${list.map(strip).join('')}</div>`;
}

/** Cáscara del modal de alertas (se monta una vez por render de la vista). */
function alertModalHTML() {
  return `<div class="mic-modal" id="micAlertModal" data-mic-alert-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title">⚠️ Alertas · Moderado / Elevado</span>
          <button class="mic-modal-x" data-mic-alert-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body" id="micAlertBody"></div>
      </div>
    </div>`;
}
function openAlertModal(root) {
  const body = root.querySelector('#micAlertBody');
  if (body) body.innerHTML = alertModalBodyHTML(_scope.rows);
  const m = root.querySelector('#micAlertModal');
  if (m) { m.classList.add('is-open'); document.body.classList.add('modal-open'); }
}
function closeAlertModal(root) {
  const m = root.querySelector('#micAlertModal');
  if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

/* ============================================================
   Cálculos
   ============================================================ */
function rowSummary(row) {
  const c = rowContext(row);
  const melt = meltRow(row);
  let worst = '', worstRank = -1, totalesUfc = null;
  const alerts = [];
  const byKey = {}; // patógeno → { ufc, nivel, crudo } de esta muestra (para las columnas)
  melt.forEach((m) => {
    byKey[m.key] = m;
    if (m.key === 'totales') totalesUfc = m.ufc;
    if (m.nivel) {
      const rk = NIVEL_RANK[m.nivel];
      if (rk > worstRank) { worstRank = rk; worst = m.nivel; }
      if (isAlerta(m.nivel)) alerts.push({ label: m.label, nivel: m.nivel });
    }
  });
  alerts.sort((a, b) => NIVEL_RANK[b.nivel] - NIVEL_RANK[a.nivel]);
  return { row, ctx: c, worst, totalesUfc, alerts, lumin: c.lumin, byKey };
}

function dominantPathogen(rows, records = pathogenRecords(rows)) {
  const m = new Map();
  records.forEach((r) => {
    if (AGGREGATE_KEYS.has(r.key)) return; // los agregados (C./Bact. Totales) no son "dominante"
    if (!m.has(r.key)) m.set(r.key, { key: r.key, label: r.label, alertas: 0, ufc: 0 });
    const o = m.get(r.key);
    if (isAlerta(r.nivel)) o.alertas++;
    if (r.ufc) o.ufc += r.ufc;
  });
  const arr = [...m.values()].filter((o) => o.alertas > 0).sort((a, b) => (b.alertas - a.alertas) || (b.ufc - a.ufc));
  return arr[0] || null;
}

function congByNivel(rows, records = pathogenRecords(rows)) {
  const recs = records.filter((r) => r.nivel);
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

function aguaAnimalAlertas(rows, records = pathogenRecords(rows)) {
  const byKey = new Map();
  records.filter((r) => isAlerta(r.nivel)).forEach((r) => {
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
  // Carga total por patógeno (Σ UFC) — barras horizontales coloreadas por patógeno.
  if (_charts.ufc) draw(() => makeChart('micUfc', {
    type: 'bar',
    data: { labels: _charts.ufc.labels, datasets: [{ data: _charts.ufc.values, backgroundColor: _charts.ufc.keys.map((k) => (PATHOGEN_COLOR[k] || '#90A4AE') + 'cc'), borderColor: _charts.ufc.keys.map((k) => PATHOGEN_COLOR[k] || '#90A4AE'), borderWidth: 1, borderRadius: 3 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, ticks: { callback: (v) => fmtNum(v) }, grid: { color: 'rgba(120,140,150,.12)' } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + fmtNum(c.parsed.x) + ' UFC' } } },
    },
  }));
  // Distribución global por nivel (semáforo) — dona.
  if (_charts.dist) draw(() => makeChart('micDist', {
    type: 'doughnut',
    data: { labels: NIVELES, datasets: [{ data: NIVELES.map((n) => _charts.dist.counts[n]), backgroundColor: NIVELES.map((n) => NIVEL_COLOR[n]), borderColor: '#fff', borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtNum(c.parsed)} (${_charts.dist.total ? Math.round(c.parsed / _charts.dist.total * 100) : 0}%)` } } },
    },
  }));
}

/* ---- tabla · una columna de UFC por patógeno presente (semaforizada) ---- */
function tableHTML(rows, summaries) {
  const order = [...summaries].sort((a, b) => {
    const r = (NIVEL_RANK[b.worst] ?? -1) - (NIVEL_RANK[a.worst] ?? -1);
    return r || ((b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  });
  const VISIBLE = 12;
  const cell = (v) => (v === '' || v == null) ? '<span class="muted">—</span>' : esc(v);
  const dCell = (c) => c.fecha ? fmtShort(c.fecha) : cell(c.fechaRaw);
  const luminCell = (s) => s.lumin === true ? '<span class="mic-lumin is-on" title="Presencia de V. Luminiscentes">✨ Pres.</span>' : (s.lumin === false ? '<span class="muted">Aus.</span>' : '<span class="muted">—</span>');

  // Patógenos PRESENTES (con UFC, crudo o nivel en alguna muestra del filtro) → una columna c/u.
  const presentKeys = new Set();
  summaries.forEach((s) => Object.keys(s.byKey).forEach((k) => { const m = s.byKey[k]; if (m.ufc !== null || m.crudo !== null || m.nivel) presentKeys.add(k); }));
  const pats = PATHOGENS.filter((p) => presentKeys.has(p.key));
  // Celda de patógeno: UFC con tinte del nivel (semáforo); '—' si no se midió.
  const patCell = (m) => {
    if (!m || (m.ufc === null && m.crudo === null && !m.nivel)) return '<td class="mic-pat-cell muted">—</td>';
    const tint = m.nivel ? ` style="background:${NIVEL_COLOR[m.nivel]}22;box-shadow:inset 3px 0 0 ${NIVEL_COLOR[m.nivel]}"` : '';
    const val = m.ufc !== null ? fmtNum(m.ufc) : (m.crudo !== null ? esc(String(m.crudo)) : '·');
    return `<td class="mic-pat-cell"${tint} title="${m.nivel ? esc(m.nivel) + ' · ' : ''}${m.ufc !== null ? fmtNum(m.ufc) + ' UFC' : 'sin UFC'}">${val}</td>`;
  };

  const head = `<tr><th>Fecha</th><th>Corrida</th><th>Mód/Sala</th><th>Ubicación</th><th>Estadío</th><th>Tipo</th><th>Formato</th>${pats.map((p) => `<th class="mic-pat-h" title="${esc(p.label)} · UFC">${esc(p.label)}</th>`).join('')}<th>Nivel máx</th><th>V.Lumin</th></tr>`;
  const colspan = 9 + pats.length;
  const body = order.length ? order.map((s, i) => {
    const c = s.ctx;
    return `<tr class="${i >= VISIBLE ? 'mic-row-hidden' : ''}">
      <td>${dCell(c)}</td>
      <td>${c.corrida ? 'C' + esc(c.corrida) : '<span class="muted">—</span>'}</td>
      <td>${cell(c.modSalaLabel)}</td>
      <td>${cell(c.ubicacion)}</td>
      <td>${cell(c.estadio)}</td>
      <td>${cell(c.tipoMuestra)}</td>
      <td>${cell(FORMATO_LABEL[c.formatoKey] || c.formato)}</td>
      ${pats.map((p) => patCell(s.byKey[p.key])).join('')}
      <td>${s.worst ? `<span class="mic-nivel" style="--nv:${NIVEL_COLOR[s.worst]}">${esc(s.worst)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${luminCell(s)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="${colspan}" class="muted" style="text-align:center;padding:18px">Sin muestras para el filtro actual.</td></tr>`;

  const hiddenN = Math.max(0, order.length - VISIBLE);
  return `<div class="card mic-collap">
      <div class="mic-collap-head">
        <div class="mic-collap-title">📋 Muestras <span class="muted" style="font-weight:600;font-size:12px">· ${order.length} · UFC por patógeno (color = nivel)</span></div>
        ${hiddenN > 0 ? `<button class="mic-toggle" data-mic-toggle aria-expanded="false">Ver todo (${order.length})</button>` : ''}
      </div>
      <div class="mic-table-wrap" style="max-height:460px">
        <table class="mic-table"><thead>${head}</thead><tbody>${body}</tbody></table>
      </div>
    </div>`;
}

/* ---- export · solo Reporte (TXT); CSV/JSON retirados ---- */
function doExport() {
  const recs = _scope.records;
  if (!recs.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
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
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
  const fn = `reporte_microbiologia_${stamp}.txt`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- export Excel (rango de fechas + solo columnas con datos) ---- */
const isoDate = (d) => d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';

/** Filas de Microbiología que respetan los filtros activos (SIN el mes; el rango de
 *  fechas del modal es el filtro temporal). */
function micExportBaseRows() {
  return microRows().filter((r) => {
    const c = rowContext(r);
    if (vState.depto && deptoOfFormato(c.formatoKey) !== vState.depto) return false;
    if (vState.formato && c.formatoKey !== vState.formato) return false;
    return FILTER_DIMS.every((dim) => !vState.dims[dim.key] || dim.pick(c) === vState.dims[dim.key]);
  });
}
function micExportRows(root) {
  const from = root.querySelector('#micExpFrom')?.value || '';
  const to = root.querySelector('#micExpTo')?.value || '';
  const fromD = from ? new Date(from + 'T00:00:00') : null;
  const toD = to ? new Date(to + 'T23:59:59') : null;
  return micExportBaseRows().filter((r) => { const d = rowContext(r).fecha; if (!d || isNaN(d)) return false; if (fromD && d < fromD) return false; if (toD && d > toD) return false; return true; })
    .sort((a, b) => (rowContext(a).fecha || 0) - (rowContext(b).fecha || 0));
}
function xlsxModalHTML() {
  return `<div class="mic-modal" id="micXlsxModal" data-mic-xlsx-overlay>
      <div class="mic-modal-card">
        <div class="mic-modal-head">
          <span class="mic-modal-title">⬇ Exportar a Excel · rango de fechas</span>
          <button class="mic-modal-x" data-mic-xlsx-close aria-label="Cerrar">✕</button>
        </div>
        <div class="mic-modal-body">
          <p class="muted" id="micExpScope" style="margin:0 0 12px;font-size:12px"></p>
          <div class="mic-exp-range">
            <label class="mic-exp-fld">Desde <input type="date" id="micExpFrom"></label>
            <label class="mic-exp-fld">Hasta <input type="date" id="micExpTo"></label>
          </div>
          <div id="micExpInfo" class="muted" style="margin:10px 0;font-size:12px"></div>
          <button class="mic-exp" data-mic-xlsx-go style="font-size:13px;padding:7px 14px">⬇ Descargar Excel</button>
        </div>
      </div>
    </div>`;
}
function updateXlsxInfo(root) {
  const info = root.querySelector('#micExpInfo'); if (info) info.textContent = `Se exportarán ${micExportRows(root).length} registro(s) · solo columnas con datos.`;
}
function openXlsxModal(root) {
  const m = root.querySelector('#micXlsxModal'); if (!m) return;
  const base = micExportBaseRows();
  if (!base.length) { toast('Sin registros para los filtros activos.', 'warn'); return; }
  // Rango por defecto = span de lo que se está viendo (el mes actual filtrado).
  const dates = _scope.rows.map((r) => rowContext(r).fecha).filter((d) => d && !isNaN(d)).sort((a, b) => a - b);
  const f = root.querySelector('#micExpFrom'), t = root.querySelector('#micExpTo');
  if (f) f.value = dates.length ? isoDate(dates[0]) : '';
  if (t) t.value = dates.length ? isoDate(dates[dates.length - 1]) : '';
  const scope = root.querySelector('#micExpScope');
  if (scope) scope.textContent = `Respeta los filtros activos · ${base.length} registro(s) disponibles. Elige el rango de fechas a exportar.`;
  updateXlsxInfo(root);
  m.classList.add('is-open'); document.body.classList.add('modal-open');
}
function closeXlsxModal(root) {
  const m = root.querySelector('#micXlsxModal'); if (m) m.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}
function runXlsxExport(root) {
  const XLSX = window.XLSX;
  if (!XLSX) { toast('Exportación no disponible: SheetJS (XLSX) no se cargó.', 'err'); return; }
  const rows = micExportRows(root);
  if (!rows.length) { toast('Sin registros en el rango de fechas elegido.', 'warn'); return; }
  // Columnas en orden del Sheet (orden de claves) que tengan datos en el rango.
  const cols = []; const seen = new Set();
  rows.forEach((r) => Object.keys(r).forEach((k) => { if (!k.startsWith('_') && !seen.has(k)) { seen.add(k); cols.push(k); } }));
  const dataCols = cols.filter((k) => rows.some((r) => { const v = r[k]; return v !== undefined && v !== null && String(v).trim() !== ''; }));
  const aoa = [dataCols, ...rows.map((r) => dataCols.map((k) => { const v = r[k]; return (v === undefined || v === null) ? '' : v; }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Microbiologia');
  const from = root.querySelector('#micExpFrom')?.value || 'inicio', to = root.querySelector('#micExpTo')?.value || 'fin';
  XLSX.writeFile(wb, `Microbiologia_${from}_a_${to}.xlsx`);
  closeXlsxModal(root);
}

/* ============================================================
   HTML helpers
   ============================================================ */
function band(icon, label, color) {
  return `<div class="mic-band" style="border-top-color:${color}"><span class="mic-band-title">${icon} ${esc(label)}</span></div>`;
}
function kpi(icon, label, value, alert = false, sub = '', attrs = '') {
  return `<div class="mic-kpi${alert ? ' is-alert' : ''}${attrs ? ' mic-kpi-click' : ''}" ${attrs}>
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
/** Select de una dimensión de filtro dinámica (placeholder con su etiqueta). */
function micDimSelect(dim, value, values) {
  return `<select class="mic-select" data-micdim="${dim.key}" title="${esc(dim.label)}">
      <option value="">Todos · ${esc(dim.label)}</option>
      ${values.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(dim.fmt ? dim.fmt(o) : o)}</option>`).join('')}
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
    // Rango de fechas del modal de Excel: recalcula el conteo, no re-renderiza.
    if (e.target.id === 'micExpFrom' || e.target.id === 'micExpTo') { updateXlsxInfo(root); return; }
    // Filtro de contexto dinámico (Sala/Sexo/TQ/Punto/…)
    const dimSel = e.target.closest('[data-micdim]');
    if (dimSel) { vState.dims[dimSel.dataset.micdim] = dimSel.value || null; vState.petriDay = null; microbiologiaView(root); return; }
    // Cascada de Calidad de Agua (departamento/formato + dimensiones de contexto).
    const cdim = e.target.closest('[data-caldim]');
    if (cdim) { vState.calDims[cdim.dataset.caldim] = cdim.value || null; microbiologiaView(root); return; }
    const csel = e.target.closest('[data-calfilter]');
    if (csel) { vState[csel.dataset.calfilter] = csel.value || null; if (csel.dataset.calfilter === 'calDepto') { vState.calFormato = null; vState.calDims = {}; } microbiologiaView(root); return; }
    const sel = e.target.closest('[data-micfilter]');
    if (!sel) return;
    vState[sel.dataset.micfilter] = sel.value || null;
    if (sel.dataset.micfilter === 'depto') vState.dims = {}; // cambiar de depto/formato resetea los filtros de contexto
    vState.petriDay = null; // el día válido se recalcula con el nuevo filtro
    microbiologiaView(root);
  });

  root.addEventListener('click', (e) => {
    // KPI "Mod./Elevado" → modal con el listado de alertas (por fecha).
    if (e.target.closest('[data-mic-alerts]')) { openAlertModal(root); return; }
    if (e.target.closest('[data-mic-alert-close]') || e.target.matches('[data-mic-alert-overlay]')) { closeAlertModal(root); return; }

    // Exportar Excel por rango de fechas.
    if (e.target.closest('[data-mic-xlsx-go]')) { runXlsxExport(root); return; }
    if (e.target.closest('[data-mic-xlsx-close]') || e.target.matches('[data-mic-xlsx-overlay]')) { closeXlsxModal(root); return; }
    if (e.target.closest('[data-mic-xlsx]')) { openXlsxModal(root); return; }

    const sub = e.target.closest('[data-mic-sub]');
    if (sub) { if (vState.sub !== sub.dataset.micSub) { vState.sub = sub.dataset.micSub; microbiologiaView(root); } return; }

    // General: acceso directo a una sub-vista (arrastra el mes elegido en el panorama).
    const goto = e.target.closest('[data-gen-goto]');
    if (goto) {
      const tgt = goto.dataset.genGoto;
      vState.sub = tgt;
      if (tgt === 'bacteriologia') {
        vState.month = vState.genMonth;
        vState.depto = null; vState.formato = null; vState.dims = {}; vState.petriDay = null;
      } else if (tgt === 'calidad') {
        vState.calMonth = vState.genMonth;
      }
      microbiologiaView(root);
      return;
    }
    // General: tocar una fila de área → modal de desglose (NO navega).
    const gdep = e.target.closest('[data-gen-depto]');
    if (gdep) { openGenDepto(root, gdep.dataset.genDepto); return; }
    if (e.target.closest('[data-gen-depto-close]') || e.target.matches('[data-gen-depto-overlay]')) { closeGenDepto(root); return; }

    // General: tocar un instrumento (KPI) → modal de resumen (NO navega).
    const gkpi = e.target.closest('[data-gen-kpi]');
    if (gkpi) { openGenKpi(root, gkpi.dataset.genKpi); return; }
    if (e.target.closest('[data-gen-kpi-close]') || e.target.matches('[data-gen-kpi-overlay]')) { closeGenKpi(root); return; }

    // Barra de mes del panorama General (compartida por Bacteriología + Calidad de Agua).
    const gnav = e.target.closest('[data-gen-month]');
    if (gnav && !gnav.disabled) {
      const cs = [...microRows().map((r) => rowContext(r).corrida), ...calAguaRows().map((r) => calCtx(r).corrida)].filter(Boolean);
      const gms = [...new Set(cs.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
      const gi = gms.indexOf(vState.genMonth) + Number(gnav.dataset.genMonth);
      if (gi >= 0 && gi < gms.length) { vState.genMonth = gms[gi]; microbiologiaView(root); }
      return;
    }

    const ap = e.target.closest('[data-mic-ap]');
    if (ap) { if (vState.apartado !== ap.dataset.micAp) { vState.apartado = ap.dataset.micAp; microbiologiaView(root); } return; }

    // Calidad de Agua: chips de selección múltiple (Módulo) — alterna la pertenencia.
    const mchip = e.target.closest('[data-caldim-chip]');
    if (mchip) {
      const k = mchip.dataset.caldimChip, val = mchip.dataset.caldimVal;
      const cur = Array.isArray(vState.calDims[k]) ? vState.calDims[k].slice() : [];
      const i = cur.indexOf(val);
      if (i >= 0) cur.splice(i, 1); else cur.push(val);
      vState.calDims[k] = cur.length ? cur : null;
      microbiologiaView(root);
      return;
    }

    // Apartado de Calidad de Agua: Perfil ⇄ Matriz ⇄ Analizador ⇄ Ensayo.
    const cap = e.target.closest('[data-cal-ap]');
    if (cap) { if (vState.calApartado !== cap.dataset.calAp) { vState.calApartado = cap.dataset.calAp; microbiologiaView(root); } return; }
    // Analizador: seleccionar el cartucho (parámetro) a analizar en la pantalla.
    const cpar = e.target.closest('[data-cal-param]');
    if (cpar) { if (vState.calTrendKey !== cpar.dataset.calParam) { vState.calTrendKey = cpar.dataset.calParam; microbiologiaView(root); } return; }
    // Analizador: cambiar el modo del gráfico (Tendencia / Control / Distribución).
    const cmode = e.target.closest('[data-cal-chartmode]');
    if (cmode) { if (vState.calChartMode !== cmode.dataset.calChartmode) { vState.calChartMode = cmode.dataset.calChartmode; microbiologiaView(root); } return; }
    // Por ubicación: conmutar el estilo del comparador de tanques.
    const cview = e.target.closest('[data-cal-cmpview]');
    if (cview) { if (vState.calCmpView !== cview.dataset.calCmpview) { vState.calCmpView = cview.dataset.calCmpview; microbiologiaView(root); } return; }
    // Por ubicación: colapsar/expandir un módulo de las fichas técnicas.
    const cmod = e.target.closest('[data-cal-mod]');
    if (cmod) { const k = cmod.dataset.calMod; const cur = cmod.getAttribute('aria-expanded') === 'true'; vState.calLocOpen[k] = !cur; microbiologiaView(root); return; }
    // Por ubicación: celda del Mapa de riesgo → detalle-foto (modal de tanque).
    const ctk = e.target.closest('[data-cal-tank]');
    if (ctk) { openCalTankModal(root, ctk.dataset.calTank); return; }
    if (e.target.closest('[data-cal-tank-close]') || e.target.matches('[data-cal-tank-overlay]')) { closeCalTankModal(root); return; }
    // Por ubicación: ficha técnica de un tanque → perfil temporal (evolución).
    const cfi = e.target.closest('[data-cal-ficha]');
    if (cfi) { openCalFicha(root, cfi.dataset.calFicha); return; }
    if (e.target.closest('[data-cal-ficha-close]') || e.target.matches('[data-cal-ficha-overlay]')) { closeCalFicha(root); return; }
    // Calidad de Agua: modal de alertas (mediciones fuera de rango) + export.
    if (e.target.closest('[data-cal-alerts]')) { openCalAlert(root); return; }
    if (e.target.closest('[data-cal-alert-close]') || e.target.matches('[data-cal-alert-overlay]')) { closeCalAlert(root); return; }
    // Calidad de Agua: modales de detalle de los KPIs (Muestras/Cumplimiento/Perfil).
    const kpiTile = e.target.closest('[data-cal-kpi]');
    if (kpiTile) { openCalKpi(root, kpiTile.dataset.calKpi); return; }
    if (e.target.closest('[data-cal-kpi-close]') || e.target.matches('[data-cal-kpi-overlay]')) { closeCalKpi(root); return; }
    if (e.target.closest('[data-cal-export]')) { calExportTxt(); return; }
    if (e.target.closest('[data-cal-xlsx]')) { calExportXlsx(); return; }
    // Editor de rangos objetivo ("Factores").
    if (e.target.closest('[data-cal-factors]')) { openCalFact(root); return; }
    if (e.target.closest('[data-cal-fact-close]') || e.target.matches('[data-cal-fact-overlay]')) { closeCalFact(root); return; }
    if (e.target.closest('[data-cal-fact-save]')) { saveCalFactors(root); return; }
    if (e.target.closest('[data-cal-fact-reset]')) { resetCalFactors(root); return; }

    const pet = e.target.closest('[data-mic-petab]');
    if (pet) { if (vState.petriTab !== pet.dataset.micPetab) { vState.petriTab = pet.dataset.micPetab; microbiologiaView(root); } return; }

    // Ranking de Tendencias: seleccionar una fila (patógeno) para ver su cinética.
    const tsel = e.target.closest('[data-mic-trendsel]');
    if (tsel) { if (vState.petriTrendKey !== tsel.dataset.micTrendsel) { vState.petriTrendKey = tsel.dataset.micTrendsel; microbiologiaView(root); } return; }
    // Ranking de Tendencias: cambiar el criterio de orden (μ / Σ UFC / alertas).
    const tsort = e.target.closest('[data-mic-trendsort]');
    if (tsort) { if (vState.petriTrendSort !== tsort.dataset.micTrendsort) { vState.petriTrendSort = tsort.dataset.micTrendsort; microbiologiaView(root); } return; }

    const exp = e.target.closest('[data-mic-export]');
    if (exp) { doExport(); return; }

    const pth = e.target.closest('[data-mic-petheme]');
    if (pth) { vState.petriTheme = vState.petriTheme === 'dark' ? 'light' : 'dark'; microbiologiaView(root); return; }

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

    // Barra de mes de Calidad de Agua (independiente de Bacteriología).
    const cnav = e.target.closest('[data-cal-month]');
    if (cnav && !cnav.disabled) {
      const cms = [...new Set(calAguaRows().map((r) => calCtx(r).corrida).filter(Boolean).map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
      const ci = cms.indexOf(vState.calMonth) + Number(cnav.dataset.calMonth);
      if (ci >= 0 && ci < cms.length) { vState.calMonth = cms[ci]; microbiologiaView(root); }
      return;
    }

    const nav = e.target.closest('[data-mic-month]');
    if (!nav || nav.disabled) return;
    const all = microRows();
    const ms = [...new Set(all.map((r) => rowContext(r).corrida).filter(Boolean).map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
    const ni = ms.indexOf(vState.month) + Number(nav.dataset.micMonth);
    if (ni >= 0 && ni < ms.length) {
      vState.month = ms[ni];
      vState.depto = null; vState.formato = null; vState.dims = {};
      vState.petriDay = null;
      microbiologiaView(root);
    }
  });

  // Teclado: Enter/Espacio sobre el KPI abre el modal de alertas; sobre una fila del
  // heatmap de Tendencias la selecciona. Escape cierra modales.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeAlertModal(root); closeXlsxModal(root); closeCalAlert(root); closeCalKpi(root); closeCalFact(root); closeCalTankModal(root); closeCalFicha(root); closeGenDepto(root); closeGenKpi(root); return; }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    if (e.target.closest('[data-mic-alerts]')) { e.preventDefault(); openAlertModal(root); return; }
    if (e.target.closest('[data-cal-alerts]')) { e.preventDefault(); openCalAlert(root); return; }
    const kpiTile = e.target.closest('[data-cal-kpi]');
    if (kpiTile) { e.preventDefault(); openCalKpi(root, kpiTile.dataset.calKpi); return; }
    const gkpiTile = e.target.closest('[data-gen-kpi]');
    if (gkpiTile) { e.preventDefault(); openGenKpi(root, gkpiTile.dataset.genKpi); return; }
    // Comparador de tanques (coordenadas paralelas): las líneas son <g role=button> → teclado manual.
    const cpcTk = e.target.closest('.cal-pc-tank[data-cal-tank]');
    if (cpcTk) { e.preventDefault(); openCalTankModal(root, cpcTk.dataset.calTank); return; }
    // Los cartuchos del Analizador (data-cal-param) son <button> nativos → teclado por defecto.
    const tsel = e.target.closest('[data-mic-trendsel]');
    if (tsel) { e.preventDefault(); if (vState.petriTrendKey !== tsel.dataset.micTrendsel) { vState.petriTrendKey = tsel.dataset.micTrendsel; microbiologiaView(root); } }
  });

  // Tooltip de la placa de agar (colonias) por delegación.
  root.addEventListener('mouseover', (e) => {
    const g = e.target.closest('.mic-colony'); if (g) showColonyTT(root, g);
  });
  root.addEventListener('mousemove', (e) => moveColonyTT(root, e));
  root.addEventListener('mouseout', (e) => {
    const g = e.target.closest('.mic-colony'); if (g) hideColonyTT(root, g);
  });
}
