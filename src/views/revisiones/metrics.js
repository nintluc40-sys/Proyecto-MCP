/* ============================================================
   REVISIONES · registro ÚNICO de las variables cuantitativas porcentuales

   La misma lista la consumen CINCO sitios de la vista: los KPIs, los tres
   gráficos por día (Morfología, Alimentación, Condición), el gráfico de
   tendencia que abre cada KPI, la ficha de detalle de una revisión y la
   comparativa de periodos. Tenerla cinco veces garantizaba que al añadir una
   variable se olvidara alguno —es exactamente lo que pasó con «% No viables»,
   que llegó a los KPIs y a un gráfico pero no a la comparativa—, así que aquí
   hay una sola definición y cada sitio la recorre.

   Flacidez, Necrosis y Disparidad se añaden en 2026-08, junto con las columnas
   nuevas del módulo AsT (van tras Disparidad en la hoja; ver el registro del
   AsT). Hasta que el AsT sincronice quedan vacías, y por eso son `optional`:
   su KPI no se dibuja mientras no haya ni un valor.
   ============================================================ */
import { getField, parseNum, F } from '../../core/fields.js';
import { avg } from '../../core/util.js';

/** Alias de cabecera. Se exportan para que el `K` de index.js los reutilice: así
 *  `K.deformidad` y el registro NO pueden divergir. */
export const QUANT_KEYS = {
  deformidad: ['Deformidad_%', 'Deformidad %', 'Deformidad_porc', 'Deformidad', 'deformidad_%', 'deformidad'],
  atraso:     ['% Atraso', 'Atraso_%', 'Atraso %', '%Atraso', 'Atraso', 'atraso'],
  // NO incluir 'Protusión' a secas: es una columna CUALITATIVA aparte.
  protusion:  ['% Protusión', '% Protusion', 'Protusión_%', 'Protusion_%', 'Protusión %', '%Protusión', '% Hernia', 'Hernia_%', 'Hernia %', '%Hernia'],
  noviables:  ['% No viables', '% No Viables', 'No viables (%)', 'No Viables (%)', '%No viables', 'No viables', 'No Viables', 'no viables'],
  vacias:     ['Vacías (%)', 'Vacias (%)', 'Vacías', 'Vacias', '% Vacías', 'vacías (%)', 'vacias (%)'],
  semillenas: ['Semillenas (%)', 'Semillenas', '% Semillenas', 'semillenas (%)', 'semillenas'],
  // 2026-08. La cabecera que escribe el AsT es exactamente 'Flacidez'/'Necrosis'/
  // 'Disparidad'; el resto son variantes toleradas por si se editan a mano en la hoja.
  flacidez:   ['Flacidez', 'Flacidez (%)', '% Flacidez', 'Flacidez_%', 'flacidez'],
  necrosis:   ['Necrosis', 'Necrosis (%)', '% Necrosis', 'Necrosis_%', 'necrosis'],
  disparidad: ['Disparidad', 'Disparidad (%)', '% Disparidad', 'Disparidad_%', 'disparidad'],
};

/**
 * Metadatos por variable.
 *  · `kpi`      rótulo del KPI de cabecera
 *  · `serie`    rótulo en los gráficos y en la tendencia
 *  · `corta`    rótulo breve (ficha de detalle y comparativa)
 *  · `optional` true → el KPI se OCULTA si ninguna fila trae dato. Las tres
 *    primeras siempre se muestran, que es como se comportaba la vista.
 */
export const QUANT = {
  deformidad: { icon: '🧬', kpi: 'Deformidad prom.', serie: '% Deformidad', corta: 'Deformidad', keys: QUANT_KEYS.deformidad, optional: false, color: '#26A69A' },
  atraso:     { icon: '⏳', kpi: 'Atraso prom.', serie: '% Atraso', corta: '% Atraso', keys: QUANT_KEYS.atraso, optional: false, color: '#3F51B5' },
  protusion:  { icon: '🩹', kpi: 'Protusión prom.', serie: '% Protusión', corta: '% Protusión', keys: QUANT_KEYS.protusion, optional: false, color: '#EC407A' },
  noviables:  { icon: '💀', kpi: 'No viables prom.', serie: '% No viables', corta: '% No viables', keys: QUANT_KEYS.noviables, optional: true, color: '#FB8C00' },
  vacias:     { icon: '🕳️', kpi: 'Vacías prom.', serie: 'Vacías %', corta: 'Vacías', keys: QUANT_KEYS.vacias, optional: true, color: '#EC407A' },
  semillenas: { icon: '🥣', kpi: 'Semillenas prom.', serie: 'Semillenas %', corta: 'Semillenas', keys: QUANT_KEYS.semillenas, optional: true, color: '#3F51B5' },
  flacidez:   { icon: '🫠', kpi: 'Flacidez prom.', serie: '% Flacidez', corta: 'Flacidez', keys: QUANT_KEYS.flacidez, optional: true, color: '#8E24AA' },
  necrosis:   { icon: '🖤', kpi: 'Necrosis prom.', serie: '% Necrosis', corta: 'Necrosis', keys: QUANT_KEYS.necrosis, optional: true, color: '#5D4037' },
  disparidad: { icon: '📐', kpi: 'Disparidad prom.', serie: '% Disparidad', corta: 'Disparidad', keys: QUANT_KEYS.disparidad, optional: true, color: '#00838F' },
};

/** Orden de los KPIs de cabecera (las 3 nuevas cierran, sin desplazar las que ya había). */
export const KPI_ORDER = [
  'deformidad', 'atraso', 'protusion', 'noviables', 'vacias', 'semillenas',
  'flacidez', 'necrosis', 'disparidad',
];

/** Series de cada gráfico por día, EN SU ORDEN (el índice decide el color de la
 *  paleta CAT3, así que este orden reproduce exactamente los gráficos previos). */
export const CHART_SERIES = {
  morf: ['atraso', 'protusion', 'deformidad', 'noviables'],
  alim: ['semillenas', 'vacias'],
  cond: ['flacidez', 'necrosis', 'disparidad'],
};

/** Claves de todas las series de un gráfico (para `daysWithData`). */
export const chartKeys = (chart) => CHART_SERIES[chart].map((id) => QUANT[id].keys);

/** ¿Alguna fila trae dato de esta variable? */
export const hasQuant = (rows, id) => rows.some((r) => parseNum(r, QUANT[id].keys) !== null);

/** ¿Alguna serie del gráfico tiene dato? (decide si se dibuja o sale el vacío) */
export const hasChartData = (rows, chart) => CHART_SERIES[chart].some((id) => hasQuant(rows, id));

/** Promedio de la variable; `null` si ninguna fila trae dato. */
export const quantAvg = (rows, id) => avg(rows.map((r) => parseNum(r, QUANT[id].keys)).filter((v) => v !== null));

/** Promedio por día sobre los días dados (mismo criterio que los gráficos de barras).
 *  Un día sin dato queda en `null`, no en 0: el 0 es un valor REAL de estas variables
 *  y pintarlo donde no se midió inventaría una lectura perfecta. */
export const quantDaySeries = (rows, id, days) => days.map((d) => avg(
  rows.filter((r) => getField(r, F.fecha) === d)
    .map((r) => parseNum(r, QUANT[id].keys)).filter((v) => v !== null),
));
