/* ============================================================
   SUPERVISOR · series y estimaciones a nivel MÓDULO (para los KPIs con gráfico
   y el "Resumen del día" del Resumen Operativo). Funciones puras sobre `ctx`.
   ============================================================ */
import { getField, F, getLatestStage } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { STAGE_ORDER } from '../../config.js';
import { getters } from './stats.js';
import { STD_HRS, normHr } from './tank.js';
import { avg } from '../../core/util.js';

const { gMod, gTnq, gCor, gFec, gPop, gOD, gTmp } = getters;
const gHora = (r) => getField(r, F.hora);

const modLarv = (ctx, mod, cor) => ctx.larvWin.filter((r) => gMod(r) === mod && (!cor || gCor(r) === cor));
const modTanq = (ctx, mod, cor) => ctx.tanqWin.filter((r) => gMod(r) === mod && (!cor || gCor(r) === cor));

/** Tendencia por fecha de Supervivencia y Población TOTAL del módulo.
 *  SV(fecha) = Σ última pob ≤ fecha de cada tanque / Σ primera pob × 100 (misma
 *  fórmula que la etiqueta de supervivencia). pop(fecha) = ese numerador. */
export function moduleSvPopSeries(ctx, mod, corrida) {
  const rows = modLarv(ctx, mod, corrida);
  const tanks = [...new Set(rows.map(gTnq).filter(Boolean))];
  const dates = [...new Set(rows.map(gFec).filter(Boolean))]
    .filter((f) => parseAnyDate(f))
    .sort((a, b) => parseAnyDate(a) - parseAnyDate(b));
  const perTank = {};
  tanks.forEach((tq) => {
    perTank[tq] = rows.filter((r) => gTnq(r) === tq)
      .map((r) => ({ t: parseAnyDate(gFec(r)), p: gPop(r) }))
      .filter((x) => x.t && x.p !== null && x.p > 0)
      .sort((a, b) => a.t - b.t);
  });
  // Línea base = SIEMBRA de la corrida (primera pob. >0 en larvCM, sin filtro de
  // fecha), igual que el KPI del banner (survival() usa larvCM como base). Si sólo
  // se derivara de la ventana visible, un filtro de fecha que excluya la siembra
  // inflaría la SV (≈100% al inicio) y contradiría el KPI. Fallback a la ventana
  // cuando no hay larvCM (p. ej. tests que sólo pasan larvWin).
  const baseRows = ctx.larvCM
    ? ctx.larvCM.filter((r) => gMod(r) === mod && (!corrida || gCor(r) === corrida))
    : rows;
  const firstOf = (tq) => {
    let first = null, firstT = null;
    baseRows.forEach((r) => {
      if (gTnq(r) !== tq) return;
      const t = parseAnyDate(gFec(r)), p = gPop(r);
      if (t && p !== null && p > 0 && (firstT === null || t < firstT)) { firstT = t; first = p; }
    });
    return first || 0;
  };
  const totalFirst = tanks.reduce((acc, tq) => acc + firstOf(tq), 0);
  const labels = [], sv = [], pop = [];
  dates.forEach((d) => {
    const dt = parseAnyDate(d);
    let total = 0, any = false;
    tanks.forEach((tq) => {
      const seq = perTank[tq];
      for (let i = seq.length - 1; i >= 0; i--) { if (seq[i].t <= dt) { total += seq[i].p; any = true; break; } }
    });
    labels.push(d);
    pop.push(any ? total : null);
    sv.push(any && totalFirst > 0 ? Math.min((total / totalFirst) * 100, 100) : null);
  });
  // `base` = siembra total del módulo (Σ primera pob. por tanque); permite derivar las
  // bajas acumuladas (base − pob. del día) en el "Resumen del día" sin recalcular.
  return { labels, sv, pop, base: totalFirst };
}

/** Fechas con tomas horarias (Control_Tanque) del módulo. */
export function moduleHourlyDates(ctx, mod, corrida) {
  return [...new Set(modTanq(ctx, mod, corrida).map(gFec).filter(Boolean))]
    .filter((f) => parseAnyDate(f))
    .sort((a, b) => parseAnyDate(a) - parseAnyDate(b));
}

/** Perfil de 12 tomas (cada 2 h) del módulo para una fecha: promedio entre tanques. */
export function moduleHourly(ctx, mod, corrida, getVal, date) {
  const rows = modTanq(ctx, mod, corrida).filter((r) => gFec(r) === date);
  return STD_HRS.map((std) => {
    const vals = rows.filter((r) => normHr(gHora(r)) === std).map(getVal).filter((v) => v !== null);
    return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
  });
}

/** KPIs del módulo para un día concreto (para el modal "Resumen del día").
 *  `series` (opcional) evita recalcular moduleSvPopSeries en cada cambio de fecha. */
export function moduleDayKpis(ctx, mod, corrida, date, series) {
  const { labels, sv, pop } = series || moduleSvPopSeries(ctx, mod, corrida);
  const i = labels.indexOf(date);
  const svV = i >= 0 ? sv[i] : null;
  const tRows = modTanq(ctx, mod, corrida).filter((r) => gFec(r) === date);
  const dt = parseAnyDate(date);
  const lUpto = modLarv(ctx, mod, corrida).filter((r) => { const t = parseAnyDate(gFec(r)); return t && t <= dt; });
  return {
    sv: svV,
    mort: svV !== null ? Math.max(100 - svV, 0) : null,
    pop: i >= 0 ? pop[i] : null,
    od: avg(tRows.map(gOD).filter((v) => v !== null)),
    tmp: avg(tRows.map(gTmp).filter((v) => v !== null)),
    estadio: getLatestStage(lUpto),
  };
}

/** OD y Temperatura PROMEDIO por tanque para un día (promedia las tomas horarias de
 *  Control_Tanque). Base para el desglose de alertas por tanque del "Resumen del día".
 *  Ordenado por tanque (orden natural). Solo tanques con alguna lectura ese día. */
export function moduleDayTankReadings(ctx, mod, corrida, date) {
  const rows = modTanq(ctx, mod, corrida).filter((r) => gFec(r) === date);
  const byTank = new Map();
  rows.forEach((r) => {
    const tq = gTnq(r);
    if (!tq) return;
    if (!byTank.has(tq)) byTank.set(tq, { tq, od: [], tmp: [] });
    const od = gOD(r), tmp = gTmp(r);
    if (od !== null) byTank.get(tq).od.push(od);
    if (tmp !== null) byTank.get(tq).tmp.push(tmp);
  });
  return [...byTank.values()]
    .map((t) => ({ tq: t.tq, od: avg(t.od), tmp: avg(t.tmp) }))
    .sort((a, b) => String(a.tq).localeCompare(String(b.tq), undefined, { numeric: true }));
}

/** Estimación de días a cosecha (estadío objetivo, por defecto PL11) según el
 *  ritmo de avance de estadío del módulo. null si no hay datos suficientes. */
export function cosechaEstimate(ctx, mod, corrida, target = 'PL11') {
  const rows = modLarv(ctx, mod, corrida);
  const idxOf = (e) => STAGE_ORDER.indexOf(String(e || '').toUpperCase().trim());
  const byDay = {};
  rows.forEach((r) => {
    const d = parseAnyDate(getField(r, F.fecha)); const i = idxOf(getField(r, F.estadio));
    if (d && !isNaN(d) && i >= 0) { const k = d.getTime(); byDay[k] = Math.max(byDay[k] ?? -1, i); }
  });
  const keys = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  if (keys.length < 2) return null;
  const tgt = idxOf(target);
  if (tgt < 0) return null;
  const curIdx = byDay[keys[keys.length - 1]];
  if (curIdx >= tgt) return { days: 0, reached: true };
  const dIdx = curIdx - byDay[keys[0]];
  const dDays = (keys[keys.length - 1] - keys[0]) / 86400000;
  if (dIdx <= 0 || dDays <= 0) return null;
  return { days: Math.max(1, Math.round((tgt - curIdx) / (dIdx / dDays))), reached: false };
}
