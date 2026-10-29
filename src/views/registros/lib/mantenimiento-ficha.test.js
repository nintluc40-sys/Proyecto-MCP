// @vitest-environment happy-dom
/* ============================================================
   🔧 MANTENIMIENTO · el módulo 16 de Registros y sus dos fichas (2026-10-28)

   Pedido del usuario (ronda 10, tarea 4): el apartado de Mantenimiento en la carátula de Registros, a partir del Excel
   de los Blowers Kaeser. Decisiones del usuario: baldosa propia con su PIN (2024); hojas «Mantenimiento Trabajos» y
   «Mantenimiento Lecturas»; las listas en la app y la ficha técnica en el libro. Se ejerce el motor REAL (engine.js) con
   el marcado de shell.html, como las demás pruebas de Registros. Las reglas puras están en
   ficha-mantenimiento.schema.test.js; aquí, lo que el técnico ve y lo que queda en el dispositivo y en la cola.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MNT_MOD', 'MNT_TABS', 'TAB_META', 'PINS', 'MNT_TRAB_HEADERS', 'MNT_LECT_HEADERS', 'MNT_RONDA_DRAFT_KEY',
  'buildGrid', 'pickMod', 'chkPin', 'enter', 'goBack', 'selTab', 'isValidMod', 'isStdMod', 'mLabel',
  'renderMntRonda', 'renderMntTrabajo', 'mntRondaCampo', 'mntRondaCelda', 'mntTrabCampo', 'mntRondaGuardar', 'mntTrabGuardar',
  'mntRondaEnviar', 'mntRondaNueva', 'mntTrabNuevo', 'mntRondaAbrirEl', 'mntTrabAbrirEl', 'mntTrabBorrarEl', 'loadMntRondas', 'loadMntTrabajos',
  'mntPendientes', 'syncAllPendingMnt', '_reconcileMark', 'updateDots'];
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
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.estado=function(){ return { curMod: curMod, curTab: curTab }; }; }catch(_){}'
    + '\ntry{ H.olvidar=function(){ _mntRonda=null; _mntTrab=null; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => { H.ultimoAviso = m; });
  H.setRate(() => true);
});

beforeEach(() => {
  globalThis.localStorage.clear();
  H.olvidar();
  H.ultimoAviso = '';
  window.confirm = () => true;
  H.renderMntRonda();
  H.renderMntTrabajo();
});

const $ = (sel) => document.querySelector(sel);
/** Teclea en un campo REAL de la ficha (como el técnico): pone el valor y llama al manejador que nombra SU atributo
    (el motor corre dentro de new Function, así que el atributo en línea no ve sus funciones: se lee y se llama). */
function teclear(sel, valor) {
  const el = $(sel);
  expect(el, 'no está el campo ' + sel).not.toBeNull();
  el.value = valor;
  const attr = el.getAttribute(el.tagName === 'SELECT' ? 'onchange' : 'oninput') || '';
  const fn = /^(\w+)\(this\)$/.exec(attr);
  expect(fn && typeof H[fn[1]], 'el campo ' + sel + ' no llama a un manejador exportado: ' + attr).toBe('function');
  H[fn[1]](el);
  return el;
}
const celda = (eq, k) => '#fp-mntronda input[data-mq="' + eq + '"][data-mk="' + k + '"]';
const campo = (k) => '#fp-mnttrabajo [data-mk="' + k + '"]';
/** Lo ELEGIDO en un <select> repintado, por el ATRIBUTO `selected`: happy-dom no lo respeta al reparsear y su `select.value`
    devuelve otra opción (happy-dom-limites.test.js). '' si no hay ninguna marcada. */
const elegido = (sel) => { const o = document.querySelector(sel + ' option[selected]'); return o ? o.value : ''; };
function trabajoCompleto(v = {}) {
  const t = { equipo: 'BLW-03', tipo: 'Preventivo', actividad: 'Cambio de aceite', horometro: '927,30', ...v };
  Object.entries(t).forEach(([k, x]) => teclear(campo(k), x));
}

describe('Mantenimiento · la baldosa de la carátula y su PIN', () => {
  it('🔴 la carátula tiene la baldosa «🔧 Mantenim.», el módulo 16 es válido y NO es de larvicultura', () => {
    H.goBack();
    const t = document.getElementById('mc16');
    expect(t, 'falta la baldosa').not.toBeNull();
    expect(t.textContent).toContain('🔧');
    expect(t.textContent).toContain('Mantenim.');
    expect(t.classList.contains('mc-mnt')).toBe(true);
    expect(H.MNT_MOD).toBe(16);
    expect(H.isValidMod(16)).toBe(true);
    expect(H.isStdMod(16), 'si fuera estándar, entraría con las fichas de un módulo M').toBe(false);
    expect(H.mLabel(16)).toBe('Mnt');
  });

  it('🔴 sólo entra con SU PIN (2024, decisión del usuario), y entra a la Ronda con sus dos pestañas', () => {
    H.goBack();
    H.pickMod(16);
    const pin = document.getElementById('pin');
    pin.value = '2023';
    H.chkPin();
    expect(document.getElementById('btn-go').disabled, 'el PIN de Biomol no abre Mantenimiento').toBe(true);
    pin.value = '2024';
    H.chkPin();
    expect(document.getElementById('btn-go').disabled).toBe(false);
    H.enter();
    expect(H.estado()).toEqual({ curMod: 16, curTab: 'mntronda' });
    expect(document.getElementById('tb-badge').className).toContain('mnt');
    const tabs = [...document.querySelectorAll('#ftabs .ftab')].map((b) => b.dataset.f);
    expect(tabs).toEqual(['mntronda', 'mnttrabajo']);
    expect(document.getElementById('fp-mntronda').classList.contains('on')).toBe(true);
    H.selTab('mnttrabajo');
    expect(document.getElementById('fp-mnttrabajo').classList.contains('on')).toBe(true);
    H.selTab('calidad');
    expect(H.estado().curTab, 'una pestaña de otro módulo no se abre aquí').toBe('mnttrabajo');
    H.goBack();
  });

  it('la baldosa se enciende con lo pendiente de cualquiera de las dos fichas', () => {
    H.goBack();
    expect(document.getElementById('mc16').className).not.toContain('pend');
    teclear(celda('BLW-01', 'horometro'), '702,40');
    H.mntRondaGuardar();
    H.goBack();
    expect(document.getElementById('mc16').className).toContain('pend');
  });
});

describe('Mantenimiento · 📋 Ronda', () => {
  it('una fila por cada uno de los 11 blowers, con su modelo', () => {
    const filas = [...document.querySelectorAll('#fp-mntronda tr[data-mnt-eq]')];
    expect(filas.map((f) => f.dataset.mntEq)).toEqual(Array.from({ length: 11 }, (_, i) => 'BLW-' + String(i + 1).padStart(2, '0')));
    expect(filas[10].textContent).toContain('FB 621 C');
  });

  it('lo tecleado se guarda AL INSTANTE en el borrador (cerrar la app no lo pierde)', () => {
    teclear(celda('BLW-02', 'horometro'), '1028,42');
    teclear(celda('BLW-02', 'presion'), '4');
    const b = JSON.parse(localStorage.getItem(H.MNT_RONDA_DRAFT_KEY));
    expect(b.equipos['BLW-02']).toEqual({ horometro: '1028,42', presion: '4' });
    H.olvidar();
    H.renderMntRonda();
    expect($(celda('BLW-02', 'horometro')).value, 'vuelve del borrador').toBe('1028,42');
  });

  it('🔴 Guardar: valida, queda PENDIENTE con una fila por equipo anotado; abierta con ✏️ y guardada otra vez, se sustituye', () => {
    H.mntRondaGuardar();
    expect(H.ultimoAviso).toContain('anota al menos un equipo');
    expect(H.loadMntRondas()).toHaveLength(0);
    teclear(celda('BLW-02', 'horometro'), '1028,42');
    teclear(celda('BLW-09', 'horometro'), '534,51');
    teclear(celda('BLW-09', 'obs'), 'tablero atrasado');
    H.mntRondaGuardar();
    let l = H.loadMntRondas();
    expect(l).toHaveLength(1);
    expect(l[0].synced).toBe(false);
    expect(H.ultimoAviso).toContain('2 equipo(s)');
    expect(document.querySelector('#fp-mntronda').textContent).toContain('pendiente');
    H.mntRondaAbrirEl(document.querySelector('#fp-mntronda button[data-mnt-id][onclick*="Abrir"]'));
    expect($(celda('BLW-02', 'horometro')).value, '✏️ Abrir la trae a la pantalla').toBe('1028,42');
    teclear(celda('BLW-02', 'horometro'), '1030');
    H.mntRondaGuardar();
    l = H.loadMntRondas();
    expect(l, 'la MISMA ronda se sustituye, no se duplica').toHaveLength(1);
    expect(l[0].data.equipos['BLW-02'].horometro).toBe('1030');
  });

  it('🔴 guardada, la ficha EMPIEZA OTRA: la ronda siguiente no pisa la guardada (mismo ID = la sustituiría)', () => {
    teclear(celda('BLW-02', 'horometro'), '1028,42');
    H.mntRondaGuardar();
    expect($(celda('BLW-02', 'horometro')).value, 'la pantalla queda en blanco').toBe('');
    teclear(celda('BLW-02', 'horometro'), '1040');
    H.mntRondaGuardar();
    const l = H.loadMntRondas();
    expect(l).toHaveLength(2);
    expect(l.map((r) => r.data.equipos['BLW-02'].horometro)).toEqual(['1028,42', '1040']);
    expect(l[0].id).not.toBe(l[1].id);
  });

  it('una lectura imposible no se guarda y dice cuál', () => {
    teclear(celda('BLW-04', 'temperatura'), '400');
    H.mntRondaGuardar();
    expect(H.ultimoAviso).toContain('BLW-04: Temperatura (°C) fuera de lo posible');
    expect(H.loadMntRondas()).toHaveLength(0);
  });

  it('«Nueva ronda» pregunta si lo anotado no se guardó, y empieza en blanco con otro ID', () => {
    const id = JSON.parse(localStorage.getItem(H.MNT_RONDA_DRAFT_KEY) || '{}').id;
    teclear(celda('BLW-01', 'horometro'), '5');
    let preguntado = false;
    window.confirm = () => { preguntado = true; return false; };
    H.mntRondaNueva();
    expect(preguntado).toBe(true);
    expect($(celda('BLW-01', 'horometro')).value, '«no» lo deja como estaba').toBe('5');
    window.confirm = () => true;
    H.mntRondaNueva();
    expect($(celda('BLW-01', 'horometro')).value).toBe('');
    expect(JSON.parse(localStorage.getItem(H.MNT_RONDA_DRAFT_KEY)).id).not.toBe(id);
  });
});

describe('Mantenimiento · 🔧 Trabajo', () => {
  it('las listas del Excel en sus selectores', () => {
    const opts = (k) => [...document.querySelectorAll(campo(k) + ' option')].map((o) => o.value).filter(Boolean);
    expect(opts('equipo')).toHaveLength(11);
    expect(opts('tipo')).toEqual(['Preventivo', 'Correctivo', 'Predictivo', 'Inspección']);
    expect(opts('actividad')).toHaveLength(10);
    expect(elegido(campo('estado')), 'arranca en Completado').toBe('Completado');
  });

  it('🔴 Guardar: lo que falta se dice y no guarda; completo queda PENDIENTE y la ficha empieza otro; corregido con ✏️, se sustituye', () => {
    H.mntTrabGuardar();
    expect(H.ultimoAviso).toContain('falta el equipo, el tipo, la actividad, el horómetro');
    expect(H.loadMntTrabajos()).toHaveLength(0);
    trabajoCompleto();
    H.mntTrabGuardar();
    expect(H.loadMntTrabajos()).toHaveLength(1);
    expect(elegido(campo('equipo')), 'empieza otro trabajo').toBe('');
    H.mntTrabAbrirEl(document.querySelector('#fp-mnttrabajo button[data-mnt-id][onclick*="Abrir"]'));
    expect(elegido(campo('equipo')), '✏️ Abrir lo trae a la pantalla').toBe('BLW-03');
    teclear(campo('observaciones'), 'Horómetro ESTIMADO');
    H.mntTrabGuardar();
    const l = H.loadMntTrabajos();
    expect(l).toHaveLength(1);
    expect(l[0].data.observaciones).toBe('Horómetro ESTIMADO');
  });

  it('🔴 un correctivo completado sin parada no se guarda; con inicio y fin, sí, y la parada se ve calculada', () => {
    trabajoCompleto({ tipo: 'Correctivo', actividad: 'Reparación / correctivo' });
    H.mntTrabGuardar();
    expect(H.ultimoAviso).toContain('un correctivo completado necesita su parada');
    teclear(campo('horaInicio'), '08:00');
    teclear(campo('horaFin'), '09:30');
    expect(document.getElementById('mnt-parada').placeholder).toBe('1.5 (de inicio a fin)');
    H.mntTrabGuardar();
    expect(H.loadMntTrabajos()).toHaveLength(1);
  });

  it('🔴 si el horómetro BAJA respecto a lo ya anotado, pregunta; «no» no guarda', () => {
    teclear(celda('BLW-03', 'horometro'), '927,30');
    H.mntRondaGuardar();
    H.renderMntTrabajo();
    expect(document.getElementById('mnt-ultimo').textContent).toBe('');
    trabajoCompleto({ horometro: '900' });
    expect(document.getElementById('mnt-ultimo').textContent, 'la pista del último horómetro').toContain('927.3 h');
    let texto = '';
    window.confirm = (t) => { texto = t; return false; };
    H.mntTrabGuardar();
    expect(texto).toContain('BLW-03: 900 h, y el');
    expect(texto).toContain('ya marcaba 927.3 h');
    expect(H.loadMntTrabajos()).toHaveLength(0);
    window.confirm = () => true;
    H.mntTrabGuardar();
    expect(H.loadMntTrabajos(), '«sí» guarda').toHaveLength(1);
  });

  it('quitar uno NO enviado pregunta y avisa de que se pierde', () => {
    trabajoCompleto();
    H.mntTrabGuardar();
    let texto = '';
    window.confirm = (t) => { texto = t; return true; };
    const b = document.querySelector('#fp-mnttrabajo button[data-mnt-id]:not([onclick*="Abrir"])');
    H.mntTrabBorrarEl(b);
    expect(texto).toContain('NO se ha enviado');
    expect(H.loadMntTrabajos()).toHaveLength(0);
  });
});

describe('Mantenimiento · el envío y la cola', () => {
  it('🔴 envía cada registro a SU hoja, con su cabecera, y los marca enviados', async () => {
    teclear(celda('BLW-05', 'horometro'), '483,35');
    H.mntRondaGuardar();
    trabajoCompleto();
    H.mntTrabGuardar();
    const envios = [];
    H.setPost(async (payload, _url, opts) => { envios.push({ payload, opts }); return true; });
    await H.syncAllPendingMnt();
    expect(envios.map((e) => e.payload.sheetName)).toEqual(['Mantenimiento Lecturas', 'Mantenimiento Trabajos']);
    expect(envios[0].payload.headers).toEqual(H.MNT_LECT_HEADERS);
    expect(envios[1].payload.headers).toEqual(H.MNT_TRAB_HEADERS);
    expect(envios[0].opts.mark.kind).toBe('mntronda');
    expect(envios[1].opts.mark.kind).toBe('mnttrabajo');
    expect(H.mntPendientes()).toBe(0);
  });

  it('si las rondas no salen, no se insiste con los trabajos y todo sigue pendiente', async () => {
    teclear(celda('BLW-05', 'horometro'), '483,35');
    H.mntRondaGuardar();
    trabajoCompleto();
    H.mntTrabGuardar();
    const envios = [];
    H.setPost(async (payload, _url, opts) => { envios.push(payload.sheetName); opts.outcome = 'queued'; return false; });
    await H.syncAllPendingMnt();
    expect(envios).toEqual(['Mantenimiento Lecturas']);
    expect(H.mntPendientes()).toBe(2);
  });

  it('🔴 la cola concilia por la VERSIÓN: la entregada marca, una corregida después no', () => {
    trabajoCompleto();
    H.mntTrabGuardar();
    const r = H.loadMntTrabajos()[0];
    expect(H._reconcileMark({ kind: 'mnttrabajo', keys: [r.id + '@' + (r.ts - 1)] })).toBe(false);
    expect(H.loadMntTrabajos()[0].synced).toBe(false);
    H._reconcileMark({ kind: 'mnttrabajo', keys: [r.id + '@' + r.ts] });
    expect(H.loadMntTrabajos()[0].synced).toBe(true);
    teclear(celda('BLW-06', 'horometro'), '839,46');
    H.mntRondaGuardar();
    const q = H.loadMntRondas()[0];
    H._reconcileMark({ kind: 'mntronda', keys: [q.id + '@' + q.ts] });
    expect(H.loadMntRondas()[0].synced).toBe(true);
  });
});

/* 2026-10-28 (usuario: «Anularla en la hoja») · la hoja cambia las filas de una ronda por su ID y un equipo vacío no se
   envía: corregir una ronda ENVIADA vaciando un equipo dejaba su fila vieja en la hoja, con su horómetro. */
describe('Mantenimiento · corregir una ronda: los equipos que se vacían se ANULAN en la hoja', () => {
  const enviar = async () => {
    const envios = [];
    H.setPost(async (payload) => { envios.push(payload); return true; });
    await H.syncAllPendingMnt();
    return envios;
  };
  const abrir = () => H.mntRondaAbrirEl(document.querySelector('#fp-mntronda button[data-mnt-id][onclick*="Abrir"]'));

  it('🔴 vaciado y reenviado, su fila va con el MISMO ID, sin lecturas y «Anulada en la ficha»', async () => {
    teclear(celda('BLW-01', 'horometro'), '1000');
    teclear(celda('BLW-02', 'horometro'), '9000');
    H.mntRondaGuardar();
    const id = H.loadMntRondas()[0].id;
    expect((await enviar())[0].rows.map((r) => r[2])).toEqual(['BLW-01', 'BLW-02']);
    abrir();
    teclear(celda('BLW-02', 'horometro'), '');
    teclear(celda('BLW-03', 'horometro'), '9000');
    H.mntRondaGuardar();
    expect(H.ultimoAviso).toContain('(2 equipo(s) · 1 anulado(s))');
    expect(document.querySelector('#fp-mntronda').textContent).toContain('2 equipo(s) · 1 anulado(s)');
    const filas = (await enviar())[0].rows;
    expect(filas.map((r) => r[2])).toEqual(['BLW-01', 'BLW-02', 'BLW-03']);
    expect(filas[1]).toEqual([filas[0][0], filas[0][1], 'BLW-02', '', '', '', '', filas[0][7], 'Anulada en la ficha', id + '-BLW-02']);
    expect(H.mntPendientes()).toBe(0);
  });

  it('una ronda que se vacía ENTERA se puede guardar y enviar: sólo lleva sus filas anuladas', async () => {
    teclear(celda('BLW-04', 'horometro'), '513,38');
    H.mntRondaGuardar();
    await enviar();
    abrir();
    teclear(celda('BLW-04', 'horometro'), '');
    H.mntRondaGuardar();
    expect(H.ultimoAviso).not.toContain('anota al menos un equipo');
    const filas = (await enviar())[0].rows;
    expect(filas).toHaveLength(1);
    expect(filas[0].slice(2, 9)).toEqual(['BLW-04', '', '', '', '', filas[0][7], 'Anulada en la ficha']);
  });

  it('lo que sólo se tecleó (nunca guardado) no se anula', async () => {
    teclear(celda('BLW-01', 'horometro'), '1');
    teclear(celda('BLW-01', 'horometro'), '');
    teclear(celda('BLW-02', 'horometro'), '2');
    H.mntRondaGuardar();
    expect((await enviar())[0].rows.map((r) => r[2])).toEqual(['BLW-02']);
  });
});
