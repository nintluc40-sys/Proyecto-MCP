/* Rescate del nombre de pestaña desde la caché.
   ------------------------------------------------------------------
   Por qué existe: `extractSheetTabs` tiene un respaldo que recoge gids sueltos del HTML
   SIN nombre. Antes esos gids iban directos a `detectSheetName`, que adivina la hoja por
   sus columnas — y adivina mal casi siempre. Medido el 2026-08-31 sobre las cabeceras
   REALES de las 35 pestañas de producción, las once hojas «Datos Larvicultura» salían
   clasificadas como 'Morfologia'; como `isLarviculturaRow` (core/fields.js:143) compara la
   cadena EXACTA, toda la producción de Larvicultura habría desaparecido del tablero sin un
   solo error a la vista.

   El arreglo NO toca ninguna heurística: se le pregunta a la caché, que ya guardaba el
   nombre real de una carga anterior. Un nombre recordado gana a cualquier adivinanza.

   ⚠ Además se cierra una degradación silenciosa de la propia caché: la lista que se
   guarda es la YA rellenada. Antes, un raspado incompleto escribía cadenas vacías encima
   de los nombres buenos, y a partir de ahí ni la caché podía rescatarlos. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fillTitlesFromCache, discoverGids } from './sheets.js';

const CACHE_REAL = [
  { gid: 667967925, title: 'Datos Larvicultura - M01' },
  { gid: 379049415, title: 'Datos Larvicultura - M03' },
  { gid: 731381642, title: 'Control_Tanque M01' },
  { gid: 97941685, title: 'Registro_Traslado' },
];

describe('fillTitlesFromCache', () => {
  it('rellena el título que falta con el que la caché recuerda', () => {
    const raspado = [{ gid: 379049415, title: '' }];
    expect(fillTitlesFromCache(raspado, CACHE_REAL)).toEqual([
      { gid: 379049415, title: 'Datos Larvicultura - M03' },
    ]);
  });

  // ⚠ Lo contrario sería un defecto: una pestaña renombrada tiene que poder cambiar.
  it('un título recién raspado MANDA sobre el recordado', () => {
    const raspado = [{ gid: 379049415, title: 'Datos Larvicultura - M03 (2027)' }];
    expect(fillTitlesFromCache(raspado, CACHE_REAL)[0].title).toBe('Datos Larvicultura - M03 (2027)');
  });

  it('NO resucita un gid que ya no aparece en el raspado (hoja borrada)', () => {
    const raspado = [{ gid: 667967925, title: 'Datos Larvicultura - M01' }];
    const out = fillTitlesFromCache(raspado, CACHE_REAL);
    expect(out).toHaveLength(1);
    expect(out.map((t) => t.gid)).not.toContain(379049415);
  });

  it('un gid desconocido para la caché se queda sin título (y caerá en las heurísticas)', () => {
    const raspado = [{ gid: 111111111, title: '' }];
    expect(fillTitlesFromCache(raspado, CACHE_REAL)[0].title).toBe('');
  });

  it('caso REAL: raspado parcial de 4 pestañas con 2 sin nombre', () => {
    const raspado = [
      { gid: 667967925, title: 'Datos Larvicultura - M01' },
      { gid: 379049415, title: '' },   // <- se perdió el nombre
      { gid: 731381642, title: '' },   // <- y éste también
      { gid: 97941685, title: 'Registro_Traslado' },
    ];
    const out = fillTitlesFromCache(raspado, CACHE_REAL);
    expect(out.map((t) => t.title)).toEqual([
      'Datos Larvicultura - M01',
      'Datos Larvicultura - M03',
      'Control_Tanque M01',
      'Registro_Traslado',
    ]);
    // Y ninguno queda vacío: es la lista que se guarda, así que la caché no se degrada.
    expect(out.every((t) => t.title)).toBe(true);
  });

  it('el gid casa aunque la caché lo guarde como texto (entradas antiguas)', () => {
    const cacheVieja = [{ gid: '379049415', title: 'Datos Larvicultura - M03' }];
    expect(fillTitlesFromCache([{ gid: 379049415, title: '' }], cacheVieja)[0].title)
      .toBe('Datos Larvicultura - M03');
  });

  it('aguanta caché vacía, ausente o con entradas basura', () => {
    const raspado = [{ gid: 1, title: '' }];
    expect(fillTitlesFromCache(raspado, [])[0].title).toBe('');
    expect(fillTitlesFromCache(raspado, null)[0].title).toBe('');
    expect(fillTitlesFromCache(raspado, undefined)[0].title).toBe('');
    expect(fillTitlesFromCache(raspado, [null, undefined, {}])[0].title).toBe('');
    expect(fillTitlesFromCache(null, CACHE_REAL)).toEqual([]);
  });

  it('sin ningún título vacío, devuelve la lista tal cual (el caso de HOY)', () => {
    // Producción 2026-08-31: las 35 pestañas traen nombre. Este es el no-op garantizado.
    const raspado = CACHE_REAL.map((t) => ({ ...t }));
    expect(fillTitlesFromCache(raspado, CACHE_REAL)).toEqual(CACHE_REAL);
    expect(fillTitlesFromCache(raspado, [])).toEqual(CACHE_REAL);
  });
});

/* ── El cableado: que `discoverGids` USE de verdad el rescate ────────────
   Probar sólo la función pura dejaba VIVA la mutación que la desenchufa de
   `discoverGids` (banco `mutar-cache-titulos.mjs`, 2026-08-31). Una pieza correcta que
   nadie llama no arregla nada, así que aquí se ejercita la ruta completa con `fetch` y
   `localStorage` simulados. */
const DOC = '1Rrpff6bD1pOQFsi2Lsagan3ttjncxJzXoXLPgtHM0Gs';
const CACHE_KEY = 'larv4_sheet_tabs';

// htmlview con DOS pestañas: una con nombre (items.push) y otra que sólo aparece como
// gid suelto — exactamente el caso que produce el respaldo de `extractSheetTabs`.
const HTML = `
  <script>
  items.push({name:"Datos Larvicultura - M01", pageUrl:"https://docs.google.com/spreadsheets/d/${DOC}/edit#gid=667967925"});
  </script>
  <a href="#gid=379049415">otra</a>
`;

let fetchOrig;
beforeEach(() => {
  fetchOrig = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => ({ ok: true, text: async () => HTML }));
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
});
afterEach(() => { globalThis.fetch = fetchOrig; });

const seedCache = (list) => localStorage.setItem(CACHE_KEY, JSON.stringify({ [DOC]: list }));
const titulo = (list, gid) => (list.find((t) => Number(t.gid) === gid) || {}).title;

describe('discoverGids · el rescate está ENCHUFADO', () => {
  it('el gid sin nombre recupera su título de la caché', async () => {
    seedCache([{ gid: 379049415, title: 'Datos Larvicultura - M03' }]);
    const list = await discoverGids({ type: 'real', realId: DOC });
    expect(titulo(list, 379049415)).toBe('Datos Larvicultura - M03');
    expect(titulo(list, 667967925)).toBe('Datos Larvicultura - M01');
  });

  it('sin caché se queda vacío (y sólo entonces caería en las heurísticas)', async () => {
    const list = await discoverGids({ type: 'real', realId: DOC });
    expect(titulo(list, 379049415)).toBe('');
  });

  // ⚠ La degradación silenciosa: antes se guardaba la lista CRUDA y el nombre bueno
  // quedaba machacado por una cadena vacía, así que el rescate sólo funcionaba una vez.
  it('la caché NO se degrada: tras un raspado parcial el nombre sigue guardado', async () => {
    seedCache([{ gid: 379049415, title: 'Datos Larvicultura - M03' }]);
    await discoverGids({ type: 'real', realId: DOC });
    const guardado = JSON.parse(localStorage.getItem(CACHE_KEY))[DOC];
    expect(titulo(guardado, 379049415)).toBe('Datos Larvicultura - M03');
    // y sigue funcionando en la carga SIGUIENTE
    const otra = await discoverGids({ type: 'real', realId: DOC });
    expect(titulo(otra, 379049415)).toBe('Datos Larvicultura - M03');
  });
});
