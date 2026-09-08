/* ============================================================
   MADURACIÓN · el LIBRO MAYOR — LAS DOS IMPLEMENTACIONES DEBEN COINCIDIR

   El libro existe DOS veces, y no por descuido:
     · `mad-libro.js` — módulo ES puro, probado y mutado (12 mutaciones).
     · el bloque MAD_LIBRO de `public/registros/engine.js` — inline, porque las dos
       copias de Music son monolitos autónomos SIN módulos ES.

   Es el único módulo del proyecto que CALCULA, y lo que calcula es el número que la
   gente se va a creer. Dos versiones que repartan distinto darían las dos cifras
   plausibles y sólo una correcta, sin un solo error en pantalla. Esta prueba extrae el
   código REAL del monolito, lo ejecuta y exige el MISMO saldo y los MISMOS avisos.

   🔑 Encadenado con `verificar-3copias-v3.mjs` —que exige que engine.js y los dos de
   Music sean iguales función a función— el módulo queda atado a los tres destinos.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import {
  construirLibro,
  estadoDeSala,
  nombreComposicion,
  sumarDias,
  repartirProporcional,
  estadoDeLote,
  CUARENTENA_DIAS,
  ESTADO_MIXTO,
} from './mad-libro.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

/** Carga el bloque del libro y devuelve sus piezas.
 *
 *  ⚠ El ancla de FIN cierra en la última sentencia de `madNombreComposicion`, no en la
 *  primera línea de lo que viene detrás: anclar en el vecino convierte cualquier cambio
 *  del vecino en una avería de este instrumento, y de paso tapa lo que medía. */
function motorLibro() {
  const code = bloque(
    leer(ENGINE),
    'const MAD_CUARENTENA_DIAS = 15;',
    '  return lotes.sort().join("+");\n}',
  );
  const ctx = { String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    code + '\n;globalThis.__api = { madConstruirLibro, madEstadoDeSala, madNombreComposicion,'
    + ' madSumarDias, madRepartirProporcional, madEstadoDeLote, MAD_CUARENTENA_DIAS, MAD_EST_MIXTO,'
    + ' MAD_LIBRO_SHEETS };',
  ).runInContext(ctx);
  return ctx.__api;
}

const api = motorLibro();
/* En ámbito de módulo y no dentro de un describe: declararlo por bloque ya se me olvidó
   dos veces hoy, y el rojo que sale («src is not defined») no señala la regla que falla
   sino el descuido de quien escribió la prueba. */
const src = leer(ENGINE);

/* El módulo usa Map (más expresivo dentro de src/) y el monolito objetos planos (más
   seguro en un script clásico de 18.000 líneas). Se normalizan las DOS formas a la misma
   antes de comparar: la diferencia de estructura es de estilo, la de CONTENIDO no. */
const plano = (libro) => ({
  posiciones: libro.posiciones,
  tanques: libro.tanques instanceof Map ? Object.fromEntries(libro.tanques) : libro.tanques,
  lotes: libro.lotes instanceof Map ? Object.fromEntries(libro.lotes) : libro.lotes,
  avisos: libro.avisos,
  hasta: libro.hasta,
});

const ing = (Fecha, Lote, cg, Sala, Tanque, Machos, Hembras) => ({
  Fecha, Lote, 'Código genético': cg, Sala, Tanque, Machos, Hembras,
});
const tq = (Fecha, Sala, Tanque, extra = {}) => Object.assign({
  Fecha, Sala, Tanque,
  'Machos muertos': 0, 'Hembras muertas': 0,
  'Machos muertos por descarte de selección': 0,
  'Hembras muertas por descarte de selección': 0,
  'Cópulas': 0,
}, extra);

/* Cada escenario ejerce una rama distinta. Un fixture único no distinguiría una
   implementación correcta de una que se dejó un caso — y aquí «dejarse un caso» es
   exactamente lo que produce cifras plausibles y falsas. */
const ESCENARIOS = {
  'ingreso simple': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 200)],
    tanques: [],
  },
  'mortalidad y descarte': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 200)],
    tanques: [tq('2026-01-02', 'Sala 1', 1, {
      'Machos muertos': 5, 'Machos muertos por descarte de selección': 3,
      'Hembras muertas': 10, 'Hembras muertas por descarte de selección': 2,
    })],
  },
  'tanque mezclado, reparto al saldo vivo': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 1', 1, 100, 0),
      ing('2026-01-03', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
    ],
    tanques: [
      tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 100 }),
      tq('2026-01-04', 'Sala 1', 1, { 'Machos muertos': 40 }),
    ],
  },
  'baja anterior al ingreso de otro lote': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
      ing('2026-01-03', 'BC', 'CG2', 'Sala 1', 1, 100, 0),
    ],
    tanques: [
      tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 50 }),
      tq('2026-01-04', 'Sala 1', 1, { 'Machos muertos': 60 }),
    ],
  },
  'déficit: más bajas que vivos': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 0)],
    tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 15 })],
  },
  'bajas sin ingreso que las explique': {
    ingresos: [],
    tanques: [tq('2026-01-02', 'Sala 2', 16, { 'Hembras muertas': 3 })],
  },
  'cópula que rompe la cuarentena': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10)],
    tanques: [tq('2026-01-04', 'Sala 1', 1, { 'Cópulas': 2 })],
  },
  'dos lotes, un tanque cada uno': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 10, 10),
      ing('2026-01-20', 'BC', 'CG2', 'Sala 1', 2, 10, 10),
    ],
    tanques: [],
  },
  'dos composiciones del mismo lote': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 60, 0),
      ing('2026-01-01', 'AB', 'CG2', 'Sala 1', 1, 40, 0),
    ],
    tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 10 })],
  },
  'mismo tanque en salas distintas': {
    ingresos: [
      ing('2026-01-01', 'AB', 'CG1', 'Sala 1', 1, 100, 0),
      ing('2026-01-01', 'BC', 'CG2', 'Sala 4', 1, 50, 0),
    ],
    tanques: [tq('2026-01-02', 'Sala 1', 1, { 'Machos muertos': 10 })],
  },
  'ingreso sin ubicación': {
    ingresos: [ing('2026-01-01', 'AB', 'CG1', '', 0, 100, 0)],
    tanques: [],
  },
  'vacío': { ingresos: [], tanques: [] },
};

const HOY = '2026-01-25';

describe('Libro · el mismo saldo, posición a posición', () => {
  for (const [nombre, fuentes] of Object.entries(ESCENARIOS)) {
    it('coincide con «' + nombre + '»', () => {
      expect(plano(api.madConstruirLibro(fuentes, { hoy: HOY })))
        .toEqual(plano(construirLibro(fuentes, { hoy: HOY })));
    });
  }

  it('y los fixtures producen saldos y avisos DE VERDAD', () => {
    // Comparar dos libros vacíos pasa siempre. Esto exige que los escenarios principales
    // muevan cifras, para que los toEqual de arriba signifiquen algo.
    const mezcla = construirLibro(ESCENARIOS['tanque mezclado, reparto al saldo vivo'], { hoy: HOY });
    expect(mezcla.lotes.get('AB').machos).toBe(120);
    expect(mezcla.lotes.get('BC').machos).toBe(40);
    expect(construirLibro(ESCENARIOS['déficit: más bajas que vivos'], { hoy: HOY }).avisos).toHaveLength(1);
    expect(construirLibro(ESCENARIOS['bajas sin ingreso que las explique'], { hoy: HOY }).avisos).toHaveLength(1);
  });
});

describe('Libro · las mismas funciones puras', () => {
  it('el mismo reparto proporcional', () => {
    const casos = [[15, [100, 50]], [10, [1, 1, 1]], [7, [2, 3, 5]], [9, [0, 0]], [0, [10, 5]], [99, [7, 11, 13, 17]]];
    for (const [t, w] of casos) expect(api.madRepartirProporcional(t, w)).toEqual(repartirProporcional(t, w));
  });

  it('la misma aritmética de fechas', () => {
    for (const f of ['2026-01-01', '2026-02-28', '2026-12-31', 'no-es-fecha']) {
      expect(api.madSumarDias(f, 15)).toBe(sumarDias(f, 15));
    }
  });

  it('las DOS suman días en UTC, y esto se comprueba en el fuente a propósito', () => {
    /* ⚠⚠ ESTA ES ESTRUCTURAL Y NO DE COMPORTAMIENTO, y el motivo importa. Cambiar
       `Date.UTC(...)` por `new Date(y, m, d)` es un defecto REAL —al este de Greenwich la
       fecha retrocede un día y la cuarentena termina con 24 h de desfase—, pero es
       INVISIBLE desde una zona al oeste: aquí (UTC−5) el instante cae a las 05:00Z y
       `toISOString()` devuelve el mismo día, así que las dos versiones dan lo mismo.
       Se midió: el banco `probar-paridad-mad-libro.mjs` metió esa divergencia y la
       comparación de resultados NO la vio.
       🔑 Una comprobación que sólo funciona en la zona horaria del que la escribió no es
       una comprobación. La regla es «se opera en UTC», así que se verifica la regla. */
    const modulo = leer(new URL('./mad-libro.js', import.meta.url));
    expect(modulo).toContain('Date.UTC(');
    expect(src).toContain('const d=new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));');
  });

  it('la misma cuarentena, y los mismos días', () => {
    expect(api.MAD_CUARENTENA_DIAS).toBe(CUARENTENA_DIAS);
    const L = { ingreso: '2026-01-01', copulaDesde: null };
    for (const d of ['2026-01-01', '2026-01-15', '2026-01-16']) {
      expect(api.madEstadoDeLote(L, d)).toBe(estadoDeLote(L, d));
    }
    const C = { ingreso: '2026-01-01', copulaDesde: '2026-01-05' };
    expect(api.madEstadoDeLote(C, '2026-01-05')).toBe(estadoDeLote(C, '2026-01-05'));
  });

  it('el mismo estado de sala, Mixto incluido', () => {
    const f = ESCENARIOS['dos lotes, un tanque cada uno'];
    const a = api.madConstruirLibro(f, { hoy: HOY });
    const b = construirLibro(f, { hoy: HOY });
    expect(api.madEstadoDeSala(a, 'Sala 1', HOY)).toBe(estadoDeSala(b, 'Sala 1', HOY));
    expect(estadoDeSala(b, 'Sala 1', HOY)).toBe(ESTADO_MIXTO);   // el fixture prueba algo
    expect(api.MAD_EST_MIXTO).toBe(ESTADO_MIXTO);
  });

  it('el mismo nombre de tanque mezclado', () => {
    const f = ESCENARIOS['tanque mezclado, reparto al saldo vivo'];
    const a = api.madConstruirLibro(f, { hoy: HOY });
    const b = construirLibro(f, { hoy: HOY });
    const uk = 'Sala 1|1';
    expect(api.madNombreComposicion(a.tanques[uk])).toBe(nombreComposicion(b.tanques.get(uk)));
    expect(nombreComposicion(b.tanques.get(uk))).toBe('AB+BC');
  });
});

describe('Libro · la vista tiene DÓNDE pintarse', () => {
  const shell = leer(new URL('../shell.html', import.meta.url));

  it('el shell declara el panel fp-saldo', () => {
    expect(shell).toContain('<div class="fp" id="fp-saldo"></div>');
  });

  it('y sigue habiendo un panel para CADA pestaña de Maduración', () => {
    const m = src.match(/const MAD_TABS\s+= \[([^\]]*)\];/);
    const tabs = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(tabs.filter((t) => !shell.includes('id="fp-' + t + '"'))).toEqual([]);
  });

  it('lee las dos hojas que el libro necesita', () => {
    expect(api.MAD_LIBRO_SHEETS).toEqual({ ingreso: 'Maduración Ingreso', tanques: 'Maduración Tanques' });
  });

  it('la lectura REUTILIZA la cañería que ya existe, no fabrica otra', () => {
    // Dos cañerías de lectura habrían divergido en silencio; ésta ya resuelve reintentos
    // y caché, y es genérica pese a llevar el prefijo del reproductivo.
    expect(src).toContain('await _reproEnsureSheet(MAD_LIBRO_SHEETS.ingreso, null);');
    expect(src).toContain('_reproReadRows(MAD_LIBRO_SHEETS.tanques)');
  });
});
