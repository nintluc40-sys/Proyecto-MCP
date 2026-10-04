// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · MOVIMIENTOS · «🖨 PDF» (2026-10-04)

   Pedido del usuario: como en Ingreso, un botón para generar un PDF de lo ingresado. Mismas reglas (decisión del
   usuario): LO QUE HAY EN PANTALLA —las mismas filas que se enviarían, una por tramo, con sus totales— y SÓLO SI VALIDA.
   Ficha REAL del motor (arnés de mad-ingreso-pdf.test.js), con window.open simulado.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madMovReiniciar', 'madMovSalaChange', '_madMovTramoHTML', 'madMovPdf'];
const H = {};
let abiertas = [];

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
  window.open = () => { const v = { html: '', document: { write: (s) => { v.html += s; }, close() {} } }; abiertas.push(v); return v; };
});

const pon = (el, v) => { el.value = v; return el; };
const tramos = () => [...document.querySelectorAll('#fp-movimientos #mv-tramos tr.mv-tramo')];
/* Un tramo MÁS, con la fila REAL del motor parseada dentro de una tabla: happy-dom no crea un <tr> suelto con
   insertAdjacentHTML (lo que hace madMovAddTramo), igual que en mad-ingreso-guia.test.js. */
const otroTramo = () => {
  const t = document.createElement('table');
  t.innerHTML = '<tbody>' + H._madMovTramoHTML() + '</tbody>';
  document.getElementById('mv-tramos').appendChild(t.querySelector('tr'));
};
const llenar = (tr, sO, tO, sD, tD, ma, he) => {
  H.madMovSalaChange(pon(tr.querySelector('.mv-so'), sO)); pon(tr.querySelector('.mv-to'), tO);
  H.madMovSalaChange(pon(tr.querySelector('.mv-sd'), sD)); pon(tr.querySelector('.mv-td'), tD);
  pon(tr.querySelector('.mv-machos'), ma); pon(tr.querySelector('.mv-hembras'), he);
};

beforeEach(() => { H.madMovReiniciar(); abiertas = []; });

describe('Movimientos · «🖨 PDF»', () => {
  it('el botón está en la botonera, justo detrás de 🧹 Vaciar', () => {
    const btns = [...document.querySelectorAll('#fp-movimientos button')];
    const i = btns.findIndex((b) => b.getAttribute('onclick') === 'madMovVaciar()');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(btns[i + 1].getAttribute('onclick')).toBe('madMovPdf()');
  });

  it('con lo tecleado válido abre el PDF: cabecera, una fila por tramo y los totales', () => {
    pon(document.getElementById('mv-fecha'), '2026-10-04');
    llenar(tramos()[0], 'Sala 1', '1', 'Sala 2', '16', '5', '6');
    otroTramo();
    llenar(tramos()[1], 'Sala 1', '2', 'Sala 2', '17', '3', '4');
    H.madMovPdf();
    expect(abiertas).toHaveLength(1);
    const doc = new DOMParser().parseFromString(abiertas[0].html, 'text/html');
    expect(doc.querySelector('h1').textContent).toMatch(/^Maduración · Movimientos · .+ · 2026-10-04$/);
    const cab = [...doc.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(cab).toEqual(['Sala origen', 'Tanque origen', 'Sala destino', 'Tanque destino', 'Machos', 'Hembras', 'Agua destino']);
    const filas = [...doc.querySelectorAll('tbody tr')];
    expect(filas).toHaveLength(3);                                                // 2 tramos + total
    expect(filas[1].children[cab.indexOf('Tanque destino')].textContent).toBe('17');
    expect(filas[2].children[cab.indexOf('Machos')].textContent).toBe('8');
    expect(filas[2].children[cab.indexOf('Hembras')].textContent).toBe('10');
    expect(filas[2].children[0].textContent).toBe('Total · 2 tramos');
  });

  it('🔴 con errores NO abre nada y los pinta en el informe (como ☁️)', () => {
    pon(document.getElementById('mv-fecha'), '2026-10-04');
    llenar(tramos()[0], 'Sala 1', '1', 'Sala 1', '1', '5', '6');                  // sale y llega al mismo sitio
    H.madMovPdf();
    expect(abiertas).toHaveLength(0);
    expect(document.getElementById('mv-report').textContent).toContain('No se puede guardar');
  });
});
