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
});
