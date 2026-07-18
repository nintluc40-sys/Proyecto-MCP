/* ============================================================
   REVISIONES · Registro de Supervisión
   Vista sobre la hoja `Registro_Supervisión`
   (_SheetOrigin === 'Registro_Supervision').

   Filtros: Corrida · Módulo · Siembra (la corrida y la siembra son lo
   que cambia; el módulo es un lugar fijo). Acotados por la barra de mes.
   Gráficos: Composición de hallazgos (dona) · Acciones recomendadas ·
   Distribución cualitativa por corrida (Intestino/Actividad/Condición,
   % por frecuencia) · Eficiencia de supervisores (bullet chart).
   Bitácora desplegable + ventana de Historial de comentarios.
   ============================================================ */
import { store } from '../../core/store.js';
import { destroyAllCharts, makeChart } from '../../core/charts.js';
import { getField, parseNum, F } from '../../core/fields.js';
import { parseAnyDate, fmtShort, dayNum, rangeLabel } from '../../core/dates.js';
import { esc } from '../../core/format.js';
import { avg, fmtPct } from '../../core/util.js';
import { monthIndexOfCorrida, monthLabelAt } from '../../core/prodCalendar.js';
import { registerModalEscape } from '../../ui/modalEscape.js';

// ---------- acceso tolerante a cabeceras de Registro_Supervisión ----------
const K = {
  supervisor: ['Supervisor', 'supervisor', 'SUPERVISOR'],
  siembra:    ['Siembra', 'siembra'],
  estadio:    ['Estadío_observado', 'Estadio_observado', 'estadío_observado', 'estadio_observado', 'Estadío observado', 'Estadío', 'Estadio'],
  tipo:       ['Tipo_revisión', 'Tipo_revision', 'tipo_revisión', 'tipo_revision', 'Tipo revisión', 'Tipo de revisión'],
  deformidad: ['Deformidad_%', 'Deformidad %', 'Deformidad_porc', 'Deformidad', 'deformidad_%', 'deformidad'],
  atraso:     ['% Atraso', 'Atraso_%', 'Atraso %', '%Atraso', 'Atraso', 'atraso'],
  // Numérica (% Protusión; antes "% Hernia", renombrada en la hoja 2026-06).
  // NO incluir 'Protusión' a secas: ahora es una col. cualitativa aparte.
  protusion:  ['% Protusión', '% Protusion', 'Protusión_%', 'Protusion_%', 'Protusión %', '%Protusión', '% Hernia', 'Hernia_%', 'Hernia %', '%Hernia'],
  intestino:  ['Intestino', 'intestino'],
  actividad:  ['Actividad', '% Actividad', 'actividad'],
  condicion:  ['Condición_biológica', 'Condicion_biologica', 'condición_biológica', 'condicion_biologica', 'Condición biológica', 'Condición'],
  // Columnas nuevas de la hoja (2026-06): cualitativas + % de llenado intestinal.
  // 'Protusión' (cualitativa) antes se llamaba 'Hernia' (se conserva como respaldo).
  protusionCual: ['Protusión', 'Protusion', 'protusión', 'protusion', 'Hernia', 'hernia'],
  opacidad:   ['Opacidad', 'opacidad'],
  asimilacion:['Asimilación', 'Asimilacion', 'asimilación', 'asimilacion'],
  semillenas: ['Semillenas (%)', 'Semillenas', '% Semillenas', 'semillenas (%)', 'semillenas'],
  vacias:     ['Vacías (%)', 'Vacias (%)', 'Vacías', 'Vacias', '% Vacías', 'vacías (%)', 'vacias (%)'],
  // Numérica (% No viables): columna nueva de la hoja (2026-06), tras Condición_biológica.
  noviables:  ['% No viables', '% No Viables', 'No viables (%)', 'No Viables (%)', '%No viables', 'No viables', 'No Viables', 'no viables'],
  observaciones: ['Observaciones', 'observaciones', 'Observación', 'observación'],
  accion:     ['Acción', 'Accion', 'acción', 'accion', 'Acción tomada'],
  // Comentario se dividió en matutino / vespertino (antes era una sola col. "Comentario").
  comentarioM: ['Comentario (matutino)', 'Comentario matutino', 'comentario (matutino)', 'comentario matutino'],
  comentarioV: ['Comentario (vespertino)', 'Comentario vespertino', 'comentario (vespertino)', 'comentario vespertino'],
  comentario:  ['Comentario', 'Comentarios', 'comentario', 'comentarios'], // legado (hoja antigua)
};

const g = (r, keys) => getField(r, keys);
// Comentarios matutino/vespertino (el legado "Comentario" cae como matutino).
const gComM = (r) => g(r, K.comentarioM) || g(r, K.comentario);
const gComV = (r) => g(r, K.comentarioV);
const hasComment = (r) => !!(gComM(r) || gComV(r));

// Bloques de comentario etiquetados (matutino ☀️ / vespertino 🌙) para listas de historial.
function commentBlocks(r) {
  const m = gComM(r), v = gComV(r);
  let h = '';
  if (m) h += `<div class="rv-com-sub"><span class="rv-com-tag rv-com-am">☀️ Matutino</span><p class="rv-com-txt">${esc(m)}</p></div>`;
  if (v) h += `<div class="rv-com-sub"><span class="rv-com-tag rv-com-pm">🌙 Vespertino</span><p class="rv-com-txt">${esc(v)}</p></div>`;
  return h || '<p class="rv-hist-text">—</p>';
}

// Celda compacta (bitácora): ambos turnos en línea con su etiqueta.
function commentCell(r) {
  const m = gComM(r), v = gComV(r);
  if (!m && !v) return '—';
  const line = (tag, cls, txt) => txt ? `<div class="rv-com-line"><span class="rv-com-tag ${cls}">${tag}</span>${esc(txt)}</div>` : '';
  return line('☀️ Mat', 'rv-com-am', m) + line('🌙 Vesp', 'rv-com-pm', v);
}
const gFec = (r) => getField(r, F.fecha);
const gMod = (r) => getField(r, F.modulo);
const gCor = (r) => getField(r, F.corrida);
const gSup = (r) => g(r, K.supervisor);
const gSiem = (r) => g(r, K.siembra);
const isRevisionRow = (r) => r && r._SheetOrigin === 'Registro_Supervision';

const modNum = (s) => { const m = String(s).match(/\d+/); return m ? +m[0] : 9999; };
const natCmp = (a, b) => modNum(a) - modNum(b) || String(a).localeCompare(String(b));
const numCmp = (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || String(a).localeCompare(String(b));
const dateOf = (r) => { const d = parseAnyDate(gFec(r)); return d ? fmtShort(d) : esc(gFec(r) || '—'); };

// Divide un campo multivalor ("Continuar, Vigilar") en eventos individuales.
const splitMulti = (v) => String(v || '').split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

// Pliega acentos/mayúsculas sin usar marcas combinantes literales en el código.
const fold = (s) => String(s).normalize('NFD').split('').filter((c) => { const x = c.charCodeAt(0); return x < 0x300 || x > 0x36f; }).join('').toLowerCase().trim();

// Paleta semáforo unificada (igual que Larvicultura) + severidad de 2 niveles.
// ── Paleta de Revisiones (índigo + coral · distinta del teal de Larvicultura) ──
const RV_ACCENT = '#3F51B5';                      // índigo (acento principal)
const SEM3 = ['#2E9E5B', '#E6A100', '#D64545'];   // bueno · medio · malo (semáforo propio)
const SEV2 = [SEM3[1], SEM3[2]];                  // leve · acentuada
const TIER_LABEL3 = ['Bueno', 'Medio', 'Malo'];
const TIER_LABEL2 = ['Leve', 'Acentuada'];
const CAT3 = ['#3F51B5', '#EC407A', '#26A69A', '#FB8C00'];   // categórica (series sin orden; 4ª = No viables)

/** Clasifica un valor cualitativo en 3 niveles (0 bueno · 1 medio · 2 malo; -1 desconocido). */
function tier3(val) {
  const k = fold(val);
  if (/(alta|alto|buen|optim|excel|normal|sano|activ)/.test(k)) return 0;
  if (/(medi|regular|moderad|alerta|atenc|parcial)/.test(k)) return 1;
  if (/(baj|mal|critic|grave|defic|pobre|nul|riesg)/.test(k)) return 2;
  return -1;
}
/** Severidad cualitativa en 2 niveles (0 leve · 1 acentuada; -1 desconocido). */
function tier2(val) {
  const k = fold(val);
  if (/(leve|ligera|incipiente|minim)/.test(k)) return 0;
  if (/(acentuad|sever|marcad|grave|fuerte|alta|pronunci)/.test(k)) return 1;
  return -1;
}

/** Eje de días (fechas presentes, orden cronológico) + etiqueta corta. */
function dailyAxis(rows) {
  return [...new Set(rows.map(gFec).filter(Boolean))].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
}
const dayLabel = (d) => { const dt = parseAnyDate(d); return dt ? fmtShort(dt) : String(d); };

/** Eje X estilo Larvicultura: solo el nº de día + el mes/año como subtítulo (no se repite). */
const dayXAxis = (days) => ({ ticks: { callback: (v, i) => dayNum(days[i]), maxRotation: 0, font: { size: 11, weight: '700' } }, grid: { display: false }, title: { display: !!rangeLabel(days), text: rangeLabel(days), color: '#78909c', font: { size: 11, weight: '700' } } });
/** Días (fecha cruda) con dato en alguna de las claves dadas. */
const daysWithData = (rows, keysList) => dailyAxis(rows).filter((d) => rows.some((r) => gFec(r) === d && keysList.some((keys) => parseNum(r, keys) !== null)));
/** Tooltip de barra apilada: conteo + % del total de la variable. */
const stackTip = (c) => { const tot = c.dataset._tot[c.dataIndex] || 1; return ` ${c.dataset.label}: ${c.parsed.x} (${Math.round(c.parsed.x / tot * 100)}%)`; };

/** Calidad: mosaico de tiles semáforo (nivel dominante por variable). HTML, sin canvas. */
const TILE_ICON = ['🟢', '🟡', '🔴'];
const CALIDAD_KEYS = { 'Asimilación': K.asimilacion, 'Actividad': K.actividad, 'Intestino': K.intestino, 'Condición biológica': K.condicion };
function calidadTilesHTML(rows, vars) {
  const tiles = vars.map(([label, keys]) => {
    const counts = [0, 0, 0];
    rows.forEach((r) => { const v = g(r, keys); if (!v) return; const t = tier3(v); if (t >= 0) counts[t]++; });
    const total = counts[0] + counts[1] + counts[2];
    if (!total) return `<div class="rv-tile rv-tile-empty"><div class="rv-tile-lbl">${esc(label)}</div><div class="muted" style="font-size:11px">sin datos</div></div>`;
    const pct = counts.map((c) => Math.round(c / total * 100));
    const dom = counts.indexOf(Math.max(...counts));
    const seg = counts.map((c, t) => (c ? `<span style="width:${(c / total * 100).toFixed(1)}%;background:${SEM3[t]}" title="${TIER_LABEL3[t]}: ${c} (${pct[t]}%)"></span>` : '')).join('');
    const legend = counts.map((c, t) => `<span class="rv-tile-leg"><i style="background:${SEM3[t]}"></i>${pct[t]}%</span>`).join('');
    return `<div class="rv-tile rv-tile-click" data-drillqual="${esc(label)}" role="button" tabindex="0" title="Clic = desglose por módulo" style="border-left-color:${SEM3[dom]}">
      <div class="rv-tile-lbl">${esc(label)} <span class="muted" style="font-weight:600">· ${total}</span></div>
      <div class="rv-tile-dom" style="color:${SEM3[dom]}">${TILE_ICON[dom]} ${TIER_LABEL3[dom]} · ${pct[dom]}%</div>
      <div class="rv-tile-bar">${seg}</div>
      <div class="rv-tile-legs">${legend}</div>
    </div>`;
  }).join('');
  return `<div class="rv-tiles">${tiles}</div>`;
}

/** Drill-down de Calidad: desglose por módulo de los niveles de una variable. */
function openDrillCalidad(label, keys, rows) {
  const byMod = new Map();
  rows.forEach((r) => { const v = g(r, keys); if (!v) return; const t = tier3(v); if (t < 0) return; const m = gMod(r) || '—'; if (!byMod.has(m)) byMod.set(m, [0, 0, 0]); byMod.get(m)[t]++; });
  const entries = [...byMod.entries()].map(([m, c]) => ({ m, c, total: c[0] + c[1] + c[2] })).sort((a, b) => b.total - a.total);
  const body = entries.length ? entries.map(({ m, c, total }) => {
    const pct = c.map((x) => Math.round(x / total * 100));
    const dom = c.indexOf(Math.max(...c));
    const seg = c.map((x, t) => (x ? `<span style="width:${(x / total * 100).toFixed(1)}%;background:${SEM3[t]}" title="${TIER_LABEL3[t]}: ${x}"></span>` : '')).join('');
    return `<div class="rv-drill-row"><b>${esc(m)}</b><span class="rv-drill-mini">${seg}</span><span style="color:${SEM3[dom]};font-weight:900;min-width:62px;text-align:right">${TILE_ICON[dom]} ${pct[dom]}%</span></div>`;
  }).join('') : '<div class="empty-state">Sin desglose por módulo.</div>';
  const total = entries.reduce((s, e) => s + e.total, 0);
  const titleEl = document.getElementById('rv-drill-title');
  const contentEl = document.getElementById('rv-drill-content');
  if (titleEl) titleEl.innerHTML = `Calidad: <b>${esc(label)}</b>`;
  if (contentEl) contentEl.innerHTML = `<div class="rv-drill-sub">${total} revisión(es) · niveles por módulo</div>${body}`;
  const ov = document.getElementById('rv-drill-modal');
  if (ov) { ov.classList.add('rv-open'); document.body.classList.add('modal-open'); }
}

/** Alimentación: Semillenas/Vacías (%) en barras agrupadas por día (solo días con dato). */
function drawAlim(rows) {
  if (!document.getElementById('rvAlim')) return;
  const days = daysWithData(rows, [K.semillenas, K.vacias]); if (!days.length) return;
  const ser = (keys) => days.map((d) => avg(rows.filter((r) => gFec(r) === d).map((r) => parseNum(r, keys)).filter((v) => v !== null)));
  makeChart('rvAlim', {
    type: 'bar',
    data: { labels: days, datasets: [
      { label: 'Semillenas %', data: ser(K.semillenas), backgroundColor: CAT3[0] + 'cc', borderColor: CAT3[0], borderWidth: 1, borderRadius: 3 },
      { label: 'Vacías %', data: ser(K.vacias), backgroundColor: CAT3[1] + 'cc', borderColor: CAT3[1], borderWidth: 1, borderRadius: 3 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } }, x: dayXAxis(days) },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 11 } } }, tooltip: { callbacks: { title: (it) => dayLabel(days[it[0].dataIndex]), label: (c) => ` ${c.dataset.label}: ${c.parsed.y == null ? '—' : c.parsed.y.toFixed(1) + '%'}` } } },
    },
  });
}

/** Morfología cuantitativa: % Atraso/Protusión/Deformidad/No viables en barras por día (solo días con dato). */
function drawMorfNum(rows) {
  if (!document.getElementById('rvMorfNum')) return;
  const days = daysWithData(rows, [K.atraso, K.protusion, K.deformidad, K.noviables]); if (!days.length) return;
  const ser = (keys) => days.map((d) => avg(rows.filter((r) => gFec(r) === d).map((r) => parseNum(r, keys)).filter((v) => v !== null)));
  makeChart('rvMorfNum', {
    type: 'bar',
    data: { labels: days, datasets: [
      { label: '% Atraso', data: ser(K.atraso), backgroundColor: CAT3[0] + 'cc', borderColor: CAT3[0], borderWidth: 1, borderRadius: 3 },
      { label: '% Protusión', data: ser(K.protusion), backgroundColor: CAT3[1] + 'cc', borderColor: CAT3[1], borderWidth: 1, borderRadius: 3 },
      { label: '% Deformidad', data: ser(K.deformidad), backgroundColor: CAT3[2] + 'cc', borderColor: CAT3[2], borderWidth: 1, borderRadius: 3 },
      { label: '% No viables', data: ser(K.noviables), backgroundColor: CAT3[3] + 'cc', borderColor: CAT3[3], borderWidth: 1, borderRadius: 3 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } }, x: dayXAxis(days) },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 11 } } }, tooltip: { callbacks: { title: (it) => dayLabel(days[it[0].dataIndex]), label: (c) => ` ${c.dataset.label}: ${c.parsed.y == null ? '—' : c.parsed.y.toFixed(1) + '%'}` } } },
    },
  });
}

/** Morfología cualitativa: severidad (leve/acentuada) apilada (conteo, no 100%) por variable. */
function drawMorfCual(rows, vars) {
  if (!document.getElementById('rvMorfCual') || !vars.length) return;
  const counts = vars.map(() => [0, 0]);
  vars.forEach(([, keys], vi) => rows.forEach((r) => { const v = g(r, keys); if (!v) return; const t = tier2(v); if (t >= 0) counts[vi][t]++; }));
  const totals = counts.map((c) => c[0] + c[1]);
  makeChart('rvMorfCual', {
    type: 'bar',
    data: {
      labels: vars.map(([l]) => l),
      datasets: [0, 1].map((t) => ({ label: TIER_LABEL2[t], data: vars.map((_, vi) => counts[vi][t]), backgroundColor: SEV2[t], borderWidth: 0, _tot: totals })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 11 } } }, tooltip: { callbacks: { label: stackTip } } },
    },
  });
}

const inGlobalDate = (r) => {
  const { dateFrom, dateTo } = store;
  if (!dateFrom && !dateTo) return true;
  const d = parseAnyDate(gFec(r));
  if (!d || isNaN(d)) return true;
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
};

/** Predicado único de fila bajo los filtros activos (fecha global + mes + corrida + módulo + siembra).
 *  Fuente compartida por el render principal y por los drill-downs (getFilteredRows). */
const rowMatchesFilters = (r, monthSet) =>
  inGlobalDate(r) && (!monthSet.size || monthSet.has(gCor(r))) &&
  (!vState.corrida || gCor(r) === vState.corrida) &&
  (!vState.mod || gMod(r) === vState.mod) &&
  (!vState.siembra || gSiem(r) === vState.siembra);

// Estado de filtros y de la ventana de historial (persistente entre re-renders).
const vState = { month: null, mod: null, corrida: null, siembra: null };
const histSel = { mod: '', siembra: '', corrida: '' };
const pState = { cmpDays: 7 }; // longitud de periodo para la comparativa
// Selección activa del modal de Cobertura (celda módulo × día) + filtro de supervisor.
const dayCellSel = { mod: null, daykey: null, label: '', sup: '' };
const CMP_PILLS = [{ id: 7, label: '7 días' }, { id: 14, label: '14 días' }, { id: 30, label: '30 días' }];
const BITA_VISIBLE = 5; // filas visibles antes de desplegar

/* ============================================================
   VISTA
   ============================================================ */
export function revisionesView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }
  destroyAllCharts();
  // Esta vista se re-renderiza por filtros/pills/mes sin pasar por el router, así
  // que limpiamos aquí cualquier overlay huérfano del <body> (si no, refresh.js lo
  // leería como interacción y pausaría el auto-refresco).
  document.body.classList.remove('modal-open');

  const all = store.globalData.filter(isRevisionRow);
  if (!all.length) {
    root.innerHTML = `<div class="rv-head"><div><div class="rv-title">🔍 Revisiones</div>
      <div class="rv-subtitle">Registro de supervisión</div></div></div>
      <div class="empty-state">No se encontraron registros en la hoja <b>Registro_Supervisión</b>.</div>`;
    bind(root);
    return;
  }

  // ── Barra de mes (alineada con Supervisor vía corrida→mes). Default = mes más
  //    reciente con datos; acota las corridas/módulos a ese mes. ──
  const allCorridas = [...new Set(all.map(gCor).filter(Boolean))];
  const months = [...new Set(allCorridas.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (vState.month == null || !months.includes(vState.month)) vState.month = months.length ? months[months.length - 1] : 0;
  const monthCorridas = allCorridas.filter((c) => monthIndexOfCorrida(+c) === vState.month).sort(numCmp);
  const monthSet = new Set(monthCorridas);
  const inMonth = (r) => !monthSet.size || monthSet.has(gCor(r));

  // Dominios en CASCADA: mes → corrida → módulo → siembra.
  const corridas = monthCorridas;
  if (vState.corrida && !corridas.includes(vState.corrida)) vState.corrida = null;
  // #1 · los módulos se acotan a la corrida elegida.
  const modScope = (r) => inMonth(r) && (!vState.corrida || gCor(r) === vState.corrida);
  const mods = [...new Set(all.filter(modScope).map(gMod).filter(Boolean))].sort(natCmp);
  if (vState.mod && !mods.includes(vState.mod)) vState.mod = null;
  // Siembras acotadas a corrida + módulo.
  const siemScope = (r) => modScope(r) && (!vState.mod || gMod(r) === vState.mod);
  const siembras = [...new Set(all.filter(siemScope).map(gSiem).filter(Boolean))].sort(numCmp);
  if (vState.siembra && !siembras.includes(vState.siembra)) vState.siembra = null;

  const rows = all.filter((r) => rowMatchesFilters(r, monthSet));

  // Fase 1 = panorama general (sin módulo) · Fase 2 = detalle del módulo.
  const phase2 = !!vState.mod;
  // Estado vacío informativo (#17).
  const emptyMsg = (what) => `<div class="empty-state" style="padding:24px">Sin datos de <b>${esc(what)}</b> registrados ${phase2 ? 'en este módulo' : 'este mes'}.</div>`;

  // KPIs
  const modsRevisados = new Set(rows.map(gMod).filter(Boolean)).size;
  const supsActivos = new Set(rows.map(gSup).filter(Boolean)).size;
  const deformProm = avg(rows.map((r) => parseNum(r, K.deformidad)).filter((v) => v !== null));
  const atrasoProm = avg(rows.map((r) => parseNum(r, K.atraso)).filter((v) => v !== null));
  const protusionProm = avg(rows.map((r) => parseNum(r, K.protusion)).filter((v) => v !== null));
  const noviablesProm = avg(rows.map((r) => parseNum(r, K.noviables)).filter((v) => v !== null));
  const vacProm = avg(rows.map((r) => parseNum(r, K.vacias)).filter((v) => v !== null));
  const semiProm = avg(rows.map((r) => parseNum(r, K.semillenas)).filter((v) => v !== null));
  const historialN = rows.filter(hasComment).length;
  const totalFindings = rows.reduce((s, r) => s + splitMulti(g(r, K.observaciones)).length, 0);
  const findingsRate = rows.length ? totalFindings / rows.length : 0;

  // ── HTML ──
  let html = `<div class="rv-head">
      <div>
        <div class="rv-title">🔍 Revisiones</div>
        <div class="rv-subtitle">Registro de supervisión · ${rows.length} registro(s)</div>
      </div>
    </div>`;

  html += `<div class="rv-filters">
      <div class="rv-monthbar">
        <button class="rv-month-nav" data-month-nav="-1" ${months.indexOf(vState.month) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
        <span class="rv-month-lbl">📅 ${esc(monthLabelAt(vState.month))}</span>
        <button class="rv-month-nav" data-month-nav="1" ${months.indexOf(vState.month) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
      </div>
      ${rvSelect('corrida', vState.corrida, corridas, 'Todas las corridas')}
      ${rvSelect('mod', vState.mod, mods, 'Todos los módulos')}
      ${rvSelect('siembra', vState.siembra, siembras, 'Todas las siembras')}
    </div>`;

  html += `<div class="rv-kpis">
      ${kpi('📋', 'Revisiones', rows.length)}
      ${kpi('👤', 'Supervisores', supsActivos)}
      ${kpi('🏭', 'Módulos revisados', modsRevisados)}
      ${kpi('🧬', 'Deformidad prom.', fmtPct(deformProm))}
      ${kpi('⏳', 'Atraso prom.', fmtPct(atrasoProm))}
      ${kpi('🩹', 'Protusión prom.', fmtPct(protusionProm))}
      ${noviablesProm !== null ? kpi('💀', 'No viables prom.', fmtPct(noviablesProm)) : ''}
      ${vacProm !== null ? kpi('🕳️', 'Vacías prom.', fmtPct(vacProm)) : ''}
      ${semiProm !== null ? kpi('🥣', 'Semillenas prom.', fmtPct(semiProm)) : ''}
      ${kpi('🔬', 'Hallazgos / revisión', findingsRate.toFixed(2))}
      <button class="rv-kpi rv-kpi-btn" data-hist-open title="Comentarios registrados — abrir historial">
        <div class="rv-kpi-label">🗂️ Historial</div>
        <div class="rv-kpi-value">${historialN}</div>
      </button>
    </div>`;

  // Encabezado de fase (panorama general vs detalle del módulo).
  html += phase2
    ? `<div class="rv-phase rv-phase-2">🏭 Detalle del módulo · <b>${esc(vState.mod)}</b>${vState.siembra ? ' · Siembra ' + esc(vState.siembra) : ''}</div>`
    : `<div class="rv-phase rv-phase-1">📋 Panorama general del mes <span class="muted">· elige un <b>módulo</b> en el filtro para ver su detalle</span></div>`;

  // Comparativa de periodos (Punto 5)
  html += periodSection(rows);

  // Observaciones + Acciones (treemap · área = frecuencia · clic = desglose por módulo).
  const obsEntries = multiCounts(rows, K.observaciones);
  const accEntries = multiCounts(rows, K.accion);
  html += `<div class="rv-chart-grid">
      <div class="card">
        <div class="rv-chart-title">📋 Observaciones <span class="rv-chart-sub">área = frecuencia · clic = desglose por módulo</span></div>
        <div class="rv-chart-host" style="height:240px">${obsEntries.length ? treemapHTML(obsEntries, rows.length, 'Observación') : emptyMsg('observaciones')}</div>
      </div>
      <div class="card">
        <div class="rv-chart-title">🛠️ Acciones <span class="rv-chart-sub">área = frecuencia · clic = desglose por módulo</span></div>
        <div class="rv-chart-host" style="height:240px">${accEntries.length ? treemapHTML(accEntries, rows.length, 'Acción') : emptyMsg('acciones')}</div>
      </div>
    </div>`;

  // ── Secciones de indicadores: Calidad · Alimentación · Morfología ──
  // 1) Calidad: barras apiladas (conteo, NO 100%) por nivel → semáforo.
  const CALIDAD_VARS = [
    ['Asimilación', K.asimilacion], ['Actividad', K.actividad],
    ['Intestino', K.intestino], ['Condición biológica', K.condicion],
  ].filter(([, keys]) => rows.some((r) => g(r, keys)));
  html += `<div class="rv-section-title">🧪 Calidad <span class="rv-chart-sub">nivel dominante por variable (🟢 bueno · 🟡 medio · 🔴 malo)</span></div>
    ${CALIDAD_VARS.length ? calidadTilesHTML(rows, CALIDAD_VARS) : `<div class="card rv-mt">${emptyMsg('Calidad')}</div>`}`;

  // 2) Alimentación: Semillenas/Vacías (%) por día.
  const hasAlim = rows.some((r) => parseNum(r, K.semillenas) !== null || parseNum(r, K.vacias) !== null);
  html += `<div class="rv-section-title">🍤 Alimentación <span class="rv-chart-sub">Semillenas y Vacías (%) por día</span></div>
    <div class="card rv-mt"><div class="rv-chart-host">${hasAlim ? '<canvas id="rvAlim"></canvas>' : emptyMsg('Alimentación')}</div></div>`;

  // 3) Morfología: cuantitativo (% por día) + cualitativo (severidad leve/acentuada).
  const hasMorfNum = rows.some((r) => parseNum(r, K.atraso) !== null || parseNum(r, K.protusion) !== null || parseNum(r, K.deformidad) !== null || parseNum(r, K.noviables) !== null);
  const MORF_CUAL = [['Opacidad', K.opacidad], ['Protusión', K.protusionCual]].filter(([, keys]) => rows.some((r) => g(r, keys)));
  html += `<div class="rv-section-title">🔬 Morfología</div>
    <div class="rv-chart-grid">
      <div class="card"><div class="rv-chart-title">Cuantitativo <span class="rv-chart-sub">% Atraso / Protusión / Deformidad / No viables por día</span></div>
        <div class="rv-chart-host">${hasMorfNum ? '<canvas id="rvMorfNum"></canvas>' : emptyMsg('Morfología (%)')}</div></div>
      <div class="card"><div class="rv-chart-title">Cualitativo <span class="rv-chart-sub">severidad (🟡 leve · 🔴 acentuada)</span></div>
        <div class="rv-chart-host">${MORF_CUAL.length ? '<canvas id="rvMorfCual"></canvas>' : emptyMsg('Opacidad/Protusión')}</div></div>
    </div>`;

  // Relación Hallazgo → Acción (Sankey)
  html += `<div class="rv-section-title">🔀 Hallazgo → Acción <span class="rv-chart-sub">qué acción se toma ante cada hallazgo · grosor = frecuencia</span></div>
    <div class="card rv-mt" style="overflow:auto">${sankeyHTML(rows) || emptyMsg('relación hallazgo→acción')}</div>`;

  // Secciones cross-módulo: SOLO en Fase 1 (panorama general).
  const supRows = [...new Set(rows.map(gSup).filter(Boolean))];
  if (!phase2) {
    const bulletH = Math.max(120, supRows.length * 52 + 30);
    html += `<div class="card rv-mt">
        <div class="rv-chart-title">🎯 Cobertura por supervisor
          <span class="rv-chart-sub">barra = módulos cubiertos · ▎marca = objetivo (los ${modsRevisados} módulo${modsRevisados !== 1 ? 's' : ''})</span>
        </div>
        <div class="rv-chart-host" style="height:${bulletH}px">${supRows.length ? '<canvas id="rvBullet"></canvas>' : emptyMsg('cobertura')}</div>
      </div>`;

    html += `<div class="card rv-mt">
        <div class="rv-chart-title">📈 Tasa de hallazgos por revisión
          <span class="rv-chart-sub">hallazgos ÷ revisión por día</span>
        </div>
        <div class="rv-chart-host" style="height:210px">${rows.length ? '<canvas id="rvRate"></canvas>' : emptyMsg('tasa de hallazgos')}</div>
      </div>`;

    html += `<div class="rv-section-title">🗓️ Cobertura de supervisión <span class="rv-chart-sub">módulo × día · nº de revisiones · hoy resaltado · vacío = sin revisar</span></div>
      <div class="card rv-mt" style="overflow:auto">${timelineHTML(rows)}</div>`;
  }

  // Bitácora desplegable
  html += bitacora(rows);

  // Ventana de Historial + drill-down por módulo (RV2) + drill por categoría (#14)
  html += histModalShell();
  html += modDetailShell();
  html += drillModalShell();
  html += dayCellShell();

  root.innerHTML = html;

  // ── Render de gráficos ──
  drawAlim(rows);
  drawMorfNum(rows);
  drawMorfCual(rows, MORF_CUAL);
  if (!phase2) { drawBullet(rows, supRows); drawRateLine(rows); }

  bind(root);
}

/* ============================================================
   GRÁFICOS
   ============================================================ */
function multiCounts(rows, keys) {
  const map = new Map();
  rows.forEach((r) => splitMulti(g(r, keys)).forEach((ev) => map.set(ev, (map.get(ev) || 0) + 1)));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/** Treemap squarified: reparte W×H en rectángulos cuyo área ∝ value. */
function treemapLayout(data, W, H) {
  const nodes = data.filter((d) => d.value > 0).slice().sort((a, b) => b.value - a.value);
  if (!nodes.length) return [];
  const totalVal = nodes.reduce((s, n) => s + n.value, 0);
  const area = W * H;
  nodes.forEach((n) => { n._a = n.value / totalVal * area; });
  const out = [];
  let rect = { x: 0, y: 0, w: W, h: H };
  let row = [];
  const sum = (r) => r.reduce((s, n) => s + n._a, 0);
  const worst = (r, side) => { const s = sum(r); if (!s) return Infinity; const mx = Math.max(...r.map((n) => n._a)), mn = Math.min(...r.map((n) => n._a)); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
  const place = (r) => {
    const s = sum(r);
    if (rect.w >= rect.h) { const cw = s / rect.h; let cy = rect.y; r.forEach((n) => { const nh = n._a / cw; out.push({ node: n, x: rect.x, y: cy, w: cw, h: nh }); cy += nh; }); rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h }; }
    else { const rh = s / rect.w; let cx = rect.x; r.forEach((n) => { const nw = n._a / rh; out.push({ node: n, x: cx, y: rect.y, w: nw, h: rh }); cx += nw; }); rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh }; }
  };
  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(rect.w, rect.h), n = nodes[i];
    if (!row.length || worst([...row, n], side) <= worst(row, side)) { row.push(n); i++; } else { place(row); row = []; }
  }
  if (row.length) place(row);
  return out;
}

/** Treemap de frecuencias (SVG): área = nº de revisiones. Clic en una celda → desglose por módulo. */
function treemapHTML(entries, total, type) {
  const data = entries.map((e) => ({ label: e[0], value: e[1] }));
  const W = 600, H = 300;
  const rects = treemapLayout(data, W, H);
  const maxV = Math.max(...data.map((d) => d.value), 1);
  const cells = rects.map((rr) => {
    const n = rr.node, p = Math.round(n.value / (total || 1) * 100);
    const op = (0.42 + 0.5 * (n.value / maxV)).toFixed(2);
    const big = rr.w > 56 && rr.h > 30;
    return `<g class="rv-tm-cell" data-drilltype="${esc(type)}" data-drillval="${esc(n.label)}" role="button" tabindex="0" aria-label="${esc(type)} ${esc(n.label)}: ${n.value} revisiones, ${p}%. Desglose por módulo">
      <rect x="${rr.x.toFixed(1)}" y="${rr.y.toFixed(1)}" width="${Math.max(0, rr.w - 2).toFixed(1)}" height="${Math.max(0, rr.h - 2).toFixed(1)}" rx="4" fill="${RV_ACCENT}" fill-opacity="${op}"><title>${esc(n.label)}: ${n.value} revisión(es) · ${p}%</title></rect>
      ${big ? `<text x="${(rr.x + 8).toFixed(1)}" y="${(rr.y + 18).toFixed(1)}" font-size="11" font-weight="800" fill="#fff">${esc(n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label)}</text>
        <text x="${(rr.x + 8).toFixed(1)}" y="${(rr.y + 33).toFixed(1)}" font-size="11" font-weight="700" fill="#fff" opacity=".9">${p}% · ${n.value}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg class="rv-tm-svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none">${cells}</svg>`;
}

/** Filas filtradas según los filtros activos (reutilizado por el drill-down del treemap). */
function getFilteredRows() {
  const all = store.globalData.filter(isRevisionRow);
  const allCorridas = [...new Set(all.map(gCor).filter(Boolean))];
  const months = [...new Set(allCorridas.map((c) => monthIndexOfCorrida(+c)).filter((x) => x >= 0))].sort((a, b) => a - b);
  const month = (vState.month != null && months.includes(vState.month)) ? vState.month : (months.length ? months[months.length - 1] : 0);
  const monthSet = new Set(allCorridas.filter((c) => monthIndexOfCorrida(+c) === month));
  return all.filter((r) => rowMatchesFilters(r, monthSet));
}

/** Sankey Hallazgo → Acción (SVG): cintas con grosor ∝ frecuencia del par. */
const SANKEY_PAL = ['#3F51B5', '#7E57C2', '#EC407A', '#FF7043', '#26A69A', '#42A5F5', '#8D6E63'];
function sankeyHTML(rows) {
  // obsFullTot = total de atribuciones (hallazgo→acción) de CADA hallazgo sobre TODAS
  // las acciones (no solo las del top-7 que se dibujan). Es el denominador honesto del
  // "% de los casos de <hallazgo>": con obsSum (solo top-7) el % se inflaba cuando un
  // hallazgo derivaba a más de 7 acciones distintas.
  const m = new Map(), obsTot = new Map(), actTot = new Map(), obsFullTot = new Map();
  rows.forEach((r) => {
    const obs = splitMulti(g(r, K.observaciones)), acts = splitMulti(g(r, K.accion));
    if (!obs.length || !acts.length) return;
    obs.forEach((o) => { obsTot.set(o, (obsTot.get(o) || 0) + 1); acts.forEach((a) => { m.set(o + '||' + a, (m.get(o + '||' + a) || 0) + 1); actTot.set(a, (actTot.get(a) || 0) + 1); obsFullTot.set(o, (obsFullTot.get(o) || 0) + 1); }); });
  });
  const obsList = [...obsTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map((e) => e[0]);
  const actList = [...actTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map((e) => e[0]);
  const flows = []; let gTotal = 0;
  obsList.forEach((o) => actList.forEach((a) => { const c = m.get(o + '||' + a) || 0; if (c) { flows.push({ o, a, c }); gTotal += c; } }));
  if (!gTotal) return null;
  const obsSum = {}, actSum = {};
  flows.forEach((f) => { obsSum[f.o] = (obsSum[f.o] || 0) + f.c; actSum[f.a] = (actSum[f.a] || 0) + f.c; });
  const obsShown = obsList.filter((o) => obsSum[o]), actShown = actList.filter((a) => actSum[a]);

  const W = 700, mL = 150, mR = 150, nodeW = 11, gap = 9;
  const xL = mL, xR = W - mR - nodeW;
  const nMax = Math.max(obsShown.length, actShown.length);
  const H = Math.max(240, nMax * 34);
  const scale = (H - (nMax - 1) * gap) / gTotal;
  const layoutSide = (list, sumMap) => {
    const blockH = list.reduce((s, n) => s + sumMap[n] * scale, 0) + (list.length - 1) * gap;
    let y = (H - blockH) / 2; const pos = {};
    list.forEach((n) => { const h = sumMap[n] * scale; pos[n] = { y, h }; y += h + gap; });
    return pos;
  };
  const posL = layoutSide(obsShown, obsSum), posR = layoutSide(actShown, actSum);
  const colorOf = {}; obsShown.forEach((o, i) => { colorOf[o] = SANKEY_PAL[i % SANKEY_PAL.length]; });

  const offL = {}, offR = {};
  obsShown.forEach((o) => { offL[o] = 0; }); actShown.forEach((a) => { offR[a] = 0; });
  const sorted = flows.filter((f) => posL[f.o] && posR[f.a]).sort((a, b) => obsShown.indexOf(a.o) - obsShown.indexOf(b.o) || actShown.indexOf(a.a) - actShown.indexOf(b.a));
  let ribbons = '';
  sorted.forEach((f) => {
    const w = f.c * scale;
    const y0 = posL[f.o].y + offL[f.o]; offL[f.o] += w;
    const y1 = posR[f.a].y + offR[f.a]; offR[f.a] += w;
    const x0 = xL + nodeW, x1 = xR, xm = (x0 + x1) / 2;
    const pct = Math.round(f.c / (obsFullTot.get(f.o) || f.c) * 100); // % de los casos del hallazgo (sobre TODAS sus acciones) que llevaron a esta
    ribbons += `<path class="rv-sk-flow" data-sk-obs="${esc(f.o)}" data-sk-act="${esc(f.a)}" data-sk-c="${f.c}" data-sk-pct="${pct}" role="button" tabindex="0" aria-label="${esc(f.o)} derivó en ${esc(f.a)}: ${f.c} veces, ${pct}% de los casos de ${esc(f.o)}" d="M${x0},${y0.toFixed(1)} C${xm},${y0.toFixed(1)} ${xm},${y1.toFixed(1)} ${x1},${y1.toFixed(1)} L${x1},${(y1 + w).toFixed(1)} C${xm},${(y1 + w).toFixed(1)} ${xm},${(y0 + w).toFixed(1)} ${x0},${(y0 + w).toFixed(1)} Z" fill="${colorOf[f.o]}" fill-opacity="0.34"><title>${esc(f.o)} → ${esc(f.a)}: ${f.c} vez(ces) · ${pct}% de los casos de "${esc(f.o)}"</title></path>`;
  });
  const lbl = (s) => esc(s.length > 20 ? s.slice(0, 19) + '…' : s);
  let nodes = '';
  obsShown.forEach((o) => { const p = posL[o]; nodes += `<rect x="${xL}" y="${p.y.toFixed(1)}" width="${nodeW}" height="${Math.max(2, p.h).toFixed(1)}" rx="2" fill="${colorOf[o]}"/><text x="${xL - 8}" y="${(p.y + p.h / 2).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="11" font-weight="700" fill="var(--c-text-soft,#546e7a)">${lbl(o)}</text>`; });
  actShown.forEach((a) => { const p = posR[a]; nodes += `<rect x="${xR}" y="${p.y.toFixed(1)}" width="${nodeW}" height="${Math.max(2, p.h).toFixed(1)}" rx="2" fill="#37474f"/><text x="${xR + nodeW + 8}" y="${(p.y + p.h / 2).toFixed(1)}" text-anchor="start" dominant-baseline="middle" font-size="11" font-weight="700" fill="var(--c-text-soft,#546e7a)">${lbl(a)}</text>`; });
  return `<svg class="rv-sankey-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet">${ribbons}${nodes}</svg>
    <div class="rv-sankey-info" id="rv-sankey-info">Haz clic en una conexión para ver el % de veces que ese hallazgo derivó en esa acción.</div>`;
}

/* ---- Cobertura por supervisor (bullet): bandas + marca de objetivo (cobertura). ---- */
const BAND_H = 28;
const bulletPlugin = {
  id: 'rvBullet',
  beforeDatasetsDraw(chart) {
    const cfg = chart.config.options.bullet; if (!cfg) return;
    const { ctx, scales: { x } } = chart;
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      const row = cfg.rows[i]; if (!row) return;
      const yTop = bar.y - BAND_H / 2;
      const segs = [[0, row.bands[0], 'rgba(96,125,139,.10)'], [row.bands[0], row.bands[1], 'rgba(96,125,139,.20)'], [row.bands[1], cfg.max, 'rgba(96,125,139,.30)']];
      segs.forEach(([a, b, col]) => { const xa = x.getPixelForValue(a), xb = x.getPixelForValue(b); ctx.fillStyle = col; ctx.fillRect(xa, yTop, xb - xa, BAND_H); });
    });
  },
  afterDatasetsDraw(chart) {
    const cfg = chart.config.options.bullet; if (!cfg) return;
    const { ctx, scales: { x } } = chart; ctx.save();
    // Marcador objetivo: casi-negro en claro, claro en oscuro (si no, se pierde sobre
    // la tarjeta oscura). Mismo criterio que compareTanks.js.
    const tgtCol = document.documentElement.getAttribute('data-theme') === 'dark' ? '#e7edf0' : '#263238';
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      const row = cfg.rows[i]; if (!row || row.target == null) return;
      const px = x.getPixelForValue(row.target);
      ctx.strokeStyle = tgtCol; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px, bar.y - BAND_H / 2 - 1); ctx.lineTo(px, bar.y + BAND_H / 2 + 1); ctx.stroke();
    });
    ctx.restore();
  },
};

function drawBullet(rows, supRows) {
  if (!document.getElementById('rvBullet') || !supRows.length) return;
  const modsTotal = new Set(rows.map(gMod).filter(Boolean)).size || 1;
  const data = supRows.map((sup) => {
    const sr = rows.filter((r) => gSup(r) === sup);
    const dias = new Set(sr.map((r) => fmtShort(parseAnyDate(gFec(r))) || gFec(r))).size || 1;
    return { sup, revisiones: sr.length, dias, cubiertos: new Set(sr.map(gMod).filter(Boolean)).size };
  }).sort((a, b) => b.cubiertos - a.cubiertos);
  const target = modsTotal, max = modsTotal * 1.12;
  makeChart('rvBullet', {
    type: 'bar',
    data: { labels: data.map((d) => d.sup), datasets: [{ data: data.map((d) => d.cubiertos), backgroundColor: RV_ACCENT, borderRadius: 3, barThickness: 12 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { min: 0, max, ticks: { precision: 0 } }, y: { grid: { display: false } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => { const d = data[c.dataIndex]; return [`Módulos cubiertos: ${d.cubiertos}/${modsTotal} (${Math.round(d.cubiertos / modsTotal * 100)}%)`, `Revisiones: ${d.revisiones}`, `Días activos: ${d.dias}`]; } } },
      },
      bullet: { rows: data.map(() => ({ target, bands: [target * 0.5, target * 0.85] })), max },
    },
    plugins: [bulletPlugin],
  });
}

/** Tasa de hallazgos por revisión como LÍNEA temporal por día (eje X estilo Larvicultura). */
function drawRateLine(rows) {
  if (!document.getElementById('rvRate')) return;
  const days = dailyAxis(rows); if (!days.length) return;
  const rate = days.map((d) => { const dr = rows.filter((r) => gFec(r) === d); const f = dr.reduce((s, r) => s + splitMulti(g(r, K.observaciones)).length, 0); return dr.length ? +(f / dr.length).toFixed(2) : 0; });
  makeChart('rvRate', {
    type: 'line',
    data: { labels: days, datasets: [{ label: 'Hallazgos/revisión', data: rate, borderColor: RV_ACCENT, backgroundColor: RV_ACCENT + '22', tension: .3, pointRadius: 3, fill: true, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true }, x: dayXAxis(days) },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => dayLabel(days[it[0].dataIndex]), label: (c) => ` ${c.parsed.y} hallazgos/revisión` } } },
    },
  });
}

/** #14 · Drill-down: abre el modal con el desglose por módulo de una categoría. */
function openDrill(typeLabel, value, keys, rows) {
  const byMod = new Map();
  rows.forEach((r) => { if (splitMulti(g(r, keys)).includes(value)) { const m = gMod(r) || '—'; byMod.set(m, (byMod.get(m) || 0) + 1); } });
  const entries = [...byMod.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, e) => s + e[1], 0);
  const body = entries.length
    ? entries.map(([m, c]) => `<div class="rv-drill-row"><b>${esc(m)}</b><span class="grow"></span><span class="muted">${c} · ${Math.round(c / total * 100)}%</span><span class="rv-drill-bar" style="width:${Math.round(c / total * 100)}%"></span></div>`).join('')
    : '<div class="empty-state">Sin desglose por módulo.</div>';
  const titleEl = document.getElementById('rv-drill-title');
  const contentEl = document.getElementById('rv-drill-content');
  if (titleEl) titleEl.innerHTML = `${esc(typeLabel)}: <b>${esc(value)}</b>`;
  if (contentEl) contentEl.innerHTML = `<div class="rv-drill-sub">${total} revisión(es) · desglose por módulo</div>${body}`;
  const ov = document.getElementById('rv-drill-modal');
  if (ov) { ov.classList.add('rv-open'); document.body.classList.add('modal-open'); }
}


/* ============================================================
   COMPARATIVA DE PERIODOS (Punto 5)
   ============================================================ */
function periodSection(rows) {
  const days = pState.cmpDays;
  const pills = CMP_PILLS.map((p) => `<button class="rv-cmp-pill ${days === p.id ? 'is-active' : ''}" data-cmp-days="${p.id}">${p.label}</button>`).join('');
  const pc = periodCompare(rows, days);
  const head = `<div class="rv-cmp-head">
      <div class="rv-chart-title" style="margin:0">📅 Comparativa de periodos <span class="rv-chart-sub">${pc ? pc.label : 'actual vs. anterior'}</span></div>
      <div class="rv-cmp-pills">${pills}</div>
    </div>`;
  const body = pc ? `<div class="rv-cmp-grid">${pc.metrics.map(cmpCard).join('')}</div>`
                  : `<div class="empty-state" style="padding:18px">Sin fechas válidas para comparar.</div>`;
  return `<div class="card rv-mt">${head}${body}</div>`;
}

function periodCompare(rows, days) {
  let maxMs = 0;
  rows.forEach((r) => { const d = parseAnyDate(gFec(r)); if (d) maxMs = Math.max(maxMs, d.getTime()); });
  if (!maxMs) return null;
  const dayMs = 86400000;
  const curStart = maxMs - (days - 1) * dayMs;
  const prevEnd = curStart - dayMs;
  const prevStart = curStart - days * dayMs;
  const inR = (r, a, b) => { const d = parseAnyDate(gFec(r)); return d && d.getTime() >= a && d.getTime() <= b; };
  const cur = rows.filter((r) => inR(r, curStart, maxMs));
  const prev = rows.filter((r) => inR(r, prevStart, prevEnd));
  const findings = (rs) => rs.reduce((s, r) => s + splitMulti(g(r, K.observaciones)).length, 0);
  const actions = (rs) => rs.reduce((s, r) => s + splitMulti(g(r, K.accion)).length, 0);
  const deform = (rs) => avg(rs.map((r) => parseNum(r, K.deformidad)).filter((v) => v !== null));
  const vacias = (rs) => avg(rs.map((r) => parseNum(r, K.vacias)).filter((v) => v !== null));
  const intT = (v) => String(v);
  const pctT = (v) => (v === null ? '—' : v.toFixed(1) + '%');
  // Si la ventana previa NO tiene NINGUNA revisión (p.ej. arranca antes del 1.er
  // dato), no hay base de comparación: los conteos deben quedar "sin previo" (null),
  // no 0 — un 0 real es indistinguible de "no había periodo" y el delta salía como
  // un "▲ +N" engañoso.
  const hasPrev = prev.length > 0;
  const pv = (fn) => hasPrev ? fn(prev) : null;
  const metrics = [
    { label: 'Revisiones', cur: cur.length, prev: hasPrev ? prev.length : null, goodUp: true, fmt: intT },
    { label: 'Hallazgos', cur: findings(cur), prev: hasPrev ? findings(prev) : null, goodUp: false, fmt: intT },
    { label: 'Acciones', cur: actions(cur), prev: hasPrev ? actions(prev) : null, goodUp: false, fmt: intT },
    { label: 'Deformidad prom.', cur: deform(cur), prev: pv(deform), goodUp: false, fmt: pctT },
  ];
  // Vacías sólo si la columna nueva tiene datos en la ventana comparada.
  if (vacias(cur) !== null || pv(vacias) !== null) {
    metrics.push({ label: 'Vacías prom.', cur: vacias(cur), prev: pv(vacias), goodUp: false, fmt: pctT });
  }
  return { label: `últimos ${days} d vs. ${days} d previos`, metrics };
}

function cmpCard(m) {
  const { label, cur, prev, goodUp, fmt } = m;
  const curTxt = (cur === null || cur === undefined) ? '—' : fmt(cur);
  const prevTxt = (prev === null || prev === undefined) ? '—' : fmt(prev);
  let delta = `<span class="rv-cmp-delta flat">sin previo</span>`;
  if (cur !== null && cur !== undefined && prev !== null && prev !== undefined) {
    const d = cur - prev;
    const dir = Math.abs(d) < 1e-9 ? 'flat' : (d > 0 ? 'up' : 'down');
    const tone = dir === 'flat' ? 'flat' : ((dir === 'up') === goodUp ? 'good' : 'bad');
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▬';
    delta = `<span class="rv-cmp-delta ${tone}">${arrow} ${d >= 0 ? '+' : '-'}${fmt(Math.abs(d))}</span>`;
  }
  return `<div class="rv-cmp-card">
      <div class="rv-cmp-lbl">${esc(label)}</div>
      <div class="rv-cmp-val">${curTxt}</div>
      <div class="rv-cmp-foot">${delta}<span class="rv-cmp-prev">prev: ${prevTxt}</span></div>
    </div>`;
}

/* ============================================================
   COBERTURA · módulo × día (Punto 3)
   ============================================================ */
// Clave de día estable (alineada con coverageData) para casar una celda con sus filas.
const dayKeyOf = (r) => { const d = parseAnyDate(gFec(r)); return d ? String(d.getTime()) : ('x' + gFec(r)); };

function coverageData(rows) {
  const dayMap = new Map();
  rows.forEach((r) => { const d = parseAnyDate(gFec(r)); const key = d ? d.getTime() : ('x' + gFec(r)); if (!dayMap.has(key)) dayMap.set(key, { label: d ? fmtShort(d) : (gFec(r) || '—'), ms: d ? d.getTime() : 0 }); });
  const days = [...dayMap.entries()].sort((a, b) => a[1].ms - b[1].ms);
  const mods = [...new Set(rows.map(gMod).filter(Boolean))].sort(natCmp);
  const cell = new Map();
  rows.forEach((r) => { const m = gMod(r); if (!m) return; const d = parseAnyDate(gFec(r)); const key = d ? d.getTime() : ('x' + gFec(r)); const k = m + '||' + key; cell.set(k, (cell.get(k) || 0) + 1); });
  return { days, mods, cell };
}

function timelineHTML(rows) {
  const { days, mods, cell } = coverageData(rows);
  if (!days.length || !mods.length) return empty();
  let max = 1; cell.forEach((v) => { if (v > max) max = v; });
  const todayLabel = fmtShort(new Date()); // #8 · columna de hoy
  const isToday = ([, d]) => d.label === todayLabel;
  const head = `<tr><th class="rv-tl-corner">Módulo \\ Día</th>${days.map((dd) => `<th class="${isToday(dd) ? 'rv-tl-today' : ''}">${esc(dd[1].label)}${isToday(dd) ? ' •' : ''}</th>`).join('')}</tr>`;
  const body = mods.map((m) => {
    const tds = days.map((dd) => {
      const [key, d] = dd; const today = isToday(dd);
      const c = cell.get(m + '||' + key) || 0;
      if (!c) return `<td class="rv-tl-cell empty ${today ? 'rv-tl-today' : ''}" title="${esc(m)} · ${esc(d.label)}: sin revisión (hueco)">·</td>`;
      const op = (0.22 + 0.6 * (c / max)).toFixed(2);
      return `<td class="rv-tl-cell rv-tl-click ${today ? 'rv-tl-today' : ''}" data-daycell="${esc(m)}" data-daykey="${esc(String(key))}" data-daylabel="${esc(d.label)}" role="button" tabindex="0" style="background:rgba(0,131,143,${op});color:${c / max > 0.55 ? '#fff' : '#0a3d44'}" title="${esc(m)} · ${esc(d.label)}: ${c} revisión(es) · clic = ver detalle">${c}</td>`;
    }).join('');
    return `<tr><th class="rv-tl-row rv-mod-link" data-moddetail="${esc(m)}" title="Ver detalle de ${esc(m)}">${esc(m)} 🔎</th>${tds}</tr>`;
  }).join('');
  return `<table class="rv-tl"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/* ============================================================
   BITÁCORA (desplegable, columnas reducidas)
   ============================================================ */
function bitacora(rows) {
  const headers = ['Fecha', 'Supervisor', 'Módulo', 'Corrida', 'Estadío', 'Tipo', 'Comentarios'];
  const sorted = [...rows].sort((a, b) => (parseAnyDate(gFec(b)) || new Date(0)) - (parseAnyDate(gFec(a)) || new Date(0)));
  const hiddenN = Math.max(0, sorted.length - BITA_VISIBLE);

  const rowHtml = (r, hidden) => `<tr class="${hidden ? 'rv-bita-hidden' : ''}">
      <td>${dateOf(r)}</td>
      <td><b>${esc(gSup(r) || '—')}</b></td>
      <td>${esc(gMod(r) || '—')}</td>
      <td>${esc(gCor(r) || '—')}</td>
      <td>${esc(g(r, K.estadio) || '—')}</td>
      <td>${esc(g(r, K.tipo) || '—')}</td>
      <td class="rv-comment">${commentCell(r)}</td>
    </tr>`;

  const body = sorted.length
    ? sorted.map((r, i) => rowHtml(r, i >= BITA_VISIBLE)).join('')
    : `<tr><td colspan="${headers.length}" class="muted" style="text-align:center;padding:20px">Sin registros para los filtros actuales.</td></tr>`;

  return `<div class="rv-bita-head">
      <div class="rv-section-title" style="margin:0">📋 Bitácora de revisiones</div>
      ${hiddenN > 0 ? `<button class="rv-bita-toggle" data-bita-toggle aria-expanded="false">Ver historial completo (${sorted.length})</button>` : ''}
    </div>
    <div class="card" style="padding:0;overflow:auto">
      <table class="rv-table">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

/* ============================================================
   VENTANA · Historial de comentarios
   ============================================================ */
function histModalShell() {
  return `<div class="rv-modal" id="rv-hist-modal" data-hist-overlay>
      <div class="rv-modal-card">
        <div class="rv-modal-head">
          <span class="rv-modal-title">🗂️ Historial de comentarios</span>
          <button class="rv-modal-x" data-hist-close aria-label="Cerrar">✕</button>
        </div>
        <div class="rv-modal-body" id="rv-hist-content">${histContentHTML()}</div>
      </div>
    </div>`;
}

/* ============================================================
   DRILL-DOWN · detalle por módulo (RV2)
   ============================================================ */
function modDetailShell() {
  return `<div class="rv-modal" id="rv-mod-modal" data-mod-overlay>
      <div class="rv-modal-card">
        <div class="rv-modal-head">
          <span class="rv-modal-title" id="rv-mod-title">🏭 Detalle del módulo</span>
          <button class="rv-modal-x" data-mod-close aria-label="Cerrar">✕</button>
        </div>
        <div class="rv-modal-body" id="rv-mod-content"></div>
      </div>
    </div>`;
}

/* ============================================================
   VENTANA · Revisiones de un día+módulo (celda de Cobertura)
   ============================================================ */
function dayCellShell() {
  return `<div class="rv-modal" id="rv-daycell-modal" data-daycell-overlay>
      <div class="rv-modal-card">
        <div class="rv-modal-head">
          <span class="rv-modal-title" id="rv-daycell-title">🗓️ Revisiones del día</span>
          <button class="rv-modal-x" data-daycell-close aria-label="Cerrar">✕</button>
        </div>
        <div class="rv-modal-body">
          <div class="rv-hist-filters" id="rv-daycell-filters"></div>
          <div id="rv-daycell-content"></div>
        </div>
      </div>
    </div>`;
}

/** Revisiones de la celda activa (módulo + día), respetando los filtros de la vista
 *  y el filtro de supervisor del propio modal. */
function dayCellRows(applySup = true) {
  return getFilteredRows()
    .filter((r) => gMod(r) === dayCellSel.mod && dayKeyOf(r) === dayCellSel.daykey)
    .filter((r) => !applySup || !dayCellSel.sup || gSup(r) === dayCellSel.sup)
    .sort((a, b) => (gSup(a) || '').localeCompare(gSup(b) || ''));
}

/** Tarjeta de detalle completo de una revisión. */
function revisionCardHTML(r) {
  const pc = (keys) => { const v = parseNum(r, keys); return v === null ? '—' : fmtPct(v); };
  const qc = (keys) => esc(g(r, keys) || '—');
  const cellM = (label, val) => `<div class="rv-daycell-cell"><span>${label}</span><b>${val}</b></div>`;
  return `<div class="rv-daycell-rev">
      <div class="rv-daycell-rev-head">
        <b>👤 ${esc(gSup(r) || 'Supervisor')}</b>
        <span class="rv-daycell-rev-meta">${dateOf(r)}${gCor(r) ? ' · C' + esc(gCor(r)) : ''}${g(r, K.estadio) ? ' · 🦐 ' + esc(g(r, K.estadio)) : ''}${g(r, K.tipo) ? ' · ' + esc(g(r, K.tipo)) : ''}</span>
      </div>
      <div class="rv-daycell-grid">
        ${cellM('Deformidad', pc(K.deformidad))}
        ${cellM('% Atraso', pc(K.atraso))}
        ${cellM('% Protusión', pc(K.protusion))}
        ${cellM('% No viables', pc(K.noviables))}
        ${cellM('Semillenas', pc(K.semillenas))}
        ${cellM('Vacías', pc(K.vacias))}
        ${cellM('Protusión (cual.)', qc(K.protusionCual))}
        ${cellM('Opacidad', qc(K.opacidad))}
        ${cellM('Asimilación', qc(K.asimilacion))}
        ${cellM('Intestino', qc(K.intestino))}
        ${cellM('Actividad', qc(K.actividad))}
        ${cellM('Condición', qc(K.condicion))}
      </div>
      ${g(r, K.observaciones) ? `<div class="rv-daycell-note"><b>🔬 Observaciones:</b> ${esc(g(r, K.observaciones))}</div>` : ''}
      ${g(r, K.accion) ? `<div class="rv-daycell-note"><b>🛠️ Acción:</b> ${esc(g(r, K.accion))}</div>` : ''}
      ${hasComment(r) ? commentBlocks(r) : ''}
    </div>`;
}

function dayCellContentHTML() {
  const list = dayCellRows();
  if (!list.length) return `<div class="empty-state" style="padding:24px">Sin revisiones para el supervisor seleccionado.</div>`;
  return `<div class="rv-hist-count">${list.length} revisión(es)</div>` + list.map(revisionCardHTML).join('');
}

function dayCellFiltersHTML() {
  const sups = [...new Set(dayCellRows(false).map(gSup).filter(Boolean))].sort();
  if (sups.length < 2) return ''; // un solo supervisor: el filtro no aporta
  const opt = (val, lbl) => `<option value="${esc(val)}" ${val === dayCellSel.sup ? 'selected' : ''}>${esc(lbl)}</option>`;
  return `<label class="rv-hist-field">
      <span>👤 Supervisor</span>
      <select class="rv-select" data-daycell-sup>${opt('', 'Todos')}${sups.map((s) => opt(s, s)).join('')}</select>
    </label>`;
}

function openDayCell(mod, daykey, label) {
  dayCellSel.mod = mod; dayCellSel.daykey = daykey; dayCellSel.label = label; dayCellSel.sup = '';
  const titleEl = document.getElementById('rv-daycell-title');
  const filtersEl = document.getElementById('rv-daycell-filters');
  const contentEl = document.getElementById('rv-daycell-content');
  if (titleEl) titleEl.textContent = `🗓️ ${mod} · ${label}`;
  if (filtersEl) filtersEl.innerHTML = dayCellFiltersHTML();
  if (contentEl) contentEl.innerHTML = dayCellContentHTML();
  const m = document.getElementById('rv-daycell-modal');
  if (m) { m.classList.add('rv-open'); document.body.classList.add('modal-open'); }
}

function closeDayCell() {
  const m = document.getElementById('rv-daycell-modal');
  if (m) { m.classList.remove('rv-open'); document.body.classList.remove('modal-open'); }
}

/** Modal de drill-down por categoría (#14): desglose por módulo de una observación/acción. */
function drillModalShell() {
  return `<div class="rv-modal" id="rv-drill-modal" data-drill-overlay>
      <div class="rv-modal-card rv-drill-card">
        <div class="rv-modal-head">
          <span class="rv-modal-title" id="rv-drill-title">🔎 Desglose</span>
          <button class="rv-modal-x" data-drill-close aria-label="Cerrar">✕</button>
        </div>
        <div class="rv-modal-body" id="rv-drill-content"></div>
      </div>
    </div>`;
}

/** Detalle de un módulo (respeta los filtros activos salvo el de módulo). */
function moduleDetailHTML(mod) {
  // Acotado al MISMO mes que la vista: el timeline desde donde se abre está por mes,
  // así que sumar revisiones de otros meses inflaría las cifras del detalle.
  const allRev = store.globalData.filter(isRevisionRow);
  const months = [...new Set(allRev.map(gCor).filter(Boolean).map((c) => monthIndexOfCorrida(+c)).filter((x) => x >= 0))].sort((a, b) => a - b);
  const month = (vState.month != null && months.includes(vState.month)) ? vState.month : (months.length ? months[months.length - 1] : 0);
  const monthSet = new Set(allRev.map(gCor).filter(Boolean).filter((c) => monthIndexOfCorrida(+c) === month));
  const rows = allRev.filter((r) => gMod(r) === mod &&
    (!monthSet.size || monthSet.has(gCor(r))) &&
    inGlobalDate(r) &&
    (!vState.corrida || gCor(r) === vState.corrida) &&
    (!vState.siembra || gSiem(r) === vState.siembra));
  if (!rows.length) return '<div class="empty-state">Sin revisiones para este módulo con los filtros actuales.</div>';
  const sups = [...new Set(rows.map(gSup).filter(Boolean))];
  const deform = avg(rows.map((r) => parseNum(r, K.deformidad)).filter((v) => v !== null));
  const atraso = avg(rows.map((r) => parseNum(r, K.atraso)).filter((v) => v !== null));
  const protusion = avg(rows.map((r) => parseNum(r, K.protusion)).filter((v) => v !== null));
  const noviables = avg(rows.map((r) => parseNum(r, K.noviables)).filter((v) => v !== null));
  const findings = multiCounts(rows, K.observaciones).slice(0, 8);
  const actions = multiCounts(rows, K.accion).slice(0, 8);
  const vacias = avg(rows.map((r) => parseNum(r, K.vacias)).filter((v) => v !== null));
  const comments = rows.filter(hasComment).sort((a, b) => (parseAnyDate(gFec(b)) || 0) - (parseAnyDate(gFec(a)) || 0));
  const chips = (arr) => arr.length ? arr.map(([k, c]) => `<span class="rv-det-chip">${esc(k)} <b>${c}</b></span>`).join('') : '<span class="muted">—</span>';
  return `
    <div class="rv-kpis rv-det-kpis">
      ${kpi('📋', 'Revisiones', rows.length)}
      ${kpi('👤', 'Supervisores', sups.length)}
      ${kpi('🧬', 'Deformidad prom.', fmtPct(deform))}
      ${kpi('⏳', 'Atraso prom.', fmtPct(atraso))}
      ${kpi('🩹', 'Protusión prom.', fmtPct(protusion))}
      ${noviables !== null ? kpi('💀', 'No viables prom.', fmtPct(noviables)) : ''}
      ${vacias !== null ? kpi('🕳️', 'Vacías prom.', fmtPct(vacias)) : ''}
      ${kpi('💬', 'Comentarios', comments.length)}
    </div>
    <div class="rv-det-sec">🔬 Hallazgos frecuentes</div><div class="rv-det-chips">${chips(findings)}</div>
    <div class="rv-det-sec">🛠️ Acciones recomendadas</div><div class="rv-det-chips">${chips(actions)}</div>
    <div class="rv-det-sec">💬 Comentarios (${comments.length})</div>
    <div class="rv-det-comments">${comments.length
      ? comments.map((r) => `<div class="rv-hist-item"><span class="rv-hist-date">${dateOf(r)}</span><div class="rv-hist-meta">${esc(gSup(r) || '')}${gCor(r) ? ' · C' + esc(gCor(r)) : ''}</div>${commentBlocks(r)}</div>`).join('')
      : '<div class="muted" style="padding:8px">Sin comentarios.</div>'}</div>`;
}

/** Filtros en cascada (Corrida → Módulo → Siembra) + lista de comentarios. */
function histContentHTML() {
  const allRev = store.globalData.filter(isRevisionRow);

  const corridas = [...new Set(allRev.map(gCor).filter(Boolean))].sort(numCmp);
  if (histSel.corrida && !corridas.includes(histSel.corrida)) histSel.corrida = '';
  const byCorr = allRev.filter((r) => !histSel.corrida || gCor(r) === histSel.corrida);

  const mods = [...new Set(byCorr.map(gMod).filter(Boolean))].sort(natCmp);
  if (histSel.mod && !mods.includes(histSel.mod)) histSel.mod = '';
  const byMod = byCorr.filter((r) => !histSel.mod || gMod(r) === histSel.mod);

  const siembras = [...new Set(byMod.map(gSiem).filter(Boolean))].sort(numCmp);
  if (histSel.siembra && !siembras.includes(histSel.siembra)) histSel.siembra = '';

  const opt = (val, cur, ph) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(val || ph)}</option>`;
  const sel = (dim, label, values, cur, ph) => `<label class="rv-hist-field">
      <span>${label}</span>
      <select class="rv-select" data-hist-sel="${dim}">
        ${opt('', cur, ph)}${values.map((v) => opt(String(v), cur, ph)).join('')}
      </select>
    </label>`;

  return `<div class="rv-hist-filters">
      ${sel('corrida', 'Corrida', corridas.map(String), histSel.corrida, 'Todas')}
      ${sel('mod', 'Módulo', mods, histSel.mod, 'Todos')}
      ${sel('siembra', 'Siembra', siembras, histSel.siembra, 'Todas')}
    </div>
    <div id="rv-hist-list">${histListHTML()}</div>`;
}

function histRows() {
  return store.globalData.filter(isRevisionRow)
    .filter((r) => hasComment(r) &&
      (!histSel.mod || gMod(r) === histSel.mod) &&
      (!histSel.siembra || gSiem(r) === histSel.siembra) &&
      (!histSel.corrida || gCor(r) === histSel.corrida))
    .sort((a, b) => (parseAnyDate(gFec(b)) || new Date(0)) - (parseAnyDate(gFec(a)) || new Date(0)));
}

function histListHTML() {
  const list = histRows();
  if (!list.length) return `<div class="empty-state" style="padding:30px">Sin comentarios para la combinación elegida.</div>`;
  return `<div class="rv-hist-count">${list.length} comentario(s)</div>` + list.map((r) => `
    <div class="rv-hist-item">
      <span class="rv-hist-date">${dateOf(r)}</span>
      <div class="rv-hist-meta">${esc(gMod(r) || '')}${gCor(r) ? ' · C' + esc(gCor(r)) : ''}${gSiem(r) ? ' · ' + esc(gSiem(r)) : ''}</div>
      ${commentBlocks(r)}
    </div>`).join('');
}

/* ============================================================
   HELPERS de presentación
   ============================================================ */
function kpi(icon, label, value) {
  return `<div class="rv-kpi">
    <div class="rv-kpi-label">${icon} ${esc(label)}</div>
    <div class="rv-kpi-value">${esc(String(value))}</div>
  </div>`;
}

function rvSelect(dim, value, values, placeholder) {
  return `<select class="rv-select" data-rvfilter="${dim}">
      <option value="">${esc(placeholder)}</option>
      ${values.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
}


const empty = () => `<div class="empty-state" style="padding:24px">Sin datos.</div>`;

/* ============================================================
   EVENTOS (delegados, vinculados una vez)
   ============================================================ */
function openHist() { const m = document.getElementById('rv-hist-modal'); if (m) { m.classList.add('rv-open'); document.body.classList.add('modal-open'); } }
function closeHist() { const m = document.getElementById('rv-hist-modal'); if (m) { m.classList.remove('rv-open'); document.body.classList.remove('modal-open'); } }

/** Selecciona una cinta del Sankey (clic o teclado): muestra el % y la resalta. */
function selectSankey(root, sk) {
  const info = document.getElementById('rv-sankey-info');
  if (info) info.innerHTML = `<b>${esc(sk.dataset.skObs)}</b> → <b>${esc(sk.dataset.skAct)}</b> · ${sk.dataset.skC} vez(ces) · <b>${sk.dataset.skPct}%</b> de los casos de “${esc(sk.dataset.skObs)}”`;
  root.querySelectorAll('.rv-sk-flow').forEach((p) => p.classList.toggle('is-sel', p === sk));
}

function bind(root) {
  if (root._rvBound) return;
  root._rvBound = true;

  // Escape cierra el modal abierto (historial/módulo/día/desglose) vía su backdrop.
  registerModalEscape('.rv-modal.rv-open');

  root.addEventListener('click', (e) => {
    // Cerrar ventana al pulsar el fondo
    if (e.target.id === 'rv-hist-modal') { closeHist(); return; }
    if (e.target.closest('[data-hist-close]')) { closeHist(); return; }
    if (e.target.closest('[data-hist-open]')) { openHist(); return; }

    // Sankey: seleccionar una conexión muestra el % (hallazgo → acción)
    const sk = e.target.closest('[data-sk-obs]');
    if (sk) { selectSankey(root, sk); return; }

    // Drill-down de Calidad (tile → niveles por módulo)
    const ql = e.target.closest('[data-drillqual]');
    if (ql) { const lbl = ql.dataset.drillqual; openDrillCalidad(lbl, CALIDAD_KEYS[lbl], getFilteredRows()); return; }

    // Drill-down por categoría desde el treemap (#14)
    const tm = e.target.closest('[data-drillval]');
    if (tm) {
      const type = tm.dataset.drilltype;
      openDrill(type, tm.dataset.drillval, type === 'Acción' ? K.accion : K.observaciones, getFilteredRows());
      return;
    }

    // Drill-down por módulo (RV2)
    const md = e.target.closest('[data-moddetail]');
    if (md) {
      const mod = md.dataset.moddetail;
      const titleEl = document.getElementById('rv-mod-title');
      const contentEl = document.getElementById('rv-mod-content');
      if (titleEl) titleEl.textContent = `🏭 Detalle · ${mod}`;
      if (contentEl) contentEl.innerHTML = moduleDetailHTML(mod);
      const m = document.getElementById('rv-mod-modal');
      if (m) { m.classList.add('rv-open'); document.body.classList.add('modal-open'); }
      return;
    }
    if (e.target.id === 'rv-mod-modal' || e.target.closest('[data-mod-close]')) {
      const m = document.getElementById('rv-mod-modal');
      if (m) { m.classList.remove('rv-open'); document.body.classList.remove('modal-open'); }
      return;
    }

    // Celda de Cobertura (módulo × día) → ventana con las revisiones de ese día
    const dc = e.target.closest('[data-daycell]');
    if (dc) { openDayCell(dc.dataset.daycell, dc.dataset.daykey, dc.dataset.daylabel); return; }
    if (e.target.id === 'rv-daycell-modal' || e.target.closest('[data-daycell-close]')) { closeDayCell(); return; }

    // Cerrar el drill-down por categoría (#14)
    if (e.target.id === 'rv-drill-modal' || e.target.closest('[data-drill-close]')) {
      const m = document.getElementById('rv-drill-modal');
      if (m) { m.classList.remove('rv-open'); document.body.classList.remove('modal-open'); }
      return;
    }

    // Desplegar bitácora
    const tog = e.target.closest('[data-bita-toggle]');
    if (tog) {
      const exp = tog.getAttribute('aria-expanded') === 'true';
      root.querySelectorAll('.rv-bita-hidden').forEach((tr) => tr.classList.toggle('rv-bita-show', !exp));
      tog.setAttribute('aria-expanded', String(!exp));
      const total = root.querySelectorAll('.rv-table tbody tr').length;
      tog.textContent = exp ? `Ver historial completo (${total})` : 'Ocultar historial';
      return;
    }

    // Pills de la comparativa de periodos
    const cmp = e.target.closest('[data-cmp-days]');
    if (cmp) { pState.cmpDays = +cmp.dataset.cmpDays; revisionesView(root); return; }

    // Barra de mes (navega entre meses presentes; resetea corrida/módulo).
    const mnav = e.target.closest('[data-month-nav]');
    if (mnav && !mnav.disabled) {
      const all = store.globalData.filter(isRevisionRow);
      const ms = [...new Set(all.map(gCor).filter(Boolean).map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
      const ni = ms.indexOf(vState.month) + Number(mnav.dataset.monthNav);
      if (ni >= 0 && ni < ms.length) { vState.month = ms[ni]; vState.corrida = null; vState.mod = null; revisionesView(root); }
    }
  });

  // Accesibilidad: tiles de Calidad, celdas del treemap y cintas del Sankey
  // (todas role="button") responden a Enter/Espacio igual que al clic.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const ql = e.target.closest('[data-drillqual]');
    const tm = e.target.closest('[data-drillval]');
    const sk = e.target.closest('[data-sk-obs]');
    const dc = e.target.closest('[data-daycell]');
    if (!ql && !tm && !sk && !dc) return;
    e.preventDefault();
    if (ql) openDrillCalidad(ql.dataset.drillqual, CALIDAD_KEYS[ql.dataset.drillqual], getFilteredRows());
    else if (tm) { const type = tm.dataset.drilltype; openDrill(type, tm.dataset.drillval, type === 'Acción' ? K.accion : K.observaciones, getFilteredRows()); }
    else if (sk) selectSankey(root, sk);
    else if (dc) openDayCell(dc.dataset.daycell, dc.dataset.daykey, dc.dataset.daylabel);
  });

  // Selects → filtros de la vista (corrida/módulo) y de la ventana de historial.
  root.addEventListener('change', (e) => {
    const f = e.target.closest('[data-rvfilter]');
    if (f) { vState[f.dataset.rvfilter] = f.value || null; revisionesView(root); return; }
    const dcs = e.target.closest('[data-daycell-sup]');
    if (dcs) {
      dayCellSel.sup = dcs.value;
      const c = document.getElementById('rv-daycell-content');
      if (c) c.innerHTML = dayCellContentHTML();
      return;
    }
    const s = e.target.closest('[data-hist-sel]');
    if (!s) return;
    histSel[s.dataset.histSel] = s.value;
    const content = document.getElementById('rv-hist-content');
    if (content) content.innerHTML = histContentHTML();
  });
}
