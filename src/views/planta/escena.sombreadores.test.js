// @vitest-environment happy-dom
/* ============================================================
   PLANTA · los SOMBREADORES EN SEGUNDO PLANO de la 1.ª visita a la maqueta (2026-10-23, ronda 5, Sesión A · tarea 3;
   usuario, opción A). three r128 espera cada programa nuevo en el hilo principal (medido: 24 programas, 8,2 s, tareas
   de hasta 1 s); con KHR_parallel_shader_compile, antes de descubrir nada, la escena saca las fuentes que three generaría
   (un renderizador de usar y tirar que sólo las apunta) y las enlaza aparte en el contexto de la maqueta; mientras, no
   dibuja y el % cuenta los listos (escena.js · `fuentesDeLaEscena`, `previosListos`, `avisarArmado`). Aquí, el arnés de
   escena.cortina.test.js (la escena REAL en happy-dom, three.js de verdad salvo el `WebGLRenderer` y el `PMREMGenerator`)
   con contextos WebGL falsos: el de la maqueta dice cuándo está cada programa; el de usar y tirar emula lo que three le
   pide al compilar (crear, dar fuentes, compilar, enlazar, leer sus uniformes).
   Lo que se exige: con la extensión, la cortina espera sin dibujar ni descubrir y el % sube con los listos; se enlazan en
   el contexto de la MAQUETA exactamente las fuentes apuntadas (con sus atributos) y se sueltan al estar; el de usar y
   tirar no compila, se suelta y no deja oyentes en los materiales; pasado el tope o con el contexto perdido, se sigue
   como antes; y sin la extensión, o si sacar las fuentes falla, todo es como antes.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const COMPLETION_STATUS_KHR = 0x91B1, VERTEX_SHADER = 35633, FRAGMENT_SHADER = 35632;
const N = 5;   // los programas que «three» le pide al de usar y tirar
const prueba = { conExtension: true, fallarCompile: false, renderers: [], dibujos: 0 };

// El contexto de la MAQUETA: guarda lo enlazado y contesta COMPLETION_STATUS según `listos`.
function contextoMaqueta() {
  const g = {
    VERTEX_SHADER, FRAGMENT_SHADER, programas: [], borrados: [], listos: new Set(), perdido: false,
    getExtension: (n) => (n === 'KHR_parallel_shader_compile' && prueba.conExtension ? { COMPLETION_STATUS_KHR } : null),
    createProgram: () => { const p = { sh: [], b: [], enlazado: false }; g.programas.push(p); return p; },
    createShader: (t) => ({ t }),
    shaderSource: (s, src) => { s.src = src; },
    compileShader: (s) => { s.compilado = true; },
    attachShader: (p, s) => { p.sh.push(s); },
    bindAttribLocation: (p, i, n) => { p.b.push([i, n]); },
    linkProgram: (p) => { p.enlazado = true; },
    deleteShader: () => {},
    deleteProgram: (p) => { g.borrados.push(p); },
    getProgramParameter: (p, q) => (q === COMPLETION_STATUS_KHR ? g.listos.has(p) : null),
    isContextLost: () => g.perdido,
  };
  return g;
}
// El de usar y tirar: sus funciones las sustituye la escena; si alguna original se llamara, queda anotado.
function contextoCaptura() {
  const g = { originales: [] };
  for (const f of ['shaderSource', 'compileShader', 'bindAttribLocation', 'linkProgram', 'getProgramParameter']) g[f] = () => { g.originales.push(f); return 0; };
  g.createProgram = () => ({}); g.createShader = (t) => ({ t }); g.attachShader = () => {}; g.deleteShader = () => {};
  return g;
}

vi.mock('three', async (original) => {
  const T = await original();
  class RendererFalso {
    constructor({ canvas }) {
      this.domElement = canvas; this.dpr = 1;
      this.info = { programs: [], render: { calls: 0, triangles: 0, frame: 0 }, memory: { geometries: 0, textures: 0 } };
      this.shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false, type: 0 };
      this.capabilities = { getMaxAnisotropy: () => 1, isWebGL2: true, maxTextureSize: 4096 };
      this.debug = { checkShaderErrors: true };
      this.captura = prueba.renderers.length > 0;   // el primero es el de la maqueta; el segundo, el de usar y tirar
      this.gl = this.captura ? contextoCaptura() : contextoMaqueta();
      this.soltado = []; this.compilado = null;
      prueba.renderers.push(this);
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => undefined), set: (t, k, v) => { t[k] = v; return true; } });
    }
    getContext() { return this.gl; }
    // lo que three hace al compilar una escena, programa por programa (WebGLProgram en r128): crear, fuentes, compilar,
    // enlazar y, enseguida, leer los uniformes (getProgramParameter); y deja un oyente de «dispose» en cada material (aquí,
    // antes de nada: así también queda puesto cuando falla a medias)
    compile(scene) {
      this.compilado = { checkShaderErrors: this.debug.checkShaderErrors, outputEncoding: this.outputEncoding, toneMapping: this.toneMapping,
        sombras: [this.shadowMap.enabled, this.shadowMap.type] };
      this.escena = scene; this.oyente = () => {};
      scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.addEventListener('dispose', this.oyente); });
      if (prueba.fallarCompile) throw new Error('three no pudo (doble de la prueba)');
      const g = this.gl;
      for (let i = 0; i < N; i++) {
        const p = g.createProgram();
        const v = g.createShader(VERTEX_SHADER); g.shaderSource(v, 'vs' + i); g.compileShader(v);
        const f = g.createShader(FRAGMENT_SHADER); g.shaderSource(f, 'fs' + i); g.compileShader(f);
        g.attachShader(p, v); g.attachShader(p, f);
        if (i === 1) g.bindAttribLocation(p, 0, 'position');
        g.linkProgram(p); g.getProgramParameter(p, 35718);
      }
    }
    render() { prueba.dibujos++; }
    getPixelRatio() { return this.dpr; }
    setPixelRatio(d) { this.dpr = d; }
    setSize() {}
    dispose() { this.soltado.push('dispose'); }
    forceContextLoss() { this.soltado.push('forceContextLoss'); }
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
  hoyLocal: () => '2026-10-23',
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

const { plantaView } = await import('./index.js');

let vp, HINT;
const puesta = () => vp.classList.contains('is-armando');
const aviso = () => vp.querySelector('.hintline').textContent;
const pct = () => { const m = aviso().match(/^Preparando la maqueta… (\d+) %$/); return m ? +m[1] : null; };
const cuadro = () => { const cb = cuadros.shift(); cb(performance.now()); };
const maqueta = () => prueba.renderers.find((r) => !r.captura);
const captura = () => prueba.renderers.find((r) => r.captura);
async function montar() {
  document.body.innerHTML = '<div id="r"></div>';
  const root = document.getElementById('r');
  plantaView(root);
  for (let i = 0; i < 400 && !root.querySelector('#vp') && !root.querySelector('.empty-state'); i++) await new Promise((r) => setTimeout(r, 50));
  expect(root.querySelector('.empty-state'), 'la maqueta se montó (sin el cartel «No se pudo mostrar»)').toBeNull();
  vp = root.querySelector('#vp');
  HINT = aviso();
}
const hastaDescubrir = () => { let n = 0; while (puesta() && n < 600) { cuadro(); n++; } return n; };

beforeEach(() => {
  cuadros.length = 0; prueba.renderers.length = 0; prueba.dibujos = 0; prueba.conExtension = true; prueba.fallarCompile = false;
  localStorage.removeItem('planta_modo');
});

describe('🏭 Planta · sombreadores en segundo plano en la 1.ª visita (ronda 5, tarea 3, 2026-10-23)', { timeout: 30000 }, () => {
  it('🔴 con la extensión, la cortina ESPERA a los sombreadores sin dibujar ni descubrir; el % sube con los listos; luego se arma como siempre', async () => {
    await montar();
    const gl = maqueta().gl;
    expect(gl.programas.length, 'se enlazaron aparte los que apuntó el de usar y tirar').toBe(N);
    cuadro();
    expect(prueba.dibujos, 'sin dibujar mientras faltan').toBe(0);
    expect(puesta()).toBe(true);
    const p0 = pct();
    expect(p0, 'el % de siempre, desde el primer cuadro: «' + aviso() + '»').toBe(0);
    gl.listos.add(gl.programas[0]); gl.listos.add(gl.programas[1]);
    cuadro(); cuadro();
    expect(prueba.dibujos, 'con dos de cinco, todavía no').toBe(0);
    const p1 = pct();
    expect(p1, 'el % cuenta los listos').toBeGreaterThan(p0);
    expect(vp.querySelector('.armando').textContent, 'la cortina dice lo mismo').toBe(aviso());
    expect(gl.borrados, 'los listos se sueltan (el navegador guarda lo enlazado aparte)').toEqual([gl.programas[0], gl.programas[1]]);
    gl.programas.forEach((p) => gl.listos.add(p));
    cuadro();
    expect(prueba.dibujos, 'con todos, ese mismo cuadro ya descubre y dibuja').toBe(1);
    expect(pct(), 'y el % sigue subiendo').toBeGreaterThanOrEqual(p1);
    expect(gl.borrados.length, 'todos soltados').toBe(N);
    const n = hastaDescubrir();
    expect(puesta(), 'al final se descubre').toBe(false);
    expect(aviso()).toBe(HINT);
    expect(prueba.dibujos, 'desde ahí, cada cuadro dibuja (como siempre)').toBe(n + 1);
  });

  it('🔴 en el contexto de la MAQUETA se enlazan exactamente las fuentes apuntadas, en su orden y con sus atributos; el de usar y tirar no compila nada y se suelta', async () => {
    await montar();
    const gl = maqueta().gl, cap = captura();
    expect(cap, 'hubo un renderizador de usar y tirar').toBeTruthy();
    expect(gl.programas.map((p) => p.sh.map((s) => [s.t, s.src, !!s.compilado]))).toEqual(
      Array.from({ length: N }, (_, i) => [[VERTEX_SHADER, 'vs' + i, true], [FRAGMENT_SHADER, 'fs' + i, true]]));
    expect(gl.programas.map((p) => p.b)).toEqual(Array.from({ length: N }, (_, i) => (i === 1 ? [[0, 'position']] : [])));
    expect(gl.programas.every((p) => p.enlazado), 'enlazados (aparte: nadie espera)').toBe(true);
    expect(cap.gl.originales, 'el de usar y tirar no compiló, no enlazó ni leyó nada de verdad').toEqual([]);
    const m = maqueta();
    expect(cap.compilado, 'compiló con los ajustes de la maqueta y sin la consulta que espera').toEqual({ checkShaderErrors: false,
      outputEncoding: m.outputEncoding, toneMapping: m.toneMapping, sombras: [m.shadowMap.enabled, m.shadowMap.type] });
    expect(cap.compilado.outputEncoding, 'control: los ajustes no son los de fábrica').toBeTruthy();
    expect(cap.soltado, 'y se soltó enseguida').toEqual(['dispose', 'forceContextLoss']);
    // los materiales de la escena no se quedan escuchando su «dispose» (lo retendrían hasta soltar la maqueta)
    const mats = new Set();
    cap.escena.traverse((o) => { if (o.material && !Array.isArray(o.material)) mats.add(o.material); });
    expect(mats.size, 'control: hay materiales').toBeGreaterThan(10);
    expect([...mats].filter((mt) => ((mt._listeners && mt._listeners.dispose) || []).includes(cap.oyente)).length, 'materiales que aún lo escuchan').toBe(0);
  });

  it('🔴 pasado el tope (10 s) sin que estén, se sigue como antes: se descubre y dibuja', async () => {
    await montar();
    cuadro(); cuadro();
    expect(prueba.dibujos).toBe(0);
    // el reloj de TODA la página 10 s adelante (no sólo el de los cuadros: el reposo de la maqueta mira los dos)
    const real = performance.now.bind(performance);
    const ahora = vi.spyOn(performance, 'now').mockImplementation(() => real() + 10001);
    try {
      cuadro();
      expect(prueba.dibujos, 'el cuadro del tope ya dibuja').toBe(1);
      hastaDescubrir();
      expect(puesta(), 'y la cortina se va').toBe(false);
    } finally { ahora.mockRestore(); }
  });

  it('🔴 si se pierde el contexto mientras esperan, se sigue como antes (no se queda la cortina para siempre)', async () => {
    await montar();
    cuadro();
    expect(prueba.dibujos).toBe(0);
    maqueta().gl.perdido = true;
    cuadro();
    expect(prueba.dibujos, 'sin esperar más').toBe(1);
    hastaDescubrir();
    expect(puesta()).toBe(false);
  });

  it('🔑 sin la extensión, como antes: ni renderizador de usar y tirar ni espera', async () => {
    prueba.conExtension = false;
    await montar();
    expect(prueba.renderers.length, 'sólo el de la maqueta').toBe(1);
    expect(maqueta().gl.programas.length).toBe(0);
    cuadro();
    expect(prueba.dibujos, 'el primer cuadro ya dibuja').toBe(1);
  });

  it('🔑 si sacar las fuentes falla, como antes (y lo dice en la consola, sin romper la maqueta)', async () => {
    prueba.fallarCompile = true;
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await montar();
      expect(avisos.mock.calls.some((a) => /sombreadores en segundo plano/.test(String(a[0]))), 'el aviso').toBe(true);
      expect(captura().soltado, 'el de usar y tirar se soltó igual').toEqual(['dispose', 'forceContextLoss']);
      const mats = new Set();
      captura().escena.traverse((o) => { if (o.material && !Array.isArray(o.material)) mats.add(o.material); });
      expect(mats.size, 'control: falló con los oyentes ya puestos').toBeGreaterThan(10);
      expect([...mats].filter((mt) => ((mt._listeners && mt._listeners.dispose) || []).includes(captura().oyente)).length, 'y no los deja').toBe(0);
      expect(maqueta().gl.programas.length).toBe(0);
      cuadro();
      expect(prueba.dibujos, 'el primer cuadro ya dibuja').toBe(1);
    } finally { avisos.mockRestore(); }
  });
});
