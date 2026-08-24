// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Maduración · RAS — que la SINCRONIZACIÓN siga siendo funcional

   Los tres vibrios entran en el formato el 2026-08-24. Lo que hay que demostrar no es
   que aparezcan en pantalla, sino que **el dato llega a la hoja bajo SU cabecera y con
   su UFC**. Son tres cosas distintas y sólo la última se ve en producción:

     · la CABECERA de la hoja no se mueve (la fija MIC_LEVEL_PARAMS, no el formato);
     · cada conteo cae en la columna de su patógeno, no corrido;
     · el UFC = conteo × factor del área, con el ×10 que fijó el usuario.

   Se arranca el `engine.js` REAL sobre el shell real y se le pide el payload que manda
   al GAS. El tope de columnas se lee del `GAS/Code.gs` REAL: si el envío no cupiera, el
   GAS recorta en SILENCIO y las últimas columnas llegarían vacías sin ningún error.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const GAS = readFileSync(join(process.cwd(), 'GAS/Code.gs'), 'utf8');

/** Tope de columnas que el GAS aplica a la hoja «Microbiología», del fuente real. */
function topeMicro() {
  const m = GAS.match(/micro:\s*\{\s*maxRows:\s*(\d+),\s*maxCols:\s*(\d+)/);
  if (!m) throw new Error('No se encontró LIMITS.micro en GAS/Code.gs');
  return { maxRows: Number(m[1]), maxCols: Number(m[2]) };
}

const EXPORTAR = ['buildMicPayload', 'MIC_SHEET_HEADERS', 'micComputeRecord', 'micFactorOf'];
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
    + '\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
});

/* Conteos DISTINTOS entre sí a propósito: con el mismo número en los tres, una columna
   corrida no se notaría. 12 · 34 · 56 se distinguen a simple vista en el payload. */
const registroRas = () => ({
  id: 'micRAS1',
  ts: Date.now(),
  data: {
    formato: 'ras', departamento: 'Maduración', fechaMuestreo: '2026-08-24',
    fechaResultados: '2026-08-24', corrida: '585', responsable: 'Ana',
    componente: 'Salida UV',
    vamar: '10', vverd: '5',
    valg: '12', vvuln: '34', vpara: '56',
    aero: '7', pseudo: '3', btot: '2', brojas: '1',
    sid: 'ses-ras-1',
  },
});

const celdaDe = (headers, fila, nombre) => fila[headers.indexOf(nombre)];

describe('Maduración · RAS · el dato llega a la hoja', () => {
  it('🔴 la hoja YA tenía estas columnas: el esquema no se movió', () => {
    /* El cambio es de FORMATO, no de hoja: `MIC_SHEET_HEADERS` se arma de
       MIC_LEVEL_PARAMS. Si esto fallara, habría que migrar la hoja a mano antes de
       sincronizar, que es donde este proyecto se ha quemado. */
    const h = H.MIC_SHEET_HEADERS;
    ['V.alginolyticus', 'V.vulnificus', 'V.parahaemolyticus'].forEach((p) => {
      expect(h, 'falta la columna de ' + p).toContain(p + ' (crudo)');
      expect(h).toContain(p + ' UFC');
      expect(h).toContain(p + ' Nivel');
    });
  });

  it('🔴 cada conteo cae bajo SU cabecera, no corrido', () => {
    const p = H.buildMicPayload([registroRas()]);
    const [fila] = p.rows;
    expect(p.headers.length, 'la fila no mide lo que la cabecera').toBe(fila.length);
    expect(celdaDe(p.headers, fila, 'V.alginolyticus (crudo)')).toBe(12);
    expect(celdaDe(p.headers, fila, 'V.vulnificus (crudo)')).toBe(34);
    expect(celdaDe(p.headers, fila, 'V.parahaemolyticus (crudo)')).toBe(56);
  });

  it('🔴 el UFC va multiplicado por el factor del área (×10), no en crudo', () => {
    /* Es el fallo que no da error: sin factor `micFactorOf` devuelve {f:1} y el UFC
       sale igual al conteo — diez veces por debajo y sin nada que lo delate. */
    const p = H.buildMicPayload([registroRas()]);
    const [fila] = p.rows;
    expect(H.micFactorOf('ras-agua', 'valg').f).toBe(10);
    expect(celdaDe(p.headers, fila, 'V.alginolyticus UFC')).toBe(120);
    expect(celdaDe(p.headers, fila, 'V.vulnificus UFC')).toBe(340);
    expect(celdaDe(p.headers, fila, 'V.parahaemolyticus UFC')).toBe(560);
    // Control: las colonias de esta misma área siguen en ×5, así que el ×10 de arriba
    // no es un factor global que pasaría igual con cualquier número.
    expect(celdaDe(p.headers, fila, 'C. Amarillas UFC')).toBe(50);
  });

  it('🔴 el nivel se calcula: sin umbrales la celda saldría vacía', () => {
    const p = H.buildMicPayload([registroRas()]);
    const [fila] = p.rows;
    // 120 y 340 UFC quedan por debajo del primer umbral de su parámetro → «Mínimo».
    expect(celdaDe(p.headers, fila, 'V.alginolyticus Nivel')).toBe('Mínimo');
    expect(celdaDe(p.headers, fila, 'V.vulnificus Nivel')).toBe('Elevado');
    expect(celdaDe(p.headers, fila, 'V.parahaemolyticus Nivel')).toBe('Elevado');
  });

  it('🔴 el envío sigue cabiendo en el tope de columnas del GAS', () => {
    // maxCols RECORTA en silencio: si el payload lo superara, las últimas columnas
    // llegarían vacías a la hoja sin un solo error.
    const p = H.buildMicPayload([registroRas()]);
    expect(p.headers.length).toBeLessThanOrEqual(topeMicro().maxCols);
  });

  it('el contrato de sincronización no cambia (hoja y clave de upsert)', () => {
    const p = H.buildMicPayload([registroRas()]);
    expect(p.sheetName).toBe('Microbiología');
    expect(p.replaceKey).toBe(true);
    expect(p.keyCols).toEqual([0, 2, 4, 5, H.MIC_SHEET_HEADERS.indexOf('Sesión')]);
  });
});
