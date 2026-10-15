// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · «⚠ no es hoy» CON LA HORA DE INTERNET (pauta 2.12-B, usuario, 2026-10-15)

   «Hoy» sale del reloj del equipo (`today()`): con el DÍA mal puesto, la grilla de Salas/Tanques abría en ese día y la
   marca «⚠ no es hoy» no saltaba. Servida por HTTPS, la app mide el desfase con la cabecera `Date` de un HEAD al propio
   sitio (`_relojMedir`) y, si el día del equipo no es el real, la marca manda con el real. Aquí se fija:
     · equipo un día atrasado → la grilla en su «hoy» se marca, con su título; la del día real, no; y avisa una vez;
     · reloj bien (o < 2 min de ruido) → todo como antes;
     · desfase de minutos el mismo día → no cambia la marca, pero avisa del reloj;
     · el HEAD va sin caché, al propio sitio y sin el #; en file:// o localhost no se pide nada.
   La red es simulada (fetch) y el sitio, una URL de prueba.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_relojMedir', '_relojTexto', '_relojHoy', '_madGridNoEsHoyHTML', 'today'];
const H = {};
const avisos = [];
const pedidas = [];
let fechaServidor = null;

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
  // fetch simulado: sólo contesta el HEAD de la hora; cualquier otra petición es un error de la prueba
  globalThis.fetch = window.fetch = async (url, op = {}) => {
    pedidas.push({ url: String(url), metodo: op.method, cache: op.cache });
    if (op.method !== 'HEAD') throw new Error('petición inesperada: ' + url);
    return { ok: true, status: 200, headers: { get: (k) => (/^date$/i.test(k) ? fechaServidor : null) } };
  };
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.reiniciarReloj=function(){ _relojDesfase=null; _relojMedidoEn=0; _relojAvisado=false; }; }catch(_){}'
    + '\ntry{ H.permitirMedir=function(){ _relojMedidoEn=0; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  // La medición que el motor programa AL ARRANCAR (a los 3 s) no debe colarse en mitad de una prueba (ya con la URL de
  // prueba): se carga con setTimeout falso y ese temporizador se descarta. Aquí se mide sólo a mano.
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  vi.clearAllTimers();
  vi.useRealTimers();
  H.setToast((m) => { avisos.push(String(m)); });
});

const DIA = 864e5;
const enElSitio = (url) => window.happyDOM.setURL(url);
beforeEach(() => {
  avisos.length = 0;
  pedidas.length = 0;
  H.reiniciarReloj();
  enElSitio('https://equipos.ejemplo.test/fichas/#maduracion');
});
afterEach(() => { enElSitio('http://localhost:3000/'); });
const servidorVa = (ms) => { fechaServidor = new Date(Date.now() + ms).toUTCString(); };
const diaDe = (ms) => { const n = new Date(Date.now() + ms); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };

describe('«⚠ no es hoy» con la hora de internet', () => {
  it('🔴 equipo UN DÍA atrasado: su «hoy» se marca (con su título) y el día real no; avisa del reloj una vez', async () => {
    servidorVa(DIA);
    await H._relojMedir();
    const real = diaDe(DIA);
    expect(H._relojHoy()).toBe(real);
    const marca = H._madGridNoEsHoyHTML('tanques', H.today());
    expect(marca, 'la grilla en el día del equipo no avisa').toContain('no es hoy');
    expect(marca).toContain('El reloj de este equipo marca otro día (hoy es ' + real + ' según internet)');
    expect(marca).toContain('id="mad-tanques-noeshoy"');
    expect(H._madGridNoEsHoyHTML('tanques', real), 'el día REAL se marca como si no fuera hoy').toBe('');
    expect(avisos.filter((a) => /reloj de este equipo va 1 día\(s\) atrasado/.test(a))).toHaveLength(1);
    H.permitirMedir();                 // otra medición en la MISMA sesión (al volver a la app, pasados 10 min)…
    await H._relojMedir();
    expect(pedidas).toHaveLength(2);
    expect(avisos, 'avisó del reloj otra vez en la misma sesión').toHaveLength(1);   // …no repite el aviso
  });

  it('reloj bien (o con menos de 2 min de diferencia): todo como antes, sin aviso', async () => {
    servidorVa(60000);
    await H._relojMedir();
    expect(H._relojHoy()).toBe(null);
    expect(H._madGridNoEsHoyHTML('salas', H.today())).toBe('');
    expect(H._madGridNoEsHoyHTML('salas', '2026-01-01')).toContain('La fecha de esta grilla no es la de hoy');
    expect(avisos).toHaveLength(0);
  });

  it('desfase de minutos el MISMO día: la marca no cambia, pero avisa del reloj', async () => {
    servidorVa(-10 * 60000);
    await H._relojMedir();
    if (diaDe(-10 * 60000) === H.today()) expect(H._madGridNoEsHoyHTML('tanques', H.today())).toBe('');
    expect(avisos.some((a) => /va 10 min adelantado/.test(a))).toBe(true);
  });

  it('el HEAD va sin caché, al propio sitio y sin el #; en file:// o localhost no se pide nada', async () => {
    servidorVa(0);
    await H._relojMedir();
    expect(pedidas).toEqual([{ url: 'https://equipos.ejemplo.test/fichas/', metodo: 'HEAD', cache: 'no-store' }]);
    await H._relojMedir();
    expect(pedidas, 'mide otra vez antes de 10 min').toHaveLength(1);
    for (const url of ['file:///C:/Users/x/index%20(8).html', 'http://localhost:5173/', 'http://127.0.0.1:4173/']) {
      H.reiniciarReloj(); pedidas.length = 0; enElSitio(url);
      await H._relojMedir();
      expect(pedidas, 'pidió la hora en ' + url).toHaveLength(0);
    }
  });

  it('textos del desfase', () => {
    expect(H._relojTexto(3 * 60000)).toBe('3 min atrasado');
    expect(H._relojTexto(-2 * 36e5)).toBe('2 h adelantado');
    expect(H._relojTexto(DIA)).toBe('1 día(s) atrasado');
    // 🔴 la cabecera va en SEGUNDOS: un día medido sale unos ms corto, y decía «24 h» (lo cazó esta misma prueba, 1 de 6)
    expect(H._relojTexto(DIA - 400)).toBe('1 día(s) atrasado');
    expect(H._relojTexto(-(36e5 - 10000))).toBe('1 h adelantado');
    expect(H._relojTexto(59 * 60000)).toBe('59 min atrasado');
  });
});
