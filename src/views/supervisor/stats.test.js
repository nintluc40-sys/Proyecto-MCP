import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { buildContext, modStats } from './stats.js';

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
