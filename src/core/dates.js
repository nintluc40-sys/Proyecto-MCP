/* ============================================================
   FECHAS — parseo robusto y formato es-EC
   Portado de _parseAnyDate del original (con caché).
   Soporta: serial Excel, dd/mm/yyyy, yyyy-mm-dd, y Date nativo.
   ============================================================ */

const _cache = new Map();

export function clearDateCache() { _cache.clear(); }

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
      const d = new Date(+p[2], +p[1] - 1, +p[0], 12, 0, 0);
      result = isNaN(d.getTime()) ? null : d;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      // 3) ISO yyyy-mm-dd
      const p = s.substring(0, 10).split('-');
      const d = new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
      result = isNaN(d.getTime()) ? null : d;
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

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fmtShort(d) {
  return d ? d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return MESES[+m - 1].replace(/^\w/, (c) => c.toUpperCase()) + ' ' + y;
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
