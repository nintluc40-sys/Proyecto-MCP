/* ============================================================
   PARIDAD · Movimientos de Maduración (Fase 3)

   La lógica vive DOS VECES a propósito: en `ficha-maduracion-movimientos.schema.js` y
   como bloque inline en `public/registros/engine.js`, porque los dos monolitos de Music
   no tienen módulos ES. Esta prueba cierra la costura: extrae el bloque REAL del monolito,
   lo ejecuta en un contexto aislado y exige el mismo payload y el mismo veredicto.

   ⚠⚠ POR QUÉ SE EXTRAEN DOS BLOQUES Y NO UNO: el de Movimientos usa `madIngSalaTag` y
   `madIngInt`, que viven en el bloque de Ingreso. Inyectarlos desde el MÓDULO habría sido
   más cómodo y habría tapado justo lo que esta prueba mide — si el `madIngInt` del
   monolito divergiera, la paridad seguiría en verde. Se traen los dos bloques y el
   monolito corre con SUS propios ayudantes.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import {
  MAD_MOV_SHEET,
  MAD_MOV_HEADERS,
  MAD_MOV_COLUMNS,
  MAD_MOV_TIPOS,
  MAD_MOV_MOTIVOS,
  MAD_TANQUES_POR_SALA,
  movRowId,
  buildMovRows,
  buildMovPayload,
  validarMovimiento,
} from './ficha-maduracion-movimientos.schema.js';

const ENGINE = new URL('../../../../public/registros/engine.js', import.meta.url);
const leer = (u) => readFileSync(u, 'utf8').split('\r\n').join('\n');

function bloque(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + desde.slice(0, 40));
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + hasta.slice(0, 40));
  return src.slice(i, j + hasta.length);
}

function motorMovimientos() {
  const src = leer(ENGINE);
  const ing = bloque(
    src,
    'const MAD_ING_SHEET = "Maduración Ingreso";',
    '  return { errores: errores, avisos: avisos };\n}',
  );
  /* El ancla de FIN es la última sentencia PROPIA de `madMovValidar`, no la primera línea
     del vecino: anclar en el vecino convierte cualquier cambio suyo en una avería de este
     instrumento, y de paso tapa lo que el instrumento medía. */
  const mov = bloque(
    src,
    'const MAD_MOV_SHEET = "Maduración Movimientos";',
    'regístralos en dos movimientos."); break; }\n  }\n  return { errores: errores, avisos: avisos };\n}',
  );
  const ctx = {
    String, Number, Object, Array, JSON, Math, Date, parseInt, parseFloat, isFinite,
    sanitizeStr,
    MAD_TANQUES_POR_SALA,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  new Script(
    ing + '\n' + mov
    + '\n;globalThis.__api = { buildMadMovPayload, madMovBuildRows, madMovValidar,'
    + ' madMovRowId, MAD_MOV_HEADERS, MAD_MOV_SHEET, MAD_MOV_COLUMNS, MAD_MOV_TIPOS,'
    + ' MAD_MOV_MOTIVOS };',
  ).runInContext(ctx);
  return ctx.__api;
}

const api = motorMovimientos();

/* Cada escenario ejerce una rama distinta. Un fixture único no distinguiría una
   implementación correcta de una que se dejó un caso — y ya pasó en este módulo: el banco
   de paridad del Ingreso metió la divergencia del GRUPO y la paridad no la vio, porque
   ningún fixture la ejercía. */
const MODELOS = {
  'transferencia simple': {
    fecha: '2026-09-08', tipo: 'Transferencia', motivo: 'Mezcla de lotes', observaciones: 'sin novedad',
    tramos: [{ salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 30, hembras: 20, agua: 'RAS' }],
  },
  'agrupación: tres orígenes a un destino': {
    fecha: '2026-09-08', tipo: 'Agrupación', motivo: 'Agrupación por baja densidad', observaciones: '',
    tramos: [
      { salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 10, hembras: 5, agua: 'RAS' },
      { salaOrigen: 'Sala 1', tanqueOrigen: 2, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 12, hembras: 6, agua: 'RAS' },
      { salaOrigen: 'Sala 3', tanqueOrigen: 22, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 8, hembras: 4, agua: 'Agua de playa' },
    ],
  },
  'tramo duplicado (los dos generan la misma fila)': {
    fecha: '2026-09-08', tipo: 'Transferencia', motivo: '', observaciones: '',
    tramos: [
      { salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 10, hembras: 0, agua: 'RAS' },
      { salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 7, hembras: 0, agua: 'RAS' },
    ],
  },
  'tramo circular y tramo vacío': {
    fecha: '2026-09-08', tipo: 'Mezcla', motivo: 'Otro', observaciones: '',
    tramos: [
      { salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 1', tanqueDestino: 1, machos: 5, hembras: 5, agua: 'RAS' },
      { salaOrigen: 'Sala 1', tanqueOrigen: 2, salaDestino: 'Sala 2', tanqueDestino: 17, machos: 0, hembras: 0, agua: 'RAS' },
    ],
  },
  'rotación: un tanque es origen y destino': {
    fecha: '2026-09-08', tipo: 'Transferencia', motivo: '', observaciones: '',
    tramos: [
      { salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 5, hembras: 5, agua: 'RAS' },
      { salaOrigen: 'Sala 3', tanqueOrigen: 22, salaDestino: 'Sala 1', tanqueDestino: 1, machos: 5, hembras: 5, agua: 'RAS' },
    ],
  },
  'ubicación fuera del catálogo': {
    fecha: '2026-09-08', tipo: 'Transferencia', motivo: '', observaciones: '',
    tramos: [{ salaOrigen: 'Sala 1', tanqueOrigen: 99, salaDestino: 'Sala 9', tanqueDestino: 3, machos: 5, hembras: 5, agua: 'RAS' }],
  },
  /* ⚠⚠ ESTE FIXTURE NACIÓ DE UN AGUJERO MEDIDO. El banco de paridad metió «el monolito
     escribe tramos SIN ubicación completa» y la paridad NO LA VIO: todos los modelos de
     aquí traían las cuatro coordenadas, así que la rama que las descarta no se ejercía.
     Es la segunda vez el mismo día que el banco encuentra un fixture que no prueba nada
     —la primera fue el GRUPO del Ingreso—, y por eso el banco existe. */
  'tramo con la ubicación a medias': {
    fecha: '2026-09-08', tipo: 'Transferencia', motivo: '', observaciones: '',
    tramos: [
      { salaOrigen: 'Sala 1', tanqueOrigen: 1, salaDestino: 'Sala 2', tanqueDestino: 16, machos: 10, hembras: 5, agua: 'RAS' },
      { salaOrigen: 'Sala 3', tanqueOrigen: 22, salaDestino: '', tanqueDestino: '', machos: 9, hembras: 9, agua: 'RAS' },
    ],
  },
  'sin tramos': { fecha: '2026-09-08', tipo: 'Transferencia', motivo: '', observaciones: '', tramos: [] },
};

describe('Movimientos · el monolito y el módulo declaran lo mismo', () => {
  it('la misma hoja', () => {
    expect(api.MAD_MOV_SHEET).toBe(MAD_MOV_SHEET);
  });

  it('las mismas cabeceras, en el mismo orden', () => {
    expect(api.MAD_MOV_HEADERS).toEqual(MAD_MOV_HEADERS);
  });

  it('las mismas claves de columna, en el mismo orden', () => {
    // Si el orden de `k` divergiera, las cabeceras podrían coincidir y las CELDAS no.
    expect(api.MAD_MOV_COLUMNS.map((c) => c.k)).toEqual(MAD_MOV_COLUMNS.map((c) => c.k));
  });

  it('los mismos tipos y motivos', () => {
    expect(api.MAD_MOV_TIPOS).toEqual(MAD_MOV_TIPOS);
    expect(api.MAD_MOV_MOTIVOS).toEqual(MAD_MOV_MOTIVOS);
  });
});

describe('Movimientos · el mismo payload, celda a celda', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('coincide con «' + nombre + '»', () => {
      expect(api.buildMadMovPayload(model)).toEqual(buildMovPayload(model));
    });
  }

  it('y los fixtures producen filas DE VERDAD', () => {
    // Comparar dos payloads vacíos pasa siempre. Esto exige que los principales escriban.
    expect(buildMovRows(MODELOS['agrupación: tres orígenes a un destino'])).toHaveLength(3);
    expect(buildMovRows(MODELOS['transferencia simple'])).toHaveLength(1);
    // Dos tramos, UNA fila: el de la ubicación a medias no llega a la hoja.
    expect(MODELOS['tramo con la ubicación a medias'].tramos).toHaveLength(2);
    expect(buildMovRows(MODELOS['tramo con la ubicación a medias'])).toHaveLength(1);
  });
});

describe('Movimientos · el mismo veredicto', () => {
  for (const [nombre, model] of Object.entries(MODELOS)) {
    it('mismo veredicto con «' + nombre + '»', () => {
      expect(api.madMovValidar(model)).toEqual(validarMovimiento(model));
    });
  }

  it('y los fixtures producen errores y avisos DE VERDAD', () => {
    // Dos listas vacías coinciden siempre: esto exige que las ramas se ejerzan.
    expect(validarMovimiento(MODELOS['tramo duplicado (los dos generan la misma fila)']).errores.length).toBeGreaterThan(0);
    expect(validarMovimiento(MODELOS['tramo circular y tramo vacío']).errores.length).toBeGreaterThan(0);
    expect(validarMovimiento(MODELOS['ubicación fuera del catálogo']).avisos.length).toBeGreaterThan(0);
    expect(validarMovimiento(MODELOS['rotación: un tanque es origen y destino']).avisos.length).toBeGreaterThan(0);
  });
});

describe('Movimientos · la misma llave', () => {
  it('mismo ID para las mismas ubicaciones', () => {
    const casos = [
      ['2026-09-08', 'Sala 1', 1, 'Sala 2', 16],
      ['2026-09-08', 'Sala 4', 1, 'Sala 2', 16],
      ['2026-12-31', 'Sala 5', 11, 'Sala 3', 27],
    ];
    for (const c of casos) expect(api.madMovRowId(...c)).toBe(movRowId(...c));
  });
});

describe('Movimientos · la pestaña tiene DÓNDE pintarse', () => {
  const shell = leer(new URL('../shell.html', import.meta.url));
  const src = leer(ENGINE);

  it('el shell declara el panel y el motor lo busca por el mismo id', () => {
    /* El defecto A1 de la Fase 1 fue exactamente esto: `buildTabs` crea el BOTÓN, no el
       contenedor. Sin el div, la pestaña aparece y el render sale por su primera línea sin
       pintar nada — una ficha invisible, sin un solo error en consola. */
    expect(shell).toContain('id="fp-movimientos"');
    expect(src).toContain('document.getElementById("fp-movimientos")');
  });

  it('la pestaña está en la lista, con su icono, y selTab la pinta', () => {
    expect(src).toContain('"movimientos"');
    expect(src).toContain('movimientos: ["🔄","Movimientos"]');
    expect(src).toContain('if(t==="movimientos") renderMadMovimientos();');
  });

  it('no se re-pinta si ya está montado, para no borrar los tramos tecleados', () => {
    // Es el defecto A2 de la Fase 1, que aquí costaría igual de caro.
    expect(src).toContain('if(fp.querySelector("#mv-tramos")) return;');
    expect(src).toContain('function madMovVaciar(');
  });

  it('un envío ENCOLADO deja rastro, como en Ingreso', () => {
    expect(src).toContain('function madMovLogAnota(');
    expect(src).toContain('madMovLogAnota(model.fecha, model.tipo, payload.rows.length, "cola")');
  });

  it('el saldo del origen se consulta BAJO BOTÓN, no al abrir la pestaña', () => {
    /* Decisión del usuario (2026-09-08). El motivo es medido: leer estas hojas cuesta entre
       2 y 52 s en este GAS, así que hacerlo siempre castigaría a quien ya trae la cifra del
       papel. Y reutiliza el MISMO cargador de la vista Saldo: dos lecturas distintas del
       mismo libro habrían divergido en silencio. */
    expect(src).toContain('function madMovVerSaldo(');
    expect(src).toContain('onclick="madMovVerSaldo()"');
    expect(src).toContain('await madSaldoCargar(true)');
  });

  it('🔴 el saldo se BORRA al cambiar el tanque de origen', () => {
    /* Un saldo que se queda en pantalla mientras el tanque de abajo ya es otro es PEOR que
       no enseñar nada: se lee como una medición del tanque nuevo y decide cuántos animales
       se teclean. Es la familia del verde en falso que la auditoría del 09-08 encontró en
       la vista Saldo — un dato viejo que no se sabe viejo. */
    expect(src).toContain('function madMovOrigenChange(');
    expect(src).toContain('onchange="madMovOrigenChange(this)"');
    // Y cambiar la SALA de origen también lo invalida, no sólo el tanque.
    expect(src).toContain('if(esOrigen) madMovOrigenChange(sel);');
  });

  it('si alguna hoja no se pudo leer, el saldo lo DICE antes de enseñarse', () => {
    // Repetir el defecto A1 aquí sería enseñar un saldo corto como si fuera completo.
    /* ⚠ 2026-09-13 · Desde el 09-09 el veredicto NO se deduce aquí: lo da madLibroIncompleto,
       que además cuenta las hojas RECORTADAS por el tope del GAS. Esta comprobación buscaba
       la forma anterior («libro.fallos && libro.fallos.length») y se quedó en rojo al
       mejorarse la regla. Se mira DENTRO de la función, porque la misma línea existe en los
       otros consumidores del libro y un «toContain» sobre el archivo entero no distinguiría
       a éste de los demás. */
    const pinta = bloque(src, 'function _madMovPintaSaldo(libro){', '\n}');
    expect(pinta).toContain('const _mal = madLibroIncompleto(libro);');
    expect(pinta).toContain('const roto = !!_mal;');
    expect(pinta).toContain('está INCOMPLETO y puede quedarse corto');
    // Y un tanque que el libro no conoce no se pinta como «cero vivos».
    expect(pinta).toContain('"sin ingreso"');
  });
});
