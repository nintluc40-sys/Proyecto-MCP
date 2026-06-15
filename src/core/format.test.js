import { describe, it, expect } from 'vitest';
import {
  formatNumber, pct, svLevel, odLevel, tmpLevel, larviZone, esc,
} from './format.js';

describe('formatNumber', () => {
  it('abrevia millones y miles', () => {
    expect(formatNumber(1_500_000)).toBe('1.5M');
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(850)).toBe('850');
  });
  it('N/A para valores no numéricos', () => {
    expect(formatNumber(null)).toBe('N/A');
    expect(formatNumber(NaN)).toBe('N/A');
  });
});

describe('pct', () => {
  it('formatea con un decimal por defecto', () => {
    expect(pct(45.678)).toBe('45.7%');
  });
  it('— para no numérico', () => {
    expect(pct(null)).toBe('—');
  });
});

describe('semáforos por umbral (fronteras)', () => {
  it('svLevel (mayor = mejor)', () => {
    expect(svLevel(95)).toBe('excelente'); // >= 90
    expect(svLevel(90)).toBe('excelente');
    expect(svLevel(70)).toBe('bueno');     // >= 70
    expect(svLevel(40)).toBe('malo');      // >= 40
    expect(svLevel(20)).toBe('grave');
    expect(svLevel(null)).toBe('sin');
  });

  it('odLevel (rango óptimo 5–7)', () => {
    expect(odLevel(6)).toBe('excelente');
    expect(odLevel(4.5)).toBe('bueno');
    expect(odLevel(3.5)).toBe('malo');
    expect(odLevel(2)).toBe('grave');
    expect(odLevel(null)).toBe('sin');
  });

  it('tmpLevel (rango óptimo 31–33)', () => {
    expect(tmpLevel(32)).toBe('excelente');
    expect(tmpLevel(30)).toBe('bueno');
    expect(tmpLevel(28)).toBe('malo');
    expect(tmpLevel(20)).toBe('grave');
  });

  it('larviZone (menor = mejor, escala 0–100)', () => {
    expect(larviZone(10)).toBe('optimo');   // <= 25
    expect(larviZone(40)).toBe('atencion'); // <= 50
    expect(larviZone(60)).toBe('alerta');   // <= 75
    expect(larviZone(90)).toBe('critico');
    expect(larviZone(null)).toBe('sin');
  });
});

describe('esc', () => {
  it('escapa caracteres peligrosos para HTML', () => {
    expect(esc('<b>"x"&\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');
  });
  it('cadena vacía para null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
