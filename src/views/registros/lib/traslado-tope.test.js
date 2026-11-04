// @vitest-environment happy-dom
/* ============================================================
   TRASLADO · EL TOPE DE 40 VIAJES YA NO BORRA LO PENDIENTE (pauta 1.6, 2026-11-03)

   El defecto: al pasar de 40, el viaje más viejo se borraba sin mirar si se había enviado. Si estaba pendiente, se perdía del equipo sin
   aviso y sin haber llegado a la hoja, contra la regla de la propia ficha: lo no enviado se conserva hasta enviarlo o borrarlo a mano.

   DECISIÓN DEL USUARIO (no re-preguntar): si todo está pendiente, se guarda igual y se avisa.
   Lo otro de este punto —un viaje entregado por la cola no anotaba que ya tiene filas— lo vigila cola-en-vuelo.test.js.

   Motor REAL. Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
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
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + "try{ H._trasUpsert=_trasUpsert; H._trasRaw=_trasRaw; H._trasSave=_trasSave; H.TRAS_MAX=TRAS_MAX; }catch(_){}"
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((m) => toasts.push(String(m)));
});

const VIAJE = (id, synced) => ({ id, ts: 1, synced, syncedAt: synced ? 1 : null, data: { fecha: '2026-10-20' } });
/* `list.unshift` deja lo más nuevo delante: el último de la lista es el más viejo. */
const lista = (n, enviado) => Array.from({ length: n }, (_, i) => VIAJE('V-' + (n - i), enviado(n - i)));
const ids = (l) => l.map((r) => r.id);
const avisó = () => toasts.some((t) => t.includes('sin enviar'));

beforeEach(() => { toasts.length = 0; });

describe('🔴 el tope de 40', () => {
  it('🔴 todo pendiente: no se pierde ninguno, se guarda el nuevo y se avisa', () => {
    const l = lista(40, () => false);
    expect(H._trasUpsert(l, 'V-nuevo', { fecha: '2026-10-21' })).toBe(true);
    expect(l.length).toBe(41);
    expect(ids(l)).toContain('V-1');
    expect(ids(l)[0]).toBe('V-nuevo');
    expect(avisó()).toBe(true);
    expect(toasts.at(-1)).toContain('41');
  });

  it('🔴 con enviados: se retira el enviado más viejo, y no el pendiente más viejo', () => {
    const l = lista(40, (n) => n === 2 || n === 5);   // V-1 es pendiente y el más viejo; V-2, el enviado más viejo
    H._trasUpsert(l, 'V-nuevo', {});
    expect(l.length).toBe(40);
    expect(ids(l), 'borró un pendiente').toContain('V-1');
    expect(ids(l), 'no retiró el enviado más viejo').not.toContain('V-2');
    expect(ids(l), 'se retiró de más').toContain('V-5');
    expect(avisó()).toBe(false);
  });

  it('🔴 sólo se retira lo justo para volver a 40', () => {
    const l = lista(40, () => true);
    H._trasUpsert(l, 'V-nuevo', {});
    expect(l.length).toBe(40);
    expect(ids(l)).not.toContain('V-1');
    expect(ids(l)).toContain('V-2');
  });

  it('🔴 si ya sobrepasa, los enviados que sobren se retiran y lo pendiente se queda', () => {
    const l = [...lista(41, () => false), VIAJE('E-1', true), VIAJE('E-2', true)];
    H._trasUpsert(l, 'V-nuevo', {});
    expect(ids(l)).not.toContain('E-1');
    expect(ids(l)).not.toContain('E-2');
    expect(l.length).toBe(42);
    expect(l.filter((r) => !r.synced).length).toBe(42);
    expect(avisó()).toBe(true);
  });

  it('por debajo del tope, nada cambia y nadie avisa', () => {
    const l = lista(39, () => true);
    H._trasUpsert(l, 'V-nuevo', {});
    expect(l.length).toBe(40);
    expect(avisó()).toBe(false);
  });

  it('🔴 corregir un viaje que ya está no retira nada, ni avisa', () => {
    const l = lista(41, () => false);
    expect(H._trasUpsert(l, 'V-1', { fecha: '2026-10-22' })).toBe(false);
    expect(l.length).toBe(41);
    expect(avisó()).toBe(false);
  });

  it('🔴 el tope sigue siendo 40', () => {
    expect(H.TRAS_MAX).toBe(40);
  });
});
