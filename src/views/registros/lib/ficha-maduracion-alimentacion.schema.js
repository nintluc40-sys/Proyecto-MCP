/* ============================================================
   REGISTROS · esquema y cálculo de la ficha «Alimentación» de Maduración (2026-09-15, usuario)

   Cubre la hoja «ALIMENTACION %» del Excel del módulo, y la mejora:
     · Por SALA, una agenda de TOMAS: hora, alimento y % de la biomasa (0,25 a 2). La ración de una toma para un
       tanque es su biomasa (♀ + ♂) × % ÷ 100; los kg/día de un alimento son la suma de sus tomas. Horas, alimentos
       y % se cambian por sala; lo guardado queda como agenda de todos hasta que otro la cambie (se recupera de la
       columna «Tomas» de la última fila de la sala).
     · Los ANIMALES por tanque salen del libro mayor (no se teclean) y el PESO por sexo, de la última biometría de
       Tanques cuyo tanque tenía ese lote ese día; si no la hay, del peso de Ingreso del lote (ponderado por
       animales). Los dos se pueden corregir a mano.
     · Resumen por sala y general: kg/día y kg/mes por alimento, biomasa y población en producción y cuarentena.
   Hoja nueva «Maduración Alimentación»: una fila por (fecha, sala, tanque), por «ID» con MERGE. ⚠ El ID, el último.
   Modelo PURO; el monolito lleva su copia y la paridad la ata.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';
import { construirLibro, ubicKey, ESTADO_PRODUCCION, ESTADO_CUARENTENA } from './mad-libro.js';
import { salaTag } from './ficha-maduracion-ingreso.schema.js';

export const MAD_ALIM_SHEET = 'Maduración Alimentación';
export const MAD_ALIM_PRODUCTOS = ['Poliqueto', 'Redy Mate', 'Calamar', 'Mejillón', 'Krill', 'Vitallis'];
export const MAD_ALIM_PCT_MIN = 0.25;
export const MAD_ALIM_PCT_MAX = 2;
export const MAD_ALIM_DIAS_MES = 30;
/* La agenda estándar (la de la Sala 1 del Excel): 14 horas; a las 14:00 no se da alimento. Suma 14,05 %. */
export const MAD_ALIM_TOMAS_ESTANDAR = [
  ['06:00', 'Redy Mate', 0.25], ['07:00', 'Krill', 1.5], ['08:30', 'Calamar', 2], ['10:00', 'Poliqueto', 1],
  ['11:30', 'Calamar', 2], ['13:00', 'Krill', 1.5], ['14:00', '', ''], ['15:00', 'Calamar', 1.5], ['16:00', 'Krill', 0.75],
  ['18:00', 'Redy Mate', 0.25], ['20:00', 'Calamar', 1.5], ['22:00', 'Mejillón', 0.75], ['23:00', 'Krill', 0.75], ['02:00', 'Vitallis', 0.3],
].map(([hora, producto, pct]) => ({ hora, producto, pct }));

export const MAD_ALIM_COLUMNS = [
  { h: 'Fecha', k: 'fecha' },
  { h: 'Sala', k: 'sala' },
  { h: 'Tanque', k: 'tanque' },
  { h: 'Lotes', k: 'lotes' },
  { h: 'Hembras', k: 'hembras' },
  { h: 'Machos', k: 'machos' },
  { h: 'Peso hembras (g)', k: 'pesoH' },
  { h: 'Peso machos (g)', k: 'pesoM' },
  { h: 'Fuente del peso', k: 'fuente' },
  { h: 'Biomasa hembras (kg)', k: 'biomasaH' },
  { h: 'Biomasa machos (kg)', k: 'biomasaM' },
  { h: 'Biomasa total (kg)', k: 'biomasa' },
  ...MAD_ALIM_PRODUCTOS.map((p) => ({ h: p + ' (kg/día)', k: 'kg:' + p })),
  { h: 'Total (kg/día)', k: 'kgDia' },
  { h: 'Tomas', k: 'tomas' },
  { h: 'ID', k: 'id' },
];
export const MAD_ALIM_HEADERS = MAD_ALIM_COLUMNS.map((c) => c.h);

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const fecha10 = (v) => txt(v).slice(0, 10);
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const entero = (v) => {
  if (txt(v) === '') return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};
/** Cifra decimal no negativa (acepta coma), o '' si no lo es. */
export function alimNum(v) {
  const t = txt(v).replace(',', '.');
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : '';
}

/** «6:00», «06:00» o «8:30» → «HH:MM»; lo que no es una hora, ''. */
export function alimHora(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(txt(v));
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2];
}
/** Minutos desde las 06:00: el día de alimentación empieza a las 6 y las 02:00 van al final. */
export function alimOrdenDelDia(hora) {
  const h = alimHora(hora);
  if (!h) return Infinity;
  return (+h.slice(0, 2) * 60 + +h.slice(3) - 360 + 1440) % 1440;
}
const plano = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toLowerCase();
const ALIAS = { redimate: 'Redy Mate' };
/** El alimento con su grafía oficial (sin importar tildes, espacios ni mayúsculas), o ''. */
export function alimProducto(v) {
  const p = plano(v);
  if (!p) return '';
  return MAD_ALIM_PRODUCTOS.find((o) => plano(o) === p) || ALIAS[p] || '';
}

/** Las tomas ordenadas por el día de alimentación (06:00 → 05:59); sin hora, al final y en su orden. */
export function alimOrdenarTomas(tomas) {
  return (tomas || []).map((t, i) => ({ t: t || {}, i })).sort((a, b) => {
    const x = alimOrdenDelDia(a.t.hora);
    const y = alimOrdenDelDia(b.t.hora);
    return x === y ? a.i - b.i : x - y;
  }).map((o) => ({ hora: txt(o.t.hora), producto: txt(o.t.producto), pct: txt(o.t.pct) }));
}
/** Tomas que reparten alimento: hora válida, alimento de la lista y % > 0. */
export const alimTomasActivas = (tomas) => alimOrdenarTomas(tomas)
  .filter((t) => alimHora(t.hora) && alimProducto(t.producto) && alimNum(t.pct) !== '' && alimNum(t.pct) > 0)
  .map((t) => ({ hora: alimHora(t.hora), producto: alimProducto(t.producto), pct: alimNum(t.pct) }));

/** La agenda como texto para la hoja: «06:00 Redy Mate 0.25; 07:00 Krill 1.5; 14:00 —». Guarda también las horas sin alimento. */
export function alimTomasTexto(tomas) {
  return alimOrdenarTomas(tomas).filter((t) => alimHora(t.hora)).map((t) => {
    const p = alimProducto(t.producto);
    const pct = alimNum(t.pct);
    return alimHora(t.hora) + ' ' + (p ? p + (pct !== '' ? ' ' + pct : '') : '—');
  }).join('; ');
}
/** La inversa de alimTomasTexto. Lo que no se entiende se descarta. */
export function alimTomasDesdeTexto(s) {
  return txt(s).split(';').map((parte) => {
    const m = /^(\d{1,2}:\d{2})\s+(.*)$/.exec(txt(parte));
    if (!m || !alimHora(m[1])) return null;
    const resto = txt(m[2]);
    const n = /^(.*?)\s+(\d+(?:[.,]\d+)?)$/.exec(resto);
    const producto = alimProducto(n ? n[1] : resto);
    return { hora: alimHora(m[1]), producto, pct: producto && n ? alimNum(n[2]) : '' };
  }).filter(Boolean);
}

/* ── Cálculo ─────────────────────────────────────────────────────────────── */

/** Una sala: biomasa por tanque (g × animales), ración por toma y kg/día y kg/mes por alimento. */
export function alimCalcularSala(sala, tomas, tanques) {
  const activas = alimTomasActivas(tomas);
  const pctTotal = activas.reduce((a, t) => a + t.pct, 0);
  const porProductoPct = {};
  MAD_ALIM_PRODUCTOS.forEach((p) => { porProductoPct[p] = 0; });
  activas.forEach((t) => { porProductoPct[t.producto] += t.pct; });
  const tq = (tanques || []).map((x0) => {
    const x = x0 || {};
    const hembras = entero(x.hembras) || 0;
    const machos = entero(x.machos) || 0;
    const pesoH = alimNum(x.pesoH);
    const pesoM = alimNum(x.pesoM);
    const gH = hembras * (pesoH === '' ? 0 : pesoH);
    const gM = machos * (pesoM === '' ? 0 : pesoM);
    const g = gH + gM;
    const porProducto = {};
    MAD_ALIM_PRODUCTOS.forEach((p) => { porProducto[p] = r3((g * porProductoPct[p]) / 100 / 1000); });
    return { tanque: entero(x.tanque) === '' ? txt(x.tanque) : entero(x.tanque), lotes: txt(x.lotes), hembras, machos, pesoH, pesoM,
      fuente: txt(x.fuente), gramos: g, biomasaH: r3(gH / 1000), biomasaM: r3(gM / 1000), biomasa: r3(g / 1000),
      kgDia: r3((g * pctTotal) / 100 / 1000), porProducto,
      // La ración de ESTE tanque en cada toma activa, en gramos (la cuadrícula G7:V21 del Excel).
      tomasG: activas.map((t) => Math.round(((g * t.pct) / 100) * 10) / 10) };
  });
  const gSala = tq.reduce((a, t) => a + t.gramos, 0);
  return {
    sala: txt(sala),
    tomas: activas.map((t) => ({ hora: t.hora, producto: t.producto, pct: t.pct, kgSala: r3((gSala * t.pct) / 100 / 1000) })),
    tanques: tq.map((t) => {
      const c = Object.assign({}, t);
      delete c.gramos;
      return c;
    }),
    productos: MAD_ALIM_PRODUCTOS.map((p) => {
      const kgDia = r3((gSala * porProductoPct[p]) / 100 / 1000);
      return { producto: p, pct: r2(porProductoPct[p]), kgDia, kgMes: r2(kgDia * MAD_ALIM_DIAS_MES) };
    }),
    totales: {
      hembras: tq.reduce((a, t) => a + t.hembras, 0), machos: tq.reduce((a, t) => a + t.machos, 0),
      biomasaH: r3(tq.reduce((a, t) => a + t.hembras * (t.pesoH === '' ? 0 : t.pesoH), 0) / 1000),
      biomasaM: r3(tq.reduce((a, t) => a + t.machos * (t.pesoM === '' ? 0 : t.pesoM), 0) / 1000),
      biomasa: r3(gSala / 1000), pctDia: r2(pctTotal),
      kgDia: r3((gSala * pctTotal) / 100 / 1000), kgMes: r2(r3((gSala * pctTotal) / 100 / 1000) * MAD_ALIM_DIAS_MES),
    },
  };
}

/** Todas las salas: kg/día y kg/mes por alimento y totales. */
export function alimResumenGeneral(salasCalculadas) {
  const salas = salasCalculadas || [];
  const productos = MAD_ALIM_PRODUCTOS.map((p) => {
    const kgDia = r3(salas.reduce((a, s) => a + ((s.productos || []).find((x) => x.producto === p) || { kgDia: 0 }).kgDia, 0));
    return { producto: p, kgDia, kgMes: r2(kgDia * MAD_ALIM_DIAS_MES) };
  });
  const suma = (k) => salas.reduce((a, s) => a + ((s.totales || {})[k] || 0), 0);
  // El total sale de los totales de cada sala (calculados sin redondear), no de sumar alimentos ya redondeados.
  const kgDia = r3(suma('kgDia'));
  return { productos, totales: { hembras: suma('hembras'), machos: suma('machos'), biomasa: r3(suma('biomasa')), kgDia, kgMes: r2(kgDia * MAD_ALIM_DIAS_MES) } };
}

/** Animales vivos por estado del lote en su sala (el «TOTAL POBLACIONAL» del Excel). */
export function alimPoblacion(libro) {
  const out = { produccion: { hembras: 0, machos: 0 }, cuarentena: { hembras: 0, machos: 0 } };
  for (const L of libro.lotes.values()) {
    for (const S of L.salas || []) {
      const k = S.estado === ESTADO_PRODUCCION ? 'produccion' : S.estado === ESTADO_CUARENTENA ? 'cuarentena' : '';
      if (!k) continue;
      out[k].hembras += S.hembras;
      out[k].machos += S.machos;
    }
  }
  return out;
}

/** Tanques con animales de cada sala, según el libro: [{ tanque, lotes, hembras, machos }], por número. */
export function alimTanquesDelLibro(libro) {
  const porSala = {};
  for (const T of libro.tanques.values()) {
    const vivos = T.composicion.filter((c) => c.machos > 0 || c.hembras > 0);
    if (!vivos.length) continue;
    if (!porSala[T.sala]) porSala[T.sala] = [];
    const lotes = [];
    vivos.forEach((c) => { if (lotes.indexOf(c.lote) === -1) lotes.push(c.lote); });
    porSala[T.sala].push({ tanque: T.tanque, lotes: lotes.join(', '), hembras: T.hembras, machos: T.machos });
  }
  Object.keys(porSala).forEach((s) => porSala[s].sort((a, b) => a.tanque - b.tanque));
  return porSala;
}

/** Peso de referencia por tanque y sexo: última biometría de Tanques de un día en que el tanque tenía alguno de sus
    lotes de hoy; si no la hay, el de Ingreso de esos lotes (el del mismo tanque si existe; si no, de todo el lote),
    ponderado por animales. → { [ubicKey]: { hembras: {valor, fuente, fecha}, machos: {…} } } */
export function alimPesosDeReferencia(fuentes, libro) {
  const f = fuentes || {};
  const alDia = new Map();
  const libroAl = (fecha) => {
    if (!alDia.has(fecha)) alDia.set(fecha, construirLibro(f, { hoy: fecha, hasta: fecha }));
    return alDia.get(fecha);
  };
  const filasTq = (f.tanques || []).filter((r) => txt(r.Sala) && entero(r.Tanque) !== '' && esFecha(fecha10(r.Fecha)));
  const ingresos = f.ingresos || [];
  const vacio = { valor: '', fuente: '', fecha: '' };
  const out = {};
  for (const T of libro.tanques.values()) {
    const lotes = T.composicion.filter((c) => c.machos > 0 || c.hembras > 0).map((c) => c.lote);
    if (!lotes.length) continue;
    const k = ubicKey(T.sala, T.tanque);
    const desde = lotes.map((l) => (libro.lotes.get(l) || {}).ingreso || '').filter(Boolean).sort()[0] || '';
    const suyas = filasTq.filter((r) => ubicKey(r.Sala, r.Tanque) === k && fecha10(r.Fecha) >= desde);
    const biometria = (col) => {
      const con = suyas.filter((r) => alimNum(r[col]) !== '' && alimNum(r[col]) > 0);
      const fechas = [...new Set(con.map((r) => fecha10(r.Fecha)))].sort().reverse();
      for (const d of fechas) {
        const Tf = libroAl(d).tanques.get(k);
        if (!Tf || !Tf.composicion.some((c) => lotes.indexOf(c.lote) !== -1 && (c.machos > 0 || c.hembras > 0))) continue;
        const v = con.filter((r) => fecha10(r.Fecha) === d).map((r) => alimNum(r[col]));
        return { valor: r2(v.reduce((a, b) => a + b, 0) / v.length), fuente: 'Biometría', fecha: d };
      }
      return null;
    };
    const ingreso = (col, colAnimales) => {
      const del = ingresos.filter((r) => lotes.indexOf(txt(r.Lote)) !== -1 && alimNum(r[col]) !== '' && alimNum(r[col]) > 0);
      const mismos = del.filter((r) => ubicKey(r.Sala, r.Tanque) === k);
      const usar = mismos.length ? mismos : del;
      if (!usar.length) return null;
      const n = usar.reduce((a, r) => a + (entero(r[colAnimales]) || 0), 0);
      const valor = n > 0
        ? usar.reduce((a, r) => a + alimNum(r[col]) * (entero(r[colAnimales]) || 0), 0) / n
        : usar.reduce((a, r) => a + alimNum(r[col]), 0) / usar.length;
      return { valor: r2(valor), fuente: 'Ingreso', fecha: usar.map((r) => fecha10(r.Fecha)).sort().reverse()[0] || '' };
    };
    out[k] = {
      hembras: biometria('Peso promedio hembras (g)') || ingreso('Peso promedio hembras (g)', 'Hembras') || vacio,
      machos: biometria('Peso promedio machos (g)') || ingreso('Peso promedio machos (g)', 'Machos') || vacio,
    };
  }
  return out;
}

/** La última agenda guardada de cada sala en la hoja (por fecha; a igual fecha, la última fila). */
export function alimAgendasDeHoja(filas) {
  const out = {};
  (filas || []).forEach((r) => {
    const sala = txt(r.Sala);
    const fecha = fecha10(r.Fecha);
    const tomas = txt(r.Tomas);
    if (!sala || !esFecha(fecha) || !tomas) return;
    if (!out[sala] || fecha >= out[sala].fecha) out[sala] = { fecha, tomas: alimTomasDesdeTexto(tomas) };
  });
  return out;
}

/* ── Hoja ────────────────────────────────────────────────────────────────── */

export const alimRowId = (fecha, sala, tanque) => sanitizeStr(fecha, 10) + '-' + salaTag(sala) + '-T' + entero(tanque);

/** Una fila por tanque con animales de cada sala. */
export function buildAlimRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const filas = [];
  (m.salas || []).forEach((s0) => {
    const s = s0 || {};
    const sala = sanitizeStr(s.sala, 30);
    if (!sala) return;
    const calc = alimCalcularSala(sala, s.tomas, s.tanques);
    const texto = alimTomasTexto(s.tomas);
    calc.tanques.forEach((t) => {
      if (t.hembras + t.machos === 0 || entero(t.tanque) === '') return;
      const v = { fecha, sala, tanque: t.tanque, lotes: sanitizeStr(t.lotes, 120), hembras: t.hembras, machos: t.machos, pesoH: t.pesoH, pesoM: t.pesoM,
        fuente: sanitizeStr(t.fuente, 120), biomasaH: t.biomasaH, biomasaM: t.biomasaM, biomasa: t.biomasa, kgDia: t.kgDia, tomas: texto,
        id: alimRowId(fecha, sala, t.tanque) };
      MAD_ALIM_PRODUCTOS.forEach((p) => { v['kg:' + p] = t.porProducto[p]; });
      filas.push(MAD_ALIM_COLUMNS.map((c) => (v[c.k] === undefined ? '' : v[c.k])));
    });
  });
  return filas;
}

export function buildAlimPayload(model) {
  return { sheetName: MAD_ALIM_SHEET, headers: MAD_ALIM_HEADERS.slice(), rows: buildAlimRows(model) };
}

/** ERROR: fecha, hora no válida, alimento fuera de la lista, % que no es cifra, % sin alimento, la misma toma dos
    veces, animales que no son cifra, una sala con animales y sin tomas, nada que guardar.
    AVISO: alimento sin %, % fuera de 0,25–2, tanque con animales de un sexo sin su peso. */
export function validarAlim(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];
  if (!esFecha(String(m.fecha || ''))) errores.push('La fecha no es válida.');
  let filas = 0;
  (m.salas || []).forEach((s0) => {
    const s = s0 || {};
    const sala = sanitizeStr(s.sala, 30);
    if (!sala) return;
    const vistas = {};
    (s.tomas || []).forEach((t0, i) => {
      const t = t0 || {};
      const et = sala + ' · toma ' + (i + 1) + (alimHora(t.hora) ? ' (' + alimHora(t.hora) + ')' : '');
      if (txt(t.hora) === '' && txt(t.producto) === '' && txt(t.pct) === '') return;
      if (!alimHora(t.hora)) errores.push(et + ': la hora no es válida (usa HH:MM).');
      if (txt(t.producto) !== '' && !alimProducto(t.producto)) errores.push(et + ': «' + txt(t.producto) + '» no es un alimento de la lista.');
      if (txt(t.pct) !== '' && alimNum(t.pct) === '') errores.push(et + ': el % no es una cifra válida.');
      const p = alimProducto(t.producto);
      const pct = alimNum(t.pct);
      if (!p && pct !== '' && pct > 0) errores.push(et + ': tiene % pero no alimento.');
      if (p && (pct === '' || pct === 0)) avisos.push(et + ': ' + p + ' sin %: no reparte alimento.');
      if (p && pct !== '' && pct > 0 && (pct < MAD_ALIM_PCT_MIN || pct > MAD_ALIM_PCT_MAX)) {
        avisos.push(et + ': ' + pct + ' % está fuera de lo habitual (' + MAD_ALIM_PCT_MIN + ' a ' + MAD_ALIM_PCT_MAX + ').');
      }
      const clave = alimHora(t.hora) + '|' + p;
      if (p && alimHora(t.hora)) {
        if (vistas[clave] === 1) errores.push(et + ': ' + p + ' ya está a esa hora. Júntalas.');
        vistas[clave] = 1;
      }
    });
    let conAnimales = 0;
    (s.tanques || []).forEach((x0) => {
      const x = x0 || {};
      const et = sala + ' · tanque ' + txt(x.tanque);
      ['hembras', 'machos'].forEach((k) => { if (txt(x[k]) !== '' && entero(x[k]) === '') errores.push(et + ': ' + k + ' no es una cifra válida.'); });
      [['pesoH', 'hembras'], ['pesoM', 'machos']].forEach(([kp, k]) => {
        if (txt(x[kp]) !== '' && alimNum(x[kp]) === '') errores.push(et + ': el peso de ' + k + ' no es una cifra válida.');
        else if ((entero(x[k]) || 0) > 0 && !(alimNum(x[kp]) > 0)) avisos.push(et + ': hay ' + k + ' sin peso; su biomasa cuenta 0.');
      });
      if ((entero(x.hembras) || 0) + (entero(x.machos) || 0) > 0 && entero(x.tanque) !== '') { conAnimales++; filas++; }
    });
    if (conAnimales && !alimTomasActivas(s.tomas).length) errores.push(sala + ': tiene animales y ninguna toma con alimento y %.');
  });
  if (!filas && !errores.length) errores.push('No hay tanques con animales que guardar: pulsa 🔄 Leer saldo y pesos.');
  return { errores, avisos };
}
