/* ============================================================
   MADURACIÓN · OPERATIVO — las FUENTES del tablero (Fase 0.1, 2026-09-19)

   Toma las filas que el dashboard ya descargó (`store.globalData`) y entrega las del registro
   OPERATIVO de Maduración separadas por hoja y con la MISMA forma que devuelve el GAS con
   `?p=rows`, que es la que esperan `construirLibro` y `resumenMaduracion` (registros/lib): el
   tablero usa esos dos motores tal cual, así que no puede dar cifras distintas del ⚖️ Saldo.
   Módulo PURO: ni DOM ni red.

   Dos cosas que no se ven desde fuera, medidas el 2026-09-19 sobre el export real:
   1 · Las DIEZ hojas del operativo llegan con el MISMO `_SheetOrigin` («Maduracion»):
       `classifyOrigin` sólo da origen propio a las del reproductivo. Aquí se reconoce cada hoja
       por su columna EXCLUSIVA —la «firma», la misma idea que MAD_ESQUEMA_FIRMA en el GAS—, que
       `defval: ''` (core/sheets.js) garantiza en TODAS sus filas aunque la celda esté vacía. No
       se toca la clasificación general: la comparten las demás vistas y la vigilan sus pruebas.
   2 · El export llega como TEXTO (`raw: false`): la «Fecha» del operativo como `dd/mm/aaaa` (celda
       de fecha) y la de N2/N5 como `aaaa-mm-dd` (celda de texto). El libro ORDENA comparando la
       fecha como texto: con `dd/mm/aaaa` el 16/09 iría antes que el 29/08, y el reparto cronológico
       de bajas y movimientos saldría mal sin un solo error a la vista.

   ⚠ Dos reglas de CLAUDE.md que en el tablero del operativo NO se aplican, a propósito:
   · la 6 (acceso tolerante con `getField`): estas cabeceras las escribe el GAS desde los esquemas de las fichas, y los
     motores del Saldo las leen por su nombre EXACTO. Tolerar variantes aquí haría que el tablero y el Saldo pudieran
     leer columnas distintas del mismo dato. Este módulo y los que lo usan (`operativo.data.js`,
     `operativo.indicadores.js`) leen por nombre exacto, como el libro y el resumen.
   · la 7 (`parseAnyDate`): la forma de referencia es la de `?p=rows`, que deja como TEXTO lo que no es una celda de
     fecha —un «45000», una fecha en inglés—, y `parseAnyDate` los convertiría en fechas. `fechaIso` convierte sólo las
     dos formas que el export escribe para una fecha, y comprueba que el día exista, como `parseAnyDate`.
   ============================================================ */
import { MAD_INGRESO_SHEET } from '../registros/lib/ficha-maduracion-ingreso.schema.js';
import { MAD_MOV_SHEET } from '../registros/lib/ficha-maduracion-movimientos.schema.js';
import { MAD_DESOVE_SHEET } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { MAD_MORT_SHEET } from '../registros/lib/ficha-maduracion-mortdesove.schema.js';
import { MAD_FIN_SHEET } from '../registros/lib/ficha-maduracion-fin-ciclo.schema.js';
import { MAD_TRAT_SHEET } from '../registros/lib/ficha-maduracion-tratamientos.schema.js';
import { MAD_ALIM_SHEET } from '../registros/lib/ficha-maduracion-alimentacion.schema.js';
import { MAD_BS_SHEET } from '../registros/lib/ficha-maduracion-broodstock.schema.js';
import { RESUMEN_TEMPS } from '../registros/lib/mad-resumen.js';

/** El `_SheetOrigin` con que llegan TODAS las hojas del operativo (core/sheets.js · classifyOrigin). */
export const MAD_OP_ORIGEN = 'Maduracion';

/* Cada hoja del operativo: la CLAVE con que la esperan `construirLibro`/`resumenMaduracion` (más
   `alimentacion` y `broodstock`, que sólo usa el tablero), su nombre y su FIRMA.
   🔑 Una firma tiene que estar en su hoja y en NINGUNA otra de las trece de Maduración —también en
   las cabeceras VIEJAS de Ingreso y Lotes, que siguen en producción hasta el vaciado A2—. Lo exige
   `operativo.fuentes.test.js` contra las cabeceras que emiten los módulos y el monolito: si alguien
   renombra una columna firmada, la prueba se pone roja antes de que la hoja desaparezca del tablero.
   ⚠ Sala y Tanques no tienen módulo de esquema (viven sólo en engine.js): sus nombres van aquí
   escritos y la prueba los contrasta con el `MAD_SHEET` y las cabeceras del monolito. */
export const MAD_OP_HOJAS = [
  { clave: 'ingresos', hoja: MAD_INGRESO_SHEET, firma: 'Camaronera origen' },
  { clave: 'movimientos', hoja: MAD_MOV_SHEET, firma: 'Agua destino' },
  { clave: 'desoves', hoja: MAD_DESOVE_SHEET, firma: 'Total de huevos' },
  { clave: 'mortDesove', hoja: MAD_MORT_SHEET, firma: 'Tipo de tanque' },
  { clave: 'cierres', hoja: MAD_FIN_SHEET, firma: 'Metabisulfito (kg)' },
  { clave: 'tratamientos', hoja: MAD_TRAT_SHEET, firma: 'Productos RAS' },
  { clave: 'alimentacion', hoja: MAD_ALIM_SHEET, firma: 'Fuente del peso' },
  { clave: 'broodstock', hoja: MAD_BS_SHEET, firma: 'Pl/g' },
  { clave: 'sala', hoja: 'Maduración Sala', firma: RESUMEN_TEMPS[0] },
  { clave: 'tanques', hoja: 'Maduración Tanques', firma: 'Machos muertos' },
];

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const pad2 = (n) => String(n).padStart(2, '0');

/** ¿Existe ese día en el calendario? Sin comprobarlo, `31/02` pasaría como fecha buena. */
function diaReal(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Una celda de fecha, en `aaaa-mm-dd`: la forma de `?p=rows`, que es la que ordena el libro.
 * Acepta `dd/mm/aaaa` (celda de fecha del export) y `aaaa-mm-dd` (celda de texto, o con hora detrás).
 * Se opera sobre el TEXTO, sin pasar por `Date`: una conversión con horas locales puede mover el día
 * al oeste de Greenwich. Lo que no es un día real se devuelve tal cual —igual que el GAS devuelve una
 * celda de texto—: inventar una fecha sería peor que dejar a la vista la que está mal.
 */
export function fechaIso(v) {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? '' : v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
  }
  const s = txt(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(s);
  if (m) return diaReal(+m[1], +m[2], +m[3]) ? m[1] + '-' + m[2] + '-' + m[3] : s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return diaReal(+m[3], +m[2], +m[1]) ? m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]) : s;
  return s;
}

const RE_NUMERO = /^-?\d+(\.\d+)?$/;
const RE_MILES = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;
const RE_CERO_INICIAL = /^-?0\d/;
const RE_PORCENTAJE = /^-?\d+(\.\d+)?%$/;

/**
 * Una celda cualquiera: número si el export la escribió como NÚMERO, texto si no.
 * El export formatea los números con la convención de SheetJS —punto decimal y, si la columna lleva
 * formato de miles, comas de miles—, así que «6,500,000» son seis millones y medio (lo que `parseNum`
 * del núcleo leería como 6,5: por eso aquí no se usa).
 * Un PORCENTAJE («100%») es un número con formato de porcentaje, y `?p=rows` lo entrega como FRACCIÓN (1):
 * medido el 2026-09-19 con el RAS de la Sala. La ficha escribe «100%» como texto, pero Google Sheets lo
 * convierte al guardarlo. Así que aquí se entrega igual, como fracción: el valor es el mismo por los dos
 * caminos, y el «100%» lo vuelve a escribir quien lo enseña.
 * Se queda como TEXTO, igual que en `?p=rows`:
 *   · un entero con CERO a la izquierda («0042»): sólo puede ser una celda de texto, y el cero es
 *     parte del código;
 *   · una hora («08:30») o una coma decimal tecleada («7,5»): ninguna sale de una celda numérica del
 *     export, así que son texto también en la hoja.
 */
export function numeroDeCelda(v) {
  if (typeof v === 'number') return v;
  const s = txt(v);
  if (RE_PORCENTAJE.test(s)) return Number(s.slice(0, -1)) / 100;
  if (RE_MILES.test(s)) return Number(s.replace(/,/g, ''));
  if (RE_NUMERO.test(s) && !RE_CERO_INICIAL.test(s)) return Number(s);
  return s;
}

/** Una fila del export con la forma de `?p=rows`: las columnas «Fecha…» en `aaaa-mm-dd`, el resto
 *  como número o texto. Las marcas internas (`_SheetOrigin`…) pasan sin tocar. */
export function normalizarFila(row) {
  const out = {};
  for (const k of Object.keys(row || {})) {
    const v = row[k];
    if (k.charAt(0) === '_') out[k] = v;
    else out[k] = /^fecha/i.test(k.trim()) ? fechaIso(v) : numeroDeCelda(v);
  }
  return out;
}

/** La hoja del operativo a la que pertenece una fila, por su firma; `null` si no es de ninguna. */
export function hojaDeFila(row) {
  if (!row || row._SheetOrigin !== MAD_OP_ORIGEN) return null;
  for (const h of MAD_OP_HOJAS) {
    if (Object.prototype.hasOwnProperty.call(row, h.firma)) return h;
  }
  return null;
}

/**
 * Las fuentes del operativo a partir de TODAS las filas del store: una lista por clave, cada fila
 * con la forma de `?p=rows`. `sinHoja` cuenta las filas de origen «Maduracion» que no casan con
 * ninguna firma: una hoja del operativo que cambió de columnas y dejó de reconocerse, que es
 * exactamente lo que no puede pasar en silencio.
 */
export function fuentesDesdeFilas(rows) {
  const fuentes = {};
  for (const h of MAD_OP_HOJAS) fuentes[h.clave] = [];
  let sinHoja = 0;
  for (const r of rows || []) {
    if (!r || r._SheetOrigin !== MAD_OP_ORIGEN) continue;
    const h = hojaDeFila(r);
    if (!h) { sinHoja++; continue; }
    fuentes[h.clave].push(normalizarFila(r));
  }
  return { fuentes, sinHoja };
}
