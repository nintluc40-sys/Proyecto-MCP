/* ============================================================
   REGISTROS · ficha "Traslado" — LAS DOS IMPLEMENTACIONES DEBEN COINCIDIR

   La lógica del traslado existe DOS veces, y no por descuido:
     · `ficha-traslado.schema.js` — módulo ES puro, lo usará el tablero (Vite).
     · el bloque TRASLADO de `public/registros/engine.js` — inline, porque las dos
       copias de Music (`index (8).html` y `Rosario\index.html`) son monolitos
       autónomos SIN módulos ES: allí nada puede importarse.

   La auditoría de este proyecto encontró que **todos** sus defectos vivían en las
   costuras: dos módulos que responden distinto a la misma pregunta. Esta prueba
   cierra esa costura antes de que se abra — extrae el código REAL del monolito, lo
   ejecuta y exige que produzca el MISMO payload que el módulo, celda a celda.

   Si alguien toca una de las dos y no la otra, esto se pone rojo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import {
  TRASLADO_HEADERS,
  TRASLADO_SHEET,
  ACTIVIDAD_OPTS,
  MODULO_OPTS,
  buildTrasladoPayload,
} from './ficha-traslado.schema.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

/** Carga el bloque TRASLADO del monolito en un contexto aislado y devuelve sus piezas. */
function motorTraslado() {
  const code = bloque(
    leer(ENGINE),
    'const TRAS_REC_KEY   = "larv4_tras_records";',
    '  return { sheetName: TRAS_SHEET, headers: TRAS_HEADERS.slice(), rows: rows };\n}',
  );
  // Sólo hace falta lo que se EJECUTA: las constantes de arriba y, al llamar,
  // buildTrasPayload. El resto son declaraciones que nunca se invocan aquí.
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseFloat, isFinite, Set,
    RPRE: 'larv4_recov_',
    sanitizeStr,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    code + '\n;globalThis.__api = { buildTrasPayload, TRAS_HEADERS, TRAS_SHEET, TRAS_ACTIVIDAD_OPTS,'
    + ' TRAS_REV_MIN, TRAS_REV_INI, TRAS_MODULO_OPTS, trasFilaId, trasMinutosEntre, trasNum, trasTxt, trasCamiones };',
  ).runInContext(ctx);
  return ctx.__api;
}

/* ── Un viaje con TODAS las trampas dentro ─────────────────
   Dos camiones, coordenadas negativas, cruce de medianoche, una tina apagada sólo
   en el primer camión, un intento de inyección de fórmula en la placa, observaciones
   distintas por parada y campos vacíos. */
function viajePrueba() {
  const medidas = (base) => {
    const tinas = {};
    for (let t = 1; t <= 8; t += 1) {
      tinas[t] = { o2: base + t / 10, temp: 26 - t / 10, act: t % 2 ? 'Alta' : 'Baja', alim: 'Artemia' };
    }
    return { tinas };
  };
  const rev = (hora, lugar, lat, lon, prec, ubi, obs, base) => ({
    hora, lugar, lat, lon, precision: prec, ubicacion: ubi, obs,
    horaRegistro: '2026-08-18T' + hora + ':07',
    camiones: [medidas(base), medidas(base - 0.3)],
  });
  return {
    id: 'tvparidad01',
    data: {
      fecha: '2026-08-18',
      camaronera: 'Puná 1',
      salinidad: '32.5',
      horaSalida: '20:30',
      horaLlegada: '06:00',
      insumos: ['Prokura', '', 'Vitamina C', 'Prokura'],
      check: ['Oxigenómetro', 'Linterna', 'Bandeja', 'Esfero'],
      controlador: 'Juanito de las Mercedes',
      chequeador: 'Pepito Acosta',
      recepcion: '',
      camiones: [
        { placa: '=HYPERLINK("http://malo")', tinasOff: [7] },
        { placa: 'PBX-0392', tinasOff: [] },
      ],
      revisiones: [
        rev('20:30', 'Laboratorio', -2.2135, -80.9791, 12, '-2.213500, -80.979100', 'Tracto digestivo vacío', 7),
        rev('23:40', 'Peaje 1', -2.3, -80.1, 45, '-2.300000, -80.100000', '', 6.8),
        rev('02:50', 'Gabarra 1', '', '', '', 'sin señal', 'Sin cobertura en la gabarra', 6.5),
        rev('06:00', 'Camaronera', -2.75, -79.9, 8, '-2.750000, -79.900000', '', 6.2),
      ],
    },
  };
}

const col = (nombre) => TRASLADO_HEADERS.indexOf(nombre);

describe('Traslado · el monolito y el módulo ES coinciden', () => {
  it('el bloque TRASLADO se puede extraer y ejecutar', () => {
    expect(() => motorTraslado()).not.toThrow();
  });

  it('declaran la MISMA hoja y las MISMAS 29 cabeceras, en el mismo orden', () => {
    const m = motorTraslado();
    expect(m.TRAS_SHEET).toBe(TRASLADO_SHEET);
    expect(m.TRAS_HEADERS).toEqual(TRASLADO_HEADERS);
    expect(m.TRAS_HEADERS).toHaveLength(29);
  });

  it('🔴 ninguno de los dos lleva los campos retirados', () => {
    const m = motorTraslado();
    ['Laboratorio', 'Guía', 'Camión', 'Alimentos'].forEach((h) => {
      expect(m.TRAS_HEADERS).not.toContain(h);
      expect(TRASLADO_HEADERS).not.toContain(h);
    });
  });

  it('🔴 comparten el catálogo de Módulo, en la grafía CORTA', () => {
    const m = motorTraslado();
    expect(m.TRAS_MODULO_OPTS).toEqual(MODULO_OPTS);
    expect(m.TRAS_MODULO_OPTS).toEqual(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'CIO']);
    // ⚠ NUNCA la grafía larga: ésa es la de Registro_Supervisión y son hojas
    // distintas. Dos grafías del mismo valor es el defecto del analista.
    expect(m.TRAS_MODULO_OPTS).not.toContain('Módulo 1');
  });

  it('comparten el catálogo de Actividad y el mínimo de revisiones', () => {
    const m = motorTraslado();
    expect(m.TRAS_ACTIVIDAD_OPTS).toEqual(ACTIVIDAD_OPTS);
    expect(m.TRAS_ACTIVIDAD_OPTS).toEqual(['Alta', 'Normal', 'Media', 'Baja']);
    expect(m.TRAS_REV_MIN).toBe(3);
    expect(m.TRAS_REV_INI).toBe(4);
  });

  it('🔴 producen EXACTAMENTE el mismo payload, celda a celda, con dos camiones', () => {
    const m = motorTraslado();
    const reg = viajePrueba();
    const delMotor = m.buildTrasPayload([reg]);
    const delModulo = buildTrasladoPayload(reg);
    expect(delMotor.sheetName).toBe(delModulo.sheetName);
    expect(delMotor.headers).toEqual(delModulo.headers);
    expect(delMotor.rows).toEqual(delModulo.rows);
  });

  it('coinciden también al reemitir las tinas apagadas en blanco', () => {
    const m = motorTraslado();
    const reg = viajePrueba();
    expect(m.buildTrasPayload([reg], { incluirApagadas: true }).rows)
      .toEqual(buildTrasladoPayload(reg, { incluirApagadas: true }).rows);
  });

  it('🔴 construyen la misma llave, y los dos camiones no colisionan', () => {
    const m = motorTraslado();
    expect(m.trasFilaId('tvx', 2, 3, 7)).toBe('tvx-c2-r3-t7');
    expect(m.trasFilaId('tvx', 1, 2, 5)).not.toBe(m.trasFilaId('tvx', 2, 2, 5));
  });

  it('un viaje sin lista de camiones es de UNO en los dos', () => {
    const m = motorTraslado();
    expect(m.trasCamiones({ placa: 'ABC-1' })).toHaveLength(1);
    expect(m.trasCamiones({})).toHaveLength(1);
  });

  it('🔴 los dos conservan la longitud negativa', () => {
    const m = motorTraslado();
    const filas = m.buildTrasPayload([viajePrueba()]).rows;
    expect(filas[0][col('Longitud')]).toBe(-80.9791);
    expect(filas[0][col('Latitud')]).toBe(-2.2135);
    expect(m.trasNum('-80.9791')).toBe(-80.9791);
    // mientras que el texto SÍ queda saneado
    expect(m.trasTxt('=HYPERLINK("x")').startsWith('=')).toBe(false);
  });

  it('🔴 los dos envuelven la medianoche igual', () => {
    expect(motorTraslado().trasMinutosEntre('23:40', '02:50')).toBe(190);
  });

  it('la tina apagada del camión 1 no afecta al camión 2, en ninguno de los dos', () => {
    const m = motorTraslado();
    const filas = m.buildTrasPayload([viajePrueba()]).rows;
    expect(filas).toHaveLength(4 * 7 + 4 * 8);   // c1 sin la tina 7, c2 completo
    expect(filas.filter((r) => /-c1-/.test(r[col('ID')]) && r[col('Tina')] === 7)).toHaveLength(0);
    expect(filas.filter((r) => /-c2-/.test(r[col('ID')]) && r[col('Tina')] === 7)).toHaveLength(4);
  });
});

describe('Traslado · la pestaña está realmente cableada en el monolito', () => {
  const src = leer(ENGINE);

  it('entra en las pestañas del módulo As Técnico', () => {
    expect(src).toContain('const AST_TABS      = ["ast","traslado","marea","fotos"];');
  });

  it('tiene rótulo propio y NO reutiliza la clave "despacho"', () => {
    // "despacho" ya es la ficha de cosecha de larvicultura: reutilizarla rompería
    // en silencio los sitios que comparan curTab contra esa cadena.
    expect(src).toContain('traslado: ["🚚","Traslado"],');
    expect(src).toContain('despacho: ["🚚","Despacho"],');
  });

  it('se renderiza al entrar en la pestaña', () => {
    expect(src).toContain('if(t==="traslado") renderTraslado();');
  });

  it('respalda lo tecleado al salir del módulo', () => {
    expect(src).toContain('if(isAstMod(curMod)) saveTrasRecovery();');
  });

  it('pregunta por la CAPACIDAD del navegador, nunca por el destino', () => {
    // Es lo que permite que el mismo código valga para el repo y para las dos
    // copias de Music, y que empiece a sellar posición solo el día que éstas se
    // publiquen en HTTPS, sin tocar una línea.
    const geo = bloque(src, 'function trasGeoDisponible(){', '\n}');
    expect(geo).toContain('window.isSecureContext === false');
    expect(geo).toContain('navigator.geolocation');
    // Ramificar por URL, protocolo o nombre de archivo es justo lo que
    // desincroniza las tres copias: aquí no puede aparecer.
    expect(geo).not.toMatch(/location\s*\./);
    expect(geo).not.toMatch(/file:/);
  });
});
