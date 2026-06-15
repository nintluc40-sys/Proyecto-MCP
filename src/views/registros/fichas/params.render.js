/* ============================================================
   REGISTROS · render NATIVO de la ficha "Parámetros" (params)
   Reconstrucción modular de renderParams(): horarios × (OD/°C) por tanque, sin
   handlers inline (chkParam se conecta por delegación vía data-chkmin/data-chkmax).
   Función PURA. Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */
import { vl, vlU, ev, tqCell, statusPill, saveArea, escapeHtml } from './ficha-ui.js';
import {
  PARAMS_HEADER,
  PARAMS_METRICS,
  DEFAULT_PTIMES,
  fieldName,
} from '../lib/ficha-params.schema.js';

export { statusPill, saveArea };

function metaInputs(data, today) {
  return PARAMS_HEADER.map((f) => {
    if (f.type === 'date') {
      return `<div class="mf"><label>${f.label}</label><input type="date" name="${f.name}" value="${ev(data, f.name, today)}"></div>`;
    }
    if (f.upper) {
      return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vlU(data, f.name)}" placeholder="${escapeHtml(f.placeholder)}" data-upper="1" style="text-transform:uppercase"></div>`;
    }
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vl(data, f.name)}"${ph}></div>`;
  }).join('');
}

function tableHead(times) {
  const th1 = times
    .map((t) => `<th colspan="2" class="thgt" style="min-width:80px">${escapeHtml(t)}</th>`)
    .join('');
  const th2 = times.map(() => PARAMS_METRICS.map((m) => `<th>${m.label}</th>`).join('')).join('');
  return `<thead>
    <tr><th class="tqh">TQ</th>${th1}</tr>
    <tr><th class="tqh" style="background:var(--bg)"></th>${th2}</tr>
  </thead>`;
}

function tankRow(i, data, tankNames, times) {
  const cells = times
    .map((t) =>
      PARAMS_METRICS.map((m) => {
        const name = fieldName(m.code, i, t);
        return `<td><input class="pinp" type="number" name="${name}" value="${vl(data, name)}" step="0.01" placeholder="-" data-chkmin="${m.min}" data-chkmax="${m.max}"></td>`;
      }).join(''),
    )
    .join('');
  return `<tr><td class="tqc">${tqCell(i, tankNames)}</td>${cells}</tr>`;
}

/**
 * Render completo de la ficha Parámetros.
 * @param {object} o { data, modLabel, times, tankCount, tankNames, status, today, lastSaved, recover }
 * @returns {string} HTML de la tarjeta .fc
 */
export function renderParamsFicha(o = {}) {
  const {
    data = {},
    modLabel = '',
    times = DEFAULT_PTIMES,
    tankCount = 12,
    tankNames = {},
    status = 'empty',
    today = '',
    lastSaved = '—',
    recover = null,
  } = o;

  const rows = Array.from({ length: tankCount }, (_, i) => tankRow(i, data, tankNames, times)).join(
    '',
  );

  return `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🌡️ Parámetros en Tanques de Larvicultura</div>
      ${statusPill(status)}
    </div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${escapeHtml(modLabel)}" readonly></div>
        ${metaInputs(data, today)}
      </div>
      <div class="tw"><table class="ft" style="font-size:10.5px">
        ${tableHead(times)}
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff" style="min-width:260px"><label>Observaciones del turno</label>
          <textarea name="obs" placeholder="Notas generales…">${escapeHtml(data.obs || '')}</textarea></div>
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${vl(data, 'tec')}" placeholder="Nombre del técnico"></div>
      </div>
      ${saveArea({ ficha: 'params', status, lastSaved, recover })}
    </div>
  </div>`;
}
