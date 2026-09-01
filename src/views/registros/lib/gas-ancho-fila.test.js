/* ============================================================
   GAS · todas las rutas de escritura dejan las filas del MISMO ancho

   `setValues` de Apps Script exige que el bloque de datos mida exactamente lo que el
   rango: si una sola fila viene más corta, falla la escritura ENTERA y el error no
   dice cuál fue. Hasta el 2026-08-30 tres de las rutas del GAS —`upsertRows`,
   `appendRows` y `upsertMadRows`— tomaban el ancho de la PRIMERA fila y daban por
   hecho que las demás medían igual, y `upsertAlgasRows` usaba el ancho correcto pero
   no rellenaba las cortas. Eso era cierto sólo porque los constructores del cliente
   emiten filas uniformes: una propiedad del OTRO lado del contrato.

   Ahora las seis rutas comparten `filasUniformes`.

   🔑 LA HOJA SIMULADA VALIDA LAS DIMENSIONES, igual que la de verdad. Sin eso esta
   prueba no probaría nada: aceptaría el bloque desigual y saldría verde con el defecto
   dentro — el error de manual de este proyecto (ver `feedback_fixtures-que-no-prueban-nada`).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const GAS = new URL('../../../../GAS/Code.gs', import.meta.url);
const gas = readFileSync(GAS, 'utf8').split('\r\n').join('\n');

function bloque(desde, hasta) {
  const i = gas.indexOf(desde);
  if (i < 0) throw new Error('ancla de inicio no hallada: ' + desde.slice(0, 40));
  const j = gas.indexOf(hasta, i);
  if (j < 0) throw new Error('ancla de fin no hallada: ' + hasta.slice(0, 40));
  return gas.slice(i, j + hasta.length);
}

/* ── Hoja de Google falsa que se comporta como la de verdad en lo que importa ──
   Lo esencial: setValues RECHAZA un bloque cuyas filas no midan todas lo mismo que el
   rango, que es exactamente lo que hace Apps Script. */
function hojaFalsa(filas) {
  const rejilla = filas.map((f) => f.slice());
  let maxCols = Math.max(30, ...rejilla.map((f) => f.length));
  return {
    _rejilla: rejilla,
    getLastRow: () => rejilla.length,
    getLastColumn: () => (rejilla[0] ? rejilla[0].length : 0),
    getMaxColumns: () => maxCols,
    insertColumnsAfter: (_tras, n) => { maxCols += n; },
    getDataRange: () => ({ getValues: () => rejilla.map((f) => f.slice()) }),
    getRange(fila, col, nFilas, nCols) {
      /* Apps Script RECHAZA un rango de cero filas o cero columnas («The number of
         rows in the range must be at least 1»). Emularlo no es un adorno: sin esto,
         la hoja falsa aceptaba el rango vacío y la prueba daba por buena una versión
         de `appendRows` SIN su guarda de lista vacía — una mutación viva. */
      if (nFilas < 1 || nCols < 1) {
        throw new Error(`getRange: el rango pide ${nFilas} fila(s) x ${nCols} columna(s); el mínimo es 1x1`);
      }
      return {
        setValues(v) {
          if (v.length !== nFilas) {
            throw new Error(`setValues: el rango pide ${nFilas} fila(s) y llegaron ${v.length}`);
          }
          v.forEach((f, k) => {
            if (f.length !== nCols) {
              throw new Error(
                `setValues: el rango pide ${nCols} columna(s) y la fila ${k} trae ${f.length}`,
              );
            }
            while (rejilla.length < fila - 1 + k + 1) rejilla.push([]);
            rejilla[fila - 1 + k] = f.slice();
          });
          return this;
        },
        setNumberFormat() { return this; },
        getValues: () => [],
        getDisplayValues: () => [],
      };
    },
  };
}

/* Contexto con las piezas REALES que cada ruta necesita. */
function motor(extra = []) {
  const code = [
    bloque('function filasUniformes(filas) {', '\n}'),
    bloque('function lastRow(ws) {', '\n}'),
    ...extra,
  ].join('\n');
  const ctx = { String, Number, Object, Array, Math, JSON, Date, isFinite, fmtData() {} };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { filasUniformes, ' + extra.map(nombreDe).join(', ') + ' };')
    .runInContext(ctx);
  return ctx.__api;
}
function nombreDe(src) {
  return /function\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(src)[1];
}

describe('GAS · ancho uniforme de fila', () => {
  describe('filasUniformes', () => {
    const { filasUniformes } = motor();

    it('rellena con vacío las filas cortas hasta la más ancha', () => {
      const r = filasUniformes([['a', 'b', 'c'], ['d']]);
      expect(r.ancho).toBe(3);
      expect(r.filas).toEqual([['a', 'b', 'c'], ['d', '', '']]);
    });

    it('recorta las que se pasan', () => {
      const r = filasUniformes([['a', 'b'], ['c', 'd', 'e', 'f']]);
      expect(r.ancho).toBe(4);
      expect(r.filas[0]).toEqual(['a', 'b', '', '']);
      expect(r.filas[1]).toEqual(['c', 'd', 'e', 'f']);
    });

    it('deja intacto lo que ya es uniforme', () => {
      const dentro = [['a', 'b'], ['c', 'd']];
      const r = filasUniformes(dentro);
      expect(r.filas).toEqual(dentro);
    });

    it('NO muta lo que recibe', () => {
      const dentro = [['a', 'b', 'c'], ['d']];
      filasUniformes(dentro);
      expect(dentro[1]).toEqual(['d']);
    });

    it('con una lista vacía devuelve ancho 0 y no revienta', () => {
      expect(filasUniformes([])).toEqual({ filas: [], ancho: 0 });
    });
  });

  describe('appendRows', () => {
    const api = motor([bloque('function appendRows(ws, newRows) {', '\n}')]);

    it('🔴 escribe un bloque DESIGUAL sin que la hoja lo rechace', () => {
      const ws = hojaFalsa([['h1', 'h2', 'h3']]);
      // La 2ª fila viene corta: con el ancho tomado de la 1ª, esto reventaba.
      expect(() => api.appendRows(ws, [['a', 'b', 'c'], ['d']])).not.toThrow();
      expect(ws._rejilla[2]).toEqual(['d', '', '']);
    });

    it('también cuando la corta es la PRIMERA', () => {
      const ws = hojaFalsa([['h1', 'h2', 'h3']]);
      expect(() => api.appendRows(ws, [['a'], ['b', 'c', 'd']])).not.toThrow();
      expect(ws._rejilla[1]).toEqual(['a', '', '']);
      expect(ws._rejilla[2]).toEqual(['b', 'c', 'd']);
    });

    it('con lista vacía no escribe nada ni falla', () => {
      const ws = hojaFalsa([['h1']]);
      expect(api.appendRows(ws, [])).toEqual({ upserted: 0, appended: 0 });
    });
  });

  describe('upsertRows (Datos Larvicultura / Control_Tanque)', () => {
    const api = motor([
      bloque('function dStr(val) {', '\n}'),
      bloque('function timeStr(val) {', '\n}'),
      bloque('function rowKey(row, isCtrl, horaStr) {', '\n}'),
      bloque('function inKey(row, isCtrl) {', '\n}'),
      bloque('function upsertRows(ws, newRows, isCtrl) {', '  return { upserted: updated, appended: added };\n}'),
    ]);

    it('🔴 añade filas de anchos distintos sin romper la escritura', () => {
      // Cabecera de 5; la fila nueva "corta" simula una celda que el cliente omitiera.
      const ws = hojaFalsa([['Fecha', 'Corrida', 'Módulo', 'Tanque', 'Dato']]);
      const filas = [
        ['2026-08-30', '552', 'M01', 'TQ 1', 'x'],
        ['2026-08-30', '552', 'M01', 'TQ 2'],
      ];
      expect(() => api.upsertRows(ws, filas, false)).not.toThrow();
      expect(ws._rejilla[2]).toEqual(['2026-08-30', '552', 'M01', 'TQ 2', '']);
    });
  });

  describe('upsertMadRows (Maduración / Desinfección)', () => {
    const api = motor([
      bloque('function madRowKey(row, keyCols) {', '\n}'),
      bloque('function madInKey(row, keyCols) {', '\n}'),
      bloque('function upsertMadRows(ws, newRows, keyCols, trovanCol, numCol) {', '  return { upserted: updated, appended: added };\n}'),
    ]);

    it('🔴 añade filas de anchos distintos sin romper la escritura', () => {
      const ws = hojaFalsa([['Fecha', 'Sala', 'Fila', 'Dato']]);
      const filas = [
        ['2026-08-30', 'A', '1', 'x'],
        ['2026-08-30', 'A', '2'],
      ];
      expect(() => api.upsertMadRows(ws, filas, [0, 1, 2], -1, -1)).not.toThrow();
      expect(ws._rejilla[2]).toEqual(['2026-08-30', 'A', '2', '']);
    });
  });
});
