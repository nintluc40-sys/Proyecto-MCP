/* ============================================================
   REGISTROS · ficha "Traslado" — acuerdo con el monolito `engine.js`

   `CAMARONERA_OPTS` está DUPLICADA: el esquema es un módulo puro y no puede importar
   del monolito, pero la lista tiene que ser LA MISMA que alimenta el campo "Destino"
   de la ficha de Despacho de larvicultura (decisión del usuario 2026-08-20: la
   camaronera del traslado despliega ese mismo listado).

   Estas pruebas leen el `DESTINO_OPTS` REAL de `public/registros/engine.js` y exigen que
   coincidan. Sin esto, añadir una camaronera en un sitio y no en el otro haría que el
   traslado rechazara un destino perfectamente válido —y nadie se enteraría hasta que un
   chequeador no pudiera cerrar su ficha a las tres de la mañana.

   Mismo trato que se dio a los umbrales de Biomol: duplicar es aceptable si hay una
   prueba que lee la fuente real y vigila la divergencia.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAMARONERA_OPTS } from './ficha-traslado.schema.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);

/** Extrae del monolito el array literal de una constante `const NOMBRE = [ ... ];`. */
function arrayDelEngine(nombre) {
  const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');
  const i = src.indexOf('const ' + nombre + ' = [');
  if (i < 0) throw new Error('No se encontró ' + nombre + ' en engine.js');
  const j = src.indexOf('];', i);
  if (j < 0) throw new Error('No se cerró el array de ' + nombre);
  const cuerpo = src.slice(src.indexOf('[', i), j + 1);
  return JSON.parse(cuerpo.split('\n').join(' ').replace(/,\s*\]$/, ']'));
}

describe('Traslado · la camaronera es la misma lista que la ficha de Despacho', () => {
  it('el ancla existe: engine.js declara DESTINO_OPTS', () => {
    // Si el monolito renombra la constante, esta prueba lo dice antes que las otras
    // fallen por una razón confusa.
    expect(() => arrayDelEngine('DESTINO_OPTS')).not.toThrow();
  });

  it('🔴 CAMARONERA_OPTS y DESTINO_OPTS coinciden exactamente, y en el mismo orden', () => {
    expect(CAMARONERA_OPTS).toEqual(arrayDelEngine('DESTINO_OPTS'));
  });

  it('el listado no está vacío (una lectura fallida no debe pasar por buena)', () => {
    // Sin esta guarda, un parseo que devolviera [] haría verde la prueba anterior
    // sólo si CAMARONERA_OPTS también estuviera vacía — y probaría cero.
    expect(arrayDelEngine('DESTINO_OPTS').length).toBeGreaterThan(0);
    expect(CAMARONERA_OPTS.length).toBeGreaterThan(0);
  });
});
