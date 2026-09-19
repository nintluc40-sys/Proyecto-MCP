/* ============================================================
   MADURACIÓN · OPERATIVO — lo que enseña el tablero (F1)

   Qué se exige, y con fixtures que distinguen lo correcto de lo equivocado:
   · El período termina en la foto; «Todo» empieza en la primera fecha registrada (Broodstock por su corte).
   · El tanque sólo con su sala: la Sala 1 y la Sala 4 tienen las dos un tanque 1.
   · El lote y el código casan por su forma canónica («qa» es el lote QA).
   · El estado de un lote es el de ESA sala: QA produce en la Sala 1 y está en cuarentena en la Sala 2.
   · La mortalidad es la del ⚖️ Saldo: muertos ÷ en riesgo (vivos de la víspera + los que ingresaron), y por sala
     sólo se cuentan las muertes registradas; los descartes no son muertes.
   · La fertilidad y los nauplios por hembra, sólo sobre los desoves con su N2 / su N5.
   · La T° y el O₂ de una sala salen del último registro que TRAE cada variable, el mismo que usa el Saldo.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PERIODOS, PERIODO_INICIAL, primeraFecha, periodoDe, normalizarFiltro, hayFiltro, posicionEnFiltro,
  kpiVivos, kpiLotes, kpiSalas, kpiOcupacion, kpiMortalidad, kpiReproduccion,
  mapaDePlanta, MODOS_MAPA, ESTADO_VACIO, ESTADO_SIN, alertas, TIPOS_AVISO, ultimosRegistros, ETIQUETA_HOJA, ESPERA_DIAS,
  finesDeCuarentena, AVISO_CUARENTENA_DIAS, lecturasDelUltimoRegistro, evaluarLecturas, tarjetasDeSalas, detalleDeSala,
} from './operativo.tablero.js';
import { modeloOperativo, serieDiaria, diasDeTanque, SALAS_VISIBLES } from './operativo.data.js';
import { MAD_OP_HOJAS, MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';
import { RESUMEN_TEMPS, RESUMEN_OXIGENOS } from '../registros/lib/mad-resumen.js';
import { MAD_TANQUES_POR_SALA } from '../registros/lib/ficha-maduracion-ingreso.schema.js';

/* Filas como llegan al store (origen «Maduracion», con la firma de su hoja). */
const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA') => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': cg, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, 'Temperatura 2:00': '', Fecha: fecha, Sala: sala, ...extra });
const TRAT = (fecha, sala, tipo) => ({ _SheetOrigin: O, 'Productos RAS': '', Fecha: fecha, Sala: sala, Tipo: tipo });
const INF = (fecha, extra) => ({ _SheetOrigin: O, 'Tipo de tanque': '', Fecha: fecha, ...extra });
const FIN = (fecha, extra) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '', Fecha: fecha, ...extra });
const todas = (v) => Object.fromEntries(RESUMEN_TEMPS.map((c) => [c, v]));
const oxs = (v) => Object.fromEntries(RESUMEN_OXIGENOS.map((c) => [c, v]));

const FOTO = '2026-09-19';
/* La planta de las pruebas, al cierre del 19/09:
   · Sala 1 tanque 1: QA (10♂ 20♀, CA) y QC (2♂ 2♀, CB), los dos en producción desde agosto.
   · Sala 2 tanque 16: QD (3♂ 3♀, CB) en producción y QA (5♂ 5♀, CB), que entró el 11/09: en cuarentena EN ESA SALA.
   · Sala 4 tanque 1 —el mismo número que el de la Sala 1—: QB (8♂ 8♀, CA), que entró el 12/09. */
const PLANTA = [
  ING('2026-08-01', 'QA', 'Sala 1', 1, 10, 20, 'CA'),
  ING('2026-08-01', 'QC', 'Sala 1', 1, 2, 2, 'CB'),
  ING('2026-08-01', 'QD', 'Sala 2', 16, 3, 3, 'CB'),
  ING('2026-09-11', 'QA', 'Sala 2', 16, 5, 5, 'CB'),
  ING('2026-09-12', 'QB', 'Sala 4', 1, 8, 8, 'CA'),
  SALA('2026-09-18', 'Sala 1', { Estado: 'Producción', 'Temperatura 2:00': 28, 'Temperatura 4:00': 29, 'Temperatura 6:00': 27.9,
    'Temperatura 8:00': 29.1, 'Oxígeno 06:00': 3.9, 'Oxígeno 12:00': 4, RAS: 1, Toneladas: 5.5 }),
  SALA('2026-09-19', 'Sala 1', { 'Oxígeno 18:00': 4.5 }),                       // sólo O₂: no borra la T° del 18
  SALA('2026-09-05', 'Sala 1', { 'Temperatura 2:00': 20 }),                     // fuera de un período de 7 días
  SALA('2026-09-19', 'Sala 2', { Estado: 'Mixto', ...todas(28.5), ...oxs(5) }),
  SALA('2026-09-19', 'Sala 4', { 'Temperatura 2:00': 30 }),
  INF('2026-09-18', { 'Área': 'Sala 1', 'Alcalinidad día': 95, 'Alcalinidad noche': 120 }),
  TRAT('2026-09-12', 'Sala 1', 'Desinfección'),
  TRAT('2026-09-17', 'Sala 1', 'Preventivo'),                                   // un preventivo no es una desinfección
  TQ('2026-09-16', 'Sala 5', 9, { 'Machos muertos': 1 }),                       // bajas que ningún ingreso explica
  FIN('2026-09-01', { Tipo: 'Parcial' }),                                        // un cierre sin lote
];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);

describe('Maduración · tablero · período y filtros', () => {
  it('el período termina en la foto: hoy, 7 d, 30 d (el de por defecto), el mes y una clave desconocida', () => {
    expect(PERIODOS.map((p) => p.clave)).toEqual(['hoy', '7d', '30d', 'mes', 'todo']);
    expect(PERIODO_INICIAL).toBe('30d');
    expect(periodoDe('hoy', FOTO, {})).toEqual({ clave: 'hoy', desde: FOTO, hasta: FOTO, dias: 1 });
    expect(periodoDe('7d', FOTO, {})).toEqual({ clave: '7d', desde: '2026-09-13', hasta: FOTO, dias: 7 });
    expect(periodoDe('30d', FOTO, {})).toEqual({ clave: '30d', desde: '2026-08-21', hasta: FOTO, dias: 30 });
    expect(periodoDe('mes', FOTO, {})).toEqual({ clave: 'mes', desde: '2026-09-01', hasta: FOTO, dias: 19 });
    expect(periodoDe('otra', FOTO, {})).toMatchObject({ clave: '30d', desde: '2026-08-21' });
  });

  it('«Todo» empieza en la primera fecha registrada hasta la foto (Broodstock por su corte, lo posterior no cuenta)', () => {
    const f = { ingresos: [{ Fecha: '2026-08-10' }, { Fecha: 'no es fecha' }], tanques: [{ Fecha: '2026-06-01' }],
      broodstock: [{ 'Fecha de corte': '2026-07-01' }], sala: [{ Fecha: '2026-09-25' }] };
    expect(primeraFecha({ ...f, tanques: [] }, FOTO)).toBe('2026-07-01');
    expect(periodoDe('todo', FOTO, { ...f, tanques: [] })).toMatchObject({ desde: '2026-07-01', hasta: FOTO });
    expect(primeraFecha(f, '2026-05-01')).toBe('');
    expect(periodoDe('todo', '2026-05-01', f)).toMatchObject({ desde: '2026-05-01', dias: 1 });
  });

  it('el filtro: el tanque sólo con su sala y como número; lote y código canónicos', () => {
    expect(normalizarFiltro({ tanque: 3 })).toEqual({ sala: '', tanque: null, lote: '', codigo: '' });
    expect(normalizarFiltro({ sala: 'Sala 4', tanque: '1', lote: ' qa ', codigo: 'c b' })).toEqual({ sala: 'Sala 4', tanque: 1, lote: 'QA', codigo: 'CB' });
    expect(hayFiltro(SIN)).toBe(false);
    expect(hayFiltro(F({ codigo: 'x' }))).toBe(true);
    const p = { sala: 'Sala 1', tanque: 1, lote: 'QA', codigoGenetico: 'CA' };
    expect(posicionEnFiltro(p, F({ sala: 'Sala 1', tanque: 1 }))).toBe(true);
    expect(posicionEnFiltro({ ...p, sala: 'Sala 4' }, F({ sala: 'Sala 1', tanque: 1 }))).toBe(false);
    expect(posicionEnFiltro(p, F({ lote: 'qa', codigo: 'ca' }))).toBe(true);
    expect(posicionEnFiltro(p, F({ codigo: 'CB' }))).toBe(false);
    // El libro guarda el lote y el código TAL COMO se tecleó: también casan por su forma canónica.
    expect(posicionEnFiltro({ ...p, lote: 'qa ', codigoGenetico: 'c a' }, F({ lote: 'QA', codigo: 'CA' }))).toBe(true);
  });
});

describe('Maduración · tablero · los seis indicadores de la portada', () => {
  it('vivos por sexo y H:M, con cada filtro; el tanque 1 de la Sala 1 no es el de la Sala 4', () => {
    expect(kpiVivos(M.libro, SIN)).toEqual({ machos: 28, hembras: 38, total: 66, hm: 1.36, hmEstado: 'ok' });
    expect(kpiVivos(M.libro, F({ sala: 'Sala 1', tanque: 1 }))).toMatchObject({ machos: 12, hembras: 22 });
    expect(kpiVivos(M.libro, F({ lote: 'qa' }))).toMatchObject({ machos: 15, hembras: 25 });
    expect(kpiVivos(M.libro, F({ codigo: 'cb' }))).toMatchObject({ machos: 10, hembras: 10 });
  });

  it('lotes por estado: el de cada sala donde están los animales, y Mixto si sus salas no coinciden', () => {
    expect(kpiLotes(M.libro, SIN)).toMatchObject({ total: 4, produccion: 2, cuarentena: 1, mixto: 1, otros: 0 });
    expect(kpiLotes(M.libro, SIN).lotes).toEqual([
      { lote: 'QA', estado: 'Mixto' }, { lote: 'QB', estado: 'Cuarentena' }, { lote: 'QC', estado: 'Producción' }, { lote: 'QD', estado: 'Producción' }]);
    // En la Sala 2, QA está en cuarentena (su reloj de ESA sala), no «Mixto».
    expect(kpiLotes(M.libro, F({ sala: 'Sala 2' }))).toMatchObject({ total: 2, produccion: 1, cuarentena: 1, mixto: 0 });
    // Los animales CA de QA están sólo en la Sala 1: en producción.
    expect(kpiLotes(M.libro, F({ codigo: 'CA' }))).toMatchObject({ total: 2, produccion: 1, cuarentena: 1, mixto: 0 });
  });

  it('salas: la hoja difiere del libro en una; las que no tienen uno de los dos no se comparan', () => {
    expect(kpiSalas(M.salas, SIN)).toEqual({ total: 5, difieren: 1, coinciden: 1, sinRegistro: 3, sinPropuesta: 2 });
    expect(kpiSalas(M.salas, F({ sala: 'Sala 2' }))).toEqual({ total: 1, difieren: 0, coinciden: 1, sinRegistro: 0, sinPropuesta: 0 });
  });

  it('ocupación: de los 38 tanques físicos; por sala; un tanque; los tanques de un código (sala + tanque)', () => {
    expect(kpiOcupacion(M.salas, M.libro, SIN)).toEqual({ modo: 'salas', ocupados: 3, total: 38, pct: 7.89 });
    expect(kpiOcupacion(M.salas, M.libro, F({ sala: 'Sala 1' }))).toEqual({ modo: 'salas', ocupados: 1, total: 15, pct: 6.67 });
    expect(kpiOcupacion(M.salas, M.libro, F({ sala: 'Sala 1', tanque: 2 }))).toEqual({ modo: 'tanque', ocupados: 0, total: 1, pct: 0 });
    expect(kpiOcupacion(M.salas, M.libro, F({ sala: 'Sala 1', tanque: 1 }))).toMatchObject({ ocupados: 1, pct: 100 });
    expect(kpiOcupacion(M.salas, M.libro, F({ codigo: 'CA' }))).toEqual({ modo: 'lote', ocupados: 2, total: 38, pct: 5.26 });
  });
});

describe('Maduración · tablero · la mortalidad (regla del ⚖️ Saldo)', () => {
  /* QA entra el 01/09 con 50♂ 50♀ y recibe 10♂ 10♀ el 15/09; QB entra el MISMO día de la foto, tecleado «qb» (el
     libro lo guarda así). El 18/09 hay 4 machos descartados: son bajas, pero no muertes. El 13/09 —el primer día del
     período de 7 días— muere una hembra. */
  const FILAS = [
    ING('2026-09-01', 'QA', 'Sala 1', 1, 50, 50),
    TQ('2026-09-10', 'Sala 1', 1, { 'Machos muertos': 5, 'Hembras muertas': 5 }),
    TQ('2026-09-13', 'Sala 1', 1, { 'Hembras muertas': 1 }),
    ING('2026-09-15', 'QA', 'Sala 1', 2, 10, 10),
    TQ('2026-09-18', 'Sala 1', 1, { 'Machos muertos': 2, 'Hembras muertas': 3, 'Machos muertos por descarte de selección': 4 }),
    ING('2026-09-19', 'qb', 'Sala 4', 1, 20, 20),
    TQ('2026-09-19', 'Sala 4', 1, { 'Hembras muertas': 2 }),
    TQ('2026-09-19', 'Sala 1', 1, { 'Machos muertos': 1 }),
    INF('2026-09-19', { Lote: 'QA', 'Tipo de tanque': 'Desove', 'Hembras que entran': 10, 'Hembras muertas': 1 }),
  ];
  const m = modeloOperativo(FILAS, { hoy: FOTO, fecha: FOTO });
  const p = periodoDe('7d', FOTO, m.fuentes);
  const serie = serieDiaria(m.fuentes, sumarDias(p.desde, -1), p.hasta);
  const partes = diasDeTanque(m.fuentes.tanques);

  it('del día: muertos ÷ (vivos de la víspera + los que ingresaron ese día), sumando los lotes', () => {
    // QA: 2 muertos de 100 vivos; QB: 2 de los 40 que entraron hoy. La mortalidad en desove cuenta (es del lote).
    expect(kpiMortalidad(serie, p, SIN, partes)).toMatchObject({ modo: 'tasa', dia: { muertos: 4, riesgo: 140, pct: 2.86 } });
  });

  it('del período: desde la VÍSPERA de su primer día; los descartes no son muertes', () => {
    // QA: 8 muertos sobre 90 vivos el 12/09 + 20 ingresados; QB: 2 sobre 40.
    expect(kpiMortalidad(serie, p, SIN, partes).periodo).toEqual({ muertos: 10, riesgo: 150, pct: 6.67 });
  });

  it('con lote, la del lote (canónico); con código, no aplica; sin la víspera en la serie, no se inventa', () => {
    expect(kpiMortalidad(serie, p, F({ lote: 'qb' }), partes)).toMatchObject({ dia: { muertos: 2, riesgo: 40, pct: 5 }, periodo: { pct: 5 } });
    expect(kpiMortalidad(serie, p, F({ codigo: 'CA' }), partes)).toEqual({ modo: 'no-aplica' });
    expect(kpiMortalidad(serieDiaria(m.fuentes, p.desde, p.hasta), p, SIN, partes)).toEqual({ modo: 'sin-serie' });
  });

  it('con sala o tanque, las muertes REGISTRADAS en la hoja Tanques, sin descartes ni mortalidad en desove', () => {
    expect(kpiMortalidad(serie, p, F({ sala: 'Sala 1' }), partes)).toEqual({ modo: 'registradas', dia: { muertos: 1 }, periodo: { muertos: 7 } });
    expect(kpiMortalidad(serie, p, F({ sala: 'Sala 4', tanque: 1 }), partes)).toEqual({ modo: 'registradas', dia: { muertos: 2 }, periodo: { muertos: 2 } });
    expect(kpiMortalidad(serie, p, F({ sala: 'Sala 1', tanque: 2 }), partes)).toEqual({ modo: 'registradas', dia: { muertos: 0 }, periodo: { muertos: 0 } });
  });
});

describe('Maduración · tablero · la reproducción del período', () => {
  const D = (fecha, lote, cg, desoves, huevos, n2, n5, noViables = 0) => ({ Fecha: fecha, Lote: lote, 'Código genético': cg, Desoves: desoves,
    'Total de huevos': huevos, N2: n2, N5: n5, 'Hembras no viables': noViables });
  const DESOVES = [
    D('2026-09-10', 'QA', 'CA', 2, 400000, 300000, 250000),          // antes del período
    D('2026-09-14', 'qa', 'ca', 3, 600000, 480000, '', 1),           // N5 pendiente
    D('2026-09-18', 'QA', 'CB', 1, 200000, '', 150000),              // N2 pendiente
    D('2026-09-19', 'QB', 'CA', 4, 800000, 640000, 700000),
    D('2026-09-20', 'QA', 'CA', 9, 900000, 900000, 900000),          // después de la foto
  ];
  const p = periodoDe('7d', FOTO, {});

  it('fertilidad sobre los huevos de los desoves CON N2, y nauplios por hembra sobre los desoves CON N5', () => {
    expect(kpiReproduccion(DESOVES, p, SIN)).toEqual({ desoves: 8, huevos: 1600000, noViables: 1, n2: 1120000, n5: 850000,
      fertilidad: 80, naupliosPorHembra: 170000, ignora: [] });
  });

  it('con lote y código canónicos; la sala no se aplica a un desove y se dice', () => {
    expect(kpiReproduccion(DESOVES, p, F({ lote: 'QA' }))).toMatchObject({ desoves: 4, fertilidad: 80, naupliosPorHembra: 150000 });
    expect(kpiReproduccion(DESOVES, p, F({ lote: 'QA', codigo: 'CA' }))).toMatchObject({ desoves: 3 });
    expect(kpiReproduccion(DESOVES, p, F({ sala: 'Sala 1' }))).toMatchObject({ desoves: 8, ignora: ['sala'] });
  });
});

describe('Maduración · tablero · el mapa de planta', () => {
  const mapa = mapaDePlanta(M.libro, SIN);
  const celda = (sala, t, mp = mapa) => mp.salas.find((s) => s.sala === sala).tanques.find((x) => x.tanque === t);

  it('las cinco salas con sus tanques FÍSICOS, en su orden (38)', () => {
    expect(mapa.salas.map((s) => s.sala)).toEqual(SALAS_VISIBLES);
    for (const s of mapa.salas) expect(s.tanques.map((t) => t.tanque)).toEqual(MAD_TANQUES_POR_SALA[s.sala]);
    expect(mapa.salas.reduce((a, s) => a + s.tanques.length, 0)).toBe(38);
    expect(MODOS_MAPA.map((x) => x.clave)).toEqual(['estado', 'vivos', 'densidad']);
  });

  it('el estado de un tanque es el de sus lotes EN ESA SALA; Mixto si no coinciden; vacío sin animales', () => {
    expect(celda('Sala 1', 1)).toMatchObject({ estado: 'Producción', machos: 12, hembras: 22, vivos: 34, densidad: 2.59, densidadEstado: 'bajo' });
    expect(celda('Sala 1', 1).lotes).toEqual([
      { lote: 'QA', estado: 'Producción', codigos: ['CA'], machos: 10, hembras: 20 }, { lote: 'QC', estado: 'Producción', codigos: ['CB'], machos: 2, hembras: 2 }]);
    expect(celda('Sala 2', 16)).toMatchObject({ estado: 'Mixto', vivos: 16, densidad: 0.32 });
    expect(celda('Sala 4', 1)).toMatchObject({ estado: 'Cuarentena', vivos: 16 });
    expect(celda('Sala 1', 2)).toMatchObject({ estado: ESTADO_VACIO, vivos: 0, densidad: '', densidadEstado: '' });
    expect(mapa.porEstado).toEqual({ Producción: 1, Mixto: 1, Cuarentena: 1, [ESTADO_VACIO]: 35 });
    expect(mapa.porDensidad).toEqual({ ok: 0, bajo: 3, alto: 0, sinDato: 0 });
    expect(mapa.maxVivos).toBe(34);
  });

  it('el filtro no quita tanques: marca los que casan (el tanque 1 de la Sala 4 no es el de la Sala 1)', () => {
    const conQA = mapaDePlanta(M.libro, F({ lote: 'qa' }));
    expect(conQA.salas.flatMap((s) => s.tanques.filter((t) => t.enFiltro).map((t) => t.sala + '·' + t.tanque))).toEqual(['Sala 1·1', 'Sala 2·16']);
    const t41 = mapaDePlanta(M.libro, F({ sala: 'Sala 4', tanque: 1 }));
    expect(t41.salas.flatMap((s) => s.tanques.filter((t) => t.enFiltro).map((t) => t.sala + '·' + t.tanque))).toEqual(['Sala 4·1']);
    expect(celda('Sala 1', 1, t41).enFiltro).toBe(false);
    expect(mapa.salas.every((s) => s.tanques.every((t) => t.enFiltro))).toBe(true);
  });

  it('un tanque ocupado fuera del catálogo se enseña (marcado); uno vacío, no; un lote sin fecha de ingreso, «Sin estado»', () => {
    const m2 = modeloOperativo([
      ING('2026-09-01', 'QF', 'Sala 3', 99, 1, 1),
      ING('2026-09-01', 'QG', 'Sala 3', 98, 1, 1),
      TQ('2026-09-02', 'Sala 3', 98, { 'Machos muertos': 1, 'Hembras muertas': 1 }),
      ING('', 'QH', 'Sala 5', 7, 1, 1),
    ], { hoy: FOTO, fecha: FOTO });
    const mp = mapaDePlanta(m2.libro, SIN);
    expect(mp.salas.find((s) => s.sala === 'Sala 3').tanques.map((t) => t.tanque)).toEqual([22, 23, 24, 25, 26, 27, 99]);
    expect(celda('Sala 3', 99, mp)).toMatchObject({ fueraDeCatalogo: true, vivos: 2 });
    expect(celda('Sala 3', 22, mp).fueraDeCatalogo).toBe(false);
    expect(celda('Sala 5', 7, mp).estado).toBe(ESTADO_SIN);
    // QG se quedó sin animales: no es un lote presente.
    expect(kpiLotes(m2.libro, SIN).lotes.map((l) => l.lote)).toEqual(['QF', 'QH']);
  });
});

describe('Maduración · tablero · alertas', () => {
  const p = periodoDe('7d', FOTO, M.fuentes);

  it('hoja ≠ libro, T° y O₂ fuera del umbral en el período (los extremos, dentro) y los avisos del libro', () => {
    const a = alertas(M, p, SIN);
    expect(a.estados).toEqual([{ sala: 'Sala 1', registrado: M.salas[0].registrado, propuesto: M.salas[0].propuesto }]);
    expect(a.temperatura.porSala).toEqual([{ sala: 'Sala 1', lecturas: 4, fuera: 2, pct: 50 }, { sala: 'Sala 4', lecturas: 1, fuera: 1, pct: 100 }]);
    expect(a.temperatura.umbral).toMatchObject({ min: 28, max: 29, origen: 'bibliografía' });
    expect(a.oxigeno.porSala).toEqual([{ sala: 'Sala 1', lecturas: 3, fuera: 1, pct: 33.33 }]);
    expect(a.avisos).toMatchObject({ aplica: true, total: 2, enPeriodo: 1 });
    expect(a.avisos.porTipo).toEqual([
      { tipo: 'cierre-incompleto', etiqueta: TIPOS_AVISO['cierre-incompleto'], n: 1 }, { tipo: 'sin-ingreso', etiqueta: TIPOS_AVISO['sin-ingreso'], n: 1 }]);
    expect(a.avisos.recientes.map((x) => [x.fecha, x.tipo])).toEqual([['2026-09-16', 'sin-ingreso'], ['2026-09-01', 'cierre-incompleto']]);
    expect(a.total).toBe(5);
  });

  it('con filtro, sólo lo de lo filtrado: un aviso que no dice su sala o su lote no se atribuye', () => {
    const s1 = alertas(M, p, F({ sala: 'Sala 1' }));
    expect(s1.temperatura.porSala.map((x) => x.sala)).toEqual(['Sala 1']);
    expect(s1.avisos.total).toBe(0);
    expect(alertas(M, p, F({ sala: 'Sala 5', tanque: 9 })).avisos.total).toBe(1);
    expect(alertas(M, p, F({ sala: 'Sala 5', tanque: 8 })).avisos.total).toBe(0);
    const qb = alertas(M, p, F({ lote: 'QB' }));
    expect(qb.temperatura.porSala.map((x) => x.sala)).toEqual(['Sala 4']);
    expect(qb.estados).toEqual([]);
    expect(qb.avisos.total).toBe(0);
    const ca = alertas(M, p, F({ codigo: 'CA' }));
    expect(ca.avisos).toMatchObject({ aplica: false, total: 0 });
    expect(ca.temperatura.porSala.map((x) => x.sala)).toEqual(['Sala 1', 'Sala 4']);
  });

  it('cada tipo de aviso que el libro sabe anotar tiene su rótulo', () => {
    const libro = readFileSync(new URL('../registros/lib/mad-libro.js', import.meta.url), 'utf8');
    const tipos = [...new Set([...libro.matchAll(/anota\(fecha, '([a-z-]+)'/g)].map((x) => x[1]))];
    expect(tipos.length).toBe(14);
    expect(Object.keys(TIPOS_AVISO).sort()).toEqual(tipos.sort());
  });
});

describe('Maduración · tablero · últimos registros y fines de cuarentena', () => {
  it('cada hoja con su rótulo de ficha; sólo las DIARIAS se marcan atrasadas, y con más de un día', () => {
    expect(Object.keys(ETIQUETA_HOJA).sort()).toEqual(MAD_OP_HOJAS.map((h) => h.clave).sort());
    expect(ESPERA_DIAS).toEqual({ sala: 1, tanques: 1 });
    const u = Object.fromEntries(ultimosRegistros([
      { clave: 'sala', hoja: 'Maduración Sala', filas: 3, ultima: '2026-09-17', dias: 2, futuras: 0 },
      { clave: 'tanques', hoja: 'Maduración Tanques', filas: 3, ultima: '2026-09-18', dias: 1, futuras: 0 },
      { clave: 'ingresos', hoja: 'Maduración Ingreso', filas: 3, ultima: '2026-08-01', dias: 49, futuras: 0 },
      { clave: 'alimentacion', hoja: 'Maduración Alimentación', filas: 0, ultima: '', dias: '', futuras: 0 },
    ]).map((x) => [x.clave, x]));
    expect(u.sala).toMatchObject({ etiqueta: '🏠 Salas', atrasada: true });
    expect(u.tanques.atrasada).toBe(false);
    expect(u.ingresos.atrasada).toBe(false);
    expect(u.alimentacion.atrasada).toBe(false);
  });

  it('salen de cuarentena en los próximos 7 días: el ingreso EN ESA SALA + 15, con el día 7 dentro y el 8 fuera', () => {
    expect(AVISO_CUARENTENA_DIAS).toBe(7);
    expect(finesDeCuarentena(M.libro, FOTO, SIN)).toEqual([
      { lote: 'QA', sala: 'Sala 2', machos: 5, hembras: 5, ingreso: '2026-09-11', fin: '2026-09-26', enDias: 7 }]);
    expect(finesDeCuarentena(M.libro, FOTO, SIN, 8).map((x) => [x.lote, x.sala, x.fin])).toEqual([
      ['QA', 'Sala 2', '2026-09-26'], ['QB', 'Sala 4', '2026-09-27']]);
    expect(finesDeCuarentena(M.libro, FOTO, F({ sala: 'Sala 4' }), 8).map((x) => x.lote)).toEqual(['QB']);
  });

  it('una cópula la termina antes; y el reloj es el de la sala, no el del último ingreso del lote', () => {
    const m2 = modeloOperativo([
      ING('2026-09-12', 'QB', 'Sala 4', 1, 8, 8), TQ('2026-09-15', 'Sala 4', 1, { 'Cópulas': 1 }),
      ING('2026-09-10', 'QH', 'Sala 3', 22, 4, 4), ING('2026-09-18', 'QH', 'Sala 5', 7, 4, 4),
    ], { hoy: FOTO, fecha: FOTO });
    expect(finesDeCuarentena(m2.libro, FOTO, SIN).map((x) => [x.lote, x.sala, x.fin, x.enDias])).toEqual([['QH', 'Sala 3', '2026-09-25', 6]]);
  });
});

describe('Maduración · tablero · las salas', () => {
  const T = Object.fromEntries(tarjetasDeSalas(M, SIN).map((t) => [t.sala, t]));

  it('una tarjeta por sala; con filtro de sala, sólo la suya', () => {
    expect(Object.keys(T)).toEqual(SALAS_VISIBLES);
    expect(tarjetasDeSalas(M, F({ sala: 'Sala 2' })).map((t) => t.sala)).toEqual(['Sala 2']);
  });

  it('hoja y libro, ocupación, vivos y los lotes con sus días en la sala', () => {
    expect(T['Sala 1']).toMatchObject({ registrado: { estado: 'Producción', fecha: '2026-09-18' },
      propuesto: { estado: 'Desinfección - Producción agrupada' }, coinciden: false, ocupacion: { ocupados: 1, total: 15, pct: 6.67 },
      vivos: { machos: 12, hembras: 22, hm: 1.83, hmEstado: 'ok' } });
    expect(T['Sala 1'].lotes).toEqual([
      { lote: 'QA', estado: 'Producción', machos: 10, hembras: 20, dias: { sala: 'Sala 1', estado: 'Producción', diasCuarentena: 15, diasProduccion: 34 } },
      { lote: 'QC', estado: 'Producción', machos: 2, hembras: 2, dias: { sala: 'Sala 1', estado: 'Producción', diasCuarentena: 15, diasProduccion: 34 } }]);
    expect(T['Sala 2'].lotes.map((l) => [l.lote, l.estado, l.dias.diasCuarentena])).toEqual([['QA', 'Cuarentena', 8], ['QD', 'Producción', 15]]);
    expect(tarjetasDeSalas(M, F({ lote: 'qa' }))[0]).toMatchObject({ vivos: { machos: 10, hembras: 20 } });
    expect(tarjetasDeSalas(M, F({ lote: 'qa' }))[0].lotes.map((l) => l.lote)).toEqual(['QA']);
  });

  it('T° y O₂ de su ÚLTIMO registro con esa variable, con sus extremos y semáforo; alcalinidad, RAS, toneladas y desinfección', () => {
    const s1 = T['Sala 1'];
    expect(s1.temp).toMatchObject({ prom: 28.5, fecha: '2026-09-18', min: 27.9, max: 29.1, estado: 'fuera' });
    expect(s1.ox).toMatchObject({ prom: 4.5, fecha: '2026-09-19', min: 4.5, max: 4.5, estado: 'ok' });
    expect(s1.alcalinidad).toEqual({ dia: { valor: 95, fecha: '2026-09-18', estado: 'bajo' }, noche: { valor: 120, fecha: '2026-09-18', estado: 'ok' } });
    expect(s1.ras).toEqual({ texto: '100%', fecha: '2026-09-18' });   // la hoja lo guarda como la fracción 1
    expect(s1.toneladas).toEqual({ valor: 5.5, fecha: '2026-09-18' });
    expect(s1.desinfeccion).toEqual({ fecha: '2026-09-12', dias: 7 });
    expect(T['Sala 3']).toMatchObject({ temp: { prom: '', estado: '' }, ras: { texto: '' }, desinfeccion: { fecha: '', dias: '' } });
  });

  it('🔑 los extremos salen del MISMO registro que el promedio del Saldo, también con dos registros el mismo día', () => {
    const m2 = modeloOperativo([
      SALA('2026-09-18', 'Sala 1', { 'Temperatura 2:00': 27, 'Temperatura 4:00': 30 }),
      SALA('2026-09-18', 'Sala 1', { 'Temperatura 14:00': 28.2 }),
      SALA('2026-09-19', 'Sala 1', { Estado: 'Producción' }),
    ], { hoy: FOTO, fecha: FOTO });
    const t = tarjetasDeSalas(m2, SIN)[0];
    const saldo = m2.resumen.salas.find((s) => s.sala === 'Sala 1').temp;
    expect(t.temp).toMatchObject({ prom: saldo.prom, fecha: saldo.fecha, min: 28.2, max: 28.2, estado: 'ok' });
    expect(lecturasDelUltimoRegistro(m2.fuentes.sala, 'Sala 1', RESUMEN_TEMPS, '2026-09-17')).toEqual({ fecha: '', lecturas: [] });
  });

  it('evaluar lecturas frente al umbral: dentro, por abajo, por arriba o por los dos lados', () => {
    expect(evaluarLecturas('temperatura', [28, 29])).toBe('ok');
    expect(evaluarLecturas('temperatura', [27.9, 28.5])).toBe('bajo');
    expect(evaluarLecturas('temperatura', [29.5])).toBe('alto');
    expect(evaluarLecturas('temperatura', [27, 30])).toBe('fuera');
    expect(evaluarLecturas('temperatura', [])).toBe('');
  });
});

describe('Maduración · tablero · el detalle de una sala', () => {
  const FILAS = [
    ...PLANTA,
    SALA('2026-09-18', 'Sala 1', { 'Temperatura 2:00': 28.4, 'Temperatura 12:00': 27.5 }),   // segundo registro del 18
    TQ('2026-09-17', 'Sala 1', 1, { 'Peso promedio machos (g)': 30, 'Peso promedio hembras (g)': 40, 'Observaciones sanitarias': 'Animales estresados' }),
    TQ('2026-09-18', 'Sala 1', 1, { 'Peso promedio machos (g)': 32, 'Observaciones operativas': 'En recambio' }),
    TQ('2026-09-20', 'Sala 1', 1, { 'Peso promedio machos (g)': 99, 'Peso promedio hembras (g)': 99 }),       // después de la foto
  ];
  const m = modeloOperativo(FILAS, { hoy: '2026-09-21', fecha: FOTO });
  const p = periodoDe('7d', FOTO, m.fuentes);
  const d = detalleDeSala(m, 'Sala 1', p, SIN, diasDeTanque(m.fuentes.tanques));

  it('mapa de calor día × hora, el día más reciente arriba; con dos registros el mismo día, la última lectura de cada hora', () => {
    expect(d.calor.horas).toEqual(RESUMEN_TEMPS.map((c) => c.split(' ').pop()));
    expect(d.calor.filas.map((x) => x.fecha)).toEqual(['2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14', '2026-09-13']);
    const d18 = d.calor.filas[1];
    expect(d18.valores.slice(0, 6)).toEqual([28.4, 29, 27.9, 29.1, null, 27.5]);
    expect(d18.estados.slice(0, 6)).toEqual(['ok', 'ok', 'bajo', 'alto', '', 'bajo']);
    expect(d.calor.filas[0].valores.every((v) => v === null)).toBe(true);
    expect(d.calor.lecturas).toBe(5);
  });

  it('oxígeno: una serie por hora de lectura, en orden de fechas, con huecos; y su umbral', () => {
    expect(d.oxigeno.fechas[0]).toBe('2026-09-13');
    expect(d.oxigeno.series.map((s) => s.hora)).toEqual(['06:00', '12:00', '18:00', '00:00']);
    expect(d.oxigeno.series[0].valores).toEqual([null, null, null, null, null, 3.9, null]);
    expect(d.oxigeno.series[2].valores).toEqual([null, null, null, null, null, null, 4.5]);
    expect(d.oxigeno.umbral).toMatchObject({ min: 4, max: null });
    expect(d.oxigeno.lecturas).toBe(3);
  });

  it('los tanques: cargas del Saldo, últimos pesos hasta la foto y las observaciones del último parte', () => {
    expect(d.tanques.map((t) => t.tanque)).toEqual(MAD_TANQUES_POR_SALA['Sala 1']);
    const t1 = d.tanques[0];
    const saldo = m.resumen.lotes.flatMap((L) => L.tanques.filter((t) => t.sala === 'Sala 1' && t.tanque === 1)
      .map((t) => ({ lote: L.lote, cargaMetrica: t.cargaMetrica, cargaVolumetrica: t.cargaVolumetrica })));
    expect(t1.cargas).toEqual(saldo);
    expect(t1.cargas.map((c) => [c.lote, c.cargaMetrica])).toEqual([['QA', 96.19], ['QC', 96.19]]);
    expect(t1.peso).toEqual({ machos: { valor: 32, fecha: '2026-09-18' }, hembras: { valor: 40, fecha: '2026-09-17' } });
    expect(t1.obs).toEqual({ fecha: '2026-09-18', sanitarias: [], operativas: ['En recambio'] });
    expect(d.tanques[1]).toMatchObject({ estado: 'Vacío', cargas: [], obs: { fecha: '' } });
    expect(d.tratamientos.map((x) => x.tipo)).toEqual(['Preventivo', 'Desinfección']);
  });
});
