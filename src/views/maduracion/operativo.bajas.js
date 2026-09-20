/* ============================================================
   MADURACIÓN · OPERATIVO — BAJAS (F3.1, 2026-09-20)

   Lo que enseña la sub-vista «💀 Bajas», con el diseño que aprobó el usuario el 2026-09-20: el desglose cruzado
   de muerte natural frente a descarte de selección (con selector de agrupación: sala · tanque · lote), el Pareto
   de los motivos de Fin de Ciclo, la distribución por HORA del día, el mapa de calor sala × día y la tabla de
   lotes cerrados con su DIFERENCIA de cierre. Módulo PURO: ni DOM ni red.

   🔑🔑 LA MUERTE NATURAL Y EL DESCARTE SON COLUMNAS DISJUNTAS, y se SUMAN. Medido en el libro, que hace
   `bajas = muertes + selecc` antes de descontarlas del tanque (mad-libro.js, «Bajas del día»). Es lo CONTRARIO
   del caso de la mortalidad en desove, que sí va dentro de `muertos` —por eso en la cascada de un lote (F2.1)
   va como «de los cuales» y aquí, en cambio, el descarte tiene su propia columna—. No se deducen el uno del
   otro: cada uno viene de su par de celdas.

   🔑 Y CADA AGRUPACIÓN LEE DE DONDE PUEDE, que no es lo mismo:
   · Por SALA o TANQUE se leen los partes registrados (`diasDeTanque`), porque una fila de Tanques dice su sala
     y su tanque pero NO de qué lote era cada animal. Un filtro de lote o de código no puede honrarse aquí, y se
     DICE en `ignora` en vez de enseñar una cifra de otra cosa. Es la misma regla que la mortalidad de F1.
   · Por LOTE se leen los acumulados del libro en la serie —la resta entre el cierre del período y la VÍSPERA de
     su primer día, igual que `kpiMortalidad`—, porque el reparto de un tanque mezclado sólo lo sabe el libro.
     ⚠ Ahí `muertos` incluye las hembras muertas en tanques de desove y de recuperación, así que se devuelve
     aparte su cifra (`desove`) para que la pantalla pueda decir cuántas de esas muertes no fueron en su tanque.

   ⚠ El `pct` de cada fila es su PARTE DEL TOTAL de bajas del período, no una tasa de mortalidad. La tasa es por
   lote y ya la da `kpiMortalidad` con la regla del ⚖️ Saldo: mezclar las dos cosas en una columna las haría
   indistinguibles.

   ⏳ Con los datos del 2026-09-20 la hoja de cierres tiene CERO filas: los motivos y los lotes cerrados nacen
   vacíos, y eso es lo correcto, no un fallo.
   ============================================================ */
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { MAD_FIN_MOTIVOS } from '../registros/lib/ficha-maduracion-fin-ciclo.schema.js';
import { sumarDias, ubicKey } from '../registros/lib/mad-libro.js';
import { fechaDeFila } from './operativo.data.js';
import { cociente } from './operativo.indicadores.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const num = (v) => {
  const t = txt(v);
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const ent = (v) => { const n = num(v); return n !== null && n > 0 ? n : 0; };
const enPeriodo = (f, p) => esIso(f) && f >= p.desde && f <= p.hasta;
const par = (machos, hembras) => ({ machos: ent(machos), hembras: ent(hembras), total: ent(machos) + ent(hembras) });

/** Las tres agrupaciones del selector, en su orden. «sala» es la de por defecto. */
export const DIMENSIONES_BAJAS = [
  { clave: 'sala', etiqueta: 'Sala' },
  { clave: 'tanque', etiqueta: 'Tanque' },
  { clave: 'lote', etiqueta: 'Lote' },
];

/** Las dimensiones del filtro que una agrupación NO puede honrar, para decirlo en pantalla. */
function noHonra(F, dimension) {
  const fuera = [];
  if (dimension === 'lote') {
    if (F.sala) fuera.push('sala');
    if (F.tanque !== null) fuera.push('tanque');
    if (F.codigo) fuera.push('código genético');
  } else {
    if (F.lote) fuera.push('lote');
    if (F.codigo) fuera.push('código genético');
  }
  return fuera;
}

/** Suma de un par de pares. */
const masPar = (a, b) => par(a.machos + b.machos, a.hembras + b.hembras);

/** Las bajas del período agrupadas por SALA o por TANQUE, de los partes registrados. */
function porPartes(partes, F, periodo, dimension) {
  const m = new Map();
  for (const d of partes || []) {
    if (!enPeriodo(txt(d.fecha), periodo)) continue;
    if (F.sala && d.sala !== F.sala) continue;
    if (F.tanque !== null && Number(d.tanque) !== F.tanque) continue;
    const clave = dimension === 'tanque' ? ubicKey(d.sala, d.tanque) : txt(d.sala);
    if (!clave) continue;
    const f = m.get(clave) || { clave, sala: txt(d.sala), tanque: dimension === 'tanque' ? d.tanque : null,
      natural: par(0, 0), descarte: par(0, 0) };
    f.natural = masPar(f.natural, par(d.machosMuertos, d.hembrasMuertas));
    f.descarte = masPar(f.descarte, par(d.machosDescarte, d.hembrasDescarte));
    m.set(clave, f);
  }
  return [...m.values()];
}

/** Las bajas del período por LOTE: la resta de los acumulados del libro entre el cierre y la víspera. */
function porLoteEnSerie(serie, F, periodo) {
  const porFecha = new Map((serie || []).map((d) => [txt(d.fecha), d]));
  const fin = porFecha.get(periodo.hasta);
  const antes = porFecha.get(sumarDias(periodo.desde, -1));
  if (!fin || !antes) return null;
  const de = (foto, lote, campo) => {
    const o = (foto.porLote || {})[lote] || {};
    const c = o[campo] || {};
    return { machos: ent(c.machos), hembras: ent(c.hembras) };
  };
  const filas = [];
  for (const lote of Object.keys(fin.porLote || {})) {
    if (F.lote && normLote(lote) !== F.lote) continue;
    const m0 = de(antes, lote, 'muertos');
    const m1 = de(fin, lote, 'muertos');
    const d0 = de(antes, lote, 'descartes');
    const d1 = de(fin, lote, 'descartes');
    const natural = par(m1.machos - m0.machos, m1.hembras - m0.hembras);
    const descarte = par(d1.machos - d0.machos, d1.hembras - d0.hembras);
    if (!natural.total && !descarte.total) continue;
    filas.push({ clave: txt(lote), sala: '', tanque: null, natural, descarte });
  }
  return filas;
}

/** Las hembras que murieron en tanques de DESOVE o de RECUPERACIÓN en el período, por lote. Van DENTRO de
 *  `natural` (el libro las suma a `muertos`), así que se devuelven aparte para poder decirlo. */
function desovePorLote(fuentes, periodo, F) {
  const m = new Map();
  for (const r of ((fuentes || {}).mortDesove || [])) {
    const lote = txt(r.Lote);
    if (!lote || (F.lote && normLote(lote) !== F.lote)) continue;
    if (!enPeriodo(fechaDeFila('mortDesove', r), periodo)) continue;
    m.set(lote, (m.get(lote) || 0) + ent(r['Hembras muertas']));
  }
  return m;
}

/**
 * El desglose cruzado del período: muerte natural frente a descarte de selección, por sexo, en la agrupación
 * elegida. `modo` dice de dónde salen las cifras y `ignora`, qué filtros no ha podido honrar esa agrupación.
 */
export function desgloseDeBajas(M, serie, partes, F, periodo, dimension) {
  const dim = DIMENSIONES_BAJAS.some((d) => d.clave === dimension) ? dimension : 'sala';
  const ignora = noHonra(F, dim);
  let filas;
  const modo = dim === 'lote' ? 'libro' : 'registradas';
  if (dim === 'lote') {
    filas = porLoteEnSerie(serie, F, periodo);
    if (filas === null) return { dimension: dim, filas: [], totales: par(0, 0), modo: 'sin-serie', ignora, desove: 0 };
    const des = desovePorLote((M || {}).fuentes, periodo, F);
    filas.forEach((f) => { f.desove = des.get(f.clave) || 0; });
  } else {
    filas = porPartes(partes, F, periodo, dim);
  }
  const natural = filas.reduce((a, f) => masPar(a, f.natural), par(0, 0));
  const descarte = filas.reduce((a, f) => masPar(a, f.descarte), par(0, 0));
  const total = natural.total + descarte.total;
  filas.forEach((f) => { f.total = f.natural.total + f.descarte.total; f.pct = cociente(f.total, total, 100); });
  filas.sort((a, b) => b.total - a.total || porNombre(a.clave, b.clave));
  return {
    dimension: dim, filas, modo, ignora,
    totales: { natural, descarte, total, pctDescarte: cociente(descarte.total, total, 100) },
    desove: dim === 'lote' ? filas.reduce((a, f) => a + ent(f.desove), 0) : 0,
  };
}

/* ── LOS MOTIVOS DE FIN DE CICLO (Pareto) ───────────────────── */

/**
 * Los cierres del período por MOTIVO, ordenados de mayor a menor con su acumulado (Pareto). Un motivo que no
 * esté en el catálogo se enseña igual, rotulado: la hoja es de producción y puede traer lo que sea.
 */
export function motivosDeCierre(fuentes, periodo, F) {
  const m = new Map();
  let metabisulfito = 0;
  for (const r of ((fuentes || {}).cierres || [])) {
    const lote = txt(r.Lote);
    if (F.lote && normLote(lote) !== F.lote) continue;
    if (!enPeriodo(fechaDeFila('cierres', r), periodo)) continue;
    const motivo = txt(r.Motivo) || '(sin motivo)';
    const f = m.get(motivo) || { motivo, enCatalogo: MAD_FIN_MOTIVOS.includes(motivo), cierres: 0, totales: 0,
      parciales: 0, machos: 0, hembras: 0, total: 0, rojos: 0, metabisulfito: 0, lotes: new Set() };
    f.cierres++;
    if (txt(r.Tipo) === 'Total') f.totales++; else f.parciales++;
    f.machos += ent(r.Machos);
    f.hembras += ent(r.Hembras);
    f.total = f.machos + f.hembras;
    f.rojos += ent(r.Rojos);
    const kg = num(r['Metabisulfito (kg)']);
    if (kg !== null && kg > 0) { f.metabisulfito += kg; metabisulfito += kg; }
    if (lote) f.lotes.add(lote);
    m.set(motivo, f);
  }
  const filas = [...m.values()].sort((a, b) => b.total - a.total || b.cierres - a.cierres || porNombre(a.motivo, b.motivo));
  const total = filas.reduce((a, f) => a + f.total, 0);
  let acum = 0;
  for (const f of filas) {
    acum += f.total;
    f.pct = cociente(f.total, total, 100);
    f.acumulado = cociente(acum, total, 100);
    f.lotes = [...f.lotes].sort(porNombre);
    f.metabisulfito = Math.round(f.metabisulfito * 100) / 100;
  }
  return { filas, total, cierres: filas.reduce((a, f) => a + f.cierres, 0), metabisulfito: Math.round(metabisulfito * 100) / 100 };
}

/* ── LA DISTRIBUCIÓN POR HORA ───────────────────────────────── */

/**
 * Las bajas del período por HORA del día (la columna «Hora» de cada parte, agrupada por su hora entera: los
 * partes son rondas, no instantes). Las filas sin hora se cuentan aparte en vez de caer en una hora inventada.
 * ⚠ Aquí se leen las FILAS de Tanques, no `diasDeTanque`: ése colapsa los partes de un día y pierde la hora.
 */
export function bajasPorHora(fuentes, periodo, F) {
  const m = new Map();
  let sinHora = 0;
  let registros = 0;
  for (const r of ((fuentes || {}).tanques || [])) {
    if (!enPeriodo(fechaDeFila('tanques', r), periodo)) continue;
    if (F.sala && txt(r.Sala) !== F.sala) continue;
    if (F.tanque !== null && Number(r.Tanque) !== F.tanque) continue;
    const natural = par(r['Machos muertos'], r['Hembras muertas']);
    const descarte = par(r['Machos muertos por descarte de selección'], r['Hembras muertas por descarte de selección']);
    if (!natural.total && !descarte.total) continue;
    registros++;
    const h = /^(\d{1,2}):\d{2}/.exec(txt(r.Hora));
    if (!h) { sinHora += natural.total + descarte.total; continue; }
    const hora = String(Number(h[1])).padStart(2, '0');
    const f = m.get(hora) || { hora, natural: par(0, 0), descarte: par(0, 0), partes: 0 };
    f.natural = masPar(f.natural, natural);
    f.descarte = masPar(f.descarte, descarte);
    f.partes++;
    m.set(hora, f);
  }
  const horas = [...m.values()].sort((a, b) => porNombre(a.hora, b.hora));
  const total = horas.reduce((a, f) => a + f.natural.total + f.descarte.total, 0);
  let pico = '';
  let max = 0;
  for (const f of horas) {
    f.total = f.natural.total + f.descarte.total;
    f.pct = cociente(f.total, total, 100);
    if (f.total > max) { max = f.total; pico = f.hora; }
  }
  return { horas, total, max, pico, sinHora, registros, ignora: noHonra(F, 'sala') };
}

/* ── EL MAPA DE CALOR sala × día ────────────────────────────── */

/**
 * Las bajas de cada sala en cada día del período. `valores` lleva `null` donde NO hubo parte y `0` donde lo
 * hubo sin bajas: no es lo mismo «no se registró» que «se registró y no murió ninguno».
 */
export function calorSalaDia(partes, F, periodo) {
  const dias = [];
  for (let d = periodo.desde; d && d <= periodo.hasta; d = sumarDias(d, 1)) dias.push(d);
  const idx = new Map(dias.map((d, i) => [d, i]));
  const m = new Map();
  for (const p of partes || []) {
    const f = txt(p.fecha);
    if (!idx.has(f)) continue;
    if (F.sala && p.sala !== F.sala) continue;
    if (F.tanque !== null && Number(p.tanque) !== F.tanque) continue;
    const sala = txt(p.sala);
    if (!sala) continue;
    if (!m.has(sala)) m.set(sala, { sala, valores: dias.map(() => null), total: 0 });
    const fila = m.get(sala);
    const i = idx.get(f);
    const n = ent(p.machosMuertos) + ent(p.hembrasMuertas) + ent(p.machosDescarte) + ent(p.hembrasDescarte);
    fila.valores[i] = ent(fila.valores[i]) + n;
    fila.total += n;
  }
  const salas = [...m.values()].sort((a, b) => porNombre(a.sala, b.sala));
  const max = salas.reduce((a, s) => Math.max(a, ...s.valores.map((v) => ent(v))), 0);
  return { dias, salas, max, ignora: noHonra(F, 'sala') };
}

/* ── LOS LOTES CERRADOS ─────────────────────────────────────── */

/**
 * Los cierres del período, uno por fila, con lo que salió y la DIFERENCIA que el libro anotó al cerrarlos (lo
 * que contaba vivo y no salió). La diferencia NO se recalcula: se leen los avisos `diferencia-cierre` del
 * libro, que es donde vive, con su misma fecha y su mismo lote.
 */
export function lotesCerrados(M, F, periodo) {
  const libro = (M && M.libro) || { avisos: [] };
  const dif = new Map();
  for (const a of (libro.avisos || [])) {
    if (a.tipo !== 'diferencia-cierre') continue;
    const k = normLote(a.lote) + '|' + txt(a.fecha);
    const d = dif.get(k) || { machos: 0, hembras: 0 };
    if (a.sexo === 'machos') d.machos += ent(a.cantidad);
    else if (a.sexo === 'hembras') d.hembras += ent(a.cantidad);
    dif.set(k, d);
  }
  const filas = [];
  for (const r of ((M && M.fuentes ? M.fuentes.cierres : null) || [])) {
    const lote = txt(r.Lote);
    if (F.lote && normLote(lote) !== F.lote) continue;
    const fecha = fechaDeFila('cierres', r);
    if (!enPeriodo(fecha, periodo)) continue;
    const esTotal = txt(r.Tipo) === 'Total';
    const d = (esTotal && dif.get(normLote(lote) + '|' + fecha)) || { machos: 0, hembras: 0 };
    filas.push({
      lote, fecha, tipo: txt(r.Tipo), motivo: txt(r.Motivo), sala: txt(r.Sala),
      salida: par(r.Machos, r.Hembras),
      rojos: ent(r.Rojos),
      diferencia: par(d.machos, d.hembras),
      metabisulfito: num(r['Metabisulfito (kg)']),
      fechaMetabisulfito: txt(r['Fecha aplicación']),
      pesoTotal: num(r['Peso total (kg)']),
      observaciones: txt(r.Observaciones),
    });
  }
  return filas.sort((a, b) => porNombre(b.fecha, a.fecha) || porNombre(a.lote, b.lote));
}
