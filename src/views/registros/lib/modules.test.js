import { describe, it, expect } from 'vitest';
import {
  CIO_MOD, LAB_MOD, MAD_MOD, AST_MOD, MIC_MOD, BIO_MOD,
  isValidMod, isMicMod, isBioMod, isAstMod, isLabMod, isMadMod, isStdMod, mLabel,
} from './modules.js';

describe('isValidMod', () => {
  it('acepta M01..M10 y los módulos especiales', () => {
    expect(isValidMod(1)).toBe(true);
    expect(isValidMod(10)).toBe(true);
    expect(isValidMod(CIO_MOD)).toBe(true);
    expect(isValidMod(BIO_MOD)).toBe(true);
  });
  it('rechaza fuera de rango y no enteros', () => {
    expect(isValidMod(11)).toBe(true); // LAB_MOD es válido
    expect(isValidMod(16)).toBe(false);
    expect(isValidMod(-1)).toBe(false);
    expect(isValidMod(2.5)).toBe(false);
    expect(isValidMod('3')).toBe(false);
  });
});

describe('predicados de módulo', () => {
  it('cada especial coincide con su constante', () => {
    expect(isMicMod(MIC_MOD)).toBe(true);
    expect(isBioMod(BIO_MOD)).toBe(true);
    expect(isAstMod(AST_MOD)).toBe(true);
    expect(isLabMod(LAB_MOD)).toBe(true);
    expect(isMadMod(MAD_MOD)).toBe(true);
  });

  it('isStdMod true para larvicultura estándar (M01..M10 y CIO), false para especiales', () => {
    expect(isStdMod(1)).toBe(true);
    expect(isStdMod(10)).toBe(true);
    expect(isStdMod(CIO_MOD)).toBe(true);
    expect(isStdMod(LAB_MOD)).toBe(false);
    expect(isStdMod(MAD_MOD)).toBe(false);
    expect(isStdMod(BIO_MOD)).toBe(false);
    expect(isStdMod(AST_MOD)).toBe(false);
    expect(isStdMod(MIC_MOD)).toBe(false);
  });
});

describe('mLabel', () => {
  it('etiqueta los módulos especiales', () => {
    expect(mLabel(CIO_MOD)).toBe('CIO');
    expect(mLabel(LAB_MOD)).toBe('Lab');
    expect(mLabel(MAD_MOD)).toBe('MAD');
    expect(mLabel(AST_MOD)).toBe('AsT');
    expect(mLabel(MIC_MOD)).toBe('Mic');
    expect(mLabel(BIO_MOD)).toBe('Bio');
  });
  it('rellena M01..M10 con cero', () => {
    expect(mLabel(1)).toBe('M01');
    expect(mLabel(10)).toBe('M10');
  });
});
