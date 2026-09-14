/* ============================================================
   REGISTROS · esquema de la ficha "Desoves de Maduración" (Fase 4A, 2026-09-08)

   Registra la PRODUCCIÓN de un pool que desovó: huevos, hembras no viables y los
   recuentos N2 y N5 con sus fechas. Modelo PURO — sin DOM, sin localStorage, sin red.

   ── EL DESOVE NO ES DE UN TANQUE, Y ESTO ES LO IMPORTANTE ──
   Lo corrigió el usuario el 2026-09-08, y la primera versión de este diseño lo tenía mal.
   Los operarios sacan copuladas de VARIOS tanques y las juntan en un solo pool —siempre
   del mismo lote, piscina y código genético—; el pool desova junto y, al terminar, se
   devuelven al tanque animales que YA NADIE identifica como los mismos que salieron.
   🔑 Por tanto «cuánto desovó el tanque 3» NO EXISTE como dato: preguntarlo obligaría a
   inventarlo. Lo que sí existe es la producción del pool, y el pool lo identifica el
   CÓDIGO GENÉTICO dentro de su lote (decisión del usuario). Ése es el grano.

   ⚠ CONSECUENCIA PARA EL LIBRO: un desove NO mueve el saldo. Las hembras salen y vuelven
   al mismo tanque, así que no entra en la cadena +ingreso −bajas ±movimientos −fin de
   ciclo. Es producción, no un movimiento de animales, y por eso esta hoja NO es fuente
   del libro mayor.

   ── LA LLAVE ES POSICIONAL, Y ESO NO SE PUEDE CAMBIAR AQUÍ ──
   ⚠⚠ El GAS escribe esta hoja con `upsertMadRows` y clave por POSICIÓN `[0,1,2]`
   (ver `madKeyCols` en Code.gs). No usa la columna «ID» como Ingreso, Movimientos y Fin
   de Ciclo, que van por `isMadId`. Cambiarlo exigiría OTRO re-despliegue del GAS, y la
   Fase 3-4-6 se diseñó entera para no necesitar ninguno.
   🔴🔴 Por eso las TRES PRIMERAS COLUMNAS SON LA LLAVE Y NO SE PUEDEN REORDENAR NI
   MOVER. Es la misma familia de la llave posicional que ya destruyó datos en Traslado:
   allí el respaldo apuntaba a otra columna y cada sync AÑADÍA una fila en vez de
   reemplazarla. Aquí, mover una de las tres haría que dos desoves distintos compartieran
   llave y uno borrara al otro. Hay una prueba que lo fija.

   ── EL UPSERT FUSIONA, Y DE ESO DEPENDE N2/N5 ──
   `upsertMadRows` conserva el valor existente cuando el entrante viene VACÍO. Gracias a
   eso el desove se registra hoy y días después se vuelve a enviar con N2 —y luego con
   N5— sin borrar los huevos. Es lo que hace posible «una fila que se completa».
   ⚠ La contrapartida: un campo NO se puede vaciar reenviándolo en blanco. Para corregir
   una cifra hay que escribir otra, no borrarla.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';

/** Hoja destino. Reutiliza la de `Maduración Lotes`, que existía con otras columnas y
 *  estaba a 0 filas: rediseñarla salió gratis y evitó pedir una hoja nueva al GAS. */
export const MAD_DESOVE_SHEET = 'Maduración Lotes';

/** El factor del usuario: se teclea `6500` y la celda guarda `6500000`. Se aplica a los
 *  conteos GRANDES; `Desoves` es un número pequeño y va tal cual. */
export const MIL = 1000;

/* ── Columnas ──────────────────────────────────────────────
   Se declaran UNA vez y las cabeceras se DERIVAN de aquí. El vocabulario es el que ya
   usaba la hoja vieja (`Total de huevos`, `Desoves`, `N2`…): es el que
   el laboratorio reconoce, y cambiarlo habría obligado a traducir dos veces.

   `grain`:
     llave  → las tres primeras, y su ORDEN es contrato con el GAS (ver cabecera)
     dato   → el resto */
export const MAD_DESOVE_COLUMNS = [
  { h: 'Fecha', k: 'fecha', grain: 'llave' },
  { h: 'Lote', k: 'lote', grain: 'llave' },
  { h: 'Código genético', k: 'codigoGenetico', grain: 'llave' },
  { h: 'Piscina Broodstock', k: 'piscina', grain: 'dato' },
  { h: 'Desoves', k: 'desoves', grain: 'dato', num: true },
  { h: 'Total de huevos', k: 'huevos', grain: 'dato', num: true, mil: true },
  /* 2026-09-14 (usuario): se BORRA «Total de nauplios (miles)» — los nauplios ya se registran
     por separado en N2 y N5, y un tercer total repetía el dato. La hoja pierde su columna G: no
     se migra (sus filas eran de prueba, decisión del usuario del 2026-09-14), pero no puede
     conservar la cabecera vieja o la guarda de esquema rechaza cada envío (ver el README). */
  /* 2026-09-14 (usuario): «No viables (miles)» pasa a «Hembras no viables» — reproductoras que
     estaban maduras pero NO desovaron. Es un CONTEO de animales, como «Desoves»: sin ×1000.
     🔑🔑 Además es la columna que mantiene la FIRMA de la pestaña en el tablero (sheets.js pide
     «código genético» y una cabecera con machos/hembras/nauplio): desde que se borró «Total de
     nauplios» es la ÚNICA que la da. Renombrarla sin «hembras» vaciaría la vista sin un error. */
  { h: 'Hembras no viables', k: 'hembrasNoViables', grain: 'dato', num: true },
  { h: 'Fecha N2', k: 'fechaN2', grain: 'dato' },
  { h: 'N2', k: 'n2', grain: 'dato', num: true, mil: true },
  { h: 'Fecha N5', k: 'fechaN5', grain: 'dato' },
  { h: 'N5', k: 'n5', grain: 'dato', num: true, mil: true },
  /* ⚠⚠ VA DESPUÉS DE N5 Y ANTES DE Observaciones, y el sitio no es indiferente: la llave de
     esta hoja es POSICIONAL —`MAD_DESOVE_KEY_COLS = [0,1,2]`, y el GAS la lee por índice—,
     así que cualquier columna nueva tiene que caer DESPUÉS de la tercera. Aquí, además, se
     lee junto a lo que despacha.
     ⚠ Se pudo añadir sin coste porque `Maduración Lotes` estaba a 0 filas el 2026-09-08
     (medido, no supuesto). Es la única ficha nueva que YA es escribible —esa hoja lleva en el
     ALLOWED del GAS desplegado—, así que en cuanto se use, mover columnas deja de ser gratis. */
  { h: 'Despacho', k: 'despacho', grain: 'dato' },
  { h: 'Observaciones', k: 'observaciones', grain: 'dato' },
];

/** Cabeceras de la hoja. DERIVADAS de las columnas — nunca tecleadas aparte. */
export const MAD_DESOVE_HEADERS = MAD_DESOVE_COLUMNS.map((c) => c.h);

/** Las columnas que forman la llave POSICIONAL del GAS, en su orden exacto. Se declara
 *  aparte para que una prueba pueda exigir que sigan siendo las tres primeras. */
export const MAD_DESOVE_KEY_COLS = [0, 1, 2];

const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

const int = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};

/** Conteo grande: se teclea en miles y se guarda en unidades. Devuelve '' si no hay
 *  cifra, para que el MERGE del GAS conserve lo que ya hubiera en la celda. */
export function aMiles(v) {
  const n = int(v);
  return n === '' ? '' : n * MIL;
}

/** Normaliza como el resto de Maduración: dos grafías del mismo valor parten los filtros
 *  y, aquí, producirían DOS filas para el mismo desove. */
export const normLote = (s) => sanitizeStr(s, 40).toUpperCase().replace(/\s+/g, '');
export const normCodigoGenetico = (s) => sanitizeStr(s, 60).toUpperCase().replace(/\s+/g, '');

/** Filas listas para la hoja. Una por desove. */
export function buildDesoveRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const filas = [];
  (m.desoves || []).forEach((d) => {
    const x = d || {};
    const lote = normLote(x.lote);
    const cg = normCodigoGenetico(x.codigoGenetico);
    if (lote === '' || cg === '') return;   // sin llave completa no hay fila que escribir
    const valores = {
      fecha,
      lote,
      codigoGenetico: cg,
      piscina: sanitizeStr(x.piscina, 60),
      desoves: int(x.desoves),
      huevos: aMiles(x.huevos),
      hembrasNoViables: int(x.hembrasNoViables),
      fechaN2: sanitizeStr(x.fechaN2, 10),
      n2: aMiles(x.n2),
      fechaN5: sanitizeStr(x.fechaN5, 10),
      n5: aMiles(x.n5),
      despacho: sanitizeStr(x.despacho, 200),
      observaciones: sanitizeStr(x.observaciones, 300),
    };
    filas.push(MAD_DESOVE_COLUMNS.map((col) => valores[col.k]));
  });
  return filas;
}

/** Payload listo para `doPost`. */
export function buildDesovePayload(model) {
  return { sheetName: MAD_DESOVE_SHEET, headers: MAD_DESOVE_HEADERS.slice(), rows: buildDesoveRows(model) };
}

/** ERROR impide guardar (lo que produciría PÉRDIDA de datos o rompería el candado);
 *  AVISO deja guardar. Mismo criterio que Ingreso y Movimientos. */
export function validarDesove(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];

  if (!esFecha(m.fecha)) errores.push('La fecha del desove no es válida.');

  const desoves = m.desoves || [];
  if (!desoves.length) errores.push('No hay ningún desove que registrar.');

  /* ⚠⚠ EL DUPLICADO ES ERROR. Dos filas con la misma (fecha, lote, código genético)
     comparten la llave POSICIONAL del GAS y la segunda se fusiona sobre la primera: sus
     cifras se pisan sin un solo síntoma. Es el mismo defecto que ya se pagó en Traslado. */
  const vistos = new Set();

  desoves.forEach((d, i) => {
    const x = d || {};
    const lote = normLote(x.lote);
    const cg = normCodigoGenetico(x.codigoGenetico);
    const et = cg ? '«' + cg + '»' : 'el desove ' + (i + 1);

    if (lote === '') errores.push('Falta el lote ' + (cg ? 'de ' + et : 'del desove ' + (i + 1)) + '.');
    if (cg === '') errores.push('Falta el código genético del desove ' + (i + 1) + '. Es lo que identifica el pool que desovó.');
    if (lote === '' || cg === '') return;

    const llave = lote + '|' + cg;
    if (vistos.has(llave)) {
      errores.push(
        'El lote ' + lote + ' con código ' + cg + ' aparece dos veces en esta fecha. ' +
        'Los dos escribirían la misma fila y el segundo pisaría al primero: regístralos sumados.'
      );
    }
    vistos.add(llave);

    /* 🔒 EL CANDADO que pidió el usuario: N5 exige N2. Un N5 sin su N2 deja un hueco que
       después nadie sabe si fue que no se contó o que se olvidó registrar. */
    const hayN2 = int(x.n2) !== '' || esFecha(x.fechaN2);
    const hayN5 = int(x.n5) !== '' || esFecha(x.fechaN5);
    if (hayN5 && !hayN2) errores.push('En ' + et + ' hay N5 sin N2. El N5 sólo se registra después del N2.');

    /* ⚠ NO se comparan los tamaños entre sí (N5 ≤ N2 ≤ huevos): el usuario confirmó el
       2026-09-08 que son cosas DISTINTAS y no comparables. Un aviso por tamaño relativo
       aquí sería un rojo que no significa nada, y ésos esconden el rojo siguiente. */

    if (x.fechaN2 && !esFecha(x.fechaN2)) avisos.push('La fecha de N2 de ' + et + ' no es válida.');
    if (x.fechaN5 && !esFecha(x.fechaN5)) avisos.push('La fecha de N5 de ' + et + ' no es válida.');
    if (esFecha(m.fecha) && esFecha(x.fechaN2) && x.fechaN2 < m.fecha) {
      avisos.push('El N2 de ' + et + ' es ANTERIOR al desove.');
    }
    if (esFecha(x.fechaN2) && esFecha(x.fechaN5) && x.fechaN5 < x.fechaN2) {
      avisos.push('El N5 de ' + et + ' es ANTERIOR al N2.');
    }

    const algo = ['desoves', 'huevos', 'hembrasNoViables', 'n2', 'n5']
      .some((k) => int(x[k]) !== '' && int(x[k]) > 0);
    if (!algo) avisos.push(et + ' no trae ninguna cifra: la fila se escribirá vacía.');
  });

  return { errores, avisos };
}
