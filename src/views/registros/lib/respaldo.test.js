// @vitest-environment happy-dom
/* ============================================================
   A13 · EL RESPALDO LOCAL: 📥 Exportar y 📤 Importar (2026-11-05)

   No tenía ninguna prueba. Importar reemplazaba la cola, no deshacía si el navegador se llenaba a mitad y se llevaba por
   delante lo pendiente creado después del respaldo. Decisiones del usuario:
     · la cola se JUNTA: la de aquí más la del respaldo, sin repetir, en orden de hora;
     · antes de importar se descarga una copia de lo que hay ahora; si falla, no se importa nada;
     · todo o nada: si no cabe, queda como estaba y lo dice;
     · no se importa mientras la cola está enviando.
   Motor entero, con un almacén propio al que se le puede poner tope. Datos inventados.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['exportBackup', 'importBackup', 'SYNCQ_KEY', 'SYNCQ_MAX', 'BACKUP_VERSION'];
const H = {};
const mapa = new Map();
let tope = Infinity;     // cuántos caracteres caben en el almacén
let mentira = null;      // esta clave acepta setItem sin guardar nada
const ocupado = () => { let n = 0; mapa.forEach((v, k) => { n += k.length + v.length; }); return n; };
const almacen = {
  getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
  setItem: (k, v) => {
    const s = String(v);
    if (k === mentira) return;
    if (ocupado() - (mapa.has(k) ? k.length + mapa.get(k).length : 0) + k.length + s.length > tope) throw new Error('QuotaExceededError');
    mapa.set(k, s);
  },
  removeItem: (k) => mapa.delete(k), clear: () => mapa.clear(), key: (i) => Array.from(mapa.keys())[i] ?? null, get length() { return mapa.size; },
};
const avisos = [];
const copias = [];
let fallaLaDescarga = false;

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
    + '\ntry{ H.enviando=function(v){_flushingQueue=v;}; }catch(_){}'
    + '\ntry{ H.alInvalidarFotos=function(f){_invalidateFotosCache=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  URL.createObjectURL = (blob) => { if (fallaLaDescarga) throw new Error('sin descarga'); copias.push(blob); return 'blob:prueba'; };
  URL.revokeObjectURL = () => {};
  /* El lector de verdad es asíncrono y se mira en Chrome; aquí, el texto llega en el acto. */
  globalThis.FileReader = class { readAsText(texto) { this.onload({ target: { result: texto } }); } };
});

beforeEach(() => {
  mapa.clear();
  tope = Infinity;
  mentira = null;
  fallaLaDescarga = false;
  avisos.length = 0;
  copias.length = 0;
  H.enviando(false);
  window.confirm = () => true;
});

const respaldo = (items, extra = {}) => JSON.stringify({ v: H.BACKUP_VERSION, ts: 1, iso: '2026-10-02T12:00:00.000Z', appHost: 'prueba', count: Object.keys(items).length, items, ...extra });
const ultimo = () => avisos[avisos.length - 1] || { msg: '', tipo: '' };
const COLA = () => H.SYNCQ_KEY;
const envio = (reqId, ts) => ({ payload: { sheetName: 'Hoja ' + reqId, headers: ['a'], rows: [['1']] }, reqId, url: '', ts, mark: null });
const cola = () => JSON.parse(mapa.get(COLA()) || '[]');
const contenidoDe = async (blob) => JSON.parse(await blob.text());

describe('A13 · 📥 Exportar', () => {
  it('lleva lo de la app, con la cola y la configuración, y nada ajeno', async () => {
    mapa.set('larv4_score_records', '[1]');
    mapa.set(COLA(), '[]');
    mapa.set('lcfg_tec', 'Ana');
    mapa.set('otra_app', 'no');
    expect(H.exportBackup()).toBe(true);
    const d = await contenidoDe(copias[0]);
    expect(d.v).toBe(H.BACKUP_VERSION);
    expect(d.count).toBe(3);
    expect(d.items).toEqual({ larv4_score_records: '[1]', [COLA()]: '[]', lcfg_tec: 'Ana' });
    expect(ultimo().tipo).toBe('ok');
  });
  it('🔴 dice si no descargó: pesado y con «no», o con un fallo', () => {
    mapa.set('larv4_grande', 'x'.repeat(5 * 1024 * 1024 + 10));
    window.confirm = () => false;
    expect(H.exportBackup()).toBe(false);
    expect(copias).toHaveLength(0);
    window.confirm = () => true;
    fallaLaDescarga = true;
    expect(H.exportBackup()).toBe(false);
    expect(ultimo().tipo).toBe('err');
  });
});

describe('A13 · 📤 Importar: lo que no se importa', () => {
  it('un archivo que no es JSON, o sin elementos, no toca nada', () => {
    H.importBackup('no es json');
    expect(ultimo().msg).toContain('JSON inválido');
    H.importBackup(JSON.stringify({ v: 1 }));
    expect(ultimo().msg).toContain('Estructura');
    expect(mapa.size).toBe(0);
    expect(copias).toHaveLength(0);
  });
  it('otra versión pregunta: «no» no toca nada; «sí» sigue', () => {
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return false; };
    H.importBackup(respaldo({ larv4_a: '1' }, { v: 99 }));
    expect(preguntas[0]).toContain('versión 99');
    expect(mapa.size).toBe(0);
    window.confirm = () => true;
    H.importBackup(respaldo({ larv4_a: '1' }, { v: 99 }));
    expect(mapa.get('larv4_a')).toBe('1');
  });
  it('🔴 lo ajeno no entra; y sin nada propio, lo dice', () => {
    H.importBackup(respaldo({ otra_app: 'no', larv4_a: '1' }));
    expect(mapa.get('larv4_a')).toBe('1');
    expect(mapa.has('otra_app')).toBe(false);
    mapa.clear();
    H.importBackup(respaldo({ otra_app: 'no' }));
    expect(ultimo().msg).toContain('No hay claves válidas');
    expect(mapa.size).toBe(0);
  });
  it('🔴 «no» en la pregunta: ni copia ni cambios', () => {
    mapa.set('larv4_a', 'antes');
    window.confirm = () => false;
    H.importBackup(respaldo({ larv4_a: 'nuevo' }));
    expect(mapa.get('larv4_a')).toBe('antes');
    expect(copias).toHaveLength(0);
  });
  it('🔴 mientras la cola envía no importa, y lo dice', () => {
    mapa.set('larv4_a', 'antes');
    H.enviando(true);
    H.importBackup(respaldo({ larv4_a: 'nuevo' }));
    expect(mapa.get('larv4_a')).toBe('antes');
    expect(copias, 'sin copia: no va a cambiar nada').toHaveLength(0);
    expect(ultimo().tipo).toBe('warn');
    expect(ultimo().msg).toContain('cola');
  });
});

describe('A13 · 📤 Importar: lo que importa', () => {
  it('sobrescribe lo que trae y conserva lo demás; lo que no es texto se dice', () => {
    mapa.set('larv4_a', 'antes');
    mapa.set('larv4_b', 'sigue');
    H.importBackup(respaldo({ larv4_a: 'nuevo', larv4_c: 'otro', larv4_d: 5 }));
    expect(mapa.get('larv4_a')).toBe('nuevo');
    expect(mapa.get('larv4_b')).toBe('sigue');
    expect(mapa.get('larv4_c')).toBe('otro');
    expect(mapa.has('larv4_d')).toBe(false);
    expect(ultimo().msg).toContain('Importados 2');
    expect(ultimo().msg).toContain('1 fallaron');
    expect(ultimo().tipo, 'con algo fuera, no en verde').toBe('warn');
  });
  it('todo bien: en verde, pide recargar y olvida las fotos en memoria', () => {
    let olvidadas = 0;
    H.alInvalidarFotos(() => { olvidadas++; });
    H.importBackup(respaldo({ larv4_a: 'nuevo' }));
    expect(ultimo().tipo).toBe('ok');
    expect(ultimo().msg).toContain('Importados 1');
    expect(ultimo().msg).toContain('Recarga');
    expect(olvidadas).toBe(1);
  });
  it('🔴 antes de escribir descarga una copia de lo que había; la ventana lo anuncia', async () => {
    mapa.set('larv4_a', 'antes');
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return true; };
    H.importBackup(respaldo({ larv4_a: 'nuevo' }));
    expect(copias).toHaveLength(1);
    expect((await contenidoDe(copias[0])).items.larv4_a).toBe('antes');
    expect(mapa.get('larv4_a')).toBe('nuevo');
    expect(preguntas[0]).toContain('copia de lo que hay ahora');
    expect(preguntas[0]).toContain('cola');
  });
  it('🔴 si la copia no se puede descargar, no importa nada', () => {
    mapa.set('larv4_a', 'antes');
    fallaLaDescarga = true;
    H.importBackup(respaldo({ larv4_a: 'nuevo' }));
    expect(mapa.get('larv4_a')).toBe('antes');
    expect(ultimo().tipo).toBe('err');
    expect(ultimo().msg).toContain('No se importó nada');
  });
  it('🔴 exportar y luego importar devuelve lo mismo', async () => {
    mapa.set('larv4_a', 'uno');
    mapa.set('lcfg_tec', 'Ana');
    H.exportBackup();
    const texto = await copias[0].text();
    mapa.clear();
    H.importBackup(texto);
    expect(mapa.get('larv4_a')).toBe('uno');
    expect(mapa.get('lcfg_tec')).toBe('Ana');
  });
});

describe('A13 · todo o nada', () => {
  it('🔴 si no cabe, queda todo como estaba y lo dice: ni en verde ni a medias', () => {
    mapa.set('larv4_a', 'antes');
    mapa.set('larv4_b', 'sigue');
    tope = ocupado() + 30;
    H.importBackup(respaldo({ larv4_a: 'nuevo', larv4_c: 'cabe', larv4_d: 'x'.repeat(200) }));
    expect(mapa.get('larv4_a')).toBe('antes');
    expect(mapa.get('larv4_b')).toBe('sigue');
    expect(mapa.has('larv4_c'), 'lo nuevo se retira').toBe(false);
    expect(mapa.has('larv4_d')).toBe(false);
    expect(ultimo().tipo).toBe('err');
    expect(ultimo().msg).toContain('No se importó nada');
    expect(ultimo().msg).toContain('como estaba');
  });
  it('🔴 deshacer retira primero lo escrito: lo de antes cabe aunque crezca al volver', () => {
    /* A pasa de grande a pequeño y B de pequeño a grande; C no cabe. Reponer A sin retirar antes B se saldría del tope. */
    mapa.set('larv4_a', 'x'.repeat(100));
    mapa.set('larv4_b', 'y');
    tope = ocupado() + 10;
    H.importBackup(respaldo({ larv4_a: 'z', larv4_b: 'w'.repeat(100), larv4_c: 'q'.repeat(100) }));
    expect(mapa.get('larv4_a')).toBe('x'.repeat(100));
    expect(mapa.get('larv4_b')).toBe('y');
    expect(mapa.has('larv4_c')).toBe(false);
  });
  it('🔴 un navegador que acepta sin guardar (modo privado) también deshace', () => {
    mapa.set('larv4_a', 'antes');
    mentira = 'larv4_b';
    H.importBackup(respaldo({ larv4_a: 'nuevo', larv4_b: 'no se guarda' }));
    expect(mapa.get('larv4_a')).toBe('antes');
    expect(ultimo().msg).toContain('No se importó nada');
  });
  it('🔴 también deshace la cola', () => {
    mapa.set(COLA(), JSON.stringify([envio('a', 1)]));
    const antes = mapa.get(COLA());
    tope = ocupado() + 400;
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('b', 2)]), larv4_d: 'x'.repeat(900) }));
    expect(mapa.get(COLA())).toBe(antes);
  });
});

describe('A13 · la cola se junta', () => {
  it('🔴 la de aquí más la del respaldo, sin repetir y en orden de hora', () => {
    mapa.set(COLA(), JSON.stringify([envio('a', 30), envio('b', 10)]));
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('b', 10), envio('c', 20)]) }));
    expect(cola().map((x) => x.reqId)).toEqual(['b', 'c', 'a']);
  });
  it('🔴 el mismo envío con otra hora no se repite: su huella ya espera aquí', () => {
    mapa.set(COLA(), JSON.stringify([envio('a', 30)]));
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('a', 10)]) }));
    expect(cola().map((x) => x.ts)).toEqual([30]);
  });
  it('🔴 sin huella, los distingue la hora', () => {
    mapa.set(COLA(), JSON.stringify([envio('', 30)]));
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('', 30), envio('', 10)]) }));
    expect(cola().map((x) => x.ts)).toEqual([10, 30]);
  });
  it('🔴 aquí vacía (navegador borrado): entra la del respaldo entera', () => {
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('c', 20), envio('b', 10)]) }));
    expect(cola().map((x) => x.reqId)).toEqual(['b', 'c']);
  });
  it('🔴 si el respaldo no trae cola, o la trae rota, la de aquí sigue', () => {
    mapa.set(COLA(), JSON.stringify([envio('a', 30)]));
    H.importBackup(respaldo({ larv4_x: '1' }));
    expect(cola().map((x) => x.reqId)).toEqual(['a']);
    H.importBackup(respaldo({ [COLA()]: 'no es json' }));
    expect(cola().map((x) => x.reqId)).toEqual(['a']);
    expect(ultimo().msg, 'y lo demás se importa').toContain('Importados');
    H.importBackup(respaldo({ [COLA()]: '{"no":"lista"}' }));
    expect(cola().map((x) => x.reqId)).toEqual(['a']);
    expect(ultimo().msg).toContain('Importados');
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([null, envio('b', 40)]) }));
    expect(cola().map((x) => x.reqId), 'un elemento nulo no rompe').toEqual(['a', 'b']);
    mapa.set(COLA(), JSON.stringify([null, envio('a', 30)]));
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('b', 40)]) }));
    expect(cola().map((x) => x.reqId), 'tampoco uno de aquí').toEqual(['a', 'b']);
  });
  it('🔴 más allá del tope se queda con los más recientes y avisa de qué cae', () => {
    const aqui = Array.from({ length: H.SYNCQ_MAX }, (_, i) => envio('aqui' + i, 100 + i));
    mapa.set(COLA(), JSON.stringify(aqui));
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('viejo', 1), envio('otro', 2)]) }));
    expect(cola()).toHaveLength(H.SYNCQ_MAX);
    expect(cola().some((x) => x.reqId === 'viejo')).toBe(false);
    expect(avisos.some((a) => a.msg.includes('Hoja viejo'))).toBe(true);
  });
  it('🔴 si no cabe, no avisa de un descarte que no pasó', () => {
    const aqui = Array.from({ length: H.SYNCQ_MAX }, (_, i) => envio('aqui' + i, 100 + i));
    mapa.set(COLA(), JSON.stringify(aqui));
    tope = ocupado() + 200;
    H.importBackup(respaldo({ [COLA()]: JSON.stringify([envio('viejo', 1)]), larv4_d: 'x'.repeat(900) }));
    expect(avisos.some((a) => a.msg.includes('Hoja viejo'))).toBe(false);
    expect(cola()).toHaveLength(H.SYNCQ_MAX);
  });
});
