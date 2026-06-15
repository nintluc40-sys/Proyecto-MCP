/* ============================================================
   REGISTROS · render NATIVO de la ficha "Calidad de Agua" (calagua)
   Reconstrucción modular de renderCalidadAgua(). La columna Color reutiliza el
   widget del motor (aguaColorSelectHtml, inyectado como `colorSelect`) para no
   reimplementar la lógica de colores por estadío; el resync estadío→color se
   conecta por delegación (data-agua-est → aguaSyncRowColor). Función PURA.
   Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */
import { vl, ev, tqCell, statusPill, saveArea, escapeHtml } from './ficha-ui.js';
import { CALAGUA_HEADER, CALAGUA_COLUMNS, fieldName } from '../lib/ficha-calagua.schema.js';

export { statusPill, saveArea };

// Fallback del widget de color cuando el motor no está (tests/standalone): input simple.
const defaultColorSelect = (i, _estRaw, curVal) =>
  `<input name="${fieldName('tr', i)}" value="${escapeHtml(curVal || '')}" placeholder="Color">`;

function metaInputs(data, today) {
  return CALAGUA_HEADER.map((f) => {
    if (f.type === 'date') {
      return `<div class="mf"><label>${f.label}</label><input type="date" name="${f.name}" value="${ev(data, f.name, today)}"></div>`;
    }
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vl(data, f.name)}"${ph}></div>`;
  }).join('');
}

function tableHead() {
  const ths = CALAGUA_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
  return `<thead><tr><th class="tqh">Tanque</th>${ths}</tr></thead>`;
}

function cell(col, i, data, colorSelect) {
  const name = fieldName(col.code, i);
  if (col.kind === 'estadio') {
    const estRaw = String(data[name] || '').toUpperCase().trim();
    return `<td><input type="text" name="${name}" value="${escapeHtml(estRaw)}" placeholder="N5…PL" data-upper="1" data-agua-est="1" style="min-width:58px;text-transform:uppercase"></td>`;
  }
  if (col.kind === 'color') {
    const estRaw = String(data[fieldName('e', i)] || '').toUpperCase().trim();
    const curVal = data[name] !== undefined && data[name] !== null ? String(data[name]) : '';
    return `<td>${colorSelect(i, estRaw, curVal)}</td>`;
  }
  if (col.kind === 'number') {
    const range = col.min !== undefined ? ` min="${col.min}" max="${col.max}"` : '';
    return `<td><input type="number" name="${name}" value="${vl(data, name)}"${range} step="${col.step}" placeholder="${escapeHtml(col.placeholder)}"></td>`;
  }
  // text
  return `<td><input type="text" name="${name}" value="${vl(data, name)}" placeholder="${escapeHtml(col.placeholder)}" style="min-width:140px"></td>`;
}

function tankRow(i, data, tankNames, colorSelect) {
  const cells = CALAGUA_COLUMNS.map((col) => cell(col, i, data, colorSelect)).join('');
  return `<tr><td class="tqc">${tqCell(i, tankNames)}</td>${cells}</tr>`;
}

/**
 * @param {object} o { data, modLabel, tankCount, tankNames, status, today, lastSaved, recover, colorSelect }
 *   colorSelect(i, estRaw, curVal) → HTML de la celda Color (default: el del motor).
 * @returns {string} HTML de la tarjeta .fc
 */
export function renderCalaguaFicha(o = {}) {
  const {
    data = {},
    modLabel = '',
    tankCount = 12,
    tankNames = {},
    status = 'empty',
    today = '',
    lastSaved = '—',
    recover = null,
    colorSelect = defaultColorSelect,
  } = o;

  const rows = Array.from({ length: tankCount }, (_, i) =>
    tankRow(i, data, tankNames, colorSelect),
  ).join('');

  return `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">💧 Calidad de Agua</div>
      ${statusPill(status)}
    </div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${escapeHtml(modLabel)}" readonly></div>
        ${metaInputs(data, today)}
      </div>
      <div class="tw"><table class="ft">
        ${tableHead()}
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${vl(data, 'tec')}" placeholder="Nombre del técnico"></div>
      </div>
      ${saveArea({ ficha: 'calagua', status, lastSaved, recover })}
    </div>
  </div>`;
}
