// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Biomol — el «Método utilizado» del informe PDF

   Petición del usuario (2026-08-18): que los dos métodos del laboratorio se puedan ELEGIR,
   como los analistas del campo Responsable de Microbiología, y que después se puedan seguir
   editando. Antes los dos textos salían pegados en el mismo cuadro, así que quien había
   usado uno tenía que borrar el otro a mano en cada informe.

   Un `<datalist>` —el mecanismo del campo Responsable— solo funciona sobre `<input>`, y cada
   método son ~150 caracteres: en una sola línea no se leería. De ahí el desplegable junto a
   la etiqueta, que rellena el `<textarea>` y lo deja editable. El comportamiento es el que
   se pidió; el mecanismo, el que soporta un párrafo.

   ⚠ LO QUE ESTE ARCHIVO PROTEGE DE VERDAD: al medirlo apareció un defecto PREEXISTENTE.
   `bioRptSet` saneaba con el tope general de 200 caracteres, y los dos métodos juntos suman
   330: en cuanto el analista tocaba el campo, el texto se guardaba CORTADO a media palabra
   («…soluciones lisis y etanoles» quedaba en «…soluciones lisis y etanol») y así salía
   impreso en el PDF. El método 2 por sí solo son 197: se salvaba por tres caracteres. Por
   eso el caso de «Los dos» compara el texto COMPLETO y no solo su comienzo.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderBiomol', 'bioRptSet', 'bioMetodoPick', 'loadBioRpt', 'bioGridFecha',
  'BIO_METODOS', 'BIO_METODO_DEF'];
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

const campo = () => document.getElementById('bio-rpt-metodo');
const selector = () => document.querySelector('select[onchange="bioMetodoPick(this)"]');
const guardado = () => H.loadBioRpt(H.bioGridFecha()).metodo;
// Elegir en el desplegable como lo haría una persona: fijar el valor y disparar el handler.
const elegir = (v) => { const s = selector(); s.value = v; H.bioMetodoPick(s); };

describe('Biomol · el catálogo de métodos', () => {
  it('son los DOS textos del laboratorio, y el valor por defecto sigue siendo ambos', () => {
    expect(H.BIO_METODOS).toHaveLength(2);
    expect(H.BIO_METODOS[0].tx).toMatch(/Kit Comercial IQ REAL/);
    expect(H.BIO_METODOS[1].tx).toMatch(/PCR Nested punto final/);
    // El arranque no cambió: el campo sigue proponiendo los dos, como pidió el usuario.
    expect(H.BIO_METODO_DEF).toBe(H.BIO_METODOS[0].tx + '\n' + H.BIO_METODOS[1].tx);
  });

  it('el desplegable ofrece los dos métodos y la opción de poner ambos', () => {
    localStorage.clear();
    H.renderBiomol();
    const opts = Array.from(selector().options).map((o) => o.value);
    expect(opts).toEqual(['', '0', '1', '*']);
    expect(selector().options[1].textContent).toMatch(/Kit Comercial IQ REAL/);
    expect(selector().options[3].textContent).toMatch(/dos/i);
  });
});

describe('Biomol · elegir un método lo pone en el campo y lo guarda', () => {
  it('elegir el método 1 lo escribe entero, y REEMPLAZA lo que hubiera', () => {
    localStorage.clear();
    H.renderBiomol();
    campo().value = 'algo escrito antes';
    elegir('0');
    expect(campo().value).toBe(H.BIO_METODOS[0].tx);
    expect(guardado()).toBe(H.BIO_METODOS[0].tx);
    expect(campo().value).not.toMatch(/algo escrito antes/);
  });

  it('el método 2 (197 car.) se guarda íntegro', () => {
    localStorage.clear();
    H.renderBiomol();
    elegir('1');
    expect(guardado()).toBe(H.BIO_METODOS[1].tx);
    expect(guardado()).toMatch(/extracción de ADN\.$/);
  });

  it('«Los dos» guarda los 330 caracteres SIN cortar la frase', () => {
    localStorage.clear();
    H.renderBiomol();
    elegir('*');
    // Antes de la corrección aquí se guardaban 200 caracteres y la frase moría en
    // "…soluciones lisis y etanol". Comparar el texto entero es lo que lo detecta.
    expect(guardado()).toBe(H.BIO_METODO_DEF);
    expect(guardado().length).toBeGreaterThan(200);
    expect(guardado()).toMatch(/primers específicos/);
    expect(guardado().endsWith('extracción de ADN.')).toBe(true);
  });

  it('el campo sigue siendo libre: lo escrito a mano se guarda tal cual', () => {
    localStorage.clear();
    H.renderBiomol();
    elegir('0');
    const propio = H.BIO_METODOS[0].tx + ' Repetido por duplicado en cada muestra.';
    H.bioRptSet('metodo', propio);
    expect(guardado()).toBe(propio);
  });

  it('el desplegable vuelve a «Elegir método…» para poder elegir otra vez', () => {
    localStorage.clear();
    H.renderBiomol();
    elegir('0');
    expect(selector().value).toBe('');
    elegir('1');                       // sin el reseteo, volver a elegir no dispararía nada
    expect(guardado()).toBe(H.BIO_METODOS[1].tx);
  });

  it('elegir la opción vacía no toca lo que ya había', () => {
    localStorage.clear();
    H.renderBiomol();
    elegir('1');
    elegir('');
    expect(guardado()).toBe(H.BIO_METODOS[1].tx);
  });
});
