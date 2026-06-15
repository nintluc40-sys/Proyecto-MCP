import { describe, it, expect } from 'vitest';
import { moduleSvPopSeries, moduleHourly, cosechaEstimate } from './moduleTrends.js';

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
