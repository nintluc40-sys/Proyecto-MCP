// @vitest-environment happy-dom
/* ============================================================
   LARVICULTURA · «RECALCULAR SUPERVIVENCIA» TAMBIÉN CAMBIA LA FICHA DE HOY (A11, 2026-11-06)

   LO QUE PASABA: al cambiar la Cantidad Sembrada, el recálculo de la supervivencia (sv = población ÷ sembrada) de los
   días de la corrida cambiaba el historial, pero NO la ficha de hoy: `loadE` devuelve sus datos CONGELADOS
   (Object.freeze) y el motor no corre en modo estricto, así que escribir en ellos no hacía nada y no fallaba. La ficha se
   guardaba igual y se reenviaba a la hoja con la supervivencia VIEJA.

   AHORA: se recalcula sobre una copia. Motor REAL sobre el shell real; el envío, simulado. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['saveE', 'loadE', 'saveCS', '_persistStdCorr', 'recalcSurvivalForCorrida', '_invalidateLoadE', '_lastSyncFingerprint'];
const H = {};
const envios = [];

const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast(() => {});
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
});

const MOD = 1;
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const HOY = iso(new Date());

beforeEach(() => {
  almacen.clear();
  H._invalidateLoadE();
  envios.length = 0;
  H._lastSyncFingerprint.clear();
  globalThis.confirm = () => true;
  H.setVista(MOD, 'params');
});

describe('A11 · recalcular la supervivencia', () => {
  it('🔴 la ficha de HOY queda con la supervivencia nueva (antes se quedaba con la vieja, en silencio)', async () => {
    H._persistStdCorr({ corrida: '601' });
    H.saveE(MOD, 'poblacion', { fecha: HOY, corrida: '601', po_0: '800', sv_0: '90.00', po_1: '450', sv_1: '50.00' }, true);
    H.saveCS(MOD, { si_0: 1000, si_1: 500 });   // la Cantidad Sembrada corregida
    await H.recalcSurvivalForCorrida();
    const d = H.loadE(MOD, 'poblacion').data;
    expect([d.sv_0, d.sv_1]).toEqual(['80.00', '90.00']);
    expect([d.po_0, d.po_1]).toEqual(['800', '450']);   // la población no se toca
  });

  it('🔴 y lo que se reenvía a la hoja lleva la supervivencia nueva', async () => {
    H._persistStdCorr({ corrida: '601' });
    H.saveE(MOD, 'poblacion', { fecha: HOY, corrida: '601', po_0: '800', sv_0: '90.00' }, true);
    H.saveCS(MOD, { si_0: 1000 });
    await H.recalcSurvivalForCorrida();
    const env = envios.at(-1);
    expect(env).toBeTruthy();
    const col = env.headers.findIndex((h) => /supervivencia/i.test(h));
    expect(col).toBeGreaterThan(-1);
    expect(env.rows.map((r) => Number(String(r[col]).replace(',', '.')))).toContain(80);   // viaja «80,00»; antes, «90,00»
  });
});
