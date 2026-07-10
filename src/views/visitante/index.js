/* ============================================================
   VISITANTE — Tendencia mensual de Supervivencia / Población
   Navegador de mes (estilo Producción Omarsa) que filtra toda la
   vista. Gráfico de barras por corrida del mes (toggle Superv ⇄
   Población) + tabla con el total del mes (desglose completo).
   ============================================================ */
import { makeChart, destroyChart } from '../../core/charts.js';
import { esc, fmtPop } from '../../core/format.js';
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow } from '../../core/fields.js';
import { fmtPct } from '../../core/util.js';
import { presentMonths, corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt, monthIndexOfCorrida } from '../../core/prodCalendar.js';

// Estado persistente entre re-render (ÍNDICE de mes + métrica del gráfico).
const vtState = { monthIdx: null, metric: 'superv' };

const fmtK = (v) => {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(Math.round(v));
};
const PALETTE = ['#1E88E5', '#E53935', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#6D4C41', '#3949AB', '#00897B', '#C0CA33', '#F4511E', '#5E35B1'];

/** Estadísticas por corrida del mes + totales del mes. */
function monthData(mIdx) {
  const corridas = corridasOfMonth(mIdx);
  const plgAll = [];
  const rows = corridas.map((cor) => {
    const mods = modulesOfCorrida(cor);
    const st = mods.map((m) => modCorStats(m, cor));
    const sie = st.reduce((a, s) => a + (s.siembra || 0), 0);
    const cos = st.reduce((a, s) => a + (s.cosecha || 0), 0);
    const sup = sie > 0 ? Math.min(cos / sie * 100, 100) : null;
    st.forEach((s) => { if (s.plg !== null && s.plg !== undefined) plgAll.push(s.plg); });
    return { cor, mods, sie, cos, sup };
  });
  const sumSie = rows.reduce((a, r) => a + r.sie, 0);
  const sumCos = rows.reduce((a, r) => a + r.cos, 0);
  const monthSup = sumSie > 0 ? Math.min(sumCos / sumSie * 100, 100) : null;
  const plgAvg = plgAll.length ? plgAll.reduce((a, b) => a + b, 0) / plgAll.length : null; // promedio del mes (por módulo·corrida)
  return { rows, sumSie, sumCos, monthSup, plgAvg, nCorridas: corridas.length };
}

/* ============================================================
   RESUMEN DEL MES (Larvicultura · Revisiones · Biomol) para público general.
   Lenguaje llano, sin siglas técnicas. Todo se acota al mismo mes (por corrida).
   ============================================================ */
const modNum = (s) => { const m = String(s).match(/\d+/); return m ? +m[0] : null; };
// Mes (bucket por corrida) de una fila cualquiera con columna Corrida.
const rowMonth = (r) => { const n = parseInt(String(getField(r, F.corrida)).replace(/\D/g, ''), 10); return Number.isNaN(n) ? -1 : monthIndexOfCorrida(n); };

// Lectura mínima de Biomol (NO se importa la vista lazy para no inflar el bundle base).
const BIO_KEYS = {
  IHHNV: ['IHHNV', 'ihhnv', 'CC', 'cc'], WSSV: ['WSSV', 'wssv', 'DD', 'dd'], BP: ['BP', 'bp', 'EE', 'ee'],
  AHPND: ['AHPND', 'AHPND/EMS', 'ahpnd', 'EMS', 'ems', 'PP', 'pp'], NHPB: ['NHPB', 'NHP', 'NHP-B', 'nhpb', 'nhp', 'NN', 'nn'], EHP: ['EHP', 'ehp'],
};
const bioIsPos = (raw) => ['positivo', 'positive', 'pos', 'p', '1', 'si', 'sí'].includes(String(raw || '').toLowerCase());
const bioIsMeas = (raw) => bioIsPos(raw) || ['negativo', 'negative', 'neg', 'n', '0', 'no'].includes(String(raw || '').toLowerCase());

/** Indicadores de alto nivel del mes (semáforos + conteos). */
function monthSummary(mIdx, monthSup) {
  const G = store.globalData;

  // Calidad de larvas (proxy: supervivencia promedio del mes).
  let calTier = 'x', calText = 'Sin datos';
  if (monthSup != null) {
    if (monthSup >= 70) { calTier = 'v'; calText = 'Buena'; }
    else if (monthSup >= 40) { calTier = 'a'; calText = 'Regular'; }
    else { calTier = 'r'; calText = 'Atención'; }
  }

  // Cobertura de supervisión: módulos revisados / módulos en producción del mes.
  const prodMods = new Set();
  corridasOfMonth(mIdx).forEach((cor) => modulesOfCorrida(cor).forEach((m) => { const n = modNum(m); if (n != null) prodMods.add(n); }));
  const revRows = G.filter((r) => r._SheetOrigin === 'Registro_Supervision' && rowMonth(r) === mIdx);
  const revMods = new Set();
  revRows.forEach((r) => { const n = modNum(getField(r, F.modulo)); if (n != null) revMods.add(n); });
  // Cobertura = módulos EN PRODUCCIÓN que fueron revisados (intersección), para que
  // coincida con la ventana de detalle y nunca supere el total (evita "5 de 4").
  const covY = prodMods.size || revMods.size;
  const covX = prodMods.size ? [...prodMods].filter((n) => revMods.has(n)).length : revMods.size;

  // Estado de revisiones (tasa de hallazgos por revisión).
  let revTier = 'x', revText = 'Sin datos', revCtx = 'Sin revisiones este mes';
  if (revRows.length) {
    const findings = revRows.reduce((s, r) =>
      s + String(getField(r, ['Observaciones', 'observaciones', 'Observación', 'observación'])).split(/[,;]+/).map((x) => x.trim()).filter(Boolean).length, 0);
    const rate = findings / revRows.length;
    if (rate <= 0.5) { revTier = 'v'; revText = 'Sin novedades'; }
    else if (rate <= 1.5) { revTier = 'a'; revText = 'Con observaciones'; }
    else { revTier = 'r'; revText = 'Requiere atención'; }
    revCtx = `${revRows.length} revisión(es)`;
  }

  // Sanidad (Biomol): % positivos de las muestras de las corridas del mes.
  const bioRows = G.filter((r) => r._SheetOrigin === 'Biomol' && rowMonth(r) === mIdx);
  let positives = 0, measured = 0;
  bioRows.forEach((r) => Object.values(BIO_KEYS).forEach((keys) => { const v = getField(r, keys); if (bioIsMeas(v)) { measured++; if (bioIsPos(v)) positives++; } }));
  let bioTier = 'x', bioText = 'Sin análisis', bioCtx = 'Sin muestras de laboratorio';
  if (bioRows.length) {
    if (!measured) { bioTier = 'x'; bioText = 'Sin análisis'; }
    else if (positives === 0) { bioTier = 'v'; bioText = 'Sin patógenos detectados'; }
    else { bioTier = 'r'; bioText = `${positives} detección(es)`; }
    bioCtx = `${bioRows.length} muestra(s) analizada(s)`;
  }

  return { calTier, calText, covX, covY, revTier, revText, revCtx, bioTier, bioText, bioCtx, bioSamples: bioRows.length };
}

// Chip de semáforo con TEXTO (no solo color → accesible).
function semChip(tier, text) {
  const map = { v: ['#2E9E5B', '🟢'], a: ['#E6A100', '🟡'], r: ['#D64545', '🔴'], x: ['#90A4AE', '⚪'] };
  const [c, dot] = map[tier] || map.x;
  return `<span style="color:${c}">${dot} ${esc(text)}</span>`;
}

/* ============================================================
   RESUMEN DE MICROALGAS — lector mínimo LOCAL de la hoja Lab_Algas,
   acotado al MISMO mes (por Corrida_Larv). No importa la vista Algas
   para no inflar el bundle (mismo patrón que el lector Biomol).
   ============================================================ */
const ALG_KEYS = {
  corrida: ['Corrida_Larv', 'Corrida_larv', 'corrida_larv', 'Corrida', 'corrida'],
  modulo: ['Modulo_Larv', 'Módulo_Larv', 'modulo_larv', 'Modulo', 'Módulo'],
  sistema: ['Sistema', 'sistema'],
  cel: ['Cel_ml', 'Cel/ml', 'cel_ml', 'Cel_mL', 'Cel/mL'],
  protoz: ['Protozoarios', 'protozoarios'],
  descartado: ['Descartado', 'descartado'],
  obs: ['Observaciones', 'observaciones', 'Observación', 'observación'],
};
const ALG_SYS_CATS = ['Masivos', 'Premasivos', 'Fundas', 'Carboys', 'PBR', 'Otros'];
function algSysCat(s) { const u = String(s || '').trim().toUpperCase(); if (!u) return null; if (u.startsWith('PBR')) return 'PBR'; if (u.startsWith('PM')) return 'Premasivos'; if (u === 'FM' || u === 'FP' || /^F/.test(u)) return 'Fundas'; if (/^C\d/.test(u)) return 'Carboys'; if (/^M\d/.test(u)) return 'Masivos'; return 'Otros'; }
const algIsDesc = (r) => /^s[ií]$/i.test(String(getField(r, ALG_KEYS.descartado)).trim());
function algMonthOf(r) { const n = parseInt(String(getField(r, ALG_KEYS.corrida)).replace(/\D/g, ''), 10); return Number.isNaN(n) ? -1 : monthIndexOfCorrida(n); }
function algRowsOfMonth(mIdx) { return store.globalData.filter((r) => r._SheetOrigin === 'Lab_Algas' && algMonthOf(r) === mIdx); }

/** Resumen de microalgas del mes (densidad, cultivos activos, descarte, protozoarios). */
function algasSummary(mIdx) {
  const R = algRowsOfMonth(mIdx);
  const cels = R.map((r) => parseNum(r, ALG_KEYS.cel)).filter((v) => v !== null && v >= 0);
  const proto = R.map((r) => parseNum(r, ALG_KEYS.protoz)).filter((v) => v !== null);
  const protoAlert = proto.filter((v) => v >= 5).length;
  const desc = R.filter(algIsDesc).length;
  const cult = new Set();
  R.forEach((r) => { const s = getField(r, ALG_KEYS.sistema); if (s) cult.add((getField(r, ALG_KEYS.corrida) || '') + '|' + s); });
  return {
    n: R.length,
    densAvg: cels.length ? cels.reduce((a, b) => a + b, 0) / cels.length : null,
    densMin: cels.length ? Math.min(...cels) : null,
    densMax: cels.length ? Math.max(...cels) : null,
    cultivos: cult.size,
    desc, descPct: R.length ? desc / R.length * 100 : 0,
    protoAlert, protoPct: proto.length ? protoAlert / proto.length * 100 : 0,
  };
}

/** Bloque “🌿 Microalgas” (2 tarjetas clicables, estilo algas) para Visitante. */
function algasSummaryBlock(mIdx) {
  const s = algasSummary(mIdx);
  if (!s.n) return ''; // sin datos de algas en el mes → no se muestra la sección
  const sanTier = (s.descPct >= 20 || s.protoPct >= 25) ? 'r' : (s.descPct >= 10 || s.protoPct >= 10) ? 'a' : 'v';
  return `<div class="card vt-card">
    <div class="vt-card-title" style="color:#015B76">🌿 Microalgas · ${esc(monthLabelAt(mIdx))} <span class="muted" style="font-weight:600;font-size:12px">· laboratorio de algas</span></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${sumCard('🌿', 'Cultivos de microalgas', `${s.cultivos} cultivos`, `densidad prom. ${fmtK(s.densAvg)} cel/ml`, 'algasCultivos', '#015B76')}
      ${sumCard('🦠', 'Sanidad de las algas', semChip(sanTier, `${s.descPct.toFixed(0)}% descarte`), `${s.desc} descartado(s) · protoz. altos en ${s.protoAlert} reg.`, 'algasSanidad', '#015B76')}
    </div>
  </div>`;
}

// Tarjeta de resumen (valueHtml = HTML controlado; label/context se escapan).
// `key` (opcional) la vuelve clicable → abre la ventana de detalle.
function sumCard(icon, label, valueHtml, context, key, accent) {
  const interactive = key ? ` data-sum="${key}" role="button" tabindex="0" title="Clic para ver el detalle"` : '';
  const cursor = key ? ';cursor:pointer' : '';
  const chevron = key ? ' <span style="opacity:.45">›</span>' : '';
  const accentStyle = accent ? `;border-top:3px solid ${accent}` : '';
  return `<div class="vt-sum-card"${interactive} style="flex:1 1 160px;min-width:160px;background:var(--c-surface);border:1px solid var(--c-border);border-radius:14px;padding:13px 15px;box-shadow:0 1px 2px rgba(0,0,0,.04)${cursor}${accentStyle}">
    <div style="font-size:12px;color:var(--c-text-soft);font-weight:600">${icon} ${esc(label)}${chevron}</div>
    <div style="font-size:19px;font-weight:800;margin:5px 0;color:var(--c-text);line-height:1.2">${valueHtml}</div>
    <div style="font-size:11px;color:var(--c-text-muted)">${esc(context)}</div>
  </div>`;
}

/** Bloque “Resumen del mes” (6 tarjetas) para Visitante. */
function summaryBlock(mIdx, monthSup, label) {
  const s = monthSummary(mIdx, monthSup);
  const covBar = s.covY ? Math.round(s.covX / s.covY * 100) : 0;
  const covVal = `${s.covX} de ${s.covY}<div style="height:6px;background:var(--c-surface-2);border-radius:4px;margin-top:5px;overflow:hidden"><div style="height:100%;width:${covBar}%;background:#3F51B5"></div></div>`;
  return `<div class="card vt-card">
    <div class="vt-card-title">📊 Resumen del mes · ${esc(label)} <span class="muted" style="font-weight:600;font-size:12px">· panorama general</span></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${sumCard('🦐', 'Calidad de las larvas', semChip(s.calTier, s.calText), 'Según la supervivencia promedio', 'calidad')}
      ${sumCard('📈', 'Supervivencia promedio', fmtPct(monthSup), 'Cosecha ÷ siembra del mes', 'superv')}
      ${sumCard('🔍', 'Cobertura de supervisión', covVal, 'módulos revisados', 'cobertura')}
      ${sumCard('⚠️', 'Estado de revisiones', semChip(s.revTier, s.revText), s.revCtx, 'revisiones')}
      ${sumCard('🧬', 'Sanidad (laboratorio)', semChip(s.bioTier, s.bioText), s.bioCtx, 'sanidad')}
      ${sumCard('🧪', 'Análisis realizados', String(s.bioSamples), 'muestras de laboratorio', 'analisis')}
    </div>
  </div>`;
}

/* ============================================================
   VENTANA DE DETALLE de las tarjetas del resumen (clic en una tarjeta).
   ============================================================ */
const avgOf = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const detailTable = (headers, body) =>
  `<table class="sv-table vt-table" style="width:100%">
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody></table>`;
// KPI-píldora con acento de algas (teal) para el detalle de Microalgas.
const algKpi = (label, value) => `<span style="background:rgba(1,91,118,.08);border:1px solid rgba(1,91,118,.22);border-radius:999px;padding:5px 12px;font-size:12px;color:var(--c-text-soft);font-weight:700"><b style="color:#015B76;margin-right:4px">${esc(String(value))}</b>${esc(label)}</span>`;
const algTealP = (txt) => `<p style="font-size:12px;color:#015B76;font-weight:700;margin:14px 0 6px">${esc(txt)}</p>`;

/** Construye { title, html } del detalle de una tarjeta para un mes dado. */
function sumDetail(key, mIdx, monthSup) {
  const G = store.globalData;
  const numAvg = (rows, keys) => avgOf(rows.map((r) => parseNum(r, keys)).filter((v) => v !== null));

  if (key === 'calidad') {
    const rows = G.filter((r) => isLarviculturaRow(r) && rowMonth(r) === mIdx);
    const VARS = [
      ['Supervivencia', F.supervivencia, '%'],
      ['Deformidad', ['Deformidad', 'deformidad'], '%'],
      ['Intestino lleno', ['Intestino_Lleno', 'IntestinoLleno', 'intestino_lleno'], '%'],
      ['Intestino vacío', ['Intestino_Vacio', 'Intestino_Vacío', 'intestino_vacio'], '%'],
      ['% Actividad', ['% Actividad', 'Actividad', '%Actividad'], '%'],
      ['Estrés', ['Estrés', 'Estres', 'estrés', 'estres'], ''],
    ];
    const body = VARS.map(([lbl, keys, u]) => { const v = numAvg(rows, keys); return v === null ? '' : `<tr><td>${esc(lbl)}</td><td><b>${v.toFixed(1)}${u}</b></td></tr>`; }).filter(Boolean).join('');
    return { title: '🦐 Calidad de las larvas', html: body
      ? `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">Promedios del mes · todas las corridas (${rows.length} registro(s)).</p>${detailTable(['Variable', 'Promedio'], body)}`
      : '<p style="color:var(--c-text-muted)">Sin datos de calidad para este mes.</p>' };
  }

  if (key === 'superv') {
    const d = monthData(mIdx);
    const body = d.rows.map((r) => `<tr><td><b>C${esc(r.cor)}</b></td><td>${fmtPop(r.sie || null)}</td><td>${fmtPop(r.cos || null)}</td><td><b>${fmtPct(r.sup)}</b></td></tr>`).join('');
    return { title: '📈 Supervivencia por corrida', html: d.rows.length
      ? `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">Desglose por corrida del mes (supervivencia general: <b>${fmtPct(monthSup)}</b>).</p>${detailTable(['Corrida', 'Siembra', 'Cosecha', 'Supervivencia'], body)}`
      : '<p style="color:var(--c-text-muted)">Sin corridas este mes.</p>' };
  }

  if (key === 'cobertura') {
    const prod = [];
    corridasOfMonth(mIdx).forEach((cor) => modulesOfCorrida(cor).forEach((m) => { const n = modNum(m); if (n != null && !prod.includes(n)) prod.push(n); }));
    prod.sort((a, b) => a - b);
    const revSet = new Set();
    G.filter((r) => r._SheetOrigin === 'Registro_Supervision' && rowMonth(r) === mIdx).forEach((r) => { const n = modNum(getField(r, F.modulo)); if (n != null) revSet.add(n); });
    const body = prod.map((n) => `<tr><td><b>M${String(n).padStart(2, '0')}</b></td><td>${revSet.has(n) ? '<span style="color:#2E9E5B;font-weight:700">✅ Revisado</span>' : '<span style="color:var(--c-text-muted)">⭕ Sin revisar</span>'}</td></tr>`).join('');
    return { title: '🔍 Cobertura de supervisión', html: prod.length
      ? `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">${prod.filter((n) => revSet.has(n)).length} de ${prod.length} módulos del mes revisados.</p>${detailTable(['Módulo', 'Estado'], body)}`
      : '<p style="color:var(--c-text-muted)">Sin módulos en producción este mes.</p>' };
  }

  if (key === 'revisiones') {
    const revRows = G.filter((r) => r._SheetOrigin === 'Registro_Supervision' && rowMonth(r) === mIdx);
    const map = new Map();
    revRows.forEach((r) => String(getField(r, ['Observaciones', 'observaciones', 'Observación', 'observación'])).split(/[,;]+/).map((x) => x.trim()).filter(Boolean).forEach((o) => map.set(o, (map.get(o) || 0) + 1)));
    const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const body = top.map(([o, c]) => `<tr><td>${esc(o)}</td><td><b>${c}</b></td></tr>`).join('');
    return { title: '⚠️ Estado de revisiones', html: revRows.length
      ? `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">${revRows.length} revisión(es) · observaciones más frecuentes.</p>${top.length ? detailTable(['Observación', 'Veces'], body) : '<p style="color:var(--c-text-muted)">Sin observaciones registradas.</p>'}`
      : '<p style="color:var(--c-text-muted)">Sin revisiones este mes.</p>' };
  }

  if (key === 'sanidad' || key === 'analisis') {
    const bioRows = G.filter((r) => r._SheetOrigin === 'Biomol' && rowMonth(r) === mIdx);
    if (key === 'sanidad') {
      const DIAG_LABEL = { IHHNV: 'IHHNV', WSSV: 'WSSV', BP: 'BP', AHPND: 'AHPND/EMS', NHPB: 'NHPB', EHP: 'EHP' };
      const body = Object.entries(BIO_KEYS).map(([dg, keys]) => {
        let meas = 0, pos = 0;
        bioRows.forEach((r) => { const v = getField(r, keys); if (bioIsMeas(v)) { meas++; if (bioIsPos(v)) pos++; } });
        const pct = meas ? Math.round(pos / meas * 100) : null;
        const col = pct === null ? '#90a4ae' : pct === 0 ? '#2E9E5B' : '#D64545';
        return `<tr><td><b>${esc(DIAG_LABEL[dg])}</b></td><td>${meas}</td><td>${pos}</td><td style="color:${col};font-weight:800">${pct === null ? '—' : pct + '%'}</td></tr>`;
      }).join('');
      return { title: '🧬 Sanidad por diagnóstico', html: bioRows.length
        ? `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">${bioRows.length} muestra(s) · % de positivos por diagnóstico.</p>${detailTable(['Diagnóstico', 'Medidas', 'Positivos', '% Positivos'], body)}`
        : '<p style="color:var(--c-text-muted)">Sin análisis de laboratorio este mes.</p>' };
    }
    const map = new Map();
    bioRows.forEach((r) => { const l = getField(r, ['Lugar', 'lugar']) || 'Sin lugar'; map.set(l, (map.get(l) || 0) + 1); });
    const body = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => `<tr><td>${esc(l)}</td><td><b>${c}</b></td></tr>`).join('');
    return { title: '🧪 Análisis realizados', html: bioRows.length
      ? `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">${bioRows.length} muestra(s) analizada(s) · por lugar.</p>${detailTable(['Lugar', 'Muestras'], body)}`
      : '<p style="color:var(--c-text-muted)">Sin análisis de laboratorio este mes.</p>' };
  }

  if (key === 'algasCultivos' || key === 'algasSanidad') {
    const R = algRowsOfMonth(mIdx);
    if (!R.length) return { title: '🌿 Microalgas', html: '<p style="color:var(--c-text-muted)">Sin registros de microalgas este mes.</p>' };
    const s = algasSummary(mIdx);
    const gA = (r, k) => getField(r, ALG_KEYS[k]);
    const nA = (r, k) => parseNum(r, ALG_KEYS[k]);

    if (key === 'algasCultivos') {
      const kpis = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">
        ${algKpi('registros', s.n)}${algKpi('cultivos', s.cultivos)}${algKpi('cel/ml prom.', fmtK(s.densAvg))}${algKpi('cel/ml máx.', fmtK(s.densMax))}${algKpi('% descarte', s.descPct.toFixed(1) + '%')}</div>`;
      const cat = ALG_SYS_CATS.map((c) => {
        const rr = R.filter((r) => algSysCat(gA(r, 'sistema')) === c); if (!rr.length) return null;
        const cc = rr.map((r) => nA(r, 'cel')).filter((v) => v !== null);
        const cu = new Set(rr.map((r) => (gA(r, 'corrida') || '') + '|' + gA(r, 'sistema'))).size;
        return { c, n: rr.length, cu, dens: cc.length ? cc.reduce((a, b) => a + b, 0) / cc.length : null };
      }).filter(Boolean);
      const catBody = cat.map((x) => `<tr><td><b>${esc(x.c)}</b></td><td>${x.cu}</td><td>${x.n}</td><td>${x.dens === null ? '—' : fmtK(x.dens) + ' cel/ml'}</td></tr>`).join('');
      const modMap = new Map(); R.forEach((r) => { const m = gA(r, 'modulo'), v = nA(r, 'cel'); if (m && v !== null) modMap.set(m, (modMap.get(m) || 0) + v); });
      const modBody = [...modMap.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => `<tr><td><b>${esc(m)}</b></td><td>${fmtK(v)} cel/ml</td></tr>`).join('');
      const obs = R.filter((r) => gA(r, 'obs')).slice(0, 8);
      const obsBody = obs.map((r) => `<tr><td><b>${esc(gA(r, 'sistema') || '—')}</b></td><td>${esc(gA(r, 'obs'))}</td></tr>`).join('');
      return { title: '🌿 Microalgas · cultivos', html:
        `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">Laboratorio de microalgas del mes (${R.length} registro(s)).</p>${kpis}`
        + algTealP('⚙️ Por categoría') + detailTable(['Categoría', 'Cultivos', 'Registros', 'Densidad prom.'], catBody)
        + (modBody ? algTealP('🔗 Módulos abastecidos · Σ cel/ml') + detailTable(['Módulo', 'Biomasa'], modBody) : '')
        + (obsBody ? algTealP('📝 Observaciones') + detailTable(['Sistema', 'Observación'], obsBody) : '') };
    }

    // algasSanidad
    const cat = ALG_SYS_CATS.map((c) => {
      const rr = R.filter((r) => algSysCat(gA(r, 'sistema')) === c); if (!rr.length) return null;
      const pa = rr.map((r) => nA(r, 'protoz')).filter((v) => v !== null).filter((v) => v >= 5).length;
      const d = rr.filter(algIsDesc).length;
      return { c, n: rr.length, pa, d, descPct: rr.length ? d / rr.length * 100 : 0 };
    }).filter(Boolean);
    const catBody = cat.map((x) => `<tr><td><b>${esc(x.c)}</b></td><td>${x.pa}</td><td>${x.d}</td><td>${x.descPct.toFixed(1)}%</td></tr>`).join('');
    const kpis = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">
      ${algKpi('descartados', s.desc)}${algKpi('% descarte', s.descPct.toFixed(1) + '%')}${algKpi('protoz. ≥ 5', s.protoAlert + ' reg.')}</div>`;
    return { title: '🦠 Microalgas · sanidad', html:
      `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">Descarte y contaminación de microalgas del mes (${R.length} registro(s)).</p>${kpis}`
      + algTealP('🦠 Por categoría') + detailTable(['Categoría', 'Protoz. ≥ 5', 'Descartados', '% Descarte'], catBody) };
  }

  return { title: 'Detalle', html: '<p style="color:var(--c-text-muted)">Sin detalle.</p>' };
}

/** HTML del overlay de detalle (una sola vez por montaje de la vista). */
function sumModalHTML() {
  return `<div id="vtSumModal" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.45);align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto">
    <div style="background:var(--c-surface);border-radius:16px;max-width:680px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid var(--c-border-soft)">
        <span id="vtSumTitle" style="font-size:16px;font-weight:800;color:var(--c-text)"></span>
        <button id="vtSumClose" style="border:none;background:var(--c-surface-2);border-radius:8px;padding:6px 11px;cursor:pointer;font-size:13px;color:var(--c-text-soft)">✕ Cerrar</button>
      </div>
      <div id="vtSumBody" style="padding:16px 20px"></div>
    </div>
  </div>`;
}

let vtEscHandler = null;
function closeSumModal() {
  const m = document.getElementById('vtSumModal'); if (m) m.style.display = 'none';
  document.body.classList.remove('modal-open');
  if (vtEscHandler) { document.removeEventListener('keydown', vtEscHandler); vtEscHandler = null; }
}
function openSumModal(key, mIdx, monthSup) {
  const m = document.getElementById('vtSumModal'); if (!m) return;
  const { title, html } = sumDetail(key, mIdx, monthSup);
  document.getElementById('vtSumTitle').textContent = title;
  document.getElementById('vtSumBody').innerHTML = html;
  m.style.display = 'flex';
  document.body.classList.add('modal-open'); // pausa el auto-refresco mientras está abierto
  vtEscHandler = (e) => { if (e.key === 'Escape') closeSumModal(); };
  document.addEventListener('keydown', vtEscHandler);
}

export function visitanteView(root) {
  // Limpia un posible handler de Escape huérfano (si se navegó con el detalle abierto).
  if (vtEscHandler) { document.removeEventListener('keydown', vtEscHandler); vtEscHandler = null; }
  const months = presentMonths();
  if (!months.length) {
    root.innerHTML = '<div class="empty-state" style="padding:64px 20px">Sin datos de producción para mostrar.</div>';
    return;
  }
  // Posición inicial por el ÍNDICE de mes recordado (robusto ante refrescos que
  // cambien la lista de meses); si ese mes ya no está presente, el más reciente.
  let pos = vtState.monthIdx === null ? -1 : months.indexOf(vtState.monthIdx);
  if (pos < 0) pos = months.length - 1;

  root.innerHTML = `<div class="vt-view">
    <div class="vt-head">
      <div class="vt-title">🚪 Tendencia mensual · Supervivencia y Población</div>
      <div class="vt-sub">Desliza para cambiar de mes — filtra todo el panel.</div>
    </div>
    <div id="vtWrap"></div>
  </div>` + sumModalHTML();
  const wrap = root.querySelector('#vtWrap');

  // Cierre de la ventana de detalle (✕ o clic en el fondo) — se vincula una vez.
  const sumModal = root.querySelector('#vtSumModal');
  sumModal.querySelector('#vtSumClose').addEventListener('click', closeSumModal);
  sumModal.addEventListener('click', (e) => { if (e.target === sumModal) closeSumModal(); });

  function paint() {
    destroyChart('vtChart'); // libera la instancia previa antes de reemplazar el canvas (evita charts huérfanos)
    vtState.monthIdx = months[pos]; // recuerda el MES (no la posición) entre re-render/refrescos
    const mIdx = months[pos];
    const label = monthLabelAt(mIdx);
    const d = monthData(mIdx);
    const isPop = vtState.metric === 'pop';

    const slider = months.length > 1
      ? `<input type="range" class="prod-slider" data-vtslider min="0" max="${months.length - 1}" value="${pos}" step="1">`
      : '';

    wrap.innerHTML = `
      <div class="card vt-card">
        <div class="prod-nav">
          <button class="prod-nav-btn" data-vtprev ${pos <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
          <div class="prod-title">📅 <b>${esc(label)}</b> <span class="muted">(${d.nCorridas} corrida${d.nCorridas === 1 ? '' : 's'})</span></div>
          <button class="prod-nav-btn" data-vtnext ${pos >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
        </div>
        ${slider}
        <div class="vt-metricbar">
          <button class="vt-pill ${!isPop ? 'is-active' : ''}" data-vtmetric="superv">📈 Supervivencia</button>
          <button class="vt-pill ${isPop ? 'is-active' : ''}" data-vtmetric="pop">👥 Población</button>
        </div>
        <div class="vt-chart-host"><canvas id="vtChart"></canvas></div>
        <div class="vt-note">${isPop ? 'Población (cosecha) = Σ última población registrada por tanque.' : 'Supervivencia = Σ última población / Σ primera población × 100.'} Una barra por corrida del mes.</div>
      </div>

      <div class="card vt-card">
        <div class="vt-card-title">📋 Total del mes · ${esc(label)}</div>
        <div style="overflow:auto">
          <table class="sv-table vt-table">
            <thead><tr><th>Mes</th><th>Nº corridas</th><th>Siembra total</th><th>Cosecha total (Población)</th><th>Supervivencia total</th><th>PL/g (manual)</th></tr></thead>
            <tbody>
              <tr class="vt-total-row">
                <td><b>${esc(label)}</b></td>
                <td>${d.nCorridas}</td>
                <td>${fmtPop(d.sumSie || null)}</td>
                <td><b>${fmtPop(d.sumCos || null)}</b></td>
                <td><b>${fmtPct(d.monthSup)}</b></td>
                <td><b>${d.plgAvg === null ? '—' : d.plgAvg.toFixed(1)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      ${summaryBlock(mIdx, d.monthSup, label)}
      ${algasSummaryBlock(mIdx)}`;

    // Gráfico de barras por corrida.
    const labels = d.rows.map((r) => 'C' + r.cor);
    const data = d.rows.map((r) => (isPop ? r.cos : r.sup));
    const colors = d.rows.map((_, i) => PALETTE[i % PALETTE.length]);
    makeChart('vtChart', {
      type: 'bar',
      data: { labels, datasets: [{ label: isPop ? 'Población (cosecha)' : 'Supervivencia (%)', data, backgroundColor: colors.map((c) => c + 'cc'), borderColor: colors, borderWidth: 1, borderRadius: 5, maxBarThickness: 70 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: isPop
            ? { beginAtZero: true, ticks: { callback: (v) => fmtK(v) }, title: { display: true, text: 'Población' } }
            : { beginAtZero: true, suggestedMax: 100, ticks: { callback: (v) => v + '%' }, title: { display: true, text: 'Supervivencia' } },
          x: { grid: { display: false }, title: { display: true, text: 'Corrida' } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            // Título: corrida + módulo(s) que la componen (p. ej. "C573 · M06, M07").
            title: (items) => { const r = d.rows[items[0].dataIndex]; const m = r && r.mods && r.mods.length ? ' · ' + r.mods.join(', ') : ''; return 'C' + (r ? r.cor : '') + m; },
            label: (c) => (isPop ? ' Población: ' + fmtPop(c.parsed.y) : ' Supervivencia: ' + fmtPct(c.parsed.y)),
          } },
        },
      },
    });

    wire();
  }

  function wire() {
    wrap.querySelector('[data-vtprev]')?.addEventListener('click', () => { if (pos > 0) { pos--; paint(); } });
    wrap.querySelector('[data-vtnext]')?.addEventListener('click', () => { if (pos < months.length - 1) { pos++; paint(); } });
    wrap.querySelector('[data-vtslider]')?.addEventListener('input', (e) => { pos = +e.target.value; paint(); });
    wrap.querySelectorAll('[data-vtmetric]').forEach((b) => b.addEventListener('click', () => { vtState.metric = b.dataset.vtmetric; paint(); }));
    // Tarjetas del resumen → ventana de detalle (clic o Enter/Espacio).
    wrap.querySelectorAll('[data-sum]').forEach((c) => {
      const open = () => openSumModal(c.dataset.sum, months[pos], monthData(months[pos]).monthSup);
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  paint();
}
