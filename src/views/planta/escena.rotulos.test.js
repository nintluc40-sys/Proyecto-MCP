// @vitest-environment happy-dom
/* ============================================================
   PLANTA · los RÓTULOS de la maqueta en PÍXEL ENTERO (M1, 2026-10-27, usuario: «los rótulos de los tanques y módulos
   centellean, brillan o se ven erráticos al mover la maqueta»). Medido en Chrome real antes del arreglo: ningún rótulo
   caía en un píxel entero (iban a medio píxel y se centraban con `translate(-50%, …)`, que depende del ancho) y la
   fracción saltaba de un cuadro a otro, así que el texto se redibujaba en otro subpíxel y temblaba. Aquí se monta la
   escena REAL (index.js → escena.js) con el arnés de `escena.cortina.test.js` y, como happy-dom no maqueta, se le da un
   tamaño a la vista y a los rótulos. Lo que se exige: cada rótulo pintado (módulo o sala, geográfico y número de tanque)
   va en `translate3d(Npx, Mpx, 0)` con N y M ENTEROS y sin porcentajes, centrado con su tamaño (los de módulo, apoyados
   en su punto). El margen para reaparecer y el del texto corto se miden en Chrome (sondas de la tarea, con mutaciones).
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';

vi.mock('three', async (original) => {
  const T = await original();
  class RendererFalso {
    constructor({ canvas }) {
      this.domElement = canvas; this.dpr = 1;
      this.info = { programs: [], render: { calls: 0, triangles: 0, frame: 0 }, memory: { geometries: 0, textures: 0 } };
      this.shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false, type: 0 };
      this.capabilities = { getMaxAnisotropy: () => 1, isWebGL2: true, maxTextureSize: 4096 };
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => undefined), set: (t, k, v) => { t[k] = v; return true; } });
    }
    render() {}
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
  estadoPlantaPorPartes: () => new Promise(() => {}),   // sin datos: los rótulos existen igual
  estadoMaduracion: () => ({ salas: {} }),
  cronogramaPlanta: () => ({ modulos: {} }),
  hoyLocal: () => '2026-10-27',
}));
vi.mock('./cifras.js', async (original) => ({ ...(await original()), cifrasGerencia: () => null }));

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

// happy-dom no maqueta: la vista mide 1366 × 900 y cada rótulo, un tamaño IMPAR (para que el centrado caiga en medio píxel).
const TAM = { lbl: [37, 21], num: [19, 13], geo: [55, 13] };
const tipo = (el) => (el.classList && Object.keys(TAM).find((k) => el.classList.contains(k))) || null;
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { const k = tipo(this); return k ? TAM[k][0] : 0; } });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { const k = tipo(this); return k ? TAM[k][1] : 0; } });
const rectOriginal = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  return this.id === 'vp' || this.id === 'c' ? { left: 0, top: 0, right: 1366, bottom: 900, width: 1366, height: 900, x: 0, y: 0 } : rectOriginal.call(this);
};

const { plantaView } = await import('./index.js');
const cuadro = () => { const cb = cuadros.shift(); if (cb) cb(performance.now()); };

async function montar() {
  document.body.innerHTML = '<div id="r"></div>';
  const root = document.getElementById('r');
  plantaView(root);
  for (let i = 0; i < 400 && !root.querySelector('#vp') && !root.querySelector('.empty-state'); i++) await new Promise((r) => setTimeout(r, 50));
  expect(root.querySelector('.empty-state'), 'la maqueta se montó').toBeNull();
  window.dispatchEvent(new Event('resize'));   // toma el tamaño de la vista
  const vp = root.querySelector('#vp');
  for (let n = 0; vp.classList.contains('is-armando') && n < 500; n++) cuadro();
  for (let i = 0; i < 5; i++) cuadro();
  return root;
}
const PX = /^translate3d\((-?\d+)px,(-?\d+)px,0\)$/;
const pintados = (root, sel) => [...root.querySelectorAll('#labels ' + sel)].filter((el) => el.style.visibility !== 'hidden' && el.style.transform);

describe('🏭 Planta · los rótulos de la maqueta en píxel entero (M1, 2026-10-27)', { timeout: 30000 }, () => {
  it('🔴 los de módulo y sala: translate3d con píxeles ENTEROS, centrados en x y apoyados en su punto', async () => {
    const root = await montar();
    const lbl = pintados(root, '.lbl');
    expect(lbl.length, 'control: hay rótulos de módulo y sala en pantalla').toBeGreaterThan(3);
    for (const el of lbl) {
      const m = PX.exec(el.style.transform);
      expect(m, `«${el.style.transform}» (${el.textContent})`).not.toBeNull();
      expect(+m[1]).toBe(Math.round(el._xr - 37 / 2));
      expect(+m[2]).toBe(Math.round(el._y - 21));
    }
    // control: el centrado cae en MEDIO píxel en alguno (ancho impar), así que sin redondear no sería entero
    expect(lbl.some((el) => (el._xr - 37 / 2) % 1 !== 0), 'control: algún centrado cae en medio píxel').toBe(true);
  });

  it('🔴 los geográficos (Mar, Playa…): centrados en su punto, en píxeles enteros', async () => {
    const root = await montar();
    const geo = pintados(root, '.geo');
    expect(geo.length, 'control: hay rótulos geográficos en pantalla').toBeGreaterThan(0);
    for (const el of geo) {
      const m = PX.exec(el.style.transform);
      expect(m, `«${el.style.transform}» (${el.textContent})`).not.toBeNull();
      expect(+m[1]).toBe(Math.round(el._xr - 55 / 2));
      expect(+m[2]).toBe(Math.round(el._y - 13 / 2));
    }
  });

  it('🔴 los números de los tanques del módulo elegido, también', async () => {
    const root = await montar();
    const boton = root.querySelector('.list button');
    expect(boton, 'control: la lista de módulos existe').not.toBeNull();
    boton.click();
    for (let i = 0; i < 90; i++) cuadro();   // el vuelo de la cámara hasta el módulo
    const num = pintados(root, '.num');
    expect(num.length, 'control: salen los números de sus tanques').toBeGreaterThan(0);
    for (const el of num) expect(el.style.transform, `tanque ${el.textContent}`).toMatch(PX);
  });
});
