/* ============================================================
   TRAZABILIDAD · Núcleo PDF nativo de fichas (dashboard).
   Porta las plantillas compactas de Registros (cabecera/pie/CSS) SIN páginas de
   gráficos: cada PDF = la hoja (tabla con datos). Un documento = varias .ppage
   (una por día). El HTML de la TABLA lo aportan los adaptadores por ficha
   (tandas siguientes) vía `pages[].tableHtml`.
   Fiel a engine.js pdfHeader/pdfFooter/pdfCss, adaptado al módulo del dashboard
   (mod = 'M01'…'CIO', sin globals del motor de captura).
   ============================================================ */
import { esc } from '../../core/format.js';
import { parseAnyDate } from '../../core/dates.js';

// Metadatos por ficha estándar. `label` = nombre corto para la UI (modal/toast);
// `title` = título formal para la cabecera del PDF. También: icono, código de
// documento y abreviaturas para el código verificador y el nombre de archivo.
// El orden = el de presentación en la UI (registro FICHA_IDS).
const FICHA_META = {
  calidad:   { label: 'Calidad Larvaria',    title: 'Registro Sanidad y Calidad de Larvas',    icon: '🔬', doc: 'OMR-LAB-M-FOR-039', abb: 'CAL', file: 'CL' },
  plg:       { label: 'PLG (gramo externo)', title: 'PL Gramo Externo',                        icon: '⚖️', doc: 'OMR-LAB-M-FOR-040', abb: 'PLG', file: 'PL' },
  poblacion: { label: 'Población',           title: 'Población Laboratorio',                   icon: '🧮', doc: 'OMR-LAB-M-FOR-040', abb: 'POB', file: 'PB' },
  params:    { label: 'Parámetros',          title: 'Parámetros en Tanques — OD y Temperatura', icon: '🌡️', doc: 'OMR-LAB-M-FOR-045', abb: 'PAR', file: 'PA' },
  calagua:   { label: 'Calidad de Agua',     title: 'Calidad de Agua',                         icon: '💧', doc: 'OMR-LAB-M-FOR-CAG', abb: 'CAG', file: 'CA' },
  despacho:  { label: 'Despacho',            title: 'Despacho',                                icon: '🚚', doc: 'OMR-LAB-M-FOR-DES', abb: 'DES', file: 'DP' },
  desinfeccion: { label: 'Desinfección',     title: 'Registro de Limpieza y Desinfección',     icon: '🧴', doc: 'OMR-LAB-FOR-042',   abb: 'DXF', file: 'DX' },
};
const REV_LINE = {
  calidad: 'Revisión: 002 — Vigencia: 21/11/2025',
  params: 'Versión 0 — Fecha de aprobación 1-ago.-2015',
};

/** Ids de ficha soportados, en orden de presentación (Calidad, PLG, Población, Parámetros, Cal. Agua, Despacho, Desinfección). */
export const FICHA_IDS = Object.keys(FICHA_META);
/** ¿`fid` es una ficha estándar soportada? */
export const isFichaId = (fid) => Object.prototype.hasOwnProperty.call(FICHA_META, fid);
/** Etiqueta corta de la ficha para la UI (modal/toast). El título formal del PDF es FICHA_META.title. */
export const fichaLabel = (fid) => (FICHA_META[fid] || {}).label || fid;

const p2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const todayISO = () => isoOf(new Date());
// Normaliza cualquier fecha soportada (ISO o dd/mm/yyyy del Sheet) a yyyy-mm-dd,
// con fallback a hoy. La hoja de producción guarda dd/mm/yyyy → sin esto, el
// nombre del PDF y el código verificador caerían a la fecha de hoy / con barras.
export const toIsoDate = (fecha) => {
  const d = parseAnyDate(fecha);
  return d ? isoOf(d) : todayISO();
};
const modSubtitle = (mod) => (mod === 'CIO' ? 'Módulo CIO' : `Módulo ${mod}`);
const modMetaLabel = (mod) => (mod === 'CIO' ? 'CIO' : 'Módulo');
const cleanFile = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();

/** Hash FNV-1a de 32 bits. No es criptográfico: solo una huella corta y estable.
 *  Exportado para que otros PDF del sistema (p. ej. el de Placa Petri en la vista de
 *  Microbiología) deriven su código verificador con el MISMO algoritmo determinista. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 con desplazamientos (evita perder bits en coma flotante).
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Código verificador = huella DETERMINISTA del contenido de la página.
// Antes se derivaba de `Date.now()` y de un contador de sesión, así que el MISMO documento
// salía con un código distinto en cada exportación: no verificaba nada. Ahora el mismo
// contenido produce siempre el mismo código y un cambio en cualquier dato lo cambia, que es
// lo que permite cotejar dos copias impresas.
// El sello de generación ("Generado el …") queda FUERA del hash a propósito: cambia en cada
// impresión y va aparte en el pie.
// OJO: `public/registros/engine.js` mantiene su propio generador por sesión (el comentario
// previo decía "igual patrón que el motor"); desde este cambio YA NO coinciden. El del
// dashboard es reproducible, el del motor no.
function genCodigo(fid, mod, fecha, payload) {
  const iso = toIsoDate(fecha);
  const hex = fnv1a(`${fid}|${mod}|${iso}|${payload || ''}`).toString(16).toUpperCase().padStart(8, '0').slice(-6);
  const abb = (FICHA_META[fid] || {}).abb || 'FIC';
  const dg = (String(mod).replace(/\D/g, '') || '0').padStart(2, '0');
  return `${abb}${dg}-${iso.replace(/-/g, '')}-${hex}`;
}

/** Nombre por defecto del archivo PDF (el navegador lo sugiere al guardar). */
export function pdfFilename(fid, mod, fecha, corrida) {
  const code = (FICHA_META[fid] || {}).file || 'FIC';
  const dStr = toIsoDate(fecha);
  const cor = cleanFile(corrida);
  return `${code}_${dStr}_${mod}${cor ? '-' + cor : ''}`;
}

// CSS del PDF (A4 apaisado, unidades mm para mapear 1:1 al papel). Idéntico al del
// motor SALVO el bloque de gráficos (aquí no hay páginas de gráficos).
/** Hoja de estilo de impresión compartida por los PDF del sistema (A4 apaisado).
 *  `fid` solo ajusta dos detalles de ancho de columna; el resto es común, por eso lo
 *  reutiliza también el PDF de Placa Petri (con 'params', igual que el de Registros). */
export function pdfCss(fid) {
  const isP = fid === 'params';
  const isC = fid === 'calidad';
  return `
@page{size:A4 landscape;margin:5mm 8mm}
@page :first{size:A4 landscape;margin:5mm 8mm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
html,body{background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#111;width:281mm;margin:0 auto;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
.ppage{width:281mm;min-height:200mm;padding:0;display:flex;flex-direction:column}
@media print{
  html,body{width:281mm;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  .ppage{width:281mm;min-height:200mm;page-break-after:always}
  .ppage:last-child{page-break-after:auto}
  *,*::before,*::after{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
}
/* HEADER */
.ph{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #09192e;padding-bottom:3px;margin-bottom:4px}
.ph-brand .co{font-size:11pt;font-weight:800;color:#09192e}
.ph-brand .su{font-size:6.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.7px}
.ph-center{text-align:center;flex:1;padding:0 10px}
.ph-center .doc-code{font-family:monospace;font-size:8pt;font-weight:800;color:#09192e;letter-spacing:.5px;background:#f0fdfa;border:1.5px solid #99f6e4;border-radius:3px;padding:2px 8px;display:inline-block}
.ph-right{text-align:right}
.ph-right .mod{font-size:11pt;font-weight:800;color:#09192e}
.ph-right .mods{font-size:6.5pt;color:#64748b}
.ftitle{font-size:9pt;font-weight:800;color:#fff;background:#09192e;padding:3px 10px;margin-bottom:4px;border-radius:2px;display:flex;align-items:center;gap:5px}
/* META */
.mgrid,.mgrid2{display:flex;flex-wrap:wrap;gap:2px 18px;margin-bottom:4px}
.mf{display:flex;flex-direction:column;gap:0px}
.mf label{font-size:6.5pt;text-transform:uppercase;letter-spacing:.4px;color:#0f766e;font-weight:800}
.mf span{font-size:8.5pt;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:1px;min-width:60px}
/* TABLE */
table{border-collapse:collapse;width:100%}
th{background:#0f2942;color:#fff;padding:${isP ? '2px 3px' : isC ? '2px 2px' : '3px 4px'};text-align:center;font-size:${isP ? '6.5pt' : isC ? '5.5pt' : '7.5pt'};font-weight:700;border:1px solid #1e3a5f;white-space:nowrap}
td{border:1px solid #d1d5db;padding:${isP ? '2px 2px' : isC ? '2px 2px' : '3px 4px'};text-align:center;color:#111;font-size:${isP ? '7pt' : isC ? '6.5pt' : '8pt'};white-space:nowrap}
tr:nth-child(even) td{background:#f0fdfa}
.tqc{background:#09192e!important;color:#fff!important;font-weight:800;font-size:${isP ? '7pt' : '7.5pt'};width:28px;min-width:28px}
.thg {background:#0d6b5e!important;color:#fff!important;font-size:${isC ? '5.5pt' : '7pt'}!important;font-weight:800!important;letter-spacing:.2px!important}
.thg2{background:#312e81!important;color:#e0e7ff!important;font-size:${isC ? '5.5pt' : '7pt'}!important;font-weight:800!important}
.thg3{background:#166534!important;color:#dcfce7!important;font-size:${isC ? '5.5pt' : '7pt'}!important;font-weight:800!important}
.thgt{background:#fff!important;color:#0f172a!important;font-size:${isP ? '6.5pt' : '7pt'}!important;font-weight:700!important}
.empty{color:#9ca3af;font-style:italic;font-size:7pt}
/* OBS */
.obs-block{border:1px solid #e2e8f0;border-radius:3px;padding:4px 10px;margin-top:4px;background:#f8fafc}
.obs-block .lbl{font-size:6.5pt;text-transform:uppercase;color:#0f766e;font-weight:800;margin-bottom:1px}
.obs-block .txt{font-size:8pt;color:#0f172a;line-height:1.4}
/* FOOTER */
.spacer{flex:1;min-height:2px}
.pfoot{border-top:1.5px solid #cbd5e1;padding-top:4px;display:flex;align-items:flex-end;justify-content:space-between;margin-top:4px}
.code-box{font-family:monospace;font-size:7pt;font-weight:800;color:#09192e;background:#f0fdfa;padding:3px 8px;border-radius:3px;border:1.5px solid #99f6e4;letter-spacing:.6px}
.ts-txt{font-size:6.5pt;color:#9ca3af;margin-top:1px}
.rev-line{text-align:center;font-size:6.5pt;color:#64748b;letter-spacing:.3px;margin-top:4px;padding-top:3px;border-top:1px dashed #e2e8f0}
`;
}

// `d` = datos de cabecera del día: fecha, corrida, tec, hora, estadio.
function pdfHeader(fid, mod, d) {
  const meta = FICHA_META[fid] || {};
  const extraMeta = fid === 'params'
    ? `<div class="mf"><label>Estadío</label><span>${esc(String(d.estadio || '—'))}</span></div>
       <div class="mf"><label>Hora registro</label><span>${esc(String(d.hora || '—'))}</span></div>`
    : `<div class="mf"><label>Hora</label><span>${esc(String(d.hora || '—'))}</span></div>
       <div class="mf" style="visibility:hidden"></div>`;
  return `<div class="ph">
    <div class="ph-brand">
      <div class="co">OMARSA · Larvicultura</div>
      <div class="su">Sistema de Fichas Larvicultura</div>
    </div>
    ${meta.doc ? '<div class="ph-center"><span class="doc-code">' + esc(meta.doc) + '</span></div>' : ''}
    <div class="ph-right">
      <div class="mod">${esc(mod)}</div>
      <div class="mods">${esc(modSubtitle(mod))}</div>
    </div>
  </div>
  <div class="ftitle">${meta.icon || ''} ${esc(meta.title || fid)}</div>
  <div class="mgrid">
    <div class="mf"><label>${esc(modMetaLabel(mod))}</label><span>${esc(mod)}</span></div>
    <div class="mf"><label>Fecha</label><span>${esc(String(d.fecha || todayISO()))}</span></div>
    <div class="mf"><label>Corrida</label><span>${esc(String(d.corrida || '—'))}</span></div>
    <div class="mf"><label>Técnico</label><span>${esc(String(d.tec || '—'))}</span></div>
    ${extraMeta}
  </div>`;
}

function pdfFooter(codigo, tsStr, tec, fid) {
  const rev = REV_LINE[fid] ? `<div class="rev-line">${esc(REV_LINE[fid])}</div>` : '';
  return `<div class="pfoot">
    <div>
      <div style="font-size:6pt;color:#64748b;margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px">Código verificador</div>
      <div class="code-box">${esc(codigo)}</div>
      <div class="ts-txt" style="margin-top:2px">Generado el ${esc(tsStr)}</div>
    </div>
    <div style="text-align:center;min-width:140px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">${esc(tec || 'Técnico Responsable')}</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Firma del Responsable</div>
    </div>
    <div style="text-align:center;min-width:120px">
      <div style="border-top:1.5px solid #0f172a;padding-top:3px;margin-top:12px;font-size:6.5pt;font-weight:700;color:#0f172a">Supervisor</div>
      <div style="font-size:5pt;color:#64748b;margin-top:1px">Visto Bueno</div>
    </div>
  </div>${rev}`;
}

/**
 * Construye el documento HTML imprimible de UNA ficha (multipágina: 1 .ppage/día).
 * @param {object} o
 * @param {string} o.fid  ficha ('calidad'|'plg'|'params'|'poblacion'|'calagua'|'despacho')
 * @param {string} o.mod  módulo ('M01'…'CIO')
 * @param {string} o.fileName  nombre sugerido del archivo
 * @param {Array<{d:object, tableHtml:string, obs?:string}>} o.pages  una por día
 * @param {boolean} [o.autoPrint=true]  incluir el script que auto-imprime al cargar
 *   (true para ventana propia; false cuando el padre controla la impresión, p.ej. iframe).
 * @returns {string} HTML completo (con CSS)
 */
export function buildFichaPdfDoc({ fid, mod, fileName, pages = [], autoPrint = true }) {
  const tsStr = new Date().toLocaleString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const body = pages.map((pg) => {
    const d = pg.d || {};
    const obsTxt = pg.obs != null ? pg.obs : d.obs;
    // El código se calcula sobre el contenido REAL de la página (tabla + observaciones).
    const codigo = genCodigo(fid, mod, d.fecha, `${pg.tableHtml || ''}|${obsTxt || ''}`);
    const obsHtml = obsTxt ? `<div class="obs-block"><div class="lbl">Observaciones del turno</div><div class="txt">${esc(String(obsTxt))}</div></div>` : '';
    return `<div class="ppage">${pdfHeader(fid, mod, d)}${pg.tableHtml || ''}${obsHtml}<div class="spacer"></div>${pdfFooter(codigo, tsStr, d.tec, fid)}</div>`;
  }).join('');
  const printScript = autoPrint ? `
  <script>
    try { document.title = ${JSON.stringify(fileName)}; } catch(_){}
    var _printed=false;
    function doPrint(){if(_printed)return;_printed=true;setTimeout(function(){window.print();},350);}
    if(document.readyState==='complete')doPrint();
    else window.addEventListener('load',doPrint,{once:true});
  </script>` : '';
  return `<!DOCTYPE html><html lang="es"><head>
  <meta charset="UTF-8">
  <title>${esc(fileName)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${pdfCss(fid)}</style>
</head><body>
  ${body}${printScript}
</body></html>`;
}

/**
 * Imprime uno o varios documentos de ficha SIN pop-ups: renderiza cada uno en un
 * iframe oculto y los encadena en SECUENCIA (el siguiente al cerrarse el diálogo
 * del anterior, vía onafterprint; watchdog de respaldo por si no dispara). Cada
 * documento = un "Guardar como PDF". Evita el bloqueo de ventanas emergentes al
 * descargar varios tipos de ficha de una sola vez.
 * @param {Array<{page:string, fileName:string}>} docs
 * @param {(n:number, total:number, fileName:string)=>void} [onProgress]  se invoca al abrir
 *   CADA documento (n = 1-based). Sin esto la secuencia es muda: el usuario ve varios
 *   diálogos de "Guardar como PDF" seguidos sin saber por cuál va.
 * @returns {boolean} false si no hay documentos o no hay DOM.
 */
export function printFichaDocs(docs, onProgress) {
  if (!Array.isArray(docs) || !docs.length) return false;
  if (typeof document === 'undefined' || !document.body) return false;
  let idx = 0;
  const next = () => {
    if (idx >= docs.length) return;
    const { page, fileName } = docs[idx++];
    // El aviso de progreso nunca debe tumbar la impresión.
    if (typeof onProgress === 'function') { try { onProgress(idx, docs.length, fileName); } catch (_) { /* noop */ } }
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    let done = false, watchdog = 0;
    const finish = () => {
      if (done) return; done = true;
      if (watchdog) clearTimeout(watchdog);
      setTimeout(() => { try { iframe.remove(); } catch (_) { /* noop */ } next(); }, 200);
    };
    const trigger = () => {
      try {
        try { win.document.title = fileName; } catch (_) { /* noop */ }
        win.onafterprint = finish;
        // Respaldo (antes de print, para que finish pueda limpiarlo): si onafterprint
        // no dispara (algunos navegadores/Guardar-como-PDF), avanza tras un margen amplio.
        watchdog = setTimeout(finish, 90000);
        win.focus();
        win.print();
      } catch (_) { finish(); }
    };
    try {
      win.document.open();
      win.document.write(page);
      win.document.close();
    } catch (_) { finish(); return; }
    if (win.document.readyState === 'complete') setTimeout(trigger, 60);
    else win.addEventListener('load', () => setTimeout(trigger, 60), { once: true });
  };
  next();
  return true;
}
