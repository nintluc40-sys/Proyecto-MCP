/* ============================================================
   VISTA DIFERIDA — el registro de una vista que se baja AL ABRIRLA (tarea 5, 2026-10-23, usuario)

   Las SIETE vistas de cada día (Supervisor, Larvicultura, Revisiones, Visitante, Algas, Microbiología y la entrada de
   Maduración, que elige familia) iban en el bloque principal —850 kB, el 92 % de él— y TODOS los roles las bajaban antes
   de ver siquiera la pantalla de roles, también Visitante, Chequeador o Gerencia, que usan una sola. Medido con la build:
   lo que baja la pantalla de roles (con Chart.js) pasó de 1 053,7 a 254,7 kB. main.js las registra con `diferida`.
   La precarga del service worker (vite.config.js · listaDePrecache) ya lleva sus bloques: sin señal abren como antes.

   `diferida(def, carga)` devuelve la definición de `registerView` (con sus opciones: `usaBarraFecha`…) y un `render` que:
   · enseña «Cargando…» mientras llega el bloque (`carga()` da la función que pinta la vista);
   · si el bloque no llega, lo dice (sin señal, como Planta);
   · si la vista falla AL PINTAR, lo dice como lo diría el router (ui/router.js), que ya no lo ve: llega en una promesa;
   · si se cambió de vista antes de que llegara (el contenedor ya no está en el documento), no pinta nada;
   · devuelve la promesa: al repintar con datos nuevos, el router sostiene el alto hasta que llega (punto 7).
   ============================================================ */
import { esc } from '../core/format.js';

// Lo que dice el navegador cuando un bloque diferido no se puede bajar (sin red, o un despliegue lo cambió de nombre).
export const SIN_RED = /dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function diferida(def, carga) {
  return {
    ...def,
    render: (root) => {
      root.innerHTML = `<div class="empty-state" style="padding:64px 20px"><div style="font-size:40px">${def.icon}</div><p class="muted">Cargando ${esc(def.label)}…</p></div>`;
      return carga().then((pintar) => {
        if (!root.isConnected) return undefined;
        try { return pintar(root); } catch (e) {
          console.error(`[router] error renderizando "${def.label}"`, e);
          root.innerHTML = `<div class="empty-state">Error al renderizar la vista.<br><small class="mono">${esc(e.message)}</small></div>`;
          return undefined;
        }
      }, (e) => {
        if (!root.isConnected) return;
        const sinRed = navigator.onLine === false || SIN_RED.test(e.message || '');
        root.innerHTML = `<div class="empty-state" style="padding:48px">${sinRed ? `${esc(def.label)} necesita señal la primera vez que se abre (y tras cada actualización). Conéctate y vuelve a intentarlo.` : `Error al cargar ${esc(def.label)}.`}<br><small class="mono">${esc(e.message)}</small></div>`;
      });
    },
  };
}
