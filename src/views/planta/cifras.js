/* ============================================================
   PLANTA · las CIFRAS DE GERENCIA (tanda 4, 2026-10-04) — producción del mes frente a la meta, supervivencia y
   nauplios. Módulo PURO: ni DOM ni red.

   Decisiones del usuario (2026-10-04) que viven aquí:
   · La producción del mes es el TOTAL de la tabla «Producción Omarsa» del Supervisor: la población actual de todas
     las corridas del mes de producción (`corridasOfMonth`), módulo a módulo con `modCorStats`, CIO INCLUIDO (como la
     tabla). Se separa en despachado (módulos con todos sus tanques despachados, `despachadoFull`, el criterio de la
     tabla) y en cultivo (el resto: lo que sigue en el agua, despachándose o no).
   · B1 (2026-10-07, usuario): el «despachado» sigue siendo por MÓDULO; el «Subtotal actual» de la tabla sólo suma
     CORRIDAS con todos sus módulos despachados, así que a mitad de una corrida (o con un módulo sin despacho, como el CIO)
     las dos cifras difieren. `despachadoCorridas` es la de la tabla, sólo para que la tarjeta lo diga.
   · El mes es el de PRODUCCIÓN (por corridas): por defecto el último con datos, el mismo que abre la tabla; con el
     selector de la tarjeta (2026-10-04, usuario), cualquiera de los meses con datos (`presentMonths`, los de la tabla).
   · La supervivencia es la de la fila Total de la tabla: Σ población actual ÷ Σ siembra × 100, con tope de 100.
   · Los nauplios (N5) y los desoves son los de Visitante (`produccionDelMes` de visitante/maduracion.produccion.js):
     el mes de CALENDARIO que corresponde al de producción (`calendarRangeOfMonth`), recortado a hoy. Con cada DÍA del
     mes (`porDia`, punto 10 del 07-10 noche: el N5 diario por lote frente a su meta, en la sección «Nauplios N5»).
     2026-10-18 (usuario, opción A): mientras ese mes de calendario no haya empezado, el de calendario EN CURSO, dicho.
   · La meta es de 400 millones al mes y se edita en la vista (⚙), guardada en el equipo: aquí sólo su valor por
     defecto y su validación; guardarla es cosa de la vista.
   Nada se recalcula con otra fórmula: si la tabla del Supervisor o Visitante cambian su regla, esto la sigue.
   ============================================================ */
import { presentMonths, corridasOfMonth, modulesOfCorrida, modCorStats, monthLabelAt, calendarRangeOfMonth, ventanaDeMaduracion } from '../../core/prodCalendar.js';
import { produccionDelMes } from '../visitante/maduracion.produccion.js';

/** Meta de producción por defecto: 400 millones de larvas al mes (usuario, 2026-10-04). */
export const META_POR_DEFECTO = 400e6;

/** Una meta válida es un número positivo; cualquier otra cosa (vacío, texto, 0, negativo) vuelve a la de por defecto. */
export function normalizarMeta(v, porDefecto = META_POR_DEFECTO) {
  const n = typeof v === 'number' ? v : (v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v));
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

/** Punto 10 (07-10 noche, usuario): la meta de nauplios N5 de maduración es de 65 millones al DÍA, editable en la vista
 *  (⚙, guardada en el equipo), y la del mes es la diaria × los 26 días de producción (1 690 millones por defecto). */
export const META_N5_DIA = 65e6;
export const DIAS_PRODUCCION_N5 = 26;

/**
 * El mes que se mira y el día de su foto: `mIdx` si es uno de los meses con datos; si no (o sin él), el último. El mes en
 * curso (el último) es HOY; uno pasado se pinta al cierre de su mes de calendario, sin pasar de hoy. Trae también los meses
 * con datos, en orden, y la posición del elegido (`pos`). null si no hay ninguna corrida con mes.
 * Es la regla de `cifrasGerencia`, aparte (hallazgo 4 de la auditoría de la Sesión A, 28-10; ronda 11, Sesión B): el mapa
 * 🦐 Broodstock sólo necesita esto y ya no espera el cálculo entero de la vista. La regla sigue en un solo sitio.
 */
export function mesYCierre(hoy, mIdxElegido) {
  const meses = presentMonths();
  if (!meses.length) return null;
  const pos = meses.includes(mIdxElegido) ? meses.indexOf(mIdxElegido) : meses.length - 1;
  const mIdx = meses[pos], actual = pos === meses.length - 1, rango = calendarRangeOfMonth(mIdx);
  return { mIdx, pos, meses, mes: monthLabelAt(mIdx), actual, cierre: actual || !rango ? hoy : (rango.hasta < hoy ? rango.hasta : hoy) };
}

/**
 * Las cifras de un mes de producción: el de `mesYCierre` (el elegido o el último), con su foto.
 * `filas`: todas las del store (los desoves salen de ahí). `hoy`: `aaaa-mm-dd`, recorta los nauplios.
 * Trae también los meses con datos, en orden, y la posición del elegido (`pos`), para el selector.
 * null si no hay ninguna corrida con mes.
 */
export function cifrasGerencia(filas, hoy, mIdxElegido) {
  const elegido = mesYCierre(hoy, mIdxElegido);
  if (!elegido) return null;
  const { mIdx, pos, meses } = elegido;
  const corridas = corridasOfMonth(mIdx);
  let siembra = 0, total = 0, despachado = 0, despachadoCorridas = 0, modulos = 0, modulosDespachados = 0;
  for (const cor of corridas) {
    let cosechaCor = 0, modsCor = 0, entera = true;
    for (const mod of modulesOfCorrida(cor)) {
      const s = modCorStats(mod, cor);
      if (s.siembra) siembra += s.siembra;
      if (s.cosecha) { total += s.cosecha; cosechaCor += s.cosecha; }
      modulos++; modsCor++;
      if (s.despachadoFull) { modulosDespachados++; if (s.cosecha) despachado += s.cosecha; } else entera = false;
    }
    if (modsCor && entera) despachadoCorridas += cosechaCor;   // B1: el criterio del «Subtotal actual» de la tabla
  }
  // 2026-10-18 (usuario, opción A) · el mes de producción arranca ~2 semanas antes que el de calendario de su nombre: mientras
  // éste no haya empezado, los nauplios y desoves son los del mes de calendario EN CURSO, y se dice (`adelantado`). Antes,
  // esas 2 semanas de cada mes, la tarjeta por defecto daba la maduración en cero («01/11 al 30/11»: aún no había llegado).
  // La regla es la de Visitante y vive en un solo sitio: `ventanaDeMaduracion` (core/prodCalendar.js; 2026-10-22, pauta 28).
  const { ventana, adelantado } = ventanaDeMaduracion(mIdx, hoy);
  const mad = ventana ? produccionDelMes(filas, ventana, hoy, { porDia: true }) : null;   // porDia: punto 10 (N5 de cada día)
  return {
    mes: elegido.mes, mIdx, pos, meses: meses.map((m) => ({ mIdx: m, mes: monthLabelAt(m) })), corridas,
    actual: elegido.actual, cierre: elegido.cierre,   // la foto: hoy, o el cierre del mes pasado (mesYCierre)
    total, despachado, enCultivo: total - despachado, despachadoCorridas, siembra,
    supervivencia: siembra > 0 ? Math.min(total / siembra * 100, 100) : null,
    modulos, modulosDespachados,
    nauplios: { n5: mad ? mad.total.n5 : 0, desoves: mad ? mad.total.desoves : 0,
      desde: mad ? mad.periodo.desde : ventana ? ventana.desde : '', hasta: mad ? mad.periodo.hasta : ventana ? ventana.hasta : '',
      dias: mad ? mad.dias : [], adelantado },
  };
}
