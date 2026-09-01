/* ============================================================
   GAS ↔ cliente · los dos relojes del envío tienen que casar

   Un POST a la hoja tiene DOS temporizadores, uno en cada mitad:

     · el GAS espera el lock hasta `waitLock(N)` y, si no lo consigue, contesta
       «Servidor ocupado, reintenta» — un rechazo transitorio que el cliente entiende;
     · el cliente aborta la petición a los M milisegundos.

   El diseño depende de que **M sea mayor que N**: así el servidor alcanza a contestar
   antes de que el cliente se rinda, y el fallo llega como un mensaje legible en vez de
   como un aborto mudo. Y de que la diferencia sea suficiente para que la ESCRITURA
   quepa: si el lock se consigue en el último segundo, lo que queda es lo que hay para
   escribir la hoja y volver.

   Los dos números viven en archivos distintos y nadie los comparaba. El 2026-08-30 se
   encontró que el comentario del cliente seguía diciendo «waitLock hasta 15 s» cuando
   hacía tiempo que eran 25: quien lo leyera creería tener 15 s de margen teniendo 5.
   Un comentario viejo en una costura de tiempos es tan peligroso como un número mal
   puesto, porque es lo que la siguiente persona usa para decidir.

   🔑 Aquí no se transcribe ningún número: los tres se LEEN de sus fuentes.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const GAS = new URL('../../../../GAS/Code.gs', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

const engine = leer(ENGINE);
const gas = leer(GAS);

/** Lo que el GAS espera por el lock, de su propia llamada. */
function esperaDelLock() {
  const m = /_lock\.waitLock\((\d+)\)/.exec(gas);
  if (!m) throw new Error('no se halló waitLock en GAS/Code.gs');
  return Number(m[1]);
}

/** El bloque del temporizador de _postOnce: el número y el comentario que lo acompaña. */
function topeDelCliente() {
  const i = engine.indexOf('async function _postOnce(');
  if (i < 0) throw new Error('no se halló _postOnce en engine.js');
  // Desde el arranque de la función hasta bien pasado el temporizador: el comentario
  // que lo justifica va DENTRO, justo encima, y se comprueba también.
  const trozo = engine.slice(i, i + 2200);
  const m = /setTimeout\(\(\)=>ctrl\.abort\(\),\s*(\d+)\)/.exec(trozo);
  if (!m) throw new Error('no se halló el temporizador de _postOnce');
  return { ms: Number(m[1]), texto: trozo };
}

describe('GAS ↔ cliente · los relojes del envío', () => {
  const lock = esperaDelLock();
  const cli = topeDelCliente();

  it('el tope del cliente SUPERA la espera del lock del GAS', () => {
    // Si no, el cliente aborta antes de que el servidor pueda contestar «ocupado» y el
    // usuario recibe un error de conexión en vez del motivo real.
    expect(cli.ms).toBeGreaterThan(lock);
  });

  it('queda margen suficiente para la escritura y la vuelta (≥ 10 s)', () => {
    // El caso malo es conseguir el lock en el último instante: lo que sobra es todo lo
    // que hay para escribir la hoja y que la respuesta vuelva.
    expect(cli.ms - lock).toBeGreaterThanOrEqual(10000);
  });

  it('🔴 el comentario del cliente NOMBRA la espera que el GAS usa de verdad', () => {
    // El defecto de agosto: el comentario decía 15 s cuando eran 25. Se comprueba que
    // el número que cita esté en el texto, en segundos, para que leerlo no engañe.
    const segundos = String(lock / 1000);
    expect(cli.texto).toContain(segundos + ' s');
  });

  it('el tope del cliente aparece también en segundos junto al valor', () => {
    expect(cli.texto).toContain(String(cli.ms / 1000) + ' s');
  });
});
