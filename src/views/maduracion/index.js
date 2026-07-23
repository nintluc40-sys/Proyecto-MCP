/* ============================================================
   MADURACIÓN · "Microchips" — Vista de seguimiento reproductivo
   Panorama + Salas/Tanques + Hembras (individual) sobre el Registro Reproductivo
   (hojas MATRIZ / Bitácora / Transferencias). Capa de datos pura en data.js.
   ============================================================ */
import { store } from '../../core/store.js';
import { makeChart, destroyChart, destroyAllCharts } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import { fmtShort } from '../../core/dates.js';
import { registerModalEscape } from '../../ui/modalEscape.js';
import {
  MAD_MATRIZ_ORIGIN, MAD_BITACORA_ORIGIN, MAD_TRANSFER_ORIGIN,
  FEMALE_STATES, FEMALE_STATE_META, ACTIVITY_WINDOW_DAYS,
  buildReproModel, makeFilter, monthLabel, kpis, locationStats, femaleRanking,
  femaleHistory, neverSpawned, recoveryDistribution, stateDistribution,
  mortalityBreakdown, trends, salasOf, tanquesOf, locKey,
} from './data.js';

// ── Paleta (coherente en tema claro/oscuro; muted + grid como el resto de vistas) ──
const C = { desove: '#0f7c9a', mort: '#e0533b', fert: '#2e9e5b', brand: '#00838f', bar: '#0f7c9a' };
const AXIS = { color: '#78909c', font: { size: 10 } };
const GRID = 'rgba(120,144,156,.16)';

const SUBS = [
  { key: 'panorama', label: 'Panorama', icon: '📊' },
  { key: 'operativo', label: 'Salas y Tanques', icon: '🏠' },
  { key: 'hembras', label: 'Hembras', icon: '🦐' },
];

const vState = { sub: 'panorama', month: null, sala: null, tanque: null, locLevel: 'tanque', femSearch: '', femSel: null };

// Modelo memoizado por identidad de store.globalData.
let _cache = { src: null, model: null };
function reproModel() {
  if (_cache.src !== store.globalData) {
    const rows = store.globalData;
    _cache = {
      src: rows,
      model: buildReproModel(
        rows.filter((r) => r._SheetOrigin === MAD_MATRIZ_ORIGIN),
        rows.filter((r) => r._SheetOrigin === MAD_BITACORA_ORIGIN),
        rows.filter((r) => r._SheetOrigin === MAD_TRANSFER_ORIGIN),
      ),
    };
  }
  return _cache.model;
}

let _periods = [null];   // [null, ...months] — para el stepper de mes
let _model = null;       // último modelo (para handlers/modal)

// ── Formato ──
const n0 = (v) => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-EC');
const n1 = (v) => (v == null || isNaN(v)) ? '—' : (Math.round(v * 10) / 10).toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const pct = (v) => (v == null || isNaN(v)) ? '—' : (Math.round(v * 10) / 10) + '%';
const dCell = (d) => (d ? esc(fmtShort(d)) : '<span class="muted">—</span>');
const txt = (v) => (v === '' || v == null) ? '<span class="muted">—</span>' : esc(String(v));

/* ============================================================
   VISTA
   ============================================================ */
export function maduracionView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }
  destroyAllCharts();
  document.body.classList.remove('modal-open');

  const model = reproModel();
  _model = model;

  const hasData = model.females.length || model.desoves.length || model.mortalidades.length;
  if (!hasData) {
    root.innerHTML = headHTML() + `<div class="empty-state" style="padding:48px 20px">
      <div style="font-size:40px">🥚</div>
      <h3 style="margin:10px 0 6px;color:var(--c-brand)">Sin datos del Registro Reproductivo</h3>
      <p class="muted">No se encontraron filas en las hojas <b>Maduración MATRIZ</b>, <b>Maduración Bitácora</b> ni <b>Maduración Transferencias</b> del Google Sheet.</p>
      <p class="muted">Registra altas, desoves, mortalidades y transferencias en <b>Registros → Maduración → Reproductivo</b> para poblar esta vista.</p>
    </div>`;
    bind(root);
    return;
  }

  // Período (mes) — stepper con "Todo el histórico" al inicio.
  _periods = [null, ...model.months];
  if (vState.month != null && !model.months.includes(vState.month)) vState.month = null;

  // Filtros de ubicación (cascada Sala → Tanque).
  const salas = salasOf(model);
  if (vState.sala && !salas.includes(vState.sala)) { vState.sala = null; vState.tanque = null; }
  const tanques = tanquesOf(model, vState.sala);
  if (vState.tanque && !tanques.includes(vState.tanque)) vState.tanque = null;

  const f = makeFilter({ sala: vState.sala, tanque: vState.tanque, month: vState.month });

  let h = headHTML();
  h += `<div class="mc-filters">
      <div class="mc-monthbar">
        <button class="mc-mnav" data-mc-monthnav="-1" ${periodIdx() <= 0 ? 'disabled' : ''} aria-label="Período anterior">◀</button>
        <span class="mc-mlbl">📅 ${esc(vState.month ? monthLabel(vState.month) : 'Todo el histórico')}</span>
        <button class="mc-mnav" data-mc-monthnav="1" ${periodIdx() >= _periods.length - 1 ? 'disabled' : ''} aria-label="Período siguiente">▶</button>
      </div>
      ${sel('sala', vState.sala, salas, 'Todas las salas')}
      ${sel('tanque', vState.tanque, tanques, 'Todos los tanques')}
    </div>`;

  h += `<div class="mc-subnav">${SUBS.map((s) => `<button class="mc-pill ${vState.sub === s.key ? 'is-on' : ''}" data-mc-sub="${s.key}">${s.icon} ${esc(s.label)}</button>`).join('')}</div>`;

  h += dataWarnings(model);

  if (vState.sub === 'panorama') h += renderPanorama(model, f);
  else if (vState.sub === 'operativo') h += renderOperativo(model, f);
  else h += renderHembras(model, f);

  // Modal de historial de hembra (vacío; se rellena al abrir).
  h += `<div class="sv-modal mc-modal" id="mcFemaleModal">
      <div class="sv-modal-card mc-modal-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title" id="mcFemTitle">Historial de hembra</span>
          <button class="sv-modal-x" data-mc-fem-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body" id="mcFemBody"></div>
      </div>
    </div>`;

  root.innerHTML = h;

  // Dibujo de gráficos (tras insertar el DOM).
  if (vState.sub === 'panorama') drawPanorama(model, f);
  else if (vState.sub === 'operativo') drawOperativo(model, f);
  else drawHembras(model, f);

  bind(root);
}

/** Avisos de calidad del dato de origen. Antes ambos casos se tragaban en silencio y
 *  el usuario veía cifras raras sin saber por qué. */
function dataWarnings(model) {
  const w = [];
  const fut = model.futureEvents || [];
  if (fut.length) {
    const max = fut[fut.length - 1];
    w.push(`<div class="mc-warn">⚠️ <b>${n0(fut.length)} evento(s) con fecha futura</b> en la Bitácora/Transferencias
      (la más lejana: ${esc(String(max.fecha || ''))}${max.trovan ? ' · Trovan ' + esc(max.trovan) : ''}).
      Suele ser un año mal tecleado. La ventana de actividad se calcula desde <b>hoy</b> para que no falseen
      las hembras activas, pero conviene corregirlos en el Sheet.</div>`);
  }
  const dup = model.duplicateTrovans || [];
  if (dup.length) {
    w.push(`<div class="mc-warn">⚠️ <b>${n0(dup.length)} Trovan ID repetido(s)</b> en la hoja MATRIZ
      (${dup.slice(0, 8).map((t) => esc(t)).join(', ')}${dup.length > 8 ? `, +${n0(dup.length - 8)} más` : ''}).
      Se conserva la <b>primera</b> fila de cada uno; el resto no se cuenta.</div>`);
  }
  return w.join('');
}

function headHTML() {
  return `<div class="mc-head">
    <div class="mc-head-t"><span class="mc-head-ic">🥚</span><div>
      <h2 class="mc-title">Microchips</h2>
      <p class="mc-sub">Seguimiento reproductivo por Trovan ID — desoves, mortalidades, altas y transferencias</p>
    </div></div>
  </div>`;
}

const periodIdx = () => _periods.indexOf(vState.month);
function sel(dim, value, values, ph) {
  return `<select class="mc-select" data-mc-filter="${dim}">
    <option value="">${esc(ph)}</option>
    ${values.map((v) => `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
  </select>`;
}

/* ============================================================
   TAB · PANORAMA
   ============================================================ */
function kpiTile(label, value, sub, tone = '') {
  return `<div class="mc-kpi ${tone}"><div class="mc-kpi-lb">${esc(label)}</div><div class="mc-kpi-v">${value}</div><div class="mc-kpi-sub">${sub || ''}</div></div>`;
}

function renderPanorama(model, f) {
  const k = kpis(model, f);
  const sd = stateDistribution(model, f);
  const gran = vState.month ? 'day' : 'month';
  const topT = locationStats(model, f, 'tanque').slice(0, 6);
  const topS = locationStats(model, f, 'sala').slice(0, 6);

  const kpisHtml = `<div class="mc-kpis">
    ${kpiTile('Hembras', n0(k.totalHembras), `${n0(k.vivas)} vivas · ${n0(k.muertas)} fallecidas`)}
    ${kpiTile('Desoves', n0(k.desoves), `${n0(k.spawners)} hembras distintas`, 'is-desove')}
    ${kpiTile('Mortalidad', n0(k.mortalidad), 'eventos en el período', 'is-mort')}
    ${kpiTile('Fertilidad', pct(k.fertilidadGlobal), '% de vivas que han desovado', 'is-fert')}
    ${kpiTile('Desoves / hembra', n1(k.desovesPorHembraViva), 'productividad media', '')}
    ${kpiTile('Activas', n0(sd.activa), `en últimos ${ACTIVITY_WINDOW_DAYS} días`, 'is-fert')}
  </div>`;

  const stateLegend = FEMALE_STATES.map((s) => `<span class="mc-lg"><i style="background:${FEMALE_STATE_META[s].color}"></i>${esc(FEMALE_STATE_META[s].label)} <b>${n0(sd[s])}</b></span>`).join('');

  const stateCard = `<div class="mc-card">
    <h4 class="mc-card-h">Distribución de hembras <span class="mc-h-note">activa/inactiva/transferida/fallecida</span></h4>
    <div class="mc-chart" style="height:220px"><canvas id="mcStateDonut"></canvas></div>
    <div class="mc-legend">${stateLegend}</div>
    <p class="mc-note">Ventana de actividad = ${ACTIVITY_WINDOW_DAYS} días. Transferida = reubicada recientemente.</p>
  </div>`;

  const trendCard = `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">Tendencias — desoves, mortalidad y fertilidad <span class="mc-h-note">${gran === 'day' ? 'por día' : 'por mes'}</span></h4>
    <div class="mc-chart" style="height:260px"><canvas id="mcTrend"></canvas></div>
    <p class="mc-note">Las barras cuentan los <b>desoves donde ocurrieron</b> (la ubicación del día del evento).
      La línea de <b>fertilidad</b> se calcula sobre las hembras que <b>siguen</b> en la ubicación y estaban vivas
      en el período, así que una hembra que desovó aquí y luego se trasladó suma en las barras pero no en la línea.</p>
  </div>`;

  const topCard = (title, arr, level) => `<div class="mc-card">
    <h4 class="mc-card-h">${esc(title)}</h4>
    ${arr.length ? `<table class="mc-table mc-table-sm"><thead><tr><th>${level === 'sala' ? 'Sala' : 'Tanque'}</th><th class="r">Desoves</th><th class="r">Fertilidad</th></tr></thead>
      <tbody>${arr.map((x) => `<tr><td>${txt(level === 'sala' ? x.sala || x.key : x.key)}</td><td class="r"><b>${n0(x.desoves)}</b></td><td class="r">${pct(x.fertilidad)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty-state" style="padding:16px">Sin datos en el período.</div>'}</div>`;

  return `<div class="mc-body">
    ${kpisHtml}
    <div class="mc-grid">
      ${trendCard}
      ${stateCard}
      ${topCard('🏆 Top tanques por desoves', topT, 'tanque')}
      ${topCard('🏆 Top salas por desoves', topS, 'sala')}
    </div>
  </div>`;
}

function drawPanorama(model, f) {
  const sd = stateDistribution(model, f);
  makeChart('mcStateDonut', {
    type: 'doughnut',
    data: {
      labels: FEMALE_STATES.map((s) => FEMALE_STATE_META[s].label),
      datasets: [{ data: FEMALE_STATES.map((s) => sd[s]), backgroundColor: FEMALE_STATES.map((s) => FEMALE_STATE_META[s].color), borderWidth: 2, borderColor: 'rgba(255,255,255,.4)' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}` } } },
    },
  });
  const tr = trends(model, f, vState.month ? 'day' : 'month');
  makeChart('mcTrend', {
    data: {
      labels: tr.labels,
      datasets: [
        { type: 'bar', label: 'Desoves', data: tr.desoves, backgroundColor: C.desove + 'cc', borderColor: C.desove, borderWidth: 1, yAxisID: 'y', order: 3, maxBarThickness: 34 },
        { type: 'line', label: 'Mortalidad', data: tr.mortalidad, borderColor: C.mort, backgroundColor: C.mort, tension: .3, pointRadius: 2, borderWidth: 2, yAxisID: 'y', order: 1 },
        { type: 'line', label: 'Fertilidad %', data: tr.fertilidad, borderColor: C.fert, backgroundColor: C.fert + '22', tension: .3, pointRadius: 2, borderWidth: 2, yAxisID: 'y1', order: 0, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { ...AXIS, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, position: 'left', ticks: { ...AXIS, precision: 0 }, grid: { color: GRID }, title: { display: true, text: 'eventos', color: AXIS.color, font: { size: 10 } } },
        y1: { beginAtZero: true, max: 100, position: 'right', ticks: { ...AXIS, callback: (v) => v + '%' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'fertilidad', color: AXIS.color, font: { size: 10 } } },
      },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10, font: { size: 10 }, color: AXIS.color } } },
    },
  });
}

/* ============================================================
   TAB · SALAS Y TANQUES (operativo)
   ============================================================ */
function renderOperativo(model, f) {
  const level = vState.locLevel;
  const stats = locationStats(model, f, level);
  const mort = mortalityBreakdown(model, f);

  const toggle = `<div class="mc-seg">
    <button class="mc-seg-b ${level === 'tanque' ? 'is-on' : ''}" data-mc-level="tanque">Por tanque</button>
    <button class="mc-seg-b ${level === 'sala' ? 'is-on' : ''}" data-mc-level="sala">Por sala</button>
  </div>`;

  const rankTable = `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">Producción y eficiencia ${level === 'sala' ? 'por sala' : 'por tanque'} ${toggle}</h4>
    ${stats.length ? `<div class="mc-tablewrap"><table class="mc-table">
      <thead><tr>
        <th>#</th><th>${level === 'sala' ? 'Sala' : 'Tanque'}</th>
        <th class="r">Desoves</th><th class="r">Hembras</th><th class="r">Desovaron</th>
        <th class="r">Fertilidad</th><th class="r">Eficiencia</th><th class="r">Mortalidad</th>
      </tr></thead>
      <tbody>${stats.map((x, i) => `<tr>
        <td class="mc-rk">${i + 1}</td>
        <td><b>${txt(level === 'sala' ? x.sala || x.key : x.key)}</b></td>
        <td class="r"><b>${n0(x.desoves)}</b></td>
        <td class="r">${n0(x.hembras)}</td>
        <td class="r">${n0(x.spawners)}</td>
        <td class="r">${fertBadge(x.fertilidad)}</td>
        <td class="r">${n1(x.eficiencia)}</td>
        <td class="r">${n0(x.mortalidad)}</td>
      </tr>`).join('')}</tbody></table></div>`
    : '<div class="empty-state" style="padding:20px">Sin datos en el período.</div>'}
    <p class="mc-note">Fertilidad = hembras que desovaron ÷ hembras observadas (con evento o vivas en la ubicación). Eficiencia = desoves ÷ hembras.</p>
  </div>`;

  const prodChart = `<div class="mc-card">
    <h4 class="mc-card-h">Desoves por ${level === 'sala' ? 'sala' : 'tanque'}</h4>
    <div class="mc-chart" style="height:${Math.max(180, Math.min(stats.length, 12) * 26 + 40)}px"><canvas id="mcLocBars"></canvas></div>
  </div>`;

  const mortArr = level === 'sala' ? mort.porSala : mort.porTanque;
  const mortChart = `<div class="mc-card">
    <h4 class="mc-card-h">Mortalidad por ${level === 'sala' ? 'sala' : 'tanque'} <span class="mc-h-note">${n0(mort.total)} total</span></h4>
    ${mortArr.length ? `<div class="mc-chart" style="height:${Math.max(180, Math.min(mortArr.length, 12) * 26 + 40)}px"><canvas id="mcMortBars"></canvas></div>`
    : '<div class="empty-state" style="padding:20px">Sin mortalidades en el período.</div>'}
  </div>`;

  return `<div class="mc-body"><div class="mc-grid">${rankTable}${prodChart}${mortChart}</div></div>`;
}

function fertBadge(v) {
  const cls = v >= 70 ? 'is-good' : v >= 40 ? 'is-mid' : 'is-low';
  return `<span class="mc-fert ${cls}">${pct(v)}</span>`;
}

function drawOperativo(model, f) {
  const level = vState.locLevel;
  const stats = locationStats(model, f, level).slice(0, 12);
  const labelOf = (x) => level === 'sala' ? (x.sala || x.key) : x.key;
  if (stats.length) {
    makeChart('mcLocBars', {
      type: 'bar',
      data: { labels: stats.map(labelOf), datasets: [{ label: 'Desoves', data: stats.map((x) => x.desoves), backgroundColor: C.desove + 'cc', borderColor: C.desove, borderWidth: 1, borderRadius: 4, maxBarThickness: 20 }] },
      options: barOpts('desoves'),
    });
  }
  const mort = mortalityBreakdown(model, f);
  const mortArr = (level === 'sala' ? mort.porSala : mort.porTanque).slice(0, 12);
  if (mortArr.length) {
    makeChart('mcMortBars', {
      type: 'bar',
      data: { labels: mortArr.map((x) => x.key), datasets: [{ label: 'Mortalidad', data: mortArr.map((x) => x.n), backgroundColor: C.mort + 'cc', borderColor: C.mort, borderWidth: 1, borderRadius: 4, maxBarThickness: 20 }] },
      options: barOpts('muertes'),
    });
  }
}

function barOpts(unit) {
  return {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    scales: {
      x: { beginAtZero: true, ticks: { ...AXIS, precision: 0 }, grid: { color: GRID }, title: { display: true, text: unit, color: AXIS.color, font: { size: 10 } } },
      y: { ticks: { ...AXIS, font: { size: 10 } }, grid: { display: false } },
    },
    plugins: { legend: { display: false } },
  };
}

/* ============================================================
   TAB · HEMBRAS (individual)
   ============================================================ */
function renderHembras(model, f) {
  const ranking = femaleRanking(model, f);
  const q = vState.femSearch.trim().toUpperCase().replace(/\s+/g, '');
  const shown = q ? ranking.filter((r) => r.trovan.toUpperCase().includes(q)) : ranking;
  const never = neverSpawned(model, f);
  const rec = recoveryDistribution(model, f);

  const searchBar = `<div class="mc-searchbar">
    <input type="search" class="mc-search" id="mcSearch" placeholder="🔎 Buscar Trovan ID…" value="${esc(vState.femSearch)}" autocomplete="off">
    <button class="mc-search-go" data-mc-open-search>Ver historial</button>
    <span class="muted mc-search-hint">${n0(shown.length)} hembra(s)</span>
  </div>`;

  const rankTable = `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">Ranking de hembras por desoves ${vState.sala || vState.tanque ? '<span class="mc-h-note">filtrado por ubicación</span>' : ''}</h4>
    ${shown.length ? `<div class="mc-tablewrap"><table class="mc-table">
      <thead><tr><th>#</th><th>Trovan ID</th><th>Ubicación actual</th><th class="r">Desoves</th><th class="r">Últ. desove</th><th class="r">Interv. prom.</th><th></th></tr></thead>
      <tbody>${shown.slice(0, 200).map((r, i) => `<tr>
        <td class="mc-rk">${i + 1}</td>
        <td><button class="mc-trovan" data-mc-female="${esc(r.trovan)}">${esc(r.trovan)}</button></td>
        <td>${txt(locKey(r.sala, r.tanque))}</td>
        <td class="r"><b>${n0(r.desoves)}</b></td>
        <td class="r">${dCell(r.ultimoDesove)}</td>
        <td class="r">${r.intervaloPromedio != null ? n1(r.intervaloPromedio) + ' d' : '—'}</td>
        <td class="r"><button class="mc-mini" data-mc-female="${esc(r.trovan)}">Historial ›</button></td>
      </tr>`).join('')}</tbody></table></div>
      ${shown.length > 200 ? `<p class="mc-note">Mostrando 200 de ${n0(shown.length)}. Afina con el buscador o los filtros.</p>` : ''}`
    : '<div class="empty-state" style="padding:20px">Ninguna hembra con desoves para el filtro actual.</div>'}
  </div>`;

  const recCard = `<div class="mc-card">
    <h4 class="mc-card-h">Intervalo de recuperación entre desoves <span class="mc-h-note">prom. ${rec.promedioGlobal != null ? n1(rec.promedioGlobal) + ' d' : '—'}</span></h4>
    ${rec.intervals.length ? `<div class="mc-chart" style="height:220px"><canvas id="mcInterval"></canvas></div>
      <p class="mc-note">${n0(rec.intervals.length)} intervalo(s) de ${n0(rec.hembrasConIntervalo)} hembra(s) con ≥2 desoves.</p>`
    : '<div class="empty-state" style="padding:20px">Aún no hay hembras con dos o más desoves en el período.</div>'}
  </div>`;

  const neverCard = `<div class="mc-card">
    <h4 class="mc-card-h">Nunca han desovado <span class="mc-h-note">${n0(never.length)} hembra(s) vivas</span></h4>
    ${never.length ? `<div class="mc-chips">${never.slice(0, 60).map((r) => `<button class="mc-chip" data-mc-female="${esc(r.trovan)}" title="${esc(locKey(r.sala, r.tanque))}">${esc(r.trovan)}</button>`).join('')}</div>
      ${never.length > 60 ? `<p class="mc-note">+${n0(never.length - 60)} más.</p>` : ''}`
    : '<div class="empty-state" style="padding:20px">Todas las hembras vivas han desovado al menos una vez. 🎉</div>'}
  </div>`;

  return `<div class="mc-body">${searchBar}<div class="mc-grid">${rankTable}${recCard}${neverCard}</div></div>`;
}

function drawHembras(model, f) {
  const rec = recoveryDistribution(model, f);
  if (rec.intervals.length) {
    makeChart('mcInterval', {
      type: 'bar',
      data: { labels: rec.bins.map((b) => b.label), datasets: [{ label: 'Intervalos', data: rec.bins.map((b) => b.n), backgroundColor: C.brand + 'cc', borderColor: C.brand, borderWidth: 1, borderRadius: 4, maxBarThickness: 44 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: AXIS, grid: { display: false } },
          y: { beginAtZero: true, ticks: { ...AXIS, precision: 0 }, grid: { color: GRID }, title: { display: true, text: 'nº intervalos', color: AXIS.color, font: { size: 10 } } },
        },
        plugins: { legend: { display: false } },
      },
    });
  }
}

/* ── Modal · historial completo de una hembra (all-time) ── */
function openFemale(root, trovan) {
  const hist = femaleHistory(_model, trovan);
  const rec = hist.rec;
  const titleEl = root.querySelector('#mcFemTitle');
  const bodyEl = root.querySelector('#mcFemBody');
  if (!bodyEl) return;
  if (titleEl) titleEl.innerHTML = `🦐 Trovan <b>${esc(hist.trovan)}</b>`;

  const info = rec ? `<div class="mc-fem-info">
    ${infoCell('Estado', rec.estado)}
    ${infoCell('Ubicación', locKey(rec.sala, rec.tanque))}
    ${infoCell('Número', rec.numero)}
    ${infoCell('Color anillo', rec.color)}
    ${infoCell('Lote', rec.lote)}
    ${infoCell('Código gen.', rec.codigo)}
    ${infoCell('Piscina', rec.piscina)}
    ${infoCell('Ingreso', rec.fechaIngreso)}
    ${rec.estado === 'Muerto' ? infoCell('Fecha muerte', rec.fechaMuerte) : ''}
  </div>` : '<p class="mc-note">Esta hembra no está en la MATRIZ (solo tiene eventos en Bitácora).</p>';

  const kpisHtml = `<div class="mc-fem-kpis">
    ${kpiTile('Desoves totales', n0(hist.totalDesoves), '', 'is-desove')}
    ${kpiTile('Intervalo prom.', hist.intervaloPromedio != null ? n1(hist.intervaloPromedio) + ' d' : '—', hist.intervaloMin != null ? `mín ${hist.intervaloMin} · máx ${hist.intervaloMax}` : '')}
    ${kpiTile('Primer desove', hist.primerDesove ? fmtShort(hist.primerDesove) : '—', '')}
    ${kpiTile('Último desove', hist.ultimoDesove ? fmtShort(hist.ultimoDesove) : '—', '')}
  </div>`;

  const chart = hist.intervals.length ? `<div class="mc-card" style="margin:0 0 12px">
    <h4 class="mc-card-h">Intervalos entre desoves consecutivos</h4>
    <div class="mc-chart" style="height:180px"><canvas id="mcFemChart"></canvas></div>
  </div>` : '';

  const desoveList = hist.desoves.length ? `<div class="mc-fem-col">
    <h4 class="mc-card-h">Desoves (${n0(hist.totalDesoves)})</h4>
    <div class="mc-timeline">${hist.desoves.map((e, i) => {
    const prev = i > 0 ? Math.round((e.date - hist.desoves[i - 1].date) / 86400000) : null;
    return `<div class="mc-tl-item"><span class="mc-tl-d">${esc(fmtShort(e.date))}</span><span class="mc-tl-loc">${txt(locKey(e.sala, e.tanque))}</span>${prev != null ? `<span class="mc-tl-gap">+${prev} d</span>` : '<span class="mc-tl-gap">—</span>'}</div>`;
  }).join('')}</div>
  </div>` : '<div class="mc-fem-col"><h4 class="mc-card-h">Desoves</h4><div class="empty-state" style="padding:16px">Sin desoves registrados.</div></div>';

  const movList = `<div class="mc-fem-col">
    <h4 class="mc-card-h">Movimientos (${n0(hist.movimientos.length)})</h4>
    ${hist.movimientos.length ? `<div class="mc-timeline">${hist.movimientos.map((m) => `<div class="mc-tl-item"><span class="mc-tl-d">${dCell(m.date)}</span><span class="mc-tl-loc">${txt(locKey(m.salaOrigen, m.tanqueOrigen))} → ${txt(locKey(m.salaDestino, m.tanqueDestino))}</span><span class="mc-tl-gap">${esc(m.tipo || '')}</span></div>`).join('')}</div>`
    : '<div class="empty-state" style="padding:16px">Sin transferencias.</div>'}
    ${hist.mortalidad.length ? `<div class="mc-fem-death">☠️ Mortalidad registrada: ${hist.mortalidad.map((e) => esc(fmtShort(e.date))).join(', ')}</div>` : ''}
  </div>`;

  bodyEl.innerHTML = info + kpisHtml + chart + `<div class="mc-fem-cols">${desoveList}${movList}</div>`;

  const modal = root.querySelector('#mcFemaleModal');
  if (modal) { modal.classList.add('sv-open'); document.body.classList.add('modal-open'); }

  if (hist.intervals.length) {
    makeChart('mcFemChart', {
      type: 'bar',
      data: { labels: hist.intervals.map((_, i) => `#${i + 1}→${i + 2}`), datasets: [{ label: 'días', data: hist.intervals, backgroundColor: C.desove + 'cc', borderColor: C.desove, borderWidth: 1, borderRadius: 3, maxBarThickness: 26 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { ticks: AXIS, grid: { display: false } }, y: { beginAtZero: true, ticks: { ...AXIS, precision: 0 }, grid: { color: GRID }, title: { display: true, text: 'días', color: AXIS.color, font: { size: 10 } } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: () => '', label: (c) => ` ${c.parsed.y} días de recuperación` } } },
      },
    });
  }
}
function infoCell(label, v) {
  return `<div class="mc-fem-f"><span class="mc-fem-l">${esc(label)}</span><span class="mc-fem-v">${txt(v)}</span></div>`;
}
function closeFemale(root) {
  destroyChart('mcFemChart');
  const modal = root.querySelector('#mcFemaleModal');
  if (modal) modal.classList.remove('sv-open');
  document.body.classList.remove('modal-open');
}

/* ============================================================
   EVENTOS (delegados, una sola vez)
   ============================================================ */
function bind(root) {
  if (root._mcBound) return;
  root._mcBound = true;
  registerModalEscape('.mc-modal.sv-open');

  root.addEventListener('change', (e) => {
    const filt = e.target.closest('[data-mc-filter]');
    if (filt) {
      const dim = filt.dataset.mcFilter;
      vState[dim] = filt.value || null;
      if (dim === 'sala') vState.tanque = null;   // cascada
      maduracionView(root);
    }
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'mcSearch') { vState.femSearch = e.target.value; }
  });

  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'mcSearch' && e.key === 'Enter') {
      e.preventDefault();
      const q = vState.femSearch.trim().replace(/\s+/g, '');
      if (q) openFemale(root, q);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('mc-trovan')) {
      e.preventDefault(); openFemale(root, e.target.dataset.mcFemale);
    }
  });

  root.addEventListener('click', (e) => {
    // Sub-navegación
    const pill = e.target.closest('[data-mc-sub]');
    if (pill) { vState.sub = pill.dataset.mcSub; maduracionView(root); return; }

    // Stepper de período
    const mnav = e.target.closest('[data-mc-monthnav]');
    if (mnav && !mnav.disabled) {
      const idx = periodIdx() + Number(mnav.dataset.mcMonthnav);
      if (idx >= 0 && idx < _periods.length) { vState.month = _periods[idx]; maduracionView(root); }
      return;
    }

    // Toggle Sala/Tanque (operativo)
    const lvl = e.target.closest('[data-mc-level]');
    if (lvl) { vState.locLevel = lvl.dataset.mcLevel; maduracionView(root); return; }

    // Buscar → abrir historial del Trovan tecleado
    if (e.target.closest('[data-mc-open-search]')) {
      const q = vState.femSearch.trim().replace(/\s+/g, '');
      if (q) openFemale(root, q);
      return;
    }

    // Abrir historial de una hembra
    const fem = e.target.closest('[data-mc-female]');
    if (fem) { openFemale(root, fem.dataset.mcFemale); return; }

    // Cerrar modal
    if (e.target.closest('[data-mc-fem-close]') || e.target.matches('.mc-modal')) { closeFemale(root); return; }
  });
}
