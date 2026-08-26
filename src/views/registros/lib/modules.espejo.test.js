/* ============================================================
   REGISTROS · el ESPEJO de constantes de módulo (modules.js ↔ engine.js)

   Los índices de módulo están declarados DOS veces: aquí al lado, en
   `modules.js`, y en la cabecera del monolito `public/registros/engine.js`.
   La duplicación no se puede quitar —engine.js es un script clásico, no puede
   importar un módulo ES, y esas constantes se usan como identificadores a lo
   largo de sus 17.000 líneas—, así que lo que faltaba no era quitar la copia
   sino la red que avisa cuando una mitad se mueve y la otra se queda.

   ⚠ POR QUÉ ESTE ESPEJO ES PELIGROSO SIN RED
   El daño de un desajuste sería MUDO. `mLabel` etiquetaría un módulo con el
   nombre de otro; `isStdMod` metería Maduración dentro del agregado de
   larvicultura; `isValidMod` rechazaría un módulo que existe y su ficha se
   negaría a guardar. Ni un error, ni un aviso: sólo números que cuadran mal en
   una pantalla, que es la peor forma de fallar que tiene este sistema.

   Es la forma EXACTA que han tenido todos los defectos que ha dado el proyecto:
   dos sitios que responden distinto a la misma pregunta.

   🔑 No se reimplementa nada. Se EJECUTA el bloque de constantes real del
   monolito en un contexto aislado y se compara con lo que exporta `modules.js`.
   Transcribir aquí los valores a mano sólo probaría la transcripción, y una
   copia siempre está de acuerdo consigo misma. Mismo método que
   `traslado-gas.test.js` usa para el contrato con el GAS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import * as modules from './modules.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);

/* ⚠ Las anclas NO llevan valores dentro, a propósito. Anclar en «const MODS = 10»
   haría que un cambio de valor rompiera el ANCLA en vez de fallar la comparación,
   y el mensaje hablaría de un ancla perdida en lugar de decir qué constante se
   movió. Si alguna de las dos desaparece, esta batería falla pidiendo que se
   re-apunte — que es lo correcto: mover ese bloque obliga a revisar el espejo. */
const ANCLA_INICIO = 'const MODS';
const ANCLA_FIN = '// Evidencias por QR';

function bloqueDelMonolito() {
  const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');
  const i = src.indexOf(ANCLA_INICIO);
  if (i < 0) throw new Error('Ancla de inicio perdida en engine.js: ' + ANCLA_INICIO);
  const j = src.indexOf(ANCLA_FIN, i);
  if (j < 0) throw new Error('Ancla de fin perdida en engine.js: ' + ANCLA_FIN);
  return src.slice(i, j);
}

/** Los nombres que el monolito declara en ese bloque, sin contar los comentarios. */
function nombresDelMonolito(bloque) {
  const codigo = bloque.replace(/\/\/[^\n]*/g, '');
  return [...codigo.matchAll(/(?:const|,)\s*([A-Z][A-Z0-9_]*)\s*=/g)].map((m) => m[1]);
}

/** Los valores de verdad: se ejecuta el bloque, no se transcribe. */
function valoresDelMonolito(bloque, nombres) {
  const ctx = {};
  ctx.globalThis = ctx;
  createContext(ctx);
  const epilogo = ';globalThis.__espejo = {' + nombres.map((n) => n + ': ' + n).join(', ') + '};';
  new Script(bloque + '\n' + epilogo).runInContext(ctx);
  return ctx.__espejo;
}

/* Lo canónico se lee de las PROPIAS exportaciones de modules.js: si mañana se
   añade una constante de módulo, entra sola en la comparación sin tocar esta
   batería. Una lista escrita a mano aquí se quedaría vieja en silencio. */
const CONSTANTES = Object.keys(modules)
  .filter((k) => /^[A-Z][A-Z0-9_]*$/.test(k))
  .sort();
const PREDICADOS = Object.keys(modules)
  .filter((k) => typeof modules[k] === 'function')
  .sort();

describe('espejo de constantes · modules.js ↔ engine.js', () => {
  const bloque = bloqueDelMonolito();
  const nombres = nombresDelMonolito(bloque);

  it('el fixture sirve: hay constantes de verdad en los dos lados', () => {
    // Sin esta comprobación, un ancla que devolviera texto vacío dejaría las dos
    // pruebas de abajo comparando dos conjuntos VACÍOS — verde perfecto con el
    // espejo roto, que es justo lo que esta batería existe para impedir.
    expect(nombres.length, 'el bloque de constantes de engine.js salió vacío').toBeGreaterThan(0);
    expect(CONSTANTES.length, 'modules.js dejó de exportar constantes').toBeGreaterThan(0);
  });

  it('los dos declaran EL MISMO juego de constantes', () => {
    expect(
      [...nombres].sort(),
      'engine.js y modules.js ya no declaran las mismas constantes de módulo: una de '
        + 'las dos mitades ganó o perdió una y la otra no se enteró',
    ).toEqual(CONSTANTES);
  });

  it('y cada una con EL MISMO valor', () => {
    const delMonolito = valoresDelMonolito(bloque, nombres);
    CONSTANTES.forEach((nombre) => {
      expect(
        delMonolito[nombre],
        nombre + ' vale ' + delMonolito[nombre] + ' en engine.js y ' + modules[nombre]
          + ' en modules.js: el espejo se rompió',
      ).toBe(modules[nombre]);
    });
  });
});

describe('los predicados NO se duplican: el monolito delega en __rgLib', () => {
  const src = readFileSync(ENGINE, 'utf8');

  it('el fixture sirve: modules.js exporta predicados que vigilar', () => {
    expect(PREDICADOS.length, 'modules.js dejó de exportar funciones').toBeGreaterThan(0);
  });

  it.each(PREDICADOS)('engine.js resuelve %s delegando, no con una copia propia', (nombre) => {
    const decl = new RegExp('function\\s+' + nombre + '\\s*\\([^)]*\\)\\s*\\{([^}]*)\\}');
    const hallado = decl.exec(src);
    expect(hallado, 'engine.js ya no declara ' + nombre + ': el puente __rgLib se rompió')
      .not.toBeNull();
    expect(
      hallado[1],
      'engine.js volvió a implementar ' + nombre + ' por su cuenta en lugar de delegar en '
        + '__rgLib. Eso es una SEGUNDA respuesta a la misma pregunta, y las dos empezarán '
        + 'a divergir sin que nadie lo note',
    ).toContain('__rgLib.' + nombre);
  });
});
