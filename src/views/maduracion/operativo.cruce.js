/* ============================================================
   MADURACIÓN · OPERATIVO — EL CRUCE CON 🧬 MICROCHIPS (F6.3, 2026-09-21)

   Lo que enseña «🩺 Calidad del dato» del registro REPRODUCTIVO (la MATRIZ de hembras con chip, su Bitácora y sus
   Transferencias) frente al OPERATIVO (el libro). Diseño aprobado por el usuario el 2026-09-21: «sólo lo que no
   puede ser». Módulo PURO: ni DOM ni red.

   Se MARCA:
     1. un tanque con MÁS hembras con chip vivas de un lote que hembras de ese lote según el libro;
     2. una hembra con chip viva en un tanque donde el libro no tiene su lote;
     3. un evento de la Bitácora en otra ubicación que la de su hembra ese día, sin traslado que lo explique (el caso
        V6). «Dónde estaba la hembra ese día» es `resolveEventLocation`, la regla de 🧬 Microchips.
   NO se marca —y se dice por qué—:
     · que haya MENOS hembras con chip que hembras en el libro: no todas llevan chip;
     · los lotes de la MATRIZ que el operativo no conoce: se listan aparte;
     · los desoves: la Bitácora cuenta eventos por hembra y la hoja de Desoves, desoves por lote; se ponen lado a lado
       para informar, sin juzgar.

   🔑 LA MATRIZ ES EL ESTADO ACTUAL: no guarda dónde estaba cada hembra otro día. Por eso se cruza con el libro de
   HOY, no con el de la foto; la vista le pasa ese libro y lo dice cuando la foto es de otro día.

   🔑 LAS UBICACIONES SE ESCRIBEN DISTINTO: «Tanque 18» en el reproductivo y 18 en el operativo. Medido el
   2026-09-21: las 1665 filas de la MATRIZ y las 2227 de la Bitácora dicen «Sala N» y «Tanque N». Se comparan por su
   forma canónica (`salaCanonica`, `tanqueCanonico`).
   ============================================================ */
import { normLote, normCodigoGenetico } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { ESTADO_MUERTO, resolveEventLocation } from './data.js';
import { fechaDeFila } from './operativo.data.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const ent = (v) => { const n = Number(txt(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const enPeriodo = (f, p) => esIso(f) && (!p || (f >= p.desde && f <= p.hasta));
/** El día de un evento del reproductivo (un Date local de `parseAnyDate`), como el `dayKey` de 🧬 Microchips. */
const isoDe = (d) => (d instanceof Date && !Number.isNaN(d.getTime())
  ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '');

/** «Sala 2», «sala 2», «S2» y «2» son la misma sala: la del operativo, «Sala 2». Lo que no tiene número se deja. */
export function salaCanonica(v) {
  const s = txt(v);
  const m = /^(?:sala\s*|s\s*)?(\d+)\s*([a-z])?$/i.exec(s);
  return m ? 'Sala ' + Number(m[1]) + (m[2] ? m[2].toUpperCase() : '') : s;
}
/** «Tanque 18», «T18» y 18 son el tanque 18 del operativo. `null` si no dice ningún número. */
export function tanqueCanonico(v) {
  const m = /^(?:tanque\s*|t\s*)?(\d+)$/i.exec(txt(v));
  return m ? Number(m[1]) : null;
}
const ubic = (sala, tanque) => salaCanonica(sala) + ' · ' + tanqueCanonico(tanque);

const ROTULO_DIM = { estado: 'estado', sexo: 'sexo', piscina: 'piscina', camaronera: 'camaronera' };
/** Lo que el cruce no puede aplicar: sala, tanque, lote y código sí se aplican a los dos registros. */
export function ignoraDeCruce(F) {
  return Object.keys(ROTULO_DIM).filter((d) => F && F[d]).map((d) => ROTULO_DIM[d]);
}
const enLugar = (F, sala, tanque) => (!F || !F.sala || salaCanonica(sala) === F.sala)
  && (!F || F.tanque === null || F.tanque === undefined || tanqueCanonico(tanque) === F.tanque);
const enOrigen = (F, lote, codigo) => (!F || !F.lote || normLote(lote) === F.lote)
  && (!F || !F.codigo || normCodigoGenetico(codigo) === F.codigo);

/**
 * El cruce. `repro` es el modelo de 🧬 Microchips (`buildReproModel`), `libro` el del operativo AL CIERRE DE HOY,
 * `fuentes` las hojas del operativo (para los desoves) y `periodo` acota los eventos y los desoves.
 * Devuelve las discrepancias de tanque (`mas-chips` y `lote-ausente`), los eventos sin explicar, el resumen de los
 * lotes que están en los dos registros, los que sólo están en la MATRIZ y los desoves lado a lado.
 */
export function cruceConMicrochips(repro, libro, fuentes, periodo, F) {
  const R = repro || { females: [], desoves: [], mortalidades: [], byTrovan: new Map(), movByTrovan: new Map() };

  /* El libro: hembras vivas de cada lote en cada tanque, y qué lotes conoce. */
  const lotesLibro = new Set([...(((libro || {}).lotes) || new Map()).keys()].map(normLote));
  const enLibro = new Map();   // ubic|lote → { sala, tanque, lote, hembras, vivos }
  for (const p of (libro || {}).posiciones || []) {
    if (!enLugar(F, p.sala, p.tanque) || !enOrigen(F, p.lote, p.codigoGenetico)) continue;
    const k = ubic(p.sala, p.tanque) + '|' + normLote(p.lote);
    const o = enLibro.get(k) || { sala: salaCanonica(p.sala), tanque: tanqueCanonico(p.tanque), lote: normLote(p.lote), hembras: 0, vivos: 0 };
    o.hembras += ent(p.hembras);
    o.vivos += ent(p.hembras) + ent(p.machos);
    enLibro.set(k, o);
  }

  /* La MATRIZ: hembras con chip VIVAS de cada lote en cada tanque. */
  let sinLote = 0;
  let sinUbicacion = 0;
  const conChip = new Map();   // ubic|lote → { sala, tanque, lote, n }
  const fuera = new Map();     // lote → { lote, vivas, tanques:Set }
  for (const f of R.females || []) {
    if (f.estado === ESTADO_MUERTO) continue;
    if (!enLugar(F, f.sala, f.tanque) || !enOrigen(F, f.lote, f.codigo)) continue;
    const lote = normLote(f.lote);
    if (!lote) { sinLote++; continue; }
    if (tanqueCanonico(f.tanque) === null) { sinUbicacion++; continue; }
    const u = ubic(f.sala, f.tanque);
    if (!lotesLibro.has(lote)) {
      const o = fuera.get(lote) || { lote, vivas: 0, tanques: new Set() };
      o.vivas++;
      o.tanques.add(u);
      fuera.set(lote, o);
      continue;
    }
    const k = u + '|' + lote;
    const o = conChip.get(k) || { sala: salaCanonica(f.sala), tanque: tanqueCanonico(f.tanque), lote, n: 0 };
    o.n++;
    conChip.set(k, o);
  }

  /* 1 y 2 · lo que no puede ser, tanque a tanque. */
  const discrepancias = [];
  for (const [k, c] of conChip) {
    const L = enLibro.get(k);
    if (!L || L.vivos === 0) discrepancias.push({ tipo: 'lote-ausente', sala: c.sala, tanque: c.tanque, lote: c.lote, conChip: c.n, enLibro: 0 });
    else if (c.n > L.hembras) discrepancias.push({ tipo: 'mas-chips', sala: c.sala, tanque: c.tanque, lote: c.lote, conChip: c.n, enLibro: L.hembras });
  }
  discrepancias.sort((a, b) => porNombre(a.sala, b.sala) || a.tanque - b.tanque || porNombre(a.lote, b.lote));

  /* El resumen de los lotes que están en los dos registros. */
  const comunes = new Map();
  const de = (lote) => comunes.get(lote) || (comunes.set(lote, { lote, hembrasLibro: 0, vivasConChip: 0, tanquesLibro: new Set(), tanquesChip: new Set() }), comunes.get(lote));
  for (const c of conChip.values()) { const o = de(c.lote); o.vivasConChip += c.n; o.tanquesChip.add(c.sala + ' · ' + c.tanque); }
  for (const L of enLibro.values()) {
    if (!comunes.has(L.lote) || L.vivos === 0) continue;
    const o = comunes.get(L.lote);
    o.hembrasLibro += L.hembras;
    o.tanquesLibro.add(L.sala + ' · ' + L.tanque);
  }
  const lista = (s) => [...s].sort(porNombre);
  const resumen = [...comunes.values()].map((o) => ({
    lote: o.lote, hembrasLibro: o.hembrasLibro, vivasConChip: o.vivasConChip,
    tanquesLibro: lista(o.tanquesLibro), tanquesChip: lista(o.tanquesChip),
    enComun: [...o.tanquesChip].filter((t) => o.tanquesLibro.has(t)).length,
  })).sort((a, b) => porNombre(a.lote, b.lote));

  /* 3 · los eventos de la Bitácora en otra ubicación que la de su hembra ese día (V6). */
  const sinExplicar = [];
  let revisados = 0;
  let sinMatriz = 0;
  const eventos = (R.desoves || []).map((e) => ['Desove', e]).concat((R.mortalidades || []).map((e) => ['Mortalidad', e]));
  for (const [tipo, e] of eventos) {
    const fecha = isoDe(e.date);
    if (!enPeriodo(fecha, periodo) || !enOrigen(F, e.lote, e.codigo)) continue;
    if (!R.byTrovan.has(e.trovan)) { sinMatriz++; continue; }
    const h = resolveEventLocation(e.trovan, e.date, R.byTrovan, R.movByTrovan);
    if (!enLugar(F, e.sala, e.tanque) && !enLugar(F, h.sala, h.tanque)) continue;
    revisados++;
    if (ubic(e.sala, e.tanque) === ubic(h.sala, h.tanque)) continue;
    sinExplicar.push({ fecha, tipo, trovan: e.trovan, lote: normLote(e.lote),
      evento: { sala: salaCanonica(e.sala), tanque: tanqueCanonico(e.tanque) },
      hembra: { sala: salaCanonica(h.sala), tanque: tanqueCanonico(h.tanque) },
      conTraslados: ((R.movByTrovan.get(e.trovan)) || []).length > 0 });
  }
  sinExplicar.sort((a, b) => porNombre(b.fecha, a.fecha) || porNombre(a.trovan, b.trovan));

  /* Los desoves lado a lado, de los lotes que están en los dos registros: sólo para informar. Son del LOTE ENTERO
     en los dos lados: la hoja de Desoves no dice sala ni tanque, y filtrar sólo la Bitácora por ubicación pondría
     una cifra de una sala junto a una del lote entero. */
  const desoves = resumen.map(({ lote }) => {
    let bitacora = 0;
    const hembras = new Set();
    for (const e of R.desoves || []) {
      if (normLote(e.lote) !== lote || !enPeriodo(isoDe(e.date), periodo) || !enOrigen(F, e.lote, e.codigo)) continue;
      bitacora++;
      hembras.add(e.trovan);
    }
    let operativo = 0;
    for (const r of (fuentes || {}).desoves || []) {
      if (normLote(r.Lote) !== lote || !enPeriodo(fechaDeFila('desoves', r), periodo) || !enOrigen(F, r.Lote, r['Código genético'])) continue;
      operativo += ent(r.Desoves);
    }
    return { lote, bitacora, hembrasQueDesovaron: hembras.size, operativo };
  });

  return {
    discrepancias, resumen,
    fuera: [...fuera.values()].map((o) => ({ lote: o.lote, vivas: o.vivas, tanques: o.tanques.size })).sort((a, b) => porNombre(a.lote, b.lote)),
    eventos: { revisados, sinExplicar, sinMatriz },
    desoves, sinLote, sinUbicacion,
    ignora: ignoraDeCruce(F),
  };
}
