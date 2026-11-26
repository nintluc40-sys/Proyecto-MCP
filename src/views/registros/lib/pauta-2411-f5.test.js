// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 5 (números que llegan mal) de la revisión del 15-11. Decisiones del usuario: todos los equipos
   en español (sólo se marca y avisa lo que el navegador no entiende); las alturas de Mareas conservan el signo; en Auditoría, miles sí
   y decimales no; «BP BC» son dos lotes; «1.500» copias = 1500. Motor REAL. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['audEntero', 'bioNivelCopias', 'madTratLotes', '_numerosMalos', '_persistAst', 'buildMareaPayload', '_mareaAlturaTxt',
  'micFactorSet', 'loadMicFactors', 'MAREA_GRID_COLS', 'today'];
const H = {};
const avisos = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\nH.poner=function(n,v){ eval(n+"=v"); };'
    + '\nH.leer=function(n){ return eval(n); };\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
});
beforeEach(() => { globalThis.localStorage.clear(); avisos.length = 0; });

describe('T6.11 · Auditoría: miles sí, decimales no', () => {
  it('🔴', () => {
    expect(['6.300.000', '6,300,000', '6 300 000', '6.300.000,00', '1.500'].map(H.audEntero)).toEqual([6300000, 6300000, 6300000, 6300000, 1500]);
    expect(['1,5', '2.5', '12,50'].map((v) => Number.isNaN(H.audEntero(v)))).toEqual([true, true, true]);
    expect(H.audEntero('')).toBe('');
  });
});

describe('T6.12 · Biomol PDF: «1.500» copias son 1500', () => {
  it('🔴', () => { expect(H.bioNivelCopias('1.500')).toBe(H.bioNivelCopias('1500')); expect(H.bioNivelCopias('1,5')).toBe(H.bioNivelCopias('1.5')); });
});

describe('T4.10 · Tratamientos: el espacio separa lotes', () => {
  it('🔴', () => { expect(H.madTratLotes('BP BC')).toEqual(['BC', 'BP']); expect(H.madTratLotes('BP, BC')).toEqual(['BC', 'BP']); });
});

describe('T8.5 · Mareas: una altura negativa conserva el signo', () => {
  it('🔴 en la grilla y en el envío (como número, que el GAS no toca)', () => {
    expect(H._mareaAlturaTxt('-0,15')).toBe('-0,15');
    const p = H.buildMareaPayload([{ fecha: '2026-11-20', ab1: '-0,15', ap1: '1,2' }]);
    const iAb1 = H.MAREA_GRID_COLS.findIndex((c) => c.k === 'ab1'), iAp1 = H.MAREA_GRID_COLS.findIndex((c) => c.k === 'ap1');
    expect(p.rows[0][iAb1]).toBe(-0.15);
    expect(p.rows[0][iAp1]).toBe('1,2');
  });
  it('un texto que empieza por «-» y no es un número sigue perdiendo el signo (no es una fórmula)', () => { expect(H._mareaAlturaTxt('-x')).toBe('x'); });
});

describe('T2.10 / T6.7 / T7.9 · lo que el navegador no entiende se marca y no se guarda vacío', () => {
  const malo = () => {
    const fp = document.getElementById('fp-ast');
    const antes = fp.innerHTML;
    fp.innerHTML = '<div class="mf"><label>Deformidad</label><input type="number" name="deformidad"></div>';
    Object.defineProperty(fp.querySelector('input'), 'validity', { value: { badInput: true } });
    return () => { fp.innerHTML = antes; };
  };
  it('🔴 _numerosMalos lo encuentra por su etiqueta, y As. Técnico no guarda', () => {
    const volver = malo();
    try {
      expect(H._numerosMalos('#fp-ast')).toEqual(['Deformidad']);
      let recogido = 0;
      H.poner('collectAst', () => { recogido++; return {}; });
      expect(H._persistAst()).toBeNull();
      expect(recogido).toBe(0);
      expect(avisos.join(' ')).toMatch(/«Deformidad» no es un número que se entienda/);
    } finally { volver(); }
  });
});

describe('T4.3 (Laboratorio) · un factor no entendido no borra el que había', () => {
  it('🔴', () => {
    H.micFactorSet('a', 'p', 'f', '2');
    H.micFactorSet('a', 'p', 'f', null);
    expect(H.loadMicFactors().a.p.f).toBe(2);
    expect(avisos.join(' ')).toMatch(/no se cambió nada/);
  });
});
