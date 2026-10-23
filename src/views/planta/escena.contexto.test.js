// @vitest-environment happy-dom
/* ============================================================
   PLANTA · el CONTEXTO WEBGL y el MONTAJE que falla (pauta 3.17, 2026-10-19, usuario: «aviso y recuperación, sin botón»;
   el QR de Gerencia, incluido). Se monta la escena REAL (index.js → escena.js) en happy-dom con el arnés de la prueba de
   la cortina (escena.cortina.test.js): three.js de verdad salvo el `WebGLRenderer` y el `PMREMGenerator`, dobles que
   CUENTAN lo que se libera; los cuadros los da la prueba.
   Lo que se exige:
   · si el montaje falla a medias, se libera lo creado —el contexto (dispose + forceContextLoss), las escuchas del documento
     y de la ventana, los observadores— y la vista enseña su cartel; volver a elegir 🏭 Maqueta no deja contextos vivos;
   · si el equipo pierde el contexto, la maqueta lo DICE encima; si vuelve, rehace los reflejos (el entorno del momento)
     y las sombras, y el aviso se va;
   · el QR: si su arranque (asíncrono) falla, lo dice en vez de quedarse en «Armando…», y libera su contexto.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const gpu = { renderers: [], pmrem: 0, fallarRO: false, fallarQR: false };
vi.mock('three', async (original) => {
  const T = await original();
  class RendererFalso {
    constructor({ canvas }) {
      this.domElement = canvas; this.dpr = 1; this.liberado = 0; this.perdido = 0;
      this.info = { programs: [], render: { calls: 0, triangles: 0, frame: 0 }, memory: { geometries: 0, textures: 0 } };
      this.shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false, type: 0 };
      this.capabilities = { getMaxAnisotropy: () => 1, isWebGL2: true, maxTextureSize: 4096 };
      gpu.renderers.push(this);
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => undefined), set: (t, k, v) => { t[k] = v; return true; } });
    }
    render() {}
    getPixelRatio() { return this.dpr; }
    setPixelRatio(d) { this.dpr = d; }
    setSize() {}
    dispose() { this.liberado++; }
    forceContextLoss() { this.perdido++; }
  }
  class PMREMFalso { fromScene() { gpu.pmrem++; return { texture: new T.Texture(), dispose() {} }; } compileEquirectangularShader() {} dispose() {} }
  return { ...T, WebGLRenderer: RendererFalso, PMREMGenerator: PMREMFalso };
});
vi.mock('qrcode-generator', async (original) => {
  const real = (await original()).default;
  const qr = (...a) => { if (gpu.fallarQR) throw new Error('el código no cabe (doble de la prueba)'); return real(...a); };
  qr.stringToBytesFuncs = real.stringToBytesFuncs;
  return { default: qr };
});
vi.mock('./analisis.js', () => ({ montarAnalisis: () => ({ pintarEstado() {}, aviso() {}, alElegirMes() {} }) }));
vi.mock('../../core/refresh.js', () => ({ asegurarLibro: vi.fn() }));
vi.mock('./estado.js', () => ({
  estadoPlantaPorPartes: () => new Promise(() => {}),
  estadoMaduracion: () => ({ salas: {} }),
  cronogramaPlanta: () => ({ modulos: {} }),
  hoyLocal: () => '2026-10-19',
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
HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
const cuadros = [];
globalThis.requestAnimationFrame = (cb) => { cuadros.push(cb); return cuadros.length; };
globalThis.cancelAnimationFrame = () => {};
const observadores = { io: 0, ioFuera: 0, ro: 0, roFuera: 0 };
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; observadores.io++; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } disconnect() { observadores.ioFuera++; } };
globalThis.ResizeObserver = class {
  constructor() { if (gpu.fallarRO) throw new Error('fallo a mitad del montaje (doble de la prueba)'); observadores.ro++; }
  observe() {} disconnect() { observadores.roFuera++; }
};

const { plantaView } = await import('./index.js');

let root;
const esperar = async (cond) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 50)); };
async function abrirPlanta() {
  document.body.innerHTML = '<div id="r"></div>';
  root = document.getElementById('r');
  plantaView(root);
  await esperar(() => root.querySelector('#vp') || root.querySelector('.empty-state'));
}

beforeEach(() => {
  cuadros.length = 0; gpu.renderers.length = 0; gpu.pmrem = 0; gpu.fallarRO = false; gpu.fallarQR = false;
  Object.keys(observadores).forEach((k) => { observadores[k] = 0; });
  localStorage.removeItem('planta_modo');
});

describe('🏭 Planta · el montaje que falla a medias (pauta 3.17, 2026-10-19)', { timeout: 30000 }, () => {
  it('🔴 libera el contexto, las escuchas y los observadores, y la vista enseña su cartel', async () => {
    gpu.fallarRO = true;   // el ResizeObserver es de lo último: antes ya se crearon el contexto, las escuchas y el IntersectionObserver
    const quitaDoc = vi.spyOn(document, 'removeEventListener');
    const quitaWin = vi.spyOn(window, 'removeEventListener');
    try {
      await abrirPlanta();
      expect(root.querySelector('.empty-state').textContent).toContain('No se pudo mostrar la maqueta 3D');
      expect(root.querySelector('.empty-state').textContent).toContain('fallo a mitad del montaje');
      expect(gpu.renderers.length, 'control: se llegó a crear el contexto').toBe(1);
      expect([gpu.renderers[0].liberado, gpu.renderers[0].perdido], 'el contexto se libera y se suelta').toEqual([1, 1]);
      expect([observadores.io, observadores.ioFuera], 'control: el IntersectionObserver existía, y se desconecta').toEqual([1, 1]);
      const quitadas = quitaDoc.mock.calls.map((c) => c[0]);
      for (const ev of ['fullscreenchange', 'webkitfullscreenchange', 'keydown']) expect(quitadas, ev).toContain(ev);
      expect(quitaWin.mock.calls.map((c) => c[0])).toContain('popstate');
    } finally { quitaDoc.mockRestore(); quitaWin.mockRestore(); }
  });

  it('🔴 volver a elegir 🏭 Maqueta tras el fallo no deja contextos vivos', async () => {
    gpu.fallarRO = true;
    await abrirPlanta();
    root.querySelector('[data-modo="analisis"]').click();
    gpu.fallarRO = false;
    root.querySelector('[data-modo="maqueta"]').click();
    await esperar(() => root.querySelector('#vp'));
    expect(root.querySelector('#vp'), 'el segundo intento monta').not.toBeNull();
    expect(gpu.renderers.map((r) => r.liberado), 'el del fallo, liberado; el bueno, vivo').toEqual([1, 0]);
  });
});

describe('🏭 Planta · el contexto WebGL perdido (pauta 3.17, 2026-10-19)', { timeout: 30000 }, () => {
  it('🔴 lo DICE encima de la maqueta; si vuelve, rehace los reflejos del momento y las sombras, y el aviso se va', async () => {
    await abrirPlanta();
    const vp = root.querySelector('#vp'), canvas = root.querySelector('#c'), R = gpu.renderers[0];
    const aviso = () => vp.querySelector('.contexto-perdido');
    expect(aviso().hidden, 'sin pérdida, no hay aviso').toBe(true);
    root.querySelector('#tod button[data-t="night"]').click();   // el entorno «de noche» ya generado
    const antes = gpu.pmrem;
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(aviso().hidden).toBe(false);
    expect(aviso().textContent).toContain('liberó la memoria gráfica');
    expect(aviso().textContent).toContain('recarga la página');
    expect(gpu.pmrem, 'perderlo no genera nada').toBe(antes);
    R.shadowMap.needsUpdate = false;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(aviso().hidden, 'al volver, el aviso se va').toBe(true);
    expect(gpu.pmrem, 'los reflejos se rehacen: el entorno de la hora elegida, otra vez').toBe(antes + 1);
    expect(R.shadowMap.needsUpdate, 'y las sombras').toBe(true);
    expect(root.querySelector('#tod button[data-t="night"]').getAttribute('aria-pressed'), 'con la misma hora del día').toBe('true');
  });

  it('🔑 su CSS: arriba, encima de la maqueta y de la cortina, y oculto de verdad con `hidden`', () => {
    const css = readFileSync('src/views/planta/planta.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.planta \.contexto-perdido \{[^}]*position: absolute;[^}]*z-index: 2;/);
    expect(css.includes('.planta .contexto-perdido[hidden] { display: none; }')).toBe(true);
  });
});

describe('🔳 QR de Gerencia · el arranque que falla (pauta 3.17, 2026-10-19)', { timeout: 30000 }, () => {
  it('🔴 dice que no se pudo en vez de quedarse en «Armando…», y libera su contexto', async () => {
    gpu.fallarQR = true;
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { paginaQR } = await import('./qr/index.js');
      document.body.innerHTML = '<div id="app"></div>';
      paginaQR(document.getElementById('app'));
      const stage = () => document.querySelector('.stage');
      await esperar(() => /No se pudo mostrar el QR 3D/.test(stage().textContent));
      expect(stage().textContent).toContain('No se pudo mostrar el QR 3D en este equipo.');
      expect(stage().textContent).toContain('el código no cabe');
      expect(stage().querySelector('canvas'), 'el lienzo se va').toBeNull();
      const R = gpu.renderers[gpu.renderers.length - 1];
      expect([R.liberado, R.perdido]).toEqual([1, 1]);
      expect(errores.mock.calls.some((c) => c[0] === '[qr] arranque'), 'el error se anota en la consola').toBe(true);
    } finally { errores.mockRestore(); }
  });
});

/* Tarea 27 (2026-10-22, usuario: como la maqueta, y sin bajar una imagen vacía). Se abre con la forma «adulto» guardada para
   que el arranque no espere la imagen de un logo. */
describe('🔳 QR de Gerencia · el contexto WebGL perdido (Tarea 27, 2026-10-22)', { timeout: 30000 }, () => {
  it('🔴 lo DICE encima del código; mientras falta, «Descargar PNG» no baja el lienzo vacío; al volver, el aviso se va y descarga', async () => {
    localStorage.setItem('planta_qr', JSON.stringify({ form: 'adulto' }));
    const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prueba');
    const pulsar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new Blob(['png'])); };
    try {
      const { paginaQR } = await import('./qr/index.js');
      document.body.innerHTML = '<div id="app"></div>';
      paginaQR(document.getElementById('app'));
      await esperar(() => document.querySelector('#loading').hidden);
      const canvas = document.querySelector('#scene'), aviso = () => document.querySelector('.stage .contexto-perdido');
      const toast = () => document.querySelector('#toast').textContent;
      expect(aviso().hidden, 'sin pérdida, no hay aviso').toBe(true);

      canvas.dispatchEvent(new Event('webglcontextlost'));
      expect(aviso().hidden).toBe(false);
      expect(aviso().textContent).toContain('liberó la memoria gráfica');
      expect(aviso().textContent).toContain('recarga la página');
      document.querySelector('#save').click();
      await esperar(() => toast());
      expect(toast()).toContain('Ahora no se puede crear la imagen');
      expect(crear, 'no se baja nada').not.toHaveBeenCalled();

      canvas.dispatchEvent(new Event('webglcontextrestored'));
      expect(aviso().hidden, 'al volver, el aviso se va').toBe(true);
      document.querySelector('#save').click();
      await esperar(() => toast().includes('Imagen descargada'));
      expect(toast()).toContain('Imagen descargada');
      expect(crear).toHaveBeenCalledTimes(1);
    } finally {
      crear.mockRestore(); pulsar.mockRestore(); HTMLCanvasElement.prototype.toBlob = toBlob; localStorage.removeItem('planta_qr');
    }
  });

  it('🔑 su CSS: encima del lienzo y oculto de verdad con `hidden`', () => {
    const css = readFileSync('src/views/planta/qr/qr.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.qr-acceso \.contexto-perdido \{[^}]*position: absolute;[^}]*z-index: 2;/);
    expect(css.includes('.qr-acceso .contexto-perdido[hidden] { display: none; }')).toBe(true);
  });
});
