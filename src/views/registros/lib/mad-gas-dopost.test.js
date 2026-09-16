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
import { MAD_DESOVE_HEADERS, buildDesoveRows } from './ficha-maduracion-desoves.schema.js';
import { MAD_INGRESO_HEADERS, buildIngresoRows } from './ficha-maduracion-ingreso.schema.js';
import { MAD_MOV_HEADERS } from './ficha-maduracion-movimientos.schema.js';
import { MAD_FIN_HEADERS, buildFinRows } from './ficha-maduracion-fin-ciclo.schema.js';
import { MAD_TRAT_HEADERS } from './ficha-maduracion-tratamientos.schema.js';
import { MAD_MORT_HEADERS } from './ficha-maduracion-mortdesove.schema.js';
import { MAD_ALIM_HEADERS } from './ficha-maduracion-alimentacion.schema.js';
import { REPRO_MATRIZ_HEADERS, REPRO_EVENTO, REPRO_TRANSFER_TIPO, buildAltaBatch, buildEventBatch, buildTransferBatch, matrixIndexFromRows } from './reproductivo.data.js';

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

/* ── Hoja de Google falsa: guarda filas y apunta cada escritura ──
   `opts.comoSheets` (D2, 2026-09-13) imita lo que Google Sheets hace con una celda SIN formato de
   texto: «0766» se guarda como el número 766 (se pierde el cero) y «3-5» como una fecha. Es
   opcional para no cambiar lo que ya prueban los demás casos. `opts.maxRows` fija el alto. */
function hojaFalsa(filasIniciales, opts = {}) {
  const filas = filasIniciales.map((f) => f.slice());
  const escrituras = [];
  const texto = [];                                   // rangos con formato «@»: [r, c, nR, nC]
  const formatos = [];                                // TODOS los setNumberFormat, en orden: [r, c, nR, nC, formato]
  let maxRows = opts.maxRows || 1000;
  const esTexto = (fila, col) => texto.some(([r, c, nR, nC]) => fila >= r && fila < r + nR && col >= c && col < c + nC);
  const comoGuardaSheets = (fila, col, v) => {
    if (!opts.comoSheets || typeof v !== 'string' || esTexto(fila, col)) return v;
    if (/^\d+$/.test(v)) return Number(v);
    const f = v.match(/^(\d{1,2})[-/](\d{1,2})$/);
    if (f) return new Date(Date.UTC(2026, Number(f[2]) - 1, Number(f[1])));
    return v;
  };
  const cadena = () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => cadena()) });
  const hoja = {
    filas, escrituras, texto, formatos,
    getLastRow: () => filas.length,
    getLastColumn: () => filas.reduce((m, f) => Math.max(m, f.length), 0),
    getMaxColumns: () => 60,
    getMaxRows: () => maxRows,
    insertRowsAfter(_despues, n) { escrituras.push('insertRows+' + n); maxRows += n; },
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
            v.forEach((cell, k) => { fila[c - 1 + k] = comoGuardaSheets(r + i, c + k, cell); });
          });
          return cadena();
        },
        setNumberFormat: (fmt) => {
          formatos.push([r, c, nR, nC, fmt]);
          if (fmt === '@') { texto.push([r, c, nR, nC]); escrituras.push('texto@' + r + ',' + c + 'x' + nR + ',' + nC); }
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
  let fechas = 0;                                     // llamadas a Utilities.formatDate (♻ MATRIZ)
  let zonas = 0;                                      // llamadas a Session.getScriptTimeZone (P15)
  const ctx = {
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => hojas[n] || null,
        insertSheet: (n) => (hojas[n] = hojaFalsa([])),
      }),
      flush() {},
    },
    LockService: { getScriptLock: () => ({ waitLock() { candado.tomado++; }, releaseLock() { candado.soltado++; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: { sleep() {}, formatDate: (d) => { fechas++; return d.toISOString().slice(0, 10); } },
    Session: { getScriptTimeZone: () => { zonas++; return 'America/Guayaquil'; } },
    Logger: { log() {} },
    console: { error() {}, log() {} },
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(gasSrc + '\n;globalThis.__doPost = doPost; globalThis.__doGet = doGet; globalThis.__cmp = typeof esquemaIncompatible_ === "function" ? esquemaIncompatible_ : null;').runInContext(ctx);
  let n = 0;
  const post = (payload) => ctx.__doPost({
    postData: { contents: JSON.stringify(Object.assign({ reqId: 'req-' + (n++) }, payload)) },
    parameter: { z: 'prueba-' + n },
  });
  /* Una fecha de Sheets tiene que nacer DENTRO de la caja: el GAS pregunta instanceof Date, y un Date de fuera no lo es. */
  const FechaCaja = new Script('Date').runInContext(ctx);
  return { post, cache, candado, hojas, cmp: ctx.__cmp, fechasFormateadas: () => fechas, zonasPedidas: () => zonas,
    leer: (parameter) => ctx.__doGet({ parameter }), fecha: (d) => new FechaCaja(Date.UTC(2026, 8, d)) };
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
    expect(r.message).toContain('columna 7');                         // desde A4 lo para antes la firma de Lotes
    expect(hoja.filas).toHaveLength(1);
    expect(hoja.escrituras).toEqual([]);
  });

  it('🔴 un cambio al FINAL también se ve: Desoves sin «Despacho» se RECHAZA', () => {
    /* El envío lleva la firma de Lotes (A4), así que lo que mide es la guarda V3 contra la hoja: el
       único desfase es que falta «Despacho» al final. */
    const sinDespacho = MAD_DESOVE_HEADERS.filter((h) => h !== 'Despacho');
    const hoja = hojaFalsa([MAD_DESOVE_HEADERS]);
    const g = gas({ 'Maduración Lotes': hoja });
    const r = g.post({ sheetName: 'Maduración Lotes', headers: sinDespacho,
      rows: [['2026-09-07', 'BP', 'CG1', 558, 64, 1, 2, '', '', '', '', 'obs']] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('columna 12');
    expect(r.message).toContain('la hoja espera «Despacho»');
    expect(hoja.escrituras).toEqual([]);
  });

  it('🔴 Fin de Ciclo CON la firma pero con columnas cruzadas se RECHAZA por la guarda V3', () => {
    const cruzada = MAD_FIN_HEADERS.map((h) => (h === 'Machos' ? 'Hembras' : h === 'Hembras' ? 'Machos' : h));
    const hoja = hojaFalsa([MAD_FIN_HEADERS]);
    const r = gas({ 'Maduración Fin de Ciclo': hoja }).post({ sheetName: 'Maduración Fin de Ciclo', headers: cruzada, rows: [filaVacia(cruzada)] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('la hoja espera «Machos»');
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

/* ── A4 (2026-09-14) · la FIRMA del esquema vigente, también con la hoja vacía ──
   La app publicada (6df4b3a) guarda Fin de Ciclo sin preguntar al GAS y con 10 columnas. Con la hoja
   vacía, V3 no tiene con qué comparar: el primer envío fijaría la cabecera vieja y bloquearía a las
   apps al día. Ingreso y Lotes quedan igual en cuanto se vacíen (paso 3 de P1). */
const FIN_6DF4B3A = ['Fecha', 'Lote', 'Tipo', 'Motivo', 'Metabisulfito (kg)', 'Fecha aplicación', 'Machos', 'Hembras', 'Observaciones', 'ID'];
const FIN_E955C72 = ['Fecha', 'Lote', 'Tipo', 'Motivo', 'Sala', 'Metabisulfito (kg)', 'Fecha aplicación', 'Machos', 'Hembras', 'Registro',
  'Peso promedio machos (g)', 'Peso promedio hembras (g)', 'Peso total machos (kg)', 'Peso total hembras (kg)', 'Observaciones', 'ID'];
const INGRESO_6DF4B3A_PREVIO = ['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Camaronera origen', 'Grupo', 'Sala', 'Tanque',
  'Machos', 'Hembras', 'Peso promedio machos (g)', 'Peso promedio hembras (g)', 'Supervivencia piscina (%)', 'Camarones por m2',
  'Densidad de siembra', 'Agua', 'ID'];

describe('GAS · A4 · una app vieja no fija la cabecera vieja en una hoja vacía', () => {
  it('🔴 Fin de Ciclo de la app publicada, con la hoja SIN crear: se rechaza y la hoja NO nace', () => {
    const hojas = {};
    const g = gas(hojas);
    const r = g.post({ sheetName: 'Maduración Fin de Ciclo', headers: FIN_6DF4B3A,
      rows: [['2026-09-15', 'BP', 'Total', 'Pedido', '', '', 10, 12, '', '2026-09-15-BP-Pedido']] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Esquema desactualizado');
    expect(r.message).toContain('columna 5');
    expect(r.message).toContain('«Sala»');
    expect(r.message).not.toContain('Metabisulfito');                  // no echa en cara lo que mandó
    expect(hojas['Maduración Fin de Ciclo']).toBeUndefined();
    expect(g.candado.soltado).toBe(g.candado.tomado);
    expect([...g.cache.keys()].some((k) => k.startsWith('idem_'))).toBe(false);
  });

  it('🔴 lo mismo con la hoja creada pero VACÍA: no escribe ni la cabecera', () => {
    const hoja = hojaFalsa([]);
    const g = gas({ 'Maduración Fin de Ciclo': hoja });
    const r = g.post({ sheetName: 'Maduración Fin de Ciclo', headers: FIN_6DF4B3A, rows: [filaVacia(FIN_6DF4B3A)] });
    expect(r.status).toBe('error');
    expect(hoja.filas).toEqual([]);
    expect(hoja.escrituras).toEqual([]);
  });

  it('🔴 Fin de Ciclo con Sala pero sin «Rojos» (esquema de e955c72) se rechaza por la columna 10', () => {
    const g = gas({});
    const r = g.post({ sheetName: 'Maduración Fin de Ciclo', headers: FIN_E955C72, rows: [filaVacia(FIN_E955C72)] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('columna 10');
    expect(r.message).toContain('«Rojos»');
  });

  it('🔴 Ingreso con «Camarones por m2» y Lotes con «Total de nauplios», en hojas vacías, se rechazan', () => {
    const casos = [['Maduración Ingreso', INGRESO_6DF4B3A_PREVIO, 'columna 14'], ['Maduración Lotes', DESOVES_58A9675, 'columna 7']];
    for (const [nombre, cab, col] of casos) {
      const hoja = hojaFalsa([]);
      const r = gas({ [nombre]: hoja }).post({ sheetName: nombre, headers: cab, rows: [filaVacia(cab)] });
      expect(r.status, nombre).toBe('error');
      expect(r.message, nombre).toContain(col);
      expect(hoja.escrituras, nombre).toEqual([]);
    }
  });

  it('el fixture ejerce algo: las tres, AL DÍA y sin hoja, escriben y la crean con la cabecera vigente', () => {
    for (const [nombre, cab] of [['Maduración Ingreso', MAD_INGRESO_HEADERS], ['Maduración Lotes', MAD_DESOVE_HEADERS], ['Maduración Fin de Ciclo', MAD_FIN_HEADERS]]) {
      const hojas = {};
      const fila = cab.map((h) => (h === 'ID' ? 'x1' : h === 'Fecha' ? '2026-09-15' : h === 'Lote' ? 'BP' : h === 'Código genético' ? 'CG1' : ''));
      const r = gas(hojas).post({ sheetName: nombre, headers: cab, rows: [fila] });
      expect(r.status, nombre).toBe('ok');
      expect(hojas[nombre].filas[0], nombre).toEqual(cab);
    }
  });

  it('🔑 la firma NO es para todas: una hoja sin ella sigue naciendo con las cabeceras del envío', () => {
    // ⚠ Decía «sólo esas tres» y caducó el 2026-09-16, cuando entraron las tres nuevas. Lo que la
    // prueba ejerce de verdad —y no caduca— es que `Movimientos`, que NO está en la firma, sigue
    // naciendo de su envío: sin esto, «la firma funciona» podría significar «rechaza todo».
    const hojas = {};
    const r = gas(hojas).post({ sheetName: 'Maduración Movimientos', headers: MAD_MOV_HEADERS,
      rows: [MAD_MOV_HEADERS.map((h) => (h === 'ID' ? 'x1' : h === 'Fecha' ? '2026-09-15' : ''))] });
    expect(r.status).toBe('ok');
    expect(hojas['Maduración Movimientos'].filas[0]).toEqual(MAD_MOV_HEADERS);
  });
});

/* ── A4 · 2026-09-16 · LAS TRES HOJAS NUEVAS ENTRAN EN LA FIRMA ──────────────
   Por qué hacía falta, medido ese día: el GAS ya estaba desplegado y Pages seguía sirviendo
   `e27761b`, cuyo `Maduración Mortalidad Desove` tiene 14 columnas con «Salinidad» en la 11. El
   esquema al día tiene 18 e INSERTA Fototropismo/Aireación en la 11-12 y Área/Alcalinidad en la
   15-16: la hoja no nacería «más corta» —eso lo arregla `ensureHeaders`— sino CORRIDA, y desde ahí
   rechazaría a todas las apps al día. Las tres hojas estaban a 0 cabeceras, así que se llegó a
   tiempo.
   🔑 EL FIXTURE ESTÁ ELEGIDO PARA QUE DISTINGA: las dos cabeceras viejas de Mortalidad Desove son
   las REALES de dos clientes que existen en disco (Pages con 14 columnas y una copia anterior con
   8), no esquemas inventados. Y cada rechazo se comprueba por su COLUMNA, no sólo por «error»:
   con un `toContain('Esquema desactualizado')` a secas, mover la firma a otra columna seguiría
   dando verde. */
const MORT_14_PAGES = ['Fecha', 'Lote', 'Tipo de tanque', 'Hembras que entran', 'Hembras muertas', '% Mortalidad',
  'Revisión', 'Deformidad', 'Actividad', 'Hongos', 'Salinidad', 'Temperatura', 'Observaciones', 'ID'];
const MORT_8_PREVIO = ['Fecha', 'Lote', 'Tipo de tanque', 'Hembras que entran', 'Hembras muertas', '% Mortalidad',
  'Observaciones', 'ID'];

describe('GAS · A4 · las tres hojas NUEVAS tampoco las fija una app vieja', () => {
  it('🔴 Mortalidad Desove con las 14 columnas que sirve Pages: rechazo en la 11 y la hoja NO nace', () => {
    const hojas = {};
    const g = gas(hojas);
    const r = g.post({ sheetName: 'Maduración Mortalidad Desove', headers: MORT_14_PAGES,
      rows: [conValores(MORT_14_PAGES, { Fecha: '2026-09-16', Lote: 'BP', ID: '2026-09-16-BP-DESOVE' })] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('columna 11');
    expect(r.message).toContain('«Fototropismo»');
    expect(hojas['Maduración Mortalidad Desove']).toBeUndefined();
    expect(g.candado.soltado).toBe(g.candado.tomado);            // rechazar no deja el candado tomado
  });

  it('🔴 y con las 8 columnas de una copia anterior: también se para, sin escribir', () => {
    const hoja = hojaFalsa([]);
    const g = gas({ 'Maduración Mortalidad Desove': hoja });
    const r = g.post({ sheetName: 'Maduración Mortalidad Desove', headers: MORT_8_PREVIO, rows: [filaVacia(MORT_8_PREVIO)] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('columna 11');
    expect(hoja.filas).toEqual([]);
    expect(hoja.escrituras).toEqual([]);                          // ni siquiera la fila de cabeceras
  });

  it('🔴 Tratamientos y Alimentación: si su columna de firma se mueve o se renombra, se rechazan', () => {
    const casos = [
      ['Maduración Tratamientos', MAD_TRAT_HEADERS, 'Productos RAS', 'columna 8'],
      ['Maduración Alimentación', MAD_ALIM_HEADERS, 'Fuente del peso', 'columna 9'],
    ];
    for (const [nombre, cab, columna, esperado] of casos) {
      const roto = cab.map((h) => (h === columna ? h + ' (viejo)' : h));
      const hojas = {};
      const r = gas(hojas).post({ sheetName: nombre, headers: roto, rows: [filaVacia(roto)] });
      expect(r.status, nombre).toBe('error');
      expect(r.message, nombre).toContain(esperado);
      expect(hojas[nombre], nombre).toBeUndefined();
    }
  });

  it('el fixture ejerce algo: las tres, AL DÍA y sin hoja, escriben y la crean con su cabecera vigente', () => {
    for (const [nombre, cab] of [['Maduración Mortalidad Desove', MAD_MORT_HEADERS],
      ['Maduración Tratamientos', MAD_TRAT_HEADERS], ['Maduración Alimentación', MAD_ALIM_HEADERS]]) {
      const hojas = {};
      const fila = conValores(cab, { Fecha: '2026-09-16', ID: 'x1' });
      const r = gas(hojas).post({ sheetName: nombre, headers: cab, rows: [fila] });
      expect(r.status, nombre).toBe('ok');
      expect(hojas[nombre].filas[0], nombre).toEqual(cab);
    }
  });
});

describe('GAS · «Maduración Mortalidad Desove», la hoja nueva (2026-09-15)', () => {
  it('🔴 se permite, nace con sus cabeceras, fusiona por ID y la guarda V3 la vigila', () => {
    const hojas = {};
    const g = gas(hojas);
    const fila = (v) => conValores(MAD_MORT_HEADERS, v);
    const id = '2026-09-15-BP-DESOVE';
    expect(g.post({ sheetName: 'Maduración Mortalidad Desove', headers: MAD_MORT_HEADERS,
      rows: [fila({ Fecha: '2026-09-15', Lote: 'BP', 'Tipo de tanque': 'Desove', 'Hembras que entran': 40, 'Hembras muertas': 3, ID: id })] }).status).toBe('ok');
    const hoja = hojas['Maduración Mortalidad Desove'];
    expect(hoja.filas[0]).toEqual(MAD_MORT_HEADERS);
    expect(g.post({ sheetName: 'Maduración Mortalidad Desove', headers: MAD_MORT_HEADERS, rows: [fila({ Fecha: '2026-09-15', Observaciones: 'revisado', ID: id })] }).status).toBe('ok');
    expect(hoja.filas).toHaveLength(2);
    expect([hoja.filas[1][MAD_MORT_HEADERS.indexOf('Hembras muertas')], hoja.filas[1][MAD_MORT_HEADERS.indexOf('Observaciones')]]).toEqual([3, 'revisado']);
    const cruzada = MAD_MORT_HEADERS.map((h) => (h === 'Hembras muertas' ? 'Hembras que entran' : h === 'Hembras que entran' ? 'Hembras muertas' : h));
    const r = gas({ 'Maduración Mortalidad Desove': hojaFalsa([MAD_MORT_HEADERS]) }).post({ sheetName: 'Maduración Mortalidad Desove', headers: cruzada, rows: [filaVacia(cruzada)] });
    expect(r.message).toContain('Esquema desactualizado');
  });
});

describe('GAS · «Maduración Alimentación», la hoja nueva (2026-09-15)', () => {
  it('🔴 se permite, nace con sus cabeceras, fusiona por ID (el ID no es la última del ENVÍO corto) y la guarda V3 la vigila', () => {
    const hojas = {};
    const g = gas(hojas);
    const fila = (v) => conValores(MAD_ALIM_HEADERS, v);
    const id = '2026-09-15-S1-T1';
    expect(g.post({ sheetName: 'Maduración Alimentación', headers: MAD_ALIM_HEADERS,
      rows: [fila({ Fecha: '2026-09-15', Sala: 'Sala 1', Tanque: 1, Hembras: 33, Machos: 59, 'Total (kg/día)': 0.763, Tomas: '06:00 Krill 1', ID: id })] }).status).toBe('ok');
    const hoja = hojas['Maduración Alimentación'];
    expect(hoja.filas[0]).toEqual(MAD_ALIM_HEADERS);
    // Reenviar la misma fila corregida REEMPLAZA por ID (lo vacío conserva).
    expect(g.post({ sheetName: 'Maduración Alimentación', headers: MAD_ALIM_HEADERS, rows: [fila({ Fecha: '2026-09-15', Sala: 'Sala 1', Tanque: 1, 'Total (kg/día)': 0.8, ID: id })] }).status).toBe('ok');
    expect(hoja.filas).toHaveLength(2);
    expect([hoja.filas[1][MAD_ALIM_HEADERS.indexOf('Hembras')], hoja.filas[1][MAD_ALIM_HEADERS.indexOf('Total (kg/día)')]]).toEqual([33, 0.8]);
    // El número de tanque se repite entre salas (T1 de la Sala 1 y de la Sala 4): por ID son dos filas; una llave por
    // posición (Fecha, Tanque, Lotes) las fundiría en una.
    expect(g.post({ sheetName: 'Maduración Alimentación', headers: MAD_ALIM_HEADERS, rows: [fila({ Fecha: '2026-09-15', Sala: 'Sala 4', Tanque: 1, Hembras: 50, ID: '2026-09-15-S4-T1' })] }).status).toBe('ok');
    expect(hoja.filas.map((f) => f[MAD_ALIM_HEADERS.indexOf('ID')])).toEqual(['ID', id, '2026-09-15-S4-T1']);
    const cruzada = MAD_ALIM_HEADERS.map((h) => (h === 'Hembras' ? 'Machos' : h === 'Machos' ? 'Hembras' : h));
    const r = gas({ 'Maduración Alimentación': hojaFalsa([MAD_ALIM_HEADERS]) }).post({ sheetName: 'Maduración Alimentación', headers: cruzada, rows: [filaVacia(cruzada)] });
    expect(r.message).toContain('Esquema desactualizado');
  });
});

describe('GAS · «Maduración Tratamientos», la hoja nueva (2026-09-15)', () => {
  const fila = (valores) => conValores(MAD_TRAT_HEADERS, valores);
  it('🔴 se permite, nace con sus cabeceras y reenviar por el mismo ID FUSIONA (no duplica ni borra)', () => {
    const hojas = {};
    const g = gas(hojas);
    const id = '2026-09-15-S4-P-BC.BP';
    const r1 = g.post({ sheetName: 'Maduración Tratamientos', headers: MAD_TRAT_HEADERS,
      rows: [fila({ Fecha: '2026-09-15', Sala: 'Sala 4', Tipo: 'Preventivo', Lotes: 'BC, BP', Productos: 'Bacmil', ID: id })] });
    expect(r1.status).toBe('ok');
    const hoja = hojas['Maduración Tratamientos'];
    expect(hoja.filas[0]).toEqual(MAD_TRAT_HEADERS);
    const r2 = g.post({ sheetName: 'Maduración Tratamientos', headers: MAD_TRAT_HEADERS,
      rows: [fila({ Fecha: '2026-09-15', 'Dosis y observaciones': '2 g/L', ID: id })] });
    expect(r2.status).toBe('ok');
    expect(hoja.filas).toHaveLength(2);
    expect(hoja.filas[1][MAD_TRAT_HEADERS.indexOf('Productos')]).toBe('Bacmil');
    expect(hoja.filas[1][MAD_TRAT_HEADERS.indexOf('Dosis y observaciones')]).toBe('2 g/L');
  });

  it('🔴 la guarda V3 la vigila: columnas cruzadas contra la hoja se rechazan', () => {
    const cruzada = MAD_TRAT_HEADERS.map((h) => (h === 'Productos' ? 'Lotes' : h === 'Lotes' ? 'Productos' : h));
    const hoja = hojaFalsa([MAD_TRAT_HEADERS]);
    const r = gas({ 'Maduración Tratamientos': hoja }).post({ sheetName: 'Maduración Tratamientos', headers: cruzada, rows: [filaVacia(cruzada)] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Esquema desactualizado');
    expect(hoja.escrituras).toEqual([]);
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

describe('GAS + libro · un SEGUNDO ingreso al mismo tanque, otro día, SUMA (D1, 2026-09-13)', () => {
  /* 🔴 EL DEFECTO. El ID de Ingreso no llevaba la fecha: `BP-OLF5.F2-S4-t1`. Un segundo ingreso
     del mismo lote y código genético al MISMO tanque, días después, caía en la misma fila, y el
     merge del GAS SUSTITUÍA sus conteos. El libro mayor —que suma las filas de Ingreso— perdía
     los animales del primero sin un solo síntoma.
     Se prueba por la ruta completa: el constructor real de filas → doPost → la hoja → el libro. */
  const ingreso = (fecha, machos, hembras) => buildIngresoRows({ fecha, lote: 'BP',
    composiciones: [{ codigoGenetico: 'OLF5.F2', piscina: '558', reparto: [{ sala: 'Sala 4', tanque: '1', machos, hembras, agua: 'RAS' }] }] });
  const comoObjetos = (hoja) => hoja.filas.slice(1).map((f) => Object.fromEntries(hoja.filas[0].map((h, i) => [h, f[i]])));

  it('🔴 la hoja guarda LOS DOS ingresos y el libro cuenta los animales de ambos', async () => {
    const { construirLibro } = await import('./mad-libro.js');
    const hojas = {};
    const g = gas(hojas);
    expect(g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS, rows: ingreso('2026-08-29', '180', '235') }).status).toBe('ok');
    expect(g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS, rows: ingreso('2026-09-13', '50', '60') }).status).toBe('ok');
    const hoja = hojas['Maduración Ingreso'];
    expect(hoja.filas).toHaveLength(3);                                  // cabecera + DOS ingresos
    const libro = construirLibro({ ingresos: comoObjetos(hoja), tanques: [] }, { hoy: '2026-09-13' });
    const T = libro.tanques.get('Sala 4|1');
    expect(T.machos).toBe(230);
    expect(T.hembras).toBe(295);
  });

  it('pero reenviar el MISMO ingreso el mismo día sigue actualizando, no duplica', () => {
    const hojas = {};
    const g = gas(hojas);
    g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS, rows: ingreso('2026-09-13', '50', '60') });
    g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS, rows: ingreso('2026-09-13', '55', '60') });
    expect(hojas['Maduración Ingreso'].filas).toHaveLength(2);
    expect(hojas['Maduración Ingreso'].filas[1][MAD_INGRESO_HEADERS.indexOf('Machos')]).toBe(55);
  });
});

describe('GAS · la llave de Desoves se guarda como TEXTO (D2, 2026-09-13)', () => {
  /* 🔴 EL RIESGO. «Maduración Lotes» (Desoves) se escribe por llave POSICIONAL [0,1,2] = Fecha,
     Lote y Código genético. Google Sheets convierte lo que parece un número o una fecha: un código
     «0766» se guarda como 766 y «3-5» como una fecha. Al volver a la fila —para completar N2 o N5,
     que es el uso normal— la llave leída ya no casa con la enviada y el GAS AÑADE una fila nueva:
     el desove queda partido en dos. Se prueba con una hoja que imita esa conversión.
     El arreglo fuerza el formato «@» en esas dos columnas antes de escribir, como ya se hace con
     el Trovan ID del registro reproductivo. */
  const desove = (cg, extra) => buildDesoveRows({ fecha: '2026-09-07',
    desoves: [Object.assign({ lote: 'BP', codigoGenetico: cg, piscina: '558', desoves: '64', huevos: '14440' }, extra)] });

  for (const [cg, porque] of [['0766', 'con un cero delante'], ['3-5', 'que parece una fecha']]) {
    it(`🔴 completar N2 días después sobre un código ${porque} ACTUALIZA la fila, no la duplica`, () => {
      const hoja = hojaFalsa([MAD_DESOVE_HEADERS], { comoSheets: true });
      const g = gas({ 'Maduración Lotes': hoja });
      expect(g.post({ sheetName: 'Maduración Lotes', headers: MAD_DESOVE_HEADERS, rows: desove(cg) }).status).toBe('ok');
      expect(g.post({ sheetName: 'Maduración Lotes', headers: MAD_DESOVE_HEADERS, rows: desove(cg, { fechaN2: '2026-09-08', n2: '9000' }) }).status).toBe('ok');
      expect(hoja.filas).toHaveLength(2);                                  // cabecera + UNA fila
      expect(hoja.filas[1][MAD_DESOVE_HEADERS.indexOf('Código genético')]).toBe(cg);
      expect(hoja.filas[1][MAD_DESOVE_HEADERS.indexOf('N2')]).toBe(9000000);
      expect(hoja.filas[1][MAD_DESOVE_HEADERS.indexOf('Desoves')]).toBe(64);   // y el merge conservó lo primero
    });
  }

  it('el fixture ejerce algo: la hoja imitada SÍ pierde el cero de una celda sin formato de texto', () => {
    const hoja = hojaFalsa([['A']], { comoSheets: true });
    hoja.getRange(2, 1, 1, 1).setValues([['0766']]);
    expect(hoja.filas[1][0]).toBe(766);
  });

  it('las demás hojas no reciben ese formato: sólo la de Desoves tiene código en la llave', () => {
    const hoja = hojaFalsa([TANQUES], { comoSheets: true });
    const g = gas({ 'Maduración Tanques': hoja });
    g.post({ sheetName: 'Maduración Tanques', headers: TANQUES, rows: [conValores(TANQUES, { Fecha: '2026-09-13', Sala: 'Sala 4', Tanque: 1, Muda: 1 })] });
    expect(hoja.texto).toEqual([]);
  });

  it('si la hoja se queda corta, se amplía antes de formatear: el formato cubre lo que se escribe', () => {
    const hoja = hojaFalsa([MAD_DESOVE_HEADERS], { comoSheets: true, maxRows: 2 });
    const g = gas({ 'Maduración Lotes': hoja });
    const filas = buildDesoveRows({ fecha: '2026-09-07', desoves: ['0761', '0762', '0763'].map((cg) => ({ lote: 'BP', codigoGenetico: cg, desoves: '1' })) });
    expect(g.post({ sheetName: 'Maduración Lotes', headers: MAD_DESOVE_HEADERS, rows: filas }).status).toBe('ok');
    expect(hoja.filas.slice(1).map((f) => f[MAD_DESOVE_HEADERS.indexOf('Código genético')])).toEqual(['0761', '0762', '0763']);
  });
});

/* ── Calidad de Agua · la columna nueva «Sulfato» (2026-09-13) ──────────────
   La ficha de Algas manda desde hoy 48 columnas a una hoja que en producción tiene 47 (medido:
   2081 filas, terminan en «Sesión · Lote»). Lo que tiene que pasar, y sólo se ve ejecutando el
   `doPost` real: el GAS AÑADE «Sulfato» como columna 48 (`ensureHeaders`), escribe cada valor
   bajo su cabecera y NO mueve nada de lo ya escrito. Y un cliente que aún mande 47 sigue
   escribiendo bien sobre la hoja ya ensanchada. Las cabeceras salen del motor, no se teclean. */
function cabecerasCalidad() {
  const trozo = (a, z) => { const i = engineSrc.indexOf(a); return engineSrc.slice(i, engineSrc.indexOf(z, i) + z.length); };
  const ctx = {};
  createContext(ctx);
  new Script(trozo('const CAL_PARAMS = {', '\n};') + '\n' + trozo('const CAL_PARAM_ORDER = [', '];')
    + '\n' + trozo('const CAL_SHEET_HEADERS = (function(){', '})();') + '\n;globalThis.__h = CAL_SHEET_HEADERS;').runInContext(ctx);
  return ctx.__h;
}

describe('GAS · Calidad de Agua recibe la columna nueva «Sulfato» sin desalinear nada', () => {
  const CAL = cabecerasCalidad();
  const CAL_47 = CAL.slice(0, CAL.indexOf('Sulfato'));
  const KEYS = [0, 2, 4, 5, CAL.indexOf('Sesión')];
  const filaCal = (cab, v) => cab.map((h) => (h in v ? v[h] : ''));

  it('el fixture ejerce algo: el motor manda 48 y la hoja de producción tiene 47', () => {
    expect(CAL).toHaveLength(48);
    expect(CAL_47).toHaveLength(47);
    expect(CAL_47[46]).toBe('Lote');
  });

  it('🔴 un envío de 48 añade «Sulfato» como columna 48 y cada dato cae bajo su cabecera', () => {
    const vieja = filaCal(CAL_47, { 'Fecha muestreo': '2026-09-01', Departamento: 'Algas', Formato: 'Algas',
      'Cloro libre (mg/L)': 0.3, Sesión: 's-vieja', Lote: 'L1' });
    const hoja = hojaFalsa([CAL_47.slice(), vieja.slice()]);
    const g = gas({ 'Calidad de Agua': hoja });
    const r = g.post({ sheetName: 'Calidad de Agua', headers: CAL, replaceKey: true, keyCols: KEYS,
      rows: [filaCal(CAL, { 'Fecha muestreo': '2026-09-13', Departamento: 'Algas', Formato: 'Algas',
        Muestras: 'Agua Ultrafiltrada', pH: 7.9, Magnesio: 1300, Sesión: 's-nueva', Lote: 'L7', Sulfato: 2400 })] });
    expect(r.status).toBe('ok');
    expect(hoja.filas[0]).toHaveLength(48);
    expect(hoja.filas[0][47]).toBe('Sulfato');
    expect(hoja.filas[0].slice(0, 47)).toEqual(CAL_47);              // la cabecera vieja, intacta
    expect(hoja.filas[1]).toEqual(vieja);                             // la fila vieja, intacta
    const nueva = hoja.filas[2];
    expect(nueva[CAL.indexOf('Sulfato')]).toBe(2400);
    expect(nueva[CAL.indexOf('Lote')]).toBe('L7');
    expect(nueva[CAL.indexOf('Sesión')]).toBe('s-nueva');
    expect(nueva[CAL.indexOf('pH')]).toBe(7.9);
  });

  it('un cliente que aún manda 47 columnas sigue escribiendo bien sobre la hoja ya ensanchada', () => {
    const hoja = hojaFalsa([CAL.slice()]);
    const g = gas({ 'Calidad de Agua': hoja });
    const r = g.post({ sheetName: 'Calidad de Agua', headers: CAL_47, replaceKey: true, keyCols: KEYS,
      rows: [filaCal(CAL_47, { 'Fecha muestreo': '2026-09-13', Formato: 'Maduración · Agua', Sesión: 's2', Lote: 'L2' })] });
    expect(r.status).toBe('ok');
    expect(hoja.filas[0]).toEqual(CAL);                               // no encoge ni reescribe la cabecera
    expect(hoja.filas[1][CAL.indexOf('Lote')]).toBe('L2');
    expect(hoja.filas[1][CAL.indexOf('Sulfato')] ?? '').toBe('');
  });

  it('re-enviar la MISMA sesión con Sulfato la reemplaza, no la duplica', () => {
    const hoja = hojaFalsa([CAL.slice()]);
    const g = gas({ 'Calidad de Agua': hoja });
    const envio = (s) => g.post({ sheetName: 'Calidad de Agua', headers: CAL, replaceKey: true, keyCols: KEYS,
      rows: [filaCal(CAL, { 'Fecha muestreo': '2026-09-13', Departamento: 'Algas', Formato: 'Algas', Sesión: 's3', Sulfato: s })] });
    expect(envio(100).status).toBe('ok');
    expect(envio(250).status).toBe('ok');
    expect(hoja.filas).toHaveLength(2);
    expect(hoja.filas[1][CAL.indexOf('Sulfato')]).toBe(250);
  });
});

/* ── Maduración Ingreso · «Crecimiento» y «Libras» (2026-09-13): la hoja en uso NO se corrompe ──
   Las cabeceras de producción, copiadas TAL CUAL de la hoja medida ese día (6 filas, 17
   columnas): son el pasado a propósito. El cliente nuevo manda 18 con Densidad, Agua e ID
   corridos un sitio. Con el GAS nuevo, mientras la hoja no se migre, la guarda RECHAZA sin
   escribir; tras la migración manual (README) escribe cada dato en su columna. */
const INGRESO_PRODUCCION_0913 = ['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Camaronera origen',
  'Grupo', 'Sala', 'Tanque', 'Machos', 'Hembras', 'Peso promedio machos (g)', 'Peso promedio hembras (g)',
  'Supervivencia piscina (%)', 'Camarones por m2', 'Densidad de siembra', 'Agua', 'ID'];

describe('GAS · Maduración Ingreso con Crecimiento y Libras: la hoja en uso no se desalinea', () => {
  const nuevoIngreso = () => buildIngresoRows({ fecha: '2026-09-13', lote: 'BP', composiciones: [{
    codigoGenetico: 'OLF5.F2', crecimientoSemanal: '1.8', librasHectarea: '2450', densidad: '214000',
    reparto: [{ sala: 'Sala 4', tanque: '1', machos: '10', hembras: '12', agua: 'Agua de playa' }] }] });
  const filaVieja = INGRESO_PRODUCCION_0913.map((h) => ({ Fecha: '2026-08-29', Lote: 'BP', 'Camarones por m2': 21.4,
    'Densidad de siembra': 214000, Agua: 'Agua de playa', ID: 'BP-OLF5.F2-S4-t1' })[h] ?? '');

  it('el fixture ejerce algo: el cliente manda 18 columnas y la hoja de producción tiene 17', () => {
    expect(MAD_INGRESO_HEADERS).toHaveLength(18);
    expect(INGRESO_PRODUCCION_0913).toHaveLength(17);
  });

  it('🔴 con la hoja SIN migrar, el envío nuevo se RECHAZA y no se escribe nada', () => {
    const hoja = hojaFalsa([INGRESO_PRODUCCION_0913.slice(), filaVieja.slice()]);
    const antes = JSON.stringify(hoja.filas);
    const g = gas({ 'Maduración Ingreso': hoja });
    const r = g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS, rows: nuevoIngreso() });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Esquema desactualizado');
    expect(r.message).toContain('columna 14');
    expect(r.message).toContain('Camarones por m2');
    expect(JSON.stringify(hoja.filas)).toBe(antes);
  });

  it('🔴 con la hoja MIGRADA (columna insertada y cabeceras renombradas) cada dato cae en su columna', () => {
    // La migración manual: se inserta una columna tras la 14, se renombran la 14 y la 15 y se
    // vacían los «Camarones por m2» viejos, que pertenecen al campo que se borró.
    const cab = MAD_INGRESO_HEADERS.slice();
    const vieja = cab.map((h) => ({ Fecha: '2026-08-29', Lote: 'BP', 'Densidad de siembra': 214000, Agua: 'Agua de playa', ID: 'BP-OLF5.F2-S4-t1' })[h] ?? '');
    const hoja = hojaFalsa([cab, vieja.slice()]);
    const g = gas({ 'Maduración Ingreso': hoja });
    const r = g.post({ sheetName: 'Maduración Ingreso', headers: MAD_INGRESO_HEADERS, rows: nuevoIngreso() });
    expect(r.status).toBe('ok');
    expect(hoja.filas[1]).toEqual(vieja);                                  // la fila vieja, intacta
    const nueva = hoja.filas[2];
    expect(nueva[cab.indexOf('Crecimiento semanal promedio')]).toBe(1.8);
    expect(nueva[cab.indexOf('Libras por hectárea promedio')]).toBe(2450);
    expect(nueva[cab.indexOf('Densidad de siembra')]).toBe(214000);
    expect(nueva[cab.indexOf('Agua')]).toBe('Agua de playa');
    expect(nueva[cab.indexOf('ID')]).toBe('2026-09-13-BP-OLF5.F2-S4-t1');
  });

  it('🔴 y un cliente VIEJO (17 columnas) no puede escribir sobre la hoja ya migrada', () => {
    const hoja = hojaFalsa([MAD_INGRESO_HEADERS.slice()]);
    const g = gas({ 'Maduración Ingreso': hoja });
    const r = g.post({ sheetName: 'Maduración Ingreso', headers: INGRESO_PRODUCCION_0913, rows: [filaVieja.slice()] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Esquema desactualizado');
    expect(hoja.filas).toHaveLength(1);
  });
});

/* ── Maduración Lotes (Desoves) · cambios del 2026-09-14: la hoja en uso NO se desalinea ──
   Las cabeceras de producción, copiadas TAL CUAL de la hoja medida ese día (1 fila, 14
   columnas; «Total de nauplios» y «No viables» vacíos en ella). El cliente nuevo manda las de
   su módulo. La columna del desfase se CALCULA comparando las dos listas: así la prueba vale
   igual con el renombrado de «No viables» y con el borrado de «Total de nauplios». */
const DESOVES_PRODUCCION_0914 = ['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Desoves', 'Total de huevos',
  'Total de nauplios', 'No viables', 'Fecha N2', 'N2', 'Fecha N5', 'N5', 'Despacho', 'Observaciones'];

describe('GAS · Maduración Lotes (Desoves) con sus cambios: la hoja en uso no se desalinea', () => {
  const primerDesfase = MAD_DESOVE_HEADERS.findIndex((h, i) => h !== DESOVES_PRODUCCION_0914[i]);
  const nuevoDesove = () => buildDesoveRows({ fecha: '2026-09-14', desoves: [{
    lote: 'BP', codigoGenetico: 'OLF5.F2', desoves: '64', hembrasNoViables: '9', fechaN2: '2026-09-15', n2: '9000' }] });
  const filaVieja = DESOVES_PRODUCCION_0914.map((h) => ({ Fecha: '2026-09-07', Lote: 'BP', 'Código genético': 'OLF5.F2',
    Desoves: 64, 'Total de huevos': 14440000, N2: 9000000, N5: 9000000 })[h] ?? '');

  it('el fixture ejerce algo: las cabeceras del cliente ya NO son las de producción', () => {
    expect(primerDesfase).toBeGreaterThan(2);                 // la llave [0,1,2] no se mueve
    expect(MAD_DESOVE_HEADERS.slice(0, 3)).toEqual(DESOVES_PRODUCCION_0914.slice(0, 3));
  });

  it('🔴 con la hoja SIN migrar, el envío nuevo se RECHAZA y no se escribe nada', () => {
    const hoja = hojaFalsa([DESOVES_PRODUCCION_0914.slice(), filaVieja.slice()]);
    const antes = JSON.stringify(hoja.filas);
    const g = gas({ 'Maduración Lotes': hoja });
    const r = g.post({ sheetName: 'Maduración Lotes', headers: MAD_DESOVE_HEADERS, rows: nuevoDesove() });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Esquema desactualizado');
    expect(r.message).toContain('columna ' + (primerDesfase + 1));
    expect(r.message).toContain(DESOVES_PRODUCCION_0914[primerDesfase]);
    expect(JSON.stringify(hoja.filas)).toBe(antes);
  });

  it('🔴 con la hoja MIGRADA cada dato cae en su columna, y la fila vieja no se toca', () => {
    const cab = MAD_DESOVE_HEADERS.slice();
    const vieja = cab.map((h) => ({ Fecha: '2026-09-07', Lote: 'BP', 'Código genético': 'OLF5.F2', Desoves: 64, 'Total de huevos': 14440000 })[h] ?? '');
    const hoja = hojaFalsa([cab, vieja.slice()]);
    const g = gas({ 'Maduración Lotes': hoja });
    const r = g.post({ sheetName: 'Maduración Lotes', headers: MAD_DESOVE_HEADERS, rows: nuevoDesove() });
    expect(r.status).toBe('ok');
    expect(hoja.filas[1]).toEqual(vieja);
    const nueva = hoja.filas[2];
    expect(nueva[cab.indexOf('Hembras no viables')]).toBe(9);
    expect(nueva[cab.indexOf('Desoves')]).toBe(64);
    expect(nueva[cab.indexOf('N2')]).toBe(9000000);
    expect(nueva[cab.indexOf('Fecha N2')]).toBe('2026-09-15');
  });

  it('🔴 y un cliente VIEJO no puede escribir sobre la hoja ya migrada', () => {
    const hoja = hojaFalsa([MAD_DESOVE_HEADERS.slice()]);
    const g = gas({ 'Maduración Lotes': hoja });
    const r = g.post({ sheetName: 'Maduración Lotes', headers: DESOVES_PRODUCCION_0914, rows: [filaVieja.slice()] });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Esquema desactualizado');
    expect(hoja.filas).toHaveLength(1);
  });
});

/* ── MATRIZ · UN CHIP, VARIOS INDIVIDUOS (2026-09-16) ──────────────────────────
   Decisión del usuario: «puedo usar el mismo Trovan ID mientras no se repitan Piscina, Código
   genético y Lote». La identidad de una hembra es esa CUATERNA, así que la MATRIZ se llavea por
   (Trovan · Piscina · Código genético · Lote) —madKeyCols = [1, 3, 4, 5]— y cada individuo tiene
   su propia fila sin que nadie tenga que deducir nada.

   ⚠⚠ AQUÍ HABÍA ONCE PRUEBAS QUE FIJABAN LO CONTRARIO, y se reescriben porque la regla cambió, no
   porque estuvieran mal. Probaban `llaveMatriz_`: una llave a medida que decidía por fechas y
   muertes a qué hembra del chip iba cada envío y RECHAZABA el envío entero cuando no encajaba
   («lo lleva una hembra VIVA», «tiene que ingresar DESPUÉS de esa fecha»). Esos dos rechazos son
   exactamente los que el usuario reportó, y se fueron con la función.

   🔑 LO QUE AHORA HAY QUE VIGILAR, Y POR QUÉ. Con la llave compuesta aparece un riesgo nuevo que
   antes no existía: un envío que no traiga las CUATRO columnas no casa con su fila y el upsert
   AÑADE una suelta. Le pasa a la mortalidad y al traslado, que sólo conocen el Trovan. Por eso
   las pruebas de abajo comprueban, con los constructores REALES, que esas dos llevan la identidad
   copiada de lo que leyeron — y que la hoja no gana filas. */
describe('GAS · la MATRIZ admite varios individuos por chip, y nadie pierde su fila', () => {
  const CAB = REPRO_MATRIZ_HEADERS;
  const CHIP = '0008219380';
  const fila = (o) => CAB.map((h) => (h in o ? o[h] : ''));
  const celda = (hoja, i, h) => hoja.filas[i][CAB.indexOf(h)];
  const VIEJA = { 'Número': 7, 'Trovan ID': CHIP, 'Piscina': 'P2', 'Código genético': 'G01', 'Lote': 'L12', 'Sala actual': 'S1',
    'Tanque actual': 'T1', 'Estado': 'Muerto', 'Fecha muerte': '2026-07-08', 'Fecha ingreso': '2026-01-05' };
  const NUEVA = { 'Número': 31, 'Trovan ID': CHIP, 'Piscina': 'P9', 'Código genético': 'G07', 'Lote': 'L20', 'Sala actual': 'S3',
    'Tanque actual': 'T4', 'Estado': 'Vivo', 'Fecha ingreso': '2026-08-01' };
  const alta = (fecha, extra) => buildAltaBatch([Object.assign({ trovan: CHIP, numero: '44', lote: 'L33', codigo: 'G09',
    piscina: 'P4', sala: 'S2', tanque: 'T8', fecha }, extra)], null).payload;
  /* El índice se arma con las MISMAS columnas que pide el cliente a ?p=rows (_REPRO_MATRIZ_COLS),
     que desde el 2026-09-16 incluyen la cuaterna: sin ella, la mortalidad y el traslado mandarían
     la llave a medias. Es justo lo que estas pruebas tienen que poder ver. */
  const indiceComoElCliente = (...hembras) => matrixIndexFromRows(hembras.map((o) => ({
    'Trovan ID': o['Trovan ID'], 'Piscina': o['Piscina'], 'Código genético': o['Código genético'], 'Lote': o['Lote'],
    'Sala actual': o['Sala actual'], 'Tanque actual': o['Tanque actual'], 'Estado': o['Estado'],
  })));
  const mortalidad = (fecha, ...hembras) => buildEventBatch({ ids: [CHIP], fecha, tipo: REPRO_EVENTO.MORTALIDAD,
    matrixIndex: indiceComoElCliente(...hembras) }).matriz;

  it('🔴 el alta con el chip de una MUERTA añade su fila, y la de la muerta queda INTACTA', () => {
    const hoja = hojaFalsa([CAB, fila(VIEJA)]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    expect(g.post(alta('2026-07-20')).status).toBe('ok');
    expect(hoja.filas).toHaveLength(3);
    expect(hoja.filas[1]).toEqual(fila(VIEJA));
    expect(celda(hoja, 2, 'Lote')).toBe('L33');
    expect(celda(hoja, 2, 'Código genético')).toBe('G09');
    expect(celda(hoja, 2, 'Estado')).toBe('Vivo');
    expect(celda(hoja, 2, 'Fecha ingreso')).toBe('2026-07-20');
  });

  it('🔴 y con el chip de una VIVA también: antes se rechazaba el envío ENTERO', () => {
    const hoja = hojaFalsa([CAB, fila(NUEVA)]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    const r = g.post(alta('2026-09-10'));
    expect(r.status).toBe('ok');
    expect(hoja.filas).toHaveLength(3);
    expect(hoja.filas[1]).toEqual(fila(NUEVA));           // la viva, intacta
    expect(celda(hoja, 2, 'Lote')).toBe('L33');
  });

  it('🔴 la FECHA ya no decide: ingresar el mismo día de la muerte de la anterior entra igual', () => {
    const hoja = hojaFalsa([CAB, fila(VIEJA)]);
    const r = gas({ 'Maduración MATRIZ': hoja }).post(alta('2026-07-08'));
    expect(r.status).toBe('ok');
    expect(hoja.filas).toHaveLength(3);
  });

  it('🔴 reenviar la MISMA cuaterna no duplica: vuelve a su fila', () => {
    const hoja = hojaFalsa([CAB, fila(VIEJA)]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    expect(g.post(alta('2026-07-20')).status).toBe('ok');
    expect(g.post(alta('2026-07-20', { tanque: 'T9' })).status).toBe('ok');
    expect(hoja.filas).toHaveLength(3);
    expect(celda(hoja, 2, 'Tanque actual')).toBe('T9');
  });

  it('🔴 y cambiar UNA sola de las tres crea otra fila: el fixture distingue la cuaterna', () => {
    for (const dif of [{ piscina: 'PX' }, { codigo: 'GX' }, { lote: 'LX' }]) {
      const hoja = hojaFalsa([CAB, fila(VIEJA)]);
      const g = gas({ 'Maduración MATRIZ': hoja });
      expect(g.post(alta('2026-07-20')).status).toBe('ok');
      expect(g.post(alta('2026-07-20', dif)).status, JSON.stringify(dif)).toBe('ok');
      expect(hoja.filas, JSON.stringify(dif)).toHaveLength(4);
    }
  });

  /* 🔴 EL RIESGO NUEVO DE LA LLAVE COMPUESTA. La mortalidad y el traslado sólo conocen el Trovan:
     si su fila no llevara la piscina, el código y el lote, no casaría con ninguna y el upsert
     añadiría una fila suelta con un Trovan y una fecha de muerte. Se comprueba con el constructor
     REAL y con el índice que arma el cliente de verdad. */
  it('🔴 la mortalidad marca a SU hembra y NO añade filas', () => {
    const hoja = hojaFalsa([CAB, fila(VIEJA), fila(NUEVA)]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    expect(g.post(mortalidad('2026-09-12', VIEJA, NUEVA)).status).toBe('ok');
    expect(hoja.filas).toHaveLength(3);                    // cabecera + las dos: NINGUNA nueva
    expect(celda(hoja, 2, 'Estado')).toBe('Muerto');       // la vigente (NUEVA)
    expect(celda(hoja, 2, 'Fecha muerte')).toBe('2026-09-12');
    expect(hoja.filas[1]).toEqual(fila(VIEJA));            // la otra, sin tocar
  });

  it('🔴 el traslado también va a SU fila, sin añadir ninguna', () => {
    const hoja = hojaFalsa([CAB, fila(VIEJA), fila(NUEVA)]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    const t = buildTransferBatch({ fecha: '2026-09-12', tipo: REPRO_TRANSFER_TIPO.TRASLADO,
      origen: { sala: 'S3', tanque: 'T4' }, destinos: [{ sala: 'S9', tanque: 'T9', ids: [CHIP] }],
      composicion: {}, matrixIndex: indiceComoElCliente(VIEJA, NUEVA), trId: 'TR-000009' });
    expect(g.post(t.matriz).status).toBe('ok');
    expect(hoja.filas).toHaveLength(3);
    expect(celda(hoja, 2, 'Sala actual')).toBe('S9');
    expect(celda(hoja, 2, 'Tanque actual')).toBe('T9');
    expect(hoja.filas[1]).toEqual(fila(VIEJA));
  });

  it('el fixture ejerce algo: si la identidad NO viajara, la hoja ganaría una fila', () => {
    /* Control del riesgo de arriba: se manda la mortalidad a mano SIN la cuaterna, como la armaba
       el cliente antes del 2026-09-16. Si esto no añadiera una fila, las dos pruebas anteriores no
       estarían midiendo nada. */
    const hoja = hojaFalsa([CAB, fila(VIEJA), fila(NUEVA)]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    const aMedias = { sheetName: 'Maduración MATRIZ', headers: CAB, keyCols: [1, 3, 4, 5],
      rows: [fila({ 'Trovan ID': CHIP, 'Estado': 'Muerto', 'Fecha muerte': '2026-09-12' })] };
    expect(g.post(aMedias).status).toBe('ok');
    expect(hoja.filas).toHaveLength(4);                    // la fila suelta que hay que evitar
  });

  it('las fechas de la hoja como FECHAS de Sheets (Date) o como dd/mm/yyyy valen igual', () => {
    const conDate = Object.assign({}, VIEJA, { 'Fecha muerte': new Date(Date.UTC(2026, 6, 8)), 'Fecha ingreso': new Date(Date.UTC(2026, 0, 5)) });
    const hoja = hojaFalsa([CAB, fila(conDate)]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    expect(g.post(alta('2026-07-20')).status).toBe('ok');
    expect(hoja.filas).toHaveLength(3);
  });
});

/* ⚠ `formatoFinal` vivía dentro del bloque de la MATRIZ que se reescribió el 2026-09-16 y se fue
   con él, aunque su único consumidor es el describe de abajo. Vuelve AQUÍ, a su lado. */
const formatoFinal = (hoja, fila, col) => {
  let f = '';
  for (const [r, c, nR, nC, fmt] of hoja.formatos) if (fila >= r && fila < r + nR && col >= c && col < c + nC) f = fmt;
  return f;
};
describe('GAS · P15 las fechas se formatean una vez por fecha distinta · P16 «Número» no queda con formato de fecha', () => {
  it('🔴 P15 · escribir en la Bitácora ya no formatea la fecha de CADA fila de la hoja', () => {
    const CAB = ['Trovan ID', 'Fecha', 'Tipo', 'Sala', 'Tanque', 'Observaciones'];
    const hoja = hojaFalsa([CAB]);
    const g = gas({ 'Maduración Bitácora': hoja });
    for (let i = 0; i < 60; i++) hoja.filas.push(['00082100' + String(i % 30).padStart(2, '0'), g.fecha(1 + (i % 3)), i % 2 ? 'Desove' : 'Mortalidad', 'S1', 'T1', '']);
    expect(g.post({ sheetName: 'Maduración Bitácora', headers: CAB, rows: [['000821AAAA', '2026-09-10', 'Desove', 'S1', 'T1', '']] }).status).toBe('ok');
    expect(g.fechasFormateadas()).toBe(3);        // 3 fechas distintas; antes, 60
    expect(g.zonasPedidas()).toBe(1);             // la zona, UNA vez; antes, 60
  });
  it('🔴 P15 · ?p=rows con columnas de fecha: una llamada por fecha distinta, y el mismo texto', () => {
    const CAB = ['Trovan ID', 'Fecha ingreso', 'Fecha muerte'];
    const hoja = hojaFalsa([CAB]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    for (let i = 0; i < 50; i++) hoja.filas.push(['00082100' + String(i).padStart(2, '0'), g.fecha(1 + (i % 2)), g.fecha(20)]);
    const r = g.leer({ p: 'rows', sheet: 'Maduración MATRIZ' });
    expect(r.rows).toHaveLength(50);
    expect(r.rows[1]['Fecha ingreso']).toBe('2026-09-02');
    expect(r.rows[1]['Fecha muerte']).toBe('2026-09-20');
    expect(g.fechasFormateadas()).toBe(3);        // antes, 100
    expect(g.zonasPedidas()).toBe(1);
  });
  it('🔴 P16 · la columna «Número» de la MATRIZ termina en formato automático y el Trovan en texto, al añadir y al fusionar', () => {
    const hoja = hojaFalsa([REPRO_MATRIZ_HEADERS]);
    const g = gas({ 'Maduración MATRIZ': hoja });
    const alta = buildAltaBatch([{ trovan: '000821BC99', numero: '7', sala: 'S1', tanque: 'T1', fecha: '2026-09-10' }], null).payload;
    expect(g.post(alta).status).toBe('ok');
    expect(formatoFinal(hoja, 2, 1)).toBe('General');
    expect(formatoFinal(hoja, 2, 2)).toBe('@');
    const muerte = { sheetName: 'Maduración MATRIZ', headers: REPRO_MATRIZ_HEADERS, rows: [REPRO_MATRIZ_HEADERS.map((h) => ({ 'Trovan ID': '000821BC99', Estado: 'Muerto', 'Fecha muerte': '2026-09-12' })[h] ?? '')] };
    expect(g.post(muerte).status).toBe('ok');
    expect(hoja.filas).toHaveLength(2);           // fusionó
    expect(formatoFinal(hoja, 2, 1)).toBe('General');
  });
  it('P16 · la fecha de la columna 1 de las hojas que SÍ la llevan conserva su formato de fecha', () => {
    const hoja = hojaFalsa([TANQUES]);
    const g = gas({ 'Maduración Tanques': hoja });
    expect(g.post({ sheetName: 'Maduración Tanques', headers: TANQUES, rows: [conValores(TANQUES, { Fecha: '2026-09-13', Sala: 'Sala 4', Tanque: 1, Muda: 1 })] }).status).toBe('ok');
    expect(formatoFinal(hoja, 2, 1)).toBe('dd/mm/yyyy');
  });
});
