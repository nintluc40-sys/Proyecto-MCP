/* ============================================================
   MICROBIOLOGÍA · capa de datos (pura, sin DOM)
   Lee la hoja "Microbiología" del Google Sheet (la escribe la app de
   Fichas/GAS). Cada fila = 1 muestra con MUCHOS patógenos en columnas
   (tríos `(crudo) · UFC · Nivel`). Aquí se "derrite" en registros
   `(patógeno, crudo, ufc, nivel)` — insumo común del conglomerado, las
   tendencias y la Placa Petri.

   UFC = crudo × factor (ya calculado en la hoja por la app de captura).
   Nivel ya viene calculado: Mínimo · Leve · Moderado · Elevado.
   ============================================================ */
import { getField, parseNum } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { isUnsafeKey } from '../../core/util.js';

// ── utilidades locales ──
const isDiacritic = (c) => { const x = c.charCodeAt(0); return x >= 0x300 && x <= 0x36f; };
export const stripAccents = (s) => String(s == null ? '' : s).normalize('NFD').split('').filter((c) => !isDiacritic(c)).join('');
const fold = (s) => stripAccents(s).toLowerCase().trim();
/** "578.0" → "578"; "9.0" → "9"; "Z2"/"N5 (MB)" → tal cual. */
export function intStr(v) {
  const s = String(v == null ? '' : v).trim();
  if (s === '') return '';
  const n = Number(s);
  return (Number.isFinite(n) && Number.isInteger(n)) ? String(n) : s;
}

// ── identificación de la hoja ──
export const isMicroRow = (r) => !!r && /microbiolog/i.test(stripAccents(r._SheetOrigin || ''));

// ── niveles (semáforo de 4 grados ya calculado en la hoja) ──
export const NIVELES = ['Mínimo', 'Leve', 'Moderado', 'Elevado'];
export const NIVEL_RANK = { 'Mínimo': 0, 'Leve': 1, 'Moderado': 2, 'Elevado': 3 };
// Colores del semáforo de 4 niveles (tokens --c-optimo/atencion/alerta/critico;
// son iguales en tema claro y oscuro, por eso se fijan aquí).
export const NIVEL_COLOR = { 'Mínimo': '#1ec86a', 'Leve': '#f5b942', 'Moderado': '#f07830', 'Elevado': '#e8303e' };
export const isAlerta = (n) => n === 'Moderado' || n === 'Elevado';

/** Normaliza el texto de Nivel a una de las 4 etiquetas canónicas ('' si desconocido). */
export function normNivel(raw) {
  const k = fold(raw);
  if (!k) return '';
  if (k.startsWith('min')) return 'Mínimo';
  if (k.startsWith('lev')) return 'Leve';
  if (k.startsWith('mod')) return 'Moderado';
  if (k.startsWith('elev')) return 'Elevado';
  return '';
}

// ── catálogo de patógenos (orden de presentación) ──
// `base` = prefijo exacto de las columnas de la hoja: `${base} (crudo)`,
// `${base} UFC`, `${base} Nivel`. `noNivel` = solo crudo/UFC (sin semáforo).
// `base` = prefijo exacto de columna; `fkey` = clave del parámetro en las fichas de
// Registros (para resolver los umbrales por área de MIC_DR_BASE / larv4_mic_factors).
const P = (key, label, base, fkey, opts = {}) => ({ key, label, base, fkey, noNivel: !!opts.noNivel, altBases: opts.altBases || [] });
export const PATHOGENS = [
  // Amarillos/Verdes/Totales: la hoja usa las columnas "V.Amarillos/V.Verdes/V.Totales"
  // (Vibrios). Se aceptan AMBOS nombres de columna (V.* y C.*) por compatibilidad vía
  // `altBases`; la ETIQUETA mostrada se mantiene como "C. Amarillas/Verdes/Totales".
  P('amarillos', 'C. Amarillas', 'V.Amarillos', 'vamar', { altBases: ['C. Amarillas'] }),
  P('verdes', 'C. Verdes', 'V.Verdes', 'vverd', { altBases: ['C. Verdes'] }),
  P('totales', 'C. Totales', 'V.Totales', 'vtot', { altBases: ['C. Totales'] }),
  P('algino', 'V. alginolyticus', 'V.alginolyticus', 'valg'),
  P('para', 'V. parahaemolyticus', 'V.parahaemolyticus', 'vpara'),
  P('vulni', 'V. vulnificus', 'V.vulnificus', 'vvuln'),
  P('pseudo', 'Pseudomonas', 'Pseudomonas', 'pseudo'),
  P('aero', 'Aeromonas', 'Aeromonas', 'aero'),
  P('pseudoGsp', 'Pseudomonas GSP', 'Pseudomonas GSP', 'pseudoGsp'),
  P('aeroGsp', 'Aeromonas GSP', 'Aeromonas GSP', 'aeroGsp'),
  P('bactTot', 'Bact. Totales', 'Bact.Totales', 'btot'),
  P('bactNar', 'Bact. Naranjas', 'Bact.Naranjas', 'bnar'),
  P('hongos', 'Hongos', 'Hongos', 'hongos'),
  P('entero', 'Enterobact.', 'Enterobact.', 'entero', { noNivel: true }),
  P('levaduras', 'Levaduras', 'Levaduras', 'levad', { noNivel: true }),
  P('rojas', 'Bacterias Rojas', 'Bacterias Rojas', 'brojas', { noNivel: true }),
];
export const PATHOGEN_BY_KEY = Object.fromEntries(PATHOGENS.map((p) => [p.key, p]));

// Conteos AGREGADOS (no patógenos específicos): C. Totales y Bact. Totales son
// sumas, por eso se excluyen del cálculo de "patógeno dominante" (si no, ganarían
// siempre por ser ≥ que cualquier específico). Siguen contando como nivel/colonia.
export const AGGREGATE_KEYS = new Set(['totales', 'bactTot']);

// Color de cada patógeno (colonias de la Placa Petri + leyendas). Elegidos para
// imitar el color REAL de la colonia en su agar (TCBS/CHROMagar/GSP), evitando
// que dos patógenos que pueden coincidir en una placa se confundan:
//   · C. Amarillas = amarillo CONCENTRADO (oro), para distinguirse de Aeromonas
//     (amarillo claro).                     · C. Verdes = verde.
//   · V. alginolyticus = crema · V. parahaemolyticus = malva · V. vulnificus =
//     azul turquesa (colores reales en CHROMagar Vibrio).
//   · Pseudomonas = rojo/rosado · Aeromonas = amarillo.
// Los demás conservan su color salvo choque con los anteriores (totales→pizarra por
// ser agregado y rozar el turquesa; pseudoGsp→pino y levaduras→gris para no chocar
// con verdes/turquesa; aeroGsp→violeta para separarse de la malva).
export const PATHOGEN_COLOR = {
  amarillos: '#EFB700', verdes: '#3C9A57', totales: '#78909C',
  algino: '#E8DCA8', para: '#BF87B3', vulni: '#1CB5C4',
  pseudo: '#EA4C6B', aero: '#FFDB4D', pseudoGsp: '#00796B', aeroGsp: '#7E57C2',
  bactTot: '#C8A96E', bactNar: '#FB8C00', hongos: '#8D6E63',
  entero: '#5C6BC0', levaduras: '#B0BEC5', rojas: '#C62828',
};

// Agar de cultivo por patógeno (para mostrar el "agar utilizado" en la placa del día).
// Enterobact. y Bacterias Rojas aún sin agar definido → no se listan.
export const PATHOGEN_AGAR = {
  amarillos: 'Agar TCBS', verdes: 'Agar TCBS', totales: 'Agar TCBS',
  algino: 'CHROMagar Vibrio', para: 'CHROMagar Vibrio', vulni: 'CHROMagar Vibrio',
  pseudo: 'Agar GSP', aero: 'Agar GSP', pseudoGsp: 'Agar GSP', aeroGsp: 'Agar GSP',
  bactTot: 'Agar TSA', bactNar: 'Agar Marino',
  hongos: 'Agar Dextrosa Sabouraud', levaduras: 'Agar Dextrosa Sabouraud',
};

// Variantes tolerantes de cabecera por patógeno (mayúsc/minúsc, con/sin espacio).
// Se prueban todas las bases del patógeno (base principal + `altBases`).
const colVariants = (base, suffix) => [`${base} ${suffix}`, `${base}${suffix}`, `${base} ${suffix}`.toLowerCase(), `${base}${suffix}`.toLowerCase()];
const basesOf = (p) => [p.base, ...(p.altBases || [])];
const crudoCols = (p) => basesOf(p).flatMap((b) => colVariants(b, '(crudo)').concat(colVariants(b, ' (crudo)')));
const ufcCols = (p) => basesOf(p).flatMap((b) => colVariants(b, 'UFC'));
const nivelCols = (p) => basesOf(p).flatMap((b) => colVariants(b, 'Nivel'));

// ── V.Luminiscentes (presencia / ausencia, no UFC) ──
const LUMIN_COLS = ['V.Luminiscentes', 'V.luminiscentes', 'v.luminiscentes', 'V Luminiscentes'];
/** true = presencia, false = ausencia, null = sin dato. */
export function luminPresence(row) {
  const v = fold(getField(row, LUMIN_COLS));
  if (!v) return null;
  if (/^(p|pres|si|positiv|1|x|\+)/.test(v)) return true;
  if (/^(a|aus|no|negativ|0|-)/.test(v)) return false;
  return null;
}

// ── formatos (los 16 reales de las fichas de Registros) + área de umbrales ──
// `area(tipoMuestra)` → clave de MIC_DR_BASE (réplica fiel de los rkeyFn de la ficha).
export const MIC_FORMATS = {
  'larv-muestra':       { label: 'Larvicultura · Muestra',        area: (t) => (t === 'Agua' ? 'larv-agua' : 'larv-animal') },
  reservorios:          { label: 'Larvicultura · Reservorios',    area: () => 'larv-agua' },
  'placa-amb':          { label: 'Larvicultura · Placa ambiental', area: () => 'ambiental' },
  artemia:              { label: 'Larvicultura · Artemia',        area: () => 'artemia' },
  'mad-principal':      { label: 'Maduración · Principal',        area: () => 'mad-reprod' },
  // Maduración · Agua (Bacteriología): la ficha clona los umbrales l/m/e de 'larv-agua'
  // (solo cambia el factor ×, que aquí no se usa: el UFC ya viene multiplicado en la hoja).
  'mad-agua':           { label: 'Maduración · Agua',             area: () => 'larv-agua' },
  'mad-ensayo':         { label: 'Maduración · Ensayo',           area: () => 'mad-reprod' },
  'alim-vivo':          { label: 'Maduración · Alimento vivo',    area: () => 'larv-animal' },
  ras:                  { label: 'Maduración · RAS',              area: () => 'ras-agua' },
  'agua-mar':           { label: 'Maduración · Agua de Mar',      area: () => 'larv-agua' },
  'agua-limpia-mar':    { label: 'Agua Limpia y Mar',             area: () => 'agua-limpia-mar' },
  'mad-desinf':         { label: 'Maduración · Despacho',         area: () => 'mad-agua' },
  externas:             { label: 'Muestras externas',            area: () => 'larv-animal' },
  hisopados:            { label: 'Hisopados',                    area: () => 'ambiental' },
  'hisopados-despacho': { label: 'Hisopados (despacho)',         area: () => 'ambiental' },
  algas:                { label: 'Algas Hisopado',               area: () => 'algas' },
  'algas-mensual':      { label: 'Algas Mensual',                area: () => 'algas' },
  'algas-r':            { label: 'Algas Fundas y Masivos',       area: () => 'algas' },
};
export const FORMATO_LABEL = Object.fromEntries(Object.entries(MIC_FORMATS).map(([k, v]) => [k, v.label]));
const _FMT_BY_FOLDED = Object.fromEntries(Object.entries(MIC_FORMATS).map(([k, v]) => [fold(v.label), k]));

// ── agrupación de formatos por DEPARTAMENTO (filtro Departamento → Formato) ──
export const DEPARTAMENTOS = ['Larvicultura', 'Maduración', 'Algas', 'Otros'];
export const DEPTO_FORMATS = {
  'Larvicultura': ['larv-muestra', 'reservorios', 'placa-amb', 'artemia'],
  'Maduración': ['mad-principal', 'mad-agua', 'mad-ensayo', 'alim-vivo', 'ras', 'agua-mar', 'agua-limpia-mar', 'mad-desinf'],
  'Algas': ['algas', 'algas-mensual', 'algas-r'],
  'Otros': ['externas', 'hisopados', 'hisopados-despacho'],
};
const _DEPTO_BY_FMT = {};
Object.entries(DEPTO_FORMATS).forEach(([d, keys]) => keys.forEach((k) => { _DEPTO_BY_FMT[k] = d; }));
/** Departamento (Larvicultura/Maduración/Otros) al que pertenece un formato. '' si desconocido. */
export function deptoOfFormato(fmtKey) { return _DEPTO_BY_FMT[fmtKey] || ''; }

/** Mapea el valor de la columna "Formato" de la hoja a la clave de formato ('' si vacío/desconocido). */
export function classifyFormato(raw) {
  const k = fold(raw);
  if (!k) return '';
  if (_FMT_BY_FOLDED[k]) return _FMT_BY_FOLDED[k];
  // Tolerancia ante variantes (sin el separador "·", etc.). Orden = de lo específico a lo general.
  if (k.includes('reservorio')) return 'reservorios';
  if (k.includes('placa') || k.includes('ambiental')) return 'placa-amb';
  if (k.includes('artemia')) return 'artemia';
  if (k.includes('alimento')) return 'alim-vivo';
  if (k.includes('agua limpia')) return 'agua-limpia-mar';
  if (k.includes('agua de mar')) return 'agua-mar';
  // "Maduración · Agua" (Bacteriología). Tras agua-limpia/agua-de-mar (ambas llevan 'mar').
  if (k.includes('maduracion') && k.includes('agua')) return 'mad-agua';
  // "Maduración · Despacho" (nuevo nombre) y "Maduración · Desinfección" (legado) → mad-desinf.
  // Debe ir ANTES de la regla genérica de "despacho" (que mapea a Hisopados despacho).
  if (k.includes('maduracion') && k.includes('despacho')) return 'mad-desinf';
  if (k.includes('desinfec')) return 'mad-desinf';
  if (k.includes('ensayo')) return 'mad-ensayo';
  if (k.includes('ras')) return 'ras';
  if (k.includes('principal')) return 'mad-principal';
  if (k.includes('despacho')) return 'hisopados-despacho';
  // Los formatos del departamento Algas van ANTES de la regla genérica de "hisopado":
  // si no, "Algas Hisopado" caería en 'hisopados' (los de planta). Se conservan además
  // los nombres ANTIGUOS ("Algas", "Algas R") porque siguen escritos en el histórico
  // del Sheet: renombrar los formatos no debe perder los registros ya sincronizados.
  if (k.includes('alga')) {
    if (k.includes('mensual')) return 'algas-mensual';
    if (k.includes('funda') || k.includes('masivo') || /\balgas r\b/.test(k)) return 'algas-r';
    return 'algas'; // "Algas Hisopado" (nuevo) y "Algas" (legado)
  }
  if (k.includes('hisopado')) return 'hisopados';
  if (k.includes('externa')) return 'externas';
  if (k.includes('muestra')) return 'larv-muestra';
  return '';
}

/** Área de umbrales del formato (depende del tipo de muestra en Larvicultura). */
export function areaForFormat(fmtKey, tipoMuestra) {
  const f = MIC_FORMATS[fmtKey];
  return f ? f.area(tipoMuestra) : 'larv-animal'; // por defecto, igual que la ficha
}

/* ── Umbrales por ÁREA × parámetro (UFC/mL) — portados de MIC_DR_BASE de las fichas.
   l/m/e = límites inferiores de Leve/Moderado/Elevado; el factor `f` ya viene
   aplicado en la columna UFC de la hoja, así que aquí solo se usan l/m/e. ── */
const MIC_DR_BASE = {
  'larv-animal': {
    vamar: { l: 1000, m: 5000, e: 10000 }, vverd: { l: 300, m: 600, e: 1000 }, vtot: { l: 1000, m: 5000, e: 10000 },
    valg: { l: 1000, m: 5000, e: 10000 }, vpara: { l: 300, m: 600, e: 1000 }, vvuln: { l: 300, m: 600, e: 1000 },
    pseudo: { l: 300, m: 600, e: 1000 }, aero: { l: 1000, m: 5000, e: 10000 },
    btot: { l: 10000, m: 100000, e: 1000000 }, bnar: { l: 1000, m: 5000, e: 10000 }, hongos: { l: 20, m: 200, e: 400 },
  },
  'larv-agua': {
    vamar: { l: 1000, m: 5000, e: 10000 }, vverd: { l: 100, m: 200, e: 300 }, vtot: { l: 1000, m: 5000, e: 10000 },
    valg: { l: 1000, m: 5000, e: 10000 }, vpara: { l: 100, m: 200, e: 300 }, vvuln: { l: 100, m: 200, e: 300 },
    pseudo: { l: 100, m: 200, e: 300 }, aero: { l: 1000, m: 5000, e: 10000 },
    btot: { l: 10000, m: 100000, e: 1000000 }, bnar: { l: 1000, m: 5000, e: 10000 }, hongos: { l: 2, m: 20, e: 40 },
  },
  'mad-reprod': {
    vamar: { l: 1000, m: 10000, e: 100000 }, vverd: { l: 500, m: 3000, e: 5000 }, vtot: { l: 1000, m: 10000, e: 100000 },
    valg: { l: 500, m: 3000, e: 5000 }, vpara: { l: 500, m: 3000, e: 5000 }, vvuln: { l: 500, m: 3000, e: 5000 },
    pseudo: { l: 500, m: 3000, e: 5000 }, aero: { l: 1000, m: 10000, e: 100000 },
    btot: { l: 10000, m: 100000, e: 1000000 }, bnar: { l: 100, m: 500, e: 1000 }, hongos: { l: 20, m: 200, e: 400 },
  },
  ambiental: {
    vamar: { l: 25, m: 50, e: 500 }, vverd: { l: 10, m: 30, e: 300 }, vtot: { l: 25, m: 50, e: 500 },
    valg: { l: 25, m: 50, e: 500 }, vpara: { l: 10, m: 30, e: 300 }, vvuln: { l: 10, m: 30, e: 300 },
    pseudo: { l: 10, m: 30, e: 300 }, aero: { l: 25, m: 50, e: 500 },
    pseudoGsp: { l: 10, m: 30, e: 300 }, aeroGsp: { l: 25, m: 50, e: 500 }, btot: { l: 10, m: 100, e: 500 },
  },
  artemia: {
    vamar: { l: 1000, m: 10000, e: 100000 }, vverd: { l: 500, m: 3000, e: 5000 }, vtot: { l: 1000, m: 10000, e: 100000 },
    pseudo: { l: 500, m: 3000, e: 5000 }, aero: { l: 1000, m: 10000, e: 100000 },
    btot: { l: 10000, m: 100000, e: 1000000 }, hongos: { l: 20, m: 200, e: 400 },
  },
  'ras-agua': {
    vamar: { l: 100, m: 500, e: 1000 }, vverd: { l: 50, m: 100, e: 200 }, vtot: { l: 100, m: 500, e: 1000 },
    pseudo: { l: 50, m: 100, e: 200 }, aero: { l: 100, m: 500, e: 1000 },
    btot: { l: 10000, m: 100000, e: 1000000 }, bnar: { l: 1000, m: 5000, e: 10000 },
  },
  // Departamento Algas (Hisopado · Mensual · Fundas y Masivos). Umbrales ESCALADOS por
  // el factor de dilución que aplica la app de captura (colonias ×5, Pseudomonas /
  // Aeromonas / Bacterias totales ×20): así el UFC que llega ya multiplicado conserva
  // el mismo nivel Leve/Moderado/Elevado que antes del cambio de factores.
  algas: {
    vamar: { l: 5, m: 10, e: 50 }, vverd: { l: 5, m: 10, e: 50 }, vtot: { l: 5, m: 10, e: 50 },
    pseudo: { l: 20, m: 40, e: 200 }, aero: { l: 20, m: 40, e: 200 }, btot: { l: 200, m: 2000, e: 10000 },
  },
  'mad-agua': {
    vamar: { l: 100, m: 500, e: 1000 }, vverd: { l: 50, m: 100, e: 200 }, vtot: { l: 100, m: 500, e: 1000 },
    valg: { l: 100, m: 500, e: 1000 }, vpara: { l: 50, m: 100, e: 200 }, vvuln: { l: 50, m: 100, e: 200 },
    pseudo: { l: 50, m: 100, e: 200 }, aero: { l: 100, m: 500, e: 1000 },
    btot: { l: 10000, m: 100000, e: 1000000 }, bnar: { l: 100, m: 500, e: 1000 }, hongos: { l: 2, m: 20, e: 40 },
  },
  // Agua Limpia y Mar: mismos umbrales UFC que mad-agua (el factor ya viene aplicado en la
  // columna UFC de la hoja; aquí solo se usan l/m/e para clasificar).
  'agua-limpia-mar': {
    vamar: { l: 100, m: 500, e: 1000 }, vverd: { l: 50, m: 100, e: 200 }, vtot: { l: 100, m: 500, e: 1000 },
    valg: { l: 100, m: 500, e: 1000 }, vpara: { l: 50, m: 100, e: 200 }, vvuln: { l: 50, m: 100, e: 200 },
    pseudo: { l: 50, m: 100, e: 200 }, aero: { l: 100, m: 500, e: 1000 },
    btot: { l: 10000, m: 100000, e: 1000000 }, bnar: { l: 100, m: 500, e: 1000 }, hongos: { l: 2, m: 20, e: 40 },
  },
};

// Umbrales efectivos = base + overrides de la vista Factores (localStorage, misma SPA).
// Caché invalidada por HUELLA: el string crudo de localStorage actúa de firma. Si la
// vista Factores reescribe el override, el cambio se refleja en el siguiente cálculo
// SIN recargar; mientras no cambie, se reutiliza la caché (el getItem por llamada es
// barato y la reconstrucción solo ocurre cuando la firma difiere).
export const MIC_FACTORS_KEY = 'larv4_mic_factors';
// Áreas de umbrales (clave de MIC_DR_BASE → etiqueta legible) para el editor de rangos.
export const MIC_AREAS = [
  { key: 'larv-animal', label: 'Larvicultura · Animal' },
  { key: 'larv-agua', label: 'Larvicultura · Agua' },
  { key: 'artemia', label: 'Artemia' },
  { key: 'ambiental', label: 'Ambiental (placas/hisopados)' },
  { key: 'mad-reprod', label: 'Maduración · Reproductores' },
  { key: 'mad-agua', label: 'Maduración · Agua' },
  { key: 'agua-limpia-mar', label: 'Agua Limpia y Mar' },
  { key: 'ras-agua', label: 'RAS · Agua' },
  { key: 'algas', label: 'Algas (Hisopado · Mensual · Fundas y Masivos)' },
];
let _thrCache = null;
let _thrRaw = null; // firma (string crudo de localStorage) del set cacheado

// Migración de una sola vez del área "algas" (espeja la de la app de captura, que
// comparte esta clave). El editor de rangos persiste una copia COMPLETA de la base, así
// que quien haya guardado alguna vez tendría congelados los umbrales antiguos (sin
// escalar) y no vería los nuevos. Se borra SOLO esa área; el resto de ajustes se conserva.
const MIC_FACTORS_VER_KEY = 'larv4_mic_factors_ver';
const MIC_FACTORS_VER = '2026-07-20-algas';
let _micFactMigrated = false;
function micMigrateFactors() {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(MIC_FACTORS_VER_KEY) === MIC_FACTORS_VER) return;
    const raw = localStorage.getItem(MIC_FACTORS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object' && o.algas) { delete o.algas; localStorage.setItem(MIC_FACTORS_KEY, JSON.stringify(o)); }
    }
    localStorage.setItem(MIC_FACTORS_VER_KEY, MIC_FACTORS_VER);
  } catch (_) { /* sin localStorage o ilegible → se usan las bases */ }
}

export function loadMicThresholds() {
  if (!_micFactMigrated) { _micFactMigrated = true; micMigrateFactors(); }
  let raw = null;
  try { raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(MIC_FACTORS_KEY) : null; }
  catch (_) { raw = null; }
  if (_thrCache && raw === _thrRaw) return _thrCache;

  const out = JSON.parse(JSON.stringify(MIC_DR_BASE));
  try {
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        // Guard de claves peligrosas (isUnsafeKey en core/util.js). Aquí la fusión
        // tiene DOS niveles y era peor: con área "__proto__", `out[ak]` devolvía
        // Object.prototype y el bucle interno ESCRIBÍA DENTRO → contaminaba el prototipo
        // GLOBAL, afectando a cualquier objeto de la app, no solo a los umbrales.
        Object.keys(o).forEach((ak) => {
          if (isUnsafeKey(ak)) return;
          out[ak] = out[ak] || {};
          Object.keys(o[ak] || {}).forEach((pk) => {
            if (isUnsafeKey(pk)) return;
            out[ak][pk] = Object.assign({}, out[ak][pk] || {}, o[ak][pk] || {});
          });
        });
      }
    }
  } catch (_) { /* override ilegible → solo base */ }
  _thrCache = out;
  _thrRaw = raw;
  return out;
}

const CODE_NIVEL = { v: 'Mínimo', y: 'Leve', o: 'Moderado', r: 'Elevado' };
/** Clasifica UFC con umbrales {l,m,e} (réplica de micLvl de la ficha). null si sin umbral. */
function micLvlCode(ufc, r) {
  if (!r || !isFinite(ufc) || r.l == null) return null;
  if (ufc < r.l) return 'v';
  const m = (r.m == null) ? Infinity : r.m;
  const e = (r.e == null) ? Infinity : r.e;
  if (ufc < m) return 'y';
  if (ufc < e) return 'o';
  return 'r';
}

// ── contexto de columnas (acceso tolerante) ──
const CF = {
  fecha: ['Fecha muestreo', 'Fecha de muestreo', 'fecha muestreo', 'Fecha'],
  corrida: ['Corrida', 'corrida'],
  responsable: ['Responsable', 'responsable'],
  departamento: ['Departamento', 'departamento'],
  formato: ['Formato', 'formato'],
  tipoMuestra: ['Tipo de muestra', 'Tipo muestra', 'tipo de muestra'],
  moduloSala: ['Módulo/Sala', 'Modulo/Sala', 'módulo/sala', 'Módulo', 'Modulo'],
  estadio: ['Estadío', 'Estadio', 'estadío', 'estadio'],
  tq: ['TQ/N°', 'TQ/N', 'TQ/Nº', 'TQ', 'tq/n°'],
  reservorio: ['Tanque/Reservorio', 'Reservorio', 'tanque/reservorio'],
  etapa: ['Etapa', 'etapa'],
  obs: ['Observaciones', 'observaciones', 'Observación'],
  // Contexto propio de los formatos de Maduración / Otras / Algas.
  sexo: ['Sexo', 'sexo'],
  componente: ['Componente', 'componente'],
  punto: ['Punto de muestreo', 'punto de muestreo', 'Punto'],
  origen: ['Origen/Tipo', 'Origen', 'origen/tipo', 'origen'],
  laboratorio: ['Laboratorio (MB)', 'Laboratorio', 'laboratorio'],
  raceways: ['Raceways', 'raceways'],
  tanques: ['Tanques', 'tanques'],
  lugar: ['Lugar', 'lugar'],
  variedad: ['Variedad', 'variedad'],
  dias: ['Días', 'Dias', 'días', 'dias'],
  especie: ['Especie', 'especie'],
  siembra: ['Siembra', 'siembra'],
  muestras: ['Muestras', 'muestras'],
  carro: ['Carro', 'carro'],
  tina: ['Tina', 'tina'],
};

/** Tipo de muestra canónico: 'Agua' | 'Animal' | '' (otros se conservan tal cual). */
export function normTipoMuestra(raw) {
  const k = fold(raw);
  if (!k) return '';
  if (k.startsWith('agua')) return 'Agua';
  if (k.startsWith('anim')) return 'Animal';
  return String(raw).trim();
}

/** Contexto (no-patógeno) de una fila de Microbiología. */
export function rowContext(row) {
  const modSala = getField(row, CF.moduloSala);
  const isSala = /sala/i.test(modSala);
  const modulo = isSala ? '' : intStr(modSala);
  const sala = isSala ? modSala.trim() : '';
  const tq = intStr(getField(row, CF.tq));
  const reservorio = intStr(getField(row, CF.reservorio));
  const sexo = getField(row, CF.sexo);
  const componente = getField(row, CF.componente);
  const punto = getField(row, CF.punto);
  const origen = getField(row, CF.origen);
  const lugar = getField(row, CF.lugar);
  const muestras = getField(row, CF.muestras);
  const carro = getField(row, CF.carro);
  const tina = getField(row, CF.tina);
  // Ubicación/“dónde-qué” legible, adaptada al contexto propio de cada formato.
  const loc = reservorio ? ('R' + reservorio)
    : tq ? ('T' + tq)
    : (componente || punto || lugar || origen || muestras
      || [carro && ('Carro ' + carro), tina && ('Tina ' + tina)].filter(Boolean).join(' / '));
  const ubicacion = sexo ? (loc ? (loc + ' · ' + sexo) : sexo) : loc;
  return {
    fecha: parseAnyDate(getField(row, CF.fecha)),
    fechaRaw: getField(row, CF.fecha),
    corrida: intStr(getField(row, CF.corrida)),
    responsable: getField(row, CF.responsable),
    departamento: getField(row, CF.departamento),
    formato: getField(row, CF.formato),
    formatoKey: classifyFormato(getField(row, CF.formato)),
    tipoMuestra: normTipoMuestra(getField(row, CF.tipoMuestra)),
    modulo, sala,
    modSalaLabel: modulo ? ('M' + modulo) : sala, // etiqueta para la columna Módulo/Sala
    estadio: getField(row, CF.estadio),
    tq, reservorio, ubicacion,
    sexo, componente, punto, origen, lugar, muestras, carro, tina,
    laboratorio: getField(row, CF.laboratorio),
    raceways: getField(row, CF.raceways),
    tanques: getField(row, CF.tanques),
    variedad: getField(row, CF.variedad),
    dias: getField(row, CF.dias),
    especie: getField(row, CF.especie),
    siembra: getField(row, CF.siembra),
    etapa: getField(row, CF.etapa),
    obs: getField(row, CF.obs),
    lumin: luminPresence(row),
  };
}

/** "Derrite" una fila ancha en N registros, uno por patógeno con dato.
 *  El Nivel se RECALCULA desde el UFC con los umbrales por área (mismos rangos que
 *  la ficha); si no hay UFC, cae al Nivel escrito en la hoja como respaldo. */
export function meltRow(row) {
  const out = [];
  const area = areaForFormat(classifyFormato(getField(row, CF.formato)), normTipoMuestra(getField(row, CF.tipoMuestra)));
  const aThr = loadMicThresholds()[area] || {};
  for (const p of PATHOGENS) {
    const ufc = parseNum(row, ufcCols(p));
    const crudo = parseNum(row, crudoCols(p));
    let nivel = '';
    if (ufc !== null) { const code = micLvlCode(ufc, aThr[p.fkey]); if (code) nivel = CODE_NIVEL[code]; }
    if (!nivel && !p.noNivel) nivel = normNivel(getField(row, nivelCols(p))); // respaldo: Nivel de la hoja
    if (ufc === null && crudo === null && !nivel) continue; // patógeno no medido en este formato
    out.push({ key: p.key, label: p.label, crudo, ufc, nivel });
  }
  return out;
}

/** Registros planos (1 por patógeno por fila) con el contexto fusionado. */
export function pathogenRecords(rows) {
  const recs = [];
  (rows || []).forEach((row) => {
    const ctx = rowContext(row);
    meltRow(row).forEach((m) => recs.push({ ...ctx, ...m }));
  });
  return recs;
}
