/* ============================================================
   ALGAS · Laboratorio de microalgas (hoja Lab_Algas)
   TANDA 1: capa de datos + barra de mes + barra de filtros (cascada)
   + KPIs + tabla de validación. Los gráficos por categoría de sistema
   y la sección de análisis llegan en las siguientes tandas.

   Datos (19 columnas A–S de Lab_Algas): Fecha · Corrida_Larv · Modulo_Larv ·
   Área_Algas · Sistema · Lote · Dia_Proceso · Cel_ml · Protozoarios · Especie ·
   Salinidad_ppt · pH · Temperatura_C · Intensidad_Luz_% · Descartado ·
   Observaciones · Ciliados · Filamentosos · Técnico.
   ============================================================ */
import { store } from '../../core/store.js';
import { destroyAllCharts } from '../../core/charts.js';
import { getField, parseNum } from '../../core/fields.js';
import { parseAnyDate, fmtShort } from '../../core/dates.js';
import { esc } from '../../core/format.js';
import { monthIndexOfCorrida, monthLabelAt } from '../supervisor/prodOmarsa.js';
import { drawGrowth, drawGrowthBar, drawVelocity, drawProto, drawDaily, drawUsoSistema, CAT_COLOR } from './charts.js';

// ── Acceso tolerante a las cabeceras de Lab_Algas ──
const AF = {
  fecha:        ['Fecha', 'fecha'],
  corrida:      ['Corrida_Larv', 'Corrida_larv', 'corrida_larv', 'Corrida', 'corrida'],
  modulo:       ['Modulo_Larv', 'Módulo_Larv', 'modulo_larv', 'Modulo', 'Módulo'],
  area:         ['Área_Algas', 'Area_Algas', 'área_algas', 'area_algas', 'Área', 'Area'],
  sistema:      ['Sistema', 'sistema'],
  lote:         ['Lote', 'lote'],
  dia:          ['Dia_Proceso', 'Día_Proceso', 'dia_proceso', 'Dia proceso', 'Día de proceso'],
  cel:          ['Cel_ml', 'Cel/ml', 'cel_ml', 'Cel_mL', 'Cel/mL'],
  protozoarios: ['Protozoarios', 'protozoarios'],
  especie:      ['Especie', 'especie'],
  salinidad:    ['Salinidad_ppt', 'Salinidad', 'salinidad_ppt', 'salinidad'],
  ph:           ['pH', 'PH', 'ph', 'Ph'],
  temp:         ['Temperatura_C', 'Temperatura', 'temperatura_c', 'Temp'],
  luz:          ['Intensidad_Luz_%', 'Intensidad_Luz', 'intensidad_luz_%', 'Intensidad de Luz'],
  descartado:   ['Descartado', 'descartado'],
  obs:          ['Observaciones', 'observaciones', 'Observación', 'observación'],
  ciliados:     ['Ciliados', 'ciliados'],
  filamentosos: ['Filamentosos', 'filamentosos'],
  tecnico:      ['Técnico', 'Tecnico', 'técnico', 'tecnico'],
};

const isAlgaeRow = (r) => r && r._SheetOrigin === 'Lab_Algas';
const g = (r, key) => getField(r, AF[key]);
const num = (r, key) => parseNum(r, AF[key]);

// ── Categoría de sistema de cultivo (mapeo confirmado con el laboratorio) ──
// PBR · PM*→Premasivos · FM/FP→Fundas · C#→Carboys · M#→Masivos.
export const SYS_CATS = ['Masivos', 'Premasivos', 'Fundas', 'Carboys', 'PBR'];
export function sysCat(sistema) {
  const s = String(sistema || '').trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('PBR')) return 'PBR';
  if (s.startsWith('PM')) return 'Premasivos';
  if (s === 'FM' || s === 'FP' || /^F/.test(s)) return 'Fundas';
  if (/^C\d/.test(s)) return 'Carboys';
  if (/^M\d/.test(s)) return 'Masivos';
  return 'Otros';
}

// Nombre completo de especie (abreviaturas del laboratorio).
const ESPECIE = { TW: 'Thalassiosira weissflogii', IS: 'Isochrysis', TT: 'Tetraselmis', CH: 'Chaetoceros' };
const especieLabel = (e) => { const k = String(e || '').trim().toUpperCase(); return ESPECIE[k] ? `${e} · ${ESPECIE[k]}` : (e || '—'); };

const natCmp = (a, b) => { const x = String(a).match(/\d+/), y = String(b).match(/\d+/); return (x && y && +x[0] !== +y[0]) ? +x[0] - +y[0] : String(a).localeCompare(String(b)); };
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const fmtK = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(Math.round(v));
};
const isDescartado = (r) => /^s[ií]$/i.test(String(g(r, 'descartado')).trim());
const dCell = (r) => { const d = parseAnyDate(g(r, 'fecha')); return d ? fmtShort(d) : esc(g(r, 'fecha') || '—'); };
const cellTxt = (v) => (v === '' || v === null || v === undefined) ? '<span class="muted">—</span>' : esc(v);

// Estado persistente entre re-render. `sub` = subvista de sistema (pestaña activa).
const vState = { month: null, corrida: null, especie: null, sub: null };
const BITA_VISIBLE = 6; // observaciones visibles antes de desplegar
const REG_VISIBLE = 10; // registros visibles antes de desplegar

/* ============================================================
   Construcción de series para los gráficos
   ============================================================ */
const GROWTH_MAX = 14; // máx. lotes (líneas) para no saturar la curva

/** Serie diaria (promedio por fecha) de una variable. */
function dailySeries(rows, key) {
  const byDay = new Map();
  rows.forEach((r) => { const f = g(r, 'fecha'); const v = num(r, key); if (!f || v === null) return; if (!byDay.has(f)) byDay.set(f, []); byDay.get(f).push(v); });
  const days = [...byDay.keys()].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  return { days, values: days.map((d) => { const a = byDay.get(d); return a.reduce((x, y) => x + y, 0) / a.length; }) };
}

/** Varias variables en el MISMO eje de días (promedio por fecha; null si falta). */
function dailyMulti(rows, keys) {
  const dayset = new Set(); const per = {}; keys.forEach((k) => (per[k] = new Map()));
  rows.forEach((r) => { const f = g(r, 'fecha'); if (!f) return; keys.forEach((k) => { const v = num(r, k); if (v !== null) { dayset.add(f); if (!per[k].has(f)) per[k].set(f, []); per[k].get(f).push(v); } }); });
  const days = [...dayset].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const series = {};
  keys.forEach((k) => { series[k] = days.map((d) => { const a = per[k].get(d); return a ? a.reduce((x, y) => x + y, 0) / a.length : null; }); });
  return { days, series };
}

/** Lotes con sus puntos (día de proceso → Cel/ml). Día = Dia_Proceso si existe,
 *  si no se deriva de la fecha relativa al primer día del lote. Clave = sistema·Lote. */
function growthByLote(rows) {
  const byLote = new Map();
  rows.forEach((r) => {
    const cel = num(r, 'cel'); if (cel === null) return;
    // Unidad de la línea: el LOTE si existe; si no (p.ej. Masivos, que no usan lote),
    // el propio SISTEMA. Así los masivos sí dibujan su curva por día de proceso.
    const lote = g(r, 'lote'); const sis = g(r, 'sistema') || '?';
    const key = lote ? `${sis}·L${lote}` : sis;
    if (!byLote.has(key)) byLote.set(key, []);
    byLote.get(key).push({ dia: num(r, 'dia'), d: parseAnyDate(g(r, 'fecha')), cel });
  });
  const lotes = [];
  byLote.forEach((pts, key) => {
    const times = pts.map((p) => (p.d ? p.d.getTime() : null)).filter((x) => x !== null);
    const minMs = times.length ? Math.min(...times) : null;
    const byDay = new Map();
    pts.forEach((p) => {
      let day = p.dia;
      if (day === null || day === undefined || isNaN(day)) day = (p.d && minMs !== null) ? Math.round((p.d.getTime() - minMs) / 86400000) : 0;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(p.cel);
    });
    const points = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, arr]) => ({ day, cel: arr.reduce((x, y) => x + y, 0) / arr.length }));
    lotes.push({ key, points });
  });
  lotes.sort((a, b) => natCmp(a.key, b.key));
  return lotes.slice(0, GROWTH_MAX);
}

/** Datos de la curva de crecimiento (eje día + serie por lote). */
function growthChartData(lotes) {
  const dayset = new Set(); lotes.forEach((l) => l.points.forEach((p) => dayset.add(p.day)));
  const days = [...dayset].sort((a, b) => a - b);
  const series = lotes.map((l) => { const m = new Map(l.points.map((p) => [p.day, p.cel])); return { label: l.key, data: days.map((d) => (m.has(d) ? m.get(d) : null)) }; });
  return { days, dayLabels: days.map((d) => 'Día ' + d), series };
}

/** Estadísticas del período (de la subvista activa). */
function periodStats(rows) {
  const cel = rows.map((r) => num(r, 'cel')).filter((v) => v !== null);
  const proto = rows.map((r) => num(r, 'protozoarios')).filter((v) => v !== null);
  const sal = rows.map((r) => num(r, 'salinidad')).filter((v) => v !== null);
  const ph = rows.map((r) => num(r, 'ph')).filter((v) => v !== null);
  const t = rows.map((r) => parseAnyDate(g(r, 'fecha'))).filter(Boolean).map((d) => d.getTime());
  return {
    n: rows.length,
    lotes: new Set(rows.map((r) => g(r, 'lote')).filter(Boolean)).size,
    sistemas: new Set(rows.map((r) => g(r, 'sistema')).filter(Boolean)).size,
    densMin: cel.length ? Math.min(...cel) : null, densAvg: avg(cel), densMax: cel.length ? Math.max(...cel) : null,
    protoAvg: avg(proto), protoAlert: proto.filter((v) => v >= 5).length,
    salAvg: avg(sal), phAvg: avg(ph),
    from: t.length ? new Date(Math.min(...t)) : null, to: t.length ? new Date(Math.max(...t)) : null,
  };
}

/** Velocidad de crecimiento (% por día) por lote, alineada al eje de días. */
function velocityChartData(lotes, days, dayLabels) {
  const series = lotes.map((l) => {
    const velByDay = new Map();
    for (let i = 1; i < l.points.length; i++) { const prev = l.points[i - 1].cel, cur = l.points[i].cel; if (prev > 0) velByDay.set(l.points[i].day, (cur - prev) / prev * 100); }
    return { label: l.key, data: days.map((d) => (velByDay.has(d) ? velByDay.get(d) : null)) };
  });
  return { dayLabels, series };
}

/* ============================================================
   VISTA
   ============================================================ */
export function algasView(root) {
  if (!store.globalData.length) {
    root.innerHTML = `<div class="empty-state">📡 Conectando… cargando datos del sistema.</div>`;
    return;
  }
  destroyAllCharts();
  // Se re-renderiza por filtros/mes sin pasar por el router → limpiar overlays huérfanos.
  document.body.classList.remove('modal-open', 'dropdown-open');

  const all = store.globalData.filter(isAlgaeRow);
  if (!all.length) {
    root.innerHTML = headHTML(0)
      + `<div class="empty-state">No se encontraron registros en la hoja <b>Lab_Algas</b> del Google Sheet.</div>`;
    bind(root);
    return;
  }

  // ── Barra de mes (corrida→mes, alineada con Supervisor/Larvicultura) ──
  const allCorridas = [...new Set(all.map((r) => g(r, 'corrida')).filter(Boolean))];
  const months = [...new Set(allCorridas.map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (vState.month == null || !months.includes(vState.month)) vState.month = months.length ? months[months.length - 1] : 0;
  const monthCorridas = allCorridas.filter((c) => monthIndexOfCorrida(+c) === vState.month).sort((a, b) => (+a) - (+b));
  const monthSet = new Set(monthCorridas);
  const inMonth = (r) => !monthSet.size || monthSet.has(g(r, 'corrida'));

  // ── Filtros: Corrida + Especie (el SISTEMA es una subvista, no un filtro) ──
  const corridas = monthCorridas;
  if (vState.corrida && !corridas.includes(vState.corrida)) vState.corrida = null;
  const especies = [...new Set(all.filter(inMonth).map((r) => g(r, 'especie')).filter(Boolean))].sort();
  if (vState.especie && !especies.includes(vState.especie)) vState.especie = null;

  const baseRows = all.filter((r) => inMonth(r) && (!vState.corrida || g(r, 'corrida') === vState.corrida) && (!vState.especie || g(r, 'especie') === vState.especie));

  // ── Subvistas por sistema (pestañas; no es un filtro) ──
  const subsPresent = SYS_CATS.filter((c) => baseRows.some((r) => sysCat(g(r, 'sistema')) === c));
  if (!vState.sub || !subsPresent.includes(vState.sub)) vState.sub = subsPresent[0] || null;
  const rows = baseRows.filter((r) => sysCat(g(r, 'sistema')) === vState.sub);

  // ── HTML ──
  let h = headHTML(baseRows.length);

  h += `<div class="alg-filters">
      <div class="alg-monthbar">
        <button class="alg-month-nav" data-month-nav="-1" ${months.indexOf(vState.month) <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
        <span class="alg-month-lbl">📅 ${esc(monthLabelAt(vState.month))}</span>
        <button class="alg-month-nav" data-month-nav="1" ${months.indexOf(vState.month) >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
      </div>
      ${algSelect('corrida', vState.corrida, corridas, 'Todas las corridas')}
      ${algSelect('especie', vState.especie, especies, 'Todas las especies')}
    </div>`;

  // Subnav: una pestaña por sistema (Masivos/Premasivos/PBR/Fundas/Carboys).
  h += `<div class="alg-subnav" role="tablist">${subsPresent.length
    ? subsPresent.map((c) => `<button class="alg-pill ${c === vState.sub ? 'is-active' : ''}" data-alg-sub="${esc(c)}" style="--cat:${CAT_COLOR[c]}"><span class="alg-pill-dot"></span>${esc(c)}</button>`).join('')
    : '<span class="muted">Sin sistemas con datos en el mes.</span>'}</div>`;

  // ── KPIs de la subvista activa ──
  const densProm = avg(rows.map((r) => num(r, 'cel')).filter((v) => v !== null));
  const protoAlert = rows.map((r) => num(r, 'protozoarios')).filter((v) => v !== null).filter((v) => v >= 5).length;
  h += `<div class="alg-kpis">
      ${kpi('📋', 'Registros', String(rows.length))}
      ${kpi('🔬', 'Densidad prom.', densProm === null ? '—' : fmtK(densProm) + ' cel/ml')}
      ${kpi('🦠', 'Protozoarios ≥ 5', `${protoAlert}`, protoAlert > 0)}
      ${kpi('🧫', 'Lotes', String(new Set(rows.map((r) => g(r, 'lote')).filter(Boolean)).size))}
      ${kpi('⚙️', 'Sistemas', String(new Set(rows.map((r) => g(r, 'sistema')).filter(Boolean)).size))}
      ${kpi('🗑️', 'Descartados', String(rows.filter(isDescartado).length))}
    </div>`;

  // ── Datos + gráficos de la subvista ──
  const isBarCat = vState.sub === 'Fundas' || vState.sub === 'Carboys'; // sin tendencia → barras
  const isPBR = vState.sub === 'PBR';
  const catColor = CAT_COLOR[vState.sub] || '#2E7D32';
  const growthLotes = growthByLote(rows);
  const gd = growthChartData(growthLotes);
  const vd = velocityChartData(growthLotes, gd.days, gd.dayLabels);
  const barLabels = growthLotes.map((l) => l.key);
  const barValues = growthLotes.map((l) => Math.max(...l.points.map((p) => p.cel)));
  const proto = dailyMulti(rows, ['protozoarios', 'ciliados', 'filamentosos']);
  const sal = dailySeries(rows, 'salinidad');
  const ph = dailySeries(rows, 'ph');
  const luz = dailySeries(rows, 'luz');
  const stats = periodStats(rows);

  const host = (id, has) => has ? `<canvas id="${id}"></canvas>` : '<div class="empty-state" style="padding:24px">Sin datos para esta subvista.</div>';
  h += `<div class="alg-an-row">
      <div class="card alg-chart-card"><div class="alg-chart-title">📈 Curva de Crecimiento — Densidad Celular ${isBarCat ? '<span class="muted">· por lote (sin tendencia → barras)</span>' : '<span class="muted">· por día · línea = lote</span>'}</div><div class="alg-chart-host alg-host-lg">${host('algGrowth', growthLotes.length > 0)}</div></div>
      <div class="card alg-chart-card"><div class="alg-chart-title">📊 Estadísticas del Período <span class="muted">· ${esc(vState.sub || '')}</span></div><div class="alg-stats">${statsHTML(stats)}</div></div>
    </div>
    <div class="alg-charts">
      ${!isBarCat ? `<div class="card alg-chart-card"><div class="alg-chart-title">⚡ Velocidad de Crecimiento <span class="muted">· % por día</span></div><div class="alg-chart-host">${host('algVel', growthLotes.length > 0)}</div></div>` : ''}
      <div class="card alg-chart-card"><div class="alg-chart-title">🦠 Protozoarios · Ciliados · Filamentosos <span class="muted">· límite 5</span></div><div class="alg-chart-host">${host('algProto', proto.days.length > 0)}</div></div>
      <div class="card alg-chart-card"><div class="alg-chart-title">🧂 Salinidad <span class="muted">· ppt</span></div><div class="alg-chart-host">${host('algSal', sal.days.length > 0)}</div></div>
      <div class="card alg-chart-card"><div class="alg-chart-title">⚗️ pH</div><div class="alg-chart-host">${host('algPh', ph.days.length > 0)}</div></div>
      ${isPBR ? `<div class="card alg-chart-card"><div class="alg-chart-title">💡 Intensidad de luz <span class="muted">· %</span></div><div class="alg-chart-host">${host('algLuz', luz.days.length > 0)}</div></div>` : ''}
    </div>`;

  // ── Análisis del mes (independiente del drill-down: responde preguntas del mes) ──
  const monthRows = all.filter(inMonth);
  const sisCount = new Map();
  monthRows.forEach((r) => { const s = g(r, 'sistema'); if (s) sisCount.set(s, (sisCount.get(s) || 0) + 1); });
  const uso = [...sisCount.entries()].sort((a, b) => b[1] - a[1]);
  const usoLabels = uso.map((e) => e[0]);
  const usoValues = uso.map((e) => e[1]);
  const usoColors = usoLabels.map((s) => CAT_COLOR[sysCat(s)] || '#90A4AE');

  // Matriz Corrida × Categoría: biomasa = Σ Cel/ml (Opción 1) + nº de registros (Opción 3).
  const catsPresent = SYS_CATS.filter((c) => monthRows.some((r) => sysCat(g(r, 'sistema')) === c));
  const cellM = {}, corTot = {}, catTot = {};
  monthRows.forEach((r) => {
    const cor = g(r, 'corrida'), cat = sysCat(g(r, 'sistema')), cel = num(r, 'cel');
    if (!cor || !catsPresent.includes(cat)) return;
    const k = cor + '|' + cat;
    cellM[k] = cellM[k] || { cel: 0, n: 0 };
    cellM[k].n++;
    if (cel !== null) { cellM[k].cel += cel; corTot[cor] = (corTot[cor] || 0) + cel; catTot[cat] = (catTot[cat] || 0) + cel; }
  });
  let grand = 0; Object.values(catTot).forEach((v) => (grand += v));
  const mxCell = (o) => o ? `<b>${fmtK(o.cel)}</b> <span class="alg-mx-n">·${o.n}</span>` : '<span class="muted">—</span>';
  const matrixTable = `<table class="alg-table alg-matrix">
      <thead><tr><th>Corrida</th>${catsPresent.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        ${monthCorridas.map((cor) => `<tr><td><b>C${esc(cor)}</b></td>${catsPresent.map((c) => `<td style="text-align:right">${mxCell(cellM[cor + '|' + c])}</td>`).join('')}<td style="text-align:right"><b>${fmtK(corTot[cor] || 0)}</b></td></tr>`).join('')}
        <tr class="alg-mx-total"><td><b>Total</b></td>${catsPresent.map((c) => `<td style="text-align:right"><b>${fmtK(catTot[c] || 0)}</b></td>`).join('')}<td style="text-align:right"><b>${fmtK(grand)}</b></td></tr>
      </tbody>
    </table>`;

  h += `<div class="alg-section-title">📊 Análisis del mes <span class="muted" style="font-weight:600;font-size:12px">· ${esc(monthLabelAt(vState.month))}</span></div>
    <div class="alg-charts">
      <div class="card alg-chart-card"><div class="alg-chart-title">⚙️ ¿Qué sistema se hace más? <span class="muted">· nº de registros</span></div><div class="alg-chart-host" style="height:${Math.max(220, usoLabels.length * 22 + 36)}px">${usoLabels.length ? '<canvas id="algUso"></canvas>' : '<div class="empty-state" style="padding:24px">Sin datos del mes.</div>'}</div></div>
      <div class="card alg-chart-card"><div class="alg-chart-title">🧪 Biomasa por corrida × categoría <span class="muted">· Σ Cel/ml · ·n = registros</span></div><div class="alg-table-wrap" style="max-height:300px">${catsPresent.length ? matrixTable : '<div class="empty-state" style="padding:24px">Sin datos del mes.</div>'}</div></div>
    </div>`;

  // ── Bitácora de observaciones (plegable · recientes) ──
  const obsRows = rows.filter((r) => g(r, 'obs')).sort((a, b) => (parseAnyDate(g(b, 'fecha')) || 0) - (parseAnyDate(g(a, 'fecha')) || 0));
  const obsHead = '<tr><th>Fecha</th><th>Sistema</th><th>Lote</th><th>Día</th><th>Observación</th><th>Técnico</th></tr>';
  const obsCells = obsRows.map((r) => `<td>${dCell(r)}</td><td><b>${cellTxt(g(r, 'sistema'))}</b></td><td>${cellTxt(g(r, 'lote'))}</td><td>${cellTxt(g(r, 'dia'))}</td><td style="white-space:normal">${cellTxt(g(r, 'obs'))}</td><td>${cellTxt(g(r, 'tecnico'))}</td>`);
  h += collapsibleCard('📝', 'Bitácora de observaciones', obsHead, obsCells, BITA_VISIBLE, 'Sin observaciones para esta subvista.');

  // ── Registros (plegable · recientes) ──
  const sortedRows = [...rows].sort((a, b) => (parseAnyDate(g(b, 'fecha')) || 0) - (parseAnyDate(g(a, 'fecha')) || 0));
  const numCell = (v) => (v === null) ? '<span class="muted">—</span>' : esc(fmtK(v));
  const regHead = '<tr>' + ['Fecha', 'Corrida', 'Sistema', 'Área', 'Lote', 'Día', 'Cel/ml', 'Protoz.', 'Especie', 'Sal.', 'pH', 'Técnico'].map((x) => `<th>${x}</th>`).join('') + '</tr>';
  const regCells = sortedRows.map((r) => `<td>${dCell(r)}</td><td>${cellTxt(g(r, 'corrida'))}</td><td><b>${cellTxt(g(r, 'sistema'))}</b></td><td>${cellTxt(g(r, 'area'))}</td><td>${cellTxt(g(r, 'lote'))}</td><td>${cellTxt(g(r, 'dia'))}</td><td style="text-align:right">${numCell(num(r, 'cel'))}</td><td style="text-align:center">${cellTxt(g(r, 'protozoarios'))}</td><td>${cellTxt(g(r, 'especie'))}</td><td style="text-align:right">${cellTxt(g(r, 'salinidad'))}</td><td style="text-align:right">${cellTxt(g(r, 'ph'))}</td><td>${cellTxt(g(r, 'tecnico'))}</td>`);
  h += collapsibleCard('📋', 'Registros · ' + (vState.sub || ''), regHead, regCells, REG_VISIBLE, 'Sin registros para esta subvista.');

  root.innerHTML = h;

  // Dibujo aislado: el fallo de un gráfico no rompe los demás.
  const draw = (fn) => { try { fn(); } catch (e) { console.error('[algas] chart', e); } };
  if (growthLotes.length) {
    if (isBarCat) draw(() => drawGrowthBar('algGrowth', barLabels, barValues, catColor));
    else { draw(() => drawGrowth('algGrowth', gd.dayLabels, gd.series)); draw(() => drawVelocity('algVel', vd.dayLabels, vd.series)); }
  }
  if (proto.days.length) draw(() => drawProto('algProto', proto.days, proto.series.protozoarios, proto.series.ciliados, proto.series.filamentosos));
  if (sal.days.length) draw(() => drawDaily('algSal', sal.days, sal.values, 'Salinidad', '#00838F', ' ppt'));
  if (ph.days.length) draw(() => drawDaily('algPh', ph.days, ph.values, 'pH', '#6A1B9A'));
  if (isPBR && luz.days.length) draw(() => drawDaily('algLuz', luz.days, luz.values, 'Intensidad de luz', '#F9A825', '%'));
  if (usoLabels.length) draw(() => drawUsoSistema('algUso', usoLabels, usoValues, usoColors));

  bind(root);
}

/* ============================================================
   HTML helpers
   ============================================================ */
function headHTML(n) {
  return `<div class="alg-head">
      <div>
        <div class="alg-title"><span class="alg-title-ic">🌿</span> Algas · Laboratorio de microalgas</div>
        <div class="alg-sub">Cultivos por corrida y sistema · ${n} registro(s)</div>
      </div>
    </div>`;
}

function algSelect(dim, value, values, placeholder) {
  return `<select class="alg-select" data-algfilter="${dim}">
      <option value="">${esc(placeholder)}</option>
      ${values.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(dim === 'especie' ? especieLabel(o) : o)}</option>`).join('')}
    </select>`;
}

function kpi(icon, label, value, alert = false) {
  return `<div class="alg-kpi${alert ? ' is-alert' : ''}">
      <div class="alg-kpi-label">${icon} ${esc(label)}</div>
      <div class="alg-kpi-value">${esc(value)}</div>
    </div>`;
}

/** Panel "Estadísticas del Período" (lista de pares etiqueta/valor). */
function statsHTML(s) {
  const dens = (v) => (v === null ? '—' : fmtK(v) + ' cel/ml');
  const row = (lbl, val) => `<div class="alg-stat"><span class="alg-stat-lbl">${esc(lbl)}</span><span class="alg-stat-val">${val}</span></div>`;
  return row('Registros', s.n)
    + row('Lotes', s.lotes)
    + row('Sistemas', s.sistemas)
    + row('Densidad mín.', dens(s.densMin))
    + row('Densidad prom.', dens(s.densAvg))
    + row('Densidad máx.', dens(s.densMax))
    + row('Protozoarios prom.', s.protoAvg === null ? '—' : s.protoAvg.toFixed(1))
    + row('Protoz. ≥ 5', `<b style="color:${s.protoAlert > 0 ? 'var(--c-malo,#D64545)' : 'inherit'}">${s.protoAlert}</b>`)
    + row('Salinidad prom.', s.salAvg === null ? '—' : s.salAvg.toFixed(1) + ' ppt')
    + row('pH prom.', s.phAvg === null ? '—' : s.phAvg.toFixed(1))
    + row('Período', `${s.from ? fmtShort(s.from) : '—'} → ${s.to ? fmtShort(s.to) : '—'}`);
}

/** Tarjeta con tabla PLEGABLE: muestra `visibleN` filas y un botón "Ver todo".
 *  `cells` = array de HTML interno de cada fila (sin <tr>). */
function collapsibleCard(icon, title, theadHtml, cells, visibleN, emptyMsg) {
  const total = cells.length;
  const cols = (theadHtml.match(/<th/g) || []).length || 1;
  const hiddenN = Math.max(0, total - visibleN);
  const body = total
    ? cells.map((c, i) => `<tr class="${i >= visibleN ? 'alg-row-hidden' : ''}">${c}</tr>`).join('')
    : `<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:18px">${esc(emptyMsg || 'Sin datos.')}</td></tr>`;
  return `<div class="card alg-collap">
      <div class="alg-collap-head">
        <div class="alg-collap-title">${icon} ${esc(title)} <span class="muted" style="font-weight:600;font-size:12px">· ${total}</span></div>
        ${hiddenN > 0 ? `<button class="alg-toggle" data-alg-toggle aria-expanded="false">Ver todo (${total})</button>` : ''}
      </div>
      <div class="alg-table-wrap" style="max-height:340px">
        <table class="alg-table"><thead>${theadHtml}</thead><tbody>${body}</tbody></table>
      </div>
    </div>`;
}

/* ============================================================
   EVENTOS (delegados, una sola vez)
   ============================================================ */
function bind(root) {
  if (root._algBound) return;
  root._algBound = true;

  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-algfilter]');
    if (!sel) return;
    vState[sel.dataset.algfilter] = sel.value || null;
    algasView(root);
  });

  root.addEventListener('click', (e) => {
    // Pestaña de sistema (subvista)
    const pill = e.target.closest('[data-alg-sub]');
    if (pill) { vState.sub = pill.dataset.algSub; algasView(root); return; }

    // Plegar / desplegar tablas (bitácora · registros)
    const tog = e.target.closest('[data-alg-toggle]');
    if (tog) {
      const card = tog.closest('.alg-collap'); if (!card) return;
      const exp = tog.getAttribute('aria-expanded') === 'true';
      card.querySelectorAll('.alg-row-hidden').forEach((tr) => tr.classList.toggle('alg-row-show', !exp));
      tog.setAttribute('aria-expanded', String(!exp));
      tog.textContent = exp ? `Ver todo (${card.querySelectorAll('tbody tr').length})` : 'Mostrar recientes';
      return;
    }

    // Navegación de mes (resetea la selección dependiente)
    const nav = e.target.closest('[data-month-nav]');
    if (!nav || nav.disabled) return;
    const allRows = store.globalData.filter(isAlgaeRow);
    const ms = [...new Set(allRows.map((r) => g(r, 'corrida')).filter(Boolean).map((c) => monthIndexOfCorrida(+c)).filter((i) => i >= 0))].sort((a, b) => a - b);
    const ni = ms.indexOf(vState.month) + Number(nav.dataset.monthNav);
    if (ni >= 0 && ni < ms.length) {
      vState.month = ms[ni];
      vState.corrida = null; vState.especie = null; vState.sub = null;
      algasView(root);
    }
  });
}
