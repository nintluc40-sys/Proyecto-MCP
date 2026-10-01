// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · «🗑 Borrar sala» borra SÓLO lo que no se envió (usuario, 2026-09-30, punto 5 · B)

   LO QUE PASABA: «🗑 Borrar sala» borraba del dispositivo TODOS los registros de (fecha, sala), también los ya enviados, y
   el contador de partes volvía a P1: si se volvía a teclear la ronda, salía como un parte NUEVO (otro número y otra
   hora = otra llave) y la hoja la tenía dos veces, que el libro resta dos veces. La hoja muestra contadores reiniciados
   (29/09, Sala 3: P2, P3, P4… y después P1 a las 06:26 y a las 15:53).

   DECISIÓN DEL USUARIO: borra sólo lo que NO se envió nunca; lo enviado (alguna vez) se conserva en el dispositivo y se
   CIERRA (la grilla queda limpia), así la numeración sigue; para corregir un parte enviado está «✏️ Reabrir el parte».

   Arnés: el de mad-tanques-vaciar.test.js (engine.js entero en happy-dom; sólo se sustituye el POST de un intento).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', 'madTanquesFechaChange', 'saveMadTanquesGrid',
  'syncMadTanquesGrid', 'syncAll', 'loadMad', 'saveMadList', '_gasVersionLocal', 'MAD_MOD', 'today', 'clearMadTanquesGrid'];
const H = {};
const envios = [];
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
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPostOnce(async (body) => { envios.push(JSON.parse(JSON.stringify(body))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    if (u.indexOf('p=rows') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
    throw new Error('fetch inesperado: ' + u);
  };
});

const poner = (tq, k, v) => {
  const el = document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
  if (!el) throw new Error('sin celda ' + k + ' del tanque ' + tq);
  el.value = String(v);
};
const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
const valor = (tq, k) => document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]').value;

beforeEach(() => {
  localStorage.clear();
  envios.length = 0; avisos.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
  H.setVista(H.MAD_MOD, 'tanques');
  H.renderMadTanques();
});
afterEach(() => { vi.useRealTimers(); });

const delDia = (sala) => H.loadMad('tanques').filter((r) => r.data.sala === sala && r.data.fecha === H.today())
  .map((r) => ['T' + r.data.tanque, 'P' + r.data.parte, r.data.cerrado ? 'cerrado' : 'abierto', r.synced || r.syncedAt ? 'enviado' : 'sin enviar'])
  .sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]));

describe('Tanques · «🗑 Borrar sala» borra sólo lo NO enviado (punto 5 · B)', () => {
  it('🔴 con un parte ya ENVIADO: se conserva, se borra sólo lo sin enviar, y la ronda siguiente NO vuelve a P1', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 2);
    await H.syncMadTanquesGrid();                      // ☁️: P1 enviado y cerrado
    poner(8, 'hembras_muertas', 1);
    H.saveMadTanquesGrid();                            // 💾: P2 guardado, SIN enviar
    expect(delDia('Sala 5'), 'el fixture ejerce algo').toEqual([['T7', 'P1', 'cerrado', 'enviado'], ['T8', 'P2', 'cerrado', 'sin enviar']]);
    H.clearMadTanquesGrid();
    expect(delDia('Sala 5'), 'se borró lo ya enviado (o se dejó lo que no)').toEqual([['T7', 'P1', 'cerrado', 'enviado']]);
    poner(9, 'machos_muertos', 3);
    H.saveMadTanquesGrid();
    expect(delDia('Sala 5').map((x) => x[0] + ' ' + x[1]), 'la ronda siguiente volvió a P1: otra llave para la misma hoja').toEqual(['T7 P1', 'T9 P2']);
  });

  it('🔴 un parte ABIERTO ya enviado (🔄) se conserva, se cierra, y la grilla queda limpia', async () => {
    irASala('Sala 5');
    poner(10, 'machos_muertos', 4);
    irASala('Sala 2');
    await H.syncAll();                                 // 🔄: enviado y ABIERTO
    irASala('Sala 5');
    expect(valor(10, 'machos_muertos'), 'el fixture ejerce algo: el parte abierto se pinta').toBe('4');
    H.clearMadTanquesGrid();
    expect(delDia('Sala 5')).toEqual([['T10', 'P1', 'cerrado', 'enviado']]);
    expect(valor(10, 'machos_muertos'), 'la grilla sigue enseñando lo enviado').toBe('');
  });

  it('🔴 un parte enviado y CORREGIDO después (pendiente otra vez) también se conserva: se envió ALGUNA vez', async () => {
    irASala('Sala 5');
    poner(8, 'machos_muertos', 6);
    await H.syncMadTanquesGrid();
    H.saveMadList('tanques', H.loadMad('tanques').map((r) => Object.assign(r, { synced: false })));   // corregido tras enviarlo
    H.clearMadTanquesGrid();
    expect(delDia('Sala 5'), 'se borró un parte que la hoja ya tiene').toEqual([['T8', 'P1', 'cerrado', 'enviado']]);
  });

  it('lo NO enviado se borra como siempre', () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 5);
    H.saveMadTanquesGrid();
    H.clearMadTanquesGrid();
    expect(delDia('Sala 5')).toEqual([]);
  });

  it('con todo enviado y cerrado no hay nada que borrar: lo dice y no pregunta', async () => {
    irASala('Sala 5');
    poner(11, 'hembras_muertas', 2);
    await H.syncMadTanquesGrid();
    let preguntas = 0;
    globalThis.confirm = () => { preguntas++; return true; };
    avisos.length = 0;
    H.clearMadTanquesGrid();
    expect(preguntas).toBe(0);
    expect(delDia('Sala 5')).toEqual([['T11', 'P1', 'cerrado', 'enviado']]);
    expect(avisos.map((a) => a.msg).join(' | ')).toContain('Reabrir el parte');
  });
});
