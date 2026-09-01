// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Despacho — el Destino admite VARIOS valores, de punta a punta

   Esta prueba no mira una mitad: recorre la cadena entera, que es donde el defecto
   vivía. El marcado lo pinta el renderizador modular (`despacho.render.js`), el clic
   viaja por la delegación de eventos (`ficha-events.js`) y quien mantiene el valor
   que se GUARDA es `destMsSync`, que vive en el monolito — y aquí se usa el REAL,
   extraído de `public/registros/engine.js`, no un doble.

   🔴 EL DEFECTO QUE CIERRA
   Hasta el 2026-08-30 esta celda era un `<select>` simple. La columna Destino de
   producción tiene 12 filas con dos destinos separados por coma; al abrir una de
   ellas ninguna opción casaba con el valor guardado, la celda mostraba
   «— Selecciona —» y guardar dejaba el Destino VACÍO. El dato se perdía por el simple
   hecho de abrir la ficha, sin un aviso.
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, Script } from 'node:vm';
import { renderDespachoFicha } from './despacho.render.js';
import { attachFichaEvents } from './ficha-events.js';

/* ⚠ La ruta va por `process.cwd()` y NO por `import.meta.url`: bajo happy-dom el
   documento tiene URL http, así que `new URL(rel, import.meta.url)` deja de ser una
   ruta de fichero y `readFileSync` falla con «The URL must be of scheme file». Mismo
   criterio que `traslado-captura.test.js`, que arranca el monolito entero. */
const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** El destMsSync REAL del motor, en una caja. Un doble no probaría el contrato. */
function destMsSyncReal() {
  const i = src.indexOf('function destMsSync(cb){');
  if (i < 0) throw new Error('no se halló destMsSync en engine.js');
  const j = src.indexOf('\n}\n', i);
  const ctx = { Array, String };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(src.slice(i, j + 2) + '\n;globalThis.__f = destMsSync;').runInContext(ctx);
  return ctx.__f;
}

const DESTINOS = ['Pto.Inca 4', 'Chongón', 'Puná 1'];
const engine = { destMsSync: destMsSyncReal() };

function montar(data) {
  const root = document.createElement('div');
  root.innerHTML = renderDespachoFicha({ modLabel: 'M01', destinos: DESTINOS, data });
  document.body.appendChild(root);
  attachFichaEvents(root, engine);
  return root;
}
const marcar = (cb, on) => {
  cb.checked = on;
  cb.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const oculto = (root) => root.querySelector('input[type="hidden"][name="de_0"]');
const resumen = (root) => root.querySelector('summary.dest-ms-sum');
const casilla = (root, valor) => root.querySelector(`input[data-dest-ms][value="${valor}"]`);

beforeEach(() => { document.body.innerHTML = ''; });

describe('Despacho · Destino multi-selección', () => {
  it('sin nada elegido, el valor guardado va vacío y el resumen lo dice', () => {
    const root = montar({});
    expect(oculto(root).value).toBe('');
    expect(resumen(root).textContent).toBe('— Selecciona —');
    expect(resumen(root).getAttribute('data-empty')).toBe('1');
  });

  it('marcar un destino lo escribe en el valor que se guarda', () => {
    const root = montar({});
    marcar(casilla(root, 'Chongón'), true);
    expect(oculto(root).value).toBe('Chongón');
    expect(resumen(root).textContent).toBe('Chongón');
    expect(resumen(root).hasAttribute('data-empty')).toBe(false);
  });

  it('🔴 marcar DOS destinos guarda los dos, separados por coma', () => {
    const root = montar({});
    marcar(casilla(root, 'Pto.Inca 4'), true);
    marcar(casilla(root, 'Chongón'), true);
    expect(oculto(root).value).toBe('Pto.Inca 4, Chongón');
    expect(resumen(root).textContent).toBe('Pto.Inca 4, Chongón');
  });

  it('desmarcar quita sólo ese, y deja el resto intacto', () => {
    const root = montar({ de_0: 'Pto.Inca 4, Chongón' });
    marcar(casilla(root, 'Pto.Inca 4'), false);
    expect(oculto(root).value).toBe('Chongón');
  });

  it('🔴 una fila REAL de producción se abre entera y no se pierde al tocarla', () => {
    // «Pto.Inca 4, Chongón» es un valor literal de la hoja de producción.
    const root = montar({ de_0: 'Pto.Inca 4, Chongón' });
    expect(oculto(root).value).toBe('Pto.Inca 4, Chongón');
    expect(casilla(root, 'Pto.Inca 4').checked).toBe(true);
    expect(casilla(root, 'Chongón').checked).toBe(true);
    expect(casilla(root, 'Puná 1').checked).toBe(false);
    // Y tocar OTRO campo de la fila no se lleva por delante el destino.
    marcar(casilla(root, 'Puná 1'), true);
    expect(oculto(root).value).toBe('Pto.Inca 4, Chongón, Puná 1');
  });

  it('el orden del valor guardado es el de las opciones, no el de los clics', () => {
    // Así dos técnicos que elijan lo mismo en distinto orden escriben lo mismo en la
    // hoja, y la celda no cambia por un detalle de interacción.
    const root = montar({});
    marcar(casilla(root, 'Puná 1'), true);
    marcar(casilla(root, 'Pto.Inca 4'), true);
    expect(oculto(root).value).toBe('Pto.Inca 4, Puná 1');
  });

  it('quitarlos todos deja el campo vacío y el resumen vuelve a su aviso', () => {
    const root = montar({ de_0: 'Chongón' });
    marcar(casilla(root, 'Chongón'), false);
    expect(oculto(root).value).toBe('');
    expect(resumen(root).textContent).toBe('— Selecciona —');
    expect(resumen(root).getAttribute('data-empty')).toBe('1');
  });
});
