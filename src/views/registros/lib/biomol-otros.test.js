// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol — la columna «Otros» ofrece Heces, Branquias, Hisopado y Agua

   Pedido del usuario (2026-09-13): «que permita escribir y enviar al Google Sheet los
   términos Heces, Branquias, Hisopado, Agua».

   🔎 Lo MEDIDO antes de tocar nada: la celda ya era texto libre y la hoja BIOMOL ya recibía
   en «Otros» cosas como «Calamar (Funda en uso)» o «Thalassiosira Br 1 (3d)». Escribir no
   estaba bloqueado; lo que faltaba es que esos cuatro términos se OFREZCAN. Se resuelve con
   el mismo patrón que Microbiología usa para sus columnas «editables con sugerencias»: un
   `datalist` en la celda. Se elige uno o se escribe cualquier otro; nada se vuelve inválido.

   QUÉ VIGILA
   · que la celda de CADA fila esté enlazada a la lista, y que la lista traiga los cuatro;
   · que siga siendo texto libre (un select cerrado rompería los valores que ya se usan);
   · el viaje entero: cada término tecleado sale bajo la cabecera «Otros» del envío;
   · que la lista sea UNA para toda la grilla (100 filas no pueden pintar 100 datalists).
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderBiomol', '_collectBioGrid', 'buildBioPayload', 'bioGridFecha'];
const H = {};
const TERMINOS = ['Heces', 'Branquias', 'Hisopado', 'Agua'];

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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setMod(12);            // BIO_MOD
  H.setTab('biomol');
});

const celda = (fila, k) => document.querySelector(`#fp-biomol [name="bg_${fila}_${k}"]`);
const listaDe = (input) => {
  const id = input && input.getAttribute('list');
  return id ? document.getElementById(id) : null;
};

describe('Biomol · «Otros» con sugerencias', () => {
  it('🔴 la celda «Otros» de CADA fila está enlazada a una lista con los cuatro términos', () => {
    H.renderBiomol();
    const filas = document.querySelectorAll('#fp-biomol tbody tr').length;
    expect(filas).toBeGreaterThan(0);
    for (let f = 1; f <= filas; f++) {
      const dl = listaDe(celda(f, 'otros'));
      expect(dl, `la fila ${f} no ofrece la lista`).toBeTruthy();
      expect(dl.tagName).toBe('DATALIST');
      expect([...dl.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual(TERMINOS);
    }
  });

  it('🔴 la lista es UNA para toda la grilla, no una por fila', () => {
    H.renderBiomol();
    const id = celda(1, 'otros').getAttribute('list');
    expect(document.querySelectorAll(`#fp-biomol datalist#${id}`)).toHaveLength(1);
  });

  it('sigue siendo TEXTO LIBRE: lo que ya se escribía en producción sigue valiendo', () => {
    H.renderBiomol();
    const inp = celda(1, 'otros');
    expect(inp.tagName).toBe('INPUT');
    expect(inp.getAttribute('type')).toBe('text');
  });

  it('sólo «Otros» lleva la lista: Lugar y Código siguen como estaban', () => {
    H.renderBiomol();
    expect(celda(1, 'lugar').hasAttribute('list')).toBe(false);
    expect(celda(1, 'codigo').hasAttribute('list')).toBe(false);
  });

  it('🔴 el viaje: cada término (y uno libre) sale bajo la cabecera «Otros» del envío', () => {
    H.renderBiomol();
    const valores = [...TERMINOS, 'Calamar (Funda en uso)'];
    valores.forEach((v, i) => {
      celda(i + 1, 'codigo').value = 'C' + (i + 1);
      celda(i + 1, 'otros').value = v;
    });
    const filas = H._collectBioGrid();
    const p = H.buildBioPayload(H.bioGridFecha(), filas);
    const col = p.headers.indexOf('Otros');
    expect(col).toBeGreaterThan(-1);
    expect(p.rows.map((r) => r[col])).toEqual(valores);
  });
});
