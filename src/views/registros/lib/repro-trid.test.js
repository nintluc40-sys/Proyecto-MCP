// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · REPRODUCTIVO · EL TR-ID NO SE REPITE (A11, 2026-11-06)

   LO QUE PASABA: el número de un traslado (TR-000NNN) salía del máximo de «Maduración Transferencias», pero esa hoja no
   se volvía a leer: valía la lectura de antes (o la del tablero, de hasta 5 min). Dos traslados seguidos sacaban el MISMO
   número —medido el 04-11: 2 de 10 TR-ID en dos fechas—, y el contador del equipo sólo contaba sin ninguna lectura.

   AHORA (usuario: «Releer y no repetir»): antes de numerar se RELEE la hoja; el número es uno más que el mayor entre esa
   lectura, la del tablero y el último que dio el equipo, y se reserva al enviar. Si la relectura falla, sigue con lo que
   tenía, como antes. El aviso de hoja recortada (D11) no cambia: lo vigila reproductivo-recorte.test.js.

   Motor REAL sobre el shell real; Google y el envío, simulados. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['_reproTransferHTML', 'madReproTransfer', '_REPRO_SHEETS', '_reproBumpTrSeq'];
const H = {};
const envios = [];
let ledgerDeGoogle = null;   // lo que contesta la relectura (null = falla)
let lecturas = 0;

const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setLecturas=function(hojas, trunc){ _reproSheets=hojas; _reproTrunc=trunc; }; }catch(_){}'
    + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast(() => {});
  H.setPost(async (payload) => { envios.push(payload); return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=rows') !== -1 && String(url).indexOf(encodeURIComponent(H._REPRO_SHEETS.transfer)) !== -1) {
      lecturas++;
      // «caída»: una respuesta que el motor rechaza sin reintentar a lo largo (dos intentos, 1,5 s entre ellos)
      if (!ledgerDeGoogle) return { ok: true, status: 200, text: async () => '{"ok":false,"error":"caído"}' };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: ledgerDeGoogle }) };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
});

const TROVAN = '000821AFF0';
const MATRIZ = [{ 'Trovan ID': TROVAN, 'Sala actual': 'S1', 'Tanque actual': 'T1', 'Estado': 'Vivo' }];
const fila = (tr) => ({ 'TR-ID': tr, 'Trovan ID': '000821AFF9' });
let S;

function pintar() {
  let c = document.getElementById('trid-transfer');
  if (!c) { c = document.createElement('div'); c.id = 'trid-transfer'; document.body.appendChild(c); }
  c.innerHTML = H._reproTransferHTML();
  document.getElementById('repro-t-osala').value = 'S1';
  document.getElementById('repro-t-otanque').value = 'T1';
  document.querySelector('#repro-t-dests .repro-dest-sala').value = 'S2';
  document.querySelector('#repro-t-dests .repro-dest-tanque').value = 'T4';
  document.querySelector('#repro-t-dests .repro-dest-codes').value = TROVAN;
}
const trasladar = async () => { pintar(); await H.madReproTransfer(); return envios.filter((e) => e.sheetName === S.transfer).at(-1).rows[0][0]; };

beforeEach(() => {
  S = H._REPRO_SHEETS;
  almacen.clear();
  envios.length = 0;
  lecturas = 0;
  ledgerDeGoogle = null;
  window.__rgLib.reproReadSheet = undefined;   // sin store del tablero
  H.setLecturas({ [S.matriz]: MATRIZ, [S.transfer]: [fila('TR-000007')] }, {});
});

describe('A11 · el TR-ID no se repite', () => {
  it('🔴 RELEE la hoja antes de numerar: lo que escribió otro equipo cuenta (antes salía el siguiente a la lectura vieja)', async () => {
    ledgerDeGoogle = [fila('TR-000007'), fila('TR-000008'), fila('TR-000009')];
    expect(await trasladar()).toBe('TR-000010');
    expect(lecturas).toBeGreaterThan(0);
  });

  it('🔴 dos traslados seguidos en el MISMO equipo no repiten, aunque la hoja aún no traiga el primero', async () => {
    ledgerDeGoogle = [fila('TR-000007')];   // Google tarda en dar el primero
    expect(await trasladar()).toBe('TR-000008');
    expect(await trasladar()).toBe('TR-000009');
  });

  it('si la relectura falla, sigue con lo que tenía y con el contador del equipo, como antes', async () => {
    ledgerDeGoogle = null;
    expect(await trasladar()).toBe('TR-000008');
    expect(await trasladar()).toBe('TR-000009');
  });

  it('el contador del equipo nunca va hacia atrás', () => {
    H._reproBumpTrSeq('TR-000020');
    H._reproBumpTrSeq('TR-000005');
    expect(almacen.getItem('larv4_mad_trseq')).toBe('TR-000020');
    H._reproBumpTrSeq('TR-000021');
    expect(almacen.getItem('larv4_mad_trseq')).toBe('TR-000021');
  });
});
