/* ============================================================
   TODO onclick/onchange DEL MONOLITO APUNTA A UNA FUNCIÓN QUE EXISTE

   ⚠⚠ ESTA PRUEBA NACIÓ DE UN DEFECTO REAL, el 2026-09-08, y del peor tipo: silencioso.
   Al retirar la grilla de Lotes se cortó un tramo «de la función A a la función B», y
   ENTRE MEDIAS vivían `madTanquesSalaChange`, `madTanquesFechaChange` y
   `madSalasFechaChange` — los manejadores de cambio de sala y fecha de las grillas de
   SALAS y TANQUES, que no tenían nada que ver con Lotes. Se fueron con el corte.
   Las dos grillas supervivientes quedaron rotas: cambiar de sala lanzaba ReferenceError.

   Nada lo detectó. `engine.js` está fuera de ESLint y fuera de vitest; la suite siguió
   verde, el build compiló y las tres copias quedaron «a la par» — a la par y rotas las
   tres. Lo encontró mirar a mano, por casualidad, dos pasos después.

   🔑 Lo que esta prueba comprueba es la forma GENERAL de ese defecto: un atributo de evento
   que nombra una función inexistente. Es barato, es estructural, y cubre las ~940 funciones
   del monolito sin arrancarlo.
   ⚠ NO sustituye a `verificar-atributos-evento.mjs`, que comprueba otra cosa: que el
   atributo no se TRUNQUE al parsear. Aquí el atributo está entero — lo que falta es a quién
   llama.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const src = readFileSync(ENGINE, 'utf8');

/** Funciones declaradas en el monolito, en cualquiera de sus formas. */
function declaradas(s) {
  const out = new Set();
  for (const m of s.matchAll(/^(?:async )?function ([A-Za-z0-9_$]+)\s*\(/gm)) out.add(m[1]);
  for (const m of s.matchAll(/^(?:const|let|var) ([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\()/gm)) out.add(m[1]);
  for (const m of s.matchAll(/^\s{2}([A-Za-z0-9_$]+)\s*[:(]\s*(?:async\s*)?(?:function|\()/gm)) out.add(m[1]);
  return out;
}

/* ⚠ Los COMENTARIOS se quitan antes de buscar, y no es un detalle: este monolito
   documenta sus propios defectos citando el código roto. El primer intento de esta prueba
   dio un falso positivo con «f», que sale de un comentario que explica el bug del onclick
   truncado —«onclick="f("»—. Un instrumento que confunde la documentación de un defecto
   con el defecto es peor que no tenerlo.
   🔑 Sólo se retiran los bloques de comentario acotados y las líneas que EMPIEZAN por
   cualquier // dejaría fuera el resto de líneas con URLs («https://…») y podría esconder
   un manejador de verdad. */
function sinComentarios(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
}

/** Nombres invocados desde un atributo de evento: el identificador antes del paréntesis. */
function invocadas(s) {
  const out = new Map();   // nombre → atributo donde aparece
  for (const m of s.matchAll(/\bon(?:click|change|input|paste|submit|focus|blur)\s*=\s*(["'])(.*?)\1/g)) {
    const cuerpo = m[2];
    for (const c of cuerpo.matchAll(/(?:^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
      const n = c[1];
      if (!out.has(n)) out.set(n, cuerpo.slice(0, 70));
    }
  }
  return out;
}

/* Globales del navegador y palabras del lenguaje que aparecen dentro de un atributo y NO
   son funciones del monolito. Se listan a mano a propósito: una lista corta y explícita
   es preferible a una heurística que se trague un nombre roto de verdad. */
const AJENAS = new Set([
  'if', 'return', 'typeof', 'new', 'alert', 'confirm', 'prompt', 'String', 'Number',
  'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'parseInt', 'parseFloat',
  'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'encodeURIComponent',
  'decodeURIComponent', 'event', 'window', 'document', 'console', 'catch', 'for', 'while',
]);

describe('Monolito · todo manejador de evento apunta a algo que existe', () => {
  const def = declaradas(src);
  const usa = invocadas(sinComentarios(src));

  it('el extractor encuentra funciones y manejadores DE VERDAD', () => {
    /* Si los dos extractores devolvieran conjuntos vacíos, la comprobación de abajo pasaría
       siempre sin mirar nada. Es la trampa de «fixtures que no prueban nada» aplicada a un
       instrumento: se le exige que vea el tamaño correcto de la realidad. */
    expect(def.size).toBeGreaterThan(500);
    expect(usa.size).toBeGreaterThan(50);
    expect(def.has('renderMadTanques')).toBe(true);
    expect(usa.has('selTab')).toBe(true);
  });

  it('el limpiador de comentarios no se lleva código por delante', () => {
    /* La otra cara del falso positivo: un limpiador demasiado goloso dejaría fuera
       manejadores reales y la prueba pasaría por no mirar nada. Se exige que los
       manejadores que SÍ existen sigan viéndose después de limpiar. */
    const limpio = sinComentarios(src);
    expect(limpio).toContain('onclick="madIngGuardar()"');
    expect(limpio).toContain('onchange="madMovSalaChange(this)"');
    expect(limpio.length).toBeGreaterThan(src.length * 0.6);
  });

  it('🔴 ningún onclick/onchange llama a una función que no existe', () => {
    const huerfanas = [...usa.keys()]
      .filter((n) => !AJENAS.has(n) && !def.has(n))
      .sort();
    /* Si esto se pone rojo, el mensaje ya dice qué falta y desde dónde se llamaba: casi
       siempre es una función borrada cuyo botón se quedó. */
    expect(huerfanas.map((n) => n + '  ←  ' + usa.get(n))).toEqual([]);
  });

  it('los manejadores de las grillas que SIGUEN vivas están, uno a uno', () => {
    /* Nombrados a mano además del barrido general, porque son exactamente los que se
       perdieron: un barrido genérico puede volver a fallar por un extractor que cambie,
       y estos tres son los que dejaron dos grillas inutilizables. */
    for (const fn of ['madTanquesSalaChange', 'madTanquesFechaChange', 'madSalasFechaChange']) {
      expect(def.has(fn)).toBe(true);
    }
  });

  it('y los de las fichas nuevas de Maduración también', () => {
    for (const fn of [
      'renderMadIngreso', 'renderMadMovimientos', 'renderMadDesoves', 'renderMadFinCiclo',
      'madIngGuardar', 'madMovGuardar', 'madDesGuardar', 'madFinGuardar',
      'madIngCombinar', 'madIngTanqueToggle', 'madMovVerSaldo', 'madFinTipoChange',
    ]) {
      expect(def.has(fn)).toBe(true);
    }
  });
});
