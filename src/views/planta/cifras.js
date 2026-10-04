/* ============================================================
   PLANTA · las CIFRAS DE GERENCIA (tanda 4, 2026-10-04) — producción del mes frente a la meta, supervivencia y
   nauplios. Módulo PURO: ni DOM ni red.

   Decisiones del usuario (2026-10-04) que viven aquí:
   · La producción del mes es el TOTAL de la tabla «Producción Omarsa» del Supervisor: la población actual de todas
     las corridas del mes de producción (`corridasOfMonth`), módulo a módulo con `modCorStats`, CIO INCLUIDO (como la
     tabla). Se separa en despachado (módulos con todos sus tanques despachados, `despachadoFull`, el criterio de la
     tabla) y en cultivo (el resto: lo que sigue en el agua, despachándose o no).
   · El mes es el de PRODUCCIÓN (por corridas): por defecto el último con datos, el mismo que abre la tabla; con el
     selector de la tarjeta (2026-10-04, usuario), cualquiera de los meses con datos (`presentMonths`, los de la tabla).
   · La supervivencia es la de la fila Total de la tabla: Σ población actual ÷ Σ siembra × 100, con tope de 100.
   · Los nauplios (N5) y los desoves son los de Visitante (`produccionDelMes` de visitante/maduracion.produccion.js):
     el mes de CALENDARIO que corresponde al de producción (`calendarRangeOfMonth`), recortado a hoy.
   · La meta es de 400 millones al mes y se edita en la vista (⚙), guardada en el equipo: aquí sólo su valor por
     defecto y su validación; guardarla es cosa de la vista.
   Nada se recalcula con otra fórmula: si la tabla del Supervisor o Visitante cambian su regla, esto la sigue.
   ============================================================ */
import { presentMonths, corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt, calendarRangeOfMonth } from '../../core/prodCalendar.js';
import { produccionDelMes } from '../visitante/maduracion.produccion.js';

/** Meta de producción por defecto: 400 millones de larvas al mes (usuario, 2026-10-04). */
export const META_POR_DEFECTO = 400e6;

/** Una meta válida es un número positivo; cualquier otra cosa (vacío, texto, 0, negativo) vuelve a la de por defecto. */
export function normalizarMeta(v) {
  const n = typeof v === 'number' ? v : (v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v));
  return Number.isFinite(n) && n > 0 ? n : META_POR_DEFECTO;
}

/**
 * Las cifras de un mes de producción: `mIdx` si es uno de los meses con datos; si no (o sin él), el último.
 * `filas`: todas las del store (los desoves salen de ahí). `hoy`: `aaaa-mm-dd`, recorta los nauplios.
 * Trae también los meses con datos, en orden, y la posición del elegido (`pos`), para el selector.
 * null si no hay ninguna corrida con mes.
 */
export function cifrasGerencia(filas, hoy, mIdxElegido) {
  const meses = presentMonths();
  if (!meses.length) return null;
  const pos = meses.includes(mIdxElegido) ? meses.indexOf(mIdxElegido) : meses.length - 1;
  const mIdx = meses[pos];
  const corridas = corridasOfMonth(mIdx);
  let siembra = 0, total = 0, despachado = 0, modulos = 0, modulosDespachados = 0;
  for (const cor of corridas) {
    for (const mod of modulesOfCorrida(cor)) {
      const s = modCorStats(mod, cor);
      if (s.siembra) siembra += s.siembra;
      if (s.cosecha) total += s.cosecha;
      modulos++;
      if (s.despachadoFull) { modulosDespachados++; if (s.cosecha) despachado += s.cosecha; }
    }
  }
  const rango = calendarRangeOfMonth(mIdx);
  const mad = rango ? produccionDelMes(filas, rango, hoy) : null;
  return {
    mes: monthLabelAt(mIdx), mIdx, pos, meses: meses.map((m) => ({ mIdx: m, mes: monthLabelAt(m) })), corridas,
    total, despachado, enCultivo: total - despachado, siembra,
    supervivencia: siembra > 0 ? Math.min(total / siembra * 100, 100) : null,
    modulos, modulosDespachados,
    nauplios: { n5: mad ? mad.total.n5 : 0, desoves: mad ? mad.total.desoves : 0,
      desde: mad ? mad.periodo.desde : rango ? rango.desde : '', hasta: mad ? mad.periodo.hasta : rango ? rango.hasta : '' },
  };
}
