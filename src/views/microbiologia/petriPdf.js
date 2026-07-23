/* ============================================================
   PDF de Placa Petri (vista Microbiología)

   Genera UN documento con VARIAS hojas: una por FECHA de muestreo, con los
   registros de ese día agrupados por formato. Réplica del PDF de Microbiología
   de Registros (public/registros/engine.js · downloadMicPDF): misma cabecera
   OMARSA, misma leyenda de semaforización, misma línea de criterios bajo cada
   parámetro, mismas observaciones y mismo pie con código verificador y firma.

   DIFERENCIA DE ORIGEN, deliberada: aquel lee el BORRADOR local de captura; éste
   lee el Google Sheet ya sincronizado a través de la capa de datos de la vista
   (rowContext/meltRow), respetando los filtros activos y el rango de fechas.

   Este módulo es PURO: construye HTML y no toca el DOM. La impresión la hace
   `printFichaDocs` de supervisor/fichaPdf.js (iframe oculto, sin pop-ups).
   ============================================================ */
import { esc } from '../../core/format.js';
import { pdfCss, fnv1a } from '../supervisor/fichaPdf.js';
import {
  rowContext, meltRow, PATHOGENS, MIC_FORMATS, FORMATO_LABEL,
  NIVELES, NIVEL_COLOR, areaForFormat, loadMicThresholds,
} from './data.js';

/** Clave de día 'AAAA-MM-DD' (la misma que usa `daysOf` en la vista). */
export const dayKeyOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dmy = (k) => { const [y, m, d] = k.split('-'); return `${d}/${m}/${y}`; };

/** UFC en notación científica compacta (2.3e3). Espeja micToSci del motor. */
export function toSci(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e < 3) return String(Math.round(v * 100) / 100);
  const m = v / Math.pow(10, e);
  return `${Math.round(m * 10) / 10}e${e}`;
}

/** Texto del criterio de aceptación de un parámetro en un área ("<1e3" = límite de Leve). */
export function critText(area, fkey) {
  const t = (loadMicThresholds()[area] || {})[fkey];
  if (!t || t.l === undefined || t.l === null) return '';
  return '< ' + toSci(t.l);
}

// Columnas de contexto candidatas, en el orden en que se muestran. Solo salen las que
// tengan algún dato en el día (misma regla que el Excel: no pintar columnas vacías).
const CTX_COLS = [
  { key: 'modSalaLabel', label: 'Mód./Sala' },
  { key: 'corrida', label: 'Corrida' },
  { key: 'estadio', label: 'Estadío' },
  { key: 'tipoMuestra', label: 'Tipo' },
  { key: 'ubicacion', label: 'Ubicación' },
  { key: 'responsable', label: 'Responsable' },
];

const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/** Agrupa filas por día y, dentro de cada día, por formato. */
export function groupForPdf(rows) {
  const byDay = new Map();
  (rows || []).forEach((r) => {
    const c = rowContext(r);
    if (!c.fecha || isNaN(c.fecha)) return;
    const k = dayKeyOf(c.fecha);
    if (!byDay.has(k)) byDay.set(k, { key: k, fmts: new Map() });
    const day = byDay.get(k);
    const fk = c.formatoKey || 'otros';
    if (!day.fmts.has(fk)) day.fmts.set(fk, []);
    day.fmts.get(fk).push({ row: r, ctx: c });
  });
  return [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Tabla de un formato dentro de un día. '' si no queda ninguna columna con dato. */
function formatTable(fmtKey, items) {
  const melted = items.map((it) => {
    const m = new Map();
    meltRow(it.row).forEach((p) => m.set(p.key, p));
    return m;
  });
  const ctxCols = CTX_COLS.filter((c) => items.some((it) => has(it.ctx[c.key])));
  const patCols = PATHOGENS.filter((p) => melted.some((m) => {
    const e = m.get(p.key);
    return e && (has(e.ufc) || has(e.crudo));
  }));
  if (!patCols.length && !ctxCols.length) return '';

  const area = areaForFormat(fmtKey, items[0].ctx.tipoMuestra);
  const headH = ctxCols.map((c) => `<th>${esc(c.label)}</th>`).join('')
    + patCols.map((p) => `<th>${esc(p.label)}</th>`).join('');
  // Línea de criterios: solo bajo los parámetros, igual que en el PDF de Registros.
  const critH = ctxCols.map(() => '<th class="pcrit"></th>').join('')
    + patCols.map((p) => `<th class="pcrit">${esc(critText(area, p.fkey))}</th>`).join('');

  const trs = items.map((it, i) => {
    const m = melted[i];
    const tds = ctxCols.map((c) => `<td>${esc(has(it.ctx[c.key]) ? String(it.ctx[c.key]) : '—')}</td>`).join('')
      + patCols.map((p) => {
        const e = m.get(p.key);
        if (!e || (!has(e.ufc) && !has(e.crudo))) return '<td>—</td>';
        const val = has(e.ufc) ? toSci(e.ufc) : String(e.crudo);
        const bg = e.nivel && NIVEL_COLOR[e.nivel] ? ` style="background:${NIVEL_COLOR[e.nivel]}22"` : '';
        return `<td${bg}>${esc(val)}</td>`;
      }).join('');
    return `<tr><td class="tqc">${i + 1}</td>${tds}</tr>`;
  }).join('');

  const label = FORMATO_LABEL[fmtKey] || (MIC_FORMATS[fmtKey] || {}).label || fmtKey;
  return `<div class="ftitle">${esc(label)}</div>`
    + `<table><thead><tr><th>#</th>${headH}</tr><tr class="critline"><th></th>${critH}</tr></thead><tbody>${trs}</tbody></table>`;
}

const LEGEND = `<div class="mic-legend">${NIVELES.map((n) => `<span class="mic-lg"><i style="background:${NIVEL_COLOR[n]}"></i>${esc(n)}</span>`).join('')}</div>`;

const EXTRA_CSS = `
.mic-legend{display:flex;gap:10px;align-items:center;margin:4px 0 6px;font-size:6.5pt}
.mic-lg{display:inline-flex;align-items:center;gap:3px;font-weight:700;color:#0f172a}
.mic-lg i{width:8px;height:8px;border-radius:2px;display:inline-block}
.critline th.pcrit{font-size:5.5pt;font-weight:600;color:#475569;background:#f1f5f9;border-top:0}
.ftitle{font-size:8pt;font-weight:800;color:#0f172a;margin:6px 0 3px;text-transform:uppercase;letter-spacing:.3px}
`;

/** Cabecera de una hoja: franja OMARSA + rejilla de metadatos del día. */
function pageHead(dayKey, metas) {
  const uniq = (a) => [...new Set(a.filter((x) => has(x)).map((x) => String(x).trim()))];
  const cors = uniq(metas.map((c) => c.corrida));
  const resp = uniq(metas.map((c) => c.responsable));
  const deptos = uniq(metas.map((c) => c.departamento));
  const cell = (l, v) => `<div class="mf"><label>${esc(l)}</label><span>${esc(v || '—')}</span></div>`;
  return `<div class="ph">
      <div class="ph-brand"><div class="co">OMARSA · Microbiología</div><div class="su">Análisis microbiológico — UFC/mL (notación científica)</div></div>
      <div class="ph-center"><span class="doc-code">OMR-MIC</span></div>
      <div class="ph-right"><div class="mod">Mic</div><div class="mods">Microbiología</div></div>
    </div>
    <div class="mgrid">
      ${cell('Fecha muestreo', dmy(dayKey))}
      ${cell('Corrida', cors.join(' · '))}
      ${cell('Departamento', deptos.join(' · '))}
      ${cell('Responsable', resp.join(' · '))}
    </div>`;
}

function pageFoot(codigo, tsStr, resp) {
  return `<div class="pfoot">
      <div><div style="font-size:6pt;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
        <div class="code-box">${esc(codigo)}</div><div class="ts-txt" style="margin-top:2px">Generado el ${esc(tsStr)}</div></div>
      <div style="text-align:center;min-width:140px">
        <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">${esc(resp || 'Responsable')}</div>
        <div style="font-size:5pt;color:#64748b;margin-top:1px">Analista</div></div>
    </div>`;
}

/**
 * Documento completo listo para `printFichaDocs`.
 * @param {object[]} rows  filas de Microbiología YA filtradas (filtros de vista + rango).
 * @param {object} [opts]  { from, to } sólo para el nombre del archivo.
 * @returns {{page:string, fileName:string, pages:number, days:string[]}}
 *   `pages` = 0 si no hubo nada imprimible (el llamante avisa y no imprime).
 */
export function buildPetriPdfDoc(rows, opts = {}) {
  const groups = groupForPdf(rows);
  const tsStr = new Date().toLocaleString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const days = [];
  const body = groups.map((day) => {
    const metas = [];
    let inner = '';
    [...day.fmts.entries()].forEach(([fk, items]) => {
      const t = formatTable(fk, items);
      if (!t) return;
      inner += t;
      items.forEach((it) => metas.push(it.ctx));
    });
    if (!inner) return '';
    // Observaciones del día: se agrupan las distintas y se listan una vez cada una.
    const obs = [...new Set(metas.map((c) => String(c.obs || '').trim()).filter(Boolean))];
    const obsHtml = obs.length
      ? `<div class="obs-block"><div class="lbl">Observaciones</div><div class="txt">${esc(obs.join(' · '))}</div></div>`
      : '';
    // Código verificador DETERMINISTA sobre el contenido de la hoja: el mismo día con
    // los mismos datos da siempre el mismo código (el sello de generación queda fuera).
    const codigo = 'MIC-' + day.key.replace(/-/g, '') + '-'
      + fnv1a(`${day.key}|${inner}|${obs.join('|')}`).toString(16).toUpperCase().padStart(8, '0').slice(-6);
    const resp = [...new Set(metas.map((c) => c.responsable).filter(has))][0] || '';
    days.push(day.key);
    return `<div class="ppage">${pageHead(day.key, metas)}${LEGEND}${inner}${obsHtml}<div class="spacer"></div>${pageFoot(codigo, tsStr, resp)}</div>`;
  }).join('');

  const tag = (opts.from || opts.to) ? `_${(opts.from || 'inicio')}_a_${(opts.to || 'fin')}` : '';
  const fileName = `MICRO_PlacaPetri${tag}`.replace(/[\\/:*?"<>|]/g, '');
  const page = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(fileName)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${pdfCss('params')}${EXTRA_CSS}</style></head><body>${body}</body></html>`;
  return { page, fileName, pages: days.length, days };
}
