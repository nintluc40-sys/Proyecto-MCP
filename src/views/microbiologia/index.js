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
import { calAguaRows, calCtx, calMeasured, calLocation, loadCalRanges, CAL_PARAMS } from './calagua.data.js';

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
  calApartado: 'perfil', // 'perfil' (tarjetas) | 'matriz' (muestra × parámetro)
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
const calLegendHTML = () => `<div class="cal-legend">
    <span class="cal-legend-item"><span class="cal-dot cal-dot--dentro"></span>Dentro de rango</span>
    <span class="cal-legend-item"><span class="cal-dot cal-dot--fuera"></span>Fuera de rango</span>
    <span class="cal-legend-item"><span class="cal-dot cal-dot--sin-rango"></span>Sin rango definido</span>
  </div>`;

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
    </div>`;
  h += `<div class="mic-kpis">
      ${kpi('💧', 'Muestras', String(samples.length))}
      ${kpi('✅', 'Muestras 100% en rango', `${pctOk}%`, pctOk < 100, `${fullOk} de ${samples.length}`)}
      ${kpi('⚠️', 'Parámetros fuera de rango', String(outC), outC > 0, evaluated ? `${(outC / evaluated * 100).toFixed(0)}% de los evaluados` : '')}
      ${kpi('🧪', 'Parámetro más incumplido', worst ? worst[0] : '—', !!worst, worst ? `${worst[1]} muestra(s)` : 'sin incumplimientos')}
    </div>`;

  // Apartados: Perfil (tarjetas) · Matriz (muestra × parámetro).
  const ap = ['perfil', 'matriz'].includes(vState.calApartado) ? vState.calApartado : 'perfil';
  h += `<div class="mic-apartados">
      <button class="mic-ap ${ap === 'perfil' ? 'is-active' : ''}" data-cal-ap="perfil">🧪 Perfil</button>
      <button class="mic-ap ${ap === 'matriz' ? 'is-active' : ''}" data-cal-ap="matriz">🗂️ Matriz</button>
    </div>`;
  h += calLegendHTML();

  if (!samples.length) h += emptyBox('Sin muestras con parámetros medidos para el filtro actual.');
  else if (ap === 'matriz') h += calMatrizHTML(samples);
  else h += `<div class="cal-cards">${samples.map((s) => calCardHTML(s)).join('')}</div>`;
  h += `</div>`;
  return h;
}

/** Apartado Matriz: filas = muestras, columnas = parámetros medidos (orden del
 *  catálogo); celda = valor coloreado por estado (dentro/fuera/sin-rango). */
function calMatrizHTML(samples) {
  const present = new Set();
  samples.forEach((s) => s.meas.forEach((m) => present.add(m.key)));
  const cols = CAL_PARAMS.filter((p) => present.has(p.key));
  if (!cols.length) return emptyBox('Sin parámetros medidos para el filtro actual.');
  const head = `<tr><th class="cal-mx-corner">Muestra \\ Parámetro</th>${cols.map((c) => `<th class="cal-mx-colh" title="${esc(c.label)}${c.unit ? ' (' + esc(c.unit) + ')' : ''}">${esc(c.label)}</th>`).join('')}</tr>`;
  const body = samples.map((s) => {
    const byKey = Object.fromEntries(s.meas.map((m) => [m.key, m]));
    const cells = cols.map((c) => {
      const m = byKey[c.key];
      if (!m) return '<td class="cal-mx-empty" title="sin dato">·</td>';
      return `<td class="cal-mx-cell cal-mx--${m.estado}" title="${esc(c.label)} — ${m.estado}${m.range ? ' · objetivo ' + esc(m.range) : ''}">${esc(calFmt(m.value))}</td>`;
    }).join('');
    const loc = [s.ctx.fecha ? fmtShort(s.ctx.fecha) : '—', calLocation(s.ctx)].join(' · ');
    return `<tr><th class="cal-mx-rowh" title="${esc(loc)}">${esc(loc)}</th>${cells}</tr>`;
  }).join('');
  return `<div class="card cal-mx-card">
      <div class="mic-chart-title">🗂️ Matriz Muestra × Parámetro <span class="muted">· color = dentro/fuera de rango · valor medido</span></div>
      <div class="cal-mx-wrap"><table class="cal-mx-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    </div>`;
}

/** Tarjeta de una muestra: cabecera (fecha·depto·ubicación·cumplimiento) + chips por parámetro. */
function calCardHTML(s) {
  const { ctx, meas } = s;
  const inR = meas.filter((m) => m.estado === 'dentro').length;
  const withRange = meas.filter((m) => m.estado !== 'sin-rango').length;
  const anyOut = meas.some((m) => m.estado === 'fuera');
  const badge = withRange
    ? `<span class="cal-badge cal-badge--${anyOut ? 'warn' : 'ok'}">${inR}/${withRange} en rango</span>`
    : '<span class="cal-badge cal-badge--muted">solo registro</span>';
  const chips = meas.map((m) => `<div class="cal-chip cal-chip--${m.estado}" title="${esc(m.label)}${m.range ? ' · objetivo ' + esc(m.range) : ' · sin rango'}">
      <span class="cal-chip-l">${esc(m.label)}</span>
      <span class="cal-chip-v">${esc(calFmt(m.value))}${m.unit ? ' ' + esc(m.unit) : ''}</span>
      ${m.range ? `<span class="cal-chip-r">${esc(m.range)}</span>` : ''}
    </div>`).join('');
  const dateStr = ctx.fecha ? fmtShort(ctx.fecha) : '—';
  const deptoFmt = [ctx.depto, ctx.formato].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  return `<div class="cal-card${anyOut ? ' is-out' : ''}">
      <div class="cal-card-h">
        <span class="cal-card-date">📅 ${esc(dateStr)}</span>
        <span class="cal-card-loc">${esc(deptoFmt || '—')}${deptoFmt ? ' · ' : ''}${esc(calLocation(ctx))}</span>
        ${badge}
      </div>
      <div class="cal-chips">${chips}</div>
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

    // Apartado de Calidad de Agua: Perfil ⇄ Matriz.
    const cap = e.target.closest('[data-cal-ap]');
    if (cap) { if (vState.calApartado !== cap.dataset.calAp) { vState.calApartado = cap.dataset.calAp; microbiologiaView(root); } return; }

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
    if (e.key === 'Escape') { closeAlertModal(root); closeXlsxModal(root); return; }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    if (e.target.closest('[data-mic-alerts]')) { e.preventDefault(); openAlertModal(root); return; }
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
