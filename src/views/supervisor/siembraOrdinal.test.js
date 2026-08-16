import { describe, it, expect } from 'vitest';
import { sieOrder } from './module.js';

/* ============================================================
   El filtro «🌱 Siembra» del Historial de Asistencia Técnica.
   La columna Siembra de Registro_Supervisión guarda el ordinal ESCRITO, no un número:
   medido sobre las 716 filas de producción, sus valores son "Primera"/"Segunda"/"Tercera".
   ============================================================ */
describe('sieOrder · orden cronológico de las siembras', () => {
  it('resuelve los ordinales escritos que existen en producción', () => {
    expect(sieOrder('Primera')).toBe(1);
    expect(sieOrder('Segunda')).toBe(2);
    expect(sieOrder('Tercera')).toBe(3);
  });

  it('es insensible a mayúsculas y espacios sobrantes', () => {
    expect(sieOrder('  SEGUNDA ')).toBe(2);
    expect(sieOrder('segunda')).toBe(2);
  });

  it('una "Cuarta" NO se cuela la primera (el fallo del orden alfabético)', () => {
    const vals = ['Tercera', 'Cuarta', 'Primera', 'Segunda'];
    const ordenado = [...vals].sort((a, b) => (sieOrder(a) - sieOrder(b)) || String(a).localeCompare(String(b), 'es'));
    expect(ordenado).toEqual(['Primera', 'Segunda', 'Tercera', 'Cuarta']);
    // Con el .sort() alfabético anterior, "Cuarta" quedaba la primera:
    expect([...vals].sort()[0]).toBe('Cuarta');
  });

  it('los tres valores reales conservan el MISMO orden que ya se veía', () => {
    const vals = ['Segunda', 'Primera', 'Tercera'];
    const ordenado = [...vals].sort((a, b) => (sieOrder(a) - sieOrder(b)) || String(a).localeCompare(String(b), 'es'));
    expect(ordenado).toEqual(['Primera', 'Segunda', 'Tercera']);
    expect(ordenado).toEqual([...vals].sort()); // idéntico a lo de antes: nada cambia hoy
  });

  it('acepta también un dígito suelto por si la hoja cambia de forma', () => {
    expect(sieOrder('2')).toBe(2);
    expect(sieOrder('10')).toBe(10);
  });

  it('lo desconocido y lo vacío caen al FINAL, no desaparecen', () => {
    expect(sieOrder('Refuerzo')).toBe(Infinity);
    expect(sieOrder('')).toBe(Infinity);
    expect(sieOrder(null)).toBe(Infinity);
    const vals = ['Refuerzo', 'Primera'];
    const ordenado = [...vals].sort((a, b) => (sieOrder(a) - sieOrder(b)) || String(a).localeCompare(String(b), 'es'));
    expect(ordenado).toEqual(['Primera', 'Refuerzo']);
  });
});
