/* ============================================================
   REGISTROS · esquema de la ficha «Control Broodstock» de Maduración (2026-09-17, usuario)

   Es la ÚNICA ficha de CARGA MASIVA del sistema: un usuario concreto sube cada semana la hoja de
   cálculo del área de Broodstock y el sistema la ordena por debajo. No se teclea nada fila a fila.
   Modelo PURO — sin DOM, sin localStorage, sin red. El monolito lleva su copia inline.

   ── QUÉ ES ESTA HOJA, Y POR QUÉ IMPORTA MÁS DE LO QUE PARECE ──────────────────
   🔑 NO es una isla: es el AGUAS ARRIBA del registro reproductivo. Medido contra producción el
   2026-09-17, todas las filas de «Maduración MATRIZ» salen de sólo TRES piscinas, y las tres están en
   este Excel. Las reproductoras con Trovan que viven en la MATRIZ se cosechan de estas piscinas, y su
   «Código genético» es el `Codigo` de aquí. En una de ellas se comprobó: la MATRIZ guarda el código SIN
   espacios y el Excel CON ellos —el MISMO código con otro espaciado—, que `normCodigo` reconcilia igual que
   hace el reproductivo con el suyo. (Aquí se citaban las piscinas y el código reales; el usuario pidió el
   2026-09-18 que el repo no lleve valores reales, y el razonamiento no los necesita.)
   ⚠ Y lo que NO hay que concluir: para las otras dos los códigos no casan con los de la MATRIZ, y no es un
   error. El Excel es la foto de lo que hay AHORA en la piscina; aquellas reproductoras salieron de una
   cosecha anterior. El par (piscina, código) cambia con el tiempo, y por eso la foto semanal vale.

   ── DECISIONES DEL USUARIO (2026-09-17) ───────────────────────────────────────
   · Las PISCINAS son fijas del área; los CÓDIGOS GENÉTICOS varían cada tanto. Así que la llave es
     (fecha de corte · piscina): una fila por piscina y semana, y el histórico son las semanas.
   · Entra una columna nueva **Pl/g**, al lado de «Peso de siembra»: las postlarvas por gramo (ej. 120).
     Nace porque en el Excel esa cifra venía DENTRO del peso de siembra como texto («120.pl») en las
     piscinas de precría, mientras en las demás iba en gramos. Dos cosas distintas en una columna.
   · Las FASES son tres —Pre-reproductor, Precría y Engorde— y hay que canonizar la grafía: el archivo
     trae «PRECRIA» y «Pre-reproductor» a la vez. Mismo criterio que el analista (R7, 2026-09-16).
   · Las piscinas SIN datos NO se suben: «no tienen datos que pasar; cuando los tengan, ahí se subirían».
     En el archivo de ejemplo eran 7 de 20 (sólo número y área).
   · La fecha de una de las columnas de peso venía mal escrita (un mes de diferencia). Se AVISA, para
     corregirlo con quien llena la hoja; no se arregla por dentro, que sería tapar el error.

   ── LO QUE SE RECALCULA, Y POR QUÉ ────────────────────────────────────────────
   El Excel trae columnas calculadas (densidad, días, edad, incremento, crecimiento). Aquí se RECALCULAN
   desde los datos crudos en vez de copiarlas: es la regla de todo el módulo de Maduración, y es lo que
   convierte una errata de la hoja en una discrepancia visible en vez de en un dato malo.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';

export const MAD_BS_SHEET = 'Maduración Broodstock';

/* ── Las tres FASES, en la grafía que manda ──────────────────────────────────
   El archivo las trae como venga («PRECRIA», «Pre-reproductor»). Se canoniza al cargar: sin tildes, sin
   espacios y en minúsculas para comparar, y se escribe SIEMPRE la forma de esta lista. Una fase que no
   esté aquí NO se inventa: se deja tal cual y se avisa, como se hace con un analista fuera de catálogo. */
export const MAD_BS_FASES = ['Precría', 'Engorde', 'Pre-reproductor'];
const plano = (s) => sanitizeStr(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s._-]+/g, '');
const FASE_POR_PLANO = new Map(MAD_BS_FASES.map((f) => [plano(f), f]));
/** La fase en su grafía canónica, o '' si no está en el catálogo (y entonces se conserva lo que vino). */
export function faseCanonica(v) {
  return FASE_POR_PLANO.get(plano(v)) || '';
}

/* ── Normalizadores ─────────────────────────────────────────────────────────── */
/** Piscina: es un identificador, no un número. Se guarda como TEXTO sin espacios, porque el Excel la
 *  trae unas veces como número y otras como texto y las dos tienen que dar la misma llave. */
export const normPiscina = (v) => sanitizeStr(v, 20).replace(/\s+/g, '');
/** Código genético: misma normalización que en el reproductivo, o el mismo código se partiría en dos
 *  al cruzarlo con la MATRIZ. Ver `normCodigoGenetico` en ficha-maduracion-desoves.schema.js. */
export const normCodigo = (v) => sanitizeStr(v, 60).toUpperCase().replace(/\s+/g, '');

/* ⚠⚠ EXIGE QUE TODO EL TEXTO SEA EL NÚMERO, y no es quisquillosería: `parseFloat('120.pl')` devuelve
   **120**, y un «120.pl» es literalmente lo que el archivo traía en el «Peso de siembra» de la precría. Con
   un parseo tolerante, esas postlarvas por gramo entrarían en la hoja como 120 GRAMOS de peso — que es
   el error que la columna `Pl/g` viene a cerrar, colado por la puerta de atrás. */
const num = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  const s = String(v).trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : '';
};
const ent = (v) => {
  const n = num(v);
  return n === '' ? '' : Math.trunc(n);
};
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
/** La fecha `v` si es un día REAL, '' si no. `esFecha` es sólo el patrón: «2026-02-31» lo pasa. */
export function diaReal(v) {
  const s = sanitizeStr(v, 10);
  if (!esFecha(s)) return '';
  const [a, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return (f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d) ? s : '';
}
/** Días enteros entre dos días ISO reales (b − a), o '' si alguno no lo es. */
export function diasEntre(a, b) {
  const x = diaReal(a), y = diaReal(b);
  if (!x || !y) return '';
  return Math.round((Date.parse(y + 'T00:00:00Z') - Date.parse(x + 'T00:00:00Z')) / 86400000);
}
const r2 = (n) => (n === '' ? '' : Math.round(n * 100) / 100);

/* ── Las columnas de la hoja ─────────────────────────────────────────────────
   ⚠ «Fecha de corte» y «Piscina» van PRIMERO y en ese orden: son la llave posicional [0,1], y una llave
   al principio deja que todo lo demás crezca por el final sin migrar nada.
   🔑 El bloque de cinco PESOS del Excel (con sus fechas en una fila aparte) NO se copia como cinco
   columnas: la serie semanal SON las filas de las semanas anteriores. Copiarlo obligaría a rotar las
   columnas cada semana, que es justo la clase de cosa que convierte una hoja en una migración. */
export const MAD_BS_COLUMNS = [
  { h: 'Fecha de corte', k: 'fechaCorte', grain: 'llave' },
  { h: 'Piscina', k: 'piscina', grain: 'llave' },
  { h: 'Área (ha)', k: 'area', num: true },
  { h: 'Fecha siembra', k: 'fechaSiembra' },
  { h: 'Cantidad sembrada', k: 'cantidad', num: true },
  { h: 'Densidad (cam/m²)', k: 'densidad', num: true, calc: true },
  { h: 'Peso de siembra (g)', k: 'pesoSiembra', num: true },
  { h: 'Pl/g', k: 'plg', num: true },
  { h: 'Fase actual', k: 'fase' },
  { h: 'Peso actual (g)', k: 'peso', num: true },
  { h: 'Fecha del peso', k: 'fechaPeso' },
  { h: 'Incremento última semana (g)', k: 'incremento', num: true, calc: true },
  { h: 'Crecimiento fase actual (g/sem)', k: 'crecimiento', num: true, calc: true },
  { h: 'Sobrevivencia estimada (%)', k: 'sobrevivencia', num: true },
  { h: 'Días fase 1 (precría)', k: 'dias1', num: true },
  { h: 'Días fase 2 (engorde)', k: 'dias2', num: true },
  { h: 'Días fase 3 (pre-reproductor)', k: 'dias3', num: true },
  { h: 'Edad total (días)', k: 'edad', num: true, calc: true },
  { h: 'Piscina origen', k: 'piscinaOrigen' },
  { h: 'Camaronera', k: 'camaronera' },
  { h: 'Código genético', k: 'codigo' },
  { h: 'Observación', k: 'observacion' },
];
export const MAD_BS_HEADERS = MAD_BS_COLUMNS.map((c) => c.h);
export const MAD_BS_KEY_COLS = [0, 1];   // Fecha de corte + Piscina

/* ── ¿Tiene datos que pasar? ─────────────────────────────────────────────────
   Decisión del usuario: una piscina con sólo su número y su área NO se sube, «cuando tenga datos ahí se
   subiría». Lo que cuenta como dato es que haya siembra: sin fecha de siembra ni cantidad, la fila no
   dice nada de una producción. El área sola no basta —la traen TODAS, incluidas las vacías—. */
export function tieneDatos(p) {
  const x = p || {};
  return !!(diaReal(x.fechaSiembra) || ent(x.cantidad) !== '' || num(x.peso) !== '' || sanitizeStr(x.fase, 60));
}

/** Días de cultivo de la fase ACTUAL: de la siembra a la fecha de corte. Es lo que hace el Excel, que
 *  cuenta la fase en curso contra su propia fecha de corte y arrastra las anteriores ya cerradas. */
export function diasDeLaFaseActual(p, fechaCorte) {
  return diasEntre((p || {}).fechaSiembra, fechaCorte);
}

/* ── Fila lista para la hoja ─────────────────────────────────────────────────
   `p` es una piscina ya leída del archivo. Lo CALCULADO se recalcula aquí; lo que venga calculado en el
   archivo no se copia, para que una errata suya salte en vez de entrar. */
export function filaDeBroodstock(p, fechaCorte) {
  const x = p || {};
  const corte = diaReal(fechaCorte);
  const area = num(x.area), cantidad = ent(x.cantidad);
  const peso = num(x.peso), pesoSiembra = num(x.pesoSiembra);
  const fase = faseCanonica(x.fase) || sanitizeStr(x.fase, 60);

  /* La fase actual manda sus días; las otras dos llegan ya contadas del archivo. Sin saber cuál es la
     fase, no se inventa: se dejan los tres como vinieron. */
  const dias = { dias1: ent(x.dias1), dias2: ent(x.dias2), dias3: ent(x.dias3) };
  const enCurso = { 'Precría': 'dias1', 'Engorde': 'dias2', 'Pre-reproductor': 'dias3' }[fase];
  const propios = diasDeLaFaseActual(x, corte);
  if (enCurso && propios !== '') dias[enCurso] = propios;

  const edad = ['dias1', 'dias2', 'dias3'].every((k) => dias[k] === '') ? ''
    : ['dias1', 'dias2', 'dias3'].reduce((a, k) => a + (dias[k] === '' ? 0 : dias[k]), 0);

  const densidad = (cantidad !== '' && area !== '' && area > 0) ? r2(cantidad / (area * 10000)) : '';
  /* Crecimiento de la fase actual, semanal: lo ganado desde la siembra repartido entre sus días, por 7.
     Sin días de la fase no se puede, y dividir por cero daría Infinity. */
  const dEnCurso = enCurso ? dias[enCurso] : '';
  const crecimiento = (peso !== '' && pesoSiembra !== '' && dEnCurso !== '' && dEnCurso > 0)
    ? r2(((peso - pesoSiembra) / dEnCurso) * 7) : '';
  const incremento = (peso !== '' && num(x.pesoPrevio) !== '') ? r2(peso - num(x.pesoPrevio)) : '';

  const valores = {
    fechaCorte: corte,
    piscina: normPiscina(x.piscina),
    area, fechaSiembra: diaReal(x.fechaSiembra), cantidad, densidad,
    pesoSiembra, plg: num(x.plg),
    fase,
    peso, fechaPeso: diaReal(x.fechaPeso),
    incremento, crecimiento,
    sobrevivencia: num(x.sobrevivencia),
    dias1: dias.dias1, dias2: dias.dias2, dias3: dias.dias3, edad,
    piscinaOrigen: normPiscina(x.piscinaOrigen),
    camaronera: sanitizeStr(x.camaronera, 60),
    codigo: normCodigo(x.codigo),
    observacion: sanitizeStr(x.observacion, 500),   // 500 y no 200: lleva también las notas de debajo de la tabla (punto 8)
  };
  return MAD_BS_COLUMNS.map((c) => (valores[c.k] === undefined ? '' : valores[c.k]));
}

/** Filas de la carga: una por piscina CON datos, en el orden del archivo. */
export function buildBroodstockRows(model) {
  const m = model || {};
  const corte = diaReal(m.fechaCorte);
  if (!corte) return [];
  return (m.piscinas || []).filter((p) => normPiscina((p || {}).piscina) && tieneDatos(p))
    .map((p) => filaDeBroodstock(p, corte));
}

/** Payload listo para `doPost`. Llave posicional (Fecha de corte · Piscina): volver a subir la MISMA
 *  semana CORRIGE sus filas en vez de duplicarlas, que es lo que hace útil re-subir un archivo. */
export function buildBroodstockPayload(model) {
  return {
    sheetName: MAD_BS_SHEET,
    headers: MAD_BS_HEADERS.slice(),
    rows: buildBroodstockRows(model),
    replaceKey: true,
    keyCols: MAD_BS_KEY_COLS.slice(),
  };
}

/** ERROR impide subir; AVISO deja subir. Mismo criterio que el resto de Maduración. */
export function validarBroodstock(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];
  const corte = diaReal(m.fechaCorte);
  if (!corte) errores.push('La fecha de corte del archivo no es un día real: sin ella no se sabe de qué semana es la carga.');

  const piscinas = m.piscinas || [];
  if (!piscinas.length) errores.push('El archivo no trae ninguna piscina.');

  const conDatos = piscinas.filter((p) => normPiscina((p || {}).piscina) && tieneDatos(p));
  const vacias = piscinas.filter((p) => normPiscina((p || {}).piscina) && !tieneDatos(p));
  if (!conDatos.length && piscinas.length) errores.push('Ninguna piscina del archivo trae datos que subir.');
  if (vacias.length) {
    avisos.push(vacias.length + ' piscina(s) sin datos no se suben (' + vacias.map((p) => normPiscina(p.piscina)).join(', ') + '): cuando los tengan, se subirán.');
  }

  /* ⚠⚠ LA MISMA PISCINA DOS VECES ES ERROR, no aviso. La llave es (fecha de corte · piscina), así que la
     segunda se fusionaría sobre la primera y sus cifras se perderían sin un solo síntoma. Es el mismo
     defecto que ya se pagó en Traslado y en Desoves. */
  const vistas = new Set();
  conDatos.forEach((p) => {
    const id = normPiscina(p.piscina);
    if (vistas.has(id)) errores.push('La piscina ' + id + ' aparece dos veces en el archivo: la segunda pisaría a la primera.');
    vistas.add(id);
  });

  conDatos.forEach((p) => {
    const id = normPiscina(p.piscina);
    const cruda = sanitizeStr(p.fase, 60);
    if (cruda && !faseCanonica(cruda)) {
      avisos.push('La piscina ' + id + ' trae la fase «' + cruda + '», que no es ninguna de las tres (' + MAD_BS_FASES.join(', ') + '): se sube tal cual.');
    }
    if (sanitizeStr(p.fechaSiembra, 10) && !diaReal(p.fechaSiembra)) {
      avisos.push('La piscina ' + id + ' trae una fecha de siembra que no es un día real: se sube vacía.');
    }
    /* La fecha del peso posterior al corte es la errata que traía el archivo de ejemplo (un mes de
       diferencia). No se corrige por dentro —sería tapar el error—: se dice, para arreglarlo en la hoja. */
    const fp = diaReal(p.fechaPeso);
    if (fp && corte && fp > corte) {
      avisos.push('La piscina ' + id + ' tiene el peso fechado el ' + fp + ', DESPUÉS del corte (' + corte + '): revísalo en la hoja.');
    }
    if (fp && diaReal(p.fechaSiembra) && fp < diaReal(p.fechaSiembra)) {
      avisos.push('La piscina ' + id + ' tiene el peso fechado ANTES de su siembra: revísalo en la hoja.');
    }
    /* La sobrevivencia se guarda en PORCENTAJE (95), no en fracción (0,95). ⚠ En el Excel viene como
       fracción con formato de %, así que el que lee el archivo la multiplica; si llega sin multiplicar,
       un 0,95 pasaría por «0,95 %» sin que nadie lo note. Por eso se avisa del tramo sospechoso: una
       sobrevivencia real por debajo del 1 % no existe en una piscina que se está cosechando. */
    const s = num(p.sobrevivencia);
    if (s !== '' && (s < 0 || s > 100)) avisos.push('La piscina ' + id + ' trae una sobrevivencia de ' + s + ': fuera de 0-100.');
    else if (s !== '' && s > 0 && s < 1) avisos.push('La piscina ' + id + ' trae una sobrevivencia de ' + s + ': parece una fracción sin convertir (¿' + r2(s * 100) + ' %?).');
  });

  return { errores, avisos };
}

/* ── EL LECTOR · de la hoja de cálculo al modelo (V1, 2026-09-18) ───────────────────────────────────────────
   Recibe la hoja TAL COMO LA DA SheetJS con `XLSX.read(datos, { cellNF: true })` —sin `cellDates`—: un objeto con
   una celda por referencia («A3» → { t, v, w, z }) y su rango en «!ref». Es puro: no llama a SheetJS, sólo lee.
   🔑 SE LEE POR CABECERA, NO POR POSICIÓN. Medido el 2026-09-18 en los archivos del usuario: la plantilla del 17-sep
   trae «Camaronera» en la U, y las de julio no la tienen —allí la U es «Codigo» y la V «OBSERVACION»—. Leída por
   posición, una hoja de julio metería el código genético en «Camaronera» y la observación en «Código» sin un solo
   error. Por eso cada columna se busca por su rótulo, y una OBLIGATORIA que falte es error: el archivo no es el que
   se cree, o la plantilla cambió.
   · La cabecera es la fila que dice «Piscina» en la columna A (la 5 en todos los medidos); debajo va la fila de
     FECHAS del bloque de pesos, y los datos empiezan en la siguiente.
   · La FECHA DE CORTE es la celda con fecha de la columna A por encima de la cabecera (la A3). El nombre de la hoja
     NO manda: un nombre como «19 Abr. 26 » es un rótulo, y se ha visto con espacios distintos.
   · El bloque de PESOS va de «PESOS» a la columna antes de la cabecera siguiente, con la fecha de cada semana en la
     fila de fechas. De él salen el ÚLTIMO peso (con su fecha) y el de la columna ANTERIOR: el Excel calcula su
     «Inc. Ult. Sem» como L − K, así que si esa columna está vacía no hay incremento de UNA semana que dar.
   · Las fechas se leen del NÚMERO DE SERIE de Excel, no de un `Date`: el `Date` de SheetJS va en la zona horaria
     del equipo y el día se puede correr; el serial es el día y nada más. */

/* ── La CAMARONERA PEGADA al origen («902 ch», «903ch») ──────────────────────────────────────────────────────────
   Decisión del usuario (2026-09-18): en las hojas de julio —sin columna «Camaronera»— el área escribía el origen como
   el número de la piscina con la camaronera pegada como sufijo, y se separa en piscina de origen y camaronera. Sólo los
   sufijos de esta tabla, con la grafía del catálogo de camaroneras de la app (`DESTINO_OPTS`): uno que no esté aquí NO
   se adivina (se sube tal cual y se avisa). El área va a pedir que la hoja traiga las dos columnas por separado. */
export const MAD_BS_SUFIJO_CAMARONERA = { ch: 'Chongón' };

/* Cada campo, con cómo se reconoce su rótulo (sin tildes, espacios ni signos) y si es OBLIGATORIO. Los calculados
   (densidad, incremento, crecimiento, edad) se reconocen para no avisar de ellos, pero NO se leen: se recalculan. */
export const MAD_BS_CABECERAS = [
  { k: 'piscina', es: (h) => h === 'piscina', obligatoria: true },
  { k: 'area', es: (h) => h.startsWith('area'), obligatoria: true },
  { k: 'fechaSiembra', es: (h) => h === 'fechasiembra', obligatoria: true },
  { k: 'cantidad', es: (h) => h.startsWith('cantidad'), obligatoria: true },
  { k: 'densidad', es: (h) => h.startsWith('densidad'), calculada: true },
  { k: 'pesoSiembra', es: (h) => h.startsWith('pesodesiembra') || h.startsWith('pesosiembra'), obligatoria: true },
  { k: 'fase', es: (h) => h.startsWith('fase'), obligatoria: true },
  { k: 'pesos', es: (h) => h === 'pesos', obligatoria: true },
  { k: 'incremento', es: (h) => h.startsWith('inc'), calculada: true },
  { k: 'crecimiento', es: (h) => h.startsWith('crecimiento'), calculada: true },
  { k: 'sobrevivencia', es: (h) => h.startsWith('sobrev'), obligatoria: true },
  { k: 'dias1', es: (h) => h.startsWith('dias') && h.includes('fase1') },
  { k: 'dias2', es: (h) => h.startsWith('dias') && h.includes('fase2') },
  { k: 'dias3', es: (h) => h.startsWith('dias') && h.includes('fase3') },
  { k: 'edad', es: (h) => h.startsWith('edad'), calculada: true },
  { k: 'piscinaOrigen', es: (h) => h.startsWith('pscorig') || h.startsWith('piscinaorig') },
  { k: 'camaronera', es: (h) => h === 'camaronera' },
  { k: 'codigo', es: (h) => h.startsWith('codigo'), obligatoria: true },
  { k: 'observacion', es: (h) => h.startsWith('observ') },
];
const planoCab = (v) => String(v === null || v === undefined ? '' : v).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
/** Letra de la columna `c` (0 → «A», 25 → «Z», 26 → «AA»). */
export function letraCol(c) {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** Última columna (0 = A) y última fila de la hoja, según su «!ref». */
function limites(ws) {
  const m = /:?([A-Z]+)(\d+)$/.exec(String((ws && ws['!ref']) || ''));
  if (!m) return { c: -1, r: 0 };
  return { c: m[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1, r: Number(m[2]) };
}
const celda = (ws, c, r) => (ws && ws[letraCol(c) + r]) || null;
const vacia = (x) => !x || x.v === null || x.v === undefined || String(x.v).trim() === '';
const textoDe = (x) => (vacia(x) ? '' : String(x.v).trim());
/* ¿Formato de fecha? Lleva «d» o «y» FUERA de los literales entre comillas y de los corchetes ([Red], [$-409]). Las
   comillas se quitan partiendo por ellas, no con una expresión regular: el monolito lleva la misma función y
   verificar-3copias lee una regex con comillas como una cadena abierta. */
const esFormatoFecha = (z) => /[dy]/i.test(String(z || '').split('"').filter((_, i) => i % 2 === 0).join('').replace(/\[[^\]]*\]/g, ''));
/** El día ISO de una celda con fecha, o '' si no lo es: un serial de Excel (con formato de fecha, o cualquiera si
 *  `seguro` dice que en esa posición sólo puede haber una fecha), un `Date`, o un texto «dd/mm/aaaa», «dd/mm/aa» o
 *  «aaaa-mm-dd». `f1904` es el sistema de fechas de 1904 del libro (Excel de Mac antiguo). */
export function diaDeCelda(x, f1904, seguro) {
  if (vacia(x)) return '';
  const v = x.v;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return diaReal(v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0'));
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 1 || !(esFormatoFecha(x.z) || seguro)) return '';
    const d = new Date((Math.floor(v) - (f1904 ? 24107 : 25569)) * 86400000);
    return diaReal(d.toISOString().slice(0, 10));
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return diaReal((m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? diaReal(m[1] + '-' + m[2] + '-' + m[3]) : '';
}
/* La sobrevivencia viene en FRACCIÓN con formato de % (0,95 → «95%»): ahí se multiplica. Un número sin formato de %
   se deja como vino —si es una fracción, el modelo lo avisa—, y un texto «95%» se lee como 95. */
function sobrevivenciaDe(x) {
  if (vacia(x)) return '';
  if (typeof x.v === 'number') return (/%/.test(String(x.z || '')) || /%\s*$/.test(String(x.w || ''))) ? Math.round(x.v * 10000) / 100 : x.v;
  const m = /^(-?\d+(?:[.,]\d+)?)\s*%$/.exec(String(x.v).trim());
  return m ? Number(m[1].replace(',', '.')) : String(x.v).trim();
}
/* «120.pl», «120 pl», «120 pl/g»: son postlarvas por gramo, no un peso. Es lo que traía la precría. */
const PLG_TEXTO = /^(\d+(?:[.,]\d+)?)\s*\.?\s*pl(?:\s*\/\s*g)?\.?$/i;

/** Lee UNA hoja: { esBroodstock, fechaCorte, piscinas, notas, errores, avisos }. `errores` impide subirla; `avisos`
 *  no. `esBroodstock` es false si la hoja no tiene la fila de cabecera: un libro puede traer otras hojas. */
export function leerHojaBroodstock(ws, opts) {
  const f1904 = !!(opts && opts.fecha1904);
  const errores = [], avisos = [], notas = [];
  const lim = limites(ws);
  let fc = 0;
  for (let r = 1; r <= Math.min(lim.r, 20) && !fc; r++) if (planoCab(textoDe(celda(ws, 0, r))) === 'piscina') fc = r;
  if (!fc) return { esBroodstock: false, fechaCorte: '', piscinas: [], notas, avisos, errores: ['No se encuentra la fila de cabecera («Piscina» en la columna A): no parece un Control Broodstock.'] };

  let fechaCorte = '';
  for (let r = 1; r < fc && !fechaCorte; r++) fechaCorte = diaDeCelda(celda(ws, 0, r), f1904, false);
  if (!fechaCorte) errores.push('No se encuentra la fecha de corte (una fecha en la columna A, encima de la cabecera; en la plantilla, la A3).');

  /* Las columnas, por su rótulo. */
  const pos = {}, desconocidas = [];
  const cabeceras = [];
  for (let c = 0; c <= lim.c; c++) {
    const h = planoCab(textoDe(celda(ws, c, fc)));
    if (!h) continue;
    cabeceras.push(c);
    const def = MAD_BS_CABECERAS.find((d) => d.es(h));
    if (!def) { desconocidas.push(letraCol(c) + ' («' + textoDe(celda(ws, c, fc)) + '»)'); continue; }
    if (pos[def.k] !== undefined) { errores.push('Hay dos columnas que parecen «' + def.k + '» (' + letraCol(pos[def.k]) + ' y ' + letraCol(c) + '): no se sabe cuál leer.'); continue; }
    pos[def.k] = c;
  }
  MAD_BS_CABECERAS.filter((d) => d.obligatoria && pos[d.k] === undefined)
    .forEach((d) => errores.push('Falta la columna «' + d.k + '» en la cabecera (fila ' + fc + '): no parece un Control Broodstock, o cambió la plantilla.'));
  if (desconocidas.length) avisos.push('Columnas que no se reconocen y NO se suben: ' + desconocidas.join(', ') + '.');
  if (pos.camaronera === undefined && !errores.length) {
    avisos.push('El archivo no trae la columna «Camaronera» (plantilla anterior al 17-sep): se toma del sufijo del origen cuando lo trae ('
      + Object.keys(MAD_BS_SUFIJO_CAMARONERA).map((s) => '«' + s + '» = ' + MAD_BS_SUFIJO_CAMARONERA[s]).join(', ') + '); si no, va vacía.');
  }
  if (errores.length) return { esBroodstock: true, fechaCorte, piscinas: [], notas, avisos, errores };

  /* El bloque de pesos y sus fechas. */
  const fin = cabeceras.find((c) => c > pos.pesos);
  const bloque = [];
  for (let c = pos.pesos; c < (fin === undefined ? lim.c + 1 : fin); c++) bloque.push(c);
  const fechas = bloque.map((c) => diaDeCelda(celda(ws, c, fc + 1), f1904, true));
  if (fechaCorte) {
    bloque.forEach((c, i) => {
      const esperada = new Date(Date.parse(fechaCorte + 'T00:00:00Z') - (bloque.length - 1 - i) * 7 * 86400000).toISOString().slice(0, 10);
      const ref = letraCol(c) + (fc + 1);
      if (!fechas[i]) avisos.push('La fecha de la columna de pesos ' + ref + ' no es una fecha válida: los pesos de esa semana van sin fecha.');
      else if (fechas[i] !== esperada) {
        avisos.push(i === bloque.length - 1
          ? 'La última columna de pesos (' + ref + ') dice ' + fechas[i] + ' y el corte es ' + fechaCorte + ': de ahí sale la fecha del peso de cada piscina. Revísala en la hoja.'
          : 'La columna de pesos ' + ref + ' dice ' + fechas[i] + ' y, contando semanas hacia atrás desde el corte, debería ser ' + esperada + '. Revísala en la hoja.');
      }
    });
  }

  /* Las notas se leen SÓLO dentro del ancho de la tabla (hasta su última cabecera). Medido en los libros de julio: a la
     derecha (AF…BP) hay bloques auxiliares de cálculo, y su texto se pegaba a la nota real y hasta pasaba por una. */
  const finTabla = cabeceras.length ? cabeceras[cabeceras.length - 1] : lim.c;
  const piscinas = [], crudas = [];
  for (let r = fc + 2; r <= lim.r; r++) {
    const x = (k) => (pos[k] === undefined ? null : celda(ws, pos[k], r));
    /* Una fila sin piscina no se sube. Si trae TEXTO es una nota del área («piscinas N y M fueron raleadas…»), que va
       a la Observación de las piscinas que nombre (ver abajo); un número suelto es el resto de una fórmula, no una nota.
       ⚠ «Sin piscina» incluye una columna A SIN NINGÚN DÍGITO: una fila «TOTAL» o «PROMEDIO» con sus sumas se
       subiría si no, como si fuera una piscina más. Las de julio traían además bloques auxiliares debajo («h», «m»). */
    if (vacia(x('piscina')) || !/\d/.test(textoDe(x('piscina')))) {
      const dice = [];
      for (let c = 0; c <= finTabla; c++) { const y = celda(ws, c, r); if (!vacia(y) && typeof y.v === 'string') dice.push(textoDe(y)); }
      if (dice.length) crudas.push({ fila: r, texto: dice.join(' · ') });
      continue;
    }
    const p = { piscina: textoDe(x('piscina')), fila: r };
    ['area', 'cantidad', 'dias1', 'dias2', 'dias3'].forEach((k) => { p[k] = vacia(x(k)) ? '' : x(k).v; });
    ['fase', 'piscinaOrigen', 'camaronera', 'codigo', 'observacion'].forEach((k) => { p[k] = textoDe(x(k)); });
    p.fechaSiembra = diaDeCelda(x('fechaSiembra'), f1904, true) || textoDe(x('fechaSiembra'));
    const ps = x('pesoSiembra');
    const plg = vacia(ps) || typeof ps.v === 'number' ? null : PLG_TEXTO.exec(String(ps.v).trim());
    if (plg) { p.pesoSiembra = ''; p.plg = Number(plg[1].replace(',', '.')); }
    else {
      p.pesoSiembra = vacia(ps) ? '' : ps.v;
      if (!vacia(ps) && num(ps.v) === '') avisos.push('La piscina ' + normPiscina(p.piscina) + ' trae en «Peso de siembra» «' + textoDe(ps) + '», que no es un peso ni unas Pl/g: se sube vacío.');
    }
    p.sobrevivencia = sobrevivenciaDe(x('sobrevivencia'));
    /* El último peso con su fecha, y el de la columna de justo antes para el incremento de una semana. */
    const pesos = bloque.map((c) => { const y = celda(ws, c, r); const n = vacia(y) ? '' : num(y.v); return n !== '' && n > 0 ? n : ''; });
    let u = pesos.length - 1;
    while (u >= 0 && pesos[u] === '') u--;
    p.peso = u >= 0 ? pesos[u] : '';
    p.fechaPeso = u >= 0 ? fechas[u] : '';
    p.pesoPrevio = u > 0 ? pesos[u - 1] : '';
    piscinas.push(p);
  }
  /* ── El origen con la camaronera PEGADA («902 ch», plantilla de julio): se separa (usuario, 2026-09-18) ──
     Con un sufijo de MAD_BS_SUFIJO_CAMARONERA se sube la piscina de origen (902) y la camaronera (Chongón). Una
     camaronera que ya venga en su columna NO se pisa (si no coincide, se avisa); un sufijo desconocido no se adivina. */
  const separadas = [], conLetras = [];
  piscinas.forEach((p) => {
    const m = /^(\d+)\s*([a-z]+)\.?$/i.exec(p.piscinaOrigen);
    const cam = m ? MAD_BS_SUFIJO_CAMARONERA[m[2].toLowerCase()] || '' : '';
    if (!cam) {
      if (/[a-z]/i.test(p.piscinaOrigen) && /\d/.test(p.piscinaOrigen)) conLetras.push(p);
      return;
    }
    const antes = p.piscinaOrigen;
    p.piscinaOrigen = m[1];
    if (!p.camaronera) p.camaronera = cam;
    else if (planoCab(p.camaronera) !== planoCab(cam)) {
      avisos.push('La piscina ' + normPiscina(p.piscina) + ' trae el origen «' + antes + '» (' + cam + ') y la columna «Camaronera» dice «' + p.camaronera + '»: se deja la de la columna.');
    }
    separadas.push(normPiscina(p.piscina) + ': ' + antes + ' → ' + m[1] + ' · ' + p.camaronera);
  });
  if (separadas.length) avisos.push(separadas.length + ' piscina(s) traían la camaronera pegada a la piscina de origen, y se separó (' + separadas.join(', ') + ').');
  if (conLetras.length) {
    avisos.push(conLetras.length + ' piscina(s) traen la piscina de origen con letras junto al número (' + conLetras.map((p) => normPiscina(p.piscina) + ': ' + p.piscinaOrigen).join(', ') + '): se sube tal cual.');
  }
  /* ── Las NOTAS bajo la tabla van a la Observación de SU piscina (usuario, 2026-09-18) ──
     Una nota que nombra piscinas de ESTA tabla se añade a la Observación de cada una, detrás de la que ya traiga y sin
     repetirla. Se casa por PALABRA entera —«815» no casa con «8150»— y sólo con piscinas de la tabla. Una piscina SIN
     datos productivos no se sube (la misma regla que la tabla), así que su nota tampoco: se dice. La nota que no va a
     ninguna piscina con datos queda en `notas`, que es lo que la ficha enseña como «no se sube». */
  const porId = new Map(piscinas.map((p) => [normPiscina(p.piscina), p]));
  crudas.forEach((n) => {
    const nombradas = [...new Set((n.texto.match(/[0-9a-z]+/gi) || []).map(normPiscina).filter((t) => porId.has(t)))];
    const con = nombradas.filter((id) => tieneDatos(porId.get(id)));
    const sin = nombradas.filter((id) => !tieneDatos(porId.get(id)));
    con.forEach((id) => {
      const p = porId.get(id);
      if (!p.observacion.includes(n.texto)) p.observacion = p.observacion ? p.observacion + ' · ' + n.texto : n.texto;
    });
    const cita = '«' + (n.texto.length > 60 ? n.texto.slice(0, 60) + '…' : n.texto) + '»';
    if (con.length) avisos.push('La nota de la fila ' + n.fila + ' ' + cita + ' va a la Observación de la(s) piscina(s) ' + con.join(', ') + '.');
    if (sin.length) avisos.push('La nota de la fila ' + n.fila + ' nombra la(s) piscina(s) ' + sin.join(', ') + ', sin datos esta semana: ahí no se sube.');
    if (!con.length) notas.push('Fila ' + n.fila + ': ' + n.texto);
  });
  return { esBroodstock: true, fechaCorte, piscinas, notas, avisos, errores };
}

/** Lee el LIBRO entero: una semana por hoja (el usuario va añadiendo hojas). Las hojas que no son de Broodstock
 *  se listan aparte, sin error: un libro puede traer otras. */
export function leerLibroBroodstock(wb) {
  const libro = wb || {};
  const f1904 = !!(libro.Workbook && libro.Workbook.WBProps && libro.Workbook.WBProps.date1904);
  const hojas = [], ignoradas = [];
  (libro.SheetNames || []).forEach((nombre) => {
    const l = leerHojaBroodstock((libro.Sheets || {})[nombre], { fecha1904: f1904 });
    if (l.esBroodstock) hojas.push(Object.assign({ nombre }, l));
    else ignoradas.push(nombre);
  });
  return { hojas, ignoradas };
}

/** Las fechas de corte que se repiten entre las hojas ELEGIDAS: subirlas juntas haría que la segunda pisara a la
 *  primera, piscina a piscina (la llave es fecha de corte · piscina). */
export function cortesRepetidos(hojas) {
  const vistos = new Set(), rep = new Set();
  (hojas || []).forEach((h) => { const f = diaReal((h || {}).fechaCorte); if (!f) return; if (vistos.has(f)) rep.add(f); vistos.add(f); });
  return [...rep].sort();
}
