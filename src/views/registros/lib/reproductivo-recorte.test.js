// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · REGISTRO REPRODUCTIVO · UNA HOJA LEÍDA A MEDIAS (D11, 2026-09-13)

   🔴 LO QUE PASABA. `?p=rows` corta en un tope fijo y devuelve las PRIMERAS filas, así que lo
   que se pierde al recortar es lo MÁS RECIENTE. Con el tope en 5000, la Bitácora del
   reproductivo (2227 filas medidas el 09-13, entre 21 y 30 nuevas al día) lo alcanzaba entre
   diciembre de 2026 y enero de 2027. Desde el 09-09 el GAS dice `truncated`, pero sólo el libro
   mayor lo miraba: en el reproductivo el aviso se guardaba en `_reproTrunc` y nadie lo leía.
     · la MATRIZ recortada → el aviso cantaba «✅ MATRIZ al día», un individuo dado de alta
       después salía «no encontrado», y un alta repetida de uno de ellos NO se detectaba y lo
       SOBRESCRIBÍA en la hoja (la llave de la MATRIZ es el Trovan: podía «revivir» a una muerta);
     · la Bitácora o Transferencias recortadas → la Consulta enseñaba totales, desoves y
       trazabilidad cortos sin decirlo;
     · Transferencias recortada → el TR-ID sale del máximo de MEDIO ledger, o sea que REPITE uno
       que ya existe, y con la llave TR-ID+Trovan pisa esa fila del historial.

   Decisión del usuario: opción B — subir el tope a 20000 y que el reproductivo avise. La
   transferencia, además, se DETIENE con el ledger recortado: ahí no hay aviso que valga, el
   TR-ID que saldría se sabe equivocado.

   🔑 Sólo cuenta la lectura del GAS. El store del dashboard trae la hoja ENTERA y, cuando la
   tiene, es la que se usa (`_reproReadRows`): con él no hay nada que avisar ni que detener.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, Script } from 'node:vm';

const RAIZ = process.cwd();
const ENGINE = join(RAIZ, 'public/registros/engine.js');
const SHELL = join(RAIZ, 'src/views/registros/shell.html');
const GAS = readFileSync(join(RAIZ, 'GAS/Code.gs'), 'utf8');

/* ── El servidor: el tope ────────────────────────────────── */
function leerFilas(nDatos) {
  const vals = [['Trovan ID', 'Fecha', 'Tipo']];
  for (let i = 0; i < nDatos; i++) vals.push(['T' + i, '2026-09-13', 'Desove']);
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ texto: s, setMimeType() { return this; } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => vals }) }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    console: { error() {} },
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(GAS + '\n;globalThis.__get = doGet;').runInContext(ctx);
  return JSON.parse(ctx.__get({ parameter: { p: 'rows', sheet: 'Maduración Bitácora' } }).texto);
}

describe('D11 · GAS · el tope de ?p=rows es 20000', () => {
  it('🔴 una hoja de 5001 filas llega ENTERA (con 5000 perdía la más reciente)', () => {
    const r = leerFilas(5001);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(5001);
    expect(r.truncated).toBeUndefined();
    expect(r.rows[5000]['Trovan ID']).toBe('T5000');
  });

  it('20000 filas exactas llegan enteras y SIN marca de recorte', () => {
    const r = leerFilas(20000);
    expect(r.rows).toHaveLength(20000);
    expect(r.truncated).toBeUndefined();
  });

  it('la 20001 ya se recorta, y la respuesta lo DICE con su límite', () => {
    const r = leerFilas(20001);
    expect(r.rows).toHaveLength(20000);
    expect(r.truncated).toBe(true);
    expect(r.limit).toBe(20000);
  });
});

/* ── El cliente: el reproductivo avisa, y la transferencia se detiene ── */
const EXPORTAR = ['_reproMatrixBannerHTML', '_reproConsultaHTML', '_reproTransferHTML',
  'madReproTransfer', '_REPRO_SHEETS'];
const H = {};
const avisos = [];
const envios = [];

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

  /* ⚠ `new Function` NO deja nada en globalThis: sin este epílogo no se toca ni una función. */
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setLecturas=function(hojas, trunc){ _reproSheets=hojas; _reproTrunc=trunc; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPost(async (payload) => { envios.push(payload); return true; });
});

const TROVAN = '000821AFF0';
const MATRIZ = [{ 'Trovan ID': TROVAN, 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo' }];
const LEDGER = [{ 'TR-ID': 'TR-000007', 'Trovan ID': '000821AFF9' }];
const BITACORA = [{ 'Trovan ID': TROVAN, 'Fecha': '2026-09-01', 'Tipo': 'Desove' }];
let S;

beforeEach(() => {
  S = H._REPRO_SHEETS;
  avisos.length = 0;
  envios.length = 0;
  window.__rgLib.reproReadSheet = undefined;          // sin store del dashboard: se lee del GAS
  H.setLecturas({ [S.matriz]: MATRIZ, [S.bitacora]: BITACORA, [S.transfer]: LEDGER }, {});
});

describe('D11 · el aviso de la MATRIZ no canta ✅ sobre media hoja', () => {
  it('el fixture ejerce algo: leída entera dice ✅ al día', () => {
    const b = H._reproMatrixBannerHTML();
    expect(b).toContain('✅ MATRIZ al día');
    expect(b).not.toContain('RECORTADA');
  });

  it('🔴 recortada lo DICE, sin ✅, y advierte del alta que sobrescribe', () => {
    H.setLecturas({ [S.matriz]: MATRIZ }, { [S.matriz]: true });
    const b = H._reproMatrixBannerHTML();
    expect(b).toContain('RECORTADA');
    expect(b).not.toContain('✅');
    expect(b).toContain('sobrescribiría');
  });

  it('si el store del dashboard la trae, manda el store: nada que avisar', () => {
    H.setLecturas({ [S.matriz]: MATRIZ }, { [S.matriz]: true });
    window.__rgLib.reproReadSheet = (h) => (h === S.matriz ? MATRIZ : []);
    expect(H._reproMatrixBannerHTML()).toContain('✅ MATRIZ al día');
  });

  it('el recorte de OTRA hoja no ensucia el aviso de la MATRIZ', () => {
    H.setLecturas({ [S.matriz]: MATRIZ, [S.bitacora]: BITACORA }, { [S.bitacora]: true });
    expect(H._reproMatrixBannerHTML()).toContain('✅ MATRIZ al día');
  });
});

describe('D11 · la Consulta dice qué hojas llegaron recortadas', () => {
  it('el fixture ejerce algo: sin recorte no hay aviso', () => {
    expect(H._reproConsultaHTML()).not.toContain('RECORTADA');
  });

  for (const clave of ['matriz', 'bitacora', 'transfer']) {
    it(`🔴 «${clave}» recortada se NOMBRA en la Consulta`, () => {
      H.setLecturas({ [S.matriz]: MATRIZ, [S.bitacora]: BITACORA, [S.transfer]: LEDGER }, { [S[clave]]: true });
      const h = H._reproConsultaHTML();
      expect(h).toContain('RECORTADA');
      expect(h).toContain(S[clave]);
    });
  }

  it('con el store trayendo la hoja, la Consulta no avisa de ella', () => {
    H.setLecturas({ [S.matriz]: MATRIZ, [S.bitacora]: BITACORA, [S.transfer]: LEDGER }, { [S.bitacora]: true });
    window.__rgLib.reproReadSheet = (h) => (h === S.bitacora ? BITACORA : []);
    expect(H._reproConsultaHTML()).not.toContain('RECORTADA');
  });
});

function pintarTransferencia() {
  let c = document.getElementById('d11-transfer');
  if (!c) { c = document.createElement('div'); c.id = 'd11-transfer'; document.body.appendChild(c); }
  c.innerHTML = H._reproTransferHTML();
  document.getElementById('repro-t-osala').value = 'S1';
  document.getElementById('repro-t-otanque').value = 'T1';
  document.querySelector('#repro-t-dests .repro-dest-sala').value = 'S2';
  document.querySelector('#repro-t-dests .repro-dest-tanque').value = 'T4';
  document.querySelector('#repro-t-dests .repro-dest-codes').value = TROVAN;
}

describe('D11 · con el ledger recortado la transferencia NO sale', () => {
  it('el fixture ejerce algo: con el ledger entero se envía, con el TR-ID siguiente al máximo', async () => {
    pintarTransferencia();
    await H.madReproTransfer();
    expect(envios).toHaveLength(2);
    expect(envios[1].rows[0][0]).toBe('TR-000008');
  });

  it('🔴 recortado: no se envía NADA, se dice por qué y lo pegado sigue en su sitio', async () => {
    H.setLecturas({ [S.matriz]: MATRIZ, [S.transfer]: LEDGER }, { [S.transfer]: true });
    pintarTransferencia();
    await H.madReproTransfer();
    expect(envios).toHaveLength(0);
    const err = avisos.find((a) => a.tipo === 'err');
    expect(err && err.msg).toContain('RECORTADA');
    expect(err.msg).toContain('TR-ID');
    expect(document.querySelector('#repro-t-dests .repro-dest-codes').value).toBe(TROVAN);
  });

  it('el recorte de la MATRIZ no detiene la transferencia (valida contra lo que hay)', async () => {
    H.setLecturas({ [S.matriz]: MATRIZ, [S.transfer]: LEDGER }, { [S.matriz]: true });
    pintarTransferencia();
    await H.madReproTransfer();
    expect(envios).toHaveLength(2);
  });

  it('con el store trayendo el ledger entero, se envía aunque la lectura del GAS se recortara', async () => {
    H.setLecturas({ [S.matriz]: MATRIZ, [S.transfer]: LEDGER }, { [S.transfer]: true });
    window.__rgLib.reproReadSheet = (h) => (h === S.transfer ? LEDGER : []);
    pintarTransferencia();
    await H.madReproTransfer();
    expect(envios).toHaveLength(2);
  });
});
