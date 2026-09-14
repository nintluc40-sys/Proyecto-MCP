// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INGRESO · el Agua de cada tanque nace en «Agua de playa» (2026-09-13)

   Pedido del usuario: en la columna Agua del ingreso, entre RAS y Agua de playa, que «Agua de
   playa» salga por defecto. Medido ese día: las 6 filas reales de «Maduración Ingreso» llevaban
   «Agua de playa» y el formulario nacía en RAS, así que había que cambiarla en cada tanque — y
   olvidarlo registraba RAS sin que nadie lo hubiera elegido.

   Alcance: SÓLO el Ingreso. La ficha de Movimientos usa el mismo desplegable y sigue naciendo
   en RAS: no se pidió cambiarla.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_INGRESO_HEADERS } from './ficha-maduracion-ingreso.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madIngReiniciar', '_madIngRepHTML', 'madIngCollect', 'buildMadIngresoPayload', 'MAD_ING_AGUA_DEFECTO'];
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
/* ⚠ happy-dom descarta un <tr> insertado con insertAdjacentHTML sobre un <tbody>, y devuelve mal
   `select.value` cuando la opción marcada no es la primera: se parsea la fila REAL del motor
   dentro de una tabla y se lee la opción MARCADA, que es lo que pinta el navegador. */
const filaTanque = (sala, tanque) => {
  const t = document.createElement('table');
  t.innerHTML = '<tbody>' + H._madIngRepHTML(sala, tanque) + '</tbody>';
  return t.querySelector('tr');
};
const marcada = (tr) => { const o = tr.querySelector('.mi-agua option[selected]'); return o ? o.value : ''; };

beforeEach(() => { H.madIngReiniciar(); });

describe('Ingreso · Agua por defecto', () => {
  it('🔴 un tanque recién elegido nace con «Agua de playa»', () => {
    expect(marcada(filaTanque('Sala 4', 1))).toBe('Agua de playa');
    expect(H.MAD_ING_AGUA_DEFECTO).toBe('Agua de playa');
  });

  it('RAS sigue pudiéndose elegir', () => {
    const opciones = [...filaTanque('Sala 1', 3).querySelectorAll('.mi-agua option')].map((o) => o.value);
    expect(opciones).toEqual(['RAS', 'Agua de playa']);
  });

  it('🔴 el viaje: sin tocar el desplegable, la fila llega a la hoja con «Agua de playa»', () => {
    document.getElementById('mi-fecha').value = '2026-09-13';
    document.getElementById('mi-lote').value = 'BP';
    q('.mi-cg').value = 'OLF5.F2';
    const tr = filaTanque('Sala 4', 2);
    q('.mi-reps').appendChild(tr);
    tr.querySelector('.mi-machos').value = '10';
    tr.querySelector('.mi-hembras').value = '12';
    const p = H.buildMadIngresoPayload(H.madIngCollect());
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0][MAD_INGRESO_HEADERS.indexOf('Agua')]).toBe('Agua de playa');
  });
});
