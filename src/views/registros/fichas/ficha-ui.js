/* ============================================================
   REGISTROS · helpers de "chrome" compartidos por las fichas nativas
   Accesores de valor (fieles a vl/vlU/ev del monolito), celda de tanque, pill de
   estado y el área de guardado (botonera). Reutilizados por cada *.render.js.
   ============================================================ */
import { escapeHtml } from '../lib/security.js';

export { escapeHtml };

/** Valor del modelo, escapado, o '' si vacío. */
export const vl = (d, k) => {
  const v = d[k];
  return v !== undefined && v !== null && v !== '' ? escapeHtml(v) : '';
};

/** Valor del modelo en MAYÚSCULAS, escapado, o '' si vacío. */
export const vlU = (d, k) => {
  const v = d[k];
  return v !== undefined && v !== null && v !== '' ? escapeHtml(String(v).toUpperCase()) : '';
};

/** Valor del modelo o un default, escapado. */
export const ev = (d, k, def = '') => escapeHtml(d[k] !== undefined && d[k] !== '' ? d[k] : def);

/** Celda TQ: número 1..12, o input editable para tanques personalizados (>12). */
export function tqCell(i, tankNames) {
  if (i < 12) return String(i + 1);
  const custom = (tankNames && tankNames[i]) || 'TQ ' + (i + 1);
  return `<input type="text" value="${escapeHtml(custom)}" data-action="tqname" data-tank="${i}" class="tqc-edit" title="Editar nombre del tanque">`;
}

/** Pill de estado (idéntico al monolito sspill). */
export function statusPill(status) {
  if (status === 'synced') return '<span class="ssp ssp-ok">✅ En Google Sheets</span>';
  if (status === 'pending') return '<span class="ssp ssp-pend">⏳ Guardado local</span>';
  return '<span class="ssp ssp-mt">○ Sin datos hoy</span>';
}

/** Área de guardado: info (último guardado + pill) + botonera, fiel a saveArea()
 *  del monolito pero con data-action en lugar de onclick. */
export function saveArea({
  ficha,
  status = 'empty',
  lastSaved = '—',
  recover = null,
  pdfAction = 'pdf',
  share = true,
} = {}) {
  const recBtn = recover
    ? `<button class="btn brec" data-action="recover" data-ficha="${ficha}" title="Recuperar autoguardado de ${escapeHtml(recover.label)}">↩ Recuperar (${escapeHtml(recover.label)})</button>`
    : '<button class="btn brec" disabled style="opacity:.35;cursor:not-allowed">↩ Recuperar</button>';
  const shareBtn = share
    ? `<button class="btn bs" data-action="share" data-ficha="${ficha}" title="Genera el PDF y lo sube a Drive para descargarlo por el QR en otro dispositivo (sin instalar el sistema)">📤 Compartir PDF</button>`
    : '';
  return `<div class="sa">
    <div class="sa-info">
      <span>💾 Último guardado: <strong>${escapeHtml(lastSaved)}</strong></span>
      <span id="sp-${ficha}">${statusPill(status)}</span>
    </div>
    <div class="sa-btns">
      <button class="btn bd" data-action="clear" data-ficha="${ficha}" title="Borrar datos">🗑 Borrar</button>
      ${recBtn}
      <button class="btn bpdf" data-action="${pdfAction}" data-ficha="${ficha}" title="PDF A4">📄 PDF</button>
      ${shareBtn}
      <button class="btn bs" data-action="save" data-ficha="${ficha}">💾 Guardar local</button>
      <button class="btn bp" data-action="sync" data-ficha="${ficha}">☁️ Guardar y sincronizar</button>
    </div>
  </div>`;
}
