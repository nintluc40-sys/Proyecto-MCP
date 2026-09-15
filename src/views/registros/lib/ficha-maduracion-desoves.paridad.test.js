/* ============================================================
   PARIDAD · Desoves de Maduración (Fase 4A)

   La lógica vive DOS VECES: en `ficha-maduracion-desoves.schema.js` y como bloque inline
   en `engine.js`, porque los dos monolitos de Music no tienen módulos ES. Esta prueba
   extrae el bloque REAL del monolito, lo ejecuta aislado y exige el mismo payload y el
   mismo veredicto.

   ⚠ Se traen DOS bloques: el de Desoves usa `madIngInt`, que vive en el de Ingreso.
   Inyectarlo desde el módulo habría tapado justo lo que esta prueba mide.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';
import {
  MAD_DESOVE_SHEET,
  MAD_DESOVE_HEADERS,
  MAD_DESOVE_COLUMNS,
  MAD_DESOVE_KEY_COLS,
  MIL,
  buildDesoveRows,
  buildDesovePayload,
  validarDesove,
  MAD_DESOVE_DESPACHO_OPTS,
  despachoLista,
  despachoTexto,
  desoveLlave,
  desoveCompleto,
  desoveDesdeHoja,
  desovesPendientes,
  anotarDesovesLocales,
  podarDesovesLocales,
} from './ficha-maduracion-desoves.schema.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

function motorDesoves() {
  const src = leer(ENGINE);
  const fin = '  return { errores: errores, avisos: avisos };\n}';
  const ing = bloque(src, 'const MAD_ING_SHEET = "Maduración Ingreso";', fin);
  const des = bloque(src, 'const MAD_DESOVE_SHEET = "Maduración Lotes";', fin);
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite,
    sanitizeStr, MAD_TANQUES_POR_SALA,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    ing + '\n' + des
    + '\n;globalThis.__api = { buildMadDesovePayload, madDesBuildRows, madDesValidar,'
    + ' madDesMiles, MAD_DESOVE_HEADERS, MAD_DESOVE_SHEET, MAD_DESOVE_COLUMNS,'
    + ' MAD_DESOVE_KEY_COLS, MAD_DESOVE_MIL, MAD_DESOVE_DESPACHO_OPTS, madDesDespachoLista, madDesDespachoTexto,'
    + ' madDesLlave, madDesCompleto, madDesDesdeHoja, madDesPendientes, madDesLocalesAnota, madDesLocalesPoda };',
  ).runInContext(ctx);
  return ctx.__api;
}

const api = motorDesoves();

/* Cada modelo ejerce una rama distinta. Ya pasó dos veces el mismo día que un fixture
   incompleto dejaba una regla sin ejercer y la paridad daba verde sin significar nada. */
const MODELOS = {
  'un desove simple': {
    fecha: '2026-09-08',
    desoves: [{ lote: 'BM', codigoGenetico: '766', piscina: 'P-766', desoves: 4, huevos: 9800, hembrasNoViables: 12, fechaN2: '', n2: '', fechaN5: '', n5: '', observaciones: 'sin novedad' }],
  },
  'un lote con DOS códigos el mismo día': {
    fecha: '2026-09-08',
    desoves: [
      { lote: 'BM', codigoGenetico: '766', piscina: 'P-766', desoves: 4, huevos: 6500 },
      { lote: 'BM', codigoGenetico: '767', piscina: 'P-767', desoves: 3, huevos: 4200 },
    ],
  },
  'completando N2 y N5 días después': {
    fecha: '2026-09-08',
    desoves: [{ lote: 'BM', codigoGenetico: '766', fechaN2: '2026-09-10', n2: 5200, fechaN5: '2026-09-13', n5: 4100 }],
  },
  'N5 sin N2 (el candado)': {
    fecha: '2026-09-08',
    desoves: [{ lote: 'BM', codigoGenetico: '766', n5: 4100 }],
  },
  'duplicado: mismo lote y código dos veces': {
    fecha: '2026-09-08',
    desoves: [
      { lote: 'BM', codigoGenetico: '766', huevos: 100 },
      { lote: 'bm', codigoGenetico: ' 766 ', huevos: 200 },
    ],
  },
  'sin llave completa y fechas al revés': {
    fecha: '2026-09-08',
    desoves: [
      { lote: 'BM', codigoGenetico: '', huevos: 100 },
      { lote: 'BC', codigoGenetico: '801', n2: 10, fechaN2: '2026-09-01', n5: 5, fechaN5: '2026-08-30' },
    ],
  },
  // 2026-09-14: un desove que sólo trae hembras no viables (conteo, sin ×1000) ejerce su rama.
  'sólo hembras no viables': { fecha: '2026-09-14', desoves: [{ lote: 'BM', codigoGenetico: '766', hembrasNoViables: 3 }] },
  // 2026-09-14: «Total de nauplios» se borró. Un borrador viejo que aún los traiga: ni fila ni cifra.
  'sólo nauplios (campo retirado)': { fecha: '2026-09-14', desoves: [{ lote: 'BM', codigoGenetico: '766', nauplios: 6500 }] },
  // 2026-09-14: Despacho elegido de la lista (array) y un texto viejo de celda.
  'con despacho elegido': { fecha: '2026-09-15', desoves: [
    { lote: 'BP', codigoGenetico: 'CG1', n2: 9000, fechaN2: '2026-09-16', n5: 8000, fechaN5: '2026-09-17', despacho: ['SanLab Eva', 'fuentes del mar', 'X'] },
    { lote: 'BP', codigoGenetico: 'CG2', despacho: 'Mar Bravo CIO, MAR BRAVO M09-M10' },
  ] },
  'sin desoves': { fecha: '2026-09-08', desoves: [] },
  'fecha inválida': { fecha: '08/09/2026', desoves: [{ lote: 'BM', codigoGenetico: '766', huevos: 10 }] },
};

describe('Desoves · el monolito y el módulo declaran lo mismo', () => {
  it('la misma hoja y el mismo factor', () => {
    expect(api.MAD_DESOVE_SHEET).toBe(MAD_DESOVE_SHEET);
    expect(api.MAD_DESOVE_MIL).toBe(MIL);
  });

  it('las mismas cabeceras, en el mismo orden', () => {
    expect(api.MAD_DESOVE_HEADERS).toEqual(MAD_DESOVE_HEADERS);
  });

  it('las mismas claves de columna, en el mismo orden', () => {
    expect(api.MAD_DESOVE_COLUMNS.map((c) => c.k)).toEqual(MAD_DESOVE_COLUMNS.map((c) => c.k));
  });

  it('🔴 la misma llave POSICIONAL, y sigue siendo las tres primeras', () => {
    /* Contrato con el GAS: `upsertMadRows` recibe [0,1,2] por POSICIÓN para esta hoja.
       Si el monolito y el módulo declararan órdenes distintos, uno de los dos escribiría
       la llave en columnas que el GAS no mira, y dos desoves se pisarían en silencio. */
    expect(api.MAD_DESOVE_KEY_COLS).toEqual(MAD_DESOVE_KEY_COLS);
    expect(api.MAD_DESOVE_HEADERS.slice(0, 3)).toEqual(['Fecha', 'Lote', 'Código genético']);
  });
});

describe('Desoves · el mismo payload, celda a celda', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('coincide con «' + nombre + '»', () => {
      expect(api.buildMadDesovePayload(model)).toEqual(buildDesovePayload(model));
    });
  }

  it('y los fixtures escriben filas DE VERDAD', () => {
    expect(buildDesoveRows(MODELOS['un lote con DOS códigos el mismo día'])).toHaveLength(2);
    expect(buildDesoveRows(MODELOS['sin llave completa y fechas al revés'])).toHaveLength(1);
  });
});

describe('Desoves · el mismo ×1000', () => {
  it('mismo resultado, incluido el VACÍO que hace posible completar después', () => {
    for (const v of [6500, '6500', 0, '', null, undefined, -3, 'x']) {
      expect(api.madDesMiles(v)).toBe(
        v === '' || v === null || v === undefined || v === 'x' || v === -3 ? '' : Number(v) * MIL,
      );
    }
  });
});

describe('Desoves · el mismo veredicto', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('mismo veredicto con «' + nombre + '»', () => {
      expect(api.madDesValidar(model)).toEqual(validarDesove(model));
    });
  }

  it('y los fixtures producen errores y avisos DE VERDAD', () => {
    expect(validarDesove(MODELOS['N5 sin N2 (el candado)']).errores.length).toBeGreaterThan(0);
    expect(validarDesove(MODELOS['duplicado: mismo lote y código dos veces']).errores.length).toBeGreaterThan(0);
    expect(validarDesove(MODELOS['sin llave completa y fechas al revés']).avisos.length).toBeGreaterThan(0);
  });
});

describe('Desoves · Despacho y pendientes: el monolito y el módulo dicen lo mismo (2026-09-14)', () => {
  const HOJA = (o) => Object.assign({ Fecha: '2026-09-07', Lote: 'BP', 'Código genético': 'OLF5.F2', 'Piscina Broodstock': 558,
    Desoves: 64, 'Total de huevos': 14440000, 'Hembras no viables': 3, 'Fecha N2': '', N2: '', 'Fecha N5': '', N5: '',
    Despacho: 'Tabasca, SanLab', Observaciones: 'ok' }, o);
  const FILAS = [HOJA(), HOJA({ 'Código genético': 'CG2', N5: 9000000 }), HOJA({ Fecha: '2026-09-10', Lote: 766, N2: '5000000', 'Total de huevos': ' ' }),
    HOJA({ Fecha: '' }), HOJA({ 'Código genético': 'CG3', N5: 0 })];
  const LOCALES = [
    { fecha: '2026-09-07', lote: 'bp', codigoGenetico: 'olf5.f2', desoves: '', n2: '8800', fechaN2: '2026-09-08', despacho: [] },
    { fecha: '2026-09-12', lote: 'BC', codigoGenetico: 'X1', huevos: '500', despacho: ['Hisenor'] },
    { fecha: '2026-09-10', lote: '766', codigoGenetico: 'OLF5.F2', n5: '4000' },
    { fecha: 'mal', lote: 'A', codigoGenetico: 'B' }, null,
  ];

  it('las mismas opciones, y la misma lista y texto para cada entrada', () => {
    expect(api.MAD_DESOVE_DESPACHO_OPTS).toEqual(MAD_DESOVE_DESPACHO_OPTS);
    for (const v of [['Mar Bravo M10', ' mar  bravo m09 ', 'X', 'Mar Bravo M10'], 'SanLab Eva', 'SanLab, SanLab Eva', '', null, undefined, [], 'MAR BRAVO M09-M10']) {
      expect(api.madDesDespachoLista(v)).toEqual(despachoLista(v));
      expect(api.madDesDespachoTexto(v)).toBe(despachoTexto(v));
    }
  });

  it('la misma conversión de cada fila de la hoja, llave y «completo»', () => {
    for (const f of FILAS.concat([{}, null])) {
      expect(api.madDesDesdeHoja(f)).toEqual(desoveDesdeHoja(f));
      expect(api.madDesLlave(desoveDesdeHoja(f))).toBe(desoveLlave(desoveDesdeHoja(f)));
      expect(api.madDesCompleto(desoveDesdeHoja(f))).toBe(desoveCompleto(desoveDesdeHoja(f)));
    }
  });

  it('la misma lista de pendientes', () => {
    const esperado = desovesPendientes(FILAS, LOCALES);
    expect(esperado.length).toBeGreaterThan(1);                        // el fixture ejerce algo
    expect(api.madDesPendientes(FILAS, LOCALES)).toEqual(esperado);
    expect(api.madDesPendientes([], LOCALES)).toEqual(desovesPendientes([], LOCALES));
    expect(api.madDesPendientes(FILAS, [])).toEqual(desovesPendientes(FILAS, []));
  });

  it('lo mismo al anotar y al podar', () => {
    const modelo = { fecha: '2026-09-07', desoves: [{ lote: 'bp', codigoGenetico: 'olf5.f2', n5: '9000', despacho: ['Incamar'] }, { lote: '', codigoGenetico: 'Z' }, { lote: 'NU', codigoGenetico: 'EVO', huevos: '10' }] };
    const anotado = anotarDesovesLocales(LOCALES, modelo, 7);
    expect(api.madDesLocalesAnota(LOCALES, modelo, 7)).toEqual(anotado);
    expect(api.madDesLocalesPoda(anotado, FILAS)).toEqual(podarDesovesLocales(anotado, FILAS));
    expect(podarDesovesLocales(anotado, [HOJA({ N5: 1000 })]).length).toBeLessThan(anotado.length);   // el fixture poda algo
  });
});

describe('Desoves · la pestaña sustituyó a la de Lotes', () => {
  const shell = leer(new URL('../shell.html', import.meta.url));
  const src = leer(ENGINE);

  it('el shell declara su panel y el motor lo busca por el mismo id', () => {
    expect(shell).toContain('id="fp-desoves"');
    expect(src).toContain('document.getElementById("fp-desoves")');
    expect(src).toContain('if(t==="desoves") renderMadDesoves();');
  });

  it('🔴 la GRILLA de Lotes ya no existe, ni su rastro', () => {
    /* No basta con quitar la pestaña: mientras la grilla viviera podía seguir escribiendo
       el layout VIEJO encima de la hoja rediseñada y corromperla sin un solo error.
       ⚠ Y al borrarla quedaron dos líneas leyendo `_madLotesSala`, que ya no existía — un
       ReferenceError en código alcanzable. Lo cazó el barrido posterior, no las pruebas,
       porque el monolito no pasa por ESLint ni por vitest. Por eso esto se comprueba. */
    for (const rastro of ['renderMadLotes', '_madLotesSala', 'syncMadLotesGrid', 'MAD_LOTES_MAX_ROWS', 'fp-lotes']) {
      expect(src).not.toContain(rastro);
    }
    expect(shell).not.toContain('fp-lotes');
  });

  it('y las grillas que SÍ siguen vivas no se llevaron nada por delante', () => {
    for (const viva of ['renderMadSalas', 'renderMadTanques', '_collectSalasGrid', '_collectTanquesGrid', 'syncMadSalasGrid', 'syncMadTanquesGrid']) {
      expect(src).toContain(viva);
    }
    expect(src).toContain('const MAD_FICHAS    = ["salas","tanques"];');
  });

  it('no se re-pinta si ya está montado, para no borrar lo tecleado', () => {
    expect(src).toContain('if(fp.querySelector("#md-cards")) return;');
    expect(src).toContain('function madDesVaciar(');
  });

  it('un envío ENCOLADO deja rastro, como en las otras dos fichas', () => {
    expect(src).toContain('function madDesLogAnota(');
    expect(src).toContain('madDesLogAnota(model, payload.rows.length, "cola")');
  });
});
