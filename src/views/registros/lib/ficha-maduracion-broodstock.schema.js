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
   hace el reproductivo con el suyo.
   ⚠ Y lo que NO hay que concluir: para las otras dos los códigos no casan con los de la MATRIZ, y no es un
   error. El Excel es la foto de lo que hay AHORA en la piscina; aquellas reproductoras salieron de una
   cosecha anterior. El par (piscina, código) cambia con el tiempo, y por eso la foto semanal vale.

   ── DECISIONES DEL USUARIO (2026-09-17) ───────────────────────────────────────
   · Las PISCINAS son fijas del área; los CÓDIGOS GENÉTICOS varían cada tanto. Así que la llave es
     (fecha de corte · piscina): una fila por piscina y semana, y el histórico son las semanas.
   · Entra una columna nueva **Pl/g**, al lado de «Peso de siembra»: las postlarvas por gramo (ej. 130).
     Nace porque en el Excel esa cifra venía DENTRO del peso de siembra como texto («130.pl») en las
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

/* ⚠⚠ EXIGE QUE TODO EL TEXTO SEA EL NÚMERO, y no es quisquillosería: `parseFloat('130.pl')` devuelve
   **130**, y «130.pl» es literalmente lo que el archivo traía en el «Peso de siembra» de la precría. Con
   un parseo tolerante, esas postlarvas por gramo entrarían en la hoja como 130 GRAMOS de peso — que es
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
    observacion: sanitizeStr(x.observacion, 200),
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
