/* ============================================================
   ENTRY — arranque de la aplicación
   ============================================================ */
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './views/supervisor/supervisor.css';
import './views/larvicultura/larvicultura.css';
import './views/revisiones/revisiones.css';
import './views/biomolecular/biomolecular.css';
import './views/visitante/visitante.css';
import './views/algas/algas.css';
import './views/microbiologia/microbiologia.css';
import './views/maduracion/maduracion.css';


import { mountShell, showLoader } from './ui/shell.js';
import { registerView } from './ui/router.js';
import { connectSheets } from './core/sheets.js';
import { startAutoRefresh } from './core/refresh.js';
import { esc } from './core/format.js';

import { supervisorView } from './views/supervisor/index.js';
import { larviculturaView } from './views/larvicultura/index.js';
import { revisionesView } from './views/revisiones/index.js';
import { visitanteView } from './views/visitante/index.js';
import { algasView } from './views/algas/index.js';
import { microbiologiaView } from './views/microbiologia/index.js';
import { maduracionView } from './views/maduracion/index.js';
// Biología Molecular: carga DIFERIDA. Es la vista más pesada (D3, ~1.5k líneas) y
// no es de uso diario; se descarga solo al abrirla, aligerando el bundle inicial.

async function boot() {
  const app = document.getElementById('app');

  // Vistas desarrolladas
  registerView('supervisor', { label: 'Supervisor', icon: '👁️', render: supervisorView });
  registerView('larvicultura', { label: 'Larvicultura', icon: '🦐', render: larviculturaView });
  registerView('revisiones', { label: 'Revisiones', icon: '🔍', render: revisionesView });

  registerView('maduracion', { label: 'Maduración', icon: '🥚', render: maduracionView });
  registerView('microbiologia', { label: 'Microbiología', icon: '🧫', render: microbiologiaView });
  registerView('algas', { label: 'Algas', icon: '🌿', render: algasView });
  registerView('biomolecular', {
    label: 'Biología Molecular', icon: '🧬',
    render: (root) => {
      // Placeholder mientras resuelve el import diferido (evita el pantallazo en
      // blanco entre que el router vacía el contenedor y el chunk carga/parsea).
      root.innerHTML = '<div class="empty-state" style="padding:64px 20px"><div style="font-size:40px">🧬</div><p class="muted">Cargando Biología Molecular…</p></div>';
      import('./views/biomolecular/index.js')
        .then((m) => m.biomolecularView(root))
        .catch((e) => { root.innerHTML = `<div class="empty-state" style="padding:48px">Error al cargar Biología Molecular.<br><small class="mono">${esc(e.message)}</small></div>`; });
    },
  });
  registerView('visitante', { label: 'Visitante', icon: '🚪', render: visitanteView });

  // Registros (captura) — carga DIFERIDA: la migración de Fichas es pesada y solo
  // se descarga cuando el usuario entra a la vista.
  registerView('registros', {
    label: 'Registros', icon: '📝',
    render: (root) => {
      root.innerHTML = '<div class="empty-state" style="padding:64px 20px"><div style="font-size:40px">📝</div><p class="muted">Cargando Registros…</p></div>';
      import('./views/registros/index.js')
        .then((m) => m.registrosView(root))
        .catch((e) => { root.innerHTML = `<div class="empty-state" style="padding:48px">Error al cargar Registros.<br><small class="mono">${esc(e.message)}</small></div>`; });
    },
  });

  mountShell(app);

  // Conexión inicial
  showLoader(true);
  await connectSheets();
  showLoader(false);

  // Auto-refresco SIEMPRE activo. Si la conexión inicial falla, el loop queda en
  // espera (tick() sale temprano mientras !store.connected) y se reanuda solo en
  // cuanto una reconexión manual marque store.connected = true. Antes vivía dentro
  // de `if (ok)`, así que un fallo inicial lo deshabilitaba TODA la sesión aunque
  // el usuario reconectara con el botón.
  // La huella inicial (y la de cada reconexión manual) la cachea commit() en
  // sheets.js; el loop la lee de ahí — única fuente de verdad.
  startAutoRefresh();
}

/* ── Service worker (T4b, 2026-08-25) ────────────────────────
   Da a la app arranque SIN CONEXIÓN, que es su caso real: los chequeadores trabajan
   de noche y en carretera. La cola de sincronización ya guardaba lo que no se podía
   enviar, pero si la app no cargaba no había nada que encolar.

   ⚠ SÓLO en producción. En desarrollo, un service worker cacheando delante del
   servidor de Vite hace que los cambios «no se vean» y se persigan fantasmas.

   ⚠ Se registra DESPUÉS de arrancar y sin `await`: su instalación descarga varios
   megas (engine.js, xlsx, d3) y bloquear el arranque con eso dejaría la primera
   visita mirando una pantalla vacía. Si falla, la app funciona igual — se pierde el
   modo sin conexión, no la app. Por eso el fallo se traga en silencio: no hay nada
   que el usuario pueda hacer al respecto.

   La estrategia por tipo de archivo, y por qué NO es cache-first para todo, está
   explicada en `public/sw.js`. */
function registrarSW() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // Ruta RELATIVA al documento: en GitHub Pages la app vive bajo /Proyecto-MCP/, y
    // una ruta absoluta ('/sw.js') apuntaría a la raíz del dominio y daría 404.
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

boot();
registrarSW();
