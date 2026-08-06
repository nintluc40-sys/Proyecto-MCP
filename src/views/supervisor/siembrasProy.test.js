import { describe, it, expect } from 'vitest';
import { computeSiembras } from './siembras.js';

const L = (tq, fecha, pob, estadio, extra = {}) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': 'M06', Corrida: '585', Tanque: tq,
  Fecha: fecha, 'Población': String(pob), 'Estadío': estadio, Lote: 'AB', ...extra,
});

// Columnas que `isDespachoRow` reconoce como ficha de despacho: la cosecha real llega
// SIEMPRE con ellas, y son las que separan el Transferido de la salida del tanque.
const DESP = { 'Densidad cosechada': '25', Biomasa: '120', Destino: 'Piscina 3', 'Cajas/Tinas': '10' };

// TQ1: N5 el 01/07 con 1.000.000 · transferido 800.000 (PL5) · despacho 700.000 (PL11).
// TQ2: N5 el 01/07 con 1.000.000 · transferido 600.000 (PL5) · despacho 500.000 (PL11).
const rows = () => [
  L('TQ1', '01/07/2026', 1000000, 'N5'), L('TQ1', '10/07/2026', 800000, 'PL5'), L('TQ1', '15/07/2026', 700000, 'PL11', DESP),
  L('TQ2', '01/07/2026', 1000000, 'N5'), L('TQ2', '10/07/2026', 600000, 'PL5'), L('TQ2', '15/07/2026', 500000, 'PL11', DESP),
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
    expect(t.supervProy).toBeNull();
  });
});

describe('computeSiembras · supervivencia real frente a proyectada', () => {
  it('la merma mueve la proyectada y deja intacta la real', () => {
    const base = computeSiembras(rows(), { merma: 0.10 });
    const alta = computeSiembras(rows(), { merma: 0.15 });
    const tq1 = (d) => d.siembras[0].tanks.find((x) => x.tq === 'TQ1');

    expect(tq1(base).superv).toBeCloseTo(80, 6);   // 800.000 ÷ 1.000.000 — real
    expect(tq1(alta).superv).toBeCloseTo(80, 6);   // NO se mueve con la merma
    expect(tq1(base).supervProy).toBeCloseTo(72, 6); // 80 × 0,90
    expect(tq1(alta).supervProy).toBeCloseTo(68, 6); // 80 × 0,85
  });

  it('los subtotales y el total también proyectan', () => {
    for (const pct of [6, 10, 15]) {
      const d = computeSiembras(rows(), { merma: pct / 100 });
      // (800.000 + 600.000) ÷ (1.000.000 + 1.000.000) = 70 % real
      expect(d.total.superv).toBeCloseTo(70, 6);
      expect(d.total.supervProy).toBeCloseTo(70 * (1 - pct / 100), 6);
      expect(d.siembras[0].subtotal.supervProy).toBeCloseTo(70 * (1 - pct / 100), 6);
    }
  });

  it('la proyectada nunca supera a la real ni se sale de rango', () => {
    for (const pct of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      const d = computeSiembras(rows(), { merma: pct / 100 });
      d.siembras[0].tanks.forEach((t) => {
        expect(t.supervProy).toBeLessThanOrEqual(t.superv);
        expect(t.supervProy).toBeGreaterThanOrEqual(0);
      });
    }
  });
});
