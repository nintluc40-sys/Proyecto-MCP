/* ============================================================
   MADURACIÓN · el LIBRO MAYOR — LAS DOS IMPLEMENTACIONES DEBEN COINCIDIR

   El libro existe DOS veces, y no por descuido:
     · `mad-libro.js` — módulo ES puro, probado y mutado (cuántas mutaciones lo dice
       `mutar-mad-libro` al correr: aquí decía 12 y el banco ya tenía más).
     · el bloque MAD_LIBRO de `public/registros/engine.js` — inline, porque las dos
       copias de Music son monolitos autónomos SIN módulos ES.

   Es el único módulo del proyecto que CALCULA, y lo que calcula es el número que la
   gente se va a creer. Dos versiones que repartan distinto darían las dos cifras
   plausibles y sólo una correcta, sin un solo error en pantalla. Esta prueba extrae el
   código REAL del monolito, lo ejecuta y exige el MISMO saldo y los MISMOS avisos.

   🔑 Encadenado con `verificar-3copias-v3.mjs` —que exige que engine.js y los dos de
   Music sean iguales función a función— el módulo queda atado a los tres destinos.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import {
  construirLibro,
  estadoDeSala,
  nombreComposicion,
  sumarDias,
  repartirProporcional,
  estadoDeLote,
  estadoDeLoteEnSala,
  estadoPorLoteTexto,
  CUARENTENA_DIAS,
  ESTADO_MIXTO,
  ESTADO_DESINFECCION,
  ESTADO_DESINFECCION_AGRUPADA,
  ocupacionDeSala,
  lotesVivosEnTanque,
  avisosIngresoCompartido,
  avisosTransferenciaCompartida,
} from './mad-libro.js';
import { MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';
/* ⚠ El módulo ENTERO, además de los nombres sueltos de arriba. Los de arriba se usan en los
   escenarios; éste sirve para preguntarle al módulo QUÉ EXPORTA, que es una pregunta que una
   lista escrita a mano no puede contestar — ver la comprobación estructural de más abajo. */
import * as modulo from './mad-libro.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

/** Carga el bloque del libro y devuelve sus piezas.
 *
 *  ⚠ El ancla de FIN cierra en la última sentencia de `madNombreComposicion`, no en la
 *  primera línea de lo que viene detrás: anclar en el vecino convierte cualquier cambio
 *  del vecino en una avería de este instrumento, y de paso tapa lo que medía. */
function motorLibro() {
  const code = bloque(
    leer(ENGINE),
    'const MAD_CUARENTENA_DIAS = 15;',
    '  return lotes.sort().join("+");\n}',
  );
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    code + '\n;globalThis.__api = { madConstruirLibro, madEstadoDeSala, madNombreComposicion,'
    + ' madSumarDias, madRepartirProporcional, madEstadoDeLote, madEstadoDeLoteEnSala, madEstadoPorLoteTexto,'
    + ' MAD_CUARENTENA_DIAS, MAD_EST_MIXTO, MAD_LIBRO_SHEETS,'
    + ' madOcupacionDeSala, MAD_EST_DESINF, MAD_EST_DESINF_AGRUP, MAD_AGRUPADA_MAX_FRACCION,'
    + ' madLotesVivosEnTanque, madAvisosIngresoCompartido, madAvisosTransferenciaCompartida };',
  ).runInContext(ctx);
  return ctx.__api;
}

const api = motorLibro();
/* En ámbito de módulo y no dentro de un describe: declararlo por bloque ya se me olvidó
   dos veces hoy, y el rojo que sale («src is not defined») no señala la regla que falla
   sino el descuido de quien escribió la prueba. */
const src = leer(ENGINE);

/* ══════════════════════════════════════════════════════════════════════════
   PARIDAD ESTRUCTURAL · NINGÚN EXPORT PUEDE QUEDARSE SIN GEMELO

   ⚠⚠ NACE DE UN HUECO REAL, encontrado el 2026-09-08 revisando puntos de guardado.
   `estadoPorLoteTexto` existía SÓLO en el módulo: sin contraparte en el monolito y, por
   tanto, sin contraparte en ninguno de los dos de Music. Y esta prueba de paridad —que es
   justo la que existe para que eso no pase— NO LO VEÍA, porque importaba una LISTA DE
   NOMBRES ESCRITA A MANO. Una función que nadie mete en la lista es invisible para ella.

   🔑 ES EL DEFECTO DE `feedback_fixtures-que-no-prueban-nada` APLICADO AL PROPIO ARNÉS: el
   instrumento pasaba en verde sin ejercer la regla que dice vigilar. Y no es teórico: las
   tres copias estaban «a la par» y el módulo tenía una función más que ninguna de ellas.

   Ahora la lista se le pregunta AL MÓDULO. Añadir un export sin decidir qué pasa con su
   gemelo pone esto rojo, que es exactamente cuando hay que decidirlo — y no meses después.
   ⚠ El GEMELO se declara, no se deduce: los nombres no siguen una regla mecánica
   (`ESTADO_CUARENTENA` → `MAD_EST_CUAR`), y fingir una regla que no existe es peor que
   escribir la tabla. Lo que NO se declara es la lista de exports: ésa la da el módulo.
   ══════════════════════════════════════════════════════════════════════════ */
const GEMELO = {
  construirLibro: 'madConstruirLibro',
  estadoDeLote: 'madEstadoDeLote',
  estadoDeLoteEnSala: 'madEstadoDeLoteEnSala',
  estadoDeSala: 'madEstadoDeSala',
  estadoPorLoteTexto: 'madEstadoPorLoteTexto',
  nombreComposicion: 'madNombreComposicion',
  repartirProporcional: 'madRepartirProporcional',
  sumarDias: 'madSumarDias',
  ubicKey: 'madUbicKey',
  posKey: 'madPosKey',
  CUARENTENA_DIAS: 'MAD_CUARENTENA_DIAS',
  ESTADO_CUARENTENA: 'MAD_EST_CUAR',
  ESTADO_PRODUCCION: 'MAD_EST_PROD',
  ESTADO_MIXTO: 'MAD_EST_MIXTO',
  ESTADO_CERRADO: 'MAD_EST_CERRADO',
  ESTADO_DESINFECCION: 'MAD_EST_DESINF',
  ESTADO_DESINFECCION_AGRUPADA: 'MAD_EST_DESINF_AGRUP',
  AGRUPADA_MAX_FRACCION: 'MAD_AGRUPADA_MAX_FRACCION',
  ocupacionDeSala: 'madOcupacionDeSala',
  lotesVivosEnTanque: 'madLotesVivosEnTanque',
  avisosIngresoCompartido: 'madAvisosIngresoCompartido',
  avisosTransferenciaCompartida: 'madAvisosTransferenciaCompartida',
};

/* El monolito declara las funciones como `function X(` y las constantes como `const X =`,
   medido sobre las catorce. El tipo se saca del propio módulo en vez de declararlo otra vez:
   una segunda declaración es una segunda cosa que puede quedarse atrás. */
const declaradoEnMonolito = (nombre, esFuncion) =>
  src.includes((esFuncion ? 'function ' : 'const ') + nombre + (esFuncion ? '(' : ' ='));

describe('paridad estructural · el módulo no puede tener nada que el monolito no tenga', () => {
  it('cada export del módulo tiene un gemelo DECLARADO', () => {
    const sinDeclarar = Object.keys(modulo).filter((n) => !GEMELO[n]).sort();
    expect(sinDeclarar).toEqual([]);
  });

  it('cada gemelo declarado EXISTE de verdad en el monolito', () => {
    const ausentes = Object.keys(GEMELO)
      .filter((n) => !declaradoEnMonolito(GEMELO[n], typeof modulo[n] === 'function'))
      .map((n) => n + ' → ' + GEMELO[n])
      .sort();
    expect(ausentes).toEqual([]);
  });

  /* ⚠ Y al revés: un gemelo declarado para algo que el módulo ya no exporta es una entrada
     muerta, y una tabla con entradas muertas deja de leerse. Misma familia que el ancla
     muerta de los bancos: la pregunta no es «¿cómo la re-anclo?» sino «¿sigue existiendo la
     regla que vigilaba?». */
  it('la tabla no tiene entradas muertas', () => {
    const sobran = Object.keys(GEMELO).filter((n) => !(n in modulo)).sort();
    expect(sobran).toEqual([]);
  });
});

/* El módulo usa Map (más expresivo dentro de src/) y el monolito objetos planos (más
   seguro en un script clásico de 18.000 líneas). Se normalizan las DOS formas a la misma
   antes de comparar: la diferencia de estructura es de estilo, la de CONTENIDO no. */
const plano = (libro) => ({
  posiciones: libro.posiciones,
  tanques: libro.tanques instanceof Map ? Object.fromEntries(libro.tanques) : libro.tanques,
  lotes: libro.lotes instanceof Map ? Object.fromEntries(libro.lotes) : libro.lotes,
  avisos: libro.avisos,
  hasta: libro.hasta,
});

const ing = (Fecha, Lote, cg, Sala, Tanque, Machos, Hembras) => ({
  Fecha, Lote, 'Código genético': cg, Sala, Tanque, Machos, Hembras,
});
const tq = (Fecha, Sala, Tanque, extra = {}) => Object.assign({
  Fecha, Sala, Tanque,
  'Machos muertos': 0, 'Hembras muertas': 0,
  'Machos muertos por descarte de selección': 0,
  'Hembras muertas por descarte de selección': 0,
  'Cópulas': 0,
}, extra);

const fin = (Fecha, Lote, Tipo, Machos, Hembras, Sala) => ({
  Fecha, Lote, Tipo, Motivo: 'Pedido', Sala: Sala || '', Machos, Hembras, Observaciones: '',
});

const mov = (Fecha, sO, tO, sD, tD, Machos, Hembras) => ({
  Fecha, Tipo: 'Transferencia',
  'Sala origen': sO, 'Tanque origen': tO,
  'Sala destino': sD, 'Tanque destino': tD,
  Machos, Hembras, 'Agua destino': 'RAS', Motivo: 'Mezcla de lotes', Observaciones: '',
});

/* Cada escenario ejerce una rama distinta. Un fixture único no distinguiría una
   implementación correcta de una que se dejó un caso — y aquí «dejarse un caso» es
   exactamente lo que produce cifras plausibles y falsas. */
const ESCENARIOS = {
  /* ── Fase 3 · MOVIMIENTOS ─────────────────────────────────
     Cuatro escenarios, y no por completismo: la lógica del movimiento vive DOS veces
     (módulo ES y bloque inline del monolito) y cada rama que no se ejerza aquí es una
     divergencia que puede vivir meses sin dar síntoma. Ya pasó con el GRUPO del Ingreso:
     el banco de paridad metió la divergencia y la paridad no la vio porque ningún fixture
     la ejercía. */
  'movimiento simple entre dos tanques': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 60)],
    movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 40, 20)],
    tanques: [],
  },
  'movimiento desde un tanque MEZCLADO (reparto proporcional)': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 150, 0),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 50, 0),
    ],
    movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 120, 0)],
    tanques: [],
  },
  'movimiento con DÉFICIT y otro sin origen': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
    movimientos: [
      mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 25, 0),
      mov('2026-01-06', 'Sala 3', 22, 'Sala 5', 7, 8, 8),
    ],
    tanques: [],
  },
  'agrupación: dos orígenes a un mismo destino, y baja el mismo día': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 60, 40),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 2, 30, 20),
    ],
    movimientos: [
      mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 30, 20),
      mov('2026-01-05', 'Sala 1', 2, 'Sala 2', 16, 15, 10),
    ],
    tanques: [tq('2026-01-05', 'Sala 2', 16, { 'Machos muertos': 5, 'Cópulas': 2 })],
  },
  'ingreso simple': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 200)],
    tanques: [],
  },
  'mortalidad y descarte': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 200)],
    tanques: [tq('2026-01-02', 'Sala 1', 1, {
      'Machos muertos': 5, 'Machos muertos por descarte de selección': 3,
      'Hembras muertas': 10, 'Hembras muertas por descarte de selección': 2,
    })],
  },
  'tanque mezclado, reparto al saldo vivo': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 100, 0),
      ing('2026-01-03', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
    ],
    tanques: [
      tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 100 }),
      tq('2026-01-04', 'Sala 1', 1, { 'Machos muertos': 40 }),
    ],
  },
  'baja anterior al ingreso de otro lote': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
      ing('2026-01-03', 'BC', 'CG2', 'Sala 1', 1, 100, 0),
    ],
    tanques: [
      tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 50 }),
      tq('2026-01-04', 'Sala 1', 1, { 'Machos muertos': 60 }),
    ],
  },
  'déficit: más bajas que vivos': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
    tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 15 })],
  },
  'bajas sin ingreso que las explique': {
    ingresos: [],
    tanques: [tq('2026-01-02', 'Sala 2', 16, { 'Hembras muertas': 3 })],
  },
  'cópula que rompe la cuarentena': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10)],
    tanques: [tq('2026-01-04', 'Sala 1', 1, { 'Cópulas': 2 })],
  },
  'dos lotes, un tanque cada uno': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
      ing('2026-01-20', 'BC', 'CG2', 'Sala 1', 2, 10, 10),
    ],
    tanques: [],
  },
  'dos composiciones del mismo lote': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 60, 0),
      ing('2026-01-01', 'AB', 'CG2', 'Sala 1', 1, 40, 0),
    ],
    tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 10 })],
  },
  'mismo tanque en salas distintas': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 4', 1, 50, 0),
    ],
    tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 10 })],
  },
  'ingreso sin ubicación': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', '', 0, 100, 0)],
    tanques: [],
  },
  /* 2026-09-08 · el reinicio de cuarentena por segundo ingreso, con una cópula previa que
     deja de contar. Entra aquí porque la regla vive DOS veces y una divergencia silenciosa
     entre monolito y módulo daría estados sanitarios distintos en la misma pantalla. */
  'segundo ingreso: reinicia la cuarentena y anula la cópula previa': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 20),
      ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 1, 30, 10),
    ],
    tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 4 })],
  },
  /* ── Fase 4B · FIN DE CICLO ───────────────────────────────
     Por lo mismo que los de movimientos: la lógica del cierre vive DOS veces y cada rama
     que no se ejerza aquí es una divergencia que puede vivir meses sin síntoma. Ya pasó
     dos veces el mismo día —el GRUPO del Ingreso y el tramo a medias de Movimientos—, las
     dos cazadas por el banco y no por la paridad. */
  'cierre PARCIAL repartido entre dos tanques': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 150, 0),
      ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 50, 0),
    ],
    cierres: [fin('2026-01-05', 'AB', 'Parcial', 60, 0)],
    tanques: [],
  },
  'cierre TOTAL con diferencia, y el lote queda cerrado': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 40)],
    cierres: [fin('2026-01-05', 'AB', 'Total', 90, 40)],
    tanques: [],
  },
  'cierre con déficit y otro de un lote que no existe': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
    cierres: [
      fin('2026-01-05', 'AB', 'Parcial', 25, 0),
      fin('2026-01-06', 'ZZ', 'Total', 5, 5),
    ],
    tanques: [],
  },
  /* D14 (2026-09-14): Parcial con sala (descuenta sólo allí, con déficit en esa sala), Parcial en una
     sala donde el lote no está, y un Total con sala escrita, que la ignora. */
  'D14: cierres por SALA': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 150, 0),
      ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 50, 0),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 3', 22, 40, 40),
    ],
    cierres: [
      fin('2026-01-05', 'AB', 'Parcial', 80, 0, 'Sala 2'),
      fin('2026-01-06', 'AB', 'Parcial', 10, 0, 'Sala 4'),
      fin('2026-01-07', 'BC', 'Total', 30, 40, 'Sala 1'),
    ],
    tanques: [],
  },
  'cierre el mismo día que las bajas (fija el orden)': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0)],
    cierres: [fin('2026-01-05', 'AB', 'Total', 95, 0)],
    tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Machos muertos': 5 })],
  },
  /* ⚠ 2026-09-09 · UN LOTE CERRADO QUE VUELVE A RECIBIR ANIMALES. Ningún escenario
     anterior tenía un lote que se cierra y vuelve a entrar, así que la copia inline podía
     divergir de la del módulo en el borrado de «cerrado» sin que nada lo dijera: el estado
     del MISMO lote saldría distinto en el monolito y en el dashboard. */
  'lote CERRADO que vuelve a recibir animales': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 100),
      ing('2026-01-20', 'AB', 'CG9', 'Sala 1', 2, 80, 80),
    ],
    cierres: [fin('2026-01-10', 'AB', 'Total', 100, 100)],
    tanques: [],
  },
  /* ── 2026-09-14 · UN LOTE EN VARIAS SALAS: la cuarentena es de cada sala ────────
     El reloj por (lote, sala) vive DOS veces, y cada rama tiene su escenario: el segundo ingreso en
     otra sala, la cópula de una sola sala, lo que se mueve a una sala nueva (hereda) y a una donde
     el lote ya estaba (manda la cuarentena que termina más tarde, en los dos sentidos). */
  'un lote en DOS salas: segundo ingreso y cópula de una sola': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
      ing('2026-01-02', 'BC', 'CG2', 'Sala 1', 2, 10, 10),
      ing('2026-01-20', 'AB', 'CG2', 'Sala 2', 16, 10, 10),
    ],
    tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 2 }), tq('2026-01-21', 'Sala 2', 16, { 'Hembras muertas': 1 })],
  },
  'movimiento de sala: hereda el reloj y manda la cuarentena más tardía': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 10, 10),
      ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 1, 50, 50),
      ing('2026-01-01', 'BC', 'CG3', 'Sala 3', 22, 40, 40),
    ],
    tanques: [tq('2026-01-04', 'Sala 2', 16, { 'Cópulas': 2 }), tq('2026-01-06', 'Sala 3', 22, { 'Cópulas': 1 })],
    movimientos: [
      mov('2026-01-22', 'Sala 1', 1, 'Sala 2', 17, 20, 20),   // en cuarentena → a una sala que produce
      mov('2026-01-22', 'Sala 3', 22, 'Sala 4', 1, 10, 10),   // produciendo → a una sala donde BC no estaba
      mov('2026-01-23', 'Sala 2', 16, 'Sala 1', 2, 5, 5),     // produciendo → a una sala en cuarentena
    ],
  },
  /* ⚠ Sin éste, un monolito que contara para el estado del lote una sala donde ya no le quedan
     animales daba lo mismo que el módulo (lo cazó P17 de probar-paridad-mad-libro): ningún escenario
     vaciaba al lote en una sala mientras seguía vivo, y en otro estado, en otra. */
  'un lote que se VACÍA en una de sus dos salas': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
      ing('2026-01-20', 'AB', 'CG2', 'Sala 2', 16, 10, 10),
    ],
    tanques: [tq('2026-01-21', 'Sala 1', 1, { 'Machos muertos': 10, 'Hembras muertas': 10 })],
  },
  /* 2026-09-15 · los contadores del resumen (muertos y descartes partidos en un tanque MEZCLADO) y la mortalidad
     en tanques de desove y recuperación: repartida entre dos tanques, con déficit, tipo desconocido y sin lote. */
  'muertos y descartes en tanque mezclado, y mortalidad en desove': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 30, 70),
      ing('2026-01-01', 'CD', 'CG2', 'Sala 1', 1, 10, 30),
      ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 2, 5, 11),
    ],
    tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Machos muertos': 3, 'Machos muertos por descarte de selección': 2, 'Hembras muertas': 7, 'Hembras muertas por descarte de selección': 3 })],
    mortDesove: [
      { Fecha: '2026-01-06', Lote: 'AB', 'Tipo de tanque': 'Desove', 'Hembras que entran': 40, 'Hembras muertas': 9 },
      { Fecha: '2026-01-07', Lote: 'AB', 'Tipo de tanque': 'Recuperación', 'Hembras que entran': 31, 'Hembras muertas': 200 },
      { Fecha: '2026-01-07', Lote: 'AB', 'Tipo de tanque': 'Otro', 'Hembras muertas': 1 },
      { Fecha: '2026-01-07', Lote: 'ZZ', 'Tipo de tanque': 'Desove', 'Hembras muertas': 4 },
      // Inf. Supervisor: una fila de revisión de nauplios en la misma hoja, que los dos tienen que saltarse.
      { Fecha: '2026-01-07', Lote: 'AB', 'Tipo de tanque': '', Revisión: 'Lavado', Deformidad: 'Media', 'Hembras muertas': 2 },
      /* Y una de ALCALINIDAD (2026-09-15), que es la TERCERA clase de fila de esta hoja: trae
         «Revisión» vacía, así que si el filtro no nombrara también el «Área» entraría como
         mortalidad y avisaría de un tipo de tanque que esa fila nunca tuvo. Con las dos copias
         saltándosela, la paridad sólo lo ve si el fixture la trae. */
      { Fecha: '2026-01-07', 'Área': 'RAS', 'Alcalinidad día': 120, 'Alcalinidad noche': 118 },
      { Fecha: '2026-01-07', 'Área': 'Sala 1', 'Alcalinidad noche': 95.5 },
    ],
  },
  'vacío': { ingresos: [], tanques: [] },
};

const HOY = '2026-01-25';

/* D4 (2026-09-14) · EL LIBRO «AL CIERRE DE UN DÍA» (opción `hasta`), igual en los dos. Si uno
   la ignorara, «🔄 Proponer estado» de Salas propondría en Music para una fecha pasada otra cosa
   que el módulo. Cada escenario se corta ANTES de todo, EN MEDIO y AL FINAL: con un solo corte al
   final, las dos implementaciones coincidirían aunque las dos ignoraran la opción. */
describe('Libro · el MISMO libro al cierre de un día (opción hasta)', () => {
  const CORTES = ['2025-12-31', '2026-01-01', '2026-01-04', '2026-01-05', '2026-01-10', '2026-01-19', HOY];
  for (const [nombre, fuentes] of Object.entries(ESCENARIOS)) {
    it('coincide con «' + nombre + '» a cada corte', () => {
      for (const c of CORTES) {
        expect(plano(api.madConstruirLibro(fuentes, { hoy: c, hasta: c })), 'corte ' + c)
          .toEqual(plano(construirLibro(fuentes, { hoy: c, hasta: c })));
      }
    });
  }

  it('y el corte cambia el libro de verdad (si no, la paridad de arriba no probaría nada)', () => {
    const f = ESCENARIOS['movimiento simple entre dos tanques'];
    const al4 = plano(construirLibro(f, { hoy: HOY, hasta: '2026-01-04' }));
    expect(al4).not.toEqual(plano(construirLibro(f, { hoy: HOY })));
    expect(al4.tanques['Sala 2|16']).toBeUndefined();       // el movimiento del 5 aún no pasó
  });
});

describe('Libro · el mismo saldo, posición a posición', () => {
  for (const [nombre, fuentes] of Object.entries(ESCENARIOS)) {
    it('coincide con «' + nombre + '»', () => {
      expect(plano(api.madConstruirLibro(fuentes, { hoy: HOY })))
        .toEqual(plano(construirLibro(fuentes, { hoy: HOY })));
    });
  }

  it('y los fixtures producen saldos y avisos DE VERDAD', () => {
    // Comparar dos libros vacíos pasa siempre. Esto exige que los escenarios principales
    // muevan cifras, para que los toEqual de arriba signifiquen algo.
    const mezcla = construirLibro(ESCENARIOS['tanque mezclado, reparto al saldo vivo'], { hoy: HOY });
    expect(mezcla.lotes.get('AB').machos).toBe(120);
    expect(mezcla.lotes.get('BC').machos).toBe(40);
    /* Fase 3: sin esto, comparar dos libros que no movieron nada pasaría siempre. */
    const mezcla3 = construirLibro(ESCENARIOS['movimiento desde un tanque MEZCLADO (reparto proporcional)'], { hoy: HOY });
    expect(mezcla3.tanques.get('Sala 2|16').machos).toBe(120);
    expect(mezcla3.tanques.get('Sala 1|1').machos).toBe(80);
    expect(construirLibro(ESCENARIOS['movimiento con DÉFICIT y otro sin origen'], { hoy: HOY }).avisos).toHaveLength(2);
    const agr = construirLibro(ESCENARIOS['agrupación: dos orígenes a un mismo destino, y baja el mismo día'], { hoy: HOY });
    expect(agr.tanques.get('Sala 2|16').machos).toBe(40);   // 30 + 15 − 5 muertos

    /* Fase 4B: sin esto, comparar dos libros que no cerraron nada pasaría siempre. */
    const parc = construirLibro(ESCENARIOS['cierre PARCIAL repartido entre dos tanques'], { hoy: HOY });
    expect(parc.tanques.get('Sala 1|1').machos).toBe(105);
    const tot = construirLibro(ESCENARIOS['cierre TOTAL con diferencia, y el lote queda cerrado'], { hoy: HOY });
    expect(tot.avisos.filter((a) => a.tipo === 'diferencia-cierre')).toHaveLength(1);
    expect(tot.tanques.get('Sala 1|1').machos).toBe(0);
    expect(construirLibro(ESCENARIOS['cierre con déficit y otro de un lote que no existe'], { hoy: HOY }).avisos).toHaveLength(2);
    const d14 = construirLibro(ESCENARIOS['D14: cierres por SALA'], { hoy: HOY });
    expect(d14.tanques.get('Sala 1|1').machos).toBe(150);
    expect(d14.tanques.get('Sala 3|22').machos).toBe(0);
    expect(d14.avisos.map((a) => a.tipo)).toEqual(['deficit-cierre', 'cierre-sin-lote', 'diferencia-cierre']);

    /* 2026-09-09: sin esto, el escenario del re-ingreso podría compararse en verde con las
       DOS copias dejando el lote cerrado, que es justo el defecto que vino a fijar. */
    const reab = construirLibro(ESCENARIOS['lote CERRADO que vuelve a recibir animales'], { hoy: HOY });
    expect(reab.lotes.get('AB').cerrado).toBe(null);
    expect(reab.lotes.get('AB').machos).toBe(80);

    expect(construirLibro(ESCENARIOS['déficit: más bajas que vivos'], { hoy: HOY }).avisos).toHaveLength(1);
    expect(construirLibro(ESCENARIOS['bajas sin ingreso que las explique'], { hoy: HOY }).avisos).toHaveLength(1);
  });
});

describe('Libro · las mismas funciones puras', () => {
  it('el mismo reparto proporcional', () => {
    const casos = [[15, [100, 50]], [10, [1, 1, 1]], [7, [2, 3, 5]], [9, [0, 0]], [0, [10, 5]], [99, [7, 11, 13, 17]]];
    for (const [t, w] of casos) expect(api.madRepartirProporcional(t, w)).toEqual(repartirProporcional(t, w));
  });

  it('la misma aritmética de fechas', () => {
    for (const f of ['2026-01-01', '2026-02-28', '2026-12-31', 'no-es-fecha']) {
      expect(api.madSumarDias(f, 15)).toBe(sumarDias(f, 15));
    }
  });

  it('las DOS suman días en UTC, y esto se comprueba en el fuente a propósito', () => {
    /* ⚠⚠ ESTA ES ESTRUCTURAL Y NO DE COMPORTAMIENTO, y el motivo importa. Cambiar
       `Date.UTC(...)` por `new Date(y, m, d)` es un defecto REAL —al este de Greenwich la
       fecha retrocede un día y la cuarentena termina con 24 h de desfase—, pero es
       INVISIBLE desde una zona al oeste: aquí (UTC−5) el instante cae a las 05:00Z y
       `toISOString()` devuelve el mismo día, así que las dos versiones dan lo mismo.
       Se midió: el banco `probar-paridad-mad-libro.mjs` metió esa divergencia y la
       comparación de resultados NO la vio.
       🔑 Una comprobación que sólo funciona en la zona horaria del que la escribió no es
       una comprobación. La regla es «se opera en UTC», así que se verifica la regla. */
    const modulo = leer(new URL('./mad-libro.js', import.meta.url));
    expect(modulo).toContain('Date.UTC(');
    expect(src).toContain('const d=new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));');
  });

  it('la misma cuarentena, y los mismos días', () => {
    expect(api.MAD_CUARENTENA_DIAS).toBe(CUARENTENA_DIAS);
    const L = { ingreso: '2026-01-01', copulaDesde: null };
    for (const d of ['2026-01-01', '2026-01-15', '2026-01-16']) {
      expect(api.madEstadoDeLote(L, d)).toBe(estadoDeLote(L, d));
    }
    const C = { ingreso: '2026-01-01', copulaDesde: '2026-01-05' };
    expect(api.madEstadoDeLote(C, '2026-01-05')).toBe(estadoDeLote(C, '2026-01-05'));
  });

  /* D13 (2026-09-14): los lotes vivos de cada tanque y los dos avisos de tanque compartido, en TODOS
     los escenarios y todos los tanques físicos. El fixture prueba algo: se exige que salgan avisos. */
  it('D13 · los mismos lotes vivos por tanque y los mismos avisos de tanque compartido', () => {
    let nIng = 0, nMov = 0;
    const cerca = [['Sala 1', 1], ['Sala 1', 2], ['Sala 1', 3], ['Sala 2', 16], ['Sala 2', 17]];
    const tramos = [];
    for (const [sO, tO] of cerca) for (const [sD, tD] of cerca) tramos.push({ salaOrigen: sO, tanqueOrigen: String(tO), salaDestino: sD, tanqueDestino: String(tD) });
    for (const f of Object.values(ESCENARIOS)) {
      const a = api.madConstruirLibro(f, { hoy: HOY });
      const b = construirLibro(f, { hoy: HOY });
      const ubic = [];
      for (const [s, lista] of Object.entries(MAD_TANQUES_POR_SALA)) {
        for (const t of lista) {
          expect([...api.madLotesVivosEnTanque(a, s, t)]).toEqual(lotesVivosEnTanque(b, s, t));
          ubic.push({ sala: s, tanque: String(t) });
        }
      }
      for (const lote of ['AB', 'BC', 'ZZ', '']) {
        const esp = avisosIngresoCompartido(b, lote, ubic.concat(ubic.slice(0, 3)));
        nIng += esp.length;
        expect([...api.madAvisosIngresoCompartido(a, lote, ubic.concat(ubic.slice(0, 3)))]).toEqual(esp);
      }
      for (const tipo of ['Transferencia', 'Mezcla']) {
        const esp = avisosTransferenciaCompartida(b, tipo, tramos);
        nMov += esp.length;
        expect([...api.madAvisosTransferenciaCompartida(a, tipo, tramos)]).toEqual(esp);
      }
    }
    expect(nIng).toBeGreaterThan(0);
    expect(nMov).toBeGreaterThan(0);
  });

  it('el mismo estado de sala, Mixto incluido', () => {
    const f = ESCENARIOS['dos lotes, un tanque cada uno'];
    const a = api.madConstruirLibro(f, { hoy: HOY });
    const b = construirLibro(f, { hoy: HOY });
    expect(api.madEstadoDeSala(a, 'Sala 1', HOY)).toBe(estadoDeSala(b, 'Sala 1', HOY));
    expect(estadoDeSala(b, 'Sala 1', HOY)).toBe(ESTADO_MIXTO);   // el fixture prueba algo
    expect(api.MAD_EST_MIXTO).toBe(ESTADO_MIXTO);
  });

  /* 2026-09-14: Desinfección y la agrupada se comparan en TODOS los escenarios y TODAS las salas,
     con la lista física de tanques. El fixture prueba algo: se exige que salgan las dos. */
  it('el mismo estado de sala con Desinfección y Producción agrupada, y la misma ocupación', () => {
    const vistos = new Set();
    /* La MITAD EXACTA (3 de 6) es la frontera de «pocos tanques»: sin ella, un monolito con `<`
       en vez de `<=` daba lo mismo que el módulo en todos los escenarios (lo destapó E09). */
    const mitad = { ingresos: [16, 17, 18].map((t) => ing('2026-01-01', 'AB', 'CG1', 'Sala 2', t, 10, 10)) };
    expect(estadoDeSala(construirLibro(mitad, { hoy: HOY }), 'Sala 2', HOY, MAD_TANQUES_POR_SALA['Sala 2']))
      .toBe(ESTADO_DESINFECCION_AGRUPADA);
    for (const f of [...Object.values(ESCENARIOS), mitad]) {
      const a = api.madConstruirLibro(f, { hoy: HOY });
      const b = construirLibro(f, { hoy: HOY });
      for (const [s, lista] of Object.entries(MAD_TANQUES_POR_SALA)) {
        const e = estadoDeSala(b, s, HOY, lista);
        vistos.add(e);
        expect(api.madEstadoDeSala(a, s, HOY, lista)).toBe(e);
        expect({ ...api.madOcupacionDeSala(a, s, lista) }).toEqual(ocupacionDeSala(b, s, lista));
        expect({ ...api.madOcupacionDeSala(a, s) }).toEqual(ocupacionDeSala(b, s));
      }
    }
    expect(vistos.has(ESTADO_DESINFECCION)).toBe(true);
    expect(vistos.has(ESTADO_DESINFECCION_AGRUPADA)).toBe(true);
    expect(api.MAD_EST_DESINF).toBe(ESTADO_DESINFECCION);
    expect(api.MAD_EST_DESINF_AGRUP).toBe(ESTADO_DESINFECCION_AGRUPADA);
  });

  /* ⚠⚠ EL DESGLOSE ES LA MITAD ÚTIL DE «Mixto», y hasta el 2026-09-08 no tenía gemelo: la
     función vivía sólo en el módulo. Comparar que las dos den el mismo texto es lo que impide
     que la columna «Estado por lote» de la hoja diga una cosa en el repo y otra en los dos de
     Music — que es exactamente el tipo de divergencia que nadie ve hasta que alguien compara
     dos pantallas.
     ⚠ El fixture PRUEBA ALGO: AB entró el 01-01 (24 días, ya en Producción) y BC el 01-20
     (5 días, aún en cuarentena), así que el texto esperado distingue los dos estados. Con un
     fixture de un solo lote, una implementación que ignorara el estado daría lo mismo. */
  it('el mismo desglose por lote, y ordenado igual', () => {
    const f = ESCENARIOS['dos lotes, un tanque cada uno'];
    const a = api.madConstruirLibro(f, { hoy: HOY });
    const b = construirLibro(f, { hoy: HOY });
    expect(api.madEstadoPorLoteTexto(a, 'Sala 1', HOY)).toBe(estadoPorLoteTexto(b, 'Sala 1', HOY));
    expect(estadoPorLoteTexto(b, 'Sala 1', HOY)).toBe('AB: Producción · BC: Cuarentena');
  });

  /* Un lote sin animales vivos NO cuenta, y las dos tienen que estar de acuerdo en eso: si
     una lo incluyera, la sala saldría «Mixta» por un lote que ya no está. */
  it('el mismo desglose cuando un lote se ha vaciado', () => {
    const f = ESCENARIOS['dos lotes, un tanque cada uno'];
    const vaciado = Object.assign({}, f, {
      tanques: [tq('2026-01-21', 'Sala 1', 2, { 'Machos muertos': 10, 'Hembras muertas': 10 })],
    });
    const a = api.madConstruirLibro(vaciado, { hoy: HOY });
    const b = construirLibro(vaciado, { hoy: HOY });
    expect(api.madEstadoPorLoteTexto(a, 'Sala 1', HOY)).toBe(estadoPorLoteTexto(b, 'Sala 1', HOY));
    expect(estadoPorLoteTexto(b, 'Sala 1', HOY)).toBe('AB: Producción');   // BC ya no cuenta
  });

  /* ⚠ El fixture de arriba mete AB en el tanque 1 y BC en el 2, así que el orden de recorrido
     YA es el alfabético y una implementación sin `sort` daría lo mismo. Éste los invierte: sin
     él, una divergencia de orden entre monolito y módulo pasaría desapercibida, y la paridad
     estaría verde por el motivo equivocado. */
  it('el mismo desglose cuando el orden de aparición NO es el alfabético', () => {
    const f = {
      ingresos: [
        ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 10, 0),
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 2, 10, 0),
      ],
    };
    const a = api.madConstruirLibro(f, { hoy: HOY });
    const b = construirLibro(f, { hoy: HOY });
    expect(api.madEstadoPorLoteTexto(a, 'Sala 1', HOY)).toBe(estadoPorLoteTexto(b, 'Sala 1', HOY));
    expect(estadoPorLoteTexto(b, 'Sala 1', HOY)).toBe('AB: Producción · BC: Producción');
  });

  /* 2026-09-14 · la cuarentena POR SALA: el desglose y el estado de un lote dentro de cada sala, en
     varias fechas, igual en los dos. El fixture prueba algo: se exige un lote que en la misma fecha
     está en cuarentena en una sala y produciendo en otra. */
  it('el mismo estado de cada lote EN CADA SALA, y el mismo desglose, a varias fechas', () => {
    const vistos = new Set();
    for (const nombre of ['un lote en DOS salas: segundo ingreso y cópula de una sola', 'movimiento de sala: hereda el reloj y manda la cuarentena más tardía']) {
      const f = ESCENARIOS[nombre];
      for (const d of ['2026-01-06', '2026-01-21', '2026-01-23', '2026-02-10']) {
        const a = api.madConstruirLibro(f, { hoy: d, hasta: d });
        const b = construirLibro(f, { hoy: d, hasta: d });
        for (const s of Object.keys(MAD_TANQUES_POR_SALA)) {
          expect(api.madEstadoPorLoteTexto(a, s, d), nombre + ' · ' + s + ' · ' + d).toBe(estadoPorLoteTexto(b, s, d));
          for (const lote of ['AB', 'BC']) {
            const e = estadoDeLoteEnSala(b.lotes.get(lote), s, d);
            expect(api.madEstadoDeLoteEnSala(a.lotes[lote], s, d)).toBe(e);
            if (b.lotes.get(lote) && (b.lotes.get(lote).salas || []).some((x) => x.sala === s)) vistos.add(lote + '|' + d + '|' + e);
          }
        }
      }
    }
    expect(vistos.has('AB|2026-01-21|Producción') && vistos.has('AB|2026-01-21|Cuarentena')).toBe(true);
  });

  it('el mismo nombre de tanque mezclado', () => {
    const f = ESCENARIOS['tanque mezclado, reparto al saldo vivo'];
    const a = api.madConstruirLibro(f, { hoy: HOY });
    const b = construirLibro(f, { hoy: HOY });
    const uk = 'Sala 1|1';
    expect(api.madNombreComposicion(a.tanques[uk])).toBe(nombreComposicion(b.tanques.get(uk)));
    expect(nombreComposicion(b.tanques.get(uk))).toBe('AB+BC');
  });
});

describe('Libro · la vista tiene DÓNDE pintarse', () => {
  const shell = leer(new URL('../shell.html', import.meta.url));

  it('el shell declara el panel fp-saldo', () => {
    expect(shell).toContain('<div class="fp" id="fp-saldo"></div>');
  });

  it('y sigue habiendo un panel para CADA pestaña de Maduración', () => {
    const m = src.match(/const MAD_TABS\s+= \[([^\]]*)\];/);
    const tabs = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(tabs.filter((t) => !shell.includes('id="fp-' + t + '"'))).toEqual([]);
  });

  it('lee las CUATRO hojas que el libro necesita', () => {
    /* Eran dos hasta la Fase 3, tres con Movimientos y cuatro con Fin de Ciclo. Cada una
       entra como fuente de pleno derecho: si alguna se cayera de aquí, el libro seguiría
       construyéndose —y daría saldos equivocados sin un solo aviso, porque esos eventos
       simplemente no existirían para él. Es el saldo entero: +ingreso −bajas ±movimientos
       −fin de ciclo. */
    expect(api.MAD_LIBRO_SHEETS).toEqual({
      ingreso: 'Maduración Ingreso',
      movimientos: 'Maduración Movimientos',
      tanques: 'Maduración Tanques',
      cierres: 'Maduración Fin de Ciclo',
      mortDesove: 'Maduración Mortalidad Desove',
    });
  });

  it('las tres se piden Y las tres se cuentan entre las que pueden faltar', () => {
    /* El defecto A1 de la auditoría del 09-08 fue justo éste con dos hojas: una que no se
       podía leer se trataba como vacía y la vista cantaba «sin discrepancias». Con tres
       fuentes el riesgo es el mismo, así que se exige que cada una aparezca en las dos
       listas: la de lectura y la de fallos.
       ⚠ 2026-09-15 · «Mortalidad Desove» se lee con `_madEnsureHojaNueva`, que sólo cambia UNA
       cosa: un «Hoja no permitida» (el GAS aún no la conoce) la guarda VACÍA en vez de dejarla
       sin entrada. Sigue leyéndose y sigue contando entre las que pueden faltar, que es lo que
       esta prueba vigila; lo que distingue vacía de ilegible lo ejerce mad-saldo-incompleto.
       ⚠ 2026-09-15 (2) · y ya no llevan `await` delante: las cinco se piden A LA VEZ y se esperan
       juntas. Lo que esta prueba vigila —que cada hoja se PIDA y que cuente entre las que pueden
       faltar— no depende de cuándo se pida, así que se busca la llamada sin el `await`. */
    const lector = (clave) => (clave === 'mortDesove'
      ? '_madEnsureHojaNueva(MAD_LIBRO_SHEETS.' + clave + ', force)'
      : '_reproEnsureSheet(MAD_LIBRO_SHEETS.' + clave + ', null, force)');
    for (const clave of ['ingreso', 'movimientos', 'tanques', 'cierres', 'mortDesove']) {
      expect(src).toContain(lector(clave));
      expect(src).toContain('if(!_madHojaLeida(MAD_LIBRO_SHEETS.' + clave + ')) fallos.push(MAD_LIBRO_SHEETS.' + clave + ');');
    }
    // Y se esperan TODAS antes de contar los fallos, o el libro se armaría a medias.
    expect(src).toContain('await Promise.all(_pendientes);');
  });

  it('la lectura REUTILIZA la cañería que ya existe, no fabrica otra', () => {
    // Dos cañerías de lectura habrían divergido en silencio; ésta ya resuelve reintentos
    // y caché, y es genérica pese a llevar el prefijo del reproductivo.
    expect(src).toContain('_reproEnsureSheet(MAD_LIBRO_SHEETS.ingreso, null, force)');
    expect(src).toContain('_reproReadRows(MAD_LIBRO_SHEETS.tanques)');
  });
});

describe('Libro · lo que encontró la auditoría del 2026-09-08', () => {
  /* Las tres son ESTRUCTURALES —miran el fuente, no el comportamiento— y conviene decir
     por qué: las tres viven en funciones de RENDER que necesitan el monolito entero y un
     documento para ejercerse. Una comprobación estructural sobre una regla clara vale más
     que ninguna, y estas tres reglas son claras. Si algún día se monta el arnés que arranca
     el motor completo, se sustituyen por las de comportamiento. */

  it('A1 · una hoja ILEGIBLE no se confunde con una hoja vacía', () => {
    /* Medido de punta a punta: el GAS responde {"ok":false,"error":"Hoja no permitida"}
       para una hoja que aún no existe, `_reproFetchSheet` lo lanza y `_reproEnsureSheet`
       lo TRAGA. Sin distinguirlas, el libro sale a cero y la vista canta «✅ Sin
       discrepancias» sobre un libro que no se ha podido construir — un verde en falso
       justo sobre la señal que este módulo existe para dar. */
    expect(src).toContain('function _madHojaLeida(name){');
    expect(src).toContain('_madLibro.fallos = fallos;');
    // Y la vista tiene que CALLARSE el ✅ cuando falta una hoja, no sólo avisar aparte.
    /* ⚠ 2026-09-13 · Desde el 09-09 el veredicto lo da madLibroIncompleto (que también cuenta
       las hojas RECORTADAS), y esta línea buscaba la forma anterior. Se mira DENTRO de
       _madSaldoHTML: el aviso rojo y el silencio del ✅ tienen que salir del MISMO veredicto. */
    const vista = bloque(src, 'function _madSaldoHTML(libro){', '\n}');
    expect(vista).toContain('const _mal=madLibroIncompleto(libro);');
    expect(vista).toContain('const roto=_mal');
    expect(vista).toContain('const av=_mal');
  });

  it('A2 · volver a la pestaña de Ingreso NO borra lo tecleado', () => {
    /* `selTab` llama al render cada vez que se vuelve a la pestaña, y el render reescribía
       innerHTML: varias composiciones con su reparto por tanques desaparecían sin aviso ni
       forma de recuperarlas. */
    expect(src).toContain('if(fp.querySelector("#mi-comps")) return;   // ya montado: se conserva lo tecleado');
    expect(src).toContain('function madIngVaciar(){');   // la forma DELIBERADA de empezar de cero
  });

  it('A3 · volver a la pestaña de Saldo no tira lo ya calculado', () => {
    // Recalcular cuesta una lectura que en este GAS se midió entre 2 y 52 s.
    expect(src).toContain('if(fp.querySelector("#ms-body")) return;');
  });

  it('D · Maduración abre en «Ingreso», no en «Salas» — decisión del usuario, 09-08', () => {
    /* Estructural por el mismo motivo que las tres de arriba: la pestaña inicial se fija
       dentro de `renderAll`, que necesita el monolito entero y un documento.
       🔑 Y hasta hoy NADA la vigilaba: era la decisión 13a del punto de guardado, tomada
       sin confirmar y sin una sola prueba encima. Ahora está confirmada y fijada. */
    expect(src).toContain(': isMadMod(curMod) ? "ingreso"');
    expect(src).toContain('selTab("ingreso");');
    expect(src).not.toContain(': isMadMod(curMod) ? "salas"');
    // Coherente con el orden: Ingreso es además la PRIMERA de la lista de pestañas.
    expect(src).toContain('const MAD_TABS      = ["ingreso","saldo",');
  });
});

describe('Libro · «Recalcular» RECALCULA de verdad (2026-09-09)', () => {
  /* 🔴🔴 EL DEFECTO. `madSaldoCargar(force)` declaraba `force` y no lo usaba, y
     `_reproEnsureSheet` sale antes de leer en cuanto la hoja tiene clave en
     `_reproSheets`. Resultado: tras la PRIMERA lectura el libro quedaba congelado
     TODA la sesión. Los cuatro botones que llaman aquí pasan `true` —🔄 Recalcular,
     el saldo de los orígenes de Movimientos, los vivos de Tanques y la propuesta de
     estado de Salas— y dos de ellos rotulan «Se recalcula al pulsar de nuevo».
     Registrar un ingreso y pulsar 🔄 no cambiaba una sola cifra.
     🔴 El más caro de los cuatro es el de Salas, que GUARDA lo propuesto en la hoja:
     escribía un estado deducido de un libro viejo, y eso ya no es una vista que
     envejece sino un registro equivocado.

     ⚠ Es la contrapartida de A3, y por eso vive al lado: A3 pide NO tirar lo ya
     calculado al volver a la pestaña; esto pide que el botón SÍ pueda tirarlo. Las dos
     a la vez sólo se sostienen si el forzado es explícito. */

  it('force se PROPAGA a las cuatro hojas del libro', () => {
    // ⚠ 2026-09-15 · sin el `;` final: las cuatro viven ahora dentro del array que se pide a la vez.
    for (const hoja of ['ingreso', 'movimientos', 'tanques', 'cierres']) {
      expect(src, hoja + ' se carga sin propagar force')
        .toContain('_reproEnsureSheet(MAD_LIBRO_SHEETS.' + hoja + ', null, force)');
    }
    // Y que no quede ninguna de las cuatro con la llamada vieja.
    expect(src).not.toContain('_reproEnsureSheet(MAD_LIBRO_SHEETS.ingreso, null);');
  });

  it('_reproEnsureSheet admite force y sólo entonces se salta la caché', () => {
    const fn = bloque(src, 'async function _reproEnsureSheet(name, cols, force){', '\n}');
    expect(fn).toContain('if(!force){');
    expect(fn).toContain('if(_reproStoreRows(name).length) return;');
    expect(fn).toContain('if(_reproSheets && _reproSheets[name]) return;');
  });

  /* 🔑 LA MITAD QUE MÁS IMPORTA, y sin la cual el arreglo habría creado un defecto
     nuevo: al forzar hay que BORRAR la entrada antes de releer. `_madHojaLeida` da por
     leída una hoja por el mero hecho de tener clave en `_reproSheets`; si la relectura
     falla y la entrada vieja siguiera ahí, el libro se calcularía con datos de hace
     horas mientras la vista canta «sin discrepancias». Es A1 otra vez —una hoja no
     leída tomada por leída—, sólo que con la lectura vieja en vez de con []. */
  it('al forzar se BORRA la entrada antes de releer, para que un fallo se vea', () => {
    const fn = bloque(src, 'async function _reproEnsureSheet(name, cols, force){', '\n}');
    expect(fn).toContain('delete _reproSheets[name];');
    // El borrado va ANTES de la lectura, no después: si fuera después, un fallo
    // dejaría la entrada vieja intacta y `_madHojaLeida` seguiría diciendo que sí.
    expect(fn.indexOf('delete _reproSheets[name];'))
      .toBeLessThan(fn.indexOf('await _reproFetchSheet(name, cols||null)'));
  });

  it('los cinco botones siguen pidiendo el recálculo', () => {
    // Si alguien quitara el `true` de un botón, ese botón enseñaría una cifra vieja
    // sin decirlo — y los rótulos de la vista seguirían prometiendo lo contrario.
    // D13 (2026-09-14): el quinto es «🔄 Ver ocupación» de Ingreso.
    // A2 (2026-09-15): 🔄 Recalcular pasa además la respuesta de ?p=ver → `madSaldoCargar(true, gas)`.
    const veces = (src.match(/madSaldoCargar\(true[,)]/g) || []).length;
    // 2026-09-15: el sexto es «🔄 Leer saldo y pesos» de Alimentación.
    expect(veces, 'se esperaban las 6 llamadas forzadas del libro').toBe(6);
    expect(src).toContain('async function madAlimLeer(){');
    expect(src).toContain('async function madIngVerOcupacion(){');
  });
});
