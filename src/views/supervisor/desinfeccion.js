/* ============================================================
   SUPERVISOR · Fase de Desinfección (pre-siembra) para la Vista Ejecutiva
   Lee la hoja "Registro_Desinfección" del Google Sheet. Un módulo/corrida está
   "en desinfección" (etapa gris) cuando tiene registros de los tipos de INICIO
   (T2 "Desinfección de módulo larvicultura" y T3 "Limpieza de materiales y
   equipos de larvicultura") y la corrida AÚN NO tiene datos de Larvicultura
   (no se ha sembrado). Al iniciar la siembra, deja de estar en gris.
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, F, isLarviculturaRow } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { monthIndexOfCorrida } from './prodOmarsa.js';

const TIPO_KEYS = ['Tipo de Registro', 'Tipo_de_Registro', 'Tipo de registro', 'tipo de registro', 'TipoRegistro'];

// Minúsculas + sin tildes, para comparar etiquetas con tolerancia.
const norm = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Filas de la hoja de desinfección (origen tolerante: la hoja no se clasifica
// especialmente, así que _SheetOrigin conserva el nombre de la pestaña).
const desinfRows = () =>
  store.globalData.filter((r) => /desinfecci/i.test(String(r._SheetOrigin || '')));

// Tipos de registro que marcan la desinfección INICIAL (pre-siembra): T2 y T3.
function isStartType(tipo) {
  const t = norm(tipo);
  return t.includes('modulo larvicultura') || t.includes('materiales y equipos de larvicultura');
}

// Claves (módulo|corrida) que ya tienen datos de Larvicultura → ya sembrados.
function sembradoKeys() {
  const set = new Set();
  store.globalData.filter(isLarviculturaRow).forEach((r) => {
    const m = getField(r, F.modulo), c = getField(r, F.corrida);
    if (m && c) set.add(m + '|' + c);
  });
  return set;
}

/**
 * Módulos/corridas EN desinfección inicial sin siembra todavía.
 * @returns {Array<{mod, corrida, monthIdx, lastDate, count}>}
 */
export function desinfeccionEnCurso() {
  const rows = desinfRows().filter((r) => isStartType(getField(r, TIPO_KEYS)));
  if (!rows.length) return [];
  const sembrados = sembradoKeys();
  const map = new Map(); // "mod|cor" -> { mod, corrida, dates:[], count }
  rows.forEach((r) => {
    const mod = getField(r, F.modulo), cor = getField(r, F.corrida);
    if (!mod || !cor) return;
    const key = mod + '|' + cor;
    if (sembrados.has(key)) return; // ya sembrado → no es fase gris
    if (!map.has(key)) map.set(key, { mod, corrida: cor, dates: [], count: 0 });
    const e = map.get(key);
    e.count++;
    const d = parseAnyDate(getField(r, F.fecha));
    if (d && !isNaN(d)) e.dates.push(d.getTime());
  });
  return [...map.values()].map((e) => ({
    mod: e.mod,
    corrida: e.corrida,
    monthIdx: monthIndexOfCorrida(+e.corrida),
    lastDate: e.dates.length ? new Date(Math.max(...e.dates)) : null,
    count: e.count,
  }));
}

const CAT_KEYS = ['Categoría', 'Categoria', 'categoría', 'categoria', 'CATEGORIA'];
const ELEM_KEYS = ['Elemento', 'elemento', 'ELEMENTO'];
const EST_KEYS = ['Estado', 'estado', 'ESTADO'];
const OBS_KEYS = ['Observaciones', 'Observación', 'observaciones', 'observacion', 'Observacion'];

/**
 * Detalle de desinfección de un módulo+corrida (TODOS los registros), agrupado
 * por Tipo → Categoría → Elemento, con % de cumplimiento = 'Sí' / (Sí + No).
 * @returns {null | { cumplimiento, si, no, fecha, tipos:[{tipo, cats:[{cat, elems:[{elem,estado,obs}]}]}] }}
 */
export function desinfeccionDetalle(mod, corrida) {
  const rows = desinfRows().filter(
    (r) => getField(r, F.modulo) === mod && (!corrida || getField(r, F.corrida) === corrida),
  );
  if (!rows.length) return null;
  const tipos = new Map(); // tipo -> Map(cat -> [{elem,estado,obs}])
  let si = 0, no = 0;
  const dates = [];
  rows.forEach((r) => {
    const tipo = getField(r, TIPO_KEYS) || '—';
    const cat = getField(r, CAT_KEYS) || '—';
    const elem = getField(r, ELEM_KEYS) || '—';
    const estado = getField(r, EST_KEYS);
    const obs = getField(r, OBS_KEYS);
    const e = norm(estado);
    if (e === 'si') si++;
    else if (e === 'no') no++;
    if (!tipos.has(tipo)) tipos.set(tipo, new Map());
    const cats = tipos.get(tipo);
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat).push({ elem, estado, obs });
    const d = parseAnyDate(getField(r, F.fecha));
    if (d && !isNaN(d)) dates.push(d.getTime());
  });
  const total = si + no;
  return {
    cumplimiento: total ? Math.round((si / total) * 100) : null,
    si, no,
    fecha: dates.length ? new Date(Math.min(...dates)) : null,
    tipos: [...tipos.entries()].map(([tipo, cats]) => ({
      tipo,
      cats: [...cats.entries()].map(([cat, elems]) => ({ cat, elems })),
    })),
  };
}
