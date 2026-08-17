/* ============================================================
   REGISTROS · sello de migraciones de los factores de Microbiología

   `larv4_mic_factors` (y su sello `larv4_mic_factors_ver`) los COMPARTEN dos aplicaciones
   que viven en el MISMO origen: la app de captura (el monolito `public/registros/engine.js`)
   y el TABLERO de Microbiología (`src/views/microbiologia/data.js`).

   El defecto (2026-08-17): el tablero sella con la LISTA de ids aplicados y el motor lo
   hacía con una CADENA suelta comparada con `===`. Ninguna reconocía el sello de la otra,
   así que cada visita re-ejecutaba sus migraciones y reescribía el sello en su formato.
   Como la migración del motor hace `delete o.algas`, los factores que el técnico hubiera
   ajustado para «algas» se BORRABAN cada vez que volvía a la app de captura desde el
   tablero. Y el factor no es una preferencia: `micFactorOf` alimenta `ufc = crudo × f`, y
   ese UFC es lo que `buildMicPayload` escribe en la hoja.

   Esta prueba ejecuta el código REAL de las dos partes contra un localStorage compartido.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

const FACT_KEY = 'larv4_mic_factors';
const VER_KEY = 'larv4_mic_factors_ver';

/** localStorage falso compartido por las dos apps. */
let store = {};
const fakeLS = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

/** Extrae y compila el micMigrateFactors REAL del monolito. */
function migradorDelMotor() {
  const i = src.indexOf('const MIC_FACTORS_VER_KEY');
  const j = src.indexOf('function loadMicFactors');
  if (i < 0 || j < 0) throw new Error('anclas no encontradas en engine.js');
  // MIC_FACTORS_KEY se define muy arriba; sin él la función lanza ReferenceError, su
  // try/catch se lo traga y el arnés "funciona" sin hacer nada — probaría cero.
  const keyDef = /const MIC_FACTORS_KEY = "[^"]+";/.exec(src)[0];
  const ctx = { localStorage: fakeLS, JSON, console };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(keyDef + '\n' + src.slice(i, j) + '\n;globalThis.__mig = micMigrateFactors;').runInContext(ctx);
  return () => ctx.__mig();
}
const migrarMotor = migradorDelMotor();

/** Ids que declara el sello, tolerando el formato antiguo (cadena suelta). */
function idsDelSello() {
  const v = store[VER_KEY];
  if (!v) return [];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : [String(v)]; } catch (_) { return [String(v)]; }
}
const algasSobrevive = () => { try { return !!JSON.parse(store[FACT_KEY] || '{}').algas; } catch (_) { return false; } };
const ponerAjusteDelTecnico = () => { store[FACT_KEY] = JSON.stringify({ algas: { vamar: { f: 7 } } }); };

beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', fakeLS);
});

describe('arnés', () => {
  it('el micMigrateFactors extraído SÍ se ejecuta (si no, todo lo demás probaría cero)', () => {
    ponerAjusteDelTecnico();
    migrarMotor();
    expect(idsDelSello()).toContain('2026-07-20-algas');
  });
});

describe('factores · el motor y el tablero no se pisan el sello', () => {
  it('control: la migración legítima SIGUE ocurriendo la primera vez', () => {
    // El arreglo no debe convertirse en "desactivar la migración".
    ponerAjusteDelTecnico();
    migrarMotor();
    expect(algasSobrevive()).toBe(false);
    expect(idsDelSello()).toContain('2026-07-20-algas');
  });

  it('con el sello del TABLERO (lista JSON), el motor NO re-ejecuta la migración', () => {
    store[VER_KEY] = JSON.stringify(['2026-07-20-algas', '2026-08-16-mad-despacho']);
    ponerAjusteDelTecnico();
    migrarMotor();
    expect(algasSobrevive()).toBe(true);          // antes se borraba aquí
  });

  it('y tampoco reescribe el sello cuando no hay nada pendiente', () => {
    // Reescribirlo en su formato era la otra mitad del ping-pong.
    const sello = JSON.stringify(['2026-07-20-algas', '2026-08-16-mad-despacho']);
    store[VER_KEY] = sello;
    migrarMotor();
    expect(store[VER_KEY]).toBe(sello);
  });

  it('tolera el sello ANTIGUO (cadena suelta) sin re-ejecutar', () => {
    store[VER_KEY] = '2026-07-20-algas';
    ponerAjusteDelTecnico();
    migrarMotor();
    expect(algasSobrevive()).toBe(true);
  });

  it('al sellar CONSERVA los ids ajenos (si no, el tablero repetiría los suyos)', () => {
    store[VER_KEY] = JSON.stringify(['2026-08-16-mad-despacho']);   // solo el del tablero
    ponerAjusteDelTecnico();
    migrarMotor();                                                   // el suyo sí está pendiente
    expect(idsDelSello().sort()).toEqual(['2026-07-20-algas', '2026-08-16-mad-despacho']);
  });

  it('INTEGRACIÓN: el ajuste del técnico sobrevive al ir y volver del tablero', async () => {
    // Con el código REAL de las dos partes. Es el escenario que se midió roto.
    vi.resetModules();
    const D = await import('../../microbiologia/data.js');

    migrarMotor();                 // 1 · primera visita a captura: migración legítima
    ponerAjusteDelTecnico();       // 2 · el técnico ajusta «algas»
    D.loadMicThresholds();         // 3 · entra al tablero (dispara SUS migraciones)
    expect(algasSobrevive(), 'el tablero no debe borrarlo').toBe(true);

    migrarMotor();                 // 4 · vuelve a la app de captura
    expect(algasSobrevive(), 'la app de captura tampoco').toBe(true);
  });
});
