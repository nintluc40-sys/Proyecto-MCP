/* ============================================================
   VISITANTE — Tendencia mensual de Supervivencia / Población
   Navegador de mes (estilo Producción Omarsa) que filtra toda la
   vista. Gráfico de barras por corrida del mes (toggle Superv ⇄
   Población) + tabla con el total del mes (desglose completo).
   ============================================================ */
import { makeChart, destroyChart } from '../../core/charts.js';
import { esc, fmtPop, wqiBand, wqiSpans } from '../../core/format.js';
import { store } from '../../core/store.js';
import { getField, parseNum, F, isLarviculturaRow, obsFindings } from '../../core/fields.js';
import { fmtPct } from '../../core/util.js';
import { presentMonths, corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt, monthIndexOfCorrida } from '../../core/prodCalendar.js';
import { parseAnyDate } from '../../core/dates.js';
// Capas de datos PURAS de laboratorio (ya en el bundle base vía la vista Microbiología →
// no inflan el bundle de Visitante; solo se reutiliza su lógica de umbrales/rangos).
// `isMicroRow` / `isCalAguaRow` son el criterio ÚNICO del sistema para reconocer esas
// hojas. Aquí se comparaba `_SheetOrigin` contra la cadena EXACTA, más estricto que el
// resto de la app. Los módulos ya se importaban, así que reutilizarlos no cuesta bundle.
//
// ⚠ PRECISIÓN (auditoría de verificación): la comparación exacta NO estaba rompiendo nada,
// al contrario de lo que decía antes este comentario. `classifyOrigin` (core/sheets.js:41)
// NORMALIZA el nombre de pestaña antes de sellar la fila y es el único productor de
// `_SheetOrigin` —`store.globalData` solo se asigna en sheets.js:304, siempre desde
// `stampRows`—, así que una pestaña escrita «Microbiologia» ya llegaba aquí como
// 'Microbiología'. Con los datos reales ambos criterios son EQUIVALENTES.
// Lo que sí se gana: si algún día cambia la cadena canónica de `classifyOrigin`, este panel
// no puede desincronizarse en silencio de la vista Microbiología (que seguiría mostrando sus
// datos mientras aquí `labSummaryBlock` devuelve ''). Es blindaje a futuro, no un fallo vivo.
import { meltRow as micMelt, isAlerta as micIsAlerta, isMicroRow, MIC_FACTORS_KEY } from '../microbiologia/data.js';
import { calMeasured, calWQI, loadCalRanges, isCalAguaRow, CAL_RANGES_KEY } from '../microbiologia/calagua.data.js';

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

// ── Memo de los resúmenes del mes ─────────────────────────────
// Los 4 resúmenes recorren el store entero (monthData, además, una vez por módulo de
// cada corrida vía modCorStats), y se recalculaban en CADA repintado: el toggle
// Supervivencia⇄Población disparaba 13 escaneos completos por clic (medido), sin que
// los datos hubieran cambiado. Se memorizan por clave e invalidan por IDENTIDAD de
// store.globalData (core/sheets.js lo reemplaza por un array nuevo en cada refresco).
// La clave incluye TODOS los argumentos: `monthSup` hoy siempre se deriva de
// monthData(mIdx), pero descartarlo de la clave haría que una llamada con otro valor
// recibiera en silencio el resultado anterior.
// OJO: los objetos/arrays devueltos se COMPARTEN entre llamantes → tratarlos como
// inmutables (hoy solo se leen y se recorren; los .sort() de la vista operan sobre
// arrays recién construidos).
//
// ⚠ La identidad del store NO es la única entrada de estos resúmenes: `labSummary`
// depende además de los umbrales de laboratorio, que el técnico edita en Microbiología
// («⚙️ Rangos» y «Factores») y viven en localStorage. Sus capas de datos se recalculan
// solas en cuanto cambia la firma —está declarado en microbiologia/data.js— pero este
// memo las dejaba congeladas hasta el siguiente refresco de datos: al volver a Visitante
// se seguía viendo el WQI y los niveles de alerta calculados con los umbrales ANTERIORES.
// Por eso la firma de configuración entra también en la invalidación.
const CFG_SIGN_KEYS = [CAL_RANGES_KEY, MIC_FACTORS_KEY];
// Separador que NO puede aparecer dentro del JSON guardado, para que dos configuraciones
// distintas no produzcan la misma firma concatenada. Se construye con `fromCharCode` y
// NUNCA como carácter literal en el fuente: un NUL crudo vuelve el archivo BINARIO para
// git —se pierden los diffs— y rompe la invariante de «0 bytes de control» del repo.
const CFG_SEP = String.fromCharCode(0);
function labCfgSig() {
  // Separador NUL (como escape, nunca literal: un NUL crudo vuelve BINARIO el fuente para
  // git y rompe los diffs). No puede aparecer dentro del JSON guardado, así que dos
  // configuraciones distintas no pueden producir la misma firma concatenada.
  try { return CFG_SIGN_KEYS.map((k) => localStorage.getItem(k) || '').join(CFG_SEP); }
  catch (_) { return ''; } // sin almacenamiento → nada que invalidar
}

let _vtMemo = { src: null, cfg: null, map: new Map() };
function memo(key, compute) {
  const src = store.globalData;
  const cfg = labCfgSig();
  if (_vtMemo.src !== src || _vtMemo.cfg !== cfg) _vtMemo = { src, cfg, map: new Map() };
  if (!_vtMemo.map.has(key)) _vtMemo.map.set(key, compute());
  return _vtMemo.map.get(key);
}

/** Estadísticas por corrida del mes + totales del mes. */
function monthData(mIdx) {
  return memo(JSON.stringify(['monthData', mIdx]), () => monthDataCompute(mIdx));
}
function monthDataCompute(mIdx) {
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

// `obsFindings` (qué texto de Observaciones cuenta como HALLAZGO) vive en core/fields.js:
// la lee también la vista Revisiones, que es la dueña de esa hoja. Tenerlo por copia era
// garantizar que algún día las dos pantallas contaran hallazgos distintos.

// Lectura mínima de Biomol (NO se importa la vista lazy para no inflar el bundle base).
const BIO_KEYS = {
  IHHNV: ['IHHNV', 'ihhnv', 'CC', 'cc'], WSSV: ['WSSV', 'wssv', 'DD', 'dd'], BP: ['BP', 'bp', 'EE', 'ee'],
  AHPND: ['AHPND', 'AHPND/EMS', 'ahpnd', 'EMS', 'ems', 'PP', 'pp'], NHPB: ['NHPB', 'NHP', 'NHP-B', 'nhpb', 'nhp', 'NN', 'nn'], EHP: ['EHP', 'ehp'],
};
const bioIsPos = (raw) => ['positivo', 'positive', 'pos', 'p', '1', 'si', 'sí'].includes(String(raw || '').toLowerCase());
const bioIsMeas = (raw) => bioIsPos(raw) || ['negativo', 'negative', 'neg', 'n', '0', 'no'].includes(String(raw || '').toLowerCase());

/** Indicadores de alto nivel del mes (semáforos + conteos). */
function monthSummary(mIdx, monthSup) {
  return memo(JSON.stringify(['monthSummary', mIdx, monthSup]), () => monthSummaryCompute(mIdx, monthSup));
}
function monthSummaryCompute(mIdx, monthSup) {
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
  // `_SheetOrigin` se compara contra la cadena EXACTA a propósito en las tres hojas que este
  // fichero lee sin capa de datos propia: 'Registro_Supervision', 'Biomol' y 'Lab_Algas' son
  // la salida CANÓNICA de `classifyOrigin` (core/sheets.js:44, 48, 56) y es la misma
  // comparación que hacen sus vistas dueñas (revisiones/index.js:80,
  // biomolecular/index.js:1799, algas/index.js:56). Micro y calidad de agua van por predicado
  // porque su capa de datos ya exporta uno; estas tres no tienen equivalente exportado.
  const revRows = G.filter((r) => r._SheetOrigin === 'Registro_Supervision' && rowMonth(r) === mIdx);
  const revMods = new Set();
  revRows.forEach((r) => { const n = modNum(getField(r, F.modulo)); if (n != null) revMods.add(n); });
  // Cobertura = módulos EN PRODUCCIÓN que fueron revisados (intersección), para que
  // coincida con la ventana de detalle y nunca supere el total (evita "5 de 4").
  // ⚠ SIN respaldo a `revMods`: el fallback `prodMods.size || revMods.size` hacía
  // covX === covY —"2 de 2" y barra al 100 %— cuando NINGÚN módulo en producción tenía
  // dígitos en el nombre (`modNum` devuelve null: el caso de "CIO"), justo mientras el
  // detalle de esa misma tarjeta decía "Sin módulos en producción este mes". covY === 0 es
  // la señal de "no hay con qué medir" y `summaryBlock` la declara en vez de inventarla.
  const covY = prodMods.size;
  const covX = [...prodMods].filter((n) => revMods.has(n)).length;

  // Estado de revisiones (tasa de hallazgos por revisión).
  let revTier = 'x', revText = 'Sin datos', revCtx = 'Sin revisiones este mes';
  if (revRows.length) {
    const findings = revRows.reduce((s, r) => s + obsFindings(r).length, 0);
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
// ⚠ COPIA LITERAL de `SYS_CATS`/`sysCat` en views/algas/index.js (no se importan para no
// arrastrar la vista Algas al bundle base de Visitante). Si tocas una, TOCA LA OTRA.
// EXPORTADAS solo para que `algSysCat.sync.test.js` pueda contrastarlas con el original
// sobre el mismo conjunto de entradas: antes ambos ficheros afirmaban tener ese test y no
// existía —ni podía existir, porque esto era privado—, así que la salvaguarda que decían
// tener era ficticia y las copias podían divergir sin que nada saltara.
export const ALG_SYS_CATS = ['Masivos', 'Premasivos', 'Fundas', 'Carboys', 'PBR', 'Otros'];
export function algSysCat(s) { const u = String(s || '').trim().toUpperCase(); if (!u) return null; if (u.startsWith('PBR')) return 'PBR'; if (u.startsWith('PM')) return 'Premasivos'; if (/^F[MP]?\d*$/.test(u)) return 'Fundas'; if (/^C\d/.test(u)) return 'Carboys'; if (/^M\d/.test(u)) return 'Masivos'; return 'Otros'; }
const algIsDesc = (r) => /^s[ií]$/i.test(String(getField(r, ALG_KEYS.descartado)).trim());
function algMonthOf(r) { const n = parseInt(String(getField(r, ALG_KEYS.corrida)).replace(/\D/g, ''), 10); return Number.isNaN(n) ? -1 : monthIndexOfCorrida(n); }
function algRowsOfMonth(mIdx) { return store.globalData.filter((r) => r._SheetOrigin === 'Lab_Algas' && algMonthOf(r) === mIdx); }

/** Resumen de microalgas del mes (densidad, cultivos activos, descarte, protozoarios). */
function algasSummary(mIdx) {
  return memo(JSON.stringify(['algasSummary', mIdx]), () => algasSummaryCompute(mIdx));
}
function algasSummaryCompute(mIdx) {
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

/* ============================================================
   RESUMEN DE LABORATORIO (Microbiología + Calidad de Agua) para Visitante.
   Estas hojas se registran por FECHA de muestreo (no por corrida), así que se
   agrupan por MES-CALENDARIO. El mes-calendario del panel se ancla al periodo
   real de las corridas del mes (fechas de Larvicultura), para coincidir con el
   resto de la vista. Reutiliza la lógica pura de umbrales/rangos de laboratorio.
   ============================================================ */
const LAB_DATE_KEYS = ['Fecha muestreo', 'Fecha de muestreo', 'Fecha resultados', 'Fecha', 'fecha'];
const labDate = (r) => parseAnyDate(getField(r, LAB_DATE_KEYS));
/** Mes-calendario (año, mes 0-11) del mes de Visitante = el más común entre las fechas de
 *  Larvicultura de sus corridas. null si no hay con qué anclar.
 *
 *  ⚠ LIMITACIÓN CONOCIDA Y ACEPTADA (V2): se elige UN solo mes-calendario, el de la moda.
 *  Un mes de PRODUCCIÓN (definido por corridas) cruza a menudo dos meses de calendario, y
 *  las muestras de laboratorio del mes minoritario quedan FUERA del conteo — el panel
 *  sub-cuenta en silencio. Aceptado a propósito: la alternativa (abarcar el rango completo
 *  de fechas de las corridas) mezclaría meses contiguos en un panel dirigido a público
 *  general. Si algún día importa la cifra exacta, hay que derivar el rango de TODAS las
 *  fechas de las corridas en vez de la moda. */
function labCalMonth(mIdx) {
  const cors = new Set(corridasOfMonth(mIdx));
  const counts = new Map();
  store.globalData.forEach((r) => {
    if (!isLarviculturaRow(r) || !cors.has(getField(r, F.corrida))) return;
    const d = parseAnyDate(getField(r, F.fecha));
    if (!d || isNaN(d)) return;
    const k = d.getFullYear() + '-' + d.getMonth();
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  let best = null, bestN = 0;
  counts.forEach((n, k) => { if (n > bestN) { bestN = n; best = k; } });
  if (!best) return null;
  const [y, m] = best.split('-').map(Number);
  return { year: y, month: m };
}
const inCalMonth = (r, cm) => { if (!cm) return false; const d = labDate(r); return !!d && !isNaN(d) && d.getFullYear() === cm.year && d.getMonth() === cm.month; };

/** Resumen de laboratorio del mes (micro: % de muestras en alerta · agua: WQI y % en rango). */
function labSummary(mIdx) {
  return memo(JSON.stringify(['labSummary', mIdx]), () => labSummaryCompute(mIdx));
}
function labSummaryCompute(mIdx) {
  const cm = labCalMonth(mIdx);
  const micRows = store.globalData.filter((r) => isMicroRow(r) && inCalMonth(r, cm));
  const micAlert = micRows.filter((r) => micMelt(r).some((m) => micIsAlerta(m.nivel))).length;
  const micPct = micRows.length ? Math.round(micAlert / micRows.length * 100) : null;
  const micTier = !micRows.length ? 'x' : micAlert === 0 ? 'v' : micPct <= 20 ? 'a' : 'r';
  // Con muchas muestras y muy pocas alertas el redondeo daba 0 → el chip salía ÁMBAR
  // diciendo «0% en alerta», contradiciéndose con su propio color y con el conteo de al
  // lado. Solo el TEXTO cambia: `micPct` (y por tanto el semáforo) se conserva intacto.
  const micPctTxt = micPct === null ? '—' : (micAlert > 0 && micPct === 0 ? '<1%' : micPct + '%');
  const calRows = store.globalData.filter((r) => isCalAguaRow(r) && inCalMonth(r, cm));
  const ranges = loadCalRanges();
  const measures = calRows.flatMap((r) => calMeasured(r, ranges));
  const evaluable = measures.filter((m) => m.estado === 'dentro' || m.estado === 'fuera');
  const calPct = evaluable.length ? Math.round(evaluable.filter((m) => m.estado === 'dentro').length / evaluable.length * 100) : null;
  const wqi = calWQI(measures, ranges).wqi;
  const calTier = calPct == null ? 'x' : calPct >= 90 ? 'v' : calPct >= 70 ? 'a' : 'r';
  // Texto del porcentaje, con la MISMA guarda de `null` que `micPctTxt` en la tarjeta de al
  // lado y que el WQI en esta misma línea. Hay muestras de agua cuyos parámetros no tienen
  // rango objetivo (medido: 32 % de las mediciones salen `sin-rango`, y 90 filas no traen
  // NINGUNA evaluable), así que `calPct` puede ser null con `calRows` no vacío: la tarjeta y
  // el detalle imprimían entonces el literal «null% en rango». La rama ya estaba reconocida
  // más abajo —el detalle dice «Sin parámetros con rango objetivo»—, solo faltaba aquí.
  // `calPct` (y con él el semáforo `calTier`) NO cambia: esto es únicamente el rótulo.
  const calPctTxt = calPct === null ? '—' : calPct + '%';
  return { cm, micRows, micAlert, micPct, micPctTxt, micTier, calRows, measures, calPct, calPctTxt, wqi, calTier };
}

/** Bloque "🧫 Laboratorio de agua y sanidad" (2 tarjetas clicables) para Visitante. */
function labSummaryBlock(mIdx) {
  const s = labSummary(mIdx);
  if (!s.micRows.length && !s.calRows.length) return ''; // sin datos de laboratorio este mes
  const AC = '#00838f';
  return `<div class="card vt-card">
    <div class="vt-card-title" style="color:${AC}">🧫 Laboratorio de agua y sanidad · ${esc(monthLabelAt(mIdx))} <span class="muted" style="font-weight:600;font-size:12px">· microbiología y calidad de agua</span></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${sumCard('🧫', 'Microbiología', s.micRows.length ? semChip(s.micTier, `${s.micPctTxt} en alerta`) : semChip('x', 'Sin muestras'), s.micRows.length ? `${s.micRows.length} muestra(s) · ${s.micAlert} en nivel alto` : 'Sin análisis microbiológicos', 'labMicro', AC)}
      ${sumCard('💧', 'Calidad del agua', s.calRows.length ? semChip(s.calTier, `${s.calPctTxt} en rango`) : semChip('x', 'Sin muestras'), s.calRows.length ? `${s.calRows.length} muestra(s) · WQI ${s.wqi == null ? '—' : s.wqi}` : 'Sin análisis de agua', 'labAgua', AC)}
    </div>
  </div>`;
}

// Tarjeta de resumen (valueHtml = HTML controlado; label/context se escapan).
// `key` (opcional) la vuelve clicable → abre la ventana de detalle.
function sumCard(icon, label, valueHtml, context, key, accent) {
  const interactive = key ? ` data-sum="${key}" role="button" tabindex="0" title="Clic para ver el detalle"` : '';
  const chevron = key ? ' <span style="opacity:.45">›</span>' : '';
  // Lo estático vive en `.vt-sum-card` (la clase estaba en el marcado SIN ninguna regla CSS
  // en todo el repo: era un gancho muerto y la caja se dibujaba entera con `style=""`).
  // Queda inline solo el acento, que varía por bloque; el `border-top` inline sigue ganando
  // al `border` de la clase igual que antes ganaba al `border` inline que lo precedía.
  // El puntero pasa a `.vt-sum-card[data-sum]`: `data-sum` está exactamente cuando hay `key`.
  const accentStyle = accent ? ` style="border-top:3px solid ${accent}"` : '';
  return `<div class="vt-sum-card"${interactive}${accentStyle}>
    <div style="font-size:12px;color:var(--c-text-soft);font-weight:600">${icon} ${esc(label)}${chevron}</div>
    <div style="font-size:19px;font-weight:800;margin:5px 0;color:var(--c-text);line-height:1.2">${valueHtml}</div>
    <div style="font-size:11px;color:var(--c-text-muted)">${esc(context)}</div>
  </div>`;
}

/** Bloque “Resumen del mes” (6 tarjetas) para Visitante. */
function summaryBlock(mIdx, monthSup, label) {
  const s = monthSummary(mIdx, monthSup);
  const covBar = s.covY ? Math.round(s.covX / s.covY * 100) : 0;
  // Sin módulos en producción no hay cobertura que medir: se declara, no se inventa un 100 %
  // (así la tarjeta dice lo mismo que el detalle que ella misma abre).
  const covVal = s.covY
    ? `${s.covX} de ${s.covY}<div style="height:6px;background:var(--c-surface-2);border-radius:4px;margin-top:5px;overflow:hidden"><div style="height:100%;width:${covBar}%;background:#3F51B5"></div></div>`
    : semChip('x', 'Sin módulos en producción');
  return `<div class="card vt-card">
    <div class="vt-card-title">📊 Resumen del mes · ${esc(label)} <span class="muted" style="font-weight:600;font-size:12px">· panorama general</span></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${sumCard('🦐', 'Calidad de las larvas', semChip(s.calTier, s.calText), 'Según la supervivencia promedio', 'calidad')}
      ${sumCard('📈', 'Supervivencia promedio', fmtPct(monthSup), 'Cosecha ÷ siembra del mes', 'superv')}
      ${sumCard('🔍', 'Cobertura de supervisión', covVal, s.covY ? 'módulos revisados' : 'no hay cobertura que medir', 'cobertura')}
      ${sumCard('⚠️', 'Estado de revisiones', semChip(s.revTier, s.revText), s.revCtx, 'revisiones')}
      ${sumCard('🧬', 'Sanidad (laboratorio)', semChip(s.bioTier, s.bioText), s.bioCtx, 'sanidad')}
      ${sumCard('🧪', 'Análisis genéticos', String(s.bioSamples), 'muestras con prueba de patógenos', 'analisis')}
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

// ── Gráficos del bloque de laboratorio (público general) ──

/* Hex por severidad del WQI. Esta vista NO puede usar los tokens CSS que devuelve
   core: el medidor es un <canvas> de Chart.js y ahí `var(--…)` no se resuelve. Así
   que toma de core el umbral y la etiqueta, y solo el color es propio. */
const WQI_HEX = {
  optimo: '#2E9E5B', vigilancia: '#E6A100', fuera: '#E67635',
  critico: '#D64545', 'sin-rango': 'var(--c-text-muted)',
};

/** Banda del WQI (0–100) en la paleta de esta vista: color hex + etiqueta. */
function wqiVisual(wqi) {
  const b = wqiBand(wqi);
  return { color: WQI_HEX[b.sev], label: b.label };
}

/** Barras horizontales por patógeno: nº de muestras del mes en nivel alto. */
function drawLabMicroBars(alertRows) {
  const labels = alertRows.map(([lbl]) => lbl);
  const values = alertRows.map(([, o]) => o.alert);
  makeChart('vtLabMicroChart', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'En alerta', data: values, backgroundColor: '#D64545cc', borderColor: '#D64545', borderWidth: 1, borderRadius: 4, maxBarThickness: 22 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'muestras en nivel Moderado/Elevado' }, grid: { display: false } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.x} muestra(s) en alerta` } } },
    },
  });
}

/** Medidor (gauge) semicircular del WQI (0–100): 4 zonas de color + aguja en el valor. */
function drawWqiGauge(wqi) {
  // Anchos de zona DERIVADOS de los umbrales, no escritos a mano: antes eran un
  // [50, 20, 15, 15] literal donde el 85 quedaba disuelto en un 15 y ningún grep
  // lo encontraba, así que mover el umbral descuadraba las zonas contra la aguja
  // en silencio. Ahora salen de la misma fuente que la etiqueta.
  const spans = wqiSpans();
  const zones = spans.map((z) => z.to - z.from);
  const colors = spans.map((z) => WQI_HEX[z.sev]);
  const needle = {
    id: 'wqiNeedle',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0); const arc = meta.data && meta.data[0];
      if (!arc) return;
      const cx = arc.x, cy = arc.y, r = (arc.outerRadius + arc.innerRadius) / 2;
      // Punto en el semicírculo superior: f=0 (WQI 0) a la izquierda, f=1 (WQI 100) a la
      // derecha, f=0.5 arriba. x = cx − cos(fπ)·r ; y = cy − sin(fπ)·r.
      const f = Math.max(0, Math.min(1, wqi / 100)); const a = f * Math.PI;
      const x2 = cx - Math.cos(a) * r, y2 = cy - Math.sin(a) * r;
      const ctx = chart.ctx; ctx.save();
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
    },
  };
  makeChart('vtLabAguaGauge', {
    type: 'doughnut',
    data: { datasets: [{ data: zones, backgroundColor: colors, borderWidth: 0, circumference: 180, rotation: 270 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', events: [], plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    plugins: [needle],
  });
}

/** Construye { title, html, draw? } del detalle de una tarjeta para un mes dado. */
function sumDetail(key, mIdx, monthSup) {
  const G = store.globalData;
  const numAvg = (rows, keys) => avgOf(rows.map((r) => parseNum(r, keys)).filter((v) => v !== null));

  if (key === 'calidad') {
    const rows = G.filter((r) => isLarviculturaRow(r) && rowMonth(r) === mIdx);
    // ⚠ «Supervivencia anotada» NO es la misma cifra que la tarjeta «Supervivencia promedio»
    // del panel: aquélla es cosecha ÷ siembra del mes (`monthSup`, derivada de las
    // poblaciones) y ésta es el promedio de la COLUMNA Supervivencia que el operador escribe
    // a diario. Pueden diferir mucho —comprobado— y ambas salían rotuladas «Supervivencia» en
    // la misma pantalla, así que el detalle parecía desmentir a la tarjeta que lo abre. El
    // rótulo dice ahora de dónde viene cada una; los números no cambian.
    const VARS = [
      ['Supervivencia anotada (columna del registro diario)', F.supervivencia, '%'],
      ['Deformidad', ['Deformidad', 'deformidad'], '%'],
      ['Intestino lleno', ['Intestino_Lleno', 'IntestinoLleno', 'intestino_lleno'], '%'],
      ['Intestino vacío', ['Intestino_Vacio', 'Intestino_Vacío', 'intestino_vacio'], '%'],
      ['% Actividad', ['% Actividad', 'Actividad', '%Actividad'], '%'],
      ['Estrés', ['Estrés', 'Estres', 'estrés', 'estres'], ''],
    ];
    const body = VARS.map(([lbl, keys, u]) => { const v = numAvg(rows, keys); return v === null ? '' : `<tr><td>${esc(lbl)}</td><td><b>${v.toFixed(1)}${u}</b></td></tr>`; }).filter(Boolean).join('');
    return { title: '🦐 Calidad de las larvas', html: body
      ? `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">Promedios del mes · todas las corridas (${rows.length} registro(s)). La <b>supervivencia anotada</b> es el promedio de lo que se escribe cada día en la planilla; la tarjeta «Supervivencia promedio» del panel se calcula aparte, como cosecha ÷ siembra del mes, por lo que ambas cifras no tienen por qué coincidir.</p>${detailTable(['Variable', 'Promedio'], body)}`
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
    revRows.forEach((r) => obsFindings(r).forEach((o) => map.set(o, (map.get(o) || 0) + 1)));
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
    return { title: '🧪 Análisis genéticos', html: bioRows.length
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

  if (key === 'labMicro' || key === 'labAgua') {
    const s = labSummary(mIdx);
    if (key === 'labMicro') {
      if (!s.micRows.length) return { title: '🧫 Microbiología', html: '<p style="color:var(--c-text-muted)">Sin análisis microbiológicos este mes.</p>' };
      const byPat = new Map();
      s.micRows.forEach((r) => micMelt(r).forEach((m) => {
        if (!m.nivel) return;
        const o = byPat.get(m.label) || { alert: 0, total: 0 }; o.total++; if (micIsAlerta(m.nivel)) o.alert++; byPat.set(m.label, o);
      }));
      const alertRows = [...byPat.entries()].filter(([, o]) => o.alert > 0).sort((a, b) => b[1].alert - a[1].alert);
      const body = alertRows.map(([lbl, o]) => `<tr><td>${esc(lbl)}</td><td><b>${o.alert}</b></td><td>${o.total}</td></tr>`).join('');
      // Gráfico: barras por patógeno con nº de muestras en alerta (corrobora la tabla).
      const chart = alertRows.length
        ? '<div class="vt-lab-chart"><canvas id="vtLabMicroChart"></canvas></div>'
        : '';
      return {
        title: '🧫 Microbiología del mes',
        html: `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">${s.micRows.length} muestra(s) · <b>${s.micAlert}</b> con algún patógeno en nivel Moderado/Elevado (${s.micPctTxt}).</p>`
          + chart
          + (body ? detailTable(['Patógeno', 'En alerta', 'Muestras'], body) : '<p style="color:#2E9E5B;font-weight:700">🟢 Sin patógenos en nivel alto este mes.</p>'),
        draw: alertRows.length ? () => drawLabMicroBars(alertRows) : null,
      };
    }
    if (!s.calRows.length) return { title: '💧 Calidad del agua', html: '<p style="color:var(--c-text-muted)">Sin análisis de agua este mes.</p>' };
    const byParam = new Map();
    s.measures.forEach((m) => {
      if (m.estado !== 'dentro' && m.estado !== 'fuera') return;
      const o = byParam.get(m.label) || { inRange: 0, out: 0, unit: m.unit }; if (m.estado === 'dentro') o.inRange++; else o.out++; byParam.set(m.label, o);
    });
    const body = [...byParam.entries()].sort((a, b) => b[1].out - a[1].out).map(([lbl, o]) => {
      const tot = o.inRange + o.out; const pct = Math.round(o.inRange / tot * 100); const col = pct >= 90 ? '#2E9E5B' : pct >= 70 ? '#E6A100' : '#D64545';
      return `<tr><td>${esc(lbl)}${o.unit ? ` <span style="color:var(--c-text-muted)">(${esc(o.unit)})</span>` : ''}</td><td>${o.inRange}</td><td>${o.out}</td><td style="color:${col};font-weight:800">${pct}%</td></tr>`;
    }).join('');
    const band = wqiVisual(s.wqi);
    // Gráfico: medidor (gauge) del WQI 0–100 con zonas de color y aguja.
    const gauge = s.wqi == null ? '' : `<div class="vt-gauge">
        <div class="vt-gauge-host"><canvas id="vtLabAguaGauge"></canvas></div>
        <div class="vt-gauge-read"><span class="vt-gauge-num">${s.wqi}</span><span class="vt-gauge-den">/100</span> · <b style="color:${band.color}">${esc(band.label)}</b></div>
      </div>`;
    return {
      title: '💧 Calidad del agua del mes',
      html: `<p style="font-size:12px;color:var(--c-text-soft);margin:0 0 10px">${s.calRows.length} muestra(s) · índice de calidad del agua (WQI): <b>${s.wqi == null ? '—' : s.wqi}</b> · <b>${s.calPctTxt}</b> de parámetros en rango.</p>`
        + gauge
        + (body ? detailTable(['Parámetro', 'En rango', 'Fuera', '% en rango'], body) : '<p style="color:var(--c-text-muted)">Sin parámetros con rango objetivo.</p>'),
      draw: s.wqi == null ? null : () => drawWqiGauge(s.wqi),
    };
  }

  return { title: 'Detalle', html: '<p style="color:var(--c-text-muted)">Sin detalle.</p>' };
}

/** HTML del overlay de detalle (una sola vez por montaje de la vista). */
function sumModalHTML() {
  return `<div id="vtSumModal" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.45);align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto">
    <div id="vtSumCard" role="dialog" aria-modal="true" aria-labelledby="vtSumTitle" tabindex="-1" style="background:var(--c-surface);border-radius:16px;max-width:680px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid var(--c-border-soft)">
        <span id="vtSumTitle" style="font-size:16px;font-weight:800;color:var(--c-text)"></span>
        <button id="vtSumClose" style="border:none;background:var(--c-surface-2);border-radius:8px;padding:6px 11px;cursor:pointer;font-size:13px;color:var(--c-text-soft)">✕ Cerrar</button>
      </div>
      <div id="vtSumBody" style="padding:16px 20px"></div>
    </div>
  </div>`;
}

let vtEscHandler = null;
let vtLastFocus = null; // a dónde devolver el foco al cerrar el detalle

// Elementos enfocables VISIBLES del diálogo (los de ramas ocultas no deben recibir Tab).
const VT_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const vtFocusables = (el) => [...el.querySelectorAll(VT_FOCUSABLE)].filter((n) => !n.closest('[hidden]'));

/** Tab circular DENTRO del diálogo. Sin esto se tabulaba a las pestañas de navegación por
 *  detrás del velo y desde ahí se podía cambiar de vista con el detalle todavía montado. */
function vtTrapTab(e) {
  if (e.key !== 'Tab') return;
  const card = document.getElementById('vtSumCard');
  if (!card) return;
  const f = vtFocusables(card);
  if (!f.length) { e.preventDefault(); card.focus?.(); return; }
  const first = f[0], last = f[f.length - 1], active = document.activeElement;
  if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}

function closeSumModal() {
  const m = document.getElementById('vtSumModal');
  // Solo se toca `body.modal-open` si era ESTE modal el que estaba abierto. El handler
  // de Escape vive en `document` y sobrevive a la navegación (el overlay no atrapa el
  // foco: se puede tabular a las pestañas por detrás y cambiar de vista con el detalle
  // abierto). Sin esta guarda, cualquier Escape en OTRA vista apagaba el `modal-open`
  // de esa vista — y esa clase es la que refresh.js usa para pausar el auto-refresco,
  // así que la app se re-renderizaba por debajo de un modal ajeno todavía visible.
  // Como la última línea retira el listener, el huérfano además se auto-neutraliza.
  const estabaAbierto = !!m && m.isConnected && m.style.display !== 'none';
  if (m) m.style.display = 'none';
  if (estabaAbierto) document.body.classList.remove('modal-open');
  // Libera los gráficos del detalle (micro/agua) al cerrar: no dejar charts huérfanos.
  destroyChart('vtLabMicroChart'); destroyChart('vtLabAguaGauge');
  if (vtEscHandler) { document.removeEventListener('keydown', vtEscHandler); vtEscHandler = null; }
  if (m) m.removeEventListener('keydown', vtTrapTab);
  // Devuelve el foco a la tarjeta que abrió el detalle (si sigue en el documento): sin
  // esto el foco quedaba en un nodo ya oculto y el teclado volvía al principio de la página.
  if (estabaAbierto && vtLastFocus && vtLastFocus.isConnected) vtLastFocus.focus?.();
  vtLastFocus = null;
}
function openSumModal(key, mIdx, monthSup, trigger) {
  const m = document.getElementById('vtSumModal'); if (!m) return;
  vtLastFocus = trigger || document.activeElement;
  // Libera un gráfico previo del detalle antes de reemplazar su canvas (evita huérfanos).
  destroyChart('vtLabMicroChart'); destroyChart('vtLabAguaGauge');
  const { title, html, draw } = sumDetail(key, mIdx, monthSup);
  document.getElementById('vtSumTitle').textContent = title;
  document.getElementById('vtSumBody').innerHTML = html;
  m.style.display = 'flex';
  document.body.classList.add('modal-open'); // pausa el auto-refresco mientras está abierto
  // El gráfico se dibuja tras insertar el HTML (necesita el canvas ya en el DOM).
  if (typeof draw === 'function') requestAnimationFrame(() => { try { draw(); } catch (e) { console.error('[visitante] lab-chart', e); } });
  // Remueve un handler previo antes de re-registrar: re-abrir sin cerrar (p. ej. pulsar
  // Enter sobre la tarjeta, que conserva el foco tras el primer clic) dejaba listeners de
  // Escape HUÉRFANOS acumulándose en document (cada uno permanente y disparándose en
  // cualquier Escape de la app). Con el remove previo, siempre hay a lo sumo uno activo.
  if (vtEscHandler) document.removeEventListener('keydown', vtEscHandler);
  vtEscHandler = (e) => { if (e.key === 'Escape') closeSumModal(); };
  document.addEventListener('keydown', vtEscHandler);
  // Trampa de Tab + foco DENTRO del diálogo. `removeEventListener` previo por si se
  // reabre sin cerrar (Enter sobre la tarjeta, que conserva el foco tras el primer clic).
  m.removeEventListener('keydown', vtTrapTab);
  m.addEventListener('keydown', vtTrapTab);
  const card = document.getElementById('vtSumCard');
  if (card) (vtFocusables(card)[0] || card).focus?.();
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
          <div class="prod-title">📅 <b data-vtmonthlbl>${esc(label)}</b> <span class="muted" data-vtcorrlbl>(${d.nCorridas} corrida${d.nCorridas === 1 ? '' : 's'})</span></div>
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
      ${labSummaryBlock(mIdx)}
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
    // El deslizador NO puede re-renderizar en `input`: `paint()` reemplaza wrap.innerHTML,
    // así que el propio nodo que se está arrastrando se arranca del DOM en el primer
    // movimiento y el arrastre se corta — cada agarre avanzaba un solo paso. `input` se
    // queda con el rótulo del mes (realimentación inmediata y barata) y el re-render se
    // hace en `change`, que en un <input type="range"> dispara al soltar. Mismo patrón que
    // el navegador de meses de la Vista Ejecutiva. El recuento de corridas se blanquea
    // durante el arrastre en vez de quedarse con el del mes anterior, que sería mentira.
    const slider = wrap.querySelector('[data-vtslider]');
    if (slider) {
      const monthLbl = wrap.querySelector('[data-vtmonthlbl]');
      const corrLbl = wrap.querySelector('[data-vtcorrlbl]');
      slider.addEventListener('input', (e) => {
        const m = months[+e.target.value];
        if (m === undefined) return;
        if (monthLbl) monthLbl.textContent = monthLabelAt(m);
        if (corrLbl) corrLbl.textContent = '';
      });
      slider.addEventListener('change', (e) => { pos = +e.target.value; paint(); });
    }
    wrap.querySelectorAll('[data-vtmetric]').forEach((b) => b.addEventListener('click', () => { vtState.metric = b.dataset.vtmetric; paint(); }));
    // Tarjetas del resumen → ventana de detalle (clic o Enter/Espacio).
    wrap.querySelectorAll('[data-sum]').forEach((c) => {
      const open = () => openSumModal(c.dataset.sum, months[pos], monthData(months[pos]).monthSup, c);
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  paint();
}
