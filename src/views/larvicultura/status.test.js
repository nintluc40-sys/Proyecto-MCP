import { describe, it, expect } from 'vitest';
import { diagSemaforo, popSemaforo, aguaSemaforo, expectedStage, stageRank, cultivoInfo } from './status.js';

const VARS = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }];

describe('diagSemaforo', () => {
  it('todas en óptimo → verde', () => {
    expect(diagSemaforo({ a: 10, b: 5, c: 20 }, VARS).level).toBe('verde');
  });
  it('una en alerta → ámbar', () => {
    expect(diagSemaforo({ a: 10, b: 60, c: 20 }, VARS).level).toBe('ambar');
  });
  it('una en crítico → rojo', () => {
    expect(diagSemaforo({ a: 10, b: 90, c: 20 }, VARS).level).toBe('rojo');
  });
  it('sin datos → verde con detalle', () => {
    expect(diagSemaforo(null, VARS).detail).toMatch(/Sin datos/);
  });
});

describe('popSemaforo · sin historia de la planta (20 % / 40 % fijos)', () => {
  it('pérdida baja → verde', () => {
    expect(popSemaforo({ validTanks: 2, totalInit: 100, totalCurr: 90 }).level).toBe('verde');
  });
  it('pérdida media → ámbar', () => {
    expect(popSemaforo({ validTanks: 2, totalInit: 100, totalCurr: 70 }).level).toBe('ambar');
  });
  it('pérdida alta → rojo', () => {
    expect(popSemaforo({ validTanks: 2, totalInit: 100, totalCurr: 50 }).level).toBe('rojo');
  });
  it('lo dice en el detalle', () => {
    expect(popSemaforo({ validTanks: 2, totalInit: 100, totalCurr: 50 }).detail)
      .toBe('Pérdida acumulada 50.0% · sin historia suficiente: umbral fijo 20% / 40% · 2 tanque(s)');
  });
});

// 2026-10-30 (usuario: «Ajustarlo por etapa», «Sí, con mínimo 5 % y 10 %»): frente a lo normal de la planta ese día.
// Las referencias son INVENTADAS (las pruebas no llevan valores reales: el repo es público).
describe('popSemaforo · frente a lo normal de la planta ese día de cultivo', () => {
  const ref = { diaCorrida: 18, dia: 18, n: 60, p75: 30, p90: 36 };
  const pop = (perdida) => ({ validTanks: 10, totalInit: 1000, totalCurr: 1000 - perdida * 10 });
  it('hasta lo que no superan 3 de cada 4 corridas → verde (con 20/40 fijos, 29 % sería ámbar)', () => {
    expect(popSemaforo(pop(29), ref).level).toBe('verde');
    expect(popSemaforo(pop(30), ref).level).toBe('verde');
  });
  it('peor que 3 de cada 4 → ámbar; hasta 9 de cada 10 sigue ámbar', () => {
    expect(popSemaforo(pop(30.5), ref).level).toBe('ambar');
    expect(popSemaforo(pop(36), ref).level).toBe('ambar');
  });
  it('peor que 9 de cada 10 → rojo', () => {
    expect(popSemaforo(pop(36.5), ref).level).toBe('rojo');
  });
  it('un 15 % con una planta que ese día pierde 12 % / 18 % → ámbar (con 20/40 fijos sería verde)', () => {
    expect(popSemaforo(pop(15), { diaCorrida: 4, dia: 4, n: 70, p75: 12, p90: 18 }).level).toBe('ambar');
  });
  it('el detalle: el día, cuántas corridas y lo normal', () => {
    expect(popSemaforo(pop(37), ref).detail).toBe('Pérdida acumulada 37.0% · día 18: de 60 corridas, 3 de cada 4 perdían hasta 30.0% y 9 de cada 10 hasta 36.0% · 10 tanque(s)');
    expect(popSemaforo(pop(37), { ...ref, diaCorrida: 26, dia: 22, n: 12 }).detail)
      .toContain('día 26 (referencia del día 22): de 12 corridas');
  });

  describe('el mínimo: nunca ámbar por debajo de 5 % ni rojo por debajo de 10 %', () => {
    const temprano = { diaCorrida: 2, dia: 2, n: 70, p75: 0, p90: 0.5 };   // los primeros días: casi nadie recuenta
    it('1 % el día 2 → verde, aunque sea «peor que 9 de cada 10»', () => {
      expect(popSemaforo(pop(1), temprano).level).toBe('verde');
      expect(popSemaforo(pop(5), temprano).level).toBe('verde');
    });
    it('más de 5 % → ámbar; más de 10 % → rojo', () => {
      expect(popSemaforo(pop(5.1), temprano).level).toBe('ambar');
      expect(popSemaforo(pop(10), temprano).level).toBe('ambar');
      expect(popSemaforo(pop(10.1), temprano).level).toBe('rojo');
    });
    it('el detalle lo dice sólo cuando se aplica', () => {
      expect(popSemaforo(pop(1), temprano).detail).toContain('9 de cada 10 hasta 0.5% (mínimo 5% / 10%) · 10 tanque(s)');
      expect(popSemaforo(pop(37), ref).detail).not.toContain('mínimo');
      expect(popSemaforo(pop(1), { ...temprano, p75: 6, p90: 9 }).detail).toContain('(mínimo 5% / 10%)');
    });
  });
});

describe('aguaSemaforo', () => {
  it('valores bajos → verde', () => {
    expect(aguaSemaforo({ espuma: [3], suciedad: [4], recambio: [50] }).level).toBe('verde');
  });
  it('una sobre umbral → ámbar', () => {
    expect(aguaSemaforo({ espuma: [12], suciedad: [4], recambio: [50] }).level).toBe('ambar');
  });
  it('ambas altas → rojo', () => {
    expect(aguaSemaforo({ espuma: [11], suciedad: [12], recambio: [50] }).level).toBe('rojo');
  });
});

describe('expectedStage / stageRank', () => {
  it('estadío esperado por DOC (cronograma 1 estadío/día desde N5=día1)', () => {
    expect(expectedStage(1)).toBe('N5');  // día 1 = N5
    expect(expectedStage(2)).toBe('Z1');
    expect(expectedStage(4)).toBe('Z3');
    expect(expectedStage(7)).toBe('M3');
    expect(expectedStage(8)).toBe('PL1');  // día 8 = PL1
    expect(expectedStage(12)).toBe('PL5'); // día 12 = PL5
  });
  it('rank ordena correctamente', () => {
    expect(stageRank('Z2')).toBeLessThan(stageRank('M1'));
    expect(stageRank('M3')).toBeLessThan(stageRank('PL1'));
    expect(stageRank('PL5')).toBeGreaterThan(stageRank('PL2'));
  });
});

describe('cultivoInfo', () => {
  const row = (fecha, estadio) => ({ Fecha: fecha, Estadío: estadio });
  const day = (n) => { const d = new Date(2026, 5, 1); d.setDate(d.getDate() + n - 1); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

  it('un cultivo EN HORARIO (1 estadío/día desde N5) sale "en tiempo" cada día', () => {
    // Reproduce el bug reportado: con el cronograma viejo esto daba "adelantado".
    const secuencia = [[1, 'N5'], [2, 'Z1'], [3, 'Z2'], [4, 'Z3'], [5, 'M1'], [6, 'M2'], [7, 'M3'], [8, 'PL1'], [9, 'PL2'], [13, 'PL6']];
    secuencia.forEach(([n, st]) => {
      const rows = secuencia.filter(([m]) => m <= n).map(([m, s]) => row(day(m), s));
      const c = cultivoInfo(rows);
      expect(c.doc).toBe(n);
      expect(c.stage).toBe(st);
      expect(c.esperado).toBe(st);       // esperado == registrado
      expect(c.status).toBe('en_tiempo');
    });
  });

  it('un cultivo LENTO (2 estadíos en 5 días) sale "atrasado"', () => {
    const rows = [row('2026-06-01', 'Z1'), row('2026-06-05', 'Z3')];
    const c = cultivoInfo(rows);
    expect(c.doc).toBe(5);          // 1→5 inclusivo
    expect(c.stage).toBe('Z3');
    expect(c.esperado).toBe('M1');  // DOC 5 → M1 (va por detrás)
    expect(c.status).toBe('atrasado');
  });
  it('sin fechas → null', () => {
    expect(cultivoInfo([{ Estadío: 'Z1' }])).toBeNull();
  });
});
