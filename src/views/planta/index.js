/* ============================================================
   PLANTA · vista 🏭 (rol Gerencia) — tablero de producción sobre la maqueta 3D del laboratorio
   Tanda 1 (2026-10-04): el marco de la vista y la maqueta del Laboratorio Mar Bravo.
   Tanda 2 (2026-10-04): el estado de producción de cada tanque de larvicultura (planta/estado.js).
   Tanda 3 (2026-10-04): y el de cada sala y tanque de maduración (estadoMaduracion, del mismo archivo). Se calculan
   por separado: si uno falla, el otro se sigue viendo.
   La vista se monta SIN esperar al libro (`necesitaLibro: false`): la maqueta sale al instante, pide
   el libro si no está y pinta los estados al llegar; en cada refresco (EV.DATA) sólo vuelve a pintar
   los colores (`repintaConDatos: false`: rehacer la escena perdería la cámara).
   La escena (three.js) vive en planta/escena.js y llega en este mismo bloque
   diferido: main.js lo importa sólo al abrir la vista, así que el resto de la app no carga three.js.
   El marco es estático (no lleva contenido dinámico); lo que cambia lo escribe escena.js con
   textContent.
   ============================================================ */
import './planta.css';
import { montarPlanta } from './escena.js';
import { esc } from '../../core/format.js';
import { store, on, EV } from '../../core/store.js';
import { asegurarLibro } from '../../core/refresh.js';
import { estadoPlanta, estadoMaduracion } from './estado.js';

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
      <p class="lede">El estado de hoy de cada módulo de larvicultura y de cada sala de maduración, con los datos y las reglas del MCP: la Vista Ejecutiva del Supervisor y el tablero de Maduración.</p>
      <p class="datos" id="estado-datos" role="status">Cargando datos de producción…</p>
    </header>
    <div class="stats" id="stats"></div>
    <section aria-label="Hora del día"><h2>Hora del día</h2>
      <div class="seg" id="tod"><button type="button" data-t="day" aria-pressed="true">Día</button><button type="button" data-t="dusk" aria-pressed="false">Tarde</button><button type="button" data-t="night" aria-pressed="false">Noche</button></div>
    </section>
    <section><h2>Larvicultura</h2><ul class="list" id="list-larv"></ul></section>
    <section aria-label="Leyenda"><h2>Colores</h2><div class="legend" id="legend"></div></section>
    <section><h2>Maduración</h2><ul class="list" id="list-mat"></ul></section>
    <section class="toggles" aria-label="Capas">
      <h2>Capas</h2>
      <label><input type="checkbox" id="t-roof" checked> Techos (se abren al elegir un módulo)</label>
      <label><input type="checkbox" id="t-other" checked> Otras áreas del laboratorio</label>
      <label><input type="checkbox" id="t-life" checked> Personas, vehículos y aves</label>
      <label><input type="checkbox" id="t-labels" checked> Nombres de módulos y salas</label>
    </section>
    <p class="note">Módulos y salas del plano ARQ-A3 V4; las salas 4 y 5 se dibujan con los tanques del MCP (6 y 5), en una disposición aproximada. En larvicultura cada tanque toma el estado de la última corrida de su módulo; un tanque que no figura en esa corrida está vacío. En maduración, el estado de cada tanque es el de sus lotes en esa sala, como en el mapa de salas, y las cifras de bajas, descartes y cópulas son de los últimos 7 días. Los datos se actualizan solos cada 5 minutos. Postlarvas y reproductores se ven a escala aumentada; personas y vehículos son ambientación.</p>
  </aside>
</div>`;

/** Pinta la vista y monta la maqueta. Sin WebGL (equipo o navegador sin aceleración) avisa en vez de romper. */
export function plantaView(root) {
  root.innerHTML = MARCO;
  const host = root.querySelector('.planta');
  let escena;
  try {
    escena = montarPlanta(host);
  } catch (e) {
    host.querySelector('.viewport').innerHTML = '<div class="empty-state" style="padding:48px">No se pudo mostrar la maqueta 3D en este equipo.<br>'
      + `<small class="mono">${esc(e.message)}</small></div>`;
    return;
  }
  const pintar = () => {
    if (!store.connected || !store.globalData.length) { escena.pintarEstado(null); return; }
    const fallos = [];
    let larv = null, mad = null;
    try { larv = estadoPlanta(); } catch (e) { console.error('[planta] larvicultura', e); fallos.push('larvicultura (' + e.message + ')'); }
    try { mad = estadoMaduracion(store.globalData); } catch (e) { console.error('[planta] maduración', e); fallos.push('maduración (' + e.message + ')'); }
    escena.pintarEstado({ modulos: larv ? larv.modulos : {}, resumen: larv ? larv.resumen : null, mad });
    const hora = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    escena.aviso(fallos.length ? 'No se pudo calcular: ' + fallos.join(' · ') : 'Datos del MCP · puestos al día a las ' + hora);
  };
  pintar();
  if (!store.connected) asegurarLibro();
  // Se desuscribe solo cuando la vista ya no está en el documento (el router no avisa al salir).
  const offData = on(EV.DATA, () => { if (!host.isConnected) { offData(); offConn(); return; } pintar(); });
  const offConn = on(EV.CONN, (c) => {
    if (!host.isConnected) { offData(); offConn(); return; }
    if (c && c.state === 'error' && !store.connected) escena.aviso('No se pudieron cargar los datos de producción. Pulsa ⟳ arriba para reintentar.');
  });
}
