/* ============================================================
   REGISTROS · esquema de las fichas de 🔧 Mantenimiento · Blowers Kaeser (2026-10-28, usuario)

   El Excel «Registro_Blowers_Kaeser_CAMPOS_DE_ENTRADA» (Proyectos Mantenimiento) como las dos fichas del módulo
   🔧 Mantenimiento de Registros (el 16, con su PIN):
     · 📋 RONDA: lo que marca el tablero de cada blower a una hora —horómetro, corriente, presión y temperatura—. Una
       fila por equipo leído en «Mantenimiento Lecturas». El Excel guardaba el horómetro en dos sitios y anotaba las
       lecturas como trabajos «Otro»: aquí tienen su hoja.
     · 🔧 TRABAJO: una intervención con los campos VERDES del Excel (los grises —próximo cambio, semáforo, MTBF— los
       calcula la vista). Una fila en «Mantenimiento Trabajos». La parada sale de la hora de inicio y la de fin, o se
       escribe en horas si duró más de un día.
   Decisiones del usuario (2026-10-28): hojas «Mantenimiento …» (otros equipos caben sin hojas nuevas); las LISTAS
   —códigos, modelos, tipos, actividades del plan y estados— van aquí, porque no son sensibles; la ficha técnica de cada
   equipo (ubicación, serie, ajuste del horómetro, intervalos, referencias) y los técnicos van en la hoja
   «Mantenimiento Equipos», editada a mano, que sólo lee la vista: el repo es PÚBLICO, así que ni nombres ni series aquí.
   Las dos hojas van por «ID» (el ÚLTIMO, la lección del AsT) y sin merge: reenviar CORRIGE la fila entera. El ID nace
   con el registro y no cambia al corregir su fecha o su hora, así que corregirlas no deja la fila vieja en la hoja.
   Modelo PURO; el monolito (engine.js e index (8)) lleva su copia y la paridad la ata.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';

export const MNT_TRAB_SHEET = 'Mantenimiento Trabajos';
export const MNT_LECT_SHEET = 'Mantenimiento Lecturas';
/* Los 11 blowers del Excel («Equipos y Plan»). El modelo decide sus referencias de lectura, que juzga la vista. */
export const MNT_EQUIPOS = [
  ['BLW-01', 'FB 441 C'], ['BLW-02', 'FB 441 C'], ['BLW-03', 'FB 441 C'], ['BLW-04', 'FB 441 C'],
  ['BLW-05', 'FB 441 C'], ['BLW-06', 'FB 441 C'], ['BLW-07', 'FB 441 C'], ['BLW-08', 'FB 441 C'],
  ['BLW-09', 'FB 441 C'], ['BLW-10', 'FB 441 C'], ['BLW-11', 'FB 621 C'],
].map(([codigo, modelo]) => ({ codigo, modelo }));
export const MNT_TIPOS = ['Preventivo', 'Correctivo', 'Predictivo', 'Inspección'];
/* El plan de mantenimiento del Excel (A21:A30), en su orden. */
export const MNT_ACTIVIDADES = [
  'Cambio de aceite', 'Cambio de bandas', 'Revisión / tensión de bandas', 'Cambio de filtro de aire',
  'Engrase de rodamientos del motor', 'Revisión de válvula de alivio',
  'Inspección eléctrica (bornes, corriente, aislamiento)', 'Limpieza general', 'Reparación / correctivo', 'Otro',
];
export const MNT_ESTADOS = ['Completado', 'Pendiente', 'En proceso'];
/* Lo POSIBLE, no lo habitual: fuera de esto es un error de tecleo. Lo habitual de cada modelo (64 A ±10 %…) lo juzga la
   vista con las referencias de «Mantenimiento Equipos». */
export const MNT_RANGOS = {
  horometro: [0, 200000], corriente: [0, 300], presion: [0, 15], temperatura: [0, 150],
  cantidad: [0, 10000], costo: [0, 1000000], aceite: [0, 200], parada: [0, 2000],
};
/* ⚠ Este orden ES el de la hoja, y el ID va el ÚLTIMO. */
export const MNT_TRAB_COLUMNS = [
  { h: 'Fecha', k: 'fecha', t: 'dia' },
  { h: 'Equipo', k: 'equipo', t: 'txt', max: 20 },
  { h: 'Tipo', k: 'tipo', t: 'txt', max: 20 },
  { h: 'Actividad', k: 'actividad', t: 'txt', max: 80 },
  { h: 'Horómetro (h)', k: 'horometro', t: 'num' },
  { h: 'Descripción', k: 'descripcion', t: 'txt', max: 500 },
  { h: 'Repuestos / materiales', k: 'repuestos', t: 'txt', max: 200 },
  { h: 'Cantidad', k: 'cantidad', t: 'num' },
  { h: 'Costo (USD)', k: 'costo', t: 'num' },
  { h: 'Técnico', k: 'tecnico', t: 'txt', max: 80 },
  { h: 'Hora inicio', k: 'horaInicio', t: 'hora' },
  { h: 'Hora fin', k: 'horaFin', t: 'hora' },
  { h: 'Parada (h)', k: 'parada', t: 'parada' },
  { h: 'Estado', k: 'estado', t: 'txt', max: 20 },
  { h: 'Observaciones', k: 'observaciones', t: 'txt', max: 500 },
  { h: 'Aceite usado (L)', k: 'aceite', t: 'num' },
  { h: 'ID', k: 'id', t: 'txt', max: 60 },
];
export const MNT_TRAB_HEADERS = MNT_TRAB_COLUMNS.map((c) => c.h);
/* Las cuatro lecturas del tablero, en el orden de la hoja. */
export const MNT_LECTURAS = [
  { k: 'horometro', h: 'Horómetro (h)' }, { k: 'corriente', h: 'Corriente (A)' },
  { k: 'presion', h: 'Presión (psi)' }, { k: 'temperatura', h: 'Temperatura (°C)' },
];
export const MNT_LECT_HEADERS = ['Fecha', 'Hora', 'Equipo']
  .concat(MNT_LECTURAS.map((x) => x.h), ['Técnico', 'Observaciones', 'ID']);
/* Lo que se puede anotar de cada número de un trabajo, y si tiene que ser entero. */
const NUMEROS_TRABAJO = [
  { k: 'horometro', l: 'el horómetro' }, { k: 'cantidad', l: 'la cantidad', ent: true },
  { k: 'costo', l: 'el costo' }, { k: 'aceite', l: 'el aceite usado' }, { k: 'parada', l: 'la parada' },
];

/* ── Las reglas ─────────────────────────────────────────── */
const esDia = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
export function mntEsHora(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || '')); }
export function mntEquipo(codigo) { return MNT_EQUIPOS.find((q) => q.codigo === codigo) || null; }

/** Un número tecleado: «534,51», «534.51», «1,028.42» o «1.028,42» (el ÚLTIMO separador es el decimal). '' si está vacío;
    NaN si no es un número. */
export function mntNum(v) {
  let s = String(v == null ? '' : v).trim().replace(/\s+/g, '');
  if (s === '') return '';
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (c !== -1 && p !== -1) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const x = Number(s);
  return isFinite(x) ? x : NaN;
}
const num = (v) => { const x = mntNum(v); return (x === '' || !isFinite(x)) ? '' : x; };

/** Horas entre dos «HH:MM»; si la de fin es menor, cruzó la medianoche. '' si falta alguna. */
export function mntParadaHoras(ini, fin) {
  if (!mntEsHora(ini) || !mntEsHora(fin)) return '';
  const min = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  let d = min(fin) - min(ini);
  if (d < 0) d += 24 * 60;
  return Math.round(d / 60 * 100) / 100;
}
/** La parada del trabajo: la escrita a mano (una de más de un día) o, si no, la de las dos horas. */
export function mntParada(d) {
  const m = d || {};
  const a = mntNum(m.parada);
  return a !== '' ? a : mntParadaHoras(m.horaInicio, m.horaFin);
}
/** El ID nace con el registro (prefijo, día y el instante en base 36) y no cambia al corregirlo. */
export function mntNuevoId(prefijo, fecha, ts) {
  return prefijo + '-' + sanitizeStr(fecha, 10) + '-' + Number(ts || 0).toString(36);
}

/** Lo que falta o está mal en un trabajo, en palabras; [] si se puede guardar. */
export function mntValidarTrabajo(d) {
  const m = d || {}, err = [], falta = [];
  if (!esDia(m.fecha)) falta.push('la fecha');
  if (!mntEquipo(m.equipo)) falta.push('el equipo');
  if (MNT_TIPOS.indexOf(m.tipo) === -1) falta.push('el tipo');
  if (MNT_ACTIVIDADES.indexOf(m.actividad) === -1) falta.push('la actividad');
  if (mntNum(m.horometro) === '') falta.push('el horómetro');
  if (MNT_ESTADOS.indexOf(m.estado) === -1) falta.push('el estado');
  if (falta.length) err.push('falta ' + falta.join(', '));
  NUMEROS_TRABAJO.forEach((x) => {
    const v = mntNum(m[x.k]), r = MNT_RANGOS[x.k];
    if (v === '') return;
    if (!isFinite(v)) err.push(x.l + ' no es un número');
    else if (v < r[0] || v > r[1]) err.push(x.l + ' está fuera de lo posible (' + r[0] + ' a ' + r[1] + ')');
    else if (x.ent && Math.round(v) !== v) err.push(x.l + ' tiene que ser un número entero');
  });
  if (String(m.horaInicio || '').trim() !== '' && !mntEsHora(m.horaInicio)) err.push('la hora de inicio no es una hora (HH:MM)');
  if (String(m.horaFin || '').trim() !== '' && !mntEsHora(m.horaFin)) err.push('la hora de fin no es una hora (HH:MM)');
  if (m.tipo === 'Correctivo' && m.estado === 'Completado' && mntParada(m) === '') {
    err.push('un correctivo completado necesita su parada: la hora de inicio y la de fin, o las horas');
  }
  return err;
}
/** Un equipo de la ronda sin nada anotado. */
export function mntLecturaVacia(e) {
  if (!e) return true;
  const vacio = (v) => String(v == null ? '' : v).trim() === '';
  return MNT_LECTURAS.every((x) => vacio(e[x.k])) && vacio(e.obs);
}
/** Lo que falta o está mal en una ronda; [] si se puede guardar. */
export function mntValidarRonda(d) {
  const m = d || {}, err = [], eqs = m.equipos || {};
  if (!esDia(m.fecha)) err.push('falta la fecha');
  if (String(m.hora || '').trim() !== '' && !mntEsHora(m.hora)) err.push('la hora no es una hora (HH:MM)');
  let alguno = false;
  MNT_EQUIPOS.forEach((q) => {
    const e = eqs[q.codigo];
    if (mntLecturaVacia(e)) return;
    alguno = true;
    MNT_LECTURAS.forEach((x) => {
      const v = mntNum(e[x.k]), r = MNT_RANGOS[x.k];
      if (v === '') return;
      if (!isFinite(v)) err.push(q.codigo + ': ' + x.h + ' no es un número');
      else if (v < r[0] || v > r[1]) err.push(q.codigo + ': ' + x.h + ' fuera de lo posible (' + r[0] + ' a ' + r[1] + ')');
    });
  });
  // Una ronda corregida que sólo ANULA equipos (los vació todos) también se envía: lleva sus filas anuladas.
  const anul = Array.isArray(m.anulados) ? m.anulados : [];
  if (!alguno && !MNT_EQUIPOS.some((q) => anul.indexOf(q.codigo) !== -1)) err.push('anota al menos un equipo');
  return err;
}
/* Los equipos ANULADOS de una ronda que se guarda otra vez: los que su versión guardada anotó (o ya había anulado) y ésta
   deja vacíos, en el orden de MNT_EQUIPOS (decisión del usuario, 2026-10-28: «Anularla en la hoja»). La hoja cambia las
   filas por su ID y una vacía no se envía, así que sin esto la fila vieja seguía allí con su horómetro, el MAYOR del equipo. */
export const MNT_ANULADA = 'Anulada en la ficha';
export function mntAnulados(previa, d) {
  const p = previa || {}, pe = p.equipos || {}, eqs = (d && d.equipos) || {};
  const antes = (Array.isArray(p.anulados) ? p.anulados : [])
    .concat(MNT_EQUIPOS.filter((q) => !mntLecturaVacia(pe[q.codigo])).map((q) => q.codigo));
  return MNT_EQUIPOS.map((q) => q.codigo).filter((c) => antes.indexOf(c) !== -1 && mntLecturaVacia(eqs[c]));
}

/* ── Las filas de la hoja ───────────────────────────────── */
/** La fila de un trabajo, en el orden de MNT_TRAB_HEADERS. */
export function mntFilaTrabajo(d) {
  const m = d || {};
  return MNT_TRAB_COLUMNS.map((c) => {
    if (c.t === 'num') return num(m[c.k]);
    if (c.t === 'parada') return num(mntParada(m));
    if (c.t === 'hora') return mntEsHora(m[c.k]) ? m[c.k] : '';
    if (c.t === 'dia') return esDia(m[c.k]) ? m[c.k] : '';
    return sanitizeStr(m[c.k], c.max);
  });
}
/** Las filas de una ronda: una por equipo anotado, en el orden de MNT_EQUIPOS. Su ID = el de la ronda + el equipo. Un
    equipo ANULADO lleva su fila con el mismo ID, sin lecturas y con MNT_ANULADA (la vista no la cuenta). */
export function mntFilasRonda(d) {
  const m = d || {}, eqs = m.equipos || {}, filas = [], anul = Array.isArray(m.anulados) ? m.anulados : [];
  MNT_EQUIPOS.forEach((q) => {
    const e = eqs[q.codigo];
    if (mntLecturaVacia(e)) {
      if (anul.indexOf(q.codigo) !== -1) filas.push([esDia(m.fecha) ? m.fecha : '', mntEsHora(m.hora) ? m.hora : '', q.codigo]
        .concat(MNT_LECTURAS.map(() => ''), [sanitizeStr(m.tecnico, 80), MNT_ANULADA, sanitizeStr(m.id, 50) + '-' + q.codigo]));
      return;
    }
    filas.push([esDia(m.fecha) ? m.fecha : '', mntEsHora(m.hora) ? m.hora : '', q.codigo]
      .concat(MNT_LECTURAS.map((x) => num(e[x.k])))
      .concat([sanitizeStr(m.tecnico, 80), sanitizeStr(e.obs, 300), sanitizeStr(m.id, 50) + '-' + q.codigo]));
  });
  return filas;
}
export function buildMntTrabajoPayload(records) {
  const rows = [];
  (records || []).forEach((r) => { if (r && r.data) rows.push(mntFilaTrabajo(r.data)); });
  return { sheetName: MNT_TRAB_SHEET, headers: MNT_TRAB_HEADERS.slice(), rows };
}
export function buildMntRondaPayload(records) {
  const rows = [];
  (records || []).forEach((r) => { if (r && r.data) mntFilasRonda(r.data).forEach((f) => rows.push(f)); });
  return { sheetName: MNT_LECT_SHEET, headers: MNT_LECT_HEADERS.slice(), rows };
}

/* ── «El horómetro no baja» ─────────────────────────────── */
/** Las lecturas de horómetro que conoce el dispositivo, de rondas y trabajos guardados: [{ equipo, fecha, h, id }]. */
export function mntHorometros(rondas, trabajos) {
  const out = [];
  (rondas || []).forEach((r) => {
    const d = r && r.data;
    if (!d || !esDia(d.fecha)) return;
    const eqs = d.equipos || {};
    Object.keys(eqs).forEach((c) => {
      const h = num(eqs[c] && eqs[c].horometro);
      if (h !== '') out.push({ equipo: c, fecha: d.fecha, h, id: d.id });
    });
  });
  (trabajos || []).forEach((r) => {
    const d = r && r.data;
    if (!d || !esDia(d.fecha)) return;
    const h = num(d.horometro);
    if (h !== '') out.push({ equipo: d.equipo, fecha: d.fecha, h, id: d.id });
  });
  return out;
}
/** La lectura más alta del equipo hasta ese día —sin contar el registro que se corrige (excluirId)— si SUPERA a la
    nueva; null si no hay ninguna o no baja. Lo leído DESPUÉS de esa fecha no cuenta: un registro atrasado no se
    compara con el futuro. */
export function mntHorometroBaja(lista, equipo, fecha, valor, excluirId) {
  const v = num(valor);
  if (v === '' || !esDia(fecha)) return null;
  let previa = null;
  (lista || []).forEach((x) => {
    if (!x || x.equipo !== equipo || x.id === excluirId || !(x.fecha <= fecha)) return;
    if (!previa || x.h > previa.h) previa = x;
  });
  return previa && previa.h > v ? { fecha: previa.fecha, h: previa.h } : null;
}
const diaCorto = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
/** Los avisos de horómetro de una ronda, uno por equipo que baja (texto para confirmar antes de guardar). */
export function mntAvisosRonda(lista, d) {
  const m = d || {}, eqs = m.equipos || {}, out = [];
  MNT_EQUIPOS.forEach((q) => {
    const e = eqs[q.codigo], b = e ? mntHorometroBaja(lista, q.codigo, m.fecha, e.horometro, m.id) : null;
    if (b) out.push(q.codigo + ': ' + num(e.horometro) + ' h, y el ' + diaCorto(b.fecha) + ' ya marcaba ' + b.h + ' h');
  });
  return out;
}
/** El aviso de horómetro de un trabajo ([] o uno). */
export function mntAvisosTrabajo(lista, d) {
  const m = d || {}, b = mntHorometroBaja(lista, m.equipo, m.fecha, m.horometro, m.id);
  return b ? [m.equipo + ': ' + num(m.horometro) + ' h, y el ' + diaCorto(b.fecha) + ' ya marcaba ' + b.h + ' h'] : [];
}
