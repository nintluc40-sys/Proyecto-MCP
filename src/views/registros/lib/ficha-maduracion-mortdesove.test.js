/* Mortalidad de hembras en tanques de desove y recuperación (2026-09-15): el módulo y su PARIDAD con el bloque
   inline de engine.js. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';
import {
  MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_COLUMNS, MAD_MORT_TIPOS, pctMortalidad, mortRowId, buildMortRows, buildMortPayload, validarMort,
} from './ficha-maduracion-mortdesove.schema.js';

const col = (h) => MAD_MORT_HEADERS.indexOf(h);
const base = () => ({ fecha: '2026-09-15', lotes: [
  { lote: 'bp', desove: { entran: '40', muertas: '3' }, recuperacion: { entran: 37, muertas: 1 }, observaciones: 'ok' },
  { lote: 'BC', desove: { entran: '', muertas: '' }, recuperacion: { entran: 20, muertas: 0 } },
] });

describe('Mortalidad desove · la hoja', () => {
  it('hoja nueva, columnas con el ID al final y los dos tipos de tanque', () => {
    expect(MAD_MORT_SHEET).toBe('Maduración Mortalidad Desove');
    expect(MAD_MORT_HEADERS).toEqual(['Fecha', 'Lote', 'Tipo de tanque', 'Hembras que entran', 'Hembras muertas', '% Mortalidad', 'Observaciones', 'ID']);
    expect(MAD_MORT_TIPOS).toEqual(['Desove', 'Recuperación']);
  });

  it('🔴 el % con dos decimales; sin hembras que entran no hay porcentaje', () => {
    expect(pctMortalidad(40, 3)).toBe(7.5);
    expect(pctMortalidad('37', '1')).toBe(2.7);
    expect(pctMortalidad(3, 1)).toBe(33.33);
    expect(pctMortalidad(20, 0)).toBe(0);
    expect([pctMortalidad(0, 1), pctMortalidad('', 1), pctMortalidad(10, '')]).toEqual(['', '', '']);
  });

  it('🔴 una fila por lote y tipo con alguna cifra, con su ID', () => {
    const filas = buildMortRows(base());
    expect(filas.map((f) => [f[col('Lote')], f[col('Tipo de tanque')], f[col('Hembras que entran')], f[col('Hembras muertas')], f[col('% Mortalidad')], f[col('ID')]])).toEqual([
      ['BP', 'Desove', 40, 3, 7.5, '2026-09-15-BP-DESOVE'],
      ['BP', 'Recuperación', 37, 1, 2.7, '2026-09-15-BP-RECUPERACION'],
      ['BC', 'Recuperación', 20, 0, 0, '2026-09-15-BC-RECUPERACION'],
    ]);
    expect(mortRowId('2026-09-15', ' b p ', 'Desove')).toBe('2026-09-15-BP-DESOVE');
    expect(buildMortPayload(base())).toMatchObject({ sheetName: MAD_MORT_SHEET, headers: MAD_MORT_HEADERS });
    expect(validarMort(base())).toEqual({ errores: [], avisos: [] });
  });

  it('🔴 ERROR: muertas sin las que entran, más muertas que las que entran, lote repetido, cifras sin lote', () => {
    const m = { fecha: '2026-09-15', lotes: [
      { lote: 'BP', desove: { muertas: 2 } },
      { lote: 'BC', recuperacion: { entran: 3, muertas: 5 } },
      { lote: 'bc', desove: { entran: 1, muertas: 0 } },
      { lote: '', desove: { entran: 1 } },
      { lote: 'DD' },
      {},
    ] };
    expect(validarMort(m).errores).toEqual([
      'En BP (tanques de desove) hay muertas pero no las hembras que entran: sin ellas no hay porcentaje.',
      'En BC (tanques de recuperación) mueren más hembras (5) de las que entran (3).',
      'El lote BC aparece dos veces en esta fecha: escribiría las mismas filas. Súmalos.',
      'Falta el lote del registro 4.',
      'El lote DD no trae ninguna cifra.',
    ]);
  });

  it('AVISO si faltan las muertas; ERROR si no hay nada o la fecha no vale', () => {
    expect(validarMort({ fecha: '2026-09-15', lotes: [{ lote: 'BP', desove: { entran: 10 } }] }).avisos)
      .toEqual(['En BP (tanques de desove) no se anotaron muertas: se guarda como 0 % sólo si escribes 0.']);
    expect(validarMort({ fecha: '2026-09-15', lotes: [{}] }).errores).toEqual(['No hay ningún registro que guardar.']);
    expect(validarMort({ fecha: 'x', lotes: base().lotes }).errores).toEqual(['La fecha no es válida.']);
  });
});

/* ── PARIDAD con el monolito ── */
const src = readFileSync(new URL('../../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');
const bloque = (desde, hasta) => {
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error('Ancla no encontrada: ' + desde.slice(0, 40));
  return src.slice(i, j + hasta.length);
};
const api = (() => {
  const fin = '  return { errores: errores, avisos: avisos };\n}';
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite, sanitizeStr, MAD_TANQUES_POR_SALA };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(bloque('const MAD_ING_SHEET = "Maduración Ingreso";', fin) + '\n' + bloque('const MAD_DESOVE_SHEET = "Maduración Lotes";', fin) + '\n'
    + bloque('const MAD_MORT_SHEET = "Maduración Mortalidad Desove";', fin)
    + '\n;globalThis.__api = { MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_COLUMNS, MAD_MORT_TIPOS, madMortPct, madMortRowId, buildMadMortPayload, madMortValidar };').runInContext(ctx);
  return ctx.__api;
})();

describe('Mortalidad desove · el monolito y el módulo dicen lo mismo', () => {
  const MODELOS = [base(), { fecha: 'x', lotes: [{ lote: 'BP', desove: { muertas: 2 } }, { lote: 'BC', recuperacion: { entran: 3, muertas: 5 } }, { lote: 'bc', desove: { entran: 1 } }, { lote: '', desove: { entran: 1 } }, { lote: 'DD' }, null] }, { fecha: '2026-09-15', lotes: [] }];
  it('la misma hoja, columnas y tipos', () => {
    expect([api.MAD_MORT_SHEET, api.MAD_MORT_HEADERS, api.MAD_MORT_TIPOS]).toEqual([MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_TIPOS]);
    expect(api.MAD_MORT_COLUMNS.map((c) => c.k)).toEqual(MAD_MORT_COLUMNS.map((c) => c.k));
  });
  it('el mismo %, el mismo ID, el mismo payload y el mismo veredicto', () => {
    for (const [e, m] of [[40, 3], ['37', '1'], [0, 1], ['', 1], [10, ''], [3, 1], [-2, 1]]) expect(api.madMortPct(e, m)).toBe(pctMortalidad(e, m));
    for (const t of ['Desove', 'Recuperación', 'Otro']) expect(api.madMortRowId('2026-09-15', 'b p', t)).toBe(mortRowId('2026-09-15', 'b p', t));
    for (const m of MODELOS) {
      expect(api.buildMadMortPayload(m)).toEqual(buildMortPayload(m));
      expect(api.madMortValidar(m)).toEqual(validarMort(m));
    }
    expect(validarMort(MODELOS[1]).errores.length).toBeGreaterThan(3);   // el fixture ejerce algo
  });
  it('la pestaña: panel en el shell, rótulo, render y protección contra el GAS viejo', () => {
    const shell = readFileSync(new URL('../shell.html', import.meta.url), 'utf8');
    expect(shell).toContain('id="fp-mortdes"');
    expect(src).toMatch(/const MAD_TABS\s+= \[[^\]]*"desoves","mortdes"/);
    expect(src).toContain('mortdes:  ["📉","Mortalidad ♀"]');
    expect(src).toContain('if(t==="mortdes") renderMadMortDesove();');
    expect(src).toMatch(/function _madHojaPideGasNuevo\(hoja\)\{[^}]*hoja === MAD_MORT_SHEET/);
    expect(src).toContain('if(fp.querySelector("#mm-cards")) return;');
  });
});
