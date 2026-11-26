// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 3 (🗑 y la cola) de la revisión del 15-11. La regla es la del punto 14 (usuario: «No dejar
   quitarlo»): con algo suyo en la cola, no se quita y se dice; sin enviar, se avisa de que se pierde. Motor REAL, con envíos
   encolados de verdad (_enqueueSync). Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_enqueueSync', 'deleteAstRecord', 'bioBorrarSes', 'micDeleteSession', 'removeAlgHistConfirm', 'previasDescartar',
  'madLocDescartar', 'clearFicha', 'today'];
const H = {};
const avisos = [];
const URL = 'https://script.google.com/macros/s/PRUEBA/exec';

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
let preguntas = [];
beforeEach(() => {
  globalThis.localStorage.clear(); avisos.length = 0; preguntas = [];
  window.confirm = (m) => { preguntas.push(String(m)); return true; }; globalThis.confirm = window.confirm;
});
const encolar = (kind, keys) => H._enqueueSync({ sheetName: 'Hoja ficticia', rows: [['x', keys.join(',')]] }, 'req-' + kind + keys.join(), URL, { kind, keys });
const enCola = () => avisos.join(' ').includes('espera en la cola') || avisos.join(' ').includes('esperan en la cola') || avisos.join(' ').includes('que espera en la cola');

describe('T6.6 · As. Técnico', () => {
  it('🔴 con su envío en la cola, no se quita y se dice (sin preguntar)', () => {
    let quita = 0;
    H.poner('loadAst', () => [{ id: 'a1', synced: false }]);
    H.poner('removeAstById', () => { quita++; });
    encolar('ast', ['a1']);
    H.deleteAstRecord('a1');
    expect(quita).toBe(0);
    expect(preguntas).toHaveLength(0);
    expect(avisos.join(' ')).toMatch(/espera en la cola/);
  });
  it('🔴 sin enviar y sin cola: avisa de que se PIERDE (no «no afecta a lo enviado»)', () => {
    H.poner('loadAst', () => [{ id: 'a2', synced: false }]);
    H.poner('removeAstById', () => {});
    H.poner('renderAst', () => {});
    H.deleteAstRecord('a2');
    expect(preguntas[0]).toMatch(/NO se ha enviado: si lo quitas, se pierde/);
  });
});

describe('T6.6 · Biomol: borrar un análisis con su envío en la cola', () => {
  it('🔴 no se borra', () => {
    let guarda = 0;
    H.poner('bioSes', () => ({ fecha: '2026-11-20' }));
    H.poner('bioSesNombre', () => 'Análisis 1');
    H.poner('_bioRaw', () => [{ synced: false, data: { sid: 's1' } }]);
    H.poner('_bioSave', () => { guarda++; return true; });
    encolar('bio', ['2026-11-20|s1']);
    H.bioBorrarSes('s1');
    expect(guarda).toBe(0);
    expect(avisos.join(' ')).toMatch(/espera en la cola/);
  });
});

describe('T7.8 · Laboratorio: borrar una sesión con su envío en la cola', () => {
  it('🔴 no se borra', () => {
    let guarda = 0;
    H.poner('_micRaw', () => [{ synced: false, data: {} }]);
    H.poner('micSessionKey', () => 'K1');
    H.poner('_micSave', () => { guarda++; return true; });
    encolar('mic', ['K1']);
    H.micDeleteSession('K1');
    expect(guarda).toBe(0);
    expect(avisos.join(' ')).toMatch(/espera en la cola/);
  });
});

describe('T2.7 · Algas: el 🗑 del historial', () => {
  it('🔴 con el registro en la cola, no se quita', () => {
    let quita = 0;
    H.poner('removeAlgHistById', () => { quita++; });
    encolar('alg', ['h1']);
    H.removeAlgHistConfirm('h1');
    expect(quita).toBe(0);
  });
});

describe('T1.3 · «🗑 Descartarlas»: lo que espera en la cola no se descarta', () => {
  it('🔴 la ficha en la cola se queda; la otra se descarta, y se dice', () => {
    H.poner('curMod', 1);
    H.poner('isLabMod', () => false);
    H.poner('_previasFichas', () => [{ key: 'k-cola', ficha: 'calidad', dia: '2026-11-19' }, { key: 'k-libre', ficha: 'plg', dia: '2026-11-19' }]);
    H.poner('_previasPintar', () => {});
    localStorage.setItem('k-cola', '1'); localStorage.setItem('k-libre', '1');
    encolar('fichas', ['1|calidad|2026-11-19']);
    H.previasDescartar();
    expect(localStorage.getItem('k-cola')).toBe('1');
    expect(localStorage.getItem('k-libre')).toBeNull();
    expect(preguntas[0]).toMatch(/1 más esperan en la cola/);
  });
});

describe('T3.5 · lo guardado con 💾 no se borra mientras se envía', () => {
  it('🔴', () => {
    let guarda = 0;
    H.poner('madLocLeer', () => [{ id: 'e1', fecha: '2026-11-20', filas: 1 }]);
    H.poner('madLocGuardar', () => { guarda++; return true; });
    H.leer('_madLocEnVuelo').ingreso = true;
    try { H.madLocDescartar('ingreso', 'e1'); } finally { H.leer('_madLocEnVuelo').ingreso = false; }
    expect(guarda).toBe(0);
    expect(avisos.join(' ')).toMatch(/se está enviando ahora/);
  });
});

describe('T2.8 · Larvicultura: «🗑 Borrar» de una ficha', () => {
  it('🔴 con su envío en la cola no se borra', () => {
    H.poner('curMod', 1);
    H.poner('loadE', () => ({ synced: false, data: { x: 1 } }));
    localStorage.setItem(H.leer('skey')(1, 'calidad'), '{}');
    encolar('fichas', ['1|calidad|2026-11-20']);
    H.clearFicha('calidad');
    expect(localStorage.getItem(H.leer('skey')(1, 'calidad'))).toBe('{}');
    expect(avisos.join(' ')).toMatch(/espera en la cola/);
  });
});
