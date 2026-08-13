/* ============================================================
   SUPERVISOR · Despacho — Excel del mes de producción

   El alcance es un MES DE PRODUCCIÓN (rango de CORRIDAS de core/prodCalendar.js),
   no un mes de calendario: MESES_PROD cierra en Junio=573 y de ahí en adelante los
   meses se autoextienden cada 6 corridas. Por eso los fixtures usan:
     · corridas 573 y 574 → mes 5 (Junio), el MISMO mes con dos corridas
     · corrida 579        → mes 6 (Julio), un mes distinto
   Esa pareja 573/574 es la que hace que el fixture pruebe algo: si el agrupado
   perdiera la corrida de su clave, las poblaciones de dos ciclos del mismo tanque
   se mezclarían en una sola cifra y el test lo caza.

   Una fila cuenta como despacho si trae dato en Densidad cosechada, Biomasa,
   Cajas/Tinas o Destino (`isDespachoRow`); Piscina sola NO basta.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  despachoExportAoa, despachoExportCount, despachoFileName,
  monthsInRows, modulesInMonth, monthOfCorrida, DESPACHO_XLSX_HEADERS,
} from './despachoExport.js';

/** Fila de Larvicultura. `pob` acepta 0 (tanque vaciado) y '' (sin lectura). */
const R = (o) => ({
  'Módulo': o.mod, Corrida: o.cor, Tanque: o.tq, Fecha: o.fecha,
  'Población': o.pob === undefined ? '' : o.pob,
  'Densidad Cosechada': o.dens ?? '', Biomasa: o.bio ?? '',
  'Plg (manual)': o.plg ?? '', 'Cajas/Tinas': o.cajas ?? '',
  Destino: o.dest ?? '', Piscina: o.pisc ?? '',
});

const col = (aoa, name) => { const i = DESPACHO_XLSX_HEADERS.indexOf(name); return aoa.slice(1).map((r) => r[i]); };

describe('supervisor · despacho · mes de producción', () => {
  it('la corrida decide el mes: 573 y 574 caen en el mismo, 579 en el siguiente', () => {
    expect(monthOfCorrida('573')).toBe(5);
    expect(monthOfCorrida('574')).toBe(5);
    expect(monthOfCorrida('579')).toBe(6);
  });

  it('monthsInRows y modulesInMonth sólo ven lo que hay en cada mes', () => {
    const rows = [
      R({ mod: 'M01', cor: '573', tq: 'T1', fecha: '01/06/2026', dest: 'Piscina A' }),
      R({ mod: 'M02', cor: '574', tq: 'T1', fecha: '02/06/2026', dest: 'Piscina B' }),
      R({ mod: 'M09', cor: '579', tq: 'T1', fecha: '01/07/2026', dest: 'Piscina C' }),
    ];
    expect(monthsInRows(rows)).toEqual([5, 6]);
    expect(modulesInMonth(rows, 5)).toEqual(['M01', 'M02']);
    expect(modulesInMonth(rows, 6)).toEqual(['M09']);
  });
});

describe('supervisor · despacho · matriz del Excel', () => {
  const base = () => [
    // M01 · corrida 573 · T1: dos despachos + una lectura posterior sin despacho.
    R({ mod: 'M01', cor: '573', tq: 'T1', fecha: '01/06/2026', pob: 1000 }),
    R({ mod: 'M01', cor: '573', tq: 'T1', fecha: '05/06/2026', pob: 800, dens: 12, bio: 3.5, plg: 60, dest: 'Piscina A', pisc: 'P-1' }),
    R({ mod: 'M01', cor: '573', tq: 'T1', fecha: '06/06/2026', pob: 700, dens: 10, bio: 2.5, plg: 58, dest: 'Piscina A', pisc: 'P-2' }),
    // M01 · corrida 573 · T2: SIN despacho (sólo poblaciones) → debe listarse igual.
    R({ mod: 'M01', cor: '573', tq: 'T2', fecha: '01/06/2026', pob: 900 }),
    R({ mod: 'M01', cor: '573', tq: 'T2', fecha: '06/06/2026', pob: 500 }),
    // M02 · corrida 574 · T1: mismo NOMBRE de tanque, otro módulo y otra corrida.
    R({ mod: 'M02', cor: '574', tq: 'T1', fecha: '03/06/2026', pob: 400, bio: 1.1, dest: 'Piscina B' }),
    // Mes SIGUIENTE (579 → mes 6): no debe aparecer al exportar el mes 5.
    R({ mod: 'M09', cor: '579', tq: 'T1', fecha: '01/07/2026', pob: 300, dest: 'Piscina C' }),
  ];

  it('la cabecera lleva las columnas pedidas, con Módulo y Corrida al frente', () => {
    expect(DESPACHO_XLSX_HEADERS).toEqual([
      'Módulo', 'Corrida', 'Fecha', 'Tanque', 'Densidad Cosechada', 'Biomasa',
      'Plg (manual)', 'Destino', 'Cantidad Cosechada', 'Piscina',
    ]);
    expect(DESPACHO_XLSX_HEADERS).not.toContain('Cajas/Tinas');
  });

  it('excluye los meses ajenos: el mes 5 no arrastra la corrida 579', () => {
    const aoa = despachoExportAoa(base(), { mIdx: 5 });
    expect(col(aoa, 'Corrida')).not.toContain('579');
    expect(col(aoa, 'Módulo')).not.toContain('M09');
    // Y el mes 6 trae SÓLO esa.
    expect(col(despachoExportAoa(base(), { mIdx: 6 }), 'Corrida')).toEqual(['579']);
  });

  it('sin módulo exporta todos los del mes; con módulo, sólo ése', () => {
    expect(new Set(col(despachoExportAoa(base(), { mIdx: 5 }), 'Módulo'))).toEqual(new Set(['M01', 'M02']));
    expect(new Set(col(despachoExportAoa(base(), { mIdx: 5, mod: 'M01' }), 'Módulo'))).toEqual(new Set(['M01']));
  });

  it('una fila por despacho, con sus valores en la columna correcta', () => {
    const aoa = despachoExportAoa(base(), { mIdx: 5, mod: 'M01' });
    const t1 = aoa.slice(1).filter((r) => r[3] === 'T1');
    expect(t1).toHaveLength(2);                       // dos despachos, no tres filas
    expect(t1[0].slice(0, 8)).toEqual(['M01', '573', '05/06/2026', 'T1', 12, 3.5, 60, 'Piscina A']);
    expect(t1[0][9]).toBe('P-1');                     // Piscina
    expect(t1[1].slice(4, 8)).toEqual([10, 2.5, 58, 'Piscina A']);
    expect(t1[1][9]).toBe('P-2');
  });

  it('«Cantidad Cosechada» va SÓLO en la primera fila del tanque, para poder sumarla', () => {
    // Regresión directa: repetirla en cada despacho hacía que sumar la columna
    // multiplicara la cosecha de todo tanque con más de una salida.
    const aoa = despachoExportAoa(base(), { mIdx: 5, mod: 'M01' });
    const t1 = aoa.slice(1).filter((r) => r[3] === 'T1');
    expect(t1[0][8]).toBe(700);   // última población registrada del tanque
    expect(t1[1][8]).toBe('');    // y NO repetida
    // La suma de la columna = la cosecha real del módulo (T1 700 + T2 500).
    const suma = col(aoa, 'Cantidad Cosechada').filter((v) => v !== '').reduce((a, b) => a + b, 0);
    expect(suma).toBe(1200);
  });

  it('los tanques sin despachar se listan, para que se vea lo que falta', () => {
    const aoa = despachoExportAoa(base(), { mIdx: 5, mod: 'M01' });
    const t2 = aoa.slice(1).filter((r) => r[3] === 'T2');
    expect(t2).toHaveLength(1);
    expect(t2[0][2]).toBe('');     // sin fecha de despacho
    expect(t2[0][7]).toBe('');     // sin destino
    expect(t2[0][8]).toBe(500);    // pero SÍ su cantidad cosechada
  });

  it('separa por módulo: T1 de M02 no hereda la población del T1 de M01', () => {
    const aoa = despachoExportAoa(base(), { mIdx: 5 });
    const m02 = aoa.slice(1).filter((r) => r[0] === 'M02');
    expect(m02).toHaveLength(1);
    expect(m02[0][1]).toBe('574');
    expect(m02[0][8]).toBe(400);   // su propia población, no la de M01
  });

  it('no mezcla dos corridas del MISMO módulo en el mismo tanque', () => {
    // ⚠ Este caso exige que el módulo se repita: con las dos corridas en módulos
    // DISTINTOS el agrupado externo por módulo ya las separa, y el test pasaba igual
    // aunque se quitara la corrida de la clave — no probaba nada. M01 corre dos veces
    // dentro del mes 5 (573 y 574) reutilizando el nombre T1: si la corrida saliera de
    // la clave, las lecturas de ambos ciclos se ordenarían juntas y cada corrida
    // repetiría los despachos de la otra con una cosecha que no es la suya.
    const rows = [
      R({ mod: 'M01', cor: '573', tq: 'T1', fecha: '01/06/2026', pob: 1000 }),
      R({ mod: 'M01', cor: '573', tq: 'T1', fecha: '05/06/2026', pob: 800, dest: 'Piscina A' }),
      R({ mod: 'M01', cor: '574', tq: 'T1', fecha: '20/06/2026', pob: 600 }),
      R({ mod: 'M01', cor: '574', tq: 'T1', fecha: '25/06/2026', pob: 300, dest: 'Piscina B' }),
    ];
    const filas = despachoExportAoa(rows, { mIdx: 5 }).slice(1);
    expect(filas).toHaveLength(2);                                  // un despacho por corrida
    expect(filas.map((r) => r[1])).toEqual(['573', '574']);
    expect(filas.map((r) => r[7])).toEqual(['Piscina A', 'Piscina B']);
    expect(filas.map((r) => r[8])).toEqual([800, 300]);             // cada una con SU cosecha
  });

  it('honra el 0 como última población (tanque vaciado), sin confundirlo con «sin dato»', () => {
    const rows = [
      R({ mod: 'M01', cor: '573', tq: 'T9', fecha: '01/06/2026', pob: 900 }),
      R({ mod: 'M01', cor: '573', tq: 'T9', fecha: '07/06/2026', pob: 0, dest: 'Piscina A' }),
    ];
    expect(despachoExportAoa(rows, { mIdx: 5 })[1][8]).toBe(0);
  });

  it('Piscina por sí sola no convierte una fila en despacho', () => {
    const rows = [R({ mod: 'M01', cor: '573', tq: 'T5', fecha: '01/06/2026', pob: 100, pisc: 'P-9' })];
    const aoa = despachoExportAoa(rows, { mIdx: 5 });
    expect(aoa.slice(1)).toHaveLength(1);
    expect(aoa[1][2]).toBe('');    // se lista como tanque SIN despachar
    expect(aoa[1][9]).toBe('');    // y su Piscina no se arrastra
  });

  it('un mes sin datos devuelve sólo la cabecera', () => {
    const aoa = despachoExportAoa(base(), { mIdx: 0 });
    expect(aoa).toHaveLength(1);
    expect(despachoExportCount(base(), { mIdx: 0 })).toBe(0);
  });

  it('despachoExportCount cuenta filas de datos, sin la cabecera', () => {
    const aoa = despachoExportAoa(base(), { mIdx: 5 });
    expect(despachoExportCount(base(), { mIdx: 5 })).toBe(aoa.length - 1);
  });
});

describe('supervisor · despacho · nombre del archivo', () => {
  it('quita tildes y espacios conservando la letra base', () => {
    expect(despachoFileName(5, 'Módulo 7')).toBe('Despacho_Junio_Modulo_7.xlsx');
  });

  it('sin módulo se marca TODOS', () => {
    expect(despachoFileName(5, null)).toBe('Despacho_Junio_TODOS.xlsx');
  });
});
