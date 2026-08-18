/* ============================================================
   CAMPOS — acceso tolerante a variantes de cabecera del Sheet
   Portado de _getField / _isTanqueRow / tieneCorrida·Modulo /
   getLatestStage / autoCalcMortalidad del original.
   ============================================================ */
import { parseAnyDate } from './dates.js';
import { STAGE_ORDER } from '../config.js';

/** Devuelve el primer valor no vacío entre las variantes de nombre dadas. */
export function getField(row, names) {
  if (!row) return '';
  for (let i = 0; i < names.length; i++) {
    const v = row[names[i]];
    if (v !== undefined && v !== null && v !== '') {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

/** parseFloat tolerante (%, coma decimal). null si no es número. */
export function parseNum(row, names) {
  const v = getField(row, names);
  if (v === '') return null;
  const n = parseFloat(String(v).replace(/%/g, '').replace(/,/g, '.').trim());
  return isNaN(n) ? null : n;
}

// Atajos de campos frecuentes
export const F = {
  fecha:   ['Fecha', 'fecha'],
  hora:    ['Hora', 'hora'],
  modulo:  ['Módulo', 'Modulo', 'módulo', 'modulo', 'MODULO'],
  corrida: ['Corrida', 'corrida', 'CORRIDA'],
  tanque:  ['Tanque', 'tanque', 'TANQUE'],
  lote:    ['Lote', 'lote', 'LOTE'],
  estadio: ['Estadío', 'Estadio', 'estadío', 'estadio', 'ESTADIO'],
  poblacion: ['Población', 'poblacion', 'Poblacion', 'POBLACION'],
  supervivencia: ['Supervivencia', 'supervivencia', 'SUPERVIVENCIA'],
  mortalidad: ['Mortalidad', 'mortalidad', 'MORTALIDAD'],
  od:  ['OD', 'od', 'Oxígeno', 'oxígeno'],
  temp: ['Temperatura', 'temperatura', 'Temp', 'temp'],
  salinidad: ['Salinidad', 'salinidad', 'Salinidad_ppt', 'Sal_ppt', 'sal_ppt'],
  tecnico: ['Técnico', 'Tecnico', 'técnico', 'tecnico', 'TECNICO'],
  // Toneladas (m³) de agua del tanque. Es la ÚLTIMA columna de "Datos Larvicultura" desde
  // 2026-08: la escribe la ficha de Calidad de Agua (`tn_i`) y la consume la Densidad de
  // siembra de la Vista Ejecutiva. Mientras la hoja no la traiga, la densidad se sigue
  // estimando con el volumen fijo por tanque, así que su ausencia no rompe nada.
  toneladas: ['Toneladas', 'toneladas', 'TONELADAS'],
};

// Variantes de la columna PL/g (análisis biométrico / Larvicultura).
export const PLG_KEYS = ['PLG', 'Plg', 'plg', 'PL/g', 'pl/g'];
// Variantes de la columna PL/g (manual) de cosecha.
export const PLGM_KEYS = ['Plg (manual)', 'PLG (manual)', 'plg (manual)', 'Plg(manual)', 'PL/g (manual)', 'pl/g (manual)'];

// Columnas de la ficha de Despacho (hoja "Datos Larvicultura"). Fuente ÚNICA: las lee
// tanto la tabla en pantalla (views/supervisor/despacho.js) como el Excel que se descarga
// desde el KPI "Nº despachos" (views/supervisor/despachoExport.js). Compartirlas es lo que
// garantiza que el archivo diga EXACTAMENTE lo mismo que la vista; con una copia por
// módulo, el día que alguien añada un alias en una sola las dos empezarían a divergir en
// silencio (el mismo problema que ya obligó a unificar `hasDispatch` con `isDespachoRow`).
//
// ⚠ `plgM` es a propósito más estrecho que PLGM_KEYS (le faltan 'PL/g (manual)' y
// 'pl/g (manual)'): se conserva tal cual estaba en la vista para no alterar lo que ya
// muestra. Ampliarlo es un cambio de comportamiento y debe decidirse aparte.
export const DESPACHO_KEYS = {
  densidad: ['Densidad cosechada', 'Densidad Cosechada', 'densidad cosechada'],
  biomasa: ['Biomasa', 'biomasa'],
  plgM: ['Plg (manual)', 'PLG (manual)', 'plg (manual)', 'Plg(manual)'],
  cajas: ['Cajas/Tinas', 'Cajas / Tinas', 'cajas/tinas', 'Cajas-Tinas'],
  destino: ['Destino', 'destino'],
  piscina: ['Piscina', 'piscina'],
};

// ---------- normalización de nombres de Técnico ----------
// Mapa de alias: clave = nombre sin tildes, minúsculas, espacios colapsados.
// Unifica tipeos reales y formas corta/larga del mismo nombre.
const TEC_ALIAS = {
  'jhon munoz': 'John Muñoz',
  'john munoz': 'John Muñoz',
  'nixon ascencio': 'Nixon Asencio',
  'nixon asencio': 'Nixon Asencio',
  'victor bacilio': 'Victor Bacilio Gonzabay',
  'victor bacilio gonzabay': 'Victor Bacilio Gonzabay',
};

const isDiacritic = (c) => { const x = c.charCodeAt(0); return x >= 0x300 && x <= 0x36f; };
const stripDiacritics = (s) => String(s).normalize('NFD').split('').filter((c) => !isDiacritic(c)).join('');
const fuzzyKey = (s) => stripDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim();
const countDiacritics = (s) => String(s).normalize('NFD').split('').filter(isDiacritic).length;

/** Limpia y canoniza un nombre de técnico (colapsa espacios, aplica alias). */
export function normalizeTecnico(raw) {
  const cleaned = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return TEC_ALIAS[fuzzyKey(cleaned)] || cleaned;
}

/** Lista de técnicos únicos, normalizados y sin duplicados por variante de tipeo.
 *  Entre variantes equivalentes prefiere la que conserva tildes (más correcta). */
export function dedupeTecnicos(rawList) {
  const seen = new Map(); // fuzzyKey(normalizado) -> display
  (rawList || []).forEach((raw) => {
    const norm = normalizeTecnico(raw);
    if (!norm) return;
    const k = fuzzyKey(norm);
    const cur = seen.get(k);
    if (!cur || countDiacritics(norm) > countDiacritics(cur)) seen.set(k, norm);
  });
  return [...seen.values()];
}

// ---------- Observaciones de Registro_Supervisión ----------
// Columna de texto libre, multivalor (separadores «,» y «;»). Vive aquí y no en una vista
// porque la leen DOS: Revisiones (treemap de hallazgos, Sankey, «Hallazgos / revisión»,
// tasa diaria y comparativa de periodos) y Visitante (tarjeta «Estado de revisiones»).
//
// Textos con los que el laboratorio dice «nada que reportar». NO cuentan como hallazgo:
// contándolos, escribir «Sin novedad» puntúa PEOR que dejar la casilla vacía —medido en
// Visitante: 3 revisiones en blanco daban «Sin novedades» y las mismas con «Sin novedad»
// daban «Con observaciones»—, y en Revisiones salían como una celda más del treemap de
// hallazgos, con su cinta en el Sankey. Premia justo a quien no documenta.
// ▼▼ AMPLIAR AQUÍ si el laboratorio usa otras fórmulas para decir «nada que reportar» ▼▼
export const OBS_KEYS = ['Observaciones', 'observaciones', 'Observación', 'observación'];
const OBS_SIN_HALLAZGO = new Set([
  'sin novedad', 'sin novedades', 'sin observaciones', 'sin observacion',
  'ninguna', 'ninguno', 'nada', 'ok', 'n/a', 'na',
]);
// Sin tildes, sin mayúsculas, sin puntuación final ni espacios sobrantes.
const obsFold = (s) => fuzzyKey(s).replace(/[.!]+$/, '').trim();

/** Hallazgos de una fila de revisión: los textos de Observaciones que NO son un
 *  «nada que reportar». Devuelve [] si la casilla está vacía. */
export function obsFindings(row) {
  return String(getField(row, OBS_KEYS))
    .split(/[,;]+/).map((x) => x.trim()).filter(Boolean)
    .filter((t) => !OBS_SIN_HALLAZGO.has(obsFold(t)));
}

export const isTanqueRow = (r) => r && /^Control_Tanque/i.test(String(r._SheetOrigin || ''));
export const isLarviculturaRow = (r) => r && r._SheetOrigin === 'Larvicultura';
export const hasValidCorrida = (r) => getField(r, F.corrida) !== '';
export const hasValidModulo = (r) => getField(r, F.modulo) !== '';

function stageRank(s) {
  if (!s) return -1;
  const norm = String(s).trim().toUpperCase();
  const idx = STAGE_ORDER.indexOf(norm);
  if (idx !== -1) return idx;
  // PL fuera de la lista (PL31, PL40…): es el estadio más avanzado, debe quedar
  // por encima de todo lo listado y ordenarse por su número (fix D1).
  const m = norm.match(/^PL\s*0*(\d+)$/);
  if (m) return STAGE_ORDER.length + Number(m[1]);
  return -1;
}

/** Estadio más avanzado del día más reciente con dato. */
export function getLatestStage(data) {
  if (!data || !data.length) return 'N/A';
  const sorted = [...data].sort((a, b) =>
    (parseAnyDate(getField(b, F.fecha)) || new Date(0)) - (parseAnyDate(getField(a, F.fecha)) || new Date(0)));
  const seen = {}, dates = [];
  sorted.forEach((r) => { const f = getField(r, F.fecha) || ''; if (!seen[f]) { seen[f] = true; dates.push(f); } });
  for (const day of dates) {
    const dayRows = sorted.filter((r) => (getField(r, F.fecha) || '') === day);
    let best = null, bestRank = -1;
    dayRows.forEach((r) => {
      const s = getField(r, F.estadio);
      if (!s) return;
      const rank = stageRank(s);
      if (best === null || rank > bestRank) { bestRank = rank; best = s.toUpperCase(); }
    });
    if (best) return best;
  }
  return 'N/A';
}

/** Deriva Mortalidad = 100 - Supervivencia cuando falta. Mutación in-place.
 *  Lee Supervivencia/Mortalidad con parseNum (tolerante a coma decimal y “%”),
 *  no con parseFloat crudo, que truncaba "85,5" → 85 (regla 6 de CLAUDE.md). */
export function autoCalcMortalidad(rows) {
  rows.forEach((row) => {
    const hasMort = parseNum(row, F.mortalidad) !== null;
    const sv = parseNum(row, F.supervivencia);
    if (!hasMort && sv !== null && sv >= 0 && sv <= 100) {
      row['Mortalidad'] = parseFloat((100 - sv).toFixed(4));
      row['_MortCalc'] = true;
    }
  });
}
