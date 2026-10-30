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
     «Módulo 1 (Base 1 Larvicultura)») y cuyo Estado es «En servicio»; los demás (stand by, en reparación, fuera de
     servicio…) o sin módulo del plano no salen en Planta (sí en su vista).
   · (3) Un blower airea su módulo las 24 h mientras está en cultivo: entre su ÚLTIMA lectura de horómetro y la más reciente
     de al menos 24 h antes, las dos dentro del cultivo actual (de su primer registro —`cronogramaPlanta`— a hoy), tiene que
     haber sumado el 80 % de las horas que pasaron; si no, se avisa. Sin un par así, no se juzga. Si el horómetro BAJÓ entre
     las dos, también se avisa (una lectura mal anotada).
   ⚠ 2026-10-30 (auditoría; decisiones del usuario: «Separación mínima de 24 h» y «Sólo En servicio») · antes se comparaban
     las DOS ÚLTIMAS lecturas, sin separación: un trabajo sin hora anotado el mismo día que la ronda tapaba un blower parado
     (el par caía en el mismo día y no se juzgaba), y dos lecturas a hora y media daban un falso aviso (el tablero marca horas
     enteras); y entraba cualquier Estado salvo «Stand by» escrito así, de modo que «Stand-by» o «En reparación» habrían
     avisado cada día.
   ============================================================ */
import { leerTrabajos, leerLecturas, leerEquipos, leerPlan, horometros, horometroActual, proximos, porUrgencia, MNT_ESTADO }
  from '../mantenimiento/mantenimiento.data.js';
import { LARV } from './plano.js';

/** (3) La fracción de las horas transcurridas que un blower en cultivo tiene que sumar (usuario, 2026-10-29: el 80 %). */
export const UMBRAL_NO_AVANZA = 0.8;

/** (3) Lo mínimo que tienen que separar las dos lecturas que se comparan (usuario, 2026-10-30: 24 h). */
export const SEPARACION_MIN_H = 24;

/** El número del módulo que nombra una «Ubicación» («Módulo 4», «Modulo 04», «M4», «Mód. 4», «Módulo #4», «Módulo 1 (Base 1
 *  …)» → 4 / 1), o null. */
export function moduloDeUbicacion(ubicacion) {
  const m = String(ubicacion || '').match(/^\s*m(?:[oó]d(?:ulo)?)?\.?\s*#?\s*0*(\d+)\b/i);
  return m ? +m[1] : null;
}
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** ¿Está «En servicio»? (sin importar mayúsculas, tildes ni espacios de más). */
export const enServicio = (e) => /^en\s+servicio$/i.test(sinTildes(e && e.estado).trim());

const r2 = (v) => Math.round(v * 100) / 100;
/** El instante de una lectura en ms (su hora si la trae, si no el comienzo del día). */
const msDe = (x) => {
  const [a, m, d] = x.fecha.split('-').map(Number);
  const h = /^(\d{1,2}):(\d{2})/.exec(x.hora || '');
  return Date.UTC(a, m - 1, d, h ? +h[1] : 0, h ? +h[2] : 0);
};
/** Las horas que separan dos lecturas: con la hora de las dos, las exactas; si a alguna le falta, LO MÍNIMO que pudo pasar
 *  —(días − 1) × 24: la primera, al acabar su día, y la segunda, al empezar el suyo—, para no avisar por no saber la hora. */
const horasEntre = (a, b) => (a.hora && b.hora ? (msDe(b) - msDe(a)) / 36e5
  : Math.max(0, (msDe({ fecha: b.fecha }) - msDe({ fecha: a.fecha })) / 864e5 - 1) * 24);

/** (3) ¿El horómetro del blower avanzó con su módulo en cultivo? null si no se puede juzgar o si avanzó; si no,
 *  { desde, hasta, sumo, esperadas, dias, minimo (las horas son lo mínimo, sin la hora de alguna), bajo (el horómetro bajó),
 *  de, a }. Compara su última lectura con la más reciente de al menos SEPARACION_MIN_H antes, las dos dentro del cultivo.
 *  `cm`: el módulo en `cronogramaPlanta`. */
export function horometroNoAvanza(lista, codigo, cm, hoy) {
  if (!cm || cm.tipo !== 'cultivo' || !cm.inicio) return null;
  const suyas = (lista || []).filter((x) => x.equipo === codigo && x.h != null && x.fecha && x.fecha >= cm.inicio && x.fecha <= hoy)
    .sort((a, b) => (msDe(a) - msDe(b)) || (a.h - b.h));
  if (suyas.length < 2) return null;
  const b = suyas[suyas.length - 1];
  let a = null;
  for (let i = suyas.length - 2; i >= 0 && !a; i--) if (horasEntre(suyas[i], b) >= SEPARACION_MIN_H) a = suyas[i];
  if (!a) return null;
  const horas = horasEntre(a, b), sumo = r2(b.h - a.h);
  const base = { desde: a.fecha, hasta: b.fecha, sumo, esperadas: Math.round(horas), dias: Math.round(horas / 24 * 10) / 10,
    minimo: !(a.hora && b.hora), bajo: sumo < 0, de: a.h, a: b.h };
  return sumo >= UMBRAL_NO_AVANZA * horas ? null : base;
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
    if (!enServicio(e)) return;
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
