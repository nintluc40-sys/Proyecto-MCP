/* ============================================================
   MADURACIÓN · OPERATIVO — REPRODUCCIÓN (F4.2, 2026-09-21)

   Lo que enseña la sub-vista «🥚 Reproducción», con el diseño que aprobó el usuario el 2026-09-21 (por LOTE,
   con los PENDIENTES DE N5 arriba): lo que falta por contar, la tabla por lote con desoves, huevos, no viables,
   N2, N5, fertilidad y nauplios por hembra, y a dónde fueron los nauplios. Módulo PURO: ni DOM ni red.

   🔑🔑 LAS TRES REGLAS QUE YA ESTABAN CERRADAS Y AQUÍ NO SE RE-INVENTAN:

   1 · PENDIENTE = SIN CIFRA DE N5. No es «sin fecha de N5»: una fecha sola no completa nada —diría que se contó
       algo que no se contó— y un N5 de CERO sí completa, porque cero es una medición. La regla vive en
       `desoveCompleto()` del módulo de esquema y aquí se REUSA tal cual, con `desoveDesdeHoja()` delante: si el
       día de mañana cambia, cambia en un sitio y la ficha y el tablero siguen diciendo lo mismo.

   2 · LA FERTILIDAD SÓLO SOBRE LOS HUEVOS QUE YA TIENEN SU N2, y los nauplios por hembra sólo sobre los desoves
       que ya tienen su N5. Un desove pendiente NO diluye la cifra: si entrara en el denominador, cada desove
       recién anotado haría caer el rendimiento sin que nada hubiera ido peor.

   3 · ⚠⚠ N5 NO SE COMPARA CON N2. Es decisión del usuario y no es una omisión: se cuentan días distintos y de
       poblaciones que no son la misma, así que su cociente parecería una supervivencia y no lo es. Aquí no se
       calcula, y por eso no está.

   🔑 EL FILTRO DE SALA Y TANQUE NO APLICA, y se DICE en vez de callarlo. Un desove es de un (lote, código
   genético): las hembras copuladas se juntan en un pool y ese dato no existe por tanque. Es el mismo criterio de
   `kpiReproduccion`, que devuelve `ignora: ['sala']`.

   ⚠ EL DESPACHO NO SE REPARTE. La columna es una multiselección: un desove puede ir a varios destinos y la hoja
   NO dice cuántos nauplios fue a cada uno. Así que se cuenta el desove en cada destino al que fue y se informa
   de cuántos van a más de uno; inventar un reparto proporcional daría una cifra creíble y falsa.

   ⏳ Sin dato real todavía: `Maduración Lotes` —la hoja de los desoves— tiene CERO filas (medido el 2026-09-21).
   El módulo se desarrolla con fixtures FICTICIOS y en pantalla saldrá vacío hasta que se estrene.
   ============================================================ */
import {
  normLote, normCodigoGenetico, desoveDesdeHoja, desoveCompleto, despachoLista, fechasNauplios,
  MAD_DESOVE_DESPACHO_OPTS,
} from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';
import { fechaDeFila } from './operativo.data.js';
import { cociente } from './operativo.indicadores.js';
import { kpiReproduccion } from './operativo.tablero.js';
import { reproduccionDeLote } from './operativo.lotes.js';

const txt = (v) => String(v == null ? '' : v).trim();
const ent = (v) => { const n = Number(txt(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(txt(s));
const enPeriodo = (f, p) => esIso(f) && (!p || (f >= p.desde && f <= p.hasta));
const porNombre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/* 🔑 Los destinos van en el ORDEN DEL CATÁLOGO, no alfabético: es la convención que ya sigue la celda de la
   ficha («elegidos con «, » en el orden de la lista», 2026-09-14). Ordenarlos de otra manera aquí haría que la
   misma selección se leyera distinta en la ficha y en el tablero. */
const ordenDestino = (d) => {
  const i = MAD_DESOVE_DESPACHO_OPTS.indexOf(d);
  return i < 0 ? MAD_DESOVE_DESPACHO_OPTS.length : i;
};
const porCatalogo = (a, b) => ordenDestino(a) - ordenDestino(b) || porNombre(a, b);

/** Lo que el filtro NO puede aplicar aquí, para que la vista lo rotule. Mismo criterio que `kpiReproduccion`. */
export function ignoraDeReproduccion(F) {
  const x = [];
  if (F && F.sala) x.push('sala');
  if (F && F.tanque !== null && F.tanque !== undefined) x.push('tanque');
  return x;
}

/** ¿Este desove de la hoja está pendiente de su N5? La regla cerrada, sin re-derivarla. */
export function esPendiente(filaHoja) {
  return !desoveCompleto(desoveDesdeHoja(filaHoja || {}));
}

/** ¿La fila pasa el filtro? Un desove sólo conoce su lote y su código genético. */
function enFiltro(r, F) {
  if (!F) return true;
  if (F.lote && normLote(r.Lote) !== F.lote) return false;
  if (F.codigo && normCodigoGenetico(r['Código genético']) !== F.codigo) return false;
  if (F.indice && (F.piscina || F.camaronera)) {
    const o = F.indice.origen.get(normLote(r.Lote));
    if (F.piscina && !(o && o.piscinas.has(F.piscina))) return false;
    if (F.camaronera && !(o && o.camaroneras.has(F.camaronera))) return false;
  }
  return true;
}

/* ── LO ACCIONABLE: LOS PENDIENTES DE N5 ───────────────────── */

/**
 * Los desoves del período que aún no tienen su cifra de N5, el más atrasado primero.
 * `esperados` sale de `fechasNauplios`: el N5 se cuenta al día siguiente del desove. Los días de espera se
 * miden desde ESA fecha, no desde la del desove, para no llamar «atrasado» a lo que todavía no toca.
 */
export function pendientesDeN5(fuentes, periodo, F, hoy) {
  const filas = [];
  for (const r of (fuentes || {}).desoves || []) {
    const fecha = fechaDeFila('desoves', r);
    if (!enPeriodo(fecha, periodo) || !enFiltro(r, F)) continue;
    if (!esPendiente(r)) continue;
    const esperada = fechasNauplios(fecha).n5;
    const dias = esIso(esperada) && esIso(txt(hoy)) && txt(hoy) > esperada ? diasEntre(esperada, txt(hoy)) : 0;
    filas.push({
      fecha, lote: normLote(r.Lote), codigoGenetico: normCodigoGenetico(r['Código genético']),
      desoves: ent(r.Desoves), huevos: ent(r['Total de huevos']), n2: ent(r.N2),
      fechaN5Esperada: esperada, diasEsperando: dias,
    });
  }
  filas.sort((a, b) => b.diasEsperando - a.diasEsperando || porNombre(a.fecha, b.fecha) || porNombre(a.lote, b.lote));
  return {
    filas,
    total: filas.length,
    desoves: filas.reduce((a, f) => a + f.desoves, 0),
    huevos: filas.reduce((a, f) => a + f.huevos, 0),
    ignora: ignoraDeReproduccion(F),
  };
}

/* ── LA TABLA POR LOTE ─────────────────────────────────────── */

/** Los lotes que tienen ALGÚN desove en el período (y pasan el filtro), en orden. */
function lotesConDesove(fuentes, periodo, F) {
  const s = new Set();
  for (const r of (fuentes || {}).desoves || []) {
    if (!enPeriodo(fechaDeFila('desoves', r), periodo) || !enFiltro(r, F)) continue;
    const l = normLote(r.Lote);
    if (l) s.add(l);
  }
  return [...s].sort(porNombre);
}

/**
 * Una fila por lote. Las cifras las da `reproduccionDeLote` —la MISMA que usa la ficha de 🧬 Lotes—, no un
 * acumulador nuevo: si las dos pantallas discreparan, la culpa sería de tener dos.
 * ⚠ `naupliosPorHembra` y el `n5PorDesove` de ese módulo son EL MISMO número (N5 ÷ desoves que ya tienen N5):
 * dos nombres heredados de F1 y F2. Aquí se usa el nombre del plan; no se renombra allí para no tocar F2.
 */
export function tablaDeReproduccion(M, periodo, F) {
  const fuentes = (M || {}).fuentes || {};
  return lotesConDesove(fuentes, periodo, F).map((lote) => {
    const R = reproduccionDeLote(fuentes, lote, periodo);
    const pend = pendientesDeN5(fuentes, periodo, { ...(F || {}), lote }, (M || {}).fecha);
    return {
      lote,
      desoves: R.desoves, huevos: R.huevos, noViables: R.noViables, n2: R.n2, n5: R.n5,
      huevosPorDesove: R.huevosPorDesove,
      fertilidad: R.fertilidad,
      naupliosPorHembra: R.n5PorDesove,
      pendientes: pend.total, desovesPendientes: pend.desoves,
      destinos: destinosDeLote(fuentes, lote, periodo),
    };
  });
}

/** Los destinos a los que fue este lote, sin repetir. */
function destinosDeLote(fuentes, lote, periodo) {
  const clave = normLote(lote);
  const s = new Set();
  for (const r of (fuentes || {}).desoves || []) {
    if (normLote(r.Lote) !== clave || !enPeriodo(fechaDeFila('desoves', r), periodo)) continue;
    for (const d of despachoLista(r.Despacho)) s.add(d);
  }
  return [...s].sort(porCatalogo);
}

/* ── A DÓNDE FUERON ────────────────────────────────────────── */

/**
 * El flujo lote → destino. ⚠ Los nauplios NO se reparten entre los destinos de un desove: la hoja no dice
 * cuántos fue a cada uno. Se cuenta el DESOVE en cada destino al que fue, y `compartidos` dice cuántos van a
 * más de uno — que es lo que impide sumar las columnas y creer que dan el total.
 */
export function destinosDeDespacho(fuentes, periodo, F) {
  const m = new Map();
  let compartidos = 0;
  let sinDestino = 0;
  let conDestino = 0;
  for (const r of (fuentes || {}).desoves || []) {
    if (!enPeriodo(fechaDeFila('desoves', r), periodo) || !enFiltro(r, F)) continue;
    const destinos = despachoLista(r.Despacho);
    if (!destinos.length) { sinDestino++; continue; }
    conDestino++;
    if (destinos.length > 1) compartidos++;
    for (const d of destinos) {
      const o = m.get(d) || { destino: d, desoves: 0, n5: 0, lotes: new Set(), variosDestinos: 0 };
      o.desoves += ent(r.Desoves);
      o.n5 += ent(r.N5);
      o.lotes.add(normLote(r.Lote));
      if (destinos.length > 1) o.variosDestinos++;
      m.set(d, o);
    }
  }
  const filas = [...m.values()]
    .map((o) => ({ ...o, lotes: [...o.lotes].sort(porNombre) }))
    .sort((a, b) => b.n5 - a.n5 || porCatalogo(a.destino, b.destino));
  return { filas, compartidos, sinDestino, conDestino, ignora: ignoraDeReproduccion(F) };
}

/* ── LOS TOTALES DE LA CABECERA ────────────────────────────── */

/** Los totales del período. Es `kpiReproduccion`, el MISMO que pinta el KPI de 📊 Estado: no se recalcula. */
export function totalesDeReproduccion(M, periodo, F) {
  const t = kpiReproduccion(((M || {}).fuentes || {}).desoves, periodo, F);
  const pend = pendientesDeN5((M || {}).fuentes, periodo, F, (M || {}).fecha);
  return {
    ...t,
    pendientes: pend.total,
    // Cuánto de lo desovado está aún sin contar. No es un rendimiento: es cobertura del dato.
    pctPendiente: cociente(pend.desoves, t.desoves, 100),
    ignora: ignoraDeReproduccion(F),
  };
}
