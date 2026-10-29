/* ============================================================
   PLANTA · EL BLOWER DE CADA MÓDULO (F3, el cruce con 🔧 Mantenimiento; puro: sin DOM ni 3D)
   2026-10-29 (Sesión B, ronda 12). Lo que el Excel de mantenimiento no puede: cruzar sus blowers con el estado de los
   módulos. Decisiones del usuario (2026-10-29): las piezas 1–3 de la propuesta —(1) los blowers con algo VENCIDO en «Qué
   atender hoy» (sólo los vencidos: los próximos se ven en la ficha), (2) el blower y su próximo cambio en la ficha del
   módulo y (3) el aviso de horómetro que no avanza con el módulo en cultivo—; la 4 (la próxima parada estimada) queda
   aparte, para cuando haya datos reales con que medirla.
   · Nada se recalcula con otra regla: el semáforo es el de la vista 🔧 Mantenimiento (`proximos`, `porUrgencia`) y las
     horas, las reales (`horometros`: con el ajuste de su «Ajuste desde», como el BLW-09).
   · El blower de un módulo es el equipo de la hoja «Mantenimiento Equipos» cuya «Ubicación» nombra ese módulo («Módulo 4»,
     «Módulo 1 (Base 1 Larvicultura)»); los que están en stand by o sin módulo del plano no salen en Planta (sí en su vista).
   · (3) Un blower airea su módulo las 24 h mientras está en cultivo: si entre sus dos últimas lecturas de horómetro, las
     dos dentro del cultivo actual (de su primer registro —`cronogramaPlanta`— a hoy), sumó menos del 80 % de las horas
     que pasaron, se avisa. Con una sola lectura dentro del cultivo, no se juzga.
   ============================================================ */
import { leerTrabajos, leerLecturas, leerEquipos, leerPlan, horometros, horometroActual, proximos, porUrgencia, MNT_ESTADO }
  from '../mantenimiento/mantenimiento.data.js';
import { LARV } from './plano.js';

/** (3) La fracción de las horas transcurridas que un blower en cultivo tiene que sumar (usuario, 2026-10-29: el 80 %). */
export const UMBRAL_NO_AVANZA = 0.8;

/** El número del módulo que nombra una «Ubicación» («Módulo 4», «Modulo 04», «M4», «Módulo 1 (Base 1 …)» → 4 / 1), o null. */
export function moduloDeUbicacion(ubicacion) {
  const m = String(ubicacion || '').match(/^\s*m(?:[oó]dulo)?\s*0*(\d+)\b/i);
  return m ? +m[1] : null;
}

const r2 = (v) => Math.round(v * 100) / 100;
/** El instante de una lectura en ms (su hora si la trae, si no el comienzo del día). */
const msDe = (x) => {
  const [a, m, d] = x.fecha.split('-').map(Number);
  const h = /^(\d{1,2}):(\d{2})/.exec(x.hora || '');
  return Date.UTC(a, m - 1, d, h ? +h[1] : 0, h ? +h[2] : 0);
};

/** (3) ¿El horómetro del blower avanzó con su módulo en cultivo? null si no se puede juzgar o si avanzó; si no, lo que sumó
 *  frente a lo esperado entre sus dos últimas lecturas dentro del cultivo. `cm`: el módulo en `cronogramaPlanta`. */
export function horometroNoAvanza(lista, codigo, cm, hoy) {
  if (!cm || cm.tipo !== 'cultivo' || !cm.inicio) return null;
  const suyas = (lista || []).filter((x) => x.equipo === codigo && x.h != null && x.fecha && x.fecha >= cm.inicio && x.fecha <= hoy)
    .sort((a, b) => (msDe(a) - msDe(b)) || (a.h - b.h));
  if (suyas.length < 2) return null;
  const a = suyas[suyas.length - 2], b = suyas[suyas.length - 1];
  // con la hora de las dos, las horas exactas; si a alguna le falta, de día a día
  const horas = (a.hora && b.hora ? msDe(b) - msDe(a) : msDe({ fecha: b.fecha }) - msDe({ fecha: a.fecha })) / 36e5;
  if (!(horas > 0)) return null;
  const sumo = r2(b.h - a.h);
  if (sumo >= UMBRAL_NO_AVANZA * horas) return null;
  return { desde: a.fecha, hasta: b.fecha, sumo, esperadas: Math.round(horas), dias: Math.round(horas / 24 * 10) / 10 };
}

/**
 * Los blowers de los módulos del plano, de las 4 hojas de 🔧 Mantenimiento.
 * @param {object[]} rows  el libro (store.globalData)
 * @param {object|null} crono  `cronogramaPlanta(...)` (para el cultivo de cada módulo; sin él no hay aviso de horómetro)
 * @param {string} hoy  ISO
 * @returns {{ porModulo: Object<string, object[]> }} por id del módulo ('M4'): [{ codigo, modelo, horometro: { h, fecha } | null,
 *   proximo (la actividad con plan más urgente, de `proximos`, o null), vencidos: [...], noAvanza (o null) }]
 */
export function blowersPlanta(rows, crono, hoy) {
  const equipos = leerEquipos(rows), trabajos = leerTrabajos(rows), lecturas = leerLecturas(rows), plan = leerPlan(rows);
  const lista = horometros(lecturas, trabajos, equipos);
  const prox = proximos({ equipos, plan, trabajos, lista, hoy });
  const porModulo = {};
  equipos.forEach((e) => {
    if (e.standBy) return;
    const m = LARV.find((x) => x.n === moduloDeUbicacion(e.ubicacion));
    if (!m) return;
    const suyos = porUrgencia(prox.filter((p) => p.equipo === e.codigo && p.estado !== MNT_ESTADO.SIN_PLAN));
    const act = horometroActual(lista, e.codigo);
    (porModulo[m.id] = porModulo[m.id] || []).push({
      codigo: e.codigo, modelo: e.modelo, horometro: act ? { h: act.h, fecha: act.fecha } : null,
      proximo: suyos[0] || null, vencidos: suyos.filter((p) => p.estado === MNT_ESTADO.VENCIDO),
      noAvanza: horometroNoAvanza(lista, e.codigo, crono && crono.modulos ? crono.modulos[m.id] : null, hoy),
    });
  });
  return { porModulo };
}
