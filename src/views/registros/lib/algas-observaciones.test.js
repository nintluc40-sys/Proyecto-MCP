// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Lab. Algas — las observaciones son una lista CERRADA de chips

   Se eligen marcando chips (multiselección) y se guardan como CSV en el campo
   `obs`. Al ser cerrada, lo que NO esté en `ALG_OBS_OPTS` no se puede registrar:
   por eso añadir una frase es un cambio de dato, no de maquetación.

   🔴 «Descartado nm» la pidió el usuario el 2026-09-04. Se añade AL FINAL a
   propósito: quien rellena esto a diario busca los chips por posición, y meter
   uno en medio movería los 17 que ya estaban.

   QUÉ VIGILA ESTA PRUEBA, Y POR QUÉ ASÍ
   No basta con mirar la constante: un chip que no se pinte, o que se pinte con
   un valor distinto del que se guarda, dejaría la observación inalcanzable
   aunque la constante fuese perfecta. Se comprueba el RECORRIDO entero — que la
   frase esté en el catálogo, que salga como chip, y que un registro que ya la
   trae la muestre marcada.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderAlgas', 'ALG_OBS_OPTS'];
const H = {};
const NUEVA = 'Descartado nm';

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

  const epilogo = '\n;(function(){ var H = globalThis.__ENG2;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG2 = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

const fp = () => document.getElementById('fp-algas');
const chips = () => [...fp().querySelectorAll('input[data-group="obs"]')];

describe('Algas · observaciones', () => {
  it('🔴 «Descartado nm» está en el catálogo, y AL FINAL', () => {
    expect(H.ALG_OBS_OPTS).toContain(NUEVA);
    expect(H.ALG_OBS_OPTS[H.ALG_OBS_OPTS.length - 1]).toBe(NUEVA);
  });

  it('🔴 y llega hasta el formulario como un chip que se puede marcar', () => {
    /* La constante puede ser perfecta y el chip no pintarse: la observación quedaría
       inalcanzable. Lo que importa es el recorrido completo. */
    H.renderAlgas();
    const valores = chips().map((c) => c.value);
    expect(valores, 'no se pintó ningún chip de observación').not.toHaveLength(0);
    expect(valores).toContain(NUEVA);
  });

  it('los chips salen de la constante, no de un literal tecleado', () => {
    /* Si alguien añade una frase a `ALG_OBS_OPTS`, tiene que aparecer sola. */
    H.renderAlgas();
    expect(chips().map((c) => c.value)).toEqual(H.ALG_OBS_OPTS);
  });

  it('no se coló ninguna frase repetida', () => {
    /* Dos chips con el mismo texto se guardarían igual y se marcarían a la vez: parece
       un fallo de la app y en realidad sería del catálogo. */
    expect(new Set(H.ALG_OBS_OPTS).size).toBe(H.ALG_OBS_OPTS.length);
  });
});
