/* ============================================================
   SUPERVISOR · orquestador
   Estado de navegación local + dispatch a sub-vistas.
   Navegación e interacción por delegación de eventos.
   ============================================================ */
import { store } from '../../core/store.js';
import { destroyAllCharts } from '../../core/charts.js';
import { buildContext } from './stats.js';
import { renderExecutive } from './executive.js';
import { renderModule } from './module.js';
import { renderTank } from './tank.js';
import { renderLarvia } from './larvia.js';
import { renderDespacho } from './despacho.js';
import { renderOmTex } from './omtex.js';

// Estado de navegación persistente entre renders de la vista.
const vState = { view: 'modules', mod: null, tank: null, corrida: null };

function dispatch(ctx) {
  switch (vState.view) {
    case 'module': if (vState.mod) return renderModule(ctx, vState.mod);
      break;
    case 'tank': if (vState.mod && vState.tank) return renderTank(ctx, vState.mod, vState.tank);
      break;
    case 'larvia': if (vState.mod && vState.tank) return renderLarvia(ctx, vState.mod, vState.tank);
      break;
    case 'despacho': if (vState.mod) return renderDespacho(ctx, vState.mod);
      break;
    case 'omtex': if (vState.mod) return renderOmTex(ctx, vState.mod);
      break;
  }
  vState.view = 'modules';
  return renderExecutive(ctx);
}

export function supervisorView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }

  destroyAllCharts(); // limpia instancias previas antes de recrear (nav interna)
  // La navegación interna (módulo↔tanque↔LARVIA…) re-renderiza sin pasar por el
  // router, así que limpiamos aquí también cualquier overlay huérfano en el <body>
  // (si no, refresh.js lo leería como interacción y pausaría el auto-refresco).
  document.body.classList.remove('modal-open');
  const ctx = buildContext(vState);
  const result = dispatch(ctx);
  const { html, after } = typeof result === 'string' ? { html: result } : result;

  root.innerHTML = html;
  if (after) try { after(root, ctx); } catch (e) { console.error('[supervisor] after()', e); }

  bindInteractions(root);
}

/** Aplica la navegación de un elemento [data-nav] al estado y re-renderiza. */
function navTo(root, nav) {
  const { nav: to, mod, tank, corrida } = nav.dataset;
  vState.view = to;
  if (to === 'modules') { vState.mod = null; vState.tank = null; vState.corrida = null; }
  else if (to === 'module' || to === 'despacho' || to === 'omtex') { vState.mod = mod || vState.mod; vState.tank = null; if (corrida !== undefined && corrida !== '') vState.corrida = corrida; }
  else { vState.mod = mod || vState.mod; vState.tank = tank || vState.tank; }
  supervisorView(root);
}

function bindInteractions(root) {
  // El listener se delega en `root` y persiste entre re-renders internos
  // (que sólo reemplazan innerHTML). Vincular una sola vez evita apilarlos.
  if (root._svBound) return;
  root._svBound = true;
  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) navTo(root, nav);
  });
  // Accesibilidad: las tarjetas (div[data-nav] con role="button") responden a
  // Enter/Espacio. Los <button data-nav> ya disparan click nativo con Enter,
  // así que se excluyen para no navegar dos veces.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const nav = e.target.closest('[data-nav]');
    if (!nav || nav.tagName === 'BUTTON') return;
    e.preventDefault();
    navTo(root, nav);
  });
}
