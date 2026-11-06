// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · 🧹 EL ESPACIO DEL NAVEGADOR (usuario, 2026-11-03)

   LO QUE PASABA: las tablets dejaron de guardar en 🛢 Tanques con «Este navegador NO está guardando los datos…». El navegador
   da a cada sitio ~5,24 millones de caracteres, y Salas, Tanques y Zonas no caducaban nunca. Medido en Chrome con el almacén
   lleno: 💾 borraba de la pantalla lo recién tecleado, y el ☁️ que aconsejaba el aviso no enviaba nada.

   DECISIONES DEL USUARIO (no re-preguntar): 7 días · «Sola, con indicador y botón» · el 📜 Historial «al mismo plazo». Lo
   pendiente no se borra NUNCA. Si falta espacio, lo primero que se suelta es la copia de la MATRIZ, que se vuelve a bajar.

   Motor REAL sobre el shell real; la red, simulada. El almacén es de este archivo y tiene CUPO, como el del navegador: rechaza con
   QuotaExceededError lo que no cabe. Sin cupo, «no se pudo guardar» no se puede provocar: un doble que acepta todo daba verde.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['pickMod', 'enter', 'goBack', 'PINS', 'MAD_MOD', 'MAD_FICHAS', 'madKey', 'loadMad', 'saveMadList', 'renderMadTanques', 'renderMadSalas',
  'saveMadTanquesGrid', 'saveMadSalasGrid', 'syncMadTanquesGrid', 'syncMadSalasGrid', 'madTanquesSalaChange', 'MAD_RETENCION_DIAS', '_madPodarEnviados',
  '_madHistPodar', '_madLimpiezaDeEspacio', '_soltarCopiaMatriz', '_REPRO_CACHE_KEY', '_reproCacheSave', 'MAD_HIST_KEY', 'MAD_HIST_PANEL_PRE',
  '_madHistGuardar', 'madHistLeer', '_madHistGrillas', 'renderMadHistorial', 'openCfg', 'closeCfg', 'liberarEspacio', '_espacioMedir', 'ESPACIO_TOPE', '_gasVersionLocal', 'safeSetItem', '_madTqConfirmarRepetidas', '_loadSyncQueue', 'MAD_RECOV_KEY', 'loadMadRecovery', '_lastSyncFingerprint', 'selTab', 'goBack', 'madTanquesFechaChange', 'madSalasFechaChange', '_madCommitActive', '_madGridFechaAuto', 'madMovGuardar', 'renderMadMovimientos', 'madMovSalaChange', '_loadSyncQueue', 'flushSyncQueue', 'SYNCQ_KEY', '_madTqDiaQuitado', 'syncAll', 'recoverMadGrid', 'saveMadRecovery'];
const H = {};
const avisos = [];
const envios = [];
let respuesta = 'ok';

/* El almacén, con cupo y contando como el navegador: claves y valores. */
const almacen = (() => {
  const m = new Map();
  let cupo = Infinity;
  let bloqueada = null;
  const usado = () => [...m].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (k === bloqueada && (!m.has(k) || s.length > m.get(k).length)) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
      const antes = m.has(k) ? k.length + m.get(k).length : 0;
      if (usado() - antes + k.length + s.length > cupo) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, s);
    },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); cupo = Infinity; bloqueada = null; },
    /** Esta clave no puede crecer, y las demás sí: lo que se acorta siempre cabe, como en el navegador. */
    bloquear: (k) => { bloqueada = k; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    usado,
    /** Sólo quedan `resto` caracteres libres desde ahora. */
    dejarLibres: (resto) => { cupo = usado() + resto; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRepetidas=function(f){_madTqConfirmarRepetidas=f;}; H.dirty=function(){return _madGridDirty;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; H.vista=function(){ return { mod:curMod, tab:curTab }; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return respuesta; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
  };
});

const DIA = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const hace = (n) => { const d = new Date(Date.now() - n * DIA); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
let _n = 0;
/** Un registro de grilla. Por defecto, YA ENVIADO y hace tiempo: lo que se quita. */
const rec = (fecha, extra = {}) => ({ id: 'r' + (++_n), ts: Date.now() - 30 * DIA, synced: true, syncedAt: Date.now() - 30 * DIA,
  data: { fecha, sala: 'Sala 1', tanque: _n, parte: 1, hora: '08:00', cerrado: 1, machos_muertos: 1 }, ...extra });
const poner = (f, lista) => almacen.setItem(H.madKey(f), JSON.stringify(lista));
const ids = (f) => H.loadMad(f).map((r) => r.id);
const entradaHist = (ficha, id, dias) => ({ id, ficha, ts: Date.now() - dias * DIA, fecha: hace(dias), filas: 1, panel: true, payload: { sheetName: 'X', headers: ['ID'], rows: [[id]] } });
const celda = () => document.querySelector('#fp-tanques [name$="_hembras_muertas"]');   // la del primer tanque de la sala, sea cual sea
const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
const copiaMatriz = (caracteres) => almacen.setItem(H._REPRO_CACHE_KEY, 'x'.repeat(caracteres));

beforeEach(() => {
  almacen.clear();
  avisos.length = 0;
  envios.length = 0;
  respuesta = 'ok';
  H._lastSyncFingerprint.clear();   // el motor recuerda 30 s el último envío idéntico: no puede pasar de una prueba a otra
  H.setRepetidas(H._madTqConfirmarRepetidas);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
  H.setVista(H.MAD_MOD, 'tanques');
  document.getElementById('fp-tanques').innerHTML = '';
  H.renderMadTanques();
});
afterEach(() => { vi.useRealTimers(); });

describe('🧹 qué se va del equipo y qué se queda', () => {
  it('🔴 lo ENVIADO, de fecha vieja y enviado hace tiempo se va, de las TRES listas', () => {
    H.MAD_FICHAS.forEach((f) => poner(f, [rec(hace(30)), rec(hace(1), { syncedAt: Date.now() - DIA })]));
    expect(H._madPodarEnviados()).toBe(3);
    H.MAD_FICHAS.forEach((f) => expect(H.loadMad(f).map((r) => r.data.fecha), f).toEqual([hace(1)]));
  });

  it('🔴 lo PENDIENTE no se toca NUNCA, tenga la edad que tenga', () => {
    const nunca = rec(hace(90), { synced: false, syncedAt: null });
    const corregido = rec(hace(90), { synced: false });   // se envió alguna vez, pero lo de ahora aún no
    poner('tanques', [nunca, corregido]);
    expect(H._madPodarEnviados()).toBe(0);
    expect(ids('tanques')).toEqual([nunca.id, corregido.id]);
  });

  it('🔴 el borde: de hace 7 días se queda; de hace 8 se va', () => {
    expect(H.MAD_RETENCION_DIAS).toBe(7);
    const siete = rec(hace(7));
    const ocho = rec(hace(8));
    poner('tanques', [siete, ocho]);
    H._madPodarEnviados();
    expect(ids('tanques')).toEqual([siete.id]);
  });

  it('🔴 un parte viejo enviado AYER se queda: el plazo para corregirlo cuenta desde que salió', () => {
    const ayer = rec(hace(20), { syncedAt: Date.now() - DIA });
    const haceTiempo = rec(hace(20), { syncedAt: Date.now() - 8 * DIA });
    poner('tanques', [ayer, haceTiempo]);
    H._madPodarEnviados();
    expect(ids('tanques')).toEqual([ayer.id]);
  });

  /* Con un orden de texto: «01/02/2026» va ANTES de cualquier «2026-…», así que sólo la comprobación de la fecha lo salva. */
  it('sin fecha legible no se juzga: se queda', () => {
    const raro = rec('01/02/2026');
    poner('tanques', [raro]);
    H._madPodarEnviados();
    expect(ids('tanques')).toEqual([raro.id]);
  });

  it('enviado de antes de anotarse la hora del envío (sin syncedAt): cuenta sólo su fecha', () => {
    const r = rec(hace(30), { syncedAt: undefined });
    poner('tanques', [r]);
    expect(H._madPodarEnviados()).toBe(1);
  });

  it('lo que no es de estas listas ni se mira: Cantidad Sembrada, nombres de tanques…', () => {
    almacen.setItem('larv4_cs_1', '{"si_0":"1000"}');
    almacen.setItem('larv4_tqname_1', '{"0":"T1"}');
    poner('tanques', [rec(hace(30))]);
    H._madLimpiezaDeEspacio();
    expect(almacen.getItem('larv4_cs_1')).toBe('{"si_0":"1000"}');
    expect(almacen.getItem('larv4_tqname_1')).toBe('{"0":"T1"}');
  });

  it('sin nada que quitar no escribe', () => {
    const r = rec(hace(1), { syncedAt: Date.now() });
    poner('tanques', [r]);
    const set = vi.spyOn(almacen, 'setItem');
    H._madPodarEnviados();
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});

describe('🧹 se limpia sola al entrar', () => {
  const entrar = (m) => {
    H.pickMod(m);
    document.getElementById('pin').value = H.PINS[m];
    H.enter();
  };
  afterEach(() => { try { H.goBack(); } catch (_) { /* ya */ } });

  it('🔴 al entrar en Maduración se quita lo enviado fuera de plazo, sin pulsar nada', () => {
    const pend = rec(hace(30), { synced: false });
    poner('tanques', [rec(hace(30)), pend]);
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify([entradaHist('fin', 'viejo', 20), entradaHist('fin', 'nuevo', 1)]));
    entrar(H.MAD_MOD);
    expect(ids('tanques')).toEqual([pend.id]);
    expect(JSON.parse(almacen.getItem(H.MAD_HIST_KEY)).map((e) => e.id)).toEqual(['nuevo']);
  });

  it('entrar en otro módulo no toca la lista de Maduración', () => {
    poner('tanques', [rec(hace(30))]);
    entrar(1);
    expect(H.loadMad('tanques')).toHaveLength(1);
  });
});

describe('🧹 el 📜 Historial, al mismo plazo', () => {
  it('🔴 lo de hace 8 días sale de la lista guardada, con su copia para Editar; lo de hace 6, no', () => {
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify([entradaHist('fin', 'ocho', 8), entradaHist('fin', 'seis', 6)]));
    almacen.setItem(H.MAD_HIST_PANEL_PRE + 'ocho', '<div>x</div>');
    almacen.setItem(H.MAD_HIST_PANEL_PRE + 'seis', '<div>y</div>');
    expect(H._madHistPodar()).toBe(1);
    expect(JSON.parse(almacen.getItem(H.MAD_HIST_KEY)).map((e) => e.id)).toEqual(['seis']);
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + 'ocho')).toBeNull();
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + 'seis')).toBe('<div>y</div>');
  });

  it('🔴 no se enseña lo caducado de Salas y Tanques, y el panel dice el plazo de verdad', () => {
    poner('tanques', [rec(hace(8), { syncedAt: Date.now() - 8 * DIA }), rec(hace(2), { syncedAt: Date.now() - DIA })]);
    expect(H._madHistGrillas().map((g) => g.fecha)).toEqual([hace(2)]);
    H.setVista(H.MAD_MOD, 'historial');
    H.renderMadHistorial();
    const txt = document.getElementById('fp-historial').textContent;
    expect(txt).toContain('en los últimos 7 días');
    expect(txt).not.toContain('60 días');
  });

  it('sin nada caducado no lo reescribe', () => {
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify([entradaHist('fin', 'a', 1)]));
    const set = vi.spyOn(almacen, 'setItem');
    expect(H._madHistPodar()).toBe(0);
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});

describe('🔴 con el almacén lleno, lo tecleado no se pierde', () => {
  const lleno = () => {
    poner('tanques', [rec(hace(1), { syncedAt: Date.now() })]);   // reciente: nada que liberar
    almacen.dejarLibres(5);
  };

  it('🔴 Tanques · 💾: devuelve -1, lo tecleado SIGUE en pantalla y el aviso no aconseja el ☁️', () => {
    irASala('Sala 2');
    lleno();
    celda().value = '7';
    expect(H.saveMadTanquesGrid()).toBe(-1);
    expect(celda().value).toBe('7');
    expect(avisos.at(-1)).toContain('No se pudo guardar');
    expect(avisos.at(-1)).toContain('Lo tecleado sigue en pantalla');
    expect(avisos.at(-1)).not.toContain('☁️');
  });

  /* 2026-11-04 (pauta A6, usuario: «Enviar lo de pantalla») · ☁️ envía aunque no haya podido guardar, como las fichas de Larvicultura: la
     hoja es el respaldo que de verdad cuenta, y es justo cuando más falta hace. */
  const dia = () => document.getElementById('mad-tanques-fecha').value;
  const viaja = (env, v) => env.rows.some((f) => f.includes(Number(v)) || f.includes(String(v)));

  it('🔴 Tanques · ☁️: envía lo que hay en pantalla, limpia la grilla y avisa de que no quedó copia', async () => {
    irASala('Sala 2');
    lleno();
    const antes = ids('tanques');
    celda().value = '7';
    await H.syncMadTanquesGrid();
    expect(envios).toHaveLength(1);
    expect(viaja(envios[0], 7), 'viaja lo tecleado').toBe(true);
    expect(celda().value, 'está en la hoja: la grilla queda limpia').toBe('');
    expect(avisos.at(-1)).toContain('no guardó copia');
    expect(ids('tanques'), 'lo ya enviado de antes sigue').toEqual(antes);
    expect(H.dirty()).toBe(false);
  });

  it('🔴 Tanques · ☁️: sin nada que retirar no escribe: no sale un «no se pudo guardar» falso después de llegar', async () => {
    irASala('Sala 2');
    almacen.dejarLibres(5);
    celda().value = '7';
    await H.syncMadTanquesGrid();
    expect(envios).toHaveLength(1);
    expect(avisos.filter((a) => a.includes('No se pudo guardar')), 'sólo el del guardado, antes de enviar').toHaveLength(1);
    expect(avisos.at(-1)).toContain('no guardó copia');
  });

  it('🔴 Tanques · ☁️: lo que el equipo guardaba de esa ronda se retira: nadie escribe después lo viejo encima', async () => {
    irASala('Sala 2');
    celda().value = '3';
    expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
    expect(H.loadMad('tanques').filter((r) => !r.synced).length).toBeGreaterThan(0);
    almacen.dejarLibres(0);
    celda().value = '7';
    await H.syncMadTanquesGrid();
    expect(viaja(envios[0], 7)).toBe(true);
    expect(H.loadMad('tanques').filter((r) => !r.synced)).toEqual([]);
  });

  it('🔴 Tanques · ☁️: lo pendiente de otra sala viaja también, y también se retira', async () => {
    poner('tanques', [rec(hace(1), { synced: false, syncedAt: null, data: { fecha: hace(1), sala: 'Sala 1', tanque: 1, parte: 1, hora: '08:00', cerrado: 1, machos_muertos: 9 } })]);
    irASala('Sala 2');
    almacen.dejarLibres(5);
    celda().value = '7';
    await H.syncMadTanquesGrid();
    expect(envios[0].rows.length).toBeGreaterThan(1);
    expect(H.loadMad('tanques')).toEqual([]);
  });

  it('🔴 Tanques · ☁️: lo que recordaba como no guardado se olvida: ya está en la hoja', async () => {
    irASala('Sala 2');
    const hoy = dia();
    almacen.setItem(H.MAD_RECOV_KEY, JSON.stringify({ ficha: 'tanques', sala: 'Sala 2', fecha: hoy, ts: Date.now(), rows: [] }));
    lleno();
    celda().value = '7';
    await H.syncMadTanquesGrid();
    expect(almacen.getItem(H.MAD_RECOV_KEY)).toBeNull();
  });

  it('🔴 Tanques · ☁️: si la hoja lo rechaza, lo tecleado sigue en pantalla y lo guardado no se toca', async () => {
    irASala('Sala 2');
    celda().value = '3';
    expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
    almacen.dejarLibres(0);
    const antes = ids('tanques');
    expect(antes.length).toBeGreaterThan(0);
    celda().value = '7';
    respuesta = 'rejected';
    await H.syncMadTanquesGrid();
    expect(envios).toHaveLength(1);
    expect(celda().value).toBe('7');
    expect(ids('tanques')).toEqual(antes);
    expect(avisos.join(' ')).not.toContain('no guardó copia');
  });

  it('🔴 Tanques · ☁️: sin señal, lo tecleado sigue en pantalla y dice que no se envió ni se guardó', async () => {
    vi.useRealTimers();
    irASala('Sala 2');
    lleno();
    celda().value = '7';
    respuesta = 'retry';
    await H.syncMadTanquesGrid();
    expect(celda().value).toBe('7');
    expect(avisos.join(' ')).toContain('no hay espacio');
    expect(H._loadSyncQueue()).toEqual([]);
  });

  it('🔴 Tanques · ☁️: si contesta que NO a «¿ronda repetida?», lo tecleado sigue en pantalla', async () => {
    irASala('Sala 2');
    lleno();
    celda().value = '7';
    H.setRepetidas(async () => false);
    await H.syncMadTanquesGrid();
    expect(envios).toHaveLength(0);
    expect(celda().value).toBe('7');
  });

  it('🔴 Tanques · ☁️: si cabe en la cola y no en la lista, queda en la cola, y lo guardado se retira', async () => {
    vi.useRealTimers();
    irASala('Sala 2');
    celda().value = '3';
    expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
    almacen.bloquear(H.madKey('tanques'));
    celda().value = '7';
    respuesta = 'retry';
    await H.syncMadTanquesGrid();
    almacen.bloquear(null);
    expect(H._loadSyncQueue().length).toBe(1);
    expect(viaja(H._loadSyncQueue()[0].payload, 7)).toBe(true);
    expect(celda().value).toBe('');
    expect(avisos.join(' ')).toContain('sólo queda en la cola');
  });

  it('🔵 Tanques · ☁️ con sitio: guarda, envía y marca como siempre', async () => {
    irASala('Sala 2');
    celda().value = '7';
    await H.syncMadTanquesGrid();
    expect(envios).toHaveLength(1);
    expect(H.loadMad('tanques').length).toBeGreaterThan(0);
    expect(H.loadMad('tanques').every((r) => r.synced)).toBe(true);
    expect(avisos.join(' ')).not.toContain('no guardó copia');
  });

  it('🔴 Salas · 💾: lo tecleado sigue en pantalla', () => {
    H.setVista(H.MAD_MOD, 'salas');
    H.renderMadSalas();
    almacen.dejarLibres(5);
    const el = document.querySelector('#fp-salas [name="sg_0_temp_02"]');
    el.value = '28';
    expect(H.saveMadSalasGrid()).toBe(-1);
    expect(document.querySelector('#fp-salas [name="sg_0_temp_02"]').value).toBe('28');
  });

  it('con espacio, 💾 sí repinta: la grilla queda limpia para la ronda siguiente', () => {
    irASala('Sala 2');
    celda().value = '7';
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    expect(celda().value).toBe('');
  });
});

/* 2026-11-05 (pauta A7, usuario: «Preguntar») · Sin poder guardar, cambiar de sala, de fecha o de pestaña, o salir del módulo, borraba lo tecleado sin
   remedio. Ahora se pregunta: quien se queda lo conserva, y quien sigue ya sabe que lo pierde. Con espacio, ni se pregunta. */
describe('🔴 dejar una grilla con lo tecleado sin poder guardarse', () => {
  let preguntas;
  let respuesta;
  beforeEach(() => {
    preguntas = [];
    respuesta = false;
    globalThis.confirm = (t) => { preguntas.push(String(t)); return respuesta; };
  });
  /* La sala que pintó la grilla: en happy-dom, un <select> repintado por innerHTML sólo la dice en su option[selected]. */
  const sala = () => { const s = document.getElementById('mad-tanques-sala'); const o = s.querySelector('option[selected]'); return o ? o.value : s.value; };
  const lleno = () => {
    poner('tanques', [rec(hace(1), { syncedAt: Date.now() })]);
    almacen.dejarLibres(5);
  };
  const teclear = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const celdaSalas = () => document.querySelector('#fp-salas [name="sg_0_temp_02"]');
  const irASalas = () => {
    H.setVista(H.MAD_MOD, 'salas');
    document.getElementById('fp-salas').innerHTML = '';
    H.renderMadSalas();
  };

  describe('☁️ cambiar de sala', () => {
    it('🔴 quedarse: lo tecleado sigue, y el selector vuelve a su sala', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      irASala('Sala 3');
      expect(preguntas).toHaveLength(1);
      expect(preguntas[0]).toContain('PERDERLO');
      expect(preguntas[0]).toContain('☁️');
      expect(document.getElementById('mad-tanques-sala').value, 'el selector vuelve').toBe('Sala 2');
      expect(celda().value).toBe('7');
    });

    it('🔴 seguir: cambia, sabiendo que lo pierde', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      respuesta = true;
      irASala('Sala 3');
      expect(sala()).toBe('Sala 3');
      expect(celda().value).toBe('');
    });

    it('🔵 con espacio no pregunta: lo guarda y cambia', () => {
      irASala('Sala 2');
      teclear(celda(), '7');
      irASala('Sala 3');
      expect(preguntas).toEqual([]);
      expect(sala()).toBe('Sala 3');
      expect(H.loadMad('tanques').some((r) => r.data.sala === 'Sala 2' && String(r.data.hembras_muertas) === '7')).toBe(true);
    });

    it('🔵 sin teclear nada no pregunta, aunque no haya espacio', () => {
      irASala('Sala 2');
      lleno();
      irASala('Sala 3');
      expect(preguntas).toEqual([]);
      expect(sala()).toBe('Sala 3');
    });
  });

  describe('📅 cambiar de fecha', () => {
    const fecha = () => document.getElementById('mad-tanques-fecha');

    it('🔴 quedarse: lo tecleado sigue, y la fecha vuelve', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      const antes = fecha().value;
      const auto = H._madGridFechaAuto.tanques;
      fecha().value = hace(2);
      H.madTanquesFechaChange();
      expect(preguntas).toHaveLength(1);
      expect(fecha().value).toBe(antes);
      expect(H._madGridFechaAuto.tanques, 'sigue siendo la fecha de la app').toBe(auto);
      expect(celda().value).toBe('7');
    });

    it('🔴 seguir: cambia de fecha', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      respuesta = true;
      fecha().value = hace(2);
      H.madTanquesFechaChange();
      expect(fecha().value).toBe(hace(2));
      expect(celda().value).toBe('');
    });

    it('🔴 Salas: quedarse conserva lo tecleado', () => {
      irASalas();
      almacen.dejarLibres(5);
      teclear(celdaSalas(), '28');
      const el = document.getElementById('mad-salas-fecha');
      const antes = el.value;
      el.value = hace(2);
      H.madSalasFechaChange();
      expect(preguntas).toHaveLength(1);
      expect(el.value).toBe(antes);
      expect(celdaSalas().value).toBe('28');
    });
  });

  describe('🗂 cambiar de pestaña', () => {
    it('🔴 Tanques, quedarse: no cambia, y lo tecleado sigue', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      H.selTab('salas');
      expect(preguntas).toHaveLength(1);
      expect(H.vista().tab).toBe('tanques');
      expect(celda().value).toBe('7');
    });

    it('🔴 Tanques, seguir: cambia', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      respuesta = true;
      H.selTab('salas');
      expect(H.vista().tab).toBe('salas');
    });

    it('🔴 Salas, quedarse: no cambia', () => {
      irASalas();
      almacen.dejarLibres(5);
      teclear(celdaSalas(), '28');
      H.selTab('tanques');
      expect(H.vista().tab).toBe('salas');
      expect(celdaSalas().value).toBe('28');
    });

    it('🔵 con espacio no pregunta', () => {
      irASala('Sala 2');
      teclear(celda(), '7');
      H.selTab('salas');
      expect(preguntas).toEqual([]);
      expect(H.vista().tab).toBe('salas');
    });
  });

  describe('⬅️ salir del módulo', () => {
    it('🔴 quedarse: sigue en la grilla, con lo tecleado', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      H.goBack();
      expect(preguntas).toHaveLength(1);
      expect(H.vista()).toEqual({ mod: H.MAD_MOD, tab: 'tanques' });
      expect(celda().value).toBe('7');
    });

    it('🔴 seguir: sale, y al volver no pregunta otra vez por lo que ya se dio por perdido', () => {
      irASala('Sala 2');
      lleno();
      teclear(celda(), '7');
      respuesta = true;
      H.goBack();
      expect(preguntas).toHaveLength(1);
      H.setVista(H.MAD_MOD, 'tanques');
      H.selTab('salas');
      expect(preguntas).toHaveLength(1);
    });

    it('🔵 con sitio para la copia de recuperación no pregunta, y queda recuperable', () => {
      irASala('Sala 2');
      teclear(celda(), '7');
      H.goBack();
      expect(preguntas).toEqual([]);
      expect(H.loadMadRecovery()).toBeTruthy();
    });
  });

  describe('📦 llevar la grilla a otra fecha sin sitio para escribir allí', () => {
    it('🔴 lo ya guardado vuelve a su sitio: no se pierde', () => {
      irASala('Sala 2');
      teclear(celda(), '3');
      expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
      const guardado = H.loadMad('tanques').map((r) => r.id);
      const el = document.getElementById('mad-tanques-fecha');
      const antes = el.value;
      const celdas = document.querySelectorAll('#fp-tanques [name$="_hembras_muertas"]');
      teclear(celdas[1], '9');
      teclear(celdas[2], '8');
      almacen.dejarLibres(5);
      respuesta = true;   // sí a llevarlo; no cabe y vuelve; y sí a seguir sin guardar
      preguntas.length = 0;
      el.value = hace(2);
      H.madTanquesFechaChange();
      expect(H.loadMad('tanques').map((r) => r.id)).toEqual(guardado);
      expect(H.loadMad('tanques').every((r) => r.data.fecha === antes)).toBe(true);
    });

    it('🔴 y si elige quedarse, también lo tecleado sigue', () => {
      irASala('Sala 2');
      teclear(celda(), '3');
      expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
      const el = document.getElementById('mad-tanques-fecha');
      const antes = el.value;
      const celdas = document.querySelectorAll('#fp-tanques [name$="_hembras_muertas"]');
      teclear(celdas[1], '9');
      teclear(celdas[2], '8');
      almacen.dejarLibres(5);
      globalThis.confirm = (t) => { preguntas.push(String(t)); return preguntas.length === 1; };   // sí a llevarlo; no a perderlo
      el.value = hace(2);
      H.madTanquesFechaChange();
      expect(el.value).toBe(antes);
      expect(document.querySelectorAll('#fp-tanques [name$="_hembras_muertas"]')[1].value).toBe('9');
      expect(H.loadMad('tanques').length).toBeGreaterThan(0);
    });

    it('🔴 Salas: lo guardado vuelve, con sus zonas', () => {
      irASalas();
      teclear(celdaSalas(), '28');
      expect(H.saveMadSalasGrid({ silent: true })).toBeGreaterThan(0);
      poner('zonas', [rec(document.getElementById('mad-salas-fecha').value, { id: 'z1', synced: false, syncedAt: null, data: { fecha: document.getElementById('mad-salas-fecha').value, zona: 'Zona 1', tanque: 1 } })]);
      const guardado = H.loadMad('salas').map((r) => r.id);
      const el = document.getElementById('mad-salas-fecha');
      H.renderMadSalas();
      const otra = document.querySelector('#fp-salas [name="sg_1_temp_02"]') || celdaSalas();
      teclear(otra, '29');
      almacen.dejarLibres(2);
      respuesta = true;
      el.value = hace(2);
      H.madSalasFechaChange();
      expect(H.loadMad('salas').map((r) => r.id)).toEqual(guardado);
      expect(H.loadMad('zonas').map((r) => r.id)).toEqual(['z1']);
    });
  });

  describe('📦 llevar a otra fecha es una sola escritura', () => {
    const celdaZona = (i = 0) => document.querySelector('#fp-zonas [name="zg_' + i + '_temp_02"]');
    const fechaSalas = () => document.getElementById('mad-salas-fecha');
    const irASalasYa = () => { irASalas(); expect(celdaZona(), 'la grilla de las zonas está pintada').toBeTruthy(); };

    it('🔴 Tanques: cabe justo porque lo viejo sale en la misma escritura', () => {
      irASala('Sala 2');
      teclear(celda(), '3');
      expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
      teclear(celda(), '4');
      almacen.dejarLibres(40);
      respuesta = true;
      const el = document.getElementById('mad-tanques-fecha');
      el.value = hace(2);
      H.madTanquesFechaChange();
      const l = H.loadMad('tanques');
      expect(l.length).toBe(1);
      expect(l[0].data.fecha).toBe(hace(2));
      expect(String(l[0].data.hembras_muertas)).toBe('4');
    });

    it('🔴 Salas: igual', () => {
      irASalasYa();
      teclear(celdaSalas(), '28');
      expect(H.saveMadSalasGrid({ silent: true })).toBeGreaterThan(0);
      teclear(celdaSalas(), '29');
      almacen.dejarLibres(40);
      respuesta = true;
      fechaSalas().value = hace(2);
      H.madSalasFechaChange();
      const l = H.loadMad('salas');
      expect(l.length).toBeGreaterThan(0);
      expect(l.every((r) => r.data.fecha === hace(2))).toBe(true);
    });

    it('🔴 Zonas: igual', () => {
      irASalasYa();
      teclear(celdaZona(), '28');
      expect(H.saveMadSalasGrid({ silent: true })).toBeGreaterThan(0);
      teclear(celdaZona(), '29');
      almacen.dejarLibres(40);
      respuesta = true;
      fechaSalas().value = hace(2);
      H.madSalasFechaChange();
      const l = H.loadMad('zonas');
      expect(l.length).toBeGreaterThan(0);
      expect(l.every((r) => r.data.fecha === hace(2))).toBe(true);
    });

    it('🔴 con la grilla vaciada no hay nada que escribir: lo de la fecha vieja sale igual', () => {
      irASala('Sala 2');
      teclear(celda(), '3');
      expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
      teclear(celda(), '');
      respuesta = true;
      const el = document.getElementById('mad-tanques-fecha');
      el.value = hace(2);
      H.madTanquesFechaChange();
      expect(H.loadMad('tanques')).toEqual([]);
    });

    const salasYZonas = () => {
      irASalasYa();
      const hoy = fechaSalas().value;
      teclear(celdaSalas(), '28');
      teclear(celdaZona(), '28');
      expect(H.saveMadSalasGrid({ silent: true })).toBeGreaterThan(0);
      // Y crece: más celdas tecleadas, en las dos listas.
      teclear(document.querySelector('#fp-salas [name="sg_1_temp_02"]'), '27');
      teclear(document.querySelector('#fp-salas [name="sg_2_temp_02"]'), '27');
      teclear(celdaZona(1), '27');
      teclear(celdaZona(2), '27');
      respuesta = true;
      return hoy;
    };

    it('🔴 Salas: si no caben las zonas, las salas vuelven a su fecha', () => {
      const hoy = salasYZonas();
      almacen.bloquear(H.madKey('zonas'));
      fechaSalas().value = hace(2);
      H.madSalasFechaChange();
      almacen.bloquear(null);
      expect(H.loadMad('salas').every((r) => r.data.fecha === hoy)).toBe(true);
      expect(H.loadMad('zonas').every((r) => r.data.fecha === hoy)).toBe(true);
    });

    it('🔴 Salas: si no caben las salas, las zonas vuelven a su fecha', () => {
      const hoy = salasYZonas();
      almacen.bloquear(H.madKey('salas'));
      fechaSalas().value = hace(2);
      H.madSalasFechaChange();
      almacen.bloquear(null);
      expect(H.loadMad('salas').every((r) => r.data.fecha === hoy)).toBe(true);
      expect(H.loadMad('zonas').every((r) => r.data.fecha === hoy)).toBe(true);
    });
  });

  describe('`_madCommitActive` dice si pudo', () => {
    it('sí, con espacio; no, sin él', () => {
      irASala('Sala 2');
      teclear(celda(), '7');
      expect(H._madCommitActive()).toBe(true);
      lleno();
      teclear(celda(), '8');
      expect(H._madCommitActive()).toBe(false);
    });
    it('Salas también', () => {
      irASalas();
      almacen.dejarLibres(5);
      teclear(celdaSalas(), '28');
      expect(H._madCommitActive()).toBe(false);
    });
    it('fuera de Maduración o de una grilla no hay nada que decir', () => {
      H.setVista(H.MAD_MOD, 'saldo');
      expect(H._madCommitActive()).toBe(true);
      H.setVista(1, 'calidad');
      expect(H._madCommitActive()).toBe(true);
    });
  });

  /* 2026-11-05 (auditoría de la A, usuario: «No recuperar y avisar») · ↩ Recuperar sin espacio decía «✅ Filas recuperadas», no guardaba
     nada y borraba la copia: las filas se perdían. Y repintaba la grilla sin preguntar por lo tecleado en ella. */
  describe('↩ Recuperar sin espacio', () => {
    /** Una copia del autoguardado de la Sala 2, y la grilla como tras recargar: sin lo tecleado. */
    const copiaDeSala2 = () => {
      irASala('Sala 2');
      teclear(celda(), '7');
      H.saveMadRecovery();
      expect(H.loadMadRecovery(), 'el autoguardado se tomó').toBeTruthy();
      document.getElementById('fp-tanques').innerHTML = '';
      H.renderMadTanques();
      expect(H.dirty(), 'como tras recargar: nada tecleado').toBe(false);
    };
    const conSiete = () => H.loadMad('tanques').some((r) => r.data.sala === 'Sala 2' && String(r.data.hembras_muertas) === '7');
    const dijoQueNo = () => avisos.some((a) => a.includes('no se ha recuperado nada') && a.includes('la copia se conserva (hasta las'));

    it('🔴 no recupera, conserva la copia y dice qué hacer', () => {
      copiaDeSala2();
      almacen.dejarLibres(5);
      respuesta = true;
      H.recoverMadGrid();
      expect(conSiete(), 'no cabía').toBe(false);
      expect(H.loadMadRecovery(), 'la copia se conserva').toBeTruthy();
      expect(dijoQueNo()).toBe(true);
      expect(avisos.some((a) => a.includes('no se ha recuperado nada') && a.includes('🧹') && a.includes('↩ Recuperar'))).toBe(true);
      expect(avisos.some((a) => a.includes('Filas recuperadas')), 'no dice que recuperó').toBe(false);
      expect(avisos.some((a) => a.includes('Lo tecleado sigue en pantalla')), 'el aviso del guardado de la grilla no sirve aquí').toBe(false);
    });

    it('🔴 al liberar espacio, volver a pulsar ↩ las recupera', () => {
      copiaDeSala2();
      almacen.dejarLibres(5);
      respuesta = true;
      H.recoverMadGrid();
      almacen.dejarLibres(1e6);
      H.recoverMadGrid();
      expect(conSiete()).toBe(true);
      expect(H.loadMadRecovery()).toBeNull();
      expect(avisos.some((a) => a.includes('Filas recuperadas'))).toBe(true);
    });

    it('🔴 sin espacio, la grilla no se va a la sala de la copia', () => {
      copiaDeSala2();
      irASala('Sala 3');
      almacen.dejarLibres(5);
      respuesta = true;
      H.recoverMadGrid();
      H.renderMadTanques();
      expect(sala()).toBe('Sala 3');
    });

    it('🔴 Salas: si las zonas no caben, las salas vuelven a como estaban, y la copia se queda', () => {
      poner('salas', [rec(hace(3), { id: 's-antes' })]);
      irASalas();
      teclear(celdaSalas(), '28');
      teclear(document.querySelector('#fp-zonas [name="zg_0_temp_02"]'), '27');
      H.saveMadRecovery();
      expect(H.loadMadRecovery().zonas, 'la copia lleva sus zonas').toHaveLength(1);
      irASalas();
      almacen.bloquear(H.madKey('zonas'));
      respuesta = true;
      H.recoverMadGrid();
      almacen.bloquear(null);
      expect(ids('salas')).toEqual(['s-antes']);
      expect(H.loadMad('zonas')).toEqual([]);
      expect(H.loadMadRecovery()).toBeTruthy();
      expect(dijoQueNo()).toBe(true);
    });

    it('🔴 lo tecleado en la grilla sin poder guardarse: pregunta antes, y «Cancelar» lo deja en pantalla', () => {
      copiaDeSala2();
      irASala('Sala 3');
      lleno();
      teclear(celda(), '4');
      globalThis.confirm = (t) => { preguntas.push(String(t)); return preguntas.length === 1; };   // sí a recuperar; no a perder lo tecleado
      H.recoverMadGrid();
      expect(preguntas).toHaveLength(2);
      expect(preguntas[1]).toContain('PERDERLO');
      expect(celda().value).toBe('4');
      expect(H.loadMadRecovery()).toBeTruthy();
    });

    it('🔵 sin espacio, si todo ya estaba guardado no hace falta escribir: lo dice y suelta la copia', () => {
      irASala('Sala 2');
      teclear(celda(), '7');
      expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
      H.saveMadRecovery();   // un autoguardado de lo que ya está guardado
      expect(H.loadMadRecovery()).toBeTruthy();
      document.getElementById('fp-tanques').innerHTML = '';
      H.renderMadTanques();
      almacen.dejarLibres(5);
      respuesta = true;
      H.recoverMadGrid();
      expect(avisos.some((a) => a.includes('ya estaba guardado'))).toBe(true);
      expect(dijoQueNo()).toBe(false);
      expect(H.loadMadRecovery()).toBeNull();
    });

    it('🔵 con espacio, lo tecleado en la grilla se guarda antes de recuperar', () => {
      copiaDeSala2();
      irASala('Sala 3');
      teclear(celda(), '4');
      respuesta = true;
      H.recoverMadGrid();
      expect(preguntas).toHaveLength(1);
      expect(H.loadMad('tanques').some((r) => r.data.sala === 'Sala 3' && String(r.data.hembras_muertas) === '4'), 'lo de la Sala 3').toBe(true);
      expect(conSiete(), 'y lo recuperado').toBe(true);
    });
  });
});

/* 2026-11-06 (auditoría de la A, usuario: «Que no borre la marca») · La marca de «tecleado sin guardar» es una, la de la grilla A LA VISTA, y
   todas las grillas están en la página. ☁️ de Tanques, al terminar, repinta Tanques aunque se haya pasado a Salas mientras enviaba: borraba
   la marca de lo tecleado en Salas, y entonces 🔄 lo repintaba encima, cerrar no avisaba y, sin espacio, salir no preguntaba. */
describe('🔴 la marca de «sin guardar» es la de la grilla a la vista', () => {
  let preguntas;
  let decir;
  beforeEach(() => {
    preguntas = [];
    decir = true;
    globalThis.confirm = (t) => { preguntas.push(String(t)); return decir; };
  });
  const teclear = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const celdaSalas = () => document.querySelector('#fp-salas [name="sg_0_temp_02"]');
  const irASalas = () => { H.setVista(H.MAD_MOD, 'salas'); document.getElementById('fp-salas').innerHTML = ''; H.renderMadSalas(); };

  it('🔴 repintar Tanques, que no está a la vista, no borra la marca de lo tecleado en Salas', () => {
    irASala('Sala 2');   // sin sala, Tanques no pinta grilla y no llega a tocar la marca: la prueba no ejercería nada
    irASalas();
    teclear(celdaSalas(), '28');
    expect(H.dirty()).toBe(true);
    H.renderMadTanques();
    expect(H.dirty()).toBe(true);
  });

  it('🔵 repintar la grilla a la vista sí la limpia: refleja lo guardado', () => {
    irASalas();
    teclear(celdaSalas(), '28');
    H.renderMadSalas();
    expect(H.dirty()).toBe(false);
  });

  it('🔴 el caso: ☁️ en Tanques, se pasa a Salas y se teclea mientras envía; al terminar, sin espacio, dejar Salas pregunta', async () => {
    let soltar;
    const puerta = new Promise((r) => { soltar = r; });
    H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); await puerta; return 'ok'; });
    try {
      irASala('Sala 2');
      teclear(celda(), '3');
      const enviando = H.syncMadTanquesGrid();
      for (let i = 0; i < 500 && !envios.length; i++) await Promise.resolve();
      expect(envios.length, 'el envío de Tanques está en camino').toBe(1);
      H.selTab('salas');
      expect(H.vista().tab).toBe('salas');
      teclear(celdaSalas(), '28');
      soltar();
      await enviando;
      expect(H.dirty(), 'lo tecleado en Salas sigue sin guardar').toBe(true);
      almacen.dejarLibres(5);
      decir = false;
      preguntas.length = 0;
      H.selTab('tanques');
      expect(preguntas).toHaveLength(1);
      expect(preguntas[0]).toContain('PERDERLO');
      expect(H.vista().tab).toBe('salas');
      expect(celdaSalas().value).toBe('28');
    } finally {
      H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return respuesta; });
    }
  });
});

/* 2026-11-06 (auditoría de la A, usuario: «Esperar máx. 45 s») · 🔄 esperaba a que se vaciara la cola ENTERA antes de enviar nada, sin decir
   «Sincronizando…»: con la cola llena y el GAS lento, minutos con el botón como muerto. Ahora, como ☁️ (pauta A15), 45 s como mucho. */
describe('🔴 🔄 no se queda colgado vaciando la cola', () => {
  const OTRA = { payload: { sheetName: 'Otra hoja', headers: ['ID', 'v'], rows: [['x', 1]] }, reqId: 'r-cola', url: '', ts: Date.now(), mark: null };
  let soltarCola;
  beforeEach(() => {
    soltarCola = null;
    // Lo de la cola no contesta hasta soltarlo; lo demás llega.
    H.setPostOnce((b) => {
      if (b.sheetName === 'Otra hoja') return new Promise((r) => { soltarCola = () => r('ok'); });
      envios.push(JSON.parse(JSON.stringify(b)));
      return Promise.resolve('ok');
    });
  });
  afterEach(async () => {
    if (soltarCola) { soltarCola(); await vi.advanceTimersByTimeAsync(1000); }   // aunque la prueba falle a medias: no deja la cola colgada
    H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return respuesta; });
  });
  const deTanques = () => envios.filter((b) => b.sheetName === 'Maduración Tanques');

  it('🔴 dice «Sincronizando…» desde el principio, y a los 45 s envía lo de aquí; la cola sigue sola', async () => {
    irASala('Sala 2');
    celda().value = '3'; celda().dispatchEvent(new Event('input', { bubbles: true }));
    expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
    almacen.setItem(H.SYNCQ_KEY, JSON.stringify([OTRA]));
    const p = H.syncAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('slbl').textContent).toContain('Sincronizando');
    await vi.advanceTimersByTimeAsync(44000);
    expect(deTanques(), 'aún espera a la cola').toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(deTanques(), 'pasado el tope, lo de aquí sale').toHaveLength(1);
    expect(H._loadSyncQueue().map((it) => it.reqId), 'lo de la cola sigue en ella, a salvo').toEqual(['r-cola']);
    soltarCola();
    await vi.advanceTimersByTimeAsync(1000);
    expect(H._loadSyncQueue(), 'y se entrega solo').toEqual([]);
  });

  it('🔵 con la cola al día no espera nada', async () => {
    irASala('Sala 2');
    celda().value = '3'; celda().dispatchEvent(new Event('input', { bubbles: true }));
    expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
    const p = H.syncAll();
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(deTanques()).toHaveLength(1);
  });
});

/* 2026-11-05 (pauta A8, usuario: «No caduca sola») · Un formulario se limpia al encolarse, y ésa es su única copia: a los 7 días la cola lo
   descartaba, también el Historial, y el aviso decía «revísalos» sin que quedara nada que revisar. */
describe('🔴 lo que espera en la cola no caduca', () => {
  const q = (x) => document.querySelector('#fp-movimientos ' + x);
  const OK = async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'ok'; };
  const SIN_SENAL = async () => 'retry';
  const moverFormulario = async () => {
    H.setVista(H.MAD_MOD, 'movimientos');
    document.getElementById('fp-movimientos').innerHTML = '';
    H.renderMadMovimientos();
    q('.mv-so').value = 'Sala 1'; H.madMovSalaChange(q('.mv-so')); q('.mv-to').value = '3';
    q('.mv-sd').value = 'Sala 2'; H.madMovSalaChange(q('.mv-sd')); q('.mv-td').value = '16';
    q('.mv-machos').value = '5'; q('.mv-hembras').value = '5';
    await H.madMovGuardar();
  };
  const envejecer = (dias) => {
    const c = JSON.parse(almacen.getItem(H.SYNCQ_KEY) || '[]');
    c.forEach((i) => { i.ts = Date.now() - dias * DIA; });
    almacen.setItem(H.SYNCQ_KEY, JSON.stringify(c));
    const l = JSON.parse(almacen.getItem(H.MAD_HIST_KEY) || '[]');
    l.forEach((e) => { e.ts = Date.now() - dias * DIA; });
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify(l));
  };
  beforeEach(async () => {
    vi.useRealTimers();
    H.setPostOnce(SIN_SENAL);
    await moverFormulario();
    expect(H._loadSyncQueue().length).toBe(1);
    expect(q('.mv-machos').value, 'el formulario ya se limpió: la cola es su única copia').toBe('');
    H.setPostOnce(OK);
    envios.length = 0;
    avisos.length = 0;
  });
  afterEach(() => { H.setPostOnce(OK); });

  it('🔴 con 8 días: llega a la hoja, y se dice que era viejo', async () => {
    envejecer(8);
    await H.flushSyncQueue();
    expect(envios).toHaveLength(1);
    expect(H._loadSyncQueue()).toEqual([]);
    expect(avisos.join(' ')).not.toContain('descartaron');
    expect(avisos.join(' ')).toContain('más de 7 días');
  });

  it('🔴 también lo dice el reintento automático, que calla lo que espera', async () => {
    envejecer(8);
    await H.flushSyncQueue({ automatico: true });
    expect(envios).toHaveLength(1);
    expect(avisos.join(' ')).toContain('más de 7 días');
  });

  it('🔴 con 30 días y sin señal: sigue ahí, y en el Historial', async () => {
    envejecer(30);
    H.setPostOnce(SIN_SENAL);
    await H.flushSyncQueue();
    expect(H._loadSyncQueue().length).toBe(1);
    expect(avisos.join(' ')).not.toContain('descartaron');
    expect(H.madHistLeer().filter((e) => e.ficha === 'movimientos').length, 'el Historial lo conserva mientras espera').toBe(1);
  });

  it('🔴 en cuanto llega, el Historial vuelve a su plazo', async () => {
    envejecer(8);
    expect(H.madHistLeer().length).toBe(1);
    await H.flushSyncQueue();
    expect(H.madHistLeer()).toEqual([]);
  });

  it('🔵 lo reciente no avisa de nada', async () => {
    await H.flushSyncQueue();
    expect(envios).toHaveLength(1);
    expect(avisos.join(' ')).not.toContain('más de 7 días');
  });

  it('🔴 lo de otros envíos del Historial sigue con su plazo', async () => {
    envejecer(8);
    const l = JSON.parse(almacen.getItem(H.MAD_HIST_KEY));
    l.push({ ...l[0], id: 'otro', envio: 'no-esta-en-cola' });
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify(l));
    expect(H.madHistLeer().map((e) => e.id)).not.toContain('otro');
    expect(H.madHistLeer().length).toBe(1);
  });

  it('🔴 una marca de otra clase con la misma llave no lo retiene en el Historial', () => {
    envejecer(8);
    const envioDe = JSON.parse(almacen.getItem(H.MAD_HIST_KEY))[0].envio;
    const c = JSON.parse(almacen.getItem(H.SYNCQ_KEY));
    c[0].mark = { kind: 'ast', keys: [envioDe] };
    almacen.setItem(H.SYNCQ_KEY, JSON.stringify(c));
    expect(H.madHistLeer()).toEqual([]);
  });

  /* Auditoría de la A (2026-11-05, usuario: «Con su copia para Editar») · madHistLeer ya lo conservaba, pero la ESCRITURA no: el primer
     envío de Maduración, o la limpieza al entrar, lo borraba con su copia para Editar, la única forma de corregirlo. */
  const crudo = () => JSON.parse(almacen.getItem(H.MAD_HIST_KEY) || '[]');
  const otroMovimiento = async () => {
    q('.mv-so').value = 'Sala 1'; H.madMovSalaChange(q('.mv-so')); q('.mv-to').value = '4';
    q('.mv-sd').value = 'Sala 2'; H.madMovSalaChange(q('.mv-sd')); q('.mv-td').value = '17';
    q('.mv-machos').value = '2'; q('.mv-hembras').value = '2';
    await H.madMovGuardar();
  };

  it('🔴 otro envío de Maduración no lo saca del Historial, ni le quita su copia para Editar', async () => {
    envejecer(8);
    const [viejo] = crudo();
    expect(viejo.panel, 'el envío guardó su copia para Editar').toBe(true);
    H.setPostOnce(SIN_SENAL);
    await otroMovimiento();
    expect(crudo()).toHaveLength(2);
    expect(crudo().map((e) => e.id)).toContain(viejo.id);
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + viejo.id), 'su copia para Editar sigue').not.toBeNull();
    expect(H.madHistLeer().map((e) => e.id)).toContain(viejo.id);
  });

  it('🔴 la limpieza al entrar tampoco: se va lo caducado, y lo que espera se queda', () => {
    envejecer(8);
    const [viejo] = crudo();
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify([...crudo(), { ...viejo, id: 'caducado', envio: 'ya-no-esta', panel: true }]));
    almacen.setItem(H.MAD_HIST_PANEL_PRE + 'caducado', '<div>x</div>');
    expect(H._madHistPodar()).toBe(1);
    expect(crudo().map((e) => e.id)).toEqual([viejo.id]);
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + 'caducado')).toBeNull();
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + viejo.id)).not.toBeNull();
  });

  it('🔴 su copia para Editar no cuenta en el tope de 10 por ficha: las 10 más nuevas guardan la suya', () => {
    envejecer(8);
    const [viejo] = crudo();
    const nuevas = Array.from({ length: 10 }, (_, i) => ({ ...viejo, id: 'nueva' + i, envio: 'enviada' + i, ts: Date.now() - i * 1000, panel: true }));
    nuevas.forEach((e) => almacen.setItem(H.MAD_HIST_PANEL_PRE + e.id, '<div>n</div>'));
    expect(H._madHistGuardar([viejo, ...nuevas])).toBe(true);
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + viejo.id), 'la que espera conserva la suya').not.toBeNull();
    nuevas.forEach((e) => expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + e.id), e.id).not.toBeNull());
    expect(crudo().filter((e) => e.panel)).toHaveLength(11);
  });

  it('🔴 tampoco lo saca el tope de 200 envíos por ficha', () => {
    envejecer(8);
    const [viejo] = crudo();
    const nuevas = Array.from({ length: 200 }, (_, i) => ({ ...viejo, id: 'n' + i, envio: 'e' + i, ts: Date.now() - i * 1000, panel: false }));
    H._madHistGuardar([viejo, ...nuevas]);
    expect(crudo()).toHaveLength(201);
    expect(crudo().map((e) => e.id)).toContain(viejo.id);
    H._madHistGuardar([viejo, ...nuevas, { ...viejo, id: 'n200', envio: 'e200', ts: Date.now() - 300 * 1000, panel: false }]);
    expect(crudo().map((e) => e.id), 'el tope sigue para lo demás').not.toContain('n200');
  });

  it('🔴 en cuanto llega, el siguiente guardado ya lo quita, con su copia', async () => {
    envejecer(8);
    const [viejo] = crudo();
    await H.flushSyncQueue();
    expect(H._loadSyncQueue()).toEqual([]);
    H._madHistGuardar(crudo());
    expect(crudo()).toEqual([]);
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + viejo.id)).toBeNull();
  });
});

describe('🔴 el Historial lista lo que la poda deja en el equipo', () => {
  const parte = (fecha, syncedAt) => rec(fecha, { syncedAt, data: { fecha, sala: 'Sala 2', tanque: 16, parte: 1, hora: '08:00', cerrado: 1, hembras_muertas: 2 } });
  it('🔴 un parte de hace 10 días, enviado ayer, sale', () => {
    poner('tanques', [parte(hace(10), Date.now() - DIA)]);
    H._madLimpiezaDeEspacio();
    expect(H.loadMad('tanques').length).toBe(1);
    expect(H._madHistGrillas().filter((g) => g.ficha === 'tanques').length).toBe(1);
  });
  it('🔵 uno de hace 10 días, enviado hace 9, no', () => {
    poner('tanques', [parte(hace(10), Date.now() - 9 * DIA)]);
    expect(H._madHistGrillas().filter((g) => g.ficha === 'tanques').length).toBe(0);
  });
  it('🔵 uno reciente, sí', () => {
    poner('tanques', [parte(hace(2), Date.now() - 2 * DIA)]);
    expect(H._madHistGrillas().filter((g) => g.ficha === 'tanques').length).toBe(1);
  });
});

/* 2026-11-05 (pauta A8, usuario: «Avisar y preguntar») · Pasados 7 días, lo enviado de ese día ya no está en el equipo: teclearlo volvía al parte 1
   con otra hora, y eso es otra llave: otra fila, que el libro resta dos veces. */
describe('🔴 un día de Tanques ya quitado del equipo', () => {
  let preguntas;
  let respuesta;
  beforeEach(() => {
    preguntas = [];
    respuesta = false;
    globalThis.confirm = (t) => { preguntas.push(String(t)); return respuesta; };
  });
  const teclear = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const irADia = (fecha) => {
    irASala('Sala 2');
    const el = document.getElementById('mad-tanques-fecha');
    el.value = fecha;
    H.madTanquesFechaChange();
  };
  const banner = () => document.getElementById('mad-tanques-quitado');
  const deLaSala = () => H.loadMad('tanques').filter((r) => r.data.sala === 'Sala 2');

  it('🔴 lo dice en la grilla', () => {
    irADia(hace(10));
    expect(banner()).toBeTruthy();
    expect(banner().textContent).toContain('7 días');
    expect(banner().textContent).toContain('dos veces');
  });

  it('🔵 hoy, o hace 6 días, ni lo dice ni pregunta', () => {
    irADia(hace(6));
    expect(banner()).toBeNull();
    teclear(celda(), '4');
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    expect(preguntas).toEqual([]);
  });

  it('🔵 si el equipo aún tiene lo enviado de ese día, ni lo dice ni pregunta: los partes siguen su número', () => {
    const f = hace(10);
    poner('tanques', [rec(f, { syncedAt: Date.now() - DIA, data: { fecha: f, sala: 'Sala 2', tanque: 99, parte: 3, hora: '21:00', cerrado: 1, hembras_muertas: 2 } })]);
    irADia(f);
    expect(banner()).toBeNull();
    teclear(celda(), '4');
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    expect(preguntas).toEqual([]);
    expect(deLaSala().find((r) => String(r.data.parte) === '4')).toBeTruthy();
  });

  it('🔵 otra sala de ese día no cuenta: en ésta no se sabe', () => {
    const f = hace(10);
    poner('tanques', [rec(f, { syncedAt: Date.now() - DIA, data: { fecha: f, sala: 'Sala 3', tanque: 99, parte: 3, hora: '21:00', cerrado: 1, hembras_muertas: 2 } })]);
    irADia(f);
    expect(banner()).toBeTruthy();
  });

  it('🔴 💾, «Cancelar»: no se guarda, y lo tecleado sigue', () => {
    irADia(hace(10));
    teclear(celda(), '4');
    H.saveMadTanquesGrid();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('OTRA fila');
    expect(preguntas[0]).toContain(hace(10));
    expect(deLaSala()).toEqual([]);
    expect(celda().value).toBe('4');
  });

  it('🔴 💾, «Aceptar»: es una ronda nueva, y la siguiente ya no pregunta', () => {
    irADia(hace(10));
    teclear(celda(), '4');
    respuesta = true;
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    expect(deLaSala().length).toBe(1);
    expect(preguntas).toHaveLength(1);
    teclear(celda(), '5');
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    expect(preguntas).toHaveLength(1);
  });

  it('🔴 lo autoguardado no cuenta como saberlo: el 💾 de después también pregunta', () => {
    irADia(hace(10));
    teclear(celda(), '4');
    expect(H.saveMadTanquesGrid({ silent: true })).toBeGreaterThan(0);
    expect(preguntas, 'el autoguardado no pregunta').toEqual([]);
    teclear(celda(), '5');
    H.saveMadTanquesGrid();
    expect(preguntas).toHaveLength(1);
  });

  it('🔴 ☁️, «Cancelar»: no sale nada, ni siquiera lo que estuviera pendiente de otro día', async () => {
    const f = hace(2);
    poner('tanques', [rec(f, { synced: false, syncedAt: null, data: { fecha: f, sala: 'Sala 1', tanque: 1, parte: 1, hora: '08:00', cerrado: 1, machos_muertos: 1 } })]);
    irADia(hace(10));
    teclear(celda(), '4');
    await H.syncMadTanquesGrid();
    expect(preguntas).toHaveLength(1);
    expect(envios).toHaveLength(0);
    expect(celda().value).toBe('4');
  });

  it('🔴 ☁️, «Aceptar»: sale', async () => {
    irADia(hace(10));
    teclear(celda(), '4');
    respuesta = true;
    await H.syncMadTanquesGrid();
    expect(envios).toHaveLength(1);
  });

  /* Auditoría de la A (2026-11-05, usuario: «En ☁️ y en 🔄 global») · la pregunta de arriba sólo miraba la grilla en pantalla, y ☁️ y 🔄
     envían lo pendiente de TODAS las salas: lo autoguardado de un día ya quitado salía sin preguntar desde otra sala. */
  describe('lo autoguardado en otra sala', () => {
    const conSala = (sala) => envios.some((b) => b.rows.some((f) => f.includes(sala)));
    const autoguardadoEnSala2 = () => {
      irADia(hace(10));
      teclear(celda(), '4');
      irASala('Sala 3');   // cambiar de sala lo guarda en silencio: el autoguardado no pregunta
      expect(preguntas, 'el autoguardado no pregunta').toEqual([]);
      expect(deLaSala(), 'lo tecleado quedó guardado, sin enviar').toHaveLength(1);
      const el = document.getElementById('mad-tanques-fecha');
      el.value = hace(0);
      H.madTanquesFechaChange();
      teclear(celda(), '1');
    };

    it('🔴 ☁️ pregunta por él, diciendo el día y la sala; «Cancelar» envía sólo lo demás', async () => {
      autoguardadoEnSala2();
      await H.syncMadTanquesGrid();
      expect(preguntas).toHaveLength(1);
      expect(preguntas[0]).toContain('Sala 2 del ' + hace(10));
      expect(preguntas[0]).toContain('OTRA fila');
      expect(envios).toHaveLength(1);
      expect(conSala('Sala 3'), 'lo de esta sala sale').toBe(true);
      expect(conSala('Sala 2'), 'lo del día ya quitado, no').toBe(false);
      expect(deLaSala().every((r) => !r.synced), 'sigue guardado sin enviar').toBe(true);
      expect(avisos.join(' ')).toContain('No se enviaron los partes de Sala 2 del ' + hace(10));
    });

    it('🔴 ☁️, «Aceptar»: salen los dos', async () => {
      autoguardadoEnSala2();
      respuesta = true;
      await H.syncMadTanquesGrid();
      expect(preguntas).toHaveLength(1);
      expect(conSala('Sala 2')).toBe(true);
      expect(conSala('Sala 3')).toBe(true);
    });

    it('🔴 🔄 también pregunta, y «Cancelar» no lo envía', async () => {
      autoguardadoEnSala2();
      await H.syncAll();
      expect(preguntas.filter((p) => p.includes('Sala 2 del ' + hace(10)))).toHaveLength(1);
      expect(conSala('Sala 2')).toBe(false);
      expect(deLaSala().every((r) => !r.synced)).toBe(true);
      expect(avisos.join(' ')).toContain('No se enviaron los partes de Sala 2');
      expect(document.getElementById('slbl').textContent, 'no dice «Sin datos nuevos»: queda Tanques').toContain('días ya quitados');
    });

    it('🔴 sin espacio, el día de la grilla, ya respondido al guardarla, no vuelve a preguntar', async () => {
      irADia(hace(10));
      teclear(celda(), '4');
      almacen.dejarLibres(0);
      respuesta = true;
      await H.syncMadTanquesGrid();
      expect(preguntas, 'sólo la de guardar la grilla').toHaveLength(1);
      expect(conSala('Sala 2')).toBe(true);
    });

    it('🔴 🔄, «Aceptar»: sale', async () => {
      autoguardadoEnSala2();
      respuesta = true;
      await H.syncAll();
      expect(conSala('Sala 2')).toBe(true);
    });

    it('🔵 un día ya quitado que se confirmó con 💾 no vuelve a preguntar desde otra sala', async () => {
      irADia(hace(10));
      teclear(celda(), '4');
      respuesta = true;
      expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
      expect(preguntas).toHaveLength(1);
      respuesta = false;
      irASala('Sala 3');
      const el = document.getElementById('mad-tanques-fecha');
      el.value = hace(0);
      H.madTanquesFechaChange();
      teclear(celda(), '1');
      await H.syncMadTanquesGrid();
      expect(preguntas).toHaveLength(1);
      expect(conSala('Sala 2')).toBe(true);
    });
  });

  it('`_madTqDiaQuitado`: sin fecha o sin sala no hay nada que decir', () => {
    expect(H._madTqDiaQuitado([], '', 'Sala 2')).toBe(false);
    expect(H._madTqDiaQuitado([], hace(10), '')).toBe(false);
    expect(H._madTqDiaQuitado([], hace(10), 'Sala 2')).toBe(true);
    expect(H._madTqDiaQuitado([], hace(7), 'Sala 2'), 'el borde: de hace 7 días aún no se quita').toBe(false);
    expect(H._madTqDiaQuitado([], hace(8), 'Sala 2')).toBe(true);
  });
});

describe('🔴 si falta espacio, qué se suelta y en qué orden', () => {
  it('🔴 PRIMERO la copia de la MATRIZ: el guardado sale, y el Historial y sus copias ni se tocan', () => {
    irASala('Sala 2');
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify([entradaHist('fin', 'a', 1)]));
    almacen.setItem(H.MAD_HIST_PANEL_PRE + 'a', '<div>x</div>');
    copiaMatriz(20000);
    almacen.dejarLibres(5);
    celda().value = '7';
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    expect(almacen.getItem(H._REPRO_CACHE_KEY)).toBeNull();
    expect(H.loadMad('tanques').some((r) => String(r.data.hembras_muertas) === '7')).toBe(true);
    expect(JSON.parse(almacen.getItem(H.MAD_HIST_KEY)).map((e) => e.id)).toEqual(['a']);
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + 'a')).toBe('<div>x</div>');
  });

  it('🔴 sin esa copia, lo enviado fuera de plazo: el guardado sale y lo pendiente sigue', () => {
    irASala('Sala 2');
    const pend = rec(hace(30), { synced: false });
    const viejos = Array.from({ length: 40 }, () => rec(hace(30)));
    poner('tanques', [pend, ...viejos]);
    almacen.dejarLibres(5);
    celda().value = '7';
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    const queda = ids('tanques');
    expect(queda).toContain(pend.id);
    viejos.forEach((v) => expect(queda).not.toContain(v.id));
  });

  /* El anterior lo salva `saveMadList`, que limpia lo que escribe. Éste no: lo que se guarda es OTRA lista, y el sitio tiene que
     salir de quitar lo caducado de las demás (`_reclaimSpace`). */
  it('🔴 al guardar Salas, hace sitio con lo caducado de Tanques: lo pendiente de Tanques sigue', () => {
    H.setVista(H.MAD_MOD, 'salas');
    H.renderMadSalas();
    const pend = rec(hace(30), { synced: false });
    const viejos = Array.from({ length: 40 }, () => rec(hace(30)));
    poner('tanques', [pend, ...viejos]);
    almacen.dejarLibres(5);
    document.querySelector('#fp-salas [name="sg_0_temp_02"]').value = '28';
    expect(H.saveMadSalasGrid()).toBeGreaterThan(0);
    expect(ids('tanques')).toEqual([pend.id]);
    expect(H.loadMad('salas')).toHaveLength(1);
  });

  it('🔴 guardar la COPIA de la MATRIZ no hace sitio borrando nada: si no cabe, no se guarda', () => {
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify([entradaHist('fin', 'a', 1), entradaHist('fin', 'b', 2)]));
    almacen.setItem(H.MAD_HIST_PANEL_PRE + 'a', '<div>x</div>');
    almacen.dejarLibres(5);
    H._reproCacheSave([{ 'Trovan ID': 'CHIP-INVENTADO', Piscina: 'P1' }]);
    expect(almacen.getItem(H._REPRO_CACHE_KEY)).toBeNull();
    expect(JSON.parse(almacen.getItem(H.MAD_HIST_KEY))).toHaveLength(2);
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + 'a')).toBe('<div>x</div>');
  });

  it('🔴 otra escritura que usa safeSetItem también suelta primero esa copia, antes que las copias para Editar', () => {
    almacen.setItem(H.MAD_HIST_PANEL_PRE + 'a', '<div>x</div>');
    copiaMatriz(2000);
    almacen.dejarLibres(5);
    expect(H.safeSetItem('larv4_prueba', 'y'.repeat(500), { silent: true })).toBe(true);
    expect(almacen.getItem(H._REPRO_CACHE_KEY)).toBeNull();
    expect(almacen.getItem(H.MAD_HIST_PANEL_PRE + 'a')).toBe('<div>x</div>');
  });

  it('sin copia guardada, soltarla no dice que liberó nada', () => {
    expect(H._soltarCopiaMatriz()).toBeNull();
    copiaMatriz(10);
    expect(H._soltarCopiaMatriz()).toBe('la copia de la MATRIZ');
    expect(H._soltarCopiaMatriz()).toBeNull();
  });
});

describe('🧹 ⚙ Config: el indicador y el botón', () => {
  const panel = () => document.getElementById('cfg-espacio').textContent;
  afterEach(() => { H.closeCfg(); });

  it('🔴 dice cuánto se usa y lo reparte, de mayor a menor, con lo de otras apps del sitio aparte', () => {
    copiaMatriz(Math.round(H.ESPACIO_TOPE * 0.2));
    poner('tanques', [rec(hace(1))]);
    almacen.setItem('otra-app', 'z'.repeat(Math.round(H.ESPACIO_TOPE * 0.5)));
    H.openCfg();
    const t = panel();
    expect(t).toContain('Usado: 70 %');
    expect(t).toContain('Copia de la MATRIZ: 20 %');
    expect(t).toContain('Otras apps de este sitio: 50 %');
    expect(t).toContain('Salas, Tanques y Zonas: menos de 1 %');
    expect(t.indexOf('Otras apps')).toBeLessThan(t.indexOf('Copia de la MATRIZ'));
  });

  it('🔴 el color avisa: verde, ámbar desde el 75 %, rojo desde el 90 %', () => {
    const color = () => document.querySelector('#cfg-espacio div').getAttribute('style');
    almacen.setItem('otra-app', 'z'.repeat(Math.round(H.ESPACIO_TOPE * 0.74)));
    H.openCfg();
    expect(color()).toContain('#16a34a');
    almacen.setItem('otra-app', 'z'.repeat(Math.round(H.ESPACIO_TOPE * 0.76)));
    H.openCfg();
    expect(color()).toContain('#d97706');
    almacen.setItem('otra-app', 'z'.repeat(Math.round(H.ESPACIO_TOPE * 0.91)));
    H.openCfg();
    expect(color()).toContain('#dc2626');
  });

  it('🔴 mide cada cosa en su sitio: grillas, Historial con sus copias, cola, fotos y el resto de la app', () => {
    poner('salas', [rec(hace(1))]);
    almacen.setItem(H.MAD_HIST_KEY, '[]');
    almacen.setItem(H.MAD_HIST_PANEL_PRE + 'a', 'copia');
    almacen.setItem('larv4_syncqueue', '[1]');
    almacen.setItem('larv4_foto_1', 'foto');
    almacen.setItem('larv4_tras_foto_v_1', 'foto2');
    almacen.setItem('larv4_cs_1', 'cs');
    const m = H._espacioMedir();
    const tam = (k) => k.length + almacen.getItem(k).length;
    expect(m.partes.grillas).toBe(tam(H.madKey('salas')));
    expect(m.partes.historial).toBe(tam(H.MAD_HIST_KEY) + tam(H.MAD_HIST_PANEL_PRE + 'a'));
    expect(m.partes.cola).toBe(tam('larv4_syncqueue'));
    expect(m.partes.fotos).toBe(tam('larv4_foto_1') + tam('larv4_tras_foto_v_1'));
    expect(m.partes.app).toBe(tam('larv4_cs_1'));
    expect(m.total).toBe(almacen.usado());
  });

  it('🔴 el botón quita lo fuera de plazo y la copia de la MATRIZ, lo dice, repinta y deja lo pendiente', () => {
    const pend = rec(hace(30), { synced: false });
    poner('tanques', [rec(hace(30)), rec(hace(30)), pend]);
    almacen.setItem(H.MAD_HIST_KEY, JSON.stringify([entradaHist('fin', 'viejo', 20)]));
    copiaMatriz(Math.round(H.ESPACIO_TOPE * 0.3));
    H.openCfg();
    expect(panel()).toContain('Copia de la MATRIZ');
    H.liberarEspacio();
    expect(ids('tanques')).toEqual([pend.id]);
    expect(almacen.getItem(H._REPRO_CACHE_KEY)).toBeNull();
    expect(panel()).not.toContain('Copia de la MATRIZ');
    expect(avisos.at(-1)).toContain('2 registro(s) enviados');
    expect(avisos.at(-1)).toContain('1 envío(s) del Historial');
    expect(avisos.at(-1)).toContain('Liberado el 30 %');
  });

  /* 2026-11-05 (pauta A20, usuario: «Preguntar») · Sin la copia y sin red, el reproductivo no registra traslados ni eventos: no sabe qué
     hembra es cada microchip. El botón ya no la suelta sin preguntar. Cuando un guardado no cabe, se suelta sola, como antes. */
  const preguntas = [];
  const responder = (si) => { preguntas.length = 0; globalThis.confirm = (t) => { preguntas.push(String(t)); return si; }; };

  it('🔴 con la copia, pregunta antes y dice lo que se pierde sin red', () => {
    copiaMatriz(Math.round(H.ESPACIO_TOPE * 0.3));
    responder(true);
    H.liberarEspacio();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('copia de la MATRIZ');
    expect(preguntas[0]).toContain('30 %');
    expect(preguntas[0]).toMatch(/sin red/i);
    expect(preguntas[0]).toContain('traslados');
    expect(preguntas[0]).toContain('eventos');
    expect(almacen.getItem(H._REPRO_CACHE_KEY)).toBeNull();
  });

  it('🔴 «no»: la copia se queda; lo antiguo se quita igual y el aviso lo dice', () => {
    const pend = rec(hace(30), { synced: false });
    poner('tanques', [rec(hace(30)), pend]);
    copiaMatriz(1000);
    responder(false);
    H.liberarEspacio();
    expect(almacen.getItem(H._REPRO_CACHE_KEY)).not.toBeNull();
    expect(ids('tanques')).toEqual([pend.id]);
    expect(avisos.at(-1)).toContain('1 registro(s) enviados');
    expect(avisos.at(-1)).not.toContain('copia de la MATRIZ (se vuelve');
  });

  it('🔴 «no» y nada antiguo: lo dice, sin decir que la copia se fue', () => {
    copiaMatriz(1000);
    responder(false);
    H.liberarEspacio();
    expect(almacen.getItem(H._REPRO_CACHE_KEY)).not.toBeNull();
    expect(avisos.at(-1)).toContain('No hay nada antiguo que liberar');
    expect(avisos.at(-1)).toContain('la copia de la MATRIZ se queda');
  });

  it('🔴 sin copia, no pregunta', () => {
    poner('tanques', [rec(hace(30))]);
    responder(true);
    H.liberarEspacio();
    expect(preguntas).toHaveLength(0);
    expect(avisos.at(-1)).toContain('1 registro(s) enviados');
  });

  it('🔴 lo antiguo se quita antes de preguntar: lo que diga sobre la copia no lo retiene', () => {
    poner('tanques', [rec(hace(30))]);
    copiaMatriz(1000);
    globalThis.confirm = () => { preguntas.push(ids('tanques').length); return false; };
    preguntas.length = 0;
    H.liberarEspacio();
    expect(preguntas, 'al preguntar ya se había quitado lo antiguo').toEqual([0]);
  });

  it('sin nada que quitar lo dice, en vez de presumir de haber liberado', () => {
    H.liberarEspacio();
    expect(avisos.at(-1)).toContain('No hay nada antiguo que liberar');
    expect(avisos.at(-1)).not.toContain('MATRIZ');
  });

  it('🔴 el botón dice que la copia sólo se borra si se acepta', () => {
    const b = readFileSync(SHELL, 'utf8').split('\n').find((l) => l.includes('onclick="liberarEspacio()"'));
    expect(b).toContain('si lo aceptas');
  });

  it('el botón está en el panel', () => {
    expect(readFileSync(SHELL, 'utf8')).toContain('onclick="liberarEspacio()"');
  });
});
