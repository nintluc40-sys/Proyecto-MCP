/* ============================================================
   REGISTROS · render NATIVO de la ficha "PL Gramo Externo" (plg)
   Reconstrucción modular de renderPlg(): misma estructura DOM, generada desde el
   esquema y SIN handlers inline (data-* + delegación). Función PURA.
   Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */
import { vl, vlU, ev, tqCell, statusPill, saveArea, escapeHtml } from './ficha-ui.js';
import { PLG_HEADER, PLG_COLUMNS, fieldName } from '../lib/ficha-plg.schema.js';

export { statusPill, saveArea };

function metaInputs(data, today) {
  return PLG_HEADER.map((f) => {
    if (f.type === 'date') {
      return `<div class="mf"><label>${f.label}</label><input type="date" name="${f.name}" value="${ev(data, f.name, today)}"></div>`;
    }
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vl(data, f.name)}"${ph}></div>`;
  }).join('');
}

function tableHead() {
  const ths = PLG_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
  return `<thead><tr><th class="tqh">Tanque</th>${ths}</tr></thead>`;
}

function tankRow(i, data, tankNames) {
  const cells = PLG_COLUMNS.map((col) => {
    const name = fieldName(col.code, i);
    if (col.type === 'number') {
      return `<td><input type="number" name="${name}" value="${vl(data, name)}" step="${col.step}" placeholder="${escapeHtml(col.placeholder)}"></td>`;
    }
    const mw = col.code === 'e' ? 'min-width:58px;' : '';
    return `<td><input type="text" name="${name}" value="${vlU(data, name)}" placeholder="${escapeHtml(col.placeholder)}" data-upper="1" style="${mw}text-transform:uppercase"></td>`;
  }).join('');
  return `<tr><td class="tqc">${tqCell(i, tankNames)}</td>${cells}</tr>`;
}

/**
 * Render completo de la ficha PL Gramo Externo.
 * @param {object} o  { data, modLabel, tankCount, tankNames, status, today, lastSaved, recover }
 * @returns {string} HTML de la tarjeta .fc
 */
export function renderPlgFicha(o = {}) {
  const {
    data = {},
    modLabel = '',
    tankCount = 12,
    tankNames = {},
    status = 'empty',
    today = '',
    lastSaved = '—',
    recover = null,
  } = o;

  const rows = Array.from({ length: tankCount }, (_, i) => tankRow(i, data, tankNames)).join('');

  return `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">⚖️ PL Gramo Externo</div>
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
      ${saveArea({ ficha: 'plg', status, lastSaved, recover })}
    </div>
  </div>`;
}
