/* ============================================================
   REGISTROS · Traslado — el contrato con el GAS (T3, 2026-08-23)

   La ficha ya no se queda en el dispositivo: sincroniza a `Registro_Traslado`.
   Esta batería cubre la COSTURA entre las dos mitades, que es donde la auditoría
   de este proyecto ha encontrado siempre los defectos:

     · el cliente construye el payload  → `buildTrasPayload` (engine.js)
     · el GAS lo acepta y lo escribe    → ALLOWED / LIMITS / upsertAstRows

   Se ejecuta el código REAL de las dos: se extrae de `engine.js` y de
   `GAS/Code.gs` y se corre en un contexto aislado. Nada de reimplementar la
   lógica en la prueba — eso sólo probaría la copia.

   ⚠ El GAS de producción es el que el usuario pega en Apps Script. Que estas
   pruebas pasen NO significa que esté desplegado: eso es un paso manual suyo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { TRASLADO_HEADERS, TRASLADO_SHEET } from './ficha-traslado.schema.js';

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

/* ── El GAS de verdad, en una caja ─────────────────────────── */
function motorGas() {
  const src = leer(GAS);
  const code = bloque(src, 'const ALLOWED = [', 'const RATE_MAX = 30, RATE_MS = 60000;')
    + '\n' + bloque(src, 'function cleanCell(val) {', '\n}')
    + '\n' + bloque(src, 'function lastRow(ws) {', '\n}')
    + '\n' + bloque(src, 'function upsertAstRows(ws, newRows) {', '  return { upserted: updated, appended: added };\n}');
  // `fmtData` sólo pinta (fuentes, alineación, formato de fecha): no decide dónde
  // va ninguna fila, así que se stubea. Lo que se está probando es el EMPAREJADO.
  const ctx = { String, Number, Object, Array, JSON, Math, isFinite, Date, fmtData() {} };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__gas = { ALLOWED, LIMITS, cleanCell, upsertAstRows };')
    .runInContext(ctx);
  return ctx.__gas;
}

/* ── El payload de verdad, del monolito ────────────────────── */
function motorCliente() {
  const code = bloque(
    leer(ENGINE),
    'const TRAS_REC_KEY   = "larv4_tras_records";',
    '  return { sheetName: TRAS_SHEET, headers: TRAS_HEADERS.slice(), rows: rows };\n}',
  );
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseFloat, isFinite, Set,
    RPRE: 'larv4_recov_',
    // El saneado real vive en core/trovan.js; aquí sólo hace falta que NO toque
    // los números, que es la propiedad que se está probando.
    sanitizeStr: (s, max) => String(s == null ? '' : s).trim().slice(0, max || 200),
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { buildTrasPayload, TRAS_SHEET, TRAS_HEADERS, TRAS_MAX_FILAS, _trasLotes };')
    .runInContext(ctx);
  return ctx.__api;
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

const viaje = (id, opts) => ({
  id,
  data: {
    fecha: '2026-08-18', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
    salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
    insumos: ['Artemia'], check: ['Linterna'],
    controlador: 'Juanito', chequeador: 'Pepito', recepcion: 'María',
    camiones: [{ placa: 'GSA-1147', tinasOff: [] }],
    revisiones: [1, 2, 3, 4].map((n) => ({
      hora: ['20:30', '22:00', '23:30', '01:00'][n - 1],
      lugar: 'Peaje',
      // Mar Bravo: latitud Y LONGITUD negativas. El dato que rompe la costura.
      lat: -2.2135, lon: -80.9791, precision: 12,
      ubicacion: '-2.213500, -80.979100',
      horaRegistro: '2026-08-18T20:30:07',
      obs: '',
      camiones: [{
        tinas: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((t) => ([t, {
          o2: (opts && opts.o2) || 7.5, temp: 26, act: 'Normal', alim: 'Artemia',
        }]))),
      }],
    })),
  },
});

/* ══════════════════════════════════════════════════════════ */

describe('Traslado · el GAS acepta la hoja', () => {
  it('🔴 «Registro_Traslado» está en la allowlist', () => {
    // Sin esto el GAS responde «Hoja no permitida» y NADA se sincroniza: es
    // exactamente el estado en el que estuvo la ficha hasta T3.
    const { ALLOWED } = motorGas();
    expect(ALLOWED).toContain('Registro_Traslado');
    expect(ALLOWED).toContain(TRASLADO_SHEET);        // y coincide con el esquema
  });

  it('🔴 LIMITS.tras cabe las 29 columnas — maxCols RECORTA en silencio', () => {
    // `row.slice(0, limits.maxCols)` no valida: TRUNCA. Con un maxCols corto, las
    // últimas columnas (entre ellas el ID) llegarían vacías y cada envío duplicaría
    // la fila. Es el mismo fallo que costó las 2 últimas del AsT con maxCols 25.
    const { LIMITS } = motorGas();
    expect(LIMITS.tras).toBeTruthy();
    expect(LIMITS.tras.maxCols).toBeGreaterThanOrEqual(TRASLADO_HEADERS.length);
  });

  it('LIMITS.tras cabe un viaje grande sin rechazarlo', () => {
    // 2 camiones × 4 revisiones × 8 tinas = 64 filas por viaje, y el cliente puede
    // mandar varios pendientes de una vez.
    const { LIMITS } = motorGas();
    expect(LIMITS.tras.maxRows).toBeGreaterThanOrEqual(64 * 4);
  });
});

describe('Traslado · la costura cliente → GAS', () => {
  it('🔴 la LONGITUD NEGATIVA sobrevive al saneado del GAS', () => {
    // El cliente la manda como NÚMERO justamente para esto: `cleanCell` quita los
    // caracteres `= + - @` iniciales de las CADENAS para impedir inyección de
    // fórmulas, y Ecuador está a longitud ≈ -80.98. Si llegara como texto, la hoja
    // guardaría +80.98 —al otro lado del planeta— sin un solo error visible.
    const { buildTrasPayload } = motorCliente();
    const { rows, headers } = buildTrasPayload([viaje('tv1')]);
    const lon = rows[0][headers.indexOf('Longitud')];
    const lat = rows[0][headers.indexOf('Latitud')];
    expect(typeof lon).toBe('number');
    expect(typeof lat).toBe('number');

    const { cleanCell } = motorGas();
    expect(cleanCell(lon)).toBe(-80.9791);
    expect(cleanCell(lat)).toBe(-2.2135);
    // …y la prueba de que el peligro es real: como TEXTO sí se estropea.
    expect(cleanCell('-80.9791')).toBe('80.9791');
  });

  it('la Corrida llega como número y el Módulo como texto', () => {
    const { buildTrasPayload } = motorCliente();
    const { rows, headers } = buildTrasPayload([viaje('tv1')]);
    const { cleanCell } = motorGas();
    expect(cleanCell(rows[0][headers.indexOf('Corrida')])).toBe(555);
    expect(cleanCell(rows[0][headers.indexOf('Módulo')])).toBe('M07');
  });

  it('el cliente y el GAS hablan de la MISMA hoja', () => {
    const { TRAS_SHEET } = motorCliente();
    expect(TRAS_SHEET).toBe(TRASLADO_SHEET);
    expect(motorGas().ALLOWED).toContain(TRAS_SHEET);
  });
});

describe('Traslado · el upsert por ID no duplica', () => {
  it('🔴 re-sincronizar el MISMO viaje reescribe sus filas, no las añade', () => {
    // Es la propiedad que sostiene toda la ficha: en carretera se sincroniza en
    // cada parada, tarde, mal y varias veces. La llave es determinista, así que el
    // segundo envío tiene que caer sobre las mismas filas.
    const { buildTrasPayload } = motorCliente();
    const { upsertAstRows } = motorGas();
    const { rows, headers } = buildTrasPayload([viaje('tv1')]);
    const ws = hojaFalsa(headers);

    const r1 = upsertAstRows(ws, rows.map((r) => r.slice()));
    expect(r1.appended).toBe(32);
    expect(ws._filas.length).toBe(33);               // cabecera + 32

    const r2 = upsertAstRows(ws, rows.map((r) => r.slice()));
    expect(r2.appended, 'la segunda sincronización DUPLICÓ filas').toBe(0);
    expect(r2.upserted).toBe(32);
    expect(ws._filas.length).toBe(33);
  });

  it('🔴 una medición corregida ACTUALIZA su fila en vez de crear otra', () => {
    const { buildTrasPayload } = motorCliente();
    const { upsertAstRows } = motorGas();
    const ws = hojaFalsa(TRASLADO_HEADERS.slice());

    const a = buildTrasPayload([viaje('tv1', { o2: 7.5 })]);
    upsertAstRows(ws, a.rows.map((r) => r.slice()));
    const b = buildTrasPayload([viaje('tv1', { o2: 6.1 })]);
    upsertAstRows(ws, b.rows.map((r) => r.slice()));

    expect(ws._filas.length).toBe(33);
    const iO2 = TRASLADO_HEADERS.indexOf('Oxígeno (mg/L)');
    const valores = ws._filas.slice(1).map((f) => f[iO2]);
    expect(new Set(valores)).toEqual(new Set([6.1]));   // todas actualizadas
  });

  it('🔴 dos camiones del mismo viaje NO se pisan entre sí', () => {
    const { buildTrasPayload } = motorCliente();
    const { upsertAstRows } = motorGas();
    const v = viaje('tv1');
    v.data.camiones.push({ placa: 'PBX-0392', tinasOff: [] });
    v.data.revisiones.forEach((r) => { r.camiones.push({ tinas: r.camiones[0].tinas }); });

    const { rows, headers } = buildTrasPayload([v]);
    expect(rows).toHaveLength(64);
    const ws = hojaFalsa(headers);
    upsertAstRows(ws, rows.map((r) => r.slice()));
    expect(ws._filas.length).toBe(65);
    const iId = headers.indexOf('ID');
    const ids = ws._filas.slice(1).map((f) => f[iId]);
    expect(new Set(ids).size).toBe(64);
  });

  it('el ID sigue siendo la ÚLTIMA columna: las dos rutas del upsert coinciden', () => {
    // upsertAstRows busca "ID" por cabecera y, si no la encuentra, cae en la última
    // columna del payload. Con el ID al final las dos apuntan al mismo sitio, así
    // que el upsert empareja incluso con la cabecera perdida.
    const { upsertAstRows } = motorGas();
    const { buildTrasPayload } = motorCliente();
    const { rows, headers } = buildTrasPayload([viaje('tv1')]);
    expect(headers[headers.length - 1]).toBe('ID');

    const sinCabecera = headers.slice();
    sinCabecera[sinCabecera.length - 1] = '';          // se pierde la cabecera del ID
    const ws = hojaFalsa(sinCabecera);
    upsertAstRows(ws, rows.map((r) => r.slice()));
    upsertAstRows(ws, rows.map((r) => r.slice()));
    expect(ws._filas.length, 'sin la cabecera del ID el upsert duplicó').toBe(33);
  });
});

describe('Traslado · el GAS embebido en la app dice lo mismo', () => {
  it('🔴 la plantilla que el usuario copia lleva los cambios de T3', () => {
    // `GAS()` devuelve el código que el usuario pega en Apps Script. Si Code.gs y
    // esa plantilla se separan, el usuario despliega una versión sin Traslado y la
    // sincronización falla con «Hoja no permitida» sin que nada lo avise aquí.
    const eng = leer(ENGINE);
    const i = eng.indexOf('  _gasCache = `');
    const j = eng.indexOf('`;\n  return _gasCache;', i);
    expect(i, 'no se localiza la plantilla GAS embebida').toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    const plantilla = eng.slice(i, j);

    expect(plantilla).toContain('"Registro_Traslado",');
    expect(plantilla).toContain('tras:    { maxRows: 600, maxCols: 40 }');
    expect(plantilla).toContain('var isTras   = payload.sheetName === "Registro_Traslado";');
    expect(plantilla).toContain(': isTras   ? LIMITS.tras');
    expect(plantilla).toContain('else if (isTras)   result = upsertAstRows(ws, rows);');
  });

  it('🔴 la plantilla no lleva backticks sin escapar: cerrarían el literal', () => {
    // Un backtick suelto —aunque sea dentro de un comentario— corta la plantilla y
    // rompe engine.js entero. Ya pasó una vez en este proyecto.
    const eng = leer(ENGINE);
    const i = eng.indexOf('  _gasCache = `') + '  _gasCache = `'.length;
    const j = eng.indexOf('`;\n  return _gasCache;', i);
    const cuerpo = eng.slice(i, j);
    const sueltos = cuerpo.split('').filter((c, k) => c === '`' && cuerpo[k - 1] !== '\\');
    expect(sueltos, 'hay backticks SIN escapar dentro de la plantilla GAS').toHaveLength(0);
  });
});

describe('Traslado · el envío se reparte en lotes que el GAS acepte', () => {
  /* Auditoría del 2026-08-24. `syncAllPendingTras` mandaba TODOS los pendientes en un
     solo POST. Un viaje son ~32-56 filas, así que a partir de una decena de pendientes
     el GAS respondía «Límite de filas excedido» y NO escribía NADA. Y es justo el caso
     que se da de verdad: mientras el GAS no se re-despliega, todo queda pendiente. */

  it('🔴 el techo del cliente es el maxRows REAL del GAS', () => {
    /* Los dos números viven en archivos distintos y nadie los une en tiempo de
       ejecución. Se leen de las dos fuentes REALES: subir el del GAS sin subir el del
       cliente deja lotes que el servidor rechaza, y bajarlo sin tocar el cliente los
       parte de más. Escribir «600» aquí a mano no probaría nada de eso. */
    const cli = motorCliente();
    const gas = motorGas();
    expect(cli.TRAS_MAX_FILAS).toBe(gas.LIMITS.tras.maxRows);
  });

  it('🔴 ningún lote pasa del techo, ni con muchos viajes pendientes', () => {
    const cli = motorCliente();
    const pendientes = [];
    for (let i = 0; i < 25; i += 1) pendientes.push(viaje('tv' + i));
    const filasDe = (v) => cli.buildTrasPayload([v]).rows.length;
    const total = pendientes.reduce((a, v) => a + filasDe(v), 0);
    expect(total, "el fixture no llega al techo: no probaría nada").toBeGreaterThan(cli.TRAS_MAX_FILAS);

    const lotes = cli._trasLotes(pendientes, cli.TRAS_MAX_FILAS);
    expect(lotes.length).toBeGreaterThan(1);
    lotes.forEach((lote, i) => {
      const n = lote.reduce((a, v) => a + filasDe(v), 0);
      expect(n, `el lote ${i + 1} pasa del techo y el GAS lo rechazaría entero`)
        .toBeLessThanOrEqual(cli.TRAS_MAX_FILAS);
    });
  });

  it('🔴 un viaje NUNCA se parte entre dos lotes', () => {
    /* Media hoja de un viaje es peor que ninguna: en la vista del Supervisor el camión
       aparecería a mitad de ruta sin que nada lo dijera. */
    const cli = motorCliente();
    const pendientes = [];
    for (let i = 0; i < 25; i += 1) pendientes.push(viaje('tv' + i));
    const lotes = cli._trasLotes(pendientes, cli.TRAS_MAX_FILAS);
    const ids = lotes.flat().map((v) => v.id);
    expect(ids.length, "se perdió o se duplicó algún viaje").toBe(pendientes.length);
    expect(new Set(ids).size).toBe(pendientes.length);
    expect(ids.slice().sort()).toEqual(pendientes.map((v) => v.id).sort());
  });

  it('un viaje que por sí solo pasa del techo va SOLO, sin arrastrar a los demás', () => {
    /* No cabe de ninguna manera, así que el GAS lo rechazará —y ahora el aviso dice por
       qué—. Lo que no puede pasar es que se lleve por delante a los que sí cabían. */
    const cli = motorCliente();
    const pendientes = [viaje('tvA'), viaje('tvB'), viaje('tvC')];
    const filasDe = (v) => cli.buildTrasPayload([v]).rows.length;
    const tope = filasDe(pendientes[0]) - 1;          // ni uno solo cabe
    const lotes = cli._trasLotes(pendientes, tope);
    expect(lotes).toHaveLength(3);
    lotes.forEach((l) => expect(l).toHaveLength(1));
  });
});
