/* ============================================================
   SUPERVISOR · Comparativa OM vs Tex (por módulo)
   Compara los lotes Texcumar vs Omarsa de un módulo (respetando
   el filtro de corrida activo) en 6 variables: Población,
   Supervivencia, Deformidad, ICL, PL/g e Incremento de peso (mg/d).
   Cada tanque se asigna a una marca por la moda de su lote; los
   valores por marca son el PROMEDIO por tanque.
   Incluye: barras por variable (OT base), tabla Δ (OT1), detalle por
   tanque (OT2), selector + tendencia temporal por marca (OT3/OT4) y
   veredicto compuesto (OT5).
   ============================================================ */
import { tankStats, tanksOf } from './stats.js';
import { iclSeries } from './params.js';
import { colorFor, breadcrumb, fmtPop } from './ui.js';
import { esc } from '../../core/format.js';
import { parseAnyDate } from '../../core/dates.js';
import { parseNum, getField, F, PLG_KEYS } from '../../core/fields.js';
import { natCmp } from '../../core/util.js';
import { makeChart } from '../../core/charts.js';

const DEF_KEYS = ['Deformidad', 'deformidad'];
const PESO_KEYS = ['Peso promedio (mg)', 'Peso_promedio', 'peso_promedio', 'Peso promedio', 'Peso_prom'];
const ESTADIO_KEYS = ['Estadío', 'Estadio', 'estadío', 'estadio', 'ESTADIO'];

// Firmas de lote, DICTADAS POR EL LABORATORIO (no inferidas de los datos):
//   Omarsa   → dos letras (AB, BB, BA), combinables con '+' ("AB+BI").
//   Texcumar → mezcla de letras y números ("L1", "D2"), llevan guion ("J-D2", "D-2"),
//              o son de UN SOLO carácter ("J", "2").
// ⚠ '+' es el ÚNICO separador de combinación. En una versión anterior se admitieron
// también '/', ',', '&', ';' y el espacio: estaban INVENTADOS, no salían de los datos, y
// admitir de más arriesga leer como Omarsa un lote que no lo es. No volver a ampliarlos
// sin que el laboratorio lo confirme.
// ⚠ El guion NO es separador: es la SEÑAL de Texcumar. Partir "J-D2" destrozaría el código.
const LOT_SEP = /\s*\+\s*/;
const OM_PART = /^[A-Z]{2}$/;
const isTexPart = (p) => /[0-9-]/.test(p) || p.length === 1;

/**
 * Clasifica un lote por marca. Ambas marcas se identifican en POSITIVO y lo que no
 * encaja limpio en ninguna devuelve null, para que aflore en el aviso de "sin marca
 * clara" en vez de engordar una marca en silencio.
 *
 * Antes era `2 letras exactas = Omarsa; TODO LO DEMÁS = Texcumar`, un cajón de sastre con
 * dos consecuencias: los lotes COMBINADOS de Omarsa ("BG+BD") se contaban como Texcumar,
 * y cualquier valor irreconocible o mal tecleado engordaba Texcumar sin que nadie se
 * enterara. Esta comparativa corona un 🏆 y se usa para decidir proveedor, así que
 * clasificar mal un lote tiene consecuencia de negocio.
 *
 *  - Todas las partes de 2 letras           → 'OM'  ("AB", "BB", "BG+BD")
 *  - Todas con dígito/guion o de 1 carácter → 'TEX' ("L1", "J-D2", "D-2", "J", "2")
 *  - Cualquier otra cosa                    → null  (ambiguo: "AB+L1", "MIX", "ABC")
 *  - Vacío                                  → null
 *
 * Si aparecen tanques en el aviso de "sin marca clara" que el laboratorio reconozca como
 * obviamente de una marca, hay que AMPLIAR la firma de esa marca: el aviso es justamente
 * el mecanismo para detectarlo.
 */
export function lotBrand(lote) {
  const s = String(lote || '').trim().toUpperCase();
  if (!s) return null;
  const parts = s.split(LOT_SEP).filter(Boolean);
  if (!parts.length) return null;
  if (parts.every((p) => OM_PART.test(p))) return 'OM';
  if (parts.every(isTexPart)) return 'TEX';
  return null;   // no encaja limpio en ninguna marca → no se adivina
}

// Cuota de tanques sin marca clara a partir de la cual el veredicto se ABSTIENE: con esa
// proporción apartada, la muestra no sostiene coronar a un ganador.
const VERDICT_MAX_UNCLASSIFIED = 0.30;

const BRANDS = {
  TEX: { label: 'Texcumar', color: '#E65100', icon: '🟧' },
  OM:  { label: 'Omarsa',   color: '#00695C', icon: '🟦' },
};

// Variables comparables (dir: 'up' = mayor mejor; 'down' = menor mejor).
// `pct: true` = la variable YA es un porcentaje, así que su Δ absoluto son PUNTOS
// PORCENTUALES (p.p.), no un porcentaje: mezclarlo con el Δ relativo en la misma tabla
// ponía dos números con el mismo símbolo '%' y significados distintos uno al lado del otro.
const VARS = [
  { key: 'pop',  label: 'Población',          icon: '👥', dir: 'up',   fmt: (v) => fmtPop(v),                         trend: 'col', keys: F.poblacion, pos: true },
  { key: 'sv',   label: 'Supervivencia',      icon: '📈', dir: 'up',   fmt: (v) => (v == null ? '—' : v.toFixed(1) + '%'), trend: 'col', keys: F.supervivencia, pct: true },
  { key: 'def',  label: 'Deformidad',         icon: '🧬', dir: 'down', fmt: (v) => (v == null ? '—' : v.toFixed(1) + '%'), trend: 'col', keys: DEF_KEYS, pct: true },
  { key: 'icl',  label: 'ICL',                icon: '🧪', dir: 'up',   fmt: (v) => (v == null ? '—' : String(Math.round(v))), trend: 'icl' },
  { key: 'plg',  label: 'PL/g',               icon: '🎣', dir: 'down', fmt: (v) => (v == null ? '—' : v.toFixed(1)),   trend: 'col', keys: PLG_KEYS },
  { key: 'incr', label: 'Incremento (mg/d)',  icon: '⚖️', dir: 'up',   fmt: (v) => (v == null ? '—' : v.toFixed(3)),   trend: 'incr' },
];

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const avgOf = (list, key) => mean(list.map((t) => t[key]).filter((v) => v !== null && v !== undefined));
const byDateAsc = (a, b) => (parseAnyDate(getField(a, F.fecha)) || 0) - (parseAnyDate(getField(b, F.fecha)) || 0);

/** Incremento de peso (mg/d) por fecha de un tanque (entre registros consecutivos con peso). */
function tankIncrByDate(lRows) {
  const sorted = [...lRows].sort(byDateAsc);
  const map = new Map(); let prev = null;
  sorted.forEach((r) => {
    const f = getField(r, F.fecha), p = parseNum(r, PESO_KEYS);
    if (p === null || !f) return;
    if (prev) { const days = (parseAnyDate(f) - parseAnyDate(prev.f)) / 86400000; if (days > 0) map.set(f, (p - prev.p) / days); }
    prev = { f, p };
  });
  return map;
}

// Estado del selector de tendencia (persistente entre re-render de la vista).
let trendVar = 'sv';

export function renderOmTex(ctx, mod) {
  const corrida = ctx.vState.corrida || null;
  const col = colorFor(ctx.allMods.indexOf(mod));
  const tanks = tanksOf(ctx, mod, corrida);

  const groups = { TEX: { tanks: [], lotes: new Set() }, OM: { tanks: [], lotes: new Set() } };
  // Tanques cuyos lotes NO permiten decidir una marca. Antes el desempate era
  // `c.OM >= c.TEX`, que mandaba SIEMPRE a Omarsa —en silencio— los tanques con lotes
  // empatados y sesgaba un veredicto que se usa para decidir proveedor. Ahora se apartan
  // y se declaran en pantalla con sus nombres.
  const unclassified = [];
  tanks.forEach((tq) => {
    const ts = tankStats(ctx, mod, tq, corrida);
    const c = { TEX: 0, OM: 0 };
    let anyLote = false;
    ts.lRows.forEach((r) => {
      const raw = getField(r, F.lote);
      if (String(raw || '').trim()) anyLote = true;
      const b = lotBrand(raw);
      if (b) c[b]++;
    });
    // Tanque SIN ningún lote anotado: no es un caso dudoso, simplemente no hay materia
    // que comparar → fuera, sin ruido.
    if (!c.TEX && !c.OM && !anyLote) return;
    // Tiene lotes pero ninguno resultó clasificable, o hay empate exacto entre marcas
    // → se declara en vez de adivinar.
    if ((!c.TEX && !c.OM) || c.TEX === c.OM) { unclassified.push(tq); return; }
    const brand = c.OM > c.TEX ? 'OM' : 'TEX';
    const defs = ts.lRows.map((r) => parseNum(r, DEF_KEYS)).filter((v) => v !== null);
    const plgs = ts.lRows.map((r) => parseNum(r, PLG_KEYS)).filter((v) => v !== null);
    const iclVals = iclSeries(ts.lRows).values.filter((v) => v !== null && v !== undefined);
    const incrs = [...tankIncrByDate(ts.lRows).values()];
    groups[brand].tanks.push({ tq, lRows: ts.lRows, pop: ts.pop, sv: ts.sv, def: mean(defs), icl: mean(iclVals), plg: mean(plgs), incr: mean(incrs) });
    ts.lotes.forEach((l) => groups[brand].lotes.add(l));
  });

  const agg = {};
  ['TEX', 'OM'].forEach((b) => {
    // `tqs` = nombres de los tanques asignados a la marca: sin ellos la tarjeta solo dice
    // "3 tanques" y no hay forma de saber CUÁL cayó en cada marca, que es justo lo que se
    // audita aquí (la asignación es por la moda del lote de cada tanque).
    agg[b] = { n: groups[b].tanks.length, lotes: [...groups[b].lotes], tqs: groups[b].tanks.map((t) => t.tq).sort(natCmp) };
    VARS.forEach((v) => { agg[b][v.key] = avgOf(groups[b].tanks, v.key); });
  });

  let html = breadcrumb(col.accent, [
    { label: '← Módulos', nav: 'modules' },
    { label: mod, nav: 'module', mod },
    { label: 'OM vs Tex' },
  ]);

  html += `<div class="sv-banner" style="background:${col.bg}">
    <div class="sv-card-orb"></div>
    <div class="sv-card-tag">⚖️ COMPARATIVA OM vs TEX</div>
    <div class="sv-banner-name">${esc(mod)}</div>
    <div class="sv-card-sub">🔄 ${corrida ? 'Corrida: ' + esc(corrida) : 'Todas las corridas'} · Promedio por tanque</div>
  </div>`;

  if (!agg.TEX.n && !agg.OM.n) {
    html += `<div class="empty-state">Sin lotes clasificables (Texcumar / Omarsa) para esta selección.</div>`;
    return { html };
  }

  // Tarjetas-resumen por marca.
  html += '<div class="omtex-cards">';
  ['TEX', 'OM'].forEach((b) => {
    const g = agg[b];
    html += `<div class="omtex-card" style="border-color:${BRANDS[b].color}">
      <div class="omtex-card-head" style="color:${BRANDS[b].color}">${BRANDS[b].icon} ${BRANDS[b].label}</div>
      <div class="omtex-card-sub">${g.n} tanque${g.n !== 1 ? 's' : ''}</div>
      <div class="omtex-card-tqs">${g.tqs.length ? g.tqs.map((t) => `<span class="omtex-tq">${esc(t)}</span>`).join('') : '<span class="muted">— sin tanques —</span>'}</div>
      <div class="omtex-card-lotes">${g.lotes.length ? '📦 ' + g.lotes.map(esc).join(' · ') : '— sin lotes —'}</div>
    </div>`;
  });
  html += '</div>';

  if (!agg.TEX.n || !agg.OM.n) {
    const missing = !agg.TEX.n ? 'Texcumar' : 'Omarsa';
    html += `<div class="sv-modal-note" style="margin:0 0 12px">⚠️ No hay lotes de <b>${missing}</b> en esta selección; la comparación muestra solo la marca presente.</div>`;
  }

  // OT5 · Veredicto (solo si ambas marcas presentes).
  // Tanques apartados: se declaran SIEMPRE. Quedan fuera de los promedios, así que hay
  // que saber sobre cuántos NO se está midiendo.
  const totalTanks = agg.TEX.n + agg.OM.n + unclassified.length;
  const uncShare = totalTanks ? unclassified.length / totalTanks : 0;
  if (unclassified.length) {
    html += `<div class="sv-modal-note" style="margin:0 0 12px">⚠️ <b>${unclassified.length} tanque(s) sin marca clara</b>
      (lotes de ambas marcas en igual proporción, o lotes que no se pueden atribuir):
      ${unclassified.map(esc).join(' · ')}.
      Quedan <b>excluidos</b> de promedios, tabla y veredicto.</div>`;
  }

  if (agg.TEX.n && agg.OM.n) html += verdictHTML(agg, uncShare);

  // OT1 · Tabla Δ.
  html += deltaTableHTML(agg);

  // Barras por variable (3 por fila, con aire respecto a la tabla Δ).
  html += '<div class="omtex-charts">';
  VARS.forEach((v) => {
    html += `<div class="card">
      <div class="sv-chart-title">${v.icon} ${esc(v.label)}</div>
      <div class="sv-chart-host omtex-chost"><canvas id="omtex_${v.key}"></canvas></div>
    </div>`;
  });
  html += '</div>';

  // OT3 + OT4 · Selector de variable + tendencia temporal por marca.
  if (!VARS.some((v) => v.key === trendVar)) trendVar = 'sv';
  html += `<div class="sv-section-title" style="margin-top:8px">📈 Tendencia temporal por marca</div>
    <div class="omtex-trend-pills">
      ${VARS.map((v) => `<button class="pill-btn ${v.key === trendVar ? 'is-active' : ''}" data-omtrend="${v.key}">${v.icon} ${esc(v.label)}</button>`).join('')}
    </div>
    <div class="card"><div class="sv-chart-host"><canvas id="omtexTrend"></canvas></div></div>`;

  // OT2 · Detalle por tanque (expandible).
  html += `<div class="sv-section-title" style="margin-top:16px">🔍 Detalle por tanque</div>`;
  ['TEX', 'OM'].forEach((b) => {
    if (!groups[b].tanks.length) return;
    const rows = groups[b].tanks.map((t) => `<tr>
        <td><b>${esc(t.tq)}</b></td>
        ${VARS.map((v) => `<td>${v.fmt(t[v.key])}</td>`).join('')}
      </tr>`).join('');
    html += `<details class="omtex-det" open>
      <summary style="color:${BRANDS[b].color}">${BRANDS[b].icon} ${BRANDS[b].label} · ${groups[b].tanks.length} tanque(s)</summary>
      <div class="card" style="padding:0;overflow:auto;margin-top:8px">
        <table class="sv-table">
          <thead><tr><th>Tanque</th>${VARS.map((v) => `<th>${v.icon} ${esc(v.label)}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>`;
  });

  // Estadío representativo (moda) por día, sobre todos los tanques de ambas marcas.
  const stageByDay = (() => {
    const m = new Map();
    ['TEX', 'OM'].forEach((b) => groups[b].tanks.forEach((t) => t.lRows.forEach((r) => {
      const f = getField(r, F.fecha), st = getField(r, ESTADIO_KEYS);
      if (!f || !st) return;
      if (!m.has(f)) m.set(f, {});
      const c = m.get(f); c[st] = (c[st] || 0) + 1;
    })));
    const out = new Map();
    m.forEach((counts, f) => { let best = null, bc = -1; for (const k in counts) { if (counts[k] > bc) { bc = counts[k]; best = k; } } out.set(f, best); });
    return out;
  })();

  // ---- Series diarias por marca (para la tendencia) ----
  // Memoizadas por (marca · variable): `drawTrend` las recalcula para AMBAS marcas en cada
  // clic de las 6 pastillas de variable, y cada cálculo recorre todos los tanques × todas
  // sus filas. Los datos no cambian mientras la vista está montada, así que basta con
  // guardar lo ya calculado; el memo vive en el render y muere con él.
  const _seriesMemo = new Map();
  const brandSeries = (brandKey, v) => {
    const memoKey = brandKey + '|' + v.key;
    if (_seriesMemo.has(memoKey)) return _seriesMemo.get(memoKey);
    const out = brandSeriesCompute(brandKey, v);
    _seriesMemo.set(memoKey, out);
    return out;
  };
  const brandSeriesCompute = (brandKey, v) => {
    const tanksB = groups[brandKey].tanks;
    const byDay = new Map(); // fecha -> [valores]
    const push = (f, val) => { if (!f || val === null || val === undefined) return; if (!byDay.has(f)) byDay.set(f, []); byDay.get(f).push(val); };
    if (v.trend === 'col') {
      tanksB.forEach((t) => t.lRows.forEach((r) => { const val = parseNum(r, v.keys); if (val !== null && (!v.pos || val > 0)) push(getField(r, F.fecha), val); }));
    } else if (v.trend === 'icl') {
      tanksB.forEach((t) => { const s = iclSeries(t.lRows); s.days.forEach((d, i) => push(d, s.values[i])); });
    } else if (v.trend === 'incr') {
      tanksB.forEach((t) => tankIncrByDate(t.lRows).forEach((val, f) => push(f, val)));
    }
    const out = new Map();
    byDay.forEach((vals, f) => out.set(f, mean(vals)));
    return out;
  };

  const after = (root) => {
    // Barras por variable con etiqueta de valor.
    VARS.forEach((v) => {
      const data = [agg.TEX[v.key], agg.OM[v.key]];
      makeChart('omtex_' + v.key, {
        type: 'bar',
        data: {
          labels: [BRANDS.TEX.label, BRANDS.OM.label],
          datasets: [{ data, backgroundColor: [BRANDS.TEX.color + 'cc', BRANDS.OM.color + 'cc'], borderColor: [BRANDS.TEX.color, BRANDS.OM.color], borderWidth: 1.5, borderRadius: 6, maxBarThickness: 80 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } },
          scales: { y: { beginAtZero: true, ticks: { callback: (val) => v.fmt(val) } }, x: { grid: { display: false } } },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        },
        plugins: [{
          id: 'omtexLbl_' + v.key,
          afterDatasetsDraw(chart) {
            const cx = chart.ctx; const meta = chart.getDatasetMeta(0);
            meta.data.forEach((el, i) => {
              if (data[i] === null || data[i] === undefined) return;
              cx.save(); cx.fillStyle = '#37474F'; cx.font = '800 13px "Segoe UI", system-ui, sans-serif';
              cx.textAlign = 'center'; cx.textBaseline = 'bottom'; cx.fillText(v.fmt(data[i]), el.x, el.y - 5); cx.restore();
            });
          },
        }],
      });
    });

    // Tendencia temporal por marca (variable seleccionable).
    const drawTrend = () => {
      const v = VARS.find((x) => x.key === trendVar) || VARS[1];
      const sTex = brandSeries('TEX', v), sOm = brandSeries('OM', v);
      const days = [...new Set([...sTex.keys(), ...sOm.keys()])].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
      const round = (x) => (x == null ? null : (v.key === 'pop' ? Math.round(x) : v.key === 'icl' ? Math.round(x) : +x.toFixed(3)));
      makeChart('omtexTrend', {
        type: 'line',
        data: {
          labels: days,
          datasets: [
            { label: BRANDS.TEX.label, data: days.map((d) => round(sTex.get(d) ?? null)), borderColor: BRANDS.TEX.color, backgroundColor: BRANDS.TEX.color + '20', tension: .3, spanGaps: true, pointRadius: 2, fill: false },
            { label: BRANDS.OM.label, data: days.map((d) => round(sOm.get(d) ?? null)), borderColor: BRANDS.OM.color, backgroundColor: BRANDS.OM.color + '20', tension: .3, spanGaps: true, pointRadius: 2, fill: false },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          scales: { y: { ticks: { callback: (val) => v.fmt(val) } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } } },
          plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { afterTitle: (it) => { const st = stageByDay.get(days[it[0].dataIndex]); return st ? 'Estadío: ' + st : ''; }, label: (c) => `${c.dataset.label}: ${v.fmt(c.parsed.y)}` } } },
        },
      });
    };
    drawTrend();

    root.querySelectorAll('[data-omtrend]').forEach((b) => b.addEventListener('click', () => {
      trendVar = b.dataset.omtrend;
      root.querySelectorAll('[data-omtrend]').forEach((x) => x.classList.toggle('is-active', x === b));
      drawTrend();
    }));
  };

  return { html, after };
}

/* ---------- OT1 · tabla Δ ---------- */
function deltaTableHTML(agg) {
  const rows = VARS.map((v) => {
    const t = agg.TEX[v.key], o = agg.OM[v.key];
    let dTxt = '—', dPct = '—', cls = '';
    if (t !== null && t !== undefined && o !== null && o !== undefined) {
      const diff = t - o; // Texcumar − Omarsa
      const sign = diff >= 0 ? '+' : '−';
      // Variables que ya son % → el Δ absoluto se rotula en PUNTOS PORCENTUALES.
      dTxt = v.pct ? `${sign}${Math.abs(diff).toFixed(1)} p.p.` : sign + v.fmt(Math.abs(diff));
      dPct = o !== 0 ? ((diff / Math.abs(o)) * 100).toFixed(1) + '%' : '—';
      const texBetter = v.dir === 'up' ? diff > 0 : diff < 0;
      cls = Math.abs(diff) < 1e-9 ? '' : (texBetter ? 'omtex-tex' : 'omtex-om');
    }
    return `<tr>
      <td><b>${v.icon} ${esc(v.label)}</b></td>
      <td>${v.fmt(t)}</td>
      <td>${v.fmt(o)}</td>
      <td class="${cls}">${dTxt}</td>
      <td class="${cls}">${dPct}</td>
    </tr>`;
  }).join('');
  return `<div class="sv-section-title" style="margin-top:8px">📋 Tabla comparativa (Δ = Texcumar − Omarsa)</div>
    <div class="card" style="padding:0;overflow:auto">
      <table class="sv-table">
        <thead><tr><th>Variable</th><th>🟧 Texcumar</th><th>🟦 Omarsa</th>
          <th title="Diferencia absoluta. En las variables que ya son porcentaje va en puntos porcentuales (p.p.)">Δ absoluto</th>
          <th title="La misma diferencia expresada como % del valor de Omarsa">Δ % relativo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- OT5 · veredicto compuesto ---------- */
function verdictHTML(agg, uncShare = 0) {
  let texWins = 0, omWins = 0, ties = 0, noData = 0;
  const badges = VARS.map((v) => {
    const t = agg.TEX[v.key], o = agg.OM[v.key];
    // SIN DATO ≠ EMPATE: antes una variable sin medir en alguna marca se mostraba como
    // "empate", que sugiere que se comparó y salió igualada. Ahora se distingue y se dice
    // sobre cuántas variables COMPARABLES se decide el veredicto.
    if (t === null || t === undefined || o === null || o === undefined) {
      noData++;
      return `<span class="omtex-badge nodata">${v.icon} ${esc(v.label)}: sin dato</span>`;
    }
    if (Math.abs(t - o) < 1e-9) { ties++; return `<span class="omtex-badge tie">${v.icon} ${esc(v.label)}: empate</span>`; }
    const texBetter = v.dir === 'up' ? t > o : t < o;
    if (texBetter) texWins++; else omWins++;
    const w = texBetter ? 'TEX' : 'OM';
    return `<span class="omtex-badge" style="border-color:${BRANDS[w].color};color:${BRANDS[w].color}">${v.icon} ${esc(v.label)}: ${BRANDS[w].label}</span>`;
  }).join('');
  const comparables = texWins + omWins + ties;
  let winner = null;
  if (texWins > omWins) winner = 'TEX'; else if (omWins > texWins) winner = 'OM';
  // Con demasiados tanques sin marca clara, el veredicto se apoyaría en una muestra que
  // no lo sostiene: mejor no coronar a nadie que coronar sobre la mitad de los datos.
  const abstain = uncShare > VERDICT_MAX_UNCLASSIFIED;
  const verdict = abstain
    ? `⚖️ <b>Sin veredicto</b> — ${Math.round(uncShare * 100)} % de los tanques quedó sin marca clara; la comparación no es concluyente`
    : winner
      ? `🏆 <b style="color:${BRANDS[winner].color}">${BRANDS[winner].label}</b> rinde mejor — gana en ${Math.max(texWins, omWins)} de ${comparables} variable${comparables === 1 ? '' : 's'} comparable${comparables === 1 ? '' : 's'}`
      : (comparables ? `🤝 Empate técnico (${texWins} a ${omWins})` : '🚫 Ninguna variable es comparable en esta selección');
  const nota = noData
    ? `<div class="omtex-verdict-note">${noData} variable${noData === 1 ? '' : 's'} sin dato en alguna de las dos marcas — no cuenta${noData === 1 ? '' : 'n'} para el veredicto.</div>`
    : '';
  return `<div class="omtex-verdict">
    <div class="omtex-verdict-head">${verdict}</div>
    ${nota}
    <div class="omtex-badges">${badges}</div>
  </div>`;
}
