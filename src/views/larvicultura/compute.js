/* ============================================================
   LARVICULTURA · cómputo de series, último estado e ICL
   ICL (Índice de Calidad Larvaria) = 100 − promedio ponderado
   de las variables (mayor ICL = mejor).
   ============================================================ */
import { store } from '../../core/store.js';
import { avg as mean } from '../../core/util.js';
import { getField, parseNum, F, isLarviculturaRow, isTanqueRow } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';

const naturalCmp = (a, b) => {
  const ra = String(a).match(/\d+/), rb = String(b).match(/\d+/);
  if (ra && rb && +ra[0] !== +rb[0]) return +ra[0] - +rb[0];
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
};

/** Construye el conjunto filtrado y los selectores en cascada.
 *  `monthCorridas` (opcional) acota TODO el conjunto a las corridas de un mes
 *  (barra de mes, alineada con Supervisor); si se omite, ve todo el historial. */
export function buildLarviculturaData(state, vars, monthCorridas) {
  let all = store.globalData.filter(isLarviculturaRow);
  if (monthCorridas && monthCorridas.length) {
    const set = new Set(monthCorridas);
    all = all.filter((r) => set.has(getField(r, F.corrida)));
  }

  // 1) Corrida — filtro primario (es lo que cambia; el módulo es fijo)
  const corridas = [...new Set(all.map((r) => getField(r, F.corrida)).filter(Boolean))].sort(naturalCmp);
  if (state.corrida && !corridas.includes(state.corrida)) state.corrida = null;

  // 2) Módulo — depende de la corrida elegida
  const byCorr = all.filter((r) => !state.corrida || getField(r, F.corrida) === state.corrida);
  const modulos = [...new Set(byCorr.map((r) => getField(r, F.modulo)).filter(Boolean))].sort(naturalCmp);
  if (state.modulo && !modulos.includes(state.modulo)) state.modulo = null;

  // 3) Tanque — depende de corrida + módulo
  const byMod = byCorr.filter((r) => !state.modulo || getField(r, F.modulo) === state.modulo);

  // Auto-corrida: si el módulo elegido tiene UNA sola corrida en el mes, la fija
  // (así las sub-gráficas por tanque se muestran sin pedir corrida aparte).
  if (state.modulo && !state.corrida) {
    const modCorr = [...new Set(byMod.map((r) => getField(r, F.corrida)).filter(Boolean))];
    if (modCorr.length === 1) state.corrida = modCorr[0];
  }

  const tanques = [...new Set(byMod.map((r) => getField(r, F.tanque)).filter(Boolean))].sort(naturalCmp);
  if (state.tanque && !tanques.includes(state.tanque)) state.tanque = null;

  const rows = byMod.filter((r) => !state.tanque || getField(r, F.tanque) === state.tanque)
    .sort((a, b) => (parseAnyDate(getField(a, F.fecha)) || new Date(0)) - (parseAnyDate(getField(b, F.fecha)) || new Date(0)));

  // byCor = conjunto de la corrida+módulo (todos los tanques) para ranking/modales
  return { modulos, corridas, tanques, rows, byCor: byMod, vars };
}

/* ---- Fisicoquímicos del módulo (T° / OD / Salinidad) ----
   Bandas de referencia (ajustables). Por cada variable se usan los registros de
   Larvicultura si los tiene; si no, los de Tomas (hojas Control_Tanque). */
const ENV_VARS = [
  { key: 'tmp', label: 'Temperatura', short: 'T°', icon: '🌡️', unit: '°C', keys: F.temp, band: [31, 33], color: '#F4511E', axis: 'y' },
  { key: 'od', label: 'Oxígeno disuelto', short: 'OD', icon: '💧', unit: ' mg/L', keys: F.od, band: [5, 7], color: '#1E88E5', axis: 'y1' },
  // Salinidad: informativa (no marca alerta ni cuenta para el nivel del módulo).
  { key: 'sal', label: 'Salinidad', short: 'Sal', icon: '🧂', unit: ' ppt', keys: F.salinidad, band: [28, 36], color: '#00838F', axis: 'y', informational: true },
];

/** Promedios y tendencia diaria de T°/OD/Salinidad del módulo (opcionalmente de una corrida). */
export function moduleEnv(modulo, corrida, monthCorridas) {
  if (!modulo) return null;
  // Sin corrida específica se acota a las corridas del MES visible (coherente con el
  // resto de la vista, que es mensual); si no, el KPI de Fisicoquímicos promediaría
  // TODO el historial del módulo. Con `corrida` fija, esa manda.
  const monthSet = (monthCorridas && monthCorridas.length) ? new Set(monthCorridas) : null;
  const inScope = (r) => getField(r, F.modulo) === modulo
    && (corrida ? getField(r, F.corrida) === corrida : (!monthSet || monthSet.has(getField(r, F.corrida))));
  const larv = store.globalData.filter((r) => isLarviculturaRow(r) && inScope(r));
  const tnq = store.globalData.filter((r) => isTanqueRow(r) && inScope(r));
  const vars = ENV_VARS.map((cfg) => {
    const hasLarv = larv.some((r) => parseNum(r, cfg.keys) !== null);
    const src = hasLarv ? larv : tnq;
    const srcName = hasLarv ? 'Larvicultura' : (tnq.some((r) => parseNum(r, cfg.keys) !== null) ? 'Tomas' : null);
    const byDay = new Map();
    src.forEach((r) => { const f = getField(r, F.fecha); const v = parseNum(r, cfg.keys); if (!f || v === null) return; (byDay.get(f) || byDay.set(f, []).get(f)).push(v); });
    const days = [...byDay.keys()].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
    const series = days.map((d) => { const a = byDay.get(d); return a.reduce((x, y) => x + y, 0) / a.length; });
    const avg = mean(series);
    const last = series.length ? series[series.length - 1] : null;
    const status = cfg.informational
      ? (last === null ? 'sin' : 'info')
      : last === null ? 'sin' : (last >= cfg.band[0] && last <= cfg.band[1]) ? 'ok' : 'out';
    return { ...cfg, days, series, avg, last, srcName, status };
  });
  if (!vars.some((v) => v.last !== null)) return null;
  const out = vars.filter((v) => v.status === 'out').length;
  return { vars, out, level: out >= 1 ? 'rojo' : 'verde' };
}

/** Filtra filas a los últimos `days` días relativos a la fecha MÁS reciente
 *  presente en el conjunto. days=null/0 → sin recorte (devuelve las mismas filas).
 *  Con ventana activa, las filas SIN fecha parseable se excluyen (no pertenecen a
 *  ningún "últimos N días"); si NINGUNA fila tiene fecha, se devuelven todas. */
export function windowRows(rows, days) {
  if (!days || !rows.length) return rows;
  let maxMs = 0;
  rows.forEach((r) => { const dt = parseAnyDate(getField(r, F.fecha)); if (dt) maxMs = Math.max(maxMs, dt.getTime()); });
  if (!maxMs) return rows;
  const cutoff = maxMs - (days - 1) * 86400000;
  return rows.filter((r) => { const dt = parseAnyDate(getField(r, F.fecha)); return dt != null && dt.getTime() >= cutoff; });
}

/** KPIs de tendencia: último valor + valor previo de ICL, Supervivencia y Score
 *  compuesto (0.7·ICL + 0.3·Superv). En los tres, mayor = mejor. */
export function buildTrendKpis(daily, rows, vars) {
  const iclDaily = daily.map((d) => iclOf(d, vars));
  const survByDay = {};
  rows.forEach((r) => {
    const f = getField(r, F.fecha); if (!f) return;
    const s = parseNum(r, F.supervivencia);
    if (s !== null) (survByDay[f] ||= []).push(s);
  });
  const survDaily = daily.map((d) => {
    const a = survByDay[d.fecha];
    return a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  });
  const scoreDaily = daily.map((_, i) => compositeScore(iclDaily[i], survDaily[i]));
  const lastTwo = (arr) => {
    let cur = null, prev = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = arr[i];
      if (v === null || v === undefined || isNaN(v)) continue;
      if (cur === null) cur = v; else { prev = v; break; }
    }
    return { cur, prev };
  };
  return { icl: lastTwo(iclDaily), surv: lastTwo(survDaily), score: lastTwo(scoreDaily) };
}

/** Serie diaria: promedio de cada variable por fecha (ordenada cronológicamente).
 *  Ordena por fecha internamente → robusto aunque las filas no vengan ordenadas
 *  (p. ej. byCor multi-módulo o el resumen por corrida). */
export function dailySeries(rows, vars) {
  // Agrupa las filas por fecha en UNA sola pasada (antes: un rows.filter() por cada
  // fecha → O(días×filas)). Misma salida: fechas en orden cronológico + promedios.
  const byDate = new Map();
  rows.forEach((r) => {
    const f = getField(r, F.fecha);
    if (!f) return;
    const bucket = byDate.get(f);
    if (bucket) bucket.push(r); else byDate.set(f, [r]);
  });
  const fechas = [...byDate.keys()].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  return fechas.map((f) => {
    const dRows = byDate.get(f);
    const rec = { fecha: f };
    vars.forEach((v) => {
      const vals = dRows.map((r) => parseNum(r, v.keys)).filter((x) => x !== null);
      rec[v.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    return rec;
  });
}

/** Último valor no nulo por variable. */
export function lastState(daily, vars) {
  if (!daily.length) return null;
  const last = { fecha: daily[daily.length - 1].fecha };
  vars.forEach((v) => {
    let found = null;
    for (let i = daily.length - 1; i >= 0; i--) {
      if (daily[i][v.key] !== null && daily[i][v.key] !== undefined) { found = daily[i][v.key]; break; }
    }
    last[v.key] = found;
  });
  return last;
}

/** ICL a partir de un registro (último o diario). null si sin datos. */
export function iclOf(rec, vars) {
  if (!rec) return null;
  let sum = 0, wsum = 0, any = false;
  vars.forEach((v) => {
    if (rec[v.key] !== null && rec[v.key] !== undefined) { sum += rec[v.key] * v.peso; wsum += v.peso; any = true; }
  });
  return (any && wsum > 0) ? 100 - sum / wsum : null;
}

/** Score compuesto = 70% ICL + 30% Supervivencia (mayor = mejor).
 *  Si falta una de las dos, devuelve la disponible; null si faltan ambas.
 *  Fuente única de la fórmula (reutilizada por KPIs de tendencia, lollipop y comparador de corridas). */
export function compositeScore(icl, surv) {
  const hasIcl = icl !== null && icl !== undefined;
  const hasSv = surv !== null && surv !== undefined;
  if (hasIcl && hasSv) return 0.7 * icl + 0.3 * Math.min(surv, 100);
  if (hasIcl) return icl;
  if (hasSv) return surv;
  return null;
}

/** Score crudo (promedio ponderado, menor = mejor) para colorear estado. */
export function scoreOf(rec, vars) {
  if (!rec) return null;
  let sum = 0, wsum = 0, any = false;
  vars.forEach((v) => {
    if (rec[v.key] !== null && rec[v.key] !== undefined) { sum += rec[v.key] * v.peso; wsum += v.peso; any = true; }
  });
  return (any && wsum > 0) ? sum / wsum : null;
}
