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
   eso el caso de «Todos» compara el texto COMPLETO y no solo su comienzo.

   Ampliación (2026-08-19): el catálogo pasó a CUATRO —reacción dúplex y Kit DHELIX— y la
   opción combinada pasó a llamarse «Todos», porque «Los dos» ya mentía.
   🔑 Al hacerlo hubo que SEPARAR lo que era una sola constante: `BIO_METODO_TODOS` es el
   catálogo entero que inserta esa opción, y `BIO_METODO_DEF` —lo que propone un reporte
   NUEVO— sigue siendo solo los dos métodos históricos, los marcados `def`. Estaban
   acoplados: añadir métodos al array habría hecho, sin tocar nada más, que todo informe
   nuevo arrancara con los cuatro, dos de ellos sin aplicar, y que el analista tuviera que
   borrarlos a mano —justo el problema que este desplegable vino a resolver—. Los dos
   últimos casos son los que vigilan esa separación.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderBiomol', 'bioRptSet', 'bioMetodoPick', 'loadBioRpt', 'bioGridFecha',
  'BIO_METODOS', 'BIO_METODO_DEF', 'BIO_METODO_TODOS'];
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
  it('son los CUATRO textos del laboratorio, numerados y con la unidad intacta', () => {
    expect(H.BIO_METODOS).toHaveLength(4);
    expect(H.BIO_METODOS[0].tx).toMatch(/Kit Comercial IQ REAL/);
    expect(H.BIO_METODOS[1].tx).toMatch(/PCR Nested punto final/);
    expect(H.BIO_METODOS[2].tx).toMatch(/reacción dúplex/);
    expect(H.BIO_METODOS[3].tx).toMatch(/Kit Comercial DHELIX/);
    // El número va INCRUSTADO en el texto: es lo que se imprime en el PDF.
    H.BIO_METODOS.forEach((m, i) => {
      expect(m.tx.startsWith(`${i + 1}) `)).toBe(true);
      expect(m.et.startsWith(`${i + 1}) `)).toBe(true);
      // MICROlitros, no MILIlitros: la mu tiene que ser la griega, no una eme.
      expect(m.tx).toContain('copias/μl');
    });
  });

  it('«Todos» es el catálogo entero, pero el DEFECTO son solo los dos históricos', () => {
    expect(H.BIO_METODO_TODOS).toBe(H.BIO_METODOS.map((m) => m.tx).join('\n'));
    expect(H.BIO_METODO_DEF).toBe(H.BIO_METODOS[0].tx + '\n' + H.BIO_METODOS[1].tx);
    // Estaban acoplados. Si alguien los vuelve a unir, esto es lo que lo caza.
    expect(H.BIO_METODO_DEF).not.toBe(H.BIO_METODO_TODOS);
    expect(H.BIO_METODO_DEF).not.toMatch(/DHELIX|dúplex/);
    // Y la marca `def` es lo que decide, no la posición: reordenar el array no lo cambia.
    expect(H.BIO_METODOS.filter((m) => m.def).map((m) => m.tx).join('\n')).toBe(H.BIO_METODO_DEF);
  });

  it('el desplegable ofrece los cuatro métodos y la opción de ponerlos todos', () => {
    localStorage.clear();
    H.renderBiomol();
    const opts = Array.from(selector().options).map((o) => o.value);
    expect(opts).toEqual(['', '0', '1', '2', '3', '*']);
    expect(selector().options[1].textContent).toMatch(/Kit Comercial IQ REAL/);
    expect(selector().options[4].textContent).toMatch(/DHELIX/);
    // Ya no puede decir «Los dos»: con cuatro en la lista, esa etiqueta mentía.
    expect(selector().options[5].textContent).toMatch(/^Todos$/);
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

  it('los métodos nuevos 3 y 4 se eligen y se guardan enteros', () => {
    localStorage.clear();
    H.renderBiomol();
    elegir('2');
    expect(guardado()).toBe(H.BIO_METODOS[2].tx);
    expect(guardado()).toMatch(/reacción dúplex/);
    elegir('3');
    expect(guardado()).toBe(H.BIO_METODOS[3].tx);
    expect(guardado().endsWith('extracción de ADN.')).toBe(true);
  });

  it('«Todos» guarda los cuatro SIN cortar la frase', () => {
    localStorage.clear();
    H.renderBiomol();
    elegir('*');
    // Antes de la corrección aquí se guardaban 200 caracteres y la frase moría en
    // "…soluciones lisis y etanol". Comparar el texto entero es lo que lo detecta.
    // Con cuatro métodos son ~590 caracteres: siguen cabiendo en el tope de 2000.
    expect(guardado()).toBe(H.BIO_METODO_TODOS);
    expect(guardado().length).toBeGreaterThan(500);
    expect(guardado().length).toBeLessThan(2000);
    expect(guardado()).toMatch(/primers específicos/);
    expect(guardado()).toMatch(/DHELIX/);
    expect(guardado().split('\n')).toHaveLength(4);
    expect(guardado().endsWith('extracción de ADN.')).toBe(true);
  });

  it('un reporte NUEVO arranca con los dos históricos, NO con los cuatro', () => {
    localStorage.clear();
    H.renderBiomol();
    // Lo que ve el analista al abrir el informe y lo que queda guardado, ambos.
    expect(campo().value).toBe(H.BIO_METODO_DEF);
    expect(guardado()).toBe(H.BIO_METODO_DEF);
    expect(guardado().split('\n')).toHaveLength(2);
    // Si el defecto se re-acopla al catálogo, aquí aparecerían dos métodos sin aplicar.
    expect(guardado()).not.toMatch(/DHELIX|dúplex/);
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
