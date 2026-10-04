// @vitest-environment happy-dom
/* ============================================================
   COLA · ALMACENAMIENTO LLENO (auditoría final, 2026-10-04)

   Con el almacenamiento del navegador lleno —y nada que purgar— la cola no se puede guardar. Antes, quien encolaba lo
   ignoraba: decía «📶 en cola», vaciaba el formulario y el envío se PERDÍA sin aviso. Ahora `_enqueueSync` dice si el
   envío quedó en la cola; si no, el resultado es «error» con su motivo y lo tecleado SE QUEDA en pantalla.
   Los dos caminos que encolan: `_madPostConSello` (hojas selladas sin sello confirmado: Desoves) y `postPayload` (red
   caída: Movimientos). Cada uno con su control: con espacio, el mismo guardado SÍ queda en la cola.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesReiniciar', 'madDesGuardar', 'madMovReiniciar', 'madMovSalaChange', 'madMovGuardar', '_gasVersionLocal'];
const H = {};
const avisos = [];
let respuestaVer = null;
let lleno = false;

/* Un almacenamiento propio: con `lleno`, guardar la COLA falla como falla el navegador sin espacio (QuotaExceededError). */
const mapa = new Map();
const almacen = {
  getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
  setItem: (k, v) => {
    if (lleno && k === 'larv4_syncqueue') { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
    mapa.set(k, String(v));
  },
  removeItem: (k) => mapa.delete(k), clear: () => mapa.clear(),
  key: (i) => Array.from(mapa.keys())[i] ?? null, get length() { return mapa.size; },
};

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
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url, init) => {
    const u = decodeURIComponent(String(url));
    if (u.indexOf('p=ver') !== -1) {
      if (respuestaVer === 'red') throw new Error('sin red');
      return { ok: true, status: 200, text: async () => JSON.stringify(respuestaVer) };
    }
    if (init && init.method === 'POST') throw new Error('sin red');          // la red se cae al enviar
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok', processed: false, ok: true, rows: [] }) };
  };
});

beforeEach(() => {
  mapa.clear();
  lleno = false;
  avisos.length = 0;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };
});

const cola = () => JSON.parse(almacen.getItem('larv4_syncqueue') || '[]');
const qd = (s) => document.querySelector('#fp-desoves ' + s);
const llenarDesove = () => {
  H.madDesReiniciar();
  qd('.md-lote').value = 'ZZ'; qd('.md-cg').value = 'CG.Z1'; qd('.md-desoves').value = '3';
};
const tramo = () => document.querySelector('#fp-movimientos #mv-tramos tr.mv-tramo');
const pon = (el, v) => { el.value = v; return el; };
const llenarTramo = () => {
  H.madMovReiniciar();
  pon(document.getElementById('mv-fecha'), '2026-10-04');
  const tr = tramo();
  H.madMovSalaChange(pon(tr.querySelector('.mv-so'), 'Sala 1')); pon(tr.querySelector('.mv-to'), '1');
  H.madMovSalaChange(pon(tr.querySelector('.mv-sd'), 'Sala 2')); pon(tr.querySelector('.mv-td'), '16');
  pon(tr.querySelector('.mv-machos'), '2'); pon(tr.querySelector('.mv-hembras'), '3');
};

describe('Cola · con el almacenamiento LLENO un envío no se da por «en cola» ni se pierde lo tecleado', () => {
  it('control · Desoves con el GAS mudo y espacio: queda en la cola y la ficha se limpia', async () => {
    respuestaVer = 'red';
    llenarDesove();
    await H.madDesGuardar();
    expect(cola().map((it) => it.payload.sheetName)).toEqual(['Maduración Lotes']);
    expect(qd('.md-lote').value).toBe('');
    mapa.delete('larv4_syncqueue');   // el vaciado de los 8 s no tiene nada que hacer
  });

  it('🔴 Desoves con el GAS mudo y SIN espacio: no dice «en cola», lo tecleado se queda y se dice por qué', async () => {
    respuestaVer = 'red';
    lleno = true;
    llenarDesove();
    await H.madDesGuardar();
    expect(cola(), 'no cabía: la cola sigue vacía').toEqual([]);
    expect(qd('.md-lote').value, 'lo tecleado no puede perderse').toBe('ZZ');
    expect(document.getElementById('md-log').textContent, 'el registro no puede decir «en cola»').not.toContain('en cola');
    expect(avisos.some((a) => /en cola/i.test(a.msg)), 'ningún aviso puede decir que está en cola').toBe(false);
    expect(avisos.some((a) => a.tipo === 'err' && /no hay espacio en este dispositivo/.test(a.msg))).toBe(true);
  });

  it('control · Movimientos con la red caída y espacio: queda en la cola y el registro lo dice', async () => {
    llenarTramo();
    await H.madMovGuardar();
    expect(cola().map((it) => it.payload.sheetName)).toEqual(['Maduración Movimientos']);
    expect(document.getElementById('mv-log').textContent).toContain('en cola');
    mapa.delete('larv4_syncqueue');
  });

  it('🔴 Movimientos con la red caída y SIN espacio: no dice «en cola», el tramo se queda y se dice por qué', async () => {
    lleno = true;
    llenarTramo();
    await H.madMovGuardar();
    expect(cola()).toEqual([]);
    expect(tramo().querySelector('.mv-machos').value, 'lo tecleado no puede perderse').toBe('2');
    expect(document.getElementById('mv-log').textContent).not.toContain('en cola');
    expect(avisos.some((a) => /guardado en cola/i.test(a.msg))).toBe(false);
    expect(avisos.some((a) => a.tipo === 'err' && /no hay espacio en este dispositivo/.test(a.msg))).toBe(true);
  });
});
