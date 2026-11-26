// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 8 (pegar y otros) de la revisión del 15-11, y el 📄 de Salas de la auditoría de B (T5.4). Motor
   REAL. T8.7 (el GAS) va con el próximo despliegue del GAS. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madGridPaste', 'trasSellarUbicacion', '_madBorrOlvidarPantalla', 'madGridPDFSalas', 'today'];
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

describe('T5.5 · pegar no escribe en tanques bloqueados ni en las Obs., y lo dice', () => {
  it('🔴', () => {
    const fp = document.getElementById('fp-tanques');
    const antes = fp.innerHTML;
    fp.innerHTML = '<input data-r="0" data-c="0" type="text" id="o"><input data-r="1" data-c="0" type="text" disabled id="b">'
      + '<input data-r="0" data-c="1" type="text" id="o2"><div data-r="0" data-c="2" class="tg-ms" id="ms"></div>';
    try {
      const ev = { clipboardData: { getData: () => 'a\tb\tc\nd' }, target: fp.querySelector('#o'), preventDefault() {} };
      H.madGridPaste(ev, 'tanques');
      expect(fp.querySelector('#o').value).toBe('a');
      expect(fp.querySelector('#b').value).toBe('');
      expect(fp.querySelector('#ms').value).toBeUndefined();
      expect(avisos.join(' ')).toMatch(/tanques bloqueados/);
      expect(avisos.join(' ')).toMatch(/caían en las Obs\./);
    } finally { fp.innerHTML = antes; }
  });
});

describe('T7.10 · la ubicación llega a su parada aunque la ficha se haya repintado', () => {
  it('🔴 con la parada fuera de pantalla, va al modelo', () => {
    const fp = document.getElementById('fp-traslado');
    const antes = fp.innerHTML;
    fp.innerHTML = '<div class="tras-rev" data-rev="0"><input data-k="hora"><input data-k="ubicacion"><span data-geo-estado></span></div>';
    let cb = null;
    const geo = navigator.geolocation;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok) => { cb = ok; } } });
    H.poner('trasGeoDisponible', () => true);
    H.poner('_trasModel', { revisiones: [{}] });
    try {
      H.trasSellarUbicacion(0);
      fp.innerHTML = '';   // se repintó / se pasó a otra parada antes de que llegara el GPS
      cb({ coords: { latitude: -2.2, longitude: -80.9, accuracy: 5 } });
      expect(H.leer('_trasModel').revisiones[0].ubicacion).toBe('-2.200000, -80.900000');
    } finally { fp.innerHTML = antes; Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo }); }
  });
});

describe('T3.6 · enviar una ✏️ corrección no borra el borrador del día del envío corregido', () => {
  it('🔴', () => {
    const olvidados = [];
    H.poner('madBorrOlvidar', (f, d) => { olvidados.push(d); });
    H.poner('_madHistCorrActiva', () => ({}));
    H.leer('_madBorrFecha').ingreso = '2026-11-25';
    H._madBorrOlvidarPantalla('ingreso', '2026-11-10');
    expect(olvidados).toEqual(['2026-11-25']);
  });
});

describe('T5.4 (auditoría de B) · el 📄 de Salas imprime el día de la grilla', () => {
  it('🔴 y no deja el filtro puesto', () => {
    let visto = null;
    H.poner('downloadMadPDF', () => { visto = JSON.stringify(H.leer('_madFilters').salas); });
    const el = document.getElementById('mad-salas-fecha') || Object.assign(document.body.appendChild(document.createElement('input')), { id: 'mad-salas-fecha' });
    el.value = '2026-11-20';
    const antes = JSON.stringify(H.leer('_madFilters').salas);
    H.madGridPDFSalas();
    expect(visto).toBe(JSON.stringify({ fecha: '2026-11-20', sala: '' }));
    expect(JSON.stringify(H.leer('_madFilters').salas)).toBe(antes);
  });
});
