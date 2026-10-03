/* ============================================================
   ROUTER de vistas — registro simple y conmutación
   ============================================================ */
import { store, on, emit, EV } from '../core/store.js';
import { destroyAllCharts } from '../core/charts.js';
import { esc } from '../core/format.js';

const views = new Map(); // id -> { label, icon, render(container) }

export function registerView(id, def) { views.set(id, def); }

/** ¿La vista usa la barra de fecha global? Lo DECLARA al registrarse con `usaBarraFecha: true`
 *  (D12, 2026-09-13). Una vista que no lo declara no la enseña: nace sin ella, que es lo
 *  seguro. `dateBarVisibility.test.js` exige que declararla y leer `store.dateFrom/dateTo`
 *  vayan juntas. */
export function viewUsesDateBar(id) {
  const def = views.get(id);
  return !!(def && def.usaBarraFecha);
}

/** ¿Se repinta la vista cuando llegan datos nuevos (EV.DATA)? Sí, salvo que DECLARE
 *  `repintaConDatos: false` al registrarse. Registros lo declara (2026-09-24): es captura,
 *  repintarla se llevaba el foco y lo que se estaba tecleando, y lee el store cuando lo
 *  necesita. Lo vigila src/ui/repintaConDatos.test.js. */
export function viewRepaintsOnData(id) {
  const def = views.get(id);
  return !def || def.repintaConDatos !== false;
}

/** ¿La vista necesita el LIBRO (los datos de Google Sheets de store.globalData)? Sí, salvo que
 *  DECLARE `necesitaLibro: false` al registrarse (Registros: lee lo suyo por el GAS). P3 del plan
 *  de carga y refresco (2026-10-01): mientras el libro no ha llegado, la vista que lo necesita
 *  enseña un aviso de carga en vez de pintarse vacía, y lo PIDE (setPedirLibro). Lo vigila
 *  src/ui/arranque.test.js. */
export function viewNeedsBook(id) {
  const def = views.get(id);
  return !def || def.necesitaLibro !== false;
}

let container = null;
export function setContainer(el) { container = el; }

// Quién pide el libro (main.js registra asegurarLibro, que no lanza otra descarga si ya hay una).
// Se llama cada vez que se enseña el aviso de carga: así lo pide CUALQUIER camino que muestre una
// vista sin datos —elegir rol aunque se aterrice en la vista que ya era la actual, «Cambiar
// rol», el menú—, y tras un fallo, volver a la vista lo reintenta.
let pedirLibro = null;
export function setPedirLibro(fn) { pedirLibro = fn; }

// Último estado de la conexión: el aviso de carga dice si el libro sigue bajando o si falló.
let conexion = { state: 'connecting', label: '' };
function avisoCarga() {
  const fallo = conexion.state === 'error';
  return '<div class="empty-state" data-cargando-libro style="padding:64px 20px">'
    + `<div style="font-size:40px">${fallo ? '⚠️' : '📡'}</div>`
    + (fallo
      ? `<p>No se pudieron cargar los datos de producción.</p><p class="muted"><small class="mono">${esc(conexion.label || '')}</small><br>Pulsa ⟳ arriba para reintentar.</p>`
      : '<p class="muted">Cargando los datos de producción…</p>'
        // Punto 7 (2026-10-03): cómo va (lo que se ha descargado; luego, que se está leyendo) y por qué tarda
        + (conexion.state === 'connecting' && conexion.label ? `<p class="muted" data-carga-progreso><small>${esc(conexion.label)}</small></p>` : '')
        + '<p class="muted"><small>La primera vez en este equipo hay que descargar y leer el libro entero, y tarda. Después abre al instante con los datos guardados y los pone al día por detrás.</small></p>')
    + '</div>';
}
on(EV.CONN, (e) => {
  if (e) conexion = e;
  // Si se está viendo el aviso, se pone al día (de «cargando» a «falló», o al revés al reintentar).
  if (!store.connected && container && container.querySelector('[data-cargando-libro]')) container.innerHTML = avisoCarga();
});

// Cada repintado tiene su TURNO: el final diferido de uno viejo (una vista que llega con su import) no toca el
// contenedor si después se pintó otra cosa.
let turno = 0;

/** Renderiza la vista actual en el contenedor.
 *  `conservarPosicion` (punto 7 del usuario, 2026-10-03): al repintar la MISMA vista con datos nuevos, el desplazamiento
 *  se queda donde estaba. Vaciar el contenedor encogía la página por debajo de la ventana (medido en Maduración: 1 536 →
 *  805 px) y el navegador la llevaba ARRIBA; ahora el contenedor guarda su alto hasta que la vista termina de pintarse
 *  —si su `render` devuelve una promesa (el tablero del operativo llega con su import), hasta que se cumple— y se vuelve
 *  a la posición de antes. Cambiar de vista no lo usa. */
export function renderCurrentView({ conservarPosicion = false } = {}) {
  if (!container) return;
  const mio = ++turno;
  container.style.minHeight = '';
  const def = views.get(store.currentView);
  if (!def) { container.innerHTML = '<div class="empty-state">Vista no encontrada.</div>'; return; }
  // Limpia estados de overlay que pudieran quedar pegados al <body> si el usuario
  // navegó con un modal abierto. Si no, refresh.js (isBusy → '.modal-open') creería
  // que hay interacción activa y CONGELARÍA el auto-refresco de toda la app.
  document.body.classList.remove('modal-open');
  destroyAllCharts();
  // Sin el libro todavía, la vista que lo necesita enseña el aviso de carga; cuando llega
  // (EV.DATA), el shell vuelve a llamar aquí y se pinta de verdad.
  if (!store.connected && viewNeedsBook(store.currentView)) {
    container.innerHTML = avisoCarga();
    if (pedirLibro) pedirLibro();
    return;
  }
  const y = conservarPosicion ? window.scrollY : 0;
  if (y > 0) container.style.minHeight = container.offsetHeight + 'px';   // la página no encoge mientras se repinta
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'fade-in';
  container.appendChild(root);
  let pintada;
  try {
    pintada = def.render(root);
  } catch (e) {
    console.error(`[router] error renderizando "${store.currentView}"`, e);
    root.innerHTML = `<div class="empty-state">Error al renderizar la vista.<br><small class="mono">${esc(e.message)}</small></div>`;
  }
  if (y > 0) {
    const volver = () => {
      if (mio !== turno) return;
      container.style.minHeight = '';
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    };
    if (pintada && typeof pintada.then === 'function') pintada.then(volver, volver);
    else volver();
  }
}

/** Cambia de vista. */
export function changeView(id) {
  if (!views.has(id) || store.currentView === id) {
    if (store.currentView === id) renderCurrentView();
    return;
  }
  store.currentView = id;
  emit(EV.VIEW, id);
  renderCurrentView();
}
