/* ============================================================
   PUNTO 6 de la pauta del 24-11 (usuario: «Que lo vacío se vacíe en la hoja») · el GAS de Lab_Algas.
   La fila de la hoja es el registro ENTERO de una sola ficha (clave = «Sesión», la última columna): al corregirlo,
   una celda que llega VACÍA vacía la de la hoja (antes conservaba lo viejo y la app decía «actualizado»).
   Corre el upsertAlgasRows REAL de GAS/Code.gs contra una hoja simulada (mismo arnés que ast-payload.test.js).
   Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const GAS = new URL('../../../../GAS/Code.gs', import.meta.url);
const gas = readFileSync(GAS, 'utf8').split('\r\n').join('\n');
function bloque(desde, hasta) {
  const i = gas.indexOf(desde), j = gas.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error('Ancla no encontrada: ' + desde);
  return gas.slice(i, j + hasta.length);
}
function hojaSimulada(grid) {
  let maxCols = grid[0].length;
  return {
    getMaxColumns: () => maxCols,
    insertColumnsAfter: (_a, n) => { maxCols += n; },
    getLastColumn: () => grid[0].length,
    getLastRow: () => grid.length,
    getDataRange: () => ({ getValues: () => grid.map((r) => r.slice()) }),
    getRange: (row, col, nR, nC) => ({
      getValues: () => Array.from({ length: nR || 1 }, (_, i) => Array.from({ length: nC || 1 }, (_2, c) => ((grid[row - 1 + i] || [])[col - 1 + c] ?? ''))),
      setValues: (vals) => { vals.forEach((v, i) => { const ri = row - 1 + i; while (grid.length <= ri) grid.push([]); v.forEach((cell, c) => { grid[ri][col - 1 + c] = cell; }); }); },
    }),
  };
}
function correr(grid, rows) {
  const code = bloque('function filasUniformes(filas) {', '\n}')
    + '\n' + bloque('function madFormatosFijos_(', '\n}')
    + '\n' + bloque('function escribirActualizadas_(ws, pendientes, trovanCol, numCol, isCtrl) {', '\n}')
    + '\n' + bloque('function upsertAlgasRows(ws, newRows) {', '\n}');
  const ctx = { String, Number, Object, Array, Math, fmtData: () => {}, lastRow: (w) => w.getLastRow() };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__up = upsertAlgasRows;').runInContext(ctx);
  return ctx.__up(hojaSimulada(grid), rows.map((r) => r.slice()));
}

// Cabecera ficticia: Fecha · Cel/mL · Obs · Sesión (la última, la clave) · y una columna añadida a mano en la hoja.
describe('punto 6 · Lab_Algas: una corrección vacía lo que llega vacío', () => {
  it('🔴 las Cel/mL borradas al corregir se BORRAN en la hoja; lo demás toma lo nuevo', () => {
    const grid = [['Fecha', 'Cel/mL', 'Obs', 'Sesión', 'Nota a mano'], ['2026-11-20', '120', 'texto viejo', 'S1', 'de la hoja']];
    const res = correr(grid, [['2026-11-20', '', 'texto nuevo', 'S1']]);
    expect(res.upserted).toBe(1);
    expect(grid[1]).toEqual(['2026-11-20', '', 'texto nuevo', 'S1', 'de la hoja']);   // la columna a mano, intacta
  });
  it('la Sesión no se pierde aunque llegue vacía, y otra Sesión es fila nueva', () => {
    const grid = [['Fecha', 'Cel/mL', 'Sesión'], ['2026-11-20', '5', 'S1']];
    correr(grid, [['2026-11-21', '7', 'S2']]);
    expect(grid).toHaveLength(3);
    expect(grid[1]).toEqual(['2026-11-20', '5', 'S1']);
  });
});
