/* ============================================================
   MADURACIÓN · OPERATIVO — VARIOS lotes y códigos a la vez (punto 2 · etapa A, 2026-10-13, usuario)

   «Si escojo el lote BA y también quiero ver junto a la información del lote BC, pueda filtrar ambos». Decidido: la
   UNIÓN —lo elegido se ve junto, sumado—, no una comparación. Qué se exige:
   · El filtro lleva LISTAS (`lotes`, `codigos`; vacía = todos), canónicas y sin repetir. Con un solo valor, todo es
     como antes (lo vigilan las pruebas de siempre, que lo eligen así).
   · Con dos, lo que se filtra por FILA es exactamente lo de esas filas: el cálculo con el filtro es el mismo que el
     cálculo SIN filtro sobre las filas de esos lotes (porcentajes incluidos: se recalculan, no se suman ni se
     promedian). Lo que sale del libro (vivos, tasa de mortalidad) es la suma de cada lote por separado.
   · Cada caso deja FUERA a un tercer lote: si el filtro se ignorase, la cifra sería la de todos y la prueba lo vería.
   · Ningún módulo vuelve a leer `F.lote` / `F.codigo` ni arma un filtro con esas claves (la guarda del final): uno
     solo que se quedara con la forma vieja enseñaría TODO sin filtrar, sin un síntoma.
   Etapa B (2026-10-14, usuario) · la SALA y el TANQUE, también varios (`salas`, `tanques`: pares «sala|n»), con la regla
   de Lote → Código (decisión del usuario): la unión dentro de cada una; entre las dos, ambas a la vez —con tanques
   marcados se ven SÓLO esos; una sala sin ninguno de sus tanques no suma—. La guarda vigila también `F.sala` / `F.tanque`.
   Etapa C (2026-10-14) · la PISCINA y la CAMARONERA de origen, igual (`piscinas`, `camaroneras`); una lista VACÍA no es un
   filtro puesto (`!!F[d]` diría que sí). La guarda vigila también `F.piscina` / `F.camaronera`.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  normalizarFiltro, hayFiltro, hayLote, hayCodigo, loteUnico, dimensionActiva, loteElegido, codigoEnFiltro,
  etiquetasDeFiltro, kpiVivos, kpiOcupacion, kpiMortalidad, kpiReproduccion, periodoDe,
  haySala, hayTanque, salaUnica, salaElegida, tanqueElegido, mapaDePlanta,
  hayPiscina, hayCamaronera, origenEnFiltro, indiceDeFiltro,
} from './operativo.tablero.js';
import { ignoraDeCruce } from './operativo.cruce.js';
import { ignoraDeCalidad } from './operativo.calidad.js';
import { modeloOperativo, serieDiaria, diasDeTanque } from './operativo.data.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';
import { sumarDias } from '../registros/lib/mad-libro.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { revisionesDeNauplios } from './operativo.revisiones.js';
import { graficoVivos, graficoDeKpi } from './operativo.kpis.js';
import { tablaDeReproduccion } from './operativo.reproduccion.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg) => ({ _SheetOrigin: O, 'Camaronera origen': 'X', Fecha: fecha,
  Lote: lote, 'Código genético': cg, Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const TQ = (fecha, sala, tanque, extra) => ({ _SheetOrigin: O, 'Machos muertos': '', Fecha: fecha, Sala: sala, Tanque: tanque, ...extra });
const F = (o) => normalizarFiltro(o);
const SIN = F({});
const FOTO = '2026-09-19';

describe('Maduración · operativo · etapa A · el filtro con VARIOS lotes y códigos', () => {
  it('el filtro lleva listas canónicas y sin repetir; vacías, no hay filtro', () => {
    expect(F({ lote: ['qa', 'QB', ' qa '], codigo: ['ca', 'c b'] })).toMatchObject({ lotes: ['QA', 'QB'], codigos: ['CA', 'CB'] });
    expect(F({ lote: [], codigo: [] })).toMatchObject({ lotes: [], codigos: [] });
    expect(F({ lote: ['', null] }).lotes).toEqual([]);
    expect(hayFiltro(F({ lote: [] }))).toBe(false);
    expect(hayFiltro(F({ lote: ['QA', 'QB'] }))).toBe(true);
    expect(hayFiltro(F({ codigo: ['CA', 'CB'] }))).toBe(true);
  });

  it('elegido = uno CUALQUIERA de la lista; una pareja de códigos casa si comparte alguno', () => {
    const L = F({ lote: ['QA', 'QB'] });
    expect([loteElegido('qa', L), loteElegido('QB', L), loteElegido('QC', L), loteElegido('', L)]).toEqual([true, true, false, false]);
    expect(loteElegido('QC', SIN)).toBe(true);
    const C = F({ codigo: ['CA', 'CB'] });
    expect([codigoEnFiltro('ca', C), codigoEnFiltro('CB', C), codigoEnFiltro('CC', C), codigoEnFiltro('CC/CB', C)]).toEqual([true, true, false, true]);
    expect(codigoEnFiltro('CC', SIN)).toBe(true);
  });

  it('lo que necesita UN lote, sólo con uno; las dimensiones activas; una etiqueta por valor', () => {
    expect(loteUnico(F({ lote: 'QA' }))).toBe('QA');
    expect(loteUnico(F({ lote: ['QA', 'QB'] }))).toBe('');
    expect(loteUnico(SIN)).toBe('');
    expect([hayLote(SIN), hayCodigo(SIN), hayLote(F({ lote: ['QA'] })), hayCodigo(F({ codigo: ['CA'] }))]).toEqual([false, false, true, true]);
    expect(['lote', 'codigo', 'tanque', 'sala'].map((d) => dimensionActiva(F({ lote: ['QA'], codigo: [] }), d))).toEqual([true, false, false, false]);
    expect(dimensionActiva(undefined, 'lote')).toBe(false);
    expect(etiquetasDeFiltro(F({ lote: ['QA', 'QB'], codigo: ['CB'] })).map((e) => [e.dim, e.valor]))
      .toEqual([['lote', 'QA'], ['lote', 'QB'], ['codigo', 'CB']]);
  });
});

/* Tres lotes en tres tanques; cada uno con sus muertes del día de la foto. */
const PLANTA = [
  ING('2026-09-01', 'QA', 'Sala 1', 1, 50, 50, 'CA'),
  ING('2026-09-01', 'QB', 'Sala 4', 1, 20, 20, 'CB'),
  ING('2026-09-01', 'QC', 'Sala 2', 16, 10, 10, 'CC'),
  TQ('2026-09-10', 'Sala 1', 1, { 'Machos muertos': 3 }),
  TQ('2026-09-10', 'Sala 2', 16, { 'Hembras muertas': 1 }),
  TQ('2026-09-19', 'Sala 1', 1, { 'Machos muertos': 2 }),
  TQ('2026-09-19', 'Sala 4', 1, { 'Hembras muertas': 4 }),
  TQ('2026-09-19', 'Sala 2', 16, { 'Machos muertos': 5 }),
];
const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });

describe('Maduración · operativo · etapa A · las cifras del LIBRO son la suma de los lotes elegidos', () => {
  const suma = (a, b) => ({ machos: a.machos + b.machos, hembras: a.hembras + b.hembras });
  it('🔴 vivos: QA + QB, sin QC; y los dos códigos, igual', () => {
    const qa = kpiVivos(M.libro, F({ lote: 'QA' }));
    const qb = kpiVivos(M.libro, F({ lote: 'QB' }));
    const dos = kpiVivos(M.libro, F({ lote: ['QA', 'QB'] }));
    expect({ machos: dos.machos, hembras: dos.hembras }).toEqual(suma(qa, qb));
    expect(dos.total).toBeLessThan(kpiVivos(M.libro, SIN).total);
    expect(kpiVivos(M.libro, F({ codigo: ['CA', 'CB'] })).total).toBe(dos.total);
  });

  it('🔴 ocupación: los tanques de los dos lotes', () => {
    expect(kpiOcupacion(M.salas, M.libro, F({ lote: ['QA', 'QB'] }))).toMatchObject({ modo: 'filtro', ocupados: 2 });
    expect(kpiOcupacion(M.salas, M.libro, F({ lote: 'QA' }))).toMatchObject({ ocupados: 1 });
  });

  it('🔴 la tasa de mortalidad suma numeradores y denominadores de los dos (no promedia sus tasas)', () => {
    const p = periodoDe('7d', FOTO, M.fuentes);
    const serie = serieDiaria(M.fuentes, sumarDias(p.desde, -1), p.hasta);
    const partes = diasDeTanque(M.fuentes.tanques);
    const de = (lote) => kpiMortalidad(serie, p, F({ lote }), partes);
    const qa = de('QA').dia;
    const qb = de('QB').dia;
    const dos = de(['QA', 'QB']);
    expect(dos.modo).toBe('tasa');
    expect([dos.dia.muertos, dos.dia.riesgo]).toEqual([qa.muertos + qb.muertos, qa.riesgo + qb.riesgo]);
    expect(dos.dia.muertos).toBeLessThan(de([]).dia.muertos);   // QC (5 muertos) queda fuera
    expect(dos.dia.pct).toBeCloseTo((100 * (qa.muertos + qb.muertos)) / (qa.riesgo + qb.riesgo), 2);
    expect(dos.periodo.muertos).toBe(de('QA').periodo.muertos + de('QB').periodo.muertos);
  });

  it('🔴 el gráfico de vivos y el de la mortalidad: día a día, los dos lotes juntos', () => {
    const p = periodoDe('7d', FOTO, M.fuentes);
    const serie = serieDiaria(M.fuentes, sumarDias(p.desde, -1), p.hasta);
    const total = (g) => g.series.find((s) => s.clave === 'total').datos;
    const vivos = (lote) => graficoVivos(serie, p, F({ lote }));
    expect(vivos(['QA', 'QB']).aplica).toBe(true);
    expect(total(vivos(['QA', 'QB']))).toEqual(total(vivos('QA')).map((n, i) => n + total(vivos('QB'))[i]));
    expect(total(vivos(['QA', 'QB']))).not.toEqual(total(vivos([])));
    const mort = (lote) => graficoDeKpi('mortalidad', { serie, periodo: p, F: F({ lote }), partes: diasDeTanque(M.fuentes.tanques), M });
    const dia = (g) => g.series.find((s) => s.clave === 'dia').datos;
    const a = dia(mort('QA'));
    const b = dia(mort('QB'));
    const ab = dia(mort(['QA', 'QB']));
    expect(ab.length).toBeGreaterThan(0);
    // la tasa del día de los dos queda ENTRE las de cada uno (es un cociente de sumas, no una suma de tasas)
    ab.forEach((x, i) => { if (x !== null) expect(x).toBeGreaterThanOrEqual(Math.min(a[i], b[i]) - 1e-9); });
    ab.forEach((x, i) => { if (x !== null) expect(x).toBeLessThanOrEqual(Math.max(a[i], b[i]) + 1e-9); });
  });
});

describe('Maduración · operativo · etapa A · lo que se filtra por FILA es lo de esas filas', () => {
  const D = (fecha, lote, cg, desoves, huevos, n2, n5) => ({ Fecha: fecha, Lote: lote, 'Código genético': cg, Desoves: desoves,
    'Total de huevos': huevos, N2: n2, N5: n5, 'Hembras no viables': 0 });
  const DESOVES = [
    D('2026-09-14', 'QA', 'CA', 3, 600000, 480000, 300000),
    D('2026-09-15', 'qb', 'cb', 2, 300000, 210000, ''),
    D('2026-09-16', 'QC', 'CC', 5, 900000, 450000, 400000),
    D('2026-09-17', 'QA', 'CA/CC', 1, 100000, 90000, 80000),
  ];
  const p = { desde: '2026-09-01', hasta: FOTO };
  const deLotes = (ls) => DESOVES.filter((r) => ls.includes(normLote(r.Lote)));

  it('🔴 reproducción: con QA y QB, lo mismo que sin filtro sobre sus filas (la fertilidad, recalculada)', () => {
    expect(kpiReproduccion(DESOVES, p, F({ lote: ['QA', 'QB'] }))).toEqual(kpiReproduccion(deLotes(['QA', 'QB']), p, SIN));
    expect(kpiReproduccion(DESOVES, p, F({ lote: ['QA', 'QB'] })).desoves).toBe(6);   // sin los 5 de QC
  });

  it('🔴 con dos códigos, las filas de cualquiera de los dos (la pareja CA/CC entra por CA)', () => {
    expect(kpiReproduccion(DESOVES, p, F({ codigo: ['CA', 'CB'] })).desoves).toBe(6);
    expect(kpiReproduccion(DESOVES, p, F({ codigo: ['CB', 'CC'] })).desoves).toBe(8);
  });

  it('🔴 la tabla de 🥚 Reproducción: sólo los dos lotes, y los pendientes de N5 de cada uno', () => {
    const t = tablaDeReproduccion({ fuentes: { desoves: DESOVES }, fecha: FOTO }, p, F({ lote: ['QA', 'QB'] }));
    expect(t.map((x) => x.lote).sort()).toEqual(['QA', 'QB']);
    expect(t.find((x) => x.lote === 'QB').pendientes, 'el desove de QB espera su N5').toBe(1);
  });

  it('🔴 las revisiones de nauplios: las de los dos lotes', () => {
    const REV = (lote) => ({ _SheetOrigin: O, Fecha: '2026-09-15', Lote: lote, 'Revisión': 'Nauplio' });   // una revisión no dice tipo de tanque
    const fuentes = { mortDesove: [REV('QA'), REV('QB'), REV('QC')] };
    const n = (lote) => revisionesDeNauplios(fuentes, F({ lote }), p).filas.length;
    expect(n(['QA', 'QB'])).toBe(n('QA') + n('QB'));
    expect(n(['QA', 'QB'])).toBeLessThan(n([]));
  });
});

/* ── ETAPA B ── varias salas y varios tanques. En el fixture, QA está en Sala 1 · T1, QB en Sala 4 · T1 (el MISMO número en
   otra sala) y QC en Sala 2 · T16. */
describe('Maduración · operativo · etapa B · el filtro con VARIAS salas y VARIOS tanques', () => {
  it('listas sin repetir; el tanque, el par «sala|n», sólo con SU sala marcada; una etiqueta por valor', () => {
    const X = F({ sala: ['Sala 1', 'Sala 4', 'Sala 1'], tanque: ['Sala 1|01', 'Sala 4|1', 'Sala 2|16', '1'] });
    expect(X).toMatchObject({ salas: ['Sala 1', 'Sala 4'], tanques: ['Sala 1|1', 'Sala 4|1'] });   // T16 sin su sala; «1» suelto con dos salas
    expect(F({ sala: 'Sala 4', tanque: 1 }).tanques, 'con UNA sala, el número de siempre').toEqual(['Sala 4|1']);
    expect([haySala(SIN), hayTanque(SIN), haySala(X), hayTanque(X), hayFiltro(F({ sala: [] }))]).toEqual([false, false, true, true, false]);
    expect([salaUnica(X), salaUnica(F({ sala: 'Sala 4' })), salaUnica(SIN)]).toEqual(['', 'Sala 4', '']);
    expect([salaElegida('Sala 4', X), salaElegida('Sala 2', X), salaElegida('Sala 2', SIN)]).toEqual([true, false, true]);
    expect([tanqueElegido('Sala 4', 1, X), tanqueElegido('Sala 4', '01', X), tanqueElegido('Sala 2', 1, X), tanqueElegido('Sala 1', 2, X), tanqueElegido('Sala 2', 1, SIN)])
      .toEqual([true, true, false, false, true]);
    expect(['sala', 'tanque'].map((d) => dimensionActiva(X, d))).toEqual([true, true]);
    expect(etiquetasDeFiltro(X).map((e) => [e.dim, e.valor, e.clave]))
      .toEqual([['sala', 'Sala 1', 'Sala 1'], ['sala', 'Sala 4', 'Sala 4'], ['tanque', 'Sala 1 · T1', 'Sala 1|1'], ['tanque', 'Sala 4 · T1', 'Sala 4|1']]);
    expect(etiquetasDeFiltro(F({ sala: 'Sala 4', tanque: 1 })).map((e) => e.valor), 'con una sala, el tanque es su número').toEqual(['Sala 4', '1']);
  });

  it('🔴 vivos: Sala 1 + Sala 4 es la suma de cada una, sin la Sala 2; y sus dos tanques 1, igual', () => {
    const v = (o) => kpiVivos(M.libro, F(o)).total;
    expect(v({ sala: ['Sala 1', 'Sala 4'] })).toBe(v({ sala: 'Sala 1' }) + v({ sala: 'Sala 4' }));
    expect(v({ sala: ['Sala 1', 'Sala 4'] })).toBeLessThan(v({}));
    expect(v({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 1|1', 'Sala 4|1'] })).toBe(v({ sala: ['Sala 1', 'Sala 4'] }));
    expect(v({ sala: ['Sala 1', 'Sala 4'] })).toBe(kpiVivos(M.libro, F({ lote: ['QA', 'QB'] })).total);
  });

  it('🔴 como Lote → Código: con tanques marcados se ven SÓLO esos; la sala sin ninguno de sus tanques no suma', () => {
    const v = (o) => kpiVivos(M.libro, F(o)).total;
    expect(v({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 1|1'] })).toBe(v({ sala: 'Sala 1', tanque: 1 }));
    expect(v({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 1|1'] })).toBeLessThan(v({ sala: ['Sala 1', 'Sala 4'] }));
    const enMapa = (o) => mapaDePlanta(M.libro, F(o)).salas.flatMap((x) => x.tanques).filter((t) => t.enFiltro && t.vivos > 0).map((t) => t.sala + '|' + t.tanque);
    expect(enMapa({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 1|1'] })).toEqual(['Sala 1|1']);
    expect(enMapa({ sala: ['Sala 1', 'Sala 4'] })).toEqual(['Sala 1|1', 'Sala 4|1']);
  });

  it('🔴 ocupación: con UN tanque, si está ocupado; con varios, cuántos de ELLOS tienen lo filtrado', () => {
    const o = (x) => kpiOcupacion(M.salas, M.libro, F(x));
    expect(o({ sala: 'Sala 4', tanque: 1 })).toMatchObject({ modo: 'tanque', ocupados: 1, total: 1 });
    expect(o({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 1|1', 'Sala 4|1'] })).toMatchObject({ modo: 'filtro', ocupados: 2, total: 2 });
    expect(o({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 1|1', 'Sala 1|2'] })).toMatchObject({ modo: 'filtro', ocupados: 1, total: 2 });
    expect(o({ sala: ['Sala 1', 'Sala 4'] }).total).toBe(o({ sala: 'Sala 1' }).total + o({ sala: 'Sala 4' }).total);
  });

  it('🔴 la mortalidad REGISTRADA y los gráficos de vivos y mortalidad: la suma de las salas (y de los tanques) elegidas', () => {
    const p = periodoDe('7d', FOTO, M.fuentes);
    const serie = serieDiaria(M.fuentes, sumarDias(p.desde, -1), p.hasta);
    const partes = diasDeTanque(M.fuentes.tanques);
    const m = (o) => kpiMortalidad(serie, p, F(o), partes);
    expect(m({ sala: ['Sala 1', 'Sala 4'] })).toMatchObject({ modo: 'registradas', dia: { muertos: 6 } });   // 2 + 4, sin los 5 de la Sala 2
    expect(m({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 4|1'] }).dia.muertos).toBe(4);
    const total = (g) => g.series.find((x) => x.clave === 'total').datos;
    const vivos = (o) => graficoVivos(serie, p, F(o));
    expect(total(vivos({ sala: ['Sala 1', 'Sala 4'] }))).toEqual(total(vivos({ sala: 'Sala 1' })).map((n, i) => n + total(vivos({ sala: 'Sala 4' }))[i]));
    expect(total(vivos({ sala: ['Sala 1', 'Sala 4'], tanque: ['Sala 1|1', 'Sala 4|1'] }))).toEqual(total(vivos({ sala: ['Sala 1', 'Sala 4'] })));
    expect(total(vivos({ sala: ['Sala 1', 'Sala 4'] }))).not.toEqual(total(vivos({})));
    const dia = (o) => graficoDeKpi('mortalidad', { serie, periodo: p, F: F(o), partes, M }).series.find((x) => x.clave === 'dia').datos;
    expect(dia({ sala: ['Sala 1', 'Sala 4'] })).toEqual(dia({ sala: 'Sala 1' }).map((n, i) => n + dia({ sala: 'Sala 4' })[i]));
  });
});

/* ── ETAPA C ── varias piscinas y varias camaroneras de ORIGEN. En este fixture, QA viene de P1 · CX, QB de P2 · CY y QC de
   P3 · CX (de la misma camaronera que QA). */
const INGP = (fecha, lote, sala, tanque, machos, hembras, cg, piscina, camaronera) => ({ ...ING(fecha, lote, sala, tanque, machos, hembras, cg),
  'Piscina Broodstock': piscina, 'Camaronera origen': camaronera });
const MC = modeloOperativo([
  INGP('2026-09-01', 'QA', 'Sala 1', 1, 50, 50, 'CA', 'P1', 'CX'),
  INGP('2026-09-01', 'QB', 'Sala 4', 1, 20, 20, 'CB', 'P2', 'CY'),
  INGP('2026-09-01', 'QC', 'Sala 2', 16, 10, 10, 'CC', 'P3', 'CX'),
], { hoy: FOTO, fecha: FOTO });
const FC = (o) => normalizarFiltro(o, indiceDeFiltro(MC));
describe('Maduración · operativo · etapa C · el filtro con VARIAS piscinas y VARIAS camaroneras de origen', () => {
  it('listas sin repetir; 🔴 una lista VACÍA no cuenta como filtro puesto (ni en las etiquetas ni en lo que «no se aplica»)', () => {
    expect(F({ piscina: ['P1', ' P2 ', 'P1'], camaronera: 'CX' })).toMatchObject({ piscinas: ['P1', 'P2'], camaroneras: ['CX'] });
    expect([hayPiscina(SIN), hayCamaronera(SIN), hayFiltro(F({ piscina: [], camaronera: [] }))]).toEqual([false, false, false]);
    expect(['piscina', 'camaronera'].map((d) => dimensionActiva(SIN, d))).toEqual([false, false]);
    expect(['piscina', 'camaronera'].map((d) => dimensionActiva(F({ piscina: 'P1', camaronera: ['CX'] }), d))).toEqual([true, true]);
    expect(etiquetasDeFiltro(F({ piscina: ['P1', 'P2'], camaronera: 'CX' })).map((e) => [e.dim, e.valor, e.clave]))
      .toEqual([['piscina', 'P1', 'P1'], ['piscina', 'P2', 'P2'], ['camaronera', 'CX', 'CX']]);
    expect([ignoraDeCruce(SIN), ignoraDeCalidad(SIN, [])]).toEqual([[], []]);
    expect(ignoraDeCruce(F({ piscina: ['P1', 'P2'] }))).toEqual(['piscina']);
  });

  it('el ORIGEN de un lote pasa con UNA de sus piscinas entre las elegidas (y una de sus camaroneras); sin origen, no', () => {
    const o = { piscinas: new Set(['P1']), camaroneras: new Set(['CX']) };
    expect([origenEnFiltro(o, F({ piscina: ['P2', 'P1'] })), origenEnFiltro(o, F({ piscina: ['P2'] })), origenEnFiltro(o, SIN)]).toEqual([true, false, true]);
    expect([origenEnFiltro(o, F({ piscina: 'P1', camaronera: ['CY', 'CX'] })), origenEnFiltro(o, F({ piscina: 'P1', camaronera: 'CY' }))]).toEqual([true, false]);
    expect([origenEnFiltro(undefined, F({ piscina: 'P1' })), origenEnFiltro(undefined, SIN)]).toEqual([false, true]);
  });

  it('🔴 vivos: P1 + P2 es la suma de cada una, sin P3; dos camaroneras, igual; y piscina Y camaronera, las dos a la vez', () => {
    const v = (o) => kpiVivos(MC.libro, FC(o)).total;
    expect([v({ piscina: 'P1' }), v({ piscina: 'P2' }), v({ piscina: ['P1', 'P2'] })]).toEqual([100, 40, 140]);
    expect(v({ piscina: ['P1', 'P2'] })).toBeLessThan(v({}));
    expect([v({ camaronera: 'CX' }), v({ camaronera: ['CX', 'CY'] })]).toEqual([120, 160]);
    expect(v({ piscina: ['P1', 'P2'], camaronera: 'CX' })).toBe(100);   // QB es de CY; QC, de P3
    expect(kpiOcupacion(MC.salas, MC.libro, FC({ piscina: ['P1', 'P2'] }))).toMatchObject({ modo: 'filtro', ocupados: 2 });
  });

  /* Tres reglas del origen que NINGUNA prueba vigilaba (las destapó el banco de la etapa C): con piscina o camaronera los
     gráficos que salen de la serie no aplican (la serie no guarda el origen); el gráfico de Ocupación cuenta los tanques
     de lo filtrado, como la tarjeta; y la tabla de 🥚 Reproducción sólo trae los desoves de esos orígenes. */
  it('🔴 con origen: los gráficos de la serie no aplican, la ocupación es la de lo filtrado y los desoves, los de esos orígenes', () => {
    const p = periodoDe('7d', FOTO, MC.fuentes);
    const serie = serieDiaria(MC.fuentes, sumarDias(p.desde, -1), p.hasta);
    expect([graficoVivos(serie, p, FC({})).aplica, graficoVivos(serie, p, FC({ piscina: 'P1' })).aplica, graficoVivos(serie, p, FC({ camaronera: ['CX'] })).aplica])
      .toEqual([true, false, false]);
    const ocupados = (o) => graficoDeKpi('ocupacion', { M: MC, serie, partes: [], periodo: p, F: FC(o) }).series.find((x) => x.clave === 'ocupados').datos.reduce((a, n) => a + n, 0);
    expect([ocupados({}), ocupados({ piscina: ['P1', 'P2'] }), ocupados({ camaronera: 'CY' })]).toEqual([3, 2, 1]);
    const DES = [['QA', 2], ['QB', 3], ['QC', 4]].map(([Lote, Desoves]) => ({ Fecha: '2026-09-15', Lote, 'Código genético': 'CA', Desoves,
      'Total de huevos': 1000, N2: 500, N5: 300, 'Hembras no viables': 0 }));
    const lotes = (o) => tablaDeReproduccion({ fuentes: { ...MC.fuentes, desoves: DES }, fecha: FOTO }, p, FC(o)).map((f) => f.lote);
    expect([lotes({}), lotes({ piscina: ['P1', 'P2'] }), lotes({ camaronera: 'CX' })]).toEqual([['QA', 'QB', 'QC'], ['QA', 'QB'], ['QA', 'QC']]);
  });
});

/* ── LA GUARDA ── ningún módulo del tablero lee el filtro con la forma vieja ni la arma. */
const DIR = new URL('./', import.meta.url);
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const MODULOS = readdirSync(DIR).filter((n) => /^operativo\..*\.js$/.test(n) && !n.endsWith('.test.js'));
const OTROS = ['../planta/estado.js', '../visitante/maduracion.produccion.js'];
describe('Maduración · operativo · etapa A · la forma vieja del filtro no vuelve', () => {
  it('la guarda mira algo: los módulos del tablero existen y usan el filtro', () => {
    expect(MODULOS.length).toBeGreaterThan(15);
    expect(MODULOS).toContain('operativo.tablero.js');
    expect(MODULOS).toContain('operativo.view.js');
  });
  for (const n of [...MODULOS, ...OTROS]) {
    it(`🔴 ${n}: ni \`F.lote\` / \`F.codigo\` ni un filtro armado con \`lote\` / \`codigo\``, () => {
      const s = sinComentarios(readFileSync(new URL(n, DIR), 'utf8'));
      expect(s.match(/\bF\.(lote|codigo)\b/g), 'lee la forma vieja').toBeNull();
      expect(s.match(/\.\.\.\s*\(?\s*F\b[^}]*\b(lote|codigo)\b\s*[:,}]/g), 'arma un filtro con la clave vieja').toBeNull();
      expect(s.match(/(EnFiltro|loteElegido)\([^;]*\{\s*(lote|codigo)\b\s*[:,}]/g), 'pasa un filtro con la clave vieja').toBeNull();
    });
  }
  /* Etapa B · ni `F.sala` / `F.tanque` ni un filtro armado con `sala` / `tanque` (también tras un `...(F || {})`, que es
     como estaba `observacionesDeTanque`). En planta/estado.js `F` es OTRA cosa —los nombres de columna: `F.tanque` es
     «Tanque»— y su filtro del tablero es `normalizarFiltro({})`: por eso no entra aquí. */
  for (const n of [...MODULOS, '../visitante/maduracion.produccion.js']) {
    it(`🔴 etapas B y C · ${n}: ni \`F.sala\` / \`F.tanque\` / \`F.piscina\` / \`F.camaronera\` ni un filtro armado con esas claves`, () => {
      const s = sinComentarios(readFileSync(new URL(n, DIR), 'utf8'));
      expect(s.match(/\bF\.(sala|tanque|piscina|camaronera)\b/g), 'lee la forma vieja').toBeNull();
      expect(s.match(/\.\.\.\s*\(?\s*F\b(?:[^}]|\{\})*\b(sala|tanque|piscina|camaronera)\b\s*[:,}]/g), 'arma un filtro con la clave vieja').toBeNull();
      // el FILTRO es el segundo argumento: una posición o una fila sí llevan `sala` / `tanque` (`posicionEnFiltro({ sala, … }, F)`)
      expect(s.match(/(EnFiltro|Elegid[oa])\(\s*[^,;()]+,\s*\{\s*(sala|tanque|piscina|camaronera)\b\s*[:,}]/g), 'pasa un filtro con la clave vieja').toBeNull();
    });
  }
});
