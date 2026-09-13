// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · LA MEMORIA DEL ÚLTIMO LOTE POR TANQUE, RETIRADA (D7, 2026-09-13)

   `getMadLote` / `setMadLote` / `loadMadLoteMem` recordaban, 70 días, el último Lote tecleado
   en cada tanque para prellenar la grilla diaria. Quedaron INERTES el 2026-09-08, cuando la
   grilla de Tanques dejó de capturar el Lote (lo declara el Ingreso): `getMadLote` perdió sus
   llamadores y `setMadLote` sólo se llamaba «si llega un lote», que ya no llega nunca. Se dejó
   entonces a propósito, porque ese mismo turno ya había producido dos defectos por borrar de
   más. El usuario pidió quitarlo si no afecta a nada, y se midió que no.

   Lo que fija esta prueba:
     · que no vuelve ningún rastro al motor (un gemelo a medias es la enfermedad de este repo);
     · que la clave que dejó en cada dispositivo se BORRA al arrancar, sin tocar las fichas de
       Maduración que viven bajo el mismo prefijo —esa limpieza pisa terreno ajeno si se equivoca—;
     · que la grilla de Tanques sigue guardando igual.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const src = readFileSync(ENGINE, 'utf8');
const EXPORTAR = ['cleanup', 'loadMad', 'renderMadTanques', 'madTanquesSalaChange', 'saveMadTanquesGrid',
  'recoverMadGrid', 'MAD_RECOV_KEY'];
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
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', src + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

beforeEach(() => { localStorage.clear(); });

describe('Maduración · la memoria de lotes ya no existe (D7)', () => {
  it('no queda ningún rastro en el motor', () => {
    for (const rastro of ['getMadLote', 'setMadLote', 'loadMadLoteMem', 'MADLOTE_KEY', 'MADLOTE_TTL']) {
      expect(src, rastro).not.toContain(rastro);
    }
  });

  it('🔑 al arrancar se borra la clave que dejó en el dispositivo, y NADA más de Maduración', () => {
    localStorage.setItem('larv4_mad_lotemem', JSON.stringify({ 'Sala 4|1': { lote: 'BP', ts: Date.now() } }));
    localStorage.setItem('larv4_mad_tanques', JSON.stringify([{ id: 'x', data: { fecha: '2026-09-13' } }]));
    localStorage.setItem('larv4_mad_salas', JSON.stringify([{ id: 'y', data: { fecha: '2026-09-13' } }]));
    localStorage.setItem('larv4_lotemem', JSON.stringify({ '1|3': { lote: 7, ts: Date.now() } }));   // la de las fichas estándar, que SÍ se usa
    H.cleanup();
    expect(localStorage.getItem('larv4_mad_lotemem')).toBe(null);
    expect(localStorage.getItem('larv4_mad_tanques')).not.toBe(null);
    expect(localStorage.getItem('larv4_mad_salas')).not.toBe(null);
    expect(localStorage.getItem('larv4_lotemem')).not.toBe(null);
  });

  it('la grilla de Tanques sigue guardando, y no vuelve a escribir la clave retirada', () => {
    H.renderMadTanques();
    document.getElementById('mad-tanques-sala').value = 'Sala 4';
    H.madTanquesSalaChange();
    document.querySelector('[name="tg_1_muda"]').value = '2';
    expect(H.saveMadTanquesGrid({ silent: true })).toBe(1);
    const guardadas = H.loadMad('tanques');
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].data.muda).toBe(2);
    expect(localStorage.getItem('larv4_mad_lotemem')).toBe(null);
  });

  it('recuperar el autoguardado de Tanques sigue funcionando, también uno de la versión anterior con Lote', () => {
    /* recoverMadGrid es una de las dos funciones que perdieron la llamada retirada, y ninguna
       prueba la ejercía. El autoguardado dura 1 h, así que en un dispositivo recién actualizado
       puede quedar uno escrito por la versión anterior, con el Lote dentro. */
    globalThis.confirm = () => true;
    localStorage.setItem(H.MAD_RECOV_KEY, JSON.stringify({ ficha: 'tanques', sala: 'Sala 4', fecha: '2026-09-13', ts: Date.now(),
      rows: [{ fecha: '2026-09-13', sala: 'Sala 4', tanque: 1, lote: 'BP', muda: 3 }] }));
    H.recoverMadGrid();
    const guardadas = H.loadMad('tanques');
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].data.muda).toBe(3);
    expect(localStorage.getItem(H.MAD_RECOV_KEY)).toBe(null);          // el autoguardado se consume
    expect(localStorage.getItem('larv4_mad_lotemem')).toBe(null);      // y no resucita la clave retirada
  });
});
