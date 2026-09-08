/* ============================================================
   REGISTROS · ficha "Ingreso a Maduración" — LAS DOS IMPLEMENTACIONES DEBEN COINCIDIR

   La lógica del ingreso existe DOS veces, y no por descuido:
     · `ficha-maduracion-ingreso.schema.js` — módulo ES puro, probado y mutado.
     · el bloque MAD_ING de `public/registros/engine.js` — inline, porque las dos copias
       de Music (`index (8).html` y `Rosario\index.html`) son monolitos autónomos SIN
       módulos ES: allí nada puede importarse.

   La auditoría de este proyecto encontró que **todos** sus defectos vivían en las
   costuras: dos módulos que responden distinto a la misma pregunta. Esta prueba cierra
   esa costura antes de que se abra — extrae el código REAL del monolito, lo ejecuta y
   exige que produzca el MISMO payload y el MISMO veredicto que el módulo.

   🔑 Y cubre a las TRES copias sin leerlas todas: `verificar-3copias-v3.mjs` ya exige que
   engine.js y los dos de Music sean iguales función a función. Encadenando las dos
   comprobaciones, el módulo queda atado a los tres destinos.

   ⚠ Si alguien toca una de las dos y no la otra, esto se pone rojo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import {
  MAD_INGRESO_SHEET,
  MAD_INGRESO_HEADERS,
  MAD_SALA_OPTS,
  MAD_TANQUES_POR_SALA,
  AGUA_OPTS,
  buildIngresoPayload,
  buildIngresoRows,
  validarIngreso,
  ingresoRowId,
  repartirParejo,
} from './ficha-maduracion-ingreso.schema.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

/** Carga el bloque MAD_ING del monolito en un contexto aislado y devuelve sus piezas.
 *
 *  ⚠ El ancla de FIN cierra en la ÚLTIMA sentencia de `madIngValidar`, no en la primera
 *  línea de lo que viene después: anclar en el vecino convierte cualquier cambio del
 *  vecino en una avería de este instrumento, y de paso tapa lo que el instrumento medía.
 */
function motorIngreso() {
  const code = bloque(
    leer(ENGINE),
    'const MAD_ING_SHEET = "Maduración Ingreso";',
    '  return { errores: errores, avisos: avisos };\n}',
  );
  // Sólo hace falta lo que se EJECUTA. `MAD_TANQUES_POR_SALA` se inyecta desde el MÓDULO
  // a propósito: si el monolito y el módulo declararan tablas distintas, la validación de
  // «el tanque no es de esa sala» diría cosas distintas en cada sitio y esta prueba no lo
  // vería. Que la tabla del monolito coincide con la del módulo se comprueba aparte.
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite,
    sanitizeStr,
    MAD_TANQUES_POR_SALA,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    code + '\n;globalThis.__api = { buildMadIngresoPayload, madIngBuildRows, madIngValidar,'
    + ' madIngRowId, madIngRepartirParejo, MAD_ING_HEADERS, MAD_ING_SHEET, MAD_ING_AGUA_OPTS,'
    + ' MAD_ING_COLUMNS };',
  ).runInContext(ctx);
  return ctx.__api;
}

const api = motorIngreso();

/* Modelos de prueba. Cada uno ejerce una rama distinta del payload o del veredicto: un
   fixture único no distinguiría una implementación correcta de una que se dejó un caso. */
const MODELOS = {
  'simple, un tanque': {
    fecha: '2026-09-08',
    lote: 'AB',
    composiciones: [{
      codigoGenetico: 'CG01', piscina: 'P-12', camaronera: 'Camaronera Norte',
      machos: 150, hembras: 300, pesoMachos: 34.5, pesoHembras: 41.2,
      supervivencia: 78.4, camaronesM2: 12, densidad: 9.5,
      reparto: [{ sala: 'Sala 1', tanque: 1, machos: 150, hembras: 300, agua: 'RAS' }],
    }],
  },
  'reparto en varias salas': {
    fecha: '2026-09-08',
    lote: 'bd',
    composiciones: [{
      codigoGenetico: 'cg 07', piscina: 'P-3', camaronera: 'Sur',
      machos: 90, hembras: 120,
      reparto: [
        { sala: 'Sala 1', tanque: 5, machos: 30, hembras: 40, agua: 'RAS' },
        { sala: 'Sala 3', tanque: 22, machos: 30, hembras: 40, agua: 'Agua de playa' },
        { sala: 'Sala 5', tanque: 7, machos: 30, hembras: 40, agua: 'RAS' },
      ],
    }],
  },
  'tanque MEZCLADO, dos composiciones': {
    fecha: '2026-09-08',
    lote: 'BC',
    composiciones: [
      { codigoGenetico: 'CG01', piscina: 'P-1', machos: 10, hembras: 20,
        reparto: [{ sala: 'Sala 2', tanque: 16, machos: 10, hembras: 20, agua: 'RAS' }] },
      { codigoGenetico: 'CG02', piscina: 'P-2', machos: 5, hembras: 8,
        reparto: [{ sala: 'Sala 2', tanque: 16, machos: 5, hembras: 8, agua: 'RAS' }] },
    ],
  },
  'con descuadre y tanque ajeno': {
    fecha: '2026-09-08',
    lote: 'BF',
    composiciones: [{
      codigoGenetico: 'CG09', piscina: '', machos: 400, hembras: 500,
      reparto: [{ sala: 'Sala 1', tanque: 22, machos: 300, hembras: 500, agua: 'RAS' }],
    }],
  },
  'con duplicado que borraría datos': {
    fecha: '2026-09-08',
    lote: 'BG',
    composiciones: [{
      codigoGenetico: 'CG11', piscina: 'P-8', machos: 10, hembras: 10,
      reparto: [
        { sala: 'Sala 4', tanque: 3, machos: 5, hembras: 5, agua: 'RAS' },
        { sala: 'Sala 4', tanque: 3, machos: 5, hembras: 5, agua: 'RAS' },
      ],
    }],
  },
  'vacío': { fecha: '2026-09-08', lote: '', composiciones: [] },
  'valores basura': {
    fecha: '2026-09-08',
    lote: ' ap ',
    composiciones: [{
      codigoGenetico: 'CG13', piscina: 'P-9', machos: 'x', hembras: -3,
      reparto: [
        { sala: 'Sala 1', tanque: 2, machos: -5, hembras: 'muchas', agua: 'RAS' },
        { sala: '', tanque: 9, machos: 1, hembras: 1, agua: 'RAS' },
      ],
    }],
  },
};

describe('Ingreso · el monolito y el módulo declaran lo mismo', () => {
  it('la misma hoja destino', () => {
    expect(api.MAD_ING_SHEET).toBe(MAD_INGRESO_SHEET);
  });

  it('las mismas cabeceras, en el mismo orden', () => {
    expect(api.MAD_ING_HEADERS).toEqual(MAD_INGRESO_HEADERS);
  });

  it('las mismas claves de columna, en el mismo orden', () => {
    // Si el orden de `k` divergiera, las cabeceras podrían coincidir y las CELDAS no.
    expect(api.MAD_ING_COLUMNS.map((c) => c.k)).toEqual(
      ['fecha', 'lote', 'codigoGenetico', 'piscina', 'camaronera', 'sala', 'tanque',
        'machos', 'hembras', 'pesoMachos', 'pesoHembras', 'supervivencia', 'camaronesM2',
        'densidad', 'agua', 'id'],
    );
  });

  it('las mismas opciones de agua', () => {
    expect(api.MAD_ING_AGUA_OPTS).toEqual(AGUA_OPTS);
  });
});

describe('Ingreso · el mismo payload, celda a celda', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('coincide con «' + nombre + '»', () => {
      expect(api.buildMadIngresoPayload(model)).toEqual(buildIngresoPayload(model));
    });
  }

  it('y las filas no están vacías donde no deben (el fixture prueba algo)', () => {
    // Una comparación de dos vacíos pasa siempre. Esto exige que el caso principal
    // produzca filas de verdad, para que el toEqual de arriba signifique algo.
    expect(buildIngresoRows(MODELOS['reparto en varias salas'])).toHaveLength(3);
    expect(buildIngresoRows(MODELOS['tanque MEZCLADO, dos composiciones'])).toHaveLength(2);
  });
});

describe('Ingreso · el mismo veredicto', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('valida igual «' + nombre + '»', () => {
      expect(api.madIngValidar(model)).toEqual(validarIngreso(model));
    });
  }

  it('y alguno de los fixtures produce errores Y avisos de verdad', () => {
    // Si todos los modelos validaran limpio, comparar dos {errores:[],avisos:[]} no
    // distinguiría nada. Es la trampa que este proyecto llama «fixture que no prueba nada».
    expect(validarIngreso(MODELOS['con duplicado que borraría datos']).errores.length).toBeGreaterThan(0);
    expect(validarIngreso(MODELOS['con descuadre y tanque ajeno']).avisos.length).toBeGreaterThan(0);
  });
});

describe('Ingreso · las mismas funciones puras', () => {
  it('la misma llave de fila, normalización incluida', () => {
    const casos = [
      ['AB', 'CG01', 'Sala 1', 1],
      [' ab ', 'cg01', 'Sala 1', 1],
      ['BD', 'CG 07', 'Sala 5', 11],
      ['BC', 'CG02', 'Sala 4', 3],
    ];
    for (const c of casos) expect(api.madIngRowId(...c)).toBe(ingresoRowId(...c));
  });

  it('el mismo reparto parejo', () => {
    for (const [t, n] of [[10, 3], [9, 3], [1, 3], [0, 4], [999, 13], [10, 0], [-1, 3]]) {
      expect(api.madIngRepartirParejo(t, n)).toEqual(repartirParejo(t, n));
    }
  });
});

describe('Ingreso · el catálogo de salas del monolito', () => {
  /* No se compara contra el bloque extraído porque `MAD_SALA_OPTS` vive fuera de él —al
     principio del motor, junto al resto de constantes de Maduración—. Se lee del fuente. */
  const src = leer(ENGINE);

  it('el monolito ya NO ofrece Sala 4A ni 4B', () => {
    expect(src).toContain('const MAD_SALA_OPTS = ["Sala 1","Sala 2","Sala 3","Sala 4","Sala 5"];');
    expect(src).not.toContain('"Sala 4A": Array.from');
    expect(src).not.toContain('"Sala 4B": Array.from');
  });

  it('y ofrece las mismas salas que el módulo', () => {
    const m = src.match(/const MAD_SALA_OPTS = \[([^\]]*)\];/);
    const salas = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(salas).toEqual(MAD_SALA_OPTS);
  });

  it('la ficha de Ingreso es la PRIMERA pestaña de Maduración', () => {
    /* ⚠ Se comprueba la POSICIÓN, no el array literal. La primera versión fijaba la lista
       entera y se puso roja el mismo día, al añadir la pestaña «saldo» de la Fase 2 — sin
       que nada de lo que decía vigilar hubiera cambiado. Una prueba sobre-especificada se
       rompe con cambios legítimos, y el rojo que no significa nada es el que esconde el
       rojo siguiente. Lo que importa es que el ingreso vaya primero: es la ficha que da de
       alta el lote, y sin ella las demás no saben de qué tanque hablan. */
    const m = src.match(/const MAD_TABS\s+= \[([^\]]*)\];/);
    const tabs = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(tabs[0]).toBe('ingreso');
  });

  it('el ingreso NO entra en MAD_FICHAS: no es una grilla con CRUD local', () => {
    expect(src).toContain('const MAD_FICHAS    = ["salas","tanques","lotes"];');
  });
});

describe('Ingreso · la pestaña tiene DÓNDE pintarse', () => {
  /* ⚠⚠ ESTA COMPROBACIÓN NACIÓ DE UN FALLO REAL, el mismo día. Los paneles `fp-*` son
     HTML ESTÁTICO del shell: `buildTabs()` crea el BOTÓN, no el contenedor. Sin el div,
     la ficha se añadía a `MAD_TABS`, la pestaña aparecía, y `renderMadIngreso()` salía por
     su primera línea sin pintar nada — una ficha invisible, sin un solo error en consola.
     🔑 La regla: el sitio de una comprobación es donde algo pueda demostrar que sirve. La
     lógica ya estaba probada al 100 % y no habría cazado esto, porque el hueco no estaba
     en la lógica sino en la costura entre la pestaña y su contenedor. */
  const shell = leer(new URL('../shell.html', import.meta.url));
  const src = leer(ENGINE);

  it('el shell declara el panel fp-ingreso', () => {
    expect(shell).toContain('<div class="fp" id="fp-ingreso"></div>');
  });

  it('y hay un panel para CADA pestaña de Maduración', () => {
    const m = src.match(/const MAD_TABS\s+= \[([^\]]*)\];/);
    const tabs = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    const sinPanel = tabs.filter((t) => !shell.includes('id="fp-' + t + '"'));
    expect(sinPanel).toEqual([]);
  });

  it('el motor busca ese panel por el mismo id que el shell declara', () => {
    // Si alguien renombrara uno de los dos, esto se pone rojo antes que el usuario.
    expect(src).toContain('document.getElementById("fp-ingreso")');
  });
});
