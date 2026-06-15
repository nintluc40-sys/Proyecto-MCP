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

/** Deriva Mortalidad = 100 - Supervivencia cuando falta. Mutación in-place. */
export function autoCalcMortalidad(rows) {
  rows.forEach((row) => {
    const hasMort = F.mortalidad.some((k) => row[k] !== undefined && row[k] !== '' && !isNaN(parseFloat(row[k])));
    let sv = null;
    for (const k of F.supervivencia) {
      if (row[k] !== undefined && row[k] !== '' && !isNaN(parseFloat(row[k]))) { sv = parseFloat(row[k]); break; }
    }
    if (!hasMort && sv !== null && sv >= 0 && sv <= 100) {
      row['Mortalidad'] = parseFloat((100 - sv).toFixed(4));
      row['_MortCalc'] = true;
    }
  });
}
