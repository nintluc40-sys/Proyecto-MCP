import { describe, it, expect } from 'vitest';
import { moduleSvPopSeries, moduleHourly, moduleDayTankReadings, cosechaEstimate, projectMetric } from './moduleTrends.js';

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

describe('projectMetric (decaimiento exponencial)', () => {
  it('ajusta y extrapola una serie exponencial perfecta (R²=1)', () => {
    // 100 → 50 → 25: se divide entre 2 cada día ⇒ exponencial exacta.
    const r = projectMetric(['01/06/2026', '02/06/2026', '03/06/2026'], [100, 50, 25], 2, { min: 0 });
    expect(r.r2).toBeCloseTo(1, 5);
    expect(r.futureLabels).toEqual(['04/06/2026', '05/06/2026']);
    expect(r.projected[0]).toBeCloseTo(12.5, 4);
    expect(r.projected[1]).toBeCloseTo(6.25, 4);
    expect(r.endValue).toBeCloseTo(6.25, 4);
    expect(r.dailyRate).toBeCloseTo(-0.5, 4); // −50 % diario
    expect(r.connectIndex).toBe(2);
    expect(r.connectValue).toBe(25);
  });

  it('nunca crece: una serie ascendente se proyecta estable (tasa forzada ≤ 0)', () => {
    // 80 → 90 (asciende). La proyección NO puede aumentar: tasa=0 ⇒ se mantiene en 90.
    const r = projectMetric(['01/06/2026', '02/06/2026'], [80, 90], 30, { min: 0, max: 100 });
    expect(r.dailyRate).toBe(0);
    expect(r.endValue).toBe(90);            // no crece por encima del último dato real
    expect(Math.max(...r.projected)).toBe(90);
    // Monótona no creciente en todo el horizonte.
    r.projected.forEach((v) => expect(v).toBeLessThanOrEqual(90));
  });

  it('la proyección es monótona no creciente incluso con un repunte final por ruido', () => {
    // Cae 100→60→40 y repunta a 55: la regresión global sigue siendo decreciente, pero
    // aun si no lo fuera, la tasa ≤ 0 garantiza que ningún punto proyectado suba.
    const r = projectMetric(['01/06/2026', '02/06/2026', '03/06/2026', '04/06/2026'], [100, 60, 40, 55], 5, { min: 0 });
    expect(r.connectValue).toBe(55);
    for (let i = 1; i < r.projected.length; i++) expect(r.projected[i]).toBeLessThanOrEqual(r.projected[i - 1]);
    expect(r.projected[0]).toBeLessThanOrEqual(55);
  });

  it('ignora puntos no positivos/nulos y conecta con el último dato real válido', () => {
    // 100(d0) · 0(salta) · 50(d2) · null(salta) · 25(d4): exponencial cada 2 días.
    const r = projectMetric(
      ['01/06/2026', '02/06/2026', '03/06/2026', '04/06/2026', '05/06/2026'],
      [100, 0, 50, null, 25], 1, { min: 0 },
    );
    expect(r).not.toBeNull();
    expect(r.connectIndex).toBe(4);
    expect(r.connectValue).toBe(25);
    expect(r.projected[0]).toBeCloseTo(25 * Math.SQRT1_2, 4); // 25·0.5^(1/2)
  });

  it('null si <2 puntos positivos o horizonte <1', () => {
    expect(projectMetric(['01/06/2026', '02/06/2026'], [null, 50], 5, {})).toBeNull();
    expect(projectMetric(['01/06/2026', '02/06/2026'], [50, 50], 0, {})).toBeNull();
  });
});
