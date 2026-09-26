/* ============================================================
   MADURACIÓN · OPERATIVO · EL RESUMEN GRÁFICO DE CADA KPI (0f · 5, 2026-09-25, usuario)

   Al pulsar una tarjeta de KPI de 📊 Estado actual, su gráfico del período se abre debajo. Decisiones del usuario:
     · Vivos        → curva diaria ♀ / ♂ / total;
     · Lotes        → lotes por estado (cuarentena · producción · mixto), día a día, en barras apiladas;
     · Salas        → el estado registrado frente al propuesto, sala por sala;
     · Ocupación    → tanques ocupados frente al total, por sala;
     · Mortalidad   → la tasa diaria (barras) y la acumulada del período (línea);
     · Reproducción → desoves por día (barras) y N5 (línea);
     · Biomasa      → ♀ / ♂ por sala.
   🔑 Cada gráfico sale de las MISMAS reglas que la cifra de su tarjeta (operativo.tablero.js) —el mismo filtro, la misma
   regla del Saldo—, y su último punto ES esa cifra: las pruebas lo atan. Con un filtro que el libro no guarda día a día
   (por ejemplo, el código genético en los vivos) el gráfico no se inventa: dice que no aplica.
   Módulo puro: devuelve lo que se dibuja; la vista lo dibuja.
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { ESTADO_CUARENTENA, ESTADO_PRODUCCION, ESTADO_MIXTO, sumarDias, ubicKey } from '../registros/lib/mad-libro.js';
import { SALAS_VISIBLES } from './operativo.data.js';
import { tasaEntre, kpiBiomasa, posicionEnFiltro } from './operativo.tablero.js';

/** Las siete tarjetas que tienen gráfico, en su orden, con su título. */
export const KPIS_CON_GRAFICO = [
  { clave: 'vivos', titulo: 'Vivos' }, { clave: 'lotes', titulo: 'Lotes por estado' },
  { clave: 'salas', titulo: 'Salas: registrado frente a propuesto' }, { clave: 'ocupacion', titulo: 'Ocupación por sala' },
  { clave: 'mortalidad', titulo: 'Mortalidad' }, { clave: 'reproduccion', titulo: 'Reproducción' },
  { clave: 'biomasa', titulo: 'Biomasa por sala' },
];

const txt = (v) => (v == null ? '' : String(v).trim());
const fecha10 = (v) => txt(v).slice(0, 10);   // la MISMA lectura de la fecha que `kpiReproduccion`
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const ent = (v) => { const n = num(v); return n !== null && n > 0 ? n : 0; };
const vacio = (v) => v === '' || v === null || v === undefined;
const enPeriodo = (f, p) => /^\d{4}-\d{2}-\d{2}$/.test(f) && f >= p.desde && f <= p.hasta;
const fechas = (p) => { const out = []; for (let d = p.desde; d && d <= p.hasta; d = sumarDias(d, 1)) out.push(d); return out; };
const diasDe = (serie, p) => (serie || []).filter((d) => d.fecha >= p.desde && d.fecha <= p.hasta);
const noAplica = (nota) => ({ aplica: false, nota });
/** Filtros que estrechan las posiciones sin que la serie los guarde día a día (el libro lleva los vivos por total, sala,
 *  lote, lote·sala y tanque, no por código, estado ni origen). */
const sinSerie = (F) => !!(F.codigo || F.estado || F.piscina || F.camaronera);

/** VIVOS · la curva diaria ♀ / ♂ / total del período, del desglose de la serie que corresponde al filtro. */
export function graficoVivos(serie, periodo, F) {
  if (sinSerie(F) || (F.tanque !== null && F.lote)) {
    return noAplica('Con este filtro el libro no guarda los vivos día a día: el gráfico no aplica (la cifra de la tarjeta sí).');
  }
  const suma = (entradas) => entradas.reduce((a, x) => ({ machos: a.machos + ent(x.machos), hembras: a.hembras + ent(x.hembras) }), { machos: 0, hembras: 0 });
  const del = (d) => {
    if (F.tanque !== null) return suma([(d.porTanque || {})[ubicKey(F.sala, F.tanque)] || {}]);
    if (F.lote && F.sala) return suma(Object.entries(d.porLoteSala || {}).filter(([k]) => { const [l, s] = k.split('|'); return normLote(l) === F.lote && s === F.sala; }).map(([, v]) => v));
    if (F.lote) return suma(Object.entries(d.porLote || {}).filter(([l]) => normLote(l) === F.lote).map(([, v]) => v));
    if (F.sala) return suma([(d.porSala || {})[F.sala] || {}]);
    return suma([d.total || {}]);
  };
  const ds = diasDe(serie, periodo);
  const v = ds.map((d) => {
    const x = del(d);
    const m = F.sexo === 'hembras' ? 0 : x.machos;
    const h = F.sexo === 'machos' ? 0 : x.hembras;
    return { machos: m, hembras: h, total: m + h };
  });
  return {
    aplica: true, tipo: 'lineas', etiquetas: ds.map((d) => d.fecha),
    series: [
      { clave: 'hembras', etiqueta: '♀ Hembras', datos: v.map((x) => x.hembras) },
      { clave: 'machos', etiqueta: '♂ Machos', datos: v.map((x) => x.machos) },
      { clave: 'total', etiqueta: 'Total', datos: v.map((x) => x.total) },
    ],
  };
}

/** LOTES · cuántos lotes con animales hay en cada estado, día a día. El estado de un lote es el de las salas donde tiene
 *  animales ese día (su reloj en cada una, `estadoLoteSala` de la serie) y `Mixto` si no coinciden: la regla de la
 *  tarjeta (`kpiLotes`), con filtro de sala el de ESA sala. */
export function graficoLotes(serie, periodo, F) {
  if (sinSerie(F) || F.tanque !== null) return noAplica('Con este filtro el libro no guarda los lotes día a día: el gráfico no aplica (la cifra de la tarjeta sí).');
  const ds = diasDe(serie, periodo);
  const cuenta = ds.map((d) => {
    const porLote = new Map();
    for (const [k, estado] of Object.entries(d.estadoLoteSala || {})) {
      const [lote, sala] = k.split('|');
      if (F.sala && sala !== F.sala) continue;
      if (F.lote && normLote(lote) !== F.lote) continue;
      if (F.sexo && ent(((d.porLoteSala || {})[k] || {})[F.sexo]) <= 0) continue;
      if (!porLote.has(lote)) porLote.set(lote, new Set());
      if (estado) porLote.get(lote).add(estado);
    }
    const c = { cuarentena: 0, produccion: 0, mixto: 0, otros: 0 };
    for (const estados of porLote.values()) {
      const e = estados.size > 1 ? ESTADO_MIXTO : [...estados][0] || '';
      if (e === ESTADO_CUARENTENA) c.cuarentena++;
      else if (e === ESTADO_PRODUCCION) c.produccion++;
      else if (e === ESTADO_MIXTO) c.mixto++;
      else c.otros++;
    }
    return c;
  });
  return {
    aplica: true, tipo: 'barrasApiladas', etiquetas: ds.map((d) => d.fecha),
    series: [
      { clave: 'cuarentena', etiqueta: 'Cuarentena', datos: cuenta.map((c) => c.cuarentena) },
      { clave: 'produccion', etiqueta: 'Producción', datos: cuenta.map((c) => c.produccion) },
      { clave: 'mixto', etiqueta: 'Mixto', datos: cuenta.map((c) => c.mixto) },
      { clave: 'otros', etiqueta: 'Sin estado', datos: cuenta.map((c) => c.otros) },
    ],
  };
}

/** SALAS · sala por sala, el estado registrado en la hoja frente al que propone el libro (la regla de `kpiSalas`). */
export function graficoSalas(salas, F) {
  const filas = (salas || []).filter((s) => !F.sala || s.sala === F.sala).map((s) => ({
    sala: s.sala, registrado: txt(s.registrado && s.registrado.estado), propuesto: txt(s.propuesto && s.propuesto.estado),
    situacion: s.coinciden === true ? 'coinciden' : s.coinciden === false ? 'difieren' : !txt(s.registrado && s.registrado.estado) ? 'sin-registro' : 'sin-propuesta',
  }));
  return { aplica: true, tipo: 'tabla', filas };
}

/** OCUPACIÓN · por sala, los tanques ocupados frente a su total (la regla de `kpiOcupacion`: con un filtro que estrecha
 *  las posiciones, los tanques con animales de lo filtrado). La suma de las barras es la cifra de la tarjeta. */
export function graficoOcupacion(salas, libro, F) {
  if (F.tanque !== null) return noAplica('Con un tanque elegido, la ocupación es la de ese tanque: no hay salas que comparar.');
  const estrecha = !!(F.lote || F.codigo || F.estado || F.sexo || F.piscina || F.camaronera);
  const ss = (salas || []).filter((s) => !F.sala || s.sala === F.sala);
  const filas = ss.map((s) => {
    const total = ent(s.propuesto && s.propuesto.total);
    let ocupados = ent(s.propuesto && s.propuesto.ocupados);
    if (estrecha) {
      const con = new Set();
      for (const p of (libro && libro.posiciones) || []) {
        if (p.sala === s.sala && (p.machos > 0 || p.hembras > 0) && posicionEnFiltro(p, F)) con.add(ubicKey(p.sala, p.tanque));
      }
      ocupados = con.size;
    }
    return { sala: s.sala, ocupados, libres: Math.max(0, total - ocupados), total };
  });
  return {
    aplica: true, tipo: 'barrasApiladas', etiquetas: filas.map((f) => f.sala),
    series: [
      { clave: 'ocupados', etiqueta: 'Ocupados', datos: filas.map((f) => f.ocupados) },
      { clave: 'libres', etiqueta: 'Libres', datos: filas.map((f) => f.libres) },
    ],
  };
}

/** MORTALIDAD · día a día, con la regla de la tarjeta (`kpiMortalidad`): sin sala, la TASA del Saldo (la del día, en
 *  barras; la acumulada desde la víspera del período, en línea); con sala o tanque, las muertes REGISTRADAS en la hoja
 *  (las del día y su suma); con código genético, no aplica. La serie tiene que empezar la víspera del período. */
export function graficoMortalidad(serie, periodo, F, partes) {
  if (F.sala) {
    const porDia = new Map();
    for (const d of partes || []) {
      if (d.sala !== F.sala || (F.tanque !== null && d.tanque !== F.tanque) || !enPeriodo(d.fecha, periodo)) continue;
      porDia.set(d.fecha, (porDia.get(d.fecha) || 0) + ent(d.machosMuertos) + ent(d.hembrasMuertas));
    }
    const ds = fechas(periodo);
    let acum = 0;
    const acumulada = ds.map((f) => { acum += porDia.get(f) || 0; return acum; });
    return {
      aplica: true, tipo: 'barrasYLinea', unidad: 'muertes', etiquetas: ds,
      series: [
        { clave: 'dia', etiqueta: 'Muertes del día (registradas)', datos: ds.map((f) => porDia.get(f) || 0) },
        { clave: 'acumulada', etiqueta: 'Acumuladas', datos: acumulada },
      ],
    };
  }
  if (F.codigo) return noAplica('El libro lleva las bajas por lote, no por código genético: el gráfico no aplica.');
  const porFecha = new Map((serie || []).map((d) => [d.fecha, d]));
  const antes = porFecha.get(sumarDias(periodo.desde, -1));
  if (!antes) return noAplica('Sin la serie del período no hay tasa que dibujar.');
  const ds = fechas(periodo).filter((f) => porFecha.has(f) && porFecha.has(sumarDias(f, -1)));
  const valor = (x) => (vacio(x.pct) ? null : x.pct);
  return {
    aplica: true, tipo: 'barrasYLinea', unidad: '%', etiquetas: ds,
    series: [
      { clave: 'dia', etiqueta: 'Tasa del día (%)', datos: ds.map((f) => valor(tasaEntre(porFecha.get(sumarDias(f, -1)), porFecha.get(f), F.lote))) },
      { clave: 'acumulada', etiqueta: 'Acumulada del período (%)', datos: ds.map((f) => valor(tasaEntre(antes, porFecha.get(f), F.lote))) },
    ],
  };
}

/** REPRODUCCIÓN · desoves y N5 de cada día del período, por la fecha del desove, con los filtros de la tarjeta
 *  (`kpiReproduccion`: lote y código; un desove no es de una sala). La suma es la cifra de la tarjeta. */
export function graficoReproduccion(filasDesoves, periodo, F) {
  const des = new Map();
  const n5 = new Map();
  for (const r of filasDesoves || []) {
    const f = fecha10(r.Fecha);
    if (!enPeriodo(f, periodo)) continue;
    if (F.lote && normLote(r.Lote) !== F.lote) continue;
    if (F.codigo && normCodigoGenetico(r['Código genético']) !== F.codigo) continue;
    des.set(f, (des.get(f) || 0) + ent(r.Desoves));
    n5.set(f, (n5.get(f) || 0) + ent(r.N5));
  }
  const ds = fechas(periodo);
  return {
    aplica: true, tipo: 'barrasYLinea', unidad: 'desoves', etiquetas: ds, ignora: F.sala ? ['sala'] : [],
    series: [
      { clave: 'desoves', etiqueta: 'Desoves', datos: ds.map((f) => des.get(f) || 0) },
      { clave: 'n5', etiqueta: 'N5', datos: ds.map((f) => n5.get(f) || 0) },
    ],
  };
}

/** BIOMASA · ♀ y ♂ de cada sala, con la regla de la tarjeta (`kpiBiomasa`) aplicada sala por sala. Sin ningún peso en el
 *  período, no hay nada que enseñar (una biomasa inventada es peor que ninguna). */
export function graficoBiomasa(M, F, periodo) {
  const salas = SALAS_VISIBLES.filter((s) => !F.sala || s === F.sala);
  const filas = salas.map((sala) => ({ sala, ...kpiBiomasa(M, { ...F, sala }, periodo) }));
  if (filas.every((f) => vacio(f.totalKg))) return noAplica('Sin pesos registrados en el período: no hay biomasa que enseñar.');
  const kg = (v) => (vacio(v) ? null : v);
  return {
    aplica: true, tipo: 'barrasApiladas', unidad: 'kg', etiquetas: salas,
    series: [
      { clave: 'hembras', etiqueta: '♀ Hembras (kg)', datos: filas.map((f) => kg(f.hembrasKg)) },
      { clave: 'machos', etiqueta: '♂ Machos (kg)', datos: filas.map((f) => kg(f.machosKg)) },
    ],
  };
}

/** El gráfico de una tarjeta, por su clave. `ctx`: { M, serie (desde la víspera del período), partes, periodo, F }. */
export function graficoDeKpi(clave, ctx) {
  const { M, serie, partes, periodo, F } = ctx;
  if (clave === 'vivos') return graficoVivos(serie, periodo, F);
  if (clave === 'lotes') return graficoLotes(serie, periodo, F);
  if (clave === 'salas') return graficoSalas(M.salas, F);
  if (clave === 'ocupacion') return graficoOcupacion(M.salas, M.libro, F);
  if (clave === 'mortalidad') return graficoMortalidad(serie, periodo, F, partes);
  if (clave === 'reproduccion') return graficoReproduccion(M.fuentes.desoves, periodo, F);
  if (clave === 'biomasa') return graficoBiomasa(M, F, periodo);
  return noAplica('');
}
