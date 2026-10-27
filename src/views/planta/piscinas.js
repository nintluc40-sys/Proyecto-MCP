/* ============================================================
   PLANTA · el PLANO de las piscinas de BROODSTOCK (M3, 2026-10-27, usuario). Módulo PURO: ni DOM ni datos.

   Lo pinta el modo «🦐 Broodstock» de 🏭 Planta (broodstock.js): un mapa 2D, tipo tablero, de las piscinas donde
   crecen los reproductores antes de entrar a Maduración. Es un ESQUEMA, no un plano a escala: las posiciones se
   trazaron sobre las capturas de satélite que dio el usuario (`piscina.docx`, 27-10) y se enderezaron (en la foto, la
   fila de San Rafael va inclinada). Las capturas NO se usan ni se guardan: el repo es público y son de Google.

   Las zonas y su numeración, como las dio el usuario:
     · San Rafael: 12 piscinas en fila, numeradas de DERECHA a IZQUIERDA desde la 761.
     · Roche: 9 piscinas en columna, numeradas de ARRIBA hacia ABAJO desde la 550; a su derecha, una piscina LARGA, la
       739, y otras 3 largas que aún no tienen nombre.
     · Niágara, en OTRO sector: 5 piscinas sin nombre aún —una más grande y cuatro que van de dos en dos, cada pareja
       en un mismo recinto partido por la mitad—.
   Los nombres de zona y los números de piscina van en el código por decisión del usuario («son datos del plano»,
   27-10), como los módulos del laboratorio en `plano.js`. Una piscina sin nombre lleva `nombre: null` y un `id` propio:
   no se enlaza con ningún dato hasta que lo tenga (se le pone aquí).

   Coordenadas: unidades del esquema (≈ píxeles de la captura), x hacia la derecha e y hacia abajo, como el SVG que las
   pinta. Cada piscina es un rectángulo [x0, y0, x1, y1].
   ============================================================ */

const HUECO = 4;   // el bordo entre dos piscinas
const PAREJA = 1.5;   // la división dentro de un mismo recinto (Niágara)

/** Piscinas en FILA: `bordes` en x (de izquierda a derecha), todas entre y0 e y1. */
const enFila = (bordes, y0, y1) => bordes.slice(0, -1).map((x, i) => [x + HUECO / 2, y0, bordes[i + 1] - HUECO / 2, y1]);
/** Piscinas en COLUMNA: `bordes` en y (de arriba abajo), todas entre x0 y x1. */
const enColumna = (bordes, x0, x1) => bordes.slice(0, -1).map((y, i) => [x0, y + HUECO / 2, x1, bordes[i + 1] - HUECO / 2]);

// San Rafael: la fila de arriba. De izquierda a derecha (las dos de la izquierda, más estrechas: 772 y 771).
const SAN_RAFAEL = enFila([70, 145, 185, 225, 265, 337, 412, 488, 562, 637, 722, 808, 880], 150, 250);
const PRIMERA_SAN_RAFAEL = 761;   // la de la DERECHA
// Roche: la columna de la izquierda, de arriba abajo; la 739 y las tres largas, a su derecha.
const ROCHE = enColumna([330, 385, 440, 495, 550, 605, 660, 715, 770, 835], 55, 185);
const PRIMERA_ROCHE = 550;   // la de ARRIBA
const LARGA_739 = [205, 330, 280, 835];
const LARGAS_SIN_NOMBRE = enFila([288, 362, 436, 510], 330, 835);
// Niágara: otro sector, pintado aparte. Dos recintos partidos en dos (cuatro piscinas) y la más grande.
const NIAGARA = [
  [660, 450, 720 - PAREJA / 2, 650], [720 + PAREJA / 2, 450, 780, 650],
  [780 + HUECO, 450, 840 - PAREJA / 2, 650], [840 + PAREJA / 2, 450, 900, 650],
  [900 + HUECO * 2, 440, 1010, 660],
];

const piscina = (id, nombre, rect, extra = {}) => Object.freeze({ id, nombre, rect: Object.freeze(rect), ...extra });
const cajaDe = (rects, margen) => [
  Math.min(...rects.map((r) => r[0])) - margen, Math.min(...rects.map((r) => r[1])) - margen,
  Math.max(...rects.map((r) => r[2])) + margen, Math.max(...rects.map((r) => r[3])) + margen,
];
const zona = (id, nombre, piscinas, extra = {}) => Object.freeze({
  id, nombre, piscinas: Object.freeze(piscinas), caja: Object.freeze(cajaDe(piscinas.map((p) => p.rect), 22)), ...extra,
});

/** Las tres zonas, con sus piscinas. `aparte`: está en otro sector (el mapa la dibuja separada y lo dice). */
export const ZONAS = Object.freeze([
  zona('san-rafael', 'San Rafael', SAN_RAFAEL.map((r, i) => {
    const n = String(PRIMERA_SAN_RAFAEL + (SAN_RAFAEL.length - 1 - i));   // de derecha a izquierda
    return piscina(n, n, r);
  })),
  zona('roche', 'Roche', [
    ...ROCHE.map((r, i) => { const n = String(PRIMERA_ROCHE + i); return piscina(n, n, r); }),   // de arriba abajo
    piscina('739', '739', LARGA_739, { larga: true }),
    ...LARGAS_SIN_NOMBRE.map((r, i) => piscina('roche-sn-' + (i + 1), null, r, { larga: true })),
  ]),
  zona('niagara', 'Niágara', NIAGARA.map((r, i) => piscina('niagara-sn-' + (i + 1), null, r)), { aparte: true }),
]);

/** La caja de TODO el esquema (la vista general), con sitio arriba para el título de cada zona (va encima de su marco). */
export const CAJA_GENERAL = Object.freeze(((c) => [c[0], c[1] - 24, c[2], c[3]])(cajaDe(ZONAS.map((z) => z.caja), 10)));

/** El nombre de una piscina tal como lo compara el mapa: como texto y sin espacios (la misma forma que `normPiscina`
 *  de la carga de Broodstock, que la guarda así porque el Excel la trae unas veces como número y otras como texto). */
export const nombreDePiscina = (v) => String(v == null ? '' : v).replace(/\s+/g, '');

const ZONA_POR_PISCINA = new Map(ZONAS.flatMap((z) => z.piscinas.filter((p) => p.nombre).map((p) => [p.nombre, z.id])));

/** La zona de una piscina por su nombre (`null` si no está en el plano: se lista aparte, «fuera del mapa»). */
export function zonaDePiscina(nombre) {
  return ZONA_POR_PISCINA.get(nombreDePiscina(nombre)) || null;
}
