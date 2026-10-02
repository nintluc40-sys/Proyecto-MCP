/* ============================================================
   VISITANTE — PRODUCCIÓN DE MADURACIÓN por lote y por sala (2026-10-01, usuario: «de manera similar a los demás
   departamentos, añadir algo que represente a la producción sala y lote de Maduración»).

   Se carga DIFERIDO (`import()` en index.js): trae las reglas del tablero de Maduración —el libro de movimientos y los
   desoves—, que viven fuera del bundle base, y Visitante sí está en él. Módulo PURO: ni DOM ni red.

   🔑 No se re-calcula nada con reglas propias, para que Visitante no pueda contradecir al tablero:
   · por LOTE, `tablaDeReproduccion` y `totalesDeReproduccion` (🥚 Reproducción): los nauplios por hembra sólo sobre
     los desoves que YA tienen su N5 —uno pendiente no diluye la cifra—;
   · por SALA, `salasDelDesove` (📉 Tendencias): un desove cuenta ENTERO en las salas donde su lote tenía animales al
     cierre de la víspera o del propio día. La hoja de desoves no lleva sala y el tablero no reparte lo que la hoja no
     dice, así que un lote que se mudó cuenta en sus dos salas y las salas NO suman el total: `enVarias` lo dice.
   · Las fuentes, como `modeloOperativo` (fuentesDesdeFilas + soloSalasVisibles), sin construir lo que aquí no se usa.
   · La FERTILIDAD (2026-10-02, usuario; hasta ese día quedaba fuera porque salía por encima del 100 %, corregido el
     01-10): la de `totalesDeReproduccion` y `tablaDeReproduccion` por lote y la de `acumularDesoves` por sala —N2 ÷
     huevos, sólo de los desoves que traen LOS DOS—, y de cuántos desoves sale (`desovesConFertilidad`), con la misma
     condición: `acumularDesoves` fila a fila, para no escribir otra. Casi ningún desove trae sus huevos contados.
   ============================================================ */
import { fuentesDesdeFilas } from '../maduracion/operativo.fuentes.js';
import { soloSalasVisibles, fechaDeFila } from '../maduracion/operativo.data.js';
import { tablaDeReproduccion, totalesDeReproduccion } from '../maduracion/operativo.reproduccion.js';
import { presenciaDiaria, salasDelDesove, acumularDesoves } from '../maduracion/operativo.tendencias.js';
import { normalizarFiltro } from '../maduracion/operativo.tablero.js';
import { normLote } from '../registros/lib/ficha-maduracion-desoves.schema.js';
import { sumarDias } from '../registros/lib/mad-libro.js';

const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const porNombre = (a, b) => a.localeCompare(b, 'es', { numeric: true });

/**
 * La producción de Maduración de un período `{ desde, hasta }` (`aaaa-mm-dd`). `hoy` recorta el final: un desove con
 * fecha posterior sólo puede ser una errata, y la foto del tablero tampoco lo incluye. null si no hay desoves.
 */
export function produccionDelMes(filas, periodo, hoy) {
  if (!periodo || !esIso(periodo.desde) || !esIso(periodo.hasta)) return null;
  const p = { desde: periodo.desde, hasta: esIso(hoy) && hoy < periodo.hasta ? hoy : periodo.hasta };
  if (p.desde > p.hasta) return null;
  const { fuentes } = soloSalasVisibles(fuentesDesdeFilas(filas).fuentes);
  const M = { fuentes, fecha: p.hasta };
  const F = normalizarFiltro({});
  const lotes = tablaDeReproduccion(M, p, F);
  if (!lotes.length) return null;
  const T = totalesDeReproduccion(M, p, F);

  const pres = presenciaDiaria(fuentes, sumarDias(p.desde, -1), p.hasta);
  const porSala = new Map();
  let enVarias = 0;
  let sinSala = 0;
  let desovesConFertilidad = 0;
  for (const r of fuentes.desoves) {
    const f = fechaDeFila('desoves', r);
    if (!esIso(f) || f < p.desde || f > p.hasta) continue;
    const una = acumularDesoves([r]);
    if (una.conN2YHuevos) desovesConFertilidad += una.desoves;
    const salas = salasDelDesove(pres, normLote(r.Lote), f);
    if (!salas.length) { sinSala++; continue; }
    if (salas.length > 1) enVarias++;
    for (const s of salas) {
      if (!porSala.has(s)) porSala.set(s, []);
      porSala.get(s).push(r);
    }
  }
  const salas = [...porSala].map(([sala, rs]) => {
    const A = acumularDesoves(rs);
    return { sala, desoves: A.desoves, n5: A.n5, fertilidad: A.fertilidad, lotes: [...new Set(rs.map((r) => normLote(r.Lote)))].sort(porNombre) };
  }).sort((a, b) => porNombre(a.sala, b.sala));

  return {
    periodo: p,
    total: { desoves: T.desoves, n5: T.n5, naupliosPorHembra: T.naupliosPorHembra, pendientes: T.pendientes,
      fertilidad: T.fertilidad, desovesConFertilidad },
    lotes: lotes.map((x) => ({ lote: x.lote, desoves: x.desoves, n5: x.n5, naupliosPorHembra: x.naupliosPorHembra, pendientes: x.pendientes,
      fertilidad: x.fertilidad })),
    salas, enVarias, sinSala,
  };
}
