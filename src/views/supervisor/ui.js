/* ============================================================
   SUPERVISOR · helpers de presentación
   ============================================================ */
import { esc, fmtPop } from '../../core/format.js';

// Re-export: fmtPop ahora vive en core/format.js (compartido con Visitante).
// Se re-exporta aquí para que los módulos internos del Supervisor que ya lo
// importan desde './ui.js' sigan funcionando sin cambios.
export { fmtPop };

const MOD_COLORS = [
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

/** Mini-tarjeta KPI translúcida (sobre fondo de color).
 *  `attrs` (opcional) inyecta atributos y la marca como interactiva (clic).
 *  `alert` (opcional) tinta el KPI cuando el valor está fuera de rango. */
export function kpiGlass(icon, label, value, attrs = '', alert = false) {
  return `<div class="sv-kpi-glass${attrs ? ' sv-kpi-click' : ''}${alert ? ' sv-kpi-alert' : ''}" ${attrs}>
    <div class="sv-kpi-label">${icon} ${esc(label)}</div>
    <div class="sv-kpi-value">${esc(value)}</div>
  </div>`;
}

/** KPI de Técnico: muestra el primer responsable (+N si hay más) y despliega la lista
 *  completa al pulsarlo. Con un solo técnico no hay nada que desplegar y queda inerte.
 *  Los nombres salen de la columna «Técnico» de la hoja (`dedupeTecnicos` los unifica). */
export function kpiTecnicos(tecnicos) {
  const list = (tecnicos || []).filter(Boolean);
  if (!list.length) return kpiGlass('👤', 'Técnico', '—');
  const value = list[0] + (list.length > 1 ? ` +${list.length - 1}` : '');
  if (list.length === 1) return kpiGlass('👤', 'Técnico', value);
  return `<div class="sv-kpi-glass sv-kpi-click sv-tec-kpi" data-tec-toggle role="button" tabindex="0"
    aria-expanded="false" title="Ver los ${list.length} técnicos del módulo">
    <div class="sv-kpi-label">👤 Técnico</div>
    <div class="sv-kpi-value">${esc(value)} <span class="sv-tec-caret" aria-hidden="true">▾</span></div>
    <div class="sv-tec-list" hidden>${list.map((t) => `<span class="sv-tec-item">${esc(t)}</span>`).join('')}</div>
  </div>`;
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

/** Abrevia el nombre de un técnico: "Juan Murillo" → "J. Murillo".
 *  Solo se inicializa el PRIMER token y el resto se conserva íntegro: en español no se
 *  puede saber por posición si "Juan Carlos Murillo" tiene dos nombres de pila o un
 *  nombre y dos apellidos, y recortar a ciegas inventaría un apellido que no es. */
export function abbrevTecnico(name) {
  const t = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!t.length) return '';
  if (t.length === 1) return t[0];
  return `${t[0].charAt(0).toUpperCase()}. ${t.slice(1).join(' ')}`;
}

/** Lista abreviada de técnicos para la tarjeta: hasta `max` nombres y "+N" para el resto.
 *  Devuelve { short, full } — `full` va en el title para no perder la lista completa. */
export function tecnicosShort(tecnicos, max = 2) {
  const list = (tecnicos || []).filter(Boolean);
  if (!list.length) return { short: '', full: '' };
  const shown = list.slice(0, max).map(abbrevTecnico).join(' · ');
  const rest = list.length - max;
  return { short: rest > 0 ? `${shown} +${rest}` : shown, full: list.join(' · ') };
}

/** Punto de semáforo con tooltip. */
export function dot(color, title) {
  return `<span class="sv-dot" style="background:${color}" title="${esc(title)}"></span>`;
}

// bindModal vive ahora en src/ui/modal.js: sólo Supervisor tenía diálogos con semántica
// y foco atrapado, mientras los 10 modales de Microbiología no llevaban ni role="dialog".
// Se re-exporta para no tocar los 11 puntos del Supervisor que ya lo importan de aquí.
export { bindModal } from '../../ui/modal.js';
