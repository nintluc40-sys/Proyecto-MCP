/* ============================================================
   GOOGLE SHEETS — motor de conexión y extracción
   Portado y refinado del original (autoConnectSheets, _fetchAsXLSX,
   fetchCSVRobust, parseCSV, getSheetGids, detectSheetName,
   processAndDisplaySheetsData).

   Estrategia:
     1) XLSX completo  → export?format=xlsx  (1 sola petición, todas las hojas)
     2) Fallback CSV   → gviz/tq?out:csv por gid (descubre gids por scraping)

   Cada fila se etiqueta con _SheetOrigin (Larvicultura, Control_Tanque,
   Maduracion, Lab_Algas, Morfologia) y se sella el Módulo desde el
   nombre de pestaña cuando aplica.
   ============================================================ */
import { SHEETS_URL, FETCH_TIMEOUT_MS, XLSX_TIMEOUT_MS } from '../config.js';
import { store, emit, EV } from './store.js';
import { autoCalcMortalidad, getField, F } from './fields.js';
import { parseAnyDate, clearDateCache } from './dates.js';
import { isUnsafeKey } from './util.js';

// ---------- utilidades de red ----------
function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, ms);
  opts.signal = ctrl.signal;
  return fetch(url, opts).finally(() => clearTimeout(t));
}

export function parseSheetsIds(url) {
  const pub = url.match(/\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (pub) return { type: 'pub', pubId: pub[1] };
  const real = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (real) return { type: 'real', realId: real[1] };
  return null;
}

function activeUrl() {
  return (store.sheetsUrlOverride && store.sheetsUrlOverride.trim()) || SHEETS_URL;
}

// ---------- clasificación ----------
export function classifyOrigin(name) {
  const n = String(name).trim();
  if (/^Control_Tanque/i.test(n)) return 'Control_Tanque';
  if (/registro[_\s]*supervisi/i.test(n)) return 'Registro_Supervision';
  // ⚠ Va ANTES que la regla de «larvicultura|larvi»: la hoja del traslado no lleva
  // esa palabra hoy, pero dejarla detrás sería confiar en que nunca la lleve. Su
  // origen alimenta la sub-vista de Traslado del Supervisor.
  if (/registro[_\s]*traslado/i.test(n)) return 'Registro_Traslado';
  // ⚠ Va ANTES que la regla de «microbiolog»: "Patología en Fresco" es una hoja del
  // módulo Microbiología, así que una pestaña renombrada a "Microbiología — Patología
  // en Fresco" la reclamaría /microbiolog/i y sus filas entrarían en Bacteriología,
  // que lee un juego de columnas por completo distinto. Delante, cae donde debe.
  // Sin esta regla el origen era el nombre CRUDO de la pestaña: nada lo consumía mal,
  // pero tampoco había cadena canónica contra la que comparar (acentos, "fresco" en
  // minúscula). La hoja la escribe el monolito como PAT_SHEET (engine.js).
  if (/patolog/i.test(n)) return 'Patología en Fresco';
  if (/microbiolog/i.test(n)) return 'Microbiología';
  if (/calidad\s*de\s*agua/i.test(n)) return 'Calidad de Agua';
  if (/^marea/i.test(n)) return 'Marea';
  if (/biomol/i.test(n)) return 'Biomol';
  if (/larvicultura|larvi/i.test(n)) return 'Larvicultura';
  // Hojas del Registro reproductivo (Maduración): _SheetOrigin específico para que la
  // Consulta las lea por nombre exacto (el resto de Maduración cae en 'Maduracion').
  if (/maduraci[oó]n\s+matriz/i.test(n)) return 'Maduración MATRIZ';
  if (/maduraci[oó]n\s+bit[aá]cora/i.test(n)) return 'Maduración Bitácora';
  if (/maduraci[oó]n\s+transferencias/i.test(n)) return 'Maduración Transferencias';
  if (/maduracion|maduración/i.test(n)) return 'Maduracion';
  if (/algas|lab_algas/i.test(n)) return 'Lab_Algas';
  if (/morfolog/i.test(n)) return 'Morfologia';
  return n;
}

/** Detecta el módulo embebido en el nombre de pestaña (p.ej. "Larvicultura - M01"). */
function moduleFromTabName(name, isTanque) {
  const dash = name.match(/[-–]\s*([A-Za-z0-9]+)\s*$/);
  const tq = isTanque ? name.match(/Control_Tanque\s+([A-Za-z0-9]+)/i) : null;
  const generic = name.match(/\b(M\d+|CIO|[A-Z]{2,4}\d*)\b/);
  const m = (dash || tq || generic || [])[1] || null;
  return m ? m.toUpperCase() : null;
}

/** Detecta nombre de hoja por título o por columnas (para el fallback CSV).
 *  Exportada SÓLO para poder probarla: es la rama que se recorre cuando el gid llegó
 *  sin título, y su orden de heurísticas es justo lo que hay que fijar con pruebas. */
export function detectSheetName(rows, gid, rawTitle) {
  if (rawTitle) {
    const origin = classifyOrigin(rawTitle);
    if (origin !== String(rawTitle).trim()) return origin;
  }
  if (!rows?.length) return 'Hoja' + (gid + 1);
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase().trim());
  const has = (pred) => keys.some(pred);
  if (has((k) => k === 'hora') && has((k) => k === 'tanque') &&
      has((k) => k === 'od' || k.startsWith('ox') || k === 'temperatura' || k === 'temp')) return 'Control_Tanque';
  if (has((k) => k.includes('cel_ml') || k.includes('tipo_cultivo') || k.includes('corrida_algas'))) return 'Lab_Algas';
  if (has((k) => k.includes('ihhnv') || k.includes('wssv') || k.includes('ahpnd'))) return 'Biomol';
  // Microbiología: tríos "<patógeno> UFC"/"… Nivel" + V.Luminiscentes (firma propia).
  if (has((k) => k.includes('luminiscent')) || has((k) => k.includes('v.totales') || k.includes('v.amarillos'))) return 'Microbiología';
  // Registro reproductivo (MATRIZ / Bitácora / Transferencias). El «Trovan ID» es su
  // firma y NO aparece en ninguna otra hoja del documento (medido el 2026-08-31 sobre
  // las cabeceras reales de las 35 pestañas: sólo lo llevan estas). Sin esta rama las
  // tres caían al final y salían como "Hoja<N>", con lo que MAD_MATRIZ_ORIGIN y sus
  // hermanas no casaban y la vista de Maduración se quedaba VACÍA — el mismo fallo
  // silencioso que tenía Patología, y por la misma razón: ninguna firma por columnas.
  // Se distinguen entre sí por su columna exclusiva; el orden va de la más específica
  // a la más genérica.
  if (has((k) => k.includes('trovan'))) {
    if (has((k) => k.includes('tr-id'))) return 'Maduración Transferencias';
    if (has((k) => k.includes('sala actual') || k.includes('color anillo'))) return 'Maduración MATRIZ';
    return 'Maduración Bitácora';
  }
  if (has((k) => k.includes('sala') && (k.includes('machos') || k.includes('hembras') || k.includes('nauplio')))) return 'Maduracion';
  // Registro_Supervisión comparte columnas (Intestino, Deformidad, Módulo) con
  // Morfologia/Larvicultura; debe detectarse ANTES por su firma propia.
  if (has((k) => k.includes('supervisor')) &&
      has((k) => k.includes('tipo_revis') || k.includes('condici') || k.includes('acci'))) return 'Registro_Supervision';
  // ⚠ Patología en Fresco va ANTES que Morfologia: su ficha trae SEIS columnas
  // «Intestino — …» (Gregarinas, Baculovirus, Nemátodos, Balanceado, Algas, Detritos)
  // que disparan la heurística `intestino` de la línea siguiente. Esta rama sólo se
  // recorre cuando el gid llegó SIN título (respaldo CSV, sheets.js:320), que es
  // justo cuando no hay nombre del que tirar. Firma propia: los otros dos grupos de
  // la ficha —Hepatopáncreas y Branquias—, que Morfologia no tiene.
  if (has((k) => k.includes('hepatop') || k.includes('branquias'))) return 'Patología en Fresco';
  if (has((k) => k.includes('intestino') || k.includes('deformidad') || k.includes('lleno'))) return 'Morfologia';
  if (has((k) => k.includes('corrida') || k.includes('módulo') || k.includes('modulo') || k.includes('supervivencia'))) return 'Larvicultura';
  return rawTitle || ('Hoja' + (gid + 1));
}

// ---------- normalización de filas ----------
function stampRows(rows, name) {
  const origin = classifyOrigin(name);
  const isTanque = origin === 'Control_Tanque';
  const isLarv = origin === 'Larvicultura';
  const modStamp = (isTanque || isLarv) ? moduleFromTabName(name, isTanque) : null;
  rows.forEach((row) => {
    row._SheetOrigin = origin;
    if (modStamp) {
      if (isLarv) {
        row['Módulo'] = modStamp;
      } else if (isTanque) {
        const hasMod = F.modulo.some((k) => row[k] && String(row[k]).trim());
        if (!hasMod) row['Módulo'] = modStamp;
      }
    }
  });
  return rows;
}

// ---------- XLSX (camino principal) ----------
function getXLSX() {
  const X = window.XLSX;
  if (!X) throw new Error('SheetJS (XLSX) no disponible — revisa el <script> CDN en index.html.');
  return X;
}

async function fetchWorkbook(ids) {
  const realId = ids.type === 'real' ? ids.realId : null;
  if (!realId) return null;
  const url = `https://docs.google.com/spreadsheets/d/${realId}/export?format=xlsx&_cb=${Math.floor(Date.now() / 30000)}`;
  // Timeout propio (más generoso): Google genera el workbook en el servidor antes
  // de transferirlo. Un timeout corto aquí es la causa raíz del "solo carga 1 hoja".
  const resp = await fetchWithTimeout(url, { cache: 'no-store' }, XLSX_TIMEOUT_MS);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const buf = await resp.arrayBuffer();
  const XLSX = getXLSX();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
  return wb?.SheetNames?.length ? wb : null;
}

/** Convierte un workbook XLSX en el store de hojas { name: rows[] }. */
function workbookToSheets(wb) {
  const XLSX = getXLSX();
  const sheets = {};
  wb.SheetNames.forEach((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
    if (rows?.length) sheets[name] = stampRows(rows, name);
  });
  return sheets;
}

// ---------- CSV (fallback) ----------
/** Trocea el texto CSV en filas de campos respetando las comillas (RFC 4180).
 *
 *  El salto de línea DENTRO de un campo entrecomillado pertenece al campo y NO separa
 *  filas. Antes se partía por `\n` ANTES de mirar las comillas, así que una celda con un
 *  Enter —«Observaciones» es texto libre tecleado a mano— rompía el bloque: medido sobre
 *  un CSV de 2 filas, devolvía 3, la fila real perdía su ID y se colaba una fila fantasma
 *  con el resto del texto en la primera columna. Esa fila entraba al store con su
 *  `_SheetOrigin` y contaba en KPIs y gráficos, y la legítima quedaba sin ID (justo la
 *  clase de fila que el upsert no puede emparejar).
 *
 *  Devuelve `string[][]`. Una comilla doble escapada («""») produce una comilla literal. */
function splitCSVRows(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch !== '"') { field += ch; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch; // el \r de CRLF lo cierra el \n
  }
  // Última fila sin salto final. Si el texto termina en '\n', no queda nada pendiente
  // y no se añade una fila vacía de más.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Exportada para el test que fija el trato de los saltos de línea entrecomillados;
 *  el pipeline la sigue usando sólo desde `fetchViaCsv`. */
export function parseCSV(text) {
  const raw = splitCSVRows(text);
  if (raw.length < 2) return [];
  const headers = raw[0].map((h) => h.trim());
  const validIdx = headers.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const vals = raw[i];
    if (!vals.length) continue;
    // Línea en blanco: equivalente exacto del `!lines[i].trim()` anterior, que sólo
    // descartaba líneas SIN comas. Una fila de comas sueltas (",,") seguía produciendo
    // un objeto de campos vacíos y lo sigue haciendo.
    if (vals.length === 1 && !vals[0].trim()) continue;
    const row = {};
    validIdx.forEach((k) => { row[headers[k]] = vals[k] !== undefined ? vals[k].trim() : ''; });
    rows.push(row);
  }
  return rows;
}

function buildCsvUrl(ids, gid = 0) {
  const bust = '&_cb=' + Math.floor(Date.now() / 60000);
  if (ids.type === 'pub') {
    const base = `https://docs.google.com/spreadsheets/d/e/${ids.pubId}/pub?output=csv`;
    return (gid === 0 ? base : base + '&gid=' + gid) + bust;
  }
  return `https://docs.google.com/spreadsheets/d/${ids.realId}/gviz/tq?tqx=out:csv&gid=${gid}${bust}`;
}

async function fetchCSV(url, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetchWithTimeout(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      let text = await r.text();
      if (/^<!DOCTYPE|^<html/i.test(text.trim())) {
        throw new Error('Documento no accesible. Compártelo como "Cualquier persona con el enlace" o publícalo (Archivo → Compartir → Publicar en la web).');
      }
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      return text;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((res) => setTimeout(res, 600 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Extrae las pestañas (gid + nombre) del HTML de una hoja de Google. Fuente principal:
 *  el bloque `items.push({name:"Hoja", pageUrl:"...gid=NNN"})` de /htmlview (nombre y gid
 *  autoritativos, disponible con permiso de lectura por enlace SIN publicar el documento).
 *  Respaldo: cualquier gid suelto del HTML. Puro y testeable. */
export function extractSheetTabs(html) {
  const found = new Map(); // gid -> title
  const nameRe = /items\.push\(\{name:\s*"([^"]+)"[\s\S]{1,200}?gid=(\d+)/g;
  let m;
  while ((m = nameRe.exec(html)) !== null) { const g = +m[2]; if (!found.has(g)) found.set(g, m[1]); }
  // Respaldo sin nombre: gids sueltos (≥4 dígitos para evitar falsos positivos).
  [/[?&#"'=]gid=(\d{4,})/g, /"gid"\s*:\s*"(\d+)"/g, /data-gid="(\d+)"/g].forEach((re) => {
    let mm; while ((mm = re.exec(html)) !== null) { const g = +mm[1]; if (g > 0 && !found.has(g)) found.set(g, ''); }
  });
  return [...found.entries()].map(([gid, title]) => ({ gid, title }));
}

// Caché persistente de las pestañas descubiertas (por documento). Permite recuperar todas
// las hojas aunque la enumeración falle puntualmente (p. ej. un 5xx transitorio de Google).
const GID_CACHE_KEY = 'larv4_sheet_tabs';
function cacheTabs(docId, list) {
  // `docId` sale de la URL del Sheet, que el usuario puede sobrescribir, y el patrón
  // [a-zA-Z0-9_-]+ admite literalmente "__proto__". Asignarlo sobre un objeto de
  // JSON.parse invoca el setter y le cambia el prototipo. Es el guard que util.js ya
  // define para este caso exacto; aquí faltaba.
  if (isUnsafeKey(docId)) return;
  try { const all = JSON.parse(localStorage.getItem(GID_CACHE_KEY) || '{}'); all[docId] = list; localStorage.setItem(GID_CACHE_KEY, JSON.stringify(all)); } catch (_) {}
}
/** Rellena con la caché los títulos de pestaña que el raspado no trajo. Puro y testeable.
 *  Sólo toca los vacíos: un título recién raspado SIEMPRE manda sobre el recordado (una
 *  pestaña renombrada tiene que poder cambiar de nombre). Un gid que ya no aparece en el
 *  raspado NO se resucita desde la caché: puede haberse borrado la hoja. */
export function fillTitlesFromCache(list, cached) {
  const previos = new Map((cached || []).map((t) => [Number(t && t.gid), t && t.title]));
  return (list || []).map(({ gid, title }) => ({ gid, title: title || previos.get(Number(gid)) || '' }));
}

function cachedTabs(docId) {
  try { const all = JSON.parse(localStorage.getItem(GID_CACHE_KEY) || '{}'); return Array.isArray(all[docId]) ? all[docId] : []; } catch (_) { return []; }
}

// Ejecuta `fn` sobre `items` con concurrencia acotada (acelera el fallback CSV de N hojas
// sin saturar/limitar la API de Google). Conserva el orden en el array de resultados.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Descubre las pestañas (gid + nombre) de un documento accesible por enlace, SIN depender
 *  de que esté "publicado en la web": raspa /htmlview (funciona con lectura por enlace),
 *  con /pub como respaldo, y cachea el resultado. Si la enumeración falla, usa la caché. */
export async function discoverGids(ids) {
  let realId = ids.type === 'real' ? ids.realId : null;
  if (!realId && ids.type === 'pub') {
    try {
      const r = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/e/${ids.pubId}/pub`, { cache: 'no-store' });
      const mm = (await r.text()).match(/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
      if (mm) realId = mm[1];
    } catch (_) {}
  }
  const docId = realId || ids.pubId || '';
  const merge = new Map();
  const scrape = async (url) => {
    try {
      const r = await fetchWithTimeout(url, { cache: 'no-store' });
      if (!r.ok) return;
      extractSheetTabs(await r.text()).forEach((t) => { if (!merge.has(t.gid) || (!merge.get(t.gid) && t.title)) merge.set(t.gid, t.title); });
    } catch (_) {}
  };
  if (realId) await scrape(`https://docs.google.com/spreadsheets/d/${realId}/htmlview`);
  if (!merge.size) {
    const pubUrl = ids.type === 'pub'
      ? `https://docs.google.com/spreadsheets/d/e/${ids.pubId}/pub`
      : (realId ? `https://docs.google.com/spreadsheets/d/${realId}/pub` : null);
    if (pubUrl) await scrape(pubUrl);
  }
  // ⚠ Un gid puede llegar SIN nombre: `extractSheetTabs` tiene un respaldo que recoge
  // gids sueltos del HTML sin título. Antes esos caían directos a `detectSheetName`, que
  // los adivina POR COLUMNAS — y adivina mal casi siempre: medido el 2026-08-31 sobre las
  // cabeceras reales, las once hojas «Datos Larvicultura» salían como 'Morfologia', y
  // `isLarviculturaRow` (core/fields.js:143) compara la cadena EXACTA, así que toda la
  // producción de Larvicultura habría desaparecido del tablero sin un solo error.
  // El sistema YA sabe cómo se llama esa pestaña —la cacheó en una carga anterior— y no
  // se lo estaba preguntando. Un nombre real recordado gana a cualquier adivinanza.
  const list = fillTitlesFromCache(
    [...merge.entries()].map(([gid, title]) => ({ gid, title })),
    docId ? cachedTabs(docId) : [],
  );
  // Al guardar se escribe la lista YA rellenada, no la cruda: antes un raspado incompleto
  // (30 pestañas con nombre y 3 sin él) machacaba en la caché los nombres buenos de esas 3
  // con cadenas vacías, y a partir de ahí ni la caché podía rescatarlas. La caché se
  // degradaba sola, y el único síntoma habría sido el tablero vacío.
  if (list.length) { if (docId) cacheTabs(docId, list); return list; }
  return docId ? cachedTabs(docId) : [];
}

async function fetchViaCsv(ids) {
  const sheets = {};
  const discovered = await discoverGids(ids);
  // Con pestañas descubiertas (o cacheadas) se bajan TODAS por gid; sin ninguna, último
  // recurso: la 1ª hoja (gid 0) para no dejar el sistema completamente vacío.
  const targets = discovered.length ? discovered : [{ gid: 0, title: '' }];
  const results = await mapLimit(targets, 6, async ({ gid, title }) => {
    try {
      const rows = parseCSV(await fetchCSV(buildCsvUrl(ids, gid), 1));
      if (!rows.length) return null;
      return { name: title || detectSheetName(rows, gid), rows };
    } catch (_) { return null; }
  });
  results.forEach((res) => { if (res && !sheets[res.name]) sheets[res.name] = stampRows(res.rows, res.name); });
  return sheets;
}

// ---------- pipeline público ----------
/** Aplica un set de hojas { name: rows } al store: aplana las filas, limpia la caché
 *  de fechas, fija globalData/sheetNames/latestDateMs y deriva Mortalidad. NO emite
 *  eventos ni toca el estado de conexión/fingerprint: eso lo decide cada caller
 *  (carga inicial vs auto-refresco). No muta el store si el set viene vacío.
 *  Devuelve el nº de filas aplicadas (0 = nada que aplicar). */
export function applySheets(sheets) {
  const rows = [];
  for (const name in sheets) rows.push(...sheets[name]);
  if (!rows.length) return 0;

  clearDateCache();
  store.globalData = rows;
  store.sheetNames = Object.keys(sheets);

  let latest = 0;
  rows.forEach((row) => {
    // La hoja "Marea" trae PREDICCIONES futuras (INOCAR): no deben estirar el rango de
    // fecha global (presets 7/30 días, "última fecha") del resto de vistas operativas.
    if (row._SheetOrigin === 'Marea') return;
    const d = parseAnyDate(getField(row, F.fecha));
    if (d && !isNaN(d) && d.getTime() > latest) latest = d.getTime();
  });
  store.latestDateMs = latest;

  try { autoCalcMortalidad(rows); } catch (_) {}
  return rows.length;
}

function commit(sheets, firstLoad) {
  // No pisar un set bueno con uno degradado (p.ej. reconexión manual que cae al
  // fallback CSV y sólo trae 1 hoja). En la primera carga no hay con qué comparar.
  if (!firstLoad && isDegraded(sheets)) return false;

  // applySheets no muta el store si viene vacío → un set vacío conserva los datos
  // previos y aquí se reporta como error (la reconexión manual no pierde lo cargado).
  if (!applySheets(sheets)) throw new Error('Sin datos en las hojas.');

  // Cachea la huella del set recién comprometido para sembrar el auto-refresco SIN
  // re-descargar el workbook completo en el arranque (antes boot() hacía una 2ª
  // descarga íntegra sólo para calcular el fingerprint inicial).
  _lastFingerprint = dataFingerprint(sheets);

  store.connected = true;
  emit(EV.DATA, { firstLoad });
  return true;
}

// Huella del último set comprometido (por commit() o por el auto-refresco).
// ÚNICA fuente de verdad del fingerprint: si refresh.js llevara su propia copia,
// una reconexión manual la dejaría desfasada y el siguiente tick re-renderizaría
// toda la vista sin que hubiera cambios reales.
let _lastFingerprint = '';
export function getLastFingerprint() { return _lastFingerprint; }
export function setLastFingerprint(fp) { _lastFingerprint = fp; }

/** Hash rodante barato (djb2) sobre las claves y los valores de todas las filas.
 *
 *  Recorre los caracteres directamente en vez de construir un JSON intermedio por fila:
 *  esto corre en CADA ciclo de auto-refresco (REFRESH_INTERVAL_S) sobre el store entero
 *  y bloquea el hilo principal mientras dura. Medido con filas de 27 columnas, mediana
 *  de 15 pasadas con el JIT caliente: 16.000 filas 79 → 49 ms y 30.000 filas 166 → 93 ms
 *  (~1,7×), además de evitar los ~12 MB de strings temporales que serializar generaba.
 *
 *  El separador 0x01 tras cada clave y cada valor es lo que impide que ('a','bc') y
 *  ('ab','c') colisionen, distinción que el JSON daba gratis con sus comillas. */
function hashRows(rows) {
  let h = 5381;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const keys = Object.keys(row);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      for (let j = 0; j < key.length; j++) h = ((h << 5) + h + key.charCodeAt(j)) | 0;
      h = ((h << 5) + h + 1) | 0;
      const s = String(row[key]);
      for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
      h = ((h << 5) + h + 1) | 0;
    }
  }
  return h >>> 0;
}

/** Huella de datos para detectar cambios sin re-render innecesario.
 *  Antes muestreaba solo 3 filas (primera/última/media) y se perdía cambios en
 *  filas intermedias; ahora hashea TODAS las filas (fix D3). Corre 1×/refresco. */
export function dataFingerprint(sheets) {
  let fp = '';
  for (const name in sheets) {
    const rows = sheets[name];
    if (!rows?.length) continue;
    fp += `${name}:${rows.length}:${hashRows(rows)};`;
  }
  return fp;
}

/** Descarga las hojas (XLSX-first, CSV fallback) y devuelve { name: rows }. */
export async function fetchAllSheets() {
  const ids = parseSheetsIds(activeUrl());
  if (!ids) throw new Error('URL de Google Sheets inválida.');
  // XLSX-first CON REINTENTOS. El XLSX trae TODAS las hojas en una sola petición; una caída
  // TRANSITORIA (timeout/red/5xx) NO debe degradar a la primera, así que reintentamos con
  // backoff. El fallback CSV es ROBUSTO: enumera TODAS las hojas por /htmlview (no requiere
  // publicar el documento) y las baja por gviz hoja a hoja.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const wb = await fetchWorkbook(ids);
      if (wb) return workbookToSheets(wb);
      break; // wb nulo (sin hojas) no es transitorio: pasa directo al CSV
    } catch (e) {
      // 401/403: el endpoint de exportación exige autenticación (documento compartido sólo
      // por enlace, no público para /export). Reintentar es inútil → pasa YA al fallback CSV.
      if (/\b(401|403)\b/.test(String((e && e.message) || ''))) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
    }
  }
  return fetchViaCsv(ids);
}

/** ¿La descarga recién obtenida trae MENOS hojas que el set bueno ya cargado?
 *  Señal de un resultado degradado (típicamente el fallback CSV que sólo logró
 *  bajar la 1ª hoja). Evita pisar datos buenos con un parcial transitorio: el
 *  auto-refresco recupera el set completo en el siguiente ciclo, sin que el
 *  usuario tenga que refrescar a mano. Sólo aplica si YA estábamos conectados
 *  (en la primera carga no hay set previo con el que comparar). */
export function isDegraded(sheets) {
  const incoming = Object.keys(sheets || {}).length;
  return store.connected && incoming > 0 && incoming < store.sheetNames.length;
}

/** Conexión inicial: descarga + commit + emisión de estado. */
export async function connectSheets() {
  emit(EV.CONN, { state: 'connecting', label: 'Descargando datos…' });
  try {
    const firstLoad = !store.connected;
    const sheets = await fetchAllSheets();
    commit(sheets, firstLoad);
    const n = store.sheetNames.length;
    const ts = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    // Señal de carga DEGRADADA: si tras conectar solo hay 1 hoja, casi siempre es
    // que el camino XLSX (todas las hojas) falló y se cayó al fallback CSV, que sin
    // el documento "publicado en la web" solo recupera la 1ª pestaña → la mayoría de
    // vistas quedan sin datos. Se marca `warn` para que la shell avise al usuario.
    emit(EV.CONN, { state: 'connected', label: `${n} hoja${n > 1 ? 's' : ''} · ${ts}`, warn: n <= 1 });
    return true;
  } catch (err) {
    const msg = err?.name === 'AbortError'
      ? `Timeout (${FETCH_TIMEOUT_MS / 1000}s) — reintentar`
      : (err?.message || 'Error desconocido');
    emit(EV.CONN, { state: 'error', label: msg.length > 60 ? msg.slice(0, 57) + '…' : msg });
    return false;
  }
}
