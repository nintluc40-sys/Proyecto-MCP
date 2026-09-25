// @vitest-environment happy-dom
/* ============================================================
   E · UN AVISO POR ACCIÓN, SIN JERGA (punto 2a · corrección E, 2026-09-24)

   Un registro del reproductivo llegaba a lanzar hasta seis avisos propios —leyendo, comprobando, copia local, sin
   confirmar, procesando y el resultado— más los de cada uno de sus dos envíos, de 2 a 9 s cada uno: se apilaban y
   tapaban la pantalla del móvil, y varios hablaban la lengua de la app. Decisiones del usuario (las tres recomendadas):
   lo que va PASANDO se lee en una línea junto al botón, que se borra al terminar; al final, UN aviso con el resultado y,
   detrás, lo que requiere atención (naranja; rojo si no se registró nada); sólo los cuatro flujos del reproductivo.

   Aquí `postPayload` es el REAL (con Google simulado): es la única forma de ver que sus envíos callan de verdad.
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_REPRO_SHEETS', '_REPRO_MATRIZ_COLS', '_reproEventosHTML', 'madReproProcess', '_reproAltaHTML',
  'madReproAltaBatch', '_reproTransferHTML', 'madReproTransfer', 'madReproRegistrarElegidas', 'postPayload'];
const H = {};
const avisos = [];
const posts = [];
const pasos = [];
let respuestaPost;
let lecturaRows = null;
const JERGA = /Maduración MATRIZ|copia en uso|token|TR-ID|tope del servidor|Payload|Sincronización en curso/i;

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
    + '\ntry{ H.setLecturas=function(hojas){ _reproSheets=hojas; _reproTrunc={}; _reproSheetsState="ready"; _reproSheetsErr="";'
    + ' _reproMatrixSrc=""; _reproMatrixTs=0; _reproFresca=null; _reproUltimaEscritura=0; }; }catch(_){}'
    // la cola la vacía la app sola a los 8 s y cada minuto: aquí no, o caería en mitad de otra prueba
    + '\ntry{ H.setFlush=function(f){flushSyncQueue=f;}; }catch(_){}'
    + '\ntry{ H.reiniciarEnvios=function(){ _lastSyncFingerprint.clear(); _syncInFlight.clear(); }; H.enCurso=function(h){ _syncInFlight.add(h); }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  const _ric = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (fn) => { fn(); return 1; };   // la limpieza de arranque, ANTES de las pruebas
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  globalThis.requestIdleCallback = _ric;
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setFlush(async () => {});
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if ((opts.method || 'GET') === 'POST') {
      const body = JSON.parse(opts.body);
      posts.push(body.sheetName);
      ['repro-paso', 'repro-a-paso', 'repro-t-paso'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.textContent) pasos.push(el.textContent);
      });
      const r = respuestaPost(body);
      if (r instanceof Error) throw r;
      return { ok: true, status: 200, text: async () => JSON.stringify(r) };
    }
    if (lecturaRows && u.includes('p=rows')) return lecturaRows(u);
    if (u.includes('p=ver')) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: 'x', caps: [] }) };
    throw new Error('fetch inesperado: ' + u);
  };
});

/* ── Datos FICTICIOS ─────────────────────────────────────────────────────────────────────────────────────────────── */
const CHIP = '000E00AA01';
const hembra = (o) => Object.assign({ 'Número': '1', 'Trovan ID': CHIP, 'Piscina': 'P1', 'Código genético': 'GEN1.A', 'Lote': 'XA',
  'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo', 'Fecha muerte': '', 'Fecha ingreso': '2026-08-01' }, o);
const VIVA = hembra({});
let S;

beforeEach(() => {
  S = H._REPRO_SHEETS;
  avisos.length = 0; posts.length = 0; pasos.length = 0;
  respuestaPost = () => ({ status: 'ok' });
  lecturaRows = null;
  window.__rgLib.reproReadSheet = undefined;
  window.__rgLib.reproStoreVersion = undefined;
  localStorage.removeItem('larv4_mad_matriz');
  localStorage.removeItem('larv4_syncqueue');
  H.reiniciarEnvios();
  H.setLecturas({ [S.matriz]: [VIVA], [S.bitacora]: [], [S.transfer]: [] });
});
afterEach(() => { delete navigator.onLine; localStorage.removeItem('larv4_syncqueue'); H.reiniciarEnvios(); });

const caja = (id) => {
  let c = document.getElementById(id);
  if (!c) { c = document.createElement('div'); c.id = id; document.body.appendChild(c); }
  return c;
};
const evento = async (tipo, codes = CHIP) => {
  caja('ra-eventos').innerHTML = H._reproEventosHTML();
  document.getElementById('repro-fecha').value = '2026-09-10';
  document.getElementById('repro-tipo').value = tipo;
  document.getElementById('repro-codes').value = codes;
  await H.madReproProcess();
};
const traslado = async () => {
  caja('ra-transfer').innerHTML = H._reproTransferHTML();
  document.getElementById('repro-t-fecha').value = '2026-09-12';
  document.getElementById('repro-t-osala').value = 'S1';
  document.getElementById('repro-t-otanque').value = 'T1';
  document.querySelector('#repro-t-dests .repro-dest-sala').value = 'S2';
  document.querySelector('#repro-t-dests .repro-dest-tanque').value = 'T2';
  document.querySelector('#repro-t-dests .repro-dest-codes').value = CHIP;
  await H.madReproTransfer();
};
const alta = async (fila) => {
  caja('ra-alta').innerHTML = H._reproAltaHTML();
  document.getElementById('repro-a-fecha').value = '2026-09-11';
  const tr = document.querySelector('#repro-a-tbody tr');
  const pon = (c, v) => { tr.querySelector(`[data-c="${c}"]`).value = v; };
  const [trovan, piscina, codigo, lote, sala, tanque] = fila;
  pon(1, trovan); pon(3, piscina); pon(4, codigo); pon(5, lote); pon(6, sala); pon(7, tanque);
  await H.madReproAltaBatch();
};
const unAviso = (tipo) => {
  expect(avisos.map((a) => a.tipo + ': ' + a.msg), 'UN aviso por acción').toHaveLength(1);
  expect(avisos[0].tipo).toBe(tipo);
  expect(avisos[0].msg, 'sin jerga').not.toMatch(JERGA);
  expect(avisos[0].msg, 'sin el ✅ repetido (toast pone el suyo)').not.toMatch(/^\s*[✅⚠❌📶]/u);
  return avisos[0].msg;
};
const lineaVacia = (id) => expect(document.getElementById(id).textContent, 'la línea de progreso se borra al terminar').toBe('');
/** La MATRIZ sólo está en la copia guardada en el equipo y no hay red para leerla: algo que requiere atención. */
const conCopiaLocal = () => {
  const COLS = H._REPRO_MATRIZ_COLS;
  const fila = (o) => Object.fromEntries(COLS.map((c) => [c, o[c] ?? '']));
  localStorage.setItem('larv4_mad_matriz', JSON.stringify({ ts: Date.now() - 3600e3, cols: COLS, rows: [fila(VIVA)] }));
  H.setLecturas({});
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  lecturaRows = () => { throw new TypeError('Failed to fetch'); };
};
const enCola = () => new TypeError('Failed to fetch');

describe('E · eventos', () => {
  it('🔴 un desove que sale bien: UN aviso verde, sin ✅ repetido, y los envíos no avisan por su cuenta', async () => {
    await evento('Desove');
    expect(posts.length).toBeGreaterThan(0);
    expect(unAviso('ok')).toBe('1 desove(s) registrado(s).');
    lineaVacia('repro-paso');
  });

  it('mientras envía, la línea junto al botón lo dice; al terminar se borra', async () => {
    await evento('Desove');
    expect(pasos[0]).toBe('⏳ Enviando 1 desove(s)…');
    lineaVacia('repro-paso');
  });

  it('una mortalidad dice «registrada(s)» (concordancia)', async () => {
    await evento('Mortalidad');
    expect(unAviso('ok')).toBe('1 mortalidad(es) registrada(s).');
  });

  it('🔴 lo que requiere atención va DENTRO del único aviso, en naranja: la MATRIZ guardada en el equipo', async () => {
    conCopiaLocal();
    await evento('Desove');
    const msg = unAviso('warn');
    expect(msg.startsWith('1 desove(s) registrado(s). Se usó la MATRIZ guardada en este equipo el ')).toBe(true);
    expect(msg).toContain('(sin conexión a internet)');
    lineaVacia('repro-paso');
  });

  it('🔴 si los envíos quedan EN COLA: UN aviso (azul), sin el «Conexión inestable» de cada envío', async () => {
    respuestaPost = () => new TypeError('Failed to fetch');
    await evento('Desove');
    expect(unAviso('info')).toContain('EN COLA');
    expect(avisos.some((a) => /Conexión inestable/.test(a.msg))).toBe(false);
    lineaVacia('repro-paso');
  }, 20000);

  it('🔴 si el GAS rechaza: UN aviso rojo, con su motivo', async () => {
    respuestaPost = () => ({ status: 'error', message: 'Hoja no permitida' });
    await evento('Desove');
    expect(unAviso('err')).toContain('Hoja no permitida');
  });

  it('🔴 si otro envío de esa hoja sigue en curso: UN aviso que lo dice (antes lo decía postPayload, con jerga)', async () => {
    H.enCurso(S.bitacora);
    await evento('Desove');
    expect(unAviso('warn')).toContain('Todavía se está enviando el registro anterior');
  });

  it('🔴 si no se registra NADA: UN aviso rojo', async () => {
    const OTRO = '000E00AA09';                        // no está en la MATRIZ, ni en la releída para confirmar
    lecturaRows = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [VIVA] }) });
    await evento('Desove', OTRO);
    expect(posts).toHaveLength(0);
    expect(unAviso('err')).toMatch(/^No se registró nada: ningún Trovan superó la validación/);
    lineaVacia('repro-paso');
  });

  /* F3 (auditoría del 2026-09-25, usuario) · con DOS vivas en el chip no se registra nada HASTA ELEGIR: eso no es «nada
     válido», y el rojo decía justo lo contrario de lo que pedía el informe. */
  it('🔴 F3 · con DOS hembras vivas en el chip: UN aviso NARANJA que dice qué hacer, no el rojo de «nada válido»', async () => {
    const A = hembra({}), B = hembra({ 'Número': '2', 'Piscina': 'P2', 'Código genético': 'GEN2.B', 'Lote': 'XB', 'Sala actual': 'S2', 'Tanque actual': 'T2' });
    H.setLecturas({ [S.matriz]: [A, B], [S.bitacora]: [], [S.transfer]: [] });
    await evento('Mortalidad');
    expect(posts).toHaveLength(0);
    expect(unAviso('warn')).toBe('1 microchip(s) los llevan DOS hembras vivas: elige abajo de cuál es cada uno.');
    expect(document.querySelector('#repro-report .repro-elegir'), 'y abajo está dónde elegir').not.toBeNull();
    lineaVacia('repro-paso');
  });
});

describe('E · alta, traslado y elegir hembra', () => {
  it('🔴 alta: UN aviso verde', async () => {
    await alta(['000E00AA05', 'P2', 'GEN2.B', 'XB', 'S1', 'T3']);
    expect(unAviso('ok')).toBe('1 individuo(s) registrado(s).');
    lineaVacia('repro-a-paso');
  });

  it('🔴 alta de una cuaterna que ya existe: nada se envía, UN aviso ROJO', async () => {
    await alta([CHIP, 'P1', 'GEN1.A', 'XA', 'S1', 'T1']);
    expect(posts).toHaveLength(0);
    expect(unAviso('err')).toMatch(/^No se envió nada: ya hay un individuo/);
  });

  it('🔴 traslado: UN aviso verde con su número de traslado (sin «TR-ID»)', async () => {
    await traslado();
    expect(unAviso('ok')).toMatch(/^1 individuo\(s\) transferido\(s\) en el traslado TR-\d+\.$/);
    lineaVacia('repro-t-paso');
  });

  it('🔴 F3 · traslado con DOS hembras vivas en el chip: UN aviso NARANJA para elegir, no «no hay individuos válidos»', async () => {
    const A = hembra({}), B = hembra({ 'Número': '2', 'Piscina': 'P2', 'Código genético': 'GEN2.B', 'Lote': 'XB' });
    H.setLecturas({ [S.matriz]: [A, B], [S.bitacora]: [], [S.transfer]: [] });
    await traslado();
    expect(posts).toHaveLength(0);
    expect(unAviso('warn')).toBe('1 microchip(s) los llevan DOS hembras vivas: elige abajo de cuál es cada uno.');
    lineaVacia('repro-t-paso');
  });

  it('🔴 traslado sin MATRIZ: UN aviso rojo que dice por qué, sin «token» ni el nombre de la hoja', async () => {
    H.setLecturas({});
    lecturaRows = () => { throw new Error('Google no respondió en 30 s'); };
    await traslado();
    expect(posts).toHaveLength(0);
    const msg = unAviso('err');
    expect(msg).toContain('no se pudo leer la MATRIZ (Google no respondió en 30 s)');
    lineaVacia('repro-t-paso');
  }, 20000);

  it('🔴 elegir hembra (dos vivas en un chip): al registrar la elegida, UN aviso verde', async () => {
    const A = hembra({}), B = hembra({ 'Número': '2', 'Piscina': 'P2', 'Código genético': 'GEN2.B', 'Lote': 'XB', 'Sala actual': 'S2', 'Tanque actual': 'T2' });
    H.setLecturas({ [S.matriz]: [A, B], [S.bitacora]: [], [S.transfer]: [] });
    await evento('Mortalidad');
    expect(posts, 'con dos vivas no se registra solo').toHaveLength(0);
    avisos.length = 0;
    const radio = [...document.querySelectorAll('#repro-report .repro-elegir input[type="radio"]')].find((r) => r.parentElement.textContent.includes('XB'));
    radio.checked = true;
    const seq = Number(/\((\d+)\)/.exec(document.querySelector('#repro-report .repro-elegir button').getAttribute('onclick'))[1]);
    await H.madReproRegistrarElegidas(seq);
    expect(unAviso('ok')).toBe('1 registrado(s) con la hembra elegida.');
    lineaVacia('repro-paso');
  });
});

describe('E · en cola o rechazado, el mismo aviso lleva también lo que requiere atención', () => {
  it('🔴 en cola (azul) + la MATRIZ guardada en el equipo', async () => {
    conCopiaLocal();
    respuestaPost = enCola;
    await evento('Desove');
    const msg = unAviso('info');
    expect(msg).toContain('EN COLA');
    expect(msg).toContain('Se usó la MATRIZ guardada en este equipo');
  }, 20000);

  it('🔴 rechazado (rojo) + la MATRIZ guardada en el equipo', async () => {
    conCopiaLocal();
    respuestaPost = () => ({ status: 'error', message: 'Hoja no permitida' });
    await evento('Desove');
    const msg = unAviso('err');
    expect(msg).toContain('Hoja no permitida');
    expect(msg).toContain('Se usó la MATRIZ guardada en este equipo');
  });
});

describe('E · alta, traslado y elegir hembra: en cola, UN aviso azul (sus envíos callan)', () => {
  it('🔴 alta', async () => {
    respuestaPost = enCola;
    await alta(['000E00AA05', 'P2', 'GEN2.B', 'XB', 'S1', 'T3']);
    expect(unAviso('info')).toContain('EN COLA');
    lineaVacia('repro-a-paso');
  }, 20000);

  it('🔴 traslado', async () => {
    respuestaPost = enCola;
    await traslado();
    expect(unAviso('info')).toContain('EN COLA');
    lineaVacia('repro-t-paso');
  }, 20000);

  it('🔴 elegir hembra', async () => {
    const A = hembra({}), B = hembra({ 'Número': '2', 'Piscina': 'P2', 'Código genético': 'GEN2.B', 'Lote': 'XB', 'Sala actual': 'S2', 'Tanque actual': 'T2' });
    H.setLecturas({ [S.matriz]: [A, B], [S.bitacora]: [], [S.transfer]: [] });
    await evento('Mortalidad');
    avisos.length = 0;
    respuestaPost = enCola;
    [...document.querySelectorAll('#repro-report .repro-elegir input[type="radio"]')].find((r) => r.parentElement.textContent.includes('XB')).checked = true;
    await H.madReproRegistrarElegidas(Number(/\((\d+)\)/.exec(document.querySelector('#repro-report .repro-elegir button').getAttribute('onclick'))[1]));
    expect(unAviso('info')).toContain('EN COLA');
    lineaVacia('repro-paso');
  }, 20000);
});

describe('E · el resto de fichas avisa como siempre', () => {
  it('sin `sinAvisos`, un envío que queda en cola sigue diciendo «Conexión inestable»; con él, calla', async () => {
    respuestaPost = () => new TypeError('Failed to fetch');
    const payload = { sheetName: 'Hoja de prueba', headers: ['A'], rows: [['1']] };
    await H.postPayload(payload, 'https://script.google.com/macros/s/X/exec', {});
    expect(avisos.some((a) => /Conexión inestable/.test(a.msg))).toBe(true);
    avisos.length = 0;
    H.reiniciarEnvios();
    const o = { sinAvisos: true };
    await H.postPayload({ sheetName: 'Hoja de prueba', headers: ['A'], rows: [['2']] }, 'https://script.google.com/macros/s/X/exec', o);
    expect(avisos).toHaveLength(0);
    expect(o.outcome, 'y el resultado sigue llegando a quien llama').toBe('queued');
  }, 20000);
});
