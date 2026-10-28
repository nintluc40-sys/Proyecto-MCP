/* ============================================================
   MADURACIÓN · OPERATIVO — las ZONAS de desove y los reservorios (2026-10-27, Sesión A ronda 9, tarea 2)

   La hoja «Maduración Zonas» (desde el 2026-10-27, ronda 8) lleva la temperatura cada 2 h y el O₂ cada 6 h de las zonas
   de desove —por TANQUE— y de los reservorios —por ÁREA, sin tanque—, con las MISMAS columnas que «Maduración Sala»
   (`RESUMEN_TEMPS`, `RESUMEN_OXIGENOS`): es la misma medición en otro sitio. Se tecleaba y no se veía en ninguna parte.
   Decisiones del usuario (2026-10-27): un bloque en 🏠 Salas, como la grilla de captura (Día: cada toma; Período: por
   zona y tanque, días con lectura y mínima–media–máxima), con los MISMOS umbrales de las salas en todas las zonas
   (también los reservorios), y la hoja, diaria como la de la Sala en «Últimos registros».
   Los filtros del tablero (sala, tanque, lote…) no aplican: las zonas no son salas de animales.
   Módulo PURO: recibe las filas de `M.fuentes.zonas` (fecha ISO, las de `fuentesDesdeFilas`).
   ============================================================ */
import { RESUMEN_TEMPS, RESUMEN_OXIGENOS } from '../registros/lib/mad-resumen.js';
import { evaluar } from './operativo.umbrales.js';

/** Las zonas y sus tanques, en el orden de la grilla de captura (MAD_ZONAS de engine.js e index (8); la prueba exige que
 *  coincidan). Un reservorio no tiene tanques. */
export const ZONAS = [
  { zona: 'Sala desove (masivos)', tanques: 6 },
  { zona: 'Sala desove/eclosión 1', tanques: 5 },
  { zona: 'Sala desove/eclosión 2', tanques: 5 },
  { zona: 'Reservorio 1', tanques: 0 },
  { zona: 'Reservorio 2', tanques: 0 },
];
const horaDe = (columna) => columna.split(' ').pop();
/** Las horas de las tomas: la temperatura, 2:00 … 0:00; el O₂, 06:00 … 00:00. */
export const HORAS_TEMP = RESUMEN_TEMPS.map(horaDe);
export const HORAS_OX = RESUMEN_OXIGENOS.map(horaDe);

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
/* El mismo criterio que `num` del tablero y del Saldo: vacío → null; lo que no es un número finito → null. */
const num = (v) => { const t = txt(v); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const tanqueDe = (r) => { const n = num(r.Tanque); return n === null ? '' : n; };

/** El puesto de (zona, tanque) en la grilla; lo que no está en el catálogo, detrás, por nombre. */
function orden(a, b) {
  const i = (z) => { const k = ZONAS.findIndex((x) => x.zona === z); return k < 0 ? ZONAS.length : k; };
  return i(a.zona) - i(b.zona) || (i(a.zona) === ZONAS.length ? a.zona.localeCompare(b.zona, 'es') : 0)
    || (a.tanque === '' ? -1 : b.tanque === '' ? 1 : a.tanque - b.tanque);
}
const clave = (r) => txt(r.Zona) + '|' + tanqueDe(r);

/**
 * Las lecturas de UN día: una fila por (zona, tanque) con alguna, en el orden de la grilla. Cada toma, con su estado
 * frente al umbral vigente de la sala ('ok' | 'bajo' | 'alto'; '' sin valor). Si una (zona, tanque) trae dos filas el
 * mismo día (la llave del GAS es (Fecha, Zona, Tanque): no debería), cada lectura es la ÚLTIMA que la trae, como en el
 * detalle de una sala.
 */
export function zonasDelDia(filas, fecha) {
  const por = new Map();
  for (const r of filas || []) {
    if (txt(r.Fecha).slice(0, 10) !== fecha || !txt(r.Zona)) continue;
    const k = clave(r);
    if (!por.has(k)) por.set(k, { zona: txt(r.Zona), tanque: tanqueDe(r), temp: HORAS_TEMP.map(() => null), ox: HORAS_OX.map(() => null) });
    const z = por.get(k);
    RESUMEN_TEMPS.forEach((c, i) => { const v = num(r[c]); if (v !== null) z.temp[i] = v; });
    RESUMEN_OXIGENOS.forEach((c, i) => { const v = num(r[c]); if (v !== null) z.ox[i] = v; });
  }
  return [...por.values()]
    .filter((z) => z.temp.some((v) => v !== null) || z.ox.some((v) => v !== null))
    .map((z) => ({
      ...z,
      estTemp: z.temp.map((v) => (v === null ? '' : evaluar('temperatura', v))),
      estOx: z.ox.map((v) => (v === null ? '' : evaluar('oxigeno', v))),
    }))
    .sort(orden);
}

/** Mínima, media y máxima de unas lecturas, y cuántas quedan por debajo y por encima del umbral de `id`. */
function resumen(valores, id) {
  if (!valores.length) return { n: 0, min: null, med: null, max: null, bajo: 0, alto: 0 };
  const est = valores.map((v) => evaluar(id, v));
  return {
    n: valores.length, min: Math.min(...valores), max: Math.max(...valores),
    med: valores.reduce((s, x) => s + x, 0) / valores.length,
    bajo: est.filter((e) => e === 'bajo').length, alto: est.filter((e) => e === 'alto').length,
  };
}

/**
 * El período [desde, hasta] por (zona, tanque): los días con alguna lectura y, de TODAS sus tomas, la mínima, la media y
 * la máxima de la temperatura y del O₂, con cuántas tomas quedan fuera del umbral. Sólo las (zona, tanque) con alguna
 * lectura en el período; en el orden de la grilla.
 */
export function zonasDelPeriodo(filas, desde, hasta) {
  const por = new Map();
  for (const r of filas || []) {
    const f = txt(r.Fecha).slice(0, 10);
    if (!esIso(f) || f < desde || f > hasta || !txt(r.Zona)) continue;
    const k = clave(r);
    if (!por.has(k)) por.set(k, { zona: txt(r.Zona), tanque: tanqueDe(r), dias: new Map() });
    // por día y toma, la última lectura (como `zonasDelDia`): una fila repetida no cuenta dos veces
    const d = por.get(k).dias;
    if (!d.has(f)) d.set(f, { temp: new Map(), ox: new Map() });
    RESUMEN_TEMPS.forEach((c) => { const v = num(r[c]); if (v !== null) d.get(f).temp.set(c, v); });
    RESUMEN_OXIGENOS.forEach((c) => { const v = num(r[c]); if (v !== null) d.get(f).ox.set(c, v); });
  }
  return [...por.values()].map((z) => {
    const dias = [...z.dias.values()].filter((d) => d.temp.size || d.ox.size);
    return {
      zona: z.zona, tanque: z.tanque, dias: dias.length,
      temp: resumen(dias.flatMap((d) => [...d.temp.values()]), 'temperatura'),
      ox: resumen(dias.flatMap((d) => [...d.ox.values()]), 'oxigeno'),
    };
  }).filter((z) => z.dias > 0).sort(orden);
}

/** Los días de TODO el registro con alguna lectura de zonas, en orden: para decir cuál fue la última. */
export function diasConZonas(filas) {
  const dias = new Set();
  for (const r of filas || []) {
    const f = txt(r.Fecha).slice(0, 10);
    if (esIso(f) && [...RESUMEN_TEMPS, ...RESUMEN_OXIGENOS].some((c) => num(r[c]) !== null)) dias.add(f);
  }
  return [...dias].sort();
}

/** El rótulo de un (zona, tanque): «Tanque 3», o la zona sola en un reservorio. */
export const rotuloTanque = (z) => (z.tanque === '' ? 'toda el área' : 'Tanque ' + z.tanque);
