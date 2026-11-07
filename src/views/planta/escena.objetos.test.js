// @vitest-environment happy-dom
/* ============================================================
   PLANTA · lo que se pone en la maqueta, donde cabe (A33, 2026-11-07, usuario: «Moverlos a lo libre», «El logo de la
   cabecera», «Sí, hazlo»). Con el arnés de escena.contacto.test.js (la escena REAL en happy-dom, three.js de verdad salvo el
   renderizador y el PMREM). Lo que se exige:
   · ningún poste de luz dentro de un tanque ni de un edificio (había uno dentro del tanque 10 de M7);
   · ningún recorrido de caminante sobre un tanque (el de M10 pisaba los tanques 9 y 10; el de la Sala 1, los de desove);
   · la mesa de trabajo de la zona de desove, sin tocar ningún tanque (estaba sobre D1 y D6);
   · el letrero de la entrada carga el logo de la app (la imagen no tenía `src`: el hueco salía en blanco);
   · con movimiento reducido, la escena quieta se recoloca al llegar los datos: sin caminantes en los módulos sin cultivo ni
     burbujas en los tanques de maduración sin animales (antes sólo se colocaba al montar, sin datos).
   ============================================================ */
import { describe, it, expect, vi, afterEach } from 'vitest';

const escenas = [], vistas = [];
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
  class EscenaEspia extends T.Scene { constructor(...a) { super(...a); escenas.push(this); } }
  return { ...T, WebGLRenderer: RendererFalso, PMREMGenerator: PMREMFalso, Scene: EscenaEspia };
});
vi.mock('./escena.js', async (original) => {
  const E = await original();
  return { ...E, montarPlanta: (root) => { const v = E.montarPlanta(root); vistas.push(v); return v; } };
});
vi.mock('./analisis.js', () => ({ montarAnalisis: () => ({ pintarEstado() {}, aviso() {}, alElegirMes() {} }) }));
vi.mock('../../core/refresh.js', () => ({ asegurarLibro: vi.fn() }));
vi.mock('./estado.js', () => ({
  estadoPlantaPorPartes: () => new Promise(() => {}),
  estadoMaduracion: () => ({ salas: {} }),
  cronogramaPlanta: () => ({ modulos: {} }),
  hoyLocal: () => '2026-11-07',
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
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const imagenes = [];
const ImagenOriginal = globalThis.Image;
globalThis.Image = class extends ImagenOriginal { constructor(...a) { super(...a); imagenes.push(this); } };

const THREE = await import('three');
const { plantaView } = await import('./index.js');
const { PATHS } = await import('./escena.js');
const { LARV, MAT, OTHERS, C0, tanquesDeSala } = await import('./plano.js');

/** Las huellas de los tanques (como las arma escena.js: el rectangular, 0,15 m de muro a cada lado) y las de los edificios. */
const TANQUES = [], EDIFICIOS = [];
LARV.forEach((m) => { EDIFICIOS.push({ q: m.id, b: m.box }); m.rows.forEach((z, r) => m.cols.forEach((x, c) => TANQUES.push({ q: 'M' + m.n + ' T' + m.num(r, c), x0: x - .15, z0: z - .15, x1: x + m.L + .15, z1: z + m.W + .15 }))); });
MAT.forEach((m) => {
  EDIFICIOS.push({ q: m.id, b: m.box });
  if (m.circ) {
    const k = m.circ, d = m.desove;
    k.zs.forEach((z, r) => k.xs.forEach((x, c) => TANQUES.push({ q: 'S' + m.n + ' T' + k.num(r, c), cx: x, cz: z, r: k.d / 2 })));
    d.zs.forEach((z, r) => d.xs.forEach((x, c) => TANQUES.push({ q: 'S' + m.n + ' D' + d.num(r, c), cx: x, cz: z, r: d.d / 2, desove: true })));
  } else tanquesDeSala(m).forEach(({ x, z, num }) => TANQUES.push({ q: 'S' + m.n + ' T' + num, x0: x - .15, z0: z - .15, x1: x + m.L + .15, z1: z + m.W + .15 }));
});
// el canal sedimentador no cuenta: en la maqueta es una franja baja y transitable (un caminante va por él y lo alumbran dos postes)
OTHERS.filter((o) => o[5] !== 'canal').forEach((o) => EDIFICIOS.push({ q: o[6], b: o.slice(0, 4) }));
/** Los tanques que pisa el punto (x, z) del plano con un margen `h`. */
const tanquesEn = (x, z, h) => TANQUES.filter((t) => (t.r != null ? Math.hypot(x - t.cx, z - t.cz) < t.r + h
  : x > t.x0 - h && x < t.x1 + h && z > t.z0 - h && z < t.z1 + h)).map((t) => t.q);
const edificiosEn = (x, z, h) => EDIFICIOS.filter(({ b }) => x > b[0] - h && x < b[2] + h && z > b[1] - h && z < b[3] + h).map((e) => e.q);

async function montar() {
  const desde = escenas.length;
  document.body.innerHTML = '<div id="r"></div>';
  const root = document.getElementById('r');
  plantaView(root);
  for (let i = 0; i < 400 && !root.querySelector('#vp') && !root.querySelector('.empty-state'); i++) await new Promise((r) => setTimeout(r, 50));
  expect(root.querySelector('.empty-state'), 'la maqueta se montó').toBeNull();
  const nuevas = escenas.slice(desde);
  const piezas = (e) => { let n = 0; e.traverse(() => { n++; }); return n; };
  return nuevas.reduce((a, e) => (piezas(e) > piezas(a) ? e : a), nuevas[0]);
}
/** Las instancias de las mallas que cumplen `es`: [{ x, z (del plano), sx, sy, sz }]. */
function instancias(escena, es) {
  const out = [], m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  escena.traverse((o) => {
    if (!o.isInstancedMesh || !es(o)) return;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.decompose(p, q, s); out.push({ i, x: p.x + C0[0], z: p.z + C0[1], sx: s.x, sy: s.y, sz: s.z }); }
  });
  return out;
}
const cilindro = (rArriba, rAbajo) => (o) => o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === rArriba && o.geometry.parameters.radiusBottom === rAbajo;

const matchMediaOriginal = window.matchMedia;
afterEach(() => { window.matchMedia = matchMediaOriginal; });

describe('🏭 Planta · A33: los postes, los caminantes y la mesa, fuera de los tanques; el logo; movimiento reducido', { timeout: 120000 }, () => {
  it('🔴 ningún poste de luz dentro de un tanque ni de un edificio (había uno en el tanque 10 de M7)', async () => {
    const escena = await montar();
    const postes = instancias(escena, cilindro(.08, .12));
    expect(postes.length).toBeGreaterThan(10);
    const mal = postes.map((p) => [p.x.toFixed(1) + ' · ' + p.z.toFixed(1), tanquesEn(p.x, p.z, .2).concat(edificiosEn(p.x, p.z, .2))]).filter(([, l]) => l.length);
    expect(mal).toEqual([]);
  });

  it('🔴 ningún recorrido de caminante pisa un tanque (M10 pisaba los tanques 9 y 10; la Sala 1, los de desove)', () => {
    const mal = [];
    PATHS.forEach(([a, b], k) => {
      const pisa = new Set();
      for (let j = 0; j <= 400; j++) { const u = j / 400; tanquesEn(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, .25).forEach((q) => pisa.add(q)); }
      if (pisa.size) mal.push(k + ': ' + [...pisa].join(', '));
    });
    expect(mal).toEqual([]);
  });

  it('🔴 la mesa de trabajo de la zona de desove no toca ningún tanque (estaba sobre D1 y D6)', async () => {
    const escena = await montar();
    const mesas = instancias(escena, (o) => o.geometry.type === 'BoxGeometry').filter((m) => Math.abs(m.sx - 3.2) < 1e-6 && Math.abs(m.sy - .06) < 1e-6 && Math.abs(m.sz - .8) < 1e-6);
    expect(mesas).toHaveLength(1);
    const [m] = mesas, pisa = new Set();
    for (let i = 0; i <= 16; i++) for (let j = 0; j <= 8; j++) tanquesEn(m.x - 1.6 + 3.2 * i / 16, m.z - .4 + .8 * j / 8, .1).forEach((q) => pisa.add(q));
    expect([...pisa]).toEqual([]);
    expect(edificiosEn(m.x, m.z, 0), 'dentro de la Sala 1').toEqual(['S1']);
  });

  it('🔴 el letrero de la entrada carga el logo de la app y se redibuja al llegar', async () => {
    imagenes.length = 0;
    await montar();
    const logo = imagenes.find((i) => /logo/.test(i.src));
    expect(logo, 'una imagen con el logo').toBeTruthy();
    expect(typeof logo.onload).toBe('function');
  });

  it('🔴 con movimiento reducido, al llegar los datos se quitan los caminantes de los módulos sin cultivo y las burbujas de los tanques sin animales', async () => {
    window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    const escena = await montar();
    const vista = vistas.at(-1);
    const enModulo = ([a, b]) => LARV.some((m) => { const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2; return x > m.box[0] && x < m.box[2] && z > m.box[1] && z < m.box[3]; });
    const cuerpos = () => instancias(escena, cilindro(.2, .24));
    const deModulo = (l) => l.filter((c) => enModulo(PATHS[c.i % PATHS.length]));
    expect(deModulo(cuerpos()).length, 'hay caminantes en módulos').toBeGreaterThan(0);
    expect(deModulo(cuerpos()).every((c) => c.sx > 0), 'al montar, sin datos, se ven').toBe(true);
    // Sin ningún módulo en cultivo ni animales en las salas
    vista.pintarEstado({ modulos: {}, resumen: null, mad: { salas: {} }, cifras: null, crono: null, blowers: null, mes: null });
    expect(deModulo(cuerpos()).map((c) => c.sx)).toEqual(deModulo(cuerpos()).map(() => 0));
    expect(cuerpos().filter((c) => !enModulo(PATHS[c.i % PATHS.length])).every((c) => c.sx > 0), 'los de fuera de los módulos siguen').toBe(true);
    // Burbujas: en los tanques de maduración de la Sala 1, sin animales, casi nada (1e-4); en los de desove, sí
    const burbujas = instancias(escena, (o) => o.geometry.type === 'CircleGeometry' && o.geometry.parameters.segments === 10);
    const S1 = TANQUES.filter((t) => t.q.startsWith('S1 '));
    const deTanque = (b) => S1.find((t) => Math.hypot(b.x - t.cx, b.z - t.cz) < t.r);
    const mad = burbujas.filter((b) => { const t = deTanque(b); return t && !t.desove; }), des = burbujas.filter((b) => { const t = deTanque(b); return t && t.desove; });
    expect(mad.length).toBeGreaterThan(0);
    expect(mad.every((b) => b.sx < 1e-3)).toBe(true);
    expect(des.length).toBeGreaterThan(0);
    expect(des.every((b) => b.sx > .01)).toBe(true);
  });
});
