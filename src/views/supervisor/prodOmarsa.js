/* ============================================================
   SUPERVISOR · Tabla "Producción Omarsa" (Vista Ejecutiva)
   Presentación (HTML) del resumen mensual por módulo, agrupado por corrida.
   La lógica pura del calendario (corrida→mes, agregados por módulo+corrida)
   vive en core/prodCalendar.js, compartida por todas las vistas.

   Dens. siembra = Σ siembra / (volumen de los tanques sembrados × 1000) → nauplios/L

   El volumen sale de la columna «Toneladas» de "Datos Larvicultura", que escribe la ficha
   de Calidad de Agua. Cada tanque aporta el tonelaje registrado EL DÍA QUE SE SEMBRÓ; el
   que no tenga dato aporta el volumen de respaldo de 28 t. Con la columna entera vacía la
   cuenta se reduce a (Σ siembra / nº tanques) / 28 / 1000, que es exactamente la de antes:
   por eso la estimación no se mueve hasta que la operación empiece a registrar el tonelaje.

   Cierra una decisión de 2026-08-05: el panel configurable de toneladas por mes se retiró
   por limitado, y se acordó que el tonelaje pasaría a registrarse como un dato más de la
   operación, no como un ajuste local de visualización. Esto es ese dato llegando.
   ============================================================ */
import { corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt } from '../../core/prodCalendar.js';
import { fmtPop, esc } from '../../core/format.js';
import { fmtShort } from '../../core/dates.js';

const fmt1 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
const fmt2 = (v) => (v === null || v === undefined) ? '—' : v.toFixed(2);
const pctTxt = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1) + '%';

/** Toneladas (m³) de respaldo para un tanque del que no se registró el tonelaje. */
const TON_TANQUE = 28;

/**
 * Volumen total (m³) de los tanques sembrados: lo REGISTRADO más 28 t por cada tanque que
 * no traía dato. Que el respaldo se aplique tanque a tanque —y no al módulo entero— es lo
 * que permite que un módulo medido a medias mejore su estimación en vez de descartarla.
 * @param {number} tonSum m³ registrados (0 si ninguno)
 * @param {number} tonSin nº de tanques sembrados SIN tonelaje registrado
 */
export function volumenSiembra(tonSum, tonSin) {
  const v = (tonSum || 0) + (tonSin || 0) * TON_TANQUE;
  return v > 0 ? v : null;
}

/** Densidad de siembra en nauplios/L: Σ siembra ÷ volumen total (m³) ÷ 1000 L. */
export function densSiembra(sumSiembra, tonTotal) {
  if (!(tonTotal > 0) || sumSiembra === null || sumSiembra === undefined) return null;
  return sumSiembra / tonTotal / 1000;
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
const DENS_TITLE = `Σ siembra ÷ volumen de los tanques sembrados ÷ 1000 = nauplios/L. Cada tanque aporta las toneladas registradas el día en que se sembró; el que no tenga dato aporta ${TON_TANQUE} t.`;
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

  // El volumen se acumula en sus dos mitades (m³ registrados + tanques sin dato) y solo se
  // resuelve al pintar: sumar densidades ya calculadas daría un promedio de promedios.
  let body = '', sumSie = 0, sumCos = 0, sumTon = 0, sumSin = 0; const plgs = [], plgLs = [];
  let subSie = 0, subCos = 0, subTon = 0, subSin = 0; const subPlgs = [], subPlgLs = [];   // acumuladores del subtotal
  corData.forEach((c, ci) => {
    const { cor, mods, stats, corCos, corSup } = c;
    stats.forEach((s, j) => {
      if (s.siembra) sumSie += s.siembra;
      if (s.cosecha) sumCos += s.cosecha;
      sumTon += s.tonSum || 0; sumSin += s.tonSin || 0;
      if (s.plg !== null) plgs.push(s.plg);
      if (s.plgLarvia !== null) plgLs.push(s.plgLarvia);
      if (c.despachada) {
        if (s.siembra) subSie += s.siembra;
        if (s.cosecha) subCos += s.cosecha;
        subTon += s.tonSum || 0; subSin += s.tonSin || 0;
        if (s.plg !== null) subPlgs.push(s.plg);
        if (s.plgLarvia !== null) subPlgLs.push(s.plgLarvia);
      }
      body += `<tr>
        <td><b>${esc(s.m)}</b></td>
        ${j === 0 ? `<td rowspan="${mods.length}" class="prod-cor">${esc(cor)}</td>` : ''}
        <td title="${FECHA_TITLE}">${s.siembraFecha ? esc(fmtShort(s.siembraFecha)) : '—'}</td>
        <td>${fmtPop(s.siembra)}</td>
        <td title="${DENS_TITLE}">${fmt2(densSiembra(s.siembra, volumenSiembra(s.tonSum, s.tonSin)))}</td>
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
        <td title="${DENS_TITLE}">${fmt2(densSiembra(subSie, volumenSiembra(subTon, subSin)))}</td>
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
      <td title="${DENS_TITLE}">${fmt2(densSiembra(sumSie, volumenSiembra(sumTon, sumSin)))}</td>
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
