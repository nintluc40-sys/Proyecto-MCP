/* ============================================================
   REGISTROS · esquema de la ficha "Traslado" (traslado)
   Hoja de Control de Alimentación y Parámetros durante el traslado de larvas.

   Registra el VIAJE de entrega: del laboratorio a la camaronera, con revisiones
   de parámetros en ruta. Modelo PURO — sin DOM, sin localStorage, sin red.
   El monolito `engine.js` lleva una copia inline de esta lógica (las copias de
   Music no tienen módulos ES); `ficha-traslado.paridad.test.js` exige que las dos
   produzcan el mismo payload.

   ⚠ NO confundir con la ficha "despacho" (`ficha-despacho.schema.js`), que registra
   la COSECHA en origen (población, PL/gramo, biomasa, cajas/tinas, destino, piscina).
   Son dos fichas distintas: aquélla es el envío, ésta es el viaje.

   ── UN VIAJE, VARIOS CAMIONES ──────────────────────────────
   Un chequeador va a cargo de VARIOS camiones a la vez (normalmente dos), que
   salen juntos al mismo destino y sólo se distinguen por la PLACA. En cada parada
   mide las tinas de todos. Por eso el grano de la hoja es
   (viaje, camión, revisión, tina) y la placa viaja en cada fila.

   Un viaje de 2 camiones × 4 revisiones × 8 tinas produce 64 filas de 28 columnas.

   LLAVE: `ID = <viajeId>-c<camión>-r<revisión>-t<tina>`, DETERMINISTA y en la
   ÚLTIMA columna. El GAS hace UPSERT por ella, así que el camión puede sincronizar
   en cada parada sin duplicar una sola fila. Que sea determinista es el punto: en
   carretera se sincroniza tarde, mal y varias veces.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';
import { mLabel, CIO_MOD } from './modules.js';

/** Hoja destino. La crea el propio GAS (`ss.insertSheet`) al primer envío. */
export const TRASLADO_SHEET = 'Registro_Traslado';

/** Módulos de origen del traslado: M01…M10 y CIO (elección del usuario 2026-08-23).
 *
 *  ⚠⚠ EN LA APP CONVIVEN DOS GRAFÍAS DE MÓDULO, y no es un descuido:
 *    · CORTA  — `mLabel`: 'M01'…'M10', 'CIO'. Es la de los nombres de hoja
 *      («Datos Larvicultura - M01», «Control_Tanque M01») y la que se usa aquí.
 *    · LARGA  — `AST_MODULO_OPTS` del monolito: 'Módulo 1'…'Módulo 10', 'CIO'.
 *      Es la que escribe la ficha de Supervisión en `Registro_Supervisión`.
 *  Son hojas distintas, así que hoy no chocan. Pero si algún día se cruzan las
 *  dos hojas por módulo, HAY QUE NORMALIZAR: dos grafías del mismo valor es
 *  exactamente el defecto que costó caro con los nombres del analista.
 *
 *  Se DERIVA de `mLabel` en vez de teclearse para no crear una tercera lista. */
export const MODULO_OPTS = [
  ...Array.from({ length: 10 }, (_, i) => mLabel(i + 1)),
  mLabel(CIO_MOD),
];

/** Tinas por camión. Fijas, como el formato en papel; las que no viajan se marcan
 *  como no usadas y no generan fila. */
export const TINAS = 8;

/** Revisiones MÍNIMAS que exige el protocolo según el trayecto. Se pueden añadir
 *  más; el formulario abre con `REVISIONES_INI`, las casillas del papel. */
export const REVISIONES_MIN = 3;
export const REVISIONES_INI = 4;

/** El protocolo fija revisiones «cada hora y media a dos horas». */
export const CADENCIA_MAX_MIN = 120;

/* ── Catálogos ────────────────────────────────────────────────
   El Excel original NO tiene validación de datos: son los valores realmente
   escritos en el formato, salvo donde el usuario ha pedido otra cosa. */

/** Nivel de actividad de las larvas.
 *  ⚠ CUATRO niveles desde el 2026-08-23, por decisión del usuario. El histórico:
 *  «Alta»/«Normal» en el papel → tres niveles el 08-20 (Alta/Media/Baja, que dejó
 *  «Normal» fuera) → los cuatro de ahora, que recuperan «Normal» sin perder los
 *  otros. Se escribe **Alta** —no «Alto»— porque la hoja ya trae «Alta» de la
 *  etapa en papel: dos grafías del mismo valor es justo el problema que costó
 *  caro con los nombres del analista.
 *  El ORDEN es el de la escala, de más a menos, NO el alfabético: es el que ve
 *  el chequeador al desplegar el campo en carretera. */
export const ACTIVIDAD_OPTS = ['Alta', 'Normal', 'Media', 'Baja'];

/** Insumos que SUBEN AL CAMIÓN. Son casillas: se marcan los que vayan a bordo.
 *  ⚠ Espejo de `TRAS_ALIM_OPTS` del monolito. */
export const ALIMENTACION_OPTS = ['Artemia', 'Flake', 'Prokura', 'Vitamina C'];

/** Lo que se DOSIFICA en una tina, que sí puede ser más de un insumo a la vez
 *  (usuario, 2026-08-25). Es un desplegable de un solo valor, así que las
 *  combinaciones tienen que existir como opción propia; viajan como UNA cadena con
 *  "/" porque la hoja tiene una sola celda por tina, y el tablero del Supervisor
 *  las agrupa por valor distinto sin partirlas.
 *
 *  ⚠ Se DERIVA de `ALIMENTACION_OPTS`, no se re-teclea: añadir un insumo nuevo
 *  arriba tiene que llegar aquí solo, o las dos listas empezarían a discrepar.
 *  Espejo de `TRAS_ALIM_TINA_OPTS` del monolito. */
export const ALIMENTACION_TINA_OPTS = [
  ...ALIMENTACION_OPTS,
  'Artemia/Flake/Prokura/Vitamina C',
  'Artemia/Flake',
  'Prokura/Vitamina C',
  'Flake/Prokura',
];

/** Paradas. «Peaje» y «Gabarra» se DESDOBLAN en las dos reales de cada tipo
 *  (usuario, 2026-08-25) y SUSTITUYEN a los genéricos: dos grafías del mismo
 *  sitio es lo que costó caro con los nombres del analista. Salió gratis porque
 *  `Registro_Traslado` aún no tenía ni una fila que migrar. */
export const LUGAR_OPTS = [
  'Laboratorio',
  'Peaje 1',
  'Peaje 2',
  'Gabarra 1',
  'Gabarra 2',
  'Camaronera',
];
export const CHECK_ITEMS = ['Oxigenómetro', 'Linterna', 'Bandeja', 'Esfero'];

/** Camaroneras de destino. ES LA MISMA LISTA que `DESTINO_OPTS` del monolito
 *  (`public/registros/engine.js`), que alimenta el campo "Destino" de la ficha de
 *  Despacho de larvicultura — decisión del usuario 2026-08-20.
 *
 *  ⚠ Está DUPLICADA a propósito: este módulo es puro y no puede importar del monolito.
 *  `ficha-traslado.engine.test.js` lee el `DESTINO_OPTS` REAL de engine.js y exige que
 *  coincidan, así que si una de las dos cambia, la batería lo dice. */
export const CAMARONERA_OPTS = [
  'Pto.Inca 1',
  'Pto.Inca 2',
  'Pto.Inca 3',
  'Pto.Inca 4',
  'Taura',
  'Puná 1',
  'Puná 2',
  'Puná 3',
  'Cachugrán',
  'Chongón',
];

/* ── Esquema de columnas ──────────────────────────────────────
   ESTE ARRAY ES EL ORDEN FÍSICO DE LA HOJA. El payload se escribe por POSICIÓN
   desde la columna 1, así que reordenarlo desplaza los datos de la hoja real.

   Retirados el 2026-08-20 por el usuario: Laboratorio (siempre Omarsa), Guía,
   Camión (lo sustituye la Placa) y Alimentos (queda sólo Insumos).
   Retirado el 2026-08-23 por el usuario: Tanque. La hoja pasa de 28 a 27 columnas.
   ⚠ Salió GRATIS porque `Registro_Traslado` todavía NO existe en producción (el
   GAS aún responde «Hoja no permitida»). En cuanto T3 la cree, quitar una columna
   deja de ser una edición y pasa a ser una migración de la hoja real.

   `grain` documenta de dónde sale cada valor:
     viaje    → cabecera/pie, se repite en todas las filas
     camion   → identifica al camión dentro del viaje
     revision → cambia en cada parada
     tina     → la medición propiamente dicha
     llave    → identidad de la fila

   `num: true` marca las columnas que viajan como NÚMERO y por tanto NO pasan por
   sanitizeStr. Ver `celdaNum`: no es formato, es correctitud. */
export const TRASLADO_COLUMNS = [
  { h: 'Fecha', k: 'fecha', grain: 'viaje' },
  { h: 'Viaje', k: 'viaje', grain: 'llave' },
  // Añadidas el 2026-08-23 por el usuario. Van juntas y delante porque son la
  // trazabilidad del lote: de qué corrida y de qué módulo salió el traslado.
  { h: 'Corrida', k: 'corrida', grain: 'viaje', num: true },
  { h: 'Módulo', k: 'modulo', grain: 'viaje' },
  { h: 'Camaronera', k: 'camaronera', grain: 'viaje' },
  { h: 'Placa', k: 'placa', grain: 'camion' },
  { h: 'Salinidad', k: 'salinidad', grain: 'viaje', num: true },
  { h: 'Hora salida', k: 'horaSalida', grain: 'viaje' },
  { h: 'Hora llegada', k: 'horaLlegada', grain: 'viaje' },
  { h: 'Revisión', k: 'revision', grain: 'revision', num: true },
  { h: 'Hora', k: 'hora', grain: 'revision' },
  { h: 'Lugar', k: 'lugar', grain: 'revision' },
  { h: 'Latitud', k: 'lat', grain: 'revision', num: true },
  { h: 'Longitud', k: 'lon', grain: 'revision', num: true },
  { h: 'Precisión (m)', k: 'precision', grain: 'revision', num: true },
  { h: 'Ubicación', k: 'ubicacion', grain: 'revision' },
  { h: 'Tina', k: 'tina', grain: 'tina', num: true },
  { h: 'Oxígeno (mg/L)', k: 'o2', grain: 'tina', num: true },
  { h: 'Temperatura (°C)', k: 'temp', grain: 'tina', num: true },
  { h: 'Actividad', k: 'act', grain: 'tina' },
  { h: 'Alimentación', k: 'alim', grain: 'tina' },
  { h: 'Observaciones', k: 'obs', grain: 'revision' },
  { h: 'Insumos', k: 'insumos', grain: 'viaje' },
  { h: 'Check materiales', k: 'check', grain: 'viaje' },
  { h: 'Controlador despacho', k: 'controlador', grain: 'viaje' },
  { h: 'Chequeador entrega', k: 'chequeador', grain: 'viaje' },
  { h: 'Responsable recepción', k: 'recepcion', grain: 'viaje' },
  { h: 'Hora registro', k: 'horaRegistro', grain: 'revision' },
  { h: 'ID', k: 'id', grain: 'llave' },
];

/** Cabeceras en orden físico. La ÚLTIMA es "ID" y debe seguir siéndolo: el upsert
 *  del GAS la busca por nombre y, si la cabecera se pierde, cae al respaldo
 *  «última columna». Con el ID en medio las dos rutas apuntarían a columnas
 *  distintas y cada sincronización duplicaría la fila — fue exactamente lo que
 *  obligó a migrar Registro_Supervisión en 2026-08. */
export const TRASLADO_HEADERS = TRASLADO_COLUMNS.map((c) => c.h);

/* ── Helpers de celda ─────────────────────────────────────── */

/** Texto saneado para Google Sheets (recorta e impide inyección de fórmula). */
const celdaTxt = (v, max) => sanitizeStr(v == null ? '' : v, max || 200);

/** Número, o cadena vacía si no lo es.
 *
 *  ⚠ NO usar sanitizeStr aquí, ni «de paso». `sanitizeStr` elimina los caracteres
 *  `= + - @` iniciales para evitar inyección de fórmulas, y la LONGITUD de Ecuador
 *  es negativa (≈ -79.9): pasarla por ahí la convertiría en +79.9, al otro lado del
 *  planeta, sin error visible. Las coordenadas no pueden inyectar fórmulas porque
 *  aquí ya se han convertido a Number. */
const celdaNum = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : '';
};

/** Lista → CSV saneado, sin vacíos ni duplicados, conservando el orden. */
const celdaLista = (v) => {
  const arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
  const out = [];
  arr.forEach((x) => {
    const s = celdaTxt(x);
    if (s !== '' && out.indexOf(s) === -1) out.push(s);
  });
  return out.join(', ');
};

/* ── Identidad ────────────────────────────────────────────── */

/** Id local del viaje. `now`/`rnd` son inyectables para poder fijarlo en pruebas. */
export function nuevoViajeId(now, rnd) {
  const t = (typeof now === 'number' ? now : Date.now()).toString(36);
  const r = (typeof rnd === 'number' ? rnd : Math.random()).toString(36).slice(2, 7);
  return 'tv' + t + r;
}

/** Llave de fila: determinista y estable para (viaje, camión, revisión, tina).
 *  La misma tina, del mismo camión, en la misma parada, del mismo viaje, produce
 *  SIEMPRE el mismo ID.
 *
 *  ⚠⚠ `camion` y `revision` son TOKENS ESTABLES (`cid` / `rid`), NO índices. Que
 *  fueran la posición costó un defecto de pérdida silenciosa: quitar el primer
 *  camión de un viaje ya sincronizado ascendía al segundo, y sus filas se escribían
 *  encima de las del primero, que desaparecía de la hoja sin ningún aviso. */
export function filaId(viajeId, camion, revision, tina) {
  return (
    String(viajeId || '') + '-c' + String(camion) + '-r' + String(revision) + '-t' + Number(tina)
  );
}

/** Token estable para el elemento `i`, sin chocar con los ya usados. Se prueba
 *  primero el NATURAL de la posición ('1', '2', …): así un viaje sin tokens —todo
 *  lo guardado antes de este cambio— produce EXACTAMENTE los mismos IDs de antes y
 *  nada queda huérfano en la hoja. Si el natural está cogido se cae a un aleatorio
 *  con prefijo 'x', que nunca puede coincidir con uno natural (sólo dígitos). */
export function token(usados, i, rnd) {
  const nat = String(Number(i) + 1);
  if (usados.indexOf(nat) === -1) return nat;
  let t;
  do {
    t = 'x' + (typeof rnd === 'number' ? rnd : Math.random()).toString(36).slice(2, 7);
  } while (usados.indexOf(t) !== -1);
  return t;
}

/** Garantiza `cid` en cada camión y `rid` en cada parada. IDEMPOTENTE: a quien ya
 *  lo tiene no se le toca, que es lo que hace que la identidad sobreviva a que se
 *  quite a un vecino. */
export function asegurarIds(data) {
  const d = data || {};
  const cams = Array.isArray(d.camiones) ? d.camiones : [];
  const usadosC = cams.map((c) => (c && c.cid ? String(c.cid) : '')).filter(Boolean);
  cams.forEach((c, i) => {
    if (c && !c.cid) { c.cid = token(usadosC, i); usadosC.push(c.cid); }
  });
  const revs = Array.isArray(d.revisiones) ? d.revisiones : [];
  const usadosR = revs.map((r) => (r && r.rid ? String(r.rid) : '')).filter(Boolean);
  revs.forEach((r, i) => {
    if (r && !r.rid) { r.rid = token(usadosR, i); usadosR.push(r.rid); }
  });
  return d;
}

/* ── Tiempo ───────────────────────────────────────────────── */

/** 'HH:MM' → minutos desde medianoche. Devuelve null si no es una hora válida. */
export function minutosDeHora(hhmm) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(hhmm == null ? '' : hhmm));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutos transcurridos de `a` a `b`, asumiendo que `b` es POSTERIOR.
 *
 *  Los traslados son nocturnos y cruzan la medianoche —el viaje del formato va de
 *  20:30 a 06:00—, así que una resta a secas daría negativo. Al envolver en 24 h,
 *  23:40 → 02:50 son 190 minutos, no -1250. */
export function minutosEntre(a, b) {
  const ma = minutosDeHora(a);
  const mb = minutosDeHora(b);
  if (ma === null || mb === null) return null;
  const d = mb - ma;
  return d < 0 ? d + 24 * 60 : d;
}

/* ── Camiones y tinas ─────────────────────────────────────── */

/** Camiones del viaje. Siempre devuelve al menos uno: un viaje sin lista declarada
 *  es un viaje de un solo camión, no un viaje sin camiones. */
export function camionesDe(data) {
  const arr = data && Array.isArray(data.camiones) ? data.camiones : [];
  return arr.length ? arr : [{ placa: (data && data.placa) || '', tinasOff: [] }];
}

/** Tinas en uso (1..TINAS) de UN camión, excluyendo las marcadas como no usadas.
 *  Las tinas van dentro de un camión concreto, así que apagar una en el primero no
 *  puede apagarla en el segundo. */
export function tinasEnUso(camion) {
  const off = camion && Array.isArray(camion.tinasOff) ? camion.tinasOff.map(Number) : [];
  const out = [];
  for (let t = 1; t <= TINAS; t += 1) if (off.indexOf(t) === -1) out.push(t);
  return out;
}

/* ── Payload ──────────────────────────────────────────────── */

/**
 * Construye el payload de sincronización de UN viaje.
 *
 * @param {object} registro  { id, data } — `id` es el viajeId; `data` la ficha.
 * @param {object} [opts]
 * @param {boolean} [opts.incluirApagadas=false]  Emite también las tinas marcadas
 *   como no usadas, con las mediciones en blanco. Sirve para BORRAR de la hoja una
 *   tina que ya se había sincronizado con datos y que después se apagó: el upsert
 *   sólo actualiza filas, nunca las elimina, así que sin esto la fila vieja
 *   quedaría en la hoja con sus valores originales.
 * @returns {{sheetName: string, headers: string[], rows: Array<Array>}}
 */
/**
 * ¿Esta parada tiene algo que llevar a la hoja?
 *
 * Desde el guardado por revisión (usuario, 2026-08-25) un viaje se sincroniza a
 * MEDIAS. Las paradas que aún no se han hecho NO deben escribir filas, o el
 * tablero del Supervisor y el mapa pintarían paradas fantasma que nadie registró:
 * `paradaDe` no filtra vacíos, las daría todas por buenas.
 *
 * ⚠ Espejo exacto de `trasRevConDatos` del monolito.
 */
export function revisionTieneDatos(rev) {
  const r = rev || {};
  if (celdaTxt(r.hora) !== '' || celdaTxt(r.lugar) !== '') return true;
  if (celdaTxt(r.obs) !== '' || celdaTxt(r.ubicacion) !== '') return true;
  const cams = Array.isArray(r.camiones) ? r.camiones : [];
  return cams.some((c) => {
    const tinas = (c || {}).tinas || {};
    return Object.keys(tinas).some((k) => {
      const m = tinas[k] || {};
      return (
        celdaTxt(m.o2) !== '' || celdaTxt(m.temp) !== '' || celdaTxt(m.act) !== '' || celdaTxt(m.alim) !== ''
      );
    });
  });
}

export function buildTrasladoPayload(registro, opts) {
  const o = opts || {};
  const viajeId = String((registro && registro.id) || '');
  const d = (registro && registro.data) || {};
  const revs = Array.isArray(d.revisiones) ? d.revisiones : [];
  const camiones = camionesDe(d);
  // Un registro que venga del almacenamiento puede no traer tokens. Se los damos
  // sobre las MISMAS listas que se van a recorrer (incluido el camión fantasma que
  // `camionesDe` inventa cuando no hay ninguno, que también necesita el suyo).
  asegurarIds({ camiones, revisiones: revs });
  // Llaves que este envío escribe VIVAS: lo que esté aquí no se puede apagar.
  const vivos = {};

  // Valores de viaje: se calculan UNA vez y se repiten en cada fila. Denormalizado
  // a propósito — es como escriben Microbiología y Calidad de Agua, y es lo que
  // permite filtrar por camaronera o por responsable sin reconstruir el viaje.
  const viaje = {
    fecha: celdaTxt(d.fecha),
    viaje: viajeId,
    corrida: celdaNum(d.corrida),
    modulo: celdaTxt(d.modulo),
    camaronera: celdaTxt(d.camaronera),
    salinidad: celdaNum(d.salinidad),
    horaSalida: celdaTxt(d.horaSalida),
    horaLlegada: celdaTxt(d.horaLlegada),
    insumos: celdaLista(d.insumos),
    check: celdaLista(d.check),
    controlador: celdaTxt(d.controlador),
    chequeador: celdaTxt(d.chequeador),
    recepcion: celdaTxt(d.recepcion),
  };

  const rows = [];
  revs.forEach((rev, i) => {
    const r = rev || {};
    const nRev = i + 1;
    // Parada declarada pero aún no registrada: no escribe ni una fila. `nRev` sigue
    // saliendo del ÍNDICE, así que saltar la 1 no renumera la 2 y la llave del
    // upsert sigue siendo determinista.
    if (!o.incluirVacias && !revisionTieneDatos(r)) return;
    const porCamion = Array.isArray(r.camiones) ? r.camiones : [];
    // Observaciones son POR REVISIÓN (decisión del usuario 2026-08-20): en el papel
    // es una celda combinada para las cuatro, pero una nota en la parada donde
    // ocurrió el hecho vale más que un párrafo al final del viaje.
    const celdas = {
      revision: nRev,
      hora: celdaTxt(r.hora),
      lugar: celdaTxt(r.lugar),
      lat: celdaNum(r.lat),
      lon: celdaNum(r.lon),
      precision: celdaNum(r.precision),
      ubicacion: celdaTxt(r.ubicacion),
      obs: celdaTxt(r.obs, 500),
      horaRegistro: celdaTxt(r.horaRegistro),
    };

    camiones.forEach((cam, ci) => {
      const nCam = ci + 1;
      const enUso = tinasEnUso(cam);
      const todas = tinasEnUso({ tinasOff: [] });
      const tinas = o.incluirApagadas ? todas : enUso;
      const medidas = (porCamion[ci] || {}).tinas || {};
      tinas.forEach((t) => {
        const apagada = enUso.indexOf(t) === -1;
        const m = (!apagada && medidas[t]) || {};
        const fila = { ...viaje, ...celdas };
        fila.placa = celdaTxt(cam && cam.placa);
        fila.tina = t;
        fila.o2 = celdaNum(m.o2);
        fila.temp = celdaNum(m.temp);
        fila.act = celdaTxt(m.act);
        fila.alim = celdaTxt(m.alim);
        fila.id = filaId(viajeId, (cam && cam.cid) || nCam, (r && r.rid) || nRev, t);
        vivos[fila.id] = true;
        rows.push(TRASLADO_COLUMNS.map((c) => (fila[c.k] === undefined ? '' : fila[c.k])));
      });
    });
  });

  /* Filas de lo que se retiró del viaje: TODO en blanco menos el ID, para que el
     upsert las apague. Sin esto, un camión o una parada que se quitan siguen en la
     hoja enseñando su última medición como si el viaje aún los tuviera.
     ⚠ Sólo si el registro YA se sincronizó alguna vez (si no, esas filas no existen
     y mandarlas las CREARÍA), y nunca sobre una llave que este envío escribe viva. */
  if (registro && registro.everSynced) {
    (Array.isArray(d._quitados) ? d._quitados : []).forEach((suf) => {
      const id = viajeId + String(suf);
      if (vivos[id]) return;
      rows.push(TRASLADO_COLUMNS.map((c) => (c.k === 'id' ? id : '')));
    });
  }

  return { sheetName: TRASLADO_SHEET, headers: TRASLADO_HEADERS.slice(), rows };
}

/* ── Validación ───────────────────────────────────────────── */

/**
 * Comprueba que el viaje se puede sincronizar. Devuelve una lista de problemas
 * ({campo, mensaje}); vacía significa que está completo.
 */
export function validarViaje(data) {
  const d = data || {};
  const errs = [];
  const falta = (campo, mensaje) => errs.push({ campo, mensaje });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha || ''))) falta('fecha', 'Falta la fecha de entrega');

  const cam = celdaTxt(d.camaronera);
  if (cam === '') falta('camaronera', 'Falta la camaronera de destino');
  else if (CAMARONERA_OPTS.indexOf(cam) === -1) {
    // La lista es cerrada a propósito: es la misma del "Destino" de la ficha de
    // Despacho, y aceptar texto libre reintroduciría el «Piná»/«Puná» del formato.
    falta('camaronera', '«' + cam + '» no está en el catálogo de camaroneras');
  }

  // La placa es lo ÚNICO que distingue a un camión de otro dentro del viaje: sin
  // ella las filas de los dos serían indistinguibles en la hoja.
  const camiones = camionesDe(d);
  const placas = [];
  camiones.forEach((c, i) => {
    const p = celdaTxt(c && c.placa);
    if (p === '') falta('camion' + (i + 1), 'Camión ' + (i + 1) + ': falta la placa');
    else if (placas.indexOf(p.toUpperCase()) !== -1) {
      falta('camion' + (i + 1), 'La placa «' + p + '» está repetida en dos camiones');
    } else placas.push(p.toUpperCase());
    if (tinasEnUso(c).length === 0) {
      falta('camion' + (i + 1), 'Camión ' + (i + 1) + ': no hay ninguna tina en uso');
    }
  });

  const revs = Array.isArray(d.revisiones) ? d.revisiones : [];
  /* ⚠ El mínimo de 3 del protocolo dejó de BLOQUEAR el 2026-08-25 (decisión del
     usuario) y pasó a ser un aviso de la capa de captura. Con el guardado por
     revisión el viaje se guarda ya en la parada 1, cuando por definición todavía no
     hay tres. Lo que sí se exige es que haya ALGO: un viaje sin ninguna parada
     registrada escribiría cero filas. */
  if (!revs.some((r) => revisionTieneDatos(r))) {
    falta('revisiones', 'Registra al menos una revisión antes de guardar');
  }
  revs.forEach((rev, i) => {
    const r = rev || {};
    // Sólo se le pide hora y lugar a la parada que YA se está registrando: a una
    // parada en blanco no se le puede exigir nada, porque no ha ocurrido.
    if (!revisionTieneDatos(r)) return;
    if (minutosDeHora(r.hora) === null) falta('rev' + (i + 1), 'Revisión ' + (i + 1) + ': falta la hora');
    if (celdaTxt(r.lugar) === '') falta('rev' + (i + 1), 'Revisión ' + (i + 1) + ': falta el lugar');
  });

  return errs;
}

/* ── Lecturas del viaje (compartidas entre captura y tablero) ──
   Viven aquí, y no en cada vista, porque el proyecto ya ha pagado caro tener la
   misma regla escrita dos veces (las 2 normTrovan, las 4 copias del WQI). */

/**
 * Revisiones que exceden la cadencia del protocolo respecto a la anterior.
 * @returns {Array<{revision:number, minutos:number}>}
 */
export function fueraDeCadencia(data) {
  const revs = Array.isArray(data && data.revisiones) ? data.revisiones : [];
  const out = [];
  for (let i = 1; i < revs.length; i += 1) {
    const mins = minutosEntre((revs[i - 1] || {}).hora, (revs[i] || {}).hora);
    if (mins !== null && mins > CADENCIA_MAX_MIN) out.push({ revision: i + 1, minutos: mins });
  }
  return out;
}

/**
 * Tinas cuyo oxígeno o temperatura EMPEORA respecto a la revisión anterior.
 *
 * Se avisa por caída y no por umbral porque la «tabla referencial de parámetros de
 * despacho» que cita el procedimiento no está disponible (decisión del usuario
 * 2026-08-20). No inventamos cortes: la comparación con la parada anterior no
 * necesita ninguno y ya distingue lo que hay que mirar.
 *
 * `minDelta` descarta las caídas menores que ese valor. Por defecto 0 — cualquier
 * caída cuenta, que es la regla acordada. Existe porque medido contra el viaje real
 * del formato la regla a secas produce 21 avisos sobre 32 filas, y buena parte son
 * ruido de instrumento (7.64 → 7.60 mg/L). Subirlo es un parámetro, no un rediseño.
 *
 * @returns {Array<{revision:number, camion:number, placa:string, tina:number,
 *                  campo:'o2'|'temp', de:number, a:number}>}
 */
export function caidasPorTina(data, opts) {
  const minDelta = (opts && Number(opts.minDelta)) || 0;
  const revs = Array.isArray(data && data.revisiones) ? data.revisiones : [];
  const camiones = camionesDe(data);
  const out = [];
  for (let i = 1; i < revs.length; i += 1) {
    const prevCam = Array.isArray((revs[i - 1] || {}).camiones) ? revs[i - 1].camiones : [];
    const curCam = Array.isArray((revs[i] || {}).camiones) ? revs[i].camiones : [];
    camiones.forEach((cam, ci) => {
      const prev = (prevCam[ci] || {}).tinas || {};
      const cur = (curCam[ci] || {}).tinas || {};
      tinasEnUso(cam).forEach((t) => {
        ['o2', 'temp'].forEach((campo) => {
          const a = celdaNum((prev[t] || {})[campo]);
          const b = celdaNum((cur[t] || {})[campo]);
          if (a === '' || b === '') return;
          if (a - b > minDelta) {
            out.push({
              revision: i + 1,
              camion: ci + 1,
              placa: celdaTxt(cam && cam.placa),
              tina: t,
              campo,
              de: a,
              a: b,
            });
          }
        });
      });
    });
  }
  return out;
}
