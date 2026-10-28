/* ============================================================
   MADURACIÓN · OPERATIVO — 📈 EVOLUCIÓN (2026-10-27, usuario; ronda 9, Sesión B, tarea 2)

   La sub-vista que pidió el usuario para «ver tendencias de x variables, jugar con los filtros, ver dobles (la tasa de
   cópula de un lote durante el mes…) y descargarlo en Excel». No se llama «Tendencias»: ése es el bloque de ALERTAS de
   📊 Estado actual (operativo.tendencias.js), y dos piezas con el mismo nombre es el homónimo que el tablero ya evitó una
   vez (D-8, «Revisiones del supervisor»). Módulo PURO: ni DOM ni red; la vista sólo dibuja lo que sale de aquí.

   Decisiones del usuario (2026-10-27, no re-preguntar): sub-vista propia con la barra de filtros del tablero; variables de
   Reproducción, Población, Alimentación y Ambiente (sala, zonas de desove y reservorios, y clima); «las dos formas» de ver
   dobles —dos variables a la vez, cada una con su eje, O la misma variable por lote o por sala, hasta 6 líneas—; agrupar
   por día, semana (lunes a domingo) o mes (de calendario), siempre dentro del período elegido; y como extras el resumen
   de cada serie, la media móvil de 7 días y las marcas de eventos (tratamientos y movimientos). Sin banda de referencia.

   🔑 LA REGLA DE CADA NÚMERO ES LA DE SU TARJETA. Cada variable sabe calcular su valor sobre un rango [desde, hasta]
   llamando a la MISMA función que su tarjeta o su gráfico (`kpiCopula`, `acumularDesoves` con el filtro de
   `kpiReproduccion`, `graficoMortalidad`, `graficoVivos`, `alimentacionPorProducto`…), y de ese único cálculo salen el
   punto de cada día, el de cada semana o mes, la media móvil y el total del período. Así:
   · una TASA de una semana es el cociente de sus sumas (Σ cópulas ÷ Σ hembra-días), no el promedio de siete tasas: es la
     regla del ⚖️ Saldo, y la semana cuadra con la tarjeta puesta en esa semana;
   · un NIVEL (los vivos) es el del último día con dato del rango;
   · un FLUJO (desoves, N5, muertes registradas, lluvia) es la suma;
   · un PROMEDIO de lecturas (temperatura, O₂, ración por día) pesa cada lectura, no cada día.
   Lo que un filtro no puede separar se DICE (`notas`, con la regla común `filtrosNoAplicados`), y lo que no aplica no se
   inventa: el punto queda vacío y la nota dice por qué.
   ============================================================ */
import { kpiCopula, loteElegido, desoveEnOrigen, codigoEnFiltro, salaElegida, ignoraDeDesoves, filtrosNoAplicados, haySala } from './operativo.tablero.js';
import { graficoVivos, graficoMortalidad } from './operativo.kpis.js';
import { acumularDesoves } from './operativo.tendencias.js';
import { tasaDeDesove, cociente } from './operativo.indicadores.js';
import { alimentacionPorProducto, ignoraDeAlimentacion, registroDeMovimientos, ignoraDeMovimientos, calendarioDeTratamientos, ignoraDeTratamientos } from './operativo.manejo.js';
import { RESUMEN_TEMPS, RESUMEN_OXIGENOS } from '../registros/lib/mad-resumen.js';
import { sumarDias } from '../registros/lib/mad-libro.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { climaDias } from '../clima/clima.data.js';
import { zonasDelPeriodo } from './operativo.zonas.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const fecha10 = (v) => txt(v).slice(0, 10);   // la MISMA lectura de la fecha que `kpiReproduccion`
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
/** `cociente` da VACÍO sin denominador; un 0 es un dato (una fertilidad del 0 % existe): sólo el vacío pasa a null. */
const vac = (v) => (v === '' || v === null || v === undefined ? null : v);
const enRango = (f, desde, hasta) => esIso(f) && f >= desde && f <= hasta;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);

/** Cuántas líneas como mucho al comparar por lote o por sala (decisión del usuario). */
export const MAX_COMPARADOS = 6;
export const AGRUPACIONES = [{ clave: 'dia', etiqueta: 'Día' }, { clave: 'semana', etiqueta: 'Semana' }, { clave: 'mes', etiqueta: 'Mes' }];
export const COMPARACIONES = [{ clave: 'nada', etiqueta: 'Nada' }, { clave: 'lote', etiqueta: 'Por lote' }, { clave: 'sala', etiqueta: 'Por sala' }];

/* ── LOS PERÍODOS DE LA SERIE ───────────────────────────────── */

/** Día de la semana de una fecha ISO (0 = lunes … 6 = domingo), sin depender de la zona horaria del equipo. */
const diaSemana = (f) => (new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10))).getUTCDay() + 6) % 7;
/**
 * Los tramos en que se parte el período: un día; una semana de lunes a domingo; un mes de calendario. El primero y el
 * último se RECORTAN al período (una semana que empieza antes del período sólo cuenta sus días dentro), y lo dicen
 * (`parcial`), para que nadie compare una semana de 3 días con una de 7 sin saberlo.
 * @returns {Array<{ desde: string, hasta: string, etiqueta: string, parcial: boolean }>}
 */
export function tramosDe(periodo, agrupar) {
  const out = [];
  if (!periodo || !esIso(periodo.desde) || !esIso(periodo.hasta) || periodo.desde > periodo.hasta) return out;
  let d = periodo.desde;
  while (d <= periodo.hasta) {
    let fin;
    if (agrupar === 'semana') fin = sumarDias(d, 6 - diaSemana(d));
    else if (agrupar === 'mes') { const y = +d.slice(0, 4), m = +d.slice(5, 7); fin = sumarDias((m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-01', -1); }
    else fin = d;
    const hasta = fin > periodo.hasta ? periodo.hasta : fin;
    const completo = agrupar === 'semana' ? diaSemana(d) === 0 && hasta === fin
      : agrupar === 'mes' ? d.slice(8, 10) === '01' && hasta === fin : true;
    const etiqueta = agrupar === 'semana' ? `${dm(d)}–${dm(hasta)}`
      : agrupar === 'mes' ? `${MESES[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : dm(d);
    out.push({ desde: d, hasta, etiqueta, parcial: !completo });
    d = sumarDias(hasta, 1);
  }
  return out;
}

/* ── LAS VARIABLES ──────────────────────────────────────────── */

/** Los desoves que el filtro deja, con el filtro de `kpiReproduccion` (lote, origen y código), en el rango. */
function desovesEn(ctx, F, desde, hasta) {
  return ((ctx.M && ctx.M.fuentes && ctx.M.fuentes.desoves) || []).filter((r) => enRango(fecha10(r.Fecha), desde, hasta)
    && loteElegido(r.Lote, F) && desoveEnOrigen(r, F) && codigoEnFiltro(r['Código genético'], F));
}
/** Las lecturas de `columnas` en la hoja de Sala, de las salas del filtro, en el rango: la ÚLTIMA no vacía de cada
 *  (día, sala, columna), como `variableDeSala` (una sala puede tener varias filas el mismo día). */
function lecturasDeSala(ctx, F, columnas, desde, hasta) {
  const ult = new Map();
  for (const r of (ctx.M && ctx.M.fuentes && ctx.M.fuentes.sala) || []) {
    const f = fecha10(r.Fecha);
    if (!enRango(f, desde, hasta) || !salaElegida(txt(r.Sala), F)) continue;
    for (const c of columnas) { const v = num(r[c]); if (v !== null) ult.set(f + '|' + txt(r.Sala) + '|' + c, v); }
  }
  return [...ult.values()];
}
const media = (l) => (l.length ? l.reduce((a, v) => a + v, 0) / l.length : null);
/* Los kg planificados de UN día con el filtro (sala, tanque y lote), con la regla de 🦐 Alimentación, guardados por libro:
   medido con el libro real (27-10, «Todo» de 77 días por día), el alimento por millón de N5 recalculaba la alimentación
   entera —tomas incluidas— para cada día y cada ventana de 7 días: 564 ms. Con los kg de cada día una vez, un rango es su
   suma (exacta: sin el redondeo por producto de `totalDia`). La ración de un tramo sigue siendo la de la sub-vista. */
const _kgDia = new WeakMap();
function kgDelDia(fuentes, F, dia) {
  let m = _kgDia.get(fuentes);
  if (!m) _kgDia.set(fuentes, (m = new Map()));
  const k = [F.salas, F.tanques, F.lotes].map((l) => (l || []).join(',')).join('|') + '|' + dia;
  if (!m.has(k)) { const a = alimentacionPorProducto(fuentes, { desde: dia, hasta: dia }, F); m.set(k, a.dias ? a.totalDia : null); }
  return m.get(k);
}
/** Los días de clima REGISTRADOS (no el pronóstico, que trae días futuros) del rango; las filas se leen una vez. */
const _clima = new WeakMap(), SIN_CLIMA = [];
const diasDeClima = (filas) => { if (!_clima.has(filas)) _clima.set(filas, climaDias(filas)); return _clima.get(filas); };
const climaEn = (ctx, desde, hasta) => diasDeClima(ctx.clima || SIN_CLIMA).filter((d) => d.tipo !== 'Pronóstico' && enRango(d.key, desde, hasta));
const deClima = (campo) => (ctx, F, desde, hasta) => media(climaEn(ctx, desde, hasta).map((d) => d[campo]).filter((v) => v !== null));
const ignoraClima = (F) => filtrosNoAplicados(F, []);   // el clima y las zonas: ningún filtro del tablero se les aplica
const deZonas = (campo) => (ctx, F, desde, hasta) => {
  let s = 0, n = 0;
  for (const z of zonasDelPeriodo((ctx.M && ctx.M.fuentes && ctx.M.fuentes.zonas) || [], desde, hasta)) { s += z[campo].med * z[campo].n; n += z[campo].n; }
  return n ? s / n : null;
};
/** El último valor no vacío de una serie de `graficoVivos` en el rango (el nivel al cierre del rango). */
const vivosAl = (clave) => (ctx, F, desde, hasta) => {
  const g = graficoVivos(ctx.serie, { desde, hasta }, F);
  if (!g.aplica) return null;
  const datos = g.series.find((s) => s.clave === clave).datos;
  for (let i = datos.length - 1; i >= 0; i--) if (datos[i] !== null && datos[i] !== undefined) return datos[i];
  return null;
};
const noAplicaVivos = (ctx, F) => { const g = graficoVivos(ctx.serie, ctx.periodo, F); return g.aplica ? '' : g.nota; };

/**
 * El catálogo, en su orden y por grupo. Cada variable:
 *   valor(ctx, F, desde, hasta) → número o null, con la regla de su tarjeta;
 *   tipo: 'tasa' | 'nivel' | 'flujo' | 'promedio' (cómo se lee y cómo se suaviza);
 *   comparar: por qué se puede comparar ('lote', 'sala'): lo que su regla sí separa;
 *   ignora(F, ctx): los filtros que su regla no aplica (se dicen); noAplica(ctx, F): por qué no hay serie, si no la hay.
 */
export const VARIABLES = [
  // ── Reproducción
  { clave: 'copula', grupo: 'Reproducción', etiqueta: 'Tasa de cópula', unidad: '%', tipo: 'tasa', comparar: ['lote', 'sala'],
    valor: (ctx, F, desde, hasta) => kpiCopula(ctx.copulas, { desde, hasta }, F).tasa,
    ignora: (F, ctx) => kpiCopula(ctx.copulas, ctx.periodo, F).ignora },
  { clave: 'desoves', grupo: 'Reproducción', etiqueta: 'Desoves', unidad: 'desoves', tipo: 'flujo', comparar: ['lote'],
    valor: (ctx, F, desde, hasta) => acumularDesoves(desovesEn(ctx, F, desde, hasta)).desoves, ignora: (F) => ignoraDeDesoves(F) },
  { clave: 'tasaDesove', grupo: 'Reproducción', etiqueta: 'Tasa de desove', unidad: '% de hembras', tipo: 'tasa', comparar: ['lote'],
    // la del catálogo (`tasaDeDesove`): desoves del día ÷ hembras vivas del lote al cierre; un rango, Σ ÷ Σ de sus (día, lote)
    valor: (ctx, F, desde, hasta) => {
      const t = tasaDeDesove(desovesEn(ctx, F, desde, hasta), ctx.serie).filter((x) => x.hembras > 0);
      return vac(cociente(t.reduce((a, x) => a + x.desoves, 0), t.reduce((a, x) => a + x.hembras, 0), 100));
    },
    ignora: (F) => ignoraDeDesoves(F) },
  { clave: 'huevosPorDesove', grupo: 'Reproducción', etiqueta: 'Huevos por desove', unidad: 'huevos', tipo: 'tasa', comparar: ['lote'],
    valor: (ctx, F, desde, hasta) => vac(acumularDesoves(desovesEn(ctx, F, desde, hasta)).huevosPorDesove), ignora: (F) => ignoraDeDesoves(F) },
  { clave: 'fertilidad', grupo: 'Reproducción', etiqueta: 'Fertilidad (N2)', unidad: '%', tipo: 'tasa', comparar: ['lote'],
    valor: (ctx, F, desde, hasta) => vac(acumularDesoves(desovesEn(ctx, F, desde, hasta)).fertilidad), ignora: (F) => ignoraDeDesoves(F) },
  { clave: 'n5', grupo: 'Reproducción', etiqueta: 'N5 (nauplios)', unidad: 'nauplios', tipo: 'flujo', comparar: ['lote'],
    valor: (ctx, F, desde, hasta) => acumularDesoves(desovesEn(ctx, F, desde, hasta)).n5, ignora: (F) => ignoraDeDesoves(F) },
  { clave: 'n5PorDesove', grupo: 'Reproducción', etiqueta: 'N5 por desove', unidad: 'nauplios', tipo: 'tasa', comparar: ['lote'],
    valor: (ctx, F, desde, hasta) => vac(acumularDesoves(desovesEn(ctx, F, desde, hasta)).n5PorDesove), ignora: (F) => ignoraDeDesoves(F) },
  // ── Población
  { clave: 'vivos', grupo: 'Población', etiqueta: 'Vivos (total)', unidad: 'animales', tipo: 'nivel', comparar: ['lote', 'sala'],
    valor: vivosAl('total'), ignora: () => [], noAplica: noAplicaVivos },
  { clave: 'hembras', grupo: 'Población', etiqueta: 'Vivos ♀', unidad: 'hembras', tipo: 'nivel', comparar: ['lote', 'sala'],
    valor: vivosAl('hembras'), ignora: () => [], noAplica: noAplicaVivos },
  { clave: 'machos', grupo: 'Población', etiqueta: 'Vivos ♂', unidad: 'machos', tipo: 'nivel', comparar: ['lote', 'sala'],
    valor: vivosAl('machos'), ignora: () => [], noAplica: noAplicaVivos },
  /* La regla de la tarjeta (`graficoMortalidad`): sin sala, la TASA del Saldo entre el cierre de la víspera del rango y
     su último cierre; con sala o tanque, las muertes REGISTRADAS en los partes (un flujo). El rótulo lo dice. */
  { clave: 'mortalidad', grupo: 'Población', etiqueta: 'Mortalidad', unidad: '% (sin sala) · muertes (con sala)', tipo: 'tasa', comparar: ['lote', 'sala'],
    valor: (ctx, F, desde, hasta) => {
      const g = graficoMortalidad(ctx.serie, { desde, hasta }, F, ctx.partes);
      if (!g.aplica) return null;
      const a = g.series.find((s) => s.clave === 'acumulada').datos;
      const v = a.length ? a[a.length - 1] : null;
      return v === undefined ? null : v;
    },
    unidadCon: (F) => (haySala(F) ? 'muertes registradas' : '%'),
    // con sala, los partes de esa sala o tanque, de TODOS sus lotes; sin sala, la tasa del libro, que sólo separa por lote
    ignora: (F) => (haySala(F) ? filtrosNoAplicados(F, ['sala', 'tanque']) : filtrosNoAplicados(F, ['lote', 'codigo'])),
    noAplica: (ctx, F) => { const g = graficoMortalidad(ctx.serie, ctx.periodo, F, ctx.partes); return g.aplica ? '' : g.nota; } },
  // ── Alimentación
  { clave: 'racion', grupo: 'Alimentación', etiqueta: 'Ración planificada', unidad: 'kg/día', tipo: 'promedio', comparar: ['lote', 'sala'],
    // `totalDia` de 🦐 Alimentación: los kg del rango ÷ los días con registro (un día sin ración no es un cero)
    valor: (ctx, F, desde, hasta) => {
      if (desde === hasta) return kgDelDia(ctx.M.fuentes, F, desde);
      const a = alimentacionPorProducto(ctx.M.fuentes, { desde, hasta }, F);
      return a.dias ? a.totalDia : null;
    },
    ignora: (F) => ignoraDeAlimentacion(F) },
  { clave: 'alimentoPorN5', grupo: 'Alimentación', etiqueta: 'Alimento por millón de N5', unidad: 'kg por millón de N5', tipo: 'tasa', comparar: ['lote'],
    valor: (ctx, F, desde, hasta) => {
      let kg = 0, dias = 0;
      for (let d = desde; d <= hasta; d = sumarDias(d, 1)) { const v = kgDelDia(ctx.M.fuentes, F, d); if (v !== null) { kg += v; dias++; } }
      const n5 = acumularDesoves(desovesEn(ctx, F, desde, hasta)).n5;
      return dias ? vac(cociente(kg, n5 / 1e6)) : null;
    },
    // los kg se separan por sala, tanque y lote; los N5, por lote, código y origen: lo que no aplica a alguno de los dos, se dice
    ignora: (F) => [...new Set([...ignoraDeAlimentacion(F), ...ignoraDeDesoves(F)])] },
  // ── Ambiente
  { clave: 'temperatura', grupo: 'Ambiente', etiqueta: 'Temperatura de sala', unidad: '°C', tipo: 'promedio', comparar: ['sala'],
    valor: (ctx, F, desde, hasta) => media(lecturasDeSala(ctx, F, RESUMEN_TEMPS, desde, hasta)), ignora: (F) => filtrosNoAplicados(F, ['sala']) },
  { clave: 'oxigeno', grupo: 'Ambiente', etiqueta: 'O₂ de sala', unidad: 'mg/L', tipo: 'promedio', comparar: ['sala'],
    valor: (ctx, F, desde, hasta) => media(lecturasDeSala(ctx, F, RESUMEN_OXIGENOS, desde, hasta)), ignora: (F) => filtrosNoAplicados(F, ['sala']) },
  /* Las zonas de desove y los reservorios («Maduración Zonas», Sesión A, ronda 9 · tarea 2): la media de TODAS sus lecturas
     del tramo, Σ (media × lecturas) ÷ Σ lecturas de `zonasDelPeriodo` (la última de cada día y toma, como allí). Una zona
     no es una sala ni lleva lote: ningún filtro del tablero se aplica, y se dice. */
  { clave: 'zonasTemp', grupo: 'Ambiente', etiqueta: 'Temperatura de zonas', unidad: '°C', tipo: 'promedio', comparar: [],
    valor: deZonas('temp'), ignora: ignoraClima },
  { clave: 'zonasOx', grupo: 'Ambiente', etiqueta: 'O₂ de zonas', unidad: 'mg/L', tipo: 'promedio', comparar: [],
    valor: deZonas('ox'), ignora: ignoraClima },
  { clave: 'climaTemp', grupo: 'Ambiente', etiqueta: 'Temperatura exterior (media)', unidad: '°C', tipo: 'promedio', comparar: [],
    valor: deClima('tMed'), ignora: ignoraClima },
  { clave: 'climaHumedad', grupo: 'Ambiente', etiqueta: 'Humedad exterior', unidad: '%', tipo: 'promedio', comparar: [],
    valor: deClima('hr'), ignora: ignoraClima },
  { clave: 'climaLluvia', grupo: 'Ambiente', etiqueta: 'Lluvia', unidad: 'mm', tipo: 'flujo', comparar: [],
    valor: (ctx, F, desde, hasta) => { const l = climaEn(ctx, desde, hasta).map((d) => d.lluvia).filter((v) => v !== null); return l.length ? l.reduce((a, v) => a + v, 0) : null; },
    ignora: ignoraClima },
];
const POR_CLAVE = new Map(VARIABLES.map((v) => [v.clave, v]));
export const variableDe = (clave) => POR_CLAVE.get(clave) || null;

/* ── LA SERIE ───────────────────────────────────────────────── */

/** El filtro de una línea de la comparación: el del tablero con UN solo lote o UNA sola sala. */
const filtroCon = (F, comparar, valor) => (comparar === 'lote' ? { ...F, lotes: [normLote(valor)] } : { ...F, salas: [txt(valor)] });

/**
 * La evolución de una o dos variables, o de una por lote o por sala.
 * @param {object} ctx  { M, serie (desde la víspera del período), partes, copulas (`partesConHembras`), clima (filas), periodo, F }
 * @param {object} op   { a, b, agrupar: 'dia'|'semana'|'mes', comparar: 'nada'|'lote'|'sala', elegidos: string[], movil, eventos }
 * @returns {{ tramos, series, resumen, eventos, notas }}
 */
export function evolucion(ctx, op = {}) {
  const { periodo, F } = ctx;
  const A = variableDe(op.a);
  const agrupar = AGRUPACIONES.some((g) => g.clave === op.agrupar) ? op.agrupar : 'dia';
  const tramos = tramosDe(periodo, agrupar);
  const notas = [];
  if (!A) return { tramos, series: [], resumen: [], eventos: [], notas: ['Elige una variable.'] };

  const lineas = [];
  const comparar = op.comparar === 'lote' || op.comparar === 'sala' ? op.comparar : 'nada';
  if (comparar !== 'nada') {
    if (!A.comparar.includes(comparar)) notas.push(`${A.etiqueta} no se separa ${comparar === 'lote' ? 'por lote' : 'por sala'}: su regla no lo permite.`);
    else {
      const elegidos = [...new Set((op.elegidos || []).map(txt).filter(Boolean))];
      if (elegidos.length > MAX_COMPARADOS) notas.push(`Se comparan como mucho ${MAX_COMPARADOS}: quedan fuera ${elegidos.slice(MAX_COMPARADOS).join(', ')}.`);
      elegidos.slice(0, MAX_COMPARADOS).forEach((x) => lineas.push({ v: A, F: filtroCon(F, comparar, x), eje: 'a', etiqueta: `${A.etiqueta} · ${x}`, de: x }));
      if (!elegidos.length) notas.push(`Elige ${comparar === 'lote' ? 'los lotes' : 'las salas'} que comparar.`);
    }
  } else {
    lineas.push({ v: A, F, eje: 'a', etiqueta: A.etiqueta });
    const B = variableDe(op.b);
    if (B && B.clave !== A.clave) lineas.push({ v: B, F, eje: 'b', etiqueta: B.etiqueta });
  }

  const series = lineas.map((l, i) => {
    const memo = new Map();
    const valor = (desde, hasta) => {
      const k = desde + '|' + hasta;
      if (!memo.has(k)) { const v = l.v.valor(ctx, l.F, desde, hasta); memo.set(k, v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? null : v); }
      return memo.get(k);
    };
    const datos = tramos.map((t) => valor(t.desde, t.hasta));
    /* La media móvil de 7 días, sólo por día: la de una tasa es la tasa de esos 7 días (Σ ÷ Σ) y la de un flujo, su
       suma ÷ 7, con la MISMA regla del punto; la de un nivel o un promedio, la media de sus 7 puntos. Necesita los 7
       días dentro del período: antes, vacía (empezar con 3 días la haría saltar justo al principio). */
    let movil = null;
    if (agrupar === 'dia' && op.movil !== false) {
      movil = tramos.map((t, k) => {
        if (k < 6) return null;
        const desde = tramos[k - 6].desde;
        if (l.v.tipo === 'tasa') return valor(desde, t.hasta);
        if (l.v.tipo === 'flujo') { const s = valor(desde, t.hasta); return s === null ? null : s / 7; }
        const vs = datos.slice(k - 6, k + 1).filter((x) => x !== null);
        return vs.length ? vs.reduce((a, x) => a + x, 0) / vs.length : null;
      });
    }
    const unidad = l.v.unidadCon ? l.v.unidadCon(l.F) : l.v.unidad;
    return { clave: l.v.clave + (l.de !== undefined ? '·' + l.de : '') + (i ? '#' + i : ''), variable: l.v.clave, etiqueta: l.etiqueta, unidad, eje: l.eje,
      tipo: l.v.tipo, de: l.de === undefined ? null : l.de, datos, movil, total: valor(periodo.desde, periodo.hasta) };
  });

  // Lo que el filtro no separa, una vez por variable (con la comparación, el de la línea, que ya trae su lote o sala)
  const vistas = new Set();
  for (const l of lineas) {
    if (vistas.has(l.v.clave)) continue;
    vistas.add(l.v.clave);
    const na = l.v.noAplica ? l.v.noAplica({ ...ctx }, l.F) : '';
    if (na) notas.push(`${l.v.etiqueta}: ${na}`);
    const ig = l.v.ignora(l.F, ctx) || [];
    if (ig.length) notas.push(`${l.v.etiqueta} no se separa por ${ig.join(', ')}: cuenta entero.`);
  }
  /* El día de HOY aún se está registrando (lo cazó la revisión con el libro real: los desoves del último día salían 0 y el
     cambio del resumen, −100 %). Se dice; la cifra es la que hay, como en la tarjeta. */
  const hoy = ctx.M && ctx.M.hoy;
  if (tramos.length && esIso(hoy) && hoy >= tramos[tramos.length - 1].desde && hoy <= tramos[tramos.length - 1].hasta) {
    notas.push(`El último tramo incluye hoy (${dm(hoy)}), que aún se está registrando: su cifra puede cambiar.`);
  }
  if (tramos.length && (tramos[0].parcial || tramos[tramos.length - 1].parcial)) {
    notas.push(agrupar === 'mes' ? 'El mes del principio o del final no está completo dentro del período: se marca «parcial».'
      : 'La semana del principio o del final no está completa dentro del período: se marca «parcial».');
  }

  const eventos = op.eventos === false ? [] : eventosDe(ctx, tramos);
  if (op.eventos !== false) {
    const igM = ignoraDeMovimientos(F), igT = ignoraDeTratamientos(F);
    if (igM.length) notas.push(`Los movimientos no se separan por ${igM.join(', ')}.`);
    if (igT.length) notas.push(`Los tratamientos no se separan por ${igT.join(', ')}.`);
  }

  return { tramos, series, resumen: series.map((s) => resumenDe(s, tramos)), eventos, notas };
}

/** El resumen de una serie: cuántos puntos tienen dato, el mínimo y el máximo (con su tramo), el promedio de los puntos,
 *  el primero y el último con dato, su cambio en %, y el TOTAL del período con la regla de la variable (la tasa de todo
 *  el período, la suma, el nivel al cierre…), que es lo que diría la tarjeta. */
export function resumenDe(s, tramos) {
  const con = s.datos.map((v, i) => ({ v, i })).filter((x) => x.v !== null);
  if (!con.length) return { clave: s.clave, etiqueta: s.etiqueta, unidad: s.unidad, n: 0, min: null, max: null, promedio: null, primero: null, ultimo: null, cambio: null, total: s.total };
  const min = con.reduce((a, x) => (x.v < a.v ? x : a));
  const max = con.reduce((a, x) => (x.v > a.v ? x : a));
  const primero = con[0], ultimo = con[con.length - 1];
  const t = (x) => ({ valor: x.v, tramo: tramos[x.i] ? tramos[x.i].etiqueta : '' });
  return {
    clave: s.clave, etiqueta: s.etiqueta, unidad: s.unidad, n: con.length,
    min: t(min), max: t(max), promedio: con.reduce((a, x) => a + x.v, 0) / con.length,
    primero: t(primero), ultimo: t(ultimo),
    cambio: con.length > 1 && primero.v !== 0 ? ((ultimo.v - primero.v) / Math.abs(primero.v)) * 100 : null,
    total: s.total,
  };
}

/** Las marcas de eventos del período con el filtro del tablero: los tratamientos (su sala y sus tipos) y los movimientos
 *  (origen → destino), cada uno en su tramo. Con las reglas de 🔄 Manejo (`calendarioDeTratamientos`,
 *  `registroDeMovimientos`): los movimientos no llevan lote, y lo dice la nota. */
export function eventosDe(ctx, tramos) {
  const { periodo, F } = ctx;
  const fuentes = (ctx.M && ctx.M.fuentes) || {};
  const tramoDe = (f) => tramos.findIndex((t) => f >= t.desde && f <= t.hasta);
  const out = [];
  const T = calendarioDeTratamientos(fuentes, periodo, F);
  for (const fila of T.filas) {
    fila.celdas.forEach((c, i) => {
      if (!c) return;
      const tipos = c.tipos.length ? c.tipos.join(', ') : 'tratamiento';
      /* `rutina`: el día de esa sala sólo tuvo PREVENTIVOS. Decisión del usuario (2026-10-28, «Sin los preventivos»): con el
         libro real eran 133 de 182 eventos en 30 d y había marca en 29 de 30 días; no se marcan sobre el gráfico, pero
         siguen en la lista y en el Excel. */
      out.push({ fecha: T.dias[i], tipo: 'tratamiento', texto: `${fila.sala}: ${tipos}${c.tratamientos > 1 ? ` (${c.tratamientos})` : ''}`,
        rutina: c.tipos.length > 0 && c.tipos.every((x) => x === 'Preventivo') });
    });
  }
  for (const m of registroDeMovimientos(fuentes, periodo, F)) {
    out.push({ fecha: m.fecha, tipo: 'movimiento', texto: `${m.tipo || 'Movimiento'}: ${m.origen.sala} T${m.origen.tanque} → ${m.destino.sala} T${m.destino.tanque} (${m.total})`, rutina: false });
  }
  return out.map((e) => ({ ...e, tramo: tramoDe(e.fecha) })).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0));
}

/* ── EL EXCEL ───────────────────────────────────────────────── */

const r4 = (v) => (v === null || v === undefined ? '' : Math.round(v * 1e4) / 1e4);
/** El rótulo de una serie con su unidad, sin repetirla cuando el nombre ya la dice: «Tasa de cópula (%)», pero «Desoves» y
 *  no «Desoves (desoves)», «N5 (nauplios)» y no «N5 (nauplios) (nauplios)» (lo cazó la revisión en Chrome). */
export const rotuloDe = (s) => (String(s.etiqueta).toLowerCase().includes(String(s.unidad).toLowerCase()) ? s.etiqueta : `${s.etiqueta} (${s.unidad})`);
/**
 * Las hojas del Excel: «Serie» (un renglón por tramo, una columna por línea y su media móvil), «Resumen», «Eventos» y
 * «Filtros y notas». Números como números; un punto sin dato, celda vacía (no un cero).
 * @param {object} R  lo que devuelve `evolucion`
 * @param {object} cab { periodo: texto, filtros: [texto], agrupar: texto, generado: texto }
 * @returns {Array<{ nombre: string, aoa: Array<Array> }>}
 */
export function hojasDeEvolucion(R, cab = {}) {
  const conUnidad = rotuloDe;
  const movs = R.series.filter((s) => s.movil);
  const serie = [['Desde', 'Hasta', 'Tramo', 'Parcial', ...R.series.map(conUnidad), ...movs.map((s) => `Media móvil 7 d · ${conUnidad(s)}`)]];
  R.tramos.forEach((t, i) => serie.push([t.desde, t.hasta, t.etiqueta, t.parcial ? 'sí' : '', ...R.series.map((s) => r4(s.datos[i])), ...movs.map((s) => r4(s.movil[i]))]));
  const tv = (x) => (x ? [r4(x.valor), x.tramo] : ['', '']);
  const resumen = [['Serie', 'Unidad', 'Puntos con dato', 'Total del período', 'Mínimo', 'Tramo del mínimo', 'Máximo', 'Tramo del máximo',
    'Promedio de los puntos', 'Primero', 'Tramo del primero', 'Último', 'Tramo del último', 'Cambio (%)']];
  R.resumen.forEach((x) => resumen.push([x.etiqueta, x.unidad, x.n, r4(x.total), ...tv(x.min), ...tv(x.max), r4(x.promedio), ...tv(x.primero), ...tv(x.ultimo), r4(x.cambio)]));
  const eventos = [['Fecha', 'Tipo', 'Detalle']];
  R.eventos.forEach((e) => eventos.push([e.fecha, e.tipo === 'tratamiento' ? 'Tratamiento' : 'Movimiento', e.texto]));
  const filtros = [['📈 Evolución · Maduración'], ['Período', cab.periodo || ''], ['Agrupado por', cab.agrupar || ''],
    ['Filtros', (cab.filtros || []).join(' · ') || 'ninguno'], ...(cab.generado ? [['Generado', cab.generado]] : []), [],
    ['Notas'], ...R.notas.map((n) => [n])];
  return [{ nombre: 'Serie', aoa: serie }, { nombre: 'Resumen', aoa: resumen }, { nombre: 'Eventos', aoa: eventos }, { nombre: 'Filtros y notas', aoa: filtros }];
}
