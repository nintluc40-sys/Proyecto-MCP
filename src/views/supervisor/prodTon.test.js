import { describe, it, expect } from 'vitest';
import { resolveTon, densSiembra, putMonth, TON_DEFAULT } from './prodTon.js';

describe('prodTon · resolveTon (guardado → heredado → 28)', () => {
  it('sin config → 28 por defecto', () => {
    expect(resolveTon({}, 6, '579', 'M06', 'TQ1')).toBe(TON_DEFAULT);
    expect(resolveTon(null, 6, '579', 'M06', 'TQ1')).toBe(28);
  });

  it('valor explícito del mes gana', () => {
    const all = { 6: { 579: { M06: { TQ1: 31.5 } } } };
    expect(resolveTon(all, 6, '579', 'M06', 'TQ1')).toBe(31.5);
    expect(resolveTon(all, 6, '579', 'M06', 'TQ2')).toBe(28); // otro tanque sin dato → 28
  });

  it('hereda del mes anterior configurado (mismo módulo+tanque, cualquier corrida)', () => {
    // Mes 5, corrida 578, M06 configurado a 30. Mes 6 (corrida 579) sin dato → hereda 30.
    const all = { 5: { 578: { M06: { TQ1: 30, TQ2: 30 } } } };
    expect(resolveTon(all, 6, '579', 'M06', 'TQ1')).toBe(30);
    expect(resolveTon(all, 6, '579', 'M06', 'TQ2')).toBe(30);
    // Tanque no heredable → 28.
    expect(resolveTon(all, 6, '579', 'M06', 'TQ9')).toBe(28);
  });

  it('lo explícito del mes gana sobre lo heredado', () => {
    const all = { 5: { 578: { M06: { TQ1: 30 } } }, 6: { 579: { M06: { TQ1: 28 } } } };
    expect(resolveTon(all, 6, '579', 'M06', 'TQ1')).toBe(28); // no arrastra el 30 del mes previo
  });
});

describe('prodTon · densSiembra (ponderada por volumen)', () => {
  const segs = [{ corrida: '579', mod: 'M06', sieByTank: { TQ1: 4300000, TQ2: 4300000 } }];

  it('con todo en 28 EQUIVALE a la fórmula previa (Σsiembra/nSie)/28/1000', () => {
    // (8.600.000 / 2) / 28 / 1000 = 153,5714…
    expect(densSiembra({}, 6, segs)).toBeCloseTo(153.5714, 3);
  });

  it('toneladas por tanque cambian la densidad (ponderación real)', () => {
    // TQ1=30 explícito, TQ2 → 28 ⇒ Σt=58 ⇒ 8.600.000 / 58 / 1000
    const all = { 6: { 579: { M06: { TQ1: 30 } } } };
    expect(densSiembra(all, 6, segs)).toBeCloseTo(148.2759, 3);
  });

  it('varios segmentos (subtotal/total) se ponderan juntos', () => {
    const multi = [
      { corrida: '579', mod: 'M06', sieByTank: { TQ1: 4300000 } },
      { corrida: '580', mod: 'M08', sieByTank: { TQ1: 4300000 } },
    ];
    // 8.600.000 / (28+28) / 1000
    expect(densSiembra({}, 6, multi)).toBeCloseTo(153.5714, 3);
  });

  it('sin siembra → null', () => {
    expect(densSiembra({}, 6, [{ corrida: '579', mod: 'M06', sieByTank: {} }])).toBeNull();
    expect(densSiembra({}, 6, [])).toBeNull();
  });
});

describe('prodTon · putMonth (persistencia por mes)', () => {
  it('guarda valores positivos, descarta inválidos y luego se leen', () => {
    const all = putMonth({}, 6, { 579: { M06: { TQ1: 30, TQ2: 'x', TQ3: 0 } } });
    expect(resolveTon(all, 6, '579', 'M06', 'TQ1')).toBe(30);
    expect(resolveTon(all, 6, '579', 'M06', 'TQ2')).toBe(28); // 'x' descartado
    expect(resolveTon(all, 6, '579', 'M06', 'TQ3')).toBe(28); // 0 descartado
  });

  it('mes sin valores válidos elimina la entrada (vuelve a herencia/28)', () => {
    const all = putMonth({ 6: { 579: { M06: { TQ1: 30 } } } }, 6, { 579: { M06: { TQ1: 0 } } });
    expect(all['6']).toBeUndefined();
    expect(resolveTon(all, 6, '579', 'M06', 'TQ1')).toBe(28);
  });
});
