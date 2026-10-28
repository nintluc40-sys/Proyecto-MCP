/* ============================================================
   🌦 CLIMA · capa de datos PURA (2026-10-27, Sesión A ronda 9, tarea 1 · F2b)

   Lee las dos hojas que escribe el Apps Script APARTE «MCP · clima» (GAS/Clima.gs), que el MCP carga como cualquier
   otra (`_SheetOrigin` «Clima horas» y «Clima», core/sheets.js):
     · «Clima horas» — una fila por HORA de Ecuador: lo observado (METAR SESA), MET Noruega o NASA POWER, la mejor que la
       tenga; las horas que QUEDAN de hoy son el pronóstico de MET.
     · «Clima»       — una fila por DÍA: «Registro» (el resumen de sus 24 horas: una cifra sólo si las 24 la tienen) y
       «Pronóstico» (los 3 días siguientes).
   Las horas son de Ecuador (UTC − 5 todo el año, como el script): «ahora» y «Actualizado» se pasan a esa hora con el
   desfase fijo, no con la zona del equipo.
   Decisiones del usuario (27-10): la pastilla da SÓLO el dato de la hora más reciente (sin semáforo: no hay umbrales del
   laboratorio), avisa si lo último tiene más de 6 h, y no aparece sin datos; franjas de 6 h; viento en km/h.
   ============================================================ */
import { parseAnyDate } from '../../core/dates.js';

export const CLIMA_HORAS = 'Clima horas';
export const CLIMA_DIAS = 'Clima';
// 2026-10-28 · y la IEM: el historial de SESA anterior a los 15 días de AWC sale de su archivo METAR (GAS/Clima.gs).
export const ATRIBUCION = 'Datos: METAR SESA (NOAA · IEM) · MET Norway · NASA POWER';
/** Con lo último escrito hace más de esto, la pastilla avisa (el script escribe cada 3 h: es más de una pasada perdida). */
export const HORAS_VIEJO = 6;
const OFFSET_H = -5;   // Ecuador no tiene horario de verano: su hora es UTC − 5 todo el año (GAS/Clima.gs, CLIMA.offsetH)
const H = 3600000;

export const isClimaHoraRow = (r) => !!r && r._SheetOrigin === CLIMA_HORAS;
export const isClimaDiaRow = (r) => !!r && r._SheetOrigin === CLIMA_DIAS;

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
};
const txt = (v) => (v == null ? '' : String(v).trim());
const pad = (n) => String(n).padStart(2, '0');

/** La hora de pared de una celda → sus partes. Un texto «dd/mm/aaaa[ HH:mm]» (el CSV) o un Date (la lectura por XLSX, que
 *  da la hora de pared como hora local). null si no se lee. */
function pared(v) {
  if (v instanceof Date) return isNaN(v) ? null : { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), hh: v.getHours(), mi: v.getMinutes() };
  const s = txt(v);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return { y: +m[3], m: +m[2], d: +m[1], hh: +(m[4] || 0), mi: +(m[5] || 0) };
  const d = parseAnyDate(s);
  return d && !isNaN(d) ? pared(d) : null;
}
const claveDe = (p) => p.y + '-' + pad(p.m) + '-' + pad(p.d);
/** Una hora de pared de Ecuador → su instante (ms UTC). */
const instante = (y, m, d, hh = 0, mi = 0) => Date.UTC(y, m - 1, d, hh - OFFSET_H, mi);

/** «Ahora» en Ecuador: { key: 'AAAA-MM-DD', hora: 0–23 }. */
export function ahoraEcuador(ms = Date.now()) {
  const d = new Date(ms + OFFSET_H * H);
  return { key: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), hora: d.getUTCHours() };
}

/** Las horas de «Clima horas», ordenadas. Cada una con su instante (`ms`) y lo de su fila; las que no se leen, fuera. */
export function climaHoras(rows) {
  const out = [];
  (rows || []).forEach((r) => {
    if (!isClimaHoraRow(r)) return;
    const p = pared(r['Fecha']);
    const hora = num(r['Hora']);
    if (!p || hora == null || hora < 0 || hora > 23) return;
    const a = pared(r['Actualizado']);
    out.push({
      key: claveDe(p), hora, ms: instante(p.y, p.m, p.d, hora),
      fuente: txt(r['Fuente']),
      t: num(r['Temperatura (°C)']), hr: num(r['Humedad (%)']), v: num(r['Viento (km/h)']), dir: num(r['Dirección (°)']),
      p: num(r['Presión (hPa)']), lluvia: num(r['Lluvia (mm)']), fLluvia: txt(r['Fuente lluvia']),
      nube: num(r['Nubosidad (%)']), fNube: txt(r['Fuente nubosidad']), wx: txt(r['Tiempo observado']),
      sens: num(r['Sensación (°C)']), niebla: num(r['Niebla (%)']), uv: num(r['UV']), rad: num(r['Radiación (Wh/m²)']),
      act: a ? instante(a.y, a.m, a.d, a.hh, a.mi) : null,
    });
  });
  return out.sort((a, b) => a.ms - b.ms);
}

/** Los días de «Clima», ordenados: «Registro» y «Pronóstico», con cuántas horas tuvo cada uno (`horas`, de 24). */
export function climaDias(rows) {
  const out = [];
  (rows || []).forEach((r) => {
    if (!isClimaDiaRow(r)) return;
    const p = pared(r['Fecha']);
    if (!p) return;
    const hSesa = num(r['Horas observadas']) || 0, hMet = num(r['Horas MET']) || 0, hNasa = num(r['Horas NASA']) || 0;
    out.push({
      key: claveDe(p), tipo: txt(r['Tipo']) || 'Registro',
      tMin: num(r['Temp mín (°C)']), tMax: num(r['Temp máx (°C)']), tMed: num(r['Temp media (°C)']), hr: num(r['Humedad (%)']),
      lluvia: num(r['Lluvia (mm)']), nube: num(r['Nubosidad (%)']), v: num(r['Viento medio (km/h)']), vMax: num(r['Viento máx (km/h)']),
      dir: num(r['Dirección (°)']), p: num(r['Presión (hPa)']), sensMax: num(r['Sensación máx (°C)']), nieblaMax: num(r['Niebla máx (%)']),
      uvMax: num(r['UV máx']), rad: num(r['Radiación (kWh/m²)']), wx: txt(r['Tiempo observado']),
      hSesa, hMet, hNasa, horas: hSesa + hMet + hNasa,
    });
  });
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Lo que dice la pastilla: la hora más reciente que ya llegó (con temperatura) y si lo último escrito es VIEJO.
 *  🔑 «Viejo» se mide por «Actualizado», no por la hora del dato: si el script se para, las horas que quedan del día
 *  siguen ahí (el pronóstico de MET de su última pasada) y la hora «más reciente» parecería al día.
 *  null si no hay ninguna hora de clima (la pastilla no aparece). */
export function estadoHoy(horas, ahoraMs = Date.now()) {
  if (!horas || !horas.length) return null;
  let hora = null, act = null;
  for (const h of horas) {
    if (h.ms <= ahoraMs && h.t != null) hora = h;
    if (h.act != null && (act == null || h.act > act)) act = h.act;
  }
  const ultima = act != null ? act : hora ? hora.ms : null;
  return { hora, act: ultima, viejo: ultima == null || ahoraMs - ultima > HORAS_VIEJO * H };
}

/** Las horas de UN día (`key`), en orden. */
export const horasDelDia = (horas, key) => (horas || []).filter((h) => h.key === key);

/** Las cuatro franjas de 6 h del día (00–06 · 06–12 · 12–18 · 18–24). Cada cifra, de las horas que la tienen; la lluvia
 *  es la SUMA de las que la tienen (null si ninguna); `n` = horas con temperatura (de 6). */
export function franjas(horasDia) {
  return [0, 6, 12, 18].map((desde) => {
    const hs = horasDia.filter((h) => h.hora >= desde && h.hora < desde + 6);
    const de = (k) => hs.map((h) => h[k]).filter((x) => x != null);
    const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    const t = de('t'), ll = de('lluvia'), v = de('v');
    return {
      desde, hasta: desde + 6, n: t.length,
      tMed: media(t), tMin: t.length ? Math.min(...t) : null, tMax: t.length ? Math.max(...t) : null,
      hr: media(de('hr')), v: media(v), vMax: v.length ? Math.max(...v) : null,
      lluvia: ll.length ? ll.reduce((s, x) => s + x, 0) : null, nube: media(de('nube')),
    };
  });
}

/** «incompleto (N de 24 h)» para un día de «Registro» sin cifras (no tuvo las 24 horas); '' si no. */
export function incompleto(dia) {
  return dia && dia.tipo === 'Registro' && dia.tMed == null ? `incompleto (${dia.horas} de 24 h)` : '';
}

/** Los días de pronóstico POSTERIORES a `hoyKey`. */
export const pronostico = (dias, hoyKey) => (dias || []).filter((d) => d.tipo === 'Pronóstico' && d.key > hoyKey);

/** Los meses con días («AAAA-MM»), en orden. */
export const mesesDe = (dias) => [...new Set((dias || []).map((d) => d.key.slice(0, 7)))].sort();

/** El resumen de un mes, de sus días de «Registro» con cifra: la media de las medias, la mínima y máxima, la lluvia
 *  total, los días con lluvia (≥ 1 mm) y los días incompletos. */
export function resumenMes(diasMes) {
  const reg = diasMes.filter((d) => d.tipo === 'Registro');
  const con = (k) => reg.map((d) => d[k]).filter((x) => x != null);
  const tMed = con('tMed'), ll = con('lluvia');
  return {
    dias: reg.length,
    tMed: tMed.length ? tMed.reduce((s, x) => s + x, 0) / tMed.length : null,
    tMin: con('tMin').length ? Math.min(...con('tMin')) : null,
    tMax: con('tMax').length ? Math.max(...con('tMax')) : null,
    lluvia: ll.length ? ll.reduce((s, x) => s + x, 0) : null,
    diasLluvia: ll.filter((x) => x >= 1).length,
    incompletos: reg.filter((d) => incompleto(d)).length,
  };
}

/** Un número a la española (coma decimal), con hasta `dec` decimales; «—» si no hay. Sin separador de miles: la presión
 *  «1.012,4» se leería como 1,0124 (y ninguna cifra del clima pasa de cuatro dígitos). */
export function fmt(v, dec = 1) {
  return v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: dec, useGrouping: false });
}
/** «HH:00» de una hora. */
export const fmtHora = (h) => pad(h) + ':00';
/** «dd/mm HH:mm» de un instante, en hora de Ecuador. */
export function fmtInstante(ms) {
  const d = new Date(ms + OFFSET_H * H);
  return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
}

/** El texto de la pastilla y su ayuda. */
export function textoPastilla(estado) {
  if (!estado) return null;
  if (estado.viejo) {
    const desde = estado.act != null ? fmtInstante(estado.act) : '—';
    return { texto: `🌦 ⚠ sin actualizar desde ${desde}`, ayuda: `El clima no se actualiza desde ${desde} (el script escribe cada 3 h). ${ATRIBUCION}`, viejo: true };
  }
  const h = estado.hora;
  if (!h) return { texto: '🌦 Clima', ayuda: ATRIBUCION, viejo: false };
  const partes = [fmt(h.t) + ' °C'];
  if (h.hr != null) partes.push(fmt(h.hr, 0) + ' %');
  if (h.v != null) partes.push(fmt(h.v, 0) + ' km/h');
  return { texto: '🌦 ' + partes.join(' · '), ayuda: `${fmtHora(h.hora)} · ${h.fuente || 'sin fuente'} · ${ATRIBUCION}`, viejo: false };
}
