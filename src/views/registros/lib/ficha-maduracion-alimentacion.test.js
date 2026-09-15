/* ALIMENTACIÓN de Maduración (2026-09-15): el módulo contra las cifras del Excel del módulo («ALIMENTACION %», Sala 1
   del 2026-09-01) y su PARIDAD con el bloque inline de engine.js. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import { construirLibro } from './mad-libro.js';
import {
  MAD_ALIM_SHEET, MAD_ALIM_HEADERS, MAD_ALIM_COLUMNS, MAD_ALIM_PRODUCTOS, MAD_ALIM_TOMAS_ESTANDAR, alimHora, alimOrdenDelDia, alimProducto,
  alimNum, alimOrdenarTomas, alimTomasActivas, alimTomasTexto, alimTomasDesdeTexto, alimCalcularSala, alimResumenGeneral, alimPoblacion,
  alimTanquesDelLibro, alimPesosDeReferencia, alimAgendasDeHoja, alimRowId, buildAlimRows, buildAlimPayload, validarAlim,
} from './ficha-maduracion-alimentacion.schema.js';

/* Sala 1 del Excel: los cinco tanques con animales, con el saldo (U/V) y la biometría (AK/AL) de «SEPTIEMBRE 2026». */
const SALA1 = () => [
  { tanque: 1, lotes: 'A', hembras: 33, machos: 59, pesoH: 68, pesoM: 54 },
  { tanque: 2, lotes: 'A', hembras: 36, machos: 67, pesoH: 68, pesoM: 54 },
  { tanque: 11, lotes: 'B', hembras: 60, machos: 54, pesoH: 66, pesoM: 53 },
  { tanque: 12, lotes: 'B', hembras: 62, machos: 56, pesoH: 66, pesoM: 53 },
  { tanque: 13, lotes: 'B', hembras: 55, machos: 51, pesoH: 66, pesoM: 53 },
];

describe('Alimentación · piezas', () => {
  it('la hoja, sus columnas con el ID al final, los alimentos y la agenda estándar (suma 14,05 %)', () => {
    expect(MAD_ALIM_SHEET).toBe('Maduración Alimentación');
    expect(MAD_ALIM_PRODUCTOS).toEqual(['Poliqueto', 'Redy Mate', 'Calamar', 'Mejillón', 'Krill', 'Vitallis']);
    expect(MAD_ALIM_HEADERS[MAD_ALIM_HEADERS.length - 1]).toBe('ID');
    expect(MAD_ALIM_HEADERS).toContain('Biomasa total (kg)');
    expect(MAD_ALIM_HEADERS).toContain('Mejillón (kg/día)');
    expect(MAD_ALIM_TOMAS_ESTANDAR.map((t) => t.hora)).toEqual(['06:00', '07:00', '08:30', '10:00', '11:30', '13:00', '14:00', '15:00', '16:00', '18:00', '20:00', '22:00', '23:00', '02:00']);
    expect(Math.round(alimTomasActivas(MAD_ALIM_TOMAS_ESTANDAR).reduce((a, t) => a + t.pct, 0) * 100) / 100).toBe(14.05);
  });

  it('horas, orden del día desde las 06:00, alimentos con cualquier grafía y cifras con coma', () => {
    expect([alimHora('6:00'), alimHora('08:30'), alimHora('24:00'), alimHora('8.30'), alimHora('')]).toEqual(['06:00', '08:30', '', '', '']);
    expect(alimOrdenDelDia('06:00')).toBe(0);
    expect(alimOrdenDelDia('02:00')).toBeGreaterThan(alimOrdenDelDia('23:00'));
    expect([alimProducto('mejillon'), alimProducto('REDIMATE'), alimProducto('redy mate'), alimProducto('Pulpo')]).toEqual(['Mejillón', 'Redy Mate', 'Redy Mate', '']);
    expect([alimNum('1,5'), alimNum('0.25'), alimNum('-1'), alimNum('x')]).toEqual([1.5, 0.25, '', '']);
    expect(alimOrdenarTomas([{ hora: '02:00' }, { hora: '6:00' }, { hora: 'x' }, { hora: '13:00' }]).map((t) => t.hora)).toEqual(['02:00', '6:00', '13:00', 'x'].sort((a, b) => alimOrdenDelDia(a) - alimOrdenDelDia(b)));
  });

  it('🔴 la agenda viaja como texto y vuelve igual, horas sin alimento incluidas', () => {
    const t = alimTomasTexto(MAD_ALIM_TOMAS_ESTANDAR);
    expect(t.startsWith('06:00 Redy Mate 0.25; 07:00 Krill 1.5; 08:30 Calamar 2;')).toBe(true);
    expect(t).toContain('14:00 —');
    expect(t.endsWith('02:00 Vitallis 0.3')).toBe(true);
    expect(alimTomasDesdeTexto(t)).toEqual(MAD_ALIM_TOMAS_ESTANDAR.map((x) => ({ hora: x.hora, producto: x.producto, pct: x.pct })));
    expect(alimTomasDesdeTexto('9:00 Krill 1,25; basura; 10:00 —')).toEqual([{ hora: '09:00', producto: 'Krill', pct: 1.25 }, { hora: '10:00', producto: '', pct: '' }]);
  });
});

describe('Alimentación · el cálculo reproduce el Excel', () => {
  const C = alimCalcularSala('Sala 1', MAD_ALIM_TOMAS_ESTANDAR, SALA1());

  it('🔴 biomasa por tanque en kg (♀ × peso + ♂ × peso)', () => {
    // T1: 33 × 68 = 2244 g ♀ y 59 × 54 = 3186 g ♂ → 5430 g. T11: 60 × 66 = 3960 y 54 × 53 = 2862 → 6822 g.
    expect(C.tanques.map((t) => [t.tanque, t.biomasaH, t.biomasaM, t.biomasa])).toEqual([
      [1, 2.244, 3.186, 5.43], [2, 2.448, 3.618, 6.066], [11, 3.96, 2.862, 6.822], [12, 4.092, 2.968, 7.06], [13, 3.63, 2.703, 6.333]]);
    expect(C.totales).toMatchObject({ hembras: 246, machos: 287, biomasa: 31.711, pctDia: 14.05 });
  });

  it('🔴 kg/día por alimento de la sala: los de las celdas AA16:AA22 del Excel', () => {
    // Excel: Poliqueto 0,3171 · Redy Mate 0,1586 · Calamar 2,2198 · Mejillón 0,2378 · Krill 1,427 · Vitallis 0,0951 · total 4,4554.
    expect(C.productos.map((p) => [p.producto, p.pct, p.kgDia])).toEqual([
      ['Poliqueto', 1, 0.317], ['Redy Mate', 0.5, 0.159], ['Calamar', 7, 2.22], ['Mejillón', 0.75, 0.238], ['Krill', 4.5, 1.427], ['Vitallis', 0.3, 0.095]]);
    expect([C.totales.kgDia, C.totales.kgMes]).toEqual([4.455, 133.65]);
  });

  it('🔴 la ración de cada toma para la sala y los kg/día de cada tanque', () => {
    // 08:30 Calamar 2 %: 31.711 g × 2 % = 634,22 g → 0,634 kg (Excel I22: 0,6342). T1: 5430 g × 14,05 % = 762,9 g/día.
    expect(C.tomas.find((t) => t.hora === '08:30')).toEqual({ hora: '08:30', producto: 'Calamar', pct: 2, kgSala: 0.634 });
    expect(C.tomas).toHaveLength(13);   // la de las 14:00 no reparte
    expect(C.tanques[0]).toMatchObject({ kgDia: 0.763, porProducto: { Calamar: 0.38, Poliqueto: 0.054 } });
    // La cuadrícula del Excel, fila del tanque 1: G7 13,575 · H7 81,45 · I7 108,6 · K7 54,3 … V7 16,29 (g).
    expect(C.tanques[0].tomasG).toEqual([13.6, 81.5, 108.6, 54.3, 108.6, 81.5, 81.5, 40.7, 13.6, 81.5, 40.7, 40.7, 16.3]);
  });

  it('resumen general: suma las salas por alimento', () => {
    const otra = alimCalcularSala('Sala 2', [{ hora: '06:00', producto: 'Krill', pct: 1 }], [{ tanque: 16, hembras: 10, machos: 10, pesoH: 50, pesoM: 50 }]);
    const G = alimResumenGeneral([C, otra]);
    expect(G.productos.find((p) => p.producto === 'Krill')).toEqual({ producto: 'Krill', kgDia: 1.437, kgMes: 43.11 });
    expect(G.totales).toMatchObject({ hembras: 256, machos: 297, biomasa: 32.711, kgDia: 4.465 });
  });

  it('sin peso de un sexo, su biomasa cuenta 0 (y la validación lo avisa)', () => {
    const x = alimCalcularSala('Sala 1', MAD_ALIM_TOMAS_ESTANDAR, [{ tanque: 1, hembras: 10, machos: 10, pesoH: 50, pesoM: '' }]);
    expect([x.tanques[0].biomasaH, x.tanques[0].biomasaM]).toEqual([0.5, 0]);
  });
});

/* Libro con dos lotes: A en la Sala 1 tanque 1 (ingreso 01-01, 60 g ♀ y 50 g ♂ en Ingreso) y B que llega el 01-20 al
   tanque 2, que antes tuvo a Z (pesado el 01-10, cerrado el 01-12). */
const ing = (Fecha, Lote, Sala, Tanque, Machos, Hembras, pm, ph) => ({ Fecha, Lote, 'Código genético': 'CG', Sala, Tanque, Machos, Hembras,
  'Peso promedio machos (g)': pm, 'Peso promedio hembras (g)': ph });
const tq = (Fecha, Sala, Tanque, pm, ph) => ({ Fecha, Sala, Tanque, 'Machos muertos': 0, 'Hembras muertas': 0, 'Peso promedio machos (g)': pm, 'Peso promedio hembras (g)': ph });
const FUENTES = () => ({
  ingresos: [ing('2026-01-01', 'A', 'Sala 1', 1, 20, 40, 50, 60), ing('2026-01-02', 'Z', 'Sala 1', 2, 10, 10, 40, 45), ing('2026-01-20', 'B', 'Sala 1', 2, 10, 30, '', ''),
    ing('2026-01-20', 'B', 'Sala 2', 16, 30, 10, 48, 58)],
  tanques: [tq('2026-01-10', 'Sala 1', 1, 55, 66), tq('2026-01-15', 'Sala 1', 1, '', 70), tq('2026-01-10', 'Sala 1', 2, 44, 49)],
  cierres: [{ Fecha: '2026-01-12', Lote: 'Z', Tipo: 'Total', Machos: 10, Hembras: 10, Sala: '' }],
});

const MOVIDO = () => ({
  ingresos: [ing('2026-01-01', 'Y', 'Sala 1', 3, 10, 10, 30, 35), ing('2026-01-01', 'X', 'Sala 1', 4, 10, 10, 70, 75)],
  tanques: [tq('2026-01-05', 'Sala 1', 4, 80, 90)],
  cierres: [{ Fecha: '2026-01-06', Lote: 'X', Tipo: 'Total', Machos: 10, Hembras: 10, Sala: '' }],
  movimientos: [{ Fecha: '2026-01-08', Tipo: 'Transferencia', 'Sala origen': 'Sala 1', 'Tanque origen': 3, 'Sala destino': 'Sala 1', 'Tanque destino': 4,
    Machos: 10, Hembras: 10, 'Agua destino': 'RAS', Motivo: 'Logística', Observaciones: '' }],
});

describe('Alimentación · animales y pesos desde el libro', () => {
  const f = FUENTES();
  const libro = construirLibro(f, { hoy: '2026-01-25' });
  const P = alimPesosDeReferencia(f, libro);

  it('🔴 tanques con animales por sala, desde el libro', () => {
    expect(alimTanquesDelLibro(libro)).toEqual({
      'Sala 1': [{ tanque: 1, lotes: 'A', hembras: 40, machos: 20 }, { tanque: 2, lotes: 'B', hembras: 30, machos: 10 }],
      'Sala 2': [{ tanque: 16, lotes: 'B', hembras: 10, machos: 30 }],
    });
  });

  it('🔴 el peso es la ÚLTIMA biometría de un día en que el tanque tenía su lote; por sexo', () => {
    // Tanque 1: ♀ 70 del 01-15; ♂ sólo el 01-10 (55).
    expect(P['Sala 1|1']).toEqual({ hembras: { valor: 70, fuente: 'Biometría', fecha: '2026-01-15' }, machos: { valor: 55, fuente: 'Biometría', fecha: '2026-01-10' } });
  });

  it('🔴 un tanque reutilizado NO hereda la biometría del lote anterior: cae al Ingreso de su lote, ponderado', () => {
    // Tanque 2: la biometría del 01-10 es de Z. B no tiene peso en su ingreso al tanque 2, así que se usa todo el lote B: sólo
    // la fila de la Sala 2 lo trae (48 g ♂, 58 g ♀).
    expect(P['Sala 1|2']).toEqual({ hembras: { valor: 58, fuente: 'Ingreso', fecha: '2026-01-20' }, machos: { valor: 48, fuente: 'Ingreso', fecha: '2026-01-20' } });
    expect(P['Sala 2|16'].machos).toEqual({ valor: 48, fuente: 'Ingreso', fecha: '2026-01-20' });
  });

  it('🔴 la biometría de otro lote POSTERIOR al ingreso del lote de hoy tampoco cuenta (el de hoy llegó por un movimiento)', () => {
    // Y ingresa el 01-01 en el tanque 3; X está en el 4, se pesa el 01-05 (80 g ♂, 90 g ♀) y se cierra el 01-06; el 01-08 Y pasa
    // al 4. La fila del 01-05 es posterior al ingreso de Y pero es de X: Y usa su Ingreso (30 g ♂, 35 g ♀).
    const g = MOVIDO();
    expect(alimPesosDeReferencia(g, construirLibro(g, { hoy: '2026-01-10' }))['Sala 1|4']).toEqual({
      hembras: { valor: 35, fuente: 'Ingreso', fecha: '2026-01-01' }, machos: { valor: 30, fuente: 'Ingreso', fecha: '2026-01-01' } });
  });

  it('el Ingreso se pondera por animales cuando hay varias filas del lote', () => {
    const g = FUENTES();
    g.ingresos.push(ing('2026-01-21', 'B', 'Sala 2', 17, 10, 30, 40, 50));
    const P2 = alimPesosDeReferencia(g, construirLibro(g, { hoy: '2026-01-25' }));
    // Tanque 2 (sin peso propio): ♀ (58 × 10 + 50 × 30) / 40 = 52; ♂ (48 × 30 + 40 × 10) / 40 = 46.
    expect([P2['Sala 1|2'].hembras.valor, P2['Sala 1|2'].machos.valor]).toEqual([52, 46]);
  });

  it('población en producción y en cuarentena, por el estado del lote en su sala', () => {
    expect(alimPoblacion(libro)).toEqual({ produccion: { hembras: 40, machos: 20 }, cuarentena: { hembras: 40, machos: 40 } });
  });
});

describe('Alimentación · la hoja', () => {
  const modelo = () => ({ fecha: '2026-09-01', salas: [{ sala: 'Sala 1', tomas: MAD_ALIM_TOMAS_ESTANDAR, tanques: SALA1().concat([{ tanque: 3, hembras: 0, machos: 0, pesoH: 68, pesoM: 54 }]) }] });

  it('🔴 una fila por tanque con animales, con sus kg por alimento, la agenda y el ID', () => {
    const filas = buildAlimRows(modelo());
    const c = (h) => MAD_ALIM_HEADERS.indexOf(h);
    expect(filas).toHaveLength(5);
    expect(filas[0].length).toBe(MAD_ALIM_HEADERS.length);
    expect([filas[0][c('Sala')], filas[0][c('Tanque')], filas[0][c('Biomasa total (kg)')], filas[0][c('Calamar (kg/día)')], filas[0][c('Total (kg/día)')], filas[0][c('ID')]])
      .toEqual(['Sala 1', 1, 5.43, 0.38, 0.763, '2026-09-01-S1-T1']);
    expect(filas[0][c('Tomas')]).toBe(alimTomasTexto(MAD_ALIM_TOMAS_ESTANDAR));
    expect(alimRowId('2026-09-01', 'Sala 4', '3')).toBe('2026-09-01-S4-T3');
    expect(buildAlimPayload(modelo())).toMatchObject({ sheetName: MAD_ALIM_SHEET, headers: MAD_ALIM_HEADERS });
    expect(MAD_ALIM_COLUMNS.map((x) => x.k)).toContain('kg:Krill');
  });

  it('🔴 la última agenda de cada sala en la hoja (por fecha)', () => {
    const filas = [{ Fecha: '2026-09-01', Sala: 'Sala 1', Tomas: '06:00 Krill 1' }, { Fecha: '2026-09-03', Sala: 'Sala 1', Tomas: '07:00 Calamar 2; 14:00 —' },
      { Fecha: '2026-09-02', Sala: 'Sala 1', Tomas: '08:00 Vitallis 0.3' }, { Fecha: '2026-09-02', Sala: 'Sala 2', Tomas: '' }];
    expect(alimAgendasDeHoja(filas)).toEqual({ 'Sala 1': { fecha: '2026-09-03', tomas: [{ hora: '07:00', producto: 'Calamar', pct: 2 }, { hora: '14:00', producto: '', pct: '' }] } });
  });

  it('el modelo completo del Excel se valida sin errores ni avisos', () => {
    expect(validarAlim(modelo())).toEqual({ errores: [], avisos: [] });
  });

  it('🔴 ERRORES y AVISOS de la agenda y de los tanques', () => {
    const m = { fecha: '2026-09-01', salas: [
      { sala: 'Sala 1', tomas: [{ hora: '6', producto: 'Krill', pct: 1 }, { hora: '07:00', producto: 'Pulpo', pct: 1 }, { hora: '08:00', producto: 'Krill', pct: 'x' },
        { hora: '09:00', producto: '', pct: 1 }, { hora: '10:00', producto: 'Calamar', pct: '' }, { hora: '11:00', producto: 'Calamar', pct: 3 },
        { hora: '11:00', producto: 'calamar', pct: 1 }, {}],
      tanques: [{ tanque: 1, hembras: 10, machos: 'x', pesoH: '', pesoM: 50 }] },
      { sala: 'Sala 2', tomas: [], tanques: [{ tanque: 16, hembras: 5, machos: 0, pesoH: 60 }] },
    ] };
    const r = validarAlim(m);
    expect(r.errores).toEqual([
      'Sala 1 · toma 1: la hora no es válida (usa HH:MM).',
      'Sala 1 · toma 2 (07:00): «Pulpo» no es un alimento de la lista.',
      'Sala 1 · toma 2 (07:00): tiene % pero no alimento.',
      'Sala 1 · toma 3 (08:00): el % no es una cifra válida.',
      'Sala 1 · toma 4 (09:00): tiene % pero no alimento.',
      'Sala 1 · toma 7 (11:00): Calamar ya está a esa hora. Júntalas.',
      'Sala 1 · tanque 1: machos no es una cifra válida.',
      'Sala 2: tiene animales y ninguna toma con alimento y %.',
    ]);
    expect(r.avisos).toEqual([
      'Sala 1 · toma 3 (08:00): Krill sin %: no reparte alimento.',
      'Sala 1 · toma 5 (10:00): Calamar sin %: no reparte alimento.',
      'Sala 1 · toma 6 (11:00): 3 % está fuera de lo habitual (0.25 a 2).',
      'Sala 1 · tanque 1: hay hembras sin peso; su biomasa cuenta 0.',
    ]);
    expect(validarAlim({ fecha: 'x', salas: [] }).errores).toEqual(['La fecha no es válida.']);
    expect(validarAlim({ fecha: '2026-09-01', salas: [] }).errores).toEqual(['No hay tanques con animales que guardar: pulsa 🔄 Leer saldo y pesos.']);
  });
});

/* ── PARIDAD con el monolito ── */
describe('Alimentación · el monolito y el módulo dan lo mismo', () => {
  const src = readFileSync(new URL('../../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');
  const bloque = (desde, hasta) => {
    const i = src.indexOf(desde);
    const j = src.indexOf(hasta, i);
    if (i < 0 || j < 0) throw new Error('Ancla no encontrada: ' + desde.slice(0, 40));
    return src.slice(i, j + hasta.length);
  };
  const fin = '  return { errores: errores, avisos: avisos };\n}';
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite, Infinity, sanitizeStr };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script('const MAD_TANQUES_POR_SALA = {};\n' + bloque('const MAD_CUARENTENA_DIAS = 15;', '  return lotes.sort().join("+");\n}') + '\n'
    + bloque('function madIngSalaTag(sala){', '\n}') + '\n'
    + bloque('const MAD_ALIM_SHEET = "Maduración Alimentación";', fin)
    + '\n;globalThis.__api = { MAD_ALIM_SHEET, MAD_ALIM_HEADERS, MAD_ALIM_COLUMNS, MAD_ALIM_PRODUCTOS, MAD_ALIM_TOMAS_ESTANDAR, madAlimHora, madAlimOrdenDelDia,'
    + ' madAlimProducto, madAlimNum, madAlimOrdenarTomas, madAlimTomasActivas, madAlimTomasTexto, madAlimTomasDesdeTexto, madAlimCalcularSala, madAlimResumenGeneral,'
    + ' madAlimPoblacion, madAlimTanquesDelLibro, madAlimPesosDeReferencia, madAlimAgendasDeHoja, madAlimRowId, buildMadAlimPayload, madAlimValidar, madConstruirLibro };').runInContext(ctx);
  const api = ctx.__api;
  const jj = (x) => JSON.parse(JSON.stringify(x));

  it('las mismas constantes y piezas', () => {
    expect(jj([api.MAD_ALIM_SHEET, api.MAD_ALIM_HEADERS, api.MAD_ALIM_PRODUCTOS, api.MAD_ALIM_TOMAS_ESTANDAR])).toEqual([MAD_ALIM_SHEET, MAD_ALIM_HEADERS, MAD_ALIM_PRODUCTOS, MAD_ALIM_TOMAS_ESTANDAR]);
    expect(jj(api.MAD_ALIM_COLUMNS.map((c) => c.k))).toEqual(MAD_ALIM_COLUMNS.map((c) => c.k));
    for (const h of ['6:00', '06:00', '24:00', '8.30', '', null, '23:59']) {
      expect(api.madAlimHora(h)).toBe(alimHora(h));
      expect(api.madAlimOrdenDelDia(h)).toBe(alimOrdenDelDia(h));
    }
    for (const p of ['mejillon', 'REDIMATE', 'Redy mate', 'Pulpo', '', ' krill ']) expect(api.madAlimProducto(p)).toBe(alimProducto(p));
    for (const n of ['1,5', '0.25', '-1', 'x', '', 3]) expect(api.madAlimNum(n)).toBe(alimNum(n));
    const raras = [{ hora: '02:00', producto: 'krill', pct: '1,5' }, { hora: 'x', producto: 'Pulpo', pct: 1 }, { hora: '6:00', producto: '', pct: '' }, null];
    expect(jj(api.madAlimOrdenarTomas(raras))).toEqual(alimOrdenarTomas(raras));
    expect(jj(api.madAlimTomasActivas(raras))).toEqual(alimTomasActivas(raras));
    expect(api.madAlimTomasTexto(MAD_ALIM_TOMAS_ESTANDAR)).toBe(alimTomasTexto(MAD_ALIM_TOMAS_ESTANDAR));
    for (const t of [alimTomasTexto(MAD_ALIM_TOMAS_ESTANDAR), '9:00 Krill 1,25; basura; 10:00 —', '']) expect(jj(api.madAlimTomasDesdeTexto(t))).toEqual(alimTomasDesdeTexto(t));
    expect(api.madAlimRowId('2026-09-01', 'Sala 4', '3')).toBe(alimRowId('2026-09-01', 'Sala 4', '3'));
  });

  it('🔴 el mismo cálculo por sala y el mismo resumen general', () => {
    const casos = [['Sala 1', MAD_ALIM_TOMAS_ESTANDAR, SALA1()], ['Sala 2', [{ hora: '06:00', producto: 'Krill', pct: 1 }, { hora: '7:00', producto: 'calamar', pct: '0,5' }], [{ tanque: 16, hembras: '10', machos: 'x', pesoH: '50,5', pesoM: '' }]],
      ['Sala 3', [], []]];
    const mod = casos.map((c) => alimCalcularSala(...c));
    const eng = casos.map((c) => api.madAlimCalcularSala(...c));
    expect(jj(eng)).toEqual(jj(mod));
    expect(jj(api.madAlimResumenGeneral(eng))).toEqual(jj(alimResumenGeneral(mod)));
  });

  it('🔴 los mismos animales, pesos, población y agendas desde el libro', () => {
    for (const f of [FUENTES(), Object.assign(FUENTES(), { tanques: [] }), { ingresos: [], tanques: [] }, MOVIDO()]) {
      const libroMod = construirLibro(f, { hoy: '2026-01-25' });
      const libroEng = api.madConstruirLibro(f, { hoy: '2026-01-25' });
      expect(jj(api.madAlimTanquesDelLibro(libroEng))).toEqual(jj(alimTanquesDelLibro(libroMod)));
      expect(jj(api.madAlimPesosDeReferencia(f, libroEng))).toEqual(jj(alimPesosDeReferencia(f, libroMod)));
      expect(jj(api.madAlimPoblacion(libroEng))).toEqual(jj(alimPoblacion(libroMod)));
    }
    const filas = [{ Fecha: '2026-09-01', Sala: 'Sala 1', Tomas: '06:00 Krill 1' }, { Fecha: '2026-09-03', Sala: 'Sala 1', Tomas: '07:00 Calamar 2; 14:00 —' }, { Fecha: 'x', Sala: 'Sala 2', Tomas: '06:00 Krill 1' }];
    expect(jj(api.madAlimAgendasDeHoja(filas))).toEqual(jj(alimAgendasDeHoja(filas)));
  });

  it('🔴 el mismo payload y el mismo veredicto', () => {
    const modelos = [
      { fecha: '2026-09-01', salas: [{ sala: 'Sala 1', tomas: MAD_ALIM_TOMAS_ESTANDAR, tanques: SALA1() }] },
      { fecha: 'x', salas: [{ sala: 'Sala 1', tomas: [{ hora: '6', producto: 'Krill', pct: 1 }, { hora: '07:00', producto: 'Pulpo', pct: 1 }, { hora: '08:00', producto: 'Krill', pct: 'x' },
        { hora: '09:00', producto: '', pct: 1 }, { hora: '10:00', producto: 'Calamar', pct: '' }, { hora: '11:00', producto: 'Calamar', pct: 3 }, { hora: '11:00', producto: 'calamar', pct: 1 }, {}],
      tanques: [{ tanque: 1, hembras: 10, machos: 'x', pesoH: '', pesoM: 50 }, { tanque: 'x', hembras: 5 }] }, { sala: 'Sala 2', tomas: [], tanques: [{ tanque: 16, hembras: 5, pesoH: 'y' }] }, null, { sala: '' }] },
      { fecha: '2026-09-01', salas: [] },
    ];
    for (const m of modelos) {
      expect(jj(api.buildMadAlimPayload(m))).toEqual(jj(buildAlimPayload(m)));
      expect(jj(api.madAlimValidar(m))).toEqual(jj(validarAlim(m)));
    }
    expect(validarAlim(modelos[1]).errores.length).toBeGreaterThan(6);   // el fixture ejerce algo
  });
});
