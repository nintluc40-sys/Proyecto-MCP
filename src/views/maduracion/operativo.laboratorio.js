/* ============================================================
   MADURACIÓN · OPERATIVO · LO DEL LABORATORIO (0f · 8, 2026-09-26, usuario)

   Dos modales del tablero, con lo que el laboratorio mide de Maduración:
     · 🦠 Micro y agua → ① reproductores (formato «Maduración · Principal», hepatopáncreas): muestras en alerta por
       patógeno, por sala y por sexo, y las últimas · ② desinfección de huevo y nauplio («Maduración · Despacho»): antes
       frente a después · ③ agua y RAS: la micro de los demás formatos de Maduración y la hoja de Calidad de Agua
       (parámetros fuera de rango e índice de calidad, por componente);
     · 🧬 Biomol · reproductores → positivos ÷ analizados por patógeno, por sala (lo que no es una sala, aparte), por
       piscina de origen y por sexo; la tendencia semanal y la lista de los positivos.
   Decisiones del usuario (2026-09-26): SIGUEN los filtros del tablero —período, sala, tanque, sexo y lote— en lo que
   cada hoja tenga, y dicen el que no pueden aplicar. Una muestra que no dice su sala (o su tanque, su sexo, su lote)
   no entra con ese filtro puesto: no se sabe si es de ahí.
   🔑 Las reglas de NIVEL (umbrales por área), de rango de calidad de agua y de resultado de Biomol NO se repiten aquí:
   se usan las de sus vistas (microbiologia/data.js, calagua.data.js y, para Biomol, las filas que ya normalizó
   `normalizeRows`). Módulo puro: la vista le da las filas y los rangos.
   ============================================================ */
import { rowContext, meltRow, isMicroRow, isAlerta, NIVEL_RANK, NIVELES, deptoOfFormato, FORMATO_LABEL } from '../microbiologia/data.js';
import { isCalAguaRow, calCtx, calMeasured, calWQI } from '../microbiologia/calagua.data.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';

const txt = (v) => (v == null ? '' : String(v).trim());
const fold = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const pad2 = (n) => String(n).padStart(2, '0');
const isoDe = (d) => (d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '');
const enPeriodo = (f, p) => !!f && f >= p.desde && f <= p.hasta;
const mediana = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
/** ¿Es una sala («Sala 3»)? Lo demás —una piscina de origen, «Chongón»— está FUERA de las salas. */
const esSala = (lugar) => /^sala\s*\d/i.test(txt(lugar));
const esMaduracion = (depto, formatoKey) => fold(depto).startsWith('maduracion') || (!txt(depto) && deptoOfFormato(formatoKey) === 'Maduración');

/* ── EL FILTRO DEL TABLERO, sobre una muestra ────────────────────────────────────────────────────────────────── */
/** Cómo se lee cada dimensión del filtro en una muestra. `sala`: «Sala 2»; `tanque`: su número (en Biomol viene
 *  «Tq 5»); `sexo`: la inicial (Hembra/Hembras ↔ hembras); `lote`: el lote normalizado. */
const mismoValor = {
  sala: (v, f) => fold(v) === fold(f),
  tanque: (v, f) => { const m = /(\d+)/.exec(txt(v)); return !!m && String(Number(m[1])) === String(Number(f)); },
  sexo: (v, f) => !!fold(v) && fold(v)[0] === fold(f)[0],
  lote: (v, f) => !!txt(v) && normLote(v) === f,
};
/** Las dimensiones del tablero que NINGUNA hoja del laboratorio registra: con ellas puestas, se dice. */
const SIN_EQUIVALENTE = [['codigo', 'código genético'], ['estado', 'estado'], ['piscina', 'piscina de origen'], ['camaronera', 'camaronera']];
/**
 * El filtro del tablero para una hoja que registra las dimensiones `tiene` (subconjunto de sala, tanque, sexo, lote).
 * Devuelve `{ pasa(muestra), ignora, sinDato }`: `muestra` trae `fecha` (ISO) y las dimensiones por su nombre;
 * `ignora` son los filtros puestos que esta hoja no puede aplicar; `sinDato` cuenta, por dimensión, las muestras del
 * período que se quedaron fuera por no decirla.
 */
export function filtroDelTablero(F, periodo, tiene) {
  const activos = ['sala', 'tanque', 'sexo', 'lote'].filter((d) => F[d] !== null && F[d] !== undefined && F[d] !== '');
  const aplica = activos.filter((d) => tiene.includes(d));
  const ignora = [...activos.filter((d) => !tiene.includes(d)), ...SIN_EQUIVALENTE.filter(([k]) => F[k]).map(([, r]) => r)];
  const sinDato = {};
  const pasa = (m) => {
    if (!enPeriodo(m.fecha, periodo)) return false;
    for (const d of aplica) {
      if (!txt(m[d])) { sinDato[d] = (sinDato[d] || 0) + 1; return false; }
      if (!mismoValor[d](m[d], F[d])) return false;
    }
    return true;
  };
  return { pasa, ignora, sinDato };
}

/* ── 🦠 MICROBIOLOGÍA Y CALIDAD DE AGUA ──────────────────────────────────────────────────────────────────────── */
/** Una fila de Microbiología como MUESTRA: su contexto, sus mediciones con nivel (la regla de la vista de
 *  Microbiología: umbrales por área) y su PEOR nivel. */
function muestraMicro(row) {
  const ctx = rowContext(row);
  const med = meltRow(row);
  const peor = med.reduce((a, m) => (m.nivel && (a === '' || NIVEL_RANK[m.nivel] > NIVEL_RANK[a]) ? m.nivel : a), '');
  /* «TQ/N°» no siempre es un tanque: en el hepatopáncreas trae a veces la PISCINA de origen («Piscina 556», medido el
     2026-09-26), tomada antes del ingreso. Eso es un LUGAR fuera de las salas —como «Chongón» en Biomol—, no un
     tanque: no casa con el filtro de tanque y va aparte en «Por sala». */
  const tqNum = /^\d+$/.test(txt(ctx.tq));
  const fuera = !ctx.sala && !tqNum ? txt(ctx.tq) : '';
  return { row, ctx, med, peor, fecha: isoDe(ctx.fecha), sala: ctx.sala, tanque: tqNum ? ctx.tq : '', sexo: ctx.sexo, lote: txt(row.Lote),
    lugar: ctx.sala || fuera };
}

/** La etapa, la matriz y el momento de una muestra de Despacho, desde su «Tipo de muestra» (p. ej. «Agua del
 *  nauplio 2 antes de desinfección»). Lo que no se reconoce queda vacío y la muestra se cuenta aparte. */
export function tipoDeDespacho(raw) {
  const k = fold(raw);
  const etapa = /huevo/.test(k) ? 'Huevo' : /nauplio\s*2|\bn-?2\b/.test(k) ? 'Nauplio 2' : /nauplio\s*5|\bn-?5\b/.test(k) ? 'Nauplio 5' : '';
  const matriz = k.startsWith('agua') ? 'Agua' : k ? 'Animal' : '';
  const momento = /despues/.test(k) ? 'despues' : /antes/.test(k) ? 'antes' : '';
  return { etapa, matriz, momento };
}
const ETAPAS = ['Huevo', 'Nauplio 2', 'Nauplio 5'];
/** Lo que una muestra de Microbiología PUEDE decir de sí misma. */
const DIM_MICRO = ['sala', 'tanque', 'sexo', 'lote'];
/** El filtro del tablero sobre un BLOQUE (muestras del período). Una dimensión se aplica si alguna muestra del bloque
 *  la registra —entonces la que no la dice queda fuera: no se sabe si es de ahí—; si NINGUNA la registra (el agua no
 *  tiene sexo; el despacho, sala), el filtro no puede aplicarse a ese bloque y se dice. */
function filtrarBloque(lista, F, periodo, dims) {
  const tiene = dims.filter((d) => lista.some((m) => txt(m[d])));
  const f = filtroDelTablero(F, periodo, tiene);
  return { muestras: lista.filter(f.pasa), ignora: f.ignora, sinDato: f.sinDato };
}

/**
 * Los tres bloques del modal de Microbiología, con los filtros del tablero.
 * @param {object[]} filas       store.globalData (se toman las de Microbiología y Calidad de Agua de Maduración)
 * @param {{desde,hasta}} periodo
 * @param {object} F             el filtro normalizado del tablero
 * @param {object} rangosCal     los rangos de Calidad de Agua (loadCalRanges de su vista)
 */
export function resumenMicro(filas, periodo, F, rangosCal) {
  const todas = (filas || []).filter(isMicroRow).map(muestraMicro)
    .filter((m) => esMaduracion(m.ctx.departamento, m.ctx.formatoKey) && enPeriodo(m.fecha, periodo));
  const bloqueRep = filtrarBloque(todas.filter((m) => m.ctx.formatoKey === 'mad-principal'), F, periodo, DIM_MICRO);
  const bloqueDes = filtrarBloque(todas.filter((m) => m.ctx.formatoKey === 'mad-desinf'), F, periodo, DIM_MICRO);
  const bloqueAgua = filtrarBloque(todas.filter((m) => m.ctx.formatoKey !== 'mad-principal' && m.ctx.formatoKey !== 'mad-desinf'), F, periodo, DIM_MICRO);

  // ① Reproductores: el formato Principal (hepatopáncreas).
  const rep = bloqueRep.muestras;
  const porPat = new Map();
  for (const m of rep) {
    for (const x of m.med) {
      if (!x.nivel) continue;
      const p = porPat.get(x.key) || { key: x.key, etiqueta: x.label, analizadas: 0, alerta: 0, niveles: Object.fromEntries(NIVELES.map((n) => [n, 0])) };
      p.analizadas++;
      p.niveles[x.nivel]++;
      if (isAlerta(x.nivel)) p.alerta++;
      porPat.set(x.key, p);
    }
  }
  const agrupa = (lista, clave) => {
    const g = new Map();
    for (const m of lista) {
      const k = txt(clave(m)) || '(sin dato)';
      const o = g.get(k) || { clave: k, muestras: 0, alerta: 0 };
      o.muestras++;
      if (isAlerta(m.peor)) o.alerta++;
      g.set(k, o);
    }
    return [...g.values()].sort((a, b) => porNombre(a.clave, b.clave));
  };
  const recientes = (lista, n) => lista.slice().sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0)).slice(0, n);
  const reproductores = {
    ignora: bloqueRep.ignora, sinDato: bloqueRep.sinDato,
    muestras: rep.length, alerta: rep.filter((m) => isAlerta(m.peor)).length,
    porPatogeno: [...porPat.values()].sort((a, b) => b.alerta / b.analizadas - a.alerta / a.analizadas || porNombre(a.etiqueta, b.etiqueta)),
    porSala: agrupa(rep, (m) => m.lugar).map((x) => ({ ...x, fueraDeSalas: !esSala(x.clave) && x.clave !== '(sin dato)' }))
      .sort((a, b) => (esSala(b.clave) - esSala(a.clave)) || ((a.clave === '(sin dato)') - (b.clave === '(sin dato)')) || porNombre(a.clave, b.clave)),
    porSexo: agrupa(rep, (m) => m.sexo),
    ultimas: recientes(rep, 10).map((m) => ({ fecha: m.fecha, lugar: m.lugar, tanque: m.tanque, sexo: m.sexo, peor: m.peor,
      enAlerta: m.med.filter((x) => isAlerta(x.nivel)).map((x) => x.label) })),
  };

  // ② Desinfección de huevo y nauplio: el formato Despacho, antes frente a después.
  const des = bloqueDes.muestras;
  const celdas = new Map();
  let sinTipo = 0;
  for (const m of des) {
    const t = tipoDeDespacho(m.row['Tipo de muestra']);
    if (!t.etapa || !t.momento) { sinTipo++; continue; }
    const k = t.etapa + '|' + t.matriz;
    const c = celdas.get(k) || { etapa: t.etapa, matriz: t.matriz, antes: { muestras: 0, alerta: 0 }, despues: { muestras: 0, alerta: 0 } };
    c[t.momento].muestras++;
    if (isAlerta(m.peor)) c[t.momento].alerta++;
    celdas.set(k, c);
  }
  const desinfeccion = {
    ignora: bloqueDes.ignora, sinDato: bloqueDes.sinDato,
    muestras: des.length, sinTipo,
    filas: [...celdas.values()].sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa) || porNombre(b.matriz, a.matriz)),
  };

  // ③ Agua y RAS: la micro de los demás formatos de Maduración, por formato y componente…
  const aguaMic = bloqueAgua.muestras;
  const micro = agrupa(aguaMic, (m) => [FORMATO_LABEL[m.ctx.formatoKey] || m.ctx.formato || '(sin formato)', m.ctx.componente].filter(Boolean).join(' · '));
  // …y la hoja de Calidad de Agua de Maduración, por componente (o sala, o tipo): muestras, índice de calidad
  // (mediana de las muestras) y los parámetros que más veces salieron de rango.
  const bloqueCal = filtrarBloque((filas || []).filter(isCalAguaRow).map((row) => { const c = calCtx(row); return { row, c, fecha: isoDe(c.fecha), sala: c.sala, tanque: c.tq }; })
    .filter((m) => esMaduracion(m.c.depto, '') && enPeriodo(m.fecha, periodo)), F, periodo, ['sala', 'tanque']);
  const cal = bloqueCal.muestras;
  const grupos = new Map();
  for (const m of cal) {
    const k = txt(m.c.componente) || txt(m.c.sala) || txt(m.c.formato).replace(/^Maduraci[oó]n\s*·\s*/i, '') || '(sin componente)';
    const med = calMeasured(m.row, rangosCal);
    const g = grupos.get(k) || { grupo: k, muestras: 0, wqis: [], fuera: 0, porParam: new Map(), ultima: '' };
    g.muestras++;
    g.wqis.push(calWQI(med, rangosCal).wqi);
    for (const x of med) if (x.estado === 'fuera') { g.fuera++; g.porParam.set(x.label, (g.porParam.get(x.label) || 0) + 1); }
    if (m.fecha > g.ultima) g.ultima = m.fecha;
    grupos.set(k, g);
  }
  const calidad = {
    ignora: bloqueCal.ignora, sinDato: bloqueCal.sinDato,
    muestras: cal.length,
    porGrupo: [...grupos.values()].map((g) => ({ grupo: g.grupo, muestras: g.muestras, wqi: mediana(g.wqis), fuera: g.fuera, ultima: g.ultima,
      peores: [...g.porParam].sort((a, b) => b[1] - a[1] || porNombre(a[0], b[0])).slice(0, 3).map(([label, n]) => ({ label, n })) }))
      .sort((a, b) => porNombre(a.grupo, b.grupo)),
  };
  return { reproductores, desinfeccion, agua: { ignora: bloqueAgua.ignora, sinDato: bloqueAgua.sinDato, micro, calidad } };
}

/* ── 🧬 BIOMOL · REPRODUCTORES ────────────────────────────────────────────────────────────────────────────────── */
/** Los patógenos de Biomol, en el orden y con la etiqueta de su vista (biomolecular/index.js · DLABEL). */
export const BIOMOL_PATOGENOS = [
  { key: 'IHHNV', etiqueta: 'IHHNV' }, { key: 'WSSV', etiqueta: 'WSSV' }, { key: 'BP', etiqueta: 'BP' },
  { key: 'AHPND', etiqueta: 'AHPND/EMS' }, { key: 'NHPB', etiqueta: 'NHPB' }, { key: 'EHP', etiqueta: 'EHP' },
];
/** ¿Es un reproductor? Su estadío lo dice; o, sin estadío, su lugar es Maduración. */
export const esReproductor = (r) => /repro/i.test(txt(r.estadio)) || (!txt(r.estadio) && /madur/i.test(txt(r.lugar)));

/** Lunes (ISO) de la semana de una fecha ISO. */
function lunesDe(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dia + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * La prevalencia en los reproductores, con los filtros del tablero.
 * @param {object[]} filasNorm  filas de Biomol YA normalizadas (`normalizeRows` de su vista: `f` ISO, `lugar`, `tq`,
 *                              `piscina`, `sexo`, `estadio` y un 'Positivo' | 'Negativo' | '' por patógeno)
 */
export function resumenBiomol(filasNorm, periodo, F) {
  const filtro = filtroDelTablero(F, periodo, ['sala', 'tanque', 'sexo']);
  const lista = (filasNorm || []).filter(esReproductor)
    .map((r) => ({ r, fecha: r.f, sala: esSala(r.lugar) ? r.lugar : '', tanque: r.tq === '—' ? '' : r.tq, sexo: r.sexo }))
    .filter(filtro.pasa).map((x) => x.r);
  const cuenta = (rs) => Object.fromEntries(BIOMOL_PATOGENOS.map(({ key }) => {
    const con = rs.filter((r) => r[key] === 'Positivo' || r[key] === 'Negativo');
    return [key, { analizadas: con.length, positivos: con.filter((r) => r[key] === 'Positivo').length }];
  }));
  const agrupa = (clave, orden) => {
    const g = new Map();
    for (const r of lista) { const k = clave(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    return [...g].sort(orden).map(([k, rs]) => ({ clave: k, muestras: rs.length, patogenos: cuenta(rs) }));
  };
  const lugar = (r) => (esSala(r.lugar) ? txt(r.lugar) : txt(r.lugar) || 'Sin lugar');
  const porSala = agrupa(lugar, ([a], [b]) => (esSala(b) - esSala(a)) || porNombre(a, b))
    .map((x) => ({ ...x, fueraDeSalas: !esSala(x.clave) }));
  const semanas = [];
  for (let d = lunesDe(periodo.desde); d <= periodo.hasta; d = new Date(Date.parse(d + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10)) semanas.push(d);
  const porSemana = new Map(semanas.map((s) => [s, []]));
  for (const r of lista) { const s = lunesDe(r.f); if (porSemana.has(s)) porSemana.get(s).push(r); }
  const tendencia = {
    etiquetas: semanas,
    series: BIOMOL_PATOGENOS.map(({ key, etiqueta }) => ({ clave: key, etiqueta, datos: semanas.map((s) => {
      const c = cuenta(porSemana.get(s))[key];
      return c.analizadas ? Math.round((c.positivos / c.analizadas) * 1000) / 10 : null;
    }) })).filter((s) => s.datos.some((v) => v !== null)),
  };
  const positivos = lista.filter((r) => BIOMOL_PATOGENOS.some(({ key }) => r[key] === 'Positivo'))
    .sort((a, b) => (b.f > a.f ? 1 : b.f < a.f ? -1 : 0)).slice(0, 20)
    .map((r) => ({ fecha: r.f, lugar: lugar(r), tanque: r.tq === '—' ? '' : r.tq, piscina: r.piscina, sexo: r.sexo,
      patogenos: BIOMOL_PATOGENOS.filter(({ key }) => r[key] === 'Positivo').map((p) => p.etiqueta) }));
  return {
    ignora: filtro.ignora, sinDato: filtro.sinDato, muestras: lista.length,
    total: cuenta(lista),
    porSala,
    porPiscina: agrupa((r) => txt(r.piscina) || '(sin piscina)', ([a], [b]) => porNombre(a, b)),
    porSexo: agrupa((r) => txt(r.sexo) || '(sin sexo)', ([a], [b]) => porNombre(a, b)),
    tendencia, positivos,
  };
}
