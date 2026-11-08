/* ============================================================
   LARVICULTURA · etapas y variables de calidad · B10 (2026-11-08, usuario: «Los seis con lógica»)
   `peso` pondera el ICL de cada etapa: tiene que sumar 1. Cada variable trae su consejo para las tres zonas, y las
   combinaciones de alerta sólo pueden nombrar variables que existen, de UNA misma etapa (no se miden juntas).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { STAGES, LARVI_COMBOS } from './stages.js';

const claves = (st) => STAGES[st].vars.map((v) => v.key);

describe('stages · STAGES', () => {
  it('dos etapas, Larvicultura y Post-Larva, con cinco variables cada una', () => {
    expect(Object.keys(STAGES)).toEqual(['larv', 'postl']);
    expect(claves('larv')).toEqual(['iv', 'def', 'ret', 'hng', 'nvi']);
    expect(claves('postl')).toEqual(['op', 'fl', 'ne', 'ca', 'pa']);
  });

  it('los pesos de cada etapa suman 1', () => {
    for (const st of Object.keys(STAGES)) {
      const suma = STAGES[st].vars.reduce((a, v) => a + v.peso, 0);
      expect(suma, st).toBeCloseTo(1, 10);
    }
  });

  it('cada variable: consejo en atención, alerta y crítico; cabeceras que leer; y su color', () => {
    for (const st of Object.keys(STAGES)) {
      for (const v of STAGES[st].vars) {
        expect(Object.keys(v.tips).sort(), v.key).toEqual(['alerta', 'atencion', 'critico']);
        Object.values(v.tips).forEach((t) => expect(t.trim().length, v.key).toBeGreaterThan(0));
        expect(v.keys.length, v.key).toBeGreaterThan(0);
        expect(v.color, v.key).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('ninguna clave se repite entre etapas', () => {
    const todas = [...claves('larv'), ...claves('postl')];
    expect(new Set(todas).size).toBe(todas.length);
  });
});

describe('stages · LARVI_COMBOS', () => {
  it('cada combinación nombra dos variables que existen, de la MISMA etapa, con un umbral y su mensaje', () => {
    for (const c of LARVI_COMBOS) {
      expect(c.keys, c.msg).toHaveLength(2);
      const etapa = Object.keys(STAGES).find((st) => claves(st).includes(c.keys[0]));
      expect(etapa, c.msg).toBeTruthy();
      expect(claves(etapa), c.msg).toContain(c.keys[1]);
      expect(c.threshold, c.msg).toBeGreaterThan(0);
      expect(c.threshold, c.msg).toBeLessThanOrEqual(100);
      expect(c.msg.length).toBeGreaterThan(0);
    }
  });
});
