// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Traslado — GUARDADO LOCAL, patrón de larvicultura (2026-08-25b)

   Hasta el 08-25 el viaje sólo existía cuando estaba TERMINADO: había que rellenar
   las cuatro paradas y pulsar «Enviar traslado». En carretera eso significaba
   llevar tres horas de mediciones vivas únicamente en el DOM de un teléfono, y
   perderlas enteras si se cerraba el navegador o se agotaba la batería.

   La primera respuesta fue que SELLAR guardara. El usuario la probó y pidió otra
   cosa, que es la que mide este banco: sellar y guardar son DOS botones distintos
   —mezclados, un sellado sin cobertura parecía un fallo del guardado— y la ficha se
   comporta como las de larvicultura y las grillas multisala de maduración.

     · «Sellar» escribe hora y coordenadas y NO guarda.
     · «💾 Guardar local» respalda el VIAJE ENTERO y lo deja pendiente.
     · «☁️ Enviar traslado» guarda Y envía, y los datos SE QUEDAN en la ficha.
     · «🗑 Borrar traslado» la vacía para empezar el siguiente.
     · Un viaje a medias no ensucia la hoja: las paradas en blanco NO escriben filas,
       o el tablero del Supervisor y el mapa pintarían paradas fantasma —sin hora y
       sin oxígeno— que nadie visitó.

   Se arranca el monolito ENTERO sobre el shell real, como el resto de bancos de
   `engine.js`: es la única forma de probar la ficha y no funciones sueltas. Va en
   archivo aparte de `traslado-captura.test.js` a propósito — aquél ya rozaba el
   techo de memoria del worker con sus 74 pruebas sobre happy-dom.

   Receta del banco en `reference_banco-engine-js`.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');

const EXPORTAR = ['renderTraslado', 'collectTraslado', 'saveTraslado', '_trasRaw', '_trasSave',
  'buildTrasPayload', 'trasAgregarRevision', 'trasSellarUbicacion', 'trasBorrarTraslado', 'trasGuardarLocal',
  'trasCamChange', 'trasIrRevision', 'trasAgregarCamion',
  'syncAllPendingTras', 'loadTrasRecovery', 'saveTrasRecovery', 'validarTraslado',
  'startAutoRecovery',
  'TRAS_HEADERS', 'TRAS_TINAS', 'TRAS_REV_MIN'];
const H = {};
const toasts = [];
const enviados = [];

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.confirm = () => true;

  const seguridad = await import('./security.js');
  const modulos = await import('./modules.js');
  const repro = await import('./reproductivo.data.js');
  window.__rgLib = { ...seguridad, ...modulos, ...repro };

  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);

  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    /* Costura de prueba (como `setToast` o `setMod`): NO existe en el producto.
       Simula recargar la página —el estado en memoria se pierde, el dispositivo
       conserva sus registros—, que es el único camino por el que `trasAdoptarActivo`
       llega a adoptar de verdad. Sin esto, las pruebas dejaban `_trasViajeActivo` ya
       asignado y la adopción salía por su guarda temprana sin ejecutarse: cuatro
       mutaciones del banco (L9-L12) sobrevivían por eso. */
    + '\ntry{ H.__simularRecarga=function(){ _trasViajeActivo = null; _trasEnBlanco = false; }; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );

  H.setToast((msg) => { toasts.push(String(msg)); });
  H.__envioOk = true;
  H.setPost(async (payload) => { enviados.push(payload); return H.__envioOk; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/PRUEBA/exec');
  H.setRate(() => true);
  H.setMod(13);          // AST_MOD
  H.setTab('traslado');

  /* ⚠ happy-dom NO aplica `selected` al parsear innerHTML: deja el <select> en la
     primera opción. Es un defecto del ENTORNO, no del monolito. Sin esto, leer
     Lugar o Alimentación después de un repintado devolvería basura. */
  ['renderTraslado', 'trasIrRevision', 'trasCamChange', 'trasAgregarCamion',
    'trasAgregarRevision', 'saveTraslado', 'trasBorrarTraslado'].forEach((n) => {
    const orig = H[n];
    if (typeof orig !== 'function') throw new Error('no se exportó ' + n);
    H[n] = function envuelta(...args) {
      const r = orig.apply(null, args);
      repararSelects();
      return r;
    };
  });
});

function repararSelects() {
  const p = document.getElementById('fp-traslado');
  if (!p) return;
  p.querySelectorAll('select').forEach((s) => {
    const i = Array.from(s.options).findIndex((o) => o.hasAttribute('selected'));
    s.selectedIndex = i >= 0 ? i : 0;
  });
}

const panel = () => document.getElementById('fp-traslado');
const ultimoAviso = () => (toasts.length ? toasts[toasts.length - 1] : '');
const avisos = () => toasts.join(' || ');
const cab = (k, v) => {
  const el = panel().querySelector(`.mad-form > .meta [data-k="${k}"], .mad-form > .mf [data-k="${k}"]`);
  if (!el) throw new Error('sin campo de cabecera ' + k);
  el.value = v;
};
const enPantalla = (i) => !!panel().querySelector(`.tras-rev[data-rev="${i}"]`);
const irA = (i) => {
  if (!enPantalla(i)) H.trasIrRevision(i);
  if (!enPantalla(i)) throw new Error(`no se pudo abrir la revisión ${i}`);
};
const rev = (i, k, v) => {
  irA(i);
  const el = panel().querySelector(`.tras-rev[data-rev="${i}"] [data-k="${k}"]:not([data-cam])`);
  if (!el) throw new Error(`sin campo ${k} en la revisión ${i}`);
  el.value = v;
};
const leerRev = (i, k) => {
  irA(i);
  const el = panel().querySelector(`.tras-rev[data-rev="${i}"] [data-k="${k}"]:not([data-cam])`);
  return el ? el.value : null;
};
const tina = (i, t, k, v) => {
  irA(i);
  const el = panel().querySelector(`.tras-cam-grid[data-rev="${i}"][data-cam="0"] [data-tina="${t}"][data-k="${k}"]`);
  if (!el) throw new Error(`sin tina ${t}/${k} en la revisión ${i}`);
  el.value = v;
};

/** Da de alta el camión y EXIGE que haya entrado: si el alta se rompe, el resto de
 *  la prueba mediría un viaje sin camiones y el fallo saldría por otro sitio. */
function conCamion(placaTxt) {
  const el = panel().querySelector('#tras-alta-placa');
  if (!el) throw new Error('sin formulario de alta');
  el.value = placaTxt || 'GSA-1147';
  const antes = panel().querySelectorAll('.tras-camion').length;
  H.trasAgregarCamion();
  if (panel().querySelectorAll('.tras-camion').length !== antes + 1) {
    throw new Error('el alta no añadió el camión: ' + ultimoAviso());
  }
}

/** La cabecera mínima para que el viaje sea DIRECCIONABLE en la hoja. */
function cabecera() {
  cab('fecha', '2026-08-18');
  panel().querySelector('[data-k="camaronera"]').value = 'Puná 1';
}

/** Registra la parada `i`: lugar y una medición en la tina 1.
 *  `hora` es opcional a propósito: las pruebas que SELLAN no la pasan, porque la
 *  pone el propio sellado y pre-escribirla haría que la prueba pasara aunque el
 *  sellado dejara de funcionar. Las que guardan sin sellar sí tienen que darla. */
function parada(i, lugar, hora) {
  irA(i);
  panel().querySelector(`.tras-rev[data-rev="${i}"] [data-k="lugar"]`).value = lugar;
  if (hora) rev(i, 'hora', hora);
  tina(i, 1, 'o2', '7.20');
  tina(i, 1, 'temp', '26.0');
}

const registros = () => H._trasRaw();
const filasDe = (recs) => H.buildTrasPayload(recs).rows;
const colRev = () => H.TRAS_HEADERS.indexOf('Revisión');
const revsEnHoja = (recs) => [...new Set(filasDe(recs).map((r) => r[colRev()]))].sort((a, b) => a - b);

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  enviados.length = 0;
  H.__envioOk = true;
  try { H.trasBorrarTraslado(); } catch (_) { /* aún no exportada en el 1.er render */ }
  H.renderTraslado();
});

/* ══════════════════════════════════════════════════════════
   1 · SELLAR Y GUARDAR SON DOS COSAS DISTINTAS
   ══════════════════════════════════════════════════════════ */
describe('Traslado · sellar sella; guardar guarda', () => {
  it('🔴 sellar escribe la hora y NO guarda nada', () => {
    /* La petición del 2026-08-25b. Mezclar las dos funciones hacía que un sellado sin
       cobertura pareciera un fallo del guardado, y dejaba al chequeador sin saber cuál
       de las dos cosas había pasado. Sellar sólo toca el formulario. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio');

    H.trasSellarUbicacion(0);

    expect(leerRev(0, 'hora'), 'la hora queda sellada').toMatch(/^\d{2}:\d{2}$/);
    expect(registros(), 'pero sellar NO guarda').toHaveLength(0);
  });

  it('🔴 «Guardar local» crea el viaje y lo deja PENDIENTE', () => {
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    expect(registros(), 'antes de guardar no hay nada').toHaveLength(0);

    H.trasGuardarLocal();

    const recs = registros();
    expect(recs, 'el viaje queda respaldado en el dispositivo').toHaveLength(1);
    expect(recs[0].synced, 'y PENDIENTE de sincronizar').toBe(false);
    expect(ultimoAviso()).toContain('Guardado localmente');
  });

  it('🔴 guardar cuatro veces actualiza UN viaje, no crea cuatro', () => {
    /* Sin `_trasViajeActivo` cada guardado llamaría a `trasNuevoViajeId()` y el mismo
       camión acabaría repartido en cuatro viajes distintos en la hoja, imposible de
       reconciliar: la llave del upsert lleva dentro el id del viaje. */
    conCamion();
    cabecera();
    ['Laboratorio', 'Peaje 1', 'Gabarra 1', 'Camaronera'].forEach((lug, i) => {
      parada(i, lug, ['20:30', '22:00', '23:30', '01:00'][i]);
      H.trasGuardarLocal();
    });

    const recs = registros();
    expect(recs, 'las cuatro paradas son UN viaje').toHaveLength(1);
    expect(revsEnHoja(recs), 'y las cuatro llegan a la hoja').toEqual([1, 2, 3, 4]);
  });

  it('🔴 el guardado local respalda el VIAJE ENTERO, no sólo la parada visible', () => {
    /* Se pulse donde se pulse, respalda cabecera, camiones y todas las paradas ya
       tecleadas: el registro del dispositivo es el viaje completo y guardar un trozo
       dejaría el resto sin respaldo. Aquí se guarda ESTANDO en la parada 3. */
    conCamion();
    cabecera();
    cab('corrida', '555');
    panel().querySelector('[data-k="modulo"]').value = 'M07';
    cab('horaSalida', '20:30');
    cab('horaLlegada', '06:00');
    cab('salinidad', '32.5');
    parada(0, 'Laboratorio', '20:30');
    parada(1, 'Peaje 1', '22:00');
    parada(2, 'Gabarra 1', '23:30');
    H.trasGuardarLocal();

    const d = registros()[0].data;
    expect(d.corrida, 'la corrida se respalda').toBe('555');
    expect(d.modulo, 'el módulo se respalda').toBe('M07');
    expect(d.camaronera, 'la camaronera se respalda').toBe('Puná 1');
    expect(d.horaSalida, 'la hora de salida se respalda').toBe('20:30');
    expect(d.horaLlegada, 'la hora de llegada se respalda').toBe('06:00');
    expect(d.salinidad, 'la salinidad se respalda').toBe('32.5');
    expect(revsEnHoja(registros()), 'y las tres paradas, no sólo la visible').toEqual([1, 2, 3]);
  });

  it('🔴 «Enviar traslado» NO duplica el viaje que se fue guardando', () => {
    /* Si guardar-y-enviar creara un registro nuevo, la hoja se quedaría con las filas
       del viaje enviado en carretera Y las del completo, bajo llaves distintas. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();
    const idGuardado = registros()[0].id;

    parada(1, 'Peaje 1', '22:00');
    parada(2, 'Camaronera', '23:30');
    H.saveTraslado();

    const recs = registros();
    expect(recs, 'sigue siendo un único viaje').toHaveLength(1);
    expect(recs[0].id, 'y conserva su llave, que ya viajó a la hoja').toBe(idGuardado);
    expect(revsEnHoja(recs), 'con sus tres paradas dentro').toEqual([1, 2, 3]);
  });

  it('🔴 si falta lo mínimo, se dice qué falta y no se guarda a medias', () => {
    /* La fila tiene que ser DIRECCIONABLE en la hoja: sin fecha no lo es. La fecha
       nace con `today()`, así que para quedarse sin ella hay que BORRARLA, que es lo
       que hace un chequeador al ir a corregirla y quedar interrumpido. */
    conCamion();
    panel().querySelector('[data-k="camaronera"]').value = 'Puná 1';
    cab('fecha', '');
    parada(0, 'Laboratorio', '20:30');

    H.trasGuardarLocal();

    expect(registros(), 'no se guarda un viaje sin fecha').toHaveLength(0);
    expect(avisos(), 'y se explica exactamente qué falta').toMatch(/fecha/i);
  });

  it('🔴 vuelve a quedar PENDIENTE si se guarda después de sincronizar', async () => {
    /* En carretera se sincroniza en cada parada. Si guardar la siguiente no volviera a
       marcar el viaje como pendiente, esa parada no se enviaría nunca: el upsert del
       GAS reescribe por llave, así que reenviar es seguro y es lo que hace falta. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();

    await H.syncAllPendingTras();
    expect(registros()[0].synced, 'tras sincronizar queda enviado').toBe(true);

    parada(1, 'Peaje 1', '22:00');
    H.trasGuardarLocal();
    const recs = registros();
    expect(recs, 'y sigue siendo el mismo viaje').toHaveLength(1);
    expect(recs[0].synced, 'que vuelve a estar pendiente').toBe(false);
  });

  it('🔴 el viaje sigue en la ficha después de sincronizar, no se va a ninguna lista', async () => {
    /* Es la petición central del 2026-08-25b: al guardar, la información se queda
       CONGELADA en su revisión junto a la placa del camión. Antes desaparecía del
       formulario y había que rescatarla de la tabla «Traslados guardados» con ✎. */
    conCamion('GSA-1147');
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    await H.saveTraslado();

    expect(panel().querySelector('.tras-camion [data-k="placa"]').value,
      'la placa sigue en pantalla').toBe('GSA-1147');
    expect(leerRev(0, 'lugar'), 'y la parada conserva su lugar').toBe('Laboratorio');
    expect(panel().innerHTML, 'sin tabla de guardados').not.toContain('>Traslados guardados</h4>');
  });
});

/* ══════════════════════════════════════════════════════════
   2 · UN VIAJE A MEDIAS NO ENSUCIA LA HOJA
   ══════════════════════════════════════════════════════════ */
describe('Traslado · las paradas que aún no se han hecho no llegan a la hoja', () => {
  it('🔴 con una sola parada registrada se envía SÓLO esa', () => {
    /* La ficha declara cuatro paradas desde que se abre. Si las tres en blanco
       escribieran filas, el tablero del Supervisor y el mapa pintarían tres paradas
       sin hora, sin lugar y sin oxígeno que nadie visitó: `paradaDe` no filtra
       vacíos, las daría todas por buenas. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();

    expect(revsEnHoja(registros()), 'sólo la parada 1').toEqual([1]);
    expect(filasDe(registros())).toHaveLength(H.TRAS_TINAS);
  });

  it('🔴 saltarse una parada NO renumera las siguientes', () => {
    /* La llave del upsert es `viaje-c<camión>-r<revisión>-t<tina>` y tiene que ser
       DETERMINISTA: si al enviar la parada 3 sin haber hecho la 2 se renumerara a 2,
       el siguiente envío escribiría en otra fila y el GAS duplicaría en vez de
       reescribir. El número sale del ÍNDICE, nunca de un contador de emitidas. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    parada(2, 'Gabarra 1', '23:30');   // la 2.ª se queda sin hacer
    H.trasGuardarLocal();

    expect(revsEnHoja(registros()), 'la tercera parada sigue siendo la 3').toEqual([1, 3]);
  });

  it('🔴 el mínimo del protocolo avisa, pero ya no bloquea', () => {
    /* Decisión del usuario (2026-08-25): con el guardado por revisión el viaje se
       guarda en la parada 1, cuando por definición aún no hay tres. Si siguiera
       bloqueando, la función nueva no serviría hasta la tercera parada — justo
       cuando ya no hace falta. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.saveTraslado();

    expect(registros(), 'se guarda con una sola parada').toHaveLength(1);
    expect(avisos(), 'y se avisa de que el protocolo pide más').toContain(String(H.TRAS_REV_MIN));
  });

  it('🔴 la Alimentación de la tina ofrece combinaciones; los INSUMOS no', () => {
    /* Son DOS catálogos y hasta el 2026-08-25 eran uno solo. La casilla de la tina es
       un desplegable de un valor: para dosificar dos insumos a la vez la combinación
       tiene que existir como opción propia. El grupo «Insumos y materiales a bordo»
       son CASILLAS de qué sube al camión: allí se marcan los dos por separado, y
       heredar las combinaciones habría dejado «Artemia/Flake» junto a «Artemia» y
       «Flake», escribiendo «Artemia, Flake, Artemia/Flake» en una sola celda. */
    conCamion();
    cabecera();
    irA(0);
    const sel = panel().querySelector('.tras-cam-grid[data-rev="0"][data-cam="0"] [data-tina="1"][data-k="alim"]');
    expect(sel, 'hay casilla de alimentación en la tina 1').toBeTruthy();
    const opts = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    ['Artemia/Flake/Prokura/Vitamina C', 'Artemia/Flake', 'Prokura/Vitamina C', 'Flake/Prokura']
      .forEach((c) => expect(opts, 'falta la combinación ' + c).toContain(c));
    expect(opts, 'y los insumos sueltos siguen estando').toContain('Artemia');

    const chips = Array.from(panel().querySelectorAll('[data-group="insumos"]')).map((c) => c.value);
    expect(chips, 'los insumos a bordo NO heredan las combinaciones')
      .toEqual(['Artemia', 'Flake', 'Prokura', 'Vitamina C']);
  });

  it('🔴 la combinación elegida llega ENTERA a la hoja, en una sola celda', () => {
    // Si alguien la partiera por «/» al construir la fila, la hoja recibiría dos
    // valores donde sólo cabe uno y el resto de la fila se desplazaría.
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    irA(0);
    panel().querySelector('.tras-cam-grid[data-rev="0"][data-cam="0"] [data-tina="1"][data-k="alim"]')
      .value = 'Prokura/Vitamina C';
    H.saveTraslado();

    const colAlim = H.TRAS_HEADERS.indexOf('Alimentación');
    const fila = filasDe(registros()).find((r) => r[colAlim] !== '');
    expect(fila, 'la alimentación llegó a alguna fila').toBeTruthy();
    expect(fila[colAlim]).toBe('Prokura/Vitamina C');
  });

  it('🔴 un viaje sin ninguna parada registrada NO se guarda', () => {
    // Es el suelo: escribiría cero filas y anunciaría «guardado» sin nada que enviar.
    conCamion();
    cabecera();
    H.saveTraslado();

    expect(registros()).toHaveLength(0);
    expect(avisos()).toMatch(/al menos una revisión/i);
  });
});

/* ══════════════════════════════════════════════════════════
   3 · CICLO DE VIDA DEL VIAJE EN CURSO
   ══════════════════════════════════════════════════════════ */
describe('Traslado · el viaje en curso se suelta cuando toca', () => {
  it('🔴 «Borrar traslado» deja la ficha lista para el viaje siguiente', () => {
    /* Es como se pasa al viaje siguiente desde que no hay lista (usuario, 2026-08-25b),
       igual que el «Borrar día» de las grillas multisala de maduración. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();
    const idBorrado = registros()[0].id;

    H.trasBorrarTraslado();
    expect(registros(), 'sale del dispositivo').toHaveLength(0);
    expect(panel().querySelectorAll('.tras-camion'), 'y la ficha queda en blanco').toHaveLength(0);

    conCamion('PBX-0392');
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();

    const recs = registros();
    expect(recs, 'el guardado siguiente estrena viaje, no revive el borrado').toHaveLength(1);
    expect(recs[0].id).not.toBe(idBorrado);
    expect(recs[0].data.camiones[0].placa, 'y es el camión NUEVO').toBe('PBX-0392');
  });

  it('🔴 tras «Borrar», NO reaparece un traslado anterior que siguiera guardado', () => {
    /* `trasAdoptarActivo` abre el más reciente cuando no hay ninguno señalado, que es
       lo que el usuario pidió al volver a la pestaña. Pero justo después de pulsar
       «Borrar» eso sería un desastre: le reaparecería OTRO viaje en vez de dejarle
       empezar limpio. Lo resuelve la bandera `_trasEnBlanco`. */
    conCamion('GSA-1147');
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();
    const a = registros()[0];
    // Un traslado ANTERIOR que sigue en el dispositivo, de otra noche y sin caducar.
    const b = { ...a, id: a.id + '-viejo', ts: (a.ts || Date.now()) - 3600000 };
    H._trasSave([a, b]);             // [0] es el más reciente

    H.trasBorrarTraslado();

    expect(registros().map((r) => r.id), 'el anterior sigue guardado').toEqual([b.id]);
    expect(panel().querySelectorAll('.tras-camion'), 'pero la ficha queda EN BLANCO').toHaveLength(0);
    expect(document.getElementById('tras-estado').textContent).toContain('Sin guardar');
  });

  it('🔴 al recargar la página, la ficha abre el traslado MÁS RECIENTE', () => {
    /* Es la otra mitad de «un traslado a la vez»: sin la tabla de guardados, si el
       repintado no adoptara el registro más reciente el viaje quedaría INALCANZABLE
       —guardado y pendiente, pero sin forma de verlo ni de enviarlo—. Y tiene que ser
       el más reciente: abrir el viejo sería enseñar el viaje de anoche. */
    conCamion('GSA-1147');
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();
    const reciente = registros()[0];
    const viejo = {
      ...reciente,
      id: reciente.id + '-viejo',
      ts: (reciente.ts || Date.now()) - 3600000,
      data: { ...reciente.data, camiones: [{ placa: 'XYZ-0001', tinasOff: [] }] },
    };
    H._trasSave([reciente, viejo]);   // [0] es el más reciente

    H.__simularRecarga();             // se pierde el estado en memoria, no el disco
    H.renderTraslado();

    const placa = panel().querySelector('.tras-camion [data-k="placa"]');
    expect(placa, 'la ficha tiene que haber adoptado un traslado').toBeTruthy();
    expect(placa.value, 'y es el MÁS RECIENTE, no el de anoche').toBe('GSA-1147');
  });

  it('🔴 al volver a la pestaña se ADOPTA el traslado guardado, con TODOS sus campos', () => {
    /* Con la tabla de «Traslados guardados» retirada, si el repintado no adoptara el
       registro más reciente el viaje quedaría INALCANZABLE: guardado y pendiente, pero
       sin ninguna forma de verlo ni de enviarlo.

       ⚠ Se comprueba el VIAJE DE VUELTA de la cabecera entera —módulo, corrida,
       camaronera, horas de salida y llegada y salinidad—, que es lo que el usuario
       pidió verificar expresamente. Guardarlos no basta: si no se vuelven a pintar, el
       chequeador los ve en blanco y los teclea otra vez encima. */
    conCamion('GSA-1147');
    cabecera();
    cab('corrida', '555');
    panel().querySelector('[data-k="modulo"]').value = 'M07';
    cab('horaSalida', '20:30');
    cab('horaLlegada', '06:00');
    cab('salinidad', '32.5');
    cab('controlador', 'Juanito de las Mercedes');
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();
    const id = registros()[0].id;

    // Se repinta desde cero, como al volver a entrar en la pestaña.
    H.renderTraslado();

    const leerCab = (k) => panel().querySelector(`.mad-form > .meta [data-k="${k}"]`).value;
    expect(panel().querySelector('.tras-camion [data-k="placa"]').value,
      'la ficha vuelve a abrir el viaje guardado').toBe('GSA-1147');
    expect(leerCab('corrida'), 'la corrida vuelve').toBe('555');
    expect(leerCab('modulo'), 'el módulo vuelve').toBe('M07');
    expect(leerCab('camaronera'), 'la camaronera vuelve').toBe('Puná 1');
    expect(leerCab('horaSalida'), 'la hora de salida vuelve').toBe('20:30');
    expect(leerCab('horaLlegada'), 'la hora de llegada vuelve').toBe('06:00');
    expect(leerCab('salinidad'), 'la salinidad vuelve').toBe('32.5');
    expect(leerCab('controlador'), 'y el pie también').toBe('Juanito de las Mercedes');
    expect(leerRev(0, 'lugar'), 'la parada conserva su lugar').toBe('Laboratorio');
    expect(registros()[0].id).toBe(id);
    expect(document.getElementById('tras-estado').textContent).toContain('Guardado local');
  });

  it('🔴 el autoguardado de 60 s respalda TAMBIÉN el traslado, no sólo el AsT', async () => {
    /* En el módulo AsT viven DOS fichas. Hasta el 2026-08-25 el temporizador sólo
       llamaba a `saveAstRecovery()`, así que el traslado en curso sobrevivía a salir
       del módulo —`goBack()` sí lo respalda— pero NO a que se cerrara el navegador o
       se apagara el teléfono, que es exactamente lo que pasa en carretera de noche. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    expect(H.loadTrasRecovery(), 'antes del tic no hay borrador').toBeNull();

    vi.useFakeTimers();
    try {
      H.startAutoRecovery();
      vi.advanceTimersByTime(60000);
    } finally {
      vi.useRealTimers();
    }

    const borrador = H.loadTrasRecovery();
    expect(borrador, 'el tic de 60 s tiene que haber respaldado el traslado').toBeTruthy();
    expect(borrador.data.camiones[0].placa, 'con lo tecleado dentro').toBe('GSA-1147');
  });

  it('🔴 el borrador de recuperación lleva el id, para continuar el mismo viaje', () => {
    /* Sin el id, recuperar tras un cierre inesperado y volver a guardar crearía un
       SEGUNDO viaje con las mismas paradas: la hoja acabaría con el trayecto
       duplicado bajo dos llaves distintas. */
    conCamion();
    cabecera();
    parada(0, 'Laboratorio', '20:30');
    H.trasGuardarLocal();
    const id = registros()[0].id;

    H.saveTrasRecovery();
    const borrador = H.loadTrasRecovery();
    expect(borrador, 'hay borrador').toBeTruthy();
    expect(borrador.viaje, 'y apunta al viaje en curso').toBe(id);
  });
});
