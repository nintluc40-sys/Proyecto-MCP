// @vitest-environment happy-dom
/* ============================================================
   PLANTA · la SEMILLA aleatoria de la maqueta no depende de cuántas áreas haya (Plan B · B0, 2026-10-19; tarea 30 de la
   ronda 2: «la reposición de la semilla no tiene prueba»). Cada fachada de edificio gasta números de la semilla común
   (escena.js · `rnd`), y al terminar las áreas `escena.js` la deja como si hubiera habido 11 fachadas
   (`semillaAntesDeAreas`, `RND_FACHADAS_DE_REFERENCIA`). Así, añadir, quitar o partir un área de `OTHERS` (plano.js) no
   mueve lo aleatorio de DESPUÉS: tintes de los tanques, burbujas, larvas, reproductores, arbustos…
   Aquí se monta la escena REAL en happy-dom, como en escena.cortina.test.js (three.js de verdad salvo el renderizador y el
   PMREM, que no hay WebGL), con `OTHERS` tal cual, con un edificio de más en medio y con uno de menos. La escena se arma
   entera al montar (los cuadros sólo la van descubriendo), así que se lee sin dibujar ningún cuadro: las matrices y los
   colores de TODAS sus mallas de instancias deben salir idénticos en los tres montajes.
   ============================================================ */
import { describe, it, expect, vi } from 'vitest';

const escenas = [];
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
    render() {}
    getPixelRatio() { return this.dpr; }
    setPixelRatio(d) { this.dpr = d; }
    setSize() {}
    dispose() {}
  }
  class PMREMFalso { fromScene() { return { texture: new T.Texture(), dispose() {} }; } compileEquirectangularShader() {} dispose() {} }
  // Cada escena que se crea queda apuntada, para leerla recién armada.
  class EscenaEspia extends T.Scene { constructor(...a) { super(...a); escenas.push(this); } }
  return { ...T, WebGLRenderer: RendererFalso, PMREMGenerator: PMREMFalso, Scene: EscenaEspia };
});
// `OTHERS` es un arreglo propio de la prueba (una copia del de plano.js) que se cambia EN SU SITIO entre montajes.
const plano = { original: null, otras: null };
vi.mock('./plano.js', async (original) => {
  const P = await original();
  plano.original = P.OTHERS; plano.otras = [...P.OTHERS];
  return { ...P, OTHERS: plano.otras };
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
globalThis.requestAnimationFrame = () => 1;   // ningún cuadro: la escena se lee recién armada
globalThis.cancelAnimationFrame = () => {};
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const { plantaView } = await import('./index.js');
await import('./plano.js');   // crea ya el doble de plano.js (escena.js lo importa después, en su bloque diferido)

/** Monta la maqueta con `otras` como OTHERS y devuelve su escena (la mayor de las creadas en el montaje). */
async function montarCon(otras) {
  plano.otras.splice(0, plano.otras.length, ...otras);
  const desde = escenas.length;
  document.body.innerHTML = '<div id="r"></div>';
  const root = document.getElementById('r');
  plantaView(root);
  // la escena llega en su propio bloque diferido (import de escena.js y three)
  for (let i = 0; i < 400 && !root.querySelector('#vp') && !root.querySelector('.empty-state'); i++) await new Promise((r) => setTimeout(r, 50));
  expect(root.querySelector('.empty-state'), 'la maqueta se montó (sin el cartel «No se pudo mostrar»)').toBeNull();
  const nuevas = escenas.slice(desde);
  const piezas = (e) => { let n = 0; e.traverse(() => { n++; }); return n; };
  return nuevas.reduce((a, e) => (piezas(e) > piezas(a) ? e : a), nuevas[0]);
}
/** Lo aleatorio de la escena: matrices y colores de cada malla de instancias, en orden. */
function instancias(escena) {
  const lista = [];
  escena.traverse((o) => {
    if (o.isInstancedMesh) lista.push(o.count + '|' + o.instanceMatrix.array.join(',') + '|' + (o.instanceColor ? o.instanceColor.array.join(',') : '-'));
  });
  return lista;
}
const areas = (escena, nombre) => { let n = 0; escena.traverse((o) => { if (o.userData && o.userData.area === nombre) n++; }); return n; };
const distintas = (a, b) => a.map((x, i) => (x === b[i] ? null : i)).filter((i) => i !== null);

describe('🏭 Planta · la semilla de la maqueta no depende de cuántas áreas haya (Plan B · B0; tarea 30)', { timeout: 120000 }, () => {
  it('🔴 un edificio de MÁS en medio de OTHERS, o uno de MENOS, no cambia nada aleatorio de lo de después', async () => {
    const base = await montarCon(plano.original);
    const ref = instancias(base);
    expect(ref.length, 'control: la escena tiene sus mallas de instancias (tanques, burbujas, arbustos…)').toBeGreaterThan(10);

    // Un edificio sin forma, lejos de todo, insertado en MEDIO de la lista: su fachada gasta números de la semilla.
    const EXTRA = 'Edificio de prueba · semilla';
    const k = plano.original.findIndex((o) => o[6] === 'Sala de carboys · y sala de UV');
    expect(k, 'control: el punto de inserción existe y está en medio').toBeGreaterThan(5);
    const conUno = await montarCon([...plano.original.slice(0, k), [300, 300, 312, 310, 6, 'bld', EXTRA, null, '#e7eef0'], ...plano.original.slice(k)]);
    expect(areas(conUno, EXTRA), 'control: el edificio de más SÍ está en la escena').toBe(1);
    expect(areas(base, EXTRA), 'control: y no estaba antes').toBe(0);
    const masUno = instancias(conUno);
    expect(masUno.length).toBe(ref.length);
    expect(distintas(ref, masUno), 'mallas de instancias que cambiaron con un edificio de MÁS').toEqual([]);

    // Uno de menos: un edificio sin forma (sólo su caja y su fachada).
    const QUITADO = 'Edificio de servicio';
    const sinUno = await montarCon(plano.original.filter((o) => o[6] !== QUITADO));
    expect(areas(base, QUITADO), 'control: el edificio quitado estaba').toBe(1);
    expect(areas(sinUno, QUITADO), 'control: y ya no está').toBe(0);
    const menosUno = instancias(sinUno);
    expect(menosUno.length).toBe(ref.length);
    expect(distintas(ref, menosUno), 'mallas de instancias que cambiaron con un edificio de MENOS').toEqual([]);
  });
});
