/* ============================================================
   BIOLOGÍA MOLECULAR — port de BIOMOL.html (D3)
   ETAPA 1: capa de datos (lee la hoja "Biomol" del store) + KPIs +
   filterbar (diagnóstico / lugar / período) + chips + modo AUD +
   modal de detalle de muestras. Los gráficos D3 (Heatmap, Calendario,
   Treemap, Swarm, Sankey, Trend, Donut, Tabla, Reporte) llegan en las
   etapas siguientes; aquí van como placeholders.
   ============================================================ */
import { store } from '../../core/store.js';
import { esc as escH } from '../../core/format.js'; // output-encoding único (antes había un escH local duplicado)
import { toast } from '../../ui/toast.js';

// ── Constantes (idénticas a BIOMOL.html) ──
const DIAGS  = ['IHHNV', 'WSSV', 'BP', 'AHPND', 'NHPB', 'EHP'];
const DLABEL = { IHHNV: 'IHHNV', WSSV: 'WSSV', BP: 'BP', AHPND: 'AHPND/EMS', NHPB: 'NHPB', EHP: 'EHP' };
const DCOLOR = { IHHNV: '#ef4444', WSSV: '#f59e0b', BP: '#a78bfa', AHPND: '#38bdf8', NHPB: '#14b8a6', EHP: '#ec4899' };
const COL_ALIASES = {
  fecha: 'Fecha', 'código': 'Código', codigo: 'Código', corrida: 'Corrida', piscina: 'Piscina',
  lugar: 'Lugar', tanque: 'Tanque', otros: 'Otros', 'precría': 'Precría', precria: 'Precría',
  muestra: 'Muestra', 'estadío': 'Estadío', estadio: 'Estadío', tipo: 'Estadío', sexo: 'Sexo',
  ihhnv: 'IHHNV', cc: 'IHHNV', wssv: 'WSSV', dd: 'WSSV', bp: 'BP', ee: 'BP',
  'ahpnd/ems': 'AHPND', ahpnd: 'AHPND', ems: 'AHPND', pp: 'AHPND',
  nhpb: 'NHPB', nhp: 'NHPB', 'nhp-b': 'NHPB', nn: 'NHPB', ehp: 'EHP',
};

// ── Estado (persiste entre re-render; se reinicia al cambiar los datos) ──
let RAW = [];
let activeDiags   = new Set(DIAGS);
let activeLugares = new Set();
let activeFechas  = new Set();
let datePreset    = 'all';
let audMode       = false;
let timeGran      = 'month'; // Calendario por defecto en "Por Mes" (la data diaria desborda el eje)
// Estado de gráficos (usado a partir de la Etapa 2)
let hmMode = 'lugar', swarmDate = null, swarmDiag = 'ALL', treemapDiag = 'ALL', sankeyDiag = 'IHHNV', trendDiag = 'ALL';
let sankeyMode = 'normal';
const originSuppressed = new Set();
// Reporte comparativo
const REPORT_COLORS = ['#38bdf8', '#a78bfa', '#f59e0b'];
let reportSeries = [], reportAgg = 'monthly', reportChart = 'line', reportMetric = 'pct', reportNextId = 1;
const reportExtras = new Set();
let bracketDiag = 'IHHNV', bracketFrom = '', bracketTo = '', bracketWired = false;

let lastSig = '';
let docWired = false;

// ── Helpers de datos (idénticos a BIOMOL.html) ──
const isPos  = (v) => v === 'Positivo';
const hasVal = (v) => v === 'Positivo' || v === 'Negativo';
const fmtD   = (iso) => iso.slice(5).split('-').reverse().join('/');
const $ = (id) => document.getElementById(id);

export function parseDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const d = new Date(raw);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
export function normResult(s) {
  const l = String(s).toLowerCase();
  if (['positivo', 'positive', 'pos', 'p', '1', 'si', 'sí'].includes(l)) return 'Positivo';
  if (['negativo', 'negative', 'neg', 'n', '0', 'no'].includes(l)) return 'Negativo';
  return '';
}
export function normalizeRows(rows) {
  const out = [];
  rows.forEach((row) => {
    const nr = {};
    Object.keys(row).forEach((k) => { const alias = COL_ALIASES[k.trim().toLowerCase()]; if (alias) nr[alias] = (row[k] || '').toString().trim(); });
    const fISO = parseDate(nr['Fecha'] || '');
    if (!fISO) return;
    const yr = +fISO.slice(0, 4);
    if (yr < 2000 || yr > 2100) return; // descarta fechas corruptas del Sheet (p.ej. "30/01/0202")
    out.push({
      f: fISO, cod: nr['Código'] || '', corrida: nr['Corrida'] || '', piscina: nr['Piscina'] || '',
      lugar: nr['Lugar'] || 'Sin lugar', tq: nr['Tanque'] || '—', otros: nr['Otros'] || '',
      precria: nr['Precría'] || '', muestra: nr['Muestra'] || '', estadio: nr['Estadío'] || '', sexo: nr['Sexo'] || '',
      IHHNV: normResult(nr['IHHNV'] || ''), WSSV: normResult(nr['WSSV'] || ''), BP: normResult(nr['BP'] || ''),
      AHPND: normResult(nr['AHPND'] || nr['AHPND/EMS'] || ''), NHPB: normResult(nr['NHPB'] || ''), EHP: normResult(nr['EHP'] || ''),
    });
  });
  return out;
}
const filtered = () => RAW.filter((d) => activeLugares.has(d.lugar) && activeFechas.has(d.f));
function togClass(set, val, btn) { if (set.has(val)) { set.delete(val); btn.classList.remove('on'); } else { set.add(val); btn.classList.add('on'); } }

// ── KPIs (idéntico a BIOMOL.html updateKPI) ──
function updateKPI(data) {
  DIAGS.forEach((d) => {
    const measured = data.filter((r) => hasVal(r[d]));
    const pos = measured.filter((r) => isPos(r[d]));
    const pct = measured.length ? Math.round(pos.length / measured.length * 100) : 0;
    $('kv-' + d).textContent = pct + '%';
    $('kn-' + d).textContent = `${pos.length} / ${measured.length} muestras`;
    $('kb-' + d).style.width = pct + '%';
  });
  $('kv-total').textContent = data.length;
  const dates = [...new Set(data.map((r) => r.f))].sort();
  $('kv-dates').textContent = dates.length;
  $('sample-label').textContent = data.length + ' muestras';
  if (dates.length) $('range-label').textContent = fmtD(dates[0]) + (dates.length > 1 ? ' → ' + fmtD(dates[dates.length - 1]) : '');
}

function render() { updateKPI(filtered()); renderCharts(); drawTable(); }

// ── Filterbar: lugar ──
function buildLugarList(lugares) {
  const list = $('lugar-check-list'); list.innerHTML = '';
  lugares.forEach((l) => {
    const label = document.createElement('label'); label.className = 'fb-check-item'; label.dataset.lugar = l;
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = activeLugares.has(l); cb.dataset.lugar = l;
    cb.addEventListener('change', () => { if (cb.checked) activeLugares.add(l); else activeLugares.delete(l); updateLugarSummary(); updateChips(); render(); });
    label.appendChild(cb); label.appendChild(document.createTextNode(l)); list.appendChild(label);
  });
}
const filterLugarList = (q) => document.querySelectorAll('#lugar-check-list .fb-check-item').forEach((item) => item.classList.toggle('hidden-item', !item.dataset.lugar.toLowerCase().includes(q.toLowerCase())));
function selectAllLugares() { activeLugares.clear(); document.querySelectorAll('#lugar-check-list input[type=checkbox]').forEach((cb) => { cb.checked = true; activeLugares.add(cb.dataset.lugar); }); updateLugarSummary(); updateChips(); render(); }
function selectNoneLugares() { activeLugares.clear(); document.querySelectorAll('#lugar-check-list input[type=checkbox]').forEach((cb) => { cb.checked = false; }); updateLugarSummary(); updateChips(); render(); }
function updateLugarSummary() {
  const total = [...new Set(RAW.map((d) => d.lugar))].length, sel = activeLugares.size, el = $('lugar-summary');
  if (sel === 0) el.textContent = 'Ninguno'; else if (sel === total) el.textContent = `Todos (${total})`;
  else if (sel === 1) el.textContent = [...activeLugares][0]; else el.textContent = `${sel} de ${total} lugares`;
}
function toggleDropdown(which) {
  const panel = $(which + '-panel'), trigger = $(which + '-trigger'), wasOpen = !panel.classList.contains('hidden');
  closeDropdowns();
  if (!wasOpen) { panel.classList.remove('hidden'); trigger.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
}
function closeDropdowns() {
  document.querySelectorAll('.biomol .fb-panel').forEach((p) => p.classList.add('hidden'));
  document.querySelectorAll('.biomol .fb-trigger').forEach((t) => { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); });
}

// ── Filterbar: período ──
function applyPreset(preset, btn) {
  document.querySelectorAll('.biomol .fb-preset').forEach((b) => b.classList.remove('on'));
  btn.classList.add('on');
  const customInputs = $('fb-date-inputs');
  if (preset === 'custom') { customInputs.style.display = 'flex'; return; }
  customInputs.style.display = 'none';
  datePreset = preset;
  const allFechas = [...new Set(RAW.map((d) => d.f))].sort();
  activeFechas.clear();
  if (preset === 'all') allFechas.forEach((f) => activeFechas.add(f));
  else {
    // Ancla al último día CON DATOS (no a "hoy") → robusto si la carga va con retraso.
    const maxISO = allFechas[allFechas.length - 1] || new Date().toISOString().slice(0, 10);
    const cutoff = new Date(maxISO + 'T00:00:00Z'); cutoff.setUTCDate(cutoff.getUTCDate() - parseInt(preset, 10));
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    allFechas.filter((f) => f >= cutoffISO).forEach((f) => activeFechas.add(f));
    if (!activeFechas.size) allFechas.forEach((f) => activeFechas.add(f));
  }
  updateChips(); render();
}
function applyDateRange() {
  datePreset = 'custom';
  document.querySelectorAll('.biomol .fb-preset').forEach((b) => b.classList.remove('on'));
  const customBtn = document.querySelector('.biomol [data-preset="custom"]'); if (customBtn) customBtn.classList.add('on');
  $('fb-date-inputs').style.display = 'flex';
  const from = $('date-from').value, to = $('date-to').value;
  const allFechas = [...new Set(RAW.map((d) => d.f))].sort();
  activeFechas.clear();
  allFechas.filter((f) => (!from || f >= from) && (!to || f <= to)).forEach((f) => activeFechas.add(f));
  if (!activeFechas.size) allFechas.forEach((f) => activeFechas.add(f));
  updateChips(); render();
}

// ── Chips ──
function updateChips() {
  const container = $('filter-chips'); container.innerHTML = '';
  const totalL = [...new Set(RAW.map((d) => d.lugar))].length;
  const allFechas = [...new Set(RAW.map((d) => d.f))].sort();
  if (activeLugares.size < totalL) {
    if (activeLugares.size === 0) addChip(container, 'Sin lugares', () => selectAllLugares());
    else if (activeLugares.size <= 3) [...activeLugares].sort().forEach((l) => addChip(container, l, () => { activeLugares.delete(l); rebuildLugarCheckboxes(); updateLugarSummary(); updateChips(); render(); }));
    else addChip(container, `${activeLugares.size} lugares`, () => selectAllLugares());
  }
  if (activeFechas.size < allFechas.length) {
    const label = datePreset === 'custom' ? `${$('date-from').value || '?'} → ${$('date-to').value || '?'}` : `Últimos ${datePreset}d`;
    addChip(container, label, () => applyPreset('all', document.querySelector('.biomol [data-preset="all"]')));
  }
}
function addChip(container, text, onRemove) {
  const chip = document.createElement('div'); chip.className = 'fb-chip';
  const span = document.createElement('span'); span.className = 'fb-chip-x'; span.title = 'Limpiar filtro'; span.textContent = '✕';
  span.addEventListener('click', onRemove);
  chip.appendChild(document.createTextNode(text + ' ')); chip.appendChild(span); container.appendChild(chip);
}
const rebuildLugarCheckboxes = () => document.querySelectorAll('#lugar-check-list input[type=checkbox]').forEach((cb) => { cb.checked = activeLugares.has(cb.dataset.lugar); });

// ── Modal: detalle de muestras (Lugar × Mes) ──
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const formatMonth = (yyyymm) => { const [y, m] = yyyymm.split('-'); return `${MONTHS_ES[parseInt(m, 10) - 1]} ${y}`; };
function showTotalBreakdown() {
  const data = filtered(), modal = $('total-modal'), body = $('total-modal-body'); body.innerHTML = '';
  if (!data.length) { body.innerHTML = '<div style="text-align:center;color:var(--bm-muted);padding:30px;font-size:12px">Sin datos para los filtros activos</div>'; modal.classList.add('open'); document.body.classList.add('modal-open'); return; }
  const byLugar = {}, monthSet = new Set();
  data.forEach((r) => { const m = r.f.slice(0, 7); monthSet.add(m); (byLugar[r.lugar] ||= {})[m] = (byLugar[r.lugar][m] || 0) + 1; });
  const months = [...monthSet].sort(), lugares = Object.keys(byLugar).sort();
  let thead = '<thead><tr><th>Lugar</th>'; months.forEach((m) => { thead += `<th style="text-align:center">${formatMonth(m)}</th>`; }); thead += '<th style="text-align:center">Total</th></tr></thead>';
  const colTotals = months.map(() => 0); let grandTotal = 0, tbody = '<tbody>';
  lugares.forEach((l) => {
    let rowTotal = 0, row = `<tr><td>${escH(l)}</td>`;
    months.forEach((m, idx) => { const c = byLugar[l][m] || 0; rowTotal += c; colTotals[idx] += c; row += `<td class="num${c ? '' : ' muted'}">${c || '—'}</td>`; });
    grandTotal += rowTotal; row += `<td class="num accent">${rowTotal}</td></tr>`; tbody += row;
  });
  let totalRow = '<tr class="total-row"><td>TOTAL</td>'; colTotals.forEach((c) => { totalRow += `<td class="num">${c}</td>`; }); totalRow += `<td class="num accent">${grandTotal}</td></tr>`;
  tbody += totalRow + '</tbody>';
  body.innerHTML = `<table class="modal-table">${thead}${tbody}</table>`;
  modal.classList.add('open'); document.body.classList.add('modal-open');
}
const closeTotalModal = () => { $('total-modal')?.classList.remove('open'); document.body.classList.remove('modal-open'); };

// ── Modo AUD (auditoría) ──
function updateAudBtn() { const btn = $('aud-btn'); if (!btn) return; btn.classList.toggle('on', audMode); btn.setAttribute('aria-pressed', audMode ? 'true' : 'false'); }
function toggleAud() {
  if (!RAW.length) return;
  audMode = !audMode;
  if (audMode) {
    RAW.forEach((r) => { if (!r._audOrig) { r._audOrig = {}; DIAGS.forEach((d) => { r._audOrig[d] = r[d]; }); } });
    DIAGS.filter((d) => d !== 'IHHNV').forEach((d) => { RAW.forEach((r) => { if (hasVal(r._audOrig[d])) r[d] = 'Negativo'; }); });
    const target = 5 + Math.random() * 5;
    RAW.forEach((r) => { if (hasVal(r._audOrig.IHHNV)) r.IHHNV = (Math.random() * 100 < target) ? 'Positivo' : 'Negativo'; });
  } else {
    RAW.forEach((r) => { if (r._audOrig) { DIAGS.forEach((d) => { r[d] = r._audOrig[d]; }); delete r._audOrig; } });
  }
  updateAudBtn(); render();
}

/* ── Modal RS · Registro del día (snapshot del día más reciente, por lugar) ──
   Independiente de la filterbar: muestra TODOS los registros de una fecha (por
   defecto la más reciente) en un heatmap Lugar × Diagnóstico + tabla de detalle
   por muestra. Clic en un lugar la filtra. Tooltip de celda lista cada muestra
   (código/lote · piscina · estadío · resultado). */
let rsdDate = null, rsdDiag = 'ALL', rsdLugar = null;

const rsdAllDates = () => [...new Set(RAW.map((r) => r.f))].sort(); // asc

function openRS() {
  if (!RAW.length) return;
  const dates = rsdAllDates();
  if (!dates.length) return;
  if (!rsdDate || !dates.includes(rsdDate)) rsdDate = dates[dates.length - 1]; // más reciente
  rsdLugar = null;
  const dsel = $('rsd-date');
  if (dsel) dsel.innerHTML = dates.slice().reverse().map((d) => `<option value="${d}"${d === rsdDate ? ' selected' : ''}>${fmtD(d)}</option>`).join('');
  const gsel = $('rsd-diag');
  if (gsel && !gsel.options.length) gsel.innerHTML = '<option value="ALL">Todos</option>' + DIAGS.map((d) => `<option value="${d}">${DLABEL[d]}</option>`).join('');
  $('rsd-modal').classList.add('open'); document.body.classList.add('modal-open');
  requestAnimationFrame(renderRS);
}
function closeRS() { $('rsd-modal')?.classList.remove('open'); document.body.classList.remove('modal-open'); hideTip(); }

const rsdDayData = () => RAW.filter((r) => r.f === rsdDate);

function renderRS() {
  refreshTheme();
  const data = rsdDayData();
  const sum = $('rsd-summary');
  if (sum) sum.innerHTML = data.length ? `<b>${data.length}</b> muestra(s) · <b>${new Set(data.map((r) => r.lugar)).size}</b> lugar(es)` : 'Sin registros';
  drawRSHeatmap(data);
  renderRSDetail(data);
}

function drawRSHeatmap(data) {
  const svg = d3.select('#rsd-heatmap'); svg.selectAll('*').remove();
  const el = $('rsd-heatmap'); if (!el) return;
  const wrap = el.parentElement, W = Math.max((wrap && wrap.clientWidth) || 640, 360);
  const diags = rsdDiag === 'ALL' ? DIAGS : [rsdDiag];
  const lugares = [...new Set(data.map((r) => r.lugar))].sort();
  const H = Math.max(110, lugares.length * 34 + 34);
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('width', '100%');
  if (!data.length || !lugares.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin registros para esta fecha'); return; }
  const maxLen = Math.max(...lugares.map((l) => l.length));
  const mL = Math.min(170, Math.max(80, maxLen * 6.4)), mT = 24, mR = 12, mB = 8;
  const cW = (W - mL - mR) / diags.length, cH = Math.min(40, (H - mT - mB) / lugares.length);
  const g = svg.append('g').attr('transform', `translate(${mL},${mT})`);
  diags.forEach((dg, ci) => g.append('text').attr('x', ci * cW + cW / 2).attr('y', -8).attr('text-anchor', 'middle').attr('fill', DCOLOR[dg]).attr('font-size', 10).attr('font-weight', '700').text(DLABEL[dg]));
  lugares.forEach((l, ri) => {
    g.append('text').attr('x', -6).attr('y', ri * cH + cH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', l === rsdLugar ? '#38bdf8' : TH.muted).attr('font-size', 10).attr('font-weight', l === rsdLugar ? '700' : '400').style('cursor', 'pointer').text(l.length > 24 ? l.slice(0, 23) + '…' : l).on('click', () => { rsdLugar = rsdLugar === l ? null : l; renderRS(); });
    diags.forEach((dg, ci) => {
      const rows = data.filter((r) => r.lugar === l && hasVal(r[dg]));
      const pos = rows.filter((r) => isPos(r[dg])).length;
      const pct = rows.length ? Math.round(pos / rows.length * 100) : null;
      const cell = g.append('rect').attr('x', ci * cW + 1).attr('y', ri * cH + 1).attr('width', cW - 2).attr('height', cH - 2).attr('rx', 4).attr('fill', pctColor(pct)).attr('cursor', 'pointer');
      if (pct !== null && cW > 26) g.append('text').attr('class', 'hm-val').attr('x', ci * cW + cW / 2).attr('y', ri * cH + cH / 2).text(pct + '%');
      const samples = data.filter((r) => r.lugar === l);
      const list = samples.slice(0, 14).map((r) => `<div class="tt-row"><span class="tt-key">${escH(r.cod || r.tq || '—')}</span><span class="tt-val ${isPos(r[dg]) ? 'pos-tag' : hasVal(r[dg]) ? 'neg-tag' : ''}">${escH(r[dg] || '—')} · P:${escH(r.piscina || '—')} · ${escH(r.estadio || r.sexo || '—')}</span></div>`).join('');
      cell.on('mouseenter', (e) => showTip(`<div class="tt-title">${escH(l)} · ${DLABEL[dg]}</div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${pos}</span></div><div class="tt-row"><span class="tt-key">Medidos</span><span class="tt-val">${rows.length}</span></div><div class="tt-row"><span class="tt-key">% Positivos</span><span class="tt-val">${pct !== null ? pct + '%' : '—'}</span></div>${list}${samples.length > 14 ? `<div class="tt-row"><span class="tt-key">…</span><span class="tt-val">+${samples.length - 14} más</span></div>` : ''}`, e)).on('mouseleave', hideTip);
    });
  });
}

function renderRSDetail(data) {
  const cont = $('rsd-detail'); if (!cont) return;
  const rows = rsdLugar ? data.filter((r) => r.lugar === rsdLugar) : data;
  const badge = (v) => !hasVal(v) ? '<span class="badge badge-na">—</span>' : isPos(v) ? '<span class="badge badge-pos">✕ POS</span>' : '<span class="badge badge-neg">✓ NEG</span>';
  const head = `<thead><tr><th>Lugar</th><th>Código</th><th>Corrida</th><th>Piscina</th><th>Tanque</th><th>Estadío</th><th>Sexo</th>${DIAGS.map((d) => `<th>${DLABEL[d]}</th>`).join('')}</tr></thead>`;
  const body = rows.length
    ? rows.map((r) => `<tr><td>${escH(r.lugar)}</td><td>${r.cod ? escH(r.cod) : '—'}</td><td>${escH(r.corrida || '—')}</td><td>${escH(r.piscina || '—')}</td><td>${escH(r.tq || '—')}</td><td>${escH(r.estadio || '—')}</td><td>${escH(r.sexo || '—')}</td>${DIAGS.map((d) => `<td>${badge(r[d])}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${7 + DIAGS.length}" style="text-align:center;color:var(--bm-muted);padding:18px">Sin muestras${rsdLugar ? ' en ' + escH(rsdLugar) : ''}.</td></tr>`;
  const filterLine = `<div style="margin:10px 0 6px;font-size:12px;color:var(--bm-muted)">${rows.length} muestra(s)${rsdLugar ? ` · filtrado por <b style="color:var(--bm-text)">${escH(rsdLugar)}</b> · <span id="rsd-clear" style="cursor:pointer;text-decoration:underline">quitar filtro</span>` : ' · clic en un lugar del mapa para filtrar'}</div>`;
  cont.innerHTML = filterLine + `<div class="tbl-wrap"><table class="modal-table">${head}<tbody>${body}</tbody></table></div>`;
  const clr = $('rsd-clear'); if (clr) clr.addEventListener('click', () => { rsdLugar = null; renderRS(); });
}

/* ============================================================
   GRÁFICOS D3 (port fiel de BIOMOL.html, adaptado al tema)
   ============================================================ */
// `window` puede no existir al importar el módulo fuera del navegador (tests de la
// capa de datos pura). Además, este módulo se importa de forma DIFERIDA (al abrir la
// vista): si el CDN de D3 aún no había cargado al importar, capturar el valor UNA vez
// dejaría `d3` en undefined para siempre. Por eso es `let` y se re-sincroniza en
// biomolecularView() (tras el guard `!window.d3`), garantizando la instancia cargada.
let d3 = (typeof window !== 'undefined') ? window.d3 : undefined;
let TH = { text: '#e2e8f0', muted: '#8892aa', surface: '#131929', grid: '#1e293b' };
function refreshTheme() {
  const cs = getComputedStyle(document.querySelector('.biomol') || document.documentElement);
  const g = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
  TH = { text: g('--bm-text', '#e2e8f0'), muted: g('--bm-muted', '#8892aa'), surface: g('--bm-surface', '#131929'), grid: g('--bm-grid', '#1e293b') };
}

// Tooltip
const tipEl = () => $('bm-tooltip');
function showTip(html, e) { const t = tipEl(); if (!t) return; t.innerHTML = html; t.style.opacity = '1'; moveTip(e); }
function moveTip(e) { const t = tipEl(); if (!t) return; let x = e.clientX + 14, y = e.clientY - 10; if (x + 240 > window.innerWidth) x = e.clientX - 250; if (y + 160 > window.innerHeight) y = e.clientY - 130; t.style.left = x + 'px'; t.style.top = y + 'px'; }
function hideTip() { const t = tipEl(); if (t) t.style.opacity = '0'; }

// Fullscreen
let fsCard = null;
function toggleFS(id) { if (fsCard) exitFS(); fsCard = $(id); fsCard.classList.add('is-fs'); document.body.classList.add('modal-open'); const ex = $('bm-fs-exit'); if (ex) ex.style.display = 'block'; requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(renderCharts))); }
function exitFS() { if (fsCard) { fsCard.classList.remove('is-fs'); fsCard = null; } document.body.classList.remove('modal-open'); const ex = $('bm-fs-exit'); if (ex) ex.style.display = 'none'; requestAnimationFrame(() => requestAnimationFrame(renderCharts)); }

function svgDims(svgId, fbW, fbH) {
  const el = $(svgId); if (!el) return { W: fbW, H: fbH };
  let card = el.parentElement; while (card && !card.classList.contains('card')) card = card.parentElement;
  const bw = el.getBoundingClientRect().width;
  const W = bw > 20 ? bw : (el.parentElement && el.parentElement.clientWidth > 20 ? el.parentElement.clientWidth : fbW);
  let H = fbH;
  if (card && card.classList.contains('is-fs')) { let overhead = 48; [...card.children].forEach((c) => { if (c !== el) overhead += c.getBoundingClientRect().height + 8; }); H = Math.max(fbH * 1.5, window.innerHeight - overhead); }
  return { W, H };
}
function pctColor(p) { if (p === null) return TH.grid; const t = p / 100; return `rgb(${Math.round(34 + (239 - 34) * t)},${Math.round(197 + (68 - 197) * t)},${Math.round(94 + (68 - 94) * t)})`; }

// Estadío cronológico + granularidad temporal
export function estadioOrder(s) {
  if (!s) return 9999;
  const u = String(s).toUpperCase().trim().replace(/\s+/g, '');
  if (u === 'N5' || u === 'N-5') return 1;
  const zM = u.match(/^Z-?(\d+)$/); if (zM) return 10 + +zM[1];
  const mM = u.match(/^M-?(\d+)$/); if (mM) return 50 + +mM[1];
  const pM = u.match(/^PL-?(\d+)$/); if (pM) return 100 + +pM[1];
  if (u.includes('REPRODUCTOR')) return 99999;
  return 9000;
}
const estadioCompare = (a, b) => { const oa = estadioOrder(a), ob = estadioOrder(b); return oa !== ob ? oa - ob : String(a).localeCompare(String(b)); };
function getWeekKey(iso) { const d = new Date(iso + 'T00:00:00Z'); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); const wn = Math.ceil((((d - ys) / 86400000) + 1) / 7); return `${d.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`; }
const weekLabel = (k) => { const [y, w] = k.split('-W'); return `S${w}·${y.slice(2)}`; };
function granKeyLabel(gran) {
  if (gran === 'month') return { key: (iso) => iso.slice(0, 7), label: (k) => formatMonth(k) };
  if (gran === 'week') return { key: (iso) => getWeekKey(iso), label: (k) => weekLabel(k) };
  return { key: (iso) => iso, label: (k) => fmtD(k) };
}
function resolveGran(nDates) { if (timeGran !== 'auto') return timeGran; if (nDates > 120) return 'month'; if (nDates > 45) return 'week'; return 'day'; }
const GRAN_SHORT = { day: 'Día', week: 'Sem', month: 'Mes' };

const hmSuppressed = new Set(), calSuppressed = new Set();

function renderSuppressBar(barId, items, onRestore, onClearAll) {
  const bar = $(barId); if (!bar) return; bar.innerHTML = ''; if (!items.length) return;
  const lbl = document.createElement('span'); lbl.className = 'sup-bar-lbl'; lbl.textContent = `Ocultos (${items.length}):`; bar.appendChild(lbl);
  items.forEach((name) => { const chip = document.createElement('span'); chip.className = 'sup-chip'; chip.title = 'Restaurar columna'; chip.textContent = name; chip.addEventListener('click', () => onRestore(name)); bar.appendChild(chip); });
  if (items.length >= 2 && onClearAll) { const clr = document.createElement('span'); clr.className = 'sup-chip sup-chip-clear'; clr.textContent = 'Restaurar todas'; clr.addEventListener('click', onClearAll); bar.appendChild(clr); }
}

// Tabs de diagnóstico (treemap/swarm/sankey/trend) y de fecha (swarm)
function buildDiagTabs(containerId, getActive, setActive, redrawFn, includeTodos) {
  const c = $(containerId); if (!c) return; c.innerHTML = '';
  const resetStyle = (tabs) => tabs.forEach((x) => { const dc = x.dataset.diag === 'ALL' ? '#64748b' : (DCOLOR[x.dataset.diag] || '#8892aa'); x.style.borderColor = dc; x.style.color = dc; x.style.background = 'transparent'; });
  const makeBtn = (label, diag, color) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.diag = diag;
    const isActive = diag === getActive(); b.className = 'tab' + (isActive ? ' on' : '');
    b.style.borderColor = color; b.style.color = isActive ? '#fff' : color; b.style.background = isActive ? color : 'transparent';
    b.textContent = label;
    b.addEventListener('click', () => { setActive(diag); resetStyle([...c.querySelectorAll('.tab')]); b.style.background = color; b.style.color = '#fff'; redrawFn(); });
    return b;
  };
  if (includeTodos) c.appendChild(makeBtn('Todos', 'ALL', '#64748b'));
  DIAGS.forEach((d) => c.appendChild(makeBtn(DLABEL[d], d, DCOLOR[d])));
}
function buildSwarmTabs(fechas) {
  const monthsC = $('swarm-tabs'), daysC = $('swarm-day-tabs'); if (!monthsC || !daysC) return;
  monthsC.innerHTML = ''; daysC.innerHTML = '';
  if (!fechas.length) { swarmDate = null; return; }
  const byMonth = {}; fechas.forEach((f) => { (byMonth[f.slice(0, 7)] ||= []).push(f); });
  const months = Object.keys(byMonth).sort();
  let activeMonth = swarmDate ? swarmDate.slice(0, 7) : months[months.length - 1];
  if (!byMonth[activeMonth]) activeMonth = months[months.length - 1];
  if (!byMonth[activeMonth].includes(swarmDate)) swarmDate = byMonth[activeMonth][byMonth[activeMonth].length - 1];
  months.forEach((m) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (m === activeMonth ? ' on' : ''); b.textContent = formatMonth(m); b.title = `${byMonth[m].length} día(s)`; b.addEventListener('click', () => { swarmDate = byMonth[m][byMonth[m].length - 1]; buildSwarmTabs(fechas); drawSwarm(); }); monthsC.appendChild(b); });
  byMonth[activeMonth].forEach((d) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (d === swarmDate ? ' on' : ''); b.textContent = d.slice(8, 10); b.title = fmtD(d); b.addEventListener('click', () => { swarmDate = d; document.querySelectorAll('#swarm-day-tabs .tab').forEach((x) => x.classList.remove('on')); b.classList.add('on'); drawSwarm(); }); daysC.appendChild(b); });
}

// ── HEATMAP ──
function drawHeatmap() {
  const data = filtered(); const svg = d3.select('#heatmap'); svg.selectAll('*').remove();
  const el = $('heatmap'); if (!el) return; const wrapper = el.parentElement;
  let cardEl = wrapper; while (cardEl && !cardEl.classList.contains('card')) cardEl = cardEl.parentElement;
  const isFS = cardEl && cardEl.classList.contains('is-fs');
  const W_avail = Math.max((wrapper && wrapper.clientWidth) || 520, 320);
  const DA = DIAGS.filter((d) => activeDiags.has(d));
  const isExtCode = (c) => /texcumar/i.test(c || '');
  const hmGL = granKeyLabel(resolveGran(new Set(data.map((r) => r.f)).size));
  let cols = [];
  if (hmMode === 'lugar') cols = [...new Set(data.map((r) => r.lugar).filter((l) => l && l !== 'Sin lugar'))].sort();
  else if (hmMode === 'fecha') cols = [...new Set(data.map((r) => hmGL.key(r.f)))].sort().map(hmGL.label);
  else if (hmMode === 'lote') cols = [...new Set(data.map((r) => r.cod).filter(Boolean))].sort();
  else if (hmMode === 'lineas_int') cols = [...new Set(data.map((r) => r.cod).filter((c) => c && !isExtCode(c)))].sort();
  else if (hmMode === 'lineas_ext') cols = [...new Set(data.map((r) => r.cod).filter((c) => c && isExtCode(c)))].sort();
  else if (hmMode === 'otros') cols = [...new Set(data.map((r) => r.otros).filter(Boolean))].sort();
  else if (hmMode === 'piscina') cols = [...new Set(data.map((r) => r.piscina).filter(Boolean))].sort();
  else if (hmMode === 'sexo') cols = [...new Set(data.map((r) => r.sexo).filter(Boolean))].sort();
  else if (hmMode === 'corrida') cols = [...new Set(data.map((r) => r.corrida).filter(Boolean))].sort();
  else cols = [...new Set(data.map((r) => r.estadio).filter(Boolean))].sort(estadioCompare);
  const rawCols = cols.slice();
  cols = cols.filter((c) => !hmSuppressed.has(`${hmMode}|${c}`));
  const hiddenItems = rawCols.filter((c) => hmSuppressed.has(`${hmMode}|${c}`));
  renderSuppressBar('hm-suppress-bar', hiddenItems, (name) => { hmSuppressed.delete(`${hmMode}|${name}`); drawHeatmap(); }, () => { [...hmSuppressed].forEach((k) => { if (k.startsWith(`${hmMode}|`)) hmSuppressed.delete(k); }); drawHeatmap(); });
  const H = isFS ? Math.max(360, window.innerHeight - 180) : 220;
  if (!DA.length || !data.length || !cols.length) {
    svg.attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W_avail} ${H}`);
    svg.append('text').attr('x', W_avail / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text(hiddenItems.length ? 'Todas las columnas ocultas · usa los chips' : 'Sin datos');
    return;
  }
  const maxLabelLen = Math.max(...cols.map((c) => c.length));
  const needsRotation = cols.length > 8 || maxLabelLen > 9;
  const labelAngle = needsRotation ? -42 : 0;
  const mL = 56, mR = 10, mT = needsRotation ? Math.min(90, 22 + Math.min(maxLabelLen, 16) * 5) : 30, mB = 12;
  const minColW = needsRotation ? 28 : 50, maxColW = isFS ? 100 : 74;
  const cW = Math.max(minColW, Math.min(maxColW, (W_avail - mL - mR) / cols.length));
  const requiredW = mL + cW * cols.length + mR, W_svg = Math.max(W_avail, requiredW);
  const cH = Math.min(isFS ? 80 : 48, (H - mT - mB) / Math.max(DA.length, 1));
  svg.attr('width', requiredW > W_avail ? W_svg : '100%').attr('height', H).attr('viewBox', `0 0 ${W_svg} ${H}`);
  const g = svg.append('g').attr('transform', `translate(${mL},${mT})`);
  cols.forEach((c, ci) => {
    const cx = ci * cW + cW / 2, shown = c.length > 18 ? c.slice(0, 17) + '…' : c;
    const t = g.append('text').attr('class', 'hm-label').attr('font-size', 9).style('cursor', 'pointer');
    if (labelAngle) t.attr('transform', `translate(${cx},-6) rotate(${labelAngle})`).attr('text-anchor', 'start');
    else t.attr('x', cx).attr('y', -8).attr('text-anchor', 'middle');
    t.text(shown).append('title').text(`${c} · (click para ocultar)`);
    t.on('click', () => { hmSuppressed.add(`${hmMode}|${c}`); drawHeatmap(); });
  });
  DA.forEach((diag, ri) => {
    g.append('text').attr('class', 'hm-label').attr('x', -6).attr('y', ri * cH + cH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', DCOLOR[diag]).attr('font-weight', '700').text(DLABEL[diag]);
    cols.forEach((col, ci) => {
      let rows;
      if (hmMode === 'lugar') rows = data.filter((r) => r.lugar === col && hasVal(r[diag]));
      else if (hmMode === 'fecha') rows = data.filter((r) => hmGL.label(hmGL.key(r.f)) === col && hasVal(r[diag]));
      else if (hmMode === 'lote' || hmMode === 'lineas_int' || hmMode === 'lineas_ext') rows = data.filter((r) => r.cod === col && hasVal(r[diag]));
      else if (hmMode === 'otros') rows = data.filter((r) => r.otros === col && hasVal(r[diag]));
      else if (hmMode === 'piscina') rows = data.filter((r) => r.piscina === col && hasVal(r[diag]));
      else if (hmMode === 'sexo') rows = data.filter((r) => r.sexo === col && hasVal(r[diag]));
      else if (hmMode === 'corrida') rows = data.filter((r) => r.corrida === col && hasVal(r[diag]));
      else rows = data.filter((r) => r.estadio === col && hasVal(r[diag]));
      const pos = rows.filter((r) => isPos(r[diag]));
      const pct = rows.length ? Math.round(pos.length / rows.length * 100) : null;
      const cell = g.append('rect').attr('x', ci * cW + 1).attr('y', ri * cH + 1).attr('width', cW - 2).attr('height', cH - 2).attr('rx', 4).attr('fill', pctColor(pct)).attr('cursor', 'pointer');
      if (pct !== null && cW > 22) g.append('text').attr('class', 'hm-val').attr('x', ci * cW + cW / 2).attr('y', ri * cH + cH / 2).text(pct + '%');
      cell.on('mouseenter', (e) => showTip(`<div class="tt-title">${DLABEL[diag]} · ${escH(col)}</div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${pos.length}</span></div><div class="tt-row"><span class="tt-key">Negativos</span><span class="tt-val neg-tag">${rows.length - pos.length}</span></div><div class="tt-row"><span class="tt-key">Total</span><span class="tt-val">${rows.length}</span></div><div class="tt-row"><span class="tt-key">% Positivos</span><span class="tt-val">${pct !== null ? pct + '%' : '—'}</span></div>`, e)).on('mouseleave', hideTip);
    });
  });
}

// ── CALENDARIO ──
function drawCalendar() {
  const data = filtered(); const svg = d3.select('#calendar'); svg.selectAll('*').remove();
  const el = $('calendar'); if (!el) return; const wrapper = el.parentElement;
  let cardEl = wrapper; while (cardEl && !cardEl.classList.contains('card')) cardEl = cardEl.parentElement;
  const isFS = cardEl && cardEl.classList.contains('is-fs');
  const W_avail = Math.max((wrapper && wrapper.clientWidth) || 400, 320);
  const DA = DIAGS.filter((d) => activeDiags.has(d));
  const H = isFS ? Math.max(360, window.innerHeight - 180) : 220;
  const gran = resolveGran(activeFechas.size), gl = granKeyLabel(gran);
  const autoBtn = document.querySelector('#cal-gran-tabs [data-gran="auto"]'); if (autoBtn) autoBtn.textContent = (timeGran === 'auto') ? `Auto · ${GRAN_SHORT[gran]}` : 'Auto';
  const allKeys = [...new Set([...activeFechas].map(gl.key))].sort();
  const visibleKeys = allKeys.filter((k) => !calSuppressed.has(k));
  const calHidden = allKeys.filter((k) => calSuppressed.has(k));
  renderSuppressBar('cal-suppress-bar', calHidden.map((k) => gl.label(k)), (label) => { const k = calHidden.find((x) => gl.label(x) === label); if (k) { calSuppressed.delete(k); drawCalendar(); } }, () => { calHidden.forEach((k) => calSuppressed.delete(k)); drawCalendar(); });
  if (!visibleKeys.length || !DA.length) {
    svg.attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W_avail} ${H}`);
    if (calHidden.length) svg.append('text').attr('x', W_avail / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Todas las fechas ocultas · usa los chips');
    return;
  }
  const needsRotation = visibleKeys.length > 8, labelAngle = needsRotation ? -42 : 0;
  const mL = 56, mR = 10, mT = needsRotation ? 60 : 30, mB = 32;
  const minColW = needsRotation ? 26 : 50, maxColW = isFS ? 96 : 68;
  const cW = Math.max(minColW, Math.min(maxColW, (W_avail - mL - mR) / visibleKeys.length));
  const requiredW = mL + cW * visibleKeys.length + mR, W_svg = Math.max(W_avail, requiredW);
  const cH = Math.min(isFS ? 72 : 42, (H - mT - mB) / Math.max(DA.length, 1));
  svg.attr('width', requiredW > W_avail ? W_svg : '100%').attr('height', H).attr('viewBox', `0 0 ${W_svg} ${H}`);
  const g = svg.append('g').attr('transform', `translate(${mL},${mT})`);
  visibleKeys.forEach((key, di) => {
    const cx = di * cW + cW / 2, lab = gl.label(key);
    const t = g.append('text').attr('fill', TH.muted).attr('font-size', 9).style('cursor', 'pointer');
    if (labelAngle) t.attr('transform', `translate(${cx},-6) rotate(${labelAngle})`).attr('text-anchor', 'start');
    else t.attr('x', cx).attr('y', -8).attr('text-anchor', 'middle');
    t.text(lab).append('title').text(`${lab} · (click para ocultar)`);
    t.on('click', () => { calSuppressed.add(key); drawCalendar(); });
  });
  DA.forEach((diag, ri) => {
    g.append('text').attr('class', 'hm-label').attr('x', -6).attr('y', ri * cH + cH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', DCOLOR[diag]).attr('font-weight', '700').text(DLABEL[diag]);
    visibleKeys.forEach((key, di) => {
      const rows = data.filter((r) => gl.key(r.f) === key && hasVal(r[diag]));
      const pos = rows.filter((r) => isPos(r[diag]));
      const pct = rows.length ? Math.round(pos.length / rows.length * 100) : null;
      const cell = g.append('rect').attr('x', di * cW + 1).attr('y', ri * cH + 1).attr('width', cW - 2).attr('height', cH - 2).attr('rx', 3).attr('fill', pctColor(pct)).attr('cursor', 'pointer');
      if (pct !== null && cW > 26) g.append('text').attr('class', 'hm-val').attr('x', di * cW + cW / 2).attr('y', ri * cH + cH / 2).attr('font-size', 9).text(pct + '%');
      cell.on('mouseenter', (e) => showTip(`<div class="tt-title">${DLABEL[diag]} · ${gl.label(key)}</div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${pos.length}</span></div><div class="tt-row"><span class="tt-key">Total</span><span class="tt-val">${rows.length}</span></div><div class="tt-row"><span class="tt-key">%</span><span class="tt-val">${pct !== null ? pct + '%' : 'Sin datos'}</span></div>`, e)).on('mouseleave', hideTip);
    });
  });
  const defs = svg.append('defs'); const gr = defs.append('linearGradient').attr('id', 'cg').attr('x1', '0%').attr('x2', '100%');
  gr.append('stop').attr('offset', '0%').attr('stop-color', '#22c55e'); gr.append('stop').attr('offset', '50%').attr('stop-color', '#f59e0b'); gr.append('stop').attr('offset', '100%').attr('stop-color', '#ef4444');
  const gx = Math.min(W_svg, W_avail) - 86;
  svg.append('rect').attr('x', gx).attr('y', H - 14).attr('width', 80).attr('height', 7).attr('rx', 3).attr('fill', 'url(#cg)');
  svg.append('text').attr('x', gx - 2).attr('y', H - 16).attr('fill', TH.muted).attr('font-size', 9).text('0%');
  svg.append('text').attr('x', gx + 78).attr('y', H - 16).attr('text-anchor', 'end').attr('fill', TH.muted).attr('font-size', 9).text('100%');
}

// ── SWARM ──
function drawSwarm() {
  const data = filtered().filter((r) => r.f === swarmDate); const svg = d3.select('#swarm'); svg.selectAll('*').remove();
  if (!$('swarm')) return; const { W, H } = svgDims('swarm', 300, 220);
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
  if (!data.length || !swarmDate) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin datos para esta fecha'); return; }
  const isAll = swarmDiag === 'ALL';
  const diagsUsed = isAll ? DIAGS.filter((d) => activeDiags.has(d)) : [activeDiags.has(swarmDiag) ? swarmDiag : (DIAGS.find((d) => activeDiags.has(d)) || DIAGS[0])];
  const diag = diagsUsed[0];
  const lugares = [...new Set(data.map((r) => r.lugar))].sort();
  const mL = 86, mT = 10, mB = 20;
  const yS = d3.scaleBand().domain(lugares).range([mT, H - mB]).padding(0.3);
  const g = svg.append('g');
  lugares.forEach((l) => {
    const cy = yS(l) + yS.bandwidth() / 2;
    g.append('line').attr('x1', mL).attr('x2', W - 8).attr('y1', cy).attr('y2', cy).attr('stroke', TH.grid).attr('stroke-dasharray', '3,3');
    g.append('text').attr('x', mL - 5).attr('y', cy).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', TH.muted).attr('font-size', 9).text(l.length > 12 ? l.slice(0, 11) + '…' : l);
  });
  const xBy = {};
  data.forEach((r) => {
    if (!xBy[r.lugar]) xBy[r.lugar] = 0;
    const cx = mL + 10 + xBy[r.lugar] * 12; xBy[r.lugar]++;
    const cy = yS(r.lugar) + yS.bandwidth() / 2 + (Math.random() - 0.5) * yS.bandwidth() * 0.4;
    let fill, stroke, tipDiags;
    if (isAll) {
      const anyPos = diagsUsed.some((d) => isPos(r[d])), anyMeas = diagsUsed.some((d) => hasVal(r[d]));
      fill = !anyMeas ? '#334155' : anyPos ? '#ef4444' : '#22c55e'; stroke = !anyMeas ? '#475569' : anyPos ? '#fca5a5' : '#86efac';
      tipDiags = diagsUsed.map((d) => `<div class="tt-row"><span class="tt-key">${DLABEL[d]}</span><span class="tt-val ${isPos(r[d]) ? 'pos-tag' : 'neg-tag'}">${r[d] || '—'}</span></div>`).join('');
    } else {
      const v = r[diag]; fill = !hasVal(v) ? '#334155' : isPos(v) ? '#ef4444' : '#22c55e'; stroke = !hasVal(v) ? '#475569' : isPos(v) ? '#fca5a5' : '#86efac';
      tipDiags = `<div class="tt-row"><span class="tt-key">${DLABEL[diag]}</span><span class="tt-val ${isPos(r[diag]) ? 'pos-tag' : 'neg-tag'}">${r[diag] || '—'}</span></div>`;
    }
    g.append('circle').attr('cx', Math.min(cx, W - 12)).attr('cy', cy).attr('r', 5).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 1.5).attr('cursor', 'pointer')
      .on('mouseenter', (e) => showTip(`<div class="tt-title">${escH(r.lugar)} · ${escH(r.tq)}</div><div class="tt-row"><span class="tt-key">Corrida</span><span class="tt-val">${escH(r.corrida || '—')}</span></div><div class="tt-row"><span class="tt-key">Código</span><span class="tt-val">${escH(r.cod || '—')}</span></div><div class="tt-row"><span class="tt-key">Estadío</span><span class="tt-val">${escH(r.estadio || r.sexo || '—')}</span></div>${tipDiags}`, e)).on('mouseleave', hideTip);
  });
  svg.append('text').attr('x', W - 4).attr('y', H - 4).attr('text-anchor', 'end').attr('fill', isAll ? TH.muted : DCOLOR[diag]).attr('font-size', 10).attr('font-weight', '700').text(isAll ? 'Todos (peor caso)' : '● ' + DLABEL[diag]);
}

// ── TREEMAP ──
function drawTreemap() {
  const data = filtered(); const svg = d3.select('#treemap'); svg.selectAll('*').remove();
  if (!$('treemap')) return; const { W, H } = svgDims('treemap', 500, 280);
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
  if (!data.length) return;
  const isAll = treemapDiag === 'ALL';
  const diagsUsed = isAll ? DIAGS.filter((d) => activeDiags.has(d)) : [treemapDiag];
  const diagColor = isAll ? TH.muted : DCOLOR[treemapDiag], diagLabel = isAll ? 'Todos' : DLABEL[treemapDiag];
  const h = {};
  data.forEach((r) => { (h[r.lugar] ||= {}); const t = r.tq || '—'; (h[r.lugar][t] ||= { n: 0, posSum: 0, measuredSum: 0 }); h[r.lugar][t].n++; diagsUsed.forEach((d) => { if (hasVal(r[d])) { h[r.lugar][t].measuredSum++; if (isPos(r[d])) h[r.lugar][t].posSum++; } }); });
  const rootD = { name: 'r', children: Object.entries(h).map(([lugar, tanks]) => ({ name: lugar, children: Object.entries(tanks).filter(([, v]) => v.measuredSum > 0).map(([tq, v]) => ({ name: tq, lugar, value: v.n, pct: Math.round(v.posSum / v.measuredSum * 100), pos: v.posSum, measured: v.measuredSum })) })).filter((p) => p.children.length > 0) };
  if (!rootD.children.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin muestras evaluadas'); return; }
  const root = d3.hierarchy(rootD).sum((d) => d.value).sort((a, b) => b.value - a.value);
  d3.treemap().size([W, H]).padding(2).paddingTop(18)(root);
  const g = svg.append('g');
  root.leaves().forEach((node) => {
    const d = node.data, w = node.x1 - node.x0, ht = node.y1 - node.y0;
    g.append('rect').attr('x', node.x0).attr('y', node.y0).attr('width', w).attr('height', ht).attr('rx', 4).attr('fill', pctColor(d.pct)).attr('cursor', 'pointer')
      .on('mouseenter', (e) => showTip(`<div class="tt-title">${escH(d.lugar)} · ${escH(d.name)}</div><div class="tt-row"><span class="tt-key">Diagnóstico</span><span class="tt-val" style="color:${diagColor}">${diagLabel}</span></div><div class="tt-row"><span class="tt-key">Muestras</span><span class="tt-val">${d.value}</span></div><div class="tt-row"><span class="tt-key">Medidas</span><span class="tt-val">${d.measured}</span></div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${d.pos}</span></div><div class="tt-row"><span class="tt-key">% Positivo</span><span class="tt-val ${d.pct > 50 ? 'pos-tag' : 'neg-tag'}">${d.pct}%</span></div>`, e)).on('mouseleave', hideTip);
    if (w > 32 && ht > 20) g.append('text').attr('x', node.x0 + 5).attr('y', node.y0 + 13).attr('fill', '#fff').attr('font-size', Math.min(11, w / 5)).attr('font-weight', '600').attr('pointer-events', 'none').text(d.name);
    if (ht > 30 && w > 42) g.append('text').attr('x', node.x0 + 5).attr('y', node.y0 + 25).attr('fill', 'rgba(255,255,255,.75)').attr('font-size', 9).attr('pointer-events', 'none').text(d.pct + '%');
  });
  root.descendants().filter((n) => n.depth === 1).forEach((node) => { g.append('text').attr('x', node.x0 + 4).attr('y', node.y0 + 12).attr('fill', TH.muted).attr('font-size', 10).attr('font-weight', '700').text(node.data.name.length > 14 ? node.data.name.slice(0, 13) + '…' : node.data.name); });
}

// ── TREND ──
function drawTrend() {
  const data = filtered(); const svg = d3.select('#trend'); svg.selectAll('*').remove();
  if (!$('trend')) return; const { W, H } = svgDims('trend', 460, 220);
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
  const legendEl = $('trend-legend'); if (legendEl) legendEl.innerHTML = '';
  const dates = [...activeFechas].sort();
  if (!dates.length || !data.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin datos'); return; }
  const isAll = trendDiag === 'ALL';
  const diagsUsed = isAll ? DIAGS.filter((d) => activeDiags.has(d)) : (activeDiags.has(trendDiag) ? [trendDiag] : []);
  if (!diagsUsed.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Selecciona un diagnóstico activo'); return; }
  const series = diagsUsed.map((d) => ({ diag: d, points: dates.map((date) => { const rows = data.filter((r) => r.f === date && hasVal(r[d])); const pos = rows.filter((r) => isPos(r[d])).length; return { date, pct: rows.length ? Math.round(pos / rows.length * 100) : null, pos, total: rows.length }; }).filter((p) => p.pct !== null) })).filter((s) => s.points.length > 0);
  if (!series.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin mediciones en el período'); return; }
  const mL = 40, mR = 16, mT = 14, mB = 32;
  const xS = (dates.length === 1) ? () => (W + mL - mR) / 2 : d3.scalePoint().domain(dates).range([mL + 8, W - mR - 8]).padding(0.5);
  const yS = d3.scaleLinear().domain([0, 100]).range([H - mB, mT]);
  [0, 25, 50, 75, 100].forEach((v) => {
    svg.append('line').attr('x1', mL).attr('x2', W - mR).attr('y1', yS(v)).attr('y2', yS(v)).attr('stroke', TH.grid).attr('stroke-dasharray', '2,3').attr('stroke-width', 1);
    svg.append('text').attr('x', mL - 6).attr('y', yS(v) + 3).attr('text-anchor', 'end').attr('fill', TH.muted).attr('font-size', 9).text(v + '%');
  });
  const step = Math.max(1, Math.ceil(dates.length / 8));
  dates.forEach((d, i) => { if (i % step === 0 || i === dates.length - 1) svg.append('text').attr('x', xS(d)).attr('y', H - 12).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).text(fmtD(d)); });
  const line = d3.line().x((p) => xS(p.date)).y((p) => yS(p.pct)).curve(d3.curveMonotoneX);
  series.forEach((s) => {
    if (s.points.length >= 2) svg.append('path').attr('d', line(s.points)).attr('fill', 'none').attr('stroke', DCOLOR[s.diag]).attr('stroke-width', 2).attr('opacity', 0.85);
    s.points.forEach((p) => {
      svg.append('circle').attr('cx', xS(p.date)).attr('cy', yS(p.pct)).attr('r', 4).attr('fill', DCOLOR[s.diag]).attr('stroke', TH.surface).attr('stroke-width', 1.5).attr('cursor', 'pointer')
        .on('mouseenter', (e) => showTip(`<div class="tt-title">${DLABEL[s.diag]} · ${fmtD(p.date)}</div><div class="tt-row"><span class="tt-key">% Positivos</span><span class="tt-val">${p.pct}%</span></div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${p.pos}</span></div><div class="tt-row"><span class="tt-key">Total medidos</span><span class="tt-val">${p.total}</span></div>`, e)).on('mouseleave', hideTip);
    });
  });
  if (legendEl) series.forEach((s) => { const item = document.createElement('div'); item.className = 'leg-item'; const dot = document.createElement('div'); dot.className = 'leg-dot'; dot.style.background = DCOLOR[s.diag]; item.appendChild(dot); item.appendChild(document.createTextNode(DLABEL[s.diag])); legendEl.appendChild(item); });
}

// ── DONUT ──
function drawDonut() {
  const data = filtered(); const svg = d3.select('#donut'); svg.selectAll('*').remove();
  if (!$('donut')) return; const { W, H } = svgDims('donut', 420, 300);
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
  if (!data.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin datos'); return; }
  const slices = DIAGS.filter((d) => activeDiags.has(d)).map((d) => { const measured = data.filter((r) => hasVal(r[d])); return { diag: d, count: measured.filter((r) => isPos(r[d])).length, measured: measured.length }; });
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (!total) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin positivos detectados'); return; }
  const visible = slices.filter((s) => s.count > 0);
  const LABEL_PAD = 120, cx = W / 2, cy = H / 2;
  const radius = Math.max(50, Math.min(W / 2 - LABEL_PAD, H / 2 - 30)), innerR = radius * 0.58;
  const defs = svg.append('defs');
  visible.forEach((s) => { defs.append('marker').attr('id', `donut-arrow-${s.diag}`).attr('viewBox', '0 0 10 10').attr('refX', 8).attr('refY', 5).attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto').append('path').attr('d', 'M0,0 L10,5 L0,10 Z').attr('fill', DCOLOR[s.diag]); });
  const pie = d3.pie().value((d) => d.count).sort(null);
  const arc = d3.arc().innerRadius(innerR).outerRadius(radius);
  const midArc = d3.arc().innerRadius((radius + innerR) / 2).outerRadius((radius + innerR) / 2);
  const outerArc = d3.arc().innerRadius(radius + 14).outerRadius(radius + 14);
  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);
  const arcs = pie(visible);
  arcs.forEach((a) => {
    const pct = Math.round(a.data.count / total * 100);
    g.append('path').attr('d', arc(a)).attr('fill', DCOLOR[a.data.diag]).attr('stroke', TH.surface).attr('stroke-width', 2).attr('cursor', 'pointer')
      .on('mouseenter', (e) => showTip(`<div class="tt-title">${DLABEL[a.data.diag]}</div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${a.data.count}</span></div><div class="tt-row"><span class="tt-key">Medidos</span><span class="tt-val">${a.data.measured}</span></div><div class="tt-row"><span class="tt-key">% del total positivos</span><span class="tt-val">${pct}%</span></div><div class="tt-row"><span class="tt-key">% positividad propia</span><span class="tt-val">${a.data.measured ? Math.round(a.data.count / a.data.measured * 100) : 0}%</span></div>`, e)).on('mouseleave', hideTip);
  });
  const minGap = 28, yLimit = H / 2 - 12;
  const labels = arcs.map((a) => { const p0 = midArc.centroid(a), p1 = outerArc.centroid(a); return { a, p0, p1, isRight: p1[0] >= 0, y: p1[1], pct: Math.round(a.data.count / total * 100) }; });
  [true, false].forEach((isRight) => {
    const grp = labels.filter((l) => l.isRight === isRight).sort((u, v) => u.y - v.y); if (!grp.length) return;
    for (let i = 1; i < grp.length; i++) { if (grp[i].y - grp[i - 1].y < minGap) grp[i].y = grp[i - 1].y + minGap; }
    const overflow = grp[grp.length - 1].y - yLimit; if (overflow > 0) grp.forEach((l) => { l.y -= overflow; });
    if (grp[0].y < -yLimit) { const s = -yLimit - grp[0].y; grp.forEach((l) => { l.y += s; }); }
  });
  labels.forEach(({ a, p0, p1, isRight, y, pct }) => {
    const labelX = (isRight ? 1 : -1) * (radius + LABEL_PAD - 22);
    g.append('polyline').attr('points', `${p0[0]},${p0[1]} ${p1[0]},${p1[1]} ${labelX},${y}`).attr('fill', 'none').attr('stroke', DCOLOR[a.data.diag]).attr('stroke-width', 1.3).attr('opacity', 0.85).attr('marker-end', `url(#donut-arrow-${a.data.diag})`);
    const textX = labelX + (isRight ? 8 : -8), anchor = isRight ? 'start' : 'end';
    g.append('text').attr('x', textX).attr('y', y - 5).attr('text-anchor', anchor).attr('dominant-baseline', 'middle').attr('fill', DCOLOR[a.data.diag]).attr('font-size', 11).attr('font-weight', '700').text(`${DLABEL[a.data.diag]} · ${pct}%`);
    g.append('text').attr('x', textX).attr('y', y + 9).attr('text-anchor', anchor).attr('dominant-baseline', 'middle').attr('fill', TH.muted).attr('font-size', 10).text(`${a.data.count} positivos`);
  });
  g.append('text').attr('text-anchor', 'middle').attr('y', -8).attr('fill', TH.muted).attr('font-size', 10).text('Total positivos');
  g.append('text').attr('text-anchor', 'middle').attr('y', 18).attr('fill', TH.text).attr('font-size', 26).attr('font-weight', '800').text(total);
}

// ── SANKEY ──
function setSankeyMode(mode) {
  sankeyMode = (sankeyMode === mode) ? 'normal' : mode;
  const oBtn = $('sankey-mode-btn'), pBtn = $('sankey-psm-btn'), title = $('sankey-title');
  if (oBtn) { oBtn.classList.toggle('on', sankeyMode === 'origen'); oBtn.setAttribute('aria-pressed', sankeyMode === 'origen'); }
  if (pBtn) { pBtn.classList.toggle('on', sankeyMode === 'psm'); pBtn.setAttribute('aria-pressed', sankeyMode === 'psm'); }
  if (title) title.textContent = sankeyMode === 'origen' ? 'Trazabilidad · Sala → Resultado → Lote → Módulo → Resultado' : sankeyMode === 'psm' ? 'Trazabilidad · Piscina → Sala → Análisis → Módulo → Análisis → Precría' : 'Flujo Operativo · Lugar → Diagnóstico → Resultado';
  updateOriginResetBtn();
  drawSankey();
}
const suppressedForMode = () => [...originSuppressed].filter((k) => sankeyMode === 'psm' ? k.startsWith('psm:') : !k.startsWith('psm:'));
function updateOriginResetBtn() {
  const btn = $('sankey-reset-btn'); if (!btn) return;
  const isTrace = sankeyMode === 'origen' || sankeyMode === 'psm', n = suppressedForMode().length;
  if (isTrace && n > 0) { btn.style.display = ''; btn.textContent = `↺ Restaurar (${n})`; } else btn.style.display = 'none';
}

function drawSankey() {
  if (sankeyMode === 'origen') return drawSankeyOrigen();
  if (sankeyMode === 'psm') return drawSankeyPSM();
  const data = filtered(); const svg = d3.select('#sankey'); svg.selectAll('*').remove();
  if (!$('sankey') || !data.length) return;
  const el = $('sankey');
  const W = Math.max(500, el.getBoundingClientRect().width || (el.parentElement && el.parentElement.clientWidth) || 900);
  const diag = sankeyDiag, lugares = [...new Set(data.map((r) => r.lugar))].sort(), total = data.length || 1, flows = {};
  data.forEach((r) => { if (!hasVal(r[diag])) return; const k = `${r.lugar}|${diag}|${r[diag]}`; flows[k] = (flows[k] || 0) + 1; });
  const NODE_MIN = 20, GAP = 6, LABEL_TOP = 18;
  const lugarN = {}; data.forEach((r) => { lugarN[r.lugar] = (lugarN[r.lugar] || 0) + 1; });
  const lNodes = lugares.map((l) => ({ id: l, h: Math.max(NODE_MIN, (lugarN[l] / total) * 300) }));
  let y = LABEL_TOP; lNodes.forEach((n) => { n.y = y; y += n.h + GAP; });
  const col0H = y;
  const c1Arr = [];
  lugares.forEach((l) => { const t = Object.entries(flows).filter(([k]) => k.startsWith(`${l}|${diag}|`)).reduce((s, [, v]) => s + v, 0); if (t > 0) c1Arr.push({ id: `${l}|${diag}`, diag, lugar: l, t }); });
  y = LABEL_TOP; const c1Y = {};
  c1Arr.forEach((n) => { const h = Math.max(NODE_MIN, (n.t / total) * 300); c1Y[n.id] = { y, h }; y += h + GAP; });
  const col1H = y;
  const dRF = {};
  Object.entries(flows).forEach(([k, v]) => { const [, , r] = k.split('|'); dRF[`${diag}|${r}`] = (dRF[`${diag}|${r}`] || 0) + v; });
  y = LABEL_TOP; const c2Y = {};
  ['Positivo', 'Negativo'].forEach((res) => { const t = dRF[`${diag}|${res}`] || 0; if (t > 0) { const h = Math.max(NODE_MIN, (t / total) * 300); c2Y[`${diag}|${res}`] = { y, h }; y += h + GAP; } });
  const col2H = y, VH = Math.max(col0H, col1H, col2H) + 16;
  const maxLen = lugares.length ? Math.max(...lugares.map((l) => l.length)) : 8;
  const mL = Math.min(130, Math.max(70, maxLen * 6.8)), nW = 14;
  const c0 = mL, c1x = mL + (W - mL) * 0.42, c2x = mL + (W - mL) * 0.76;
  svg.attr('viewBox', `0 0 ${W} ${VH}`);
  const g = svg.append('g');
  Object.entries(flows).forEach(([key, count]) => {
    const [lugar, , result] = key.split('|');
    const srcN = lNodes.find((n) => n.id === lugar), mid = c1Y[`${lugar}|${diag}`], dst = c2Y[`${diag}|${result}`];
    if (!srcN || !mid || !dst) return;
    const sw = Math.max(2, (count / total) * 60), col = result === 'Positivo' ? 'rgba(239,68,68,.35)' : 'rgba(34,197,94,.25)';
    const sy = srcN.y + srcN.h / 2, my = mid.y + mid.h / 2, dy = dst.y + dst.h / 2;
    g.append('path').attr('fill', 'none').attr('stroke', col).attr('stroke-width', sw).attr('opacity', 0.65).attr('d', `M${c0 + nW},${sy} C${(c0 + nW + c1x) / 2},${sy} ${(c0 + nW + c1x) / 2},${my} ${c1x},${my}`);
    g.append('path').attr('fill', 'none').attr('stroke', col).attr('stroke-width', sw).attr('opacity', 0.65).attr('d', `M${c1x + nW},${my} C${(c1x + nW + c2x) / 2},${my} ${(c1x + nW + c2x) / 2},${dy} ${c2x},${dy}`);
  });
  lNodes.forEach((n) => {
    g.append('rect').attr('x', c0).attr('y', n.y).attr('width', nW).attr('height', n.h).attr('rx', 3).attr('fill', '#38bdf8');
    g.append('text').attr('x', c0 - 8).attr('y', n.y + n.h / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', TH.muted).attr('font-size', 11).attr('font-weight', '600').text(n.id);
  });
  c1Arr.forEach((n) => { const { y: ny, h: nh } = c1Y[n.id]; g.append('rect').attr('x', c1x).attr('y', ny).attr('width', nW).attr('height', nh).attr('rx', 3).attr('fill', DCOLOR[n.diag]); if (nh >= 14) g.append('text').attr('x', c1x + nW + 4).attr('y', ny + nh / 2).attr('dominant-baseline', 'middle').attr('fill', DCOLOR[n.diag]).attr('font-size', 9).text(DLABEL[n.diag]); });
  const totalMeasured = Object.values(dRF).reduce((s, v) => s + v, 0) || 1;
  Object.entries(c2Y).forEach(([key, { y: ny, h: nh }]) => {
    const [, res] = key.split('|'), count = dRF[key] || 0, pct = Math.round(count / totalMeasured * 100), fill = res === 'Positivo' ? '#ef4444' : '#22c55e';
    const rect = g.append('rect').attr('x', c2x).attr('y', ny).attr('width', nW).attr('height', nh).attr('rx', 3).attr('fill', fill).attr('cursor', 'pointer');
    if (nh >= 14) g.append('text').attr('x', c2x + nW + 4).attr('y', ny + nh / 2).attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('pointer-events', 'none').text(`${DLABEL[diag]} ${res}`);
    const labelX = c2x + nW + 4 + (`${DLABEL[diag]} ${res}`.length * 5.5) + 6;
    if (nh >= 14 && labelX < W - 10) {
      g.append('rect').attr('x', labelX - 2).attr('y', ny + nh / 2 - 8).attr('width', 34).attr('height', 16).attr('rx', 4).attr('fill', res === 'Positivo' ? 'rgba(239,68,68,.18)' : 'rgba(34,197,94,.15)').attr('pointer-events', 'none');
      g.append('text').attr('x', labelX + 15).attr('y', ny + nh / 2).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('font-weight', '700').attr('pointer-events', 'none').text(`${pct}%`);
    }
    rect.on('mouseenter', (e) => showTip(`<div class="tt-title">${DLABEL[diag]} · ${res}</div><div class="tt-row"><span class="tt-key">Muestras</span><span class="tt-val">${count}</span></div><div class="tt-row"><span class="tt-key">Total medidas</span><span class="tt-val">${totalMeasured}</span></div><div class="tt-row"><span class="tt-key">% del total</span><span class="tt-val ${res === 'Positivo' ? 'pos-tag' : 'neg-tag'}">${pct}%</span></div>`, e)).on('mouseleave', hideTip);
  });
  [{ x: c0, l: 'Lugar' }, { x: c1x, l: 'Diagnóstico' }, { x: c2x, l: 'Resultado' }].forEach(({ x, l }) => g.append('text').attr('x', x + nW / 2).attr('y', 10).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).attr('font-weight', '700').text(l));
}

const _isSala = (l) => /^\s*sala/i.test(l || ''); const _isModulo = (l) => /^\s*m[oó]dulo/i.test(l || '');
function drawSankeyOrigen() {
  const data = filtered(); const svg = d3.select('#sankey'); svg.selectAll('*').remove();
  if (!$('sankey') || !data.length) return;
  const el = $('sankey'), W = Math.max(740, el.getBoundingClientRect().width || (el.parentElement && el.parentElement.clientWidth) || 900), diag = sankeyDiag;
  const sup = (type, id) => originSuppressed.has(`${type}|${id}`);
  const baseValid = data.filter((r) => hasVal(r[diag]) && r.cod);
  const validSala = baseValid.filter((r) => _isSala(r.lugar) && !sup('sala', r.lugar) && !sup('lote', r.cod));
  const validMod = baseValid.filter((r) => _isModulo(r.lugar) && !sup('mod', r.lugar) && !sup('lote', r.cod));
  if (!validSala.length && !validMod.length) { svg.attr('viewBox', `0 0 ${W} 220`); svg.append('text').attr('x', W / 2).attr('y', 110).attr('fill', TH.muted).attr('text-anchor', 'middle').text(originSuppressed.size ? 'Todos los elementos ocultos · pulsa Restaurar' : 'Sin datos de trazabilidad para el diagnóstico'); return; }
  const salaCount = {}, salaResCount = {}, resSalaCount = { Positivo: 0, Negativo: 0 }, resSalaLoteCount = {}, codSalaCount = {};
  validSala.forEach((r) => { salaCount[r.lugar] = (salaCount[r.lugar] || 0) + 1; salaResCount[`${r.lugar}|${r[diag]}`] = (salaResCount[`${r.lugar}|${r[diag]}`] || 0) + 1; resSalaCount[r[diag]] = (resSalaCount[r[diag]] || 0) + 1; resSalaLoteCount[`${r[diag]}|${r.cod}`] = (resSalaLoteCount[`${r[diag]}|${r.cod}`] || 0) + 1; codSalaCount[r.cod] = (codSalaCount[r.cod] || 0) + 1; });
  const modCount = {}, codModCount = {}, modResCount = {}, resModCount = { Positivo: 0, Negativo: 0 }, codModTotal = {};
  validMod.forEach((r) => { modCount[r.lugar] = (modCount[r.lugar] || 0) + 1; codModCount[`${r.cod}|${r.lugar}`] = (codModCount[`${r.cod}|${r.lugar}`] || 0) + 1; modResCount[`${r.lugar}|${r[diag]}`] = (modResCount[`${r.lugar}|${r[diag]}`] || 0) + 1; resModCount[r[diag]] = (resModCount[r[diag]] || 0) + 1; codModTotal[r.cod] = (codModTotal[r.cod] || 0) + 1; });
  const salas = Object.keys(salaCount).sort(), codigos = [...new Set([...Object.keys(codSalaCount), ...Object.keys(codModTotal)])].sort(), modulos = Object.keys(modCount).sort();
  const resSala = ['Positivo', 'Negativo'].filter((r) => resSalaCount[r] > 0), resMod = ['Positivo', 'Negativo'].filter((r) => resModCount[r] > 0);
  if (!salas.length && !modulos.length) { svg.attr('viewBox', `0 0 ${W} 220`); svg.append('text').attr('x', W / 2).attr('y', 110).attr('fill', TH.muted).attr('text-anchor', 'middle').text('No se detectaron Salas/Módulos (Lugares deben iniciar con "Sala" o "Módulo")'); return; }
  const codSize = (c) => Math.max(codSalaCount[c] || 0, codModTotal[c] || 0);
  const totalSala = salas.reduce((s, k) => s + salaCount[k], 0), totalCod = codigos.reduce((s, c) => s + codSize(c), 0), totalMod = modulos.reduce((s, m) => s + modCount[m], 0);
  const totalResSala = resSala.reduce((s, r) => s + resSalaCount[r], 0), totalResMod = resMod.reduce((s, r) => s + resModCount[r], 0);
  const maxCol = Math.max(totalSala, totalResSala, totalCod, totalMod, totalResMod, 1);
  const NODE_MIN = 14, GAP = 4, HEADER_Y = 8, LABEL_TOP = 34;
  const maxItems = Math.max(salas.length, resSala.length, codigos.length, modulos.length, resMod.length, 1);
  const availH = Math.max(140, 400 - (maxItems - 1) * GAP), SCALE = availH / maxCol, h = (c) => Math.max(NODE_MIN, c * SCALE);
  const positionCol = (items, getCount) => { let y = LABEL_TOP; const pos = {}; items.forEach((id) => { const ht = h(getCount(id)); pos[id] = { y, h: ht }; y += ht + GAP; }); return { pos, bottom: y }; };
  const salaPos = positionCol(salas, (s) => salaCount[s]), resSalaPos = positionCol(resSala, (r) => resSalaCount[r]), codPos = positionCol(codigos, codSize), modPos = positionCol(modulos, (m) => modCount[m]), resModPos = positionCol(resMod, (r) => resModCount[r]);
  const VH = Math.max(salaPos.bottom, resSalaPos.bottom, codPos.bottom, modPos.bottom, resModPos.bottom, 240) + 18;
  const salaMaxLen = salas.length ? Math.max(...salas.map((s) => s.length)) : 6, mL = Math.min(130, Math.max(60, salaMaxLen * 6.8));
  const resModMaxLen = resMod.length ? Math.max(...resMod.map((r) => (`${DLABEL[diag]} ${r}`).length)) : 12, mR = Math.min(210, Math.max(110, resModMaxLen * 6.4 + 60));
  const nW = 11, cWidth = W - mL - mR - nW, cx = (i) => mL + cWidth * (i / 4), c0 = cx(0), c1 = cx(1), c2 = cx(2), c3 = cx(3), c4 = cx(4);
  svg.attr('viewBox', `0 0 ${W} ${VH}`); const g = svg.append('g');
  const linkW = (cnt) => Math.max(1.5, (cnt / maxCol) * 32);
  const drawLink = (x1, y1, x2, y2, w, color) => { const mx = (x1 + x2) / 2; g.append('path').attr('fill', 'none').attr('stroke', color).attr('stroke-width', w).attr('opacity', 0.65).attr('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); };
  salas.forEach((s) => { const sY = salaPos.pos[s].y + salaPos.pos[s].h / 2; resSala.forEach((r) => { const cnt = salaResCount[`${s}|${r}`] || 0; if (!cnt) return; const rY = resSalaPos.pos[r].y + resSalaPos.pos[r].h / 2; drawLink(c0 + nW, sY, c1, rY, linkW(cnt), r === 'Positivo' ? 'rgba(239,68,68,.5)' : 'rgba(34,197,94,.38)'); }); });
  resSala.forEach((r) => { const rY = resSalaPos.pos[r].y + resSalaPos.pos[r].h / 2; codigos.forEach((c) => { const cnt = resSalaLoteCount[`${r}|${c}`] || 0; if (!cnt) return; const cY = codPos.pos[c].y + codPos.pos[c].h / 2; drawLink(c1 + nW, rY, c2, cY, linkW(cnt), r === 'Positivo' ? 'rgba(239,68,68,.4)' : 'rgba(34,197,94,.3)'); }); });
  Object.entries(codModCount).forEach(([k, cnt]) => { const [c, m] = k.split('|'); if (!codPos.pos[c] || !modPos.pos[m]) return; drawLink(c2 + nW, codPos.pos[c].y + codPos.pos[c].h / 2, c3, modPos.pos[m].y + modPos.pos[m].h / 2, linkW(cnt), 'rgba(167,139,250,.45)'); });
  Object.entries(modResCount).forEach(([k, cnt]) => { const [m, r] = k.split('|'); if (!modPos.pos[m] || !resModPos.pos[r]) return; drawLink(c3 + nW, modPos.pos[m].y + modPos.pos[m].h / 2, c4, resModPos.pos[r].y + resModPos.pos[r].h / 2, linkW(cnt), r === 'Positivo' ? 'rgba(239,68,68,.5)' : 'rgba(34,197,94,.38)'); });
  const nodeTip = (sel, title, rows) => sel.on('mouseenter', (e) => showTip(`<div class="tt-title">${escH(title)}</div>` + rows.map(([k, v, cls]) => `<div class="tt-row"><span class="tt-key">${k}</span><span class="tt-val ${cls || ''}">${v}</span></div>`).join(''), e)).on('mouseleave', hideTip);
  const clickHide = (type, id) => () => { originSuppressed.add(`${type}|${id}`); updateOriginResetBtn(); drawSankey(); };
  const drawPctBadge = (labelX, labelText, fill, isP, p, pct) => { const bx = labelX + labelText.length * 5.5 + 4; g.append('rect').attr('x', bx).attr('y', p.y + p.h / 2 - 8).attr('width', 34).attr('height', 16).attr('rx', 4).attr('fill', isP ? 'rgba(239,68,68,.18)' : 'rgba(34,197,94,.15)').attr('pointer-events', 'none'); g.append('text').attr('x', bx + 17).attr('y', p.y + p.h / 2).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('font-weight', '700').attr('pointer-events', 'none').text(pct + '%'); };
  salas.forEach((s) => { const p = salaPos.pos[s]; const rect = g.append('rect').attr('x', c0).attr('y', p.y).attr('width', nW).attr('height', p.h).attr('rx', 3).attr('fill', '#38bdf8').attr('cursor', 'pointer'); nodeTip(rect, `Sala · ${s}`, [['Muestras', salaCount[s]], ['% del total Sala', totalSala ? Math.round(salaCount[s] / totalSala * 100) + '%' : '—'], ['Acción', 'Click para ocultar']]); rect.on('click', clickHide('sala', s)); const lbl = g.append('text').attr('x', c0 - 6).attr('y', p.y + p.h / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', TH.muted).attr('font-size', 10).attr('font-weight', '600').attr('cursor', 'pointer').text(s.length > 16 ? s.slice(0, 15) + '…' : s); lbl.on('click', clickHide('sala', s)); });
  resSala.forEach((r) => { const p = resSalaPos.pos[r], isP = r === 'Positivo', fill = isP ? '#ef4444' : '#22c55e'; const rect = g.append('rect').attr('x', c1).attr('y', p.y).attr('width', nW).attr('height', p.h).attr('rx', 3).attr('fill', fill); const pct = totalResSala ? Math.round(resSalaCount[r] / totalResSala * 100) : 0; nodeTip(rect, `Sala · ${DLABEL[diag]} ${r}`, [['Muestras', resSalaCount[r]], ['% del total Sala', pct + '%', isP ? 'pos-tag' : 'neg-tag']]); if (p.h >= 14) { const lt = `${DLABEL[diag]} ${r}`, lx = c1 + nW + 4; g.append('text').attr('x', lx).attr('y', p.y + p.h / 2).attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('font-weight', '600').attr('pointer-events', 'none').text(lt); drawPctBadge(lx, lt, fill, isP, p, pct); } });
  codigos.forEach((c) => { const p = codPos.pos[c]; const rect = g.append('rect').attr('x', c2).attr('y', p.y).attr('width', nW).attr('height', p.h).attr('rx', 3).attr('fill', '#a78bfa').attr('cursor', 'pointer'); nodeTip(rect, `Lote · ${c}`, [['Desde Sala', codSalaCount[c] || 0], ['Hacia Módulo', codModTotal[c] || 0], ['Acción', 'Click para ocultar']]); rect.on('click', clickHide('lote', c)); if (p.h >= 11) { const lbl = g.append('text').attr('x', c2 + nW + 4).attr('y', p.y + p.h / 2).attr('dominant-baseline', 'middle').attr('fill', '#a78bfa').attr('font-size', 9).attr('cursor', 'pointer').text(c.length > 14 ? c.slice(0, 13) + '…' : c); lbl.on('click', clickHide('lote', c)); } });
  modulos.forEach((m) => { const p = modPos.pos[m]; const rect = g.append('rect').attr('x', c3).attr('y', p.y).attr('width', nW).attr('height', p.h).attr('rx', 3).attr('fill', '#22d3ee').attr('cursor', 'pointer'); nodeTip(rect, `Módulo · ${m}`, [['Muestras', modCount[m]], ['% del total Módulo', totalMod ? Math.round(modCount[m] / totalMod * 100) + '%' : '—'], ['Acción', 'Click para ocultar']]); rect.on('click', clickHide('mod', m)); if (p.h >= 11) { const lbl = g.append('text').attr('x', c3 + nW + 4).attr('y', p.y + p.h / 2).attr('dominant-baseline', 'middle').attr('fill', '#22d3ee').attr('font-size', 9).attr('cursor', 'pointer').text(m.length > 14 ? m.slice(0, 13) + '…' : m); lbl.on('click', clickHide('mod', m)); } });
  resMod.forEach((r) => { const p = resModPos.pos[r], isP = r === 'Positivo', fill = isP ? '#ef4444' : '#22c55e'; const rect = g.append('rect').attr('x', c4).attr('y', p.y).attr('width', nW).attr('height', p.h).attr('rx', 3).attr('fill', fill); const pct = totalResMod ? Math.round(resModCount[r] / totalResMod * 100) : 0; nodeTip(rect, `Módulo · ${DLABEL[diag]} ${r}`, [['Muestras', resModCount[r]], ['% del total Módulo', pct + '%', isP ? 'pos-tag' : 'neg-tag']]); if (p.h >= 14) { const lt = `${DLABEL[diag]} ${r}`, lx = c4 + nW + 4; g.append('text').attr('x', lx).attr('y', p.y + p.h / 2).attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('font-weight', '600').attr('pointer-events', 'none').text(lt); drawPctBadge(lx, lt, fill, isP, p, pct); } });
  [{ x: c0, l: 'Sala' }, { x: c1, l: 'Resultado' }, { x: c2, l: 'Lote / Código' }, { x: c3, l: 'Módulo' }, { x: c4, l: 'Resultado' }].forEach(({ x, l }) => g.append('text').attr('x', x + nW / 2).attr('y', HEADER_Y).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).attr('font-weight', '700').text(l));
}

function drawSankeyPSM() {
  const data = filtered(); const svg = d3.select('#sankey'); svg.selectAll('*').remove();
  if (!$('sankey') || !data.length) return;
  const el = $('sankey'), W = Math.max(940, el.getBoundingClientRect().width || (el.parentElement && el.parentElement.clientWidth) || 1000), diag = sankeyDiag;
  const sup = (type, id) => originSuppressed.has(`psm:${type}|${id}`);
  const piscOf = (r) => r.piscina || 'Sin piscina', precOf = (r) => r.precria || 'Sin precría';
  let salaRecs = data.filter((r) => _isSala(r.lugar) && hasVal(r[diag])), modRecs = data.filter((r) => _isModulo(r.lugar) && hasVal(r[diag]));
  salaRecs = salaRecs.filter((r) => !sup('pisc', piscOf(r)) && !sup('sala', r.lugar));
  modRecs = modRecs.filter((r) => !sup('mod', r.lugar) && !sup('prec', precOf(r)));
  if (!salaRecs.length && !modRecs.length) { svg.attr('viewBox', `0 0 ${W} 220`); svg.append('text').attr('x', W / 2).attr('y', 110).attr('fill', TH.muted).attr('text-anchor', 'middle').text(suppressedForMode().length ? 'Todos los elementos ocultos · pulsa Restaurar' : 'Sin datos de Salas/Módulos (Lugares deben iniciar con "Sala" o "Módulo")'); return; }
  const piscCount = {}, piscSala = {}, salaCount = {}, salaRes = {}, resSalaCount = { Positivo: 0, Negativo: 0 }, salaCodeRes = {};
  salaRecs.forEach((r) => { const p = piscOf(r), s = r.lugar, R = r[diag]; piscCount[p] = (piscCount[p] || 0) + 1; piscSala[`${p}|${s}`] = (piscSala[`${p}|${s}`] || 0) + 1; salaCount[s] = (salaCount[s] || 0) + 1; salaRes[`${s}|${R}`] = (salaRes[`${s}|${R}`] || 0) + 1; resSalaCount[R] = (resSalaCount[R] || 0) + 1; if (r.cod) salaCodeRes[`${r.cod}|${R}`] = (salaCodeRes[`${r.cod}|${R}`] || 0) + 1; });
  const modCount = {}, modRes = {}, resModCount = { Positivo: 0, Negativo: 0 }, precCount = {}, resPrec = {}, codMod = {};
  modRecs.forEach((r) => { const m = r.lugar, R = r[diag], pr = precOf(r); modCount[m] = (modCount[m] || 0) + 1; modRes[`${m}|${R}`] = (modRes[`${m}|${R}`] || 0) + 1; resModCount[R] = (resModCount[R] || 0) + 1; precCount[pr] = (precCount[pr] || 0) + 1; resPrec[`${R}|${pr}`] = (resPrec[`${R}|${pr}`] || 0) + 1; if (r.cod) codMod[`${r.cod}|${m}`] = (codMod[`${r.cod}|${m}`] || 0) + 1; });
  const resSalaMod = {}, codTotMod = {};
  Object.entries(codMod).forEach(([k, v]) => { const c = k.split('|')[0]; codTotMod[c] = (codTotMod[c] || 0) + v; });
  Object.entries(salaCodeRes).forEach(([k, sc]) => { const [c, R] = k.split('|'); const tot = codTotMod[c]; if (!tot) return; Object.entries(codMod).forEach(([k2, mc]) => { const [c2, m] = k2.split('|'); if (c2 !== c) return; resSalaMod[`${R}|${m}`] = (resSalaMod[`${R}|${m}`] || 0) + sc * (mc / tot); }); });
  const piscinas = Object.keys(piscCount).sort(), salas = Object.keys(salaCount).sort(), resSala = ['Positivo', 'Negativo'].filter((r) => resSalaCount[r] > 0), modulos = Object.keys(modCount).sort(), resMod = ['Positivo', 'Negativo'].filter((r) => resModCount[r] > 0), precrias = Object.keys(precCount).sort();
  const sum = (arr, f) => arr.reduce((s, k) => s + f(k), 0);
  const totalPisc = sum(piscinas, (k) => piscCount[k]), totalSala = sum(salas, (k) => salaCount[k]), totalRS = sum(resSala, (k) => resSalaCount[k]), totalMod = sum(modulos, (k) => modCount[k]), totalRM = sum(resMod, (k) => resModCount[k]), totalPrec = sum(precrias, (k) => precCount[k]);
  const maxCol = Math.max(totalPisc, totalSala, totalRS, totalMod, totalRM, totalPrec, 1);
  const NODE_MIN = 14, GAP = 4, HEADER_Y = 8, LABEL_TOP = 34;
  const maxItems = Math.max(piscinas.length, salas.length, resSala.length, modulos.length, resMod.length, precrias.length, 1);
  const availH = Math.max(140, 420 - (maxItems - 1) * GAP), SCALE = availH / maxCol, hh = (c) => Math.max(NODE_MIN, c * SCALE);
  const positionCol = (items, getCount) => { let y = LABEL_TOP; const pos = {}; items.forEach((id) => { const ht = hh(getCount(id)); pos[id] = { y, h: ht }; y += ht + GAP; }); return { pos, bottom: y }; };
  const piscPos = positionCol(piscinas, (p) => piscCount[p]), salaPos = positionCol(salas, (s) => salaCount[s]), rsPos = positionCol(resSala, (r) => resSalaCount[r]), modPos = positionCol(modulos, (m) => modCount[m]), rmPos = positionCol(resMod, (r) => resModCount[r]), precPos = positionCol(precrias, (p) => precCount[p]);
  const VH = Math.max(piscPos.bottom, salaPos.bottom, rsPos.bottom, modPos.bottom, rmPos.bottom, precPos.bottom, 240) + 18;
  const piscMaxLen = piscinas.length ? Math.max(...piscinas.map((p) => p.length)) : 8, mL = Math.min(120, Math.max(60, piscMaxLen * 6.4));
  const precMaxLen = precrias.length ? Math.max(...precrias.map((p) => p.length)) : 8, mR = Math.min(160, Math.max(70, precMaxLen * 6.4 + 20));
  const nW = 11, cWidth = W - mL - mR - nW, cx = (i) => mL + cWidth * (i / 5), c0 = cx(0), c1 = cx(1), c2 = cx(2), c3 = cx(3), c4 = cx(4), c5 = cx(5);
  svg.attr('viewBox', `0 0 ${W} ${VH}`); const g = svg.append('g');
  const linkW = (cnt) => Math.max(1.5, (cnt / maxCol) * 30);
  const drawLink = (x1, y1, x2, y2, w, color) => { const mx = (x1 + x2) / 2; g.append('path').attr('fill', 'none').attr('stroke', color).attr('stroke-width', w).attr('opacity', 0.62).attr('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); };
  const resColor = (r, strong) => r === 'Positivo' ? (strong ? 'rgba(239,68,68,.55)' : 'rgba(239,68,68,.4)') : (strong ? 'rgba(34,197,94,.42)' : 'rgba(34,197,94,.3)');
  Object.entries(piscSala).forEach(([k, cnt]) => { const [p, s] = k.split('|'); if (!piscPos.pos[p] || !salaPos.pos[s]) return; drawLink(c0 + nW, piscPos.pos[p].y + piscPos.pos[p].h / 2, c1, salaPos.pos[s].y + salaPos.pos[s].h / 2, linkW(cnt), 'rgba(14,165,233,.35)'); });
  Object.entries(salaRes).forEach(([k, cnt]) => { const [s, R] = k.split('|'); if (!salaPos.pos[s] || !rsPos.pos[R]) return; drawLink(c1 + nW, salaPos.pos[s].y + salaPos.pos[s].h / 2, c2, rsPos.pos[R].y + rsPos.pos[R].h / 2, linkW(cnt), resColor(R, true)); });
  Object.entries(resSalaMod).forEach(([k, cnt]) => { const [R, m] = k.split('|'); if (!rsPos.pos[R] || !modPos.pos[m]) return; drawLink(c2 + nW, rsPos.pos[R].y + rsPos.pos[R].h / 2, c3, modPos.pos[m].y + modPos.pos[m].h / 2, linkW(cnt), 'rgba(167,139,250,.42)'); });
  Object.entries(modRes).forEach(([k, cnt]) => { const [m, R] = k.split('|'); if (!modPos.pos[m] || !rmPos.pos[R]) return; drawLink(c3 + nW, modPos.pos[m].y + modPos.pos[m].h / 2, c4, rmPos.pos[R].y + rmPos.pos[R].h / 2, linkW(cnt), resColor(R, true)); });
  Object.entries(resPrec).forEach(([k, cnt]) => { const [R, pr] = k.split('|'); if (!rmPos.pos[R] || !precPos.pos[pr]) return; drawLink(c4 + nW, rmPos.pos[R].y + rmPos.pos[R].h / 2, c5, precPos.pos[pr].y + precPos.pos[pr].h / 2, linkW(cnt), resColor(R, false)); });
  const nodeTip = (sel, title, rows) => sel.on('mouseenter', (e) => showTip(`<div class="tt-title">${escH(title)}</div>` + rows.map(([k, v, cls]) => `<div class="tt-row"><span class="tt-key">${k}</span><span class="tt-val ${cls || ''}">${v}</span></div>`).join(''), e)).on('mouseleave', hideTip);
  const clickHide = (type, id) => () => { originSuppressed.add(`psm:${type}|${id}`); updateOriginResetBtn(); drawSankey(); };
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const drawPctBadge = (labelX, labelText, fill, isP, p, pct) => { const bx = labelX + labelText.length * 5.5 + 4; g.append('rect').attr('x', bx).attr('y', p.y + p.h / 2 - 8).attr('width', 34).attr('height', 16).attr('rx', 4).attr('fill', isP ? 'rgba(239,68,68,.18)' : 'rgba(34,197,94,.15)').attr('pointer-events', 'none'); g.append('text').attr('x', bx + 17).attr('y', p.y + p.h / 2).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('font-weight', '700').attr('pointer-events', 'none').text(pct + '%'); };
  piscinas.forEach((p) => { const pos = piscPos.pos[p]; const rect = g.append('rect').attr('x', c0).attr('y', pos.y).attr('width', nW).attr('height', pos.h).attr('rx', 3).attr('fill', '#0ea5e9').attr('cursor', 'pointer'); nodeTip(rect, `Piscina · ${p}`, [['Muestras (Sala)', piscCount[p]], ['% del total Piscina', totalPisc ? Math.round(piscCount[p] / totalPisc * 100) + '%' : '—'], ['Acción', 'Click para ocultar']]); rect.on('click', clickHide('pisc', p)); const lbl = g.append('text').attr('x', c0 - 6).attr('y', pos.y + pos.h / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', TH.muted).attr('font-size', 10).attr('font-weight', '600').attr('cursor', 'pointer').text(trunc(p, 16)); lbl.on('click', clickHide('pisc', p)); });
  salas.forEach((s) => { const pos = salaPos.pos[s]; const rect = g.append('rect').attr('x', c1).attr('y', pos.y).attr('width', nW).attr('height', pos.h).attr('rx', 3).attr('fill', '#38bdf8').attr('cursor', 'pointer'); nodeTip(rect, `Sala · ${s}`, [['Muestras', salaCount[s]], ['% del total Sala', totalSala ? Math.round(salaCount[s] / totalSala * 100) + '%' : '—'], ['Acción', 'Click para ocultar']]); rect.on('click', clickHide('sala', s)); if (pos.h >= 11) { const lbl = g.append('text').attr('x', c1 + nW + 4).attr('y', pos.y + pos.h / 2).attr('dominant-baseline', 'middle').attr('fill', '#38bdf8').attr('font-size', 9).attr('cursor', 'pointer').text(trunc(s, 14)); lbl.on('click', clickHide('sala', s)); } });
  resSala.forEach((R) => { const pos = rsPos.pos[R], isP = R === 'Positivo', fill = isP ? '#ef4444' : '#22c55e'; const rect = g.append('rect').attr('x', c2).attr('y', pos.y).attr('width', nW).attr('height', pos.h).attr('rx', 3).attr('fill', fill); const pct = totalRS ? Math.round(resSalaCount[R] / totalRS * 100) : 0; nodeTip(rect, `Sala · ${DLABEL[diag]} ${R}`, [['Muestras', resSalaCount[R]], ['% del total Sala', pct + '%', isP ? 'pos-tag' : 'neg-tag']]); if (pos.h >= 14) { const lx = c2 + nW + 4; g.append('text').attr('x', lx).attr('y', pos.y + pos.h / 2).attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('font-weight', '600').attr('pointer-events', 'none').text(R); drawPctBadge(lx, R, fill, isP, pos, pct); } });
  modulos.forEach((m) => { const pos = modPos.pos[m]; const rect = g.append('rect').attr('x', c3).attr('y', pos.y).attr('width', nW).attr('height', pos.h).attr('rx', 3).attr('fill', '#22d3ee').attr('cursor', 'pointer'); nodeTip(rect, `Módulo · ${m}`, [['Muestras', modCount[m]], ['% del total Módulo', totalMod ? Math.round(modCount[m] / totalMod * 100) + '%' : '—'], ['Acción', 'Click para ocultar']]); rect.on('click', clickHide('mod', m)); if (pos.h >= 11) { const lbl = g.append('text').attr('x', c3 + nW + 4).attr('y', pos.y + pos.h / 2).attr('dominant-baseline', 'middle').attr('fill', '#22d3ee').attr('font-size', 9).attr('cursor', 'pointer').text(trunc(m, 14)); lbl.on('click', clickHide('mod', m)); } });
  resMod.forEach((R) => { const pos = rmPos.pos[R], isP = R === 'Positivo', fill = isP ? '#ef4444' : '#22c55e'; const rect = g.append('rect').attr('x', c4).attr('y', pos.y).attr('width', nW).attr('height', pos.h).attr('rx', 3).attr('fill', fill); const pct = totalRM ? Math.round(resModCount[R] / totalRM * 100) : 0; nodeTip(rect, `Módulo · ${DLABEL[diag]} ${R}`, [['Muestras', resModCount[R]], ['% del total Módulo', pct + '%', isP ? 'pos-tag' : 'neg-tag']]); if (pos.h >= 14) { const lx = c4 + nW + 4; g.append('text').attr('x', lx).attr('y', pos.y + pos.h / 2).attr('dominant-baseline', 'middle').attr('fill', fill).attr('font-size', 9).attr('font-weight', '600').attr('pointer-events', 'none').text(R); drawPctBadge(lx, R, fill, isP, pos, pct); } });
  precrias.forEach((p) => { const pos = precPos.pos[p]; const rect = g.append('rect').attr('x', c5).attr('y', pos.y).attr('width', nW).attr('height', pos.h).attr('rx', 3).attr('fill', '#a78bfa').attr('cursor', 'pointer'); nodeTip(rect, `Precría · ${p}`, [['Muestras (Módulo)', precCount[p]], ['% del total Precría', totalPrec ? Math.round(precCount[p] / totalPrec * 100) + '%' : '—'], ['Acción', 'Click para ocultar']]); rect.on('click', clickHide('prec', p)); if (pos.h >= 11) { const lbl = g.append('text').attr('x', c5 + nW + 4).attr('y', pos.y + pos.h / 2).attr('dominant-baseline', 'middle').attr('fill', '#a78bfa').attr('font-size', 9).attr('cursor', 'pointer').text(trunc(p, 14)); lbl.on('click', clickHide('prec', p)); } });
  [{ x: c0, l: 'Piscina' }, { x: c1, l: 'Sala' }, { x: c2, l: 'Análisis' }, { x: c3, l: 'Módulo' }, { x: c4, l: 'Análisis' }, { x: c5, l: 'Precría' }].forEach(({ x, l }) => g.append('text').attr('x', x + nW / 2).attr('y', HEADER_Y).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).attr('font-weight', '700').text(l));
}

// ── TABLA + export ──
function drawTable() {
  const tbody = $('table-body'); if (!tbody) return; tbody.innerHTML = '';
  const data = filtered();
  const badge = (v) => !hasVal(v) ? '<span class="badge badge-na">—</span>' : isPos(v) ? '<span class="badge badge-pos">✕ POS</span>' : '<span class="badge badge-neg">✓ NEG</span>';
  const frag = document.createDocumentFragment();
  data.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escH(fmtD(r.f))}</td><td>${r.cod ? escH(r.cod) : '—'}</td><td>${escH(r.lugar)}</td><td>${escH(r.tq)}</td><td>${r.estadio ? escH(r.estadio) : '—'}</td><td>${r.sexo ? escH(r.sexo) : '—'}</td><td>${badge(r.IHHNV)}</td><td>${badge(r.WSSV)}</td><td>${badge(r.BP)}</td><td>${badge(r.AHPND)}</td><td>${badge(r.NHPB)}</td><td>${badge(r.EHP)}</td>`;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}
/** Matriz (AoA) de exportación a partir de un conjunto de filas. */
function biomolExportAoa(data) {
  const fullD = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };
  const resOut = (v) => v === 'Positivo' ? 'Positivo' : v === 'Negativo' ? 'Negativo' : '';
  const header = ['Fecha', 'Código', 'Corrida', 'Piscina', 'Lugar', 'Tanque', 'Otros', 'Muestra', 'Estadío', 'Sexo', 'IHHNV', 'WSSV', 'BP', 'AHPND/EMS', 'NHPB', 'EHP'];
  const aoa = [header];
  data.forEach((r) => aoa.push([fullD(r.f), r.cod, r.corrida, r.piscina, r.lugar, r.tq, r.otros, r.muestra, r.estadio, r.sexo, resOut(r.IHHNV), resOut(r.WSSV), resOut(r.BP), resOut(r.AHPND), resOut(r.NHPB), resOut(r.EHP)]));
  return aoa;
}

/** Filas a exportar = filtered() acotadas al rango de fechas del modal (r.f es ISO yyyy-mm-dd). */
function exportRangeRows() {
  const from = $('bm-export-from')?.value || '';
  const to = $('bm-export-to')?.value || '';
  return filtered().filter((r) => (!from || r.f >= from) && (!to || r.f <= to));
}
function updateBmExportInfo() {
  const info = $('bm-export-info'); if (info) info.textContent = `Se exportarán ${exportRangeRows().length} registro(s) en el rango elegido.`;
}
function openExportModal() {
  const m = $('bm-export-modal'); if (!m) return;
  const data = filtered();
  if (!data.length) { toast('Sin registros visibles para exportar.', 'warn'); return; }
  const dates = data.map((r) => r.f).filter(Boolean).sort();
  const f = $('bm-export-from'), t = $('bm-export-to');
  if (f) f.value = dates.length ? dates[0] : '';
  if (t) t.value = dates.length ? dates[dates.length - 1] : '';
  const scope = $('bm-export-scope'); if (scope) scope.textContent = `${data.length} registro(s) con los filtros activos. Elige el rango de fechas a exportar.`;
  updateBmExportInfo();
  m.classList.add('open'); document.body.classList.add('modal-open');
}
function closeExportModal() { $('bm-export-modal')?.classList.remove('open'); document.body.classList.remove('modal-open'); }
function runExport() {
  const XLSX = window.XLSX;
  if (!XLSX) { toast('Exportación no disponible: SheetJS (XLSX) no se cargó. Revisa el <script> del CDN en index.html o tu conexión.', 'err'); return; }
  const data = exportRangeRows();
  if (!data.length) { toast('Sin registros en el rango de fechas elegido.', 'warn'); return; }
  const ws = XLSX.utils.aoa_to_sheet(biomolExportAoa(data)); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BIOMOL');
  const from = $('bm-export-from')?.value || 'inicio', to = $('bm-export-to')?.value || 'fin';
  XLSX.writeFile(wb, `BIOMOL_${from}_a_${to}.xlsx`);
  closeExportModal();
}

/* ============================================================
   REPORTE COMPARATIVO (hasta 3 series)
   ============================================================ */
function syncReportToggles() {
  document.querySelectorAll('#report-modal [data-agg]').forEach((b) => b.classList.toggle('on', b.dataset.agg === reportAgg));
  document.querySelectorAll('#report-modal [data-chart]').forEach((b) => b.classList.toggle('on', b.dataset.chart === reportChart));
  document.querySelectorAll('#report-modal [data-metric]').forEach((b) => b.classList.toggle('on', b.dataset.metric === reportMetric));
  document.querySelectorAll('#report-modal [data-extra]').forEach((b) => b.classList.toggle('on', reportExtras.has(b.dataset.extra)));
}
function openReport() {
  if (!RAW.length) return;
  if (reportSeries.length === 0) addReportSeries();
  initBracket();
  $('report-modal').classList.add('open'); document.body.classList.add('modal-open');
  syncReportToggles();
  renderReport(); drawBracket(); drawReportSections();
}
function closeReport() { $('report-modal')?.classList.remove('open'); document.body.classList.remove('modal-open'); const p = $('bracket-popover'); if (p) p.style.display = 'none'; }
function addReportSeries() {
  if (reportSeries.length >= 3) return;
  const allFechas = [...new Set(RAW.map((d) => d.f))].sort(), allLugares = [...new Set(RAW.map((d) => d.lugar))].sort();
  reportSeries.push({ id: reportNextId++, diag: DIAGS[reportSeries.length % DIAGS.length] || 'IHHNV', lugares: new Set(allLugares), from: allFechas[0] || '', to: allFechas[allFechas.length - 1] || '' });
  renderReport();
}
function removeReportSeries(id) { reportSeries = reportSeries.filter((s) => s.id !== id); renderReport(); }
function renderReport() { renderReportSeries(); drawReportChart(); renderReportMetrics(); const b = $('add-series-btn'); if (b) b.disabled = reportSeries.length >= 3; }
function renderReportSeries() {
  const container = $('report-series'); if (!container) return; container.innerHTML = '';
  const allLugares = [...new Set(RAW.map((d) => d.lugar))].sort(), allFechas = [...new Set(RAW.map((d) => d.f))].sort();
  const minDate = allFechas[0] || '', maxDate = allFechas[allFechas.length - 1] || '';
  reportSeries.forEach((s, idx) => {
    const color = REPORT_COLORS[idx], card = document.createElement('div');
    card.className = 'report-series-card'; card.style.borderLeftColor = color;
    card.innerHTML = `
      <div class="rs-header"><span class="rs-title" style="color:${color}">Serie ${idx + 1}</span><button type="button" class="rs-remove" data-id="${s.id}" title="Eliminar serie">✕</button></div>
      <div><label class="rs-label">Diagnóstico</label><select class="rs-input rs-diag" data-id="${s.id}">${DIAGS.map((d) => `<option value="${d}"${d === s.diag ? ' selected' : ''}>${DLABEL[d]}</option>`).join('')}</select></div>
      <div><label class="rs-label">Lugares <span class="rs-count">(${s.lugares.size}/${allLugares.length})</span></label>
        <div class="rs-mini-row"><button type="button" class="rs-mini" data-action="all" data-id="${s.id}">Todos</button><button type="button" class="rs-mini" data-action="none" data-id="${s.id}">Ninguno</button></div>
        <div class="rs-lugar-list" data-id="${s.id}">${allLugares.map((l) => `<label class="rs-lugar-item"><input type="checkbox" data-id="${s.id}" data-lugar="${escH(l)}" ${s.lugares.has(l) ? 'checked' : ''}><span>${escH(l)}</span></label>`).join('')}</div>
      </div>
      <div><label class="rs-label">Período</label><div class="rs-date-row"><input type="date" class="rs-input rs-from" data-id="${s.id}" min="${minDate}" max="${maxDate}" value="${s.from}"><span style="color:var(--bm-muted);font-size:11px">→</span><input type="date" class="rs-input rs-to" data-id="${s.id}" min="${minDate}" max="${maxDate}" value="${s.to}"></div></div>`;
    container.appendChild(card);
  });
  const find = (e) => reportSeries.find((x) => x.id === +e.target.dataset.id);
  container.querySelectorAll('.rs-diag').forEach((sel) => sel.addEventListener('change', (e) => { const s = find(e); if (s) { s.diag = e.target.value; renderReport(); } }));
  container.querySelectorAll('.rs-from').forEach((inp) => inp.addEventListener('change', (e) => { const s = find(e); if (s) { s.from = e.target.value; renderReport(); } }));
  container.querySelectorAll('.rs-to').forEach((inp) => inp.addEventListener('change', (e) => { const s = find(e); if (s) { s.to = e.target.value; renderReport(); } }));
  container.querySelectorAll('.rs-lugar-item input[type=checkbox]').forEach((cb) => cb.addEventListener('change', (e) => { const s = find(e); if (!s) return; const l = e.target.dataset.lugar; if (cb.checked) s.lugares.add(l); else s.lugares.delete(l); renderReport(); }));
  container.querySelectorAll('.rs-mini').forEach((btn) => btn.addEventListener('click', (e) => { const s = find(e); if (!s) return; if (e.target.dataset.action === 'all') allLugares.forEach((l) => s.lugares.add(l)); else s.lugares.clear(); renderReport(); }));
  container.querySelectorAll('.rs-remove').forEach((btn) => btn.addEventListener('click', (e) => removeReportSeries(+e.target.dataset.id)));
}
const getSeriesData = (s) => RAW.filter((r) => s.lugares.has(r.lugar) && (!s.from || r.f >= s.from) && (!s.to || r.f <= s.to) && hasVal(r[s.diag]));
function computeSeriesPoints(s) {
  const grouped = {};
  getSeriesData(s).forEach((r) => { const key = reportAgg === 'monthly' ? r.f.slice(0, 7) : reportAgg === 'weekly' ? getWeekKey(r.f) : r.f; (grouped[key] ||= { total: 0, pos: 0 }); grouped[key].total++; if (isPos(r[s.diag])) grouped[key].pos++; });
  return Object.entries(grouped).map(([k, v]) => ({ key: k, pct: v.total ? Math.round(v.pos / v.total * 100) : 0, pos: v.pos, neg: v.total - v.pos, total: v.total })).sort((a, b) => a.key.localeCompare(b.key));
}
const metricVal = (p) => reportMetric === 'pos' ? p.pos : reportMetric === 'neg' ? p.neg : reportMetric === 'total' ? p.total : p.pct;
const metricLabel = () => reportMetric === 'pos' ? 'Positivos' : reportMetric === 'neg' ? 'Negativos' : reportMetric === 'total' ? 'Muestras' : '% Positividad';
const aggBucketLabel = (k) => reportAgg === 'monthly' ? formatMonth(k) : reportAgg === 'weekly' ? weekLabel(k) : fmtD(k);
const aggBucketWord = () => reportAgg === 'monthly' ? 'Mes' : reportAgg === 'weekly' ? 'Semana' : 'Día';
const aggUnitWord = () => reportAgg === 'monthly' ? 'mensual' : reportAgg === 'weekly' ? 'semanal' : 'diario';
function drawReportChart() {
  const svg = d3.select('#report-svg'); svg.selectAll('*').remove();
  const el = $('report-svg'); if (!el) return;
  const W = Math.max(500, (el.parentElement && el.parentElement.clientWidth) || 720), H = 340;
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('width', '100%');
  if (!reportSeries.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Agrega al menos una serie para visualizar el gráfico'); return; }
  const seriesData = reportSeries.map((s, idx) => ({ series: s, color: REPORT_COLORS[idx], points: computeSeriesPoints(s), idx })).filter((sd) => sd.points.length > 0);
  if (!seriesData.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').text('Sin datos en los criterios seleccionados'); return; }
  const allKeys = [...new Set(seriesData.flatMap((sd) => sd.points.map((p) => p.key)))].sort();
  const maxVal = reportMetric === 'pct' ? 100 : Math.max(1, ...seriesData.flatMap((sd) => sd.points.map(metricVal)));
  const mL = 50, mR = 14, mT = 18, mB = 60;
  const yS = d3.scaleLinear().domain([0, maxVal]).range([H - mB, mT]).nice();
  yS.ticks(5).forEach((v) => { svg.append('line').attr('x1', mL).attr('x2', W - mR).attr('y1', yS(v)).attr('y2', yS(v)).attr('stroke', TH.grid).attr('stroke-dasharray', '2,3').attr('stroke-width', 1); svg.append('text').attr('x', mL - 6).attr('y', yS(v) + 3).attr('text-anchor', 'end').attr('fill', TH.muted).attr('font-size', 9).text(reportMetric === 'pct' ? v + '%' : v); });
  const labelFor = (k) => aggBucketLabel(k), step = Math.max(1, Math.ceil(allKeys.length / 12));
  const ptTip = (sd, p) => `<div class="tt-title">Serie ${sd.idx + 1} · ${DLABEL[sd.series.diag]}</div><div class="tt-row"><span class="tt-key">${aggBucketWord()}</span><span class="tt-val">${labelFor(p.key)}</span></div><div class="tt-row"><span class="tt-key">% Positividad</span><span class="tt-val">${p.pct}%</span></div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${p.pos}</span></div><div class="tt-row"><span class="tt-key">Negativos</span><span class="tt-val neg-tag">${p.neg}</span></div><div class="tt-row"><span class="tt-key">Muestras</span><span class="tt-val">${p.total}</span></div>`;
  const drawAverageLine = (sd) => { if (!sd.points.length) return; const avg = sd.points.reduce((a, p) => a + metricVal(p), 0) / sd.points.length; svg.append('line').attr('x1', mL).attr('x2', W - mR).attr('y1', yS(avg)).attr('y2', yS(avg)).attr('stroke', sd.color).attr('stroke-width', 1.5).attr('stroke-dasharray', '5,4').attr('opacity', 0.75); svg.append('text').attr('x', W - mR - 4).attr('y', yS(avg) - 3).attr('text-anchor', 'end').attr('fill', sd.color).attr('font-size', 9).attr('font-weight', '700').text(`x̄ ${reportMetric === 'pct' ? avg.toFixed(0) + '%' : avg.toFixed(1)}`); };
  const drawMovingAvg = (sd, xFn) => { if (sd.points.length < 3) return; const ma = sd.points.map((p, i, arr) => { const lo = Math.max(0, i - 1), hi = Math.min(arr.length - 1, i + 1), slice = arr.slice(lo, hi + 1); return { key: p.key, v: slice.reduce((a, x) => a + metricVal(x), 0) / slice.length }; }); const line = d3.line().x((d) => xFn(d.key)).y((d) => yS(d.v)).curve(d3.curveMonotoneX); svg.append('path').attr('d', line(ma)).attr('fill', 'none').attr('stroke', sd.color).attr('stroke-width', 1.6).attr('stroke-dasharray', '2,3').attr('opacity', 0.85); };
  if (reportChart === 'line' || reportChart === 'area') {
    const xS = allKeys.length === 1 ? () => (W + mL - mR) / 2 : d3.scalePoint().domain(allKeys).range([mL + 8, W - mR - 8]).padding(0.5);
    allKeys.forEach((k, i) => { if (i % step === 0 || i === allKeys.length - 1) { const cx = xS(k); svg.append('text').attr('x', cx).attr('y', H - 36).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).attr('transform', reportAgg === 'daily' ? `rotate(-32 ${cx} ${H - 36})` : '').text(labelFor(k)); } });
    const line = d3.line().x((p) => xS(p.key)).y((p) => yS(metricVal(p))).curve(d3.curveMonotoneX);
    const area = d3.area().x((p) => xS(p.key)).y0(yS(0)).y1((p) => yS(metricVal(p))).curve(d3.curveMonotoneX);
    seriesData.forEach((sd) => {
      if (reportChart === 'area' && sd.points.length >= 2) svg.append('path').attr('d', area(sd.points)).attr('fill', sd.color).attr('opacity', 0.18);
      if (sd.points.length >= 2) svg.append('path').attr('d', line(sd.points)).attr('fill', 'none').attr('stroke', sd.color).attr('stroke-width', 2.4).attr('opacity', 0.9);
      sd.points.forEach((p) => { svg.append('circle').attr('cx', xS(p.key)).attr('cy', yS(metricVal(p))).attr('r', 4.2).attr('fill', sd.color).attr('stroke', TH.surface).attr('stroke-width', 1.5).attr('cursor', 'pointer').on('mouseenter', (e) => showTip(ptTip(sd, p), e)).on('mouseleave', hideTip); });
      if (reportExtras.has('avg')) drawAverageLine(sd); if (reportExtras.has('ma')) drawMovingAvg(sd, xS);
    });
  } else if (reportChart === 'stacked') {
    const xOuter = d3.scaleBand().domain(allKeys).range([mL, W - mR]).padding(0.2);
    allKeys.forEach((k, i) => { if (i % step === 0 || i === allKeys.length - 1) { const cx = xOuter(k) + xOuter.bandwidth() / 2; svg.append('text').attr('x', cx).attr('y', H - 36).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).attr('transform', reportAgg === 'daily' ? `rotate(-32 ${cx} ${H - 36})` : '').text(labelFor(k)); } });
    let stackMax = 1; allKeys.forEach((k) => { let s = 0; seriesData.forEach((sd) => { const p = sd.points.find((x) => x.key === k); if (p) s += metricVal(p); }); if (s > stackMax) stackMax = s; });
    const yStack = d3.scaleLinear().domain([0, reportMetric === 'pct' ? Math.max(100, stackMax) : stackMax]).range([H - mB, mT]).nice();
    allKeys.forEach((k) => { let yCursor = H - mB; seriesData.forEach((sd) => { const p = sd.points.find((x) => x.key === k); if (!p) return; const v = metricVal(p), bh = (H - mB) - yStack(v), by = yCursor - bh; if (bh <= 0) return; svg.append('rect').attr('x', xOuter(k)).attr('y', by).attr('width', xOuter.bandwidth()).attr('height', bh).attr('fill', sd.color).attr('opacity', 0.9).attr('rx', 2).attr('cursor', 'pointer').on('mouseenter', (e) => showTip(ptTip(sd, p), e)).on('mouseleave', hideTip); yCursor = by; }); });
  } else {
    const xOuter = d3.scaleBand().domain(allKeys).range([mL, W - mR]).padding(0.2);
    const xInner = d3.scaleBand().domain(seriesData.map((sd) => sd.idx)).range([0, xOuter.bandwidth()]).padding(0.12);
    allKeys.forEach((k, i) => { if (i % step === 0 || i === allKeys.length - 1) { const cx = xOuter(k) + xOuter.bandwidth() / 2; svg.append('text').attr('x', cx).attr('y', H - 36).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).attr('transform', reportAgg === 'daily' ? `rotate(-32 ${cx} ${H - 36})` : '').text(labelFor(k)); } });
    seriesData.forEach((sd) => { sd.points.forEach((p) => { const v = metricVal(p), bx = xOuter(p.key) + xInner(sd.idx), by = yS(v), bh = (H - mB) - by; if (bh < 0) return; svg.append('rect').attr('x', bx).attr('y', by).attr('width', xInner.bandwidth()).attr('height', bh).attr('fill', sd.color).attr('opacity', 0.88).attr('rx', 2).attr('cursor', 'pointer').on('mouseenter', (e) => showTip(ptTip(sd, p), e)).on('mouseleave', hideTip); }); if (reportExtras.has('avg')) drawAverageLine(sd); if (reportExtras.has('ma')) drawMovingAvg(sd, (k) => xOuter(k) + xOuter.bandwidth() / 2); });
  }
  svg.append('text').attr('x', -H / 2).attr('y', 14).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 10).attr('font-weight', '700').text(metricLabel());
  let lx = mL;
  seriesData.forEach((sd) => { const txt = `Serie ${sd.idx + 1}: ${DLABEL[sd.series.diag]}`; svg.append('rect').attr('x', lx).attr('y', H - 14).attr('width', 12).attr('height', 9).attr('rx', 2).attr('fill', sd.color); svg.append('text').attr('x', lx + 16).attr('y', H - 6).attr('fill', TH.muted).attr('font-size', 10).text(txt); lx += 24 + txt.length * 5.6; });
}
function renderReportMetrics() {
  const container = $('report-metrics'); if (!container) return; container.innerHTML = '';
  if (!reportSeries.length) return;
  reportSeries.forEach((s, idx) => {
    const data = getSeriesData(s), pos = data.filter((r) => isPos(r[s.diag])).length, total = data.length, pct = total ? Math.round(pos / total * 100) : 0;
    const byLugar = {}; data.forEach((r) => { (byLugar[r.lugar] ||= { pos: 0, total: 0 }); byLugar[r.lugar].total++; if (isPos(r[s.diag])) byLugar[r.lugar].pos++; });
    const ranking = Object.entries(byLugar).filter(([, v]) => v.total > 0).map(([k, v]) => ({ k, pct: v.pos / v.total * 100, total: v.total })).sort((a, b) => b.pct - a.pct);
    const topLugar = ranking[0];
    const pts = computeSeriesPoints(s);
    let trend = '—', trendColor = 'var(--bm-muted)';
    if (pts.length >= 2) { const mid = Math.floor(pts.length / 2), a = pts.slice(0, mid), b = pts.slice(mid), avg = (arr) => arr.reduce((x, y) => x + y.pct, 0) / (arr.length || 1), diff = avg(b) - avg(a); if (diff > 2) { trend = `↑ +${diff.toFixed(0)}%`; trendColor = '#ef4444'; } else if (diff < -2) { trend = `↓ ${diff.toFixed(0)}%`; trendColor = '#22c55e'; } else { trend = '≈ Estable'; trendColor = 'var(--bm-muted)'; } }
    const peak = pts.slice().sort((a, b) => b.pct - a.pct)[0], peakLabel = peak ? `${aggBucketLabel(peak.key)} · ${peak.pct}%` : '—';
    const vals = pts.map((p) => p.pct), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, min = vals.length ? Math.min(...vals) : 0, max = vals.length ? Math.max(...vals) : 0;
    const std = vals.length ? Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length) : 0;
    const periodLabel = (s.from && s.to) ? `${fmtD(s.from)} → ${fmtD(s.to)}` : (s.from ? `desde ${fmtD(s.from)}` : (s.to ? `hasta ${fmtD(s.to)}` : 'Todo'));
    const color = REPORT_COLORS[idx], card = document.createElement('div');
    card.className = 'report-metric-card'; card.style.borderLeftColor = color;
    card.innerHTML = `<div class="rm-title" style="color:${color}">Serie ${idx + 1} · ${DLABEL[s.diag]} · ${s.lugares.size} lugar(es)</div>
      <div class="rm-grid">
        <div class="rm-cell"><div class="rm-label">Muestras</div><div class="rm-val">${total}</div></div>
        <div class="rm-cell"><div class="rm-label">Positivos</div><div class="rm-val" style="color:#ef4444">${pos}</div></div>
        <div class="rm-cell"><div class="rm-label">Negativos</div><div class="rm-val" style="color:#22c55e">${total - pos}</div></div>
        <div class="rm-cell"><div class="rm-label">% Positividad</div><div class="rm-val">${pct}%</div></div>
        <div class="rm-cell"><div class="rm-label">Promedio ${aggUnitWord()}</div><div class="rm-val-sm">${avg.toFixed(1)}%</div></div>
        <div class="rm-cell"><div class="rm-label">Desv. estándar</div><div class="rm-val-sm">±${std.toFixed(1)}%</div></div>
        <div class="rm-cell"><div class="rm-label">Mínimo / Máximo</div><div class="rm-val-sm">${min}% / ${max}%</div></div>
        <div class="rm-cell"><div class="rm-label">Tendencia</div><div class="rm-val-sm" style="color:${trendColor}">${trend}</div></div>
        <div class="rm-cell"><div class="rm-label">Pico ${aggUnitWord()}</div><div class="rm-val-sm">${peakLabel}</div></div>
        <div class="rm-cell" style="grid-column:1 / -1"><div class="rm-label">Período</div><div class="rm-val-sm">${periodLabel}</div></div>
        <div class="rm-cell" style="grid-column:1 / -1"><div class="rm-label">Lugar más afectado</div><div class="rm-val-sm">${topLugar ? `${escH(topLugar.k)} · ${topLugar.pct.toFixed(0)}% (${topLugar.total} muestras)` : '—'}</div></div>
      </div>`;
    container.appendChild(card);
  });
}
// ── Árbol de Campeonato (bracket) ──
const _bracketIsSala = (l) => /^\s*sala/i.test(l || '');
const _bracketIsModulo = (l) => /^\s*m[oó]dulo/i.test(l || '');
function initBracket() {
  if (!RAW.length) return;
  const allFechas = [...new Set(RAW.map((d) => d.f))].sort();
  if (!bracketFrom) bracketFrom = allFechas[0] || '';
  if (!bracketTo) bracketTo = allFechas[allFechas.length - 1] || '';
  if (!DIAGS.includes(bracketDiag)) bracketDiag = DIAGS[0];
  const diagSel = $('bracket-diag'); if (!diagSel) return;
  diagSel.innerHTML = DIAGS.map((d) => `<option value="${d}"${d === bracketDiag ? ' selected' : ''}>${DLABEL[d]}</option>`).join('');
  const fromIn = $('bracket-from'), toIn = $('bracket-to');
  if (allFechas.length) { fromIn.min = allFechas[0]; fromIn.max = allFechas[allFechas.length - 1]; toIn.min = allFechas[0]; toIn.max = allFechas[allFechas.length - 1]; }
  fromIn.value = bracketFrom; toIn.value = bracketTo;
  if (!bracketWired) {
    diagSel.addEventListener('change', (e) => { bracketDiag = e.target.value; drawBracket(); drawReportSections(); });
    fromIn.addEventListener('change', (e) => { bracketFrom = e.target.value; drawBracket(); drawReportSections(); });
    toIn.addEventListener('change', (e) => { bracketTo = e.target.value; drawBracket(); drawReportSections(); });
    $('bracket-sync-series').addEventListener('click', () => { if (!reportSeries.length) return; const s = reportSeries[0]; if (s.diag) bracketDiag = s.diag; if (s.from) bracketFrom = s.from; if (s.to) bracketTo = s.to; initBracket(); drawBracket(); drawReportSections(); });
    $('bracket-pop-close').addEventListener('click', () => { $('bracket-popover').style.display = 'none'; });
    bracketWired = true;
  }
}
function drawBracket() {
  const svg = d3.select('#bracket-svg'); svg.selectAll('*').remove();
  const el = $('bracket-svg'); if (!RAW.length || !el) return;
  const base = RAW.filter((r) => (_bracketIsSala(r.lugar) || _bracketIsModulo(r.lugar)) && (!bracketFrom || r.f >= bracketFrom) && (!bracketTo || r.f <= bracketTo) && hasVal(r[bracketDiag]));
  const W_avail = Math.max((el.parentElement && el.parentElement.clientWidth) || 800, 640);
  if (!base.length) { svg.attr('viewBox', `0 0 ${W_avail} 260`).attr('height', 260); svg.append('text').attr('x', W_avail / 2).attr('y', 130).attr('fill', TH.muted).attr('text-anchor', 'middle').attr('font-size', 12).text('Sin datos de Salas/Módulos para los filtros seleccionados'); return; }
  const stats = {};
  base.forEach((r) => { (stats[r.lugar] ||= { total: 0, pos: 0, isSala: _bracketIsSala(r.lugar) }); stats[r.lugar].total++; if (isPos(r[bracketDiag])) stats[r.lugar].pos++; });
  const items = Object.entries(stats).map(([name, v]) => ({ name, total: v.total, pos: v.pos, neg: v.total - v.pos, pct: v.total ? (v.pos / v.total) * 100 : 0, isSala: v.isSala }));
  const classify = (it) => it.pct >= 50 ? 'peores' : it.pct >= 20 ? 'medio' : 'mejores';
  const groupCat = (arr) => { const g = { peores: [], medio: [], mejores: [] }; arr.forEach((it) => g[classify(it)].push(it)); g.peores.sort((a, b) => b.pct - a.pct); g.medio.sort((a, b) => b.pct - a.pct); g.mejores.sort((a, b) => a.pct - b.pct); return g; };
  const modGroups = groupCat(items.filter((i) => !i.isSala)), salaGroups = groupCat(items.filter((i) => i.isSala));
  const CATS = [{ id: 'peores', label: 'PEORES', color: '#ef4444', bg: 'rgba(239,68,68,.07)', desc: '≥ 50%' }, { id: 'medio', label: 'MEDIO', color: '#f59e0b', bg: 'rgba(245,158,11,.07)', desc: '20–49%' }, { id: 'mejores', label: 'MEJORES', color: '#22c55e', bg: 'rgba(34,197,94,.07)', desc: '< 20%' }];
  const cardW = 210, cardH = 54, gapY = 8, sectionTitleH = 30, sectionGap = 16, sidePad = 22, headerH = 38, panelPadV = 12;
  const sideHeight = (groups) => { let h = headerH; CATS.forEach((c) => { const rows = Math.max(1, groups[c.id].length); h += (sectionTitleH + (cardH + gapY) * rows - gapY + panelPadV) + sectionGap; }); return h + 14; };
  const totalH = Math.max(sideHeight(modGroups), sideHeight(salaGroups), 460);
  const W = Math.max(W_avail, 2 * (sidePad + cardW + 20) + 160);
  svg.attr('viewBox', `0 0 ${W} ${totalH}`).attr('height', totalH).attr('width', '100%');
  const midX = W / 2;
  svg.append('text').attr('x', midX).attr('y', 26).attr('text-anchor', 'middle').attr('fill', DCOLOR[bracketDiag]).attr('font-size', 20).attr('font-weight', '800').attr('letter-spacing', '0.04em').text(DLABEL[bracketDiag]);
  svg.append('text').attr('x', midX).attr('y', 44).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 10).text(`${bracketFrom || '—'} → ${bracketTo || '—'}`);
  svg.append('line').attr('x1', midX).attr('x2', midX).attr('y1', headerH + 14).attr('y2', totalH - 14).attr('stroke', TH.grid).attr('stroke-dasharray', '3,5').attr('stroke-width', 1);
  const drawCard = (it, x, y, cat) => {
    const g = svg.append('g').attr('transform', `translate(${x},${y})`).attr('cursor', 'pointer');
    const color = pctColor(it.pct);
    g.append('rect').attr('width', cardW).attr('height', cardH).attr('rx', 7).attr('fill', TH.surface).attr('stroke', cat.color).attr('stroke-width', 1.5);
    const nm = it.name.length > 24 ? it.name.slice(0, 23) + '…' : it.name;
    g.append('text').attr('x', 12).attr('y', 16).attr('fill', TH.text).attr('font-size', 11).attr('font-weight', '700').text(nm).append('title').text(it.name);
    g.append('text').attr('x', cardW - 10).attr('y', 16).attr('text-anchor', 'end').attr('fill', color).attr('font-size', 13).attr('font-weight', '800').text(it.pct.toFixed(0) + '%');
    g.append('rect').attr('x', 12).attr('y', 24).attr('width', cardW - 24).attr('height', 7).attr('rx', 4).attr('fill', 'rgba(148,163,184,.18)');
    g.append('rect').attr('x', 12).attr('y', 24).attr('width', Math.max(2, (cardW - 24) * it.pct / 100)).attr('height', 7).attr('rx', 4).attr('fill', color);
    g.append('text').attr('x', 12).attr('y', 46).attr('fill', TH.muted).attr('font-size', 9).text(`${it.pos} pos · ${it.neg} neg · ${it.total} muestras`);
    g.on('mouseenter', (e) => showTip(`<div class="tt-title">${escH(it.name)}</div><div class="tt-row"><span class="tt-key">${it.isSala ? 'Sala' : 'Módulo'}</span><span class="tt-val">${DLABEL[bracketDiag]}</span></div><div class="tt-row"><span class="tt-key">Categoría</span><span class="tt-val" style="color:${cat.color};font-weight:700">${cat.label}</span></div><div class="tt-row"><span class="tt-key">% Positividad</span><span class="tt-val">${it.pct.toFixed(0)}%</span></div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${it.pos}</span></div><div class="tt-row"><span class="tt-key">Negativos</span><span class="tt-val neg-tag">${it.neg}</span></div><div class="tt-row"><span class="tt-key">Acción</span><span class="tt-val">Click para tendencia</span></div>`, e)).on('mouseleave', hideTip);
    g.on('click', (e) => { hideTip(); showBracketTrend(it, e); });
  };
  const renderSide = (groups, side) => {
    const xCard = side === 'left' ? sidePad : W - sidePad - cardW, panelX = xCard - 10, panelW = cardW + 20;
    svg.append('text').attr('x', xCard + cardW / 2).attr('y', 24).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 13).attr('font-weight', '800').attr('letter-spacing', '0.1em').text(side === 'left' ? 'MÓDULOS' : 'SALAS');
    let y = headerH + 8;
    CATS.forEach((cat) => {
      const arr = groups[cat.id], rows = Math.max(1, arr.length), sectionH = sectionTitleH + (cardH + gapY) * rows - gapY + panelPadV;
      svg.append('rect').attr('x', panelX).attr('y', y).attr('width', panelW).attr('height', sectionH).attr('rx', 10).attr('fill', cat.bg).attr('stroke', cat.color).attr('stroke-width', 1).attr('stroke-opacity', 0.55);
      svg.append('rect').attr('x', side === 'left' ? panelX : panelX + panelW - 4).attr('y', y + 6).attr('width', 4).attr('height', sectionH - 12).attr('rx', 2).attr('fill', cat.color).attr('opacity', 0.85);
      svg.append('text').attr('x', panelX + 14).attr('y', y + 19).attr('fill', cat.color).attr('font-size', 11).attr('font-weight', '800').attr('letter-spacing', '0.08em').text(`${cat.label} · ${arr.length}`);
      svg.append('text').attr('x', panelX + panelW - 12).attr('y', y + 19).attr('text-anchor', 'end').attr('fill', TH.muted).attr('font-size', 9).attr('font-style', 'italic').text(cat.desc);
      svg.append('line').attr('x1', panelX + 10).attr('x2', panelX + panelW - 10).attr('y1', y + sectionTitleH - 4).attr('y2', y + sectionTitleH - 4).attr('stroke', cat.color).attr('stroke-opacity', 0.25).attr('stroke-width', 1);
      if (arr.length === 0) svg.append('text').attr('x', panelX + panelW / 2).attr('y', y + sectionTitleH + 18).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 10).attr('font-style', 'italic').text('Sin elementos en esta categoría');
      else arr.forEach((it, i) => drawCard(it, xCard, y + sectionTitleH + i * (cardH + gapY), cat));
      y += sectionH + sectionGap;
    });
  };
  renderSide(modGroups, 'left'); renderSide(salaGroups, 'right');
}
function showBracketTrend(item, e) {
  const pop = $('bracket-popover'), title = $('bracket-pop-title'), meta = $('bracket-pop-meta');
  title.textContent = `${item.name} · ${DLABEL[bracketDiag]} · ${item.pct.toFixed(0)}%`;
  const data = RAW.filter((r) => r.lugar === item.name && (!bracketFrom || r.f >= bracketFrom) && (!bracketTo || r.f <= bracketTo) && hasVal(r[bracketDiag]));
  const byDate = {}; data.forEach((r) => { (byDate[r.f] ||= { total: 0, pos: 0 }); byDate[r.f].total++; if (isPos(r[bracketDiag])) byDate[r.f].pos++; });
  const points = Object.entries(byDate).map(([d, v]) => ({ date: d, pct: v.total ? Math.round(v.pos / v.total * 100) : 0, pos: v.pos, total: v.total })).sort((a, b) => a.date.localeCompare(b.date));
  const svg = d3.select('#bracket-pop-svg'); svg.selectAll('*').remove();
  const W = 340, H = 180; svg.attr('viewBox', `0 0 ${W} ${H}`);
  if (!points.length) { svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('fill', TH.muted).attr('text-anchor', 'middle').attr('font-size', 11).text('Sin datos'); meta.textContent = '—'; }
  else {
    const mL = 32, mR = 12, mT = 14, mB = 28;
    const xS = points.length === 1 ? () => (W + mL - mR) / 2 : d3.scalePoint().domain(points.map((p) => p.date)).range([mL + 4, W - mR - 4]).padding(0.4);
    const yS = d3.scaleLinear().domain([0, 100]).range([H - mB, mT]);
    [0, 50, 100].forEach((v) => { svg.append('line').attr('x1', mL).attr('x2', W - mR).attr('y1', yS(v)).attr('y2', yS(v)).attr('stroke', TH.grid).attr('stroke-dasharray', '2,3'); svg.append('text').attr('x', mL - 4).attr('y', yS(v) + 3).attr('text-anchor', 'end').attr('fill', TH.muted).attr('font-size', 8).text(v + '%'); });
    const line = d3.line().x((p) => xS(p.date)).y((p) => yS(p.pct)).curve(d3.curveMonotoneX);
    if (points.length >= 2) svg.append('path').attr('d', line(points)).attr('fill', 'none').attr('stroke', DCOLOR[bracketDiag]).attr('stroke-width', 2);
    points.forEach((p) => svg.append('circle').attr('cx', xS(p.date)).attr('cy', yS(p.pct)).attr('r', 3.2).attr('fill', DCOLOR[bracketDiag]).attr('stroke', TH.surface).attr('stroke-width', 1));
    svg.append('text').attr('x', xS(points[0].date)).attr('y', H - 10).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 8).text(fmtD(points[0].date));
    if (points.length > 1) { const last = points[points.length - 1]; svg.append('text').attr('x', xS(last.date)).attr('y', H - 10).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 8).text(fmtD(last.date)); }
    const avg = points.reduce((a, p) => a + p.pct, 0) / points.length, max = Math.max(...points.map((p) => p.pct)), min = Math.min(...points.map((p) => p.pct));
    meta.innerHTML = `<b>${points.length}</b> días · prom <b>${avg.toFixed(0)}%</b> · pico <b style="color:#ef4444">${max}%</b> · mín <b style="color:#22c55e">${min}%</b>`;
  }
  pop.style.display = 'block';
  const tipW = 380, tipH = 240, ex = (e && e.clientX) || window.innerWidth / 2, ey = (e && e.clientY) || window.innerHeight / 2;
  let x = ex + 12, y = ey - 30;
  if (x + tipW > window.innerWidth) x = Math.max(8, window.innerWidth - tipW - 8);
  if (y + tipH > window.innerHeight) y = Math.max(8, window.innerHeight - tipH - 8);
  if (y < 8) y = 8;
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}

// ── Líneas internas vs externas ──
function drawLineComp() {
  const svg = d3.select('#linecomp-svg'); svg.selectAll('*').remove();
  const el = $('linecomp-svg'), tableDiv = $('linecomp-table'); if (!el) return;
  if (!RAW.length) { if (tableDiv) tableDiv.innerHTML = ''; return; }
  const isExtCode = (c) => /texcumar/i.test(c || '');
  const base = RAW.filter((r) => (!bracketFrom || r.f >= bracketFrom) && (!bracketTo || r.f <= bracketTo));
  const stats = DIAGS.map((d) => { const intRows = base.filter((r) => !isExtCode(r.cod) && hasVal(r[d])), extRows = base.filter((r) => isExtCode(r.cod) && hasVal(r[d])); const ip = intRows.filter((r) => isPos(r[d])).length, ep = extRows.filter((r) => isPos(r[d])).length; return { diag: d, int: { pos: ip, neg: intRows.length - ip, total: intRows.length, pct: intRows.length ? Math.round(ip / intRows.length * 100) : null }, ext: { pos: ep, neg: extRows.length - ep, total: extRows.length, pct: extRows.length ? Math.round(ep / extRows.length * 100) : null } }; });
  const W = Math.max((el.parentElement && el.parentElement.clientWidth) || 720, 520), H = 240, mL = 40, mR = 14, mT = 16, mB = 50;
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('width', '100%');
  const yS = d3.scaleLinear().domain([0, 100]).range([H - mB, mT]);
  [0, 25, 50, 75, 100].forEach((v) => { svg.append('line').attr('x1', mL).attr('x2', W - mR).attr('y1', yS(v)).attr('y2', yS(v)).attr('stroke', TH.grid).attr('stroke-dasharray', '2,3'); svg.append('text').attr('x', mL - 6).attr('y', yS(v) + 3).attr('text-anchor', 'end').attr('fill', TH.muted).attr('font-size', 9).text(v + '%'); });
  const xOuter = d3.scaleBand().domain(DIAGS).range([mL, W - mR]).padding(0.25), xInner = d3.scaleBand().domain(['int', 'ext']).range([0, xOuter.bandwidth()]).padding(0.18);
  stats.forEach((s) => {
    ['int', 'ext'].forEach((kind) => {
      const o = s[kind], bx = xOuter(s.diag) + xInner(kind), bw = xInner.bandwidth(), fill = kind === 'int' ? DCOLOR[s.diag] : '#64748b';
      const by = o.pct == null ? (H - mB) : yS(o.pct), bh = o.pct == null ? 0 : (H - mB) - by;
      const bar = svg.append('rect').attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh).attr('rx', 2).attr('fill', fill).attr('opacity', kind === 'int' ? 0.92 : 0.5).attr('cursor', 'pointer');
      if (o.pct != null && bh > 0) svg.append('text').attr('x', bx + bw / 2).attr('y', by - 3).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 8).attr('font-weight', '700').text(o.pct + '%');
      bar.on('mouseenter', (e) => showTip(`<div class="tt-title">${DLABEL[s.diag]} · ${kind === 'int' ? 'Internas' : 'Externas'}</div><div class="tt-row"><span class="tt-key">% Positividad</span><span class="tt-val">${o.pct == null ? '—' : o.pct + '%'}</span></div><div class="tt-row"><span class="tt-key">Positivos</span><span class="tt-val pos-tag">${o.pos}</span></div><div class="tt-row"><span class="tt-key">Negativos</span><span class="tt-val neg-tag">${o.neg}</span></div><div class="tt-row"><span class="tt-key">Muestras</span><span class="tt-val">${o.total}</span></div>`, e)).on('mouseleave', hideTip);
    });
    svg.append('text').attr('x', xOuter(s.diag) + xOuter.bandwidth() / 2).attr('y', H - mB + 14).attr('text-anchor', 'middle').attr('fill', TH.muted).attr('font-size', 9).attr('font-weight', '700').text(DLABEL[s.diag]);
  });
  svg.append('rect').attr('x', mL).attr('y', H - 14).attr('width', 12).attr('height', 8).attr('rx', 2).attr('fill', '#38bdf8').attr('opacity', 0.92);
  svg.append('text').attr('x', mL + 16).attr('y', H - 7).attr('fill', TH.muted).attr('font-size', 9).text('Internas (color por diagnóstico)');
  svg.append('rect').attr('x', mL + 200).attr('y', H - 14).attr('width', 12).attr('height', 8).attr('rx', 2).attr('fill', '#64748b').attr('opacity', 0.5);
  svg.append('text').attr('x', mL + 216).attr('y', H - 7).attr('fill', TH.muted).attr('font-size', 9).text('Externas (gris)');
  if (tableDiv) {
    let html = '<table class="modal-table"><thead><tr><th>Diagnóstico</th><th class="num">Int · % Pos</th><th class="num">Int · Pos/Tot</th><th class="num">Ext · % Pos</th><th class="num">Ext · Pos/Tot</th><th class="num">Δ (Int − Ext)</th></tr></thead><tbody>';
    stats.forEach((s) => { const delta = (s.int.pct != null && s.ext.pct != null) ? (s.int.pct - s.ext.pct) : null; const dColor = delta == null ? 'var(--bm-muted)' : delta > 0 ? '#ef4444' : delta < 0 ? '#22c55e' : 'var(--bm-muted)'; html += `<tr><td class="accent">${DLABEL[s.diag]}</td><td class="num">${s.int.pct == null ? '—' : s.int.pct + '%'}</td><td class="num">${s.int.pos}/${s.int.total}</td><td class="num">${s.ext.pct == null ? '—' : s.ext.pct + '%'}</td><td class="num">${s.ext.pos}/${s.ext.total}</td><td class="num" style="color:${dColor};font-weight:700">${delta == null ? '—' : (delta > 0 ? '+' : '') + delta + '%'}</td></tr>`; });
    html += '</tbody></table>'; tableDiv.innerHTML = html;
  }
}

// ── Coinfección ──
function drawCoinfection() {
  const cont = $('coinf-body'); if (!cont) return;
  if (!RAW.length) { cont.innerHTML = ''; return; }
  const base = RAW.filter((r) => (!bracketFrom || r.f >= bracketFrom) && (!bracketTo || r.f <= bracketTo));
  const evaluated = base.filter((r) => DIAGS.some((d) => hasVal(r[d])));
  if (!evaluated.length) { cont.innerHTML = '<div style="color:var(--bm-muted);font-size:12px;padding:14px;text-align:center">Sin muestras evaluadas en el período</div>'; return; }
  const dist = { 0: 0, 1: 0, 2: 0, 3: 0 }, combos = {};
  evaluated.forEach((r) => { const posList = DIAGS.filter((d) => isPos(r[d])), n = posList.length; if (n >= 3) dist[3]++; else dist[n]++; if (n >= 2) { const key = posList.map((d) => DLABEL[d]).join(' + '); combos[key] = (combos[key] || 0) + 1; } });
  const coinf = dist[2] + dist[3], pctCoinf = Math.round(coinf / evaluated.length * 100), topCombos = Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const card = `<div class="rm-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px"><div class="rm-cell"><div class="rm-label">Muestras evaluadas</div><div class="rm-val">${evaluated.length}</div></div><div class="rm-cell"><div class="rm-label">Coinfección (≥2)</div><div class="rm-val" style="color:#ef4444">${coinf}</div></div><div class="rm-cell"><div class="rm-label">% Coinfección</div><div class="rm-val">${pctCoinf}%</div></div></div>`;
  const maxD = Math.max(dist[0], dist[1], dist[2], dist[3], 1), rowsD = [['0 positivos', dist[0], '#22c55e'], ['1 positivo', dist[1], '#f59e0b'], ['2 positivos', dist[2], '#fb923c'], ['3+ positivos', dist[3], '#ef4444']];
  let bars = '<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px">';
  rowsD.forEach(([lab, val, col]) => { const w = Math.round(val / maxD * 100), p = Math.round(val / evaluated.length * 100); bars += `<div style="display:flex;align-items:center;gap:8px;font-size:11px"><span style="width:92px;color:var(--bm-muted)">${lab}</span><div style="flex:1;background:rgba(148,163,184,.18);border-radius:4px;height:14px;overflow:hidden"><div style="width:${w}%;height:100%;background:${col};border-radius:4px"></div></div><span style="width:84px;text-align:right">${val} (${p}%)</span></div>`; });
  bars += '</div>';
  let tbl;
  if (topCombos.length) { tbl = '<table class="modal-table"><thead><tr><th>Combinación más frecuente (≥2)</th><th class="num">Muestras</th><th class="num">% de coinfección</th></tr></thead><tbody>'; topCombos.forEach(([k, v]) => { tbl += `<tr><td class="accent">${escH(k)}</td><td class="num">${v}</td><td class="num">${coinf ? Math.round(v / coinf * 100) : 0}%</td></tr>`; }); tbl += '</tbody></table>'; }
  else tbl = '<div style="color:var(--bm-muted);font-size:11px;padding:8px">No se detectaron coinfecciones en el período.</div>';
  cont.innerHTML = card + bars + tbl;
}

// ── Positividad por estadío ──
function drawEstadioPos() {
  const cont = $('estadio-body'); if (!cont) return;
  if (!RAW.length) { cont.innerHTML = ''; return; }
  const base = RAW.filter((r) => (!bracketFrom || r.f >= bracketFrom) && (!bracketTo || r.f <= bracketTo));
  const estadios = [...new Set(base.map((r) => r.estadio).filter(Boolean))].sort(estadioCompare);
  if (!estadios.length) { cont.innerHTML = '<div style="color:var(--bm-muted);font-size:12px;padding:14px;text-align:center">Sin estadíos registrados en el período</div>'; return; }
  let html = '<table class="modal-table"><thead><tr><th>Estadío</th>';
  DIAGS.forEach((d) => { html += `<th class="num" style="color:${DCOLOR[d]}">${DLABEL[d]}</th>`; });
  html += '<th class="num">Muestras</th></tr></thead><tbody>';
  let worst = null;
  estadios.forEach((es) => {
    const rowsEs = base.filter((r) => r.estadio === es); let cells = '', posAll = 0, measAll = 0;
    DIAGS.forEach((d) => { const meas = rowsEs.filter((r) => hasVal(r[d])), pos = meas.filter((r) => isPos(r[d])).length; posAll += pos; measAll += meas.length; const pct = meas.length ? Math.round(pos / meas.length * 100) : null; const bg = pct == null ? 'transparent' : pctColor(pct); const fg = pct == null ? 'var(--bm-muted)' : (pct > 50 ? '#fff' : '#0b0f1a'); cells += `<td class="num" style="background:${bg};color:${fg};font-weight:700">${pct == null ? '—' : pct + '%'}</td>`; });
    const ov = measAll ? posAll / measAll * 100 : -1; if (ov >= 0 && (!worst || ov > worst.ov)) worst = { es, ov, n: rowsEs.length };
    html += `<tr><td class="accent">${escH(es)}</td>${cells}<td class="num">${rowsEs.length}</td></tr>`;
  });
  html += '</tbody></table>';
  if (worst) html += `<div style="font-size:11px;color:var(--bm-muted);margin-top:8px">Estadío más vulnerable: <b style="color:#ef4444">${escH(worst.es)}</b> · ${worst.ov.toFixed(0)}% positividad global (${worst.n} muestras)</div>`;
  cont.innerHTML = html;
}

// ── Trazabilidad de lote (Sala → Módulo) ──
function drawContamination() {
  const cont = $('contam-body'); if (!cont) return;
  if (!RAW.length) { cont.innerHTML = ''; return; }
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const diag = DIAGS.includes(bracketDiag) ? bracketDiag : DIAGS[0];
  const isSala = (l) => /^\s*sala/i.test(l || ''), isModulo = (l) => /^\s*m[oó]dulo/i.test(l || '');
  const base = RAW.filter((r) => (!bracketFrom || r.f >= bracketFrom) && (!bracketTo || r.f <= bracketTo) && hasVal(r[diag]) && r.cod);
  const byCod = {};
  base.forEach((r) => { (byCod[r.cod] ||= { sala: { pos: 0, total: 0, set: new Set() }, mod: { pos: 0, total: 0, set: new Set() } }); const side = isSala(r.lugar) ? 'sala' : isModulo(r.lugar) ? 'mod' : null; if (!side) return; byCod[r.cod][side].total++; if (isPos(r[diag])) byCod[r.cod][side].pos++; byCod[r.cod][side].set.add(r.lugar); });
  const lots = Object.entries(byCod).filter(([, v]) => v.sala.total > 0 && v.mod.total > 0).map(([cod, v]) => { const sState = v.sala.pos > 0 ? 'Pos' : 'Neg', mState = v.mod.pos > 0 ? 'Pos' : 'Neg'; const cat = (sState === 'Neg' && mState === 'Pos') ? 'contam' : (sState === 'Pos' && mState === 'Neg') ? 'aclara' : (sState === 'Pos' && mState === 'Pos') ? 'persist' : 'limpio'; return { cod, v, cat, salaPct: Math.round(v.sala.pos / v.sala.total * 100), modPct: Math.round(v.mod.pos / v.mod.total * 100) }; });
  if (!lots.length) { cont.innerHTML = '<div style="color:var(--bm-muted);font-size:12px;padding:14px;text-align:center">Sin lotes presentes en Sala y Módulo a la vez para ' + DLABEL[diag] + ' en el período</div>'; return; }
  const catInfo = { contam: { short: 'Contaminación', label: 'Contaminación (Neg→Pos)', color: '#ef4444', bg: 'rgba(239,68,68,.15)' }, persist: { short: 'Persistente', label: 'Persistente (Pos→Pos)', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' }, aclara: { short: 'Aclaramiento', label: 'Aclaramiento (Pos→Neg)', color: '#22c55e', bg: 'rgba(34,197,94,.15)' }, limpio: { short: 'Limpio', label: 'Limpio (Neg→Neg)', color: '#64748b', bg: 'rgba(100,116,139,.15)' } };
  const counts = { contam: 0, persist: 0, aclara: 0, limpio: 0 }; lots.forEach((l) => counts[l.cat]++);
  let cards = `<div style="font-size:11px;color:var(--bm-muted);margin-bottom:8px">Diagnóstico: <b style="color:${DCOLOR[diag]}">${DLABEL[diag]}</b> · ${lots.length} lote(s) rastreables</div>`;
  cards += '<div class="rm-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">';
  ['contam', 'persist', 'aclara', 'limpio'].forEach((c) => { cards += `<div class="rm-cell"><div class="rm-label">${catInfo[c].label}</div><div class="rm-val" style="color:${catInfo[c].color}">${counts[c]}</div></div>`; });
  cards += '</div>';
  const order = { contam: 0, persist: 1, aclara: 2, limpio: 3 };
  lots.sort((a, b) => order[a.cat] - order[b.cat] || (b.modPct - b.salaPct) - (a.modPct - a.salaPct) || a.cod.localeCompare(b.cod));
  let tbl = '<table class="modal-table"><thead><tr><th>Lote / Código</th><th>Sala(s)</th><th class="num">Sala %pos</th><th>Módulo(s)</th><th class="num">Mód %pos</th><th class="num">Δ pp</th><th>Transición</th></tr></thead><tbody>';
  lots.forEach((l) => { const salas = [...l.v.sala.set].sort().join(', '), mods = [...l.v.mod.set].sort().join(', '), d = l.modPct - l.salaPct, dColor = d > 0 ? '#ef4444' : d < 0 ? '#22c55e' : 'var(--bm-muted)', ci = catInfo[l.cat]; tbl += `<tr><td class="accent">${escH(l.cod)}</td><td title="${escH(salas)}">${escH(trunc(salas, 22))}</td><td class="num">${l.salaPct}% <span style="color:var(--bm-muted)">(${l.v.sala.pos}/${l.v.sala.total})</span></td><td title="${escH(mods)}">${escH(trunc(mods, 22))}</td><td class="num">${l.modPct}% <span style="color:var(--bm-muted)">(${l.v.mod.pos}/${l.v.mod.total})</span></td><td class="num" style="color:${dColor};font-weight:700">${d > 0 ? '+' : ''}${d}</td><td><span class="badge" style="background:${ci.bg};color:${ci.color}">${ci.short}</span></td></tr>`; });
  tbl += '</tbody></table>'; cont.innerHTML = cards + tbl;
}

function drawReportSections() { drawLineComp(); drawCoinfection(); drawEstadioPos(); drawContamination(); }

function renderCharts() { refreshTheme(); drawHeatmap(); drawCalendar(); drawTreemap(); drawSwarm(); drawSankey(); drawTrend(); drawDonut(); }

// ── HTML del shell ──
function shellHTML() {
  const kpiCard = (d) => `<div class="card kpi k-${d.toLowerCase()}">
      <div class="kpi-glow" aria-hidden="true"></div>
      <div class="kpi-label">${DLABEL[d]} · Positivos</div>
      <div class="kpi-value" id="kv-${d}" aria-live="polite">—</div>
      <div class="kpi-sub" id="kn-${d}" style="color:${DCOLOR[d]}" aria-live="polite"></div>
      <div class="kpi-bar" aria-hidden="true"><div class="kpi-bar-fill" id="kb-${d}" style="width:0%"></div></div>
    </div>`;
  const diagPills = DIAGS.map((d) => `<button type="button" class="filter-btn on" data-diag="${d}">${DLABEL[d]}</button>`).join('');
  return `<div class="biomol"><div class="shell">
    <header class="bm-header">
      <div class="header-icon" aria-hidden="true">🧬</div>
      <div>
        <div class="header-title">Biología Molecular</div>
        <div class="header-sub">Monitoreo sanitario · diagnósticos por PCR</div>
      </div>
      <div class="header-right">
        <span class="pill active" id="sample-label" aria-live="polite">— muestras</span>
        <span class="pill" id="range-label" aria-live="polite">—</span>
      </div>
    </header>

    <div class="filterbar" role="search" aria-label="Filtros">
      <div class="fb-group">
        <span class="fb-label">Diagnóstico</span>
        <div class="fb-pills" id="diag-filter">${diagPills}</div>
      </div>
      <div class="fb-sep"></div>
      <div class="fb-group">
        <span class="fb-label">Lugar</span>
        <div class="fb-dropdown-wrap" id="lugar-dropdown-wrap">
          <button type="button" class="fb-trigger" id="lugar-trigger" aria-haspopup="listbox" aria-expanded="false"><span id="lugar-summary">Todos</span><span class="fb-caret">▾</span></button>
          <div class="fb-panel hidden" id="lugar-panel" role="listbox">
            <div class="fb-search-row"><input class="fb-search" id="lugar-search" type="search" placeholder="Buscar lugar…" autocomplete="off"></div>
            <div class="fb-actions"><button type="button" class="fb-action-btn" id="btn-all-lugares">Todos</button><button type="button" class="fb-action-btn" id="btn-none-lugares">Ninguno</button></div>
            <div class="fb-check-list" id="lugar-check-list"></div>
          </div>
        </div>
      </div>
      <div class="fb-sep"></div>
      <div class="fb-group">
        <span class="fb-label">Período</span>
        <div class="fb-date-row">
          <div class="fb-preset-group">
            <button type="button" class="fb-preset on" data-preset="all">Todo</button>
            <button type="button" class="fb-preset" data-preset="30">30d</button>
            <button type="button" class="fb-preset" data-preset="14">14d</button>
            <button type="button" class="fb-preset" data-preset="7">7d</button>
            <button type="button" class="fb-preset" data-preset="custom">Custom</button>
          </div>
          <div class="fb-date-inputs" id="fb-date-inputs" style="display:none">
            <input type="date" class="fb-date-input" id="date-from"><span style="color:var(--bm-muted);font-size:11px">→</span><input type="date" class="fb-date-input" id="date-to">
            <button type="button" class="fb-action-btn" id="apply-date-range" style="margin-left:6px;background:var(--bm-accent-soft);border-color:var(--bm-accent);color:var(--bm-accent);font-weight:600">Aplicar</button>
          </div>
        </div>
      </div>
      <div class="fb-sep"></div>
      <button type="button" class="report-trigger-btn" id="report-btn" title="Reporte comparativo">📊 REPORTE</button>
      <button type="button" class="report-trigger-btn aud-btn" id="aud-btn" aria-pressed="false" title="Modo auditoría (simula resultados)">AUD</button>
      <button type="button" class="report-trigger-btn" id="rsd-btn" title="RS · Registro del día (lo más reciente)">RS</button>
      <div class="fb-chips" id="filter-chips" aria-live="polite"></div>
    </div>

    <div class="grid-kpi" role="region" aria-label="Indicadores clave">
      ${DIAGS.map(kpiCard).join('')}
      <div class="card kpi kpi-clickable" id="kpi-total" role="button" tabindex="0" aria-label="Ver detalle de muestras por lugar y mes">
        <div class="kpi-label">Total Muestras</div>
        <div class="kpi-value" id="kv-total" aria-live="polite">—</div>
        <div class="kpi-sub" style="color:var(--bm-muted);font-size:10px">Click para detalle por mes</div>
        <div class="kpi-bar" aria-hidden="true"><div class="kpi-bar-fill" style="width:100%;background:#64748b"></div></div>
      </div>
      <div class="card kpi">
        <div class="kpi-label">Fechas Analizadas</div>
        <div class="kpi-value" id="kv-dates" style="color:#22d3ee;font-size:20px" aria-live="polite">—</div>
        <div class="kpi-bar" aria-hidden="true"><div class="kpi-bar-fill" style="width:100%;background:#0e7490"></div></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card" id="c-heatmap">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#38bdf8"></span>Mapa de Calor · Diagnóstico × Dimensión</div><button type="button" class="fs-btn" data-target="c-heatmap" title="Pantalla completa">⛶</button></div>
        <div class="tab-row" id="hm-tabs">
          <button type="button" class="tab on" data-hm="lugar">Por Lugar</button>
          <button type="button" class="tab" data-hm="fecha">Por Fecha</button>
          <button type="button" class="tab" data-hm="lote">Por Código</button>
          <button type="button" class="tab" data-hm="lineas_int">Líneas internas</button>
          <button type="button" class="tab" data-hm="lineas_ext">Líneas externas</button>
          <button type="button" class="tab" data-hm="estadio">Por Estadío</button>
          <button type="button" class="tab" data-hm="sexo">Por Sexo</button>
          <button type="button" class="tab" data-hm="corrida">Por Corrida</button>
          <button type="button" class="tab" data-hm="otros">Por Otros</button>
          <button type="button" class="tab" data-hm="piscina">Por Piscina</button>
        </div>
        <div class="suppress-bar" id="hm-suppress-bar"></div>
        <div class="chart-scroll"><svg id="heatmap" width="100%" height="220"></svg></div>
        <div class="legend"><div class="leg-item"><div class="leg-rect" style="background:#22c55e"></div>0%</div><div class="leg-item"><div class="leg-rect" style="background:#f59e0b"></div>50%</div><div class="leg-item"><div class="leg-rect" style="background:#ef4444"></div>100%</div><div class="leg-item"><div class="leg-rect" style="background:var(--bm-grid)"></div>Sin datos</div></div>
      </div>
      <div class="card" id="c-calendar">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#f59e0b"></span>Calendario Térmico · % Positivos por Día</div><button type="button" class="fs-btn" data-target="c-calendar" title="Pantalla completa">⛶</button></div>
        <div class="tab-row" id="cal-gran-tabs">
          <button type="button" class="tab" data-gran="auto">Auto</button>
          <button type="button" class="tab" data-gran="day">Día</button>
          <button type="button" class="tab" data-gran="week">Semana</button>
          <button type="button" class="tab on" data-gran="month">Mes</button>
        </div>
        <div class="suppress-bar" id="cal-suppress-bar"></div>
        <div class="chart-scroll"><svg id="calendar" width="100%" height="220"></svg></div>
        <div class="legend"><div class="leg-item"><div class="leg-rect" style="background:#22c55e"></div>Bajo</div><div class="leg-item"><div class="leg-rect" style="background:#f59e0b"></div>Medio</div><div class="leg-item"><div class="leg-rect" style="background:#ef4444"></div>Alto</div></div>
      </div>
    </div>
    <div class="grid-3-1">
      <div class="card" id="c-treemap">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#a78bfa"></span>Jerarquía · Lugar → Tanque</div><button type="button" class="fs-btn" data-target="c-treemap" title="Pantalla completa">⛶</button></div>
        <div class="tab-row" id="treemap-diag-tabs" style="margin-bottom:4px"></div>
        <svg id="treemap" width="100%" height="280"></svg>
      </div>
      <div class="card" id="c-swarm">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#ef4444"></span>Dispersión por Tanque</div><button type="button" class="fs-btn" data-target="c-swarm" title="Pantalla completa">⛶</button></div>
        <div class="tab-row" id="swarm-diag-tabs" style="margin-bottom:4px"></div>
        <div class="tab-row" id="swarm-tabs" style="margin-bottom:4px"></div>
        <div class="tab-row" id="swarm-day-tabs"></div>
        <svg id="swarm" width="100%" height="220"></svg>
        <div class="legend"><div class="leg-item"><div class="leg-dot" style="background:#ef4444"></div>Positivo</div><div class="leg-item"><div class="leg-dot" style="background:#22c55e"></div>Negativo</div><div class="leg-item"><div class="leg-dot" style="background:#64748b"></div>Sin dato</div></div>
      </div>
    </div>
    <div class="grid-full">
      <div class="card" id="c-sankey">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#22d3ee"></span><span id="sankey-title">Flujo Operativo · Lugar → Diagnóstico → Resultado</span></div><button type="button" class="fs-btn" data-target="c-sankey" title="Pantalla completa">⛶</button></div>
        <div class="sankey-controls">
          <div class="tab-row" id="sankey-diag-tabs"></div>
          <button type="button" class="sankey-mode-btn" id="sankey-mode-btn" aria-pressed="false" title="Trazabilidad: Sala → Resultado → Lote → Módulo → Resultado">Origen</button>
          <button type="button" class="sankey-mode-btn" id="sankey-psm-btn" aria-pressed="false" title="Trazabilidad: Piscina → Sala → Análisis → Módulo → Análisis → Precría">P-S-M</button>
          <button type="button" class="sankey-mode-btn" id="sankey-reset-btn" style="display:none" title="Restaurar elementos ocultos">↺ Restaurar</button>
        </div>
        <svg id="sankey" width="100%" style="display:block;min-height:180px;height:100%" preserveAspectRatio="xMidYMid meet"></svg>
      </div>
    </div>
    <div class="grid-2">
      <div class="card" id="c-trend">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#22c55e"></span>Tendencia de Positividad</div><button type="button" class="fs-btn" data-target="c-trend" title="Pantalla completa">⛶</button></div>
        <div class="tab-row" id="trend-diag-tabs" style="margin-bottom:4px"></div>
        <svg id="trend" width="100%" height="220"></svg>
        <div class="legend" id="trend-legend"></div>
      </div>
      <div class="card" id="c-donut">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#a78bfa"></span>Positividad por Diagnóstico</div><button type="button" class="fs-btn" data-target="c-donut" title="Pantalla completa">⛶</button></div>
        <svg id="donut" width="100%" height="300"></svg>
      </div>
    </div>
    <div class="grid-full">
      <div class="card" id="c-table">
        <div class="card-header"><div class="card-title-text"><span class="dot" style="background:#64748b"></span>Registro Detallado</div>
          <button type="button" class="reload-btn" id="export-xlsx-btn" style="margin-right:6px" title="Exportar a Excel">⬇ Excel</button>
          <button type="button" class="fs-btn" data-target="c-table" title="Pantalla completa">⛶</button>
        </div>
        <div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Código</th><th>Lugar</th><th>Tanque</th><th>Estadío</th><th>Sexo</th><th>IHHNV</th><th>WSSV</th><th>BP</th><th>AHPND/EMS</th><th>NHPB</th><th>EHP</th></tr></thead><tbody id="table-body"></tbody></table></div>
      </div>
    </div>

    <button type="button" id="bm-fs-exit">✕ Salir de pantalla completa &nbsp;<span style="opacity:.5;font-size:10px">ESC</span></button>
    <div id="bm-tooltip" role="tooltip"></div>

    <div class="modal-overlay" id="total-modal" role="dialog" aria-modal="true">
      <div class="modal-content" style="max-width:760px">
        <div class="modal-header"><h2 class="modal-title">Detalle de muestras · Lugar × Mes</h2><button type="button" class="modal-close" id="total-modal-close">✕ Cerrar</button></div>
        <div class="modal-body" id="total-modal-body"></div>
      </div>
    </div>

    <div class="modal-overlay" id="rsd-modal" role="dialog" aria-modal="true">
      <div class="modal-content" style="max-width:1120px">
        <div class="modal-header"><h2 class="modal-title">🗓️ RS · Registro del día</h2><button type="button" class="modal-close" id="rsd-modal-close">✕ Cerrar</button></div>
        <div class="modal-body">
          <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
            <label style="font-size:12px;color:var(--bm-muted);display:flex;align-items:center;gap:6px">📅 Fecha
              <select id="rsd-date" style="background:var(--bm-surface);color:var(--bm-text);border:1px solid var(--bm-grid);border-radius:6px;padding:5px 8px;font-size:12px"></select></label>
            <label style="font-size:12px;color:var(--bm-muted);display:flex;align-items:center;gap:6px">🧬 Diagnóstico
              <select id="rsd-diag" style="background:var(--bm-surface);color:var(--bm-text);border:1px solid var(--bm-grid);border-radius:6px;padding:5px 8px;font-size:12px"></select></label>
            <span id="rsd-summary" style="font-size:12px;color:var(--bm-text)"></span>
          </div>
          <div style="font-size:11px;color:var(--bm-muted);margin-bottom:8px">Mapa <b>Lugar × Diagnóstico</b> (% positivos · verde 0% → rojo 100%). Pasa el cursor por una celda para ver las muestras; clic en un lugar para filtrar la tabla de abajo.</div>
          <div class="chart-scroll"><svg id="rsd-heatmap" width="100%" height="160"></svg></div>
          <div id="rsd-detail"></div>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="bm-export-modal" role="dialog" aria-modal="true">
      <div class="modal-content" style="max-width:440px">
        <div class="modal-header"><h2 class="modal-title">⬇ Exportar a Excel · rango de fechas</h2><button type="button" class="modal-close" id="bm-export-close">✕ Cerrar</button></div>
        <div class="modal-body">
          <div id="bm-export-scope" style="font-size:12px;color:var(--bm-muted);margin-bottom:12px"></div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
            <label style="font-size:12px;color:var(--bm-muted);display:flex;flex-direction:column;gap:5px">Desde
              <input type="date" id="bm-export-from" class="rs-input"></label>
            <label style="font-size:12px;color:var(--bm-muted);display:flex;flex-direction:column;gap:5px">Hasta
              <input type="date" id="bm-export-to" class="rs-input"></label>
          </div>
          <div id="bm-export-info" style="font-size:12px;color:var(--bm-text);margin-bottom:14px"></div>
          <button type="button" class="report-add-btn" id="bm-export-go">⬇ Descargar Excel</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="report-modal" role="dialog" aria-modal="true">
      <div class="modal-content report-modal-content">
        <div class="modal-header"><h3 class="modal-title">📊 Reporte Comparativo · hasta 3 series</h3><button type="button" class="modal-close" id="report-modal-close">✕ ESC</button></div>
        <div class="modal-body report-body">
          <div class="report-controls">
            <div class="report-control-group"><span class="report-ctrl-label">Agrupación</span><button type="button" class="report-toggle" data-agg="daily">Diaria</button><button type="button" class="report-toggle" data-agg="weekly">Semanal</button><button type="button" class="report-toggle on" data-agg="monthly">Mensual</button></div>
            <div class="report-control-group"><span class="report-ctrl-label">Gráfico</span><button type="button" class="report-toggle on" data-chart="line">Línea</button><button type="button" class="report-toggle" data-chart="area">Área</button><button type="button" class="report-toggle" data-chart="bar">Barras</button><button type="button" class="report-toggle" data-chart="stacked">Apilada</button></div>
            <div class="report-control-group"><span class="report-ctrl-label">Métrica</span><button type="button" class="report-toggle on" data-metric="pct">% Positividad</button><button type="button" class="report-toggle" data-metric="pos">Positivos</button><button type="button" class="report-toggle" data-metric="neg">Negativos</button><button type="button" class="report-toggle" data-metric="total">Muestras</button></div>
            <div class="report-control-group"><span class="report-ctrl-label">Promedio</span><button type="button" class="report-toggle" data-extra="avg" title="Líneas de promedio por serie">Línea Promedio</button><button type="button" class="report-toggle" data-extra="ma" title="Media móvil (3 puntos)">Media Móvil</button></div>
            <button type="button" class="report-add-btn" id="add-series-btn">+ Añadir serie</button>
          </div>
          <div class="report-series-row" id="report-series"></div>
          <div class="report-chart-wrap"><svg id="report-svg" height="340"></svg></div>
          <div class="report-metrics-grid" id="report-metrics"></div>

          <div class="bracket-section">
            <div class="bracket-section-header">
              <h4 class="bracket-section-title">Árbol de Campeonato · Módulos ⇄ Salas</h4>
              <div class="bracket-controls">
                <div class="bracket-ctrl"><span class="bracket-ctrl-label">Diagnóstico</span><select id="bracket-diag" class="rs-input"></select></div>
                <div class="bracket-ctrl"><span class="bracket-ctrl-label">Desde</span><input type="date" id="bracket-from" class="rs-input"></div>
                <div class="bracket-ctrl"><span class="bracket-ctrl-label">Hasta</span><input type="date" id="bracket-to" class="rs-input"></div>
                <button type="button" class="bracket-sync-btn" id="bracket-sync-series" title="Adoptar filtros de la Serie 1">⇉ Sync Serie 1</button>
              </div>
            </div>
            <div class="bracket-wrap"><svg id="bracket-svg"></svg></div>
          </div>

          <div class="bracket-section">
            <div class="bracket-section-header">
              <h4 class="bracket-section-title">Líneas Internas vs Externas · % Positividad por Diagnóstico</h4>
              <div style="font-size:10px;color:var(--bm-muted)">Internas: códigos sin «Texcumar» · Externas: con «Texcumar» · período del árbol</div>
            </div>
            <div class="bracket-wrap"><svg id="linecomp-svg"></svg></div>
            <div id="linecomp-table" style="margin-top:10px"></div>
          </div>

          <div class="bracket-section">
            <div class="bracket-section-header"><h4 class="bracket-section-title">Coinfección · Muestras positivas a ≥2 diagnósticos</h4><div style="font-size:10px;color:var(--bm-muted)">Período del árbol · sobre muestras evaluadas</div></div>
            <div id="coinf-body"></div>
          </div>

          <div class="bracket-section">
            <div class="bracket-section-header"><h4 class="bracket-section-title">Positividad por Estadío · etapa larvaria más vulnerable</h4><div style="font-size:10px;color:var(--bm-muted)">Período del árbol · % positivos por estadío y diagnóstico</div></div>
            <div id="estadio-body"></div>
          </div>

          <div class="bracket-section">
            <div class="bracket-section-header"><h4 class="bracket-section-title">Trazabilidad de Lote · Cambios de estado Sala → Módulo</h4><div style="font-size:10px;color:var(--bm-muted)">Diagnóstico y período del árbol · solo lotes presentes en Sala y Módulo</div></div>
            <div id="contam-body"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="bracket-popover" class="bracket-popover" role="dialog" style="display:none">
      <div class="bracket-pop-header"><span class="bracket-pop-title" id="bracket-pop-title"></span><button type="button" class="bracket-pop-close" id="bracket-pop-close">✕</button></div>
      <svg id="bracket-pop-svg" width="340" height="180"></svg>
      <div id="bracket-pop-meta" style="margin-top:6px;font-size:10px;color:var(--bm-muted)"></div>
    </div>
  </div></div>`;
}

// ── Inicialización de filtros (respeta selección previa salvo reset) ──
function initFilters(reset) {
  const lugares = [...new Set(RAW.map((d) => d.lugar))].sort();
  const fechas = [...new Set(RAW.map((d) => d.f))].sort();
  // El modo AUD nunca sobrevive a un rebuild de RAW: su transformación (simulación)
  // se aplica solo al pulsar el botón y NO se reaplica al reconstruir RAW. Por eso,
  // tras cualquier (re)render el estado correcto es "off" (datos reales) — evita que
  // el botón quede "on" mostrando datos reales tras navegar y volver.
  audMode = false;
  if (reset) {
    timeGran = 'month'; datePreset = 'all';
    activeLugares = new Set(lugares); activeFechas = new Set(fechas); activeDiags = new Set(DIAGS);
    originSuppressed.clear(); hmSuppressed.clear(); calSuppressed.clear();
  } else {
    activeLugares = new Set([...activeLugares].filter((l) => lugares.includes(l)));
    if (!activeLugares.size) lugares.forEach((l) => activeLugares.add(l));
    activeFechas = new Set([...activeFechas].filter((f) => fechas.includes(f)));
    if (!activeFechas.size) fechas.forEach((f) => activeFechas.add(f));
  }
  buildLugarList(lugares);
  updateLugarSummary();
  document.querySelectorAll('.biomol .fb-preset').forEach((b) => b.classList.toggle('on', b.dataset.preset === datePreset));
  $('fb-date-inputs').style.display = datePreset === 'custom' ? 'flex' : 'none';
  if (fechas.length) {
    const df = $('date-from'), dt = $('date-to');
    df.min = fechas[0]; df.max = fechas[fechas.length - 1]; if (!df.value) df.value = fechas[0];
    dt.min = fechas[0]; dt.max = fechas[fechas.length - 1]; if (!dt.value) dt.value = fechas[fechas.length - 1];
  }
  if (reset || !swarmDate || !fechas.includes(swarmDate)) swarmDate = fechas[fechas.length - 1] || null;
  document.querySelectorAll('#cal-gran-tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.gran === timeGran));
  buildSwarmTabs(fechas);
  buildDiagTabs('swarm-diag-tabs', () => swarmDiag, (v) => { swarmDiag = v; }, drawSwarm, true);
  buildDiagTabs('treemap-diag-tabs', () => treemapDiag, (v) => { treemapDiag = v; }, drawTreemap, true);
  buildDiagTabs('trend-diag-tabs', () => trendDiag, (v) => { trendDiag = v; }, drawTrend, true);
  buildDiagTabs('sankey-diag-tabs', () => sankeyDiag, (v) => { sankeyDiag = v; }, drawSankey, false);
  // Sincroniza los controles del Sankey con el estado actual
  const oBtn = $('sankey-mode-btn'), pBtn = $('sankey-psm-btn'), sTitle = $('sankey-title');
  if (oBtn) oBtn.classList.toggle('on', sankeyMode === 'origen');
  if (pBtn) pBtn.classList.toggle('on', sankeyMode === 'psm');
  if (sTitle) sTitle.textContent = sankeyMode === 'origen' ? 'Trazabilidad · Sala → Resultado → Lote → Módulo → Resultado' : sankeyMode === 'psm' ? 'Trazabilidad · Piscina → Sala → Análisis → Módulo → Análisis → Precría' : 'Flujo Operativo · Lugar → Diagnóstico → Resultado';
  updateOriginResetBtn();
  updateAudBtn();
  updateChips();
}

function wire(root) {
  root.querySelectorAll('#diag-filter .filter-btn').forEach((b) => b.addEventListener('click', () => { togClass(activeDiags, b.dataset.diag, b); render(); }));
  $('lugar-trigger').addEventListener('click', () => toggleDropdown('lugar'));
  $('lugar-search').addEventListener('input', (e) => filterLugarList(e.target.value));
  $('btn-all-lugares').addEventListener('click', selectAllLugares);
  $('btn-none-lugares').addEventListener('click', selectNoneLugares);
  root.querySelectorAll('.fb-preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset, b)));
  $('apply-date-range').addEventListener('click', applyDateRange);
  $('kpi-total').addEventListener('click', showTotalBreakdown);
  $('kpi-total').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTotalBreakdown(); } });
  $('total-modal-close').addEventListener('click', closeTotalModal);
  $('total-modal').addEventListener('click', (e) => { if (e.target.id === 'total-modal') closeTotalModal(); });
  $('aud-btn').addEventListener('click', toggleAud);
  // Modal RS · Registro del día
  $('rsd-btn').addEventListener('click', openRS);
  $('rsd-modal-close').addEventListener('click', closeRS);
  $('rsd-modal').addEventListener('click', (e) => { if (e.target.id === 'rsd-modal') closeRS(); });
  $('rsd-date').addEventListener('change', (e) => { rsdDate = e.target.value; rsdLugar = null; renderRS(); });
  $('rsd-diag').addEventListener('change', (e) => { rsdDiag = e.target.value; renderRS(); });
  $('export-xlsx-btn').addEventListener('click', openExportModal);
  $('bm-export-close')?.addEventListener('click', closeExportModal);
  $('bm-export-go')?.addEventListener('click', runExport);
  $('bm-export-modal')?.addEventListener('click', (e) => { if (e.target.id === 'bm-export-modal') closeExportModal(); });
  ['bm-export-from', 'bm-export-to'].forEach((id) => $(id)?.addEventListener('change', updateBmExportInfo));
  // Reporte comparativo
  $('report-btn').addEventListener('click', openReport);
  $('report-modal-close').addEventListener('click', closeReport);
  $('report-modal').addEventListener('click', (e) => { if (e.target.id === 'report-modal') closeReport(); });
  $('add-series-btn').addEventListener('click', () => addReportSeries());
  root.querySelectorAll('#report-modal .report-toggle').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.agg) { reportAgg = btn.dataset.agg; root.querySelectorAll('#report-modal [data-agg]').forEach((b) => b.classList.toggle('on', b === btn)); }
    else if (btn.dataset.chart) { reportChart = btn.dataset.chart; root.querySelectorAll('#report-modal [data-chart]').forEach((b) => b.classList.toggle('on', b === btn)); }
    else if (btn.dataset.metric) { reportMetric = btn.dataset.metric; root.querySelectorAll('#report-modal [data-metric]').forEach((b) => b.classList.toggle('on', b === btn)); }
    else if (btn.dataset.extra) { const x = btn.dataset.extra; if (reportExtras.has(x)) reportExtras.delete(x); else reportExtras.add(x); btn.classList.toggle('on', reportExtras.has(x)); }
    renderReport();
  }));
  // Tabs de gráficos
  root.querySelectorAll('#hm-tabs .tab').forEach((t) => t.addEventListener('click', () => { root.querySelectorAll('#hm-tabs .tab').forEach((x) => x.classList.remove('on')); t.classList.add('on'); hmMode = t.dataset.hm; drawHeatmap(); }));
  root.querySelectorAll('#cal-gran-tabs .tab').forEach((t) => t.addEventListener('click', () => { root.querySelectorAll('#cal-gran-tabs .tab').forEach((x) => x.classList.remove('on')); t.classList.add('on'); timeGran = t.dataset.gran; drawCalendar(); drawHeatmap(); }));
  root.querySelectorAll('.fs-btn').forEach((b) => b.addEventListener('click', () => toggleFS(b.dataset.target)));
  $('bm-fs-exit').addEventListener('click', exitFS);
  // Sankey: modos de trazabilidad + restaurar
  $('sankey-mode-btn').addEventListener('click', () => setSankeyMode('origen'));
  $('sankey-psm-btn').addEventListener('click', () => setSankeyMode('psm'));
  $('sankey-reset-btn').addEventListener('click', () => { suppressedForMode().forEach((k) => originSuppressed.delete(k)); updateOriginResetBtn(); drawSankey(); });
  // Cerrar dropdowns y seguir el tooltip: sobre el contenedor `root` de la vista.
  // El router crea un root nuevo en cada render, así que estos listeners se liberan
  // solos al navegar (antes vivían en `document` de por vida y el de mousemove corría
  // en CADA movimiento del ratón en toda la app).
  root.addEventListener('click', (e) => { if (!e.target.closest('.biomol .fb-dropdown-wrap')) closeDropdowns(); });
  root.addEventListener('mousemove', (e) => { const t = $('bm-tooltip'); if (t && t.style.opacity === '1') moveTip(e); });
  // Escape es global por naturaleza: se registra UNA sola vez (guard) y es no-op
  // cuando no hay modal/fullscreen de Biomol montado.
  if (!docWired) {
    docWired = true;
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; const rm = $('report-modal'), tm = $('total-modal'), sm = $('rsd-modal'), em = $('bm-export-modal'); if (em && em.classList.contains('open')) closeExportModal(); else if (rm && rm.classList.contains('open')) closeReport(); else if (tm && tm.classList.contains('open')) closeTotalModal(); else if (sm && sm.classList.contains('open')) closeRS(); else if (fsCard) exitFS(); else closeDropdowns(); });
  }
}

export function biomolecularView(root) {
  if (!store.globalData.length) { root.innerHTML = '<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>'; return; }
  RAW = normalizeRows(store.globalData.filter((r) => r._SheetOrigin === 'Biomol'));
  if (!RAW.length) { root.innerHTML = '<div class="empty-state" style="padding:60px 20px">🧬 Sin datos en la hoja <b>Biomol</b> del Google Sheet.</div>'; return; }

  // La vista depende de D3 (CDN en index.html). Si no cargó (firewall/offline), un
  // mensaje accionable es mejor que el "Error al cargar" genérico del import diferido.
  if (!window.d3) {
    root.innerHTML = '<div class="empty-state" style="padding:60px 20px">🧬 No se pudo cargar la librería de gráficos <b>D3</b>.<br><small class="muted">Revisa el &lt;script&gt; del CDN en index.html o tu conexión a internet.</small></div>';
    return;
  }
  // Re-sincroniza D3 por si el CDN cargó DESPUÉS del import diferido de este módulo
  // (el guard de arriba mira window.d3, pero las funciones de dibujo usan `d3`).
  d3 = window.d3;

  const sig = RAW.length + '|' + RAW[0].f + '|' + RAW[RAW.length - 1].f;
  const reset = sig !== lastSig;
  lastSig = sig;

  bracketWired = false; // el DOM del modal se recrea en cada render
  root.innerHTML = shellHTML();
  initFilters(reset);
  wire(root);
  render();
}
