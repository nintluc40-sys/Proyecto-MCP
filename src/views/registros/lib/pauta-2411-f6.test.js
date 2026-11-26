// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 6 (datos que acaban en otro día) de la revisión del 15-11, y dos matices de la auditoría de B
   sobre F5. Motor REAL; las piezas de alrededor se sustituyen con `poner`. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_madFechasSecMalas', '_madBsRevision', '_madAlimPreparar', '_previasFichas', 'audValidar', '_nombreDeCampo', 'mLabel', 'PRE', 'today'];
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

describe('T4.3 · una fecha secundaria imposible es un error, no la de oficio', () => {
  it('🔴', () => {
    const box = document.createElement('div');
    box.id = 'caja-t43';
    box.innerHTML = '<input type="date" class="md-fn2"><input type="date" class="md-fn5">';
    Object.defineProperty(box.querySelector('.md-fn2'), 'validity', { value: { badInput: true } });
    document.body.appendChild(box);
    try {
      const res = H._madFechasSecMalas({ errores: [], avisos: [] }, '#caja-t43 .md-fn2, #caja-t43 .md-fn5', 'Una «Fecha N2» o «Fecha N5»');
      expect(res.errores).toEqual(['Una «Fecha N2» o «Fecha N5» no existe (revisa el día y el mes).']);
    } finally { box.remove(); }
  });
});

describe('T4.6 · Control Broodstock: una fecha de corte futura no se sube', () => {
  it('🔴', () => {
    H.poner('_madBs', { hojas: [{}] });
    H.poner('_madBsElegidas', () => [{ lectura: { nombre: 'S1', fechaCorte: '2099-01-01', errores: [], avisos: [] } }]);
    H.poner('madBsCortesRepetidos', () => []);
    H.poner('madBsValidar', () => ({ errores: [], avisos: [] }));
    expect(H._madBsRevision().errores.join(' ')).toMatch(/la fecha de corte 01\/01\/2099 es posterior a hoy/);
  });
});

describe('T4.5 · Alimentación de otra fecha avisa de que animales y pesos son de hoy', () => {
  it('🔴 avisa y deja seguir', () => {
    let pintado = null;
    H.poner('madAlimCollect', () => ({ fecha: '2020-01-01', salas: [] }));
    H.poner('madAlimValidar', () => ({ errores: [], avisos: [] }));
    H.poner('buildMadAlimPayload', () => ({ rows: [['x']] }));
    H.poner('_madAlimPinta', (r) => { pintado = r; });
    H.poner('_madAlim', { incompleto: '', ts: Date.now() });
    expect(H._madAlimPreparar()).not.toBeNull();
    expect(pintado.avisos.join(' ')).toMatch(/son los del libro leído el [0-9/]+, no los del 0?1.0?1.20/);   // fecha ficticia
  });
});

describe('T1.4 · la copia vieja de medianoche no sale encima de la corrección', () => {
  it('🔴 la nueva manda; la vieja se retira y no se ofrece', () => {
    const pre = H.PRE + H.mLabel(1) + '_';
    localStorage.setItem(pre + 'calidad_2020-01-01', JSON.stringify({ mod: 1, ficha: 'calidad', synced: false, updatedAt: 1, data: { fecha: '2020-01-01', x: 37 } }));
    localStorage.setItem(pre + 'calidad_2020-01-02', JSON.stringify({ mod: 1, ficha: 'calidad', synced: false, updatedAt: 2, data: { fecha: '2020-01-01', x: 48 } }));
    const l = H._previasFichas(1);
    expect(l.map((x) => x.dia)).toEqual(['2020-01-02']);
    expect(localStorage.getItem(pre + 'calidad_2020-01-01')).toBeNull();
  });
  it('dos días distintos de verdad se ofrecen los dos', () => {
    const pre = H.PRE + H.mLabel(1) + '_';
    localStorage.setItem(pre + 'calidad_2020-01-01', JSON.stringify({ mod: 1, ficha: 'calidad', synced: false, updatedAt: 1, data: { fecha: '2020-01-01' } }));
    localStorage.setItem(pre + 'calidad_2020-01-02', JSON.stringify({ mod: 1, ficha: 'calidad', synced: false, updatedAt: 2, data: { fecha: '2020-01-02' } }));
    expect(H._previasFichas(1)).toHaveLength(2);
  });
});

describe('matices de la auditoría de B sobre F5', () => {
  it('🔴 Auditoría: una facturada con decimales se rechaza (no viaja vacía)', () => {
    const err = H.audValidar({ fecha: '2026-01-10', corrida: '901', siembras: [], transferencias: [],
      cosechas: [{ fecha: '2026-01-10', modulo: 'M04', tanque: '1', partida: 1, cantidad: '1000', facturada: '1,5' }] });
    expect(err.join(' ')).toMatch(/la facturada lleva decimales/);
  });
  it('🔴 el campo malo de una tabla se nombra por su columna y su fila', () => {
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr><th>TQ</th><th>OD</th></tr></thead><tbody><tr><td>TQ 1</td><td><input type="number"></td></tr></tbody>';
    expect(H._nombreDeCampo(t.querySelector('input'))).toBe('OD · TQ 1');
  });
  it('🔴 con cabeceras de varias filas (rowspan / colspan), la columna es la buena (auditoría de B)', () => {
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr><th rowspan="2">TQ</th><th rowspan="2">Estadio</th><th colspan="2">Calidad</th></tr><tr><th>%Llenas</th><th>%Vacías</th></tr></thead>'
      + '<tbody><tr><td>TQ 1</td><td><input type="number" id="e"></td><td><input type="number" id="ll"></td><td><input type="number" id="va"></td></tr></tbody>';
    expect(H._nombreDeCampo(t.querySelector('#ll'))).toBe('%Llenas · TQ 1');
    expect(H._nombreDeCampo(t.querySelector('#e'))).toBe('Estadio · TQ 1');
    expect(H._nombreDeCampo(t.querySelector('#va'))).toBe('%Vacías · TQ 1');
  });
});
