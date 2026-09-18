/* PARIDAD · Control Broodstock de Maduración (V1, 2026-09-18). El modelo y el LECTOR de la hoja viven en el módulo y
   como bloque inline en engine.js (los monolitos de Music no tienen módulos): se extrae el bloque REAL y se exige lo
   mismo, sobre hojas con la forma de los archivos del usuario —la plantilla de septiembre, la de julio sin
   «Camaronera», las erratas de fecha, las notas, una fila TOTAL, el sistema de 1904— y valores FICTICIOS (usuario,
   2026-09-18: las pruebas no llevan valores reales). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import {
  MAD_BS_SHEET, MAD_BS_HEADERS, MAD_BS_KEY_COLS, MAD_BS_FASES, MAD_BS_COLUMNS, MAD_BS_CABECERAS, MAD_BS_SUFIJO_CAMARONERA,
  faseCanonica, normPiscina, normCodigo, diaReal, diasEntre, tieneDatos,
  buildBroodstockPayload, validarBroodstock, leerHojaBroodstock, leerLibroBroodstock, cortesRepetidos, diaDeCelda, letraCol,
} from './ficha-maduracion-broodstock.schema.js';

const src = readFileSync(new URL('../../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');
function bloque(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}
const ctx = { String, Number, Object, Array, JSON, Math, Date, Set, Map, isNaN, parseInt, parseFloat, isFinite, sanitizeStr };
ctx.globalThis = ctx;
createContext(ctx);
new Script(bloque('const MAD_BS_SHEET = "Maduración Broodstock";', '  return Array.from(rep).sort();\n}')
  + '\n;globalThis.__api = { MAD_BS_SHEET, MAD_BS_HEADERS, MAD_BS_KEY_COLS, MAD_BS_FASES, MAD_BS_COLUMNS, MAD_BS_CABECERAS, MAD_BS_SUFIJO_CAMARONERA,'
  + ' madBsFaseCanonica, madBsNormPiscina, madBsNormCodigo, madBsDiaReal, madBsDiasEntre, madBsTieneDatos, buildMadBsPayload,'
  + ' madBsValidar, madBsLeerHoja, madBsLeerLibro, madBsCortesRepetidos, madBsDiaDeCelda, madBsLetraCol };').runInContext(ctx);
const api = ctx.__api;
/* Lo que sale del reino del vm se compara por su JSON: un array de allí no es `instanceof Array` de aquí. */
const J = (x) => JSON.parse(JSON.stringify(x));

/* ── Hojas con la forma de las de SheetJS ── */
const S = (v) => ({ t: 's', v, w: v, z: 'General' });
const N = (v, z) => ({ t: 'n', v, w: String(v), z: z || 'General' });
const PCT = (v) => ({ t: 'n', v, w: Math.round(v * 100) + '%', z: '0%' });
const F = (serial, z) => ({ t: 'n', v: serial, z: z || 'dd/mm/yy;@' });
const CAB_SEP = ['Piscina', 'Area (ha)', 'Fecha siembra', 'Cantidad Sembrada ', 'Densidad (cam/m2)', 'Peso de siembra ', 'FASE ACTUAL', 'PESOS', '', '', '', '',
  'Inc. Ult. Sem', 'Crecimiento fase actual', 'Sobrev. Estim (%)', 'Dias Cultivos Fase 1 (precria)', 'Dias en fase 2 (engorde)',
  'Dias de cultivo fase 3 (prereproductor)', 'Edad total (dias)', 'Psc. Orig', 'Camaronera', 'Codigo', 'OBSERVACION'];
const CAB_JUL = CAB_SEP.filter((h) => h !== 'Camaronera');
function hoja({ cab = CAB_SEP, fechas = [46103, 46110, 46117, 46094, 46131], corte = F(46131, 'm/d/yy'), filas = [] } = {}) {
  const ws = { A1: S('RESUMEN SEMANAL'), A4: S('BROODSTOCK - PRUEBA') };
  if (corte) ws.A3 = corte;
  cab.forEach((h, c) => { if (h) ws[letraCol(c) + '5'] = S(h); });
  fechas.forEach((f, i) => { ws[letraCol(7 + i) + '6'] = typeof f === 'number' ? F(f) : f; });
  const colDe = (k) => { const i = cab.indexOf(k); return i === -1 ? k : letraCol(i); };
  filas.forEach((f, i) => Object.entries(f).forEach(([k, celda]) => { ws[colDe(k) + (7 + i)] = celda; }));
  ws['!ref'] = 'A1:' + letraCol(Math.max(cab.length - 1, 22)) + (6 + Math.max(filas.length, 1));
  return ws;
}
const R815 = { Piscina: N(815), 'Area (ha)': N(0.30), 'Fecha siembra': F(46101, 'd-mmm-yy'), 'Cantidad Sembrada ': N(2900, '#,##0'),
  'Peso de siembra ': N(21), 'FASE ACTUAL': S('Pre-reproductor'), H: N(21), I: N(27), J: N(32), K: N(38), L: N(45),
  'Sobrev. Estim (%)': PCT(0.86), 'Dias Cultivos Fase 1 (precria)': N(0), 'Dias en fase 2 (engorde)': N(90),
  'Dias de cultivo fase 3 (prereproductor)': N(30), 'Psc. Orig': N(810), Camaronera: S('Chongón'), Codigo: S('XPR6.F6'), OBSERVACION: S('LÍNEA DE PRUEBA') };
const R810 = { Piscina: N(810), 'Area (ha)': N(0.40), 'Fecha siembra': F(46124, 'd-mmm-yy'), 'Cantidad Sembrada ': N(333000),
  'Peso de siembra ': S('120.pl'), 'FASE ACTUAL': S('PRECRIA'), L: N(0.12, '0.00'), 'Sobrev. Estim (%)': PCT(0.92),
  'Dias Cultivos Fase 1 (precria)': N(7), Codigo: S('XPR1. F9'), OBSERVACION: S('LÍNEA DE PRUEBA') };
const sin = (o, k) => { const x = { ...o }; delete x[k]; return x; };

const HOJAS = {
  'septiembre, con K6 errada': hoja({ filas: [R815, R810, { Piscina: N(811), 'Area (ha)': N(0.30) }] }),
  'julio, sin Camaronera y origen con letras': hoja({ cab: CAB_JUL, filas: [{ ...sin(R815, 'Camaronera'), 'Psc. Orig': S('902 ch') }] }),
  'L6 distinta del corte': hoja({ corte: F(46138, 'm/d/yy'), fechas: [46110, 46117, 46094, 46131, 46108], filas: [R815] }),
  'sin K, sin L y con un 0': hoja({ filas: [sin(R815, 'K'), { ...sin(R815, 'L'), Piscina: N(817) }, { ...R815, Piscina: N(818), L: N(0) }] }),
  'notas, TOTAL y números sueltos': hoja({ filas: [R815, {}, { C: S('NOTA: RALEADAS') }, { Piscina: S('TOTAL'), 'Cantidad Sembrada ': N(9) }, { E: N(0) }] }),
  'sin fecha de corte': hoja({ corte: null, filas: [R815] }),
  'corte sin formato de fecha': hoja({ corte: N(46131), filas: [R815] }),
  'sin Código': hoja({ cab: CAB_SEP.map((h) => (h === 'Codigo' ? '' : h)), filas: [R815] }),
  'con una columna rara': hoja({ cab: CAB_SEP.concat(['Tallas']), filas: [R815] }),
  'pesos de siembra raros y sobrevivencias': hoja({ filas: [{ ...R815, 'Peso de siembra ': S('pendiente') }, { ...R810, Piscina: N(812), 'Peso de siembra ': S('120 pl/g'), 'Sobrev. Estim (%)': S('95,5 %') },
    { ...R815, Piscina: N(813), 'Sobrev. Estim (%)': N(0.95) }, { ...R815, Piscina: N(814), 'Fecha siembra': S('31/02/2026') }, { ...R815, Piscina: N(816), 'Fecha siembra': S('20/03/26') }] }),
  'la misma piscina dos veces': hoja({ filas: [R815, R815] }),
  'fechas de pesos ilegibles': hoja({ fechas: [S('x'), 46110, 46117, 46124, 46131], filas: [R815] }),
  'notas que nombran piscinas, con y sin datos (punto 8)': hoja({ filas: [R815, { Piscina: N(811), 'Area (ha)': N(0.30) }, {},
    { C: S('PISCINAS 815 Y 811 RALEADAS') }, { C: S('REVISAR 8150') }, { C: S('PISCINA 815 RALEADA') }] }),
  'origen con camaronera pegada, desconocida y en conflicto (punto 10)': hoja({ filas: [{ ...R815, 'Psc. Orig': S('902 ch'), Camaronera: S('') },
    { ...R815, Piscina: N(816), 'Psc. Orig': S('903 xy') }, { ...R815, Piscina: N(817), 'Psc. Orig': S('904ch'), Camaronera: S('Taura') }] }),
  'observación larga con su nota: pasa de 200 caracteres (punto 8)': hoja({ filas: [{ ...R815, OBSERVACION: S('OBSERVACIÓN LARGA '.repeat(9).trim()) }, {},
    { C: S('PISCINA 815 RALEADA Y CON RECAMBIO DE AGUA AL 30 POR CIENTO') }] }),
  'bloque auxiliar a la derecha de la tabla (punto 8)': (() => {
    const ws = hoja({ filas: [R815, {}, { C: S('PISCINA 815 RALEADA'), AL: S('H') }, { AG: S('815 BLOQUE AUXILIAR') }] });
    ws['!ref'] = 'A1:BP10';
    return ws;
  })(),
  'sin cabecera': { A1: S('Otra cosa'), A2: N(3), '!ref': 'A1:B2' },
  'vacía': {},
};

describe('Broodstock · el monolito y el módulo dicen lo mismo', () => {
  it('la misma hoja, columnas, llave, fases y cabeceras', () => {
    expect(api.MAD_BS_SHEET).toBe(MAD_BS_SHEET);
    expect(J(api.MAD_BS_HEADERS)).toEqual(MAD_BS_HEADERS);
    expect(J(api.MAD_BS_KEY_COLS)).toEqual(MAD_BS_KEY_COLS);
    expect(J(api.MAD_BS_FASES)).toEqual(MAD_BS_FASES);
    expect(J(api.MAD_BS_COLUMNS)).toEqual(J(MAD_BS_COLUMNS));
    expect(J(api.MAD_BS_SUFIJO_CAMARONERA)).toEqual(MAD_BS_SUFIJO_CAMARONERA);
    expect(J(api.MAD_BS_CABECERAS.map((d) => [d.k, !!d.obligatoria, !!d.calculada]))).toEqual(MAD_BS_CABECERAS.map((d) => [d.k, !!d.obligatoria, !!d.calculada]));
  });

  it('las mismas piezas', () => {
    const txt = ['PRECRIA', 'Precría', 'pre reproductor', 'Pre-reproductor', 'ENGORDE', 'Otra', '', null, ' 81 5 ', 'XPR5. F1 (A1BC-DEFGH.6G)', '=+1', 815];
    for (const v of txt) {
      expect(api.madBsFaseCanonica(v), String(v)).toBe(faseCanonica(v));
      expect(api.madBsNormPiscina(v), String(v)).toBe(normPiscina(v));
      expect(api.madBsNormCodigo(v), String(v)).toBe(normCodigo(v));
    }
    for (const [a, b] of [['2026-03-20', '2026-04-19'], ['2026-02-31', '2026-04-19'], ['2026-12-31', '2027-01-01'], ['', '2026-01-01'], ['20/03/2026', '2026-04-19']]) {
      expect(api.madBsDiaReal(a)).toBe(diaReal(a));
      expect(api.madBsDiasEntre(a, b)).toBe(diasEntre(a, b));
    }
    for (const p of [{}, { area: 1 }, { cantidad: '0' }, { fechaSiembra: '2026-03-20' }, { peso: 'x' }, { fase: 'Engorde' }, null]) {
      expect(api.madBsTieneDatos(p), JSON.stringify(p)).toBe(tieneDatos(p));
    }
    for (const c of [F(46131), F(46131.99), N(46131), S('20/03/2026'), S('2026-03-20'), S('31/02/2026'), null, { t: 'd', v: new Date(2026, 3, 19, 23, 30) },
      F(46131, '"Día y"0'), F(46131, '"Corte: "dd/mm/yy'), F(46131, '[$-409]0.00'), F(46131, '[$-409]d-mmm-yy'), F(46131, 'dd"x'), F(46131, '0"d')]) {
      expect(api.madBsDiaDeCelda(c)).toBe(diaDeCelda(c));
      expect(api.madBsDiaDeCelda(c, true, true)).toBe(diaDeCelda(c, true, true));
    }
    expect([0, 25, 26, 29, 51].map((c) => api.madBsLetraCol(c))).toEqual([0, 25, 26, 29, 51].map(letraCol));
  });

  for (const [nombre, ws] of Object.entries(HOJAS)) {
    it('la misma LECTURA, el mismo payload y el mismo veredicto con la hoja «' + nombre + '»', () => {
      const a = api.madBsLeerHoja(ws), b = leerHojaBroodstock(ws);
      expect(J(a)).toEqual(J(b));
      expect(J(api.buildMadBsPayload(a))).toEqual(J(buildBroodstockPayload(b)));
      expect(J(api.madBsValidar(a))).toEqual(J(validarBroodstock(b)));
      expect(J(api.madBsLeerHoja(ws, { fecha1904: true }))).toEqual(J(leerHojaBroodstock(ws, { fecha1904: true })));
    });
  }

  it('el mismo LIBRO: hojas elegibles, ignoradas y cortes repetidos', () => {
    const libro = { SheetNames: Object.keys(HOJAS), Sheets: HOJAS };
    expect(J(api.madBsLeerLibro(libro))).toEqual(J(leerLibroBroodstock(libro)));
    const conMac = { ...libro, Workbook: { WBProps: { date1904: true } } };
    expect(J(api.madBsLeerLibro(conMac))).toEqual(J(leerLibroBroodstock(conMac)));
    const hs = [{ fechaCorte: '2026-04-19' }, { fechaCorte: '2026-04-26' }, { fechaCorte: '2026-04-19' }, { fechaCorte: 'x' }];
    expect(J(api.madBsCortesRepetidos(hs))).toEqual(cortesRepetidos(hs));
  });

  it('el fixture ejerce algo: hay hojas con errores, con avisos, con notas y con piscinas vacías', () => {
    const l = Object.values(HOJAS).map((ws) => leerHojaBroodstock(ws));
    expect(l.some((x) => x.errores.length)).toBe(true);
    expect(l.some((x) => x.avisos.length)).toBe(true);
    expect(l.some((x) => x.notas.length)).toBe(true);
    expect(l.some((x) => !x.esBroodstock)).toBe(true);
    expect(l.some((x) => x.piscinas.some((p) => p.plg === 120))).toBe(true);
  });
});
