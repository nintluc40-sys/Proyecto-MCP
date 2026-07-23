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
import { isUnsafeKey } from '../../core/util.js';

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

// Parejas antes/después del Ensayo de acondicionamiento iónico (Maduración).
export const CAL_ENSAYO_PAIRS = [
  { key: 'sal', label: 'Salinidad', unit: '‰', a: 'sal_a', d: 'sal_d' },
  { key: 'ph', label: 'pH', unit: '', a: 'ph_a', d: 'ph_d' },
  { key: 'calcio', label: 'Calcio', unit: 'mg/L', a: 'calcio_a', d: 'calcio_d' },
  { key: 'magnesio', label: 'Magnesio', unit: 'mg/L', a: 'magnesio_a', d: 'magnesio_d' },
  { key: 'potasio', label: 'Potasio', unit: 'mg/L', a: 'potasio_a', d: 'potasio_d' },
];

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
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        // Guard de claves peligrosas: un override con {"__proto__":{"turbidez":{…}}} hacía
        // que `out.turbidez` devolviera un rango que nadie configuró, y calEstado marcaba
        // "fuera" un parámetro que debía salir "sin-rango". Ver isUnsafeKey en core/util.
        Object.keys(o).forEach((k) => {
          if (isUnsafeKey(k)) return;
          out[k] = Object.assign({}, out[k] || {}, o[k] || {});
        });
      }
    }
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
    out.push({ key: p.key, label: p.label, unit: p.unit, group: p.group, value: v, estado: calEstado(p.key, v, ranges), severity: calSeverity(p.key, v, ranges), range: calRangeText(p.key, ranges) });
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

/** Comparativa Ensayo antes/después: por pareja iónica, promedio antes/después +
 *  delta y % de cambio sobre las filas dadas. Solo parejas con algún dato. */
export function calEnsayoData(rows) {
  const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  return CAL_ENSAYO_PAIRS.map((p) => {
    const antes = [], desp = [];
    (rows || []).forEach((r) => {
      const va = calValue(r, CAL_PARAM_BY_KEY[p.a]);
      const vd = calValue(r, CAL_PARAM_BY_KEY[p.d]);
      if (va != null) antes.push(va);
      if (vd != null) desp.push(vd);
    });
    if (!antes.length && !desp.length) return null;
    const aAvg = avg(antes), dAvg = avg(desp);
    const delta = (aAvg != null && dAvg != null) ? dAvg - aAvg : null;
    const pct = (aAvg != null && dAvg != null && aAvg !== 0) ? (dAvg - aAvg) / aAvg * 100 : null;
    return { key: p.key, label: p.label, unit: p.unit, antes: aAvg, desp: dAvg, delta, pct, n: Math.max(antes.length, desp.length) };
  }).filter(Boolean);
}

/* ============================================================
   SEVERIDAD (semáforo científico de 4 niveles) · WQI · RIESGO
   Todo se deriva del rango objetivo YA existente (sin datos nuevos):
   se mide la EXCURSIÓN del valor respecto al centro/límite del rango.
   ============================================================ */

// Metadatos de severidad (rank = gravedad creciente; -1 = sin rango que evaluar).
export const CAL_SEV = {
  optimo: { key: 'optimo', label: 'Óptimo', rank: 0 },
  vigilancia: { key: 'vigilancia', label: 'Vigilancia', rank: 1 },
  fuera: { key: 'fuera', label: 'Fuera', rank: 2 },
  critico: { key: 'critico', label: 'Crítico', rank: 3 },
  'sin-rango': { key: 'sin-rango', label: 'Sin rango', rank: -1 },
};
// Niveles de riesgo de un nodo (tanque/módulo) según su peor severidad.
export const CAL_RISK = {
  bajo: { key: 'bajo', label: 'Riesgo bajo', rank: 0 },
  medio: { key: 'medio', label: 'Riesgo medio', rank: 1 },
  alto: { key: 'alto', label: 'Riesgo alto', rank: 2 },
  critico: { key: 'critico', label: 'Riesgo crítico', rank: 3 },
  'sin-datos': { key: 'sin-datos', label: 'Sin datos', rank: -1 },
};

/** Excursión normalizada de un valor respecto a su rango objetivo:
 *  0 = centro ideal · ~1 = justo en el límite · >1 = fuera (a mayor, peor).
 *  null si el parámetro no tiene rango o el valor es inválido. */
export function calExcursion(key, value, ranges) {
  const r = (ranges || CAL_RANGE_BASE)[key];
  if (!r || value == null || isNaN(value)) return null;
  const { min, max } = r;
  if (min != null && max != null) {         // rango de dos lados: distancia al centro
    const center = (min + max) / 2;
    const half = (max - min) / 2 || 1e-9;
    return Math.abs(value - center) / half;
  }
  if (max != null) return max > 0 ? value / max : (value > 0 ? 2 : 0); // solo techo (≤max)
  if (min != null) return value > 0 ? min / value : 2;                  // solo piso (≥min)
  return null;
}

/** Severidad de 4 niveles derivada de la excursión:
 *  ≤0.9 Óptimo · ≤1.0 Vigilancia (roza el borde) · ≤2.0 Fuera · >2.0 Crítico. */
export function calSeverity(key, value, ranges) {
  const e = calExcursion(key, value, ranges);
  if (e == null) return 'sin-rango';
  if (e <= 0.9) return 'optimo';
  if (e <= 1.0) return 'vigilancia';
  if (e <= 2.0) return 'fuera';
  return 'critico';
}

/** Sub-índice de calidad 0–100 (continuo) desde la excursión:
 *  DENTRO de rango (e≤1, es decir value en [mín,máx]) puntúa 100; al salirse del
 *  rango decae linealmente de 100 (en el borde) a 0 cuando la excursión duplica el
 *  límite (e≥2). Así el WQI queda alineado con el semáforo dentro/fuera: un punto
 *  con todos sus parámetros en rango da WQI 100. (No afecta a `calSeverity`, que usa
 *  su propia escala de excursión, ni al binario `calEstado`). */
export function calSubIndex(key, value, ranges) {
  const e = calExcursion(key, value, ranges);
  if (e == null) return null;
  if (e <= 1.0) return 100;                    // dentro de rango → puntaje pleno
  if (e <= 2.0) return 100 - (e - 1.0) * 100;  // fuera: 100 (borde) → 0 (2× el límite)
  return 0;
}

/** Water Quality Index de un conjunto de mediciones (objetos con {key,value,label}).
 *  wqi = media de los sub-índices de los parámetros con rango. */
export function calWQI(measures, ranges) {
  const subs = [];
  (measures || []).forEach((m) => {
    const q = calSubIndex(m.key, m.value, ranges);
    if (q != null) subs.push({ key: m.key, label: m.label, qi: q, severity: calSeverity(m.key, m.value, ranges) });
  });
  if (!subs.length) return { wqi: null, subs: [], worst: null, n: 0 };
  const wqi = Math.round(subs.reduce((s, x) => s + x.qi, 0) / subs.length);
  const worst = subs.slice().sort((a, b) => a.qi - b.qi)[0];
  return { wqi, subs, worst, n: subs.length };
}

/** Nivel de riesgo de un nodo. PROPORCIONAL: cuando se pasa el `wqi` (media de los
 *  sub-índices), el riesgo se deriva de sus bandas — igual que el medidor del panel —
 *  para que UN parámetro fuera entre 4–6 no dispare "riesgo alto/crítico" (el promedio
 *  ya lo pondera). Como el WQI puede DILUIR un parámetro grave puntual, se añade un piso
 *  por conteo de críticos. Sin `wqi` (uso directo/pruebas) conserva el criterio antiguo
 *  por peor severidad. */
export function calRiskLevel(severities, wqi) {
  const s = (severities || []).filter((x) => x !== 'sin-rango');
  if (!s.length) return 'sin-datos';
  const nCrit = s.filter((x) => x === 'critico').length;
  const nOut = s.filter((x) => x === 'critico' || x === 'fuera').length;
  if (wqi == null) {
    // Sin WQI: peor severidad (comportamiento histórico, preservado para las pruebas).
    return nCrit ? 'critico' : nOut ? 'alto' : s.includes('vigilancia') ? 'medio' : 'bajo';
  }
  const rank = { bajo: 0, medio: 1, alto: 2, critico: 3 };
  let base = wqi >= 85 ? 'bajo' : wqi >= 70 ? 'medio' : wqi >= 50 ? 'alto' : 'critico';
  // Piso: no diluir parámetros críticos puntuales bajo el promedio.
  if (nCrit >= 1 && rank[base] < rank.medio) base = 'medio';
  if (nCrit >= 2 && rank[base] < rank.alto) base = 'alto';
  return base;
}

// Etiqueta de un tanque/nodo desde su contexto (TQ preferido; respaldos por depto).
const nodeTankLabel = (ctx) => ctx.tq ? ('TQ ' + ctx.tq) : (ctx.componente || ctx.muestras || ctx.sala || '—');

/** Construye el árbol jerárquico Módulo → Tanque desde las muestras filtradas.
 *  Cada nodo lleva: n muestras, WQI, peor sub-índice, severidades, riesgo,
 *  parámetros críticos (fuera/crítico) y fecha de la última medición.
 *  Ordenado con los de mayor riesgo primero (para aflorar problemas). */
export function calGroupTree(samples, ranges) {
  const byRisk = (a, b) => (CAL_RISK[b.risk].rank - CAL_RISK[a.risk].rank) || ((a.wqi ?? 101) - (b.wqi ?? 101)) || (b.last || 0) - (a.last || 0);
  const nodeOf = (label, list) => {
    const meas = list.flatMap((s) => s.meas);
    const w = calWQI(meas, ranges);
    const sev = meas.map((m) => m.severity);
    const crit = [...new Set(meas.filter((m) => m.severity === 'fuera' || m.severity === 'critico').map((m) => m.label))];
    const last = list.reduce((mx, s) => Math.max(mx, s.ctx.fecha ? +s.ctx.fecha : 0), 0) || null;
    return { label, samples: list, n: list.length, wqi: w.wqi, worst: w.worst, sev, risk: calRiskLevel(sev, w.wqi), crit, last };
  };
  const modMap = new Map();
  (samples || []).forEach((s) => {
    const mod = s.ctx.modulo ? ('Módulo ' + s.ctx.modulo) : (s.ctx.depto || '—');
    if (!modMap.has(mod)) modMap.set(mod, new Map());
    const tqMap = modMap.get(mod);
    const tq = nodeTankLabel(s.ctx);
    if (!tqMap.has(tq)) tqMap.set(tq, []);
    tqMap.get(tq).push(s);
  });
  const modules = [...modMap.entries()].map(([mod, tqMap]) => {
    const tanks = [...tqMap.entries()].map(([tq, list]) => nodeOf(tq, list)).sort(byRisk);
    const node = nodeOf(mod, [...tqMap.values()].flat());
    return { ...node, tanks };
  }).sort(byRisk);
  return modules;
}

/** Estadística de control (Shewhart) de una serie de valores individuales:
 *  media (línea central), desviación estándar poblacional y límites ±3σ. */
export function controlStats(values) {
  const v = (values || []).filter((x) => x != null && !isNaN(x));
  const n = v.length;
  if (!n) return null;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, sd, ucl: mean + 3 * sd, lcl: mean - 3 * sd, n };
}

/** Estadística de caja (boxplot) de una serie: cuartiles por interpolación lineal,
 *  bigotes hasta 1.5·IQR y valores atípicos fuera de ese cerco. */
export function boxStats(values) {
  const v = (values || []).filter((x) => x != null && !isNaN(x)).slice().sort((a, b) => a - b);
  const n = v.length;
  if (!n) return null;
  const q = (p) => {
    const idx = (n - 1) * p; const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (idx - lo);
  };
  const q1 = q(0.25), med = q(0.5), q3 = q(0.75);
  const iqr = q3 - q1; const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
  const inl = v.filter((x) => x >= loF && x <= hiF);
  const outliers = v.filter((x) => x < loF || x > hiF);
  return { n, min: v[0], q1, med, q3, max: v[n - 1], whiskLo: inl.length ? inl[0] : v[0], whiskHi: inl.length ? inl[inl.length - 1] : v[n - 1], outliers };
}

/** Diagnóstico automático para el "Panel del Analista": síntesis técnica del pool
 *  filtrado (WQI global, conteos fuera/crítico, top parámetros, tanques en riesgo). */
export function calDiagnosis(samples, ranges) {
  const list = samples || [];
  const tree = calGroupTree(list, ranges);
  const meas = list.flatMap((s) => s.meas);
  const outParams = meas.filter((m) => m.severity === 'fuera' || m.severity === 'critico');
  const critCount = meas.filter((m) => m.severity === 'critico').length;
  const byParam = new Map();
  outParams.forEach((m) => byParam.set(m.label, (byParam.get(m.label) || 0) + 1));
  const topParams = [...byParam.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 3);
  const tanks = tree.flatMap((mo) => mo.tanks.map((t) => ({ modulo: mo.label, ...t })));
  const riskTanks = tanks.filter((t) => t.risk === 'alto' || t.risk === 'critico');
  const w = calWQI(meas, ranges);
  return {
    total: list.length,
    wqi: w.wqi,
    evaluated: w.n,
    outCount: outParams.length,
    critCount,
    topParams,
    riskTanks,
    tankCount: tanks.length,
    tree,
  };
}

/* ── Orden biológico de estadíos para el filtro (AS → Nauplio → Zoea → Mysis → PL) ── */
const CAL_STAGE_GROUP = { AS: 0, N: 1, Z: 2, M: 3, PL: 4 };
/** Descompone un estadío ("N5 (MB)", "Z2", "AS", "PL10") en clave ordenable:
 *  grupo (AS<N<Z<M<PL) → número → la variante SIMPLE antes que la de paréntesis
 *  (p. ej. "N5" antes de "N5 (MB)"). */
function calStageKey(s) {
  const t = String(s == null ? '' : s).trim().toUpperCase();
  const m = t.match(/^(AS|PL|N|Z|M)\s*0*(\d+)?\s*(.*)$/);
  if (!m) return { g: 9, n: 0, q: 1, qual: t, raw: t };
  const qual = (m[3] || '').trim();
  return { g: CAL_STAGE_GROUP[m[1]] ?? 8, n: m[2] ? +m[2] : -1, q: qual ? 1 : 0, qual, raw: t };
}
/** Comparador de estadíos para ordenar el filtro de Calidad de Agua. */
export function calStageCmp(a, b) {
  const A = calStageKey(a), B = calStageKey(b);
  return (A.g - B.g) || (A.n - B.n) || (A.q - B.q) || A.qual.localeCompare(B.qual) || A.raw.localeCompare(B.raw);
}
