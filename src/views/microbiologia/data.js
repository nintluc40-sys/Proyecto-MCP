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
const P = (key, label, base, opts = {}) => ({ key, label, base, noNivel: !!opts.noNivel });
export const PATHOGENS = [
  P('amarillos', 'C. Amarillas', 'V.Amarillos'),
  P('verdes', 'C. Verdes', 'V.Verdes'),
  P('totales', 'C. Totales', 'V.Totales'),
  P('algino', 'V. alginolyticus', 'V.alginolyticus'),
  P('para', 'V. parahaemolyticus', 'V.parahaemolyticus'),
  P('vulni', 'V. vulnificus', 'V.vulnificus'),
  P('pseudo', 'Pseudomonas', 'Pseudomonas'),
  P('aero', 'Aeromonas', 'Aeromonas'),
  P('pseudoGsp', 'Pseudomonas GSP', 'Pseudomonas GSP'),
  P('aeroGsp', 'Aeromonas GSP', 'Aeromonas GSP'),
  P('bactTot', 'Bact. Totales', 'Bact.Totales'),
  P('bactNar', 'Bact. Naranjas', 'Bact.Naranjas'),
  P('hongos', 'Hongos', 'Hongos'),
  P('entero', 'Enterobact.', 'Enterobact.', { noNivel: true }),
  P('levaduras', 'Levaduras', 'Levaduras', { noNivel: true }),
  P('rojas', 'Bacterias Rojas', 'Bacterias Rojas', { noNivel: true }),
];
export const PATHOGEN_BY_KEY = Object.fromEntries(PATHOGENS.map((p) => [p.key, p]));

// Color de cada patógeno (colonias de la Placa Petri + leyendas). Hues vivos que
// funcionan en tema claro y oscuro.
export const PATHOGEN_COLOR = {
  amarillos: '#F4C430', verdes: '#43A047', totales: '#26A69A',
  algino: '#FF6B35', para: '#E53935', vulni: '#D81B60',
  pseudo: '#7AE87A', aero: '#DA70D6', pseudoGsp: '#66BB6A', aeroGsp: '#BA68C8',
  bactTot: '#C8A96E', bactNar: '#FB8C00', hongos: '#8D6E63',
  entero: '#5C6BC0', levaduras: '#26C6DA', rojas: '#C62828',
};

// Variantes tolerantes de cabecera por patógeno (mayúsc/minúsc, con/sin espacio).
const colVariants = (base, suffix) => [`${base} ${suffix}`, `${base}${suffix}`, `${base} ${suffix}`.toLowerCase(), `${base}${suffix}`.toLowerCase()];
const crudoCols = (p) => colVariants(p.base, '(crudo)').concat(colVariants(p.base, ' (crudo)'));
const ufcCols = (p) => colVariants(p.base, 'UFC');
const nivelCols = (p) => colVariants(p.base, 'Nivel');

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

// ── formatos (cada uno con su set de columnas aplicables) ──
export const FORMATO_LABEL = { muestras: 'Muestras', reservorios: 'Reservorios', 'placa-amb': 'Placa ambiental', artemia: 'Artemia', otros: 'Otros' };
export function classifyFormato(raw) {
  const k = fold(raw);
  if (!k) return '';
  if (k.includes('reservorio')) return 'reservorios';
  if (k.includes('ambiental') || k.includes('placa')) return 'placa-amb';
  if (k.includes('artemia')) return 'artemia';
  if (k.includes('muestra')) return 'muestras';
  return 'otros';
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
  const tq = intStr(getField(row, CF.tq));
  const reservorio = intStr(getField(row, CF.reservorio));
  return {
    fecha: parseAnyDate(getField(row, CF.fecha)),
    fechaRaw: getField(row, CF.fecha),
    corrida: intStr(getField(row, CF.corrida)),
    responsable: getField(row, CF.responsable),
    departamento: getField(row, CF.departamento),
    formato: getField(row, CF.formato),
    formatoKey: classifyFormato(getField(row, CF.formato)),
    tipoMuestra: normTipoMuestra(getField(row, CF.tipoMuestra)),
    modulo: intStr(getField(row, CF.moduloSala)),
    estadio: getField(row, CF.estadio),
    tq,
    reservorio,
    // Ubicación legible: reservorio (R3) o tanque (T8) según el formato.
    ubicacion: reservorio ? ('R' + reservorio) : (tq ? ('T' + tq) : ''),
    etapa: getField(row, CF.etapa),
    obs: getField(row, CF.obs),
    lumin: luminPresence(row),
  };
}

/** "Derrite" una fila ancha en N registros, uno por patógeno con dato. */
export function meltRow(row) {
  const out = [];
  for (const p of PATHOGENS) {
    const ufc = parseNum(row, ufcCols(p));
    const crudo = parseNum(row, crudoCols(p));
    const nivel = p.noNivel ? '' : normNivel(getField(row, nivelCols(p)));
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
