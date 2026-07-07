/* ============================================================
   CALIDAD DE AGUA · capa de datos (pura, sin DOM)
   Lee la hoja "Calidad de Agua" del Google Sheet (la escribe la app de
   Registros · módulo Microbiología, ficha Calidad de Agua). Es FISICOQUÍMICA
   clasificada por RANGO (dentro/fuera de rango), NO por UFC. Cada fila = 1
   muestra con muchos parámetros en columnas (hoja "ancha"). Los encabezados
   son las etiquetas de CAL_PARAMS del motor (engine.js: CAL_SHEET_HEADERS).
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, parseNum } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';

export const isCalAguaRow = (r) => !!r && /calidad\s*de\s*agua/i.test(String(r._SheetOrigin || ''));

// Filas memoizadas por identidad de store.globalData (como microRows).
let _cache = { src: null, rows: [] };
export function calAguaRows() {
  if (_cache.src !== store.globalData) _cache = { src: store.globalData, rows: (store.globalData || []).filter(isCalAguaRow) };
  return _cache.rows;
}

// Catálogo de parámetros. `col` = encabezado EXACTO de la hoja; `alias` = variantes
// toleradas (mayúsc/acentos). `group` agrupa el perfil (base/nitrogenados/iones/metales/cloro).
const P = (key, col, label, unit, group, alias = []) => ({ key, col, label, unit, group, alias: [col, ...alias] });
export const CAL_PARAMS = [
  P('ph', 'pH', 'pH', '', 'base', ['PH', 'ph']),
  P('sal', 'S‰', 'Salinidad', '‰', 'base', ['Salinidad', 'Sal', 'S%o']),
  P('alc', 'Alcalinidad', 'Alcalinidad', 'mg/L', 'base'),
  P('temp', 'Temperatura', 'Temperatura', '°C', 'base', ['Temp']),
  P('nitrito', 'Nitrito', 'Nitrito', 'mg/L', 'nitrogenados'),
  P('tan', 'TAN', 'TAN', 'mg/L', 'nitrogenados'),
  P('amtox', 'Am.Tóxico', 'Amonio tóxico', 'mg/L', 'nitrogenados', ['Am.Toxico', 'Amonio tóxico', 'Amonio Toxico']),
  P('nitrato', 'Nitrato', 'Nitrato', 'mg/L', 'nitrogenados'),
  P('amonio', 'Amonio', 'Amonio', 'mg/L', 'nitrogenados'),
  P('ntot', 'Nitrógeno total', 'Nitrógeno total', 'mg/L', 'nitrogenados', ['Nitrogeno total']),
  P('calcio', 'Calcio', 'Calcio', 'mg/L', 'iones'),
  P('magnesio', 'Magnesio', 'Magnesio', 'mg/L', 'iones'),
  P('potasio', 'Potasio', 'Potasio', 'mg/L', 'iones'),
  P('dureza', 'Dureza total', 'Dureza total', 'mg/L', 'iones'),
  P('hierro', 'Hierro', 'Hierro', 'mg/L', 'metales'),
  P('fosforo', 'Fósforo', 'Fósforo', 'mg/L', 'metales', ['Fosforo']),
  P('cobre', 'Cobre', 'Cobre', 'mg/L', 'metales'),
  P('manganeso', 'Manganeso', 'Manganeso', 'mg/L', 'metales'),
  P('cl_libre', 'Cloro libre (mg/L)', 'Cloro libre', 'mg/L', 'cloro'),
  P('cl_total', 'Cloro total (mg/L)', 'Cloro total', 'mg/L', 'cloro'),
  P('cl_comb', 'Cloro combinado (mg/L)', 'Cloro combinado', 'mg/L', 'cloro'),
];
// Ensayo antes/después (Maduración): pares para la comparativa iónica (tanda posterior).
export const CAL_PARAMS_ENSAYO = [
  P('sal_a', 'S‰ antes', 'S‰ antes', '‰', 'ensayo'), P('sal_d', 'S‰ después', 'S‰ después', '‰', 'ensayo', ['S‰ despues']),
  P('ph_a', 'pH antes', 'pH antes', '', 'ensayo'), P('ph_d', 'pH después', 'pH después', '', 'ensayo', ['pH despues']),
  P('calcio_a', 'Calcio antes', 'Calcio antes', 'mg/L', 'ensayo'), P('calcio_d', 'Calcio después', 'Calcio después', 'mg/L', 'ensayo', ['Calcio despues']),
  P('magnesio_a', 'Magnesio antes', 'Magnesio antes', 'mg/L', 'ensayo'), P('magnesio_d', 'Magnesio después', 'Magnesio después', 'mg/L', 'ensayo', ['Magnesio despues']),
  P('potasio_a', 'Potasio antes', 'Potasio antes', 'mg/L', 'ensayo'), P('potasio_d', 'Potasio después', 'Potasio después', 'mg/L', 'ensayo', ['Potasio despues']),
];
export const CAL_PARAM_BY_KEY = Object.fromEntries([...CAL_PARAMS, ...CAL_PARAMS_ENSAYO].map((p) => [p.key, p]));

// Rangos objetivo (portados de CAL_RANGE_BASE del motor). Sin rango = solo registro.
export const CAL_RANGE_BASE = {
  ph: { min: 7.5, max: 8.5 }, alc: { min: 120, max: 150 },
  nitrito: { max: 0.2 }, tan: { max: 2 }, amtox: { max: 0.1 },
  calcio: { min: 300, max: 560 }, magnesio: { min: 1200, max: 1800 }, potasio: { min: 380, max: 420 },
};
const CAL_RANGES_KEY = 'larv4_cal_ranges'; // misma clave que la app de captura → respeta ajustes del técnico
let _rangeCache = { raw: undefined, val: null };
/** Rangos efectivos = base fusionada con overrides de localStorage (cache por huella). */
export function loadCalRanges() {
  let raw = null;
  try { raw = localStorage.getItem(CAL_RANGES_KEY); } catch (_) { /* sin almacenamiento */ }
  if (_rangeCache.raw === raw) return _rangeCache.val;
  const out = JSON.parse(JSON.stringify(CAL_RANGE_BASE));
  try {
    if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') Object.keys(o).forEach((k) => { out[k] = Object.assign({}, out[k] || {}, o[k] || {}); }); }
  } catch (_) { /* override corrupto → base */ }
  _rangeCache = { raw, val: out };
  return out;
}

/** Estado de un valor respecto a su rango: 'dentro' | 'fuera' | 'sin-rango'. */
export function calEstado(key, value, ranges) {
  const r = (ranges || CAL_RANGE_BASE)[key];
  if (!r || value == null || isNaN(value)) return 'sin-rango';
  if (r.min != null && value < r.min) return 'fuera';
  if (r.max != null && value > r.max) return 'fuera';
  return 'dentro';
}

/** Texto del rango objetivo: "7.5–8.5" · "≤0.2" · "≥120" · "" (sin rango). */
export function calRangeText(key, ranges) {
  const r = (ranges || CAL_RANGE_BASE)[key];
  if (!r) return '';
  if (r.min != null && r.max != null) return `${r.min}–${r.max}`;
  if (r.max != null) return `≤${r.max}`;
  if (r.min != null) return `≥${r.min}`;
  return '';
}

/** Contexto de una muestra (tolerante a variantes de cabecera). */
export function calCtx(row) {
  return {
    fecha: parseAnyDate(getField(row, ['Fecha muestreo', 'Fecha resultados', 'Fecha'])),
    corrida: getField(row, ['Corrida']),
    depto: getField(row, ['Departamento']),
    formato: getField(row, ['Formato']),
    tipoMuestra: getField(row, ['Tipo de muestra']),
    modulo: getField(row, ['Módulo', 'Modulo']),
    estadio: getField(row, ['Estadío', 'Estadio']),
    tq: getField(row, ['TQ/N°', 'TQ/N', 'TQ']),
    sala: getField(row, ['Sala']),
    estado: getField(row, ['Estado']),
    componente: getField(row, ['Componente']),
    muestras: getField(row, ['Muestras']),
    responsable: getField(row, ['Responsable']),
  };
}

/** Valor numérico de un parámetro en una muestra (null si vacío). */
export function calValue(row, param) { return parseNum(row, param.alias); }

/** Parámetros MEDIDOS de una muestra (valor no vacío) con estado y texto de rango.
 *  Por defecto los 21 generales (excluye Ensayo antes/después). */
export function calMeasured(row, ranges, params = CAL_PARAMS) {
  const out = [];
  params.forEach((p) => {
    const v = calValue(row, p);
    if (v == null) return;
    out.push({ key: p.key, label: p.label, unit: p.unit, group: p.group, value: v, estado: calEstado(p.key, v, ranges), range: calRangeText(p.key, ranges) });
  });
  return out;
}

/** Etiqueta de ubicación legible según lo que traiga el departamento/formato. */
export function calLocation(ctx) {
  const parts = [];
  if (ctx.modulo) parts.push('M' + ctx.modulo);
  if (ctx.sala) parts.push(ctx.sala);
  if (ctx.tq) parts.push('TQ ' + ctx.tq);
  if (ctx.componente) parts.push(ctx.componente);
  if (ctx.muestras) parts.push(ctx.muestras);
  if (ctx.estadio) parts.push(ctx.estadio);
  return parts.join(' · ') || (ctx.tipoMuestra || '—');
}
