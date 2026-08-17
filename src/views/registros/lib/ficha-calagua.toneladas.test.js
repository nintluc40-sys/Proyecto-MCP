/* ============================================================
   REGISTROS · columna "Toneladas" de la ficha Calidad de Agua (2026-08)

   La columna se añade al FINAL de la hoja "Datos Larvicultura - M0X" (índice 48, tras
   Observaciones) y al final de la ficha. Tres piezas tienen que decir lo MISMO o el dato
   se pierde en silencio:
     · el ESQUEMA de la ficha (lo que el técnico rellena)        → tn_i
     · el array `headers` del payload (la CABECERA real del Sheet)
     · la fila del payload (la posición física del valor)
   El Sheet toma su cabecera literalmente del payload, así que un desajuste de una letra
   entre "Toneladas" y "Tonelada" mandaría el dato a otra columna.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CALAGUA_COLUMNS, fieldName } from './ficha-calagua.schema.js';
import { renderCalaguaFicha } from '../fichas/calagua.render.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');
const engine = leer(ENGINE);

/** `headers` del payload de Datos Larvicultura, extraído del monolito REAL. */
function headersDelPayload() {
  const i = engine.indexOf('const headers = [');
  const j = engine.indexOf('];', i);
  const cuerpo = engine.slice(i + 'const headers = ['.length, j);
  return cuerpo.split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^"|"$/g, ''));
}

describe('calagua · columna Toneladas', () => {
  it('el esquema la declara la ÚLTIMA y como entero ≥ 0 sin máximo', () => {
    const ult = CALAGUA_COLUMNS[CALAGUA_COLUMNS.length - 1];
    expect(ult.code).toBe('tn');
    expect(ult.label).toBe('Toneladas');
    expect(ult.kind).toBe('number');
    expect(ult.min).toBe(0);
    expect(ult.step).toBe(1);
    expect(ult.max).toBeUndefined();   // no es un porcentaje
  });

  it('se renderiza como input numérico SIN max="undefined"', () => {
    // Atados min y max, una columna con mínimo pero sin máximo salía como
    // max="undefined" y el navegador la marcaba inválida al escribir un número.
    const html = renderCalaguaFicha({ tankCount: 2, data: {} });
    expect(html).toContain('name="tn_0"');
    expect(html).toContain('min="0"');
    expect(html).not.toContain('max="undefined"');
    expect(html).toContain('<th>Toneladas</th>');
  });

  it('no se pasa de corrección: las columnas con rango siguen llevando su max', () => {
    const html = renderCalaguaFicha({ tankCount: 1, data: {} });
    expect(html).toMatch(/name="ep_0"[^>]*min="0"[^>]*max="100"/);
  });

  it('el valor guardado se refleja en la celda', () => {
    const html = renderCalaguaFicha({ tankCount: 1, data: { [fieldName('tn', 0)]: 12 } });
    expect(html).toMatch(/name="tn_0"[^>]*value="12"/);
  });

  it('el payload la declara como ÚLTIMA cabecera, con el mismo texto que la ficha', () => {
    const headers = headersDelPayload();
    expect(headers[headers.length - 1]).toBe('Toneladas');
    // 49 columnas: las 48 anteriores + Toneladas.
    expect(headers.length).toBe(49);
    // Y sigue justo detrás de Observaciones, como en la hoja.
    expect(headers[headers.length - 2]).toBe('Observaciones');
    // El rótulo de la ficha y la cabecera del Sheet son la MISMA cadena.
    const ult = CALAGUA_COLUMNS[CALAGUA_COLUMNS.length - 1];
    expect(headers[headers.length - 1]).toBe(ult.label);
  });

  it('la fila del payload emite tn_i en la última posición', () => {
    // La fila se construye por POSICIÓN; si el valor no se emite, la cabecera existiría
    // con la columna siempre vacía.
    expect(engine).toMatch(/pv\(agua,"tn_"\+i\)\s*\/\/ 48 Toneladas/);
    // Y entra en el chequeo de "la fila tiene datos", para que un tanque cuyo ÚNICO
    // dato sean las toneladas no se descarte.
    expect(engine).toMatch(/agua\["ob_"\+i\], agua\["tn_"\+i\]/);
  });

  it('cabe en el límite del GAS (si no, doPost recorta la fila y se pierde)', () => {
    const maxCols = Number(/datos:\s*\{[^}]*maxCols:\s*(\d+)/.exec(engine)[1]);
    expect(headersDelPayload().length).toBeLessThanOrEqual(maxCols);
  });
});
