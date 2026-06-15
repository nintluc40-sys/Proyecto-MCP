import { describe, it, expect } from 'vitest';
import {
  pad, escapeHtml, sanitizeStr, sanitizeNum, isValidDate, isValidGasUrl,
} from './security.js';

describe('pad', () => {
  it('rellena a 2 dígitos', () => {
    expect(pad(3)).toBe('03');
    expect(pad(12)).toBe('12');
    expect(pad(0)).toBe('00');
  });
});

describe('escapeHtml', () => {
  it('escapa los 5 caracteres peligrosos', () => {
    expect(escapeHtml('<b>"x"&\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#x27;&lt;/b&gt;');
  });
  it('vacío para null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('neutraliza un payload de script', () => {
    expect(escapeHtml('<script>alert(1)</script>')).not.toContain('<script>');
  });
});

describe('sanitizeStr', () => {
  it('recorta espacios y limita a 200 caracteres', () => {
    expect(sanitizeStr('  hola  ')).toBe('hola');
    expect(sanitizeStr('a'.repeat(250))).toHaveLength(200);
  });
  it('elimina caracteres de inyección de fórmula iniciales', () => {
    expect(sanitizeStr('=IMPORTRANGE("x")')).toBe('IMPORTRANGE("x")');
    expect(sanitizeStr('+cmd')).toBe('cmd');
    expect(sanitizeStr('@SUM')).toBe('SUM');
    expect(sanitizeStr('---5')).toBe('5');
  });
  it('vacío para null/undefined', () => {
    expect(sanitizeStr(null)).toBe('');
    expect(sanitizeStr(undefined)).toBe('');
  });
});

describe('sanitizeNum', () => {
  it('parsea y acota al rango', () => {
    expect(sanitizeNum('42')).toBe(42);
    expect(sanitizeNum(5, 0, 3)).toBe(3);
    expect(sanitizeNum(-5, 0, 3)).toBe(0);
  });
  it('"" para NaN/Infinity', () => {
    expect(sanitizeNum('abc')).toBe('');
    expect(sanitizeNum(Infinity)).toBe('');
  });
});

describe('isValidDate', () => {
  it('acepta YYYY-MM-DD válidas', () => {
    expect(isValidDate('2024-03-15')).toBe(true);
    expect(isValidDate('2024-12-31')).toBe(true);
  });
  it('rechaza formatos o rangos inválidos', () => {
    expect(isValidDate('2024-13-01')).toBe(false);
    expect(isValidDate('2024-00-10')).toBe(false);
    expect(isValidDate('2024-03-32')).toBe(false);
    expect(isValidDate('15/03/2024')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });
});

describe('isValidGasUrl', () => {
  it('acepta HTTPS en script.google.com', () => {
    expect(isValidGasUrl('https://script.google.com/macros/s/ABC/exec')).toBe(true);
  });
  it('rechaza HTTP, otros hosts y el truco de sufijo', () => {
    expect(isValidGasUrl('http://script.google.com/x')).toBe(false);
    expect(isValidGasUrl('https://evilscript.google.com/x')).toBe(false);
    expect(isValidGasUrl('https://example.com')).toBe(false);
    expect(isValidGasUrl('no-es-url')).toBe(false);
  });
});
