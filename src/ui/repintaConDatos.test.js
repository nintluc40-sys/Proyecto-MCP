// @vitest-environment happy-dom
/* ============================================================
   SHELL · con datos nuevos (EV.DATA) se repinta la vista, salvo Registros (2026-09-24)

   🔴 LO QUE PASABA. Cada refresco con cambios repintaba la vista entera; en Registros eso
   vaciaba el contenedor y volvía a montar la captura: el campo en el que se tecleaba perdía el
   foco (y lo tecleado si no se había guardado).

   🔑 AHORA. La vista DECLARA al registrarse `repintaConDatos: false` (como `usaBarraFecha`); el
   shell sólo repinta las que no lo declaran. Registros lo declara en main.js, y fuera de ella SÓLO
   🏭 Planta (2026-10-04): repintarla reconstruiría la escena 3D y perdería la cámara; hoy no lleva
   datos, y cuando los lleve los pondrá al día ella misma con EV.DATA. Cualquier otro tablero que lo
   declarara se quedaría con datos viejos sin avisar.
   ============================================================ */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Cuenta las fechas que parsea el shell (barra de fecha): misma función, sólo contada.
const parseos = vi.hoisted(() => ({ n: 0 }));
vi.mock('../core/dates.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, parseAnyDate: (...a) => { parseos.n++; return real.parseAnyDate(...a); } };
});

import { mountShell, MAIN_VIEWS } from './shell.js';
import { registerView, changeView, viewRepaintsOnData } from './router.js';
import { store, emit, EV } from '../core/store.js';

const main = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8');
/* El bloque de registro de cada vista en main.js, de su `registerView('id'` al siguiente. */
const bloques = main.split(/(?=registerView\(')/).slice(1)
  .map((b) => [b.match(/^registerView\('([a-z]+)'/)[1], b.replace(/\/\/.*$/gm, '')]); // sin comentarios

const pintadas = {};
beforeAll(() => {
  // Con el libro ya cargado: sin él, las vistas que lo necesitan enseñan el aviso de carga en
  // vez de pintarse (P3, 2026-10-01; src/ui/arranque.test.js).
  store.connected = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  for (const v of MAIN_VIEWS) {
    const def = { label: v.label, icon: v.icon, render: () => { pintadas[v.id] = (pintadas[v.id] || 0) + 1; } };
    if (v.id === 'registros') def.repintaConDatos = false;
    registerView(v.id, def);
  }
  mountShell(host);
});

describe('repintaConDatos', () => {
  it('main.js lo declara en Registros y en Planta, y en ninguna otra vista', () => {
    const declaran = bloques.filter(([, b]) => /repintaConDatos:\s*false/.test(b)).map(([id]) => id);
    expect(declaran).toEqual(['registros', 'planta']);
  });

  it('EV.DATA no repinta Registros', () => {
    changeView('registros');
    const antes = pintadas.registros;
    emit(EV.DATA, { firstLoad: false });
    expect(pintadas.registros).toBe(antes);
  });

  it('EV.DATA sí repinta una vista que no lo declara', () => {
    changeView('supervisor');
    const antes = pintadas.supervisor;
    emit(EV.DATA, { firstLoad: false });
    expect(pintadas.supervisor).toBe(antes + 1);
  });

  it('una vista desconocida o sin declarar se repinta (lo seguro es no quedarse con datos viejos)', () => {
    expect(viewRepaintsOnData('no-existe')).toBe(true);
    expect(viewRepaintsOnData('larvicultura')).toBe(true);
    expect(viewRepaintsOnData('registros')).toBe(false);
  });
});

describe('barra de fecha · con datos nuevos no recorre todas las filas', () => {
  it('le basta con saber si HAY alguna fecha: para en la primera', () => {
    store.globalData = Array.from({ length: 2000 }, (_, i) => ({ Fecha: '01/09/2026', Tanque: 'T' + i }));
    parseos.n = 0;
    emit(EV.DATA, { firstLoad: false });
    expect(document.querySelector('#dateBar').innerHTML).not.toBe(''); // la barra sí se pinta
    expect(parseos.n).toBeLessThan(10);
  });
});
