/* ============================================================
   REGISTROS · esquema de la ficha "Fin de Ciclo de Maduración" (Fase 4B, 2026-09-08)

   Registra que unos reproductores SALEN del departamento: un pedido, un descarte, el fin
   de su vida útil. Modelo PURO — sin DOM, sin localStorage, sin red.

   ── ES EL REGISTRO DE LAS SALIDAS DEL SISTEMA ──────────────
   Un MOVIMIENTO siempre aterriza en otro tanque; lo que se va de Maduración se REGISTRA en
   esta ficha y en ninguna otra.
   🔴🔴 0t·9 (2026-09-29, usuario): los ♂/♀ que declara son SÓLO REGISTRO y el libro NO los
   descuenta: esos animales salen del saldo por los partes de Tanques (mortalidad y descarte
   de selección), y descontarlos también aquí los contaba dos veces.

   ⚠⚠ FUERA `Destino` · corrección del usuario, 2026-09-08.
   Esta ficha nació con una columna `Destino` porque se creyó que un cierre podía mandar
   reproductores a otra camaronera. **No ocurre: ningún reproductor vuelve a camaronera.**
   La columna pedía un dato que no existe, y un campo que no se puede rellenar con la verdad
   se acaba rellenando con cualquier cosa.
   🔑 Se pudo quitar SIN COSTE por dos razones, y una de ellas CADUCÓ (al día el 2026-09-20):
     · ~~«el GAS responde “Hoja no permitida” hasta que se re-despliegue»~~ — **YA SE RE-DESPLEGÓ**
       (sello `55acbff1b746`). Hoy el GAS SÍ conoce la hoja: está en `ALLOWED` y la crea con el primer
       envío. Lo que sigue haciendo gratis el cambio no es eso, es que la hoja tiene CERO FILAS.
       Cuántas tiene hoy lo dice `estado-maduracion.mjs`, no este comentario.
     · su llave es la columna `ID`, que el GAS busca POR SU CABECERA y no por su posición
       (`isMadId` en `doPost`) — **esto NO ha cambiado y es lo que más protege**: mover una columna
       de sitio nunca rompe la llave aquí, al revés que en `Maduración Tanques`, que es posicional.
   ⚠ Con filas dentro, quitar o RENOMBRAR una columna sigue siendo una migración: el dato de esa
   columna se pierde y la cabecera del envío deja de casar con la de la hoja (guarda `esquemaIncompatible_`).
   ⚠ El motivo `Pedido` SE QUEDA (decisión del usuario): un pedido puede ir a un sitio que
   no sea camaronera. Lo que se retira es la exigencia de nombrar un destino.

   ── EL METABISULFITO ───────────────────────────────────────
   En su lugar va el proceso de metabisulfito, que sí ocurre al cerrar: la dosis aplicada y
   la fecha en que se aplicó, que PUEDE NO SER la del cierre. Van juntas a propósito — una
   dosis sin fecha o una fecha sin dosis son medio registro, y el validador lo dice.

   ── EL CIERRE ES DEL LOTE, NO DE UN TANQUE ─────────────────
   También decisión del usuario, y por la misma razón que el desove no es de un tanque: se
   cierra un lote. El operario no enumera tanques — igual que no los enumera al desovar.
   (Hasta 0t·9 el libro descontaba lo declarado de CADA tanque donde estuviera el lote.)

   ── TOTAL vs PARCIAL, Y LA DIFERENCIA ──────────────────────
   🔑🔑 Un cierre TOTAL CIERRA el lote: lo que el libro aún tiene vivo tras las bajas del día
   es LA DIFERENCIA, se anota como discrepancia con su fecha y el lote se pone a cero. No se
   esconde ni se bloquea — «la diferencia ES el producto», que es la regla que el usuario
   fijó para todo este módulo. Un cierre PARCIAL sólo registra lo que salió y el lote sigue vivo.

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
  /* 🔴 2026-10-09 (usuario) · SE QUITA «Sala» (la puso D14 el 2026-09-14 para que un Parcial dijera de qué sala
     salían): «no es necesaria porque un lote puede estar en distintas salas y al final se agrupan». El cierre vuelve
     a ser del LOTE entero, también en la llave. Se pudo quitar sin migrar porque la hoja aún NO EXISTÍA (0 cierres,
     medido ese día); el GAS cambió su firma en el mismo cambio (ver MAD_ESQUEMA_FIRMA en Code.gs). */
  /* ⚠ El orden es libre: la llave la da la columna `ID`, que el GAS localiza POR SU
     CABECERA. Lo que NO es libre es el nombre de esa columna. */
  { h: 'Metabisulfito (kg)', k: 'metabisulfito', grain: 'evento', num: true },
  { h: 'Fecha aplicación', k: 'fechaMetabisulfito', grain: 'evento' },
  { h: 'Machos', k: 'machos', grain: 'evento', num: true },
  { h: 'Hembras', k: 'hembras', grain: 'evento', num: true },
  /* 2026-09-15 (usuario): «Rojos», por lote. Van DENTRO de los machos y hembras que salen: sólo se anotan
     y no mueven el saldo. Más rojos que animales que salen se avisa. */
  { h: 'Rojos', k: 'rojos', grain: 'evento', num: true },
  /* 2026-09-15 (usuario): los PESOS PROMEDIO son por LOTE, como los animales que salen. */
  { h: 'Peso promedio machos (g)', k: 'pesoPromMachos', grain: 'evento', num: true },
  { h: 'Peso promedio hembras (g)', k: 'pesoPromHembras', grain: 'evento', num: true },
  /* A3 (2026-09-14, usuario): el REGISTRO lleva identificador, uno por formulario, igual en todas sus filas.
     Sin él, dos registros del mismo día —o un reenvío parcial con otro peso— no se distinguían: para
     leer el peso total sin multiplicarlo se agrupa por «Registro» y se toma una vez. */
  { h: 'Registro', k: 'registro', grain: 'registro' },
  /* 2026-09-15 (usuario): UN solo peso total de lo que sale, de TODOS los lotes del registro juntos. Es del
     REGISTRO y se escribe igual en cada una de sus filas: sumarlo fila a fila lo multiplicaría. */
  { h: 'Peso total (kg)', k: 'pesoTotal', grain: 'registro', num: true },
  { h: 'Observaciones', k: 'observaciones', grain: 'evento' },
  { h: 'ID', k: 'id', grain: 'llave' },
];

export const MAD_FIN_HEADERS = MAD_FIN_COLUMNS.map((c) => c.h);

const int = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : '';
};

/** Dosis en kg: admite decimales, a diferencia de los conteos. Devuelve '' cuando no hay
 *  cifra —no 0— para que el MERGE del GAS conserve lo que ya hubiera en la celda: un 0
 *  escrito por descuido borraría una dosis real. Mismo criterio que el ×1000 de Desoves. */
const kg = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : '';
};

/** El motivo, en forma compacta para la llave. Sin él, un pedido y un descarte del mismo
 *  lote el mismo día compartirían ID y el segundo borraría al primero. */
export const motivoTag = (s) => sanitizeStr(s, 60).toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9]+/g, '');

/** La llave del cierre: fecha, lote y motivo (sin sala desde el 2026-10-09: el cierre es del lote entero). */
export function finRowId(fecha, lote, motivo) {
  return sanitizeStr(fecha, 10) + '-' + normLote(lote) + '-' + motivoTag(motivo);
}

/** Una fila por cierre. */
export function buildFinRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const pesos = { pesoTotal: kg(m.pesoTotal), registro: sanitizeStr(m.registro, 40) };
  const filas = [];
  (m.cierres || []).forEach((c) => {
    const x = c || {};
    const lote = normLote(x.lote);
    const motivo = sanitizeStr(x.motivo, 60);
    if (lote === '' || motivo === '') return;   // sin llave completa no hay fila
    const valores = Object.assign({
      fecha,
      lote,
      tipo: sanitizeStr(x.tipo, 20),
      motivo,
      metabisulfito: kg(x.metabisulfito),
      /* PE1.6 (2026-09-16, usuario): «la fecha de aplicación sale por defecto igual que la fecha del registro». Sólo
         se escribe CON su dosis —una fecha sola, como la que la ficha trae de salida, no dice nada— y una dosis sin
         fecha toma la del registro. */
      fechaMetabisulfito: kg(x.metabisulfito) === '' ? '' : (sanitizeStr(x.fechaMetabisulfito, 10) || fecha),
      machos: int(x.machos),
      hembras: int(x.hembras),
      rojos: int(x.rojos),
      pesoPromMachos: kg(x.pesoPromMachos),
      pesoPromHembras: kg(x.pesoPromHembras),
      observaciones: sanitizeStr(x.observaciones, 300),
      id: finRowId(fecha, lote, motivo),
    }, pesos);
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
     desaparecen de la hoja sin síntoma, y con ellos su registro. */
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
      /* Un cierre TOTAL sin cifras es legítimo: cierra el lote igual y lo que el libro aún tenga es
         diferencia; sólo falta la constancia de lo que salió. Uno PARCIAL sin cifras no registra
         nada. (0t·9: lo declarado ya no se descuenta; antes decía «no descuenta nada».) */
      if (tipo === 'Parcial') errores.push('Un cierre Parcial de ' + lote + ' sin animales no registra ninguna salida.');
      else avisos.push('El cierre total de ' + lote + ' no declara animales: quedará sin constancia de cuántos salieron (lo que el libro aún tenga se anotará como diferencia).');
    }

    /* ⚠ El metabisulfito son DOS datos que sólo valen juntos: una dosis sin fecha no dice
       cuándo se trató, y una fecha sin dosis no dice cuánto. Medio registro es peor que
       ninguno, porque parece completo. Aviso y no error: el cierre es válido sin tratar.
       PE1.6 (2026-09-16, usuario): la fecha sale por DEFECTO igual que la del registro. Una dosis sin fecha toma esa,
       así que ya no avisa; y una fecha sin dosis sólo avisa si NO es la del registro, porque ésa viene de salida en
       cada tarjeta y avisarla en todos los lotes sin tratar sería un rojo que no significa nada. */
    const mbs = kg(x.metabisulfito);
    const fmbs = sanitizeStr(x.fechaMetabisulfito, 10);
    if (fmbs !== '' && mbs === '' && fmbs !== sanitizeStr(m.fecha, 10)) {
      avisos.push('El metabisulfito de ' + lote + ' tiene fecha pero no dosis.');
    }
    if (fmbs !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fmbs)) {
      avisos.push('La fecha de metabisulfito de ' + lote + ' no es una fecha válida.');
    }

    /* Rojos y pesos promedio son del LOTE. Aviso y no error: el cierre vale sin ellos. Los rojos van dentro
       de los machos y hembras que salen; un peso de un sexo que ese cierre no saca no cuadra con nada. */
    const rojos = int(x.rojos);
    if (rojos !== '' && rojos > (mach || 0) + (hemb || 0)) {
      avisos.push('Los rojos de ' + lote + ' (' + rojos + ') son más que los machos y hembras que salen: van dentro de ellos.');
    }
    [['pesoPromMachos', 'El peso promedio de machos', mach, 'machos'], ['pesoPromHembras', 'El peso promedio de hembras', hemb, 'hembras']].forEach(([k, et, n, sexo]) => {
      const crudo = x[k];
      if (crudo === '' || crudo === null || crudo === undefined) return;
      const v = kg(crudo);
      if (v === '') avisos.push(et + ' de ' + lote + ' no es una cifra válida y no se guardará.');
      else if (v > 0 && !(n > 0)) avisos.push(et + ' de ' + lote + ' está anotado, pero ese cierre no saca ' + sexo + '.');
    });
  });

  /* El PESO TOTAL es del registro entero: aviso si no es cifra, o si pesa algo que ningún cierre saca. */
  const saca = cierres.reduce((a, c) => a + (int((c || {}).machos) || 0) + (int((c || {}).hembras) || 0), 0);
  if (!(m.pesoTotal === '' || m.pesoTotal === null || m.pesoTotal === undefined)) {
    const v = kg(m.pesoTotal);
    if (v === '') avisos.push('El peso total no es una cifra válida y no se guardará.');
    else if (v > 0 && saca === 0) avisos.push('El peso total está anotado, pero ningún cierre saca animales.');
  }

  return { errores, avisos };
}
