/* ============================================================
   SUPERVISOR · Tabla "Producción Omarsa" (Vista Ejecutiva)
   Presentación (HTML) del resumen mensual por módulo, agrupado por corrida.
   La lógica pura del calendario (corrida→mes, agregados por módulo+corrida)
   vive en core/prodCalendar.js, compartida por todas las vistas.

   Dens. siembra: densidad de siembra ponderada por el VOLUMEN de agua real
   de cada tanque (toneladas configurables por mes → ver prodTon.js). El
   engranaje ⚙ de la cabecera abre el panel de configuración del mes mostrado.
   ============================================================ */
import { corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt } from '../../core/prodCalendar.js';
import { fmtPop, esc } from '../../core/format.js';
import { registerModalEscape } from '../../ui/modalEscape.js';
import { loadAll, saveAll, putMonth, resolveTon, densSiembra, TON_DEFAULT } from './prodTon.js';

const fmt1 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
const fmt2 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(2);
const pctTxt = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1) + '%';

/** HTML de la tabla del mes en posición `pos` (incluye navegación + engranaje + modal). */
export function prodTableHTML(months, pos) {
  const mIdx = months[pos];
  const label = monthLabelAt(mIdx);
  const corridas = corridasOfMonth(mIdx);
  const cfg = loadAll(); // config de toneladas (una lectura por render)

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

  let body = '', sumSie = 0, sumCos = 0; const plgs = [];
  let subSie = 0, subCos = 0; const subPlgs = [];             // acumuladores del subtotal
  const allSegs = [], subSegs = [];                           // segmentos {corrida,mod,sieByTank} para la densidad ponderada
  corData.forEach((c, ci) => {
    const { cor, mods, stats, corCos, corSup } = c;
    stats.forEach((s, j) => {
      if (s.siembra) sumSie += s.siembra;
      if (s.cosecha) sumCos += s.cosecha;
      if (s.plg !== null) plgs.push(s.plg);
      const seg = { corrida: cor, mod: s.m, sieByTank: s.sieByTank };
      allSegs.push(seg);
      if (c.despachada) {
        if (s.siembra) subSie += s.siembra;
        if (s.cosecha) subCos += s.cosecha;
        if (s.plg !== null) subPlgs.push(s.plg);
        subSegs.push(seg);
      }
      body += `<tr>
        <td><b>${esc(s.m)}</b></td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-cor">${esc(cor)}</td>` : ''}
        <td>${fmtPop(s.siembra)}</td>
        <td>${fmt2(densSiembra(cfg, mIdx, [seg]))}</td>
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
        <td>${fmt2(densSiembra(cfg, mIdx, subSegs))}</td>
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
      <td>${fmt2(densSiembra(cfg, mIdx, allSegs))}</td>
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
      <button class="prod-gear" data-prodgear title="Configurar toneladas por tanque (este mes)" aria-label="Configurar toneladas por tanque">⚙</button>
    </div>
    ${slider}
    <div style="overflow:auto;margin-top:10px">
      <table class="sv-table prod-table">
        <thead><tr><th>Módulo</th><th>Corrida</th><th>Siembra</th><th>Dens. siembra</th><th>PL/g (manual)</th><th>Cosecha</th><th>Superv.</th><th>Total del módulo</th><th>% Superv. corrida</th></tr></thead>
        <tbody>${body || `<tr><td colspan="9" class="muted" style="text-align:center;padding:18px">Sin datos para este mes.</td></tr>`}${totalRow}</tbody>
      </table>
    </div>
    ${prodTonModalHTML(mIdx, label, corData, cfg)}
  </div>`;
}

/** Modal de configuración de toneladas por tanque del mes `mIdx`. Una sección por
 *  módulo con siembra real; cada tanque = un input (t). Valor resuelto = guardado →
 *  heredado del mes anterior → 28. La densidad viva por sección se recalcula al vuelo. */
function prodTonModalHTML(mIdx, label, corData, cfg) {
  const sections = [];
  corData.forEach((c) => {
    c.stats.forEach((s) => {
      const tanks = Object.keys(s.sieByTank || {});
      if (!tanks.length) return; // solo módulos con siembra real
      const dens = densSiembra(cfg, mIdx, [{ corrida: c.cor, mod: s.m, sieByTank: s.sieByTank }]);
      const inputs = tanks.map((tk) => {
        const v = resolveTon(cfg, mIdx, c.cor, s.m, tk);
        const edited = v !== TON_DEFAULT;
        return `<label class="pt-tank${edited ? ' edited' : ''}" data-pt-tank>
          <span class="pt-tk">${esc(tk)}</span>
          <span class="pt-inp"><input type="number" min="1" step="0.1" inputmode="decimal"
            data-cor="${esc(c.cor)}" data-mod="${esc(s.m)}" data-tank="${esc(tk)}" value="${v}"><i>t</i></span>
        </label>`;
      }).join('');
      sections.push(`<div class="pt-sec" data-pt-sec data-sie='${esc(JSON.stringify(s.sieByTank))}'>
        <div class="pt-sec-head">
          <div class="pt-name">${esc(s.m)} <span class="pt-cor-chip">Corrida ${esc(c.cor)} · ${tanks.length} tanque${tanks.length === 1 ? '' : 's'}</span></div>
          <div class="pt-quick">
            <span class="pt-live">Dens. siembra <b data-pt-dens>${fmt2(dens)}</b></span>
            <input type="number" min="1" step="0.1" class="pt-allval" placeholder="28" aria-label="Toneladas para todos los tanques de ${esc(s.m)}">
            <button type="button" class="pt-qbtn" data-pt-apply>Aplicar a todos</button>
            <button type="button" class="pt-qbtn reset" data-pt-reset title="Restablecer a 28 t">↺ 28</button>
          </div>
        </div>
        <div class="pt-grid">${inputs}</div>
      </div>`);
    });
  });
  const inner = sections.length ? sections.join('') : '<div class="empty-state" style="padding:20px">Sin módulos con siembra en este mes.</div>';
  return `<div class="sv-modal" data-ptmodal>
    <div class="sv-modal-card sv-modal-wide">
      <div class="sv-modal-head">
        <span class="sv-modal-title">⚙ Toneladas por tanque · ${esc(label)}</span>
        <button class="sv-modal-x" data-pt-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <p class="sv-modal-note" style="margin:0 0 14px">Volumen de agua (<b>toneladas / m³</b>) de cada tanque, usado para calcular la <b>densidad de siembra</b> (nauplios/L). Se guarda por mes; puede cambiar mes a mes. Sin configurar, cada tanque vale <b>28 t</b> y un mes nuevo hereda el anterior.</p>
        ${inner}
      </div>
      <div class="pt-foot">
        <span class="pt-foot-hint">Los cambios se aplican al guardar.</span>
        <span class="pt-foot-btns">
          <button type="button" class="pt-btn ghost" data-pt-close>Cancelar</button>
          <button type="button" class="pt-btn primary" data-pt-save>Guardar y recalcular</button>
        </span>
      </div>
    </div>
  </div>`;
}

/** Cablea el engranaje ⚙ y su modal dentro de `wrap`. `onSaved` se llama tras guardar
 *  (la Vista Ejecutiva pasa su `render` para recalcular la tabla). */
export function setupProdTon(wrap, months, pos, onSaved) {
  const mIdx = months[pos];
  const modal = wrap.querySelector('[data-ptmodal]');
  const gear = wrap.querySelector('[data-prodgear]');
  if (!gear || !modal) return;

  registerModalEscape('.sv-modal.sv-open'); // Escape cierra el overlay abierto (idempotente/global)
  const open = () => { modal.classList.add('sv-open'); document.body.classList.add('modal-open'); };
  const close = () => { modal.classList.remove('sv-open'); document.body.classList.remove('modal-open'); };
  gear.addEventListener('click', open);
  modal.querySelectorAll('[data-pt-close]').forEach((b) => b.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  // Densidad viva de una sección desde el valor ACTUAL de sus inputs.
  const recalcSection = (sec) => {
    let sie; try { sie = JSON.parse(sec.dataset.sie || '{}'); } catch (_) { sie = {}; }
    let sumSie = 0, sumTon = 0;
    sec.querySelectorAll('input[data-tank]').forEach((inp) => {
      const s = +sie[inp.dataset.tank];
      if (!(s > 0)) return;
      const t = parseFloat(inp.value);
      const ton = (isFinite(t) && t > 0) ? t : TON_DEFAULT;
      sumSie += s; sumTon += ton;
      inp.closest('[data-pt-tank]')?.classList.toggle('edited', ton !== TON_DEFAULT);
    });
    const out = sec.querySelector('[data-pt-dens]');
    if (out) out.textContent = sumTon > 0 ? (sumSie / sumTon / 1000).toFixed(2) : '—';
  };

  modal.querySelectorAll('[data-pt-sec]').forEach((sec) => {
    sec.querySelectorAll('input[data-tank]').forEach((inp) => inp.addEventListener('input', () => recalcSection(sec)));
    sec.querySelector('[data-pt-apply]')?.addEventListener('click', () => {
      const val = sec.querySelector('.pt-allval')?.value;
      if (val !== '' && val != null) sec.querySelectorAll('input[data-tank]').forEach((inp) => { inp.value = val; });
      recalcSection(sec);
    });
    sec.querySelector('[data-pt-reset]')?.addEventListener('click', () => {
      sec.querySelectorAll('input[data-tank]').forEach((inp) => { inp.value = String(TON_DEFAULT); });
      recalcSection(sec);
    });
  });

  modal.querySelector('[data-pt-save]')?.addEventListener('click', () => {
    const byCor = {};
    modal.querySelectorAll('input[data-tank]').forEach((inp) => {
      const v = parseFloat(inp.value);
      if (!(v > 0)) return;
      const { cor, mod, tank } = inp.dataset;
      byCor[cor] = byCor[cor] || {};
      byCor[cor][mod] = byCor[cor][mod] || {};
      byCor[cor][mod][tank] = v;
    });
    saveAll(putMonth(loadAll(), mIdx, byCor));
    close();
    if (typeof onSaved === 'function') onSaved();
  });
}
