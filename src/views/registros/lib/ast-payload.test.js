/* ============================================================
   REGISTROS · AsT (Registro_Supervisión) — contrato del payload de sincronización
   Cubre `buildAstPayload` del monolito `public/registros/engine.js` y su acuerdo con
   el GAS (`GAS/Code.gs`), extrayendo el código REAL de ambos fuentes.

   Contexto (2026-08-15): Flacidez, Necrosis y Disparidad van ANTES del "ID", que es la
   ÚLTIMA columna. El payload se escribe por POSICIÓN desde la columna 1, así que el array
   `headers` ES el orden físico de la hoja; se migró "Registro_Supervisión" moviendo la
   columna del ID al final, detrás de Disparidad.

   Por qué ese orden y no el inverso: con el ID al final, las DOS rutas de `upsertAstRows`
   —la búsqueda por cabecera "ID" y el respaldo `widest - 1`— apuntan a la MISMA columna,
   así que el upsert empareja aunque la cabecera falte. En el diseño anterior (ID en la
   posición 24, delante de las 3 nuevas) eso no se cumplía: se midió que la hoja real de
   producción tenía la cabecera del ID en BLANCO, con lo que el respaldo caía en
   "Disparidad" y cada sincronización habría duplicado la fila.

   Tres trampas que estas pruebas vigilan:
   · `LIMITS.ast.maxCols` no es sólo una validación: el GAS RECORTA las filas a ese
     ancho en silencio. Con el 25 anterior, un payload de 27 perdía el ID y cada
     sincronización habría DUPLICADO la fila en vez de actualizarla.
   · `ensureHeaders` debe aplicarse al AsT o las 3 columnas nunca se crearían.
   · `ensureHeaders` sólo AÑADE columnas al final; NO repara una cabecera vacía en medio.
     Por eso hay un caso con la cabecera del ID en blanco sobre una hoja ya ancha.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const GAS = new URL('../../../../GAS/Code.gs', import.meta.url);

const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');
function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error('Ancla no encontrada: ' + desde);
  return src.slice(i, j + hasta.length);
}

const COLUMNAS_HISTORICAS = [
  'Fecha', 'Supervisor', 'Módulo', 'Siembra', 'Corrida', 'Estadío_observado', 'Tipo_revisión',
  'Deformidad_%', '% Atraso', '% Protusión', 'Protusión', 'Opacidad', 'Asimilación',
  'Semillenas (%)', 'Vacías (%)', 'Intestino', 'Actividad', 'Condición_biológica',
  '% No viables', 'Observaciones', 'Acción', 'Comentario (matutino)', 'Comentario (vespertino)',
];

function buildPayload(records) {
  const code = bloque(leer(ENGINE), 'function buildAstPayload(records){', 'return { sheetName: AST_SHEET, headers, rows };\n}');
  const ctx = {
    String, Number, Object, Array, JSON, Math, parseFloat, isFinite,
    AST_SHEET: 'Registro_Supervisión',
    isValidDate: (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')),
    sanitizeStr: (s) => String(s == null ? '' : s).trim(),
    astRevisionType: () => 'Completa',
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__b = buildAstPayload;').runInContext(ctx);
  return ctx.__b(records);
}

const registro = (extra = {}) => ([{
  id: 'AST-001',
  data: {
    fecha: '2026-08-12', supervisor: 'Sup', modulo: 'M01', siembra: 'S1', corrida: '600',
    estadio: 'PL5', deformidad: 1, atraso: 2, hernia: 3, hernia_grado: 'Leve',
    opacidad: 'No', asimilacion: 'Buena', semillenas: 4, vacias: 5,
    intestino: 'Lleno', actividad: 'Alta', condicion: 'Óptima', noviables: 6,
    observaciones: 'obs', accion: 'acc', comentario: 'mat', comentario_vesp: 'ves',
    flacidez: 7, necrosis: 8, disparidad: 9, ...extra,
  },
}]);

describe('registros · AsT · payload de Registro_Supervisión', () => {
  it('las 23 columnas históricas conservan su posición exacta', () => {
    const { headers } = buildPayload(registro());
    expect(headers.slice(0, 23)).toEqual(COLUMNAS_HISTORICAS);
  });

  it('Flacidez/Necrosis/Disparidad van ANTES del ID, que cierra la fila', () => {
    const { headers } = buildPayload(registro());
    expect(headers.slice(23)).toEqual(['Flacidez', 'Necrosis', 'Disparidad', 'ID']);
    expect(headers).toHaveLength(27);
    expect(headers[headers.length - 1]).toBe('ID');   // invariante que sostiene el upsert
  });

  it('cada fila lleva 27 celdas y los valores nuevos en su sitio', () => {
    const { rows } = buildPayload(registro());
    expect(rows[0]).toHaveLength(27);
    expect(rows[0][26]).toBe('AST-001');   // ID, última columna
    expect(rows[0].slice(23, 26)).toEqual([7, 8, 9]);
  });

  it('un campo vacío viaja como celda vacía, no como 0', () => {
    const { rows } = buildPayload(registro({ flacidez: '', necrosis: null, disparidad: undefined }));
    expect(rows[0].slice(23, 26)).toEqual(['', '', '']);
  });

  it('un valor no numérico se descarta en vez de ensuciar la hoja', () => {
    const { rows } = buildPayload(registro({ flacidez: 'abc' }));
    expect(rows[0][23]).toBe('');
  });
});

describe('registros · AsT · captura del formulario', () => {
  it('los campos nuevos quedan DENTRO de .mad-form (si no, collectAst no los vería)', () => {
    const src = leer(ENGINE);
    const i = src.indexOf('function renderAst(){');
    const seg = src.slice(i, src.indexOf('\nfunction ', i + 10));
    const desdeForm = seg.indexOf('mad-form');
    expect(desdeForm).toBeGreaterThan(-1);
    ['flacidez', 'necrosis', 'disparidad'].forEach((k) => {
      const pos = seg.indexOf(`name="${k}"`);
      expect(pos).toBeGreaterThan(desdeForm);
      // Profundidad > 0 ⇒ seguimos dentro del contenedor abierto en `mad-form`.
      const tramo = seg.slice(desdeForm, pos);
      const abiertos = (tramo.match(/<div/g) || []).length;
      const cerrados = (tramo.match(/<\/div>/g) || []).length;
      expect(abiertos - cerrados).toBeGreaterThan(0);
    });
  });

  it('el collectAst REAL recoge los tres valores como números', async () => {
    const { Window } = await import('happy-dom');
    const win = new Window();
    const doc = win.document;
    doc.body.innerHTML = `
      <div id="fp-ast"><div class="mad-form"><div class="meta">
        <input type="number" name="deformidad" value="1">
        <input type="number" name="flacidez" value="7.5">
        <input type="number" name="necrosis" value="8">
        <input type="number" name="disparidad" value="">
      </div></div></div>`;

    const code = bloque(leer(ENGINE), 'function collectAst(){', '  return d;\n}');
    const ctx = {
      document: doc, String, Number, Object, Array, Math, parseFloat, isFinite,
      sanitizeStr: (s) => String(s == null ? '' : s).trim(),
      sanitizeNum: (v) => { const n = parseFloat(v); return isFinite(n) ? n : ''; },
      isValidDate: () => true,
      astRevisionType: () => 'Completa',
    };
    ctx.globalThis = ctx;
    createContext(ctx);
    new Script(code + '\n;globalThis.__c = collectAst;').runInContext(ctx);
    const d = ctx.__c();

    expect(d.flacidez).toBe(7.5);
    expect(d.necrosis).toBe(8);
    expect(d.disparidad).toBe('');   // vacío se conserva vacío, no 0
  });
});

describe('registros · AsT · PDF del historial', () => {
  it('las cabeceras y las celdas de la tabla cuadran (añadir una columna descuadra el PDF)', () => {
    const src = leer(ENGINE);
    const i = src.indexOf('function downloadAstPDF(){');
    const seg = src.slice(i, src.indexOf('\nfunction ', i + 10));
    const nCabeceras = (/const headers = \[([\s\S]*?)\];/.exec(seg)[1].match(/'/g) || []).length / 2;
    const nCeldas = (/return `<tr>([\s\S]*?)<\/tr>`/.exec(seg)[1].match(/<td/g) || []).length;
    expect(nCeldas).toBe(nCabeceras);
  });

  it('el PDF incluye las tres variables nuevas', () => {
    const src = leer(ENGINE);
    const seg = src.slice(src.indexOf('function downloadAstPDF(){'));
    ['a.flacidez', 'a.necrosis', 'a.disparidad'].forEach((k) => {
      expect(seg.slice(0, seg.indexOf('\nfunction ', 10))).toContain(k);
    });
  });
});

describe('registros · AsT · acuerdo con el GAS', () => {
  const gas = leer(GAS);

  it('el payload CABE en LIMITS.ast.maxCols (si no, el GAS recorta y se pierde el ID)', () => {
    const maxCols = Number(/ast:\s*\{[^}]*maxCols:\s*(\d+)/.exec(gas)[1]);
    const { headers } = buildPayload(registro());
    expect(headers.length).toBeLessThanOrEqual(maxCols);
  });

  // 2026-08. Este caso comprobaba que la LISTA BLANCA `if (isMicro || … || isAst)`
  // incluyera al AsT y excluyera al resto. La segunda mitad fijaba el diseño anterior y
  // era justo el defecto: esa lista dejaba fuera las hojas "Datos Larvicultura", y
  // `upsertRows` SÍ ensancha la hoja para que quepa la fila — así que al añadir una
  // columna al final ("Toneladas") el dato entraba y su cabecera quedaba en blanco.
  // Ahora la llamada es INCONDICIONAL, que garantiza lo mismo para el AsT y además para
  // todas las demás hojas. La garantía no se debilita: se amplía.
  it('doPost aplica ensureHeaders SIEMPRE, no sólo a una lista blanca de hojas', () => {
    expect(gas).toMatch(/^\s*ensureHeaders\(ws, payload\.headers \|\| \[\]\);\s*$/m);
    expect(gas).not.toMatch(/if \([^)]*\)\s*ensureHeaders/);
  });

  it('la plantilla GAS embebida en engine.js dice lo MISMO que GAS/Code.gs', () => {
    // Las dos copias deben ir sincronizadas; si una se queda atrás, el técnico pega en
    // script.google.com una versión que no es la del repo.
    const eng = leer(ENGINE);
    expect(eng).toMatch(/^\s*ensureHeaders\(ws, payload\.headers \|\| \[\]\);\s*$/m);
    expect(eng).not.toMatch(/if \([^)]*\)\s*ensureHeaders/);
  });

  // Hoja simulada mínima de Apps Script. Compartida por los tres casos de upsert para no
  // repetir el mock; `grid` se muta EN SITIO, así el test lo inspecciona después.
  function hojaSimulada(grid) {
    let maxCols = grid[0].length;
    return {
      getMaxColumns: () => maxCols,
      insertColumnsAfter: (_a, n) => { maxCols += n; },
      getLastColumn: () => grid[0].length,
      getLastRow: () => grid.length,
      getDataRange: () => ({ getValues: () => grid.map((r) => r.slice()) }),
      getRange: (row, col, nR, nC) => ({
        getValues: () => Array.from({ length: nR || 1 }, (_, i) => Array.from(
          { length: nC || 1 }, (_2, c) => ((grid[row - 1 + i] || [])[col - 1 + c] ?? ''),
        )),
        setValues: (vals) => {
          vals.forEach((v, i) => {
            const ri = row - 1 + i;
            while (grid.length <= ri) grid.push([]);
            v.forEach((cell, c) => { grid[ri][col - 1 + c] = cell; });
          });
        },
      }),
    };
  }

  // Corre el upsertAstRows REAL de GAS/Code.gs contra la hoja simulada.
  function correrUpsert(grid, rows) {
    // Desde M9 (2026-08-30) el upsert delega el ancho de fila en `filasUniformes`,
    // compartido por las seis rutas de escritura del GAS: va al sandbox o no resuelve.
    const upsert = bloque(gas, 'function filasUniformes(filas) {', '\n}')
      + '\n' + bloque(gas, 'function upsertAstRows(ws, newRows) {', '\n}');
    const ctx = { String, Number, Object, Array, Math, fmtData: () => {}, lastRow: (w) => w.getLastRow() };
    ctx.globalThis = ctx;
    createContext(ctx);
    new Script(upsert + '\n;globalThis.__up = upsertAstRows;').runInContext(ctx);
    return ctx.__up(hojaSimulada(grid), rows.map((r) => r.slice()));
  }

  // Fila ya presente en la hoja, con el ID en la ÚLTIMA columna (índice 26).
  function filaPrevia() {
    const previa = new Array(27).fill('');
    previa[0] = '2026-08-01';
    previa[26] = 'AST-001';
    return previa;
  }

  it('el upsert localiza el ID por su CABECERA y actualiza la fila en vez de duplicarla', () => {
    const { headers, rows } = buildPayload(registro());
    const grid = [headers.slice(), filaPrevia()];       // hoja ya migrada: 27 cols con "ID"

    const res = correrUpsert(grid, rows);
    expect(res).toEqual({ upserted: 1, appended: 0 });  // ACTUALIZA la fila, no la duplica
    expect(grid).toHaveLength(2);                       // cabecera + 1 fila, sin duplicado
    expect(grid[1][26]).toBe('AST-001');                // el ID sigue emparejando
    expect(grid[1].slice(23, 26)).toEqual([7, 8, 9]);   // y los valores nuevos aterrizan
  });

  it('con la cabecera "ID" en BLANCO sobre una hoja ya ancha, el respaldo sigue acertando', () => {
    // El caso REAL medido contra producción, y el que el orden anterior rompía: la hoja
    // ya tiene el ancho completo (27), así que ensureHeaders sale sin escribir nada
    // (lastCol >= headers.length) y la cabecera del ID NO se repara nunca. La búsqueda
    // por cabecera falla y todo queda en manos del respaldo `widest - 1`. Con el ID al
    // final ese respaldo acierta; con el ID en la posición 24 caía en "Disparidad" y
    // cada sincronización añadía una fila nueva en lugar de actualizar la existente.
    const { headers, rows } = buildPayload(registro());
    const sinCabeceraId = headers.slice(0, 26).concat(['']);
    const grid = [sinCabeceraId, filaPrevia()];

    const res = correrUpsert(grid, rows);
    expect(res).toEqual({ upserted: 1, appended: 0 });
    expect(grid).toHaveLength(2);
    expect(grid[1][26]).toBe('AST-001');
    expect(grid[1].slice(23, 26)).toEqual([7, 8, 9]);
  });

  it('una hoja heredada más estrecha y sin "ID" no rompe', () => {
    const { headers, rows } = buildPayload(registro());
    const grid = [headers.slice(0, 23).concat(['Sesión'])];
    expect(() => correrUpsert(grid, rows)).not.toThrow();
  });
});
