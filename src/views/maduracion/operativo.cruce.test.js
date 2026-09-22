/* ============================================================
   MADURACIÓN · OPERATIVO — EL CRUCE CON 🧬 MICROCHIPS (F6.3)

   Qué se exige, con fixtures montados para que la regla equivocada dé OTRO resultado:
   · MENOS hembras con chip que hembras en el libro es lo normal (no todas llevan chip) y no se marca: el t1 de QA
     tiene 1 con chip y 20 en el libro. TANTAS como en el libro, tampoco (QD, 2 y 2). MÁS sí: el t2 tiene 4 con chip
     y 3 en el libro.
   · Una hembra con chip viva donde el libro no tiene su lote se marca: la del t4 de QB (el lote se fue al t5 el
     10/09 y la MATRIZ no lo siguió) y la de QC, un lote CERRADO. Las muertas no cuentan.
   · Los lotes que el operativo no conoce (QX) se listan aparte y no se marcan.
   · Las ubicaciones se comparan por su forma canónica: «S2»/«T5» es la Sala 2 · 5 del operativo.
   · Un evento en otra ubicación que la de su hembra ese día se marca (V6), salvo que un TRASLADO lo explique: el
     desove de la 08 en el t4 el 16/09 es bueno, porque se trasladó al t5 el 17/09.
   · Los desoves de los dos registros, lado a lado y sin juzgar, del período (el de QA del 15/08 no entra) y del lote
     entero aunque se filtre un tanque.
   Datos FICTICIOS (los Trovan «FAKE…» no pueden ser de un lector: la K no es hexadecimal).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { salaCanonica, tanqueCanonico, ignoraDeCruce, cruceConMicrochips } from './operativo.cruce.js';
import { buildReproModel } from './data.js';
import { modeloOperativo, libroAlCierre } from './operativo.data.js';
import { normalizarFiltro, periodoDe } from './operativo.tablero.js';
import { MAD_OP_ORIGEN } from './operativo.fuentes.js';

const O = MAD_OP_ORIGEN;
const ING = (fecha, lote, sala, tanque, machos, hembras, cg) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha,
  Lote: lote, 'Código genético': cg, 'Piscina Broodstock': 'PZ1', Sala: sala, Tanque: tanque, Machos: machos, Hembras: hembras });
const MOV = (fecha, so, to, sd, td, machos, hembras) => ({ _SheetOrigin: O, 'Agua destino': 'RAS', Fecha: fecha,
  'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td, Machos: machos, Hembras: hembras });
const FIN = (fecha, lote, tipo, machos, hembras) => ({ _SheetOrigin: O, 'Metabisulfito (kg)': '', Fecha: fecha, Lote: lote, Tipo: tipo,
  Machos: machos, Hembras: hembras });
const DES = (fecha, lote, cg, desoves) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': cg, Desoves: desoves,
  'Total de huevos': 1000 * desoves, N2: 0, N5: 0 });

const CHIP = (n, lote, sala, tanque, estado = 'Vivo', cg = 'CA') => ({ 'Trovan ID': 'FAKE' + String(n).padStart(6, '0'), Piscina: 'PZ1',
  'Código genético': cg, Lote: lote, 'Sala actual': sala, 'Tanque actual': tanque, Estado: estado, 'Fecha ingreso': '2026-09-01' });
const EV = (n, fecha, tipo, sala, tanque) => ({ 'Trovan ID': 'FAKE' + String(n).padStart(6, '0'), Fecha: fecha, Tipo: tipo, Sala: sala, Tanque: tanque });

const FOTO = '2026-09-19';

/* El operativo: QA en la Sala 1 (t1 10♂ 20♀, t2 5♂ 3♀); QB en el t4 de la Sala 2, que pasa entero al t5 el 10/09;
   QC en el t1 de la Sala 3, cerrado del todo el 12/09; QD, 2♂ 2♀ en el t1 de la Sala 4. Desoves de QA (3 + 2, y 7 el
   15/08, fuera de los 30 días) y de QB (1). */
const PLANTA = [
  ING('2026-09-01', 'QA', 'Sala 1', 1, 10, 20, 'CA'), ING('2026-09-01', 'QA', 'Sala 1', 2, 5, 3, 'CA'),
  ING('2026-09-02', 'QB', 'Sala 2', 4, 5, 5, 'CB'), MOV('2026-09-10', 'Sala 2', 4, 'Sala 2', 5, 5, 5),
  ING('2026-09-03', 'QC', 'Sala 3', 1, 4, 4, 'CC'), FIN('2026-09-12', 'QC', 'Total', 4, 4),
  ING('2026-09-04', 'QD', 'Sala 4', 1, 2, 2, 'CD'),
  DES('2026-09-15', 'QA', 'CA', 3), DES('2026-09-16', 'QA', 'CA', 2), DES('2026-09-15', 'QB', 'CB', 1), DES('2026-08-15', 'QA', 'CA', 7),
];
/* La MATRIZ: cuatro de QA vivas en el t2 y una en el t1 (con el lote en minúsculas), una de QA muerta; una de QB en el
   t4 y otra en el t5 escrita «S2»/«T5»; una de QC; las dos de QD; dos de QX, un lote que el operativo no conoce; una sin lote y
   otra sin tanque. */
const MATRIZ = [
  CHIP(1, 'QA', 'Sala 1', 'Tanque 2'), CHIP(2, 'QA', 'Sala 1', 'Tanque 2'), CHIP(3, 'QA', 'Sala 1', 'Tanque 2'), CHIP(4, 'QA', 'Sala 1', 'Tanque 2'),
  CHIP(5, 'qa', 'Sala 1', 'Tanque 1'), CHIP(6, 'QA', 'Sala 1', 'Tanque 1', 'Muerto'),
  CHIP(7, 'QB', 'Sala 2', 'Tanque 4', 'Vivo', 'CB'), CHIP(8, 'QB', 'S2', 'T5', 'Vivo', 'CB'),
  CHIP(9, 'QC', 'Sala 3', 'Tanque 1', 'Vivo', 'CC'), CHIP(14, 'QD', 'Sala 4', 'Tanque 1', 'Vivo', 'CD'), CHIP(15, 'QD', 'Sala 4', 'Tanque 1', 'Vivo', 'CD'),
  CHIP(10, 'QX', 'Sala 5', 'Tanque 2', 'Vivo', 'CX'), CHIP(11, 'QX', 'Sala 5', 'Tanque 2', 'Vivo', 'CX'),
  CHIP(12, '', 'Sala 5', 'Tanque 3'), CHIP(13, 'QA', 'Sala 1', ''),
];
/* La Bitácora: desoves donde está cada hembra; uno de la 05 en la Sala 3 · 3 (V6); uno de la 08 en el t4 el 16/09, que
   explica su traslado del 17/09; uno de un chip que la MATRIZ no tiene; y uno viejo de la 02 en la Sala 4, fuera de los
   30 días. */
const BITACORA = [
  EV(1, '2026-09-15', 'Desove', 'Sala 1', 'Tanque 2'),
  EV(5, '2026-09-16', 'Desove', 'Sala 1', 'Tanque 1'), EV(5, '2026-09-17', 'Desove', 'Sala 3', 'Tanque 3'),
  EV(8, '2026-09-16', 'Desove', 'Sala 2', 'Tanque 4'),
  EV(99, '2026-09-15', 'Desove', 'Sala 1', 'Tanque 1'),
  EV(2, '2026-08-01', 'Desove', 'Sala 4', 'Tanque 1'),
];
const TRASLADOS = [{ 'TR-ID': 'TR-1', 'Trovan ID': 'FAKE000008', Fecha: '2026-09-17', Tipo: 'Traslado',
  'Sala origen': 'Sala 2', 'Tanque origen': 'Tanque 4', 'Sala destino': 'Sala 2', 'Tanque destino': 'Tanque 5' }];

const M = modeloOperativo(PLANTA, { hoy: FOTO, fecha: FOTO });
const REPRO = buildReproModel(MATRIZ, BITACORA, TRASLADOS);
const P30 = periodoDe('30d', FOTO, M.fuentes);
const SIN = normalizarFiltro({});
const F = (o) => normalizarFiltro(o);
const C = cruceConMicrochips(REPRO, M.libro, M.fuentes, P30, SIN);
const lote = (x, l) => x.find((r) => r.lote === l);

describe('Maduración · cruce con Microchips · las ubicaciones', () => {
  it('la sala y el tanque del reproductivo en la forma del operativo', () => {
    expect(['Sala 2', 'sala 2', 'S2', '2', 'Sala 02', 'Sala 4a'].map(salaCanonica)).toEqual(['Sala 2', 'Sala 2', 'Sala 2', 'Sala 2', 'Sala 2', 'Sala 4A']);
    expect(salaCanonica('RAS')).toBe('RAS');
    expect(['Tanque 18', 'T18', 18, '18', 'tanque 07'].map(tanqueCanonico)).toEqual([18, 18, 18, 18, 7]);
    expect(['', 'Tanque', null, 'Tanque 18B', 'Sala 2'].map(tanqueCanonico)).toEqual([null, null, null, null, null]);
  });
});

describe('Maduración · cruce con Microchips · lo que no puede ser, tanque a tanque', () => {
  it('🔑 se marca sólo lo que no puede ser, y en su orden', () => {
    expect(C.discrepancias).toEqual([
      { tipo: 'mas-chips', sala: 'Sala 1', tanque: 2, lote: 'QA', conChip: 4, enLibro: 3 },
      { tipo: 'lote-ausente', sala: 'Sala 2', tanque: 4, lote: 'QB', conChip: 1, enLibro: 0 },
      { tipo: 'lote-ausente', sala: 'Sala 3', tanque: 1, lote: 'QC', conChip: 1, enLibro: 0 },
    ]);
  });

  it('🔑 menos hembras con chip que en el libro NO se marca: no todas llevan chip', () => {
    expect(C.discrepancias.some((d) => d.tanque === 1 && d.lote === 'QA')).toBe(false);
    expect(C.discrepancias.some((d) => d.tanque === 5)).toBe(false);   // «S2»/«T5» es la Sala 2 · 5, donde está QB
    expect(C.discrepancias.some((d) => d.lote === 'QD')).toBe(false);   // 2 con chip y 2 en el libro: cuadra
  });

  it('un lote que el operativo no conoce se lista aparte y no se marca; las muertas no cuentan', () => {
    expect(C.fuera).toEqual([{ lote: 'QX', vivas: 2, tanques: 1 }]);
    expect(C.discrepancias.some((d) => d.lote === 'QX')).toBe(false);
    expect(lote(C.resumen, 'QA').vivasConChip).toBe(5);   // la 06 está muerta y la 13 no dice tanque
    expect(C).toMatchObject({ sinLote: 1, sinUbicacion: 1 });
  });

  it('el resumen de los lotes que están en los dos registros', () => {
    expect(C.resumen).toEqual([
      { lote: 'QA', hembrasLibro: 23, vivasConChip: 5, tanquesLibro: ['Sala 1 · 1', 'Sala 1 · 2'], tanquesChip: ['Sala 1 · 1', 'Sala 1 · 2'], enComun: 2 },
      { lote: 'QB', hembrasLibro: 5, vivasConChip: 2, tanquesLibro: ['Sala 2 · 5'], tanquesChip: ['Sala 2 · 4', 'Sala 2 · 5'], enComun: 1 },
      { lote: 'QC', hembrasLibro: 0, vivasConChip: 1, tanquesLibro: [], tanquesChip: ['Sala 3 · 1'], enComun: 0 },
      { lote: 'QD', hembrasLibro: 2, vivasConChip: 2, tanquesLibro: ['Sala 4 · 1'], tanquesChip: ['Sala 4 · 1'], enComun: 1 },
    ]);
  });

  it('con el libro de otro día el cruce es otro: por eso la vista le pasa el de HOY', () => {
    // El 09/09 QB aún estaba en el t4: la 07 estaba bien, y la que sobraba era la 08 del t5.
    const antes = cruceConMicrochips(REPRO, libroAlCierre(M.fuentes, '2026-09-09'), M.fuentes, P30, SIN);
    expect(antes.discrepancias.filter((d) => d.lote === 'QB').map((d) => [d.tipo, d.tanque])).toEqual([['lote-ausente', 5]]);
  });
});

describe('Maduración · cruce con Microchips · los eventos en otra ubicación (V6)', () => {
  it('🔑 un evento donde su hembra no estaba ese día, y sin traslado que lo explique, se marca', () => {
    expect(C.eventos.sinExplicar).toEqual([{ fecha: '2026-09-17', tipo: 'Desove', trovan: 'FAKE000005', lote: 'QA',
      evento: { sala: 'Sala 3', tanque: 3 }, hembra: { sala: 'Sala 1', tanque: 1 }, conTraslados: false }]);
  });

  it('🔑 un traslado lo explica: la 08 desovó en el t4 el día antes de pasar al t5', () => {
    expect(C.eventos.sinExplicar.some((e) => e.trovan === 'FAKE000008')).toBe(false);
    expect(REPRO.byTrovan.get('FAKE000008').tanque).toBe('T5');   // el fixture distingue: HOY está en otro tanque
  });

  it('los del período, y aparte los de chips que la MATRIZ no tiene', () => {
    expect(C.eventos).toMatchObject({ revisados: 4, sinMatriz: 1 });
    const todo = cruceConMicrochips(REPRO, M.libro, M.fuentes, periodoDe('todo', FOTO, M.fuentes), SIN);
    expect(todo.eventos.sinExplicar.map((e) => e.trovan)).toEqual(['FAKE000005']);
    const siempre = cruceConMicrochips(REPRO, M.libro, M.fuentes, { desde: '2026-01-01', hasta: FOTO }, SIN);
    expect(siempre.eventos.sinExplicar.map((e) => [e.fecha, e.trovan])).toEqual([['2026-09-17', 'FAKE000005'], ['2026-08-01', 'FAKE000002']]);
  });
});

describe('Maduración · cruce con Microchips · los desoves, sólo para informar', () => {
  it('los de la Bitácora y los de la hoja de Desoves, lote a lote', () => {
    expect(C.desoves).toEqual([
      { lote: 'QA', bitacora: 3, hembrasQueDesovaron: 2, operativo: 5 },
      { lote: 'QB', bitacora: 1, hembrasQueDesovaron: 1, operativo: 1 },
      { lote: 'QC', bitacora: 0, hembrasQueDesovaron: 0, operativo: 0 },
      { lote: 'QD', bitacora: 0, hembrasQueDesovaron: 0, operativo: 0 },
    ]);
  });

  it('son del lote ENTERO en los dos lados, también con un filtro de tanque', () => {
    // En el t2 de la Sala 1 sólo desovó la 01; el lote QA, tres veces (01 y 05).
    const t2 = cruceConMicrochips(REPRO, M.libro, M.fuentes, P30, F({ sala: 'Sala 1', tanque: 2 }));
    expect(t2.desoves).toEqual([{ lote: 'QA', bitacora: 3, hembrasQueDesovaron: 2, operativo: 5 }]);
  });
});

describe('Maduración · cruce con Microchips · el filtro', () => {
  it('sala y tanque, a los dos registros; un evento es del sitio donde ocurrió Y del de su hembra', () => {
    const s1 = cruceConMicrochips(REPRO, M.libro, M.fuentes, P30, F({ sala: 'Sala 1' }));
    expect(s1.discrepancias.map((d) => d.lote + ' · ' + d.tanque)).toEqual(['QA · 2']);
    expect(s1.resumen.map((r) => r.lote)).toEqual(['QA']);
    expect(s1.eventos.sinExplicar.map((e) => e.trovan)).toEqual(['FAKE000005']);   // ocurrió en la Sala 3; la hembra es de la 1
    expect(s1.eventos.revisados).toBe(3);
    const t4 = cruceConMicrochips(REPRO, M.libro, M.fuentes, P30, F({ sala: 'Sala 2', tanque: 4 }));
    expect(t4.discrepancias).toEqual([{ tipo: 'lote-ausente', sala: 'Sala 2', tanque: 4, lote: 'QB', conChip: 1, enLibro: 0 }]);
    expect(t4.resumen).toEqual([{ lote: 'QB', hembrasLibro: 0, vivasConChip: 1, tanquesLibro: [], tanquesChip: ['Sala 2 · 4'], enComun: 0 }]);
  });

  it('lote y código genético, a los dos registros', () => {
    const qb = cruceConMicrochips(REPRO, M.libro, M.fuentes, P30, F({ lote: 'qb' }));
    expect(qb.discrepancias.map((d) => d.lote)).toEqual(['QB']);
    expect(qb.fuera).toEqual([]);
    expect(qb.eventos).toMatchObject({ revisados: 1, sinMatriz: 0, sinExplicar: [] });
    expect(cruceConMicrochips(REPRO, M.libro, M.fuentes, P30, F({ codigo: 'cb' })).resumen.map((r) => r.lote)).toEqual(['QB']);
  });

  it('estado, sexo, piscina y camaronera no le aplican: se DICEN', () => {
    expect(ignoraDeCruce(SIN)).toEqual([]);
    expect(ignoraDeCruce(F({ estado: 'Cuarentena', piscina: 'PZ1', sala: 'Sala 1' }))).toEqual(['estado', 'piscina']);
    expect(cruceConMicrochips(REPRO, M.libro, M.fuentes, P30, F({ sexo: 'hembras', camaronera: 'CX' })).ignora).toEqual(['sexo', 'camaronera']);
  });

  it('sin registro reproductivo no inventa nada', () => {
    const v = cruceConMicrochips(null, M.libro, M.fuentes, P30, SIN);
    expect(v).toMatchObject({ discrepancias: [], resumen: [], fuera: [], desoves: [], sinLote: 0, sinUbicacion: 0,
      eventos: { revisados: 0, sinExplicar: [], sinMatriz: 0 } });
  });
});
