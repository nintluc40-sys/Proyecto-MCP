import { describe, it, expect } from 'vitest';
import { buildHistogram, HIST_VARS } from './extra.js';

const L = (tq, extra) => ({ _SheetOrigin: 'Larvicultura', Tanque: tq, Fecha: '05/06/2026', ...extra });

describe('buildHistogram · variables de clasificación de tanques', () => {
  it('HIST_VARS incluye las variables nuevas Deformidad y % Suciedad', () => {
    const ids = HIST_VARS.map((v) => v.id);
    expect(ids).toContain('deformidad');
    expect(ids).toContain('suciedad');
  });

  it('Deformidad (menor = mejor) reparte por el último valor en las 4 zonas', () => {
    const rows = [
      L('TQ1', { Deformidad: '1' }),  // Óptimo (0–2)
      L('TQ2', { Deformidad: '4' }),  // Atención (3–5)
      L('TQ3', { Deformidad: '8' }),  // Alerta (6–10)
      L('TQ4', { Deformidad: '15' }), // Crítico (>10)
    ];
    const h = buildHistogram(rows, ['TQ1', 'TQ2', 'TQ3', 'TQ4'], 'deformidad');
    expect(h.total).toBe(4);
    expect(h.bins.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(h.bins.map((b) => b.label)).toEqual(['Óptimo (0–2)', 'Atención (3–5)', 'Alerta (6–10)', 'Crítico (>10)']);
  });

  it('% Suciedad (menor = mejor) reparte por el último valor en las 4 zonas', () => {
    const rows = [
      L('TQ1', { '% Suciedad': '3' }),  // Óptimo (0–5)
      L('TQ2', { '% Suciedad': '10' }), // Atención (6–15)
      L('TQ3', { '% Suciedad': '25' }), // Alerta (16–30)
      L('TQ4', { '% Suciedad': '40' }), // Crítico (>30)
    ];
    const h = buildHistogram(rows, ['TQ1', 'TQ2', 'TQ3', 'TQ4'], 'suciedad');
    expect(h.total).toBe(4);
    expect(h.bins.map((b) => b.count)).toEqual([1, 1, 1, 1]);
  });

  it('clasifica por el ÚLTIMO valor por fecha, no por el primero', () => {
    const rows = [
      { _SheetOrigin: 'Larvicultura', Tanque: 'TQ1', Fecha: '01/06/2026', Deformidad: '1' }, // Óptimo
      { _SheetOrigin: 'Larvicultura', Tanque: 'TQ1', Fecha: '05/06/2026', Deformidad: '12' }, // último → Crítico
    ];
    const h = buildHistogram(rows, ['TQ1'], 'deformidad');
    expect(h.total).toBe(1);
    expect(h.bins[3].count).toBe(1); // Crítico (>10)
  });

  it('ignora tanques sin dato de la variable (no cuentan en el total)', () => {
    const rows = [L('TQ1', { Deformidad: '1' }), L('TQ2', {})];
    const h = buildHistogram(rows, ['TQ1', 'TQ2'], 'deformidad');
    expect(h.total).toBe(1);
  });
});
