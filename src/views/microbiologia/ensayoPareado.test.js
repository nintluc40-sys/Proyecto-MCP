// Auditoría de cierre · Microbiología · Calidad de Agua · apartado Ensayo.
// `calEnsayoData` promediaba «antes» y «después» POR SEPARADO: una fila aportaba al
// promedio de «antes» aunque su «después» estuviera pendiente. El panel atribuía
// entonces al acondicionamiento iónico una diferencia que solo venía de comparar
// conjuntos distintos de muestras. Medido con Calcio, tres ensayos SIN ningún efecto:
//   3 ensayos completos, sin efecto        antes=400  desp=400  Δ=0    Δ%=0.0    n=3
//   +1 fila con «después» PENDIENTE (600)  antes=450  desp=400  Δ=-50  Δ%=-11.1  n=4
//   +1 fila SOLO con «después» (600)       antes=400  desp=450  Δ=50   Δ%=12.5   n=4
//   antes en una fila, después en OTRA     antes=380  desp=420  Δ=40   Δ%=10.5   n=1
// El último caso no tenía NI UN ensayo completo y aun así reportaba +10,5 % con n=1.
// El formato del Ensayo trae las dos columnas en la MISMA fila, así que con los datos
// completos el emparejamiento da exactamente el mismo resultado que antes.
import { describe, it, expect } from 'vitest';
import { calEnsayoData } from './calagua.data.js';

const R = (o) => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', ...o });
const calcio = (rows) => calEnsayoData(rows).find((p) => p.key === 'calcio');

const COMPLETOS = [
  R({ 'Calcio antes': '400', 'Calcio después': '400' }),
  R({ 'Calcio antes': '400', 'Calcio después': '400' }),
  R({ 'Calcio antes': '400', 'Calcio después': '400' }),
];

describe('calEnsayoData · el antes/después se compara EMPAREJADO por fila', () => {
  it('no se pasa de corrección: con los datos completos da lo mismo que siempre', () => {
    const d = calcio(COMPLETOS);
    expect(d.antes).toBe(400);
    expect(d.desp).toBe(400);
    expect(d.delta).toBe(0);
    expect(d.pct).toBe(0);
    expect(d.n).toBe(3);
  });

  it('una fila con el «después» pendiente NO desplaza el promedio de «antes»', () => {
    const d = calcio([...COMPLETOS, R({ 'Calcio antes': '600' })]);
    expect(d.pct).toBe(0);      // antes daba −11,1 %
    expect(d.antes).toBe(400);
    expect(d.n).toBe(3);
    expect(d.sueltos).toBe(1);  // la fila existe y se declara, pero no se compara
  });

  it('una fila con solo «después» tampoco', () => {
    const d = calcio([...COMPLETOS, R({ 'Calcio después': '600' })]);
    expect(d.pct).toBe(0);      // antes daba +12,5 %
    expect(d.desp).toBe(400);
    expect(d.n).toBe(3);
    expect(d.sueltos).toBe(1);
  });

  it('sin NINGÚN ensayo completo no se inventa una comparación', () => {
    const d = calcio([R({ 'Calcio antes': '380' }), R({ 'Calcio después': '420' })]);
    expect(d.n).toBe(0);
    expect(d.sueltos).toBe(2);
    expect(d.delta).toBeNull();
    expect(d.pct).toBeNull();   // antes daba +10,5 % con n=1
  });

  it('no se pasa de corrección: un efecto REAL se sigue midiendo igual', () => {
    const d = calcio([
      R({ 'Calcio antes': '400', 'Calcio después': '440' }),
      R({ 'Calcio antes': '400', 'Calcio después': '440' }),
    ]);
    expect(d.delta).toBe(40);
    expect(d.pct).toBeCloseTo(10, 6);
    expect(d.n).toBe(2);
    expect(d.sueltos).toBe(0);
  });

  it('no se pasa de corrección: la pareja sin dato alguno se sigue omitiendo', () => {
    expect(calEnsayoData([R({ pH: '8.0' })])).toEqual([]);
  });

  it('la pareja sigue apareciendo aunque solo haya filas sueltas (para verlas)', () => {
    const d = calcio([R({ 'Calcio antes': '380' })]);
    expect(d).toBeDefined();
    expect(d.n).toBe(0);
    expect(d.sueltos).toBe(1);
  });
});
