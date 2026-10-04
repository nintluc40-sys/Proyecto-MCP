// @vitest-environment happy-dom
/* ============================================================
   PENDIENTES DE DÍAS ANTERIORES (auditoría final, 2026-10-04 · decisión del usuario: «no borrar y recuperar»)

   Las fichas de Larvicultura y el historial de Lab. Algas se guardan POR DÍA y la app sólo lee los de HOY: lo guardado y
   NO enviado dejaba de verse a medianoche y la limpieza lo borraba después, sin aviso. Ahora:
     · la limpieza no borra lo no enviado (cleanup, _purgeExpiredAlgHistDays);
     · al abrir el módulo, un aviso dice qué quedó, con «☁️ Enviarlas» (cada una con SU fecha) y «🗑 Descartarlas»;
     · la entrega desde la cola concilia en SU día (marca módulo|ficha|día; _reconcileAlgas en todos los días).
   Motor entero, con un almacén propio y Google simulado.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['saveE', 'loadE', 'cleanup', '_previasFichas', '_previasAlgas', '_previasPintar', 'previasEnviar', 'previasDescartar',
  '_reconcileMark', '_marcaFichas', '_purgeExpiredAlgHistDays', 'flushSyncQueue', 'buildGrid', 'today', 'ALGHIST_PRE', 'PRE', 'LAB_MOD', 'MAD_MOD',
  '_invalidateLoadE'];
const H = {};
const avisos = [];
const envios = [];
let red = 'ok';
const mapa = new Map();
const almacen = { getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k),
  clear: () => mapa.clear(), key: (i) => Array.from(mapa.keys())[i] ?? null, get length() { return mapa.size; } };

beforeAll(async () => {
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
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  window.confirm = () => true;
  globalThis.fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      if (red === 'caida') throw new Error('sin red');
      envios.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok', processed: false, ok: true, rows: [] }) };
  };
});

const DIA = 24 * 3600 * 1000;
const iso = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let hoy, ayer, anteayer;
beforeEach(() => {
  mapa.clear(); H._invalidateLoadE();
  avisos.length = 0; envios.length = 0; red = 'ok';
  hoy = H.today(); const t = new Date(hoy + 'T12:00:00').getTime(); ayer = iso(t - DIA); anteayer = iso(t - 2 * DIA);
  H.setMod(1);
  const b = document.getElementById('pend-previas'); if (b) b.innerHTML = '';
});

const lab = (m) => (m === 0 ? 'CIO' : 'M' + String(m).padStart(2, '0'));
const clave = (m, f, d) => H.PRE + lab(m) + '_' + f + '_' + d;
/** Una ficha guardada en el día `d` (por defecto, hace 30 h: más que el plazo de 24 h de la limpieza). */
const ponFicha = (m, f, d, data, synced = false) => {
  const t = Date.now() - 30 * 3600 * 1000;
  almacen.setItem(clave(m, f, d), JSON.stringify({ mod: m, ficha: f, date: d, savedAt: t, updatedAt: t, synced, data }));
};
const ficha = (m, f, d) => JSON.parse(almacen.getItem(clave(m, f, d)) || 'null');
const aviso = () => (document.getElementById('pend-previas') || { textContent: '' }).textContent;

describe('La limpieza ya no borra lo NO enviado de días anteriores', () => {
  it('🔴 una ficha de Larvicultura sin enviar de ayer se conserva; la enviada se retira', () => {
    ponFicha(1, 'calidad', ayer, { 'mo_0': '5' });
    ponFicha(1, 'plg', ayer, { 'pg_0': '9' }, true);
    H.cleanup();
    expect(ficha(1, 'calidad', ayer), 'lo no enviado no puede borrarse').not.toBeNull();
    expect(ficha(1, 'plg', ayer), 'lo enviado sí se retira, como antes').toBeNull();
  });

  it('🔴 el historial de Lab. Algas de anteayer con registros se conserva (limpieza y cuota); el vacío se retira', () => {
    almacen.setItem(H.ALGHIST_PRE + anteayer, JSON.stringify([{ id: 'a1', ts: 1, data: { fecha: anteayer } }]));
    almacen.setItem(H.ALGHIST_PRE + ayer, '[]');
    H.cleanup();
    H._purgeExpiredAlgHistDays();
    expect(almacen.getItem(H.ALGHIST_PRE + anteayer)).not.toBeNull();
    expect(almacen.getItem(H.ALGHIST_PRE + ayer)).toBeNull();
  });
});

describe('El aviso al abrir el módulo', () => {
  it('🔴 dice qué quedó y de qué día, con sus dos botones', () => {
    ponFicha(1, 'calidad', ayer, { 'mo_0': '5' });
    ponFicha(1, 'params', anteayer, { 'od_0_02:00': '5.5' });
    H._previasPintar();
    expect(aviso()).toContain('Guardado y sin enviar de días anteriores');
    expect(aviso()).toContain(anteayer.slice(8) + '/' + anteayer.slice(5, 7));
    expect(aviso()).toContain(ayer.slice(8) + '/' + ayer.slice(5, 7));
    const btns = [...document.querySelectorAll('#pend-previas button')].map((b) => b.getAttribute('onclick'));
    expect(btns).toEqual(['previasEnviar()', 'previasDescartar()']);
  });

  it('no sale en otro módulo, ni por lo de HOY, ni por lo ya enviado, ni en Maduración', () => {
    ponFicha(2, 'calidad', ayer, { 'mo_0': '5' });             // de otro módulo
    ponFicha(1, 'calidad', hoy, { 'mo_0': '5' });              // de hoy: lo ve la ficha
    ponFicha(1, 'plg', ayer, { 'pg_0': '9' }, true);           // ya enviada
    H._previasPintar();
    expect(aviso()).toBe('');
    H.setMod(H.MAD_MOD);
    H._previasPintar();
    expect(aviso()).toBe('');
  });

  it('el mosaico de la entrada enciende su punto con lo de días anteriores', () => {
    ponFicha(1, 'calidad', ayer, { 'mo_0': '5' });
    document.getElementById('rgApp') && document.getElementById('rgApp').classList.remove('on');
    H.buildGrid();
    expect(document.getElementById('mc1').classList.contains('pend')).toBe(true);
    expect(document.getElementById('mc2').classList.contains('pend')).toBe(false);
  });
});

describe('«☁️ Enviarlas»', () => {
  it('🔴 cada ficha va a SU hoja con SU fecha, queda enviada y el aviso desaparece', async () => {
    ponFicha(1, 'calidad', ayer, { corrida: '600', 'mo_0': '5' });   // sin fecha propia: la del día en que se guardó
    ponFicha(1, 'params', anteayer, { fecha: anteayer, 'od_0_02:00': '5.5' });
    await H.previasEnviar();
    const datos = envios.find((p) => /^Datos Larvicultura/.test(p.sheetName));
    const control = envios.find((p) => /^Control_Tanque/.test(p.sheetName));
    expect(datos && datos.rows[0][0], 'Datos con la fecha de su día').toBe(ayer);
    expect(control && control.rows[0][0], 'Parámetros con la suya').toBe(anteayer);
    expect([ficha(1, 'calidad', ayer).synced, ficha(1, 'params', anteayer).synced]).toEqual([true, true]);
    H._previasPintar();
    expect(aviso()).toBe('');
    expect(avisos.some((a) => a.tipo === 'ok' && /Enviado lo de días anteriores/.test(a.msg))).toBe(true);
  });

  it('🔴 con la red caída va a la COLA, sigue pendiente, y la entrega lo concilia en SU día', async () => {
    // otro dato que la prueba anterior: un envío IDÉNTICO en menos de 30 s, postPayload lo da por ya enviado (doble clic)
    ponFicha(1, 'calidad', ayer, { corrida: '601', 'mo_0': '6' });
    red = 'caida';
    await H.previasEnviar();
    const cola = JSON.parse(almacen.getItem('larv4_syncqueue') || '[]');
    expect(cola.map((it) => it.mark && it.mark.keys)).toEqual([['1|calidad|' + ayer]]);
    expect(ficha(1, 'calidad', ayer).synced, 'en la cola no es enviado').toBe(false);
    red = 'ok';
    await H.flushSyncQueue();
    expect(ficha(1, 'calidad', ayer).synced, 'la entrega lo concilia').toBe(true);
    H._previasPintar();
    expect(aviso()).toBe('');
  });

  it('🔴 Lab. Algas: los registros de un día anterior salen y pasan a la Bitácora', async () => {
    H.setMod(H.LAB_MOD);
    almacen.setItem(H.ALGHIST_PRE + ayer, JSON.stringify([
      { id: 'a1', ts: 1, data: { fecha: ayer, corrida: '600', modulo: 'M01', area: 'Sala', sistema: 'Bolsa', cel_ml: '10' } },
      { id: 'a2', ts: 2, data: { fecha: ayer, corrida: '600', modulo: 'M01', area: 'Sala', sistema: 'Bolsa', cel_ml: '12' } }]));
    H._previasPintar();
    expect(aviso()).toContain('2 registro(s) de Lab. Algas');
    await H.previasEnviar();
    const p = envios[envios.length - 1];
    expect(p && p.rows.length).toBe(2);
    expect(almacen.getItem(H.ALGHIST_PRE + ayer), 'enviados, salen del historial de su día').toBeNull();
    H._previasPintar();
    expect(aviso()).toBe('');
  });
});

describe('«🗑 Descartarlas»', () => {
  it('pregunta, borra lo de días anteriores (y sólo eso) y el aviso desaparece', () => {
    ponFicha(1, 'calidad', ayer, { 'mo_0': '5' });
    ponFicha(1, 'calidad', hoy, { 'mo_0': '7' });
    let preguntado = '';
    window.confirm = (m) => { preguntado = m; return true; };
    H.previasDescartar();
    window.confirm = () => true;
    expect(preguntado).toContain('SIN ENVIAR');
    expect(ficha(1, 'calidad', ayer)).toBeNull();
    expect(ficha(1, 'calidad', hoy), 'lo de hoy no se toca').not.toBeNull();
    expect(aviso()).toBe('');
  });
});

describe('Entregas que cruzan la medianoche (la cola concilia en SU día)', () => {
  it('🔴 la marca de una ficha lleva su día, y la entrega de mañana la marca enviada', () => {
    H.saveE(1, 'calidad', { 'mo_0': '5' }, false);
    const marca = H._marcaFichas(1, ['calidad']);
    expect(marca.keys).toEqual(['1|calidad|' + hoy]);
    // como si fuera mañana: la ficha sigue bajo la clave de SU día, y la entrega la encuentra ahí
    expect(H._reconcileMark(marca)).toBe(true);
    expect(ficha(1, 'calidad', hoy).synced).toBe(true);
  });

  it('🔴 Lab. Algas: la entrega encuentra los registros en el historial de SU día (no sólo en el de hoy)', () => {
    almacen.setItem(H.ALGHIST_PRE + ayer, JSON.stringify([{ id: 'a1', ts: 1, data: { fecha: ayer } }, { id: 'a2', ts: 2, data: { fecha: ayer } }]));
    expect(H._reconcileMark({ kind: 'alg', keys: ['a1'] })).toBe(true);
    expect(JSON.parse(almacen.getItem(H.ALGHIST_PRE + ayer)).map((h) => h.id), 'sale el entregado; el otro sigue pendiente').toEqual(['a2']);
  });
});
