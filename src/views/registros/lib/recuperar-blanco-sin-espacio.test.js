// @vitest-environment happy-dom
/* ============================================================
   📝 BLANCO Y ↩ RECUPERAR, SIN ESPACIO (punto 13 de la pauta del 2026-11-12)

   Lo que pasaba (medido en el código el 13-11):
   · 📝 Blanco armaba su envío GUARDANDO la corrección encima de la ficha de HOY y restaurándola después. Sin espacio, ese guardado
     fallaba y viajaba la ficha de hoy como si fuera la corrección (y se decía «✅ actualizado»); y si lo que no cabía era la
     restauración, la ficha de hoy se quedaba con los datos de la corrección. Ahora el envío se arma con lo de pantalla, sin
     escribir nada.
   · ↩ Recuperar (Larvicultura, Biomol y Microbiología) no miraba si guardaba: borraba la copia del autoguardado y decía
     «✅ recuperado»; lo tecleado se perdía. Decisión del usuario: «Como en Maduración» — sin espacio no se toca nada, la copia se
     queda y se dice qué hacer (el aviso de recoverMadGrid, del 05-11).

   El almacén es de este archivo y tiene CUPO, como el del navegador: una clave BLOQUEADA no puede crecer ni nacer (lo que se
   acorta siempre cabe). Sin cupo, «no se pudo guardar» no se puede provocar.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['today', 'skey', 'saveE', 'loadE', 'renderFicha', 'renderBlanco', 'collectBlanco', 'syncBlanco', 'buildDatosPayload',
  'buildControlPayload', 'PTIMES', 'saveRecovery', 'loadRecovery', 'recoverFicha',
  'BIO_MOD', 'BIO_REC_KEY', 'BIO_RECOV_KEY', 'renderBiomol', 'recoverBioGrid', '_bioRaw', 'bioSidActivo',
  'MIC_MOD', 'MIC_DRAFT_KEY', 'MIC_RECOV_KEY', 'loadMicDraft', 'recoverMicGrid', '_gasVersionLocal', '_lastSyncFingerprint'];
const H = {};
const avisos = [];
const envios = [];

const almacen = (() => {
  const m = new Map();
  let bloqueadas = new Set();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (bloqueadas.has(k) && (!m.has(k) || s.length > m.get(k).length)) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, s);
    },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); bloqueadas = new Set(); },
    /** Esta clave no puede crecer (ni nacer): lo que se acorta siempre cabe, como en el navegador. */
    bloquear: (k) => { bloqueadas.add(k); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')),
    renderCalidadFicha: (await import('../fichas/calidad.render.js')).renderCalidadFicha,
    resolveCalidadData: (await import('../fichas/calidad.data.js')).resolveCalidadData };
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
    + '\ntry{ H.setBlanco=function(b){ _blancoState=b; }; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
  };
});

beforeEach(() => {
  almacen.clear();
  avisos.length = 0;
  envios.length = 0;
  H._lastSyncFingerprint.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
});
afterEach(() => { vi.useRealTimers(); });

const aviso = (re) => avisos.some((a) => re.test(a));
const SIN_ESPACIO = /No hay espacio en este equipo para recuperar el autoguardado: no se ha recuperado nada, y la copia se conserva/;
const filas = () => envios.flatMap((b) => b.rows);

describe('📝 Blanco · el envío es la CORRECCIÓN y la ficha de HOY no se toca', () => {
  const CORR = { fecha: '2026-11-01', corrida: '601', tec: 'Prueba', mo_0: '5' };
  const HOY = () => ({ fecha: H.today(), corrida: '602', tec: 'Hoy', mo_0: '9', obs: 'la ficha de hoy, con una observación larga que no cabe dos veces' });
  const abrir = (ficha, data) => { H.setVista(1, 'blanco'); H.setBlanco({ ficha, histId: 'h1', data }); H.renderBlanco(); };

  it('🔴 sin espacio y sin ficha de hoy: sale la corrección (antes: «no hay filas» y nada)', async () => {
    almacen.bloquear(H.skey(1, 'calidad'));
    abrir('calidad', CORR);
    await H.syncBlanco();
    expect(filas().length, 'no salió nada').toBeGreaterThan(0);
    expect(filas().every((r) => r[0] === '2026-11-01'), JSON.stringify(filas()[0])).toBe(true);
  });

  it('🔴 sin espacio con la ficha de hoy guardada: sale la corrección, no la ficha de hoy', async () => {
    H.saveE(1, 'calidad', { ...HOY(), obs: '' });   // más corta que la corrección: escribir la corrección encima no cabe
    almacen.bloquear(H.skey(1, 'calidad'));
    abrir('calidad', { ...CORR, obs: 'una corrección con observación, más larga que la ficha de hoy' });
    await H.syncBlanco();
    expect(filas().length).toBeGreaterThan(0);
    expect(filas().every((r) => r[0] === '2026-11-01'), 'viajó la ficha de HOY: ' + JSON.stringify(filas()[0])).toBe(true);
    expect(filas().some((r) => r.includes('602')), 'la corrida de la ficha de hoy').toBe(false);
  });

  it('🔴 la ficha de HOY queda como estaba aunque restaurarla no quepa (antes se quedaba con la corrección)', async () => {
    H.saveE(1, 'calidad', HOY());
    const antes = almacen.getItem(H.skey(1, 'calidad'));
    almacen.bloquear(H.skey(1, 'calidad'));   // la corrección (más corta) cabría; volver a poner la de hoy, no
    abrir('calidad', CORR);
    await H.syncBlanco();
    expect(almacen.getItem(H.skey(1, 'calidad')), 'la ficha de hoy cambió').toBe(antes);
    expect(filas().every((r) => r[0] === '2026-11-01')).toBe(true);
  });

  it('con espacio, el envío es el MISMO que armándolo desde lo guardado (como antes)', async () => {
    abrir('calidad', CORR);
    const data = H.collectBlanco();
    H.saveE(1, 'calidad', data);
    const esperado = H.buildDatosPayload(1, ['calidad']);
    almacen.clear();
    H.saveE(1, 'calidad', HOY());
    const hoy = almacen.getItem(H.skey(1, 'calidad'));
    abrir('calidad', CORR);
    await H.syncBlanco();
    const datos = envios.filter((b) => b.sheetName === esperado.sheetName);
    expect(datos).toHaveLength(1);
    expect(datos[0].headers).toEqual(esperado.headers);
    expect(datos[0].rows).toEqual(esperado.rows);
    expect(almacen.getItem(H.skey(1, 'calidad')), 'y la ficha de hoy, intacta').toBe(hoy);
    expect(aviso(/Registro actualizado/)).toBe(true);
  });

  it('🔴 Parámetros (Control_Tanque): sin espacio sale la corrección con SU fecha', async () => {
    const t = H.PTIMES[0];
    H.saveE(1, 'params', { fecha: H.today(), corrida: '602', ['od_0_' + t]: '6.1' });
    almacen.bloquear(H.skey(1, 'params'));
    abrir('params', { fecha: '2026-11-01', corrida: '601', ['od_0_' + t]: '5.5', obs: 'una corrección más larga que la ficha de hoy' });
    await H.syncBlanco();
    const ctl = envios.filter((b) => /^Control_Tanque/.test(b.sheetName)).flatMap((b) => b.rows);
    expect(ctl.length, 'no salió nada a Control_Tanque').toBeGreaterThan(0);
    expect(ctl.every((r) => r[0] === '2026-11-01' && r[2] === '601'), JSON.stringify(ctl[0])).toBe(true);
    expect(ctl.some((r) => r[5] === 5.5)).toBe(true);
  });
});

describe('↩ Recuperar · Larvicultura: sin espacio no se toca nada (como en Maduración)', () => {
  const COPIA = { fecha: '2026-11-13', corrida: '601', tec: 'Prueba', mo_0: '7', obs: 'lo tecleado antes de cerrar' };
  beforeEach(() => { H.setVista(1, 'calidad'); H.renderFicha('calidad'); });

  it('🔴 la copia se queda, la ficha no cambia y lo dice (antes: copia borrada y «✅ Datos recuperados»)', () => {
    H.saveRecovery(1, 'calidad', COPIA);
    almacen.bloquear(H.skey(1, 'calidad'));
    H.recoverFicha('calidad');
    expect(H.loadRecovery(1, 'calidad'), 'se borró la copia').not.toBeNull();
    expect(H.loadRecovery(1, 'calidad').data.obs).toBe(COPIA.obs);
    expect(H.loadE(1, 'calidad')).toBeNull();
    expect(aviso(SIN_ESPACIO), avisos.join(' | ')).toBe(true);
    expect(aviso(/recuperados/), 'dijo «recuperados»').toBe(false);
  });

  it('con espacio, recupera y suelta la copia', () => {
    H.saveRecovery(1, 'calidad', COPIA);
    H.recoverFicha('calidad');
    expect(H.loadE(1, 'calidad').data.obs).toBe(COPIA.obs);
    expect(H.loadRecovery(1, 'calidad')).toBeNull();
    expect(aviso(/Datos recuperados/)).toBe(true);
  });
});

describe('↩ Recuperar · Biomol: sin espacio no se toca nada', () => {
  const copia = () => ({ fecha: H.today(), sid: H.bioSidActivo(H.today()), ts: Date.now(), rows: [{ fila: 0, fecha: H.today(), muestra: 'M-recuperada' }] });
  beforeEach(() => { H.setVista(H.BIO_MOD, 'biomol'); H.renderBiomol(); });

  it('🔴 la copia se queda, lo guardado no cambia y lo dice (antes: copia borrada y «✅ Muestras recuperadas»)', () => {
    almacen.setItem(H.BIO_RECOV_KEY, JSON.stringify(copia()));
    almacen.bloquear(H.BIO_REC_KEY);
    H.recoverBioGrid();
    expect(almacen.getItem(H.BIO_RECOV_KEY), 'se borró la copia').not.toBeNull();
    expect(H._bioRaw()).toEqual([]);
    expect(aviso(SIN_ESPACIO), avisos.join(' | ')).toBe(true);
    expect(aviso(/recuperadas/)).toBe(false);
    expect(aviso(/lo envía igual/), 'el aviso de la grilla no vale aquí').toBe(false);
  });

  it('con espacio, recupera y suelta la copia', () => {
    almacen.setItem(H.BIO_RECOV_KEY, JSON.stringify(copia()));
    H.recoverBioGrid();
    expect(H._bioRaw().map((r) => r.data.muestra)).toEqual(['M-recuperada']);
    expect(almacen.getItem(H.BIO_RECOV_KEY)).toBeNull();
    expect(aviso(/Muestras recuperadas/)).toBe(true);
  });
});

describe('↩ Recuperar · Microbiología: sin espacio no se toca nada', () => {
  const copia = () => ({ ts: Date.now(), draft: { meta: { fechaMuestreo: H.today(), corrida: '601', responsable: 'Prueba', encabezado: 'lo tecleado antes de cerrar' }, sections: {}, activeFmt: 'larv-muestra' } });
  beforeEach(() => { H.setVista(H.MIC_MOD, 'micnuevo'); });

  it('🔴 la copia se queda, el borrador no cambia y lo dice (antes: copia borrada y «✅ Análisis recuperado»)', () => {
    almacen.setItem(H.MIC_DRAFT_KEY, JSON.stringify({ meta: {}, sections: {} }));
    const antes = almacen.getItem(H.MIC_DRAFT_KEY);
    almacen.setItem(H.MIC_RECOV_KEY, JSON.stringify(copia()));
    almacen.bloquear(H.MIC_DRAFT_KEY);
    H.recoverMicGrid();
    expect(almacen.getItem(H.MIC_RECOV_KEY), 'se borró la copia').not.toBeNull();
    expect(almacen.getItem(H.MIC_DRAFT_KEY)).toBe(antes);
    expect(aviso(SIN_ESPACIO), avisos.join(' | ')).toBe(true);
    expect(aviso(/Análisis recuperado/)).toBe(false);
  });

  it('con espacio, recupera y suelta la copia', () => {
    almacen.setItem(H.MIC_RECOV_KEY, JSON.stringify(copia()));
    H.recoverMicGrid();
    expect(H.loadMicDraft().meta.encabezado).toBe('lo tecleado antes de cerrar');
    expect(almacen.getItem(H.MIC_RECOV_KEY)).toBeNull();
    expect(aviso(/Análisis recuperado/)).toBe(true);
  });
});
