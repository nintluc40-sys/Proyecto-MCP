/* ============================================================
   REGISTROS · esquema de la ficha «Tratamientos» de Maduración (2026-09-15, usuario)

   Registra lo que se APLICA, en dos bloques (diseño B, elegido por el usuario):
     · 🛡 Preventivos por LOTE: productos y, aparte, lo que va al RAS.
     · 🧽 Desinfección de instalaciones, por ÁREA.
   Una fila por aplicación (una por tarjeta), con los productos marcados en una sola celda.
   Modelo PURO — sin DOM, sin localStorage, sin red. El monolito lleva su copia inline.

   🔑 PLANTILLAS POR ESTADO DE LA SALA (decisión del usuario): se elige el estado en la ficha y quedan
   pre-marcados sus productos, que se ajustan a mano. Una área de desinfección pre-marca lo suyo sólo
   si la tarjeta no tiene nada marcado.

   La hoja va por columna «ID» con MERGE en el GAS, como Ingreso, Movimientos y Fin de Ciclo: reenviar
   CORRIGE, y un texto no se vacía reenviándolo en blanco.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_TANQUES_POR_SALA, salaTag } from './ficha-maduracion-ingreso.schema.js';
import { normLote } from './ficha-maduracion-desoves.schema.js';

export const MAD_TRAT_SHEET = 'Maduración Tratamientos';

export const MAD_TRAT_ESTADOS = ['Producción', 'Cuarentena', 'Mixto', 'Desinfección', 'Desinfección - Producción agrupada'];

/** Catálogos, en el orden en que los dio el usuario. */
export const MAD_TRAT_PREVENTIVOS = ['Cooper', 'Formol', 'Bacmil', 'Lactosac', 'Lipofeed', 'Carbonato de Calcio', 'Complex B', 'Vitamina C', 'Full Calcio', 'Prokura'];
export const MAD_TRAT_RAS = ['Bicarbonato', 'EM-1', 'Full Calcio', 'Prokura'];
/* 2026-09-15 (usuario) · Ácido Nítrico, Peróxido y Trilon B entran al catálogo, al final, en el
   orden en que los dio. NO se pre-marcan en ninguna área: no dijo dónde se usan, y adivinarlo
   dejaría casillas puestas que nadie pidió — que en una ficha de desinfección es peor que
   tener que marcarlas a mano.
   2026-09-16 (usuario, PE1.7) · «Treflam», al final, con el mismo criterio: tampoco se pre-marca en ninguna área. */
export const MAD_TRAT_DESINFECTANTES = ['Formol', 'Cloro', 'Jabón neutro', 'Virkon', 'Vitamina C', 'Bicarbonato', 'Full Calcio', 'EM-1', 'Prokura', 'Cooper',
  'Ácido Nítrico', 'Peróxido', 'Trilon B', 'Treflam'];

/** Áreas de desinfección, con su etiqueta para el ID y lo habitual que se pre-marca. */
export const MAD_TRAT_AREAS = [
  'Salas y tanques',
  'RAS y tuberías',
  'Líneas de agua y aire, tinas y reservorios',
  'Desove, Eclosión y Despacho',
  'Conos, baldes, tinas y tuberías',
  /* 2026-09-15 (usuario). «Reservorio» convive con «Líneas de agua y aire, tinas y reservorios»:
     son áreas distintas para él y el ID las separa por su etiqueta, así que no se funden. */
  'Reservorio',
  'Colectores',
];
const AREA_TAG = {
  'Salas y tanques': 'SALAS',
  'RAS y tuberías': 'RAS',
  'Líneas de agua y aire, tinas y reservorios': 'LINEAS',
  'Desove, Eclosión y Despacho': 'DESOVE',
  'Conos, baldes, tinas y tuberías': 'UTENSILIOS',
  Reservorio: 'RESERVORIO',
  Colectores: 'COLECTORES',
};
const LIMPIEZA = ['Formol', 'Cloro', 'Jabón neutro', 'Virkon', 'Vitamina C'];
const AREA_PRODUCTOS = {
  'Salas y tanques': LIMPIEZA,
  'RAS y tuberías': ['Cloro', 'Vitamina C', 'Bicarbonato', 'Full Calcio', 'EM-1', 'Prokura'],
  'Líneas de agua y aire, tinas y reservorios': LIMPIEZA,
  'Desove, Eclosión y Despacho': LIMPIEZA,
  'Conos, baldes, tinas y tuberías': LIMPIEZA,
  /* La limpieza habitual, igual que sus hermanas. Sigue siendo una SUPOSICIÓN declarada, como
     ya lo era para «Desove, Eclosión y Despacho» y los utensilios: se ajusta a mano. */
  Reservorio: LIMPIEZA,
  Colectores: LIMPIEZA,
};

/* Plantillas por estado (el ejemplo del usuario). La agrupada lleva las dos. */
const PRODUCCION = { preventivos: ['Bacmil', 'Lactosac', 'Lipofeed', 'Vitamina C', 'Complex B', 'Full Calcio'], ras: ['Bicarbonato', 'EM-1'], desinfeccion: [] };
const DESINFECCION = { preventivos: [], ras: [], desinfeccion: ['Formol', 'Cooper', 'Virkon'] };
const PLANTILLAS = {
  'Producción': PRODUCCION,
  'Cuarentena': PRODUCCION,
  'Mixto': PRODUCCION,
  'Desinfección': DESINFECCION,
  'Desinfección - Producción agrupada': { preventivos: PRODUCCION.preventivos, ras: PRODUCCION.ras, desinfeccion: DESINFECCION.desinfeccion },
};
const propia = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Lo que se pre-marca al elegir el estado de la sala. */
export function plantillaTrat(estado) {
  const e = sanitizeStr(estado, 60);
  const p = propia(PLANTILLAS, e) ? PLANTILLAS[e] : { preventivos: [], ras: [], desinfeccion: [] };
  return { preventivos: p.preventivos.slice(), ras: p.ras.slice(), desinfeccion: p.desinfeccion.slice() };
}

/** Lo habitual de un área. */
export function productosDeArea(area) {
  const a = sanitizeStr(area, 80);
  return propia(AREA_PRODUCTOS, a) ? AREA_PRODUCTOS[a].slice() : [];
}

export const MAD_TRAT_COLUMNS = [
  { h: 'Fecha', k: 'fecha' },
  { h: 'Sala', k: 'sala' },
  { h: 'Estado de la sala', k: 'estado' },
  { h: 'Tipo', k: 'tipo' },
  { h: 'Área', k: 'area' },
  { h: 'Lotes', k: 'lotes' },
  { h: 'Productos', k: 'productos' },
  { h: 'Productos RAS', k: 'ras' },
  { h: 'Dosis y observaciones', k: 'dosis' },
  /* ⚠ El ID va el ÚLTIMO: el GAS lo localiza por su cabecera y, si faltara, cae a la última columna. */
  { h: 'ID', k: 'id' },
];
export const MAD_TRAT_HEADERS = MAD_TRAT_COLUMNS.map((c) => c.h);

const norm = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();

/** Productos conocidos de un catálogo: sin repetir, sin lo desconocido y en el orden del catálogo. */
export function productosDe(catalogo, v) {
  const pedidos = new Set((Array.isArray(v) ? v : String(v == null ? '' : v).split(',')).map(norm));
  return catalogo.filter((p) => pedidos.has(norm(p)));
}

/** Lotes separados por coma: normalizados, sin repetir y ordenados (el mismo grupo da la misma fila). */
export function lotesDe(v) {
  const vistos = new Set();
  (Array.isArray(v) ? v : String(v == null ? '' : v).split(',')).forEach((x) => {
    const l = normLote(x);
    if (l) vistos.add(l);
  });
  return [...vistos].sort();
}

const salaId = (sala) => (sanitizeStr(sala, 30) ? salaTag(sala) : 'GEN');
export const tratIdPreventivo = (fecha, sala, lotes) => sanitizeStr(fecha, 10) + '-' + salaId(sala) + '-P-' + lotesDe(lotes).join('.');
export const tratIdDesinfeccion = (fecha, sala, area) => {
  const a = sanitizeStr(area, 80);
  return sanitizeStr(fecha, 10) + '-' + salaId(sala) + '-D-' + (propia(AREA_TAG, a) ? AREA_TAG[a] : 'OTRA');
};

/** Una fila por tarjeta completa: un preventivo con lotes y algo aplicado; una desinfección con área y productos. */
export function buildTratRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const sala = sanitizeStr(m.sala, 30);
  const estado = sanitizeStr(m.estado, 60);
  const filas = [];
  const fila = (v) => filas.push(MAD_TRAT_COLUMNS.map((c) => v[c.k]));
  (m.preventivos || []).forEach((p) => {
    const x = p || {};
    const lotes = lotesDe(x.lotes);
    const productos = productosDe(MAD_TRAT_PREVENTIVOS, x.productos);
    const ras = productosDe(MAD_TRAT_RAS, x.ras);
    if (!lotes.length || (!productos.length && !ras.length)) return;
    fila({ fecha, sala, estado, tipo: 'Preventivo', area: 'Lotes', lotes: lotes.join(', '), productos: productos.join(', '),
      ras: ras.join(', '), dosis: sanitizeStr(x.dosis, 300), id: tratIdPreventivo(fecha, sala, lotes) });
  });
  (m.desinfecciones || []).forEach((d) => {
    const x = d || {};
    const area = sanitizeStr(x.area, 80);
    const productos = productosDe(MAD_TRAT_DESINFECTANTES, x.productos);
    if (MAD_TRAT_AREAS.indexOf(area) === -1 || !productos.length) return;
    fila({ fecha, sala, estado, tipo: 'Desinfección', area, lotes: '', productos: productos.join(', '),
      ras: '', dosis: sanitizeStr(x.dosis, 300), id: tratIdDesinfeccion(fecha, sala, area) });
  });
  return filas;
}

export function buildTratPayload(model) {
  return { sheetName: MAD_TRAT_SHEET, headers: MAD_TRAT_HEADERS.slice(), rows: buildTratRows(model) };
}

/** ERROR impide guardar (una tarjeta a medias, o dos que escribirían la misma fila); AVISO deja guardar.
 *  Una tarjeta sin nada se ignora. */
export function validarTrat(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || ''))) errores.push('La fecha no es válida.');
  const sala = sanitizeStr(m.sala, 30);
  if (sala !== '' && !MAD_TANQUES_POR_SALA[sala]) avisos.push('«' + sala + '» no es una sala conocida.');
  const estado = sanitizeStr(m.estado, 60);
  if (estado !== '' && MAD_TRAT_ESTADOS.indexOf(estado) === -1) avisos.push('«' + estado + '» no es un estado de sala conocido.');

  const ids = new Set();
  let completas = 0;
  (m.preventivos || []).forEach((p, i) => {
    const x = p || {};
    const lotes = lotesDe(x.lotes);
    const algo = productosDe(MAD_TRAT_PREVENTIVOS, x.productos).length + productosDe(MAD_TRAT_RAS, x.ras).length;
    const et = 'el preventivo ' + (i + 1);
    if (!lotes.length && !algo && sanitizeStr(x.dosis, 300) === '') return;
    if (!lotes.length) errores.push('Falta el lote de ' + et + '.');
    if (!algo) errores.push('En ' + et + ' no hay ningún producto marcado.');
    if (sala === '') errores.push('Falta la sala de ' + et + ': los lotes se tratan en su sala.');
    if (!lotes.length || !algo) return;
    const id = tratIdPreventivo(m.fecha, sala, lotes);
    if (ids.has(id)) errores.push('Los lotes ' + lotes.join(', ') + ' tienen dos preventivos en esta fecha y sala: escribirían la misma fila. Júntalos.');
    ids.add(id);
    completas++;
  });
  (m.desinfecciones || []).forEach((d, i) => {
    const x = d || {};
    const area = sanitizeStr(x.area, 80);
    const productos = productosDe(MAD_TRAT_DESINFECTANTES, x.productos);
    const et = 'la desinfección ' + (i + 1);
    if (area === '' && !productos.length && sanitizeStr(x.dosis, 300) === '') return;
    if (area === '') errores.push('Falta el área de ' + et + '.');
    else if (MAD_TRAT_AREAS.indexOf(area) === -1) errores.push('«' + area + '» no es un área conocida (' + et + ').');
    if (!productos.length) errores.push('En ' + et + ' no hay ningún producto marcado.');
    if (area === 'Salas y tanques' && sala === '') errores.push('Falta la sala de ' + et + ': es la desinfección de sus salas y tanques.');
    if (MAD_TRAT_AREAS.indexOf(area) === -1 || !productos.length) return;
    const id = tratIdDesinfeccion(m.fecha, sala, area);
    if (ids.has(id)) errores.push('«' + area + '» se desinfecta dos veces en esta fecha' + (sala ? ' y sala' : '') + ': escribirían la misma fila. Júntalas.');
    ids.add(id);
    completas++;
  });
  if (!completas && !errores.length) errores.push('No hay ningún tratamiento que registrar: marca al menos un producto.');
  return { errores, avisos };
}
