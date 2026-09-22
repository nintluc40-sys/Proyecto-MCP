/* ============================================================
   MADURACIÓN · OPERATIVO — lo que ENSEÑA el tablero (F1, 2026-09-19)

   Convierte el modelo de `operativo.data.js` en lo que pintan «📊 Estado actual» y «🏠 Salas», con el diseño que
   aprobó el usuario el 2026-09-19: los seis indicadores de la portada, el mapa de planta, las alertas, los últimos
   registros, los fines de cuarentena, las tarjetas de sala y el detalle de una sala. Módulo PURO: ni DOM ni red; la
   vista (`operativo.view.js`) sólo pinta lo que sale de aquí.

   Reglas que no se ven en las fórmulas:
   · La FOTO es el cierre del día elegido (vivos, estados, ocupación, mapa, cuarentenas). El PERÍODO acota lo que se
     acumula (mortalidad del período, desoves, lecturas fuera de rango, gráficos) y termina siempre en la foto.
   · Los FILTROS (sala → tanque, lote → código genético) se aplican a lo que los admite. Lo que no los admite lo DICE
     en vez de enseñar un cero o una cifra de otra cosa: la tasa de mortalidad es por LOTE, porque el libro lleva las
     bajas por lote; un desove es de un lote y un código, nunca de una sala o un tanque.
   · El lote y el código casan por su forma canónica (`normLote`, `normCodigoGenetico`), como en las fichas.
   · El tanque sólo significa algo con su sala: el número se repite entre salas (la 1 y la 4 tienen un tanque 1).
   · Nada que ya calcule el ⚖️ Saldo se recalcula con otra fórmula: la T° y el O₂ del último registro, la
     alcalinidad, el RAS, las toneladas, las cargas y los tratamientos salen de `resumenMaduracion`; los estados, del
     libro. Lo único que se añade al último registro son sus extremos, leídos del MISMO registro que usa el Saldo.
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { MAD_TANQUES_POR_SALA } from '../registros/lib/ficha-maduracion-ingreso.schema.js';
import { sumarDias, ubicKey, CUARENTENA_DIAS, ESTADO_CUARENTENA, ESTADO_PRODUCCION, ESTADO_MIXTO } from '../registros/lib/mad-libro.js';
import { diasEntre, RESUMEN_TEMPS, RESUMEN_OXIGENOS } from '../registros/lib/mad-resumen.js';
import { PERIODO_DIAS, SALAS_VISIBLES, fechaDeFila } from './operativo.data.js';
import { cociente, proporcionHM, densidadTanque, ocupacion, fueraDeRango, diasDesdeDesinfeccion } from './operativo.indicadores.js';
import { umbralVigente, evaluar } from './operativo.umbrales.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const fecha10 = (v) => txt(v).slice(0, 10);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
/* Como `num` de mad-resumen.js: vacío → null; lo que no es un número finito → null. Tiene que ser el MISMO criterio
   para que «el registro que trae la variable» sea el mismo registro que elige el Saldo. */
const num = (v) => {
  const t = txt(v);
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const ent = (v) => { const n = num(v); return n !== null && n > 0 ? n : 0; };
const vivo = (c) => c.machos > 0 || c.hembras > 0;
const enPeriodo = (f, p) => esIso(f) && f >= p.desde && f <= p.hasta;

/* ── PERÍODO ────────────────────────────────────────────────── */

/** Los períodos del selector, en su orden. «30 d» es el de por defecto (decisión del usuario, 2026-09-19). */
export const PERIODOS = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: '7d', etiqueta: '7 d' },
  { clave: '30d', etiqueta: '30 d' },
  { clave: 'mes', etiqueta: 'Mes' },
  { clave: 'ciclo', etiqueta: 'Ciclo' },
  { clave: 'todo', etiqueta: 'Todo' },
];
export const PERIODO_INICIAL = '30d';

/** La primera fecha registrada en cualquiera de las hojas, sin pasar de `hasta`; '' si no hay ninguna. */
export function primeraFecha(fuentes, hasta) {
  let p = '';
  for (const [clave, filas] of Object.entries(fuentes || {})) {
    for (const r of filas || []) {
      const f = fechaDeFila(clave, r);
      if (!esIso(f) || (hasta && f > hasta)) continue;
      if (!p || f < p) p = f;
    }
  }
  return p;
}

/** El período que TERMINA en la foto (`fecha`): hoy, 7 días, 30 días, el mes de la foto o todo lo registrado.
 *  Una clave desconocida es la de por defecto. `dias` cuenta los dos extremos. */
export function periodoDe(clave, fecha, fuentes, ciclo) {
  const hasta = txt(fecha);
  let c = clave;
  let desde;
  if (c === 'hoy') desde = hasta;
  else if (c === '7d') desde = sumarDias(hasta, -6);
  else if (c === 'mes') desde = hasta.slice(0, 8) + '01';
  else if (c === 'todo') desde = primeraFecha(fuentes, hasta) || hasta;
  else if (c === 'ciclo') {
    /* El CICLO es el del lote del filtro. Sin lote elegido no hay ciclo que enseñar: se cae al período de por
       defecto y SE DICE (`cicloSinLote`), en vez de fingir un rango que no significa nada. */
    if (ciclo && esIso(ciclo.desde)) return { clave: 'ciclo', desde: ciclo.desde, hasta: ciclo.hasta, dias: diasEntre(ciclo.desde, ciclo.hasta) + 1 };
    c = PERIODO_INICIAL;
    desde = sumarDias(hasta, -(PERIODO_DIAS - 1));
    return { clave: c, desde, hasta, dias: diasEntre(desde, hasta) + 1, cicloSinLote: true };
  } else { c = PERIODO_INICIAL; desde = sumarDias(hasta, -(PERIODO_DIAS - 1)); }
  return { clave: c, desde, hasta, dias: diasEntre(desde, hasta) + 1 };
}

/** El CICLO de un lote: de su ingreso a su cierre, o a la foto si sigue abierto. `null` si no hay lote elegido,
 *  si el libro no lo conoce o si no tiene fecha de ingreso. */
export function cicloDelLote(libro, lote, fecha) {
  const clave = normLote(lote || '');
  if (!clave) return null;
  for (const [k, L] of (libro && libro.lotes) || new Map()) {
    if (normLote(k) !== clave) continue;
    const desde = txt(L.ingreso);
    if (!esIso(desde)) return null;
    const fin = txt(L.cerrado);
    return { desde, hasta: esIso(fin) && fin < txt(fecha) ? fin : txt(fecha) };
  }
  return null;
}

/* ── FILTROS ────────────────────────────────────────────────── */

/** El filtro con la forma con que se compara: el tanque sólo con su sala (sin sala no identifica nada) y como
 *  número; el lote y el código, canónicos. */
export function normalizarFiltro(f, indice) {
  const x = f || {};
  const sala = txt(x.sala);
  const t = sala && txt(x.tanque) !== '' ? Number(x.tanque) : NaN;
  const F = { sala, tanque: Number.isFinite(t) ? t : null, lote: normLote(x.lote || ''), codigo: normCodigoGenetico(x.codigo || ''),
    estado: txt(x.estado), sexo: x.sexo === 'machos' || x.sexo === 'hembras' ? x.sexo : '',
    piscina: txt(x.piscina), camaronera: txt(x.camaronera) };
  /* El ÍNDICE viaja dentro del filtro a propósito: el estado y el origen no están en una posición del libro, y
     así `posicionEnFiltro` no cambia de firma en los nueve sitios que la llaman. Sin índice, esos dos filtros
     no pueden aplicarse y se ignoran (es lo que pasa en las pruebas puras, que no lo necesitan). */
  if (indice) F.indice = indice;
  return F;
}
export const hayFiltro = (F) => !!(F && (F.sala || F.tanque !== null || F.lote || F.codigo || F.estado || F.sexo || F.piscina || F.camaronera));

/** Lo que los filtros nuevos necesitan y una posición no lleva encima: el ESTADO del lote en cada sala (del
 *  libro) y el ORIGEN con que entró (del Ingreso). Se construye UNA vez por pintada. */
export function indiceDeFiltro(M) {
  const origen = new Map();
  for (const r of (((M && M.fuentes) || {}).ingresos || [])) {
    const k = normLote(r.Lote);
    if (!k) continue;
    const o = origen.get(k) || { piscinas: new Set(), camaroneras: new Set() };
    const pi = txt(r['Piscina Broodstock']);
    if (pi) o.piscinas.add(pi);
    const ca = txt(r['Camaronera origen']);
    if (ca) o.camaroneras.add(ca);
    origen.set(k, o);
  }
  return { origen, lotes: ((M && M.libro) || {}).lotes || new Map() };
}

/** Los filtros ACTIVOS, para enseñarlos como etiquetas quitables. El tanque cuenta aunque valga 0. */
export const DIMENSIONES_FILTRO = [
  { dim: 'sala', rotulo: 'Sala' }, { dim: 'tanque', rotulo: 'Tanque' }, { dim: 'lote', rotulo: 'Lote' },
  { dim: 'codigo', rotulo: 'Código' }, { dim: 'estado', rotulo: 'Estado' }, { dim: 'sexo', rotulo: 'Sexo' },
  { dim: 'piscina', rotulo: 'Piscina' }, { dim: 'camaronera', rotulo: 'Camaronera' },
];
const SEXO_ETIQUETA = { machos: '♂ Machos', hembras: '♀ Hembras' };
export function etiquetasDeFiltro(F) {
  return DIMENSIONES_FILTRO
    .filter((d) => (d.dim === 'tanque' ? (F || {}).tanque !== null && (F || {}).tanque !== undefined : !!(F || {})[d.dim]))
    .map((d) => ({ dim: d.dim, rotulo: d.rotulo, valor: d.dim === 'sexo' ? SEXO_ETIQUETA[F.sexo] : String(F[d.dim]) }));
}

/** ¿Pasa esta posición del libro (sala, tanque, lote, código genético) por el filtro? */
export function posicionEnFiltro(p, F) {
  if (F.sala && p.sala !== F.sala) return false;
  if (F.tanque !== null && Number(p.tanque) !== F.tanque) return false;
  if (F.lote && normLote(p.lote) !== F.lote) return false;
  if (F.codigo && normCodigoGenetico(p.codigoGenetico) !== F.codigo) return false;
  /* SEXO: la posición que no tiene ninguno de ese sexo se va. Y lo que se CUENTA de las que se quedan es sólo ese
     sexo (`sumarVivos`): filtrar por hembras y seguir sumando machos enseñaría una cifra que no es la pedida. */
  if (F.sexo && ent(p[F.sexo]) <= 0) return false;
  const ix = F.indice;
  if (ix) {
    if (F.estado && estadoEnSala(ix.lotes.get(p.lote), p.sala) !== F.estado) return false;
    if (F.piscina || F.camaronera) {
      const o = ix.origen.get(normLote(p.lote));
      if (F.piscina && !(o && o.piscinas.has(F.piscina))) return false;
      if (F.camaronera && !(o && o.camaroneras.has(F.camaronera))) return false;
    }
  }
  return true;
}

function sumarVivos(posiciones, F) {
  const solo = (F || {}).sexo || '';
  let machos = 0;
  let hembras = 0;
  for (const p of posiciones) {
    if (solo !== 'hembras') machos += ent(p.machos);
    if (solo !== 'machos') hembras += ent(p.hembras);
  }
  return { machos, hembras, total: machos + hembras };
}

/** El estado de un lote DENTRO de una sala, tal como lo dejó el libro al cierre de la foto (su reloj en esa sala). */
function estadoEnSala(L, sala) {
  const S = ((L && L.salas) || []).find((s) => s.sala === sala);
  return (S && S.estado) || '';
}

/* ── LOS SEIS INDICADORES DE LA PORTADA ─────────────────────── */

/** Vivos al cierre de la foto, por sexo, y la proporción H:M con su semáforo. Admite los cuatro filtros. */
export function kpiVivos(libro, F) {
  const v = sumarVivos(libro.posiciones.filter((p) => posicionEnFiltro(p, F)), F);
  const hm = proporcionHM(v.hembras, v.machos);
  return { ...v, hm, hmEstado: evaluar('proporcionHM', hm) };
}

/** Los lotes con animales vivos en el filtro, por estado. El de un lote es el de las salas donde tiene esos
 *  animales: el de ESA sala con filtro de sala, y `Mixto` si sus salas no coinciden (la regla del libro). */
export function kpiLotes(libro, F) {
  const presentes = new Map();
  for (const p of libro.posiciones) {
    if (!vivo(p) || !posicionEnFiltro(p, F)) continue;
    if (!presentes.has(p.lote)) presentes.set(p.lote, new Set());
    presentes.get(p.lote).add(p.sala);
  }
  const cuenta = { produccion: 0, cuarentena: 0, mixto: 0, otros: 0 };
  const lotes = [];
  for (const [lote, salas] of presentes) {
    const L = libro.lotes.get(lote);
    const estados = [...new Set([...salas].map((s) => estadoEnSala(L, s)).filter(Boolean))];
    const estado = estados.length > 1 ? ESTADO_MIXTO : estados[0] || '';
    lotes.push({ lote, estado });
    if (estado === ESTADO_PRODUCCION) cuenta.produccion++;
    else if (estado === ESTADO_CUARENTENA) cuenta.cuarentena++;
    else if (estado === ESTADO_MIXTO) cuenta.mixto++;
    else cuenta.otros++;
  }
  return { total: lotes.length, ...cuenta, lotes: lotes.sort((a, b) => porNombre(a.lote, b.lote)) };
}

/** Las salas cuyo estado REGISTRADO en la hoja difiere del que PROPONE el libro (decisión del usuario: se enseñan
 *  los dos y se marca si difieren), y las que no tienen uno de los dos. Admite el filtro de sala. */
export function kpiSalas(salas, F) {
  const ss = (salas || []).filter((s) => !F.sala || s.sala === F.sala);
  return {
    total: ss.length,
    difieren: ss.filter((s) => s.coinciden === false).length,
    coinciden: ss.filter((s) => s.coinciden === true).length,
    sinRegistro: ss.filter((s) => !s.registrado.estado).length,
    sinPropuesta: ss.filter((s) => !s.propuesto.estado).length,
  };
}

/**
 * BIOMASA del alcance del filtro: los vivos por su peso promedio, en kg. El peso sale de la hoja de Tanques
 * —los registros del período— PESADO por los animales que el libro tiene en cada tanque, que es el mismo criterio
 * con que la ficha de un lote reparte los promedios de sus tanques.
 * ⚠ Sin ningún peso registrado se devuelve VACÍO, no un cero: una biomasa inventada es peor que ninguna.
 * `parcial` avisa de que sólo un sexo trae peso, para que la pantalla no lo presente como el total.
 */
export function kpiBiomasa(M, F, periodo) {
  const libro = (M && M.libro) || { posiciones: [] };
  const solo = (F || {}).sexo || '';
  const porTanque = new Map();
  for (const p of libro.posiciones || []) {
    if (!vivo(p) || !posicionEnFiltro(p, F)) continue;
    const uk = ubicKey(p.sala, p.tanque);
    const c = porTanque.get(uk) || { machos: 0, hembras: 0 };
    if (solo !== 'hembras') c.machos += ent(p.machos);
    if (solo !== 'machos') c.hembras += ent(p.hembras);
    porTanque.set(uk, c);
  }
  let pmNum = 0;
  let pmDen = 0;
  let phNum = 0;
  let phDen = 0;
  for (const r of ((M || {}).fuentes || {}).tanques || []) {
    const c = porTanque.get(ubicKey(r.Sala, ent(r.Tanque)));
    if (!c || !enPeriodo(fechaDeFila('tanques', r), periodo)) continue;
    const pm = num(r['Peso promedio machos (g)']);
    const ph = num(r['Peso promedio hembras (g)']);
    if (pm !== null && c.machos > 0) { pmNum += pm * c.machos; pmDen += c.machos; }
    if (ph !== null && c.hembras > 0) { phNum += ph * c.hembras; phDen += c.hembras; }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const v = sumarVivos([...porTanque.values()]);
  const pesoM = pmDen ? pmNum / pmDen : null;
  const pesoH = phDen ? phNum / phDen : null;
  const gM = pesoM === null ? null : v.machos * pesoM;
  const gH = pesoH === null ? null : v.hembras * pesoH;
  const kg = (g) => (g === null ? '' : r2(g / 1000));
  return {
    pesoMachos: pesoM === null ? '' : r2(pesoM), pesoHembras: pesoH === null ? '' : r2(pesoH),
    machosKg: kg(gM), hembrasKg: kg(gH),
    totalKg: gM === null && gH === null ? '' : r2(((gM || 0) + (gH || 0)) / 1000),
    parcial: (gM === null) !== (gH === null),
  };
}

/** Ocupación: tanques con animales vivos de los tanques físicos. Con un tanque elegido, si está ocupado; con lote o
 *  código, los tanques que tienen animales de ESE lote o código (de los de la sala, o de toda la planta). */
export function kpiOcupacion(salas, libro, F) {
  const ss = (salas || []).filter((s) => !F.sala || s.sala === F.sala);
  if (F.tanque !== null) {
    const ocupado = libro.posiciones.some((p) => vivo(p) && posicionEnFiltro(p, F)) ? 1 : 0;
    return { modo: 'tanque', ocupados: ocupado, total: 1, pct: ocupacion(ocupado, 1) };
  }
  const total = ss.reduce((a, s) => a + ent(s.propuesto.total), 0);
  /* F2.3 · CUALQUIER filtro que estreche las posiciones cuenta aquí, no sólo el lote y el código: con el de
     sexo, el de estado o el de origen, la ocupación seguía enseñando la FÍSICA de la sala y contradecía a los
     vivos de al lado («30 hembras, 2 tanques ocupados» con un solo tanque con hembras). */
  if (F.lote || F.codigo || F.estado || F.sexo || F.piscina || F.camaronera) {
    const con = new Set();
    for (const p of libro.posiciones) if (vivo(p) && posicionEnFiltro(p, F)) con.add(ubicKey(p.sala, p.tanque));
    return { modo: 'filtro', ocupados: con.size, total, pct: ocupacion(con.size, total) };
  }
  const ocupados = ss.reduce((a, s) => a + ent(s.propuesto.ocupados), 0);
  return { modo: 'salas', ocupados, total, pct: ocupacion(ocupados, total) };
}

/* La mortalidad entre dos cierres de la serie, con la regla del ⚖️ Saldo para la del día (mad-resumen.js ·
   «MORTALIDAD DEL DÍA»): los muertos que el libro sumó entre los dos cierres ÷ los animales EN RIESGO —los vivos al
   primer cierre más los que ingresaron entre los dos—. Para un lote y un día es exactamente la del Saldo; para varios
   lotes se suman numeradores y denominadores; para un período, el primer cierre es la víspera de su primer día. */
function tasaEntre(a, b, lote) {
  const A0 = a.porLote || {};
  const B0 = b.porLote || {};
  let muertos = 0;
  let riesgo = 0;
  for (const l of new Set([...Object.keys(A0), ...Object.keys(B0)])) {
    if (lote && normLote(l) !== lote) continue;
    const A = A0[l] || {};
    const B = B0[l] || {};
    for (const s of ['machos', 'hembras']) {
      muertos += Math.max(0, ent((B.muertos || {})[s]) - ent((A.muertos || {})[s]));
      riesgo += ent(A[s]) + Math.max(0, ent((B.ingresados || {})[s]) - ent((A.ingresados || {})[s]));
    }
  }
  return { muertos, riesgo, pct: cociente(muertos, riesgo, 100) };
}

/**
 * La mortalidad del día de la foto y la del período. `serie` es la de `serieDiaria` desde la VÍSPERA del período.
 *  · Sin filtro o con lote: la TASA (modo 'tasa'), con la regla del Saldo.
 *  · Con sala (o tanque): la tasa no se puede repartir por sala —el libro lleva las bajas por lote—, así que se
 *    cuentan las muertes REGISTRADAS en la hoja Tanques de esa sala o ese tanque (modo 'registradas'), de todos sus
 *    lotes. No incluye la mortalidad en tanques de desove, que es del lote y no de un tanque.
 *  · Con código genético y sin sala: no aplica (el libro no lleva las bajas por código).
 * `partes`: los de `diasDeTanque`.
 */
export function kpiMortalidad(serie, periodo, F, partes) {
  if (F.sala) {
    let dia = 0;
    let per = 0;
    for (const d of partes || []) {
      if (d.sala !== F.sala || (F.tanque !== null && d.tanque !== F.tanque) || !enPeriodo(d.fecha, periodo)) continue;
      const n = ent(d.machosMuertos) + ent(d.hembrasMuertas);
      per += n;
      if (d.fecha === periodo.hasta) dia += n;
    }
    return { modo: 'registradas', dia: { muertos: dia }, periodo: { muertos: per } };
  }
  if (F.codigo) return { modo: 'no-aplica' };
  const porFecha = new Map((serie || []).map((d) => [d.fecha, d]));
  const cierre = porFecha.get(periodo.hasta);
  const vispera = porFecha.get(sumarDias(periodo.hasta, -1));
  const antes = porFecha.get(sumarDias(periodo.desde, -1));
  if (!cierre || !vispera || !antes) return { modo: 'sin-serie' };
  return { modo: 'tasa', dia: tasaEntre(vispera, cierre, F.lote), periodo: tasaEntre(antes, cierre, F.lote) };
}

/** Los desoves del período (por su fecha de desove), con la fertilidad y los nauplios por hembra con la regla del
 *  Saldo: sólo sobre los desoves que ya tienen su N2 / su N5. Admite lote y código; un desove no es de una sala, así
 *  que el filtro de sala no se aplica y se DICE (`ignora`). */
export function kpiReproduccion(filasDesoves, periodo, F) {
  const a = { desoves: 0, huevos: 0, noViables: 0, n2: 0, n5: 0, huevosConN2: 0, desovesConN5: 0 };
  for (const r of filasDesoves || []) {
    if (!enPeriodo(fecha10(r.Fecha), periodo)) continue;
    if (F.lote && normLote(r.Lote) !== F.lote) continue;
    if (F.codigo && normCodigoGenetico(r['Código genético']) !== F.codigo) continue;
    const n2 = ent(r.N2);
    const n5 = ent(r.N5);
    a.desoves += ent(r.Desoves);
    a.huevos += ent(r['Total de huevos']);
    a.noViables += ent(r['Hembras no viables']);
    a.n2 += n2;
    a.n5 += n5;
    if (n2 > 0) a.huevosConN2 += ent(r['Total de huevos']);
    if (n5 > 0) a.desovesConN5 += ent(r.Desoves);
  }
  return {
    desoves: a.desoves, huevos: a.huevos, noViables: a.noViables, n2: a.n2, n5: a.n5,
    fertilidad: cociente(a.n2, a.huevosConN2, 100),
    naupliosPorHembra: a.desovesConN5 > 0 ? Math.round(a.n5 / a.desovesConN5) : '',
    ignora: F.sala ? ['sala'] : [],
  };
}

/* ── EL MAPA DE PLANTA ──────────────────────────────────────── */

export const ESTADO_VACIO = 'Vacío';
export const ESTADO_SIN = 'Sin estado';
/** Por qué se colorea el mapa. «Estado» es el de por defecto (decisión del usuario, 2026-09-19). */
export const MODOS_MAPA = [
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'vivos', etiqueta: 'Vivos' },
  { clave: 'densidad', etiqueta: 'Densidad' },
];

function celdaDeTanque(libro, sala, tanque, fueraDeCatalogo, F) {
  const T = libro.tanques.get(ubicKey(sala, tanque));
  const comp = T ? T.composicion.filter(vivo) : [];
  let machos = 0;
  let hembras = 0;
  const porLote = new Map();
  for (const c of comp) {
    machos += c.machos;
    hembras += c.hembras;
    if (!porLote.has(c.lote)) porLote.set(c.lote, { lote: c.lote, estado: estadoEnSala(libro.lotes.get(c.lote), sala), codigos: [], machos: 0, hembras: 0 });
    const x = porLote.get(c.lote);
    x.machos += c.machos;
    x.hembras += c.hembras;
    if (c.codigoGenetico && !x.codigos.includes(c.codigoGenetico)) x.codigos.push(c.codigoGenetico);
  }
  const lotes = [...porLote.values()].sort((a, b) => porNombre(a.lote, b.lote));
  const estados = [...new Set(lotes.map((l) => l.estado).filter(Boolean))];
  const estado = !comp.length ? ESTADO_VACIO : !estados.length ? ESTADO_SIN : estados.length > 1 ? ESTADO_MIXTO : estados[0];
  const densidad = comp.length ? densidadTanque(sala, tanque, machos, hembras) : '';
  const hm = proporcionHM(hembras, machos);
  const enFiltro = (!F.sala || F.sala === sala) && (F.tanque === null || F.tanque === tanque)
    && (!F.lote || comp.some((c) => normLote(c.lote) === F.lote))
    && (!F.codigo || comp.some((c) => normCodigoGenetico(c.codigoGenetico) === F.codigo));
  return {
    sala, tanque, fueraDeCatalogo, machos, hembras, vivos: machos + hembras, hm, hmEstado: evaluar('proporcionHM', hm),
    lotes, estado, densidad, densidadEstado: evaluar('densidad', densidad), enFiltro,
  };
}

/**
 * El mapa de planta al cierre de la foto: cada sala visible con sus tanques FÍSICOS (MAD_TANQUES_POR_SALA), en su
 * orden, y detrás los que el libro tenga ocupados fuera de ese catálogo (`fueraDeCatalogo`): un tanque mal tecleado
 * no esconde animales. El estado de un tanque es el de sus lotes EN ESA SALA; si no coinciden, `Mixto`. Los filtros
 * no quitan tanques: marcan cuáles casan (`enFiltro`), para que el mapa siga siendo la planta entera.
 */
export function mapaDePlanta(libro, F) {
  const salas = SALAS_VISIBLES.map((sala) => {
    const fisicos = (MAD_TANQUES_POR_SALA[sala] || []).slice();
    const extras = [];
    for (const T of libro.tanques.values()) {
      if (T.sala === sala && !fisicos.includes(T.tanque) && T.composicion.some(vivo)) extras.push(T.tanque);
    }
    extras.sort((a, b) => a - b);
    return { sala, tanques: [...fisicos, ...extras].map((t) => celdaDeTanque(libro, sala, t, !fisicos.includes(t), F)) };
  });
  const porEstado = {};
  const porDensidad = { ok: 0, bajo: 0, alto: 0, sinDato: 0 };
  let maxVivos = 0;
  for (const s of salas) {
    for (const t of s.tanques) {
      porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
      if (t.vivos > maxVivos) maxVivos = t.vivos;
      if (t.vivos > 0) porDensidad[t.densidadEstado || 'sinDato']++;
    }
  }
  return { salas, porEstado, porDensidad, maxVivos };
}

/* ── ALERTAS ────────────────────────────────────────────────── */

/** Los avisos que produce el libro mayor (mad-libro.js · `anota`), en palabras. La prueba exige uno por cada tipo
 *  que el libro sabe anotar: un tipo nuevo sin rótulo saldría con su nombre técnico. */
export const TIPOS_AVISO = {
  'ingreso-incompleto': 'Ingreso sin lote, sala o tanque',
  'movimiento-incompleto': 'Movimiento sin origen o destino completos',
  'movimiento-circular': 'Movimiento de un tanque a sí mismo',
  'movimiento-sin-origen': 'Movimiento desde un tanque que ningún ingreso explica',
  'deficit-movimiento': 'Se movieron más animales de los que quedaban vivos',
  'cierre-incompleto': 'Cierre sin lote',
  'cierre-sin-lote': 'Cierre de un lote que el libro no tiene ahí',
  'deficit-cierre': 'Salieron más animales de los que quedaban vivos',
  'diferencia-cierre': 'Diferencia de cierre',
  'mortdes-tipo': 'Tipo de tanque desconocido (mortalidad en desove)',
  'mortdes-sin-lote': 'Mortalidad en desove que ningún ingreso explica',
  'deficit-mortdes': 'Murieron más hembras en desove de las que había vivas',
  'sin-ingreso': 'Bajas en un tanque que ningún ingreso explica',
  deficit: 'Bajas de más en un tanque',
};

/** ¿Es este aviso del libro de lo filtrado? Un aviso dice su sala y tanque (o su origen y destino) o su lote; el
 *  que no dice la dimensión filtrada no se le puede atribuir, y queda fuera. Se exporta para 🩺 Calidad del dato
 *  (F6.2), que lista los avisos con la MISMA regla que las alertas de la portada. */
export function avisoEnFiltro(a, F) {
  if (F.sala) {
    const lugares = [[a.sala, a.tanque], [a.salaOrigen, a.tanqueOrigen], [a.salaDestino, a.tanqueDestino]];
    if (!lugares.some(([s, t]) => txt(s) === F.sala && (F.tanque === null || Number(t) === F.tanque))) return false;
  }
  if (F.lote && normLote(a.lote) !== F.lote) return false;
  return true;
}

/** Las salas a las que se refieren las alertas de ambiente: la del filtro; con lote o código, las que tienen
 *  animales de ese lote o código (el ambiente de una sala que no los tiene no es de lo filtrado); si no, todas. */
function salasEnAlcance(libro, F) {
  if (F.sala) return [F.sala];
  if (!F.lote && !F.codigo) return SALAS_VISIBLES.slice();
  const con = new Set();
  for (const p of libro.posiciones) if (vivo(p) && posicionEnFiltro(p, F)) con.add(p.sala);
  return SALAS_VISIBLES.filter((s) => con.has(s));
}

/**
 * Las alertas de la portada (diseño aprobado): salas cuya hoja difiere del libro, lecturas de temperatura y de
 * oxígeno fuera del umbral vigente en el período (con su origen: bibliografía o laboratorio) y los avisos del libro
 * al cierre de la foto, por tipo y los más recientes. Los avisos no dicen el código genético: con ese filtro, no
 * aplican (`avisos.aplica`).
 */
export function alertas(M, periodo, F) {
  const alcance = salasEnAlcance(M.libro, F);
  const estados = (M.salas || []).filter((s) => alcance.includes(s.sala) && s.coinciden === false)
    .map((s) => ({ sala: s.sala, registrado: s.registrado, propuesto: s.propuesto }));
  const ambiente = (id, columnas) => {
    const umbral = umbralVigente(id);
    const f = fueraDeRango(M.fuentes.sala, columnas, umbral, periodo.desde, periodo.hasta);
    return { umbral, porSala: alcance.filter((s) => f[s] && f[s].fuera > 0).map((s) => ({ sala: s, ...f[s] })) };
  };
  const temperatura = ambiente('temperatura', RESUMEN_TEMPS);
  const oxigeno = ambiente('oxigeno', RESUMEN_OXIGENOS);
  const aplica = !F.codigo;
  const lista = aplica ? (M.libro.avisos || []).filter((a) => avisoEnFiltro(a, F)) : [];
  const porTipo = new Map();
  for (const a of lista) porTipo.set(a.tipo, (porTipo.get(a.tipo) || 0) + 1);
  const avisos = {
    aplica, total: lista.length,
    enPeriodo: lista.filter((a) => enPeriodo(a.fecha, periodo)).length,
    porTipo: [...porTipo.entries()].map(([tipo, n]) => ({ tipo, etiqueta: TIPOS_AVISO[tipo] || tipo, n }))
      .sort((a, b) => b.n - a.n || cmp(a.tipo, b.tipo)),
    recientes: lista.slice().sort((a, b) => cmp(b.fecha, a.fecha)).slice(0, 5)
      .map((a) => ({ fecha: a.fecha, tipo: a.tipo, etiqueta: TIPOS_AVISO[a.tipo] || a.tipo, texto: a.texto })),
  };
  return { estados, temperatura, oxigeno, avisos,
    total: estados.length + temperatura.porSala.length + oxigeno.porSala.length + (avisos.total > 0 ? 1 : 0) };
}

/* ── ÚLTIMOS REGISTROS Y CUARENTENAS ─────────────────────────── */

/** Cómo llama el usuario a cada hoja: el rótulo de su ficha en Registros (el monolito, `FICHA_LABEL`). */
export const ETIQUETA_HOJA = {
  ingresos: '📥 Ingreso', movimientos: '🔄 Movimientos', desoves: '🥚 Desoves', mortDesove: '📋 Inf. Supervisor',
  cierres: '🏁 Fin de Ciclo', tratamientos: '🧪 Tratamientos', alimentacion: '🍤 Alimentación', broodstock: '📈 Broodstock',
  sala: '🏠 Salas', tanques: '🛢️ Tanques',
};
/** Las hojas DIARIAS y cuántos días pueden pasar sin registro antes de marcarse atrasadas: las lecturas de la Sala y
 *  los partes de los Tanques se registran cada día, y el de hoy puede no estar aún. Las demás hojas registran
 *  sucesos (un ingreso, un cierre…): que pasen días sin ellos no es un atraso. */
export const ESPERA_DIAS = { sala: 1, tanques: 1 };

/** La frescura de cada hoja (`frescura` del modelo, contada hasta HOY) con su rótulo y si va atrasada. */
export function ultimosRegistros(frescura) {
  return (frescura || []).map((f) => ({
    ...f, etiqueta: ETIQUETA_HOJA[f.clave] || f.hoja,
    atrasada: ESPERA_DIAS[f.clave] !== undefined && f.ultima !== '' && f.dias > ESPERA_DIAS[f.clave],
  }));
}

/** Días hacia delante en que se avisa de un fin de cuarentena (diseño aprobado: «Fin de cuarentena en 7 días»). */
export const AVISO_CUARENTENA_DIAS = 7;

/** Los lotes que SALEN de cuarentena en los próximos días, por sala (la cuarentena es de cada sala, con su reloj):
 *  `fin` es el primer día en Producción —el ingreso en esa sala más CUARENTENA_DIAS—, la regla de `estadoDeLote`. */
export function finesDeCuarentena(libro, fecha, F, dias = AVISO_CUARENTENA_DIAS) {
  const limite = sumarDias(fecha, dias);
  const pares = new Map();
  for (const p of libro.posiciones) {
    if (!vivo(p) || !posicionEnFiltro(p, F)) continue;
    const k = p.lote + '|' + p.sala;
    if (!pares.has(k)) pares.set(k, { lote: p.lote, sala: p.sala, machos: 0, hembras: 0 });
    pares.get(k).machos += p.machos;
    pares.get(k).hembras += p.hembras;
  }
  const out = [];
  for (const x of pares.values()) {
    const L = libro.lotes.get(x.lote);
    const S = ((L && L.salas) || []).find((s) => s.sala === x.sala);
    if (!S || S.estado !== ESTADO_CUARENTENA) continue;
    const fin = sumarDias(S.ingreso, CUARENTENA_DIAS);
    if (!fin || fin > limite) continue;
    out.push({ ...x, ingreso: S.ingreso, fin, enDias: diasEntre(fecha, fin) });
  }
  return out.sort((a, b) => cmp(a.fin, b.fin) || porNombre(a.lote, b.lote) || porNombre(a.sala, b.sala));
}

/* ── LAS SALAS ──────────────────────────────────────────────── */

/** El registro que trae alguna de estas lecturas: el ÚLTIMO de la sala hasta `hasta`, con el criterio del Saldo
 *  (resumenMaduracion · H2: cada variable sale del último registro que la TRAE). Sus lecturas, en su orden. */
export function lecturasDelUltimoRegistro(filasSala, sala, columnas, hasta) {
  const con = (filasSala || [])
    .filter((r) => txt(r.Sala) === sala && esIso(fecha10(r.Fecha)) && (!hasta || fecha10(r.Fecha) <= hasta) && columnas.some((c) => num(r[c]) !== null))
    .sort((a, b) => cmp(fecha10(a.Fecha), fecha10(b.Fecha)));
  const u = con.length ? con[con.length - 1] : null;
  return u ? { fecha: fecha10(u.Fecha), lecturas: columnas.map((c) => ({ columna: c, valor: num(u[c]) })) } : { fecha: '', lecturas: [] };
}

/** Una serie de lecturas frente a su umbral: 'ok' si todas están dentro, 'bajo' o 'alto' si alguna se sale por ese
 *  lado, 'fuera' si se sale por los dos; '' sin lecturas o sin umbral. */
export function evaluarLecturas(id, valores) {
  const e = (valores || []).map((v) => evaluar(id, v)).filter(Boolean);
  if (!e.length) return '';
  const bajo = e.includes('bajo');
  const alto = e.includes('alto');
  return bajo && alto ? 'fuera' : bajo ? 'bajo' : alto ? 'alto' : 'ok';
}

function variableDeSala(filasSala, sala, columnas, id, R, hasta) {
  const u = lecturasDelUltimoRegistro(filasSala, sala, columnas, hasta);
  const valores = u.lecturas.map((l) => l.valor).filter((v) => v !== null);
  return {
    prom: R ? R.prom : '', delta: R ? R.delta : '', cv: R ? R.cv : '', fecha: R ? R.fecha : u.fecha,
    min: valores.length ? Math.min(...valores) : '', max: valores.length ? Math.max(...valores) : '',
    lecturas: u.lecturas, estado: evaluarLecturas(id, valores),
  };
}

/**
 * Una tarjeta por sala visible (sólo la del filtro, si lo hay): el estado registrado y el propuesto, la ocupación,
 * los vivos del filtro con su H:M, la T° y el O₂ del último registro (promedio del Saldo y extremos de ese mismo
 * registro, con su semáforo), la alcalinidad de día y de noche, el RAS, las toneladas, los días desde la última
 * desinfección, los lotes presentes con sus días de cuarentena o producción en la sala, y sus tratamientos recientes.
 */
export function tarjetasDeSalas(M, F) {
  const salas = SALAS_VISIBLES.filter((s) => !F.sala || s === F.sala);
  const desinf = diasDesdeDesinfeccion(M.fuentes.tratamientos, salas, M.fecha);
  const diasDeLote = new Map((M.resumen.lotes || []).map((L) => [L.lote, L.dias || []]));
  const vacioVF = { valor: '', fecha: '' };
  return salas.map((sala) => {
    const E = (M.salas || []).find((x) => x.sala === sala)
      || { registrado: { estado: '', fecha: '', porLote: '' }, propuesto: { estado: '', porLote: '', ocupados: 0, total: 0, conocida: false }, coinciden: null, desfaseDias: '' };
    const R = (M.resumen.salas || []).find((x) => x.sala === sala) || null;
    const pos = M.libro.posiciones.filter((p) => p.sala === sala && vivo(p) && posicionEnFiltro(p, F));
    const v = sumarVivos(pos, F);
    const hm = proporcionHM(v.hembras, v.machos);
    const porLote = new Map();
    for (const p of pos) {
      if (!porLote.has(p.lote)) porLote.set(p.lote, { lote: p.lote, estado: estadoEnSala(M.libro.lotes.get(p.lote), sala), machos: 0, hembras: 0 });
      porLote.get(p.lote).machos += p.machos;
      porLote.get(p.lote).hembras += p.hembras;
    }
    const alc = R ? R.alcalinidad : { dia: vacioVF, noche: vacioVF };
    return {
      sala, registrado: E.registrado, propuesto: E.propuesto, coinciden: E.coinciden, desfaseDias: E.desfaseDias,
      ocupacion: { ocupados: E.propuesto.ocupados, total: E.propuesto.total, pct: ocupacion(E.propuesto.ocupados, E.propuesto.total) },
      vivos: { ...v, hm, hmEstado: evaluar('proporcionHM', hm) },
      temp: variableDeSala(M.fuentes.sala, sala, RESUMEN_TEMPS, 'temperatura', R && R.temp, M.fecha),
      ox: variableDeSala(M.fuentes.sala, sala, RESUMEN_OXIGENOS, 'oxigeno', R && R.ox, M.fecha),
      alcalinidad: {
        dia: { ...alc.dia, estado: evaluar('alcalinidad', alc.dia.valor) },
        noche: { ...alc.noche, estado: evaluar('alcalinidad', alc.noche.valor) },
      },
      // El RAS ya viene como lo eligió la ficha («100%», no la fracción 1 que guarda la hoja): `rasComoTexto` del resumen.
      ras: R ? { texto: R.ras, fecha: R.fechaRas } : { texto: '', fecha: '' },
      toneladas: R ? { valor: R.toneladas, fecha: R.fechaToneladas } : { valor: '', fecha: '' },
      desinfeccion: desinf[sala],
      lotes: [...porLote.values()].sort((a, b) => porNombre(a.lote, b.lote))
        .map((l) => ({ ...l, dias: (diasDeLote.get(l.lote) || []).find((d) => d.sala === sala) || null })),
      tratamientos: R ? R.tratamientos : [],
    };
  });
}

const horaDe = (columna) => columna.split(' ').pop();

/**
 * El detalle de una sala en el período: el mapa de calor de la temperatura (día × hora, el día más reciente arriba),
 * las cuatro lecturas diarias de oxígeno, y sus tanques con la composición, H:M, densidad, las cargas del Saldo, los
 * últimos pesos y las observaciones del último parte. Si una sala tiene dos registros el mismo día, cada lectura es
 * la última que la trae. El ambiente es de la SALA: el filtro de lote o de tanque no lo cambia, sólo marca tanques.
 * `partes`: los de `diasDeTanque`.
 */
export function detalleDeSala(M, sala, periodo, F, partes) {
  const porDia = new Map();
  for (const r of M.fuentes.sala || []) {
    if (txt(r.Sala) !== sala) continue;
    const f = fecha10(r.Fecha);
    if (!porDia.has(f)) porDia.set(f, []);
    porDia.get(f).push(r);
  }
  const valorDelDia = (f, c) => {
    let v = null;
    for (const r of porDia.get(f) || []) { const n = num(r[c]); if (n !== null) v = n; }
    return v;
  };
  const dias = [];
  for (let d = periodo.hasta; esIso(d) && d >= periodo.desde; d = sumarDias(d, -1)) dias.push(d);
  const filasCalor = dias.map((f) => {
    const valores = RESUMEN_TEMPS.map((c) => valorDelDia(f, c));
    return { fecha: f, valores, estados: valores.map((v) => (v === null ? '' : evaluar('temperatura', v))) };
  });
  const asc = dias.slice().reverse();
  const series = RESUMEN_OXIGENOS.map((c) => ({ columna: c, hora: horaDe(c), valores: asc.map((f) => valorDelDia(f, c)) }));
  const contar = (listas) => listas.reduce((a, l) => a + l.filter((v) => v !== null).length, 0);

  const cargas = new Map();
  for (const L of M.resumen.lotes || []) {
    for (const t of L.tanques || []) {
      if (t.sala !== sala) continue;
      const k = t.sala + '|' + t.tanque;
      if (!cargas.has(k)) cargas.set(k, []);
      cargas.get(k).push({ lote: L.lote, cargaMetrica: t.cargaMetrica, cargaVolumetrica: t.cargaVolumetrica });
    }
  }
  const partesSala = (partes || []).filter((d) => d.sala === sala && esIso(d.fecha) && d.fecha <= M.fecha)
    .sort((a, b) => cmp(a.fecha, b.fecha));
  const ultimoCon = (tanque, campo) => {
    const d = partesSala.filter((x) => x.tanque === tanque && x[campo] !== '').pop();
    return d ? { valor: d[campo], fecha: d.fecha } : { valor: '', fecha: '' };
  };
  const mapa = mapaDePlanta(M.libro, F).salas.find((s) => s.sala === sala) || { tanques: [] };
  const R = (M.resumen.salas || []).find((x) => x.sala === sala) || null;
  return {
    sala,
    calor: { horas: RESUMEN_TEMPS.map(horaDe), filas: filasCalor, umbral: umbralVigente('temperatura'), lecturas: contar(filasCalor.map((x) => x.valores)) },
    oxigeno: { fechas: asc, series, umbral: umbralVigente('oxigeno'), lecturas: contar(series.map((x) => x.valores)) },
    densidad: umbralVigente('densidad'),
    tanques: mapa.tanques.map((c) => {
      const ultimo = partesSala.filter((x) => x.tanque === c.tanque).pop() || null;
      return {
        ...c,
        cargas: cargas.get(sala + '|' + c.tanque) || [],
        peso: { machos: ultimoCon(c.tanque, 'pesoMachos'), hembras: ultimoCon(c.tanque, 'pesoHembras') },
        obs: ultimo ? { fecha: ultimo.fecha, sanitarias: ultimo.obsSanitarias, operativas: ultimo.obsOperativas } : { fecha: '', sanitarias: [], operativas: [] },
      };
    }),
    tratamientos: R ? R.tratamientos : [],
  };
}
