/* ============================================================
   Punto 34 de la pauta del 12-11 (usuario: «Todo el repo: eslint .») · QUÉ REVISA EL LINT.
   `npm run lint` —el que corre la CI antes de publicar— era `eslint src`: las reglas que eslint.config.js ya tenía para el
   service worker (public/sw.js) y para las auditorías (scripts/**) nunca se aplicaban, ni en la CI ni en el pre-push. Ahora
   es `eslint .`: todo el repo menos lo que la configuración aparta a propósito (el monolito heredado, lo de terceros, la build).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';

const RAIZ = process.cwd();

describe('punto 34 · el lint revisa todo el repo', () => {
  it('🔴 `npm run lint` es `eslint .`', () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
    expect(pkg.scripts.lint).toBe('eslint .');
  });
  it('🔴 el service worker, las auditorías y los archivos de configuración NO se apartan; lo heredado sí (control)', async () => {
    const eslint = new ESLint({ cwd: RAIZ });
    for (const f of ['public/sw.js', 'scripts/auditorias/traslado-e2e.mjs', 'scripts/auditorias/traslado-adversa.mjs', 'vite.config.js', 'eslint.config.js', 'src/main.js']) {
      expect(await eslint.isPathIgnored(f), f + ' tiene que revisarse').toBe(false);
    }
    for (const f of ['public/registros/engine.js', 'public/vendor/xlsx.full.min.js']) {
      expect(await eslint.isPathIgnored(f), f + ' sigue fuera (heredado o de terceros)').toBe(true);
    }
  });
});
