/* ============================================================
   SUPERVISOR · Resumen Operativo del Módulo

   ⚠ MAPA DEL ARCHIVO — son ~2.170 líneas y CINCO bloques sin relación entre sí.
   Léelo por bloques; casi nunca hay que tocar más de uno a la vez. Los tres modales
   de abajo no aportan datos propios: reutilizan la capa PURA de otras vistas
   (microbiologia/data.js, microbiologia/petri.js, microbiologia/calagua.data.js), así
   que su lógica de negocio no vive aquí — aquí sólo vive su presentación.

     · ~40-190    helpers de comentarios (matutino/vespertino), memo por datos, y
                  BIOMOLECULAR: alias de columnas, filtrado por módulo y tooltip.
     · ~192-406   gráficos Biomol en D3: heatmap, swarm y gel.
     · ~407-671   MICROBIOLOGÍA del módulo: placa de agar, tabla, heatmap y tendencias.
     · ~672-962   CALIDAD DE AGUA del módulo (`cw*`): tabla, matriz, tendencias,
                  panel de diagnóstico y fichas por tanque.
     · ~963-1104  SIEMBRAS (`svSie*`): filas por tanque, rollups y modal.
     · ~1105-fin  `renderModule`, la función principal. Es larga (~1.060 líneas) porque
                  arma el banner de KPIs, la rejilla de tanques y CADA UNO de los
                  modales anteriores, más sus gráficos y su cableado de eventos.

   Dividirlo en módulos propios es deuda reconocida y pendiente de decidir; se documenta
   aquí para que el archivo sea navegable mientras tanto. No añadas un sexto bloque:
   si llega otro modal, extráelo a su propio archivo.
   ============================================================ */
import { modStats, tankStats, tanksOf, getters } from './stats.js';
import { moduleSvPopSeries, modulePlgSeries, moduleHourlyDates, moduleHourly, moduleDayKpis, moduleDayTankReadings, cosechaEstimate, projectMetric } from './moduleTrends.js';
import { HR_LABELS } from './tank.js';
import { colorFor, fmt1, fmt2, fmtPop, kpiGlass, kpiTecnicos, breadcrumb, bindModal } from './ui.js';
import { computeSiembras, computeCorridaSiembras } from './siembras.js';
import { toast } from '../../ui/toast.js';
import { downloadTrazabilidad, moduleDateRange } from './trazabilidad.js';
import { FICHA_IDS, fichaLabel } from './fichaPdf.js';
import { svLevel, odLevel, tmpLevel, levelColor, levelLabel, esc, wqiBand } from '../../core/format.js';
import { store } from '../../core/store.js';
import { getField, F } from '../../core/fields.js';
// Qué módulos forman una corrida: criterio ÚNICO del sistema, el mismo con el que la
// Vista Ejecutiva arma sus tarjetas. Derivarlo aquí por separado garantizaría que algún
// día el «Total de la corrida» sumara un juego de módulos distinto al que se ve arriba.
import { modulesOfCorrida } from '../../core/prodCalendar.js';
import { parseAnyDate, fmtShort, dayNum, rangeLabel } from '../../core/dates.js';
import { desinfeccionDetalle } from './desinfeccion.js';
import { iclSeries } from './params.js';
import { lotBrand } from './omtex.js';
import { makeChart, destroyChart } from '../../core/charts.js';
// `avg` sustituye a un `mean` local que no filtraba null/NaN: su único llamante ya pasaba
// el array filtrado, así que el resultado es el mismo y además queda a salvo de un NaN.
import { natCmp, avg } from '../../core/util.js';
import {
  isMicroRow, rowContext as microCtx, meltRow as microMelt, pathogenRecords as microRecords,
  PATHOGENS as MIC_PATHOGENS, PATHOGEN_COLOR as MIC_COLOR, NIVEL_COLOR as MIC_NIVEL_COLOR,
  NIVEL_RANK as MIC_NIVEL_RANK, AGGREGATE_KEYS as MIC_AGG, FORMATO_LABEL as MIC_FMT_LABEL, PATHOGEN_AGAR,
} from '../microbiologia/data.js';
import { petriSVG } from '../microbiologia/petri.js';
import { renderMareas, cleanupMareas, openChartFs, closeChartFs } from './mareas.js';
import {
  isCalAguaRow, calCtx, calMeasured, loadCalRanges, CAL_PARAMS, CAL_SEV,
  calDiagnosis, calGroupTree, CAL_RISK, calRangeText,
} from '../microbiologia/calagua.data.js';

const { gOD, gTmp } = getters;
const SUP_KEYS = ['Supervisor', 'supervisor', 'SUPERVISOR'];
// El comentario se dividió en matutino / vespertino (antes una sola col. "Comentario").
const COM_M_KEYS = ['Comentario (matutino)', 'Comentario matutino', 'comentario (matutino)', 'comentario matutino'];
const COM_V_KEYS = ['Comentario (vespertino)', 'Comentario vespertino', 'comentario (vespertino)', 'comentario vespertino'];
const COM_LEGACY = ['Comentario', 'Comentarios', 'comentario', 'comentarios'];
const getComM = (r) => getField(r, COM_M_KEYS) || getField(r, COM_LEGACY);
const getComV = (r) => getField(r, COM_V_KEYS);
const hasCom = (r) => !!(getComM(r) || getComV(r));
const SIE_KEYS = ['Siembra', 'siembra', 'SIEMBRA'];
// La columna «Siembra» del Registro_Supervisión no guarda un número, sino el ordinal
// ESCRITO: medido sobre las 716 filas de producción, sus únicos valores son "Primera",
// "Segunda" y "Tercera". Esta tabla existe para poder ORDENARLOS cronológicamente; sin
// ella el orden es el alfabético, que hoy acierta de casualidad y dejaría una "Cuarta"
// en primera posición. Devuelve Infinity para lo desconocido, que así cae al final en
// vez de desaparecer. Se admite también un dígito suelto por si la hoja cambia de forma.
const SIE_ORDINALES = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima'];
export function sieOrder(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s) return Infinity;
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  const i = SIE_ORDINALES.indexOf(s.normalize('NFC'));
  return i >= 0 ? i + 1 : Infinity;
}
const isRevisionRow = (r) => r && r._SheetOrigin === 'Registro_Supervision';
const modNum = (s) => { const m = String(s).match(/\d+/); return m ? +m[0] : null; };
/** Empareja "M03" (Supervisor) con "Módulo 3" (Registro_Supervisión) por número; CIO por letras. */
const sameModule = (a, b) => {
  const na = modNum(a), nb = modNum(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a).replace(/[^a-z]/gi, '').toUpperCase() === String(b).replace(/[^a-z]/gi, '').toUpperCase();
};
// Memo por IDENTIDAD de store.globalData para los conjuntos de datos por módulo+corrida.
// `renderModule` hacía cinco recorridos COMPLETOS del store por render (Biomol, Micro,
// Calidad de Agua, comentarios de supervisión y desinfección), sin caché: medido, 269 ms
// y 10 accesos al store con 16.200 filas. `core/sheets.js` sustituye `store.globalData`
// por un array NUEVO en cada refresco, así que comparar la referencia invalida sin riesgo
// (misma estrategia que core/prodCalendar.js y que el memo de stats.js).
//
// ⚠ Los arrays devueltos se COMPARTEN entre llamadas: tratarlos como INMUTABLES. Quien
// necesite ordenarlos debe copiar antes (`[...arr].sort(...)`).
let _dataMemo = { src: null, map: new Map() };
function memoByData(key, compute) {
  if (_dataMemo.src !== store.globalData) _dataMemo = { src: store.globalData, map: new Map() };
  if (!_dataMemo.map.has(key)) _dataMemo.map.set(key, compute());
  return _dataMemo.map.get(key);
}
// JSON.stringify y no concatenación: ('M1','23') y ('M12','3') colisionarían.
const memoKey = (tag, mod, corrida) => JSON.stringify([tag, mod, corrida || null]);

/* ---- Heatmap Biomol del módulo (lee la hoja "Biomol" del store) ---- */
const BM_DIAGS = ['IHHNV', 'WSSV', 'BP', 'AHPND', 'NHPB', 'EHP'];
const BM_DLABEL = { IHHNV: 'IHHNV', WSSV: 'WSSV', BP: 'BP', AHPND: 'AHPND/EMS', NHPB: 'NHPB', EHP: 'EHP' };
// Mismas equivalencias de columna que la vista Biología Molecular.
const BM_ALIASES = {
  fecha: 'Fecha', 'código': 'Código', codigo: 'Código', corrida: 'Corrida', piscina: 'Piscina',
  lugar: 'Lugar', tanque: 'Tanque', otros: 'Otros', muestra: 'Muestra', 'estadío': 'Estadío',
  estadio: 'Estadío', tipo: 'Estadío', sexo: 'Sexo', ihhnv: 'IHHNV', cc: 'IHHNV', wssv: 'WSSV',
  dd: 'WSSV', bp: 'BP', ee: 'BP', 'ahpnd/ems': 'AHPND', ahpnd: 'AHPND', ems: 'AHPND', pp: 'AHPND',
  nhpb: 'NHPB', nhp: 'NHPB', 'nhp-b': 'NHPB', nn: 'NHPB', ehp: 'EHP',
};
const bmIsPos = (v) => v === 'Positivo';
const bmHasVal = (v) => v === 'Positivo' || v === 'Negativo';
const bmNorm = (s) => {
  const l = String(s).toLowerCase();
  if (['positivo', 'positive', 'pos', 'p', '1', 'si', 'sí'].includes(l)) return 'Positivo';
  if (['negativo', 'negative', 'neg', 'n', '0', 'no'].includes(l)) return 'Negativo';
  return '';
};
// Orden cronológico de estadíos: N < Z < M < PL (y nº dentro del grupo). Mismo criterio que la vista Biomol.
function bmEstadioOrder(s) {
  const u = String(s).toUpperCase().trim().replace(/\s+/g, '');
  let m;
  if ((m = u.match(/^N-?(\d+)$/))) return +m[1];
  if ((m = u.match(/^Z-?(\d+)$/))) return 10 + +m[1];
  if ((m = u.match(/^M-?(\d+)$/))) return 50 + +m[1];
  if ((m = u.match(/^PL-?(\d+)$/))) return 100 + +m[1];
  if (u.includes('REPRODUCTOR')) return 99999;
  return 9000;
}
const bmEstadioCmp = (a, b) => { const oa = bmEstadioOrder(a), ob = bmEstadioOrder(b); return oa !== ob ? oa - ob : String(a).localeCompare(String(b)); };
const bmDistinct = (arr) => [...new Set(arr.filter(Boolean))];
// Verde (0% pos) → rojo (100% pos); igual escala que la vista Biomol.
const bmPctColor = (p) => (p === null ? null : `rgb(${Math.round(34 + (239 - 34) * p / 100)},${Math.round(197 + (68 - 197) * p / 100)},${Math.round(94 + (68 - 94) * p / 100)})`);

/** ¿La columna "Lugar" de Biomol (p.ej. "Módulo 1-2") corresponde a este módulo?
 *  Las muestras compartidas (pares 1-2, 6-7, 4-5, 9-10) salen en AMBOS módulos. */
function bmLugarMatches(lugar, mod) {
  const ls = String(lugar);
  const mn = modNum(mod);
  if (mn !== null) {
    // Solo lugares tipo "Módulo N" / "Módulos N-M"; excluye Sala/Maduración/Algas/Proveedor
    // (esos contienen dígitos que coincidirían por error con el nº de módulo).
    if (!/m[óo]dulos?\b/i.test(ls)) return false;
    const nums = ls.match(/\d+/g); return !!nums && nums.map(Number).includes(mn);
  }
  const a = ls.replace(/[^a-z]/gi, '').toUpperCase(), b = String(mod).replace(/[^a-z]/gi, '').toUpperCase();
  return !!b && a.includes(b);
}

// Igualdad laxa de corrida (compara solo los dígitos: "C-573" ≡ "573").
const bmDigits = (s) => (String(s).match(/\d+/g) || []).join('');
const bmCorridaEq = (a, b) => { const da = bmDigits(a); return !!da && da === bmDigits(b); };
const bmIsReproductor = (estadio) => /reproductor/i.test(String(estadio));

/** Filas Biomol normalizadas del módulo `mod`, filtradas por `corrida` (si se indica)
 *  y EXCLUYENDO las muestras en estadío Reproductores. */
// Alias de columna resuelto con propiedad PROPIA: `BM_ALIASES[k]` con una columna llamada
// "constructor" o "toString" devolvía el miembro HEREDADO de Object.prototype —truthy— y
// se usaba como nombre de campo, generando basura en la fila normalizada.
const bmAlias = (k) => (Object.prototype.hasOwnProperty.call(BM_ALIASES, k) ? BM_ALIASES[k] : undefined);
/** Valor de UNA columna aliaseada, sin construir la fila normalizada entera.
 *  Gana la ÚLTIMA columna que casa, igual que la construcción por asignaciones sucesivas
 *  de la fila normalizada: si la hoja trae dos columnas que normalizan al mismo alias
 *  (p. ej. "Lugar" y "lugar "), tomar la primera cambiaría la fila seleccionada. */
function bmRawField(row, target) {
  let out = '';
  for (const k of Object.keys(row)) {
    if (bmAlias(k.trim().toLowerCase()) === target) out = String(row[k] == null ? '' : row[k]).trim();
  }
  return out;
}

const biomolForModule = (mod, corrida) => memoByData(memoKey('bm', mod, corrida), () => biomolForModuleCompute(mod, corrida));
function biomolForModuleCompute(mod, corrida) {
  const out = [];
  store.globalData.forEach((row) => {
    if (row._SheetOrigin !== 'Biomol') return;
    // Se descarta por Lugar ANTES de normalizar: antes se construía la fila completa
    // (recorrido de claves + String() por campo) para TODAS las filas Biomol del store y
    // se tiraba la mayoría acto seguido. El módulo abierto suele quedarse con una minoría.
    const lugar = bmRawField(row, 'Lugar');
    if (!bmLugarMatches(lugar, mod)) return;
    const nr = {};
    Object.keys(row).forEach((k) => { const al = bmAlias(k.trim().toLowerCase()); if (al) nr[al] = String(row[k] == null ? '' : row[k]).trim(); });
    const estadio = nr['Estadío'] || '';
    if (bmIsReproductor(estadio)) return;                       // sin Reproductores
    const cor = nr['Corrida'] || '';
    if (corrida && !bmCorridaEq(cor, corrida)) return;          // solo la corrida abierta
    out.push({
      fecha: nr['Fecha'] || '', cod: nr['Código'] || '', corrida: cor, lugar, tq: nr['Tanque'] || '—', estadio, sexo: nr['Sexo'] || '',
      IHHNV: bmNorm(nr['IHHNV'] || ''), WSSV: bmNorm(nr['WSSV'] || ''), BP: bmNorm(nr['BP'] || ''),
      AHPND: bmNorm(nr['AHPND'] || ''), NHPB: bmNorm(nr['NHPB'] || ''), EHP: bmNorm(nr['EHP'] || ''),
    });
  });
  return out;
}

/* Tooltip flotante reutilizable para el heatmap Biomol. */
let bmTipEl = null;
function bmTip() { if (!bmTipEl) { bmTipEl = document.createElement('div'); bmTipEl.className = 'sv-bm-tip'; document.body.appendChild(bmTipEl); } return bmTipEl; }
function bmShowTip(html, e) { const t = bmTip(); t.innerHTML = html; t.style.opacity = '1'; bmMoveTip(e); }
function bmMoveTip(e) { const t = bmTip(); const x = e.clientX + 14, y = e.clientY + 14; t.style.left = Math.min(x, window.innerWidth - t.offsetWidth - 12) + 'px'; t.style.top = Math.min(y, window.innerHeight - t.offsetHeight - 12) + 'px'; }
function bmHideTip() { if (bmTipEl) bmTipEl.style.opacity = '0'; }
// Elimina por completo el tooltip del DOM (al cerrar el modal): evita que el
// elemento quede huérfano en <body> al cambiar de vista. Se recrea solo al volver a usarlo.
function bmDestroyTip() { if (bmTipEl) { bmTipEl.remove(); bmTipEl = null; } }
/** Suelta lo que esta sub-vista cuelga FUERA del contenedor de la vista. Lo llama el
 *  orquestador en cada render: `renderModule` ya barre el tooltip al entrar, pero si se
 *  abandona el módulo hacia la landing o hacia otro tanque nadie lo hacía, y el nodo
 *  sobrevivía en <body> hasta la siguiente visita a un módulo. */
export function cleanupModule() { bmDestroyTip(); }

const bmJoin = (arr) => { const a = bmDistinct(arr); return a.length ? (a.length > 4 ? a.slice(0, 4).join(', ') + ` +${a.length - 4}` : a.join(', ')) : '—'; };

/** Construye el heatmap (diagnósticos × tanque|estadío) dentro de `host`.
 *  `mode` = 'tank' (columnas por tanque) | 'estadio' (columnas por estadío). */
function buildBiomolHeat(host, rows, mode) {
  if (!host) return;
  if (!rows.length) { host.innerHTML = '<div class="empty-state">Sin análisis de Biología Molecular para esta corrida y módulo.</div>'; return; }
  const byEst = mode === 'estadio';
  const dimOf = (r) => (byEst ? (r.estadio || '—') : r.tq);
  const colHead = byEst ? 'Estadío' : 'Tanque';
  const cols = bmDistinct(rows.map(dimOf)).sort(byEst ? bmEstadioCmp : natCmp);
  // Filas por columna, UNA sola vez: `cRows` no depende del diagnóstico, pero se calculaba
  // dentro del bucle de BM_DIAGS, así que el dataset se recorría 6 veces por columna
  // (6 diagnósticos × nº de tanques barridos completos) para obtener siempre lo mismo.
  const rowsByCol = new Map(cols.map((c) => [c, rows.filter((r) => dimOf(r) === c)]));
  const tips = []; // HTML de tooltip por celda (referenciado por índice, no por atributo)
  let html = `<div class="sv-bm-scroll"><table class="sv-bm-table"><thead><tr><th class="sv-bm-corner">Diag · ${colHead}</th>`
    + cols.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>';
  BM_DIAGS.forEach((diag) => {
    html += `<tr><th class="sv-bm-rowh">${esc(BM_DLABEL[diag])}</th>`;
    cols.forEach((col) => {
      const cRows = rowsByCol.get(col);
      const measured = cRows.filter((r) => bmHasVal(r[diag]));
      const pos = measured.filter((r) => bmIsPos(r[diag])).length;
      const pct = measured.length ? Math.round(pos / measured.length * 100) : null;
      const bg = bmPctColor(pct);
      const estadioTxt = byEst ? col : bmJoin(cRows.map((r) => r.estadio));
      const tanqueTxt = byEst ? bmJoin(cRows.map((r) => r.tq)) : col;
      const codTxt = bmJoin(cRows.map((r) => r.cod));
      const tip = `<div class="sv-bm-tip-title">${esc(BM_DLABEL[diag])} · ${esc(col)}</div>`
        + `<div class="sv-bm-tip-row"><span>Estadío</span><b>${esc(estadioTxt)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Código</span><b>${esc(codTxt)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Tanque</span><b>${esc(tanqueTxt)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>% Positivos</span><b class="bm-pos">${pct === null ? 'sin datos' : pct + '%'}</b></div>`
        + `<div class="sv-bm-tip-row"><span>% Negativos</span><b class="bm-neg">${pct === null ? '—' : (100 - pct) + '%'}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Total muestras</span><b>${measured.length}</b></div>`;
      const cls = 'sv-bm-cell' + (bg ? '' : ' sv-bm-empty');
      const styleAttr = bg ? ` style="background:${bg};color:#fff"` : '';
      const idx = tips.length; tips.push(tip);
      html += `<td class="${cls}"${styleAttr} data-idx="${idx}">${pct === null ? '·' : pct + '%'}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>'
    + '<div class="sv-bm-legend"><span class="sv-bm-leg-bar"></span><span>0% positivos</span><span style="flex:1"></span><span>100% positivos</span></div>';
  host.innerHTML = html;
  host.querySelectorAll('.sv-bm-cell[data-idx]').forEach((td) => {
    const tip = tips[+td.getAttribute('data-idx')];
    td.addEventListener('mouseenter', (e) => bmShowTip(tip, e));
    td.addEventListener('mousemove', bmMoveTip);
    td.addEventListener('mouseleave', bmHideTip);
  });
}

/** Línea de tiempo por tanque: un punto por análisis molecular ubicado en su FECHA real
 *  (eje X = tiempo, eje Y = tanque). Color = peor caso entre los 6 diagnósticos. El tiempo
 *  es el eje, así que no hay desplegable de fecha (aprovecha el espacio horizontal). */
function buildBiomolSwarm(host, rows) {
  if (!host) return;
  host.innerHTML = `<div class="sv-bm-swarm-host" id="svBmSwarmHost"></div>`;
  drawBiomolSwarm(host.querySelector('#svBmSwarmHost'), rows);
}

/** Render SVG de la línea de tiempo: eje Y = tanques, eje X = fecha, un punto por análisis. */
function drawBiomolSwarm(host, data) {
  if (!host) return;
  const tanks = bmDistinct(data.map((r) => r.tq)).sort(natCmp);
  const dated = data.map((r) => ({ r, d: parseAnyDate(r.fecha) })).filter((o) => o.d && !isNaN(o.d));
  if (!dated.length || !tanks.length) { host.innerHTML = '<div class="empty-state">Sin análisis con fecha para este módulo.</div>'; return; }
  // Altura de fila ADAPTATIVA: con muchos tanques se compactan los carriles (y el punto)
  // para no ocupar tanto alto; el contenedor tiene scroll (max-height en CSS) si aun así
  // se pasa. Pocos tanques conservan el tamaño holgado.
  const rowH = tanks.length > 12 ? 18 : tanks.length > 8 ? 24 : 34;
  const dotR = rowH >= 30 ? 5.5 : rowH >= 22 ? 4.5 : 3.6;
  const stack = rowH >= 30 ? 6.5 : rowH >= 22 ? 4.5 : 3; // separación al apilar mismo día
  const labFs = rowH >= 30 ? 11 : rowH >= 22 ? 10 : 9;    // etiqueta de tanque
  const W = Math.max(host.clientWidth || 0, 340), mL = 80, mR = 18, mT = 14, mB = 34;
  const H = mT + tanks.length * rowH + mB, plotW = W - mL - mR;
  let minT = Infinity, maxT = -Infinity;
  dated.forEach((o) => { const t = o.d.getTime(); if (t < minT) minT = t; if (t > maxT) maxT = t; });
  const span = maxT - minT;
  // Sin span (todas las muestras el mismo día) → columna centrada.
  const xOf = (t) => span > 0 ? mL + ((t - minT) / span) * plotW : mL + plotW / 2;
  const byTank = new Map(); tanks.forEach((t) => byTank.set(t, []));
  dated.forEach((o) => { if (byTank.has(o.r.tq)) byTank.get(o.r.tq).push(o); });
  const tips = []; let grid = '', circles = '';
  tanks.forEach((t, ti) => {
    const cy = mT + ti * rowH + rowH / 2;
    grid += `<line x1="${mL}" x2="${W - mR}" y1="${cy}" y2="${cy}" stroke="rgba(120,144,156,.28)" stroke-dasharray="3,3"/>`
      + `<text x="${mL - 7}" y="${cy}" text-anchor="end" dominant-baseline="middle" font-size="${labFs}" fill="var(--c-text-muted,#607D8B)">${esc(t)}</text>`;
    // Varios análisis el MISMO día en un tanque → se apilan verticalmente para no solaparse.
    const seenDay = new Map();
    byTank.get(t).sort((a, b) => a.d - b.d).forEach((o) => {
      const dk = micDayKey(o.d);
      const i = seenDay.get(dk) || 0; seenDay.set(dk, i + 1);
      const cx = xOf(o.d.getTime());
      const cyJit = cy + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * stack);
      const r = o.r;
      const anyMeas = BM_DIAGS.some((d) => bmHasVal(r[d])), anyPos = BM_DIAGS.some((d) => bmIsPos(r[d]));
      const fill = !anyMeas ? '#94a3b8' : anyPos ? '#ef4444' : '#22c55e';
      const stroke = !anyMeas ? '#64748b' : anyPos ? '#b91c1c' : '#15803d';
      const diagRows = BM_DIAGS.map((d) => `<div class="sv-bm-tip-row"><span>${esc(BM_DLABEL[d])}</span><b class="${bmIsPos(r[d]) ? 'bm-pos' : 'bm-neg'}">${esc(r[d] || '—')}</b></div>`).join('');
      const idx = tips.length;
      tips.push(`<div class="sv-bm-tip-title">${esc(r.tq)} · ${esc(r.estadio || r.sexo || '—')}</div>`
        + `<div class="sv-bm-tip-row"><span>Fecha</span><b>${esc(r.fecha || '—')}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Código</span><b>${esc(r.cod || '—')}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Corrida</span><b>${esc(r.corrida || '—')}</b></div>${diagRows}`);
      circles += `<circle cx="${cx.toFixed(1)}" cy="${cyJit.toFixed(1)}" r="${dotR}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" data-idx="${idx}" style="cursor:pointer"/>`;
    });
  });
  // Eje X temporal: marcas de fecha (inicio · medio · fin) con guía vertical tenue.
  let xaxis = '';
  const ticks = span > 0 ? [minT, minT + span / 2, maxT] : [minT];
  ticks.forEach((t) => {
    const x = xOf(t);
    xaxis += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${mT}" y2="${H - mB + 4}" stroke="rgba(120,144,156,.16)"/>`
      + `<text x="${x.toFixed(1)}" y="${H - mB + 18}" text-anchor="middle" font-size="10.5" fill="var(--c-text-muted,#607D8B)">${esc(fmtShort(new Date(t)))}</text>`;
  });
  host.innerHTML = `<svg class="sv-bm-swarm-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet">${xaxis}${grid}${circles}</svg>`;
  host.querySelectorAll('circle[data-idx]').forEach((c) => {
    const tip = tips[+c.getAttribute('data-idx')];
    c.addEventListener('mouseenter', (e) => bmShowTip(tip, e));
    c.addEventListener('mousemove', bmMoveTip);
    c.addEventListener('mouseleave', bmHideTip);
  });
}

/** E.D.T. · Electroforesis Digital Temporal: gel digital interactivo (carriles = tanques,
 *  filas = diagnósticos como un ladder). Mismo dataset que la dispersión, con filtro de fecha. */
function buildBiomolGel(host, rows, loteMap) {
  if (!host) return;
  const dates = [...new Set(rows.map((r) => r.fecha).filter(Boolean))]
    .sort((a, b) => (parseAnyDate(b) || 0) - (parseAnyDate(a) || 0));
  let sel = '';
  const opts = `<option value="">Todas las fechas (${rows.length})</option>`
    + dates.map((d) => `<option value="${esc(d)}">${esc(d)} (${rows.filter((r) => r.fecha === d).length})</option>`).join('');
  host.innerHTML = `<div class="sv-bm-swarm-ctrl"><label>📅 Fecha
      <select class="sv-modal-select sv-bm-gel-date">${opts}</select></label></div>
    <div class="sv-bm-gel-host" id="svBmGelHost"></div>`;
  const gHost = host.querySelector('#svBmGelHost');
  const draw = () => drawBiomolGel(gHost, sel ? rows.filter((r) => r.fecha === sel) : rows, loteMap || {});
  host.querySelector('.sv-bm-gel-date').addEventListener('change', (e) => { sel = e.target.value; draw(); });
  draw();
}

/* Paleta E.D.T. inspirada en gel de agarosa bajo UV (GelRed/EtBr en transiluminador).
   Bandas: SOLO dos estados → positivo (verde lima neón) · negativo (lavanda tenue). */
const GEL = {
  bgTop: '#2A0F47', bgMid: '#4A2370', bgEdge: '#1B0A33', glow: '#5A2D82',
  pos: '#D4FF4A', posCore: '#EEFF8A',         // verde lima fluorescente
  neg: '#B98CFF', negCore: '#E0C6FF',         // lavanda neón (negativo)
  text: '#E6C7FF', ladder: '#D77BFF', lane: 'rgba(215,123,255,.10)', laneEdge: 'rgba(215,123,255,.16)',
};

/** Render SVG del gel: fondo UV violeta, bandas fluorescentes (lima=positivo · lavanda=negativo). */
function drawBiomolGel(host, data, loteMap) {
  if (!host) return;
  const tanks = bmDistinct(data.map((r) => r.tq)).sort(natCmp);
  if (!data.length || !tanks.length) { host.innerHTML = '<div class="empty-state">Sin análisis para esta fecha.</div>'; return; }
  const mL = 78, mR = 14, mT = 30, mB = 16, rowH = 40, bandH = 15;
  const laneW = Math.min(70, Math.max(40, ((host.clientWidth || 640) - mL - mR) / tanks.length));
  const W = mL + tanks.length * laneW + mR, H = mT + BM_DIAGS.length * rowH + mB;

  const cell = (tq, d) => {
    const rs = data.filter((r) => r.tq === tq && bmHasVal(r[d]));
    if (!rs.length) return null;
    const posN = rs.filter((r) => bmIsPos(r[d])).length;
    return { st: posN > 0 ? 'pos' : 'neg', n: rs.length, posN };
  };

  let ladder = '', lanes = '', bands = '';
  const tips = [];
  BM_DIAGS.forEach((d, ri) => {
    const cy = mT + ri * rowH + rowH / 2;
    ladder += `<text x="${mL - 10}" y="${cy}" text-anchor="end" dominant-baseline="middle" font-size="11" font-weight="700" fill="${GEL.ladder}">${esc(BM_DLABEL[d])}</text>`
      + `<line x1="${mL - 6}" x2="${W - mR}" y1="${cy}" y2="${cy}" stroke="rgba(215,123,255,.07)"/>`;
  });
  tanks.forEach((t, ci) => {
    const lx = mL + ci * laneW, cx = lx + laneW / 2;
    lanes += `<rect x="${(lx + 3).toFixed(1)}" y="${mT - 4}" width="${(laneW - 6).toFixed(1)}" height="${H - mT - mB + 8}" rx="4" fill="${GEL.lane}" stroke="${GEL.laneEdge}"/>`
      + `<text x="${cx.toFixed(1)}" y="${mT - 12}" text-anchor="middle" font-size="11" font-weight="800" fill="${GEL.text}">${esc(t)}</text>`;
    BM_DIAGS.forEach((d, ri) => {
      const cy = mT + ri * rowH + rowH / 2;
      const c = cell(t, d);
      if (!c) { bands += `<rect x="${(lx + 9).toFixed(1)}" y="${(cy - 1).toFixed(1)}" width="${(laneW - 18).toFixed(1)}" height="2" rx="1" fill="rgba(215,123,255,.10)"/>`; return; }
      const isPos = c.st === 'pos';
      const col = isPos ? GEL.pos : GEL.neg, core = isPos ? GEL.posCore : GEL.negCore;
      const bw = laneW - 14, bx = lx + 7, by = cy - bandH / 2;
      const idx = tips.length;
      const lote = loteMap[t] || '—';
      tips.push(`<div class="sv-bm-tip-title">${esc(t)} · ${esc(BM_DLABEL[d])}</div>`
        + `<div class="sv-bm-tip-row"><span>Lote</span><b>${esc(lote)}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Resultado</span><b class="${isPos ? 'bm-pos' : 'bm-neg'}">${isPos ? 'Positivo' : 'Negativo'}</b></div>`
        + `<div class="sv-bm-tip-row"><span>Muestras</span><b>${c.n}${c.posN ? ` · ${c.posN} pos` : ''}</b></div>`);
      bands += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bandH}" rx="${(bandH / 2).toFixed(1)}" fill="${col}" filter="url(#bmGelGlow)" opacity="${isPos ? 0.95 : 0.7}" data-idx="${idx}" style="cursor:pointer"/>`
        + `<rect x="${(bx + 2).toFixed(1)}" y="${(by + 3).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bandH - 6}" rx="${((bandH - 6) / 2).toFixed(1)}" fill="${core}" opacity="${isPos ? 0.75 : 0.5}" pointer-events="none"/>`;
    });
  });

  host.innerHTML = `<svg class="sv-bm-gel-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <filter id="bmGelGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="bmGelBg" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stop-color="${GEL.glow}"/><stop offset="55%" stop-color="${GEL.bgMid}"/><stop offset="100%" stop-color="${GEL.bgEdge}"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bmGelBg)"/>
    ${ladder}${lanes}${bands}
  </svg>`;
  host.querySelectorAll('rect[data-idx]').forEach((c) => {
    const tip = tips[+c.getAttribute('data-idx')];
    c.addEventListener('mouseenter', (e) => bmShowTip(tip, e));
    c.addEventListener('mousemove', bmMoveTip);
    c.addEventListener('mouseleave', bmHideTip);
  });
}

/* ============================================================
   MICROBIOLOGÍA · modal del módulo (Placa + Tabla + Heatmap).
   Reusa la capa pura de la vista Microbiología (data.js / petri.js),
   acotada a las muestras que comparten corrida + módulo (por número).
   ============================================================ */
const micDigits = (s) => (String(s).match(/\d+/g) || []).join('');
const micFmtNum = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-EC');
const micTQ = (r) => microCtx(r).tq; // tanque estricto (columna TQ/N°)
const micDayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
const micTankLabel = (t) => t === '__none' ? 'Sin TQ' : ('TQ ' + t);
// V. Luminiscentes = presencia/ausencia (no UFC). Color violeta propio para distinguirlo
// del semáforo de niveles. Chip para la placa (resumen del día) y celda para la tabla/heatmap.
const MIC_LUMIN_COLOR = '#8E24AA';
const micLuminChip = (v) => v === true
  ? `<div class="mic-pe-lumin is-on" title="Presencia de V. Luminiscentes"><span class="mic-pe-dot" style="background:${MIC_LUMIN_COLOR}"></span>✨ V. Luminiscentes · <b>Presencia</b></div>`
  : v === false
  ? `<div class="mic-pe-lumin"><span class="mic-pe-dot" style="background:#B0BEC5"></span>✨ V. Luminiscentes · Ausencia</div>`
  : '';
const micLuminCell = (v) => v === true
  ? `<span class="mic-lumin is-on" title="Presencia de V. Luminiscentes">✨ Pres.</span>`
  : v === false ? '<span class="muted">Aus.</span>' : '<span class="muted">—</span>';
// ⚠ CANAL LATERAL render → dibujo. Estas dos (y `_svCwTrend`, más abajo) las ESCRIBE una
// función que genera HTML y las LEE después el cableado de eventos, porque un <canvas> o
// un tooltip sólo se pueden pintar cuando el marcado ya está en el DOM. El orden es lo que
// las hace seguras y no es casual: `renderMic()` asigna `micBody.innerHTML` —lo que ejecuta
// la función que escribe la global— ANTES de llamar al dibujo que la lee. Si algún día se
// invierte ese orden, el gráfico se dibujaría con los datos de la pestaña anterior.
//   _svMicroColonies · la escribe microPlacaHTML       · la lee el tooltip de colonias (ttShow)
//   _svMicTrend      · la escribe microTendenciasHTML  · la lee drawMicTrend
let _svMicroColonies = []; // colonias del día visible en la placa (para el tooltip)
let _svMicTrend = null;    // { days, series } de la pestaña Tendencias (para dibujar el gráfico abierto)

/** Filas de Microbiología que comparten corrida + módulo (número) con este módulo. */
const microForModule = (mod, corrida) => memoByData(memoKey('mic', mod, corrida), () => microForModuleCompute(mod, corrida));
function microForModuleCompute(mod, corrida) {
  const mn = modNum(mod);
  if (mn === null) return [];
  const cd = corrida ? micDigits(corrida) : '';
  return store.globalData.filter((r) => {
    if (!isMicroRow(r)) return false;
    const c = microCtx(r);
    if (modNum(c.modulo) !== mn) return false; // robusto ante "3" / "M03" / "Módulo 3"
    if (cd && micDigits(c.corrida) !== cd) return false;
    return true;
  });
}

/** Colonias (1 por patógeno con UFC>0) sobre un conjunto de filas. */
function microColonies(rows) {
  const byKey = new Map();
  microRecords(rows).forEach((r) => {
    if (!(r.ufc > 0)) return;
    if (!byKey.has(r.key)) byKey.set(r.key, { id: r.key, key: r.key, label: r.label, color: MIC_COLOR[r.key] || '#90A4AE', ufc: 0, nMuestras: 0, worstRank: -1, worst: '' });
    const o = byKey.get(r.key);
    o.ufc += r.ufc; o.nMuestras++;
    const rk = MIC_NIVEL_RANK[r.nivel] ?? -1;
    if (rk > o.worstRank) { o.worstRank = rk; o.worst = r.nivel; }
  });
  return [...byKey.values()].sort((a, b) => b.ufc - a.ufc);
}

const micTanksOf = (rows) => { const s = new Set(); let none = false; rows.forEach((r) => { const t = micTQ(r); if (t) s.add(t); else none = true; }); const arr = [...s].sort(natCmp); if (none) arr.push('__none'); return arr; };
const micRowsForTank = (rows, tank) => !tank ? rows : (tank === '__none' ? rows.filter((r) => !micTQ(r)) : rows.filter((r) => micTQ(r) === tank));
function micDaysOf(rows) {
  const byDay = new Map();
  rows.forEach((r) => { const c = microCtx(r); if (!c.fecha || isNaN(c.fecha)) return; const key = micDayKey(c.fecha); if (!byDay.has(key)) byDay.set(key, { key, d: c.fecha, label: fmtShort(c.fecha), rows: [] }); byDay.get(key).rows.push(r); });
  return [...byDay.values()].sort((a, b) => a.d - b.d);
}

/** Pestaña Placa: filtro de tanque + navegador de fecha + placa de agar + resumen del día. */
function microPlacaHTML(rows, state) {
  const tanks = micTanksOf(rows);
  if (state.tank && !tanks.includes(state.tank)) state.tank = null;
  const days = micDaysOf(micRowsForTank(rows, state.tank));
  if (!days.length) return `<div class="empty-state" style="padding:30px">Sin muestras de microbiología para esta selección.</div>`;
  let idx = state.dayIdx;
  if (idx == null || idx < 0 || idx >= days.length) idx = days.length - 1;
  state.dayIdx = idx; // se persiste el índice resuelto para el navegador
  const day = days[idx];
  const colonies = microColonies(day.rows);
  _svMicroColonies = colonies; // para el tooltip de colonias
  // Carga total del día = Σ UFC de los patógenos ESPECÍFICOS con UFC. Se excluyen los
  // conteos AGREGADOS (`MIC_AGG` = C. Totales y Bact. Totales), que son sumas y volverían a
  // contar lo ya contado. Antes se excluía a mano solo «C. Totales», así que «Bact. Totales»
  // —la mayor de las dos— entraba en el sumatorio: medido, 10.150 donde correspondía 150.
  // Se usa la MISMA constante que el KPI «Dominante» de más abajo, para que los dos no
  // puedan volver a discrepar sobre qué es un agregado. V. Luminiscentes no entra
  // (presencia/ausencia). "—" si ese día no hubo ningún patógeno específico con UFC.
  const nonTotColonies = colonies.filter((c) => !MIC_AGG.has(c.key));
  const totUfc = nonTotColonies.length ? nonTotColonies.reduce((a, c) => a + c.ufc, 0) : null;
  // V. Luminiscentes del día (presencia/ausencia, no UFC): presencia si alguna muestra la
  // reporta presente; ausencia si al menos una la reporta ausente y ninguna presente.
  const dayLumin = day.rows.some((r) => microCtx(r).lumin === true) ? true
    : day.rows.some((r) => microCtx(r).lumin === false) ? false : null;
  const specific = colonies.filter((c) => !MIC_AGG.has(c.key));
  const maxC = specific.length ? specific.reduce((a, b) => (a.ufc > b.ufc ? a : b)) : null;
  const dayTanks = [...new Set(day.rows.map(micTQ).filter(Boolean))].sort(natCmp);
  const tankShown = state.tank ? micTankLabel(state.tank) : (dayTanks.length ? dayTanks.map((t) => 'TQ ' + t).join(', ') : '—');
  const dayEstadios = [...new Set(day.rows.map((r) => microCtx(r).estadio).filter(Boolean))].sort(natCmp);
  const agares = [...new Set(colonies.map((c) => PATHOGEN_AGAR[c.key]).filter(Boolean))].sort();
  const tankOpts = `<option value="">Todos los tanques</option>` + tanks.map((t) => `<option value="${esc(t)}" ${state.tank === t ? 'selected' : ''}>${esc(micTankLabel(t))}</option>`).join('');
  const legend = colonies.length
    ? `<div class="mic-pe-legend">${colonies.map((c) => `<div class="mic-pe-leg"><span class="mic-pe-dot" style="background:${c.color}"></span><span class="mic-pe-leg-l">${esc(c.label)}</span><span class="mic-pe-leg-v">${micFmtNum(c.ufc)}</span></div>`).join('')}</div>`
    : '<div class="muted" style="font-size:12px">Sin colonias con UFC este día.</div>';
  return `<div class="sv-micro-filters">
      <label class="sv-modal-datelbl">Tanque <select class="sv-modal-select" data-micro-tank>${tankOpts}</select></label>
      <div class="sv-micro-daynav">
        <button class="sv-micro-navbtn" data-micro-day="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Día anterior">◀</button>
        <span class="sv-micro-daylbl">📅 ${esc(day.label)} <span class="muted">(${idx + 1}/${days.length})</span></span>
        <button class="sv-micro-navbtn" data-micro-day="1" ${idx >= days.length - 1 ? 'disabled' : ''} aria-label="Día siguiente">▶</button>
      </div>
    </div>
    <div class="sv-micro-main">
      <div class="sv-micro-dish">
        <div class="mic-chart-title">🧫 Placa de agar <span class="muted">· colonia = patógeno · tamaño ∝ log₁₀(UFC)</span></div>
        <div style="display:flex;justify-content:center">${petriSVG(colonies, 320, 'light')}</div>
        <div class="mic-petri-foot">${day.rows.length} muestra(s) · ${colonies.length} patógeno(s) con UFC</div>
      </div>
      <div class="sv-micro-side">
        <div class="mic-chart-title">Resumen del día</div>
        <div class="sv-micro-meta"><b>${esc(tankShown)}</b> · 📅 ${esc(day.label)}${dayEstadios.length ? ' · 🦐 ' + esc(dayEstadios.join(', ')) : ''}</div>
        <div class="mic-pe-sum">
          <div class="mic-pe-st"><div class="mic-pe-st-v">${micFmtNum(totUfc)}</div><div class="mic-pe-st-l">Σ UFC total</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v">${maxC ? micFmtNum(maxC.ufc) : '—'}</div><div class="mic-pe-st-l">UFC máx</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v">${colonies.length}</div><div class="mic-pe-st-l">Patógenos</div></div>
          <div class="mic-pe-st"><div class="mic-pe-st-v" style="font-size:13px">${maxC ? esc(maxC.label) : '—'}</div><div class="mic-pe-st-l">Dominante</div></div>
        </div>
        ${micLuminChip(dayLumin)}
        <div class="mic-pe-agar"><div class="mic-pe-agar-l">🧪 Agar utilizado</div><div class="mic-pe-agar-chips">${agares.length ? agares.map((a) => `<span class="mic-agar-chip">${esc(a)}</span>`).join('') : '<span class="muted" style="font-size:12px">—</span>'}</div></div>
        <div class="mic-chart-title" style="margin-top:12px">Patógenos</div>
        ${legend}
      </div>
    </div>`;
}

/** Pestaña Tabla: todas las muestras (UFC por patógeno, semaforizado). */
function microTablaHTML(rows) {
  if (!rows.length) return `<div class="empty-state" style="padding:30px">Sin muestras de microbiología para esta corrida y módulo.</div>`;
  const melts = rows.map((r) => ({ ctx: microCtx(r), byKey: Object.fromEntries(microMelt(r).map((m) => [m.key, m])) }))
    .sort((a, b) => (b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  const presentKeys = new Set();
  melts.forEach((s) => Object.keys(s.byKey).forEach((k) => { const m = s.byKey[k]; if (m.ufc !== null || m.crudo !== null || m.nivel) presentKeys.add(k); }));
  const pats = MIC_PATHOGENS.filter((p) => presentKeys.has(p.key));
  const patCell = (m) => {
    if (!m || (m.ufc === null && m.crudo === null && !m.nivel)) return '<td class="muted" style="text-align:center">—</td>';
    const tint = m.nivel ? ` style="background:${MIC_NIVEL_COLOR[m.nivel]}22;text-align:right;font-variant-numeric:tabular-nums"` : ' style="text-align:right;font-variant-numeric:tabular-nums"';
    const val = m.ufc !== null ? micFmtNum(m.ufc) : (m.crudo !== null ? esc(String(m.crudo)) : '·');
    return `<td${tint} title="${m.nivel ? esc(m.nivel) + ' · ' : ''}${m.ufc !== null ? micFmtNum(m.ufc) + ' UFC' : ''}">${val}</td>`;
  };
  // Estadío junto a Formato (entre éste y los agentes): ayuda a identificar la muestra.
  const head = `<tr><th>Fecha</th><th>TQ</th><th>Tipo</th><th>Formato</th><th>Estadío</th>${pats.map((p) => `<th style="text-align:right">${esc(p.label)}</th>`).join('')}<th>V. Lumin.</th><th>Nivel máx</th></tr>`;
  const body = melts.map((s) => {
    const c = s.ctx;
    let worst = '', wr = -1;
    Object.values(s.byKey).forEach((m) => { if (m.nivel) { const rk = MIC_NIVEL_RANK[m.nivel]; if (rk > wr) { wr = rk; worst = m.nivel; } } });
    return `<tr>
      <td>${c.fecha ? esc(fmtShort(c.fecha)) : esc(c.fechaRaw || '—')}</td>
      <td>${c.tq ? 'TQ ' + esc(c.tq) : '<span class="muted">—</span>'}</td>
      <td>${esc(c.tipoMuestra || '—')}</td>
      <td>${esc(MIC_FMT_LABEL[c.formatoKey] || c.formato || '—')}</td>
      <td>${c.estadio ? esc(c.estadio) : '<span class="muted">—</span>'}</td>
      ${pats.map((p) => patCell(s.byKey[p.key])).join('')}
      <td>${micLuminCell(c.lumin)}</td>
      <td>${worst ? `<span class="mic-nivel" style="--nv:${MIC_NIVEL_COLOR[worst]}">${esc(worst)}</span>` : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('');
  // Leyenda de semaforización (niveles), igual que la pestaña Heatmap; las celdas de agente
  // se tiñen por nivel y sin leyenda no se sabía qué significa cada color.
  const hasLumin = melts.some((s) => s.ctx.lumin != null);
  const luminLeg = hasLumin ? `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${MIC_LUMIN_COLOR}"></span>V. Luminiscentes (presencia)</span>` : '';
  const legend = `<div class="mic-legend" style="margin-top:8px">${Object.keys(MIC_NIVEL_COLOR).map((n) => `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${MIC_NIVEL_COLOR[n]}"></span>${esc(n)}</span>`).join('')}${luminLeg}</div>`;
  return `<div class="sv-micro-tablewrap"><table class="sv-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>${legend}`;
}

/** Pestaña Heatmap: Patógeno × Día (color = nivel · valor = Σ UFC). */
function microHeatmapHTML(rows) {
  if (!rows.length) return `<div class="empty-state" style="padding:30px">Sin registros para esta corrida y módulo.</div>`;
  const days = micDaysOf(rows);
  const presentKeys = new Set(microRecords(rows).map((r) => r.key));
  const pats = MIC_PATHOGENS.filter((p) => presentKeys.has(p.key));
  const cell = new Map();
  rows.forEach((r) => { const c = microCtx(r); if (!c.fecha || isNaN(c.fecha)) return; const dk = micDayKey(c.fecha); microMelt(r).forEach((m) => { const k = m.key + '|' + dk; if (!cell.has(k)) cell.set(k, { ufc: 0, worstRank: -1, worst: '' }); const o = cell.get(k); if (m.ufc) o.ufc += m.ufc; const rk = MIC_NIVEL_RANK[m.nivel] ?? -1; if (rk > o.worstRank) { o.worstRank = rk; o.worst = m.nivel; } }); });
  // V. Luminiscentes por día (presencia/ausencia, no UFC): presencia si alguna muestra del
  // día la reporta presente; ausencia si al menos una la reporta ausente y ninguna presente.
  const luminByDay = new Map();
  let hasLumin = false;
  rows.forEach((r) => { const c = microCtx(r); if (!c.fecha || isNaN(c.fecha) || c.lumin == null) return; hasLumin = true; const dk = micDayKey(c.fecha); if (c.lumin === true) luminByDay.set(dk, true); else if (luminByDay.get(dk) !== true) luminByDay.set(dk, false); });
  const head = `<tr><th class="sv-micro-hm-rowh">Patógeno \\ Día</th>${days.map((d) => `<th>${esc(d.label)}</th>`).join('')}</tr>`;
  let body = pats.map((p) => {
    const tds = days.map((d) => { const o = cell.get(p.key + '|' + d.key); if (!o || (o.ufc === 0 && !o.worst)) return '<td class="muted">·</td>'; const col = o.worst ? MIC_NIVEL_COLOR[o.worst] : ''; const st = col ? ` style="background:${col};color:#fff"` : ''; return `<td${st} title="${esc(p.label)} · ${esc(o.worst || 'sin nivel')} · ${micFmtNum(o.ufc)} UFC">${micFmtNum(o.ufc)}</td>`; }).join('');
    return `<tr><th class="sv-micro-hm-rowh"><span class="mic-pe-dot" style="background:${MIC_COLOR[p.key] || '#90A4AE'}"></span>${esc(p.label)}</th>${tds}</tr>`;
  }).join('');
  // Fila propia para V. Luminiscentes: presencia (violeta) / ausencia / sin dato (no UFC).
  if (hasLumin) {
    const tds = days.map((d) => { const v = luminByDay.get(d.key); if (v === true) return '<td class="is-pres" title="Presencia de V. Luminiscentes">✨ Pres.</td>'; if (v === false) return '<td class="muted" title="Ausencia de V. Luminiscentes">Aus.</td>'; return '<td class="muted">·</td>'; }).join('');
    body += `<tr class="sv-micro-hm-lumin"><th class="sv-micro-hm-rowh"><span class="mic-pe-dot" style="background:${MIC_LUMIN_COLOR}"></span>V. Luminiscentes</th>${tds}</tr>`;
  }
  const luminLeg = hasLumin ? `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${MIC_LUMIN_COLOR}"></span>V. Luminiscentes (presencia)</span>` : '';
  return `<div class="sv-micro-hmwrap"><table class="sv-micro-hm"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="mic-legend" style="margin-top:8px">${Object.keys(MIC_NIVEL_COLOR).map((n) => `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${MIC_NIVEL_COLOR[n]}"></span>${esc(n)}</span>`).join('')}${luminLeg}</div>`;
}

/** Series por patógeno (Σ UFC por día) sobre las filas dadas. Ordenadas por el
 *  valor más reciente (desc). Solo patógenos con algún UFC>0. */
function microPathogenTrends(rows) {
  const days = micDaysOf(rows);
  const per = new Map();
  days.forEach((day, i) => {
    microRecords(day.rows).forEach((r) => {
      if (!(r.ufc > 0)) return;
      if (!per.has(r.key)) per.set(r.key, { key: r.key, label: r.label, color: MIC_COLOR[r.key] || '#90A4AE', vals: new Array(days.length).fill(0), has: new Array(days.length).fill(false) });
      const o = per.get(r.key);
      o.vals[i] += r.ufc; o.has[i] = true;
    });
  });
  const series = [...per.values()].map((p) => {
    const present = p.vals.filter((_, i) => p.has[i]);
    const latest = present.length ? present[present.length - 1] : 0;
    const prev = present.length > 1 ? present[present.length - 2] : 0;
    return { ...p, latest, delta: latest - prev, max: present.length ? Math.max(...present) : 0, n: present.length };
  }).sort((a, b) => b.latest - a.latest);
  return { days, series };
}

/** Pestaña Tendencias: Σ UFC/día por patógeno. Selector de patógeno en PÍLDORAS
 *  (fila fija arriba, se elige sin scroll) + UN solo gráfico grande del activo con
 *  sus KPIs. El filtro de tanque acota las series. */
function microTendenciasHTML(rows, state) {
  if (!rows.length) return `<div class="empty-state" style="padding:30px">Sin registros para esta corrida y módulo.</div>`;
  const tanks = micTanksOf(rows);
  if (state.trendTank && !tanks.includes(state.trendTank)) state.trendTank = null;
  const scoped = micRowsForTank(rows, state.trendTank);
  const { days, series } = microPathogenTrends(scoped);
  const tankOpts = `<option value="">Todos los tanques</option>` + tanks.map((t) => `<option value="${esc(t)}" ${state.trendTank === t ? 'selected' : ''}>${esc(micTankLabel(t))}</option>`).join('');
  const bar = `<div class="sv-micro-filters">
      <label class="sv-modal-datelbl">Tanque <select class="sv-modal-select" data-mtrend-tank>${tankOpts}</select></label>
    </div>`;

  if (!series.length || days.length < 1) {
    return bar + `<div class="empty-state" style="padding:30px">Sin UFC registrado para esta selección.</div>`;
  }
  // Patógeno activo: el guardado si sigue presente; si no, el de mayor valor reciente.
  if (!state.trendOpen || !series.some((s) => s.key === state.trendOpen)) state.trendOpen = series[0].key;
  _svMicTrend = { days, series }; // para el dibujo del gráfico grande (post-render)

  const arrow = (d) => d > 0 ? '<span class="sv-mtrend-up">▲</span>' : d < 0 ? '<span class="sv-mtrend-dn">▼</span>' : '<span class="muted">—</span>';
  const dayLabels = days.map((d) => d.label);
  const active = series.find((s) => s.key === state.trendOpen) || series[0];

  // Fila de píldoras (una por patógeno): punto de color + nombre + último valor + flecha.
  const pills = series.map((p) => {
    const on = p.key === state.trendOpen;
    return `<button class="sv-mtrend-pill${on ? ' is-on' : ''}" data-mtrend-open="${esc(p.key)}" aria-pressed="${on}" style="--pc:${p.color}">
        <span class="sv-mtrend-pdot" style="background:${p.color}"></span>
        <span class="sv-mtrend-pname">${esc(p.label)}</span>
        <span class="sv-mtrend-pval">${micFmtNum(p.latest)}</span>
        <span class="sv-mtrend-parr">${arrow(p.delta)}</span>
      </button>`;
  }).join('');

  return bar + `<div class="mic-chart-title" style="margin:4px 0 8px">📈 Tendencia por patógeno <span class="muted">· Σ UFC por día (${esc(dayLabels[0])} → ${esc(dayLabels[dayLabels.length - 1])}) · elige un patógeno</span></div>
    <div class="sv-mtrend-pills">${pills}</div>
    <div class="sv-mtrend-detail">
      <div class="sv-mtrend-dhead"><span class="sv-mtrend-band" style="background:${active.color}"></span><span class="sv-mtrend-dname">${esc(active.label)}</span>${arrow(active.delta)}</div>
      <div class="sv-mtrend-stats">
        <span class="sv-mtrend-kpi"><b>${micFmtNum(active.latest)}</b>Σ UFC último día</span>
        <span class="sv-mtrend-kpi"><b>${micFmtNum(active.max)}</b>máx</span>
        <span class="sv-mtrend-kpi"><b>${active.n}</b>día(s) con dato</span>
      </div>
      <div class="sv-mtrend-chart"><canvas id="svMicTrendChart"></canvas></div>
    </div>`;
}

/* ============================================================
   CALIDAD DE AGUA · modal del módulo (Tabla + Matriz + Tendencias).
   Reusa la capa pura de la sub-vista Calidad de Agua de Microbiología
   (calagua.data.js), acotada a las muestras que comparten corrida + módulo.
   Muestra los parámetros fisicoquímicos por tanque y estadío.
   ============================================================ */
const CW_SEV_COLOR = { optimo: '#2e9e5b', vigilancia: '#d99a00', fuera: '#ef6c00', critico: '#e8303e', 'sin-rango': '#90A4AE' };
const cwSevColor = (sev) => CW_SEV_COLOR[sev] || CW_SEV_COLOR['sin-rango'];
const cwFmt = (v) => (v == null || isNaN(v)) ? '—' : String(Number.isInteger(v) ? v : +v.toFixed(2));
// Mismo canal lateral render → dibujo que _svMicTrend (ver la nota junto a su declaración):
// la escribe cwTendenciasHTML y la lee drawCwTrend, que corre después de que renderCw()
// haya volcado ese HTML al DOM.
let _svCwTrend = null; // { days, range, label, unit } de la pestaña Tendencias (dibujo post-render)

/** Filas de Calidad de Agua que comparten corrida + módulo (número) con este módulo. */
const calAguaForModule = (mod, corrida) => memoByData(memoKey('cw', mod, corrida), () => calAguaForModuleCompute(mod, corrida));
function calAguaForModuleCompute(mod, corrida) {
  const mn = modNum(mod);
  if (mn === null) return [];
  const cd = corrida ? micDigits(corrida) : '';
  return store.globalData.filter((r) => {
    if (!isCalAguaRow(r)) return false;
    const c = calCtx(r);
    if (modNum(c.modulo) !== mn) return false; // robusto ante "3" / "M03" / "Módulo 3"
    if (cd && micDigits(c.corrida) !== cd) return false;
    return true;
  });
}
/** Muestras (ctx + parámetros medidos) de un conjunto de filas de Calidad de Agua.
 *  Memoizado por identidad de (rows, ranges): dentro de una apertura del modal, el panel
 *  de diagnóstico y las vistas (Tanques/Tabla/Matriz/Tendencias) comparten el mismo cálculo
 *  en vez de rehacer calMeasured por fila varias veces. */
let _cwSamplesMemo = { rows: null, ranges: null, out: null };
const cwSamples = (rows, ranges) => {
  if (_cwSamplesMemo.rows === rows && _cwSamplesMemo.ranges === ranges) return _cwSamplesMemo.out;
  const out = rows.map((r) => ({ ctx: calCtx(r), meas: calMeasured(r, ranges) })).filter((s) => s.meas.length);
  _cwSamplesMemo = { rows, ranges, out };
  return out;
};
const cwEmpty = '<div class="empty-state" style="padding:30px">Sin muestras de calidad de agua para esta corrida y módulo.</div>';

/** Vista 1 · Tabla: filas = muestras (fecha · TQ · estadío), columnas = parámetros. */
function cwTablaHTML(rows, ranges) {
  // COPIA antes de ordenar: `cwSamples` devuelve un array MEMOIZADO que comparten las
  // otras cuatro vistas del modal (Matriz, Tendencias, Diagnóstico y Fichas). Ordenarlo
  // in-place reordenaba el array de todas ellas, y Matriz/Diagnóstico resuelven el «último
  // valor por parámetro» con `f >= prev.f`: ante dos medidas de la MISMA fecha gana la
  // última del array, así que abrir Tabla cambiaba lo que mostraban las demás pestañas.
  const samples = [...cwSamples(rows, ranges)].sort((a, b) => (b.ctx.fecha || 0) - (a.ctx.fecha || 0));
  if (!samples.length) return cwEmpty;
  const present = new Set();
  samples.forEach((s) => s.meas.forEach((m) => present.add(m.key)));
  const params = CAL_PARAMS.filter((p) => present.has(p.key));
  // Día de muestreo más reciente (por día-calendario, robusto a la hora del registro):
  // sus filas se resaltan para identificar de un vistazo la lectura fresca del módulo.
  const cwDayKey = (d) => (d && !isNaN(d)) ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : null;
  const latestFecha = samples.reduce((mx, s) => {
    const f = s.ctx.fecha; if (!f || isNaN(f)) return mx; return (mx == null || f > mx) ? f : mx;
  }, null);
  const latestDayKey = cwDayKey(latestFecha);
  const cell = (m) => {
    if (!m) return '<td class="muted" style="text-align:center">—</td>';
    const col = cwSevColor(m.severity);
    const bg = (m.severity && m.severity !== 'optimo' && m.severity !== 'sin-rango') ? `background:${col}22;` : '';
    const warn = m.estado === 'fuera' ? ` <span style="color:${col}">⚠</span>` : '';
    return `<td style="${bg}text-align:right;font-variant-numeric:tabular-nums" title="${esc(m.label)}${m.range ? ' · obj. ' + esc(m.range) : ''}${m.severity ? ' · ' + esc(CAL_SEV[m.severity].label) : ''}">${esc(cwFmt(m.value))}${warn}</td>`;
  };
  const head = `<tr><th>Fecha</th><th>TQ</th><th>Estadío</th>${params.map((p) => `<th style="text-align:right" title="${esc(p.label)}${p.unit ? ' (' + esc(p.unit) + ')' : ''}">${esc(p.label)}</th>`).join('')}</tr>`;
  const body = samples.map((s) => {
    const bk = Object.fromEntries(s.meas.map((m) => [m.key, m]));
    const recent = latestDayKey != null && cwDayKey(s.ctx.fecha) === latestDayKey;
    return `<tr${recent ? ' class="cw-row-recent"' : ''}>
      <td>${s.ctx.fecha ? esc(fmtShort(s.ctx.fecha)) : '—'}${recent ? ' <span class="cw-recent-tag">🕒 reciente</span>' : ''}</td>
      <td>${s.ctx.tq ? 'TQ ' + esc(s.ctx.tq) : '<span class="muted">—</span>'}</td>
      <td>${esc(s.ctx.estadio || '—')}</td>
      ${params.map((p) => cell(bk[p.key])).join('')}
    </tr>`;
  }).join('');
  return `<div class="sv-micro-tablewrap"><table class="sv-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

/** Vista 2 · Matriz: Parámetro (filas) × Tanque (columnas, con estadío en cabecera),
 *  celda = último valor del parámetro en ese tanque, coloreado por severidad. */
function cwMatrizHTML(rows, ranges) {
  const samples = cwSamples(rows, ranges);
  if (!samples.length) return cwEmpty;
  const tankMap = new Map(); // tanque → { estadios:Set, byParam: Map(key → {m, f}) }
  samples.forEach((s) => {
    const tk = s.ctx.tq || '__none';
    if (!tankMap.has(tk)) tankMap.set(tk, { estadios: new Set(), byParam: new Map() });
    const o = tankMap.get(tk);
    if (s.ctx.estadio) o.estadios.add(s.ctx.estadio);
    const f = s.ctx.fecha ? +s.ctx.fecha : 0;
    s.meas.forEach((m) => { const prev = o.byParam.get(m.key); if (!prev || f >= prev.f) o.byParam.set(m.key, { m, f }); });
  });
  const tanks = [...tankMap.keys()].sort((a, b) => a === '__none' ? 1 : b === '__none' ? -1 : natCmp(a, b));
  const present = new Set();
  samples.forEach((s) => s.meas.forEach((m) => present.add(m.key)));
  const params = CAL_PARAMS.filter((p) => present.has(p.key));
  const head = `<tr><th class="sv-micro-hm-rowh">Parámetro \\ Tanque</th>${tanks.map((t) => {
    const est = [...tankMap.get(t).estadios].sort(natCmp).join(', ');
    return `<th>${t === '__none' ? 'Sin TQ' : 'TQ ' + esc(t)}${est ? `<br><span class="muted" style="font-weight:600;font-size:10px">🦐 ${esc(est)}</span>` : ''}</th>`;
  }).join('')}</tr>`;
  const body = params.map((p) => {
    const tds = tanks.map((t) => {
      const rec = tankMap.get(t).byParam.get(p.key);
      if (!rec) return '<td class="muted">·</td>';
      const m = rec.m, col = cwSevColor(m.severity);
      const st = (m.severity && m.severity !== 'optimo' && m.severity !== 'sin-rango')
        ? ` style="background:${col}22;color:${col};font-weight:700;text-align:right;font-variant-numeric:tabular-nums"`
        : ' style="text-align:right;font-variant-numeric:tabular-nums"';
      return `<td${st} title="${esc(p.label)}${m.range ? ' · obj. ' + esc(m.range) : ''}${m.severity ? ' · ' + esc(CAL_SEV[m.severity].label) : ''}">${esc(cwFmt(m.value))}</td>`;
    }).join('');
    return `<tr><th class="sv-micro-hm-rowh">${esc(p.label)}${p.unit ? ` <span class="muted">(${esc(p.unit)})</span>` : ''}</th>${tds}</tr>`;
  }).join('');
  return `<div class="sv-micro-hmwrap"><table class="sv-micro-hm"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="mic-legend" style="margin-top:8px">${['optimo', 'vigilancia', 'fuera', 'critico'].map((k) => `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${cwSevColor(k)}"></span>${esc(CAL_SEV[k].label)}</span>`).join('')}</div>`;
}

/** Serie de un parámetro: promedio por día (asc), con los estadíos muestreados ese día. */
function cwParamSeries(samples, key) {
  const byDay = new Map();
  samples.forEach((s) => {
    if (!s.ctx.fecha || isNaN(s.ctx.fecha)) return;
    const m = s.meas.find((x) => x.key === key); if (!m) return;
    const d = s.ctx.fecha, dk = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    if (!byDay.has(dk)) byDay.set(dk, { d, label: fmtShort(d), vals: [], estadios: new Set() });
    const o = byDay.get(dk);
    o.vals.push(m.value);
    if (s.ctx.estadio) o.estadios.add(s.ctx.estadio);
  });
  return [...byDay.values()].sort((a, b) => a.d - b.d).map((o) => ({
    d: o.d, label: o.label, avg: o.vals.reduce((s, v) => s + v, 0) / o.vals.length,
    estadio: [...o.estadios].sort(natCmp).join(', '),
  }));
}

/** Vista 3 · Tendencias: selector de parámetro en píldoras + gráfico temporal con
 *  banda del rango objetivo. Filtro de tanque acota las series. */
function cwTendenciasHTML(rows, ranges, state) {
  const samples = cwSamples(rows, ranges);
  if (!samples.length) return cwEmpty;
  const tanks = [...new Set(samples.map((s) => s.ctx.tq).filter(Boolean))].sort(natCmp);
  if (state.tank && !tanks.includes(state.tank)) state.tank = null;
  const scoped = state.tank ? samples.filter((s) => s.ctx.tq === state.tank) : samples;
  const present = new Set();
  scoped.forEach((s) => s.meas.forEach((m) => present.add(m.key)));
  const params = CAL_PARAMS.filter((p) => present.has(p.key));
  const tankOpts = `<option value="">Todos los tanques</option>` + tanks.map((t) => `<option value="${esc(t)}" ${state.tank === t ? 'selected' : ''}>TQ ${esc(t)}</option>`).join('');
  const bar = `<div class="sv-micro-filters"><label class="sv-modal-datelbl">Tanque <select class="sv-modal-select" data-cw-tank>${tankOpts}</select></label></div>`;
  if (!params.length) return bar + '<div class="empty-state" style="padding:30px">Sin parámetros medidos para esta selección.</div>';
  if (!state.param || !params.some((p) => p.key === state.param)) state.param = params[0].key;

  // Píldora por parámetro: color de severidad de la última medición + valor.
  const pills = params.map((p) => {
    const ms = scoped.filter((s) => s.ctx.fecha).sort((a, b) => (a.ctx.fecha || 0) - (b.ctx.fecha || 0))
      .map((s) => s.meas.find((m) => m.key === p.key)).filter(Boolean);
    const last = ms[ms.length - 1];
    const col = cwSevColor(last ? last.severity : 'sin-rango');
    const on = p.key === state.param;
    return `<button class="sv-mtrend-pill${on ? ' is-on' : ''}" data-cw-param="${esc(p.key)}" aria-pressed="${on}" style="--pc:${col}">
        <span class="sv-mtrend-pdot" style="background:${col}"></span>
        <span class="sv-mtrend-pname">${esc(p.label)}</span>
        <span class="sv-mtrend-pval">${last ? esc(cwFmt(last.value)) : '—'}</span>
      </button>`;
  }).join('');

  const active = params.find((p) => p.key === state.param);
  const series = cwParamSeries(scoped, state.param);
  const range = ranges[state.param] || null;
  _svCwTrend = { days: series, range, label: active.label, unit: active.unit };
  const vals = series.map((x) => x.avg);
  const last = vals.length ? vals[vals.length - 1] : null;
  const stat = (v) => v == null ? '—' : cwFmt(v);
  const inRange = series.filter((x) => !range ? false : (range.min == null || x.avg >= range.min) && (range.max == null || x.avg <= range.max)).length;
  const dayLabels = series.map((d) => d.label);

  return bar + `<div class="mic-chart-title" style="margin:4px 0 8px">📈 Tendencia por parámetro <span class="muted">· promedio por día${dayLabels.length ? ` (${esc(dayLabels[0])} → ${esc(dayLabels[dayLabels.length - 1])})` : ''} · banda verde = rango objetivo · elige un parámetro</span></div>
    <div class="sv-mtrend-pills">${pills}</div>
    <div class="sv-mtrend-detail">
      <div class="sv-mtrend-dhead"><span class="sv-mtrend-band" style="background:#00838f"></span><span class="sv-mtrend-dname">${esc(active.label)}${active.unit ? ` <span class="muted">(${esc(active.unit)})</span>` : ''}</span>${range ? `<span class="muted" style="font-size:11px">obj. ${esc(calRangeText(state.param, ranges))}</span>` : ''}</div>
      <div class="sv-mtrend-stats">
        <span class="sv-mtrend-kpi"><b>${stat(last)}</b>último</span>
        <span class="sv-mtrend-kpi"><b>${stat(vals.length ? Math.min(...vals) : null)}</b>mín</span>
        <span class="sv-mtrend-kpi"><b>${stat(vals.length ? Math.max(...vals) : null)}</b>máx</span>
        <span class="sv-mtrend-kpi"><b>${!range ? '—' : (series.length ? Math.round(inRange / series.length * 100) + '%' : '—')}</b>días en rango</span>
      </div>
      <div class="sv-mtrend-chart"><canvas id="svCwTrendChart"></canvas></div>
    </div>`;
}

/* ── Calidad de Agua (Supervisor) · Panel de diagnóstico + WQI ──
   Síntesis del módulo, siempre visible sobre las vistas. Reutiliza la capa pura
   calDiagnosis (WQI global, fuera/crítico, top-parámetros, tanques en riesgo). */
const CW_RISK_TO_SEV = { bajo: 'optimo', medio: 'vigilancia', alto: 'fuera', critico: 'critico', 'sin-datos': 'sin-rango' };
// La banda del WQI vive en core/format.js (wqiBand), compartida con Microbiología
// y Visitante. Al unificarla, el caso sin dato pasó de «sin datos» a «Sin datos»,
// que es la forma que ya usaban las otras vistas y el LEVEL_LABEL de core.
function cwDiagPanelHTML(rows, ranges) {
  const samples = cwSamples(rows, ranges);
  if (!samples.length) return '';
  const d = calDiagnosis(samples, ranges);
  const band = wqiBand(d.wqi);
  const gcol = cwSevColor(band.sev);
  const gauge = `<div class="cw-gauge" style="--g:${d.wqi == null ? 0 : d.wqi};--gc:${gcol}">
      <div class="cw-gauge-hole"><span class="cw-gauge-v">${d.wqi == null ? '—' : d.wqi}</span><span class="cw-gauge-lbl">WQI</span></div>
    </div>
    <span class="cw-gauge-band" style="color:${gcol}">${esc(band.label)}</span>`;
  const topChips = d.topParams.length
    ? d.topParams.map((p) => `<span class="cw-chip cw-chip--warn">${esc(p.label)} <b>×${p.n}</b></span>`).join('')
    : '<span class="cw-ok">✓ todo en rango</span>';
  const riskChips = d.riskTanks.length
    ? d.riskTanks.slice(0, 6).map((t) => { const c = cwSevColor(CW_RISK_TO_SEV[t.risk]); return `<span class="cw-chip" style="border-color:${c};color:${c};background:${c}14">${esc(t.modulo)} · ${esc(t.label)}</span>`; }).join('')
    : '<span class="cw-ok">✓ sin tanques en riesgo</span>';
  const diag = `Se evaluaron <b>${d.total}</b> muestra(s) (<b>${d.evaluated}</b> medición(es) con rango objetivo). `
    + (d.outCount ? `<b>${d.outCount}</b> fuera de rango${d.critCount ? ` (<b>${d.critCount}</b> crítica(s))` : ''}.` : 'Todas dentro de rango.');
  return `<div class="cw-panel">
    <div class="cw-panel-gauge">${gauge}</div>
    <div class="cw-panel-body">
      <p class="cw-diag">${diag}</p>
      <div class="cw-panel-row"><span class="cw-panel-lbl">Parámetros fuera</span><div class="cw-chips">${topChips}</div></div>
      <div class="cw-panel-row"><span class="cw-panel-lbl">Tanques en riesgo</span><div class="cw-chips">${riskChips}</div></div>
    </div>
  </div>`;
}

/* ── Calidad de Agua (Supervisor) · Vista "Tanques": tarjetas-instrumento ──
   Una ficha por tanque (peor riesgo primero) con lectura digital + escala/aguja por
   parámetro. Reutiliza calGroupTree (Módulo→Tanque, WQI/riesgo/críticos por nodo). */
// Último valor medido por parámetro dentro de un conjunto de muestras del tanque.
function cwLatestByParam(samples) {
  const byParam = new Map();
  samples.forEach((s) => {
    const f = s.ctx.fecha ? +s.ctx.fecha : 0;
    s.meas.forEach((m) => { const prev = byParam.get(m.key); if (!prev || f >= prev.f) byParam.set(m.key, { m, f }); });
  });
  return byParam;
}
// Escala del instrumento: dominio alrededor del rango objetivo (+60% a cada lado) →
// posición de la aguja y de la zona objetivo en % (0–100). null si no hay rango.
function cwScale(range, value) {
  if (!range || value == null || isNaN(value)) return null;
  let lo = range.min, hi = range.max;
  if (lo == null && hi == null) return null;
  if (lo == null) lo = Math.min(0, hi);
  if (hi == null) hi = (lo * 2) || 1;
  const span = (hi - lo) || Math.abs(hi) || 1;
  const dLo = lo - span * 0.6, dHi = hi + span * 0.6;
  const pct = (x) => Math.max(0, Math.min(100, ((x - dLo) / (dHi - dLo)) * 100));
  return { pos: pct(value), loPct: pct(lo), hiPct: pct(hi) };
}
function cwTankCardHTML(t, ranges) {
  const latest = cwLatestByParam(t.samples);
  const params = CAL_PARAMS.filter((p) => latest.has(p.key));
  const riskCol = cwSevColor(CW_RISK_TO_SEV[t.risk] || 'sin-rango');
  const riskLabel = (CAL_RISK[t.risk] || {}).label || t.risk;
  const wqi = t.wqi == null ? '—' : t.wqi;
  const fps = params.map((p) => {
    const m = latest.get(p.key).m;
    const col = cwSevColor(m.severity);
    const sc = cwScale(ranges[p.key], m.value);
    const scaleHTML = sc
      ? `<span class="cw-scale"><span class="cw-scale-zone" style="left:${sc.loPct}%;width:${Math.max(0, sc.hiPct - sc.loPct)}%"></span><span class="cw-scale-needle" style="left:${sc.pos}%;background:${col}"></span></span>`
      : '<span class="cw-scale cw-scale--na">sin rango objetivo</span>';
    return `<div class="cw-fp">
      <span class="cw-fp-name" title="${esc(p.label)}">${esc(p.label)}</span>
      <span class="cw-fp-val" style="color:${col}">${esc(cwFmt(m.value))}${p.unit ? `<small>${esc(p.unit)}</small>` : ''}</span>
      ${scaleHTML}
    </div>`;
  }).join('');
  return `<div class="cw-card" style="--rc:${riskCol}">
    <div class="cw-card-head">
      <span class="cw-card-tq">${esc(t.label)}</span>
      <span class="cw-card-risk" style="background:${riskCol}">${esc(riskLabel)}</span>
    </div>
    <div class="cw-card-sub"><span class="cw-card-mod">${esc(t.modulo)}</span><span class="cw-card-wqi">WQI <b>${wqi}</b></span><span class="cw-card-n">${t.n} muestra(s)</span></div>
    ${t.crit.length ? `<div class="cw-card-crit">${t.crit.slice(0, 5).map((c) => `<span class="cw-chip cw-chip--warn">${esc(c)}</span>`).join('')}</div>` : ''}
    <div class="cw-fps">${fps}</div>
  </div>`;
}
/** Vista 4 · Tanques: tarjetas-instrumento (peor riesgo primero). */
function cwFichasHTML(rows, ranges) {
  const samples = cwSamples(rows, ranges);
  if (!samples.length) return cwEmpty;
  const tree = calGroupTree(samples, ranges);
  const tanks = tree.flatMap((mo) => mo.tanks.map((t) => ({ modulo: mo.label, ...t })));
  const cards = tanks.map((t) => cwTankCardHTML(t, ranges)).join('');
  const legend = `<div class="mic-legend" style="margin:0 0 10px">${['optimo', 'vigilancia', 'fuera', 'critico'].map((k) => `<span class="mic-legend-item"><span class="mic-legend-dot" style="background:${cwSevColor(k)}"></span>${esc(CAL_SEV[k].label)}</span>`).join('')}</div>`;
  return `${legend}<div class="cw-fichas">${cards}</div>`;
}

/* ---- Modal "Siembras y Cosecha" (se abre desde el KPI Técnico) ------------
   Estilo NATIVO: clase .sv-table + semáforo del sistema (svLevel/levelColor) +
   fmtPop. Datos: computeSiembras (views/supervisor/siembras.js). Solo lectura. */
function svSiePct(v) {
  if (v === null || v === undefined || isNaN(v)) return '<span class="muted">—</span>';
  return `<span class="sv-sie-sv" style="color:${levelColor(svLevel(v))}">${fmt1(v, '%')}</span>`;
}
function svSieBand(sie) {
  const tks = sie.tanks;
  const range = tks.length > 1 ? `${tks[0].tq}–${tks[tks.length - 1].tq}` : (tks[0] ? tks[0].tq : '');
  const fecha = sie.dateMs ? fmtShort(new Date(sie.dateMs)) : '—';
  const lote = sie.lotes.length ? ' · Lote ' + esc(sie.lotes.join(', ')) : '';
  return `<tr class="sv-sie-band"><td colspan="8">${sie.idx}ª siembra <span class="sv-sie-bmeta">· N5 ${esc(fecha)}${lote}</span><span class="sv-sie-bcount">${esc(range)} · ${tks.length} tanque${tks.length !== 1 ? 's' : ''}</span></td></tr>`;
}
function svSieTankRow(t) {
  const trans = t.enProceso
    ? '<span class="muted">—</span> <span class="sv-sie-proc">en proceso</span>'
    : fmtPop(t.transferido);
  return `<tr>
    <td class="sv-sie-tk">${esc(t.tq)}</td>
    <td class="muted">${esc(t.lote || '—')}</td>
    <td class="sv-sie-num">${fmtPop(t.siembra)}</td>
    <td class="sv-sie-b sv-sie-num">${trans}</td>
    <td class="sv-sie-num">${t.enProceso ? '<span class="muted">—</span>' : svSiePct(t.superv)}</td>
    <td>${esc(t.estadio || '—')}</td>
    <td class="sv-sie-num sv-sie-proy">${t.enProceso ? '<span class="muted">—</span>' : fmtPop(t.proyectado)}</td>
    <td class="sv-sie-num sv-sie-proy">${t.enProceso ? '<span class="muted">—</span>' : svSiePct(t.supervProy)}</td>
  </tr>`;
}
function svSieRollupRow(st, label, cls) {
  // Cada cantidad va seguida de la supervivencia que produce: Transferido→Superv. y
  // Proyectado→Superv. proy. "A cosechar" cae en la MISMA columna que el Proyectado
  // por tanque, así que esa columna suma de arriba abajo.
  return `<tr class="${cls}">
    <td colspan="2" class="sv-sie-stlbl">${esc(label)}</td>
    <td class="sv-sie-num">${fmtPop(st.sembrado)}</td>
    <td class="sv-sie-b sv-sie-num">${fmtPop(st.transferido)}</td>
    <td class="sv-sie-num">${svSiePct(st.superv)}</td>
    <td class="sv-sie-cosecha">🎯 A cosechar</td>
    <td class="sv-sie-num sv-sie-proy"><b>${fmtPop(st.aCosechar)}</b></td>
    <td class="sv-sie-num sv-sie-proy">${svSiePct(st.supervProy)}</td>
  </tr>`;
}
/** Merma seleccionable: 6 % … 15 %. El 10 % es el estándar y el valor por defecto. */
const SIE_MERMAS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Cabecera del modal: KPIs de contexto + selector de merma (no se re-renderiza al
 *  cambiar el %, para que el <select> no pierda el foco a mitad de interacción). */
function svSiembrasHeadHTML(data, mod, corrida, tecnicos, corrMods) {
  const mermaPct = Math.round(data.merma * 100);
  const tecLbl = (tecnicos && tecnicos.length) ? esc(tecnicos.join(' · ')) : '—';
  const tecs = tecnicos && tecnicos.length > 1;
  // El botón solo existe si hay OTRO módulo con el que sumar: con un único módulo la
  // fila de corrida repetiría cifra por cifra el total de arriba y haría dudar de si
  // están bien. Los módulos van en el título para saber qué se está sumando sin abrirlo.
  const others = (corrMods || []).filter((m) => m !== mod);
  const corrBtn = others.length
    ? `<button type="button" class="sv-sie-corrbtn" data-sie-corrida aria-pressed="false"
        title="Añade una fila con el total de la corrida C${esc(corrida)}: este módulo sumado a ${others.length === 1 ? 'el módulo ' : 'los módulos '}${esc(others.join(', '))}">🔗 Total de la corrida</button>`
    : '';
  return `<div class="sv-modal-kpis">
      <span class="sv-modal-kpi"><b>${tecLbl}</b>técnico${tecs ? 's' : ''}</span>
      <span class="sv-modal-kpi"><b>${esc(mod)}</b>módulo</span>
      ${corrida ? `<span class="sv-modal-kpi"><b>C${esc(corrida)}</b>corrida</span>` : ''}
      <span class="sv-modal-kpi"><b>${data.nSiembras}</b>siembra${data.nSiembras !== 1 ? 's' : ''}</span>
      <span class="sv-modal-kpi"><b>${data.nTanks}</b>tanque${data.nTanks !== 1 ? 's' : ''}</span>
      <label class="sv-modal-kpi sv-sie-merma" title="Porcentaje de mortalidad que se descuenta del Transferido para proyectar la cosecha">
        📉 Merma
        <select class="sv-modal-select" data-sie-merma aria-label="Porcentaje de merma descontado">
          ${SIE_MERMAS.map((p) => `<option value="${p}"${p === mermaPct ? ' selected' : ''}>−${p}%</option>`).join('')}
        </select>
      </label>
      ${corrBtn}
    </div>`;
}

/** Bloque «Total de la corrida»: una línea tenue por módulo + la fila agregada.
 *  Se pinta con el MISMO `svSieRollupRow` que los subtotales y el total de módulo, así
 *  las columnas cuadran de arriba abajo y ninguna cifra se deriva por otro camino. */
function svSieCorridaRowsHTML(corr, corrida, mod) {
  if (!corr) return '';
  const breakdown = corr.modules.map((m) => svSieRollupRow(
    m.total,
    `· Módulo ${m.mod}${m.mod === mod ? ' (este)' : ''}`,
    'sv-sie-cormod',
  )).join('');
  return breakdown + svSieRollupRow(
    corr.total,
    `Total de la corrida${corrida ? ' C' + corrida : ''}`,
    'sv-sie-cortotal',
  );
}

/** Cuerpo recalculable: tabla + nota. Se vuelve a pintar al cambiar la merma.
 *  `corr` (opcional) = resultado de `computeCorridaSiembras`; null → sin fila de corrida. */
function svSiembrasContentHTML(data, mod, corrida, corr) {
  const mermaPct = Math.round(data.merma * 100);
  const body = data.nSiembras
    ? `<div class="sv-sie-wrap">
        <table class="sv-table sv-sie-table">
          <thead>
            <tr class="sv-sie-grouphead">
              <th colspan="3">🌱 Siembra</th>
              <th colspan="5" class="sv-sie-b">🎯 Transferencia · Cosecha</th>
            </tr>
            <tr>
              <th>Tanque</th><th>Lote</th><th class="sv-sie-num">Sembrado</th>
              <th class="sv-sie-b sv-sie-num" title="Última población registrada antes del despacho">Transferido</th>
              <th class="sv-sie-num" title="Supervivencia REAL: Transferido ÷ Sembrado. No la afecta la merma.">Superv.</th>
              <th title="Estadío de la misma línea del Transferido">Estadío</th>
              <th class="sv-sie-num sv-sie-proy" title="Población proyectada: Transferido menos la merma seleccionada">Proyectado −${mermaPct}%</th>
              <th class="sv-sie-num sv-sie-proy" title="Supervivencia proyectada a cosecha: la real menos la merma seleccionada">Superv. proy. −${mermaPct}%</th>
            </tr>
          </thead>
          <tbody>
            ${data.siembras.map((sie) => svSieBand(sie)
              + sie.tanks.map(svSieTankRow).join('')
              + svSieRollupRow(sie.subtotal, `Subtotal ${sie.idx}ª siembra`, 'sv-sie-subtotal')).join('')}
          </tbody>
          <tfoot>
            ${svSieRollupRow(data.total, `Total módulo ${mod}`, 'sv-sie-total')}
            ${svSieCorridaRowsHTML(corr, corrida, mod)}
          </tfoot>
        </table>
      </div>
      <div class="sv-modal-note">🌱 Sembrado = población del primer registro <b>N5</b> · <b>Transferido</b> = última población registrada <b>antes del despacho</b> (si el módulo aún no despacha, la más reciente) y el Estadío es el de esa misma línea · <b>Superv.</b> = Transferido ÷ Sembrado, la supervivencia real (no la mueve la merma) · <b>Proyectado</b> = Transferido − ${mermaPct}% (suma al «A cosechar») · <b>Superv. proy.</b> = la real menos ese ${mermaPct}%, lo que se espera al cosechar. La supervivencia de los subtotales solo cuenta los tanques con Transferido registrado (los «en proceso» aún no).${corr ? ` <b>🔗 Total de la corrida</b> = los ${corr.modules.length} módulos de la corrida sumados (${corr.nTanks} tanques); su supervivencia se recalcula sobre el sembrado agregado, no es el promedio de las de cada módulo.` : ''}</div>`
    : `<div class="empty-state" style="padding:30px">Sin siembras registradas para ${esc(mod)}${corrida ? ' · C' + esc(corrida) : ''}.</div>`;
  return body;
}

function svSiembrasModalHTML(data, mod, corrida, tecnicos, corrMods) {
  return `<div class="sv-modal" id="svSiembrasModal" data-siembrasmodal>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🌱 Siembras y Cosecha — ${esc(mod)}${corrida ? ' · C' + esc(corrida) : ''}</span>
        <button class="sv-modal-x" data-siembras-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        ${data.nSiembras ? svSiembrasHeadHTML(data, mod, corrida, tecnicos, corrMods) : ''}
        <div id="svSieContent"></div>
      </div>
    </div>
  </div>`;
}

export function renderModule(ctx, mod) {
  // El tooltip del heatmap Biomol vive colgado de <body>, FUERA del contenedor de la vista:
  // si se sale del módulo con el modal abierto (p. ej. tabulando por detrás del overlay,
  // que no atrapa el foco), su `onClose` no llega a ejecutarse y el nodo queda huérfano —
  // y visible, con contenido obsoleto, porque su `mouseleave` murió con la celda. Barrerlo
  // al entrar garantiza que nunca sobreviva a un cambio de módulo.
  bmDestroyTip();
  const corrida = ctx.vState.corrida || null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const s = modStats(ctx, mod, corrida);
  const tanks = tanksOf(ctx, mod, corrida);

  // tankStats por tanque (caro: filtra larvWin/tanqWin/larvCM + ordena). Se calcula
  // UNA vez y se reutiliza en la mini-comparativa Y en la grilla de tanques (antes
  // se computaba 2× por tanque).
  const tsByTank = new Map(tanks.map((tq) => [tq, tankStats(ctx, mod, tq, corrida)]));

  // RO1 · métricas por tanque para la mini-comparativa (SV + ICL promedio).
  // El ICL se calcula sobre las filas DE CADA TANQUE. `tankStats.lRows` incluye además las
  // filas de Larvicultura sin tanque (registros a nivel de MÓDULO): al ser las MISMAS para
  // todos, acercaban entre sí los ICL de los tanques y corrían el ranking mejor/peor hacia el
  // promedio del módulo — es decir, contaminaban justo la diferencia que esta comparativa
  // existe para mostrar. Mismo criterio que la vista Tanque y que OM vs Tex.
  const tankCmp = tanks.map((tq) => {
    const ts = tsByTank.get(tq);
    const own = ts.lRows.filter((r) => getField(r, F.tanque) === tq);
    const iclVals = iclSeries(own).values.filter((v) => v !== null && v !== undefined);
    return { tq, sv: ts.sv, icl: avg(iclVals) };
  });

  // RO1 · ranking mejor/peor tanque combinando AMBAS variables (Supervivencia + ICL).
  // Se normaliza cada variable a [0,1] entre los tanques (escalas distintas) y se promedia.
  const cmpRank = (() => {
    const ok = (v) => v !== null && v !== undefined && !isNaN(v);
    const valid = tankCmp.filter((t) => ok(t.sv) && ok(t.icl));
    if (valid.length < 2) return null;
    const svs = valid.map((t) => t.sv), icls = valid.map((t) => t.icl);
    const nrm = (v, arr) => { const mn = Math.min(...arr), mx = Math.max(...arr); return mx === mn ? 0.5 : (v - mn) / (mx - mn); };
    const scored = valid.map((t) => ({ ...t, score: 0.5 * nrm(t.sv, svs) + 0.5 * nrm(t.icl, icls) }))
      .sort((a, b) => b.score - a.score);
    return { best: scored[0], worst: scored[scored.length - 1] };
  })();

  // #2 · comentarios de supervisión del módulo (col. Comentario de Registro_Supervisión).
  // #1 · deben cumplir la MISMA corrida (si hay una elegida) y el módulo.
  const atRows = memoByData(memoKey('at', mod, corrida), () => store.globalData
    .filter((r) => isRevisionRow(r) && sameModule(getField(r, F.modulo), mod)
      && (!corrida || getField(r, F.corrida) === corrida) && hasCom(r))
    .sort((a, b) => (parseAnyDate(getField(b, F.fecha)) || 0) - (parseAnyDate(getField(a, F.fecha)) || 0)));

  // Biomol · análisis moleculares de la corrida+módulo (incluye muestras compartidas de módulos
  // pareados; excluye estadío Reproductores). Sin corrida elegida → todas las corridas del módulo.
  const biomolRows = biomolForModule(mod, corrida);
  // Microbiología (hoja "Microbiología") de la misma corrida + módulo → modal Placa/Tabla/Heatmap.
  const microRows = microForModule(mod, corrida);
  // Calidad de Agua (hoja "Calidad de Agua") de la misma corrida + módulo → modal Tabla/Matriz/Tendencias.
  const calAguaRows = calAguaForModule(mod, corrida);
  // Mapa tanque → lote (desde Larvicultura) para el tooltip del E.D.T.
  // SIN prototipo: se indexa por nombre de tanque, que sale de la hoja. Con un objeto literal
  // un tanque llamado "constructor" o "toString" resolvería al miembro HEREDADO de
  // Object.prototype —truthy— y el tooltip imprimiría el código de esa función como si fuera
  // el lote. Mismo criterio que despacho.js y que `bmAlias` en este mismo fichero.
  const tankLote = Object.create(null);
  ctx.larvWin.forEach((r) => {
    if (getField(r, F.modulo) !== mod || (corrida && getField(r, F.corrida) !== corrida)) return;
    const tq = getField(r, F.tanque), lote = getField(r, F.lote);
    if (tq && lote && !tankLote[tq]) tankLote[tq] = lote;
  });

  // #3 · Detalle de desinfección del módulo+corrida (TODOS los registros + cumplimiento).
  const desinf = desinfeccionDetalle(mod, corrida);

  // Proyección de cosecha (días estimados hasta PL11) según el ritmo de estadío.
  const cos = cosechaEstimate(ctx, mod, corrida, 'PL11');
  const cosechaLabel = cos ? (cos.reached ? 'En cosecha' : '≈ ' + cos.days + ' días') : '—';

  // Cuadro de Siembras y Cosecha (modal del KPI Técnico). Se agrupa por fecha de N5.
  // Usa la línea base poblacional (larvCM: corrida+mes, SIN la ventana de fecha global)
  // para no truncar el transferido/cosecha más recientes del módulo.
  const siembrasRows = ctx.larvCM.filter((r) => getField(r, F.modulo) === mod);
  const siembrasData = computeSiembras(siembrasRows);
  // Módulos que comparten esta corrida (el actual incluido) para la fila «Total de la
  // corrida». Sin corrida elegida no hay conjunto que sumar: `ctx.larvCM` traería TODAS
  // las corridas del módulo y el total agregado no significaría nada.
  const corrMods = corrida ? modulesOfCorrida(corrida) : [];

  let h = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod },
  ]);

  h += `<div class="sv-banner" style="background:${col.bg}">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">📊 RESUMEN OPERATIVO</div>
    <div class="sv-banner-name">${esc(mod)}</div>
    <div class="sv-card-sub">🔄 ${corrida ? 'Corrida: ' + esc(corrida) : 'Todas las corridas'}</div>
    <div class="sv-kpi-grid sv-kpi-wide">
      ${kpiGlass('📈', 'Supervivencia', fmt1(s.sv, '%'), 'data-modmetric="sv" role="button" tabindex="0" title="Ver tendencia de supervivencia del módulo"')}
      ${kpiGlass('📉', 'Mortalidad', fmt1(s.mort, '%'))}
      ${kpiGlass('👥', 'Pob. actual', fmtPop(s.pop), 'data-modmetric="pop" role="button" tabindex="0" title="Ver tendencia de población total del módulo"')}
      ${kpiGlass('👥', 'Pob. inicial', fmtPop(s.popFirst))}
      ${kpiGlass('🦐', 'Estadío', s.estadio || '—', 'data-siembras-open role="button" tabindex="0" title="Ver el cuadro de siembras y cosecha del módulo"')}
      ${kpiGlass('💧', 'OD Promedio', fmt2(s.od, ' mg/L'), 'data-modmetric="od" role="button" tabindex="0" title="Ver OD por hora (promedio del módulo)"')}
      ${kpiGlass('🌡️', 'Temperatura', fmt1(s.tmp, '°C'), 'data-modmetric="tmp" role="button" tabindex="0" title="Ver Temperatura por hora (promedio del módulo)"')}
      ${kpiGlass('🧂', 'Salinidad', fmt1(s.sal, ' ppt'))}
      ${kpiGlass('🍽️', 'Nutrición IL', fmt1(s.il, '%'))}
      ${kpiGlass('✨', 'Calidad Líp.', fmt1(s.lip, '%'))}
      ${kpiGlass('⚡', '% Actividad', fmt1(s.act, '%'))}
      ${kpiGlass('🔬', 'PL/g (Larvia)', fmt1(s.plgLarvia), 'data-modmetric="plg" role="button" tabindex="0" title="Ver tendencia de PL/g (Larvia) del módulo"')}
      ${kpiGlass('🧹', '% Suciedad', fmt1(s.suc, '%'))}
      ${kpiGlass('📅', 'Días proceso', String(s.dias), 'data-modtrace role="button" tabindex="0" title="Trazabilidad: descargar las fichas del módulo en PDF"')}
      ${kpiGlass('🎯', 'Cosecha', cosechaLabel)}
      ${kpiTecnicos(s.tecnicos)}
    </div>
  </div>`;

  // Franja de semáforo (aquí las tarjetas de tanque son blancas → el color se aprecia).
  const SEM_LEGEND = [['excelente', 'Azul · Excelente'], ['bueno', 'Verde · Bueno'], ['malo', 'Amarillo · Regular'], ['grave', 'Rojo · Grave']];
  h += `<div class="sv-legend" style="margin-bottom:14px">
    <span class="sv-legend-title">🚦 Semáforo</span>
    ${SEM_LEGEND.map(([lvl, t]) => `<span class="sv-legend-item"><span class="sv-dot" style="background:${levelColor(lvl)}"></span><b>${t}</b></span>`).join('')}
  </div>`;

  // OM vs Tex se ofrece cuando el módulo+corrida tiene lotes de Texcumar (la comparación
  // gira en torno a esa marca; si falta Omarsa, la vista muestra solo la marca presente).
  const brandsHere = new Set();
  ctx.larvWin.forEach((r) => { if (getField(r, F.modulo) === mod && (!corrida || getField(r, F.corrida) === corrida)) { const b = lotBrand(getField(r, F.lote)); if (b) brandsHere.add(b); } });
  const hasTex = brandsHere.has('TEX');

  // Acciones: despacho · OM vs Tex · Comparativa tanques · Historial As. Téc.
  const hasCmp = tankCmp.some((t) => t.sv !== null || t.icl !== null);
  h += `<div class="sv-actions" style="margin-bottom:18px">
    <button class="sv-action-btn sv-action-despacho" data-nav="despacho" data-mod="${esc(mod)}">🚛 Despacho</button>
    ${hasTex ? `<button class="sv-action-btn" data-nav="omtex" data-mod="${esc(mod)}">⚖️ OM vs Tex</button>` : ''}
    ${hasCmp ? '<button class="sv-action-btn" data-modcmp-open>📊 Comparativa tanques</button>' : ''}
    <button class="sv-action-btn" data-athist-open>👨‍🔬 Historial As. Téc.${atRows.length ? ` (${atRows.length})` : ''}</button>
    ${biomolRows.length ? `<button class="sv-action-btn" data-biomol-open>🧬 Biomol (${biomolRows.length})</button>` : ''}
    ${microRows.length ? `<button class="sv-action-btn" data-micro-open>🧫 Microbiología (${microRows.length})</button>` : ''}
    ${calAguaRows.length ? `<button class="sv-action-btn" data-cw-open>💧 Calidad de Agua (${calAguaRows.length})</button>` : ''}
    ${desinf ? `<button class="sv-action-btn" data-desinf-open>🧴 Desinfección${desinf.cumplimiento !== null ? ` (${desinf.cumplimiento}%)` : ''}</button>` : ''}
    <button class="sv-action-btn" data-mareas-open>🌊 Mareas</button>
    <button class="sv-action-btn" data-modday-open>📅 Resumen del día</button>
  </div>`;

  // Lista de tanques del módulo
  h += `<div class="sv-section-title" style="margin-top:16px">Tanques (${tanks.length})</div>`;
  if (tanks.length) {
    h += '<div class="sv-tank-grid">';
    tanks.forEach((tq) => {
      const ts = tsByTank.get(tq);
      // Tanque fuera de despacho. Agrupado y descartado tienen la misma consecuencia
      // numérica (pob./SV en 0, excluido del recuento de alertas) pero NO la misma causa,
      // así que se rotulan por separado: el supervisor necesita distinguir "se unió a otro
      // tanque" de "se perdió". Agrupado manda si constan ambas anotaciones.
      const out = ts.grouped
        ? { cls: ' is-grouped', aria: ' (agrupado)', chip: ' <span class="sv-tank-grouped" title="Tanque agrupado: pob./SV en 0; su siembra inicial sigue contando">🔗 Agrupado</span>' }
        : ts.discarded
          ? { cls: ' is-discarded', aria: ' (descartado)', chip: ' <span class="sv-tank-discarded" title="Tanque descartado: no llega al despacho; su siembra inicial sigue contando">🗑️ Descartado</span>' }
          : { cls: '', aria: '', chip: '' };
      h += `<div class="sv-tank-card${out.cls}" data-nav="tank" data-mod="${esc(mod)}" data-tank="${esc(tq)}" role="button" tabindex="0" aria-label="Abrir tanque ${esc(tq)} del módulo ${esc(mod)}${out.aria}">
        <div class="sv-tank-head">
          <span class="sv-tank-name">${esc(tq)}${out.chip}</span>
          <span class="sv-dot" style="background:${levelColor(svLevel(ts.sv))}" title="${levelLabel(svLevel(ts.sv))}"></span>
        </div>
        <div class="sv-tank-metrics">
          <div><span class="muted">SV</span><b>${fmt1(ts.sv, '%')}</b></div>
          <div><span class="muted">OD</span><b style="color:${levelColor(odLevel(ts.od))}">${fmt2(ts.od)}</b></div>
          <div><span class="muted">T°</span><b style="color:${levelColor(tmpLevel(ts.tmp))}">${fmt1(ts.tmp)}</b></div>
          <div><span class="muted">Pob</span><b>${fmtPop(ts.pop)}</b></div>
        </div>
        <div class="sv-tank-stage">🦐 ${esc(ts.estadio || '—')}</div>
      </div>`;
    });
    h += '</div>';
  } else {
    h += `<div class="empty-state">Sin tanques registrados para este módulo.</div>`;
  }

  // Modal Historial As. Téc. (#2) — con barra de 3 filtros (Supervisor / Comentario / Siembra).
  const atBlock = (tag, cls, txt) => txt ? `<div class="sv-com-block"><span class="sv-com-tag ${cls}">${tag}</span><p class="sv-hist-text">${esc(txt)}</p></div>` : '';
  // Una fila del historial; `com` decide qué bloque(s) de comentario se muestran.
  const atItemHTML = (r, com) => `
        <div class="sv-hist-item">
          <span class="sv-hist-date">${esc(getField(r, F.fecha) || '—')}${getField(r, SIE_KEYS) ? ' · ' + esc(getField(r, SIE_KEYS)) + ' Siembra' : ''}</span>
          <div class="sv-hist-meta">${esc(getField(r, SUP_KEYS) || 'Supervisor')}${getField(r, F.corrida) ? ' · C' + esc(getField(r, F.corrida)) : ''}</div>
          ${com !== 'pm' ? atBlock('☀️ Matutino', 'sv-com-am', getComM(r)) : ''}
          ${com !== 'am' ? atBlock('🌙 Vespertino', 'sv-com-pm', getComV(r)) : ''}
        </div>`;
  // Filtra atRows según supervisor / comentario(am|pm|all) / siembra.
  const filterAtRows = (sup, com, sie) => atRows.filter((r) => {
    if (sup !== '__all' && (getField(r, SUP_KEYS) || 'Supervisor') !== sup) return false;
    if (com === 'am' && !getComM(r)) return false;
    if (com === 'pm' && !getComV(r)) return false;
    if (sie !== '__all' && (getField(r, SIE_KEYS) || '') !== sie) return false;
    return true;
  });
  const supList = [...new Set(atRows.map((r) => getField(r, SUP_KEYS) || 'Supervisor'))].sort();
  // La columna «Siembra» trae ORDINALES ESCRITOS, no números: medido sobre las 716 filas
  // de producción, sus únicos valores son "Primera", "Segunda" y "Tercera". Por eso se
  // ordena por el ordinal que representan y no alfabéticamente: hoy ambos criterios dan
  // el mismo resultado por casualidad, pero una "Cuarta" se colocaría la PRIMERA de la
  // lista. Lo no reconocido va al final, en orden alfabético, para que un valor nuevo
  // siga apareciendo en vez de desaparecer.
  const sieList = [...new Set(atRows.map((r) => getField(r, SIE_KEYS)).filter(Boolean))]
    .sort((a, b) => (sieOrder(a) - sieOrder(b)) || String(a).localeCompare(String(b), 'es'));
  const opt = (v, lbl) => `<option value="${esc(v)}">${esc(lbl)}</option>`;
  const atFiltersHTML = `<div class="sv-hist-filters">
      <label>👤 Supervisor <select class="sv-modal-select" data-athist-sup>${opt('__all', 'Todos')}${supList.map((s) => opt(s, s)).join('')}</select></label>
      <label>💬 Comentario <select class="sv-modal-select" data-athist-com>${opt('__all', 'Todos')}${opt('am', '☀️ Matutino')}${opt('pm', '🌙 Vespertino')}</select></label>
      <label>🌱 Siembra <select class="sv-modal-select" data-athist-sie>${opt('__all', 'Todas')}${sieList.map((s) => opt(s, s)).join('')}</select></label>
    </div>`;
  h += `<div class="sv-modal" id="svAtModal" data-atmodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">👨‍🔬 Historial de Asistencia Técnica — ${esc(mod)}</span>
        <button class="sv-modal-x" data-athist-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        ${atRows.length ? atFiltersHTML : ''}
        <div class="sv-hist-list" id="svAtList"></div>
      </div>
    </div>
  </div>`;

  // Modal Biomol — heatmap diagnóstico × tanque del módulo
  if (biomolRows.length) {
    h += `<div class="sv-modal" id="svBiomolModal" data-biomolmodal>
      <div class="sv-modal-card lv-fs-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">🧬 Biomol — ${esc(mod)}</span>
          <button class="sv-modal-x" data-biomol-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          <div class="sv-bm-modebar">
            <span class="sv-bm-mode-label">Vista:</span>
            <button class="sv-bm-mode-btn is-active" data-bmmode="tank">Heatmap · Tanque</button>
            <button class="sv-bm-mode-btn" data-bmmode="estadio">Heatmap · Estadío</button>
            <button class="sv-bm-mode-btn" data-bmmode="swarm">Línea de tiempo</button>
            <button class="sv-bm-mode-btn" data-bmmode="gel">E.D.T.</button>
          </div>
          <div class="sv-modal-note" id="svBmNote"></div>
          <div id="svBmBody"></div>
        </div>
      </div>
    </div>`;
  }

  // Modal Microbiología — Placa de agar + Resumen del día (tanque + fecha) / Tabla / Heatmap.
  if (microRows.length) {
    h += `<div class="sv-modal" id="svMicroModal" data-micromodal>
      <div class="sv-modal-card lv-fs-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">🧫 Microbiología — ${esc(mod)}${corrida ? ' · C' + esc(corrida) : ''}</span>
          <button class="sv-modal-x" data-micro-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          <div class="sv-bm-modebar">
            <span class="sv-bm-mode-label">Vista:</span>
            <button class="sv-bm-mode-btn is-active" data-micmode="placa">🧫 Placa</button>
            <button class="sv-bm-mode-btn" data-micmode="tabla">📋 Tabla</button>
            <button class="sv-bm-mode-btn" data-micmode="heatmap">🗺️ Heatmap</button>
            <button class="sv-bm-mode-btn" data-micmode="tendencias">📈 Tendencias</button>
          </div>
          <div id="svMicroBody"></div>
          <div class="mic-tt" id="svMicroTT"></div>
        </div>
      </div>
    </div>`;
  }

  // Modal Calidad de Agua — Tabla / Matriz (parámetro×tanque) / Tendencias (por parámetro).
  if (calAguaRows.length) {
    h += `<div class="sv-modal" id="svCalAguaModal" data-cwmodal>
      <div class="sv-modal-card lv-fs-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">💧 Calidad de Agua — ${esc(mod)}${corrida ? ' · C' + esc(corrida) : ''}</span>
          <button class="sv-modal-x" data-cw-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          <div id="svCwPanel"></div>
          <div class="sv-bm-modebar">
            <span class="sv-bm-mode-label">Vista:</span>
            <button class="sv-bm-mode-btn is-active" data-cw-mode="tabla">📋 Tabla</button>
            <button class="sv-bm-mode-btn" data-cw-mode="fichas">🩺 Tanques</button>
            <button class="sv-bm-mode-btn" data-cw-mode="matriz">🗺️ Matriz</button>
            <button class="sv-bm-mode-btn" data-cw-mode="tendencias">📈 Tendencias</button>
          </div>
          <div id="svCwBody"></div>
        </div>
      </div>
    </div>`;
  }

  // #2 · Modal de la comparativa entre tanques (RO1)
  if (hasCmp) {
    h += `<div class="sv-modal" id="svModCmpModal" data-modcmpmodal>
      <div class="sv-modal-card lv-fs-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">📊 Comparativa entre tanques — ${esc(mod)}</span>
          <button class="sv-modal-x" data-modcmp-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          ${cmpRank ? `<div class="sv-modcmp-rank">
            <span class="sv-modcmp-chip is-best">🏆 Mejor (SV+ICL): <b>${esc(cmpRank.best.tq)}</b> <span class="muted">SV ${fmt1(cmpRank.best.sv, '%')} · ICL ${cmpRank.best.icl == null ? '—' : Math.round(cmpRank.best.icl)}</span></span>
            <span class="sv-modcmp-chip is-worst">⚠️ Peor (SV+ICL): <b>${esc(cmpRank.worst.tq)}</b> <span class="muted">SV ${fmt1(cmpRank.worst.sv, '%')} · ICL ${cmpRank.worst.icl == null ? '—' : Math.round(cmpRank.worst.icl)}</span></span>
          </div>` : ''}
          <div class="sv-modal-note">Supervivencia (%) en el eje izquierdo · ICL promedio en el derecho.</div>
          <div class="lv-fs-chart"><canvas id="svModCmp"></canvas></div>
        </div>
      </div>
    </div>`;
  }

  // #3 · Modal de Desinfección (cumplimiento por Tipo → Categoría → Elemento).
  if (desinf) {
    const estadoChip = (est) => {
      const e = String(est || '').toLowerCase().trim();
      if (e === 'sí' || e === 'si') return '<span class="sv-desinf-si">✅ Sí</span>';
      if (e === 'no') return '<span class="sv-desinf-no">❌ No</span>';
      return '<span class="muted">—</span>';
    };
    h += `<div class="sv-modal" id="svDesinfModal" data-desinfmodal>
      <div class="sv-modal-card">
        <div class="sv-modal-head">
          <span class="sv-modal-title">🧴 Desinfección — ${esc(mod)}</span>
          <button class="sv-modal-x" data-desinf-close aria-label="Cerrar">✕</button>
        </div>
        <div class="sv-modal-body">
          <div class="sv-desinf-summary">Cumplimiento: <b>${desinf.cumplimiento !== null ? desinf.cumplimiento + '%' : '—'}</b> · ✅ ${desinf.si} Sí · ❌ ${desinf.no} No${desinf.fecha ? ' · 📅 Inicio: ' + esc(fmtShort(desinf.fecha)) : ''}</div>
          ${desinf.tipos.map((t) => `
            <div class="sv-section-title" style="margin-top:14px">${esc(t.tipo)}</div>
            ${t.cats.map((c) => `
              <div class="sv-desinf-cat">${esc(c.cat)}</div>
              <table class="sv-table sv-desinf-table"><tbody>
                ${c.elems.map((el) => `<tr><td>${esc(el.elem)}</td><td>${estadoChip(el.estado)}</td><td class="muted">${esc(el.obs || '')}</td></tr>`).join('')}
              </tbody></table>`).join('')}`).join('')}
        </div>
      </div>
    </div>`;
  }

  // Modal de Mareas · referencia de SITIO (Anconcito · INOCAR), igual para todos los
  // módulos. Lee la hoja "Marea" del store; render en views/supervisor/mareas.js.
  h += `<div class="sv-modal" id="svMareasModal" data-mareasmodal>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🌊 Mareas · Anconcito <span class="muted">· INOCAR</span></span>
        <button class="sv-modal-x" data-mareas-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-bm-modebar">
          <span class="sv-bm-mode-label">Vista:</span>
          <button class="sv-bm-mode-btn is-active" data-mareamode="dia">📅 Día</button>
          <button class="sv-bm-mode-btn" data-mareamode="mes">📈 Mes</button>
          <button class="sv-bm-mode-btn" data-mareamode="corr">🔗 Correlación</button>
        </div>
        <div id="svMareaBody"></div>
      </div>
    </div>
  </div>`;

  // #5 · Modal de gráfico por métrica (SV/Población = tendencia · OD/Temp = perfil 12 tomas)
  h += `<div class="sv-modal" id="svModMetricModal" data-modmetricmodal>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title" id="svModMetricTitle">Tendencia</span>
        <button class="sv-modal-x" data-modmetric-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-controls" id="svModMetricControls" style="display:none">
          <label class="sv-modal-datelbl">📅 Fecha <select id="svModMetricDate" class="sv-modal-select"></select></label>
        </div>
        <button class="sv-mmetric-proj" id="svModMetricProj" data-modmetric-proj aria-pressed="false" style="display:none">🔮 Ver proyección</button>
        <div class="lv-fs-chart"><canvas id="svModMetricCanvas"></canvas></div>
        <div class="sv-modal-note" id="svModMetricNote"></div>
      </div>
    </div>
  </div>`;

  // #5 · Modal "Resumen del día" (selector de fecha + KPIs del módulo de ese día + alertas)
  h += `<div class="sv-modal" id="svModDayModal" data-moddaymodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">📅 Resumen del día — ${esc(mod)}</span>
        <button class="sv-modal-x" data-modday-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-controls"><label class="sv-modal-datelbl">📅 Fecha <select id="svModDayDate" class="sv-modal-select"></select></label></div>
        <div class="sv-modal-kpis" id="svModDayKpis"></div>
        <div id="svModDayAlerts"></div>
      </div>
    </div>
  </div>`;

  // Trazabilidad · descarga en PDF las fichas del módulo (datos del Sheet).
  // Tipos = las 6 fichas estándar (fuente única: FICHA_IDS/fichaLabel de fichaPdf.js).
  const TRACE_FICHAS = FICHA_IDS.map((fid) => ({ fid, label: fichaLabel(fid) }));
  h += `<div class="sv-modal" id="svTraceModal" data-tracemodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🧾 Trazabilidad — ${esc(mod)}</span>
        <button class="sv-modal-x" data-trace-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <p class="sv-modal-note" style="margin:0 0 10px">Genera en PDF las fichas de este módulo con la información del Google Sheet. Elige los tipos y (opcional) un rango de fechas.</p>
        <div class="sv-trace-sec">
          <div class="sv-trace-h">Fichas a incluir</div>
          <label class="sv-trace-chk sv-trace-all"><input type="checkbox" data-trace-all checked> <b>Todas</b></label>
          <div class="sv-trace-types">
            ${TRACE_FICHAS.map((f) => `<label class="sv-trace-chk"><input type="checkbox" data-trace-fid="${f.fid}" checked> ${esc(f.label)}</label>`).join('')}
          </div>
        </div>
        <div class="sv-trace-sec sv-trace-dates">
          <label class="sv-modal-datelbl">📅 Desde <input type="date" class="sv-modal-select" data-trace-from></label>
          <label class="sv-modal-datelbl">📅 Hasta <input type="date" class="sv-modal-select" data-trace-to></label>
          <span class="muted sv-trace-hint">Prellenado con el primer y último registro del módulo. Bórralo para no limitar el rango.</span>
        </div>
        <div class="sv-trace-actions">
          <button class="sv-action-btn" data-trace-download>📄 Descargar PDF</button>
        </div>
      </div>
    </div>
  </div>`;

  // Modal "Siembras y Cosecha" — se abre desde el KPI Estadío (data-siembras-open).
  h += svSiembrasModalHTML(siembrasData, mod, corrida, s.tecnicos, corrMods);

  const after = (root) => {
    // KPI Técnico: despliega la lista completa de responsables dentro de la propia
    // tarjeta. Es su única función; el cuadro de Siembras vive ahora en el KPI Estadío.
    const tecKpi = root.querySelector('[data-tec-toggle]');
    if (tecKpi) {
      const toggleTec = () => {
        const open = tecKpi.getAttribute('aria-expanded') === 'true';
        tecKpi.setAttribute('aria-expanded', String(!open));
        tecKpi.querySelector('.sv-tec-list').hidden = open;
      };
      tecKpi.addEventListener('click', toggleTec);
      tecKpi.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggleTec(); }
      });
    }

    // Modal Siembras y Cosecha (KPI Estadío). Chip con role="button" → keyboard:true.
    const sieOverlay = root.querySelector('#svSiembrasModal');
    if (sieOverlay) {
      const sieHost = sieOverlay.querySelector('#svSieContent');
      // Estado del cuadro: merma elegida (6–15 %) y si se muestra el total de la corrida.
      // Vive fuera del HTML porque la CABECERA no se repinta —para que el <select> no
      // pierda el foco— y por tanto no puede almacenarlo.
      const siePctBase = Math.round(siembrasData.merma * 100);
      let siePct = siePctBase;
      let sieCorr = false;
      // Filas por módulo de la corrida. `ctx.larvCM` ya viene filtrado por corrida, así que
      // para el módulo actual esto devuelve exactamente `siembrasRows`: el total agregado
      // contiene la MISMA cifra que la fila «Total módulo» de arriba. Se vuelve a filtrar
      // por corrida de forma explícita para que la garantía no dependa de esa precondición.
      const corrByModule = () => corrMods.map((m) => ({
        mod: m,
        rows: ctx.larvCM.filter((r) => getField(r, F.modulo) === m && getField(r, F.corrida) === corrida),
      }));
      // Repinta SOLO el contenido con el estado actual. La merma por defecto reutiliza
      // `siembrasData`, ya calculado para el encabezado del modal.
      const renderSie = () => {
        if (!sieHost) return;
        const merma = siePct / 100;
        const d = siePct === siePctBase ? siembrasData : computeSiembras(siembrasRows, { merma });
        const corr = sieCorr ? computeCorridaSiembras(corrByModule(), { merma }) : null;
        sieHost.innerHTML = svSiembrasContentHTML(d, mod, corrida, corr);
      };
      // Contenido DIFERIDO al abrir (mismo patrón que el Historial de As. Téc.): era la
      // única tabla de modal que se construía entera en cada render del módulo, se abriera
      // o no. Los demás cuerpos ya se generaban al abrir o al cambiar de pestaña.
      let sieRendered = false;
      bindModal(root, sieOverlay, {
        openSel: '[data-siembras-open]', closeSel: '[data-siembras-close]', keyboard: true,
        onOpen: () => { if (!sieRendered) { sieRendered = true; renderSie(); } },
      });
      // Selector de merma (6–15%): recalcula con `computeSiembras` —la misma función pura—
      // y repinta SOLO el contenido, dejando intacta la cabecera para que el <select>
      // conserve el foco. La fila de corrida, si está visible, se recalcula con la MISMA
      // merma, de modo que su «A cosechar» sigue siendo la suma de los módulos.
      sieOverlay.querySelector('[data-sie-merma]')?.addEventListener('change', (e) => {
        const pct = +e.target.value;
        if (!isFinite(pct)) return;
        siePct = pct;
        renderSie();
      });
      // «Total de la corrida»: alterna la fila agregada de los módulos que comparten la
      // corrida. El cálculo es DIFERIDO —solo al pulsarlo— porque exige derivar las fichas
      // de tanque de los demás módulos, que la vista del módulo no necesita para nada más.
      const corrBtn = sieOverlay.querySelector('[data-sie-corrida]');
      corrBtn?.addEventListener('click', () => {
        sieCorr = !sieCorr;
        // El realce del botón cuelga de [aria-pressed] en el CSS: un solo mecanismo para
        // el estado visual y el que anuncia el lector de pantalla, que no pueden divergir.
        corrBtn.setAttribute('aria-pressed', String(sieCorr));
        corrBtn.textContent = sieCorr ? '🔗 Ocultar total de la corrida' : '🔗 Total de la corrida';
        renderSie();
      });
    }

    // #2 · RO1 en modal: barras agrupadas SV (eje y) + ICL (eje y1) por tanque (se dibuja al abrir).
    const cmpOverlay = root.querySelector('#svModCmpModal');
    if (cmpOverlay) {
      const drawCmp = () => makeChart('svModCmp', {
        type: 'bar',
        data: {
          labels: tankCmp.map((t) => t.tq),
          datasets: [
            { label: 'Supervivencia (%)', data: tankCmp.map((t) => t.sv), backgroundColor: '#2E7D32cc', borderColor: '#2E7D32', borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
            { label: 'ICL (prom.)', data: tankCmp.map((t) => (t.icl == null ? null : Math.round(t.icl))), backgroundColor: '#00695Ccc', borderColor: '#00695C', borderWidth: 1, borderRadius: 4, yAxisID: 'y1' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { position: 'left', beginAtZero: true, suggestedMax: 100, title: { display: true, text: 'SV %' }, ticks: { callback: (v) => v + '%' } },
            y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'ICL' }, grid: { drawOnChartArea: false } },
            x: { grid: { display: false } },
          },
          plugins: { legend: { labels: { boxWidth: 12 } } },
        },
      });
      bindModal(root, cmpOverlay, {
        openSel: '[data-modcmp-open]', closeSel: '[data-modcmp-close]',
        onOpen: () => requestAnimationFrame(drawCmp),
        // Se destruye al cerrar (se redibuja en cada apertura): sin esto la instancia
        // sobrevivía en el registro de Chart.js hasta el siguiente destroyAllCharts del
        // router. Mismo criterio que Microbiología y Calidad de Agua.
        onClose: () => destroyChart('svModCmp'),
      });
    }

    // Modal Historial As. Téc. (+ barra de filtros que re-renderiza la lista en vivo)
    const atOverlay = root.querySelector('#svAtModal');
    if (atOverlay) {
      // Lista DIFERIDA: se construye al abrir (no en cada render del módulo).
      let atRendered = false;
      bindModal(root, atOverlay, {
        openSel: '[data-athist-open]', closeSel: '[data-athist-close]',
        onOpen: () => { if (!atRendered) { atRendered = true; renderAtList(); } },
      });

      const atList = atOverlay.querySelector('#svAtList');
      const supSel = atOverlay.querySelector('[data-athist-sup]');
      const comSel = atOverlay.querySelector('[data-athist-com]');
      const sieSel = atOverlay.querySelector('[data-athist-sie]');
      const renderAtList = () => {
        const com = comSel ? comSel.value : '__all';
        const rows = filterAtRows(supSel ? supSel.value : '__all', com, sieSel ? sieSel.value : '__all');
        atList.innerHTML = rows.length
          ? `<div class="sv-hist-count">${rows.length} día(s) con comentario</div>` + rows.map((r) => atItemHTML(r, com)).join('')
          : `<div class="empty-state">${atRows.length ? 'Sin comentarios para los filtros seleccionados.' : 'Sin comentarios de supervisión registrados para este módulo.'}</div>`;
      };
      [supSel, comSel, sieSel].forEach((sel) => sel && sel.addEventListener('change', renderAtList));
    }

    // #3 · Modal de Desinfección
    bindModal(root, root.querySelector('#svDesinfModal'), {
      openSel: '[data-desinf-open]', closeSel: '[data-desinf-close]',
    });

    // Modal de Mareas (Día: ola+KPIs+luna+tipo+tabla · Mes: tendencia+donut). Datos: hoja "Marea".
    const mareaOverlay = root.querySelector('#svMareasModal');
    if (mareaOverlay) {
      const mareaBody = mareaOverlay.querySelector('#svMareaBody');
      // Modal de SITIO (Anconcito): la Correlación usa siempre todos los módulos.
      const mareaState = { mode: 'dia', key: null, month: null, corrKind: 'micro', corrPeriod: 'month', corrCell: null };
      const renderMareaBody = () => renderMareas(mareaBody, mareaState);
      // Barra de modo (Día/Mes) estática en el markup del modal (como Biomol/Micro).
      mareaOverlay.querySelectorAll('[data-mareamode]').forEach((b) => b.addEventListener('click', () => {
        mareaState.mode = b.dataset.mareamode;
        mareaOverlay.querySelectorAll('[data-mareamode]').forEach((x) => x.classList.toggle('is-active', x === b));
        renderMareaBody();
      }));
      // Navegación interna (meses / día) + ampliación de la ola, delegadas en el cuerpo.
      mareaBody.addEventListener('click', (e) => {
        if (e.target.closest('[data-marea-wave-fs]')) { mareaBody.querySelector('#mareaWaveFs')?.classList.add('is-open'); return; }
        if (e.target.closest('[data-marea-wave-fsclose]') || e.target.matches('[data-marea-wave-fsbg]')) { mareaBody.querySelector('#mareaWaveFs')?.classList.remove('is-open'); return; }
        // Ampliación (fullscreen) de los gráficos del Mes (tendencia / donut).
        const chFs = e.target.closest('[data-marea-chart-fs]');
        if (chFs) { openChartFs(mareaBody, chFs.dataset.mareaChartFs); return; }
        if (e.target.closest('[data-marea-chart-fsclose]') || e.target.matches('[data-marea-chart-fsbg]')) { closeChartFs(mareaBody); return; }
        const dn = e.target.closest('[data-marea-day]');
        if (dn && !dn.disabled && dn.dataset.mareaDay) { mareaState.key = dn.dataset.mareaDay; renderMareaBody(); return; }
        const mo = e.target.closest('[data-marea-month]');
        if (mo) { mareaState.month = mo.dataset.mareaMonth; mareaState.key = null; renderMareaBody(); return; }
        // Correlación: fuente (Micro/Calidad) + selección de celda → scatter.
        const ck = e.target.closest('[data-corr-kind]');
        if (ck) { mareaState.corrKind = ck.dataset.corrKind; mareaState.corrCell = null; renderMareaBody(); return; }
        // Periodo del cribado: este mes ⇄ todo el periodo (la celda elegida deja de ser válida).
        const cp = e.target.closest('[data-corr-period]');
        if (cp) { mareaState.corrPeriod = cp.dataset.corrPeriod; mareaState.corrCell = null; renderMareaBody(); return; }
        const cc = e.target.closest('[data-corr-cell]');
        if (cc) { mareaState.corrCell = cc.dataset.corrCell; renderMareaBody(); return; }
      });
      mareaBody.addEventListener('change', (e) => {
        const ds = e.target.closest('[data-marea-daysel]');
        if (ds) { mareaState.key = ds.value; renderMareaBody(); }
      });
      // Las celdas de la matriz de correlación son role="button" tabindex="0": sin esto
      // se anuncian como pulsables pero no responden a Enter/Espacio (solo al ratón).
      mareaBody.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const cc = e.target.closest('[data-corr-cell]');
        if (!cc) return;
        e.preventDefault();
        mareaState.corrCell = cc.dataset.corrCell;
        renderMareaBody();
      });
      bindModal(root, mareaOverlay, {
        openSel: '[data-mareas-open]', closeSel: '[data-mareas-close]',
        onOpen: () => {
          mareaState.mode = 'dia'; mareaState.key = null; mareaState.month = null;
          mareaState.corrKind = 'micro'; mareaState.corrPeriod = 'month'; mareaState.corrCell = null;
          mareaOverlay.querySelectorAll('[data-mareamode]').forEach((x) => x.classList.toggle('is-active', x.dataset.mareamode === 'dia'));
          renderMareaBody();
        },
        onClose: () => cleanupMareas(),
      });
    }

    // #5 · Modal de gráfico por métrica (SV/Pob = tendencia · OD/Temp = perfil 12 tomas)
    const mmOverlay = root.querySelector('#svModMetricModal');
    if (mmOverlay) {
      const titleEl = mmOverlay.querySelector('#svModMetricTitle');
      const noteEl = mmOverlay.querySelector('#svModMetricNote');
      const controls = mmOverlay.querySelector('#svModMetricControls');
      const dateSel = mmOverlay.querySelector('#svModMetricDate');
      const series = moduleSvPopSeries(ctx, mod, corrida);
      const hDates = moduleHourlyDates(ctx, mod, corrida);
      dateSel.innerHTML = hDates.length ? hDates.map((f, i) => `<option value="${esc(f)}"${i === hDates.length - 1 ? ' selected' : ''}>${esc(f)}</option>`).join('') : '<option>—</option>';
      const projBtn = mmOverlay.querySelector('#svModMetricProj');
      let curMetric = 'sv';
      let showProj = false;
      // Horizonte de proyección: hasta la cosecha estimada (PL11); fallback 7 días.
      // Se reutiliza `cos`, ya calculado arriba para el KPI "Cosecha": era la MISMA
      // llamada —`cosechaEstimate(ctx, mod, corrida)` usa target='PL11' por defecto
      // (moduleTrends.js:125), igual que el explícito de arriba— y se recomputaba entera.
      const projHorizon = (cos && !cos.reached && cos.days > 0) ? cos.days : 7;
      const cosechaReached = !!(cos && cos.reached);
      const TITLES = { sv: '📈 Tendencia de supervivencia', pop: '👥 Tendencia de población', plg: '🔬 Tendencia de PL/g (Larvia)', od: '💧 OD por hora (módulo)', tmp: '🌡️ Temperatura por hora (módulo)' };
      // `opts.labels` permite una serie con SUS PROPIAS fechas (el PL/g solo tiene puntos
      // los días con biometría, no en todas las fechas de `series`). `opts.zero:false`
      // deja que el eje arranque donde convenga: forzar el 0 en un rango de 50-70 PL/g
      // aplanaría la tendencia contra el techo del gráfico.
      const trendCfg = (label, data, color, pct, opts = {}) => ({
        type: 'line',
        data: { labels: opts.labels || series.labels, datasets: [{ label, data, borderColor: color, backgroundColor: color + '22', tension: .3, fill: true, pointRadius: 3, spanGaps: true, borderWidth: 2.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } }, y: pct ? { min: 0, suggestedMax: 100, ticks: { callback: (v) => v + '%' } } : { beginAtZero: opts.zero !== false } } },
      });
      // Tendencia histórica + tramo punteado de proyección exponencial (2.º dataset que
      // arranca en el último dato real —connectIndex/Value— y continúa con los futuros).
      const projCfg = (label, data, color, pct, proj) => ({
        type: 'line',
        data: {
          labels: [...series.labels, ...proj.futureLabels],
          datasets: [
            { label, data: [...data, ...proj.futureLabels.map(() => null)], borderColor: color, backgroundColor: color + '22', tension: .3, fill: true, pointRadius: 3, spanGaps: true, borderWidth: 2.4 },
            { label: 'Proyección', data: series.labels.map((_, i) => (i === proj.connectIndex ? proj.connectValue : null)).concat(proj.projected), borderColor: color, borderDash: [6, 4], backgroundColor: 'transparent', tension: .3, fill: false, pointRadius: 2, spanGaps: true, borderWidth: 2 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } }, y: pct ? { min: 0, suggestedMax: 100, ticks: { callback: (v) => v + '%' } } : { beginAtZero: true } } },
      });
      const hourlyCfg = (label, data, color) => ({
        type: 'line',
        data: { labels: HR_LABELS, datasets: [{ label, data, borderColor: color, backgroundColor: color + '1a', tension: .3, fill: true, pointRadius: 3, spanGaps: true, borderWidth: 2.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false } } },
      });
      // Tendencia (SV/Población) con proyección opcional bajo demanda.
      const drawTrend = (pct) => {
        controls.style.display = 'none';
        projBtn.style.display = '';
        const vals = pct ? series.sv : series.pop;
        const color = pct ? '#2E7D32' : '#1565C0';
        const label = pct ? 'Supervivencia (%)' : 'Población total';
        const baseNote = pct
          ? 'Supervivencia del módulo por fecha (Σ última pob. / Σ pob. inicial × 100).'
          : 'Población total del módulo (Σ de todos los tanques) por fecha.';
        const proj = showProj ? projectMetric(series.labels, vals, projHorizon, pct ? { min: 0, max: 100 } : { min: 0 }) : null;
        if (proj) {
          makeChart('svModMetricCanvas', projCfg(label, vals, color, pct, proj));
          const endTxt = pct ? fmt1(proj.endValue, '%') : fmtPop(proj.endValue);
          const horizonLbl = proj.futureLabels[proj.futureLabels.length - 1];
          const weak = proj.r2 < 0.5 ? ' — ⚠ ajuste débil, tómalo con cautela' : '';
          // La tasa se fuerza ≤ 0 (nunca crece); si la tendencia observada no decrece, sale plana.
          const flat = proj.dailyRate >= 0 ? ' Tendencia observada no decreciente → se proyecta estable, sin crecimiento.' : '';
          noteEl.innerHTML = `${esc(baseNote)}<br><b>🔮 Proyección exponencial</b> a ${esc(horizonLbl)}${cosechaReached ? '' : ' (≈ cosecha PL11)'}: <b>${esc(endTxt)}</b>. Ajuste R²=${proj.r2.toFixed(2)}${weak}.${flat}`;
        } else {
          makeChart('svModMetricCanvas', trendCfg(label, vals, color, pct));
          noteEl.textContent = showProj ? `${baseNote} (Datos insuficientes para proyectar.)` : baseNote;
        }
      };
      // Tendencia de PL/g (LARVIA). Sin proyección —a diferencia de SV/Población— y sin
      // selector de fecha: es una biometría puntual, con un punto por día muestreado.
      // La serie se calcula la PRIMERA vez que se abre este KPI y se reutiliza después.
      let plgSeries = null;
      const drawPlg = () => {
        controls.style.display = 'none';
        projBtn.style.display = 'none';
        if (!plgSeries) plgSeries = modulePlgSeries(ctx, mod, corrida);
        if (!plgSeries.labels.length) {
          destroyChart('svModMetricCanvas');
          noteEl.textContent = 'Sin registros de PL/g (Larvia) en el módulo para el periodo seleccionado.';
          return;
        }
        makeChart('svModMetricCanvas', trendCfg('PL/g (Larvia)', plgSeries.plg, '#00695C', false, { labels: plgSeries.labels, zero: false }));
        noteEl.innerHTML = `PL/g biométrico (LARVIA) del módulo: cada punto es el promedio <b>entre tanques</b> de las lecturas de ese día. Solo aparecen las <b>${plgSeries.labels.length}</b> fecha${plgSeries.labels.length !== 1 ? 's' : ''} con biometría — el PL/g se mide, no se arrastra. El KPI del banner promedia la <b>última</b> lectura de cada tanque, que pueden ser de días distintos.`;
      };
      const draw = () => {
        if (curMetric === 'sv') drawTrend(true);
        else if (curMetric === 'pop') drawTrend(false);
        else if (curMetric === 'plg') drawPlg();
        else { projBtn.style.display = 'none'; controls.style.display = ''; noteEl.textContent = 'Promedio del módulo en las 12 tomas cada 2 h del día seleccionado.'; const g = curMetric === 'od' ? gOD : gTmp; const c = curMetric === 'od' ? '#1E88E5' : '#F4511E'; makeChart('svModMetricCanvas', hourlyCfg(curMetric === 'od' ? 'OD (mg/L)' : 'T° (°C)', moduleHourly(ctx, mod, corrida, g, dateSel.value), c)); }
      };
      dateSel.addEventListener('change', () => { if (curMetric === 'od' || curMetric === 'tmp') draw(); });
      projBtn.addEventListener('click', () => {
        showProj = !showProj;
        projBtn.textContent = showProj ? '🔮 Ocultar proyección' : '🔮 Ver proyección';
        projBtn.setAttribute('aria-pressed', String(showProj));
        draw();
      });
      const open = (metric) => {
        curMetric = metric; showProj = false;
        projBtn.textContent = '🔮 Ver proyección'; projBtn.setAttribute('aria-pressed', 'false');
        titleEl.textContent = TITLES[metric] || 'Gráfico';
        requestAnimationFrame(draw);
      };
      bindModal(root, mmOverlay, {
        openSel: '[data-modmetric]', closeSel: '[data-modmetric-close]', keyboard: true,
        onOpen: (chip) => open(chip.dataset.modmetric),
        // `open()` redibuja siempre al abrir, así que destruir aquí no deja el canvas vacío.
        onClose: () => destroyChart('svModMetricCanvas'),
      });
    }

    // #5 · Modal "Resumen del día"
    const dayOverlay = root.querySelector('#svModDayModal');
    if (dayOverlay) {
      const dateSel = dayOverlay.querySelector('#svModDayDate');
      const kpisEl = dayOverlay.querySelector('#svModDayKpis');
      const alertsEl = dayOverlay.querySelector('#svModDayAlerts');
      const daySeries = moduleSvPopSeries(ctx, mod, corrida); // se calcula UNA vez y se reutiliza
      const dDates = daySeries.labels;
      dateSel.innerHTML = dDates.length ? dDates.map((f, i) => `<option value="${esc(f)}"${i === dDates.length - 1 ? ' selected' : ''}>${esc(f)}</option>`).join('') : '<option>—</option>';
      const kpiDay = (icon, label, val, delta = '') => `<div class="sv-modal-kpi">${icon} <span class="muted">${label}</span> <b>${esc(val)}</b>${delta}</div>`;
      const isAl = (lvl) => lvl === 'malo' || lvl === 'grave';
      // Días a cosecha: proyección de MÓDULO (ritmo de avance de estadío sobre todo el
      // histórico). No depende de la fecha elegida → se calcula una sola vez.
      const cosecha = cosechaEstimate(ctx, mod, corrida);
      const cosechaTxt = !cosecha ? '—' : cosecha.reached ? '✅ alcanzada' : `~${cosecha.days} d`;
      const fmtCompact = (v) => v >= 1e6 ? +(v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v));
      // Δ vs el día previo del selector. `signed` colorea por signo (SV/Población, donde
      // subir es bueno); si no, neutro (OD/T°: una subida no es "buena" por sí misma).
      const deltaSpan = (cur, prev, fmtMag, signed) => {
        if (cur == null || prev == null || isNaN(cur) || isNaN(prev)) return '';
        const d = cur - prev;
        const cls = signed ? (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') : 'neutral';
        const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '▬';
        const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
        return ` <span class="sv-mday-delta is-${cls}" title="vs. día anterior">${arrow} ${sign}${esc(fmtMag(Math.abs(d)))}</span>`;
      };
      // Conteo de análisis registrados ese día (por día-calendario) para este módulo.
      const eventosOfDay = (dateStr) => {
        const dt = parseAnyDate(dateStr);
        if (!dt || isNaN(dt)) return null;
        const key = micDayKey(dt);
        const sameDay = (d) => d && !isNaN(d) && micDayKey(d) === key;
        return {
          micro: microRows.filter((r) => sameDay(microCtx(r).fecha)).length,
          cagua: calAguaRows.filter((r) => sameDay(calCtx(r).fecha)).length,
          biomol: biomolRows.filter((r) => sameDay(parseAnyDate(r.fecha))).length,
          desinf: store.globalData.filter((r) => /desinfecci/i.test(String(r._SheetOrigin || ''))
            && sameModule(getField(r, F.modulo), mod) && (!corrida || getField(r, F.corrida) === corrida)
            && sameDay(parseAnyDate(getField(r, F.fecha)))).length,
        };
      };
      const render = () => {
        const k = moduleDayKpis(ctx, mod, corrida, dateSel.value, daySeries);
        const curIdx = daySeries.labels.indexOf(dateSel.value);
        const kPrev = curIdx > 0 ? moduleDayKpis(ctx, mod, corrida, daySeries.labels[curIdx - 1], daySeries) : null;
        const bajas = (daySeries.base && k.pop != null) ? Math.max(0, daySeries.base - k.pop) : null;
        kpisEl.innerHTML = [
          kpiDay('📈', 'Supervivencia', fmt1(k.sv, '%'), deltaSpan(k.sv, kPrev && kPrev.sv, (v) => v.toFixed(1) + ' p.p.', true)),
          kpiDay('📉', 'Mortalidad', fmt1(k.mort, '%')),
          kpiDay('👥', 'Población', fmtPop(k.pop), deltaSpan(k.pop, kPrev && kPrev.pop, (v) => fmtCompact(v) + ' ind.', true)),
          kpiDay('💧', 'OD', fmt2(k.od, ' mg/L'), deltaSpan(k.od, kPrev && kPrev.od, (v) => v.toFixed(2), false)),
          kpiDay('🌡️', 'Temperatura', fmt1(k.tmp, '°C'), deltaSpan(k.tmp, kPrev && kPrev.tmp, (v) => v.toFixed(1) + '°', false)),
          kpiDay('🦐', 'Estadío', k.estadio || '—'),
          kpiDay('🎯', 'Días a cosecha', cosechaTxt),
          kpiDay('💀', 'Bajas acum.', bajas == null ? '—' : Math.round(bajas).toLocaleString('es-EC')),
        ].join('');
        // Eventos del día: chips con el nº de análisis de cada fuente ese día.
        const ev = eventosOfDay(dateSel.value);
        const evBlock = ev
          ? `<div class="sv-mday-events"><span class="sv-mday-events-h">📋 Eventos del día</span>${[
            ['🔬 Microbiología', ev.micro], ['💧 Calidad de agua', ev.cagua],
            ['🧪 Biomol', ev.biomol], ['🧼 Desinfección', ev.desinf],
          ].map(([lbl, n]) => `<span class="sv-mday-ev${n ? '' : ' is-zero'}">${esc(lbl)} <b>${n}</b></span>`).join('')}</div>`
          : '';
        // Alertas a nivel de MÓDULO (agregado del día).
        const al = [];
        if (svLevel(k.sv) === 'grave') al.push('Supervivencia crítica');
        if (isAl(odLevel(k.od))) al.push('OD fuera de rango');
        if (isAl(tmpLevel(k.tmp))) al.push('Temperatura fuera de rango');
        const modBlock = al.length
          ? `<div class="sv-card-alert" style="margin-top:10px">⚠️ Módulo: ${esc(al.join(' · '))}</div>`
          : '<div class="sv-alert-ok" style="margin-top:10px">✅ Sin alertas de módulo este día.</div>';
        // Desglose INDIVIDUAL por tanque: OD/T° promedio del día fuera de rango.
        const tankRows = moduleDayTankReadings(ctx, mod, corrida, dateSel.value);
        const tankAlerts = tankRows.map((t) => {
          const flags = [];
          if (isAl(odLevel(t.od))) flags.push(`OD ${fmt2(t.od, ' mg/L')}`);
          if (isAl(tmpLevel(t.tmp))) flags.push(`T° ${fmt1(t.tmp, '°C')}`);
          return flags.length ? { tq: t.tq, flags } : null;
        }).filter(Boolean);
        const tankBlock = tankAlerts.length
          ? `<div class="sv-mday-talerts">
              <div class="sv-mday-talerts-h">Alertas por tanque · ${tankAlerts.length} de ${tankRows.length}</div>
              ${tankAlerts.map((t) => `<div class="sv-mday-talert"><span class="sv-mday-tq">${esc(t.tq)}</span><span class="sv-mday-tflags">${t.flags.map((f) => esc(f)).join(' · ')}</span></div>`).join('')}
            </div>`
          : (tankRows.length ? '<div class="sv-alert-ok" style="margin-top:6px">✅ Ningún tanque fuera de rango (OD/T°) este día.</div>' : '');
        alertsEl.innerHTML = evBlock + modBlock + tankBlock;
      };
      dateSel.addEventListener('change', render);
      bindModal(root, dayOverlay, {
        openSel: '[data-modday-open]', closeSel: '[data-modday-close]',
        onOpen: () => render(),
      });
    }

    // Modal Trazabilidad: descarga las fichas del módulo en PDF (datos del Sheet).
    const traceOverlay = root.querySelector('#svTraceModal');
    if (traceOverlay) {
      bindModal(root, traceOverlay, {
        openSel: '[data-modtrace]', closeSel: '[data-trace-close]', keyboard: true,
      });
      // Prellena Desde/Hasta con el rango de fechas del módulo (primer↔último registro).
      const fromEl = traceOverlay.querySelector('[data-trace-from]');
      const toEl = traceOverlay.querySelector('[data-trace-to]');
      const range = moduleDateRange(mod, corrida);
      if (fromEl && range.from) fromEl.value = range.from;
      if (toEl && range.to) toEl.value = range.to;
      const allCb = traceOverlay.querySelector('[data-trace-all]');
      const typeCbs = [...traceOverlay.querySelectorAll('[data-trace-fid]')];
      if (allCb) allCb.addEventListener('change', () => { typeCbs.forEach((c) => { c.checked = allCb.checked; }); });
      typeCbs.forEach((c) => c.addEventListener('change', () => {
        if (allCb) allCb.checked = typeCbs.every((x) => x.checked);
      }));
      traceOverlay.querySelector('[data-trace-download]')?.addEventListener('click', () => {
        const fids = typeCbs.filter((c) => c.checked).map((c) => c.dataset.traceFid);
        if (!fids.length) { toast('Selecciona al menos un tipo de ficha', 'warn'); return; }
        const from = traceOverlay.querySelector('[data-trace-from]')?.value || '';
        const to = traceOverlay.querySelector('[data-trace-to]')?.value || '';
        // Un aviso por documento: la secuencia abre un "Guardar como PDF" por tipo de
        // ficha y, sin esto, el usuario no sabe por cuál va (solo se avisa si hay ≥2).
        const onProgress = (n, total, fileName, done) => {
          if (total <= 1) return;
          // Al agotarse la cola se avisa del cierre: si no, el usuario ve pasar los
          // "Documento N de M" y nunca sabe si la secuencia terminó o se colgó.
          if (done) { toast('✅ Impresión de fichas completada', 'ok', 3500); return; }
          toast(`🖨️ Documento ${n} de ${total} · ${fileName}`, 'info', 4000);
        };
        const res = downloadTrazabilidad({ mod, corrida, fids, from, to, onProgress });
        if (res.generated.length) {
          const detail = res.generated.map((g) => `${g.label} (${g.pages} pág.)`).join(' · ');
          const multi = res.generated.length > 1 ? ' — se abrirá un diálogo de impresión por tipo' : '';
          toast(`📄 PDF: ${detail}${multi}`, 'ok', 5500);
        }
        if (res.empty.length) toast(`Sin datos en el rango: ${res.empty.join(', ')}`, 'warn', 5000);
        if (res.pending.length) toast(`Aún no disponible: ${res.pending.join(', ')}`, 'info', 5000);
      });
    }

    // Modal Biomol (heatmap diagnóstico × tanque|estadío)
    const bmOverlay = root.querySelector('#svBiomolModal');
    if (bmOverlay) {
      const bmHost = bmOverlay.querySelector('#svBmBody');
      const bmNote = bmOverlay.querySelector('#svBmNote');
      const heatNote = `% de muestras positivas por ${corrida ? 'corrida <b>' + esc(corrida) + '</b> · ' : ''}diagnóstico (verde = 0% · rojo = 100%). Excluye estadío Reproductores. Las muestras compartidas entre módulos pareados (p. ej. "Módulo 1-2") aparecen en ambos módulos.`;
      const swarmNote = `Línea de tiempo por tanque${corrida ? ' · corrida <b>' + esc(corrida) + '</b>' : ''}: cada punto = un análisis molecular ubicado en su fecha real (eje horizontal). 🔴 algún diagnóstico positivo · 🟢 todos negativos · ⚪ sin medición.`;
      const gelNote = `<b>Electroforesis Digital Temporal</b> · gel UV simulado: carriles = tanques, filas = diagnósticos. Banda <span style="color:#7CB500;font-weight:800">verde lima = positivo</span> · <span style="color:#8E5BD9;font-weight:800">lavanda = negativo</span> · línea tenue = sin medición. Filtra por fecha.`;
      let bmMode = 'tank';
      const buildBm = () => {
        if (bmMode === 'swarm') { bmNote.innerHTML = swarmNote; buildBiomolSwarm(bmHost, biomolRows); }
        else if (bmMode === 'gel') { bmNote.innerHTML = gelNote; buildBiomolGel(bmHost, biomolRows, tankLote); }
        else { bmNote.innerHTML = heatNote; buildBiomolHeat(bmHost, biomolRows, bmMode); }
      };
      // Heatmap DIFERIDO: se dibuja al ABRIR el modal (requestAnimationFrame en open()),
      // no en cada render del módulo (era costoso y ralentizaba la vista).
      bmOverlay.querySelectorAll('[data-bmmode]').forEach((b) => b.addEventListener('click', () => {
        bmMode = b.dataset.bmmode;
        bmOverlay.querySelectorAll('[data-bmmode]').forEach((x) => x.classList.toggle('is-active', x === b));
        buildBm();
      }));
      // Redibuja al abrir → el SVG de dispersión toma el ancho real del modal visible.
      // Y vuelve SIEMPRE a la pestaña por defecto, igual que hacen los modales de
      // Microbiología y Calidad de Agua: era el único de los tres que conservaba la
      // última vista, así que dejarlo en «E.D.T.» y reabrirlo abría en E.D.T. mientras
      // que sus hermanos volvían a Placa y a Tabla.
      bindModal(root, bmOverlay, {
        openSel: '[data-biomol-open]', closeSel: '[data-biomol-close]',
        onOpen: () => {
          bmMode = 'tank';
          bmOverlay.querySelectorAll('[data-bmmode]').forEach((x) => x.classList.toggle('is-active', x.dataset.bmmode === 'tank'));
          requestAnimationFrame(buildBm);
        },
        onClose: bmDestroyTip,
      });
    }

    // Modal Microbiología (Placa + Tabla + Heatmap; pestaña Placa con tanque + navegador de fecha)
    const micOverlay = root.querySelector('#svMicroModal');
    if (micOverlay) {
      const micBody = micOverlay.querySelector('#svMicroBody');
      let micMode = 'placa';
      const micState = { tank: null, dayIdx: null, trendTank: null, trendOpen: null };
      /** Dibuja el gráfico grande del patógeno abierto en la pestaña Tendencias. */
      const drawMicTrend = () => {
        if (!_svMicTrend) return;
        const open = _svMicTrend.series.find((s) => s.key === micState.trendOpen);
        if (!open) return;
        const dates = _svMicTrend.days.map((d) => d.d);
        const labels = _svMicTrend.days.map((d) => d.label); // completo → título del tooltip
        // Estadío(s) muestreados cada día (para el tooltip).
        const estadios = _svMicTrend.days.map((d) => [...new Set(d.rows.map((r) => microCtx(r).estadio).filter(Boolean))].sort(natCmp).join(', '));
        // null en los días sin muestra de ese patógeno (línea continua vía spanGaps).
        const data = open.vals.map((v, i) => (open.has[i] ? v : null));
        makeChart('svMicTrendChart', {
          type: 'line',
          data: { labels, datasets: [{ label: open.label, data, borderColor: open.color, backgroundColor: open.color + '22', tension: .3, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, borderWidth: 2, fill: true }] },
          options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: {
              y: { beginAtZero: true, ticks: { callback: (v) => micFmtNum(v) }, title: { display: true, text: 'Σ UFC', font: { size: 11, weight: '700' } } },
              // Eje X compacto: solo el número de día; el mes/año va UNA vez en el título
              // (ej. "enero 2026") en vez de repetir "1 ene 26, 2 ene 26, …".
              x: { grid: { display: false }, ticks: { callback: (v, i) => dayNum(dates[i]), autoSkip: true, maxTicksLimit: 14, maxRotation: 0, minRotation: 0 }, title: { display: !!rangeLabel(dates), text: rangeLabel(dates), font: { size: 10.5, weight: '700' } } },
            },
            plugins: { legend: { display: false }, tooltip: { callbacks: {
              label: (c) => ` ${c.parsed.y === null ? 'sin muestra' : micFmtNum(c.parsed.y) + ' UFC'}`,
              afterLabel: (c) => { const e = estadios[c.dataIndex]; return e ? 'Estadío: ' + e : ''; },
            } } },
          },
        });
      };
      const renderMic = () => {
        destroyChart('svMicTrendChart'); // evita instancias huérfanas al cambiar de vista/tanque/patógeno
        if (micMode === 'tabla') micBody.innerHTML = microTablaHTML(microRows);
        else if (micMode === 'heatmap') micBody.innerHTML = microHeatmapHTML(microRows);
        else if (micMode === 'tendencias') { micBody.innerHTML = microTendenciasHTML(microRows, micState); drawMicTrend(); }
        else micBody.innerHTML = microPlacaHTML(microRows, micState);
      };
      micOverlay.querySelectorAll('[data-micmode]').forEach((b) => b.addEventListener('click', () => {
        micMode = b.dataset.micmode;
        micOverlay.querySelectorAll('[data-micmode]').forEach((x) => x.classList.toggle('is-active', x === b));
        renderMic();
      }));
      // Filtros internos de las pestañas (delegados; el cuerpo se re-renderiza).
      micBody.addEventListener('change', (e) => {
        const s = e.target.closest('[data-micro-tank]');
        if (s) { micState.tank = s.value || null; micState.dayIdx = null; renderMic(); return; }
        const tt = e.target.closest('[data-mtrend-tank]');
        if (tt) { micState.trendTank = tt.value || null; renderMic(); }
      });
      micBody.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-micro-day]');
        if (nav && !nav.disabled) { micState.dayIdx = (micState.dayIdx == null ? 0 : micState.dayIdx) + Number(nav.dataset.microDay); renderMic(); return; }
        const sp = e.target.closest('[data-mtrend-open]');
        // Selección de patógeno: preserva el scroll horizontal de las píldoras para
        // no volver al inicio (el re-render reconstruye la barra desde cero).
        if (sp && sp.dataset.mtrendOpen !== micState.trendOpen) {
          const sl = micBody.querySelector('.sv-mtrend-pills')?.scrollLeft || 0;
          micState.trendOpen = sp.dataset.mtrendOpen;
          renderMic();
          const np = micBody.querySelector('.sv-mtrend-pills');
          if (np) np.scrollLeft = sl;
        }
      });
      // Tooltip de colonias de la placa (patógeno · UFC · muestras · nivel), como en Bacteriología.
      const micTT = micOverlay.querySelector('#svMicroTT');
      const ttShow = (g) => {
        const c = _svMicroColonies.find((x) => x.id === g.dataset.cid); if (!c || !micTT) return;
        const glow = g.querySelector('.mic-colony-glow'); if (glow) glow.setAttribute('opacity', '1');
        micTT.style.borderColor = c.color;
        micTT.innerHTML = `<div class="mic-tt-h" style="color:${c.color}">${esc(c.label)}</div>
          <div><span class="mic-tt-k">UFC (Σ):</span> <b>${micFmtNum(c.ufc)}</b></div>
          <div><span class="mic-tt-k">Muestras:</span> ${c.nMuestras}</div>
          ${c.worst ? `<div><span class="mic-tt-k">Nivel máx:</span> <b style="color:${MIC_NIVEL_COLOR[c.worst]}">${esc(c.worst)}</b></div>` : ''}`;
        micTT.style.display = 'block';
      };
      micBody.addEventListener('mouseover', (e) => { const g = e.target.closest('.mic-colony'); if (g) ttShow(g); });
      micBody.addEventListener('mousemove', (e) => { if (!micTT || micTT.style.display !== 'block') return; micTT.style.left = Math.min(e.clientX + 14, window.innerWidth - 210) + 'px'; micTT.style.top = Math.min(e.clientY - 8, window.innerHeight - 130) + 'px'; });
      micBody.addEventListener('mouseout', (e) => { const g = e.target.closest('.mic-colony'); if (g) { if (micTT) micTT.style.display = 'none'; const glow = g.querySelector('.mic-colony-glow'); if (glow) glow.setAttribute('opacity', '0'); } });
      // El tooltip vive FUERA de `micBody`, así que re-renderizar el cuerpo no lo borra:
      // si el modal se cierra con el cursor sobre una colonia (Escape o clic en el velo),
      // su `mouseout` puede no llegar a dispararse y quedaría en display:block con los
      // datos de esa colonia, listo para reaparecer en la siguiente apertura. Ocultarlo
      // en ambos extremos quita esa dependencia del navegador. Biomol ya hacía lo propio
      // con su tooltip vía bmDestroyTip.
      const micHideTT = () => { if (micTT) micTT.style.display = 'none'; };
      bindModal(root, micOverlay, {
        openSel: '[data-micro-open]', closeSel: '[data-micro-close]',
        onOpen: () => { micMode = 'placa'; micState.tank = null; micState.dayIdx = null; micState.trendTank = null; micState.trendOpen = null; micHideTT(); micOverlay.querySelectorAll('[data-micmode]').forEach((x) => x.classList.toggle('is-active', x.dataset.micmode === 'placa')); requestAnimationFrame(renderMic); },
        onClose: micHideTT,
      });
    }

    // Modal Calidad de Agua (Tabla / Matriz / Tendencias) — mismo patrón que Microbiología.
    const cwOverlay = root.querySelector('#svCalAguaModal');
    if (cwOverlay) {
      const cwBody = cwOverlay.querySelector('#svCwBody');
      const cwPanel = cwOverlay.querySelector('#svCwPanel');
      let cwMode = 'tabla';
      const cwState = { tank: null, param: null };
      const cwRanges = loadCalRanges();
      /** Dibuja el gráfico del parámetro activo (Tendencias) con la banda del rango objetivo. */
      const drawCwTrend = () => {
        if (!_svCwTrend || !_svCwTrend.days.length) return;
        const t = _svCwTrend;
        const dates = t.days.map((x) => x.d);
        const data = t.days.map((x) => x.avg);
        const bandPlugin = {
          id: 'cwBand',
          beforeDatasetsDraw(chart) {
            const r = t.range; if (!r) return;
            const yS = chart.scales.y; if (!yS) return;
            const { left, right, top, bottom } = chart.chartArea; const c = chart.ctx;
            const yTop = r.max != null ? yS.getPixelForValue(r.max) : top;
            const yBot = r.min != null ? yS.getPixelForValue(r.min) : bottom;
            c.save(); c.fillStyle = 'rgba(46,158,91,.14)';
            c.fillRect(left, Math.min(yTop, yBot), right - left, Math.abs(yBot - yTop)); c.restore();
          },
        };
        makeChart('svCwTrendChart', {
          type: 'line',
          data: { labels: t.days.map((x) => x.label), datasets: [{ label: t.label, data, borderColor: '#00838f', backgroundColor: '#00838f22', tension: .3, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, borderWidth: 2, fill: false }] },
          options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: {
              y: { ticks: { callback: (v) => cwFmt(v) }, title: { display: !!t.unit, text: t.unit, font: { size: 11, weight: '700' } } },
              x: { grid: { display: false }, ticks: { callback: (v, i) => dayNum(dates[i]), autoSkip: true, maxTicksLimit: 14, maxRotation: 0, minRotation: 0 }, title: { display: !!rangeLabel(dates), text: rangeLabel(dates), font: { size: 10.5, weight: '700' } } },
            },
            plugins: { legend: { display: false }, tooltip: { callbacks: {
              label: (c) => ` ${cwFmt(c.parsed.y)}${t.unit ? ' ' + t.unit : ''}`,
              afterLabel: (c) => { const e = t.days[c.dataIndex] && t.days[c.dataIndex].estadio; return e ? 'Estadío: ' + e : ''; },
            } } },
          },
          plugins: [bandPlugin],
        });
      };
      const renderCw = () => {
        destroyChart('svCwTrendChart');
        if (cwMode === 'matriz') cwBody.innerHTML = cwMatrizHTML(calAguaRows, cwRanges);
        else if (cwMode === 'tendencias') { cwBody.innerHTML = cwTendenciasHTML(calAguaRows, cwRanges, cwState); drawCwTrend(); }
        else if (cwMode === 'fichas') cwBody.innerHTML = cwFichasHTML(calAguaRows, cwRanges);
        else cwBody.innerHTML = cwTablaHTML(calAguaRows, cwRanges);
      };
      cwOverlay.querySelectorAll('[data-cw-mode]').forEach((b) => b.addEventListener('click', () => {
        cwMode = b.dataset.cwMode;
        cwOverlay.querySelectorAll('[data-cw-mode]').forEach((x) => x.classList.toggle('is-active', x === b));
        renderCw();
      }));
      cwBody.addEventListener('change', (e) => {
        const s = e.target.closest('[data-cw-tank]');
        if (s) { cwState.tank = s.value || null; renderCw(); }
      });
      cwBody.addEventListener('click', (e) => {
        const sp = e.target.closest('[data-cw-param]');
        if (sp && sp.dataset.cwParam !== cwState.param) {
          const sl = cwBody.querySelector('.sv-mtrend-pills')?.scrollLeft || 0;
          cwState.param = sp.dataset.cwParam; renderCw();
          const np = cwBody.querySelector('.sv-mtrend-pills'); if (np) np.scrollLeft = sl;
        }
      });
      bindModal(root, cwOverlay, {
        openSel: '[data-cw-open]', closeSel: '[data-cw-close]',
        onOpen: () => { cwMode = 'tabla'; cwState.tank = null; cwState.param = null; if (cwPanel) cwPanel.innerHTML = cwDiagPanelHTML(calAguaRows, cwRanges); cwOverlay.querySelectorAll('[data-cw-mode]').forEach((x) => x.classList.toggle('is-active', x.dataset.cwMode === 'tabla')); requestAnimationFrame(renderCw); },
      });
    }
  };

  return { html: h, after };
}
