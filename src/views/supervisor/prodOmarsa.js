/* ============================================================
   SUPERVISOR · Tabla "Producción Omarsa" (Vista Ejecutiva)
   Presentación (HTML) del resumen mensual por módulo, agrupado por corrida.
   La lógica pura del calendario (corrida→mes, agregados por módulo+corrida)
   vive en core/prodCalendar.js, compartida por todas las vistas.
   ============================================================ */
import { corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt } from '../../core/prodCalendar.js';
import { fmtPop, esc } from '../../core/format.js';

const fmt1 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
const fmt2 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(2);
const pctTxt = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1) + '%';
// Densidad de siembra = promedio por tanque de (cantidad sembrada / 28 / 1000).
// siembra = suma de la 1ª población por tanque; nSie = nº de tanques sembrados.
const densSie = (siembra, nSie) => (siembra !== null && siembra !== undefined && nSie > 0)
  ? (siembra / nSie) / 28 / 1000 : null;

/** HTML de la tabla del mes en posición `pos` (incluye navegación). */
export function prodTableHTML(months, pos) {
  const mIdx = months[pos];
  const label = monthLabelAt(mIdx);
  const corridas = corridasOfMonth(mIdx);

  // Estadísticos por corrida (precomputados para poder ubicar la fila "Subtotal actual").
  const corData = corridas.map((cor) => {
    const mods = modulesOfCorrida(cor);
    const stats = mods.map((m) => ({ m, ...modCorStats(m, cor) }));
    const corCos = stats.reduce((a, s) => a + (s.cosecha || 0), 0);
    const corSie = stats.reduce((a, s) => a + (s.siembra || 0), 0);
    const corSup = corSie > 0 ? Math.min(corCos / corSie * 100, 100) : null;
    // Corrida despachada = TODOS sus módulos COMPLETAMENTE despachados (mismo criterio
    // que el badge "Despachado" de las tarjetas: todos los tanques reales con despacho).
    const despachada = stats.length > 0 && stats.every((s) => s.despachadoFull);
    return { cor, mods, stats, corCos, corSie, corSup, despachada };
  });

  // Corridas despachadas (en CUALQUIER posición, no solo el prefijo inicial): el
  // "Subtotal actual" suma TODAS las despachadas y se inserta tras la ÚLTIMA de ellas.
  const dispatchedIdx = corData.reduce((acc, c, i) => { if (c.despachada) acc.push(i); return acc; }, []);
  const lastDispatched = dispatchedIdx.length ? dispatchedIdx[dispatchedIdx.length - 1] : -1;
  // El subtotal desaparece cuando IGUALARÍA al Total: no solo si TODAS están despachadas,
  // sino también si las corridas pendientes no aportan siembra/cosecha (subtotal == total
  // numéricamente) → la franja sería redundante. Se compara siembra y cosecha acumuladas.
  const grandCos = corData.reduce((a, c) => a + c.corCos, 0);
  const grandSie = corData.reduce((a, c) => a + c.corSie, 0);
  const subCosTot = dispatchedIdx.reduce((a, i) => a + corData[i].corCos, 0);
  const subSieTot = dispatchedIdx.reduce((a, i) => a + corData[i].corSie, 0);
  const subEqualsTotal = subCosTot === grandCos && subSieTot === grandSie;
  const showSubtotal = dispatchedIdx.length > 0 && !subEqualsTotal;

  let body = '', sumSie = 0, sumCos = 0, sumNSie = 0; const plgs = [];
  let subSie = 0, subCos = 0, subNSie = 0; const subPlgs = [];  // acumuladores del subtotal
  corData.forEach((c, ci) => {
    const { cor, mods, stats, corCos, corSup } = c;
    stats.forEach((s, j) => {
      if (s.siembra) sumSie += s.siembra;
      if (s.cosecha) sumCos += s.cosecha;
      if (s.nSie) sumNSie += s.nSie;
      if (s.plg !== null) plgs.push(s.plg);
      if (c.despachada) {
        if (s.siembra) subSie += s.siembra;
        if (s.cosecha) subCos += s.cosecha;
        if (s.nSie) subNSie += s.nSie;
        if (s.plg !== null) subPlgs.push(s.plg);
      }
      body += `<tr>
        <td><b>${esc(s.m)}</b></td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-cor">${esc(cor)}</td>` : ''}
        <td>${fmtPop(s.siembra)}</td>
        <td>${fmt2(densSie(s.siembra, s.nSie))}</td>
        <td>${fmt1(s.plg)}</td>
        <td>${fmtPop(s.cosecha)}</td>
        <td>${pctTxt(s.superv)}</td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-tot"><b>${fmtPop(corCos || null)}</b></td>` : ''}
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-tot">${corSup === null ? '—' : '<b>' + pctTxt(corSup) + '</b>'}</td>` : ''}
      </tr>`;
    });
    // Insertar el "Subtotal actual" tras la ÚLTIMA corrida despachada (sume o no un
    // prefijo contiguo), solo si hay ≥1 despachada y NO están todas (si no, = Total).
    if (showSubtotal && ci === lastDispatched) {
      const subSup = subSie > 0 ? Math.min(subCos / subSie * 100, 100) : null;
      const subPlgAvg = subPlgs.length ? subPlgs.reduce((a, b) => a + b, 0) / subPlgs.length : null;
      body += `<tr class="prod-subtotal">
        <td colspan="2">Subtotal actual <span class="muted">(despachados)</span></td>
        <td>${fmtPop(subSie || null)}</td>
        <td>${fmt2(densSie(subSie || null, subNSie))}</td>
        <td>${fmt1(subPlgAvg)}</td>
        <td>${fmtPop(subCos || null)}</td>
        <td>${pctTxt(subSup)}</td>
        <td>—</td><td>—</td>
      </tr>`;
    }
  });
  const plgAvg = plgs.length ? plgs.reduce((a, b) => a + b, 0) / plgs.length : null;
  const monthSup = sumSie > 0 ? Math.min(sumCos / sumSie * 100, 100) : null;
  const totalRow = `<tr class="prod-total">
      <td colspan="2">Total ${esc(label)}</td>
      <td>${fmtPop(sumSie || null)}</td>
      <td>${fmt2(densSie(sumSie || null, sumNSie))}</td>
      <td>${fmt1(plgAvg)}</td>
      <td>${fmtPop(sumCos || null)}</td>
      <td>${pctTxt(monthSup)}</td>
      <td>—</td><td>—</td>
    </tr>`;

  const slider = months.length > 1
    ? `<input type="range" class="prod-slider" data-prodslider min="0" max="${months.length - 1}" value="${pos}" step="1">`
    : '';

  return `<div class="prod-card card">
    <div class="prod-nav">
      <button class="prod-nav-btn" data-prodprev ${pos <= 0 ? 'disabled' : ''} aria-label="Mes anterior">◀</button>
      <div class="prod-title">🏭 Producción Omarsa · <b>${esc(label)}</b> <span class="muted">(corridas ${corridas.length ? esc(corridas[0]) + '–' + esc(corridas[corridas.length - 1]) : '—'})</span></div>
      <button class="prod-nav-btn" data-prodnext ${pos >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
    </div>
    ${slider}
    <div style="overflow:auto;margin-top:10px">
      <table class="sv-table prod-table">
        <thead><tr><th>Módulo</th><th>Corrida</th><th>Siembra</th><th>Dens. siembra</th><th>PL/g (manual)</th><th>Cosecha</th><th>Superv.</th><th>Total del módulo</th><th>% Superv. corrida</th></tr></thead>
        <tbody>${body || `<tr><td colspan="9" class="muted" style="text-align:center;padding:18px">Sin datos para este mes.</td></tr>`}${totalRow}</tbody>
      </table>
    </div>
  </div>`;
}
