/* ============================================================
   SUPERVISOR · el PDF del viaje de Traslado

   Lo que estas pruebas vigilan de verdad —y por qué cada una existe:

   1. QUE EL PAPEL DIGA LO MISMO QUE LA HOJA. El documento se arma desde la misma
      capa de datos que pinta la vista (`trasladoDe` → `viajesDe`), así que basta
      con comprobar que no INVENTA ni PIERDE nada por el camino. Un PDF con datos
      plausibles pero equivocados es peor que no tenerlo: se usa para reclamar.
   2. QUE SEA DE UN SOLO VIAJE. Mezclar dos traslados repetiría el número de parada
      con horas distintas — es el defecto que se corrigió en el tablero el 08-26 y
      no puede volver por la puerta del papel.
   3. QUE NO IMPRIMA TINAS QUE NO VIAJARON. La ficha tiene ocho; el camión lleva
      las que lleva.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { buildTrasladoPayload } from '../registros/lib/ficha-traslado.schema.js';
import { trasladoDe, viajesDe } from './traslado.data.js';
import { buildTrasladoPdfDoc } from './trasladoPdf.js';

function aFilas(payload) {
  return payload.rows.map((r) => {
    const o = { _SheetOrigin: 'Registro_Traslado' };
    payload.headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

const tinasDe = (o2, temp, act, off) => Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8].filter((t) => !(off || []).includes(t))
    .map((t) => ([t, { o2, temp, act, alim: 'Artemia' }])),
);

function viaje(opts) {
  const o = opts || {};
  const nCam = o.nCam || 1;
  const off = o.tinasOff || [];
  const camiones = [{ placa: 'GSA-1147', tinasOff: off }];
  if (nCam > 1) camiones.push({ placa: 'PBX-0392', tinasOff: [] });
  const HORAS = ['20:30', '22:00', '23:30', '01:00'];
  const LUGARES = ['Laboratorio', 'Peaje 1', 'Gabarra 1', 'Camaronera'];
  return {
    id: o.viajeId || 'tv1',
    data: {
      fecha: o.fecha || '2026-08-18',
      corrida: '555', modulo: 'M07',
      camaronera: o.camaronera || 'Puná 1',
      salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
      insumos: ['Artemia'], check: ['Oxigenómetro'],
      controlador: 'Juanito', chequeador: 'Pepito', recepcion: 'María',
      camiones,
      revisiones: [0, 1, 2, 3].map((i) => ({
        hora: HORAS[i], lugar: LUGARES[i],
        lat: -2.2135 - i * 0.01, lon: -80.9791 - i * 0.01, precision: 12, ubicacion: 'x',
        horaRegistro: '2026-08-18T20:30:07',
        obs: (o.obsEn || []).includes(i) ? 'Tracto digestivo vacío.' : '',
        camiones: camiones.map((c, ci) => ({
          tinas: tinasDe(7.6 - i * 0.2 - ci * 0.5, 26 - i, 'Alta', ci === 0 ? off : []),
        })),
      })),
    },
  };
}

const viajesDeFilas = (filas) => viajesDe(trasladoDe(filas, 'M07', '555').camiones);
const unViaje = (opts) => viajesDeFilas(aFilas(buildTrasladoPayload(viaje(opts))))[0];

describe('PDF del viaje · estructura del documento', () => {
  it('🔴 una sección por camión, y el salto de página NO va antes del primero', () => {
    // Con el salto delante de todos, el documento abre con una hoja en blanco.
    const doc = buildTrasladoPdfDoc(unViaje({ nCam: 2 }));
    expect(doc.camiones).toBe(2);
    expect(doc.page.split('class="tv-ctit"').length - 1, 'tiene que haber una cabecera por camión').toBe(2);
    expect(doc.page.split('class="brk"').length - 1, 'un salto de página, no dos').toBe(1);
    expect(doc.page.indexOf('class="brk"'), 'el salto se coló antes del primer camión')
      .toBeGreaterThan(doc.page.indexOf('GSA-1147'));
  });

  it('🔴 las tres matrices de cada camión, y la cabecera del viaje', () => {
    const doc = buildTrasladoPdfDoc(unViaje({}), { mod: 'M07', corrida: '555' });
    ['Oxígeno disuelto', 'Temperatura', 'Actividad'].forEach((t) => {
      expect(doc.page, 'falta la matriz de ' + t).toContain(t);
    });
    expect(doc.page).toContain('Puná 1');
    expect(doc.page).toContain('2026-08-18');
    expect(doc.page).toContain('M07');
    // Las firmas del camión: sin ellas el papel no sirve para entregar nada.
    ['Juanito', 'Pepito', 'María'].forEach((f) => expect(doc.page).toContain(f));
  });

  it('un viaje sin camiones no produce documento', () => {
    const doc = buildTrasladoPdfDoc({ viaje: 'x', fecha: '', camaronera: '', camiones: [], placas: [] });
    expect(doc.camiones).toBe(0);
    expect(doc.page).toBe('');
  });

  it('🔴 el nombre del archivo identifica el viaje y NO rompe el sistema de archivos', () => {
    const doc = buildTrasladoPdfDoc(unViaje({}), { mod: 'M07', corrida: '555' });
    expect(doc.fileName).toContain('M07');
    expect(doc.fileName).toContain('2026-08-18');

    /* ⚠ Y ahora con un módulo que SÍ trae caracteres prohibidos. Sin este caso la
       prueba no probaba nada: el fixture normal jamás los lleva, así que quitar el
       saneado ENTERO la dejaba en verde. Lo delató el banco de mutaciones (S07), que
       es exactamente para lo que existe. */
    const sucio = buildTrasladoPdfDoc(unViaje({}), { mod: 'M07/A:B*C?D"E<F>G|H', corrida: '555' });
    expect(sucio.fileName, 'el nombre llegó con caracteres que el sistema rechaza')
      .not.toMatch(/[\\/:*?"<>|]/);
    expect(sucio.fileName, 'el saneado se llevó por delante el módulo entero').toContain('M07');
  });
});

describe('PDF del viaje · sólo lo que viajó', () => {
  it('🔴 imprime las tinas del camión, no las ocho de la ficha', () => {
    // El camión lleva 5: apagadas la 6, 7 y 8. Un papel con T6..T8 diría que
    // viajaron tinas que no iban.
    const doc = buildTrasladoPdfDoc(unViaje({ tinasOff: [6, 7, 8] }));
    ['<th>T1</th>', '<th>T5</th>'].forEach((th) => expect(doc.page).toContain(th));
    ['<th>T6</th>', '<th>T7</th>', '<th>T8</th>'].forEach((th) => {
      expect(doc.page, 'se imprimió una tina que no viajaba: ' + th).not.toContain(th);
    });
  });

  it('🔴 la media divide entre las tinas MEDIDAS, no entre las que lleva', () => {
    /* ⚠⚠ EL FIXTURE TIENE QUE TENER TINAS SIN MEDIR o la prueba no distingue nada:
       con las ocho medidas, `nums.length` y `tinas.length` valen lo mismo y cambiar
       el divisor no mueve el resultado. La primera versión de esta prueba cayó justo
       ahí y el banco la delató (S03).

       Aquí el camión lleva 8 tinas y en la primera parada sólo se midieron DOS,
       a 7.00 y 8.00. La media honesta es 7.50. Dividiendo entre las 8 que lleva
       saldría 1.88: el papel diría que el oxígeno se desplomó cuando lo que pasó
       es que faltaron lecturas. */
    const v = viaje({});
    const medidas = { 1: 7.0, 2: 8.0 };
    v.data.revisiones[0].camiones[0].tinas = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].map((t) => ([t, { o2: medidas[t] ?? '', temp: 26, act: 'Alta', alim: 'Artemia' }])),
    );
    const doc = buildTrasladoPdfDoc(viajesDeFilas(aFilas(buildTrasladoPayload(v)))[0]);
    expect(doc.page, 'la media no es la de las tinas MEDIDAS').toContain('7.50');
    expect(doc.page, 'la media se calculó dividiendo entre las tinas que lleva').not.toContain('1.88');
  });

  it('🔴 el documento es de UN viaje: no se cuela el otro', () => {
    const v1 = viaje({});
    const v2 = viaje({ viajeId: 'tvDOS', fecha: '2026-08-28', camaronera: 'Taura' });
    const filas = aFilas(buildTrasladoPayload(v1)).concat(aFilas(buildTrasladoPayload(v2)));
    const viajes = viajesDeFilas(filas);
    expect(viajes, 'el fixture no tiene dos viajes: no probaría nada').toHaveLength(2);

    const doc = buildTrasladoPdfDoc(viajes[0]);
    expect(doc.page).toContain('Puná 1');
    expect(doc.page, 'se coló el destino del otro viaje').not.toContain('Taura');
    expect(doc.page, 'se coló la fecha del otro viaje').not.toContain('2026-08-28');
  });
});

describe('PDF del viaje · los tiempos y las observaciones', () => {
  it('🔴 el TOTAL del viaje va en cabecera, pero NO el desglose tramo a tramo', () => {
    /* El usuario pidió quitar el tramo a tramo del papel (2026-08-27): eso se mira
       en el tablero, que es donde se decide. Los dos totales sí se quedan — sin ellos
       el papel no diría cuánto duró el viaje— y salen del MISMO `tiempoDe` que el
       modal, así que la regla de la medianoche no se reimplementa aquí.
       20:30 → 01:00 son 4 h 30 min en ruta; 20:30 → 06:00, 9 h 30 puerta a puerta. */
    const doc = buildTrasladoPdfDoc(unViaje({}));
    expect(doc.page, 'falta el tiempo en ruta').toContain('4 h 30 min');
    expect(doc.page, 'falta el puerta a puerta').toContain('9 h 30 min');

    // Y la tabla de tramos NO puede volver por descuido.
    expect(doc.page, 'volvió el desglose tramo a tramo').not.toContain('tramo a tramo');
    expect(doc.page, 'volvió la tabla de hitos').not.toContain('<th>Hito</th>');
  });

  it('🔴 una observación de parada sale UNA vez, no una por camión', () => {
    // Es de la parada y viaja repetida en las filas de todos los camiones.
    const doc = buildTrasladoPdfDoc(unViaje({ nCam: 2, obsEn: [1] }));
    const veces = doc.page.split('Tracto digestivo').length - 1;
    expect(veces, 'la misma observación se imprimió más de una vez').toBe(1);
  });

  it('escapa el contenido que viene de la hoja', () => {
    const v = viaje({});
    v.data.camaronera = '<script>alert(1)</script>';
    const doc = buildTrasladoPdfDoc(viajesDeFilas(aFilas(buildTrasladoPayload(v)))[0]);
    expect(doc.page, 'el marcado de la hoja llegó crudo al documento')
      .not.toContain('<script>alert(1)</script>');
    expect(doc.page).toContain('&lt;script&gt;');
  });
});
