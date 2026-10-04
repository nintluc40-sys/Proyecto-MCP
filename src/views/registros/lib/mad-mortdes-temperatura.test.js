// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INF. SUPERVISOR · la TEMPERATURA del tanque de desove (2026-10-04)

   Pedido del usuario: junto a «Hembras que entran» y «Hembras muertas», un campo para la temperatura del tanque de
   desove. Decisiones: columna PROPIA en la hoja («Temperatura tanque desove», la 22, detrás del ID) y sola también se
   guarda. Aquí se ejerce la ficha REAL del motor: dónde sale el campo, que llega a la fila de Desove del envío y que un
   borrador guardado ANTES del cambio lo recupera al abrirse (como Fecha N2/N5 en Desoves).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madMortReiniciar', 'madMortCollect', 'buildMadMortPayload', '_madBorrAdaptar', 'MAD_MORT_HEADERS'];
const H = {};

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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const fp = () => document.getElementById('fp-mortdes');
const card = () => fp().querySelector('.mm-card');

beforeEach(() => { H.madMortReiniciar(); });

describe('Inf. Supervisor · la temperatura del tanque de desove', () => {
  it('el campo sale UNA vez por lote y sólo en «Tanques de desove», detrás del % de mortalidad', () => {
    expect(card().querySelectorAll('.mm-desove-t')).toHaveLength(1);
    expect(card().querySelector('.mm-recuperacion-t')).toBeNull();
    const pct = card().querySelector('.mm-desove-p').parentElement;
    expect(pct.nextElementSibling.querySelector('.mm-desove-t')).not.toBeNull();
  });

  it('🔴 lo tecleado llega a la fila de Desove, en «Temperatura tanque desove», también SIN cifras de hembras', () => {
    document.getElementById('mm-fecha').value = '2026-10-04';
    card().querySelector('.mm-lote').value = 'BQ';
    card().querySelector('.mm-cg').value = 'OLF5.F2';
    card().querySelector('.mm-desove-t').value = '28.5';
    expect(H.madMortCollect().lotes[0].desove.temperatura).toBe('28.5');
    const p = H.buildMadMortPayload(H.madMortCollect());
    const T = H.MAD_MORT_HEADERS.indexOf('Temperatura tanque desove');
    expect(T).toBe(21);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0][H.MAD_MORT_HEADERS.indexOf('Tipo de tanque')]).toBe('Desove');
    expect(p.rows[0][T]).toBe(28.5);
  });

  it('un borrador guardado ANTES del cambio (sin el campo) lo recupera al abrirse, y sólo una vez', () => {
    card().querySelector('.mm-desove-t').closest('label').remove();
    expect(card().querySelector('.mm-desove-t')).toBeNull();
    H._madBorrAdaptar('mortdes', fp(), '2026-10-04');
    expect(card().querySelectorAll('.mm-desove-t')).toHaveLength(1);
    H._madBorrAdaptar('mortdes', fp(), '2026-10-04');
    expect(card().querySelectorAll('.mm-desove-t')).toHaveLength(1);
  });
});
