/* ============================================================
   MADURACIÓN · OPERATIVO — EL MAPA DE PLANTA: CAPAS Y LIENZO (0f · 3, 2026-09-25)

   Diseño que aprobó el usuario el 2026-09-25 (punto 3 de la tanda 0f): el mapa de 📊 Estado actual gana OCHO formas
   de colorear además de Estado, Vivos y Densidad —Lote, Código genético, Días en su estado, H:M, Carga métrica,
   Mortalidad del período, Cópulas del período y Último parte— y, al pulsar un tanque, un LIENZO bajo el mapa con su
   resumen: sus lotes (código, estado en la sala y días), ♀/♂ con H:M, densidad, lo que dicen sus partes del período,
   su último parte y la curva de vivos, con «Filtrar por este tanque» y «🛢 Abrir» (su ficha en 🛢 Tanques).
   Módulo PURO: ni DOM ni red; la vista sólo pinta lo que sale de aquí.

   Nada se recalcula con otra fórmula:
   · los días de cada lote EN ESA SALA son los del ⚖️ Saldo (`M.resumen.lotes[].dias`, los de las tarjetas de
     🏠 Salas y de ⏳ Permanencia), y los «más de 60» son el umbral de ⏳ Permanencia (`UMBRALES_DE_AVISO`);
   · la carga métrica, la de `cargasPorTanque` (la tabla de 🛢 Tanques y el detalle de la sala);
   · lo que dicen los partes del período, `actividadPorTanque` (la tabla de 🛢 Tanques); la curva, `curvaDeTanque`;
   · la mortalidad, POR DÍA DE PARTE (bajas ÷ partes), la regla de 📉 Tendencias: un tanque con los partes atrasados
     no parece más sano que el de al lado;
   · las cópulas, con la regla del Saldo para el día —cópulas ÷ hembras del tanque ese día, del libro al cierre de
     ese día (la serie diaria que el tablero ya calcula)—, sumada sobre los partes del período;
   · el semáforo H:M, el umbral bibliográfico de siempre (`evaluar('proporcionHM')`, ya en la celda del mapa).
   Los colores de Lote y de Código son una PALETA fija por orden de nombre: el mismo lote tiene el mismo color en
   todos sus tanques. Un tanque con dos LOTES no toma el color de ninguno: va RAYADO («varios»). Con dos CÓDIGOS, la
   combinación es SU PROPIA categoría («C1/C2»: la pareja, como la ofrece «📥 Cargar» de Desoves).
   Un tanque VACÍO es vacío en todos los modos: no tiene lote, ni días, ni partes que enseñar.
   Un % de cópulas IMPOSIBLE (más cópulas que hembras) se enseña como vino, MARCADO, y no cuenta para la escala; y las
   cópulas de los días en que el libro no tiene hembras en ese tanque se avisan en el lienzo. Es la regla de la
   sobrevivencia imposible de F6: el dato raro se dice, no se esconde ni se corrige.
   El número de cada tanque lo colorea la hoja de estilos (operativo.css): oscuro en tema claro —con las escalas topadas
   donde aún llega a 4,5:1— y blanco en tema oscuro. (Detalles decididos por el usuario el 2026-09-25, con los datos reales.)
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { ubicKey, ESTADO_CUARENTENA, ESTADO_PRODUCCION, CUARENTENA_DIAS } from '../registros/lib/mad-libro.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';
import { cociente } from './operativo.indicadores.js';
import { umbralVigente, UMBRALES_DE_AVISO } from './operativo.umbrales.js';
import { cargasPorTanque, actividadPorTanque, curvaDeTanque } from './operativo.tanques.js';

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
/* La intensidad de un color de escala: del 15 % (lo mínimo, que aún se ve) al 100 % (el máximo del mapa). El color del
   número NO se decide aquí: lo pone operativo.css según el tema (aquí hubo un `is-claro` por debajo del 50 %, que en tema
   claro dejaba el número BLANCO sobre fondos medios: 1,6–3,2:1, medido en Chrome el 2026-09-25). */
const intensidad = (v, max) => Math.round(15 + (85 * Math.min(v, max)) / Math.max(max, 1e-9));
const conIntensidad = (clase, i) => ({ clase, estilo: '--mop-i:' + i + '%' });
/* Las cifras del globo, con el formato del tablero (coma decimal y hasta dos decimales, como `nf` de la vista). */
const cifra = (v) => Number(v).toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Los colores de las categorías (lote, código), distinguibles entre sí. En tema claro, sobre cada uno el número del
 *  tanque va en el color que llega a 4,5:1: OSCURO, salvo en los de `PALETA_NUMERO_BLANCO` (lo comprueba una prueba).
 *  El 2026-09-25 se cambiaron tres tonos por su vecino porque sobre ellos NINGÚN número llegaba: turquesa #00897b →
 *  #009688, rojo #e53935 → #f44336 y rosa #d81b60 → #c2185b. */
export const PALETA = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#009688', '#f44336', '#6d4c41', '#3949ab', '#9e9d24', '#c2185b'];
export const PALETA_NUMERO_BLANCO = new Set(['#8e24aa', '#6d4c41', '#3949ab', '#c2185b']);

/** Los grupos en que la vista ordena los botones del color del mapa (`MODOS_MAPA[].grupo`). */
export const GRUPOS_MAPA = [
  { grupo: 'lote', etiqueta: 'Del lote' },
  { grupo: 'tanque', etiqueta: 'Del tanque' },
  { grupo: 'partes', etiqueta: 'De los partes' },
];

const CAPA_VACIA = { partes: 0, bajas: 0, mortalidad: '', copulas: 0, hembrasDia: 0, conHembras: 0, pctCopulas: '', copulasSinHembras: 0,
  ultimoParte: '', carga: '' };

/**
 * Lo que cada tanque trae además de lo que ya dice su celda del mapa: los partes del período (bajas por día de parte
 * y el % de cópulas con la regla del Saldo), su ÚLTIMO parte hasta la foto (aunque sea de antes del período) y su
 * carga métrica. Y los días de cada lote en cada sala, del Saldo. `serie`: la diaria del período (con `porTanque`);
 * `partes`: los de `diasDeTanque`.
 */
export function capasDelMapa(M, serie, partes, periodo) {
  const capas = new Map();
  const capa = (uk) => {
    if (!capas.has(uk)) capas.set(uk, { ...CAPA_VACIA });
    return capas.get(uk);
  };
  const foto = txt((M || {}).fecha);
  const porDia = new Map((serie || []).map((d) => [d.fecha, d.porTanque || {}]));
  for (const d of partes || []) {
    const f = txt(d.fecha);
    if (!esIso(f) || (foto && f > foto)) continue;
    const uk = ubicKey(d.sala, d.tanque);
    const c = capa(uk);
    if (f > c.ultimoParte) c.ultimoParte = f;
    if (!periodo || !enPeriodo(f, periodo)) continue;
    c.partes++;
    c.bajas += ent(d.machosMuertos) + ent(d.hembrasMuertas);
    const T = (porDia.get(f) || {})[uk];
    if (T && ent(T.hembras) > 0) {
      c.copulas += ent(d.copulas);
      c.hembrasDia += ent(T.hembras);
      c.conHembras++;
    } else c.copulasSinHembras += ent(d.copulas);   // un dato imposible: no entra en el %, y el lienzo lo AVISA
  }
  for (const [uk, o] of cargasPorTanque(M)) capa(uk).carga = num(o.cargaMetrica) === null ? '' : num(o.cargaMetrica);
  for (const c of capas.values()) {
    c.mortalidad = cociente(c.bajas, c.partes);
    c.pctCopulas = cociente(c.copulas, c.hembrasDia, 100);
  }
  const dias = new Map();
  for (const L of ((M || {}).resumen || {}).lotes || []) {
    for (const d of L.dias || []) {
      dias.set(normLote(L.lote) + '|' + d.sala,
        { estado: d.estado, dias: d.estado === ESTADO_PRODUCCION ? Number(d.diasProduccion) || 0 : Number(d.diasCuarentena) || 0 });
    }
  }
  return { capas, dias };
}

/* La COMBINACIÓN de códigos genéticos de un tanque es UNA categoría (decisión del usuario, 2026-09-25): la pareja lleva
   su propio color. Por orden de nombre, para que la misma pareja sea la misma categoría en todos sus tanques, venga en el
   orden que venga. `clave` vacía: el tanque no tiene ningún código. */
function combinacionDeCodigos(t) {
  const m = new Map();
  for (const l of t.lotes) {
    for (const cg of l.codigos) {
      const k = normCodigoGenetico(cg);
      if (k && !m.has(k)) m.set(k, txt(cg));
    }
  }
  const claves = [...m.keys()].sort(porNombre);
  return { clave: claves.join('/'), nombre: claves.map((k) => m.get(k)).join('/') };
}

/** Lo que el mapa necesita para colorear: las capas, la paleta de lotes y de combinaciones de códigos (por orden de
 *  nombre, de los tanques ocupados) y el máximo de cada escala. `mapa`: el de `mapaDePlanta`. */
export function contextoDelMapa(mapa, capasYDias, fecha) {
  const { capas, dias } = capasYDias || { capas: new Map(), dias: new Map() };
  const lotesVistos = new Set();
  const codigosVistos = new Set();
  const nombres = new Map();
  let maxMort = 0;
  let maxCop = 0;
  let maxCarga = 0;
  const ocupados = ((mapa && mapa.salas) || []).flatMap((s) => s.tanques).filter((t) => t.vivos > 0);
  for (const t of ocupados) {
    for (const l of t.lotes) {
      const k = normLote(l.lote);
      if (!nombres.has('l|' + k)) nombres.set('l|' + k, txt(l.lote));
      lotesVistos.add(k);
    }
    const cc = combinacionDeCodigos(t);
    if (cc.clave) {
      codigosVistos.add(cc.clave);
      if (!nombres.has('c|' + cc.clave)) nombres.set('c|' + cc.clave, cc.nombre);
    }
    const c = capas.get(ubicKey(t.sala, t.tanque)) || CAPA_VACIA;
    if (typeof c.mortalidad === 'number' && c.mortalidad > maxMort) maxMort = c.mortalidad;
    // Un % IMPOSIBLE (más cópulas que hembras) se marca aparte y no fija la escala: aplastaría a todos los demás.
    if (typeof c.pctCopulas === 'number' && c.pctCopulas <= 100 && c.pctCopulas > maxCop) maxCop = c.pctCopulas;
    if (typeof c.carga === 'number' && c.carga > maxCarga) maxCarga = c.carga;
  }
  /* 🔑 El Map se CONSTRUYE ya ordenado: la leyenda lo recorre en su orden de inserción, y asignar los colores por
     nombre sobre un Map rellenado por orden de aparición dejaba la leyenda desordenada (lo cazó la prueba con M0). */
  const pintar = (vistos) => new Map([...vistos].sort(porNombre).map((k, i) => [k, PALETA[i % PALETA.length]]));
  return { capas, dias, lotes: pintar(lotesVistos), codigos: pintar(codigosVistos), nombres,
    max: { mortalidad: maxMort, copulas: maxCop, carga: maxCarga }, fecha: txt(fecha) };
}

const SEMAFORO_HM = { ok: 'H:M dentro de su rango', bajo: 'H:M por debajo de su rango', alto: 'H:M por encima de su rango' };

/* Los días del tanque en su estado: los de sus lotes EN ESA SALA; si los lotes están en estados distintos, «mixto». */
function diasDelTanque(t, ctx) {
  const estados = [...new Set(t.lotes.map((l) => l.estado).filter(Boolean))];
  if (estados.length > 1) return { estado: 'mixto', dias: '' };
  const estado = estados[0] || '';
  if (estado !== ESTADO_CUARENTENA && estado !== ESTADO_PRODUCCION) return { estado: '', dias: '' };
  let dias = '';
  for (const l of t.lotes) {
    const d = ctx.dias.get(normLote(l.lote) + '|' + t.sala);
    if (d && d.estado === estado && (dias === '' || d.dias > dias)) dias = d.dias;
  }
  return { estado, dias };
}

/**
 * El color de un tanque en uno de los modos NUEVOS: `{ clase, estilo, clave, texto }`. `clave` agrupa la leyenda y
 * `texto` es lo que dice el globo del tanque. Los modos de siempre (estado, vivos, densidad) los pinta la vista.
 */
export function colorDeTanque(t, modo, ctx) {
  if (!t.vivos) return { clase: 'is-e-vacio', estilo: '', clave: 'vacio', texto: 'vacío' };
  const c = ctx.capas.get(ubicKey(t.sala, t.tanque)) || CAPA_VACIA;
  if (modo === 'lote' || modo === 'codigo') {
    const claves = modo === 'lote'
      ? [...new Set(t.lotes.map((l) => normLote(l.lote)))]
      : [combinacionDeCodigos(t).clave].filter(Boolean);
    if (!claves.length) return { clase: 'is-e-sin', estilo: '', clave: 'sin', texto: 'sin código' };
    if (claves.length > 1) return { clase: 'is-varios', estilo: '', clave: 'varios', texto: 'varios lotes' };
    const color = (modo === 'lote' ? ctx.lotes : ctx.codigos).get(claves[0]);
    return { clase: 'is-cat' + (PALETA_NUMERO_BLANCO.has(color) ? ' is-tx-cla' : ''), estilo: '--mop-c:' + color, clave: claves[0],
      texto: ctx.nombres.get((modo === 'lote' ? 'l|' : 'c|') + claves[0]) || claves[0] };
  }
  if (modo === 'dias') {
    const d = diasDelTanque(t, ctx);
    if (d.estado === 'mixto') return { clase: 'is-e-mixto', estilo: '', clave: 'mixto', texto: 'lotes en estados distintos' };
    if (d.dias === '') return { clase: 'is-e-sin', estilo: '', clave: 'sin', texto: 'sin estado' };
    if (d.estado === ESTADO_CUARENTENA) {
      return { clase: 'is-q', estilo: '--mop-i:' + intensidad(d.dias, CUARENTENA_DIAS) + '%', clave: 'cuarentena', texto: d.dias + ' d en cuarentena' };
    }
    const limite = UMBRALES_DE_AVISO.produccion.valor;
    if (d.dias > limite) return { clase: 'is-pr60', estilo: '', clave: 'mas', texto: d.dias + ' d en producción' };
    return { ...conIntensidad('is-pr', intensidad(d.dias, limite)), clave: 'produccion', texto: d.dias + ' d en producción' };
  }
  if (modo === 'hm') {
    const e = t.hmEstado || 'sin';
    // La cifra ya la dice el globo (`textoTanque`): aquí, su semáforo en palabras (decisión del usuario, 2026-09-25).
    return { clase: 'is-d-' + e, estilo: '', clave: e, texto: t.hm === '' ? 'sin machos' : SEMAFORO_HM[e] || 'H:M sin semáforo' };
  }
  const escala = (valor, max, clase, sinTexto, texto) => (valor === ''
    ? { clase: 'is-sd', estilo: '', clave: 'sin', texto: sinTexto }
    : { ...conIntensidad(clase, intensidad(valor, max)), clave: 'escala', texto });
  if (modo === 'carga') return escala(c.carga, ctx.max.carga, 'is-ik', 'sin peso registrado', cifra(c.carga) + ' g/m²');
  if (modo === 'mortalidad') return escala(c.mortalidad, ctx.max.mortalidad, 'is-im', 'sin partes en el período', cifra(c.mortalidad) + ' bajas por día de parte');
  if (modo === 'copulas') {
    if (typeof c.pctCopulas === 'number' && c.pctCopulas > 100) {
      return { clase: 'is-imposible', estilo: '', clave: 'imposible', texto: cifra(c.pctCopulas) + ' % de cópulas · ⚠ más cópulas que hembras' };
    }
    return escala(c.pctCopulas, ctx.max.copulas, 'is-ic', 'sin partes en el período', cifra(c.pctCopulas) + ' % de cópulas');
  }
  if (modo === 'parte') {
    const d = c.ultimoParte ? diasEntre(c.ultimoParte, ctx.fecha) : '';
    if (d === '') return { clase: 'is-p-sin', estilo: '', clave: 'sin', texto: 'sin ningún parte' };
    const clave = d <= 0 ? 'hoy' : d === 1 ? 'ayer' : d <= 7 ? 'semana' : 'antiguo';
    return { clase: 'is-p-' + clave, estilo: '', clave, texto: 'último parte el ' + c.ultimoParte.slice(8, 10) + '/' + c.ultimoParte.slice(5, 7) };
  }
  return { clase: '', estilo: '', clave: '', texto: '' };
}

/** La leyenda de un modo NUEVO, con cuántos tanques hay de cada: `[{ clase, estilo, etiqueta, n }]`. Cuenta TODOS los
 *  tanques del mapa, como la de siempre: el filtro atenúa tanques, no los quita. */
export function leyendaDelMapa(mapa, modo, ctx) {
  const n = new Map();
  for (const t of ((mapa && mapa.salas) || []).flatMap((s) => s.tanques)) {
    const k = colorDeTanque(t, modo, ctx).clave;
    n.set(k, (n.get(k) || 0) + 1);
  }
  const vacio = { clase: 'is-e-vacio', estilo: '', etiqueta: 'Vacío', n: n.get('vacio') || 0 };
  const cuantos = (k) => n.get(k) || 0;
  if (modo === 'lote' || modo === 'codigo') {
    const paleta = modo === 'lote' ? ctx.lotes : ctx.codigos;
    const pre = modo === 'lote' ? 'l|' : 'c|';
    /* Sólo los que tienen algún tanque PROPIO: un lote que sólo está en un tanque compartido no tiene ningún color
       en el mapa (ese tanque va rayado, en «Varios»), y su muestra con un 0 al lado confundiría. */
    return [
      ...[...paleta.entries()].filter(([k]) => cuantos(k) > 0)
        .map(([k, color]) => ({ clase: 'is-cat', estilo: '--mop-c:' + color, etiqueta: ctx.nombres.get(pre + k) || k, n: cuantos(k) })),
      // Dos lotes van rayados; dos códigos no: su combinación es una categoría más (tiene su color arriba).
      ...(modo === 'lote' ? [{ clase: 'is-varios', estilo: '', etiqueta: 'Varios lotes', n: cuantos('varios') }] : []),
      ...(modo === 'codigo' ? [{ clase: 'is-e-sin', estilo: '', etiqueta: 'Sin código', n: cuantos('sin') }] : []),
      vacio,
    ];
  }
  if (modo === 'dias') {
    const lim = UMBRALES_DE_AVISO.produccion.valor;
    return [
      { clase: 'is-q', estilo: '--mop-i:60%', etiqueta: 'Cuarentena (hasta ' + CUARENTENA_DIAS + ' d)', n: cuantos('cuarentena') },
      { clase: 'is-pr', estilo: '--mop-i:60%', etiqueta: 'Producción (hasta ' + lim + ' d)', n: cuantos('produccion') },
      { clase: 'is-pr60', estilo: '', etiqueta: 'Más de ' + lim + ' d en producción', n: cuantos('mas') },
      { clase: 'is-e-mixto', estilo: '', etiqueta: 'Lotes en estados distintos', n: cuantos('mixto') },
      { clase: 'is-e-sin', estilo: '', etiqueta: 'Sin estado', n: cuantos('sin') },
      vacio,
    ];
  }
  if (modo === 'hm') {
    const u = umbralVigente('proporcionHM');
    return [
      { clase: 'is-d-ok', estilo: '', etiqueta: 'Dentro de ' + (u ? u.referencia : 'su rango'), n: cuantos('ok') },
      { clase: 'is-d-bajo', estilo: '', etiqueta: 'Por debajo', n: cuantos('bajo') },
      { clase: 'is-d-alto', estilo: '', etiqueta: 'Por encima', n: cuantos('alto') },
      { clase: 'is-d-sin', estilo: '', etiqueta: 'Sin machos', n: cuantos('sin') },
      vacio,
    ];
  }
  if (modo === 'carga' || modo === 'mortalidad' || modo === 'copulas') {
    const clase = { carga: 'is-ik', mortalidad: 'is-im', copulas: 'is-ic' }[modo];
    const max = ctx.max[modo];
    const unidad = { carga: ' g/m²', mortalidad: ' bajas por día de parte', copulas: ' % de cópulas' }[modo];
    return [
      { clase, estilo: '--mop-i:20%', etiqueta: 'Menos', n: '' },
      { clase, estilo: '--mop-i:100%', etiqueta: 'El más alto: ' + cifra(max) + unidad, n: cuantos('escala') },
      ...(modo === 'copulas' ? [{ clase: 'is-imposible', estilo: '', etiqueta: 'Más cópulas que hembras', n: cuantos('imposible') }] : []),
      { clase: 'is-sd', estilo: '', etiqueta: modo === 'carga' ? 'Sin peso registrado' : 'Sin partes en el período', n: cuantos('sin') },
      vacio,
    ];
  }
  if (modo === 'parte') {
    return [
      { clase: 'is-p-hoy', estilo: '', etiqueta: 'Del día de la foto', n: cuantos('hoy') },
      { clase: 'is-p-ayer', estilo: '', etiqueta: 'Del día anterior', n: cuantos('ayer') },
      { clase: 'is-p-semana', estilo: '', etiqueta: 'De hace 2 a 7 días', n: cuantos('semana') },
      { clase: 'is-p-antiguo', estilo: '', etiqueta: 'De hace más de 7 días', n: cuantos('antiguo') },
      { clase: 'is-p-sin', estilo: '', etiqueta: 'Sin ningún parte', n: cuantos('sin') },
      vacio,
    ];
  }
  return [];
}

/**
 * El LIENZO de un tanque: su celda del mapa (`t`, de `mapaDePlanta`) más los días de cada lote en la sala, lo que
 * dicen sus partes del período (`actividadPorTanque`: bajas, descartes, cópulas y muda; y el % de cópulas de la capa),
 * su último parte hasta la foto, su carga métrica y la curva de vivos del período (`curvaDeTanque`).
 */
export function resumenDeTanque(t, ctx, serie, partes, periodo) {
  const uk = ubicKey(t.sala, t.tanque);
  const c = ctx.capas.get(uk) || CAPA_VACIA;
  const a = actividadPorTanque(partes, periodo).get(uk) || {};
  return {
    sala: t.sala, tanque: t.tanque, fueraDeCatalogo: !!t.fueraDeCatalogo, vacio: !t.vivos,
    lotes: t.lotes.map((l) => {
      const d = ctx.dias.get(normLote(l.lote) + '|' + t.sala);
      return { lote: l.lote, codigos: l.codigos.slice(), estado: l.estado, dias: d && d.estado === l.estado ? d.dias : '',
        machos: l.machos, hembras: l.hembras };
    }),
    vivos: { machos: t.machos, hembras: t.hembras, total: t.vivos },
    hm: t.hm, hmEstado: t.hmEstado, densidad: t.densidad, densidadEstado: t.densidadEstado,
    cargaMetrica: c.carga,
    periodo: { diasConParte: ent(a.dias), bajas: ent(a.muertes), descartes: ent(a.descartes), copulas: ent(a.copulas),
      muda: ent(a.muda), pctCopulas: c.pctCopulas, copulasSinHembras: c.copulasSinHembras },
    ultimoParte: c.ultimoParte,
    curva: curvaDeTanque(serie, t.sala, t.tanque).map((d) => ({ fecha: d.fecha, total: d.total })),
  };
}
