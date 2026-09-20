/* ============================================================
   detectSheetName · las hojas del operativo cuya cabecera la declara el CÓDIGO, no una medición

   ── POR QUÉ ES UN ARCHIVO APARTE ───────────────────────────
   `detectSheetName.test.js` nació generado desde `cabeceras-produccion.json`, o sea de una FOTO
   de producción. Estas hojas no pueden salir de ahí: su cabecera la decide un módulo de esquema
   de este repo, y la pestaña aparece cuando alguien envía por primera vez.
   🔑 Y resultó ser la ÚNICA cobertura de dos de ellas: medido el 2026-09-20, el generador filtra
   por una lista escrita a mano y dejaba `Maduración Ingreso` y `Maduración Movimientos` fuera del
   fixture EN SILENCIO. Ahora las nombra como cubiertas aquí, y una hoja que no esté ni en un sitio
   ni en el otro aborta la generación.

   ⚠ TRES AFIRMACIONES DE ESTA CABECERA CADUCARON, y se corrigen (2026-09-20):
     · «cubre las 35 pestañas que hoy existen» → 35 son las filas del FIXTURE, no las pestañas
       vivas. Confundir las dos cosas es lo que hizo envejecer el número. Cuántas hay hoy en
       producción lo dice `sonda-pestanas.mjs`; cuántas filas tiene el fixture, él mismo.
     · «añadirle filas a mano las perdería en la siguiente regeneración» → YA NO: desde ese día el
       generador se NIEGA a sobrescribir si el destino tiene contenido que él no reproduce.
     · «NO existen todavía: nacen con el re-despliegue del GAS» → el re-despliegue ya ocurrió
       (sello `55acbff1b746`) y además no es lo que las crea: nacen con su PRIMER ENVÍO. Tanto que
       `Maduración Ingreso` existe ahora mismo y se está llenando.
   🔑 Que existan o no en producción NO cambia NADA aquí, y ése es el punto de este archivo: sus
   cabeceras se las pide a los módulos, no a la hoja. Por eso sobrevivió al vaciado del 09-20 sin
   despeinarse, mientras la foto se quedaba describiendo pestañas que ya no están.

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
import { MAD_ALIM_SHEET, MAD_ALIM_HEADERS } from '../views/registros/lib/ficha-maduracion-alimentacion.schema.js';
import { MAD_BS_SHEET, MAD_BS_HEADERS } from '../views/registros/lib/ficha-maduracion-broodstock.schema.js';

/** [nombre real de la pestaña, cabeceras SEGÚN SU MÓDULO] */
const DECLARADAS = [
  [MAD_INGRESO_SHEET, MAD_INGRESO_HEADERS],
  [MAD_MOV_SHEET, MAD_MOV_HEADERS],
  [MAD_FIN_SHEET, MAD_FIN_HEADERS],
  [MAD_TRAT_SHEET, MAD_TRAT_HEADERS],
  [MAD_MORT_SHEET, MAD_MORT_HEADERS],
  [MAD_ALIM_SHEET, MAD_ALIM_HEADERS],
  [MAD_BS_SHEET, MAD_BS_HEADERS],   // V1 (2026-09-18) · el Control Broodstock
];
/* Broodstock no acaba en «ID»: su llave es POSICIONAL (Fecha de corte · Piscina, las dos primeras), no un id. */
const SIN_ID = [MAD_BS_SHEET];

/** Una fila con esas cabeceras y valores vacíos: detectSheetName sólo mira las CLAVES. */
const filaDe = (cabeceras) => Object.fromEntries(cabeceras.map((c) => [c, '']));

describe('detectSheetName · las hojas de Maduración que aún no existen', () => {
  it('el fixture viene de los módulos y no está vacío', () => {
    expect(DECLARADAS).toHaveLength(7);
    for (const [n, cab] of DECLARADAS) {
      expect(cab.length, n + ' sin cabeceras').toBeGreaterThan(0);
      if (SIN_ID.indexOf(n) === -1) expect(cab[cab.length - 1], n + ' no acaba en ID').toBe('ID');
      else expect(cab.slice(0, 2), n + ' no empieza por su llave').toEqual(['Fecha de corte', 'Piscina']);
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

  it('Alimentación (2026-09-15) se sostiene por «Sala» + «Hembras/Machos» (la regla general): sin «Sala» se cae', () => {
    expect(detectSheetName([filaDe(MAD_ALIM_HEADERS.filter((h) => h !== 'Sala'))], 0)).not.toBe('Maduracion');
  });

  it('Tratamientos se sostiene por «Productos RAS»: sin ella se cae', () => {
    expect(detectSheetName([filaDe(MAD_TRAT_HEADERS.filter((h) => h !== 'Productos RAS'))], 0)).not.toBe('Maduracion');
  });

  it('Broodstock (V1, 2026-09-18) se sostiene por «Pl/g»: sin ella se cae', () => {
    expect(MAD_BS_HEADERS).toContain('Pl/g');
    expect(detectSheetName([filaDe(MAD_BS_HEADERS.filter((h) => h !== 'Pl/g'))], 0)).not.toBe('Maduracion');
  });
});
