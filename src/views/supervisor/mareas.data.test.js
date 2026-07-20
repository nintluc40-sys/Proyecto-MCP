import { describe, it, expect, afterEach } from 'vitest';
import { store } from '../../core/store.js';
import { isMareaRow, mareaDays, pearson, corrSignificant } from './mareas.js';

afterEach(() => { store.globalData = []; });

const M = (o) => ({ _SheetOrigin: 'Marea', ...o });

describe('mareas · capa de datos (hoja "Marea")', () => {
  it('isMareaRow reconoce la hoja Marea', () => {
    expect(isMareaRow(M({}))).toBe(true);
    expect(isMareaRow({ _SheetOrigin: 'Larvicultura' })).toBe(false);
    expect(isMareaRow(null)).toBe(false);
  });

  it('parsea eventos P/B, calcula pmax/bmin/amp, ordena por hora y lee fase/iluminación/tipo', () => {
    store.globalData = [M({
      Fecha: '05/06/2026', 'Fase Lunar': 'Luna llena', '%Iluminación': '100', 'Tipo de Marea': 'Viva',
      'Pleamar 1': '04:55', 'Altura P1 (m)': '2.02', 'Bajamar 1': '10:55', 'Altura B1 (m)': '0.71',
      'Pleamar 2': '16:46', 'Altura P2 (m)': '1.92', 'Bajamar 2': '23:03', 'Altura B2 (m)': '0.40',
      'Amplitud (m)': '1.62',
    })];
    const days = mareaDays();
    expect(days.length).toBe(1);
    const d = days[0];
    expect(d.events.length).toBe(4);
    expect(d.events.map((e) => e.label)).toEqual(['04:55', '10:55', '16:46', '23:03']); // asc por hora
    expect(d.events.map((e) => e.type)).toEqual(['P', 'B', 'P', 'B']);
    expect(d.pmax).toBeCloseTo(2.02, 5);
    expect(d.bmin).toBeCloseTo(0.40, 5);
    expect(d.amp).toBeCloseTo(1.62, 5);
    expect(d.tipo).toBe('Viva');
    expect(d.illum).toBe(100);
    expect(d.fase).toBe('Luna llena');
  });

  it('deriva la amplitud si falta y tolera coma decimal, HHMM y días de solo 2 eventos', () => {
    store.globalData = [M({
      Fecha: '06/06/2026', 'Tipo de Marea': 'muerta',
      'Pleamar 1': '0730', 'Altura P1 (m)': '2,20', // HHMM + coma decimal
      'Bajamar 1': '13:47', 'Altura B1 (m)': '0,50',
      // sin Pleamar 2 / Bajamar 2 · sin Amplitud → derivada
    })];
    const d = mareaDays()[0];
    expect(d.events.length).toBe(2);
    expect(d.events[0].label).toBe('07:30');
    expect(d.pmax).toBeCloseTo(2.20, 5);
    expect(d.bmin).toBeCloseTo(0.50, 5);
    expect(d.amp).toBeCloseTo(1.70, 5); // 2.20 - 0.50
    expect(d.tipo).toBe('Muerta');
  });

  it('ignora filas sin fecha válida y ordena los días ascendente', () => {
    store.globalData = [
      M({ Fecha: '10/06/2026', 'Pleamar 1': '05:00', 'Altura P1 (m)': '2.0' }),
      M({ Fecha: '', 'Pleamar 1': '05:00', 'Altura P1 (m)': '2.0' }), // sin fecha → ignorada
      M({ Fecha: '02/06/2026', 'Pleamar 1': '05:00', 'Altura P1 (m)': '2.1' }),
    ];
    const days = mareaDays();
    expect(days.length).toBe(2);
    expect(days[0].d.getTime()).toBeLessThan(days[1].d.getTime());
  });
});

describe('mareas · correlación (Pearson)', () => {
  it('r = 1 para relación lineal perfecta creciente; -1 para decreciente', () => {
    expect(pearson([[1, 2], [2, 4], [3, 6], [4, 8]])).toBeCloseTo(1, 6);
    expect(pearson([[1, 8], [2, 6], [3, 4], [4, 2]])).toBeCloseTo(-1, 6);
  });
  it('r ≈ 0 sin relación y null si no hay varianza o hay < 2 pares', () => {
    expect(Math.abs(pearson([[1, 5], [2, 5], [3, 5], [4, 5]]) ?? 0)).toBe(0); // y constante → sin varianza → null→0
    expect(pearson([[1, 5], [2, 5]])).toBe(null); // varianza cero en y
    expect(pearson([[1, 2]])).toBe(null);         // < 2 pares
  });
  it('corrSignificant: significativa solo si supera el t crítico (p<0.05, dos colas)', () => {
    expect(corrSignificant(0.9, 10)).toBe(true);   // r fuerte, N alto → significativa
    expect(corrSignificant(0.3, 5)).toBe(false);   // r débil, N bajo → no significativa
    expect(corrSignificant(1, 5)).toBe(true);      // r perfecto
    expect(corrSignificant(null, 10)).toBe(false); // sin r
    expect(corrSignificant(0.99, 2)).toBe(false);  // N<3 (sin grados de libertad)
  });
});
