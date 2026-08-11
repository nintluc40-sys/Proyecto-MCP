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

/** Input sanitization: recorta a 200 chars y elimina los caracteres de inyección de
 *  fórmula iniciales (= + - @) que llegarían a Google Sheets. */
export function sanitizeStr(s) {
  if (s === null || s === undefined) return '';
  let str = String(s).trim().slice(0, 200);
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
