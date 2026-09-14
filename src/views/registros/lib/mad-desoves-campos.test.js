// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · DESOVES · el formulario tras los cambios del 2026-09-14, y por qué el envío
   pregunta antes al GAS

   · «No viables (miles)» → «Hembras no viables»: reproductoras que estaban maduras y NO
     desovaron. Conteo de animales como «Desoves»: sin ×1000.

   🔴🔴 LA HOJA EN USO. «Maduración Lotes» se escribe POR POSICIÓN (llave [0,1,2]) y ya tiene
   una fila. El GAS NUEVO rechaza un envío cuyas cabeceras no casan con la hoja (guarda de
   esquema) y no escribe nada; el GAS PUBLICADO HOY no tiene esa guarda y escribiría cada dato en
   la columna que la hoja vieja tuviera en esa posición. Por eso esta hoja entra en la misma
   protección que el Ingreso: el cliente pregunta a `?p=ver` antes de enviar (y la cola antes de
   entregar), y contra el GAS viejo no envía.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_DESOVE_HEADERS } from './ficha-maduracion-desoves.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesReiniciar', 'madDesCollect', 'buildMadDesovePayload', 'madDesGuardar', 'flushSyncQueue', 'MAD_DESOVE_SHEET'];
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
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setPostOnce(async (body) => { envios.push(body); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    if (respuestaVer === 'red') throw new Error('sin red');
    const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
    return { ok: true, status: 200, text: async () => cuerpo };
  };
});

beforeEach(() => {
  avisos.length = 0;
  envios.length = 0;
  respuestaVer = { ok: true, version: 'abc123def456' };
  H.madDesReiniciar();
});

const q = (s) => document.querySelector('#fp-desoves ' + s);
const col = (h) => MAD_DESOVE_HEADERS.indexOf(h);
const llenar = () => {
  document.getElementById('md-fecha').value = '2026-09-14';
  q('.md-lote').value = 'BP';
  q('.md-cg').value = 'OLF5.F2';
  q('.md-desoves').value = '64';
  q('.md-hnoviables').value = '9';
};

describe('Desoves · Hembras no viables en el formulario', () => {
  it('🔴 «No viables (miles)» ya no está; está «Hembras no viables», sin «(miles)»', () => {
    const txt = document.getElementById('fp-desoves').textContent;
    expect(txt).not.toContain('No viables (miles)');
    expect(txt).toContain('Hembras no viables');
    expect(q('.md-noviables')).toBeNull();
    expect(q('.md-hnoviables').getAttribute('type')).toBe('number');
  });

  it('🔴 el viaje: 9 hembras no viables llegan como 9 (no 9000)', () => {
    llenar();
    const p = H.buildMadDesovePayload(H.madDesCollect());
    expect(p.headers).toEqual(MAD_DESOVE_HEADERS);
    expect(p.rows[0][col('Hembras no viables')]).toBe(9);
    expect(p.rows[0][col('Desoves')]).toBe(64);
  });
});

describe('Desoves · no se escribe contra el GAS viejo (hoja por posición)', () => {
  it('el fixture ejerce algo: con el GAS nuevo el desove SE ENVÍA', async () => {
    llenar();
    await H.madDesGuardar();
    expect(envios).toHaveLength(1);
    expect(envios[0].sheetName).toBe(H.MAD_DESOVE_SHEET);
  });

  it('🔴 con el GAS VIEJO no se envía, se dice por qué y lo tecleado se queda', async () => {
    llenar();
    respuestaVer = 'FichasLarv-OK';
    await H.madDesGuardar();
    expect(envios).toHaveLength(0);
    const err = avisos.find((a) => a.tipo === 'err');
    expect(err && err.msg).toMatch(/GAS/);
    expect(q('.md-hnoviables').value).toBe('9');
  });

  it('sin respuesta del GAS sigue el camino de siempre', async () => {
    llenar();
    respuestaVer = 'red';
    await H.madDesGuardar();
    expect(envios).toHaveLength(1);
  });

  it('🔴 la COLA tampoco entrega un desove al GAS viejo', async () => {
    localStorage.setItem('larv4_syncqueue', JSON.stringify([
      { ts: Date.now(), url: 'https://script.google.com/macros/s/AKfycbPRUEBA/exec', payload: { sheetName: H.MAD_DESOVE_SHEET, headers: ['A'], rows: [['x']] } },
    ]));
    respuestaVer = 'FichasLarv-OK';
    await H.flushSyncQueue();
    expect(envios).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]')).toHaveLength(1);
    localStorage.removeItem('larv4_syncqueue');
  });
});
