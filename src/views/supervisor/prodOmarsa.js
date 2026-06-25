/* ============================================================
   SUPERVISOR · Tabla "Producción Omarsa" (Vista Ejecutiva)
   Presentación (HTML) del resumen mensual por módulo, agrupado por corrida.
   La lógica pura del calendario (corrida→mes, agregados por módulo+corrida)
   vive en core/prodCalendar.js, compartida por todas las vistas.
   ============================================================ */
import { corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt } from '../../core/prodCalendar.js';
import { fmtPop, esc } from '../../core/format.js';

const fmt1 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
const pctTxt = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1) + '%';

/** HTML de la tabla del mes en posición `pos` (incluye navegación). */
export function prodTableHTML(months, pos) {
  const mIdx = months[pos];
  const label = monthLabelAt(mIdx);
  const corridas = corridasOfMonth(mIdx);

  let body = '', sumSie = 0, sumCos = 0; const plgs = [];
  corridas.forEach((cor) => {
    const mods = modulesOfCorrida(cor);
    const stats = mods.map((m) => ({ m, ...modCorStats(m, cor) }));
    const corCos = stats.reduce((a, s) => a + (s.cosecha || 0), 0);
    const corSie = stats.reduce((a, s) => a + (s.siembra || 0), 0);
    const corSup = corSie > 0 ? Math.min(corCos / corSie * 100, 100) : null;
    stats.forEach((s, j) => {
      if (s.siembra) sumSie += s.siembra;
      if (s.cosecha) sumCos += s.cosecha;
      if (s.plg !== null) plgs.push(s.plg);
      body += `<tr>
        <td><b>${esc(s.m)}</b></td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-cor">${esc(cor)}</td>` : ''}
        <td>${fmtPop(s.siembra)}</td>
        <td>${fmt1(s.plg)}</td>
        <td>${fmtPop(s.cosecha)}</td>
        <td>${pctTxt(s.superv)}</td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-tot"><b>${fmtPop(corCos || null)}</b></td>` : ''}
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-tot">${corSup === null ? '—' : '<b>' + pctTxt(corSup) + '</b>'}</td>` : ''}
      </tr>`;
    });
  });
  const plgAvg = plgs.length ? plgs.reduce((a, b) => a + b, 0) / plgs.length : null;
  const monthSup = sumSie > 0 ? Math.min(sumCos / sumSie * 100, 100) : null;
  const totalRow = `<tr class="prod-total">
      <td colspan="2">Total ${esc(label)}</td>
      <td>${fmtPop(sumSie || null)}</td>
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
        <thead><tr><th>Módulo</th><th>Corrida</th><th>Siembra</th><th>PL/g (manual)</th><th>Cosecha</th><th>Superv.</th><th>Total del módulo</th><th>% Superv. corrida</th></tr></thead>
        <tbody>${body || `<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">Sin datos para este mes.</td></tr>`}${totalRow}</tbody>
      </table>
    </div>
  </div>`;
}
