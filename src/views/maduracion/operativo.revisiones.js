/* ============================================================
   MADURACIÓN · OPERATIVO — REVISIONES (F3.2, 2026-09-20)

   Lo que enseña la sub-vista «🔍 Revisiones», con el diseño que aprobó el usuario el 2026-09-20 (semáforo por
   variable con su último valor, y su historial debajo): la revisión de nauplios en sus cuatro etapas, la
   alcalinidad por área, la mortalidad en tanques de desove y de recuperación, y la frecuencia de las
   observaciones de tanque. Módulo PURO: ni DOM ni red.

   🔑🔑 UNA SOLA HOJA, TRES CLASES DE FILA. «Maduración Mortalidad Desove» es también el Inf. Supervisor, y en
   ella conviven (decisión del usuario del 2026-09-15, para no crear otra hoja ni re-desplegar el GAS):
     · MORTALIDAD — la que trae «Tipo de tanque» (Desove o Recuperación). El libro SÓLO lee éstas.
     · REVISIÓN   — la que trae «Revisión» (Entrada · Lavado · Lavado 2 · Postlavado) y NO trae tipo de tanque.
     · ALCALINIDAD — la que trae «Área» (el RAS más las salas), con su turno de día y el de noche.
   Confundirlas es el error natural aquí: contar una revisión como mortalidad descontaría hembras que nadie
   perdió. Cada función se queda con SU clase y lo dice.

   ⚠⚠ QUÉ SE JUZGA Y QUÉ NO. Sólo llevan veredicto las tres reglas que EXISTEN:
     · Salinidad > MAD_NAUP_SAL_MAX (60 ‰) y Temperatura > MAD_NAUP_TEMP_MAX (40 °C) — topes de aviso
       CONFIRMADOS por el usuario el 2026-09-15; avisan y no bloquean.
     · Hongos «Presente» — el único valor binario cuyo significado no admite lectura: lo normal es «Ausente».
     · Alcalinidad — con el umbral vigente de `operativo.umbrales.js` (hoy el bibliográfico, ≥ 100).
   Deformidad, Actividad, Fototropismo y Aireación se enseñan TAL CUAL, sin veredicto: no hay ninguna fuente
   que diga cuál de «Alta», «Media» o «Baja» está bien, y aquí una escala inventada sería peor que ninguna.
   Es el mismo criterio con el que la mortalidad del día y las cargas se quedaron sin cifra (Fase 0.4).

   ⚠ Los catálogos de OBSERVACIONES de tanque viven en el monolito y no se duplican aquí: se cuenta lo que los
   partes traigan, que es lo que de verdad se ha marcado. Dos copias de un catálogo divergen en silencio.

   ⏳ Con los datos del 2026-09-20 esta hoja tiene CERO filas: todo nace vacío, y eso es lo correcto.
   ============================================================ */
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import {
  MAD_MORT_TIPOS, MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS,
  MAD_NAUP_FOTOTROPISMO, MAD_NAUP_AIREACION, MAD_NAUP_SAL_MAX, MAD_NAUP_TEMP_MAX, MAD_ALC_AREAS,
} from '../registros/lib/ficha-maduracion-mortdesove.schema.js';
import { fechaDeFila } from './operativo.data.js';
import { cociente } from './operativo.indicadores.js';
import { umbralVigente, evaluar } from './operativo.umbrales.js';

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

/* ── LAS TRES CLASES DE FILA ────────────────────────────────── */

/** Una fila de MORTALIDAD: la que dice en qué tipo de tanque fue. Es la única que el libro descuenta. */
export const esMortalidad = (r) => MAD_MORT_TIPOS.includes(txt((r || {})['Tipo de tanque']));
/** Una fila de REVISIÓN: trae su etapa y NO trae tipo de tanque (si lo trajera, sería una mortalidad). */
export const esRevision = (r) => !!txt((r || {})['Revisión']) && !txt((r || {})['Tipo de tanque']);
/** Una fila de ALCALINIDAD: la que dice de qué área es. */
export const esAlcalinidad = (r) => !!txt((r || {})['Área']);

/* ── LA REVISIÓN DE NAUPLIOS ────────────────────────────────── */

/** Las cinco variables cualitativas de una revisión, con sus valores y si llevan veredicto (ver la cabecera). */
export const VARIABLES_REVISION = [
  { id: 'deformidad', columna: 'Deformidad', etiqueta: 'Deformidad', opciones: MAD_NAUP_DEFORMIDAD, veredicto: false },
  { id: 'actividad', columna: 'Actividad', etiqueta: 'Actividad', opciones: MAD_NAUP_ACTIVIDAD, veredicto: false },
  { id: 'hongos', columna: 'Hongos', etiqueta: 'Hongos', opciones: MAD_NAUP_HONGOS, veredicto: true },
  { id: 'fototropismo', columna: 'Fototropismo', etiqueta: 'Fototropismo', opciones: MAD_NAUP_FOTOTROPISMO, veredicto: false },
  { id: 'aireacion', columna: 'Aireación', etiqueta: 'Aireación', opciones: MAD_NAUP_AIREACION, veredicto: false },
];

/** Las cuatro etapas, en el orden en que ocurren. */
export const ETAPAS_REVISION = MAD_NAUP_REVISIONES.slice();

/** Los dos topes de aviso, con su unidad, para poder enseñarlos junto a la cifra. */
export const TOPES_REVISION = {
  salinidad: { max: MAD_NAUP_SAL_MAX, unidad: '‰' },
  temperatura: { max: MAD_NAUP_TEMP_MAX, unidad: '°C' },
};

function lecturaConTope(valor, tope) {
  const v = num(valor);
  return { valor: v, aviso: v !== null && v > tope.max, max: tope.max, unidad: tope.unidad };
}

/**
 * Las revisiones de nauplios del período, de la más reciente a la más antigua, con la ÚLTIMA aparte y el último
 * estado de cada etapa. Admite el filtro de lote; la sala y el tanque no: una revisión es de un LOTE, no de una
 * ubicación, y se dice en `ignora` en vez de devolver una lista vacía que parecería «no hay revisiones».
 */
export function revisionesDeNauplios(fuentes, F, periodo) {
  const ignora = [];
  if (F.sala) ignora.push('sala');
  if (F.tanque !== null) ignora.push('tanque');
  if (F.codigo) ignora.push('código genético');
  const filas = [];
  for (const r of ((fuentes || {}).mortDesove || [])) {
    if (!esRevision(r)) continue;
    const lote = txt(r.Lote);
    if (F.lote && normLote(lote) !== F.lote) continue;
    const fecha = fechaDeFila('mortDesove', r);
    if (!enPeriodo(fecha, periodo)) continue;
    const valores = {};
    for (const v of VARIABLES_REVISION) valores[v.id] = txt(r[v.columna]);
    filas.push({
      fecha, lote, etapa: txt(r['Revisión']), valores,
      /* El ÚNICO veredicto cualitativo: la presencia de hongos. Los demás van sin juicio (ver la cabecera). */
      hongos: valores.hongos === 'Presente',
      salinidad: lecturaConTope(r.Salinidad, TOPES_REVISION.salinidad),
      temperatura: lecturaConTope(r.Temperatura, TOPES_REVISION.temperatura),
      observaciones: txt(r.Observaciones),
    });
  }
  const orden = (f) => f.fecha + '|' + String(ETAPAS_REVISION.indexOf(f.etapa) + 1).padStart(2, '0');
  filas.sort((a, b) => porNombre(orden(b), orden(a)));
  /* El último estado de CADA etapa: la revisión de Entrada y la de Postlavado se leen juntas aunque sean de
     días distintos, que es como el laboratorio sigue una tanda. */
  const porEtapa = ETAPAS_REVISION.map((etapa) => ({ etapa, ultima: filas.find((f) => f.etapa === etapa) || null }));
  const avisos = filas.filter((f) => f.hongos || f.salinidad.aviso || f.temperatura.aviso);
  return { filas, ultima: filas[0] || null, porEtapa, avisos, ignora };
}

/* ── LA ALCALINIDAD POR ÁREA ────────────────────────────────── */

/**
 * El ÚLTIMO valor de alcalinidad de cada área dentro del período, de día y de noche, con su veredicto contra el
 * umbral vigente. Las áreas son el RAS y las salas: el RAS no es una sala sino el circuito que las alimenta, así
 * que un filtro de sala lo deja pasar igual (su alcalinidad vale para todas).
 */
export function alcalinidadPorArea(fuentes, F, periodo) {
  const umbral = umbralVigente('alcalinidad');
  const ult = new Map();
  for (const r of ((fuentes || {}).mortDesove || [])) {
    if (!esAlcalinidad(r)) continue;
    const area = txt(r['Área']);
    const fecha = fechaDeFila('mortDesove', r);
    if (!enPeriodo(fecha, periodo)) continue;
    const a = ult.get(area) || { area, dia: { valor: null, fecha: '' }, noche: { valor: null, fecha: '' } };
    for (const [clave, columna] of [['dia', 'Alcalinidad día'], ['noche', 'Alcalinidad noche']]) {
      const v = num(r[columna]);
      /* Se queda la lectura MÁS RECIENTE de cada turno por separado: la de noche se anota horas después y en su
         propia celda, así que una fila sin ella no borra la del día (es el MERGE de la hoja). */
      if (v !== null && fecha >= a[clave].fecha) a[clave] = { valor: v, fecha };
    }
    ult.set(area, a);
  }
  const areas = [];
  for (const area of MAD_ALC_AREAS) {
    if (F.sala && area !== 'RAS' && area !== F.sala) continue;
    const a = ult.get(area) || { area, dia: { valor: null, fecha: '' }, noche: { valor: null, fecha: '' } };
    areas.push({
      area, esRas: area === 'RAS',
      dia: { ...a.dia, estado: evaluar('alcalinidad', a.dia.valor) },
      noche: { ...a.noche, estado: evaluar('alcalinidad', a.noche.valor) },
    });
  }
  const conDato = areas.filter((a) => a.dia.valor !== null || a.noche.valor !== null).length;
  return { umbral, areas, conDato };
}

/* ── LA MORTALIDAD EN DESOVE Y RECUPERACIÓN ─────────────────── */

/**
 * Las hembras que entraron y murieron en tanques de desove y de recuperación en el período, por tipo de tanque.
 * ⚠ Estas muertes YA están dentro de `muertos` del lote en el libro: aquí se enseñan por su tipo de tanque, que
 * es lo que el libro no dice. No se suman a las bajas de «💀 Bajas»; son un desglose de ellas.
 */
export function mortalidadEnDesove(fuentes, F, periodo) {
  const tipos = MAD_MORT_TIPOS.map((tipo) => ({ tipo, entran: 0, muertas: 0, registros: 0, lotes: new Set() }));
  const porTipo = new Map(tipos.map((t) => [t.tipo, t]));
  for (const r of ((fuentes || {}).mortDesove || [])) {
    if (!esMortalidad(r)) continue;
    const lote = txt(r.Lote);
    if (F.lote && normLote(lote) !== F.lote) continue;
    if (!enPeriodo(fechaDeFila('mortDesove', r), periodo)) continue;
    const t = porTipo.get(txt(r['Tipo de tanque']));
    if (!t) continue;
    t.entran += ent(r['Hembras que entran']);
    t.muertas += ent(r['Hembras muertas']);
    t.registros++;
    if (lote) t.lotes.add(lote);
  }
  const filas = tipos.map((t) => ({ ...t, lotes: [...t.lotes].sort(porNombre), pct: cociente(t.muertas, t.entran, 100) }));
  const entran = filas.reduce((a, t) => a + t.entran, 0);
  const muertas = filas.reduce((a, t) => a + t.muertas, 0);
  return { filas, entran, muertas, pct: cociente(muertas, entran, 100) };
}

/* ── LA FRECUENCIA DE LAS OBSERVACIONES DE TANQUE ───────────── */

/**
 * Cuántas veces se marcó cada observación en el período, contando UNA por (día, sala, tanque) —que es como las
 * agrupa `diasDeTanque`—, de la más frecuente a la menos. No se comparan con ningún catálogo: se cuenta lo que
 * los partes traen. Una observación que ya no esté en el catálogo sigue siendo un dato registrado.
 */
export function frecuenciaDeObservaciones(partes, F, periodo) {
  const san = new Map();
  const ope = new Map();
  let registros = 0;
  for (const d of partes || []) {
    if (!enPeriodo(txt(d.fecha), periodo)) continue;
    if (F.sala && d.sala !== F.sala) continue;
    if (F.tanque !== null && Number(d.tanque) !== F.tanque) continue;
    registros++;
    for (const [lista, m] of [[d.obsSanitarias, san], [d.obsOperativas, ope]]) {
      for (const o of lista || []) {
        const k = txt(o);
        if (!k) continue;
        const f = m.get(k) || { obs: k, veces: 0, tanques: new Set() };
        f.veces++;
        f.tanques.add(txt(d.sala) + '|' + d.tanque);
        m.set(k, f);
      }
    }
  }
  const salida = (m) => [...m.values()]
    .map((f) => ({ obs: f.obs, veces: f.veces, tanques: f.tanques.size, pct: cociente(f.veces, registros, 100) }))
    .sort((a, b) => b.veces - a.veces || porNombre(a.obs, b.obs));
  return { sanitarias: salida(san), operativas: salida(ope), registros, ignora: F.lote ? ['lote'] : [] };
}
