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

   🔴🔴 LO QUE DECLARA FIN DE CICLO NO ES UN TÉRMINO DE LA RESTA (0t·9, 2026-09-29, usuario): esos animales salen del
   libro por los partes de Tanques (muertos y descartes de selección), así que restarlos otra vez los contaría dos
   veces. Se enseña APARTE como `registradoFin` (lo declarado tal cual, con cuántos cierres). Hasta ese día la cascada
   tenía «Salidas (Fin de Ciclo)» con lo pedido menos el `deficit-cierre` del libro, aviso que ya no existe.

   ⚠ Y `cuadra` no es una resta derivada —eso sería un fixture que no prueba nada—: cada término viene de su propia
   fuente (los acumuladores del libro, la hoja de cierres, los avisos) y al final se COMPARAN. El día que no cuadre,
   es un hallazgo de verdad, no un cero que se ha escrito solo.

   ⏳ Lo que la ficha aún NO trae, porque su hoja no existe todavía (medido el 2026-09-19): revisiones y
   tratamientos. Nacen con su primer envío; hasta entonces dibujar su panel vacío es lo correcto.
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { estadoDeLote, ESTADO_MIXTO, ubicKey, pesosDeAlimentacion } from '../registros/lib/mad-libro.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';
import { fechaDeFila, diasDeTanque } from './operativo.data.js';
import { cociente, proporcionHM, supervivencia, tasaDescarte, tasaEnPartesDelLote } from './operativo.indicadores.js';
import { posicionEnFiltro, codigoEnFiltro, normalizarFiltro } from './operativo.tablero.js';
import { normPiscina } from '../registros/lib/ficha-maduracion-broodstock.schema.js';   // 5 · la piscina canónica

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

/** Las filas de la cascada, en su orden y con su signo. `vivos` es el resultado, no una resta.
 *  0t·9 (2026-09-29, usuario): sin «Salidas (Fin de Ciclo)»: lo que declara un cierre no se resta (ver la cabecera). */
export const CUADRE_FILAS = [
  { id: 'ingresados', etiqueta: 'Ingresados', signo: '+' },
  { id: 'muertos', etiqueta: 'Muertos', signo: '−' },
  { id: 'descartes', etiqueta: 'Descartes de selección', signo: '−' },
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
 * La cascada del cuadre de un lote: ingresados − muertos − descartes − diferencia = vivos.
 * Devuelve `null` si el libro no conoce el lote. `cuadra` compara los dos lados; `descuadre` dice de cuánto es la
 * diferencia cuando no cuadran (positivo: el libro tiene MENOS vivos de los que la resta explica).
 * `registradoFin`: lo que declaran sus cierres de Fin de Ciclo, fuera de la resta (0t·9, ver la cabecera).
 */
export function cuadreDeLote(libro, fuentes, lote) {
  const clave = normLote(lote);
  const L = loteDelLibro(libro, clave);
  if (!L) return null;
  const ingresados = par(L.ingresados.machos, L.ingresados.hembras);
  const muertos = par(L.muertos.machos, L.muertos.hembras);
  const descartes = par(L.descartes.machos, L.descartes.hembras);
  /* Lo REGISTRADO en Fin de Ciclo, tal cual lo declaran sus cierres: informa, no resta (ver la cabecera). */
  let regM = 0;
  let regH = 0;
  let cierres = 0;
  for (const r of (fuentes || {}).cierres || []) {
    if (normLote(r.Lote) !== clave) continue;
    regM += ent(r.Machos);
    regH += ent(r.Hembras);
    cierres++;
  }
  const registradoFin = { ...par(regM, regH), cierres };
  const d = avisosPorSexo(libro, clave, 'diferencia-cierre');
  const diferencia = par(d.machos, d.hembras);
  const vivos = par(L.machos, L.hembras);
  const valores = { ingresados, muertos, descartes, diferencia, vivos };
  const resta = (s) => ingresados[s] - muertos[s] - descartes[s] - diferencia[s];
  const descuadre = { machos: resta('machos') - vivos.machos, hembras: resta('hembras') - vivos.hembras };
  descuadre.total = descuadre.machos + descuadre.hembras;
  return {
    lote: txt(L.lote), filas: CUADRE_FILAS.map((f) => ({ ...f, ...valores[f.id] })), ...valores,
    /* «De los cuales»: el desglose de Muertos por tipo de tanque. Sólo hembras: son las que salen a desovar. */
    deLosCuales: {
      desove: { entran: ent(L.mortDesove.entran), muertas: ent(L.mortDesove.muertas) },
      recuperacion: { entran: ent(L.mortRecuperacion.entran), muertas: ent(L.mortRecuperacion.muertas) },
    },
    registradoFin,
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
 *  de su sala.) Con el filtro vacío pasan todos. Se exporta para 📉 Tendencias (operativo.tendencias.js, 0f · 2b):
 *  «los lotes de lo filtrado» son los mismos que enseña la tabla de Lotes. */
export function loteEnFiltro(libro, clave, F) {
  const suyas = ((libro && libro.posiciones) || []).filter((p) => normLote(p.lote) === clave);
  if (!suyas.length) return !F.sala && F.tanque === null && !F.codigo && (!F.lote || F.lote === clave);
  return suyas.some((p) => posicionEnFiltro(p, F));
}

/**
 * La tabla maestra: una fila por lote que el libro conozca —vivos Y cerrados—, con sus cifras al cierre de la foto.
 * `dias` es la edad del lote: de su ingreso a la foto, o a su cierre si ya está cerrado.
 * 4 (2026-09-29, usuario) · `peso` { hembras, machos }, cada uno { valor, fecha }: el del ⚖️ Saldo al cierre de la foto
 * (`M.resumen` es `resumenMaduracion` a la fecha de la foto): el promedio de los tanques del lote en la última fecha con
 * peso. No se recalcula. Un lote sin ningún peso, o que el Saldo no lista (cerrado y a cero), va vacío.
 */
export function tablaDeLotes(M, F) {
  const libro = (M && M.libro) || { lotes: new Map(), posiciones: [], avisos: [] };
  const delSaldo = new Map(((M && M.resumen && M.resumen.lotes) || []).map((R) => [normLote(R.lote), R]));
  const pesoDe = (R, sexo) => (R && R[sexo] ? { valor: R[sexo].valor, fecha: R[sexo].fecha } : { valor: '', fecha: '' });
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
      peso: { hembras: pesoDe(delSaldo.get(clave), 'pesoHembras'), machos: pesoDe(delSaldo.get(clave), 'pesoMachos') },
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
 *  (lo deduce el libro), así que sólo entran los que nombran al lote: ingresos, cierres y mortalidad en desove.
 *  🆕 2026-09-26 (usuario) · UNO por día y tipo: un ingreso llega en varias filas —una por tanque— y la lista repetía
 *  «Ingreso» por cada una. Se suman sus animales y se dice de cuántas filas (y tanques) sale: `registros`, `tanques`. */
export function eventosDeLote(fuentes, lote, periodo) {
  const clave = normLote(lote);
  const grupos = new Map();
  const suma = (fecha, tipo, etiqueta, machos, hembras, r) => {
    const k = fecha + '|' + tipo + '|' + etiqueta;
    const e = grupos.get(k) || { fecha, tipo, etiqueta, machos: 0, hembras: 0, registros: 0, _tq: new Set() };
    e.machos += machos;
    e.hembras += hembras;
    e.registros++;
    if (txt(r.Tanque)) e._tq.add(txt(r.Sala) + '|' + txt(r.Tanque));
    grupos.set(k, e);
  };
  const mete = (clave2, tipo, etiqueta) => {
    for (const r of (fuentes || {})[clave2] || []) {
      if (normLote(r.Lote) !== clave) continue;
      const f = fechaDeFila(clave2, r);
      if (!enPeriodo(f, periodo)) continue;
      suma(f, tipo, etiqueta, ent(r.Machos), ent(r.Hembras), r);
    }
  };
  mete('ingresos', 'ingreso', 'Ingreso');
  mete('cierres', 'cierre', 'Fin de ciclo');
  for (const r of (fuentes || {}).mortDesove || []) {
    if (normLote(r.Lote) !== clave) continue;
    const f = fechaDeFila('mortDesove', r);
    if (!enPeriodo(f, periodo)) continue;
    suma(f, 'mortdes', 'Mortalidad en ' + (txt(r['Tipo de tanque']) || 'desove'), 0, ent(r['Hembras muertas']), r);
  }
  for (const r of (fuentes || {}).desoves || []) {
    if (normLote(r.Lote) !== clave) continue;
    const f = fechaDeFila('desoves', r);
    if (!enPeriodo(f, periodo)) continue;
    suma(f, 'desove', 'Desove', 0, 0, r);
  }
  return [...grupos.values()].map(({ _tq, ...e }) => ({ ...e, tanques: _tq.size })).sort((a, b) => porNombre(a.fecha, b.fecha));
}

/** La REPRODUCCIÓN del lote en el período: desoves, huevos, N2, N5 y fertilidad (eclosión sobre los huevos que
 *  llegaron a tener N2, como en el Saldo). ⚠ N5 NO se compara con N2: son recuentos de momentos distintos.
 *  3 (2026-10-01, usuario: «sale 2134,82 %») · la fertilidad y los huevos por desove, sólo de los desoves que traen sus
 *  huevos contados: casi ninguno los traía, y su N2 y sus desoves entraban sin sus huevos. */
export function reproduccionDeLote(fuentes, lote, periodo) {
  const clave = normLote(lote);
  // `noViables` entró con F4.2 (2026-09-21) para que 🥚 Reproducción no acumule lo mismo por su cuenta: dos
  // acumuladores sobre las mismas filas es como dos pantallas acaban diciendo cifras distintas de lo mismo.
  const A = { desoves: 0, huevos: 0, noViables: 0, n2: 0, n5: 0, huevosConN2: 0, n2ConHuevos: 0, desovesConHuevos: 0, desovesConN5: 0 };
  for (const r of (fuentes || {}).desoves || []) {
    if (normLote(r.Lote) !== clave) continue;
    if (!enPeriodo(fechaDeFila('desoves', r), periodo)) continue;
    const n2 = ent(r.N2);
    const n5 = ent(r.N5);
    A.desoves += ent(r.Desoves);
    A.huevos += ent(r['Total de huevos']);
    A.noViables += ent(r['Hembras no viables']);
    A.n2 += n2;
    A.n5 += n5;
    if (n2 > 0) A.huevosConN2 += ent(r['Total de huevos']);
    if (ent(r['Total de huevos']) > 0) {
      A.desovesConHuevos += ent(r.Desoves);
      if (n2 > 0) A.n2ConHuevos += n2;
    }
    if (n5 > 0) A.desovesConN5 += ent(r.Desoves);
  }
  return {
    ...A,
    huevosPorDesove: cociente(A.huevos, A.desovesConHuevos),
    fertilidad: cociente(A.n2ConHuevos, A.huevosConN2, 100),
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
export function promediosDeLote(M, lote, periodo, presencia = null) {
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
  /* Punto 2 (2026-10-04, usuario) · un peso tecleado a mano en 🍤 Alimentación cuenta como del tanque; el MISMO día manda
     Tanques (`pesosDeAlimentacion` ya lo quita). SÓLO el peso: esas filas no son partes. */
  for (const r of pesosDeAlimentacion((M.fuentes || {}).alimentacion, (M.fuentes || {}).tanques)) {
    const c = cuota.get(ubicKey(r.Sala, ent(r.Tanque)));
    if (!c || !enPeriodo(fechaDeFila('tanques', r), periodo)) continue;
    const pm = num(r['Peso promedio machos (g)']);
    const ph = num(r['Peso promedio hembras (g)']);
    if (pm !== null && c.machos > 0) { pmDen += c.machos; pmNum += c.machos * pm; }
    if (ph !== null && c.hembras > 0) { phDen += c.hembras; phNum += c.hembras * ph; }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  /* 🆕 2026-09-26 (usuario) · el % es POR DÍA, con la regla del ⚖️ Saldo (`tasaEnPartesDelLote`): antes se dividían las
     cópulas de TODO el período entre las hembras de la foto (327 % con datos reales). Sin la presencia diaria del
     libro no hay % que dar: vacío, no uno inventado. */
  const partes = presencia ? diasDeTanque((M.fuentes || {}).tanques) : [];
  const pct = (campo) => (presencia ? tasaEnPartesDelLote(partes, presencia, clave, periodo, campo).valor : '');
  return {
    pesoMachos: pmDen ? r2(pmNum / pmDen) : '', pesoHembras: phDen ? r2(phNum / phDen) : '',
    copulas: Math.round(copulas), muda: Math.round(muda),
    pctCopulas: pct('copulas'), pctMuda: pct('muda'),
    compartido, tanques: cuota.size,
  };
}

/** La ficha entera de un lote. Devuelve `null` si el libro no lo conoce.
 *  0f · 7 (2026-09-25, usuario) · con `ciclo` ({ desde, hasta }: su último ingreso → su cierre o la foto, la regla de
 *  `cicloDelLote`), la CURVA y los EVENTOS marcados sobre ella cubren esa vida —«desde la fecha del ingreso, no un mes
 *  antes»—; la serie tiene que cubrirla (la trae la vista). Reproducción y promedios siguen el PERÍODO. Sin ciclo, todo
 *  el período, como hasta ese día. */
export function fichaDeLote(M, serie, lote, periodo, ciclo = null, presencia = null) {
  const libro = (M && M.libro) || { lotes: new Map() };
  const L = loteDelLibro(libro, lote);
  if (!L) return null;
  const ctx = contextoDeLote(libro, normLote(lote));
  return {
    lote: txt(L.lote), estado: estadoDeLoteEntero(L, txt(M.fecha)), ingreso: txt(L.ingreso), cerrado: txt(L.cerrado),
    ...ctx,
    origen: origenDeLote(M.fuentes, lote),
    cuadre: cuadreDeLote(libro, M.fuentes, lote),
    curva: ciclo ? curvaDeLote(serie, lote).filter((d) => enPeriodo(d.fecha, ciclo)) : curvaDeLote(serie, lote),
    eventos: eventosDeLote(M.fuentes, lote, ciclo || periodo),
    ciclo: ciclo || null,
    reproduccion: reproduccionDeLote(M.fuentes, lote, periodo),
    promedios: promediosDeLote(M, lote, periodo, presencia),
  };
}

/* ── LA COMPARATIVA ─────────────────────────────────────────── */

/** Las tres agrupaciones del selector, en su orden. «lote» es la de por defecto. */
export const DIMENSIONES_COMPARATIVA = [
  { clave: 'lote', etiqueta: 'Lote' },
  { clave: 'codigo', etiqueta: 'Código genético' },
  { clave: 'piscina', etiqueta: 'Piscina de origen' },
];

/** 5 (2026-09-29, usuario) · cómo van las PAREJAS (un lote con dos códigos o dos piscinas) por código y por piscina. */
export const PAREJAS = ['juntas', 'separadas'];

/**
 * La comparativa. Por LOTE sale de la tabla maestra (para que las dos digan lo mismo).
 * 5 (2026-09-29, usuario) · por código genético y por piscina, de los MISMOS lotes y con las MISMAS reglas que por lote
 * (la tabla maestra con los filtros del tablero; ingresados y vivos al cierre de la foto; desoves, fertilidad y N5 del
 * período). Antes salía de `desempenoPorOrigen` sobre TODO el registro, sin filtros, y repartía cada fila por el texto
 * de su columna: el Ingreso trae los códigos sueltos y los Desoves la pareja («C1/C2», y no siempre igual), así que un
 * lote se partía en dos filas (medido: dos «A/B» con 0 animales y TODOS los desoves de sus lotes). Ahora cada dato va
 * con su LOTE, y el origen de un lote es el de su INGRESO. `parejas`: 'juntas' (por defecto) = cada lote ENTERO en la
 * fila de su combinación («A/B» si entró con dos): las cifras suman · 'separadas' = cada código o piscina con SUS
 * animales (los del Ingreso y los de sus posiciones) y los desoves del lote ENTEROS en cada uno, con `compartido`: esa
 * columna ya no suma (la regla de 0r·4 · H2, como el despacho en cada destino).
 * `mejor` y `peor` son por supervivencia, y sólo se dicen si hay al menos dos filas con la cifra.
 */
export function comparativa(M, F, periodo, dimension, parejas = 'juntas') {
  const dim = DIMENSIONES_COMPARATIVA.some((d) => d.clave === dimension) ? dimension : 'lote';
  const modo = PAREJAS.includes(parejas) ? parejas : 'juntas';
  let filas;
  if (dim === 'lote') {
    filas = tablaDeLotes(M, F).map((f) => ({
      origen: f.lote, lotes: [f.lote], ingresados: f.ingresados.total, vivos: f.vivos.total,
      // 2026-10-02 (usuario) · el ingreso por sexo, y la edad como rango (por lote, el de un solo valor).
      ingresoHembras: f.ingresados.hembras, ingresoMachos: f.ingresados.machos, diasMin: f.dias, diasMax: f.dias,
      supervivencia: f.supervivencia.total, dias: f.dias,
      ...reproduccionDeLote(M.fuentes, f.lote, periodo),
    }));
  } else {
    filas = comparativaPorOrigen(M, F, periodo, dim, modo);
  }
  const conCifra = filas.filter((f) => f.supervivencia !== '' && f.supervivencia !== null);
  const orden = [...conCifra].sort((a, b) => b.supervivencia - a.supervivencia);
  return {
    dimension: dim, parejas: modo, filas,
    mejor: orden.length > 1 ? orden[0].origen : '',
    peor: orden.length > 1 ? orden[orden.length - 1].origen : '',
  };
}

/** Los orígenes (códigos o piscinas) de cada lote según su INGRESO hasta la foto, con los animales de cada uno; y,
 *  por piscina, la piscina de cada código del lote (la que más animales aportó: sus posiciones no dicen piscina).
 *  La piscina, en su forma CANÓNICA (`normPiscina`, la de 📈 Piscinas de origen): «P 12» y «P12» son una. */
function origenesDeLotes(M, dim) {
  const foto = txt(M.fecha);
  const esCodigo = dim === 'codigo';
  const partes = (v) => (esCodigo ? normCodigoGenetico(v) : normPiscina(v)).split('/').map((s) => s.trim()).filter(Boolean);
  const out = new Map();
  const de = (l) => out.get(l) || (out.set(l, { origenes: new Set(), animales: new Map(), repartido: false, porCodigo: new Map(),
    machos: new Map(), hembras: new Map() }), out.get(l));
  for (const r of ((M.fuentes || {}).ingresos || [])) {
    if (fechaDeFila('ingresos', r) > foto) continue;
    const l = normLote(r.Lote);
    if (!l) continue;
    const L = de(l);
    const n = ent(r.Machos) + ent(r.Hembras);
    const os = partes(esCodigo ? r['Código genético'] : r['Piscina Broodstock']);
    if (os.length > 1) L.repartido = true;   // una fila del Ingreso con dos orígenes: sus animales, en cada uno
    for (const o of os) { L.origenes.add(o); L.animales.set(o, (L.animales.get(o) || 0) + n); }
    // 2026-10-02 (usuario) · y por sexo, con la misma regla (lo que entró por la fila de cada origen).
    for (const o of os) {
      L.machos.set(o, (L.machos.get(o) || 0) + ent(r.Machos));
      L.hembras.set(o, (L.hembras.get(o) || 0) + ent(r.Hembras));
    }
    if (!esCodigo) {
      const cg = normCodigoGenetico(r['Código genético']);
      const m = L.porCodigo.get(cg) || new Map();
      for (const o of os) m.set(o, (m.get(o) || 0) + n);
      L.porCodigo.set(cg, m);
    }
  }
  const mayor = (m) => [...(m || new Map()).entries()].sort((a, b) => b[1] - a[1] || porNombre(a[0], b[0])).map(([o]) => o)[0] || '';
  return { lotes: out, partes, piscinaDe: (L, cg) => mayor(L.porCodigo.get(normCodigoGenetico(cg))) || mayor(L.animales) };
}

function comparativaPorOrigen(M, F, periodo, dim, modo) {
  const O = origenesDeLotes(M, dim);
  const sinDato = dim === 'codigo' ? '(sin código)' : '(sin piscina)';
  const enFiltro = (o) => (dim === 'codigo' ? codigoEnFiltro(o, F) : !(F && F.piscina) || o === normPiscina(F.piscina));
  const acc = new Map();
  const de = (o) => acc.get(o) || (acc.set(o, { origen: o, lotes: new Set(), ingresados: 0, vivos: 0, desoves: 0, huevos: 0,
    n2: 0, n5: 0, huevosConN2: 0, n2ConHuevos: 0, desovesConN5: 0, compartido: false,
    ingresoMachos: 0, ingresoHembras: 0, edades: [] }), acc.get(o));
  const sumarReproduccion = (A, R) => { for (const k of ['desoves', 'huevos', 'n2', 'n5', 'huevosConN2', 'n2ConHuevos', 'desovesConN5']) A[k] += R[k]; };
  for (const f of tablaDeLotes(M, F)) {
    const clave = normLote(f.lote);
    const L = O.lotes.get(clave);
    const origenes = L && L.origenes.size ? [...L.origenes].sort(porNombre) : [];
    const R = reproduccionDeLote(M.fuentes, f.lote, periodo);
    if (modo === 'juntas' || !origenes.length) {
      const A = de(origenes.length ? origenes.join('/') : sinDato);
      A.lotes.add(f.lote);
      A.ingresados += f.ingresados.total;
      A.ingresoMachos += f.ingresados.machos;
      A.ingresoHembras += f.ingresados.hembras;
      A.edades.push(f.dias);
      A.vivos += f.vivos.total;
      sumarReproduccion(A, R);
      continue;
    }
    // «separadas»: SUS animales en cada origen; los vivos, por las posiciones del lote.
    const vivos = new Map();
    for (const p of ((M.libro || {}).posiciones || [])) {
      if (normLote(p.lote) !== clave) continue;
      const v = ent(p.machos) + ent(p.hembras);
      const os = dim === 'codigo' ? O.partes(p.codigoGenetico) : [O.piscinaDe(L, p.codigoGenetico)];
      for (const o of os) if (o) vivos.set(o, (vivos.get(o) || 0) + v);
    }
    for (const o of origenes) {
      if (!enFiltro(o)) continue;
      const A = de(o);
      A.lotes.add(f.lote);
      A.ingresados += L.animales.get(o) || 0;
      A.ingresoMachos += L.machos.get(o) || 0;
      A.ingresoHembras += L.hembras.get(o) || 0;
      A.edades.push(f.dias);
      A.vivos += vivos.get(o) || 0;
      sumarReproduccion(A, R);
      if (origenes.length > 1 || L.repartido) A.compartido = true;
    }
  }
  // (G, de «grupo»: con `A` la línea de la fertilidad copiaba la de `reproduccionDeLote`, ancla de un banco.)
  /* 2026-10-02 (usuario) · la EDAD de una fila con varios lotes es el RANGO de la de sus lotes (de su ingreso a la foto o
     a su cierre): ninguna cifra única sería la de todos. Hasta ese día salía vacía (`dias: ''`, que se queda). */
  const edad = (G, fn) => { const xs = G.edades.filter((d) => Number.isFinite(d)); return xs.length ? fn(...xs) : ''; };
  return [...acc.values()].sort((a, b) => porNombre(a.origen, b.origen)).map((G) => ({
    origen: G.origen, lotes: [...G.lotes].sort(porNombre), ingresados: G.ingresados, vivos: G.vivos,
    ingresoHembras: G.ingresoHembras, ingresoMachos: G.ingresoMachos, diasMin: edad(G, Math.min), diasMax: edad(G, Math.max),
    supervivencia: cociente(G.vivos, G.ingresados, 100), desoves: G.desoves, huevos: G.huevos, n2: G.n2, n5: G.n5,
    fertilidad: cociente(G.n2ConHuevos, G.huevosConN2, 100), naupliosPorHembra: G.desovesConN5 > 0 ? Math.round(G.n5 / G.desovesConN5) : '',
    compartido: G.compartido, dias: '',
  }));
}

/**
 * 5 (2026-09-29, usuario) · el DESEMPEÑO de cada piscina como origen, para 📈 Piscinas de origen: la comparativa por
 * piscina en «separadas» sobre TODO el registro hasta la foto y sin filtros (la piscina se enseña ENTERA). Una sola
 * regla para las dos pantallas. Map piscina canónica → fila de la comparativa.
 */
export function desempenoPorPiscina(M) {
  if (!M) return new Map();   // sin modelo (sin datos), nada: como `desempenoPorOrigen` antes
  const todo = { desde: '0000-01-01', hasta: txt(M.fecha) || '9999-12-31' };
  return new Map(comparativaPorOrigen(M, normalizarFiltro({}), todo, 'piscina', 'separadas').map((f) => [f.origen, f]));
}
