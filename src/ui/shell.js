/* ============================================================
   SHELL — cabecera, pestañas, conexión, filtro de fecha, toast
   ============================================================ */
import { store, on, emit, EV } from '../core/store.js';
import { connectSheets } from '../core/sheets.js';
import { changeView, setContainer, renderCurrentView } from './router.js';
import { destroyAllCharts } from '../core/charts.js';
import { fmtShort, parseAnyDate } from '../core/dates.js';
import { getField, F } from '../core/fields.js';

let els = {};

export function mountShell(appEl) {
  appEl.innerHTML = `
    <div class="app">
      <button class="nav-toggle" id="navToggle" title="Menú de vistas" aria-label="Abrir menú de vistas">☰</button>
      <aside class="side-drawer" id="sideDrawer" aria-label="Vistas del sistema">
        <div class="drawer-head"><span class="logo">🦐</span><span>Vistas del sistema</span>
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
          <div class="entry-logo">🦐</div>
          <h1 class="entry-title">Sistema de Monitoreo y Control Productivo Omarsa Mar Bravo</h1>
          <div class="entry-sub">Parámetros &nbsp;•&nbsp; Registros &nbsp;•&nbsp; Producción</div>
          <div class="entry-roles" id="entryRoles"></div>
        </div>
      </div>
      <header class="app-header">
        <div class="app-brand"><span class="logo">🦐</span><span>Sistema MCP</span></div>
        <div class="grow"></div>
        <div id="dateBar" class="row gap-2 wrap"></div>
        <button class="conn-pill" id="connPill" title="Reconectar"><span class="dot"></span><span id="connLabel">Iniciando…</span></button>
        <button class="icon-btn" id="refreshBtn" title="Refrescar ahora">⟳</button>
        <button class="icon-btn" id="darkBtn" title="Tema">🌙</button>
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
  };

  setContainer(els.content);
  renderEntryRoles();
  renderDrawer();
  bindEvents(appEl);
  showEntry(); // pantalla de ingreso por rol antes de usar el sistema

  on(EV.CONN, ({ state, label }) => setConnStatus(state, label));
  on(EV.VIEW, renderDrawer);
  on(EV.DATA, () => { renderDateBar(); renderCurrentView(); });
}

// Vistas principales del sistema (las pendientes aún no están desarrolladas).
const MAIN_VIEWS = [
  { id: 'supervisor',   label: 'Supervisor',         icon: '👁️' },
  { id: 'larvicultura', label: 'Larvicultura',       icon: '🦐' },
  { id: 'revisiones',   label: 'Revisiones',         icon: '🔍' },
  { id: 'registros',    label: 'Registros',          icon: '📝' },
  { id: 'maduracion',   label: 'Maduración',         icon: '🥚', pending: true },
  { id: 'algas',        label: 'Algas',              icon: '🌿' },
  { id: 'microbiologia', label: 'Microbiología',     icon: '🧫', pending: true },
  { id: 'biomolecular', label: 'Biología Molecular', icon: '🧬' },
  { id: 'visitante',    label: 'Visitante',          icon: '🚪' },
];

// Roles de ingreso y vistas a las que acceden ('*' = todas).
const ROLES = {
  administrativo: { label: 'Administrativo', icon: '🗝️', allow: '*' },
  tecnico:        { label: 'Técnico',        icon: '🔧', allow: ['supervisor', 'larvicultura', 'registros'] },
  supervisor:     { label: 'Supervisor',     icon: '📋', allow: ['maduracion', 'algas', 'biomolecular', 'microbiologia'] },
  chequeador:     { label: 'Chequeador',     icon: '✅', allow: [] }, // acceso a definir a futuro
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
  const def = MAIN_VIEWS.find((v) => roleAllows(v.id)); // primera vista permitida
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

export function toast(msg, type = 'info') {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
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
  appEl.querySelector('#darkBtn').addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'dark');
    appEl.querySelector('#darkBtn').textContent = dark ? '🌙' : '☀️';
    renderCurrentView();
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
  const active = store.dateFrom || store.dateTo ? 'custom' : 'all';
  els.dateBar.innerHTML = `<span class="chip">📅 ${dateRangeLabel()}</span>` +
    presets.map((p) => `<button class="pill-btn ${active === 'all' && p.id === 'all' ? 'is-active' : ''}" data-preset="${p.id}">${p.label}</button>`).join('');

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
  emit(EV.DATEFILTER);
  renderDateBar();
  renderCurrentView();
}
