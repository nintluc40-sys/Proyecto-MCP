/* ============================================================
   REGISTROS · Traslado — la IDENTIDAD de camiones y paradas (2026-08-25)

   Lo que esta batería vigila lo encontró una auditoría, y era pérdida SILENCIOSA:
   la llave de fila era POSICIONAL (`-c<índice>-r<índice>`), así que quitar un
   camión de un viaje ya sincronizado ascendía al siguiente y, en la siguiente
   sincronización, sus filas se escribían ENCIMA de las del que se fue. El camión
   desaparecía de la hoja y el GAS informaba de una actualización perfecta.

   Se ejecuta el código REAL de las dos mitades —`buildTrasPayload` de engine.js y
   `upsertAstRows` de GAS/Code.gs— sobre una hoja falsa. Reimplementar aquí la
   lógica sólo probaría la copia.

   🔑 La propiedad de fondo, en una frase: **el ID de una fila sólo depende de a QUÉ
   camión, QUÉ parada y QUÉ tina pertenece — nunca de cuántos vecinos tenga.**
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const GAS = new URL('../../../../GAS/Code.gs', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 50));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 50));
  return src.slice(i, j + hasta.length);
}

/* El monolito, en una caja. Dos trozos: el del payload y el de los helpers de
   «lo quitado», que viven más abajo junto a la validación parcial. */
function motorCliente() {
  const src = leer(ENGINE);
  const code = bloque(
    src,
    'const TRAS_REC_KEY   = "larv4_tras_records";',
    '  return { sheetName: TRAS_SHEET, headers: TRAS_HEADERS.slice(), rows: rows };\n}',
  ) + '\n' + bloque(src, 'function _trasOlvidar(data, sufijos){', '  revs.splice(i, 1);\n  data.revisiones = revs;\n  return data;\n}');
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseFloat, isFinite, Set,
    RPRE: 'larv4_recov_',
    sanitizeStr: (s, max) => String(s == null ? '' : s).trim().slice(0, max || 200),
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { buildTrasPayload, TRAS_HEADERS, trasFilaId, '
    + '_trasAsegurarIds, _trasSacarCamion, _trasSacarRevision, trasNormalizarHora };')
    .runInContext(ctx);
  return ctx.__api;
}

function motorGas() {
  const src = leer(GAS);
  const code = bloque(src, 'const ALLOWED = [', 'const RATE_MAX = 30, RATE_MS = 60000;')
    + '\n' + bloque(src, 'function cleanCell(val) {', '\n}')
    + '\n' + bloque(src, 'function lastRow(ws) {', '\n}')
    + '\n' + bloque(src, 'function upsertAstRows(ws, newRows) {', '  return { upserted: updated, appended: added };\n}');
  const ctx = { String, Number, Object, Array, JSON, Math, isFinite, Date, fmtData() {} };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__gas = { upsertAstRows };').runInContext(ctx);
  return ctx.__gas;
}

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

const cli = motorCliente();
const gas = motorGas();
const H = cli.TRAS_HEADERS;
const col = (nombre) => H.indexOf(nombre);
const iPlaca = col('Placa'); const iO2 = col('Oxígeno (mg/L)');
const iMod = col('Módulo'); const iID = col('ID'); const iLugar = col('Lugar');

/** Dos camiones, dos paradas, dos tinas por camión. Los valores de O₂ son
 *  DISTINTOS por camión y por parada a propósito: con valores iguales, una fila
 *  que pisa a otra no se distinguiría de una que no, y la prueba no probaría nada. */
const tinasDe = (o2) => ({
  1: { o2, temp: 26, act: 'Normal', alim: 'Artemia' },
  2: { o2: o2 + 0.1, temp: 26, act: 'Normal', alim: 'Artemia' },
});
const nuevoRegistro = () => ({
  id: 'tv001',
  data: {
    fecha: '2026-08-26', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
    salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
    insumos: ['Artemia'], check: ['Linterna'],
    controlador: 'Juan', chequeador: 'Pepe', recepcion: 'María',
    camiones: [
      { placa: 'AAA-111', tinasOff: [3, 4, 5, 6, 7, 8] },
      { placa: 'BBB-222', tinasOff: [3, 4, 5, 6, 7, 8] },
    ],
    revisiones: [
      {
        hora: '20:30', lugar: 'Laboratorio', lat: -2.21, lon: -80.97, precision: 10,
        ubicacion: 'x', obs: '',
        camiones: [{ tinas: tinasDe(7.5) }, { tinas: tinasDe(6.1) }],
      },
      {
        hora: '22:00', lugar: 'Peaje 1', lat: -2.22, lon: -80.98, precision: 10,
        ubicacion: 'y', obs: '',
        camiones: [{ tinas: tinasDe(7.2) }, { tinas: tinasDe(6.0) }],
      },
    ],
  },
});

/* ⚠ Se llama al código REAL, no se reproduce aquí.
   La primera versión de estas pruebas copiaba en el propio fichero lo que hace
   `trasQuitarCamion` —anotar las llaves y luego sacarlo—, porque esa función
   necesita el formulario montado. El banco de mutaciones lo cazó: rompiendo la
   regla EN engine.js las pruebas seguían verdes, porque comprobaban su copia.
   Por eso `_trasSacarCamion` y `_trasSacarRevision` existen sin DOM. */
const quitarCamion = (reg, ci) => cli._trasSacarCamion(reg.data, ci);
const quitarRevision = (reg, i) => cli._trasSacarRevision(reg.data, i);

/* ══════════════════════════════════════════════════════════ */

describe('Traslado · la llave no depende de la posición', () => {
  it('🔴 quitar un camión ya sincronizado NO reescribe las filas del otro', () => {
    const reg = nuevoRegistro();
    const ws = hojaFalsa(H);
    gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
    reg.everSynced = true;

    // Antes de existir los tokens, esto dejaba a AAA-111 en CERO filas.
    const antes = ws._filas.slice(1).filter((f) => f[iPlaca] === 'AAA-111');
    expect(antes.length, 'el fixture no llegó a escribir AAA-111: no probaría nada').toBe(4);
    const o2DeAAA = antes.map((f) => f[iO2]).sort();

    quitarCamion(reg, 0);
    gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);

    const bbb = ws._filas.slice(1).filter((f) => f[iPlaca] === 'BBB-222');
    expect(bbb.length, 'BBB-222 se duplicó o perdió filas').toBe(4);
    // Lo que MEDÍA AAA-111 no puede haber acabado en ninguna fila de BBB-222.
    expect(bbb.some((f) => o2DeAAA.indexOf(f[iO2]) !== -1)).toBe(false);
  });

  it('el token sobrevive a que se quite a un vecino', () => {
    const reg = nuevoRegistro();
    cli.buildTrasPayload([reg]);              // asigna los tokens
    const cidBBB = reg.data.camiones[1].cid;
    quitarCamion(reg, 0);
    expect(reg.data.camiones[0].cid, 'BBB-222 cambió de identidad al quedarse solo').toBe(cidBBB);
  });

  it('🔴 quitar una parada no reescribe las filas de la siguiente', () => {
    // ⚠ Mirar sólo el token NO prueba nada: lo que llega a la hoja es la LLAVE, y
    // el defecto vivía en que la llave se construía con la posición. Hay que
    // comprobar la hoja. (Lo cazó la mutación M02.)
    const reg = nuevoRegistro();
    reg.data.revisiones.push({
      hora: '23:30', lugar: 'Gabarra 1', lat: -2.23, lon: -80.99, precision: 10,
      ubicacion: 'z', obs: '', camiones: [{ tinas: tinasDe(7.0) }, { tinas: tinasDe(5.8) }],
    });
    const ws = hojaFalsa(H);
    gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
    reg.everSynced = true;

    // El LUGAR identifica a la 3.ª parada en la hoja sin ambigüedad.
    const deGabarra = (hoja) => hoja._filas.slice(1)
      .filter((f) => f[iPlaca] === 'AAA-111' && f[iLugar] === 'Gabarra 1').map((f) => f[iID]);
    const idsTercera = deGabarra(ws);
    expect(idsTercera.length, "el fixture no distingue la 3.ª parada").toBe(2);

    quitarRevision(reg, 1);                   // fuera la del medio
    gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);

    // La 3.ª parada sigue en SUS filas: no se ha mudado a las de la que se quitó.
    expect(deGabarra(ws).sort()).toEqual(idsTercera.sort());
  });

  it('🔑 un registro SIN tokens produce los mismos IDs de siempre', () => {
    // Retrocompatibilidad: lo guardado antes de este cambio no puede quedar
    // huérfano en la hoja. El token natural de la posición reproduce la llave vieja.
    const reg = nuevoRegistro();
    const ids = cli.buildTrasPayload([reg]).rows.map((f) => f[iID]);
    expect(ids).toContain('tv001-c1-r1-t1');
    expect(ids).toContain('tv001-c2-r2-t2');
  });

  it('un camión añadido cuando el natural está ocupado recibe un token propio', () => {
    const reg = nuevoRegistro();
    cli.buildTrasPayload([reg]);              // AAA→"1", BBB→"2"
    quitarCamion(reg, 0);                     // queda BBB con "2", en la posición 0
    reg.data.camiones.push({ placa: 'CCC-333', tinasOff: [3, 4, 5, 6, 7, 8] });
    reg.data.revisiones.forEach((r) => r.camiones.push({ tinas: tinasDe(5.0) }));
    cli._trasAsegurarIds(reg.data);
    const cids = reg.data.camiones.map((c) => c.cid);
    expect(new Set(cids).size, 'dos camiones comparten token: se pisarían en la hoja').toBe(2);
  });
});

describe('Traslado · apagar lo que se quita', () => {
  it('las filas del camión retirado dejan de ser visibles para el tablero', () => {
    const reg = nuevoRegistro();
    const ws = hojaFalsa(H);
    gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
    reg.everSynced = true;
    quitarCamion(reg, 0);
    gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);

    // Una fila sin módulo no la recoge ninguna vista: el camión desaparece del
    // tablero en vez de quedarse enseñando su última medición.
    const visibles = ws._filas.slice(1).filter((f) => String(f[iMod] || '') !== '');
    expect(visibles.length).toBe(4);
    expect(visibles.every((f) => f[iPlaca] === 'BBB-222')).toBe(true);
  });

  it('🔴 apagar NO puede crear filas que nunca existieron', () => {
    const reg = nuevoRegistro();
    const ws = hojaFalsa(H);
    gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
    reg.everSynced = true;
    quitarCamion(reg, 0);
    // `appended: 0` es la propiedad: sólo se APAGA lo que ya estaba escrito. Cubrir
    // las 8 tinas cuando el camión llevaba 2 añadía 12 filas vacías (medido).
    const res = gas.upsertAstRows(ws, cli.buildTrasPayload([reg]).rows);
    expect(res.appended).toBe(0);
  });

  it('un viaje que nunca se sincronizó no manda ningún apagado', () => {
    const reg = nuevoRegistro();
    cli.buildTrasPayload([reg]);
    quitarCamion(reg, 0);                     // hay llaves anotadas…
    expect(reg.data._quitados.length).toBeGreaterThan(0);
    // …pero sin `everSynced` esas filas no existen en la hoja: mandarlas las crearía.
    const filas = cli.buildTrasPayload([reg]).rows;
    expect(filas.every((f) => String(f[iMod] || '') !== '')).toBe(true);
  });

  it('🔑 una llave que vuelve a estar VIVA no se apaga', () => {
    // Apagar una tina y volver a encenderla antes de sincronizar no puede borrar lo
    // que se acaba de medir: el envío descarta el apagado de toda llave que escribe.
    const reg = nuevoRegistro();
    cli.buildTrasPayload([reg]);
    reg.everSynced = true;
    const viva = cli.trasFilaId('', reg.data.camiones[0].cid, reg.data.revisiones[0].rid, 1);
    reg.data._quitados = [viva];
    const filas = cli.buildTrasPayload([reg]).rows.filter((f) => f[iID] === 'tv001' + viva);
    expect(filas.length, 'la llave se escribió dos veces').toBe(1);
    expect(String(filas[0][iMod])).toBe('M07');
  });
});

describe('Traslado · las horas del viaje se normalizan', () => {
  // A diferencia de la hora de cada parada, «Hora de salida» y «Hora de llegada»
  // son campos libres y llegaban a la hoja tal cual.
  it('arregla lo que tiene arreglo', () => {
    expect(cli.trasNormalizarHora('8:5')).toBe('');        // 8:5 no son 5 minutos
    expect(cli.trasNormalizarHora('8:05')).toBe('08:05');
    expect(cli.trasNormalizarHora('20.30')).toBe('20:30');
    expect(cli.trasNormalizarHora('2030')).toBe('20:30');
    expect(cli.trasNormalizarHora(' 06:00 ')).toBe('06:00');
  });
  it('devuelve vacío cuando de verdad no es una hora, para poder AVISAR', () => {
    expect(cli.trasNormalizarHora('s/n')).toBe('');
    expect(cli.trasNormalizarHora('25:00')).toBe('');
    expect(cli.trasNormalizarHora('12:75')).toBe('');
    expect(cli.trasNormalizarHora('')).toBe('');
  });
});
