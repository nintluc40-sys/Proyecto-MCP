// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · la coma decimal al PEGAR y los CONTEOS de Tanques (punto 2 de la pauta del 2026-11-12)

   Visto en Chrome el 12-11 (es-EC y en-US):
   · Pegar un bloque de Excel «28,5 ⇥ 29,1» en 🏠 Salas dejaba las dos celdas VACÍAS: el navegador no acepta «28,5» puesto por
     código en una celda numérica. (Teclearlo sí: Chrome lo convierte.) Decisión del usuario: «Pegar en Maduración», con las
     reglas que ya aprobó para el pegado de Larvicultura (_stdConvencion / _stdNumPegado) y avisando de lo que no sea un número.
     ⚠ happy-dom SÍ acepta «28,5» en la celda (Chrome no): por eso las pruebas miran lo que se GUARDA (con la regla vieja,
     parseFloat lo dejaba en 28), que distingue igual.
   · En 🛢 Tanques, un CONTEO «2,7» se guardaba 2,7 (y el envío lo dejaba en 2) y «-3» se guardaba 0, sin aviso. Decisión del
     usuario: como la temperatura fuera de rango de Salas — con 💾 o ☁️ no se guarda nada y se dice; al cambiar de sala, fecha
     o pestaña se guarda el resto y se avisa de esa celda. Y lo ya guardado de ese tanque NO se toca (ni a 0, ni vaciado).

   Arnés: el de mad-tanques-vaciar.test.js (engine.js entero en happy-dom).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'renderMadSalas', 'renderMarea', 'madTanquesSalaChange', 'saveMadTanquesGrid', 'syncMadTanquesGrid',
  'madGridPaste', '_collectSalasGrid', '_collectMareaGrid', 'loadMad', 'saveMadList', '_gasVersionLocal', 'MAD_MOD', 'AST_MOD'];
const H = {};
const envios = [];
let avisos = [];

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
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (body) => { envios.push(JSON.parse(JSON.stringify(body))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    if (u.indexOf('p=rows') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
    throw new Error('fetch inesperado: ' + u);
  };
});

beforeEach(() => {
  localStorage.clear();
  envios.length = 0;
  avisos = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
});
afterEach(() => { vi.useRealTimers(); });

/** Pega como el usuario: ejecuta el `onpaste` de la celda con un portapapeles que trae `txt`. */
function pegar(el, txt) {
  expect(el, 'no está la celda').toBeTruthy();
  const ev = { clipboardData: { getData: () => txt }, target: el, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  new Function('event', 'madGridPaste', el.getAttribute('onpaste'))(ev, H.madGridPaste);
  return ev;
}
const temp = (si, n) => document.querySelectorAll('#fp-salas input[name^="sg_' + si + '_temp_"]')[n];

describe('Pegar en 🏠 Salas: la coma decimal', () => {
  beforeEach(() => { H.setVista(H.MAD_MOD, 'salas'); H.renderMadSalas(); });

  it('🔴 un bloque «28,5 ⇥ 29,1» de Excel entra como 28,5 y 29,1', () => {
    const ev = pegar(temp(0, 0), '28,5\t29,1');
    expect(ev.defaultPrevented).toBe(true);
    const d = H._collectSalasGrid()[0];
    expect(d[temp(0, 0).name.replace(/^sg_0_/, '')], 'la celda se quedaba vacía (Chrome) o en 28').toBe(28.5);
    expect(d[temp(0, 1).name.replace(/^sg_0_/, '')]).toBe(29.1);
  });

  it('🔴 una sola celda «28,5» también (el pegado del navegador la dejaba vacía)', () => {
    const ev = pegar(temp(0, 0), '28,5');
    expect(ev.defaultPrevented).toBe(true);
    expect(temp(0, 0).value).toBe('28.5');
  });

  it('🔴 lo que no es un número no se pega (la celda se queda como estaba) y se dice cuántas', () => {
    temp(0, 1).value = '27';
    pegar(temp(0, 0), '28,5\tabc');
    expect(temp(0, 0).value).toBe('28.5');
    expect(temp(0, 1).value, 'el texto vaciaba la celda').toBe('27');
    expect(avisos.some((m) => /1 celda\(s\) no eran números/.test(m)), 'no avisó: ' + avisos.join(' | ')).toBe(true);
  });

  it('una celda suelta que no es un número lo dice y no toca nada', () => {
    temp(0, 0).value = '26';
    pegar(temp(0, 0), 'n/d');
    expect(temp(0, 0).value).toBe('26');
    expect(avisos.some((m) => /no es un número/.test(m))).toBe(true);
  });

  it('el bloque decide «4.300»: con «28.5» al lado el punto es el decimal (4,3); sin pista, como en un Excel de Ecuador (4300)', () => {
    const t = document.querySelector('#fp-salas input[name="sg_0_toneladas"]');
    expect(t).toBeTruthy();
    pegar(t, '4.300\t28.5');
    expect(t.value, 'la pista del bloque no se usó').toBe('4.3');
    pegar(t, '4.300');
    expect(t.value).toBe('4300');
  });
});

describe('Pegar en 🌊 Mareas (celdas de TEXTO): sin cambios', () => {
  it('lo pegado se queda tal cual, con su coma', () => {
    H.setVista(H.AST_MOD, 'marea');
    H.renderMarea();
    const c = document.querySelector('#fp-marea input[name="mg_1_ap1"]');   // «Altura P1 (m)», y detrás «Bajamar 1»
    pegar(c, '2,35\t04:10');
    expect(c.value).toBe('2,35');
    expect(document.querySelector('#fp-marea input[name="mg_1_b1"]').value).toBe('04:10');
  });
});

describe('🛢 Tanques: un conteo que no es un entero de 0 en adelante', () => {
  const celda = (tq, k) => document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
  const teclear = (tq, k, v) => { const el = celda(tq, k); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
  const guardado = (tq) => H.loadMad('tanques').filter((r) => r.data.sala === 'Sala 2' && String(r.data.tanque) === String(tq));
  const autoguardar = () => H.saveMadTanquesGrid({ salaOverride: 'Sala 2', silent: true, noRender: true });
  // Los números de tanque son los de la sala (no empiezan en 1): T[0], T[1]… salen de la propia grilla.
  let T = [];
  beforeEach(() => {
    H.setVista(H.MAD_MOD, 'tanques'); H.renderMadTanques(); irASala('Sala 2');
    T = [...document.querySelectorAll('#fp-tanques [name$="_machos_muertos"]')].map((el) => /^tg_(.+)_machos_muertos$/.exec(el.name)[1]);
    expect(T.length, 'la Sala 2 no pinta tanques').toBeGreaterThan(2);
  });

  it.each([['2.7'], ['-3']])('🔴 «%s» con 💾: no se guarda NADA, la celda se marca y se dice', (v) => {
    teclear(T[0], 'machos_muertos', v);
    teclear(T[0], 'hembras_muertas', '1');
    expect(H.saveMadTanquesGrid()).toBe(0);
    expect(H.loadMad('tanques'), 'se guardó con el conteo mal').toHaveLength(0);
    expect(celda(T[0], 'machos_muertos').classList.contains('inp-bad')).toBe(true);
    const re = new RegExp('tanque ' + T[0] + ': «.+» en Machos muertos no es un conteo');
    expect(avisos.some((m) => re.test(m)), avisos.join(' | ')).toBe(true);
  });

  it('🔴 con ☁️ tampoco: no se envía lo de antes ni lo de ahora', async () => {
    teclear(T[0], 'machos_muertos', '2');
    H.saveMadTanquesGrid();                          // un parte bueno, guardado y pendiente de enviar
    teclear(T[0], 'machos_muertos', '2.7');
    await H.syncMadTanquesGrid();
    expect(envios.filter((b) => b.sheetName === 'Maduración Tanques'), 'envió con un conteo mal en pantalla').toHaveLength(0);
  });

  it('🔴 al cambiar de pestaña (autoguardado) se guarda el resto, esa celda no, y se avisa', () => {
    teclear(T[0], 'machos_muertos', '2.7');
    teclear(T[0], 'hembras_muertas', '1');
    expect(autoguardar()).toBe(1);
    const [r] = guardado(T[0]);
    expect(r.data.hembras_muertas).toBe(1);
    expect(r.data.machos_muertos == null || r.data.machos_muertos === '', 'se guardó 2,7').toBe(true);
    expect(avisos.some((m) => /Esa celda NO se guardó; el resto sí/.test(m))).toBe(true);
  });

  it('🔴 lo YA guardado de ese conteo no se toca: ni 0, ni 2,7', () => {
    teclear(T[0], 'machos_muertos', '3');
    teclear(T[0], 'hembras_muertas', '1');
    autoguardar();                                   // el parte abierto, con 3
    teclear(T[0], 'machos_muertos', '2.7');
    autoguardar();
    expect(guardado(T[0])[0].data.machos_muertos).toBe(3);
  });

  it('🔴 un tanque que queda SÓLO con el conteo mal: lo borrado se guarda borrado (0) y el conteo mal conserva lo suyo', () => {
    teclear(T[1], 'machos_muertos', '4');
    teclear(T[1], 'hembras_muertas', '2');
    autoguardar();
    H.renderMadTanques();                            // el parte abierto, repintado con su 4 y su 2
    expect(celda(T[1], 'machos_muertos').value).toBe('4');
    celda(T[1], 'hembras_muertas').value = '';       // se borra a propósito…
    teclear(T[1], 'machos_muertos', '-3');           // …y lo único que queda en el tanque es un conteo mal
    autoguardar();
    const d = guardado(T[1])[0].data;
    expect(d.machos_muertos, '«-3» lo ponía a 0 (o el tanque entero se vaciaba)').toBe(4);
    expect(d.hembras_muertas, 'lo borrado se guarda borrado, como siempre').toBe(0);
  });

  it('🔴 lo que el navegador no entiende («--3») llega vacío: tampoco borra lo guardado', () => {
    teclear(T[2], 'machos_muertos', '5');
    teclear(T[2], 'hembras_muertas', '1');
    autoguardar();
    H.renderMadTanques();
    const el = celda(T[2], 'machos_muertos');
    el.value = '';
    Object.defineProperty(el, 'validity', { configurable: true, value: { badInput: true, valid: false } });
    autoguardar();
    expect(guardado(T[2])[0].data.machos_muertos).toBe(5);
    expect(el.classList.contains('inp-bad')).toBe(true);
  });

  it('un conteo bueno quita la marca y se guarda (eso no cambia)', () => {
    teclear(T[0], 'machos_muertos', '2.7');
    H.saveMadTanquesGrid();
    teclear(T[0], 'machos_muertos', '2');
    expect(H.saveMadTanquesGrid()).toBe(1);
    expect(celda(T[0], 'machos_muertos').classList.contains('inp-bad')).toBe(false);
    expect(guardado(T[0])[0].data.machos_muertos).toBe(2);
  });

  it('un peso con decimales sigue entrando (sólo los conteos son enteros)', () => {
    teclear(T[0], 'peso_machos', '45.3');
    expect(H.saveMadTanquesGrid()).toBeGreaterThan(0);
    expect(guardado(T[0])[0].data.peso_machos).toBe(45.3);
  });
});
