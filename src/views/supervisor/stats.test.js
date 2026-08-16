import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildContext, modStats, tankStats, rowsAreGrouped, rowsAreDiscarded, rowsOutOfDispatch } from './stats.js';

afterEach(() => { store.dateFrom = null; store.dateTo = null; store.globalData = []; });

describe('modStats: frescura (lastDate) y datos por tanque (tanksData)', () => {
  it('devuelve la fecha más reciente y un resumen OD/Temp/SV por tanque', () => {
    store.globalData = [
      // Larvicultura M01/580, tanque TQ1: siembra y última población (para SV)
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '800', Fecha: '05/06/2026' },
      // Control_Tanque M01/580, TQ1: OD/Temp
      { _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', OD: '6', Temperatura: '32', Fecha: '05/06/2026' },
    ];
    const ctx = buildContext({});
    const s = modStats(ctx, 'M01', '580');

    expect(s.lastDate).toBeInstanceOf(Date);
    expect(s.lastDate.getDate()).toBe(5); // 05/06 es la más reciente
    expect(s.tanksData).toHaveLength(1);
    expect(s.tanksData[0].tq).toBe('TQ1');
    expect(s.tanksData[0].od).toBe(6);
    expect(s.tanksData[0].tmp).toBe(32);
    expect(s.tanksData[0].sv).toBeCloseTo(80, 1); // 800/1000
  });

  it('sin datos del módulo → lastDate null y tanksData vacío', () => {
    store.globalData = [];
    const s = modStats(buildContext({}), 'M09', '999');
    expect(s.lastDate).toBeNull();
    expect(s.tanksData).toEqual([]);
  });

  it('muestra OD/Temp aunque el módulo no tenga población registrada', () => {
    store.globalData = [
      // Larvicultura sin Población (solo presencia de módulo/corrida)
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M02', Corrida: '581', Tanque: 'TQ1', Fecha: '02/06/2026' },
      // Control_Tanque con OD/Temp reales
      { _SheetOrigin: 'Control_Tanque M02', 'Módulo': 'M02', Corrida: '581', Tanque: 'TQ1', OD: '6.4', Temperatura: '31.5', Fecha: '02/06/2026' },
    ];
    const s = modStats(buildContext({}), 'M02', '581');
    expect(s.pop).toBeNull();        // sin población
    expect(s.od).toBeCloseTo(6.4, 1); // OD/Temp se siguen mostrando
    expect(s.tmp).toBeCloseTo(31.5, 1);
  });

  it('promedia % Actividad / % Espuma / % Suciedad del módulo (incluye 0)', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', '% Actividad': '90', '% Espuma': '10', '% Suciedad': '0', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ2', '% Actividad': '80', '% Espuma': '20', '% Suciedad': '4', Fecha: '01/06/2026' },
    ];
    const s = modStats(buildContext({}), 'M01', '580');
    expect(s.act).toBe(85); // (90+80)/2
    expect(s.esp).toBe(15); // (10+20)/2
    expect(s.suc).toBe(2);  // (0+4)/2 — el 0 cuenta
  });

  it('PL/g (Larvia): Σ del último PL/g por tanque ÷ nº de tanques CON registro', () => {
    store.globalData = [
      // TQ1: dos registros → cuenta el ÚLTIMO por fecha (18)
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'PL/g': '12', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'PL/g': '18', Fecha: '05/06/2026' },
      // TQ2: un registro (22)
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ2', 'PL/g': '22', Fecha: '03/06/2026' },
      // TQ3: presente en el módulo pero SIN PL/g → no entra en el promedio
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ3', 'Población': '500', Fecha: '03/06/2026' },
    ];
    const s = modStats(buildContext({}), 'M01', '580');
    expect(s.plgLarvia).toBe(20); // (18 + 22) / 2 ; TQ3 excluido del denominador
  });
});

describe('Población 0 (tanque agrupado/vaciado): el 0 es real, no se arrastra el valor anterior', () => {
  it('última población = 0 → pop 0 y SV 0 (no el valor del día previo)', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '800', Fecha: '03/06/2026' },
      // Tanque agrupado: se registra 0 como último valor real
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '0', Fecha: '05/06/2026', Observaciones: 'Agrupado con TQ2' },
    ];
    const ctx = buildContext({});
    const s = tankStats(ctx, 'M01', 'TQ1', '580');
    expect(s.pop).toBe(0);        // honra el 0, no arrastra 800
    expect(s.popFirst).toBe(1000); // su siembra inicial sigue contando
    expect(s.sv).toBe(0);          // 0/1000 = 0%
  });

  it('detecta el tanque agrupado por la palabra "Agrupado" en Observaciones', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '0', Fecha: '05/06/2026', Observaciones: 'agrupado por baja densidad' },
    ];
    const ctx = buildContext({});
    expect(tankStats(ctx, 'M01', 'TQ1', '580').grouped).toBe(true);
    expect(rowsAreGrouped(store.globalData)).toBe(true);
  });

  it('tanque normal (sin la palabra y con población) → grouped false', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '900', Fecha: '05/06/2026', Observaciones: 'sin novedad' },
    ];
    const ctx = buildContext({});
    expect(tankStats(ctx, 'M01', 'TQ1', '580').grouped).toBe(false);
  });

  it('detección de "descartado" y "fuera de despacho" (agrupado o descartado)', () => {
    const descartado = [{ Observaciones: 'Tanque descartado por baja calidad' }];
    const agrupado = [{ Observaciones: 'agrupado con TQ4' }];
    const normal = [{ Observaciones: 'ok' }];
    expect(rowsAreDiscarded(descartado)).toBe(true);
    expect(rowsAreDiscarded(normal)).toBe(false);
    expect(rowsOutOfDispatch(descartado)).toBe(true); // descartado → no llega al despacho
    expect(rowsOutOfDispatch(agrupado)).toBe(true);   // agrupado → no llega al despacho
    expect(rowsOutOfDispatch(normal)).toBe(false);
  });

  it('tanksData marca outOfDispatch en el tanque agrupado (para no contarlo como alerta)', () => {
    store.globalData = [
      // TQ1 sano
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ1', 'Población': '900', Fecha: '10/06/2026' },
      // TQ2 agrupado: SV cae a 0 por decisión operativa, no por un problema sanitario
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ2', 'Población': '1000', Fecha: '01/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', Tanque: 'TQ2', 'Población': '0', Fecha: '10/06/2026', Observaciones: 'Agrupado con TQ1' },
    ];
    const s = modStats(buildContext({}), 'M01', '580');
    const byTank = Object.fromEntries(s.tanksData.map((t) => [t.tq, t]));
    expect(byTank.TQ1.outOfDispatch).toBe(false);
    expect(byTank.TQ2.sv).toBe(0);              // el 0 sigue siendo real
    expect(byTank.TQ2.outOfDispatch).toBe(true); // …pero está marcado como fuera de despacho
  });
});

describe('buildContext · allMods es identidad ESTABLE de color, no lista filtrada', () => {
  it('no cambia al aplicar un filtro de fecha que deja fuera a un módulo', () => {
    // `colorFor(allMods.indexOf(mod))` pinta el acento del módulo en 6 sub-vistas: si la
    // lista se acorta al filtrar, todos los índices posteriores se desplazan y el módulo
    // cambia de color sin que nada haya cambiado en él.
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '573', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/05/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M07', Corrida: '573', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M08', Corrida: '573', Tanque: 'TQ1', 'Población': '1000', Fecha: '06/06/2026' },
    ];
    store.dateFrom = null; store.dateTo = null;
    const sinFiltro = buildContext({}).allMods;

    store.dateFrom = new Date(2026, 5, 1); // solo junio: M06 queda fuera de la ventana
    const conFiltro = buildContext({}).allMods;

    expect(sinFiltro).toEqual(['M06', 'M07', 'M08']);
    expect(conFiltro).toEqual(sinFiltro);              // la identidad de color no se mueve
    expect(conFiltro.indexOf('M07')).toBe(sinFiltro.indexOf('M07'));
  });

  it('tampoco cambia al filtrar por corrida', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '573', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M07', Corrida: '574', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/06/2026' },
    ];
    store.dateFrom = null; store.dateTo = null;
    expect(buildContext({}).allMods).toEqual(['M06', 'M07']);
    expect(buildContext({ corrida: '574' }).allMods).toEqual(['M06', 'M07']);
  });
});

/* ============================================================
   allMods · el ÍNDICE de este array fija el COLOR de acento del módulo en 6 sub-vistas
   (colorFor(ctx.allMods.indexOf(mod))), así que su ORDEN es parte de la identidad
   visual: si se desplaza, los módulos cambian de color sin que cambie ningún dato.
   ============================================================ */
describe('allMods · orden estable para el color de módulo', () => {
  it('conserva el orden actual de producción (CIO, M01…M10)', () => {
    const mods = ['M10', 'M02', 'CIO', 'M01', 'M09'];
    store.globalData = mods.map((m) => (
      { _SheetOrigin: 'Larvicultura', 'Módulo': m, Corrida: '585', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/06/2026' }
    ));
    // Con los nombres reales (ceros a la izquierda) el orden es el natural y no cambia
    // respecto al que producía el .sort() por defecto: ningún color se mueve hoy.
    expect(buildContext({}).allMods).toEqual(['CIO', 'M01', 'M02', 'M09', 'M10']);
  });

  it('un módulo SIN cero a la izquierda no se cuela entre M10 y M02', () => {
    // Éste es el caso que el .sort() lexicográfico ordenaba mal ('M1','M10','M2'),
    // desplazando el color de todos los módulos posteriores.
    store.globalData = ['M10', 'M2', 'M1'].map((m) => (
      { _SheetOrigin: 'Larvicultura', 'Módulo': m, Corrida: '585', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/06/2026' }
    ));
    expect(buildContext({}).allMods).toEqual(['M1', 'M2', 'M10']);
  });
});

describe('el contexto no expone allCorridas (no tenía consumidores)', () => {
  it('buildContext sigue descartando una corrida ausente de los datos', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '585', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/06/2026' },
    ];
    const vState = { corrida: '999' };          // corrida que ya no existe
    const ctx = buildContext(vState);
    expect(vState.corrida).toBeNull();           // se descarta, que es lo que importaba
    expect(ctx.allCorridas).toBeUndefined();     // y deja de viajar en el contexto
    expect(ctx.larvCM.length).toBe(1);           // sin corrida fijada, no recorta nada
  });

  it('una corrida SÍ presente se conserva y recorta larvCM', () => {
    store.globalData = [
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '585', Tanque: 'TQ1', 'Población': '1000', Fecha: '05/06/2026' },
      { _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '586', Tanque: 'TQ1', 'Población': '900', Fecha: '06/06/2026' },
    ];
    const vState = { corrida: '586' };
    const ctx = buildContext(vState);
    expect(vState.corrida).toBe('586');
    expect(ctx.larvCM.length).toBe(1);
  });
});
