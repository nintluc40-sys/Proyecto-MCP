/* ============================================================
   REGISTROS · render NATIVO de la ficha "Desinfección" (desinfeccion)
   Reconstrucción modular de renderDesinfeccion(). La ficha se organiza por TIPOS
   (DESINF_TYPES) → categorías → elementos; los TIPOS y el generador de tablas
   `_dxCatTable` los pasa el motor (`types`/`catTable`), no se reimplementan.
   Sin handlers inline: fecha → data-dx-fecha (dxFechaChange), tipo → data-dx-tipo
   (dxSwitchType). PDF propio (downloadDesinfeccionPDF) y SIN botón Compartir.
   Función PURA. Ref: docs/analisis/05-ficha-estandar-spec.md
   ============================================================ */
import { vl, ev, statusPill, saveArea, escapeHtml } from './ficha-ui.js';
import { DESINF_HEADER } from '../lib/ficha-desinfeccion.schema.js';

export { statusPill, saveArea };

function metaInputs(data, today) {
  return DESINF_HEADER.map((f) => {
    if (f.type === 'date') {
      return `<div class="mf"><label>${f.label}</label><input type="date" name="${f.name}" value="${ev(data, f.name, today)}" data-dx-fecha title="Cambia la fecha de TODAS las filas; luego puedes editar cada fila"></div>`;
    }
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div class="mf"><label>${f.label}</label><input name="${f.name}" value="${vl(data, f.name)}"${ph}></div>`;
  }).join('');
}

/**
 * @param {object} o
 *   { data, modLabel, types, catTable, status, today, lastSaved, recover }
 *   - types: DESINF_TYPES (del motor). catTable(t, cat, data): HTML de una categoría.
 * @returns {string} HTML de la tarjeta .fc
 */
export function renderDesinfeccionFicha(o = {}) {
  const {
    data = {},
    modLabel = '',
    types = [],
    catTable = () => '',
    status = 'empty',
    today = '',
    lastSaved = '—',
    recover = null,
  } = o;

  const selTipo = String(data._tipo || '1');

  const typeOpts = types
    .map(
      (t) =>
        `<option value="${t.n}"${String(t.n) === selTipo ? ' selected' : ''}>Tipo ${t.n} — ${escapeHtml(t.label)}</option>`,
    )
    .join('');

  const blocks = types
    .map((t) => {
      const shown = String(t.n) === selTipo;
      const cats = t.cats.map((cat) => catTable(t, cat, data)).join('');
      const obsGen = t.obsGen
        ? `<div class="ffoot"><div class="ff" style="min-width:260px"><label>Observaciones generales</label>
            <textarea name="dx_${t.n}_obsgen" placeholder="Notas generales del registro…">${escapeHtml(data['dx_' + t.n + '_obsgen'] || '')}</textarea></div></div>`
        : '';
      return `<div class="dx-type" data-tipo="${t.n}" style="display:${shown ? 'block' : 'none'}">${cats}${obsGen}</div>`;
    })
    .join('');

  return `<div class="fc">
    <div class="fc-h">
      <div class="fc-t">🧴 Desinfección</div>
      ${statusPill(status)}
    </div>
    <div class="fc-b">
      <div class="meta">
        <div class="mf"><label>Módulo</label><input value="${escapeHtml(modLabel)}" readonly></div>
        ${metaInputs(data, today)}
        <div class="mf"><label>Tipo de Registro</label>
          <select name="_tipo" data-dx-tipo style="font-weight:600">${typeOpts}</select></div>
      </div>
      <div style="background:#ecfeff;border:1.5px solid #a5f3fc;border-radius:8px;padding:7px 12px;margin-bottom:10px;font-size:11px;color:#0e7490;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">🧴</span>
        <span>Marca <b>Sí/No</b> la desinfección de cada elemento. Cambia el <b>Tipo de Registro</b> para llenar otra grilla (todas se guardan juntas). Solo se envían las filas con estado marcado.</span>
      </div>
      ${blocks}
      ${saveArea({ ficha: 'desinfeccion', status, lastSaved, recover, pdfAction: 'pdfdesinf', share: false })}
    </div>
  </div>`;
}
