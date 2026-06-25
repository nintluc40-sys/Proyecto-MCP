import { describe, it, expect } from 'vitest';
import {
  getField, parseNum, normalizeTecnico, dedupeTecnicos,
  getLatestStage, autoCalcMortalidad, isTanqueRow, isLarviculturaRow,
} from './fields.js';

describe('getField', () => {
  it('devuelve el primer valor no vacío entre variantes', () => {
    expect(getField({ a: '', b: '5' }, ['a', 'b'])).toBe('5');
    expect(getField({ Fecha: ' x ' }, ['Fecha'])).toBe('x'); // recorta
  });
  it('vacío para fila nula o clave ausente', () => {
    expect(getField(null, ['a'])).toBe('');
    expect(getField({}, ['Fecha'])).toBe('');
  });
});

describe('parseNum', () => {
  it('tolera % y coma decimal', () => {
    expect(parseNum({ v: '45%' }, ['v'])).toBe(45);
    expect(parseNum({ v: '1,5' }, ['v'])).toBe(1.5);
  });
  it('null para vacío o no numérico', () => {
    expect(parseNum({ v: '' }, ['v'])).toBeNull();
    expect(parseNum({ v: 'abc' }, ['v'])).toBeNull();
  });
});

describe('normalización de técnicos', () => {
  it('aplica alias y colapsa espacios', () => {
    expect(normalizeTecnico('jhon  munoz')).toBe('John Muñoz');
    expect(normalizeTecnico('  Pedro  Pérez ')).toBe('Pedro Pérez');
    expect(normalizeTecnico('')).toBe('');
  });

  it('dedupeTecnicos unifica variantes de tipeo', () => {
    expect(dedupeTecnicos(['Nixon Ascencio', 'Nixon Asencio'])).toEqual(['Nixon Asencio']);
  });

  it('dedupeTecnicos prefiere la variante con más tildes', () => {
    expect(dedupeTecnicos(['Jose', 'José'])).toEqual(['José']);
  });
});

describe('clasificadores de fila', () => {
  it('isTanqueRow / isLarviculturaRow según _SheetOrigin', () => {
    expect(isTanqueRow({ _SheetOrigin: 'Control_Tanque M01' })).toBe(true);
    expect(isTanqueRow({ _SheetOrigin: 'Larvicultura' })).toBe(false);
    expect(isLarviculturaRow({ _SheetOrigin: 'Larvicultura' })).toBe(true);
  });
});

describe('getLatestStage', () => {
  it('devuelve el estadio más avanzado del día más reciente', () => {
    const data = [
      { Fecha: '01/03/2024', 'Estadío': 'N1' },
      { Fecha: '05/03/2024', 'Estadío': 'Z2' },
      { Fecha: '05/03/2024', 'Estadío': 'M1' },
    ];
    expect(getLatestStage(data)).toBe('M1');
  });
  it('N/A para datos vacíos', () => {
    expect(getLatestStage([])).toBe('N/A');
  });

  it('clasifica un PL fuera de STAGE_ORDER por encima de PL30 (fix D1)', () => {
    const data = [
      { Fecha: '05/03/2024', 'Estadío': 'PL30' },
      { Fecha: '05/03/2024', 'Estadío': 'PL35' },
    ];
    expect(getLatestStage(data)).toBe('PL35');
  });
});

describe('autoCalcMortalidad', () => {
  it('deriva Mortalidad = 100 - Supervivencia cuando falta', () => {
    const row = { Supervivencia: '80' };
    autoCalcMortalidad([row]);
    expect(row.Mortalidad).toBe(20);
    expect(row._MortCalc).toBe(true);
  });
  it('no calcula si la supervivencia está fuera de 0–100', () => {
    const row = { Supervivencia: '150' };
    autoCalcMortalidad([row]);
    expect(row.Mortalidad).toBeUndefined();
  });
  it('tolera coma decimal en la Supervivencia (no la trunca)', () => {
    const row = { Supervivencia: '80,5' };
    autoCalcMortalidad([row]);
    expect(row.Mortalidad).toBe(19.5);
  });
  it('no sobrescribe una Mortalidad ya presente', () => {
    const row = { Supervivencia: '80', Mortalidad: '25' };
    autoCalcMortalidad([row]);
    expect(row.Mortalidad).toBe('25');
    expect(row._MortCalc).toBeUndefined();
  });
});
