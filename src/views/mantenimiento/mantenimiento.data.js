/* ============================================================
   🔧 MANTENIMIENTO · la capa de datos de la vista (2026-10-28, usuario; ronda 10, tarea 4, F2)

   Lo que el Excel «Registro_Blowers_Kaeser» calculaba con fórmulas, sobre las hojas del libro:
     · «Mantenimiento Trabajos» y «Mantenimiento Lecturas»: las escribe la ficha 🔧 de Registros (su esquema, con las
       listas de equipos y actividades, es el de registros/lib/ficha-mantenimiento.schema.js, que se importa aquí).
     · «Mantenimiento Equipos» y «Mantenimiento Plan»: la ficha técnica, editada A MANO en el libro (decisión del usuario,
       2026-10-28: el repo es público, así que ni series ni ubicaciones viven en el código). Equipos: una fila por blower
       (ubicación, en servicio o stand by, ajuste del horómetro y desde cuándo, referencias de lectura). Plan: una fila
       por actividad (intervalo en horas y en días, primer cambio).
   Decisiones del usuario: el técnico anota lo que marca el TABLERO y aquí se le SUMA el ajuste de su equipo a lo leído
   desde la fecha «Ajuste desde» (incluida); lo importado del Excel, que ya eran horas reales, va con fechas anteriores.
   Las reglas son las del Excel: «próximo» a ≤ 100 h o ≤ 7 días; una actividad que nunca se hizo se estima desde 0 h
   (o desde su primer cambio, 500 h el aceite); MTBF = horas ÷ correctivos, MTTR = parada por fallas ÷ correctivos,
   disponibilidad = MTBF ÷ (MTBF + MTTR). Sólo un trabajo COMPLETADO cuenta como último cambio.
   Los números del libro se leen con mntNum (la coma decimal del libro, y miles con punto o coma): parseNum de
   core/fields leería «1.028,42» como 1,028.
   PURO: sin DOM. La vista (index.js) sólo pinta.
   ============================================================ */
import { getField } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import {
  MNT_TRAB_SHEET, MNT_LECT_SHEET, MNT_EQUIPOS, MNT_ACTIVIDADES, mntNum,
} from '../registros/lib/ficha-mantenimiento.schema.js';

export { MNT_TRAB_SHEET, MNT_LECT_SHEET };
export const MNT_EQUIPOS_SHEET = 'Mantenimiento Equipos';
export const MNT_PLAN_SHEET = 'Mantenimiento Plan';
/* Las cuatro hojas: ninguna es un registro del laboratorio, así que no mueven la «última fecha» (core/sheets.js). */
export const MNT_HOJAS = [MNT_TRAB_SHEET, MNT_LECT_SHEET, MNT_EQUIPOS_SHEET, MNT_PLAN_SHEET];
/* Las cabeceras de las dos hojas a mano. Las prepara el archivo para pegar (fuera del repo) y se leen con tolerancia. */
export const MNT_EQUIPOS_HEADERS = ['Código', 'Modelo', 'Serie', 'Ubicación', 'Estado', 'Ajuste horómetro (h)', 'Ajuste desde',
  'Corriente ref (A)', 'Presión ref (psi)', 'Temperatura ref (°C)', 'Plena carga (A)', 'Fabricación', 'Notas'];
export const MNT_PLAN_HEADERS = ['Actividad', 'Intervalo (h)', 'Intervalo (días)', 'Primer cambio (h)', 'Notas'];
/* Del Excel («Lecturas», B6:C8): REVISAR si la corriente pasa la referencia +10 %, la presión +15 % o la temperatura +10 °C. */
export const MNT_TOLERANCIAS = { corriente: 0.10, presion: 0.15, temperatura: 10 };
/* Del Excel («Semáforo»): PRÓXIMO a 100 h o menos, o a 7 días o menos. */
export const MNT_PROXIMO = { horas: 100, dias: 7 };
export const MNT_ESTADO = { VENCIDO: 'VENCIDO', PROXIMO: 'PRÓXIMO', AL_DIA: 'AL DÍA', SIN_DATOS: 'SIN DATOS', SIN_PLAN: '—' };

/* ── Leer las hojas ─────────────────────────────────────── */
const C = {
  fecha: ['Fecha'], equipo: ['Equipo', 'Unidad'], tipo: ['Tipo'], actividad: ['Actividad'],
  horometro: ['Horómetro (h)', 'Horometro (h)', 'Horómetro'], descripcion: ['Descripción', 'Descripcion'],
  repuestos: ['Repuestos / materiales', 'Repuestos'], cantidad: ['Cantidad', 'Cant.'], costo: ['Costo (USD)', 'Costo'],
  tecnico: ['Técnico', 'Tecnico'], horaInicio: ['Hora inicio'], horaFin: ['Hora fin'], parada: ['Parada (h)', 'Parada'],
  estado: ['Estado'], observaciones: ['Observaciones', 'Observación'], aceite: ['Aceite usado (L)', 'Aceite usado'], id: ['ID'],
  hora: ['Hora'], corriente: ['Corriente (A)', 'Corriente'], presion: ['Presión (psi)', 'Presion (psi)', 'Presión'],
  temperatura: ['Temperatura (°C)', 'Temperatura'],
  codigo: ['Código', 'Codigo'], modelo: ['Modelo'], serie: ['Serie', 'N.º de serie'], ubicacion: ['Ubicación', 'Ubicacion', 'Módulo / ubicación'],
  ajuste: ['Ajuste horómetro (h)', 'Ajuste horometro (h)', 'Ajuste horómetro'], ajusteDesde: ['Ajuste desde'],
  refCorriente: ['Corriente ref (A)'], refPresion: ['Presión ref (psi)', 'Presion ref (psi)'],
  refTemperatura: ['Temperatura ref (°C)'], plenaCarga: ['Plena carga (A)'], fabricacion: ['Fabricación', 'Fabricacion'],
  notas: ['Notas'], intervaloH: ['Intervalo (h)', 'Intervalo (horas)'], intervaloD: ['Intervalo (días)', 'Intervalo (dias)'],
  primer: ['Primer cambio (h)'],
};
const txt = (r, k) => String(getField(r, C[k]) == null ? '' : getField(r, C[k])).trim();
/** Un número de la hoja, o null. */
export function numero(v) { const x = mntNum(v); return (x === '' || !isFinite(x)) ? null : x; }
const nm = (r, k) => numero(getField(r, C[k]));
const pad = (n) => String(n).padStart(2, '0');
/** El día de una celda como «AAAA-MM-DD» (parseAnyDate: serial, d/m/aaaa, ISO), o ''. */
export function diaIso(v) {
  if (v == null || String(v).trim() === '') return '';
  const d = parseAnyDate(v);
  return d && !isNaN(d) ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) : '';
}
/** «HH:MM» de lo que guardó la hoja («08:00», «8:00:00», o una hora que Sheets convirtió), o ''. */
export function horaHM(v) {
  if (v instanceof Date && !isNaN(v)) return pad(v.getHours()) + ':' + pad(v.getMinutes());
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v == null ? '' : v).trim());
  return m && Number(m[1]) < 24 ? pad(m[1]) + ':' + m[2] : '';
}
const de = (rows, hoja) => (rows || []).filter((r) => r && r._SheetOrigin === hoja);

/** Los trabajos del libro, uno por fila con fecha y equipo. */
export function leerTrabajos(rows) {
  return de(rows, MNT_TRAB_SHEET).map((r) => ({
    fecha: diaIso(getField(r, C.fecha)), equipo: txt(r, 'equipo'), tipo: txt(r, 'tipo'), actividad: txt(r, 'actividad'),
    horometro: nm(r, 'horometro'), descripcion: txt(r, 'descripcion'), repuestos: txt(r, 'repuestos'), cantidad: nm(r, 'cantidad'),
    costo: nm(r, 'costo'), tecnico: txt(r, 'tecnico'), horaInicio: horaHM(getField(r, C.horaInicio)),
    horaFin: horaHM(getField(r, C.horaFin)), parada: nm(r, 'parada'), estado: txt(r, 'estado'),
    observaciones: txt(r, 'observaciones'), aceite: nm(r, 'aceite'), id: txt(r, 'id'),
  })).filter((t) => t.fecha && t.equipo);
}
/** Las lecturas del libro (las rondas), una por equipo leído. */
export function leerLecturas(rows) {
  return de(rows, MNT_LECT_SHEET).map((r) => ({
    fecha: diaIso(getField(r, C.fecha)), hora: horaHM(getField(r, C.hora)), equipo: txt(r, 'equipo'),
    horometro: nm(r, 'horometro'), corriente: nm(r, 'corriente'), presion: nm(r, 'presion'), temperatura: nm(r, 'temperatura'),
    tecnico: txt(r, 'tecnico'), observaciones: txt(r, 'observaciones'), id: txt(r, 'id'),
  })).filter((l) => l.fecha && l.equipo);
}
/** Los equipos: los de la hoja a mano y, detrás, los de la ficha que la hoja no nombre (sin ficha técnica). */
export function leerEquipos(rows) {
  const out = [], vistos = new Set();
  de(rows, MNT_EQUIPOS_SHEET).forEach((r) => {
    const codigo = txt(r, 'codigo');
    if (!codigo || vistos.has(codigo)) return;
    vistos.add(codigo);
    const estado = txt(r, 'estado');
    out.push({ codigo, modelo: txt(r, 'modelo'), serie: txt(r, 'serie'), ubicacion: txt(r, 'ubicacion'), estado,
      standBy: /stand\s*by/i.test(estado), ajuste: nm(r, 'ajuste'), ajusteDesde: diaIso(getField(r, C.ajusteDesde)),
      ref: { corriente: nm(r, 'refCorriente'), presion: nm(r, 'refPresion'), temperatura: nm(r, 'refTemperatura') },
      plenaCarga: nm(r, 'plenaCarga'), fabricacion: txt(r, 'fabricacion'), notas: txt(r, 'notas'), sinFicha: false });
  });
  MNT_EQUIPOS.forEach((q) => {
    if (vistos.has(q.codigo)) return;
    out.push({ codigo: q.codigo, modelo: q.modelo, serie: '', ubicacion: '', estado: '', standBy: false, ajuste: null,
      ajusteDesde: '', ref: { corriente: null, presion: null, temperatura: null }, plenaCarga: null, fabricacion: '', notas: '',
      sinFicha: true });
  });
  const orden = (c) => { const i = MNT_EQUIPOS.findIndex((q) => q.codigo === c); return i === -1 ? 999 : i; };
  return out.sort((a, b) => orden(a.codigo) - orden(b.codigo) || (a.codigo < b.codigo ? -1 : 1));
}
/** El plan: una entrada por actividad de la lista (y las que la hoja añada), con sus intervalos o null. */
export function leerPlan(rows) {
  const deHoja = new Map();
  de(rows, MNT_PLAN_SHEET).forEach((r) => {
    const a = txt(r, 'actividad');
    if (a && !deHoja.has(a)) deHoja.set(a, { horas: nm(r, 'intervaloH'), dias: nm(r, 'intervaloD'), primer: nm(r, 'primer'), notas: txt(r, 'notas') });
  });
  const nombres = MNT_ACTIVIDADES.concat([...deHoja.keys()].filter((a) => MNT_ACTIVIDADES.indexOf(a) === -1));
  return nombres.map((actividad) => Object.assign({ actividad, horas: null, dias: null, primer: null, notas: '' }, deHoja.get(actividad) || {}));
}

/* ── El horómetro ───────────────────────────────────────── */
/** Las horas REALES de una lectura del tablero: + el ajuste del equipo si se leyó desde su «Ajuste desde» (incluido). */
export function horasReales(h, equipo, fecha) {
  if (h == null) return null;
  return equipo && equipo.ajuste && equipo.ajusteDesde && fecha >= equipo.ajusteDesde ? Math.round((h + equipo.ajuste) * 100) / 100 : h;
}
/** Todas las lecturas de horómetro (rondas y trabajos), en horas reales: [{ equipo, fecha, hora, h, tablero, origen }]. */
export function horometros(lecturas, trabajos, equipos) {
  const eq = new Map((equipos || []).map((e) => [e.codigo, e]));
  const out = [];
  (lecturas || []).forEach((l) => { if (l.horometro != null) out.push({ equipo: l.equipo, fecha: l.fecha, hora: l.hora, h: horasReales(l.horometro, eq.get(l.equipo), l.fecha), tablero: l.horometro, origen: 'Ronda' }); });
  (trabajos || []).forEach((t) => { if (t.horometro != null) out.push({ equipo: t.equipo, fecha: t.fecha, hora: t.horaInicio, h: horasReales(t.horometro, eq.get(t.equipo), t.fecha), tablero: t.horometro, origen: 'Trabajo' }); });
  return out;
}
/** El horómetro actual de un equipo: el MAYOR conocido (como el Excel), con su fecha; null si no hay ninguno. Si varias
 *  lecturas dan ese valor, la MÁS RECIENTE (2026-10-30, usuario: «La más reciente»; antes, la primera de la hoja). */
export function horometroActual(lista, codigo) {
  let u = null;
  (lista || []).forEach((x) => { if (x.equipo === codigo && (!u || x.h > u.h || (x.h === u.h && orden(x, u) > 0))) u = x; });
  return u;
}

/* ── 🚦 Próximos cambios y semáforo ─────────────────────── */
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
const masDias = (iso, n) => { const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
/** Un próximo cambio por equipo y actividad del plan. `hoy` en «AAAA-MM-DD». */
export function proximos({ equipos, plan, trabajos, lista, hoy }) {
  const eq = new Map((equipos || []).map((e) => [e.codigo, e]));
  const out = [];
  (equipos || []).forEach((e) => {
    const actual = horometroActual(lista, e.codigo);
    (plan || []).forEach((p) => {
      const conPlan = p.horas != null || p.dias != null;
      const hechos = (trabajos || []).filter((t) => t.equipo === e.codigo && t.actividad === p.actividad && t.estado === 'Completado');
      let ultimo = null;
      hechos.forEach((t) => { if (!ultimo || t.fecha > ultimo.fecha || (t.fecha === ultimo.fecha && (t.horometro || 0) > (ultimo.horometro || 0))) ultimo = t; });
      const ultimoH = ultimo ? horasReales(ultimo.horometro, eq.get(e.codigo), ultimo.fecha) : null;
      let base = 'Sin intervalo', proxH = null, proxF = '';
      if (conPlan) {
        if (ultimo) base = 'Último registro';
        else if (p.primer != null) base = 'Primer cambio';
        else base = 'Desde 0 h (estimado)';
        if (p.horas != null) proxH = ultimo && ultimoH != null ? ultimoH + p.horas : (p.primer != null ? p.primer : p.horas);
        if (p.dias != null && ultimo) proxF = masDias(ultimo.fecha, p.dias);
      }
      const faltanH = proxH != null && actual ? r2(proxH - actual.h) : null;
      const faltanD = proxF && hoy ? diasEntre(hoy, proxF) : null;
      let estado = MNT_ESTADO.SIN_PLAN;
      if (conPlan) {
        if ((faltanH != null && faltanH < 0) || (faltanD != null && faltanD < 0)) estado = MNT_ESTADO.VENCIDO;
        else if ((faltanH != null && faltanH <= MNT_PROXIMO.horas) || (faltanD != null && faltanD <= MNT_PROXIMO.dias)) estado = MNT_ESTADO.PROXIMO;
        else if (faltanH == null && faltanD == null) estado = MNT_ESTADO.SIN_DATOS;
        else estado = MNT_ESTADO.AL_DIA;
      }
      out.push({ equipo: e.codigo, standBy: e.standBy, actividad: p.actividad, intervaloH: p.horas, intervaloD: p.dias,
        ultimoFecha: ultimo ? ultimo.fecha : '', ultimoH: r2(ultimoH), actualH: actual ? actual.h : null,
        actualFecha: actual ? actual.fecha : '', proxH: r2(proxH), faltanH, proxF, faltanD, base, estado });
    });
  });
  return out;
}
const RANGO = { [MNT_ESTADO.VENCIDO]: 0, [MNT_ESTADO.PROXIMO]: 1, [MNT_ESTADO.SIN_DATOS]: 2, [MNT_ESTADO.AL_DIA]: 3, [MNT_ESTADO.SIN_PLAN]: 4 };
/** Lo que hay que atender primero: vencidos, luego próximos (lo que menos falta, antes); los stand by, al final. */
export function porUrgencia(lista) {
  return (lista || []).slice().sort((a, b) => (a.standBy - b.standBy) || (RANGO[a.estado] - RANGO[b.estado])
    || ((a.faltanH == null ? 1e9 : a.faltanH) - (b.faltanH == null ? 1e9 : b.faltanH))
    || ((a.faltanD == null ? 1e9 : a.faltanD) - (b.faltanD == null ? 1e9 : b.faltanD)));
}

/* ── 📈 Lecturas ────────────────────────────────────────── */
/** El umbral de alerta de cada lectura de un equipo (null si su referencia no está en la hoja: no se juzga). SIN redondear:
    3,5 × 1,15 es 4,0249… en coma flotante y redondeado a 4,02 juzgaría mal; la vista redondea al pintar. */
export function umbrales(equipo) {
  const ref = (equipo && equipo.ref) || {};
  return {
    corriente: ref.corriente != null ? ref.corriente * (1 + MNT_TOLERANCIAS.corriente) : null,
    presion: ref.presion != null ? ref.presion * (1 + MNT_TOLERANCIAS.presion) : null,
    temperatura: ref.temperatura != null ? ref.temperatura + MNT_TOLERANCIAS.temperatura : null,
  };
}
/* Una lectura justo EN el umbral no lo pasa (el margen absorbe el error de la coma flotante). */
const pasa = (v, lim) => v > lim + 1e-9;
const orden = (a, b) => (a.fecha + (a.hora || '')) < (b.fecha + (b.hora || '')) ? -1 : (a.fecha + (a.hora || '')) > (b.fecha + (b.hora || '')) ? 1 : 0;
/** Por equipo: cuántas lecturas, la última, promedios y máximos, su estado y el % de carga de la última. */
export function resumenLecturas(lecturas, equipos) {
  return (equipos || []).map((e) => {
    const l = (lecturas || []).filter((x) => x.equipo === e.codigo && (x.corriente != null || x.presion != null || x.temperatura != null)).sort(orden);
    const u = l.length ? l[l.length - 1] : null;
    const vals = (k) => l.map((x) => x[k]).filter((v) => v != null);
    const prom = (k) => { const v = vals(k); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const max = (k) => { const v = vals(k); return v.length ? Math.max(...v) : null; };
    const lim = umbrales(e);
    const fuera = u ? ['corriente', 'presion', 'temperatura'].filter((k) => lim[k] != null && u[k] != null && pasa(u[k], lim[k])) : [];
    return { equipo: e.codigo, ubicacion: e.ubicacion, standBy: e.standBy, n: l.length, ultima: u,
      promedio: { corriente: prom('corriente'), presion: prom('presion'), temperatura: prom('temperatura') },
      maximo: { corriente: max('corriente'), presion: max('presion'), temperatura: max('temperatura') },
      estado: !u ? 'SIN LECTURA' : fuera.length ? 'REVISAR' : 'NORMAL', fuera, umbrales: lim,
      carga: u && u.corriente != null && e.plenaCarga ? Math.round(u.corriente / e.plenaCarga * 100) : null };
  });
}
/** La serie de un parámetro de un equipo, en orden: [{ fecha, hora, v }] (el horómetro, en horas reales). */
export function serie(lecturas, equipos, codigo, param) {
  const e = (equipos || []).find((x) => x.codigo === codigo);
  return (lecturas || []).filter((x) => x.equipo === codigo && x[param] != null).sort(orden)
    .map((x) => ({ fecha: x.fecha, hora: x.hora, v: param === 'horometro' ? horasReales(x.horometro, e, x.fecha) : x[param] }));
}

/* ── 📊 Indicadores ─────────────────────────────────────── */
const suma = (l, k) => r2(l.reduce((a, x) => a + (x[k] || 0), 0));
/** Por equipo y de la flota, como la hoja «Estadísticas» del Excel. Horas operadas = horómetro actual (arrancaron en 0 h). */
export function indicadores({ equipos, trabajos, lista }) {
  const porEquipo = (equipos || []).map((e) => {
    const t = (trabajos || []).filter((x) => x.equipo === e.codigo);
    const corr = t.filter((x) => x.tipo === 'Correctivo');
    const prev = t.filter((x) => x.tipo === 'Preventivo').length;
    const actual = horometroActual(lista, e.codigo);
    const horas = actual ? actual.h : null;
    const paradaFallas = suma(corr, 'parada');
    const mtbf = corr.length && horas != null ? r2(horas / corr.length) : null;
    const mttr = corr.length ? r2(paradaFallas / corr.length) : null;
    return { equipo: e.codigo, ubicacion: e.ubicacion, standBy: e.standBy, horas, preventivos: prev, correctivos: corr.length,
      total: t.length, pctPreventivo: prev + corr.length ? Math.round(prev / (prev + corr.length) * 100) : null,
      paradaTotal: suma(t, 'parada'), paradaFallas, mtbf, mttr,
      disponibilidad: mtbf != null && mtbf + mttr > 0 ? r2(mtbf / (mtbf + mttr) * 100) : 100, costo: suma(t, 'costo') };
  });
  const tot = (k) => r2(porEquipo.reduce((a, x) => a + (x[k] || 0), 0));
  const corr = tot('correctivos'), prev = tot('preventivos');
  let peor = null;
  porEquipo.forEach((x) => { if (x.correctivos && (!peor || x.correctivos > peor.correctivos)) peor = x; });
  const disp = porEquipo.map((x) => x.disponibilidad).filter((v) => v != null);
  return { porEquipo, flota: { total: tot('total'), preventivos: prev, correctivos: corr,
    pctPreventivo: prev + corr ? Math.round(prev / (prev + corr) * 100) : null, paradaTotal: tot('paradaTotal'),
    horas: tot('horas'), mtbf: corr ? r2(tot('horas') / corr) : null, mttr: corr ? r2(tot('paradaFallas') / corr) : null,
    disponibilidad: disp.length ? r2(disp.reduce((a, b) => a + b, 0) / disp.length) : null, costo: tot('costo'),
    masFallas: peor ? peor.equipo : '' } };
}
/** Los años con trabajos, del más reciente al más viejo. */
export function anios(trabajos) { return [...new Set((trabajos || []).map((t) => +t.fecha.slice(0, 4)))].sort((a, b) => b - a); }
/** Mes a mes de un año: preventivos, correctivos, total, parada y costo. */
export function mensual(trabajos, anio) {
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, preventivos: 0, correctivos: 0, total: 0, parada: 0, costo: 0 }));
  (trabajos || []).forEach((t) => {
    if (+t.fecha.slice(0, 4) !== anio) return;
    const m = meses[+t.fecha.slice(5, 7) - 1];
    m.total++;
    if (t.tipo === 'Preventivo') m.preventivos++;
    if (t.tipo === 'Correctivo') m.correctivos++;
    m.parada = r2(m.parada + (t.parada || 0));
    m.costo = r2(m.costo + (t.costo || 0));
  });
  return meses;
}
/** Por actividad: veces, parada y costo. */
export function porActividad(trabajos, plan) {
  const nombres = (plan || []).map((p) => p.actividad);
  (trabajos || []).forEach((t) => { if (t.actividad && nombres.indexOf(t.actividad) === -1) nombres.push(t.actividad); });
  return nombres.map((a) => {
    const l = (trabajos || []).filter((t) => t.actividad === a);
    return { actividad: a, veces: l.length, parada: suma(l, 'parada'), costo: suma(l, 'costo') };
  });
}

/* ── ⬇ El Excel de la vista ─────────────────────────────── */
/** Las hojas del Excel: [nombre, filas (la primera, la cabecera)]. Lo calculado (próximos, lecturas, indicadores) y lo
    registrado (trabajos y lecturas, del más reciente al más viejo, con el horómetro real y el del tablero). */
export function hojasExcel({ prox, lec, ind, trabajos, lecturas, equipos }) {
  const eq = new Map((equipos || []).map((e) => [e.codigo, e]));
  const v = (x) => (x == null ? '' : x);
  const desc = (a, b) => -orden(a, b);
  return [
    ['Próximos cambios', [['Equipo', 'Actividad', 'Intervalo (h)', 'Intervalo (días)', 'Último cambio', 'Horómetro último cambio', 'Horómetro actual',
      'Próximo (h)', 'Faltan (h)', 'Próximo (fecha)', 'Faltan (días)', 'Base del cálculo', 'Estado']]
      .concat(porUrgencia((prox || []).filter((p) => p.estado !== MNT_ESTADO.SIN_PLAN)).map((p) => [p.equipo, p.actividad, v(p.intervaloH), v(p.intervaloD),
        p.ultimoFecha, v(p.ultimoH), v(p.actualH), v(p.proxH), v(p.faltanH), p.proxF, v(p.faltanD), p.base, p.estado]))],
    ['Lecturas por equipo', [['Equipo', 'Ubicación', 'Lecturas', 'Última', 'Corriente (A)', 'Prom. corriente', 'Máx. corriente', 'Presión (psi)',
      'Prom. presión', 'Temperatura (°C)', 'Prom. temperatura', 'Máx. temperatura', 'Carga (%)', 'Estado']]
      .concat((lec || []).map((r) => { const u = r.ultima || {}; return [r.equipo, r.ubicacion, r.n, u.fecha || '', v(u.corriente), v(r.promedio.corriente),
        v(r.maximo.corriente), v(u.presion), v(r.promedio.presion), v(u.temperatura), v(r.promedio.temperatura), v(r.maximo.temperatura), v(r.carga), r.estado]; }))],
    ['Indicadores', [['Equipo', 'Ubicación', 'Horas operadas', 'Preventivos', 'Correctivos', 'Total', '% preventivo', 'Parada total (h)',
      'Parada por fallas (h)', 'MTBF (h)', 'MTTR (h)', 'Disponibilidad (%)', 'Costo (USD)']]
      .concat(((ind && ind.porEquipo) || []).map((x) => [x.equipo, x.ubicacion, v(x.horas), x.preventivos, x.correctivos, x.total, v(x.pctPreventivo),
        x.paradaTotal, x.paradaFallas, v(x.mtbf), v(x.mttr), v(x.disponibilidad), x.costo]))],
    ['Trabajos', [['Fecha', 'Equipo', 'Tipo', 'Actividad', 'Horómetro real (h)', 'Horómetro del tablero (h)', 'Descripción', 'Repuestos / materiales',
      'Cantidad', 'Costo (USD)', 'Técnico', 'Hora inicio', 'Hora fin', 'Parada (h)', 'Estado', 'Observaciones', 'Aceite usado (L)', 'ID']]
      .concat((trabajos || []).map((t) => ({ ...t, hora: t.horaInicio })).sort(desc).map((t) => [t.fecha, t.equipo, t.tipo, t.actividad,
        v(horasReales(t.horometro, eq.get(t.equipo), t.fecha)), v(t.horometro), t.descripcion, t.repuestos, v(t.cantidad), v(t.costo), t.tecnico,
        t.horaInicio, t.horaFin, v(t.parada), t.estado, t.observaciones, v(t.aceite), t.id]))],
    ['Lecturas', [['Fecha', 'Hora', 'Equipo', 'Horómetro real (h)', 'Horómetro del tablero (h)', 'Corriente (A)', 'Presión (psi)', 'Temperatura (°C)',
      'Técnico', 'Observaciones', 'ID']]
      .concat((lecturas || []).slice().sort(desc).map((l) => [l.fecha, l.hora, l.equipo, v(horasReales(l.horometro, eq.get(l.equipo), l.fecha)),
        v(l.horometro), v(l.corriente), v(l.presion), v(l.temperatura), l.tecnico, l.observaciones, l.id]))],
  ];
}

/* ── 📜 Historial ───────────────────────────────────────── */
/** Trabajos y lecturas de un equipo (o de todos), del más reciente al más viejo. */
export function historial({ trabajos, lecturas, equipo }) {
  const f = (x) => !equipo || x.equipo === equipo;
  const desc = (a, b) => -orden(a, b);
  return { trabajos: (trabajos || []).filter(f).map((t) => ({ ...t, hora: t.horaInicio })).sort(desc),
    lecturas: (lecturas || []).filter(f).slice().sort(desc) };
}
