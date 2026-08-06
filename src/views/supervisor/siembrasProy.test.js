import { describe, it, expect } from 'vitest';
import { computeSiembras } from './siembras.js';

const L = (tq, fecha, pob, estadio) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '585', Tanque: tq,
  Fecha: fecha, 'Población': String(pob), 'Estadío': estadio, Lote: 'AB',
});

// TQ1: N5 el 01/07 con 1.000.000 · transferido (penúltima) 800.000 · cosecha 700.000.
// TQ2: N5 el 01/07 con 1.000.000 · transferido (penúltima) 600.000 · cosecha 500.000.
const rows = () => [
  L('TQ1', '01/07/2026', 1000000, 'N5'), L('TQ1', '10/07/2026', 800000, 'PL5'), L('TQ1', '15/07/2026', 700000, 'PL11'),
  L('TQ2', '01/07/2026', 1000000, 'N5'), L('TQ2', '10/07/2026', 600000, 'PL5'), L('TQ2', '15/07/2026', 500000, 'PL11'),
];

describe('computeSiembras · población proyectada desde el transferido', () => {
  it('por tanque = transferido − merma (10 % por defecto)', () => {
    const d = computeSiembras(rows());
    const t = Object.fromEntries(d.siembras[0].tanks.map((x) => [x.tq, x]));
    expect(t.TQ1.transferido).toBe(800000);
    expect(t.TQ1.proyectado).toBeCloseTo(720000, 6); // 800.000 × 0,90
    expect(t.TQ2.proyectado).toBeCloseTo(540000, 6); // 600.000 × 0,90
  });

  it('la columna SUMA exactamente el "A cosechar" del subtotal y del total', () => {
    const d = computeSiembras(rows());
    const suma = d.siembras[0].tanks.reduce((a, t) => a + (t.proyectado || 0), 0);
    expect(suma).toBeCloseTo(d.siembras[0].subtotal.aCosechar, 6);
    expect(suma).toBeCloseTo(d.total.aCosechar, 6);
  });

  it('responde a la merma elegida en todo el rango 6–15 %', () => {
    for (const pct of [6, 7, 10, 12, 15]) {
      const d = computeSiembras(rows(), { merma: pct / 100 });
      const t = d.siembras[0].tanks.find((x) => x.tq === 'TQ1');
      expect(t.proyectado).toBeCloseTo(800000 * (1 - pct / 100), 6);
      expect(d.total.aCosechar).toBeCloseTo(1400000 * (1 - pct / 100), 6);
    }
  });

  it('un tanque "en proceso" (sin transferido) no proyecta nada', () => {
    const d = computeSiembras([L('TQ9', '01/07/2026', 1000000, 'N5')]);
    const t = d.siembras[0].tanks[0];
    expect(t.enProceso).toBe(true);
    expect(t.transferido).toBeNull();
    expect(t.proyectado).toBeNull();
  });
});
