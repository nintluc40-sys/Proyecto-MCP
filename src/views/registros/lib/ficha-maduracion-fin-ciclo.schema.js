/* ============================================================
   REGISTROS · esquema de la ficha "Fin de Ciclo de Maduración" (Fase 4B, 2026-09-08)

   Registra que unos reproductores SALEN del departamento: un pedido, un descarte, el fin
   de su vida útil. Modelo PURO — sin DOM, sin localStorage, sin red.

   ── ES LA ÚNICA SALIDA DEL SISTEMA ─────────────────────────
   Un MOVIMIENTO siempre aterriza en otro tanque; lo que se va de Maduración sale por esta
   ficha y por ninguna otra.

   ⚠⚠ FUERA `Destino` · corrección del usuario, 2026-09-08.
   Esta ficha nació con una columna `Destino` porque se creyó que un cierre podía mandar
   reproductores a otra camaronera. **No ocurre: ningún reproductor vuelve a camaronera.**
   La columna pedía un dato que no existe, y un campo que no se puede rellenar con la verdad
   se acaba rellenando con cualquier cosa.
   🔑 Se pudo quitar SIN COSTE porque la hoja aún NO EXISTE en producción —el GAS responde
   «Hoja no permitida» hasta que se re-despliegue— y porque su llave es la columna `ID`,
   que el GAS busca POR SU CABECERA y no por su posición. El día del re-despliegue esto deja
   de ser gratis: entonces quitar o mover una columna es una migración.
   ⚠ El motivo `Pedido` SE QUEDA (decisión del usuario): un pedido puede ir a un sitio que
   no sea camaronera. Lo que se retira es la exigencia de nombrar un destino.

   ── EL METABISULFITO ───────────────────────────────────────
   En su lugar va el proceso de metabisulfito, que sí ocurre al cerrar: la dosis aplicada y
   la fecha en que se aplicó, que PUEDE NO SER la del cierre. Van juntas a propósito — una
   dosis sin fecha o una fecha sin dosis son medio registro, y el validador lo dice.

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
import { salaTag, MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';

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
  /* D14 (2026-09-14, usuario): un lote puede estar en varias salas, y un cierre PARCIAL puede decir de
     cuál salen los animales: el libro descuenta sólo de esa sala. Vacía = el lote entero, como hasta
     ahora. Un cierre Total es siempre del lote entero. Va en la llave cuando se dice. */
  { h: 'Sala', k: 'sala', grain: 'evento' },
  /* ⚠ El orden es libre: la llave la da la columna `ID`, que el GAS localiza POR SU
     CABECERA. Lo que NO es libre es el nombre de esa columna. */
  { h: 'Metabisulfito (kg)', k: 'metabisulfito', grain: 'evento', num: true },
  { h: 'Fecha aplicación', k: 'fechaMetabisulfito', grain: 'evento' },
  { h: 'Machos', k: 'machos', grain: 'evento', num: true },
  { h: 'Hembras', k: 'hembras', grain: 'evento', num: true },
  /* 2026-09-14 (usuario): los PESOS de lo que sale se toman de TODOS los lotes del registro juntos, no
     por lote. Son del REGISTRO y se escriben iguales en cada una de sus filas: sumarlos fila a fila
     los multiplicaría. */
  /* A3 (2026-09-14, usuario): el REGISTRO lleva identificador, uno por formulario, igual en todas sus filas.
     Sin él, dos registros del mismo día —o un reenvío parcial con otros pesos— no se distinguían: para
     leer los pesos sin multiplicarlos se agrupa por «Registro» y se toman una vez. */
  { h: 'Registro', k: 'registro', grain: 'registro' },
  { h: 'Peso promedio machos (g)', k: 'pesoPromMachos', grain: 'registro', num: true },
  { h: 'Peso promedio hembras (g)', k: 'pesoPromHembras', grain: 'registro', num: true },
  { h: 'Peso total machos (kg)', k: 'pesoTotalMachos', grain: 'registro', num: true },
  { h: 'Peso total hembras (kg)', k: 'pesoTotalHembras', grain: 'registro', num: true },
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

/** La sala entra en la llave SÓLO si se dice: sin ella el ID es el de siempre. */
export function finRowId(fecha, lote, motivo, sala) {
  const s = sanitizeStr(sala, 30);
  return sanitizeStr(fecha, 10) + '-' + normLote(lote) + '-' + motivoTag(motivo) + (s ? '-' + salaTag(s) : '');
}
/** Sala de un cierre: la de un Parcial; un Total es del lote entero y nunca la lleva. */
const salaDeCierre = (x) => (sanitizeStr(x.tipo, 20) === 'Total' ? '' : sanitizeStr(x.sala, 30));

/** Una fila por cierre. */
export function buildFinRows(model) {
  const m = model || {};
  const fecha = sanitizeStr(m.fecha, 10);
  const pesos = {
    pesoPromMachos: kg(m.pesoPromMachos), pesoPromHembras: kg(m.pesoPromHembras),
    pesoTotalMachos: kg(m.pesoTotalMachos), pesoTotalHembras: kg(m.pesoTotalHembras),
    registro: sanitizeStr(m.registro, 40),
  };
  const filas = [];
  (m.cierres || []).forEach((c) => {
    const x = c || {};
    const lote = normLote(x.lote);
    const motivo = sanitizeStr(x.motivo, 60);
    if (lote === '' || motivo === '') return;   // sin llave completa no hay fila
    const sala = salaDeCierre(x);
    const valores = Object.assign({
      fecha,
      lote,
      tipo: sanitizeStr(x.tipo, 20),
      motivo,
      sala,
      metabisulfito: kg(x.metabisulfito),
      fechaMetabisulfito: sanitizeStr(x.fechaMetabisulfito, 10),
      machos: int(x.machos),
      hembras: int(x.hembras),
      observaciones: sanitizeStr(x.observaciones, 300),
      id: finRowId(fecha, lote, motivo, sala),
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
    const salaDicha = sanitizeStr(x.sala, 30);
    if (salaDicha !== '' && tipo === 'Total') errores.push('Un cierre Total cierra ' + (lote || 'el lote') + ' ENTERO, en todas sus salas: deja la sala vacía o regístralo como Parcial.');
    if (salaDicha !== '' && !MAD_TANQUES_POR_SALA[salaDicha]) avisos.push('«' + salaDicha + '» no es una sala conocida (' + et + ').');
    if (lote === '' || motivo === '') return;

    const sala = salaDeCierre(x);
    const llave = lote + '|' + motivoTag(motivo) + '|' + (sala ? salaTag(sala) : '');
    if (vistos.has(llave)) {
      errores.push(
        'El lote ' + lote + ' se cierra dos veces por «' + motivo + '»' + (sala ? ' en ' + sala : '') + ' en esta fecha. ' +
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

    /* ⚠ El metabisulfito son DOS datos que sólo valen juntos: una dosis sin fecha no dice
       cuándo se trató, y una fecha sin dosis no dice cuánto. Medio registro es peor que
       ninguno, porque parece completo. Aviso y no error: el cierre es válido sin tratar. */
    const mbs = kg(x.metabisulfito);
    const fmbs = sanitizeStr(x.fechaMetabisulfito, 10);
    if (mbs !== '' && fmbs === '') {
      avisos.push('El metabisulfito de ' + lote + ' no dice en qué fecha se aplicó.');
    }
    if (fmbs !== '' && mbs === '') {
      avisos.push('El metabisulfito de ' + lote + ' tiene fecha pero no dosis.');
    }
    if (fmbs !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fmbs)) {
      avisos.push('La fecha de metabisulfito de ' + lote + ' no es una fecha válida.');
    }
  });

  /* Los PESOS son del registro entero. Aviso y no error: el cierre vale sin pesar. Una cifra que no
     es un número positivo no se guarda —se dice—, y un peso de un sexo que ningún cierre saca no
     cuadra con nada. */
  const saca = { machos: 0, hembras: 0 };
  cierres.forEach((c) => { saca.machos += int((c || {}).machos) || 0; saca.hembras += int((c || {}).hembras) || 0; });
  [['pesoPromMachos', 'El peso promedio de machos', 'machos'], ['pesoPromHembras', 'El peso promedio de hembras', 'hembras'],
    ['pesoTotalMachos', 'El peso total de machos', 'machos'], ['pesoTotalHembras', 'El peso total de hembras', 'hembras']].forEach(([k, et, sexo]) => {
    const crudo = m[k];
    if (crudo === '' || crudo === null || crudo === undefined) return;
    const v = kg(crudo);
    if (v === '') avisos.push(et + ' no es una cifra válida y no se guardará.');
    else if (v > 0 && saca[sexo] === 0) avisos.push(et + ' está anotado, pero ningún cierre saca ' + sexo + '.');
  });

  return { errores, avisos };
}
