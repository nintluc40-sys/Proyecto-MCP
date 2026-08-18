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

  /* El tope de longitud pasó a ser un parámetro (2026-08-18) porque hay campos que son
     PÁRRAFOS y no etiquetas: el «Método utilizado» del informe de Biomol son 330 caracteres
     con los dos métodos del laboratorio, y se guardaba cortado a media palabra. Lo que NO
     podía cambiar es el resto: por defecto sigue recortando a 200, y el saneado de inyección
     de fórmula no depende de la longitud. */
  it('por defecto sigue recortando a 200 — ningún llamador cambia de comportamiento', () => {
    expect(sanitizeStr('x'.repeat(250))).toHaveLength(200);
  });

  it('con un tope mayor conserva el texto largo entero', () => {
    const parrafo = 'y'.repeat(330);
    expect(sanitizeStr(parrafo, 2000)).toBe(parrafo);
  });

  it('ampliar el tope NO relaja el saneado de inyección de fórmula', () => {
    expect(sanitizeStr('=SUMA(A1)', 2000)).toBe('SUMA(A1)');
    expect(sanitizeStr('@arroba', 2000)).toBe('arroba');
  });

  it('un tope inválido (0 o negativo) cae al de siempre', () => {
    expect(sanitizeStr('z'.repeat(250), 0)).toHaveLength(200);
    expect(sanitizeStr('z'.repeat(250), -5)).toHaveLength(200);
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
