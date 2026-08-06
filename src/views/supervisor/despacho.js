/* ============================================================
   SUPERVISOR · Registro de Despacho
   Historial de despacho por tanque (tabla) + gráficos de
   Cantidad Cosechada y Biomasa por tanque/destino.

   Cantidad Cosechada = última población registrada por tanque.
   ============================================================ */
import { getters, rowsAreGrouped } from './stats.js';
import { colorFor, breadcrumb, fmtPop, kpiGlass } from './ui.js';
import { esc } from '../../core/format.js';
import { parseAnyDate } from '../../core/dates.js';
import { getField, parseNum } from '../../core/fields.js';
import { makeChart } from '../../core/charts.js';
import { natCmp } from '../../core/util.js';
import { isDespachoRow } from '../../core/prodCalendar.js';

const { gMod, gTnq, gCor, gFec, gPop } = getters;

const DKEY = {
  densidad: ['Densidad cosechada', 'Densidad Cosechada', 'densidad cosechada'],
  biomasa: ['Biomasa', 'biomasa'],
  plgM: ['Plg (manual)', 'PLG (manual)', 'plg (manual)', 'Plg(manual)'],
  cajas: ['Cajas/Tinas', 'Cajas / Tinas', 'cajas/tinas', 'Cajas-Tinas'],
  destino: ['Destino', 'destino'],
  piscina: ['Piscina', 'piscina'],
};

const DEST_COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#F9A825', '#546E7A'];
const NO_DEST = 'Sin destino';

const byDate = (arr) => [...arr].sort((a, b) => (parseAnyDate(gFec(a)) || new Date(0)) - (parseAnyDate(gFec(b)) || new Date(0)));
// `hasDispatch` reimplementaba el MISMO criterio que `isDespachoRow` del núcleo, con las
// mismas cuatro columnas y los mismos alias (comprobado uno a uno). El propio comentario
// de core/prodCalendar.js declara que ese conjunto debe coincidir con esta vista, así que
// tener dos copias solo garantizaba que algún día divergieran y el badge "Despachado" de
// la Vista Ejecutiva dejara de cuadrar con el historial de despacho.
const hasDispatch = isDespachoRow;
const cell = (r, keys) => { const v = getField(r, keys); return v === '' ? '—' : esc(v); };

export function renderDespacho(ctx, mod) {
  const corrida = ctx.vState.corrida || null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const rows = ctx.larvCM.filter((r) => gMod(r) === mod && (!corrida || gCor(r) === corrida));
  const tanks = [...new Set(rows.map(gTnq).filter(Boolean))].sort(natCmp);

  // Última población registrada (= cantidad cosechada), población inicial,
  // destino y biomasa por tanque.
  // Mapas SIN prototipo: se indexan por nombre de tanque, que sale de la hoja. Con un
  // objeto literal, un tanque llamado "constructor" o "toString" resolvería al miembro
  // HEREDADO de Object.prototype —una función, truthy— y `lastPop[tq] || 0` acabaría
  // concatenando texto en lugar de sumar. `Object.create(null)` no tiene cadena que
  // consultar, así que la clave ausente es siempre `undefined`.
  const lastPop = Object.create(null), firstPop = Object.create(null);
  const destino = Object.create(null), biomasa = Object.create(null), grouped = Object.create(null);
  let nDespachos = 0; const plgVals = [];
  tanks.forEach((tq) => {
    const tRows = byDate(rows.filter((r) => gTnq(r) === tq));
    grouped[tq] = rowsAreGrouped(tRows); // tanque agrupado (palabra "Agrupado" en Observaciones)
    for (let i = tRows.length - 1; i >= 0; i--) { const p = gPop(tRows[i]); if (p !== null) { lastPop[tq] = p; break; } }
    for (let i = 0; i < tRows.length; i++) { const p = gPop(tRows[i]); if (p !== null) { firstPop[tq] = p; break; } }
    const disp = tRows.filter(hasDispatch);
    nDespachos += disp.length;
    disp.forEach((r) => { const pl = parseNum(r, DKEY.plgM); if (pl !== null && pl > 0) plgVals.push(pl); });
    for (let i = disp.length - 1; i >= 0; i--) { const d = getField(disp[i], DKEY.destino); if (d) { destino[tq] = d; break; } }
    const bSum = disp.reduce((acc, r) => { const b = parseNum(r, DKEY.biomasa); return acc + (b || 0); }, 0);
    if (bSum > 0) biomasa[tq] = bSum;
  });

  // KPIs de cabecera (DP1 + DP4)
  const cosechadaTotal = tanks.reduce((a, tq) => a + (lastPop[tq] || 0), 0);
  const biomasaTotal = tanks.reduce((a, tq) => a + (biomasa[tq] || 0), 0);
  const popInicialTotal = tanks.reduce((a, tq) => a + (firstPop[tq] || 0), 0);
  const plgProm = plgVals.length ? plgVals.reduce((a, b) => a + b, 0) / plgVals.length : null;
  // Rendimiento de cosecha = cantidad cosechada / población inicial × 100 (supervivencia a cosecha).
  const rendimiento = popInicialTotal > 0 ? Math.min(cosechadaTotal / popInicialTotal * 100, 100) : null;
  const fmtNum = (v, d = 0) => (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });

  let html = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod, nav: 'module', mod },
    { label: 'Despacho' },
  ]);

  html += `<div class="sv-banner" style="background:${col.bg}">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">🚛 REGISTRO DE DESPACHO</div>
    <div class="sv-banner-name">${esc(mod)}</div>
    <div class="sv-card-sub">🔄 ${corrida ? 'Corrida: ' + esc(corrida) : 'Todas las corridas'} · ${tanks.length} tanque(s)</div>
    <div class="sv-kpi-grid sv-kpi-wide">
      ${kpiGlass('📦', 'Cantidad cosechada', fmtPop(cosechadaTotal || null))}
      ${kpiGlass('⚖️', 'Biomasa total', fmtNum(biomasaTotal || null, 1))}
      ${kpiGlass('🎣', 'PL/g promedio', fmtNum(plgProm, 1))}
      ${kpiGlass('🚛', 'Nº despachos', String(nDespachos))}
      ${kpiGlass('🎯', 'Rendimiento cosecha', rendimiento === null ? '—' : fmtNum(rendimiento, 1) + '%')}
    </div>
  </div>`;

  // ── Tabla: una fila por registro de despacho; tanques sin despacho se listan igual ──
  const headers = ['Fecha', 'Tanque', 'Densidad Cosechada', 'Biomasa', 'Plg (manual)', 'Cajas/Tinas', 'Destino', 'Cantidad Cosechada', 'Piscina'];
  let bodyRows = '';
  const tqCell = (tq) => `<b>${esc(tq)}</b>${grouped[tq] ? ' <span class="sv-tank-grouped" title="Tanque agrupado: pob./SV en 0; su siembra inicial sigue contando">🔗 Agrupado</span>' : ''}`;
  tanks.forEach((tq) => {
    const disp = byDate(rows.filter((r) => gTnq(r) === tq && hasDispatch(r)));
    const cosechada = fmtPop(lastPop[tq] ?? null);
    if (disp.length) {
      disp.forEach((r) => {
        bodyRows += `<tr>
          <td>${cell(r, ['Fecha', 'fecha'])}</td>
          <td>${tqCell(tq)}</td>
          <td>${cell(r, DKEY.densidad)}</td>
          <td>${cell(r, DKEY.biomasa)}</td>
          <td>${cell(r, DKEY.plgM)}</td>
          <td>${cell(r, DKEY.cajas)}</td>
          <td>${cell(r, DKEY.destino)}</td>
          <td><b>${cosechada}</b></td>
          <td>${cell(r, DKEY.piscina)}</td>
        </tr>`;
      });
    } else {
      bodyRows += `<tr class="sv-desp-empty">
        <td>—</td><td>${tqCell(tq)}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td><b>${cosechada}</b></td><td>—</td>
      </tr>`;
    }
  });

  html += `<div class="sv-section-title">📋 Historial de despacho</div>
    <div class="card" style="padding:0;overflow:auto">
      <table class="sv-table sv-desp-table">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="${headers.length}" class="muted" style="text-align:center;padding:20px">Sin registros.</td></tr>`}</tbody>
      </table>
    </div>`;

  // ── Gráficos ──
  html += `<div class="sv-chart-grid" style="margin-top:16px">
    <div class="card"><div class="sv-chart-title">📦 Cantidad cosechada por tanque/destino</div><div class="sv-chart-host"><canvas id="svDespCant"></canvas></div></div>
    <div class="card"><div class="sv-chart-title">⚖️ Biomasa por tanque/destino</div><div class="sv-chart-host"><canvas id="svDespBio"></canvas></div></div>
  </div>`;

  const after = () => {
    // Destinos presentes (+ "Sin destino" para tanques sin despacho)
    const destinos = [...new Set(tanks.map((tq) => destino[tq] || NO_DEST))];
    const colorOf = (d) => d === NO_DEST ? '#b0bec5' : DEST_COLORS[destinos.filter((x) => x !== NO_DEST).indexOf(d) % DEST_COLORS.length];

    const datasetsFor = (valueByTank) => destinos.map((d) => ({
      label: d,
      data: tanks.map((tq) => ((destino[tq] || NO_DEST) === d ? (valueByTank[tq] ?? null) : null)),
      backgroundColor: colorOf(d) + 'cc',
      borderColor: colorOf(d),
      borderWidth: 1,
      borderRadius: 4,
    }));

    const barOpts = (yFmt) => ({
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: yFmt } } },
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
    });

    makeChart('svDespCant', {
      type: 'bar',
      data: { labels: tanks, datasets: datasetsFor(lastPop) },
      options: barOpts((v) => Number(v).toLocaleString('es-EC')),
    });
    makeChart('svDespBio', {
      type: 'bar',
      data: { labels: tanks, datasets: datasetsFor(biomasa) },
      options: barOpts((v) => Number(v).toLocaleString('es-EC')),
    });
  };

  return { html, after };
}
