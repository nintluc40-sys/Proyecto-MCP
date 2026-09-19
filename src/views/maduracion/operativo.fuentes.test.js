/* ============================================================
   MADURACIÓN · OPERATIVO — las fuentes del tablero (Fase 0.1)

   Qué se exige:
   1 · Cada FIRMA está en su hoja y en NINGUNA otra de las trece de Maduración. Las cabeceras no se
       teclean aquí: salen de los módulos de esquema y, para Sala y Tanques, del propio monolito. Y las
       VIEJAS de Ingreso y Lotes, que siguen en producción hasta el vaciado A2, también se reconocen.
   2 · Las fechas del export (`dd/mm/aaaa` y `aaaa-mm-dd`) salen en `aaaa-mm-dd`, y así ORDENAN bien.
   3 · Los números salen como números, sin tocar los códigos con cero a la izquierda.
   4 · 🔑 El libro y el resumen calculados desde el export ADAPTADO son los mismos que desde `?p=rows`,
       y desde el export SIN adaptar NO lo son: si no, estas pruebas no probarían que el adaptador hace
       falta, sólo que no estorba.
   Datos FICTICIOS (regla del usuario: las pruebas no llevan valores reales).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MAD_OP_HOJAS, MAD_OP_ORIGEN, fechaIso, numeroDeCelda, normalizarFila, hojaDeFila, fuentesDesdeFilas,
} from './operativo.fuentes.js';
import { classifyOrigin } from '../../core/sheets.js';
import { MAD_INGRESO_HEADERS } from '../registros/lib/ficha-maduracion-ingreso.schema.js';
import { MAD_MOV_HEADERS } from '../registros/lib/ficha-maduracion-movimientos.schema.js';
import { MAD_DESOVE_HEADERS } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { MAD_MORT_HEADERS } from '../registros/lib/ficha-maduracion-mortdesove.schema.js';
import { MAD_FIN_HEADERS } from '../registros/lib/ficha-maduracion-fin-ciclo.schema.js';
import { MAD_TRAT_HEADERS } from '../registros/lib/ficha-maduracion-tratamientos.schema.js';
import { MAD_ALIM_HEADERS } from '../registros/lib/ficha-maduracion-alimentacion.schema.js';
import { MAD_BS_HEADERS } from '../registros/lib/ficha-maduracion-broodstock.schema.js';
import { REPRO_MATRIZ_HEADERS, REPRO_BITACORA_HEADERS, REPRO_TRANSFER_HEADERS } from '../registros/lib/reproductivo.data.js';
import { construirLibro } from '../registros/lib/mad-libro.js';
import { resumenMaduracion } from '../registros/lib/mad-resumen.js';

const ENGINE = readFileSync(new URL('../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');

/** El literal de array que empieza en `desde`, saltando cadenas y comentarios (la cabecera de Sala
 *  lleva comentarios dentro, y alguno contiene corchetes). */
function arrayLiteral(src, desde) {
  const a = src.indexOf('[', desde);
  let prof = 0;
  for (let i = a; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") { i = src.indexOf(c, i + 1); continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '[') prof++;
    else if (c === ']' && --prof === 0) return src.slice(a, i + 1);
  }
  throw new Error('array sin cerrar');
}
/** Las cabeceras que EMITE el monolito para una hoja (las de Sala y Tanques sólo viven allí). */
function cabecerasDelMonolito(hoja) {
  const i = ENGINE.indexOf('sheetName: "' + hoja + '"');
  if (i < 0) throw new Error('engine.js no escribe la hoja ' + hoja);
  return new Function('return ' + arrayLiteral(ENGINE, ENGINE.indexOf('headers:', i)))();
}
const SALA_HEADERS = cabecerasDelMonolito('Maduración Sala');
const TANQUES_HEADERS = cabecerasDelMonolito('Maduración Tanques');

/* Las cabeceras VIEJAS que siguen en producción (medidas el 2026-09-19): con ellas el GAS rechaza los
   envíos hasta el vaciado A2, pero sus filas de prueba siguen llegando al tablero. */
const INGRESO_VIEJA = ['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Camaronera origen', 'Grupo', 'Sala', 'Tanque',
  'Machos', 'Hembras', 'Peso promedio machos (g)', 'Peso promedio hembras (g)', 'Supervivencia piscina (%)', 'Camarones por m2',
  'Densidad de siembra', 'Agua', 'ID'];
const LOTES_VIEJA = ['Fecha', 'Lote', 'Código genético', 'Piscina Broodstock', 'Desoves', 'Total de huevos', 'Total de nauplios',
  'No viables', 'Fecha N2', 'N2', 'Fecha N5', 'N5', 'Despacho', 'Observaciones'];

const CABECERAS = {
  ingresos: [MAD_INGRESO_HEADERS, INGRESO_VIEJA], movimientos: [MAD_MOV_HEADERS], desoves: [MAD_DESOVE_HEADERS, LOTES_VIEJA],
  mortDesove: [MAD_MORT_HEADERS], cierres: [MAD_FIN_HEADERS], tratamientos: [MAD_TRAT_HEADERS], alimentacion: [MAD_ALIM_HEADERS],
  broodstock: [MAD_BS_HEADERS], sala: [SALA_HEADERS], tanques: [TANQUES_HEADERS],
};
const REPRODUCTIVO = [REPRO_MATRIZ_HEADERS, REPRO_BITACORA_HEADERS, REPRO_TRANSFER_HEADERS];

/** Una fila como la deja el export: TODAS las columnas de su hoja (defval ''), todo como texto. */
function filaExport(cabeceras, valores, origen = MAD_OP_ORIGEN) {
  const r = { _SheetOrigin: origen };
  for (const h of cabeceras) r[h] = '';
  for (const [k, v] of Object.entries(valores || {})) r[k] = String(v);
  return r;
}

describe('Maduración · operativo · las firmas reconocen cada hoja', () => {
  it('las diez hojas del registro, una vez cada una, y todas llegan con el origen genérico «Maduracion»', () => {
    expect(new Set(MAD_OP_HOJAS.map((h) => h.hoja)).size).toBe(10);
    expect(new Set(MAD_OP_HOJAS.map((h) => h.clave)).size).toBe(10);
    // Si algún día classifyOrigin les diera origen propio, hojaDeFila dejaría de verlas: esto lo avisaría.
    for (const h of MAD_OP_HOJAS) expect(classifyOrigin(h.hoja), h.hoja).toBe(MAD_OP_ORIGEN);
  });

  it('Sala y Tanques se llaman como en el MAD_SHEET del monolito', () => {
    expect(ENGINE).toMatch(/const MAD_SHEET\s*=\s*\{[^}]*"Maduración Sala"[^}]*"Maduración Tanques"/);
    expect(MAD_OP_HOJAS.find((h) => h.clave === 'sala').hoja).toBe('Maduración Sala');
    expect(MAD_OP_HOJAS.find((h) => h.clave === 'tanques').hoja).toBe('Maduración Tanques');
  });

  it('cada firma está en su hoja —también en su cabecera vieja— y en ninguna otra de las trece', () => {
    for (const h of MAD_OP_HOJAS) {
      for (const cab of CABECERAS[h.clave]) expect(cab, h.clave).toContain(h.firma);
      for (const [otra, cabs] of Object.entries(CABECERAS)) {
        if (otra !== h.clave) for (const cab of cabs) expect(cab, '«' + h.firma + '» también está en ' + otra).not.toContain(h.firma);
      }
      for (const cab of REPRODUCTIVO) expect(cab, '«' + h.firma + '» en el reproductivo').not.toContain(h.firma);
    }
  });

  it('una fila del export se asigna a su hoja; las de otros orígenes y las desconocidas, no', () => {
    for (const h of MAD_OP_HOJAS) {
      for (const cab of CABECERAS[h.clave]) expect(hojaDeFila(filaExport(cab))?.clave, h.clave).toBe(h.clave);
    }
    expect(hojaDeFila(filaExport(REPRO_MATRIZ_HEADERS, {}, 'Maduración MATRIZ'))).toBe(null);
    // Otro origen con una columna del mismo nombre que una firma: tampoco entra.
    expect(hojaDeFila(filaExport(['Fecha', 'Machos muertos'], {}, 'Maduración Bitácora'))).toBe(null);
    expect(hojaDeFila(filaExport(['Fecha', 'Sala', 'Algo nuevo']))).toBe(null);
  });
});

describe('Maduración · operativo · fechas y números con la forma de ?p=rows', () => {
  it('las dos formas del export salen en aaaa-mm-dd', () => {
    expect(fechaIso('29/08/2026')).toBe('2026-08-29');
    expect(fechaIso('5/9/2026')).toBe('2026-09-05');
    expect(fechaIso('2026-09-16')).toBe('2026-09-16');
    expect(fechaIso('2026-09-16T05:00:00.000Z')).toBe('2026-09-16');
    expect(fechaIso(new Date(2026, 8, 5, 12))).toBe('2026-09-05');
    expect(fechaIso('')).toBe('');
  });

  it('lo que no es un día real se deja a la vista, no se inventa', () => {
    expect(fechaIso('31/02/2026')).toBe('31/02/2026');
    expect(fechaIso('2026-02-30')).toBe('2026-02-30');
    // Con hora detrás, un día que no existe tampoco se recorta a una «fecha» de diez caracteres.
    expect(fechaIso('2026-02-30T05:00:00.000Z')).toBe('2026-02-30T05:00:00.000Z');
    expect(fechaIso('pendiente')).toBe('pendiente');
  });

  it('🔴 convertidas ORDENAN bien; como texto del export, no (por eso hace falta)', () => {
    const exportadas = ['16/09/2026', '29/08/2026', '01/09/2026'];
    expect([...exportadas].sort()).toEqual(['01/09/2026', '16/09/2026', '29/08/2026']);   // el orden equivocado
    expect(exportadas.map(fechaIso).sort()).toEqual(['2026-08-29', '2026-09-01', '2026-09-16']);
  });

  it('números como números: enteros, decimales con punto y miles con coma', () => {
    expect(numeroDeCelda('12')).toBe(12);
    expect(numeroDeCelda('26.5')).toBe(26.5);
    expect(numeroDeCelda('6500000')).toBe(6500000);
    expect(numeroDeCelda('6,500,000')).toBe(6500000);
    expect(numeroDeCelda('1,234.5')).toBe(1234.5);
    expect(numeroDeCelda('0')).toBe(0);
    expect(numeroDeCelda('0.5')).toBe(0.5);
    expect(numeroDeCelda('-3')).toBe(-3);
    expect(numeroDeCelda(7)).toBe(7);
  });

  it('lo que sólo puede ser una celda de TEXTO se queda como texto', () => {
    expect(numeroDeCelda('0766')).toBe('0766');
    expect(numeroDeCelda('10%')).toBe('10%');
    expect(numeroDeCelda('08:30')).toBe('08:30');
    expect(numeroDeCelda('7,5')).toBe('7,5');
    expect(numeroDeCelda(' BP ')).toBe('BP');
    expect(numeroDeCelda('')).toBe('');
  });

  it('una fila: todas las columnas «Fecha…» a aaaa-mm-dd, el resto a número o texto, las marcas intactas', () => {
    const r = normalizarFila({ _SheetOrigin: MAD_OP_ORIGEN, Fecha: '16/09/2026', 'Fecha N2': '17/09/2026', 'Fecha N5': '2026-09-18',
      'Fecha aplicación': '5/9/2026', Lote: '0766', Machos: '12', Observaciones: ' ok ' });
    expect(r).toEqual({ _SheetOrigin: MAD_OP_ORIGEN, Fecha: '2026-09-16', 'Fecha N2': '2026-09-17', 'Fecha N5': '2026-09-18',
      'Fecha aplicación': '2026-09-05', Lote: '0766', Machos: 12, Observaciones: 'ok' });
    // Una columna de fecha nunca se convierte en número, aunque lo parezca.
    expect(normalizarFila({ Fecha: '45000' }).Fecha).toBe('45000');
  });
});

describe('Maduración · operativo · las fuentes del store', () => {
  it('reparte un store mezclado por hojas, ignora los demás orígenes y cuenta lo que no reconoce', () => {
    const store = [
      filaExport(MAD_INGRESO_HEADERS, { Fecha: '29/08/2026', Lote: 'AA' }),
      filaExport(INGRESO_VIEJA, { Fecha: '29/08/2026', Lote: 'AA' }),
      filaExport(TANQUES_HEADERS, { Fecha: '01/09/2026', Sala: 'Sala 1', Tanque: '1' }),
      filaExport(SALA_HEADERS, { Fecha: '01/09/2026', Sala: 'Sala 1' }),
      filaExport(MAD_BS_HEADERS, { 'Fecha de corte': '12/09/2026', Piscina: '9' }),
      filaExport(REPRO_MATRIZ_HEADERS, { 'Trovan ID': 'T-1' }, 'Maduración MATRIZ'),
      { _SheetOrigin: 'Larvicultura', Fecha: '01/09/2026' },
      filaExport(['Fecha', 'Sala', 'Algo nuevo'], { Fecha: '01/09/2026' }),
    ];
    const { fuentes, sinHoja } = fuentesDesdeFilas(store);
    expect(Object.fromEntries(Object.entries(fuentes).map(([k, v]) => [k, v.length]))).toEqual({
      ingresos: 2, movimientos: 0, desoves: 0, mortDesove: 0, cierres: 0, tratamientos: 0, alimentacion: 0, broodstock: 1, sala: 1, tanques: 1,
    });
    expect(sinHoja).toBe(1);
    expect(fuentes.ingresos[0].Fecha).toBe('2026-08-29');
    expect(fuentes.broodstock[0]['Fecha de corte']).toBe('2026-09-12');
    expect(fuentes.tanques[0].Tanque).toBe(1);
  });

  /* Un lote AA entra el 29-08 y pierde 4 hembras el 01-09; el 16-09 entra BB en el MISMO tanque y el 17-09
     mueren 6 más, que se reparten entre los dos en proporción a sus hembras vivas (16 y 10 → 4 y 2). */
  const P_ROWS = {
    ingresos: [
      { Fecha: '2026-08-29', Lote: 'AA', 'Código genético': 'X1', Sala: 'Sala 1', Tanque: 1, Machos: 10, Hembras: 20 },
      { Fecha: '2026-09-16', Lote: 'BB', 'Código genético': 'Y2', Sala: 'Sala 1', Tanque: 1, Machos: 10, Hembras: 10 },
    ],
    tanques: [
      { Fecha: '2026-09-01', Sala: 'Sala 1', Tanque: 1, 'Machos muertos': '', 'Hembras muertas': 4 },
      { Fecha: '2026-09-17', Sala: 'Sala 1', Tanque: 1, 'Machos muertos': '', 'Hembras muertas': 6 },
    ],
    sala: [{ Fecha: '2026-09-17', Sala: 'Sala 1', Estado: 'Producción', 'Temperatura 2:00': 27.5, 'Temperatura 4:00': 28.5 }],
  };
  const aExport = (hojaCab, filas) => filas.map((f) => filaExport(hojaCab, Object.fromEntries(Object.entries(f).map(([k, v]) =>
    [k, k === 'Fecha' ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) : v]))));
  const STORE = [
    ...aExport(MAD_INGRESO_HEADERS, P_ROWS.ingresos), ...aExport(TANQUES_HEADERS, P_ROWS.tanques), ...aExport(SALA_HEADERS, P_ROWS.sala),
  ];
  const vivos = (libro) => [...libro.lotes.values()].map((L) => [L.lote, L.machos, L.hembras]).sort();

  it('🔑 el libro desde el export ADAPTADO es el mismo que desde ?p=rows', () => {
    const esperado = construirLibro(P_ROWS, { hoy: '2026-09-18' });
    expect(vivos(esperado)).toEqual([['AA', 10, 12], ['BB', 10, 8]]);
    const { fuentes } = fuentesDesdeFilas(STORE);
    const libro = construirLibro(fuentes, { hoy: '2026-09-18' });
    expect(vivos(libro)).toEqual(vivos(esperado));
    expect(libro.avisos).toEqual(esperado.avisos);
  });

  it('🔴 …y desde el export SIN adaptar sale OTRO libro: el orden de dd/mm/aaaa no es el cronológico', () => {
    const crudo = { ingresos: STORE.filter((r) => 'Camaronera origen' in r), tanques: STORE.filter((r) => 'Machos muertos' in r) };
    const libro = construirLibro(crudo, { hoy: '2026-09-18' });
    expect(vivos(libro)).not.toEqual([['AA', 10, 12], ['BB', 10, 8]]);
  });

  it('🔑 el resumen de la sala lee su temperatura desde el export adaptado (sin adaptar, no la ve)', () => {
    const { fuentes } = fuentesDesdeFilas(STORE);
    const sala1 = resumenMaduracion(fuentes, { hoy: '2026-09-18' }).salas.find((s) => s.sala === 'Sala 1');
    expect(sala1.temp.prom).toBe(28);
    expect(sala1.estado).toBe('Producción');
    const crudo = { ingresos: [], tanques: [], sala: STORE.filter((r) => 'Temperatura 2:00' in r) };
    const sinAdaptar = resumenMaduracion(crudo, { hoy: '2026-09-18' }).salas.find((s) => s.sala === 'Sala 1');
    expect(sinAdaptar === undefined || sinAdaptar.temp.prom === '').toBe(true);
  });
});
