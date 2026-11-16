// @vitest-environment happy-dom
/* ============================================================
   REVISIÓN COMPLETA DEL 15-11 · los arreglos de las fichas (engine.js), comprobados de forma directa.
   T4.2 «6.000» no es 6 · T2.1 Algas no da por enviado un registro sin agregar · T1.7 un OD de 0 viaja · T1.2 sólo se suelta una copia ↩
   caducada · T8.1 Blanco no deja cambiar la fecha-llave · R2-23 Mantenimiento: lo anotado cuenta · T5.2 🗑 de Tanques no quita lo que
   espera en la cola. Motor REAL. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madCifraMala', '_reconcileAlgas', 'saveE', 'loadE', 'ALGHIST_PRE', 'buildControlPayload', 'PTIMES', '_purgeOldestRecovery',
  'RPRE', 'RTTL', 'renderBlanco', 'renderMntTrabajo', 'mntTrabCampo', 'MAD_MOD', 'MNT_MOD', 'clearMadTanquesGrid', 'saveMadList', 'loadMad',
  'SYNCQ_KEY', 'today'];
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
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\ntry{ H.setBlanco=function(b){ _blancoState=b; }; }catch(_){}'
    + '\ntry{ H.setSala=function(s){ _madTanquesSala=s; }; }catch(_){}'
    + '\ntry{ H.olvidarMnt=function(){ _mntRonda=null; _mntTrab=null; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
});
beforeEach(() => { globalThis.localStorage.clear(); avisos.length = 0; window.confirm = () => true; globalThis.confirm = window.confirm; });

describe('T4.2 · el punto de miles no se toma por decimal', () => {
  it('🔴 «6.000», «1.000» y «10.000» no valen; «4», «4.0», «4.00» sí', () => {
    expect(['6.000', '1.000', '10.000'].map(H.madCifraMala)).toEqual([true, true, true]);
    expect(['4', '4.0', '4.00', ''].map(H.madCifraMala)).toEqual([false, false, false, false]);
  });
});

describe('T2.1 · Algas: un registro sin «📋 Agregar» no queda «enviado»', () => {
  const MOD = 11;
  const enviar = () => {
    localStorage.setItem(H.ALGHIST_PRE + H.today(), JSON.stringify([{ id: 'a1', data: { fecha: H.today(), cel_ml: 1 } }]));
    H._reconcileAlgas({ kind: 'alg', keys: ['a1'], mod: MOD });
  };
  it('🔴 con un registro tecleado en la ficha, la ficha sigue sin enviar y se dice', () => {
    H.saveE(MOD, 'algas', { fecha: H.today(), tec: 'X', cel_ml: 280000 }, false);
    enviar();
    expect(H.loadE(MOD, 'algas').synced).toBe(false);
    expect(avisos.some((a) => /NO se envió/.test(a)), avisos.join(' | ')).toBe(true);
  });
  it('con sólo la cabecera, se da por enviada (control)', () => {
    H.saveE(MOD, 'algas', { fecha: H.today(), tec: 'X' }, false);
    enviar();
    expect(H.loadE(MOD, 'algas').synced).toBe(true);
  });
});

describe('T1.7 · un OD de 0 es un dato', () => {
  it('🔴 la lectura con OD 0 viaja con su 0', () => {
    const t = H.PTIMES[0];
    const p = H.buildControlPayload(1, { fecha: '2026-11-10', corrida: '601', ['od_0_' + t]: 0 });
    expect(p.rows.length).toBe(1);
    expect(p.rows[0][5]).toBe(0);
  });
});

describe('T1.2 · sin espacio, sólo se suelta una copia ↩ YA caducada', () => {
  it('🔴 una copia reciente no se toca; una caducada sí', () => {
    localStorage.setItem(H.RPRE + 'M01_calidad', JSON.stringify({ ts: Date.now() - 60000, data: {} }));
    expect(H._purgeOldestRecovery()).toBeNull();
    expect(localStorage.getItem(H.RPRE + 'M01_calidad')).not.toBeNull();
    localStorage.setItem(H.RPRE + 'M01_plg', JSON.stringify({ ts: Date.now() - H.RTTL - 60000, data: {} }));
    expect(H._purgeOldestRecovery()).not.toBeNull();
    expect(localStorage.getItem(H.RPRE + 'M01_plg')).toBeNull();
  });
});

describe('T8.1 · 📝 Blanco: la fecha es la llave', () => {
  it('🔴 el campo Fecha queda de sólo lectura', () => {
    H.setVista(1, 'blanco');
    H.setBlanco({ ficha: 'calidad', histId: 'h1', data: { fecha: '2026-11-01', corrida: '601' } });
    H.renderBlanco();
    expect(document.querySelector('#fp-blanco input[type="date"][name="fecha"]').hasAttribute('readonly')).toBe(true);
  });
});

describe('R2-23 · Mantenimiento: lo anotado cuenta como «no en blanco»', () => {
  it('🔴 con sólo la hora de inicio anotada, la fecha no salta a hoy', () => {
    H.olvidarMnt();
    H.setVista(H.MNT_MOD, 'mnttrabajo'); H.renderMntTrabajo();
    const c = (k, v) => { const el = document.querySelector(`#fp-mnttrabajo [data-mk="${k}"]`); el.value = v; H.mntTrabCampo(el); };
    c('horaInicio', '08:00');
    const d = JSON.parse(localStorage.getItem('larv4_mnt_trab_borrador') || 'null') || null;
    // Simula un borrador de AYER (la fecha la puso la app): al pintar no debe moverse, porque hay algo anotado.
    const ayer = '2026-01-01';
    H.olvidarMnt();
    const k = Object.keys(localStorage).find((x) => /mnt.*trab/i.test(x) && /borr|draft/i.test(x));
    const b = JSON.parse(localStorage.getItem(k)); b.fecha = ayer; localStorage.setItem(k, JSON.stringify(b));
    H.renderMntTrabajo();
    expect(document.querySelector('#fp-mnttrabajo [data-mk="fecha"]').value).toBe(ayer);
    expect(d === null || typeof d === 'object').toBe(true);
  });
});

describe('T5.2 · 🗑 Borrar sala no quita lo que espera en la cola', () => {
  it('🔴 lo encolado se conserva y se dice', () => {
    H.setVista(H.MAD_MOD, 'tanques'); H.setSala('Sala 1');
    const fecha = H.today();
    H.saveMadList('tanques', [{ id: 't1', synced: false, data: { fecha, sala: 'Sala 1', tanque: '1' } }, { id: 't2', synced: false, data: { fecha, sala: 'Sala 1', tanque: '2' } }]);
    localStorage.setItem(H.SYNCQ_KEY, JSON.stringify([{ reqId: 'q', ts: 1, payload: {}, mark: { kind: 'mad:tanques', keys: ['t1'] } }]));
    H.clearMadTanquesGrid();
    expect(H.loadMad('tanques').map((r) => r.id)).toEqual(['t1']);
    expect(avisos.some((a) => /espera en la cola/.test(a)), avisos.join(' | ')).toBe(true);
  });
});
