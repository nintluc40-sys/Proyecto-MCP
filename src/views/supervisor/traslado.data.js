/* ============================================================
   SUPERVISOR · Traslado — agregación de `Registro_Traslado`

   Módulo PURO: sin DOM, sin red, sin estado. Toma las filas planas de la hoja y
   devuelve el viaje reconstruido por CAMIÓN, que es como lo mira el supervisor.

   ── El grano y por qué importa ──────────────────────────────
   La hoja es formato largo: una fila por (viaje, camión, revisión, tina). Un viaje
   de 2 camiones × 4 paradas × 8 tinas son 64 filas que dicen lo mismo del viaje 64
   veces. Aquí se deshace ese denormalizado: los valores de VIAJE se toman una vez,
   los de PARADA una vez por revisión, y sólo las mediciones se promedian.

   ── La costura que hacía falta comprobar ────────────────────
   🔑 El «Módulo» de esta hoja usa la grafía CORTA —M01…M10, CIO— y es EXACTAMENTE
   la que traen las hojas «Datos Larvicultura» que alimentan al supervisor (medido
   en producción: M07). Si la ficha hubiera escrito «Módulo 7», como hace
   Registro_Supervisión, esta vista habría salido vacía para siempre y sin un solo
   error. Es la misma trampa de las dos grafías del analista.

   ⚠ La Corrida llega como NÚMERO desde la hoja y como TEXTO desde el estado de la
   vista. Se comparan siempre normalizadas a texto.
   ============================================================ */

/* ⚠ La regla de la medianoche NO se reimplementa aquí. Los traslados son nocturnos
   y cruzan las 00:00 (el formato va de 20:30 a 06:00): una resta a secas daría
   -1250 minutos donde hay 190. Esa regla ya vive en el esquema de la ficha, que la
   prueba de paridad mantiene igual a la del monolito de captura — dos definiciones
   de lo mismo es exactamente la costura donde este proyecto ha encontrado todos sus
   defectos. */
import { minutosDeHora, minutosEntre, CADENCIA_MAX_MIN } from '../registros/lib/ficha-traslado.schema.js';

export { CADENCIA_MAX_MIN };

/** Cabeceras exactas de `Registro_Traslado` (ver ficha-traslado.schema.js). */
export const TK = {
  fecha: 'Fecha',
  viaje: 'Viaje',
  corrida: 'Corrida',
  modulo: 'Módulo',
  camaronera: 'Camaronera',
  placa: 'Placa',
  salinidad: 'Salinidad',
  horaSalida: 'Hora salida',
  horaLlegada: 'Hora llegada',
  revision: 'Revisión',
  hora: 'Hora',
  lugar: 'Lugar',
  lat: 'Latitud',
  lon: 'Longitud',
  precision: 'Precisión (m)',
  ubicacion: 'Ubicación',
  tina: 'Tina',
  o2: 'Oxígeno (mg/L)',
  temp: 'Temperatura (°C)',
  act: 'Actividad',
  alim: 'Alimentación',
  obs: 'Observaciones',
  insumos: 'Insumos',
  check: 'Check materiales',
  controlador: 'Controlador despacho',
  chequeador: 'Chequeador entrega',
  recepcion: 'Responsable recepción',
  id: 'ID',
};

/** Catálogos, duplicados a propósito: este módulo no puede importar de la app de
 *  captura (`public/registros/engine.js` es un monolito de script clásico).
 *  `traslado.data.test.js` comprueba que sigan coincidiendo con el esquema. */
export const ACTIVIDAD_ORDEN = ['Alta', 'Normal', 'Media', 'Baja'];
export const INSUMOS_POSIBLES = ['Artemia', 'Flake', 'Prokura', 'Vitamina C'];
export const CHECK_POSIBLES = ['Oxigenómetro', 'Linterna', 'Bandeja', 'Esfero'];

const txt = (r, k) => String((r && r[k] != null ? r[k] : '')).trim();
const num = (r, k) => {
  const v = r ? r[k] : null;
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const prom = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/** ¿La fila viene de `Registro_Traslado`? El origen lo estampa `applySheets`. */
export function isTrasladoRow(r) {
  if (!r) return false;
  const o = String(r._SheetOrigin || '').trim();
  if (/traslado/i.test(o)) return true;
  // Respaldo por forma: una hoja renombrada seguiría teniendo estas cuatro columnas
  // juntas, que no coinciden con ninguna otra del sistema.
  return r[TK.placa] !== undefined && r[TK.tina] !== undefined
    && r[TK.revision] !== undefined && r[TK.viaje] !== undefined;
}

/** Filas de traslado de un (módulo, corrida). `corrida` null = todas. */
export function filasDe(data, mod, corrida) {
  const m = String(mod == null ? '' : mod).trim();
  const c = corrida == null || corrida === '' ? null : String(corrida).trim();
  return (data || []).filter((r) => {
    if (!isTrasladoRow(r)) return false;
    if (m && txt(r, TK.modulo) !== m) return false;
    if (c !== null && txt(r, TK.corrida) !== c) return false;
    return true;
  });
}

/** Las placas presentes, en orden de aparición estable (alfabético). */
export function placasDe(filas) {
  return [...new Set((filas || []).map((r) => txt(r, TK.placa)).filter(Boolean))].sort();
}

/** Lista CSV de la hoja → array limpio. */
function lista(v) {
  return String(v == null ? '' : v).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Cumplimiento de un checklist: cuáles se marcaron de los posibles. */
function cumplimiento(marcados, posibles) {
  const set = new Set(marcados);
  const falta = posibles.filter((p) => !set.has(p));
  return {
    marcados: posibles.filter((p) => set.has(p)),
    faltan: falta,
    n: posibles.length - falta.length,
    total: posibles.length,
    completo: falta.length === 0,
  };
}

/* ── Una parada de un camión ────────────────────────────────
   Las columnas de PARADA (hora, lugar, coordenadas, observaciones) se repiten en
   las 8 filas de sus tinas: se toma la primera no vacía, no se promedian. */
function paradaDe(filasParada) {
  const base = filasParada[0] || {};
  const primero = (k) => {
    for (const r of filasParada) { const v = txt(r, k); if (v !== '') return v; }
    return '';
  };
  const primeroNum = (k) => {
    for (const r of filasParada) { const v = num(r, k); if (v !== null) return v; }
    return null;
  };
  const tinas = {};
  filasParada.forEach((r) => {
    const t = num(r, TK.tina);
    if (t === null) return;
    tinas[t] = { tina: t, o2: num(r, TK.o2), temp: num(r, TK.temp), act: txt(r, TK.act), alim: txt(r, TK.alim) };
  });
  const vals = (campo) => Object.values(tinas).map((x) => x[campo]).filter((v) => v !== null);
  return {
    revision: num(base, TK.revision),
    hora: primero(TK.hora),
    lugar: primero(TK.lugar),
    lat: primeroNum(TK.lat),
    lon: primeroNum(TK.lon),
    precision: primeroNum(TK.precision),
    ubicacion: primero(TK.ubicacion),
    obs: primero(TK.obs),
    tinas,
    o2: prom(vals('o2')),
    temp: prom(vals('temp')),
    // Alimentación de la parada: la que aparece; suele ser la misma en todas.
    alim: [...new Set(Object.values(tinas).map((x) => x.alim).filter(Boolean))],
  };
}

/* ── El tiempo del traslado ─────────────────────────────────
   Dos lecturas distintas, y las dos hacen falta:

     · EN RUTA — de la primera parada registrada a la última. Sale de datos
       VALIDADOS: la captura exige hora en toda parada que se registra, así que
       este número nunca miente.
     · PUERTA A PUERTA — de «Hora de salida» a «Hora de llegada». Es el total real
       del viaje, pero son campos que se teclean libres; hasta el 2026-08-25 no se
       validaban de ninguna forma. Por eso se calcula sólo cuando las dos son
       legibles, y si no, se calla en vez de inventar un número.

   🔑 Los camiones del mismo viaje PARAN JUNTOS: hora y lugar son de la parada, no
   del camión. Por eso el tiempo se calcula UNA vez sobre las paradas del conjunto
   visible y no por camión; promediarlo entre camiones daría el mismo número con
   más pasos y se rompería en cuanto una parada le faltara a uno de ellos. */

/** Minutos → «4 h 30 min». Sin horas, «45 min». `null` → «—». */
export function fmtMinutos(min) {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return r + ' min';
  return r ? h + ' h ' + r + ' min' : h + ' h';
}

/** Los VIAJES del conjunto visible, cada uno con lo que es SUYO.
 *
 *  Un traslado es la unidad real de esta vista: una misma corrida de un módulo
 *  puede salir en VARIOS viajes —distintas noches, distintas camaroneras, distintos
 *  camiones—, y cada uno tiene su fecha, su destino, su tiempo y sus observaciones.
 *  Antes la vista trataba todo lo visible como un solo traslado, y entonces el
 *  tiempo salía del PRIMERO y los demás no se veían por ninguna parte.
 *
 *  🔑 El reparto de granos, tal y como lo declara el esquema en `TRASLADO_COLUMNS`:
 *    · `grain: 'tina'`     → O₂, temperatura, actividad, alimentación ⇒ POR PLACA.
 *    · `grain: 'revision'` → hora, lugar, GPS y observaciones, que son de la parada
 *                            y los camiones del viaje comparten ⇒ POR VIAJE.
 *    · `grain: 'viaje'`    → fecha, camaronera, salida/llegada, responsables.
 *
 *  Por eso `tiempo` se calcula aquí sobre los camiones de UN viaje: dentro de un
 *  viaje los camiones sí paran juntos, que es la suposición que `tiempoDe` necesita
 *  y la que se rompía al mezclar dos traslados. */
export function viajesDe(camiones) {
  const porViaje = new Map();
  (camiones || []).forEach((c) => {
    if (!porViaje.has(c.viaje)) porViaje.set(c.viaje, []);
    porViaje.get(c.viaje).push(c);
  });
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...porViaje.values()].map((cams) => {
    const base = cams[0] || {};
    // Una sola pasada: `nObservaciones` es la longitud de la MISMA lista, no un
    // segundo recorrido que podría acabar discrepando de ella.
    const obs = observacionesDelViaje(cams);
    return {
      viaje: base.viaje || '',
      fecha: base.fecha || '',
      camaronera: base.camaronera || '',
      camiones: cams,
      placas: [...new Set(cams.map((c) => c.placa))],
      tiempo: tiempoDe(cams),
      observaciones: obs,
      nObservaciones: obs.length,
    };
  }).sort((a, b) => cmp(a.fecha, b.fecha) || cmp(a.viaje, b.viaje));
}

/** Las observaciones del conjunto visible, SIN REPETIR.
 *
 *  ⚠⚠ Una observación es de la PARADA, no del camión — en el esquema
 *  `Observaciones` tiene `grain: 'revision'`, y `buildTrasPayload` escribe el mismo
 *  texto en las filas de TODOS los camiones de esa parada. Contarlas por camión y
 *  sumar multiplicaba el KPI por el número de camiones: un viaje con UNA
 *  observación y dos camiones decía «2», y con tres decía «3». Medido el
 *  2026-08-26; no hacía falta ningún caso raro, pasaba en el viaje normal.
 *
 *  La llave lleva el VIAJE además de la parada, porque dos traslados distintos de
 *  la misma corrida sí pueden dejar observaciones distintas en su parada 1.
 *  Y lleva el TEXTO: si dos filas de la misma parada trajeran textos diferentes
 *  —cosa que la app no produce, pero una edición a mano de la hoja sí— esconder
 *  uno de los dos sería peor que enseñarlos. */
export function observacionesDelViaje(camiones) {
  const vistas = new Map();
  (camiones || []).forEach((c) => {
    (c.observaciones || []).forEach((o) => {
      const k = JSON.stringify([c.viaje, o.revision, o.texto]);
      if (!vistas.has(k)) vistas.set(k, { ...o, viaje: c.viaje, fecha: c.fecha, camaronera: c.camaronera });
    });
  });
  return [...vistas.values()];
}

/** Las paradas del conjunto visible, sin repetir: los camiones comparten parada.
 *  Se ordenan por número de revisión, no por hora: una hora tecleada mal no puede
 *  reordenar el viaje. */
export function paradasDelViaje(camiones) {
  const porRev = new Map();
  (camiones || []).forEach((c) => {
    (c.paradas || []).forEach((p) => {
      const rev = p.revision;
      if (rev === null || rev === undefined) return;
      const ya = porRev.get(rev);
      // Si dos camiones difieren, manda la primera hora legible: es la de la parada.
      if (!ya || (ya.hora === '' && p.hora !== '')) porRev.set(rev, p);
    });
  });
  return [...porRev.keys()].sort((a, b) => a - b).map((r) => porRev.get(r));
}

/** El tiempo del traslado del conjunto visible.
 *  Devuelve siempre la misma forma; los huecos son `null`, nunca 0 —un 0 diría
 *  «no tardó nada», que es una afirmación, y aquí lo que pasa es que no se sabe. */
export function tiempoDe(camiones) {
  const paradas = paradasDelViaje(camiones).filter((p) => minutosDeHora(p.hora) !== null);
  const base = (camiones || [])[0] || {};
  const salida = minutosDeHora(base.horaSalida) === null ? '' : base.horaSalida;
  const llegada = minutosDeHora(base.horaLlegada) === null ? '' : base.horaLlegada;

  // Tramo a tramo entre paradas consecutivas. El primero no tiene anterior.
  const tramos = paradas.map((p, i) => {
    const prev = i === 0 ? null : paradas[i - 1];
    const min = prev ? minutosEntre(prev.hora, p.hora) : null;
    return {
      revision: p.revision,
      hora: p.hora,
      lugar: p.lugar,
      desde: prev ? prev.lugar : '',
      minutos: min,
      // El protocolo pide no pasar de CADENCIA_MAX_MIN entre revisiones. Se señala,
      // no se corrige: el dato es el que es.
      excede: min !== null && min > CADENCIA_MAX_MIN,
    };
  });

  const primera = paradas.length ? paradas[0] : null;
  const ultima = paradas.length ? paradas[paradas.length - 1] : null;
  return {
    paradas,
    tramos,
    salida,
    llegada,
    primera,
    ultima,
    // Con UNA sola parada no hay recorrido que medir: null, no 0.
    enRuta: paradas.length > 1 ? minutosEntre(primera.hora, ultima.hora) : null,
    // `salida` y `llegada` YA son "" cuando no eran legibles, y `minutosEntre`
    // devuelve null en cuanto una de las dos no lo es: una guarda extra aquí no
    // cambiaría ningún resultado. La comprobación de verdad está arriba, al
    // normalizarlas — es lo que hace que el desglose diga «sin horas» en vez de
    // enseñar «s/n → 06:00» como si fuera un tramo.
    puertaAPuerta: minutosEntre(salida, llegada),
    // Tiempos muertos: lo que va de la salida a la primera parada y de la última a
    // la llegada. Es donde se esconde el tiempo que no aparece en ninguna revisión.
    previo: salida && primera ? minutosEntre(salida, primera.hora) : null,
    posterior: llegada && ultima ? minutosEntre(ultima.hora, llegada) : null,
    fueraDeCadencia: tramos.filter((t) => t.excede).length,
  };
}

/** Frecuencia de Actividad y su categoría dominante. */
export function actividadDe(registros) {
  const conteo = {};
  ACTIVIDAD_ORDEN.forEach((a) => { conteo[a] = 0; });
  let otras = 0;
  registros.forEach((a) => {
    const v = String(a || '').trim();
    if (!v) return;
    if (Object.prototype.hasOwnProperty.call(conteo, v)) conteo[v] += 1;
    else otras += 1;
  });
  const total = ACTIVIDAD_ORDEN.reduce((s, a) => s + conteo[a], 0) + otras;
  // La moda se resuelve por el ORDEN DE LA ESCALA, no por el alfabético ni por el
  // de inserción: con empate entre «Alta» y «Baja», decir «Alta» es informativo y
  // decir «Baja» sería alarmista. Un empate real se señala aparte.
  let moda = null; let max = 0; let empate = false;
  ACTIVIDAD_ORDEN.forEach((a) => {
    if (conteo[a] > max) { max = conteo[a]; moda = a; empate = false; }
    else if (conteo[a] === max && max > 0 && a !== moda) empate = true;
  });
  return { conteo, moda: total ? moda : null, max, empate, total };
}

/* ── El viaje de UN camión ──────────────────────────────────── */
function camionDe(filasPlaca) {
  const base = filasPlaca[0] || {};
  const porRev = new Map();
  filasPlaca.forEach((r) => {
    const rev = num(r, TK.revision);
    if (rev === null) return;
    if (!porRev.has(rev)) porRev.set(rev, []);
    porRev.get(rev).push(r);
  });
  const paradas = [...porRev.keys()].sort((a, b) => a - b)
    .map((rev) => paradaDe(porRev.get(rev)))
    // Una fila SIN NADA no es una parada. Pasa cuando se retira un camión o una
    // parada de un viaje ya sincronizado: la app de captura vuelve a mandar esas
    // llaves con todo en blanco para APAGARLAS en la hoja, y aquí no deben pintarse
    // como si el camión hubiera parado en ningún sitio. El criterio es el mismo que
    // usa la captura para decidir si una parada se escribe (`trasRevConDatos`): que
    // tenga hora, lugar, ubicación, observaciones o alguna medición.
    .filter((p) => p.hora !== '' || p.lugar !== '' || p.ubicacion !== '' || p.obs !== ''
      || Object.values(p.tinas).some((t) => t.o2 !== null || t.temp !== null || t.act !== '' || t.alim !== ''));

  // Promedios POR TINA a lo largo de todo el viaje (lo que pidió el usuario:
  // «promedio por tina y carro»).
  const porTina = (campo) => {
    const acc = {};
    paradas.forEach((p) => {
      Object.values(p.tinas).forEach((t) => {
        if (t[campo] === null) return;
        (acc[t.tina] = acc[t.tina] || []).push(t[campo]);
      });
    });
    const out = {};
    Object.keys(acc).sort((a, b) => a - b).forEach((t) => { out[t] = prom(acc[t]); });
    return out;
  };
  const todos = (campo) => paradas.flatMap((p) => Object.values(p.tinas).map((t) => t[campo])).filter((v) => v !== null);

  const acts = paradas.flatMap((p) => Object.values(p.tinas).map((t) => t.act));
  const observaciones = paradas
    .filter((p) => p.obs !== '')
    .map((p) => ({ revision: p.revision, hora: p.hora, lugar: p.lugar, texto: p.obs }));

  return {
    placa: txt(base, TK.placa),
    viaje: txt(base, TK.viaje),
    fecha: txt(base, TK.fecha),
    camaronera: txt(base, TK.camaronera),
    corrida: txt(base, TK.corrida),
    modulo: txt(base, TK.modulo),
    horaSalida: txt(base, TK.horaSalida),
    horaLlegada: txt(base, TK.horaLlegada),
    salinidad: num(base, TK.salinidad),
    controlador: txt(base, TK.controlador),
    chequeador: txt(base, TK.chequeador),
    recepcion: txt(base, TK.recepcion),
    insumos: cumplimiento(lista(base[TK.insumos]), INSUMOS_POSIBLES),
    check: cumplimiento(lista(base[TK.check]), CHECK_POSIBLES),
    paradas,
    nParadas: paradas.length,
    tinas: [...new Set(paradas.flatMap((p) => Object.keys(p.tinas).map(Number)))].sort((a, b) => a - b),
    o2: { promedio: prom(todos('o2')), porTina: porTina('o2') },
    temp: { promedio: prom(todos('temp')), porTina: porTina('temp') },
    actividad: actividadDe(acts),
    observaciones,
    nObservaciones: observaciones.length,
    // Puntos con coordenadas, para el mapa. Una parada sin GPS NO se inventa.
    puntos: paradas.filter((p) => p.lat !== null && p.lon !== null),
  };
}

/** Reconstruye el traslado de un (módulo, corrida), agrupado por camión.
 *
 *  ⚠⚠ EL GRUPO ES (VIAJE, PLACA), NO SÓLO LA PLACA.
 *  Una misma corrida puede salir en MÁS DE UN viaje —dos noches, o dos
 *  camaroneras distintas, cada una con su ficha y su id de `Viaje`— y la barra de
 *  fecha está oculta a propósito en esta vista, así que todos ellos llegan juntos.
 *  Agrupando sólo por placa, los dos viajes del mismo camión caían en la misma
 *  tarjeta y `camionDe` los fundía POR NÚMERO DE PARADA: la parada 1 de un viaje y
 *  la del otro se mezclaban en una sola.
 *
 *  El resultado no era un error visible sino algo peor: la cabecera salía del
 *  primer viaje (fecha, horas, camaronera) y las mediciones del segundo. Medido el
 *  2026-08-26 con dos viajes de la misma corrida —uno con O₂ 7.5 y otro con 3.1—:
 *  el tablero enseñaba 3 paradas en vez de 6, con los horarios del primero, las
 *  lecturas del segundo y una media de 3.1. El viaje bueno desaparecía sin que
 *  nada lo dijera. Los datos de la hoja estaban intactos: el daño era de lectura.
 *
 *  Con un solo viaje —el caso de hoy— esto se comporta exactamente igual que
 *  antes: hay un `Viaje` y el grupo vuelve a ser la placa. */
export function trasladoDe(data, mod, corrida) {
  const filas = filasDe(data, mod, corrida);
  const placas = placasDe(filas);
  const grupos = new Map();
  filas.forEach((r) => {
    const pl = txt(r, TK.placa);
    // Sin placa no hay camión: son las filas que la captura manda en blanco para
    // APAGAR lo que se quitó del viaje. Se descartan aquí igual que antes.
    if (!pl) return;
    // La llave va como JSON de los dos campos: cualquier separador suelto
    // podría aparecer dentro de una placa escrita a mano y unir dos grupos que
    // no son el mismo.
    const k = JSON.stringify([txt(r, TK.viaje), pl]);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  });
  // Orden estable: por placa primero —que es como se ordenaba antes— y dentro de
  // cada placa por fecha, para que dos viajes del mismo camión salgan en el orden
  // en que ocurrieron y no en el que la hoja los devuelva.
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const camiones = [...grupos.values()].map((fs) => camionDe(fs))
    .sort((a, b) => cmp(a.placa, b.placa) || cmp(a.fecha, b.fecha) || cmp(a.viaje, b.viaje));
  const todasAct = camiones.flatMap((c) => c.paradas.flatMap((p) => Object.values(p.tinas).map((t) => t.act)));
  const todoO2 = camiones.flatMap((c) => c.paradas.flatMap((p) => Object.values(p.tinas).map((t) => t.o2))).filter((v) => v !== null);
  const todoTemp = camiones.flatMap((c) => c.paradas.flatMap((p) => Object.values(p.tinas).map((t) => t.temp))).filter((v) => v !== null);
  return {
    modulo: String(mod || ''),
    corrida: corrida == null || corrida === '' ? null : String(corrida),
    hayDatos: filas.length > 0,
    nFilas: filas.length,
    placas,
    camiones,
    // Totales del conjunto, para los KPIs de cabecera.
    o2: prom(todoO2),
    temp: prom(todoTemp),
    actividad: actividadDe(todasAct),
    /* ⚠ Aquí NO hay conteo de observaciones a propósito. Son de la PARADA y los
       camiones del viaje las comparten, así que el número sólo significa algo
       DENTRO de un viaje: lo lleva `viajesDe`, que es de donde lo lee el KPI.
       Un `nObservaciones` de todo el conjunto llegó a existir aquí y se quedó sin
       lector; sobrevivía en verde porque sólo lo miraban las pruebas, y un banco de
       mutaciones lo delató. Se quitó el 2026-08-26. */
    // El check es del VIAJE, no del camión: se resume como «cuántos camiones lo
    // llevan completo», que es la pregunta que se hace el supervisor.
    insumosCompletos: camiones.filter((c) => c.insumos.completo).length,
    checkCompletos: camiones.filter((c) => c.check.completo).length,
  };
}

/* ══════════════════════════════════════════════════════════
   ANALÍTICA DE LAS VISTAS POR PARÁMETRO
   Δ entre paradas, resumen por tina y escala de color relativa.
   ══════════════════════════════════════════════════════════ */

/** Δ de la media de cada parada respecto a la ANTERIOR. La primera no tiene Δ:
 *  se devuelve `null`, no 0 — un 0 diría «no cambió», y no es lo mismo. */
export function deltasDe(paradas, campo) {
  return (paradas || []).map((p, i) => {
    const media = campo === 'temp' ? p.temp : p.o2;
    const prev = i === 0 ? null : (campo === 'temp' ? paradas[i - 1].temp : paradas[i - 1].o2);
    return {
      revision: p.revision,
      hora: p.hora,
      lugar: p.lugar,
      media,
      delta: (media === null || prev === null) ? null : media - prev,
    };
  });
}

/** Resumen POR TINA a lo largo del viaje: media, mínimo, máximo y RECORRIDO.
 *  El recorrido (máx − mín) es lo que delata una tina inestable aunque su media
 *  parezca normal — el caso de la tina que se desploma en una sola parada. */
export function resumenPorTina(camion, campo) {
  const out = {};
  (camion.tinas || []).forEach((t) => {
    const vals = (camion.paradas || [])
      .map((p) => (p.tinas[t] || {})[campo])
      .filter((v) => v !== null && v !== undefined);
    if (!vals.length) { out[t] = { tina: t, media: null, min: null, max: null, recorrido: null }; return; }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    out[t] = { tina: t, media: prom(vals), min, max, recorrido: max - min };
  });
  return out;
}

/** Todos los valores de un campo en un camión, para fijar la escala. */
export function valoresDe(camion, campo) {
  return (camion.paradas || [])
    .flatMap((p) => Object.values(p.tinas).map((x) => x[campo]))
    .filter((v) => v !== null && v !== undefined);
}

/** Escala RELATIVA al propio viaje: mínimo, máximo y mediana observados.
 *  ⚠ No hay cortes absolutos porque la «tabla referencial de parámetros de
 *  despacho» del procedimiento NO está disponible, y fijarlos a ojo sería peor
 *  que no ponerlos: pintaría de rojo lo que quizá es normal. Decisión del
 *  usuario, 2026-08-23. */
export function escalaDe(valores) {
  if (!valores || !valores.length) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const n = ord.length;
  const mediana = n % 2 ? ord[(n - 1) / 2] : (ord[n / 2 - 1] + ord[n / 2]) / 2;
  return { min: ord[0], max: ord[n - 1], mediana, n };
}

/** Nivel 0-3 de un valor dentro de su escala. 0 = lo que hay que mirar.
 *
 *  🔑 La DIRECCIÓN cambia según el parámetro, y no es un detalle:
 *   · `mas-mejor` (oxígeno): más alto es mejor, así que lo BAJO se marca.
 *   · `centro` (temperatura): no hay un «más es mejor». Lo que llama la atención
 *     es alejarse de lo habitual del viaje, en cualquiera de los dos sentidos.
 *     Tratar la temperatura como «más es mejor» pintaría de verde la tina más
 *     caliente del camión, que es justo la que hay que mirar. */
export function nivelDe(valor, escala, direccion) {
  if (valor === null || valor === undefined || !escala) return null;
  const rango = escala.max - escala.min;
  if (rango === 0) return 3;                     // todo igual: nada que destacar
  if (direccion === 'centro') {
    // Distancia a la mediana, normalizada por la mayor distancia posible.
    const lejosMax = Math.max(escala.max - escala.mediana, escala.mediana - escala.min) || 1;
    const t = Math.abs(valor - escala.mediana) / lejosMax;
    return t >= 0.75 ? 0 : t >= 0.5 ? 1 : t >= 0.25 ? 2 : 3;
  }
  const t = (valor - escala.min) / rango;
  return t >= 0.75 ? 3 : t >= 0.5 ? 2 : t >= 0.25 ? 1 : 0;
}

/** La tina con mayor recorrido: la más inestable del camión. */
export function tinaMasInestable(resumen) {
  const arr = Object.values(resumen || {}).filter((x) => x.recorrido !== null);
  if (!arr.length) return null;
  return arr.reduce((a, b) => (b.recorrido > a.recorrido ? b : a));
}
