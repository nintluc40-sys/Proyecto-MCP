/* ============================================================
   SUPERVISOR · contexto de datos + estadísticas por módulo/tanque
   Portado de la lógica de renderVisitanteView / modStats del original.

   Supervivencia = (población última / población inicial) × 100
   (sumada por tanque dentro del módulo/corrida).
   ============================================================ */
import { store } from '../../core/store.js';
import {
  getField, parseNum, F, isTanqueRow, isLarviculturaRow, hasValidCorrida, hasValidModulo, getLatestStage, dedupeTecnicos, PLG_KEYS, PLGM_KEYS,
} from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { avg } from '../../core/util.js';

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
const isGroupedRow = (r) => /agrupad/i.test(gObs(r));
export const rowsAreGrouped = (rows) => rows.some(isGroupedRow);
// Tanque "descartado": el operador anota "Descartado" en Observaciones. Igual que el
// agrupado, no llega al despacho (su producción se pierde por malos cuidados).
const isDiscardedRow = (r) => /descartad/i.test(gObs(r));
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

  // `allMods` es la fuente del COLOR de acento de cada módulo en SEIS sub-vistas
  // (`colorFor(ctx.allMods.indexOf(mod))` en executive/module/tank/larvia/despacho/omtex).
  // Por eso se deriva de `larvAll` —el universo completo— y NO de `larvWin`: cuando un
  // módulo salía de la ventana, la lista se acortaba y TODOS los índices posteriores se
  // desplazaban, de modo que un mismo módulo cambiaba de color al mover el filtro de
  // fecha o la corrida. Con el universo completo el color es una identidad estable.
  // (`larvAll` ya viene filtrado por hasValidCorrida/hasValidModulo.)
  //
  // El contexto exponía además `pairs` (lista de {corrida, módulo} de la ventana, con su
  // Set y su sort). Nadie la consumía —la Vista Ejecutiva arma la suya desde el calendario
  // de producción— y al dejar de derivar `allMods` de ella quedó sin ningún lector, así
  // que se retiró: era una pasada completa sobre `larvWin` en cada reconstrucción.
  const allMods = [...new Set(larvAll.map(gMod).filter(Boolean))].sort();

  const ctx = { larvCM, tanqCM, larvWin, tanqWin, allCorridas, allMods, vState };
  _ctxCache = { data, corrida: vState.corrida, from: store.dateFrom, to: store.dateTo, ctx };
  return ctx;
}


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
      // La siembra de un tanque solo entra en el DENOMINADOR si ese tanque aporta también
      // al NUMERADOR. Antes se sumaba siempre, así que un tanque cuyas filas quedaban fuera
      // de la ventana de fecha (dejó de registrarse, se descartó pronto…) aportaba su
      // siembra y ninguna población: con un preset de 7/30 días la supervivencia del módulo
      // se desplomaba —medido, 90 % → 45 % con dos tanques— contradiciendo al gráfico que
      // abre ese mismo KPI (moduleSvPopSeries deriva sus tanques de la ventana, así que lo
      // excluye de ambos lados) y a la rejilla, donde el tanque ni siquiera se muestra.
      // Sin filtro de fecha ventana y base coinciden, `last` existe siempre que exista
      // `first`, y el resultado es idéntico al anterior.
      if (last !== null) {
        lastSum = (lastSum || 0) + last;
        if (first !== null) firstSum = (firstSum || 0) + first;
      }
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

// Memo de modStats por IDENTIDAD del ctx. `buildContext` devuelve el mismo objeto
// mientras no cambien datos/corrida/fechas, y uno NUEVO cuando cambian, así que la
// identidad del ctx es una clave de invalidación segura (misma estrategia que el
// memo de core/prodCalendar.js). Motivo: la Vista Ejecutiva llama a modStats una vez
// por tarjeta y repetía el cálculo íntegro en cada navegación de mes — medido, 114 ms
// por pasada con 12 módulos y 16.200 filas, idénticos a los de la pasada anterior.
// WeakMap: al invalidarse el ctx, su bucket se recolecta solo.
//
// ⚠ El objeto devuelto se COMPARTE entre llamadas: tratarlo como INMUTABLE. Hoy ningún
// consumidor lo muta (executive.js copia con .filter antes de tocar tanksData).
const _modStatsMemo = new WeakMap();

/** Estadísticas de un módulo (opcionalmente restringidas a una corrida). Memoizado. */
export function modStats(ctx, mod, corrida) {
  let byKey = _modStatsMemo.get(ctx);
  if (!byKey) { byKey = new Map(); _modStatsMemo.set(ctx, byKey); }
  // JSON.stringify y no concatenación: ('M1','23') y ('M12','3') colisionarían.
  const k = JSON.stringify([mod, corrida || null]);
  if (!byKey.has(k)) byKey.set(k, modStatsCompute(ctx, mod, corrida));
  return byKey.get(k);
}

function modStatsCompute(ctx, mod, corrida) {
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
  // Las filas SIN tanque asignado (gTnq === '') NO entran aquí: `survival` vuelve a
  // filtrar por `gTnq(r) === tq` cuando recibe una lista de tanques, así que incluirlas
  // era inerte (se descartaban acto seguido) y sugería lo contrario al lector. Si algún
  // día deben contar, hay que cambiarlo DENTRO de survival — no ensanchando aquí.
  const tanksData = tanks.map((tq) => {
    const tR = tWin.filter((r) => gTnq(r) === tq);
    const lW = win.filter((r) => gTnq(r) === tq);
    const lB = base.filter((r) => gTnq(r) === tq);
    return {
      tq,
      od: avg(tR.map(gOD).filter((v) => v !== null)),
      tmp: avg(tR.map(gTmp).filter((v) => v !== null)),
      sv: survival(lW, lB, [tq]).sv,
      // Tanque agrupado o descartado: su población cae a 0 por decisión OPERATIVA (se unió
      // a otro tanque o se perdió), no por un problema sanitario. Quien pinte alertas debe
      // excluirlo o marcará una alarma falsa. Se evalúa sobre `lB` (la corrida completa)
      // para que la marca no dependa de la ventana temporal visible.
      outOfDispatch: rowsOutOfDispatch(lB),
    };
  });

  return {
    sv, mort, pop, popFirst, lastDate, tanksData,
    plgManual: lastAvgByTank(win, tanks, PLGM_KEYS), // PL/g (manual) de cosecha (prom. del último por tanque)
    plgLarvia: lastAvgByTank(win, tanks, PLG_KEYS),  // PL/g (LARVIA): Σ del PL/g registrado por tanque ÷ nº de tanques con registro
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
    // Técnicos responsables: se leen de la columna «Técnico» sobre `base` —la corrida
    // completa— y NO sobre la ventana visible. Ser el responsable de un módulo es un hecho
    // de la corrida, no del rango de días que se esté mirando: con `win` la Vista Ejecutiva
    // (que ignora el filtro global) y el KPI del Resumen Operativo (que lo respeta) podían
    // listar técnicos distintos para el mismo módulo con un preset de 7/30 días activo.
    tecnicos: dedupeTecnicos(base.map((r) => getField(r, F.tecnico))),
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
    // Agrupado / descartado: se evalúan sobre `lBase` (la corrida completa) y NO sobre la
    // ventana visible, igual que el `outOfDispatch` de modStats. Con `lWin` la marca
    // dependía del filtro de fecha: si el operador anotó "Agrupado" el día 3 y el supervisor
    // miraba los últimos 7 días, el chip desaparecía de la tarjeta y del banner mientras la
    // Vista Ejecutiva SÍ seguía excluyendo el tanque del recuento de alertas — dos lecturas
    // distintas del mismo hecho en la misma pantalla.
    grouped: rowsAreGrouped(lBase),
    discarded: rowsAreDiscarded(lBase),
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
