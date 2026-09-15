import { describe, it, expect } from 'vitest';
import {
  repartirProporcional,
  construirLibro,
  estadoDeLote,
  estadoDeLoteEnSala,
  estadoDeSala,
  estadoPorLoteTexto,
  nombreComposicion,
  sumarDias,
  ubicKey,
  CUARENTENA_DIAS,
  ESTADO_CUARENTENA,
  ESTADO_PRODUCCION,
  ESTADO_MIXTO,
  ESTADO_CERRADO,
  ESTADO_DESINFECCION,
  ESTADO_DESINFECCION_AGRUPADA,
  AGRUPADA_MAX_FRACCION,
  ocupacionDeSala,
  lotesVivosEnTanque,
  avisosIngresoCompartido,
  avisosTransferenciaCompartida,
} from './mad-libro.js';
import { MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';

/* Constructores de filas con la forma REAL de las hojas (las claves son las cabeceras,
   que es como las devuelve `?p=rows`). Escribirlas a mano en cada prueba invita a que
   una quede con una cabecera mal escrita y la prueba pase por el motivo equivocado. */
const ing = (Fecha, Lote, cg, Sala, Tanque, Machos, Hembras) => ({
  Fecha, Lote, 'Código genético': cg, Sala, Tanque, Machos, Hembras,
  'Piscina Broodstock': 'P-1', 'Camaronera origen': 'Norte', Agua: 'RAS',
});
const tq = (Fecha, Sala, Tanque, extra = {}) => Object.assign({
  Fecha, Sala, Tanque,
  'Machos muertos': 0, 'Hembras muertas': 0,
  'Machos muertos por descarte de selección': 0,
  'Hembras muertas por descarte de selección': 0,
  'Cópulas': 0, Muda: 0,
}, extra);

/* Fila de «Maduración Movimientos» con la forma REAL de la hoja (Fase 3). */
const mov = (Fecha, sO, tO, sD, tD, Machos, Hembras) => ({
  Fecha, Tipo: 'Transferencia',
  'Sala origen': sO, 'Tanque origen': tO,
  'Sala destino': sD, 'Tanque destino': tD,
  Machos, Hembras, 'Agua destino': 'RAS', Motivo: 'Mezcla de lotes', Observaciones: '',
});

/* Fila de «Maduración Fin de Ciclo» con la forma REAL de la hoja (Fase 4B).
   ⚠ «Destino» estuvo aquí hasta el 2026-09-09 y ya NO existe: el usuario lo retiró el
   2026-09-08 —ningún reproductor vuelve a camaronera— y en su sitio entró el proceso de
   metabisulfito. Un fixture que dice ser «la forma REAL» y no lo es engaña dos veces. */
const fin = (Fecha, Lote, Tipo, Machos, Hembras, Motivo, Sala) => ({
  Fecha, Lote, Tipo, Motivo: Motivo || 'Pedido', Sala: Sala || '',   // D14 (2026-09-14): Sala de un Parcial
  'Metabisulfito (kg)': '', 'Fecha aplicación': '',
  Machos, Hembras,
  'Peso promedio machos (g)': '', 'Peso promedio hembras (g)': '', 'Rojos': '', 'Peso total (kg)': '',
  Observaciones: '',
});

const saldo = (libro, sala, tanque) => libro.tanques.get(ubicKey(sala, tanque));
const dePos = (libro, lote) => libro.lotes.get(lote);

describe('Libro · el reparto proporcional', () => {
  it('reparte en proporción a los pesos', () => {
    expect(repartirProporcional(15, [100, 50])).toEqual([10, 5]);
    expect(repartirProporcional(40, [150, 50])).toEqual([30, 10]);
  });

  it('lo repartido suma SIEMPRE el total — es lo único que no puede fallar', () => {
    // Redondear cada parte por separado daría 3+3+3=9 y un animal desaparecería del
    // libro sin que nada lo dijera. El resto mayor lo impide.
    const casos = [[10, [1, 1, 1]], [7, [2, 3, 5]], [1, [1, 1]], [99, [7, 11, 13, 17]], [1000, [1]]];
    for (const [t, w] of casos) {
      expect(repartirProporcional(t, w).reduce((a, b) => a + b, 0)).toBe(t);
    }
  });

  it('reparte 10 entre tres iguales como 4+3+3, no como 3+3+3', () => {
    expect(repartirProporcional(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it('el desempate es por ÍNDICE: el mismo libro da el mismo reparto cada vez', () => {
    // Sin desempate fijo, dos pantallas abiertas a la vez enseñarían cifras distintas
    // del mismo día.
    for (let i = 0; i < 20; i++) expect(repartirProporcional(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it('con todos los pesos a cero no reparte nada: no hay a quién atribuir', () => {
    expect(repartirProporcional(9, [0, 0])).toEqual([0, 0]);
    expect(repartirProporcional(9, [])).toEqual([]);
  });

  it('un total de cero no mueve nada', () => {
    expect(repartirProporcional(0, [10, 5])).toEqual([0, 0]);
  });
});

describe('Libro · lo básico', () => {
  it('un ingreso pone los animales donde dice', () => {
    const l = construirLibro({ ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 200)] });
    expect(saldo(l, 'Sala 1', 1)).toMatchObject({ machos: 100, hembras: 200 });
    expect(dePos(l, 'AB')).toMatchObject({ machos: 100, hembras: 200 });
  });

  it('la mortalidad y el descarte restan, y suman entre sí', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 200)],
      tanques: [tq('2026-01-02', 'Sala 1', 1, {
        'Machos muertos': 5, 'Machos muertos por descarte de selección': 3,
        'Hembras muertas': 10, 'Hembras muertas por descarte de selección': 2,
      })],
    });
    expect(saldo(l, 'Sala 1', 1)).toMatchObject({ machos: 92, hembras: 188 });
  });

  it('el mismo tanque de salas distintas NO se mezcla', () => {
    // Sala 1 y Sala 4 tienen ambas un tanque 1.
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
        ing('2026-01-01', 'BC', 'CG2', 'Sala 4', 1, 50, 0),
      ],
      tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 10 })],
    });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(90);
    expect(saldo(l, 'Sala 4', 1).machos).toBe(50);
  });

  it('un libro vacío no revienta', () => {
    const l = construirLibro({});
    expect(l.posiciones).toEqual([]);
    expect(l.avisos).toEqual([]);
  });
});

describe('Libro · el reparto va al saldo VIVO del día', () => {
  /* Es la decisión del usuario, y la que separa este módulo de una versión plausible
     pero equivocada. Los dos fixtures de abajo están construidos para que las dos
     reglas den números DISTINTOS: si alguien cambiara el criterio, esto se pone rojo
     con una cifra concreta, no con un «no coincide». */

  it('NO reparte según lo que cada lote aportó al ingreso', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
        ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 100, 0),
        ing('2026-01-03', 'AB', 'CG1', 'Sala 1', 1, 100, 0),   // AB recibe más
      ],
      tanques: [
        tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 100 }),  // 50 / 50
        tq('2026-01-04', 'Sala 1', 1, { 'Machos muertos': 40 }),   // vivos 150 / 50
      ],
    });
    // Al saldo vivo: 40 repartidos 150:50 → 30 y 10  →  AB 120, BC 40
    // Al ingreso total (200:100) habrían sido 27 y 13 →  AB 123, BC 37
    expect(dePos(l, 'AB').machos).toBe(120);
    expect(dePos(l, 'BC').machos).toBe(40);
  });

  it('una baja NO se reparte con un lote que aún no había entrado', () => {
    /* Este caso caza el error de procesar todos los ingresos y luego todas las bajas:
       hacerlo así reparte la baja del día 2 con un lote que llegó el día 3. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
        ing('2026-01-03', 'BC', 'CG2', 'Sala 1', 1, 100, 0),
      ],
      tanques: [
        tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 50 }),   // sólo AB existe
        tq('2026-01-04', 'Sala 1', 1, { 'Machos muertos': 60 }),   // vivos 50 / 100
      ],
    });
    // Correcto: día 2 → AB 50. Día 4 → 60 repartidos 50:100 = 20 y 40 → AB 30, BC 60.
    // Aplanando por tipo habría salido AB 45 y BC 45.
    expect(dePos(l, 'AB').machos).toBe(30);
    expect(dePos(l, 'BC').machos).toBe(60);
  });

  it('un animal que entra hoy puede morir hoy', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
      tanques: [tq('2026-01-01', 'Sala 1', 1, { 'Machos muertos': 4 })],
    });
    expect(dePos(l, 'AB').machos).toBe(6);
  });

  it('machos y hembras se reparten por separado', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 10),
        ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 10, 100),
      ],
      tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 11, 'Hembras muertas': 11 })],
    });
    // Machos 100:10 → 10 y 1. Hembras 10:100 → 1 y 10.
    expect(dePos(l, 'AB')).toMatchObject({ machos: 90, hembras: 9 });
    expect(dePos(l, 'BC')).toMatchObject({ machos: 9, hembras: 90 });
  });
});

describe('Libro · las discrepancias, que son el producto', () => {
  it('más bajas que vivos: el saldo se para en 0 y el sobrante se DICE', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
      tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 15 })],
    });
    expect(dePos(l, 'AB').machos).toBe(0);          // no queda en -5
    const d = l.avisos.find((a) => a.tipo === 'deficit');
    expect(d).toMatchObject({ sexo: 'machos', cantidad: 5, sala: 'Sala 1', tanque: 1 });
    expect(d.texto).toContain('5 machos de baja de más');
  });

  it('bajas en un tanque sin ingreso que lo explique', () => {
    const l = construirLibro({ tanques: [tq('2026-01-02', 'Sala 2', 16, { 'Hembras muertas': 3 })] });
    expect(l.avisos.find((a) => a.tipo === 'sin-ingreso')).toMatchObject({ sala: 'Sala 2', tanque: 16, hembras: 3 });
  });

  it('un tanque sin ingreso y SIN bajas no genera ruido', () => {
    // Un aviso que no significa nada es lo que esconde el aviso siguiente.
    const l = construirLibro({ tanques: [tq('2026-01-02', 'Sala 2', 16, { 'Cópulas': 4 })] });
    expect(l.avisos).toEqual([]);
  });

  it('un ingreso sin ubicación se avisa y no entra en el libro', () => {
    const l = construirLibro({ ingresos: [ing('2026-01-01', 'AB', 'CG1', '', 0, 100, 0)] });
    expect(l.posiciones).toEqual([]);
    expect(l.avisos[0].tipo).toBe('ingreso-incompleto');
  });
});

describe('Libro · la cuarentena se deduce', () => {
  it('suma días sin depender de la zona horaria', () => {
    // Con `new Date('2026-01-01')` y horas locales, al oeste de Greenwich se retrocede
    // un día y la cuarentena terminaría con 24 h de desfase.
    expect(sumarDias('2026-01-01', 15)).toBe('2026-01-16');
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');   // 2026 no es bisiesto
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('no-es-fecha', 5)).toBe('');
  });

  it('son 15 días, y el día 15 ya es Producción', () => {
    const L = { ingreso: '2026-01-01', copulaDesde: null };
    expect(estadoDeLote(L, '2026-01-01')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeLote(L, '2026-01-15')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeLote(L, '2026-01-16')).toBe(ESTADO_PRODUCCION);
    expect(CUARENTENA_DIAS).toBe(15);
  });

  it('una cópula la rompe ANTES de los 15 días', () => {
    const L = { ingreso: '2026-01-01', copulaDesde: '2026-01-05' };
    expect(estadoDeLote(L, '2026-01-04')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeLote(L, '2026-01-05')).toBe(ESTADO_PRODUCCION);
  });

  it('la cópula se detecta en el libro, no se teclea', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10)],
      tanques: [tq('2026-01-04', 'Sala 1', 1, { 'Cópulas': 2 })],
    }, { hoy: '2026-01-06' });
    expect(dePos(l, 'AB').copulaDesde).toBe('2026-01-04');
    expect(dePos(l, 'AB').estado).toBe(ESTADO_PRODUCCION);
  });

  it('cero cópulas NO rompe la cuarentena', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10)],
      tanques: [tq('2026-01-04', 'Sala 1', 1, { 'Cópulas': 0 })],
    }, { hoy: '2026-01-06' });
    expect(dePos(l, 'AB').estado).toBe(ESTADO_CUARENTENA);
  });

  /* ⚠⚠ LAS CUATRO DE ABAJO NACEN DE UN VERDE QUE NO PROBABA NADA. El 2026-09-08 se
     cambió la regla del ingreso —de quedarse con la fecha MENOR a quedarse con la MAYOR,
     más el borrado de la cópula previa— y la suite entera siguió en verde: NINGUNA prueba
     ejercía un lote con un segundo ingreso. La regla vieja y la nueva eran indistinguibles
     para los fixtures, que es exactamente el defecto que este proyecto tiene escrito.
     Cada una de estas cuatro se pone ROJA con la regla vieja. */

  it('un SEGUNDO ingreso REINICIA la cuarentena: manda la fecha más reciente', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
        ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 2, 5, 5),
      ],
      tanques: [],
    }, { hoy: '2026-01-25' });
    const L = dePos(l, 'AB');
    expect(L.ingreso).toBe('2026-01-20');            // con la regla vieja: '2026-01-01'
    expect(L.estado).toBe(ESTADO_CUARENTENA);        // con la vieja: Producción, ya pasados 15 d
    expect(estadoDeLote(L, '2026-02-03')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeLote(L, '2026-02-04')).toBe(ESTADO_PRODUCCION);
  });

  it('una cópula ANTERIOR al segundo ingreso no certifica a los que acaban de llegar', () => {
    /* Es la sub-decisión forzada por la del usuario: sin borrar la cópula previa, el
       reinicio no haría nada en el caso común —un lote que ya copuló—, porque
       `estadoDeLote` mira `copulaDesde` ANTES que los 15 días. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
        ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 1, 5, 5),
      ],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 3 })],
    }, { hoy: '2026-01-21' });
    const L = dePos(l, 'AB');
    expect(L.copulaDesde).toBe(null);                // con la vieja: '2026-01-05'
    expect(L.estado).toBe(ESTADO_CUARENTENA);        // con la vieja: Producción
  });

  it('pero una cópula POSTERIOR al segundo ingreso sí la rompe', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
        ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 1, 5, 5),
      ],
      tanques: [
        tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 3 }),
        tq('2026-01-22', 'Sala 1', 1, { 'Cópulas': 1 }),
      ],
    }, { hoy: '2026-01-25' });
    const L = dePos(l, 'AB');
    expect(L.copulaDesde).toBe('2026-01-22');
    expect(L.estado).toBe(ESTADO_PRODUCCION);
  });

  it('un ingreso repartido en varias filas del mismo día no pierde la cópula', () => {
    /* Un ingreso se reparte en varias filas (una por composición y tanque), y el caso
       NORMAL no puede quedar roto por la regla del caso raro.
       ⚠⚠ ESTA PRUEBA NO DISTINGUE `fecha > L.ingreso` DE `fecha >= L.ingreso`, y su
       nombre anterior daba a entender que sí. Se comprobó por mutación: `>=` SOBREVIVE, y
       sobrevive porque es EQUIVALENTE — `PRIORIDAD` mete todos los ingresos del día antes
       que cualquier fila de tanque, así que cuando se procesa la 2.ª fila de un mismo día
       `copulaDesde` ya es null y volver a ponerlo a null no cambia nada.
       🔑 La equivalencia NO es gratis: depende del orden. La prueba de abajo lo fija. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
        ing('2026-01-01', 'AB', 'CG2', 'Sala 1', 2, 5, 5),
      ],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 2 })],
    }, { hoy: '2026-01-06' });
    const L = dePos(l, 'AB');
    expect(L.ingreso).toBe('2026-01-01');
    expect(L.copulaDesde).toBe('2026-01-05');
    expect(L.estado).toBe(ESTADO_PRODUCCION);
  });

  it('un animal que entra HOY puede morir HOY: el ingreso va antes que la baja', () => {
    /* El invariante que sostiene `PRIORIDAD = { ingreso: 0, tanque: 1 }`, y que hasta el
       2026-09-08 NO fijaba ninguna prueba pese a ser carga estructural de dos cosas: del
       reparto cronológico (la lección M01, «aplanar por tipo da números plausibles y
       equivocados») y de que `>` y `>=` sean equivalentes en el reinicio de cuarentena.
       Si las bajas pasaran a ir primero, esta prueba se pone roja ANTES de que nadie se
       pregunte por qué el saldo de un tanque nuevo no cuadra. */
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10)],
      tanques: [tq('2026-01-01', 'Sala 1', 1, { 'Machos muertos': 4 })],
    }, { hoy: '2026-01-02' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(6);
    // Con la baja primero: el tanque estaría vacío, saldría un aviso «sin-ingreso» y
    // los 10 machos seguirían vivos. Las dos cosas se comprueban, no sólo el saldo.
    expect(l.avisos).toHaveLength(0);
  });

  it('sin fecha de ingreso no se inventa un estado', () => {
    expect(estadoDeLote({ ingreso: '', copulaDesde: null }, '2026-01-06')).toBe('');
    expect(estadoDeLote({ ingreso: '2026-01-01' }, '')).toBe('');
  });
});

describe('Libro · los MOVIMIENTOS (Fase 3)', () => {
  it('lo que sale de un tanque LLEGA al otro, con su lote', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 60)],
      movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 40, 20)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1)).toMatchObject({ machos: 60, hembras: 40 });
    expect(saldo(l, 'Sala 2', 16)).toMatchObject({ machos: 40, hembras: 20 });
    expect(dePos(l, 'AB')).toMatchObject({ machos: 100, hembras: 60 });
  });

  it('🔴 un movimiento NO cambia el saldo del lote: sólo lo cambia de sitio', () => {
    /* El invariante más fuerte de la Fase 3, y el que cazaría casi cualquier error de
       aritmética: mover animales no los crea ni los destruye. Si esto se rompe, el saldo
       por tanque y el saldo por lote dejan de cuadrar entre sí. */
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 97, 53)],
      movimientos: [
        mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 33, 17),
        mov('2026-01-06', 'Sala 2', 16, 'Sala 3', 22, 10, 5),
      ],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(dePos(l, 'AB')).toMatchObject({ machos: 97, hembras: 53 });
    const suma = ['Sala 1|1', 'Sala 2|16', 'Sala 3|22']
      .map((k) => l.tanques.get(k))
      .reduce((a, t) => ({ machos: a.machos + t.machos, hembras: a.hembras + t.hembras }), { machos: 0, hembras: 0 });
    expect(suma).toEqual({ machos: 97, hembras: 53 });
    expect(l.avisos).toEqual([]);
  });

  it('de un tanque MEZCLADO sale en proporción, y llegan las DOS identidades', () => {
    /* Nadie sabe de qué lote era cada animal que se movió: se deduce en proporción a los
       vivos de ese día, igual que la mortalidad. 120 de 200 vivos (150 AB + 50 BC) salen
       como 90 AB + 30 BC. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 150, 0),
        ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 50, 0),
      ],
      movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 120, 0)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(80);
    expect(saldo(l, 'Sala 2', 16).machos).toBe(120);
    const destino = saldo(l, 'Sala 2', 16).composicion;
    expect(destino.find((c) => c.lote === 'AB').machos).toBe(90);
    expect(destino.find((c) => c.lote === 'BC').machos).toBe(30);
    // Y los lotes siguen enteros: 150 y 50.
    expect(dePos(l, 'AB').machos).toBe(150);
    expect(dePos(l, 'BC').machos).toBe(50);
  });

  it('🔴 un lote con DOS códigos genéticos llega al destino SIN fundirse', () => {
    /* ⚠⚠ ESTA PRUEBA NACIÓ DE UN MUTANTE SUPERVIVIENTE. El banco metió «lo movido llega al
       destino sin su código genético» y NADA se puso rojo: las pruebas del movimiento
       usaban dos LOTES distintos, así que quitar el código genético de la llave seguía
       dejándolos separados. El caso que sí lo distingue es el REAL que describió el
       usuario: el lote BM con las piscinas 766 y 767, que entraron mezcladas.
       Si las dos posiciones se fundieran al llegar, el desglose por composición del tanque
       destino sería falso y ya no habría forma de saber cuántos de cada código hay. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'BM', '766', 'Sala 1', 1, 200, 0),
        ing('2026-01-01', 'BM', '767', 'Sala 1', 1, 100, 0),
      ],
      movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 150, 0)],
      tanques: [],
    }, { hoy: '2026-01-10' });

    const destino = saldo(l, 'Sala 2', 16).composicion;
    expect(destino).toHaveLength(2);
    expect(destino.find((c) => c.codigoGenetico === '766').machos).toBe(100);
    expect(destino.find((c) => c.codigoGenetico === '767').machos).toBe(50);

    // Y en el origen queda la otra mitad, también separada.
    const origen = saldo(l, 'Sala 1', 1).composicion;
    expect(origen.find((c) => c.codigoGenetico === '766').machos).toBe(100);
    expect(origen.find((c) => c.codigoGenetico === '767').machos).toBe(50);

    // El lote sigue entero: mover no crea ni destruye.
    expect(dePos(l, 'BM').machos).toBe(300);
  });

  it('mover MÁS de los que hay avisa, y no inventa los que faltan', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
      movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 25, 0)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(0);
    expect(saldo(l, 'Sala 2', 16).machos).toBe(10);   // llegaron los que había, no 25
    expect(l.avisos).toHaveLength(1);
    expect(l.avisos[0].tipo).toBe('deficit-movimiento');
    expect(l.avisos[0].cantidad).toBe(15);
  });

  it('mover desde un tanque que el libro no conoce se AVISA, no se inventa', () => {
    const l = construirLibro({
      ingresos: [],
      movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 30, 10)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(l.tanques.size).toBe(0);
    expect(l.avisos.map((a) => a.tipo)).toEqual(['movimiento-sin-origen']);
  });

  it('un movimiento de un tanque a sí mismo no mueve nada y lo dice', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10)],
      movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 1', 1, 5, 5)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1)).toMatchObject({ machos: 10, hembras: 10 });
    expect(l.avisos.map((a) => a.tipo)).toEqual(['movimiento-circular']);
  });

  it('🔴 el que LLEGA hoy puede morir hoy en su tanque nuevo', () => {
    /* Fija la prioridad del día: ingreso → movimiento → baja. Con el movimiento después
       de la baja, esos 20 machos no estarían aún en Sala 2 y la mortalidad de allí no
       tendría a quién restarse: saldría un aviso «sin-ingreso» y el saldo quedaría mal. */
    const l = construirLibro({
      ingresos: [ing('2026-01-05', 'AB', 'CG1', 'Sala 1', 1, 50, 0)],
      movimientos: [mov('2026-01-05', 'Sala 1', 1, 'Sala 2', 16, 20, 0)],
      tanques: [tq('2026-01-05', 'Sala 2', 16, { 'Machos muertos': 3 })],
    }, { hoy: '2026-01-06' });
    expect(saldo(l, 'Sala 2', 16).machos).toBe(17);
    expect(saldo(l, 'Sala 1', 1).machos).toBe(30);
    expect(l.avisos).toEqual([]);
  });
});

describe('Libro · el FIN DE CICLO (Fase 4B)', () => {
  it('un cierre PARCIAL descuenta del lote entero, repartido entre sus tanques', () => {
    /* Se cierra el LOTE, no un tanque (decisión del usuario). 60 de 200 vivos repartidos
       150/50 entre dos tanques salen como 45 y 15. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 150, 0),
        ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 50, 0),
      ],
      cierres: [fin('2026-01-05', 'AB', 'Parcial', 60, 0)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(105);
    expect(saldo(l, 'Sala 2', 16).machos).toBe(35);
    expect(dePos(l, 'AB').machos).toBe(140);
    expect(l.avisos).toEqual([]);
    // Un cierre parcial NO cierra el lote.
    expect(dePos(l, 'AB').estado).not.toBe(ESTADO_CERRADO);
  });

  /* D14 (2026-09-14, usuario): un lote vive en varias salas y un Parcial puede decir de cuál salen. */
  const dosSalas = () => [
    ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 150, 0),
    ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 50, 0),
  ];

  it('🔴 D14 · un Parcial con SALA descuenta sólo de esa sala', () => {
    const l = construirLibro({ ingresos: dosSalas(), cierres: [fin('2026-01-05', 'AB', 'Parcial', 30, 0, 'Pedido', 'Sala 2')], tanques: [] }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(150);
    expect(saldo(l, 'Sala 2', 16).machos).toBe(20);
    expect(l.avisos).toEqual([]);
  });

  it('D14 · sacar de una sala más de lo que hay en ELLA avisa con la sala, aunque en otra sobren', () => {
    const l = construirLibro({ ingresos: dosSalas(), cierres: [fin('2026-01-05', 'AB', 'Parcial', 80, 0, 'Pedido', 'Sala 2')], tanques: [] }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(150);
    expect(saldo(l, 'Sala 2', 16).machos).toBe(0);
    expect(l.avisos).toEqual([{ fecha: '2026-01-05', tipo: 'deficit-cierre',
      texto: 'Del lote AB salieron 30 machos de más de los que el libro tenía vivos en Sala 2.',
      lote: 'AB', sala: 'Sala 2', sexo: 'machos', cantidad: 30 }]);
  });

  it('D14 · un Parcial en una sala donde el lote no está se AVISA y no toca las otras', () => {
    const l = construirLibro({ ingresos: dosSalas(), cierres: [fin('2026-01-05', 'AB', 'Parcial', 10, 0, 'Pedido', 'Sala 3')], tanques: [] }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(150);
    expect(saldo(l, 'Sala 2', 16).machos).toBe(50);
    expect(l.avisos.map((a) => [a.tipo, a.texto, a.sala])).toEqual([
      ['cierre-sin-lote', 'Se cerró el lote AB en Sala 3 y ningún ingreso explica que estuviera allí.', 'Sala 3']]);
  });

  it('D14 · un TOTAL ignora la sala (si alguien la escribe en la hoja): cierra el lote entero', () => {
    const l = construirLibro({ ingresos: dosSalas(), cierres: [fin('2026-01-05', 'AB', 'Total', 200, 0, 'Pedido', 'Sala 2')], tanques: [] }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(0);
    expect(saldo(l, 'Sala 2', 16).machos).toBe(0);
    expect(l.avisos).toEqual([]);
    expect(dePos(l, 'AB').estado).toBe(ESTADO_CERRADO);
  });

  it('🔴 un cierre TOTAL anota LA DIFERENCIA y deja el lote a cero', () => {
    /* El corazón de la Fase 4B: lo que el libro creía que quedaba y no salió no se
       esconde ni bloquea — se anota. «La diferencia ES el producto». */
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 40)],
      cierres: [fin('2026-01-05', 'AB', 'Total', 90, 40)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1)).toMatchObject({ machos: 0, hembras: 0 });
    const dif = l.avisos.filter((a) => a.tipo === 'diferencia-cierre');
    expect(dif).toHaveLength(1);
    expect(dif[0].cantidad).toBe(10);      // los 10 machos que no salieron
    expect(dif[0].sexo).toBe('machos');
    expect(dePos(l, 'AB').estado).toBe(ESTADO_CERRADO);
  });

  it('un cierre TOTAL que cuadra no inventa ninguna diferencia', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 40)],
      cierres: [fin('2026-01-05', 'AB', 'Total', 100, 40)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(l.avisos).toEqual([]);
    expect(dePos(l, 'AB').estado).toBe(ESTADO_CERRADO);
  });

  it('un cierre TOTAL sin cifras convierte TODO lo vivo en diferencia', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 30, 20)],
      cierres: [fin('2026-01-05', 'AB', 'Total', 0, 0)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1)).toMatchObject({ machos: 0, hembras: 0 });
    expect(l.avisos.filter((a) => a.tipo === 'diferencia-cierre')).toHaveLength(2);   // ♂ y ♀
  });

  it('sacar MÁS de los que hay avisa, y no deja el saldo negativo', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
      cierres: [fin('2026-01-05', 'AB', 'Parcial', 25, 0)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(saldo(l, 'Sala 1', 1).machos).toBe(0);
    const d = l.avisos.filter((a) => a.tipo === 'deficit-cierre');
    expect(d).toHaveLength(1);
    expect(d[0].cantidad).toBe(15);
  });

  it('cerrar un lote que el libro no conoce se AVISA, no se inventa', () => {
    const l = construirLibro({
      ingresos: [],
      cierres: [fin('2026-01-05', 'ZZ', 'Total', 10, 10)],
      tanques: [],
    }, { hoy: '2026-01-10' });
    expect(l.avisos.map((a) => a.tipo)).toEqual(['cierre-sin-lote']);
  });

  it('🔴 el cierre va DESPUÉS de las bajas del día', () => {
    /* Fija la prioridad: ingreso → movimiento → baja → cierre. Si el cierre fuera antes,
       la mortalidad de hoy se repartiría sobre animales que ya se habían ido, y el cierre
       total anotaría una diferencia que en realidad eran los muertos de la mañana. */
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0)],
      cierres: [fin('2026-01-05', 'AB', 'Total', 95, 0)],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Machos muertos': 5 })],
    }, { hoy: '2026-01-10' });
    // 100 − 5 muertos = 95, y salen 95: cuadra exacto, sin diferencia.
    expect(l.avisos.filter((a) => a.tipo === 'diferencia-cierre')).toEqual([]);
    expect(saldo(l, 'Sala 1', 1).machos).toBe(0);
  });

  /* ⚠⚠ LAS TRES DE ABAJO NACEN DE UN DEFECTO REAL (2026-09-09), y son la MISMA familia que
     las cuatro de la cuarentena: al decidir el usuario que un 2.º ingreso reinicia el plazo
     se borró «copulaDesde» y se dejó «cerrado». Resultado medido: un lote cerrado en Total
     que vuelve a recibir animales quedaba CERRADO PARA SIEMPRE con vivos en el saldo — que
     es el estado que M19 de su propio banco declara inaceptable, sólo que por otra puerta.
     Y llegaba a producción: «estadoDeSala» devolvía «Cerrado», valor que el desplegable de
     Estado de «Maduración Sala» NO TIENE, así que la propuesta vaciaba la casilla en
     silencio y el operario la guardaba vacía.
     🔑 Ninguna prueba lo veía porque ninguna ejercía un lote cerrado que vuelve a entrar.
     Otra vez fixtures que no prueban nada, sobre lógica que se creía cubierta. */

  it('🔴 un lote CERRADO que vuelve a recibir animales deja de estar cerrado', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 100),
        ing('2026-03-01', 'AB', 'CG9', 'Sala 1', 2, 80, 80),   // el mismo código de lote, después del cierre
      ],
      cierres: [fin('2026-02-01', 'AB', 'Total', 100, 100)],
      tanques: [],
    }, { hoy: '2026-03-10' });
    const L = dePos(l, 'AB');
    expect(L.cerrado).toBe(null);                       // antes del arreglo: '2026-02-01'
    expect(L.machos).toBe(80);
    expect(L.estado).toBe(ESTADO_CUARENTENA);           // antes: ESTADO_CERRADO
  });

  it('🔴 ningún lote queda CERRADO y con animales vivos a la vez', () => {
    /* El invariante, dicho como invariante y no como caso: es lo que M19 protege por la
       puerta del cierre, y esta prueba lo protege por la del ingreso. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 100),
        ing('2026-03-01', 'AB', 'CG9', 'Sala 1', 2, 80, 80),
      ],
      cierres: [fin('2026-02-01', 'AB', 'Total', 100, 100)],
      tanques: [],
    }, { hoy: '2026-03-10' });
    for (const L of l.lotes.values()) {
      if (L.machos > 0 || L.hembras > 0) expect(L.estado).not.toBe(ESTADO_CERRADO);
    }
    /* Y la consecuencia que llegaba a la HOJA: el estado de la sala tiene que ser uno de
       los que el desplegable de «Maduración Sala» sabe guardar. */
    expect(estadoDeSala(l, 'Sala 1', '2026-03-10')).not.toBe(ESTADO_CERRADO);
  });

  it('pero un cierre POSTERIOR al re-ingreso SÍ vuelve a cerrar el lote', () => {
    /* El borrado no puede pasarse de listo: sólo anula los cierres ANTERIORES al último
       ingreso, igual que hace con la cópula. */
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 100),
        ing('2026-03-01', 'AB', 'CG9', 'Sala 1', 2, 80, 80),
      ],
      cierres: [
        fin('2026-02-01', 'AB', 'Total', 100, 100),
        fin('2026-03-05', 'AB', 'Total', 80, 80),
      ],
      tanques: [],
    }, { hoy: '2026-03-10' });
    const L = dePos(l, 'AB');
    expect(L.cerrado).toBe('2026-03-05');
    expect(L.estado).toBe(ESTADO_CERRADO);
    expect(L.machos).toBe(0);
  });
});

describe('Libro · el estado de la SALA', () => {
  const dosLotes = {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
      ing('2026-01-20', 'BC', 'CG2', 'Sala 1', 2, 10, 10),
    ],
    tanques: [],
  };

  it('con los dos lotes en el mismo estado, ése es el de la sala', () => {
    const l = construirLibro(dosLotes, { hoy: '2026-02-10' });
    expect(estadoDeSala(l, 'Sala 1', '2026-02-10')).toBe(ESTADO_PRODUCCION);
  });

  it('con lotes en estados distintos la sala es MIXTO, no uno de los dos', () => {
    // El usuario lo confirmó: «la sala está en dos estados». Elegir uno escondería el otro.
    const l = construirLibro(dosLotes, { hoy: '2026-01-25' });
    expect(estadoDeLote(l.lotes.get('AB'), '2026-01-25')).toBe(ESTADO_PRODUCCION);
    expect(estadoDeLote(l.lotes.get('BC'), '2026-01-25')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeSala(l, 'Sala 1', '2026-01-25')).toBe(ESTADO_MIXTO);
  });

  it('el desglose por lote se lee de un vistazo', () => {
    const l = construirLibro(dosLotes, { hoy: '2026-01-25' });
    expect(estadoPorLoteTexto(l, 'Sala 1', '2026-01-25')).toBe('AB: Producción · BC: Cuarentena');
  });

  /* ⚠⚠ SIN ESTA PRUEBA, quitarle a `estadoPorLoteTexto` su comprobación de vivos SOBREVIVE a
     la mutación, y lo comprobé: la de más abajo mira `estadoDeSala`, que tiene la suya. Dos
     funciones que comparten una regla necesitan DOS pruebas, o una de las dos se queda sin
     vigilar mientras el banco entero sale en verde. Encontrado el 2026-09-08 al cerrar la
     Fase 6, y es el mismo defecto que este proyecto ya tiene escrito en
     `feedback_fixtures-que-no-prueban-nada`. */
  it('el desglose tampoco cuenta un lote que se ha vaciado', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0),
        ing('2026-01-20', 'BC', 'CG2', 'Sala 1', 2, 10, 0),
      ],
      tanques: [tq('2026-01-21', 'Sala 1', 2, { 'Machos muertos': 10 })],   // BC se vacía
    }, { hoy: '2026-01-25' });
    expect(estadoPorLoteTexto(l, 'Sala 1', '2026-01-25')).toBe('AB: Producción');
  });

  /* ⚠ El orden es ALFABÉTICO, no de aparición, y hace falta un fixture donde los dos no
     coincidan para que la diferencia se note: aquí BC entra en el tanque 1 y AB en el 2, así
     que un desglose que respetara el orden de recorrido diría «BC: … · AB: …». Importa porque
     dos pantallas con el mismo dato en distinto orden hacen dudar de un número que es
     correcto. */
  it('el desglose va en orden alfabético, no de aparición', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 10, 0),
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 2, 10, 0),
      ],
    }, { hoy: '2026-01-25' });
    expect(estadoPorLoteTexto(l, 'Sala 1', '2026-01-25')).toBe('AB: Producción · BC: Producción');
  });

  it('un lote que ya no tiene animales vivos NO cuenta para el estado', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0),
        ing('2026-01-20', 'BC', 'CG2', 'Sala 1', 2, 10, 0),
      ],
      tanques: [tq('2026-01-21', 'Sala 1', 2, { 'Machos muertos': 10 })],   // BC se vacía
    }, { hoy: '2026-01-25' });
    expect(estadoDeSala(l, 'Sala 1', '2026-01-25')).toBe(ESTADO_PRODUCCION);
  });

  it('una sala sin nada no inventa estado', () => {
    expect(estadoDeSala(construirLibro({}), 'Sala 3', '2026-01-25')).toBe('');
  });
});


/* ══ 2026-09-14 (usuario) · ESTADOS DE SALA LIGADOS A LA DESINFECCIÓN ═══════════════════════════
   «Desinfección»: la sala no tiene animales. «Desinfección - Producción agrupada»: la sala SÍ los
   tiene, en producción, pero en pocos tanques y el resto vacío. Son estados de la SALA, no de un
   lote, así que viven en estadoDeSala.
   🔴🔴 Y una regla que salió de MEDIR: el 09-14 el libro sólo tenía ingresos de la Sala 4 y los
   operarios habían puesto «Producción» en las Salas 1, 2 y 5 — animales de antes del registro.
   Una sala que el libro nunca ha visto NO se declara vacía: lo propuesto se guarda en la hoja. */
describe('Libro · Desinfección de sala (2026-09-14)', () => {
  const HOY = '2026-02-10';                    // AB entró el 01-01: 40 días, en Producción
  const S2 = MAD_TANQUES_POR_SALA['Sala 2'];   // 16..21 (6 tanques)
  const S5 = MAD_TANQUES_POR_SALA['Sala 5'];   // 7..11 (5 tanques)
  const enTanques = (sala, tanques, fecha = '2026-01-01', lote = 'AB') =>
    tanques.map((t) => ing(fecha, lote, 'CG1', sala, t, 10, 10));

  it('los valores son los que pidió el usuario, y la regla de «pocos» es la mitad', () => {
    expect(ESTADO_DESINFECCION).toBe('Desinfección');
    expect(ESTADO_DESINFECCION_AGRUPADA).toBe('Desinfección - Producción agrupada');
    expect(AGRUPADA_MAX_FRACCION).toBe(0.5);
  });

  it('🔴 una sala que el libro conoce y se quedó SIN animales está en Desinfección', () => {
    const l = construirLibro({
      ingresos: enTanques('Sala 2', [16, 17]),
      cierres: [fin('2026-02-01', 'AB', 'Total', 20, 20)],
    }, { hoy: HOY });
    expect(estadoDeSala(l, 'Sala 2', HOY, S2)).toBe(ESTADO_DESINFECCION);
  });

  it('🔴🔴 una sala que el libro NUNCA ha visto no se declara vacía (medido el 09-14)', () => {
    const l = construirLibro({ ingresos: enTanques('Sala 4', [1, 2, 3, 4, 5, 6]) }, { hoy: HOY });
    expect(estadoDeSala(l, 'Sala 4', HOY, MAD_TANQUES_POR_SALA['Sala 4'])).toBe(ESTADO_PRODUCCION);
    expect(estadoDeSala(l, 'Sala 1', HOY, MAD_TANQUES_POR_SALA['Sala 1'])).toBe('');
    expect(ocupacionDeSala(l, 'Sala 1', MAD_TANQUES_POR_SALA['Sala 1']).conocida).toBe(false);
  });

  it('🔴 producción en la MITAD o menos de los tanques → agrupada; en más, Producción', () => {
    const tres = construirLibro({ ingresos: enTanques('Sala 2', [16, 17, 18]) }, { hoy: HOY });
    expect(estadoDeSala(tres, 'Sala 2', HOY, S2)).toBe(ESTADO_DESINFECCION_AGRUPADA);
    const cuatro = construirLibro({ ingresos: enTanques('Sala 2', [16, 17, 18, 19]) }, { hoy: HOY });
    expect(estadoDeSala(cuatro, 'Sala 2', HOY, S2)).toBe(ESTADO_PRODUCCION);
  });

  it('con un número IMPAR de tanques la frontera cae donde dice la regla (5 → 2 sí, 3 no)', () => {
    const dos = construirLibro({ ingresos: enTanques('Sala 5', [7, 8]) }, { hoy: HOY });
    expect(estadoDeSala(dos, 'Sala 5', HOY, S5)).toBe(ESTADO_DESINFECCION_AGRUPADA);
    const tres = construirLibro({ ingresos: enTanques('Sala 5', [7, 8, 9]) }, { hoy: HOY });
    expect(estadoDeSala(tres, 'Sala 5', HOY, S5)).toBe(ESTADO_PRODUCCION);
  });

  it('🔴 un tanque que se VACÍA pasa a contar como vacío', () => {
    const f = { ingresos: enTanques('Sala 2', [16, 17, 18, 19]) };
    expect(estadoDeSala(construirLibro(f, { hoy: HOY }), 'Sala 2', HOY, S2)).toBe(ESTADO_PRODUCCION);
    f.tanques = [tq('2026-02-01', 'Sala 2', 19, { 'Machos muertos': 10, 'Hembras muertas': 10 })];
    expect(estadoDeSala(construirLibro(f, { hoy: HOY }), 'Sala 2', HOY, S2)).toBe(ESTADO_DESINFECCION_AGRUPADA);
  });

  it('🔴 cuarentena y mixto NO se convierten en «Producción agrupada»', () => {
    const cuar = construirLibro({ ingresos: enTanques('Sala 2', [16], '2026-02-05') }, { hoy: HOY });
    expect(estadoDeSala(cuar, 'Sala 2', HOY, S2)).toBe(ESTADO_CUARENTENA);
    const mixto = construirLibro({
      ingresos: [...enTanques('Sala 2', [16]), ...enTanques('Sala 2', [17], '2026-02-05', 'BC')],
    }, { hoy: HOY });
    expect(estadoDeSala(mixto, 'Sala 2', HOY, S2)).toBe(ESTADO_MIXTO);
  });

  it('un tanque con DOS lotes cuenta una sola vez, y los tanques se cuentan sobre la lista física', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 10, 10), ing('2026-01-01', 'BC', 'CG2', 'Sala 2', 16, 10, 10)],
    }, { hoy: HOY });
    expect(ocupacionDeSala(l, 'Sala 2', S2)).toEqual({ conocida: true, ocupados: 1, total: 6 });
  });

  it('sin la lista física no se inventan tanques vacíos: sólo cuenta los que el libro conoce', () => {
    const l = construirLibro({ ingresos: enTanques('Sala 2', [16, 17]) }, { hoy: HOY });
    expect(ocupacionDeSala(l, 'Sala 2')).toEqual({ conocida: true, ocupados: 2, total: 2 });
    expect(estadoDeSala(l, 'Sala 2', HOY)).toBe(ESTADO_PRODUCCION);
  });

  it('una sala con animales pero sin estado deducible sigue sin estado (no es Desinfección)', () => {
    const l = construirLibro({ ingresos: enTanques('Sala 2', [16]) }, { hoy: HOY });
    expect(estadoDeSala(l, 'Sala 2', '', S2)).toBe('');
  });
});

describe('Libro · el nombre del tanque mezclado lo propone el sistema', () => {
  const mezclado = construirLibro({
    ingresos: [
      ing('2026-01-01', 'BC', 'CG2', 'Sala 2', 16, 10, 10),
      ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 10, 10),
    ],
  });

  it('junta los lotes vivos, siempre en el mismo orden', () => {
    // El orden fijo es el punto: en producción ya convive «BC/BA» tecleado a mano, y dos
    // grafías del mismo tanque parten los filtros.
    expect(nombreComposicion(saldo(mezclado, 'Sala 2', 16))).toBe('AB+BC');
  });

  it('con un solo lote es el nombre del lote', () => {
    const l = construirLibro({ ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 5, 5)] });
    expect(nombreComposicion(saldo(l, 'Sala 1', 1))).toBe('AB');
  });

  it('un lote ya vaciado deja de aparecer en el nombre', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 10, 0),
        ing('2026-01-01', 'BC', 'CG2', 'Sala 2', 16, 0, 0),   // entra vacío
      ],
    });
    expect(nombreComposicion(saldo(l, 'Sala 2', 16))).toBe('AB');
  });

  it('sin nada dentro, no hay nombre que inventar', () => {
    expect(nombreComposicion(undefined)).toBe('');
    expect(nombreComposicion({ composicion: [] })).toBe('');
  });
});

/* ══ 2026-09-14 (usuario) · UN LOTE PUEDE ESTAR EN VARIAS SALAS, Y UNA SALA TENER VARIOS LOTES ══════
   «Un lote puede estar en varias salas pero en distintos tanques, y a su vez en una misma sala
   pueden haber distintos lotes.» La cuarentena y la cópula se llevaban POR LOTE, sin sala: un segundo
   ingreso del lote en la Sala 2 devolvía a «Cuarentena» a la Sala 1 que llevaba un mes produciendo, y
   una cópula en la Sala 1 sacaba de cuarentena a la Sala 2. Y «🔄 Proponer estado» de Salas lo GUARDA.
   Ahora cada sala lleva la suya: el ingreso reinicia la cuarentena de su sala, la cópula la rompe en
   su sala, el cierre sigue siendo del lote entero, y lo que se mueve de sala lleva consigo su reloj.
   Cada fixture está hecho para que la regla vieja (por lote) dé otro resultado. */
describe('Libro · un lote en VARIAS salas: la cuarentena es de cada sala', () => {
  it('🔴 un segundo ingreso del lote en OTRA sala no devuelve a la primera a cuarentena', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10), ing('2026-01-20', 'AB', 'CG2', 'Sala 2', 16, 10, 10)],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 2 })],
    }, { hoy: '2026-01-21' });
    expect(estadoDeSala(l, 'Sala 1', '2026-01-21')).toBe(ESTADO_PRODUCCION);   // con la regla vieja: Cuarentena
    expect(estadoDeSala(l, 'Sala 2', '2026-01-21')).toBe(ESTADO_CUARENTENA);
    expect(estadoPorLoteTexto(l, 'Sala 1', '2026-01-21')).toBe('AB: Producción');
    expect(estadoPorLoteTexto(l, 'Sala 2', '2026-01-21')).toBe('AB: Cuarentena');
  });

  it('🔴 una cópula en una sala no saca de cuarentena al mismo lote en otra', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10), ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 10, 10)],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 3 })],
    }, { hoy: '2026-01-06' });
    expect(estadoDeSala(l, 'Sala 1', '2026-01-06')).toBe(ESTADO_PRODUCCION);
    expect(estadoDeSala(l, 'Sala 2', '2026-01-06')).toBe(ESTADO_CUARENTENA);    // con la regla vieja: Producción
    expect(estadoDeSala(l, 'Sala 2', '2026-01-16')).toBe(ESTADO_PRODUCCION);    // y sus 15 días le cuentan igual
  });

  it('🔴 lo que se mueve a una sala donde el lote no estaba lleva su reloj: ni se reinicia ni se pierde', () => {
    const f = {
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 100)],
      movimientos: [mov('2026-01-10', 'Sala 1', 1, 'Sala 2', 16, 40, 40)],
    };
    const l = construirLibro(f, { hoy: '2026-01-12' });
    expect(estadoDeSala(l, 'Sala 2', '2026-01-12')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeSala(l, 'Sala 2', '2026-01-16')).toBe(ESTADO_PRODUCCION);    // 15 días desde su INGRESO, no desde el movimiento
    const copulado = construirLibro(Object.assign({}, f, { tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 1 })] }), { hoy: '2026-01-11' });
    expect(estadoDeSala(copulado, 'Sala 2', '2026-01-11')).toBe(ESTADO_PRODUCCION);   // y su cópula viaja con ellos
  });

  it('🔴 si el lote ya estaba en la sala destino, manda la cuarentena que termina MÁS TARDE', () => {
    // Sala 2 produce desde el 01-04; llegan animales del MISMO lote que entraron el 01-20 a la Sala 1.
    const llegan = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 10, 10), ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 1, 50, 50)],
      tanques: [tq('2026-01-04', 'Sala 2', 16, { 'Cópulas': 2 })],
      movimientos: [mov('2026-01-22', 'Sala 1', 1, 'Sala 2', 17, 20, 20)],
    }, { hoy: '2026-01-23' });
    expect(estadoDeSala(llegan, 'Sala 2', '2026-01-23')).toBe(ESTADO_CUARENTENA);   // conservar la del destino: Producción
    // Y al revés: animales que ya producen llegan a una sala donde el lote está en cuarentena → sigue en cuarentena.
    const certificados = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 50, 50), ing('2026-01-20', 'AB', 'CG2', 'Sala 2', 16, 10, 10)],
      tanques: [tq('2026-01-04', 'Sala 1', 1, { 'Cópulas': 2 })],
      movimientos: [mov('2026-01-22', 'Sala 1', 1, 'Sala 2', 17, 20, 20)],
    }, { hoy: '2026-01-23' });
    expect(estadoDeSala(certificados, 'Sala 2', '2026-01-23')).toBe(ESTADO_CUARENTENA); // tomar la del origen: Producción
    expect(estadoDeSala(certificados, 'Sala 1', '2026-01-23')).toBe(ESTADO_PRODUCCION);
  });

  it('🔴 la sala nueva hereda el reloj de la sala de ORIGEN, no el del lote (que otro ingreso ya reinició)', () => {
    /* ⚠ Con el lote en una sola sala, «heredar» y «caer al reloj del lote» dan lo mismo, y la
       herencia podía desaparecer sin que nada lo notara. Aquí el lote tiene un segundo ingreso en
       la Sala 3: su reloj de lote dice cuarentena, pero lo que sale de la Sala 1 ya produce. */
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 50, 50), ing('2026-01-20', 'AB', 'CG2', 'Sala 3', 22, 10, 10)],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 2 })],
      movimientos: [mov('2026-01-22', 'Sala 1', 1, 'Sala 2', 16, 20, 20)],
    }, { hoy: '2026-01-23' });
    expect(estadoDeSala(l, 'Sala 2', '2026-01-23')).toBe(ESTADO_PRODUCCION);
    expect(estadoDeSala(l, 'Sala 3', '2026-01-23')).toBe(ESTADO_CUARENTENA);
  });

  it('🔴 «termina más tarde» cuenta la CÓPULA: unos que ya copularon no alargan la cuarentena de la sala', () => {
    // Sala 2: AB entró el 01-10 (cuarentena hasta el 01-25). Llegan de la Sala 1 animales que
    // entraron el 01-12 pero COPULARON el 01-14: su cuarentena terminó antes, así que manda la de la sala.
    const l = construirLibro({
      ingresos: [ing('2026-01-10', 'AB', 'CG1', 'Sala 2', 16, 10, 10), ing('2026-01-12', 'AB', 'CG2', 'Sala 1', 1, 30, 30)],
      tanques: [tq('2026-01-14', 'Sala 1', 1, { 'Cópulas': 1 })],
      movimientos: [mov('2026-01-16', 'Sala 1', 1, 'Sala 2', 17, 10, 10)],
    }, { hoy: '2026-01-17' });
    expect(estadoDeSala(l, 'Sala 2', '2026-01-17')).toBe(ESTADO_CUARENTENA);   // mirando sólo los 15 días: Producción
    expect(estadoDeSala(l, 'Sala 2', '2026-01-25')).toBe(ESTADO_PRODUCCION);
  });

  it('una cópula en la sala destino DESPUÉS de la llegada sí rompe esa cuarentena', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 16, 10, 10), ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 1, 50, 50)],
      tanques: [tq('2026-01-04', 'Sala 2', 16, { 'Cópulas': 2 }), tq('2026-01-24', 'Sala 2', 17, { 'Cópulas': 1 })],
      movimientos: [mov('2026-01-22', 'Sala 1', 1, 'Sala 2', 17, 20, 20)],
    }, { hoy: '2026-01-25' });
    expect(estadoDeSala(l, 'Sala 2', '2026-01-25')).toBe(ESTADO_PRODUCCION);
  });

  it('🔴 el estado del LOTE en el saldo: Mixto si sus salas no coinciden, con el desglose por sala', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10), ing('2026-01-20', 'AB', 'CG2', 'Sala 2', 16, 5, 5)],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 2 })],
    }, { hoy: '2026-01-21' });
    const L = dePos(l, 'AB');
    expect(L.estado).toBe(ESTADO_MIXTO);
    expect(L.salas).toEqual([
      { sala: 'Sala 1', ingreso: '2026-01-01', copulaDesde: '2026-01-05', machos: 10, hembras: 10, estado: ESTADO_PRODUCCION },
      { sala: 'Sala 2', ingreso: '2026-01-20', copulaDesde: null, machos: 5, hembras: 5, estado: ESTADO_CUARENTENA },
    ]);
  });

  it('🔴 una sala donde el lote ya no tiene animales no lo vuelve Mixto', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10), ing('2026-01-20', 'AB', 'CG2', 'Sala 2', 16, 10, 10)],
      tanques: [tq('2026-01-21', 'Sala 1', 1, { 'Machos muertos': 10, 'Hembras muertas': 10 })],   // la Sala 1 se vacía
    }, { hoy: '2026-01-22' });
    expect(dePos(l, 'AB').estado).toBe(ESTADO_CUARENTENA);
  });

  it('con el lote en UNA sola sala todo sigue igual: su estado es el de siempre', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 20), ing('2026-01-20', 'AB', 'CG2', 'Sala 1', 1, 30, 10)],
      tanques: [tq('2026-01-05', 'Sala 1', 1, { 'Cópulas': 4 })],
    }, { hoy: '2026-01-21' });
    const L = dePos(l, 'AB');
    expect(L.salas).toHaveLength(1);
    expect(L.estado).toBe(estadoDeLote(L, '2026-01-21'));
    expect(L.estado).toBe(ESTADO_CUARENTENA);
  });

  it('el CIERRE es del lote entero: cierra sus dos salas', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10), ing('2026-01-02', 'AB', 'CG1', 'Sala 2', 16, 10, 10)],
      cierres: [fin('2026-01-10', 'AB', 'Total', 20, 20)],
    }, { hoy: '2026-01-11' });
    expect(estadoDeLoteEnSala(dePos(l, 'AB'), 'Sala 1', '2026-01-11')).toBe(ESTADO_CERRADO);
    expect(estadoDeLoteEnSala(dePos(l, 'AB'), 'Sala 2', '2026-01-11')).toBe(ESTADO_CERRADO);
    expect(dePos(l, 'AB').estado).toBe(ESTADO_CERRADO);
  });

  it('estadoDeLoteEnSala: una sala que el lote no conoce cae al estado del lote', () => {
    const L = { ingreso: '2026-01-01', copulaDesde: null, cerrado: null, salas: [{ sala: 'Sala 1', ingreso: '2026-01-20', copulaDesde: null }] };
    expect(estadoDeLoteEnSala(L, 'Sala 1', '2026-01-21')).toBe(ESTADO_CUARENTENA);
    expect(estadoDeLoteEnSala(L, 'Sala 9', '2026-01-21')).toBe(ESTADO_PRODUCCION);
    expect(estadoDeLoteEnSala(undefined, 'Sala 1', '2026-01-21')).toBe('');
  });

  it('y en una MISMA sala, dos lotes siguen siendo Mixto con su desglose', () => {
    const l = construirLibro({
      ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10), ing('2026-01-20', 'BC', 'CG2', 'Sala 1', 2, 10, 10),
        ing('2026-01-20', 'AB', 'CG1', 'Sala 3', 22, 10, 10)],
    }, { hoy: '2026-01-25' });
    expect(estadoDeSala(l, 'Sala 1', '2026-01-25')).toBe(ESTADO_MIXTO);
    expect(estadoPorLoteTexto(l, 'Sala 1', '2026-01-25')).toBe('AB: Producción · BC: Cuarentena');
    expect(estadoPorLoteTexto(l, 'Sala 3', '2026-01-25')).toBe('AB: Cuarentena');
  });
});

describe('Libro · dos composiciones del mismo lote en un tanque', () => {
  it('se cuentan aparte pero suman al mismo lote', () => {
    const l = construirLibro({
      ingresos: [
        ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 60, 0),
        ing('2026-01-01', 'AB', 'CG2', 'Sala 1', 1, 40, 0),
      ],
      tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 10 })],
    });
    expect(l.posiciones).toHaveLength(2);
    expect(dePos(l, 'AB').machos).toBe(90);
    const porCg = Object.fromEntries(l.posiciones.map((p) => [p.codigoGenetico, p.machos]));
    expect(porCg).toEqual({ CG1: 54, CG2: 36 });   // 10 repartidos 60:40
  });
});

/* D13 (2026-09-14, usuario): dos lotes comparten TANQUE sólo en una mezcla o una agrupación. */
describe('Libro · D13 · dos lotes en un tanque sólo por mezcla o agrupación: se AVISA', () => {
  const libro = () => construirLibro({
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 30, 30),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 2, 20, 20),
      ing('2026-01-01', 'CD', 'CG3', 'Sala 1', 2, 5, 0),
      ing('2026-01-01', 'DE', 'CG4', 'Sala 1', 3, 10, 0),
    ],
    tanques: [tq('2026-01-02', 'Sala 1', 3, { 'Machos muertos': 10 })],   // el 3 queda VACÍO
  }, { hoy: '2026-01-05' });

  it('los lotes VIVOS de un tanque, ordenados; un tanque vacío o desconocido no tiene ninguno', () => {
    const l = libro();
    expect(lotesVivosEnTanque(l, 'Sala 1', 2)).toEqual(['BC', 'CD']);
    expect(lotesVivosEnTanque(l, 'Sala 1', '1')).toEqual(['AB']);
    expect(lotesVivosEnTanque(l, 'Sala 1', 3)).toEqual([]);
    expect(lotesVivosEnTanque(l, 'Sala 2', 16)).toEqual([]);
  });

  it('🔴 Ingreso: avisa por cada tanque con OTRO lote vivo, una vez por tanque; el propio lote y un tanque vacío no', () => {
    const ubic = [{ sala: 'Sala 1', tanque: '1' }, { sala: 'Sala 1', tanque: '2' }, { sala: 'Sala 1', tanque: 2 }, { sala: 'Sala 1', tanque: '3' }];
    expect(avisosIngresoCompartido(libro(), 'AB', ubic)).toEqual([
      'El tanque 2 de Sala 1 ya tiene animales vivos de los lotes BC, CD: el lote AB lo compartiría. Dos lotes sólo comparten tanque en una mezcla o una agrupación (🔄 Movimientos).',
    ]);
    expect(avisosIngresoCompartido(libro(), 'BC', ubic)).toEqual([
      'El tanque 1 de Sala 1 ya tiene animales vivos del lote AB: el lote BC lo compartiría. Dos lotes sólo comparten tanque en una mezcla o una agrupación (🔄 Movimientos).',
      'El tanque 2 de Sala 1 ya tiene animales vivos del lote CD: el lote BC lo compartiría. Dos lotes sólo comparten tanque en una mezcla o una agrupación (🔄 Movimientos).',
    ]);
    expect(avisosIngresoCompartido(libro(), '', ubic)).toEqual([]);
  });

  it('🔴 Transferencia: avisa si el destino tiene un lote que NO está en el origen; Mezcla y Agrupación no avisan', () => {
    const tramos = [
      { salaOrigen: 'Sala 1', tanqueOrigen: '1', salaDestino: 'Sala 1', tanqueDestino: '2' },   // AB → BC+CD: avisa
      { salaOrigen: 'Sala 1', tanqueOrigen: '2', salaDestino: 'Sala 1', tanqueDestino: '3' },   // a un vacío: no
      { salaOrigen: 'Sala 1', tanqueOrigen: '2', salaDestino: 'Sala 1', tanqueDestino: '2' },   // mismos lotes: no
      { salaOrigen: 'Sala 1', tanqueOrigen: '2', salaDestino: 'Sala 1', tanqueDestino: '1' },   // BC+CD → AB: avisa
      { salaOrigen: 'Sala 1', tanqueOrigen: '1', salaDestino: '', tanqueDestino: '' },          // incompleto: no
    ];
    expect(avisosTransferenciaCompartida(libro(), 'Transferencia', tramos)).toEqual([
      'Tramo 1: el tanque 2 de Sala 1 ya tiene animales vivos de los lotes BC, CD, que no están en el origen: la Transferencia los dejaría compartiendo tanque. Si se juntan lotes, el tipo es Mezcla o Agrupación.',
      'Tramo 4: el tanque 1 de Sala 1 ya tiene animales vivos del lote AB, que no está en el origen: la Transferencia los dejaría compartiendo tanque. Si se juntan lotes, el tipo es Mezcla o Agrupación.',
    ]);
    expect(avisosTransferenciaCompartida(libro(), 'Mezcla', tramos)).toEqual([]);
    expect(avisosTransferenciaCompartida(libro(), 'Agrupación', tramos)).toEqual([]);
  });
});
