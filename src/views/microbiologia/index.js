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
import { calAguaRows, calCtx, calMeasured, calLocation, loadCalRanges, calRangeText, calEnsayoData, CAL_PARAMS, calDiagnosis, calGroupTree, controlStats, boxStats, calSeverity, CAL_RISK, CAL_SEV } from './calagua.data.js';

// ── sub-vistas del módulo ──
const SUBS = [
  { key: 'general', label: 'General', icon: '📊' },
  { key: 'bacteriologia', label: 'Bacteriología', icon: '🧫' },
  { key: 'calidad', label: 'Calidad de Agua', icon: '💧' },
  { key: 'patologia', label: 'Patología en fresco', icon: '🔬' },
];

// Estado persistente entre re-render.
const vState = {
  sub: 'bacteriologia', month: null, depto: null, formato: null,
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
let _calLocTree = null; // árbol Módulo→Tanque actual (para el modal de ficha técnica en "Por ubicación")

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
  { key: 'modulo', label: 'Módulo', pick: (c) => c.modulo, fmt: (v) => 'M' + v, cmp: (a, b) => (+a) - (+b) },
  { key: 'sala', label: 'Sala', pick: (c) => c.sala },
  { key: 'estadio', label: 'Estadío', pick: (c) => c.estadio },
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
      </div>
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
    if (vState.calDims[dim.key] && !vals.includes(vState.calDims[dim.key])) vState.calDims[dim.key] = null;
    if (vals.length < 2) { vState.calDims[dim.key] = null; return; }
    dimFilters.push({ dim, options: vals });
    if (vState.calDims[dim.key]) pool = pool.filter((r) => dim.pick(ctxOf(r)) === vState.calDims[dim.key]);
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
  const fullOk = samples.filter((s) => s.meas.every((m) => m.estado !== 'fuera')).length;
  const pctOk = samples.length ? Math.round((fullOk / samples.length) * 100) : 0;
  const worst = [...outByParam.entries()].sort((a, b) => b[1] - a[1])[0];
  const evaluated = inC + outC; // parámetros con rango (no "sin-rango")

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
      ${dimFilters.map(({ dim, options }) => calDimSelect(dim, vState.calDims[dim.key], options)).join('')}
      <div class="mic-export"><button class="mic-exp" data-cal-factors title="Editar rangos objetivo (mín/máx) por parámetro">⚙️ Rangos</button><button class="mic-exp" data-cal-export title="Descargar reporte de texto de las muestras filtradas">⬇ Reporte</button><button class="mic-exp" data-cal-xlsx title="Descargar Excel de las muestras filtradas">⬇ Excel</button></div>
    </div>`;
  const alertAttrs = outC > 0 ? 'data-cal-alerts role="button" tabindex="0" title="Ver listado de mediciones fuera de rango"' : '';
  h += `<div class="mic-kpis">
      ${kpi('💧', 'Muestras', String(samples.length))}
      ${kpi('✅', 'Muestras 100% en rango', `${pctOk}%`, pctOk < 100, `${fullOk} de ${samples.length}`)}
      ${kpi('⚠️', 'Parámetros fuera de rango', String(outC), outC > 0, evaluated ? `${(outC / evaluated * 100).toFixed(0)}% de los evaluados` : '', alertAttrs)}
      ${kpi('🧪', 'Parámetro más incumplido', worst ? worst[0] : '—', !!worst, worst ? `${worst[1]} muestra(s)` : 'sin incumplimientos')}
    </div>`;

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
  h += calTankModalHTML();
  h += calFactModalHTML(ranges);
  h += `</div>`;
  return h;
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
  CAL_PARAMS.forEach((p) => {
    const mn = root.querySelector(`[data-cal-rmin="${p.key}"]`);
    const mx = root.querySelector(`[data-cal-rmax="${p.key}"]`);
    const min = mn && mn.value.trim() !== '' ? parseFloat(mn.value) : null;
    const max = mx && mx.value.trim() !== '' ? parseFloat(mx.value) : null;
    const o = {};
    if (min != null && !isNaN(min)) o.min = min;
    if (max != null && !isNaN(max)) o.max = max;
    if (Object.keys(o).length) stored[p.key] = o; else delete stored[p.key];
  });
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

/** Apartado "Por ubicación": mapa de riesgo Módulo × Tanque + fichas técnicas
 *  jerárquicas (módulos colapsables con tarjetas de tanque). Reemplaza Perfil/Matriz. */
function calUbicacionHTML(samples, ranges) {
  const tree = calGroupTree(samples, ranges);
  _calLocTree = tree;
  if (!tree.length) return emptyBox('Sin ubicaciones con parámetros medidos para el filtro actual.');

  // Mapa de riesgo: una fila por módulo, una celda por tanque, coloreada por riesgo.
  const riskMap = `<div class="cal-riskmap">
      <div class="cal-rm-title">🗺️ Mapa de riesgo · Módulo × Tanque</div>
      <div class="cal-rm-rows">
        ${tree.map((mo, mi) => `<div class="cal-rm-row">
            <div class="cal-rm-mod cal-risk--${mo.risk}"><b>${esc(mo.label)}</b>${mo.wqi != null ? `<span>WQI ${mo.wqi}</span>` : ''}</div>
            <div class="cal-rm-cells">
              ${mo.tanks.map((t, ti) => `<button class="cal-rm-cell cal-risk--${t.risk}" data-cal-tank="${mi}-${ti}" title="${esc(mo.label)} · ${esc(t.label)} — ${esc(CAL_RISK[t.risk].label)}${t.wqi != null ? ' · WQI ' + t.wqi : ''}">${esc(t.label)}${t.wqi != null ? `<small>${t.wqi}</small>` : ''}</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  // Fichas técnicas jerárquicas: módulo colapsable → tarjetas de tanque. Por defecto
  // solo se expande el módulo de peor riesgo (el primero); el resto queda colapsado
  // para no desbordar la vista cuando hay muchos puntos. El mapa de riesgo es el resumen.
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

  const parallel = calParallelSVG(tree, ranges);
  return `${riskMap}${parallel}<div class="cal-fichas-t">🗂️ Fichas técnicas por tanque <span>· toca un módulo para desplegar sus tanques · toca una ficha para el detalle</span></div><div class="cal-fichas">${fichas}</div>`;
}

/** Comparador de tanques por COORDENADAS PARALELAS: cada tanque es una polilínea a
 *  través de los parámetros con rango (normalizados por `calScale`, misma escala 0–100
 *  con la zona objetivo como banda); línea coloreada por riesgo del tanque, vértices por
 *  severidad del valor. Clic/Enter en una línea abre la ficha del tanque. SVG puro. */
function calParallelSVG(tree, ranges) {
  const present = new Set();
  tree.forEach((mo) => mo.tanks.forEach((t) => t.samples.forEach((s) => s.meas.forEach((m) => present.add(m.key)))));
  const axes = CAL_PARAMS.filter((p) => present.has(p.key) && ranges[p.key]);
  const tanks = [];
  tree.forEach((mo, mi) => mo.tanks.forEach((t, ti) => tanks.push({ mi, ti, label: mo.label + ' · ' + t.label, risk: t.risk, wqi: t.wqi, latest: calLatestByParam(t.samples) })));
  if (axes.length < 2 || tanks.length < 2) return ''; // sin comparación posible
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
  return `<div class="cal-parallel">
      <div class="cal-pc-title">🧵 Comparador de tanques · coordenadas paralelas <span>· cada línea es un tanque · banda verde = zona objetivo · toca una línea para su ficha</span></div>
      <div class="cal-pc-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="cal-pc-svg" role="img" aria-label="Comparador de tanques por parámetro">${axisSVG}${lines}</svg></div>
    </div>`;
}

/** Ficha técnica de un tanque (tarjeta clicable → modal de detalle). */
function calFichaHTML(mi, ti, t) {
  const sev = RISK_TO_SEV[t.risk] || 'sin-rango';
  const critTxt = t.crit.length
    ? t.crit.slice(0, 4).map((c) => `<span class="cal-ficha-crit-i">● ${esc(c)}</span>`).join('') + (t.crit.length > 4 ? ` <span class="cal-ficha-crit-i">+${t.crit.length - 4}</span>` : '')
    : '<span class="cal-ficha-ok">✓ sin incumplimientos</span>';
  return `<button class="cal-ficha cal-sev--${sev}" data-cal-tank="${mi}-${ti}" title="Ver ficha de ${esc(t.label)}">
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

    const ap = e.target.closest('[data-mic-ap]');
    if (ap) { if (vState.apartado !== ap.dataset.micAp) { vState.apartado = ap.dataset.micAp; microbiologiaView(root); } return; }

    // Apartado de Calidad de Agua: Perfil ⇄ Matriz ⇄ Analizador ⇄ Ensayo.
    const cap = e.target.closest('[data-cal-ap]');
    if (cap) { if (vState.calApartado !== cap.dataset.calAp) { vState.calApartado = cap.dataset.calAp; microbiologiaView(root); } return; }
    // Analizador: seleccionar el cartucho (parámetro) a analizar en la pantalla.
    const cpar = e.target.closest('[data-cal-param]');
    if (cpar) { if (vState.calTrendKey !== cpar.dataset.calParam) { vState.calTrendKey = cpar.dataset.calParam; microbiologiaView(root); } return; }
    // Analizador: cambiar el modo del gráfico (Tendencia / Control / Distribución).
    const cmode = e.target.closest('[data-cal-chartmode]');
    if (cmode) { if (vState.calChartMode !== cmode.dataset.calChartmode) { vState.calChartMode = cmode.dataset.calChartmode; microbiologiaView(root); } return; }
    // Por ubicación: colapsar/expandir un módulo de las fichas técnicas.
    const cmod = e.target.closest('[data-cal-mod]');
    if (cmod) { const k = cmod.dataset.calMod; const cur = cmod.getAttribute('aria-expanded') === 'true'; vState.calLocOpen[k] = !cur; microbiologiaView(root); return; }
    // Por ubicación: abrir la ficha técnica de un tanque (celda del mapa o tarjeta).
    const ctk = e.target.closest('[data-cal-tank]');
    if (ctk) { openCalTankModal(root, ctk.dataset.calTank); return; }
    if (e.target.closest('[data-cal-tank-close]') || e.target.matches('[data-cal-tank-overlay]')) { closeCalTankModal(root); return; }
    // Calidad de Agua: modal de alertas (mediciones fuera de rango) + export.
    if (e.target.closest('[data-cal-alerts]')) { openCalAlert(root); return; }
    if (e.target.closest('[data-cal-alert-close]') || e.target.matches('[data-cal-alert-overlay]')) { closeCalAlert(root); return; }
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
    if (e.key === 'Escape') { closeAlertModal(root); closeXlsxModal(root); closeCalAlert(root); closeCalFact(root); closeCalTankModal(root); return; }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    if (e.target.closest('[data-mic-alerts]')) { e.preventDefault(); openAlertModal(root); return; }
    if (e.target.closest('[data-cal-alerts]')) { e.preventDefault(); openCalAlert(root); return; }
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
