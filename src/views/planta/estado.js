/* ============================================================
   PLANTA · ESTADO DE PRODUCCIÓN de cada módulo y tanque de larvicultura (puro: sin DOM ni 3D)
   Tanda 2 (2026-10-04). Lo que la maqueta pinta es el estado de HOY: la ÚLTIMA corrida de cada
   módulo, con las MISMAS funciones y reglas de la Vista Ejecutiva del Supervisor —nada se
   recalcula con otra fórmula—:
   · el contexto y las estadísticas por módulo y por tanque (supervisor/stats.js: modStats,
     tankStats), sin el filtro de fecha global, igual que la Vista Ejecutiva (fullCtx);
   · la etapa por estadío, la alerta (OD/temperatura fuera de rango, supervivencia grave) y la
     frescura del dato (supervisor/etapas.js, la definición que usan sus tarjetas);
   · «Desinfección» = desinfeccionEnCurso() (pre-siembra, todo el módulo en gris);
   · «Despachado» = el mismo criterio del badge y del «Subtotal actual» (core/prodCalendar.js).
   Decisiones del usuario (2026-10-04): tanque en cultivo con el color de su ETAPA; alerta como
   BALIZA (no repinta el tanque); módulo con la corrida despachada entera = tanques VACÍOS con
   «C### despachada». Un tanque de la corrida que no aparece en los datos está vacío (sin sembrar).
   Módulos del plano M1…M10 ↔ módulos del Sheet M01…M10 (por su número); CIO no está en el plano.
   ============================================================ */
import { getField, F } from '../../core/fields.js';
import { odLevel, tmpLevel } from '../../core/format.js';
import { isDespachoRow, modCorDispatched, modCorStats } from '../../core/prodCalendar.js';
import { buildContext, modStats, tankStats } from '../supervisor/stats.js';
import { desinfeccionEnCurso } from '../supervisor/desinfeccion.js';
import { stageCategory, isAlert, svAlert, freshness } from '../supervisor/etapas.js';
import { LARV, MAT } from './plano.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from '../maduracion/operativo.data.js';
import { mapaDePlanta, normalizarFiltro, periodoDe, alertas, ESTADO_VACIO } from '../maduracion/operativo.tablero.js';
import { capasDelMapa, contextoDelMapa, resumenDeTanque } from '../maduracion/operativo.mapa.js';
import { permanencia } from '../maduracion/operativo.tendencias.js';
import { UMBRALES_DE_AVISO } from '../maduracion/operativo.umbrales.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { ESTADO_PRODUCCION } from '../registros/lib/mad-libro.js';

const numDe = (s) => { const m = String(s || '').match(/\d+/); return m ? +m[0] : null; };
const esModulo = (s, n) => /^M/i.test(String(s || '').trim()) && numDe(s) === n;

// Contexto SIN la ventana de fecha (el de la Vista Ejecutiva), memoizado por identidad: así el memo
// de modStats/tankStats sirve entre refrescos sin cambios.
const _full = new WeakMap();
function contextoCompleto() {
  const ctx = buildContext({ corrida: null });
  let f = _full.get(ctx);
  if (!f) { f = { ...ctx, larvWin: ctx.larvCM, tanqWin: ctx.tanqCM }; _full.set(ctx, f); }
  return f;
}

// Las filas de cada módulo, agrupadas UNA vez por contexto (velocidad · 2, 2026-10-05, usuario): antes cada uno de los
// 10 módulos recorría las filas enteras tres veces en cada cambio de mes. Cada grupo conserva el orden de las filas, así
// que filtrarlo por corrida da exactamente lo mismo que filtrar todas por módulo y corrida. Se leen, no se modifican.
const _porModulo = new WeakMap();
function agruparPorModulo(filas) {
  const m = new Map();
  for (const r of filas) { const k = getField(r, F.modulo); const a = m.get(k); if (a) a.push(r); else m.set(k, [r]); }
  return m;
}
function filasPorModulo(ctx) {
  let x = _porModulo.get(ctx);
  if (!x) {
    const larvCM = agruparPorModulo(ctx.larvCM);
    x = { larvCM, larvWin: ctx.larvWin === ctx.larvCM ? larvCM : agruparPorModulo(ctx.larvWin), tanqWin: agruparPorModulo(ctx.tanqWin) };
    _porModulo.set(ctx, x);
  }
  return x;
}

/** Por qué está en alerta (los mismos tres parámetros que la tarjeta de la Vista Ejecutiva). */
function motivos({ od, tmp, sv }) {
  return [svAlert(sv) && 'Superv.', isAlert(odLevel(od)) && 'OD', isAlert(tmpLevel(tmp)) && 'Temp'].filter(Boolean);
}

/**
 * Estado de los 10 módulos del plano. Sin `corridasDelMes`, el de HOY: la última corrida de cada módulo.
 * Con ellas (un mes PASADO del selector, 2026-10-04, usuario), como las tarjetas de la Vista Ejecutiva: cada módulo con
 * SU corrida de ese mes y su último dato; la despachada entera no se vacía (sus tanques salen despachados) y trae su
 * resultado; la desinfección en curso no aplica.
 * @returns {{ modulos: Object<string, object>, resumen: { cultivo, vacio, despachado, fuera, alerta, desinfeccion, total } }}
 */
export function estadoPlanta(corridasDelMes) {
  const ctx = contextoCompleto();
  const enMes = Array.isArray(corridasDelMes) ? new Set(corridasDelMes.map(String)) : null;
  const desinf = enMes ? [] : desinfeccionEnCurso();
  const modulos = {};
  LARV.forEach((m) => { modulos[m.id] = estadoModulo(ctx, m, desinf, enMes); });
  const resumen = { cultivo: 0, vacio: 0, despachado: 0, fuera: 0, alerta: 0, desinfeccion: 0, total: 0 };
  Object.values(modulos).forEach((mo) => Object.values(mo.tanques).forEach((t) => {
    resumen.total++;
    if (t.estado === 'cultivo') resumen.cultivo++;
    else if (t.estado === 'despachado') resumen.despachado++;
    else if (t.estado === 'agrupado' || t.estado === 'descartado') resumen.fuera++;
    else if (t.estado === 'desinfeccion') resumen.desinfeccion++;
    else resumen.vacio++;
    if (t.alerta) resumen.alerta++;
  }));
  return { modulos, resumen };
}

function estadoModulo(ctx, m, desinf, enMes) {
  const nT = m.rows.length * m.cols.length;
  const vacios = (estado) => Object.fromEntries(Array.from({ length: nT }, (_, i) => [i + 1, { estado }]));
  const mod = ctx.allMods.find((x) => esModulo(x, m.n)) || null;
  const grupos = filasPorModulo(ctx);
  const rows = mod ? grupos.larvCM.get(mod) || [] : [];
  // Corrida = la de número más alto con datos de Larvicultura (su texto tal cual, que es como filtran las estadísticas);
  // en un mes pasado, la más alta de las de ESE mes.
  let corrida = null;
  rows.forEach((r) => { const c = getField(r, F.corrida); if (!isNaN(+c) && (!enMes || enMes.has(String(c))) && (corrida === null || +c > +corrida)) corrida = c; });

  // Pre-siembra: registros de desinfección de una corrida aún sin datos de Larvicultura.
  const des = desinf.filter((d) => esModulo(d.mod, m.n) && (corrida === null || +d.corrida > +corrida))
    .sort((a, b) => +b.corrida - +a.corrida)[0];
  if (des) return { id: m.id, mod: mod || des.mod, estado: 'desinfeccion', corrida: des.corrida, registros: des.count, ultimo: des.lastDate, tanques: vacios('desinfeccion') };
  if (!mod || corrida === null) return { id: m.id, mod, estado: 'sin-datos', corrida: null, tanques: vacios('vacio') };

  const s = modStats(ctx, mod, corrida);
  // la siembra de la corrida: fecha promedio, tanques y nauplios, los de la tabla Producción Omarsa (2026-10-04, usuario)
  const pc = modCorStats(mod, corrida);
  const siembra = { fecha: pc.siembraFecha, tanques: pc.nSie, nauplios: pc.siembra };
  // el resultado de la corrida, el de su fila de la tabla Producción Omarsa
  const resultado = { poblacion: pc.cosecha, superv: pc.superv, plg: pc.plg };
  const despachada = modCorDispatched(mod, corrida);
  if (despachada && !enMes) {
    return { id: m.id, mod, estado: 'despachado', corrida, ultimo: s.lastDate, siembra, resultado, tanques: vacios('vacio') };
  }

  const delaCorrida = rows.filter((r) => getField(r, F.corrida) === corrida);
  const nombres = new Map();   // número del plano → nombre del tanque en el Sheet («TQ 4»)
  delaCorrida.forEach((r) => { const t = getField(r, F.tanque); const k = numDe(t); if (t && k && !nombres.has(k)) nombres.set(k, t); });
  // tankStats recorre el contexto ENTERO por cada tanque (tres pasadas × 112 tanques: ~3 s con el libro real, y cada
  // cambio de mes del selector lo repite). Con sólo las filas de este módulo y corrida —exactamente las que su filtro
  // deja pasar: gMod/gCor de stats.js son getField de F.modulo y F.corrida— da lo mismo en una fracción del tiempo.
  const deEsta = (r) => getField(r, F.corrida) === corrida;   // sobre las filas del módulo (filasPorModulo)
  const larvWin = (grupos.larvWin.get(mod) || []).filter(deEsta);
  const ctxMC = { larvWin, larvCM: ctx.larvCM === ctx.larvWin ? larvWin : (grupos.larvCM.get(mod) || []).filter(deEsta), tanqWin: (grupos.tanqWin.get(mod) || []).filter(deEsta) };
  const tanques = {};
  for (let k = 1; k <= nT; k++) {
    const nombre = nombres.get(k);
    if (!nombre) { tanques[k] = { estado: 'vacio' }; continue; }
    const ts = tankStats(ctxMC, mod, nombre, corrida);
    const comun = { nombre, estadio: ts.estadio, sv: ts.sv, pop: ts.pop, od: ts.od, tmp: ts.tmp, lotes: ts.lotes };
    if (ts.grouped || ts.discarded) { tanques[k] = { ...comun, estado: ts.grouped ? 'agrupado' : 'descartado' }; continue; }
    if (delaCorrida.some((r) => getField(r, F.tanque) === nombre && isDespachoRow(r))) { tanques[k] = { ...comun, estado: 'despachado' }; continue; }
    const mot = motivos(ts);
    tanques[k] = { ...comun, estado: 'cultivo', etapa: stageCategory(ts.estadio), alerta: mot.length > 0, motivos: mot };
  }
  const lista = Object.values(tanques);
  if (despachada) return { id: m.id, mod, estado: 'despachado', corrida, ultimo: s.lastDate, siembra, resultado, tanques };
  return {
    id: m.id, mod, estado: 'cultivo', corrida, siembra, resultado,
    estadio: s.estadio, dias: s.dias, etapa: stageCategory(s.estadio),
    sv: s.sv, mort: s.mort, pop: s.pop, od: s.od, tmp: s.tmp, plg: s.plgManual,
    tecnicos: s.tecnicos, lotes: s.lotes, fresco: freshness(s.lastDate), ultimo: s.lastDate,
    motivos: motivos(s),
    despachando: lista.some((t) => t.estado === 'despachado'),
    cuenta: {
      cultivo: lista.filter((t) => t.estado === 'cultivo').length,
      vacio: lista.filter((t) => t.estado === 'vacio').length,
      despachado: lista.filter((t) => t.estado === 'despachado').length,
      fuera: lista.filter((t) => t.estado === 'agrupado' || t.estado === 'descartado').length,
      alerta: lista.filter((t) => t.alerta).length,
    },
    tanques,
  };
}

/* ============================================================
   MADURACIÓN (tanda 3, 2026-10-04) — el estado de HOY de cada sala y tanque, con las MISMAS funciones del tablero
   de 📋 Operativo de Maduración: el modelo (modeloOperativo: libro al cierre de hoy y estado de cada sala,
   registrado y propuesto), el mapa de planta (mapaDePlanta: estado del tanque por sus lotes en esa sala, ♀/♂, H:M y
   densidad con su semáforo) y el lienzo del tanque (resumenDeTanque: días de cada lote en la sala y lo que dicen sus
   partes del período). Decisiones del usuario: color = el modo «Estado» del mapa de salas; período = últimos 7 días;
   alerta del tanque = H:M o densidad fuera de rango; alerta de la sala = temperatura u oxígeno fuera de rango en el
   período (las alertas del tablero, `alertas`).
   Reemplazo por tiempo (2026-10-04, usuario): los días en producción de cada lote en las salas donde le quedan
   animales (los del ⚖️ Saldo, `resumen.lotes[].dias`) y los que pasan de 60 con `permanencia` del tablero (⏳).
   ============================================================ */

const pad2 = (n) => String(n).padStart(2, '0');
/** Hoy en la zona del equipo, en ISO (la misma cuenta que el tablero de Maduración). */
export function hoyLocal(d = new Date()) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
const fueraDeSuRango = (e) => e === 'bajo' || e === 'alto';

/**
 * Estado de las 5 salas de maduración al cierre de `hoy` (o de `fecha`, con su período de 7 días terminando en ella).
 * @returns {{ salas: Object<string, object>, resumen: { hembras, machos, ocupados, tanques, alertaTanques, alertaSalas, porEstado } }}
 */
export function estadoMaduracion(filas, hoy = hoyLocal(), fecha) {
  // `fecha`: la foto al cierre de otro día (un mes pasado del selector), como «Foto al día» del tablero; sin ella, hoy.
  const M = modeloOperativo(filas, { hoy, fecha });
  const F = normalizarFiltro({}, null);
  const periodo = periodoDe('7d', M.fecha, M.fuentes);
  const mapa = mapaDePlanta(M.libro, F);
  const serie = serieDiaria(M.fuentes, periodo.desde, periodo.hasta);
  const partes = diasDeTanque(M.fuentes.tanques);
  const ctx = contextoDelMapa(mapa, capasDelMapa(M, serie, partes, periodo), M.fecha);
  const al = alertas(M, periodo, F);
  const lecturas = (lista, sala) => lista.porSala.find((x) => x.sala === sala) || null;

  const salas = {};
  const resumen = { hembras: 0, machos: 0, ocupados: 0, tanques: 0, alertaTanques: 0, alertaSalas: 0, porEstado: {} };
  for (const m of MAT) {
    const sM = mapa.salas.find((x) => x.sala === m.sala) || { tanques: [] };
    const sE = (M.salas || []).find((x) => x.sala === m.sala) || null;
    const tanques = {};
    for (const t of sM.tanques) {
      if (t.fueraDeCatalogo) continue;
      const r = resumenDeTanque(t, ctx, serie, partes, periodo);
      const motivos = t.vivos > 0 ? [fueraDeSuRango(t.hmEstado) && 'H:M', fueraDeSuRango(t.densidadEstado) && 'Densidad'].filter(Boolean) : [];
      tanques[t.tanque] = {
        estado: t.estado, vivos: t.vivos, hembras: t.hembras, machos: t.machos,
        hm: t.hm, hmEstado: t.hmEstado, densidad: t.densidad, densidadEstado: t.densidadEstado,
        lotes: r.lotes, periodo: r.periodo, ultimoParte: r.ultimoParte,
        alerta: motivos.length > 0, motivos,
      };
      resumen.tanques++;
      resumen.porEstado[t.estado] = (resumen.porEstado[t.estado] || 0) + 1;
      if (t.vivos > 0) { resumen.ocupados++; resumen.hembras += t.hembras; resumen.machos += t.machos; }
      if (motivos.length) resumen.alertaTanques++;
    }
    const temp = lecturas(al.temperatura, m.sala), ox = lecturas(al.oxigeno, m.sala);
    const motivosSala = [temp && 'Temperatura', ox && 'Oxígeno'].filter(Boolean);
    if (motivosSala.length) resumen.alertaSalas++;
    const lista = Object.values(tanques);
    const sumaP = (k) => lista.reduce((a, x) => a + (Number(x.periodo[k]) || 0), 0);
    salas[m.id] = {
      id: m.id, sala: m.sala,
      registrado: sE ? sE.registrado : { estado: '', fecha: '', porLote: '' },
      propuesto: sE ? sE.propuesto : { estado: '', ocupados: 0, total: lista.length },
      coinciden: sE ? sE.coinciden : null,
      fueraDeCatalogo: sM.tanques.filter((t) => t.fueraDeCatalogo && t.vivos > 0).length,
      hembras: lista.reduce((a, x) => a + x.hembras, 0), machos: lista.reduce((a, x) => a + x.machos, 0),
      ocupados: lista.filter((x) => x.vivos > 0).length, total: lista.length,
      lotes: [...new Set(lista.flatMap((x) => x.lotes.map((l) => l.lote)))],
      periodo: { bajas: sumaP('bajas'), descartes: sumaP('descartes'), copulas: sumaP('copulas') },
      alerta: motivosSala.length > 0, motivos: motivosSala,
      lecturas: { temperatura: temp, oxigeno: ox, umbralT: al.temperatura.umbral, umbralO: al.oxigeno.umbral },
      alertaTanques: lista.filter((x) => x.alerta).length,
      tanques,
    };
  }
  return { fecha: M.fecha, periodo, salas, resumen, vacio: ESTADO_VACIO, reemplazo: reemplazoPorTiempo(M, F, salas) };
}

/** Días en producción de cada lote en las salas donde le quedan animales (el criterio de `permanencia`, sin su
 *  límite), y los que lo pasan, con `permanencia` misma. Marca en cada sala los lotes que pasan (`sala.reemplazo`). */
function reemplazoPorTiempo(M, F, salas) {
  const limite = UMBRALES_DE_AVISO.produccion.valor;
  const idDe = (sala) => (MAT.find((m) => m.sala === sala) || {}).id || '';
  const vivoEn = (clave, sala) => ((M.libro || {}).posiciones || []).some((p) => normLote(p.lote) === clave && p.sala === sala
    && ((Number(p.machos) || 0) > 0 || (Number(p.hembras) || 0) > 0));
  const lotes = [];
  for (const L of (M.resumen || {}).lotes || []) {
    const clave = normLote(L.lote);
    const s = (L.dias || []).filter((d) => d.estado === ESTADO_PRODUCCION && vivoEn(clave, d.sala))
      .map((d) => ({ sala: d.sala, id: idDe(d.sala), dias: Number(d.diasProduccion) || 0 }))
      .sort((a, b) => b.dias - a.dias);
    if (s.length) lotes.push({ lote: String(L.lote), dias: s[0].dias, salas: s });
  }
  lotes.sort((a, b) => b.dias - a.dias || a.lote.localeCompare(b.lote, 'es', { numeric: true }));
  const vencidos = permanencia(M, F).map((v) => ({ lote: v.lote, dias: v.dias, salas: v.salas.map((x) => ({ ...x, id: idDe(x.sala) })) }));
  for (const v of vencidos) for (const x of v.salas) if (salas[x.id]) (salas[x.id].reemplazo ||= []).push({ lote: v.lote, dias: x.dias });
  return { limite, lotes, vencidos };
}
