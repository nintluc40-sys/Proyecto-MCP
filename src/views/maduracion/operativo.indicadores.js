/* ============================================================
   MADURACIÓN · OPERATIVO — los INDICADORES NUEVOS del tablero (Fase 0.3, 2026-09-19)

   Los que el usuario APROBÓ el 2026-09-19 y el ⚖️ Saldo no calcula. Los que ya calcula el Saldo (mortalidad
   acumulada y del día, % mudas y cópulas, fertilidad, nauplios por hembra, carga…) NO están aquí: se leen de
   `resumenMaduracion`, que es su única definición. Cada indicador lleva su DEFINICIÓN en `INDICADORES`: la vista
   la enseña junto a la cifra, porque una cifra tiene que decir de dónde sale. Módulo PURO.

   Reglas que no se ven en las fórmulas:
   · Un cociente sin denominador es VACÍO (''), nunca 0: «0 % de supervivencia» de un lote sin ingresos es falso.
   · N5 y N2 NO se comparan entre sí (decisión del usuario, 2026-09-08): aquí no hay ningún N5 ÷ N2.
   · La hoja de Alimentación registra la ración PLANIFICADA, no la consumida: su indicador lo dice en el nombre.
   · Los lotes y los códigos casan entre hojas por su forma CANÓNICA (`normLote`, `normCodigoGenetico`: mayúsculas
     y sin espacios), la misma con que los guardan las fichas.
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { areaTanqueM2 } from '../registros/lib/ficha-maduracion-ingreso.schema.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = txt(v);
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const ent = (v) => { const n = num(v); return n !== null && n > 0 ? n : 0; };
const enPeriodo = (f, desde, hasta) => /^\d{4}-\d{2}-\d{2}$/.test(f) && (!desde || f >= desde) && (!hasta || f <= hasta);

/** a ÷ b × escala con dos decimales; VACÍO si no hay denominador. */
export const cociente = (a, b, escala = 1) =>
  (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? r2((a / b) * escala) : '');

/** El catálogo: qué es cada indicador, en palabras. Lo enseña la vista; lo exige la prueba (uno por función). */
export const INDICADORES = [
  { id: 'supervivencia', nombre: 'Supervivencia del lote', unidad: '%', definicion: 'Animales vivos ÷ animales ingresados al lote × 100, por sexo y total.' },
  { id: 'tasaDescarte', nombre: 'Tasa de descarte', unidad: '%', definicion: 'Descartes de selección ÷ animales ingresados al lote × 100, por sexo y total.' },
  { id: 'proporcionHM', nombre: 'Proporción sexual H:M', unidad: 'hembras por macho', definicion: 'Hembras vivas ÷ machos vivos.' },
  { id: 'densidadTanque', nombre: 'Densidad del tanque', unidad: 'animales/m²', definicion: 'Animales vivos ÷ área del tanque (catálogo de áreas de la ficha de Ingreso).' },
  { id: 'ocupacion', nombre: 'Ocupación de la sala', unidad: '%', definicion: 'Tanques con animales vivos ÷ tanques físicos de la sala × 100.' },
  { id: 'desovesPorLote', nombre: 'Huevos y no viables por desove', unidad: 'por desove', definicion: 'Total de huevos ÷ desoves y hembras no viables ÷ desoves, por lote, en el período.' },
  { id: 'tasaDeDesove', nombre: 'Tasa de desove', unidad: '%', definicion: 'Desoves del día ÷ hembras vivas del lote al cierre de ese día × 100.' },
  { id: 'fueraDeRango', nombre: 'Lecturas fuera de rango', unidad: '%', definicion: 'Lecturas del período fuera del rango de referencia ÷ lecturas del período × 100, por sala. Los extremos del rango cuentan como dentro.' },
  { id: 'diasDesdeDesinfeccion', nombre: 'Días desde la última desinfección', unidad: 'días', definicion: 'Días entre la última desinfección registrada en Tratamientos para esa sala y la fecha de cálculo.' },
  { id: 'alimentoPorMillonN5', nombre: 'Alimento planificado por millón de N5', unidad: 'kg por millón', definicion: 'Kg de alimento PLANIFICADO en el período (hoja de Alimentación) ÷ millones de N5 de los desoves del período.' },
  { id: 'desempenoPorOrigen', nombre: 'Desempeño por origen', unidad: 'varias', definicion: 'Por código genético o por piscina de broodstock: ingresados, vivos, supervivencia, desoves, fertilidad y nauplios por hembra (estas dos con la regla del Saldo).' },
];

/** Supervivencia de un lote (%): vivos ÷ ingresados, por sexo y total. `L` es un lote del libro o del resumen. */
export function supervivencia(L) {
  const i = (L && L.ingresados) || {};
  const m = ent(L && L.machos), h = ent(L && L.hembras), im = ent(i.machos), ih = ent(i.hembras);
  return { machos: cociente(m, im, 100), hembras: cociente(h, ih, 100), total: cociente(m + h, im + ih, 100) };
}

/** Tasa de descarte de un lote (%): descartes de selección ÷ ingresados, por sexo y total. */
export function tasaDescarte(L) {
  const i = (L && L.ingresados) || {};
  const d = (L && L.descartes) || {};
  const dm = ent(d.machos), dh = ent(d.hembras), im = ent(i.machos), ih = ent(i.hembras);
  return { machos: cociente(dm, im, 100), hembras: cociente(dh, ih, 100), total: cociente(dm + dh, im + ih, 100) };
}

/** Proporción sexual: hembras por cada macho. */
export const proporcionHM = (hembras, machos) => cociente(ent(hembras), ent(machos));

/** Densidad de un tanque (animales/m²): vivos ÷ su área. Sin área conocida, vacía. */
export function densidadTanque(sala, tanque, machos, hembras) {
  const a = areaTanqueM2(sala, tanque);
  return typeof a === 'number' && a > 0 ? r2((ent(machos) + ent(hembras)) / a) : '';
}

/** Ocupación de una sala (%): tanques con animales ÷ tanques físicos. */
export const ocupacion = (ocupados, total) => cociente(ent(ocupados), ent(total), 100);

/** Los desoves de un período, por lote canónico: cuántos, huevos, no viables, y huevos y no viables POR DESOVE. */
export function desovesPorLote(filasDesoves, desde, hasta) {
  const out = {};
  for (const r of filasDesoves || []) {
    if (!enPeriodo(txt(r.Fecha), desde, hasta)) continue;
    const lote = normLote(r.Lote);
    if (!lote) continue;
    const a = out[lote] || (out[lote] = { desoves: 0, huevos: 0, noViables: 0 });
    a.desoves += ent(r.Desoves);
    a.huevos += ent(r['Total de huevos']);
    a.noViables += ent(r['Hembras no viables']);
  }
  for (const a of Object.values(out)) {
    a.huevosPorDesove = cociente(a.huevos, a.desoves);
    a.noViablesPorDesove = cociente(a.noViables, a.desoves);
  }
  return out;
}

/** La tasa de desove por día y lote (%): desoves del día ÷ hembras vivas del lote al CIERRE del día, que da la
 *  serie diaria del libro (`serieDiaria`). Sin hembras vivas ese día, vacía. */
export function tasaDeDesove(filasDesoves, serie) {
  const vivas = new Map();
  for (const d of serie || []) {
    for (const [lote, L] of Object.entries(d.porLote || {})) vivas.set(d.fecha + '|' + normLote(lote), ent(L.hembras));
  }
  const dias = new Map();
  for (const r of filasDesoves || []) {
    const fecha = txt(r.Fecha);
    const lote = normLote(r.Lote);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !lote) continue;
    const k = fecha + '|' + lote;
    dias.set(k, (dias.get(k) || 0) + ent(r.Desoves));
  }
  return [...dias.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, desoves]) => {
    const [fecha, lote] = k.split('|');
    const hembras = vivas.get(k) || 0;
    return { fecha, lote, desoves, hembras, tasa: cociente(desoves, hembras, 100) };
  });
}

/** Lecturas fuera de rango, por sala, en el período: de las `columnas` dadas (las 12 temperaturas o los 4
 *  oxígenos de la hoja Sala), cuántas lecturas hay y cuántas caen fuera de [min, max]. Los extremos cuentan como
 *  DENTRO. Un lado del rango vacío no se comprueba (p. ej. el oxígeno sólo tiene mínimo). */
export function fueraDeRango(filasSala, columnas, rango, desde, hasta) {
  const min = num((rango || {}).min);
  const max = num((rango || {}).max);
  const out = {};
  for (const r of filasSala || []) {
    if (!enPeriodo(txt(r.Fecha), desde, hasta)) continue;
    const sala = txt(r.Sala);
    const a = out[sala] || (out[sala] = { lecturas: 0, fuera: 0 });
    for (const c of columnas || []) {
      const v = num(r[c]);
      if (v === null) continue;
      a.lecturas++;
      if ((min !== null && v < min) || (max !== null && v > max)) a.fuera++;
    }
  }
  for (const a of Object.values(out)) a.pct = cociente(a.fuera, a.lecturas, 100);
  return out;
}

/** Días desde la última desinfección de cada sala: las filas de Tratamientos de tipo «Desinfección» con esa Sala
 *  (una desinfección de un área sin sala —RAS, líneas de agua…— no es de ninguna sala). Lo posterior a `hoy`, fuera. */
export function diasDesdeDesinfeccion(filasTrat, salas, hoy) {
  const ultima = {};
  for (const r of filasTrat || []) {
    const f = txt(r.Fecha);
    if (txt(r.Tipo) !== 'Desinfección' || !enPeriodo(f, '', hoy)) continue;
    const s = txt(r.Sala);
    if (s && (!ultima[s] || f > ultima[s])) ultima[s] = f;
  }
  return Object.fromEntries((salas || []).map((s) => [s, { fecha: ultima[s] || '', dias: ultima[s] ? diasEntre(ultima[s], hoy) : '' }]));
}

/** Kg de alimento PLANIFICADO en el período por millón de N5 de los desoves del período (por su fecha de desove). */
export function alimentoPorMillonN5(filasAlim, filasDesoves, desde, hasta) {
  let kg = 0;
  for (const r of filasAlim || []) if (enPeriodo(txt(r.Fecha), desde, hasta)) kg += num(r['Total (kg/día)']) || 0;
  let n5 = 0;
  for (const r of filasDesoves || []) if (enPeriodo(txt(r.Fecha), desde, hasta)) n5 += ent(r.N5);
  return { kg: r2(kg), n5, kgPorMillon: cociente(kg, n5 / 1e6) };
}

/**
 * El desempeño por ORIGEN: por código genético (`dimension = 'codigo'`) o por piscina de broodstock ('piscina').
 * `posiciones` son las del libro (`construirLibro(...).posiciones`): los vivos de cada (lote, código genético).
 *  · ingresados: los del Ingreso de ese origen;
 *  · vivos: los de las posiciones de ese origen. Para la PISCINA, cada (lote, código) va a la piscina de su
 *    Ingreso; si ese par entró desde varias, a la que más animales aportó (así ningún vivo se cuenta dos veces);
 *  · desoves, huevos, N2 y N5: los de los Desoves de ese origen, y la fertilidad y los nauplios por hembra con la
 *    regla del Saldo: sólo sobre los desoves que ya tienen su N2 / su N5.
 */
export function desempenoPorOrigen(fuentes, posiciones, dimension) {
  const porPiscina = dimension === 'piscina';
  const origenDe = (r) => (porPiscina ? txt(r['Piscina Broodstock']) : normCodigoGenetico(r['Código genético']));
  const par = (lote, cg) => normLote(lote) + '|' + normCodigoGenetico(cg);
  const aportes = new Map();   // par → Map origen → animales
  const out = new Map();
  const de = (o) => out.get(o) || (out.set(o, { origen: o, lotes: new Set(), ingresados: 0, vivos: 0, desoves: 0, huevos: 0,
    n2: 0, n5: 0, huevosConN2: 0, desovesConN5: 0 }), out.get(o));
  for (const r of ((fuentes || {}).ingresos || [])) {
    const o = origenDe(r);
    if (!o) continue;
    const A = de(o);
    const n = ent(r.Machos) + ent(r.Hembras);
    A.ingresados += n;
    A.lotes.add(normLote(r.Lote));
    const k = par(r.Lote, r['Código genético']);
    if (!aportes.has(k)) aportes.set(k, new Map());
    aportes.get(k).set(o, (aportes.get(k).get(o) || 0) + n);
  }
  const origenDelPar = (k) => {
    const m = aportes.get(k);
    if (!m) return '';
    return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  };
  for (const p of posiciones || []) {
    const o = porPiscina ? origenDelPar(par(p.lote, p.codigoGenetico)) : normCodigoGenetico(p.codigoGenetico);
    if (o) de(o).vivos += ent(p.machos) + ent(p.hembras);
  }
  for (const r of ((fuentes || {}).desoves || [])) {
    const o = origenDe(r);
    if (!o) continue;
    const A = de(o);
    const n2 = ent(r.N2), n5 = ent(r.N5);
    A.desoves += ent(r.Desoves);
    A.huevos += ent(r['Total de huevos']);
    A.n2 += n2;
    A.n5 += n5;
    if (n2 > 0) A.huevosConN2 += ent(r['Total de huevos']);
    if (n5 > 0) A.desovesConN5 += ent(r.Desoves);
  }
  return [...out.values()].sort((a, b) => a.origen.localeCompare(b.origen, 'es', { numeric: true })).map((A) => ({
    origen: A.origen, lotes: [...A.lotes].filter(Boolean).sort(), ingresados: A.ingresados, vivos: A.vivos,
    supervivencia: cociente(A.vivos, A.ingresados, 100), desoves: A.desoves, huevos: A.huevos, n2: A.n2, n5: A.n5,
    fertilidad: cociente(A.n2, A.huevosConN2, 100),
    naupliosPorHembra: A.desovesConN5 > 0 ? Math.round(A.n5 / A.desovesConN5) : '',
  }));
}
