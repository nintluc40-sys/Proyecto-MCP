/* ============================================================
   SUPERVISOR · Tabla "Producción Omarsa" (Vista Ejecutiva)
   Resumen mensual (mes INTERNO = rango contiguo de corridas) por
   módulo, agrupado por corrida (1–2 módulos por corrida).

   Cada métrica se agrega SUMANDO por tanque de ese módulo+corrida:
     · Siembra  = Σ primera población registrada de cada tanque
     · Cosecha  = Σ última población registrada de cada tanque
     · PL/g (manual) = promedio del último PL/g manual de cada tanque
     · Supervivencia = Σ última pob. / Σ primera pob. × 100
   A nivel corrida: Total = Σ cosecha de sus módulos; % Superv corrida
   = total final / total inicial × 100.

   Mes interno definido por su corrida inicial (editar MESES_PROD).
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { fmtPop } from './ui.js';
import { esc } from '../../core/format.js';

// ▼▼ EDITAR AQUÍ al iniciar un mes nuevo: añade { label, desde: <corrida inicial> } ▼▼
// (la corrida inicial es la de los módulos 6-7; el mes cierra con la de los módulos 9-10).
const MESES_PROD = [
  { label: 'Enero',   desde: 544 },
  { label: 'Febrero', desde: 549 },
  { label: 'Marzo',   desde: 555 },
  { label: 'Abril',   desde: 561 },
  { label: 'Mayo',    desde: 567 },
  { label: 'Junio',   desde: 573 },
];

const PLGM_KEYS = ['Plg (manual)', 'PLG (manual)', 'plg (manual)', 'Plg(manual)', 'PL/g (manual)', 'pl/g (manual)'];

// Auto-extensión de meses: a partir del último mes definido en MESES_PROD, los
// meses siguientes se generan automáticamente cada MONTH_SPAN corridas (patrón
// observado: +6). Así un mes nuevo (p. ej. Julio = 579) NO cae dentro del anterior
// sin tener que editar MESES_PROD. Si el patrón cambia, basta fijar el mes en MESES_PROD.
const MONTH_SPAN = 6;
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const larvRows = () => store.globalData.filter(isLarviculturaRow);
const distinct = (a) => [...new Set(a.filter(Boolean))];
const natCmp = (a, b) => { const x = String(a).match(/\d+/), y = String(b).match(/\d+/); return (x && y && +x[0] !== +y[0]) ? +x[0] - +y[0] : String(a).localeCompare(String(b)); };
const fmt1 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
const pct = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1) + '%';

export function monthIndexOfCorrida(num) {
  if (isNaN(num)) return -1;
  let idx = -1;
  for (let i = 0; i < MESES_PROD.length; i++) if (num >= MESES_PROD[i].desde) idx = i;
  if (idx < 0) return -1;
  // Más allá del último mes definido → meses virtuales cada MONTH_SPAN corridas.
  if (idx === MESES_PROD.length - 1) {
    const extra = Math.floor((num - MESES_PROD[idx].desde) / MONTH_SPAN);
    if (extra > 0) return idx + extra;
  }
  return idx;
}

/** Índices de meses (en MESES_PROD) con datos, de viejo a reciente. */
export function presentMonths() {
  const present = new Set();
  larvRows().forEach((r) => { const n = +getField(r, F.corrida); if (!isNaN(n)) { const i = monthIndexOfCorrida(n); if (i >= 0) present.add(i); } });
  return [...present].sort((a, b) => a - b);
}

/** Corridas (con datos) del mes, ordenadas ascendente. */
export function corridasOfMonth(mIdx) {
  const set = new Set();
  larvRows().forEach((r) => { const c = getField(r, F.corrida), n = +c; if (!isNaN(n) && monthIndexOfCorrida(n) === mIdx) set.add(c); });
  return [...set].sort((a, b) => (+a) - (+b));
}

/** Módulos (con datos) de una corrida, en orden natural. */
export function modulesOfCorrida(cor) {
  return distinct(larvRows().filter((r) => getField(r, F.corrida) === cor).map((r) => getField(r, F.modulo))).sort(natCmp);
}

/** Etiqueta del mes. Para meses virtuales (auto-extensión) continúa la secuencia
 *  de nombres desde el último mes definido (Junio → Julio → … → Diciembre → Enero). */
export function monthLabelAt(mIdx) {
  if (MESES_PROD[mIdx]) return MESES_PROD[mIdx].label;
  const lastIdx = MESES_PROD.length - 1;
  const lastNameIdx = MONTH_NAMES.indexOf(MESES_PROD[lastIdx].label);
  if (lastNameIdx < 0 || mIdx < 0) return `Mes ${mIdx + 1}`;
  return MONTH_NAMES[(lastNameIdx + (mIdx - lastIdx)) % 12];
}

/** Agrega por tanque la siembra/cosecha/PL-g/supervivencia de un módulo+corrida. */
export function modCorStats(mod, cor) {
  const rsAll = larvRows().filter((r) => getField(r, F.modulo) === mod && getField(r, F.corrida) === cor);
  const tanks = distinct(rsAll.map((r) => getField(r, F.tanque)));
  let firstSum = 0, lastSum = 0, hasFirst = false, hasLast = false; const plgs = [];
  tanks.forEach((tq) => {
    const rs = rsAll.filter((r) => getField(r, F.tanque) === tq)
      .sort((a, b) => (parseAnyDate(getField(a, F.fecha)) || 0) - (parseAnyDate(getField(b, F.fecha)) || 0));
    let first = null, last = null, plg = null;
    rs.forEach((r) => { const p = parseNum(r, F.poblacion); if (p !== null && p > 0) { if (first === null) first = p; last = p; } });
    for (let i = rs.length - 1; i >= 0; i--) { const v = parseNum(rs[i], PLGM_KEYS); if (v !== null && v > 0) { plg = v; break; } }
    if (first !== null) { firstSum += first; hasFirst = true; }
    if (last !== null) { lastSum += last; hasLast = true; }
    if (plg !== null) plgs.push(plg);
  });
  const siembra = hasFirst ? firstSum : null;
  const cosecha = hasLast ? lastSum : null;
  const plg = plgs.length ? plgs.reduce((a, b) => a + b, 0) / plgs.length : null;
  const superv = (siembra && cosecha && siembra > 0) ? Math.min(cosecha / siembra * 100, 100) : null;
  return { siembra, cosecha, plg, superv };
}

/** HTML de la tabla del mes en posición `pos` (incluye navegación). */
export function prodTableHTML(months, pos) {
  const mIdx = months[pos];
  const label = monthLabelAt(mIdx);
  const corridas = corridasOfMonth(mIdx);

  let body = '', sumSie = 0, sumCos = 0; const plgs = [];
  corridas.forEach((cor) => {
    const mods = modulesOfCorrida(cor);
    const stats = mods.map((m) => ({ m, ...modCorStats(m, cor) }));
    const corCos = stats.reduce((a, s) => a + (s.cosecha || 0), 0);
    const corSie = stats.reduce((a, s) => a + (s.siembra || 0), 0);
    const corSup = corSie > 0 ? Math.min(corCos / corSie * 100, 100) : null;
    stats.forEach((s, j) => {
      if (s.siembra) sumSie += s.siembra;
      if (s.cosecha) sumCos += s.cosecha;
      if (s.plg !== null) plgs.push(s.plg);
      body += `<tr>
        <td><b>${esc(s.m)}</b></td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-cor">${esc(cor)}</td>` : ''}
        <td>${fmtPop(s.siembra)}</td>
        <td>${fmt1(s.plg)}</td>
        <td>${fmtPop(s.cosecha)}</td>
        <td>${pct(s.superv)}</td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-tot"><b>${fmtPop(corCos || null)}</b></td>` : ''}
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-tot">${corSup === null ? '—' : '<b>' + pct(corSup) + '</b>'}</td>` : ''}
      </tr>`;
    });
  });
  const plgAvg = plgs.length ? plgs.reduce((a, b) => a + b, 0) / plgs.length : null;
  const monthSup = sumSie > 0 ? Math.min(sumCos / sumSie * 100, 100) : null;
  const totalRow = `<tr class="prod-total">
      <td colspan="2">Total ${esc(label)}</td>
      <td>${fmtPop(sumSie || null)}</td>
      <td>${fmt1(plgAvg)}</td>
      <td>${fmtPop(sumCos || null)}</td>
      <td>${pct(monthSup)}</td>
      <td>—</td><td>—</td>
    </tr>`;

  const slider = months.length > 1
    ? `<input type="range" class="prod-slider" data-prodslider min="0" max="${months.length - 1}" value="${pos}" step="1">`
    : '';

  return `<div class="prod-card card">
    <div class="prod-nav">
      <button class="prod-nav-btn" data-prodprev ${pos <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
      <div class="prod-title">🏭 Producción Omarsa · <b>${esc(label)}</b> <span class="muted">(corridas ${corridas.length ? esc(corridas[0]) + '–' + esc(corridas[corridas.length - 1]) : '—'})</span></div>
      <button class="prod-nav-btn" data-prodnext ${pos >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
    </div>
    ${slider}
    <div style="overflow:auto;margin-top:10px">
      <table class="sv-table prod-table">
        <thead><tr><th>Módulo</th><th>Corrida</th><th>Siembra</th><th>PL/g (manual)</th><th>Cosecha</th><th>Superv.</th><th>Total del módulo</th><th>% Superv. corrida</th></tr></thead>
        <tbody>${body || `<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">Sin datos para este mes.</td></tr>`}${totalRow}</tbody>
      </table>
    </div>
  </div>`;
}
