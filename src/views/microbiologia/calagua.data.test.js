import { describe, it, expect } from 'vitest';
import {
  isCalAguaRow, calEstado, calRangeText, calCtx, calValue, calMeasured, loadCalRanges,
  CAL_PARAMS, CAL_PARAM_BY_KEY,
} from './calagua.data.js';

const ph = CAL_PARAM_BY_KEY.ph;
const nitrito = CAL_PARAM_BY_KEY.nitrito;

describe('isCalAguaRow', () => {
  it('reconoce la hoja por _SheetOrigin (tolerante a acentos/espacios)', () => {
    expect(isCalAguaRow({ _SheetOrigin: 'Calidad de Agua' })).toBe(true);
    expect(isCalAguaRow({ _SheetOrigin: 'calidad de  agua' })).toBe(true);
    expect(isCalAguaRow({ _SheetOrigin: 'Microbiología' })).toBe(false);
    expect(isCalAguaRow(null)).toBe(false);
  });
});

describe('calEstado', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 }, alc: { min: 120 } };
  it('clasifica dentro/fuera por min y max', () => {
    expect(calEstado('ph', 8.0, R)).toBe('dentro');
    expect(calEstado('ph', 7.0, R)).toBe('fuera'); // < min
    expect(calEstado('ph', 9.0, R)).toBe('fuera'); // > max
    expect(calEstado('nitrito', 0.1, R)).toBe('dentro');
    expect(calEstado('nitrito', 0.5, R)).toBe('fuera'); // solo max
    expect(calEstado('alc', 100, R)).toBe('fuera'); // solo min
  });
  it('sin-rango si no hay rango o valor inválido', () => {
    expect(calEstado('temp', 25, R)).toBe('sin-rango'); // parámetro sin rango
    expect(calEstado('ph', null, R)).toBe('sin-rango');
    expect(calEstado('ph', NaN, R)).toBe('sin-rango');
  });
});

describe('calRangeText', () => {
  const R = { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 }, alc: { min: 120 } };
  it('formatea el rango objetivo según min/max presentes', () => {
    expect(calRangeText('ph', R)).toBe('7.5–8.5');
    expect(calRangeText('nitrito', R)).toBe('≤0.2');
    expect(calRangeText('alc', R)).toBe('≥120');
    expect(calRangeText('temp', R)).toBe('');
  });
});

describe('calValue / calCtx', () => {
  const row = {
    _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '580',
    Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Tipo de muestra': 'Agua',
    'Módulo': '3', 'Estadío': 'Z2', 'TQ/N°': '4',
    pH: '7,8', 'S‰': '32', Nitrito: '0.5',
  };
  it('lee valores numéricos tolerando coma decimal y alias', () => {
    expect(calValue(row, ph)).toBe(7.8); // "7,8" → 7.8
    expect(calValue(row, nitrito)).toBe(0.5);
  });
  it('extrae el contexto de la muestra', () => {
    const c = calCtx(row);
    expect(c.corrida).toBe('580');
    expect(c.depto).toBe('Larvicultura');
    expect(c.modulo).toBe('3');
    expect(c.tq).toBe('4');
    expect(c.fecha instanceof Date).toBe(true);
  });
});

describe('calMeasured', () => {
  it('devuelve solo parámetros con valor, con estado y rango', () => {
    const row = { pH: '8.0', Nitrito: '0.5', Temperatura: '' }; // temp vacío → excluido
    const meas = calMeasured(row, { ph: { min: 7.5, max: 8.5 }, nitrito: { max: 0.2 } });
    const byKey = Object.fromEntries(meas.map((m) => [m.key, m]));
    expect(meas.length).toBe(2); // pH + Nitrito (temp vacío no entra)
    expect(byKey.ph.estado).toBe('dentro');
    expect(byKey.nitrito.estado).toBe('fuera');
    expect(byKey.nitrito.range).toBe('≤0.2');
  });
});

describe('loadCalRanges', () => {
  it('devuelve los rangos base (sin overrides de localStorage)', () => {
    const R = loadCalRanges();
    expect(R.ph).toEqual({ min: 7.5, max: 8.5 });
    expect(R.nitrito).toEqual({ max: 0.2 });
    expect(R.potasio).toEqual({ min: 380, max: 420 });
  });
});

describe('CAL_PARAMS', () => {
  it('los 21 parámetros generales tienen encabezado exacto como primer alias', () => {
    expect(CAL_PARAMS.length).toBe(21);
    expect(ph.alias[0]).toBe('pH');
    expect(CAL_PARAM_BY_KEY.sal.alias[0]).toBe('S‰');
  });
});
