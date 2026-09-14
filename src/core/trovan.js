/* ============================================================
   CORE · identidad de un Trovan ID — DEFINICIÓN ÚNICA
   El Trovan es la clave que cruza las hojas del Registro Reproductivo (MATRIZ,
   Bitácora y Transferencias), así que la ESCRITURA (Registros) y la LECTURA
   (Maduración) tienen que normalizarlo EXACTAMENTE igual: si difieren, el mismo
   tag físico produce dos claves distintas y el cruce se rompe en silencio —sin
   error, solo cifras mal repartidas—.

   Vivían dos copias que NO coincidían (medido):

     entrada        escritura (Registros)   lectura (Maduración)
     0006A1B2       0006A1B2                0006A1B2   ✓
     =0006A1B2      0006A1B2                =0006A1B2  ✗
     -0006A1B2      0006A1B2                -0006A1B2  ✗
     205 caracteres truncado a 200           sin truncar ✗

   La escritura aplicaba `sanitizeStr` y la lectura no. Como la app sanea ANTES de
   guardar, lo que ella misma escribe sale limpio y ambos lados coincidían; la
   divergencia solo mordía con valores llegados al Sheet por otra vía (edición
   manual, GAS, importación legada). Se unifica aquí para cerrar la clase entera.
   ============================================================ */

/** Input sanitization: recorta a `max` chars y elimina los caracteres de inyección de
 *  fórmula iniciales (= + - @) que llegarían a Google Sheets.
 *
 *  `max` es 200 por defecto —el tope de toda la vida, así que ningún llamador cambia—, pero
 *  se puede ampliar para los campos que son PÁRRAFOS y no etiquetas. Hizo falta al medir
 *  que el «Método utilizado» del informe de Biomol son 330 caracteres cuando lleva los dos
 *  métodos del laboratorio: se guardaba cortado a media palabra y el PDF salía con la frase
 *  partida (2026-08-18). El saneado de inyección de fórmula no depende de la longitud, así
 *  que ampliarla no relaja la protección. */
export function sanitizeStr(s, max = 200) {
  if (s === null || s === undefined) return '';
  let str = String(s).trim().slice(0, max > 0 ? max : 200);
  while (str.length > 0 && '=+-@'.indexOf(str.charAt(0)) !== -1) {
    str = str.slice(1);
  }
  return str;
}

/** Normaliza un Trovan ID: saneado, sin espacios y en MAYÚSCULAS (los códigos del lector
 *  son hexadecimales; mayúsculas = forma canónica, así un mismo tag en minúsculas no genera
 *  claves distintas ni duplica en el upsert). */
export function normTrovan(s) {
  return sanitizeStr(String(s == null ? '' : s)).replace(/\s+/g, '').toUpperCase();
}

/* ── Microchips RECICLADOS (2026-09-14) ──────────────────────────────────────
   El microchip de una hembra MUERTA se puede volver a implantar en otra, así que un Trovan ID ya
   no nombra a UNA hembra sino a un chip, y la MATRIZ puede tener varias filas suyas: una por
   individuo. Una sucede a la anterior sólo si la anterior está muerta y la nueva ingresó DESPUÉS
   de su ingreso y de su muerte: así sus vidas no se pisan y cada evento de la Bitácora es de una
   sola, la que había ingresado en su fecha.
   Aquí vive esa regla para la escritura (Registros) y la lectura (el tablero de Maduración). El GAS
   la repite con su propio código (llaveMatriz_) e `index (8)` la copia en línea (_repro…).
   Trabajan con «filas de chip» { ingreso, muerte, muerto, pos }: fechas en ISO ('' si no hay) y
   `pos` = el orden en la hoja. */

/** Fecha ISO (yyyy-mm-dd) de una celda, o '' si no es una fecha real. Admite Date, ISO (con hora
 *  detrás o sin ella) y dd/mm/yyyy, que es como llegan del GAS y del store del tablero. */
export function fechaIso(v) {
  let y, m, d, p;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate();
  } else {
    const s = String(v == null ? '' : v).trim();
    if ((p = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { y = +p[1]; m = +p[2]; d = +p[3]; }
    else if ((p = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { y = +p[3]; m = +p[2]; d = +p[1]; }
    else return '';
  }
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return '';
  return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

const topeDe = (f) => (f.muerte > f.ingreso ? f.muerte : f.ingreso);

/** Individuo VIGENTE de un chip: el que lo lleva hoy, y por eso el destino de la mortalidad y del
 *  traslado, que no dicen de qué individuo son. La viva; entre varias, o sin ninguna viva, la de
 *  ingreso más reciente; a igualdad, la de más abajo en la hoja. */
export function vigenteDelChip(filas) {
  let v = null;
  (filas || []).forEach((f) => {
    if (!v) v = f;
    else if (v.muerto !== f.muerto) { if (!f.muerto) v = f; }
    else if (f.ingreso > v.ingreso || (f.ingreso === v.ingreso && f.pos > v.pos)) v = f;
  });
  return v;
}

/** Los individuos de un chip EN ORDEN DE VIDA (ingreso; sin fecha, primero; a igualdad, el orden de
 *  la hoja). `cadena` son los que se suceden; `conflictos`, las filas que no encajan —otra hembra
 *  viva con el mismo chip, o un ingreso que no es posterior a la anterior—: eso no es un reciclaje,
 *  es un error de la hoja. */
export function cadenaDelChip(filas) {
  const orden = (filas || []).slice().sort((a, b) => (a.ingreso < b.ingreso ? -1 : a.ingreso > b.ingreso ? 1 : a.pos - b.pos));
  const cadena = [], conflictos = [];
  orden.forEach((f) => {
    const prev = cadena[cadena.length - 1];
    if (!prev || (prev.muerto && f.ingreso && f.ingreso > topeDe(prev))) cadena.push(f);
    else conflictos.push(f);
  });
  return { cadena, conflictos };
}

/** De qué individuo de la cadena es un evento del día ISO `dia`: de la última que había ingresado
 *  ese día o antes; si ninguna, de la primera; sin fecha, de la última. */
export function individuoEnFecha(cadena, dia) {
  if (!cadena || !cadena.length) return null;
  if (!dia) return cadena[cadena.length - 1];
  let el = cadena[0];
  cadena.forEach((f) => { if (f.ingreso && f.ingreso <= dia) el = f; });
  return el;
}

/** Nombre de cada individuo de la cadena: la última se llama como su chip —es la que se busca por
 *  su código— y las anteriores, chip·fecha de ingreso (chip·#n si no la tienen). */
export function idsDeCadena(chip, cadena) {
  return (cadena || []).map((f, k) => (k === cadena.length - 1 ? chip : chip + '·' + (f.ingreso || '#' + (k + 1))));
}
