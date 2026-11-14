// @vitest-environment happy-dom
/* ============================================================
   LABORATORIO EN LOTES · BIOMOL AVISA (punto 4 de la pauta del 2026-11-12)

   Lo que pasaba (medido en el código el 14-11): Microbiología, Calidad de Agua y Patología mandaban TODO lo pendiente en un solo
   envío; con más de 300 filas (LIMITS.<hoja>.maxRows del GAS) la hoja lo rechaza ENTERO y no escribe nada: tras unos días sin
   conexión, nada llegaba nunca. Decisión del usuario: «Repartir por sesiones» — en varios envíos, sin partir NUNCA una sesión (la
   hoja reemplaza por sesión: el segundo envío borraría lo del primero), como Traslado con sus viajes. Una sesión sola de más del
   límite no se envía y se dice; si un envío falla, lo enviado queda enviado y se dice cuántas quedan.
   Biomol: un día HEREDADO va entero (la hoja reemplaza el día) y con más de 200 filas la hoja lo rechaza. Decisión del usuario:
   «Avisar antes de enviar».
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const GAS = readFileSync(join(process.cwd(), 'GAS/Code.gs'), 'utf8');
const EXPORTAR = ['LAB_MAX_FILAS', 'BIO_MAX_FILAS', '_labLotes', '_labEnviarPendiente', 'buildPatPayload', 'patSessionKey', 'PAT_REC_KEY',
  '_patRaw', 'renderPatNuevo', 'savePatLocal', 'micTypeSet', 'LAB_ANULAR_KEY', 'PAT_SHEET_HEADERS', '_lastSyncFingerprint',
  'BIO_MOD', 'BIO_REC_KEY', 'BIO_SES_KEY', 'renderBiomol', 'syncBioGrid', 'bioGridFecha', '_loadSyncQueue'];
const H = {};
const envios = [];
let respuestas = [];
const avisos = [];

const almacen = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
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
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    + '\ntry{ H.setBioSid=function(s){ _bioSid=s; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return respuestas.length ? respuestas.shift() : 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
});

beforeEach(() => {
  almacen.clear(); envios.length = 0; respuestas = []; avisos.length = 0;
  H._lastSyncFingerprint.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
});
afterEach(() => { vi.useRealTimers(); });

const aviso = (re) => avisos.some((a) => re.test(a));
const URL = 'https://script.google.com/macros/s/AKfycbPRUEBA/exec';

/* Un registro de Patología de verdad (guardado por la ficha) y, a partir de él, sesiones de `filas` muestras. */
let base = null;
const registroBase = () => {
  if (base) return base;
  H.micTypeSet('pat'); H.renderPatNuevo();
  document.getElementById('pat-fm').value = '2026-11-12';
  document.getElementById('pat-corr').value = '901';
  document.getElementById('pat-resp').value = 'Analista A';
  document.querySelector('[name="pat_1_muestra"]').value = 'Camarón';
  expect(H.savePatLocal()).toBe(1);
  base = JSON.parse(JSON.stringify(H._patRaw()[0]));
  return base;
};
const sesiones = (...filas) => {
  const b = registroBase();
  const lista = [];
  filas.forEach((n, s) => { for (let i = 0; i < n; i++) lista.push({ ...b, id: 'S' + s + '-' + i, synced: false, data: { ...b.data, sid: 'SID' + s, muestra: 'M' + s + '-' + i } }); });
  almacen.setItem(H.PAT_REC_KEY, JSON.stringify(lista));
  return lista;
};
const enviar = (lista) => H._labEnviarPendiente({ tipo: 'pat', nombre: 'Patología en Fresco', toSend: lista, clave: H.patSessionKey,
  construir: H.buildPatPayload, url: URL, ind: 'pat-saved-ind' });
const sidDe = (env) => { const j = H.PAT_SHEET_HEADERS.indexOf('Sesión'); return [...new Set(env.rows.map((r) => r[j]))]; };

describe('los límites son los del GAS (si uno cambia sin el otro, rojo aquí y no en el laboratorio)', () => {
  it('LAB_MAX_FILAS = maxRows de micro, cal y pat · BIO_MAX_FILAS = el de biomol', () => {
    ['micro', 'cal', 'pat'].forEach((h) => {
      const m = GAS.match(new RegExp(h + ':\\s*\\{\\s*maxRows:\\s*(\\d+)'));
      expect(m, h).not.toBeNull();
      expect(H.LAB_MAX_FILAS, h).toBe(Number(m[1]));
    });
    expect(H.BIO_MAX_FILAS).toBe(Number(GAS.match(/biomol:\s*\{\s*maxRows:\s*(\d+)/)[1]));
  });
});

describe('🧪 Laboratorio · lo pendiente, en lotes de sesiones enteras', () => {
  it('🔴 400 muestras en 4 sesiones salen en 2 envíos de ≤ 300, cada sesión ENTERA en uno, y todas quedan enviadas', async () => {
    await enviar(sesiones(100, 100, 100, 100));
    expect(envios).toHaveLength(2);
    envios.forEach((e) => expect(e.rows.length).toBeLessThanOrEqual(H.LAB_MAX_FILAS));
    const vistas = envios.flatMap(sidDe);
    expect(vistas.sort(), 'una sesión partida en dos envíos').toEqual(['SID0', 'SID1', 'SID2', 'SID3']);
    envios.forEach((e) => sidDe(e).forEach((s) => expect(e.rows.filter((r) => r[H.PAT_SHEET_HEADERS.indexOf('Sesión')] === s)).toHaveLength(100)));
    expect(H._patRaw().every((r) => r.synced), 'quedaron sin marcar').toBe(true);
    expect(aviso(/400 muestra\(s\) enviadas a Patología en Fresco.*en 2 envíos/)).toBe(true);
  });

  it('con todo en uno (lo de siempre), un solo envío', async () => {
    await enviar(sesiones(10, 20));
    expect(envios).toHaveLength(1);
    expect(envios[0].rows).toHaveLength(30);
  });

  it('🔴 si el 2.º envío falla, lo del 1.º queda enviado, NO sigue con el 3.º, y se dice cuántas quedan', async () => {
    respuestas = ['ok', 'rejected', 'ok'];
    await enviar(sesiones(200, 200, 200));
    expect(envios, 'siguió tras el rechazo').toHaveLength(2);
    const enviados = H._patRaw().filter((r) => r.synced).map((r) => r.data.sid);
    expect([...new Set(enviados)]).toEqual(['SID0']);
    expect(H._patRaw().filter((r) => !r.synced)).toHaveLength(400);
    expect(aviso(/De 3 sesión\(es\) pendientes, 1 llegaron a la hoja; las demás siguen pendientes/), avisos.join(' | ')).toBe(true);
  });

  it('🔴 sin señal, cada lote queda en la cola con SU marca (y se sigue con los demás)', async () => {
    respuestas = Array(12).fill('retry');
    let fin = false;
    const p = enviar(sesiones(200, 200)).then(() => { fin = true; });
    for (let i = 0; i < 40 && !fin; i++) await vi.advanceTimersByTimeAsync(500);   // los reintentos esperan; el vaciado de la cola (8 s) no llega
    await p;
    const cola = H._loadSyncQueue();
    expect(cola, 'los dos lotes, cada uno en la cola').toHaveLength(2);
    expect(cola.map((it) => it.mark.keys.length)).toEqual([1, 1]);
    expect(H._patRaw().every((r) => !r.synced), 'en la cola no es «enviado»').toBe(true);
  });

  it('🔴 una sesión sola de más de 300 no se envía (la hoja la rechazaría), se dice, y las demás sí salen', async () => {
    await enviar(sesiones(301, 5));
    expect(envios).toHaveLength(1);
    expect(sidDe(envios[0])).toEqual(['SID1']);
    expect(aviso(/1 sesión\(es\) de Patología en Fresco con más de 300 muestras \(301\).*NO se han enviado/), avisos.join(' | ')).toBe(true);
    expect(H._patRaw().filter((r) => r.data.sid === 'SID0').every((r) => !r.synced)).toBe(true);
  });

  it('🔴 las anulaciones de A10 van con el primer envío si caben; si no, en uno propio delante', async () => {
    const anulacion = (n) => almacen.setItem(H.LAB_ANULAR_KEY, JSON.stringify({ pat: Array.from({ length: n }, (_, i) =>
      ({ data: { ...registroBase().data, sid: 'VIEJA' + i, fechaMuestreo: '2026-11-03' }, hacia: '12/11/2026 · corrida 901' })) }));
    const resp = H.PAT_SHEET_HEADERS.indexOf('Responsable');
    const anuladas = (e) => e.rows.filter((r) => String(r[resp]).startsWith('⛔ ANULADA'));
    anulacion(1);
    await enviar(sesiones(10));
    expect(envios).toHaveLength(1);
    expect(anuladas(envios[0])).toHaveLength(1);
    envios.length = 0;
    anulacion(1);
    await enviar(sesiones(300));
    expect(envios, 'no cabían: van en un envío propio').toHaveLength(2);
    expect(anuladas(envios[0]).length).toBe(envios[0].rows.length);
    expect(envios[1].rows).toHaveLength(300);
  });
});

describe('🧬 Biomol · un día heredado de más de 200 muestras no se envía y se dice (usuario: «Avisar antes de enviar»)', () => {
  const dia = (heredadas, normales) => {
    const f = H.bioGridFecha();
    almacen.setItem(H.BIO_SES_KEY, JSON.stringify({ VIEJA: { fecha: f, nombre: '', etiqueta: null, legacy: true, creado: 1 },
      NUEVA: { fecha: f, nombre: '', etiqueta: null, legacy: false, creado: 2 } }));
    const r = (sid, i) => ({ id: sid + i, ts: 5, synced: false, syncedAt: null, data: { fecha: f, sid, fila: i + 1, codigo: 'BM-' + sid + '-' + i } });
    almacen.setItem(H.BIO_REC_KEY, JSON.stringify([...Array.from({ length: heredadas }, (_, i) => r('VIEJA', i)), ...Array.from({ length: normales }, (_, i) => r('NUEVA', i))]));
    H.setVista(H.BIO_MOD, 'biomol'); H.setBioSid('NUEVA'); H.renderBiomol();
  };

  it('🔴 150 + 60 = 210 muestras de un día heredado: nada sale y se dice por qué', async () => {
    dia(150, 60);
    await H.syncBioGrid();
    expect(envios, 'la hoja lo habría rechazado entero').toHaveLength(0);
    expect(aviso(/es de antes de los análisis separados y tiene 210 muestras.*NO se ha enviado/), avisos.join(' | ')).toBe(true);
  });

  it('con 200 o menos, sale entero como siempre', async () => {
    dia(150, 40);
    await H.syncBioGrid();
    expect(envios).toHaveLength(1);
    expect(envios[0].rows).toHaveLength(190);
  });
});
