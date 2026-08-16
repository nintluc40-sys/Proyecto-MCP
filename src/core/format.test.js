import { describe, it, expect } from 'vitest';
import {
  pct, svLevel, odLevel, tmpLevel, larviZone, esc, wqiBand, fmtPop,
} from './format.js';

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

/* ============================================================
   Guardas de "sin dato": los semáforos deciden por comparaciones, y TODAS son false
   frente a NaN, así que sin guarda un valor no numérico caía al PEOR nivel y pintaba
   una alarma roja donde no hay medición. Hoy no llega NaN (parseNum devuelve null,
   avg lo filtra, survival protege la división); estos tests cierran la clase.
   ============================================================ */
describe('NaN se trata como "sin dato", no como el peor nivel', () => {
  it('los cuatro semáforos', () => {
    expect(svLevel(NaN)).toBe('sin');
    expect(odLevel(NaN)).toBe('sin');
    expect(tmpLevel(NaN)).toBe('sin');
    expect(wqiBand(NaN).sev).toBe('sin-rango');
  });

  it('undefined y null siguen dando "sin dato" (sin regresión)', () => {
    for (const v of [null, undefined]) {
      expect(svLevel(v)).toBe('sin');
      expect(odLevel(v)).toBe('sin');
      expect(tmpLevel(v)).toBe('sin');
    }
    expect(wqiBand(null).sev).toBe('sin-rango');
    expect(wqiBand(undefined).sev).toBe('sin-rango');
  });

  it('los valores numéricos reales NO cambian de nivel', () => {
    expect(svLevel(95)).toBe('excelente');
    expect(svLevel(0)).toBe('grave');       // 0 es una medición real, no "sin dato"
    expect(odLevel(6)).toBe('excelente');
    expect(odLevel(0)).toBe('grave');
    expect(tmpLevel(32)).toBe('excelente');
    expect(wqiBand(90).sev).toBe('optimo');
    expect(wqiBand(10).sev).toBe('critico');
  });
});

describe('fmtPop', () => {
  it('NaN da "—" y no el texto "NaN"', () => {
    expect(fmtPop(NaN)).toBe('—');
  });
  it('nulo y ≤0 dan "—" (sin regresión)', () => {
    expect(fmtPop(null)).toBe('—');
    expect(fmtPop(undefined)).toBe('—');
    expect(fmtPop(0)).toBe('—');
    expect(fmtPop(-5)).toBe('—');
  });
  it('un número real se formatea con separador de miles', () => {
    expect(fmtPop(1234567)).toBe((1234567).toLocaleString('es-EC'));
    expect(fmtPop(1499.6)).toBe((1500).toLocaleString('es-EC')); // redondea
  });
});
