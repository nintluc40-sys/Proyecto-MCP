/* El Trovan cruza las 3 hojas del Registro Reproductivo, así que ESCRITURA (Registros) y
   LECTURA (Maduración) tienen que normalizarlo igual. Vivían dos copias que no coincidían. */
import { describe, it, expect } from 'vitest';
import { normTrovan, sanitizeStr } from './trovan.js';
import { normTrovan as normEscritura } from '../views/registros/lib/reproductivo.data.js';
import { buildReproModel } from '../views/maduracion/data.js';

describe('core · normTrovan', () => {
  it('canoniza espacios y mayúsculas', () => {
    expect(normTrovan(' 0006a1b2 ')).toBe('0006A1B2');
    expect(normTrovan('00 06 A1 B2')).toBe('0006A1B2');
    expect(normTrovan(null)).toBe('');
  });

  it('sanea los prefijos de inyección de fórmula, que es donde divergían las copias', () => {
    ['=', '+', '-', '@'].forEach((p) => expect(normTrovan(p + '0006A1B2')).toBe('0006A1B2'));
  });

  it('acota a 200 caracteres', () => {
    expect(normTrovan('A'.repeat(205))).toHaveLength(200);
  });

  it('la ESCRITURA usa exactamente esta definición (no una copia parecida)', () => {
    // Si vuelven a separarse, este test lo dice antes de que el cruce se rompa en silencio.
    expect(normEscritura).toBe(normTrovan);
  });

  it('sanitizeStr conserva su contrato (Registros la re-exporta)', () => {
    expect(sanitizeStr('  hola  ')).toBe('hola');
    expect(sanitizeStr('=SUMA(A1)')).toBe('SUMA(A1)');
    expect(sanitizeStr(null)).toBe('');
  });
});

describe('core · la LECTURA de Maduración cruza con la misma clave', () => {
  it('une una fila legada con prefijo raro contra la MATRIZ saneada', () => {
    // MATRIZ guardada por la app (ya saneada) y una Bitácora llegada por otra vía —edición
    // manual o importación— con el prefijo intacto. Antes eran DOS claves distintas y el
    // desove no se le atribuía a nadie.
    const m = buildReproModel(
      [{ 'Trovan ID': '0006A1B2', 'Sala actual': 'S1', 'Tanque actual': 'T1', Estado: 'Vivo' }],
      [{ 'Trovan ID': '=0006a1b2', Fecha: '10/06/2026', Tipo: 'Desove' }],
      [],
    );
    expect(m.desoves).toHaveLength(1);
    expect(m.desoves[0].trovan).toBe('0006A1B2');
    // Y al cruzar contra la MATRIZ recupera su ubicación en vez de quedarse sin ella.
    expect(m.desoves[0].tanque).toBe('T1');
    expect(m.desovesByTrovan.get('0006A1B2')).toHaveLength(1);
  });
});
