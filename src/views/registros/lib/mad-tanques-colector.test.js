/* ============================================================
   LA GRILLA DIARIA DE TANQUES RECOGE LO QUE PINTA

   ⚠⚠ NACE DE UN DEFECTO REAL Y SILENCIOSO, encontrado el 2026-09-08 al retirar la columna
   «Relación H:M» que pidió el usuario. El recolector `_collectTanquesGrid` iteraba
   `_TANQ_GRID_NUM_KEYS`, que es `_TANQ_GRID_COLS.filter(c => c.type === "int")`. Es decir:
   recogía SÓLO las columnas enteras. Quedaban fuera

     · `peso_machos` y `peso_hembras`  (type "num", decimales)
     · `obs_sanitarias`                (type "text")

   los TRES campos que el usuario había pedido esa misma noche. Se pintaban, se tecleaban,
   tenían su celda reservada en el payload… y llegaban `undefined`: la hoja recibía la celda
   vacía, siempre, sin un solo error en pantalla.

   🔑 POR QUÉ NO LO VIO NADIE. Esta grilla vive ÚNICAMENTE en el monolito —no tiene gemelo en
   `src/`, así que ninguna prueba de paridad la mira— y `engine.js` está fuera de ESLint y de
   vitest. La suite entera, el lint y las tres copias «a la par» convivieron con ello. Es la
   clase de defecto más cara de este proyecto: el dato que no llega y nadie ve.

   Esta prueba es ESTRUCTURAL, como `handlers-existen`: lee el fuente y comprueba la forma,
   sin arrancar el monolito. Barata, y cubre la familia entera en vez del caso concreto.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const src = readFileSync(ENGINE, 'utf8').split('\r\n').join('\n');

/** Trozo entre dos anclas. El ancla de FIN cierra en la última sentencia del bloque, no en
 *  la primera línea del vecino: anclar en el vecino convierte cualquier cambio suyo en una
 *  avería de este instrumento. */
function bloque(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 50));
  const j = src.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 50));
  return src.slice(i, j + hasta.length);
}

/** Las claves declaradas en `_TANQ_GRID_COLS`, en su orden. */
function columnas() {
  const b = bloque('const _TANQ_GRID_COLS = [', '\n];');
  return [...b.matchAll(/\{\s*k:\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

const colector = () => bloque('function _collectTanquesGrid(', '\n  return result;\n}');
const payload = () => bloque('if(ficha === "tanques"){', '\n  }');

describe('Maduración · la grilla diaria de Tanques recoge lo que pinta', () => {
  /* ⚠ El fixture prueba algo: si `columnas()` devolviera [] por un cambio de forma, todas las
     comprobaciones de abajo pasarían VACÍAS y en verde. */
  it('las columnas se leen de verdad del fuente', () => {
    const cols = columnas();
    expect(cols.length).toBeGreaterThan(5);
    expect(cols).toContain('machos_muertos');
    expect(cols).toContain('peso_machos');
    expect(cols).toContain('obs_sanitarias');
  });

  /* 🔴 ÉSTA es la que habría cazado el defecto. */
  it('el recolector recorre TODAS las columnas, no un subconjunto filtrado por tipo', () => {
    const c = colector();
    expect(c).toContain('_TANQ_GRID_COLS.forEach');
    /* El defecto exacto: iterar una lista derivada de un `.filter(... type ...)`. Cualquier
       filtrado ahí vuelve a dejar tipos fuera, que es de lo que se trata. */
    expect(/_TANQ_GRID_COLS\s*\.\s*filter/.test(c)).toBe(false);
    /* ⚠ Se comprueba el USO y no el nombre: el comentario del recolector NOMBRA la constante
       vieja para explicar de dónde viene el defecto, y una aserción sobre el nombre a secas se
       ponía roja por esa prosa. Es la misma trampa que se cobró el detector de bancos ese
       mismo día — un instrumento engañado por un texto que habla del instrumento. */
    expect(/_TANQ_GRID_NUM_KEYS\s*\.\s*forEach/.test(c)).toBe(false);
  });

  /* Los tres tipos que declara la grilla tienen que tener rama en el recolector: sin la de
     `text`, una fila con sólo una observación sanitaria no se guardaría. */
  it('el recolector distingue los tipos que la grilla declara', () => {
    const c = colector();
    expect(c).toContain('col.type === "text"');
    expect(c).toContain('sanitizeStr');
    expect(c).toContain('sanitizeNum');
  });

  /* Y el otro extremo de la tubería: una columna que se recoge pero que el payload no
     escribe se pierde igual, sólo que un paso más tarde. */
  it('el payload escribe una celda por cada columna declarada', () => {
    const p = payload();
    const faltan = columnas().filter((k) => !p.includes('d.' + k));
    expect(faltan).toEqual([]);
  });

  /* ⚠⚠ LAS TRES COLUMNAS VACÍAS DE LA HOJA SIGUEN SIENDO INTOCABLES — pero el PORQUÉ cambió, y este
     comentario decía dos cosas que ya eran falsas (corregido el 2026-09-20). Es el sexto de la familia
     que arregló el punto 24: aquel corrigió cinco en `engine.js` y éste se escapó por vivir en una
     prueba. La conclusión era correcta; el argumento, no.
       · decía «mientras el GAS no se re-despliegue»  → el GAS SE RE-DESPLEGÓ (sello `55acbff1b746`).
       · decía que la llave es POSICIONAL `[0,1,3]`   → es `[0,1,3,16,17]` desde el 2026-09-17:
         Fecha, Sala, Tanque, Hora y Parte, con `Hora` y `Parte` AL FINAL de la cabecera.
     Hoy el argumento es MÁS fuerte, no menos: quitar cualquier columna de en medio no sólo correría
     `Tanque` al índice 2 —la llave pasaría a apuntar a «Machos muertos»—, sino que además sacaría
     `Hora` y `Parte` de los índices 16 y 17. Destruiría datos en CADA sync.
     🔑 Cambiarlas es posible, pero es una MIGRACIÓN coordinada —la cabecera del cliente y `madKeyCols`
     del GAS, en el MISMO despliegue— y sólo sale gratis mientras la hoja tenga CERO filas. Cuántas
     tiene hoy lo dice `estado-maduracion.mjs`, no este comentario.
     Esto se fija aquí para que no se «limpien» de buena fe. */
  it('la hoja conserva las tres columnas vacías que exige la llave posicional', () => {
    const p = payload();
    expect(p).toContain('"Fecha","Sala","Lote","Tanque"');
    expect(p).toContain('"Población inicial hembras","Población inicial machos"');
  });
});
