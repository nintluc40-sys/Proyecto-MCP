// @vitest-environment happy-dom
/* ============================================================
   🔧 MANTENIMIENTO · LA FICHA SIGUIENTE SIGUE AL RELOJ (punto 23 de la pauta del 2026-11-12, la parte de Mantenimiento)

   Al guardar una ronda o un trabajo, la ficha siguiente se prepara EN ESE MOMENTO, con su fecha (y en la ronda, su hora), y se queda
   en el borrador. La ronda siguiente, hecha horas o días después, salía con la fecha y la hora del guardado anterior si nadie las
   cambiaba (medido en el código el 15-11: `_mntRegistrar` → `_mntRondaNueva`/`_mntTrabNuevo`).
   Decisión del usuario: «Que siga al reloj» — mientras la ficha esté en blanco, al abrirla toma la fecha y la hora de ese momento;
   en cuanto se anota algo, o se cambian la fecha o la hora a mano, se respeta lo puesto.

   El reloj se mueve con `vi.setSystemTime` (horas LOCALES: `today()` usa la fecha local). Motor REAL. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMntRonda', 'renderMntTrabajo', 'mntRondaCampo', 'mntRondaCelda', 'mntTrabCampo', 'mntRondaGuardar', 'mntTrabGuardar',
  'mntRondaAbrirEl', 'loadMntRondas', 'loadMntTrabajos', 'buildMntRondaPayload', 'mntRondaNueva'];
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
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.olvidar=function(){ _mntRonda=null; _mntTrab=null; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { H.ultimoAviso = m; });
});

/* El ID de cada ficha lleva la hora en que nace: con el reloj quieto, la que se prepara al guardar tendría el MISMO ID que la guardada.
   Por eso la ficha se monta un minuto antes (ANTES) y se guarda a las 08:00 (DIA1). */
const ANTES = new Date(2026, 10, 14, 7, 59);
const DIA1 = new Date(2026, 10, 14, 8, 0);    // 14/11 08:00, hora local
const DIA2 = new Date(2026, 10, 15, 9, 30);   // 15/11 09:30
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ANTES);
  globalThis.localStorage.clear();
  H.olvidar();
  window.confirm = () => true;
  H.renderMntRonda();
  H.renderMntTrabajo();
});
afterEach(() => { vi.useRealTimers(); });

const $ = (s) => document.querySelector(s);
/** Teclea como el técnico: el valor y el manejador que nombra SU atributo (el motor corre en new Function). */
const teclear = (sel, v) => {
  const el = $(sel);
  expect(el, 'no está ' + sel).toBeTruthy();
  el.value = v;
  const fn = /^(\w+)\(this\)$/.exec(el.getAttribute(el.tagName === 'SELECT' ? 'onchange' : 'oninput') || '');
  H[fn[1]](el);
};
const ronda = (k) => '#fp-mntronda [data-mk="' + k + '"]:not([data-mq])';
const celda = (eq, k) => '#fp-mntronda input[data-mq="' + eq + '"][data-mk="' + k + '"]';
const trab = (k) => '#fp-mnttrabajo [data-mk="' + k + '"]';
const guardarRonda = () => { teclear(celda('BLW-01', 'horometro'), '702,40'); vi.setSystemTime(DIA1); H.mntRondaGuardar(); expect(H.loadMntRondas()).toHaveLength(1); };

describe('🔧 Ronda', () => {
  it('🔴 guardada un día, la siguiente se abre al otro con la fecha y la hora de ESE momento', () => {
    guardarRonda();
    expect([$(ronda('fecha')).value, $(ronda('hora')).value], 'recién guardada, la nueva es de ahora (control)').toEqual(['2026-11-14', '08:00']);
    vi.setSystemTime(DIA2);
    H.renderMntRonda();
    expect([$(ronda('fecha')).value, $(ronda('hora')).value], 'salió con la fecha y la hora del guardado anterior').toEqual(['2026-11-15', '09:30']);
  });

  it('con la fecha puesta A MANO, se respeta aunque esté en blanco', () => {
    guardarRonda();
    teclear(ronda('fecha'), '2026-11-10');
    vi.setSystemTime(DIA2);
    H.renderMntRonda();
    expect($(ronda('fecha')).value).toBe('2026-11-10');
  });

  it('con algo anotado, se respeta su fecha', () => {
    guardarRonda();
    teclear(celda('BLW-02', 'horometro'), '1028');
    vi.setSystemTime(DIA2);
    H.renderMntRonda();
    expect($(ronda('fecha')).value).toBe('2026-11-14');
  });

  it('una guardada abierta con ✏️ y vaciada (para anularla) conserva su fecha: no se toma por una en blanco', () => {
    guardarRonda();
    H.mntRondaAbrirEl(document.querySelector('#fp-mntronda button[data-mnt-id][onclick*="Abrir"]'));
    teclear(celda('BLW-01', 'horometro'), '');
    vi.setSystemTime(DIA2);
    H.renderMntRonda();
    expect($(ronda('fecha')).value, 'la ronda guardada pasó a ser de otro día').toBe('2026-11-14');
  });

  it('la marca de «puesta a mano» no viaja: ni al registro ni a la hoja', () => {
    teclear(ronda('fecha'), '2026-11-13');
    guardarRonda();
    const r = H.loadMntRondas()[0];
    expect(r.data.fecha).toBe('2026-11-13');
    expect(Object.keys(r.data)).not.toContain('_aMano');
    expect(JSON.stringify(H.buildMntRondaPayload([r]))).not.toContain('_aMano');
  });

  it('volver a poner la MISMA fecha en una guardada abierta con ✏️ no la deja «sin guardar»: «Nueva» no pregunta', () => {
    guardarRonda();
    H.mntRondaAbrirEl(document.querySelector('#fp-mntronda button[data-mnt-id][onclick*="Abrir"]'));
    teclear(ronda('fecha'), $(ronda('fecha')).value);   // la marca de «a mano», sin cambiar nada
    let preguntas = 0;
    window.confirm = () => { preguntas++; return true; };
    H.mntRondaNueva();
    expect(preguntas, 'la marca interna cuenta como un cambio sin guardar').toBe(0);
  });
});

describe('🔧 Trabajo', () => {
  const completo = () => {
    teclear(trab('equipo'), 'BLW-03'); teclear(trab('tipo'), 'Preventivo'); teclear(trab('actividad'), 'Cambio de aceite'); teclear(trab('horometro'), '927,30');
  };

  it('🔴 guardado un día, el siguiente se abre al otro con la fecha de ese día', () => {
    completo();
    vi.setSystemTime(DIA1);
    H.mntTrabGuardar();
    expect(H.loadMntTrabajos()).toHaveLength(1);
    expect($(trab('fecha')).value).toBe('2026-11-14');
    vi.setSystemTime(DIA2);
    H.renderMntTrabajo();
    expect($(trab('fecha')).value, 'salió con la fecha del guardado anterior').toBe('2026-11-15');
  });

  it('con la fecha puesta a mano, o con algo anotado, se respeta', () => {
    teclear(trab('fecha'), '2026-11-12');
    vi.setSystemTime(DIA2);
    H.renderMntTrabajo();
    expect($(trab('fecha')).value).toBe('2026-11-12');
    H.olvidar(); localStorage.clear();
    vi.setSystemTime(ANTES);
    H.renderMntTrabajo();
    teclear(trab('equipo'), 'BLW-03');
    vi.setSystemTime(DIA2);
    H.renderMntTrabajo();
    expect($(trab('fecha')).value).toBe('2026-11-14');
  });
});
