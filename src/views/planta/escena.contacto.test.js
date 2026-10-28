// @vitest-environment happy-dom
/* ============================================================
   PLANTA · las SOMBRAS DE CONTACTO de la maqueta (calidad visual, 2026-10-27, usuario: «Sombras de contacto»). Un anillo en
   el suelo al pie de cada edificio y depósito de `OTHERS`, de cada módulo y sala y de cada tramo del cerco: alfa
   ALFA_CONTACTO junto al muro y 0 a su margen (0,6–2,4 m, crece con el alto), todo en UNA malla por grupo.
   Aquí, el arnés de escena.semilla.test.js (la escena REAL en happy-dom, three.js de verdad salvo el renderizador y el
   PMREM), recién armada. Lo que se exige:
   · dos mallas de contacto: la de las otras áreas DENTRO de su grupo (la casilla «Otras áreas» las oculta juntas) y la de
     cerco, módulos y salas en la escena;
   · un anillo por pie, con el número exacto de pies (un edificio de más en `OTHERS` suma uno) y la forma de anillo:
     el borde de dentro opaco, el de fuera transparente y fuera del de dentro por su margen;
   · materiales que no escriben profundidad y no ensucian el suelo (transparente, polygonOffset).
   Y del mismo pedido («Tonos de techo», «Suelo con desgaste»): cada techo de edificio lleva un tono FIJO por su nombre
   (con un edificio de más en medio de `OTHERS`, los demás no cambian de tono) y sobre el predio hay UNA capa de desgaste,
   iluminada y sin escribir profundidad.
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';

const escenas = [];
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
const plano = { original: null, otras: null };
vi.mock('./plano.js', async (original) => {
  const P = await original();
  plano.original = P.OTHERS; plano.otras = [...P.OTHERS]; plano.LARV = P.LARV; plano.MAT = P.MAT;
  return { ...P, OTHERS: plano.otras };
});
vi.mock('./analisis.js', () => ({ montarAnalisis: () => ({ pintarEstado() {}, aviso() {}, alElegirMes() {} }) }));
vi.mock('../../core/refresh.js', () => ({ asegurarLibro: vi.fn() }));
vi.mock('./estado.js', () => ({
  estadoPlantaPorPartes: () => new Promise(() => {}),
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
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const { plantaView } = await import('./index.js');
await import('./plano.js');

async function montarCon(otras) {
  plano.otras.splice(0, plano.otras.length, ...otras);
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
/** Las mallas de contacto: las de color por vértice CON alfa (4 componentes). */
const contactos = (escena) => { const l = []; escena.traverse((o) => { const c = o.isMesh && o.geometry.attributes.color; if (c && c.itemSize === 4) l.push(o); }); return l; };
/** Los anillos de una malla: 8 vértices cada uno (4 del borde de dentro y 4 del de fuera). */
function anillos(malla) {
  const p = malla.geometry.attributes.position.array, c = malla.geometry.attributes.color.array, out = [];
  for (let v = 0; v < p.length / 3; v += 8) {
    const pt = (k) => ({ x: p[(v + k) * 3], y: p[(v + k) * 3 + 1], z: p[(v + k) * 3 + 2], a: c[(v + k) * 4 + 3] });
    out.push({ dentro: [0, 1, 2, 3].map(pt), fuera: [4, 5, 6, 7].map(pt) });
  }
  return out;
}
const piesDeOtras = (otras) => otras.filter((o) => o[5] === 'bld' || o[5] === 'res').length;

describe('🏭 Planta · calidad visual (2026-10-27): sombras de contacto, tonos de techo y desgaste del suelo', { timeout: 120000 }, () => {
  it('🔴 dos mallas: la de las otras áreas DENTRO de su grupo, la de cerco, módulos y salas en la escena; un anillo por pie', async () => {
    const escena = await montarCon(plano.original);
    const mallas = contactos(escena);
    expect(mallas.length, 'una malla por grupo, no una por pie').toBe(2);
    const enEscena = mallas.filter((m) => m.parent === escena), enGrupo = mallas.filter((m) => m.parent !== escena);
    expect(enEscena.length).toBe(1); expect(enGrupo.length).toBe(1);
    expect(enGrupo[0].parent.parent, 'el grupo de las otras áreas cuelga de la escena').toBe(escena);
    expect(anillos(enGrupo[0]).length, 'un anillo por edificio o depósito de OTHERS').toBe(piesDeOtras(plano.original));
    expect(anillos(enEscena[0]).length, 'un anillo por tramo del cerco (5), módulo y sala').toBe(5 + plano.LARV.length + plano.MAT.length);

    // un edificio de más en OTHERS suma exactamente un anillo, y en el grupo de las otras áreas
    const conUno = await montarCon([...plano.original, [300, 300, 312, 310, 6, 'bld', 'Edificio de prueba · contacto', null, '#e7eef0']]);
    const [g2] = contactos(conUno).filter((m) => m.parent !== conUno);
    expect(anillos(g2).length).toBe(piesDeOtras(plano.original) + 1);
  });

  it('🔴 cada anillo: opaco junto al muro, transparente a su margen, en el suelo y por fuera del pie', async () => {
    const escena = await montarCon(plano.original);
    const todos = contactos(escena).flatMap(anillos);
    expect(todos.length).toBeGreaterThan(20);
    for (const { dentro, fuera } of todos) {
      dentro.forEach((v) => expect(v.a).toBeCloseTo(.42, 5));
      fuera.forEach((v) => expect(v.a).toBe(0));
      [...dentro, ...fuera].forEach((v) => expect(v.y).toBeCloseTo(.045, 5));
      const xs = (l) => l.map((v) => v.x), zs = (l) => l.map((v) => v.z);
      const margen = Math.min(...xs(dentro)) - Math.min(...xs(fuera));
      expect(margen, 'margen entre 0,6 y 2,4 m').toBeGreaterThanOrEqual(.6 - 1e-6);
      expect(margen).toBeLessThanOrEqual(2.4 + 1e-6);
      // la geometría es de 32 bits: a 100 m del centro, unos micrómetros de redondeo
      expect(Math.max(...xs(fuera)) - Math.max(...xs(dentro))).toBeCloseTo(margen, 3);
      expect(Math.min(...zs(dentro)) - Math.min(...zs(fuera))).toBeCloseTo(margen, 3);
      expect(Math.max(...zs(fuera)) - Math.max(...zs(dentro))).toBeCloseTo(margen, 3);
    }
  });

  it('🔴 cada techo de edificio, con su tono por NOMBRE: un edificio de más en medio no cambia el de los demás', async () => {
    const techos = (escena) => {
      const [malla] = contactos(escena).filter((m) => m.parent !== escena), l = [];
      malla.parent.children.forEach((o) => { if (o.isMesh && Array.isArray(o.material) && o.material.length === 6 && o.geometry.type === 'BoxGeometry') l.push(o.material[2].color.getHexString()); });
      return l;
    };
    const base = techos(await montarCon(plano.original));
    expect(base.length, 'un techo por edificio de OTHERS').toBe(plano.original.filter((o) => o[5] === 'bld').length);
    expect(new Set(base).size, 'ya no todos iguales').toBeGreaterThanOrEqual(3);
    const k = plano.original.findIndex((o) => o[6] === 'Sala de carboys · y sala de UV');
    const enMedio = plano.original.slice(0, k).filter((o) => o[5] === 'bld').length;
    const con = techos(await montarCon([...plano.original.slice(0, k), [300, 300, 312, 310, 6, 'bld', 'Edificio de prueba · techo', null, '#e7eef0'], ...plano.original.slice(k)]));
    expect(con.length).toBe(base.length + 1);
    expect([...con.slice(0, enMedio), ...con.slice(enMedio + 1)], 'los demás conservan su tono').toEqual(base);
  });

  it('🔴 una capa de desgaste sobre TODO el predio: iluminada (sigue la hora y las sombras), con su textura, sin escribir profundidad', async () => {
    const escena = await montarCon(plano.original);
    const { SITE } = await import('./plano.js');
    const capas = [];
    escena.traverse((o) => { const p = o.geometry && o.geometry.parameters; if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.material.transparent && Math.abs(p.width - (SITE[2] - SITE[0])) < 1e-6 && Math.abs(p.height - (SITE[3] - SITE[1])) < 1e-6) capas.push(o); });
    expect(capas.length).toBe(1);
    const [c] = capas;
    expect(c.material.isMeshStandardMaterial, 'iluminada: una básica clara brillaría de noche').toBe(true);
    expect(c.material.map && c.material.map.isCanvasTexture).toBe(true);
    expect(c.material.depthWrite).toBe(false);
    expect(c.material.polygonOffset).toBe(true);
    expect(c.receiveShadow).toBe(true);
    expect(c.position.y).toBeCloseTo(.016, 5);
  });

  it('el material no escribe profundidad ni parpadea con el suelo', async () => {
    const escena = await montarCon(plano.original);
    for (const m of contactos(escena)) {
      expect(m.material.transparent).toBe(true);
      expect(m.material.depthWrite).toBe(false);
      expect(m.material.vertexColors).toBe(true);
      expect(m.material.polygonOffset).toBe(true);
      expect(m.castShadow).toBe(false);
    }
  });
});
