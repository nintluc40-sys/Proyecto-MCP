// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · INGRESO · «🖨 PDF» (2026-10-04)

   Pedido del usuario: junto a Vaciar, Guardar y sincronizar y los demás, un botón que haga un PDF. Decisiones del
   usuario: imprime LO QUE HAY EN PANTALLA —las mismas filas que se enviarían, una por sala·tanque, con sus totales— y,
   como ☁️, SÓLO SI VALIDA: con errores los pinta en el informe y no abre nada.
   Aquí se ejerce la ficha REAL del motor (mismo arnés que mad-ingreso-guia.test.js), con window.open simulado.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madIngReiniciar', '_madIngRepHTML', 'madIngPdf'];
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
  // La ventana del PDF: se guarda lo que el motor escribe en ella.
  window.open = () => { const v = { html: '', document: { write: (s) => { v.html += s; }, close() {} } }; abiertas.push(v); return v; };
});

const q = (s) => document.querySelector('#fp-ingreso ' + s);
const filaTanque = (sala, tanque) => {
  const t = document.createElement('table');
  t.innerHTML = '<tbody>' + H._madIngRepHTML(sala, tanque) + '</tbody>';
  return t.querySelector('tr');
};
const conDosTanques = ({ lote = 'BQ' } = {}) => {
  document.getElementById('mi-fecha').value = '2026-10-02';
  document.getElementById('mi-lote').value = lote;
  document.getElementById('mi-guia').value = '001-0042';
  q('.mi-cg').value = 'OLF5.F2';
  for (const [t, ma, he] of [[1, 10, 12], [2, 7, 9]]) {
    const tr = filaTanque('Sala 4', t);
    q('.mi-reps').appendChild(tr);
    tr.querySelector('.mi-machos').value = String(ma);
    tr.querySelector('.mi-hembras').value = String(he);
  }
};

beforeEach(() => { H.madIngReiniciar(); abiertas = []; });

describe('Ingreso · «🖨 PDF»', () => {
  it('el botón está en la botonera, justo detrás de 🧹 Vaciar', () => {
    const btns = [...document.querySelectorAll('#fp-ingreso button')];
    const i = btns.findIndex((b) => b.getAttribute('onclick') === 'madIngVaciar()');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(btns[i + 1].getAttribute('onclick')).toBe('madIngPdf()');
    expect(btns[i + 1].textContent).toContain('PDF');
  });

  it('con lo tecleado válido abre el PDF: cabecera, una fila por tanque y los totales', () => {
    conDosTanques();
    H.madIngPdf();
    expect(abiertas).toHaveLength(1);
    const doc = new DOMParser().parseFromString(abiertas[0].html, 'text/html');
    expect(doc.querySelector('h1').textContent).toBe('Maduración · Ingreso · Lote BQ · 2026-10-02');
    expect(doc.querySelector('.cab').textContent).toContain('001-0042');          // la guía, en la cabecera
    const cab = [...doc.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(cab).toContain('Código genético');
    expect(cab).not.toContain('ID');                                              // la llave no se imprime
    expect(cab).not.toContain('Lote');                                            // va en la cabecera
    const filas = [...doc.querySelectorAll('tbody tr')];
    expect(filas).toHaveLength(3);                                                // 2 tanques + total
    const iM = cab.indexOf('Machos'), iH = cab.indexOf('Hembras');
    expect(filas[0].children[cab.indexOf('Tanque')].textContent).toBe('1');
    expect(filas[2].children[iM].textContent).toBe('17');
    expect(filas[2].children[iH].textContent).toBe('21');
    expect(filas[2].children[0].textContent).toBe('Total · 2 tanques');
  });

  it('🔴 con errores NO abre nada y los pinta en el informe (como ☁️)', () => {
    conDosTanques({ lote: '' });
    H.madIngPdf();
    expect(abiertas).toHaveLength(0);
    expect(document.getElementById('mi-report').textContent).toContain('No se puede guardar');
  });

  it('sin ningún tanque con ubicación no abre nada', () => {
    document.getElementById('mi-fecha').value = '2026-10-02';
    document.getElementById('mi-lote').value = 'BQ';
    H.madIngPdf();
    expect(abiertas).toHaveLength(0);
  });
});
