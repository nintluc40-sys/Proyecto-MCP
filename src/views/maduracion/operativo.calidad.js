/* ============================================================
   MADURACIÓN · OPERATIVO — 🩺 CALIDAD DEL DATO (F6.2, 2026-09-21)

   Lo que enseña la sub-vista «🩺 Calidad del dato», con el contenido aprobado en el plan del 2026-09-19 y el diseño
   del 2026-09-21: si lo que dice el tablero descansa sobre registros completos. Módulo PURO: ni DOM ni red.
     · el ESTADO de cada hoja: cuántas filas, su último registro, las que llevan fecha posterior a hoy y —lo que
       ninguna otra pieza ve— las que no llevan una fecha legible, que el tablero entero ignora sin decirlo;
     · el CALENDARIO hoja × día del período: cuántas filas cada día, y `null` el que no tiene ninguna;
     · los PARTES ESPERADOS frente a los registrados (decisión del usuario del 2026-09-21, «uno por tanque ocupado»):
       cada tanque que el libro tiene OCUPADO al cierre de un día debe tener al menos un parte de Tanques ese día, y
       cada sala con animales, su registro de Sala. Por día y por sala;
     · el estado REGISTRADO de cada sala frente al PROPUESTO por el libro (el de «🔄 Proponer estado»);
     · los avisos del libro, con los 14 tipos que sabe anotar aunque vayan a cero: «ninguno» también es un dato.

   🔑 EL DÍA DE HOY NO SE JUZGA: los partes y las lecturas de hoy pueden no estar aún (`ESPERA_DIAS`, la misma
   espera con que «Últimos registros» marca una hoja atrasada). Se enseña «en curso» y no cuenta como falta.

   🔑 LO QUE NO SE PUEDE FILTRAR SE DICE (`ignora`). El estado de las hojas y el calendario son de la PLANTA
   entera: una fila de Desoves no es de una sala y un Broodstock no es de un lote, así que filtrarlos por partes
   enseñaría un calendario con huecos que no son huecos.

   ⚠ Del plan se RETIRA «hojas que el GAS devolvió recortadas» (dicho al usuario el 2026-09-21): el tablero lee el
   export completo del libro, que no se recorta; el recorte es de `?p=rows`, y ése ya lo avisa el ⚖️ Saldo.
   ============================================================ */
import { MAD_OP_HOJAS } from './operativo.fuentes.js';
import { fechaDeFila } from './operativo.data.js';
import { cociente } from './operativo.indicadores.js';
import { ETIQUETA_HOJA, ESPERA_DIAS, TIPOS_AVISO, avisoEnFiltro, ultimosRegistros } from './operativo.tablero.js';
import { sumarDias, ubicKey } from '../registros/lib/mad-libro.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const vivo = (x) => (x && (x.machos > 0 || x.hembras > 0)) || false;
const enPeriodo = (f, p) => esIso(f) && f >= p.desde && f <= p.hasta;
const diasDe = (p) => {
  const out = [];
  for (let d = (p || {}).desde; d && d <= p.hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
};
/** ¿Está aún «en curso» ese día para una hoja diaria? Hoy lo está: su registro puede no haber llegado. */
const enCurso = (d, hoy, clave) => !!hoy && esIso(d) && diasEntre(d, hoy) < (ESPERA_DIAS[clave] || 0);

const ROTULO_DIM = { sala: 'sala', tanque: 'tanque', lote: 'lote', codigo: 'código genético', estado: 'estado',
  sexo: 'sexo', piscina: 'piscina', camaronera: 'camaronera' };
/** Los filtros ACTIVOS que una pieza no puede aplicar (`aplica` son los que sí), con el rótulo de la vista. */
export function ignoraDeCalidad(F, aplica) {
  const activa = (d) => (d === 'tanque' ? !!F && F.tanque !== null && F.tanque !== undefined : !!(F && F[d]));
  return Object.keys(ROTULO_DIM).filter((d) => activa(d) && !(aplica || []).includes(d)).map((d) => ROTULO_DIM[d]);
}

/* ── EL ESTADO DE CADA HOJA ─────────────────────────────────── */

/**
 * Cada hoja del operativo con su último registro (`ultimosRegistros`, contado hasta HOY) y las filas que no llevan
 * una fecha legible: ninguna pieza del tablero las cuenta, porque todas se ordenan y se acotan por fecha. Y aparte,
 * las filas de Maduración que no casan con ninguna hoja y los registros de Sala de las salas que no se muestran (4A y 4B).
 */
export function estadoDeHojas(M) {
  const fuentes = (M && M.fuentes) || {};
  const ultimos = new Map(ultimosRegistros((M && M.frescura) || []).map((u) => [u.clave, u]));
  const hojas = MAD_OP_HOJAS.map(({ clave, hoja }) => {
    const u = ultimos.get(clave) || { filas: 0, ultima: '', dias: '', futuras: 0, atrasada: false };
    const sinFecha = (fuentes[clave] || []).filter((r) => !esIso(fechaDeFila(clave, r))).length;
    return {
      clave, hoja, etiqueta: ETIQUETA_HOJA[clave] || hoja, diaria: ESPERA_DIAS[clave] !== undefined,
      filas: u.filas, ultima: u.ultima, dias: u.dias, futuras: u.futuras, atrasada: u.atrasada, sinFecha,
    };
  });
  return { hojas, sinHoja: (M && M.sinHoja) || 0, salasExcluidas: (M && M.salasExcluidas) || 0 };
}

/* ── EL CALENDARIO HOJA × DÍA ───────────────────────────────── */

/**
 * Cuántas filas tiene cada hoja cada día del período; `null` el día que no tiene ninguna (un cero diría «se
 * registró y no había nada», y no es lo mismo). En las hojas DIARIAS —Sala y Tanques— se cuentan además los
 * `huecos`: días sin ninguna fila desde que la hoja empezó a registrarse, sin contar el día en curso.
 */
export function calendarioDeRegistros(M, periodo, F) {
  const dias = diasDe(periodo);
  const idx = new Map(dias.map((d, i) => [d, i]));
  const hoy = txt(M && M.hoy);
  const fuentes = (M && M.fuentes) || {};
  const hojas = MAD_OP_HOJAS.map(({ clave, hoja }) => {
    const celdas = dias.map(() => null);
    let primera = '';
    let total = 0;
    for (const r of fuentes[clave] || []) {
      const f = fechaDeFila(clave, r);
      if (!esIso(f)) continue;
      if (!primera || f < primera) primera = f;
      const i = idx.get(f);
      if (i === undefined) continue;
      celdas[i] = (celdas[i] || 0) + 1;
      total++;
    }
    const diaria = ESPERA_DIAS[clave] !== undefined;
    /* Los días del hueco, y no sólo cuántos: la vista los marca en el calendario sin repetir aquí la regla. */
    const diasHueco = diaria && primera
      ? dias.filter((d, i) => celdas[i] === null && d >= primera && !enCurso(d, hoy, clave)) : [];
    return { clave, hoja, etiqueta: ETIQUETA_HOJA[clave] || hoja, diaria, celdas, total,
      diasConRegistro: celdas.filter((c) => c !== null).length, huecos: diaria && primera ? diasHueco.length : '', diasHueco };
  });
  return { dias, enCurso: dias.filter((d) => enCurso(d, hoy, 'tanques')), hojas, ignora: ignoraDeCalidad(F, []) };
}

/* ── LOS PARTES ESPERADOS FRENTE A LOS REGISTRADOS ──────────── */

/**
 * La cobertura de los partes, día a día y sala a sala. `serie` es la serie diaria del libro (`serieDiaria`) y
 * `partes`, los de Tanques juntados por (fecha, sala, tanque) (`diasDeTanque`): los dos que ya calcula la vista.
 *  · Se ESPERA un parte de Tanques por cada tanque OCUPADO al cierre de cada día (`porTanque` de la serie), y un
 *    registro de Sala por cada sala con animales (`porSala`). Un tanque vacío no espera nada.
 *  · Cada celda sala × día dice cuántos tanques esperaban parte, cuántos lo tienen y cuáles faltan, y si la sala
 *    tiene su registro; `null` si ese día la sala no tenía animales. El día en curso se enseña y no se cuenta.
 * El filtro de sala y el de tanque se aplican; con el de tanque, el registro de Sala es el de su sala.
 */
export function coberturaDePartes(M, serie, partes, periodo, F) {
  const dias = diasDe(periodo);
  const idx = new Map(dias.map((d, i) => [d, i]));
  const hoy = txt(M && M.hoy);
  const conParte = new Map();
  for (const p of partes || []) {
    const f = txt(p.fecha);
    if (!idx.has(f)) continue;
    if (!conParte.has(f)) conParte.set(f, new Set());
    conParte.get(f).add(ubicKey(p.sala, p.tanque));
  }
  const conRegistro = new Map();
  for (const r of ((M && M.fuentes) || {}).sala || []) {
    const f = fechaDeFila('sala', r);
    if (!idx.has(f)) continue;
    if (!conRegistro.has(f)) conRegistro.set(f, new Set());
    conRegistro.get(f).add(txt(r.Sala));
  }
  const salas = new Map();
  const salaDe = (s) => salas.get(s) || (salas.set(s, { sala: s, celdas: dias.map(() => null),
    tanques: { esperados: 0, registrados: 0 }, registro: { esperados: 0, registrados: 0 } }), salas.get(s));
  const celdaDe = (S, i, d) => S.celdas[i] || (S.celdas[i] = { esperados: 0, registrados: 0, faltan: [], registroSala: null,
    enCurso: enCurso(d, hoy, 'tanques') });
  const faltan = [];
  const faltanRegistro = [];
  const fotoDe = new Map((serie || []).map((x) => [x.fecha, x]));
  dias.forEach((d, i) => {
    const foto = fotoDe.get(d);
    if (!foto) return;
    for (const T of Object.values(foto.porTanque || {})) {
      if (!vivo(T)) continue;
      if (F && F.sala && T.sala !== F.sala) continue;
      if (F && F.tanque !== null && F.tanque !== undefined && Number(T.tanque) !== F.tanque) continue;
      const S = salaDe(T.sala);
      const c = celdaDe(S, i, d);
      const tiene = (conParte.get(d) || new Set()).has(ubicKey(T.sala, T.tanque));
      c.esperados++;
      if (tiene) c.registrados++;
      else c.faltan.push(T.tanque);
      if (c.enCurso) continue;
      S.tanques.esperados++;
      if (tiene) S.tanques.registrados++;
      else faltan.push({ fecha: d, sala: T.sala, tanque: T.tanque });
    }
    for (const [sala, v] of Object.entries(foto.porSala || {})) {
      if (!vivo(v)) continue;
      if (F && F.sala && sala !== F.sala) continue;
      const S = salaDe(sala);
      const c = celdaDe(S, i, d);
      const tiene = (conRegistro.get(d) || new Set()).has(sala);
      c.registroSala = tiene;
      if (enCurso(d, hoy, 'sala')) continue;
      S.registro.esperados++;
      if (tiene) S.registro.registrados++;
      else faltanRegistro.push({ fecha: d, sala });
    }
  });
  const conPct = (o) => ({ ...o, pct: cociente(o.registrados, o.esperados, 100) });
  const lista = [...salas.values()].sort((a, b) => porNombre(a.sala, b.sala))
    .map((S) => ({ ...S, celdas: S.celdas.map((c) => (c ? { ...c, faltan: c.faltan.sort((a, b) => a - b) } : null)),
      tanques: conPct(S.tanques), registro: conPct(S.registro) }));
  const suma = (k) => lista.reduce((a, S) => ({ esperados: a.esperados + S[k].esperados, registrados: a.registrados + S[k].registrados }),
    { esperados: 0, registrados: 0 });
  const recientes = (a, b) => cmp(b.fecha, a.fecha) || porNombre(a.sala, b.sala) || (Number(a.tanque) || 0) - (Number(b.tanque) || 0);
  return {
    dias, enCurso: dias.filter((d) => enCurso(d, hoy, 'tanques')),
    salas: lista, total: { tanques: conPct(suma('tanques')), registro: conPct(suma('registro')) },
    faltan: faltan.sort(recientes), faltanRegistro: faltanRegistro.sort(recientes),
    ignora: ignoraDeCalidad(F, ['sala', 'tanque']),
  };
}

/* ── EL ESTADO REGISTRADO FRENTE AL PROPUESTO ───────────────── */

/** Cómo está cada sala: sus dos estados coinciden, difieren, o falta alguno y no se pueden comparar. */
export const SITUACIONES_ESTADO = {
  coinciden: 'Coinciden', difieren: 'Difieren', 'sin-registro': 'Sin estado registrado',
  'sin-propuesta': 'El libro no la conoce', 'sin-datos': 'Sin datos',
};

/**
 * Cada sala con su estado REGISTRADO (el último tecleado en la hoja hasta la foto) y el PROPUESTO por el libro al
 * cierre de la foto (`M.salas`, el mismo de 🏠 Salas), su situación y cuántos días tiene el registrado: un estado
 * tecleado hace semanas que coincide por casualidad no es un estado al día, y se ve en `desfaseDias`.
 */
export function comparacionDeEstados(M, F) {
  const filas = ((M && M.salas) || []).filter((s) => !(F && F.sala) || s.sala === F.sala).map((s) => {
    const r = txt(s.registrado && s.registrado.estado);
    const p = txt(s.propuesto && s.propuesto.estado);
    const situacion = s.coinciden === true ? 'coinciden' : s.coinciden === false ? 'difieren'
      : !r && !p ? 'sin-datos' : !r ? 'sin-registro' : 'sin-propuesta';
    return { sala: s.sala, registrado: s.registrado, propuesto: s.propuesto, situacion, etiqueta: SITUACIONES_ESTADO[situacion],
      desfaseDias: s.desfaseDias };
  });
  const n = (x) => filas.filter((f) => f.situacion === x).length;
  return { filas, coinciden: n('coinciden'), difieren: n('difieren'), sinComparar: filas.length - n('coinciden') - n('difieren'),
    ignora: ignoraDeCalidad(F, ['sala']) };
}

/* ── LOS AVISOS DEL LIBRO ───────────────────────────────────── */

/** Dónde ocurrió un aviso: su tanque, o su origen y su destino si es de un movimiento. Lo que el registro no trae
 *  se enseña «?»: el libro guarda un tanque que falta como 0, y «tanque 0» diría un tanque que no existe. */
function lugarDeAviso(a) {
  const t = (s, n) => (txt(s) || '?') + ' · ' + (Number(n) > 0 ? String(Number(n)) : '?');
  if ('salaOrigen' in a || 'salaDestino' in a) return t(a.salaOrigen, a.tanqueOrigen) + ' → ' + t(a.salaDestino, a.tanqueDestino);
  return txt(a.sala) ? t(a.sala, a.tanque) : '';
}

/**
 * Los avisos del libro al cierre de la foto, con la regla de filtro de las alertas de la portada (`avisoEnFiltro`):
 * los 14 tipos que el libro sabe anotar, cada uno con cuántos hay en total y en el período —también los que van a
 * cero—, y el detalle de los del período, el más reciente primero. Un tipo que el libro anote y aquí no tenga
 * rótulo sale con su nombre técnico, marcado (`conocido: false`), en vez de perderse.
 * Los avisos no dicen el código genético: con ese filtro no aplican (`aplica: false`), como en la portada.
 */
export function avisosDelLibro(M, periodo, F) {
  const aplica = !(F && F.codigo);
  const lista = aplica ? (((M && M.libro) || {}).avisos || []).filter((a) => avisoEnFiltro(a, F)) : [];
  const tipos = new Map(Object.entries(TIPOS_AVISO).map(([tipo, etiqueta]) => [tipo, { tipo, etiqueta, conocido: true, total: 0, enPeriodo: 0 }]));
  for (const a of lista) {
    if (!tipos.has(a.tipo)) tipos.set(a.tipo, { tipo: a.tipo, etiqueta: a.tipo, conocido: false, total: 0, enPeriodo: 0 });
    const T = tipos.get(a.tipo);
    T.total++;
    if (enPeriodo(a.fecha, periodo)) T.enPeriodo++;
  }
  const detalle = lista.filter((a) => enPeriodo(a.fecha, periodo))
    .sort((a, b) => cmp(b.fecha, a.fecha) || cmp(a.tipo, b.tipo))
    .map((a) => ({ fecha: a.fecha, tipo: a.tipo, etiqueta: TIPOS_AVISO[a.tipo] || a.tipo, texto: txt(a.texto), lote: txt(a.lote),
      lugar: lugarDeAviso(a), sexo: txt(a.sexo), cantidad: a.cantidad === undefined ? '' : a.cantidad }));
  return {
    aplica, total: lista.length, enPeriodo: detalle.length,
    tipos: [...tipos.values()].sort((a, b) => b.enPeriodo - a.enPeriodo || b.total - a.total || cmp(a.tipo, b.tipo)),
    /* Con el código genético activo, `ignora` lo nombra y `aplica` dice que por eso la lista va vacía. */
    detalle, ignora: ignoraDeCalidad(F, ['sala', 'tanque', 'lote']),
  };
}
