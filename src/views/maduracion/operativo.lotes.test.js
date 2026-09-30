/* ============================================================
   MADURACIÓN · OPERATIVO — LOTES (F2.1)

   Qué se exige, y con fixtures que distinguen lo correcto de lo equivocado (si la regla se rompe, alguna se pone
   roja: cada una está montada para que el valor equivocado dé OTRO número, no el mismo):
   · La cascada CUADRA en un lote que ha desovado. QE tiene 5 hembras muertas en tanques de desove, y ésas YA están
     dentro de `muertos`: restarlas otra vez daría 128 en vez de 133 y la prueba se pondría roja.
   · 🔴 0t·9 (2026-09-29, usuario): lo que declara Fin de Ciclo es SÓLO REGISTRO y NO se resta: los animales salen
     por los partes de Tanques (aquí, el descarte de selección del mismo día). Restarlo daría el doble: QE quedaría en
     113 y no en 133. Lo registrado se enseña aparte (`registradoFin`), fuera de la cascada. A QF le registraron 15
     machos y sólo tenía 10: ya no hay «déficit» que decir; lo registrado se enseña tal cual.
   · Un cierre TOTAL deja su DIFERENCIA y el lote sigue en la tabla, cerrado y a cero (QG).
   · El reparto de un tanque COMPARTIDO es proporcional (QH y QI, mitad y mitad), y un lote con DOS códigos
     genéticos en un tanque suyo se queda el tanque ENTERO (QJ): acumulando mal, su parte sería 0,5 y sus cópulas
     la mitad.
   · La fertilidad, sólo sobre los huevos que llegaron a tener N2; N5 no se compara con N2.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  CUADRE_FILAS, loteDelLibro, cuadreDeLote, estadoDeLoteEntero, tablaDeLotes, origenDeLote,
  curvaDeLote, eventosDeLote, reproduccionDeLote, promediosDeLote, fichaDeLote,
  DIMENSIONES_COMPARATIVA, comparativa, desempenoPorPiscina,
} from './operativo.lotes.js';
import { modeloOperativo, serieDiaria } from './operativo.data.js';
import { normalizarFiltro, periodoDe, cicloDelLote, indiceDeFiltro } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { ESTADO_CERRADO, sumarDias } from '../registros/lib/mad-libro.js';
import { presenciaDiaria } from './operativo.tendencias.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA', piscina = 'P1') => ({ _SheetOrigin: O,
  'Camaronera origen': 'CX', Fecha: fecha, Lote: lote, 'Código genético': cg, 'Piscina Broodstock': piscina,
  Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const FIN = (fecha, lote, tipo, machos, hembras) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '', Fecha: fecha,
  Lote: lote, Tipo: tipo, Machos: machos, Hembras: hembras });
const MORT = (fecha, lote, clase, entran, muertas) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Tipo de tanque': clase, 'Hembras que entran': entran, 'Hembras muertas': muertas });
const DES = (fecha, lote, desoves, huevos, n2, n5) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote,
  'Código genético': 'CA', Desoves: desoves, 'Total de huevos': huevos, N2: n2, N5: n5 });

const FOTO = '2026-09-19';

/* La planta de las pruebas, toda en la Sala 3, al cierre del 19/09:
   · t1 QE  — 100♂ 100♀ el 01/09. Muertes y descartes el 05/09, 5 hembras muertas desovando el 10/09
              y, el 15/09, un descarte de 20/20 en el parte y su cierre PARCIAL de 20/20 (sólo registro).  → 66♂ 67♀
   · t2 QF  —  10♂  10♀ el 02/09; el 16/09 el parte descarta sus 10 machos y el cierre PARCIAL registra 15. → 0♂ 10♀
   · t3 QG  —  30♂  30♀ el 03/09; el 17/09 el parte descarta 20/20 y un cierre TOTAL cierra el lote: quedan 10/10
              de DIFERENCIA. → cerrado, a cero
   (0t·9: hasta el 2026-09-29 los cierres DESCONTABAN y la planta no tenía esos tres partes de descarte.)
   · t4 QH y QI — 20♂ 20♀ cada uno el 04/09: se reparten el tanque a medias.
   · t5 QJ  — el MISMO lote con dos códigos genéticos (10♂ 10♀ cada uno): el tanque es suyo entero. */
const PLANTA = [
  ING('2026-09-01', 'QE', 'Sala 3', 1, 100, 100, 'CA', 'P1'),
  TQ('2026-09-05', 'Sala 3', 1, { 'Machos muertos': 10, 'Hembras muertas': 6,
    'Machos muertos por descarte de selección': 4, 'Hembras muertas por descarte de selección': 2 }),
  MORT('2026-09-10', 'QE', 'Desove', 30, 5),
  TQ('2026-09-15', 'Sala 3', 1, { 'Machos muertos por descarte de selección': 20, 'Hembras muertas por descarte de selección': 20 }),
  FIN('2026-09-15', 'QE', 'Parcial', 20, 20),
  DES('2026-09-12', 'QE', 4, 400000, 340000, 0),
  DES('2026-09-14', 'QE', 2, 200000, 0, 180000),

  ING('2026-09-02', 'QF', 'Sala 3', 2, 10, 10, 'CB', 'P2'),
  TQ('2026-09-16', 'Sala 3', 2, { 'Machos muertos por descarte de selección': 10 }),
  FIN('2026-09-16', 'QF', 'Parcial', 15, 0),

  ING('2026-09-03', 'QG', 'Sala 3', 3, 30, 30, 'CB', 'P2'),
  TQ('2026-09-17', 'Sala 3', 3, { 'Machos muertos por descarte de selección': 20, 'Hembras muertas por descarte de selección': 20 }),
  FIN('2026-09-17', 'QG', 'Total', 20, 20),

  ING('2026-09-04', 'QH', 'Sala 3', 4, 20, 20, 'CA', 'P1'),
  ING('2026-09-04', 'QI', 'Sala 3', 4, 20, 20, 'CA', 'P3'),
  TQ('2026-09-17', 'Sala 3', 4, { 'Cópulas': 6 }),
  TQ('2026-09-18', 'Sala 3', 4, { 'Cópulas': 10, Muda: 8, 'Peso promedio machos (g)': 30, 'Peso promedio hembras (g)': 40 }),

  ING('2026-09-04', 'QJ', 'Sala 3', 5, 10, 10, 'CA', 'P1'),
  ING('2026-09-04', 'QJ', 'Sala 3', 5, 10, 10, 'CB', 'P1'),
  TQ('2026-09-18', 'Sala 3', 5, { 'Cópulas': 12, Muda: 6, 'Peso promedio machos (g)': 20, 'Peso promedio hembras (g)': 50 }),
];

const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const SERIE = serieDiaria(M.fuentes, P30.desde, P30.hasta);
const SIN = normalizarFiltro({});
const PRES = presenciaDiaria(M.fuentes, sumarDias(P30.desde, -1), P30.hasta);
const F = (o) => normalizarFiltro(o);

describe('Maduración · lotes · la cascada del cuadre', () => {
  it('las filas van en su orden, con su signo, y «vivos» es el resultado', () => {
    // 0t·9: «Salidas (Fin de Ciclo)» ya no es un término de la resta: lo registrado se enseña aparte.
    expect(CUADRE_FILAS.map((f) => f.id)).toEqual(['ingresados', 'muertos', 'descartes', 'diferencia', 'vivos']);
    expect(CUADRE_FILAS.map((f) => f.signo)).toEqual(['+', '−', '−', '−', '=']);
  });

  it('🔴 un lote que DESOVÓ cuadra: la mortalidad en desove ya está dentro de «muertos» y no se resta otra vez', () => {
    const c = cuadreDeLote(M.libro, M.fuentes, 'QE');
    expect(c.ingresados).toEqual({ machos: 100, hembras: 100, total: 200 });
    // 10 machos y 6 hembras de las bajas del tanque, MÁS las 5 hembras que murieron desovando.
    expect(c.muertos).toEqual({ machos: 10, hembras: 11, total: 21 });
    // 4/2 de las bajas del 05/09 y 20/20 del parte del 15/09 (lo que salió con el cierre Parcial).
    expect(c.descartes).toEqual({ machos: 24, hembras: 22, total: 46 });
    expect(c.diferencia).toEqual({ machos: 0, hembras: 0, total: 0 });
    expect(c.vivos).toEqual({ machos: 66, hembras: 67, total: 133 });
    // 200 − 21 − 46 = 133. Restando las 5 de desove otra vez darían 128, y restando también lo registrado en Fin de
    // Ciclo, 93: las dos se pondrían rojas.
    expect(c.cuadra).toBe(true);
    expect(c.descuadre).toEqual({ machos: 0, hembras: 0, total: 0 });
    // Y se enseñan como «de los cuales», con las que entraron a desovar.
    expect(c.deLosCuales.desove).toEqual({ entran: 30, muertas: 5 });
    expect(c.deLosCuales.recuperacion).toEqual({ entran: 0, muertas: 0 });
    // Lo registrado en Fin de Ciclo va APARTE: informa, no resta.
    expect(c.registradoFin).toEqual({ machos: 20, hembras: 20, total: 40, cierres: 1 });
    expect(c).not.toHaveProperty('salidas');
    expect(c).not.toHaveProperty('deficit');
  });

  it('🔴 0t·9 · lo REGISTRADO en Fin de Ciclo no se resta: aunque diga más de lo que había, el lote cuadra con sus partes', () => {
    const c = cuadreDeLote(M.libro, M.fuentes, 'QF');
    // El cierre registró 15 machos y el parte descartó los 10 que había: el libro no resta los 15 (antes, «déficit 5»).
    expect(c.registradoFin).toEqual({ machos: 15, hembras: 0, total: 15, cierres: 1 });
    expect(c.descartes).toEqual({ machos: 10, hembras: 0, total: 10 });
    expect(c.vivos).toEqual({ machos: 0, hembras: 10, total: 10 });
    expect(c.cuadra).toBe(true);
  });

  it('🔴 sólo los avisos de DIFERENCIA de cierre son diferencia: un déficit de mortalidad en desove no lo es', () => {
    /* 0t·9: hasta ese día esta regla la ejercía el `deficit-cierre` de QF; sin él, ningún aviso con lote de la planta la
       distinguía (L21 sobrevivía). Aquí murieron 8 hembras desovando de 5 que había: el libro anota `deficit-mortdes` de 3
       con el lote, y contarlo como diferencia descuadraría un lote que cuadra. */
    const mini = modeloOperativo([
      ING('2026-09-01', 'QT', 'Sala 3', 6, 0, 5),
      MORT('2026-09-10', 'QT', 'Desove', 8, 8),
    ], { hoy: FOTO, fecha: FOTO });
    expect(mini.libro.avisos.map((a) => [a.tipo, a.lote, a.cantidad])).toEqual([['deficit-mortdes', 'QT', 3]]);
    const c = cuadreDeLote(mini.libro, mini.fuentes, 'QT');
    expect(c.diferencia).toEqual({ machos: 0, hembras: 0, total: 0 });
    expect(c.cuadra).toBe(true);
  });

  it('un cierre TOTAL deja su diferencia, y con ella el lote cuadra a cero', () => {
    const c = cuadreDeLote(M.libro, M.fuentes, 'QG');
    expect(c.ingresados.total).toBe(60);
    expect(c.descartes).toEqual({ machos: 20, hembras: 20, total: 40 });
    expect(c.diferencia).toEqual({ machos: 10, hembras: 10, total: 20 });
    expect(c.registradoFin).toEqual({ machos: 20, hembras: 20, total: 40, cierres: 1 });
    expect(c.vivos.total).toBe(0);
    expect(c.cuadra).toBe(true);
  });

  it('🔴 y cuando NO cuadra lo dice: `cuadra` compara los dos lados, no es una resta que siempre da cero', () => {
    /* Un libro a mano cuyos términos NO concuerdan: 100 entraron, 10 murieron y quedan 80. Faltan 10.
       Si `cuadra` se escribiera como `true` o se derivara de la propia resta, esto seguiría en verde. */
    const libro = { avisos: [], lotes: new Map([['QZ', { lote: 'QZ', machos: 40, hembras: 40,
      ingresados: { machos: 50, hembras: 50 }, muertos: { machos: 5, hembras: 5 }, descartes: { machos: 0, hembras: 0 },
      mortDesove: { entran: 0, muertas: 0 }, mortRecuperacion: { entran: 0, muertas: 0 } }]]) };
    const c = cuadreDeLote(libro, { cierres: [] }, 'QZ');
    expect(c.cuadra).toBe(false);
    expect(c.descuadre).toEqual({ machos: 5, hembras: 5, total: 10 });
  });

  it('el lote se busca por su forma canónica, y un lote que el libro no conoce da null', () => {
    expect(cuadreDeLote(M.libro, M.fuentes, ' qe ').lote).toBe('QE');
    expect(loteDelLibro(M.libro, 'qe').lote).toBe('QE');
    /* 🔴 Y no basta con ENCONTRARLO: `loteDelLibro` normaliza por su cuenta, así que un lote sin normalizar lo
       hallaría igual, pero sus CIERRES y sus AVISOS se comparan contra la clave y se quedarían a cero en silencio.
       Por eso se exige la cascada ENTERA, no sólo el nombre. */
    expect(cuadreDeLote(M.libro, M.fuentes, ' qe ')).toEqual(cuadreDeLote(M.libro, M.fuentes, 'QE'));
    expect(cuadreDeLote(M.libro, M.fuentes, ' qf ').registradoFin).toEqual({ machos: 15, hembras: 0, total: 15, cierres: 1 });
    expect(cuadreDeLote(M.libro, M.fuentes, ' qg ').diferencia).toEqual({ machos: 10, hembras: 10, total: 20 });
    expect(cuadreDeLote(M.libro, M.fuentes, 'NO-EXISTE')).toBe(null);
    expect(loteDelLibro(M.libro, 'NO-EXISTE')).toBe(null);
  });
});

describe('Maduración · lotes · la tabla maestra', () => {
  it('una fila por lote, también los CERRADOS, con su estado, su edad y sus cifras', () => {
    const t = tablaDeLotes(M, SIN);
    expect(t.map((f) => f.lote)).toEqual(['QE', 'QF', 'QG', 'QH', 'QI', 'QJ']);
    const qe = t.find((f) => f.lote === 'QE');
    expect(qe.ingresados.total).toBe(200);
    expect(qe.vivos).toEqual({ machos: 66, hembras: 67, total: 133 });
    expect(qe.supervivencia).toEqual({ machos: 66, hembras: 67, total: 66.5 });
    // 0t·9: 4/2 de las bajas del 05/09 + los 20/20 que el parte descartó el 15/09 (lo que registró su cierre Parcial).
    expect(qe.descarte).toEqual({ machos: 24, hembras: 22, total: 23 });
    expect(qe.dias).toBe(18);                    // del 01/09 a la foto
    expect(qe.salas).toEqual(['Sala 3']);
    expect(qe.cuadra).toBe(true);
    // El cerrado sigue en la tabla, a cero, y su edad se cuenta hasta el CIERRE, no hasta la foto.
    const qg = t.find((f) => f.lote === 'QG');
    expect(qg.estado).toBe(ESTADO_CERRADO);
    expect(qg.cerrado).toBe('2026-09-17');
    expect(qg.vivos.total).toBe(0);
    expect(qg.dias).toBe(14);
  });

  it('un lote con DOS códigos genéticos los enseña los dos', () => {
    expect(tablaDeLotes(M, SIN).find((f) => f.lote === 'QJ').codigos).toEqual(['CA', 'CB']);
  });

  it('🔴 4 (2026-09-29, usuario) · el PESO de cada lote es el del ⚖️ Saldo al cierre de la foto: valor y fecha, por sexo', () => {
    const peso = (m, l) => tablaDeLotes(m, SIN).find((f) => f.lote === l).peso;
    // El 18/09 pesaron t4 (QH y QI, compartido: ♂30 ♀40) y t5 (QJ: ♂20 ♀50). Cada lote, el suyo; cada sexo, el suyo.
    expect(peso(M, 'QJ')).toEqual({ hembras: { valor: 50, fecha: '2026-09-18' }, machos: { valor: 20, fecha: '2026-09-18' } });
    expect(peso(M, 'QH')).toEqual({ hembras: { valor: 40, fecha: '2026-09-18' }, machos: { valor: 30, fecha: '2026-09-18' } });
    // Es EL del Saldo, no otro cálculo.
    const R = M.resumen.lotes.find((x) => x.lote === 'QJ');
    expect(peso(M, 'QJ')).toEqual({ hembras: R.pesoHembras, machos: R.pesoMachos });
    // Sin ningún parte con peso, vacío (un cero diría «no pesa nada»); y el cerrado a cero, que el Saldo no lista, también.
    const vacio = { hembras: { valor: '', fecha: '' }, machos: { valor: '', fecha: '' } };
    expect(peso(M, 'QE')).toEqual(vacio);
    expect(peso(M, 'QG')).toEqual(vacio);
    // AL CIERRE DE LA FOTO: con la foto del 17, el peso del 18 todavía no existe.
    expect(peso(modeloOperativo(PLANTA, { hoy: FOTO, fecha: '2026-09-17' }), 'QJ')).toEqual(vacio);
  });

  it('el filtro se aplica por las posiciones del lote: por tanque, por código y por lote', () => {
    expect(tablaDeLotes(M, F({ sala: 'Sala 3', tanque: 4 })).map((f) => f.lote)).toEqual(['QH', 'QI']);
    expect(tablaDeLotes(M, F({ codigo: 'CB' })).map((f) => f.lote)).toEqual(['QF', 'QG', 'QJ']);
    expect(tablaDeLotes(M, F({ lote: 'qe' })).map((f) => f.lote)).toEqual(['QE']);
    expect(tablaDeLotes(M, F({ sala: 'Sala 1' }))).toEqual([]);
  });

  it('el estado de un lote entero: el de sus salas, y «Mixto» si difieren', () => {
    expect(estadoDeLoteEntero({ salas: [{ estado: 'Producción' }, { estado: 'Producción' }] }, FOTO)).toBe('Producción');
    expect(estadoDeLoteEntero({ salas: [{ estado: 'Producción' }, { estado: 'Cuarentena' }] }, FOTO)).toBe('Mixto');
    expect(estadoDeLoteEntero({ salas: [], ingreso: '2026-09-18' }, FOTO)).toBe('Cuarentena');
  });
});

describe('Maduración · lotes · la ficha', () => {
  it('el ORIGEN trae cada ingreso con su piscina y su camaronera', () => {
    expect(origenDeLote(M.fuentes, 'QE')).toEqual([{ fecha: '2026-09-01', sala: 'Sala 3', tanque: 1, codigo: 'CA',
      piscina: 'P1', camaronera: 'CX', machos: 100, hembras: 100, total: 200 }]);
    expect(origenDeLote(M.fuentes, 'QJ').map((o) => o.codigo)).toEqual(['CA', 'CB']);
  });

  it('la CURVA sale de la serie que ya calculó el modelo, y suma los dos códigos de un mismo lote', () => {
    const c = curvaDeLote(SERIE, 'QE');
    expect(c[0]).toEqual({ fecha: P30.desde, machos: 0, hembras: 0, total: 0 });   // antes de existir, cero
    expect(c[c.length - 1]).toEqual({ fecha: FOTO, machos: 66, hembras: 67, total: 133 });
    expect(c.find((d) => d.fecha === '2026-09-04').total).toBe(200);               // tras el ingreso, antes de las bajas
    expect(curvaDeLote(SERIE, 'QJ').at(-1).total).toBe(40);                        // 10+10 ♂ y 10+10 ♀
  });

  it('🔴 «de paso» (2026-09-26) · un evento por día y tipo: el ingreso en dos tanques es UNO, con sus animales sumados', () => {
    // Un ingreso llega en VARIAS filas, una por tanque (modelo propio: QK no entra en las cuentas de las demás pruebas).
    const MK = modeloOperativo([ING('2026-09-06', 'QK', 'Sala 3', 6, 5, 5, 'CA', 'P1'), ING('2026-09-06', 'QK', 'Sala 3', 7, 4, 6, 'CA', 'P1')], { hoy: FOTO, fecha: FOTO });
    expect(eventosDeLote(MK.fuentes, 'QK', P30)).toEqual([
      { fecha: '2026-09-06', tipo: 'ingreso', etiqueta: 'Ingreso', machos: 9, hembras: 11, registros: 2, tanques: 2 },
    ]);
    const qe = eventosDeLote(M.fuentes, 'QE', P30);
    expect(qe.find((e) => e.tipo === 'ingreso')).toMatchObject({ registros: 1, tanques: 1 });
    expect(qe.find((e) => e.tipo === 'desove'), 'un desove no es de un tanque').toMatchObject({ registros: 1, tanques: 0 });
  });

  it('los EVENTOS son los que NOMBRAN al lote, dentro del período y en orden', () => {
    expect(eventosDeLote(M.fuentes, 'QE', P30).map((e) => [e.fecha, e.tipo])).toEqual([
      ['2026-09-01', 'ingreso'], ['2026-09-10', 'mortdes'], ['2026-09-12', 'desove'],
      ['2026-09-14', 'desove'], ['2026-09-15', 'cierre'],
    ]);
    // Fuera del período no entra ninguno.
    expect(eventosDeLote(M.fuentes, 'QE', { desde: '2026-09-16', hasta: FOTO })).toEqual([]);
  });

  it('la REPRODUCCIÓN: la fertilidad sólo sobre los huevos CON N2, y el N5 sobre los desoves CON N5', () => {
    const r = reproduccionDeLote(M.fuentes, 'QE', P30);
    expect(r).toMatchObject({ desoves: 6, huevos: 600000, n2: 340000, n5: 180000 });
    expect(r.huevosPorDesove).toBe(100000);
    expect(r.fertilidad).toBe(85);        // 340 000 ÷ 400 000 (no ÷ 600 000)
    expect(r.n5PorDesove).toBe(90000);    // 180 000 ÷ 2 (no ÷ 6)
  });

  it('🔴 los promedios del tanque se reparten: a medias si está COMPARTIDO, enteros si el lote lo ocupa con dos códigos', () => {
    const qh = promediosDeLote(M, 'QH', P30, PRES);
    expect(qh.compartido).toBe(true);
    expect(qh.copulas).toBe(8);           // (6 + 10) × ½
    expect(qh.muda).toBe(4);              // 8 × ½
    expect(qh.pesoMachos).toBe(30);       // un promedio NO se parte
    expect(qh.pesoHembras).toBe(40);
    // QJ está solo en su tanque, con DOS códigos: acumulando mal daría parte ½ y 6 cópulas.
    const qj = promediosDeLote(M, 'QJ', P30);
    expect(qj.compartido).toBe(false);
    expect(qj.copulas).toBe(12);
    expect(qj.muda).toBe(6);
    expect(qj.tanques).toBe(1);
  });

  it('🔴 «de paso» (2026-09-26) · el % de cópulas y de muda es POR DÍA, con la regla del Saldo (no el período ÷ la foto)', () => {
    const qh = promediosDeLote(M, 'QH', P30, PRES);
    // Dos partes del tanque 4 (40 hembras, de QH y QI): (6 + 10) cópulas ÷ (40 + 40) hembras-día. Dividiendo las
    // cópulas del período entre las hembras de la foto daría 8 ÷ 20 = 40 %.
    expect(qh.pctCopulas).toBe(20);
    expect(qh.pctMuda).toBe(10);          // 8 ÷ 80
    expect(promediosDeLote(M, 'QJ', P30, PRES).pctCopulas).toBe(60);   // 12 ÷ 20, un solo parte
    const sin = promediosDeLote(M, 'QH', P30);
    expect([sin.pctCopulas, sin.pctMuda, sin.copulas], 'sin la presencia diaria no hay %: vacío, no uno inventado').toEqual(['', '', 8]);
    expect(fichaDeLote(M, SERIE, 'QH', P30, null, PRES).promedios).toEqual(qh);
  });

  it('la ficha entera se arma, y un lote desconocido da null', () => {
    const f = fichaDeLote(M, SERIE, 'QE', P30);
    expect(f.lote).toBe('QE');
    expect(f.cuadre.cuadra).toBe(true);
    expect(f.curva.at(-1).total).toBe(133);
    expect(f.origen).toHaveLength(1);
    expect(f.reproduccion.desoves).toBe(6);
    expect(f.promedios.tanques).toBe(1);
    expect(fichaDeLote(M, SERIE, 'NO-EXISTE', P30)).toBe(null);
  });
});

/* 0f · 7 (2026-09-25, usuario) · «la curva de Vivos del lote debe empezar en la fecha del ingreso, no un mes antes».
   Con el CICLO del lote (su último ingreso → su cierre, o la foto si sigue abierto; la regla de `cicloDelLote`, la del
   🏁 Cierre de lote) la curva y los eventos marcados sobre ella cubren esa vida; Reproducción y los promedios siguen el
   PERÍODO del tablero (decisión del usuario). El período de estas pruebas es «7 d»: deja FUERA el ingreso de QE (01/09). */
describe('Maduración · lotes · la ficha con el CICLO del lote (0f · 7)', () => {
  const P7 = periodoDe('7d', FOTO, M.fuentes);
  const serieDelCiclo = (c) => serieDiaria(M.fuentes, c.desde, c.hasta);

  it('el fixture ejerce algo: el período de 7 d empieza DESPUÉS del ingreso de QE', () => {
    expect(P7.desde > '2026-09-01').toBe(true);
    expect(cicloDelLote(M.libro, 'QE', FOTO)).toEqual({ desde: '2026-09-01', hasta: FOTO });
  });

  it('🔴 la curva empieza el día del INGRESO (ni ceros de antes ni recortada) y llega a la foto', () => {
    const c = cicloDelLote(M.libro, 'QE', FOTO);
    const f = fichaDeLote(M, serieDelCiclo(c), 'QE', P7, c);
    expect(f.curva[0]).toEqual({ fecha: '2026-09-01', machos: 100, hembras: 100, total: 200 });
    expect(f.curva.at(-1)).toEqual({ fecha: FOTO, machos: 66, hembras: 67, total: 133 });
    expect(f.ciclo).toEqual(c);
  });

  it('🔴 aunque la serie traiga días de antes del ingreso, la curva no los enseña', () => {
    const c = cicloDelLote(M.libro, 'QE', FOTO);
    const f = fichaDeLote(M, serieDiaria(M.fuentes, '2026-08-20', FOTO), 'QE', P7, c);
    expect(f.curva[0].fecha).toBe('2026-09-01');
    expect(f.curva.some((d) => d.total === 0)).toBe(false);
  });

  it('🔴 los EVENTOS marcados son los del ciclo (el ingreso del 01/09 entra aunque el período empiece después)', () => {
    const c = cicloDelLote(M.libro, 'QE', FOTO);
    const f = fichaDeLote(M, serieDelCiclo(c), 'QE', P7, c);
    expect(f.eventos.map((e) => [e.fecha, e.tipo])).toEqual([
      ['2026-09-01', 'ingreso'], ['2026-09-10', 'mortdes'], ['2026-09-12', 'desove'],
      ['2026-09-14', 'desove'], ['2026-09-15', 'cierre'],
    ]);
  });

  it('🔴 Reproducción y los promedios siguen el PERÍODO, no el ciclo', () => {
    const c = cicloDelLote(M.libro, 'QE', FOTO);
    const f = fichaDeLote(M, serieDelCiclo(c), 'QE', P7, c);
    expect(f.reproduccion.desoves, 'en 7 d sólo entra el del 14/09 (2 desoves); en el ciclo serían 6').toBe(2);
    expect(f.reproduccion).toEqual(reproduccionDeLote(M.fuentes, 'QE', P7));
    expect(f.promedios).toEqual(promediosDeLote(M, 'QE', P7));
  });

  it('un lote CERRADO: la curva termina en su cierre', () => {
    const c = cicloDelLote(M.libro, 'QG', FOTO);
    expect(c).toEqual({ desde: '2026-09-03', hasta: '2026-09-17' });
    const f = fichaDeLote(M, serieDiaria(M.fuentes, c.desde, FOTO), 'QG', P7, c);
    expect(f.curva[0].fecha).toBe('2026-09-03');
    expect(f.curva.at(-1).fecha).toBe('2026-09-17');
  });

  it('sin ciclo (lote sin fecha de ingreso) la ficha sigue como antes: la serie y los eventos del período', () => {
    const f = fichaDeLote(M, SERIE, 'QE', P30, null);
    expect(f.curva[0]).toEqual({ fecha: P30.desde, machos: 0, hembras: 0, total: 0 });
    expect(f.ciclo).toBe(null);
  });
});

describe('Maduración · lotes · la comparativa', () => {
  it('las tres agrupaciones, y una desconocida cae en «lote»', () => {
    expect(DIMENSIONES_COMPARATIVA.map((d) => d.clave)).toEqual(['lote', 'codigo', 'piscina']);
    expect(comparativa(M, SIN, P30, 'otra').dimension).toBe('lote');
  });

  it('por LOTE dice lo mismo que la tabla maestra, y señala el mejor y el peor', () => {
    const c = comparativa(M, SIN, P30, 'lote');
    expect(c.filas.map((f) => f.origen)).toEqual(['QE', 'QF', 'QG', 'QH', 'QI', 'QJ']);
    expect(c.filas.find((f) => f.origen === 'QE')).toMatchObject({ ingresados: 200, vivos: 133, supervivencia: 66.5, desoves: 6 });
    expect(c.filas.find((f) => f.origen === 'QH').supervivencia).toBe(100);
    expect(c.peor).toBe('QG');            // el cerrado, a cero
  });

  it('con UNA sola fila no hay mejor ni peor: comparar consigo mismo no dice nada', () => {
    const c = comparativa(M, F({ lote: 'QE' }), P30, 'lote');
    expect(c.filas).toHaveLength(1);
    expect(c.mejor).toBe('');
    expect(c.peor).toBe('');
  });

  /* 5 (2026-09-29, usuario) · «con filtro de código/piscina salen valores AGRUPADOS … el mismo lote a veces con uno, a
     veces con los dos, y la tabla no deja agrupar/desagrupar». Antes, cada fila iba por el TEXTO de su columna: el Ingreso
     trae los códigos sueltos y los Desoves la pareja («C1/C2»), así que un lote se partía en dos filas (medido: dos filas
     «A/B» con 0 animales y TODOS los desoves de sus lotes). Ahora cada dato va con su LOTE y el origen del lote es el de
     su INGRESO. Aquí QJ entró como CA y como CB: su pareja. (Hasta el 2026-09-29 esta prueba esperaba ['CA', 'CB'] con
     CA 300: es lo que hoy da «separadas».) */
  it('🔴 5 · «juntas» (por defecto): cada lote ENTERO en la fila de su combinación según el Ingreso; las cifras suman', () => {
    const cg = comparativa(M, SIN, P30, 'codigo');
    expect(cg.parejas).toBe('juntas');
    expect(cg.filas.map((f) => f.origen)).toEqual(['CA', 'CA/CB', 'CB']);
    // CA: QE 200 + QH 40 + QI 40 = 280 · CA/CB: QJ 40 · CB: QF 20 + QG 60 = 80 — los 400 de la tabla, sin repetir.
    expect(cg.filas.map((f) => f.ingresados)).toEqual([280, 40, 80]);
    expect(cg.filas.find((f) => f.origen === 'CA/CB')).toMatchObject({ lotes: ['QJ'], vivos: 40, supervivencia: 100, compartido: false });
    expect(cg.filas.find((f) => f.origen === 'CA').desoves).toBe(6);   // los de QE, con su lote
    const pis = comparativa(M, SIN, P30, 'piscina');
    expect(pis.filas.map((f) => f.origen)).toEqual(['P1', 'P2', 'P3']);
    expect(pis.filas.find((f) => f.origen === 'P3').lotes).toEqual(['QI']);
  });

  it('🔴 5 · los desoves van con su LOTE, no con el código que escriba su fila; «separadas»: los del lote, ENTEROS en cada uno', () => {
    // QJ desova el 18/09 y su fila dice sólo «CA» (DES pone CA): es de la pareja CA/CB igual. Y QK entra PRIMERO como CB
    // y luego como CA: su pareja es la MISMA fila «CA/CB» (el nombre no depende del orden de las filas del Ingreso).
    const M2 = modeloOperativo([...PLANTA, DES('2026-09-18', 'QJ', 3, 300000, 0, 0),
      ING('2026-09-06', 'QK', 'Sala 3', 6, 5, 5, 'CB', 'P1'), ING('2026-09-06', 'QK', 'Sala 3', 6, 5, 5, 'CA', 'P1')], { hoy: FOTO, fecha: FOTO });
    const P = periodoDe('30d', FOTO, M2.fuentes);
    const junt = comparativa(M2, SIN, P, 'codigo');
    expect(junt.filas.map((f) => [f.origen, f.desoves, f.compartido])).toEqual([['CA', 6, false], ['CA/CB', 3, false], ['CB', 0, false]]);
    expect(junt.filas.find((f) => f.origen === 'CA/CB')).toMatchObject({ lotes: ['QJ', 'QK'], ingresados: 60 });
    const sep = comparativa(M2, SIN, P, 'codigo', 'separadas');
    expect(sep.parejas).toBe('separadas');
    expect(sep.filas.map((f) => f.origen)).toEqual(['CA', 'CB']);
    // SUS animales: CA = QE 200 + QH 40 + QI 40 + QJ(CA) 20 + QK(CA) 10 = 310 · CB = QF 20 + QG 60 + QJ(CB) 20 + QK(CB) 10
    // = 110: un lote repartido no se cuenta dos veces. Vivos: CA = 133 + 40 + 40 + 20 + 10 · CB = 10 + 0 + 20 + 10.
    expect(sep.filas.map((f) => [f.ingresados, f.vivos])).toEqual([[310, 243], [110, 40]]);
    // Los 3 desoves de QJ, ENTEROS en cada uno, y marcados: la columna ya no suma (6 + 3 y 3, de 9).
    expect(sep.filas.map((f) => [f.desoves, f.n5, f.compartido])).toEqual([[9, 180000, true], [3, 0, true]]);
    // Un origen al que no llega ningún lote de dos orígenes no se marca.
    const pis = comparativa(M2, SIN, P, 'piscina', 'separadas');
    expect(pis.filas.every((f) => f.compartido === false)).toBe(true);
    // Un valor desconocido cae en «juntas».
    expect(comparativa(M2, SIN, P, 'codigo', 'otra').parejas).toBe('juntas');
  });

  it('🔴 5 · por código y por piscina sigue los FILTROS y el PERÍODO del tablero, como por lote', () => {
    // Código CB: sus lotes (QF, QG y QJ). Juntas: CA/CB y CB. Separadas: sólo CB (lo de CA de QJ no es del filtro).
    expect(comparativa(M, F({ codigo: 'CB' }), P30, 'codigo').filas.map((f) => f.origen)).toEqual(['CA/CB', 'CB']);
    expect(comparativa(M, F({ codigo: 'CB' }), P30, 'codigo', 'separadas').filas.map((f) => [f.origen, f.ingresados])).toEqual([['CB', 100]]);
    // Piscina P3 (filtro con su índice, como en la vista): sólo QI.
    const FP = normalizarFiltro({ piscina: 'P3' }, indiceDeFiltro(M));
    expect(comparativa(M, FP, P30, 'piscina', 'separadas').filas.map((f) => [f.origen, f.lotes])).toEqual([['P3', ['QI']]]);
    expect(comparativa(M, F({ lote: 'QE' }), P30, 'codigo').filas.map((f) => f.origen)).toEqual(['CA']);
    // El período: con «Hoy» (el 19/09) no entra ningún desove de QE (12 y 14/09).
    expect(comparativa(M, SIN, periodoDe('hoy', FOTO, M.fuentes), 'codigo').filas.find((f) => f.origen === 'CA').desoves).toBe(0);
  });

  it('🔴 5 · la piscina, en su forma CANÓNICA (la de 📈 Piscinas de origen): «P 3» y «P3» del Ingreso son la misma fila', () => {
    const M4 = modeloOperativo([...PLANTA, ING('2026-09-06', 'QK', 'Sala 3', 6, 5, 5, 'CA', 'P 3')], { hoy: FOTO, fecha: FOTO });
    for (const modo of ['juntas', 'separadas']) {
      const pis = comparativa(M4, SIN, P30, 'piscina', modo);
      expect(pis.filas.map((f) => f.origen), modo).toEqual(['P1', 'P2', 'P3']);
      expect(pis.filas.find((f) => f.origen === 'P3'), modo).toMatchObject({ lotes: ['QI', 'QK'], ingresados: 50 });
    }
    // El filtro trae la piscina como se tecleó («P 3», la del índice del Ingreso): su fila canónica casa igual.
    const FP = normalizarFiltro({ piscina: 'P 3' }, indiceDeFiltro(M4));
    expect(comparativa(M4, FP, P30, 'piscina', 'separadas').filas.map((f) => [f.origen, f.lotes])).toEqual([['P3', ['QK']]]);
  });

  /* 5 · las reglas que la comparativa HEREDÓ de `desempenoPorOrigen` (retirado el 2026-09-29: se quedó sin uso), que
     vigilaban I19–I22 del banco de indicadores. */
  it('🔑 5 · un (lote, código) de DOS piscinas cuenta sus vivos UNA vez, en la que más aportó; el código, canónico; la regla del Saldo', () => {
    // QM (código «cb », que es CB) entró 8 desde la P7 y 2 desde la P8, al mismo tanque: sus 10 vivos van a la P7.
    const M5 = modeloOperativo([...PLANTA, ING('2026-09-06', 'QM', 'Sala 3', 7, 4, 4, 'cb ', 'P7'),
      ING('2026-09-06', 'QM', 'Sala 3', 7, 1, 1, 'cb ', 'P8')], { hoy: FOTO, fecha: FOTO });
    const pis = comparativa(M5, SIN, P30, 'piscina', 'separadas').filas;
    expect(pis.filter((f) => ['P7', 'P8'].includes(f.origen)).map((f) => [f.origen, f.ingresados, f.vivos])).toEqual([['P7', 8, 10], ['P8', 2, 0]]);
    expect(comparativa(M5, SIN, P30, 'codigo', 'separadas').filas.find((f) => f.origen === 'CB').lotes).toContain('QM');   // «cb » es CB
    // Fertilidad sobre los huevos que YA tienen N2 (340 000 de 400 000), no sobre todos (600 000); nauplios, sobre los
    // desoves que ya tienen N5 (180 000 en 2), no sobre los 6.
    expect(comparativa(M, SIN, P30, 'codigo', 'separadas').filas.find((f) => f.origen === 'CA')).toMatchObject({ fertilidad: 85, naupliosPorHembra: 90000 });
  });

  it('🔴 5 · `desempenoPorPiscina` (📈 Piscinas de origen) ES la comparativa por piscina «separadas» de todo el registro', () => {
    const d = desempenoPorPiscina(M);
    const todo = comparativa(M, SIN, periodoDe('todo', FOTO, M.fuentes), 'piscina', 'separadas').filas;
    expect([...d.keys()]).toEqual(todo.map((f) => f.origen));
    expect(d.get('P1')).toEqual(todo.find((f) => f.origen === 'P1'));
    // Con los nauplios por hembra: los 180 000 N5 de los 2 desoves de QE que ya los tienen.
    expect(d.get('P1')).toMatchObject({ lotes: ['QE', 'QH', 'QJ'], naupliosPorHembra: 90000 });
    expect(desempenoPorPiscina(null)).toEqual(new Map());   // sin modelo, nada
  });
});
