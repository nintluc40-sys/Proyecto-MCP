// @vitest-environment happy-dom
/* ============================================================
   🔳 QR 3D de Gerencia · lo que PINTA (punto 37 de la pauta del 12-11, usuario: «Que sea el enlace correcto»).
   Se monta la página real (qr/index.js → escena.js) con three.js de verdad salvo el `WebGLRenderer`, un doble que GUARDA
   la escena que se le manda a dibujar. Así se puede mirar, sin GPU, lo que importa del QR: que las piezas oscuras queden
   EXACTAMENTE en los módulos del código del enlace de Gerencia (con el mismo codificador, qrcode-generator), que la
   «huella» impresa bajo las piezas sea ese mismo código, y que la imagen que se descarga salga de ese dibujo.
   (escena.contexto.test.js ya cubre el contexto perdido y el arranque que falla; aquí, el dibujo.)
   ============================================================ */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const gpu = { renders: [] };
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
    render(scene) { gpu.renders.push(scene); }
    getPixelRatio() { return this.dpr; }
    setPixelRatio(d) { this.dpr = d; }
    setSize() {}
    dispose() {}
    forceContextLoss() {}
  }
  class PMREMFalso { fromScene() { return { texture: new T.Texture(), dispose() {} }; } compileEquirectangularShader() {} dispose() {} }
  return { ...T, WebGLRenderer: RendererFalso, PMREMGenerator: PMREMFalso };
});

import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import { enlaceGerencia } from '../../../ui/accesoRol.js';

/* Un contexto 2D que APUNTA lo que se pinta en cada lienzo (los rectángulos y su color, y los drawImage). */
const pintado = new WeakMap();
const notas = [];   // todas, también las de lienzos que no están en el documento (el PNG de salida)
const contexto2d = (cv) => {
  const nota = { rects: [], imagenes: [] };
  pintado.set(cv, nota); notas.push(nota);
  const c = new Proxy({}, { get: (t, k) => {
    if (k === 'fillRect') return (x, y, w, h) => nota.rects.push({ x, y, w, h, color: t.fillStyle });
    if (k === 'drawImage') return (...a) => nota.imagenes.push(a);
    if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t) return t[k];
    return () => c;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  return c;
};
const cuadros = [];
let restaurar = () => {};
beforeAll(() => {
  const gc = HTMLCanvasElement.prototype.getContext, td = HTMLCanvasElement.prototype.toDataURL, tb = HTMLCanvasElement.prototype.toBlob;
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame, ro = globalThis.ResizeObserver;
  HTMLCanvasElement.prototype.getContext = function (tipo) { return tipo === '2d' ? contexto2d(this) : null; };
  HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
  HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new Blob(['png'])); };
  globalThis.requestAnimationFrame = (cb) => { cuadros.push(cb); return cuadros.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  restaurar = () => {
    HTMLCanvasElement.prototype.getContext = gc; HTMLCanvasElement.prototype.toDataURL = td; HTMLCanvasElement.prototype.toBlob = tb;
    globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf; globalThis.ResizeObserver = ro;
  };
});
afterAll(() => { restaurar(); try { localStorage.removeItem('planta_qr'); } catch (_) { /* nada */ } location.hash = ''; });

const esperar = async (cond) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 25)); };
let ahora = 1000;
/** Corre `n` cuadros de animación de 50 ms (lo que tope el bucle). */
const cuadrosDe = (n) => { for (let i = 0; i < n; i++) { const cb = cuadros.shift(); if (!cb) return; ahora += 50; cb(ahora); } };

/** La matriz del código que DEBE salir: el mismo codificador y los mismos parámetros que escena.js. */
function matrizEsperada(enlace) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, 'Q'); qr.addData(enlace, 'Byte'); qr.make();
  const N = qr.getModuleCount(), oscuros = new Set();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (qr.isDark(r, c)) oscuros.add(r + ',' + c);
  return { N, oscuros };
}
/** Lo que dibuja la última escena: las piezas (InstancedMesh) con su posición y tamaño. */
function piezas() {
  const escena = gpu.renders[gpu.renders.length - 1];
  const malla = escena.children.find((o) => o.isInstancedMesh);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  return Array.from({ length: malla.count }, (_, i) => { malla.getMatrixAt(i, m); m.decompose(p, q, s); return { x: p.x, y: p.y, s: s.x }; });
}
/** Las casillas (fila, columna) que ocupan las piezas GRANDES, con el lado de casilla que dan sus tamaños. */
function casillasOscuras(N) {
  const grandes = piezas().filter((x) => x.s > 1e-3);
  const cell = grandes[0].s / 1.02;
  const fuera = [];
  const set = new Set(grandes.map(({ x, y }) => {
    const c = x / cell + (N - 1) / 2, r = (N - 1) / 2 - y / cell;
    if (Math.abs(c - Math.round(c)) > 1e-3 || Math.abs(r - Math.round(r)) > 1e-3) fuera.push({ x, y });
    return Math.round(r) + ',' + Math.round(c);
  }));
  return { set, fuera, grandes: grandes.length };
}

describe('🔳 QR de Gerencia · lo que pinta (punto 37)', { timeout: 30000 }, () => {
  let enlace, esperado;
  beforeAll(async () => {
    localStorage.setItem('planta_qr', JSON.stringify({ form: 'adulto' }));   // la figura, sin cargar la imagen de un logo
    location.hash = 'qr';                                                     // arranca con el código ya formado
    const { paginaQR } = await import('./index.js');
    document.body.innerHTML = '<div id="app"></div>';
    paginaQR(document.getElementById('app'));
    await esperar(() => document.querySelector('#loading').hidden);
    enlace = enlaceGerencia(location.href);
    esperado = matrizEsperada(enlace);
    cuadrosDe(1);
  });

  it('el enlace es el de Gerencia (entra con ?rol=gerencia)', () => {
    expect(enlace).toMatch(/\?rol=gerencia$/);
  });

  it('🔴 las piezas oscuras ocupan EXACTAMENTE los módulos oscuros del código del enlace, en su rejilla', () => {
    const { set, fuera } = casillasOscuras(esperado.N);
    expect(fuera, 'ninguna pieza fuera de una casilla').toEqual([]);
    expect([...set].sort()).toEqual([...esperado.oscuros].sort());
  });

  it('🔴 la «huella» impresa bajo las piezas es ese mismo código: un píxel por módulo oscuro', () => {
    const escena = gpu.renders[gpu.renders.length - 1];
    let lienzo = null;
    escena.traverse((o) => { const m = o.material && o.material.map; if (m && m.isCanvasTexture && m.image && m.image.width === esperado.N) lienzo = m.image; });
    expect(lienzo, 'la huella es un lienzo de N × N').not.toBeNull();
    const rects = pintado.get(lienzo).rects;
    expect(rects.every((r) => r.w === 1 && r.h === 1)).toBe(true);
    expect(new Set(rects.map((r) => r.y + ',' + r.x))).toEqual(esperado.oscuros);
  });

  it('🔴 la imagen que se descarga sale de ESE dibujo (con el código formado), cuadrada y centrada', async () => {
    const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prueba');
    const pulsar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const antes = gpu.renders.length;
    try {
      document.querySelector('#save').click();
      await esperar(() => document.querySelector('#toast').textContent.includes('Imagen descargada'));
      expect(crear).toHaveBeenCalledTimes(1);
      const a = pulsar.mock.contexts[0];
      expect(a.download).toBe('qr-acceso-gerencia-adulto.png');
      // el dibujo que se recortó: el de la escena tal cual, con el mismo código
      expect(gpu.renders.length).toBeGreaterThan(antes);
      expect([...casillasOscuras(esperado.N).set].sort()).toEqual([...esperado.oscuros].sort());
      const salida = notas.find((n) => n.imagenes.length);
      expect(salida, 'el PNG se pinta copiando el lienzo de la escena').toBeTruthy();
      const [src, sx, sy, sw, sh, dx, dy, dw, dh] = salida.imagenes[0];
      expect(src).toBe(document.querySelector('#scene'));
      expect([sw, dw, dx, dy]).toEqual([sh, dh, 0, 0]);                 // cuadrado, pegado en el origen
      expect([sx, sy]).toEqual([(src.width - sw) / 2, (src.height - sh) / 2]);   // centrado
    } finally { crear.mockRestore(); pulsar.mockRestore(); }
  });

  it('control: al volver a la figura, las piezas DEJAN de formar el código (la prueba de arriba no pasa en vacío)', () => {
    document.querySelector('#toggle').click();
    cuadrosDe(80);                                    // 4 s: de vuelta a la figura entera
    const { set, fuera } = casillasOscuras(esperado.N);
    expect(fuera.length + [...set].filter((k) => !esperado.oscuros.has(k)).length).toBeGreaterThan(0);
    document.querySelector('#toggle').click();
    cuadrosDe(80);                                    // y otra vez al código: vuelve a ser el del enlace
    expect([...casillasOscuras(esperado.N).set].sort()).toEqual([...esperado.oscuros].sort());
  });
});
