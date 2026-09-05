/* AUDITORÍA DE CIERRE · el viaje entero, de la captura al papel y al tablero.
   Un solo viaje recorre las TRES mitades con el código REAL de cada una:
     captura (engine.js) → payload → GAS (upsert) → hoja → tablero (traslado.data.js)
                          └→ PDF (buildTrasPdfHtml)
   Lo que se busca son DISCREPANCIAS: que el papel y la pantalla no cuenten lo mismo
   del mismo viaje es el defecto que nadie ve hasta que hace falta. */
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

/* La raíz del repo se deduce de dónde vive ESTE archivo (scripts/auditorias/), así que
   la auditoría corre igual desde el repo, desde la carpeta de herramientas o desde el
   ubuntu de la CI. Antes era una ruta absoluta de una máquina concreta, que es lo que
   impedía que la corriera nadie más. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..') + '/';
/* `file:///` + ruta sólo funciona en Windows: en Linux la ruta ya empieza por `/` y
   quedaría `file:////home/...`. `pathToFileURL` acierta en los dos y además escapa los
   espacios del nombre de carpeta, que es lo que hacía el `.replace(/ /g, "%20")`. */
const urlDe = (rel) => pathToFileURL(RAIZ + rel).href;
const leer = (p) => readFileSync(RAIZ + p, 'utf8').split('\r\n').join('\n');
function bloque(src, desde, hasta) {
  const i = src.indexOf(desde); const j = src.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error('ancla: ' + desde.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

/* ── El monolito de captura ───────────────────────────────── */
const src = leer('public/registros/engine.js');
const code = bloque(src, 'const TRAS_REC_KEY   = "larv4_tras_records";',
  '  return { sheetName: TRAS_SHEET, headers: TRAS_HEADERS.slice(), rows: rows };\n}')
  + '\n' + bloque(src, 'function trasFmtMin(min){', '    + "</body></html>";\n}')
  /* ⚠ 2026-09-04, y es la MISMA historia que `filasUniformes` de aquí abajo: `08f78d3`
     (el álbum de «📷 Fotos») hizo que `buildTrasPdfHtml` llame a `trasFotosPdfHtml`, que
     vive 900 líneas más abajo y NO entraba en ninguno de los dos bloques. El arnés murió
     con «trasFotosPdfHtml is not defined» desde un commit que YA estaba en producción, y
     nadie lo vio porque estas dos auditorías no están en `npm test`. Se traen las REALES;
     `trasFotoList` viene con ella porque es de quien lee el álbum. */
  /* ⚠ El ancla de cierre es `return out;`, NO la línea del `sort` que hay justo encima.
     Lo cazó `probar-e2e-anexo`: con el sort de ancla, mutar el criterio de orden —o
     cambiarlo mañana con razón— no hacía fallar la comprobación del orden, hacía morir al
     arnés entero con «ancla:». Un ancla puesta sobre LÓGICA convierte cualquier cambio de
     esa lógica en una avería del instrumento, y de paso tapa lo que el instrumento medía. */
  + '\n' + bloque(src, 'function trasFotoList(viaje){', '  return out;\n}')
  + '\n' + bloque(src, 'function trasFotosPdfHtml(viaje){',
    "      }).join(\"\")\n    + '</div></div>';\n}");
/* ⚠⚠ EL `sanitizeStr` TIENE QUE SER EL DE VERDAD (corregido el 2026-08-26).
   Aquí había un stub `trim().slice()` que es MÁS PERMISIVO que el real: el de
   verdad borra los `= + - @` INICIALES para impedir la inyección de fórmulas en
   Sheets, y la longitud de Ecuador es NEGATIVA (≈ −80.98). Con el stub, mandar
   la coordenada por la vía de texto —el defecto que el monolito evita separando
   `trasTxt` de `trasNum`— NO producía ningún daño en esta auditoría y pasaba en
   verde. Se midió: la rotura sobrevivía. Un arnés más benévolo que el producto
   no puede certificar al producto. */
const { sanitizeStr } = await import(
  urlDe('src/core/trovan.js'));

/* El álbum vive en el dispositivo, así que `trasFotoList` lee de `localStorage`. Esto es
   un adaptador del ENTORNO —como `escapeHtml`—, no una versión más blanda de la lógica:
   guarda y devuelve exactamente lo que se le pone, y el filtrado por prefijo, el TTL y el
   orden los sigue decidiendo el código real del monolito. */
const almacen = new Map();
const localStorage = {
  get length() { return almacen.size; },
  key: (i) => Array.from(almacen.keys())[i] ?? null,
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => { almacen.set(String(k), String(v)); },
  removeItem: (k) => { almacen.delete(k); },
};

const ctx = {
  String, Number, Object, Array, JSON, Math, Date, parseFloat, isFinite, isNaN, Set,
  RPRE: 'larv4_recov_',
  sanitizeStr, localStorage,
  escapeHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
};
ctx.globalThis = ctx;
createContext(ctx);

/* ⚠⚠ LA GUARDA, y es la parte que importa de la reparación del 2026-09-04.
   Traer `trasFotosPdfHtml` arregla ESTA rotura; esto arregla la CLASE. Dos veces ya
   (M5 con `filasUniformes`, y ahora) el arnés ha muerto porque el producto empezó a
   llamar a algo que los bloques no traían, y las dos veces el síntoma fue un
   `ReferenceError` en mitad de la ejecución — a cientos de líneas de la causa, y sólo
   cuando a alguien le daba por correr esto a mano.
   Aquí se comprueba ANTES de ejecutar: toda llamada del vocabulario del módulo
   (`trasX…`, `_trasX…`, `buildTrasX…`) tiene que estar definida en lo que se ha extraído
   o puesta en el `ctx`. El lookbehind descarta los accesos por propiedad (`o.trasX()`),
   que no son funciones sueltas del monolito.
   🔑 La MAYÚSCULA tras el prefijo no es adorno: sin ella el barrido también caza la
   PROSA —«…del traslado (usuario, 2026-08-23)», «"N traslado(s) enviado(s)"»— y da un
   rojo permanente, que es lo que esconde el rojo siguiente. Se midió antes de fijarla:
   las 87 funciones `tras*`/`buildTras*` del monolito son camelCase y NINGUNA lleva
   minúscula ahí, así que la mayúscula separa el código del texto sin dejar fuera a nadie.
   Se resuelve por regex a propósito: un tokenizador casero ya se desincronizó una vez en
   este proyecto con una comilla dentro de un regex (`verificar-3copias-v3`). */
const defs = new Set(Object.keys(ctx));
for (const m of code.matchAll(/(?:function|const|let|var)\s+([A-Za-z0-9_$]+)/g)) defs.add(m[1]);
/* ⚠ Se vacían antes los atributos de evento. Lo que hay dentro de un `onclick="trasX()"`
   es una CADENA que el navegador ejecuta y este arnés no: exigirla en el sandbox sería un
   falso positivo, y un falso positivo aquí no molesta, BLOQUEA — el arnés se niega a
   correr y acaba desactivándose la guarda. Medido hoy: en lo extraído hay 1 atributo `on*`
   y 0 llamadas del vocabulario dentro, así que ahora mismo no cambia nada; se pone porque
   los bloques crecen, y al mutar el banco se vio exactamente ese caso (salieron
   `trasGuardarLocal`, `trasCamChange`… todas desde HTML). */
const codeEjec = code.replace(/on[a-z]+="[^"]*"/g, 'on-attr=""');
const faltan = [...new Set(
  [...codeEjec.matchAll(/(?<![.\w$])((?:_?tras|buildTras)[A-Z][A-Za-z0-9_$]*)\s*\(/g)].map((m) => m[1]),
)].filter((n) => !defs.has(n));
if (faltan.length) {
  console.error('EL ARNÉS NO PUEDE CERTIFICAR AL PRODUCTO: falta traer al sandbox');
  faltan.forEach((n) => console.error('  · ' + n));
  console.error('\nAñade su `bloque(src, ...)` arriba, anclando en la FIRMA de la función.');
  console.error('La REAL, nunca un stub: un arnés más benévolo que el producto no lo certifica.');
  process.exit(1);
}

/* `_trasViajeActivo` se declara con `let`, así que vive en el ámbito léxico del script y
   NO se cuelga del `globalThis` del contexto: desde fuera no hay forma de tocarlo. Se
   expone un asa mínima para poder situar el viaje, que es lo que decide de qué álbum
   tira el anexo. Es acceso, no lógica: quien lista y quien pinta siguen siendo los reales. */
new Script(code + '\n;globalThis.__c = { buildTrasPayload, buildTrasPdfHtml, trasFmtMin, '
  + 'trasFotoList, trasFotosPdfHtml, TRAS_HEADERS, '
  + 'setViaje: (v) => { _trasViajeActivo = v; } };')
  .runInContext(ctx);
const cli = ctx.__c;

/* ── El GAS ───────────────────────────────────────────────── */
const gsrc = leer('GAS/Code.gs');
const gcode = bloque(gsrc, 'const ALLOWED = [', 'const RATE_MAX = 30, RATE_MS = 60000;')
  + '\n' + bloque(gsrc, 'function cleanCell(val) {', '\n}')
  + '\n' + bloque(gsrc, 'function lastRow(ws) {', '\n}')
  /* ⚠ M5 (2026-08-30) hizo que upsertAstRows llame a filasUniformes. Sin traerla al
     sandbox, el arnés muere con «filasUniformes is not defined» — y como estas dos
     auditorías NO están en `npm test`, se quedaron rotas EN SILENCIO hasta que se
     corrieron a mano. Se trae la REAL de Code.gs, nunca un stub: un arnés más
     benévolo que el producto no puede certificar al producto. */
  + '\n' + bloque(gsrc, 'function filasUniformes(filas) {', '  return { filas: out, ancho: ancho };\n}')
  + '\n' + bloque(gsrc, 'function upsertAstRows(ws, newRows) {', '  return { upserted: updated, appended: added };\n}');
const gctx = { String, Number, Object, Array, JSON, Math, isFinite, Date, fmtData() {} };
gctx.globalThis = gctx;
createContext(gctx);
new Script(gcode + '\n;globalThis.__g = { upsertAstRows };').runInContext(gctx);
const gas = gctx.__g;

function hojaFalsa(headers) {
  const filas = [headers.slice()];
  return { _filas: filas,
    getLastColumn: () => (filas[0] ? filas[0].length : 0), getLastRow: () => filas.length,
    getMaxColumns: () => 60, insertColumnsAfter() {},
    getDataRange: () => ({ getValues: () => filas.map((f) => f.slice()) }),
    getRange(r, c, nR, nC) { return {
      getValues: () => { const o = []; for (let i = 0; i < nR; i++) o.push((filas[r-1+i]||[]).slice(c-1, c-1+nC)); return o; },
      setValues: (v) => { v.forEach((row, i) => { const f = filas[r-1+i] || (filas[r-1+i] = []); row.forEach((cell,k)=>{ f[c-1+k]=cell; }); }); } }; } };
}

/* ── El tablero ───────────────────────────────────────────── */
const { trasladoDe } = await import(urlDe('src/views/supervisor/traslado.data.js'));
const { tiempoDe, fmtMinutos } = await import(urlDe('src/views/supervisor/traslado.data.js'));

/* ── Un viaje real: nocturno, cruza medianoche, 2 camiones ── */
const tinasDe = (o2, temp, act) => Object.fromEntries([1,2,3,4,5,6].map((t) => ([t, {
  o2: (o2 + t * 0.05).toFixed(2), temp: String(temp), act, alim: 'Artemia' }])));
const HORAS = ['20:45', '22:10', '23:55', '02:30'];
const LUG = ['Laboratorio', 'Peaje 1', 'Gabarra 1', 'Camaronera'];
const data = {
  fecha: '2026-08-26', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
  salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
  insumos: ['Artemia', 'Flake'], check: ['Oxigenómetro'],
  controlador: 'Juan', chequeador: 'Pedro', recepcion: 'María',
  camiones: [{ placa: 'GSA-1147', tinasOff: [7, 8] }, { placa: 'PBX-0392', tinasOff: [7, 8] }],
  revisiones: HORAS.map((h, i) => ({
    hora: h, lugar: LUG[i], lat: -2.21 - i * 0.01, lon: -80.97 - i * 0.01, precision: 12,
    ubicacion: 'x', horaRegistro: 't', obs: i === 2 ? 'Dos tinas con actividad baja.' : '',
    camiones: [{ tinas: tinasDe(7.6 - i * 0.25, 26 - i, 'Alta') },
               { tinas: tinasDe(6.9 - i * 0.30, 26 - i, 'Normal') }],
  })),
};

const reg = { id: 'tv-audit', data };
const pay = cli.buildTrasPayload([reg]);
const ws = hojaFalsa(cli.TRAS_HEADERS);
const res = gas.upsertAstRows(ws, pay.rows);

const filas = ws._filas.slice(1).map((f) => {
  const o = { _SheetOrigin: 'Registro_Traslado' };
  cli.TRAS_HEADERS.forEach((h, i) => { o[h] = f[i]; });
  return o;
});
const t = trasladoDe(filas, 'M07', '555');
const tiempo = tiempoDe(t.camiones);
const html = cli.buildTrasPdfHtml(data);

const sacar = (re) => (html.match(re) || [])[1];
const enRutaPdf = sacar(/Tiempo en ruta<\/label><span>([^<]*)/);
const puertaPdf = sacar(/Puerta a puerta<\/label><span>([^<]*)/);

console.log('EL VIAJE, DE PUNTA A PUNTA');
console.log('  payload            : ' + pay.rows.length + ' filas   GAS: ' + JSON.stringify(res));
console.log('  el tablero lee     : ' + t.camiones.length + ' camión(es), '
  + t.camiones.map((c) => c.nParadas + ' paradas').join(' / '));
console.log('');
console.log('COINCIDENCIAS PAPEL ↔ TABLERO');
/* ⚠⚠ Esta auditoría IMPRIMÍA las discrepancias y salía con 0 igualmente, así que no
   podía formar parte de ninguna cadena: metida en un verificador, habría dado verde con
   el papel y el tablero contando cosas distintas. Se cuentan los fallos y se sale con
   ellos, como ya hacía la adversa de al lado. */
let fallos = 0;
const cmp = (etq, a, b) => {
  const bien = String(a) === String(b);
  if (!bien) fallos++;
  console.log('  ' + (bien ? 'ok ' : '** DISCREPA ')
    + etq.padEnd(26) + ' papel=' + a + '   tablero=' + b);
};
cmp('tiempo en ruta', enRutaPdf, fmtMinutos(tiempo.enRuta));
cmp('puerta a puerta', puertaPdf, fmtMinutos(tiempo.puertaAPuerta));
cmp('nº de paradas', (html.match(/<td class='np'>/g) || []).length / 6, t.camiones[0].nParadas);
cmp('nº de camiones', (html.match(/class="ctit"/g) || []).length, t.camiones.length);
cmp('placa 1', /GSA-1147/.test(html), t.placas.includes('GSA-1147'));
cmp('placa 2', /PBX-0392/.test(html), t.placas.includes('PBX-0392'));
cmp('observaciones', /Dos tinas con actividad baja/.test(html),
  t.camiones[0].observaciones.length > 0);

console.log('');
console.log('LOS DOS FORMATEADORES DE TIEMPO (uno en cada mitad)');
let dif = 0;
for (let m = 0; m <= 600; m++) if (cli.trasFmtMin(m) !== fmtMinutos(m)) dif++;
if (dif) fallos++;
console.log('  minutos 0..600 con salida distinta: ' + dif + (dif ? '  ** DISCREPAN' : '  ok'));
console.log('  null: papel=' + cli.trasFmtMin(null) + '  tablero=' + fmtMinutos(null));

console.log('');
console.log('MEDIAS: el papel calcula, el tablero también');
const promPdf = sacar(/class='med'>([\d.]+)/);
const medBien = String(promPdf) === t.camiones[0].paradas[0].o2.toFixed(2);
if (!medBien) fallos++;
console.log('  1ª parada, camión 1 → papel=' + promPdf
  + '   tablero=' + t.camiones[0].paradas[0].o2.toFixed(2)
  + (medBien ? '   ok' : '   ** DISCREPA'));

/* ── El anexo fotográfico ─────────────────────────────────────
   ⚠⚠ Reparar el arnés trayendo `trasFotosPdfHtml` lo devolvía a verde, pero con el
   álbum VACÍO esa función sale por su primera línea y el anexo no se ejerce: el arnés
   certificaría el PDF sin haber mirado nunca lo que se rompió. Es el fixture que no
   prueba nada, escrito en la memoria de este proyecto. Así que se siembra el álbum. */
console.log('');
console.log('EL ANEXO FOTOGRÁFICO DEL VIAJE');
const af = (etq, ok) => { if (!ok) fallos++; console.log('  ' + (ok ? 'ok ' : '** FALLA ') + etq); };

/* 🔑 Se mide el MARCADO (`class="fanexo"`), no la palabra: el PDF emite SIEMPRE su hoja
   de estilos, y ahí vive `.fanexo{…}`. Buscar «fanexo» a secas daba un rojo constante con
   el anexo correctamente ausente — la misma trampa de comprobar la cadena en vez de lo
   que la cadena significa, cazada aquí por la propia comprobación al escribirla. */
af('sin fotos no se imprime NADA, ni el título',
  !/class="fanexo"/.test(html) && !/ANEXO FOTOGRÁFICO DEL VIAJE<\/div>/.test(html));

const VIAJE = 'tv-audit';
const foto = (viaje, id, ts, nota) => ctx.localStorage.setItem(
  'larv4_tras_foto_' + viaje + '_' + id,
  JSON.stringify({ ts, nota, durl: 'data:image/jpeg;base64,/9j/' + id }),
);
foto(VIAJE, 'f2', Date.now() - 1000, 'Tina 3 al <cargar>');
foto(VIAJE, 'f1', Date.now() - 9000, '');
foto('otro-viaje', 'x9', Date.now(), 'NO debe salir');
cli.setViaje(VIAJE);
const htmlF = cli.buildTrasPdfHtml(data);

af('con fotos, el anexo aparece', /class="fanexo"/.test(htmlF));
af('salen las 2 figuras del viaje, y sólo ésas',
  (htmlF.match(/class="fa-fig"/g) || []).length === 2);
/* Listar es SIEMPRE por viaje: el álbum de otro viaje comparte el prefijo `larv4_tras_foto_`
   y sólo lo separa el id, así que un filtro flojo mezclaría las fotos de dos camiones. */
af('las fotos de OTRO viaje no se cuelan', !/NO debe salir/.test(htmlF));
af('van en orden de captura (la más vieja, Figura 1)',
  htmlF.indexOf('base64,/9j/f1') < htmlF.indexOf('base64,/9j/f2'));
af('el pie de figura llega, y ESCAPADO',
  /Figura 2 · Tina 3 al &lt;cargar&gt;/.test(htmlF));
af('la figura sin pie no inventa separador', /Figura 1<\/figcaption>/.test(htmlF));
/* Decisión del usuario, y va escrita en el propio monolito: el anexo es un anexo del
   informe, no parte del acta que se firma, así que va DESPUÉS de las firmas. */
af('el anexo va DESPUÉS de las firmas',
  htmlF.indexOf('class="fanexo"') > htmlF.indexOf('Responsable de recepción'));

const caduca = 'larv4_tras_foto_' + VIAJE + '_vieja';
ctx.localStorage.setItem(caduca, JSON.stringify(
  { ts: Date.now() - 49 * 60 * 60 * 1000, nota: 'caducada', durl: 'data:image/jpeg;base64,/9j/z' }));
const htmlC = cli.buildTrasPdfHtml(data);
af('una foto pasada de las 48 h no sale', !/caducada/.test(htmlC));
af('y además se purga del dispositivo', ctx.localStorage.getItem(caduca) === null);

console.log('\n======================================================================');
console.log(fallos ? ' *** ' + fallos + ' DISCREPANCIA(S) ***' : ' EL PAPEL Y EL TABLERO CUENTAN LO MISMO');
console.log('======================================================================');
process.exit(fallos ? 1 : 0);
