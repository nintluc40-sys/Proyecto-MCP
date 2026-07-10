/* ============================================================
   SUPERVISOR · Análisis Biométrico LARVIA
   Series biométricas (PL/g, peso, longitud, uniformidades, CV,
   pigmentación) + bitácora desplegable. Enlace a app.larvia.ai.
   ============================================================ */
import { getters } from './stats.js';
import { avg as mean } from '../../core/util.js';
import { colorFor, breadcrumb, fmt1, fmt2, bindModal } from './ui.js';
import { esc } from '../../core/format.js';
import { parseAnyDate } from '../../core/dates.js';
import { getField, parseNum, PLG_KEYS } from '../../core/fields.js';
import { makeChart } from '../../core/charts.js';

const { gMod, gTnq, gCor, gFec } = getters;

const KEYS = {
  id: ['ID de Análisis', 'ID_Analisis', 'id_analisis', 'ID de Analisis', 'ID', 'id'],
  plg: PLG_KEYS,
  peso: ['Peso promedio (mg)', 'Peso_promedio', 'peso_promedio', 'Peso promedio', 'Peso_prom'],
  longitud: ['Longitud promedio (mm)', 'Longitud_promedio', 'longitud_promedio', 'Longitud promedio', 'Long_prom'],
  uPeso: ['Uniformidad de peso', 'Uniformidad_de_peso', 'Uniformidad_peso'],
  uLong: ['Uniformidad de longitud', 'Uniformidad_de_longitud', 'Uniformidad_longitud'],
  cvPeso: ['CV de peso', 'CV_de_peso', 'CV_peso'],
  cvLong: ['CV de longitud', 'CV_de_longitud', 'CV_longitud'],
  pigm: ['Pigmentación', 'Pigmentacion', 'pigmentacion'],
};

// Métricas a graficar (en orden), con su color y formato.
const METRICS = [
  { key: 'plg', label: 'PL/g', color: '#00695C', dec: 1 },
  { key: 'peso', label: 'Peso prom. (mg)', color: '#8E24AA', dec: 2 },
  { key: 'longitud', label: 'Longitud prom. (mm)', color: '#1565C0', dec: 2 },
  { key: 'uPeso', label: 'Uniformidad de peso', color: '#2E7D32', dec: 1 },
  { key: 'uLong', label: 'Uniformidad de longitud', color: '#00838F', dec: 1 },
  { key: 'cvPeso', label: 'CV de peso', color: '#E65100', dec: 1 },
  { key: 'cvLong', label: 'CV de longitud', color: '#AD1457', dec: 1 },
  { key: 'pigm', label: 'Pigmentación', color: '#546E7A', dec: 1 },
  // Derivada: incremento diario de peso (mg/d) entre registros consecutivos con peso.
  { key: 'incr', label: 'Incremento Diario (mg/d)', color: '#00ACC1', dec: 3, derived: true },
];

// Acceso numérico tolerante a coma decimal/“%” (regla 6 de CLAUDE.md), igual que
// el resto de vistas. Antes usaba parseFloat crudo, que truncaba valores con coma
// decimal del Sheet (p. ej. "0,85" → 0).
const pf = (r, keys) => parseNum(r, keys);


export function renderLarvia(ctx, mod, tq) {
  const corrida = ctx.vState.corrida || null;
  const col = colorFor(ctx.allMods.indexOf(mod));

  const rows = ctx.larvWin.filter((r) =>
    gMod(r) === mod && (!corrida || gCor(r) === corrida) && (gTnq(r) === tq || gTnq(r) === ''))
    .sort((a, b) => (parseAnyDate(gFec(a)) || new Date(0)) - (parseAnyDate(gFec(b)) || new Date(0)));

  // Filas de TODO el módulo (misma corrida) → promedio del módulo para el overlay
  // del fullscreen, igual que en la Visualización del Tanque.
  const modRows = ctx.larvWin.filter((r) => gMod(r) === mod && (!corrida || gCor(r) === corrida));
  // Por métrica (no derivada): Map fecha → promedio del módulo ese día.
  const modAvgByKey = {};
  METRICS.forEach((m) => {
    if (m.derived) return;
    const byDate = new Map();
    modRows.forEach((r) => { const f = gFec(r); const v = pf(r, KEYS[m.key]); if (!f || v === null) return; if (!byDate.has(f)) byDate.set(f, []); byDate.get(f).push(v); });
    const avgMap = new Map();
    byDate.forEach((arr, f) => avgMap.set(f, arr.reduce((a, b) => a + b, 0) / arr.length));
    modAvgByKey[m.key] = avgMap;
  });

  const bit = rows.map((r) => {
    const o = { fecha: gFec(r), estadio: getField(r, ['Estadío', 'Estadio', 'estadío', 'estadio']), id: getField(r, KEYS.id) };
    METRICS.forEach((m) => { if (!m.derived) o[m.key] = pf(r, KEYS[m.key]); });
    return o;
  }).filter((d) => d.fecha);

  // Incremento diario (mg/d) = (peso − peso del registro previo con peso) / días transcurridos.
  let prev = null;
  bit.forEach((d) => {
    d.incr = null;
    if (d.peso !== null) {
      if (prev) {
        const days = (parseAnyDate(d.fecha) - parseAnyDate(prev.fecha)) / 86400000;
        if (days > 0) d.incr = (d.peso - prev.peso) / days;
      }
      prev = { fecha: d.fecha, peso: d.peso };
    }
  });

  const withId = bit.filter((d) => d.id && d.id.trim() !== '');
  const records = [...withId].reverse(); // más reciente primero

  // LV3 · tabla comparativa entre dos análisis (por índice en `records`).
  const cmpTableHTML = (ia, ib) => {
    const a = records[ia], b = records[ib];
    const head = (r) => r ? `${esc(r.fecha)}${r.estadio ? ' · ' + esc(r.estadio) : ''}` : '—';
    const body = METRICS.map((m) => {
      const va = a ? a[m.key] : null, vb = b ? b[m.key] : null;
      const f = (x) => (x === null || x === undefined ? '—' : x.toFixed(m.dec));
      let d = '—';
      if (va !== null && va !== undefined && vb !== null && vb !== undefined) {
        const diff = va - vb; d = (diff >= 0 ? '+' : '−') + Math.abs(diff).toFixed(m.dec);
      }
      return `<tr><td><b>${esc(m.label)}</b></td><td>${f(va)}</td><td>${f(vb)}</td><td>${d}</td></tr>`;
    }).join('');
    return `<table class="sv-table">
      <thead><tr><th>Métrica</th><th>🅰️ ${head(a)}</th><th>🅱️ ${head(b)}</th><th>Δ (A−B)</th></tr></thead>
      <tbody>${body}</tbody></table>`;
  };

  let html = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod, nav: 'module', mod },
    { label: tq, nav: 'tank', mod, tank: tq },
    { label: 'LARVIA' },
  ]);

  html += `<div class="sv-banner" style="background:linear-gradient(135deg,#00695C,#004D40)">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">🔬 ANÁLISIS BIOMÉTRICO LARVIA</div>
    <div class="sv-banner-name">${esc(mod)} — ${esc(tq)}</div>
    <div class="sv-card-sub">${bit.length} registro${bit.length !== 1 ? 's' : ''} disponible${bit.length !== 1 ? 's' : ''}</div>
  </div>`;

  if (!withId.length) {
    html += `<div class="empty-state">Sin datos LARVIA para este tanque.</div>`;
    return { html };
  }

  // Métricas con al menos un dato
  const activeMetrics = METRICS.filter((m) => bit.some((d) => d[m.key] !== null));

  // ── Gráficos biométricos (cada uno con botón de ampliación) ──
  html += '<div class="sv-bio-grid">';
  activeMetrics.forEach((m) => {
    html += `<div class="card">
      <div class="sv-chart-cardhead">
        <div class="sv-chart-title" style="margin:0">${esc(m.label)}</div>
        <button class="lv-fs-btn" data-biofs="${m.key}" title="Ampliar gráfico" aria-label="Ampliar ${esc(m.label)}">⛶</button>
      </div>
      <div class="sv-chart-host sm"><canvas id="svBio_${m.key}"></canvas></div>
    </div>`;
  });
  html += '</div>';

  // ── LV3 · Comparar dos análisis (fechas) lado a lado ──
  if (records.length >= 2) {
    const optsHTML = (sel) => records.map((r, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(r.fecha)}${r.estadio ? ' · ' + esc(r.estadio) : ''}</option>`).join('');
    html += `<div class="sv-section-title" style="margin-top:6px">⚖️ Comparar análisis</div>
      <div class="card">
        <div class="lv-cmp-controls">
          <label class="sv-modal-datelbl">🅰️ Análisis A <select id="lvCmpA" class="sv-modal-select">${optsHTML(0)}</select></label>
          <label class="sv-modal-datelbl">🅱️ Análisis B <select id="lvCmpB" class="sv-modal-select">${optsHTML(1)}</select></label>
        </div>
        <div style="overflow:auto" id="lvCmpTable">${cmpTableHTML(0, 1)}</div>
      </div>`;
  }

  // ── Bitácora desplegable (último registro visible; resto colapsado) ──
  const cols = ['Fecha', 'Estadío', 'ID de Análisis', 'PL/g', 'Peso prom.', 'Long. prom.', 'Unif. peso', 'Unif. long.', 'CV peso', 'CV long.', 'Pigm.'];
  const rowHtml = (row, hidden) => {
    const idCell = row.id
      ? `<a class="mono" href="https://app.larvia.ai/production/analysis/${encodeURIComponent(row.id)}" target="_blank" rel="noopener">${esc(row.id)}</a>`
      : '—';
    return `<tr class="${hidden ? 'sv-bita-hidden' : ''}">
      <td>${esc(row.fecha)}</td>
      <td>${esc(row.estadio || '—')}</td>
      <td>${idCell}</td>
      <td>${fmt1(row.plg)}</td>
      <td>${fmt2(row.peso)}</td>
      <td>${fmt2(row.longitud)}</td>
      <td>${fmt1(row.uPeso)}</td>
      <td>${fmt1(row.uLong)}</td>
      <td>${fmt1(row.cvPeso)}</td>
      <td>${fmt1(row.cvLong)}</td>
      <td>${fmt1(row.pigm)}</td>
    </tr>`;
  };

  html += `<div class="sv-bita-head">
    <div class="sv-section-title" style="margin:0">📋 Bitácora</div>
    ${records.length > 1 ? `<button class="sv-bita-toggle" data-bita-toggle aria-expanded="false">Ver historial completo (${records.length} registros)</button>` : ''}
  </div>
  <div class="card" style="padding:0;overflow:auto">
    <table class="sv-table">
      <thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${records.map((r, i) => rowHtml(r, i > 0)).join('')}</tbody>
    </table>
  </div>`;

  // Modal de ampliación (fullscreen) reutilizable para cualquier métrica.
  html += `<div class="sv-modal" id="svBioFsModal" data-biofs-overlay>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title" id="svBioFsTitle">Métrica</span>
        <button class="sv-modal-x" data-biofs-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-kpis" id="svBioFsMeta"></div>
        <div class="lv-fs-chart"><canvas id="svBioFsCanvas"></canvas></div>
      </div>
    </div>
  </div>`;

  // Recorta nulos líder/cola para que el eje arranque en el 1er día con dato.
  const metricSlice = (m) => {
    const vals = bit.map((d) => d[m.key]);
    const first = vals.findIndex((v) => v !== null);
    if (first === -1) return null;
    let last = vals.length - 1;
    while (last > first && vals[last] === null) last--;
    return bit.slice(first, last + 1);
  };

  // Dibuja una métrica (grilla o ampliada). Tooltip incluye el estadío del día.
  const drawMetric = (canvasId, m, big) => {
    const slice = metricSlice(m);
    if (!slice) return;
    const datasets = [{ label: m.label, data: slice.map((d) => d[m.key]), borderColor: m.color, backgroundColor: m.color + '22', tension: .3, fill: true, pointRadius: big ? 3 : 2, pointHoverRadius: big ? 6 : 4, spanGaps: true, borderWidth: big ? 2.5 : 2 }];
    // Overlay del promedio del módulo (solo en fullscreen, alineado por fecha).
    const modMap = !m.derived ? modAvgByKey[m.key] : null;
    const hasOverlay = big && modMap && slice.some((d) => modMap.get(d.fecha) != null);
    if (hasOverlay) {
      datasets.push({ label: 'Promedio módulo', data: slice.map((d) => (modMap.get(d.fecha) ?? null)), borderColor: '#90A4AE', borderDash: [5, 4], backgroundColor: 'transparent', tension: .3, pointRadius: 0, spanGaps: true, fill: false, borderWidth: 2 });
    }
    makeChart(canvasId, {
      type: 'line',
      data: { labels: slice.map((d) => d.fecha), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: !!hasOverlay, labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              afterTitle: (it) => { const st = slice[it[0].dataIndex] && slice[it[0].dataIndex].estadio; return st ? 'Estadío: ' + st : ''; },
              label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? '—' : c.parsed.y.toFixed(m.dec)}`,
            },
          },
        },
        scales: { x: { ticks: big ? { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } : { maxRotation: 45, autoSkip: true, maxTicksLimit: 6 } } },
      },
    });
  };

  const after = (root) => {
    activeMetrics.forEach((m) => drawMetric('svBio_' + m.key, m, false));

    // Ampliación (fullscreen) por métrica
    const metricByKey = Object.fromEntries(activeMetrics.map((m) => [m.key, m]));
    const overlay = root.querySelector('#svBioFsModal');
    if (overlay) {
      const titleEl = overlay.querySelector('#svBioFsTitle');
      const metaEl = overlay.querySelector('#svBioFsMeta');
      const openFs = (key) => {
        const m = metricByKey[key]; if (!m) return;
        const arr = bit.map((d) => d[m.key]).filter((v) => v !== null && v !== undefined);
        const f = (v) => (v === null || v === undefined ? '—' : v.toFixed(m.dec));
        const avg = mean(arr);
        titleEl.textContent = m.label;
        metaEl.innerHTML = `<span class="sv-modal-kpi"><b>${arr.length ? f(arr[arr.length - 1]) : '—'}</b>último</span>`
          + `<span class="sv-modal-kpi"><b>${f(avg)}</b>prom.</span>`
          + `<span class="sv-modal-kpi"><b>${arr.length ? f(Math.min(...arr)) : '—'}</b>mín.</span>`
          + `<span class="sv-modal-kpi"><b>${arr.length ? f(Math.max(...arr)) : '—'}</b>máx.</span>`;
        requestAnimationFrame(() => drawMetric('svBioFsCanvas', m, true));
      };
      bindModal(root, overlay, {
        openSel: '[data-biofs]', closeSel: '[data-biofs-close]',
        onOpen: (b) => openFs(b.dataset.biofs),
      });
    }

    // LV3 · selectores de comparación
    const selA = root.querySelector('#lvCmpA'), selB = root.querySelector('#lvCmpB');
    const cmpTableEl = root.querySelector('#lvCmpTable');
    if (selA && selB && cmpTableEl) {
      const renderCmp = () => { cmpTableEl.innerHTML = cmpTableHTML(+selA.value, +selB.value); };
      selA.addEventListener('change', renderCmp);
      selB.addEventListener('change', renderCmp);
    }

    // Toggle de bitácora
    const btn = root.querySelector('[data-bita-toggle]');
    if (btn) {
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        root.querySelectorAll('.sv-bita-hidden').forEach((tr) => tr.classList.toggle('sv-bita-show', !expanded));
        btn.setAttribute('aria-expanded', String(!expanded));
        btn.textContent = expanded ? `Ver historial completo (${records.length} registros)` : 'Ocultar historial';
      });
    }
  };

  return { html, after };
}
