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
  NIVELES, NIVEL_COLOR, areaForFormat, loadMicThresholds, MIC_AREAS,
} from './data.js';

/** Etiqueta legible de un área ('larv-agua' → 'Larvicultura · Agua'). */
const AREA_LABEL = Object.fromEntries(MIC_AREAS.map((a) => [a.key, a.label]));

/** Clave de día 'AAAA-MM-DD' (la misma que usa `daysOf` en la vista). */
export const dayKeyOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dmy = (k) => { const [y, m, d] = k.split('-'); return `${d}/${m}/${y}`; };

/**
 * UFC en notación científica NORMALIZADA: siempre `M.ME±XX` (0.0E+00, 1.3E+02, 2.5E+04).
 *
 * Antes se dejaban en crudo los valores por debajo de 1.000 y se abreviaban los demás
 * con exponente suelto, así que la misma columna mezclaba "100", "200" y "9.3e3": tres
 * formatos distintos para la misma magnitud, imposibles de comparar de un vistazo. Ahora
 * TODOS los resultados salen con una cifra decimal en la mantisa y exponente de dos
 * dígitos con signo, que es la convención del informe de laboratorio.
 */
export function toSci(v) {
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return '—';
  const n = Number(v);
  if (n === 0) return '0.0E+00';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  let e = Math.floor(Math.log10(a));
  let m = Math.round((a / Math.pow(10, e)) * 10) / 10;
  // Redondear la mantisa puede empujarla a 10.0 (9.99e3 → 10.0e3): se renormaliza para
  // que nunca salga "10.0E+03" en vez de "1.0E+04".
  if (m >= 10) { m = Math.round((m / 10) * 10) / 10; e += 1; }
  return `${sign}${m.toFixed(1)}E${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
}

/**
 * Las cuatro bandas de un parámetro en un área, con su valor de corte y su color.
 * `l`/`m`/`e` son los límites INFERIORES de Leve/Moderado/Elevado, así que la banda
 * Mínimo es "por debajo de l" y Elevado "de e en adelante".
 * @returns {?Array<{n:string, txt:string, color:string}>} null si el área/parámetro no
 *   tiene umbrales definidos (entonces no se inventa ningún criterio).
 */
export function thresholdBands(area, fkey) {
  const t = (loadMicThresholds()[area] || {})[fkey];
  if (!t || t.l === undefined || t.l === null || t.m === undefined || t.e === undefined) return null;
  return [
    { n: 'Mín', txt: '<' + toSci(t.l), color: NIVEL_COLOR['Mínimo'] },
    { n: 'Leve', txt: toSci(t.l), color: NIVEL_COLOR['Leve'] },
    { n: 'Mod', txt: toSci(t.m), color: NIVEL_COLOR['Moderado'] },
    { n: 'Elev', txt: '≥' + toSci(t.e), color: NIVEL_COLOR['Elevado'] },
  ];
}

/**
 * Celda de umbrales bajo la cabecera de un patógeno: las 4 bandas EN HORIZONTAL,
 * separadas por '/' y en el color de su nivel.
 *
 * Van sin etiqueta (`<1.0E+03/1.0E+03/5.0E+03/≥1.0E+04`) porque el nombre de cada banda
 * no cabe: medido sobre el ancho útil de la hoja (A4 apaisado, 281 mm, línea a 5 pt),
 * la forma etiquetada ocupa ~48 mm por columna y solo permitiría TRES patógenos por
 * hoja, cuando un formato típico mide entre 3 y 8. Sin etiquetas baja a ~29 mm y, como
 * la celda puede envolver a dos líneas, caben hasta 12. El color identifica la banda y
 * la leyenda de la cabecera declara el orden.
 */
function critCell(area, fkey) {
  const bands = thresholdBands(area, fkey);
  if (!bands) return '';
  return bands
    .map((b) => `<span class="thb" style="color:${b.color}">${esc(b.txt)}</span>`)
    .join('<span class="thsep">/</span>');
}

// Columnas de contexto candidatas, en el orden en que se muestran. Solo salen las que
// tengan algún dato en el día (misma regla que el Excel: no pintar columnas vacías).
// `responsable` NO va como columna: ya sale en la rejilla de metadatos de la cabecera y
// en la firma del pie, y repetirlo por fila robaba ancho a los patógenos.
const CTX_COLS = [
  { key: 'modSalaLabel', label: 'Mód./Sala' },
  { key: 'corrida', label: 'Corrida' },
  { key: 'estadio', label: 'Estadío' },
  { key: 'tipoMuestra', label: 'Tipo' },
  { key: 'ubicacion', label: 'Ubicación' },
];

const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/**
 * Agrupa filas por día y, dentro de cada día, por formato Y ÁREA.
 *
 * El área NO es una propiedad del formato: en varios formatos depende del tipo de
 * muestra de CADA fila (p. ej. 'Larvicultura · Muestra' es 'larv-agua' si es Agua y
 * 'larv-animal' si es Animal), y cada área tiene sus propios umbrales. Si se agrupara
 * solo por formato, la línea de umbrales de la tabla sería la de la primera fila y
 * contradiría el color de las demás —que sí se calcula fila a fila—: se vería una celda
 * verde bajo un umbral que la declara Leve. Por eso el área forma parte de la clave.
 */
export function groupForPdf(rows) {
  const byDay = new Map();
  (rows || []).forEach((r) => {
    const c = rowContext(r);
    if (!c.fecha || isNaN(c.fecha)) return;
    const k = dayKeyOf(c.fecha);
    if (!byDay.has(k)) byDay.set(k, { key: k, fmts: new Map() });
    const day = byDay.get(k);
    const fk = c.formatoKey || 'otros';
    const area = areaForFormat(fk, c.tipoMuestra);
    const gk = fk + '|' + area;
    if (!day.fmts.has(gk)) day.fmts.set(gk, { fmtKey: fk, area, items: [] });
    day.fmts.get(gk).items.push({ row: r, ctx: c });
  });
  return [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Tabla de un formato+área dentro de un día. '' si no queda ninguna columna con dato.
 *  `titleSuffix` distingue las tablas cuando un mismo formato aparece con varias áreas. */
function formatTable(fmtKey, area, items, titleSuffix) {
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

  const headH = ctxCols.map((c) => `<th>${esc(c.label)}</th>`).join('')
    + patCols.map((p) => `<th>${esc(p.label)}</th>`).join('');
  // Línea de umbrales: solo bajo los parámetros, igual que en el PDF de Registros, pero
  // con las CUATRO bandas (Mín/Leve/Mod/Elev) en vez de solo el corte de Leve.
  const critH = ctxCols.map(() => '<th class="pcrit"></th>').join('')
    + patCols.map((p) => `<th class="pcrit">${critCell(area, p.fkey)}</th>`).join('');

  const trs = items.map((it, i) => {
    const m = melted[i];
    const tds = ctxCols.map((c) => `<td>${esc(has(it.ctx[c.key]) ? String(it.ctx[c.key]) : '—')}</td>`).join('')
      + patCols.map((p) => {
        const e = m.get(p.key);
        if (!e || (!has(e.ufc) && !has(e.crudo))) return '<td>—</td>';
        // SIEMPRE notación científica, también en el respaldo por conteo crudo: la
        // columna es de resultado de patógeno y mezclar formatos es lo que se corrige.
        const val = toSci(has(e.ufc) ? e.ufc : e.crudo);
        const bg = e.nivel && NIVEL_COLOR[e.nivel] ? ` style="background:${NIVEL_COLOR[e.nivel]}22"` : '';
        return `<td${bg}>${esc(val)}</td>`;
      }).join('');
    return `<tr><td class="tqc">${i + 1}</td>${tds}</tr>`;
  }).join('');

  const label = (FORMATO_LABEL[fmtKey] || (MIC_FORMATS[fmtKey] || {}).label || fmtKey) + (titleSuffix || '');
  return `<div class="ftitle">${esc(label)}</div>`
    + `<table><thead><tr><th>#</th>${headH}</tr><tr class="critline"><th></th>${critH}</tr></thead><tbody>${trs}</tbody></table>`;
}

// Leyenda + la nota que explica qué es la línea de umbrales de debajo de cada patógeno
// (sin ella, las cuatro cifras apiladas no se entienden a la primera).
const LEGEND = `<div class="mic-legend">${NIVELES.map((n) => `<span class="mic-lg"><i style="background:${NIVEL_COLOR[n]}"></i>${esc(n)}</span>`).join('')}<span class="mic-lg-note">· bajo cada patógeno: umbrales Mín / Leve / Mod / Elevado (UFC/mL)</span></div>`;

const EXTRA_CSS = `
.mic-legend{display:flex;gap:10px;align-items:center;margin:4px 0 6px;font-size:6.5pt;flex-wrap:wrap}
.mic-lg{display:inline-flex;align-items:center;gap:3px;font-weight:700;color:#0f172a}
.mic-lg i{width:8px;height:8px;border-radius:2px;display:inline-block}
.mic-lg-note{color:#475569;font-weight:600}
.critline th.pcrit{font-size:5pt;font-weight:700;color:#475569;background:#f1f5f9;border-top:0;line-height:1.3;padding:2px 3px;white-space:normal}
/* Cada valor entero en su línea si hay que envolver; el corte solo ocurre en los '/'. */
.critline th.pcrit .thb{white-space:nowrap}
.critline th.pcrit .thsep{color:#94a3b8;padding:0 1px}
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
    const grupos = [...day.fmts.values()];
    // Un mismo formato puede aparecer con varias áreas ese día (Agua vs Animal): solo
    // entonces se añade el área al título, para no ensuciar el caso normal.
    const vecesPorFmt = grupos.reduce((m, g) => m.set(g.fmtKey, (m.get(g.fmtKey) || 0) + 1), new Map());
    grupos.forEach((g) => {
      const suffix = vecesPorFmt.get(g.fmtKey) > 1 ? ' · ' + (AREA_LABEL[g.area] || g.area) : '';
      const t = formatTable(g.fmtKey, g.area, g.items, suffix);
      if (!t) return;
      inner += t;
      g.items.forEach((it) => metas.push(it.ctx));
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
