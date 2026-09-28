/* ============================================================
   MADURACIÓN · OPERATIVO — 🦐 cópulas × marea × luna (0r·2, 2026-09-28, usuario)

   La pestaña «🦐 Cópulas» del modal 🌊 Mareas del tablero: ¿se copula más con la marea viva, con una fase de la luna o
   con más amplitud? MÓDULO PURO; la vista, en operativo.view.js.
   · La TASA de un día es la del ⚖️ Saldo (H1 de mad-resumen.js; la de `tasaEnPartesDelLote`): Σ cópulas de los partes
     de Tanques del día ÷ Σ hembras que el libro tenía en esos tanques al CIERRE de ese día × 100. El parte de un tanque
     sin hembras en el libro no cuenta (se dice cuántos). Por grupo —tipo de marea, fase—, Σ cópulas ÷ Σ hembras.
   · Un día en que NINGÚN tanque de la granja registra cópulas es un HUECO del registro, no un día sin cópulas: medido el
     28-09, en la hoja nadie escribe un 0 (643 partes: 360 con cifra y 283 con la casilla vacía) y hay días enteros vacíos
     (13–23/08, 03/09, 17/09, 18/09). Se quita y se cuenta (decisión del usuario: como las noches sin desoves de T9). Es
     de la GRANJA, no del filtro: el 0 de una sala un día en que otras sí registraron es un 0 de verdad.
   · Decisiones del usuario: TODO el registro y filtros PROPIOS: la sala y «sólo en producción» (un tanque cuenta ese
     día si TODOS sus lotes estaban en producción EN esa sala: la cuarentena casi no copula y puede fingir una relación).
   · La correlación (Pearson) de la tasa diaria con la amplitud, la iluminación y el tipo (Viva = 1, Muerta = 0), y
     `rCrit` = 2/√n, la regla de 🧬 Microchips · T9: con |r| menor no se distingue del azar. NO es una prueba de
     significancia: con pocos ciclos lunares, un lote que entra o sale puede coincidir con las mareas; la vista lo dice.
   ============================================================ */
import { construirLibro, ubicKey, estadoDeLote, ESTADO_PRODUCCION } from '../registros/lib/mad-libro.js';
import { pearson } from '../../core/util.js';
import { FASES_CICLO } from './data.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const ent = (v) => { const n = Number(txt(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const porNombre = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
/** Días en un ciclo lunar (sinódico). */
export const CICLO_LUNAR_DIAS = 29.53;
/** Con menos días con marea, no se lee nada: ni correlación ni diferencias. */
export const MIN_DIAS_LECTURA = 10;

/** Al cierre de un día: por tanque con animales, sus hembras y el RELOJ de cada lote en esa sala (su ingreso ahí, su
 *  cópula ahí y el cierre del lote: los de `estadoDeLote`). Se COPIA: el gancho entrega el libro vivo. */
function fotoDeTanques(posiciones, lotes) {
  const m = new Map();
  for (const p of posiciones.values()) {
    if (!(ent(p.machos) > 0 || ent(p.hembras) > 0)) continue;
    const uk = ubicKey(p.sala, p.tanque);
    const T = m.get(uk) || { hembras: 0, relojes: [] };
    T.hembras += ent(p.hembras);
    const L = lotes.get(p.lote);
    const S = L && L.salas && L.salas.get(p.sala);
    T.relojes.push(S ? { ingreso: S.ingreso, copulaDesde: S.copulaDesde, cerrado: L.cerrado || null } : { ...(L || {}) });
    m.set(uk, T);
  }
  return m;
}

/**
 * Cada parte de Tanques (`diasDeTanque`) con lo que dice el libro de su tanque al cierre de ESE día: las hembras y si
 * todos sus lotes estaban en producción en esa sala. UNA pasada del libro (gancho `alCerrarDia`), como `serieDiaria`:
 * reconstruirlo por día costaría un libro por día. Un día sin sucesos repite el cierre anterior; el estado se calcula
 * con la fecha del parte (la cuarentena se cumple con el tiempo aunque no pase nada).
 */
export function partesConHembras(fuentes, partes) {
  const ps = (partes || []).filter((p) => esIso(txt(p.fecha)));
  if (!ps.length) return [];
  const hasta = ps.reduce((m, p) => (p.fecha > m ? p.fecha : m), ps[0].fecha);
  const cierres = [];
  construirLibro(fuentes || {}, { hoy: hasta, hasta, alCerrarDia: (fecha, { posiciones, lotes }) => {
    if (esIso(fecha)) cierres.push([fecha, fotoDeTanques(posiciones, lotes)]);
  } });
  let i = 0;
  let foto = new Map();
  return [...ps].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).map((p) => {
    while (i < cierres.length && cierres[i][0] <= p.fecha) foto = cierres[i++][1];
    const T = foto.get(ubicKey(p.sala, p.tanque));
    return {
      fecha: p.fecha, sala: txt(p.sala), tanque: p.tanque, copulas: ent(p.copulas), hembras: T ? T.hembras : 0,
      produccion: !!T && T.relojes.length > 0 && T.relojes.every((r) => estadoDeLote(r, p.fecha) === ESTADO_PRODUCCION),
    };
  });
}

/** Σ cópulas ÷ Σ hembras × 100 de unos días; null sin hembras. */
const grupo = (dias) => {
  const copulas = dias.reduce((s, d) => s + d.copulas, 0);
  const hembras = dias.reduce((s, d) => s + d.hembras, 0);
  return { dias: dias.length, copulas, hembras, tasa: hembras > 0 ? (copulas / hembras) * 100 : null };
};
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);

/**
 * La relación de las cópulas con la marea y la luna, con los filtros de la pestaña.
 * @param {Array} base   `partesConHembras`
 * @param {Map} marea    'AAAA-MM-DD' → { fase, ilum, tipo, amplitud } (`mareaPorDia` de la hoja «Marea»)
 * @param {{sala?: string, soloProduccion?: boolean}} [f]
 * @returns {{ salas, dias, conMarea, sinMarea, sinRegistro, sinHembras, fueraDeProduccion, desde, hasta, ciclos, tipo, fase,
 *   r: {amplitud, ilum, tipo}, rCrit, lectura: {clave, señales} }}  `lectura.clave`: 'sin-datos' | 'pocos' | 'posible' |
 *   'sin-senal'; `señales`: las variables con |r| ≥ rCrit, con su r.
 */
export function copulasYMarea(base, marea, { sala = '', soloProduccion = false } = {}) {
  const salas = [...new Set((base || []).map((b) => b.sala).filter(Boolean))].sort(porNombre);
  let sinHembras = 0;
  let fueraDeProduccion = 0;
  const conRegistro = new Set((base || []).filter((b) => b.copulas > 0).map((b) => b.fecha));
  const huecos = new Set((base || []).map((b) => b.fecha).filter((f) => !conRegistro.has(f)));
  const porDia = new Map();
  for (const b of base || []) {
    if (!conRegistro.has(b.fecha)) continue;   // hueco del registro: nadie en la granja registró cópulas ese día
    if (sala && b.sala !== sala) continue;
    if (!(b.hembras > 0)) { sinHembras++; continue; }
    if (soloProduccion && !b.produccion) { fueraDeProduccion++; continue; }
    const o = porDia.get(b.fecha) || { fecha: b.fecha, copulas: 0, hembras: 0, partes: 0 };
    o.copulas += b.copulas;
    o.hembras += b.hembras;
    o.partes++;
    porDia.set(b.fecha, o);
  }
  const dias = [...porDia.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((o) => ({ ...o, tasa: (o.copulas / o.hembras) * 100, marea: (marea && marea.get(o.fecha)) || null }));
  const con = dias.filter((d) => d.marea);
  const n = con.length;
  const r = (valor) => pearson(con.map((d) => [d.tasa, valor(d.marea)]).filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v)));
  const corr = {
    amplitud: r((m) => m.amplitud),
    ilum: r((m) => m.ilum),
    tipo: r((m) => (m.tipo === 'Viva' ? 1 : m.tipo === 'Muerta' ? 0 : null)),
  };
  const rCrit = n ? 2 / Math.sqrt(n) : null;
  const señales = n >= MIN_DIAS_LECTURA
    ? Object.entries(corr).filter(([, v]) => v !== null && Math.abs(v) >= rCrit).map(([que, v]) => ({ que, r: v }))
    : [];
  const clave = !n ? 'sin-datos' : n < MIN_DIAS_LECTURA ? 'pocos' : señales.length ? 'posible' : 'sin-senal';
  const desde = n ? con[0].fecha : '';
  const hasta = n ? con[n - 1].fecha : '';
  return {
    salas, dias, conMarea: n, sinMarea: dias.length - n, sinRegistro: huecos.size, sinHembras, fueraDeProduccion, desde, hasta,
    ciclos: n ? (diasEntre(desde, hasta) + 1) / CICLO_LUNAR_DIAS : 0,
    tipo: ['Viva', 'Muerta'].map((k) => ({ k, ...grupo(con.filter((d) => d.marea.tipo === k)) })),
    fase: FASES_CICLO.map((k) => ({ k, ...grupo(con.filter((d) => d.marea.fase === k)) })),
    r: corr, rCrit, lectura: { clave, señales },
  };
}
