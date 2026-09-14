/* ============================================================
   GAS · el reemplazo por CLAVE nunca borra a ciegas (D9, 2026-09-14)

   `replaceByKeyRows` sirve a cinco hojas —BIOMOL, Microbiología, Calidad de Agua,
   Patología en Fresco y Marea—: borra las filas cuya clave coincide con alguna del envío y
   añade las nuevas. La clave son índices de columna que manda el CLIENTE en
   `payload.keyCols`, y hasta el 2026-09-14 no se comprobaba nada de ellos:

     · `keyCols: []`, o un índice que no existe en la fila (999, -1, el -1 de un
       `indexOf` que no encuentra «Sesión»), daba la clave "" a TODAS las filas de la hoja,
       así que UN envío vaciaba la hoja entera;
     · una fila con la clave entera en blanco borraba todas las filas de clave vacía — y
       en BIOMOL la «Sesión» vacía es justo la de las filas escritas antes de existir esa
       columna. `bioSesEtiqueta` devuelve "" cuando no encuentra su sesión.

   Con la escritura anónima abierta, las dos cosas estaban al alcance de cualquiera que
   tuviera la URL del despliegue.

   🔑 La regla es la que ya tenía su hermana `replaceByDateRows` («si no llega fecha, cae a
   append puro: nunca borra a ciegas»): un `keyCols` inválido cae a APPEND puro, y una fila
   de clave vacía se AÑADE sin reemplazar nada. Lo peor que puede pasar es un duplicado
   visible, nunca un borrado. Las claves PARCIALES siguen valiendo: una Corrida vacía con su
   Sesión es una clave legítima de Microbiología.

   Se ejecuta el `Code.gs` ENTERO por `doPost`, no la función suelta: así se prueba también
   que las rutas de las hojas la llaman.
   ⚠ Que esto pase NO despliega nada: publicar el GAS es un paso manual del usuario.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const gasSrc = readFileSync(new URL('../../../../GAS/Code.gs', import.meta.url), 'utf8').split('\r\n').join('\n');

/* ── Hoja de Google falsa: guarda las filas y apunta cada escritura ── */
function hojaFalsa(filasIniciales) {
  const filas = filasIniciales.map((f) => f.slice());
  const escrituras = [];
  const cadena = () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => cadena()) });
  return {
    filas, escrituras,
    getLastRow: () => filas.length,
    getLastColumn: () => filas.reduce((m, f) => Math.max(m, f.length), 0),
    getMaxColumns: () => 60,
    getMaxRows: () => 1000,
    insertRowsAfter() {},
    insertColumnsAfter() {},
    setFrozenRows() {},
    appendRow(v) { escrituras.push('appendRow'); filas.push(v.slice()); },
    deleteRows(r, n) { escrituras.push('deleteRows@' + r + 'x' + n); filas.splice(r - 1, n); },
    getDataRange: () => ({ getValues: () => filas.map((f) => f.slice()) }),
    getRange(r, c, nR = 1, nC = 1) {
      const rango = {
        getValues: () => {
          const out = [];
          for (let i = 0; i < nR; i++) {
            const f = filas[r - 1 + i] || [];
            const fila = [];
            for (let k = 0; k < nC; k++) fila.push(f[c - 1 + k] === undefined ? '' : f[c - 1 + k]);
            out.push(fila);
          }
          return out;
        },
        setValues: (vals) => {
          escrituras.push('setValues@' + r);
          vals.forEach((v, i) => {
            const fila = filas[r - 1 + i] || (filas[r - 1 + i] = []);
            v.forEach((cell, k) => { fila[c - 1 + k] = cell; });
          });
          return cadena();
        },
      };
      return new Proxy(rango, { get: (t, k) => (k in t ? t[k] : () => cadena()) });
    },
  };
}

/* ── El GAS real, entero, con los servicios de Apps Script simulados ── */
function gas(hojas) {
  const cache = new Map();
  const ctx = {
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (n) => hojas[n] || null, insertSheet: (n) => (hojas[n] = hojaFalsa([])) }),
      flush() {},
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: { sleep() {}, formatDate: (d) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'America/Guayaquil' },
    Logger: { log() {} },
    console: { error() {}, log() {} },
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(gasSrc + '\n;globalThis.__doPost = doPost;').runInContext(ctx);
  let n = 0;
  return (payload) => ctx.__doPost({
    postData: { contents: JSON.stringify(Object.assign({ reqId: 'd9-' + (n++) }, payload)) },
    parameter: { z: 'd9-' + n },
  });
}

/* ── BIOMOL en pequeño: la clave es la columna «Sesión» (índice 2) ──
   Dos filas de S1, una de S2 y DOS HEREDADAS con la Sesión vacía, como las que se escribieron
   antes de existir la columna. Tamaños distintos a propósito: un borrado de más o de menos
   cambia la cuenta. */
const BIO_CAB = ['Fecha', 'Código', 'Sesión'];
const bioHoja = () => hojaFalsa([
  BIO_CAB,
  ['2026-09-01', 'A-1', 'S1'],
  ['2026-09-01', 'A-2', 'S1'],
  ['2026-09-02', 'B-1', 'S2'],
  ['2026-08-10', 'HEREDADA-1', ''],
  ['2026-08-11', 'HEREDADA-2', ''],
]);
const codigos = (hoja) => hoja.filas.slice(1).map((f) => f[1]);
const bioPost = (hoja, rows, keyCols = [2]) =>
  gas({ BIOMOL: hoja })({ sheetName: 'BIOMOL', headers: BIO_CAB, rows, replaceKey: true, keyCols });

describe('GAS · replaceByKeyRows · el fixture ejerce el reemplazo', () => {
  it('una sesión con clave reemplaza SUS filas y deja intactas las demás y las heredadas', () => {
    const hoja = bioHoja();
    const r = bioPost(hoja, [['2026-09-01', 'A-NUEVA', 'S1']]);
    expect(r.status).toBe('ok');
    expect(r.upserted).toBe(2);                        // las dos filas viejas de S1
    expect(r.appended).toBe(1);
    expect(codigos(hoja)).toEqual(['B-1', 'HEREDADA-1', 'HEREDADA-2', 'A-NUEVA']);
  });
});

describe('GAS · replaceByKeyRows · una clave VACÍA no borra nada (D9)', () => {
  it('🔴 una fila con la Sesión en blanco NO borra las filas heredadas de Sesión vacía', () => {
    const hoja = bioHoja();
    const r = bioPost(hoja, [['2026-09-03', 'SIN-SESION', '']]);
    expect(r.status).toBe('ok');
    expect(hoja.escrituras.some((e) => e.startsWith('deleteRows'))).toBe(false);
    expect(r.upserted).toBe(0);
    expect(r.appended).toBe(1);                        // se añade: no se pierde el dato
    expect(codigos(hoja)).toEqual(['A-1', 'A-2', 'B-1', 'HEREDADA-1', 'HEREDADA-2', 'SIN-SESION']);
  });

  it('en un envío MIXTO, la fila con clave reemplaza y la de clave vacía sólo se añade', () => {
    const hoja = bioHoja();
    const r = bioPost(hoja, [['2026-09-02', 'B-NUEVA', 'S2'], ['2026-09-03', 'SIN-SESION', '']]);
    expect(r.upserted).toBe(1);                        // sólo la vieja de S2
    expect(r.appended).toBe(2);
    expect(codigos(hoja)).toEqual(['A-1', 'A-2', 'HEREDADA-1', 'HEREDADA-2', 'B-NUEVA', 'SIN-SESION']);
  });

  it('una clave hecha sólo de espacios cuenta como vacía (el GAS limpia cada celda)', () => {
    const hoja = bioHoja();
    bioPost(hoja, [['2026-09-03', 'ESPACIOS', '   ']]);
    expect(codigos(hoja)).toContain('HEREDADA-1');
    expect(codigos(hoja)).toContain('HEREDADA-2');
  });
});

describe('GAS · replaceByKeyRows · un keyCols inválido cae a APPEND puro (D9)', () => {
  /* ⚠ Los índices malos van ACOMPAÑADOS de uno bueno, y no por capricho: un índice malo SOLO
     deja la clave entera en blanco y lo para ya la otra guarda, así que no distinguiría si esta
     existe (lo cazó mutar-gas-replace-clave: K03 y K04 sobrevivían). Acompañado es el caso que
     hace daño —reemplazar por MEDIA clave, p. ej. todas las sesiones de un día—. */
  const INVALIDOS = [
    ['vacío', []],
    ['índice fuera de la fila', [999]],
    ['uno bueno y uno fuera de la fila', [2, 999]],
    ['uno bueno y uno negativo (el -1 de un indexOf que no encontró la columna)', [2, -1]],
    ['uno bueno y uno no entero', [2, 1.5]],
    ['índice escrito como texto', ['2']],
  ];
  for (const [nombre, keyCols] of INVALIDOS) {
    it(`🔴 keyCols ${nombre} → no borra NINGUNA fila y añade el envío`, () => {
      const hoja = bioHoja();
      const r = bioPost(hoja, [['2026-09-01', 'A-NUEVA', 'S1']], keyCols);
      expect(r.status).toBe('ok');
      expect(hoja.escrituras.some((e) => e.startsWith('deleteRows'))).toBe(false);
      expect(r.upserted).toBe(0);
      expect(codigos(hoja)).toEqual(['A-1', 'A-2', 'B-1', 'HEREDADA-1', 'HEREDADA-2', 'A-NUEVA']);
    });
  }
});

describe('GAS · replaceByKeyRows · las claves COMPUESTAS parciales siguen reemplazando', () => {
  /* Microbiología en pequeño: clave = Fecha · Corrida · Sesión (índices 0, 1, 3). Una
     Corrida vacía con su Sesión es una clave LEGÍTIMA —hay formatos sin corrida— y tiene
     que seguir reemplazando: una guarda que exigiera todas las partes llenas duplicaría
     cada reenvío de esos formatos. Sólo la clave ENTERA en blanco se trata como vacía. */
  const MIC_CAB = ['Fecha muestreo', 'Corrida', 'Formato', 'Sesión'];
  const micHoja = () => hojaFalsa([
    MIC_CAB,
    ['2026-09-05', '', 'Agua de mar', 'M1'],
    ['2026-09-05', '', 'Agua de mar', 'M2'],
    ['', '', 'Heredada', ''],
  ]);
  const micPost = (hoja, rows) =>
    gas({ 'Microbiología': hoja })({ sheetName: 'Microbiología', headers: MIC_CAB, rows, replaceKey: true, keyCols: [0, 1, 3] });

  it('una clave parcial (Corrida vacía) sigue reemplazando SÓLO su sesión', () => {
    const hoja = micHoja();
    const r = micPost(hoja, [['2026-09-05', '', 'Agua de mar (editada)', 'M1']]);
    expect(r.upserted).toBe(1);
    expect(hoja.filas.slice(1).map((f) => f[2])).toEqual(['Agua de mar', 'Heredada', 'Agua de mar (editada)']);
  });

  it('🔴 la clave compuesta ENTERA en blanco no borra la fila heredada', () => {
    const hoja = micHoja();
    const r = micPost(hoja, [['', '', 'Sin clave', '']]);
    expect(r.upserted).toBe(0);
    expect(hoja.filas.slice(1).map((f) => f[2])).toEqual(['Agua de mar', 'Agua de mar', 'Heredada', 'Sin clave']);
  });

  it('🔴 una fila MÁS CORTA que un índice de la clave invalida keyCols: nada se reemplaza por media clave', () => {
    /* La fila corta no trae la Sesión, así que su clave sería «2026-09-05||»: media clave, que
       casaría con cualquier fila heredada de ese día sin Sesión. El ancho que se exige es el de
       la fila MÁS CORTA del envío (los clientes mandan filas uniformes, construidas sobre la
       lista de columnas), y con dos filas de anchos distintos una regla que mirara la más
       LARGA dejaría pasar la corta: por eso el fixture lleva las dos. */
    const hoja = hojaFalsa([
      MIC_CAB,
      ['2026-09-05', '', 'Agua de mar', 'M1'],
      ['2026-09-05', '', 'Heredada del día', ''],
    ]);
    const r = micPost(hoja, [['2026-09-05', '', 'Agua de mar (editada)', 'M1'], ['2026-09-05', '', 'Corta']]);
    expect(hoja.escrituras.some((e) => e.startsWith('deleteRows'))).toBe(false);
    expect(r.upserted).toBe(0);
    expect(hoja.filas.slice(1).map((f) => f[2])).toEqual(['Agua de mar', 'Heredada del día', 'Agua de mar (editada)', 'Corta']);
  });
});
