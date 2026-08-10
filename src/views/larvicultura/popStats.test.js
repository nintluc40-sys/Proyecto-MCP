// Auditoría de cierre · Larvicultura → `popStats`. La población INICIAL de cada tanque se
// tomaba como `arr[0]`, y `buildPopData` conserva los 0 a propósito (el gráfico debe mostrar
// la caída de un tanque vaciado). Un 0 en la PRIMERA lectura no es una siembra de cero: es
// que aún no se había contado. Como base, ese tanque aportaba su población actual al
// numerador y 0 al inicial, y la pérdida salía NEGATIVA — el panel afirmando que la
// población creció.
//
// Cuarta aparición de la misma regla en el sistema (las otras: core/prodCalendar.js,
// siembras.js, despacho.js y survival() de supervisor/stats.js). La ÚLTIMA lectura NO la
// usa: ahí el 0 sí es real y debe seguir contando como pérdida del 100 %.
import { describe, it, expect } from 'vitest';
import { buildPopData, popStats } from './extra.js';

const L = (tq, fecha, pob) => ({
  _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573',
  Tanque: tq, Fecha: fecha, 'Población': String(pob),
});
const stats = (rows) => popStats(buildPopData(rows));

describe('popStats · la población inicial es la primera lectura REAL (>0)', () => {
  it('un 0 en la primera lectura no vuelve NEGATIVA la pérdida', () => {
    // TQ1: N5 anotado con 0, conteo real 900 k, cierra en 700 k.
    // TQ2: siembra 1 M, cierra en 800 k.  ⇒ (1,9 M − 1,5 M) / 1,9 M = 21,1 %.
    const s = stats([
      L('TQ1', '01/06/2026', 0), L('TQ1', '05/06/2026', 900000), L('TQ1', '20/06/2026', 700000),
      L('TQ2', '01/06/2026', 1000000), L('TQ2', '20/06/2026', 800000),
    ]);
    expect(s.totalInit).toBe(1900000);
    expect(s.totalCurr).toBe(1500000);
    expect(s.pctLoss).toBe('21.1%');
    expect(s.pctLoss.startsWith('-')).toBe(false); // antes: «-50.0%»
  });

  it('no se pasa de corrección: un tanque VACIADO conserva su 100 % de pérdida', () => {
    const s = stats([L('TQ1', '01/06/2026', 1000000), L('TQ1', '20/06/2026', 0)]);
    expect(s.totalInit).toBe(1000000);
    expect(s.totalCurr).toBe(0);
    expect(s.pctLoss).toBe('100.0%');
  });

  it('sin ningún 0 de por medio, el cálculo es el de siempre', () => {
    const s = stats([
      L('TQ1', '01/06/2026', 1000000), L('TQ1', '20/06/2026', 800000),
      L('TQ2', '01/06/2026', 1000000), L('TQ2', '20/06/2026', 700000),
    ]);
    expect(s.totalInit).toBe(2000000);
    expect(s.pctLoss).toBe('25.0%');
    expect(s.validTanks).toBe(2);
  });

  it('un tanque con TODAS sus lecturas en 0 no aporta base de comparación', () => {
    const s = stats([
      L('TQ1', '01/06/2026', 1000000), L('TQ1', '20/06/2026', 800000),
      L('TQ9', '01/06/2026', 0), L('TQ9', '20/06/2026', 0),
    ]);
    expect(s.validTanks).toBe(1);      // TQ9 queda fuera del recuento
    expect(s.totalInit).toBe(1000000);
    expect(s.pctLoss).toBe('20.0%');   // no lo distorsiona
  });
});
