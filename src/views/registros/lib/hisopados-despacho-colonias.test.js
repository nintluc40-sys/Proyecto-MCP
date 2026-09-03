// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Microbiología · «Hisopados (despacho)» suma las colonias (2026-09-03)

   Petición del usuario: que el formato lleve C. Amarillas, C. Verdes y C. Totales
   «como en el formato de Hisopados».

   🔑 POR QUÉ NO CREA COLUMNAS, que es lo que hacía dudar: `MIC_SHEET_HEADERS` se
   construye de `MIC_LEVEL_PARAMS`, una lista FIJA que ya incluye los tres. La hoja
   tiene las MISMAS 81 columnas para todos los formatos; el `params:` de cada formato
   sólo decide qué celdas puede rellenar el analista. Así que esto NO toca el esquema
   y NO depende del re-despliegue del GAS pendiente.

   🔑 Y LA REGLA QUE DE VERDAD IMPORTA VIGILAR: `vtot` está declarado como
   `auto:["vamar","vverd"]` — se autosuma. Un formato con `vtot` pero sin sus dos
   sumandos deja un campo automático que no puede calcularse. Por eso la última
   prueba es un BARRIDO de todos los formatos, no sólo del que se acaba de tocar.

   Se lee el `engine.js` REAL como texto, sin reimplementar nada, igual que
   `factores-por-formato.test.js`.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const engine = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** Todos los formatos de MIC_FORMATS con su lista de parámetros, del fuente real. */
function formatos() {
  const re = /"([a-z0-9-]+)": \{[\s\S]*?params:\[([^\]]*)\]/g;
  const out = {};
  let m;
  while ((m = re.exec(engine)) !== null) {
    out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return out;
}

const F = formatos();

describe('«Hisopados (despacho)» · las tres columnas de colonias', () => {
  it('el formato existe y se pudo leer del monolito', () => {
    expect(F['hisopados-despacho']).toBeDefined();
    expect(F['hisopados']).toBeDefined();
  });

  it('lleva C. Amarillas, C. Verdes y C. Totales', () => {
    expect(F['hisopados-despacho']).toContain('vamar');
    expect(F['hisopados-despacho']).toContain('vverd');
    expect(F['hisopados-despacho']).toContain('vtot');
  });

  /* Van DELANTE, como en los otros 15 formatos: el orden del array es el de las
     columnas de la grilla, y las colonias se leen antes que los vibrios nominales. */
  it('van las tres primeras, en el orden de la casa', () => {
    expect(F['hisopados-despacho'].slice(0, 3)).toEqual(['vamar', 'vverd', 'vtot']);
  });

  /* Sin esta pareja, la prueba de arriba la aprobaría un cambio que se cargara los
     cinco parámetros que el formato ya tenía. */
  it('NO pierde los cinco que ya tenía', () => {
    ['valg', 'vvuln', 'vpara', 'pseudo', 'aero'].forEach((p) => {
      expect(F['hisopados-despacho']).toContain(p);
    });
    expect(F['hisopados-despacho']).toHaveLength(8);
  });

  it('coincide con «Hisopados» en las tres de colonias, que es lo que se pidió', () => {
    expect(F['hisopados'].slice(0, 3)).toEqual(['vamar', 'vverd', 'vtot']);
    expect(F['hisopados-despacho'].slice(0, 3)).toEqual(F['hisopados'].slice(0, 3));
  });
});

describe('BARRIDO · el autosumado de C. Totales necesita sus dos sumandos', () => {
  it('todo formato con vtot lleva también vamar y vverd', () => {
    // `vtot: { l:"C. Totales", auto:["vamar","vverd"] }` — es global, no por formato.
    expect(engine).toContain('vtot:   { l:"C. Totales", auto:["vamar","vverd"] }');
    const malos = Object.entries(F)
      .filter(([, ps]) => ps.includes('vtot'))
      .filter(([, ps]) => !ps.includes('vamar') || !ps.includes('vverd'))
      .map(([f]) => f);
    expect(malos).toEqual([]);
  });

  it('el barrido mira formatos de verdad, no una lista vacía', () => {
    const conVtot = Object.entries(F).filter(([, ps]) => ps.includes('vtot'));
    expect(conVtot.length).toBeGreaterThanOrEqual(10);
  });
});

/* ============================================================
   Y AHORA LO QUE DE VERDAD IMPORTA: que el DATO llegue bien a la hoja.
   Lo de arriba comprueba la configuración; esto arranca el monolito REAL y mira
   dónde caen los números, que es donde este proyecto se ha quemado.
   Mismo arnés que `mad-ras-sync.test.js`, que cubre un cambio de la misma clase.
   ============================================================ */
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const ENGINE_PATH = join(process.cwd(), 'public/registros/engine.js');
const EXPORTAR = ['buildMicPayload', 'MIC_SHEET_HEADERS', 'micFactorOf', 'micSectionHtml'];
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
  const epilogo = '\n;(function(){ var G = globalThis.__ENG2;\n'
    + EXPORTAR.map((n) => `try{ G[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\n})();';
  globalThis.__ENG2 = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE_PATH, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
});

/* Conteos DISTINTOS entre sí a propósito: con el mismo número en los tres, una columna
   corrida no se notaría. 7 y 5 dan 12, que no coincide con ninguno de los dos. */
const registroDespacho = () => ({
  id: 'micHD1',
  ts: Date.now(),
  data: {
    formato: 'hisopados-despacho', departamento: 'Otras', fechaMuestreo: '2026-09-03',
    fechaResultados: '2026-09-03', responsable: 'Ana',
    modulo: '3', carro: 'C1', tina: 'T2', etapa: 'Antes', lote: 'L9',
    vamar: '7', vverd: '5',
    valg: '12', vvuln: '34', vpara: '56', pseudo: '3', aero: '2',
    sid: 'ses-hd-1',
  },
});

const celda = (headers, fila, nombre) => fila[headers.indexOf(nombre)];

/* ⚠⚠ HONESTIDAD SOBRE LO QUE ESTE BLOQUE MIDE Y LO QUE NO. Se comprobó por MUTACIÓN
   (revirtiendo la lista de params a los 5 de antes) y estas cuatro pruebas SIGUEN VERDES:
   `buildMicPayload` calcula desde los datos del REGISTRO, no desde `fmt.params`. O sea que
   NO distinguen este cambio — son un guardián del camino del PAYLOAD, que es otra cosa y
   también hace falta. Quien distingue el cambio es el bloque de arriba (configuración) y,
   sobre todo, el de abajo (la grilla). Se deja escrito para que nadie las lea como prueba
   de que el formato lleva las columnas. */
describe('«Hisopados (despacho)» · el dato llega a la hoja (camino del payload)', () => {
  it('🔴 la hoja YA tenía estas columnas: el esquema NO se movió', () => {
    // Si esto fallara habría que migrar la hoja a mano ANTES de sincronizar, que es
    // justo donde este proyecto se ha quemado. Va primero por eso.
    const h = H.MIC_SHEET_HEADERS;
    ['C. Amarillas', 'C. Verdes', 'C. Totales'].forEach((p) => {
      expect(h, 'falta la columna de ' + p).toContain(p + ' (crudo)');
      expect(h).toContain(p + ' UFC');
      expect(h).toContain(p + ' Nivel');
    });
  });

  it('C. Totales se AUTOSUMA: 7 + 5 = 12, y no se teclea', () => {
    const p = H.buildMicPayload([registroDespacho()]);
    const h = p.headers;
    const fila = p.rows[0];
    // ⚠ El payload escribe NÚMEROS, no cadenas: se compara con Number() para que la
    //   prueba mida el VALOR y no el tipo, que es detalle del serializador.
    expect(Number(celda(h, fila, 'C. Amarillas (crudo)'))).toBe(7);
    expect(Number(celda(h, fila, 'C. Verdes (crudo)'))).toBe(5);
    expect(Number(celda(h, fila, 'C. Totales (crudo)'))).toBe(12);
  });

  it('las tres traen UFC y Nivel, o entrarían sin semáforo', () => {
    const p = H.buildMicPayload([registroDespacho()]);
    const h = p.headers;
    const fila = p.rows[0];
    ['C. Amarillas', 'C. Verdes', 'C. Totales'].forEach((l) => {
      expect(celda(h, fila, l + ' UFC'), l + ' sin UFC').not.toBe('');
      expect(celda(h, fila, l + ' Nivel'), l + ' sin Nivel').not.toBe('');
    });
  });

  it('el factor sale del área «ambiental», la misma que Hisopados', () => {
    ['vamar', 'vverd', 'vtot'].forEach((pk) => {
      expect(H.micFactorOf('ambiental', pk), pk + ' sin factor').toBeTruthy();
    });
  });

  it('los cinco que ya estaban siguen cayendo en su sitio', () => {
    const p = H.buildMicPayload([registroDespacho()]);
    const h = p.headers;
    const fila = p.rows[0];
    expect(Number(celda(h, fila, 'V.alginolyticus (crudo)'))).toBe(12);
    expect(Number(celda(h, fila, 'V.vulnificus (crudo)'))).toBe(34);
    expect(Number(celda(h, fila, 'V.parahaemolyticus (crudo)'))).toBe(56);
    expect(celda(h, fila, 'Carro')).toBe('C1');
    expect(celda(h, fila, 'Tina')).toBe('T2');
  });
});

/* ============================================================
   EL ASA · lo que el analista VE. `micSectionHtml` construye las cabeceras `<th>`
   desde `fmt.params`, así que ESTE bloque sí distingue el cambio: revertir la lista
   lo pone rojo. Comprobado por mutación, no supuesto.
   ============================================================ */
describe('«Hisopados (despacho)» · la grilla enseña las tres columnas', () => {
  const draft = { meta: {}, sections: {} };

  it('las cabeceras incluyen C. Amarillas, C. Verdes y C. Totales', () => {
    const html = H.micSectionHtml('hisopados-despacho', draft);
    ['C. Amarillas', 'C. Verdes', 'C. Totales'].forEach((l) => {
      expect(html, 'no sale la columna ' + l).toContain('>' + l + '</th>');
    });
  });

  it('C. Totales sale como campo AUTO, no como uno que se teclea', () => {
    const html = H.micSectionHtml('hisopados-despacho', draft);
    expect(html).toContain('data-param="vtot"');
    expect(html).toContain('C. Totales = C. Amarillas + C. Verdes (auto)');
  });

  it('las cinco columnas que ya estaban siguen saliendo', () => {
    const html = H.micSectionHtml('hisopados-despacho', draft);
    ['V.alginolyticus', 'V.vulnificus', 'V.parahaemolyticus', 'Pseudomonas', 'Aeromonas']
      .forEach((l) => expect(html, 'desapareció ' + l).toContain('>' + l + '</th>'));
  });

  it('y el contexto propio del formato no se movió', () => {
    const html = H.micSectionHtml('hisopados-despacho', draft);
    ['Módulo', 'Carro', 'Tina', 'Etapa', 'Lote']
      .forEach((l) => expect(html, 'desapareció ' + l).toContain('>' + l + '</th>'));
  });
});
