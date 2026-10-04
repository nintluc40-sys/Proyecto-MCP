// @vitest-environment happy-dom
/* ============================================================
   COLA · la conciliación de las fichas de LARVICULTURA con el motor REAL (auditoría final, 2026-10-04)

   Lo entregado desde la cola tiene que dejar de figurar «pendiente». La marca de estas fichas es «módulo|ficha» con el
   módulo NÚMERO (1|calidad), pero al conciliar volvía como TEXTO ("1"): saveE lo rechazaba (isValidMod) y, tras recargar,
   loadE ni encontraba la ficha (e.mod === "1"). Nunca se concilió. h1-marcas.test.js no lo veía: usa sustitutos de
   loadE/saveE con módulos de texto ('M01'). Aquí, el motor entero, como en un equipo.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['saveE', 'loadE', '_marcaFichas', '_reconcileMark', '_invalidateLoadE'];
const H = {};
const mapa = new Map();
const almacen = { getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k),
  clear: () => mapa.clear(), key: (i) => Array.from(mapa.keys())[i] ?? null, get length() { return mapa.size; } };

beforeAll(async () => {
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n') + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
});
beforeEach(() => { mapa.clear(); H._invalidateLoadE(); });

describe('Cola · lo entregado de Larvicultura deja de estar «pendiente»', () => {
  it('🔴 la entrega concilia la ficha encolada (M01 · Calidad)', () => {
    H.saveE(1, 'calidad', { fecha: '2026-10-04', corrida: '600' }, false);
    const marca = H._marcaFichas(1, ['calidad']);
    expect(marca.keys).toEqual(['1|calidad']);
    expect(H._reconcileMark(marca)).toBe(true);
    expect(H.loadE(1, 'calidad').synced).toBe(true);
  });

  it('🔴 también tras RECARGAR la página (sin la caché de loadE), que es cuando suele llegar la entrega', () => {
    H.saveE(3, 'poblacion', { fecha: '2026-10-04' }, false);
    const marca = H._marcaFichas(3, ['poblacion']);
    H._invalidateLoadE();                       // como al abrir la app otra vez
    expect(H._reconcileMark(marca)).toBe(true);
    H._invalidateLoadE();
    expect(H.loadE(3, 'poblacion').synced).toBe(true);
  });

  it('el sello sigue mandando: si la ficha se editó después de encolarse, NO se da por enviada', () => {
    H.saveE(1, 'plg', { fecha: '2026-10-04', plg: 10 }, false);
    const marca = H._marcaFichas(1, ['plg']);
    marca.stamps['1|plg'] -= 1;                  // la entrada que hay ya no es la que se envió
    expect(H._reconcileMark(marca)).toBe(false);
    expect(H.loadE(1, 'plg').synced).toBe(false);
  });
});
