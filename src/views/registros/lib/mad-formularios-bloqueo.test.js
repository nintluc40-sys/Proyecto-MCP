// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · LOS SIETE FORMULARIOS SE BLOQUEAN MIENTRAS ☁️ ENVÍA (pendiente 25, 2026-11-09)

   LO QUE PASABA: Ingreso, Movimientos, Desoves, Fin de Ciclo, Tratamientos, Inf. Supervisor y Alimentación se vacían al
   TERMINAR el envío, y el envío espera: hasta 15 s leyendo la hoja y hasta 45 s vaciando la cola. Lo tecleado en esa espera
   se borraba sin haber viajado, y la copia de ✏️ Editar, que se toma de la pantalla, lo daba por enviado. Las grillas de
   Salas y Tanques ya se bloqueaban desde el 04-11 («Bloquear la grilla»); los formularios, no.

   AHORA (usuario: «Bloquear mientras envía»): cada madXGuardar envuelve su cuerpo con `_madGridBloqueada(panel, …)`, el
   mismo bloqueo de las grillas: mientras envía, su panel queda `inert` (no se teclea ni se pulsa nada), y al terminar
   —llegue, quede en la cola o la rechacen— se suelta.

   Motor REAL sobre el shell real; la red, la hoja y el `confirm`, simulados. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const FORMULARIOS = [
  ['madIngGuardar', 'fp-ingreso'], ['madMovGuardar', 'fp-movimientos'], ['madDesGuardar', 'fp-desoves'],
  ['madFinGuardar', 'fp-fin'], ['madTratGuardar', 'fp-tratamientos'], ['madMortGuardar', 'fp-mortdes'],
  ['madAlimGuardar', 'fp-alimentacion'],
];
const EXPORTAR = [...FORMULARIOS.map(([f]) => f), 'madMovReiniciar', 'madMovSalaChange', '_madGridBloqueada', '_lastSyncFingerprint'];
const H = {};
const hojaEnviada = [];
const toasts = [];
const _setTimeout = globalThis.setTimeout;
afterAll(() => { globalThis.setTimeout = _setTimeout; });

beforeAll(async () => {
  /* Sin señal, el motor reintenta a los 1,2 s y vacía la cola a los 8 s: aquí, sin esperar. */
  globalThis.setTimeout = (f, ms, ...r) => (ms === 8000 ? 0 : _setTimeout(f, ms === 1200 ? 0 : ms, ...r));
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
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setVerify=function(f){_verifyReqId=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setHoja=function(f){_madHojaFresca=f;}; }catch(_){}'
    + '\ntry{ H.setGasAlDia=function(f){_madIngGasAlDia=f;}; }catch(_){}'
    + '\ntry{ H.setBloqueo=function(f){_madGridBloqueada=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m,t){curMod=m;curTab=t;}; H.MAD_MOD=MAD_MOD; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
  H.setRate(() => true);
  H.setVerify(async () => false);
  H.setGasAlDia(async () => true);
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA_prueba_prueba_prueba_prueba/exec');
  H.setHoja(async () => null);
});

beforeEach(() => {
  H.setBloqueo(H._madGridBloqueada);   // el de verdad: H lo copió antes de cualquier sustitución
  globalThis.localStorage.clear();
  H._lastSyncFingerprint.clear();
  hojaEnviada.length = 0;
  toasts.length = 0;
  H.setMod(H.MAD_MOD, 'movimientos');
  H.madMovReiniciar();
});

/* ── 1 · Las siete, con SU panel, y con TODO su cuerpo dentro ── */
describe('los siete formularios envuelven su envío en el bloqueo de su panel', () => {
  it.each(FORMULARIOS)('🔴 %s → %s, y nada de su cuerpo corre fuera del bloqueo', async (fn, panel) => {
    const pedidos = [];
    H.setBloqueo((p) => { pedidos.push(p); return Promise.resolve(); });   // registra y NO ejecuta el cuerpo
    await H[fn]();
    expect(pedidos).toEqual([panel]);
    expect(toasts).toEqual([]);                                            // ni un aviso: todo el cuerpo estaba dentro
  });
});

/* ── 2 · Con un envío de verdad y la red colgada ─────────────── */
const q = (s) => document.querySelector('#fp-movimientos ' + s);
const panel = () => document.getElementById('fp-movimientos');
const llenar = (machos, hembras) => {
  q('#mv-fecha').value = '2026-02-10';
  q('#mv-tipo').value = 'Transferencia';
  const motivo = q('#mv-motivo');
  motivo.value = [...motivo.options].map((o) => o.value).filter(Boolean)[0];
  q('.mv-so').value = 'Sala 1';
  H.madMovSalaChange(q('.mv-so'));
  q('.mv-to').value = '3';
  q('.mv-sd').value = 'Sala 2';
  H.madMovSalaChange(q('.mv-sd'));
  q('.mv-td').value = '16';
  q('.mv-machos').value = String(machos);
  q('.mv-hembras').value = String(hembras);
};
/* Una red que no contesta hasta que la prueba la suelta. */
function redColgada() {
  const r = { soltar: null, pedida: false };
  H.setPostOnce((body) => new Promise((ok) => { r.pedida = true; r.soltar = (v) => { if (v === 'ok') hojaEnviada.push(body); ok(v); }; }));
  return r;
}
const hasta = async (cond) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((ok) => _setTimeout(ok, 5)); return cond(); };

describe('Movimientos · mientras ☁️ espera a la hoja, el formulario está bloqueado', () => {
  it('🔴 bloqueado durante la espera; al llegar, se suelta y se vacía como siempre', async () => {
    llenar(12, 34);
    const red = redColgada();
    const envio = H.madMovGuardar();
    expect(await hasta(() => red.pedida)).toBe(true);
    expect(panel().inert).toBe(true);                       // no se puede teclear mientras viaja
    red.soltar('ok');
    await envio;
    expect(panel().inert).toBe(false);
    expect(hojaEnviada).toHaveLength(1);
    expect(q('.mv-machos').value).toBe('');                 // se vació tras llegar, como antes
  });

  it('🔴 si la hoja lo rechaza, también se suelta, y lo tecleado sigue en pantalla', async () => {
    llenar(12, 34);
    const red = redColgada();
    const envio = H.madMovGuardar();
    expect(await hasta(() => red.pedida)).toBe(true);
    expect(panel().inert).toBe(true);
    red.soltar('rejected');
    await envio;
    expect(panel().inert).toBe(false);
    expect(q('.mv-machos').value).toBe('12');
  });

  it('sin nada que enviar, no se queda bloqueado', async () => {
    await H.madMovGuardar();
    expect(panel().inert).toBe(false);
  });
});
