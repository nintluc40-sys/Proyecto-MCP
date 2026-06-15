/* ============================================================
   REGISTROS · render NATIVO de la ficha "Población" (poblacion)
   Reconstrucción modular de renderPoblacion(): CS (Cantidad Sembrada), sv auto,
   totales computados (rcPob), multiplicador ×1000. Sin handlers inline:
   po → data-feeds="poblacion" (rcPob); botón CS → data-action="cs" (openCS).
   El motor llama rcPob() tras renderizar para llenar los computados.
   Función PURA. Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */
import { vl, vlU, ev, tqCell, statusPill, saveArea, escapeHtml } from './ficha-ui.js';
import {
  POBLACION_HEADER,
  fieldName,
  hasCS,
  csSummary,
} from '../lib/ficha-poblacion.schema.js';

export { statusPill, saveArea };

function metaInputs(data, today, now, csTotal) {
  const editable = POBLACION_HEADER.map((f) => {
    if (f.type === 'date') {
      return `<div class="mf"><label>${f.label}</label><input type="date" name="${f.name}" value="${ev(data, f.name, today)}"></div>`;
    }
    if (f.type === 'time') {
      return `<div class="mf"><label>${f.label}</label><input type="time" name="${f.name}" value="${ev(data, f.name, now)}"></div>`;
    }
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vl(data, f.name)}"${ph}></div>`;
  });
  // CTA Sembrada (computado, readonly) va tras Corrida; N° Siembra al final.
  const cta = `<div class="mf"><label>CTA Sembrada</label>
    <input type="number" name="cta" value="${csTotal > 0 ? csTotal : ''}" readonly
      style="background:#f0fdf4;color:#065f46;font-weight:700;font-family:var(--mono)"
      title="Suma automática de la Cantidad Sembrada (CS) de todos los tanques (en miles)."></div>`;
  // Inserta CTA antes del último (N° Siembra).
  editable.splice(editable.length - 1, 0, cta);
  return editable.join('');
}

function tankRow(i, data, tankNames, cs) {
  const auto = hasCS(cs, i);
  const svInput = auto
    ? `<input type="number" name="${fieldName('sv', i)}" value="${vl(data, fieldName('sv', i))}" class="sv-auto" readonly title="Calculado automáticamente desde Cantidad Sembrada (botón CS)">`
    : `<input type="number" name="${fieldName('sv', i)}" value="${vl(data, fieldName('sv', i))}" min="0" max="100" step="0.01" placeholder="%">`;
  return `<tr>
    <td class="tqc">${tqCell(i, tankNames)}</td>
    <td>${svInput}</td>
    <td><input type="number" name="${fieldName('po', i)}" value="${vl(data, fieldName('po', i))}" placeholder="Ej: 4300" data-feeds="poblacion" title="Ingrese en miles. Ej: 4300 = 4,300,000"></td>
    <td><input type="text" name="${fieldName('lt', i)}" value="${vlU(data, fieldName('lt', i))}" placeholder="Lote" data-upper="1" style="text-transform:uppercase"></td>
    <td><input type="text" name="${fieldName('e', i)}" value="${vlU(data, fieldName('e', i))}" placeholder="N5…PL" data-upper="1" style="text-transform:uppercase"></td>
    <td><input type="number" name="${fieldName('sal', i)}" value="${vl(data, fieldName('sal', i))}" step="0.01" placeholder="ppt"></td>
  </tr>`;
}

/**
 * @param {object} o { data, modLabel, cs, tankCount, tankNames, status, today, now, lastSaved, recover }
 * @returns {string} HTML de la tarjeta .fc
 */
export function renderPoblacionFicha(o = {}) {
  const {
    data = {},
    modLabel = '',
    cs = {},
    tankCount = 12,
    tankNames = {},
    status = 'empty',
    today = '',
    now = '',
    lastSaved = '—',
    recover = null,
  } = o;

  const { count: csCount, total: csTotal } = csSummary(cs);
  const rows = Array.from({ length: tankCount }, (_, i) => tankRow(i, data, tankNames, cs)).join('');

  const csBtn = `<button type="button" class="cs-btn ${csCount > 0 ? 'has-data' : ''}" data-action="cs"
    title="Cantidad Sembrada · población inicial por tanque (×1000). ${csCount > 0 ? csCount + ' tanque(s) con dato' : 'Sin datos'}">CS${csCount > 0 ? ' · ' + csCount : ''}</button>`;

  return `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🧮 Población Laboratorio</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${statusPill(status)}
        ${csBtn}
      </div>
    </div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${escapeHtml(modLabel)}" readonly></div>
        ${metaInputs(data, today, now, csTotal)}
      </div>
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#065f46;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">ℹ️</span>
        <span><strong>Multiplicador ×1000:</strong> Ingrese el valor en miles. Ej: escribir <strong>4300</strong> → se envía <strong>4.300.000,00</strong> a Google Sheets.</span>
      </div>
      <div class="tw"><table class="ft">
        <thead>
          <tr>
            <th class="tqh">Tanque</th>
            <th>% Supervivencia</th>
            <th>Población <span style="font-weight:400;font-size:8px;opacity:.8">(en miles)</span></th>
            <th>Lote</th>
            <th>Estadío</th>
            <th>Salinidad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="tr-tot">
            <td style="background:var(--bg);color:#fff;font-family:var(--mono);font-weight:700;padding:5px 8px">TOTAL</td>
            <td></td>
            <td id="td-tot">—</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table></div>
      <div class="meta" style="margin-top:12px">
        <div class="mf"><label>Total Población</label>
          <input type="number" name="total_p" id="inp-tot" value="${escapeHtml(data.total_p || '')}" readonly
            style="background:#f0fdf4;color:#065f46;font-weight:700;font-family:var(--mono)"></div>
        <div class="mf"><label>% Sobrevivencia Global</label>
          <input type="number" name="sobrev" id="inp-sobrev" value="${escapeHtml(data.sobrev || '')}" step="0.01" placeholder="%" readonly
            style="background:#f0fdf4;color:#065f46;font-weight:700;font-family:var(--mono)"
            title="Calculado automáticamente: (Total Población / Total CS) × 100"></div>
        <div class="mf"><label>% Mort. Diaria</label>
          <input type="number" name="mort_d" id="inp-mortd" value="${escapeHtml(data.mort_d || '')}" step="0.01" placeholder="%" readonly
            style="background:#fef3c7;color:#92400e;font-weight:700;font-family:var(--mono)"
            title="Calculado automáticamente: promedio de % Mortalidad por tanque desde la ficha de Calidad Larvaria"></div>
      </div>
      <div class="ffoot">
        <div class="ff" style="min-width:260px"><label>Observaciones</label>
          <textarea name="obs" placeholder="Notas adicionales…">${escapeHtml(data.obs || '')}</textarea></div>
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${vl(data, 'tec')}" placeholder="Nombre del técnico"></div>
      </div>
      ${saveArea({ ficha: 'poblacion', status, lastSaved, recover })}
    </div>
  </div>`;
}
