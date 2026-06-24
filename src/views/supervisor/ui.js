/* ============================================================
   SUPERVISOR · helpers de presentación
   ============================================================ */
import { esc } from '../../core/format.js';

export const MOD_COLORS = [
  { bg: 'linear-gradient(135deg,#006064,#00838f)', accent: '#006064' },
  { bg: 'linear-gradient(135deg,#1565C0,#1976D2)', accent: '#1565C0' },
  { bg: 'linear-gradient(135deg,#6A1B9A,#8E24AA)', accent: '#6A1B9A' },
  { bg: 'linear-gradient(135deg,#2E7D32,#43A047)', accent: '#2E7D32' },
  { bg: 'linear-gradient(135deg,#E65100,#EF6C00)', accent: '#E65100' },
  { bg: 'linear-gradient(135deg,#AD1457,#C2185B)', accent: '#AD1457' },
  { bg: 'linear-gradient(135deg,#00695C,#00897B)', accent: '#00695C' },
  { bg: 'linear-gradient(135deg,#37474F,#546E7A)', accent: '#37474F' },
];
export const colorFor = (i) => MOD_COLORS[((i % MOD_COLORS.length) + MOD_COLORS.length) % MOD_COLORS.length];

export const fmt1 = (v, u = '') => (v === null || v === undefined || isNaN(v)) ? '—' : v.toFixed(1) + u;
export const fmt2 = (v, u = '') => (v === null || v === undefined || isNaN(v)) ? '—' : v.toFixed(2) + u;
export const fmtPop = (v) => (v === null || v === undefined || v <= 0) ? '—' : Math.round(v).toLocaleString('es-EC');

/** Mini-tarjeta KPI translúcida (sobre fondo de color).
 *  `attrs` (opcional) inyecta atributos y la marca como interactiva (clic).
 *  `alert` (opcional) tinta el KPI cuando el valor está fuera de rango. */
export function kpiGlass(icon, label, value, attrs = '', alert = false) {
  return `<div class="sv-kpi-glass${attrs ? ' sv-kpi-click' : ''}${alert ? ' sv-kpi-alert' : ''}" ${attrs}>
    <div class="sv-kpi-label">${icon} ${esc(label)}</div>
    <div class="sv-kpi-value">${esc(value)}</div>
  </div>`;
}

/** KPI de Técnico con desplegable nativo cuando hay más de uno. */
export function kpiTecnicos(tecnicos) {
  const list = (tecnicos || []).filter(Boolean);
  if (!list.length) return kpiGlass('👤', 'Técnico', '—');
  if (list.length === 1) return kpiGlass('👤', 'Técnico', list[0]);
  return `<details class="sv-kpi-glass sv-tec">
    <summary class="sv-tec-summary">
      <div class="sv-kpi-label">👤 Técnico <span class="sv-tec-caret">▾</span></div>
      <div class="sv-kpi-value">${esc(list[0])} <span class="sv-tec-more">+${list.length - 1}</span></div>
    </summary>
    <div class="sv-tec-list">
      ${list.slice(1).map((t) => `<div class="sv-tec-item">${esc(t)}</div>`).join('')}
    </div>
  </details>`;
}

/** Migas de pan navegables + botón "Volver" táctil (cómodo en móvil/tablet).
 *  El botón "Volver" apunta al nivel anterior = última miga navegable (el padre directo). */
export function breadcrumb(accent, items) {
  const navAttrs = (it) => `data-nav="${it.nav}" ${it.mod ? `data-mod="${esc(it.mod)}"` : ''} ${it.tank ? `data-tank="${esc(it.tank)}"` : ''}`;
  const parts = items.map((it) => it.nav
    ? `<button class="sv-crumb" style="color:${accent}" ${navAttrs(it)}>${esc(it.label)}</button>`
    : `<span class="sv-crumb-current">${esc(it.label)}</span>`);
  const navItems = items.filter((it) => it.nav);
  const back = navItems[navItems.length - 1];
  // Quita una flecha inicial de la etiqueta del padre (p. ej. "← Módulos") para no duplicarla.
  const backLabel = back ? esc(String(back.label).replace(/^[←‹<\s]+/, '')) : '';
  const backBtn = back
    ? `<button class="sv-back-btn" style="--sv-accent:${accent}" ${navAttrs(back)}>← Volver a ${backLabel}</button>`
    : '';
  return `${backBtn}<div class="sv-breadcrumb">${parts.join('<span class="sv-crumb-sep">›</span>')}</div>`;
}

/** Punto de semáforo con tooltip. */
export function dot(color, title) {
  return `<span class="sv-dot" style="background:${color}" title="${esc(title)}"></span>`;
}

/** Conecta un overlay-modal del Supervisor (clase `.sv-open` + `body.modal-open`):
 *  triggers de apertura, botón de cierre y clic en el backdrop. Centraliza el patrón
 *  repetido en tank/module/params/compareTanks.
 *
 *  @param {Element} root        contenedor donde viven los triggers de apertura
 *  @param {Element} overlay     el `.sv-modal` a abrir/cerrar (null = no-op)
 *  @param {object}  opts
 *  @param {string}  opts.openSel    selector de los triggers de apertura (en `root`)
 *  @param {string}  opts.closeSel   selector del botón de cierre (en `overlay`)
 *  @param {Function}[opts.onOpen]   callback tras abrir; recibe el trigger pulsado
 *  @param {Function}[opts.onClose]  callback tras cerrar (limpieza extra)
 *  @param {boolean} [opts.keyboard] true → los triggers responden a Enter/Espacio
 *                                   (solo para chips `role="button"`; NO para <button>,
 *                                   que ya disparan click nativo y se duplicarían)
 *  @returns {{open: Function, close: Function}|null} controles programáticos
 */
export function bindModal(root, overlay, { openSel, closeSel, onOpen, onClose, keyboard = false } = {}) {
  if (!overlay) return null;
  const open = (trigger) => {
    overlay.classList.add('sv-open');
    document.body.classList.add('modal-open');
    if (onOpen) onOpen(trigger);
  };
  const close = () => {
    overlay.classList.remove('sv-open');
    document.body.classList.remove('modal-open');
    if (onClose) onClose();
  };
  if (openSel) {
    root.querySelectorAll(openSel).forEach((b) => {
      b.addEventListener('click', () => open(b));
      if (keyboard) b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(b); }
      });
    });
  }
  if (closeSel) overlay.querySelector(closeSel)?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return { open, close };
}
