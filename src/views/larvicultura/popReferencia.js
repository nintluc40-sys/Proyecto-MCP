/* ============================================================
   LARVICULTURA · lo NORMAL de la planta para el semáforo de Población.
   2026-10-30 (usuario: «Ajustarlo por etapa»): el semáforo ya no usa
   20 % / 40 % fijos —sin fuente, y la pérdida crece con los días: el
   color decía cuánto había avanzado la corrida, no si iba mal (medido
   en el libro)—, sino la pérdida de las OTRAS corridas el MISMO día de
   cultivo. Funciones puras, testeables.
   ============================================================ */
import { getField, parseNum, F, isLarviculturaRow } from '../../core/fields.js';
import { parseAnyDate } from '../../core/dates.js';

/** Corridas·módulo que tienen que haber llegado a un día para que ese día sirva de referencia. */
export const REF_MIN_CORRIDAS = 10;
const DIA_MS = 86400000;

export const claveCorrida = (corrida, modulo) => `${corrida} · ${modulo}`;

/** La pérdida acumulada (%) de cada corrida·módulo por día de cultivo: { clave: { dia: % } }.
 *  Día 1 = la primera fecha de la corrida en el módulo (como el DOC de `cultivoInfo`). Cada día, con
 *  las lecturas hasta ese día y la regla de `popStats`: cada tanque aporta su primera lectura > 0 y
 *  su última lectura (un 0 al final es real: vaciado o agrupado). Sin ningún tanque con base, el día
 *  no tiene cifra. */
export function curvasDePerdida(rows) {
  const grupos = new Map();
  (rows || []).forEach((r) => {
    const cor = getField(r, F.corrida), mod = getField(r, F.modulo);
    const d = parseAnyDate(getField(r, F.fecha));
    if (!cor || !mod || !d) return;
    const k = claveCorrida(cor, mod);
    let g = grupos.get(k);
    if (!g) grupos.set(k, (g = { d0: d, d1: d, lect: [] }));
    if (d < g.d0) g.d0 = d;
    if (d > g.d1) g.d1 = d;
    const tq = getField(r, F.tanque), pob = parseNum(r, F.poblacion);
    if (tq && pob !== null && pob >= 0) g.lect.push({ tq, d, pob });
  });
  const out = {};
  grupos.forEach((g, k) => {
    const diaDe = (d) => Math.round((d - g.d0) / DIA_MS) + 1;
    const porTanque = {};
    // Orden por fecha y, en el mismo día, el de llegada (como `buildPopData`).
    g.lect.forEach((x, i) => { x.i = i; });
    g.lect.sort((a, b) => (a.d - b.d) || (a.i - b.i)).forEach((x) => { (porTanque[x.tq] ||= []).push({ dia: diaDe(x.d), pob: x.pob }); });
    // Cada tanque avanza día a día por sus lecturas: su base (la primera > 0) y la última hasta ese día.
    const tanques = Object.values(porTanque).map((arr) => ({ arr, i: 0, base: null, ult: null })), c = {};
    for (let dia = 1; dia <= diaDe(g.d1); dia++) {
      let ini = 0, cur = 0;
      tanques.forEach((t) => {
        while (t.i < t.arr.length && t.arr[t.i].dia <= dia) {
          const x = t.arr[t.i++];
          if (t.base === null && x.pob > 0) t.base = x.pob;
          t.ult = x.pob;
        }
        if (t.base === null) return;
        ini += t.base; cur += t.ult;
      });
      if (ini > 0) c[dia] = (ini - cur) / ini * 100;
    }
    out[k] = c;
  });
  return out;
}

/** Lo normal de la planta el día `dia`: las pérdidas de las OTRAS corridas·módulo ese día (sin
 *  `excluir`, la que se juzga) → { dia, n, p75, p90 } (p75: no la superan 3 de cada 4; p90: 9 de
 *  cada 10). Con menos de `min` corridas ese día, el último día anterior que sí las tiene (las
 *  corridas largas son pocas); sin ninguno, null. */
export function referenciaDelDia(curvas, excluir, dia, min = REF_MIN_CORRIDAS) {
  for (let k = Math.floor(dia); k >= 1; k--) {
    const v = [];
    Object.keys(curvas).forEach((g) => { if (g !== excluir && curvas[g][k] != null) v.push(curvas[g][k]); });
    if (v.length < min) continue;
    v.sort((a, b) => a - b);
    const q = (p) => v[Math.max(0, Math.ceil(p * v.length) - 1)];
    return { dia: k, n: v.length, p75: q(0.75), p90: q(0.9) };
  }
  return null;
}

// Las curvas de TODO el historial, una vez por carga (`store.globalData` se reemplaza entero al recargar).
const _curvas = new WeakMap();

/** La referencia de una corrida en su módulo, con TODO el historial de Larvicultura (no sólo el mes
 *  elegido): { diaCorrida, dia, n, p75, p90 }, o null si la corrida no tiene pérdida calculable o la
 *  planta no tiene historia suficiente. */
export function referenciaPoblacion(globalData, corrida, modulo) {
  if (!globalData || !corrida || !modulo) return null;
  let curvas = _curvas.get(globalData);
  if (!curvas) { curvas = curvasDePerdida(globalData.filter(isLarviculturaRow)); _curvas.set(globalData, curvas); }
  const k = claveCorrida(corrida, modulo), propia = curvas[k];
  const dias = propia ? Object.keys(propia).map(Number) : [];
  if (!dias.length) return null;
  const diaCorrida = Math.max(...dias);
  const ref = referenciaDelDia(curvas, k, diaCorrida);
  return ref ? { diaCorrida, ...ref } : null;
}
