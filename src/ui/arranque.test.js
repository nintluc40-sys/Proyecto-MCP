// @vitest-environment happy-dom
/* ============================================================
   ARRANQUE SIN ESPERA (P3 del plan de carga y refresco, 2026-10-01)

   🔴 LO QUE PASABA. Al abrir, main.js esperaba al libro de Google con el loader tapándolo TODO
   —también la elección de rol— durante 25–35 s, y dos scripts del <head> (SheetJS y D3)
   bloqueaban el primer pintado; D3 sólo lo usa Biología Molecular.

   🔑 AHORA. La entrada responde al instante; el libro se pide al entrar en la PRIMERA vista que
   lo necesita (todas menos Registros, que declara `necesitaLibro: false`) y, mientras llega, esa
   vista enseña un aviso de carga (o el fallo, con ⟳ para reintentar). SheetJS va con `defer` y
   D3 se carga al abrir Biología Molecular, con el mismo `integrity`.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { registerView, changeView, setContainer, renderCurrentView, viewNeedsBook, setPedirLibro } from './router.js';
import { store, emit, EV } from '../core/store.js';

const RAIZ = process.cwd();
const main = readFileSync(join(RAIZ, 'src/main.js'), 'utf8');
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const mainCodigo = sinComentarios(main);
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const sri = (f) => 'sha384-' + createHash('sha384').update(readFileSync(join(RAIZ, f))).digest('base64');

describe('arranque · main.js', () => {
  it('no espera al libro al arrancar (sin loader ni await de la conexión)', () => {
    const boot = mainCodigo.slice(mainCodigo.indexOf('function boot()'), mainCodigo.indexOf('function registrarSW'));
    expect(boot).not.toMatch(/await\s+connectSheets|showLoader\(\s*true/);
    expect(mainCodigo).not.toMatch(/async\s+function\s+boot/);
  });

  it('el router pide el libro con asegurarLibro (main.js lo registra)', () => {
    expect(mainCodigo).toMatch(/setPedirLibro\(asegurarLibro\);/);
  });

  it('SÓLO Registros declara necesitaLibro: false', () => {
    const bloques = mainCodigo.split(/(?=registerView\(')/).slice(1).map((b) => [b.match(/^registerView\('([a-z]+)'/)[1], b]);
    expect(bloques.filter(([, b]) => /necesitaLibro:\s*false/.test(b)).map(([id]) => id)).toEqual(['registros']);
  });
});

describe('arranque · scripts del <head>', () => {
  it('SheetJS va con defer y su integrity es la del archivo', () => {
    const tag = (html.match(/<script[^>]*xlsx\.full\.min\.js[^>]*>/) || [''])[0];
    expect(tag).toMatch(/\sdefer[\s>]/);
    expect(tag).toContain(`integrity="${sri('public/vendor/xlsx.full.min.js')}"`);
  });

  it('D3 ya no está en index.html: lo carga Biología Molecular con el integrity del archivo', () => {
    expect(html).not.toMatch(/d3\.min\.js/);
    expect(main).toContain(`const D3_INTEGRITY = '${sri('public/vendor/d3.min.js')}';`);
    expect(mainCodigo).toMatch(/\.integrity\s*=\s*D3_INTEGRITY/);
    expect(mainCodigo).toMatch(/cargarD3\(\)\s*\.then\(\(\)\s*=>\s*import\('\.\/views\/biomolecular\/index\.js'\)\)/);
  });
});

describe('arranque · aviso de carga en la vista', () => {
  let cont;
  const pintadas = {};
  let pedidas = 0;
  beforeAll(() => {
    cont = document.createElement('div');
    document.body.appendChild(cont);
    setContainer(cont);
    setPedirLibro(() => { pedidas++; });
    registerView('tablero', { label: 'T', render: (r) => { pintadas.tablero = (pintadas.tablero || 0) + 1; r.innerHTML = '<p id="tablero-real">datos</p>'; } });
    registerView('captura', { label: 'C', necesitaLibro: false, render: (r) => { pintadas.captura = (pintadas.captura || 0) + 1; r.innerHTML = '<p id="captura-real">captura</p>'; } });
  });
  beforeEach(() => { store.connected = false; pedidas = 0; });

  it('sin libro, la vista que lo necesita enseña el aviso, NO se pinta y PIDE el libro', () => {
    emit(EV.CONN, { state: 'connecting', label: 'Descargando datos…' });
    changeView('tablero');
    expect(cont.querySelector('[data-cargando-libro]')).not.toBeNull();
    expect(cont.textContent).toMatch(/Cargando los datos de producción/);
    expect(pintadas.tablero || 0).toBe(0);
    expect(pedidas).toBe(1);
  });

  it('🔴 aterrizar en la vista que YA era la actual también pide el libro (el rol que entra en la vista por defecto)', () => {
    /* El defecto que esto vigila (medido en Chrome el 01-10): el rol Administrativo aterriza en
       'supervisor', que ya es store.currentView; changeView no emite EV.VIEW si la vista no
       cambia, así que un gancho en EV.VIEW nunca pedía el libro y el aviso se quedaba para
       siempre en «Cargando…». */
    changeView('tablero');
    pedidas = 0;
    changeView('tablero');
    expect(pedidas).toBe(1);
  });

  it('si la descarga falla, el aviso lo dice y ofrece ⟳; al reintentar vuelve a «cargando»', () => {
    changeView('tablero');
    emit(EV.CONN, { state: 'error', label: 'HTTP 500' });
    expect(cont.textContent).toMatch(/No se pudieron cargar/);
    expect(cont.textContent).toMatch(/HTTP 500/);
    expect(cont.textContent).toMatch(/⟳/);
    emit(EV.CONN, { state: 'connecting', label: 'Descargando datos…' });
    expect(cont.textContent).toMatch(/Cargando los datos de producción/);
  });

  it('la que no lo necesita (Registros) se pinta aunque no haya libro, y no lo pide', () => {
    changeView('captura');
    expect(cont.querySelector('#captura-real')).not.toBeNull();
    expect(pedidas).toBe(0);
    expect(viewNeedsBook('captura')).toBe(false);
    expect(viewNeedsBook('tablero')).toBe(true);
    expect(viewNeedsBook('no-registrada')).toBe(true);
  });

  it('con el libro ya cargado, la vista se pinta de verdad', () => {
    changeView('tablero');
    store.connected = true;
    renderCurrentView();
    expect(cont.querySelector('#tablero-real')).not.toBeNull();
    expect(cont.querySelector('[data-cargando-libro]')).toBeNull();
    // y un aviso de conexión posterior no pisa la vista ya pintada
    emit(EV.CONN, { state: 'error', label: 'x' });
    expect(cont.querySelector('#tablero-real')).not.toBeNull();
  });
});
