/* ============================================================
   MADURACIÓN · OPERATIVO — LOTES (F2.1)

   Qué se exige, y con fixtures que distinguen lo correcto de lo equivocado (si la regla se rompe, alguna se pone
   roja: cada una está montada para que el valor equivocado dé OTRO número, no el mismo):
   · La cascada CUADRA en un lote que ha desovado. QE tiene 5 hembras muertas en tanques de desove, y ésas YA están
     dentro de `muertos`: restarlas otra vez daría 128 en vez de 133 y la prueba se pondría roja.
   · Las SALIDAS son las efectivas. A QF le pidieron 15 machos y sólo tenía 10: con lo pedido el cuadre daría 5 y no
     10. El déficit se enseña aparte.
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
  DIMENSIONES_COMPARATIVA, comparativa,
} from './operativo.lotes.js';
import { modeloOperativo, serieDiaria } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { ESTADO_CERRADO } from '../registros/lib/mad-libro.js';

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
              y un cierre PARCIAL de 20/20 el 15/09.  → 66♂ 67♀
   · t2 QF  —  10♂  10♀ el 02/09 y un cierre PARCIAL que pide 15 machos: sólo había 10 (déficit de 5). → 0♂ 10♀
   · t3 QG  —  30♂  30♀ el 03/09 y un cierre TOTAL de 20/20 el 17/09: quedan 10/10 de DIFERENCIA. → cerrado, a cero
   · t4 QH y QI — 20♂ 20♀ cada uno el 04/09: se reparten el tanque a medias.
   · t5 QJ  — el MISMO lote con dos códigos genéticos (10♂ 10♀ cada uno): el tanque es suyo entero. */
const PLANTA = [
  ING('2026-09-01', 'QE', 'Sala 3', 1, 100, 100, 'CA', 'P1'),
  TQ('2026-09-05', 'Sala 3', 1, { 'Machos muertos': 10, 'Hembras muertas': 6,
    'Machos muertos por descarte de selección': 4, 'Hembras muertas por descarte de selección': 2 }),
  MORT('2026-09-10', 'QE', 'Desove', 30, 5),
  FIN('2026-09-15', 'QE', 'Parcial', 20, 20),
  DES('2026-09-12', 'QE', 4, 400000, 340000, 0),
  DES('2026-09-14', 'QE', 2, 200000, 0, 180000),

  ING('2026-09-02', 'QF', 'Sala 3', 2, 10, 10, 'CB', 'P2'),
  FIN('2026-09-16', 'QF', 'Parcial', 15, 0),

  ING('2026-09-03', 'QG', 'Sala 3', 3, 30, 30, 'CB', 'P2'),
  FIN('2026-09-17', 'QG', 'Total', 20, 20),

  ING('2026-09-04', 'QH', 'Sala 3', 4, 20, 20, 'CA', 'P1'),
  ING('2026-09-04', 'QI', 'Sala 3', 4, 20, 20, 'CA', 'P3'),
  TQ('2026-09-18', 'Sala 3', 4, { 'Cópulas': 10, Muda: 8, 'Peso promedio machos (g)': 30, 'Peso promedio hembras (g)': 40 }),

  ING('2026-09-04', 'QJ', 'Sala 3', 5, 10, 10, 'CA', 'P1'),
  ING('2026-09-04', 'QJ', 'Sala 3', 5, 10, 10, 'CB', 'P1'),
  TQ('2026-09-18', 'Sala 3', 5, { 'Cópulas': 12, Muda: 6, 'Peso promedio machos (g)': 20, 'Peso promedio hembras (g)': 50 }),
];

const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P30 = periodoDe('30d', FOTO, M.fuentes);
const SERIE = serieDiaria(M.fuentes, P30.desde, P30.hasta);
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);

describe('Maduración · lotes · la cascada del cuadre', () => {
  it('las filas van en su orden, con su signo, y «vivos» es el resultado', () => {
    expect(CUADRE_FILAS.map((f) => f.id)).toEqual(['ingresados', 'muertos', 'descartes', 'salidas', 'diferencia', 'vivos']);
    expect(CUADRE_FILAS.map((f) => f.signo)).toEqual(['+', '−', '−', '−', '−', '=']);
  });

  it('🔴 un lote que DESOVÓ cuadra: la mortalidad en desove ya está dentro de «muertos» y no se resta otra vez', () => {
    const c = cuadreDeLote(M.libro, M.fuentes, 'QE');
    expect(c.ingresados).toEqual({ machos: 100, hembras: 100, total: 200 });
    // 10 machos y 6 hembras de las bajas del tanque, MÁS las 5 hembras que murieron desovando.
    expect(c.muertos).toEqual({ machos: 10, hembras: 11, total: 21 });
    expect(c.descartes).toEqual({ machos: 4, hembras: 2, total: 6 });
    expect(c.salidas).toEqual({ machos: 20, hembras: 20, total: 40 });
    expect(c.diferencia).toEqual({ machos: 0, hembras: 0, total: 0 });
    expect(c.vivos).toEqual({ machos: 66, hembras: 67, total: 133 });
    // 200 − 21 − 6 − 40 = 133. Restando las 5 de desove otra vez darían 128 y esto se pondría rojo.
    expect(c.cuadra).toBe(true);
    expect(c.descuadre).toEqual({ machos: 0, hembras: 0, total: 0 });
    // Y se enseñan como «de los cuales», con las que entraron a desovar.
    expect(c.deLosCuales.desove).toEqual({ entran: 30, muertas: 5 });
    expect(c.deLosCuales.recuperacion).toEqual({ entran: 0, muertas: 0 });
  });

  it('🔴 las SALIDAS son las EFECTIVAS: lo pedido menos lo que el libro no pudo dar, y el déficit se dice', () => {
    const c = cuadreDeLote(M.libro, M.fuentes, 'QF');
    // El cierre pidió 15 machos y sólo había 10: con los 15 pedidos el cuadre daría 5 vivos, no 10.
    expect(c.salidas).toEqual({ machos: 10, hembras: 0, total: 10 });
    expect(c.deficit).toEqual({ machos: 5, hembras: 0, total: 5 });
    expect(c.vivos).toEqual({ machos: 0, hembras: 10, total: 10 });
    expect(c.cuadra).toBe(true);
  });

  it('un cierre TOTAL deja su diferencia, y con ella el lote cuadra a cero', () => {
    const c = cuadreDeLote(M.libro, M.fuentes, 'QG');
    expect(c.ingresados.total).toBe(60);
    expect(c.salidas).toEqual({ machos: 20, hembras: 20, total: 40 });
    expect(c.diferencia).toEqual({ machos: 10, hembras: 10, total: 20 });
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
    expect(cuadreDeLote(M.libro, M.fuentes, ' qf ').salidas).toEqual({ machos: 10, hembras: 0, total: 10 });
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
    expect(qe.descarte).toEqual({ machos: 4, hembras: 2, total: 3 });
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
    const qh = promediosDeLote(M, 'QH', P30);
    expect(qh.compartido).toBe(true);
    expect(qh.copulas).toBe(5);           // 10 × ½
    expect(qh.muda).toBe(4);              // 8 × ½
    expect(qh.pesoMachos).toBe(30);       // un promedio NO se parte
    expect(qh.pesoHembras).toBe(40);
    expect(qh.pctCopulas).toBe(25);       // 5 ÷ 20 hembras vivas
    // QJ está solo en su tanque, con DOS códigos: acumulando mal daría parte ½ y 6 cópulas.
    const qj = promediosDeLote(M, 'QJ', P30);
    expect(qj.compartido).toBe(false);
    expect(qj.copulas).toBe(12);
    expect(qj.muda).toBe(6);
    expect(qj.tanques).toBe(1);
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

  it('por CÓDIGO y por PISCINA agrupa, y un lote repartido entre orígenes no se cuenta dos veces', () => {
    const cg = comparativa(M, SIN, P30, 'codigo');
    expect(cg.filas.map((f) => f.origen)).toEqual(['CA', 'CB']);
    // CA: QE 200 + QH 40 + QI 40 + QJ(CA) 20 = 300. CB: QF 20 + QG 60 + QJ(CB) 20 = 100.
    expect(cg.filas.find((f) => f.origen === 'CA').ingresados).toBe(300);
    expect(cg.filas.find((f) => f.origen === 'CB').ingresados).toBe(100);
    const pis = comparativa(M, SIN, P30, 'piscina');
    expect(pis.filas.map((f) => f.origen)).toEqual(['P1', 'P2', 'P3']);
    expect(pis.filas.find((f) => f.origen === 'P3').lotes).toEqual(['QI']);
  });
});
