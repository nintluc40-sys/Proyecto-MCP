import { describe, it, expect } from 'vitest';
import { parseDate, normResult, normalizeRows, estadioOrder, audSimulate, audRestore } from './index.js';

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

describe('audSimulate (modo AUD · entrenamiento)', () => {
  // Filas con los 6 diagnósticos informados, para que la simulación tenga qué sustituir.
  const mkRows = () => normalizeRows(
    Array.from({ length: 40 }, (_, i) => ({
      Fecha: `${String((i % 28) + 1).padStart(2, '0')}/06/2026`,
      Lugar: 'Lab ' + (i % 4), Tanque: String(i), 'Código': 'C' + i,
      IHHNV: 'Positivo', WSSV: 'Positivo', BP: 'Positivo',
      AHPND: 'Positivo', NHPB: 'Positivo', EHP: 'Positivo',
    })),
  );
  const diagsOf = (rows) => rows.map((r) => [r.IHHNV, r.WSSV, r.BP, r.AHPND, r.NHPB, r.EHP].join(','));

  it('misma semilla → mismo resultado (es reproducible, no aleatorio)', () => {
    expect(diagsOf(audSimulate(mkRows(), 12345))).toEqual(diagsOf(audSimulate(mkRows(), 12345)));
  });

  it('semillas distintas → resultados distintos', () => {
    expect(diagsOf(audSimulate(mkRows(), 1))).not.toEqual(diagsOf(audSimulate(mkRows(), 2)));
  });

  it('un registro conserva su resultado aunque cambie el orden de las filas', () => {
    const byKey = (rows) => new Map(rows.map((r) => [r.f + '|' + r.lugar + '|' + r.tq + '|' + r.cod, r.IHHNV]));
    const normal = byKey(audSimulate(mkRows(), 777));
    const alReves = byKey(audSimulate(mkRows().reverse(), 777));
    normal.forEach((v, k) => expect(alReves.get(k)).toBe(v));
  });

  it('solo IHHNV puede salir positivo; el resto queda en Negativo', () => {
    const rows = audSimulate(mkRows(), 999);
    rows.forEach((r) => ['WSSV', 'BP', 'AHPND', 'NHPB', 'EHP'].forEach((d) => expect(r[d]).toBe('Negativo')));
    expect(rows.some((r) => r.IHHNV === 'Positivo')).toBe(true);
    expect(rows.some((r) => r.IHHNV === 'Negativo')).toBe(true);
  });

  it('filas duplicadas (misma fecha/lugar/tanque/código) NO reciben todas el mismo resultado', () => {
    // 60 muestras del MISMO tanque el mismo día: sin desempate por repetición, la clave
    // sería idéntica y las 60 saldrían iguales (grumo artificial de positivos).
    const dup = normalizeRows(Array.from({ length: 60 }, () => ({
      Fecha: '05/06/2026', Lugar: 'Lab 1', Tanque: '7', IHHNV: 'Positivo',
    })));
    const vals = new Set(audSimulate(dup, 2024).map((r) => r.IHHNV));
    expect(vals.size).toBe(2); // hay positivos Y negativos, no un bloque uniforme
  });

  it('añadir filas al final no altera el resultado de las anteriores', () => {
    const base = audSimulate(mkRows(), 555).map((r) => r.IHHNV);
    const ampliado = mkRows().concat(normalizeRows([{ Fecha: '01/07/2026', Lugar: 'Lab 9', Tanque: '99', IHHNV: 'Positivo' }]));
    expect(audSimulate(ampliado, 555).slice(0, base.length).map((r) => r.IHHNV)).toEqual(base);
  });

  it('audRestore devuelve los valores reales', () => {
    const rows = mkRows();
    const antes = diagsOf(rows.map((r) => ({ ...r })));
    expect(diagsOf(audRestore(audSimulate(rows, 42)))).toEqual(antes);
  });
});
