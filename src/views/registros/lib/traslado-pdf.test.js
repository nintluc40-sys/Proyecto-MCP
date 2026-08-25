/* ============================================================
   REGISTROS · Traslado — el informe PDF del viaje (tanda C, 2026-08-26)

   UN documento con el viaje entero y una sección por CAMIÓN, cada una en su hoja
   (elección del usuario). Lo construye `buildTrasPdfHtml`, que es PURO: no abre
   ventanas ni toca el DOM, y por eso se puede comprobar QUÉ DICE el papel en vez de
   comprobar que se abre una ventana.

   🔑 La propiedad que vigila esta batería: **el papel dice lo MISMO que se
   sincroniza**. Si el PDF enseñara paradas o tinas que no llegan a la hoja —o al
   revés— dejaría de servir para reclamar nada, y nadie se enteraría hasta que
   hiciera falta.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 50));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 50));
  return src.slice(i, j + hasta.length);
}

/* El monolito en una caja: el bloque del payload (de donde salen los helpers) y el
   del documento, que vive detrás. */
function motor() {
  const src = leer(ENGINE);
  const code = bloque(
    src,
    'const TRAS_REC_KEY   = "larv4_tras_records";',
    '  return { sheetName: TRAS_SHEET, headers: TRAS_HEADERS.slice(), rows: rows };\n}',
  ) + '\n' + bloque(src, 'function trasFmtMin(min){', '    + "</body></html>";\n}');
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseFloat, isFinite, isNaN, Set,
    RPRE: 'larv4_recov_',
    sanitizeStr: (s, max) => String(s == null ? '' : s).trim().slice(0, max || 200),
    // El de verdad vive en core; aquí basta con que escape lo mismo.
    escapeHtml: (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(code + '\n;globalThis.__api = { buildTrasPdfHtml, trasFmtMin, buildTrasPayload, TRAS_HEADERS };')
    .runInContext(ctx);
  return ctx.__api;
}

const api = motor();

const tinasDe = (o2, temp, act, alim) => Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8].map((t) => ([t, {
    o2: (o2 + t * 0.05).toFixed(2), temp: String(temp), act, alim,
  }])),
);

/** Dos camiones, cuatro paradas, seis tinas en uso (la 7 y la 8 no viajan). */
function viaje(extra) {
  const HORAS = ['20:30', '22:00', '23:30', '01:00'];
  const LUG = ['Laboratorio', 'Peaje 1', 'Gabarra 1', 'Camaronera'];
  return Object.assign({
    fecha: '2026-08-26', corrida: '555', modulo: 'M07', camaronera: 'Puná 1',
    salinidad: '31.5', horaSalida: '20:30', horaLlegada: '06:00',
    insumos: ['Artemia', 'Flake'], check: ['Oxigenómetro'],
    controlador: 'Juan Pérez', chequeador: 'Pedro Castro', recepcion: 'María Vera',
    camiones: [
      { placa: 'GSA-1147', tinasOff: [7, 8] },
      { placa: 'PBX-0392', tinasOff: [7, 8] },
    ],
    revisiones: HORAS.map((h, i) => ({
      hora: h, lugar: LUG[i], lat: -2.21, lon: -80.97, precision: 12, ubicacion: 'x',
      horaRegistro: 't', obs: i === 2 ? 'Tracto digestivo vacío.' : '',
      camiones: [
        { tinas: tinasDe(7.6 - i * 0.25, 26 - i, 'Alta', 'Artemia') },
        { tinas: tinasDe(6.9 - i * 0.3, 26 - i, 'Normal', 'Artemia/Flake') },
      ],
    })),
  }, extra || {});
}

/* ══════════════════════════════════════════════════════════ */

describe('Traslado · el PDF lleva el viaje entero', () => {
  it('una sección por camión, cada una en su hoja', () => {
    const html = api.buildTrasPdfHtml(viaje());
    expect(html).toContain('GSA-1147');
    expect(html).toContain('PBX-0392');
    // El salto va ENTRE camiones, no antes del primero: con `brk` de más, el
    // documento abriría con una hoja en blanco.
    expect((html.match(/class="brk"/g) || []).length).toBe(1);
    expect(html.indexOf('GSA-1147')).toBeLessThan(html.indexOf('class="brk"'));
  });

  it('las tres lecturas de cada parada, cada una en su matriz', () => {
    const html = api.buildTrasPdfHtml(viaje());
    ['Oxígeno disuelto (mg/L)', 'Temperatura (°C)', 'Actividad'].forEach((t) => {
      expect(html, 'falta la matriz de ' + t).toContain('>' + t + '<');
    });
    // Dos camiones × tres matrices.
    expect((html.match(/class="cat"/g) || []).length).toBe(6);
  });

  it('🔑 imprime las MISMAS tinas que se sincronizan', () => {
    // La 7 y la 8 no viajan: ni salen en la hoja ni pueden salir en el papel.
    const html = api.buildTrasPdfHtml(viaje());
    expect(html).toContain('<th>T6</th>');
    expect(html, 'se imprimió una tina que no viajaba').not.toContain('<th>T7</th>');
  });

  it('🔑 imprime las MISMAS paradas que se sincronizan', () => {
    // Una parada declarada pero en blanco no escribe filas; tampoco se imprime.
    const v = viaje();
    v.revisiones.push({ hora: '', lugar: '', obs: '', camiones: [{ tinas: {} }, { tinas: {} }] });
    const html = api.buildTrasPdfHtml(v);
    const filasPdf = (html.match(/<td class='np'>/g) || []).length / 6;   // 6 matrices
    const filasHoja = new Set(api.buildTrasPayload([{ id: 'tv1', data: v }]).rows
      .map((r) => r[api.TRAS_HEADERS.indexOf('Revisión')])).size;
    expect(filasPdf, 'el papel y la hoja no cuentan las mismas paradas').toBe(filasHoja);
  });

  it('la media por parada sale de las tinas con dato, no de las ocho', () => {
    const v = viaje();
    // Se borra el oxígeno de dos tinas de la primera parada del primer camión.
    delete v.revisiones[0].camiones[0].tinas[1].o2;
    delete v.revisiones[0].camiones[0].tinas[2].o2;
    const html = api.buildTrasPdfHtml(v);
    // Quedan las tinas 3..6: 7.75, 7.80, 7.85 y 7.90 → 7.82 (toFixed redondea el
    // 7.825 binario hacia abajo). Lo que importa es que NO cuente las vacías como
    // cero: sobre las seis daría 5.22, y esa diferencia es la que prueba la regla.
    expect(html, 'la media cambió de regla').toContain("'med'>7.82");
    expect(html, 'las tinas sin dato se contaron como cero').not.toContain('5.2');
  });

  it('los dos tiempos, con la medianoche envuelta', () => {
    const html = api.buildTrasPdfHtml(viaje());
    expect(html).toContain('4 h 30 min');      // 20:30 → 01:00 entre paradas
    expect(html).toContain('9 h 30 min');      // 20:30 → 06:00 puerta a puerta
  });

  it('🔴 lo que falta se dice, no se deja en blanco', () => {
    // Un hueco tipográficamente vacío en un papel firmado es indistinguible de un
    // cero. Se marca con una raya.
    const html = api.buildTrasPdfHtml(viaje({ controlador: '', horaLlegada: '' }));
    expect(html).toContain('class="vac"');
    expect(html).toContain('—');
  });

  it('el check y los insumos se ven marcados y sin marcar', () => {
    const html = api.buildTrasPdfHtml(viaje());
    expect((html.match(/chk on/g) || []).length, 'Artemia, Flake y Oxigenómetro').toBe(3);
    expect(html).toContain('☐');   // los que faltan
    expect(html).toContain('☑');
  });

  it('las observaciones de la parada van con su parada', () => {
    const html = api.buildTrasPdfHtml(viaje());
    expect(html).toContain('Tracto digestivo vacío.');
    expect(html).toContain('Parada 3');
  });

  it('🔴 el contenido del viaje va ESCAPADO', () => {
    // La camaronera y las placas las teclea una persona. Sin escapar, un `<` abriría
    // una etiqueta y el documento saldría roto o con contenido inyectado.
    const html = api.buildTrasPdfHtml(viaje({ camaronera: '<img src=x onerror=alert(1)>' }));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
  });

  it('un viaje sin camiones no revienta: lo dice', () => {
    const html = api.buildTrasPdfHtml(viaje({ camiones: [] }));
    expect(html).toContain('todavía no tiene ningún camión');
    expect(html).toContain('</html>');
  });

  it('🔴 las tres firmas, cada una con su responsable y su cargo', () => {
    // Un control de traslado sin firmas no acredita nada: es lo que convierte el
    // papel en el documento que se entrega en la camaronera.
    const html = api.buildTrasPdfHtml(viaje());
    [
      ['Juan Pérez', 'Controlador de despacho'],
      ['Pedro Castro', 'Chequeador de entrega'],
      ['María Vera', 'Responsable de recepción'],
    ].forEach(([quien, cargo]) => {
      expect(html, 'falta la firma de ' + cargo).toContain(quien + '<i>' + cargo + '</i>');
    });
    expect((html.match(/class="sig-line"/g) || []).length, 'faltan rayas de firma').toBe(3);
  });

  it('🔴 un viaje sin guardar lo DICE en la cabecera', () => {
    // El id del viaje hace de verificador. Sin él, el papel sale de una ficha que no
    // existe ni en el dispositivo: decir «sin sincronizar» restaría gravedad, porque
    // sugiere que está guardado y sólo falta subirlo.
    const html = api.buildTrasPdfHtml(viaje());
    expect(html).toContain('SIN GUARDAR');
  });

  it('trasFmtMin se lee como se dice', () => {
    expect(api.trasFmtMin(45)).toBe('45 min');
    expect(api.trasFmtMin(60)).toBe('1 h');
    expect(api.trasFmtMin(270)).toBe('4 h 30 min');
    expect(api.trasFmtMin(null)).toBe('—');
  });
});
