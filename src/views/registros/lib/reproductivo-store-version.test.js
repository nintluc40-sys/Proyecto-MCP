// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · el puente del MCP da la VERSIÓN del store del tablero (1a, 2026-09-21)

   El motor anota esa versión al leer la MATRIZ de Google y, mientras no cambie, lo leído de la hoja manda sobre el
   store (que puede ser anterior al alta de un chip reciclado). Las pruebas del motor la SIMULAN, así que el puente real
   se prueba aquí: si devolviera siempre lo mismo, lo leído mandaría para siempre aunque el tablero se recargara; si
   devolviera algo nuevo en cada llamada, no mandaría nunca y el chip reciclado volvería a salir «ya muerta».
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { store } from '../../../core/store.js';

beforeAll(async () => { await import('../index.js'); });

describe('registros · el puente expone la versión del store', () => {
  it('es la misma mientras el tablero no se recarga, y otra en cuanto se recarga', () => {
    const lib = window.__rgLib;
    store.globalData = [{ _SheetOrigin: 'Maduración MATRIZ', 'Trovan ID': '000721AAA1' }];
    const v1 = lib.reproStoreVersion();
    expect(lib.reproStoreVersion()).toBe(v1);
    expect(lib.reproReadSheet('Maduración MATRIZ')).toHaveLength(1);
    store.globalData = [...store.globalData];      // el tablero se recarga: el array se sustituye entero
    expect(lib.reproStoreVersion()).not.toBe(v1);
    store.globalData = [];
  });
});
