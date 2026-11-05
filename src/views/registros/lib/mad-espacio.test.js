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
  '_madHistGuardar', 'madHistLeer', '_madHistGrillas', 'renderMadHistorial', 'openCfg', 'closeCfg', 'liberarEspacio', '_espacioMedir', 'ESPACIO_TOPE', '_gasVersionLocal', 'safeSetItem', '_madTqConfirmarRepetidas', '_loadSyncQueue', 'MAD_RECOV_KEY', 'loadMadRecovery', '_lastSyncFingerprint'];
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
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
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
    poner('tanques', [rec(hace(8), { syncedAt: Date.now() - DIA }), rec(hace(2), { syncedAt: Date.now() - DIA })]);
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

  it('sin nada que quitar lo dice, en vez de presumir de haber liberado', () => {
    H.liberarEspacio();
    expect(avisos.at(-1)).toContain('No hay nada antiguo que liberar');
  });

  it('el botón está en el panel', () => {
    expect(readFileSync(SHELL, 'utf8')).toContain('onclick="liberarEspacio()"');
  });
});
