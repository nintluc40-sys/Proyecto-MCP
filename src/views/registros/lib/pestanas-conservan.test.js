// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · lo tecleado NO se pierde al cambiar de pestaña (punto 1 de la pauta del 2026-11-12)

   Visto en Chrome el 12-11: en As Técnico, un «12» tecleado desaparecía al ir a 🌊 Mareas y volver, sin «↩ Recuperar»; en
   Traslado, un camión recién dado de alta y su medición desaparecían igual. Las dos pestañas se repintaban al ENTRAR desde lo
   GUARDADO. Decisión del usuario: «Que siga ahí» — al volver, la ficha como se dejó; cambiar de pestaña no guarda ni envía.
   Con los tres casos de la misma familia que sólo se habían visto en el código:
   · Lab. Algas: 🗑 de una fila, «🗑 Vaciar todo» y el 🔄 de arriba repintaban la ficha entera y borraban lo tecleado.
   · «← Cambiar módulo» en Larvicultura y Algas salía sin dejar la copia de «↩ Recuperar».
   · Maduración: si guardar la grilla lanzaba un error, se dejaba la grilla como si se hubiera guardado.

   Se arranca el motor ENTERO sobre el shell real (receta de `reference_banco-engine-js`), se entra con el PIN y las pestañas
   se pulsan ejecutando SU atributo `onclick` (happy-dom no corre los manejadores en línea: así quitar o cambiar el cableado
   pone la prueba en rojo).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderCalidadFicha } from '../fichas/calidad.render.js';
import { renderPlgFicha } from '../fichas/plg.render.js';
import { renderParamsFicha } from '../fichas/params.render.js';
import { renderPoblacionFicha } from '../fichas/poblacion.render.js';
import { renderCalaguaFicha } from '../fichas/calagua.render.js';
import { renderDespachoFicha } from '../fichas/despacho.render.js';
import { resolveCalidadData } from '../fichas/calidad.data.js';
import { resolvePlgData } from '../fichas/plg.data.js';
import { resolveParamsData } from '../fichas/params.data.js';
import { resolvePoblacionData } from '../fichas/poblacion.data.js';
import { resolveCalaguaData } from '../fichas/calagua.data.js';
import { resolveDespachoData } from '../fichas/despacho.data.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['PINS', 'LAB_MOD', 'MAD_MOD', 'AST_MOD',
  'pickMod', 'chkPin', 'enter', 'goBack', 'selTab',
  'AST_SUPERVISOR_OPTS', 'AST_MODULO_OPTS', 'AST_SIEMBRA_OPTS', 'AST_ESTADIO_OPTS',
  'saveAstLocal', 'editAstRecord', 'loadAst', '_trasRaw', 'trasAgregarCamion', 'trasGuardarLocal',
  'addToAlgHist', 'loadAlgHist', 'removeAlgHistConfirm', 'clearAlgHistConfirm', 'syncAll', 'loadRecovery',
  'MAD_GRID_ERROR', 'MAD_GRID_SIN_ESPACIO'];
const H = {};
const enviados = [];
let confirms = [];
let respuestaConfirm = true;

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
  // Las fichas de Larvicultura se pintan con los módulos de render del MCP, como en la app.
  window.__rgLib = { ...seguridad, ...modulos, ...repro,
    renderCalidadFicha, resolveCalidadData, renderPlgFicha, resolvePlgData, renderParamsFicha, resolveParamsData,
    renderPoblacionFicha, resolvePoblacionData, renderCalaguaFicha, resolveCalaguaData, renderDespachoFicha, resolveDespachoData };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.saveMadSalasGrid=saveMadSalasGrid; H.setSaveSalas=function(f){saveMadSalasGrid=f;}; }catch(_){}'
    + '\ntry{ H.estado=function(){ return { curMod: curMod, curTab: curTab, astSucio: _astFormDirty, trasSucio: _trasFormDirty,'
    + ' astEditing: _astEditing, madSucio: _madGridDirty }; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  // Nada sale a la red: el envío se simula y se apunta.
  H.setPost(async (payload) => { enviados.push(payload); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/PRUEBA/exec');
  H.setRate(() => true);
  window.confirm = (m) => { confirms.push(String(m)); return respuestaConfirm; };
});

beforeEach(() => {
  H.goBack();
  globalThis.localStorage.clear();
  enviados.length = 0;
  confirms = [];
  respuestaConfirm = true;
});

afterAll(() => { H.goBack(); });   // suelta el autoguardado de cada minuto

const $ = (sel) => document.querySelector(sel);
function entrar(mod) {
  H.goBack();
  H.pickMod(mod);
  const pin = document.getElementById('pin');
  pin.value = H.PINS[mod];
  H.chkPin();
  H.enter();
  expect(H.estado().curMod).toBe(mod);
}
/** Pulsa la pestaña como el usuario: ejecuta SU `onclick`. */
function pulsar(t) {
  const b = $(`#ftabs .ftab[data-f="${t}"]`);
  expect(b, 'no está la pestaña ' + t).not.toBeNull();
  new Function('selTab', b.getAttribute('onclick'))(H.selTab);
  expect(H.estado().curTab).toBe(t);
}
/** Teclea y dispara el `input` que burbujea: es lo que marca «sin guardar» en cada ficha. */
function teclear(el, valor) {
  expect(el, 'no está el campo').not.toBeNull();
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el;
}
/** Lo ELEGIDO en un <select> repintado, por el atributo `selected` (happy-dom no respeta `select.value` tras reparsear). */
const elegido = (sel) => { const o = $(sel + ' option[selected]'); return o ? o.value : ''; };
const ast = (n) => $(`#fp-ast .mad-form [name="${n}"]`);

describe('As Técnico · lo tecleado sigue ahí al volver a la pestaña', () => {
  it('🔴 un «12» en Deformidad sobrevive a ir a 🌊 Mareas y volver, sin guardarse ni enviarse', () => {
    entrar(H.AST_MOD);
    teclear(ast('deformidad'), '12');
    teclear(ast('supervisor'), H.AST_SUPERVISOR_OPTS[1]);
    pulsar('marea');
    pulsar('ast');
    expect(ast('deformidad').value, 'lo tecleado desapareció al volver').toBe('12');
    expect(elegido('#fp-ast .mad-form [name="supervisor"]')).toBe(H.AST_SUPERVISOR_OPTS[1]);
    expect(H.estado().astSucio, 'sigue SIN guardar: el aviso de cierre tiene que verlo').toBe(true);
    expect(H.loadAst(), 'cambiar de pestaña no guarda').toHaveLength(0);
    expect(enviados, 'ni envía').toHaveLength(0);
  });

  it('también al volver a pulsar la MISMA pestaña', () => {
    entrar(H.AST_MOD);
    teclear(ast('deformidad'), '7');
    pulsar('ast');
    expect(ast('deformidad').value).toBe('7');
  });

  it('🔴 editando un registro guardado: al volver sigue lo cambiado, y guardar ACTUALIZA ese registro', () => {
    entrar(H.AST_MOD);
    teclear(ast('supervisor'), H.AST_SUPERVISOR_OPTS[1]);
    teclear(ast('modulo'), H.AST_MODULO_OPTS[0]);
    teclear(ast('siembra'), H.AST_SIEMBRA_OPTS[0]);
    teclear(ast('estadio'), H.AST_ESTADIO_OPTS[0]);
    teclear(ast('comentario'), 'Primera versión');
    H.saveAstLocal();
    const [r] = H.loadAst();
    expect(r, 'no se guardó el registro de partida').toBeTruthy();
    H.editAstRecord(r.id);
    expect(ast('comentario').value).toBe('Primera versión');
    teclear(ast('comentario'), 'Corregido en la ruta');
    pulsar('traslado');
    pulsar('ast');
    expect(ast('comentario').value, 'volvió lo guardado y se perdió la corrección').toBe('Corregido en la ruta');
    expect(H.estado().astEditing, 'sigue editando ESE registro').toBe(r.id);
    // Lo de las listas sale del ATRIBUTO al repintar: se lo devolvemos como lo tiene el navegador.
    ['supervisor', 'modulo', 'siembra', 'estadio'].forEach((n) => { ast(n).value = elegido(`#fp-ast .mad-form [name="${n}"]`); });
    H.saveAstLocal();
    const lista = H.loadAst();
    expect(lista, 'guardar tras volver duplicó el registro').toHaveLength(1);
    expect(lista[0].id).toBe(r.id);
    expect(lista[0].data.comentario).toBe('Corregido en la ruta');
  });

  it('sin nada tecleado, la pestaña sale de lo guardado como siempre', () => {
    entrar(H.AST_MOD);
    pulsar('marea');
    pulsar('ast');
    expect(ast('deformidad').value).toBe('');
    expect(H.estado().astSucio).toBe(false);
  });

  it('🔴 «← Cambiar módulo» suelta lo de pantalla: al volver al módulo abre lo guardado, con su «↩ Recuperar»', () => {
    entrar(H.AST_MOD);
    teclear(ast('deformidad'), '12');
    pulsar('marea');              // lo de pantalla queda tomado…
    entrar(H.AST_MOD);            // …pero se sale del módulo y se vuelve
    expect(ast('deformidad').value, 'resucitó lo de la sesión anterior del módulo').toBe('');
    expect($('#fp-ast button.brec'), 'falta «↩ Recuperar» con lo tecleado').not.toBeNull();
  });

  it('🔴 salir del módulo DESDE la pestaña con algo tecleado tampoco lo trae al volver (ni como registro nuevo)', () => {
    entrar(H.AST_MOD);
    teclear(ast('deformidad'), '33');
    entrar(H.AST_MOD);
    expect(ast('deformidad').value).toBe('');
    expect(H.estado().astSucio).toBe(false);
  });
});

describe('Traslado · el viaje sigue como se dejó al volver a la pestaña', () => {
  const panel = () => $('#fp-traslado');
  function altaYMedida() {
    entrar(H.AST_MOD);
    pulsar('traslado');
    $('#tras-alta-placa').value = 'OBS-001';
    H.trasAgregarCamion();
    expect(panel().querySelector('.tras-camion[data-cam="0"] [data-k="placa"]').value).toBe('OBS-001');
    teclear(panel().querySelector('.tras-rev[data-rev="0"] .tras-cam-grid [data-tina="1"][data-k="o2"]'), '5');
  }
  const o2 = () => panel().querySelector('.tras-rev[data-rev="0"] .tras-cam-grid [data-tina="1"][data-k="o2"]');

  it('🔴 un camión recién dado de alta y su medición sobreviven a ir a 🌊 Mareas y volver, sin guardarse', () => {
    altaYMedida();
    pulsar('marea');
    pulsar('traslado');
    const placa = panel().querySelector('.tras-camion[data-cam="0"] [data-k="placa"]');
    expect(placa, 'el camión desapareció al volver').not.toBeNull();
    expect(placa.value).toBe('OBS-001');
    expect(o2() && o2().value, 'la medición desapareció al volver').toBe('5');
    expect(H.estado().trasSucio, 'sigue SIN guardar').toBe(true);
    expect(H._trasRaw(), 'cambiar de pestaña no guarda').toHaveLength(0);
    expect(enviados).toHaveLength(0);
  });

  it('lo guardado y sin cambios vuelve limpio (no se inventa «sin guardar»)', () => {
    altaYMedida();
    expect(H.trasGuardarLocal()).toBe(true);
    pulsar('fotos');
    pulsar('traslado');
    expect(o2().value).toBe('5');
    expect(H.estado().trasSucio).toBe(false);
  });

  it('🔴 «← Cambiar módulo» suelta lo de pantalla: al volver, el viaje guardado y su «↩ Recuperar»', () => {
    altaYMedida();
    pulsar('ast');                // lo de pantalla queda tomado…
    entrar(H.AST_MOD);            // …pero se sale del módulo y se vuelve
    pulsar('traslado');
    expect(panel().querySelector('.tras-camion'), 'resucitó lo de la sesión anterior del módulo').toBeNull();
    expect(panel().querySelector('button.brec'), 'falta «↩ Recuperar» con lo tecleado').not.toBeNull();
  });
});

describe('Lab. Algas · el historial cambia, la ficha no se borra', () => {
  const alg = (n) => $(`#fp-algas [name="${n}"]`);
  function conUnoEnHistorial() {
    entrar(H.LAB_MOD);
    teclear(alg('cel_ml'), '280000');
    H.addToAlgHist();
    expect(H.loadAlgHist(), 'no entró el registro de partida').toHaveLength(1);
    expect(alg('cel_ml').value, 'tras agregar, la ficha se vacía para el siguiente').toBe('');
    teclear(alg('cel_ml'), '350000');
    teclear(alg('salinidad'), '32.5');
  }
  /** Pulsa un botón por SU `onclick`, dándole la función del motor que nombra. */
  function pulsarBoton(sel, nombre) {
    const b = $(sel);
    expect(b, 'no está el botón ' + sel).not.toBeNull();
    new Function(nombre, b.getAttribute('onclick'))(H[nombre]);
  }

  it('🔴 🗑 de una fila del historial no borra lo que se está tecleando en la ficha', () => {
    conUnoEnHistorial();
    pulsarBoton('#fp-algas .alg-hist-del', 'removeAlgHistConfirm');
    expect(H.loadAlgHist()).toHaveLength(0);
    expect(alg('cel_ml').value, 'se borró lo tecleado').toBe('350000');
    expect(alg('salinidad').value).toBe('32.5');
  });

  it('🔴 «🗑 Vaciar todo» tampoco', () => {
    conUnoEnHistorial();
    pulsarBoton('#fp-algas .alg-hist-h .btn.bd', 'clearAlgHistConfirm');
    expect(H.loadAlgHist()).toHaveLength(0);
    expect(alg('cel_ml').value).toBe('350000');
  });

  it('🔴 ni el 🔄 de arriba al enviar el historial', async () => {
    conUnoEnHistorial();
    await H.syncAll();
    expect(enviados.length, 'no se envió el historial').toBeGreaterThan(0);
    expect(H.loadAlgHist(), 'lo enviado sale del historial').toHaveLength(0);
    expect(alg('cel_ml').value).toBe('350000');
    expect(alg('salinidad').value).toBe('32.5');
  });

  it('lo que se cancela o se agrega SÍ vacía la ficha (eso no cambia)', () => {
    conUnoEnHistorial();
    H.addToAlgHist();
    expect(H.loadAlgHist()).toHaveLength(2);
    expect(alg('cel_ml').value).toBe('');
  });
});

describe('«← Cambiar módulo» deja la copia de «↩ Recuperar» de lo tecleado', () => {
  it('🔴 Larvicultura: lo tecleado en una ficha sale con su copia, sin esperar al autoguardado de cada minuto', () => {
    entrar(1);
    const el = $('#fp-calidad input[type="number"][name]');
    teclear(el, '4');
    H.goBack();
    const rec = H.loadRecovery(1, 'calidad');
    expect(rec, 'salió sin dejar la copia').not.toBeNull();
    expect(Number(rec.data[el.name])).toBe(4);
  });

  it('el autoguardado de cada minuto sigue respaldando las fichas (la misma regla, ahora en una función)', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      entrar(1);                                   // arranca el autoguardado con el reloj simulado
      const el = $('#fp-calidad input[type="number"][name]');
      teclear(el, '6');
      expect(H.loadRecovery(1, 'calidad')).toBeNull();
      vi.advanceTimersByTime(60000);
      const rec = H.loadRecovery(1, 'calidad');
      expect(rec, 'el autoguardado dejó de respaldar').not.toBeNull();
      expect(Number(rec.data[el.name])).toBe(6);
      H.goBack();
    } finally { vi.useRealTimers(); }
  });

  it('sin nada tecleado no siembra «↩ Recuperar»', () => {
    entrar(1);
    H.goBack();
    ['calidad', 'plg', 'params', 'poblacion', 'calagua', 'despacho', 'desinfeccion'].forEach((f) => {
      expect(H.loadRecovery(1, f), 'copia de ' + f + ' sin haber tecleado nada').toBeNull();
    });
  });

  it('🔴 Lab. Algas: lo que no está en el historial sale con su copia', () => {
    entrar(H.LAB_MOD);
    teclear($('#fp-algas [name="cel_ml"]'), '410000');
    H.goBack();
    const rec = H.loadRecovery(H.LAB_MOD, 'algas');
    expect(rec, 'salió sin dejar la copia').not.toBeNull();
    expect(Number(rec.data.cel_ml)).toBe(410000);
  });

  it('Lab. Algas recién agregado al historial: no hay nada que copiar', () => {
    entrar(H.LAB_MOD);
    teclear($('#fp-algas [name="cel_ml"]'), '410000');
    H.addToAlgHist();
    H.goBack();
    expect(H.loadRecovery(H.LAB_MOD, 'algas')).toBeNull();
  });
});

describe('Maduración · si guardar la grilla falla por un error, se pregunta antes de dejarla', () => {
  function salasConAlgoTecleado() {
    entrar(H.MAD_MOD);
    pulsar('salas');
    const celda = Array.from(document.querySelectorAll('#fp-salas input')).find((x) => !x.closest('.meta') && x.type !== 'hidden');
    expect(celda, 'no hay celdas en la grilla de Salas').toBeTruthy();
    teclear(celda, '28');
    expect(H.estado().madSucio).toBe(true);
  }
  const conError = () => H.setSaveSalas(() => { throw new Error('fallo simulado'); });

  it('🔴 con un error al guardar, NO se deja la grilla sin preguntar; Cancelar se queda en ella', () => {
    salasConAlgoTecleado();
    conError();
    try {
      respuestaConfirm = false;
      const b = $('#ftabs .ftab[data-f="tanques"]');
      new Function('selTab', b.getAttribute('onclick'))(H.selTab);
      expect(confirms.length, 'se dejó la grilla sin preguntar').toBeGreaterThan(0);
      expect(confirms[confirms.length - 1], 'el aviso culpa al espacio cuando ha sido un error').toBe(H.MAD_GRID_ERROR);
      expect(H.estado().curTab, 'Cancelar = quedarse con lo tecleado').toBe('salas');
    } finally { H.setSaveSalas(H.saveMadSalasGrid); }
  });

  it('Aceptar sí la deja', () => {
    salasConAlgoTecleado();
    conError();
    try {
      respuestaConfirm = true;
      const b = $('#ftabs .ftab[data-f="tanques"]');
      new Function('selTab', b.getAttribute('onclick'))(H.selTab);
      expect(H.estado().curTab).toBe('tanques');
    } finally { H.setSaveSalas(H.saveMadSalasGrid); }
  });

  it('tras un error, la falta de ESPACIO vuelve a decirse con su propio aviso', () => {
    salasConAlgoTecleado();
    const tanques = () => new Function('selTab', $('#ftabs .ftab[data-f="tanques"]').getAttribute('onclick'))(H.selTab);
    try {
      respuestaConfirm = false;
      conError();
      tanques();
      expect(confirms[confirms.length - 1]).toBe(H.MAD_GRID_ERROR);
      H.setSaveSalas(() => -1);                  // así responde guardar cuando el equipo no tiene sitio
      tanques();
      expect(confirms[confirms.length - 1], 'se quedó con el aviso del error anterior').toBe(H.MAD_GRID_SIN_ESPACIO);
      expect(H.estado().curTab).toBe('salas');
    } finally { H.setSaveSalas(H.saveMadSalasGrid); }
  });

  it('sin error, guarda y cambia de pestaña sin preguntar (eso no cambia)', () => {
    salasConAlgoTecleado();
    pulsar('tanques');
    expect(confirms).toHaveLength(0);
  });
});
