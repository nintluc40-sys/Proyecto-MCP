/* Mortalidad de hembras en tanques de desove y recuperación (2026-09-15): el módulo y su PARIDAD con el bloque
   inline de engine.js. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_TANQUES_POR_SALA, MAD_SALA_OPTS } from './ficha-maduracion-ingreso.schema.js';
import {
  MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_COLUMNS, MAD_MORT_TIPOS, pctMortalidad, mortRowId, buildMortRows, buildMortPayload, validarMort,
  MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS, nauplioRowId, opcionNauplios,
  MAD_NAUP_FOTOTROPISMO, MAD_NAUP_AIREACION,
  MAD_ALC_AREAS, alcalinidadRowId, MAD_ALC_TURNOS,
} from './ficha-maduracion-mortdesove.schema.js';

const col = (h) => MAD_MORT_HEADERS.indexOf(h);
/* 2026-09-24 (punto 6) · cada lote trae su CÓDIGO GENÉTICO —es parte de la llave— y, a veces, su piscina. Valores
   inventados; «cg1» en minúsculas a propósito: se normaliza como el lote. */
const base = () => ({ fecha: '2026-09-15', lotes: [
  { lote: 'bp', codigoGenetico: 'cg1', piscina: '101', desove: { entran: '40', muertas: '3' }, recuperacion: { entran: 37, muertas: 1 }, observaciones: 'ok' },
  { lote: 'BC', codigoGenetico: 'CG2', desove: { entran: '', muertas: '' }, recuperacion: { entran: 20, muertas: 0 } },
] });
/* 2026-09-15 · Fototropismo y Aireación van AL FINAL de la firma a propósito: así los casos que
   no los nombran siguen valiendo y se ve, caso por caso, cuáles los ejercen de verdad. */
const rev = (deformidad, actividad, hongos, salinidad, temperatura, fototropismo, aireacion) =>
  ({ deformidad, actividad, hongos, salinidad, temperatura, fototropismo, aireacion });
const conNauplios = () => ({ fecha: '2026-09-15', lotes: [
  { lote: 'bp', codigoGenetico: 'CG1', desove: { entran: 40, muertas: 3 }, observaciones: 'ok',
    nauplios: { entrada: rev('baja', 'Alta', 'Ausente', '34.5', '29', 'Alta', 'Media'), lavado: rev('', '', '', '', ''),
      lavado2: rev('Ausente', 'media', 'Ausente', 34, 28.8, 'baja', 'ALTA'), postlavado: {} } },
  // I1: BC sólo trae revisión; sus observaciones no pueden perderse.
  { lote: 'BC', codigoGenetico: 'CG2', nauplios: { postlavado: rev('Media', 'Baja', 'Presente', '', '30') }, observaciones: 'sin hongos al inicio' },
] });

describe('Inf. Supervisor · la hoja', () => {
  it('la misma hoja: mortalidad, después la revisión de nauplios, el ID y, detrás, la temperatura del tanque de desove', () => {
    expect(MAD_MORT_SHEET).toBe('Maduración Mortalidad Desove');
    expect(MAD_MORT_HEADERS).toEqual(['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Tipo de tanque', 'Hembras que entran', 'Hembras muertas', '% Mortalidad',
      'Revisión', 'Deformidad', 'Actividad', 'Hongos', 'Fototropismo', 'Aireación', 'Salinidad', 'Temperatura',
      'Área', 'Alcalinidad día', 'Alcalinidad noche', 'Observaciones', 'ID', 'Temperatura tanque desove']);
    expect(MAD_MORT_TIPOS).toEqual(['Desove', 'Recuperación']);
    expect([MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS]).toEqual([
      ['Entrada', 'Lavado', 'Lavado 2', 'Postlavado'], ['Alta', 'Media', 'Baja', 'Ausente'], ['Alta', 'Media', 'Baja'], ['Ausente', 'Presente']]);
    /* 2026-09-15 (usuario) · las dos nuevas son categóricas Alta/Media/Baja, y van con LISTA PROPIA
       aunque hoy coincida con la de Actividad: compartirla haría que retocar una cambiara las otras. */
    expect([MAD_NAUP_FOTOTROPISMO, MAD_NAUP_AIREACION]).toEqual([['Alta', 'Media', 'Baja'], ['Alta', 'Media', 'Baja']]);
    expect(MAD_NAUP_FOTOTROPISMO, 'comparten el mismo array: retocar una cambiaría las otras').not.toBe(MAD_NAUP_ACTIVIDAD);
    expect(MAD_NAUP_AIREACION).not.toBe(MAD_NAUP_FOTOTROPISMO);
    /* El ID es la llave con la que el GAS hace el MERGE; desde el 2026-10-04 lleva DETRÁS la temperatura del tanque de
       desove (como la guía de Ingreso: sin migrar la hoja) y el GAS lo localiza por su cabecera. */
    expect(MAD_MORT_HEADERS.slice(-2)).toEqual(['ID', 'Temperatura tanque desove']);
  });

  it('🔴 una fila por revisión con algún dato, con la grafía de la lista, sus cifras y su ID; la mortalidad sin revisión', () => {
    const filas = buildMortRows(conNauplios());
    const ver = (f) => [f[col('Lote')], f[col('Tipo de tanque')], f[col('% Mortalidad')], f[col('Revisión')], f[col('Deformidad')], f[col('Actividad')],
      f[col('Hongos')], f[col('Fototropismo')], f[col('Aireación')], f[col('Salinidad')], f[col('Temperatura')], f[col('Observaciones')], f[col('ID')]];
    expect(filas.map(ver)).toEqual([
      ['BP', 'Desove', 7.5, '', '', '', '', '', '', '', '', 'ok', '2026-09-15-BP-CG1-DESOVE'],
      ['BP', '', '', 'Entrada', 'Baja', 'Alta', 'Ausente', 'Alta', 'Media', 34.5, 29, 'ok', '2026-09-15-BP-CG1-NAUP-ENTRADA'],
      // «baja» y «ALTA» entran con la grafía de la lista, igual que los otros tres campos.
      ['BP', '', '', 'Lavado 2', 'Ausente', 'Media', 'Ausente', 'Baja', 'Alta', 34, 28.8, 'ok', '2026-09-15-BP-CG1-NAUP-LAVADO2'],
      ['BC', '', '', 'Postlavado', 'Media', 'Baja', 'Presente', '', '', '', 30, 'sin hongos al inicio', '2026-09-15-BC-CG2-NAUP-POSTLAVADO'],
    ]);
    expect(filas.every((f) => f.length === MAD_MORT_HEADERS.length)).toBe(true);
    expect(nauplioRowId('2026-09-15', ' b p ', ' cg 1 ', 'Lavado 2')).toBe('2026-09-15-BP-CG1-NAUP-LAVADO2');
    expect([opcionNauplios(MAD_NAUP_HONGOS, ' presente '), opcionNauplios(MAD_NAUP_ACTIVIDAD, 'Ausente')]).toEqual(['Presente', '']);
    // Un lote con sólo la revisión es un registro válido; la revisión a medias avisa de lo que falta.
    // BC sólo trae tres de los siete campos: el aviso los nombra en el orden de la ficha.
    expect(validarMort(conNauplios())).toEqual({ errores: [], avisos: ['En BC · CG2 (nauplios · Postlavado) faltan: Fototropismo, Aireación, Salinidad.'] });
  });

  it('🔴 revisión: ERROR si un valor no es de su lista o una cifra no es cifra; AVISO si T° o salinidad pasan del tope', () => {
    const m = { fecha: '2026-09-15', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', nauplios: {
      entrada: rev('Mucha', 'Alta', 'Si', '35', '29', 'Altísima', 'Baja'),
      lavado: rev('Baja', 'Alta', 'Ausente', 'x', '41', 'Alta', 'Media'),
      postlavado: rev('Baja', 'Alta', 'Ausente', '61', '28', 'Alta', 'Media') } }] };
    const r = validarMort(m);
    expect(r.errores).toEqual([
      'En BP · CG1 (nauplios · Entrada) «Mucha» no es un valor de Deformidad (Alta, Media, Baja, Ausente).',
      'En BP · CG1 (nauplios · Entrada) «Si» no es un valor de Hongos (Ausente, Presente).',
      // Los dos campos nuevos se validan igual que los otros tres, y no al final: en su sitio.
      'En BP · CG1 (nauplios · Entrada) «Altísima» no es un valor de Fototropismo (Alta, Media, Baja).',
      'En BP · CG1 (nauplios · Lavado) la salinidad no es una cifra válida.',
    ]);
    expect(r.avisos).toEqual([
      'En BP · CG1 (nauplios · Lavado) la temperatura (41) pasa de 40: revisa que esté bien escrita.',
      'En BP · CG1 (nauplios · Postlavado) la salinidad (61) pasa de 60: revisa que esté bien escrita.',
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
      ['BP', 'Desove', 40, 3, 7.5, '2026-09-15-BP-CG1-DESOVE'],
      ['BP', 'Recuperación', 37, 1, 2.7, '2026-09-15-BP-CG1-RECUPERACION'],
      ['BC', 'Recuperación', 20, 0, 0, '2026-09-15-BC-CG2-RECUPERACION'],
    ]);
    expect(mortRowId('2026-09-15', ' b p ', ' cg 1 ', 'Desove')).toBe('2026-09-15-BP-CG1-DESOVE');
    expect(buildMortPayload(base())).toMatchObject({ sheetName: MAD_MORT_SHEET, headers: MAD_MORT_HEADERS });
    expect(validarMort(base())).toEqual({ errores: [], avisos: [] });
  });

  it('🔴 ERROR: muertas sin las que entran, más muertas que las que entran, lote repetido, cifras sin lote', () => {
    const m = { fecha: '2026-09-15', lotes: [
      { lote: 'BP', codigoGenetico: 'CG1', desove: { muertas: 2 } },
      { lote: 'BC', codigoGenetico: 'CG2', recuperacion: { entran: 3, muertas: 5 } },
      { lote: 'bc', codigoGenetico: 'cg2', desove: { entran: 1, muertas: 0 } },
      { lote: '', desove: { entran: 1 } },
      { lote: 'DD' },
      {},
    ] };
    expect(validarMort(m).errores).toEqual([
      'En BP · CG1 (tanques de desove) hay muertas pero no las hembras que entran: sin ellas no hay porcentaje.',
      'En BC · CG2 (tanques de recuperación) mueren más hembras (5) de las que entran (3).',
      'El lote BC con código CG2 aparece dos veces en esta fecha: escribiría las mismas filas. Súmalos.',
      'Falta el lote del registro 4.',
      'El lote DD no trae ninguna cifra ni revisión de nauplios.',
    ]);
  });

  it('AVISO si faltan las muertas; ERROR si no hay nada o la fecha no vale', () => {
    expect(validarMort({ fecha: '2026-09-15', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', desove: { entran: 10 } }] }).avisos)
      .toEqual(['En BP · CG1 (tanques de desove) no se anotaron muertas: se guarda como 0 % sólo si escribes 0.']);
    expect(validarMort({ fecha: '2026-09-15', lotes: [{}] }).errores).toEqual(['No hay ningún registro que guardar.']);
    expect(validarMort({ fecha: 'x', lotes: base().lotes }).errores).toEqual(['La fecha no es válida.']);
  });
});

/* ── 2026-09-24 (usuario, punto 6) · CÓDIGO GENÉTICO Y PISCINA BROODSTOCK ─────────────────────────────
   «Añadir los campos de Código genético y Piscina Broodstock para identificar dichos individuos». Decisiones del
   usuario: el código es parte de la LLAVE, como en Desoves (un pool es lote + código), y las dos columnas van
   DETRÁS DEL LOTE. La piscina es dato. */
describe('Inf. Supervisor · el código genético en la llave (punto 6)', () => {
  const dos = (cg2) => ({ fecha: '2026-09-15', lotes: [
    { lote: 'BP', codigoGenetico: 'CG1', piscina: '101', desove: { entran: 10, muertas: 1 } },
    { lote: 'bp', codigoGenetico: cg2, piscina: '102', desove: { entran: 8, muertas: 0 } },
  ] });

  it('🔴 las dos columnas van DETRÁS del lote, y el ID sigue el último salvo la temperatura del desove (2026-10-04)', () => {
    expect(MAD_MORT_HEADERS.slice(0, 5)).toEqual(['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Tipo de tanque']);
    expect(MAD_MORT_HEADERS.slice(-2)).toEqual(['ID', 'Temperatura tanque desove']);
  });

  it('🔴 el mismo lote con OTRO código es otro registro: dos filas, dos IDs, cada una con su código y su piscina', () => {
    const filas = buildMortRows(dos('CG2'));
    expect(filas.map((f) => [f[col('Lote')], f[col('Código genético')], f[col('Piscina Broodstock')], f[col('ID')]])).toEqual([
      ['BP', 'CG1', '101', '2026-09-15-BP-CG1-DESOVE'],
      ['BP', 'CG2', '102', '2026-09-15-BP-CG2-DESOVE'],
    ]);
    expect(validarMort(dos('CG2'))).toEqual({ errores: [], avisos: [] });
  });

  it('🔴 el mismo lote con el MISMO código es ERROR: escribirían la misma fila', () => {
    expect(validarMort(dos(' cg1 ')).errores).toEqual(['El lote BP con código CG1 aparece dos veces en esta fecha: escribiría las mismas filas. Súmalos.']);
  });

  it('🔴 sin código genético: ERROR, y no se escribe fila (sin llave completa no hay fila, como en Desoves)', () => {
    const m = { fecha: '2026-09-15', lotes: [{ lote: 'BP', desove: { entran: 10, muertas: 1 }, nauplios: { entrada: rev('Baja') } }] };
    expect(validarMort(m).errores).toEqual(['Falta el código genético del lote BP (registro 1).']);
    expect(buildMortRows(m)).toEqual([]);
  });

  it('la piscina es DATO: va en su columna, no cambia el ID y puede faltar', () => {
    const [con] = buildMortRows(dos('CG2'));
    const [sin] = buildMortRows({ fecha: '2026-09-15', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', desove: { entran: 10, muertas: 1 } }] });
    expect([con[col('Piscina Broodstock')], sin[col('Piscina Broodstock')]]).toEqual(['101', '']);
    expect(con[col('ID')]).toBe(sin[col('ID')]);
  });

  it('la revisión de nauplios también lleva el código y la piscina, y su ID el código', () => {
    const f = buildMortRows({ fecha: '2026-09-15', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', piscina: '101', nauplios: { entrada: rev('Baja') } }] })[0];
    expect([f[col('Código genético')], f[col('Piscina Broodstock')], f[col('Revisión')], f[col('ID')]])
      .toEqual(['CG1', '101', 'Entrada', '2026-09-15-BP-CG1-NAUP-ENTRADA']);
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
  /* MAD_SALA_OPTS vive arriba del monolito, fuera de los bloques que se extraen: se le da al vm
     igual que MAD_TANQUES_POR_SALA. Es una constante ESPEJADA, no lógica, y su paridad la vigila
     verificar-3copias. */
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite, sanitizeStr, MAD_TANQUES_POR_SALA, MAD_SALA_OPTS };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(bloque('const MAD_ING_SHEET = "Maduración Ingreso";', fin) + '\n' + bloque('const MAD_DESOVE_SHEET = "Maduración Lotes";', fin) + '\n'
    + bloque('const MAD_MORT_SHEET = "Maduración Mortalidad Desove";', fin)
    + '\n;globalThis.__api = { MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_COLUMNS, MAD_MORT_TIPOS, madMortPct, madMortRowId, buildMadMortPayload, madMortValidar,'
    + ' MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS, madNaupRowId, madNaupOpcion,'
    + ' MAD_NAUP_FOTOTROPISMO, MAD_NAUP_AIREACION, MAD_ALC_AREAS, madAlcRowId, MAD_ALC_TURNOS };').runInContext(ctx);
  return ctx.__api;
})();

describe('Inf. Supervisor · el monolito y el módulo dicen lo mismo', () => {
  const MODELOS = [base(), { fecha: 'x', lotes: [{ lote: 'BP', desove: { muertas: 2 } }, { lote: 'BC', recuperacion: { entran: 3, muertas: 5 } }, { lote: 'bc', desove: { entran: 1 } }, { lote: '', desove: { entran: 1 } }, { lote: 'DD' }, null] }, { fecha: '2026-09-15', lotes: [] },
    conNauplios(), { fecha: '2026-09-15', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', nauplios: { entrada: rev('Mucha', 'Alta', 'Si', '35', '29'), lavado: rev('Baja', 'x', 'Ausente', 'x', '41'), postlavado: rev('', '', '', '61', '-3') } }, { lote: '', nauplios: { lavado2: rev('Baja') } }] },
    // PE1.5 · alcalinidad de día y de noche: sólo día, sólo noche, las dos, una que no es cifra y un área que no existe.
    { fecha: '2026-09-15', lotes: [], alcalinidad: { RAS: { dia: '120', noche: 'x' }, 'Sala 2': { noche: 88 }, 'Sala 3': { dia: 95.5, noche: '101' }, 'Sala 9': { dia: 1 } } },
    // 2026-09-24 (punto 6) · el código en la llave: el mismo lote con dos códigos, y uno sin código.
    { fecha: '2026-09-15', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', piscina: '101', desove: { entran: 10, muertas: 1 } }, { lote: 'bp', codigoGenetico: 'CG2', desove: { entran: 8, muertas: 0 } }] },
    { fecha: '2026-09-15', lotes: [{ lote: 'BP', desove: { entran: 10, muertas: 1 } }] },
    // 2026-10-04 · la temperatura del tanque de desove: con cifras, sola, no cifra, alta, y en recuperación (que no la lleva).
    { fecha: '2026-10-04', lotes: [{ lote: 'BP', codigoGenetico: 'CG1', desove: { entran: 10, muertas: 1, temperatura: '28.5' } },
      { lote: 'BC', codigoGenetico: 'CG2', desove: { temperatura: 27 }, recuperacion: { entran: 5, muertas: 0, temperatura: 30 } },
      { lote: 'BD', codigoGenetico: 'CG3', desove: { temperatura: 'x' } }, { lote: 'BE', codigoGenetico: 'CG4', desove: { entran: 4, temperatura: 41 } }] }];
  it('la misma hoja, columnas, tipos y listas de la revisión', () => {
    expect([api.MAD_MORT_SHEET, api.MAD_MORT_HEADERS, api.MAD_MORT_TIPOS]).toEqual([MAD_MORT_SHEET, MAD_MORT_HEADERS, MAD_MORT_TIPOS]);
    expect(api.MAD_MORT_COLUMNS.map((c) => c.k)).toEqual(MAD_MORT_COLUMNS.map((c) => c.k));
    expect([api.MAD_NAUP_REVISIONES, api.MAD_NAUP_DEFORMIDAD, api.MAD_NAUP_ACTIVIDAD, api.MAD_NAUP_HONGOS]).toEqual([MAD_NAUP_REVISIONES, MAD_NAUP_DEFORMIDAD, MAD_NAUP_ACTIVIDAD, MAD_NAUP_HONGOS]);
  });
  it('el mismo %, el mismo ID, el mismo payload y el mismo veredicto', () => {
    for (const [e, m] of [[40, 3], ['37', '1'], [0, 1], ['', 1], [10, ''], [3, 1], [-2, 1]]) expect(api.madMortPct(e, m)).toBe(pctMortalidad(e, m));
    for (const t of ['Desove', 'Recuperación', 'Otro']) expect(api.madMortRowId('2026-09-15', 'b p', 'cg 1', t)).toBe(mortRowId('2026-09-15', 'b p', 'cg 1', t));
    for (const t of [...MAD_NAUP_REVISIONES, 'Otra']) expect(api.madNaupRowId('2026-09-15', 'b p', 'cg 1', t)).toBe(nauplioRowId('2026-09-15', 'b p', 'cg 1', t));
    for (const v of ['presente', ' Alta ', 'x', '', null]) expect(api.madNaupOpcion(MAD_NAUP_HONGOS, v)).toBe(opcionNauplios(MAD_NAUP_HONGOS, v));
    for (const m of MODELOS) {
      expect(api.buildMadMortPayload(m)).toEqual(buildMortPayload(m));
      expect(api.madMortValidar(m)).toEqual(validarMort(m));
    }
    expect(validarMort(MODELOS[1]).errores.length).toBeGreaterThan(3);   // el fixture ejerce algo
    expect(validarMort(MODELOS[4]).errores.length).toBeGreaterThan(3);
    expect(buildMortRows(MODELOS[3]).length).toBe(4);
    expect(buildMortRows(MODELOS[5]).length, 'el fixture de alcalinidad escribe filas de verdad').toBe(3);
    expect(validarMort(MODELOS[5]).errores.length).toBe(1);
    expect([...api.MAD_ALC_TURNOS]).toEqual(MAD_ALC_TURNOS);
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

/* ── 2026-10-04 (usuario) · LA TEMPERATURA DEL TANQUE DE DESOVE ─────────────────────────────
   «Similar al campo de hembras que entran y hembras muertas, otro campo para la temperatura del tanque desove.»
   Decisiones del usuario: columna PROPIA (la 22, detrás del ID), sola también crea la fila, y se ve en el MCP. */
describe('Inf. Supervisor · la temperatura del tanque de desove (2026-10-04)', () => {
  const T = col('Temperatura tanque desove');
  const modelo = () => ({ fecha: '2026-10-04', lotes: [
    { lote: 'BP', codigoGenetico: 'CG1', desove: { entran: 10, muertas: 1, temperatura: '28.5' }, recuperacion: { entran: 9, muertas: 0, temperatura: 30 } },
    { lote: 'BC', codigoGenetico: 'CG2', desove: { temperatura: 27 } }] });

  it('va en SU columna y sólo en la fila de Desove: ni en Recuperación ni en la «Temperatura» de nauplios', () => {
    const filas = buildMortRows(modelo());
    const desoveBP = filas.find((f) => f[col('ID')] === '2026-10-04-BP-CG1-DESOVE');
    const recup = filas.find((f) => f[col('ID')] === '2026-10-04-BP-CG1-RECUPERACION');
    expect(desoveBP[T]).toBe(28.5);
    expect(desoveBP[col('Temperatura')]).toBe('');
    expect(recup[T]).toBe('');
    expect(filas.every((f) => f.length === MAD_MORT_HEADERS.length)).toBe(true);
  });

  it('🔴 sola crea la fila de Desove, sin cifras de hembras y sin el aviso de «no se anotaron muertas»', () => {
    const filas = buildMortRows(modelo());
    const bc = filas.filter((f) => f[col('Lote')] === 'BC');
    expect(bc).toHaveLength(1);
    expect([bc[0][col('Tipo de tanque')], bc[0][col('Hembras que entran')], bc[0][col('Hembras muertas')], bc[0][T]]).toEqual(['Desove', '', '', 27]);
    const v = validarMort(modelo());
    expect(v.errores).toEqual([]);
    expect(v.avisos.filter((a) => a.includes('BC'))).toEqual([]);
  });

  it('una que no es cifra es ERROR; por encima de 40 °C, AVISO (el tope de la temperatura de nauplios)', () => {
    const v = validarMort({ fecha: '2026-10-04', lotes: [{ lote: 'BD', codigoGenetico: 'CG3', desove: { temperatura: 'x' } },
      { lote: 'BE', codigoGenetico: 'CG4', desove: { entran: 4, muertas: 0, temperatura: 41 } }] });
    expect(v.errores).toEqual(['En BD · CG3 (tanques de desove) la temperatura no es una cifra válida.']);
    expect(v.avisos).toEqual(['En BE · CG4 (tanques de desove) la temperatura (41) pasa de 40: revisa que esté bien escrita.']);
  });
});

/* ── 2026-09-15 (usuario) · ALCALINIDAD POR ÁREA ──────────────────────────────────────────
   «Añadir un campo denominado Alcalinidad, donde el usuario marcará el valor de alcalinidad
   diaria que puede ser a estas áreas: RAS, Sala 1 … Sala 5.»

   🔑 SU GRANO NO ES EL DE LA FICHA. Las demás filas son por (fecha, lote) o por (fecha, lote,
   revisión); ésta es por (fecha, ÁREA), y el RAS no es un lote ni una sala del libro. Es el
   tercer tipo de fila de esta hoja, y lo que hay que vigilar es justamente que no se confunda
   con los otros dos: ni escribe columnas de mortalidad, ni el libro la cuenta. */
describe('Inf. Supervisor · la alcalinidad del día', () => {
  const soloAlc = (alcalinidad) => ({ fecha: '2026-09-15', lotes: [], alcalinidad });

  it('el fixture ejerce algo: las áreas son el RAS y las cinco salas', () => {
    expect(MAD_ALC_AREAS).toEqual(['RAS', 'Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']);
    expect(MAD_ALC_AREAS[0], 'el RAS no es una sala: va aparte y primero').toBe('RAS');
  });

  /* 2026-09-16 (usuario, PE1.5) · «alcalinidad de día y de noche, con sus campos por cada área». */
  it('los dos turnos, en su orden', () => {
    expect(MAD_ALC_TURNOS).toEqual([['dia', 'día'], ['noche', 'noche']]);
  });

  it('🔴 una fila por área con ALGÚN turno, cada turno en su columna, y ninguna por las demás', () => {
    // Sin valor no se escribe fila, y con el MERGE del GAS no escribir es CONSERVAR lo que hubiera.
    const filas = buildMortRows(soloAlc({ RAS: { dia: '120' }, 'Sala 2': { noche: 88 }, 'Sala 3': { dia: 95.5, noche: '101' }, 'Sala 1': { dia: '', noche: '' } }));
    expect(filas.map((f) => [f[col('Área')], f[col('Alcalinidad día')], f[col('Alcalinidad noche')], f[col('ID')]])).toEqual([
      ['RAS', 120, '', '2026-09-15-ALC-RAS'],
      ['Sala 2', '', 88, '2026-09-15-ALC-S2'],
      ['Sala 3', 95.5, 101, '2026-09-15-ALC-S3'],
    ]);
  });

  it('🔴 la de noche anotada DESPUÉS va a la MISMA fila que la de día (el ID no lleva el turno)', () => {
    /* Así, con el MERGE del GAS, guardar la de noche horas después completa la fila y no pisa la de
       día: su celda viaja vacía y vacío es conservar. Un ID por turno partiría el área en dos filas. */
    const [manana] = buildMortRows(soloAlc({ RAS: { dia: 120 } }));
    const [tarde] = buildMortRows(soloAlc({ RAS: { noche: 110 } }));
    expect(manana[col('ID')]).toBe(tarde[col('ID')]);
    expect([tarde[col('Alcalinidad día')], tarde[col('Alcalinidad noche')]]).toEqual(['', 110]);
  });

  it('🔴 no escribe nada de las otras dos clases de fila', () => {
    /* Si escribiera «Tipo de tanque» o «Revisión», el libro y el tablero la leerían como lo que
       no es. Las columnas que no son suyas van vacías. */
    const f = buildMortRows(soloAlc({ RAS: { dia: 120, noche: 118 } }))[0];
    expect([f[col('Lote')], f[col('Tipo de tanque')], f[col('Revisión')], f[col('Hembras muertas')]]).toEqual(['', '', '', '']);
    expect(f).toHaveLength(MAD_MORT_HEADERS.length);
  });

  it('el ID distingue el RAS de cada sala', () => {
    expect(alcalinidadRowId('2026-09-15', 'RAS')).toBe('2026-09-15-ALC-RAS');
    expect(alcalinidadRowId('2026-09-15', 'Sala 5')).toBe('2026-09-15-ALC-S5');
    expect(alcalinidadRowId('2026-09-15', 'RAS')).not.toBe(alcalinidadRowId('2026-09-15', 'Sala 1'));
  });

  it('🔴 un día con SÓLO alcalinidad es un registro válido', () => {
    // Es del día y no de un lote: sin contarla, moriría en «No hay ningún registro que guardar».
    expect(validarMort(soloAlc({ 'Sala 2': { dia: 110 } }))).toEqual({ errores: [], avisos: [] });
    expect(validarMort(soloAlc({ 'Sala 2': { noche: '96' } })), 'sólo la de noche también es un registro').toEqual({ errores: [], avisos: [] });
    expect(validarMort(soloAlc({}))).toEqual({ errores: ['No hay ningún registro que guardar.'], avisos: [] });
  });

  it('una alcalinidad que no es cifra da ERROR y dice de qué TURNO y de qué área', () => {
    // Y no se le suma «no hay nada que guardar»: con un error delante, esa guarda calla.
    expect(validarMort(soloAlc({ 'Sala 4': { dia: 'mucha', noche: 'poca' }, RAS: { noche: '-' } })).errores).toEqual([
      'La alcalinidad de noche de RAS no es una cifra válida.',
      'La alcalinidad de día de Sala 4 no es una cifra válida.',
      'La alcalinidad de noche de Sala 4 no es una cifra válida.',
    ]);
  });
});
