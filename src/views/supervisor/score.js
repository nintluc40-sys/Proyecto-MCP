/* ============================================================
   SUPERVISOR · 🎯 Score de calidad de postlarvas (planilla «CONTROL DE CALIDAD POST - LARVAS - 12C»)

   Lo captura el As. Técnico en Registros (pestaña 🎯 Score) y el GAS lo escribe en la hoja «Registro_Score», una fila
   por tanque evaluado. Aquí se lee para la sub-vista 🚛 Despacho del Resumen operativo (punto 4 del usuario,
   2026-10-03): la última evaluación de cada tanque del módulo —y de la corrida, si se eligió—, y su promedio.
   Funciones PURAS: reciben las filas del store y no tocan el DOM.
   ============================================================ */
import { getField, parseNum } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';
import { natCmp } from '../../core/util.js';

export const SCORE_ORIGIN = 'Registro_Score';

/* La tabla de interpretación de la planilla: 100–95, 85–94, 70–84 y < 70. ⚠ Es la MISMA que `SCORE_INTERP` de
   public/registros/engine.js, que es quien la escribe en la hoja; la vigila score.test.js leyendo el motor. */
export const SCORE_INTERP = [[95, 'Muy buena calidad'], [85, 'Buena calidad'], [70, 'Calidad mejorable'], [0, 'Calidad pobre']];
export const SCORE_COLOR = { 'Muy buena calidad': '#15803d', 'Buena calidad': '#0f766e', 'Calidad mejorable': '#b45309', 'Calidad pobre': '#b91c1c' };

/** La interpretación de un Score (o de un promedio); '' si no es un número. */
export function scoreInterp(total) {
  if (typeof total !== 'number' || !isFinite(total)) return '';
  for (const [min, txt] of SCORE_INTERP) if (total >= min) return txt;
  return SCORE_INTERP[SCORE_INTERP.length - 1][1];
}

const numDe = (s) => { const m = String(s == null ? '' : s).match(/\d+/); return m ? +m[0] : null; };
/** «M01» (Supervisor) con «M01» o «Módulo 1» (hoja) por su número; CIO por sus letras (como `sameModule` de module.js). */
function mismoModulo(a, b) {
  const na = numDe(a), nb = numDe(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a).replace(/[^a-z]/gi, '').toUpperCase() === String(b).replace(/[^a-z]/gi, '').toUpperCase();
}

/**
 * Las evaluaciones del módulo (y de la corrida, si se eligió): la ÚLTIMA de cada tanque en cada corrida, por fecha (a
 * igual fecha, la que va después en la hoja). Orden: corrida y tanque.
 * @returns {{corrida:string, tanque:number|null, fecha:Date|null, fechaRaw:string, score:number|null, interp:string,
 *   dias:number|null, plg:number|null, sobr:number|null, estres:number|null, camaronera:string, realizado:string}[]}
 */
export function scoreDelModulo(rows, mod, corrida) {
  const ultima = new Map();
  (rows || []).forEach((r, i) => {
    if (!r || r._SheetOrigin !== SCORE_ORIGIN || !mismoModulo(getField(r, ['Módulo', 'Modulo']), mod)) return;
    const cor = String(getField(r, ['Corrida'])).trim();
    if (corrida && cor !== String(corrida)) return;
    const tanque = numDe(getField(r, ['Tanque']));
    const fechaRaw = getField(r, ['Fecha']);
    const fecha = parseAnyDate(fechaRaw);
    const score = parseNum(r, ['Score']);
    const ev = {
      corrida: cor, tanque, fecha, fechaRaw, score,
      interp: getField(r, ['Interpretación', 'Interpretacion']) || scoreInterp(score),
      dias: parseNum(r, ['Días de cultivo']), plg: parseNum(r, ['PL/gramo']), sobr: parseNum(r, ['% Sobrevivencia']),
      estres: parseNum(r, ['Prueba de estrés (%)']), camaronera: getField(r, ['Camaronera']), realizado: getField(r, ['Realizado por']),
      orden: i,
    };
    const clave = cor + '|' + tanque;
    const prev = ultima.get(clave);
    const t = (e) => (e.fecha ? e.fecha.getTime() : -Infinity);
    if (!prev || t(ev) > t(prev) || (t(ev) === t(prev) && ev.orden > prev.orden)) ultima.set(clave, ev);
  });
  return [...ultima.values()]
    .sort((a, b) => natCmp(a.corrida, b.corrida) || ((a.tanque ?? Infinity) - (b.tanque ?? Infinity)))
    .map(({ orden, ...ev }) => ev);   // eslint-disable-line no-unused-vars
}

/** Promedio de los Score de esas evaluaciones (una por tanque), con su interpretación; null si ninguna lo tiene. */
export function scorePromedio(evals) {
  const xs = (evals || []).map((e) => e.score).filter((x) => typeof x === 'number' && isFinite(x));
  if (!xs.length) return null;
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { media, n: xs.length, interp: scoreInterp(media) };
}
