/* ============================================================
   SUPERVISOR · Tabla "Producción Omarsa" (Vista Ejecutiva)
   Presentación (HTML) del resumen mensual por módulo, agrupado por corrida.
   La lógica pura del calendario (corrida→mes, agregados por módulo+corrida)
   vive en core/prodCalendar.js, compartida por todas las vistas.

   Dens. siembra: se estima con un volumen FIJO de 28 t (m³) por tanque.
     Dens. siembra = (Σ siembra / nº de tanques sembrados) / 28 / 1000  → nauplios/L
   El panel configurable de toneladas por mes se retiró (decisión del usuario,
   2026-08-05): resultaba demasiado limitado y el tonelaje pasará a registrarse
   como un dato más de la operación, no como un ajuste local de visualización.
   ============================================================ */
import { corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt } from '../../core/prodCalendar.js';
import { fmtPop, esc } from '../../core/format.js';
import { fmtShort } from '../../core/dates.js';

const fmt1 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
const fmt2 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(2);
const pctTxt = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1) + '%';

/** Toneladas (m³) de agua por tanque usadas para estimar la densidad de siembra. */
const TON_TANQUE = 28;

/** Densidad de siembra en nauplios/L: siembra media por tanque ÷ 28 t ÷ 1000 L. */
export function densSiembra(sumSiembra, nTanques) {
  if (!(nTanques > 0) || sumSiembra === null || sumSiembra === undefined) return null;
  return sumSiembra / nTanques / TON_TANQUE / 1000;
}

/**
 * PL/g de un conjunto de módulos = PROMEDIO SIMPLE de sus PL/g.
 *
 * Es la convención del laboratorio (confirmada por el usuario, 2026-08-05): el PL/g de un
 * módulo ya es el promedio de lo registrado en cada uno de sus tanques, y el agregado
 * sigue el mismo criterio. NO se pondera por cosecha: hacerlo cambiaría la definición
 * del indicador respecto a como se reporta en planta.
 * @param {Array<number|null>} vals PL/g de cada módulo (los null se ignoran)
 */
export function plgAggregate(vals) {
  const v = (vals || []).filter((x) => x !== null && x !== undefined && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const PLG_TITLE = 'Promedio de los PL/g de los módulos. El PL/g de cada módulo es, a su vez, el promedio de lo registrado en sus tanques.';
// PL/g (Larvia) = columna «Plg» del Sheet (biometría LARVIA, registrada a diario), resumida
// con la MISMA regla que el PL/g (manual): la última lectura >0 de cada tanque, promediada
// entre tanques. La última y no el promedio del ciclo porque el PL/g DESCIENDE conforme
// crece la larva. Es la misma definición que el KPI «PL/g (Larvia)» del Resumen Operativo,
// así que la tabla y el módulo no pueden dar cifras distintas para lo mismo.
const PLGL_TITLE = 'PL/g biométrico (LARVIA), columna «Plg». Promedio entre los módulos; el de cada módulo es el promedio de la última lectura de cada uno de sus tanques.';
const DENS_TITLE = `Siembra media por tanque ÷ ${TON_TANQUE} t ÷ 1000 = nauplios/L. El volumen por tanque se estima fijo en ${TON_TANQUE} t.`;
const FECHA_TITLE = 'Fecha promedio de siembra del módulo: promedio de la fecha en que cada tanque registró su primera población.';
// "Población Actual" (antes rotulada "Cosecha"): el valor es la ÚLTIMA población
// registrada de cada tanque, sumada. Solo coincide con la cosecha cuando el módulo ya
// se despachó; en un módulo en curso es sencillamente la población viva de hoy.
const POB_TITLE = 'Suma de la última población registrada en cada tanque del módulo. En un módulo ya despachado equivale a la cosecha.';
// Este total agrega TODOS los módulos de la corrida (por eso ocupa una sola celda para
// el bloque entero, junto al «% Superv. corrida», que sale del mismo agregado).
const TOTCOR_TITLE = 'Suma de la Población Actual de TODOS los módulos de esta corrida.';

const N_COLS = 11; // Módulo · Corrida · Fecha · Siembra · Dens. · PL/g · PL/g (manual) · Cosecha · Superv. · Total mód. · % Superv. corrida

/** HTML de la tabla del mes en posición `pos` (incluye navegación de meses). */
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

  let body = '', sumSie = 0, sumCos = 0, sumN = 0; const plgs = [], plgLs = [];
  let subSie = 0, subCos = 0, subN = 0; const subPlgs = [], subPlgLs = [];   // acumuladores del subtotal
  corData.forEach((c, ci) => {
    const { cor, mods, stats, corCos, corSup } = c;
    stats.forEach((s, j) => {
      if (s.siembra) sumSie += s.siembra;
      if (s.cosecha) sumCos += s.cosecha;
      sumN += s.nSie;
      if (s.plg !== null) plgs.push(s.plg);
      if (s.plgLarvia !== null) plgLs.push(s.plgLarvia);
      if (c.despachada) {
        if (s.siembra) subSie += s.siembra;
        if (s.cosecha) subCos += s.cosecha;
        subN += s.nSie;
        if (s.plg !== null) subPlgs.push(s.plg);
        if (s.plgLarvia !== null) subPlgLs.push(s.plgLarvia);
      }
      body += `<tr>
        <td><b>${esc(s.m)}</b></td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-cor">${esc(cor)}</td>` : ''}
        <td title="${FECHA_TITLE}">${s.siembraFecha ? esc(fmtShort(s.siembraFecha)) : '—'}</td>
        <td>${fmtPop(s.siembra)}</td>
        <td title="${DENS_TITLE}">${fmt2(densSiembra(s.siembra, s.nSie))}</td>
        <td title="${PLGL_TITLE}">${fmt1(s.plgLarvia)}</td>
        <td title="${PLG_TITLE}">${fmt1(s.plg)}</td>
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
      body += `<tr class="prod-subtotal">
        <td colspan="2">Subtotal actual <span class="muted">(despachados)</span></td>
        <td>—</td>
        <td>${fmtPop(subSie || null)}</td>
        <td title="${DENS_TITLE}">${fmt2(densSiembra(subSie, subN))}</td>
        <td title="${PLGL_TITLE}">${fmt1(plgAggregate(subPlgLs))}</td>
        <td title="${PLG_TITLE}">${fmt1(plgAggregate(subPlgs))}</td>
        <td>${fmtPop(subCos || null)}</td>
        <td>${pctTxt(subSup)}</td>
        <td>—</td><td>—</td>
      </tr>`;
    }
  });
  const monthSup = sumSie > 0 ? Math.min(sumCos / sumSie * 100, 100) : null;
  const totalRow = `<tr class="prod-total">
      <td colspan="2">Total ${esc(label)}</td>
      <td>—</td>
      <td>${fmtPop(sumSie || null)}</td>
      <td title="${DENS_TITLE}">${fmt2(densSiembra(sumSie, sumN))}</td>
      <td title="${PLGL_TITLE}">${fmt1(plgAggregate(plgLs))}</td>
      <td title="${PLG_TITLE}">${fmt1(plgAggregate(plgs))}</td>
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
      <div class="prod-title">🏭 Producción Omarsa · <b data-prodmonthlbl>${esc(label)}</b> <span class="muted">(corridas ${corridas.length ? esc(corridas[0]) + '–' + esc(corridas[corridas.length - 1]) : '—'})</span></div>
      <button class="prod-nav-btn" data-prodnext ${pos >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">▶</button>
    </div>
    ${slider}
    <div style="overflow:auto;margin-top:10px">
      <table class="sv-table prod-table">
        <thead><tr><th>Módulo</th><th>Corrida</th><th>Fecha</th><th>Siembra</th><th>Dens. siembra</th><th title="${PLGL_TITLE}">PL/g (Larvia)</th><th>PL/g (manual)</th><th title="${POB_TITLE}">Población Actual</th><th>Superv.</th><th title="${TOTCOR_TITLE}">Total de la corrida</th><th>% Superv. corrida</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${N_COLS}" class="muted" style="text-align:center;padding:18px">Sin datos para este mes.</td></tr>`}${totalRow}</tbody>
      </table>
    </div>
  </div>`;
}
