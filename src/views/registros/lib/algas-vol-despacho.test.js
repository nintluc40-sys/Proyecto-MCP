// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Lab. Algas — «Volumen de Despacho (L)» elige O escribe

   El usuario pidió (2026-08-26) que este campo sugiera los volúmenes habituales
   —700, 2500, 20000 y 25000— «como el campo de responsable/analista de
   microbiología»: una lista para escoger que NO impide teclear otro valor.

   POR QUÉ UN `datalist` Y NO UN `<select>`. Un desplegable cerrado obligaría a
   inventar una opción «Otro» y a teclear el número en otro sitio, y sobre todo
   convertiría en INVÁLIDO cualquier volumen que no esté en la lista — que es
   justo lo contrario de lo que se pidió. El Responsable de Microbiología usa
   exactamente este patrón (`<input list=…>` + `<datalist>`), y seguirlo hace que
   los dos campos se comporten igual para quien los rellena.

   QUÉ VIGILA ESTA PRUEBA, Y POR QUÉ ASÍ
   Comprobar que el `<datalist>` existe no basta: un `datalist` al que el `<input>`
   no apunta con `list=` es decorativo y no sale por ninguna parte —el campo se
   vería exactamente igual que antes—. Por eso se comprueba el ENLACE (que el
   `list` del input case con el `id` del datalist) además del contenido, y que el
   campo SIGA aceptando un valor libre.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderAlgas', 'ALG_VOL_DESPACHO_OPTS'];
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

const fp = () => document.getElementById('fp-algas');
const campo = () => fp().querySelector('[name="vol_despacho"]');

describe('Algas · el Volumen de Despacho sugiere los volúmenes habituales', () => {
  it('🔴 el campo APUNTA a un datalist que existe', () => {
    // Un datalist suelto, sin `list=` que lo enlace, no se ve: el campo quedaría
    // igual que antes y la prueba pasaría igualmente si sólo mirase el datalist.
    H.renderAlgas();
    const inp = campo();
    expect(inp, 'no se encontró el campo Volumen de Despacho').toBeTruthy();
    const idLista = inp.getAttribute('list');
    expect(idLista, 'el input no enlaza ningún datalist').toBeTruthy();
    expect(fp().querySelector(`datalist#${idLista}`),
      'el datalist al que apunta el input no existe').toBeTruthy();
  });

  it('🔴 sugiere exactamente los cuatro volúmenes que pidió el usuario', () => {
    H.renderAlgas();
    const idLista = campo().getAttribute('list');
    const valores = [...fp().querySelectorAll(`datalist#${idLista} option`)]
      .map((o) => o.getAttribute('value'));
    expect(valores).toEqual(['700', '2500', '20000', '25000']);
    // Y la lista sale de la constante, no de un literal tecleado en el HTML: si
    // alguien añade un volumen a `ALG_VOL_DESPACHO_OPTS` tiene que aparecer solo.
    expect(valores).toEqual(H.ALG_VOL_DESPACHO_OPTS.map(String));
  });

  it('🔴 sigue admitiendo un volumen que NO está en la lista', () => {
    // Es la mitad del encargo: sugerir sin cerrar. Un `<select>` habría roto esto.
    H.renderAlgas();
    const inp = campo();
    expect(inp.tagName).toBe('INPUT');
    inp.value = '13750';
    expect(inp.value).toBe('13750');
    // `type=number` se conserva: el dato ES un número y así el móvil abre el
    // teclado numérico. El datalist funciona igual sobre un campo numérico.
    expect(inp.getAttribute('type')).toBe('number');
  });
});
