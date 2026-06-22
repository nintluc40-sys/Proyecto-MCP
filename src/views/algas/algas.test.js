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
  it('en Fundas la unidad es sistema·Lote', () => {
    const rows = [
      row({ Sistema: 'FP', Lote: 'A', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '500' }),
      row({ Sistema: 'FP', Lote: 'B', Fecha: '2026-06-01', Dia_Proceso: '1', Cel_ml: '900' }),
    ];
    const keys = growthByLote(rows).map((l) => l.key).sort();
    expect(keys).toEqual(['FP·LA', 'FP·LB']);
  });
  it('ignora filas sin Cel/ml', () => {
    const rows = [row({ Sistema: 'M1', Fecha: '2026-06-01', Dia_Proceso: '1' })];
    expect(growthByLote(rows)).toHaveLength(0);
  });
});

describe('tasaChartData', () => {
  it('% ganado del primer al último punto', () => {
    const out = tasaChartData([{ key: 'M1', points: [{ day: 1, cel: 1000 }, { day: 2, cel: 2000 }] }]);
    expect(out.labels).toEqual(['M1']);
    expect(out.values).toEqual([100]); // (2000-1000)/1000*100
  });
  it('excluye lotes con <2 puntos o inicial no positivo', () => {
    const out = tasaChartData([
      { key: 'A', points: [{ day: 1, cel: 1000 }] },          // 1 punto
      { key: 'B', points: [{ day: 1, cel: 0 }, { day: 2, cel: 500 }] }, // inicial 0
    ]);
    expect(out.labels).toEqual([]);
    expect(out.values).toEqual([]);
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
