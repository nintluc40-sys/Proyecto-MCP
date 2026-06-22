/* ============================================================
   SUPERVISOR · Vista Ejecutiva (tarjetas por módulo)
   La tabla "Producción Omarsa" manda: el mes elegido determina qué
   tarjetas de módulo se muestran (las corridas de ese mes, ordenadas
   por corrida y módulo). Sin filtros de mes ni corrida.
   ============================================================ */
import { modStats, rowsOutOfDispatch } from './stats.js';
import { colorFor, fmt1, fmt2, fmtPop, kpiGlass, dot } from './ui.js';
import { esc, odLevel, tmpLevel, svLevel } from '../../core/format.js';
import { getField, F } from '../../core/fields.js';
import { fmtShort } from '../../core/dates.js';
import { compareTanksButtonHTML, compareTanksModalHTML, setupCompareTanks } from './compareTanks.js';
import { presentMonths, corridasOfMonth, modulesOfCorrida, prodTableHTML } from './prodOmarsa.js';
import { desinfeccionEnCurso } from './desinfeccion.js';

// Columnas que evidencian un registro de despacho (igual criterio que despacho.js).
const DISP_KEYS = [
  ['Densidad cosechada', 'Densidad Cosechada', 'densidad cosechada'],
  ['Biomasa', 'biomasa'],
  ['Destino', 'destino'],
  ['Cajas/Tinas', 'Cajas / Tinas', 'cajas/tinas', 'Cajas-Tinas'],
];
const hasDispatch = (r) => DISP_KEYS.some((k) => getField(r, k) !== '');

/** Estado de despacho del módulo+corrida: '' · 'Despachando' · 'Despachado'.
 *  Los tanques agrupados/descartados NO llegan al despacho, así que se excluyen del
 *  requisito: el módulo se marca 'Despachado' cuando todos los tanques que SÍ debían
 *  despacharse lo hicieron (y existe al menos un despacho real). Un tanque agrupado a
 *  mitad de ciclo no dispara 'Despachado' por sí solo. */
function dispatchStatus(ctx, mod, corrida) {
  const rows = ctx.larvCM.filter((r) => getField(r, F.modulo) === mod && getField(r, F.corrida) === corrida);
  const tanks = [...new Set(rows.map((r) => getField(r, F.tanque)).filter(Boolean))];
  if (!tanks.length) return '';
  const tankRows = (tq) => rows.filter((r) => getField(r, F.tanque) === tq);
  const dispatched = (tq) => tankRows(tq).some(hasDispatch);
  // Tanques que SÍ deben llegar al despacho (excluye agrupados/descartados).
  const realTanks = tanks.filter((tq) => !rowsOutOfDispatch(tankRows(tq)));
  const doneReal = realTanks.filter(dispatched);
  if (realTanks.length && doneReal.length === realTanks.length) return 'Despachado';
  if (tanks.some(dispatched)) return 'Despachando';
  return '';
}

// Etapas del proceso por estadío (color del fondo de la tarjeta + franja-leyenda).
const STAGE_CATS = [
  { key: 'desinfeccion',  label: 'Desinfección',  range: 'Pre-siembra', color: '#9E9E9E', bg: 'linear-gradient(135deg,#757575,#9E9E9E)' },
  { key: 'siembra',       label: 'Siembra',       range: 'N5–Z2',   color: '#E53935', bg: 'linear-gradient(135deg,#C62828,#E53935)' },
  { key: 'desarrollo',    label: 'Desarrollo',    range: 'Z3–PL3',  color: '#EF6C00', bg: 'linear-gradient(135deg,#E65100,#FB8C00)' },
  { key: 'transferencia', label: 'Transferencia', range: 'PL4–PL6', color: '#7B1FA2', bg: 'linear-gradient(135deg,#6A1B9A,#AB47BC)' },
  { key: 'crecimiento',   label: 'Crecimiento',   range: 'PL7–PL10', color: '#2E7D32', bg: 'linear-gradient(135deg,#2E7D32,#43A047)' },
  { key: 'cosecha',       label: 'Cosecha',       range: 'PL11+',   color: '#1565C0', bg: 'linear-gradient(135deg,#1565C0,#1E88E5)' },
];
const CAT = Object.fromEntries(STAGE_CATS.map((c) => [c.key, c]));

/** Clasifica un estadío ("Z3", "PL5"…) en su etapa de proceso. null si desconocido. */
function stageCategory(est) {
  const s = String(est || '').trim();
  if (!s || /^n\/?a$/i.test(s)) return null; // evita que "N/A" se clasifique como Nauplio (rojo)
  const m = s.toUpperCase().match(/^([A-Z]+)\s*([0-9]+)?/);
  if (!m) return null;
  const L = m[1], n = m[2] ? +m[2] : 0;
  if (L === 'N' || (L === 'Z' && n <= 2)) return CAT.siembra;
  if ((L === 'Z' && n >= 3) || L === 'M' || (L === 'PL' && n <= 3)) return CAT.desarrollo;
  if (L === 'PL' && n >= 4 && n <= 6) return CAT.transferencia;
  if (L === 'PL' && n >= 7 && n <= 10) return CAT.crecimiento;
  if (L === 'PL' && n >= 11) return CAT.cosecha;
  return null;
}

const etapaLegendHTML = () => `<div class="sv-legend">
    <span class="sv-legend-title">🦐 Etapa</span>
    ${STAGE_CATS.map((c) => `<span class="sv-legend-item">${dot(c.color, c.label + ' (' + c.range + ')')}<b>${c.label}</b> <span class="muted">${c.range}</span></span>`).join('')}
  </div>`;

// Un parámetro está "fuera de rango" cuando su semáforo es malo o grave.
// (SV: solo 'grave' por ahora; 'malo' = 40–70% es común a mitad de ciclo.)
const isAlert = (lvl) => lvl === 'malo' || lvl === 'grave';
const svAlert = (sv) => svLevel(sv) === 'grave';

/** Frescura del dato: etiqueta + color según días desde la última fecha. */
function freshness(lastDate) {
  if (!lastDate || isNaN(lastDate)) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const l0 = new Date(lastDate); l0.setHours(0, 0, 0, 0);
  const days = Math.round((t0 - l0) / 86400000);
  const label = days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
  const color = days <= 1 ? '#43A047' : days <= 3 ? '#F9A825' : '#E53935';
  return { label, color };
}

function cardHTML(ctx, mod, corrida, i) {
  // Color de respaldo (solo se usa si el estadío es desconocido y no hay etapa).
  const modIdx = ctx.allMods.indexOf(mod);
  const col = colorFor(modIdx >= 0 ? modIdx : i);
  const s = modStats(ctx, mod, corrida);
  const cat = stageCategory(s.estadio); // fondo de la tarjeta según la etapa
  const desp = dispatchStatus(ctx, mod, corrida);
  const despBadge = desp ? `<span class="sv-desp-badge ${desp === 'Despachado' ? 'is-done' : 'is-prog'}">${desp}</span>` : '';

  // Un módulo FINALIZADO (despachado por completo) no muestra alertas activas:
  // sus datos ya son históricos, no de monitoreo en curso.
  const finalizado = desp === 'Despachado';
  // #3 Alertas de módulo (OD/Temp/SV fuera de rango) — reutiliza los umbrales del sistema.
  const odA = !finalizado && isAlert(odLevel(s.od));
  const tmpA = !finalizado && isAlert(tmpLevel(s.tmp));
  const svA = !finalizado && svAlert(s.sv);
  const alertParams = [svA && 'Superv.', odA && 'OD', tmpA && 'Temp'].filter(Boolean);
  // #8 Tanques en alerta.
  const tanksData = s.tanksData || [];
  const tanksAlert = finalizado ? 0
    : tanksData.filter((t) => isAlert(odLevel(t.od)) || isAlert(tmpLevel(t.tmp)) || svAlert(t.sv)).length;
  // #11 Frescura.
  const fr = freshness(s.lastDate);

  return `<div class="sv-card" style="background:${cat ? cat.bg : col.bg}" data-nav="module" data-mod="${esc(mod)}" data-corrida="${esc(corrida)}" role="button" tabindex="0" aria-label="Abrir módulo ${esc(mod)}, corrida ${esc(corrida)}">
      <div class="sv-card-orb"></div>
      ${despBadge}
      <div class="sv-card-head">
        <div>
          <div class="sv-card-tag">🦐 ${esc(s.estadio || '—')} · ${s.dias} día${s.dias !== 1 ? 's' : ''}</div>
          <div class="sv-card-name">${esc(mod)}</div>
          <div class="sv-card-sub">🔄 Corrida: ${esc(corrida)}</div>
          ${s.lotes.length ? `<div class="sv-card-sub">📦 ${esc(s.lotes.join(' · '))}</div>` : ''}
          ${desp === 'Despachado'
            ? `<div class="sv-card-sub">${dot('#90A4AE', 'Proceso finalizado')} ✓ Finalizado</div>`
            : (fr ? `<div class="sv-card-sub">${dot(fr.color, 'Última actualización')} Actualizado: ${esc(fr.label)}</div>` : '')}
          ${tanksAlert > 0 ? `<div class="sv-card-sub">🚨 ${tanksAlert}/${tanksData.length} tanque${tanksAlert !== 1 ? 's' : ''} en alerta</div>` : ''}
          ${alertParams.length ? `<div class="sv-card-alert">⚠️ Fuera de rango: ${esc(alertParams.join(', '))}</div>` : ''}
        </div>
      </div>
      <div class="sv-kpi-grid">
        ${kpiGlass('📈', 'Supervivencia', fmt1(s.sv, '%'), '', svA)}
        ${kpiGlass('📉', 'Mortalidad', fmt1(s.mort, '%'))}
        ${kpiGlass('💧', 'OD', fmt2(s.od, ' mg/L'), '', odA)}
        ${kpiGlass('🌡️', 'Temperatura', fmt1(s.tmp, '°C'), '', tmpA)}
      </div>
      <div class="sv-kpi-grid" style="margin-top:8px">
        ${kpiGlass('🎣', 'PL/g (manual)', fmt1(s.plgManual))}
        ${kpiGlass('👥', 'Población', fmtPop(s.pop))}
      </div>
    </div>`;
}

/** Tarjeta gris para un módulo/corrida en fase de desinfección (pre-siembra). */
function desinfCardHTML(d) {
  const cat = CAT.desinfeccion;
  return `<div class="sv-card" style="background:${cat.bg}">
      <div class="sv-card-orb"></div>
      <div class="sv-card-head">
        <div>
          <div class="sv-card-tag">🧴 Desinfección · ${d.count} registro${d.count !== 1 ? 's' : ''}</div>
          <div class="sv-card-name">${esc(d.mod)}</div>
          <div class="sv-card-sub">🔄 Corrida: ${esc(d.corrida)}</div>
          ${d.lastDate ? `<div class="sv-card-sub">📅 Último registro: ${esc(fmtShort(d.lastDate))}</div>` : ''}
        </div>
      </div>
      <div class="sv-kpi-grid">
        <div style="grid-column:1/-1;text-align:center;padding:12px 8px;opacity:.95;font-weight:600">🧴 Pre-siembra · módulo en preparación</div>
      </div>
    </div>`;
}

let selMonthIdx = null; // ÍNDICE de mes seleccionado (valor real, persistente entre refrescos)

/** Monta tabla + leyenda + tarjetas del mes y gestiona la navegación de meses. */
function mountMonthPanel(root, ctx) {
  const wrap = root.querySelector('#execMonth');
  if (!wrap) return;
  // Desinfección (pre-siembra): añade sus meses a la lista, para que un módulo en
  // desinfección sea visible aunque su corrida aún no tenga datos de Larvicultura.
  const desinf = desinfeccionEnCurso();
  const desinfMonths = [...new Set(desinf.map((d) => d.monthIdx).filter((i) => i >= 0))];
  const months = [...new Set([...presentMonths(), ...desinfMonths])].sort((a, b) => a - b);
  if (!months.length) { wrap.innerHTML = `<div class="empty-state">Sin datos de producción.</div>`; return; }
  // Posición inicial por el ÍNDICE de mes recordado (robusto ante refrescos que
  // cambien la lista de meses); si ese mes ya no está presente, el más reciente.
  let pos = selMonthIdx === null ? -1 : months.indexOf(selMonthIdx);
  if (pos < 0) pos = months.length - 1;

  // La Vista Ejecutiva ignora el filtro de fecha global (su navegador de meses es su control
  // temporal) → tarjetas y tabla "Producción Omarsa" comparten el mismo universo de datos.
  const ctxFull = { ...ctx, larvWin: ctx.larvCM, tanqWin: ctx.tanqCM };

  const render = () => {
    const mIdx = months[pos];
    selMonthIdx = mIdx; // recuerda el mes (no la posición) entre re-render/refrescos
    // Tarjetas del mes ordenadas por corrida (asc) y luego por módulo.
    const pairs = [];
    corridasOfMonth(mIdx).forEach((cor) => modulesOfCorrida(cor).forEach((mod) => pairs.push({ mod, corrida: cor })));
    // Tarjetas grises de desinfección de este mes (corrida asc, luego módulo).
    const desinfMonth = desinf
      .filter((d) => d.monthIdx === mIdx)
      .sort((a, b) => (+a.corrida - +b.corrida) || String(a.mod).localeCompare(String(b.mod)));
    let html = prodTableHTML(months, pos);
    html += etapaLegendHTML();
    const cards = pairs.map((p, i) => cardHTML(ctxFull, p.mod, p.corrida, i)).join('') +
      desinfMonth.map((d) => desinfCardHTML(d)).join('');
    html += (pairs.length || desinfMonth.length)
      ? '<div class="sv-grid">' + cards + '</div>'
      : '<div class="empty-state">🦐 Sin módulos con datos en este mes.</div>';
    wrap.innerHTML = html;
    wrap.querySelector('[data-prodprev]')?.addEventListener('click', () => { if (pos > 0) { pos--; render(); } });
    wrap.querySelector('[data-prodnext]')?.addEventListener('click', () => { if (pos < months.length - 1) { pos++; render(); } });
    wrap.querySelector('[data-prodslider]')?.addEventListener('input', (e) => { pos = +e.target.value; render(); });
  };
  render();
}

export function renderExecutive(ctx) {
  let h = `<div class="sv-head">
    <div>
      <div class="sv-title">Vista Ejecutiva</div>
      <div class="sv-subtitle">Resumen de operaciones</div>
    </div>
    <div class="sv-head-actions">
      ${compareTanksButtonHTML()}
      <span class="chip">👁️ Modo Supervisor</span>
    </div>
  </div>`;

  // Aclaración de UX: la Vista Ejecutiva define su periodo con el navegador de meses,
  // no con el filtro de fecha global de la cabecera (ese sí aplica al entrar a un módulo).
  h += `<div class="sv-exec-note muted">📅 El periodo aquí se elige con el navegador de meses ◀▶ de “Producción Omarsa”; el filtro de fecha global de la cabecera aplica al abrir un módulo.</div>`;

  // Panel del mes (tabla "Producción Omarsa" + leyenda + tarjetas), montado en after().
  h += `<div id="execMonth"></div>`;
  h += compareTanksModalHTML();

  const after = (root) => {
    try { mountMonthPanel(root, ctx); } catch (e) { console.error('[executive] month panel', e); }
    try { setupCompareTanks(root); } catch (e) { console.error('[executive] compareTanks', e); }
  };

  return { html: h, after };
}
