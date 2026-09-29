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
import { loadMicThresholds, PATHOGEN_BY_KEY } from '../microbiologia/data.js';   // 0q·5a
import { areaForFormat } from '../microbiologia/data.js';   // 0q·5b
import { isCalAguaRow, calCtx, calMeasured, calWQI } from '../microbiologia/calagua.data.js';
import { calRangeText } from '../microbiologia/calagua.data.js';   // 0q·5c
import { tipoDeMuestra, matrizTejidos, franjaTejidos } from '../biomolecular/tejidos.js';   // 0q·7 · las reglas de su vista
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
function muestraMicro(row, ctx = rowContext(row)) {
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

/* ── 0r·3a (2026-09-28, usuario) · «la ventana de Microbiología congela» · PREPARAR UNA VEZ ─────────────────────────────
   Medido en Chrome con datos reales: en CADA pintada de la ventana, las opciones y el resumen recorrían TODO el store y
   `muestraMicro` (rowContext + meltRow, lo caro) se hacía sobre las muestras de TODA la granja antes de quedarse con las de
   Maduración: 1,0–1,5 s por clic en un PC, 6,6–7,4 s en un equipo de campo (CPU ×4). Ahora las muestras de Maduración se
   PREPARAN una vez por carga de datos —el array del store es la clave: al refrescar llega otro— y la de otro departamento
   se descarta ANTES de fundir sus mediciones; cada filtro, patógeno o parámetro sólo filtra y cuenta lo preparado. */
const _preparadas = new WeakMap();
/** Las muestras de Maduración de `filas`: las de Microbiología como `muestraMicro` y las de Calidad de Agua con su contexto. */
function preparadas(filas) {
  const clave = filas || [];
  const hecho = _preparadas.get(clave);
  if (hecho) return hecho;
  const micro = [];
  const cal = [];
  for (const row of clave) {
    if (isMicroRow(row)) {
      const ctx = rowContext(row);
      if (esMaduracion(ctx.departamento, ctx.formatoKey)) micro.push(muestraMicro(row, ctx));
    } else if (isCalAguaRow(row)) {
      const c = calCtx(row);
      if (esMaduracion(c.depto, '')) cal.push({ row, c, fecha: isoDe(c.fecha), sala: c.sala, tanque: c.tq });
    }
  }
  const p = { micro, cal };
  _preparadas.set(clave, p);
  return p;
}
/** Las mediciones de una muestra de Calidad de Agua con esos rangos y su índice, guardadas en la muestra mientras los
 *  rangos (`rk`, su JSON: cada navegador tiene los suyos y se pueden editar) no cambien. */
function conMedidas(m, rangosCal, rk) {
  if (m._rk !== rk) { m._med = calMeasured(m.row, rangosCal); m._wqi = calWQI(m._med, rangosCal).wqi; m._rk = rk; }
  return m;
}
/** 0r·3d (2026-09-28, usuario) · Lo que haría la PRIMERA apertura de 🦠, hecho de antemano (la vista lo llama en reposo):
 *  las muestras de Maduración (`preparadas`) y las mediciones de TODA su calidad de agua con estos rangos, con la misma
 *  clave que `resumenDe`. Después, abrir la ventana sólo filtra y cuenta. */
export function prepararMicro(filas, rangosCal) {
  const prep = preparadas(filas);
  const rk = JSON.stringify(rangosCal || null);
  for (const m of prep.cal) conMedidas(m, rangosCal, rk);
  return prep;
}
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
  return resumenDe(preparadas(filas), periodo, F, rangosCal);
}
/** `resumenMicro` sobre lo ya preparado (`preparadas`, o un recorte suyo: el de la piscina de la ventana). */
function resumenDe(prep, periodo, F, rangosCal) {
  const todas = prep.micro.filter((m) => enPeriodo(m.fecha, periodo));
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
    // 0q·5a · las mediciones de cada muestra, para el gráfico de CANTIDADES del patógeno elegido.
    medidas: rep.map((m) => ({ fecha: m.fecha, med: m.med })),
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
  const bloqueCal = filtrarBloque(prep.cal.filter((m) => enPeriodo(m.fecha, periodo)), F, periodo, ['sala', 'tanque']);
  const rk = JSON.stringify(rangosCal || null);
  const cal = bloqueCal.muestras;
  const grupos = new Map();
  const medidasCal = [];   // 0q·5c · las mediciones de cada muestra, con su grupo, para el gráfico de un parámetro
  for (const m of cal) {
    const k = txt(m.c.componente) || txt(m.c.sala) || txt(m.c.formato).replace(/^Maduraci[oó]n\s*·\s*/i, '') || '(sin componente)';
    const med = conMedidas(m, rangosCal, rk)._med;
    medidasCal.push({ fecha: m.fecha, grupo: k, med });
    const g = grupos.get(k) || { grupo: k, muestras: 0, wqis: [], fuera: 0, porParam: new Map(), ultima: '' };
    g.muestras++;
    g.wqis.push(m._wqi);
    for (const x of med) if (x.estado === 'fuera') { g.fuera++; g.porParam.set(x.label, (g.porParam.get(x.label) || 0) + 1); }
    if (m.fecha > g.ultima) g.ultima = m.fecha;
    grupos.set(k, g);
  }
  const calidad = {
    ignora: bloqueCal.ignora, sinDato: bloqueCal.sinDato,
    muestras: cal.length,
    medidas: medidasCal,
    porGrupo: [...grupos.values()].map((g) => ({ grupo: g.grupo, muestras: g.muestras, wqi: mediana(g.wqis), fuera: g.fuera, ultima: g.ultima,
      peores: [...g.porParam].sort((a, b) => b[1] - a[1] || porNombre(a[0], b[0])).slice(0, 3).map(([label, n]) => ({ label, n })) }))
      .sort((a, b) => porNombre(a.grupo, b.grupo)),
  };
  // 0q·5b · las mediciones de cada muestra de agua, con su formato y su componente: el gráfico de cantidades es por FORMATO
  // (cada uno tiene sus umbrales).
  const medidasAgua = aguaMic.map((m) => ({ fecha: m.fecha, formato: m.ctx.formatoKey, componente: txt(m.ctx.componente), med: m.med }));
  return { reproductores, desinfeccion, agua: { ignora: bloqueAgua.ignora, sinDato: bloqueAgua.sinDato, micro, calidad, medidas: medidasAgua } };
}

/* ── 0q·5a (2026-09-27, usuario) · LA VENTANA CON SUS PROPIOS FILTROS y LAS CANTIDADES DE CADA PATÓGENO ───────────
   La ventana de Microbiología deja de seguir al tablero: tiene sus filtros —Mes, Lote, Sala, Piscina, Sexo— sobre TODO el
   registro. La PISCINA de una muestra es la que dice («Piscina 556» en TQ/N°: tomada antes del ingreso) o, si no, la de
   su lote en la hoja de Ingresos («Piscina Broodstock»; un lote de varias piscinas cuenta en cada una). Sólo la tienen
   los reproductores: en el despacho y en el agua no se aplica, y se dice. */
/** «Piscina 557», «557», «P557» → «Piscina 557»; lo que no tiene número (un lugar como «Chongón»), vacío. */
export const nombrePiscina = (v) => { const m = /(\d+)/.exec(txt(v)); return m ? 'Piscina ' + Number(m[1]) : ''; };
/** Lote (normalizado) → sus piscinas de origen, de las filas de Ingresos. */
export function piscinasDeLotes(ingresos) {
  const m = new Map();
  for (const r of ingresos || []) {
    const l = normLote(r.Lote);
    const p = nombrePiscina(r['Piscina Broodstock']);
    if (!l || !p) continue;
    if (!m.has(l)) m.set(l, new Set());
    m.get(l).add(p);
  }
  return m;
}
/** Las piscinas de una muestra: la que dice, o las de su lote. */
function piscinasDeMuestra(m, mapa) {
  const propia = /piscina/i.test(txt(m.ctx.tq)) ? nombrePiscina(m.ctx.tq) : '';
  if (propia) return [propia];
  return [...((mapa && mapa.get(normLote(m.lote))) || [])];
}
/** El período y el filtro que `resumenMicro` entiende, desde los filtros de la ventana `fi` ({ mes, lote, sala, piscina, sexo }). */
export function filtroDeLaVentana(fi) {
  const f = fi || {};
  const mes = /^\d{4}-\d{2}$/.test(txt(f.mes)) ? txt(f.mes) : '';
  const periodo = mes
    ? { desde: mes + '-01', hasta: mes + '-' + pad2(new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate()) }
    : { desde: '0000-01-01', hasta: '9999-12-31' };
  const F = { sala: txt(f.sala), tanque: null, sexo: txt(f.sexo), lote: txt(f.lote) ? normLote(f.lote) : '', codigo: '', estado: '', piscina: '', camaronera: '' };
  return { periodo, F };
}
/** Los tres bloques de la ventana (`resumenMicro`) con SUS filtros; la piscina, sólo en ① reproductores. */
export function resumenMicroDeLaVentana(filas, fi, rangosCal, mapa) {
  const { periodo, F } = filtroDeLaVentana(fi);
  const piscina = nombrePiscina((fi || {}).piscina);
  let sinPiscina = 0;
  const deReproductores = (m) => m.ctx.formatoKey === 'mad-principal' && esMaduracion(m.ctx.departamento, m.ctx.formatoKey);
  const prep = preparadas(filas);
  const micro = !piscina ? prep.micro : prep.micro.filter((m) => {
    if (!deReproductores(m)) return true;
    const ps = piscinasDeMuestra(m, mapa);
    if (!ps.length) { if (enPeriodo(m.fecha, periodo)) sinPiscina++; return false; }
    return ps.includes(piscina);
  });
  const r = resumenDe({ ...prep, micro }, periodo, F, rangosCal);
  if (piscina) {
    if (sinPiscina) r.reproductores.sinDato = { ...r.reproductores.sinDato, piscina: sinPiscina };
    for (const b of [r.desinfeccion, r.agua, r.agua.calidad]) b.ignora = [...b.ignora, 'piscina'];
  }
  return r;
}
/** Lo que se puede elegir en cada filtro de la ventana: lo que traen las muestras de Maduración (y su calidad de agua). */
export function opcionesDeLaVentana(filas, mapa) {
  const meses = new Set(); const salas = new Set(); const lotes = new Set(); const sexos = new Set(); const piscinas = new Set();
  const prep = preparadas(filas);   // 0r·3a · sólo las de Maduración: la de otro departamento no llega aquí
  for (const m of prep.micro) {
    if (m.fecha) meses.add(m.fecha.slice(0, 7));
    if (txt(m.sala)) salas.add(txt(m.sala));
    if (txt(m.lote)) lotes.add(normLote(m.lote));
    if (txt(m.sexo)) sexos.add(txt(m.sexo));
    if (m.ctx.formatoKey === 'mad-principal') for (const p of piscinasDeMuestra(m, mapa)) piscinas.add(p);
  }
  for (const m of prep.cal) {
    if (m.fecha) meses.add(m.fecha.slice(0, 7));
    if (txt(m.sala)) salas.add(txt(m.sala));
  }
  const orden = (xs) => [...xs].sort(porNombre);
  return { meses: [...meses].sort(), salas: orden(salas), lotes: orden(lotes), sexos: orden(sexos), piscinas: orden(piscinas) };
}
/**
 * Las CANTIDADES de un patógeno en las muestras `medidas` ({ fecha, med }): cada UFC con su fecha, la MEDIANA de cada
 * semana (lunes a domingo), y la mediana, el máximo y las alertas de todas. Una medición sin cifra de UFC (sólo el nivel
 * que escribió la hoja) no se puede dibujar: se cuenta en `sinCifra`.
 */
export function serieDePatogeno(medidas, key) {
  const puntos = [];
  let sinCifra = 0;
  for (const m of medidas || []) {
    for (const x of m.med || []) {
      if (x.key !== key) continue;
      if (x.ufc === null || x.ufc === undefined) { sinCifra++; continue; }
      puntos.push({ fecha: m.fecha, ufc: x.ufc, nivel: x.nivel || '' });
    }
  }
  puntos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const porSemana = new Map();
  for (const p of puntos) { const s = lunesDe(p.fecha); if (!porSemana.has(s)) porSemana.set(s, []); porSemana.get(s).push(p.ufc); }
  const semanas = [...porSemana].map(([lunes, v]) => ({ lunes, mediana: mediana(v), n: v.length }));
  const ufcs = puntos.map((p) => p.ufc);
  return {
    key, puntos, semanas, sinCifra,
    muestras: puntos.length, mediana: mediana(ufcs), maximo: ufcs.length ? Math.max(...ufcs) : null,
    alerta: puntos.filter((p) => isAlerta(p.nivel)).length,
  };
}
/* 0q·5b (2026-09-27, usuario) · ③ Agua y RAS POR FORMATO: RAS, Agua, Hisopado y Agua limpia y mar tienen umbrales
   distintos (cuatro áreas), así que su gráfico de cantidades es de UN formato, y de un componente si se elige. */
/** Los formatos de agua presentes en `medidas`, de más a menos muestras, con sus componentes. */
export function formatosDelAgua(medidas) {
  const m = new Map();
  for (const x of medidas || []) {
    const o = m.get(x.formato) || { key: x.formato, etiqueta: FORMATO_LABEL[x.formato] || x.formato || '(sin formato)', muestras: 0, componentes: new Set() };
    o.muestras++;
    if (x.componente) o.componentes.add(x.componente);
    m.set(x.formato, o);
  }
  return [...m.values()].map((o) => ({ ...o, componentes: [...o.componentes].sort(porNombre) }))
    .sort((a, b) => b.muestras - a.muestras || porNombre(a.etiqueta, b.etiqueta));
}
/** Por patógeno: cuántas mediciones con nivel y cuántas en alerta (el nivel ya viene con los umbrales de su formato); la de
 *  más alertas primero, como en ① reproductores. */
export function patogenosDeMedidas(medidas) {
  const m = new Map();
  for (const x of medidas || []) {
    for (const y of x.med || []) {
      if (!y.nivel) continue;
      const p = m.get(y.key) || { key: y.key, etiqueta: y.label, analizadas: 0, alerta: 0 };
      p.analizadas++;
      if (isAlerta(y.nivel)) p.alerta++;
      m.set(y.key, p);
    }
  }
  const tasa = (p) => p.alerta / p.analizadas;
  return [...m.values()].sort((a, b) => tasa(b) - tasa(a) || porNombre(a.etiqueta, b.etiqueta));
}
/* 0q·5c (2026-09-27, usuario) · ③ CALIDAD DE AGUA POR PARÁMETRO: sus valores, su rango y su tendencia semanal. El rango
   de un parámetro es el mismo en todos los grupos (componente o sala), así que «Todos» se puede dibujar junto. */
/** La mediana SIN redondear (un pH de 8,5 no es 9). */
function medianaExacta(xs) {
  const v = xs.filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
/** El rango de un parámetro ({ min, max }: el que falte, null), o null si no tiene. */
export function rangoDe(key, rangos) {
  const x = (rangos || {})[key];
  if (!x || (x.min == null && x.max == null)) return null;
  return { min: x.min == null ? null : x.min, max: x.max == null ? null : x.max };
}
/** Por parámetro: cuántas muestras y cuántas fuera de rango, y su rango en texto. Primero los que más salen de rango;
 *  los que no tienen rango (no pueden salir), al final. */
export function parametrosDeMedidas(medidas, rangos) {
  const m = new Map();
  for (const x of medidas || []) {
    for (const y of x.med || []) {
      const p = m.get(y.key) || { key: y.key, etiqueta: y.label, unidad: y.unit || '', muestras: 0, fuera: 0, rango: calRangeText(y.key, rangos) };
      p.muestras++;
      if (y.estado === 'fuera') p.fuera++;
      m.set(y.key, p);
    }
  }
  const parte = (p) => (p.rango ? p.fuera / p.muestras : -1);
  return [...m.values()].sort((a, b) => parte(b) - parte(a) || porNombre(a.etiqueta, b.etiqueta));
}
/** Los VALORES de un parámetro en `medidas`: cada uno con su fecha y su estado (dentro, fuera, sin-rango), la mediana de
 *  cada semana y la mediana, el mínimo, el máximo y cuántos fuera de todos. */
export function serieDeParametro(medidas, key) {
  const puntos = [];
  for (const x of medidas || []) for (const y of x.med || []) if (y.key === key) puntos.push({ fecha: x.fecha, valor: y.value, estado: y.estado });
  puntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porSemana = new Map();
  for (const p of puntos) { const w = lunesDe(p.fecha); if (!porSemana.has(w)) porSemana.set(w, []); porSemana.get(w).push(p.valor); }
  const valores = puntos.map((p) => p.valor);
  return {
    key, puntos, semanas: [...porSemana].map(([lunes, v]) => ({ lunes, mediana: medianaExacta(v), n: v.length })),
    muestras: puntos.length, mediana: medianaExacta(valores),
    minimo: valores.length ? Math.min(...valores) : null, maximo: valores.length ? Math.max(...valores) : null,
    fuera: puntos.filter((p) => p.estado === 'fuera').length,
  };
}
/** Los umbrales de un patógeno en un FORMATO (el área que le toca a ese formato). */
export const umbralDelFormato = (formato, key) => umbralDe(areaForFormat(formato, ''), key);
/** Los umbrales { l, m, e } (desde Leve, Moderado y Elevado) de un patógeno en un área: los de la vista de Microbiología. */
export function umbralDe(area, key) {
  const p = PATHOGEN_BY_KEY[key];
  const u = p && (loadMicThresholds()[area] || {})[p.fkey];
  return u ? { ...u } : null;
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

/* ── 0q·6 (2026-09-27, usuario) · 🧬 LA VENTANA DE BIOMOL: sus filtros, la prevalencia POR LOTE y la tendencia de UN
   patógeno ──────────────────────────────────────────────────────────────────────────────────────────────────────
   La misma barra que Microbiología —Mes, Lote, Sala, Piscina, Sexo— sobre TODO el registro. El lote de una muestra es su
   «Código» («Lote BN» → BN); la piscina, la suya, y una combinada («P554/556») cuenta en las dos. ⚠ Con «todo el
   registro» el período va de 0000 a 9999, y `resumenBiomol` recorre las semanas desde el principio del período: aquí se
   ACOTA a las fechas de las muestras. */
/** El lote de una muestra de Biomol: su Código sin la palabra «Lote», normalizado («Lote BN» → BN); '' si no lo dice. */
export const loteBiomol = (r) => normLote(txt(r && r.cod).replace(/^lote\s*/i, ''));
/** Las piscinas de una muestra de Biomol: todas las que nombra («P554/556» → Piscina 554 y Piscina 556). */
export const piscinasBiomol = (r) => (txt(r && r.piscina).match(/\d+/g) || []).map((n) => 'Piscina ' + Number(n));
/** Positivos ÷ analizados de cada patógeno, en unas filas. */
function cuentaBiomol(rs) {
  return Object.fromEntries(BIOMOL_PATOGENOS.map(({ key }) => {
    let analizadas = 0;
    let positivos = 0;
    for (const r of rs) { if (r[key] === 'Positivo' || r[key] === 'Negativo') analizadas++; if (r[key] === 'Positivo') positivos++; }
    return [key, { analizadas, positivos }];
  }));
}
/** Lo de `resumenBiomol` con los filtros de la ventana, y además la prevalencia por lote y las filas (para la tendencia). */
export function resumenBiomolDeLaVentana(filasNorm, fi) {
  const { periodo, F } = filtroDeLaVentana(fi);
  const piscina = nombrePiscina((fi || {}).piscina);
  const filtro = filtroDelTablero({ ...F, lote: '' }, periodo, ['sala', 'tanque', 'sexo']);
  const fuera = {};
  const cuentaFuera = (d) => { fuera[d] = (fuera[d] || 0) + 1; };
  // 0q·7 · el filtro de la ventana, con nombre: lo usan los reproductores y, en «por tipo de muestra», las demás de Maduración.
  const pasaVentana = (r) => {
    if (!filtro.pasa({ fecha: r.f, sala: esSala(r.lugar) ? r.lugar : '', tanque: r.tq === '—' ? '' : r.tq, sexo: r.sexo })) return false;
    if (F.lote) {
      const l = loteBiomol(r);
      if (!l) { cuentaFuera('lote'); return false; }
      if (l !== F.lote) return false;
    }
    if (piscina) {
      const ps = piscinasBiomol(r);
      if (!ps.length) { cuentaFuera('piscina'); return false; }
      if (!ps.includes(piscina)) return false;
    }
    return true;
  };
  const filas = (filasNorm || []).filter(esReproductor).filter(pasaVentana);
  const fechas = filas.map((r) => r.f).sort();
  const acotado = fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] }
    : periodo.desde > '1000' ? periodo : { desde: '1970-01-05', hasta: '1970-01-05' };
  const neutro = { sala: '', tanque: null, sexo: '', lote: '', codigo: '', estado: '', piscina: '', camaronera: '' };
  const r = resumenBiomol(filas, acotado, neutro);
  const porLote = new Map();
  for (const x of filas) { const k = loteBiomol(x) || '(sin lote)'; if (!porLote.has(k)) porLote.set(k, []); porLote.get(k).push(x); }
  /* 0q·7 · por TIPO DE MUESTRA («Otros»: Heces, Branquias, Pleópodo, Agua, Hisopado; un alimento no es un tejido). Aquí
     cuenta también la muestra de Maduración que no está marcada «Reproductores» (el agua o un hisopado de una sala). */
  const otrasDeMaduracion = (filasNorm || []).filter((x) => !esReproductor(x) && tejidoDeMaduracion(x) && pasaVentana(x));
  const tejidos = [...filas.filter((x) => tipoDeMuestra(x.otros)), ...otrasDeMaduracion];
  const claves = BIOMOL_PATOGENOS.map((p) => p.key);
  return {
    ...r, ignora: filtro.ignora, sinDato: { ...filtro.sinDato, ...fuera }, filas,
    tejidos: { matriz: matrizTejidos(tejidos, claves), franja: franjaTejidos(tejidos, claves) },
    porLote: [...porLote].sort(([a], [b]) => (a === '(sin lote)') - (b === '(sin lote)') || porNombre(a, b))
      .map(([clave, rs]) => ({ clave, muestras: rs.length, patogenos: cuentaBiomol(rs) })),
  };
}
/** La tendencia de UN patógeno: por semana (de la primera a la última con muestras), las analizadas, las positivas y su
 *  % (null la semana sin ninguna analizada). */
export function tendenciaDePatogeno(filas, key) {
  const con = (filas || []).filter((r) => r[key] === 'Positivo' || r[key] === 'Negativo');
  if (!con.length) return [];
  const lunes = con.map((r) => lunesDe(r.f)).sort();
  const out = [];
  for (let d = lunes[0]; d <= lunes[lunes.length - 1]; d = new Date(Date.parse(d + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10)) {
    const w = con.filter((r) => lunesDe(r.f) === d);
    const pos = w.filter((r) => r[key] === 'Positivo').length;
    out.push({ lunes: d, analizadas: w.length, positivos: pos, pct: w.length ? Math.round((pos / w.length) * 1000) / 10 : null });
  }
  return out;
}
/** 0q·7 · una muestra de un TIPO («Otros») de Maduración: de una sala o de «Maduración», aunque no diga «Reproductores». */
const tejidoDeMaduracion = (x) => !!tipoDeMuestra(x.otros) && (esSala(x.lugar) || /madur/i.test(txt(x.lugar)));
/** Lo que se puede elegir en cada filtro de la ventana de Biomol: lo que traen sus reproductores y (0q·7) las demás muestras
 *  de un tipo de Maduración, que también filtra. */
/* 0r·3c (2026-09-28, usuario) · una vez por carga: las filas normalizadas (las guarda la vista mientras no llegan datos
   nuevos) son la clave. Quien las use no debe modificarlas. */
const _opcionesBiomol = new WeakMap();
export function opcionesBiomol(filasNorm) {
  const clave = filasNorm || [];
  if (!_opcionesBiomol.has(clave)) _opcionesBiomol.set(clave, opcionesBiomolDe(clave));
  return _opcionesBiomol.get(clave);
}
function opcionesBiomolDe(filasNorm) {
  const meses = new Set(); const lotes = new Set(); const salas = new Set(); const piscinas = new Set(); const sexos = new Set();
  for (const r of (filasNorm || []).filter((x) => esReproductor(x) || tejidoDeMaduracion(x))) {
    if (r.f) meses.add(r.f.slice(0, 7));
    const l = loteBiomol(r);
    if (l) lotes.add(l);
    if (esSala(r.lugar)) salas.add(txt(r.lugar));
    for (const p of piscinasBiomol(r)) piscinas.add(p);
    if (txt(r.sexo)) sexos.add(txt(r.sexo));
  }
  const orden = (xs) => [...xs].sort(porNombre);
  return { meses: [...meses].sort(), lotes: orden(lotes), salas: orden(salas), piscinas: orden(piscinas), sexos: orden(sexos) };
}
