import { describe, it, expect } from 'vitest';
import { moduleSvPopSeries, moduleHourly, moduleDayTankReadings, cosechaEstimate } from './moduleTrends.js';

const lv = (extra) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '580', ...extra });
const ct = (extra) => ({ _SheetOrigin: 'Control_Tanque M01', 'Módulo': 'M01', Corrida: '580', ...extra });

describe('moduleSvPopSeries', () => {
  it('suma población por fecha (Σ última ≤ fecha por tanque) y calcula SV vs inicial', () => {
    const ctx = {
      larvWin: [
        lv({ Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' }),
        lv({ Tanque: 'TQ1', 'Población': '800', Fecha: '05/06/2026' }),
        lv({ Tanque: 'TQ2', 'Población': '500', Fecha: '01/06/2026' }),
        lv({ Tanque: 'TQ2', 'Población': '400', Fecha: '05/06/2026' }),
      ],
      tanqWin: [],
    };
    const r = moduleSvPopSeries(ctx, 'M01', '580');
    expect(r.labels).toEqual(['01/06/2026', '05/06/2026']);
    expect(r.pop).toEqual([1500, 1200]); // Σ tanques
    expect(r.sv).toEqual([100, 80]);     // 1500/1500, 1200/1500
  });

  it('línea base = siembra de la corrida (larvCM), no la 1ª pob. de la ventana filtrada', () => {
    // La ventana (larvWin) empieza el 05/06 con 800; la siembra real (larvCM) es 1000 el 01/06.
    // La SV debe medirse contra 1000 (coherente con el KPI del banner), no contra 800.
    const ctx = {
      larvWin: [
        lv({ Tanque: 'TQ1', 'Población': '800', Fecha: '05/06/2026' }),
        lv({ Tanque: 'TQ1', 'Población': '700', Fecha: '07/06/2026' }),
      ],
      larvCM: [
        lv({ Tanque: 'TQ1', 'Población': '1000', Fecha: '01/06/2026' }),
        lv({ Tanque: 'TQ1', 'Población': '800', Fecha: '05/06/2026' }),
        lv({ Tanque: 'TQ1', 'Población': '700', Fecha: '07/06/2026' }),
      ],
      tanqWin: [],
    };
    const r = moduleSvPopSeries(ctx, 'M01', '580');
    expect(r.sv).toEqual([80, 70]); // 800/1000, 700/1000 (no 100/87.5 respecto a 800)
  });
});

describe('moduleHourly', () => {
  it('promedia OD del módulo por toma horaria de una fecha', () => {
    const gOD = (r) => parseFloat(r.OD);
    const ctx = {
      larvWin: [],
      tanqWin: [
        ct({ Tanque: 'TQ1', Hora: '2:00:00', OD: '6', Fecha: '05/06/2026' }),
        ct({ Tanque: 'TQ2', Hora: '2:00:00', OD: '5', Fecha: '05/06/2026' }),
      ],
    };
    const vals = moduleHourly(ctx, 'M01', '580', gOD, '05/06/2026');
    expect(vals[0]).toBe(5.5); // (6+5)/2 en la toma 2:00
    expect(vals[1]).toBeNull(); // 4:00 sin datos
  });
});

describe('moduleDayTankReadings', () => {
  it('promedia OD/Temp por tanque en la fecha dada y ordena por tanque (natural)', () => {
    const ctx = {
      larvWin: [],
      tanqWin: [
        ct({ Tanque: 'TQ2', OD: '6', Temperatura: '30', Fecha: '05/06/2026' }),
        ct({ Tanque: 'TQ1', OD: '4', Temperatura: '32', Fecha: '05/06/2026' }),
        ct({ Tanque: 'TQ1', OD: '5', Temperatura: '31', Fecha: '05/06/2026' }),
        ct({ Tanque: 'TQ1', OD: '3', Temperatura: '33', Fecha: '06/06/2026' }), // otro día → excluido
      ],
    };
    const r = moduleDayTankReadings(ctx, 'M01', '580', '05/06/2026');
    expect(r.map((t) => t.tq)).toEqual(['TQ1', 'TQ2']);
    expect(r[0]).toEqual({ tq: 'TQ1', od: 4.5, tmp: 31.5 }); // (4+5)/2 · (32+31)/2
    expect(r[1]).toEqual({ tq: 'TQ2', od: 6, tmp: 30 });
  });

  it('od/tmp = null cuando el tanque no tiene esa lectura ese día', () => {
    const ctx = { larvWin: [], tanqWin: [ct({ Tanque: 'TQ1', Fecha: '05/06/2026' })] };
    expect(moduleDayTankReadings(ctx, 'M01', '580', '05/06/2026')).toEqual([{ tq: 'TQ1', od: null, tmp: null }]);
  });
});

describe('cosechaEstimate (objetivo PL11)', () => {
  it('estima días a PL11 según el ritmo de estadío', () => {
    const ctx = {
      larvWin: [
        lv({ Tanque: 'TQ1', 'Estadío': 'PL5', Fecha: '01/06/2026' }),
        lv({ Tanque: 'TQ1', 'Estadío': 'PL8', Fecha: '04/06/2026' }),
      ],
      tanqWin: [],
    };
    // PL5→PL8 = +3 índices en 3 días → 1/día; faltan 3 (PL8→PL11) → 3 días.
    expect(cosechaEstimate(ctx, 'M01', '580', 'PL11')).toEqual({ days: 3, reached: false });
  });

  it('reached=true si ya está en/ pasó el objetivo', () => {
    const ctx = {
      larvWin: [
        lv({ Tanque: 'TQ1', 'Estadío': 'PL10', Fecha: '01/06/2026' }),
        lv({ Tanque: 'TQ1', 'Estadío': 'PL12', Fecha: '04/06/2026' }),
      ],
      tanqWin: [],
    };
    expect(cosechaEstimate(ctx, 'M01', '580', 'PL11')).toEqual({ days: 0, reached: true });
  });

  it('null si hay menos de 2 fechas con estadío', () => {
    const ctx = { larvWin: [lv({ Tanque: 'TQ1', 'Estadío': 'PL5', Fecha: '01/06/2026' })], tanqWin: [] };
    expect(cosechaEstimate(ctx, 'M01', '580', 'PL11')).toBeNull();
  });
});
