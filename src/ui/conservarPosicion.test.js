// @vitest-environment happy-dom
/* ============================================================
   ROUTER · al repintar con datos nuevos, el desplazamiento se queda donde estaba (punto 7 del usuario, 2026-10-03)

   🔴 LO QUE PASABA (medido en Chrome contra la app publicada). Con datos nuevos —el refresco automático en reposo o ⟳—
   el router vaciaba el contenedor y repintaba la vista: la página encogía por debajo de la ventana (Maduración: 1 536 →
   805 px, su tablero llega en un segundo paso con su import) y el navegador llevaba el desplazamiento a 0 (731 → 0).

   🔑 AHORA. `renderCurrentView({ conservarPosicion: true })` —los repintados de la MISMA vista desde el shell: datos
   nuevos y, también a petición del usuario, el tema 🌙 y los atajos de fecha— sostiene el alto del contenedor hasta que
   la vista termina de pintarse (si `render` devuelve una promesa, hasta que se cumple) y devuelve el desplazamiento a
   donde estaba. Cambiar de vista no lo usa.

   happy-dom no maqueta: aquí una «página» de juguete hace de navegador —su alto es el del contenedor (o su
   `min-height`) más el resto, y al encoger por debajo de la ventana lleva el desplazamiento a su máximo—.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mountShell, MAIN_VIEWS } from './shell.js';
import { registerView, changeView, renderCurrentView } from './router.js';
import { store, emit, EV } from '../core/store.js';

const VENTANA = 900;
const pagina = { contenido: 0, y: 0 };
let contenedor;
/** El navegador de juguete: alto de la página y el tope del desplazamiento (lo que hace Chrome al encoger). */
const alto = () => Math.max(pagina.contenido, parseFloat(contenedor.style.minHeight) || 0);
const maquetar = () => { pagina.y = Math.min(pagina.y, Math.max(0, alto() - VENTANA)); };

let llega = null;   // la promesa de la vista diferida en curso
const vistas = {
  // se pinta en el acto (como el Supervisor)
  sincrona: () => { pagina.contenido = 0; maquetar(); pagina.contenido = 1536; maquetar(); },
  // aviso «Cargando…» y el tablero después (como Maduración → operativo)
  diferida: () => {
    pagina.contenido = 120; maquetar();
    let cumplir;
    llega = new Promise((r) => { cumplir = r; });
    llega.cumplir = () => { pagina.contenido = 1536; maquetar(); cumplir(); };
    return llega;
  },
  // la vista mueve el desplazamiento al pintarse (un foco, un scrollIntoView…)
  mueve: () => { pagina.contenido = 1536; window.scrollTo(0, 0); },
};

beforeAll(() => {
  store.connected = true;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => pagina.y });
  window.scrollTo = (x, y) => { pagina.y = y; maquetar(); };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const [a, b, c] = MAIN_VIEWS.filter((v) => v.id !== 'registros');
  registerView(a.id, { label: a.label, icon: a.icon, render: vistas.sincrona });
  registerView(b.id, { label: b.label, icon: b.icon, render: vistas.diferida });
  registerView(c.id, { label: c.label, icon: c.icon, render: vistas.mueve });
  vistas.ids = [a.id, b.id, c.id];
  mountShell(host);
  contenedor = document.getElementById('dashboardContent');
  Object.defineProperty(contenedor, 'offsetHeight', { configurable: true, get: () => alto() });
});
beforeEach(() => { llega = null; });

/** Abre la vista `i`, espera a que termine y baja hasta `y`. */
async function abrirYBajar(i, y) {
  changeView(vistas.ids[i]);
  if (llega) { llega.cumplir(); await llega; await null; llega = null; }
  window.scrollTo(0, y);
  expect(window.scrollY).toBe(y);
}

describe('Repintar con datos nuevos conserva el desplazamiento', () => {
  it('vista que se pinta en el acto: se queda donde estaba', async () => {
    await abrirYBajar(0, 600);
    emit(EV.DATA, { firstLoad: false });
    expect(window.scrollY).toBe(600);
    expect(contenedor.style.minHeight).toBe('');
  });

  it('🔴 vista que llega en un segundo paso (Maduración): NO salta mientras llega, y sigue ahí cuando llega', async () => {
    await abrirYBajar(1, 600);
    emit(EV.DATA, { firstLoad: false });
    expect(contenedor.style.minHeight).toBe('1536px');   // el alto se sostiene…
    expect(window.scrollY).toBe(600);                     // …y con él el desplazamiento, aunque sólo se vea «Cargando…»
    llega.cumplir(); await llega; await null;
    expect(contenedor.style.minHeight).toBe('');
    expect(window.scrollY).toBe(600);
  });

  it('si algo lo mueve al pintar, vuelve a donde estaba', async () => {
    await abrirYBajar(2, 500);
    emit(EV.DATA, { firstLoad: false });
    expect(window.scrollY).toBe(500);
  });

  it('el final de un repintado VIEJO no toca lo que se pintó después', async () => {
    await abrirYBajar(1, 600);
    emit(EV.DATA, { firstLoad: false });
    const vieja = llega;
    changeView(vistas.ids[0]);                 // se cambia de vista antes de que llegue
    window.scrollTo(0, 0);
    vieja.cumplir(); await vieja; await null;
    expect(window.scrollY).toBe(0);
    expect(contenedor.style.minHeight).toBe('');
  });

  it('🔴 el tema 🌙 tampoco lo lleva arriba (ni con la vista que llega en un segundo paso)', async () => {
    await abrirYBajar(1, 600);
    document.getElementById('darkBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.scrollY).toBe(600);
    llega.cumplir(); await llega; await null;
    expect(window.scrollY).toBe(600);
    expect(contenedor.style.minHeight).toBe('');
  });

  it('🔴 un atajo de fecha («30 días», «Todo»…) tampoco', async () => {
    store.globalData = [{ _SheetOrigin: 'Larvicultura', Fecha: '01/09/2026' }];   // con alguna fecha, la barra enseña los atajos
    emit(EV.DATA, { firstLoad: false });
    await abrirYBajar(0, 600);
    document.querySelector('[data-preset="30"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.scrollY).toBe(600);
    document.querySelector('[data-preset="all"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.scrollY).toBe(600);
    store.globalData = [];
  });

  it('cambiar de vista NO lo usa (ni sostiene el alto ni vuelve)', async () => {
    await abrirYBajar(0, 600);
    renderCurrentView();
    expect(contenedor.style.minHeight).toBe('');
    changeView(vistas.ids[2]);
    expect(window.scrollY).toBe(0);
  });

  it('Biología Molecular (diferida) devuelve su promesa al router, como Maduración', () => {
    const main = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8');
    const bio = main.split(/(?=registerView\(')/).find((b) => b.startsWith("registerView('biomolecular'")).replace(/\/\/.*$/gm, '');
    expect(bio).toMatch(/return cargarD3\(\)/);
  });
});
