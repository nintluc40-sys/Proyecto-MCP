/* ============================================================
   MADURACIÓN · OPERATIVO — LOTES (F2.1, 2026-09-19)

   Lo que enseña la sub-vista «🧬 Lotes», con el diseño que aprobó el usuario el 2026-09-19 (tabla maestra + ficha
   debajo; el cuadre en tabla con columnas ♂/♀; la comparativa con selector de agrupación): la tabla de todos los
   lotes, la ficha de uno —origen, CASCADA DEL CUADRE, curva de vivos con sus eventos, reproducción y los promedios
   de sus tanques— y la comparativa por lote, código genético o piscina. Módulo PURO: ni DOM ni red.

   🔑🔑 LA CASCADA NO RESTA LA MORTALIDAD EN DESOVE, y no es un olvido. Al procesar una fila de «Mortalidad Desove»
   el libro hace `L.muertos.hembras += …` Y ADEMÁS `L[mortDesove].muertas += …`: lo segundo es un DESGLOSE por tipo
   de tanque, no una baja aparte (mad-libro.js, «MORTALIDAD EN TANQUES DE DESOVE Y DE RECUPERACIÓN»). Restarla otra
   vez descuadraría todo lote que haya desovado, así que va como «de los cuales» debajo de Muertos.

   🔑 Las SALIDAS tampoco se leen de la hoja a secas: un Fin de Ciclo puede pedir más animales de los que el libro
   tenía vivos, y entonces el libro se lleva sólo los que había y anota `deficit-cierre`. La salida EFECTIVA es lo
   pedido MENOS ese déficit; con lo pedido, el cuadre saldría rojo por algo que el libro ya contó bien.

   ⚠ Y `cuadra` no es una resta derivada —eso sería un fixture que no prueba nada—: cada término viene de su propia
   fuente (los acumuladores del libro, la hoja de cierres, los avisos) y al final se COMPARAN. El día que no cuadre,
   es un hallazgo de verdad, no un cero que se ha escrito solo.

   ⏳ Lo que la ficha aún NO trae, porque su hoja no existe todavía (medido el 2026-09-19): revisiones y
   tratamientos. Nacen con su primer envío; hasta entonces dibujar su panel vacío es lo correcto.
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { estadoDeLote, ESTADO_MIXTO, ubicKey } from '../registros/lib/mad-libro.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';
import { fechaDeFila } from './operativo.data.js';
import { cociente, proporcionHM, supervivencia, tasaDescarte, desempenoPorOrigen } from './operativo.indicadores.js';
import { posicionEnFiltro } from './operativo.tablero.js';

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
/** Un par ♂/♀ con su total, que es la forma que tiene toda la cascada. */
const par = (machos, hembras) => ({ machos: ent(machos), hembras: ent(hembras), total: ent(machos) + ent(hembras) });

/* ── LA CASCADA DEL CUADRE ──────────────────────────────────── */

/** Las filas de la cascada, en su orden y con su signo. `vivos` es el resultado, no una resta. */
export const CUADRE_FILAS = [
  { id: 'ingresados', etiqueta: 'Ingresados', signo: '+' },
  { id: 'muertos', etiqueta: 'Muertos', signo: '−' },
  { id: 'descartes', etiqueta: 'Descartes de selección', signo: '−' },
  { id: 'salidas', etiqueta: 'Salidas (Fin de Ciclo)', signo: '−' },
  { id: 'diferencia', etiqueta: 'Diferencia de cierre', signo: '−' },
  { id: 'vivos', etiqueta: 'Vivos', signo: '=' },
];

/** El lote del libro por su forma canónica (las claves del libro son el lote TAL CUAL se tecleó). */
export function loteDelLibro(libro, lote) {
  const clave = normLote(lote);
  for (const [k, L] of (libro && libro.lotes) || new Map()) if (normLote(k) === clave) return L;
  return null;
}

/** Suma por sexo de los avisos del libro de un tipo, para un lote. Los avisos llevan `{ lote, sexo, cantidad }`. */
function avisosPorSexo(libro, clave, tipo) {
  let machos = 0;
  let hembras = 0;
  for (const a of (libro && libro.avisos) || []) {
    if (a.tipo !== tipo || normLote(a.lote) !== clave) continue;
    if (a.sexo === 'machos') machos += ent(a.cantidad);
    else if (a.sexo === 'hembras') hembras += ent(a.cantidad);
  }
  return { machos, hembras };
}

/**
 * La cascada del cuadre de un lote: ingresados − muertos − descartes − salidas − diferencia = vivos.
 * Devuelve `null` si el libro no conoce el lote. `cuadra` compara los dos lados; `descuadre` dice de cuánto es la
 * diferencia cuando no cuadran (positivo: el libro tiene MENOS vivos de los que la resta explica).
 */
export function cuadreDeLote(libro, fuentes, lote) {
  const clave = normLote(lote);
  const L = loteDelLibro(libro, clave);
  if (!L) return null;
  const ingresados = par(L.ingresados.machos, L.ingresados.hembras);
  const muertos = par(L.muertos.machos, L.muertos.hembras);
  const descartes = par(L.descartes.machos, L.descartes.hembras);
  /* Salidas EFECTIVAS: lo que pidió Fin de Ciclo menos lo que el libro no pudo darle (ver la cabecera). */
  let pedidoM = 0;
  let pedidoH = 0;
  for (const r of (fuentes || {}).cierres || []) {
    if (normLote(r.Lote) !== clave) continue;
    pedidoM += ent(r.Machos);
    pedidoH += ent(r.Hembras);
  }
  const falta = avisosPorSexo(libro, clave, 'deficit-cierre');
  const salidas = par(Math.max(0, pedidoM - falta.machos), Math.max(0, pedidoH - falta.hembras));
  const d = avisosPorSexo(libro, clave, 'diferencia-cierre');
  const diferencia = par(d.machos, d.hembras);
  const vivos = par(L.machos, L.hembras);
  const valores = { ingresados, muertos, descartes, salidas, diferencia, vivos };
  const resta = (s) => ingresados[s] - muertos[s] - descartes[s] - salidas[s] - diferencia[s];
  const descuadre = { machos: resta('machos') - vivos.machos, hembras: resta('hembras') - vivos.hembras };
  descuadre.total = descuadre.machos + descuadre.hembras;
  return {
    lote: txt(L.lote), filas: CUADRE_FILAS.map((f) => ({ ...f, ...valores[f.id] })), ...valores,
    /* «De los cuales»: el desglose de Muertos por tipo de tanque. Sólo hembras: son las que salen a desovar. */
    deLosCuales: {
      desove: { entran: ent(L.mortDesove.entran), muertas: ent(L.mortDesove.muertas) },
      recuperacion: { entran: ent(L.mortRecuperacion.entran), muertas: ent(L.mortRecuperacion.muertas) },
    },
    deficit: { ...falta, total: falta.machos + falta.hembras },
    cuadra: descuadre.total === 0 && descuadre.machos === 0 && descuadre.hembras === 0,
    descuadre,
  };
}

/* ── LA TABLA MAESTRA ───────────────────────────────────────── */

/** El estado de un lote entero: el de sus salas si coinciden, «Mixto» si difieren, y el del lote si no tiene ninguna
 *  (un lote cerrado conserva sus salas en cero, así que su estado sigue saliendo de ellas). */
export function estadoDeLoteEntero(L, fecha) {
  const estados = [...new Set(((L && L.salas) || []).map((s) => txt(s.estado)).filter(Boolean))];
  if (estados.length > 1) return ESTADO_MIXTO;
  return estados[0] || estadoDeLote(L || {}, fecha);
}

/** Los códigos genéticos y las ubicaciones de un lote, leídos de las posiciones del libro (también las que están a
 *  cero: un lote cerrado sigue diciendo dónde estuvo). */
function contextoDeLote(libro, clave) {
  const codigos = new Set();
  const salas = new Set();
  const tanques = new Set();
  for (const p of (libro && libro.posiciones) || []) {
    if (normLote(p.lote) !== clave) continue;
    const cg = txt(p.codigoGenetico);
    if (cg) codigos.add(cg);
    if (txt(p.sala)) salas.add(txt(p.sala));
    tanques.add(ubicKey(p.sala, p.tanque));
  }
  return { codigos: [...codigos].sort(porNombre), salas: [...salas].sort(porNombre), tanques: tanques.size };
}

/** ¿Alguna posición de este lote pasa el filtro? (Sin mirar si está viva: un lote cerrado sigue siendo del filtro
 *  de su sala.) Con el filtro vacío pasan todos. */
function loteEnFiltro(libro, clave, F) {
  const suyas = ((libro && libro.posiciones) || []).filter((p) => normLote(p.lote) === clave);
  if (!suyas.length) return !F.sala && F.tanque === null && !F.codigo && (!F.lote || F.lote === clave);
  return suyas.some((p) => posicionEnFiltro(p, F));
}

/**
 * La tabla maestra: una fila por lote que el libro conozca —vivos Y cerrados—, con sus cifras al cierre de la foto.
 * `dias` es la edad del lote: de su ingreso a la foto, o a su cierre si ya está cerrado.
 */
export function tablaDeLotes(M, F) {
  const libro = (M && M.libro) || { lotes: new Map(), posiciones: [], avisos: [] };
  const filas = [];
  for (const [k, L] of libro.lotes) {
    const clave = normLote(k);
    if (!loteEnFiltro(libro, clave, F)) continue;
    const ctx = contextoDeLote(libro, clave);
    const ingresados = par(L.ingresados.machos, L.ingresados.hembras);
    const vivos = par(L.machos, L.hembras);
    const hasta = txt(L.cerrado) || txt(M.fecha);
    const cuadre = cuadreDeLote(libro, M.fuentes, clave);
    filas.push({
      lote: txt(L.lote), estado: estadoDeLoteEntero(L, txt(M.fecha)), ingreso: txt(L.ingreso), cerrado: txt(L.cerrado),
      dias: esIso(txt(L.ingreso)) && esIso(hasta) ? diasEntre(txt(L.ingreso), hasta) : '',
      codigos: ctx.codigos, salas: ctx.salas, tanques: ctx.tanques,
      ingresados, vivos,
      supervivencia: supervivencia(L), descarte: tasaDescarte(L),
      hm: proporcionHM(vivos.hembras, vivos.machos),
      cuadra: cuadre ? cuadre.cuadra : true,
    });
  }
  return filas.sort((a, b) => porNombre(a.lote, b.lote));
}

/* ── LA FICHA DE UN LOTE ────────────────────────────────────── */

/** El ORIGEN del lote: sus filas de Ingreso, con la piscina y la camaronera de Broodstock que las acompañan. */
export function origenDeLote(fuentes, lote) {
  const clave = normLote(lote);
  return ((fuentes || {}).ingresos || []).filter((r) => normLote(r.Lote) === clave).map((r) => ({
    fecha: fechaDeFila('ingresos', r), sala: txt(r.Sala), tanque: ent(r.Tanque),
    codigo: normCodigoGenetico(r['Código genético']), piscina: txt(r['Piscina Broodstock']), camaronera: txt(r['Camaronera origen']),
    machos: ent(r.Machos), hembras: ent(r.Hembras), total: ent(r.Machos) + ent(r.Hembras),
  })).sort((a, b) => porNombre(a.fecha, b.fecha));
}

/** La curva de vivos del lote, día a día, tomada de la serie que ya calculó el modelo (no se reconstruye nada).
 *  Un día en que el lote aún no existía va en cero, que es lo que dice el libro. */
export function curvaDeLote(serie, lote) {
  const clave = normLote(lote);
  return (serie || []).map((d) => {
    let machos = 0;
    let hembras = 0;
    for (const [k, v] of Object.entries(d.porLote || {})) {
      if (normLote(k) !== clave) continue;
      machos += ent(v.machos);
      hembras += ent(v.hembras);
    }
    return { fecha: d.fecha, machos, hembras, total: machos + hembras };
  });
}

/** Los EVENTOS del lote dentro del período, para marcarlos sobre la curva. Un movimiento no dice de qué lote es
 *  (lo deduce el libro), así que sólo entran los que nombran al lote: ingresos, cierres y mortalidad en desove. */
export function eventosDeLote(fuentes, lote, periodo) {
  const clave = normLote(lote);
  const out = [];
  const mete = (clave2, tipo, etiqueta) => {
    for (const r of (fuentes || {})[clave2] || []) {
      if (normLote(r.Lote) !== clave) continue;
      const f = fechaDeFila(clave2, r);
      if (!enPeriodo(f, periodo)) continue;
      out.push({ fecha: f, tipo, etiqueta, machos: ent(r.Machos), hembras: ent(r.Hembras) });
    }
  };
  mete('ingresos', 'ingreso', 'Ingreso');
  mete('cierres', 'cierre', 'Fin de ciclo');
  for (const r of (fuentes || {}).mortDesove || []) {
    if (normLote(r.Lote) !== clave) continue;
    const f = fechaDeFila('mortDesove', r);
    if (!enPeriodo(f, periodo)) continue;
    out.push({ fecha: f, tipo: 'mortdes', etiqueta: 'Mortalidad en ' + (txt(r['Tipo de tanque']) || 'desove'), machos: 0, hembras: ent(r['Hembras muertas']) });
  }
  for (const r of (fuentes || {}).desoves || []) {
    if (normLote(r.Lote) !== clave) continue;
    const f = fechaDeFila('desoves', r);
    if (!enPeriodo(f, periodo)) continue;
    out.push({ fecha: f, tipo: 'desove', etiqueta: 'Desove', machos: 0, hembras: 0 });
  }
  return out.sort((a, b) => porNombre(a.fecha, b.fecha));
}

/** La REPRODUCCIÓN del lote en el período: desoves, huevos, N2, N5 y fertilidad (eclosión sobre los huevos que
 *  llegaron a tener N2, como en el Saldo). ⚠ N5 NO se compara con N2: son recuentos de momentos distintos. */
export function reproduccionDeLote(fuentes, lote, periodo) {
  const clave = normLote(lote);
  const A = { desoves: 0, huevos: 0, n2: 0, n5: 0, huevosConN2: 0, desovesConN5: 0 };
  for (const r of (fuentes || {}).desoves || []) {
    if (normLote(r.Lote) !== clave) continue;
    if (!enPeriodo(fechaDeFila('desoves', r), periodo)) continue;
    const n2 = ent(r.N2);
    const n5 = ent(r.N5);
    A.desoves += ent(r.Desoves);
    A.huevos += ent(r['Total de huevos']);
    A.n2 += n2;
    A.n5 += n5;
    if (n2 > 0) A.huevosConN2 += ent(r['Total de huevos']);
    if (n5 > 0) A.desovesConN5 += ent(r.Desoves);
  }
  return {
    ...A,
    huevosPorDesove: cociente(A.huevos, A.desoves),
    fertilidad: cociente(A.n2, A.huevosConN2, 100),
    n5PorDesove: cociente(A.n5, A.desovesConN5),
  };
}

/**
 * Los promedios que la hoja de Tanques guarda POR TANQUE y este lote no tiene propios: pesos, cópulas y mudas.
 * 🔑 La hoja no dice de qué lote es cada cifra, así que se reparte por la PRESENCIA del lote en cada tanque al
 * cierre de la foto —el mismo criterio proporcional con el que el libro reparte las bajas de un tanque mezclado—.
 * Los pesos se PROMEDIAN pesando por los animales del lote (un peso es una media, no una cantidad que se parta);
 * las cópulas y las mudas se PARTEN, porque son cuentas. Se devuelve `compartido` para poder decirlo en pantalla.
 */
export function promediosDeLote(M, lote, periodo) {
  const clave = normLote(lote);
  const libro = (M && M.libro) || { posiciones: [] };
  const cuota = new Map();
  let compartido = false;
  /* El total de cada tanque, UNA vez: recalcularlo dentro del bucle costaba una pasada por posición. */
  const totalPorTanque = new Map();
  for (const p of libro.posiciones || []) {
    const uk = ubicKey(p.sala, p.tanque);
    totalPorTanque.set(uk, (totalPorTanque.get(uk) || 0) + ent(p.machos) + ent(p.hembras));
  }
  /* ⚠ Se ACUMULA, no se asigna: un mismo lote puede estar en un tanque con DOS códigos genéticos, y entonces son
     dos posiciones con la misma ubicación. Asignando, la segunda borraba la primera y el lote perdía su parte.
     🔑 Y se acumulan los ENTEROS, dividiendo al final: sumar fracciones daba 0,999… para un tanque que es entero
     del lote, y eso lo habría marcado como compartido. */
  for (const p of libro.posiciones || []) {
    if (normLote(p.lote) !== clave) continue;
    const uk = ubicKey(p.sala, p.tanque);
    const mios = ent(p.machos) + ent(p.hembras);
    if (!(totalPorTanque.get(uk) || 0) || !mios) continue;
    const c = cuota.get(uk) || { mios: 0, machos: 0, hembras: 0 };
    c.mios += mios;
    c.machos += ent(p.machos);
    c.hembras += ent(p.hembras);
    cuota.set(uk, c);
  }
  for (const [uk, c] of cuota) {
    const total = totalPorTanque.get(uk) || 0;
    c.parte = total ? c.mios / total : 0;
    if (c.mios < total) compartido = true;
  }
  let pmNum = 0;
  let pmDen = 0;
  let phNum = 0;
  let phDen = 0;
  let copulas = 0;
  let muda = 0;
  for (const r of (M.fuentes || {}).tanques || []) {
    const uk = ubicKey(r.Sala, ent(r.Tanque));
    const c = cuota.get(uk);
    if (!c || !enPeriodo(fechaDeFila('tanques', r), periodo)) continue;
    const pm = num(r['Peso promedio machos (g)']);
    const ph = num(r['Peso promedio hembras (g)']);
    if (pm !== null && c.machos > 0) { pmNum += pm * c.machos; pmDen += c.machos; }
    if (ph !== null && c.hembras > 0) { phNum += ph * c.hembras; phDen += c.hembras; }
    copulas += ent(r.Cópulas) * c.parte;
    muda += ent(r.Muda) * c.parte;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const hembras = ent((loteDelLibro(libro, clave) || {}).hembras);
  return {
    pesoMachos: pmDen ? r2(pmNum / pmDen) : '', pesoHembras: phDen ? r2(phNum / phDen) : '',
    copulas: Math.round(copulas), muda: Math.round(muda),
    pctCopulas: cociente(Math.round(copulas), hembras, 100), pctMuda: cociente(Math.round(muda), hembras, 100),
    compartido, tanques: cuota.size,
  };
}

/** La ficha entera de un lote. Devuelve `null` si el libro no lo conoce. */
export function fichaDeLote(M, serie, lote, periodo) {
  const libro = (M && M.libro) || { lotes: new Map() };
  const L = loteDelLibro(libro, lote);
  if (!L) return null;
  const ctx = contextoDeLote(libro, normLote(lote));
  return {
    lote: txt(L.lote), estado: estadoDeLoteEntero(L, txt(M.fecha)), ingreso: txt(L.ingreso), cerrado: txt(L.cerrado),
    ...ctx,
    origen: origenDeLote(M.fuentes, lote),
    cuadre: cuadreDeLote(libro, M.fuentes, lote),
    curva: curvaDeLote(serie, lote),
    eventos: eventosDeLote(M.fuentes, lote, periodo),
    reproduccion: reproduccionDeLote(M.fuentes, lote, periodo),
    promedios: promediosDeLote(M, lote, periodo),
  };
}

/* ── LA COMPARATIVA ─────────────────────────────────────────── */

/** Las tres agrupaciones del selector, en su orden. «lote» es la de por defecto. */
export const DIMENSIONES_COMPARATIVA = [
  { clave: 'lote', etiqueta: 'Lote' },
  { clave: 'codigo', etiqueta: 'Código genético' },
  { clave: 'piscina', etiqueta: 'Piscina de origen' },
];

/**
 * La comparativa. Por LOTE sale de la tabla maestra (para que las dos digan lo mismo); por código genético y por
 * piscina, de `desempenoPorOrigen` (Fase 0.3), que ya sabe repartir un lote entre varios orígenes.
 * `mejor` y `peor` son por supervivencia, y sólo se dicen si hay al menos dos filas con la cifra.
 */
export function comparativa(M, F, periodo, dimension) {
  const dim = DIMENSIONES_COMPARATIVA.some((d) => d.clave === dimension) ? dimension : 'lote';
  let filas;
  if (dim === 'lote') {
    filas = tablaDeLotes(M, F).map((f) => ({
      origen: f.lote, lotes: [f.lote], ingresados: f.ingresados.total, vivos: f.vivos.total,
      supervivencia: f.supervivencia.total, dias: f.dias,
      ...reproduccionDeLote(M.fuentes, f.lote, periodo),
    }));
  } else {
    const alDia = {};
    for (const [k, v] of Object.entries(M.fuentes || {})) alDia[k] = (v || []).filter((r) => !(fechaDeFila(k, r) > txt(M.fecha)));
    filas = desempenoPorOrigen(alDia, (M.libro || {}).posiciones || [], dim).map((o) => ({ ...o, dias: '' }));
  }
  const conCifra = filas.filter((f) => f.supervivencia !== '' && f.supervivencia !== null);
  const orden = [...conCifra].sort((a, b) => b.supervivencia - a.supervivencia);
  return {
    dimension: dim, filas,
    mejor: orden.length > 1 ? orden[0].origen : '',
    peor: orden.length > 1 ? orden[orden.length - 1].origen : '',
  };
}
