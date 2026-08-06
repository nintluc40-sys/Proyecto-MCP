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
     · Cosecha    = ÚLTIMA población registrada del tanque.
       Transferido = PENÚLTIMA (la de justo antes de la cosecha).
       Con <2 poblaciones el tanque está "en proceso" (sin transferido).
     · PL/g y Estadío del Bloque B salen de la MISMA línea del transferido
       (PL/g biométrico LARVIA).
     · Superv.   = Transferido ÷ Sembrado × 100 (tope 100).
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

  // Cosecha = última población; Transferido = penúltima.
  const transRow = popRows.length >= 2 ? popRows[popRows.length - 2] : null;
  const transferido = transRow ? gPop(transRow) : null;
  const plg = transRow ? parseNum(transRow, PLG_KEYS) : null;
  const estadio = transRow ? getField(transRow, F.estadio)
    : (popRows.length ? getField(popRows[popRows.length - 1], F.estadio) : '');
  const superv = (transferido !== null && siembra && siembra > 0)
    ? Math.min((transferido / siembra) * 100, 100) : null;
  const lote = getField(sieRow || sorted[0] || {}, F.lote);

  return { siembra, sieDateMs, transferido, plg, estadio, superv, lote, enProceso: transRow === null };
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
    tanks.push({ tq, ...info, proyectado: info.transferido !== null ? info.transferido * (1 - merma) : null });
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
