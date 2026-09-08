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
    + ' MAD_DESOVE_KEY_COLS, MAD_DESOVE_MIL };',
  ).runInContext(ctx);
  return ctx.__api;
}

const api = motorDesoves();

/* Cada modelo ejerce una rama distinta. Ya pasó dos veces el mismo día que un fixture
   incompleto dejaba una regla sin ejercer y la paridad daba verde sin significar nada. */
const MODELOS = {
  'un desove simple': {
    fecha: '2026-09-08',
    desoves: [{ lote: 'BM', codigoGenetico: '766', piscina: 'P-766', desoves: 4, huevos: 9800, nauplios: 6500, noViables: 300, fechaN2: '', n2: '', fechaN5: '', n5: '', observaciones: 'sin novedad' }],
  },
  'un lote con DOS códigos el mismo día': {
    fecha: '2026-09-08',
    desoves: [
      { lote: 'BM', codigoGenetico: '766', piscina: 'P-766', desoves: 4, nauplios: 6500 },
      { lote: 'BM', codigoGenetico: '767', piscina: 'P-767', desoves: 3, nauplios: 4200 },
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
      { lote: 'BM', codigoGenetico: '766', nauplios: 100 },
      { lote: 'bm', codigoGenetico: ' 766 ', nauplios: 200 },
    ],
  },
  'sin llave completa y fechas al revés': {
    fecha: '2026-09-08',
    desoves: [
      { lote: 'BM', codigoGenetico: '', nauplios: 100 },
      { lote: 'BC', codigoGenetico: '801', n2: 10, fechaN2: '2026-09-01', n5: 5, fechaN5: '2026-08-30' },
    ],
  },
  'sin desoves': { fecha: '2026-09-08', desoves: [] },
  'fecha inválida': { fecha: '08/09/2026', desoves: [{ lote: 'BM', codigoGenetico: '766', nauplios: 10 }] },
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
    expect(src).toContain('madDesLogAnota(model.fecha, payload.rows.length, "cola")');
  });
});
