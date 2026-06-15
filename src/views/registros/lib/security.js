/* ============================================================
   REGISTROS · utilidades de seguridad (extraídas de engine.js)
   Primer módulo "estrangulado" del monolito public/registros/engine.js.
   Funciones PURAS (sin DOM ni estado) de encoding/validación/sanitización.
   engine.js delega en estas vía el puente window.__rgLib (ver index.js).
   Ref. plan: docs/analisis/04-refactor-plan.md (Fase C).
   ============================================================ */

/** Rellena a 2 dígitos: 3 → "03". */
export function pad(n) {
  return String(n).padStart(2, '0');
}

/** Output encoding: escapa entidades HTML para prevenir XSS.
 *  Usar en TODO valor controlado por el usuario insertado en innerHTML. */
export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Input sanitization: recorta a 200 chars y elimina los caracteres de
 *  inyección de fórmula iniciales (= + - @) que llegarían a Google Sheets. */
export function sanitizeStr(s) {
  if (s === null || s === undefined) return '';
  let str = String(s).trim().slice(0, 200);
  while (str.length > 0 && '=+-@'.indexOf(str.charAt(0)) !== -1) {
    str = str.slice(1);
  }
  return str;
}

/** Sanitización numérica: parsea, acota al rango y rechaza NaN/Infinity
 *  devolviendo "" (cadena vacía) cuando el valor no es finito. */
export function sanitizeNum(v, min = -1e9, max = 1e9) {
  const n = parseFloat(v);
  if (!isFinite(n)) return '';
  return Math.min(max, Math.max(min, n));
}

/** Valida formato de fecha YYYY-MM-DD (con rangos de mes/día válidos). */
export function isValidDate(s) {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
}

/** Valida la URL del GAS: HTTPS y host EXACTAMENTE script.google.com
 *  (o un subdominio real ".script.google.com"; no "evilscript.google.com"). */
export function isValidGasUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'script.google.com' || u.hostname.endsWith('.script.google.com'))
    );
  } catch (_e) {
    return false;
  }
}
