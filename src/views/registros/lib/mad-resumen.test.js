/* MADURACIÓN · RESUMEN (pestaña Saldo, 2026-09-15): el módulo con un caso calculado a mano, y su PARIDAD con el
   bloque inline de engine.js. Cada cifra de abajo está razonada en el comentario de su prueba. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { resumenMaduracion, estadisticaDia, diasEntre, RESUMEN_TEMPS, RESUMEN_OXIGENOS } from './mad-resumen.js';

const ing = (Fecha, Lote, cg, Sala, Tanque, Machos, Hembras) => ({ Fecha, Lote, 'Código genético': cg, Sala, Tanque, Machos, Hembras });
const tq = (Fecha, Sala, Tanque, extra = {}) => Object.assign({ Fecha, Sala, Tanque, 'Machos muertos': 0, 'Hembras muertas': 0,
  'Machos muertos por descarte de selección': 0, 'Hembras muertas por descarte de selección': 0, 'Cópulas': 0, Muda: 0,
  'Peso promedio machos (g)': '', 'Peso promedio hembras (g)': '' }, extra);
const sala = (Fecha, Sala, Estado, RAS, lecturas) => Object.assign({ Fecha, Sala, Estado, RAS }, lecturas);
const des = (Fecha, Lote, Desoves, huevos, noViables, N2, N5) => ({ Fecha, Lote, 'Código genético': 'CG1', Desoves, 'Total de huevos': huevos, 'Hembras no viables': noViables, N2, N5 });
const trat = (Fecha, Sala, Tipo, Area, Lotes, Productos, ras) => ({ Fecha, Sala, Tipo, 'Área': Area, Lotes, Productos, 'Productos RAS': ras });

const FUENTES = () => ({
  ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 20, 60), ing('2026-01-20', 'CD', 'CG2', 'Sala 1', 1, 10, 20), ing('2026-01-01', 'AB', 'CG1', 'Sala 2', 3, 10, 40)],
  tanques: [
    tq('2026-01-10', 'Sala 1', 1, { 'Machos muertos': 2, 'Hembras muertas': 4, 'Cópulas': 3, Muda: 1, 'Peso promedio machos (g)': 40, 'Peso promedio hembras (g)': 55 }),
    tq('2026-01-30', 'Sala 1', 1, { 'Hembras muertas': 6, 'Hembras muertas por descarte de selección': 2, Muda: 3, 'Peso promedio machos (g)': 42, 'Peso promedio hembras (g)': 58 }),
    tq('2026-01-30', 'Sala 2', 3, { 'Machos muertos': 1, 'Cópulas': 2, Muda: 1, 'Peso promedio hembras (g)': 60 }),
  ],
  mortDesove: [{ Fecha: '2026-01-31', Lote: 'AB', 'Tipo de tanque': 'Desove', 'Hembras que entran': 20, 'Hembras muertas': 2 }],
  sala: [
    sala('2026-01-29', 'Sala 1', 'Producción', 'SI', { 'Temperatura 2:00': 27, 'Temperatura 4:00': 28, 'Oxígeno 06:00': 5 }),
    sala('2026-01-30', 'Sala 1', 'Producción', 'SI', { 'Temperatura 2:00': 28, 'Temperatura 4:00': '28.5', 'Temperatura 6:00': 29, 'Temperatura 8:00': '', 'Oxígeno 06:00': 5, 'Oxígeno 12:00': 6 }),
    sala('2026-01-30', 'Sala 2', 'Producción', 'NO', { 'Temperatura 2:00': 30 }),
    sala('', 'Sala 3', 'Producción', 'SI', { 'Temperatura 2:00': 31 }),
  ],
  desoves: [des('2026-01-12', 'AB', 10, 1000000, 3, 600000, 500000), des('2026-01-20', 'ab', 6, 800000, 1, '', ''), des('2026-01-25', 'AB', 4, 400000, '', 300000, '')],
  tratamientos: [
    trat('2026-01-28', 'Sala 1', 'Preventivo', 'Lotes', 'AB, CD', 'Bacmil', 'EM-1'),
    trat('2026-01-29', 'Sala 1', 'Desinfección', 'Salas y tanques', '', 'Formol', ''),
    trat('2026-01-30', 'Sala 2', 'Preventivo', 'Lotes', 'AB', 'Lactosac', ''),
    trat('2026-01-31', '', 'Desinfección', 'RAS y tuberías', '', 'Cloro', ''),
  ],
});
const R = resumenMaduracion(FUENTES(), { hoy: '2026-02-01' });
const lote = (n) => R.lotes.find((l) => l.lote === n);
const deSala = (n) => R.salas.find((s) => s.sala === n);

describe('Resumen · piezas', () => {
  it('estadística del día: promedio, ÚLTIMA lectura en orden, CV muestral; con una lectura no hay CV', () => {
    expect(estadisticaDia([28, '28.5', 29, '', null])).toEqual({ n: 3, prom: 28.5, ultima: 29, cv: 1.75 });
    expect(estadisticaDia([30])).toEqual({ n: 1, prom: 30, ultima: 30, cv: '' });
    expect(estadisticaDia(['', 'x'])).toEqual({ n: 0, prom: '', ultima: '', cv: '' });
    expect(RESUMEN_TEMPS).toHaveLength(12);
    expect(RESUMEN_OXIGENOS).toEqual(['Oxígeno 06:00', 'Oxígeno 12:00', 'Oxígeno 18:00', 'Oxígeno 00:00']);
  });
  it('días entre fechas, en UTC', () => {
    expect(diasEntre('2026-01-10', '2026-02-01')).toBe(22);
    expect(diasEntre('2026-01-01', 'x')).toBe('');
  });
});

describe('Resumen · salas', () => {
  it('🔴 último registro: estado, RAS, T° y O2 con Δ contra el registro anterior y CV', () => {
    // T°: [28, 28.5, 29] → prom 28.5, CV 0.5/28.5 = 1.75 %; el 01-29 promediaba 27.5 → Δ +1. O2: [5, 6] → 5.5, CV 12.86 %; antes 5 → Δ 0.5.
    expect(deSala('Sala 1')).toMatchObject({ fecha: '2026-01-30', estado: 'Producción', ras: 'SI',
      temp: { prom: 28.5, ultima: 29, cv: 1.75, delta: 1 }, ox: { prom: 5.5, ultima: 6, cv: 12.86, delta: 0.5 } });
    expect(deSala('Sala 2')).toMatchObject({ ras: 'NO', temp: { prom: 30, ultima: 30, cv: '', delta: '' }, ox: { prom: '', ultima: '', cv: '', delta: '' } });
    expect(R.salas.map((s) => s.sala)).toEqual(['Sala 1', 'Sala 2']);   // la fila sin fecha de la Sala 3 no cuenta
  });
  it('🔴 lotes de la sala con su estado, y tanques y animales en producción y cuarentena', () => {
    // Sala 1: AB 18♂ 49♀ (copuló el 01-10: Producción) y CD 10♂ 18♀ (entró el 01-20, sin cópula: Cuarentena).
    expect(deSala('Sala 1')).toMatchObject({ lotes: [{ lote: 'AB', estado: 'Producción', machos: 18, hembras: 49 }, { lote: 'CD', estado: 'Cuarentena', machos: 10, hembras: 18 }],
      tanquesProduccion: 1, animalesProduccion: 67, animalesCuarentena: 28 });
    expect(deSala('Sala 2')).toMatchObject({ tanquesProduccion: 1, animalesProduccion: 48, animalesCuarentena: 0 });
    expect(deSala('Sala 1').tratamientos.map((t) => [t.fecha, t.tipo])).toEqual([['2026-01-29', 'Desinfección'], ['2026-01-28', 'Preventivo']]);
  });
});

describe('Resumen · lotes', () => {
  it('🔴 población, muertos (tanques + desove), descartes y tasas sobre lo ingresado', () => {
    // AB: ingresan 30♂ 100♀. Muertos ♂ 2+1 = 3; ♀ 4 + 5 (de las 8 bajas del 01-30 le tocan 6: 5 muertas y 1 descarte) + 2 en desove = 11.
    expect(lote('AB')).toMatchObject({ machos: 27, hembras: 88, estado: 'Producción', ingresados: { machos: 30, hembras: 100 },
      muertos: { machos: 3, hembras: 11 }, descartes: { machos: 0, hembras: 1 }, tasaMortalidad: { machos: 10, hembras: 11, total: 10.77 } });
    expect(lote('CD')).toMatchObject({ machos: 10, hembras: 18, estado: 'Cuarentena', muertos: { machos: 0, hembras: 2 }, tasaMortalidad: { machos: 0, hembras: 10, total: 6.67 } });
  });
  it('🔴 días: la cópula antes de los 15 días termina la cuarentena; una cópula tardía no la alarga', () => {
    expect(lote('AB').dias).toEqual([
      { sala: 'Sala 1', estado: 'Producción', diasCuarentena: 9, diasProduccion: 22 },
      { sala: 'Sala 2', estado: 'Producción', diasCuarentena: 15, diasProduccion: 16 },
    ]);
    expect(lote('CD').dias).toEqual([{ sala: 'Sala 1', estado: 'Cuarentena', diasCuarentena: 12, diasProduccion: 0 }]);
  });
  it('🔴 relación H:M de cada tanque y peso del último registro (promedio de sus tanques ese día)', () => {
    expect(lote('AB').tanques).toEqual([
      { sala: 'Sala 1', tanque: 1, machos: 28, hembras: 67, relacion: 2.39 },
      { sala: 'Sala 2', tanque: 3, machos: 9, hembras: 39, relacion: 4.33 },
    ]);
    expect([lote('AB').pesoMachos, lote('AB').pesoHembras]).toEqual([{ valor: 42, fecha: '2026-01-30' }, { valor: 59, fecha: '2026-01-30' }]);
  });
  it('🔴 % mudas y % cópulas del último día, sobre los vivos DE ESE DÍA (antes de la mortalidad en desove del 01-31)', () => {
    // AB el 01-30: mudas 3+1 = 4 sobre 96 + 49 vivos = 2.76 %; cópulas 0+2 sobre 68 + 40 hembras = 1.85 %.
    expect([lote('AB').fechaDia, lote('AB').pctMudas, lote('AB').pctCopulas]).toEqual(['2026-01-30', 2.76, 1.85]);
    expect([lote('CD').pctMudas, lote('CD').pctCopulas]).toEqual([3.13, 0]);
  });
  it('🔴 desoves: totales, Nauplios/Hembra sólo con N5 y fertilidad sólo con N2 (los pendientes no diluyen)', () => {
    expect(lote('AB').desoves).toEqual({ desoves: 20, noViables: 4, huevos: 2200000, n2: 900000, n5: 500000, naupliosPorHembra: 50000, fertilidad: 64.29 });
    expect(lote('CD').desoves).toMatchObject({ desoves: 0, naupliosPorHembra: '', fertilidad: '' });
  });
  it('mortalidad en desove y recuperación, y los preventivos del lote más recientes primero', () => {
    expect([lote('AB').mortDesove, lote('AB').mortRecuperacion]).toEqual([{ entran: 20, muertas: 2, pct: 10 }, { entran: 0, muertas: 0, pct: '' }]);
    expect(lote('AB').tratamientos).toEqual([{ fecha: '2026-01-30', sala: 'Sala 2', productos: 'Lactosac', ras: '' }, { fecha: '2026-01-28', sala: 'Sala 1', productos: 'Bacmil', ras: 'EM-1' }]);
    expect(lote('CD').tratamientos.map((t) => t.fecha)).toEqual(['2026-01-28']);
  });
  it('RAS: lo aplicado al RAS (por su área o como productos RAS), más reciente primero; y la fecha del libro', () => {
    expect(R.ras).toEqual([{ fecha: '2026-01-31', sala: '', tipo: 'Desinfección', productos: 'Cloro' }, { fecha: '2026-01-28', sala: 'Sala 1', tipo: 'Preventivo', productos: 'EM-1' }]);
    expect([R.hoy, R.hasta, R.avisos]).toEqual(['2026-02-01', '2026-01-31', 0]);
  });
  it('un lote CERRADO y sin animales no aparece', () => {
    const f = FUENTES();
    f.cierres = [{ Fecha: '2026-01-31', Lote: 'CD', Tipo: 'Total', Machos: 10, Hembras: 18, Sala: '' }];
    expect(resumenMaduracion(f, { hoy: '2026-02-01' }).lotes.map((l) => l.lote)).toEqual(['AB']);
  });
});

/* ── PARIDAD con el monolito ── */
describe('Resumen · el monolito y el módulo dan lo mismo', () => {
  const src = readFileSync(new URL('../../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');
  const bloque = (desde, hasta) => {
    const i = src.indexOf(desde);
    const j = src.indexOf(hasta, i);
    if (i < 0 || j < 0) throw new Error('Ancla no encontrada: ' + desde.slice(0, 40));
    return src.slice(i, j + hasta.length);
  };
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(bloque('const MAD_CUARENTENA_DIAS = 15;', '  return lotes.sort().join("+");\n}') + '\n'
    + bloque('const MAD_RES_TEMPS = [', 'lotes:_madResLotes(f, libro, hoy), ras:ras };\n}')
    + '\n;globalThis.__api = { madResumenMaduracion, madResEstadisticaDia, madResDiasEntre, MAD_RES_TEMPS, MAD_RES_OXIGENOS };').runInContext(ctx);
  const api = ctx.__api;

  it('las mismas lecturas de la sala y las mismas piezas', () => {
    expect([api.MAD_RES_TEMPS, api.MAD_RES_OXIGENOS]).toEqual([RESUMEN_TEMPS, RESUMEN_OXIGENOS]);
    for (const v of [[28, '28.5', 29, '', null], [30], [], ['x'], [-1, 1], [0, 0]]) expect(api.madResEstadisticaDia(v)).toEqual(estadisticaDia(v));
    expect(api.madResDiasEntre('2026-01-10', '2026-02-01')).toBe(22);
  });

  it('🔴 el mismo resumen, cifra a cifra, en el caso completo y en variantes', () => {
    const variantes = [FUENTES(), Object.assign(FUENTES(), { cierres: [{ Fecha: '2026-01-31', Lote: 'CD', Tipo: 'Total', Machos: 10, Hembras: 18, Sala: '' }] }),
      Object.assign(FUENTES(), { sala: [], desoves: [], tratamientos: [] }), {}];
    for (const f of variantes) {
      for (const hoy of ['2026-02-01', '2026-01-25']) expect(api.madResumenMaduracion(f, { hoy })).toEqual(resumenMaduracion(f, { hoy }));
    }
  });
});
