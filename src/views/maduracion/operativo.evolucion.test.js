/* ============================================================
   MADURACIÓN · OPERATIVO · 📈 EVOLUCIÓN (2026-10-27, usuario; ronda 9, Sesión B, tarea 2)

   🔑 LO QUE DE VERDAD SE VIGILA: que cada punto diga lo MISMO que la tarjeta de su variable puesta en ese tramo —el día,
   la semana, el mes o el período entero—, porque la regla es la suya y no otra. Por eso las tasas agrupadas se comparan
   con la tarjeta del tramo (Σ ÷ Σ) y además con un caso donde el promedio de las tasas daría OTRA cifra; los vivos, con el
   último día del tramo; la mortalidad, con `kpiMortalidad` del tramo. Y lo que no se separa o no aplica, se dice.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { evolucion, tramosDe, VARIABLES, variableDe, hojasDeEvolucion, MAX_COMPARADOS } from './operativo.evolucion.js';
import { kpiCopula, kpiReproduccion, kpiMortalidad, normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { graficoVivos } from './operativo.kpis.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import { partesConHembras } from './operativo.mareas.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';
import { CLIMA_DIAS } from '../clima/clima.data.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg = 'CA') => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': cg, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const SALA = (fecha, sala, extra) => ({ _SheetOrigin: O, 'Temperatura 2:00': '', Fecha: fecha, Sala: sala, ...extra });
const DES = (fecha, lote, desoves, n5, extra = {}) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': 'CA',
  Desoves: desoves, 'Total de huevos': desoves * 100000, N2: 0, N5: n5, ...extra });
const MOV = (fecha, tipo, so, to, sd, td, machos, hembras) => ({ _SheetOrigin: O, Fecha: fecha, Tipo: tipo, 'Sala origen': so, 'Tanque origen': to,
  'Sala destino': sd, 'Tanque destino': td, Machos: machos, Hembras: hembras, 'Agua destino': 'RAS', Motivo: 'Logística', Observaciones: '',
  ID: fecha + so + to + sd + td });
const ALIM = (fecha, sala, tanque, lotes, kg) => ({ _SheetOrigin: O, Fecha: fecha, Sala: sala, Tanque: tanque, Lotes: lotes, Hembras: 10, Machos: 10,
  'Peso hembras (g)': 70, 'Peso machos (g)': 50, 'Fuente del peso': 'Biometría', 'Biomasa hembras (kg)': 50, 'Biomasa machos (kg)': 50,
  'Biomasa total (kg)': 100, 'Poliqueto (kg/día)': kg, 'Redy Mate (kg/día)': '', 'Calamar (kg/día)': '', 'Mejillón (kg/día)': '',
  'Krill (kg/día)': '', 'Vitallis (kg/día)': '', 'Total (kg/día)': kg, Tomas: '', ID: fecha + sala + tanque });
const TRAT = (fecha, sala, tipo, lotes) => ({ _SheetOrigin: O, Fecha: fecha, Sala: sala, 'Estado de la sala': 'Producción', Tipo: tipo,
  'Área': 'Salas y tanques', Lotes: lotes, Productos: 'Formol', 'Productos RAS': '', 'Dosis y observaciones': '', ID: fecha + sala + tipo });
const CLI = (fecha, tipo, tMed, hr, lluvia) => ({ _SheetOrigin: CLIMA_DIAS, Fecha: fecha, Tipo: tipo, 'Temp media (°C)': tMed, 'Humedad (%)': hr,
  'Lluvia (mm)': lluvia, 'Horas observadas': 13, 'Horas MET': 11, 'Horas NASA': 0 });

const FOTO = '2026-09-19';
/* · Sala 1 t1: QA (10♂ 20♀) desde agosto; bajas el 15/09. Sala 1 t2: QC (1♂ 1♀).
   · Sala 2 t16: QD (3♂ 3♀); cópulas el 14 y el 16/09.  · Sala 4 t1: QB (8♂ 8♀) desde el 12/09; una hembra muerta el 18/09.
   · Desoves: QA el 10 (CERO desoves: la fila existe), el 14 (con su N2) y el 16; QB el 16.
   · Sala: dos filas de la Sala 1 el MISMO día (la segunda corrige la lectura de las 2:00) y una de la Sala 2.
   · Alimentación, tratamientos y movimientos en Sala 1 y Sala 4. Clima: dos días registrados y un pronóstico. */
const PLANTA = [
  ING('2026-08-01', 'QA', 'Sala 1', 1, 10, 20), ING('2026-08-01', 'QC', 'Sala 1', 2, 1, 1, 'CB'),
  ING('2026-08-01', 'QD', 'Sala 2', 16, 3, 3, 'CB'), ING('2026-09-12', 'QB', 'Sala 4', 1, 8, 8),
  TQ('2026-09-14', 'Sala 2', 16, { 'Cópulas': 1 }), TQ('2026-09-14', 'Sala 1', 1, { 'Cópulas': 0 }),
  TQ('2026-09-15', 'Sala 1', 1, { 'Machos muertos': 1, 'Hembras muertas': 2 }),
  TQ('2026-09-16', 'Sala 2', 16, { 'Cópulas': 2 }),
  TQ('2026-09-18', 'Sala 4', 1, { 'Hembras muertas': 1 }),
  SALA('2026-09-17', 'Sala 1', { 'Temperatura 2:00': 28 }), SALA('2026-09-17', 'Sala 1', { 'Temperatura 2:00': 29, 'Temperatura 4:00': 30 }),
  SALA('2026-09-17', 'Sala 2', { 'Temperatura 2:00': 26, 'Oxígeno 06:00': 5 }),
  DES('2026-09-10', 'QA', 0, 0), DES('2026-09-14', 'QA', 4, 400000, { N2: 300000 }), DES('2026-09-16', 'QA', 2, 100000),
  DES('2026-09-16', 'QB', 2, 150000),
  ALIM('2026-09-17', 'Sala 1', 1, 'QA', 3), ALIM('2026-09-18', 'Sala 1', 1, 'QA', 5), ALIM('2026-09-18', 'Sala 4', 1, 'QB', 2),
  TRAT('2026-09-15', 'Sala 1', 'Preventivo', 'QA'), TRAT('2026-09-18', 'Sala 4', 'Desinfección', 'QB'),
  MOV('2026-09-13', 'Transferencia', 'Sala 1', 1, 'Sala 4', 1, 1, 0),
];
const CLIMA = [CLI('17/09/2026', 'Registro', 25, 80, 2), CLI('18/09/2026', 'Registro', 27, 70, 0.5), CLI('19/09/2026', 'Pronóstico', 35, 10, 40)];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const P = periodoDe('30d', FOTO, M.fuentes);
const PARTES = diasDeTanque(M.fuentes.tanques);
const COP = partesConHembras(M.fuentes, PARTES);
const SERIE = serieDiaria(M.fuentes, sumarDias(P.desde, -1), P.hasta);
const F = (o = {}) => normalizarFiltro(o, M.indice);
const SIN = F();
const ctx = (Fx = SIN, periodo = P, extra = {}) => ({ M, serie: SERIE, partes: PARTES, copulas: COP, clima: CLIMA, periodo, F: Fx, ...extra });
const ev = (op, Fx, periodo, extra) => evolucion(ctx(Fx, periodo, extra), op);
const enDia = (R, fecha, i = 0) => R.series[i].datos[R.tramos.findIndex((t) => t.desde === fecha)];
const SEM = { desde: '2026-09-14', hasta: '2026-09-20' };   // lunes 14 a domingo 20

describe('📈 Evolución · los tramos (día, semana de lunes a domingo, mes de calendario)', () => {
  it('🔴 semanas de LUNES a domingo, la primera y la última recortadas al período y marcadas «parcial»', () => {
    const t = tramosDe({ desde: '2026-09-02', hasta: '2026-09-20' }, 'semana');   // miércoles 2 → domingo 20
    expect(t.map((x) => [x.desde, x.hasta, x.parcial])).toEqual([
      ['2026-09-02', '2026-09-06', true], ['2026-09-07', '2026-09-13', false], ['2026-09-14', '2026-09-20', false]]);
    expect(t[1].etiqueta).toBe('07/09–13/09');
    const u = tramosDe({ desde: '2026-09-07', hasta: '2026-09-16' }, 'semana');
    expect(u.map((x) => [x.desde, x.hasta, x.parcial])).toEqual([['2026-09-07', '2026-09-13', false], ['2026-09-14', '2026-09-16', true]]);
  });
  it('meses de calendario (diciembre pasa al año siguiente) y días uno a uno', () => {
    expect(tramosDe({ desde: '2026-08-21', hasta: '2026-09-19' }, 'mes').map((x) => [x.desde, x.hasta, x.etiqueta, x.parcial]))
      .toEqual([['2026-08-21', '2026-08-31', 'ago 2026', true], ['2026-09-01', '2026-09-19', 'sep 2026', true]]);
    expect(tramosDe({ desde: '2026-12-01', hasta: '2027-01-31' }, 'mes').map((x) => [x.desde, x.hasta, x.parcial]))
      .toEqual([['2026-12-01', '2026-12-31', false], ['2027-01-01', '2027-01-31', false]]);
    expect(tramosDe(P, 'dia').length).toBe(P.dias);
    expect(tramosDe({ desde: '2026-09-05', hasta: '2026-09-01' }, 'dia')).toEqual([]);
  });
});

describe('📈 Evolución · cada punto es la tarjeta de su variable en ese tramo', () => {
  it('🔴 cópula: cada día, cada semana y el período son `kpiCopula` del tramo, con y sin filtro de sala', () => {
    for (const Fx of [SIN, F({ sala: 'Sala 2' })]) {
      const R = ev({ a: 'copula', agrupar: 'dia' }, Fx);
      R.tramos.forEach((t, i) => expect(R.series[0].datos[i], t.desde).toBe(kpiCopula(COP, t, Fx).tasa));
      expect(R.series[0].total).toBe(kpiCopula(COP, P, Fx).tasa);
      const S = ev({ a: 'copula', agrupar: 'semana' }, Fx);
      S.tramos.forEach((t, i) => expect(S.series[0].datos[i]).toBe(kpiCopula(COP, t, Fx).tasa));
    }
    expect(enDia(ev({ a: 'copula' }, SIN), '2026-09-16'), 'control: hay un dato que comparar').toBeGreaterThan(0);
  });

  it('🔴 una TASA de la semana es Σ ÷ Σ, no el promedio de sus días (el promedio daría 20 %, la regla da 25 %)', () => {
    const base = [
      { fecha: '2026-09-14', sala: 'Sala 1', tanque: 1, copulas: 1, hembras: 10, lotes: ['QA'], codigos: ['CA'] },
      { fecha: '2026-09-15', sala: 'Sala 1', tanque: 1, copulas: 9, hembras: 30, lotes: ['QA'], codigos: ['CA'] },
    ];
    const R = ev({ a: 'copula', agrupar: 'semana' }, SIN, SEM, { copulas: base });
    expect(R.series[0].datos).toEqual([25]);
    const D = ev({ a: 'copula', agrupar: 'dia' }, SIN, SEM, { copulas: base });
    expect(D.series[0].datos.slice(0, 2)).toEqual([10, 30]);
  });

  it('🔴 desoves y N5: la suma del período es la de `kpiReproduccion`, día a día y con filtro de lote', () => {
    for (const Fx of [SIN, F({ lote: 'QB' })]) {
      const sum = (R) => R.series[0].datos.reduce((a, v) => a + (v || 0), 0);
      const k = kpiReproduccion(M.fuentes.desoves, P, Fx);
      expect(sum(ev({ a: 'desoves' }, Fx))).toBe(k.desoves);
      expect(sum(ev({ a: 'n5', agrupar: 'semana' }, Fx))).toBe(k.n5);
      expect(ev({ a: 'desoves' }, Fx).series[0].total).toBe(k.desoves);
    }
    expect(enDia(ev({ a: 'desoves' }, SIN), '2026-09-16')).toBe(4);
  });

  it('🔴 fertilidad y huevos por desove con la regla del Saldo (sólo los desoves con su N2 / sus huevos)', () => {
    const R = ev({ a: 'fertilidad', agrupar: 'semana' }, F({ lote: 'QA' }), SEM);
    expect(R.series[0].datos).toEqual([75]);   // 300 000 N2 de los 400 000 huevos del desove del 14 que trae su N2
    expect(R.series[0].total).toBe(kpiReproduccion(M.fuentes.desoves, SEM, F({ lote: 'QA' })).fertilidad);
    expect(ev({ a: 'huevosPorDesove', agrupar: 'semana' }, F({ lote: 'QA' }), SEM).series[0].datos).toEqual([100000]);
  });

  it('🔴 un CERO es un dato: la tasa de desove de un día con su fila y 0 desoves es 0, no «sin dato»', () => {
    const R = ev({ a: 'tasaDesove' }, F({ lote: 'QA' }));
    expect(enDia(R, '2026-09-10')).toBe(0);
    expect(enDia(R, '2026-09-11'), 'un día SIN fila de desoves no es un cero').toBeNull();
    expect(enDia(R, '2026-09-14')).toBe(20);   // 4 desoves ÷ 20 hembras
  });

  it('🔴 mortalidad: sin sala, la tasa del Saldo del tramo (`kpiMortalidad`); con sala, las muertes registradas', () => {
    const sem = { desde: '2026-09-14', hasta: '2026-09-19' };
    const R = ev({ a: 'mortalidad', agrupar: 'semana' }, SIN);
    const i = R.tramos.findIndex((t) => t.desde === sem.desde);
    expect(R.series[0].datos[i]).toBe(kpiMortalidad(SERIE, sem, SIN, PARTES).periodo.pct);
    expect(R.series[0].datos[i]).toBeGreaterThan(0);
    expect(R.series[0].unidad).toBe('%');
    const C = ev({ a: 'mortalidad', agrupar: 'semana' }, F({ sala: 'Sala 1' }));
    expect(C.series[0].datos[i]).toBe(kpiMortalidad(SERIE, sem, F({ sala: 'Sala 1' }), PARTES).periodo.muertos);
    expect(C.series[0].datos[i]).toBe(3);
    expect(C.series[0].unidad).toBe('muertes registradas');
  });

  it('🔴 vivos: un NIVEL; el punto de la semana es el del último día del tramo, el del período el de la tarjeta', () => {
    const R = ev({ a: 'vivos', agrupar: 'semana' }, SIN);
    const g = graficoVivos(SERIE, P, SIN);
    const total = g.series.find((s) => s.clave === 'total').datos;
    expect(R.series[0].total).toBe(total[total.length - 1]);
    R.tramos.forEach((t, k) => expect(R.series[0].datos[k]).toBe(total[g.etiquetas.indexOf(t.hasta)]));
    expect(ev({ a: 'hembras' }, F({ sala: 'Sala 4' })).series[0].total).toBe(7);   // 8 ♀ menos la muerta del 18/09
  });

  it('ambiente: la última lectura de cada (día, sala, columna) y su media; el clima, sin el pronóstico', () => {
    expect(enDia(ev({ a: 'temperatura' }, F({ sala: 'Sala 1' })), '2026-09-17')).toBe(29.5);   // 29 (corregida) y 30
    expect(enDia(ev({ a: 'temperatura' }, SIN), '2026-09-17')).toBeCloseTo((29 + 30 + 26) / 3, 10);
    expect(enDia(ev({ a: 'oxigeno' }, F({ sala: 'Sala 1' })), '2026-09-17')).toBeNull();
    const C = ev({ a: 'climaTemp', agrupar: 'semana' }, SIN, SEM);
    expect(C.series[0].datos).toEqual([26]);   // 25 y 27; el pronóstico de 35 no cuenta
    expect(ev({ a: 'climaLluvia', agrupar: 'semana' }, SIN, SEM).series[0].datos).toEqual([2.5]);
    expect(ev({ a: 'climaTemp' }, F({ sala: 'Sala 1' }), SEM).notas.some((n) => /no se separa por sala/.test(n))).toBe(true);
  });

  it('alimentación: la ración del día es la de 🦐 Alimentación (kg del día ÷ días con registro), con su filtro', () => {
    expect(enDia(ev({ a: 'racion' }, SIN), '2026-09-18')).toBe(7);
    expect(enDia(ev({ a: 'racion' }, F({ lote: 'QA' })), '2026-09-18')).toBe(5);
    expect(ev({ a: 'racion', agrupar: 'semana' }, F({ lote: 'QA' }), SEM).series[0].datos).toEqual([4]);   // (3 + 5) ÷ 2 días
    expect(enDia(ev({ a: 'racion' }, SIN), '2026-09-19')).toBeNull();
    // un tramo de VARIOS días sin ninguna ración (lo pide el banco: el de un día y el de varios van por caminos distintos)
    expect(ev({ a: 'racion', agrupar: 'semana' }, SIN, { desde: '2026-09-07', hasta: '2026-09-13' }).series[0].datos).toEqual([null]);
  });

  it('🔴 alimento por millón de N5: los kg del tramo (los de cada día, sumados) ÷ sus N5 en millones, con el filtro de lote', () => {
    // QA en la semana: 3 + 5 kg y 400 000 + 100 000 N5 → 8 ÷ 0,5 = 16; con QB: 2 kg ÷ 0,15 M
    expect(ev({ a: 'alimentoPorN5', agrupar: 'semana' }, F({ lote: 'QA' }), SEM).series[0].datos).toEqual([16]);
    expect(ev({ a: 'alimentoPorN5', agrupar: 'semana' }, F({ lote: 'QB' }), SEM).series[0].datos).toEqual([13.33]);
    // el 16/09 QB tiene N5 pero ninguna ración: sin ración no hay cifra (no un «0 kg por millón»)
    expect(enDia(ev({ a: 'alimentoPorN5' }, F({ lote: 'QB' })), '2026-09-16'), 'sin ración, sin cifra').toBeNull();
  });
});

describe('📈 Evolución · ver dobles, media móvil, resumen y notas', () => {
  it('🔴 dos variables: cada una con su eje; la misma dos veces, una sola línea', () => {
    const R = ev({ a: 'copula', b: 'desoves' }, SIN);
    expect(R.series.map((s) => [s.variable, s.eje])).toEqual([['copula', 'a'], ['desoves', 'b']]);
    expect(ev({ a: 'copula', b: 'copula' }, SIN).series.length).toBe(1);
  });

  it('🔴 por lote: una línea por lote, cada una IGUAL a la variable con sólo ese lote en el filtro; la B no entra', () => {
    const R = ev({ a: 'desoves', b: 'copula', comparar: 'lote', elegidos: ['QA', 'QB'] }, SIN);
    expect(R.series.map((s) => s.de)).toEqual(['QA', 'QB']);
    for (const s of R.series) expect(s.datos).toEqual(ev({ a: 'desoves' }, F({ lote: s.de })).series[0].datos);
    const S = ev({ a: 'copula', comparar: 'sala', elegidos: ['Sala 2'] }, SIN);
    expect(S.series[0].datos).toEqual(ev({ a: 'copula' }, F({ sala: 'Sala 2' })).series[0].datos);
  });

  it('🔴 lo que no se separa no se compara (y se dice); más de 6, se dice cuáles quedan fuera', () => {
    const R = ev({ a: 'temperatura', comparar: 'lote', elegidos: ['QA'] }, SIN);
    expect(R.series).toEqual([]);
    expect(R.notas.some((n) => /no se separa por lote/.test(n))).toBe(true);
    expect(ev({ a: 'desoves', comparar: 'sala', elegidos: ['Sala 1'] }, SIN).series).toEqual([]);
    const muchos = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];
    const L = ev({ a: 'desoves', comparar: 'lote', elegidos: muchos }, SIN);
    expect(L.series.length).toBe(MAX_COMPARADOS);
    expect(L.notas.some((n) => n.includes('QG, QH'))).toBe(true);
  });

  it('🔴 media móvil de 7 días: vacía los 6 primeros; una tasa es la de sus 7 días (Σ ÷ Σ); un flujo, su suma ÷ 7', () => {
    const R = ev({ a: 'desoves' }, SIN);
    const s = R.series[0];
    expect(s.movil.slice(0, 6).every((v) => v === null)).toBe(true);
    for (let k = 6; k < s.datos.length; k++) expect(s.movil[k]).toBeCloseTo(s.datos.slice(k - 6, k + 1).reduce((a, v) => a + (v || 0), 0) / 7, 10);
    const C = ev({ a: 'copula' }, SIN);
    const k = C.tramos.findIndex((t) => t.desde === '2026-09-16');
    expect(C.series[0].movil[k]).toBe(kpiCopula(COP, { desde: '2026-09-10', hasta: '2026-09-16' }, SIN).tasa);
    expect(ev({ a: 'copula', agrupar: 'semana' }, SIN).series[0].movil, 'sólo por día').toBeNull();
  });

  it('el resumen: puntos con dato, mínimo y máximo con su tramo, primero, último, cambio y el total del período', () => {
    const R = ev({ a: 'desoves', agrupar: 'semana' }, SIN);
    const x = R.resumen[0];
    expect(x.total).toBe(8);
    expect(x.max).toEqual({ valor: 8, tramo: '14/09–19/09' });
    expect(x.ultimo.valor).toBe(8);
    expect(x.n).toBe(R.tramos.length);   // un flujo sin desoves es un 0, no un vacío
    const V = ev({ a: 'copula' }, SIN);
    expect(V.resumen[0].n).toBe(V.series[0].datos.filter((v) => v !== null).length);
    expect(V.resumen[0].total).toBe(kpiCopula(COP, P, SIN).tasa);
  });

  it('las notas dicen lo que el filtro no separa (los desoves no son de una sala) y que el tramo es parcial', () => {
    const R = ev({ a: 'desoves', agrupar: 'semana' }, F({ sala: 'Sala 1' }));
    expect(R.notas.some((n) => /^Desoves no se separa por sala/.test(n))).toBe(true);
    expect(R.notas.some((n) => /parcial/.test(n))).toBe(true);
    expect(ev({ a: 'vivos' }, F({ codigo: 'CA' })).notas.some((n) => /^Vivos \(total\): /.test(n))).toBe(true);
    expect(ev({ a: 'nada' }, SIN).notas).toEqual(['Elige una variable.']);
  });

  it('🔴 marcas de eventos: tratamientos y movimientos del período, en su tramo y con el filtro de 🔄 Manejo', () => {
    const R = ev({ a: 'desoves', agrupar: 'semana' }, SIN);
    expect(R.eventos.map((e) => [e.fecha, e.tipo])).toEqual([['2026-09-13', 'movimiento'], ['2026-09-15', 'tratamiento'], ['2026-09-18', 'tratamiento']]);
    expect(R.eventos[1].texto).toBe('Sala 1: Preventivo');
    expect(R.eventos[0].tramo).toBe(R.tramos.findIndex((t) => t.desde <= '2026-09-13' && t.hasta >= '2026-09-13'));
    const S = ev({ a: 'desoves' }, F({ sala: 'Sala 4' }));
    expect(S.eventos.map((e) => e.fecha)).toEqual(['2026-09-13', '2026-09-18']);   // el movimiento llega a la Sala 4
    expect(ev({ a: 'desoves' }, F({ lote: 'QA' })).notas.some((n) => /Los movimientos no se separan por lote/.test(n))).toBe(true);
    expect(ev({ a: 'desoves', eventos: false }, SIN).eventos).toEqual([]);
  });
});

describe('📈 Evolución · el Excel', () => {
  it('🔴 cuatro hojas; un renglón por tramo; números como números y un punto sin dato VACÍO, no cero', () => {
    const R = ev({ a: 'copula', b: 'desoves' }, SIN);
    const H = hojasDeEvolucion(R, { periodo: '30 d', agrupar: 'Día', filtros: ['Sala 2'] });
    expect(H.map((h) => h.nombre)).toEqual(['Serie', 'Resumen', 'Eventos', 'Filtros y notas']);
    const S = H[0].aoa;
    expect(S[0]).toEqual(['Desde', 'Hasta', 'Tramo', 'Parcial', 'Tasa de cópula (%)', 'Desoves (desoves)',
      'Media móvil 7 d · Tasa de cópula (%)', 'Media móvil 7 d · Desoves (desoves)']);
    expect(S.length).toBe(R.tramos.length + 1);
    const fila = S.find((r) => r[0] === '2026-09-16');
    expect(fila[4]).toBe(66.6667);   // 2 cópulas ÷ 3 hembras, a 4 decimales en el Excel
    expect(R.series[0].datos[R.tramos.findIndex((t) => t.desde === '2026-09-16')]).toBeCloseTo(66.6667, 4);
    expect(typeof fila[5]).toBe('number');
    expect(S.find((r) => r[0] === '2026-08-25')[4]).toBe('');
    expect(H[3].aoa.find((r) => r[0] === 'Filtros')).toEqual(['Filtros', 'Sala 2']);
    expect(H[1].aoa[1][0]).toBe('Tasa de cópula');
  });
});

describe('📈 Evolución · el catálogo', () => {
  it('cada variable tiene grupo, unidad, tipo conocido y sabe qué se compara; los cuatro grupos aprobados', () => {
    for (const v of VARIABLES) {
      expect(['tasa', 'nivel', 'flujo', 'promedio']).toContain(v.tipo);
      expect(v.etiqueta && v.unidad && v.grupo).toBeTruthy();
      expect(v.comparar.every((c) => c === 'lote' || c === 'sala')).toBe(true);
      expect(variableDe(v.clave)).toBe(v);
    }
    expect([...new Set(VARIABLES.map((v) => v.grupo))]).toEqual(['Reproducción', 'Población', 'Alimentación', 'Ambiente']);
  });
});
