/* ============================================================
   REGISTROS · render NATIVO de la ficha "Calidad"
   Reconstrucción modular de renderCalidad() del monolito: misma estructura DOM
   (clases .fc/.ft/.meta… de registros.css) pero GENERADA desde el esquema y SIN
   handlers inline — los inputs llevan data-* para delegación de eventos.
   Función PURA (string in → string out), totalmente testeable.
   Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */
import { escapeHtml, vl, vlU, ev, tqCell, statusPill, saveArea } from './ficha-ui.js';
import {
  CALIDAD_HEADER,
  CALIDAD_GROUPS,
  CALIDAD_ESTADIO,
  CALIDAD_CODES,
  fieldName,
} from '../lib/ficha-calidad.schema.js';

// Re-export para compatibilidad con quien importaba estos helpers desde aquí.
export { statusPill, saveArea };

// Presentación de las bandas superiores (no es parte del esquema de datos).
const BAND_PRESENTATION = {
  'Sanidad N5–M3': { label: 'SANIDAD — Estadios N5–M3', cls: 'thg' },
  'Post-larva': { label: 'SANIDAD — Post-larva', cls: 'thg2' },
  Calidad: { label: 'CALIDAD', cls: 'thg3' },
};

const COL_BY_CODE = Object.fromEntries(
  CALIDAD_GROUPS.flatMap((g) => g.cols).map((c) => [c.code, c]),
);

/** Cabecera de la tabla (3 filas con bandas) generada desde el esquema. */
function tableHead() {
  // Banda superior por grupo contiguo de la misma banda.
  const bands = [];
  for (const g of CALIDAD_GROUPS) {
    const prev = bands[bands.length - 1];
    if (prev && prev.band === g.band) prev.span += g.cols.length;
    else bands.push({ band: g.band, span: g.cols.length });
  }
  const row1 =
    `<th rowspan="3" class="tqh">TQ</th><th rowspan="3">${CALIDAD_ESTADIO.label}</th>` +
    bands
      .map((b) => {
        const p = BAND_PRESENTATION[b.band] || { label: b.band, cls: '' };
        return `<th colspan="${b.span}" class="${p.cls}">${p.label}</th>`;
      })
      .join('');

  // Subgrupos: si el grupo tiene `sub`, una celda con colspan; si no, una por columna.
  const row2 = CALIDAD_GROUPS.map((g) =>
    g.sub
      ? `<th colspan="${g.cols.length}">${g.sub}</th>`
      : g.cols.map((c) => `<th>${c.label}</th>`).join(''),
  ).join('');

  const row3 = CALIDAD_CODES.map((code) => `<th>${COL_BY_CODE[code].label}</th>`).join('');

  return `<thead><tr>${row1}</tr><tr>${row2}</tr><tr>${row3}</tr></thead>`;
}

/** Una fila de tanque (estadio + 16 numéricos), sin onclick inline. */
function tankRow(i, data, tankNames) {
  const est = vlU(data, fieldName(CALIDAD_ESTADIO.code, i));
  const cells = CALIDAD_CODES.map((code) => {
    const feeds = COL_BY_CODE[code].feedsPoblacion ? ' data-feeds="poblacion"' : '';
    return `<td><input type="number" name="${fieldName(code, i)}" value="${vl(data, fieldName(code, i))}" min="0" max="100" step="0.1"${feeds}></td>`;
  }).join('');
  return `<tr>
    <td class="tqc">${tqCell(i, tankNames)}</td>
    <td><input type="text" name="${fieldName(CALIDAD_ESTADIO.code, i)}" value="${est}" placeholder="${CALIDAD_ESTADIO.placeholder}" data-upper="1" style="min-width:58px;text-transform:uppercase"></td>
    ${cells}
  </tr>`;
}

/**
 * Render completo de la ficha Calidad.
 * @param {object} o
 * @param {object} o.data        datos guardados (objeto `data` de la ficha) — opcional
 * @param {string} o.modLabel    etiqueta del módulo (p.ej. "M01")
 * @param {number} o.tankCount   nº de tanques (default 12)
 * @param {object} o.tankNames   nombres personalizados por índice (>12)
 * @param {string} o.status      'empty' | 'pending' | 'synced'
 * @param {string} o.today       fecha por defecto YYYY-MM-DD
 * @param {string} o.now         hora por defecto HH:MM
 * @returns {string} HTML de la tarjeta .fc
 */
export function renderCalidadFicha(o = {}) {
  const {
    data = {},
    modLabel = '',
    tankCount = 12,
    tankNames = {},
    status = 'empty',
    today = '',
    now = '',
    lastSaved = '—',
    recover = null,
  } = o;

  const metaExtra = CALIDAD_HEADER.map((f) => {
    if (f.type === 'date') {
      return `<div class="mf"><label>${f.label}</label><input type="date" name="${f.name}" value="${ev(data, f.name, today)}"></div>`;
    }
    if (f.type === 'time') {
      return `<div class="mf"><label>${f.label}</label><input type="time" name="${f.name}" value="${ev(data, f.name, now)}"></div>`;
    }
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vl(data, f.name)}"${ph}></div>`;
  }).join('');

  const rows = Array.from({ length: tankCount }, (_, i) => tankRow(i, data, tankNames)).join('');

  return `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🔬 Registro Sanidad y Calidad de Larvas</div>
      ${statusPill(status)}
    </div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${escapeHtml(modLabel)}" readonly></div>
        ${metaExtra}
      </div>
      <div class="tw"><table class="ft">
        ${tableHead()}
        <tbody>${rows}</tbody>
      </table></div>
      <div class="ffoot">
        <div class="ff"><label>Técnico Responsable</label>
          <input name="tec" value="${vl(data, 'tec')}" placeholder="Nombre del técnico"></div>
      </div>
      ${saveArea({ ficha: 'calidad', status, lastSaved, recover })}
    </div>
  </div>`;
}
