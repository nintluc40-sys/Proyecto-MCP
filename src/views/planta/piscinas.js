/* ============================================================
   PLANTA · el PLANO de las piscinas de BROODSTOCK (M3, 2026-10-27; con su FORMA real, 2026-10-28, usuario). Módulo
   PURO: ni DOM ni datos.

   Lo pinta el modo «🦐 Broodstock» de 🏭 Planta (broodstock.js) como un mapa con aspecto de satélite. La geometría se
   MIDIÓ sobre las capturas de satélite que dio el usuario (`piscina.docx`, 27-10), con una rejilla encima, y está en
   sus píxeles: x hacia la derecha e y hacia abajo, como el SVG que la pinta. Las capturas NO se usan ni se guardan: el
   repo es público y son de Google. Lo que se ve (agua, tierra, relieve, vegetación) lo DIBUJA broodstock.js.
   Decisión del usuario (2026-10-28): «la forma de la captura». Todo el sector está girado unos 12°: la fila de San
   Rafael sube hacia la derecha con sus bordos perpendiculares; las nueve de Roche tienen los lados verticales y los
   bordos inclinados con esa misma pendiente; la 739 y las tres largas se alargan hacia la derecha (el camino de arriba
   sube y el de abajo baja).

   Las zonas y su numeración, como las dio el usuario:
     · San Rafael: 12 piscinas en fila, numeradas de DERECHA a IZQUIERDA desde la 761. En el documento, la 772 y la 771
       (las dos de la izquierda, secas en la foto) van rotuladas aparte; la ESTRECHA no es la 772 (la de la izquierda,
       ~70 de ancho) sino la 771, la 770 y la 769 (~40). (Aquí decía «las dos de la izquierda, más estrechas»: lo
       desmentían los propios bordes; lo encontró la Sesión A en su auditoría del 28-10.)
     · Roche: 9 piscinas en columna, numeradas de ARRIBA hacia ABAJO desde la 550; a su derecha, una piscina LARGA, la
       739, y otras 3 largas que aún no tienen nombre.
     · Niágara, en OTRO sector (la segunda captura): 5 piscinas sin nombre aún —dos recintos partidos por la mitad (cuatro
       piscinas, de dos en dos) y una más grande—. Se dibuja en un RECUADRO del mapa, como en los planos.
   Los nombres de zona y los números de piscina van en el código por decisión del usuario («son datos del plano»,
   27-10), como los módulos del laboratorio en `plano.js`. Una piscina sin nombre lleva `nombre: null` y un `id` propio:
   no se enlaza con ningún dato hasta que lo tenga (se le pone aquí).

   Cada piscina es un cuadrilátero convexo `poly` [[x, y] × 4] (en el sentido de las agujas del reloj, desde la esquina
   de arriba a la izquierda) y lleva su caja `rect` [x0, y0, x1, y1]. Cada zona, su `contorno` (la envolvente convexa de
   sus piscinas, con margen: lo que se toca en la vista general) y su `caja` (la de ese contorno: el encuadre al
   acercarse).
   ============================================================ */

const BORDO = 3.5;   // la mitad del bordo entre dos piscinas

/* ── geometría ─────────────────────────────────────────── */
const r1 = (v) => Math.round(v * 10) / 10;
const cajaDePuntos = (pts, m = 0) => [
  Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m,
  Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m,
];
/** El centro (centroide del área) de un polígono. */
export function centro(poly) {
  let a = 0, cx = 0, cy = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], k = p[0] * q[1] - q[0] * p[1];
    a += k; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k;
  });
  return [cx / (3 * a), cy / (3 * a)];
}
/** El área de un polígono (fórmula del cordón). */
export function area(poly) {
  return Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
}
/** La envolvente convexa (cadena monótona). */
function envolvente(pts) {
  const p = pts.map((x) => [x[0], x[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lado = (lista) => { const h = []; lista.forEach((q) => { while (h.length >= 2 && cruz(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }); h.pop(); return h; };
  return lado(p).concat(lado(p.slice().reverse()));
}
/** Un polígono CONVEXO ensanchado `m` hacia fuera: cada lado se corre `m` y se cortan los vecinos. */
export function ensanchar(poly, m) {
  const c = centro(poly);
  const lineas = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
    let nx = dy / l, ny = -dx / l;
    if ((p[0] - c[0]) * nx + (p[1] - c[1]) * ny < 0) { nx = -nx; ny = -ny; }
    return { p: [p[0] + nx * m, p[1] + ny * m], d: [dx, dy] };
  });
  return lineas.map((a, i) => {
    const b = lineas[(i + lineas.length - 1) % lineas.length];   // el lado anterior: se cortan en el vértice i
    const det = b.d[0] * a.d[1] - b.d[1] * a.d[0];
    const t = ((a.p[0] - b.p[0]) * a.d[1] - (a.p[1] - b.p[1]) * a.d[0]) / det;
    return [r1(b.p[0] + b.d[0] * t), r1(b.p[1] + b.d[1] * t)];
  });
}
const mover = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/* ── San Rafael: la fila, girada; los bordos, de borde a borde ── */
const SR_ARRIBA = (x) => 236 - 0.2136 * (x - 70);   // el borde de arriba de la fila
const SR_ABAJO = (x) => 340 - 0.2307 * (x - 75);    // y el de abajo
// cada bordo, por dónde corta el borde de arriba y el de abajo (de izquierda a derecha; el primero y el último, los extremos)
const SR_BORDOS = [[68, 74], [138, 146], [178, 186], [215, 225], [255, 267], [330, 340], [403, 412], [482, 492],
  [552, 565], [627, 642], [715, 725], [802, 807], [880, 877]];
const SAN_RAFAEL = SR_BORDOS.slice(0, -1).map(([a, b], i) => {
  const [c, d] = SR_BORDOS[i + 1];
  const x0 = a + BORDO, x1 = c - BORDO, x3 = b + BORDO, x2 = d - BORDO;
  return [[x0, SR_ARRIBA(x0)], [x1, SR_ARRIBA(x1)], [x2, SR_ABAJO(x2)], [x3, SR_ABAJO(x3)]].map((p) => p.map(r1));
});
const PRIMERA_SAN_RAFAEL = 761;   // la de la DERECHA

/* ── Roche: la columna (lados verticales, bordos inclinados) y las largas ── */
const ROCHE_X = [52, 182], ROCHE_PENDIENTE = -0.22, ROCHE_ARRIBA = 402, ROCHE_ALTO = 43.7;
const ROCHE = Array.from({ length: 9 }, (_, i) => {
  const y0 = ROCHE_ARRIBA + i * ROCHE_ALTO, y1 = y0 + ROCHE_ALTO, dr = ROCHE_PENDIENTE * (ROCHE_X[1] - ROCHE_X[0]);
  return [[ROCHE_X[0], y0 + BORDO], [ROCHE_X[1], y0 + dr + BORDO], [ROCHE_X[1], y1 + dr - BORDO], [ROCHE_X[0], y1 - BORDO]].map((p) => p.map(r1));
});
const PRIMERA_ROCHE = 550;   // la de ARRIBA
const LARGA_739 = [[205, 357], [273, 343], [273, 809], [205, 795]];
const LARGAS_SIN_NOMBRE = [
  [[288, 341], [352, 328], [343, 846], [284, 834]],
  [[366, 325], [426, 313], [406, 859], [350, 847]],
  [[439, 310], [507, 296], [491, 875], [414, 859]],
];

/* ── Niágara: medida en la segunda captura y llevada al RECUADRO (abajo a la derecha del mapa) ── */
const NIAGARA_DX = 534, NIAGARA_DY = 486;
const NIAGARA = [
  [[86, 150], [155.5, 149], [157.5, 359], [87, 356]], [[158.5, 149], [227, 147], [229, 361], [160.5, 359]],   // recinto 1, partido
  [[234, 147], [293, 145], [305, 366], [235, 363]], [[295, 145], [367, 141], [369, 377], [307, 366]],         // recinto 2, partido
  [[373, 136], [515, 129], [516, 398], [374, 382]],                                                         // la grande
].map((p) => mover(p, NIAGARA_DX, NIAGARA_DY));
/** El recuadro de Niágara (otro sector) dentro del mapa: [x0, y0, x1, y1]. */
export const RECUADRO_NIAGARA = Object.freeze([598, 582, 1072, 904]);

/* ── piscinas y zonas ──────────────────────────────────── */
/* `bordo`: la piscina con su bordo de tierra alrededor (el mapa lo pinta debajo, en relieve). */
const piscina = (id, nombre, poly, extra = {}) => Object.freeze({
  id, nombre, poly: Object.freeze(poly.map((p) => Object.freeze(p))), rect: Object.freeze(cajaDePuntos(poly)),
  bordo: Object.freeze(ensanchar(poly, 5)), ...extra,
});
const zona = (id, nombre, piscinas, extra = {}) => {
  const contorno = ensanchar(envolvente(piscinas.flatMap((p) => p.poly)), 14);
  return Object.freeze({ id, nombre, piscinas: Object.freeze(piscinas), contorno: Object.freeze(contorno),
    caja: Object.freeze(cajaDePuntos(contorno, 16)), ...extra });
};

/** Las tres zonas, con sus piscinas. `aparte`: está en otro sector (el mapa la dibuja en su recuadro y lo dice).
    `rotulo`: dónde va su nombre en la vista general (medido: sobre la piscina grande, sobre el camino, en el recuadro). */
export const ZONAS = Object.freeze([
  zona('san-rafael', 'San Rafael', SAN_RAFAEL.map((r, i) => {
    const n = String(PRIMERA_SAN_RAFAEL + (SAN_RAFAEL.length - 1 - i));   // de derecha a izquierda
    return piscina(n, n, r);
  }), { rotulo: [64, 210] }),
  zona('roche', 'Roche', [
    ...ROCHE.map((r, i) => { const n = String(PRIMERA_ROCHE + i); return piscina(n, n, r); }),   // de arriba abajo
    piscina('739', '739', LARGA_739, { larga: true }),
    ...LARGAS_SIN_NOMBRE.map((r, i) => piscina('roche-sn-' + (i + 1), null, r, { larga: true })),
  ], { rotulo: [50, 390] }),
  zona('niagara', 'Niágara', NIAGARA.map((r, i) => piscina('niagara-sn-' + (i + 1), null, r)), { aparte: true, rotulo: [610, 606] }),
]);

/** La caja de TODO el mapa (la vista general): la de las dos capturas, con el recuadro de Niágara dentro. */
export const CAJA_GENERAL = Object.freeze([30, 34, 1100, 910]);
/** La tierra de fondo, más ancha que la vista general: al acercarse a una zona estrecha, el SVG conserva su proporción y
    enseña lo que hay a los lados; sin esto, allí no había nada que pintar (una franja negra). */
export const TIERRA = Object.freeze([-260, -80, 1390, 1030]);

/* ── el ENTORNO: lo que se ve alrededor y no se toca (medido en las mismas capturas) ── */
/** Aguas (las piscinas grandes vecinas y los canales), caminos (líneas con su ancho) y vegetación, en el sector
    principal; y lo mismo del de Niágara, ya llevado a su recuadro. Sin datos: es el fondo del mapa. */
export const ENTORNO = Object.freeze({
  aguas: [
    [[30, 34], [1100, 34], [1100, 40], [892, 40], [70, 216], [30, 216]],                     // la grande, encima de San Rafael
    [[60, 349], [890, 162], [892, 178], [62, 365]],                                          // el canal bajo San Rafael
    [[30, 228], [43, 228], [45, 910], [30, 910]],                                            // el canal de la izquierda
    [[186, 388], [199, 385], [199, 798], [186, 798]],                                        // el canal entre la columna y la 739
    [[578, 292], [1100, 210], [1100, 395], [1018, 642], [848, 692], [640, 578]],             // las grandes de la derecha
    [[517, 298], [560, 291], [630, 583], [845, 700], [880, 910], [498, 910]],
  ],
  caminos: [
    { w: 9, p: [[52, 226], [890, 48]] },
    { w: 8, p: [[50, 374], [565, 286], [1100, 199]] },
    { w: 10, p: [[50, 220], [52, 910]] },
    { w: 8, p: [[48, 806], [205, 808], [560, 882]] },
    { w: 6, p: [[566, 292], [636, 580], [846, 696], [1020, 646], [1100, 410]] },
    { w: 5, p: [[192, 380], [192, 806]] },
  ],
  vegetacion: [
    [[30, 850], [210, 822], [560, 892], [560, 910], [30, 910]],
    [[892, 40], [1100, 40], [1100, 196], [905, 92]],
    [[860, 706], [1020, 652], [1100, 420], [1100, 910], [900, 910]],
  ],
  recuadro: {
    aguas: [mover([[140, 100], [560, 92], [560, 122], [150, 128]], NIAGARA_DX, NIAGARA_DY)],
    caminos: [{ w: 7, p: mover([[64, 136], [530, 120]], NIAGARA_DX, NIAGARA_DY) }, { w: 7, p: mover([[64, 136], [70, 408]], NIAGARA_DX, NIAGARA_DY) },
      { w: 7, p: mover([[70, 404], [530, 412]], NIAGARA_DX, NIAGARA_DY) }],
    vegetacion: [mover([[64, 410], [535, 416], [535, 440], [64, 440]], NIAGARA_DX, NIAGARA_DY)],   // (se recorta al recuadro)
  },
});

/** El nombre de una piscina tal como lo compara el mapa: como texto y sin espacios (la misma forma que `normPiscina`
 *  de la carga de Broodstock, que la guarda así porque el Excel la trae unas veces como número y otras como texto). */
export const nombreDePiscina = (v) => String(v == null ? '' : v).replace(/\s+/g, '');

const ZONA_POR_PISCINA = new Map(ZONAS.flatMap((z) => z.piscinas.filter((p) => p.nombre).map((p) => [p.nombre, z.id])));

/** La zona de una piscina por su nombre (`null` si no está en el plano: se lista aparte, «fuera del mapa»). */
export function zonaDePiscina(nombre) {
  return ZONA_POR_PISCINA.get(nombreDePiscina(nombre)) || null;
}
