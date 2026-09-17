/* ============================================================
   PARIDAD · Fin de Ciclo de Maduración (Fase 4B)

   La lógica vive DOS VECES: en `ficha-maduracion-fin-ciclo.schema.js` y como bloque inline
   en `engine.js`. Esta prueba extrae el bloque REAL del monolito, lo ejecuta aislado y
   exige el mismo payload y el mismo veredicto.

   ⚠ Se traen TRES bloques: el de Fin de Ciclo usa `madIngInt` (del de Ingreso) y
   `madDesNormLote` (del de Desoves). Inyectarlos desde los módulos habría sido más cómodo
   y habría tapado justo lo que esta prueba mide.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import { MAD_TANQUES_POR_SALA } from './ficha-maduracion-ingreso.schema.js';
import {
  MAD_FIN_SHEET,
  MAD_FIN_HEADERS,
  MAD_FIN_COLUMNS,
  MAD_FIN_TIPOS,
  MAD_FIN_MOTIVOS,
  motivoTag,
  finRowId,
  buildFinRows,
  buildFinPayload,
  validarFinCiclo,
} from './ficha-maduracion-fin-ciclo.schema.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

function motorFin() {
  const src = leer(ENGINE);
  const fin = '  return { errores: errores, avisos: avisos };\n}';
  const ing = bloque(src, 'const MAD_ING_SHEET = "Maduración Ingreso";', fin);
  const des = bloque(src, 'const MAD_DESOVE_SHEET = "Maduración Lotes";', fin);
  const cie = bloque(src, 'const MAD_FIN_SHEET = "Maduración Fin de Ciclo";', fin);
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite,
    sanitizeStr, MAD_TANQUES_POR_SALA,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    ing + '\n' + des + '\n' + cie
    + '\n;globalThis.__api = { buildMadFinPayload, madFinBuildRows, madFinValidar,'
    + ' madFinRowId, madFinMotivoTag, MAD_FIN_HEADERS, MAD_FIN_SHEET, MAD_FIN_COLUMNS,'
    + ' MAD_FIN_TIPOS, MAD_FIN_MOTIVOS };',
  ).runInContext(ctx);
  return ctx.__api;
}

const api = motorFin();

/* Cada modelo ejerce una rama distinta. Ya pasó tres veces en este módulo que un fixture
   incompleto dejaba una regla sin ejercer y la paridad daba verde sin significar nada. */
const MODELOS = {
  /* ⚠ La dosis lleva DECIMALES a propósito. Con un entero, una implementación que redondeara
     daría el mismo resultado y la paridad estaría verde sin significar nada: la divergencia
     «el monolito redondea la dosis» SE LE ESCAPABA hasta que este fixture cambió. Lo cazó el
     banco, no la lectura. */
  'un pedido parcial': {
    fecha: '2026-09-08',
    cierres: [{ lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', metabisulfito: 12.75, fechaMetabisulfito: '2026-09-10', machos: 40, hembras: 60, observaciones: 'camión 2' }],
  },
  'un cierre TOTAL, que anota la diferencia': {
    fecha: '2026-09-08',
    cierres: [{ lote: 'AB', tipo: 'Total', motivo: 'Fin de vida útil', machos: 100, hembras: 80 }],
  },
  'mismo lote, dos motivos el mismo día': {
    fecha: '2026-09-08',
    cierres: [
      { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', machos: 10, hembras: 10 },
      { lote: 'AB', tipo: 'Parcial', motivo: 'Descarte parcial', machos: 5, hembras: 5 },
    ],
  },
  'duplicado: mismo lote y motivo dos veces': {
    fecha: '2026-09-08',
    cierres: [
      { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', machos: 10, hembras: 0 },
      { lote: 'ab', tipo: 'Parcial', motivo: 'Pedido', machos: 7, hembras: 0 },
    ],
  },
  'parcial sin animales (error) y total sin animales (aviso)': {
    fecha: '2026-09-08',
    cierres: [
      { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', machos: 0, hembras: 0 },
      { lote: 'BC', tipo: 'Total', motivo: 'Descarte sanitario', machos: 0, hembras: 0 },
    ],
  },
  'sin llave completa y tipo desconocido': {
    fecha: '2026-09-08',
    cierres: [
      { lote: 'AB', tipo: 'Definitivo', motivo: 'Otro', machos: 3, hembras: 3 },
      { lote: 'BC', tipo: 'Total', motivo: '', machos: 5, hembras: 5 },
      { lote: '', tipo: 'Total', motivo: 'Pedido', machos: 5, hembras: 5 },
    ],
  },
  /* ⚠ Era «un pedido SIN destino». El usuario retiró esa columna el 2026-09-08 —ningún
     reproductor vuelve a camaronera— y el aviso que este fixture ejercía se fue con ella.
     Se sustituye por el que ocupó su sitio: media pareja de metabisulfito.
     2026-09-16 (PE1.6): la dosis sin fecha ya no avisa, toma la del registro; el aviso lo ejerce ahora una fecha
     DISTINTA de la del registro sin dosis, y la de salida (la del registro) sin dosis no debe avisar ni escribirse. */
  'metabisulfito con dosis y SIN fecha (toma la del registro)': {
    fecha: '2026-09-08',
    cierres: [{ lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', metabisulfito: 8, fechaMetabisulfito: '', machos: 12, hembras: 12 }],
  },
  'fecha de aplicación DISTINTA y sin dosis (aviso)': {
    fecha: '2026-09-08',
    cierres: [{ lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', metabisulfito: '', fechaMetabisulfito: '2026-09-10', machos: 12, hembras: 12 }],
  },
  'la fecha de salida (la del registro) sin dosis': {
    fecha: '2026-09-08',
    cierres: [{ lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', metabisulfito: '', fechaMetabisulfito: '2026-09-08', machos: 12, hembras: 12 }],
  },
  'sin cierres': { fecha: '2026-09-08', cierres: [] },
  'fecha inválida': { fecha: '8-9-2026', cierres: [{ lote: 'AB', tipo: 'Total', motivo: 'Pedido', machos: 1, hembras: 1 }] },
  /* D14 + pesos (2026-09-14): la sala en llave y fila, el Total que la ignora, la duplicada POR sala,
     la sala desconocida, y los cuatro pesos del registro con decimales, uno inválido y uno sin sexo. */
  'D14: salas, Total con sala y duplicado en la misma sala': {
    fecha: '2026-09-08',
    cierres: [
      { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', sala: 'Sala 1', machos: 10, hembras: 0 },
      { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', sala: 'Sala 2', machos: 4, hembras: 0 },
      { lote: 'ab', tipo: 'Parcial', motivo: 'Pedido', sala: 'Sala 2', machos: 1, hembras: 0 },
      { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', machos: 2, hembras: 0 },
      { lote: 'BC', tipo: 'Total', motivo: 'Fin de vida útil', sala: 'Sala 3', machos: 5, hembras: 5 },
      { lote: 'CD', tipo: 'Parcial', motivo: 'Otro', sala: 'Sala 9', machos: 1, hembras: 1 },
    ],
  },
  'rojos y pesos por lote, peso total: decimales, inválido, sexo que no sale y rojos de más': {
    fecha: '2026-09-08',
    pesoTotal: '12.75', registro: ' R-MFJ3K2QX7A ',
    cierres: [
      { lote: 'AB', tipo: 'Parcial', motivo: 'Pedido', machos: 10, hembras: 0, rojos: 11, pesoPromMachos: '45.25', pesoPromHembras: 'sesenta' },
      { lote: 'BC', tipo: 'Parcial', motivo: 'Pedido', machos: 3, hembras: 0, rojos: '2', pesoPromHembras: 50 },
    ],
  },
  'peso total inválido': { fecha: '2026-09-08', pesoTotal: 'x', cierres: [{ lote: 'AB', tipo: 'Total', motivo: 'Pedido' }] },
};

describe('Fin de Ciclo · el monolito y el módulo declaran lo mismo', () => {
  it('la misma hoja', () => {
    expect(api.MAD_FIN_SHEET).toBe(MAD_FIN_SHEET);
  });

  it('las mismas cabeceras y el ID el ÚLTIMO', () => {
    expect(api.MAD_FIN_HEADERS).toEqual(MAD_FIN_HEADERS);
    expect(api.MAD_FIN_HEADERS[api.MAD_FIN_HEADERS.length - 1]).toBe('ID');
  });

  it('las mismas claves de columna, en el mismo orden', () => {
    expect(api.MAD_FIN_COLUMNS.map((c) => c.k)).toEqual(MAD_FIN_COLUMNS.map((c) => c.k));
  });

  it('los mismos tipos y motivos', () => {
    expect(api.MAD_FIN_TIPOS).toEqual(MAD_FIN_TIPOS);
    expect(api.MAD_FIN_MOTIVOS).toEqual(MAD_FIN_MOTIVOS);
  });
});

describe('Fin de Ciclo · el mismo payload, celda a celda', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('coincide con «' + nombre + '»', () => {
      expect(api.buildMadFinPayload(model)).toEqual(buildFinPayload(model));
    });
  }

  it('y los fixtures escriben filas DE VERDAD', () => {
    expect(buildFinRows(MODELOS['mismo lote, dos motivos el mismo día'])).toHaveLength(2);
    expect(buildFinRows(MODELOS['sin llave completa y tipo desconocido'])).toHaveLength(1);
  });
});

describe('Fin de Ciclo · la misma llave', () => {
  it('mismo ID, y el motivo lo distingue', () => {
    const casos = [
      ['2026-09-08', 'AB', 'Pedido'],
      ['2026-09-08', ' ab ', 'Descarte parcial'],
      ['2026-12-31', 'BM', 'Fin de vida útil'],
      ['2026-09-08', 'AB', 'Pedido', 'Sala 2'],
      ['2026-09-08', 'AB', 'Pedido', ''],
    ];
    for (const c of casos) expect(api.madFinRowId(...c)).toBe(finRowId(...c));
    for (const m of MAD_FIN_MOTIVOS) expect(api.madFinMotivoTag(m)).toBe(motivoTag(m));
  });
});

describe('Fin de Ciclo · el mismo veredicto', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('mismo veredicto con «' + nombre + '»', () => {
      expect(api.madFinValidar(model)).toEqual(validarFinCiclo(model));
    });
  }

  it('y los fixtures producen errores y avisos DE VERDAD', () => {
    expect(validarFinCiclo(MODELOS['duplicado: mismo lote y motivo dos veces']).errores.length).toBeGreaterThan(0);
    expect(validarFinCiclo(MODELOS['parcial sin animales (error) y total sin animales (aviso)']).errores.length).toBeGreaterThan(0);
    expect(validarFinCiclo(MODELOS['parcial sin animales (error) y total sin animales (aviso)']).avisos.length).toBeGreaterThan(0);
    expect(validarFinCiclo(MODELOS['fecha de aplicación DISTINTA y sin dosis (aviso)']).avisos.length).toBeGreaterThan(0);
    // PE1.6 · y los dos casos de la fecha por defecto dan lo que tienen que dar, o la paridad compararía dos vacíos.
    const fechaApl = (nombre) => buildFinRows(MODELOS[nombre])[0][MAD_FIN_HEADERS.indexOf('Fecha aplicación')];
    expect(fechaApl('metabisulfito con dosis y SIN fecha (toma la del registro)')).toBe('2026-09-08');
    expect(fechaApl('la fecha de salida (la del registro) sin dosis')).toBe('');
    expect(validarFinCiclo(MODELOS['la fecha de salida (la del registro) sin dosis']).avisos).toEqual([]);
    expect(validarFinCiclo(MODELOS['sin llave completa y tipo desconocido']).avisos.length).toBeGreaterThan(0);
    // Y el caso que SÍ tiene que pasar: dos motivos distintos el mismo día conviven.
    expect(validarFinCiclo(MODELOS['mismo lote, dos motivos el mismo día']).errores).toEqual([]);
    const d14 = validarFinCiclo(MODELOS['D14: salas, Total con sala y duplicado en la misma sala']);
    expect(d14.errores).toHaveLength(2);   // el duplicado en Sala 2 y el Total con sala
    expect(d14.avisos).toHaveLength(1);    // Sala 9
    expect(buildFinRows(MODELOS['D14: salas, Total con sala y duplicado en la misma sala']).map((f) => f[f.length - 1]))
      .toEqual(['2026-09-08-AB-PEDIDO-S1', '2026-09-08-AB-PEDIDO-S2', '2026-09-08-AB-PEDIDO-S2', '2026-09-08-AB-PEDIDO', '2026-09-08-BC-FINDEVIDAÚTIL', '2026-09-08-CD-OTRO-S9']);
    expect(validarFinCiclo(MODELOS['rojos y pesos por lote, peso total: decimales, inválido, sexo que no sale y rojos de más']).avisos).toHaveLength(3);
    expect(validarFinCiclo(MODELOS['peso total inválido']).avisos).toContain('El peso total no es una cifra válida y no se guardará.');
  });
});

describe('Fin de Ciclo · la ficha tiene DÓNDE pintarse', () => {
  const shell = leer(new URL('../shell.html', import.meta.url));
  const src = leer(ENGINE);

  it('el shell declara su panel y el motor lo busca por el mismo id', () => {
    expect(shell).toContain('id="fp-fin"');
    expect(src).toContain('document.getElementById("fp-fin")');
    expect(src).toContain('if(t==="fin") renderMadFinCiclo();');
    expect(src).toContain('fin:      ["🏁","Fin de Ciclo"]');
  });

  it('cada pestaña de Maduración sigue teniendo su panel', () => {
    /* El defecto A1 de la Fase 1: `buildTabs` crea el BOTÓN, no el contenedor. Sin el div,
       la pestaña aparece y el render sale por su primera línea sin pintar nada. */
    const m = src.match(/const MAD_TABS\s+= \[([^\]]*)\];/);
    const tabs = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(tabs.filter((t) => !shell.includes('id="fp-' + t + '"'))).toEqual([]);
  });

  it('no se re-pinta si ya está montado, y avisa de qué hace un cierre Total', () => {
    expect(src).toContain('if(fp.querySelector("#mf-cards")) return;');
    expect(src).toContain('function madFinTipoChange(');
    // La diferencia entre Total y Parcial no es evidente leyendo dos palabras: se dice.
    expect(src).toContain('se anotará como <b>diferencia</b>');
  });

  it('un envío ENCOLADO deja rastro, como en las otras tres fichas', () => {
    expect(src).toContain('function madFinLogAnota(');
    expect(src).toContain('madFinLogAnota(model.fecha, payload.rows.length, "cola", _envio)');
  });

  it('🔴 el DESTINO sale de DESTINO_OPTS, no de una copia', () => {
    // Las camaroneras ya viven en un sitio; una segunda lista se desincroniza.
    expect(src).toContain('madIngCamaroneraOpts("")+\'</select></label>\'');
  });
});
