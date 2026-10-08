/* ============================================================
   PLANTA · cifras de gerencia (tanda 4): la producción del mes es el Total de «Producción Omarsa»
   Lo que se exige, con datos FICTICIOS (corridas 874–882, año 2030; ningún dato real):
   · el mes es el último de producción con datos, y uno anterior no se cuela;
   · el total suma la población actual de TODOS los módulos de sus corridas, CIO incluido;
   · despachado = módulos con todos sus tanques despachados; el resto, en cultivo;
   · supervivencia = Σ población actual ÷ Σ siembra;
   · nauplios y desoves del mes de calendario, sin lo de otro mes ni lo posterior a hoy;
   · la meta: 400 M por defecto, y una inválida vuelve a esa.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { store } from '../../core/store.js';
import { cifrasGerencia, normalizarMeta, META_POR_DEFECTO, META_N5_DIA, DIAS_PRODUCCION_N5 } from './cifras.js';

const larv = (mod, cor, tq, fecha, pob, extra = {}) => ({ _SheetOrigin: 'Larvicultura', Fecha: fecha, Corrida: cor, 'Módulo': mod, Tanque: tq, 'Población': pob, ...extra });
const DES = (fecha, lote, desoves, n5) => ({ _SheetOrigin: 'Maduracion', Fecha: fecha, Lote: lote, 'Código genético': 'CA',
  Desoves: desoves, 'Total de huevos': desoves * 100000, N2: n5 + 50000, N5: n5 });

let C;
beforeAll(() => {
  store.globalData = [
    // mes anterior (874): no cuenta
    larv('M03', '874', 'TQ 1', '01/08/2030', 100000), larv('M03', '874', 'TQ 1', '20/08/2030', 70000, { Destino: 'P1' }),
    // M01 · 880 despachado entero (sus 2 tanques)
    larv('M01', '880', 'TQ 1', '01/09/2030', 100000), larv('M01', '880', 'TQ 1', '20/09/2030', 60000, { Destino: 'P2' }),
    larv('M01', '880', 'TQ 2', '01/09/2030', 100000), larv('M01', '880', 'TQ 2', '20/09/2030', 50000, { Destino: 'P2' }),
    // M02 · 882 en cultivo
    larv('M02', '882', 'TQ 1', '05/09/2030', 100000), larv('M02', '882', 'TQ 1', '15/09/2030', 80000),
    // M04 · 883 despachándose (1 de 2 tanques): sigue EN CULTIVO entero, como en la tabla
    larv('M04', '883', 'TQ 1', '06/09/2030', 100000), larv('M04', '883', 'TQ 1', '18/09/2030', 70000, { Destino: 'P3' }),
    larv('M04', '883', 'TQ 2', '06/09/2030', 100000), larv('M04', '883', 'TQ 2', '18/09/2030', 90000),
    // CIO · 881: cuenta, como en la tabla
    larv('CIO', '881', 'TQ 1', '03/09/2030', 50000), larv('CIO', '881', 'TQ 1', '15/09/2030', 40000),
    // desoves: del mes (2), de otro mes (1) y posterior a hoy (1)
    DES('2030-09-05', 'LA', 10, 4000000), DES('2030-09-12', 'LA', 6, 2500000),
    DES('2030-08-30', 'LA', 9, 9000000), DES('2030-09-25', 'LA', 7, 7000000),
  ];
  C = cifrasGerencia(store.globalData, '2030-09-20');
});

describe('cifras de gerencia · producción del mes', () => {
  it('el mes es el último de producción con datos, con sus corridas', () => {
    expect(C.mes).toMatch(/^Septiembre/);
    expect(C.corridas).toEqual(['880', '881', '882', '883']);
  });

  it('total = Σ población actual de todos los módulos del mes, CIO incluido; el mes anterior no cuenta', () => {
    expect(C.total).toBe(110000 + 80000 + 40000 + 160000);
    expect(C.modulos).toBe(4);
  });

  it('despachado = módulos con TODOS sus tanques despachados; uno despachándose sigue en cultivo', () => {
    expect(C.despachado).toBe(110000);
    expect(C.enCultivo).toBe(80000 + 40000 + 160000);
    expect(C.modulosDespachados).toBe(1);
    expect(C.despachadoCorridas).toBe(110000);   // aquí cada corrida tiene un solo módulo: el criterio de la tabla coincide
  });

  it('B1: con una corrida a medio despachar, el módulo terminado cuenta como despachado y la corrida no (el Subtotal de la tabla)', () => {
    const antes = store.globalData;
    store.globalData = [
      // (el mes de producción sale del número de corrida: 880 y 882 son de septiembre, como arriba)
      // 880: M05 terminado, CIO sin despacho → la corrida NO está terminada
      larv('M05', '880', 'TQ 1', '02/09/2030', 100000), larv('M05', '880', 'TQ 1', '19/09/2030', 70000, { Destino: 'P1' }),
      larv('CIO', '880', 'TQ 1', '02/09/2030', 50000), larv('CIO', '880', 'TQ 1', '19/09/2030', 30000),
      // 882: un solo módulo, terminado
      larv('M06', '882', 'TQ 1', '03/09/2030', 100000), larv('M06', '882', 'TQ 1', '19/09/2030', 60000, { Destino: 'P2' }),
    ];
    try {
      const B = cifrasGerencia(store.globalData, '2030-09-20');
      expect(B.corridas).toEqual(['880', '882']);
      expect(B.despachado).toBe(70000 + 60000);
      expect(B.despachadoCorridas).toBe(60000);
      expect(B.enCultivo).toBe(30000);
    } finally { store.globalData = antes; }
  });

  it('supervivencia = Σ población actual ÷ Σ siembra × 100', () => {
    expect(C.siembra).toBe(550000);
    expect(C.supervivencia).toBeCloseTo(390000 / 550000 * 100, 6);
  });
});

describe('cifras de gerencia · selector de mes (como la tabla Producción Omarsa)', () => {
  it('trae los meses con datos en orden y la posición del elegido (por defecto, el último)', () => {
    expect(C.meses.map((m) => m.mes)).toEqual([expect.stringMatching(/^Agosto/), expect.stringMatching(/^Septiembre/)]);
    expect(C.pos).toBe(1);
    expect(C.mIdx).toBe(C.meses[1].mIdx);
  });

  it('un mes anterior da SUS cifras y sus nauplios del mes de calendario', () => {
    const A = cifrasGerencia(store.globalData, '2030-09-20', C.meses[0].mIdx);
    expect(A).toMatchObject({ pos: 0, corridas: ['874'], total: 70000, despachado: 70000, enCultivo: 0, siembra: 100000, modulos: 1 });
    expect(A.supervivencia).toBeCloseTo(70, 6);
    expect(A.nauplios).toMatchObject({ n5: 9000000, desoves: 9, desde: '2030-08-01', hasta: '2030-08-31' });
  });

  it('el mes en curso es HOY; uno pasado se pinta al cierre de su mes de calendario', () => {
    expect(C).toMatchObject({ actual: true, cierre: '2030-09-20' });
    expect(cifrasGerencia(store.globalData, '2030-09-20', C.meses[0].mIdx)).toMatchObject({ actual: false, cierre: '2030-08-31' });
  });

  it('un mes que no tiene datos (o ninguno) vuelve al último', () => {
    expect(cifrasGerencia(store.globalData, '2030-09-20', 9999).pos).toBe(1);
    expect(cifrasGerencia(store.globalData, '2030-09-20', undefined).pos).toBe(1);
  });
});

describe('cifras de gerencia · nauplios y meta', () => {
  it('nauplios y desoves del mes de calendario, recortado a hoy', () => {
    expect(C.nauplios).toMatchObject({ n5: 6500000, desoves: 16, desde: '2030-09-01', hasta: '2030-09-20' });
  });

  it('sin corridas no hay cifras', () => {
    const antes = store.globalData;
    store.globalData = [];
    try { expect(cifrasGerencia([], '2030-09-20')).toBeNull(); } finally { store.globalData = antes; }
  });

  it('la meta: 400 M por defecto; una inválida vuelve a esa y una válida se respeta', () => {
    expect(META_POR_DEFECTO).toBe(400e6);
    for (const v of [null, undefined, '', 'abc', 0, -5]) expect(normalizarMeta(v)).toBe(400e6);
    expect(normalizarMeta('450000000')).toBe(450e6);
    expect(normalizarMeta(380e6)).toBe(380e6);
  });

  it('punto 10: cada día del mes con su N5 (los de Visitante), hasta hoy, que suman el del mes; la meta N5 es 65 M × 26 días', () => {
    const d = C.nauplios.dias;
    expect(d.map((x) => x.fecha)).toEqual(Array.from({ length: 20 }, (_, i) => '2030-09-' + String(i + 1).padStart(2, '0')));
    expect(d.reduce((a, x) => a + x.n5, 0)).toBe(C.nauplios.n5);
    expect(d.find((x) => x.fecha === '2030-09-05')).toMatchObject({ desoves: 10, n5: 4000000, lotes: [{ lote: 'LA', n5: 4000000 }] });
    expect([META_N5_DIA, DIAS_PRODUCCION_N5, META_N5_DIA * DIAS_PRODUCCION_N5]).toEqual([65e6, 26, 1690e6]);
    expect(normalizarMeta('', META_N5_DIA)).toBe(65e6);
    expect(normalizarMeta('70000000', META_N5_DIA)).toBe(70e6);
  });
});
