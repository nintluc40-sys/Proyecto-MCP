import { describe, it, expect } from 'vitest';
import { sysCat, SYS_CATS, growthByLote, tasaChartData, periodStats } from './index.js';

// Fila de Lab_Algas con cabeceras canónicas (las que lee el acceso tolerante AF).
const row = (o) => ({ ...o });

describe('sysCat', () => {
  it('mapea cada patrón a su categoría', () => {
    expect(sysCat('PBR1')).toBe('PBR');
    expect(sysCat('PM2')).toBe('Premasivos');
    expect(sysCat('FP')).toBe('Fundas');
    expect(sysCat('FM')).toBe('Fundas');
    expect(sysCat('C3')).toBe('Carboys');
    expect(sysCat('M1')).toBe('Masivos');
  });
  it('sistema no contemplado → Otros (categoría visible)', () => {
    expect(sysCat('XYZ')).toBe('Otros');
    expect(SYS_CATS).toContain('Otros');
  });
  it('vacío → null', () => {
    expect(sysCat('')).toBeNull();
    expect(sysCat(null)).toBeNull();
  });
});

describe('growthByLote', () => {
  it('agrupa por sistema (no-Fundas) y promedia Cel/ml por día de proceso', () => {
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '3000' }), // mismo día → promedio
      row({ Sistema: 'M1', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '4000' }),
    ];
    const lotes = growthByLote(rows);
    expect(lotes).toHaveLength(1);
    expect(lotes[0].key).toBe('M1');
    expect(lotes[0].points).toEqual([{ day: 1, cel: 2000 }, { day: 2, cel: 4000 }]);
  });
  it('el Lote separa series (p. ej. Fundas FP·A vs FP·B)', () => {
    const rows = [
      row({ Sistema: 'FP', Lote: 'A', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '500' }),
      row({ Sistema: 'FP', Lote: 'B', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '900' }),
    ];
    const keys = growthByLote(rows).map((l) => l.key).sort();
    expect(keys).toEqual(['FP · LA', 'FP · LB']);
  });
  it('el mismo sistema en ÁREAS o ESPECIES distintas NO se fusiona (clave Área·Sistema·Especie·Lote)', () => {
    const rows = [
      row({ Área_Algas: 'A1', Sistema: 'M1', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Área_Algas: 'A2', Sistema: 'M1', Especie: 'TW', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '2000' }), // otra área
      row({ Área_Algas: 'A1', Sistema: 'M1', Especie: 'IS', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '3000' }), // otra especie
    ];
    const keys = growthByLote(rows).map((l) => l.key).sort();
    expect(keys).toEqual(['A1 · M1 · IS', 'A1 · M1 · TW', 'A2 · M1 · TW']);
  });
  it('ignora filas sin Cel/ml', () => {
    const rows = [row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1' })];
    expect(growthByLote(rows)).toHaveLength(0);
  });
  it('separa las RESIEMBRAS del mismo sistema (reinicio de Dia_Proceso) sin promediarlas', () => {
    // M1 se resiembra dentro de la corrida: día de proceso vuelve a 1.
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '2000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-10', Dia_Proceso: '1', Cel_ml: '1500' }), // 2.ª siembra
      row({ Sistema: 'M1', Fecha: '2026-06-11', Dia_Proceso: '2', Cel_ml: '3000' }),
    ];
    const lotes = growthByLote(rows);
    expect(lotes.map((l) => l.key)).toEqual(['M1 · S1', 'M1 · S2']);
    // NO se promedian entre sí: el día 1 de S1 es 1000 y el de S2 es 1500 (no 1250).
    expect(lotes[0].points).toEqual([{ day: 1, cel: 1000 }, { day: 2, cel: 2000 }]);
    expect(lotes[1].points).toEqual([{ day: 1, cel: 1500 }, { day: 2, cel: 3000 }]);
  });
  it('una sola siembra conserva la etiqueta simple (sin sufijo)', () => {
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '1000' }),
      row({ Sistema: 'M1', Fecha: '2026-06-02', Dia_Proceso: '2', Cel_ml: '2000' }),
    ];
    expect(growthByLote(rows).map((l) => l.key)).toEqual(['M1']);
  });
});

describe('tasaChartData · μ específica (día⁻¹)', () => {
  it('μ = ln(final/inicial)/días', () => {
    const out = tasaChartData([{ key: 'M1', points: [{ day: 0, cel: 1000 }, { day: 2, cel: 4000 }] }]);
    expect(out.labels).toEqual(['M1']);
    // ln(4)/2 = 0.693 → redondeado a 3 decimales
    expect(out.values).toEqual([+(Math.log(4) / 2).toFixed(3)]);
    const m = out.meta[0];
    expect(m.days).toBe(2);
    expect(m.pctTotal).toBe(300);            // (4000-1000)/1000*100
    expect(m.dbl).toBeCloseTo(Math.log2(4) / 2, 5); // 1 duplicación/día
    expect(m.tDouble).toBeCloseTo(1, 5);     // se duplica cada día
  });
  it('excluye lotes con <2 puntos, inicial/final no positivo o sin tiempo', () => {
    const out = tasaChartData([
      { key: 'A', points: [{ day: 1, cel: 1000 }] },                       // 1 punto
      { key: 'B', points: [{ day: 1, cel: 0 }, { day: 2, cel: 500 }] },    // inicial 0
      { key: 'C', points: [{ day: 3, cel: 1000 }, { day: 3, cel: 2000 }] }, // días iguales → sin tiempo
    ]);
    expect(out.labels).toEqual([]);
    expect(out.values).toEqual([]);
  });
  it('μ negativa cuando el cultivo decrece', () => {
    const out = tasaChartData([{ key: 'D', points: [{ day: 0, cel: 4000 }, { day: 2, cel: 1000 }] }]);
    expect(out.values[0]).toBeLessThan(0);
    expect(out.meta[0].pctTotal).toBe(-75);
  });
});

describe('periodStats', () => {
  it('resume densidad, protozoarios en alerta y rango de fechas', () => {
    const rows = [
      row({ Sistema: 'M1', Fecha: '2026-06-01', Cel_ml: '1000', Protozoarios: '2' }),
      row({ Sistema: 'M2', Fecha: '2026-06-03', Cel_ml: '3000', Protozoarios: '6' }),
    ];
    const s = periodStats(rows);
    expect(s.n).toBe(2);
    expect(s.sistemas).toBe(2);
    expect(s.densMin).toBe(1000);
    expect(s.densMax).toBe(3000);
    expect(s.densAvg).toBe(2000);
    expect(s.protoAlert).toBe(1); // solo el de 6 (≥5)
    expect(s.from && s.from.getDate()).toBe(1);
    expect(s.to && s.to.getDate()).toBe(3);
  });
  it('sin filas → valores nulos seguros', () => {
    const s = periodStats([]);
    expect(s.n).toBe(0);
    expect(s.densAvg).toBeNull();
    expect(s.from).toBeNull();
  });
});
