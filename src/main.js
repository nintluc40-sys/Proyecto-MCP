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

import { mountShell, showLoader } from './ui/shell.js';
import { registerView } from './ui/router.js';
import { connectSheets, fetchAllSheets, dataFingerprint } from './core/sheets.js';
import { startAutoRefresh } from './core/refresh.js';
import { esc } from './core/format.js';

import { supervisorView } from './views/supervisor/index.js';
import { larviculturaView } from './views/larvicultura/index.js';
import { revisionesView } from './views/revisiones/index.js';
import { visitanteView } from './views/visitante/index.js';
import { algasView } from './views/algas/index.js';
// Biología Molecular: carga DIFERIDA. Es la vista más pesada (D3, ~1.5k líneas) y
// no es de uso diario; se descarga solo al abrirla, aligerando el bundle inicial.

async function boot() {
  const app = document.getElementById('app');

  // Vistas desarrolladas
  registerView('supervisor', { label: 'Supervisor', icon: '👁️', render: supervisorView });
  registerView('larvicultura', { label: 'Larvicultura', icon: '🦐', render: larviculturaView });
  registerView('revisiones', { label: 'Revisiones', icon: '🔍', render: revisionesView });

  // Vistas en desarrollo (placeholder navegable)
  const placeholder = (label) => (root) => {
    root.innerHTML = `<div class="empty-state" style="padding:64px 20px">
      <div style="font-size:46px">🚧</div>
      <h2 style="margin:12px 0 6px;color:var(--c-brand)">${label}</h2>
      <p class="muted">Esta vista está en desarrollo.</p>
    </div>`;
  };
  registerView('maduracion', { label: 'Maduración', icon: '🥚', render: placeholder('Maduración') });
  registerView('microbiologia', { label: 'Microbiología', icon: '🧫', render: placeholder('Microbiología') });
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
  const ok = await connectSheets();
  showLoader(false);

  // Auto-refresco SIEMPRE activo. Si la conexión inicial falla, el loop queda en
  // espera (tick() sale temprano mientras !store.connected) y se reanuda solo en
  // cuanto una reconexión manual marque store.connected = true. Antes vivía dentro
  // de `if (ok)`, así que un fallo inicial lo deshabilitaba TODA la sesión aunque
  // el usuario reconectara con el botón.
  let fp = '';
  if (ok) { try { fp = dataFingerprint(await fetchAllSheets()); } catch (_) {} }
  startAutoRefresh(fp);
}

boot();
