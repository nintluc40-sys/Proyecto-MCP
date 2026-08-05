import { describe, it, expect } from 'vitest';
import { computeSiembras } from './siembras.js';

// Fila mínima de Larvicultura (las claves coinciden con core/fields.js).
const row = (fecha, tanque, estadio, pob, extra = {}) => ({
  Fecha: fecha, Tanque: tanque, 'Estadío': estadio, 'Población': pob, ...extra,
});

// Escenario base: 2 siembras en un módulo.
//  1ª (N5 el 02/06): T1, T2 — ambos con transferido (≥3 poblaciones).
//  2ª (N5 el 05/06): T3 en proceso (1 sola población), T4 con transferido.
function baseRows() {
  return [
    // T1
    row('02/06/2026', 'TQ1', 'N5', 1200000),
    row('06/06/2026', 'TQ1', 'PL2', 1150000),
    row('10/06/2026', 'TQ1', 'PL6', 1050000, { PLG: 62 }), // transferido
    row('14/06/2026', 'TQ1', 'PL8', 1000000),              // cosecha
    // T2
    row('02/06/2026', 'TQ2', 'N5', 1000000),
    row('06/06/2026', 'TQ2', 'PL2', 950000),
    row('10/06/2026', 'TQ2', 'PL6', 900000, { PLG: 60 }),  // transferido
    row('14/06/2026', 'TQ2', 'PL8', 850000),               // cosecha
    // T3 — en proceso (solo siembra)
    row('05/06/2026', 'TQ3', 'N5', 1100000),
    // T4
    row('05/06/2026', 'TQ4', 'N5', 1200000),
    row('09/06/2026', 'TQ4', 'PL2', 1120000),
    row('12/06/2026', 'TQ4', 'PL6', 1080000, { PLG: 54 }), // transferido
    row('15/06/2026', 'TQ4', 'PL8', 1000000),              // cosecha
  ];
}

describe('computeSiembras · agrupación por fecha de N5', () => {
  it('agrupa en 1ª/2ª siembra por la fecha del primer N5, ordenadas ascendente', () => {
    const d = computeSiembras(baseRows());
    expect(d.nSiembras).toBe(2);
    expect(d.nTanks).toBe(4);
    expect(d.siembras[0].idx).toBe(1);
    expect(d.siembras[0].tanks.map((t) => t.tq)).toEqual(['TQ1', 'TQ2']);
    expect(d.siembras[1].idx).toBe(2);
    expect(d.siembras[1].tanks.map((t) => t.tq)).toEqual(['TQ3', 'TQ4']);
  });

  it('los tanques salen ordenados por número dentro de la siembra', () => {
    // Mezcla el orden de entrada; debe salir TQ1 antes que TQ10.
    const rows = [
      row('02/06/2026', 'TQ10', 'N5', 500000),
      row('05/06/2026', 'TQ10', 'PL3', 480000),
      row('06/06/2026', 'TQ10', 'PL5', 470000),
      row('02/06/2026', 'TQ1', 'N5', 600000),
      row('05/06/2026', 'TQ1', 'PL3', 560000),
      row('06/06/2026', 'TQ1', 'PL5', 540000),
    ];
    const d = computeSiembras(rows);
    expect(d.siembras[0].tanks.map((t) => t.tq)).toEqual(['TQ1', 'TQ10']);
  });
});

describe('computeSiembras · derivación por tanque', () => {
  it('Sembrado = 1er N5 · Transferido = penúltima · PL/g y estadío de la línea del transferido', () => {
    const d = computeSiembras(baseRows());
    const t1 = d.siembras[0].tanks[0];
    expect(t1.siembra).toBe(1200000);
    expect(t1.transferido).toBe(1050000);
    expect(t1.plg).toBe(62);
    expect(t1.estadio).toBe('PL6');
    expect(t1.superv).toBeCloseTo(87.5, 5); // 1.05M / 1.2M
    expect(t1.enProceso).toBe(false);
  });

  it('tanque con <2 poblaciones queda "en proceso" (sin transferido ni superv.)', () => {
    const d = computeSiembras(baseRows());
    const t3 = d.siembras[1].tanks.find((t) => t.tq === 'TQ3');
    expect(t3.enProceso).toBe(true);
    expect(t3.transferido).toBeNull();
    expect(t3.superv).toBeNull();
    expect(t3.siembra).toBe(1100000); // sí aporta al sembrado
  });

  it('sin registro N5 usa la primera población como siembra (fallback)', () => {
    const rows = [
      row('03/06/2026', 'TQ7', 'PL1', 800000), // nunca hubo N5
      row('07/06/2026', 'TQ7', 'PL4', 760000),
      row('10/06/2026', 'TQ7', 'PL6', 730000),
    ];
    const d = computeSiembras(rows);
    expect(d.nSiembras).toBe(1);
    expect(d.siembras[0].tanks[0].siembra).toBe(800000);
    expect(d.siembras[0].tanks[0].transferido).toBe(760000);
  });
});

describe('computeSiembras · subtotales y total', () => {
  it('subtotal por siembra suma sembrado/transferido y proyecta a cosechar −10%', () => {
    const d = computeSiembras(baseRows());
    const s1 = d.siembras[0].subtotal;
    expect(s1.sembrado).toBe(2200000);      // 1.2M + 1.0M
    expect(s1.transferido).toBe(1950000);   // 1.05M + 0.9M
    expect(s1.aCosechar).toBeCloseTo(1755000, 5); // 1.95M × 0.9
    expect(s1.superv).toBeCloseTo(88.6363, 3);    // 1.95M / 2.2M
  });

  it('la superv. del subtotal excluye el sembrado de los tanques en proceso', () => {
    const d = computeSiembras(baseRows());
    const s2 = d.siembras[1].subtotal;
    expect(s2.sembrado).toBe(2300000);    // T3 1.1M + T4 1.2M (todos)
    expect(s2.transferido).toBe(1080000); // solo T4
    // superv = 1.08M / 1.2M (denominador = solo T4, que tiene transferido) = 90
    expect(s2.superv).toBeCloseTo(90, 5);
    expect(s2.aCosechar).toBeCloseTo(972000, 5);
  });

  it('total del módulo agrega todas las siembras', () => {
    const d = computeSiembras(baseRows());
    expect(d.total.sembrado).toBe(4500000);   // 2.2M + 2.3M
    expect(d.total.transferido).toBe(3030000); // 1.95M + 1.08M
    expect(d.total.aCosechar).toBeCloseTo(2727000, 5); // 3.03M × 0.9
    expect(d.total.superv).toBeCloseTo(89.1176, 3);    // 3.03M / 3.4M
  });

  it('merma configurable: con merma 0 el "a cosechar" iguala al transferido', () => {
    const d = computeSiembras(baseRows(), { merma: 0 });
    expect(d.total.aCosechar).toBe(d.total.transferido);
    expect(d.siembras[0].subtotal.aCosechar).toBe(d.siembras[0].subtotal.transferido);
  });
});

describe('computeSiembras · casos límite', () => {
  it('sin filas → estructura vacía', () => {
    const d = computeSiembras([]);
    expect(d.nTanks).toBe(0);
    expect(d.nSiembras).toBe(0);
    expect(d.siembras).toEqual([]);
    expect(d.total.sembrado).toBeNull();
    expect(d.total.transferido).toBeNull();
    expect(d.total.superv).toBeNull();
  });

  it('ignora filas sin tanque', () => {
    const rows = [row('02/06/2026', '', 'N5', 500000), row('02/06/2026', 'TQ1', 'N5', 500000)];
    expect(computeSiembras(rows).nTanks).toBe(1);
  });
});
