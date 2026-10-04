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
import { isDespachoRow, modCorDispatched } from '../../core/prodCalendar.js';
import { buildContext, modStats, tankStats } from '../supervisor/stats.js';
import { desinfeccionEnCurso } from '../supervisor/desinfeccion.js';
import { stageCategory, isAlert, svAlert, freshness } from '../supervisor/etapas.js';
import { LARV } from './plano.js';

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

/** Por qué está en alerta (los mismos tres parámetros que la tarjeta de la Vista Ejecutiva). */
function motivos({ od, tmp, sv }) {
  return [svAlert(sv) && 'Superv.', isAlert(odLevel(od)) && 'OD', isAlert(tmpLevel(tmp)) && 'Temp'].filter(Boolean);
}

/**
 * Estado de los 10 módulos del plano.
 * @returns {{ modulos: Object<string, object>, resumen: { cultivo, vacio, despachado, fuera, alerta, desinfeccion, total } }}
 */
export function estadoPlanta() {
  const ctx = contextoCompleto();
  const desinf = desinfeccionEnCurso();
  const modulos = {};
  LARV.forEach((m) => { modulos[m.id] = estadoModulo(ctx, m, desinf); });
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

function estadoModulo(ctx, m, desinf) {
  const nT = m.rows.length * m.cols.length;
  const vacios = (estado) => Object.fromEntries(Array.from({ length: nT }, (_, i) => [i + 1, { estado }]));
  const mod = ctx.allMods.find((x) => esModulo(x, m.n)) || null;
  const rows = mod ? ctx.larvCM.filter((r) => getField(r, F.modulo) === mod) : [];
  // Corrida actual = la de número más alto con datos de Larvicultura (su texto tal cual, que es como filtran las estadísticas).
  let corrida = null;
  rows.forEach((r) => { const c = getField(r, F.corrida); if (!isNaN(+c) && (corrida === null || +c > +corrida)) corrida = c; });

  // Pre-siembra: registros de desinfección de una corrida aún sin datos de Larvicultura.
  const des = desinf.filter((d) => esModulo(d.mod, m.n) && (corrida === null || +d.corrida > +corrida))
    .sort((a, b) => +b.corrida - +a.corrida)[0];
  if (des) return { id: m.id, mod: mod || des.mod, estado: 'desinfeccion', corrida: des.corrida, registros: des.count, ultimo: des.lastDate, tanques: vacios('desinfeccion') };
  if (!mod || corrida === null) return { id: m.id, mod, estado: 'sin-datos', corrida: null, tanques: vacios('vacio') };

  const s = modStats(ctx, mod, corrida);
  if (modCorDispatched(mod, corrida)) {
    return { id: m.id, mod, estado: 'despachado', corrida, ultimo: s.lastDate, tanques: vacios('vacio') };
  }

  const delaCorrida = rows.filter((r) => getField(r, F.corrida) === corrida);
  const nombres = new Map();   // número del plano → nombre del tanque en el Sheet («TQ 4»)
  delaCorrida.forEach((r) => { const t = getField(r, F.tanque); const k = numDe(t); if (t && k && !nombres.has(k)) nombres.set(k, t); });
  const tanques = {};
  for (let k = 1; k <= nT; k++) {
    const nombre = nombres.get(k);
    if (!nombre) { tanques[k] = { estado: 'vacio' }; continue; }
    const ts = tankStats(ctx, mod, nombre, corrida);
    const comun = { nombre, estadio: ts.estadio, sv: ts.sv, pop: ts.pop, od: ts.od, tmp: ts.tmp, lotes: ts.lotes };
    if (ts.grouped || ts.discarded) { tanques[k] = { ...comun, estado: ts.grouped ? 'agrupado' : 'descartado' }; continue; }
    if (delaCorrida.some((r) => getField(r, F.tanque) === nombre && isDespachoRow(r))) { tanques[k] = { ...comun, estado: 'despachado' }; continue; }
    const mot = motivos(ts);
    tanques[k] = { ...comun, estado: 'cultivo', etapa: stageCategory(ts.estadio), alerta: mot.length > 0, motivos: mot };
  }
  const lista = Object.values(tanques);
  return {
    id: m.id, mod, estado: 'cultivo', corrida,
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
