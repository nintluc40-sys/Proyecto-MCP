// @vitest-environment happy-dom
/* ============================================================
   FECHAS QUE NO EXISTEN (punto 27 de la pauta del 2026-11-12)

   Medido en Chrome (es-EC) el 13-11: en un <input type="date">, 30/02/2026 o 31/11/2026 TECLEADOS se ven escritos, pero el valor
   del campo es "" y `validity.badInput` es true. Quien sólo mira el valor cree que está vacío:
   · Larvicultura (sus 7 fichas) guardaba la ficha sin fecha y el envío tomaba la de OTRA ficha o la de HOY; desde 📝 Blanco —que
     corrige días pasados— los datos del día viejo PISABAN la fila de hoy de esos tanques. Decisión del usuario: «Bloquear y decirlo».
   · Score, Mantenimiento y Traslado bloqueaban diciendo «falta la fecha» con la fecha a la vista: ahora dicen que no existe.
     Score y Auditoría, además, sólo miraban la forma aaaa-mm-dd: ahora, un día real.
   · Mareas (texto) aceptaba «31/02/2026» y lo mandaba como «2026-02-31», y lo que no entendía lo mandaba como texto. Decisión
     del usuario: «Bloquear las dos».

   happy-dom no simula `badInput`: se fija a mano en el campo (valor "" y validity.badInput), que es lo que da Chrome.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['AST_MOD', 'MNT_MOD', 'FECHA_NO_EXISTE', 'renderFicha', 'localSave', 'localSync', 'loadE', 'renderBlanco', 'syncBlanco',
  'renderScore', 'scoreValidar', 'renderMntTrabajo', 'renderMntRonda', 'mntValidarTrabajo', 'mntValidarRonda',
  'mntTrabGuardar', 'mntRondaGuardar', 'loadMntTrabajos', 'loadMntRondas',
  'renderTraslado', 'validarTraslado', '_trasValidarParcial', 'audValidar', 'renderMarea', 'syncMareaGrid', 'mareaFechaIso', 'MAREA_SHEET',
  '_gasVersionLocal', '_lastSyncFingerprint'];
const H = {};
const avisos = [];
const envios = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')),
    renderCalidadFicha: (await import('../fichas/calidad.render.js')).renderCalidadFicha,
    resolveCalidadData: (await import('../fichas/calidad.data.js')).resolveCalidadData };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setBlanco=function(b){ _blancoState=b; }; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
  };
});

beforeEach(() => {
  globalThis.localStorage.clear();
  avisos.length = 0;
  envios.length = 0;
  H._lastSyncFingerprint.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
});
afterEach(() => { vi.useRealTimers(); });

/** Lo que da Chrome con 30/02 tecleado: se ve escrita, pero el valor es "" y `badInput`. */
const imposible = (el) => {
  expect(el, 'no está el campo de fecha').toBeTruthy();
  el.value = '';
  Object.defineProperty(el, 'validity', { configurable: true, value: { badInput: true, valid: false } });
};
const teclear = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const aviso = (re) => avisos.some((a) => re.test(a));

describe('Larvicultura · una ficha sin fecha válida no se guarda ni se envía (y lo dice)', () => {
  const fp = () => document.getElementById('fp-calidad');
  const fecha = () => fp().querySelector('input[type="date"][name="fecha"]');
  const llenar = () => {
    teclear(fp().querySelector('input[type="number"][name]'), '4');
    const co = fp().querySelector('[name="corrida"]'); if (co) teclear(co, '601');
    const te = fp().querySelector('[name="tec"]'); if (te) teclear(te, 'Prueba');
  };
  beforeEach(() => { H.setVista(1, 'calidad'); H.renderFicha('calidad'); });

  it('🔴 💾 con una fecha que no existe: no guarda y dice que no existe', () => {
    llenar();
    imposible(fecha());
    H.localSave('calidad');
    expect(H.loadE(1, 'calidad'), 'se guardó sin fecha').toBeFalsy();
    expect(aviso(/Calidad Larvaria: la fecha no existe/), avisos.join(' | ')).toBe(true);
  });

  it('🔴 ☁️ con una fecha que no existe: no envía (antes salía con la fecha de HOY)', async () => {
    llenar();
    imposible(fecha());
    await H.localSync('calidad');
    expect(envios, 'se envió con otra fecha').toHaveLength(0);
    expect(aviso(/No se guardó ni se envió/)).toBe(true);
  });

  it('🔴 con la fecha borrada: «falta la fecha» y tampoco sale', async () => {
    llenar();
    fecha().value = '';
    await H.localSync('calidad');
    expect(envios).toHaveLength(0);
    expect(aviso(/Calidad Larvaria: falta la fecha/)).toBe(true);
  });

  it('con una fecha buena, lo de siempre: se guarda', () => {
    llenar();
    fecha().value = '2026-11-12';
    H.localSave('calidad');
    expect(H.loadE(1, 'calidad').data.fecha).toBe('2026-11-12');
  });
});

describe('📝 Blanco · la corrección de un día pasado no puede salir sin su fecha', () => {
  beforeEach(() => {
    H.setVista(1, 'blanco');
    H.setBlanco({ ficha: 'calidad', histId: 'h1', data: { fecha: '2026-11-01', corrida: '601', tec: 'Prueba', mo_0: '5' } });   // con un dato de tanque: sin él no hay fila que enviar
    H.renderBlanco();
  });

  it('🔴 con una fecha que no existe no se envía (antes pisaba la fila de HOY de esos tanques)', async () => {
    imposible(document.querySelector('#fp-blanco input[type="date"][name="fecha"]'));
    await H.syncBlanco();
    expect(envios, 'se envió con la fecha de otra ficha').toHaveLength(0);
    expect(aviso(/Blanco: la fecha no existe/)).toBe(true);
  });

  it('con su fecha, sale con ESA fecha', async () => {
    await H.syncBlanco();
    expect(envios.length).toBeGreaterThan(0);
    expect(envios.flatMap((b) => b.rows).every((r) => r[0] === '2026-11-01'), JSON.stringify(envios.map((b) => b.rows[0]))).toBe(true);
  });
});

describe('Score, Mantenimiento y Traslado · «la fecha no existe», no «falta la fecha»', () => {
  it('🔴 Score', () => {
    H.setVista(H.AST_MOD, 'score'); H.renderScore();
    imposible(document.querySelector('#fp-score [data-sk="fecha"]'));
    expect(H.scoreValidar({ fecha: '', modulo: 'M01', corrida: '601', tanques: {} })).toContain(H.FECHA_NO_EXISTE);
  });

  it('🔴 Score: una fecha imposible en el modelo no pasa por tener la forma aaaa-mm-dd', () => {
    const err = H.scoreValidar({ fecha: '2026-02-30', modulo: 'M01', corrida: '601', tanques: {} });
    expect(err.some((e) => /la fecha/.test(e)), err.join(' · ')).toBe(true);
  });

  it('🔴 Mantenimiento · 💾 de un trabajo y de una ronda: no guarda y dice que no existe', () => {
    H.setVista(H.MNT_MOD, 'mnttrabajo'); H.renderMntTrabajo(); H.renderMntRonda();
    // De uno en uno: cada 💾 tiene que mirar SU campo (con los dos marcados, mirar el otro no se notaría).
    imposible(document.querySelector('#fp-mnttrabajo [data-mk="fecha"]'));
    H.mntTrabGuardar();
    expect(avisos.at(-1)).toContain(H.FECHA_NO_EXISTE);
    avisos.length = 0;
    imposible(document.querySelector('#fp-mntronda [data-mk="fecha"]'));
    H.mntRondaGuardar();
    expect(avisos.at(-1)).toContain(H.FECHA_NO_EXISTE);
    expect(H.loadMntTrabajos().length + H.loadMntRondas().length).toBe(0);
  });

  it('Mantenimiento: los validadores siguen iguales a su módulo (sin campo, «falta la fecha»)', () => {
    expect(H.mntValidarRonda({ fecha: '' })).toContain('falta la fecha');
  });

  it('🔴 Traslado · guardar y enviar', () => {
    H.setVista(H.AST_MOD, 'traslado'); H.renderTraslado();
    imposible(document.querySelector('#fp-traslado .mad-form > .meta [data-k="fecha"]'));
    expect(H.validarTraslado({ fecha: '' })).toContain('La fecha de entrega no existe (revisa el día y el mes)');
    expect(H._trasValidarParcial({ fecha: '' })).toContain('la fecha de entrega no existe (revisa el día y el mes)');
  });

  it('sin nada tecleado, sigue diciendo que falta', () => {
    H.setVista(H.AST_MOD, 'traslado'); H.renderTraslado();
    expect(H.validarTraslado({ fecha: '' })).toContain('Falta la fecha de entrega');
  });

  it('🔴 Auditoría: la fecha de una fila tiene que ser un día real', () => {
    const fila = { modulo: 'M01', tanque: 1, fecha: '2026-02-30', cantidad: '1000', siembra: '1ª' };
    const err = H.audValidar({ corrida: '601', modulo: 'M01', siembras: [fila] });
    expect(err.some((e) => /Siembra 1/.test(e)), err.join(' · ')).toBe(true);
  });
});

describe('🌊 Mareas · ☁️ no envía una fecha que no existe ni una que no se entiende', () => {
  const c = (n, k) => document.querySelector('#fp-marea input[name="mg_' + n + '_' + k + '"]');
  beforeEach(() => { H.setVista(H.AST_MOD, 'marea'); H.renderMarea(); });

  it('🔴 «31/02/2026» ya no se convierte en «2026-02-31»', () => {
    expect(H.mareaFechaIso('31/02/2026')).toBe('31/02/2026');
    expect(H.mareaFechaIso('2026-02-31')).toBe('2026-02-31');
    expect(H.mareaFechaIso('2026-2-31'), 'se reescribía con forma de fecha buena').toBe('2026-2-31');
    expect(H.mareaFechaIso('2026-2-3')).toBe('2026-02-03');
    expect(H.mareaFechaIso('12/11/2026')).toBe('2026-11-12');
    expect(H.mareaFechaIso('29/02/2028')).toBe('2028-02-29');
  });

  it.each([['31/02/2026'], ['mañana'], ['12-nov']])('🔴 una fila con «%s»: no se envía nada y se dice cuál', async (malo) => {
    teclear(c(1, 'fecha'), '12/11/2026'); teclear(c(1, 'p1'), '08:15');
    teclear(c(2, 'fecha'), malo); teclear(c(2, 'p1'), '09:20');
    await H.syncMareaGrid();
    expect(envios.filter((b) => b.sheetName === H.MAREA_SHEET), 'se envió con una fecha que no es un día').toHaveLength(0);
    expect(aviso(new RegExp('«' + malo + '»')), avisos.join(' | ')).toBe(true);
  });

  it('con fechas buenas, lo de siempre: sale en ISO', async () => {
    teclear(c(1, 'fecha'), '12/11/2026'); teclear(c(1, 'p1'), '08:15');
    await H.syncMareaGrid();
    const [b] = envios.filter((x) => x.sheetName === H.MAREA_SHEET);
    expect(b && b.rows[0][0]).toBe('2026-11-12');
  });
});
