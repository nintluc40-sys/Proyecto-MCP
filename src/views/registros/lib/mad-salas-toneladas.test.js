// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · SALAS · LA COLUMNA «TONELADAS»

   Pedido del usuario (2026-09-15): «añadir al lado del RAS una nueva columna denominada
   Toneladas, para que el usuario registre las toneladas que llevan todos los tanques de cada
   sala, que se sabe por defecto: Sala 1 (5,5), Sala 2 (21), Sala 3 (21), Sala 4 (14),
   Sala 5 (13); pero igual el usuario puede modificar de ser necesario».

   🔑 LO QUE ESTAS PRUEBAS DEFIENDEN, que es más que «hay una columna»:

   1) EL DEFECTO SE PRE-RELLENA, NO SE IMPONE. La celda nace con el volumen de su sala y se
      puede pisar; lo que se guarda es SIEMPRE lo que hay en la celda. Si algún día alguien
      «optimiza» esto imponiendo el catálogo en el colector, el día que una sala cambie de
      volumen el usuario teclearía la cifra nueva y se guardaría la vieja, sin aviso.

   2) UN DEFECTO QUE NADIE TECLEÓ NO ES UN REGISTRO. Al nacer pre-rellenas las CINCO salas,
      contar las toneladas dentro de `hasAny` hacía que la grilla guardara las cinco filas cada
      día aunque el usuario sólo llenara una — y la hoja se llenaría de filas que sólo dicen el
      volumen del tanque, que es del catálogo, no una medición. Lo cazaron las pruebas de la
      temperatura; aquí se fija para que no vuelva.

   3) EN LA HOJA VA LA ÚLTIMA. La llave del GAS de «Maduración Sala» es POSICIONAL [0,1] y la
      hoja tiene cientos de filas: añadir al final no mueve ninguna, insertar junto al RAS
      correría dos columnas y esto sería una MIGRACIÓN. En la GRILLA sí va junto al RAS, que es
      donde se lee. Las dos cosas a la vez, y las dos se comprueban.

   4) 🔴 `data-c` ES EL EJE X DEL PEGADO. `madGridPaste` reparte el bloque de Excel con
      `querySelector('[data-r][data-c]')`, que devuelve el PRIMERO en orden de documento: dos
      celdas con el mismo índice y el pegado se corre una columna en silencio. Al nacer,
      Toneladas se quedó con el `data-c` de `temp_02`. La última prueba exige que los índices
      sean únicos Y que vayan en el mismo orden que se ve en pantalla, que es el orden en que
      el usuario copia.

   Vive sólo en el monolito, así que se arranca ENTERO sobre happy-dom.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadSalas', '_collectSalasGrid', 'buildMadPayload', 'loadMad', 'today',
  'madSalaToneladasDef', 'MAD_SALA_OPTS'];
const H = {};

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => 'try{ H[' + JSON.stringify(n) + '] = ' + n + '; }catch(_){}').join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
});

beforeEach(() => {
  localStorage.clear();
  H.renderMadSalas();                               // grilla limpia, del día
});

/* Las filas van en el orden de MAD_SALA_OPTS: Sala 1 es la 0. */
const fila = (sala) => H.MAD_SALA_OPTS.indexOf(sala);
const celda = (sala, k) => document.querySelector('[name="sg_' + fila(sala) + '_' + k + '"]');
const ton = (sala) => celda(sala, 'toneladas');

describe('Maduración · Salas · Toneladas · el valor por defecto', () => {
  it('cada sala nace con SU volumen, no con uno cualquiera', () => {
    expect(ton('Sala 1').value).toBe('5.5');
    expect(ton('Sala 2').value).toBe('21');
    expect(ton('Sala 3').value).toBe('21');
    expect(ton('Sala 4').value).toBe('14');
    expect(ton('Sala 5').value).toBe('13');
  });

  /* 🔑 El fixture tiene que DISTINGUIR: si todas las salas llevaran la misma cifra, un catálogo
     equivocado daría igual de verde. 5,5 · 21 · 21 · 14 · 13 no se confunden entre sí. */
  it('el fixture ejerce algo: las cifras NO son todas iguales', () => {
    const vistas = new Set(['Sala 1', 'Sala 2', 'Sala 4', 'Sala 5'].map((s) => ton(s).value));
    expect(vistas.size).toBe(4);
  });

  it('una sala sin volumen en el catálogo nace VACÍA, no en cero', () => {
    // Cero toneladas es una afirmación («la sala está seca»); vacío es «no se sabe».
    expect(H.madSalaToneladasDef('Sala 6')).toBe('');
    expect(H.madSalaToneladasDef('Sala 7')).toBe('');
  });

  it('el catálogo cubre TODAS las salas de la grilla, sin huecos', () => {
    /* Hoy son cinco y las cinco tienen volumen. Si mañana se abre una Sala 6 y nadie le pone
       su cifra, esta prueba lo dice el mismo día: la celda saldría vacía y el usuario tendría
       que teclearla cada jornada. */
    expect(H.MAD_SALA_OPTS.length).toBe(5);
    for (const s of H.MAD_SALA_OPTS) expect(ton(s).value).not.toBe('');
  });

  it('la celda es numérica, no negativa y admite el medio punto de la Sala 1', () => {
    const el = ton('Sala 1');
    expect(el.type).toBe('number');
    expect(el.min).toBe('0');
    expect(el.step).toBe('0.1');                    // 5,5 tiene que caber
  });
});

describe('Maduración · Salas · Toneladas · se guarda lo que hay en la CELDA', () => {
  it('lo tecleado por el usuario GANA al catálogo', () => {
    celda('Sala 2', 'estado').value = 'Producción';
    ton('Sala 2').value = '18.5';                   // la sala cambió de volumen
    const rows = H._collectSalasGrid();
    expect(rows).toHaveLength(1);
    expect(rows[0].toneladas).toBe(18.5);
  });

  it('una sala que se guarda por otra cosa arrastra su volumen por defecto', () => {
    celda('Sala 4', 'estado').value = 'Cuarentena';
    const rows = H._collectSalasGrid();
    expect(rows).toHaveLength(1);
    expect(rows[0].sala).toBe('Sala 4');
    expect(rows[0].toneladas).toBe(14);
  });

  it('🔑 el defecto pre-rellenado NO convierte una sala en un registro', () => {
    // Las cinco celdas nacen llenas: si contaran, la grilla guardaría 5 filas cada día.
    const rows = H._collectSalasGrid();
    expect(rows).toHaveLength(0);
  });

  it('🔑 …y con UNA sala tocada se guarda UNA, no las cinco', () => {
    celda('Sala 3', 'ras').value = '25%';
    const rows = H._collectSalasGrid();
    expect(rows).toHaveLength(1);
    expect(rows[0].sala).toBe('Sala 3');
  });

  /* 🔴 LA VUELTA COMPLETA, que es donde vive el daño de verdad. Teclear 18,5 y que al volver a
     pintar la grilla reaparezca el 21 del catálogo no se nota al guardar —el número es creíble—:
     se nota semanas después, cuando toda la serie de la Sala 2 lleva el volumen viejo. */
  it('🔴 al repintar, lo GUARDADO manda sobre el catálogo', () => {
    localStorage.setItem('larv4_mad_salas', JSON.stringify([
      { data: { fecha: H.today(), sala: 'Sala 2', estado: 'Producción', toneladas: 18.5 }, synced: false },
    ]));
    H.renderMadSalas();
    expect(ton('Sala 2').value).toBe('18.5');        // lo suyo, no el 21 del catálogo
    expect(ton('Sala 3').value).toBe('21');          // y la sala intacta sigue con el suyo
  });

  it('🔴 …incluso si lo guardado es CERO, que es un dato y no un hueco', () => {
    // Una sala vaciada para desinfección lleva 0 t. Si el defecto se colara, diría 21.
    localStorage.setItem('larv4_mad_salas', JSON.stringify([
      { data: { fecha: H.today(), sala: 'Sala 2', estado: 'Desinfección', toneladas: 0 }, synced: false },
    ]));
    H.renderMadSalas();
    expect(ton('Sala 2').value).toBe('0');
  });

  it('un día viejo sin la columna vuelve a pintar el defecto, no un vacío', () => {
    // Las filas anteriores al 2026-09-15 no tienen `toneladas`: la celda parte del catálogo.
    localStorage.setItem('larv4_mad_salas', JSON.stringify([
      { data: { fecha: H.today(), sala: 'Sala 4', estado: 'Producción' }, synced: true },
    ]));
    H.renderMadSalas();
    expect(ton('Sala 4').value).toBe('14');
  });

  it('vaciar la celda a mano se respeta: se guarda vacío, no el catálogo', () => {
    celda('Sala 1', 'estado').value = 'Producción';
    ton('Sala 1').value = '';
    const rows = H._collectSalasGrid();
    expect(rows[0].toneladas).toBe('');
  });

  it('una cifra absurda no se recorta en silencio a 1 000 000', () => {
    // sanitizeNum recortaría al tope; el tope es 1e6 justamente para no tocar nada creíble.
    celda('Sala 1', 'estado').value = 'Producción';
    ton('Sala 1').value = '999';
    expect(H._collectSalasGrid()[0].toneladas).toBe(999);
  });
});

describe('Maduración · Salas · Toneladas · dónde cae en la hoja', () => {
  const payload = (data) => H.buildMadPayload('salas', [{ data }]);

  it('la columna va LA ÚLTIMA de la hoja, detrás de «Estado por lote»', () => {
    const p = payload({ fecha: '2026-09-15', sala: 'Sala 2', toneladas: 21 });
    expect(p.headers[p.headers.length - 1]).toBe('Toneladas');
    expect(p.headers[p.headers.length - 2]).toBe('Estado por lote');
  });

  it('🔑 la llave posicional [0,1] del GAS sigue siendo Fecha y Sala', () => {
    const p = payload({ fecha: '2026-09-15', sala: 'Sala 2' });
    expect(p.headers[0]).toBe('Fecha');
    expect(p.headers[1]).toBe('Sala');
  });

  it('cabecera y fila tienen el MISMO ancho (la columna no descoloca a nadie)', () => {
    const p = payload({ fecha: '2026-09-15', sala: 'Sala 2', toneladas: 21, ras: '25%' });
    expect(p.rows[0]).toHaveLength(p.headers.length);
  });

  it('el valor viaja en su sitio y como NÚMERO, no como texto', () => {
    const p = payload({ fecha: '2026-09-15', sala: 'Sala 1', toneladas: '5.5' });
    expect(p.rows[0][p.headers.indexOf('Toneladas')]).toBe(5.5);
  });

  it('sin toneladas la celda viaja vacía, y el payload NO inventa el catálogo', () => {
    // El defecto vive en la GRILLA, no aquí: un registro viejo sin la columna no se rellena solo.
    const p = payload({ fecha: '2026-09-15', sala: 'Sala 1' });
    expect(p.rows[0][p.headers.indexOf('Toneladas')]).toBe('');
  });
});

describe('Maduración · Salas · Toneladas · en la grilla va junto al RAS', () => {
  it('la cabecera visible pone «Toneladas», y dice POR TANQUE, justo después de «RAS»', () => {
    const ths = Array.from(document.querySelectorAll('#fp-salas thead th')).map((t) => t.textContent.trim());
    const iTon = ths.findIndex((t) => t.startsWith('Toneladas'));
    expect(iTon).toBe(ths.indexOf('RAS') + 1);
    /* «por tanque» no es adorno: sin él, «Toneladas» en la fila de una SALA se lee como el total de
       la sala, y con esa lectura la carga volumétrica sale multiplicada por el nº de tanques. */
    expect(ths[iTon]).toContain('por tanque');
  });

  it('y la celda va justo después de la del RAS en la MISMA fila', () => {
    const tds = Array.from(celda('Sala 1', 'ras').closest('tr').children);
    const iRas = tds.findIndex((td) => td.querySelector('[name$="_ras"]'));
    const iTon = tds.findIndex((td) => td.querySelector('[name$="_toneladas"]'));
    expect(iTon).toBe(iRas + 1);
  });

  it('las dos filas de la cabecera casan: la 2.ª tapa las columnas de la izquierda', () => {
    /* La 2.ª fila lleva un <th> vacío por cada columna previa a las horas. Si falta uno, las
       horas salen corridas respecto a los grupos de arriba. */
    const filas = document.querySelectorAll('#fp-salas thead tr');
    const previas = Array.from(filas[0].children).findIndex((t) => t.getAttribute('colspan'));
    const vacias = Array.from(filas[1].children).filter((t) => t.textContent.trim() === '').length;
    expect(previas).toBeGreaterThan(0);
    expect(vacias).toBe(previas);
  });

  it('🔴 `data-c` es único en la fila y va en el orden que se ve (eje X del pegado)', () => {
    const tr = celda('Sala 1', 'ras').closest('tr');
    const cs = Array.from(tr.querySelectorAll('[data-c]')).map((el) => Number(el.getAttribute('data-c')));
    expect(new Set(cs).size).toBe(cs.length);                 // ninguno repetido
    expect(cs).toEqual([...cs].sort((a, b) => a - b));        // y en orden visual
    // Toneladas tiene el suyo, y temp_02 conserva el que sigue.
    expect(Number(ton('Sala 1').getAttribute('data-c')))
      .toBe(Number(celda('Sala 1', 'ras').getAttribute('data-c')) + 1);
    expect(Number(celda('Sala 1', 'temp_02').getAttribute('data-c')))
      .toBe(Number(ton('Sala 1').getAttribute('data-c')) + 1);
  });
});
