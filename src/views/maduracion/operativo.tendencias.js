/* ============================================================
   MADURACIÓN · OPERATIVO — TENDENCIAS y PERMANENCIA (0f · 2b, 2026-09-25)

   Las alertas NUEVAS de la tarjeta «⚠️ Alertas» de 📊 Estado actual, con el diseño que aprobó el usuario el
   2026-09-25: dos bloques dentro de la misma tarjeta, cuyo total los cuenta —«📉 Tendencias», lo que baja o sube
   frente al período ANTERIOR de igual duración, y «⏳ Permanencia», los lotes con más de 60 días en producción, con
   su piscina y su código genético—. Módulo PURO: ni DOM ni red; la vista sólo pinta lo que sale de aquí.

   Las reglas (decisiones del usuario, 2026-09-25; los umbrales viven en `UMBRALES_DE_AVISO`, «fuente: usuario»):
   · Se compara el período ELEGIDO con el anterior de igual duración: con «7 d», los 7 días de antes. Con «Todo» o
     «Ciclo» el anterior cae antes del primer registro, y entonces no avisa nada.
   · Avisa un cambio del 20 % o más, y sólo con datos suficientes: 3 registros en el período ANTERIOR para lo que
     BAJA —una sala que pasa de 14 desoves a 0 sí avisa— y en los DOS para lo que SUBE, porque sin partes no se ven
     las bajas. Sin base (un cero en el anterior) no hay porcentaje que medir, y no avisa. Un cociente sin
     denominador tampoco es un cero: si el período no tiene con qué dividir, no hay cifra que comparar.
   · NAUPLIOS: el N5 por desove de los desoves que YA tienen su N5 (la regla del ⚖️ Saldo). El total de N5 bajaría
     siempre, por los desoves recientes que aún no lo tienen contado. Dice, además, qué lotes bajan.
   · PRODUCCIÓN DE UNA SALA: los desoves de los lotes que estuvieron en ella ese día —al cierre de la víspera o del
     propio día, según el libro—. Cuentan ENTEROS en cada sala donde estaba el lote, sin repartir, como el despacho
     (operativo.reproduccion.js): un desove es de un lote y un código, y la hoja no dice de qué sala salieron sus
     hembras.
   · MORTALIDAD DE UNA SALA: las muertes registradas en sus partes de Tanques, POR TANQUE Y DÍA (cada parte es un
     tanque un día). 🔑 No la suma a secas: medido con los datos reales el 2026-09-25, los partes llegan con días de
     retraso y las salas se llenan por tandas, así que la suma de dos períodos comparaba también cuántos partes había
     en cada uno —con «30 d» y con «Mes» avisaba de dos salas que sólo tenían más partes; la de «Mes», recién
     llenada, diez veces más—.
   · REPRODUCCIÓN DE UN LOTE: el % de cópulas, los huevos por desove y la fertilidad (N2); el N5 va en la de nauplios.
     Las cópulas, con la regla del Saldo (H1 de mad-resumen.js): un parte es del lote si ese día el tanque lo tenía
     según el libro al cierre de ese día, y el % es cópulas ÷ hembras de esos tanques. Sumado sobre los partes del
     período, un día sin parte no cuenta ni arriba ni abajo. Por lo mismo que la mortalidad, NO se usa el % de
     `promediosDeLote`, que divide las cópulas de todo el período entre las hembras de la foto: medido el mismo día,
     con cuatro días de partes aún sin registrar, tres lotes «bajaban» con «7 d» sin que nada hubiera ido peor.
   · PERMANENCIA: los días en producción de cada sala son los del ⚖️ Saldo (`M.resumen.lotes[].dias`, los mismos que
     enseñan las tarjetas de 🏠 Salas), con la regla del libro: la producción empieza con la primera cópula o a los
     15 días del ingreso, lo que llegue antes.
   · LO FILTRADO: los lotes, con la regla de la tabla de Lotes (`loteEnFiltro`, al cierre de la foto); las salas, con
     la de las alertas de ambiente (`salasEnAlcance`). Un desove no es de un tanque: con tanque elegido, la producción
     es la de su sala. Los partes no dicen el código genético: con ese filtro, las cópulas no se comparan.
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { construirLibro, sumarDias, ubicKey, ESTADO_PRODUCCION } from '../registros/lib/mad-libro.js';
import { fechaDeFila } from './operativo.data.js';
import { cociente } from './operativo.indicadores.js';
import { posicionEnFiltro, salasEnAlcance } from './operativo.tablero.js';
import { loteEnFiltro, origenDeLote } from './operativo.lotes.js';
import { UMBRALES_DE_AVISO } from './operativo.umbrales.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const fecha10 = (v) => txt(v).slice(0, 10);
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const num = (v) => {
  const t = txt(v);
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const ent = (v) => { const n = num(v); return n !== null && n > 0 ? n : 0; };
const enPeriodo = (f, p) => esIso(f) && f >= p.desde && f <= p.hasta;
const vivo = (p) => ent(p.machos) > 0 || ent(p.hembras) > 0;
const fechaDesove = (r) => fecha10(fechaDeFila('desoves', r));

/* ── EL PERÍODO ANTERIOR Y EL CAMBIO ────────────────────────── */

/** El período de IGUAL duración que termina la víspera del elegido; null si el elegido no tiene fechas. */
export function periodoAnterior(p) {
  const dias = Number((p || {}).dias);
  if (!esIso(txt((p || {}).desde)) || !(dias >= 1)) return null;
  return { clave: p.clave, desde: sumarDias(p.desde, -dias), hasta: sumarDias(p.desde, -1), dias };
}

/** El cambio de `antes` a `ahora`, en % con un decimal; null SIN BASE (`antes` no es una cifra positiva) o sin
 *  `ahora`. Un cociente vacío ('') no es una cifra: es «no hay con qué dividir», y no se compara. */
export function cambioPct(antes, ahora) {
  if (typeof antes !== 'number' || typeof ahora !== 'number' || !(antes > 0) || !Number.isFinite(ahora)) return null;
  return Math.round(((ahora - antes) / antes) * 1000) / 10;
}

/* ── LA PRESENCIA, DÍA A DÍA ────────────────────────────────── */

/** Los tanques con animales al cierre de un día —sus vivos, su sala y los lotes (canónicos) que tienen dentro— y los
 *  lotes de cada sala. Se COPIA: el gancho entrega el libro vivo. */
function fotoDeTanques(posiciones) {
  const tanques = new Map();
  for (const p of posiciones.values()) {
    if (!vivo(p)) continue;
    const uk = ubicKey(p.sala, p.tanque);
    const T = tanques.get(uk) || { sala: txt(p.sala), machos: 0, hembras: 0, lotes: new Set() };
    T.machos += ent(p.machos);
    T.hembras += ent(p.hembras);
    T.lotes.add(normLote(p.lote));
    tanques.set(uk, T);
  }
  const salas = new Map();
  for (const T of tanques.values()) {
    if (!salas.has(T.sala)) salas.set(T.sala, new Set());
    for (const l of T.lotes) salas.get(T.sala).add(l);
  }
  return { tanques, salas };
}

/**
 * Lo que tenía el libro al CIERRE de cada día de `desde` a `hasta`: los tanques con animales y los lotes de cada sala.
 * En UNA pasada, con el gancho `alCerrarDia` —como `serieDiaria`, y por lo mismo: reconstruir el libro día a día
 * costaría un libro por día—. Un día sin eventos repite el cierre del anterior. Es lo que necesitan las dos reglas de
 * presencia de la cabecera: la de la producción (víspera o el propio día) y la de las cópulas (el propio día).
 */
export function presenciaDiaria(fuentes, desde, hasta) {
  let previa = { tanques: new Map(), salas: new Map() };
  const cierres = [];
  construirLibro(fuentes || {}, { hoy: hasta, hasta, alCerrarDia: (fecha, { posiciones }) => {
    if (!esIso(fecha)) return;
    if (fecha < desde) previa = fotoDeTanques(posiciones);
    else cierres.push([fecha, fotoDeTanques(posiciones)]);
  } });
  const out = new Map();
  let i = 0;
  let foto = previa;
  for (let d = desde; esIso(d) && d <= hasta; d = sumarDias(d, 1)) {
    while (i < cierres.length && cierres[i][0] <= d) foto = cierres[i++][1];
    out.set(d, foto);
  }
  return out;
}

/** Las salas en las que cuenta un desove del lote `clave` del día `fecha`: aquellas donde el lote tenía animales al
 *  cierre de la VÍSPERA o del PROPIO día. Un lote que se mudó ese día cuenta en las dos; uno que cerró ese día, en la
 *  suya; uno que llegó ese día, en la nueva. */
export function salasDelDesove(presencia, clave, fecha) {
  const out = new Set();
  for (const f of [sumarDias(fecha, -1), fecha]) {
    const foto = presencia && presencia.get(f);
    if (!foto) continue;
    for (const [sala, lotes] of foto.salas) if (lotes.has(clave)) out.add(sala);
  }
  return [...out].sort(porNombre);
}

/* ── LOS DESOVES ────────────────────────────────────────────── */

/** Lo que se compara de un montón de desoves, con las reglas del ⚖️ Saldo —las de `reproduccionDeLote` y
 *  `kpiReproduccion`: la fertilidad sólo sobre los huevos que ya tienen su N2 y el N5 sólo sobre los desoves que ya
 *  tienen el suyo— y cuántas FILAS trae cada cifra, que es lo que cuenta para el mínimo de registros. */
export function acumularDesoves(filas) {
  const A = { filas: 0, desoves: 0, huevos: 0, n2: 0, n5: 0, huevosConN2: 0, desovesConN5: 0, conDesoves: 0, conN2: 0, conN5: 0 };
  for (const r of filas || []) {
    const d = ent(r.Desoves);
    const h = ent(r['Total de huevos']);
    const n2 = ent(r.N2);
    const n5 = ent(r.N5);
    A.filas++;
    A.desoves += d;
    A.huevos += h;
    A.n2 += n2;
    A.n5 += n5;
    if (d > 0) A.conDesoves++;
    if (n2 > 0) { A.huevosConN2 += h; A.conN2++; }
    if (n5 > 0) { A.desovesConN5 += d; A.conN5++; }
  }
  return {
    ...A,
    huevosPorDesove: cociente(A.huevos, A.desoves),
    fertilidad: cociente(A.n2, A.huevosConN2, 100),
    n5PorDesove: cociente(A.n5, A.desovesConN5),
  };
}

/** Las filas de Desoves de un período que son de lo filtrado: su lote pasa el filtro y, con código elegido, son de
 *  ese código. */
function desovesDelPeriodo(M, F, p, enAlcance) {
  return ((M.fuentes || {}).desoves || []).filter((r) => {
    if (!enPeriodo(fechaDesove(r), p)) return false;
    const clave = normLote(r.Lote);
    if (!clave || !enAlcance(clave)) return false;
    return !F.codigo || normCodigoGenetico(r['Código genético']) === F.codigo;
  });
}

function porLote(filas) {
  const m = new Map();
  for (const r of filas) {
    const k = normLote(r.Lote);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/* ── LAS TENDENCIAS ─────────────────────────────────────────── */

/** Los parámetros de reproducción por lote que vigila la alerta, en su orden y con su rótulo (las cópulas se enseñan
 *  como su %: «cópulas 12 % → 8 %»). */
export const PARAMETROS_REPRODUCCION = [
  { id: 'copulas', etiqueta: 'cópulas' },
  { id: 'huevosPorDesove', etiqueta: 'huevos por desove' },
  { id: 'fertilidad', etiqueta: 'fertilidad' },
];

/**
 * 📉 Las tendencias del período frente al anterior. `partes`: los de `diasDeTanque`. `presencia`: la de
 * `presenciaDiaria` desde la víspera del período anterior hasta el final del elegido (si falta, se calcula aquí; la
 * vista la guarda para no recalcularla en cada pintada).
 * Devuelve lo que avisa, ya filtrado por los umbrales: `nauplios` (null si no baja nada), y las listas `produccion`
 * (salas que producen menos), `mortalidad` (salas con más) y `reproduccion` (lotes con algún parámetro que baja).
 * `total` es cuántas líneas de aviso salen.
 */
export function tendencias(M, periodo, F, partes, presencia) {
  const anterior = periodoAnterior(periodo);
  const out = { anterior, nauplios: null, produccion: [], mortalidad: [], reproduccion: [], total: 0 };
  if (!anterior || !M || !M.libro) return out;
  const CAMBIO = UMBRALES_DE_AVISO.cambio.valor;
  const MINIMO = UMBRALES_DE_AVISO.registros.valor;
  const pres = presencia || presenciaDiaria(M.fuentes, sumarDias(anterior.desde, -1), periodo.hasta);
  const alcance = new Map();
  const enAlcance = (clave) => {
    if (!alcance.has(clave)) alcance.set(clave, loteEnFiltro(M.libro, clave, F));
    return alcance.get(clave);
  };
  /* Lo que BAJA: el mínimo, en el anterior. Lo que SUBE: en los dos. Devuelven el cambio si avisa; si no, null. */
  const baja = (antes, ahora, registrosAntes) => {
    const c = cambioPct(antes, ahora);
    return registrosAntes >= MINIMO && c !== null && c <= -CAMBIO ? c : null;
  };
  const sube = (antes, ahora, registrosAntes, registrosAhora) => {
    const c = cambioPct(antes, ahora);
    return registrosAntes >= MINIMO && registrosAhora >= MINIMO && c !== null && c >= CAMBIO ? c : null;
  };
  /* El lote tal como se tecleó, para enseñarlo: el del libro y, si el libro no lo tiene, el de su primer desove. */
  const nombres = new Map();
  for (const k of (M.libro.lotes || new Map()).keys()) if (!nombres.has(normLote(k))) nombres.set(normLote(k), txt(k));
  const nombre = (clave) => nombres.get(clave) || clave;

  const D = { antes: desovesDelPeriodo(M, F, anterior, enAlcance), ahora: desovesDelPeriodo(M, F, periodo, enAlcance) };
  for (const r of [...D.antes, ...D.ahora]) if (!nombres.has(normLote(r.Lote))) nombres.set(normLote(r.Lote), txt(r.Lote));
  const LA = porLote(D.antes);
  const LH = porLote(D.ahora);
  const lotesDesove = [...new Set([...LA.keys(), ...LH.keys()])];
  const acum = new Map(lotesDesove.map((k) => [k, { antes: acumularDesoves(LA.get(k) || []), ahora: acumularDesoves(LH.get(k) || []) }]));

  /* 🦐 NAUPLIOS · el N5 por desove de todo lo filtrado, y el de cada lote. */
  const T = { antes: acumularDesoves(D.antes), ahora: acumularDesoves(D.ahora) };
  const lotesN5 = [];
  for (const [k, x] of acum) {
    const c = baja(x.antes.n5PorDesove, x.ahora.n5PorDesove, x.antes.conN5);
    if (c !== null) lotesN5.push({ lote: nombre(k), antes: x.antes.n5PorDesove, ahora: x.ahora.n5PorDesove, cambio: c });
  }
  const cN5 = baja(T.antes.n5PorDesove, T.ahora.n5PorDesove, T.antes.conN5);
  /* Una sola línea: la de todo lo filtrado si baja (`cambio`), con los lotes que bajan; o sólo esos lotes, si el
     conjunto no baja lo bastante (`cambio` null) pero alguno sí. */
  if (cN5 !== null || lotesN5.length) {
    out.nauplios = { antes: T.antes.n5PorDesove, ahora: T.ahora.n5PorDesove, cambio: cN5,
      lotes: lotesN5.sort((a, b) => a.cambio - b.cambio || porNombre(a.lote, b.lote)) };
  }

  /* 🥚 PRODUCCIÓN DE CADA SALA · los desoves de los lotes que estuvieron en ella ese día, enteros en cada sala. */
  const salas = salasEnAlcance(M.libro, F);
  const salasDe = new Map([...D.antes, ...D.ahora].map((r) => [r, salasDelDesove(pres, normLote(r.Lote), fechaDesove(r))]));
  for (const sala of salas) {
    const a = D.antes.filter((r) => salasDe.get(r).includes(sala));
    const h = D.ahora.filter((r) => salasDe.get(r).includes(sala));
    const va = a.reduce((s, r) => s + ent(r.Desoves), 0);
    const vh = h.reduce((s, r) => s + ent(r.Desoves), 0);
    const c = baja(va, vh, a.length);
    if (c !== null) out.produccion.push({ sala, antes: va, ahora: vh, cambio: c });
  }

  /* 💀 MORTALIDAD DE CADA SALA · muertes registradas por tanque y día; con tanque elegido, las de ese tanque. */
  const partesDe = (p, sala) => (partes || []).filter((d) => d.sala === sala && (F.tanque === null || d.tanque === F.tanque) && enPeriodo(d.fecha, p));
  const bajas = (lista) => lista.reduce((s, d) => s + ent(d.machosMuertos) + ent(d.hembrasMuertas), 0);
  for (const sala of salas) {
    const a = partesDe(anterior, sala);
    const h = partesDe(periodo, sala);
    const va = cociente(bajas(a), a.length);
    const vh = cociente(bajas(h), h.length);
    const c = sube(va, vh, a.length, h.length);
    if (c !== null) out.mortalidad.push({ sala, antes: va, ahora: vh, cambio: c, bajas: { antes: bajas(a), ahora: bajas(h) }, partes: { antes: a.length, ahora: h.length } });
  }

  /* 🧬 REPRODUCCIÓN DE CADA LOTE · % de cópulas (regla del Saldo, sobre los partes del lote), huevos por desove y
     fertilidad. Entran los lotes de lo filtrado que tienen desoves o partes en alguno de los dos períodos. */
  const copulasDe = (clave, p) => {
    let copulas = 0;
    let hembras = 0;
    let n = 0;
    for (const d of partes || []) {
      if (!enPeriodo(d.fecha, p)) continue;
      const foto = pres.get(d.fecha);
      const Tq = foto && foto.tanques.get(ubicKey(d.sala, d.tanque));
      if (!Tq || !Tq.lotes.has(clave) || !(Tq.hembras > 0)) continue;
      copulas += ent(d.copulas);
      hembras += Tq.hembras;
      n++;
    }
    return { valor: cociente(copulas, hembras, 100), registros: n };
  };
  const candidatos = new Set(lotesDesove);
  if (!F.codigo) {
    for (const d of partes || []) {
      if (!enPeriodo(d.fecha, anterior) && !enPeriodo(d.fecha, periodo)) continue;
      const foto = pres.get(d.fecha);
      const Tq = foto && foto.tanques.get(ubicKey(d.sala, d.tanque));
      if (Tq) for (const l of Tq.lotes) if (enAlcance(l)) candidatos.add(l);
    }
  }
  for (const k of candidatos) {
    const parametros = [];
    if (!F.codigo) {
      const a = copulasDe(k, anterior);
      const h = copulasDe(k, periodo);
      const c = baja(a.valor, h.valor, a.registros);
      if (c !== null) parametros.push({ id: 'copulas', antes: a.valor, ahora: h.valor, cambio: c });
    }
    const x = acum.get(k);
    if (x) {
      const cH = baja(x.antes.huevosPorDesove, x.ahora.huevosPorDesove, x.antes.conDesoves);
      if (cH !== null) parametros.push({ id: 'huevosPorDesove', antes: x.antes.huevosPorDesove, ahora: x.ahora.huevosPorDesove, cambio: cH });
      const cF = baja(x.antes.fertilidad, x.ahora.fertilidad, x.antes.conN2);
      if (cF !== null) parametros.push({ id: 'fertilidad', antes: x.antes.fertilidad, ahora: x.ahora.fertilidad, cambio: cF });
    }
    if (parametros.length) out.reproduccion.push({ lote: nombre(k), parametros });
  }

  out.produccion.sort((a, b) => a.cambio - b.cambio || porNombre(a.sala, b.sala));
  out.mortalidad.sort((a, b) => b.cambio - a.cambio || porNombre(a.sala, b.sala));
  out.reproduccion.sort((a, b) => porNombre(a.lote, b.lote));
  out.total = (out.nauplios ? 1 : 0) + out.produccion.length + out.mortalidad.length + out.reproduccion.length;
  return out;
}

/* ── LA PERMANENCIA ─────────────────────────────────────────── */

/**
 * ⏳ Los lotes con MÁS de 60 días en producción (`UMBRALES_DE_AVISO.produccion`) en alguna sala donde les quedan
 * animales de lo filtrado, con sus días en cada una (los del ⚖️ Saldo), la piscina de la que entraron (su Ingreso) y
 * los códigos genéticos de los animales de esas salas. El que más lleva, primero.
 */
export function permanencia(M, F) {
  const limite = UMBRALES_DE_AVISO.produccion.valor;
  const posiciones = ((M && M.libro) || {}).posiciones || [];
  const out = [];
  for (const L of ((M && M.resumen) || {}).lotes || []) {
    const clave = normLote(L.lote);
    const suyas = posiciones.filter((p) => normLote(p.lote) === clave && vivo(p) && posicionEnFiltro(p, F));
    const salas = (L.dias || [])
      .filter((d) => d.estado === ESTADO_PRODUCCION && Number(d.diasProduccion) > limite && suyas.some((p) => p.sala === d.sala))
      .map((d) => ({ sala: d.sala, dias: Number(d.diasProduccion) }))
      .sort((a, b) => b.dias - a.dias || porNombre(a.sala, b.sala));
    if (!salas.length) continue;
    const enEsas = suyas.filter((p) => salas.some((s) => s.sala === p.sala));
    out.push({
      lote: txt(L.lote), dias: salas[0].dias, salas,
      piscinas: [...new Set(origenDeLote(M.fuentes, clave).map((o) => o.piscina).filter(Boolean))].sort(porNombre),
      codigos: [...new Set(enEsas.map((p) => txt(p.codigoGenetico)).filter(Boolean))].sort(porNombre),
    });
  }
  return out.sort((a, b) => b.dias - a.dias || porNombre(a.lote, b.lote));
}
