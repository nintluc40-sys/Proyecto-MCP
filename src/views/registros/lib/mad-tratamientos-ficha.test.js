// @vitest-environment happy-dom
/* MADURACIÓN · TRATAMIENTOS · la ficha en el monolito (2026-09-15): plantillas por estado de la sala, lo
   habitual de cada área, una fila por tarjeta y la protección contra el GAS viejo (hoja nueva). */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_TRAT_HEADERS } from './ficha-maduracion-tratamientos.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madTratReiniciar', 'madTratCollect', 'buildMadTratPayload', 'madTratGuardar', 'madTratEstadoChange', 'madTratAreaChange',
  'madTratAddDes', 'MAD_TRAT_SHEET'];
const H = {};
const avisos = [];
const envios = [];
let respuestaVer = null;

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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
    return { ok: true, status: 200, text: async () => cuerpo };
  };
});

beforeEach(() => {
  avisos.length = 0;
  envios.length = 0;
  respuestaVer = { ok: true, version: 'abc123def456' };
  H.madTratReiniciar();
});

const q = (s) => document.querySelector('#fp-tratamientos ' + s);
const marcados = (card, cls) => [...card.querySelectorAll(cls + ':checked')].map((c) => c.value);
const pon = (el, v) => { el.value = v; return el; };

describe('Tratamientos · plantillas', () => {
  it('🔴 Producción pre-marca los preventivos y el RAS del primer preventivo; no toca la desinfección', () => {
    H.madTratEstadoChange(pon(q('#mt-estado'), 'Producción'));
    const prev = q('#mt-prevs .mt-prev');
    expect(marcados(prev, '.mt-prod')).toEqual(['Bacmil', 'Lactosac', 'Lipofeed', 'Complex B', 'Vitamina C', 'Full Calcio']);
    expect(marcados(prev, '.mt-ras')).toEqual(['Bicarbonato', 'EM-1']);
    expect(marcados(q('#mt-dess .mt-des'), '.mt-prod')).toEqual([]);
  });

  it('🔴 la agrupada marca los dos bloques y pone el área «Salas y tanques» si estaba vacía', () => {
    H.madTratEstadoChange(pon(q('#mt-estado'), 'Desinfección - Producción agrupada'));
    const des = q('#mt-dess .mt-des');
    expect(marcados(des, '.mt-prod')).toEqual(['Formol', 'Virkon', 'Cooper']);
    expect(des.querySelector('.mt-area').value).toBe('Salas y tanques');
    expect(marcados(q('#mt-prevs .mt-prev'), '.mt-prod')).toHaveLength(6);
  });

  it('🔴 un área pre-marca lo suyo sólo si la tarjeta no tiene nada marcado', () => {
    const des = q('#mt-dess .mt-des');
    H.madTratAreaChange(pon(des.querySelector('.mt-area'), 'RAS y tuberías'));
    expect(marcados(des, '.mt-prod')).toEqual(['Cloro', 'Vitamina C', 'Bicarbonato', 'Full Calcio', 'EM-1', 'Prokura']);
    des.querySelectorAll('.mt-prod').forEach((c) => { c.checked = c.value === 'Virkon'; });
    H.madTratAreaChange(pon(des.querySelector('.mt-area'), 'Salas y tanques'));
    expect(marcados(des, '.mt-prod')).toEqual(['Virkon']);
  });
});

describe('Tratamientos · guardar', () => {
  const llenar = () => {
    pon(q('#mt-fecha'), '2026-09-15');
    pon(q('#mt-sala'), 'Sala 4');
    H.madTratEstadoChange(pon(q('#mt-estado'), 'Producción'));
    pon(q('#mt-prevs .mt-lotes'), 'bp, BC');
    const des = q('#mt-dess .mt-des');
    H.madTratAreaChange(pon(des.querySelector('.mt-area'), 'Líneas de agua y aire, tinas y reservorios'));
    H.madTratAddDes();
    const des2 = document.querySelectorAll('#mt-dess .mt-des')[1];
    pon(des2.querySelector('.mt-area'), 'Desove, Eclosión y Despacho');
    des2.querySelector('.mt-prod[value="Cloro"]').checked = true;
  };

  it('🔴 una fila por tarjeta, con sala, estado y el ID de cada una', async () => {
    llenar();
    await H.madTratGuardar();
    expect(envios).toHaveLength(1);
    const { sheetName, headers, rows } = envios[0];
    expect(sheetName).toBe(H.MAD_TRAT_SHEET);
    expect(headers).toEqual(MAD_TRAT_HEADERS);
    const v = (f, h) => f[headers.indexOf(h)];
    expect(rows.map((f) => [v(f, 'Tipo'), v(f, 'Área'), v(f, 'Lotes'), v(f, 'ID')])).toEqual([
      ['Preventivo', 'Lotes', 'BC, BP', '2026-09-15-S4-P-BC.BP'],
      ['Desinfección', 'Líneas de agua y aire, tinas y reservorios', '', '2026-09-15-S4-D-LINEAS'],
      ['Desinfección', 'Desove, Eclosión y Despacho', '', '2026-09-15-S4-D-DESOVE'],
    ]);
    expect(v(rows[0], 'Productos RAS')).toBe('Bicarbonato, EM-1');
    expect(v(rows[1], 'Productos')).toBe('Formol, Cloro, Jabón neutro, Virkon, Vitamina C');
    expect(rows.every((f) => v(f, 'Estado de la sala') === 'Producción')).toBe(true);
    expect(q('#mt-prevs .mt-lotes').value).toBe('');                  // la ficha vuelve limpia
  });

  it('🔴 con el GAS VIEJO no se envía, se dice por qué y lo tecleado se queda', async () => {
    llenar();
    respuestaVer = 'FichasLarv-OK';
    await H.madTratGuardar();
    expect(envios).toHaveLength(0);
    expect((avisos.find((a) => a.tipo === 'err') || {}).msg).toMatch(/Maduración Tratamientos/);
    expect(q('#mt-prevs .mt-lotes').value).toBe('bp, BC');
  });

  it('una tarjeta a medias no se envía', async () => {
    pon(q('#mt-sala'), 'Sala 4');
    pon(q('#mt-prevs .mt-lotes'), 'BP');
    await H.madTratGuardar();
    expect(envios).toHaveLength(0);
    expect(document.getElementById('mt-report').textContent).toContain('no hay ningún producto marcado');
  });
});
