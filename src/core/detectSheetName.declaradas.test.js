/* ============================================================
   detectSheetName · las hojas DECLARADAS que todavía NO existen en producción

   ── POR QUÉ ES UN ARCHIVO APARTE ───────────────────────────
   `detectSheetName.test.js` se GENERA desde `cabeceras-produccion.json`: cubre las
   35 pestañas que hoy existen, y añadirle filas a mano las perdería en la siguiente
   regeneración. Las tres hojas del registro operativo de Maduración —Ingreso,
   Movimientos y Fin de Ciclo— NO existen todavía: nacen con el re-despliegue del
   GAS, así que ninguna medición de producción puede incluirlas.

   🔑 Y aquí las cabeceras NO se teclean: se PIDEN a los módulos de esquema, que son
   los que las emiten. Una lista escrita al lado se desincroniza del constructor de
   filas en silencio, y entonces esta prueba certificaría una hoja imaginaria — que es
   exactamente el fallo que se pagó el 2026-09-08, cuando el fixture de
   `Maduración Lotes` describía columnas que el rediseño a Desoves ya había quitado.

   ── QUÉ DEFECTO CIERRA (medido el 2026-09-09) ──────────────
   🔴 `Maduración Fin de Ciclo` daba **columnas=Hoja1** y **nombre=Maduracion**. No
   tiene «Sala» —un cierre es de un LOTE entero— ni «código genético» —eso es del
   desove—, así que ninguna de las dos firmas de Maduración la alcanzaba y caía al
   final como «Hoja<N>». Es el mismo fallo silencioso que tuvieron MATRIZ, Bitácora
   y Lotes: el tablero sella `_SheetOrigin` de dos maneras distintas según por dónde
   entró el dato, y las vistas que comparan la cadena EXACTA hacen desaparecer filas
   sin un solo error a la vista.

   La invariante es la misma que la del archivo generado, y por eso se dice igual:
   el camino por COLUMNAS y el camino por NOMBRE tienen que coincidir.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { detectSheetName, classifyOrigin } from './sheets.js';
import {
  MAD_INGRESO_SHEET,
  MAD_INGRESO_HEADERS,
} from '../views/registros/lib/ficha-maduracion-ingreso.schema.js';
import {
  MAD_MOV_SHEET,
  MAD_MOV_HEADERS,
} from '../views/registros/lib/ficha-maduracion-movimientos.schema.js';
import {
  MAD_FIN_SHEET,
  MAD_FIN_HEADERS,
} from '../views/registros/lib/ficha-maduracion-fin-ciclo.schema.js';
import {
  MAD_TRAT_SHEET,
  MAD_TRAT_HEADERS,
} from '../views/registros/lib/ficha-maduracion-tratamientos.schema.js';
import { MAD_MORT_SHEET, MAD_MORT_HEADERS } from '../views/registros/lib/ficha-maduracion-mortdesove.schema.js';

/** [nombre real de la pestaña, cabeceras SEGÚN SU MÓDULO] */
const DECLARADAS = [
  [MAD_INGRESO_SHEET, MAD_INGRESO_HEADERS],
  [MAD_MOV_SHEET, MAD_MOV_HEADERS],
  [MAD_FIN_SHEET, MAD_FIN_HEADERS],
  [MAD_TRAT_SHEET, MAD_TRAT_HEADERS],
  [MAD_MORT_SHEET, MAD_MORT_HEADERS],
];

/** Una fila con esas cabeceras y valores vacíos: detectSheetName sólo mira las CLAVES. */
const filaDe = (cabeceras) => Object.fromEntries(cabeceras.map((c) => [c, '']));

describe('detectSheetName · las hojas de Maduración que aún no existen', () => {
  it('el fixture viene de los módulos y no está vacío', () => {
    expect(DECLARADAS).toHaveLength(5);
    for (const [n, cab] of DECLARADAS) {
      expect(cab.length, n + ' sin cabeceras').toBeGreaterThan(0);
      expect(cab[cab.length - 1], n + ' no acaba en ID').toBe('ID');
    }
  });

  for (const [nombre, cabeceras] of DECLARADAS) {
    it(`${nombre} → ${classifyOrigin(nombre)}`, () => {
      expect(detectSheetName([filaDe(cabeceras)], 0)).toBe(classifyOrigin(nombre));
    });
  }

  /* La invariante, dicha una vez y con el diagnóstico dentro: si vuelve a romperse,
     el mensaje dice QUÉ dio cada camino, que es lo que costó descubrir la primera vez. */
  it('el camino por COLUMNAS coincide con el camino por NOMBRE en las tres', () => {
    const divergen = DECLARADAS
      .filter(([n, cab]) => detectSheetName([filaDe(cab)], 0) !== classifyOrigin(n))
      .map(([n, cab]) => `${n}: columnas=${detectSheetName([filaDe(cab)], 0)} vs nombre=${classifyOrigin(n)}`);
    expect(divergen, 'hojas que se clasifican distinto según por dónde entraron:\n' + divergen.join('\n'))
      .toHaveLength(0);
  });

  /* ⚠ La firma de Fin de Ciclo era SÓLO «metabisulfito», que vale mientras siga siendo SUYA.
     D14 (2026-09-14) le dio una columna «Sala», y con «Machos» ya la alcanza la regla general de
     Maduración: ahora tiene DOS firmas. Se fija que cada una la sostiene sola y que sin las dos
     se cae — quitar las dos del esquema tiene que poner esta prueba en rojo, no dejar que la hoja
     vuelva a «Hoja<N>» sin avisar. */
  it('Fin de Ciclo se sostiene por «metabisulfito» y por «Sala»+«Machos», cada una sola; sin las dos se cae', () => {
    const cab = (fuera) => MAD_FIN_HEADERS.filter((h) => !fuera.some((f) => h.toLowerCase().includes(f)));
    expect(MAD_FIN_HEADERS.some((h) => h.toLowerCase().includes('metabisulfito'))).toBe(true);
    expect(MAD_FIN_HEADERS).toContain('Sala');
    expect(detectSheetName([filaDe(cab(['metabisulfito']))], 0)).toBe('Maduracion');
    expect(detectSheetName([filaDe(cab(['sala']))], 0)).toBe('Maduracion');
    expect(detectSheetName([filaDe(cab(['metabisulfito', 'sala']))], 0)).not.toBe('Maduracion');
  });

  it('Mortalidad Desove se sostiene por «Tipo de tanque»: sin ella se cae', () => {
    expect(detectSheetName([filaDe(MAD_MORT_HEADERS.filter((h) => h !== 'Tipo de tanque'))], 0)).not.toBe('Maduracion');
  });

  it('Tratamientos se sostiene por «Productos RAS»: sin ella se cae', () => {
    expect(detectSheetName([filaDe(MAD_TRAT_HEADERS.filter((h) => h !== 'Productos RAS'))], 0)).not.toBe('Maduracion');
  });
});
