/* ============================================================
   SUPERVISOR · Resumen Operativo del Módulo
   ============================================================ */
import { modStats, tankStats, tanksOf, getters } from './stats.js';
import { moduleSvPopSeries, moduleHourlyDates, moduleHourly, moduleDayKpis, cosechaEstimate } from './moduleTrends.js';
import { HR_LABELS } from './tank.js';
import { colorFor, fmt1, fmt2, fmtPop, kpiGlass, kpiTecnicos, breadcrumb } from './ui.js';
import { svLevel, odLevel, tmpLevel, levelColor, levelLabel, esc } from '../../core/format.js';
import { store } from '../../core/store.js';
import { getField, F } from '../../core/fields.js';
import { parseAnyDate, fmtShort } from '../../core/dates.js';
import { desinfeccionDetalle } from './desinfeccion.js';
import { iclSeries } from './params.js';
import { lotBrand } from './omtex.js';
import { makeChart } from '../../core/charts.js';
import {
  isMicroRow, rowContext as microCtx, meltRow as microMelt, pathogenRecords as microRecords,
  PATHOGENS as MIC_PATHOGENS, PATHOGEN_COLOR as MIC_COLOR, NIVEL_COLOR as MIC_NIVEL_COLOR,
  NIVEL_RANK as MIC_NIVEL_RANK, AGGREGATE_KEYS as MIC_AGG, FORMATO_LABEL as MIC_FMT_LABEL, PATHOGEN_AGAR,
} from '../microbiologia/data.js';
import { petriSVG } from '../microbiologia/petri.js';

const { gOD, gTmp } = getters;
const SUP_KEYS = ['Supervisor', 'supervisor', 'SUPERVISOR'];
// El comentario se dividió en matutino / vespertino (antes una sola col. "Comentario").
const COM_M_KEYS = ['Comentario (matutino)', 'Comentario matutino', 'comentario (matutino)', 'comentario matutino'];
const COM_V_KEYS = ['Comentario (vespertino)', 'Comentario vespertino', 'comentario (vespertino)', 'comentario vespertino'];
const COM_LEGACY = ['Comentario', 'Comentarios', 'comentario', 'comentarios'];
const getComM = (r) => getField(r, COM_M_KEYS) || getField(r, COM_LEGACY);
const getComV = (r) => getField(r, COM_V_KEYS);
const hasCom = (r) => !!(getComM(r) || getComV(r));
const SIE_KEYS = ['Siembra', 'siembra', 'SIEMBRA'];
const isRevisionRow = (r) => r && r._SheetOrigin === 'Registro_Supervision';
const modNum = (s) => { const m = String(s).match(/\d+/); return m ? +m[0] : null; };
/** Empareja "M03" (Supervisor) con "Módulo 3" (Registro_Supervisión) por número; CIO por letras. */
const sameModule = (a, b) => {
  const na = modNum(a), nb = modNum(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a).replace(/[^a-z]/gi, '').toUpperCase() === String(b).replace(/[^a-z]/gi, '').toUpperCase();
};
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/* ---- Heatmap Biomol del módulo (lee la hoja "Biomol" del store) ---- */
const BM_DIAGS = ['IHHNV', 'WSSV', 'BP', 'AHPND', 'NHPB', 'EHP'];
const BM_DLABEL = { IHHNV: 'IHHNV', WSSV: 'WSSV', BP: 'BP', AHPND: 'AHPND/EMS', NHPB: 'NHPB', EHP: 'EHP' };
// Mismas equivalencias de columna que la vista Biología Molecular.
const BM_ALIASES = {
  fecha: 'Fecha', 'código': 'Código', codigo: 'Código', corrida: 'Corrida', piscina: 'Piscina',
  lugar: 'Lugar', tanque: 'Tanque', otros: 'Otros', muestra: 'Muestra', 'estadío': 'Estadío',
  estadio: 'Estadío', tipo: 'Estadío', sexo: 'Sexo', ihhnv: 'IHHNV', cc: 'IHHNV', wssv: 'WSSV',
  dd: 'WSSV', bp: 'BP', ee: 'BP', 'ahpnd/ems': 'AHPND', ahpnd: 'AHPND', ems: 'AHPND', pp: 'AHPND',
  nhpb: 'NHPB', nhp: 'NHPB', 'nhp-b': 'NHPB', nn: 'NHPB', ehp: 'EHP',
};
const bmIsPos = (v) => v === 'Positivo';
const bmHasVal = (v) => v === 'Positivo' || v === 'Negativo';
const bmNorm = (s) => {
  const l = String(s).toLowerCase();
  if (['positivo', 'positive', 'pos', 'p', '1', 'si', 'sí'].includes(l)) return 'Positivo';
  if (['negativo', 'negative', 'neg', 'n', '0', 'no'].includes(l)) return 'Negativo';
  return '';
};
const bmNat = (a, b) => { const x = String(a).match(/\d+/), y = String(b).match(/\d+/); return (x && y && +x[0] !== +y[0]) ? +x[0] - +y[0] : String(a).localeCompare(String(b)); };
// Orden cronológico de estadíos: N < Z < M < PL (y nº dentro del grupo). Mismo criterio que la vista Biomol.
function bmEstadioOrder(s) {
  const u = String(s).toUpperCase().trim().replace(/\s+/g, '');
  let m;
  if ((m = u.match(/^N-?(\d+)$/))) return +m[1];
  if ((m = u.match(/^Z-?(\d+)$/))) return 10 + +m[1];
  if ((m = u.match(/^M-?(\d+)$/))) return 50 + +m[1];
  if ((m = u.match(/^PL-?(\d+)$/))) return 100 + +m[1];
  if (u.includes('REPRODUCTOR')) return 99999;
  return 9000;
}
const bmEstadioCmp = (a, b) => { const oa = bmEstadioOrder(a), ob = bmEstadioOrder(b); return oa !== ob ? oa - ob : String(a).localeCompare(String(b)); };
const bmDistinct = (arr) => [...new Set(arr.filter(Boolean))];
// Verde (0% pos) → rojo (100% pos); igual escala que la vista Biomol.
const bmPctColor = (p) => (p === null ? null : `rgb(${Math.round(34 + (239 - 34) * p / 100)},${Math.round(197 + (68 - 197) * p / 100)},${Math.round(94 + (68 - 94) * p / 100)})`);

/** ¿La columna "Lugar" de Biomol (p.ej. "Módulo 1-2") corresponde a este módulo?
 *  Las muestras compartidas (pares 1-2, 6-7, 4-5, 9-10) salen en AMBOS módulos. */
function bmLugarMatches(lugar, mod) {
  const ls = String(lugar);
  const mn = modNum(mod);
  if (mn !== null) {
    // Solo lugares tipo "Módulo N" / "Módulos N-M"; excluye Sala/Maduración/Algas/Proveedor
    // (esos contienen dígitos que coincidirían por error con el nº de módulo).
    if (!/m[óo]dulos?\b/i.test(ls)) return false;
    const nums = ls.match(/\d+/g); return !!nums && nums.map(Number).includes(mn);
  }
  const a = ls.replace(/[^a-z]/gi, '').toUpperCase(), b = String(mod).replace(/[^a-z]/gi, '').toUpperCase();
  return !!b && a.includes(b);
}

// Igualdad laxa de corrida (compara solo los dígitos: "C-573" ≡ "573").
const bmDigits = (s) => (String(s).match(/\d+/g) || []).join('');
const bmCorridaEq = (a, b) => { const da = bmDigits(a); return !!da && da === bmDigits(b); };
const bmIsReproductor = (estadio) => /reproductor/i.test(String(estadio));

/** Filas Biomol normalizadas del módulo `mod`, filtradas por `corrida` (si se indica)
 *  y EXCLUYENDO las muestras en estadío Reproductores. */
function biomolForModule(mod, corrida) {
  const out = [];
  store.globalData.forEach((row) => {
    if (row._SheetOrigin !== 'Biomol') return;
    const nr = {};
    Object.keys(row).forEach((k) => { const al = BM_ALIASES[k.trim().toLowerCase()]; if (al) nr[al] = String(row[k] == null ? '' : row[k]).trim(); });
    const lugar = nr['Lugar'] || '';
    if (!bmLugarMatches(lugar, mod)) return;
    const estadio = nr['Estadío'] || '';
    if (bmIsReproductor(estadio)) return;                       // sin Reproductores
    const cor = nr['Corrida'] || '';
    if (corrida && !bmCorridaEq(cor, corrida)) return;          // solo la corrida abierta
    out.push({
      fecha: nr['Fecha'] || '', cod: nr['Código'] || '', corrida: cor, lugar, tq: nr['Tanque'] || '—', estadio, sexo: nr['Sexo'] || '',
      IHHNV: bmNorm(nr['IHHNV'] || ''), WSSV: bmNorm(nr['WSSV'] || ''), BP: bmNorm(nr['BP'] || ''),
      AHPND: bmNorm(nr['AHPND'] || ''), NHPB: bmNorm(nr['NHPB'] || ''), EHP: bmNorm(nr['EHP'] || ''),
    });
  });
  return out;
}

/* Tooltip flotante reutilizable para el heatmap Biomol. */
let bmTipEl = null;
function bmTip() { if (!bmTipEl) { bmTipEl = document.createElement('div'); bmTipEl.className = 'sv-bm-tip'; document.body.appendChild(bmTipEl); } return bmTipEl; }
function bmShowTip(html, e) { const t = bmTip(); t.innerHTML = html; t.style.opacity = '1'; bmMoveTip(e); }
function bmMoveTip(e) { const t = bmTip(); const x = e.clientX + 14, y = e.clientY + 14; t.style.left = Math.min(x, window.innerWidth - t.offsetWidth - 12) + 'px'; t.style.top = Math.min(y, window.innerHeight - t.offsetHeight - 12) + 'px'; }
function bmHideTip() { if (bmTipEl) bmTipEl.style.opacity = '0'; }
// Elimina por completo el tooltip del DOM (al cerrar el modal): evita que el
// elemento quede huérfano en <body> al cambiar de vista. Se recrea solo al volver a usarlo.
function bmDestroyTip() { if (bmTipEl) { bmTipEl.remove(); bmTipEl = null; } }

const bmJoin = (arr) => { const a = bmDistinct(arr); return a.length ? (a.length > 4 ? a.slice(0, 4).join(', ') + ` +${a.length - 4}` : a.join(', ')) : '—'; };

/** Construye el heatmap (diagnósticos × tanque|estadío) dentro de `host`.
 *  `mode` = 'tank' (columnas por tanque) | 'estadio' (columnas por estadío). */
function buildBiomolHeat(host, rows, mode) {
  if (!host) return;
  if (!rows.length) { host.innerHTML = '<div class="empty-state">Sin análisis de Biología Molecular para esta corrida y módulo.</div>'; return; }
  const byEst = mode === 'estadio';
  const dimOf = (r) => (byEst ? (r.estadio || '—') : r.tq);
  const colHead = byEst ? 'Estadío' : 'Tanque';
  const cols = bmDistinct(rows.map(dimOf)).sort(byEst ? bmEstadioCmp : bmNat);
  const tips = []; // HTML de tooltip por celda (referenciado por índice, no por atributo)
  let html = `<div class="sv-bm-scroll"><table class="sv-bm-table"><thead><tr><th class="sv-bm-corner">Diag · ${colHead}</th>`
    + cols.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>';
  BM_DIAGS.forEach((diag) => {
    html += `<tr><th class="sv-bm-rowh">${esc(BM_DLABEL[diag])}</th>`;
    cols.forEach((col) => {
      const cRows = rows.filter((r) => dimOf(r) === col);
      const measured = cRows.filter((r) => bmHasVal(r[diag]));
      const pos = measured.filter((r) => bmIsPos(r[diag])).length;
      const pct = measured.length ? Math.round(pos / measured.length * 100) : null;
      const bg = bmPctColor(pct);
      const estadioTxt = byEst ? col : bmJoin(cRows.map((r) => r.estadio));
      const tanqueTxt = byEst ? bmJoin(cRows.map((r) => r.tq)) : col;
      const codTxt = bmJoin(cRows.map((r) => r.cod));
      const tip = `<div class="sv-bm-tip-title">${esc(BM_DLABEL[diag])} · ${esc(col)}</div>`
        + `<div class="sv-bm-tip-row"><span>Estadío</span><b>${esc(estadioTxt)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Código</span><b>${esc(codTxt)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Tanque</span><b>${esc(tanqueTxt)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>% Positivos</span><b class="bm-pos">${pct === null ? 'sin datos' : pct + '%'}</b></div>`
        + `<div class="sv-bm-tip-row"><span>% Negativos</span><b class="bm-neg">${pct === null ? '—' : (100 - pct) + '%'}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Total muestras</span><b>${measured.length}</b></div>`;
      const cls = 'sv-bm-cell' + (bg ? '' : ' sv-bm-empty');
      const styleAttr = bg ? ` style="background:${bg};color:#fff"` : '';
      const idx = tips.length; tips.push(tip);
      html += `<td class="${cls}"${styleAttr} data-idx="${idx}">${pct === null ? '·' : pct + '%'}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>'
    + '<div class="sv-bm-legend"><span class="sv-bm-leg-bar"></span><span>0% positivos</span><span style="flex:1"></span><span>100% positivos</span></div>';
  host.innerHTML = html;
  host.querySelectorAll('.sv-bm-cell[data-idx]').forEach((td) => {
    const tip = tips[+td.getAttribute('data-idx')];
    td.addEventListener('mouseenter', (e) => bmShowTip(tip, e));
    td.addEventListener('mousemove', bmMoveTip);
    td.addEventListener('mouseleave', bmHideTip);
  });
}

/** Dispersión por tanque (swarm): un punto por análisis molecular, agrupado por tanque,
 *  con desplegable de fecha. Color = peor caso entre los 6 diagnósticos. */
function buildBiomolSwarm(host, rows) {
  if (!host) return;
  const dates = [...new Set(rows.map((r) => r.fecha).filter(Boolean))]
    .sort((a, b) => (parseAnyDate(b) || 0) - (parseAnyDate(a) || 0));
  let sel = ''; // '' = todas las fechas
  const opts = `<option value="">Todas las fechas (${rows.length})</option>`
    + dates.map((d) => `<option value="${esc(d)}">${esc(d)} (${rows.filter((r) => r.fecha === d).length})</option>`).join('');
  host.innerHTML = `<div class="sv-bm-swarm-ctrl"><label>📅 Fecha
      <select class="sv-modal-select sv-bm-swarm-date">${opts}</select></label></div>
    <div class="sv-bm-swarm-host" id="svBmSwarmHost"></div>`;
  const swHost = host.querySelector('#svBmSwarmHost');
  const draw = () => drawBiomolSwarm(swHost, sel ? rows.filter((r) => r.fecha === sel) : rows);
  host.querySelector('.sv-bm-swarm-date').addEventListener('change', (e) => { sel = e.target.value; draw(); });
  draw();
}

/** Render SVG de la dispersión: eje Y = tanques, puntos jitter en X, color por resultado. */
function drawBiomolSwarm(host, data) {
  if (!host) return;
  const tanks = bmDistinct(data.map((r) => r.tq)).sort(bmNat);
  if (!data.length || !tanks.length) { host.innerHTML = '<div class="empty-state">Sin análisis para esta fecha.</div>'; return; }
  const W = Math.max(host.clientWidth || 0, 340), mL = 80, mR = 16, mT = 12, mB = 16, rowH = 36;
  const H = mT + tanks.length * rowH + mB, plotW = W - mL - mR;
  const byTank = new Map(); tanks.forEach((t) => byTank.set(t, []));
  data.forEach((r) => { if (byTank.has(r.tq)) byTank.get(r.tq).push(r); });
  const maxCount = Math.max(...tanks.map((t) => byTank.get(t).length), 1);
  const step = Math.min(15, plotW / (maxCount + 1));
  const tips = []; let grid = '', circles = '';
  tanks.forEach((t, ti) => {
    const cy = mT + ti * rowH + rowH / 2;
    grid += `<line x1="${mL}" x2="${W - mR}" y1="${cy}" y2="${cy}" stroke="rgba(120,144,156,.28)" stroke-dasharray="3,3"/>`
      + `<text x="${mL - 7}" y="${cy}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="var(--c-text-muted,#607D8B)">${esc(t)}</text>`;
    byTank.get(t).forEach((r, i) => {
      const cx = Math.min(mL + step * (i + 1), W - mR - 4);
      const cyJit = cy + (((i * 37) % 11) - 5) * 1.3;
      const anyMeas = BM_DIAGS.some((d) => bmHasVal(r[d])), anyPos = BM_DIAGS.some((d) => bmIsPos(r[d]));
      const fill = !anyMeas ? '#94a3b8' : anyPos ? '#ef4444' : '#22c55e';
      const stroke = !anyMeas ? '#64748b' : anyPos ? '#b91c1c' : '#15803d';
      const diagRows = BM_DIAGS.map((d) => `<div class="sv-bm-tip-row"><span>${esc(BM_DLABEL[d])}</span><b class="${bmIsPos(r[d]) ? 'bm-pos' : 'bm-neg'}">${esc(r[d] || '—')}</b></div>`).join('');
      const idx = tips.length;
      tips.push(`<div class="sv-bm-tip-title">${esc(r.tq)} · ${esc(r.estadio || r.sexo || '—')}</div>`
        + `<div class="sv-bm-tip-row"><span>Fecha</span><b>${esc(r.fecha || '—')}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Código</span><b>${esc(r.cod || '—')}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Corrida</span><b>${esc(r.corrida || '—')}</b></div>${diagRows}`);
      circles += `<circle cx="${cx.toFixed(1)}" cy="${cyJit.toFixed(1)}" r="5.5" fill="${fill}" stroke="${stroke}" stroke-width="1.4" data-idx="${idx}" style="cursor:pointer"/>`;
    });
  });
  host.innerHTML = `<svg class="sv-bm-swarm-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet">${grid}${circles}</svg>`;
  host.querySelectorAll('circle[data-idx]').forEach((c) => {
    const tip = tips[+c.getAttribute('data-idx')];
    c.addEventListener('mouseenter', (e) => bmShowTip(tip, e));
    c.addEventListener('mousemove', bmMoveTip);
    c.addEventListener('mouseleave', bmHideTip);
  });
}

/** E.D.T. · Electroforesis Digital Temporal: gel digital interactivo (carriles = tanques,
 *  filas = diagnósticos como un ladder). Mismo dataset que la dispersión, con filtro de fecha. */
function buildBiomolGel(host, rows, loteMap) {
  if (!host) return;
  const dates = [...new Set(rows.map((r) => r.fecha).filter(Boolean))]
    .sort((a, b) => (parseAnyDate(b) || 0) - (parseAnyDate(a) || 0));
  let sel = '';
  const opts = `<option value="">Todas las fechas (${rows.length})</option>`
    + dates.map((d) => `<option value="${esc(d)}">${esc(d)} (${rows.filter((r) => r.fecha === d).length})</option>`).join('');
  host.innerHTML = `<div class="sv-bm-swarm-ctrl"><label>📅 Fecha
      <select class="sv-modal-select sv-bm-gel-date">${opts}</select></label></div>
    <div class="sv-bm-gel-host" id="svBmGelHost"></div>`;
  const gHost = host.querySelector('#svBmGelHost');
  const draw = () => drawBiomolGel(gHost, sel ? rows.filter((r) => r.fecha === sel) : rows, loteMap || {});
  host.querySelector('.sv-bm-gel-date').addEventListener('change', (e) => { sel = e.target.value; draw(); });
  draw();
}

/* Paleta E.D.T. inspirada en gel de agarosa bajo UV (GelRed/EtBr en transiluminador).
   Bandas: SOLO dos estados → positivo (verde lima neón) · negativo (lavanda tenue). */
const GEL = {
  bgTop: '#2A0F47', bgMid: '#4A2370', bgEdge: '#1B0A33', glow: '#5A2D82',
  pos: '#D4FF4A', posCore: '#EEFF8A',         // verde lima fluorescente
  neg: '#B98CFF', negCore: '#E0C6FF',         // lavanda neón (negativo)
  text: '#E6C7FF', ladder: '#D77BFF', lane: 'rgba(215,123,255,.10)', laneEdge: 'rgba(215,123,255,.16)',
};

/** Render SVG del gel: fondo UV violeta, bandas fluorescentes (lima=positivo · lavanda=negativo). */
function drawBiomolGel(host, data, loteMap) {
  if (!host) return;
  const tanks = bmDistinct(data.map((r) => r.tq)).sort(bmNat);
  if (!data.length || !tanks.length) { host.innerHTML = '<div class="empty-state">Sin análisis para esta fecha.</div>'; return; }
  const mL = 78, mR = 14, mT = 30, mB = 16, rowH = 40, bandH = 15;
  const laneW = Math.min(70, Math.max(40, ((host.clientWidth || 640) - mL - mR) / tanks.length));
  const W = mL + tanks.length * laneW + mR, H = mT + BM_DIAGS.length * rowH + mB;

  const cell = (tq, d) => {
    const rs = data.filter((r) => r.tq === tq && bmHasVal(r[d]));
    if (!rs.length) return null;
    const posN = rs.filter((r) => bmIsPos(r[d])).length;
    return { st: posN > 0 ? 'pos' : 'neg', n: rs.length, posN };
  };

  let ladder = '', lanes = '', bands = '';
  const tips = [];
  BM_DIAGS.forEach((d, ri) => {
    const cy = mT + ri * rowH + rowH / 2;
    ladder += `<text x="${mL - 10}" y="${cy}" text-anchor="end" dominant-baseline="middle" font-size="11" font-weight="700" fill="${GEL.ladder}">${esc(BM_DLABEL[d])}</text>`
      + `<line x1="${mL - 6}" x2="${W - mR}" y1="${cy}" y2="${cy}" stroke="rgba(215,123,255,.07)"/>`;
  });
  tanks.forEach((t, ci) => {
    const lx = mL + ci * laneW, cx = lx + laneW / 2;
    lanes += `<rect x="${(lx + 3).toFixed(1)}" y="${mT - 4}" width="${(laneW - 6).toFixed(1)}" height="${H - mT - mB + 8}" rx="4" fill="${GEL.lane}" stroke="${GEL.laneEdge}"/>`
      + `<text x="${cx.toFixed(1)}" y="${mT - 12}" text-anchor="middle" font-size="11" font-weight="800" fill="${GEL.text}">${esc(t)}</text>`;
    BM_DIAGS.forEach((d, ri) => {
      const cy = mT + ri * rowH + rowH / 2;
      const c = cell(t, d);
      if (!c) { bands += `<rect x="${(lx + 9).toFixed(1)}" y="${(cy - 1).toFixed(1)}" width="${(laneW - 18).toFixed(1)}" height="2" rx="1" fill="rgba(215,123,255,.10)"/>`; return; }
      const isPos = c.st === 'pos';
      const col = isPos ? GEL.pos : GEL.neg, core = isPos ? GEL.posCore : GEL.negCore;
      const bw = laneW - 14, bx = lx + 7, by = cy - bandH / 2;
      const idx = tips.length;
      const lote = loteMap[t] || '—';
      tips.push(`<div class="sv-bm-tip-title">${esc(t)} · ${esc(BM_DLABEL[d])}</div>`
        + `<div class="sv-bm-tip-row"><span>Lote</span><b>${esc(lote)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Resultado</span><b class="${isPos ? 'bm-pos' : 'bm-neg'}">${isPos ? 'Positivo' : 'Negativo'}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Muestras</span><b>${c.n}${c.posN ? ` · ${c.posN} pos` : ''}</b></div>`);
      bands += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bandH}" rx="${(bandH / 2).toFixed(1)}" fill="${col}" filter="url(#bmGelGlow)" opacity="${isPos ? 0.95 : 0.7}" data-idx="${idx}" style="cursor:pointer"/>`
        + `<rect x="${(bx + 2).toFixed(1)}" y="${(by + 3).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bandH - 6}" rx="${((bandH - 6) / 2).toFixed(1)}" fill="${core}" opacity="${isPos ? 0.75 : 0.5}" pointer-events="none"/>`;
    });
  });

  host.innerHTML = `<svg class="sv-bm-gel-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <filter id="bmGelGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="bmGelBg" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stop-color="${GEL.glow}"/><stop offset="55%" stop-color="${GEL.bgMid}"/><stop offset="100%" stop-color="${GEL.bgEdge}"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bmGelBg)"/>
    ${ladder}${lanes}${bands}
  </svg>`;
  host.querySelectorAll('rect[data-idx]').forEach((c) => {
    const tip = tips[+c.getAttribute('data-idx')];
    c.addEventListener('mouseenter', (e) => bmShowTip(tip, e));
    c.addEventListener('mousemove', bmMoveTip);
    c.addEventListener('mouseleave', bmHideTip);
  });
}

/* ============================================================
   MICROBIOLOGÍA · modal del módulo (Placa + Tabla + Heatmap).
   Reusa la capa pura de la vista Microbiología (data.js / petri.js),
   acotada a las muestras que comparten corrida + módulo (por número).
   ============================================================ */
const micDigits = (s) => (String(s).match(/\d+/g) || []).join('');
const micNat = (a, b) => { const x = String(a).match(/\d+/), y = String(b).match(/\d+/); return (x && y && +x[0] !== +y[0]) ? +x[0] - +y[0] : String(a).localeCompare(String(b)); };
const micFmtNum = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-EC');
const micTQ = (r) => microCtx(r).tq; // tanque estricto (columna TQ/N°)
const micDayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
const micTankLabel = (t) => t === '__none' ? 'Sin TQ' : ('TQ ' + t);
let _svMicroColonies = []; // colonias del día visible en la placa (para el tooltip)

/** Filas de Microbiología que comparten corrida + módulo (número) con este módulo. */
function microForModule(mod, corrida) {
  const mn = modNum(mod);
  if (mn === null) return [];
  const cd = corrida ? micDigits(corrida) : '';
  return store.globalData.filter((r) => {
    if (!isMicroRow(r)) return false;
    const c = microCtx(r);
    if (!c.modulo || +c.modulo !== mn) return false;
    if (cd && micDigits(c.corrida) !== cd) return false;
    return true;
  });
}

/** Colonias (1 por patógeno con UFC>0) sobre un conjunto de filas. */
function microColonies(rows) {
  const byKey = new Map();
  microRecords(rows).forEach((r) => {
    if (!(r.ufc > 0)) return;
    if (!byKey.has(r.key)) byKey.set(r.key, { id: r.key, key: r.key, label: r.label, color: MIC_COLOR[r.key] || '#90A4AE', ufc: 0, nMuestras: 0, worstRank: -1, worst: '' });
    const o = byKey.get(r.key);
    o.ufc += r.ufc; o.nMuestras++;
    const rk = MIC_NIVEL_RANK[r.nivel] ?? -1;
    if (rk > o.worstRank) { o.worstRank = rk; o.worst = r.nivel; }
  });
  return [...byKey.values()].sort((a, b) => b.ufc - a.ufc);
}

const micTanksOf = (rows) => { const s = new Set(); let none = false; rows.forEach((r) => { const t = micTQ(r); if (t) s.add(t); else none = true; }); const arr = [...s].sort(micNat); if (none) arr.push('__none'); return arr; };
const micRowsForTank = (rows, tank) => !tank ? rows : (tank === '__none' ? rows.filter((r) => !micTQ(r)) : rows.filter((r) => micTQ(r) === tank));
function micDaysOf(rows) {
  const byDay = new Map();
  rows.forEach((r) => { const c = microCtx(r); if (!c.fecha || isNaN(c.fecha)) return; const key = micDayKey(c.fecha); if (!byDay.has(key)) byDay.set(key, { key, d: c.fecha, label: fmtShort(c.fecha), rows: [] }); byDay.get(key).rows.push(r); });
  return [...byDay.values()].sort((a, b) => a.d - b.d);
}

/** Pestaña Placa: filtro de tanque + navegador de fecha + placa de agar + resumen del día. */
function microPlacaHTML(rows, state) {
  const tanks = micTanksOf(rows);
  if (state.tank && !tanks.includes(state.tank)) state.tank = null;
  const days = micDaysOf(micRowsForTank(rows, state.tank));
  if (!days.length) return `<div class="empty-state" style="padding:30px">Sin muestras de microbiología para esta selección.</div>`;
  let idx = state.dayIdx;
  if (idx == null || idx < 0 || idx >= days.length) idx = days.length - 1;
  state.dayIdx = idx; // se persiste el índice resuelto para el navegador
  const day = days[idx];
  const colonies = microColonies(day.rows);
  _svMicroColonies = colonies; // para el tooltip de colonias
  const totUfc = colonies.filter((c) => c.key === 'totales').reduce((a, c) => a + c.ufc, 0) || colonies.reduce((a, c) => a + c.ufc, 0);
  const specific = colonies.filter((c) => !MIC_AGG.has(c.key));
  const maxC = specific.length ? specific.reduce((a, b) => (a.ufc > b.ufc ? a : b)) : null;
  const dayTanks = [...new Set(day.rows.map(micTQ).filter(Boolean))].sort(micNat);
  const tankShown = state.tank ? micTankLabel(state.tank) : (dayTanks.length ? dayTanks.map((t) => 'TQ ' + t).join(', ') : '—');
  const dayEstadios = [...new Set(day.rows.map((r) => microCtx(r).estadio).filter(Boolean))].sort(micNat);
  const agares = [...new Set(colonies.map((c) => PATHOGEN_AGAR[c.key]).filter(Boolean))].sort();
  const tankOpts = `<option value="">Todos los tanques</option>` + tanks.map((t) => `<option value="${esc(t)}" ${state.tank === t ? 'selected' : ''}>${esc(micTankLabel(t))}</option>`).join('');
  const legend = colonies.length
    ? `<div class="mic-pe-legend">${colonies.map((c) => `<div class="mic-pe-leg"><span class="mic-pe-dot" style="background:${c.color}"></span><span class="mic-pe-leg-l">${esc(c.label)}</span><span class="mic-pe-leg-v">${micFmtNum(c.ufc)}</span></div>`).join('')}</div>`
    : '<div class="muted" style="font-size:12px">Sin colonias con UFC este día.</div>';
  return `<div class="sv-micro-filters">
      <label class="sv-modal-datelbl">🐟 Tanque <select class="sv-modal-select" data-micro-tank>${tankOpts}</select></label>
      <div class="sv-micro-daynav">
        <button class="sv-micro-navbtn" data-micro-day="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Día anterior">◀</button>
        <span class="sv-micro-daylbl">📅 ${esc(day.label)} <span class="muted">(${idx + 1}/${days.length})</span></span>
        <button class="sv-micro-navbtn" data-micro-day="1" ${idx >= days.length - 1 ? 'disabled' : ''} aria-label="Día siguiente">▶</button>
      </div>
    </div>
    <div class="sv-micro-main">
      <div class="sv-micro-dish">
        <div class="mic-chart-title">🧫 Placa de agar <span class="muted">· colonia = patógeno · tamaño ∝ log₁₀(UFC)</span></div>
        <div style="display:flex;justify-content:center">${petriSVG(colonies, 320, 'light')}</div>
        <div class="mic-petri-foot">${day.rows.length} muestra(s) · ${colonies.length} patógeno(s) con UFC</div>
      </div>
      <div class="sv-micro-side">
        <div class="mic-chart-title">Resumen del día</div>
        <div class="sv-micro-meta"><b>🐟 ${esc(tankShown)}</b> · 📅 ${esc(day.label)}${dayEstadios.length ? ' · 🦐 ' + esc(dayEstadios.join(', ')) : ''}</div>
        <div class="mic-pe-sum">
          <div class="mic-pe-st"><div class="mic-pe-st-v">${micFmtNum(totUfc)}</div><div class="mic-pe-st-l">Σ UFC C.Totales</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v">${maxC ? micFmtNum(maxC.ufc) : '—'}</div><div class="mic-pe-st-l">UFC máx</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v">${colonies.length}</div><div class="mic-pe-st-l">Patógenos</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v" style="font-size:13px">${maxC ? esc(maxC.label) : '—'}</div><div class="mic-pe-st-l">Dominante</div></div>
        </div>
        <div class="mic-pe-agar"><div class="mic-pe-agar-l">🧪 Agar utilizado</div><div class="mic-pe-agar-chips">${agares.length ? agares.map((a) => `<span class="mic-agar-chip">${esc(a)}</span>`).join('') : '<span class="muted" style="font-size:12px">—</span>'}</div></div>
        <div class="mic-chart-title" style="margin-top:12px">Patógenos</div>
        ${legend}
      </div>
    </div>`;
}

/** Pestaña Tabla: todas las muestras (UFC por patógeno, semaforizado). */
function microTablaHTML(rows) {
  if (!rows.length) return `<div class="empty-state" style="padding:30px">Sin muestras de microbiología para esta corrida y módulo.</div>`;
  const melts = rows.map((r) => ({ ctx: microCtx(r), byKey: Object.fromEntries(microMelt(r).map((m) => [m.key, m])) }))
    .sort((a, b) => (b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  const presentKeys = new Set();
  melts.forEach((s) => Object.keys(s.byKey).forEach((k) => { const m = s.byKey[k]; if (m.ufc !== null || m.crudo !== null || m.nivel) presentKeys.add(k); }));
  const pats = MIC_PATHOGENS.filter((p) => presentKeys.has(p.key));
  const patCell = (m) => {
    if (!m || (m.ufc === null && m.crudo === null && !m.nivel)) return '<td class="muted" style="text-align:center">—</td>';
    const tint = m.nivel ? ` style="background:${MIC_NIVEL_COLOR[m.nivel]}22;text-align:right;font-variant-numeric:tabular-nums"` : ' style="text-align:right;font-variant-numeric:tabular-nums"';
    const val = m.ufc !== null ? micFmtNum(m.ufc) : (m.crudo !== null ? esc(String(m.crudo)) : '·');
    return `<td${tint} title="${m.nivel ? esc(m.nivel) + ' · ' : ''}${m.ufc !== null ? micFmtNum(m.ufc) + ' UFC' : ''}">${val}</td>`;
  };
  const head = `<tr><th>Fecha</th><th>TQ</th><th>Tipo</th><th>Formato</th>${pats.map((p) => `<th style="text-align:right">${esc(p.label)}</th>`).join('')}<th>Nivel máx</th></tr>`;
  const body = melts.map((s) => {
    const c = s.ctx;
    let worst = '', wr = -1;
    Object.values(s.byKey).forEach((m) => { if (m.nivel) { const rk = MIC_NIVEL_RANK[m.nivel]; if (rk > wr) { wr = rk; worst = m.nivel; } } });
    return `<tr>
      <td>${c.fecha ? esc(fmtShort(c.fecha)) : esc(c.fechaRaw || '—')}</td>
      <td>${c.tq ? 'TQ ' + esc(c.tq) : '<span class="muted">—</span>'}</td>
      <td>${esc(c.tipoMuestra || '—')}</td>
      <td>${esc(MIC_FMT_LABEL[c.formatoKey] || c.formato || '—')}</td>
      ${pats.map((p) => patCell(s.byKey[p.key])).join('')}
      <td>${worst ? `<span class="mic-nivel" style="--nv:${MIC_NIVEL_COLOR[worst]}">${esc(worst)}</span>` : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('');
  return `<div class="sv-micro-tablewrap"><table class="sv-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

/** Pestaña Heatmap: Patógeno × Día (color = nivel · valor = Σ UFC). */
function microHeatmapHTML(rows) {
  if (!rows.length) return `<div class="empty-state" style="padding:30px">Sin registros para esta corrida y módulo.</div>`;
  const days = micDaysOf(rows);
  const presentKeys = new Set(microRecords(rows).map((r) => r.key));
  const pats = MIC_PATHOGENS.filter((p) => presentKeys.has(p.key));
  const cell = new Map();
  rows.forEach((r) => { const c = microCtx(r); if (!c.fecha || isNaN(c.fecha)) return; const dk = micDayKey(c.fecha); microMelt(r).forEach((m) => { const k = m.key + '|' + dk; if (!cell.has(k)) cell.set(k, { ufc: 0, worstRank: -1, worst: '' }); const o = cell.get(k); if (m.ufc) o.ufc += m.ufc; const rk = MIC_NIVEL_RANK[m.nivel] ?? -1; if (rk > o.worstRank) { o.worstRank = rk; o.worst = m.nivel; } }); });
  const head = `<tr><th class="sv-micro-hm-rowh">Patógeno \\ Día</th>${days.map((d) => `<th>${esc(d.label)}</th>`).join('')}</tr>`;
  const body = pats.map((p) => {
    const tds = days.map((d) => { const o = cell.get(p.key + '|' + d.key); if (!o || (o.ufc === 0 && !o.worst)) return '<td class="muted">·</td>'; const col = o.worst ? MIC_NIVEL_COLOR[o.worst] : ''; const st = col ? ` style="background:${col};color:#fff"` : ''; return `<td${st} title="${esc(p.label)} · ${esc(o.worst || 'sin nivel')} · ${micFmtNum(o.ufc)} UFC">${micFmtNum(o.ufc)}</td>`; }).join('');
    return `<tr><th class="sv-micro-hm-rowh"><span class="mic-pe-dot" style="background:${MIC_COLOR[p.key] || '#90A4AE'}"></span>${esc(p.label)}</th>${tds}</tr>`;
  }).join('');
  return `<div class="sv-micro-hmwrap"><table class="sv-micro-hm"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="mic-legend" style="margin-top:8px">${Object.keys(MIC_NIVEL_COLOR).map((n) => `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${MIC_NIVEL_COLOR[n]}"></span>${esc(n)}</span>`).join('')}</div>`;
}

export function renderModule(ctx, mod) {
  const corrida = ctx.vState.corrida || null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const s = modStats(ctx, mod, corrida);
  const tanks = tanksOf(ctx, mod, corrida);

  // tankStats por tanque (caro: filtra larvWin/tanqWin/larvCM + ordena). Se calcula
  // UNA vez y se reutiliza en la mini-comparativa Y en la grilla de tanques (antes
  // se computaba 2× por tanque).
  const tsByTank = new Map(tanks.map((tq) => [tq, tankStats(ctx, mod, tq, corrida)]));

  // RO1 · métricas por tanque para la mini-comparativa (SV + ICL promedio).
  const tankCmp = tanks.map((tq) => {
    const ts = tsByTank.get(tq);
    const iclVals = iclSeries(ts.lRows).values.filter((v) => v !== null && v !== undefined);
    return { tq, sv: ts.sv, icl: mean(iclVals) };
  });

  // RO1 · ranking mejor/peor tanque combinando AMBAS variables (Supervivencia + ICL).
  // Se normaliza cada variable a [0,1] entre los tanques (escalas distintas) y se promedia.
  const cmpRank = (() => {
    const ok = (v) => v !== null && v !== undefined && !isNaN(v);
    const valid = tankCmp.filter((t) => ok(t.sv) && ok(t.icl));
    if (valid.length < 2) return null;
    const svs = valid.map((t) => t.sv), icls = valid.map((t) => t.icl);
    const nrm = (v, arr) => { const mn = Math.min(...arr), mx = Math.max(...arr); return mx === mn ? 0.5 : (v - mn) / (mx - mn); };
    const scored = valid.map((t) => ({ ...t, score: 0.5 * nrm(t.sv, svs) + 0.5 * nrm(t.icl, icls) }))
      .sort((a, b) => b.score - a.score);
    return { best: scored[0], worst: scored[scored.length - 1] };
  })();

  // #2 · comentarios de supervisión del módulo (col. Comentario de Registro_Supervisión).
  // #1 · deben cumplir la MISMA corrida (si hay una elegida) y el módulo.
  const atRows = store.globalData
    .filter((r) => isRevisionRow(r) && sameModule(getField(r, F.modulo), mod)
      && (!corrida || getField(r, F.corrida) === corrida) && hasCom(r))
    .sort((a, b) => (parseAnyDate(getField(b, F.fecha)) || 0) - (parseAnyDate(getField(a, F.fecha)) || 0));

  // Biomol · análisis moleculares de la corrida+módulo (incluye muestras compartidas de módulos
  // pareados; excluye estadío Reproductores). Sin corrida elegida → todas las corridas del módulo.
  const biomolRows = biomolForModule(mod, corrida);
  // Microbiología (hoja "Microbiología") de la misma corrida + módulo → modal Placa/Tabla/Heatmap.
  const microRows = microForModule(mod, corrida);
  // Mapa tanque → lote (desde Larvicultura) para el tooltip del E.D.T.
  const tankLote = {};
  ctx.larvWin.forEach((r) => {
    if (getField(r, F.modulo) !== mod || (corrida && getField(r, F.corrida) !== corrida)) return;
    const tq = getField(r, F.tanque), lote = getField(r, F.lote);
    if (tq && lote && !tankLote[tq]) tankLote[tq] = lote;
  });

  // #3 · Detalle de desinfección del módulo+corrida (TODOS los registros + cumplimiento).
  const desinf = desinfeccionDetalle(mod, corrida);

  // Proyección de cosecha (días estimados hasta PL11) según el ritmo de estadío.
  const cos = cosechaEstimate(ctx, mod, corrida, 'PL11');
  const cosechaLabel = cos ? (cos.reached ? 'En cosecha' : '≈ ' + cos.days + ' días') : '—';

  let h = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod },
  ]);

  h += `<div class="sv-banner" style="background:${col.bg}">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">📊 RESUMEN OPERATIVO</div>
    <div class="sv-banner-name">${esc(mod)}</div>
    <div class="sv-card-sub">🔄 ${corrida ? 'Corrida: ' + esc(corrida) : 'Todas las corridas'}</div>
    <div class="sv-kpi-grid sv-kpi-wide">
      ${kpiGlass('📈', 'Supervivencia', fmt1(s.sv, '%'), 'data-modmetric="sv" role="button" tabindex="0" title="Ver tendencia de supervivencia del módulo"')}
      ${kpiGlass('📉', 'Mortalidad', fmt1(s.mort, '%'))}
      ${kpiGlass('👥', 'Pob. actual', fmtPop(s.pop), 'data-modmetric="pop" role="button" tabindex="0" title="Ver tendencia de población total del módulo"')}
      ${kpiGlass('👥', 'Pob. inicial', fmtPop(s.popFirst))}
      ${kpiGlass('🦐', 'Estadío', s.estadio || '—')}
      ${kpiGlass('💧', 'OD Promedio', fmt2(s.od, ' mg/L'), 'data-modmetric="od" role="button" tabindex="0" title="Ver OD por hora (promedio del módulo)"')}
      ${kpiGlass('🌡️', 'Temperatura', fmt1(s.tmp, '°C'), 'data-modmetric="tmp" role="button" tabindex="0" title="Ver Temperatura por hora (promedio del módulo)"')}
      ${kpiGlass('🧂', 'Salinidad', fmt1(s.sal, ' ppt'))}
      ${kpiGlass('🍽️', 'Nutrición IL', fmt1(s.il, '%'))}
      ${kpiGlass('✨', 'Calidad Líp.', fmt1(s.lip, '%'))}
      ${kpiGlass('⚡', '% Actividad', fmt1(s.act, '%'))}
      ${kpiGlass('🫧', '% Espuma', fmt1(s.esp, '%'))}
      ${kpiGlass('🧹', '% Suciedad', fmt1(s.suc, '%'))}
      ${kpiGlass('📅', 'Días proceso', String(s.dias))}
      ${kpiGlass('🎯', 'Cosecha', cosechaLabel)}
      ${kpiTecnicos(s.tecnicos)}
    </div>
  </div>`;

  // Franja de semáforo (aquí las tarjetas de tanque son blancas → el color se aprecia).
  const SEM_LEGEND = [['excelente', 'Azul · Excelente'], ['bueno', 'Verde · Bueno'], ['malo', 'Amarillo · Regular'], ['grave', 'Rojo · Grave']];
  h += `<div class="sv-legend" style="margin-bottom:14px">
    <span class="sv-legend-title">🚦 Semáforo</span>
    ${SEM_LEGEND.map(([lvl, t]) => `<span class="sv-legend-item"><span class="sv-dot" style="background:${levelColor(lvl)}"></span><b>${t}</b></span>`).join('')}
  </div>`;

  // OM vs Tex se ofrece cuando el módulo+corrida tiene lotes de Texcumar (la comparación
  // gira en torno a esa marca; si falta Omarsa, la vista muestra solo la marca presente).
  const brandsHere = new Set();
  ctx.larvWin.forEach((r) => { if (getField(r, F.modulo) === mod && (!corrida || getField(r, F.corrida) === corrida)) { const b = lotBrand(getField(r, F.lote)); if (b) brandsHere.add(b); } });
  const hasTex = brandsHere.has('TEX');

  // Acciones: despacho · OM vs Tex · Comparativa tanques · Historial As. Téc.
  const hasCmp = tankCmp.some((t) => t.sv !== null || t.icl !== null);
  h += `<div class="sv-actions" style="margin-bottom:18px">
    <button class="sv-action-btn sv-action-despacho" data-nav="despacho" data-mod="${esc(mod)}">🚛 Despacho</button>
    ${hasTex ? `<button class="sv-action-btn" data-nav="omtex" data-mod="${esc(mod)}">⚖️ OM vs Tex</button>` : ''}
    ${hasCmp ? '<button class="sv-action-btn" data-modcmp-open>📊 Comparativa tanques</button>' : ''}
    <button class="sv-action-btn" data-athist-open>👨‍🔬 Historial As. Téc.${atRows.length ? ` (${atRows.length})` : ''}</button>
    ${biomolRows.length ? `<button class="sv-action-btn" data-biomol-open>🧬 Biomol (${biomolRows.length})</button>` : ''}
    ${microRows.length ? `<button class="sv-action-btn" data-micro-open>🧫 Microbiología (${microRows.length})</button>` : ''}
    ${desinf ? `<button class="sv-action-btn" data-desinf-open>🧴 Desinfección${desinf.cumplimiento !== null ? ` (${desinf.cumplimiento}%)` : ''}</button>` : ''}
    <button class="sv-action-btn" data-modday-open>📅 Resumen del día</button>
  </div>`;

  // Lista de tanques del módulo
  h += `<div class="sv-section-title" style="margin-top:16px">🐟 Tanques (${tanks.length})</div>`;
  if (tanks.length) {
    h += '<div class="sv-tank-grid">';
    tanks.forEach((tq) => {
      const ts = tsByTank.get(tq);
      h += `<div class="sv-tank-card${ts.grouped ? ' is-grouped' : ''}" data-nav="tank" data-mod="${esc(mod)}" data-tank="${esc(tq)}" role="button" tabindex="0" aria-label="Abrir tanque ${esc(tq)} del módulo ${esc(mod)}${ts.grouped ? ' (agrupado)' : ''}">
        <div class="sv-tank-head">
          <span class="sv-tank-name">${esc(tq)}${ts.grouped ? ' <span class="sv-tank-grouped" title="Tanque agrupado: pob./SV en 0; su siembra inicial sigue contando">🔗 Agrupado</span>' : ''}</span>
          <span class="sv-dot" style="background:${levelColor(svLevel(ts.sv))}" title="${levelLabel(svLevel(ts.sv))}"></span>
        </div>
        <div class="sv-tank-metrics">
          <div><span class="muted">SV</span><b>${fmt1(ts.sv, '%')}</b></div>
          <div><span class="muted">OD</span><b style="color:${levelColor(odLevel(ts.od))}">${fmt2(ts.od)}</b></div>
          <div><span class="muted">T°</span><b style="color:${levelColor(tmpLevel(ts.tmp))}">${fmt1(ts.tmp)}</b></div>
          <div><span class="muted">Pob</span><b>${fmtPop(ts.pop)}</b></div>
        </div>
        <div class="sv-tank-stage">🦐 ${esc(ts.estadio || '—')}</div>
      </div>`;
    });
    h += '</div>';
  } else {
    h += `<div class="empty-state">Sin tanques registrados para este módulo.</div>`;
  }

  // Modal Historial As. Téc. (#2) — con barra de 3 filtros (Supervisor / Comentario / Siembra).
  const atBlock = (tag, cls, txt) => txt ? `<div class="sv-com-block"><span class="sv-com-tag ${cls}">${tag}</span><p class="sv-hist-text">${esc(txt)}</p></div>` : '';
  // Una fila del historial; `com` decide qué bloque(s) de comentario se muestran.
  const atItemHTML = (r, com) => `
        <div class="sv-hist-item">
          <span class="sv-hist-date">${esc(getField(r, F.fecha) || '—')}${getField(r, SIE_KEYS) ? ' · ' + esc(getField(r, SIE_KEYS)) + ' Siembra' : ''}</span>
          <div class="sv-hist-meta">${esc(getField(r, SUP_KEYS) || 'Supervisor')}${getField(r, F.corrida) ? ' · C' + esc(getField(r, F.corrida)) : ''}</div>
          ${com !== 'pm' ? atBlock('☀️ Matutino', 'sv-com-am', getComM(r)) : ''}
          ${com !== 'am' ? atBlock('🌙 Vespertino', 'sv-com-pm', getComV(r)) : ''}
        </div>`;
  // Filtra atRows según supervisor / comentario(am|pm|all) / siembra.
  const filterAtRows = (sup, com, sie) => atRows.filter((r) => {
    if (sup !== '__all' && (getField(r, SUP_KEYS) || 'Supervisor') !== sup) return false;
    if (com === 'am' && !getComM(r)) return false;
    if (com === 'pm' && !getComV(r)) return false;
    if (sie !== '__all' && (getField(r, SIE_KEYS) || '') !== sie) return false;
    return true;
  });
  const supList = [...new Set(atRows.map((r) => getField(r, SUP_KEYS) || 'Supervisor'))].sort();
  const sieList = [...new Set(atRows.map((r) => getField(r, SIE_KEYS)).filter(Boolean))].sort();
  const opt = (v, lbl) => `<option value="${esc(v)}">${esc(lbl)}</option>`;
  const atFiltersHTML = `<div class="sv-hist-filters">
      <label>👤 Supervisor <select class="sv-modal-select" data-athist-sup>${opt('__all', 'Todos')}${supList.map((s) => opt(s, s)).join('')}</select></label>
      <label>💬 Comentario <select class="sv-modal-select" data-athist-com>${opt('__all', 'Todos')}${opt('am', '☀️ Matutino')}${opt('pm', '🌙 Vespertino')}</select></label>
      <label>🌱 Siembra <select class="sv-modal-select" data-athist-sie>${opt('__all', 'Todas')}${sieList.map((s) => opt(s, s + 'ª')).join('')}</select></label>
    </div>`;
  h += `<div class="sv-modal" id="svAtModal" data-atmodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">👨‍🔬 Historial de Asistencia Técnica — ${esc(mod)}</span>
        <button class="sv-modal-x" data-athist-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        ${atRows.length ? atFiltersHTML : ''}
        <div class="sv-hist-list" id="svAtList"></div>
      </div>
    </div>
  </div>`;

  // Modal Biomol — heatmap diagnóstico × tanque del módulo
  if (biomolRows.length) {
    h += `<div class="sv-modal" id="svBiomolModal" data-biomolmodal>
      <div class="sv-modal-card lv-fs-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">🧬 Biomol — ${esc(mod)}</span>
          <button class="sv-modal-x" data-biomol-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          <div class="sv-bm-modebar">
            <span class="sv-bm-mode-label">Vista:</span>
            <button class="sv-bm-mode-btn is-active" data-bmmode="tank">Heatmap · Tanque</button>
            <button class="sv-bm-mode-btn" data-bmmode="estadio">Heatmap · Estadío</button>
            <button class="sv-bm-mode-btn" data-bmmode="swarm">Dispersión por tanque</button>
            <button class="sv-bm-mode-btn" data-bmmode="gel">E.D.T.</button>
          </div>
          <div class="sv-modal-note" id="svBmNote"></div>
          <div id="svBmBody"></div>
        </div>
      </div>
    </div>`;
  }

  // Modal Microbiología — Placa de agar + Resumen del día (tanque + fecha) / Tabla / Heatmap.
  if (microRows.length) {
    h += `<div class="sv-modal" id="svMicroModal" data-micromodal>
      <div class="sv-modal-card lv-fs-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">🧫 Microbiología — ${esc(mod)}${corrida ? ' · C' + esc(corrida) : ''}</span>
          <button class="sv-modal-x" data-micro-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          <div class="sv-bm-modebar">
            <span class="sv-bm-mode-label">Vista:</span>
            <button class="sv-bm-mode-btn is-active" data-micmode="placa">🧫 Placa</button>
            <button class="sv-bm-mode-btn" data-micmode="tabla">📋 Tabla</button>
            <button class="sv-bm-mode-btn" data-micmode="heatmap">🗺️ Heatmap</button>
          </div>
          <div id="svMicroBody"></div>
          <div class="mic-tt" id="svMicroTT"></div>
        </div>
      </div>
    </div>`;
  }

  // #2 · Modal de la comparativa entre tanques (RO1)
  if (hasCmp) {
    h += `<div class="sv-modal" id="svModCmpModal" data-modcmpmodal>
      <div class="sv-modal-card lv-fs-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">📊 Comparativa entre tanques — ${esc(mod)}</span>
          <button class="sv-modal-x" data-modcmp-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          ${cmpRank ? `<div class="sv-modcmp-rank">
            <span class="sv-modcmp-chip is-best">🏆 Mejor (SV+ICL): <b>${esc(cmpRank.best.tq)}</b> <span class="muted">SV ${fmt1(cmpRank.best.sv, '%')} · ICL ${cmpRank.best.icl == null ? '—' : Math.round(cmpRank.best.icl)}</span></span>
            <span class="sv-modcmp-chip is-worst">⚠️ Peor (SV+ICL): <b>${esc(cmpRank.worst.tq)}</b> <span class="muted">SV ${fmt1(cmpRank.worst.sv, '%')} · ICL ${cmpRank.worst.icl == null ? '—' : Math.round(cmpRank.worst.icl)}</span></span>
          </div>` : ''}
          <div class="sv-modal-note">Supervivencia (%) en el eje izquierdo · ICL promedio en el derecho.</div>
          <div class="lv-fs-chart"><canvas id="svModCmp"></canvas></div>
        </div>
      </div>
    </div>`;
  }

  // #3 · Modal de Desinfección (cumplimiento por Tipo → Categoría → Elemento).
  if (desinf) {
    const estadoChip = (est) => {
      const e = String(est || '').toLowerCase().trim();
      if (e === 'sí' || e === 'si') return '<span class="sv-desinf-si">✅ Sí</span>';
      if (e === 'no') return '<span class="sv-desinf-no">❌ No</span>';
      return '<span class="muted">—</span>';
    };
    h += `<div class="sv-modal" id="svDesinfModal" data-desinfmodal>
      <div class="sv-modal-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">🧴 Desinfección — ${esc(mod)}</span>
          <button class="sv-modal-x" data-desinf-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          <div class="sv-desinf-summary">Cumplimiento: <b>${desinf.cumplimiento !== null ? desinf.cumplimiento + '%' : '—'}</b> · ✅ ${desinf.si} Sí · ❌ ${desinf.no} No${desinf.fecha ? ' · 📅 ' + esc(fmtShort(desinf.fecha)) : ''}</div>
          ${desinf.tipos.map((t) => `
            <div class="sv-section-title" style="margin-top:14px">${esc(t.tipo)}</div>
            ${t.cats.map((c) => `
              <div class="sv-desinf-cat">${esc(c.cat)}</div>
              <table class="sv-table sv-desinf-table"><tbody>
                ${c.elems.map((el) => `<tr><td>${esc(el.elem)}</td><td>${estadoChip(el.estado)}</td><td class="muted">${esc(el.obs || '')}</td></tr>`).join('')}
              </tbody></table>`).join('')}`).join('')}
        </div>
      </div>
    </div>`;
  }

  // #5 · Modal de gráfico por métrica (SV/Población = tendencia · OD/Temp = perfil 12 tomas)
  h += `<div class="sv-modal" id="svModMetricModal" data-modmetricmodal>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title" id="svModMetricTitle">Tendencia</span>
        <button class="sv-modal-x" data-modmetric-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-controls" id="svModMetricControls" style="display:none">
          <label class="sv-modal-datelbl">📅 Fecha <select id="svModMetricDate" class="sv-modal-select"></select></label>
        </div>
        <div class="lv-fs-chart"><canvas id="svModMetricCanvas"></canvas></div>
        <div class="sv-modal-note" id="svModMetricNote"></div>
      </div>
    </div>
  </div>`;

  // #5 · Modal "Resumen del día" (selector de fecha + KPIs del módulo de ese día + alertas)
  h += `<div class="sv-modal" id="svModDayModal" data-moddaymodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">📅 Resumen del día — ${esc(mod)}</span>
        <button class="sv-modal-x" data-modday-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-controls"><label class="sv-modal-datelbl">📅 Fecha <select id="svModDayDate" class="sv-modal-select"></select></label></div>
        <div class="sv-modal-kpis" id="svModDayKpis"></div>
        <div id="svModDayAlerts"></div>
      </div>
    </div>
  </div>`;

  const after = (root) => {
    // #2 · RO1 en modal: barras agrupadas SV (eje y) + ICL (eje y1) por tanque (se dibuja al abrir).
    const cmpOverlay = root.querySelector('#svModCmpModal');
    if (cmpOverlay) {
      const drawCmp = () => makeChart('svModCmp', {
        type: 'bar',
        data: {
          labels: tankCmp.map((t) => t.tq),
          datasets: [
            { label: 'Supervivencia (%)', data: tankCmp.map((t) => t.sv), backgroundColor: '#2E7D32cc', borderColor: '#2E7D32', borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
            { label: 'ICL (prom.)', data: tankCmp.map((t) => (t.icl == null ? null : Math.round(t.icl))), backgroundColor: '#00695Ccc', borderColor: '#00695C', borderWidth: 1, borderRadius: 4, yAxisID: 'y1' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { position: 'left', beginAtZero: true, suggestedMax: 100, title: { display: true, text: 'SV %' }, ticks: { callback: (v) => v + '%' } },
            y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'ICL' }, grid: { drawOnChartArea: false } },
            x: { grid: { display: false } },
          },
          plugins: { legend: { labels: { boxWidth: 12 } } },
        },
      });
      const open = () => { cmpOverlay.classList.add('sv-open'); document.body.classList.add('modal-open'); requestAnimationFrame(drawCmp); };
      const close = () => { cmpOverlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
      root.querySelectorAll('[data-modcmp-open]').forEach((b) => b.addEventListener('click', open));
      cmpOverlay.querySelector('[data-modcmp-close]')?.addEventListener('click', close);
      cmpOverlay.addEventListener('click', (e) => { if (e.target === cmpOverlay) close(); });
    }

    // Modal Historial As. Téc. (+ barra de filtros que re-renderiza la lista en vivo)
    const atOverlay = root.querySelector('#svAtModal');
    if (atOverlay) {
      // Lista DIFERIDA: se construye al abrir (no en cada render del módulo).
      let atRendered = false;
      const open = () => { atOverlay.classList.add('sv-open'); document.body.classList.add('modal-open'); if (!atRendered) { atRendered = true; renderAtList(); } };
      const close = () => { atOverlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
      root.querySelectorAll('[data-athist-open]').forEach((b) => b.addEventListener('click', open));
      atOverlay.querySelector('[data-athist-close]')?.addEventListener('click', close);
      atOverlay.addEventListener('click', (e) => { if (e.target === atOverlay) close(); });

      const atList = atOverlay.querySelector('#svAtList');
      const supSel = atOverlay.querySelector('[data-athist-sup]');
      const comSel = atOverlay.querySelector('[data-athist-com]');
      const sieSel = atOverlay.querySelector('[data-athist-sie]');
      const renderAtList = () => {
        const com = comSel ? comSel.value : '__all';
        const rows = filterAtRows(supSel ? supSel.value : '__all', com, sieSel ? sieSel.value : '__all');
        atList.innerHTML = rows.length
          ? `<div class="sv-hist-count">${rows.length} día(s) con comentario</div>` + rows.map((r) => atItemHTML(r, com)).join('')
          : `<div class="empty-state">${atRows.length ? 'Sin comentarios para los filtros seleccionados.' : 'Sin comentarios de supervisión registrados para este módulo.'}</div>`;
      };
      [supSel, comSel, sieSel].forEach((sel) => sel && sel.addEventListener('change', renderAtList));
    }

    // #3 · Modal de Desinfección
    const dxOverlay = root.querySelector('#svDesinfModal');
    if (dxOverlay) {
      const open = () => { dxOverlay.classList.add('sv-open'); document.body.classList.add('modal-open'); };
      const close = () => { dxOverlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
      root.querySelectorAll('[data-desinf-open]').forEach((b) => b.addEventListener('click', open));
      dxOverlay.querySelector('[data-desinf-close]')?.addEventListener('click', close);
      dxOverlay.addEventListener('click', (e) => { if (e.target === dxOverlay) close(); });
    }

    // #5 · Modal de gráfico por métrica (SV/Pob = tendencia · OD/Temp = perfil 12 tomas)
    const mmOverlay = root.querySelector('#svModMetricModal');
    if (mmOverlay) {
      const titleEl = mmOverlay.querySelector('#svModMetricTitle');
      const noteEl = mmOverlay.querySelector('#svModMetricNote');
      const controls = mmOverlay.querySelector('#svModMetricControls');
      const dateSel = mmOverlay.querySelector('#svModMetricDate');
      const series = moduleSvPopSeries(ctx, mod, corrida);
      const hDates = moduleHourlyDates(ctx, mod, corrida);
      dateSel.innerHTML = hDates.length ? hDates.map((f, i) => `<option value="${esc(f)}"${i === hDates.length - 1 ? ' selected' : ''}>${esc(f)}</option>`).join('') : '<option>—</option>';
      let curMetric = 'sv';
      const TITLES = { sv: '📈 Tendencia de supervivencia', pop: '👥 Tendencia de población', od: '💧 OD por hora (módulo)', tmp: '🌡️ Temperatura por hora (módulo)' };
      const trendCfg = (label, data, color, pct) => ({
        type: 'line',
        data: { labels: series.labels, datasets: [{ label, data, borderColor: color, backgroundColor: color + '22', tension: .3, fill: true, pointRadius: 3, spanGaps: true, borderWidth: 2.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } }, y: pct ? { min: 0, suggestedMax: 100, ticks: { callback: (v) => v + '%' } } : { beginAtZero: true } } },
      });
      const hourlyCfg = (label, data, color) => ({
        type: 'line',
        data: { labels: HR_LABELS, datasets: [{ label, data, borderColor: color, backgroundColor: color + '1a', tension: .3, fill: true, pointRadius: 3, spanGaps: true, borderWidth: 2.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false } } },
      });
      const draw = () => {
        if (curMetric === 'sv') { controls.style.display = 'none'; noteEl.textContent = 'Supervivencia del módulo por fecha (Σ última pob. / Σ pob. inicial × 100).'; makeChart('svModMetricCanvas', trendCfg('Supervivencia (%)', series.sv, '#2E7D32', true)); }
        else if (curMetric === 'pop') { controls.style.display = 'none'; noteEl.textContent = 'Población total del módulo (Σ de todos los tanques) por fecha.'; makeChart('svModMetricCanvas', trendCfg('Población total', series.pop, '#1565C0', false)); }
        else { controls.style.display = ''; noteEl.textContent = 'Promedio del módulo en las 12 tomas cada 2 h del día seleccionado.'; const g = curMetric === 'od' ? gOD : gTmp; const c = curMetric === 'od' ? '#1E88E5' : '#F4511E'; makeChart('svModMetricCanvas', hourlyCfg(curMetric === 'od' ? 'OD (mg/L)' : 'T° (°C)', moduleHourly(ctx, mod, corrida, g, dateSel.value), c)); }
      };
      dateSel.addEventListener('change', () => { if (curMetric === 'od' || curMetric === 'tmp') draw(); });
      const open = (metric) => { curMetric = metric; titleEl.textContent = TITLES[metric] || 'Gráfico'; mmOverlay.classList.add('sv-open'); document.body.classList.add('modal-open'); requestAnimationFrame(draw); };
      const close = () => { mmOverlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
      root.querySelectorAll('[data-modmetric]').forEach((chip) => {
        chip.addEventListener('click', () => open(chip.dataset.modmetric));
        chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(chip.dataset.modmetric); } });
      });
      mmOverlay.querySelector('[data-modmetric-close]')?.addEventListener('click', close);
      mmOverlay.addEventListener('click', (e) => { if (e.target === mmOverlay) close(); });
    }

    // #5 · Modal "Resumen del día"
    const dayOverlay = root.querySelector('#svModDayModal');
    if (dayOverlay) {
      const dateSel = dayOverlay.querySelector('#svModDayDate');
      const kpisEl = dayOverlay.querySelector('#svModDayKpis');
      const alertsEl = dayOverlay.querySelector('#svModDayAlerts');
      const daySeries = moduleSvPopSeries(ctx, mod, corrida); // se calcula UNA vez y se reutiliza
      const dDates = daySeries.labels;
      dateSel.innerHTML = dDates.length ? dDates.map((f, i) => `<option value="${esc(f)}"${i === dDates.length - 1 ? ' selected' : ''}>${esc(f)}</option>`).join('') : '<option>—</option>';
      const kpiDay = (icon, label, val) => `<div class="sv-modal-kpi">${icon} <span class="muted">${label}</span> <b>${esc(val)}</b></div>`;
      const isAl = (lvl) => lvl === 'malo' || lvl === 'grave';
      const render = () => {
        const k = moduleDayKpis(ctx, mod, corrida, dateSel.value, daySeries);
        kpisEl.innerHTML = [
          kpiDay('📈', 'Supervivencia', fmt1(k.sv, '%')),
          kpiDay('📉', 'Mortalidad', fmt1(k.mort, '%')),
          kpiDay('👥', 'Población', fmtPop(k.pop)),
          kpiDay('💧', 'OD', fmt2(k.od, ' mg/L')),
          kpiDay('🌡️', 'Temperatura', fmt1(k.tmp, '°C')),
          kpiDay('🦐', 'Estadío', k.estadio || '—'),
        ].join('');
        const al = [];
        if (svLevel(k.sv) === 'grave') al.push('Supervivencia crítica');
        if (isAl(odLevel(k.od))) al.push('OD fuera de rango');
        if (isAl(tmpLevel(k.tmp))) al.push('Temperatura fuera de rango');
        alertsEl.innerHTML = al.length
          ? `<div class="sv-card-alert" style="margin-top:10px">⚠️ ${esc(al.join(' · '))}</div>`
          : '<div class="sv-alert-ok" style="margin-top:10px">✅ Sin alertas este día.</div>';
      };
      dateSel.addEventListener('change', render);
      const open = () => { dayOverlay.classList.add('sv-open'); document.body.classList.add('modal-open'); render(); };
      const close = () => { dayOverlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
      root.querySelectorAll('[data-modday-open]').forEach((b) => b.addEventListener('click', open));
      dayOverlay.querySelector('[data-modday-close]')?.addEventListener('click', close);
      dayOverlay.addEventListener('click', (e) => { if (e.target === dayOverlay) close(); });
    }

    // Modal Biomol (heatmap diagnóstico × tanque|estadío)
    const bmOverlay = root.querySelector('#svBiomolModal');
    if (bmOverlay) {
      const bmHost = bmOverlay.querySelector('#svBmBody');
      const bmNote = bmOverlay.querySelector('#svBmNote');
      const heatNote = `% de muestras positivas por ${corrida ? 'corrida <b>' + esc(corrida) + '</b> · ' : ''}diagnóstico (verde = 0% · rojo = 100%). Excluye estadío Reproductores. Las muestras compartidas entre módulos pareados (p. ej. "Módulo 1-2") aparecen en ambos módulos.`;
      const swarmNote = `Cada punto = un análisis molecular${corrida ? ' de la corrida <b>' + esc(corrida) + '</b>' : ''} en este módulo. 🔴 algún diagnóstico positivo · 🟢 todos negativos · ⚪ sin medición. Filtra por fecha con el desplegable.`;
      const gelNote = `<b>Electroforesis Digital Temporal</b> · gel UV simulado: carriles = tanques, filas = diagnósticos. Banda <span style="color:#7CB500;font-weight:800">verde lima = positivo</span> · <span style="color:#8E5BD9;font-weight:800">lavanda = negativo</span> · línea tenue = sin medición. Filtra por fecha.`;
      let bmMode = 'tank';
      const buildBm = () => {
        if (bmMode === 'swarm') { bmNote.innerHTML = swarmNote; buildBiomolSwarm(bmHost, biomolRows); }
        else if (bmMode === 'gel') { bmNote.innerHTML = gelNote; buildBiomolGel(bmHost, biomolRows, tankLote); }
        else { bmNote.innerHTML = heatNote; buildBiomolHeat(bmHost, biomolRows, bmMode); }
      };
      // Heatmap DIFERIDO: se dibuja al ABRIR el modal (requestAnimationFrame en open()),
      // no en cada render del módulo (era costoso y ralentizaba la vista).
      bmOverlay.querySelectorAll('[data-bmmode]').forEach((b) => b.addEventListener('click', () => {
        bmMode = b.dataset.bmmode;
        bmOverlay.querySelectorAll('[data-bmmode]').forEach((x) => x.classList.toggle('is-active', x === b));
        buildBm();
      }));
      // Redibuja al abrir → el SVG de dispersión toma el ancho real del modal visible.
      const open = () => { bmOverlay.classList.add('sv-open'); document.body.classList.add('modal-open'); requestAnimationFrame(buildBm); };
      const close = () => { bmOverlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); bmDestroyTip(); };
      root.querySelectorAll('[data-biomol-open]').forEach((b) => b.addEventListener('click', open));
      bmOverlay.querySelector('[data-biomol-close]')?.addEventListener('click', close);
      bmOverlay.addEventListener('click', (e) => { if (e.target === bmOverlay) close(); });
    }

    // Modal Microbiología (Placa + Tabla + Heatmap; pestaña Placa con tanque + navegador de fecha)
    const micOverlay = root.querySelector('#svMicroModal');
    if (micOverlay) {
      const micBody = micOverlay.querySelector('#svMicroBody');
      let micMode = 'placa';
      const micState = { tank: null, dayIdx: null };
      const renderMic = () => {
        if (micMode === 'tabla') micBody.innerHTML = microTablaHTML(microRows);
        else if (micMode === 'heatmap') micBody.innerHTML = microHeatmapHTML(microRows);
        else micBody.innerHTML = microPlacaHTML(microRows, micState);
      };
      micOverlay.querySelectorAll('[data-micmode]').forEach((b) => b.addEventListener('click', () => {
        micMode = b.dataset.micmode;
        micOverlay.querySelectorAll('[data-micmode]').forEach((x) => x.classList.toggle('is-active', x === b));
        renderMic();
      }));
      // Filtros internos de la pestaña Placa (delegados; el cuerpo se re-renderiza).
      micBody.addEventListener('change', (e) => { const s = e.target.closest('[data-micro-tank]'); if (s) { micState.tank = s.value || null; micState.dayIdx = null; renderMic(); } });
      micBody.addEventListener('click', (e) => { const nav = e.target.closest('[data-micro-day]'); if (nav && !nav.disabled) { micState.dayIdx = (micState.dayIdx == null ? 0 : micState.dayIdx) + Number(nav.dataset.microDay); renderMic(); } });
      // Tooltip de colonias de la placa (patógeno · UFC · muestras · nivel), como en Bacteriología.
      const micTT = micOverlay.querySelector('#svMicroTT');
      const ttShow = (g) => {
        const c = _svMicroColonies.find((x) => x.id === g.dataset.cid); if (!c || !micTT) return;
        const glow = g.querySelector('.mic-colony-glow'); if (glow) glow.setAttribute('opacity', '1');
        micTT.style.borderColor = c.color;
        micTT.innerHTML = `<div class="mic-tt-h" style="color:${c.color}">${esc(c.label)}</div>
          <div><span class="mic-tt-k">UFC (Σ):</span> <b>${micFmtNum(c.ufc)}</b></div>
          <div><span class="mic-tt-k">Muestras:</span> ${c.nMuestras}</div>
          ${c.worst ? `<div><span class="mic-tt-k">Nivel máx:</span> <b style="color:${MIC_NIVEL_COLOR[c.worst]}">${esc(c.worst)}</b></div>` : ''}`;
        micTT.style.display = 'block';
      };
      micBody.addEventListener('mouseover', (e) => { const g = e.target.closest('.mic-colony'); if (g) ttShow(g); });
      micBody.addEventListener('mousemove', (e) => { if (!micTT || micTT.style.display !== 'block') return; micTT.style.left = Math.min(e.clientX + 14, window.innerWidth - 210) + 'px'; micTT.style.top = Math.min(e.clientY - 8, window.innerHeight - 130) + 'px'; });
      micBody.addEventListener('mouseout', (e) => { const g = e.target.closest('.mic-colony'); if (g) { if (micTT) micTT.style.display = 'none'; const glow = g.querySelector('.mic-colony-glow'); if (glow) glow.setAttribute('opacity', '0'); } });
      const open = () => { micMode = 'placa'; micState.tank = null; micState.dayIdx = null; micOverlay.querySelectorAll('[data-micmode]').forEach((x) => x.classList.toggle('is-active', x.dataset.micmode === 'placa')); micOverlay.classList.add('sv-open'); document.body.classList.add('modal-open'); requestAnimationFrame(renderMic); };
      const close = () => { micOverlay.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
      root.querySelectorAll('[data-micro-open]').forEach((b) => b.addEventListener('click', open));
      micOverlay.querySelector('[data-micro-close]')?.addEventListener('click', close);
      micOverlay.addEventListener('click', (e) => { if (e.target === micOverlay) close(); });
    }
  };

  return { html: h, after };
}
