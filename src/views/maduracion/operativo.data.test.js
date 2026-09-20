/* ============================================================
   MADURACIÓN · OPERATIVO — el modelo del tablero (Fase 0.2)

   Qué se exige, y con fixtures que distinguen lo correcto de lo equivocado:
   · El período por defecto son 30 días, hoy incluido (decisión del usuario).
   · La foto al día X no ve nada posterior a X; el estado REGISTRADO tampoco.
   · El estado PROPUESTO es el de «🔄 Proponer estado»: libro al cierre del día y tanques físicos (con su
     «agrupada»), y una sala que el libro no conoce no tiene propuesta.
   · Las Salas 4A y 4B no se muestran (decisión del usuario).
   · Los partes de Tanques se juntan con la regla de la ficha: se suman bajas, mudas y cópulas; los pesos se
     promedian sobre los partes que los traen (un vacío no es un cero).
   · 🔑 La serie diaria en UNA pasada da lo MISMO que reconstruir el libro día a día.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  PERIODO_DIAS, SALAS_VISIBLES, periodoPorDefecto, fuentesAlDia, soloSalasVisibles, frescura, estadoDeSalas,
  diasDeTanque, serieDiaria, opcionesDeFiltro, modeloOperativo, DIMENSIONES,
} from './operativo.data.js';
import { MAD_OP_HOJAS, MAD_OP_ORIGEN } from './operativo.fuentes.js';
/* D-3 · las sondas de `DIMENSIONES` viven al final del archivo; sus módulos son puros, como éste. */
import * as T from './operativo.tablero.js';
import * as BA from './operativo.bajas.js';
import * as RV from './operativo.revisiones.js';
import { construirLibro } from '../registros/lib/mad-libro.js';
import { diasEntre } from '../registros/lib/mad-resumen.js';

const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ Fecha: fecha, Lote: lote, 'Código genético': 'C1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, estado, extra) => ({ Fecha: fecha, Sala: sala, Estado: estado, ...extra });
const vacias = () => Object.fromEntries(MAD_OP_HOJAS.map((h) => [h.clave, []]));

describe('Maduración · operativo · período, foto y salas visibles', () => {
  it('el período por defecto son 30 días, hoy incluido, y cruza de mes', () => {
    expect(PERIODO_DIAS).toBe(30);
    const p = periodoPorDefecto('2026-09-19');
    expect(p).toEqual({ desde: '2026-08-21', hasta: '2026-09-19' });
    expect(diasEntre(p.desde, p.hasta)).toBe(29);
  });

  it('la foto al día X: entra X, no entra lo posterior; lo que no tiene fecha se queda (como en el libro)', () => {
    const f = { ...vacias(), tanques: [TQ('2026-09-18', 'Sala 1', 1), TQ('2026-09-19', 'Sala 1', 1), TQ('', 'Sala 1', 1)],
      broodstock: [{ 'Fecha de corte': '2026-09-12', Piscina: 9 }, { 'Fecha de corte': '2026-09-19', Piscina: 9 }] };
    const d = fuentesAlDia(f, '2026-09-18');
    expect(d.tanques.map((r) => r.Fecha)).toEqual(['2026-09-18', '']);
    expect(d.broodstock.map((r) => r['Fecha de corte'])).toEqual(['2026-09-12']);
  });

  it('las Salas 4A y 4B ya no se muestran: salen de la hoja Sala, y sólo de ella', () => {
    expect(SALAS_VISIBLES).toEqual(['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']);
    const f = { ...vacias(), sala: [SALA('2026-09-10', 'Sala 4A', 'Producción'), SALA('2026-09-10', 'Sala 4B', 'Producción'), SALA('2026-09-10', 'Sala 4', 'Producción')],
      tanques: [TQ('2026-09-10', 'Sala 4', 1)] };
    const { fuentes, excluidas } = soloSalasVisibles(f);
    expect(fuentes.sala.map((r) => r.Sala)).toEqual(['Sala 4']);
    expect(excluidas).toBe(2);
    expect(fuentes.tanques).toBe(f.tanques);
  });
});

describe('Maduración · operativo · frescura por hoja', () => {
  it('última fecha (la mayor, no la última fila), días hasta hoy, fechas futuras aparte; Broodstock por su corte', () => {
    const f = { ...vacias(),
      tanques: [TQ('2026-09-10', 'Sala 1', 1), TQ('2026-09-16', 'Sala 1', 1), TQ('2026-09-12', 'Sala 1', 1), TQ('2026-09-25', 'Sala 1', 1)],
      broodstock: [{ 'Fecha de corte': '2026-09-12' }] };
    const fr = Object.fromEntries(frescura(f, '2026-09-19').map((x) => [x.clave, x]));
    expect(fr.tanques).toMatchObject({ hoja: 'Maduración Tanques', filas: 4, ultima: '2026-09-16', dias: 3, futuras: 1 });
    expect(fr.broodstock).toMatchObject({ filas: 1, ultima: '2026-09-12', dias: 7 });
    expect(fr.ingresos).toMatchObject({ filas: 0, ultima: '', dias: '', futuras: 0 });
    expect(Object.keys(fr)).toHaveLength(10);
  });
});

describe('Maduración · operativo · el estado de cada sala, registrado y propuesto', () => {
  const FECHA = '2026-09-18';
  const f = { ...vacias(),
    ingresos: [
      ING('2026-09-10', 'AA', 'Sala 1', 1, 10, 10),                                     // 8 días: Cuarentena
      ...[16, 17, 18, 19].map((t) => ING('2026-08-01', 'BB', 'Sala 2', t, 10, 10)),     // 4 de 6 tanques: Producción
      ING('2026-08-01', 'CC', 'Sala 5', 7, 10, 10),                                      // 1 de 5 tanques: agrupada
      ING('2026-09-20', 'DD', 'Sala 4', 1, 10, 10),                                      // POSTERIOR a la foto
    ],
    sala: [
      SALA('2026-09-17', 'Sala 1', 'Producción'),
      SALA('2026-09-19', 'Sala 1', 'Cuarentena'),                                        // posterior: no cuenta
      SALA('2026-09-18', 'Sala 2', 'Producción', { 'Estado por lote': 'BB: Producción' }),
      SALA('2026-09-15', 'Sala 3', 'Producción'),
      SALA('2026-09-18', 'Sala 3', ''),                                                  // sin estado: no pisa el anterior
    ] };
  const porSala = Object.fromEntries(estadoDeSalas(f, FECHA).map((s) => [s.sala, s]));

  it('una fila por sala visible, en su orden', () => {
    expect(Object.keys(porSala)).toEqual(SALAS_VISIBLES);
  });

  it('🔴 el registrado no usa una fila posterior a la foto, y el propuesto sale del libro AL CIERRE del día', () => {
    expect(porSala['Sala 1'].registrado).toEqual({ estado: 'Producción', fecha: '2026-09-17', porLote: '' });
    expect(porSala['Sala 1'].propuesto.estado).toBe('Cuarentena');
    expect(porSala['Sala 1'].coinciden).toBe(false);
    expect(porSala['Sala 1'].desfaseDias).toBe(1);
    // DD entra el 20: la foto del 18 no lo ve, así que la Sala 4 no tiene nada que proponer.
    expect(porSala['Sala 4'].propuesto).toMatchObject({ estado: '', conocida: false });
  });

  it('coinciden cuando los dos dicen lo mismo, con el desglose y la ocupación FÍSICA', () => {
    expect(porSala['Sala 2'].registrado).toEqual({ estado: 'Producción', fecha: '2026-09-18', porLote: 'BB: Producción' });
    expect(porSala['Sala 2'].propuesto).toMatchObject({ estado: 'Producción', porLote: 'BB: Producción', ocupados: 4, total: 6 });
    expect(porSala['Sala 2'].coinciden).toBe(true);
    expect(porSala['Sala 2'].desfaseDias).toBe(0);
  });

  it('en producción con la mitad o menos de los tanques ocupados, lo propuesto es «agrupada» (como en la ficha)', () => {
    expect(porSala['Sala 5'].propuesto).toMatchObject({ estado: 'Desinfección - Producción agrupada', ocupados: 1, total: 5 });
  });

  it('si falta uno de los dos, no se compara (null), y un registro sin Estado no pisa el anterior', () => {
    expect(porSala['Sala 3'].registrado.estado).toBe('Producción');
    expect(porSala['Sala 3'].propuesto.estado).toBe('');
    expect(porSala['Sala 3'].coinciden).toBe(null);
    expect(porSala['Sala 5'].registrado.estado).toBe('');
    expect(porSala['Sala 5'].coinciden).toBe(null);
  });
});

describe('Maduración · operativo · los partes de Tanques en un registro por día', () => {
  it('suma bajas, mudas y cópulas; promedia los pesos sólo de los partes que los traen; junta observaciones', () => {
    const filas = [
      TQ('2026-09-17', 'Sala 1', 1, { Parte: 1, 'Machos muertos': 1, 'Hembras muertas': 2, 'Cópulas': 3, Muda: 4, 'Peso promedio machos (g)': 30,
        'Peso promedio hembras (g)': '', 'Observaciones sanitarias': 'Animales estresados', 'Observaciones operativas': 'En recambio' }),
      TQ('2026-09-17', 'Sala 1', 1, { Parte: 2, 'Machos muertos': 2, 'Hembras muertas': 0, 'Cópulas': '', Muda: 1, 'Peso promedio machos (g)': '',
        'Peso promedio hembras (g)': 40, 'Observaciones sanitarias': 'Animales estresados, Animales en muda' }),
      TQ('2026-09-17', 'Sala 1', 1, { Parte: 3, 'Machos muertos': '', 'Hembras muertas': 1, 'Peso promedio machos (g)': 34, 'Peso promedio hembras (g)': 44,
        'Machos muertos por descarte de selección': 2, 'Hembras muertas por descarte de selección': 1 }),
      TQ('2026-09-17', 'Sala 4', 1, { Parte: 1, 'Machos muertos': 5 }),   // el MISMO número de tanque en otra sala
    ];
    const dias = diasDeTanque(filas);
    expect(dias).toHaveLength(2);
    const d = dias.find((x) => x.sala === 'Sala 1');
    expect(d).toEqual({ fecha: '2026-09-17', sala: 'Sala 1', tanque: 1, partes: 3, machosMuertos: 3, hembrasMuertas: 3, machosDescarte: 2,
      hembrasDescarte: 1, copulas: 3, muda: 5, pesoMachos: 32, pesoHembras: 42,
      obsSanitarias: ['Animales estresados', 'Animales en muda'], obsOperativas: ['En recambio'] });
    expect(dias.find((x) => x.sala === 'Sala 4')).toMatchObject({ machosMuertos: 5, pesoMachos: '', pesoHembras: '' });
  });
});

describe('Maduración · operativo · la serie diaria del libro', () => {
  const f = { ...vacias(),
    ingresos: [ING('2026-09-01', 'AA', 'Sala 1', 1, 10, 20), ING('2026-09-05', 'BB', 'Sala 2', 16, 5, 10)],
    tanques: [TQ('2026-09-03', 'Sala 1', 1, { 'Hembras muertas': 4 })] };

  it('cada día es el cierre; un día sin eventos repite el anterior; antes del primero, cero', () => {
    const s = serieDiaria(f, '2026-08-31', '2026-09-06');
    expect(s.map((d) => d.fecha)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(s.map((d) => [d.total.machos, d.total.hembras])).toEqual([[0, 0], [10, 20], [10, 20], [10, 16], [10, 16], [15, 26], [15, 26]]);
    expect(s[3].porLote.AA).toMatchObject({ hembras: 16, muertos: { machos: 0, hembras: 4 }, ingresados: { machos: 10, hembras: 20 } });
    expect(s[5].porSala).toEqual({ 'Sala 1': { machos: 10, hembras: 16 }, 'Sala 2': { machos: 5, hembras: 10 } });
  });

  it('🔑 en UNA pasada da exactamente lo mismo que reconstruir el libro día a día', () => {
    for (const d of serieDiaria(f, '2026-08-31', '2026-09-06')) {
      const libro = construirLibro(f, { hoy: d.fecha, hasta: d.fecha });
      const lento = Object.fromEntries([...libro.lotes.values()].map((L) => [L.lote, [L.machos, L.hembras, L.muertos.hembras]]));
      const rapido = Object.fromEntries(Object.entries(d.porLote).map(([l, L]) => [l, [L.machos, L.hembras, L.muertos.hembras]]));
      expect(rapido, d.fecha).toEqual(lento);
    }
  });

  it('no ve lo posterior a su último día', () => {
    const s = serieDiaria(f, '2026-09-01', '2026-09-04');
    expect(s[s.length - 1].porLote.BB).toBeUndefined();
  });
});

describe('Maduración · operativo · filtros', () => {
  it('salas visibles con sus tanques físicos; lotes (orden natural) con sus códigos de Ingreso y Desoves', () => {
    const f = { ...vacias(),
      ingresos: [{ ...ING('2026-09-01', 'L10', 'Sala 1', 1, 1, 1), 'Código genético': 'B' }, { ...ING('2026-09-01', 'L2', 'Sala 1', 2, 1, 1), 'Código genético': 'A' }],
      desoves: [{ Fecha: '2026-09-05', Lote: 'L2', 'Código genético': 'C' }] };
    const o = opcionesDeFiltro(f);
    expect(o.salas).toEqual(SALAS_VISIBLES);
    expect(o.tanquesPorSala['Sala 5']).toEqual([7, 8, 9, 10, 11]);
    expect(o.lotes).toEqual(['L2', 'L10']);
    expect(o.codigosPorLote).toEqual({ L2: ['A', 'C'], L10: ['B'] });
  });

  it('cada hoja declara qué filtros admite: un desove no es de un tanque', () => {
    expect(Object.keys(DIMENSIONES).sort()).toEqual(MAD_OP_HOJAS.map((h) => h.clave).sort());
    expect(DIMENSIONES.desoves).not.toContain('tanque');
    expect(DIMENSIONES.desoves).not.toContain('sala');
    expect(DIMENSIONES.tanques).not.toContain('lote');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   D-3 (2026-09-20) · `DIMENSIONES` ES LA CONDUCTA, NO UN COMENTARIO LARGO.

   El catálogo declara qué filtros admite cada hoja, y hasta hoy NADIE lo leía en tiempo de
   ejecución: cada consumidor implementaba su regla por su cuenta —`kpiReproduccion` mira `F.lote` y
   `F.codigo` y nada más, `bajasPorHora` mira `F.sala` y `F.tanque`— y la única prueba que tenía
   comparaba el catálogo contra las claves de `MAD_OP_HOJAS`, o sea CONTRA SÍ MISMO. Describía bien lo
   que pasaba, y podía dejar de describirlo sin que nada avisara.
   Aquí se ata a lo que de verdad ocurre: para cada hoja con un consumidor filtrable, un filtro que el
   catálogo NO declara no puede cambiar su resultado, y uno que SÍ declara tiene que poder cambiarlo.
   La segunda mitad importa tanto como la primera: sin ella, un catálogo que declarara dimensiones de
   adorno pasaría igual.

   ⚠ NO TODAS SE PUEDEN PROBAR ASÍ, y se dice cuáles y por qué en vez de fingir cobertura. Cinco hojas
   no tienen un consumidor que reciba el filtro: sus filas alimentan el LIBRO, y el filtrado ocurre
   después sobre las posiciones que el libro produce. La guarda de abajo exige que cada hoja del
   catálogo esté en UNO de los dos grupos: una hoja nueva que no entre en ninguno pone esto rojo, que
   es cuando hay que decidir en cuál va — y no meses después.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const DIMS = ['sala', 'tanque', 'lote', 'codigo'];

/* Valores que EXISTEN en el fixture de abajo, para que un filtro pueda cambiar algo. */
const VALOR = { sala: 'Sala 1', tanque: 1, lote: 'L1', codigo: 'C1' };

const FIL = (d) => ({ sala: null, tanque: null, lote: null, codigo: null, ...(d || {}) });
const P = { desde: '2026-09-01', hasta: '2026-09-30' };

const FIXTURE = () => ({
  ...vacias(),
  desoves: [
    { Fecha: '2026-09-10', Lote: 'L1', 'Código genético': 'C1', Desoves: 3, 'Total de huevos': 300, 'Hembras no viables': 1, N2: 200, N5: 150 },
    { Fecha: '2026-09-11', Lote: 'L2', 'Código genético': 'C2', Desoves: 5, 'Total de huevos': 500, 'Hembras no viables': 0, N2: 400, N5: 320 },
  ],
  mortDesove: [
    { Fecha: '2026-09-10', Lote: 'L1', 'Tipo de tanque': 'Desove', 'Hembras que entran': 20, 'Hembras muertas': 2 },
    { Fecha: '2026-09-11', Lote: 'L2', 'Tipo de tanque': 'Recuperación', 'Hembras que entran': 30, 'Hembras muertas': 1 },
  ],
  cierres: [
    { Fecha: '2026-09-12', Lote: 'L1', Sala: 'Sala 1', Tipo: 'Total', Motivo: 'Pedido', Machos: 5, Hembras: 7, Rojos: 0 },
    { Fecha: '2026-09-13', Lote: 'L2', Sala: 'Sala 2', Tipo: 'Parcial', Motivo: 'Otro', Machos: 1, Hembras: 2, Rojos: 0 },
  ],
  tanques: [
    TQ('2026-09-10', 'Sala 1', 1, { Hora: '06:00', 'Machos muertos': 2, 'Hembras muertas': 1 }),
    TQ('2026-09-11', 'Sala 2', 4, { Hora: '18:00', 'Machos muertos': 3, 'Hembras muertas': 0 }),
  ],
});

/* Hojas con un consumidor que RECIBE el filtro. La firma no es uniforme a propósito —cada una nació
   con la suya— así que cada sonda la adapta aquí, junto a la aserción que la usa. */
const SONDAS = {
  desoves: (f, F) => T.kpiReproduccion(f.desoves, P, F),
  mortDesove: (f, F) => RV.mortalidadEnDesove(f, F, P),
  cierres: (f, F) => BA.motivosDeCierre(f, P, F),
  tanques: (f, F) => BA.bajasPorHora(f, P, F),
};

/* Hojas SIN consumidor filtrable, con el motivo. No es una excusa: es lo que hay que cambiar el día
   que alguien les dé uno. */
const SIN_SONDA = {
  ingresos: 'sus filas alimentan el LIBRO; el filtro actúa después, sobre las posiciones',
  movimientos: 'ídem: el libro las consume y ninguna función las filtra por sí sola',
  tratamientos: '`diasDesdeDesinfeccion(filasTrat, salas, hoy)` no recibe filtro',
  alimentacion: '`alimentoPorMillonN5(filasAlim, filasDesoves, desde, hasta)` no recibe filtro',
  broodstock: '`desempenoPorOrigen(fuentes, posiciones, dimension)` agrupa, no filtra',
  sala: 'la filtra `tarjetasDeSalas(M, F)`, que necesita el modelo entero, no sus filas',
};

describe('Maduración · operativo · DIMENSIONES es la conducta, no un comentario', () => {
  it('cada hoja del catálogo está sondada o declarada sin sonda, y ninguna en las dos', () => {
    const sondadas = Object.keys(SONDAS);
    const sinSonda = Object.keys(SIN_SONDA);
    expect(sondadas.filter((h) => sinSonda.includes(h)), 'una hoja en los dos grupos').toEqual([]);
    expect([...sondadas, ...sinSonda].sort()).toEqual(Object.keys(DIMENSIONES).sort());
  });

/* Lo que se compara son los DATOS, no el acuse de recibo. Varias sondas devuelven además `ignora`
   con los filtros que no les aplican —«un desove no es de una sala: se ignora y se DICE»—, así que
   el resultado SÍ cambia al pasarles uno, y cambia porque están haciendo lo correcto. */
const datos = (r) => { const { ignora, ...resto } = r || {}; void ignora; return JSON.stringify(resto); };

/* Discrepancias DECLARADAS: una dimensión que el catálogo anuncia y ningún consumidor aplica todavía.
   Se dejan aquí, no escondidas — mientras estén, la prueba pasa; en cuanto alguien implemente el
   filtro o retire la dimensión, esto se pone rojo y obliga a quitar la excepción.
   🔑 HOY ESTÁ VACÍO, y eso es un resultado, no un descuido: la única que hubo —`cierres/sala`, que
   esta prueba destapó en su primera corrida el 2026-09-20— se cerró retirando la dimensión del
   catálogo (ver el comentario en `DIMENSIONES`). El mecanismo se conserva porque el hallazgo demostró
   que estas cosas pasan, y la próxima merece salir declarada en vez de silenciada. */
const DISCREPANCIAS = {};

for (const [hoja, sonda] of Object.entries(SONDAS)) {
  const admite = DIMENSIONES[hoja];
  const noAdmite = DIMS.filter((x) => !admite.includes(x));

  describe(`DIMENSIONES · ${hoja} declara [${admite.join(', ')}]`, () => {
    it(`los que NO declara (${noAdmite.join(', ')}) no cambian sus DATOS`, () => {
      const f = FIXTURE();
      const base = datos(sonda(f, FIL()));
      for (const d of noAdmite) {
        expect(datos(sonda(f, FIL({ [d]: VALOR[d] }))), hoja + ' cambió sus datos al filtrar por ' + d
          + ', que su catálogo NO declara').toBe(base);
      }
    });

    it(`los que SÍ declara (${admite.join(', ')}) cambian sus DATOS`, () => {
      const f = FIXTURE();
      const base = datos(sonda(f, FIL()));
      for (const d of admite) {
        const motivo = DISCREPANCIAS[hoja + '/' + d];
        const cambia = datos(sonda(f, FIL({ [d]: VALOR[d] }))) !== base;
        if (motivo) {
          expect(cambia, 'la discrepancia declarada «' + hoja + '/' + d + '» YA NO EXISTE: quítala de '
            + 'DISCREPANCIAS. ' + motivo).toBe(false);
          continue;
        }
        expect(cambia, hoja + ' NO reaccionó a ' + d + ', que su catálogo declara: o la regla se '
          + 'perdió, o el catálogo declara de adorno').toBe(true);
      }
    });
  });
}

it('las discrepancias declaradas nombran una hoja y una dimensión que existen', () => {
  // Una discrepancia que apunte a algo que ya no está sería una excepción que no excusa nada.
  for (const clave of Object.keys(DISCREPANCIAS)) {
    const [hoja, dim] = clave.split('/');
    expect(SONDAS[hoja], clave + ': esa hoja no tiene sonda').toBeTypeOf('function');
    expect(DIMENSIONES[hoja], clave + ': el catálogo ya no declara esa dimensión').toContain(dim);
  }
});

  it('el fixture ejerce algo: sin filtro las cuatro sondas devuelven datos', () => {
    // Comparar dos resultados VACÍOS es igual a comparar dos llenos, y pasaría siempre.
    const f = FIXTURE();
    expect(T.kpiReproduccion(f.desoves, P, FIL()).desoves).toBeGreaterThan(0);
    expect(RV.mortalidadEnDesove(f, FIL(), P).entran).toBeGreaterThan(0);
    expect(BA.motivosDeCierre(f, P, FIL()).filas.length).toBeGreaterThan(0);
    expect(BA.bajasPorHora(f, P, FIL()).horas.length).toBeGreaterThan(0);
  });
});

describe('Maduración · operativo · el modelo entero desde el store', () => {
  it('del export crudo al modelo: fuentes, 4A fuera, frescura, resumen y salas a la fecha de la foto', () => {
    const fila = (o) => ({ _SheetOrigin: MAD_OP_ORIGEN, ...o });
    const store = [
      fila({ Fecha: '2026-09-10', Lote: 'AA', 'Código genético': 'C1', 'Camaronera origen': 'X', Sala: 'Sala 1', Tanque: '1', Machos: '10', Hembras: '10' }),
      fila({ Fecha: '17/09/2026', Sala: 'Sala 1', Estado: 'Producción', 'Temperatura 2:00': '27.5' }),
      fila({ Fecha: '17/09/2026', Sala: 'Sala 4A', Estado: 'Producción', 'Temperatura 2:00': '26' }),
      fila({ Fecha: '16/09/2026', Sala: 'Sala 1', Tanque: '1', 'Machos muertos': '1' }),
      { _SheetOrigin: 'Larvicultura', Fecha: '17/09/2026' },
    ];
    const m = modeloOperativo(store, { hoy: '2026-09-18' });
    expect(m.fecha).toBe('2026-09-18');
    expect(m.periodo).toEqual({ desde: '2026-08-20', hasta: '2026-09-18' });
    expect(m.salasExcluidas).toBe(1);
    expect(m.sinHoja).toBe(0);
    expect(m.resumen.salas.map((s) => s.sala)).toEqual(['Sala 1']);
    expect(m.resumen.salas[0].temp.prom).toBe(27.5);
    expect(m.resumen.lotes.map((l) => [l.lote, l.machos, l.hembras])).toEqual([['AA', 9, 10]]);
    expect(m.salas.find((s) => s.sala === 'Sala 1')).toMatchObject({ registrado: { estado: 'Producción' }, propuesto: { estado: 'Cuarentena' }, coinciden: false });
    expect(m.frescura.find((x) => x.clave === 'tanques').ultima).toBe('2026-09-16');
    expect(m.filtros.lotes).toEqual(['AA']);
  });

  it('🔑 el libro del modelo es el del CIERRE de la foto, y es el mismo con que se proponen los estados de sala', () => {
    const fila = (o) => ({ _SheetOrigin: MAD_OP_ORIGEN, ...o });
    const store = [
      fila({ Fecha: '01/09/2026', Lote: 'AA', 'Código genético': 'C1', 'Camaronera origen': 'X', Sala: 'Sala 1', Tanque: '1', Machos: '10', Hembras: '10' }),
      fila({ Fecha: '15/09/2026', Lote: 'DD', 'Código genético': 'C1', 'Camaronera origen': 'X', Sala: 'Sala 4', Tanque: '1', Machos: '5', Hembras: '5' }),
    ];
    const m = modeloOperativo(store, { hoy: '2026-09-20', fecha: '2026-09-12' });
    expect([...m.libro.lotes.keys()]).toEqual(['AA']);                  // DD entra DESPUÉS de la foto
    expect(m.libro.lotes.get('AA').estado).toBe('Cuarentena');           // 11 días en la foto; con los 19 de hoy, Producción
    expect(m.salas.find((s) => s.sala === 'Sala 1').propuesto.estado).toBe('Cuarentena');
    expect(m.salas.find((s) => s.sala === 'Sala 4').propuesto.estado).toBe('');
  });

  it('con una foto en el pasado, el resumen es el de ESE día', () => {
    const fila = (o) => ({ _SheetOrigin: MAD_OP_ORIGEN, ...o });
    const store = [
      fila({ Fecha: '2026-09-10', Lote: 'AA', 'Código genético': 'C1', 'Camaronera origen': 'X', Sala: 'Sala 1', Tanque: '1', Machos: '10', Hembras: '10' }),
      fila({ Fecha: '16/09/2026', Sala: 'Sala 1', Tanque: '1', 'Machos muertos': '4' }),
    ];
    const antes = modeloOperativo(store, { hoy: '2026-09-18', fecha: '2026-09-12' });
    expect(antes.resumen.lotes.map((l) => [l.lote, l.machos])).toEqual([['AA', 10]]);
    const ahora = modeloOperativo(store, { hoy: '2026-09-18' });
    expect(ahora.resumen.lotes.map((l) => [l.lote, l.machos])).toEqual([['AA', 6]]);
  });
});
