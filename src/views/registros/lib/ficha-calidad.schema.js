/* ============================================================
   REGISTROS · esquema de la ficha "Calidad" (Sanidad y Calidad de Larvas)
   Modelo de datos PURO extraído del render del monolito (engine.js renderCalidad).
   Será el motor del render nativo y la fuente única del modelo de columnas.

   Estructura de datos guardada (objeto `data` de la ficha):
     - cabecera: corrida, fecha, hora
     - por tanque i (1..TQS): e_i (estadio) + un campo por cada `code` de abajo
       con la forma `<code>_<i>` (p.ej. ll_1, df_3, cos_12)
     - pie: tec (técnico responsable)
   Todos los campos numéricos: % en rango 0–100, step 0.1.
   ============================================================ */

/** Campos de cabecera de la ficha. */
export const CALIDAD_HEADER = [
  { name: 'corrida', label: 'Corrida', type: 'text', placeholder: 'Ej. 552' },
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'hora', label: 'Hora', type: 'time' },
];

/** Columna de estadio (por tanque), no numérica. */
export const CALIDAD_ESTADIO = { code: 'e', label: 'Estadio', type: 'text', placeholder: 'N5…M3', upper: true };

/** Grupos de columnas numéricas (orden = orden visual de la tabla).
 *  band = banda superior de la cabecera del monolito. */
export const CALIDAD_GROUPS = [
  {
    band: 'Sanidad N5–M3',
    sub: 'Intestino',
    cols: [
      { code: 'll', label: '%Llenas' },
      { code: 'sl', label: '%Semillenas' },
      { code: 'va', label: '%Vacías' },
    ],
  },
  {
    band: 'Sanidad N5–M3',
    sub: 'Morfología General',
    cols: [
      { code: 'df', label: '%Deformidad' },
      { code: 'rt', label: '%Retraso' },
      // %Mortalidad promedia hacia el % Mort. Diaria de la ficha Población (rcPob).
      { code: 'mo', label: '%Mortalidad', feedsPoblacion: true },
    ],
  },
  {
    band: 'Sanidad N5–M3',
    sub: 'Otros',
    cols: [
      { code: 'hg', label: '%Hongos' },
      { code: 'nv', label: '%NoViab' },
      { code: 'op', label: '%Opac' },
    ],
  },
  {
    band: 'Post-larva',
    sub: 'Hepatopáncreas',
    cols: [{ code: 'lp', label: '%Lípidos' }],
  },
  {
    band: 'Post-larva',
    sub: 'Morfología PL',
    cols: [
      { code: 'fl', label: '%Flacidez' },
      { code: 'nc', label: '%Necrosis' },
      { code: 'cb', label: '%Canibalismo' },
      { code: 'pr', label: '%Parásitos' },
    ],
  },
  {
    band: 'Calidad',
    sub: '',
    cols: [
      { code: 'cos', label: '%Actividad' },
      { code: 'es', label: '%Estrés' },
    ],
  },
];

/** Lista plana de códigos numéricos, en orden de columna. */
export const CALIDAD_CODES = CALIDAD_GROUPS.flatMap((g) => g.cols.map((c) => c.code));

/** Construye el nombre de campo por tanque: ('ll', 3) → 'll_3'. */
export function fieldName(code, tank) {
  return `${code}_${tank}`;
}
