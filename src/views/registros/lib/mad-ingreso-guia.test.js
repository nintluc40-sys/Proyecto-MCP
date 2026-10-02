// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INGRESO · «Guía de ingreso» (2026-10-02)

   Pedido del usuario: un campo para escribir la guía del ingreso, como los demás campos de la ficha, y en la hoja
   la ÚLTIMA columna, DETRÁS del ID. Decisiones del usuario: una por INGRESO (como la Fecha y el Lote, no por
   composición) y TEXTO libre (una guía de remisión lleva ceros a la izquierda y guiones). Opcional.
   Aquí se ejerce la ficha REAL del motor: el campo está en la cabecera del ingreso, lo tecleado llega a TODAS las
   filas, en la última columna, y el formulario vacío lo vacía.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_INGRESO_HEADERS } from './ficha-maduracion-ingreso.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madIngReiniciar', '_madIngRepHTML', 'madIngCollect', 'buildMadIngresoPayload', 'MAD_ING_HEADERS'];
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

const q = (s) => document.querySelector('#fp-ingreso ' + s);
/* Como en mad-ingreso-agua.test.js: la fila REAL del motor, parseada dentro de una tabla (happy-dom). */
const filaTanque = (sala, tanque) => {
  const t = document.createElement('table');
  t.innerHTML = '<tbody>' + H._madIngRepHTML(sala, tanque) + '</tbody>';
  return t.querySelector('tr');
};
const conDosTanques = () => {
  document.getElementById('mi-fecha').value = '2026-10-02';
  document.getElementById('mi-lote').value = 'BQ';
  q('.mi-cg').value = 'OLF5.F2';
  for (const t of [1, 2]) {
    const tr = filaTanque('Sala 4', t);
    q('.mi-reps').appendChild(tr);
    tr.querySelector('.mi-machos').value = '10';
    tr.querySelector('.mi-hembras').value = '12';
  }
};
const G = MAD_INGRESO_HEADERS.indexOf('Guía de ingreso');

beforeEach(() => { H.madIngReiniciar(); });

describe('Ingreso · «Guía de ingreso»', () => {
  it('el motor declara las MISMAS 19 cabeceras que el módulo, con la guía la última', () => {
    expect(H.MAD_ING_HEADERS).toEqual(MAD_INGRESO_HEADERS);
    expect(G).toBe(18);
  });

  it('🔴 el campo está en la cabecera del ingreso, junto a la fecha y el lote, y es de texto', () => {
    const el = document.getElementById('mi-guia');
    expect(el).not.toBeNull();
    expect(el.type).toBe('text');
    expect(el.closest('label').textContent).toContain('Guía de ingreso');
  });

  it('🔴 lo tecleado llega a TODAS las filas del ingreso, en la última columna, tal cual', () => {
    conDosTanques();
    document.getElementById('mi-guia').value = '001-002-000123';
    const p = H.buildMadIngresoPayload(H.madIngCollect());
    expect(p.headers).toEqual(MAD_INGRESO_HEADERS);
    expect(p.rows).toHaveLength(2);
    expect(p.rows.map((r) => r[G])).toEqual(['001-002-000123', '001-002-000123']);
    expect(p.rows.every((r) => r.length === MAD_INGRESO_HEADERS.length)).toBe(true);
  });

  it('opcional: sin guía las filas se escriben igual, con la celda vacía; y «🗑 vaciar» la borra', () => {
    conDosTanques();
    expect(H.buildMadIngresoPayload(H.madIngCollect()).rows.map((r) => r[G])).toEqual(['', '']);
    document.getElementById('mi-guia').value = 'G-9';
    H.madIngReiniciar();
    expect(document.getElementById('mi-guia').value).toBe('');
  });
});
