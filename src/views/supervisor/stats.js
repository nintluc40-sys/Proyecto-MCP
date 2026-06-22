/* ============================================================
   SUPERVISOR · contexto de datos + estadísticas por módulo/tanque
   Portado de la lógica de renderVisitanteView / modStats del original.

   Supervivencia = (población última / población inicial) × 100
   (sumada por tanque dentro del módulo/corrida).
   ============================================================ */
import { store } from '../../core/store.js';
import {
  getField, parseNum, F, isTanqueRow, isLarviculturaRow, hasValidCorrida, hasValidModulo, getLatestStage, dedupeTecnicos,
} from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { PLGM_KEYS } from './columns.js';

const gMod = (r) => getField(r, F.modulo);
const gTnq = (r) => getField(r, F.tanque);
const gCor = (r) => getField(r, F.corrida);
const gFec = (r) => getField(r, F.fecha);
// Población: un 0 registrado es un valor REAL (tanque vacío / agrupado), no "sin
// dato". Sólo se descarta la celda vacía/no numérica (parseNum → null) o un
// negativo imposible. Así los bucles de "última población" honran el 0 y dejan de
// arrastrar el valor del día anterior.
const gPop = (r) => { const v = parseNum(r, F.poblacion); return v !== null && v >= 0 ? v : null; };
// Detección de tanque "agrupado": el operador anota la palabra "Agrupado" en
// Observaciones cuando un tanque se une a otro (su pob./SV quedan en 0, pero su
// siembra inicial sigue contando en los totales del módulo).
const OBS_KEYS = ['Observaciones', 'observaciones', 'Observación', 'observación'];
const gObs = (r) => getField(r, OBS_KEYS);
export const isGroupedRow = (r) => /agrupad/i.test(gObs(r));
export const rowsAreGrouped = (rows) => rows.some(isGroupedRow);
// Tanque "descartado": el operador anota "Descartado" en Observaciones. Igual que el
// agrupado, no llega al despacho (su producción se pierde por malos cuidados).
export const isDiscardedRow = (r) => /descartad/i.test(gObs(r));
export const rowsAreDiscarded = (rows) => rows.some(isDiscardedRow);
// Tanque que NO llegará al despacho (agrupado o descartado).
export const rowsOutOfDispatch = (rows) => rowsAreGrouped(rows) || rowsAreDiscarded(rows);
const gOD = (r) => parseNum(r, F.od);
const gTmp = (r) => parseNum(r, F.temp);
const gIL = (r) => { const v = parseNum(r, ['Intestino_Lleno', 'IntestinoLleno', 'intestino_lleno']); return v !== null && v > 0 ? v : null; };
const gLip = (r) => { const v = parseNum(r, ['Lípidos', 'Lipidos', 'lipidos']); return v !== null && v > 0 ? v : null; };
const gSal = (r) => parseNum(r, F.salinidad);
// % del módulo (manejo de agua / actividad). 0 es un valor válido (no se filtra >0).
const gAct = (r) => parseNum(r, ['% Actividad', 'Actividad', '%Actividad']);
const gEsp = (r) => parseNum(r, ['% Espuma', 'Espuma', 'espuma']);
const gSuc = (r) => parseNum(r, ['% Suciedad', 'Suciedad', 'suciedad']);

export const getters = { gMod, gTnq, gCor, gFec, gPop, gOD, gTmp, gIL, gLip, gSal };

const byDate = (arr) => [...arr].sort((a, b) =>
  (parseAnyDate(gFec(a)) || new Date(0)) - (parseAnyDate(gFec(b)) || new Date(0)));

const inGlobalDate = (r) => {
  const { dateFrom, dateTo } = store;
  if (!dateFrom && !dateTo) return true;
  const d = parseAnyDate(gFec(r));
  if (!d || isNaN(d)) return true;
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
};

// Memo de 1 entrada: buildContext recorre TODO el dataset y se invoca en cada
// render (incluida la navegación interna módulo↔tanque, que no cambia los datos).
// `store.globalData` se reemplaza por una nueva referencia al refrescar (ver
// core/refresh.js), así que basta comparar por identidad + corrida + filtro de
// fecha para invalidar de forma segura.
let _ctxCache = null;

/**
 * Construye el contexto compartido por todas las sub-vistas.
 * `larvCM`/`tanqCM` → filtrados por corrida+mes (línea base poblacional).
 * `larvWin`/`tanqWin` → además por el filtro de fecha global (ventana visible).
 */
export function buildContext(vState) {
  const data = store.globalData;
  if (_ctxCache && _ctxCache.data === data && _ctxCache.corrida === vState.corrida
      && _ctxCache.from === store.dateFrom && _ctxCache.to === store.dateTo) {
    return _ctxCache.ctx;
  }
  // Sólo filas de Larvicultura (evita contaminación de Registro_Supervisión,
  // Lab_Algas o Maduración que también tienen Corrida/Módulo).
  const larvAll = data.filter((r) => isLarviculturaRow(r) && hasValidCorrida(r) && hasValidModulo(r));
  const tanqAll = data.filter((r) => isTanqueRow(r));

  const allCorridas = [...new Set(larvAll.map(gCor).filter(Boolean))].sort();
  if (vState.corrida && !allCorridas.includes(vState.corrida)) vState.corrida = null;

  const cmFilter = (r) => (!vState.corrida || gCor(r) === vState.corrida);

  const larvCM = larvAll.filter(cmFilter);
  const tanqCM = tanqAll.filter(cmFilter);
  const larvWin = larvCM.filter(inGlobalDate);
  const tanqWin = tanqCM.filter(inGlobalDate);

  // Pares corrida|módulo presentes
  const pairs = [];
  const seen = new Set();
  larvWin.forEach((r) => {
    const cor = gCor(r), mod = gMod(r);
    if (!cor || !mod) return;
    const k = cor + '|' + mod;
    if (!seen.has(k)) { seen.add(k); pairs.push({ corrida: cor, mod }); }
  });
  pairs.sort((a, b) => a.corrida.localeCompare(b.corrida) || a.mod.localeCompare(b.mod));
  const allMods = [...new Set(pairs.map((p) => p.mod))].sort();

  const ctx = { larvCM, tanqCM, larvWin, tanqWin, allCorridas, pairs, allMods, vState };
  _ctxCache = { data, corrida: vState.corrida, from: store.dateFrom, to: store.dateTo, ctx };
  return ctx;
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/** Días transcurridos del proceso = span (primera→última fecha con registro) + 1.
 *  Refleja la edad real aunque haya días sin muestreo. */
function dateSpanDays(rows) {
  let min = null, max = null;
  rows.forEach((r) => { const d = parseAnyDate(gFec(r)); if (!d || isNaN(d)) return; if (min === null || d < min) min = d; if (max === null || d > max) max = d; });
  if (min === null) return 0;
  return Math.round((max - min) / 86400000) + 1;
}

/** Supervivencia sumando última/primera población por tanque. */
function survival(winRows, baseRows, tanks) {
  let lastSum = null, firstSum = null;
  if (tanks.length) {
    tanks.forEach((tq) => {
      const win = byDate(winRows.filter((r) => gTnq(r) === tq));
      const base = byDate(baseRows.filter((r) => gTnq(r) === tq));
      let last = null; for (let i = win.length - 1; i >= 0; i--) { const v = gPop(win[i]); if (v !== null) { last = v; break; } }
      let first = null; for (let i = 0; i < base.length; i++) { const v = gPop(base[i]); if (v !== null) { first = v; break; } }
      if (last !== null) lastSum = (lastSum || 0) + last;
      if (first !== null) firstSum = (firstSum || 0) + first;
    });
  } else if (baseRows.length) {
    const win = byDate(winRows), base = byDate(baseRows);
    for (let i = win.length - 1; i >= 0; i--) { const v = gPop(win[i]); if (v !== null) { lastSum = v; break; } }
    for (let i = 0; i < base.length; i++) { const v = gPop(base[i]); if (v !== null) { firstSum = v; break; } }
  }
  const sv = (lastSum !== null && firstSum !== null && firstSum > 0) ? Math.min((lastSum / firstSum) * 100, 100) : null;
  return { sv, mort: sv !== null ? Math.max(100 - sv, 0) : null, pop: lastSum, popFirst: firstSum };
}

/** Promedia el último valor (>0) registrado por tanque para `keys`. */
function lastAvgByTank(winRows, tanks, keys) {
  const lasts = [];
  const pool = tanks.length ? tanks : [null];
  pool.forEach((tq) => {
    const rws = byDate(tq ? winRows.filter((r) => gTnq(r) === tq) : winRows);
    for (let i = rws.length - 1; i >= 0; i--) {
      const v = parseNum(rws[i], keys);
      if (v !== null && v > 0) { lasts.push(v); break; }
    }
  });
  return lasts.length ? avg(lasts) : null;
}

/** Estadísticas de un módulo (opcionalmente restringidas a una corrida). */
export function modStats(ctx, mod, corrida) {
  const cf = (r) => gMod(r) === mod && (!corrida || gCor(r) === corrida);
  const win = ctx.larvWin.filter(cf);
  const base = ctx.larvCM.filter(cf);
  const tWin = ctx.tanqWin.filter(cf);

  const tanks = [...new Set(base.map(gTnq).filter(Boolean))];
  const { sv, mort, pop, popFirst } = survival(win, base, tanks);

  // Frescura: fecha más reciente con dato (larvicultura o tanque).
  let lastDate = null;
  [...win, ...tWin].forEach((r) => { const d = parseAnyDate(gFec(r)); if (d && !isNaN(d) && (lastDate === null || d > lastDate)) lastDate = d; });

  // Resumen por tanque (OD/Temp/SV) para detectar tanques en alerta.
  const tanksData = tanks.map((tq) => {
    const tR = tWin.filter((r) => gTnq(r) === tq);
    const lW = win.filter((r) => gTnq(r) === tq || gTnq(r) === '');
    const lB = base.filter((r) => gTnq(r) === tq || gTnq(r) === '');
    return {
      tq,
      od: avg(tR.map(gOD).filter((v) => v !== null)),
      tmp: avg(tR.map(gTmp).filter((v) => v !== null)),
      sv: survival(lW, lB, [tq]).sv,
    };
  });

  return {
    sv, mort, pop, popFirst, lastDate, tanksData,
    plgManual: lastAvgByTank(win, tanks, PLGM_KEYS), // PL/g (manual) de cosecha (prom. del último por tanque)
    estadio: getLatestStage(win),
    od: avg(tWin.map(gOD).filter((v) => v !== null)),
    tmp: avg(tWin.map(gTmp).filter((v) => v !== null)),
    il: avg(win.map(gIL).filter((v) => v !== null)),
    lip: avg(win.map(gLip).filter((v) => v !== null)),
    act: avg(win.map(gAct).filter((v) => v !== null)),
    esp: avg(win.map(gEsp).filter((v) => v !== null)),
    suc: avg(win.map(gSuc).filter((v) => v !== null)),
    sal: avg([...win, ...tWin].map(gSal).filter((v) => v !== null)),
    corridas: [...new Set(win.map(gCor).filter(Boolean))].length,
    lotes: [...new Set(win.map((r) => getField(r, F.lote)).filter(Boolean))],
    dias: dateSpanDays(win), // días transcurridos (span 1ª→última fecha + 1)
    tecnicos: dedupeTecnicos(win.map((r) => getField(r, F.tecnico))),
  };
}

/** Estadísticas de un tanque concreto. */
export function tankStats(ctx, mod, tq, corrida) {
  const cf = (r) => gMod(r) === mod && (!corrida || gCor(r) === corrida);
  const tWin = ctx.tanqWin.filter((r) => cf(r) && gTnq(r) === tq);
  const lWin = ctx.larvWin.filter((r) => cf(r) && (gTnq(r) === tq || gTnq(r) === ''));
  const lBase = ctx.larvCM.filter((r) => cf(r) && (gTnq(r) === tq || gTnq(r) === ''));

  const { sv, mort, pop, popFirst } = survival(lWin, lBase, [tq]);
  return {
    sv, mort, pop, popFirst,
    grouped: rowsAreGrouped(lWin), // tanque agrupado (palabra "Agrupado" en Observaciones)
    estadio: getLatestStage(lWin),
    od: avg(tWin.map(gOD).filter((v) => v !== null)),
    tmp: avg(tWin.map(gTmp).filter((v) => v !== null)),
    // Promedio (coherente con OD/Temp del mismo banner y con la Salinidad del módulo).
    sal: avg([...tWin, ...lWin].map(gSal).filter((v) => v !== null)),
    corridas: [...new Set(lWin.map(gCor).filter(Boolean))],
    lotes: [...new Set(lWin.map((r) => getField(r, F.lote)).filter(Boolean))],
    tRows: tWin, lRows: lWin,
  };
}

/** Lista natural de tanques de un módulo. */
export function tanksOf(ctx, mod, corrida) {
  const cf = (r) => gMod(r) === mod && (!corrida || gCor(r) === corrida);
  const names = new Set();
  ctx.larvWin.filter(cf).forEach((r) => { const t = gTnq(r); if (t) names.add(t); });
  ctx.tanqWin.filter(cf).forEach((r) => { const t = gTnq(r); if (t) names.add(t); });
  const num = (s) => { const m = String(s).match(/\d+/); return m ? +m[0] : 0; };
  return [...names].sort((a, b) => num(a) - num(b) || String(a).localeCompare(String(b)));
}
