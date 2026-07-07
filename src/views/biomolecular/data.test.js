import { describe, it, expect } from 'vitest';
import { parseDate, normResult, normalizeRows, estadioOrder } from './index.js';

describe('parseDate', () => {
  it('dd/mm/yyyy → ISO yyyy-mm-dd', () => {
    expect(parseDate('05/06/2026')).toBe('2026-06-05');
    expect(parseDate('5-6-2026')).toBe('2026-06-05');
  });
  it('año de 2 dígitos se expande a 20xx', () => {
    expect(parseDate('05/06/26')).toBe('2026-06-05');
  });
  it('vacío/no fecha → null', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('no es fecha')).toBeNull();
  });
});

describe('normResult', () => {
  it('reconoce variantes de positivo/negativo', () => {
    ['Positivo', 'positive', 'POS', 'p', '1', 'si', 'Sí'].forEach((v) => expect(normResult(v)).toBe('Positivo'));
    ['Negativo', 'negative', 'NEG', 'n', '0', 'no'].forEach((v) => expect(normResult(v)).toBe('Negativo'));
  });
  it('desconocido → cadena vacía', () => {
    expect(normResult('quizás')).toBe('');
    expect(normResult('')).toBe('');
  });
});

describe('normalizeRows', () => {
  it('mapea alias de columnas y normaliza resultados', () => {
    const out = normalizeRows([{
      Fecha: '05/06/2026', 'Código': 'BM1', Corrida: '573', Lugar: 'Módulo 1', Tanque: 'TQ1',
      'Estadío': 'PL5', IHHNV: 'Positivo', WSSV: 'Negativo', 'AHPND/EMS': 'positivo',
    }]);
    expect(out).toHaveLength(1);
    expect(out[0].f).toBe('2026-06-05');
    expect(out[0].lugar).toBe('Módulo 1');
    expect(out[0].IHHNV).toBe('Positivo');
    expect(out[0].WSSV).toBe('Negativo');
    expect(out[0].AHPND).toBe('Positivo'); // vía alias 'AHPND/EMS'
  });
  it('descarta filas sin fecha o con año corrupto', () => {
    const out = normalizeRows([
      { Fecha: '', IHHNV: 'Positivo' },            // sin fecha
      { Fecha: '30/01/0202', IHHNV: 'Positivo' },  // año corrupto < 2000
      { Fecha: '05/06/2026', IHHNV: 'Positivo' },  // válida
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].f).toBe('2026-06-05');
  });
  it('lugar por defecto "Sin lugar" cuando falta', () => {
    const out = normalizeRows([{ Fecha: '05/06/2026' }]);
    expect(out[0].lugar).toBe('Sin lugar');
    expect(out[0].tq).toBe('—');
  });
});

describe('estadioOrder (orden cronológico)', () => {
  it('N5 < Z < M < PL < Reproductor', () => {
    expect(estadioOrder('N5')).toBeLessThan(estadioOrder('Z2'));
    expect(estadioOrder('Z2')).toBeLessThan(estadioOrder('M1'));
    expect(estadioOrder('M1')).toBeLessThan(estadioOrder('PL1'));
    expect(estadioOrder('PL1')).toBeLessThan(estadioOrder('PL12'));
    expect(estadioOrder('PL12')).toBeLessThan(estadioOrder('Reproductores'));
  });
  it('vacío → 9999 (al final salvo reproductor)', () => {
    expect(estadioOrder('')).toBe(9999);
  });
});
