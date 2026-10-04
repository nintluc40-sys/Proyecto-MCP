/* ============================================================
   PLANTA · vista 🏭 (rol Gerencia) — tablero de producción sobre la maqueta 3D del laboratorio
   Tanda 1 (2026-10-04): el marco de la vista y la maqueta del Laboratorio Mar Bravo.
   Tanda 2 (2026-10-04): el estado de producción de cada tanque de larvicultura (planta/estado.js).
   Tanda 3 (2026-10-04): y el de cada sala y tanque de maduración (estadoMaduracion, del mismo archivo).
   Tanda 4 (2026-10-04): las cifras de gerencia (planta/cifras.js): producción del mes frente a la meta, supervivencia,
   nauplios y desoves. Las tres partes se calculan por separado: si una falla, las otras se siguen viendo.
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
import { estadoPlanta, estadoMaduracion, hoyLocal } from './estado.js';
import { cifrasGerencia } from './cifras.js';

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
    <section class="prod" aria-label="Producción del mes">
      <div class="prod-head"><h2>Producción del mes</h2><button type="button" class="meta-btn" id="meta-btn" aria-expanded="false" aria-controls="meta-form">⚙ Meta</button></div>
      <form class="meta-form" id="meta-form" hidden>
        <label for="meta-in">Meta del mes, en millones de larvas</label>
        <div class="meta-row"><input id="meta-in" type="number" min="1" step="1" inputmode="numeric" required><button type="submit">Guardar</button><button type="button" id="meta-reset">Volver a 400</button></div>
        <small>Se guarda sólo en este equipo.</small>
      </form>
      <div class="prod-nav">
        <button type="button" class="mes-btn" id="mes-prev" aria-label="Mes anterior" disabled>◀</button>
        <div class="prod-mes"><b id="prod-mes">—</b><span id="prod-cor"></span></div>
        <button type="button" class="mes-btn" id="mes-next" aria-label="Mes siguiente" disabled>▶</button>
      </div>
      <input type="range" class="mes-slider" id="mes-slider" min="0" max="0" value="0" step="1" aria-label="Mes de producción" hidden>
      <div class="prod-big"><b id="prod-total">—</b><span id="prod-meta"></span><em id="prod-pct"></em></div>
      <div class="prod-bar" id="prod-bar" role="img" aria-label="Producción del mes frente a la meta"><i class="d" id="prod-bar-d"></i><i class="c" id="prod-bar-c"></i><span class="goal" id="prod-goal"></span></div>
      <div class="prod-split"><span><i class="d"></i><span id="prod-desp">—</span></span><span><i class="c"></i><span id="prod-cult">—</span></span></div>
      <div class="prod-mini">
        <div><b id="prod-sv">—</b><span>supervivencia del mes</span></div>
        <div><b id="prod-n5">—</b><span id="prod-n5-sub">nauplios N5</span></div>
        <div><b id="prod-des">—</b><span>desoves</span></div>
      </div>
      <small class="prod-nota" id="prod-nota"></small>
    </section>
    <section class="atender" aria-label="Qué atender hoy"><h2 id="atender-h">Qué atender hoy</h2><ul class="at-list" id="atender"></ul></section>
    <div class="stats" id="stats"></div>
    <section aria-label="Hora del día"><h2>Hora del día</h2>
      <div class="seg" id="tod"><button type="button" data-t="day" aria-pressed="true">Día</button><button type="button" data-t="dusk" aria-pressed="false">Tarde</button><button type="button" data-t="night" aria-pressed="false">Noche</button></div>
    </section>
    <section><h2>Larvicultura</h2><ul class="list" id="list-larv"></ul></section>
    <section aria-label="Leyenda"><h2>Colores</h2><div class="legend" id="legend"></div></section>
    <section><h2>Maduración</h2><ul class="list" id="list-mat"></ul></section>
    <section class="repro" aria-label="Reproductores: días en producción"><h2 id="repro-h">Reproductores · días en producción</h2><ul class="repro-list" id="repro"></ul></section>
    <section class="toggles" aria-label="Capas">
      <h2>Capas</h2>
      <label><input type="checkbox" id="t-roof" checked> Techos (se abren al elegir un módulo)</label>
      <label><input type="checkbox" id="t-other" checked> Otras áreas del laboratorio</label>
      <label><input type="checkbox" id="t-life" checked> Personas, vehículos y aves</label>
      <label><input type="checkbox" id="t-labels" checked> Nombres de módulos y salas</label>
    </section>
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
  // El mes de la tarjeta de producción: null = el último con datos (sigue al mes en curso); al elegir uno anterior se
  // conserva en cada actualización de datos, como en la tabla Producción Omarsa.
  let mesElegido = null;
  const cifrasDelMes = () => cifrasGerencia(store.globalData, hoyLocal(), mesElegido);
  escena.alElegirMes((mIdx, esUltimo) => {
    mesElegido = esUltimo ? null : mIdx;
    try { escena.pintarMes(cifrasDelMes()); } catch (e) { console.error('[planta] cifras', e); escena.aviso('No se pudo calcular la producción del mes: ' + e.message); }
  });
  const pintar = () => {
    if (!store.connected || !store.globalData.length) { escena.pintarEstado(null); return; }
    const fallos = [];
    let larv = null, mad = null, cifras = null;
    try { larv = estadoPlanta(); } catch (e) { console.error('[planta] larvicultura', e); fallos.push('larvicultura (' + e.message + ')'); }
    try { mad = estadoMaduracion(store.globalData); } catch (e) { console.error('[planta] maduración', e); fallos.push('maduración (' + e.message + ')'); }
    try { cifras = cifrasDelMes(); } catch (e) { console.error('[planta] cifras', e); fallos.push('producción del mes (' + e.message + ')'); }
    escena.pintarEstado({ modulos: larv ? larv.modulos : {}, resumen: larv ? larv.resumen : null, mad, cifras });
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
