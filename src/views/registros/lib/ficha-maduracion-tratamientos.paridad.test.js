/* PARIDAD · Tratamientos de Maduración (2026-09-15). La lógica vive en el módulo y como bloque inline en
   engine.js (los monolitos de Music no tienen módulos): se extrae el bloque REAL y se exige lo mismo. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';
import {
  MAD_TRAT_SHEET, MAD_TRAT_HEADERS, MAD_TRAT_COLUMNS, MAD_TRAT_ESTADOS, MAD_TRAT_PREVENTIVOS, MAD_TRAT_RAS, MAD_TRAT_DESINFECTANTES, MAD_TRAT_AREAS,
  plantillaTrat, productosDeArea, productosDe, lotesDe, tratIdPreventivo, tratIdDesinfeccion, buildTratPayload, validarTrat,
} from './ficha-maduracion-tratamientos.schema.js';

const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');
const src = leer(new URL('../../../../public/registros/engine.js', import.meta.url));
const shell = leer(new URL('../shell.html', import.meta.url));

function bloque(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

function motor() {
  const fin = '  return { errores: errores, avisos: avisos };\n}';
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite, sanitizeStr, MAD_TANQUES_POR_SALA };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    bloque('const MAD_ING_SHEET = "Maduración Ingreso";', fin) + '\n'
    + bloque('const MAD_DESOVE_SHEET = "Maduración Lotes";', fin) + '\n'
    + bloque('const MAD_TRAT_SHEET = "Maduración Tratamientos";', fin)
    + '\n;globalThis.__api = { MAD_TRAT_SHEET, MAD_TRAT_HEADERS, MAD_TRAT_COLUMNS, MAD_TRAT_ESTADOS, MAD_TRAT_PREVENTIVOS, MAD_TRAT_RAS,'
    + ' MAD_TRAT_DESINFECTANTES, MAD_TRAT_AREAS, madTratPlantilla, madTratProductosArea, madTratProductos, madTratLotes,'
    + ' madTratIdPreventivo, madTratIdDesinfeccion, buildMadTratPayload, madTratValidar };',
  ).runInContext(ctx);
  return ctx.__api;
}
const api = motor();

const MODELOS = {
  'base': { fecha: '2026-09-15', sala: 'Sala 4', estado: 'Producción',
    preventivos: [{ lotes: 'bp, BC', productos: ['Vitamina C', 'Bacmil', 'X'], ras: 'em-1, Bicarbonato', dosis: 'Bacmil 2 g/L' }],
    desinfecciones: [{ area: 'RAS y tuberías', productos: ['Cloro'], dosis: 'neutralizado' }] },
  'a medias, duplicados y sin sala': { fecha: '15/09/2026', sala: '', estado: 'Raro',
    preventivos: [{ lotes: 'BP', productos: [] }, { lotes: '', productos: ['Bacmil'] }, { lotes: 'A,B', ras: ['EM-1'] }, { lotes: 'b, a', productos: ['Formol'] }, {}],
    desinfecciones: [{ area: '', productos: ['Formol'] }, { area: 'Inventada', productos: ['Formol'] }, { area: 'Salas y tanques', productos: ['Virkon'] },
      { area: 'Desove, Eclosión y Despacho', productos: 'cloro' }, { area: 'Desove, Eclosión y Despacho', productos: ['Formol'] }, null] },
  'vacío': { fecha: '2026-09-15', preventivos: [], desinfecciones: [] },
  'sala desconocida': { fecha: '2026-09-15', sala: 'Sala 9', desinfecciones: [{ area: 'Conos, baldes, tinas y tuberías', productos: ['Jabón neutro'] }] },
};

describe('Tratamientos · el monolito y el módulo dicen lo mismo', () => {
  it('la misma hoja, columnas, estados, catálogos y áreas', () => {
    expect(api.MAD_TRAT_SHEET).toBe(MAD_TRAT_SHEET);
    expect(api.MAD_TRAT_HEADERS).toEqual(MAD_TRAT_HEADERS);
    expect(api.MAD_TRAT_COLUMNS.map((c) => c.k)).toEqual(MAD_TRAT_COLUMNS.map((c) => c.k));
    expect([api.MAD_TRAT_ESTADOS, api.MAD_TRAT_PREVENTIVOS, api.MAD_TRAT_RAS, api.MAD_TRAT_DESINFECTANTES, api.MAD_TRAT_AREAS])
      .toEqual([MAD_TRAT_ESTADOS, MAD_TRAT_PREVENTIVOS, MAD_TRAT_RAS, MAD_TRAT_DESINFECTANTES, MAD_TRAT_AREAS]);
  });

  it('las mismas plantillas y lo habitual de cada área', () => {
    for (const e of MAD_TRAT_ESTADOS.concat(['', 'constructor'])) expect(api.madTratPlantilla(e), e).toEqual(plantillaTrat(e));
    for (const a of MAD_TRAT_AREAS.concat(['', 'toString'])) expect(api.madTratProductosArea(a), a).toEqual(productosDeArea(a));
  });

  it('los mismos productos, lotes e IDs', () => {
    for (const v of [['Vitamina C', 'bacmil', 'X'], 'formol, Cloro', '', null]) {
      expect(api.madTratProductos(MAD_TRAT_DESINFECTANTES, v)).toEqual(productosDe(MAD_TRAT_DESINFECTANTES, v));
      expect(api.madTratLotes(v)).toEqual(lotesDe(v));
    }
    expect(api.madTratIdPreventivo('2026-09-15', 'Sala 4', 'bp, BC')).toBe(tratIdPreventivo('2026-09-15', 'Sala 4', 'bp, BC'));
    for (const a of MAD_TRAT_AREAS.concat(['Otra'])) expect(api.madTratIdDesinfeccion('2026-09-15', '', a)).toBe(tratIdDesinfeccion('2026-09-15', '', a));
  });

  for (const [nombre, m] of Object.entries(MODELOS)) {
    it('el mismo payload y el mismo veredicto con «' + nombre + '»', () => {
      expect(api.buildMadTratPayload(m)).toEqual(buildTratPayload(m));
      expect(api.madTratValidar(m)).toEqual(validarTrat(m));
    });
  }

  it('y los fixtures ejercen algo', () => {
    expect(buildTratPayload(MODELOS.base).rows).toHaveLength(2);
    expect(validarTrat(MODELOS['a medias, duplicados y sin sala']).errores.length).toBeGreaterThan(5);
  });
});

describe('Tratamientos · la pestaña', () => {
  it('panel en el shell, pestaña, rótulo, render y protección contra el GAS viejo', () => {
    expect(shell).toContain('id="fp-tratamientos"');
    expect(src).toMatch(/const MAD_TABS\s+= \[[^\]]*"fin","tratamientos"/);
    expect(src).toContain('tratamientos: ["🧪","Tratamientos"]');
    expect(src).toContain('if(t==="tratamientos") renderMadTratamientos();');
    expect(src).toContain('if(fp.querySelector("#mt-prevs")) return;');
    expect(src).toMatch(/function _madHojaPideGasNuevo\(hoja\)\{[^}]*hoja === MAD_TRAT_SHEET/);
  });
});
