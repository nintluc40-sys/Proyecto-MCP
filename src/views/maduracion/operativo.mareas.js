/* ============================================================
   MADURACIÓN · OPERATIVO — 🦐 cópulas × marea × luna (0r·2, 2026-09-28, usuario)

   La pestaña «🦐 Cópulas» del modal 🌊 Mareas del tablero: ¿se copula más con la marea viva, con una fase de la luna o
   con más amplitud? MÓDULO PURO; la vista, en operativo.view.js.
   · La TASA de un día es la del ⚖️ Saldo (H1 de mad-resumen.js; la de `tasaEnPartesDelLote`): Σ cópulas de los partes
     de Tanques del día ÷ Σ hembras que el libro tenía en esos tanques al CIERRE de ese día × 100. El parte de un tanque
     sin hembras en el libro no cuenta (se dice cuántos). Por grupo —tipo de marea, fase—, Σ cópulas ÷ Σ hembras.
   · Un día en que NINGÚN tanque de la granja registra cópulas es un HUECO del registro, no un día sin cópulas: medido el
     28-09, en la hoja nadie escribe un 0 (643 partes: 360 con cifra y 283 con la casilla vacía) y hay días enteros vacíos
     (13–23/08, 03/09, 17/09, 18/09). Se quita y se cuenta (decisión del usuario: como las noches sin desoves de T9). Es
     de la GRANJA, no del filtro: el 0 de una sala un día en que otras sí registraron es un 0 de verdad.
   · Decisiones del usuario: TODO el registro y filtros PROPIOS: la sala y «sólo en producción» (un tanque cuenta ese
     día si TODOS sus lotes estaban en producción EN esa sala: la cuarentena casi no copula y puede fingir una relación).
   · La correlación (Pearson) de la tasa diaria con la amplitud, la iluminación y el tipo (Viva = 1, Muerta = 0), y
     `rCrit` = 2/√n, la regla de 🧬 Microchips · T9. Son CIFRAS que se recalculan con cada parte: el módulo ya no «lee»
     (1-A, 2026-09-28, usuario: una frase de conclusión daba a entender que todo estaba estimado y quedaba estático).
   · 1-A · filtros de mes, lote y código genético (la pareja cuenta como sus dos: `codigoEnFiltro`), y los DESOVES por
     fase: Σ desoves de la hoja de Desoves ÷ Σ hembras del libro al cierre × 100 («por 100 ♀»), sólo los días en que la
     granja registró alguno (como las noches de T9). Un desove no es de una sala: con sala o «sólo en producción», cuentan
     los lotes que tenían animales en ese alcance, enteros.
   · 0v·1 (2026-09-29, usuario) · `granjaDelDia`: la granja el día pulsado en el 🗓 Calendario lunar, con estas reglas.
   ============================================================ */
import { construirLibro, ubicKey, estadoDeLote, ESTADO_PRODUCCION } from '../registros/lib/mad-libro.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { pearson } from '../../core/util.js';
import { FASES_CICLO } from './data.js';
import { fechaDeFila } from './operativo.data.js';
import { codigoEnFiltro } from './operativo.tablero.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const ent = (v) => { const n = Number(txt(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const unicos = (xs) => [...new Set(xs.filter(Boolean))].sort(porNombre);
/** Días en un ciclo lunar (sinódico). */
export const CICLO_LUNAR_DIAS = 29.53;

/** Al cierre de un día, cada posición con animales: su sala, tanque, lote, código, hembras y el RELOJ de su lote en esa
 *  sala (su ingreso ahí, su cópula ahí y el cierre del lote: los de `estadoDeLote`), y un índice por tanque. Se COPIA: el
 *  gancho entrega el libro vivo. */
function fotoDePosiciones(posiciones, lotes) {
  const lista = [];
  const porTanque = new Map();
  for (const p of posiciones.values()) {
    if (!(ent(p.machos) > 0 || ent(p.hembras) > 0)) continue;
    const L = lotes.get(p.lote);
    const S = L && L.salas && L.salas.get(p.sala);
    const x = { sala: txt(p.sala), tanque: p.tanque, lote: normLote(p.lote), codigo: txt(p.codigoGenetico), hembras: ent(p.hembras),
      reloj: S ? { ingreso: S.ingreso, copulaDesde: S.copulaDesde, cerrado: L.cerrado || null } : { ...(L || {}) } };
    lista.push(x);
    const uk = ubicKey(p.sala, p.tanque);
    porTanque.set(uk, [...(porTanque.get(uk) || []), x]);
  }
  return { lista, porTanque };
}
const FOTO_VACIA = { lista: [], porTanque: new Map() };
/** Los cierres del libro hasta `hasta`, en orden: UNA pasada (gancho `alCerrarDia`), como `serieDiaria`: reconstruirlo por
 *  día costaría un libro por día. Devuelve el lector: para fechas en orden CRECIENTE, el último cierre ≤ esa fecha (un día
 *  sin sucesos repite el cierre anterior). */
function lectorDeCierres(fuentes, hasta) {
  const cierres = [];
  construirLibro(fuentes || {}, { hoy: hasta, hasta, alCerrarDia: (fecha, { posiciones, lotes }) => {
    if (esIso(fecha)) cierres.push([fecha, fotoDePosiciones(posiciones, lotes)]);
  } });
  let i = 0;
  let foto = FOTO_VACIA;
  return (fecha) => {
    while (i < cierres.length && cierres[i][0] <= fecha) foto = cierres[i++][1];
    return foto;
  };
}
/** ¿Estaba el lote de esta posición en producción EN su sala ese día? (el estado va con la fecha, no con el último suceso) */
const enProduccion = (x, fecha) => estadoDeLote(x.reloj, fecha) === ESTADO_PRODUCCION;

/**
 * Cada parte de Tanques (`diasDeTanque`) con lo que dice el libro de su tanque al cierre de ESE día: las hembras y si
 * todos sus lotes estaban en producción en esa sala. UNA pasada del libro (gancho `alCerrarDia`), como `serieDiaria`:
 * reconstruirlo por día costaría un libro por día. Un día sin sucesos repite el cierre anterior; el estado se calcula
 * con la fecha del parte (la cuarentena se cumple con el tiempo aunque no pase nada).
 */
export function partesConHembras(fuentes, partes) {
  const ps = (partes || []).filter((p) => esIso(txt(p.fecha)));
  if (!ps.length) return [];
  const hasta = ps.reduce((m, p) => (p.fecha > m ? p.fecha : m), ps[0].fecha);
  const fotoEn = lectorDeCierres(fuentes, hasta);
  return [...ps].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).map((p) => {
    const T = fotoEn(p.fecha).porTanque.get(ubicKey(p.sala, p.tanque)) || [];
    return {
      fecha: p.fecha, sala: txt(p.sala), tanque: p.tanque, copulas: ent(p.copulas), hembras: T.reduce((s, x) => s + x.hembras, 0),
      produccion: T.length > 0 && T.every((x) => enProduccion(x, p.fecha)),
      lotes: unicos(T.map((x) => x.lote)), codigos: unicos(T.map((x) => x.codigo)),   // 1-A · para los filtros de lote y código
    };
  });
}

/** Σ `campo` ÷ Σ hembras × 100 de unos días; null sin hembras. */
const grupo = (dias, campo) => {
  const cantidad = dias.reduce((s, d) => s + d[campo], 0);
  const hembras = dias.reduce((s, d) => s + d.hembras, 0);
  return { dias: dias.length, [campo]: cantidad, hembras, tasa: hembras > 0 ? (cantidad / hembras) * 100 : null };
};
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);

/** Lo común de cópulas y desoves: la tasa de cada día, su marea, la correlación con cada variable y los grupos por tipo de
 *  marea y por fase lunar (Σ ÷ Σ). `campo`: 'copulas' | 'desoves'. */
function relacionConMarea(porDia, marea, campo) {
  const dias = [...porDia.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((o) => ({ ...o, tasa: (o[campo] / o.hembras) * 100, marea: (marea && marea.get(o.fecha)) || null }));
  const con = dias.filter((d) => d.marea);
  const n = con.length;
  const r = (valor) => pearson(con.map((d) => [d.tasa, valor(d.marea)]).filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v)));
  const corr = {
    amplitud: r((m) => m.amplitud),
    ilum: r((m) => m.ilum),
    tipo: r((m) => (m.tipo === 'Viva' ? 1 : m.tipo === 'Muerta' ? 0 : null)),
  };
  const rCrit = n ? 2 / Math.sqrt(n) : null;
  const desde = n ? con[0].fecha : '';
  const hasta = n ? con[n - 1].fecha : '';
  return {
    dias, conMarea: n, sinMarea: dias.length - n, desde, hasta,
    ciclos: n ? (diasEntre(desde, hasta) + 1) / CICLO_LUNAR_DIAS : 0,
    tipo: ['Viva', 'Muerta'].map((k) => ({ k, ...grupo(con.filter((d) => d.marea.tipo === k), campo) })),
    fase: FASES_CICLO.map((k) => ({ k, ...grupo(con.filter((d) => d.marea.fase === k), campo) })),
    r: corr, rCrit,
  };
}

/**
 * La relación de las cópulas con la marea y la luna, con los filtros de la pestaña.
 * @param {Array} base   `partesConHembras`
 * @param {Map} marea    'AAAA-MM-DD' → { fase, ilum, tipo, amplitud } (`mareaPorDia` de la hoja «Marea»)
 * @param {{sala?: string, soloProduccion?: boolean, mes?: string, lote?: string, codigo?: string}} [f]  `mes` 'AAAA-MM'
 * @returns {{ salas, meses, lotes, codigos, dias, conMarea, sinMarea, sinRegistro, sinHembras, fueraDeProduccion, desde,
 *   hasta, ciclos, tipo, fase, r: {amplitud, ilum, tipo}, rCrit }}  las opciones (salas, meses, lotes, códigos) no
 *   dependen del filtro.
 */
export function copulasYMarea(base, marea, { sala = '', soloProduccion = false, mes = '', lote = '', codigo = '' } = {}) {
  const salas = [...new Set((base || []).map((b) => b.sala).filter(Boolean))].sort(porNombre);
  let sinHembras = 0;
  let fueraDeProduccion = 0;
  const conRegistro = new Set((base || []).filter((b) => b.copulas > 0).map((b) => b.fecha));
  const huecos = new Set((base || []).map((b) => b.fecha).filter((f) => !conRegistro.has(f)));
  const deRegistro = (base || []).filter((b) => conRegistro.has(b.fecha));
  const porDia = new Map();
  for (const b of base || []) {
    if (!conRegistro.has(b.fecha)) continue;   // hueco del registro: nadie en la granja registró cópulas ese día
    if (mes && b.fecha.slice(0, 7) !== mes) continue;
    if (sala && b.sala !== sala) continue;
    if (lote && !(b.lotes || []).includes(lote)) continue;
    if (codigo && !(b.codigos || []).some((c) => codigoEnFiltro(c, { codigo }))) continue;
    if (!(b.hembras > 0)) { sinHembras++; continue; }
    if (soloProduccion && !b.produccion) { fueraDeProduccion++; continue; }
    const o = porDia.get(b.fecha) || { fecha: b.fecha, copulas: 0, hembras: 0, partes: 0 };
    o.copulas += b.copulas;
    o.hembras += b.hembras;
    o.partes++;
    porDia.set(b.fecha, o);
  }
  return {
    salas, meses: unicos(deRegistro.map((b) => b.fecha.slice(0, 7))), lotes: unicos(deRegistro.flatMap((b) => b.lotes || [])),
    codigos: unicos(deRegistro.flatMap((b) => b.codigos || [])),
    sinRegistro: huecos.size, sinHembras, fueraDeProduccion, ...relacionConMarea(porDia, marea, 'copulas'),
  };
}

/**
 * 1-A · Los días en que la GRANJA registró algún desove (hoja de Desoves), con sus filas y lo que el libro tenía al cierre
 * de ese día: cada posición con su sala, lote, código, hembras y si su lote producía en esa sala.
 */
export function desovesDiarios(fuentes) {
  const porFecha = new Map();
  for (const r of ((fuentes || {}).desoves || [])) {
    const fecha = fechaDeFila('desoves', r).slice(0, 10);
    const lote = normLote(r.Lote);
    const desoves = ent(r.Desoves);
    if (!esIso(fecha) || !lote || !(desoves > 0)) continue;
    porFecha.set(fecha, [...(porFecha.get(fecha) || []), { lote, codigo: txt(r['Código genético']), desoves }]);
  }
  const fechas = [...porFecha.keys()].sort();
  if (!fechas.length) return [];
  const fotoEn = lectorDeCierres(fuentes, fechas[fechas.length - 1]);
  return fechas.map((fecha) => ({
    fecha, filas: porFecha.get(fecha),
    posiciones: fotoEn(fecha).lista.map((x) => ({ sala: x.sala, lote: x.lote, codigo: x.codigo, hembras: x.hembras, produccion: enProduccion(x, fecha) })),
  }));
}

/**
 * 1-A · La relación de los DESOVES con la marea y la luna, con los mismos filtros: por día, Σ desoves del alcance ÷ Σ
 * hembras del alcance × 100. Un desove no es de una sala: con sala o «sólo en producción», cuentan los lotes que tenían
 * animales en ese alcance, enteros. Un día sin hembras en el alcance no cuenta (`sinHembras`).
 * @param {Array} diarios  `desovesDiarios`
 */
export function desovesYMarea(diarios, marea, { sala = '', soloProduccion = false, mes = '', lote = '', codigo = '' } = {}) {
  let sinHembras = 0;
  const porDia = new Map();
  for (const d of diarios || []) {
    if (mes && d.fecha.slice(0, 7) !== mes) continue;
    const pos = d.posiciones.filter((p) => (!sala || p.sala === sala) && (!lote || p.lote === lote)
      && codigoEnFiltro(p.codigo, { codigo }) && (!soloProduccion || p.produccion));
    const hembras = pos.reduce((s, p) => s + p.hembras, 0);
    if (!(hembras > 0)) { sinHembras++; continue; }
    const enAlcance = new Set(pos.map((p) => p.lote));
    const filas = d.filas.filter((f) => (!lote || f.lote === lote) && codigoEnFiltro(f.codigo, { codigo })
      && (!(sala || soloProduccion) || enAlcance.has(f.lote)));
    porDia.set(d.fecha, { fecha: d.fecha, desoves: filas.reduce((s, f) => s + f.desoves, 0), hembras });
  }
  const todas = diarios || [];
  return {
    salas: unicos(todas.flatMap((d) => d.posiciones.map((p) => p.sala))),
    meses: unicos(todas.map((d) => d.fecha.slice(0, 7))), lotes: unicos(todas.flatMap((d) => d.filas.map((f) => f.lote))),
    codigos: unicos(todas.flatMap((d) => d.filas.map((f) => f.codigo))),
    sinHembras, ...relacionConMarea(porDia, marea, 'desoves'),
  };
}

/**
 * 0v·1 (2026-09-29, usuario) · La GRANJA un día, para el panel del 🗓 Calendario lunar de 🌊 Mareas: las MISMAS reglas que
 * esta pestaña sin sus filtros. Cópulas: Σ de los partes del día ÷ Σ hembras del libro al cierre (el parte de un tanque sin
 * hembras no cuenta y se cuenta); un día con partes y ninguna cópula es un HUECO del registro, no un 0. Desoves: Σ de la
 * hoja de Desoves ÷ Σ hembras del libro al cierre × 100.
 * @param {Array} base     `partesConHembras`
 * @param {Array} diarios  `desovesDiarios`
 * @param {string} fecha   'AAAA-MM-DD'
 * @returns {{ copulas: {estado: 'sin-partes'|'hueco'|'sin-hembras'|'ok', partes, sinHembras, copulas, hembras, tasa},
 *   desoves: {estado: 'ninguno'|'sin-hembras'|'ok', desoves, hembras, tasa} }}  `tasa` null si no la hay; `copulas`, las
 *   que cuentan (con 'sin-hembras', las registradas, que no cuentan)
 */
export function granjaDelDia(base, diarios, fecha) {
  const ps = (base || []).filter((b) => b.fecha === fecha);
  const con = ps.filter((b) => b.hembras > 0);
  const registradas = ps.reduce((s, b) => s + b.copulas, 0);   // también las de un tanque sin hembras: el día NO es un hueco
  const cuentan = con.reduce((s, b) => s + b.copulas, 0);
  const hembrasC = con.reduce((s, b) => s + b.hembras, 0);
  const estadoC = !ps.length ? 'sin-partes' : !(registradas > 0) ? 'hueco' : !(hembrasC > 0) ? 'sin-hembras' : 'ok';
  const copulas = { estado: estadoC, partes: ps.length, sinHembras: ps.length - con.length,
    copulas: estadoC === 'ok' ? cuentan : registradas, hembras: hembrasC, tasa: estadoC === 'ok' ? (cuentan / hembrasC) * 100 : null };
  const d = (diarios || []).find((x) => x.fecha === fecha);
  const desoves = d ? d.filas.reduce((s, f) => s + f.desoves, 0) : 0;
  const hembras = d ? d.posiciones.reduce((s, p) => s + p.hembras, 0) : 0;
  const estado = !(desoves > 0) ? 'ninguno' : !(hembras > 0) ? 'sin-hembras' : 'ok';
  return { copulas, desoves: { estado, desoves, hembras, tasa: estado === 'ok' ? (desoves / hembras) * 100 : null } };
}
