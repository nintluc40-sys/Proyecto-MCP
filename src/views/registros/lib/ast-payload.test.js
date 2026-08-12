/* ============================================================
   REGISTROS · AsT (Registro_Supervisión) — contrato del payload de sincronización
   Cubre `buildAstPayload` del monolito `public/registros/engine.js` y su acuerdo con
   el GAS (`GAS/Code.gs`), extrayendo el código REAL de ambos fuentes.

   Contexto (2026-08): se añaden Flacidez, Necrosis y Disparidad. Van DESPUÉS de la
   columna "ID", no antes: el payload se escribe por POSICIÓN desde la columna 1, así
   que colocarlas en medio obligaría a reordenar a mano la hoja de producción y a
   desplazar el histórico. Como consecuencia el ID deja de ser la última columna, y el
   upsert del GAS pasa a localizarlo por su cabecera.

   Dos trampas que estas pruebas vigilan:
   · `LIMITS.ast.maxCols` no es sólo una validación: el GAS RECORTA las filas a ese
     ancho en silencio. Con el 25 anterior, un payload de 27 perdía el ID y cada
     sincronización habría DUPLICADO la fila en vez de actualizarla.
   · `ensureHeaders` debe aplicarse al AsT o las 3 columnas nunca se crearían.
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

  it('Flacidez/Necrosis/Disparidad van al final, DESPUÉS de ID', () => {
    const { headers } = buildPayload(registro());
    expect(headers.slice(23)).toEqual(['ID', 'Flacidez', 'Necrosis', 'Disparidad']);
    expect(headers).toHaveLength(27);
  });

  it('cada fila lleva 27 celdas y los valores nuevos en su sitio', () => {
    const { rows } = buildPayload(registro());
    expect(rows[0]).toHaveLength(27);
    expect(rows[0][23]).toBe('AST-001');   // ID
    expect(rows[0].slice(24)).toEqual([7, 8, 9]);
  });

  it('un campo vacío viaja como celda vacía, no como 0', () => {
    const { rows } = buildPayload(registro({ flacidez: '', necrosis: null, disparidad: undefined }));
    expect(rows[0].slice(24)).toEqual(['', '', '']);
  });

  it('un valor no numérico se descarta en vez de ensuciar la hoja', () => {
    const { rows } = buildPayload(registro({ flacidez: 'abc' }));
    expect(rows[0][24]).toBe('');
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

  it('doPost aplica ensureHeaders al AsT (o las columnas nuevas no se crearían)', () => {
    const cond = /if \((isMicro[^)]*)\) ensureHeaders/.exec(gas)[1];
    const evaluar = (flags) => {
      const ctx = {
        isMicro: false, isCal: false, isPat: false, isAlgas: false, isMarea: false, isAst: false, ...flags,
      };
      ctx.globalThis = ctx;
      createContext(ctx);
      return new Script('(' + cond + ')').runInContext(ctx);
    };
    expect(evaluar({ isAst: true })).toBe(true);
    expect(evaluar({})).toBe(false);
  });

  it('el upsert localiza el ID por su CABECERA, no asumiendo la última columna', () => {
    // Regresión directa: con `idCol = widest - 1` el ID caería en "Disparidad" y cada
    // sincronización añadiría una fila nueva en lugar de actualizar la existente.
    const upsert = bloque(gas, 'function upsertAstRows(ws, newRows) {', '\n}');
    const { headers, rows } = buildPayload(registro());

    const grid = [headers.slice(0, 24)];                        // hoja heredada: hasta ID
    const previa = new Array(24).fill(''); previa[0] = '2026-08-01'; previa[23] = 'AST-001';
    grid.push(previa);
    let maxCols = 24;
    const ws = {
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
    const ctx = { String, Number, Object, Array, Math, fmtData: () => {}, lastRow: (w) => w.getLastRow() };
    ctx.globalThis = ctx;
    createContext(ctx);
    new Script(upsert + '\n;globalThis.__up = upsertAstRows;').runInContext(ctx);

    const res = ctx.__up(ws, rows.map((r) => r.slice()));
    expect(res).toEqual({ upserted: 1, appended: 0 });  // ACTUALIZA la fila, no la duplica
    expect(grid).toHaveLength(2);                        // cabecera + 1 fila, sin duplicado
    expect(grid[1][23]).toBe('AST-001');                 // el ID sigue emparejando
    expect(grid[1].slice(24, 27)).toEqual([7, 8, 9]);    // y los valores nuevos aterrizan
  });

  it('una hoja heredada SIN cabecera "ID" no rompe: cae al comportamiento anterior', () => {
    const upsert = bloque(gas, 'function upsertAstRows(ws, newRows) {', '\n}');
    const { headers, rows } = buildPayload(registro());
    const grid = [headers.slice(0, 23).concat(['Sesión'])];
    let maxCols = 24;
    const ws = {
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
    const ctx = { String, Number, Object, Array, Math, fmtData: () => {}, lastRow: (w) => w.getLastRow() };
    ctx.globalThis = ctx;
    createContext(ctx);
    new Script(upsert + '\n;globalThis.__up = upsertAstRows;').runInContext(ctx);
    expect(() => ctx.__up(ws, rows.map((r) => r.slice()))).not.toThrow();
  });
});
