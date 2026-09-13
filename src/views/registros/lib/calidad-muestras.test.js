// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Calidad de Agua — las columnas «Muestra/Muestras» con sugerencias

   Pedidos del usuario (2026-09-13):
   · «Maduración · Agua de mar»: la columna Muestra, que sugería «Agua de mar», suma
     «Afluente» y «Efluente» con el MISMO comportamiento (se elige o se escribe).

   Cómo viaja: la columna es `txtlist` (input de texto + datalist) y su valor va a la columna
   «Tipo de muestra» de la hoja «Calidad de Agua» como TEXTO. Un valor nuevo no es una
   columna nueva: no toca la hoja, ni el GAS, ni `CAL_PARAM_ORDER`.
   ⚠ El tablero agrupa «Tipo de muestra» con `normTipoMuestra`, que pliega todo lo que empieza
   por «agua» a «Agua»: «Afluente» y «Efluente» NO empiezan así y se ven como tipos propios,
   que es lo que se quiere (son puntos distintos del agua de mar).
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['CAL_FORMATS', 'renderCalNuevo', 'micTypeSet', 'loadCalDraft', 'saveCalDraft',
  'collectCalDraft', 'buildCalPayload', 'CAL_SHEET_HEADERS'];
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const pintar = (fmt) => {
  localStorage.clear();
  H.micTypeSet('cal');
  const d = H.loadCalDraft(); d.activeFmt = fmt; H.saveCalDraft(d);
  H.renderCalNuevo();
};
const celda = (fmt, fila, k) => document.querySelector(`[name="cal_${fmt}_${fila}_${k}"]`);
const opcionesDe = (input) => {
  const dl = input && input.getAttribute('list') ? document.getElementById(input.getAttribute('list')) : null;
  return dl ? [...dl.querySelectorAll('option')].map((o) => o.getAttribute('value')) : null;
};
const col = (nombre) => H.CAL_SHEET_HEADERS.indexOf(nombre);

describe('Calidad de Agua · Maduración · Agua de mar · Muestra', () => {
  const MAR = ['Agua de mar', 'Afluente', 'Efluente'];

  it('🔴 la columna sugiere Agua de mar, Afluente y Efluente, en ese orden', () => {
    const c = H.CAL_FORMATS['mad-mar'].ctx.find((x) => x.k === 'tipoMuestra');
    expect(c.type).toBe('txtlist');
    expect(c.opts).toEqual(MAR);
  });

  it('🔴 y la celda pintada las ofrece de verdad (datalist enlazado)', () => {
    pintar('mad-mar');
    const inp = celda('mad-mar', 1, 'tipoMuestra');
    expect(inp, 'no se pintó la celda Muestra').toBeTruthy();
    expect(opcionesDe(inp)).toEqual(MAR);
  });

  it('sigue admitiendo ESCRIBIR otra muestra', () => {
    pintar('mad-mar');
    const inp = celda('mad-mar', 1, 'tipoMuestra');
    expect(inp.tagName).toBe('INPUT');
    expect(inp.getAttribute('type')).toBe('text');
  });

  it('el viaje: «Efluente» tecleado llega a «Tipo de muestra» del envío', () => {
    pintar('mad-mar');
    celda('mad-mar', 1, 'tipoMuestra').value = 'Efluente';
    celda('mad-mar', 1, 'ph').value = '8';
    const fila = H.collectCalDraft().sections['mad-mar'].rows[0];
    expect(fila.tipoMuestra).toBe('Efluente');
    const p = H.buildCalPayload([{ data: Object.assign({ formato: 'mad-mar', fechaMuestreo: '2026-09-13' }, fila) }]);
    expect(p.rows[0][col('Tipo de muestra')]).toBe('Efluente');
  });
});
