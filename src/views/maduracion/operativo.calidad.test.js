/* ============================================================
   MADURACIÓN · OPERATIVO — 🩺 CALIDAD DEL DATO (F6.2)

   Qué se exige, con fixtures montados para que la regla equivocada dé OTRO resultado:
   · Se espera UN parte por tanque OCUPADO al cierre del día. Los dos partes del T1 el 15/09 cubren UN tanque (contando
     partes, la Sala 1 saldría completa); el parte del T4 el 17/09 no cubre nada, porque ese día sus animales se
     fueron al T5 y el tanque cerró vacío (con la ocupación del amanecer, el T5 no esperaría parte); y el del T3 el
     18/09 tampoco: el libro no tiene nada ahí.
   · Cada sala con animales espera su registro de Sala; la Sala 3, sin animales, no espera nada aunque lo tenga.
   · El día en curso se enseña y no se cuenta, y «en curso» es relativo a HOY, no a la foto: mirando el 19/09 desde
     el 21/09, sus faltas ya son faltas.
   · Los huecos del calendario de una hoja diaria se cuentan desde que la hoja empezó (la de Tanques el 15/09: el 13
     y el 14 no son huecos; la de Sala el 13/09: el 14 sí lo es).
   · Las filas sin fecha legible se CUENTAN (el tablero entero las ignora), y las de fecha posterior a hoy, también.
   · Los avisos del libro: los 14 tipos aunque vayan a cero, y con la MISMA regla de filtro que las alertas de la
     portada (lo exige la comparación con `alertas`).
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  ignoraDeCalidad, estadoDeHojas, calendarioDeRegistros, coberturaDePartes, SITUACIONES_ESTADO, comparacionDeEstados,
  avisosDelLibro,
} from './operativo.calidad.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import { normalizarFiltro, periodoDe, alertas, TIPOS_AVISO } from './operativo.tablero.js';
import { MAD_OP_HOJAS, MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { RESUMEN_TEMPS } from '../registros/lib/mad-resumen.js';
import { sumarDias } from '../registros/lib/mad-libro.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha,
  Lote: lote, 'Código genético': 'CA', 'Piscina Broodstock': 'PZ1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, [RESUMEN_TEMPS[0]]: 27, Fecha: fecha, Sala: sala, ...extra });
const MOV = (fecha, so, to, sd, td, machos, hembras) => ({ _SheetOrigin: O, 'Agua destino': 'RAS', Fecha: fecha,
  'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td, Machos: machos, Hembras: hembras });
const DES = (fecha, lote) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': 'CA', Desoves: 1, 'Total de huevos': 1000, N2: 800, N5: 0 });

const FOTO = '2026-09-19';

/* La planta de las pruebas, a la foto del 19/09 (que es HOY):
   · Sala 1 — QA, 10♂ 10♀ en el t1 y otros tantos en el t2 desde el 15/09. El 16/09 un parte del t1 da 15 machos
     muertos: sólo había 10 (déficit de 5), y el t1 sigue ocupado con sus hembras.
   · Sala 2 — QB, 5♂ 5♀ en el t4 el 16/09; el 17/09 pasan todos al t5. El 18/09, un movimiento sin tanque destino.
   · Partes de Tanques: el 15/09 dos del t1 (06:00 y 18:00) y ninguno del t2; el 16/09 los tres; el 17/09 los dos de
     la Sala 1 y uno del t4 (que cerró vacío), ninguno del t5; el 18/09 los tres, y uno del t3 de la Sala 1 con una
     baja (el libro no tiene nada ahí). El 19/09, nada todavía.
   · Registros de Sala: la Sala 1 el 13, 15, 16 y 17 (Cuarentena, tecleada el 17); la Sala 2 el 17 (Producción) y el
     18; la Sala 3 el 18 (Desinfección), sin animales.
   · Y lo que sólo ve esta pieza: un Ingreso sin tanque (01/09), un desove con una fecha que no existe (31/02), un
     movimiento de 2027, una fila que no es de ninguna hoja y un registro de la Sala 4A, que no se muestra. */
const PLANTA = [
  ING('2026-09-01', 'QZ', 'Sala 1', '', 5, 5),
  ING('2026-09-15', 'QA', 'Sala 1', 1, 10, 10),
  ING('2026-09-15', 'QA', 'Sala 1', 2, 10, 10),
  ING('2026-09-16', 'QB', 'Sala 2', 4, 5, 5),
  MOV('2026-09-17', 'Sala 2', 4, 'Sala 2', 5, 5, 5),
  MOV('2026-09-18', 'Sala 2', 5, 'Sala 2', '', 1, 0),
  MOV('2027-09-17', 'Sala 1', 1, 'Sala 1', 2, 1, 1),

  TQ('2026-09-15', 'Sala 1', 1, { Hora: '06:00' }), TQ('2026-09-15', 'Sala 1', 1, { Hora: '18:00' }),
  TQ('2026-09-16', 'Sala 1', 1, { 'Machos muertos': 15 }), TQ('2026-09-16', 'Sala 1', 2), TQ('2026-09-16', 'Sala 2', 4),
  TQ('2026-09-17', 'Sala 1', 1), TQ('2026-09-17', 'Sala 1', 2), TQ('2026-09-17', 'Sala 2', 4),
  TQ('2026-09-18', 'Sala 1', 1), TQ('2026-09-18', 'Sala 1', 2), TQ('2026-09-18', 'Sala 2', 5),
  TQ('2026-09-18', 'Sala 1', 3, { 'Machos muertos': 1 }),

  SALA('2026-09-13', 'Sala 1'), SALA('2026-09-15', 'Sala 1'), SALA('2026-09-16', 'Sala 1'),
  SALA('2026-09-17', 'Sala 1', { Estado: 'Cuarentena' }), SALA('2026-09-17', 'Sala 2', { Estado: 'Producción' }),
  SALA('2026-09-18', 'Sala 2'), SALA('2026-09-18', 'Sala 3', { Estado: 'Desinfección' }),
  SALA('2026-09-16', 'Sala 4A'),

  DES('31/02/2026', 'QA'),
  { _SheetOrigin: O, Fecha: '2026-09-15', Algo: 'x' },
];

const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P7 = periodoDe('7d', FOTO, M.fuentes);
const SERIE = serieDiaria(M.fuentes, sumarDias(P7.desde, -1), P7.hasta);
const PARTES = diasDeTanque(M.fuentes.tanques);
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);
const iDe = (d) => P7.desde <= d && d <= P7.hasta ? Math.round((Date.parse(d) - Date.parse(P7.desde)) / 864e5) : -1;
const hoja = (x, clave) => x.hojas.find((h) => h.clave === clave);
const sala = (c, s) => c.salas.find((x) => x.sala === s);

describe('Maduración · calidad del dato · el estado de cada hoja', () => {
  it('cada hoja del operativo, en su orden, con su último registro contado hasta HOY', () => {
    const e = estadoDeHojas(M);
    expect(e.hojas.map((h) => h.clave)).toEqual(MAD_OP_HOJAS.map((h) => h.clave));
    expect(hoja(e, 'tanques')).toMatchObject({ filas: 12, ultima: '2026-09-18', dias: 1, atrasada: false, diaria: true, sinFecha: 0 });
    expect(hoja(e, 'sala')).toMatchObject({ filas: 7, ultima: '2026-09-18', diaria: true });
    expect(hoja(e, 'ingresos')).toMatchObject({ filas: 4, diaria: false });
  });

  it('🔑 las filas sin fecha legible se CUENTAN, y las de fecha posterior a hoy también', () => {
    const e = estadoDeHojas(M);
    expect(hoja(e, 'desoves')).toMatchObject({ filas: 1, sinFecha: 1, ultima: '' });
    expect(hoja(e, 'movimientos')).toMatchObject({ filas: 3, futuras: 1, sinFecha: 0 });
  });

  it('las filas que no casan con ninguna hoja y las de las salas que no se muestran', () => {
    expect(estadoDeHojas(M)).toMatchObject({ sinHoja: 1, salasExcluidas: 1 });
  });

  it('una hoja diaria que lleva más de un día sin registro va atrasada', () => {
    const tarde = estadoDeHojas(modeloOperativo(PLANTA, { hoy: '2026-09-21', fecha: FOTO }));
    expect(hoja(tarde, 'tanques')).toMatchObject({ dias: 3, atrasada: true });
    expect(hoja(tarde, 'ingresos').atrasada).toBe(false);   // una hoja de SUCESOS no se atrasa
  });
});

describe('Maduración · calidad del dato · el calendario hoja × día', () => {
  it('cuántas filas cada día, y null el día sin ninguna', () => {
    const c = calendarioDeRegistros(M, P7, SIN);
    expect(c.dias[0]).toBe('2026-09-13');
    expect(c.dias).toHaveLength(7);
    expect(hoja(c, 'tanques').celdas).toEqual([null, null, 2, 3, 3, 4, null]);
    expect(hoja(c, 'sala').celdas).toEqual([1, null, 1, 1, 2, 2, null]);
    expect(hoja(c, 'ingresos').celdas).toEqual([null, null, 2, 1, null, null, null]);
    expect(hoja(c, 'desoves').celdas.every((x) => x === null)).toBe(true);
    expect(hoja(c, 'tanques')).toMatchObject({ total: 12, diasConRegistro: 4 });
  });

  it('🔑 los huecos de una hoja diaria se cuentan desde que la hoja empezó, y sin el día en curso', () => {
    const c = calendarioDeRegistros(M, P7, SIN);
    expect(hoja(c, 'tanques').huecos).toBe(0);   // el 13 y el 14 la hoja aún no existía; el 19 es hoy
    expect(hoja(c, 'sala').huecos).toBe(1);      // el 14
    expect(hoja(c, 'ingresos').huecos).toBe(''); // una hoja de sucesos no tiene huecos
    expect(hoja(c, 'sala').diasHueco).toEqual(['2026-09-14']);
    expect(hoja(c, 'tanques').diasHueco).toEqual([]);
    expect(c.enCurso).toEqual(['2026-09-19']);
  });

  it('el calendario es de la planta entera: cualquier filtro se DICE', () => {
    const c = calendarioDeRegistros(M, P7, F({ sala: 'Sala 1', lote: 'QA' }));
    expect(c.ignora).toEqual(['sala', 'lote']);
    expect(hoja(c, 'tanques').celdas).toEqual(hoja(calendarioDeRegistros(M, P7, SIN), 'tanques').celdas);
  });
});

describe('Maduración · calidad del dato · los partes esperados frente a los registrados', () => {
  const C = coberturaDePartes(M, SERIE, PARTES, P7, SIN);

  it('🔑 un parte por tanque OCUPADO al cierre: dos partes del mismo tanque cubren UNO', () => {
    expect(sala(C, 'Sala 1').tanques).toEqual({ esperados: 8, registrados: 7, pct: 87.5 });
    expect(sala(C, 'Sala 1').celdas[iDe('2026-09-15')]).toEqual({ esperados: 2, registrados: 1, faltan: [2], registroSala: true, enCurso: false });
  });

  it('🔑 lo que cuenta es el cierre del día: el t4 cerró vacío el 17/09 y el que espera es el t5', () => {
    expect(sala(C, 'Sala 2').tanques).toEqual({ esperados: 3, registrados: 2, pct: 66.67 });
    expect(sala(C, 'Sala 2').celdas[iDe('2026-09-17')]).toMatchObject({ esperados: 1, registrados: 0, faltan: [5] });
  });

  it('un parte de un tanque que el libro tiene vacío no cubre nada, y una sala sin animales no espera nada', () => {
    expect(sala(C, 'Sala 1').celdas[iDe('2026-09-18')]).toMatchObject({ esperados: 2, registrados: 2, faltan: [] });
    expect(C.salas.map((s) => s.sala)).toEqual(['Sala 1', 'Sala 2']);   // la Sala 3 tiene registro, pero no animales
    expect(sala(C, 'Sala 2').celdas[iDe('2026-09-15')]).toBeNull();    // QB aún no había entrado
  });

  it('cada sala con animales espera su registro de Sala', () => {
    expect(sala(C, 'Sala 1').registro).toEqual({ esperados: 4, registrados: 3, pct: 75 });
    expect(sala(C, 'Sala 2').registro).toEqual({ esperados: 3, registrados: 2, pct: 66.67 });
    expect(C.faltanRegistro).toEqual([{ fecha: '2026-09-18', sala: 'Sala 1' }, { fecha: '2026-09-16', sala: 'Sala 2' }]);
  });

  it('los totales y las faltas, la más reciente primero', () => {
    expect(C.total).toEqual({ tanques: { esperados: 11, registrados: 9, pct: 81.82 }, registro: { esperados: 7, registrados: 5, pct: 71.43 } });
    expect(C.faltan).toEqual([{ fecha: '2026-09-17', sala: 'Sala 2', tanque: 5 }, { fecha: '2026-09-15', sala: 'Sala 1', tanque: 2 }]);
  });

  it('🔑 el día en curso se enseña y no se cuenta; «en curso» es relativo a HOY, no a la foto', () => {
    expect(C.enCurso).toEqual(['2026-09-19']);
    expect(sala(C, 'Sala 1').celdas[iDe('2026-09-19')]).toEqual({ esperados: 2, registrados: 0, faltan: [1, 2], registroSala: false, enCurso: true });
    const M21 = modeloOperativo(PLANTA, { hoy: '2026-09-21', fecha: FOTO });
    const C21 = coberturaDePartes(M21, SERIE, diasDeTanque(M21.fuentes.tanques), P7, SIN);
    expect(C21.enCurso).toEqual([]);
    expect(C21.total.tanques).toMatchObject({ esperados: 14, registrados: 9 });
    expect(C21.faltan.filter((x) => x.fecha === FOTO).map((x) => x.sala + ' · ' + x.tanque)).toEqual(['Sala 1 · 1', 'Sala 1 · 2', 'Sala 2 · 5']);
    expect(C21.faltanRegistro.filter((x) => x.fecha === FOTO).map((x) => x.sala)).toEqual(['Sala 1', 'Sala 2']);
  });

  it('una sala que se quedó sin animales deja de esperar su registro, y sus tanques, sus partes', () => {
    // QC pasa entero de la Sala 3 a la Sala 5 el 15/09: la Sala 3 sólo esperaba el 14.
    const M2 = modeloOperativo([
      ING('2026-09-14', 'QC', 'Sala 3', 1, 2, 2), MOV('2026-09-15', 'Sala 3', 1, 'Sala 5', 1, 2, 2),
      TQ('2026-09-14', 'Sala 3', 1), SALA('2026-09-14', 'Sala 3'),
      ...['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].flatMap((d) => [TQ(d, 'Sala 5', 1), SALA(d, 'Sala 5')]),
    ], { hoy: FOTO, fecha: FOTO });
    const C2 = coberturaDePartes(M2, serieDiaria(M2.fuentes, sumarDias(P7.desde, -1), P7.hasta), diasDeTanque(M2.fuentes.tanques), P7, SIN);
    expect(sala(C2, 'Sala 3')).toMatchObject({ tanques: { esperados: 1, registrados: 1 }, registro: { esperados: 1, registrados: 1 } });
    expect(sala(C2, 'Sala 5')).toMatchObject({ tanques: { esperados: 4, registrados: 4 }, registro: { esperados: 4, registrados: 4 } });
    expect(C2.faltan).toEqual([]);
    expect(C2.faltanRegistro).toEqual([]);
  });

  it('se filtra por sala y por tanque; con el tanque, el registro de Sala es el de su sala', () => {
    const s2 = coberturaDePartes(M, SERIE, PARTES, P7, F({ sala: 'Sala 2' }));
    expect(s2.salas.map((s) => s.sala)).toEqual(['Sala 2']);
    expect(s2.total.tanques).toMatchObject({ esperados: 3, registrados: 2 });
    const t2 = coberturaDePartes(M, SERIE, PARTES, P7, F({ sala: 'Sala 1', tanque: 2 }));
    expect(t2.total.tanques).toMatchObject({ esperados: 4, registrados: 3 });
    expect(t2.faltan).toEqual([{ fecha: '2026-09-15', sala: 'Sala 1', tanque: 2 }]);
    expect(t2.total.registro).toMatchObject({ esperados: 4, registrados: 3 });
    expect(t2.ignora).toEqual([]);
  });

  it('lote, código, estado y sexo no se pueden aplicar a un parte de tanque: se DICEN', () => {
    const q = coberturaDePartes(M, SERIE, PARTES, P7, F({ lote: 'QA', codigo: 'CA', estado: 'Cuarentena', sexo: 'hembras' }));
    expect(q.ignora).toEqual(['lote', 'código genético', 'estado', 'sexo']);
    expect(q.total).toEqual(C.total);
  });
});

describe('Maduración · calidad del dato · el estado registrado frente al propuesto', () => {
  it('cada sala visible, con su situación y los días que tiene el registrado', () => {
    const e = comparacionDeEstados(M, SIN);
    expect(e.filas.map((f) => [f.sala, f.situacion])).toEqual([
      ['Sala 1', 'coinciden'], ['Sala 2', 'difieren'], ['Sala 3', 'sin-propuesta'], ['Sala 4', 'sin-datos'], ['Sala 5', 'sin-datos']]);
    expect(e.filas[0]).toMatchObject({ registrado: { estado: 'Cuarentena', fecha: '2026-09-17' }, propuesto: { estado: 'Cuarentena' }, desfaseDias: 2 });
    expect(e.filas[1]).toMatchObject({ registrado: { estado: 'Producción' }, propuesto: { estado: 'Cuarentena' }, etiqueta: 'Difieren' });
    expect(e).toMatchObject({ coinciden: 1, difieren: 1, sinComparar: 3 });
  });

  it('una sala con animales y sin estado registrado', () => {
    const e = comparacionDeEstados({ salas: [{ sala: 'Sala 9', registrado: { estado: '' }, propuesto: { estado: 'Cuarentena' }, coinciden: null }] }, SIN);
    expect(e.filas[0]).toMatchObject({ situacion: 'sin-registro', etiqueta: SITUACIONES_ESTADO['sin-registro'] });
    expect(e.sinComparar).toBe(1);
  });

  it('se filtra por sala; el tanque no, porque el estado es de la sala entera', () => {
    expect(comparacionDeEstados(M, F({ sala: 'Sala 2' })).filas.map((f) => f.sala)).toEqual(['Sala 2']);
    expect(comparacionDeEstados(M, F({ sala: 'Sala 1', tanque: 1 })).ignora).toEqual(['tanque']);
  });
});

describe('Maduración · calidad del dato · los avisos del libro', () => {
  it('🔑 los 14 tipos aunque vayan a cero, con su total y los del período', () => {
    const a = avisosDelLibro(M, P7, SIN);
    expect(a.tipos).toHaveLength(Object.keys(TIPOS_AVISO).length);
    expect(a.tipos.every((t) => t.conocido)).toBe(true);
    expect(a.tipos.slice(0, 4).map((t) => [t.tipo, t.total, t.enPeriodo])).toEqual([
      ['deficit', 1, 1], ['movimiento-incompleto', 1, 1], ['sin-ingreso', 1, 1], ['ingreso-incompleto', 1, 0]]);
    expect(a.tipos.slice(4).every((t) => t.total === 0 && t.enPeriodo === 0)).toBe(true);
    expect(a).toMatchObject({ aplica: true, total: 4, enPeriodo: 3 });
  });

  it('el detalle del período, el más reciente primero, con dónde ocurrió', () => {
    const a = avisosDelLibro(M, P7, SIN);
    expect(a.detalle.map((d) => [d.fecha, d.tipo, d.lugar])).toEqual([
      ['2026-09-18', 'movimiento-incompleto', 'Sala 2 · 5 → Sala 2 · ?'],
      ['2026-09-18', 'sin-ingreso', 'Sala 1 · 3'],
      ['2026-09-16', 'deficit', 'Sala 1 · 1']]);
    expect(a.detalle[2]).toMatchObject({ sexo: 'machos', cantidad: 5, etiqueta: TIPOS_AVISO.deficit });
    const todo = avisosDelLibro(M, periodoDe('todo', FOTO, M.fuentes), SIN);
    expect(todo.detalle.find((d) => d.tipo === 'ingreso-incompleto')).toMatchObject({ lugar: 'Sala 1 · ?', lote: 'QZ' });
  });

  it('🔑 con la MISMA regla de filtro que las alertas de la portada', () => {
    for (const f of [{}, { sala: 'Sala 1' }, { sala: 'Sala 1', tanque: 3 }, { lote: 'QA' }, { codigo: 'CA' }]) {
      const a = avisosDelLibro(M, P7, F(f));
      const p = alertas(M, P7, F(f)).avisos;
      expect([a.total, a.enPeriodo], JSON.stringify(f)).toEqual([p.total, p.enPeriodo]);
    }
    expect(avisosDelLibro(M, P7, F({ sala: 'Sala 1' })).total).toBe(3);
    expect(avisosDelLibro(M, P7, F({ sala: 'Sala 1', tanque: 3 })).detalle.map((d) => d.tipo)).toEqual(['sin-ingreso']);
  });

  it('con el código genético no aplican: los avisos no lo dicen', () => {
    const a = avisosDelLibro(M, P7, F({ codigo: 'CA' }));
    expect(a).toMatchObject({ aplica: false, total: 0, enPeriodo: 0, detalle: [] });
    expect(a.tipos).toHaveLength(Object.keys(TIPOS_AVISO).length);
    expect(a.ignora).toEqual(['código genético']);
  });

  it('un tipo que el libro anote sin rótulo aquí no se pierde: sale con su nombre, marcado', () => {
    const conNuevo = { ...M, libro: { ...M.libro, avisos: [...M.libro.avisos, { fecha: '2026-09-18', tipo: 'tipo-nuevo', texto: 'x' }] } };
    const t = avisosDelLibro(conNuevo, P7, SIN).tipos.find((x) => x.tipo === 'tipo-nuevo');
    expect(t).toEqual({ tipo: 'tipo-nuevo', etiqueta: 'tipo-nuevo', conocido: false, total: 1, enPeriodo: 1 });
  });
});

describe('Maduración · calidad del dato · lo que no se puede filtrar', () => {
  it('nombra sólo los filtros ACTIVOS que la pieza no aplica; el tanque cuenta aunque valga 0', () => {
    expect(ignoraDeCalidad(SIN, [])).toEqual([]);
    expect(ignoraDeCalidad(F({ sala: 'Sala 1', tanque: 0 }), ['sala'])).toEqual(['tanque']);
    expect(ignoraDeCalidad(F({ piscina: 'PZ1', camaronera: 'CX' }), ['sala'])).toEqual(['piscina', 'camaronera']);
  });
});
