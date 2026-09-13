/* ============================================================
   MADURACIÓN · el UPSERT del GAS para las tres hojas por «ID» (2026-09-09)

   ── QUÉ COSTURA CUBRE ──────────────────────────────────────
   `Maduración Ingreso`, `Maduración Movimientos` y `Maduración Fin de Ciclo`
   llevan una columna `ID` determinista en la ÚLTIMA posición y viajan por
   `upsertAstRows`, la misma función que usan el AsT y Traslado. Pero NO quieren
   lo mismo que ellos:

     · AsT y Traslado mandan el registro COMPLETO desde el almacén local del
       dispositivo, así que la fila entrante es la verdad entera y REEMPLAZARLA
       es lo correcto.
     · Las tres de Maduración VACÍAN su formulario al guardar. Volver a esa fila
       para completar un dato posterior —el metabisulfito de un cierre, que «puede
       no ser» del día del cierre, decisión del usuario del 2026-09-08— manda todo
       lo demás EN BLANCO.

   🔴🔴 EL DEFECTO QUE ESTA BATERÍA CIERRA. Hasta el 2026-09-09 las tres iban por
   la rama de REEMPLAZO, mientras el fuente del cliente afirmaba en DOS sitios
   —`madFinKg` en el monolito y su gemelo en `ficha-maduracion-fin-ciclo.schema.js`—
   que devolvían vacío «para que el MERGE del GAS conserve la celda». El merge no
   existía. Completar el metabisulfito borraba Machos, Hembras, Tipo y
   Observaciones de ese cierre, y con ellos su descuento del libro mayor, sin un
   solo síntoma. Ninguna prueba lo veía porque ninguna ejercía DOS envíos al mismo
   ID con el segundo incompleto.

   🔑 LO QUE HACE QUE ESTO PRUEBE ALGO. La misma fila, el mismo ID y el mismo
   segundo envío se corren por las DOS ramas: con `merge` y sin él. Si el fixture
   no distinguiera una regla de la otra, el caso «sin merge» saldría verde también
   — y es justo lo que NO puede pasar (ver `feedback_fixtures-que-no-prueban-nada`).

   ⚠ Que esta batería pase NO significa que el GAS esté desplegado: pegarlo en
   Apps Script es un paso manual del usuario.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { MAD_FIN_HEADERS, buildFinRows } from './ficha-maduracion-fin-ciclo.schema.js';
import { MAD_INGRESO_SHEET } from './ficha-maduracion-ingreso.schema.js';
import { MAD_MOV_SHEET } from './ficha-maduracion-movimientos.schema.js';
import { MAD_FIN_SHEET } from './ficha-maduracion-fin-ciclo.schema.js';

const GAS = new URL('../../../../GAS/Code.gs', import.meta.url);
const gasSrc = readFileSync(GAS, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 60));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 60));
  return src.slice(i, j + hasta.length);
}

/* ── El GAS de verdad, en una caja ─────────────────────────── */
function motorGas() {
  const code = bloque(gasSrc, 'function lastRow(ws) {', '\n}')
    + '\n' + bloque(gasSrc, 'function filasUniformes(filas) {', '\n}')
    + '\n' + bloque(gasSrc, 'function upsertAstRows(ws, newRows, merge) {',
      '  return { upserted: updated, appended: added };\n}');
  // `fmtData` sólo pinta; no decide dónde va ninguna fila. Lo que se prueba es el
  // EMPAREJADO y qué celda gana.
  const ctx = { String, Number, Object, Array, JSON, Math, isFinite, Date, fmtData() {} };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__up = upsertAstRows;').runInContext(ctx);
  return ctx.__up;
}

/* ── Hoja de Google falsa, con lo justo que usa upsertAstRows ── */
function hojaFalsa(headers) {
  const filas = [headers.slice()];
  return {
    _filas: filas,
    getLastColumn: () => (filas[0] ? filas[0].length : 0),
    getLastRow: () => filas.length,
    getMaxColumns: () => 60,
    insertColumnsAfter() {},
    getDataRange: () => ({ getValues: () => filas.map((f) => f.slice()) }),
    getRange(r, c, nR, nC) {
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < nR; i++) out.push((filas[r - 1 + i] || []).slice(c - 1, c - 1 + nC));
          return out;
        },
        setValues: (vals) => {
          vals.forEach((v, i) => {
            const fila = filas[r - 1 + i] || (filas[r - 1 + i] = []);
            v.forEach((cell, k) => { fila[c - 1 + k] = cell; });
          });
        },
      };
    },
  };
}

/* El cierre COMPLETO tal como lo construye la ficha el día que se registra. */
const cierreCompleto = () => buildFinRows({
  fecha: '2026-09-09',
  cierres: [{
    lote: 'AB', tipo: 'Total', motivo: 'Pedido',
    machos: '120', hembras: '340',
    observaciones: 'Salieron por la mañana',
  }],
});

/* El MISMO cierre revisitado días después, sólo para anotar el metabisulfito.
   La ficha se vació al guardar, así que lo demás va en blanco: es el envío real,
   no uno inventado para que la prueba salga bien. */
const soloMetabisulfito = () => buildFinRows({
  fecha: '2026-09-09',
  cierres: [{
    lote: 'AB', motivo: 'Pedido',
    metabisulfito: '8.5', fechaMetabisulfito: '2026-09-12',
  }],
});

const col = (h) => MAD_FIN_HEADERS.indexOf(h);

describe('GAS · las tres hojas de Maduración por ID se FUSIONAN, no se reemplazan', () => {
  it('el fixture no está degenerado: los dos envíos comparten ID y el segundo va incompleto', () => {
    const a = cierreCompleto();
    const b = soloMetabisulfito();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    const idc = col('ID');
    expect(idc).toBe(MAD_FIN_HEADERS.length - 1);       // el ID es la ÚLTIMA columna
    expect(a[0][idc]).toBe(b[0][idc]);                  // misma llave → misma fila
    // Y el segundo envío llega VACÍO justo en lo que el defecto borraba.
    for (const h of ['Machos', 'Hembras', 'Tipo', 'Observaciones']) {
      expect(a[0][col(h)], h + ' del primer envío').not.toBe('');
      expect(b[0][col(h)], h + ' del segundo envío').toBe('');
    }
  });

  it('CON merge: completar el metabisulfito NO borra los animales del cierre', () => {
    const up = motorGas();
    const ws = hojaFalsa(MAD_FIN_HEADERS);
    up(ws, cierreCompleto(), true);
    const r2 = up(ws, soloMetabisulfito(), true);

    expect(ws._filas).toHaveLength(2);                  // cabecera + UNA fila
    expect(r2).toEqual({ upserted: 1, appended: 0 });
    const f = ws._filas[1];
    expect(f[col('Machos')]).toBe(120);
    expect(f[col('Hembras')]).toBe(340);
    expect(f[col('Tipo')]).toBe('Total');
    expect(f[col('Observaciones')]).toBe('Salieron por la mañana');
    // …y lo que sí traía el segundo envío entra:
    expect(f[col('Metabisulfito (kg)')]).toBe(8.5);
    expect(f[col('Fecha aplicación')]).toBe('2026-09-12');
  });

  /* 🔑 LA MITAD QUE HACE QUE LO DE ARRIBA SIGNIFIQUE ALGO: por la rama vieja el
     mismo caso PIERDE los datos. Sin esta prueba, la anterior saldría verde
     aunque `merge` no hiciera nada. */
  it('SIN merge (la rama de AsT y Traslado) el mismo caso BORRA los animales', () => {
    const up = motorGas();
    const ws = hojaFalsa(MAD_FIN_HEADERS);
    up(ws, cierreCompleto(), false);
    up(ws, soloMetabisulfito(), false);
    const f = ws._filas[1];
    expect(f[col('Machos')]).toBe('');
    expect(f[col('Hembras')]).toBe('');
    expect(f[col('Observaciones')]).toBe('');
  });

  /* El merge conserva lo VACÍO, no lo FALSO: un 0 es una medición —«hoy no salió
     ninguno»— y tiene que pisar el valor anterior. De esta distinción dependen
     `madFinKg` y `madIngInt`, que devuelven "" cuando no hay cifra y 0 cuando la hay. */
  it('un 0 SÍ escribe 0 con merge: lo que conserva es el vacío, no el cero', () => {
    const up = motorGas();
    const ws = hojaFalsa(MAD_FIN_HEADERS);
    up(ws, cierreCompleto(), true);
    up(ws, buildFinRows({
      fecha: '2026-09-09',
      cierres: [{ lote: 'AB', motivo: 'Pedido', machos: '0', hembras: '0' }],
    }), true);
    const f = ws._filas[1];
    expect(f[col('Machos')]).toBe(0);
    expect(f[col('Hembras')]).toBe(0);
    expect(f[col('Observaciones')]).toBe('Salieron por la mañana');   // lo vacío sigue conservándose
  });

  it('con merge, dos filas del MISMO envío se fusionan igual que dos envíos seguidos', () => {
    const up = motorGas();
    const ws = hojaFalsa(MAD_FIN_HEADERS);
    // Un solo lote de escritura con las dos versiones del mismo cierre.
    const r = up(ws, cierreCompleto().concat(soloMetabisulfito()), true);
    expect(ws._filas).toHaveLength(2);
    expect(r.appended).toBe(1);
    const f = ws._filas[1];
    expect(f[col('Machos')]).toBe(120);
    expect(f[col('Metabisulfito (kg)')]).toBe(8.5);
  });

  /* 🔑 LA OTRA MITAD DE LO MISMO, y vive en la RAMA CONTRARIA de la función: cuando la
     fila YA está en la hoja. `upsertAstRows` toma UNA foto (`data`) al entrar, así que sin
     actualizarla las dos filas del envío se fusionarían contra la versión VIEJA y la
     segunda borraría lo que aportó la primera — mientras que dos envíos SEGUIDOS acumulan
     bien. El caso de arriba (fila nueva) y éste (fila existente) tienen que dar lo mismo.
     ⚠ Hoy es inalcanzable desde la interfaz —los validadores rechazan dos filas con la
     misma llave— pero una guarda del cliente no es una propiedad del servidor. */
  it('con merge, dos filas del mismo envío ACUMULAN también sobre una fila ya existente', () => {
    const up = motorGas();
    const ws = hojaFalsa(MAD_FIN_HEADERS);
    up(ws, cierreCompleto(), true);                       // la fila ya está en la hoja
    const soloMachos = buildFinRows({
      fecha: '2026-09-09',
      cierres: [{ lote: 'AB', motivo: 'Pedido', machos: '99' }],
    });
    up(ws, soloMetabisulfito().concat(soloMachos), true);  // dos filas, mismo ID, mismo envío

    expect(ws._filas).toHaveLength(2);
    const f = ws._filas[1];
    expect(f[col('Metabisulfito (kg)')], 'lo que aportó la PRIMERA fila del envío').toBe(8.5);
    expect(f[col('Machos')], 'lo que aportó la SEGUNDA').toBe(99);
    expect(f[col('Hembras')], 'y lo que ya había sigue ahí').toBe(340);
    expect(f[col('Tipo')]).toBe('Total');
  });
});

/* ── El ENRUTADO, leído del GAS real ────────────────────────
   Las pruebas de arriba demuestran qué hace `merge`; ésta demuestra que las tres
   hojas lo RECIBEN y que AsT y Traslado NO. Sin ella, `merge` podría funcionar
   perfectamente y no estar cableado a nadie. */
describe('GAS · el enrutado de doPost pasa merge sólo donde toca', () => {
  it('las tres hojas del registro operativo están en isMadId', () => {
    const bloqueId = bloque(gasSrc, 'var isMadId = payload.sheetName', ';\n');
    for (const hoja of [MAD_INGRESO_SHEET, MAD_MOV_SHEET, MAD_FIN_SHEET]) {
      expect(bloqueId, hoja + ' no entra en isMadId').toContain('"' + hoja + '"');
    }
  });

  it('isMadId llama a upsertAstRows CON merge; AsT y Traslado SIN él', () => {
    expect(gasSrc).toContain('else if (isMadId)  result = upsertAstRows(ws, rows, true);');
    expect(gasSrc).toContain('else if (isAst)    result = upsertAstRows(ws, rows);');
    expect(gasSrc).toContain('else if (isTras)   result = upsertAstRows(ws, rows);');
  });

  it('las tres hojas están en el ALLOWED del GAS', () => {
    const allowed = bloque(gasSrc, 'const ALLOWED = [', '];');
    for (const hoja of [MAD_INGRESO_SHEET, MAD_MOV_SHEET, MAD_FIN_SHEET]) {
      expect(allowed, hoja + ' no está permitida').toContain('"' + hoja + '"');
    }
  });
});

/* ── El recorte de sheetRows deja de ser mudo ───────────────
   El libro mayor SUMA sobre lo que devuelve `?p=rows`. Si la lectura se corta en
   seco, el saldo sale corto y la vista no tiene forma de saberlo: es el defecto A1
   de la auditoría del 09-08 (una lectura incompleta tomada por completa) con otra
   causa. `Maduración Tanques` crece hasta 38 filas/día, así que el tope se alcanza. */
describe('GAS · sheetRows avisa cuando ha RECORTADO', () => {
  it('el recorte se marca en la respuesta, no en silencio', () => {
    const fn = bloque(gasSrc, 'function sheetRows(name, t, cols) {', '\n}');
    expect(fn, 'el tope ya no se comprueba en la condición del bucle')
      .toContain('if (rows.length >= TOPE_FILAS) { cortada = true; break; }');
    expect(fn, 'la respuesta no declara el recorte')
      .toContain('if (cortada) { out.truncated = true; out.limit = TOPE_FILAS; }');
  });
});
