// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · LO QUE QUEDABA SIN BLOQUEAR MIENTRAS ENVÍA (punto 15 de la pauta del 2026-11-12)

   La pendiente 25 (usuario: «Bloquear mientras envía», 2026-11-09) bloqueó el panel de los siete formularios mientras ☁️ espera a la
   red. Quedaban fuera (medido en el código el 15-11): ☁️ Guardar corrección de un desove (espera hasta 90 s a que se vacíe la cola),
   ☁️ del Control Broodstock y los CUATRO envíos del reproductivo —📋 Procesar registro, ➕ Registrar todos, 🔄 Procesar
   transferencia y ✅ Registrar con la elegida—, que esperan a leer la MATRIZ. Un segundo toque mandaba lo mismo dos veces (dos
   desoves o dos traslados de la misma hembra) y lo tecleado o pegado en la espera se borraba al terminar sin haber viajado.
   AHORA cada uno envuelve su cuerpo con `_madGridBloqueada(panel, …)`: su panel queda `inert` mientras espera y se suelta al acabar.

   Motor REAL sobre el shell real; la red, la hoja y el `confirm`, simulados. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const SEIS = [
  ['madDesCorregirGuardar', 'fp-desoves', []],
  ['madBsGuardar', 'fp-broodstock', []],
  ['madReproProcess', 'fp-reproductivo', []],
  ['madReproAltaBatch', 'fp-reproductivo', []],
  ['madReproTransfer', 'fp-reproductivo', []],
  ['madReproRegistrarElegidas', 'fp-reproductivo', [1]],
];
const EXPORTAR = [...SEIS.map(([f]) => f), '_madGridBloqueada', 'MAD_LOC_PRE', 'renderMadReproductivo', '_lastSyncFingerprint'];
const H = {};
const toasts = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  window.confirm = () => true;
  globalThis.confirm = window.confirm;
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setGasAlDia=function(f){_madIngGasAlDia=f;}; }catch(_){}'
    + '\ntry{ H.setMatriz=function(f){_reproEnsureMatrix=f;}; }catch(_){}'
    + '\ntry{ H.setBloqueo=function(f){_madGridBloqueada=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.MAD_MOD=MAD_MOD; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba/exec');
});

beforeEach(() => {
  H.setBloqueo(H._madGridBloqueada);   // el de verdad: H lo copió antes de cualquier sustitución
  globalThis.localStorage.clear();
  H._lastSyncFingerprint.clear();
  toasts.length = 0;
});

/** Una espera que no termina hasta que la prueba la suelta. */
const colgada = () => { const c = {}; c.promesa = new Promise((ok) => { c.soltar = ok; }); return c; };
const hasta = async (cond) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((ok) => setTimeout(ok, 5)); return cond(); };

describe('las seis envuelven su envío en el bloqueo de SU panel, con TODO su cuerpo dentro', () => {
  it.each(SEIS)('🔴 %s → %s', async (fn, panel, args) => {
    const pedidos = [];
    H.setBloqueo((p) => { pedidos.push(p); return Promise.resolve(); });   // anota y NO ejecuta el cuerpo
    await H[fn](...args);
    expect(pedidos, 'no se bloqueó su panel').toEqual([panel]);
    expect(toasts, 'parte del cuerpo corrió fuera del bloqueo').toEqual([]);
  });
});

describe('con la red colgada de verdad', () => {
  it('🔴 Broodstock: bloqueado mientras espera al GAS, y suelto al acabar', async () => {
    localStorage.setItem(H.MAD_LOC_PRE + 'broodstock', JSON.stringify([{ id: 'g1', ts: Date.now(), huella: 'h1', fecha: '2026-11-10', filas: 1,
      payload: { sheetName: 'Control Broodstock', headers: ['a'], rows: [['1']] } }]));
    const gas = colgada();
    let preguntado = false;
    H.setGasAlDia(() => { preguntado = true; return gas.promesa; });
    const fp = document.getElementById('fp-broodstock');
    const envio = H.madBsGuardar();
    expect(await hasta(() => preguntado), 'no llegó a esperar al GAS').toBe(true);
    expect(fp.inert, 'se puede tocar el panel mientras espera').toBe(true);
    gas.soltar(false);                                   // el GAS no está al día: no se sube nada
    await envio;
    expect(fp.inert).toBe(false);
  });

  it('🔴 reproductivo: bloqueado mientras lee la MATRIZ, y lo pegado sigue ahí si no se registró', async () => {
    H.setMod(H.MAD_MOD, 'reproductivo');
    H.renderMadReproductivo();
    const codigos = document.getElementById('repro-codes');
    codigos.value = '0A1B2C3D4E\n0A1B2C3D4F';
    const matriz = colgada();
    let leyendo = false;
    H.setMatriz(() => { leyendo = true; return matriz.promesa; });
    const fp = document.getElementById('fp-reproductivo');
    const envio = H.madReproProcess();
    expect(await hasta(() => leyendo), 'no llegó a leer la MATRIZ').toBe(true);
    expect(fp.inert, 'se puede pegar o volver a pulsar mientras espera').toBe(true);
    matriz.soltar(null);                                 // no se pudo leer: no se registra nada
    await envio;
    expect(fp.inert).toBe(false);
    expect(codigos.value, 'lo pegado se borró sin registrarse').toBe('0A1B2C3D4E\n0A1B2C3D4F');
  });
});
