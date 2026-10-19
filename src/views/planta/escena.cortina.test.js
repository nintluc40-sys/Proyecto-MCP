// @vitest-environment happy-dom
/* ============================================================
   PLANTA · la CORTINA del armado de la maqueta (plan A1, 2026-10-16; huecos del punto 4, 2026-10-18; pauta 1.3 del
   19-10: «el código está cerrado, pero no hay prueba»). La maqueta se arma por partes DETRÁS de una cortina con el % y
   se descubre ENTERA en el cuadro que dibuja el último bloque (escena.js · `porRevelar`, `loop`; planta.css ·
   `.is-armando`). Aquí se monta la escena REAL (index.js → escena.js) en happy-dom: three.js de verdad salvo el
   `WebGLRenderer` y el `PMREMGenerator`, que se sustituyen por dobles (no hay WebGL), y un contexto 2D que lo acepta
   todo para las texturas pintadas. Los cuadros los da la prueba, uno a uno (`requestAnimationFrame` en una cola).
   Lo que se exige: la cortina tapa desde el montaje; está puesta EXACTAMENTE mientras quedan bloques (nunca la maqueta
   a medias a la vista); se quita una sola vez; si el dibujo falla en el cuadro que vacía la lista, el siguiente cuadro
   bueno la quita (antes quedaba para siempre); y su CSS deja el lienzo y los rótulos invisibles y sin puntero.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const dibujo = { veces: 0, fallar: false };
vi.mock('three', async (original) => {
  const T = await original();
  // El doble del renderizador: lo que la escena lee de él existe; lo demás, una función que no hace nada.
  class RendererFalso {
    constructor({ canvas }) {
      this.domElement = canvas; this.dpr = 1;
      this.info = { programs: [], render: { calls: 0, triangles: 0, frame: 0 }, memory: { geometries: 0, textures: 0 } };
      this.shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false, type: 0 };
      this.capabilities = { getMaxAnisotropy: () => 1, isWebGL2: true, maxTextureSize: 4096 };
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => undefined), set: (t, k, v) => { t[k] = v; return true; } });
    }
    render() { dibujo.veces++; if (dibujo.fallar) throw new Error('sin WebGL (doble de la prueba)'); }
    getPixelRatio() { return this.dpr; }
    setPixelRatio(d) { this.dpr = d; }
    setSize() {}
    dispose() {}
  }
  class PMREMFalso { fromScene() { return { texture: new T.Texture(), dispose() {} }; } compileEquirectangularShader() {} dispose() {} }
  return { ...T, WebGLRenderer: RendererFalso, PMREMGenerator: PMREMFalso };
});
vi.mock('./analisis.js', () => ({ montarAnalisis: () => ({ pintarEstado() {}, aviso() {}, alElegirMes() {} }) }));
vi.mock('../../core/refresh.js', () => ({ asegurarLibro: vi.fn() }));
vi.mock('./estado.js', () => ({
  estadoPlantaPorPartes: () => new Promise(() => {}),   // sin datos: aquí sólo importa el armado
  estadoMaduracion: () => ({ salas: {} }),
  cronogramaPlanta: () => ({ modulos: {} }),
  hoyLocal: () => '2026-10-19',
}));
vi.mock('./cifras.js', async (original) => ({ ...(await original()), cifrasGerencia: () => null }));

// Las texturas se pintan en un <canvas> 2D: un contexto que acepta cualquier llamada (y da píxeles en blanco).
const contexto2d = () => {
  const c = new Proxy({}, { get: (t, k) => {
    if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t) return t[k];
    return () => c;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  return c;
};
HTMLCanvasElement.prototype.getContext = function (tipo) { return tipo === '2d' ? contexto2d() : null; };
const cuadros = [];
globalThis.requestAnimationFrame = (cb) => { cuadros.push(cb); return cuadros.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const { plantaView } = await import('./index.js');

let vp, HINT;
const puesta = () => vp.classList.contains('is-armando');
const aviso = () => vp.querySelector('.hintline').textContent;
const quedanBloques = () => /^Preparando la maqueta… \d+ %$/.test(aviso());
const cuadro = () => { const cb = cuadros.shift(); cb(performance.now()); };
async function montar() {
  document.body.innerHTML = '<div id="r"></div>';
  const root = document.getElementById('r');
  plantaView(root);
  // la escena llega en su propio bloque diferido (import de escena.js y three)
  for (let i = 0; i < 400 && !root.querySelector('#vp') && !root.querySelector('.empty-state'); i++) await new Promise((r) => setTimeout(r, 50));
  expect(root.querySelector('.empty-state'), 'la maqueta se montó (sin el cartel «No se pudo mostrar»)').toBeNull();
  vp = root.querySelector('#vp');
  HINT = aviso();
}

beforeEach(() => {
  cuadros.length = 0; dibujo.veces = 0; dibujo.fallar = false;
  localStorage.removeItem('planta_modo');
});

describe('🏭 Planta · la cortina del armado de la maqueta (pauta 1.3, 2026-10-19)', { timeout: 30000 }, () => {
  it('🔴 tapa desde el montaje, con su texto', async () => {
    await montar();
    expect(puesta()).toBe(true);
    expect(vp.querySelector('.armando').textContent).toBe('Preparando la maqueta…');
    expect(HINT, 'control: el aviso de siempre, antes del primer cuadro').toMatch(/^Arrastra para girar/);
  });

  it('🔴 está puesta EXACTAMENTE mientras quedan bloques: el % sube y se descubre en el cuadro que dibuja el último', async () => {
    await montar();
    const pcts = [];
    let n = 0;
    while (puesta() && n < 500) {
      cuadro(); n++;
      expect(puesta(), `cuadro ${n}: la cortina sigue ⇔ quedan bloques («${aviso()}»)`).toBe(quedanBloques());
      if (quedanBloques()) { pcts.push(+aviso().match(/(\d+) %$/)[1]); expect(vp.querySelector('.armando').textContent).toBe(aviso()); }
    }
    expect(puesta(), 'al final se descubre').toBe(false);
    expect(aviso(), 'y vuelve el aviso de siempre').toBe(HINT);
    expect(pcts.length, 'control: el armado va por partes').toBeGreaterThan(3);
    expect(pcts.every((p, i) => i === 0 || p >= pcts[i - 1]), 'el % no retrocede: ' + pcts.join(' ')).toBe(true);
    expect(dibujo.veces, 'cada cuadro del armado dibujó').toBe(n);
  });

  it('🔑 se quita UNA vez, no en cada cuadro', async () => {
    await montar();
    const quitar = vi.spyOn(Object.getPrototypeOf(vp.classList), 'remove');
    try {
      let n = 0;
      while (puesta() && n < 500) { cuadro(); n++; }
      const antes = dibujo.veces;
      for (let i = 0; i < 10; i++) cuadro();
      expect(dibujo.veces - antes, 'control: los cuadros de después también dibujan').toBe(10);
      expect(quitar.mock.calls.filter((a) => a.includes('is-armando')).length).toBe(1);
    } finally { quitar.mockRestore(); }
  });

  it('🔴 si el dibujo falla en el cuadro que vacía la lista, la cortina sigue; el siguiente cuadro bueno la quita (punto 4, 2026-10-18)', async () => {
    await montar();
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});   // el bucle atrapa el fallo y lo anota
    try {
      dibujo.fallar = true;
      let n = 0;
      do { cuadro(); n++; } while (quedanBloques() && n < 500);
      expect(errores.mock.calls.length, 'control: cada cuadro intentó dibujar y falló').toBe(n);
      expect(aviso(), 'control: la lista se vació (cada cuadro revela antes de dibujar)').toBe(HINT);
      expect(puesta(), 'el cuadro que la vació no llegó a dibujarse: la maqueta entera aún no se ha visto').toBe(true);
      dibujo.fallar = false;
      cuadro();
      expect(puesta(), 'el primer cuadro que dibuja bien la quita').toBe(false);
    } finally { errores.mockRestore(); }
  });

  it('🔑 su CSS: lienzo y rótulos invisibles y sin puntero, sin el aviso de abajo; el % sólo mientras arma', () => {
    const css = readFileSync('src/views/planta/planta.css', 'utf8').replace(/\s+/g, ' ');
    for (const regla of [
      '.planta .viewport.is-armando #c, .planta .viewport.is-armando .labels { opacity: 0; }',
      '.planta .viewport.is-armando #c, .planta .viewport.is-armando .lbl { pointer-events: none; }',
      '.planta .viewport.is-armando .hintline { visibility: hidden; }',
      '.planta .viewport:not(.is-armando) .armando { display: none; }',
    ]) expect(css.includes(regla), regla).toBe(true);
  });
});
