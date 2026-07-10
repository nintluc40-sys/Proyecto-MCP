/* ============================================================
   SUPERVISOR · Visualización del Tanque (KPIs + series temporales)
   ============================================================ */
import { tankStats, getters } from './stats.js';
import { avg as mean } from '../../core/util.js';
import { colorFor, fmt1, fmt2, fmtPop, kpiGlass, breadcrumb, bindModal } from './ui.js';
import { svLevel, odLevel, tmpLevel, levelColor, levelLabel, esc } from '../../core/format.js';
import { parseAnyDate } from '../../core/dates.js';
import { makeChart } from '../../core/charts.js';
import { getField, F } from '../../core/fields.js';
import { buildParamSection, iclSeries, paramAlerts, morphHeatmap, linForecast } from './params.js';
import { tankColorInfo } from '../../core/aguaColor.js';

const { gFec, gOD, gTmp, gPop, gSal } = getters;
const gHora = (r) => getField(r, F.hora);
const gColor = (r) => getField(r, ['Color', 'color', 'COLOR']);

// 12 tomas estándar cada 2 h, en el orden 2 AM → 12 AM (medianoche al final).
export const STD_HRS = ['2:00:00', '4:00:00', '6:00:00', '8:00:00', '10:00:00', '12:00:00', '14:00:00', '16:00:00', '18:00:00', '20:00:00', '22:00:00', '0:00:00'];
export const HR_LABELS = ['2 AM', '4 AM', '6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM', '12 AM'];
const TANK_METRICS = {
  od:  { icon: '💧', label: 'OD por hora', unit: ' mg/L', color: '#1E88E5', get: gOD, band: [5, 7] },
  tmp: { icon: '🌡️', label: 'Temperatura por hora', unit: ' °C', color: '#F4511E', get: gTmp, band: [31, 33] },
};

// Umbrales del ICL por estadío (mayor = mejor). Calibrados con datos reales
// (3.360 días-tanque, 2026-06-05): el ICL de Post-Larva NO corre más alto que el
// de Larva (mediana 270.5 vs 275; Δ≈−4.5). El aporte de Lípidos (~+95) se cancela
// porque en Post-L cae la presencia de Intestino Lleno (99%→53%) y se activan
// Opacidad/Flácidez/Necrosis/Canibalismo/Parásitos. Por eso Post-L ≈ Larva.
// Split resultante Post-L con 260/170: Óptimo 59% · Atención 31% · Crítico 10%.
// Ajustables aquí si cambian los datos/bibliografía.
const ICL_BANDS = {
  larv:  { opt: 260, att: 180 },
  postl: { opt: 260, att: 170 },
};

/** Normaliza la hora ("2:00 AM" / "14:00" / "2:00:00") a "H:MM:SS" 24h. */
export function normHr(h) {
  const s = String(h || '').trim();
  if (!s) return null;
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let hr = parseInt(ampm[1], 10); const mn = ampm[2], sc = ampm[3] || '00';
    const pm = ampm[4].toUpperCase() === 'PM';
    if (pm && hr !== 12) hr += 12;
    if (!pm && hr === 12) hr = 0;
    return hr + ':' + mn + ':' + sc;
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) { const p = s.split(':'); return parseInt(p[0], 10) + ':' + p[1] + ':' + p[2]; }
  const m2 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) return parseInt(m2[1], 10) + ':' + m2[2] + ':00';
  return null;
}

function dailySeries(rows, valFn) {
  const map = new Map();
  rows.forEach((r) => {
    const f = gFec(r); const v = valFn(r);
    if (!f || v === null) return;
    if (!map.has(f)) map.set(f, []);
    map.get(f).push(v);
  });
  const entries = [...map.entries()].sort((a, b) =>
    (parseAnyDate(a[0]) || new Date(0)) - (parseAnyDate(b[0]) || new Date(0)));
  return {
    labels: entries.map((e) => e[0]),
    values: entries.map((e) => e[1].reduce((a, b) => a + b, 0) / e[1].length),
  };
}

function lastByDay(rows, valFn) {
  const map = new Map();
  [...rows].sort((a, b) => (parseAnyDate(gFec(a)) || 0) - (parseAnyDate(gFec(b)) || 0))
    .forEach((r) => { const f = gFec(r); const v = valFn(r); if (f && v !== null) map.set(f, v); });
  return { labels: [...map.keys()], values: [...map.values()] };
}

export function renderTank(ctx, mod, tq) {
  const corrida = ctx.vState.corrida || null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const s = tankStats(ctx, mod, tq, corrida);

  // Color del agua del tanque (último valor con dato).
  const colorInfo = (() => {
    const rs = [...s.lRows].sort((a, b) => (parseAnyDate(gFec(a)) || 0) - (parseAnyDate(gFec(b)) || 0));
    for (let i = rs.length - 1; i >= 0; i--) { const c = gColor(rs[i]); if (c) return tankColorInfo(c); }
    return null;
  })();

  // Diagnóstico por parámetros (se adapta al estadío del tanque)
  const stageClass = /^PL/i.test(s.estadio || '') ? 'postl' : 'larv';
  // Filas de TODO el módulo (misma corrida) → overlay "promedio del módulo" en fullscreen (TQ1).
  const modRows = ctx.larvWin.filter((r) => getField(r, F.modulo) === mod && (!corrida || getField(r, F.corrida) === corrida));
  const param = buildParamSection(s.lRows, stageClass, modRows, colorInfo);

  // ICL diario (índice compuesto) + banda de referencia según estadío
  const icl = iclSeries(s.lRows);
  const iclBand = ICL_BANDS[stageClass] || ICL_BANDS.larv;
  let lastIcl = null;
  for (let i = icl.values.length - 1; i >= 0; i--) { if (icl.values[i] !== null && icl.values[i] !== undefined) { lastIcl = icl.values[i]; break; } }
  const fmtIcl = (v) => (v === null || v === undefined) ? '—' : String(Math.round(v));

  // Observaciones registradas para este tanque (col. "Observaciones" de Larvicultura),
  // más recientes primero. Respeta el filtro de corrida vigente (s.lRows ya viene filtrado).
  const OBS_KEYS = ['Observaciones', 'observaciones', 'Observación', 'observación'];
  const obsRows = [...s.lRows]
    .filter((r) => getField(r, OBS_KEYS))
    .sort((a, b) => (parseAnyDate(gFec(b)) || 0) - (parseAnyDate(gFec(a)) || 0));

  let html = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod, nav: 'module', mod },
    { label: tq },
  ]);

  html += `<div class="sv-banner" style="background:${col.bg}">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">🐟 VISUALIZACIÓN DEL TANQUE</div>
    <div class="sv-banner-name">${esc(mod)} — ${esc(tq)}</div>
    <div class="sv-card-sub">🦐 ${esc(s.estadio || '—')}${s.lotes.length ? ' · 📦 ' + esc(s.lotes.join(', ')) : ''}</div>
    <div class="sv-kpi-grid sv-kpi-wide">
      ${kpiGlass('📈', 'Supervivencia', fmt1(s.sv, '%'))}
      ${kpiGlass('💧', 'OD', fmt2(s.od, ' mg/L'), 'data-tankmetric="od" role="button" tabindex="0" title="Ver OD por hora (12 tomas del día)"')}
      ${kpiGlass('🌡️', 'Temperatura', fmt1(s.tmp, '°C'), 'data-tankmetric="tmp" role="button" tabindex="0" title="Ver Temperatura por hora (12 tomas del día)"')}
      ${kpiGlass('🧂', 'Salinidad', fmt1(s.sal, ' ppt'))}
      ${kpiGlass('👥', 'Pob. actual', fmtPop(s.pop))}
      ${kpiGlass('👥', 'Pob. inicial', fmtPop(s.popFirst))}
      ${kpiGlass('🧪', 'ICL', fmtIcl(lastIcl), 'data-iclopen role="button" tabindex="0" title="Ver ICL diario (índice compuesto)"')}
      ${colorInfo ? `<div class="sv-kpi-glass sv-color-kpi" title="${esc(colorInfo.message)}">
        <div class="sv-kpi-label">🎨 Color de agua</div>
        <div class="sv-kpi-value"><span class="sv-color-swatch" style="background:${colorInfo.hex}"></span>${esc(colorInfo.name)}</div>
        <div class="sv-color-msg ${colorInfo.level === 'warn' ? 'is-warn' : 'is-ok'}">${esc(colorInfo.message)}</div>
      </div>` : ''}
    </div>
  </div>`;

  const semaforos = [
    ['Supervivencia', svLevel(s.sv)], ['Oxígeno', odLevel(s.od)], ['Temperatura', tmpLevel(s.tmp)],
  ];
  html += `<div class="sv-semrow">${semaforos.map(([l, lvl]) =>
    `<span class="sv-legend-item"><span class="sv-dot" style="background:${levelColor(lvl)}"></span>${l}: <b>${levelLabel(lvl)}</b></span>`).join('')}</div>`;

  // Aviso de tanque agrupado: su población/SV quedan en 0 (sus animales se unieron a
  // otro tanque), pero su siembra inicial sigue contando en los totales del módulo.
  if (s.grouped) {
    html += `<div class="sv-grouped-note">🔗 <b>Tanque agrupado</b> — se registró población y supervivencia en 0 (sus animales se agruparon con otro tanque). Su siembra inicial sigue contando en los totales del módulo.</div>`;
  }

  // TQ4 · Botón de alertas del día (abre modal con parámetros fuera de rango)
  const alerts = paramAlerts(s.lRows, stageClass);
  html += `<div class="sv-actions" style="margin:0 0 14px">
    <button class="sv-action-btn sv-alert-btn ${alerts.length ? 'has-alerts' : 'no-alerts'}" data-alerts-open>⚠️ Alertas de hoy${alerts.length ? ` (${alerts.length})` : ' · 0'}</button>
    <button class="sv-action-btn" data-obshist-open>📜 Historial${obsRows.length ? ` (${obsRows.length})` : ''}</button>
    <button class="sv-action-btn" data-morphmap-open>🔬 Mapa morfológico</button>
    <button class="sv-action-btn" data-forecast-open>🔮 Pronóstico SV/Pob</button>
    <button class="sv-action-btn" data-nav="larvia" data-mod="${esc(mod)}" data-tank="${esc(tq)}">🔬 Análisis Biométrico LARVIA</button>
  </div>`;

  const chartCard = (key, title, canvasId, note) => `<div class="card">
      <div class="sv-chart-cardhead">
        <div class="sv-chart-title" style="margin:0">${title}</div>
        <button class="lv-fs-btn" data-svfs="${key}" title="Ampliar gráfico" aria-label="Ampliar ${esc(title)}">⛶</button>
      </div>
      <div class="sv-chart-host"><canvas id="${canvasId}"></canvas></div>
      ${note ? `<div class="sv-chart-note">${note}</div>` : ''}
    </div>`;
  html += `<div class="sv-chart-grid">
    ${chartCard('env', '💧🌡️ Oxígeno y Temperatura', 'svTankEnv')}
    ${chartCard('pop', '👥 Población', 'svTankPop', 'ℹ️ La población es una <b>estimación manual</b> (extrapolación), por lo que pueden aparecer días con picos o saltos bruscos entre registros.')}
  </div>`;
  html += `<div class="sv-chart-grid">
    ${chartCard('sv', '📈 Supervivencia', 'svTankSv')}
    ${chartCard('sal', '🧂 Salinidad', 'svTankSal')}
  </div>`;

  // ── Diagnóstico por parámetros (debajo de OD/Temp, Población, Superv. y Salinidad) ──
  html += param.html;

  // Fechas con tomas horarias (para el modal OD/Temperatura por hora)
  const hourlyDates = [...new Set(s.tRows.map(gFec).filter(Boolean))]
    .sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  const dateOpts = hourlyDates.map((f, i) => `<option value="${esc(f)}"${i === hourlyDates.length - 1 ? ' selected' : ''}>${esc(f)}</option>`).join('');
  html += `<div class="sv-modal" id="svTankModal" data-tankmodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title" id="svTankModalTitle">💧 OD por hora</span>
        <button class="sv-modal-x" data-tankmodal-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-controls">
          <label class="sv-modal-datelbl">📅 Fecha
            <select id="svTankModalDate" class="sv-modal-select">${dateOpts || '<option>—</option>'}</select>
          </label>
          <span class="sv-modal-ref" id="svTankModalRef"></span>
        </div>
        <div class="sv-modal-kpis" id="svTankModalKpis"></div>
        <div class="sv-chart-host" style="height:330px">${hourlyDates.length ? '<canvas id="svTankHourly"></canvas>' : '<div class="empty-state">Sin tomas horarias registradas para este tanque.</div>'}</div>
        <div class="sv-modal-note">Eje X: 12 tomas cada 2 h (2 AM → 12 AM). Franja verde = rango de referencia.</div>
      </div>
    </div>
  </div>`;

  // Modal ICL diario
  html += `<div class="sv-modal" id="svIclModal" data-iclmodal>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🧪 ICL · Índice de Calidad Larvaria (diario)</span>
        <button class="sv-modal-x" data-iclclose aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-kpis" id="svIclMeta"></div>
        <div class="lv-fs-chart">${icl.values.some((v) => v !== null) ? '<canvas id="svIclCanvas"></canvas>' : '<div class="empty-state">Sin datos suficientes para calcular el ICL.</div>'}</div>
        <div class="sv-modal-note">ICL = (SV + %Actividad + Int.Lleno + Lípidos) − (Vacío + Semilleno + Deformidad + Estrés + Retraso + Necrosis + Hongos + No Viables + Opacidad + Flácidez + Canibalismo + Parásitos). El tooltip muestra las variables que más restan ese día.</div>
      </div>
    </div>
  </div>`;

  // Modal Historial de observaciones del tanque
  const obsListHTML = obsRows.length
    ? `<div class="sv-hist-count">${obsRows.length} observación(es)</div>` + obsRows.map((r) => `
        <div class="sv-hist-item">
          <span class="sv-hist-date">${esc(gFec(r) || '—')}</span>
          <div class="sv-hist-meta">${esc(s.estadio || getField(r, ['Estadío', 'Estadio', 'estadío', 'estadio']) || '')}${getField(r, F.corrida) ? ' · C' + esc(getField(r, F.corrida)) : ''}</div>
          <p class="sv-hist-text">${esc(getField(r, OBS_KEYS))}</p>
        </div>`).join('')
    : '<div class="empty-state">Sin observaciones registradas para este tanque.</div>';
  html += `<div class="sv-modal" id="svObsModal" data-obsmodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">📜 Historial de observaciones — ${esc(mod)} · ${esc(tq)}</span>
        <button class="sv-modal-x" data-obshist-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body"><div class="sv-hist-list">${obsListHTML}</div></div>
    </div>
  </div>`;

  // Modal de alertas del día (TQ4)
  const alertListHTML = alerts.length
    ? `<div class="sv-alert-summary">${alerts.length} parámetro(s) fuera de rango el último día con registro.</div>`
      + alerts.map((a) => `<div class="sv-alert-item sev-${a.sev}">
          <span class="sv-alert-sev">${a.sev === 'alta' ? '🔴 Alta' : '🟠 Media'}</span>
          <div class="sv-alert-body">
            <div class="sv-alert-name">${esc(a.label)} <b>${esc(a.fmt)}</b> <span class="sv-alert-obj">objetivo ${esc(a.obj)}</span></div>
            <div class="sv-alert-hint">${esc(a.hint)}</div>
          </div>
        </div>`).join('')
    : '<div class="sv-alert-ok">✅ Sin alertas — todos los parámetros con umbral del último día están en rango.</div>';
  html += `<div class="sv-modal" id="svAlertModal" data-alertmodal>
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">⚠️ Alertas de hoy — ${esc(mod)} · ${esc(tq)}</span>
        <button class="sv-modal-x" data-alerts-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body"><div class="sv-alert-list">${alertListHTML}</div></div>
    </div>
  </div>`;

  // Modal de ampliación (fullscreen) reutilizable para los 4 gráficos del tanque.
  html += `<div class="sv-modal" id="svChartFsModal" data-chartfs-overlay>
    <div class="sv-modal-card lv-fs-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title" id="svChartFsTitle">Gráfico</span>
        <button class="sv-modal-x" data-svfs-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body"><div class="lv-fs-chart"><canvas id="svChartFsCanvas"></canvas></div></div>
    </div>
  </div>`;

  // ── Modal: Mapa morfológico (heatmap de parámetros por día, con rango de fechas) ──
  const heatMap = morphHeatmap(s.lRows, stageClass);
  const heatOpts = (sel) => heatMap.days.map((d, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(d)}</option>`).join('');
  html += `<div class="sv-modal" id="svMorphModal" data-morphmodal>
    <div class="sv-modal-card sv-modal-wide">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🔬 Mapa morfológico — ${esc(mod)} · ${esc(tq)}</span>
        <button class="sv-modal-x" data-morphmodal-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-controls">
          <label class="sv-modal-datelbl">📅 Desde
            <select id="svMorphFrom" class="sv-modal-select">${heatOpts(0)}</select>
          </label>
          <label class="sv-modal-datelbl">Hasta
            <select id="svMorphTo" class="sv-modal-select">${heatOpts(Math.max(0, heatMap.days.length - 1))}</select>
          </label>
        </div>
        <div class="sv-morph-wrap" id="svMorphTable"></div>
        <div class="sv-modal-note">Cada celda = valor medio del día. 🟩 en rango · 🟥 fuera de rango · gris = sin umbral / sin dato. Filtra por rango de fechas.</div>
      </div>
    </div>
  </div>`;

  // ── Modal: Pronóstico (regresión lineal) de Supervivencia y Población a 7 días ──
  html += `<div class="sv-modal" id="svForecastModal" data-forecastmodal>
    <div class="sv-modal-card sv-modal-wide">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🔮 Pronóstico SV / Población (7 días) — ${esc(mod)} · ${esc(tq)}</span>
        <button class="sv-modal-x" data-forecast-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <div class="sv-modal-kpis" id="svForecastKpis"></div>
        <div class="sv-chart-host" style="height:300px"><canvas id="svForecastChart"></canvas></div>
        <div class="sv-modal-note">Proyección por <b>regresión lineal</b> sobre la tendencia diaria. Línea punteada = estimación a 7 días; es referencial y supone que la tendencia se mantiene.</div>
      </div>
    </div>
  </div>`;

  const after = (root) => {
    try { param.draw(root); } catch (e) { console.error('[tank] param', e); }
    const od = dailySeries(s.tRows, gOD);
    const tmp = dailySeries(s.tRows, gTmp);
    const pop = lastByDay(s.lRows, gPop);
    // Supervivencia diaria consistente con el KPI y la definición del sistema:
    // población del día / población inicial × 100 (en vez de la columna cruda
    // "Supervivencia", que podía estar dispersa y dejar el gráfico vacío).
    const sv = {
      labels: pop.labels,
      values: (s.popFirst && s.popFirst > 0)
        ? pop.values.map((p) => Math.min((p / s.popFirst) * 100, 100))
        : pop.values.map(() => null),
    };
    const sal = dailySeries([...s.tRows, ...s.lRows], gSal);
    // Banda objetivo de Supervivencia: zona verde ≥ 60 % + línea de umbral (TQ3).
    const svBandPlugin = {
      id: 'svSvBand',
      beforeDatasetsDraw(chart) {
        const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
        const py = y.getPixelForValue(60); if (isNaN(py)) return;
        const cx = chart.ctx; cx.save();
        cx.fillStyle = 'rgba(46,125,50,.10)';
        cx.fillRect(ca.left, ca.top, ca.right - ca.left, Math.max(0, py - ca.top));
        cx.strokeStyle = 'rgba(46,125,50,.6)'; cx.lineWidth = 1; cx.setLineDash([4, 3]);
        cx.beginPath(); cx.moveTo(ca.left, py); cx.lineTo(ca.right, py); cx.stroke();
        cx.restore();
      },
    };

    // Builders (config fresca cada vez → válida tanto en la grilla como en fullscreen).
    const cfgs = {
      env: () => ({
        type: 'line',
        data: { labels: od.labels.length ? od.labels : tmp.labels, datasets: [
          { label: 'OD (mg/L)', data: od.values, borderColor: '#1E88E5', backgroundColor: 'rgba(30,136,229,.1)', tension: .3, yAxisID: 'y', fill: true, pointRadius: 2 },
          { label: 'T° (°C)', data: tmp.values, borderColor: '#F4511E', backgroundColor: 'rgba(244,81,30,.08)', tension: .3, yAxisID: 'y1', pointRadius: 2 },
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          scales: { y: { position: 'left', title: { display: true, text: 'OD' } }, y1: { position: 'right', title: { display: true, text: 'T°' }, grid: { drawOnChartArea: false } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } } },
          plugins: { legend: { labels: { boxWidth: 12 } } } },
      }),
      pop: () => ({
        type: 'line',
        data: { labels: pop.labels, datasets: [{ label: 'Población', data: pop.values, borderColor: '#3949AB', backgroundColor: 'rgba(57,73,171,.12)', tension: .3, fill: true, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString('es-EC') } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } } }, plugins: { legend: { display: false } } },
      }),
      sv: () => ({
        type: 'line',
        data: { labels: sv.labels, datasets: [{ label: 'Supervivencia (%)', data: sv.values, borderColor: '#2E7D32', backgroundColor: 'rgba(46,125,50,.12)', tension: .3, fill: true, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 50, suggestedMax: 100, ticks: { callback: (v) => v + '%' } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (c) => (c.parsed.y != null ? (c.parsed.y >= 60 ? '✓ ≥ 60% objetivo' : '! < 60% objetivo') : '') } } } },
        plugins: [svBandPlugin],
      }),
      sal: () => ({
        type: 'line',
        data: { labels: sal.labels, datasets: [{ label: 'Salinidad (ppt)', data: sal.values, borderColor: '#00838F', backgroundColor: 'rgba(0,131,143,.12)', tension: .3, fill: true, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => v + ' ppt' } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } } }, plugins: { legend: { display: false } } },
      }),
    };
    const cfgTitle = { env: '💧🌡️ Oxígeno y Temperatura', pop: '👥 Población', sv: '📈 Supervivencia', sal: '🧂 Salinidad' };
    makeChart('svTankEnv', cfgs.env());
    makeChart('svTankPop', cfgs.pop());
    makeChart('svTankSv', cfgs.sv());
    makeChart('svTankSal', cfgs.sal());

    // Fullscreen de los 4 gráficos
    const fsOverlay = root.querySelector('#svChartFsModal');
    if (fsOverlay) {
      const titleEl = fsOverlay.querySelector('#svChartFsTitle');
      bindModal(root, fsOverlay, {
        openSel: '[data-svfs]', closeSel: '[data-svfs-close]',
        onOpen: (b) => { const key = b.dataset.svfs; if (!cfgs[key]) return; if (titleEl) titleEl.textContent = cfgTitle[key]; requestAnimationFrame(() => makeChart('svChartFsCanvas', cfgs[key]())); },
      });
    }

    // ── Modal: ICL diario ──
    const iclOverlay = root.querySelector('#svIclModal');
    if (iclOverlay && icl.values.some((v) => v !== null)) {
      const metaEl = root.querySelector('#svIclMeta');
      const drawIcl = () => {
        const present = icl.values.filter((v) => v !== null && v !== undefined);
        const avg = mean(present);
        const r1 = (v) => (v === null || v === undefined ? '—' : String(Math.round(v)));
        if (metaEl) metaEl.innerHTML = `<span class="sv-modal-kpi"><b>${r1(lastIcl)}</b>actual</span>`
          + `<span class="sv-modal-kpi"><b>${r1(avg)}</b>prom.</span>`
          + `<span class="sv-modal-kpi"><b>${present.length ? r1(Math.min(...present)) : '—'}</b>mín.</span>`
          + `<span class="sv-modal-kpi"><b>${present.length ? r1(Math.max(...present)) : '—'}</b>máx.</span>`
          + `<span class="sv-modal-kpi">Óptimo ≥ ${iclBand.opt} · Crítico < ${iclBand.att} <span style="color:var(--c-text-muted)">(${stageClass === 'postl' ? 'Post-Larva' : 'Larva'})</span></span>`;
        // Rango Y incluyendo los umbrales para que la franja sea visible
        const lo = Math.min(...(present.length ? present : [iclBand.att]), iclBand.att);
        const hi = Math.max(...(present.length ? present : [iclBand.opt]), iclBand.opt);
        const pad = Math.max((hi - lo) * 0.12, 8);
        const yMin = lo - pad, yMax = hi + pad;
        const bandPlugin = {
          id: 'svIclBand',
          beforeDatasetsDraw(chart) {
            const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
            const ctx = chart.ctx; ctx.save();
            const w = ca.right - ca.left;
            const pOpt = y.getPixelForValue(iclBand.opt), pAtt = y.getPixelForValue(iclBand.att);
            ctx.fillStyle = 'rgba(30,200,106,.10)'; ctx.fillRect(ca.left, ca.top, w, Math.max(0, pOpt - ca.top));
            ctx.fillStyle = 'rgba(245,185,66,.12)'; ctx.fillRect(ca.left, pOpt, w, Math.max(0, pAtt - pOpt));
            ctx.fillStyle = 'rgba(232,48,62,.10)'; ctx.fillRect(ca.left, pAtt, w, Math.max(0, ca.bottom - pAtt));
            ctx.strokeStyle = 'rgba(120,144,156,.7)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
            [iclBand.opt, iclBand.att].forEach((v) => { const p = y.getPixelForValue(v); ctx.beginPath(); ctx.moveTo(ca.left, p); ctx.lineTo(ca.right, p); ctx.stroke(); });
            ctx.restore();
          },
        };
        makeChart('svIclCanvas', {
          type: 'line',
          data: { labels: icl.days, datasets: [{ label: 'ICL', data: icl.values, borderColor: '#00695C', backgroundColor: 'rgba(0,105,92,.12)', tension: .3, fill: true, pointRadius: 4, pointHoverRadius: 6, spanGaps: true, borderWidth: 2.5 }] },
          options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: { x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } }, y: { min: yMin, max: yMax, title: { display: true, text: 'ICL' } } },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (it) => icl.days[it[0].dataIndex],
                  afterTitle: (it) => { const st = icl.stages[it[0].dataIndex]; return st ? 'Estadío: ' + st : ''; },
                  label: (c) => 'ICL: ' + (c.parsed.y === null ? '—' : Math.round(c.parsed.y)),
                  afterBody: (it) => {
                    const neg = icl.negByDay[it[0].dataIndex] || [];
                    if (!neg.length) return '';
                    return ['', 'Variables que más restan:'].concat(neg.slice(0, 4).map((n) => `  ▼ ${n.label}: ${n.val.toFixed(1)}`));
                  },
                },
              },
            },
          },
          plugins: [bandPlugin],
        });
      };
      bindModal(root, iclOverlay, {
        openSel: '[data-iclopen]', closeSel: '[data-iclclose]', keyboard: true,
        onOpen: () => requestAnimationFrame(drawIcl),
      });
    }

    // ── Modal: Historial de observaciones del tanque ──
    bindModal(root, root.querySelector('#svObsModal'), {
      openSel: '[data-obshist-open]', closeSel: '[data-obshist-close]',
    });

    // ── Modal: Alertas del día (TQ4) ──
    bindModal(root, root.querySelector('#svAlertModal'), {
      openSel: '[data-alerts-open]', closeSel: '[data-alerts-close]',
    });

    // ── Modal: OD / Temperatura por hora (12 tomas del día) ──
    const overlay = root.querySelector('#svTankModal');
    if (overlay) {
      let curMetric = 'od';
      let curDate = hourlyDates.length ? hourlyDates[hourlyDates.length - 1] : null;
      const titleEl = root.querySelector('#svTankModalTitle');
      const refEl = root.querySelector('#svTankModalRef');
      const kpisEl = root.querySelector('#svTankModalKpis');
      const dateSel = root.querySelector('#svTankModalDate');

      const hourSeries = (cfg, date) => STD_HRS.map((std) => {
        const vals = s.tRows.filter((r) => gFec(r) === date && normHr(gHora(r)) === std).map(cfg.get).filter((v) => v !== null);
        return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
      });

      const drawHourly = () => {
        const cfg = TANK_METRICS[curMetric];
        const data = hourSeries(cfg, curDate);
        const present = data.filter((v) => v !== null);
        kpisEl.innerHTML = present.length
          ? [['Prom.', present.reduce((a, b) => a + b, 0) / present.length], ['Mín.', Math.min(...present)], ['Máx.', Math.max(...present)], ['Tomas', present.length]]
              .map(([l, v], i) => `<span class="sv-modal-kpi"><b>${i === 3 ? v : (+v).toFixed(2) + cfg.unit}</b><span>${l}</span></span>`).join('')
          : '<span class="sv-modal-kpi muted">Sin tomas registradas este día</span>';
        const band = cfg.band;
        const bandPlugin = {
          id: 'svRefBand',
          beforeDatasetsDraw(chart) {
            const y = chart.scales.y, ca = chart.chartArea; if (!y || !ca) return;
            const top = y.getPixelForValue(Math.max(...band)), bot = y.getPixelForValue(Math.min(...band));
            const ctx = chart.ctx; ctx.save();
            ctx.fillStyle = 'rgba(56,142,60,.13)'; ctx.fillRect(ca.left, Math.min(top, bot), ca.right - ca.left, Math.abs(bot - top));
            ctx.strokeStyle = 'rgba(56,142,60,.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(ca.left, top); ctx.lineTo(ca.right, top); ctx.moveTo(ca.left, bot); ctx.lineTo(ca.right, bot); ctx.stroke();
            ctx.restore();
          },
        };
        const allv = present.concat(band);
        let yMin = Math.min(...allv), yMax = Math.max(...allv);
        const pad = Math.max((yMax - yMin) * 0.18, 0.3); yMin -= pad; yMax += pad;
        makeChart('svTankHourly', {
          type: 'line',
          data: { labels: HR_LABELS, datasets: [{ label: cfg.label, data, borderColor: cfg.color, backgroundColor: cfg.color + '22', borderWidth: 2.5, tension: .3, pointRadius: 5, pointHoverRadius: 7, spanGaps: true, fill: false }] },
          options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: { y: { min: yMin, max: yMax, title: { display: true, text: cfg.label } }, x: { grid: { display: false }, ticks: { font: { weight: '700' } } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${cfg.label}: ${c.parsed.y === null ? '—' : c.parsed.y + cfg.unit}` } } },
          },
          plugins: [bandPlugin],
        });
      };

      const openHourly = (metric) => {
        curMetric = metric;
        const cfg = TANK_METRICS[metric];
        titleEl.textContent = `${cfg.icon} ${cfg.label}`;
        refEl.innerHTML = `Rango ref.: <b>${cfg.band[0]}–${cfg.band[1]}${cfg.unit}</b>`;
        drawHourly();
      };
      bindModal(root, overlay, {
        openSel: '[data-tankmetric]', closeSel: '[data-tankmodal-close]', keyboard: true,
        onOpen: (chip) => openHourly(chip.dataset.tankmetric),
      });
      if (dateSel) dateSel.addEventListener('change', () => { curDate = dateSel.value; drawHourly(); });
    }
    // ── Modal: Mapa morfológico (heatmap por día con rango de fechas) ──
    const morphOverlay = root.querySelector('#svMorphModal');
    if (morphOverlay) {
      const tableEl = root.querySelector('#svMorphTable');
      const fromSel = root.querySelector('#svMorphFrom');
      const toSel = root.querySelector('#svMorphTo');
      const renderHeat = (fromIdx, toIdx) => {
        const lo = Math.min(fromIdx, toIdx), hi = Math.max(fromIdx, toIdx);
        const days = heatMap.days.slice(lo, hi + 1);
        if (!heatMap.rows.length || !days.length) {
          tableEl.innerHTML = '<div class="sv-modal-kpi muted">Sin datos morfológicos en el rango.</div>';
          return;
        }
        let h = '<table class="sv-morph-tbl"><thead><tr><th class="sv-morph-rowh">Parámetro</th>';
        days.forEach((d) => { h += `<th>${esc(d)}</th>`; });
        h += '</tr></thead><tbody>';
        heatMap.rows.forEach((r) => {
          h += `<tr><td class="sv-morph-rowh">${esc(r.label)}</td>`;
          r.cells.slice(lo, hi + 1).forEach((c) => {
            const cls = c.val === null ? 'is-na' : c.ok === true ? 'is-ok' : c.ok === false ? 'is-bad' : 'is-neu';
            h += `<td class="sv-morph-cell ${cls}">${esc(c.txt)}</td>`;
          });
          h += '</tr>';
        });
        tableEl.innerHTML = h + '</tbody></table>';
      };
      bindModal(root, morphOverlay, {
        openSel: '[data-morphmap-open]', closeSel: '[data-morphmodal-close]',
        onOpen: () => renderHeat(+fromSel.value, +toSel.value),
      });
      fromSel?.addEventListener('change', () => renderHeat(+fromSel.value, +toSel.value));
      toSel?.addEventListener('change', () => renderHeat(+fromSel.value, +toSel.value));
    }

    // ── Modal: Pronóstico (regresión lineal) SV/Población a 7 días ──
    const fcOverlay = root.querySelector('#svForecastModal');
    if (fcOverlay) {
      const kpisEl = root.querySelector('#svForecastKpis');
      const drawForecast = () => {
        const fdays = [...new Set(s.lRows.map(gFec).filter(Boolean))].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
        const popv = fdays.map((d) => { const rs = s.lRows.filter((r) => gFec(r) === d); for (let i = rs.length - 1; i >= 0; i--) { const v = gPop(rs[i]); if (v !== null && v !== undefined) return v; } return null; });
        // SV pop-based (coherente con el KPI y el gráfico de Supervivencia).
        const svv = popv.map((p) => (p !== null && s.popFirst && s.popFirst > 0) ? Math.min((p / s.popFirst) * 100, 100) : null);
        const H = 7;
        const svF = linForecast(svv, H), popF = linForecast(popv, H);
        const futLabels = Array.from({ length: H }, (_, k) => `+${k + 1}d`);
        const labels = [...fdays, ...futLabels];
        const histLen = fdays.length;
        const pad = (arr) => [...arr, ...Array(H).fill(null)];
        const clampPct = (v) => Math.max(0, Math.min(100, v)); // SV no puede salir de 0–100%
        const clampPos = (v) => Math.max(0, v);                // Población no puede ser negativa
        const fcArr = (fc, clamp) => {
          const a = Array(labels.length).fill(null);
          if (!fc || histLen < 1) return a;
          a[histLen - 1] = clamp(fc.predict(histLen - 1));
          fc.future.forEach((y, k) => { a[histLen + k] = clamp(y); });
          return a;
        };
        makeChart('svForecastChart', {
          type: 'line',
          data: { labels, datasets: [
            { label: 'SV histórico (%)', data: pad(svv), borderColor: '#2E7D32', backgroundColor: 'rgba(46,125,50,.1)', yAxisID: 'y', tension: .3, pointRadius: 2, spanGaps: true, fill: true },
            { label: 'SV proyección', data: fcArr(svF, clampPct), borderColor: '#2E7D32', borderDash: [5, 4], yAxisID: 'y', pointRadius: 0, spanGaps: true },
            { label: 'Pob. histórica', data: pad(popv), borderColor: '#3949AB', backgroundColor: 'rgba(57,73,171,.08)', yAxisID: 'y1', tension: .3, pointRadius: 2, spanGaps: true },
            { label: 'Pob. proyección', data: fcArr(popF, clampPos), borderColor: '#3949AB', borderDash: [5, 4], yAxisID: 'y1', pointRadius: 0, spanGaps: true },
          ] },
          options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: {
              y: { position: 'left', title: { display: true, text: 'SV %' }, ticks: { callback: (v) => v + '%' } },
              y1: { position: 'right', title: { display: true, text: 'Población' }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => Number(v).toLocaleString('es-EC') } },
              x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
            },
            plugins: { legend: { labels: { boxWidth: 12 } } },
          },
        });
        const lastSv = [...svv].reverse().find((v) => v != null);
        const lastPop = [...popv].reverse().find((v) => v != null);
        const trend = (slope) => slope == null ? '—' : slope > 0.05 ? '↗ subiendo' : slope < -0.05 ? '↘ bajando' : '→ estable';
        kpisEl.innerHTML = [
          ['SV hoy', lastSv != null ? lastSv.toFixed(1) + '%' : '—'],
          ['SV +7d', svF ? clampPct(svF.future[H - 1]).toFixed(1) + '%' : '—'],
          ['Tend. SV', svF ? trend(svF.slope) : '—'],
          ['Pob. hoy', lastPop != null ? Math.round(lastPop).toLocaleString('es-EC') : '—'],
          ['Pob. +7d', popF ? Math.round(clampPos(popF.future[H - 1])).toLocaleString('es-EC') : '—'],
        ].map(([l, v]) => `<span class="sv-modal-kpi"><b>${esc(String(v))}</b><span>${esc(l)}</span></span>`).join('');
      };
      bindModal(root, fcOverlay, {
        openSel: '[data-forecast-open]', closeSel: '[data-forecast-close]',
        onOpen: () => requestAnimationFrame(drawForecast),
      });
    }
  };

  return { html, after };
}
