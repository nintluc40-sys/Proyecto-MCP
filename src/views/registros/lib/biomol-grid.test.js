// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol «Diagnóstico molecular» — capacidad de la grilla

   Petición del usuario (2026-08-17): más grilla disponible para registrar. El paso del
   botón ➕ pasa de 10 a 20 filas y el tope de 50 a 100. Aplicado en las DOS copias del
   monolito (public/registros/engine.js y C:\\Users\\Usuario\\Music\\index (8).html).

   LO QUE DE VERDAD HAY QUE VIGILAR NO ES LA CONSTANTE, ES EL ACOPLE CON EL GAS.
   `LIMITS.biomol.maxRows` vale 100 y `doPost` rechaza el envío con "Límite de filas
   excedido" cuando `payload.rows.length > maxRows`. Como las filas vacías no se envían,
   una grilla LLENA manda exactamente 100 y `100 > 100` es falso: pasa, pero SIN NINGÚN
   MARGEN. Por eso la última prueba arma el payload de una grilla llena y lo contrasta
   contra el límite leído del propio GAS/Code.gs, en vez de contra un 100 escrito a mano:
   si alguien sube el tope del cliente sin subir el del GAS, se pone roja aquí y no en
   producción, que es donde se notaría —el analista perdería la tanda entera del día—.

   El tope del GAS ya valía 100 en el despliegue vivo (desde 06c20f5), así que este cambio
   NO necesita re-desplegar el GAS.

   Verificado por mutación M49 (devolver el tope del cliente a 50) y M50 (subirlo a 120,
   por encima del GAS): cada una deja roja la prueba que le toca.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const GAS = readFileSync(join(process.cwd(), 'GAS/Code.gs'), 'utf8');

/** Tope de filas que el GAS acepta para la hoja BIOMOL, leído del fuente real. */
function topeFilasGas() {
  const m = GAS.match(/biomol:\s*\{\s*maxRows:\s*(\d+),\s*maxCols:\s*(\d+)/);
  if (!m) throw new Error('No se encontró LIMITS.biomol en GAS/Code.gs');
  return { maxRows: Number(m[1]), maxCols: Number(m[2]) };
}

const EXPORTAR = ['renderBiomol', 'bioGridAddRows', '_bioShownRows', '_collectBioGrid',
  'buildBioPayload', 'bioGridFecha', 'BIO_GRID_DEFAULT_ROWS', 'BIO_GRID_ROW_STEP', 'BIO_GRID_MAX_ROWS'];
const H = {};
const avisos = [];

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
  H.setToast((m) => { avisos.push(String(m)); });
  H.setMod(12);            // BIO_MOD
  H.setTab('biomol');
});

const filasVisibles = () => document.querySelectorAll('#fp-biomol tbody tr').length;

describe('Biomol · la grilla crece de 20 en 20 hasta 100', () => {
  it('arranca en 20 y cada ➕ suma 20, con tope duro en 100', () => {
    localStorage.clear(); avisos.length = 0;
    H.renderBiomol();
    const progresion = [filasVisibles()];
    for (let i = 0; i < 6; i++) { H.bioGridAddRows(); progresion.push(filasVisibles()); }
    // 20 → 40 → 60 → 80 → 100, y a partir de ahí no crece
    expect(progresion.slice(0, 5)).toEqual([20, 40, 60, 80, 100]);
    expect(Math.max(...progresion)).toBe(H.BIO_GRID_MAX_ROWS);
    expect(avisos.some((a) => /Máximo 100 filas/.test(a))).toBe(true);
    // El botón se apaga al llegar al tope y anuncia el paso correcto.
    const btn = document.querySelector('#fp-biomol button[onclick="bioGridAddRows()"]');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('20 filas');
  });

  it('una grilla LLENA cabe en el tope del GAS, sin margen', () => {
    const tope = topeFilasGas();
    const fp = document.getElementById('fp-biomol');
    // Se rellena la celda por su NOMBRE real (bg_<fila>_<clave>): llenar "el primer input
    // de la fila" NO marca la fila como con datos y la prueba pasaría sin medir nada.
    let rellenadas = 0;
    for (let i = 1; i <= H.BIO_GRID_MAX_ROWS; i++) {
      const el = fp.querySelector(`[name="bg_${i}_codigo"]`);
      if (el) { el.value = 'M' + i; rellenadas++; }
    }
    expect(rellenadas).toBe(H.BIO_GRID_MAX_ROWS);          // control: se llenaron TODAS
    const payload = H.buildBioPayload(H.bioGridFecha(), H._collectBioGrid());
    expect(payload.rows.length).toBe(H.BIO_GRID_MAX_ROWS); // control: se recogieron TODAS
    // Lo que importa: el GAS no lo rechazaría (su guarda es `rows.length > maxRows`).
    expect(payload.rows.length).toBeLessThanOrEqual(tope.maxRows);
    expect(payload.headers.length).toBeLessThanOrEqual(tope.maxCols);
  });
});
