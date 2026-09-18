/* ============================================================
   REGISTROS · Maduración · "Registro reproductivo" — CAPA DE DATOS PURA
   Trazabilidad de hembras reproductoras por Trovan ID. Funciones PURAS (sin DOM
   ni store): reciben la matriz actual ya normalizada y devuelven los payloads de
   upsert para el sync del motor + un reporte de lo procesado/omitido.

   Arquitectura (decidida con el usuario, 2026-07-11):
   · MATRIZ  → estado ACTUAL por individuo (clave upsert = la CUATERNA Trovan · Piscina · Código genético · Lote).
   · BITÁCORA → 1 fila por evento desove/mortalidad (clave = Trovan+Fecha+Tipo → idempotente).
   · TRANSFERENCIAS → 1 fila por (TR-ID × Trovan) movido (clave = TR-ID+Trovan).
   El GAS fusiona por columna (celda vacía = conserva lo existente), así que un evento
   marca solo sus columnas sin borrar los campos permanentes de la matriz.
   ♻ El Trovan ID es del CHIP, no del individuo: desde el 2026-09-16 un individuo es su CUATERNA, y el mismo chip
   entra tantas veces como cuaternas distintas tenga, viva o muerta la anterior (ver buildAltaBatch y core/trovan.js).
   La regla del 09-14 —«sólo el chip de una hembra MUERTA, y con un ingreso posterior a su muerte»— se retiró con ella.
   Con DOS vivas en un chip, el evento y el traslado no eligen: elige el usuario (D17, R5).
   ============================================================ */
import { sanitizeStr } from './security.js';
import { normTrovan, fechaIso, vigenteDelChip, cadenaDelChip, individuoEnFecha, idsDeCadena, claveIndividuo } from '../../../core/trovan.js';

/* ── Esquema de las 3 hojas (cabecera EXACTA + claves de upsert) ── */
export const REPRO_MATRIZ_SHEET = 'Maduración MATRIZ';
export const REPRO_MATRIZ_HEADERS = [
  'Número', 'Trovan ID', 'Color anillo', 'Piscina', 'Código genético', 'Lote',
  'Sala actual', 'Tanque actual', 'Estado', 'Fecha muerte', 'Fecha ingreso', 'Observaciones',
];
/* Llave de upsert de la MATRIZ = la CUATERNA que identifica al individuo: Trovan ID (1), Piscina
   (3), Código genético (4) y Lote (5). Ver `claveIndividuo` en core/trovan.js.
   ⚠⚠ 2026-09-16 · ERA SÓLO `[1]`, el Trovan, y por eso hacía falta `llaveMatriz_` en el GAS: una
   máquina de sucesión por fechas y muertes que decidía a QUÉ fila de ese chip iba cada envío. Con
   la llave compuesta esa pregunta desaparece —cada individuo tiene su propia llave— y con ella se
   fueron sus dos rechazos («lo lleva una hembra VIVA», «tiene que ingresar DESPUÉS»).
   🔴 Y trae una obligación: TODO envío a la MATRIZ tiene que traer las cuatro columnas, o no casará
   con su fila y se añadirá una nueva. La mortalidad, que sólo conocía el Trovan, las copia ahora
   del registro que ya leyó (ver `buildEventBatch`). */
export const REPRO_MATRIZ_KEYCOLS = [1, 3, 4, 5];

export const REPRO_BITACORA_SHEET = 'Maduración Bitácora';
export const REPRO_BITACORA_HEADERS = ['Trovan ID', 'Fecha', 'Tipo', 'Sala', 'Tanque', 'Observaciones'];
export const REPRO_BITACORA_KEYCOLS = [0, 1, 2]; // Trovan + Fecha + Tipo

export const REPRO_TRANSFER_SHEET = 'Maduración Transferencias';
export const REPRO_TRANSFER_HEADERS = [
  'TR-ID', 'Fecha', 'Tipo', 'Trovan ID', 'Sala origen', 'Tanque origen', 'Sala destino', 'Tanque destino',
  'Mezcla', 'Lotes presentes', 'Códigos presentes', 'Piscinas presentes', 'Observaciones',
];
export const REPRO_TRANSFER_KEYCOLS = [0, 3]; // TR-ID + Trovan

/* ── Enumeraciones ── */
export const REPRO_ESTADO = { VIVO: 'Vivo', MUERTO: 'Muerto' };
export const REPRO_EVENTO = { DESOVE: 'Desove', MORTALIDAD: 'Mortalidad' };
export const REPRO_TRANSFER_TIPO = { TRASLADO: 'Traslado', MEZCLA: 'Mezcla' };

/* ── Normalización / parseo ── */
/** Normaliza un Trovan ID. Definición ÚNICA en `core/trovan.js`: la comparte la LECTURA
 *  (Maduración), y si las dos difieren el mismo tag produce dos claves y el cruce entre
 *  hojas se rompe en silencio. Se re-exporta para no cambiar la ruta de sus consumidores. */
export { normTrovan };

/** Formato canónico de un Trovan ID del lector: EXACTAMENTE 10 caracteres hexadecimales
 *  (0-9 A-F) en mayúsculas. Se valida sobre el id YA normalizado. Descarta los códigos que
 *  el lector/Excel corrompe al exportar: notación científica (8.21E+19), decimales o comas,
 *  texto, y números que perdieron los ceros a la izquierda (quedan con < 10 dígitos). */
export const TROVAN_RE = /^[0-9A-F]{10}$/;
export function isValidTrovan(id) { return TROVAN_RE.test(String(id == null ? '' : id)); }

/** Parsea el bloque de texto pegado por el usuario (uno por línea, o separados por
 *  coma/punto y coma/espacios). Deduplica preservando el orden y reporta duplicados. */
export function parseTrovanList(text) {
  const seen = new Set(); const ids = []; const duplicates = [];
  String(text == null ? '' : text).split(/[\s,;]+/).forEach((tok) => {
    const id = normTrovan(tok);
    if (!id) return;
    if (seen.has(id)) { duplicates.push(id); return; }
    seen.add(id); ids.push(id);
  });
  return { ids, duplicates };
}

/* ── Índice de la matriz (para lookups O(1)) ── */
/** Adapta una fila cruda de la hoja MATRIZ (objeto con cabeceras) al registro normalizado. */
export function matrixRecordFromSheet(o) {
  o = o || {};
  return {
    numero: o['Número'], trovan: normTrovan(o['Trovan ID']),
    color: o['Color anillo'], piscina: o['Piscina'], codigo: o['Código genético'], lote: o['Lote'],
    sala: o['Sala actual'], tanque: o['Tanque actual'], estado: o['Estado'],
    fechaMuerte: o['Fecha muerte'], fechaIngreso: o['Fecha ingreso'],
  };
}
const esMuerto = (estado) => String(estado == null ? '' : estado).trim() === REPRO_ESTADO.MUERTO;
/** «Fila de chip» (core/trovan.js) de un registro normalizado de la MATRIZ. */
const filaDeChip = (rec, pos) => ({
  rec, pos, ingreso: fechaIso(rec.fechaIngreso), muerte: fechaIso(rec.fechaMuerte), muerto: esMuerto(rec.estado),
  /* `ind` = la cuaterna que IDENTIFICA al individuo (2026-09-16). Sin ella `cadenaDelChip` no puede
     distinguir «dos hembras distintas del mismo chip» de «la misma fila repetida». */
  ind: claveIndividuo(rec.trovan, rec.piscina, rec.codigo, rec.lote),
});
/** Filas de chip agrupadas por Trovan, en el orden de la hoja. */
function filasPorChip(records) {
  const grupos = new Map();
  (records || []).forEach((r, pos) => {
    const id = normTrovan(r && r.trovan);
    if (!id) return;
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(filaDeChip(r, pos));
  });
  return grupos;
}
/** Registro de la hembra VIGENTE de un chip, más dos datos del chip entero: cuántas hembras ha
 *  llevado (`individuos`) y cuántas están VIVAS ahora mismo (`vivos`).
 *
 *  🗑 2026-09-17 · AQUÍ HABÍA UN TERCERO, `fechaLimite` (la última fecha de ingreso o de muerte del
 *  chip). Lo usaba la regla de sucesión —un alta tenía que ingresar DESPUÉS de esa fecha— y esa regla
 *  se retiró el 09-16 con la cuaterna, pero el campo se quedó: se calculaba, tenía prueba propia y no
 *  lo leía NADIE. Y era además vacuo en producción, porque se deriva de `Fecha ingreso` y `Fecha
 *  muerte`, que la lectura no pide (cuestan 10×). Un campo con prueba que nadie usa invita a usarlo
 *  creyendo que significa algo vigente, así que se va entero.
 *
 *  🔑 `vivos` es de D17 (2026-09-17). Un evento de la Bitácora sólo trae el Trovan, así que si un chip
 *  llevara DOS hembras vivas a la vez —posible desde que la identidad es la cuaterna— habría que elegir
 *  una, y esa elección es una convención, no un hecho. Peor: la lectura NO pide las columnas de fecha
 *  (cuestan 10×, ver `_REPRO_MATRIZ_COLS`), así que el desempate «la de ingreso más reciente» de
 *  `vigenteDelChip` no tiene con qué desempatar y cae en «la de más abajo en la hoja». Una mortalidad
 *  mal atribuida marcaría «Muerto» en la fila equivocada. Por eso `buildEventBatch` NO elige: rechaza
 *  y lo dice —y desde R5 (2026-09-18), `buildTransferBatch` igual, y los dos registran a la que elija el
 *  USUARIO entre las `opciones`—. Medido el 2026-09-17 en producción: 1665 filas, 1665 chips, ninguno con
 *  más de una. */
function registroVigente(filas) {
  const r = Object.assign({}, vigenteDelChip(filas).rec, {
    individuos: filas.length,
    vivos: filas.filter((f) => !f.muerto).length,
  });
  /* R5 (2026-09-18) · con DOS o más vivas, el registro trae las `opciones`: una por hembra viva, con la cuaterna que
     la identifica (`ind`) y lo que el técnico necesita para reconocerla. Son las que se le ofrecen para ELEGIR de
     cuál es un evento o un traslado: el sistema sigue sin elegir (D17), pero ya no deja el chip sin salida. */
  if (r.vivos > 1) {
    r.opciones = filas.filter((f) => !f.muerto).map((f) => ({ ind: f.ind, piscina: f.rec.piscina, codigo: f.rec.codigo,
      lote: f.rec.lote, sala: f.rec.sala, tanque: f.rec.tanque }));
  }
  return r;
}
/** Índice Trovan → registro de la hembra VIGENTE de cada chip (ver `registroVigente`). Hasta el
 *  2026-09-14 ganaba la 1.ª aparición: con un chip reciclado ésa es la hembra MUERTA, y los desoves
 *  de la nueva habrían salido «ya muerta». */
export function buildMatrixIndex(records) {
  const m = new Map();
  filasPorChip(records).forEach((filas, id) => m.set(id, registroVigente(filas)));
  /* 🔑 2026-09-16 · el MISMO índice responde a DOS preguntas distintas, y conviene no confundirlas:
       · `get(chip)`      → la hembra VIGENTE de ese chip. La usan los EVENTOS (desove, mortalidad),
                            que sólo traen el Trovan y no saben de qué individuo son.
       · `get(cuaterna)`  → ESE individuo exacto. La usa el ALTA, que sí conoce piscina, código y
                            lote y necesita saber si ya existe.
     Van en un solo Map a propósito: dos estructuras separadas habrían obligado a cambiar la firma
     de todos los llamadores. No pueden chocar porque la cuaterna lleva separadores de control
     (), que `normTrovan` no deja pasar en un chip. */
  (records || []).forEach((r) => {
    const rec = r || {};
    const chip = normTrovan(rec.trovan);
    if (!chip) return;
    m.set(claveIndividuo(chip, rec.piscina, rec.codigo, rec.lote), rec);
  });
  return m;
}
/** ¿El día ISO `dia` es anterior al ingreso de la hembra vigente de un chip RECICLADO? Entonces el
 *  evento es de una hembra anterior. Sólo con varias hembras en el chip: con una no hay de quién
 *  más pueda ser.
 *
 *  ⚠⚠ 2026-09-17 · AQUÍ PONÍA «sin fechas en la lectura no se sabe y se deja pasar (EL GAS FRENA LA
 *  MORTALIDAD)», y esa red YA NO EXISTE: se fue con `llaveMatriz_` el 09-16 al pasar la identidad a la
 *  cuaterna, y el propio `Code.gs` lo deja dicho donde estaba. Lo que queda sin fechas es que el evento
 *  se apunta a la vigente SIN nada detrás, así que ahora al menos SE DICE (ver `ingresoNoComprobable`).
 *
 *  🔑 DE DÓNDE SALEN LAS FECHAS, que decide si esto puede funcionar:
 *  · repo / Pages → la MATRIZ sale del STORE del tablero (el libro entero) y trae todas las columnas;
 *  · `index (8)` → NO tiene store, así que siempre cae a la lectura del GAS, que no pide las de FECHA
 *    porque cuestan 10× (ver `_REPRO_MATRIZ_COLS`). Allí esta comprobación no puede hacerse.
 *  Es una asimetría real entre los dos destinos, no un descuido: la lectura barata es la que permite
 *  trabajar en campo. */
function antesDeSuIngreso(rec, dia) {
  const ingreso = fechaIso(rec && rec.fechaIngreso);
  return !!(rec && rec.individuos > 1 && dia && ingreso && dia < ingreso);
}
/** El chip ha llevado VARIAS hembras y la lectura no trae su fecha de ingreso: la comprobación de
 *  arriba no puede hacerse, y el evento se apuntará a la vigente sin que nadie pueda saber si era de
 *  una anterior. No se rechaza —la inmensa mayoría de los eventos son del día y van a la vigente, que
 *  es lo correcto—, pero se avisa: callarlo es lo que convertía esto en un fallo invisible. */
function ingresoNoComprobable(rec) {
  return !!(rec && rec.individuos > 1 && !fechaIso(rec.fechaIngreso));
}
/** R5 (2026-09-18) · La hembra que el USUARIO eligió para `chip`, si la elección nombra por su CUATERNA a una VIVA de
 *  ESE chip; si no, null. Validarla aquí es lo que impide que una elección vieja, de otro chip o de una hembra ya
 *  muerta acabe apuntando el evento a quien no es. Un Trovan a secas no vale como elección: sería volver a elegir
 *  «la vigente», que es justo lo que D17 prohíbe. */
function elegidaDelChip(matrixIndex, eleccion, chip) {
  const clave = eleccion && Object.prototype.hasOwnProperty.call(eleccion, chip) ? String(eleccion[chip]) : '';
  const r = clave ? matrixIndex.get(clave) : null;
  if (!r || normTrovan(r.trovan) !== chip || esMuerto(r.estado)) return null;
  return claveIndividuo(r.trovan, r.piscina, r.codigo, r.lote) === clave ? r : null;
}

/* ── Utilidades internas ── */
// Arma una fila (array del ancho de la hoja) desde un objeto con claves = cabecera.
function rowFromObj(headers, obj) {
  return headers.map((h) => { const v = obj[h]; return v == null ? '' : v; });
}
/** Payload de sync con la forma que consume el motor (upsert por keyCols en el GAS). */
export function syncPayload(sheetName, headers, keyCols, rows) {
  return { sheetName, headers, rows, keyCols };
}

/* ── Sección 1 · Alta de individuo (masiva, tipo grilla Excel) ── */
/** Alta MASIVA: recibe un array de formularios (filas de la grilla, tipo Excel) y arma UN
 *  payload de MATRIZ con todas las hembras nuevas (Estado=Vivo, ubicación=ingreso).
 *  Omite filas vacías; reporta filas con datos pero sin Trovan (sinTrovan), Trovan repetidos
 *  dentro del lote (duplicados) y —si hay matriz— los que ya existen (existentes).
 *
 *  🔑 UN CHIP, VARIOS INDIVIDUOS (decisión del usuario, 2026-09-16). Lo que identifica a una hembra
 *  es la CUATERNA (Trovan · Piscina · Código genético · Lote), así que **el mismo Trovan se puede
 *  dar de alta tantas veces como haga falta mientras esas tres no se repitan a la vez**. Sólo hay
 *  un motivo de rechazo: que esa cuaterna YA exista (en la hoja → `existentes`; dentro del propio
 *  lote → `duplicados`). `reciclados` cuenta las altas cuyo chip ya tenía otro individuo: es
 *  INFORMACIÓN para que el técnico vea que está reutilizando un código, no un freno.
 *
 *  ⚠⚠ ESTO RECHAZABA ALTAS BUENAS, y es el defecto que vino a corregir. Del 09-14 al 09-16 exigía
 *  que la anterior estuviera MUERTA (`existentes`), que el ingreso fuera POSTERIOR a su muerte
 *  (`reciclajeFecha`) y que el GAS anunciara saber reciclar (`reciclajeSinGas`, que en pantalla
 *  decía «actualiza el GAS»). Los tres motivos se retiraron con la regla que los sostenía; el
 *  parámetro `opts.reciclaje` ya no se mira. */
export function buildAltaBatch(forms, matrixIndex, opts) {
  void opts;                                       // `reciclaje` se retiró: ver la cabecera
  /* R5 (2026-09-18) · `recicladosVivos`: el chip ya lo lleva una hembra VIVA (en la hoja o en este mismo lote). Entra
     igual —la identidad es la cuaterna—, pero desde ese momento cada evento o traslado de ese chip pedirá ELEGIR de
     cuál es (D17), y el técnico tiene que saberlo AHORA, no el día que registre un desove. */
  const report = { created: [], sinTrovan: 0, duplicados: [], existentes: [], invalidFormat: [], reciclados: [], recicladosVivos: [] };
  const seen = new Set(); const rows = []; const chipsDelLote = new Set();
  const OTHER = ['numero', 'color', 'piscina', 'codigo', 'lote', 'sala', 'tanque'];
  (forms || []).forEach((form) => {
    form = form || {};
    const trovan = normTrovan(form.trovan);
    const hasData = trovan || OTHER.some((k) => String(form[k] == null ? '' : form[k]).trim());
    if (!hasData) return;                          // fila totalmente vacía → se ignora
    if (!trovan) { report.sinTrovan++; return; }   // tiene datos pero le falta el Trovan
    if (!isValidTrovan(trovan)) { report.invalidFormat.push(trovan); return; } // formato corrupto → NO se registra, señalado
    /* 🔑 Lo que decide si un alta vale es la CUATERNA, no el chip: el mismo Trovan puede entrar
       tantas veces como haga falta mientras piscina, código genético y lote no se repitan los
       tres a la vez. Ni el estado de la anterior ni las fechas entran ya en la decisión. */
    const clave = claveIndividuo(trovan, form.piscina, form.codigo, form.lote);
    if (seen.has(clave)) { report.duplicados.push(trovan); return; }   // repetido DENTRO del lote
    if (matrixIndex && matrixIndex.get(clave)) { report.existentes.push(trovan); return; } // ya en la hoja
    /* Informativo, no un freno: el chip ya tenía otro individuo. Se cuenta para que el técnico vea
       que está reutilizando un código y confirme que es lo que quería. */
    const previo = matrixIndex ? matrixIndex.get(trovan) : null;
    seen.add(clave);
    rows.push(rowFromObj(REPRO_MATRIZ_HEADERS, {
      'Número': sanitizeStr(form.numero),
      'Trovan ID': trovan,
      'Color anillo': sanitizeStr(form.color),
      'Piscina': sanitizeStr(form.piscina),
      'Código genético': sanitizeStr(form.codigo),
      'Lote': sanitizeStr(form.lote),
      'Sala actual': sanitizeStr(form.sala),
      'Tanque actual': sanitizeStr(form.tanque),
      'Estado': REPRO_ESTADO.VIVO,
      'Fecha ingreso': sanitizeStr(form.fecha),
      'Observaciones': sanitizeStr(form.obs),
    }));
    report.created.push(trovan);
    if (previo) report.reciclados.push(trovan);
    if ((previo && previo.vivos > 0) || chipsDelLote.has(trovan)) report.recicladosVivos.push(trovan);
    chipsDelLote.add(trovan);
  });
  return { report, payload: rows.length ? syncPayload(REPRO_MATRIZ_SHEET, REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, rows) : null };
}

/* ── Sección 2 · Desoves / Mortalidades ── */
/** Procesa un lote de Trovan para un evento (desove|mortalidad) en una fecha. Añade a la
 *  BITÁCORA (con la ubicación tomada de la MATRIZ) y, en mortalidad, marca Estado/Fecha
 *  muerte en la MATRIZ.
 *
 *  `matrixIndex` es OBLIGATORIO: el usuario solo teclea Trovan ID, así que la Sala y el
 *  Tanque de la Bitácora SALEN de la MATRIZ. Sin ella no se puede completar la fila, de
 *  modo que se rechaza el lote entero en vez de escribir eventos con ubicación en blanco.
 *  Se omite y reporta cada código que: tenga formato corrupto (`invalidFormat`), no exista
 *  en la MATRIZ (`notFound`), exista pero sin Sala o Tanque (`sinUbicacion`), lleve DOS hembras
 *  vivas a la vez y el usuario no haya elegido de cuál es el evento (`variasVivas`, D17; con `eleccion`
 *  válida entra a la elegida y se anota en `elegidas`, R5), o sea un desove de una hembra ya muerta
 *  (`alreadyDead`).
 *  ♻ Y de un chip reciclado, el evento anterior al ingreso de la hembra que lo lleva hoy
 *  (`antesDelIngreso`): es de una hembra anterior, y aquí se le pondría la ubicación de la nueva o,
 *  en mortalidad, se mataría a la nueva. */
export function buildEventBatch({ ids, fecha, tipo, matrixIndex, eleccion } = {}) {
  const report = { total: 0, processed: [], notFound: [], alreadyDead: [], invalidFormat: [], sinUbicacion: [], antesDelIngreso: [], variasVivas: [], sinFechaIngreso: [], elegidas: [] };
  const okTipo = (tipo === REPRO_EVENTO.DESOVE || tipo === REPRO_EVENTO.MORTALIDAD);
  if (!fecha) return { report, bitacora: null, matriz: null, error: 'Falta la fecha.' };
  if (!okTipo) return { report, bitacora: null, matriz: null, error: 'Tipo de evento inválido.' };
  if (!matrixIndex || typeof matrixIndex.get !== 'function') {
    return { report, bitacora: null, matriz: null, error: 'No se pudo leer la hoja "Maduración MATRIZ": sin ella no se puede completar la Sala y el Tanque de la Bitácora. Carga los datos y reintenta.' };
  }
  const fx = sanitizeStr(fecha), dia = fechaIso(fecha);
  const bitRows = []; const matRows = [];
  (ids || []).forEach((raw) => {
    const id = normTrovan(raw); if (!id) return;
    report.total++;
    if (!isValidTrovan(id)) { report.invalidFormat.push(id); return; } // formato corrupto → NO se registra, señalado
    let rec = matrixIndex.get(id);
    if (!rec) { report.notFound.push(id); return; }
    /* 🔴 D17 (2026-09-17) · DOS HEMBRAS VIVAS EN EL MISMO CHIP: EL SISTEMA NO ELIGE. Un evento sólo trae el Trovan y
       la Bitácora no guarda más, así que apuntarlo a una de las dos sería una convención —y sin las columnas de fecha,
       que no se leen, ni siquiera una razonable: sería «la de más abajo en la hoja»—. Una mortalidad así marcaría
       «Muerto» a la hembra equivocada, que es un daño que nadie ve. Ver `registroVigente`.
       R5 (2026-09-18) · pero tampoco se deja el chip SIN SALIDA: si el usuario eligió de cuál es (`eleccion`, por su
       cuaterna), se registra a ésa; si no, se rechaza como antes y se le ofrece elegir. Va ANTES de mirar el ingreso,
       porque con dos vivas «anterior al ingreso» sólo significa algo de la hembra que se ha elegido. */
    if (rec.vivos > 1) {
      const elegida = elegidaDelChip(matrixIndex, eleccion, id);
      if (!elegida) { report.variasVivas.push(id); return; }
      rec = Object.assign({}, elegida, { individuos: rec.individuos, vivos: rec.vivos });
      report.elegidas.push(id);
    }
    if (antesDeSuIngreso(rec, dia)) { report.antesDelIngreso.push(id); return; } // de una hembra anterior del chip
    /* No rechaza: sólo deja constancia de que la comprobación de «¿es de una hembra anterior?» no se pudo
       hacer con esta lectura. Va DESPUÉS de los rechazos, porque de un código rechazado no hay nada que
       avisar, y ANTES de registrar, porque se avisa del que SÍ se registra. */
    if (ingresoNoComprobable(rec)) report.sinFechaIngreso.push(id);
    // La Bitácora exige Sala y Tanque, y su única fuente es la MATRIZ: si el individuo no
    // los tiene allí, registrar el evento dejaría la fila incompleta → se rechaza.
    const sala = sanitizeStr(rec.sala), tanque = sanitizeStr(rec.tanque);
    if (!sala || !tanque) { report.sinUbicacion.push(id); return; }
    const dead = rec.estado === REPRO_ESTADO.MUERTO;
    if (tipo === REPRO_EVENTO.DESOVE && dead) { report.alreadyDead.push(id); return; } // muerta no desova
    bitRows.push(rowFromObj(REPRO_BITACORA_HEADERS, {
      'Trovan ID': id, 'Fecha': fx, 'Tipo': tipo, 'Sala': sala, 'Tanque': tanque,
    }));
    if (tipo === REPRO_EVENTO.MORTALIDAD) {
      if (dead) report.alreadyDead.push(id); // informativo; el re-registro es idempotente
      /* 🔴 Las tres columnas de identidad viajan AUNQUE no se editen. Desde que la llave de la
         MATRIZ es la cuaterna (2026-09-16), una fila de mortalidad con la piscina, el código y el
         lote en blanco no casaría con ninguna: en vez de marcar muerta a la hembra, el upsert
         AÑADIRÍA una fila suelta con un Trovan y una fecha de muerte. Salen del registro que ya se
         leyó de la hoja, así que no se inventa nada. */
      matRows.push(rowFromObj(REPRO_MATRIZ_HEADERS, {
        'Trovan ID': id,
        'Piscina': sanitizeStr(rec.piscina), 'Código genético': sanitizeStr(rec.codigo), 'Lote': sanitizeStr(rec.lote),
        'Estado': REPRO_ESTADO.MUERTO, 'Fecha muerte': fx,
      }));
    }
    report.processed.push(id);
  });
  return {
    report,
    bitacora: bitRows.length ? syncPayload(REPRO_BITACORA_SHEET, REPRO_BITACORA_HEADERS, REPRO_BITACORA_KEYCOLS, bitRows) : null,
    matriz: matRows.length ? syncPayload(REPRO_MATRIZ_SHEET, REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, matRows) : null,
  };
}

/* ── Sección 3 · Transferencias ── */
/** Siguiente ID de movimiento a partir de los TR-ID existentes (máx + 1 → TR-000NNN). */
export function nextTrId(existingIds) {
  let max = 0;
  (existingIds || []).forEach((s) => { const m = /TR-(\d+)/i.exec(String(s == null ? '' : s)); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return 'TR-' + String(max + 1).padStart(6, '0');
}

/** Procesa una transferencia por UBICACIÓN actual: por cada destino (con su lista de Trovan)
 *  reubica en la MATRIZ (Sala/Tanque actual) y escribe una fila en TRANSFERENCIAS (ledger por
 *  TR-ID×Trovan). En mezcla, guarda la composición del destino.
 *  `matrixIndex` es OBLIGATORIO desde RD1 (2026-09-16): verifica que cada individuo exista
 *  (notFound) y esté en el origen declarado (wrongLocation), omitiendo los que no, y —sobre todo—
 *  es la ÚNICA fuente de la cuaterna que identifica a cada individuo. Sin él no se arma nada.
 *  ♻ Con matriz, un traslado anterior al ingreso de la hembra que lleva hoy un chip reciclado se
 *  omite (`antesDelIngreso`): movería a la nueva por un traslado de otra. */
export function buildTransferBatch({ fecha, tipo, origen, destinos, composicion, matrixIndex, trId, eleccion } = {}) {
  /* R5 (2026-09-18) · `variasVivas` y `elegidas` como en el evento: ver el bloque de D17 más abajo. */
  const report = { variasVivas: [], elegidas: [], moved: [], notFound: [], wrongLocation: [], invalidFormat: [], antesDelIngreso: [] };
  if (!fecha) return { report, matriz: null, transfer: null, error: 'Falta la fecha.' };
  /* 🔴 RD1 (2026-09-16) · SIN LA MATRIZ NO SE ARMA NADA. Antes se movía «sin validar» con índice nulo:
     era un modo degradado inofensivo mientras la llave de la MATRIZ era sólo el Trovan. Desde que es la
     CUATERNA (Trovan · Piscina · Código genético · Lote) ya no degrada sino que DAÑA: la piscina, el
     código y el lote salen de `rec`, o sea de la propia MATRIZ, así que sin ella viajarían en blanco, la
     fila no casaría con la suya y el upsert AÑADIRÍA una fila suelta dejando a la hembra sin mover. */
  if (!matrixIndex || typeof matrixIndex.get !== 'function') {
    return { report, matriz: null, transfer: null, error: 'No se pudo leer la hoja "Maduración MATRIZ": sin ella no se sabe qué individuo es cada Trovan y el traslado no se puede registrar. Carga los datos y reintenta.' };
  }
  const fx = sanitizeStr(fecha), dia = fechaIso(fecha);
  const org = { sala: sanitizeStr(origen && origen.sala), tanque: sanitizeStr(origen && origen.tanque) };
  const comp = composicion || {};
  const mezcla = tipo === REPRO_TRANSFER_TIPO.MEZCLA;
  const tp = mezcla ? REPRO_TRANSFER_TIPO.MEZCLA : REPRO_TRANSFER_TIPO.TRASLADO;
  const matRows = []; const trRows = [];
  (destinos || []).forEach((dest) => {
    dest = dest || {};
    const dSala = sanitizeStr(dest.sala), dTanque = sanitizeStr(dest.tanque);
    (dest.ids || []).forEach((raw) => {
      const id = normTrovan(raw); if (!id) return;
      if (!isValidTrovan(id)) { report.invalidFormat.push(id); return; } // formato corrupto → NO se transfiere, señalado
      let rec = matrixIndex ? matrixIndex.get(id) : null;
      if (matrixIndex && !rec) { report.notFound.push(id); return; } // solo valida si hay matriz
      /* 🔴 R5 (2026-09-18) · D17 TAMBIÉN EN EL TRASLADO. Hasta hoy sólo lo miraba el evento, y un traslado de un chip
         con dos vivas movía a «la vigente» —en index (8), la de más abajo en la hoja— y escribía su fila de la MATRIZ
         y de Transferencias como si fuera la buena. Igual que en el evento: se mueve la que elija el usuario, o no se
         mueve ninguna y se le ofrece elegir. La ubicación de origen se comprueba después, sobre la elegida. */
      if (rec && rec.vivos > 1) {
        const elegida = elegidaDelChip(matrixIndex, eleccion, id);
        if (!elegida) { report.variasVivas.push(id); return; }
        rec = Object.assign({}, elegida, { individuos: rec.individuos, vivos: rec.vivos });
        report.elegidas.push(id);
      }
      if (matrixIndex && antesDeSuIngreso(rec, dia)) { report.antesDelIngreso.push(id); return; } // de una hembra anterior del chip
      if (matrixIndex && rec && ((org.sala && String(rec.sala) !== org.sala) || (org.tanque && String(rec.tanque) !== org.tanque))) {
        report.wrongLocation.push(id); return; // no está en el origen declarado → se omite
      }
      /* 🔴 Igual que en la mortalidad: desde que la llave de la MATRIZ es la cuaterna, la piscina,
         el código y el lote tienen que VIAJAR aunque la transferencia no los toque, o la fila no
         casa con la suya y el upsert añade una nueva. Salen de `rec`, que ya se leyó de la hoja.
         ⚠ Por eso RD1 exige `matrixIndex` arriba: es lo que garantiza que `rec` pueda existir. Los
         `matrixIndex &&` de estas líneas ya no pueden ser falsos; se dejan por no tocar lo que no falla. */
      matRows.push(rowFromObj(REPRO_MATRIZ_HEADERS, {
        'Trovan ID': id,
        'Piscina': sanitizeStr(rec && rec.piscina), 'Código genético': sanitizeStr(rec && rec.codigo), 'Lote': sanitizeStr(rec && rec.lote),
        'Sala actual': dSala, 'Tanque actual': dTanque,
      }));
      trRows.push(rowFromObj(REPRO_TRANSFER_HEADERS, {
        'TR-ID': trId, 'Fecha': fx, 'Tipo': tp, 'Trovan ID': id,
        'Sala origen': org.sala, 'Tanque origen': org.tanque,
        'Sala destino': dSala, 'Tanque destino': dTanque,
        'Mezcla': mezcla ? 'Sí' : 'No',
        'Lotes presentes': mezcla ? sanitizeStr(comp.lotes) : '',
        'Códigos presentes': mezcla ? sanitizeStr(comp.codigos) : '',
        'Piscinas presentes': mezcla ? sanitizeStr(comp.piscinas) : '',
        'Observaciones': sanitizeStr(comp.obs),
      }));
      report.moved.push(id);
    });
  });
  return {
    report, trId,
    matriz: matRows.length ? syncPayload(REPRO_MATRIZ_SHEET, REPRO_MATRIZ_HEADERS, REPRO_MATRIZ_KEYCOLS, matRows) : null,
    transfer: trRows.length ? syncPayload(REPRO_TRANSFER_SHEET, REPRO_TRANSFER_HEADERS, REPRO_TRANSFER_KEYCOLS, trRows) : null,
  };
}

/* ── Tanda 5 · Consulta / reportes (operan sobre filas leídas del Sheet: objetos con
   claves de cabecera, tal como los entrega el store del dashboard o una lectura GAS) ── */

/** Índice de matriz (Trovan → registro normalizado) desde filas crudas de la hoja MATRIZ. */
export function matrixIndexFromRows(rows) {
  return buildMatrixIndex((rows || []).map(matrixRecordFromSheet));
}

/** (chip, día ISO) → nombre de la hembra que llevaba el chip ese día (core/trovan.js: la vigente
 *  se llama como el chip; las anteriores, chip·fecha de ingreso). Sólo los chips con varias
 *  hembras que se suceden y con fechas; el resto se llama como su chip. */
function nombradorDeHembras(matrixRows) {
  const cadenas = new Map();
  filasPorChip((matrixRows || []).map(matrixRecordFromSheet)).forEach((filas, chip) => {
    if (filas.length < 2) return;
    const cadena = cadenaDelChip(filas).cadena;
    if (cadena.length < 2) return;
    const ids = idsDeCadena(chip, cadena);
    cadenas.set(chip, cadena.map((f, k) => Object.assign({}, f, { id: ids[k] })));
  });
  return (chip, dia) => { const c = cadenas.get(chip); return c ? individuoEnFecha(c, dia).id : chip; };
}

/** Pivota la BITÁCORA a la matriz ancha de DESOVES: filas = Trovan, columnas = fechas,
 *  celda = 1 si desovó ese día (solo Tipo='Desove'). Fechas asc, Trovan asc.
 *  Las fechas van en ISO: el store del tablero las trae dd/mm/yyyy y, en texto, «01/08» se
 *  ordenaba delante de «20/06» (2026-09-14; lo que no es fecha se queda como venía).
 *  ♻ Con `matrixRows`, un chip reciclado da UNA FILA POR HEMBRA: cada desove es de la que había
 *  ingresado en su fecha. Sin la MATRIZ, o sin sus fechas, sale una fila por chip. */
export function pivotDesoves(bitacoraRows, matrixRows) {
  const nombre = matrixRows ? nombradorDeHembras(matrixRows) : null;
  const dateSet = new Set(); const byTrovan = new Map();
  (bitacoraRows || []).forEach((r) => {
    if (String(r['Tipo']) !== REPRO_EVENTO.DESOVE) return;
    const chip = normTrovan(r['Trovan ID']); const raw = sanitizeStr(r['Fecha']);
    if (!chip || !raw) return;
    const f = fechaIso(raw) || raw;
    const id = nombre ? nombre(chip, fechaIso(raw)) : chip;
    dateSet.add(f);
    if (!byTrovan.has(id)) byTrovan.set(id, new Set());
    byTrovan.get(id).add(f);
  });
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const dates = [...dateSet].sort(cmp);
  const rows = [...byTrovan.entries()].sort((a, b) => cmp(a[0], b[0])).map(([trovan, set]) => ({
    trovan, total: set.size,
    byDate: dates.reduce((o, d) => { o[d] = set.has(d) ? 1 : ''; return o; }, {}),
  }));
  return { dates, rows };
}

/** Historial de movimientos de un Trovan desde el ledger de TRANSFERENCIAS (orden por
 *  TR-ID) + ubicación actual (último destino registrado). */
export function individualTrace(transferRows, trovan) {
  const id = normTrovan(trovan);
  const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  const movimientos = (transferRows || []).filter((r) => normTrovan(r['Trovan ID']) === id).map((r) => ({
    trId: r['TR-ID'], fecha: r['Fecha'], tipo: r['Tipo'],
    salaOrigen: r['Sala origen'], tanqueOrigen: r['Tanque origen'],
    salaDestino: r['Sala destino'], tanqueDestino: r['Tanque destino'], mezcla: r['Mezcla'],
  })).sort((a, b) => cmp(a.trId, b.trId));
  const last = movimientos.length ? movimientos[movimientos.length - 1] : null;
  const current = last ? { sala: last.salaDestino, tanque: last.tanqueDestino } : null;
  return { trovan: id, movimientos, current };
}

/** Trazabilidad de un chip para la Consulta: la hembra que lo lleva hoy (`rec`, la vigente del
 *  índice), sus desoves y sus movimientos.
 *  ♻ Con el chip reciclado sólo son suyos los de su ingreso en adelante (`desde`), y las hembras
 *  anteriores van en `anteriores`. Si la lectura no trae las fechas de ingreso no se puede partir:
 *  `sinFechas` lo dice y se muestra todo lo del chip. */
export function trazaDelChip(matrixRows, bitacoraRows, transferRows, trovan) {
  const id = normTrovan(trovan);
  const filas = [];
  (matrixRows || []).forEach((o, pos) => { const r = matrixRecordFromSheet(o); if (r.trovan && r.trovan === id) filas.push(filaDeChip(r, pos)); });
  const reciclado = filas.length > 1;
  const vig = filas.length ? vigenteDelChip(filas) : null;
  const desde = reciclado ? vig.ingreso : '';
  const enSuVida = (f) => !desde || fechaIso(f) >= desde;
  const desoves = (bitacoraRows || [])
    .filter((r) => normTrovan(r['Trovan ID']) === id && String(r['Tipo']) === REPRO_EVENTO.DESOVE && enSuVida(r['Fecha']))
    .map((r) => r['Fecha']);
  const movimientos = individualTrace(transferRows, id).movimientos.filter((mv) => enSuVida(mv.fecha));
  const last = movimientos.length ? movimientos[movimientos.length - 1] : null;
  const anteriores = filas.filter((f) => f !== vig)
    .sort((a, b) => (a.ingreso < b.ingreso ? -1 : a.ingreso > b.ingreso ? 1 : a.pos - b.pos))
    .map((f) => ({ ingreso: f.ingreso, muerte: f.muerte, estado: f.rec.estado, lote: f.rec.lote, codigo: f.rec.codigo, sala: f.rec.sala, tanque: f.rec.tanque }));
  return {
    trovan: id, rec: filas.length ? registroVigente(filas) : null,
    reciclado, desde, sinFechas: reciclado && !desde, anteriores,
    desoves, movimientos, current: last ? { sala: last.salaDestino, tanque: last.tanqueDestino } : null,
  };
}

/** Resumen de la MATRIZ: total, vivas, muertas y conteo por ubicación (Sala · Tanque). */
export function matrixSummary(matrixRows) {
  let total = 0, vivas = 0, muertas = 0; const byUbic = new Map();
  (matrixRows || []).forEach((r) => {
    const rec = matrixRecordFromSheet(r); if (!rec.trovan) return;
    total++;
    if (rec.estado === REPRO_ESTADO.MUERTO) muertas++; else vivas++;
    const key = (rec.sala || '—') + ' · ' + (rec.tanque || '—');
    byUbic.set(key, (byUbic.get(key) || 0) + 1);
  });
  return { total, vivas, muertas, ubicaciones: [...byUbic.entries()].map(([k, n]) => ({ ubicacion: k, n })).sort((a, b) => b.n - a.n) };
}

/** Siguiente TR-ID reconciliado con el ledger real (máx de la columna TR-ID + 1). */
export function nextTrIdFromRows(transferRows) {
  return nextTrId((transferRows || []).map((r) => r['TR-ID']));
}
