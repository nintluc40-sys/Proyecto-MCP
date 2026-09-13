/* ============================================================
   MADURACIÓN · `doPost` DE PUNTA A PUNTA, CON EL GAS REAL ENTERO (2026-09-13)

   Dos cosas que sólo se ven ejecutando `doPost` completo, y no sus piezas sueltas:
     1 · (V3) el GAS RECHAZA un envío con el esquema viejo antes de escribir nada.
     2 · (V2) el MERGE de las tres hojas por «ID» funciona por la ruta de verdad —enrutado
         incluido—, y no sólo llamando a `upsertAstRows` a mano como hace
         `mad-gas-merge.test.js`. Hasta hoy nunca se había ejercido así, y en producción
         tampoco: `Maduración Fin de Ciclo` no tiene todavía ni una fila.

   ── 1 · EL RIESGO DEL ESQUEMA VIEJO ────────────────────────
   Las hojas del registro operativo de Maduración cambiaron de columnas entre el 08 y el
   09-09 (Tanques perdió «Relación H:M» y ganó pesos y observaciones; «Maduración Lotes»
   pasó a ser Desoves; Fin de Ciclo perdió «Destino»). Pero el GAS escribe POR POSICIÓN:
   `upsertMadRows` copia la celda i del envío en la columna i de la hoja, sin mirar cómo se
   llama. Y siguen vivos clientes con el esquema anterior —GitHub Pages sirve `f1d9687`, y
   cualquier copia vieja de `index (8)`—.

   Un guardado de Tanques desde uno de ellos correría una columna todo lo que va detrás de
   «Tanque»: los machos muertos caerían en «Hembras muertas», la muda en «Peso promedio
   machos»… con respuesta «ok» y sin un solo síntoma, sobre datos que YA se usan en real.

   🔑 EL ARREGLO VA EN EL SERVIDOR, que es el único sitio que ve a TODOS los clientes: antes
   de escribir, compara las cabeceras del envío con las de la hoja, posición a posición, y si
   una no coincide RECHAZA sin tocar nada. El cliente viejo, ante un rechazo, no marca nada
   como sincronizado: lo tecleado se queda en el dispositivo (medido en `f1d9687`).

   ── POR QUÉ SE EJECUTA EL `Code.gs` ENTERO ─────────────────
   La guarda vive dentro de `doPost`, entre abrir la hoja y escribir. Probar la función de
   comparación suelta no diría si `doPost` la llama, ni si la llama ANTES de escribir, ni si
   el candado se suelta al rechazar. Así que se carga el GAS real completo en una caja, con
   una hoja de Google falsa que registra cada escritura.

   ⚠ Que esto pase NO significa que el GAS esté desplegado: pegarlo en Apps Script y
   publicar una versión nueva es un paso manual del usuario.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { MAD_DESOVE_HEADERS } from './ficha-maduracion-desoves.schema.js';
import { MAD_INGRESO_HEADERS, buildIngresoRows } from './ficha-maduracion-ingreso.schema.js';
import { MAD_MOV_HEADERS } from './ficha-maduracion-movimientos.schema.js';
import { MAD_FIN_HEADERS, buildFinRows } from './ficha-maduracion-fin-ciclo.schema.js';

const leer = (u) => readFileSync(new URL(u, import.meta.url), 'utf8').split('\r\n').join('\n');
const gasSrc = leer('../../../../GAS/Code.gs');
const engineSrc = leer('../../../../public/registros/engine.js');

/* ── Las cabeceras ACTUALES salen de los constructores reales, no se teclean ── */
function cabecerasDelMotor(ficha) {
  const i = engineSrc.indexOf('function buildMadPayload(ficha, records){');
  const j = engineSrc.indexOf('\n}\n', i);
  const ctx = {};
  createContext(ctx);
  new Script(engineSrc.slice(i, j + 2) + '\n;globalThis.__b = buildMadPayload;').runInContext(ctx);
  return ctx.__b(ficha, []).headers;
}
const SALA = cabecerasDelMotor('salas');
const TANQUES = cabecerasDelMotor('tanques');

/* ── Los esquemas VIEJOS, copiados tal cual de los commits que los tenían ──
   Son el pasado a propósito: describen lo que todavía mandan los clientes sin actualizar. */
const TANQUES_F1D9687 = ['Fecha', 'Sala', 'Lote', 'Tanque', 'Relación H:M', 'Población inicial hembras',
  'Población inicial machos', 'Machos muertos', 'Hembras muertas',
  'Machos muertos por descarte de selección', 'Hembras muertas por descarte de selección', 'Cópulas', 'Muda'];
const LOTES_F1D9687 = ['Fecha', 'Sala', 'Fila', 'Lote', 'Historial', 'Total de nauplios', 'Total de huevos',
  'N2 por lote', 'Desoves por lote', 'No viables por lote'];
const DESOVES_58A9675 = ['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Desoves', 'Total de huevos',
  'Total de nauplios', 'No viables', 'Fecha N2', 'N2', 'Fecha N5', 'N5', 'Observaciones'];
const FIN_58A9675 = ['Fecha', 'Lote', 'Tipo', 'Motivo', 'Destino', 'Machos', 'Hembras', 'Observaciones', 'ID'];
const SALA_SIN_FASE6 = SALA.slice(0, 20);

/* ── Hoja de Google falsa: guarda filas y apunta cada escritura ── */
function hojaFalsa(filasIniciales) {
  const filas = filasIniciales.map((f) => f.slice());
  const escrituras = [];
  const cadena = () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => cadena()) });
  const hoja = {
    filas, escrituras,
    getLastRow: () => filas.length,
    getLastColumn: () => filas.reduce((m, f) => Math.max(m, f.length), 0),
    getMaxColumns: () => 60,
    getMaxRows: () => 1000,
    insertColumnsAfter() {},
    setFrozenRows() {},
    appendRow(v) { escrituras.push('appendRow'); filas.push(v.slice()); },
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
  return hoja;
}

/* ── El GAS real, entero, en una caja con los servicios de Apps Script simulados ── */
function gas(hojas) {
  const cache = new Map();
  const candado = { tomado: 0, soltado: 0 };
  const ctx = {
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => hojas[n] || null,
        insertSheet: (n) => (hojas[n] = hojaFalsa([])),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() { candado.tomado++; }, releaseLock() { candado.soltado++; } }) },
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
  new Script(gasSrc + '\n;globalThis.__doPost = doPost; globalThis.__cmp = typeof esquemaIncompatible_ === "function" ? esquemaIncompatible_ : null;').runInContext(ctx);
  let n = 0;
  const post = (payload) => ctx.__doPost({
    postData: { contents: JSON.stringify(Object.assign({ reqId: 'req-' + (n++) }, payload)) },
    parameter: { z: 'prueba-' + n },
  });
  return { post, cache, candado, hojas, cmp: ctx.__cmp };
}

const filaVacia = (cab) => cab.map(() => '');
const conValores = (cab, valores) => { const f = filaVacia(cab); Object.entries(valores).forEach(([h, v]) => { f[cab.indexOf(h)] = v; }); return f; };

describe('GAS · un cliente con el ESQUEMA VIEJO no puede escribir en Maduración (V3)', () => {
  it('el fixture ejerce algo: un cliente AL DÍA sí escribe en Tanques, y en la columna correcta', () => {
    const hoja = hojaFalsa([TANQUES, conValores(TANQUES, { Fecha: '2026-09-07', Sala: 'Sala 4', Tanque: 1, Muda: 2 })]);
    const g = gas({ 'Maduración Tanques': hoja });
    const r = g.post({ sheetName: 'Maduración Tanques', headers: TANQUES,
      rows: [conValores(TANQUES, { Fecha: '2026-09-07', Sala: 'Sala 4', Tanque: 1, 'Machos muertos': 3 })] });
    expect(r.status).toBe('ok');
    expect(hoja.filas[1][TANQUES.indexOf('Machos muertos')]).toBe(3);
    expect(hoja.filas[1][TANQUES.indexOf('Muda')]).toBe(2);           // el merge conserva lo que no llegó
  });

  it('🔴 Tanques con el esquema de Pages (f1d9687) se RECHAZA y la hoja no se toca', () => {
    const hoja = hojaFalsa([TANQUES, conValores(TANQUES, { Fecha: '2026-09-07', Sala: 'Sala 4', Tanque: 1, Muda: 2 })]);
    const antes = JSON.stringify(hoja.filas);
    const g = gas({ 'Maduración Tanques': hoja });
    const r = g.post({ sheetName: 'Maduración Tanques', headers: TANQUES_F1D9687,
      rows: [['2026-09-07', 'Sala 4', 'BP', 1, '1:1', 230, 180, 3, 1, 0, 0, 5, 1]] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Esquema desactualizado');
    expect(r.message).toContain('Maduración Tanques');
    expect(r.message).toContain('columna 5');                         // «Relación H:M» frente a «Población inicial hembras»
    expect(r.message).toContain('Población inicial hembras');
    expect(JSON.stringify(hoja.filas)).toBe(antes);
    expect(hoja.escrituras).toEqual([]);
  });

  it('🔴 Desoves con el esquema de la grilla vieja de Lotes (f1d9687) se RECHAZA', () => {
    const hoja = hojaFalsa([MAD_DESOVE_HEADERS]);
    const g = gas({ 'Maduración Lotes': hoja });
    const r = g.post({ sheetName: 'Maduración Lotes', headers: LOTES_F1D9687,
      rows: [['2026-09-07', 'Sala 4', 1, 'BP', '', 100, 200, 0, 1, 0]] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('columna 2');
    expect(hoja.filas).toHaveLength(1);
    expect(hoja.escrituras).toEqual([]);
  });

  it('🔴 un cambio al FINAL también se ve: Desoves sin «Despacho» (58a9675) se RECHAZA', () => {
    const hoja = hojaFalsa([MAD_DESOVE_HEADERS]);
    const g = gas({ 'Maduración Lotes': hoja });
    const r = g.post({ sheetName: 'Maduración Lotes', headers: DESOVES_58A9675,
      rows: [['2026-09-07', 'BP', 'CG1', 558, 64, 1, 2, 0, '', '', '', '', 'obs']] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('columna 13');
    expect(hoja.escrituras).toEqual([]);
  });

  it('🔴 Fin de Ciclo con «Destino» (58a9675) se RECHAZA', () => {
    const hoja = hojaFalsa([MAD_FIN_HEADERS]);
    const g = gas({ 'Maduración Fin de Ciclo': hoja });
    const r = g.post({ sheetName: 'Maduración Fin de Ciclo', headers: FIN_58A9675,
      rows: [['2026-09-09', 'AB', 'Total', 'Pedido', 'Chongón', 10, 10, '', 'id1']] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('columna 5');
    expect(hoja.escrituras).toEqual([]);
  });

  it('el rechazo NO echa en cara lo que mandó el cliente: sólo nombra la columna de la hoja', () => {
    const g = gas({ 'Maduración Tanques': hojaFalsa([TANQUES]) });
    const r = g.post({ sheetName: 'Maduración Tanques', headers: TANQUES_F1D9687, rows: [filaVacia(TANQUES_F1D9687)] });
    expect(r.message).not.toContain('Relación H:M');
  });

  it('al rechazar se SUELTA el candado y NO se marca el reqId como hecho', () => {
    const g = gas({ 'Maduración Tanques': hojaFalsa([TANQUES]) });
    g.post({ sheetName: 'Maduración Tanques', headers: TANQUES_F1D9687, rows: [filaVacia(TANQUES_F1D9687)] });
    expect(g.candado.tomado).toBe(1);
    expect(g.candado.soltado).toBe(1);
    expect([...g.cache.keys()].some((k) => k.startsWith('idem_'))).toBe(false);
  });
});

describe('GAS · lo que la guarda NO puede romper (V3)', () => {
  it('Sala SIN la Fase 6 (20 columnas) sigue escribiendo: le falta una columna al final, no está corrida', () => {
    const hoja = hojaFalsa([SALA, conValores(SALA, { Fecha: '2026-09-09', Sala: 'Sala 1', 'Estado por lote': 'AB: Producción' })]);
    const g = gas({ 'Maduración Sala': hoja });
    const r = g.post({ sheetName: 'Maduración Sala', headers: SALA_SIN_FASE6,
      rows: [conValores(SALA_SIN_FASE6, { Fecha: '2026-09-09', Sala: 'Sala 1', 'Temperatura 2:00': 28.8 })] });
    expect(r.status).toBe('ok');
    expect(hoja.filas[1][SALA.indexOf('Temperatura 2:00')]).toBe(28.8);
    expect(hoja.filas[1][SALA.indexOf('Estado por lote')]).toBe('AB: Producción');
  });

  it('Sala CON la Fase 6 sobre la hoja de 20 columnas escribe y crea la 21.ª', () => {
    const hoja = hojaFalsa([SALA_SIN_FASE6]);
    const g = gas({ 'Maduración Sala': hoja });
    const r = g.post({ sheetName: 'Maduración Sala', headers: SALA,
      rows: [conValores(SALA, { Fecha: '2026-09-13', Sala: 'Sala 2', 'Estado por lote': 'BP: Producción' })] });
    expect(r.status).toBe('ok');
    expect(hoja.filas[0][20]).toBe('Estado por lote');
  });

  it('una hoja que todavía NO existe se crea con las cabeceras del envío', () => {
    const hojas = {};
    const g = gas(hojas);
    const r = g.post({ sheetName: 'Maduración Fin de Ciclo', headers: MAD_FIN_HEADERS,
      rows: [MAD_FIN_HEADERS.map((h) => (h === 'ID' ? 'x1' : h === 'Fecha' ? '2026-09-13' : ''))] });
    expect(r.status).toBe('ok');
    expect(hojas['Maduración Fin de Ciclo'].filas[0]).toEqual(MAD_FIN_HEADERS);
  });

  it('Ingreso y Movimientos AL DÍA escriben', () => {
    for (const [nombre, cab] of [['Maduración Ingreso', MAD_INGRESO_HEADERS], ['Maduración Movimientos', MAD_MOV_HEADERS]]) {
      const g = gas({ [nombre]: hojaFalsa([cab]) });
      const r = g.post({ sheetName: nombre, headers: cab, rows: [cab.map((h) => (h === 'ID' ? 'x1' : h === 'Fecha' ? '2026-09-13' : ''))] });
      expect(r.status, nombre).toBe('ok');
    }
  });

  it('espacios de más o acentos en otra forma Unicode (NFD) en la hoja NO son un esquema distinto', () => {
    const cabHoja = TANQUES.map((h) => (h === 'Cópulas' ? ' Cópulas '.normalize('NFD') : h));
    const g = gas({ 'Maduración Tanques': hojaFalsa([cabHoja]) });
    const r = g.post({ sheetName: 'Maduración Tanques', headers: TANQUES,
      rows: [conValores(TANQUES, { Fecha: '2026-09-13', Sala: 'Sala 4', Tanque: 2, 'Cópulas': 4 })] });
    expect(r.status).toBe('ok');
  });

  it('una celda de cabecera EN BLANCO en la hoja no bloquea (no hay con qué comparar)', () => {
    const cabHoja = TANQUES.map((h, i) => (i === 14 ? '' : h));
    const g = gas({ 'Maduración Tanques': hojaFalsa([cabHoja]) });
    const r = g.post({ sheetName: 'Maduración Tanques', headers: TANQUES, rows: [conValores(TANQUES, { Fecha: '2026-09-13', Sala: 'Sala 4', Tanque: 3 })] });
    expect(r.status).toBe('ok');
  });

  it('🔑 sólo vigila las hojas del registro OPERATIVO: el reproductivo y el resto no cambian', () => {
    // La MATRIZ también es posicional, pero su esquema no ha cambiado y sus cabeceras vivas
    // no se han medido: meterla aquí podría bloquear el registro reproductivo en campo.
    const cab = ['Número', 'Trovan ID', 'Sala actual'];
    const g = gas({ 'Maduración MATRIZ': hojaFalsa([['Nº', 'Trovan', 'Sala']]) });
    const r = g.post({ sheetName: 'Maduración MATRIZ', headers: cab, rows: [[1, '0008218CCC', 'Sala 1']] });
    expect(r.status).toBe('ok');
  });
});

describe('GAS · el MERGE de las tres hojas por «ID», por la ruta de verdad de doPost (V2)', () => {
  /* El caso real que motivó el merge (2026-09-09): el cierre se registra entero y, días
     después, se vuelve a la MISMA fila sólo para anotar el metabisulfito. La ficha se vació
     al guardar, así que el segundo envío va con todo lo demás en blanco. */
  const cierre = (extra) => buildFinRows({ fecha: '2026-09-09', cierres: [Object.assign({ lote: 'AB', motivo: 'Pedido' }, extra)] });
  const celda = (hoja, h) => hoja.filas[1][MAD_FIN_HEADERS.indexOf(h)];

  it('🔴 Fin de Ciclo · completar el metabisulfito NO borra los animales del cierre', () => {
    const hojas = {};
    const g = gas(hojas);
    expect(g.post({ sheetName: 'Maduración Fin de Ciclo', headers: MAD_FIN_HEADERS,
      rows: cierre({ tipo: 'Total', machos: '120', hembras: '340', observaciones: 'Salieron por la mañana' }) }).status).toBe('ok');
    expect(g.post({ sheetName: 'Maduración Fin de Ciclo', headers: MAD_FIN_HEADERS,
      rows: cierre({ metabisulfito: '8.5', fechaMetabisulfito: '2026-09-12' }) }).status).toBe('ok');
    const hoja = hojas['Maduración Fin de Ciclo'];
    expect(hoja.filas).toHaveLength(2);                               // cabecera + UNA fila: actualiza, no duplica
    expect(celda(hoja, 'Machos')).toBe(120);
    expect(celda(hoja, 'Hembras')).toBe(340);
    expect(celda(hoja, 'Tipo')).toBe('Total');
    expect(celda(hoja, 'Observaciones')).toBe('Salieron por la mañana');
    expect(celda(hoja, 'Metabisulfito (kg)')).toBe(8.5);
    expect(celda(hoja, 'Fecha aplicación')).toBe('2026-09-12');
  });

  it('Ingreso · corregir un solo dato no vacía los conteos', () => {
    const ingreso = (comp) => buildIngresoRows({ fecha: '2026-09-13', lote: 'BP',
      composiciones: [Object.assign({ codigoGenetico: 'CG1', reparto: [{ sala: 'Sala 4', tanque: '1', machos: '', hembras: '' }] }, comp)] });
    const hojas = {};
    const g = gas(hojas);
    g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS,
      rows: ingreso({ reparto: [{ sala: 'Sala 4', tanque: '1', machos: '180', hembras: '235', agua: 'RAS' }] }) });
    g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS, rows: ingreso({ pesoMachos: '56' }) });
    const fila = hojas['Maduración Ingreso'].filas[1];
    expect(hojas['Maduración Ingreso'].filas).toHaveLength(2);
    expect(fila[MAD_INGRESO_HEADERS.indexOf('Machos')]).toBe(180);
    expect(fila[MAD_INGRESO_HEADERS.indexOf('Hembras')]).toBe(235);
    expect(fila[MAD_INGRESO_HEADERS.indexOf('Peso promedio machos (g)')]).toBe(56);
  });

  it('🔑 el fixture distingue: el AsT, por la MISMA función pero sin merge, SÍ reemplaza la fila', () => {
    /* Sin este contraste, las dos de arriba podrían pasar por un motivo equivocado (que el
       fake nunca borre nada). AsT y Traslado mandan el registro COMPLETO y deben REEMPLAZAR. */
    const cab = ['Fecha', 'Observaciones', 'ID'];
    const hojas = { 'Registro_Supervisión': hojaFalsa([cab]) };
    const g = gas(hojas);
    g.post({ sheetName: 'Registro_Supervisión', headers: cab, rows: [['2026-09-13', 'algo', 'a1']] });
    g.post({ sheetName: 'Registro_Supervisión', headers: cab, rows: [['2026-09-13', '', 'a1']] });
    expect(hojas['Registro_Supervisión'].filas).toHaveLength(2);
    expect(hojas['Registro_Supervisión'].filas[1][1]).toBe('');
  });
});
