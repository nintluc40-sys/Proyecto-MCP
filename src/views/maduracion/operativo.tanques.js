/* ============================================================
   MADURACIÓN · OPERATIVO — TANQUES (F4.1, 2026-09-21)

   Lo que enseña la sub-vista «🛢 Tanques», con el diseño que aprobó el usuario el 2026-09-21 (tabla maestra +
   ficha debajo, como 🧬 Lotes): la tabla de todos los tanques OCUPADOS —composición, vivos, H:M, densidad, carga
   y actividad— y la ficha de uno: su composición, su curva de vivos, los PARTES DEL DÍA con su hora, la
   frecuencia de cada observación y los movimientos que entraron o salieron de él. Módulo PURO: ni DOM ni red.

   🔑 POR QUÉ ES UNA VISTA APARTE Y NO MÁS DE 🏠 SALAS. Salas responde «cómo va esta sala» —T° por hora, O₂,
   tratamientos— y su tabla de tanques es un resumen de apoyo. Aquí la unidad es el TANQUE y la pregunta es otra:
   qué le ha pasado a ÉSTE a lo largo del tiempo. Por eso nada de esto duplica a `detalleDeSala`: las cargas se
   toman del MISMO sitio que él (`M.resumen.lotes[].tanques[]`, para que dos pantallas no puedan divergir) y lo
   demás —partes con hora, frecuencia de observaciones, movimientos, curva— no existía.

   🔑 UN TANQUE PUEDE TENER VARIOS LOTES. El libro lo modela así (`composicion`), y el registro lo permite a
   propósito (🔗 Combinar). Por eso:
     · los «vivos» del tanque son la SUMA de sus lotes, y la composición se enseña siempre desglosada;
     · las cargas se SUMAN entre los lotes que comparten el tanque: el área y el volumen son del tanque, no del
       lote, así que la carga de cada lote por separado no dice cuán lleno está;
     · con filtro de lote, la tabla enseña los tanques DONDE ESE LOTE ESTÁ, pero sus cifras siguen siendo las del
       tanque entero —lo contrario diría «densidad 3/m²» de un tanque que está al doble—. La ficha lo rotula.

   ⚠ LOS PARTES NO SON EL LIBRO, y esta vista enseña las dos cosas sin mezclarlas. Un parte es lo que se REGISTRÓ
   en esa ronda (muertes, descartes, cópulas, muda, pesos); los vivos salen del LIBRO, que además sabe de
   ingresos, movimientos y cierres. Sumar partes para deducir vivos daría otra cifra y sería la equivocada.

   ⏳ Lo que aún no se puede contrastar con dato real (medido el 2026-09-21): `Maduración Movimientos` tiene CERO
   filas y los partes de `Maduración Tanques` son del 13 al 18 de agosto, fuera de la ventana de 30 días. El
   módulo se desarrolla con fixtures FICTICIOS y en pantalla saldrá vacío hasta que esas hojas se llenen; es lo
   correcto, y `medir-tablero-mad-real` lo dirá en su censo en vez de dar un verde sobre cero.
   ============================================================ */
import { normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { ubicKey } from '../registros/lib/mad-libro.js';
import { fechaDeFila } from './operativo.data.js';
import { proporcionHM, densidadTanque } from './operativo.indicadores.js';
import { posicionEnFiltro } from './operativo.tablero.js';
import { frecuenciaDeObservaciones } from './operativo.revisiones.js';

const txt = (v) => String(v == null ? '' : v).trim();
const ent = (v) => { const n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const numONulo = (v) => { const s = txt(v).replace(',', '.'); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(txt(s));
const enPeriodo = (f, p) => esIso(f) && (!p || (f >= p.desde && f <= p.hasta));
const porNombre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const r2 = (n) => Math.round(n * 100) / 100;

/** Las dos columnas de multiselección llegan como «A, B, C». Vacío o «—» no es una observación. */
function lista(v) {
  return txt(v).split(',').map((s) => s.trim()).filter((s) => s && s !== '—');
}

/* ── LA TABLA MAESTRA ──────────────────────────────────────── */

/** Las cargas del tanque, SUMADAS entre los lotes que lo comparten. Se leen del resumen —el mismo sitio del que
 *  las lee `detalleDeSala`— para que la tarjeta de la sala y esta tabla no puedan decir cosas distintas. */
export function cargasPorTanque(M) {
  const m = new Map();
  for (const L of ((M || {}).resumen || {}).lotes || []) {
    for (const t of L.tanques || []) {
      const k = ubicKey(t.sala, t.tanque);
      const o = m.get(k) || { cargaMetrica: '', cargaVolumetrica: '', area: t.area, volumen: t.volumen };
      const cm = numONulo(t.cargaMetrica);
      const cv = numONulo(t.cargaVolumetrica);
      if (cm !== null) o.cargaMetrica = r2((numONulo(o.cargaMetrica) || 0) + cm);
      if (cv !== null) o.cargaVolumetrica = r2((numONulo(o.cargaVolumetrica) || 0) + cv);
      m.set(k, o);
    }
  }
  return m;
}

/** Lo que los PARTES dicen de cada tanque en el período: rondas, bajas, cópulas, muda y los últimos pesos. */
export function actividadPorTanque(dias, periodo) {
  const m = new Map();
  for (const d of dias || []) {
    if (!enPeriodo(txt(d.fecha), periodo)) continue;
    const k = ubicKey(d.sala, d.tanque);
    const o = m.get(k) || { rondas: 0, dias: 0, muertes: 0, descartes: 0, copulas: 0, muda: 0,
      pesoMachos: '', pesoHembras: '', ultimoParte: '' };
    o.rondas += ent(d.partes);
    o.dias += 1;
    o.muertes += ent(d.machosMuertos) + ent(d.hembrasMuertas);
    o.descartes += ent(d.machosDescarte) + ent(d.hembrasDescarte);
    o.copulas += ent(d.copulas);
    o.muda += ent(d.muda);
    // Los pesos son el ÚLTIMO registrado, no un promedio del período: un peso viejo no dice cuánto pesa hoy.
    if (txt(d.fecha) >= txt(o.ultimoParte)) {
      o.ultimoParte = txt(d.fecha);
      if (d.pesoMachos !== '') o.pesoMachos = d.pesoMachos;
      if (d.pesoHembras !== '') o.pesoHembras = d.pesoHembras;
    }
    m.set(k, o);
  }
  return m;
}

/**
 * Una fila por tanque OCUPADO (los vacíos no tienen nada que contar; el mapa de 📊 Estado ya los enseña).
 * Con filtro de lote o código, quedan los tanques DONDE ESE LOTE ESTÁ, con las cifras del tanque entero.
 */
export function tablaDeTanques(M, periodo, F, dias) {
  const libro = (M && M.libro) || { tanques: new Map() };
  const cargas = cargasPorTanque(M);
  const actividad = actividadPorTanque(dias, periodo);
  const filas = [];
  for (const [k, T] of libro.tanques) {
    // Sólo las posiciones VIVAS: un tanque que cerró sigue en el libro con su composición a cero, y eso no es
    // un tanque ocupado. ⚠ Aquí había además un `if (!vivos.length) continue;` y se retiró: `dentro` es un
    // subconjunto de `vivos`, así que la guarda de abajo ya lo cubría. Lo delató el banco —la mutación que lo
    // borraba SOBREVIVÍA— y es la lección de siempre: una mutación viva puede significar que la regla sobra.
    const vivos = (T.composicion || []).filter((c) => ent(c.machos) > 0 || ent(c.hembras) > 0);
    // El filtro se aplica POSICIÓN a POSICIÓN, con el mismo juez que el resto del tablero.
    const dentro = vivos.filter((c) => posicionEnFiltro({ sala: T.sala, tanque: T.tanque, lote: c.lote, codigoGenetico: c.codigoGenetico,
      machos: ent(c.machos), hembras: ent(c.hembras) }, F));
    if (!dentro.length) continue;
    const machos = vivos.reduce((a, c) => a + ent(c.machos), 0);
    const hembras = vivos.reduce((a, c) => a + ent(c.hembras), 0);
    const c = cargas.get(k) || {};
    const a = actividad.get(k) || {};
    filas.push({
      sala: txt(T.sala), tanque: ent(T.tanque),
      lotes: vivos.map((x) => txt(x.lote)).filter((v, i, arr) => arr.indexOf(v) === i).sort(porNombre),
      compartido: vivos.length > 1,
      parcial: dentro.length !== vivos.length,   // el filtro deja fuera parte de lo que hay dentro
      vivos: { machos, hembras, total: machos + hembras },
      hm: proporcionHM(hembras, machos),
      densidad: densidadTanque(T.sala, T.tanque, machos, hembras),
      cargaMetrica: c.cargaMetrica === undefined ? '' : c.cargaMetrica,
      cargaVolumetrica: c.cargaVolumetrica === undefined ? '' : c.cargaVolumetrica,
      pesoMachos: a.pesoMachos === undefined ? '' : a.pesoMachos,
      pesoHembras: a.pesoHembras === undefined ? '' : a.pesoHembras,
      rondas: ent(a.rondas), diasConParte: ent(a.dias),
      muertes: ent(a.muertes), descartes: ent(a.descartes),
      ultimoParte: txt(a.ultimoParte),
    });
  }
  return filas.sort((x, y) => porNombre(x.sala, y.sala) || x.tanque - y.tanque);
}

/* ── LA FICHA DE UN TANQUE ─────────────────────────────────── */

/** La curva de vivos del tanque, de la serie que ya calculó el modelo (no se reconstruye ningún libro).
 *  Un día en que el tanque estaba vacío va en cero, que es lo que dice el libro. */
export function curvaDeTanque(serie, sala, tanque) {
  const k = ubicKey(sala, tanque);
  return (serie || []).map((d) => {
    const T = (d.porTanque || {})[k] || { machos: 0, hembras: 0 };
    return { fecha: txt(d.fecha), machos: ent(T.machos), hembras: ent(T.hembras), total: ent(T.machos) + ent(T.hembras) };
  });
}

/**
 * Los PARTES de un día, con su hora y su número de ronda. Es lo que la columna «Hora» hizo posible: hasta que
 * entró (2026-09-17) las rondas del día se fundían en una sola fila y el área sumaba a mano en un papel.
 * ⚠ Sin hora, la fila NO se inventa una: va al final, rotulada, que es lo que hace el resto del tablero.
 */
export function partesDelDia(fuentes, sala, tanque, fecha) {
  const S = txt(sala);
  const T = ent(tanque);
  const filas = ((fuentes || {}).tanques || []).filter((r) => txt(r.Sala) === S && ent(r.Tanque) === T
    && fechaDeFila('tanques', r) === txt(fecha));
  const conHora = [];
  const sinHora = [];
  for (const r of filas) {
    const o = {
      hora: txt(r.Hora), parte: ent(r.Parte),
      machosMuertos: ent(r['Machos muertos']), hembrasMuertas: ent(r['Hembras muertas']),
      machosDescarte: ent(r['Machos muertos por descarte de selección']),
      hembrasDescarte: ent(r['Hembras muertas por descarte de selección']),
      copulas: ent(r['Cópulas']), muda: ent(r.Muda),
      pesoMachos: numONulo(r['Peso promedio machos (g)']) === null ? '' : numONulo(r['Peso promedio machos (g)']),
      pesoHembras: numONulo(r['Peso promedio hembras (g)']) === null ? '' : numONulo(r['Peso promedio hembras (g)']),
      sanitarias: lista(r['Observaciones sanitarias']), operativas: lista(r['Observaciones operativas']),
    };
    (o.hora ? conHora : sinHora).push(o);
  }
  conHora.sort((a, b) => porNombre(a.hora, b.hora) || a.parte - b.parte);
  return { partes: conHora.concat(sinHora), sinHora: sinHora.length };
}

/** La frecuencia de observaciones de ESTE tanque. No se escribe otra: se REUSA la de 🔍 Revisiones (F3.2),
 *  que ya filtra por sala y tanque; aquí sólo se le fija el tanque. Dos funciones con el mismo nombre contando
 *  parecido es exactamente como dos pantallas acaban diciendo cifras distintas de lo mismo.
 *  ⚠ Su unidad es el DÍA con parte, no el parte suelto: `diasDeTanque` ya unifica las observaciones del día
 *  (una observación marcada en las cinco rondas de un día cuenta una vez). */
export function observacionesDeTanque(dias, sala, tanque, periodo, F) {
  return frecuenciaDeObservaciones(dias, { ...(F || {}), sala: txt(sala), tanque: ent(tanque) }, periodo);
}

/** Los movimientos que ENTRARON o SALIERON de este tanque, en orden. Un traslado interno aparece en los dos. */
export function movimientosDeTanque(fuentes, sala, tanque, periodo) {
  const S = txt(sala);
  const T = ent(tanque);
  const out = [];
  for (const r of ((fuentes || {}).movimientos || [])) {
    const f = fechaDeFila('movimientos', r);
    if (!enPeriodo(f, periodo)) continue;
    const sale = txt(r['Sala origen']) === S && ent(r['Tanque origen']) === T;
    const entra = txt(r['Sala destino']) === S && ent(r['Tanque destino']) === T;
    if (!sale && !entra) continue;
    out.push({
      fecha: f, sentido: sale && entra ? 'interno' : sale ? 'sale' : 'entra',
      tipo: txt(r.Tipo), motivo: txt(r.Motivo),
      machos: ent(r.Machos), hembras: ent(r.Hembras), total: ent(r.Machos) + ent(r.Hembras),
      origen: { sala: txt(r['Sala origen']), tanque: ent(r['Tanque origen']) },
      destino: { sala: txt(r['Sala destino']), tanque: ent(r['Tanque destino']) },
      agua: txt(r['Agua destino']),
    });
  }
  return out.sort((a, b) => porNombre(a.fecha, b.fecha));
}

/** La ficha entera de un tanque. `serie` y `dias` los calcula el modelo una vez y se pasan: no se recalculan aquí. */
export function fichaDeTanque(M, serie, sala, tanque, periodo, F, dias) {
  const S = txt(sala);
  const T = ent(tanque);
  const libro = (M && M.libro) || { tanques: new Map() };
  const tq = libro.tanques.get(ubicKey(S, T));
  const vivos = ((tq && tq.composicion) || []).filter((c) => ent(c.machos) > 0 || ent(c.hembras) > 0);
  const machos = vivos.reduce((a, c) => a + ent(c.machos), 0);
  const hembras = vivos.reduce((a, c) => a + ent(c.hembras), 0);
  const c = cargasPorTanque(M).get(ubicKey(S, T)) || {};
  return {
    sala: S, tanque: T, existe: !!tq,
    composicion: vivos.map((x) => ({
      lote: txt(x.lote), codigoGenetico: normCodigoGenetico(x.codigoGenetico),
      machos: ent(x.machos), hembras: ent(x.hembras), total: ent(x.machos) + ent(x.hembras),
      enFiltro: posicionEnFiltro({ sala: S, tanque: T, lote: x.lote, codigoGenetico: x.codigoGenetico,
        machos: ent(x.machos), hembras: ent(x.hembras) }, F),
    })).sort((a, b) => porNombre(a.lote, b.lote)),
    compartido: vivos.length > 1,
    vivos: { machos, hembras, total: machos + hembras },
    hm: proporcionHM(hembras, machos),
    densidad: densidadTanque(S, T, machos, hembras),
    area: c.area === undefined ? '' : c.area,
    volumen: c.volumen === undefined ? '' : c.volumen,
    cargaMetrica: c.cargaMetrica === undefined ? '' : c.cargaMetrica,
    cargaVolumetrica: c.cargaVolumetrica === undefined ? '' : c.cargaVolumetrica,
    curva: curvaDeTanque(serie, S, T),
    /* ⚠ «Los partes de hoy» son los del día de la FOTO, y con el retraso normal del registro ese día suele
       estar vacío. Por eso va también la fecha del ÚLTIMO parte: sin ella la sección sería un callejón que
       dice «no hay» sin decir dónde mirar. */
    hoy: { ...partesDelDia((M || {}).fuentes, S, T, (M || {}).fecha), fecha: txt((M || {}).fecha) },
    ultimoParte: txt((actividadPorTanque(dias, periodo).get(ubicKey(S, T)) || {}).ultimoParte),
    observaciones: observacionesDeTanque(dias, S, T, periodo, F),
    movimientos: movimientosDeTanque((M || {}).fuentes, S, T, periodo),
  };
}

/** Lo que el filtro de LOTE no puede decidir aquí, para que la vista lo rotule en vez de callarlo. */
export function avisosDeTanques(F) {
  const a = [];
  if (F && (F.lote || F.codigo)) {
    a.push('Las cifras son las del TANQUE ENTERO, incluidos los lotes que el filtro deja fuera: el área y el '
      + 'volumen son del tanque, no del lote.');
  }
  return a;
}
