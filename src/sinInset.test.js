/* ============================================================
   NINGÚN `inset` LLEGA AL NAVEGADOR (2026-10-02, usuario)

   `inset` no existe antes de Chrome 87 / Safari 14.1, y ahí una capa a pantalla completa con
   `position:fixed; inset:0` se queda como una caja arriba a la izquierda (pasó con la entrada el
   01-10). Los modales de casi todas las vistas la usaban.

   🔑 Cómo se evita, en dos frentes:
   · El CSS de `src/` lo traduce el BUILD: `build.cssTarget` (vite.config.js · CSS_NAVEGADORES)
     hace que esbuild escriba los cuatro lados. Se comprueba sobre la SALIDA de esbuild con esos
     navegadores, minificando como `vite build`, y con una sonda que demuestra que traduce (un
     verde sobre un CSS que ya no tuviera ningún `inset` no probaría nada).
   · Lo que el build NO toca —los estilos escritos en el JS (`style="…"`) y el monolito
     `public/registros/engine.js`, que se publica tal cual— se escribe ya con los cuatro lados.
   (index (8) lleva el mismo CSS y el mismo motor: lo comparan los verificadores del utillaje,
   no esta suite, que no puede leer ese archivo.)
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { transformSync } from 'esbuild';
import configDeVite, { CSS_NAVEGADORES } from '../vite.config.js';

const RAIZ = process.cwd();
const listar = (dir, fin) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return listar(p, fin);
  return fin(e.name) ? [p] : [];
});
const compilar = (css) => transformSync(css, { loader: 'css', minify: true, target: CSS_NAVEGADORES }).code;
/** Declaraciones `inset:` (la propiedad, no el `inset` de un box-shadow). */
const insets = (css) => (css.match(/(^|[{;\s])inset\s*:/g) || []).length;
/** `inset:` dentro de un atributo style escrito en el código. */
const STYLE_INSET = /style\s*=\s*\\?["'][^"'<>]*?(^|[;"'\s])inset\s*:/;

describe('CSS de src/ · el build traduce `inset` a los cuatro lados', () => {
  it('el build usa CSS_NAVEGADORES como cssTarget (si no, lo de abajo no diría nada del build)', () => {
    expect(configDeVite({ command: 'build', mode: 'production' }).build.cssTarget).toBe(CSS_NAVEGADORES);
  });

  it('sonda: con CSS_NAVEGADORES, esbuild escribe top/right/bottom/left y ningún inset', () => {
    const out = compilar('.x{position:fixed;inset:0;z-index:3}');
    expect(out).toContain('top:0;right:0;bottom:0;left:0');
    expect(insets(out)).toBe(0);
  });

  it('ningún archivo .css de src/ deja un `inset` en lo compilado', () => {
    const archivos = listar(join(RAIZ, 'src'), (n) => n.endsWith('.css'));
    expect(archivos.length).toBeGreaterThan(5);
    const malos = archivos.filter((f) => insets(compilar(readFileSync(f, 'utf8'))) > 0)
      .map((f) => relative(RAIZ, f));
    expect(malos).toEqual([]);
  });
});

describe('estilos escritos en el código · sin `inset` (el build no los traduce)', () => {
  it('ningún style="…" de src/ (salvo pruebas) usa inset', () => {
    const archivos = listar(join(RAIZ, 'src'), (n) => n.endsWith('.js') && !n.endsWith('.test.js'));
    const malos = archivos.filter((f) => readFileSync(f, 'utf8').split('\n').some((l) => STYLE_INSET.test(l)))
      .map((f) => relative(RAIZ, f));
    expect(malos).toEqual([]);
  });

  it('el monolito public/registros/engine.js tampoco (se publica tal cual)', () => {
    const lineas = readFileSync(join(RAIZ, 'public/registros/engine.js'), 'utf8').split('\n');
    const malas = lineas.map((l, i) => (STYLE_INSET.test(l) ? i + 1 : 0)).filter(Boolean);
    expect(malas).toEqual([]);
  });

  it('la búsqueda de style="…inset" sí ve uno cuando lo hay (no es un verde sobre nada)', () => {
    expect(STYLE_INSET.test('<div style="display:none;position:fixed;inset:0;z-index:9">')).toBe(true);
    expect(STYLE_INSET.test(`'<div style="position:fixed;top:0;right:0;bottom:0;left:0">'`)).toBe(false);
    expect(STYLE_INSET.test('<div style="box-shadow:inset 0 0 2px #000">')).toBe(false);
  });
});
