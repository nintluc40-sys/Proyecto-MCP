/* ============================================================
   REGISTROS · Maduración · "Registro reproductivo" — CAPA DE DATOS PURA
   Trazabilidad de hembras reproductoras por Trovan ID. Funciones PURAS (sin DOM
   ni store): reciben la matriz actual ya normalizada y devuelven los payloads de
   upsert para el sync del motor + un reporte de lo procesado/omitido.

   Arquitectura (decidida con el usuario, 2026-07-11):
   · MATRIZ  → estado ACTUAL por individuo (clave upsert = Trovan ID).
   · BITÁCORA → 1 fila por evento desove/mortalidad (clave = Trovan+Fecha+Tipo → idempotente).
   · TRANSFERENCIAS → 1 fila por (TR-ID × Trovan) movido (clave = TR-ID+Trovan).
   El GAS fusiona por columna (celda vacía = conserva lo existente), así que un evento
   marca solo sus columnas sin borrar los campos permanentes de la matriz.
   ============================================================ */
import { sanitizeStr } from './security.js';

/* ── Esquema de las 3 hojas (cabecera EXACTA + claves de upsert) ── */
export const REPRO_MATRIZ_SHEET = 'Maduración MATRIZ';
export const REPRO_MATRIZ_HEADERS = [
  'Número', 'Trovan ID', 'Color anillo', 'Piscina', 'Código genético', 'Lote',
  'Sala actual', 'Tanque actual', 'Estado', 'Fecha muerte', 'Fecha ingreso', 'Observaciones',
];
export const REPRO_MATRIZ_KEYCOLS = [1]; // Trovan ID

export const REPRO_BITACORA_SHEET = 'Maduración Bitácora';
export const REPRO_BITACORA_HEADERS = ['Trovan ID', 'Fecha', 'Tipo', 'Sala', 'Tanque', 'Observaciones'];
export const REPRO_BITACORA_KEYCOLS = [0, 1, 2]; // Trovan + Fecha + Tipo

export const REPRO_TRANSFER_SHEET = 'Maduración Transferencias';
export const REPRO_TRANSFER_HEADERS = [
  'TR-ID', 'Fecha', 'Tipo', 'Trovan ID', 'Sala origen', 'Tanque origen', 'Sala destino', 'Tanque destino',
  'Mezcla', 'Lotes presentes', 'Códigos presentes', 'Piscinas presentes', 'Observaciones',
];
export const REPRO_TRANSFER_KEYCOLS = [0, 3]; // TR-ID + Trovan

/* ── Enumeraciones ── */
export const REPRO_ESTADO = { VIVO: 'Vivo', MUERTO: 'Muerto' };
export const REPRO_EVENTO = { DESOVE: 'Desove', MORTALIDAD: 'Mortalidad' };
export const REPRO_TRANSFER_TIPO = { TRASLADO: 'Traslado', MEZCLA: 'Mezcla' };

/* ── Normalización / parseo ── */
/** Normaliza un Trovan ID: string, sin espacios, saneado (anti-inyección de fórmula). */
export function normTrovan(s) {
  return sanitizeStr(String(s == null ? '' : s)).replace(/\s+/g, '');
}

/** Parsea el bloque de texto pegado por el usuario (uno por línea, o separados por
 *  coma/punto y coma/espacios). Deduplica preservando el orden y reporta duplicados. */
export function parseTrovanList(text) {
  const seen = new Set(); const ids = []; const duplicates = [];
  String(text == null ? '' : text).split(/[\s,;]+/).forEach((tok) => {
    const id = normTrovan(tok);
    if (!id) return;
    if (seen.has(id)) { duplicates.push(id); return; }
    seen.add(id); ids.push(id);
  });
  return { ids, duplicates };
}

/* ── Índice de la matriz (para lookups O(1)) ── */
/** Adapta una fila cruda de la hoja MATRIZ (objeto con cabeceras) al registro normalizado. */
export function matrixRecordFromSheet(o) {
  o = o || {};
  return {
    numero: o['Número'], trovan: normTrovan(o['Trovan ID']),
    color: o['Color anillo'], piscina: o['Piscina'], codigo: o['Código genético'], lote: o['Lote'],
    sala: o['Sala actual'], tanque: o['Tanque actual'], estado: o['Estado'],
    fechaMuerte: o['Fecha muerte'], fechaIngreso: o['Fecha ingreso'],
  };
}
/** Índice Trovan → registro normalizado (la 1.ª aparición gana). */
export function buildMatrixIndex(records) {
  const m = new Map();
  (records || []).forEach((r) => { const id = normTrovan(r && r.trovan); if (id && !m.has(id)) m.set(id, r); });
  return m;
}

/* ── Utilidades internas ── */
// Arma una fila (array del ancho de la hoja) desde un objeto con claves = cabecera.
function rowFromObj(headers, obj) {
  return headers.map((h) => { const v = obj[h]; return v == null ? '' : v; });
}
/** Payload de sync con la forma que consume el motor (upsert por keyCols en el GAS). */
export function syncPayload(sheetName, headers, keyCols, rows) {
  return { sheetName, headers, rows, keyCols };
}

/* ── Sección 1 · Alta de individuo (masiva, tipo grilla Excel) ── */
/** Alta MASIVA: recibe un array de formularios (filas de la grilla, tipo Excel) y arma UN
 *  payload de MATRIZ con todas las hembras nuevas (Estado=Vivo, ubicación=ingreso).
 *  Omite filas vacías; reporta filas con datos pero sin Trovan (sinTrovan), Trovan repetidos
 *  dentro del lote (duplicados) y —si hay matriz— los que ya existen (existentes). */
export function buildAltaBatch(forms, matrixIndex) {
  const report = { created: [], sinTrovan: 0, duplicados: [], existentes: [] };
  const seen = new Set(); const rows = [];
  const OTHER = ['numero', 'color', 'piscina', 'codigo', 'lote', 'sala', 'tanque'];
  (forms || []).forEach((form) => {
    form = form || {};
    const trovan = normTrovan(form.trovan);
    const hasData = trovan || OTHER.some((k) => String(form[k] == null ? '' : form[k]).trim());
    if (!hasData) return;                          // fila totalmente vacía → se ignora
    if (!trovan) { report.sinTrovan++; return; }   // tiene datos pero le falta el Trovan
    if (seen.has(trovan)) { report.duplicados.push(trovan); return; }
    if (matrixIndex && matrixIndex.has(trovan)) { report.existentes.push(trovan); return; }
    seen.add(trovan);
    rows.push(rowFromObj(REPRO_MATRIZ_HEADERS, {
      'Número': sanitizeStr(form.numero),
      'Trovan ID': trovan,
      'Color anillo': sanitizeStr(form.color),
      'Piscina': sanitizeStr(form.piscina),
      'Código genético': sanitizeStr(form.codigo),
      'Lote': sanitizeStr(form.lote),
      'Sala actual': sanitizeStr(form.sala),
      'Tanque actual': sanitizeStr(form.tanque),
      'Estado': REPRO_ESTADO.VIVO,
      'Fecha ingreso': sanitizeStr(form.fecha),
      'Observaciones': sanitizeStr(form.obs),
    }));
    report.created.push(trovan);
  });
  return { report, payload: rows.length ? syncPayload(REPRO_MATRIZ_SHEET, REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, rows) : null };
}

/* ── Sección 2 · Desoves / Mortalidades ── */
/** Procesa un lote de Trovan para un evento (desove|mortalidad) en una fecha. Añade a la
 *  BITÁCORA (con foto de ubicación cuando hay matriz) y, en mortalidad, marca Estado/Fecha
 *  muerte en la MATRIZ. Reporta no encontrados y hembras ya muertas.
 *  `matrixIndex` es OPCIONAL: si se pasa, valida (un no-encontrado se reporta y omite; un
 *  desove de una muerta se omite); si NO se pasa, procesa todos los Trovan sin validar
 *  (el engine aún no lee la MATRIZ — la validación llega cuando se cargue). */
export function buildEventBatch({ ids, fecha, tipo, matrixIndex } = {}) {
  const report = { total: 0, processed: [], notFound: [], alreadyDead: [] };
  const okTipo = (tipo === REPRO_EVENTO.DESOVE || tipo === REPRO_EVENTO.MORTALIDAD);
  if (!fecha) return { report, bitacora: null, matriz: null, error: 'Falta la fecha.' };
  if (!okTipo) return { report, bitacora: null, matriz: null, error: 'Tipo de evento inválido.' };
  const fx = sanitizeStr(fecha);
  const bitRows = []; const matRows = [];
  (ids || []).forEach((raw) => {
    const id = normTrovan(raw); if (!id) return;
    report.total++;
    const rec = matrixIndex ? matrixIndex.get(id) : null;
    if (matrixIndex && !rec) { report.notFound.push(id); return; } // solo valida si hay matriz
    const dead = !!(rec && rec.estado === REPRO_ESTADO.MUERTO);
    if (tipo === REPRO_EVENTO.DESOVE && dead) { report.alreadyDead.push(id); return; } // muerta no desova
    bitRows.push(rowFromObj(REPRO_BITACORA_HEADERS, {
      'Trovan ID': id, 'Fecha': fx, 'Tipo': tipo,
      'Sala': sanitizeStr(rec ? rec.sala : ''), 'Tanque': sanitizeStr(rec ? rec.tanque : ''),
    }));
    if (tipo === REPRO_EVENTO.MORTALIDAD) {
      if (dead) report.alreadyDead.push(id); // informativo; el re-registro es idempotente
      matRows.push(rowFromObj(REPRO_MATRIZ_HEADERS, { 'Trovan ID': id, 'Estado': REPRO_ESTADO.MUERTO, 'Fecha muerte': fx }));
    }
    report.processed.push(id);
  });
  return {
    report,
    bitacora: bitRows.length ? syncPayload(REPRO_BITACORA_SHEET, REPRO_BITACORA_HEADERS, REPRO_BITACORA_KEYCOLS, bitRows) : null,
    matriz: matRows.length ? syncPayload(REPRO_MATRIZ_SHEET, REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, matRows) : null,
  };
}

/* ── Sección 3 · Transferencias ── */
/** Siguiente ID de movimiento a partir de los TR-ID existentes (máx + 1 → TR-000NNN). */
export function nextTrId(existingIds) {
  let max = 0;
  (existingIds || []).forEach((s) => { const m = /TR-(\d+)/i.exec(String(s == null ? '' : s)); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return 'TR-' + String(max + 1).padStart(6, '0');
}

/** Procesa una transferencia por UBICACIÓN actual: por cada destino (con su lista de Trovan)
 *  reubica en la MATRIZ (Sala/Tanque actual) y escribe una fila en TRANSFERENCIAS (ledger por
 *  TR-ID×Trovan). En mezcla, guarda la composición del destino.
 *  `matrixIndex` es OPCIONAL: si se pasa, verifica que cada individuo exista (notFound) y esté
 *  en el origen declarado (wrongLocation), omitiendo los que no; si NO se pasa, mueve todos los
 *  Trovan de cada destino sin validar (el engine aún no lee la MATRIZ). */
export function buildTransferBatch({ fecha, tipo, origen, destinos, composicion, matrixIndex, trId } = {}) {
  const report = { moved: [], notFound: [], wrongLocation: [] };
  if (!fecha) return { report, matriz: null, transfer: null, error: 'Falta la fecha.' };
  const fx = sanitizeStr(fecha);
  const org = { sala: sanitizeStr(origen && origen.sala), tanque: sanitizeStr(origen && origen.tanque) };
  const comp = composicion || {};
  const mezcla = tipo === REPRO_TRANSFER_TIPO.MEZCLA;
  const tp = mezcla ? REPRO_TRANSFER_TIPO.MEZCLA : REPRO_TRANSFER_TIPO.TRASLADO;
  const matRows = []; const trRows = [];
  (destinos || []).forEach((dest) => {
    dest = dest || {};
    const dSala = sanitizeStr(dest.sala), dTanque = sanitizeStr(dest.tanque);
    (dest.ids || []).forEach((raw) => {
      const id = normTrovan(raw); if (!id) return;
      const rec = matrixIndex ? matrixIndex.get(id) : null;
      if (matrixIndex && !rec) { report.notFound.push(id); return; } // solo valida si hay matriz
      if (matrixIndex && rec && ((org.sala && String(rec.sala) !== org.sala) || (org.tanque && String(rec.tanque) !== org.tanque))) {
        report.wrongLocation.push(id); return; // no está en el origen declarado → se omite
      }
      matRows.push(rowFromObj(REPRO_MATRIZ_HEADERS, { 'Trovan ID': id, 'Sala actual': dSala, 'Tanque actual': dTanque }));
      trRows.push(rowFromObj(REPRO_TRANSFER_HEADERS, {
        'TR-ID': trId, 'Fecha': fx, 'Tipo': tp, 'Trovan ID': id,
        'Sala origen': org.sala, 'Tanque origen': org.tanque,
        'Sala destino': dSala, 'Tanque destino': dTanque,
        'Mezcla': mezcla ? 'Sí' : 'No',
        'Lotes presentes': mezcla ? sanitizeStr(comp.lotes) : '',
        'Códigos presentes': mezcla ? sanitizeStr(comp.codigos) : '',
        'Piscinas presentes': mezcla ? sanitizeStr(comp.piscinas) : '',
        'Observaciones': sanitizeStr(comp.obs),
      }));
      report.moved.push(id);
    });
  });
  return {
    report, trId,
    matriz: matRows.length ? syncPayload(REPRO_MATRIZ_SHEET, REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, matRows) : null,
    transfer: trRows.length ? syncPayload(REPRO_TRANSFER_SHEET, REPRO_TRANSFER_HEADERS, REPRO_TRANSFER_KEYCOLS, trRows) : null,
  };
}

/* ── Tanda 5 · Consulta / reportes (operan sobre filas leídas del Sheet: objetos con
   claves de cabecera, tal como los entrega el store del dashboard o una lectura GAS) ── */

/** Índice de matriz (Trovan → registro normalizado) desde filas crudas de la hoja MATRIZ. */
export function matrixIndexFromRows(rows) {
  return buildMatrixIndex((rows || []).map(matrixRecordFromSheet));
}

/** Pivota la BITÁCORA a la matriz ancha de DESOVES: filas = Trovan, columnas = fechas,
 *  celda = 1 si desovó ese día (solo Tipo='Desove'). Fechas asc, Trovan asc. */
export function pivotDesoves(bitacoraRows) {
  const dateSet = new Set(); const byTrovan = new Map();
  (bitacoraRows || []).forEach((r) => {
    if (String(r['Tipo']) !== REPRO_EVENTO.DESOVE) return;
    const id = normTrovan(r['Trovan ID']); const f = sanitizeStr(r['Fecha']);
    if (!id || !f) return;
    dateSet.add(f);
    if (!byTrovan.has(id)) byTrovan.set(id, new Set());
    byTrovan.get(id).add(f);
  });
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const dates = [...dateSet].sort(cmp);
  const rows = [...byTrovan.entries()].sort((a, b) => cmp(a[0], b[0])).map(([trovan, set]) => ({
    trovan, total: set.size,
    byDate: dates.reduce((o, d) => { o[d] = set.has(d) ? 1 : ''; return o; }, {}),
  }));
  return { dates, rows };
}

/** Historial de movimientos de un Trovan desde el ledger de TRANSFERENCIAS (orden por
 *  TR-ID) + ubicación actual (último destino registrado). */
export function individualTrace(transferRows, trovan) {
  const id = normTrovan(trovan);
  const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  const movimientos = (transferRows || []).filter((r) => normTrovan(r['Trovan ID']) === id).map((r) => ({
    trId: r['TR-ID'], fecha: r['Fecha'], tipo: r['Tipo'],
    salaOrigen: r['Sala origen'], tanqueOrigen: r['Tanque origen'],
    salaDestino: r['Sala destino'], tanqueDestino: r['Tanque destino'], mezcla: r['Mezcla'],
  })).sort((a, b) => cmp(a.trId, b.trId));
  const last = movimientos.length ? movimientos[movimientos.length - 1] : null;
  const current = last ? { sala: last.salaDestino, tanque: last.tanqueDestino } : null;
  return { trovan: id, movimientos, current };
}

/** Resumen de la MATRIZ: total, vivas, muertas y conteo por ubicación (Sala · Tanque). */
export function matrixSummary(matrixRows) {
  let total = 0, vivas = 0, muertas = 0; const byUbic = new Map();
  (matrixRows || []).forEach((r) => {
    const rec = matrixRecordFromSheet(r); if (!rec.trovan) return;
    total++;
    if (rec.estado === REPRO_ESTADO.MUERTO) muertas++; else vivas++;
    const key = (rec.sala || '—') + ' · ' + (rec.tanque || '—');
    byUbic.set(key, (byUbic.get(key) || 0) + 1);
  });
  return { total, vivas, muertas, ubicaciones: [...byUbic.entries()].map(([k, n]) => ({ ubicacion: k, n })).sort((a, b) => b.n - a.n) };
}

/** Siguiente TR-ID reconciliado con el ledger real (máx de la columna TR-ID + 1). */
export function nextTrIdFromRows(transferRows) {
  return nextTrId((transferRows || []).map((r) => r['TR-ID']));
}
