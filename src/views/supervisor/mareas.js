/* ============================================================
   SUPERVISOR · Modal de Mareas (referencia de sitio · Anconcito · INOCAR)
   Lee la hoja "Marea" del store (_SheetOrigin='Marea'). Cada fila = 1 día con
   sus pleamares/bajamares, fase lunar, iluminación y tipo (Viva/Muerta).
   Dos vistas: "Día" (curva de marea + KPIs + luna + tipo + tabla) y
   "Mes" (tendencia mensual + distribución de fases lunares).
   Capa de datos PURA (mareaDays, testeable) + render con SVG (luna/ola) y
   Chart.js gestionado (tendencia/donut). Tema del proyecto (claro/oscuro).
   ============================================================ */
import { store } from '../../core/store.js';
import { makeChart, destroyChart } from '../../core/charts.js';
import { esc } from '../../core/format.js';
import { parseAnyDate, fmtShort, yearMonthKey } from '../../core/dates.js';
// Capas de datos PURAS de laboratorio (ya en el bundle base vía la vista Microbiología) para
// la vista de Correlación marea↔laboratorio.
import { meltRow as micMelt, rowContext as micCtx, isMicroRow } from '../microbiologia/data.js';
import { calMeasured, calCtx, loadCalRanges, isCalAguaRow } from '../microbiologia/calagua.data.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PLE = '#2b7bd6'; // pleamar (azul)
const BAJ = '#e8912b'; // bajamar (ámbar)
const AMP = '#00838f'; // amplitud (teal)

export const isMareaRow = (r) => !!r && r._SheetOrigin === 'Marea';

// ---------- lectura tolerante de columnas ----------
const mv = (row, names) => { for (const n of names) { const v = row[n]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; } return ''; };
const numOf = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace('%', '').replace(',', '.')); return isNaN(n) ? null : n; };

/** Hora de una celda → minutos del día (0–1440). Tolera "HH:MM", "HHMM", Date,
 *  fracción de día de Excel (0–1) y horas decimales. null si vacío/ilegible. */
function parseTimeToMin(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.getHours() * 60 + v.getMinutes();
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) { const h = +m[1], mi = +m[2]; if (h < 24 && mi < 60) return h * 60 + mi; }
  m = s.match(/^(\d{2})(\d{2})$/);
  if (m) { const h = +m[1], mi = +m[2]; if (h < 24 && mi < 60) return h * 60 + mi; }
  const n = Number(s.replace(',', '.'));
  if (!isNaN(n)) {
    if (n > 0 && n < 1) return Math.round(n * 1440);   // fracción de día (Excel)
    if (n >= 0 && n < 24) return Math.round(n * 60);   // horas decimales
    if (n >= 24 && n <= 1440) return Math.round(n);    // minutos
  }
  return null;
}
const minLabel = (min) => min == null ? '—' : String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
const normTipo = (v) => { const s = String(v || '').toLowerCase(); if (s.startsWith('viv')) return 'Viva'; if (s.startsWith('muer')) return 'Muerta'; return ''; };
const isTodayD = (d) => { const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const CM = {
  fecha: ['Fecha', 'fecha'], fase: ['Fase Lunar', 'Fase lunar', 'fase lunar'],
  illum: ['%Iluminación', '% Iluminación', '%Iluminacion', 'Iluminación', 'Iluminacion', '% iluminación'],
  tipo: ['Tipo de Marea', 'Tipo Marea', 'tipo de marea'],
  p1: ['Pleamar 1', 'pleamar 1'], hp1: ['Altura P1 (m)', 'Altura P1', 'altura p1 (m)'],
  b1: ['Bajamar 1', 'bajamar 1'], hb1: ['Altura B1 (m)', 'Altura B1', 'altura b1 (m)'],
  p2: ['Pleamar 2', 'pleamar 2'], hp2: ['Altura P2 (m)', 'Altura P2', 'altura p2 (m)'],
  b2: ['Bajamar 2', 'bajamar 2'], hb2: ['Altura B2 (m)', 'Altura B2', 'altura b2 (m)'],
  amp: ['Amplitud (m)', 'Amplitud', 'amplitud'],
};

let _cache = null;
/** Días de marea (asc) parseados de la hoja "Marea". Memoizado por identidad del store. */
export function mareaDays() {
  const data = store.globalData;
  if (_cache && _cache.data === data) return _cache.days;
  const days = [];
  (data || []).forEach((row) => {
    if (!isMareaRow(row)) return;
    const d = parseAnyDate(mv(row, CM.fecha));
    if (!d || isNaN(d)) return;
    const evRaw = [
      [mv(row, CM.p1), mv(row, CM.hp1), 'P'], [mv(row, CM.b1), mv(row, CM.hb1), 'B'],
      [mv(row, CM.p2), mv(row, CM.hp2), 'P'], [mv(row, CM.b2), mv(row, CM.hb2), 'B'],
    ];
    const events = [];
    evRaw.forEach(([t, h, type]) => { const min = parseTimeToMin(t); const hv = numOf(h); if (min != null && hv != null) events.push({ t: min, label: minLabel(min), h: hv, type }); });
    events.sort((a, b) => a.t - b.t);
    const ps = events.filter((e) => e.type === 'P'), bs = events.filter((e) => e.type === 'B');
    const pmax = ps.length ? Math.max(...ps.map((e) => e.h)) : null;
    const bmin = bs.length ? Math.min(...bs.map((e) => e.h)) : null;
    let amp = numOf(mv(row, CM.amp));
    if (amp == null && pmax != null && bmin != null) amp = +(pmax - bmin).toFixed(2);
    days.push({ key: dayKey(d), d, mkey: yearMonthKey(d), fase: String(mv(row, CM.fase) || '').trim(), illum: numOf(mv(row, CM.illum)), tipo: normTipo(mv(row, CM.tipo)), events, pmax, bmin, amp });
  });
  days.sort((a, b) => a.d - b.d);
  _cache = { data, days };
  return days;
}

// ---------- interpolación de la curva (Catmull-Rom / Hermite en minutos·metros) ----------
function interpWave(events, minuteOfDay) {
  const pts = events.map((e) => ({ x: e.t, y: e.h }));
  const n = pts.length;
  if (!n) return null;
  if (n === 1) return pts[0].y;
  if (minuteOfDay <= pts[0].x) return pts[0].y;
  if (minuteOfDay >= pts[n - 1].x) return pts[n - 1].y;
  for (let i = 0; i < n - 1; i++) {
    if (minuteOfDay >= pts[i].x && minuteOfDay <= pts[i + 1].x) {
      const dx = (pts[i + 1].x - pts[i].x) || 1;
      const t = (minuteOfDay - pts[i].x) / dx, t2 = t * t, t3 = t2 * t;
      const m0 = i > 0 ? (pts[i + 1].y - pts[i - 1].y) / (pts[i + 1].x - pts[i - 1].x) : (pts[i + 1].y - pts[i].y) / dx;
      const m1 = i < n - 2 ? (pts[i + 2].y - pts[i].y) / (pts[i + 2].x - pts[i].x) : (pts[i + 1].y - pts[i].y) / dx;
      return (2 * t3 - 3 * t2 + 1) * pts[i].y + (t3 - 2 * t2 + t) * dx * m0 + (-2 * t3 + 3 * t2) * pts[i + 1].y + (t3 - t2) * dx * m1;
    }
  }
  return pts[n - 1].y;
}

// ---------- SVG: luna (greyscale, neutro en ambos temas) ----------
function mareaMoonSVG(fase, illum) {
  const cx = 60, cy = 60, r = 46;
  const frac = Math.max(0, Math.min(1, (illum == null ? 0 : illum) / 100));
  const waning = /menguante/i.test(fase || '');
  let term = '';
  if (frac > 0.02 && frac < 0.97) {
    const ex = r * Math.abs(Math.cos(Math.PI * frac));
    const largeArc = frac > 0.5 ? 1 : 0;
    const sweepDir = waning ? (frac < 0.5 ? 1 : 0) : (frac < 0.5 ? 0 : 1);
    term = `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} ${waning ? 0 : 1} ${cx} ${cy + r} A ${ex.toFixed(2)} ${r} 0 ${largeArc} ${sweepDir} ${cx} ${cy - r} Z" fill="#232a35" filter="url(#mMoonSoft)"/>`;
  }
  const litFull = frac > 0.02 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#mMoonG)"/>` : '';
  const craters = frac >= 0.1 ? [[cx + 14, cy - 9, 4], [cx - 11, cy + 12, 6], [cx + 4, cy + 17, 3.5], [cx - 16, cy - 5, 2.6], [cx + 18, cy + 7, 2.6]].map(([x, y, rr]) => `<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${(rr * 0.7).toFixed(1)}" fill="rgba(40,40,40,.16)"/>`).join('') : '';
  return `<svg viewBox="0 0 120 120" width="108" height="108" class="sv-marea-moon" aria-hidden="true">
      <defs>
        <radialGradient id="mMoonG" cx="38%" cy="32%" r="70%"><stop offset="0%" stop-color="#ECECEC"/><stop offset="45%" stop-color="#BFBFBF"/><stop offset="100%" stop-color="#6E6E6E"/></radialGradient>
        <clipPath id="mMoonClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
        <filter id="mMoonSoft"><feGaussianBlur stdDeviation="0.7"/></filter>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#232a35" stroke="var(--c-border)" stroke-width="1"/>
      <g clip-path="url(#mMoonClip)">${litFull}${term}${craters}</g>
    </svg>`;
}

// ---------- SVG: curva de marea del día (con indicador de tiempo real) ----------
function mareaWaveSVG(day, nowMin) {
  const events = day.events;
  if (!events.length) return '<div class="sv-marea-nodata">Sin lecturas de marea para este día.</div>';
  const W = 640, H = 200, PL = 34, PR = 12, PT = 14, PB = 26;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const hs = events.map((e) => e.h);
  const minH = Math.max(0, Math.min(...hs) - 0.15), maxH = Math.max(...hs) + 0.15;
  const range = (maxH - minH) || 1;
  const toX = (min) => PL + min / 1440 * plotW;
  const toY = (h) => PT + plotH - (h - minH) / range * plotH;
  let curve = '';
  for (let m = 0; m <= 1440; m += 5) { const y = interpWave(events, m); if (y == null) continue; curve += (curve ? ' L ' : 'M ') + toX(m).toFixed(1) + ',' + toY(y).toFixed(1); }
  const fill = curve + ` L ${toX(1440).toFixed(1)},${(PT + plotH).toFixed(1)} L ${PL},${(PT + plotH).toFixed(1)} Z`;
  let yTicks = '';
  for (let i = 0; i <= 4; i++) { const v = minH + range * i / 4, y = toY(v); yTicks += `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="var(--c-border)" stroke-width="1" opacity="0.4"/><text x="${PL - 4}" y="${(y + 3).toFixed(1)}" fill="var(--c-text-muted)" font-size="9" text-anchor="end">${v.toFixed(1)}</text>`; }
  let xTicks = '';
  [0, 4, 8, 12, 16, 20, 24].forEach((h) => { const x = toX(h * 60); xTicks += `<line x1="${x.toFixed(1)}" y1="${PT}" x2="${x.toFixed(1)}" y2="${(PT + plotH).toFixed(1)}" stroke="var(--c-border)" stroke-width="1" opacity="0.25"/><text x="${x.toFixed(1)}" y="${(PT + plotH + 13).toFixed(1)}" fill="var(--c-text-muted)" font-size="9" text-anchor="middle">${String(h % 24).padStart(2, '0')}:00</text>`; });
  let markers = '';
  events.forEach((e) => { const px = toX(e.t), py = toY(e.h), col = e.type === 'P' ? PLE : BAJ; markers += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${col}" stroke="var(--c-surface)" stroke-width="1.5"/><text x="${px.toFixed(1)}" y="${(py - 8).toFixed(1)}" fill="${col}" font-size="9.5" text-anchor="middle" font-weight="700">${e.h.toFixed(2)}</text><text x="${px.toFixed(1)}" y="${(py + 15).toFixed(1)}" fill="${col}" font-size="8.5" text-anchor="middle" opacity="0.85">${esc(e.label)}</text>`; });
  let rt = '';
  if (nowMin != null && nowMin >= 0 && nowMin <= 1440) {
    const rx = toX(nowMin); const ch = interpWave(events, nowMin); const ry = toY(ch == null ? minH : ch);
    rt = `<line x1="${rx.toFixed(1)}" y1="${PT}" x2="${rx.toFixed(1)}" y2="${(PT + plotH).toFixed(1)}" stroke="var(--c-brand)" stroke-width="1.4" stroke-dasharray="4,3" opacity="0.65"/>
      <circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="4.5" fill="var(--c-brand)" stroke="var(--c-surface)" stroke-width="1.5"/>
      <circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="4.5" fill="none" stroke="var(--c-brand)" stroke-width="1.4"><animate attributeName="r" values="4.5;12;4.5" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/></circle>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" class="sv-marea-wave">
      <defs><linearGradient id="mWFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${PLE}" stop-opacity="0.26"/><stop offset="100%" stop-color="${PLE}" stop-opacity="0.02"/></linearGradient></defs>
      ${yTicks}${xTicks}<path d="${fill}" fill="url(#mWFill)"/><path d="${curve}" fill="none" stroke="${PLE}" stroke-width="2"/>${markers}${rt}
    </svg>`;
}

// ---------- estadísticos del mes ----------
/** Resumen del mes: amplitud media/máx/mín (con el día en que ocurren), pleamar máxima
 *  y bajamar mínima absolutas, y nº de días. Devuelve `null` en los campos sin dato en
 *  vez de NaN/-Infinity (`Math.max(...[])` sobre un mes sin alturas daría -Infinity). */
export function monthStats(monthDays) {
  const days = monthDays || [];
  const pick = (f) => days.map(f).filter((v) => v != null && !isNaN(v));
  const amps = pick((d) => d.amp), pmaxes = pick((d) => d.pmax), bmins = pick((d) => d.bmin);
  const dayOf = (val) => { const hit = days.find((d) => d.amp != null && Math.abs(d.amp - val) < 1e-9); return hit ? hit.d.getDate() : null; };
  const ampMax = amps.length ? Math.max(...amps) : null;
  const ampMin = amps.length ? Math.min(...amps) : null;
  return {
    dias: days.length,
    ampProm: amps.length ? amps.reduce((a, b) => a + b, 0) / amps.length : null,
    ampMax, ampMaxDia: ampMax == null ? null : dayOf(ampMax),
    ampMin, ampMinDia: ampMin == null ? null : dayOf(ampMin),
    pleamarMax: pmaxes.length ? Math.max(...pmaxes) : null,
    bajamarMin: bmins.length ? Math.min(...bmins) : null,
    viva: days.filter((d) => d.tipo === 'Viva').length,
    muerta: days.filter((d) => d.tipo === 'Muerta').length,
  };
}
function monthStatsHTML(monthDays) {
  const s = monthStats(monthDays);
  const m = (v) => v == null ? '—' : v.toFixed(2) + ' m';
  const chip = (label, val, sub, col) => `<div class="sv-marea-stat"><div class="sv-marea-stat-l">${esc(label)}</div><div class="sv-marea-stat-v"${col ? ` style="color:${col}"` : ''}>${esc(val)}</div>${sub ? `<div class="sv-marea-stat-s">${esc(sub)}</div>` : ''}</div>`;
  const conAmp = (monthDays || []).filter((d) => d.amp != null).length;
  return `<div class="sv-marea-stats">
      ${chip('Amplitud promedio', m(s.ampProm), 'del mes', AMP)}
      ${chip('Amplitud máxima', m(s.ampMax), s.ampMaxDia ? `día ${s.ampMaxDia}` : '—', PLE)}
      ${chip('Amplitud mínima', m(s.ampMin), s.ampMinDia ? `día ${s.ampMinDia}` : '—', BAJ)}
      ${chip('Pleamar máx. absoluta', m(s.pleamarMax), 'del mes', PLE)}
      ${chip('Bajamar mín. absoluta', m(s.bajamarMin), 'del mes', BAJ)}
      ${chip('Días registrados', String(s.dias), conAmp < s.dias ? `${conAmp} con amplitud` : '', '')}
    </div>`;
}

// ---------- barra Viva/Muerta del mes ----------
function vivaBar(monthDays) {
  const total = monthDays.filter((d) => d.tipo).length;
  const viva = monthDays.filter((d) => d.tipo === 'Viva').length;
  const muerta = total - viva;
  const pct = total ? Math.round(viva / total * 100) : 0;
  return `<div class="sv-marea-vbar">
      <div class="sv-marea-vbar-lbl"><span class="sv-marea-viva-t">${viva} días Viva</span><span class="muted">${muerta} días Muerta</span></div>
      <div class="sv-marea-vbar-track"><div class="sv-marea-vbar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

// ---------- vista "Día" ----------
// El régimen Viva/Muerta del MES vive en la vista "Mes" (junto al resto de datos
// mensuales); aquí el día ya se describe con su propia insignia de tipo de marea.
function diaHTML(day, nowMin) {
  const fmt = (v) => v == null ? '—' : v.toFixed(2);
  const kpi = (l, v, u, col) => `<div class="sv-marea-kpi"><div class="sv-marea-kpi-l">${esc(l)}</div><div class="sv-marea-kpi-v"${col ? ` style="color:${col}"` : ''}>${v}${u ? `<span class="sv-marea-kpi-u">${u}</span>` : ''}</div></div>`;
  const tipoBadge = day.tipo
    ? `<span class="sv-marea-tipo sv-marea-tipo--${day.tipo === 'Viva' ? 'viva' : 'muerta'}">${day.tipo === 'Viva' ? '🌕 Marea Viva' : '🌗 Marea Muerta'}<span class="sv-marea-tipo-sub">${day.tipo === 'Viva' ? 'sicigia' : 'cuadratura'}</span></span>`
    : '<span class="muted">Tipo no registrado</span>';
  const table = day.events.length
    ? `<table class="sv-table sv-marea-table"><thead><tr><th>#</th><th>Hora</th><th>Altura (m)</th><th>Tipo</th></tr></thead><tbody>${day.events.map((e, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(e.label)}</td><td style="color:${e.type === 'P' ? PLE : BAJ};font-weight:700">${e.h.toFixed(2)}</td><td><span class="sv-marea-badge" style="color:${e.type === 'P' ? PLE : BAJ};background:${(e.type === 'P' ? PLE : BAJ)}22">${e.type === 'P' ? '▲ Pleamar' : '▼ Bajamar'}</span></td></tr>`).join('')}</tbody></table>`
    : '<div class="sv-marea-nodata">Sin lecturas para este día.</div>';
  return `<div class="sv-marea-grid">
      <div class="sv-marea-panel sv-marea-moonp">
        <div class="sv-marea-ptitle">Fase lunar</div>
        ${mareaMoonSVG(day.fase, day.illum)}
        <div class="sv-marea-moon-name">${esc(day.fase || '—')}</div>
        <div class="sv-marea-moon-sub">Iluminación: ${day.illum == null ? '—' : day.illum + '%'}</div>
      </div>
      <div class="sv-marea-panel sv-marea-wavep">
        <div class="sv-marea-ptitle sv-marea-ptitle--row">Perfil de marea del día <span class="muted">· ${esc(fmtShort(day.d))}</span>
          <button class="sv-marea-fsbtn" data-marea-wave-fs title="Ampliar el perfil de marea" aria-label="Ampliar el perfil de marea">⛶</button>
        </div>
        <div id="mareaWaveHost">${mareaWaveSVG(day, nowMin)}</div>
      </div>
      <div class="sv-marea-side">
        ${kpi('Amplitud', fmt(day.amp), 'm', AMP)}
        ${kpi('Pleamar máx.', fmt(day.pmax), 'm', PLE)}
        ${kpi('Bajamar mín.', fmt(day.bmin), 'm', BAJ)}
        <div class="sv-marea-tipowrap"><div class="sv-marea-kpi-l">Tipo de marea (día)</div>${tipoBadge}</div>
      </div>
      <div class="sv-marea-panel sv-marea-tablep">
        <div class="sv-marea-ptitle">Lecturas del día</div>
        ${table}
      </div>
    </div>
    <div class="sv-marea-fs" id="mareaWaveFs" data-marea-wave-fsbg>
      <div class="sv-marea-fs-card">
        <div class="sv-marea-fs-head"><span class="sv-marea-fs-title">🌊 Perfil de marea · ${esc(fmtShort(day.d))}</span><button class="sv-modal-x" data-marea-wave-fsclose aria-label="Cerrar">✕</button></div>
        <div class="sv-marea-fs-wave">${mareaWaveSVG(day, nowMin)}</div>
      </div>
    </div>`;
}

// ---------- vista "Mes" (tendencia + donut, Chart.js) ----------
let _mes = null; // { monthDays } del mes visible (para redibujar los gráficos ampliados)
function mesHTML(monthDays, monthLabel) {
  const fsBtn = (which, label) => `<button class="sv-marea-fsbtn" data-marea-chart-fs="${which}" title="Ampliar ${label}" aria-label="Ampliar ${label}">⛶</button>`;
  return `<div class="sv-marea-panel sv-marea-statsp">
      <div class="sv-marea-ptitle">Resumen del mes${monthLabel ? ` <span class="muted">· ${esc(monthLabel)}</span>` : ''}</div>
      ${monthStatsHTML(monthDays)}
      ${vivaBar(monthDays)}
    </div>
    <div class="sv-marea-charts">
      <div class="sv-marea-panel">
        <div class="sv-marea-ptitle sv-marea-ptitle--row">Tendencia mensual — alturas de marea <span class="muted">· clic en la leyenda para alternar series</span>${fsBtn('trend', 'la tendencia')}</div>
        <div class="sv-marea-charthost"><canvas id="mareaTrendChart"></canvas></div>
      </div>
      <div class="sv-marea-panel">
        <div class="sv-marea-ptitle sv-marea-ptitle--row">Distribución de fases lunares${fsBtn('donut', 'la distribución de fases')}</div>
        <div class="sv-marea-charthost sv-marea-charthost--donut"><canvas id="mareaDonutChart"></canvas></div>
      </div>
    </div>
    <div class="sv-marea-fs" id="mareaChartFs" data-marea-chart-fsbg>
      <div class="sv-marea-fs-card">
        <div class="sv-marea-fs-head"><span class="sv-marea-fs-title">📈</span><button class="sv-modal-x" data-marea-chart-fsclose aria-label="Cerrar">✕</button></div>
        <div class="sv-marea-fs-chart"><canvas id="mareaFsCanvas"></canvas></div>
      </div>
    </div>`;
}
/** Abre/cierra la ampliación (fullscreen) de un gráfico del mes redibujándolo grande. */
export function openChartFs(host, which) {
  const ov = host && host.querySelector('#mareaChartFs');
  if (!ov || !_mes) return;
  ov.querySelector('.sv-marea-fs-title').textContent = which === 'donut' ? '🌙 Distribución de fases lunares' : '📈 Tendencia mensual — alturas de marea';
  ov.classList.add('is-open');
  destroyChart('mareaFsCanvas');
  if (which === 'donut') drawMareaDonut(_mes.monthDays, 'mareaFsCanvas');
  else drawMareaTrend(_mes.monthDays, 'mareaFsCanvas');
}
export function closeChartFs(host) { const ov = host && host.querySelector('#mareaChartFs'); if (ov) ov.classList.remove('is-open'); destroyChart('mareaFsCanvas'); }
function drawMareaTrend(monthDays, canvasId = 'mareaTrendChart') {
  makeChart(canvasId, {
    type: 'line',
    data: {
      labels: monthDays.map((d) => String(d.d.getDate())),
      datasets: [
        { label: 'Pleamar máx (m)', data: monthDays.map((d) => d.pmax), borderColor: PLE, backgroundColor: PLE + '22', tension: 0.3, spanGaps: true, pointRadius: 2, borderWidth: 2 },
        { label: 'Bajamar mín (m)', data: monthDays.map((d) => d.bmin), borderColor: BAJ, backgroundColor: BAJ + '22', tension: 0.3, spanGaps: true, pointRadius: 2, borderWidth: 2 },
        { label: 'Amplitud (m)', data: monthDays.map((d) => d.amp), borderColor: AMP, backgroundColor: AMP + '22', tension: 0.3, spanGaps: true, pointRadius: 2, borderWidth: 2, borderDash: [4, 3] },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { title: { display: true, text: 'Altura (m)' }, grid: { color: 'rgba(120,144,156,.16)' } }, x: { grid: { display: false }, title: { display: true, text: 'Día del mes' } } },
      plugins: { legend: { display: true, position: 'top' } },
    },
  });
}
const PHASE_PALETTE = ['#334766', '#5B8FB9', '#3B82F6', '#93C5FD', '#D9C48A', '#C9A83A', '#e8912b', '#8D6E63', '#B0BEC5', '#78909C'];
function drawMareaDonut(monthDays, canvasId = 'mareaDonutChart') {
  const counts = new Map();
  monthDays.forEach((d) => { const f = d.fase || '—'; counts.set(f, (counts.get(f) || 0) + 1); });
  const labels = [...counts.keys()], data = [...counts.values()];
  if (!data.length) return;
  makeChart(canvasId, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => PHASE_PALETTE[i % PHASE_PALETTE.length]), borderColor: 'rgba(128,128,128,.28)', borderWidth: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } },
  });
}

// ---------- barra selectora (meses + navegador de día) ----------
function selBar(months, curMkey, monthDays, curKey, mode) {
  const monthPills = months.map((m) => `<button class="sv-marea-mbtn${m.key === curMkey ? ' is-on' : ''}" data-marea-month="${esc(m.key)}">${esc(m.label)}</button>`).join('');
  let dayNav = '';
  if (mode === 'dia') {
    const idx = monthDays.findIndex((d) => d.key === curKey);
    const prev = idx > 0 ? monthDays[idx - 1].key : '';
    const next = idx >= 0 && idx < monthDays.length - 1 ? monthDays[idx + 1].key : '';
    const opts = monthDays.map((d) => `<option value="${d.key}"${d.key === curKey ? ' selected' : ''}>${d.d.getDate()} · ${esc(fmtShort(d.d))}</option>`).join('');
    dayNav = `<div class="sv-marea-daynav">
        <button class="sv-micro-navbtn" data-marea-day="${prev}"${prev ? '' : ' disabled'} aria-label="Día anterior">◀</button>
        <select class="sv-modal-select" data-marea-daysel>${opts}</select>
        <button class="sv-micro-navbtn" data-marea-day="${next}"${next ? '' : ' disabled'} aria-label="Día siguiente">▶</button>
      </div>`;
  }
  return `<div class="sv-marea-selbar"><div class="sv-marea-months">${monthPills}</div>${dayNav}</div>`;
}

// ---------- ticker de tiempo real (solo el día = hoy, vista Día) ----------
let _ticker = null;
export function stopMareaTicker() { if (_ticker) { clearInterval(_ticker); _ticker = null; } }
export function cleanupMareas() {
  stopMareaTicker();
  ['mareaTrendChart', 'mareaDonutChart', 'mareaCorrChart', 'mareaFsCanvas'].forEach(destroyChart);
  // Referencias al DOM/datos del render anterior: se sueltan para no dibujar un gráfico
  // ampliado con el mes que ya no está en pantalla. `renderMareas` las repuebla.
  _mes = null; _corr = null;
}
function startTicker(host, state) {
  stopMareaTicker();
  _ticker = setInterval(() => {
    const modal = host.closest ? host.closest('.sv-modal') : null;
    if (!host.isConnected || !modal || !modal.classList.contains('sv-open') || state.mode !== 'dia') { stopMareaTicker(); return; }
    const day = mareaDays().find((d) => d.key === state.key);
    if (!day || !isTodayD(day.d)) { stopMareaTicker(); return; }
    const wave = mareaWaveSVG(day, new Date().getHours() * 60 + new Date().getMinutes());
    const wh = host.querySelector('#mareaWaveHost'); if (wh) wh.innerHTML = wave;
    const fw = host.querySelector('.sv-marea-fs-wave'); if (fw) fw.innerHTML = wave; // copia ampliada
  }, 60000);
}

// ---------- Correlación marea ↔ laboratorio (Microbiología / Calidad de Agua) ----------
const TIDE_VARS = [
  { key: 'amp', label: 'Amplitud' },
  { key: 'pmax', label: 'Pleamar máx' },
  { key: 'bmin', label: 'Bajamar mín' },
  { key: 'tipo', label: 'Viva/Muerta' },
];
const CORR_MIN_N = 5; // mínimo de días emparejados para mostrar un r
let _corr = null;      // { params, cell } de la vista Correlación (para el scatter post-render)

export function pearson(pairs) {
  const n = pairs.length; if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  pairs.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; });
  const dx = n * sxx - sx * sx, dy = n * syy - sy * sy;
  if (dx <= 0 || dy <= 0) return null;
  return (n * sxy - sx * sy) / Math.sqrt(dx * dy);
}
/** Variables de marea por día del mes (tipo Viva=1 / Muerta=0). */
function tideByDayOf(monthKey) {
  const t = new Map();
  mareaDays().filter((d) => d.mkey === monthKey).forEach((d) => t.set(d.key, { amp: d.amp, pmax: d.pmax, bmin: d.bmin, tipo: d.tipo === 'Viva' ? 1 : d.tipo === 'Muerta' ? 0 : null }));
  return t;
}
/** Serie diaria por parámetro (micro: UFC>0 por patógeno · agua: valor por parámetro)
 *  del mes-calendario `monthKey` (todos los módulos). */
function corrDaily(kind, monthKey) {
  const byParamDay = new Map(), labels = new Map();
  const ranges = kind === 'calagua' ? loadCalRanges() : null;
  (store.globalData || []).forEach((r) => {
    const isMic = kind === 'micro';
    if (isMic ? !isMicroRow(r) : !isCalAguaRow(r)) return;
    const c = isMic ? micCtx(r) : calCtx(r);
    if (!c.fecha || isNaN(c.fecha) || yearMonthKey(c.fecha) !== monthKey) return;
    const dk = c.fecha.getFullYear() + '-' + String(c.fecha.getMonth() + 1).padStart(2, '0') + '-' + String(c.fecha.getDate()).padStart(2, '0');
    const items = isMic
      ? micMelt(r).filter((m) => m.ufc > 0).map((m) => ({ key: m.key, label: m.label, value: m.ufc }))
      : calMeasured(r, ranges).filter((m) => m.value != null).map((m) => ({ key: m.key, label: m.label + (m.unit ? ` (${m.unit})` : ''), value: m.value }));
    items.forEach((it) => {
      labels.set(it.key, it.label);
      if (!byParamDay.has(it.key)) byParamDay.set(it.key, new Map());
      const dm = byParamDay.get(it.key); if (!dm.has(dk)) dm.set(dk, []); dm.get(dk).push(it.value);
    });
  });
  return { byParamDay, labels };
}
/** Matriz parámetro × variable-de-marea con el coeficiente de Pearson y los pares diarios.
 *  Memoizada por (identidad del store · tipo · mes): `corrDaily` recorre TODO el store
 *  (decenas de miles de filas) y la matriz se repintaba entera con solo elegir una celda
 *  para ver su dispersión. */
let _corrCache = null;
function corrMatrix(kind, monthKey) {
  if (_corrCache && _corrCache.data === store.globalData && _corrCache.kind === kind && _corrCache.monthKey === monthKey) return _corrCache.out;
  const out = corrMatrixCompute(kind, monthKey);
  _corrCache = { data: store.globalData, kind, monthKey, out };
  return out;
}
function corrMatrixCompute(kind, monthKey) {
  const tideByDay = tideByDayOf(monthKey);
  const daily = corrDaily(kind, monthKey);
  const params = [...daily.byParamDay.keys()].map((k) => ({ key: k, label: daily.labels.get(k) }));
  const cell = new Map();
  params.forEach((p) => {
    const dm = daily.byParamDay.get(p.key);
    TIDE_VARS.forEach((tv) => {
      const pairs = [];
      dm.forEach((vals, dk) => { const t = tideByDay.get(dk); if (!t) return; const tvv = t[tv.key]; if (tvv == null) return; pairs.push([vals.reduce((a, b) => a + b, 0) / vals.length, tvv]); });
      cell.set(p.key + '|' + tv.key, { r: pairs.length >= CORR_MIN_N ? pearson(pairs) : null, n: pairs.length, pairs });
    });
  });
  return { params, cell };
}
function corrColor(r) {
  if (r == null) return 'transparent';
  const a = Math.min(1, Math.abs(r));
  const base = r >= 0 ? '43,123,214' : '224,65,62'; // azul (+) / rojo (−)
  return `rgba(${base},${(0.1 + a * 0.62).toFixed(2)})`;
}
// Valores críticos de t (dos colas, p<0.05) por grados de libertad, para marcar la
// correlación como estadísticamente significativa (asterisco). df>30 → ~1.96.
const T_CRIT_05 = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042 };
/** ¿La correlación r (con N pares) es significativa a p<0.05 (t de Student, dos colas)? */
export function corrSignificant(r, n) {
  if (r == null || n < 3) return false;
  const df = n - 2;
  const rr = Math.min(0.9999999, Math.abs(r));
  if (rr >= 1) return true;
  const t = rr * Math.sqrt(df / (1 - rr * rr));
  return t >= (T_CRIT_05[df] || 1.96);
}
function corrHTML(monthKey, state) {
  const kind = state.corrKind === 'calagua' ? 'calagua' : 'micro';
  const { params, cell } = corrMatrix(kind, monthKey); // todos los módulos
  _corr = { params, cell };
  const kindBtn = (k, lbl) => `<button class="sv-marea-mbtn${kind === k ? ' is-on' : ''}" data-corr-kind="${k}">${lbl}</button>`;
  const bar = `<div class="sv-marea-corr-bar"><div class="sv-marea-months">${kindBtn('micro', '🧫 Microbiología')}${kindBtn('calagua', '💧 Calidad de Agua')}</div></div>`;
  const hint = `<div class="sv-marea-corr-hint muted">Correlación exploratoria entre los parámetros de laboratorio y la marea del día (todos los módulos, emparejados por fecha dentro del mes). Con pocos días de muestreo es referencial; se necesitan ≥ ${CORR_MIN_N} días con dato. <b>*</b> = significativa (p&lt;0.05).</div>`;
  if (!params.length) return bar + hint + `<div class="sv-marea-nodata">Sin parámetros de ${kind === 'micro' ? 'microbiología' : 'calidad de agua'} con datos este mes.</div>`;
  const head = `<tr><th class="sv-marea-corr-rowh">Parámetro \\ Marea</th>${TIDE_VARS.map((tv) => `<th>${esc(tv.label)}</th>`).join('')}</tr>`;
  const body = params.map((p) => {
    const tds = TIDE_VARS.map((tv) => {
      const k = p.key + '|' + tv.key, c = cell.get(k);
      if (!c || c.r == null) return `<td class="sv-marea-corr-cell is-na" title="N=${c ? c.n : 0} (mín ${CORR_MIN_N})">${c && c.n ? 'n' + c.n : '·'}</td>`;
      const sig = corrSignificant(c.r, c.n);
      return `<td class="sv-marea-corr-cell${state.corrCell === k ? ' is-sel' : ''}" data-corr-cell="${esc(k)}" tabindex="0" role="button" style="background:${corrColor(c.r)}" title="r=${c.r.toFixed(2)} · N=${c.n}${sig ? ' · significativa (p<0.05)' : ''} · clic para ver la dispersión">${c.r.toFixed(2)}${sig ? '<span class="sv-marea-corr-sig">*</span>' : ''}</td>`;
    }).join('');
    return `<tr><th class="sv-marea-corr-rowh">${esc(p.label)}</th>${tds}</tr>`;
  }).join('');
  const legend = `<div class="sv-marea-corr-legend"><span>r de Pearson:</span><span class="sv-marea-corr-lg" style="background:rgba(224,65,62,.66)"></span>−1<span class="sv-marea-corr-lg" style="background:rgba(150,150,150,.18)"></span>0<span class="sv-marea-corr-lg" style="background:rgba(43,123,214,.66)"></span>+1<span class="muted"> · "n#" = menos de ${CORR_MIN_N} días · <b>*</b> = significativa (p&lt;0.05)</span></div>`;
  let scatter = '';
  const selKey = state.corrCell && cell.has(state.corrCell) && cell.get(state.corrCell).r != null ? state.corrCell : null;
  if (selKey) {
    const [pk, tk] = selKey.split('|');
    const p = params.find((x) => x.key === pk), tv = TIDE_VARS.find((x) => x.key === tk), c = cell.get(selKey);
    scatter = `<div class="sv-marea-panel sv-marea-corr-scatter">
        <div class="sv-marea-ptitle">Dispersión · ${esc(p ? p.label : pk)} vs ${esc(tv ? tv.label : tk)} <span class="muted">· r=${c.r.toFixed(2)} · R²=${(c.r * c.r).toFixed(2)} · N=${c.n}</span></div>
        <div class="sv-marea-charthost sv-marea-charthost--donut"><canvas id="mareaCorrChart"></canvas></div>
      </div>`;
  } else {
    scatter = '<div class="sv-marea-corr-hint muted" style="margin-top:8px">Clic en una celda con valor para ver la dispersión del par y su recta de tendencia.</div>';
  }
  return bar + hint + `<div class="sv-marea-corr-wrap"><table class="sv-marea-corr"><thead>${head}</thead><tbody>${body}</tbody></table></div>` + legend + scatter;
}
function drawCorrScatter(state) {
  if (!_corr || !state.corrCell) return;
  const c = _corr.cell.get(state.corrCell); if (!c || c.r == null) return;
  const pts = c.pairs.map(([x, y]) => ({ x, y }));
  const n = c.pairs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  c.pairs.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
  const denom = n * sxx - sx * sx;
  const slope = denom ? (n * sxy - sx * sy) / denom : 0, intc = (sy - slope * sx) / n;
  const xs = c.pairs.map((p) => p[0]), xmin = Math.min(...xs), xmax = Math.max(...xs);
  const line = [{ x: xmin, y: slope * xmin + intc }, { x: xmax, y: slope * xmax + intc }];
  const tv = TIDE_VARS.find((x) => x.key === state.corrCell.split('|')[1]);
  makeChart('mareaCorrChart', {
    type: 'scatter',
    data: { datasets: [
      { label: 'Días', data: pts, backgroundColor: PLE, pointRadius: 4, pointHoverRadius: 6 },
      { label: 'Tendencia', type: 'line', data: line, borderColor: AMP, borderWidth: 2, pointRadius: 0, fill: false },
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: 'Parámetro (valor diario)' }, grid: { color: 'rgba(120,144,156,.16)' } }, y: { title: { display: true, text: tv ? tv.label : 'Marea' }, grid: { color: 'rgba(120,144,156,.16)' } } } },
  });
}

/** Render principal del modal de Mareas dentro de `host`. `state` = { mode, key, month }. */
export function renderMareas(host, state) {
  if (!host) return;
  cleanupMareas();
  const days = mareaDays();
  const note = '<div class="sv-marea-inocar">Predicción de mareas de Anconcito · fuente INOCAR</div>';
  if (!days.length) {
    host.innerHTML = '<div class="empty-state" style="padding:40px 20px"><div style="font-size:36px">🌊</div><p class="muted">No hay datos de mareas cargados. Se leen de la hoja <b>Marea</b> del documento.</p></div>' + note;
    return;
  }
  // Meses presentes
  const monthMap = new Map();
  days.forEach((d) => { if (!monthMap.has(d.mkey)) monthMap.set(d.mkey, d.d); });
  const months = [...monthMap.entries()].map(([key, d]) => ({ key, label: MESES[d.getMonth()] + ' ' + d.getFullYear() })).sort((a, b) => a.key.localeCompare(b.key));
  // Resolver día/mes actual (por defecto: hoy si está, si no el más reciente)
  const todayKey = dayKey(new Date());
  let curKey = (state.key && days.some((d) => d.key === state.key)) ? state.key : null;
  if (!curKey && state.month && months.some((m) => m.key === state.month)) {
    const inM = days.filter((d) => d.mkey === state.month);
    curKey = inM.some((d) => d.key === todayKey) ? todayKey : inM[0].key;
  }
  if (!curKey) curKey = days.some((d) => d.key === todayKey) ? todayKey : days[days.length - 1].key;
  const curDay = days.find((d) => d.key === curKey);
  const curMkey = curDay.mkey;
  state.key = curKey; state.month = curMkey;
  const monthDays = days.filter((d) => d.mkey === curMkey);

  const nowMin = (state.mode === 'dia' && isTodayD(curDay.d)) ? (new Date().getHours() * 60 + new Date().getMinutes()) : null;
  let content;
  const curMonthLabel = (months.find((m) => m.key === curMkey) || {}).label || '';
  if (state.mode === 'corr') content = corrHTML(curMkey, state);
  else if (state.mode === 'mes') content = mesHTML(monthDays, curMonthLabel);
  else content = diaHTML(curDay, nowMin);
  host.innerHTML = selBar(months, curMkey, monthDays, curKey, state.mode) + content + note;

  if (state.mode === 'corr') drawCorrScatter(state);
  else if (state.mode === 'mes') { _mes = { monthDays }; drawMareaTrend(monthDays); drawMareaDonut(monthDays); }
  else if (nowMin != null) startTicker(host, state);
}
