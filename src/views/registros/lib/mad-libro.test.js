import { describe, it, expect } from 'vitest';
import {
  repartirProporcional,
  construirLibro,
  estadoDeLote,
  estadoDeSala,
  estadoPorLoteTexto,
  nombreComposicion,
  sumarDias,
  ubicKey,
  CUARENTENA_DIAS,
  ESTADO_CUARENTENA,
  ESTADO_PRODUCCION,
  ESTADO_MIXTO,
} from './mad-libro.js';

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

  it('sin fecha de ingreso no se inventa un estado', () => {
    expect(estadoDeLote({ ingreso: '', copulaDesde: null }, '2026-01-06')).toBe('');
    expect(estadoDeLote({ ingreso: '2026-01-01' }, '')).toBe('');
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
