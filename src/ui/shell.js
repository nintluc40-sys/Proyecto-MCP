/* ============================================================
   SHELL — cabecera, menú lateral (drawer), conexión y filtro de fecha
   ============================================================ */
import { store, on, EV } from '../core/store.js';
import { connectSheets } from '../core/sheets.js';
import { changeView, setContainer, renderCurrentView } from './router.js';
import { destroyAllCharts } from '../core/charts.js';
import { fmtShort, parseAnyDate } from '../core/dates.js';
import { getField, F } from '../core/fields.js';
import { toast } from './toast.js';
// Logo corporativo (pantalla de entrada). Vite lo resuelve a un asset con hash.
import logoUrl from '../assets/logo.png';

let els = {};

// Clave de tema en localStorage. Namespace del proyecto; NO es una clave de contrato
// de Registros (esas persisten datos de fichas), sólo preferencia visual.
const THEME_KEY = 'larv4_theme';

// Aplica el tema (claro/oscuro) al documento y sincroniza el icono del botón.
function applyTheme(dark) {
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  if (els.dark) els.dark.textContent = dark ? '☀️' : '🌙';
}

export function mountShell(appEl) {
  appEl.innerHTML = `
    <div class="app">
      <button class="nav-toggle" id="navToggle" title="Menú de vistas" aria-label="Abrir menú de vistas">☰</button>
      <aside class="side-drawer" id="sideDrawer" aria-label="Vistas del sistema">
        <div class="drawer-head"><span class="logo"><img class="logo-img" src="${logoUrl}" alt="" /></span><span>Vistas del sistema</span>
          <button class="drawer-x" id="drawerClose" aria-label="Cerrar menú">✕</button>
        </div>
        <nav class="drawer-nav" id="drawerNav"></nav>
        <div class="drawer-foot">
          <div class="drawer-role" id="drawerRole"></div>
          <button class="drawer-logout" id="changeRole">↩ Cambiar rol</button>
        </div>
      </aside>
      <div class="drawer-backdrop" id="drawerBackdrop"></div>
      <div class="entry-screen" id="entryScreen">
        <div class="entry-card">
          <div class="entry-logo"><img class="entry-logo-img" src="${logoUrl}" alt="Logo Omarsa" /></div>
          <h1 class="entry-title">Sistema de Monitoreo y Control Productivo Omarsa Mar Bravo</h1>
          <div class="entry-sub">Parámetros &nbsp;•&nbsp; Registros &nbsp;•&nbsp; Producción</div>
          <div class="entry-roles" id="entryRoles"></div>
        </div>
      </div>
      <header class="app-header">
        <div class="app-brand"><span class="logo"><img class="logo-img" src="${logoUrl}" alt="" /></span><span>Sistema MCP</span></div>
        <div class="grow"></div>
        <div id="dateBar" class="row gap-2 wrap"></div>
        <button class="conn-pill" id="connPill" title="Reconectar"><span class="dot"></span><span id="connLabel">Iniciando…</span></button>
        <button class="icon-btn" id="refreshBtn" title="Refrescar ahora">⟳</button>
        <button class="icon-btn" id="darkBtn" title="Cambiar tema (claro/oscuro)" aria-label="Cambiar tema claro u oscuro">🌙</button>
      </header>
      <main class="app-main"><div id="dashboardContent"></div></main>
      <div class="loader" id="loader"><div class="spinner"></div></div>
    </div>`;

  els = {
    drawer: appEl.querySelector('#sideDrawer'),
    drawerNav: appEl.querySelector('#drawerNav'),
    drawerRole: appEl.querySelector('#drawerRole'),
    backdrop: appEl.querySelector('#drawerBackdrop'),
    entry: appEl.querySelector('#entryScreen'),
    entryRoles: appEl.querySelector('#entryRoles'),
    pill: appEl.querySelector('#connPill'),
    label: appEl.querySelector('#connLabel'),
    content: appEl.querySelector('#dashboardContent'),
    loader: appEl.querySelector('#loader'),
    dateBar: appEl.querySelector('#dateBar'),
    dark: appEl.querySelector('#darkBtn'),
  };

  setContainer(els.content);
  renderEntryRoles();
  renderDrawer();
  bindEvents(appEl);
  // Tema persistido (localStorage): se aplica ANTES del primer render para que los
  // gráficos se instancien ya con la paleta correcta (evita un re-render al cargar).
  try { applyTheme(localStorage.getItem(THEME_KEY) === 'dark'); } catch (_) { /* storage no disponible */ }
  showEntry(); // pantalla de ingreso por rol antes de usar el sistema

  on(EV.CONN, ({ state, label, warn }) => {
    setConnStatus(state, label);
    // Carga degradada (solo 1 hoja): avisa explícitamente en lugar de dejar todas
    // las vistas vacías en silencio. Ver `warn` en connectSheets (core/sheets.js).
    if (warn) {
      toast('Solo se cargó 1 hoja del documento. La descarga completa (todas las hojas) probablemente falló: reintenta con el indicador de conexión o publica el Sheet en la web (Archivo → Compartir → Publicar). Mientras tanto, la mayoría de vistas quedarán sin datos.', 'err', 9000);
    }
  });
  on(EV.VIEW, renderDrawer);
  // Al cambiar de vista, la barra de fecha vuelve a mostrarse por defecto (EV.VIEW se
  // emite ANTES de renderizar la nueva vista, que la re-ocultará si le corresponde).
  on(EV.VIEW, () => setDateBarHidden(false));
  on(EV.DATA, () => { renderDateBar(); renderCurrentView(); });
}

// Vistas principales del sistema (las pendientes aún no están desarrolladas).
// Exportado para el test de caracterización (shell.test.js).
export const MAIN_VIEWS = [
  { id: 'supervisor',   label: 'Supervisor',         icon: '👁️' },
  { id: 'larvicultura', label: 'Larvicultura',       icon: '🦐' },
  { id: 'revisiones',   label: 'Revisiones',         icon: '🔍' },
  { id: 'registros',    label: 'Registros',          icon: '📝' },
  { id: 'maduracion',   label: 'Maduración',         icon: '🥚', pending: true },
  { id: 'algas',        label: 'Algas',              icon: '🌿' },
  { id: 'microbiologia', label: 'Microbiología',     icon: '🧫' },
  { id: 'biomolecular', label: 'Biología Molecular', icon: '🧬' },
  { id: 'visitante',    label: 'Visitante',          icon: '🚪' },
];

// Roles de ingreso y vistas a las que acceden ('*' = todas).
// Exportado para el test de caracterización (shell.test.js) que fija este contrato.
export const ROLES = {
  administrativo: { label: 'Administrativo', icon: '🗝️', allow: '*' },
  tecnico:        { label: 'Técnico',        icon: '🔧', allow: ['supervisor', 'larvicultura', 'registros'] },
  supervisor:     { label: 'Supervisor',     icon: '📋', allow: ['supervisor', 'revisiones', 'registros', 'algas', 'microbiologia', 'biomolecular', 'maduracion'] },
  chequeador:     { label: 'Chequeador',     icon: '✅', allow: ['larvicultura'] },
  visitante:      { label: 'Visitante',      icon: '🚪', allow: ['visitante'] },
};

const roleAllows = (viewId) => {
  const r = ROLES[store.role];
  return !!r && (r.allow === '*' || r.allow.includes(viewId));
};

function renderDrawer() {
  const items = MAIN_VIEWS.filter((v) => roleAllows(v.id));
  els.drawerNav.innerHTML = items.length
    ? items.map((v) => `<button class="drawer-item ${v.id === store.currentView ? 'is-active' : ''}" data-view="${v.id}">
        <span class="di-ic">${v.icon}</span><span class="di-lb">${v.label}</span>${v.pending ? '<span class="di-tag">en desarrollo</span>' : ''}
      </button>`).join('')
    : '<div class="empty-state" style="padding:24px">Elige un rol para comenzar.</div>';
  if (els.drawerRole) els.drawerRole.textContent = store.role ? `Rol: ${ROLES[store.role].label}` : '';
}

function renderEntryRoles() {
  els.entryRoles.innerHTML = Object.entries(ROLES).map(([k, r]) =>
    `<button class="entry-role" data-role="${k}"><span class="er-ic">${r.icon}</span><span class="er-lb">${r.label}</span></button>`).join('');
}

function selectRole(key) {
  if (!ROLES[key]) return;
  store.role = key;
  // Vista inicial: la primera permitida que YA esté desarrollada (evita aterrizar en
  // un placeholder 🚧, p. ej. el rol "Supervisor" caía en Maduración). Si el rol solo
  // tiene vistas pendientes, cae a la primera permitida como respaldo.
  const def = MAIN_VIEWS.find((v) => roleAllows(v.id) && !v.pending)
    || MAIN_VIEWS.find((v) => roleAllows(v.id));
  renderDrawer();
  hideEntry();
  if (def) changeView(def.id);
  else { destroyAllCharts(); els.content.innerHTML = '<div class="empty-state" style="padding:64px 20px">🔒 Tu rol aún no tiene vistas asignadas.</div>'; }
}

function showEntry() { els.entry.classList.remove('is-hidden'); }
function hideEntry() { els.entry.classList.add('is-hidden'); }

function openDrawer() { els.drawer.classList.add('is-open'); els.backdrop.classList.add('is-open'); }
function closeDrawer() { els.drawer.classList.remove('is-open'); els.backdrop.classList.remove('is-open'); }

function setConnStatus(state, label) {
  els.pill.className = 'conn-pill is-' + state;
  els.label.textContent = label;
}

export function showLoader(on) { els.loader.classList.toggle('is-active', !!on); }

// Oculta/muestra la barra de fecha global. La usa la Vista Ejecutiva del Supervisor,
// cuyo periodo lo define su navegador de meses (allí los presets 7/30/Todo no aplican).
// Se restablece a visible en cada cambio de vista (EV.VIEW) para no "arrastrar" el
// ocultamiento a otras vistas; el Supervisor lo re-aplica en cada render si procede.
export function setDateBarHidden(hidden) {
  if (els.dateBar) els.dateBar.classList.toggle('is-datebar-hidden', !!hidden);
}

function bindEvents(appEl) {
  appEl.querySelector('#navToggle').addEventListener('click', () => {
    els.drawer.classList.contains('is-open') ? closeDrawer() : openDrawer();
  });
  appEl.querySelector('#drawerClose').addEventListener('click', closeDrawer);
  els.backdrop.addEventListener('click', closeDrawer);
  els.drawerNav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) { changeView(btn.dataset.view); closeDrawer(); }
  });
  els.entryRoles.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role]');
    if (btn) selectRole(btn.dataset.role);
  });
  appEl.querySelector('#changeRole').addEventListener('click', () => { closeDrawer(); showEntry(); });
  els.pill.addEventListener('click', async () => { showLoader(true); await connectSheets(); showLoader(false); });
  appEl.querySelector('#refreshBtn').addEventListener('click', async () => { showLoader(true); await connectSheets(); showLoader(false); });
  els.dark.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(!dark);
    try { localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark'); } catch (_) { /* storage no disponible */ }
    renderCurrentView();
  });
  // Escape cierra el drawer cuando está abierto (no la pantalla de ingreso por rol,
  // que es una compuerta obligatoria sin la que el sistema no puede usarse).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.drawer.classList.contains('is-open')) closeDrawer();
  });
}

/* ---- Filtro de fecha global (presets por mes/año + rango) ---- */
function renderDateBar() {
  const dates = store.globalData
    .map((r) => parseAnyDate(getField(r, F.fecha)))
    .filter((d) => d && !isNaN(d));
  if (!dates.length) { els.dateBar.innerHTML = ''; return; }

  const presets = [
    { id: 'all', label: 'Todo' },
    { id: '30', label: '30 días' },
    { id: '7', label: '7 días' },
  ];
  // Deriva qué preset está activo a partir del rango real (sin estado extra): así
  // los botones "7/30 días" SÍ se resaltan al elegirlos (antes sólo "Todo" podía
  // marcarse y los demás nunca reflejaban la selección).
  let active = 'all';
  if (store.dateFrom && store.dateTo) {
    const days = Math.round((store.dateTo - store.dateFrom) / 86400000) + 1;
    active = days === 7 ? '7' : days === 30 ? '30' : 'custom';
  } else if (store.dateFrom || store.dateTo) {
    active = 'custom';
  }
  els.dateBar.innerHTML = `<span class="chip">📅 ${dateRangeLabel()}</span>` +
    presets.map((p) => `<button class="pill-btn ${active === p.id ? 'is-active' : ''}" data-preset="${p.id}">${p.label}</button>`).join('');

  els.dateBar.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => applyPreset(b.dataset.preset)));
}

// Etiqueta del rango de fecha activo (local; no confundir con rangeLabel de core/dates.js).
function dateRangeLabel() {
  if (!store.dateFrom && !store.dateTo) return 'Todos los datos';
  if (store.dateFrom && store.dateTo) return `${fmtShort(store.dateFrom)} – ${fmtShort(store.dateTo)}`;
  return store.dateFrom ? 'Desde ' + fmtShort(store.dateFrom) : 'Hasta ' + fmtShort(store.dateTo);
}

function applyPreset(id) {
  if (id === 'all') { store.dateFrom = null; store.dateTo = null; }
  else {
    const days = +id;
    const to = store.latestDateMs ? new Date(store.latestDateMs) : new Date();
    const from = new Date(to); from.setDate(from.getDate() - days + 1);
    store.dateFrom = from; store.dateTo = to;
  }
  renderDateBar();
  renderCurrentView();
}
