/* ============================================================
   SUPERVISOR · Toneladas por tanque (Producción Omarsa)
   Volumen de agua (t/m³) por tanque, configurable por
   MES → CORRIDA → MÓDULO → TANQUE. Sustituye al 28 fijo con el que se
   estimaba la "Dens. siembra". Reglas (decisión del usuario 2026-08-04):
     · Tanques mostrados = los REALES con siembra ese mes (sieByTank).
     · Clave = mes(mIdx) → corrida → módulo → tanque.
     · Mes sin dato explícito HEREDA del mes anterior configurado (mismo
       módulo+tanque, cualquier corrida: el tonelaje es físico del tanque).
     · Por defecto 28 t.
   Local-only: vive en localStorage del dashboard (como el tema); NO se
   sincroniza a Google Sheets — es un ajuste de visualización.

   Densidad de siembra (ponderada por volumen real):
     Dens. siembra = Σ siembra_tanque / Σ toneladas_tanque / 1000
   Con todos los tanques en 28 equivale EXACTAMENTE a la fórmula previa
   (Σsiembra/nSie)/28/1000 → retrocompatible (nada cambia hasta configurar).

   La lógica de resolución/cálculo es PURA (recibe el objeto `all`); los
   wrappers loadAll/saveAll son la única frontera con localStorage.
   ============================================================ */

const LS_KEY = 'sv_prodton_v1';
export const TON_DEFAULT = 28; // toneladas (m³) de agua por tanque, por defecto

const isPos = (v) => v != null && isFinite(+v) && +v > 0;

/** Lee toda la configuración: { "<mIdx>": { corrida: { modulo: { tanque: ton } } } }. */
export function loadAll() {
  try { const o = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
  catch (_) { return {}; }
}

/** Persiste toda la configuración. Silencioso si localStorage no está disponible. */
export function saveAll(all) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(all || {})); } catch (_) { /* storage no disponible */ }
}

/** Toneladas resueltas de un tanque (PURA): valor explícito del mes → heredado del
 *  mes anterior configurado (módulo+tanque, cualquier corrida) → 28. */
export function resolveTon(all, mIdx, corrida, mod, tank) {
  const explicit = all?.[String(mIdx)]?.[corrida]?.[mod]?.[tank];
  if (isPos(explicit)) return +explicit;
  for (let m = mIdx - 1; m >= 0; m--) {
    const byCor = all?.[String(m)];
    if (!byCor) continue;
    for (const cor of Object.keys(byCor)) {
      const v = byCor[cor]?.[mod]?.[tank];
      if (isPos(v)) return +v;
    }
  }
  return TON_DEFAULT;
}

/** Densidad de siembra ponderada (PURA). `segs` = [{ corrida, mod, sieByTank }].
 *  sieByTank = { tanque: primera población real (>0) }. Devuelve null sin siembra. */
export function densSiembra(all, mIdx, segs) {
  let sumSie = 0, sumTon = 0;
  (segs || []).forEach(({ corrida, mod, sieByTank }) => {
    Object.keys(sieByTank || {}).forEach((tank) => {
      const sie = sieByTank[tank];
      if (!isPos(sie)) return;
      sumSie += +sie;
      sumTon += resolveTon(all, mIdx, corrida, mod, tank);
    });
  });
  return sumTon > 0 ? sumSie / sumTon / 1000 : null;
}

/** Fija la config de un mes (PURA sobre `all`, devuelve el mismo objeto mutado).
 *  Persiste TODO valor positivo del usuario (incluido 28) para que lo explícito
 *  gane siempre a la herencia; descarta vacíos/no-positivos. Mes sin valores → se
 *  elimina la entrada (vuelve a herencia/28). */
export function putMonth(all, mIdx, byCor) {
  const clean = {};
  Object.keys(byCor || {}).forEach((cor) => {
    Object.keys(byCor[cor] || {}).forEach((mod) => {
      Object.keys(byCor[cor][mod] || {}).forEach((tank) => {
        const v = +byCor[cor][mod][tank];
        if (isPos(v)) {
          clean[cor] = clean[cor] || {};
          clean[cor][mod] = clean[cor][mod] || {};
          clean[cor][mod][tank] = v;
        }
      });
    });
  });
  const next = all || {};
  if (Object.keys(clean).length) next[String(mIdx)] = clean; else delete next[String(mIdx)];
  return next;
}
