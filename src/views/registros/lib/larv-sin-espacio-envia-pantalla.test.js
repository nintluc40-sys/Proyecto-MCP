// @vitest-environment happy-dom
/* ============================================================
   LARVICULTURA · SIN ESPACIO, ☁️ ENVÍA LO DE PANTALLA (pauta A6, cerrada el 2026-11-09)

   LO QUE PASABA: con el equipo lleno, ☁️ de una ficha de Larvicultura seguía adelante aunque no pudiera guardar
   (`localSync`), pero `syncOneFicha` armaba el envío con lo GUARDADO (`loadE`): la copia vieja, o ninguna («no tiene
   valores por tanque»). Y la marca de enviada se la llevaba esa copia vieja. Lo tecleado no llegaba a la hoja y se
   perdía al recargar, sin aviso, aunque el README ya decía «envían lo que hay en pantalla» (decisión del 04-11).

   AHORA (usuario: «Como en Tanques»): viaja lo de PANTALLA, sin marca. Si llega a la hoja o queda en la cola, se quita
   la copia de HOY de esa ficha —vieja—, para que un 🔄 posterior no escriba lo viejo encima, y se avisa; si no llega,
   la copia se queda como estaba. Sin `sinCopia`, el camino de siempre no cambia.

   Motor REAL sobre el shell real; la red, simulada. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['saveE', 'loadE', 'syncOneFicha', 'localSync', '_invalidateLoadE', '_lastSyncFingerprint', '_loadSyncQueue'];
const H = {};
const envios = [];
const avisos = [];

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
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}'
    /* ☁️ entra por localSync, que lee la PANTALLA (collect) y guarda (saveE): se sustituyen las dos para simular la ficha
       tecleada y el equipo lleno. `H.saveE` sigue siendo la de verdad (se copió antes). */
    + '\ntry{ H.setCollect=function(f){collect=f;}; H.setSaveE=function(f){saveE=f;}; H.setValida=function(f){validateFicha=f;}; H.setRango=function(f){_rangeGuard=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((msg) => { avisos.push(String(msg)); });
  H.setValida(() => true);
  H.setRango(() => false);
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
});

const MOD = 1;
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const HOY = iso(new Date());
const POST_OK = async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'ok'; };
const POST_RECHAZO = async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return 'rejected'; };
const POST_SIN_RED = async () => 'retry';
const datos = () => envios.filter((e) => e.sheetName !== 'Registro_Desinfección' && !/^Control_Tanque/.test(e.sheetName));
const dx = () => envios.filter((e) => e.sheetName === 'Registro_Desinfección');
/* Calidad, tanque 1: «Deformidad» es la columna 12 de «Datos Larvicultura» (cal.df_0). Cifras inventadas. */
const DEF = 12;
const calidad = (deformidad) => ({ fecha: HOY, corrida: '901', tec: 'Prueba', df_0: deformidad });
const RES = 'dx_1_materiales_0';   // Desinfección · Tipo 1 · Materiales · «Reservorio»
const desinf = (estado) => ({ fecha: HOY, corrida: '901', [RES + '_estado']: estado });

beforeEach(() => {
  almacen.clear();
  H._invalidateLoadE();
  envios.length = 0;
  avisos.length = 0;
  H._lastSyncFingerprint.clear();
  H.setPostOnce(POST_OK);
  H.setVista(MOD, 'calidad');
  H.setSaveE(H.saveE);                                            // con espacio, salvo que la prueba diga otra cosa
  globalThis.confirm = () => true;
});

describe('Larvicultura · ☁️ (localSync) le pasa lo de pantalla al envío', () => {
  it('🔴 equipo LLENO: ☁️ envía lo tecleado y quita la copia vieja', async () => {
    H.saveE(MOD, 'calidad', calidad('3'), false);
    H.setCollect(() => calidad('7'));                               // lo que hay en pantalla
    H.setSaveE(() => false);                                        // y no cabe
    await H.localSync('calidad');
    expect(String(datos()[0].rows[0][DEF])).toBe('7');
    expect(H.loadE(MOD, 'calidad')).toBeNull();
  });

  it('con espacio, ☁️ guarda, envía lo guardado y lo deja marcado como enviado', async () => {
    H.setCollect(() => calidad('7'));
    await H.localSync('calidad');
    expect(String(datos()[0].rows[0][DEF])).toBe('7');
    const e = H.loadE(MOD, 'calidad');
    expect(e && e.synced).toBe(true);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(false);
  });
});

describe('Larvicultura · sin espacio, ☁️ envía lo de PANTALLA', () => {
  it('🔴 viaja lo de pantalla, no la copia vieja guardada', async () => {
    H.saveE(MOD, 'calidad', calidad('3'), false);                  // lo último que SÍ cupo
    await H.syncOneFicha('calidad', calidad('7'));                  // lo de pantalla, que no cupo
    expect(datos()).toHaveLength(1);
    expect(String(datos()[0].rows[0][DEF])).toBe('7');
  });

  it('🔴 sin ninguna copia guardada, lo de pantalla viaja igual (antes: «no tiene valores por tanque»)', async () => {
    await H.syncOneFicha('calidad', calidad('7'));
    expect(datos()).toHaveLength(1);
    expect(String(datos()[0].rows[0][DEF])).toBe('7');
  });

  it('🔴 si llega a la hoja, la copia vieja de HOY se quita y se avisa de que el equipo no guardó copia', async () => {
    H.saveE(MOD, 'calidad', calidad('3'), false);
    await H.syncOneFicha('calidad', calidad('7'));
    expect(H.loadE(MOD, 'calidad')).toBeNull();
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(true);
  });

  it('🔴 si queda en la cola, también se quita la copia vieja, y se dice que sólo está en la cola', async () => {
    H.setPostOnce(POST_SIN_RED);
    H.saveE(MOD, 'calidad', calidad('3'), false);
    await H.syncOneFicha('calidad', calidad('7'));
    const cola = H._loadSyncQueue();
    expect(cola).toHaveLength(1);
    expect(String(cola[0].payload.rows[0][DEF])).toBe('7');            // en la cola, lo de pantalla
    expect(H.loadE(MOD, 'calidad')).toBeNull();
    expect(avisos.some((a) => /sólo queda en la cola/.test(a))).toBe(true);
  }, 20000);

  it('🔴 si la hoja lo rechaza (ni llega ni se encola), la copia vieja se queda como estaba, pendiente', async () => {
    H.setPostOnce(POST_RECHAZO);
    H.saveE(MOD, 'calidad', calidad('3'), false);
    await H.syncOneFicha('calidad', calidad('7'));
    const e = H.loadE(MOD, 'calidad');
    expect(e && e.data.df_0).toBe('3');
    expect(e.synced).toBe(false);                                   // sin marca: la copia vieja NO se da por enviada
  });

  it('🔴 Desinfección: viaja el estado de pantalla y la copia vieja se quita', async () => {
    H.setVista(MOD, 'desinfeccion');
    H.saveE(MOD, 'desinfeccion', desinf('No'), false);
    await H.syncOneFicha('desinfeccion', desinf('Sí'));
    const r = dx()[0].rows.find((x) => x[5] === 'Reservorio');
    expect(r[6]).toBe('Sí');
    expect(H.loadE(MOD, 'desinfeccion')).toBeNull();
  });
});

describe('Larvicultura · con espacio, el camino de siempre no cambia', () => {
  it('sin datos de pantalla aparte, viaja lo guardado y queda marcado como enviado', async () => {
    H.saveE(MOD, 'calidad', calidad('3'), false);
    await H.syncOneFicha('calidad');
    expect(String(datos()[0].rows[0][DEF])).toBe('3');
    expect(H.loadE(MOD, 'calidad').synced).toBe(true);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(false);
  });
});
