/* ============================================================
   REGISTROS · render NATIVO de la ficha "Despacho" (despacho)
   Reconstrucción modular de renderDespacho(): TON, select Destino, sv auto (CS),
   columnas computadas (Densidad/Biomasa). Sin handlers inline:
     po  → data-desp-po  (rcDespSv + rcDespBiomasa + rcDespDensidad)
     pgm → data-desp-pgm (rcDespBiomasa)
     TON → data-action="ton" (openTON)
   DESTINO_OPTS lo pasa el motor (`destinos`). rcDesp* se llaman tras render.
   Función PURA. Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */
import { vl, vlU, ev, tqCell, statusPill, saveArea, escapeHtml } from './ficha-ui.js';
import { DESPACHO_HEADER, DESPACHO_COLUMNS, fieldName, tonCount } from '../lib/ficha-despacho.schema.js';
import { hasCS } from '../lib/ficha-poblacion.schema.js';

export { statusPill, saveArea };

function metaInputs(data, today, now) {
  return DESPACHO_HEADER.map((f) => {
    if (f.type === 'date') {
      return `<div class="mf"><label>${f.label}</label><input type="date" name="${f.name}" value="${ev(data, f.name, today)}"></div>`;
    }
    if (f.type === 'time') {
      return `<div class="mf"><label>${f.label}</label><input type="time" name="${f.name}" value="${ev(data, f.name, now)}"></div>`;
    }
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vl(data, f.name)}"${ph}></div>`;
  }).join('');
}

function tableHead() {
  const ths = DESPACHO_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
  return `<thead><tr><th class="tqh">Tanque</th>${ths}</tr></thead>`;
}

function destinoCell(i, cur, destinos) {
  const opts = destinos
    .map((o) => `<option value="${escapeHtml(o)}"${cur === o ? ' selected' : ''}>${escapeHtml(o)}</option>`)
    .join('');
  return `<td><select name="${fieldName('de', i)}" style="min-width:120px">
    <option value=""${cur === '' ? ' selected' : ''}>— Selecciona —</option>
    ${opts}
  </select></td>`;
}

function cell(col, i, data, cs, destinos) {
  const name = fieldName(col.code, i);
  switch (col.kind) {
    case 'estadio':
      return `<td><input type="text" name="${name}" value="${vlU(data, name)}" placeholder="N5…PL" data-upper="1" style="min-width:58px;text-transform:uppercase"></td>`;
    case 'sv': {
      const auto = hasCS(cs, i);
      return auto
        ? `<td><input type="number" name="${name}" value="${vl(data, name)}" class="sv-auto" readonly title="Calculado desde CS (Población)"></td>`
        : `<td><input type="number" name="${name}" value="${vl(data, name)}" min="0" max="100" step="0.01" placeholder="%"></td>`;
    }
    case 'computed':
      return `<td><input type="number" name="${name}" value="${vl(data, name)}" class="sv-auto" readonly title="${escapeHtml(col.title)}"></td>`;
    case 'destino':
      return destinoCell(i, data[name] || '', destinos);
    case 'piscina':
      return `<td><input type="text" name="${name}" value="${vl(data, name)}" placeholder="${escapeHtml(col.placeholder)}" pattern="\\d+(\\s*-\\s*\\d+)?" title="Número (Ej: 55) o par separado por guión (Ej: 55-60)" style="min-width:90px"></td>`;
    case 'number':
    default: {
      const range = col.min !== undefined ? ` min="${col.min}"` : '';
      const recalc = col.recalc ? ` data-desp-${col.recalc}="1"` : '';
      return `<td><input type="number" name="${name}" value="${vl(data, name)}"${range} step="${col.step || 'any'}" placeholder="${escapeHtml(col.placeholder || '')}"${recalc}></td>`;
    }
  }
}

function tankRow(i, data, tankNames, cs, destinos) {
  const cells = DESPACHO_COLUMNS.map((col) => cell(col, i, data, cs, destinos)).join('');
  return `<tr><td class="tqc">${tqCell(i, tankNames)}</td>${cells}</tr>`;
}

/**
 * @param {object} o { data, modLabel, cs, ton, destinos, tankCount, tankNames, status, today, now, lastSaved, recover }
 * @returns {string} HTML de la tarjeta .fc
 */
export function renderDespachoFicha(o = {}) {
  const {
    data = {},
    modLabel = '',
    cs = {},
    ton = {},
    destinos = [],
    tankCount = 12,
    tankNames = {},
    status = 'empty',
    today = '',
    now = '',
    lastSaved = '—',
    recover = null,
  } = o;

  const tCount = tonCount(ton);
  const rows = Array.from({ length: tankCount }, (_, i) =>
    tankRow(i, data, tankNames, cs, destinos),
  ).join('');

  const tonBtn = `<button type="button" class="cs-btn ${tCount > 0 ? 'has-data' : ''}" data-action="ton"
    title="Toneladas por tanque — base para la Densidad cosechada. ${tCount > 0 ? tCount + ' tanque(s) con dato' : 'Sin datos'}">TON.${tCount > 0 ? ' · ' + tCount : ''}</button>`;

  return `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🚚 Despacho</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${statusPill(status)}
        ${tonBtn}
      </div>
    </div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${escapeHtml(modLabel)}" readonly></div>
        ${metaInputs(data, today, now)}
      </div>
      <div class="tw"><table class="ft">
        ${tableHead()}
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${vl(data, 'tec')}" placeholder="Nombre del técnico"></div>
      </div>
      ${saveArea({ ficha: 'despacho', status, lastSaved, recover })}
    </div>
  </div>`;
}
