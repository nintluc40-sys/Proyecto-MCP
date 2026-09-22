/* ============================================================
   MADURACIÓN · OPERATIVO — el MODELO del tablero (Fase 0.2, 2026-09-19)

   Sobre las fuentes de `operativo.fuentes.js` arma lo que necesitan las vistas del tablero SIN fórmulas propias
   para lo que ya calcula el ⚖️ Saldo: el resumen es `resumenMaduracion`, y el estado PROPUESTO de una sala es
   `estadoDeSala` con el libro al cierre del día, exactamente como «🔄 Proponer estado» de la ficha de Salas.
   Módulo PURO: ni DOM ni red.

   Decisiones del usuario (2026-09-19) que viven aquí:
   · El estado de sala se enseña DOBLE: el registrado en la hoja y el que propone el libro, y se marca si difieren.
   · El período por defecto son 30 días.
   · Las Salas 4A y 4B ya no se muestran: sólo las salas de la ficha (Sala 1 a Sala 5).
   ============================================================ */
import { fuentesDesdeFilas, MAD_OP_HOJAS } from './operativo.fuentes.js';
import { construirLibro, estadoDeSala, estadoPorLoteTexto, ocupacionDeSala, sumarDias, ubicKey, ESTADO_CUARENTENA, ESTADO_PRODUCCION, ESTADO_CERRADO } from '../registros/lib/mad-libro.js';
import { resumenMaduracion, diasEntre } from '../registros/lib/mad-resumen.js';
import { MAD_SALA_OPTS, MAD_TANQUES_POR_SALA } from '../registros/lib/ficha-maduracion-ingreso.schema.js';

/** Días del período por defecto, contando el de hoy (decisión del usuario, 2026-09-19). */
export const PERIODO_DIAS = 30;
/** Las salas que se enseñan: las de la ficha. 4A y 4B, disueltas, ya no (decisión del usuario, 2026-09-19). */
export const SALAS_VISIBLES = MAD_SALA_OPTS.slice();

/* Los estados que puede tener un lote EN UNA SALA, que son los que devuelve `estadoDeLote` y contra los que
   compara el filtro. «Mixto» NO entra: es del lote entero cuando sus salas difieren, nunca de una posición. */
export const ESTADOS_LOTE = [ESTADO_CUARENTENA, ESTADO_PRODUCCION, ESTADO_CERRADO];

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const porNombre = (a, b) => a.localeCompare(b, 'es', { numeric: true });

/** La columna que fecha cada hoja: la de corte en Broodstock (una carga semanal), «Fecha» en las demás. */
export const COLUMNA_FECHA = { broodstock: 'Fecha de corte' };
export const fechaDeFila = (clave, r) => txt((r || {})[COLUMNA_FECHA[clave] || 'Fecha']);

/** El período por defecto que termina en `hoy`: los últimos PERIODO_DIAS días, hoy incluido. */
export function periodoPorDefecto(hoy) {
  return { desde: sumarDias(hoy, -(PERIODO_DIAS - 1)), hasta: txt(hoy) };
}

/** «La foto al día X»: sólo lo ocurrido hasta X inclusive. Se excluye lo que el libro excluiría con su `hasta`
 *  (`fecha > corte`), así que una fila sin fecha se queda, igual que en el libro al cierre de la ficha de Salas. */
export function fuentesAlDia(fuentes, hasta) {
  const out = {};
  for (const [clave, filas] of Object.entries(fuentes || {})) out[clave] = (filas || []).filter((r) => !(fechaDeFila(clave, r) > hasta));
  return out;
}

/** Fuera las filas de «Maduración Sala» de salas que ya no se muestran. Sólo de ESA hoja: en las que alimentan
 *  el libro no hay ninguna de esas salas (medido el 2026-09-19), y quitarle filas al libro cambiaría los saldos de
 *  los lotes sin decirlo. */
export function soloSalasVisibles(fuentes) {
  const todas = (fuentes || {}).sala || [];
  const sala = todas.filter((r) => SALAS_VISIBLES.includes(txt(r.Sala)));
  return { fuentes: { ...fuentes, sala }, excluidas: todas.length - sala.length };
}

/** Por hoja: cuántas filas tiene, la última fecha registrada y cuántos días han pasado hasta `hoy`; y cuántas
 *  llevan una fecha POSTERIOR a hoy, que sólo puede ser una errata (la foto de hoy no las incluye). */
export function frescura(fuentes, hoy) {
  return MAD_OP_HOJAS.map(({ clave, hoja }) => {
    const filas = (fuentes || {})[clave] || [];
    let ultima = '';
    let futuras = 0;
    for (const r of filas) {
      const f = fechaDeFila(clave, r);
      if (!esIso(f)) continue;
      if (f > hoy) { futuras++; continue; }
      if (f > ultima) ultima = f;
    }
    return { clave, hoja, filas: filas.length, ultima, dias: ultima ? diasEntre(ultima, hoy) : '', futuras };
  });
}

/** El libro AL CIERRE de `fecha`: sólo lo ocurrido hasta ese día, con los estados de ese día. Es el que usa
 *  «🔄 Proponer estado» de la ficha de Salas, y el que pintan la portada y el mapa de planta del tablero. */
export function libroAlCierre(fuentes, fecha) {
  return construirLibro(fuentes || {}, { hoy: fecha, hasta: fecha });
}

/**
 * El estado de cada sala visible, DOBLE (decisión del usuario):
 *  · `registrado`: el último «Estado» tecleado en la hoja hasta `fecha`, con su día y su «Estado por lote»;
 *  · `propuesto`: el que deduce el libro AL CIERRE de `fecha` —el mismo cálculo y los mismos tanques físicos
 *    que «🔄 Proponer estado»—, con su desglose por lote y la ocupación. Vacío si el libro no conoce la sala:
 *    una sala sin ingresos no tiene estado deducible (y decir «Desinfección» de ella sería falso).
 * `coinciden` es null cuando falta alguno de los dos: no se puede comparar lo que no está.
 * `libroDado`: el libro al cierre de `fecha` si ya se tiene (el modelo lo construye una vez para todo el tablero).
 */
export function estadoDeSalas(fuentes, fecha, libroDado) {
  const libro = libroDado || libroAlCierre(fuentes, fecha);
  const filasSala = ((fuentes || {}).sala || [])
    .filter((r) => { const f = fechaDeFila('sala', r); return esIso(f) && f <= fecha && txt(r.Estado) !== ''; })
    .sort((a, b) => (fechaDeFila('sala', a) < fechaDeFila('sala', b) ? -1 : fechaDeFila('sala', a) > fechaDeFila('sala', b) ? 1 : 0));
  return SALAS_VISIBLES.map((sala) => {
    const u = filasSala.filter((r) => txt(r.Sala) === sala).pop() || null;
    const registrado = u
      ? { estado: txt(u.Estado), fecha: fechaDeFila('sala', u), porLote: txt(u['Estado por lote']) }
      : { estado: '', fecha: '', porLote: '' };
    const tanques = MAD_TANQUES_POR_SALA[sala] || [];
    const oc = ocupacionDeSala(libro, sala, tanques);
    const propuesto = {
      estado: estadoDeSala(libro, sala, fecha, tanques), porLote: estadoPorLoteTexto(libro, sala, fecha),
      ocupados: oc.ocupados, total: oc.total, conocida: oc.conocida,
    };
    const coinciden = registrado.estado && propuesto.estado ? registrado.estado === propuesto.estado : null;
    return { sala, registrado, propuesto, coinciden, desfaseDias: registrado.fecha ? diasEntre(registrado.fecha, fecha) : '' };
  });
}

const numONulo = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = txt(v);
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const suma = (a, v) => a + (numONulo(v) || 0);
const lista = (v) => txt(v).split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Los PARTES de Tanques (R2, 2026-09-18: cada ronda de mortalidad es su fila, con hora y número) en UN registro
 * por (fecha, sala, tanque), con la regla de la ficha:
 *  · muertes, descartes y mudas se SUMAN: cada parte trae lo de su ronda, no el acumulado;
 *  · las cópulas también: se anotan en un solo parte y los demás van vacíos;
 *  · los pesos se PROMEDIAN sobre los partes que los traen: un vacío no es un cero;
 *  · las observaciones se juntan sin repetir.
 */
export function diasDeTanque(filasTanques) {
  const m = new Map();
  for (const r of filasTanques || []) {
    const fecha = txt(r.Fecha);
    const sala = txt(r.Sala);
    const tanque = numONulo(r.Tanque);
    const k = fecha + '|' + sala + '|' + tanque;
    if (!m.has(k)) {
      m.set(k, { fecha, sala, tanque, partes: 0, machosMuertos: 0, hembrasMuertas: 0, machosDescarte: 0, hembrasDescarte: 0,
        copulas: 0, muda: 0, pesosMachos: [], pesosHembras: [], obsSanitarias: [], obsOperativas: [] });
    }
    const d = m.get(k);
    d.partes++;
    d.machosMuertos = suma(d.machosMuertos, r['Machos muertos']);
    d.hembrasMuertas = suma(d.hembrasMuertas, r['Hembras muertas']);
    d.machosDescarte = suma(d.machosDescarte, r['Machos muertos por descarte de selección']);
    d.hembrasDescarte = suma(d.hembrasDescarte, r['Hembras muertas por descarte de selección']);
    d.copulas = suma(d.copulas, r['Cópulas']);
    d.muda = suma(d.muda, r.Muda);
    const pm = numONulo(r['Peso promedio machos (g)']);
    const ph = numONulo(r['Peso promedio hembras (g)']);
    if (pm !== null) d.pesosMachos.push(pm);
    if (ph !== null) d.pesosHembras.push(ph);
    for (const o of lista(r['Observaciones sanitarias'])) if (!d.obsSanitarias.includes(o)) d.obsSanitarias.push(o);
    for (const o of lista(r['Observaciones operativas'])) if (!d.obsOperativas.includes(o)) d.obsOperativas.push(o);
  }
  const prom = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : '');
  return [...m.values()].map(({ pesosMachos, pesosHembras, ...d }) => ({ ...d, pesoMachos: prom(pesosMachos), pesoHembras: prom(pesosHembras) }));
}

/** Lo que interesa del libro al cerrar un día, COPIADO (el gancho entrega el libro vivo).
 *  🆕 F4.1 (2026-09-21) · también POR TANQUE, para la curva de vivos de 🛢 Tanques. Va aquí y no en
 *  el módulo de la sub-vista por lo mismo que `porSala` y `porLote`: reconstruir el libro día a día
 *  para dibujar una curva costaba 30 libros para 30 días (7 s con un año de datos), y este gancho ya
 *  recorre las posiciones una vez. La clave es la misma `ubicKey` que usa el libro, para que
 *  «Sala 1 · 1» sea el mismo tanque aquí y allí. */
function fotoDelLibro(posiciones, lotes) {
  const total = { machos: 0, hembras: 0 };
  const porSala = {};
  const porLote = {};
  const porTanque = {};
  for (const p of posiciones.values()) {
    total.machos += p.machos;
    total.hembras += p.hembras;
    const S = porSala[p.sala] || (porSala[p.sala] = { machos: 0, hembras: 0 });
    S.machos += p.machos;
    S.hembras += p.hembras;
    const L = porLote[p.lote] || (porLote[p.lote] = { machos: 0, hembras: 0 });
    L.machos += p.machos;
    L.hembras += p.hembras;
    const uk = ubicKey(p.sala, p.tanque);
    const T = porTanque[uk] || (porTanque[uk] = { sala: p.sala, tanque: p.tanque, machos: 0, hembras: 0 });
    T.machos += p.machos;
    T.hembras += p.hembras;
  }
  for (const L of lotes.values()) {
    const o = porLote[L.lote] || (porLote[L.lote] = { machos: 0, hembras: 0 });
    o.ingresados = { ...L.ingresados };
    o.muertos = { ...L.muertos };
    o.descartes = { ...L.descartes };
  }
  return { total, porSala, porLote, porTanque };
}
const FOTO_VACIA = () => ({ total: { machos: 0, hembras: 0 }, porSala: {}, porLote: {}, porTanque: {} });

/**
 * La serie DIARIA del libro entre `desde` y `hasta`, en UNA pasada (gancho `alCerrarDia` de `construirLibro`).
 * Cada día es la foto al CIERRE: vivos por total, sala y lote, y los acumulados de cada lote (ingresados,
 * muertos, descartes). Un día sin eventos repite el cierre del anterior: el saldo no cambia si no pasa nada.
 * ⚠ Reconstruir el libro día a día daba lo mismo, pero costaba 30 libros para 30 días (7 s con un año de datos).
 */
export function serieDiaria(fuentes, desde, hasta) {
  const cierres = [];
  construirLibro(fuentes || {}, { hoy: hasta, hasta, alCerrarDia: (fecha, { posiciones, lotes }) => {
    if (esIso(fecha)) cierres.push([fecha, fotoDelLibro(posiciones, lotes)]);
  } });
  const out = [];
  let i = 0;
  let foto = FOTO_VACIA();
  for (let d = desde; d && d <= hasta; d = sumarDias(d, 1)) {
    while (i < cierres.length && cierres[i][0] <= d) foto = cierres[i++][1];
    out.push({ fecha: d, ...foto });
  }
  return out;
}

/** Qué filtros admite cada hoja. Un filtro que no aplica se DICE en la vista, no se traduce en un cero: un desove
 *  es de (lote, código genético), nunca de un tanque; un movimiento no dice de qué lote era (lo deduce el libro). */
export const DIMENSIONES = {
  ingresos: ['sala', 'tanque', 'lote', 'codigo'],
  movimientos: ['sala', 'tanque'],
  desoves: ['lote', 'codigo'],
  mortDesove: ['lote'],
  /* 🔴 AQUÍ DECÍA ['lote', 'sala'] y era falso: ningún consumidor de esta hoja mira `F.sala` —ni
     `motivosDeCierre` ni `lotesCerrados`, sólo `F.lote`—. Lo destapó la prueba de conducta de
     `DIMENSIONES` en su primera corrida (D-3, 2026-09-20). La declaración venía de que la hoja ganó
     su columna «Sala» el 09-14 (D14), pero eso es para que el cierre PARCIAL descuente de esa sala,
     no para filtrar. Se RETIRA en vez de implementarse (decisión del usuario, 09-20): un cierre es de
     un LOTE entero y sólo el Parcial lleva sala, así que filtrar 💀 Bajas por sala y ver desaparecer
     los cierres TOTALES enseñaría una cifra incompleta con cara de completa. */
  cierres: ['lote'],
  tratamientos: ['sala', 'lote'],
  alimentacion: ['sala', 'tanque', 'lote'],
  /* F6.1 (2026-09-21): aquí decía sólo ['codigo'] porque la hoja no tenía consumidor. Con `tablaDePiscinas` el lote
     también le llega —por su Ingreso: las piscinas de las que entró—; una piscina de engorde no está en ninguna sala. */
  broodstock: ['lote', 'codigo'],
  sala: ['sala'],
  tanques: ['sala', 'tanque'],
};

/** Las opciones de los filtros: las salas visibles con sus tanques FÍSICOS, y los lotes con sus códigos
 *  genéticos tal como los declaran el Ingreso y los Desoves. */
export function opcionesDeFiltro(fuentes) {
  const codigos = new Map();
  for (const r of [...((fuentes || {}).ingresos || []), ...((fuentes || {}).desoves || [])]) {
    const lote = txt(r.Lote);
    if (!lote) continue;
    if (!codigos.has(lote)) codigos.set(lote, new Set());
    const cg = txt(r['Código genético']);
    if (cg) codigos.get(lote).add(cg);
  }
  const lotes = [...codigos.keys()].sort(porNombre);
  /* F2.3 · la piscina y la camaronera de origen salen SÓLO del Ingreso: son de la entrada del lote, no de un
     desove. Un lote puede traer varias (entró en dos tandas), así que el filtro compara por pertenencia. */
  const piscinas = new Set();
  const camaroneras = new Set();
  for (const r of ((fuentes || {}).ingresos || [])) {
    const pi = txt(r['Piscina Broodstock']);
    if (pi) piscinas.add(pi);
    const ca = txt(r['Camaronera origen']);
    if (ca) camaroneras.add(ca);
  }
  return {
    salas: SALAS_VISIBLES.slice(),
    tanquesPorSala: Object.fromEntries(SALAS_VISIBLES.map((s) => [s, (MAD_TANQUES_POR_SALA[s] || []).slice()])),
    lotes,
    codigosPorLote: Object.fromEntries(lotes.map((l) => [l, [...codigos.get(l)].sort(porNombre)])),
    estados: ESTADOS_LOTE.slice(),
    piscinas: [...piscinas].sort(porNombre),
    camaroneras: [...camaroneras].sort(porNombre),
  };
}

/**
 * El modelo del tablero a partir de TODAS las filas del store.
 * `hoy`: la fecha de cálculo. `fecha`: la de la FOTO (por defecto, hoy): el libro, el resumen y el estado de las
 * salas son los del cierre de ese día. El libro se construye UNA vez y lo comparten el estado de las salas y la
 * vista (vivos, mapa de planta, cuarentenas): con un año de datos cada libro cuesta del orden de 0,2 s.
 */
export function modeloOperativo(filas, opts) {
  const hoy = txt((opts || {}).hoy);
  const fecha = txt((opts || {}).fecha) || hoy;
  const { fuentes: todas, sinHoja } = fuentesDesdeFilas(filas);
  const { fuentes, excluidas } = soloSalasVisibles(todas);
  const libro = libroAlCierre(fuentes, fecha);
  return {
    hoy, fecha, periodo: periodoPorDefecto(fecha),
    fuentes, sinHoja, salasExcluidas: excluidas,
    frescura: frescura(fuentes, hoy),
    resumen: resumenMaduracion(fuentesAlDia(fuentes, fecha), { hoy: fecha }),
    libro,
    salas: estadoDeSalas(fuentes, fecha, libro),
    filtros: opcionesDeFiltro(fuentes),
  };
}
