/* ============================================================
   REGISTROS · esquema de la ficha "Movimientos de Maduración" (Fase 3, 2026-09-08)

   Registra que un grupo de reproductores CAMBIÓ de tanque: agrupaciones, mezclas y
   transferencias, todas POR CONTEO. Modelo PURO — sin DOM, sin localStorage, sin red.
   El monolito `engine.js` lleva una copia inline; la prueba de paridad exige que las
   dos produzcan el mismo payload y el mismo veredicto.

   ⚠⚠ NO CONFUNDIR CON `Maduración Transferencias`, que es el registro REPRODUCTIVO por
   individuo con microchip Trovan. Aquí no hay individuos identificados: hay conteos, y
   son dos sistemas distintos en hojas distintas (decisión del usuario, 2026-09-08).

   ── EL GRANO ES EL TRAMO, NO EL EVENTO ─────────────────────
   Una fila = un tramo (origen → destino). Con eso las tres operaciones que pidió el
   usuario salen de la misma forma, sin lógica especial para cada una:
     · TRANSFERENCIA  un tramo.
     · AGRUPACIÓN     varios tramos con el MISMO destino (varios tanques a uno).
     · MEZCLA         varios tramos cuyo destino acaba con lotes distintos dentro.
   El `Tipo` sólo etiqueta para quien lee: el libro trata los tres igual.

   ── POR QUÉ NO HAY COLUMNA DE LOTE, Y ES LO IMPORTANTE ─────
   Es deliberado, y es la misma razón por la que la mortalidad se registra por tanque:
   **en un tanque mezclado nadie sabe de qué lote era cada animal que se movió.** Pedir
   el lote obligaría al operario a inventar un desglose. El libro lo DEDUCE repartiendo
   lo movido en proporción a los vivos que cada lote tiene en el tanque de origen ESE
   DÍA, y lo que sale llega al destino conservando su identidad.
   🔑 Es exactamente el error que el usuario cazó en el Ingreso: no destruir lo medido
   para representar lo que no se midió. Aquí, lo medido es cuántos animales se movieron;
   de qué lote eran es una deducción, y como tal se calcula, no se teclea.

   ── LLAVE ──────────────────────────────────────────────────
   `ID = <fecha>-s<salaO>t<tqO>-s<salaD>t<tqD>`, determinista y en la ÚLTIMA columna.
   El GAS hace UPSERT por ella, así que reenviar CORRIGE en vez de duplicar.
   ⚠ CONSECUENCIA QUE HAY QUE SABER: dos movimientos el MISMO día entre el MISMO par de
   tanques son una sola fila. Si de verdad ocurren dos, se registran sumados. Se eligió
   así porque la alternativa —una hoja de sólo añadir— convierte cada corrección en una
   fila nueva y deja el error dentro para siempre; con upsert, corregir es reenviar.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_SALA_OPTS, MAD_TANQUES_POR_SALA, AGUA_OPTS, salaTag } from './ficha-maduracion-ingreso.schema.js';

/** Hoja destino. La crea el propio GAS (`ss.insertSheet`) al primer envío, y ya está
 *  en su `ALLOWED` desde el commit f66a3c4 — no hace falta otro re-despliegue. */
export const MAD_MOV_SHEET = 'Maduración Movimientos';

/* Las salas, los tanques y el agua NO se redeclaran: se importan del esquema de Ingreso.
   Una segunda copia se desincroniza el día que se abra o se cierre una sala, y entonces
   una ficha ofrece un juego de opciones y la otra otro sin que nada lo cante. */
export { MAD_SALA_OPTS, MAD_TANQUES_POR_SALA, AGUA_OPTS };

/** Qué clase de movimiento es. Sólo etiqueta: el libro trata los tres igual. Se ofrecen
 *  porque el nombre de la operación es lo que el operario reconoce, no «movimiento». */
export const MAD_MOV_TIPOS = ['Transferencia', 'Agrupación', 'Mezcla'];

/** Motivos frecuentes. `Otro` deja el detalle para Observaciones. */
export const MAD_MOV_MOTIVOS = [
  'Agrupación por baja densidad',
  'Mezcla de lotes',
  'Reubicación por mantenimiento',
  'Reubicación sanitaria',
  'Otro',
];

/* ── Columnas ──────────────────────────────────────────────
   Se declaran UNA vez y las cabeceras se DERIVAN de aquí, por lo mismo que en Ingreso:
   una lista de cabeceras escrita aparte se desincroniza del constructor de filas en
   silencio, y la hoja recibe valores en la columna equivocada sin un solo error.

   `grain` dice a qué nivel del modelo pertenece cada columna:
     evento → cabecera, se repite en todas las filas del movimiento
     tramo  → propia de cada (origen, destino) */
export const MAD_MOV_COLUMNS = [
  { h: 'Fecha', k: 'fecha', grain: 'evento' },
  { h: 'Tipo', k: 'tipo', grain: 'evento' },
  { h: 'Sala origen', k: 'salaOrigen', grain: 'tramo' },
  { h: 'Tanque origen', k: 'tanqueOrigen', grain: 'tramo', num: true },
  { h: 'Sala destino', k: 'salaDestino', grain: 'tramo' },
  { h: 'Tanque destino', k: 'tanqueDestino', grain: 'tramo', num: true },
  { h: 'Machos', k: 'machos', grain: 'tramo', num: true },
  { h: 'Hembras', k: 'hembras', grain: 'tramo', num: true },
  { h: 'Agua destino', k: 'agua', grain: 'tramo' },
  { h: 'Motivo', k: 'motivo', grain: 'evento' },
  { h: 'Observaciones', k: 'observaciones', grain: 'evento' },
  { h: 'ID', k: 'id', grain: 'llave' },
];

/** Cabeceras de la hoja. DERIVADAS de las columnas — nunca tecleadas aparte. */
export const MAD_MOV_HEADERS = MAD_MOV_COLUMNS.map((c) => c.h);

const int = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};

/** Llave natural del tramo. Lleva las DOS salas además de los tanques porque la
 *  numeración se repite entre salas: sin ellas, «t3 → t7» sería ambiguo. */
export function movRowId(fecha, salaOrigen, tanqueOrigen, salaDestino, tanqueDestino) {
  return sanitizeStr(fecha, 10)
    + '-' + salaTag(salaOrigen) + 't' + Number(tanqueOrigen)
    + '-' + salaTag(salaDestino) + 't' + Number(tanqueDestino);
}

/** Filas listas para la hoja. Un tramo sin ubicación completa NO produce fila: se
 *  descarta aquí y la validación ya lo ha dicho arriba. */
export function buildMovRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const cab = {
    fecha,
    tipo: sanitizeStr(m.tipo, 30),
    motivo: sanitizeStr(m.motivo, 60),
    observaciones: sanitizeStr(m.observaciones, 300),
  };
  const filas = [];
  (m.tramos || []).forEach((tramo) => {
    const t = tramo || {};
    const sO = sanitizeStr(t.salaOrigen, 30);
    const tO = int(t.tanqueOrigen);
    const sD = sanitizeStr(t.salaDestino, 30);
    const tD = int(t.tanqueDestino);
    if (sO === '' || tO === '' || sD === '' || tD === '') return;
    const valores = Object.assign({}, cab, {
      salaOrigen: sO,
      tanqueOrigen: tO,
      salaDestino: sD,
      tanqueDestino: tD,
      machos: int(t.machos),
      hembras: int(t.hembras),
      agua: sanitizeStr(t.agua, 20),
      id: movRowId(fecha, sO, tO, sD, tD),
    });
    filas.push(MAD_MOV_COLUMNS.map((col) => valores[col.k]));
  });
  return filas;
}

/** Payload listo para `doPost`. Misma forma que el resto de fichas del monolito. */
export function buildMovPayload(model) {
  return { sheetName: MAD_MOV_SHEET, headers: MAD_MOV_HEADERS.slice(), rows: buildMovRows(model) };
}

/** Dos niveles, y la diferencia importa: ERROR impide guardar (sólo lo que produciría
 *  PÉRDIDA de datos o un movimiento imposible); AVISO deja guardar. Es el mismo criterio
 *  que en Ingreso: bloquear impediría registrar hoy algo que viene de antes. */
export function validarMovimiento(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || ''))) errores.push('La fecha no es válida.');
  if (sanitizeStr(m.tipo, 30) === '') errores.push('Falta el tipo de movimiento.');

  const tramos = m.tramos || [];
  if (!tramos.length) errores.push('El movimiento no tiene ningún tramo (origen → destino).');

  /* ⚠⚠ EL DUPLICADO ES ERROR, NO AVISO, y por la misma razón que en Ingreso: dos tramos
     con el mismo (fecha, origen, destino) generan el MISMO ID y el upsert escribe el
     segundo ENCIMA del primero. Los animales del primero desaparecen de la hoja sin un
     solo síntoma. Es el defecto que ya se pagó en Traslado con la llave posicional. */
  const vistos = new Set();
  /* Se recogen DENTRO del bucle y DESPUÉS de los `return` que rechazan un tramo, no en un
     recorrido aparte: un tramo circular tiene el mismo origen y destino por definición, así
     que contarlo aquí disparaba el aviso de «rotación» encima del error que ya se había
     dado — ruido sobre ruido. Lo encontró la prueba de paridad el 2026-09-08: el monolito
     lo hacía bien y el módulo no, y la divergencia habría dado dos veredictos distintos
     para el mismo movimiento según la pantalla. */
  const origenes = new Set();
  const destinos = new Set();

  tramos.forEach((tramo, i) => {
    const t = tramo || {};
    const sO = sanitizeStr(t.salaOrigen, 30);
    const tO = int(t.tanqueOrigen);
    const sD = sanitizeStr(t.salaDestino, 30);
    const tD = int(t.tanqueDestino);
    const et = 'tramo ' + (i + 1);

    if (sO === '' || tO === '' || sD === '' || tD === '') {
      errores.push('El ' + et + ' no tiene origen y destino completos.');
      return;
    }

    /* Mover un tanque a sí mismo no es un movimiento: es un registro que no dice nada y
       que además el libro aplicaría como sacar y volver a meter. Se ataja aquí. */
    if (sO === sD && tO === tD) {
      errores.push('El ' + et + ' sale y llega al mismo sitio (' + sO + ' tanque ' + tO + ').');
      return;
    }

    const llave = salaTag(sO) + '|' + tO + '|' + salaTag(sD) + '|' + tD;
    if (vistos.has(llave)) {
      errores.push(
        'El ' + et + ' repite el mismo origen y destino que otro tramo. ' +
        'Los dos generarían la misma fila y el segundo borraría al primero: regístralos sumados.'
      );
    }
    vistos.add(llave);

    const mach = int(t.machos);
    const hemb = int(t.hembras);
    if ((mach === '' || mach === 0) && (hemb === '' || hemb === 0)) {
      errores.push('El ' + et + ' no mueve ningún animal.');
    }

    for (const [sala, tq, cual] of [[sO, tO, 'origen'], [sD, tD, 'destino']]) {
      const permitidos = MAD_TANQUES_POR_SALA[sala];
      if (!permitidos) avisos.push('«' + sala + '» no es una sala conocida (' + cual + ' del ' + et + ').');
      else if (permitidos.indexOf(tq) === -1) avisos.push('El tanque ' + tq + ' no es de ' + sala + ' (' + cual + ' del ' + et + ').');
    }

    origenes.add(salaTag(sO) + '|' + tO);
    destinos.add(salaTag(sD) + '|' + tD);
  });

  /* Un tanque que es origen de un tramo y destino de otro EN EL MISMO movimiento no es un
     error —una rotación es legítima—, pero el orden en que se aplican cambia el resultado,
     así que se avisa en vez de callarlo. */
  for (const k of origenes) {
    if (destinos.has(k)) {
      avisos.push('Un mismo tanque es origen y destino dentro de este movimiento. Se aplicará en el orden de los tramos; si no es lo que quieres, regístralos en dos movimientos.');
      break;
    }
  }

  return { errores, avisos };
}
