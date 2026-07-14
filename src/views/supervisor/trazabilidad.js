/* ============================================================
   TRAZABILIDAD · Adaptadores store→ficha + orquestación de descarga.
   Toma los datos del Google Sheet (store) de un módulo y arma las páginas de
   cada ficha en PDF (una por día). Usa el núcleo nativo fichaPdf.js.
   Las 6 fichas estándar (registro FICHA_PAGES). Fuentes: "Datos Larvicultura"
   (poblacion/calidad/plg/despacho/calagua) y "Control_Tanque" (params).
   Cada PDF = la hoja (tabla), sin gráficos.
   ============================================================ */
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow, isTanqueRow, PLGM_KEYS } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { natCmp } from '../../core/util.js';
import { esc } from '../../core/format.js';
import { STD_HRS, normHr } from './tank.js';
import { tankColorInfo } from '../../core/aguaColor.js';
import { buildFichaPdfDoc, printFichaDocs, pdfFilename, isFichaId, fichaLabel, toIsoDate } from './fichaPdf.js';

// Horas de la ficha de Parámetros (etiquetas). Paralelas a STD_HRS (mismo índice):
// STD_HRS[j] (normalizada 'H:MM:SS') ↔ PTIMES[j] (etiqueta 'HH:MM').
const PTIMES = ['02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '00:00'];

const distinct = (a) => [...new Set(a.filter(Boolean))];
const pdfVal = (v) => (v !== undefined && v !== '' && v !== null) ? esc(String(v)) : '<span class="empty">—</span>';
const firstField = (rows, field) => { for (const r of rows) { const v = getField(r, field); if (v !== '' && v != null) return v; } return ''; };

// ¿La fecha `f` cae en el rango [from, to] (ISO, ambos opcionales)?
function inRange(f, from, to) {
  const t = parseAnyDate(f); if (!t) return false;
  if (from) { const a = parseAnyDate(from); if (a && t < a) return false; }
  if (to) { const b = parseAnyDate(to); if (b && t > b) return false; }
  return true;
}

// ── Población ────────────────────────────────────────────
// Réplica nativa de pdfTablePoblacion (engine.js), iterando los tanques presentes.
// `tanks` = nombres de tanque; `d` = { po_i, sv_i, lt_i, e_i, sal_i, sobrev, mort_d, cta }.
function poblacionTable(d, tanks) {
  let tot = 0;
  tanks.forEach((_, i) => { tot += parseFloat(d['po_' + i]) || 0; });
  const totReal = tot * 1000;
  const rows = tanks.map((tqName, i) => {
    const raw = d['po_' + i];
    const hasVal = raw !== undefined && raw !== '' && raw !== null;
    const hasAny = hasVal || ['e', 'sv', 'lt', 'sal'].some((k) => { const v = d[k + '_' + i]; return v !== undefined && v !== '' && v !== null; });
    if (!hasAny) return '';
    const realVal = hasVal ? (parseFloat(raw) * 1000).toLocaleString('es-EC', { minimumFractionDigits: 2 }) : '';
    return `<tr>
    <td class="tqc">${esc(String(tqName))}</td>
    <td>${pdfVal(d['sv_' + i])}</td>
    <td>${hasVal ? parseFloat(raw).toLocaleString('es-EC') : '<span class="empty">—</span>'}</td>
    <td>${hasVal ? realVal : '<span class="empty">—</span>'}</td>
    <td>${pdfVal(d['lt_' + i])}</td>
    <td>${pdfVal(d['e_' + i])}</td>
    <td>${pdfVal(d['sal_' + i])}</td>
  </tr>`;
  }).join('');
  const extra = `<div class="mgrid2">
    <div class="mf"><label>Total Ingresado</label><span>${tot.toLocaleString('es-EC')}</span></div>
    <div class="mf"><label>Total Población (real)</label><span style="color:#047857;font-size:9pt;font-weight:800">${totReal.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span></div>
    <div class="mf"><label>% Sobrevivencia</label><span>${pdfVal(d.sobrev)}</span></div>
    <div class="mf"><label>% Mort. Diaria</label><span>${pdfVal(d.mort_d)}</span></div>
    <div class="mf"><label>CTA Sembrada</label><span>${pdfVal(d.cta)}</span></div>
  </div>`;
  return `<table>
    <thead><tr><th>TQ</th><th>% Supervivencia</th><th>Ingresado</th><th>Población Real (×1000)</th><th>Lote</th><th>Estadío</th><th>Salinidad</th></tr></thead>
    <tbody>${rows}</tbody></table>${extra}`;
}

// Filas de Larvicultura del módulo (+corrida opcional), dentro del rango.
function larvRowsOf(mod, corrida) {
  return store.globalData.filter((r) => isLarviculturaRow(r)
    && getField(r, F.modulo) === mod
    && (!corrida || getField(r, F.corrida) === corrida));
}

// Motor común de las fichas de Larvicultura (Población/Calidad/PLG/…): agrupa las
// filas del módulo por fecha, conserva sólo los días que `qualifies` acepta, y por
// cada día arma `d` (cabecera + campos por tanque vía `fill`) + la tabla (`table`).
function larvFichaPages({ mod, corrida, from, to }, { qualifies, fill, table }) {
  const byDate = new Map();
  larvRowsOf(mod, corrida).forEach((r) => {
    const f = getField(r, F.fecha); if (!f || !inRange(f, from, to)) return;
    if (!byDate.has(f)) byDate.set(f, []);
    byDate.get(f).push(r);
  });
  const dates = [...byDate.keys()]
    .filter((f) => qualifies(byDate.get(f)))
    .sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  return dates.map((fecha) => {
    const dayRows = byDate.get(fecha);
    const tanks = distinct(dayRows.map((r) => getField(r, F.tanque))).sort(natCmp);
    const d = {
      fecha,
      corrida: corrida || firstField(dayRows, F.corrida),
      tec: firstField(dayRows, F.tecnico),
      hora: firstField(dayRows, F.hora),
    };
    tanks.forEach((tq, i) => { fill(d, i, dayRows.filter((r) => getField(r, F.tanque) === tq)); });
    return { d, tanks, tableHtml: table(d, tanks) };
  });
}

// Páginas de Población: una por fecha con dato de población, ascendente.
function poblacionPages(opts) {
  return larvFichaPages(opts, {
    qualifies: (rows) => rows.some((r) => parseNum(r, F.poblacion) !== null),
    fill: (d, i, trows) => {
      const r = trows.find((x) => parseNum(x, F.poblacion) !== null) || trows[0];
      const pob = parseNum(r, F.poblacion);
      // La hoja guarda Población = valor REAL (po_i × 1000) → Ingresado (po_i) = /1000.
      d['po_' + i] = pob !== null ? pob / 1000 : '';
      d['sv_' + i] = getField(r, F.supervivencia);
      d['lt_' + i] = getField(r, F.lote);
      d['e_' + i] = getField(r, F.estadio);
      d['sal_' + i] = getField(r, F.salinidad);
    },
    table: poblacionTable,
  });
}

// ── Calidad Larvaria ─────────────────────────────────────
// Campos de la ficha (por tanque) → cabecera EXACTA de la hoja "Datos Larvicultura".
const CAL_COL = {
  ll: 'Intestino_Lleno', sl: 'Intestino_Semilleno', va: 'Intestino_Vacio',
  df: 'Deformidad', rt: 'Retraso', mo: '% Mortalidad',
  hg: 'Hongos', nv: '% No_viables', op: '% Opacidad',
  lp: 'Lípidos', fl: 'Flácidez', nc: 'Necrosis', cb: 'Canibalismo', pr: 'Parásitos',
  cos: '% Actividad', es: 'Estrés',
};
const CAL_KEYS = Object.keys(CAL_COL);

// Réplica nativa de pdfTableCalidad (3 filas de cabecera: SANIDAD N5–M3 · Post-larva · CALIDAD).
function calidadTable(d, tanks) {
  const rows = tanks.map((tqName, i) => {
    const hasAny = ['e', ...CAL_KEYS].some((k) => { const v = d[k + '_' + i]; return v !== undefined && v !== '' && v !== null; });
    if (!hasAny) return '';
    return `<tr>
    <td class="tqc">${esc(String(tqName))}</td>
    <td>${pdfVal(d['e_' + i])}</td>
    <td>${pdfVal(d['ll_' + i])}</td><td>${pdfVal(d['sl_' + i])}</td><td>${pdfVal(d['va_' + i])}</td>
    <td>${pdfVal(d['df_' + i])}</td><td>${pdfVal(d['rt_' + i])}</td><td>${pdfVal(d['mo_' + i])}</td>
    <td>${pdfVal(d['hg_' + i])}</td><td>${pdfVal(d['nv_' + i])}</td><td>${pdfVal(d['op_' + i])}</td>
    <td>${pdfVal(d['lp_' + i])}</td>
    <td>${pdfVal(d['fl_' + i])}</td><td>${pdfVal(d['nc_' + i])}</td>
    <td>${pdfVal(d['cb_' + i])}</td><td>${pdfVal(d['pr_' + i])}</td>
    <td>${pdfVal(d['cos_' + i])}</td><td>${pdfVal(d['es_' + i])}</td>
  </tr>`;
  }).join('');
  return `<table>
    <thead>
      <tr><th rowspan="3">TQ</th><th rowspan="3">Estadio</th>
        <th colspan="9" class="thg">SANIDAD — Estadios N5–M3</th>
        <th colspan="5" class="thg2">SANIDAD — Post-larva</th>
        <th colspan="2" class="thg3">CALIDAD</th></tr>
      <tr><th colspan="3">Intestino</th><th colspan="3">Morfología</th><th colspan="3">Otros</th>
        <th>Hepatop.</th><th colspan="4">Morf. PL</th>
        <th>%Act.</th><th>%Estrés</th></tr>
      <tr><th>%Ll</th><th>%Semi</th><th>%Vac</th>
        <th>%Def</th><th>%Ret</th><th>%Mort</th>
        <th>%Hong</th><th>%NoV</th><th>%Opac</th>
        <th>%Líp</th>
        <th>%Flac</th><th>%Nec</th><th>%Can</th><th>%Par</th>
        <th>%Act</th><th>%Es</th></tr>
    </thead><tbody>${rows}</tbody></table>`;
}

// Páginas de Calidad Larvaria: una por fecha con algún dato de calidad.
function calidadPages(opts) {
  const hasCal = (r) => CAL_KEYS.some((k) => getField(r, [CAL_COL[k]]) !== '');
  return larvFichaPages(opts, {
    qualifies: (rows) => rows.some(hasCal),
    fill: (d, i, trows) => {
      const r = trows.find(hasCal) || trows[0];
      d['e_' + i] = getField(r, F.estadio);
      CAL_KEYS.forEach((k) => { d[k + '_' + i] = getField(r, [CAL_COL[k]]); });
    },
    table: calidadTable,
  });
}

// ── PLG (gramo externo) ──────────────────────────────────
// pg = PL/Gramo externo (col "Plg"); pgm = Plg (manual, PLGM_KEYS); lt = Lote; e = Estadío.
const PLG_EXT = ['Plg', 'PLG', 'PL/g'];   // col externa (distinta de "Plg (manual)")

// Réplica nativa de pdfTablePlg.
function plgTable(d, tanks) {
  const rows = tanks.map((tqName, i) => {
    const has = ['e', 'pg', 'pgm', 'lt'].some((k) => { const v = d[k + '_' + i]; return v !== undefined && v !== '' && v !== null; });
    if (!has) return '';
    return `<tr>
    <td class="tqc">${esc(String(tqName))}</td>
    <td>${pdfVal(d['lt_' + i])}</td>
    <td>${pdfVal(d['e_' + i])}</td>
    <td>${pdfVal(d['pg_' + i])}</td>
    <td>${pdfVal(d['pgm_' + i])}</td>
  </tr>`;
  }).join('');
  return `<table>
    <thead><tr><th>TQ</th><th>Lote</th><th>Estadio</th><th>PL / Gramo</th><th>Plg (manual)</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// Páginas de PLG: una por fecha con algún dato de PL/gramo (externo o manual).
function plgPages(opts) {
  const hasPlg = (r) => getField(r, PLG_EXT) !== '' || getField(r, PLGM_KEYS) !== '';
  return larvFichaPages(opts, {
    qualifies: (rows) => rows.some(hasPlg),
    fill: (d, i, trows) => {
      const r = trows.find(hasPlg) || trows[0];
      d['lt_' + i] = getField(r, F.lote);
      d['e_' + i] = getField(r, F.estadio);
      d['pg_' + i] = getField(r, PLG_EXT);
      d['pgm_' + i] = getField(r, PLGM_KEYS);
    },
    table: plgTable,
  });
}

// ── Despacho ─────────────────────────────────────────────
// Campos propios de despacho → cabecera EXACTA de "Datos Larvicultura".
const DESP_COL = { dc: 'Densidad cosechada', bm: 'Biomasa', cj: 'Cajas/Tinas', de: 'Destino', ps: 'Piscina' };
const DESP_KEYS = Object.keys(DESP_COL);

// Réplica nativa de pdfTableDespacho.
function despachoTable(d, tanks) {
  const rows = tanks.map((tqName, i) => {
    const has = ['e', 'po', 'sv', 'pgm', 'pg', ...DESP_KEYS].some((k) => { const v = d[k + '_' + i]; return v !== undefined && v !== '' && v !== null; });
    if (!has) return '';
    return `<tr>
    <td class="tqc">${esc(String(tqName))}</td>
    <td>${pdfVal(d['e_' + i])}</td>
    <td>${pdfVal(d['po_' + i])}</td>
    <td>${pdfVal(d['sv_' + i])}</td>
    <td>${pdfVal(d['pgm_' + i])}</td>
    <td>${pdfVal(d['pg_' + i])}</td>
    <td>${pdfVal(d['dc_' + i])}</td>
    <td>${pdfVal(d['bm_' + i])}</td>
    <td>${pdfVal(d['cj_' + i])}</td>
    <td>${pdfVal(d['de_' + i])}</td>
    <td>${pdfVal(d['ps_' + i])}</td>
  </tr>`;
  }).join('');
  return `<table>
    <thead><tr>
      <th>TQ</th><th>Estadío</th>
      <th>Población<br>(miles)</th><th>% Superv.</th>
      <th>PLG<br>(manual)</th>
      <th>PL / Gramo</th>
      <th>Densidad<br>cosechada</th><th>Biomasa</th>
      <th>Cajas/<br>Tinas</th>
      <th>Destino</th><th>Piscina</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// Páginas de Despacho: una por fecha con algún dato de cosecha/despacho.
function despachoPages(opts) {
  const hasDesp = (r) => DESP_KEYS.some((k) => getField(r, [DESP_COL[k]]) !== '');
  return larvFichaPages(opts, {
    qualifies: (rows) => rows.some(hasDesp),
    fill: (d, i, trows) => {
      const r = trows.find(hasDesp) || trows[0];
      d['e_' + i] = getField(r, F.estadio);
      const pob = parseNum(r, F.poblacion);
      d['po_' + i] = pob !== null ? pob / 1000 : '';   // hoja guarda REAL → miles = /1000
      d['sv_' + i] = getField(r, F.supervivencia);
      d['pgm_' + i] = getField(r, PLGM_KEYS);
      d['pg_' + i] = getField(r, PLG_EXT);
      DESP_KEYS.forEach((k) => { d[k + '_' + i] = getField(r, [DESP_COL[k]]); });
    },
    table: despachoTable,
  });
}

// ── Parámetros (OD / Temperatura por hora) ───────────────
// Fuente DISTINTA: hoja "Control_Tanque MXX" (1 fila por tanque×hora), no larvicultura.
function tanqRowsOf(mod, corrida) {
  return store.globalData.filter((r) => isTanqueRow(r)
    && getField(r, F.modulo) === mod
    && (!corrida || getField(r, F.corrida) === corrida));
}

// Réplica nativa de pdfTableParams (TQ × 12 tomas; pares OD/°C).
function paramsTable(d, tanks) {
  const th1 = PTIMES.map((t) => `<th colspan="2" class="thgt">${t}</th>`).join('');
  const th2 = PTIMES.map(() => '<th>OD</th><th>°C</th>').join('');
  const rows = tanks.map((tqName, i) => {
    const hasData = PTIMES.some((t) => (d['od_' + i + '_' + t] || '') !== '' || (d['tc_' + i + '_' + t] || '') !== '');
    if (!hasData) return '';
    const cells = PTIMES.map((t) => `<td>${pdfVal(d['od_' + i + '_' + t])}</td><td>${pdfVal(d['tc_' + i + '_' + t])}</td>`).join('');
    return `<tr><td class="tqc">${esc(String(tqName))}</td>${cells}</tr>`;
  }).join('');
  return `<table style="table-layout:fixed;width:100%">
    <thead>
      <tr><th style="min-width:26px;width:26px">TQ</th>${th1}</tr>
      <tr><th></th>${th2}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// Páginas de Parámetros: una por fecha con tomas horarias del módulo.
function paramsPages({ mod, corrida, from, to }) {
  const byDate = new Map();
  tanqRowsOf(mod, corrida).forEach((r) => {
    const f = getField(r, F.fecha); if (!f || !inRange(f, from, to)) return;
    if (!byDate.has(f)) byDate.set(f, []);
    byDate.get(f).push(r);
  });
  const hasReading = (r) => getField(r, F.od) !== '' || getField(r, F.temp) !== '';
  const dates = [...byDate.keys()]
    .filter((f) => byDate.get(f).some(hasReading))   // sólo días con alguna lectura OD/°C (evita páginas vacías)
    .sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  return dates.map((fecha) => {
    const dayRows = byDate.get(fecha);
    const tanks = distinct(dayRows.map((r) => getField(r, F.tanque))).sort(natCmp);
    const d = { fecha, corrida: corrida || firstField(dayRows, F.corrida), tec: firstField(dayRows, F.tecnico) };
    tanks.forEach((tq, i) => {
      dayRows.filter((r) => getField(r, F.tanque) === tq).forEach((r) => {
        const j = STD_HRS.indexOf(normHr(getField(r, F.hora)));  // normaliza la hora → índice de toma
        if (j < 0) return;
        const t = PTIMES[j];
        const od = getField(r, F.od), tc = getField(r, F.temp);
        if (od !== '') d['od_' + i + '_' + t] = od;
        if (tc !== '') d['tc_' + i + '_' + t] = tc;
      });
    });
    return { d, tanks, tableHtml: paramsTable(d, tanks) };
  });
}

// ── Calidad de Agua (ficha de Larvicultura) ──────────────
// OJO: es la calagua de las 6 fichas de Larvicultura (hoja "Datos Larvicultura",
// cols Cel/ml·Color·%Espuma·%Suciedad·%Recambio·Observaciones), NO la vista de
// Microbiología "Calidad de Agua". La hoja ya guarda Cel/ml convertida (celMlOut).
const CALAGUA_COL = { cm: 'Cel/ml', tr: 'Color', ep: '% Espuma', sc: '% Suciedad', rc: '% Recambio', ob: 'Observaciones' };
const CALAGUA_KEYS = Object.keys(CALAGUA_COL);
const CALAGUA_SIG = ['cm', 'tr', 'ep', 'sc', 'rc'];   // señal de "hay ficha de calidad de agua"

// Réplica nativa de pdfTableCalidadAgua (celda Color con cuadrito de tono).
function calidadAguaTable(d, tanks) {
  const colorCell = (v) => {
    if (v === undefined || v === null || v === '') return '<span class="empty">—</span>';
    const info = tankColorInfo(v);
    const hex = info ? info.hex : '';
    const sw = hex ? `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1px solid #cbd5e1;background:${hex};margin-right:4px;vertical-align:middle"></span>` : '';
    return sw + esc(String(v));
  };
  const rows = tanks.map((tqName, i) => {
    const hasAny = ['e', ...CALAGUA_KEYS].some((k) => { const v = d[k + '_' + i]; return v !== undefined && v !== '' && v !== null; });
    if (!hasAny) return '';
    return `<tr>
    <td class="tqc">${esc(String(tqName))}</td>
    <td>${pdfVal(d['e_' + i])}</td>
    <td>${pdfVal(d['cm_' + i])}</td>
    <td>${colorCell(d['tr_' + i])}</td>
    <td>${pdfVal(d['ep_' + i])}</td>
    <td>${pdfVal(d['sc_' + i])}</td>
    <td>${pdfVal(d['rc_' + i])}</td>
    <td>${pdfVal(d['ob_' + i])}</td>
  </tr>`;
  }).join('');
  return `<table>
    <thead><tr>
      <th>TQ</th><th>Estadío</th><th>Cel/ml</th>
      <th>Color</th><th>% Espuma</th><th>% Suciedad</th><th>% Recambio</th>
      <th>Observaciones</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// Páginas de Calidad de Agua: una por fecha con algún parámetro fisicoquímico.
function calidadAguaPages(opts) {
  const hasAgua = (r) => CALAGUA_SIG.some((k) => getField(r, [CALAGUA_COL[k]]) !== '');
  return larvFichaPages(opts, {
    qualifies: (rows) => rows.some(hasAgua),
    fill: (d, i, trows) => {
      const r = trows.find(hasAgua) || trows[0];
      d['e_' + i] = getField(r, F.estadio);
      CALAGUA_KEYS.forEach((k) => { d[k + '_' + i] = getField(r, [CALAGUA_COL[k]]); });
    },
    table: calidadAguaTable,
  });
}

// ── Desinfección ─────────────────────────────────────────
// Fuente DISTINTA: hoja tidy "Registro_Desinfección" (1 fila por elemento con
// Tipo de Registro/Categoría/Elemento/Estado/Observaciones/Fecha Elemento). No
// hay plantilla fija en el dashboard: la tabla se arma DATA-DRIVEN agrupando por
// Tipo → Categoría, así refleja exactamente lo registrado en el Sheet.
const DX_ORIGIN = 'Registro_Desinfección';   // _SheetOrigin (classifyOrigin la deja con el nombre exacto)

function desinfRowsOf(mod, corrida) {
  return store.globalData.filter((r) => r._SheetOrigin === DX_ORIGIN
    && getField(r, F.modulo) === mod
    && (!corrida || getField(r, F.corrida) === corrida));
}

// Tabla del día: secciones por Tipo de Registro → Categoría, filas por Elemento.
function desinfeccionTable(rows) {
  const byTipo = new Map();
  rows.forEach((r) => {
    const tipo = getField(r, ['Tipo de Registro', 'Tipo']) || '—';
    const cat = getField(r, ['Categoría', 'Categoria']) || '—';
    if (!byTipo.has(tipo)) byTipo.set(tipo, new Map());
    const cats = byTipo.get(tipo);
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat).push(r);
  });
  const body = [];
  for (const [tipo, cats] of byTipo) {
    body.push(`<tr><th class="thg" colspan="4" style="text-align:left">${esc(String(tipo))}</th></tr>`);
    for (const [cat, crows] of cats) {
      body.push(`<tr><th class="thg2" colspan="4" style="text-align:left">${esc(String(cat))}</th></tr>`);
      crows.forEach((r) => {
        body.push(`<tr>
    <td style="text-align:left">${pdfVal(getField(r, ['Elemento']))}</td>
    <td>${pdfVal(getField(r, ['Estado']))}</td>
    <td style="text-align:left;white-space:normal">${pdfVal(getField(r, ['Observaciones']))}</td>
    <td>${pdfVal(getField(r, ['Fecha Elemento', 'Fecha elemento']))}</td>
  </tr>`);
      });
    }
  }
  return `<table>
    <thead><tr><th style="text-align:left">Elemento</th><th>Desinfección</th><th style="text-align:left">Observaciones</th><th>Fecha</th></tr></thead>
    <tbody>${body.join('')}</tbody></table>`;
}

// Páginas de Desinfección: una por fecha con registros (la hoja ya sólo guarda
// elementos marcados u observados → no hace falta filtro de "día con datos").
function desinfeccionPages({ mod, corrida, from, to }) {
  const byDate = new Map();
  desinfRowsOf(mod, corrida).forEach((r) => {
    const f = getField(r, F.fecha); if (!f || !inRange(f, from, to)) return;
    if (!byDate.has(f)) byDate.set(f, []);
    byDate.get(f).push(r);
  });
  const dates = [...byDate.keys()].sort((a, b) => (parseAnyDate(a) || 0) - (parseAnyDate(b) || 0));
  return dates.map((fecha) => {
    const dayRows = byDate.get(fecha);
    const d = { fecha, corrida: corrida || firstField(dayRows, F.corrida), tec: firstField(dayRows, F.tecnico) };
    return { d, tableHtml: desinfeccionTable(dayRows) };
  });
}

// Registro de generadores de páginas por ficha.
const FICHA_PAGES = {
  poblacion: poblacionPages,
  calidad: calidadPages,
  plg: plgPages,
  despacho: despachoPages,
  params: paramsPages,
  calagua: calidadAguaPages,
  desinfeccion: desinfeccionPages,
};

/**
 * Rango de fechas del módulo (primer y último registro entre TODAS las fuentes:
 * "Datos Larvicultura", "Control_Tanque" y "Registro_Desinfección"). Devuelve
 * ISO yyyy-mm-dd (o '' si no hay registros). Se usa para prellenar Desde/Hasta.
 */
export function moduleDateRange(mod, corrida) {
  let min = null, max = null;
  const scan = (rows) => rows.forEach((r) => {
    const t = parseAnyDate(getField(r, F.fecha));
    if (!t) return;
    if (min === null || t < min) min = t;
    if (max === null || t > max) max = t;
  });
  scan(larvRowsOf(mod, corrida));
  scan(tanqRowsOf(mod, corrida));
  scan(desinfRowsOf(mod, corrida));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: min ? iso(min) : '', to: max ? iso(max) : '' };
}

/** Devuelve las páginas de una ficha (o null si aún no está implementada). */
export function buildFichaPages(fid, opts) {
  const fn = FICHA_PAGES[fid];
  return fn ? fn(opts) : null;
}

/**
 * Genera y descarga los PDF de las fichas seleccionadas de un módulo.
 * Un PDF por tipo (multipágina, 1 pág/día). Los documentos se imprimen en
 * SECUENCIA vía iframe oculto (sin pop-ups; un "Guardar como PDF" por tipo).
 * @returns {{generated:Array<{fid,label,pages}>, empty:string[], pending:string[]}}
 */
export function downloadTrazabilidad({ mod, corrida, fids, from, to }) {
  const generated = [], empty = [], pending = [], docs = [];
  fids.forEach((fid) => {
    if (!isFichaId(fid)) return;
    const fn = FICHA_PAGES[fid];
    if (!fn) { pending.push(fichaLabel(fid)); return; }
    const pages = fn({ mod, corrida, from, to });
    if (!pages.length) { empty.push(fichaLabel(fid)); return; }
    const dates = pages.map((p) => p.d.fecha);
    let fileName = pdfFilename(fid, mod, dates[0], corrida);
    if (dates.length > 1) fileName += `_al_${toIsoDate(dates[dates.length - 1])}`;
    docs.push({ page: buildFichaPdfDoc({ fid, mod, fileName, pages, autoPrint: false }), fileName });
    generated.push({ fid, label: fichaLabel(fid), pages: pages.length });
  });
  if (docs.length) printFichaDocs(docs);
  return { generated, empty, pending };
}
