/* Mortalidad de hembras en tanques de desove y recuperación (2026-09-15): el módulo y su PARIDAD con el bloque
   inline de engine.js. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';
import {
  MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_COLUMNS, MAD_MORT_TIPOS, pctMortalidad, mortRowId, buildMortRows, buildMortPayload, validarMort,
  MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS, nauplioRowId, opcionNauplios,
} from './ficha-maduracion-mortdesove.schema.js';

const col = (h) => MAD_MORT_HEADERS.indexOf(h);
const base = () => ({ fecha: '2026-09-15', lotes: [
  { lote: 'bp', desove: { entran: '40', muertas: '3' }, recuperacion: { entran: 37, muertas: 1 }, observaciones: 'ok' },
  { lote: 'BC', desove: { entran: '', muertas: '' }, recuperacion: { entran: 20, muertas: 0 } },
] });
const rev = (deformidad, actividad, hongos, salinidad, temperatura) => ({ deformidad, actividad, hongos, salinidad, temperatura });
const conNauplios = () => ({ fecha: '2026-09-15', lotes: [
  { lote: 'bp', desove: { entran: 40, muertas: 3 }, observaciones: 'ok',
    nauplios: { entrada: rev('baja', 'Alta', 'Ausente', '34.5', '29'), lavado: rev('', '', '', '', ''), lavado2: rev('Ausente', 'media', 'Ausente', 34, 28.8), postlavado: {} } },
  { lote: 'BC', nauplios: { postlavado: rev('Media', 'Baja', 'Presente', '', '30') } },
] });

describe('Inf. Supervisor · la hoja', () => {
  it('la misma hoja: mortalidad, después la revisión de nauplios, y el ID al final', () => {
    expect(MAD_MORT_SHEET).toBe('Maduración Mortalidad Desove');
    expect(MAD_MORT_HEADERS).toEqual(['Fecha', 'Lote', 'Tipo de tanque', 'Hembras que entran', 'Hembras muertas', '% Mortalidad',
      'Revisión', 'Deformidad', 'Actividad', 'Hongos', 'Salinidad', 'Temperatura', 'Observaciones', 'ID']);
    expect(MAD_MORT_TIPOS).toEqual(['Desove', 'Recuperación']);
    expect([MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS]).toEqual([
      ['Entrada', 'Lavado', 'Lavado 2', 'Postlavado'], ['Alta', 'Media', 'Baja', 'Ausente'], ['Alta', 'Media', 'Baja'], ['Ausente', 'Presente']]);
  });

  it('🔴 una fila por revisión con algún dato, con la grafía de la lista, sus cifras y su ID; la mortalidad sin revisión', () => {
    const filas = buildMortRows(conNauplios());
    const ver = (f) => [f[col('Lote')], f[col('Tipo de tanque')], f[col('% Mortalidad')], f[col('Revisión')], f[col('Deformidad')], f[col('Actividad')],
      f[col('Hongos')], f[col('Salinidad')], f[col('Temperatura')], f[col('Observaciones')], f[col('ID')]];
    expect(filas.map(ver)).toEqual([
      ['BP', 'Desove', 7.5, '', '', '', '', '', '', 'ok', '2026-09-15-BP-DESOVE'],
      ['BP', '', '', 'Entrada', 'Baja', 'Alta', 'Ausente', 34.5, 29, '', '2026-09-15-BP-NAUP-ENTRADA'],
      ['BP', '', '', 'Lavado 2', 'Ausente', 'Media', 'Ausente', 34, 28.8, '', '2026-09-15-BP-NAUP-LAVADO2'],
      ['BC', '', '', 'Postlavado', 'Media', 'Baja', 'Presente', '', 30, '', '2026-09-15-BC-NAUP-POSTLAVADO'],
    ]);
    expect(filas.every((f) => f.length === MAD_MORT_HEADERS.length)).toBe(true);
    expect(nauplioRowId('2026-09-15', ' b p ', 'Lavado 2')).toBe('2026-09-15-BP-NAUP-LAVADO2');
    expect([opcionNauplios(MAD_NAUP_HONGOS, ' presente '), opcionNauplios(MAD_NAUP_ACTIVIDAD, 'Ausente')]).toEqual(['Presente', '']);
    // Un lote con sólo la revisión es un registro válido; la revisión a medias avisa de lo que falta.
    expect(validarMort(conNauplios())).toEqual({ errores: [], avisos: ['En BC (nauplios · Postlavado) faltan: Salinidad.'] });
  });

  it('🔴 revisión: ERROR si un valor no es de su lista o una cifra no es cifra; AVISO si T° o salinidad pasan del tope', () => {
    const m = { fecha: '2026-09-15', lotes: [{ lote: 'BP', nauplios: {
      entrada: rev('Mucha', 'Alta', 'Si', '35', '29'), lavado: rev('Baja', 'Alta', 'Ausente', 'x', '41'), postlavado: rev('Baja', 'Alta', 'Ausente', '61', '28') } }] };
    const r = validarMort(m);
    expect(r.errores).toEqual([
      'En BP (nauplios · Entrada) «Mucha» no es un valor de Deformidad (Alta, Media, Baja, Ausente).',
      'En BP (nauplios · Entrada) «Si» no es un valor de Hongos (Ausente, Presente).',
      'En BP (nauplios · Lavado) la salinidad no es una cifra válida.',
    ]);
    expect(r.avisos).toEqual([
      'En BP (nauplios · Lavado) la temperatura (41) pasa de 40: revisa que esté bien escrita.',
      'En BP (nauplios · Postlavado) la salinidad (61) pasa de 60: revisa que esté bien escrita.',
    ]);
    // Sin lote pero con revisión: falta el lote.
    expect(validarMort({ fecha: '2026-09-15', lotes: [{ lote: '', nauplios: { entrada: rev('Baja') } }] }).errores).toEqual(['Falta el lote del registro 1.']);
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
      'El lote DD no trae ninguna cifra ni revisión de nauplios.',
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
    + '\n;globalThis.__api = { MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_COLUMNS, MAD_MORT_TIPOS, madMortPct, madMortRowId, buildMadMortPayload, madMortValidar,'
    + ' MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS, madNaupRowId, madNaupOpcion };').runInContext(ctx);
  return ctx.__api;
})();

describe('Inf. Supervisor · el monolito y el módulo dicen lo mismo', () => {
  const MODELOS = [base(), { fecha: 'x', lotes: [{ lote: 'BP', desove: { muertas: 2 } }, { lote: 'BC', recuperacion: { entran: 3, muertas: 5 } }, { lote: 'bc', desove: { entran: 1 } }, { lote: '', desove: { entran: 1 } }, { lote: 'DD' }, null] }, { fecha: '2026-09-15', lotes: [] },
    conNauplios(), { fecha: '2026-09-15', lotes: [{ lote: 'BP', nauplios: { entrada: rev('Mucha', 'Alta', 'Si', '35', '29'), lavado: rev('Baja', 'x', 'Ausente', 'x', '41'), postlavado: rev('', '', '', '61', '-3') } }, { lote: '', nauplios: { lavado2: rev('Baja') } }] }];
  it('la misma hoja, columnas, tipos y listas de la revisión', () => {
    expect([api.MAD_MORT_SHEET, api.MAD_MORT_HEADERS, api.MAD_MORT_TIPOS]).toEqual([MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_TIPOS]);
    expect(api.MAD_MORT_COLUMNS.map((c) => c.k)).toEqual(MAD_MORT_COLUMNS.map((c) => c.k));
    expect([api.MAD_NAUP_REVISIONES, api.MAD_NAUP_DEFORMIDAD, api.MAD_NAUP_ACTIVIDAD, api.MAD_NAUP_HONGOS]).toEqual([MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS]);
  });
  it('el mismo %, el mismo ID, el mismo payload y el mismo veredicto', () => {
    for (const [e, m] of [[40, 3], ['37', '1'], [0, 1], ['', 1], [10, ''], [3, 1], [-2, 1]]) expect(api.madMortPct(e, m)).toBe(pctMortalidad(e, m));
    for (const t of ['Desove', 'Recuperación', 'Otro']) expect(api.madMortRowId('2026-09-15', 'b p', t)).toBe(mortRowId('2026-09-15', 'b p', t));
    for (const t of [...MAD_NAUP_REVISIONES, 'Otra']) expect(api.madNaupRowId('2026-09-15', 'b p', t)).toBe(nauplioRowId('2026-09-15', 'b p', t));
    for (const v of ['presente', ' Alta ', 'x', '', null]) expect(api.madNaupOpcion(MAD_NAUP_HONGOS, v)).toBe(opcionNauplios(MAD_NAUP_HONGOS, v));
    for (const m of MODELOS) {
      expect(api.buildMadMortPayload(m)).toEqual(buildMortPayload(m));
      expect(api.madMortValidar(m)).toEqual(validarMort(m));
    }
    expect(validarMort(MODELOS[1]).errores.length).toBeGreaterThan(3);   // el fixture ejerce algo
    expect(validarMort(MODELOS[4]).errores.length).toBeGreaterThan(3);
    expect(buildMortRows(MODELOS[3]).length).toBe(4);
  });
  it('la pestaña: panel en el shell, rótulo, render y protección contra el GAS viejo', () => {
    const shell = readFileSync(new URL('../shell.html', import.meta.url), 'utf8');
    expect(shell).toContain('id="fp-mortdes"');
    expect(src).toMatch(/const MAD_TABS\s+= \[[^\]]*"desoves","mortdes"/);
    expect(src).toContain('mortdes:  ["📋","Inf. Supervisor"]');
    expect(src).toContain('<div class="fc-t">📋 Maduración · Inf. Supervisor</div>');
    expect(src).toContain('if(t==="mortdes") renderMadMortDesove();');
    expect(src).toMatch(/function _madHojaPideGasNuevo\(hoja\)\{[^}]*hoja === MAD_MORT_SHEET/);
    expect(src).toContain('if(fp.querySelector("#mm-cards")) return;');
  });
});
