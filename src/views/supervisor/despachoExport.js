/* ============================================================
   SUPERVISOR · Despacho — descarga del registro en Excel
   Se abre desde el KPI "🚛 Nº despachos" de la vista Despacho.

   ALCANCE: un MES DE PRODUCCIÓN, no un mes de calendario. En este sistema el mes
   es un rango contiguo de CORRIDAS (`MESES_PROD` de core/prodCalendar.js), que es
   el mismo mes que navega la Vista Ejecutiva. Se eligió así a propósito: la vista
   Despacho se acota por corrida y oculta la barra de fecha global porque «un
   registro de despacho es un hecho de la corrida y recortarlo por fecha lo
   escondería». Filtrar por el mes del calendario partiría una corrida en dos.

   Como un mes agrupa varias corridas, la exportación NO puede leer `ctx.larvCM`
   (viene recortado a la corrida activa): usa `ctx.larvAll`, el universo completo.

   Se agrupa por (módulo, corrida, tanque). La corrida entra en la clave porque un
   módulo puede repetirse en dos corridas del mismo mes: sin ella se mezclarían las
   poblaciones de dos ciclos distintos del mismo tanque en una sola cifra.

   Las columnas se leen con `DESPACHO_KEYS` de core/fields.js — las MISMAS que la
   tabla en pantalla, para que el archivo no pueda contradecir a la vista.
   ============================================================ */
import { getField, parseNum, F, DESPACHO_KEYS as DKEY } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { natCmp } from '../../core/util.js';
import { isDespachoRow, monthIndexOfCorrida, monthLabelAt } from '../../core/prodCalendar.js';
import { esc } from '../../core/format.js';

/** Cabecera del Excel. «Módulo» y «Corrida» encabezan porque la descarga puede abarcar
 *  varios de ambos: sin ellas una fila del archivo no sería identificable. */
export const DESPACHO_XLSX_HEADERS = [
  'Módulo', 'Corrida', 'Fecha', 'Tanque', 'Densidad Cosechada', 'Biomasa',
  'Plg (manual)', 'Destino', 'Cantidad Cosechada', 'Piscina',
];

// Mismos criterios que la vista, para que ambas digan lo mismo.
const gMod = (r) => getField(r, F.modulo);
const gCor = (r) => getField(r, F.corrida);
const gTnq = (r) => getField(r, F.tanque);
const gFec = (r) => getField(r, F.fecha);
// Honra el 0 (tanque vaciado o agrupado) y descarta negativos imposibles: idéntico al
// `gPop` de stats.js, del que depende que «Cantidad Cosechada» case con la pantalla.
const gPop = (r) => { const v = parseNum(r, F.poblacion); return v !== null && v >= 0 ? v : null; };

const byDate = (arr) => [...arr].sort((a, b) => (parseAnyDate(gFec(a)) || new Date(0)) - (parseAnyDate(gFec(b)) || new Date(0)));
const distinct = (a) => [...new Set(a.filter(Boolean))];
/** Celda de texto: vacío → '' (el Excel deja el hueco en blanco, no un guion tipográfico). */
const txt = (r, keys) => { const v = getField(r, keys); return v === '' ? '' : v; };
/** Celda numérica: número si se puede, y si no el texto crudo (no inventa ceros). */
const num = (r, keys) => { const v = parseNum(r, keys); return v === null ? txt(r, keys) : v; };

/** Índice del mes de producción al que pertenece una corrida ('579' → 6). */
export const monthOfCorrida = (cor) => monthIndexOfCorrida(+cor);

/** Meses de producción presentes en un conjunto de filas, de viejo a reciente.
 *  No usa `presentMonths()` de prodCalendar porque ése barre el store global y aquí
 *  interesa exactamente el universo que recibe la vista. */
export function monthsInRows(rows) {
  const set = new Set();
  (rows || []).forEach((r) => { const i = monthOfCorrida(gCor(r)); if (i >= 0) set.add(i); });
  return [...set].sort((a, b) => a - b);
}

/** Módulos presentes en un mes, en orden natural. */
export function modulesInMonth(rows, mIdx) {
  return distinct((rows || []).filter((r) => monthOfCorrida(gCor(r)) === mIdx).map(gMod)).sort(natCmp);
}

/**
 * Matriz (AoA) del Excel de despacho.
 * @param {Array}  rows   universo de filas de Larvicultura (`ctx.larvAll`)
 * @param {object} opts
 * @param {number} opts.mIdx  índice del mes de producción
 * @param {string} [opts.mod] módulo; `null`/ausente → TODOS los del mes
 * @returns {Array[]} cabecera + una fila por registro de despacho (y una por tanque
 *   sin despachar, para que se vea qué falta), o sólo la cabecera si no hay nada.
 */
export function despachoExportAoa(rows, { mIdx, mod = null } = {}) {
  const aoa = [DESPACHO_XLSX_HEADERS.slice()];
  const universo = (rows || []).filter((r) => monthOfCorrida(gCor(r)) === mIdx && (!mod || gMod(r) === mod));
  if (!universo.length) return aoa;

  const mods = distinct(universo.map(gMod)).sort(natCmp);
  mods.forEach((m) => {
    const delMod = universo.filter((r) => gMod(r) === m);
    // Corridas del módulo dentro del mes, ascendente (numérico: '580' va tras '579').
    const corridas = distinct(delMod.map(gCor)).sort((a, b) => (+a) - (+b));
    corridas.forEach((cor) => {
      const delCor = delMod.filter((r) => gCor(r) === cor);
      const tanks = distinct(delCor.map(gTnq)).sort(natCmp);
      tanks.forEach((tq) => {
        const tRows = byDate(delCor.filter((r) => gTnq(r) === tq));
        // Cantidad cosechada = última población registrada del tanque (honra el 0),
        // el mismo criterio que la tabla y que `modCorStats`.
        let cosechada = null;
        for (let i = tRows.length - 1; i >= 0; i--) { const p = gPop(tRows[i]); if (p !== null) { cosechada = p; break; } }
        const disp = tRows.filter(isDespachoRow);
        if (!disp.length) {
          // Tanque sin despachar: se lista para que el archivo muestre lo que falta.
          aoa.push([m, cor, '', tq, '', '', '', '', cosechada === null ? '' : cosechada, '']);
          return;
        }
        disp.forEach((r, i) => aoa.push([
          m, cor, txt(r, F.fecha), tq,
          num(r, DKEY.densidad), num(r, DKEY.biomasa), num(r, DKEY.plgM),
          txt(r, DKEY.destino),
          // «Cantidad Cosechada» es del TANQUE, no del despacho: va sólo en su primera
          // fila. Repetirla en cada despacho dejaba la columna sin poder sumarse (un
          // tanque con 3 despachos triplicaba su cosecha en el total del Excel).
          i === 0 ? (cosechada === null ? '' : cosechada) : '',
          txt(r, DKEY.piscina),
        ]));
      });
    });
  });
  return aoa;
}

/** Nº de filas de datos que produciría la descarga (sin contar la cabecera). */
export const despachoExportCount = (rows, opts) => Math.max(0, despachoExportAoa(rows, opts).length - 1);

/** Nombre de archivo: sin espacios ni acentos, para que ningún sistema lo altere.
 *  `NFD` separa la tilde de su letra base y el filtro no-ASCII se la lleva, así
 *  «Módulo 7» → «Modulo_7» (y no «M_dulo_7», que es lo que daría descartar el
 *  carácter acentuado entero). Se filtra por el rango ASCII IMPRIMIBLE (\x20-\x7E)
 *  y no por el de diacríticos combinantes a propósito: ese rango sólo se puede
 *  escribir con caracteres INVISIBLES en el editor, que cualquier recodificación
 *  corrompe sin dejar rastro. Empezar el rango en \x20 y no en \x00 mantiene los
 *  caracteres de control fuera de la clase (regla `no-control-regex`). */
const slug = (s, fallback) => String(s || fallback)
  .normalize('NFD').replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || fallback;

export function despachoFileName(mIdx, mod) {
  return `Despacho_${slug(monthLabelAt(mIdx), 'Mes' + mIdx)}_${mod ? slug(mod, 'Modulo') : 'TODOS'}.xlsx`;
}

/* ──────────────────────────────────────────────────────────────
   Modal de descarga. Vive aquí (y no en despacho.js) para que la vista se limite a
   pedirlo: así el filtro, la matriz y el nombre del archivo quedan en un solo módulo,
   testeable sin DOM.
   ────────────────────────────────────────────────────────────── */

/** HTML del modal. `mIdx` marca el mes preseleccionado; el selector de módulos lo rellena
 *  `bindDespachoExport` (depende del mes elegido, así que no se puede fijar aquí). */
export function despachoExportModalHTML(rows, { mIdx }) {
  const meses = monthsInRows(rows);
  const optMes = meses.map((i) => `<option value="${i}"${i === mIdx ? ' selected' : ''}>${esc(String(monthLabelAt(i) || 'Mes ' + i))}</option>`).join('');
  return `<div class="sv-modal" id="svDespExportModal">
    <div class="sv-modal-card">
      <div class="sv-modal-head">
        <span class="sv-modal-title">🚛 Descargar registro de despacho</span>
        <button class="sv-modal-x" data-despx-close aria-label="Cerrar">✕</button>
      </div>
      <div class="sv-modal-body">
        <p class="sv-modal-note" style="margin:0 0 10px">Genera un Excel con los registros de despacho del <b>mes de producción</b> (el mes agrupa corridas, igual que en la Vista Ejecutiva). Los tanques aún sin despachar se listan sin datos, para que se vea lo que falta.</p>
        <div class="sv-trace-sec sv-trace-dates">
          <label class="sv-modal-datelbl">🗓️ Mes
            <select class="sv-modal-select" data-despx-month>${optMes || '<option value="-1">Sin datos</option>'}</select>
          </label>
          <label class="sv-modal-datelbl">🏭 Módulo
            <select class="sv-modal-select" data-despx-mod></select>
          </label>
        </div>
        <div class="sv-modal-note" data-despx-info style="margin:10px 0 0"></div>
        <div class="sv-trace-actions">
          <button class="sv-action-btn" data-despx-download>📊 Descargar Excel</button>
        </div>
      </div>
    </div>
  </div>`;
}

/** Rellena el selector de módulos con los del mes elegido (+ «Todos»), conservando
 *  la selección previa si ese módulo sigue existiendo en el mes nuevo. */
function fillModules(overlay, rows, mIdx, preferido) {
  const sel = overlay.querySelector('[data-despx-mod]');
  if (!sel) return;
  const previo = preferido !== undefined ? preferido : sel.value;
  const mods = modulesInMonth(rows, mIdx);
  sel.innerHTML = `<option value="">Todos los módulos (${mods.length})</option>`
    + mods.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  // No basta con asignar `previo`: si ese módulo no está en el mes nuevo, el <select>
  // deja selectedIndex en -1 y se PINTA VACÍO (aunque `.value` devuelva ''). Al forzar ''
  // se elige de verdad la opción "Todos los módulos".
  sel.value = previo && mods.includes(previo) ? previo : '';
}

/**
 * Conecta el modal: apertura desde el KPI, selects en cascada y descarga.
 * No recibe `mIdx`: el mes preseleccionado ya viaja en el <select> que montó
 * `despachoExportModalHTML`, y `onOpen` lo lee de ahí — así no hay dos fuentes
 * del mes activo que puedan discrepar.
 * @param {Element}  root     contenedor de la vista (donde vive el KPI)
 * @param {Array}    rows     universo de filas (`ctx.larvAll`)
 * @param {object}   opts     { mod, bindModal, toast }
 */
export function bindDespachoExport(root, rows, { mod, bindModal, toast }) {
  const overlay = root.querySelector('#svDespExportModal');
  if (!overlay) return null;

  const mesEl = () => overlay.querySelector('[data-despx-month]');
  const modEl = () => overlay.querySelector('[data-despx-mod]');
  const sel = () => ({ mIdx: +(mesEl()?.value ?? -1), mod: modEl()?.value || null });

  const refresh = () => {
    const { mIdx: mi, mod: mo } = sel();
    const n = mi < 0 ? 0 : despachoExportCount(rows, { mIdx: mi, mod: mo });
    const info = overlay.querySelector('[data-despx-info]');
    if (info) {
      info.textContent = n
        ? `Se exportarán ${n} fila(s): ${mo || 'todos los módulos'} · ${monthLabelAt(mi) || 'mes ' + mi}.`
        : 'Sin registros para esta combinación.';
    }
    const btn = overlay.querySelector('[data-despx-download]');
    if (btn) btn.disabled = !n;
  };

  const ctrl = bindModal(root, overlay, {
    openSel: '[data-despx-open]', closeSel: '[data-despx-close]', keyboard: true,
    // Se reconstruye al ABRIR (no sólo al montar): tras un refresco de datos el mes
    // activo puede haber ganado módulos, y el modal se monta una única vez.
    onOpen: () => { fillModules(overlay, rows, sel().mIdx, mod); refresh(); },
  });

  mesEl()?.addEventListener('change', () => { fillModules(overlay, rows, sel().mIdx); refresh(); });
  modEl()?.addEventListener('change', refresh);

  overlay.querySelector('[data-despx-download]')?.addEventListener('click', () => {
    const XLSX = window.XLSX;
    if (!XLSX) { toast('Exportación no disponible: SheetJS (XLSX) no se cargó. Revisa el <script> del CDN en index.html o tu conexión.', 'err'); return; }
    const { mIdx: mi, mod: mo } = sel();
    if (mi < 0) { toast('Elige un mes con datos.', 'warn'); return; }
    const aoa = despachoExportAoa(rows, { mIdx: mi, mod: mo });
    if (aoa.length <= 1) { toast('Sin registros de despacho para esa combinación.', 'warn'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Despacho');
    XLSX.writeFile(wb, despachoFileName(mi, mo));
    toast(`📊 Excel descargado: ${aoa.length - 1} fila(s).`, 'ok', 4000);
    ctrl?.close();
  });

  // ⚠ NO se calcula nada al montar, a propósito. `refresh()` construye la matriz completa
  // para saber cuántas filas anunciar, y medido sobre un universo realista (14.400 filas,
  // un mes de 6 corridas × 10 módulos × 24 tanques) eso cuesta ~59 ms. Hacerlo aquí se lo
  // sumaba a CADA render de la vista Despacho —incluidos los del auto-refresco— para
  // rellenar un modal que está OCULTO. `onOpen` lo hace al abrir, que además es el momento
  // correcto: así el recuento refleja los datos del refresco más reciente.
  return ctrl;
}
