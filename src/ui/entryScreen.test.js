// @vitest-environment happy-dom
/* ============================================================
   SHELL · la pantalla de entrada no enseña el menú lateral (2026-10-01)

   🔴 LO QUE PASABA. La pestaña ☰ (capa 60) y el menú (capa 80) sólo quedaban ocultos porque la
   entrada (capa 200) los tapaba, y la entrada ocupaba la pantalla sólo con `inset: 0`. El build
   apunta a es2019, y en un navegador sin `inset` (Chrome < 87, Safari < 14.1) la entrada quedaba
   como una caja arriba a la izquierda: se veían la pestaña ☰ y el tablero de detrás.

   🔑 AHORA. (1) Mientras se ve la entrada, `.app` lleva `is-entry` y el CSS QUITA la pestaña, el
   menú y su fondo (no depende de las capas). (2) Las tres capas a pantalla completa de la shell
   usan top/left + width/height 100%, que cualquier navegador entiende. NO top/right/bottom/left a
   0: el minificador del build (esbuild) los vuelve a juntar en `inset:0` y el arreglo no llegaba a
   la build (medido el 01-10). Por eso (2) se comprueba sobre la SALIDA de esbuild minificando
   app.css como lo hace `vite build`; happy-dom no aplica estilos, así que la regla de (1) también
   se lee de esa salida.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { mountShell, MAIN_VIEWS } from './shell.js';
import { registerView } from './router.js';

// Lo que llega a la build: app.css minificado por esbuild con el `target` del build (vite.config.js).
const css = transformSync(readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8'),
  { loader: 'css', minify: true, target: 'es2019' }).code;
/** Cuerpo de la PRIMERA regla cuyo selector es exactamente `sel`. */
const regla = (sel) => {
  const m = css.match(new RegExp('(^|[}\\n])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[2] : null;
};

const app = () => document.querySelector('.app');
const enEntrada = () => app().classList.contains('is-entry');
const entradaVisible = () => !document.getElementById('entryScreen').classList.contains('is-hidden');

beforeAll(() => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  for (const v of MAIN_VIEWS) registerView(v.id, { label: v.label, icon: v.icon, render: () => {} });
  mountShell(host);
});

describe('pantalla de entrada · sin menú lateral', () => {
  it('al abrir se ve la entrada y .app lleva is-entry', () => {
    expect(entradaVisible()).toBe(true);
    expect(enEntrada()).toBe(true);
  });

  it('al elegir rol se quita is-entry (vuelven la pestaña ☰ y el menú)', () => {
    document.querySelector('#entryRoles [data-role]').click();
    expect(entradaVisible()).toBe(false);
    expect(enEntrada()).toBe(false);
  });

  it('«↩ Cambiar rol» vuelve a la entrada y a is-entry', () => {
    document.getElementById('changeRole').click();
    expect(entradaVisible()).toBe(true);
    expect(enEntrada()).toBe(true);
  });

  it('app.css quita la pestaña, el menú y su fondo bajo .app.is-entry', () => {
    const m = css.match(/([^{}]*)\{\s*display:\s*none;?\s*\}/g) || [];
    const ocultas = m.filter((r) => r.includes('.app.is-entry')).join(' ').replace(/\s+/g, ' ');
    for (const sel of ['.app.is-entry .nav-toggle', '.app.is-entry .side-drawer', '.app.is-entry .drawer-backdrop']) {
      expect(ocultas, sel).toContain(sel);
    }
  });

  it('en la build, las capas a pantalla completa de la shell no dependen de `inset`', () => {
    for (const sel of ['.entry-screen', '.drawer-backdrop', '.loader']) {
      const cuerpo = regla(sel);
      expect(cuerpo, sel).not.toBeNull();
      expect(cuerpo, sel).not.toMatch(/\binset\s*:/);
      expect(cuerpo, sel).toMatch(/position:\s*fixed/);
      for (const d of [/\btop:\s*0\b/, /\bleft:\s*0\b/, /\bwidth:\s*100%/, /\bheight:\s*100%/]) expect(cuerpo, `${sel} ${d}`).toMatch(d);
    }
  });
});
