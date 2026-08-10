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
