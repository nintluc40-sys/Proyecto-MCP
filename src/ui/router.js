/* ============================================================
   ROUTER de vistas — registro simple y conmutación
   ============================================================ */
import { store, emit, EV } from '../core/store.js';
import { destroyAllCharts } from '../core/charts.js';
import { esc } from '../core/format.js';

const views = new Map(); // id -> { label, icon, render(container) }

export function registerView(id, def) { views.set(id, def); }
export function getViews() { return [...views.entries()].map(([id, v]) => ({ id, ...v })); }

let container = null;
export function setContainer(el) { container = el; }

/** Renderiza la vista actual en el contenedor. */
export function renderCurrentView() {
  if (!container) return;
  const def = views.get(store.currentView);
  if (!def) { container.innerHTML = '<div class="empty-state">Vista no encontrada.</div>'; return; }
  // Limpia estados de overlay que pudieran quedar pegados al <body> si el usuario
  // navegó con un modal abierto. Si no, refresh.js (isBusy → '.modal-open') creería
  // que hay interacción activa y CONGELARÍA el auto-refresco de toda la app.
  document.body.classList.remove('modal-open');
  destroyAllCharts();
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'fade-in';
  container.appendChild(root);
  try {
    def.render(root);
  } catch (e) {
    console.error(`[router] error renderizando "${store.currentView}"`, e);
    root.innerHTML = `<div class="empty-state">Error al renderizar la vista.<br><small class="mono">${esc(e.message)}</small></div>`;
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
