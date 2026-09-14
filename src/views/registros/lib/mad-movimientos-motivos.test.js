// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · MOVIMIENTOS · los motivos «Logística» y «Anillado» en el formulario REAL
   (pedido del usuario, 2026-09-14)

   La paridad ya exige que el monolito declare la misma lista que el módulo. Esto mira lo que
   ve el operario: que el desplegable de Motivo de la ficha los ofrezca y que lo elegido llegue
   a la columna «Motivo» del payload.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_MOV_HEADERS, MAD_MOV_MOTIVOS } from './ficha-maduracion-movimientos.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madMovReiniciar', 'madMovCollect', 'buildMadMovPayload', 'madMovSalaChange'];
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

beforeEach(() => { H.madMovReiniciar(); });

const motivo = () => document.getElementById('mv-motivo');

describe('Movimientos · Motivo en el formulario', () => {
  it('🔴 el desplegable ofrece «Logística» y «Anillado», con la misma lista que el módulo', () => {
    const valores = Array.from(motivo().options).map((o) => o.value).filter(Boolean);
    expect(valores).toContain('Logística');
    expect(valores).toContain('Anillado');
    expect(valores).toEqual(MAD_MOV_MOTIVOS);
  });

  it('🔴 lo elegido llega a la columna «Motivo» de cada tramo', () => {
    const fila = document.querySelector('#mv-tramos tr.mv-tramo');
    const pon = (sel, v) => { const e = fila.querySelector(sel); e.value = v; return e; };
    // El tanque depende de la sala: el monolito rellena sus opciones en el onchange de la sala.
    H.madMovSalaChange(pon('.mv-so', 'Sala 1')); pon('.mv-to', '1');
    H.madMovSalaChange(pon('.mv-sd', 'Sala 2')); pon('.mv-td', '16');
    pon('.mv-machos', '5'); pon('.mv-hembras', '5');
    for (const m of ['Logística', 'Anillado']) {
      motivo().value = m;
      const p = H.buildMadMovPayload(H.madMovCollect());
      expect(p.rows).toHaveLength(1);
      expect(p.rows[0][MAD_MOV_HEADERS.indexOf('Motivo')]).toBe(m);
    }
  });
});
