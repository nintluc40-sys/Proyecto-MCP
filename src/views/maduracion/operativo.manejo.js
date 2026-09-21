/* ============================================================
   MADURACIÓN · OPERATIVO — MANEJO (F5.1, 2026-09-21)

   Lo que enseña la sub-vista «🔄 Manejo», con el diseño que aprobó el usuario el 2026-09-21: una sola sub-vista
   con TRES bloques, porque los tres responden la misma pregunta —qué se le HACE a la planta, frente a qué le
   pasa— y comparten los mismos filtros. Módulo PURO: ni DOM ni red.

     🔄 MOVIMIENTOS   la matriz sala → sala, los totales por motivo, tipo y agua, y el registro debajo.
     🦐 ALIMENTACIÓN  los kg de cada producto y su % de la biomasa, CONTRA la agenda estándar de 14 tomas.
     🧪 TRATAMIENTOS  el calendario sala × día, los productos por área y la cobertura preventiva por lote.

   🔑🔑 LA ALIMENTACIÓN ES LA RACIÓN PLANIFICADA, NO LO SERVIDO, y todo lo que salga de aquí va rotulado así.
   La ficha calcula la ración del día a partir de la biomasa y unos porcentajes; nadie registra lo que el animal
   comió. Llamarla «consumo» —o compararla con un crecimiento— sería inventar una medición que no existe.

   🔑 EL % DE LA BIOMASA ES EL ÚNICO UMBRAL DE ESTE TABLERO CON FUENTE PROPIA: 0,25 a 2 % por toma, de la
   propia ficha de Alimentación (`MAD_ALIM_PCT_MIN`/`MAX`). Los demás esperan al laboratorio. Por eso aquí sí se
   juzga, y con esa fuente dicha.
   🔑🔑 Y SE JUZGA POR TOMA, como en la ficha: cada toma que de verdad se planificó —la columna «Tomas» de la fila,
   leída con el MISMO intérprete que la ficha—, una vez por sala y día. La primera versión (2026-09-21) lo aplicaba
   al % DIARIO de cada producto, y con la agenda estándar Calamar (cuatro tomas de 1,5–2 %, 7 % al día) y Krill
   (4,5 %) salían «fuera de rango» siguiendo la ración al pie de la letra: una alarma sobre lo correcto.

   ⚠ EL FILTRO NO LLEGA IGUAL A LOS TRES, y se dice en vez de callarlo:
     · Movimientos tiene DOS ubicaciones (origen y destino): una fila entra si CUALQUIERA de las dos pasa el
       filtro, porque el movimiento le ocurrió a las dos.
     · Tratamientos no tiene tanque —se aplican por sala y área—, así que el filtro de tanque no se puede
       aplicar: se devuelve en `ignora`.
     · Alimentación sí tiene sala y tanque, pero sus «Lotes» son un texto con varios: el filtro de lote mira si
       ese lote aparece, no si es el único.

   ⏳ Sin dato real: las TRES hojas tienen CERO filas (medido el 2026-09-21). Fixtures ficticios, y en pantalla
   vacío hasta que se estrenen; el censo de `medir-tablero-mad-real` lo dirá en crudo.
   ============================================================ */
import { MAD_MOV_MOTIVOS, MAD_MOV_TIPOS } from '../registros/lib/ficha-maduracion-movimientos.schema.js';
import {
  MAD_ALIM_PRODUCTOS, MAD_ALIM_TOMAS_ESTANDAR, MAD_ALIM_PCT_MIN, MAD_ALIM_PCT_MAX,
  alimTomasDesdeTexto, alimTomasActivas,
} from '../registros/lib/ficha-maduracion-alimentacion.schema.js';
import { MAD_TRAT_AREAS, MAD_TRAT_PREVENTIVOS } from '../registros/lib/ficha-maduracion-tratamientos.schema.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { sumarDias, ubicKey } from '../registros/lib/mad-libro.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';
import { fechaDeFila } from './operativo.data.js';
import { cociente } from './operativo.indicadores.js';

const txt = (v) => String(v == null ? '' : v).trim();
const ent = (v) => { const n = Number(txt(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const num = (v) => { const n = Number(txt(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(txt(s));
const enPeriodo = (f, p) => esIso(f) && (!p || (f >= p.desde && f <= p.hasta));
const porNombre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
/** Una celda de multiselección («A, B, C»). Vacío o «—» no es nada. */
const lista = (v) => txt(v).split(',').map((s) => s.trim()).filter((s) => s && s !== '—');

/* ── 🔄 MOVIMIENTOS ────────────────────────────────────────── */

/** Un movimiento le ocurre a DOS ubicaciones: entra si cualquiera de las dos pasa el filtro. */
function movEnFiltro(r, F) {
  if (!F) return true;
  const lados = [
    { sala: txt(r['Sala origen']), tanque: ent(r['Tanque origen']) },
    { sala: txt(r['Sala destino']), tanque: ent(r['Tanque destino']) },
  ];
  if (F.sala && !lados.some((l) => l.sala === F.sala)) return false;
  if (F.tanque !== null && F.tanque !== undefined
    && !lados.some((l) => l.tanque === F.tanque && (!F.sala || l.sala === F.sala))) return false;
  return true;
}

/** Lo que el filtro no puede aplicar a los movimientos: el lote, que esta hoja no registra. */
export function ignoraDeMovimientos(F) {
  return F && (F.lote || F.codigo) ? ['lote'] : [];
}

/**
 * La matriz sala → sala del período, con sus totales por motivo, tipo y agua.
 * `libro` es opcional y sólo sirve para marcar los destinos que HOY están compartidos — se dice así, «hoy»:
 * el libro sabe cómo está la planta al cierre de la foto, no cómo estaba el día del movimiento.
 */
export function matrizDeMovimientos(fuentes, periodo, F, libro) {
  const celdas = new Map();
  const porMotivo = new Map();
  const porTipo = new Map();
  const porAgua = new Map();
  const salas = new Set();
  let total = 0;
  let animales = 0;
  let aTanqueCompartido = 0;
  for (const r of (fuentes || {}).movimientos || []) {
    if (!enPeriodo(fechaDeFila('movimientos', r), periodo) || !movEnFiltro(r, F)) continue;
    const so = txt(r['Sala origen']);
    const sd = txt(r['Sala destino']);
    const n = ent(r.Machos) + ent(r.Hembras);
    total++;
    animales += n;
    if (so) salas.add(so);
    if (sd) salas.add(sd);
    const k = so + '→' + sd;
    const c = celdas.get(k) || { origen: so, destino: sd, movimientos: 0, animales: 0 };
    c.movimientos++;
    c.animales += n;
    celdas.set(k, c);
    const sumar = (m, clave) => { const o = m.get(clave) || { clave, movimientos: 0, animales: 0 }; o.movimientos++; o.animales += n; m.set(clave, o); };
    sumar(porMotivo, txt(r.Motivo) || '(sin motivo)');
    sumar(porTipo, txt(r.Tipo) || '(sin tipo)');
    sumar(porAgua, txt(r['Agua destino']) || '(sin agua)');
    if (libro && libro.tanques) {
      const T = libro.tanques.get(ubicKey(sd, ent(r['Tanque destino'])));
      const vivos = ((T && T.composicion) || []).filter((x) => ent(x.machos) > 0 || ent(x.hembras) > 0);
      if (vivos.length > 1) aTanqueCompartido++;
    }
  }
  /* El catálogo manda en el orden, y lo que NO está en él va al final marcado: un motivo inventado a mano no
     se disimula entre los siete, que es lo mismo que hace el Pareto de 💀 Bajas con los motivos de cierre. */
  const ordenar = (m, catalogo) => [...m.values()]
    .map((o) => ({ ...o, enCatalogo: catalogo.includes(o.clave) }))
    .sort((a, b) => b.movimientos - a.movimientos || porNombre(a.clave, b.clave));
  return {
    salas: [...salas].sort(porNombre),
    celdas: [...celdas.values()].sort((a, b) => porNombre(a.origen, b.origen) || porNombre(a.destino, b.destino)),
    total, animales,
    porMotivo: ordenar(porMotivo, MAD_MOV_MOTIVOS),
    porTipo: ordenar(porTipo, MAD_MOV_TIPOS),
    porAgua: ordenar(porAgua, ['RAS', 'Agua de playa']),
    aTanqueCompartido,
    ignora: ignoraDeMovimientos(F),
  };
}

/** El registro cronológico, el más reciente primero. */
export function registroDeMovimientos(fuentes, periodo, F) {
  const out = [];
  for (const r of (fuentes || {}).movimientos || []) {
    const fecha = fechaDeFila('movimientos', r);
    if (!enPeriodo(fecha, periodo) || !movEnFiltro(r, F)) continue;
    out.push({
      fecha, tipo: txt(r.Tipo), motivo: txt(r.Motivo), agua: txt(r['Agua destino']),
      origen: { sala: txt(r['Sala origen']), tanque: ent(r['Tanque origen']) },
      destino: { sala: txt(r['Sala destino']), tanque: ent(r['Tanque destino']) },
      machos: ent(r.Machos), hembras: ent(r.Hembras), total: ent(r.Machos) + ent(r.Hembras),
      observaciones: txt(r.Observaciones),
      circular: txt(r['Sala origen']) === txt(r['Sala destino']) && ent(r['Tanque origen']) === ent(r['Tanque destino']),
    });
  }
  return out.sort((a, b) => porNombre(b.fecha, a.fecha));
}

/* ── 🦐 ALIMENTACIÓN ───────────────────────────────────────── */

/**
 * La agenda estándar agregada POR PRODUCTO: cuántas tomas y qué % de la biomasa suman. Se DERIVA de las tomas,
 * no se escribe aparte: una tabla al lado se desincronizaría de la ficha en silencio.
 * ⚠ La agenda tiene 14 huecos y uno de ellos —las 14:00— viene SIN producto y sin %, a propósito. La primera
 * versión de esto lo descartaba callando, que es justo el fallo que este proyecto persigue: se devuelve
 * `sinProducto` para que el recuento cuadre y la pantalla pueda decirlo. Si mañana se rellena, baja solo.
 */
export function agendaPorProducto() {
  const m = new Map();
  let sinProducto = 0;
  for (const t of MAD_ALIM_TOMAS_ESTANDAR) {
    const p = txt(t.producto);
    if (!p) { sinProducto++; continue; }
    const o = m.get(p) || { producto: p, tomas: 0, pct: 0 };
    o.tomas++;
    o.pct = r3(o.pct + (num(t.pct) || 0));
    m.set(p, o);
  }
  return {
    productos: MAD_ALIM_PRODUCTOS.map((p) => m.get(p) || { producto: p, tomas: 0, pct: 0 }),
    tomas: MAD_ALIM_TOMAS_ESTANDAR.length,
    sinProducto,
  };
}

/** ¿La fila de alimentación pasa el filtro? Sus «Lotes» son un texto con varios: basta que el lote aparezca. */
function alimEnFiltro(r, F) {
  if (!F) return true;
  if (F.sala && txt(r.Sala) !== F.sala) return false;
  if (F.tanque !== null && F.tanque !== undefined && ent(r.Tanque) !== F.tanque) return false;
  if (F.lote && !lista(r.Lotes).map(normLote).includes(F.lote)) return false;
  return true;
}

/** Lo que el filtro no puede aplicar a la alimentación. */
export function ignoraDeAlimentacion(F) {
  return F && F.codigo ? ['código genético'] : [];
}

/**
 * Los kg PLANIFICADOS de cada producto en el período y su % de la biomasa, contra la agenda estándar; y sus
 * TOMAS, cada una juzgada con el rango de la ficha (`tomas`, `tomasFuera` y el detalle en `fuera`).
 * 🔑 El % se calcula sobre la biomasa de LAS MISMAS filas que aportan los kg: dividir por una biomasa de otro
 * día —o por la del último— daría un porcentaje que no corresponde a ninguna ración.
 */
export function alimentacionPorProducto(fuentes, periodo, F) {
  const kg = new Map();
  let biomasa = 0;
  const dias = new Set();
  let filas = 0;
  /* Las tomas planificadas, una vez por sala y día: todos los tanques de una sala llevan la MISMA agenda en su
     columna «Tomas», y contarla por tanque la multiplicaría. Lo que se juzga es cada toma, con la regla de la ficha. */
  const tomasVistas = new Set();
  const tomasDe = new Map();   // producto → { tomas, fuera: [{ fecha, sala, hora, pct }] }
  for (const r of (fuentes || {}).alimentacion || []) {
    const fecha = fechaDeFila('alimentacion', r);
    if (!enPeriodo(fecha, periodo) || !alimEnFiltro(r, F)) continue;
    filas++;
    dias.add(fecha);
    biomasa += num(r['Biomasa total (kg)']) || 0;
    for (const p of MAD_ALIM_PRODUCTOS) {
      const v = num(r[p + ' (kg/día)']);
      if (v === null) continue;
      kg.set(p, r3((kg.get(p) || 0) + v));
    }
    for (const t of alimTomasActivas(alimTomasDesdeTexto(r.Tomas))) {
      const k = fecha + '|' + txt(r.Sala) + '|' + t.hora + '|' + t.producto + '|' + t.pct;
      if (tomasVistas.has(k)) continue;
      tomasVistas.add(k);
      const o = tomasDe.get(t.producto) || { tomas: 0, fuera: [] };
      o.tomas++;
      if (t.pct < MAD_ALIM_PCT_MIN || t.pct > MAD_ALIM_PCT_MAX) o.fuera.push({ fecha, sala: txt(r.Sala), hora: t.hora, pct: t.pct });
      tomasDe.set(t.producto, o);
    }
  }
  const A = agendaPorProducto();
  const agenda = A.productos;
  const nDias = dias.size || 1;
  const biomasaDia = r2(biomasa / nDias);
  const productos = MAD_ALIM_PRODUCTOS.map((p) => {
    const total = kg.get(p) || 0;
    const porDia = r3(total / nDias);
    const pct = biomasaDia > 0 ? r3((porDia / biomasaDia) * 100) : '';
    const a = agenda.find((x) => x.producto === p) || { pct: 0, tomas: 0 };
    const T = tomasDe.get(p) || { tomas: 0, fuera: [] };
    return {
      producto: p, kg: r3(total), kgDia: porDia, pct,
      agendaPct: a.pct, agendaTomas: a.tomas,
      /* Sólo se compara con biomasa y con agenda: sin una de las dos, la comparación no significa nada. El
         desvío INFORMA; lo que se JUZGA con el rango de la ficha son las tomas, aquí debajo. */
      desvio: pct === '' || !a.pct ? '' : r2(pct - a.pct),
      tomas: T.tomas,
      tomasFuera: T.fuera.length,
      fuera: T.fuera.sort((x, y) => porNombre(y.fecha, x.fecha) || porNombre(x.sala, y.sala) || porNombre(x.hora, y.hora)),
    };
  });
  const totalDia = r3(productos.reduce((a, p) => a + p.kgDia, 0));
  return {
    productos, filas, dias: dias.size,
    tomas: productos.reduce((a, p) => a + p.tomas, 0),
    tomasFuera: productos.reduce((a, p) => a + p.tomasFuera, 0),
    biomasa: r2(biomasa), biomasaDia, totalDia,
    pctTotal: biomasaDia > 0 ? r3((totalDia / biomasaDia) * 100) : '',
    /* La proyección es 30 días al ritmo del período. Es aritmética, no un pronóstico: se rotula así. */
    proyeccionMensual: r2(totalDia * 30),
    rango: { min: MAD_ALIM_PCT_MIN, max: MAD_ALIM_PCT_MAX },
    agendaTomas: A.tomas, agendaSinProducto: A.sinProducto,
    ignora: ignoraDeAlimentacion(F),
  };
}

/** De dónde sale el peso con el que se calculó la ración. Es lo que separa una ración medida de una supuesta. */
export function procedenciaDelPeso(fuentes, periodo, F) {
  const m = new Map();
  for (const r of (fuentes || {}).alimentacion || []) {
    if (!enPeriodo(fechaDeFila('alimentacion', r), periodo) || !alimEnFiltro(r, F)) continue;
    const f = txt(r['Fuente del peso']) || '(sin decir)';
    m.set(f, (m.get(f) || 0) + 1);
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].map(([fuente, n]) => ({ fuente, n, pct: cociente(n, total, 100) }))
    .sort((a, b) => b.n - a.n || porNombre(a.fuente, b.fuente));
}

/* ── 🧪 TRATAMIENTOS ───────────────────────────────────────── */

/** Lo que el filtro no puede aplicar aquí: el TANQUE, que esta hoja no registra (se aplican por sala y área). */
export function ignoraDeTratamientos(F) {
  const x = [];
  if (F && F.tanque !== null && F.tanque !== undefined) x.push('tanque');
  if (F && F.codigo) x.push('código genético');
  return x;
}

function tratEnFiltro(r, F) {
  if (!F) return true;
  if (F.sala && txt(r.Sala) !== F.sala) return false;
  if (F.lote && !lista(r.Lotes).map(normLote).includes(F.lote)) return false;
  return true;
}

/**
 * El calendario sala × día: qué se aplicó y dónde.
 * ⚠ Un día SIN tratamiento es `null`, no cero: «no se trató» y «se trató con cero productos» no son lo mismo,
 * y pintar un cero donde no hubo nada es el defecto que el mapa de calor de 💀 Bajas ya tiene vigilado.
 */
export function calendarioDeTratamientos(fuentes, periodo, F) {
  const dias = [];
  for (let d = periodo.desde; d && d <= periodo.hasta; d = sumarDias(d, 1)) dias.push(d);
  const porSala = new Map();
  let total = 0;
  for (const r of (fuentes || {}).tratamientos || []) {
    const fecha = fechaDeFila('tratamientos', r);
    if (!enPeriodo(fecha, periodo) || !tratEnFiltro(r, F)) continue;
    const sala = txt(r.Sala) || '(sin sala)';
    if (!porSala.has(sala)) porSala.set(sala, { sala, celdas: dias.map(() => null), total: 0 });
    const fila = porSala.get(sala);
    const i = dias.indexOf(fecha);
    if (i < 0) continue;
    if (!fila.celdas[i]) fila.celdas[i] = { tratamientos: 0, tipos: [], productos: 0 };
    fila.celdas[i].tratamientos++;
    const tipo = txt(r.Tipo);
    if (tipo && !fila.celdas[i].tipos.includes(tipo)) fila.celdas[i].tipos.push(tipo);
    fila.celdas[i].productos += lista(r.Productos).length + lista(r['Productos RAS']).length;
    fila.total++;
    total++;
  }
  return {
    dias,
    filas: [...porSala.values()].sort((a, b) => porNombre(a.sala, b.sala)),
    total,
    ignora: ignoraDeTratamientos(F),
  };
}

/** Qué productos se aplicaron en cada una de las siete áreas. El área fuera del catálogo se marca, no se oculta. */
export function productosPorArea(fuentes, periodo, F) {
  const m = new Map();
  for (const r of (fuentes || {}).tratamientos || []) {
    if (!enPeriodo(fechaDeFila('tratamientos', r), periodo) || !tratEnFiltro(r, F)) continue;
    const area = txt(r['Área']) || '(sin área)';
    const o = m.get(area) || { area, aplicaciones: 0, productos: new Map(), enCatalogo: MAD_TRAT_AREAS.includes(area) };
    o.aplicaciones++;
    for (const p of [...lista(r.Productos), ...lista(r['Productos RAS'])]) {
      o.productos.set(p, (o.productos.get(p) || 0) + 1);
    }
    m.set(area, o);
  }
  return [...m.values()]
    .map((o) => ({
      area: o.area, aplicaciones: o.aplicaciones, enCatalogo: o.enCatalogo,
      productos: [...o.productos.entries()].map(([producto, veces]) => ({ producto, veces }))
        .sort((a, b) => b.veces - a.veces || porNombre(a.producto, b.producto)),
    }))
    .sort((a, b) => b.aplicaciones - a.aplicaciones || porNombre(a.area, b.area));
}

/**
 * La cobertura PREVENTIVA por lote: cuántos días hace que a cada lote vivo se le aplicó un preventivo.
 * 🔑 Un lote sin ninguno NO sale con cero días: sale con `''` y rotulado «ninguno». Cero diría «hoy mismo»,
 * que es exactamente lo contrario de lo que pasa.
 */
export function coberturaPreventiva(fuentes, libro, periodo, F, hoy) {
  const ultimo = new Map();
  for (const r of (fuentes || {}).tratamientos || []) {
    const fecha = fechaDeFila('tratamientos', r);
    if (!enPeriodo(fecha, periodo) || !tratEnFiltro(r, F)) continue;
    const preventivos = [...lista(r.Productos), ...lista(r['Productos RAS'])]
      .filter((p) => MAD_TRAT_PREVENTIVOS.includes(p));
    if (!preventivos.length) continue;
    for (const l of lista(r.Lotes).map(normLote)) {
      const o = ultimo.get(l);
      if (!o || fecha > o.fecha) ultimo.set(l, { fecha, productos: preventivos });
    }
  }
  const filas = [];
  for (const [k, L] of ((libro && libro.lotes) || new Map())) {
    const lote = normLote(k);
    if (F && F.lote && lote !== F.lote) continue;
    if (ent(L.machos) + ent(L.hembras) <= 0) continue;      // los cerrados no necesitan cobertura
    const u = ultimo.get(lote);
    filas.push({
      lote,
      fecha: u ? u.fecha : '',
      dias: u && esIso(txt(hoy)) ? diasEntre(u.fecha, txt(hoy)) : '',
      productos: u ? u.productos : [],
      cubierto: !!u,
    });
  }
  return filas.sort((a, b) => (a.cubierto === b.cubierto ? porNombre(a.lote, b.lote) : a.cubierto ? 1 : -1));
}
