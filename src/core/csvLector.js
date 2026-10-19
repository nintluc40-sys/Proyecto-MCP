/* ============================================================
   LECTOR del CSV de exportación de Google (carga lenta C, pauta 2.3, 2026-10-19, usuario)

   Hasta el 19-10 cada hoja se leía con SheetJS: `XLSX.read(texto, { type: 'string', raw: true, dense: true })` y
   `sheet_to_json(hoja, { defval: '', raw: false })`. Era la mayor parte de la CPU de la fase CSV en el Worker (perfil
   del 18-10: SheetJS 3,1–3,5 s de 8–14 s). Esto es el MISMO algoritmo de SheetJS 0.20.3 (su lector de texto
   delimitado y `sheet_to_json`, en public/vendor/xlsx.full.min.js), sin el libro intermedio ni un objeto por celda.
   Medido con el libro real: las 44 hojas salen IDÉNTICAS (filas, claves y su orden) en un tercio del tiempo (lectura
   1,76 → 0,66 s en el PC); 60 000 CSV al azar, también. Lo vigila csvLector.test.js contra el propio SheetJS.

   Las reglas (las de SheetJS, tal cual):
   - Coma entre campos; fin de fila con \n, \r\n o un \r suelto. Una comilla sólo cuenta si ABRE el campo: dentro,
     comas y saltos son texto. Si el campo empieza Y termina en comilla, pierde las dos y «""» pasa a «"».
   - La primera fila son las cabeceras: una vacía es «__EMPTY» y una repetida lleva «_1», «_2»… (con un objeto `{}`
     como el de SheetJS: hasta su rareza con nombres como «constructor» sale igual).
   - Cada fila con algún texto da un objeto con TODAS las columnas (las vacías, ''); las filas sin ningún texto no
     salen. Los valores son el texto tal cual: sin recortar espacios ni adivinar tipos.
   Lo que NO copia, a propósito: SheetJS mira cómo empieza el texto («<», «ID», «TABL»… lo leería como OTRO formato) y
   adivina el separador (si al principio hubiera más «;», tabuladores o «|» que comas). Google exporta siempre CSV con
   coma: aquí se lee siempre así. Ninguna hoja del libro lo activa hoy (por eso salen idénticas). Tampoco pone
   `__rowNum__` (SheetJS lo deja oculto en cada fila): nadie lo usa y el postMessage del Worker no lo lleva.
   ============================================================ */

/** Las filas de un CSV (ya sin BOM) como las daba `sheet_to_json` de SheetJS: un objeto por fila con texto, con las
 *  cabeceras de la primera fila por claves. */
export function leerCsv(texto) {
  const n = texto.length;
  const celdas = [];   // celdas[fila][columna] = su texto; las vacías no se guardan (como SheetJS)
  let fila = 0, col = 0, inicio = 0, dentro = false, abre = texto.charCodeAt(0), ultCol = 0, ultFila = 0, i = 0, c = 0;
  const cerrar = () => {
    let s = texto.slice(inicio, i);
    if (s.charCodeAt(s.length - 1) === 13) s = s.slice(0, -1);
    if (s.charCodeAt(0) === 34 && s.charCodeAt(s.length - 1) === 34) s = s.slice(1, -1).replace(/""/g, '"');
    if (s.length) (celdas[fila] || (celdas[fila] = []))[col] = s;
    inicio = i + 1; abre = texto.charCodeAt(inicio);
    if (ultCol < col) ultCol = col;
    if (ultFila < fila) ultFila = fila;
    if (c === 44) ++col; else { col = 0; ++fila; }
  };
  for (; i < n; ++i) {
    switch ((c = texto.charCodeAt(i))) {
      case 34: if (abre === 34) dentro = !dentro; break;                          // «"»
      case 13: if (dentro) break; if (texto.charCodeAt(i + 1) === 10) ++i;       // «\r» o «\r\n»: fin de fila
      // falls through
      case 44: case 10: if (!dentro) cerrar(); break;                            // «,» y «\n»
      default: break;
    }
  }
  if (i - inicio > 0) cerrar();
  const claves = [], vistas = {}, cab = celdas[0] || [];
  for (let k = 0; k <= ultCol; ++k) {
    const s = cab[k] === undefined ? '__EMPTY' : cab[k];
    let clave = s, p = vistas[s] || 0;
    if (!p) vistas[s] = 1;
    else { do { clave = s + '_' + p++; } while (vistas[clave]); vistas[s] = p; vistas[clave] = 1; }
    claves[k] = clave;
  }
  const filas = [];
  for (let r = 1; r <= ultFila; ++r) {
    const d = celdas[r];
    if (!d) continue;   // sin ninguna celda con texto
    const o = {};
    for (let k = 0; k <= ultCol; ++k) { const x = d[k]; o[claves[k]] = x === undefined ? '' : x; }
    filas.push(o);
  }
  return filas;
}
