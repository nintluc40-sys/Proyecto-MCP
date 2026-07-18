import { describe, it, expect } from 'vitest';
import { ufcRadius, colonyLayout, petriSVG } from './petri.js';

describe('ufcRadius', () => {
  it('crece monótonamente con la UFC (escala log)', () => {
    const a = ufcRadius(100, 10, 10000);
    const b = ufcRadius(1000, 10, 10000);
    const c = ufcRadius(10000, 10, 10000);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
  it('UFC ≤ 0 → radio mínimo', () => {
    expect(ufcRadius(0, 10, 10000, 6, 34)).toBe(6);
    expect(ufcRadius(-5, 10, 10000, 6, 34)).toBe(6);
  });
  it('rango colapsado (mn==mx) → radio medio', () => {
    expect(ufcRadius(50, 50, 50, 6, 34)).toBe(20);
  });
});

describe('colonyLayout', () => {
  const colonies = [
    { id: 'a', ufc: 100, color: '#f00' },
    { id: 'b', ufc: 5000, color: '#0f0' },
    { id: 'c', ufc: 200, color: '#00f' },
    { id: 'd', ufc: 30, color: '#ff0' },
  ];
  it('coloca todas las colonias', () => {
    expect(colonyLayout(colonies, 120).length).toBe(colonies.length);
  });
  it('mantiene cada colonia dentro del plato', () => {
    const DR = 120;
    colonyLayout(colonies, DR).forEach(({ x, y, r }) => {
      expect(Math.sqrt(x * x + y * y) + r).toBeLessThanOrEqual(DR + 0.5);
    });
  });
  it('lista vacía → []', () => {
    expect(colonyLayout([], 120)).toEqual([]);
  });
});

describe('petriSVG', () => {
  it('genera un <svg> con una colonia por entrada', () => {
    const svg = petriSVG([{ id: 'x', ufc: 100, color: '#f00' }, { id: 'y', ufc: 9, color: '#0f0' }], 300, 'dark');
    expect(svg).toContain('<svg');
    expect((svg.match(/class="mic-colony"/g) || []).length).toBe(2);
  });
  it('placa vacía muestra el mensaje "Sin colonias"', () => {
    expect(petriSVG([], 300, 'light')).toContain('Sin colonias');
  });
  it('acepta ambos temas sin reventar', () => {
    expect(petriSVG([{ id: 'x', ufc: 1, color: '#f00' }], 200, 'light')).toContain('<svg');
    expect(petriSVG([{ id: 'x', ufc: 1, color: '#f00' }], 200, 'dark')).toContain('<svg');
  });
});
