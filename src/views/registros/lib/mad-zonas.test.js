// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · SALAS · ZONAS DE DESOVE Y RESERVORIOS (2026-10-27, usuario)

   Temperatura (cada 2 h) y O₂ (cada 6 h), como las salas, en cinco zonas: «Sala desove (masivos)» con 6
   tanques, «Sala desove/eclosión 1» y «2» con 5 cada una, y los Reservorios 1 y 2, que van por ÁREA (sin
   tanque). Decisiones del usuario: dentro de 🏠 Salas (misma fecha y mismos botones), a una hoja PROPIA,
   «Maduración Zonas», con llave (Fecha, Zona, Tanque), y en el mismo PDF de Salas.

   Qué se exige:
   1 · La grilla pinta las 18 filas y sólo se guardan y envían las que llevan alguna lectura.
   2 · Las mismas reglas que Salas: fuera de rango no se guarda (bloquea a mano, avisa en silencio) y una
       lectura borrada se guarda borrada. Cada (fecha, zona, tanque) es UN registro: guardar otra vez
       actualiza, y el T1 de una zona no es el de otra.
   3 · El envío va a «Maduración Zonas» con su cabecera, y por la puerta del sello: a un GAS que no es el de
       esta app no se le entrega (Salas, que no cambió, sí sale).
   4 · El GAS de verdad (Code.gs) la admite, la llavea por (Fecha, Zona, Tanque) y rechaza un envío corrido.
   5 · El pegado y las flechas de Salas no caen en las zonas, ni al revés.
   6 · Cambiar de fecha con lo tecleado lleva también las zonas; el PDF, el Historial y el autoguardado las incluyen.

   Vive sólo en el monolito, así que se arranca ENTERO sobre happy-dom. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, Script } from 'node:vm';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const CODE_GS = readFileSync(join(process.cwd(), 'GAS/Code.gs'), 'utf8').split('\r\n').join('\n');
const EXPORTAR = ['renderMadSalas', 'madSalasFechaChange', 'saveMadSalasGrid', 'syncMadSalasGrid', 'loadMad', 'saveMadList',
  '_gasVersionLocal', 'MAD_MOD', '_madGridDiaDeLaApp', 'buildMadPayload', 'madGridPaste', 'madGridKey', 'MAD_ZONAS_FILAS',
  '_madHojaPideGasNuevo', 'downloadMadPDF', '_madHistGrillas', 'saveMadRecovery', 'loadMadRecovery', 'recoverMadGrid',
  'syncAll', 'updateDots'];
const H = {};
const envios = [];
const avisos = [];
let selloDelGas = null;   // null = el de esta app

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
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPostOnce(async (body) => { envios.push(JSON.parse(JSON.stringify(body))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: selloDelGas || H._gasVersionLocal() }) };
    }
    throw new Error('fetch inesperado: ' + u);
  };
});

beforeEach(() => {
  localStorage.clear();
  envios.length = 0;
  avisos.length = 0;
  selloDelGas = null;
  document.getElementById('fp-salas').innerHTML = '';
  H.renderMadSalas();
});

const HOY = () => H._madGridDiaDeLaApp();
const OTRO_DIA = '2026-09-14';
/** La celda `k` de la fila `zi` de las zonas (0 = masivos T1 … 15 = eclosión 2 T5, 16 y 17 = los reservorios). */
const celZ = (zi, k) => document.querySelector('#fp-zonas [name="zg_' + zi + '_' + k + '"]');
const ponerZ = (zi, k, v) => { const e = celZ(zi, k); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); };
const celS = (si, k) => document.querySelector('#fp-salas [name="sg_' + si + '_' + k + '"]');
const zonas = () => H.loadMad('zonas').map((r) => r.data);

describe('Maduración · Zonas · la grilla', () => {
  it('pinta las 18 filas en su orden: 6 + 5 + 5 tanques y los dos reservorios sin tanque', () => {
    expect(H.MAD_ZONAS_FILAS.map((f) => f.zona + '|' + f.tanque)).toEqual([
      ...[1, 2, 3, 4, 5, 6].map((t) => 'Sala desove (masivos)|' + t),
      ...[1, 2, 3, 4, 5].map((t) => 'Sala desove/eclosión 1|' + t),
      ...[1, 2, 3, 4, 5].map((t) => 'Sala desove/eclosión 2|' + t),
      'Reservorio 1|', 'Reservorio 2|',
    ]);
    const filas = document.querySelectorAll('#fp-zonas tbody tr');
    expect(filas).toHaveLength(18);
    // Las doce temperaturas y los cuatro O₂, en cada fila, con el rango de las salas.
    for (let zi = 0; zi < 18; zi++) {
      expect(celZ(zi, 'temp_02').max).toBe('40');
      expect(celZ(zi, 'temp_00')).not.toBeNull();
      expect(celZ(zi, 'ox_06').max).toBe('20');
      expect(celZ(zi, 'ox_00')).not.toBeNull();
    }
    expect(filas[16].textContent).toContain('Reservorio 1');
    expect(filas[16].textContent).toContain('—');
    expect(filas[0].textContent).toContain('T1');
  });

  it('va DENTRO de 🏠 Salas, debajo de su tabla y antes de sus botones', () => {
    const fp = document.getElementById('fp-salas');
    const z = document.getElementById('fp-zonas');
    expect(fp.contains(z)).toBe(true);
    const btn = fp.querySelector('button[onclick="syncMadSalasGrid()"]');
    expect(z.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Maduración · Zonas · guardar', () => {
  it('sólo se guardan las filas con alguna lectura, cada una con su zona y su tanque', () => {
    ponerZ(0, 'temp_02', 28.4);       // masivos · T1
    ponerZ(7, 'ox_06', 5.6);          // eclosión 1 · T2 (sólo O₂)
    ponerZ(16, 'temp_10', 26.9);      // Reservorio 1
    expect(H.saveMadSalasGrid()).toBe(3);
    const d = zonas().sort((a, b) => a.zona.localeCompare(b.zona) || String(a.tanque).localeCompare(String(b.tanque)));
    expect(d.map((x) => [x.zona, x.tanque])).toEqual([
      ['Reservorio 1', ''], ['Sala desove (masivos)', 1], ['Sala desove/eclosión 1', 2],
    ]);
    expect(d.find((x) => x.zona === 'Sala desove (masivos)').temp_02).toBe(28.4);
    expect(d.find((x) => x.tanque === 2).ox_06).toBe(5.6);
    expect(d.every((x) => x.fecha === HOY())).toBe(true);
    // Las salas no ganan filas por teclear en las zonas.
    expect(H.loadMad('salas')).toEqual([]);
  });

  it('las salas siguen como antes: sin zonas tecleadas, la lista de zonas no se toca', () => {
    celS(0, 'temp_02').value = '28';
    expect(H.saveMadSalasGrid()).toBe(1);
    expect(H.loadMad('salas')).toHaveLength(1);
    expect(H.loadMad('zonas')).toEqual([]);
    expect(avisos.at(-1).msg).toContain('1 sala(s) guardada(s) localmente');
  });

  it('🔴 fuera de rango: a mano BLOQUEA (y nombra la zona); en silencio guarda lo válido y avisa', () => {
    ponerZ(3, 'temp_04', 45);         // masivos · T4
    ponerZ(17, 'temp_06', 27);        // Reservorio 2
    expect(H.saveMadSalasGrid()).toBe(-1);
    expect(H.loadMad('zonas')).toEqual([]);
    expect(avisos.at(-1).tipo).toBe('err');
    expect(avisos.at(-1).msg).toContain('Sala desove (masivos) · T4');
    expect(celZ(3, 'temp_04').classList.contains('inp-bad')).toBe(true);

    expect(H.saveMadSalasGrid({ silent: true })).toBe(1);
    expect(zonas().map((x) => x.zona)).toEqual(['Reservorio 2']);
    expect(avisos.at(-1).tipo).toBe('warn');
  });

  it('cada (fecha, zona, tanque) es UN registro: guardar otra vez actualiza, y el T1 de otra zona es otro', () => {
    ponerZ(0, 'temp_02', 28);         // masivos · T1
    ponerZ(6, 'temp_02', 29);         // eclosión 1 · T1
    H.saveMadSalasGrid();
    H.renderMadSalas();
    ponerZ(0, 'temp_04', 28.6);
    H.saveMadSalasGrid();
    expect(zonas()).toHaveLength(2);
    const t1 = zonas().find((x) => x.zona === 'Sala desove (masivos)');
    expect([t1.temp_02, t1.temp_04]).toEqual([28, 28.6]);
    expect(zonas().find((x) => x.zona === 'Sala desove/eclosión 1').temp_02).toBe(29);
  });

  it('una lectura BORRADA se guarda borrada (como en Salas)', () => {
    ponerZ(16, 'temp_02', 27);
    ponerZ(16, 'temp_04', 27.5);
    H.saveMadSalasGrid();
    H.renderMadSalas();
    ponerZ(16, 'temp_04', '');
    H.saveMadSalasGrid();
    const r = zonas()[0];
    expect([r.temp_02, r.temp_04]).toEqual([27, '']);
  });
});

describe('Maduración · Zonas · el envío', () => {
  const CAB = ['Fecha', 'Zona', 'Tanque',
    'Temperatura 2:00', 'Temperatura 4:00', 'Temperatura 6:00', 'Temperatura 8:00', 'Temperatura 10:00', 'Temperatura 12:00',
    'Temperatura 14:00', 'Temperatura 16:00', 'Temperatura 18:00', 'Temperatura 20:00', 'Temperatura 22:00', 'Temperatura 0:00',
    'Oxígeno 06:00', 'Oxígeno 12:00', 'Oxígeno 18:00', 'Oxígeno 00:00'];

  it('va a «Maduración Zonas» con su cabecera; el tanque como número y el reservorio sin él', async () => {
    ponerZ(1, 'temp_02', 28.1);       // masivos · T2
    ponerZ(17, 'ox_18', 6.2);         // Reservorio 2
    await H.syncMadSalasGrid();
    expect(envios).toHaveLength(1);
    const p = envios[0];
    expect(p.sheetName).toBe('Maduración Zonas');
    expect(p.headers).toEqual(CAB);
    const filas = p.rows.map((f) => [f[1], f[2], f[3], f[17]]).sort((a, b) => a[0].localeCompare(b[0]));
    expect(filas).toEqual([['Reservorio 2', '', '', 6.2], ['Sala desove (masivos)', 2, 28.1, '']]);
    expect(H.loadMad('zonas').every((r) => r.synced)).toBe(true);
  });

  it('con salas y zonas pendientes salen las DOS, cada una a su hoja', async () => {
    celS(1, 'temp_02').value = '28';
    ponerZ(10, 'temp_02', 29);
    await H.syncMadSalasGrid();
    expect(envios.map((e) => e.sheetName)).toEqual(['Maduración Sala', 'Maduración Zonas']);
  });

  it('🔴 a un GAS que no es el de esta app NO se le entregan las zonas (Salas sí sale)', async () => {
    selloDelGas = 'abc123def456';
    celS(1, 'temp_02').value = '28.3';   // otra cifra: el MISMO envío de hace < 30 s lo omite el antiduplicado de postPayload
    ponerZ(10, 'temp_02', 29);
    await H.syncMadSalasGrid();
    expect(envios.map((e) => e.sheetName)).toEqual(['Maduración Sala']);
    expect(H.loadMad('zonas').some((r) => r.synced)).toBe(false);
    expect(H._madHojaPideGasNuevo('Maduración Zonas')).toBe(true);
    expect(H._madHojaPideGasNuevo('Maduración Sala')).toBe(false);   // el fixture distingue
  });

  it('el 🔄 global también las envía a su hoja, y también por la puerta del sello', async () => {
    H.setVista(H.MAD_MOD, 'salas');
    ponerZ(14, 'temp_08', 28.7);
    H.saveMadSalasGrid();
    selloDelGas = 'abc123def456';
    await H.syncAll();
    expect(envios.map((e) => e.sheetName)).not.toContain('Maduración Zonas');
    expect(H.loadMad('zonas').some((r) => r.synced)).toBe(false);
    selloDelGas = null;
    await H.syncAll();
    expect(envios.map((e) => e.sheetName)).toContain('Maduración Zonas');
    expect(H.loadMad('zonas').every((r) => r.synced)).toBe(true);
  });

  it('lo pendiente de las zonas enciende el punto de 🏠 Salas', () => {
    H.setVista(H.MAD_MOD, 'salas');
    let dot = document.getElementById('dot-salas');
    if (!dot) { dot = document.createElement('span'); dot.id = 'dot-salas'; document.body.appendChild(dot); }
    H.updateDots();
    expect(dot.className).toContain('mt');
    ponerZ(2, 'temp_02', 28);
    H.saveMadSalasGrid();
    H.updateDots();
    expect(dot.className).toContain('pend');
  });
});

/* ── El GAS real (Code.gs), entero, con una hoja falsa ── */
function hojaFalsa() {
  const filas = [];
  const cadena = () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => cadena()) });
  return {
    filas,
    getLastRow: () => filas.length,
    getLastColumn: () => filas.reduce((m, f) => Math.max(m, f.length), 0),
    getMaxColumns: () => 60, getMaxRows: () => 1000,
    insertRowsAfter() {}, insertColumnsAfter() {}, setFrozenRows() {},
    appendRow(v) { filas.push(v.slice()); },
    deleteRows(r, n) { filas.splice(r - 1, n); },
    getDataRange: () => ({ getValues: () => filas.map((f) => f.slice()) }),
    getRange(r, c, nR = 1, nC = 1) {
      const rango = {
        getValues: () => Array.from({ length: nR }, (_, i) => Array.from({ length: nC }, (_, k) => {
          const v = (filas[r - 1 + i] || [])[c - 1 + k]; return v === undefined ? '' : v;
        })),
        setValues: (vals) => {
          vals.forEach((v, i) => { const f = filas[r - 1 + i] || (filas[r - 1 + i] = []); v.forEach((x, k) => { f[c - 1 + k] = x; }); });
          return cadena();
        },
      };
      return new Proxy(rango, { get: (t, k) => (k in t ? t[k] : () => cadena()) });
    },
  };
}
function gas(hojas) {
  const cache = new Map();
  const ctx = {
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (n) => hojas[n] || null, insertSheet: (n) => (hojas[n] = hojaFalsa()) }),
      flush() {},
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: { sleep() {}, formatDate: (d) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'America/Guayaquil' },
    Logger: { log() {} },
    console: { error() {}, log() {} },
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(CODE_GS + '\n;globalThis.__doPost = doPost;').runInContext(ctx);
  let n = 0;
  return (payload) => ctx.__doPost({
    postData: { contents: JSON.stringify(Object.assign({ reqId: 'zonas-' + (n++) }, payload)) },
    parameter: { z: 'zonas-' + n },
  });
}

describe('Maduración · Zonas · el GAS (Code.gs)', () => {
  const payloadDe = (recs) => H.buildMadPayload('zonas', recs.map((data, i) => ({ id: 'z' + i, data })));
  const lectura = (zona, tanque, extra) => ({ fecha: '2026-10-20', zona, tanque, temp_02: 28, ox_06: 5, ...extra });

  it('la admite, nace con la cabecera del cliente y llavea por (Fecha, Zona, Tanque)', () => {
    const hojas = {};
    const post = gas(hojas);
    const r1 = post(payloadDe([lectura('Sala desove (masivos)', 1), lectura('Sala desove/eclosión 1', 1), lectura('Reservorio 1', '')]));
    expect(r1.status).toBe('ok');
    const h = hojas['Maduración Zonas'];
    expect(h.filas[0]).toEqual(payloadDe([]).headers);
    expect(h.filas).toHaveLength(4);
    // Otra vez el T1 de masivos y el reservorio, con otra lectura: ACTUALIZAN; el T2 es nuevo.
    const r2 = post(payloadDe([lectura('Sala desove (masivos)', 1, { temp_02: 28.9 }), lectura('Reservorio 1', '', { temp_02: 26 }),
      lectura('Sala desove (masivos)', 2)]));
    expect(r2.status).toBe('ok');
    expect(h.filas).toHaveLength(5);
    const fila = (zona, t) => h.filas.find((f) => f[1] === zona && String(f[2]) === String(t));
    expect(fila('Sala desove (masivos)', 1)[3]).toBe(28.9);
    expect(fila('Sala desove/eclosión 1', 1)[3]).toBe(28);   // la de otra zona, intacta
    expect(fila('Reservorio 1', '')[3]).toBe(26);
  });

  it('🔴 la firma de esquema rechaza un envío CORRIDO y no escribe nada', () => {
    const hojas = {};
    const p = payloadDe([lectura('Reservorio 2', '')]);
    p.headers = ['Fecha', 'Zona', 'Ubicación'].concat(p.headers.slice(3));   // la 3 ya no es «Tanque»
    const r = gas(hojas)(p);
    expect(r.status).not.toBe('ok');
    expect((hojas['Maduración Zonas'] || { filas: [] }).filas).toEqual([]);
  });

  it('la firma de Code.gs casa con la cabecera del cliente (3 «Tanque», 19 «Oxígeno 00:00»)', () => {
    const cab = payloadDe([]).headers;
    expect(CODE_GS).toMatch(/"Maduración Zonas":\s*\[\[3, "Tanque"\], \[19, "Oxígeno 00:00"\]\]/);
    expect([cab[2], cab[18], cab.length]).toEqual(['Tanque', 'Oxígeno 00:00', 19]);
  });
});

describe('Maduración · Zonas · pegado y flechas no se cruzan con Salas', () => {
  const pegar = (target, texto, ficha) => H.madGridPaste({
    clipboardData: { getData: () => texto }, target, preventDefault() {},
  }, ficha);

  it('un bloque pegado en las zonas rellena SUS celdas', () => {
    pegar(celZ(0, 'temp_02'), '28.1\t28.2\n29.1\t29.2', 'zonas');
    expect([celZ(0, 'temp_02').value, celZ(0, 'temp_04').value, celZ(1, 'temp_02').value, celZ(1, 'temp_04').value])
      .toEqual(['28.1', '28.2', '29.1', '29.2']);
  });

  it('🔴 un bloque pegado en Salas que se pasa de la Sala 5 NO cae en las zonas', () => {
    pegar(celS(3, 'temp_02'), '27\n27.5\n28\n28.5', 'salas');   // Sala 4, Sala 5 y dos líneas de más
    expect([celS(3, 'temp_02').value, celS(4, 'temp_02').value]).toEqual(['27', '27.5']);
    for (let zi = 0; zi < 18; zi++) expect(celZ(zi, 'temp_02').value, 'zona ' + zi).toBe('');
  });

  it('🔴 la flecha ↓ desde la Sala 5 no salta a las zonas; dentro de las zonas, baja a la fila siguiente', () => {
    const flecha = (target) => H.madGridKey({ key: 'ArrowDown', target, preventDefault() {} });
    const s5 = celS(4, 'temp_02');
    s5.focus();
    flecha(s5);
    expect(document.activeElement).toBe(s5);
    const z0 = celZ(0, 'temp_02');
    z0.focus();
    flecha(z0);
    expect(document.activeElement).toBe(celZ(1, 'temp_02'));
  });
});

describe('Maduración · Zonas · fecha, PDF, Historial y autoguardado', () => {
  it('cambiar de fecha con lo tecleado LLEVA también las zonas al día elegido', () => {
    ponerZ(5, 'temp_02', 28);   // masivos · T6
    const f = document.getElementById('mad-salas-fecha');
    f.value = OTRO_DIA;
    H.madSalasFechaChange();
    expect(zonas().map((x) => [x.fecha, x.tanque])).toEqual([[OTRO_DIA, 6]]);
  });

  it('🔴 con zonas YA guardadas en el día, PREGUNTA y, al aceptar, las MUEVE (no las deja duplicadas)', () => {
    ponerZ(5, 'temp_02', 28);
    H.saveMadSalasGrid({ silent: true });   // el autoguardado de la navegación
    H.renderMadSalas();
    ponerZ(5, 'temp_04', 28.5);              // y se sigue tecleando
    let preguntas = 0;
    const confirmar = window.confirm;
    window.confirm = () => { preguntas++; return true; };
    try {
      document.getElementById('mad-salas-fecha').value = OTRO_DIA;
      H.madSalasFechaChange();
    } finally { window.confirm = confirmar; }
    expect(preguntas).toBe(1);
    expect(zonas().map((x) => [x.fecha, x.temp_02, x.temp_04])).toEqual([[OTRO_DIA, 28, 28.5]]);
  });

  it('el PDF de Salas sale con SÓLO zonas guardadas, y las lleva en su tabla', () => {
    ponerZ(16, 'temp_02', 27);
    H.saveMadSalasGrid();
    let html = '';
    const abrir = window.open;
    window.open = () => ({ document: { write: (s) => { html += s; }, close() {}, title: '' } });
    try { H.downloadMadPDF('salas'); } finally { window.open = abrir; }
    expect(html).toContain('Zonas de desove y reservorios');
    expect(html).toContain('Reservorio 1');
    expect(avisos.some((a) => a.msg.indexOf('Sin registros') !== -1)).toBe(false);
  });

  it('el Historial cuenta las zonas ENVIADAS en el día de 🏠 Salas', async () => {
    ponerZ(12, 'temp_02', 28);
    await H.syncMadSalasGrid();
    const g = H._madHistGrillas().filter((x) => x.ficha === 'salas' && x.fecha === HOY());
    expect(g).toHaveLength(1);
    expect(g[0].n).toBe(1);
  });

  it('el autoguardado de recuperación guarda y devuelve también las zonas', () => {
    H.setVista(H.MAD_MOD, 'salas');
    ponerZ(9, 'ox_12', 5.4);
    H.saveMadRecovery();
    expect(H.loadMadRecovery().zonas).toHaveLength(1);
    const confirmar = window.confirm;
    window.confirm = () => true;
    try { H.recoverMadGrid(); } finally { window.confirm = confirmar; }
    expect(zonas().map((x) => [x.zona, x.tanque, x.ox_12])).toEqual([['Sala desove/eclosión 1', 4, 5.4]]);
  });
});
