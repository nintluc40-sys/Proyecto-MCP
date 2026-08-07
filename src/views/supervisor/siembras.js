/* ============================================================
   SUPERVISOR · Cuadro de Siembras y Cosecha (capa pura, sin DOM)
   Agrupa los tanques de un módulo+corrida en SIEMBRAS y deriva por
   tanque la población sembrada, el transferido, el PL/g y la
   supervivencia. Alimenta el modal que se abre desde el KPI Técnico.

   Reglas (decisión del usuario 2026-08-05):
     · Siembra  = tanques cuyo PRIMER registro en estadío N5 cae en la
       MISMA fecha (1ª/2ª/3ª por fecha ascendente). Sin N5 → se agrupa
       por la fecha del primer registro con población (no se pierde).
     · Sembrado = población del primer registro N5 (fallback: primera
       población real registrada del tanque).
     · Transferido = ÚLTIMA población registrada que NO sea la del DESPACHO
       (`isDespachoRow`, el criterio único de core/prodCalendar.js) ni la de la
       propia siembra. Antes se tomaba la PENÚLTIMA población, que solo acierta
       cuando la fila de despacho ya existe y es la última: mientras el módulo no
       ha despachado retrocedía un registro de más y, como entre PL6 y PL11 no se
       vuelve a registrar población, podía mostrar una lectura de semanas antes.
       Sin ninguna lectura posterior a la siembra el tanque está "en proceso".
     · PL/g y Estadío del Bloque B salen de la MISMA línea del transferido
       (PL/g biométrico LARVIA).
     · Superv.   = Transferido ÷ Sembrado × 100 (tope 100). Es la supervivencia
       REAL hasta la transferencia: NO la mueve la merma.
     · Superv. proy. = Superv. × (1 − merma): la que se espera al cosechar. Es la
       que sí responde al selector de merma, junto al Proyectado y al A cosechar.
     · Proyectado (por tanque) = Transferido × (1 − merma): la población que se
       espera cosechar de ese tanque. Suma exactamente al "A cosechar" del subtotal.
     · A cosechar = Σ Transferido − merma (10% por defecto, seleccionable 6–15%).
       El denominador
       de la supervivencia del subtotal usa SOLO los tanques que ya tienen
       transferido (los "en proceso" suman al Sembrado, no a la superv.).

   Todo es solo lectura sobre las filas ya cargadas: no escribe en Sheets
   ni añade persistencia.
   ============================================================ */
import { getField, parseNum, F, PLG_KEYS } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
// Criterio ÚNICO de "fila de despacho" del sistema: el mismo que usan el badge
// «Despachado» de la Vista Ejecutiva, la vista Despacho y el subtotal de Producción
// Omarsa. Tener aquí una copia propia solo garantizaría que algún día divergieran.
import { isDespachoRow } from '../../core/prodCalendar.js';

const MERMA_DEFAULT = 0.10; // merma de cosecha (10%): "a cosechar" = Σ transferido × (1 − merma)

const gStage = (r) => String(getField(r, F.estadio) || '').toUpperCase().replace(/\s+/g, '');
const isN5 = (r) => gStage(r) === 'N5';
// Población: honra el 0 real (tanque vaciado/agrupado); descarta vacío/negativo.
const gPop = (r) => { const v = parseNum(r, F.poblacion); return v !== null && v >= 0 ? v : null; };
const gDateMs = (r) => { const d = parseAnyDate(getField(r, F.fecha)); return d && !isNaN(d) ? d.getTime() : null; };
const tankNum = (s) => { const m = String(s).match(/\d+/); return m ? +m[0] : 0; };
// Clave de día (local) para agrupar por fecha de siembra ignorando la hora.
const dayKey = (ms) => {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Deriva la ficha de un tanque (sembrado, transferido, PL/g, estadío, superv). */
function tankInfo(rows) {
  const sorted = rows.slice().sort((a, b) => (gDateMs(a) ?? 0) - (gDateMs(b) ?? 0));
  // Registro de siembra: primer N5 (con población si la hay); si no hay N5, primer registro.
  const sieRow = sorted.find((r) => isN5(r) && gPop(r) !== null)
    || sorted.find((r) => isN5(r))
    || null;
  const popRows = sorted.filter((r) => gPop(r) !== null);
  const siembra = (sieRow && gPop(sieRow) !== null) ? gPop(sieRow)
    : (popRows.length ? gPop(popRows[0]) : null);
  const sieDateMs = sieRow ? gDateMs(sieRow) : (popRows.length ? gDateMs(popRows[0]) : null);

  // Transferido = ÚLTIMA lectura de población que no sea la del despacho ni la de la
  // siembra. Excluir la siembra evita que un tanque recién sembrado (su único registro
  // es el N5) muestre un transferido igual al sembrado y una supervivencia del 100 %.
  const baseRow = (sieRow && gPop(sieRow) !== null) ? sieRow : (popRows[0] || null);
  const transCandidates = popRows.filter((r) => r !== baseRow && !isDespachoRow(r));
  const transRow = transCandidates.length ? transCandidates[transCandidates.length - 1] : null;
  const transferido = transRow ? gPop(transRow) : null;
  const plg = transRow ? parseNum(transRow, PLG_KEYS) : null;
  const estadio = transRow ? getField(transRow, F.estadio)
    : (popRows.length ? getField(popRows[popRows.length - 1], F.estadio) : '');
  const superv = (transferido !== null && siembra && siembra > 0)
    ? Math.min((transferido / siembra) * 100, 100) : null;
  const lote = getField(sieRow || sorted[0] || {}, F.lote);

  return { siembra, sieDateMs, transferido, plg, estadio, superv, lote, enProceso: transRow === null };
}

/** Supervivencia proyectada: la real descontada la merma. Se deriva de `superv` en vez de
 *  recalcularla desde el proyectado para que herede su tope del 100 % y para que las dos
 *  columnas no puedan desalinearse (proy = real × (1 − merma) exactamente). */
function supervProyOf(superv, merma) {
  return superv === null ? null : superv * (1 - merma);
}

/** Subtotal de un conjunto de fichas de tanque (por siembra o por módulo). */
function rollup(tankList, merma) {
  let sembrado = 0, hasSembrado = false;      // Σ población sembrada (TODOS los tanques)
  let transferido = 0, hasTransferido = false; // Σ transferido (solo tanques con transferido)
  let sembradoBase = 0;                        // Σ sembrado de los tanques CON transferido (denom. superv.)
  tankList.forEach((t) => {
    if (t.siembra !== null) { sembrado += t.siembra; hasSembrado = true; }
    if (t.transferido !== null) {
      transferido += t.transferido; hasTransferido = true;
      if (t.siembra !== null && t.siembra > 0) sembradoBase += t.siembra;
    }
  });
  const aCosechar = hasTransferido ? transferido * (1 - merma) : null;
  const superv = (hasTransferido && sembradoBase > 0) ? Math.min((transferido / sembradoBase) * 100, 100) : null;
  return {
    sembrado: hasSembrado ? sembrado : null,
    transferido: hasTransferido ? transferido : null,
    aCosechar, superv,
    supervProy: supervProyOf(superv, merma),
  };
}

/**
 * Construye el cuadro de siembras de un módulo+corrida a partir de sus filas
 * de Larvicultura. PURA: no toca el DOM ni el store.
 * @param {object[]} rows  filas de Larvicultura ya filtradas por módulo (+corrida)
 * @param {object}  [opts] { merma } — fracción de merma de cosecha (def. 0.10)
 * @returns {{siembras:object[], total:object, nTanks:number, nSiembras:number, merma:number}}
 */
export function computeSiembras(rows, opts = {}) {
  const merma = (opts.merma != null && isFinite(opts.merma)) ? opts.merma : MERMA_DEFAULT;

  // Filas por tanque.
  const byTank = new Map();
  (rows || []).forEach((r) => {
    const tq = getField(r, F.tanque);
    if (!tq) return;
    if (!byTank.has(tq)) byTank.set(tq, []);
    byTank.get(tq).push(r);
  });

  // Ficha por tanque + población PROYECTADA desde el transferido: lo que se espera
  // cosechar de ese tanque al descontar la merma elegida. Vive aquí (capa pura) para
  // que el subtotal "A cosechar" y la columna por tanque salgan de la MISMA regla.
  const tanks = [];
  byTank.forEach((rs, tq) => {
    const info = tankInfo(rs);
    tanks.push({
      tq, ...info,
      proyectado: info.transferido !== null ? info.transferido * (1 - merma) : null,
      supervProy: supervProyOf(info.superv, merma),
    });
  });

  // Agrupar por fecha de siembra (día del N5).
  const groups = new Map(); // dayKey -> { dateMs, tanks: [] }
  tanks.forEach((t) => {
    const k = dayKey(t.sieDateMs);
    if (!groups.has(k)) groups.set(k, { dateMs: t.sieDateMs, tanks: [] });
    groups.get(k).tanks.push(t);
  });

  // Ordenar siembras por fecha (las sin fecha, al final) y numerar 1ª/2ª/3ª.
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.dateMs == null) return 1;
    if (b.dateMs == null) return -1;
    return a.dateMs - b.dateMs;
  });

  const siembras = ordered.map((g, i) => {
    const tks = g.tanks.slice().sort((a, b) => tankNum(a.tq) - tankNum(b.tq) || String(a.tq).localeCompare(String(b.tq)));
    const lotes = [...new Set(tks.map((t) => t.lote).filter(Boolean))];
    return {
      idx: i + 1,
      dateMs: g.dateMs,
      lotes,
      tanks: tks,
      subtotal: rollup(tks, merma),
    };
  });

  return {
    siembras,
    total: rollup(tanks, merma),
    nTanks: tanks.length,
    nSiembras: siembras.length,
    merma,
  };
}

/**
 * Total agregado de VARIOS módulos de la misma corrida (fila «Total de la corrida»).
 *
 * ⚠ No se puede pasar las filas de todos los módulos juntas a `computeSiembras`: esa
 * función indexa los tanques por NOMBRE (`byTank`), así que el «TQ1» del módulo 6 y el
 * «TQ1» del 7 se fundirían en un solo tanque y tanto el sembrado como el transferido
 * saldrían mal. Por eso se calcula cada módulo por separado y se agregan sus FICHAS DE
 * TANQUE ya derivadas.
 *
 * La suma se hace con el MISMO `rollup` que produce el total de cada módulo, de modo que
 * la fila de corrida no puede desalinearse con las de arriba. En particular la
 * supervivencia se RECALCULA sobre la base agregada (Σ transferido ÷ Σ sembrado de los
 * tanques que ya transfirieron): NO es el promedio de las supervivencias de los módulos,
 * que solo coincidiría si ambos sembraran exactamente lo mismo.
 *
 * Una única `merma` gobierna todo el resultado —módulos y total—, así que el desglose
 * siempre suma al total mostrado.
 *
 * @param {{mod:string, rows:object[]}[]} byModule  filas de Larvicultura de cada módulo
 *        de la corrida (incluido el módulo que se está viendo)
 * @param {object} [opts] { merma }
 * @returns {{modules:object[], total:object, nTanks:number, merma:number}}
 */
export function computeCorridaSiembras(byModule, opts = {}) {
  const merma = (opts.merma != null && isFinite(opts.merma)) ? opts.merma : MERMA_DEFAULT;
  const perMod = (byModule || []).map(({ mod, rows }) => ({
    mod,
    data: computeSiembras(rows, { merma }),
  }));
  // Fichas de tanque de todos los módulos, ya derivadas y sin colisión de nombres.
  const tanks = perMod.flatMap((p) => p.data.siembras.flatMap((s) => s.tanks));
  return {
    modules: perMod.map((p) => ({ mod: p.mod, total: p.data.total, nTanks: p.data.nTanks })),
    total: rollup(tanks, merma),
    nTanks: tanks.length,
    merma,
  };
}
