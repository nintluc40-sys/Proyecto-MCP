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
  FEMALE_STATES, FEMALE_STATE_META, ACTIVITY_WINDOW_DAYS, TASA_DESOVE_REF, ESTADO_MUERTO, BANDAS_TASA, mapaDeSalas, calendarioDesoves, lineaDeVida, productividadPorFamilia, bandaTasa,
  buildReproModel, makeFilter, monthLabel, kpis, locationStats, femaleRanking,
  femaleHistory, neverSpawned, recoveryDistribution, stateDistribution,
  mortalityBreakdown, trends, salasOf, tanquesOf, lotesOf, codigosOf, locKey,
} from './data.js';

// ── Paleta (coherente en tema claro/oscuro; muted + grid como el resto de vistas) ──
const C = { desove: '#0f7c9a', mort: '#e0533b', fert: '#2e9e5b', brand: '#00838f', bar: '#0f7c9a' };
/* 2026-09-27 (usuario) · «los gráficos se ven borrosos, transparentosos, y no se aprecian las cantidades de los ejes».
   Medido en Chrome: los lienzos ya salen a 2x (no eran los píxeles); era el ESTILO — ejes a 10 px en gris claro, barras
   al 80 % de opacidad, cuadrícula al 16 %. Ahora: ejes a 12 px en el color de TEXTO del tema (se lee de --c-text al
   dibujar: claro u oscuro), títulos de eje a 11 px, cuadrícula al 30 % y barras sólidas (ver cada gráfico). */
function ejes() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => cs.getPropertyValue(n).trim() || d;
  const texto = v('--c-text', '#1f2a30'), suave = v('--c-text-soft', '#546e7a');
  return {
    texto, suave, fondo: v('--c-surface', '#ffffff'),
    tick: { color: texto, font: { size: 12 } },
    titulo: (text) => ({ display: true, text, color: suave, font: { size: 11, weight: '600' } }),
    grid: 'rgba(120,144,156,.3)',
  };
}

/* La cifra al final de cada barra horizontal (Desoves / Mortalidad por tanque), con el formato de la vista. Plugin en
   línea, sin librería nueva; `layout.padding.right` le deja sitio a la de la barra más larga. */
const CIFRAS = {
  id: 'mcCifras',
  afterDatasetsDraw(ch, _args, opts) {
    const c = ch.ctx, datos = ch.data.datasets[0].data;
    c.save(); c.fillStyle = opts.color; c.font = '600 12px "Segoe UI", system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    ch.getDatasetMeta(0).data.forEach((barra, i) => { if (datos[i] != null) c.fillText(n0(datos[i]), barra.x + 6, barra.y); });
    c.restore();
  },
};

const SUBS = [
  { key: 'panorama', label: 'Panorama', icon: '📊' },
  { key: 'operativo', label: 'Salas y Tanques', icon: '🏠' },
  { key: 'hembras', label: 'Hembras', icon: '🦐' },
];

const vState = { sub: 'panorama', month: null, sala: null, tanque: null, lote: null, codigo: null, locLevel: 'tanque', femSearch: '', femSel: null, trendGran: null, trendMetric: 'todas',
  /* 2026-09-27 (usuario) · el filtro rápido del ranking de hembras: 'todas' | 'vivas' | 'muertas'. */
  rankEstado: 'todas',
  /* T1 (2026-09-27, usuario) · la agrupación de «Productividad por familia»: 'codigo' | 'lote'. */
  familia: 'codigo' };

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
const diaMes = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');

/* ============================================================
   VISTA
   ============================================================ */
export function maduracionView(root) {
  if (!store.globalData.length) {
    root.innerHTML = esqueletoHTML();   // V9 · la silueta de la vista mientras cargan los datos
    return;
  }
  destroyAllCharts();
  document.body.classList.remove('modal-open');

  const model = reproModel();
  _model = model;

  const hasData = model.females.length || model.desoves.length || model.mortalidades.length;
  if (!hasData) {
    root.innerHTML = headHTML() + `<div class="empty-state" style="padding:48px 20px">
      <div style="font-size:40px">🧬</div>
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

  // Filtros de la hembra (cascada Lote → Código genético). Un código que no pertenece al
  // lote elegido se descarta, igual que un tanque que no está en la sala.
  const lotes = lotesOf(model);
  if (vState.lote && !lotes.includes(vState.lote)) { vState.lote = null; vState.codigo = null; }
  const codigos = codigosOf(model, vState.lote);
  if (vState.codigo && !codigos.includes(vState.codigo)) vState.codigo = null;

  const f = makeFilter({ sala: vState.sala, tanque: vState.tanque, lote: vState.lote, codigo: vState.codigo, month: vState.month });

  let h = headHTML();
  h += `<div class="mc-filters">
      <div class="mc-monthbar">
        <button class="mc-mnav" data-mc-monthnav="-1" ${periodIdx() <= 0 ? 'disabled' : ''} aria-label="Período anterior">◀</button>
        <span class="mc-mlbl">📅 ${esc(vState.month ? monthLabel(vState.month) : 'Todo el histórico')}</span>
        <button class="mc-mnav" data-mc-monthnav="1" ${periodIdx() >= _periods.length - 1 ? 'disabled' : ''} aria-label="Período siguiente">▶</button>
      </div>
      ${sel('sala', vState.sala, salas, 'Todas las salas')}
      ${sel('tanque', vState.tanque, tanques, 'Todos los tanques')}
      ${sel('lote', vState.lote, lotes, 'Todos los lotes')}
      ${sel('codigo', vState.codigo, codigos, 'Todos los códigos genéticos')}
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
  // Una fecha que el calendario no admite (día 32, 31 de febrero, mes 13…) se descarta al
  // parsear. Antes ni se descartaba —`new Date` la desbordaba al mes siguiente y entraba como
  // buena—, y el aviso de fechas futuras no la cazaba porque no quedaba en el futuro.
  const bad = model.invalidDates || [];
  if (bad.length) {
    const muestra = bad.slice(0, 4).map((b) => `${esc(b.hoja)} · ${esc(b.fecha)}${b.trovan ? ' (Trovan ' + esc(b.trovan) + ')' : ''}`).join('; ');
    w.push(`<div class="mc-warn">⚠️ <b>${n0(bad.length)} fecha(s) imposible(s)</b> en las hojas de origen
      (${muestra}${bad.length > 4 ? `; +${n0(bad.length - 4)} más` : ''}).
      No existen en el calendario, así que <b>esas filas no se cuentan</b> en ningún indicador.
      Corrígelas en el Sheet para recuperarlas.</div>`);
  }
  // Derivación A CIEGAS: hay eventos SIN ubicación propia y NINGUNA transferencia con la
  // que reconstruir dónde estaba la hembra, así que cada uno hereda su posición de HOY.
  // Para la que se haya movido, su historial queda contado en el tanque equivocado y las
  // cifras por sala/tanque salen mal sin un solo síntoma.
  // ⚠ La condición es DOBLE a propósito. Avisar sólo de «Transferencias está vacía» sería
  // ruido permanente: medido el 2026-08-31 contra la hoja viva, las 1.970 filas de la
  // Bitácora traen su propio Sala/Tanque, así que hoy la hoja vacía no afecta a nada y
  // este aviso NO sale. Aparece únicamente cuando la derivación entra de verdad en juego.
  const der = model.derivedEvents || 0;
  if (der > 0 && !(model.transferRowCount > 0)) {
    w.push(`<div class="mc-warn">⚠️ <b>${n0(der)} evento(s) sin Sala/Tanque propios</b> y la hoja
      <b>Maduración Transferencias</b> no tiene ninguna fila con la que reconstruir dónde estaba
      la hembra. A esos eventos se les asigna la ubicación <b>ACTUAL</b> de la MATRIZ, así que los
      de cualquier hembra que se haya movido quedan contados en el <b>tanque equivocado</b>.
      Registra los traslados en <b>Registros → Maduración → Reproductivo</b> para corregirlo.</div>`);
  }
  const dup = model.duplicateTrovans || [];
  if (dup.length) {
    /* 2026-09-18 · decía la regla del 09-14 («sólo si la anterior murió antes de que ingresara la siguiente»), y la
       identidad es la CUATERNA desde el 09-16: un chip con varios individuos es lo normal. Repetido es sólo la MISMA
       cuaterna dos veces, que es lo que marca `cadenaDelChip` (data.js). */
    w.push(`<div class="mc-warn">⚠️ <b>${n0(dup.length)} Trovan ID repetido(s)</b> en la hoja MATRIZ
      (${dup.slice(0, 8).map((t) => esc(t)).join(', ')}${dup.length > 8 ? `, +${n0(dup.length - 8)} más` : ''}).
      Un microchip puede llevar <b>varios individuos</b>: cada uno es su Trovan con su piscina, código genético y lote.
      Es un repetido sólo cuando dos filas del chip llevan la <b>misma</b> piscina, código genético y lote: la fila sobrante <b>no se cuenta</b>.</div>`);
  }
  return w.join('');
}

function headHTML() {
  return `<div class="mc-head">
    <div class="mc-head-t"><span class="mc-head-ic">🧬</span><div>
      <h2 class="mc-title">Microchips</h2>
      <p class="mc-sub">Seguimiento reproductivo por Trovan ID — desoves, mortalidades, altas y transferencias</p>
    </div></div>
  </div>`;
}

const periodIdx = () => _periods.indexOf(vState.month);
/** Nota «filtrado por …» del ranking: dice QUÉ filtros de la hembra están puestos. */
function rankNote() {
  const partes = [];
  if (vState.sala || vState.tanque) partes.push('ubicación');
  if (vState.lote) partes.push('lote');
  if (vState.codigo) partes.push('código genético');
  return partes.length ? `<span class="mc-h-note">filtrado por ${esc(partes.join(', '))}</span>` : '';
}
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

/** Parámetros del gráfico de Tendencias, independientes del stepper global:
 *  granularidad (Mes/Día, con auto por defecto), mes enfocado en modo diario
 *  (el elegido o, en "Todo el histórico", el más reciente con datos), filtro
 *  propio y métrica aislada. Compartido por render (cabecera) y draw (chart). */
function trendCtx(model) {
  const latestMonth = model.months.length ? model.months[model.months.length - 1] : null;
  const effGran = vState.trendGran ?? (vState.month ? 'dia' : 'mes');
  const trendMonth = effGran === 'dia' ? (vState.month || latestMonth) : null;
  const ftrend = makeFilter({ sala: vState.sala, tanque: vState.tanque, lote: vState.lote, codigo: vState.codigo, month: trendMonth });
  return { effGran, trendMonth, ftrend, gran: effGran === 'dia' ? 'day' : 'month', metric: vState.trendMetric || 'todas' };
}

/** HTML de la tarjeta de Tendencias (cabecera + controles + canvas). Extraído para
 *  poder refrescar SOLO esta tarjeta sin re-renderizar el resto del Panorama (que
 *  redibujaría innecesariamente el donut de Distribución de hembras). */
function trendCardHTML(model) {
  const tc = trendCtx(model);
  const METRICS = [['todas', 'Todas'], ['desoves', 'Desoves'], ['mortalidad', 'Mortalidad'], ['fertilidad', 'Fertilidad']];
  const granSeg = `<div class="mc-seg mc-seg-sm">
    <button class="mc-seg-b ${tc.effGran === 'mes' ? 'is-on' : ''}" data-mc-trendgran="mes">📆 Mes</button>
    <button class="mc-seg-b ${tc.effGran === 'dia' ? 'is-on' : ''}" data-mc-trendgran="dia">📅 Día</button>
  </div>`;
  const metricSeg = `<div class="mc-seg mc-seg-sm">
    ${METRICS.map(([id, lbl]) => `<button class="mc-seg-b ${tc.metric === id ? 'is-on' : ''}" data-mc-trendmetric="${id}">${lbl}</button>`).join('')}
  </div>`;
  const trendNote = tc.effGran === 'dia' ? `por día${tc.trendMonth ? ' · ' + esc(monthLabel(tc.trendMonth)) : ''}` : 'por mes';
  return `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">Tendencias — desoves, mortalidad y fertilidad <span class="mc-h-note">${trendNote}</span></h4>
    <div class="mc-trend-controls">
      <span class="mc-ctl-lbl">Granularidad</span>${granSeg}
      <span class="mc-ctl-lbl">Métrica</span>${metricSeg}
    </div>
    <div class="mc-chart" style="height:260px"><canvas id="mcTrend"></canvas></div>
    <p class="mc-note">Las barras cuentan los <b>desoves donde ocurrieron</b> (la ubicación del día del evento).
      La línea de <b>fertilidad</b> se calcula sobre las hembras que <b>siguen</b> en la ubicación y estaban vivas
      en el período, así que una hembra que desovó aquí y luego se trasladó suma en las barras pero no en la línea.</p>
  </div>`;
}

function renderPanorama(model, f) {
  const k = kpis(model, f);
  const sd = stateDistribution(model, f);
  const topT = locationStats(model, f, 'tanque').slice(0, 6);
  const topS = locationStats(model, f, 'sala').slice(0, 6);

  const kpisHtml = `<div class="mc-kpis">
    ${kpiTile('Hembras', n0(k.totalHembras), `${n0(k.vivas)} vivas · ${n0(k.muertas)} fallecidas`)}
    ${kpiTile('Desoves', n0(k.desoves), `${n0(k.spawners)} hembras distintas`, 'is-desove')}
    ${kpiTile('Mortalidad', n0(k.mortalidad), 'eventos en el período', 'is-mort')}
    ${kpiTile('Fertilidad', pct(k.fertilidadGlobal), f.from ? '% de las vivas del mes que desovaron' : '% de vivas que han desovado', 'is-fert')}
    ${kpiTile('Tasa de desove', tasaBadge(k.tasaDesove), `% de hembras por noche · ref. ${TASA_DESOVE_REF.referencia}`, 'is-desove')}
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

  const trendCard = trendCardHTML(model);

  const topCard = (title, arr, level) => `<div class="mc-card">
    <h4 class="mc-card-h">${esc(title)}</h4>
    ${arr.length ? `<table class="mc-table mc-table-sm"><thead><tr><th>${level === 'sala' ? 'Sala' : 'Tanque'}</th><th class="r">Desoves</th><th class="r" title="% de sus hembras que desovaron en el período">Fertilidad</th><th class="r" title="% de sus hembras que desovan cada noche">Tasa/noche</th></tr></thead>
      <tbody>${arr.map((x) => `<tr><td>${txt(level === 'sala' ? x.sala || x.key : x.key)}</td><td class="r">${barra(x.desoves, maxDe(arr, 'desoves'))}</td><td class="r">${pct(x.fertilidad)}</td><td class="r">${tasaBadge(x.tasaDesove)}</td></tr>`).join('')}</tbody></table>`
    : vacioHTML('Sin desoves en este filtro')}</div>`;

  return `<div class="mc-body">
    ${kpisHtml}
    <div class="mc-grid">
      ${trendCard}
      ${stateCard}
      ${topCard('🏆 Top tanques por desoves', topT, 'tanque')}
      ${topCard('🏆 Top salas por desoves', topS, 'sala')}
      ${familiasHTML(model, f)}
    </div>
  </div>`;
}

function drawPanorama(model, f) {
  const sd = stateDistribution(model, f);
  const E = ejes();
  makeChart('mcStateDonut', {
    type: 'doughnut',
    data: {
      labels: FEMALE_STATES.map((s) => FEMALE_STATE_META[s].label),
      datasets: [{ data: FEMALE_STATES.map((s) => sd[s]), backgroundColor: FEMALE_STATES.map((s) => FEMALE_STATE_META[s].color), borderWidth: 2, borderColor: E.fondo }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}` } } },
    },
  });
  drawTrend(model);
}

/** Dibuja SOLO el gráfico de Tendencias (#mcTrend) según trendCtx. Separado para el
 *  refresco parcial de los controles Mes/Día/Métrica. */
function drawTrend(model) {
  const tc = trendCtx(model);
  const tr = trends(model, tc.ftrend, tc.gran);
  const m = tc.metric;
  const showDes = m === 'todas' || m === 'desoves';
  const showMor = m === 'todas' || m === 'mortalidad';
  const showFer = m === 'todas' || m === 'fertilidad';
  const E = ejes();
  const datasets = [];
  if (showDes) datasets.push({ type: 'bar', label: 'Desoves', data: tr.desoves, backgroundColor: C.desove, borderWidth: 0, yAxisID: 'y', order: 3, maxBarThickness: 34 });
  if (showMor) datasets.push({ type: 'line', label: 'Mortalidad', data: tr.mortalidad, borderColor: C.mort, backgroundColor: C.mort, tension: 0, pointRadius: 3.5, borderWidth: 2.5, yAxisID: 'y', order: 1 });
  if (showFer) datasets.push({ type: 'line', label: 'Fertilidad %', data: tr.fertilidad, borderColor: C.fert, backgroundColor: C.fert, tension: 0, pointRadius: 3.5, borderWidth: 2.5, yAxisID: 'y1', order: 0, fill: false });
  makeChart('mcTrend', {
    data: { labels: tr.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { ...E.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        // El eje "eventos" solo aparece si hay una serie de eventos (Desoves/Mortalidad);
        // el de fertilidad solo con la línea de Fertilidad — así aislar una métrica no
        // deja un eje huérfano sin datos.
        y: { display: showDes || showMor, beginAtZero: true, position: 'left', ticks: { ...E.tick, precision: 0 }, grid: { color: E.grid }, title: E.titulo('eventos') },
        y1: { display: showFer, beginAtZero: true, max: 100, position: 'right', ticks: { ...E.tick, callback: (v) => v + '%' }, grid: { drawOnChartArea: false }, title: E.titulo('fertilidad') },
      },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10, font: { size: 12 }, color: E.texto } } },
    },
  });
}

/** Refresco PARCIAL de la tarjeta de Tendencias (controles Mes/Día/Métrica): reemplaza
 *  solo esa tarjeta y redibuja únicamente #mcTrend, sin re-renderizar el Panorama ni
 *  redibujar el donut de Distribución de hembras (que antes parpadeaba en cada clic). */
function refreshTrend(root) {
  if (!_model) return;
  const card = root.querySelector('#mcTrend')?.closest('.mc-card');
  if (!card) return;
  destroyChart('mcTrend');                 // destruye el chart viejo (canvas aún en el DOM)
  const tmp = document.createElement('div');
  tmp.innerHTML = trendCardHTML(_model);
  card.replaceWith(tmp.firstElementChild); // canvas nuevo (mismo id)
  drawTrend(_model);
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
        <th class="r" title="% de sus hembras que desovaron en el período">Fertilidad</th><th class="r" title="% de sus hembras que desovan cada noche">Tasa/noche</th><th class="r">Eficiencia</th><th class="r">Mortalidad</th>
      </tr></thead>
      <tbody>${stats.map((x, i) => `<tr>
        <td class="mc-rk">${i + 1}</td>
        <td><b>${txt(level === 'sala' ? x.sala || x.key : x.key)}</b></td>
        <td class="r">${barra(x.desoves, maxDe(stats, 'desoves'))}</td>
        <td class="r">${n0(x.hembras)}</td>
        <td class="r">${n0(x.spawners)}</td>
        <td class="r">${fertBadge(x.fertilidad)}</td>
        <td class="r">${tasaBadge(x.tasaDesove)}</td>
        <td class="r">${n1(x.eficiencia)}</td>
        <td class="r">${barra(x.mortalidad, maxDe(stats, 'mortalidad'), ' is-mort')}</td>
      </tr>`).join('')}</tbody></table></div>`
    : vacioHTML('Sin datos de producción en este filtro')}
    <p class="mc-note">Fertilidad = % de las hembras observadas (con evento o vivas en la ubicación) que desovaron en el período: a lo largo de meses tiende al 100 %. Tasa/noche = desoves ÷ noches que sus hembras estuvieron vivas en el período (ref. ${TASA_DESOVE_REF.referencia}). Eficiencia = desoves ÷ hembras. Un tanque es sala + número.</p>
  </div>`;

  const prodChart = `<div class="mc-card">
    <h4 class="mc-card-h">Desoves por ${level === 'sala' ? 'sala' : 'tanque'}</h4>
    <div class="mc-chart" style="height:${Math.max(180, Math.min(stats.length, 12) * 26 + 40)}px"><canvas id="mcLocBars"></canvas></div>
  </div>`;

  const mortArr = level === 'sala' ? mort.porSala : mort.porTanque;
  const mortChart = `<div class="mc-card">
    <h4 class="mc-card-h">Mortalidad por ${level === 'sala' ? 'sala' : 'tanque'} <span class="mc-h-note">${n0(mort.total)} total</span></h4>
    ${mortArr.length ? `<div class="mc-chart" style="height:${Math.max(180, Math.min(mortArr.length, 12) * 26 + 40)}px"><canvas id="mcMortBars"></canvas></div>`
    : vacioHTML('Sin mortalidades en este filtro', { icono: '✅' })}
  </div>`;

  return `<div class="mc-body"><div class="mc-grid">${mapaSalasHTML(model, f)}${calendarioHTML(model, f)}${rankTable}${prodChart}${mortChart}</div></div>`;
}

/* V2 (2026-09-27, usuario) · el calendario de desoves: tanque × día, con la intensidad del Nº de desoves de cada noche
   (`--mc-cal-a`, de 0 a 1 sobre el máximo de su fila de referencia) y los días sin NINGÚN desove en la granja rayados.
   Con un mes, la cifra va dentro de la celda; en todo el histórico sólo el color (la cifra, al pasar el ratón). */
function calendarioHTML(model, f) {
  const c = calendarioDesoves(model, f);
  if (!c.dias.length) return '';
  const conCifra = c.dias.length <= 31;
  const dma = (k) => k.slice(8, 10) + '/' + k.slice(5, 7) + '/' + k.slice(0, 4);
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hueco = (i) => (c.huecos[i] ? ' is-hueco' : '');
  const celda = (quien, n, i, max) => {
    const a = n && max ? Math.round((0.18 + 0.82 * (n / max)) * 100) / 100 : 0;
    return `<td class="${n ? '' : 'is-0'}${hueco(i)}${a >= 0.6 ? ' is-alto' : ''}"${n ? ` style="--mc-cal-a:${a}"` : ''} title="${esc(quien)} · ${dma(c.dias[i])}: ${n} desove${n === 1 ? '' : 's'}">${conCifra && n ? n : ''}</td>`;
  };
  const cab = c.dias.map((k, i) => { const d = +k.slice(8, 10); return `<th class="mc-cal-d${hueco(i)}" title="${dma(k)}">${d === 1 || i === 0 ? `<span class="mc-cal-m">${MES[+k.slice(5, 7) - 1]}</span>` : ''}${d}</th>`; }).join('');
  const fila = (quien, ns, max, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th>${esc(quien)}</th>${ns.map((n, i) => celda(quien, n, i, max)).join('')}</tr>`;
  const nH = c.huecos.filter(Boolean).length;
  return `<div class="mc-card mc-card-wide mc-cal-card">
    <h4 class="mc-card-h">📅 Calendario de desoves <span class="mc-h-note">Nº de desoves por noche y tanque</span></h4>
    <div class="mc-cal-wrap"><table class="mc-cal${conCifra ? '' : ' is-compacto'}"><thead><tr><th></th>${cab}</tr></thead><tbody>
      ${fila('Granja', c.granja, c.maxGranja, 'mc-cal-granja')}${c.filas.map((r) => fila(r.key, r.n, c.max)).join('')}
    </tbody></table></div>
    <p class="mc-note mc-cal-nota">${nH ? `<b>${n0(nH)} de ${n0(c.dias.length)} días sin ningún desove en la granja</b> (rayados): huecos del registro o noches sin desoves. ` : ''}La fila Granja es el total de todos los tanques; la intensidad de cada fila se mide contra el máximo de los tanques.</p>
  </div>`;
}

/* V1 (2026-09-27, usuario) · el mapa de salas: cada tanque FÍSICO en su banda de tasa por noche (4 bandas con la
   referencia 5–15 % y gris sin hembras con chip). Sigue el mes, el lote y el código; un clic filtra la vista por ese
   tanque y otro clic en el mismo lo quita. Los grises no se pulsan: el filtro no tendría nada que enseñar. */
function mapaSalasHTML(model, f) {
  const mapa = mapaDeSalas(model, f);
  const tile = (s, t) => {
    const sel = !!t.filtro && vState.sala === t.filtro.sala && vState.tanque === t.filtro.tanque;
    const tit = t.filtro ? `${s.sala} · Tanque ${t.num}: ${n1(t.tasa)} % por noche (${n0(t.desoves)} desoves en ${n0(t.hembrasNoche)} hembras-noche)`
      : `${s.sala} · Tanque ${t.num}: sin hembras con chip en el período`;
    return `<button type="button" class="mc-mapa-tq is-b-${t.banda}${sel ? ' is-sel' : ''}${t.fueraDeCatalogo ? ' is-extra' : ''}" data-mc-mapa="${esc(s.sala + '|' + t.num)}"`
      + `${t.filtro ? '' : ' disabled'} aria-pressed="${sel}" title="${esc(tit + (t.fueraDeCatalogo ? ' · fuera del catálogo de tanques' : ''))}">`
      + `<span class="mc-mapa-n">T${t.num}</span> <span class="mc-mapa-v">${t.filtro ? n1(t.tasa) + ' %' : '—'}</span></button>`;
  };
  const salas = mapa.map((s) => `<div class="mc-mapa-sala"><div class="mc-mapa-sala-h">${esc(s.sala)}</div>
    <div class="mc-mapa-tqs">${s.tanques.map((t) => tile(s, t)).join('')}</div></div>`).join('');
  const leyenda = BANDAS_TASA.map((b) => `<span class="mc-mapa-lg"><i class="mc-mapa-sw is-b-${b.clave}"></i>${esc(b.etiqueta)}</span>`).join('');
  return `<div class="mc-card mc-card-wide mc-mapa-card">
    <h4 class="mc-card-h">🗺 Mapa de salas · tasa de desove por noche <span class="mc-h-note">pulsa un tanque para filtrar la vista</span></h4>
    <div class="mc-mapa">${salas}</div>
    <div class="mc-mapa-ley">${leyenda}</div>
  </div>`;
}

/** La tasa de desove por noche con su semáforo contra la referencia (5–15 %): baja, dentro o por encima. */
function tasaBadge(v) {
  if (v == null || isNaN(v)) return '<span class="muted">—</span>';
  const cls = v < TASA_DESOVE_REF.min ? 'is-low' : v > TASA_DESOVE_REF.max ? 'is-mid' : 'is-good';
  return `<span class="mc-fert ${cls}" title="ref. ${TASA_DESOVE_REF.referencia}">${pct(v)}</span>`;
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
      data: { labels: stats.map(labelOf), datasets: [{ label: 'Desoves', data: stats.map((x) => x.desoves), backgroundColor: C.desove, borderWidth: 0, borderRadius: 4, maxBarThickness: 20 }] },
      plugins: [CIFRAS],
      options: barOpts('desoves'),
    });
  }
  const mort = mortalityBreakdown(model, f);
  const mortArr = (level === 'sala' ? mort.porSala : mort.porTanque).slice(0, 12);
  if (mortArr.length) {
    makeChart('mcMortBars', {
      type: 'bar',
      data: { labels: mortArr.map((x) => x.key), datasets: [{ label: 'Mortalidad', data: mortArr.map((x) => x.n), backgroundColor: C.mort, borderWidth: 0, borderRadius: 4, maxBarThickness: 20 }] },
      plugins: [CIFRAS],
      options: barOpts('muertes'),
    });
  }
}

function barOpts(unit) {
  const E = ejes();
  return {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    layout: { padding: { right: 40 } },
    scales: {
      x: { beginAtZero: true, ticks: { ...E.tick, precision: 0 }, grid: { color: E.grid }, title: E.titulo(unit) },
      y: { ticks: E.tick, grid: { display: false } },
    },
    plugins: { legend: { display: false }, mcCifras: { color: E.texto } },
  };
}

/* ============================================================
   TAB · HEMBRAS (individual)
   ============================================================ */
function renderHembras(model, f) {
  const ranking = femaleRanking(model, f);
  const q = vState.femSearch.trim().toUpperCase().replace(/\s+/g, '');
  const buscadas = q ? ranking.filter((r) => r.trovan.toUpperCase().includes(q)) : ranking;
  /* 2026-09-27 (usuario) · las muertas, a primera vista: su fila atenuada, «✝ muerta dd/mm» junto al Trovan, y este filtro. */
  const esMuerta = (r) => r.estado === ESTADO_MUERTO;
  const cuentaEstado = { todas: buscadas.length, vivas: buscadas.filter((r) => !esMuerta(r)).length, muertas: buscadas.filter(esMuerta).length };
  if (!(vState.rankEstado in cuentaEstado)) vState.rankEstado = 'todas';
  const shown = vState.rankEstado === 'vivas' ? buscadas.filter((r) => !esMuerta(r)) : vState.rankEstado === 'muertas' ? buscadas.filter(esMuerta) : buscadas;
  const segEstado = `<div class="mc-seg mc-rank-seg">${[['todas', 'Todas'], ['vivas', 'Vivas'], ['muertas', '✝ Muertas']].map(([k, l]) => `<button class="mc-seg-b ${vState.rankEstado === k ? 'is-on' : ''}" data-mc-rankestado="${k}" aria-pressed="${vState.rankEstado === k}">${l} <b>${n0(cuentaEstado[k])}</b></button>`).join('')}</div>`;
  const never = neverSpawned(model, f);
  const rec = recoveryDistribution(model, f);

  const searchBar = `<div class="mc-searchbar">
    <input type="search" class="mc-search" id="mcSearch" placeholder="🔎 Buscar Trovan ID…" value="${esc(vState.femSearch)}" autocomplete="off">
    <button class="mc-search-go" data-mc-open-search>Ver historial</button>
    <span class="muted mc-search-hint">${n0(shown.length)} hembra(s)</span>
  </div>`;

  const rankTable = `<div class="mc-card mc-card-wide">
    <h4 class="mc-card-h">Ranking de hembras por desoves ${rankNote()} ${segEstado}</h4>
    ${shown.length ? `<div class="mc-tablewrap"><table class="mc-table">
      <thead><tr><th>#</th><th>Trovan ID</th><th>Ubicación actual</th><th class="r">Desoves</th><th class="r">Últ. desove</th><th class="r">Interv. prom.</th><th></th></tr></thead>
      <tbody>${shown.slice(0, 200).map((r, i) => `<tr${esMuerta(r) ? ' class="mc-rank-muerta"' : ''}>
        <td class="mc-rk">${i + 1}</td>
        <td>${chipAnillo(r.color)}<button class="mc-trovan" data-mc-female="${esc(r.trovan)}">${esc(r.trovan)}</button>${esMuerta(r) ? ` <span class="mc-muerta" title="Murió el ${esc(r.muerte ? fmtShort(r.muerte) : 'día sin registrar')}">✝ muerta${r.muerte ? ' ' + diaMes(r.muerte) : ''}</span>` : ''}</td>
        <td>${txt(locKey(r.sala, r.tanque))}</td>
        <td class="r">${barra(r.desoves, maxDe(shown.slice(0, 200), 'desoves'))}</td>
        <td class="r">${dCell(r.ultimoDesove)}</td>
        <td class="r">${r.intervaloPromedio != null ? n1(r.intervaloPromedio) + ' d' : '—'}</td>
        <td class="r"><button class="mc-mini" data-mc-female="${esc(r.trovan)}">Historial ›</button></td>
      </tr>`).join('')}</tbody></table></div>
      ${shown.length > 200 ? `<p class="mc-note">Mostrando 200 de ${n0(shown.length)}. Afina con el buscador o los filtros.</p>` : ''}`
    : vacioHTML(vState.rankEstado === 'todas' ? 'Ninguna hembra con desoves en este filtro' : 'Ninguna hembra ' + (vState.rankEstado === 'vivas' ? 'viva' : 'muerta') + ' con desoves en este filtro',
      { extra: vState.rankEstado === 'todas' ? [] : [vState.rankEstado === 'vivas' ? 'Vivas' : 'Muertas'] })}
  </div>`;

  const recCard = `<div class="mc-card">
    <h4 class="mc-card-h">Intervalo de recuperación entre desoves</h4>
    ${rec.intervals.length ? `<div class="mc-rec-hl">Vuelven a desovar en <b class="mc-rec-v">${n1(rec.promedioGlobal)} días</b> de promedio</div>
      <p class="mc-rec-sub">mediana ${n1(rec.mediana)} · la mitad entre ${n1(rec.p25)} y ${n1(rec.p75)} días</p>
      <div class="mc-chart" style="height:220px"><canvas id="mcInterval"></canvas></div>
      <p class="mc-note">${n0(rec.intervals.length)} intervalo(s) de ${n0(rec.hembrasConIntervalo)} hembra(s) con ≥2 desoves.</p>`
    : vacioHTML('Aún no hay hembras con dos o más desoves', { icono: '⏳' })}
  </div>`;

  const neverCard = `<div class="mc-card">
    <h4 class="mc-card-h">Nunca han desovado <span class="mc-h-note">${n0(never.length)} hembra(s) vivas</span></h4>
    ${never.length ? `<div class="mc-chips">${never.slice(0, 60).map((r) => `<button class="mc-chip" data-mc-female="${esc(r.trovan)}" title="${esc(locKey(r.sala, r.tanque))}">${chipAnillo(r.color)}${esc(r.trovan)}</button>`).join('')}</div>
      ${never.length > 60 ? `<p class="mc-note">+${n0(never.length - 60)} más.</p>` : ''}`
    : vacioHTML('Todas las hembras vivas han desovado al menos una vez', { icono: '🎉', conFiltros: false })}
  </div>`;

  return `<div class="mc-body">${searchBar}<div class="mc-grid">${rankTable}${recCard}${neverCard}</div></div>`;
}

/* 2026-09-27 (usuario) · líneas verticales de referencia en un histograma POR DÍA (el promedio y la mediana del
   intervalo). La barra i es el día i+1 (la primera, «≤ 1»; la última, «≥ 15»), así que el valor v cae en la posición
   v − 1 del eje, entre dos barras si no es entero. Sin dependencias: un plugin de Chart.js en línea. */
const LINEAS_REF = {
  id: 'mcLineasRef',
  afterDatasetsDraw(ch, _args, opts) {
    const x = ch.scales.x, y = ch.scales.y, c = ch.ctx, ult = ch.data.labels.length - 1;
    (opts.lineas || []).forEach((l, k) => {
      if (l.valor == null) return;
      const i = Math.min(ult, Math.max(0, l.valor - 1)), lo = Math.floor(i), hi = Math.min(lo + 1, ult);
      const px = x.getPixelForValue(lo) + (x.getPixelForValue(hi) - x.getPixelForValue(lo)) * (i - lo);
      c.save(); c.strokeStyle = l.color; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(px, y.top); c.lineTo(px, y.bottom); c.stroke();
      // El rótulo, AL LADO de su línea y no encima (la línea lo tachaba): el primero a la derecha, el segundo a la izquierda.
      const izq = k % 2 === 1;
      c.setLineDash([]); c.fillStyle = l.color; c.font = '700 11px system-ui, sans-serif'; c.textAlign = izq ? 'right' : 'left';
      c.fillText(l.etiqueta + ' ' + n1(l.valor), px + (izq ? -4 : 4), y.top + 11); c.restore();
    });
  },
};

function drawHembras(model, f) {
  const rec = recoveryDistribution(model, f);
  const E = ejes();
  if (rec.intervals.length) {
    makeChart('mcInterval', {
      type: 'bar',
      data: { labels: rec.porDia.map((b) => b.label), datasets: [{ label: 'Intervalos', data: rec.porDia.map((b) => b.n), backgroundColor: C.brand, borderWidth: 0, borderRadius: 4, maxBarThickness: 44 }] },
      plugins: [LINEAS_REF],
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: E.tick, grid: { display: false }, title: E.titulo('días hasta el siguiente desove') },
          y: { beginAtZero: true, ticks: { ...E.tick, precision: 0 }, grid: { color: E.grid }, title: E.titulo('nº intervalos') },
        },
        plugins: { legend: { display: false },
          mcLineasRef: { lineas: [{ valor: rec.promedioGlobal, etiqueta: 'prom.', color: C.brand }, { valor: rec.mediana, etiqueta: 'mediana', color: C.mort }] } },
      },
    });
  }
}

/* T1 (2026-09-27, usuario) · productividad por familia: una fila por código genético (o lote), ordenada por tasa por
   noche (con las bandas de V1), con sus «otros» (lotes del código o códigos del lote) y el PERÍODO en que desovó. */
function familiasHTML(model, f) {
  const campo = vState.familia === 'lote' ? 'lote' : 'codigo';
  const t = productividadPorFamilia(model, f, campo);
  const seg = `<div class="mc-seg">${[['codigo', 'Código genético'], ['lote', 'Lote']].map(([k, l]) =>
    `<button type="button" class="mc-seg-b${campo === k ? ' is-on' : ''}" data-mc-familia="${k}" aria-pressed="${campo === k}">${l}</button>`).join('')}</div>`;
  const dm = (d) => (d ? diaMes(d) : '');
  const cuerpo = t.length ? `<div class="mc-tablewrap"><table class="mc-table"><thead><tr>
      <th>${campo === 'lote' ? 'Lote' : 'Código genético'}</th><th class="r">Hembras</th><th class="r">Muertas</th><th class="r" title="% de sus hembras que desovaron">Fertilidad</th>
      <th class="r">Desoves</th><th class="r">Des./hembra</th><th class="r" title="noches que sus hembras estuvieron vivas en el período">Hembras-noche</th><th class="r" title="ref. ${TASA_DESOVE_REF.referencia}">Tasa/noche</th><th class="r">Período</th>
    </tr></thead><tbody>${t.map((x) => `<tr>
      <td><b>${esc(x.familia)}</b>${x.otros.length ? ` <span class="mc-fam-otros">· ${esc(x.otros.join(', '))}</span>` : ''}</td>
      <td class="r">${n0(x.hembras)}</td><td class="r">${n0(x.muertas)}</td><td class="r">${fertBadge(x.fertilidad)}</td>
      <td class="r">${barra(x.desoves, maxDe(t, 'desoves'))}</td><td class="r">${n1(x.desovesPorHembra)}</td><td class="r">${n0(x.hembrasNoche)}</td>
      <td class="r">${x.tasa == null ? '<span class="muted">—</span>' : `<span class="mc-tasa-b is-b-${bandaTasa(x.tasa)}">${n1(x.tasa)} %</span>`}</td>
      <td class="r">${x.desde ? `${dm(x.desde)}–${dm(x.hasta)}` : '—'}</td>
    </tr>`).join('')}</tbody></table></div>
    <p class="mc-note">Tasa/noche = desoves ÷ noches que sus hembras estuvieron vivas en el período (ref. ${TASA_DESOVE_REF.referencia}). Las familias no tienen por qué haber coincidido en el tiempo: compara la tasa mirando también su período.</p>`
    : vacioHTML('Sin hembras en este filtro');
  return `<div class="mc-card mc-card-wide mc-fam-card"><h4 class="mc-card-h">🧬 Productividad por familia ${seg}</h4>${cuerpo}</div>`;
}

/* V9 (2026-09-27, usuario) · la silueta de la vista mientras cargan los datos (cabecera, 7 KPI y 2 tarjetas, con un
   brillo que se apaga con «menos movimiento»); el texto, para lectores de pantalla. */
function esqueletoHTML() {
  const kpi = '<div class="mc-sk-kpi"><i></i><i></i></div>';
  return `<div class="mc-sk" aria-busy="true"><span class="mc-sr">Cargando datos del Registro Reproductivo…</span>
    <div class="mc-sk-head"><i></i><i></i></div><div class="mc-sk-kpis">${kpi.repeat(7)}</div>
    <div class="mc-sk-card"><i></i><i></i><i></i></div><div class="mc-sk-card"><i></i><i></i></div></div>`;
}
/* V9 · los filtros activos, en palabras: el PORQUÉ de un estado vacío. */
function filtrosActivos() {
  return [vState.month ? monthLabel(vState.month) : '', vState.sala || '', vState.tanque || '',
    vState.lote ? 'Lote ' + vState.lote : '', vState.codigo ? 'Código ' + vState.codigo : ''].filter(Boolean);
}
/* V9 · un estado vacío: icono, qué falta, por qué (los filtros activos y `extra`) y, si hay filtros, «Quitar filtros».
   `conFiltros: false` para lo que no depende de un filtro (el historial de una hembra, un logro). */
function vacioHTML(que, { icono = '🔍', conFiltros = true, extra = [] } = {}) {
  const porque = conFiltros ? [...filtrosActivos(), ...extra] : [];
  return `<div class="mc-vacio"><div class="mc-vacio-i" aria-hidden="true">${icono}</div><p class="mc-vacio-t">${esc(que)}</p>`
    + (porque.length ? `<p class="mc-vacio-f">${esc(porque.join(' · '))}</p><button type="button" class="mc-mini" data-mc-limpiar>Quitar filtros</button>` : '')
    + '</div>';
}

/* V5 (2026-09-27, usuario) · la línea de vida: una franja del ingreso a la muerte (o al último dato), en tramos por
   ubicación, con un punto por desove, ⇄ en cada traslado, ✝ al morir y los meses debajo (el título de cada marca da su
   fecha). HTML con posiciones en % (no SVG: estirado a lo ancho deformaba textos y puntos en pantallas estrechas). El
   período cuenta días ENTEROS: el último día tiene ancho y cada desove cae en el centro de su día. */
function lineaVidaHTML(lv) {
  if (!lv) return '';
  const DIA = 864e5, fin1 = new Date(lv.fin.getFullYear(), lv.fin.getMonth(), lv.fin.getDate() + 1), span = fin1 - lv.inicio;
  const p = (d) => Math.round(((d - lv.inicio) / span) * 100000) / 1000;   // % del período, 3 decimales
  const medioDia = Math.round((DIA / span) * 50000) / 1000;
  const dm = diaMes;
  const dma = (d) => dm(d) + '/' + d.getFullYear();
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const ult = lv.tramos.length - 1;
  const tramos = lv.tramos.map((t, i) => {
    const x0 = p(t.desde), w = Math.round((p(i === ult ? fin1 : t.hasta) - x0) * 1000) / 1000;
    return `<div class="mc-lv-tramo ${i % 2 ? 'is-b' : 'is-a'}" data-etiqueta="${esc(t.etiqueta)}" data-x="${x0}" data-w="${w}" style="left:${x0}%;width:${w}%"`
      + ` title="${esc(t.etiqueta)}: ${dma(t.desde)} → ${dma(t.hasta)}"><span>${esc(t.etiqueta)}</span></div>`;
  }).join('');
  const desoves = lv.desoves.map((e) => { const x = Math.round((p(dia0Local(e.date)) + medioDia) * 1000) / 1000;
    return `<i class="mc-lv-desove" data-x="${x}" style="left:${x}%" title="Desove ${dma(e.date)} · ${esc(locKey(e.sala, e.tanque))}"></i>`; }).join('');
  const lado = (x) => (x > 88 ? ' is-der' : x < 12 ? ' is-izq' : '');
  const traslados = lv.traslados.map((t) => { const x = p(t.date);
    return `<span class="mc-lv-traslado${lado(x)}" data-x="${x}" style="left:${x}%" title="Traslado ${dma(t.date)}: ${esc(t.de)} → ${esc(t.a)}"><b>⇄ ${dm(t.date)}</b></span>`; }).join('');
  const muerte = lv.muerte ? `<span class="mc-lv-muerte" style="left:100%" title="Muerte ${dma(lv.muerte)}">✝</span>` : '';
  const meses = [];
  for (let d = new Date(lv.inicio.getFullYear(), lv.inicio.getMonth() + 1, 1); d <= lv.fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    meses.push(`<span class="mc-lv-mes" style="left:${p(d)}%">${MES[d.getMonth()]}</span>`);
  }
  return `<div class="mc-lv"><div class="mc-lv-h">Línea de vida <span class="mc-h-note">${n0(lv.dias)} días · ${n0(lv.desoves.length)} desoves · ${n0(lv.traslados.length)} traslado(s)</span></div>
    <div class="mc-lv-ext"><span>▶ ${dm(lv.inicio)}</span><span>${lv.vive ? 'último dato ' + dm(lv.fin) : '✝ ' + dm(lv.fin)}</span></div>
    <div class="mc-lv-pista">${traslados}<div class="mc-lv-franja">${tramos}${desoves}${muerte}</div>${meses.join('')}</div>
    <div class="mc-lv-ley"><span><i class="mc-lv-sw is-desove"></i>desove</span><span>⇄ traslado</span><span>✝ muerte</span><span><i class="mc-lv-sw is-a"></i><i class="mc-lv-sw is-b"></i>un tramo por tanque</span></div></div>`;
}
const dia0Local = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ── Modal · historial completo de una hembra (all-time) ── */
function openFemale(root, trovan) {
  const hist = femaleHistory(_model, trovan);
  const rec = hist.rec;
  const titleEl = root.querySelector('#mcFemTitle');
  const bodyEl = root.querySelector('#mcFemBody');
  if (!bodyEl) return;
  // ♻ Una hembra ANTERIOR de un microchip reciclado se llama «chip·fecha de ingreso»: el título dice el chip.
  if (titleEl) titleEl.innerHTML = rec && rec.chip && rec.chip !== hist.trovan
    ? `🦐 Trovan <b>${esc(rec.chip)}</b> <span class="muted">· hembra anterior del chip (ingresó ${esc(rec.fechaIngreso || '—')})</span>`
    : `🦐 Trovan <b>${esc(hist.trovan)}</b>`;

  const info = rec ? `<div class="mc-fem-info">
    ${infoCell('Estado', rec.estado)}
    ${infoCell('Ubicación', locKey(rec.sala, rec.tanque))}
    ${infoCell('Número', rec.numero)}
    ${infoCell('Color anillo', rec.color, chipAnillo(rec.color))}
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
  </div>` : `<div class="mc-fem-col"><h4 class="mc-card-h">Desoves</h4>${vacioHTML('Sin desoves registrados', { icono: '📭', conFiltros: false })}</div>`;

  const movList = `<div class="mc-fem-col">
    <h4 class="mc-card-h">Movimientos (${n0(hist.movimientos.length)})</h4>
    ${hist.movimientos.length ? `<div class="mc-timeline">${hist.movimientos.map((m) => `<div class="mc-tl-item"><span class="mc-tl-d">${dCell(m.date)}</span><span class="mc-tl-loc">${txt(locKey(m.salaOrigen, m.tanqueOrigen))} → ${txt(locKey(m.salaDestino, m.tanqueDestino))}</span><span class="mc-tl-gap">${esc(m.tipo || '')}</span></div>`).join('')}</div>`
    : vacioHTML('Sin transferencias', { icono: '📭', conFiltros: false })}
    ${hist.mortalidad.length ? `<div class="mc-fem-death">☠️ Mortalidad registrada: ${hist.mortalidad.map((e) => esc(fmtShort(e.date))).join(', ')}</div>` : ''}
  </div>`;

  bodyEl.innerHTML = info + lineaVidaHTML(lineaDeVida(_model, trovan)) + kpisHtml + chart + `<div class="mc-fem-cols">${desoveList}${movList}</div>`;

  const modal = root.querySelector('#mcFemaleModal');
  if (modal) { modal.classList.add('sv-open'); document.body.classList.add('modal-open'); }

  if (hist.intervals.length) {
    const E = ejes();
    makeChart('mcFemChart', {
      type: 'bar',
      data: { labels: hist.intervals.map((_, i) => `#${i + 1}→${i + 2}`), datasets: [{ label: 'días', data: hist.intervals, backgroundColor: C.desove, borderWidth: 0, borderRadius: 3, maxBarThickness: 26 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { ticks: E.tick, grid: { display: false } }, y: { beginAtZero: true, ticks: { ...E.tick, precision: 0 }, grid: { color: E.grid }, title: E.titulo('días') } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: () => '', label: (c) => ` ${c.parsed.y} días de recuperación` } } },
      },
    });
  }
}
function infoCell(label, v, antes = '') {
  return `<div class="mc-fem-f"><span class="mc-fem-l">${esc(label)}</span><span class="mc-fem-v">${antes}${txt(v)}</span></div>`;
}

/* V6 (2026-09-27, usuario) · la barra en la celda: la cifra con una barra detrás, proporcional al máximo de su tabla. */
const maxDe = (arr, k) => arr.reduce((m, x) => Math.max(m, x[k] || 0), 0);
function barra(v, max, cls = '') {
  const w = max > 0 && v > 0 ? Math.round((v / max) * 1000) / 10 : 0;
  return `<span class="mc-bar${cls}"><i style="width:${w}%"></i><b>${n0(v)}</b></span>`;
}
/* V6 · el chip del color del anillo. Los colores medidos en la MATRIZ (Transparente, Verde, Amarillo, Azul, Rojo) y
   algunos habituales; Transparente es un aro hueco; uno fuera de la lista, gris con «?»; sin color, nada. */
const ANILLOS = { transparente: '', verde: '#2e9e5b', amarillo: '#f2c230', azul: '#3f7fd0', rojo: '#d8432d', naranja: '#f08a24', blanco: '#f4f6f7', negro: '#37474f', rosado: '#e57fb0', morado: '#8a5cc2' };
function chipAnillo(color) {
  const c = String(color || '').trim(); if (!c) return '';
  const k = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tit = ` title="Anillo ${esc(c)}"`;
  if (k === 'transparente') return `<i class="mc-anillo is-transparente"${tit}></i>`;
  if (Object.prototype.hasOwnProperty.call(ANILLOS, k)) return `<i class="mc-anillo is-${k}" style="--mc-anillo:${ANILLOS[k]}"${tit}></i>`;
  return `<i class="mc-anillo is-otro"${tit}>?</i>`;
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

    // Stepper de período (al cambiar de mes, el toggle de granularidad vuelve a "auto")
    // T1 · el selector de «Productividad por familia»
    const fam = e.target.closest('[data-mc-familia]');
    if (fam) { vState.familia = fam.dataset.mcFamilia; maduracionView(root); return; }
    // V9 · «Quitar filtros»: todo el histórico, sin sala/tanque/lote/código (y el ranking con todas).
    if (e.target.closest('[data-mc-limpiar]')) {
      Object.assign(vState, { month: null, sala: null, tanque: null, lote: null, codigo: null, rankEstado: 'todas', trendGran: null });
      maduracionView(root);
      return;
    }
    // V1 · un clic en un tanque del mapa lo pone en los filtros de la vista; otro clic en el mismo los quita.
    const mTq = e.target.closest('[data-mc-mapa]');
    if (mTq && !mTq.disabled) {
      const [sala, num] = mTq.dataset.mcMapa.split('|');
      const t = (mapaDeSalas(reproModel(), makeFilter({ month: vState.month, lote: vState.lote, codigo: vState.codigo })).find((s) => s.sala === sala) || { tanques: [] }).tanques.find((x) => String(x.num) === num);
      if (t && t.filtro) {
        const mismo = vState.sala === t.filtro.sala && vState.tanque === t.filtro.tanque;
        vState.sala = mismo ? null : t.filtro.sala; vState.tanque = mismo ? null : t.filtro.tanque;
        maduracionView(root);
      }
      return;
    }
    const rkE = e.target.closest('[data-mc-rankestado]');
    if (rkE) { vState.rankEstado = rkE.dataset.mcRankestado; maduracionView(root); return; }
    const mnav = e.target.closest('[data-mc-monthnav]');
    if (mnav && !mnav.disabled) {
      const idx = periodIdx() + Number(mnav.dataset.mcMonthnav);
      if (idx >= 0 && idx < _periods.length) { vState.month = _periods[idx]; vState.trendGran = null; maduracionView(root); }
      return;
    }

    // Tendencias · granularidad (Mes/Día) y métrica aislada — REFRESCO PARCIAL: solo la
    // tarjeta de Tendencias, sin redibujar el donut de Distribución de hembras.
    const tg = e.target.closest('[data-mc-trendgran]');
    if (tg) { vState.trendGran = tg.dataset.mcTrendgran; refreshTrend(root); return; }
    const tm = e.target.closest('[data-mc-trendmetric]');
    if (tm) { vState.trendMetric = tm.dataset.mcTrendmetric; refreshTrend(root); return; }

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
