/* ============================================================
   PLANTA · vista 🏭 (rol Gerencia) — tablero de producción sobre la maqueta 3D del laboratorio
   Tanda 1 (2026-10-04): el marco de la vista y la maqueta del Laboratorio Mar Bravo, todavía SIN
   datos de producción. La escena (three.js) vive en planta/escena.js y llega en este mismo bloque
   diferido: main.js lo importa sólo al abrir la vista, así que el resto de la app no carga three.js.
   El marco es estático (no lleva contenido dinámico); lo que cambia lo escribe escena.js con
   textContent.
   ============================================================ */
import './planta.css';
import { montarPlanta } from './escena.js';
import { esc } from '../../core/format.js';

const MARCO = `
<div class="planta">
  <main class="viewport" id="vp">
    <canvas id="c" tabindex="0" aria-label="Maqueta 3D del laboratorio"></canvas>
    <div class="labels" id="labels"></div>
    <div class="tip" id="tip" hidden></div>
    <div class="views"><button type="button" id="v-iso">Vista general</button><button type="button" id="v-back">Desde atrás</button><button type="button" id="v-top">Planta</button></div>
    <div class="compass" aria-hidden="true"><div class="needle" id="needle"><b>N</b><i></i></div></div>
    <section class="card" id="card" hidden aria-live="polite">
      <header><div><div class="kind" id="card-kind"></div><h3 id="card-name"></h3></div><button type="button" id="card-close">Cerrar</button></header>
      <dl id="card-dl"></dl>
    </section>
    <p class="hintline">Arrastra para girar · rueda o pellizco para acercar · toca un módulo o un tanque</p>
  </main>
  <aside class="panel" aria-label="Resumen del laboratorio">
    <header>
      <div class="eyebrow">Plano ARQ-A3 · V4 septiembre</div>
      <h1>Laboratorio Mar Bravo</h1>
      <p class="lede">Módulos de larvicultura y salas de maduración a escala desde el plano, en su entorno real. Próximamente: el estado y la producción de cada módulo y sala.</p>
    </header>
    <div class="stats" id="stats"></div>
    <section aria-label="Hora del día"><h2>Hora del día</h2>
      <div class="seg" id="tod"><button type="button" data-t="day" aria-pressed="true">Día</button><button type="button" data-t="dusk" aria-pressed="false">Tarde</button><button type="button" data-t="night" aria-pressed="false">Noche</button></div>
    </section>
    <section><h2>Larvicultura</h2><ul class="list" id="list-larv"></ul></section>
    <section><h2>Maduración</h2><ul class="list" id="list-mat"></ul></section>
    <section class="toggles" aria-label="Capas">
      <h2>Capas</h2>
      <label><input type="checkbox" id="t-roof" checked> Techos (se abren al elegir un módulo)</label>
      <label><input type="checkbox" id="t-other" checked> Otras áreas del laboratorio</label>
      <label><input type="checkbox" id="t-life" checked> Personas, vehículos y aves</label>
      <label><input type="checkbox" id="t-labels" checked> Nombres de módulos y salas</label>
    </section>
    <p class="note">Medidas tomadas del plano; la posición de cada tanque se detectó sobre el dibujo y puede variar unos centímetros. El volumen es bruto (largo × ancho × altura de pared). La altura de los tanques de las salas 4 y 5 no figura en el plano y se asumió en 0,90 m. Postlarvas y reproductores se muestran a escala aumentada para que se distingan; personas y vehículos son ambientación.</p>
  </aside>
</div>`;

/** Pinta la vista y monta la maqueta. Sin WebGL (equipo o navegador sin aceleración) avisa en vez de romper. */
export function plantaView(root) {
  root.innerHTML = MARCO;
  const host = root.querySelector('.planta');
  try {
    montarPlanta(host);
  } catch (e) {
    host.querySelector('.viewport').innerHTML = '<div class="empty-state" style="padding:48px">No se pudo mostrar la maqueta 3D en este equipo.<br>'
      + `<small class="mono">${esc(e.message)}</small></div>`;
  }
}
