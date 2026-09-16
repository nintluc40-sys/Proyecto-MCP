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

/* ── QUÉ IDENTIFICA A UN INDIVIDUO (2026-09-16, decisión del usuario) ─────────
   🔑 Un Trovan ID **NO nombra a una hembra: nombra a un CHIP**, y el mismo código se reutiliza. La
   identidad de un individuo es la CUATERNA

       (Trovan ID · Piscina · Código genético · Lote)

   y el mismo chip puede darse de alta tantas veces como haga falta **mientras esas tres no se
   repitan a la vez**. No hace falta que la anterior esté muerta, ni que las fechas se ordenen.

   ⚠⚠ ANTES ERA OTRA COSA, y por eso esto se explica tan largo. Del 2026-09-14 al 09-16 la regla fue
   «un chip nombra a UNA hembra viva a la vez, y sólo se recicla el de una muerta, con el ingreso
   posterior a su muerte». Con ella el alta masiva RECHAZABA altas legítimas con tres mensajes
   distintos —«lo lleva una hembra VIVA», «tiene que ingresar DESPUÉS de esa fecha» y «actualiza el
   GAS»—, que es justo lo que el usuario reportó. La sucesión por muerte deja de ser una CONDICIÓN:
   pasa a ser sólo una de las formas en que un chip acumula individuos.

   Aquí vive la definición para la ESCRITURA (Registros) y la LECTURA (el tablero de Maduración).
   El GAS la repite como llave POSICIONAL compuesta —mucho menos código que la máquina de sucesión
   que había— e `index (8)` la copia en línea (_repro…).
   Trabajan con «filas de chip» { ingreso, muerte, muerto, pos, ind }: fechas en ISO ('' si no hay),
   `pos` = el orden en la hoja e `ind` = la cuaterna de arriba. */

/** Clave de IDENTIDAD de un individuo: chip + piscina + código genético + lote, normalizados.
 *  Definición ÚNICA: la usan el alta (para saber si ya existe), el upsert del GAS (como llave) y la
 *  lectura (para no cantar como duplicadas a dos hembras distintas).
 *  ⚠ Se pliegan espacios y mayúsculas SÓLO para comparar; en la hoja se escribe lo que se tecleó.
 *  ⚠ El separador es un carácter de control, que no sale de un teclado: con «|» o «·», un lote que
 *  lo llevara dentro podría fabricar la clave de OTRO individuo. */
/* ⚠ El separador se escribe con `fromCharCode`, NO como un literal, y no es manía: al teclearlo
   directo entra en el archivo como carácter de CONTROL crudo —invisible en el editor, en un `grep`
   y en un ancla de banco—. Con esto el fuente es ASCII legible y el valor sigue siendo el mismo. */
const SEP_IND = String.fromCharCode(31);
export function claveIndividuo(trovan, piscina, codigo, lote) {
  const parte = (v) => sanitizeStr(String(v == null ? '' : v)).replace(/\s+/g, ' ').trim().toUpperCase();
  return [normTrovan(trovan), parte(piscina), parte(codigo), parte(lote)].join(SEP_IND);
}

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

/* `topeDe` (la última fecha de una fila: su muerte o, si no la hay, su ingreso) se retiró el
   2026-09-16 con la regla de sucesión que la usaba. La fecha ya no decide si un alta vale. */

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
 *  la hoja). `cadena` son todos los individuos DISTINTOS del chip; `conflictos`, las filas que
 *  repiten una identidad ya vista —la MISMA cuaterna dos veces—, que sí es un error de la hoja.
 *
 *  ⚠⚠ 2026-09-16 · ESTO CONTABA OTRA COSA. Exigía que cada fila SUCEDIERA a la anterior (la
 *  anterior muerta y el ingreso posterior a su muerte) y mandaba a `conflictos` todo lo demás. Con
 *  la identidad por cuaterna eso convertía en «error» lo que ahora es normal: dos hembras VIVAS
 *  del mismo chip en piscinas o lotes distintos. Y `conflictos` no es decorativo —el tablero de
 *  Maduración lo usa para marcar el chip como duplicado (`data.js`)—, así que sin este cambio el
 *  alta nueva habría llenado la vista de avisos falsos. Lo que se vigila ahora es lo que de verdad
 *  no puede pasar: la misma cuaterna repetida. */
export function cadenaDelChip(filas) {
  const orden = (filas || []).slice().sort((a, b) => (a.ingreso < b.ingreso ? -1 : a.ingreso > b.ingreso ? 1 : a.pos - b.pos));
  const cadena = [], conflictos = [], vistas = new Set();
  orden.forEach((f) => {
    const id = f.ind == null ? 'pos' + SEP_IND + f.pos : f.ind;   // sin `ind` no hay con qué duplicar
    if (vistas.has(id)) { conflictos.push(f); return; }
    vistas.add(id);
    cadena.push(f);
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
