// @vitest-environment happy-dom
/* ============================================================
   SHELL · la barra de fecha global sólo se ve en las vistas que la USAN (D12, 2026-09-13)

   🔴 LO QUE PASABA. La barra «📅 Todo · 30 días · 7 días» de la cabecera se enseñaba en TODAS
   las vistas, pero sólo la leían Supervisor y Revisiones (y Biología Molecular la ocultaba a
   mano). En Larvicultura, Maduración, Algas, Microbiología, Visitante y Registros se veía y no
   filtraba nada —cinco de ellas tienen su propio selector de mes, rango o corrida—, así que había
   dos controles de periodo y uno de ellos mentía. Decisión del usuario: opción A, ocultarla ahí.

   🔑 CÓMO SE DECIDE, y por qué no es una lista escrita a mano. Cada vista DECLARA al registrarse
   (`usaBarraFecha: true`, en main.js) si la usa, y el shell sólo la muestra entonces. Una vista
   nueva nace SIN barra, que es lo seguro. Y la declaración no puede mentir sin que esto se ponga
   rojo: la vista que lee `store.dateFrom/dateTo` tiene que declararla, y la que la declara tiene
   que leerla — se comprueba contra el CÓDIGO de src/views, no contra una lista.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mountShell, MAIN_VIEWS, setDateBarHidden } from './shell.js';
import { registerView, changeView } from './router.js';
import { store } from '../core/store.js';

const RAIZ = process.cwd();
const main = readFileSync(join(RAIZ, 'src/main.js'), 'utf8');

/* Las vistas que main.js declara con la barra. Se lee del registro REAL, línea a línea. */
const declaradas = new Set(
  main.split('\n')
    .map((l) => l.match(/registerView\('([a-z]+)'.*usaBarraFecha:\s*true/))
    .filter(Boolean)
    .map((m) => m[1]),
);

/* Las vistas cuyo CÓDIGO lee el rango de la barra. */
function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : (n.endsWith('.js') && !n.endsWith('.test.js') ? [p] : []);
  });
}
const quienLee = new Set(
  readdirSync(join(RAIZ, 'src/views'))
    .filter((v) => statSync(join(RAIZ, 'src/views', v)).isDirectory())
    .filter((v) => archivos(join(RAIZ, 'src/views', v)).some((f) => /\bdateFrom\b|\bdateTo\b/.test(readFileSync(f, 'utf8')))),
);

const barra = () => document.getElementById('dateBar');
const oculta = () => barra().classList.contains('is-datebar-hidden');
let hideDesdeRender = null;

beforeAll(() => {
  const app = document.createElement('div');
  document.body.appendChild(app);
  for (const v of MAIN_VIEWS) {
    const def = { label: v.label, icon: v.icon, render: () => { if (hideDesdeRender === v.id) setDateBarHidden(true); } };
    if (declaradas.has(v.id)) def.usaBarraFecha = true;
    registerView(v.id, def);
  }
  mountShell(app);
});

describe('D12 · la barra de fecha global sólo donde filtra', () => {
  it('🔑 lo declarado coincide con quien LEE el rango en el código (Supervisor y Revisiones)', () => {
    expect([...quienLee].sort()).toEqual(['revisiones', 'supervisor']);
    expect([...declaradas].sort()).toEqual([...quienLee].sort());
  });

  it('el fixture ejerce algo: en una vista que la usa, la barra SE VE', () => {
    store.currentView = null;
    changeView('revisiones');
    expect(oculta()).toBe(false);
  });

  for (const id of ['larvicultura', 'maduracion', 'algas', 'microbiologia', 'visitante', 'registros']) {
    it(`🔴 en «${id}», que no la usa, la barra NO se ve`, () => {
      changeView('supervisor');
      expect(oculta()).toBe(false);
      changeView(id);
      expect(oculta()).toBe(true);
    });
  }

  it('al volver a una vista que la usa, reaparece', () => {
    changeView('algas');
    expect(oculta()).toBe(true);
    changeView('supervisor');
    expect(oculta()).toBe(false);
  });

  it('una vista que la usa puede seguir ocultándola en sus sub-vistas (el Supervisor lo hace)', () => {
    changeView('algas');
    hideDesdeRender = 'supervisor';
    changeView('supervisor');
    expect(oculta()).toBe(true);
    hideDesdeRender = null;
  });
});
