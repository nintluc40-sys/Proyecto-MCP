// @vitest-environment happy-dom
/* ============================================================
   🌦 CLIMA EN LA CARGA DEL LIBRO (2026-10-27, Sesión A ronda 9, tarea 1 · F2a)

   El Apps Script APARTE «MCP · clima» (GAS/Clima.gs) escribe en el libro «Clima horas» (una fila por hora) y «Clima»
   (una por día: «Registro» y el «Pronóstico» de los 3 días siguientes). El MCP baja TODAS las pestañas, así que esas
   filas entran en el store como las demás.
   🔴 Lo que se evita: `applySheets` saca de ellas la fecha más reciente del store (`latestDateMs`, el «hasta» de los
   botones de 7 y 30 días). Sólo dejaba fuera a «Marea»: con el clima, el pronóstico la llevaría hasta 3 días al futuro,
   y «Clima horas» —se escribe cada 3 h— la dejaría SIEMPRE en hoy aunque el último registro del laboratorio fuera de
   ayer.
   Las cabeceras NO se teclean: se le piden a GAS/Clima.gs (COL_HORAS y COL_DIAS), que es quien escribe las hojas.
   La carga es la de producción (`workbookToSheets`, que sella el origen por el NOMBRE, y `applySheets`), con un libro
   REAL escrito con el SheetJS del proyecto. Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyOrigin, detectSheetName, workbookToSheets, applySheets } from './sheets.js';
import { store } from './store.js';

const GAS = new Function(readFileSync(join(process.cwd(), 'GAS/Clima.gs'), 'utf8') + '\nreturn { COL_HORAS, COL_DIAS, CLIMA };')();
const VENDOR = join(process.cwd(), 'public/vendor/xlsx.full.min.js');
/** Una fila con esas cabeceras y valores vacíos: detectSheetName sólo mira las CLAVES. */
const filaDe = (cabeceras) => Object.fromEntries(cabeceras.map((c) => [c, '']));
const fila = (cabeceras, valores) => cabeceras.map((c) => (c in valores ? valores[c] : ''));

describe('Clima · el origen de sus dos hojas', () => {
  it('por el NOMBRE: los que escribe GAS/Clima.gs', () => {
    expect(GAS.CLIMA.hojaHoras).toBe('Clima horas');
    expect(GAS.CLIMA.hojaDias).toBe('Clima');
    expect(classifyOrigin(GAS.CLIMA.hojaHoras)).toBe('Clima horas');
    expect(classifyOrigin(GAS.CLIMA.hojaDias)).toBe('Clima');
    expect(classifyOrigin(' clima  HORAS ')).toBe('Clima horas');   // «horas» antes que «Clima»
    // la regla normaliza la grafía (con el nombre EXACTO no se notaría: sin regla, el origen es el nombre crudo)
    expect(classifyOrigin('CLIMA')).toBe('Clima');
  });

  it('una pestaña que sólo EMPIEZA por «clima» no es una de ellas', () => {
    expect(classifyOrigin('Climatización')).toBe('Climatización');
    expect(classifyOrigin('Marea')).toBe('Marea');
  });

  it('por las COLUMNAS (un gid sin título) y por la tubería real, el mismo origen que por el nombre', () => {
    const horas = detectSheetName([filaDe(GAS.COL_HORAS)], 0);
    const dias = detectSheetName([filaDe(GAS.COL_DIAS)], 0);
    expect(horas).toBe('Clima horas');
    expect(dias).toBe('Clima');
    // lo que acaba en la fila es classifyOrigin(detectSheetName(…)): tiene que ser un punto fijo
    expect(classifyOrigin(horas)).toBe('Clima horas');
    expect(classifyOrigin(dias)).toBe('Clima');
    // un título ya canónico cae a las columnas (detectSheetName.test.js): también dan lo suyo
    expect(detectSheetName([filaDe(GAS.COL_HORAS)], 0, 'Clima horas')).toBe('Clima horas');
    expect(detectSheetName([filaDe(GAS.COL_DIAS)], 0, 'Clima')).toBe('Clima');
  });
});

describe('Clima · NO cuenta para la fecha más reciente del store', () => {
  let X;
  beforeAll(() => {
    new Function(readFileSync(VENDOR, 'utf8'))(); // su cola UMD deja window.XLSX, como el <script> de index.html
    X = window.XLSX;
  });

  /** El libro: Larvicultura con su último registro el 25/10, y las hojas de clima y la marea con fechas POSTERIORES. */
  function cargar(conClima) {
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
      ['Fecha', 'Corrida', 'Tanque', 'Supervivencia'],
      ['24/10/2026', 900, 'T1', 85.5],
      ['25/10/2026', 900, 'T1', 80],
    ]), 'Datos Larvicultura - M01');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
      ['Fecha', 'Fase Lunar', 'Pleamar 1'],
      ['15/11/2026', 'Llena', '04:12'],
    ]), 'Marea');
    if (conClima) {
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
        GAS.COL_HORAS,
        fila(GAS.COL_HORAS, { Fecha: '27/10/2026', Hora: 15, Fuente: 'Observado SESA', 'Temperatura (°C)': 27.5 }),
        fila(GAS.COL_HORAS, { Fecha: '27/10/2026', Hora: 23, Fuente: 'MET', 'Temperatura (°C)': 23.1 }),
      ]), GAS.CLIMA.hojaHoras);
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
        GAS.COL_DIAS,
        fila(GAS.COL_DIAS, { Fecha: '26/10/2026', Tipo: 'Registro', 'Temp media (°C)': 24.8 }),
        fila(GAS.COL_DIAS, { Fecha: '30/10/2026', Tipo: 'Pronóstico', 'Temp máx (°C)': 29 }),
      ]), GAS.CLIMA.hojaDias);
    }
    const sheets = workbookToSheets(X.read(X.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' }), X);
    applySheets(sheets);
    return sheets;
  }
  const dia = (ms) => { const d = new Date(ms); return [d.getDate(), d.getMonth() + 1, d.getFullYear()]; };

  it('sin clima, la fecha más reciente es la del laboratorio (la marea, futura, ya no contaba)', () => {
    cargar(false);
    expect(dia(store.latestDateMs)).toEqual([25, 10, 2026]);
  });

  it('con las dos hojas de clima, sigue siendo la del laboratorio: ni el pronóstico ni las horas de hoy la mueven', () => {
    const sheets = cargar(true);
    // las filas entran en el store, cada una con su origen (lo leerá la pastilla «🌦 Hoy»)
    expect(sheets[GAS.CLIMA.hojaHoras].map((r) => r._SheetOrigin)).toEqual(['Clima horas', 'Clima horas']);
    expect(sheets[GAS.CLIMA.hojaDias].map((r) => r._SheetOrigin)).toEqual(['Clima', 'Clima']);
    expect(store.globalData.filter((r) => r._SheetOrigin === 'Clima horas')).toHaveLength(2);
    expect(dia(store.latestDateMs)).toEqual([25, 10, 2026]);
  });
});
