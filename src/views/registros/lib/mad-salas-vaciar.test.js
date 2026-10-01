// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · SALAS · una lectura BORRADA en la grilla se guarda borrada (usuario, 2026-10-01, auditoría de Maduración)

   LO QUE PASABA: la fusión (`_madMergeRow`) no deja que una celda vacía pise lo guardado, así que, tras un autoguardado
   (cambiar de fecha o de pestaña), borrar una lectura mal tecleada no la quitaba y se enviaba igual — lo mismo que se
   arregló en Tanques (punto 5 · A). DECISIÓN DEL USUARIO: «como en Tanques»: en la grilla PINTADA para ese día, una celda
   VACÍA de verdad se guarda vacía; una temperatura FUERA de rango (no se guarda) no borra la anterior; «Toneladas» no se
   toca (se rellena sola con el catálogo); llevar lo tecleado a otro día no vacía nada; y si la fila ya se envió, la hoja
   conserva el valor (el GAS no vacía celdas): se AVISA para borrarlo allí.

   Arnés: el de mad-tanques-vaciar.test.js. ⚠ Sólo celdas de NÚMERO y de texto: happy-dom lee mal un <select> pintado con
   innerHTML (Estado y RAS), y daría un falso «borrado».
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSalas', 'madSalasFechaChange', 'saveMadSalasGrid', 'syncMadSalasGrid', 'loadMad',
  'saveMadList', '_gasVersionLocal', 'MAD_MOD', 'today', 'MAD_SALA_OPTS', '_madGridDiaDeLaApp'];
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

const HOY = () => H._madGridDiaDeLaApp();   // el día en que la app abre la grilla (antes de las 02:00, el que termina)
const AYER = '2026-09-14';
const celS = (si, k) => document.querySelector('#fp-salas [name="sg_' + si + '_' + k + '"]');
const ponerS = (si, k, v) => { const e = celS(si, k); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); };
const fila = (fecha, si) => H.loadMad('salas').find((r) => r.data.fecha === fecha && r.data.sala === H.MAD_SALA_OPTS[si]);
const abrir = () => { document.getElementById('fp-salas').innerHTML = ''; H.renderMadSalas(); };
/** Guardar en silencio (lo que hace la navegación) y volver a pintar la grilla: el caso de «tras un autoguardado». */
const autoguardar = () => { H.saveMadSalasGrid({ silent: true }); H.renderMadSalas(); };

beforeEach(() => {
  localStorage.clear();
  envios.length = 0; avisos.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
  H.setVista(H.MAD_MOD, 'salas');
  abrir();
});
afterEach(() => { vi.useRealTimers(); });

describe('Salas · una lectura BORRADA en la grilla se guarda borrada', () => {
  it('🔴 el caso: tras un autoguardado, borrar una temperatura y 💾 → se guarda vacía (la otra sigue) y queda pendiente', () => {
    ponerS(0, 'temp_02', '28.5');
    ponerS(0, 'temp_04', '28.7');
    autoguardar();
    expect(celS(0, 'temp_04').value, 'el fixture ejerce algo: la lectura se repinta').toBe('28.7');
    ponerS(0, 'temp_04', '');
    H.saveMadSalasGrid();
    const r = fila(HOY(), 0);
    expect([r.data.temp_02, r.data.temp_04], 'la lectura borrada sigue guardada').toEqual([28.5, '']);
    expect(r.synced).toBe(false);
  });

  it('🔴 una sala vaciada DEL TODO también (su única lectura)', () => {
    ponerS(1, 'ox_06', '5.1');
    autoguardar();
    ponerS(1, 'ox_06', '');
    H.saveMadSalasGrid({ silent: true });
    expect(fila(HOY(), 1).data.ox_06, 'la lectura de la sala vaciada sigue').toBe('');
  });

  it('🔴 si la fila ya se ENVIÓ, se guarda vacía y AVISA de que en la hoja sigue (el GAS no vacía celdas)', () => {
    ponerS(2, 'temp_06', '27.9');
    autoguardar();
    H.saveMadList('salas', H.loadMad('salas').map((r) => Object.assign(r, { synced: true, syncedAt: 1 })));
    H.renderMadSalas();
    ponerS(2, 'temp_06', '');
    avisos.length = 0;
    H.saveMadSalasGrid({ silent: true });
    expect(fila(HOY(), 2).data.temp_06).toBe('');
    expect(fila(HOY(), 2).synced, 'se reenviaría para nada: el GAS no vacía la celda con un envío vacío').toBe(true);
    const a = avisos.find((x) => /ya estaban en la hoja/.test(x.msg));
    expect(a, 'no avisa de que en la hoja sigue').toBeTruthy();
    expect(a.msg).toContain(H.MAD_SALA_OPTS[2]);
  });

  it('una temperatura FUERA de rango no se guarda y NO borra la anterior', () => {
    ponerS(0, 'temp_02', '28');
    autoguardar();
    ponerS(0, 'temp_02', '50');
    H.saveMadSalasGrid({ silent: true });
    expect(fila(HOY(), 0).data.temp_02, 'el valor fuera de rango borró la lectura anterior').toBe(28);
  });

  it('lo que nunca se tecleó sigue vacío, «Toneladas» no se toca y una fila no enviada no avisa', () => {
    ponerS(3, 'temp_08', '28.2');
    autoguardar();
    const ton = fila(HOY(), 3).data.toneladas;
    H.saveMadSalasGrid({ silent: true });
    const d = fila(HOY(), 3).data;
    expect([d.temp_08, d.temp_10, d.ox_00, d.toneladas]).toEqual([28.2, '', '', ton]);
    expect(avisos.some((x) => /ya estaban en la hoja/.test(x.msg))).toBe(false);
  });

  it('🔴 llevar lo tecleado a OTRO día no vacía lo que ese día ya tenía', () => {
    H.saveMadList('salas', [{ id: 'y1', ts: 1, synced: false, syncedAt: null,
      data: { fecha: AYER, sala: H.MAD_SALA_OPTS[0], estado: '', estado_lote: '', ras: '', toneladas: '', temp_02: 27 } }]);
    abrir();
    ponerS(0, 'temp_04', '28');
    document.getElementById('mad-salas-fecha').value = AYER;
    H.madSalasFechaChange();
    const d = fila(AYER, 0).data;
    expect([d.temp_02, d.temp_04], 'lo del día de destino se vació al llevar').toEqual([27, 28]);
  });
});
