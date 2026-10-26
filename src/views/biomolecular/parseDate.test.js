// Auditoría de cierre · Biomolecular. `parseDate` valida el AÑO (descarta «30/01/0202»)
// pero no validaba el rango de MES ni de DÍA. Cadena de fallo medida:
//   1. `parseDate('15/13/2026')` devolvía el ISO imposible «2026-13-15».
//   2. `normalizeRows` conservaba la fila: su guarda solo mira el año.
//   3. Las fechas se ordenan como CADENA, así que «2026-13-15» quedaba DESPUÉS de
//      diciembre y pasaba a ser el «último día con datos» que ancla los presets.
//   4. `applyPreset` hace `new Date(maxISO + 'T00:00:00Z').toISOString()` → Invalid Date
//      → **RangeError: Invalid time value**.
// Resultado: UNA fila con fecha malformada rompía TODOS los botones de rango de fecha.
import { describe, it, expect } from 'vitest';
import { parseDate, normalizeRows } from './index.js';

describe('parseDate · rango de mes y día', () => {
  it('descarta un mes imposible en vez de fabricar un ISO inválido', () => {
    expect(parseDate('15/13/2026')).toBeNull();
    expect(parseDate('15/00/2026')).toBeNull();
  });

  it('descarta también un día imposible', () => {
    expect(parseDate('32/06/2026')).toBeNull();
    expect(parseDate('00/06/2026')).toBeNull();
  });

  it('no se pasa de corrección: las fechas válidas siguen igual', () => {
    expect(parseDate('15/06/2026')).toBe('2026-06-15');
    expect(parseDate('1/1/2026')).toBe('2026-01-01');
    expect(parseDate('31/12/26')).toBe('2026-12-31');   // año de 2 dígitos
    expect(parseDate('15-06-2026')).toBe('2026-06-15'); // separador guion
  });

  it('la fila corrupta ya no contamina el conjunto ni el ancla de los presets', () => {
    const rows = normalizeRows([
      { Fecha: '15/06/2026', 'Código': 'A', IHHNV: 'Negativo' },
      { Fecha: '15/13/2026', 'Código': 'B', IHHNV: 'Negativo' },
      { Fecha: '20/06/2026', 'Código': 'C', IHHNV: 'Positivo' },
    ]);
    expect(rows.map((r) => r.f)).toEqual(['2026-06-15', '2026-06-20']);

    // El ancla de los presets vuelve a ser una fecha real y `toISOString` no lanza.
    const all = [...new Set(rows.map((r) => r.f))].sort();
    const maxISO = all[all.length - 1];
    expect(maxISO).toBe('2026-06-20');
    expect(() => {
      const c = new Date(maxISO + 'T00:00:00Z');
      c.setUTCDate(c.getUTCDate() - 30);
      c.toISOString();
    }).not.toThrow();
  });

  it('sigue descartando el año imposible que ya se filtraba', () => {
    expect(normalizeRows([{ Fecha: '30/01/0202', 'Código': 'X' }])).toEqual([]);
  });
});

// Revisión de pendientes (2026-10-25, punto 11) · la fecha con el AÑO DELANTE. La regla de dd/mm, sin ancla, leía
// «26-10-05» del medio de «2026-10-05» y daba 2005-10-26: un año que pasa el filtro de `normalizeRows`, así que la fila
// entraba con fecha falsa y sin aviso. Y un serial de Excel, por `new Date`, daba 1970 y se descartaba.
describe('parseDate · el año delante y el serial de Excel', () => {
  it('lee la fecha con el año delante, con guion, con barra y con hora', () => {
    expect(parseDate('2026-10-05')).toBe('2026-10-05');
    expect(parseDate('2026-10-05')).not.toBe('2005-10-26');
    expect(parseDate('2026-10-05T00:00:00.000Z')).toBe('2026-10-05');
    expect(parseDate('2026/10/05')).toBe('2026-10-05');
    expect(parseDate('2026-1-5')).toBe('2026-01-05');
  });

  it('con el año delante también descarta el mes o el día imposibles', () => {
    expect(parseDate('2026-13-05')).toBeNull();
    expect(parseDate('2026-10-32')).toBeNull();
  });

  it('dd/mm/aaaa no cambia, tampoco con la hora detrás', () => {
    expect(parseDate('05/10/2026')).toBe('2026-10-05');
    expect(parseDate('05/10/2026 10:30:00')).toBe('2026-10-05');
    expect(parseDate('5-10-26')).toBe('2026-10-05');
  });

  it('un serial de Excel da su día (antes, 1970)', () => {
    expect(parseDate(46300)).toBe('2026-10-05');
    expect(parseDate('46300')).toBe('2026-10-05');
  });

  it('las filas entran con su fecha verdadera', () => {
    const rows = normalizeRows([
      { Fecha: '2026-10-05', 'Código': 'A', IHHNV: 'Negativo' },
      { Fecha: 46301, 'Código': 'B', IHHNV: 'Negativo' },
      { Fecha: '07/10/2026', 'Código': 'C', IHHNV: 'Positivo' },
    ]);
    expect(rows.map((r) => r.f)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });
});
