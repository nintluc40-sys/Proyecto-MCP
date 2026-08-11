/* ============================================================
   FECHAS — parseo robusto y formato es-EC
   Portado de _parseAnyDate del original (con caché).
   Soporta: serial Excel, dd/mm/yyyy, yyyy-mm-dd, y Date nativo.
   ============================================================ */

const _cache = new Map();

export function clearDateCache() { _cache.clear(); }

/** Construye una fecha local al mediodía COMPROBANDO que el calendario la admita.
 *  `new Date(y, m-1, d)` DESBORDA los valores fuera de rango en vez de fallar: '32/01/2026'
 *  se convierte en el 1 de febrero, '31/02/2026' en el 3 de marzo, '00/01/2026' en el 31 de
 *  diciembre ANTERIOR y '15/13/2026' en enero del año siguiente. Como el resultado es un
 *  Date perfectamente válido, `isNaN` nunca lo detectaba y una fecha mal tecleada entraba
 *  como buena: en Maduración un desove con día 32 se contabilizaba en FEBRERO y el aviso de
 *  "fechas futuras" no saltaba, porque la fecha desbordada no queda en el futuro (medido).
 *  Se compara lo construido con lo pedido; si no coincide, la fecha es imposible → null. */
function strictYMD(y, m, d) {
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) ? dt : null;
}

export function parseAnyDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (_cache.has(s)) return _cache.get(s);

  let result = null;
  try {
    // 1) Serial de Excel (días desde 1899-12-30, ventana razonable)
    const asNum = Number(s);
    if (!isNaN(asNum) && asNum > 25569 && asNum < 60000) {
      const totalDays = asNum - 25569;
      let y = 1970, rem = totalDays;
      const leap = (yy) => yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0);
      while (true) { const diy = leap(y) ? 366 : 365; if (rem < diy) break; rem -= diy; y++; }
      const md = [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let mo = 0; while (mo < 11 && rem >= md[mo]) { rem -= md[mo]; mo++; }
      const d = new Date(y, mo, Math.floor(rem) + 1, 12, 0, 0);
      result = isNaN(d.getTime()) ? null : d;
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      // 2) dd/mm/yyyy
      const p = s.split('/');
      result = strictYMD(+p[2], +p[1], +p[0]);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      // 3) ISO yyyy-mm-dd
      const p = s.substring(0, 10).split('-');
      result = strictYMD(+p[0], +p[1], +p[2]);
    } else {
      // 4) Fallback nativo
      const d = new Date(s);
      if (d && !isNaN(d.getTime())) {
        if (d.getHours() === 0) d.setHours(12);
        result = d;
      }
    }
  } catch (_) { result = null; }

  _cache.set(s, result);
  return result;
}

export function fmtShort(d) {
  return d ? d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
}

export function yearMonthKey(d) {
  if (!d || isNaN(d)) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

const MESES_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Día del mes (para ejes con muchas fechas: muestra sólo el número). */
export function dayNum(raw) {
  const d = parseAnyDate(raw);
  if (d) return String(d.getDate());
  const m = String(raw).match(/^(\d{1,2})/);
  return m ? m[1] : String(raw).slice(0, 2);
}

/** Frase de rango mes-año: "mayo 2026" o "mayo 2026 – junio 2026". */
export function rangeLabel(list) {
  if (!list || !list.length) return '';
  const at = (x) => parseAnyDate(x && x.fecha !== undefined ? x.fecha : x);
  const f = at(list[0]), l = at(list[list.length - 1]);
  const lab = (d) => (d ? `${MESES_FULL[d.getMonth()]} ${d.getFullYear()}` : '');
  if (f && l && f.getMonth() === l.getMonth() && f.getFullYear() === l.getFullYear()) return lab(f);
  const a = lab(f), b = lab(l);
  return a && b ? `${a} – ${b}` : (a || b);
}

export function isToday(raw) {
  const d = parseAnyDate(raw);
  if (!d) return false;
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
