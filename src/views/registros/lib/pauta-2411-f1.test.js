// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 1 (lo tecleado se borra) de la revisión del 15-11. Motor REAL; las piezas de
   alrededor se sustituyen con `poner`. Datos FICTICIOS.
   T6.2 Biomol: una fila vaciada no vuelve al repintar · T7.2 Traslado: «Revisar» pregunta aunque la bandera esté apagada ·
   T8.4 Blanco: lo corregido se queda al dejar la pestaña y salir pregunta · T4.8 Movimientos: no envía otra cosa si se abrió
   una corrección en la espera · T5.6 «Reabrir el parte» no sigue si lo tecleado no se pudo guardar.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderBiomol', '_collectBioGrid', 'saveBioGrid', 'bioPatCambio', 'bioPatInput', '_bioDirty',
  'trasHistRevisar', '_blancoTomarPantalla', '_blancoEditado', 'goBack', 'madMovGuardar', 'madTanquesReabrirParte', 'selTab', 'today'];
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
    + '\nH.poner=function(n,v){ eval(n+"=v"); };'
    + '\nH.leer=function(n){ return eval(n); };\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
});
beforeEach(() => { globalThis.localStorage.clear(); avisos.length = 0; window.confirm = () => false; globalThis.confirm = window.confirm; });

describe('T6.2 · Biomol: una fila vaciada a mano no vuelve con lo guardado al marcar «Positivo» en otra', () => {
  const fp = () => document.getElementById('fp-biomol');
  const celda = (fila, k) => fp().querySelector(`[name="bg_${fila}_${k}"]`);
  const teclear = (fila, k, valor) => {
    const c = celda(fila, k);
    c.value = valor;
    new Function('bioPatCambio', 'bioPatInput', '_bioDirty', c.getAttribute('oninput')).call(c, H.bioPatCambio, H.bioPatInput, H._bioDirty);
  };
  it('🔴 la fila 7 vaciada sigue vacía tras el repintado', () => {
    H.poner('curMod', 15); H.poner('curTab', 'biomol');
    H.renderBiomol();
    celda(7, 'wssv').value = 'Negativo';
    celda(7, 'wssv').dispatchEvent(new Event('input', { bubbles: true }));
    expect(H.saveBioGrid({ silent: true })).not.toBe(false);
    H.renderBiomol();
    expect(celda(7, 'wssv').value, 'lo guardado se pinta').toBe('Negativo');
    fp().querySelectorAll('[name^="bg_7_"]').forEach((el) => { el.value = ''; });
    teclear(3, 'wssv', 'Positivo');
    expect(celda(7, 'wssv').value, 'la fila vaciada volvió con lo guardado').toBe('');
    expect(celda(3, 'wssv').value).toBe('Positivo');
  });
});

describe('T7.2 · Traslado: «🔍 Revisar» pregunta si lo de pantalla no está guardado, aunque la bandera esté apagada', () => {
  it('🔴 con cambios sin guardar y Cancelar, se queda en el viaje abierto', () => {
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return false; }; globalThis.confirm = window.confirm;
    H.poner('loadTras', () => [{ id: 'v2', data: {} }]);
    H.poner('_trasViajeActivo', 'v1');
    H.poner('_trasFormDirty', false);
    H.poner('collectTraslado', () => ({ fecha: '2026-11-20', placa: 'ABC-1', o2: '5' }));
    H.poner('trasRegistroActivo', () => ({ data: { fecha: '2026-11-20', placa: 'ABC-1' } }));
    H.poner('trasTieneDatos', () => true);
    H.trasHistRevisar('v2');
    expect(preguntas).toHaveLength(1);
    expect(H.leer('_trasViajeActivo')).toBe('v1');
  });
});

describe('T8.4 · 📝 Blanco: lo corregido no se pierde sin aviso', () => {
  const cargar = () => { H.poner('_blancoState', { ficha: 'calidad', histId: 'h1', data: { a: '1', b: '2' }, orig: { a: '1', b: '2' } }); };
  it('🔴 al dejar la pestaña, lo de pantalla queda en el estado (y al volver se pinta eso)', () => {
    cargar();
    H.poner('curTab', 'blanco');
    H.poner('collectBlanco', () => ({ a: '9', b: '2' }));
    H._blancoTomarPantalla();
    expect(H.leer('_blancoState').data.a).toBe('9');
  });
  it('🔴 salir del módulo con correcciones sin enviar pregunta, y Cancelar no las pierde', () => {
    cargar();
    H.poner('curTab', 'calidad');
    H.leer('_blancoState').data.a = '9';
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return false; }; globalThis.confirm = window.confirm;
    H.goBack();
    expect(preguntas[0]).toMatch(/Blanco tiene correcciones SIN ENVIAR/);
    expect(H.leer('_blancoState')).not.toBeNull();
  });
  it('🔴 cambiar de pestaña (selTab) desde Blanco se lleva lo de pantalla', () => {
    cargar();
    H.poner('curMod', 1); H.poner('curTab', 'blanco');
    H.poner('collectBlanco', () => ({ a: '7', b: '2' }));
    try { H.selTab('calidad'); } catch (_) { /* pintar la otra ficha no importa aquí */ }
    expect(H.leer('_blancoState').data.a).toBe('7');
  });
  it('un registro intacto no pregunta', () => { cargar(); H.poner('curTab', 'calidad'); expect(H._blancoEditado()).toBe(false); });
});

describe('T4.8 · Movimientos: si en la espera se abre una ✏️ corrección, no sale nada', () => {
  it('🔴 la corrección abierta durante la lectura de la hoja corta el envío y se dice', async () => {
    let enviado = 0, corr = null;
    H.poner('_madGridBloqueada', (p, f) => f());
    H.poner('madLocLeer', () => []);
    H.poner('_madMovPreparar', () => ({ model: { fecha: '2026-11-20', tipo: 'Traslado' }, payload: { rows: [['x']] } }));
    H.poner('_madHistCorrActiva', () => corr);
    H.poner('_madMovConfirmarRepetidos', async () => { corr = {}; return true; });   // mientras se lee la hoja, se abre ✏️
    H.poner('postPayload', async () => { enviado++; return true; });
    await H.madMovGuardar();
    expect(enviado).toBe(0);
    expect(avisos.join(' ')).toMatch(/No se envió nada/);
  });
});

describe('T5.6 · «✏️ Reabrir el parte» no sigue si lo tecleado no se pudo guardar', () => {
  it('🔴 con «quedarse» en la pregunta, no reabre nada', () => {
    let leido = 0;
    H.poner('_madTanquesSala', 'Sala 1');
    H.poner('_madGridSePuedeDejar', () => false);
    H.poner('loadMad', () => { leido++; return []; });
    H.madTanquesReabrirParte();
    expect(leido).toBe(0);
  });
});
