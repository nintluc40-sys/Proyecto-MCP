/* ============================================================
   SUPERVISOR · 🧾 Auditoría de corrida (capa pura, sin DOM) — F2 del punto 6 del usuario (2026-10-03)

   Lee la hoja «Registro_Auditoria» que escribe la ficha 🧾 Auditoría del AsT (engine.js / index (8)): UNA FILA POR
   EVENTO con su «Tipo» —Siembra, Transferencia o Cosecha (una por partida)— y la convierte en las auditorías de un
   módulo, una por corrida. Una corrida puede sembrar en un módulo y transferir a otro (las planillas «modulo 4-5»):
   por eso la auditoría de un módulo trae también los módulos que una transferencia une con él, en las dos direcciones.

   🔑 `resumenAuditoria` es el MISMO cálculo que `audResumen` del motor (la ficha lo enseña al registrar): densidades con
   las toneladas de cada tanque, sobrevivencias, días, subtotales por siembra y despacho por camaronera, y —con
   transferencia— la cosecha de cada destino atribuida a sus orígenes en PROPORCIÓN a lo que cada uno le dio (decisión
   del usuario, rotulada como estimación). Lo vigila auditoria.test.js ejecutando las DOS versiones sobre los mismos
   datos: la del motor no se puede importar (es un guion clásico), así que se copia y se compara.

   `crucesConLarvicultura` pone al lado lo que dicen Datos Larvicultura del mismo tanque: el sembrado (la población del
   N5, la regla del cuadro de siembras) y lo cosechado (la última población, la de 🚛 Despacho). Sólo enseña: no decide
   cuál vale.
   ============================================================ */
import { getField } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { natCmp } from '../../core/util.js';
import { computeSiembras } from './siembras.js';
import { getters } from './stats.js';

const { gMod, gTnq, gCor, gFec, gPop } = getters;   // los lectores de Larvicultura del Supervisor (mismos alias y reglas)

export const AUDITORIA_ORIGIN = 'Registro_Auditoria';
export const AUD_SIEMBRAS = ['1ª', '2ª', '3ª'];
export const AUD_FACTURA = 0.9;   // la facturada propuesta de la ficha: el 90 % de la real

const txt = (v) => String(v == null ? '' : v).trim();
const campo = (r, h) => txt(getField(r, [h]));
/** Una cantidad de larvas: entero, sin separadores (la ficha la escribe como número; una celda tecleada puede no). */
export function entero(v) {
  const s = txt(v).replace(/[^\d]/g, '');
  return s === '' ? '' : Number(s);
}
/** PL/g, toneladas y porcentajes: decimales con coma o punto. */
export function decimal(v) {
  const s = txt(v).replace(',', '.');
  if (s === '') return '';
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}
const tq = (v) => txt(v).replace(/^tq\s*/i, '').toUpperCase();
const llave = (mod, t) => txt(mod) + '·' + tq(t);
/** La llave «módulo·tanque» de un tanque («TQ 1» = «1»; los del CIO conservan su letra). */
export const llaveTanque = llave;
const iso = (v) => {
  const d = parseAnyDate(v);
  return d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';
};
const numDe = (s) => { const m = txt(s).match(/\d+/); return m ? +m[0] : null; };
/** «M04» (Supervisor) con «M04» o «Módulo 4» por su número; CIO por sus letras (como `sameModule` de module.js). */
export function mismoModulo(a, b) {
  const na = numDe(a), nb = numDe(b);
  if (na !== null && nb !== null) return na === nb;
  return txt(a).replace(/[^a-z]/gi, '').toUpperCase() === txt(b).replace(/[^a-z]/gi, '').toUpperCase();
}

/** Una fila de la hoja, en el modelo de la ficha (el mismo de `_audActual` del motor). */
function aModelo(r) {
  const tipo = campo(r, 'Tipo');
  if (tipo === 'Siembra') {
    return ['siembras', { siembra: campo(r, 'Siembra'), modulo: campo(r, 'Módulo'), tanque: campo(r, 'Tanque'), fecha: iso(getField(r, ['Fecha'])),
      origen: campo(r, 'Origen'), guia: campo(r, 'Guía de remisión'), cantidad: campo(r, 'Cantidad'), ton: campo(r, 'Toneladas'),
      lote: campo(r, 'Lote'), codigo: campo(r, 'Código genético'), fechaIng: iso(getField(r, ['Fecha ingreso reproductores'])),
      guiasIng: campo(r, 'Guías ingreso reproductores') }];
  }
  if (tipo === 'Transferencia') {
    return ['transferencias', { fecha: iso(getField(r, ['Fecha'])), modulo: campo(r, 'Módulo'), tanque: campo(r, 'Tanque'),
      moduloDest: campo(r, 'Módulo destino'), tanqueDest: campo(r, 'Tanque destino'), cantidad: campo(r, 'Cantidad'),
      estadio: campo(r, 'Estadío'), plg: campo(r, 'PL/g'), larvasPeq: campo(r, '% larvas pequeñas') }];
  }
  if (tipo === 'Cosecha') {
    return ['cosechas', { fecha: iso(getField(r, ['Fecha'])), modulo: campo(r, 'Módulo'), tanque: campo(r, 'Tanque'), partida: campo(r, 'Partida'),
      cantidad: campo(r, 'Cantidad'), ton: campo(r, 'Toneladas'), estadio: campo(r, 'Estadío'), plg: campo(r, 'PL/g'),
      camaronera: campo(r, 'Camaronera'), piscinas: campo(r, 'Piscina(s)'), guia: campo(r, 'Guía de remisión'),
      guiaDespacho: campo(r, 'Guía de despacho'), facturada: campo(r, 'Cantidad facturada'), tinas: campo(r, 'Tinas'),
      placa: campo(r, 'Placa'), obs: campo(r, 'Observaciones'), registrado: campo(r, 'Registrado por') }];
  }
  return null;
}

/**
 * Las auditorías de un módulo: una por corrida (la elegida, o todas, la más reciente primero), con los módulos que las
 * transferencias unen con él. Cada una es el modelo de la ficha más `corrida`, `modulos` y `filas` (cuántas leyó).
 */
export function auditoriasDelModulo(rows, mod, corrida) {
  const porCorrida = new Map();
  for (const r of rows || []) {
    if (!r || r._SheetOrigin !== AUDITORIA_ORIGIN) continue;
    const c = campo(r, 'Corrida');
    if (!c || (corrida && c !== txt(corrida))) continue;
    if (!porCorrida.has(c)) porCorrida.set(c, []);
    porCorrida.get(c).push(r);
  }
  const out = [];
  for (const [c, filas] of porCorrida) {
    // Los módulos unidos al pedido por transferencias (en las dos direcciones), hasta que no entra ninguno más.
    const mods = new Set(filas.map((r) => campo(r, 'Módulo')).filter((m) => mismoModulo(m, mod)));
    if (!mods.size) {
      const comoDestino = filas.some((r) => campo(r, 'Tipo') === 'Transferencia' && mismoModulo(campo(r, 'Módulo destino'), mod));
      if (!comoDestino) continue;
      mods.add(filas.map((r) => campo(r, 'Módulo destino')).find((m) => mismoModulo(m, mod)));
    }
    let crece = true;
    while (crece) {
      crece = false;
      for (const r of filas) {
        if (campo(r, 'Tipo') !== 'Transferencia') continue;
        const o = campo(r, 'Módulo'), d = campo(r, 'Módulo destino');
        if (mods.has(o) && !mods.has(d)) { mods.add(d); crece = true; }
        if (mods.has(d) && !mods.has(o)) { mods.add(o); crece = true; }
      }
    }
    const m = { corrida: c, modulos: [...mods].sort(natCmp), siembras: [], transferencias: [], cosechas: [], filas: 0 };
    for (const r of filas) {
      const tipo = campo(r, 'Tipo');
      const enMods = mods.has(campo(r, 'Módulo')) || (tipo === 'Transferencia' && mods.has(campo(r, 'Módulo destino')));
      const x = enMods ? aModelo(r) : null;
      if (!x) continue;
      m[x[0]].push(x[1]);
      m.filas++;
    }
    out.push(m);
  }
  return out.sort((a, b) => natCmp(b.corrida, a.corrida));
}

/** La facturada propuesta (90 %) de una partida, y si la de la hoja es otra (una excepción tecleada). */
export const facturadaPropuesta = (real) => { const r = entero(real); return r === '' ? '' : Math.round(r * AUD_FACTURA); };
export function facturadaDe(c) { const f = entero(c && c.facturada); return f === '' ? facturadaPropuesta(c && c.cantidad) : f; }
export function esExcepcion(c) {
  const f = entero(c && c.facturada), p = facturadaPropuesta(c && c.cantidad);
  return f !== '' && p !== '' && f !== p;
}
const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * El resumen de una auditoría: el MISMO cálculo que `audResumen` de engine.js (ver la cabecera). Por tanque sembrado,
 * su cosecha ATRIBUIDA (la suya si nadie le transfirió; si recibió, repartida en proporción a lo que dio cada origen)
 * y sus sobrevivencias; por siembra, sus subtotales; por tanque cosechado, su densidad y la fase 2; por camaronera, el
 * despacho.
 */
export function resumenAuditoria(d) {
  const m = d || {};
  const S = (m.siembras || []).filter((s) => entero(s.cantidad) > 0 && tq(s.tanque));
  const T = (m.transferencias || []).filter((t) => entero(t.cantidad) > 0);
  const C = (m.cosechas || []).filter((c) => entero(c.cantidad) > 0 && tq(c.tanque));
  const cos = new Map(), recibe = new Map(), aportes = new Map(), salida = new Map(), tonDe = new Map();
  S.forEach((s) => { const t = decimal(s.ton); if (t > 0) tonDe.set(llave(s.modulo, s.tanque), t); });
  C.forEach((c) => { const k = llave(c.modulo, c.tanque); cos.set(k, (cos.get(k) || 0) + entero(c.cantidad)); });
  T.forEach((t) => {
    const o = llave(t.modulo, t.tanque), dst = llave(t.moduloDest, t.tanqueDest), q = entero(t.cantidad);
    recibe.set(dst, (recibe.get(dst) || 0) + q);
    salida.set(o, (salida.get(o) || 0) + q);
    if (!aportes.has(dst)) aportes.set(dst, []);
    aportes.get(dst).push({ origen: o, q });
  });
  const atribuida = new Map(); let estimada = false;
  cos.forEach((h, k) => {
    const ap = aportes.get(k);
    if (!ap || !ap.length) { atribuida.set(k, (atribuida.get(k) || 0) + h); return; }
    estimada = true;
    const tot = recibe.get(k);
    ap.forEach((a) => { atribuida.set(a.origen, (atribuida.get(a.origen) || 0) + h * a.q / tot); });
  });
  const tanques = S.map((s) => {
    const k = llave(s.modulo, s.tanque), sem = entero(s.cantidad), ton = decimal(s.ton);
    const at = atribuida.has(k) ? Math.round(atribuida.get(k)) : null;
    const out = salida.get(k) || 0;
    const ultima = C.filter((c) => llave(c.modulo, c.tanque) === k).map((c) => c.fecha).sort().pop() || '';
    return { llave: k, siembra: s.siembra, modulo: s.modulo, tanque: tq(s.tanque), sembrado: sem,
      densidad: ton > 0 ? Math.round(sem / ton / 1000) : null,
      transferido: out || null, sobFase1: out ? out / sem : null,
      cosechado: at, sob: at === null ? null : at / sem, estimada: !!(out || (aportes.get(k) && aportes.get(k).length)),
      dias: ultima && s.fecha ? dias(s.fecha, ultima) : null };
  });
  const bloques = AUD_SIEMBRAS.map((n) => {
    const ts = tanques.filter((t) => t.siembra === n);
    if (!ts.length) return null;
    const sem = ts.reduce((a, t) => a + t.sembrado, 0);
    const cosech = ts.reduce((a, t) => a + (t.cosechado || 0), 0);
    return { siembra: n, tanques: ts.length, sembrado: sem, cosechado: cosech, sob: sem ? cosech / sem : null };
  }).filter(Boolean);
  const cosechados = [...cos.entries()].map(([k, h]) => {
    const c0 = C.find((c) => llave(c.modulo, c.tanque) === k && decimal(c.ton) > 0);
    const ton = tonDe.get(k) || (c0 ? decimal(c0.ton) : null);
    return { llave: k, cosechado: h, densidad: ton ? Math.round(h / ton / 1000) : null, recibido: recibe.get(k) || null,
      sobFase2: recibe.get(k) ? h / recibe.get(k) : null };
  });
  const porCam = new Map();
  C.forEach((c) => {
    const k = txt(c.camaronera) || 'Sin camaronera';
    const o = porCam.get(k) || { camaronera: k, real: 0, facturada: 0, plgPeso: 0, plgReal: 0, tinas: 0, placas: new Set(), partidas: 0, excepciones: 0 };
    const real = entero(c.cantidad), plg = decimal(c.plg);
    o.real += real; o.facturada += facturadaDe(c) || 0; o.partidas++;
    if (plg > 0) { o.plgPeso += plg * real; o.plgReal += real; }
    o.tinas += entero(c.tinas) || 0;
    if (txt(c.placa)) o.placas.add(txt(c.placa).toUpperCase());
    if (esExcepcion(c)) o.excepciones++;
    porCam.set(k, o);
  });
  const camaroneras = [...porCam.values()].map((o) => ({ camaronera: o.camaronera, real: o.real, facturada: o.facturada, partidas: o.partidas,
    excepciones: o.excepciones, plg: o.plgReal ? Math.round(o.plgPeso / o.plgReal) : null, tinas: o.tinas, camiones: o.placas.size }))
    .sort((a, b) => b.real - a.real);
  const sembradoTotal = tanques.reduce((a, t) => a + t.sembrado, 0);
  const cosechadoTotal = C.reduce((a, c) => a + entero(c.cantidad), 0);
  return { tanques, bloques, cosechados, camaroneras, estimada,
    sembrado: sembradoTotal, cosechado: cosechadoTotal, sob: sembradoTotal ? cosechadoTotal / sembradoTotal : null };
}

/**
 * Lo que dicen Datos Larvicultura del mismo tanque de la misma corrida, al lado de la auditoría: el sembrado (la
 * población del N5 —`computeSiembras`, la regla del cuadro de siembras—) y lo cosechado (la ÚLTIMA población del
 * tanque, la «Cantidad cosechada» de 🚛 Despacho). `larvRows` son las filas de Larvicultura (con su Módulo y Corrida).
 */
export function crucesConLarvicultura(aud, larvRows) {
  const r = resumenAuditoria(aud);
  const filasDe = (mod) => (larvRows || []).filter((x) => mismoModulo(gMod(x), mod) && txt(gCor(x)) === aud.corrida);
  const porTanque = new Map();   // llave → { sembradoLarv, cosechadoLarv }
  for (const mod of aud.modulos) {
    const filas = filasDe(mod);
    const sie = computeSiembras(filas);
    for (const g of sie.siembras || []) for (const t of g.tanks || []) porTanque.set(llave(mod, t.tq), { sembradoLarv: t.siembra });
    const porTq = new Map();
    for (const x of filas) { const k = llave(mod, gTnq(x)); if (!porTq.has(k)) porTq.set(k, []); porTq.get(k).push(x); }
    for (const [k, xs] of porTq) {
      const orden = xs.slice().sort((a, b) => (parseAnyDate(gFec(a)) || 0) - (parseAnyDate(gFec(b)) || 0));
      let ultima = null;
      for (let i = orden.length - 1; i >= 0; i--) { const p = gPop(orden[i]); if (p !== null) { ultima = p; break; } }
      const o = porTanque.get(k) || {};
      o.cosechadoLarv = ultima;
      porTanque.set(k, o);
    }
  }
  const llaves = new Set([...r.tanques.map((t) => t.llave), ...r.cosechados.map((c) => c.llave)]);
  return [...llaves].sort(natCmp).map((k) => {
    const t = r.tanques.find((x) => x.llave === k), c = r.cosechados.find((x) => x.llave === k), l = porTanque.get(k) || {};
    const sembrado = t ? t.sembrado : null, cosechado = c ? c.cosechado : null;
    const sembradoLarv = l.sembradoLarv ?? null, cosechadoLarv = l.cosechadoLarv ?? null;
    return { llave: k, sembrado, sembradoLarv, difSiembra: sembrado && sembradoLarv ? (sembrado - sembradoLarv) / sembradoLarv : null,
      cosechado, cosechadoLarv, difCosecha: cosechado && cosechadoLarv ? (cosechado - cosechadoLarv) / cosechadoLarv : null };
  });
}
