/* ============================================================
   SUPERVISOR · Traslado — la agregación

   El fixture NO se teclea a mano: se GENERA con `buildTrasladoPayload`, el mismo
   constructor de payload que usa la app de captura, y se convierte a objetos-fila
   como los que produce la lectura de la hoja. Así, si el esquema cambia de
   columnas, este banco se entera — un fixture inventado seguiría verde mientras la
   vista real se queda vacía.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { buildTrasladoPayload, TRASLADO_HEADERS } from '../registros/lib/ficha-traslado.schema.js';
import {
  trasladoDe, filasDe, placasDe, actividadDe, isTrasladoRow,
  TK, ACTIVIDAD_ORDEN, INSUMOS_POSIBLES, CHECK_POSIBLES,
  deltasDe, resumenPorTina, valoresDe, escalaDe, nivelDe, tinaMasInestable,
  tiempoDe, fmtMinutos, paradasDelViaje,
} from './traslado.data.js';

/* ── De payload a filas de hoja, como las leería el tablero ── */
function aFilas(payload) {
  return payload.rows.map((r) => {
    const o = { _SheetOrigin: 'Registro_Traslado' };
    payload.headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

const tinasDe = (o2, temp, act) => Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8].map((t) => ([t, { o2, temp, act, alim: 'Artemia' }])),
);

/** Un viaje real: 1-2 camiones, 4 paradas, 8 tinas. */
function viaje(opts) {
  const o = opts || {};
  const nCam = o.nCam || 1;
  const camiones = [{ placa: 'GSA-1147', tinasOff: [] }];
  if (nCam > 1) camiones.push({ placa: 'PBX-0392', tinasOff: [] });
  const HORAS = ['20:30', '22:00', '23:30', '01:00'];
  const LUGARES = ['Laboratorio', 'Peaje 1', 'Gabarra 1', 'Camaronera'];
  return {
    id: o.viajeId || 'tv1',
    data: {
      fecha: '2026-08-18',
      corrida: o.corrida || '555',
      modulo: o.modulo || 'M07',
      camaronera: 'Puná 1',
      salinidad: '31.5',
      horaSalida: '20:30',
      horaLlegada: '06:00',
      insumos: o.insumos || ['Artemia', 'Flake', 'Prokura', 'Vitamina C'],
      check: o.check || ['Oxigenómetro', 'Linterna', 'Bandeja', 'Esfero'],
      controlador: 'Juanito', chequeador: 'Pepito', recepcion: 'María',
      camiones,
      revisiones: [0, 1, 2, 3].map((i) => ({
        hora: HORAS[i],
        lugar: LUGARES[i],
        lat: -2.2135 - i * 0.01,
        lon: -80.9791 - i * 0.01,
        precision: 12,
        ubicacion: 'x',
        horaRegistro: '2026-08-18T20:30:07',
        obs: (o.obsEn || []).includes(i) ? 'Tracto digestivo vacío.' : '',
        camiones: camiones.map((_, ci) => ({
          // O2 baja parada a parada; el 2.º camión va 0,5 por debajo.
          tinas: tinasDe(7.6 - i * 0.2 - ci * 0.5, 26 - i, (o.acts || ['Alta', 'Alta', 'Normal', 'Media'])[i]),
        })),
      })),
    },
  };
}

const filasDeViaje = (opts) => aFilas(buildTrasladoPayload(viaje(opts)));

/* ══════════════════════════════════════════════════════════ */

describe('Traslado · reconocer y filtrar las filas', () => {
  it('reconoce una fila de traslado por su origen', () => {
    const [f] = filasDeViaje();
    expect(isTrasladoRow(f)).toBe(true);
    expect(isTrasladoRow({ _SheetOrigin: 'Registro_Supervisión', Módulo: 'M07' })).toBe(false);
    expect(isTrasladoRow(null)).toBe(false);
  });

  it('🔴 el Módulo de la hoja usa la MISMA grafía corta que el tablero', () => {
    // Es la costura que dejaría la vista vacía para siempre: producción tiene «M07»
    // en Datos Larvicultura, y la ficha escribe «M07», no «Módulo 7».
    const filas = filasDeViaje();
    expect(filas[0][TK.modulo]).toBe('M07');
    expect(filasDe(filas, 'M07', '555')).toHaveLength(32);
    expect(filasDe(filas, 'Módulo 7', '555'), 'la grafía larga NO debe casar').toHaveLength(0);
  });

  it('🔴 la Corrida casa aunque venga como número y se pida como texto', () => {
    // La hoja la guarda NUMÉRICA; el estado de la vista la lleva como cadena.
    const filas = filasDeViaje();
    expect(typeof filas[0][TK.corrida]).toBe('number');
    expect(filasDe(filas, 'M07', '555')).toHaveLength(32);
    expect(filasDe(filas, 'M07', 555)).toHaveLength(32);
    expect(filasDe(filas, 'M07', '444')).toHaveLength(0);
  });

  it('sin corrida devuelve todas las del módulo', () => {
    const filas = [...filasDeViaje({ corrida: '555' }), ...filasDeViaje({ corrida: '444', viajeId: 'tv2' })];
    expect(filasDe(filas, 'M07', null)).toHaveLength(64);
    expect(filasDe(filas, 'M07', '444')).toHaveLength(32);
  });

  it('no mezcla módulos', () => {
    const filas = [...filasDeViaje({ modulo: 'M07' }), ...filasDeViaje({ modulo: 'M08', viajeId: 'tv2' })];
    expect(filasDe(filas, 'M07', '555')).toHaveLength(32);
    expect(placasDe(filasDe(filas, 'M08', '555'))).toEqual(['GSA-1147']);
  });
});

describe('Traslado · el viaje por camión', () => {
  it('🔴 dos camiones se separan por placa, con sus 4 paradas cada uno', () => {
    const t = trasladoDe(filasDeViaje({ nCam: 2 }), 'M07', '555');
    expect(t.placas).toEqual(['GSA-1147', 'PBX-0392']);
    expect(t.camiones).toHaveLength(2);
    t.camiones.forEach((c) => {
      expect(c.nParadas).toBe(4);
      expect(c.tinas).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  it('🔴 el promedio de O2 NO mezcla los dos camiones', () => {
    // El 2.º va 0,5 mg/L por debajo. Si se promediara todo junto, el aviso de un
    // camión en problemas quedaría diluido por el otro — que es justo lo que el
    // supervisor necesita ver separado.
    const t = trasladoDe(filasDeViaje({ nCam: 2 }), 'M07', '555');
    const [a, b] = t.camiones;
    expect(a.o2.promedio).toBeCloseTo(7.3, 5);     // 7.6,7.4,7.2,7.0
    expect(b.o2.promedio).toBeCloseTo(6.8, 5);     // 0,5 por debajo
    expect(a.o2.promedio - b.o2.promedio).toBeCloseTo(0.5, 5);
  });

  it('promedio por TINA y por camión', () => {
    const t = trasladoDe(filasDeViaje({ nCam: 2 }), 'M07', '555');
    const c = t.camiones[0];
    expect(Object.keys(c.o2.porTina)).toHaveLength(8);
    // Todas las tinas llevan el mismo valor en el fixture: el promedio por tina
    // coincide con el del camión.
    Object.values(c.o2.porTina).forEach((v) => expect(v).toBeCloseTo(7.3, 5));
    Object.values(c.temp.porTina).forEach((v) => expect(v).toBeCloseTo(24.5, 5));
  });

  it('🔴 los datos del VIAJE se leen una vez, no se promedian 32 veces', () => {
    // La hoja repite fecha/camaronera/responsables en las 32 filas. Si se contaran
    // como mediciones, cualquier conteo saldría multiplicado por 32.
    const t = trasladoDe(filasDeViaje(), 'M07', '555');
    const c = t.camiones[0];
    expect(c.camaronera).toBe('Puná 1');
    expect(c.chequeador).toBe('Pepito');
    expect(c.horaSalida).toBe('20:30');
    expect(c.salinidad).toBe(31.5);
  });

  it('cada parada conserva su hora, lugar y coordenadas', () => {
    const t = trasladoDe(filasDeViaje(), 'M07', '555');
    const p = t.camiones[0].paradas;
    expect(p.map((x) => x.revision)).toEqual([1, 2, 3, 4]);
    expect(p.map((x) => x.hora)).toEqual(['20:30', '22:00', '23:30', '01:00']);
    expect(p[0].lugar).toBe('Laboratorio');
    expect(p[3].lugar).toBe('Camaronera');
  });

  it('🔴 la LONGITUD NEGATIVA sobrevive a la agregación', () => {
    // Ecuador está a longitud negativa. Un signo perdido pondría los puntos del
    // mapa al otro lado del planeta, sin error visible.
    const t = trasladoDe(filasDeViaje(), 'M07', '555');
    const p0 = t.camiones[0].paradas[0];
    expect(p0.lat).toBeCloseTo(-2.2135, 6);
    expect(p0.lon).toBeCloseTo(-80.9791, 6);
    expect(p0.lon).toBeLessThan(0);
  });
});

describe('Traslado · actividad, observaciones y checklists', () => {
  it('🔴 la categoría dominante es la más frecuente', () => {
    // Fixture: 2 paradas «Alta», 1 «Normal», 1 «Media», × 8 tinas.
    const t = trasladoDe(filasDeViaje(), 'M07', '555');
    const a = t.camiones[0].actividad;
    expect(a.conteo).toEqual({ Alta: 16, Normal: 8, Media: 8, Baja: 0 });
    expect(a.moda).toBe('Alta');
    expect(a.total).toBe(32);
  });

  it('🔴 un empate se SEÑALA en vez de elegir en silencio', () => {
    // Decidir a la callada entre «Alta» y «Baja» sería inventarse una lectura.
    const a = actividadDe(['Alta', 'Baja']);
    expect(a.empate).toBe(true);
    const b = actividadDe(['Alta', 'Alta', 'Baja']);
    expect(b.empate).toBe(false);
    expect(b.moda).toBe('Alta');
  });

  it('sin actividad registrada no se inventa una moda', () => {
    const a = actividadDe(['', '', null]);
    expect(a.moda).toBeNull();
    expect(a.total).toBe(0);
  });

  it('🔴 sólo cuenta las paradas CON observación, no las vacías', () => {
    const t = trasladoDe(filasDeViaje({ obsEn: [0, 2] }), 'M07', '555');
    expect(t.camiones[0].nObservaciones).toBe(2);
    expect(t.camiones[0].observaciones.map((o) => o.revision)).toEqual([1, 3]);
    expect(t.camiones[0].observaciones[0].texto).toContain('Tracto digestivo');
  });

  it('🔴 el cumplimiento del check dice QUÉ falta, no sólo cuántos', () => {
    const t = trasladoDe(filasDeViaje({ check: ['Oxigenómetro', 'Linterna'] }), 'M07', '555');
    const c = t.camiones[0].check;
    expect(c.n).toBe(2);
    expect(c.total).toBe(4);
    expect(c.completo).toBe(false);
    expect(c.faltan).toEqual(['Bandeja', 'Esfero']);
  });

  it('un checklist completo se marca como completo', () => {
    const t = trasladoDe(filasDeViaje(), 'M07', '555');
    expect(t.camiones[0].insumos.completo).toBe(true);
    expect(t.camiones[0].check.completo).toBe(true);
    expect(t.insumosCompletos).toBe(1);
    expect(t.checkCompletos).toBe(1);
  });

  it('los catálogos coinciden con los de la ficha de captura', () => {
    // Están duplicados a propósito (este módulo no puede importar del monolito).
    expect(ACTIVIDAD_ORDEN).toEqual(['Alta', 'Normal', 'Media', 'Baja']);
    expect(INSUMOS_POSIBLES).toHaveLength(4);
    expect(CHECK_POSIBLES).toHaveLength(4);
    expect(TRASLADO_HEADERS).toContain(TK.o2);
    expect(TRASLADO_HEADERS).toContain(TK.act);
    Object.values(TK).forEach((h) => expect(TRASLADO_HEADERS, 'columna fuera del esquema: ' + h).toContain(h));
  });
});

describe('Traslado · sin datos', () => {
  it('un módulo sin traslados no revienta y lo dice', () => {
    const t = trasladoDe([], 'M07', '555');
    expect(t.hayDatos).toBe(false);
    expect(t.placas).toEqual([]);
    expect(t.camiones).toEqual([]);
    expect(t.o2).toBeNull();
    expect(t.actividad.moda).toBeNull();
    expect(t.nObservaciones).toBe(0);
  });

  it('🔴 una parada sin GPS no se inventa un punto en el mapa', () => {
    const filas = filasDeViaje();
    filas.forEach((f) => { if (f[TK.revision] === 2) { f[TK.lat] = ''; f[TK.lon] = ''; } });
    const t = trasladoDe(filas, 'M07', '555');
    expect(t.camiones[0].paradas).toHaveLength(4);
    expect(t.camiones[0].puntos, 'se pintó un punto sin coordenadas').toHaveLength(3);
    expect(t.camiones[0].puntos.map((p) => p.revision)).toEqual([1, 3, 4]);
  });

  it('una tina sin medir no arrastra el promedio a cero', () => {
    const filas = filasDeViaje();
    filas.forEach((f) => { if (f[TK.tina] === 1) f[TK.o2] = ''; });
    const t = trasladoDe(filas, 'M07', '555');
    // Las 7 tinas restantes siguen dando 7,3: el vacío se ignora, no vale 0.
    expect(t.camiones[0].o2.promedio).toBeCloseTo(7.3, 5);
    expect(t.camiones[0].o2.porTina['1']).toBeUndefined();
  });
});

describe('Traslado · analítica de las vistas por parámetro', () => {
  const cam = () => trasladoDe(filasDeViaje({ nCam: 1 }), 'M07', '555').camiones[0];

  it('🔴 el Δ compara con la parada ANTERIOR, y la primera no tiene', () => {
    // Un 0 en la primera diría «no cambió»; y no es lo mismo que «no hay con qué
    // comparar». Por eso es null.
    const d = deltasDe(cam().paradas, 'o2');
    expect(d).toHaveLength(4);
    expect(d[0].delta, 'la primera parada se inventó un Δ').toBeNull();
    expect(d[1].delta).toBeCloseTo(-0.2, 5);
    expect(d[2].delta).toBeCloseTo(-0.2, 5);
    expect(d.slice(1).every((x) => x.delta < 0)).toBe(true);
  });

  it('🔴 el resumen por tina trae media, mínimo, máximo y RECORRIDO', () => {
    // Es el promedio «por tina y carro» que se pidió y que no se estaba enseñando.
    const r = resumenPorTina(cam(), 'o2');
    expect(Object.keys(r)).toHaveLength(8);
    expect(r[1].media).toBeCloseTo(7.3, 5);
    expect(r[1].max).toBeCloseTo(7.6, 5);
    expect(r[1].min).toBeCloseTo(7.0, 5);
    expect(r[1].recorrido).toBeCloseTo(0.6, 5);
  });

  it('🔴 el RECORRIDO delata la tina inestable aunque su media parezca normal', () => {
    // El caso real: una tina que se desploma en una sola parada. Su media apenas se
    // mueve, pero su recorrido se dispara.
    const filas = filasDeViaje({ nCam: 1 });
    filas.forEach((f) => { if (f[TK.tina] === 6 && f[TK.revision] === 4) f[TK.o2] = 3.0; });
    const c = trasladoDe(filas, 'M07', '555').camiones[0];
    const r = resumenPorTina(c, 'o2');
    expect(r[6].recorrido).toBeGreaterThan(r[1].recorrido * 3);
    expect(tinaMasInestable(r).tina).toBe(6);
  });

  it('la escala sale del propio viaje: mínimo, máximo y mediana observados', () => {
    const e = escalaDe(valoresDe(cam(), 'o2'));
    expect(e.min).toBeCloseTo(7.0, 5);
    expect(e.max).toBeCloseTo(7.6, 5);
    expect(e.n).toBe(32);
    expect(e.mediana).toBeGreaterThanOrEqual(e.min);
    expect(e.mediana).toBeLessThanOrEqual(e.max);
  });

  it('🔴 en OXÍGENO lo bajo es lo que se marca (más es mejor)', () => {
    const e = escalaDe([6, 7, 8, 9, 10]);
    expect(nivelDe(6, e, 'mas-mejor'), 'el mínimo debería ser el nivel de alerta').toBe(0);
    expect(nivelDe(10, e, 'mas-mejor')).toBe(3);
  });

  it('🔴 en TEMPERATURA se marcan los DOS extremos, no sólo el bajo', () => {
    // No hay un «más es mejor» en temperatura. Tratarla como el oxígeno pintaría de
    // verde la tina más caliente del camión, que es justo la que hay que mirar.
    const e = escalaDe([22, 25, 26, 26, 27, 30]);
    expect(nivelDe(30, e, 'centro'), 'la más caliente salió como buena').toBe(0);
    expect(nivelDe(22, e, 'centro'), 'la más fría salió como buena').toBe(0);
    expect(nivelDe(26, e, 'centro')).toBe(3);
  });

  it('con todos los valores iguales no se inventa una alerta', () => {
    const e = escalaDe([26, 26, 26]);
    expect(nivelDe(26, e, 'mas-mejor')).toBe(3);
    expect(nivelDe(26, e, 'centro')).toBe(3);
  });

  it('sin datos, ni escala ni nivel ni tina inestable', () => {
    expect(escalaDe([])).toBeNull();
    expect(nivelDe(7, null, 'mas-mejor')).toBeNull();
    expect(nivelDe(null, { min: 1, max: 2, mediana: 1.5 }, 'mas-mejor')).toBeNull();
    expect(tinaMasInestable({})).toBeNull();
  });
});

describe('Traslado · las filas apagadas no son una parada', () => {
  /* Cuando se retira un camión o una parada de un viaje YA sincronizado, la app de
     captura vuelve a mandar esas llaves con TODO en blanco menos el ID, para
     apagarlas en la hoja. El tablero no puede pintarlas como una parada: sería
     inventar que el camión paró en algún sitio y no midió nada. */
  it('una fila sin nada más que el ID no crea una parada', () => {
    const v = viaje({ nCam: 1 });
    const filas = aFilas(buildTrasladoPayload(v));
    const conParadas = trasladoDe(filas, 'M07', '555');
    const nAntes = conParadas.camiones[0].nParadas;
    expect(nAntes, 'el fixture no tiene paradas: no probaría nada').toBeGreaterThan(1);

    // Se apaga la ÚLTIMA parada, como haría el apagado real: mismas columnas, todas
    // vacías salvo el identificador y las que identifican la fila en la hoja.
    const ultima = String(conParadas.camiones[0].paradas[nAntes - 1].revision);
    const apagadas = filas.map((f) => {
      if (String(f[TK.revision]) !== ultima) return f;
      const o = { _SheetOrigin: 'Registro_Traslado' };
      TRASLADO_HEADERS.forEach((h) => { o[h] = ''; });
      // El módulo y la placa se conservan a propósito: es el caso PEOR, el que
      // llegaría a la vista. Si se filtrara sólo por módulo vacío, esto pasaría.
      // ⚠ La CORRIDA también se conserva. La primera versión la dejaba en blanco y
      // entonces `filasDe` descartaba la fila por estar fuera de alcance: la regla
      // que se quería probar no llegaba a ejecutarse y la prueba pasaba en verde
      // aunque se quitara. Lo cazó la mutación M11.
      // ⚠ El VIAJE se conserva por el MISMO motivo que la corrida. Desde el
      // 2026-08-26 el tablero agrupa por (Viaje, Placa) —dos traslados de la misma
      // corrida ya no se funden en una tarjeta—, así que una fila con la placa
      // puesta pero el viaje en blanco caería en OTRO grupo, y la parada seguiría
      // viva por una razón que NO es la regla que aquí se prueba. La prueba pasaría
      // o fallaría por el motivo equivocado.
      o[TK.modulo] = f[TK.modulo]; o[TK.placa] = f[TK.placa]; o[TK.corrida] = f[TK.corrida];
      o[TK.viaje] = f[TK.viaje];
      o[TK.revision] = f[TK.revision]; o[TK.tina] = f[TK.tina];
      o[TK.id] = f[TK.id];
      return o;
    });

    const t = trasladoDe(apagadas, 'M07', '555');
    expect(t.camiones[0].nParadas, 'la parada apagada se sigue pintando').toBe(nAntes - 1);
  });

  it('una parada registrada pero AÚN sin medir sí se pinta', () => {
    // La regla no puede pasarse de lista: una parada con hora y lugar donde todavía
    // no se ha medido nada ES una parada, y esconderla ocultaría trabajo hecho.
    const v = viaje({ nCam: 1 });
    const filas = aFilas(buildTrasladoPayload(v));
    const rev1 = filas.filter((f) => String(f[TK.revision]) === '1');
    rev1.forEach((f) => { f[TK.o2] = ''; f[TK.temp] = ''; f[TK.act] = ''; f[TK.alim] = ''; });
    const t = trasladoDe(filas, 'M07', '555');
    expect(t.camiones[0].paradas.some((p) => String(p.revision) === '1')).toBe(true);
  });
});

describe('Traslado · el tiempo del viaje', () => {
  /* Un camión no es más que sus paradas: aquí se construyen a mano para poder fijar
     horas concretas, que es lo único que mide este cálculo. */
  const camion = (horas, extra) => Object.assign({
    horaSalida: '20:30',
    horaLlegada: '06:00',
    paradas: horas.map((h, i) => ({ revision: i + 1, hora: h, lugar: 'Parada ' + (i + 1) })),
  }, extra || {});

  it('🔑 el viaje cruza la MEDIANOCHE y el tiempo no sale negativo', () => {
    // El formato real va de 20:30 a 06:00. Una resta a secas daría -1250 minutos.
    const t = tiempoDe([camion(['23:40', '02:50'])]);
    expect(t.enRuta).toBe(190);
    expect(t.puertaAPuerta).toBe(570);          // 20:30 → 06:00 = 9 h 30
    expect(fmtMinutos(t.enRuta)).toBe('3 h 10 min');
  });

  it('en ruta es de la PRIMERA parada a la ÚLTIMA, no la suma de tramos', () => {
    const t = tiempoDe([camion(['20:45', '22:00', '01:00'])]);
    expect(t.enRuta).toBe(255);                 // 20:45 → 01:00
    expect(t.tramos.map((x) => x.minutos)).toEqual([null, 75, 180]);
  });

  it('🔴 con UNA sola parada el tiempo en ruta es null, no 0', () => {
    // Un 0 diría «no tardó nada», que es una afirmación. Lo que pasa es que no se
    // puede saber: no hay dos horas que restar.
    const t = tiempoDe([camion(['20:45'])]);
    expect(t.enRuta).toBeNull();
    expect(fmtMinutos(t.enRuta)).toBe('—');
  });

  it('🔴 sin horas legibles de salida/llegada, puerta a puerta se calla', () => {
    // Son campos que se teclean libres. Inventar un número con «s/n» dentro sería
    // peor que no dar ninguno.
    const t = tiempoDe([camion(['20:45', '22:00'], { horaLlegada: 's/n' })]);
    expect(t.puertaAPuerta).toBeNull();
    expect(t.posterior).toBeNull();
    expect(t.enRuta).not.toBeNull();            // lo que SÍ se sabe se sigue diciendo
  });

  it('los tiempos muertos son los que explican la diferencia', () => {
    const t = tiempoDe([camion(['21:00', '01:00'])]);
    expect(t.previo).toBe(30);                  // 20:30 → 21:00
    expect(t.posterior).toBe(300);              // 01:00 → 06:00
    expect(t.previo + t.enRuta + t.posterior).toBe(t.puertaAPuerta);
  });

  it('señala los tramos que pasan de la cadencia del protocolo', () => {
    const t = tiempoDe([camion(['20:45', '22:00', '01:00'])]);
    expect(t.fueraDeCadencia).toBe(1);          // el de 3 h
    expect(t.tramos[2].excede).toBe(true);
    expect(t.tramos[1].excede).toBe(false);     // 75 min está dentro
  });

  it('🔑 los camiones PARAN JUNTOS: la parada no se cuenta dos veces', () => {
    const a = camion(['20:45', '22:00']);
    const b = camion(['20:45', '22:00']);
    expect(paradasDelViaje([a, b]).length, 'la parada compartida se duplicó').toBe(2);
    expect(tiempoDe([a, b]).enRuta).toBe(tiempoDe([a]).enRuta);
  });

  it('las paradas se ordenan por REVISIÓN, no por hora', () => {
    // Una hora mal tecleada no puede reordenar el viaje.
    const c = camion(['22:00', '20:45']);
    expect(paradasDelViaje([c]).map((p) => p.revision)).toEqual([1, 2]);
  });

  it('una parada sin hora no rompe el cálculo: se ignora', () => {
    const t = tiempoDe([camion(['20:45', '', '01:00'])]);
    expect(t.paradas.length).toBe(2);
    expect(t.enRuta).toBe(255);
  });

  it('🔴 una hora ilegible se descarta, no se enseña como si fuera una hora', () => {
    // Si «s/n» se colara, el desglose diría «s/n → 06:00» como si fuera un tramo.
    const t = tiempoDe([camion(['20:45', '22:00'], { horaSalida: 's/n' })]);
    expect(t.salida).toBe('');
    expect(t.llegada).toBe('06:00');
    expect(t.previo).toBeNull();
  });

  it('🔑 un tramo que IGUALA la cadencia está dentro; uno que la pasa, no', () => {
    // El protocolo pide no PASAR del tope. Igualarlo cumple.
    const justo = tiempoDe([camion(['20:00', '22:00'])]);        // 120 min exactos
    expect(justo.tramos[1].minutos).toBe(120);
    expect(justo.fueraDeCadencia, 'un tramo de 120 min se marcó como excedido').toBe(0);
    const pasa = tiempoDe([camion(['20:00', '22:01'])]);          // 121
    expect(pasa.fueraDeCadencia).toBe(1);
  });

  it('🔑 si dos camiones discrepan, manda la primera hora LEGIBLE', () => {
    // Los camiones paran juntos: la hora es de la parada. Cuando a uno le falta,
    // la del otro es la buena — quedarse con la vacía perdería el tramo entero.
    const a = camion(['20:45', '22:00']);
    const b = camion(['20:45', '']);
    expect(paradasDelViaje([a, b])[1].hora, 'ganó la hora vacía').toBe('22:00');
    expect(tiempoDe([a, b]).enRuta).toBe(75);
  });

  it('fmtMinutos dice horas y minutos como se leen', () => {
    expect(fmtMinutos(45)).toBe('45 min');
    expect(fmtMinutos(60)).toBe('1 h');
    expect(fmtMinutos(150)).toBe('2 h 30 min');
    expect(fmtMinutos(null)).toBe('—');
  });
});

describe('Traslado · dos viajes de la MISMA corrida no pueden fundirse', () => {
  /* Una corrida puede salir en más de un viaje —dos noches, o dos camaroneras— y
     la barra de fecha está OCULTA a propósito en esta vista, así que los dos
     llegan juntos a `trasladoDe`. Agrupando sólo por placa caían en la misma
     tarjeta y `camionDe` los fundía por NÚMERO de parada: la cabecera salía del
     primer viaje y las mediciones del segundo. No daba error; enseñaba una
     quimera, y el viaje bueno desaparecía sin que nada lo dijera. */
  it('cada viaje conserva su cabecera, sus paradas y sus mediciones', () => {
    const v1 = viaje({ viajeId: 'tvUNO' });
    const v2 = viaje({ viajeId: 'tvDOS' });
    v2.data.fecha = '2026-08-28';
    // El segundo viaje mide MUCHO peor. Si los dos se fundieran, uno taparía al
    // otro y la diferencia sería justo lo que dejaría de verse.
    v2.data.revisiones.forEach((r) => r.camiones.forEach((c) => {
      Object.keys(c.tinas).forEach((k) => { c.tinas[k].o2 = 3.1; });
    }));

    const filas = aFilas(buildTrasladoPayload(v1)).concat(aFilas(buildTrasladoPayload(v2)));
    const t = trasladoDe(filas, 'M07', '555');

    expect(t.camiones.length, 'los dos viajes salen como DOS tarjetas').toBe(2);
    const uno = t.camiones.find((c) => c.viaje === 'tvUNO');
    const dos = t.camiones.find((c) => c.viaje === 'tvDOS');
    expect(uno, 'falta el primer viaje').toBeTruthy();
    expect(dos, 'falta el segundo viaje').toBeTruthy();

    // La cabecera de cada tarjeta es la SUYA, no la del otro viaje.
    expect(uno.fecha).toBe('2026-08-18');
    expect(dos.fecha).toBe('2026-08-28');

    // Y las mediciones también. Éste es el corazón del defecto.
    expect(dos.o2.promedio, 'el viaje malo debe conservar su 3.1').toBeCloseTo(3.1, 5);
    expect(uno.o2.promedio, 'el viaje bueno NO puede llevar el 3.1 del otro')
      .toBeGreaterThan(6);

    // Cada uno con sus cuatro paradas: fundidos salían cuatro en total, no ocho.
    expect(uno.nParadas).toBe(4);
    expect(dos.nParadas).toBe(4);
  });

  it('con UN solo viaje el agrupado sigue siendo el de siempre', () => {
    // La corrección no puede cambiar el caso de hoy: un viaje, dos camiones, una
    // tarjeta por placa.
    const filas = filasDeViaje({ nCam: 2 });
    const t = trasladoDe(filas, 'M07', '555');
    expect(t.camiones.length).toBe(2);
    expect(t.camiones.map((c) => c.placa)).toEqual(['GSA-1147', 'PBX-0392']);
    expect(t.camiones[0].nParadas).toBe(4);
  });
});

describe('Traslado · una observación es de la PARADA, no del camión', () => {
  /* En el esquema, Observaciones tiene grain 'revision': buildTrasladoPayload
     escribe el MISMO texto en las filas de todos los camiones de esa parada.
     Contarlas por camión y sumar multiplicaba el KPI por el nº de camiones —con
     dos camiones, una observación decía «2»—, y pasaba en el viaje normal. */
  it('con dos camiones, UNA observación cuenta UNA vez', () => {
    const unCam = trasladoDe(filasDeViaje({ nCam: 1, obsEn: [1] }), 'M07', '555');
    const dosCam = trasladoDe(filasDeViaje({ nCam: 2, obsEn: [1] }), 'M07', '555');
    expect(unCam.nObservaciones, 'el fixture no tiene observación: no probaría nada').toBe(1);
    expect(dosCam.nObservaciones, 'añadir un camión no añade observaciones').toBe(1);
  });

  it('pero dos VIAJES distintos sí suman las suyas', () => {
    // La deduplicación no puede pasarse de lista: la parada 2 de un viaje y la
    // parada 2 de otro son incidencias distintas aunque compartan número.
    const v2 = viaje({ nCam: 2, obsEn: [1], viajeId: 'tvDOS' });
    v2.data.fecha = '2026-08-28';
    v2.data.revisiones[1].obs = 'Espuma en la tina 3.';
    const filas = filasDeViaje({ nCam: 2, obsEn: [1] })
      .concat(aFilas(buildTrasladoPayload(v2)));
    const t = trasladoDe(filas, 'M07', '555');
    expect(t.nObservaciones).toBe(2);
  });

  it('cada camión sigue llevando la observación de su parada', () => {
    // Deduplicar el CONTEO no puede vaciar la tarjeta: el camión sigue habiendo
    // pasado por esa parada y la observación le concierne.
    const t = trasladoDe(filasDeViaje({ nCam: 2, obsEn: [1] }), 'M07', '555');
    t.camiones.forEach((c) => {
      expect(c.observaciones).toHaveLength(1);
      expect(c.observaciones[0].texto).toContain('Tracto digestivo');
    });
  });
});
