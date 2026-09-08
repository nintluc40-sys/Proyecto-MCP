/* ============================================================
   REGISTROS · esquema de la ficha "Fin de Ciclo de Maduración" (Fase 4B, 2026-09-08)

   Registra que unos reproductores SALEN del departamento: un pedido, un descarte, el fin
   de su vida útil. Modelo PURO — sin DOM, sin localStorage, sin red.

   ── ES LA ÚNICA SALIDA DEL SISTEMA ─────────────────────────
   Decisión del usuario (2026-09-08): aquí entran también los animales que se van a otra
   camaronera. Un MOVIMIENTO siempre aterriza en otro tanque; lo que se va de Maduración
   sale por esta ficha y por ninguna otra. Por eso lleva `Destino`.

   ── EL CIERRE ES DEL LOTE, NO DE UN TANQUE ─────────────────
   También decisión del usuario, y por la misma razón que el desove no es de un tanque: se
   cierra un lote y el libro descuenta de CADA tanque donde esté, en proporción a lo que
   tenga vivo ese día. El operario no enumera tanques — igual que no los enumera al desovar.

   ── TOTAL vs PARCIAL, Y LA DIFERENCIA ──────────────────────
   🔑🔑 En un cierre TOTAL, lo que el libro creía que quedaba y NO salió es LA DIFERENCIA:
   se anota como discrepancia con su fecha y el lote se pone a cero. No se esconde ni se
   bloquea — «la diferencia ES el producto», que es la regla que el usuario fijó para todo
   este módulo. Un cierre PARCIAL sólo descuenta lo que salió y el lote sigue vivo.

   ── LLAVE ──────────────────────────────────────────────────
   `ID = <fecha>-<lote>-<motivo>`, determinista y en la ÚLTIMA columna; el GAS hace UPSERT
   por ella (`isMadId` → `upsertAstRows`), así que reenviar CORRIGE en vez de duplicar.
   ⚠ El MOTIVO va en la llave a propósito: un pedido y un descarte del mismo lote el mismo
   día son dos hechos distintos y tienen que convivir. Dos cierres con el MISMO motivo el
   mismo día, en cambio, son una sola fila y se registran sumados.
   ============================================================ */

import { sanitizeStr } from '../../../core/trovan.js';
import { normLote } from './ficha-maduracion-desoves.schema.js';

/** Hoja destino. Ya está en el `ALLOWED` del GAS desde `f66a3c4` y va por `isMadId`, así
 *  que no hace falta otro re-despliegue. */
export const MAD_FIN_SHEET = 'Maduración Fin de Ciclo';

export const MAD_FIN_TIPOS = ['Total', 'Parcial'];

/** Motivos. `Pedido` y `Descarte parcial` son los que nombró el usuario; los otros dos
 *  cubren lo que queda sin obligar a escribir «Otro» todos los días. */
export const MAD_FIN_MOTIVOS = [
  'Pedido',
  'Descarte parcial',
  'Fin de vida útil',
  'Descarte sanitario',
  'Otro',
];

export const MAD_FIN_COLUMNS = [
  { h: 'Fecha', k: 'fecha', grain: 'evento' },
  { h: 'Lote', k: 'lote', grain: 'evento' },
  { h: 'Tipo', k: 'tipo', grain: 'evento' },
  { h: 'Motivo', k: 'motivo', grain: 'evento' },
  { h: 'Destino', k: 'destino', grain: 'evento' },
  { h: 'Machos', k: 'machos', grain: 'evento', num: true },
  { h: 'Hembras', k: 'hembras', grain: 'evento', num: true },
  { h: 'Observaciones', k: 'observaciones', grain: 'evento' },
  { h: 'ID', k: 'id', grain: 'llave' },
];

export const MAD_FIN_HEADERS = MAD_FIN_COLUMNS.map((c) => c.h);

const int = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};

/** El motivo, en forma compacta para la llave. Sin él, un pedido y un descarte del mismo
 *  lote el mismo día compartirían ID y el segundo borraría al primero. */
export const motivoTag = (s) => sanitizeStr(s, 60).toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9]+/g, '');

export function finRowId(fecha, lote, motivo) {
  return sanitizeStr(fecha, 10) + '-' + normLote(lote) + '-' + motivoTag(motivo);
}

/** Una fila por cierre. */
export function buildFinRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const filas = [];
  (m.cierres || []).forEach((c) => {
    const x = c || {};
    const lote = normLote(x.lote);
    const motivo = sanitizeStr(x.motivo, 60);
    if (lote === '' || motivo === '') return;   // sin llave completa no hay fila
    const valores = {
      fecha,
      lote,
      tipo: sanitizeStr(x.tipo, 20),
      motivo,
      destino: sanitizeStr(x.destino, 80),
      machos: int(x.machos),
      hembras: int(x.hembras),
      observaciones: sanitizeStr(x.observaciones, 300),
      id: finRowId(fecha, lote, motivo),
    };
    filas.push(MAD_FIN_COLUMNS.map((col) => valores[col.k]));
  });
  return filas;
}

export function buildFinPayload(model) {
  return { sheetName: MAD_FIN_SHEET, headers: MAD_FIN_HEADERS.slice(), rows: buildFinRows(model) };
}

/** ERROR impide guardar (pérdida de datos o cierre imposible); AVISO deja guardar. */
export function validarFinCiclo(model) {
  const m = model || {};
  const errores = [];
  const avisos = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || ''))) errores.push('La fecha no es válida.');

  const cierres = m.cierres || [];
  if (!cierres.length) errores.push('No hay ningún cierre que registrar.');

  /* ⚠⚠ ERROR y no aviso: dos cierres con el mismo (fecha, lote, motivo) generan el MISMO
     ID y el upsert escribe el segundo ENCIMA del primero. Los animales del primero
     desaparecen de la hoja sin síntoma, y con ellos el descuento del saldo. */
  const vistos = new Set();

  cierres.forEach((c, i) => {
    const x = c || {};
    const lote = normLote(x.lote);
    const motivo = sanitizeStr(x.motivo, 60);
    const tipo = sanitizeStr(x.tipo, 20);
    const et = lote ? 'el cierre de ' + lote : 'el cierre ' + (i + 1);

    if (lote === '') errores.push('Falta el lote del cierre ' + (i + 1) + '.');
    if (motivo === '') errores.push('Falta el motivo del cierre ' + (i + 1) + '. Va en la llave: sin él, un pedido y un descarte del mismo día se pisarían.');
    if (tipo === '') errores.push('Falta decir si ' + et + ' es Total o Parcial.');
    else if (MAD_FIN_TIPOS.indexOf(tipo) === -1) avisos.push('«' + tipo + '» no es un tipo conocido de cierre.');
    if (lote === '' || motivo === '') return;

    const llave = lote + '|' + motivoTag(motivo);
    if (vistos.has(llave)) {
      errores.push(
        'El lote ' + lote + ' se cierra dos veces por «' + motivo + '» en esta fecha. ' +
        'Los dos escribirían la misma fila y el segundo borraría al primero: regístralos sumados.'
      );
    }
    vistos.add(llave);

    const mach = int(x.machos);
    const hemb = int(x.hembras);
    if ((mach === '' || mach === 0) && (hemb === '' || hemb === 0)) {
      /* Un cierre TOTAL sin cifras es legítimo: significa «no salió nada y el resto es
         diferencia». Uno PARCIAL sin cifras no dice nada y no descuenta nada. */
      if (tipo === 'Parcial') errores.push('Un cierre Parcial de ' + lote + ' sin animales no descuenta nada.');
      else avisos.push('El cierre total de ' + lote + ' no declara animales: TODO lo que el libro tenga se anotará como diferencia.');
    }

    if (motivo === 'Pedido' && sanitizeStr(x.destino, 80) === '') {
      avisos.push('El pedido de ' + lote + ' no dice a qué destino fue.');
    }
  });

  return { errores, avisos };
}
