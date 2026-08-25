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
