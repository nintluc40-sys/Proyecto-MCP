// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Traslado — la pestaña de captura, manejada como el chequeador

   Arranca el monolito ENTERO sobre el shell real y opera el formulario: rellena la
   cabecera, declara los camiones, teclea la grilla de tinas de cada uno, sella la
   hora, limpia una revisión, añade y quita revisiones y camiones, y guarda. Es la
   única forma de saber que la pestaña existe de verdad y no sólo que sus funciones
   sueltas devuelven lo esperado — de hecho es lo que cazó el suelo de revisiones
   que hacía inalcanzable el mínimo del protocolo.

   ⚠ En happy-dom NO hay `navigator.geolocation`, que es exactamente el escenario de
   las copias de Music abiertas como archivo local. Sirve de prueba de la degradación.

   Receta del banco en `reference_banco-engine-js`. `new Function` no deja nada en
   globalThis, de ahí el epílogo.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');

const EXPORTAR = ['renderTraslado', 'collectTraslado', 'saveTraslado', '_trasRaw',
  'buildTrasPayload', 'trasAgregarRevision', 'trasQuitarRevision', 'trasLimpiarRevision',
  'trasAgregarCamion', 'trasQuitarCamion', 'validarTraslado', 'trasSellarUbicacion',
  'trasGeoDisponible', 'trasFueraCadencia', 'trasCaidas', 'trasCamiones',
  'trasCamChange', 'trasIrRevision', 'trasRevEstado', 'trasEditar', 'trasRefrescar', 'trasCancelarEdicion',
  'syncAllPendingTras', 'syncOneTrasFromList', 'syncAll', '_trasSave', 'loadTras',
  'buildGrid', '_reconcileMark',
  'trasTempAuto',
  'TRAS_REV_MIN', 'TRAS_REV_INI', 'TRAS_TINAS', 'TRAS_HEADERS', 'TRAS_ACTIVIDAD_OPTS',
  'DESTINO_OPTS'];
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
  // Quitar un camión o limpiar una revisión piden confirmación: en el banco se acepta.
  window.confirm = () => true;

  // El motor delega en __rgLib desde el arranque (buildGrid → mLabel), así que
  // tiene que estar completo ANTES de cargarlo, no vacío.
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
    // T3: la sincronización se prueba con el envío SIMULADO. Nada sale a la red.
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );

  H.setToast((msg) => { toasts.push(String(msg)); });
  // Envio simulado: `enviados` guarda los payloads para poder mirarlos, y
  // `H.__envioOk` decide si la llamada se ENTREGA o falla.
  H.__envioOk = true;
  H.setPost(async (payload) => { enviados.push(payload); return H.__envioOk; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/PRUEBA/exec');
  H.setRate(() => true);
  H.setMod(13);          // AST_MOD
  H.setTab('traslado');

  /* ⚠⚠ PARCHE DEL ENTORNO, NO DE LA APP ────────────────────────────────
     happy-dom NO aplica el atributo `selected` al parsear `innerHTML`: deja el
     `<select>` en la primera opción no vacía. Comprobado en aislamiento:
       '<option value="A">A</option><option value="B" selected>B</option>'
     da `value === "A"`. Un navegador real da "B", y `<option selected>` es HTML
     perfectamente correcto — el monolito NO tiene aquí ningún defecto.

     Importa ahora y no antes porque desde el 2026-08-23 la ficha se REPINTA en
     cada salto del selector. Sin esto, cualquier lectura de Lugar, Actividad o
     Alimentación después de navegar devolvería basura, y las pruebas del commit
     —justo las que vigilan que cambiar de bloque no borre lo tecleado— dejarían
     de significar nada. Se repara el DOM para que se parezca al de verdad.

     Se envuelven las funciones que repintan; reparar en CADA acceso no serviría,
     porque borraría los `.value` que las propias pruebas acaban de asignar. */
  ['renderTraslado', 'trasIrRevision', 'trasCamChange', 'trasAgregarCamion',
    'trasQuitarCamion', 'trasAgregarRevision', 'trasQuitarRevision',
    'trasLimpiarRevision', 'saveTraslado', 'trasEditar', 'trasRefrescar'].forEach((n) => {
    const orig = H[n];
    if (typeof orig !== 'function') throw new Error('no se exportó ' + n);
    H[n] = function envuelta(...args) {
      const r = orig.apply(null, args);
      repararSelects();
      return r;
    };
  });
});

/** Aplica el atributo `selected` que happy-dom ignoró. Idempotente. */
function repararSelects() {
  const p = document.getElementById('fp-traslado');
  if (!p) return;
  p.querySelectorAll('select').forEach((s) => {
    const i = Array.from(s.options).findIndex((o) => o.hasAttribute('selected'));
    s.selectedIndex = i >= 0 ? i : 0;
  });
}

const panel = () => document.getElementById('fp-traslado');
const cab = (k, v) => {
  const el = panel().querySelector(`.mad-form > .meta [data-k="${k}"], .mad-form > .mf [data-k="${k}"]`);
  if (!el) throw new Error('sin campo de cabecera ' + k);
  el.value = v;
};
const placa = (ci, v) => {
  const el = panel().querySelector(`.tras-camion[data-cam="${ci}"] [data-k="placa"]`);
  if (!el) throw new Error('sin placa del camión ' + ci);
  el.value = v;
};

/* ── ALTA DE CAMIONES (rediseño del 2026-08-23) ────────────────
   El viaje ya NO nace con un camión en blanco: se dan de alta uno a uno
   escribiendo la placa, marcando sus tinas y pulsando el botón. El banco hace
   exactamente eso, que es lo único que prueba que el flujo nuevo funciona. */
const PLACAS = ['GSA-1147', 'PBX-0392', 'XYZ-0001'];
const altaCamion = (placaTxt, tinasFuera) => {
  const el = panel().querySelector('#tras-alta-placa');
  if (!el) throw new Error('sin formulario de alta');
  el.value = placaTxt;
  (tinasFuera || []).forEach((t) => {
    const c = panel().querySelector(`[data-alta][data-tina-on="${t}"]`);
    if (!c) throw new Error('sin casilla de tina ' + t + ' en el alta');
    c.checked = false;
  });
  H.trasAgregarCamion();
};
/** Da de alta y EXIGE que el camión haya entrado. Ver `altaSegura` abajo. */
const altaCamionEstricta = (placaTxt, tinasFuera) => {
  const antes = nCamiones();
  altaCamion(placaTxt, tinasFuera);
  if (nCamiones() !== antes + 1) {
    throw new Error(`el alta de «${placaTxt}» no añadió el camión (aviso: ${ultimoAviso()})`);
  }
};
/** Un camión cualquiera, para las pruebas que sólo necesitan que haya grilla. */
const conCamion = () => altaCamion(PLACAS[0]);
/* ── NAVEGACIÓN ────────────────────────────────────────────────
   Desde 2026-08-23 la ficha enseña UNA (camión, revisión) a la vez, así que el
   banco tiene que moverse por el selector igual que el chequeador con el dedo:
   pinchar la placa y la ficha de la parada antes de poder teclear en ella.

   Ésa es justamente la razón de ser de estas pruebas ahora: cada salto
   commitea lo visible al modelo, y si el commit se rompiera, moverse entre
   bloques empezaría a borrar lo tecleado SIN dar ningún síntoma. */
const enPantalla = (i) => !!panel().querySelector(`.tras-rev[data-rev="${i}"]`);
const camActivo = () => {
  const sel = panel().querySelector('#tras-cam-sel');
  return sel ? Number(sel.value) : 0;
};
/** Deja visible el bloque (revisión `i`, camión `ci`). No navega si ya lo está. */
const irA = (i, ci) => {
  if (ci != null && camActivo() !== ci) {
    const sel = panel().querySelector('#tras-cam-sel');
    if (!sel) throw new Error('sin selector de camión');
    sel.value = String(ci);
    H.trasCamChange();
  }
  if (!enPantalla(i)) H.trasIrRevision(i);
  if (!enPantalla(i)) throw new Error(`no se pudo abrir la revisión ${i}`);
};
const rev = (i, k, v) => {
  irA(i, null);
  const el = panel().querySelector(`.tras-rev[data-rev="${i}"] [data-k="${k}"]:not([data-cam])`);
  if (!el) throw new Error(`sin campo ${k} en la revisión ${i}`);
  el.value = v;
};
/** Lee un campo de revisión, navegando si hace falta. */
const leerRev = (i, k) => {
  irA(i, null);
  const el = panel().querySelector(`.tras-rev[data-rev="${i}"] [data-k="${k}"]:not([data-cam])`);
  if (!el) throw new Error(`sin campo ${k} en la revisión ${i}`);
  return el.value;
};
const tina = (i, ci, t, k, v) => {
  irA(i, ci);
  const el = panel().querySelector(`.tras-cam-grid[data-rev="${i}"][data-cam="${ci}"] [data-tina="${t}"][data-k="${k}"]`);
  if (!el) throw new Error(`sin tina ${t}/${k} en rev ${i} camión ${ci}`);
  el.value = v;
};
const leerTina = (i, ci, t, k) => {
  irA(i, ci);
  const el = panel().querySelector(`.tras-cam-grid[data-rev="${i}"][data-cam="${ci}"] [data-tina="${t}"][data-k="${k}"]`);
  if (!el) throw new Error(`sin tina ${t}/${k} en rev ${i} camión ${ci}`);
  return el.value;
};
/** Saca del viaje la tina `t` del camión `ci`. Las casillas son POSITIVAS desde el
 *  2026-08-23 («tinas que lleva»), así que sacarla es DESmarcarla. */
const marcarOff = (ci, t) => {
  const el = panel().querySelector(`.tras-camion[data-cam="${ci}"] [data-tina-on="${t}"]`);
  if (!el) throw new Error('sin casilla de tina');
  el.checked = false;
};
const ultimoAviso = () => (toasts.length ? toasts[toasts.length - 1] : '');
const nCamiones = () => panel().querySelectorAll('.tras-camion').length;
// Las revisiones ya no se cuentan por bloques pintados (sólo hay uno), sino por
// las fichas del selector, que son las que declaran cuántas paradas tiene el viaje.
const nRevisiones = () => panel().querySelectorAll('[data-rev-tab]').length;

/** Rellena un viaje válido con `nCam` camiones, como el chequeador en ruta. */
function viajeCompleto(nCam) {
  const total = nCam || 1;
  // Los camiones se dan de alta con su placa desde el principio: ya no existe la
  // tarjeta en blanco que había que rellenar después.
  //
  // ⚠⚠ NADA de `while (nCamiones() < total)`. Si el alta deja de funcionar, ese
  // bucle gira PARA SIEMPRE y la prueba no falla: se cuelga. Lo pagamos con la
  // mutación U27 —dos tandas del banco muertas por timeout antes de entender por
  // qué—. Un banco de pruebas tiene que FALLAR, nunca colgarse: cualquier bucle
  // que dependa de que la app haga algo va acotado y con un error que lo explique.
  for (let i = nCamiones(); i < total; i += 1) altaCamionEstricta(PLACAS[i]);
  cab('fecha', '2026-08-18');
  cab('corrida', '555');
  panel().querySelector('[data-k="modulo"]').value = 'M07';
  panel().querySelector('[data-k="camaronera"]').value = 'Puná 1';
  cab('horaSalida', '20:30');
  cab('horaLlegada', '06:00');
  cab('controlador', 'Juanito de las Mercedes');
  cab('chequeador', 'Pepito Acosta');
  const horas = ['20:30', '22:00', '23:30', '01:00'];
  const lugares = ['Laboratorio', 'Peaje', 'Gabarra', 'Camaronera'];
  const nRev = nRevisiones();
  for (let i = 0; i < nRev; i += 1) {
    for (let ci = 0; ci < total; ci += 1) {
      irA(i, ci);
      if (ci === 0) {
        rev(i, 'hora', horas[i] || '03:00');
        panel().querySelector(`.tras-rev[data-rev="${i}"] [data-k="lugar"]`).value = lugares[i] || 'Camaronera';
      }
      for (let t = 1; t <= 8; t += 1) {
        tina(i, ci, t, 'o2', String(7.5 - i * 0.2 - ci * 0.3));
        tina(i, ci, t, 'temp', '26');
        panel().querySelector(`.tras-cam-grid[data-rev="${i}"][data-cam="${ci}"] [data-tina="${t}"][data-k="act"]`).value = 'Alta';
        panel().querySelector(`.tras-cam-grid[data-rev="${i}"][data-cam="${ci}"] [data-tina="${t}"][data-k="alim"]`).value = 'Artemia';
      }
    }
  }
  irA(0, 0);   // se cierra el llenado dejando el viaje en su primera parada
}

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  enviados.length = 0;
  H.__envioOk = true;
  // ⚠ `_trasEditing` es estado de MÓDULO: sin esto, una prueba que edita deja a la
  // siguiente en modo edición apuntando a un registro que ya no existe.
  try { H.trasCancelarEdicion(); } catch (_) { /* aún no exportada en el 1.er render */ }
  H.renderTraslado();
});

describe('Traslado · la pestaña se dibuja', () => {
  it('el panel existe y no queda vacío', () => {
    expect(panel()).toBeTruthy();
    expect(panel().innerHTML.length).toBeGreaterThan(2000);
  });

  it('abre con 4 revisiones y SIN camiones', () => {
    // Antes nacía con una tarjeta en blanco. Desde el rediseño del alta, el viaje
    // empieza vacío y lo dice; el camión se añade a propósito.
    expect(nCamiones()).toBe(0);
    expect(panel().textContent).toContain('Añade el primer camión');
    // Sin camiones no hay nada que medir: tampoco selector ni grilla.
    expect(panel().querySelector('#tras-cam-sel')).toBeNull();
    expect(nRevisiones()).toBe(0);
    // y en cuanto entra el primer camión aparecen las 4 paradas del papel
    conCamion();
    expect(nRevisiones()).toBe(4);
    expect(nCamiones()).toBe(1);
  });

  it('🔴 no muestra los campos que el usuario retiró', () => {
    // 'tanque' se retiró el 2026-08-23; los otros tres, el 08-20.
    ['laboratorio', 'guia', 'camion', 'tanque'].forEach((k) => {
      expect(panel().querySelector(`[data-k="${k}"]`)).toBeNull();
    });
    // Alimentos a bordo desaparece; los insumos se quedan.
    expect(panel().querySelector('[data-group="alimentos"]')).toBeNull();
    expect(panel().querySelector('[data-group="insumos"]')).toBeTruthy();
    expect(panel().textContent).toContain('Insumos');
    expect(panel().textContent).not.toContain('Alimentos a bordo');
  });

  it('🔴 «Tanque» ya no viaja a la hoja', () => {
    expect(H.TRAS_HEADERS).not.toContain('Tanque');
    expect(H.TRAS_HEADERS).toHaveLength(29);
    // y el ID sigue siendo la ÚLTIMA columna, que es de lo que depende el upsert
    expect(H.TRAS_HEADERS[H.TRAS_HEADERS.length - 1]).toBe('ID');
  });

  it('🔴 Actividad ofrece Alta, Normal, Media y Baja, en ese orden', () => {
    conCamion();
    const sel = panel().querySelector('.tras-cam-grid [data-tina="1"][data-k="act"]');
    const vals = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    // El orden es el de la ESCALA, no el alfabético: es lo que ve el chequeador.
    expect(vals).toEqual(['Alta', 'Normal', 'Media', 'Baja']);
  });

  it('la camaronera despliega el catálogo de la ficha de Despacho', () => {
    const sel = panel().querySelector('[data-k="camaronera"]');
    expect(sel.tagName).toBe('SELECT');
    expect(Array.from(sel.options).map((o) => o.value).filter(Boolean)).toEqual(H.DESTINO_OPTS);
  });

  it('cada camión trae su grilla de 8 tinas × 4 variables por revisión', () => {
    conCamion();
    const g = panel().querySelector('.tras-cam-grid[data-rev="0"][data-cam="0"]');
    ['o2', 'temp', 'act', 'alim'].forEach((k) => {
      expect(g.querySelectorAll(`[data-tina][data-k="${k}"]`)).toHaveLength(H.TRAS_TINAS);
    });
  });

  it('no deja rastros de render en el texto visible', () => {
    expect(panel().textContent).not.toMatch(/undefined|NaN|\[object Object\]/);
  });
});

describe('Traslado · dos camiones en un viaje', () => {
  it('🔴 se puede añadir un segundo camión y cada revisión tiene grilla para los dos', () => {
    altaCamion(PLACAS[0]); altaCamion(PLACAS[1]);
    expect(nCamiones()).toBe(2);
    // Ahora se pinta una grilla por vez, así que se comprueba ABRIENDO cada
    // combinación: las ocho tienen que existir y traer sus 8 tinas.
    for (let i = 0; i < 4; i += 1) {
      for (let ci = 0; ci < 2; ci += 1) {
        irA(i, ci);
        const g = panel().querySelector(`.tras-cam-grid[data-rev="${i}"][data-cam="${ci}"]`);
        expect(g, `falta la grilla rev ${i} camión ${ci}`).toBeTruthy();
        expect(g.querySelectorAll('[data-tina][data-k="o2"]')).toHaveLength(H.TRAS_TINAS);
      }
    }
    // y en pantalla sólo hay UNA a la vez
    expect(panel().querySelectorAll('.tras-cam-grid')).toHaveLength(1);
  });

  it('🔴 dos camiones producen 64 filas, cada una con SU placa', () => {
    viajeCompleto(2);
    H.saveTraslado();
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    expect(rows).toHaveLength(64);
    const iPlaca = headers.indexOf('Placa');
    const iId = headers.indexOf('ID');
    expect(rows.filter((r) => r[iPlaca] === 'GSA-1147')).toHaveLength(32);
    expect(rows.filter((r) => r[iPlaca] === 'PBX-0392')).toHaveLength(32);
    // y las llaves de los dos no colisionan
    expect(new Set(rows.map((r) => r[iId])).size).toBe(64);
  });

  it('🔴 lo tecleado en un camión no se derrama al otro', () => {
    viajeCompleto(2);
    tina(2, 1, 6, 'o2', '5.2');
    H.saveTraslado();
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    const busca = (id) => rows.find((r) => r[headers.indexOf('ID')].endsWith(id));
    expect(busca('-c2-r3-t6')[headers.indexOf('Oxígeno (mg/L)')]).toBe(5.2);
    expect(busca('-c1-r3-t6')[headers.indexOf('Oxígeno (mg/L)')]).toBe(7.1);
  });

  it('🔴 apagar una tina del camión 1 no la apaga en el 2', () => {
    viajeCompleto(2);
    marcarOff(0, 7);
    H.saveTraslado();
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    const iId = headers.indexOf('ID');
    const iTina = headers.indexOf('Tina');
    expect(rows.filter((r) => /-c1-/.test(r[iId]) && r[iTina] === 7)).toHaveLength(0);
    expect(rows.filter((r) => /-c2-/.test(r[iId]) && r[iTina] === 7)).toHaveLength(4);
  });

  it('sin placa no guarda y dice qué camión', () => {
    viajeCompleto(2);
    placa(1, '');
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(0);
    expect(ultimoAviso()).toContain('Camión 2');
  });

  it('rechaza dos camiones con la misma placa', () => {
    viajeCompleto(2);
    placa(1, 'GSA-1147');
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(0);
    expect(ultimoAviso()).toContain('repetida');
  });

  it('quitar un camión borra sus mediciones y deja las del otro', () => {
    viajeCompleto(2);
    H.trasQuitarCamion(0);
    expect(nCamiones()).toBe(1);
    expect(panel().querySelector('.tras-camion[data-cam="0"] [data-k="placa"]').value).toBe('PBX-0392');
    H.saveTraslado();
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    expect(rows).toHaveLength(32);
    rows.forEach((r) => expect(r[headers.indexOf('Placa')]).toBe('PBX-0392'));
  });

  it('🔴 quedarse sin camiones es legítimo, pero entonces no se guarda', () => {
    // Antes se impedía quitar el último. Con el alta explícita, vaciar y volver a
    // empezar es un camino normal (una placa mal apuntada); lo que no puede es
    // guardarse así, y la validación tiene que DECIRLO.
    viajeCompleto(1);
    H.trasQuitarCamion(0);
    expect(nCamiones()).toBe(0);
    expect(panel().textContent).toContain('Añade el primer camión');
    toasts.length = 0;
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(0);
    expect(ultimoAviso()).toContain('al menos un camión');
  });
});

describe('Traslado · guardar', () => {
  it('un viaje de un camión se guarda y produce 32 filas', () => {
    viajeCompleto(1);
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(1);
    expect(ultimoAviso()).toContain('Traslado guardado');
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    expect(headers).toHaveLength(29);   // 27 + Corrida y Módulo, añadidas el 08-23
    expect(rows).toHaveLength(32);
    expect(rows[0][headers.indexOf('Camaronera')]).toBe('Puná 1');
    expect(rows[0][headers.indexOf('Placa')]).toBe('GSA-1147');
  });

  it('sin camaronera no guarda y lo dice', () => {
    viajeCompleto(1);
    panel().querySelector('[data-k="camaronera"]').value = '';
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(0);
    expect(ultimoAviso()).toContain('camaronera');
  });

  it('una revisión sin hora no guarda y señala cuál', () => {
    viajeCompleto(1);
    rev(2, 'hora', '');
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(0);
    expect(ultimoAviso()).toContain('Revisión 3');
  });
});

describe('Traslado · revisiones', () => {
  it('se pueden añadir más allá de las cuatro del papel', () => {
    viajeCompleto(1);
    H.trasAgregarRevision();
    expect(nRevisiones()).toBe(5);
    expect(leerRev(0, 'hora')).toBe('20:30');
    expect(leerTina(0, 0, 1, 'o2')).toBe('7.5');
  });

  it('🔴 no se puede bajar del mínimo del protocolo', () => {
    expect(H.TRAS_REV_MIN).toBe(3);
    viajeCompleto(1);
    H.trasQuitarRevision(3);
    expect(nRevisiones()).toBe(3);
    toasts.length = 0;
    H.trasQuitarRevision(2);
    expect(nRevisiones()).toBe(3);
    expect(ultimoAviso()).toContain('al menos 3');
  });

  it('🔴 «Limpiar» vacía SOLO esa revisión y conserva el resto del viaje', () => {
    // Es lo que hace falta cuando se sella una hora equivocada o se teclea en la
    // fila que no era: la revisión sigue existiendo, pero sin datos.
    viajeCompleto(2);
    expect(panel().textContent).toContain('Limpiar');
    H.trasLimpiarRevision(1);
    expect(nRevisiones()).toBe(4);
    expect(leerRev(1, 'hora')).toBe('');
    expect(leerRev(1, 'lugar')).toBe('');
    expect(leerTina(1, 0, 1, 'o2')).toBe('');
    expect(leerTina(1, 1, 1, 'o2')).toBe('');
    // las vecinas siguen intactas, en los dos camiones
    expect(leerRev(0, 'hora')).toBe('20:30');
    expect(leerTina(2, 1, 1, 'o2')).toBe('6.8');
    expect(ultimoAviso()).toContain('vaciada');
  });

  it('«Limpiar» también borra la ubicación sellada por error', () => {
    viajeCompleto(1);
    irA(0, 0);
    H.trasSellarUbicacion(0);
    expect(leerRev(0, 'ubicacion')).toBe('sin señal');
    H.trasLimpiarRevision(0);
    expect(leerRev(0, 'ubicacion')).toBe('');
  });
});

describe('Traslado · hora y ubicación', () => {
  it('🔴 sin geolocalización el formulario sigue funcionando y sella la hora', () => {
    // Es el caso de las copias de Music abiertas como archivo local.
    expect(H.trasGeoDisponible()).toBe(false);
    viajeCompleto(1);
    rev(0, 'hora', '');
    expect(() => H.trasSellarUbicacion(0)).not.toThrow();
    expect(leerRev(0, 'hora')).toMatch(/^\d{2}:\d{2}$/);
    expect(leerRev(0, 'ubicacion')).toBe('sin señal');
    expect(ultimoAviso()).toContain('Hora sellada');
  });

  it('avisa en pantalla de que esta versión no puede tomar la ubicación', () => {
    conCamion();
    expect(panel().textContent).toContain('no puede tomar la ubicación');
  });
});

describe('Traslado · avisos del protocolo', () => {
  it('un viaje dentro de cadencia no genera aviso', () => {
    viajeCompleto(1);   // 20:30 · 22:00 · 23:30 · 01:00 → 90 min cada tramo
    H.saveTraslado();
    expect(H.trasFueraCadencia(H._trasRaw()[0].data)).toEqual([]);
  });

  it('🔴 el ritmo del formato real (cada 3 h 10) sí avisa, cruzando la medianoche', () => {
    viajeCompleto(1);
    ['20:30', '23:40', '02:50', '06:00'].forEach((h, i) => rev(i, 'hora', h));
    H.saveTraslado();
    const fuera = H.trasFueraCadencia(H._trasRaw()[0].data);
    expect(fuera).toHaveLength(3);
    expect(fuera.every((f) => f.minutos === 190)).toBe(true);
    expect(ultimoAviso()).toContain('fuera de cadencia');
  });

  it('🔴 la caída de oxígeno dice en qué camión ocurre', () => {
    viajeCompleto(2);
    tina(2, 1, 6, 'o2', '5.2');
    H.saveTraslado();
    const c = H.trasCaidas(H._trasRaw()[0].data, 0.5)
      .find((x) => x.revision === 3 && x.tina === 6 && x.campo === 'o2' && x.camion === 2);
    expect(c).toBeTruthy();
    expect(c.placa).toBe('PBX-0392');
  });
});

/* ══════════════════════════════════════════════════════════════
   EL SELECTOR (2026-08-23)

   La ficha pasó a enseñar UNA (camión, revisión) a la vez. El riesgo que eso
   introduce no es visual sino de PÉRDIDA DE DATOS: como el DOM ya no contiene el
   viaje entero, un commit roto haría que moverse por el selector fuese borrando
   lo tecleado, y sin un solo síntoma hasta que la hoja llegase vacía.

   Estas pruebas existen para eso. Se comprobaron por mutación: rompiendo el
   commit —o invirtiendo el orden «commitear, luego mover»— se ponen rojas.
   ══════════════════════════════════════════════════════════════ */
describe('Traslado · el selector de camión y parada', () => {
  it('sólo se pinta un bloque a la vez', () => {
    altaCamion(PLACAS[0]); altaCamion(PLACAS[1]);
    expect(panel().querySelectorAll('.tras-rev')).toHaveLength(1);
    expect(panel().querySelectorAll('.tras-cam-grid')).toHaveLength(1);
  });

  it('el selector ofrece las placas y una ficha por parada', () => {
    altaCamion('GSA-1147'); altaCamion('PBX-0392');
    H.trasIrRevision(0);
    const sel = panel().querySelector('#tras-cam-sel');
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['GSA-1147', 'PBX-0392']);
    expect(nRevisiones()).toBe(4);
  });

  it('🔴 el alta EXIGE placa y no admite repetirla', () => {
    // La placa es lo único que distingue a un camión de otro en la hoja, así que
    // el alta la exige en el momento — antes se podía crear una tarjeta en blanco
    // y olvidarla, y el defecto sólo aparecía al guardar.
    altaCamion('');
    expect(nCamiones()).toBe(0);
    expect(ultimoAviso()).toContain('placa');
    altaCamion('GSA-1147');
    expect(nCamiones()).toBe(1);
    toasts.length = 0;
    altaCamion('gsa-1147');            // la misma, en minúsculas
    expect(nCamiones()).toBe(1);
    expect(ultimoAviso()).toContain('ya está en este viaje');
  });

  it('🔴 el alta se lleva las tinas que se marcaron, no todas', () => {
    altaCamion('GSA-1147', [7, 8]);    // este camión viaja con 6 tinas
    expect(panel().textContent).toContain('6/8 tinas');
    H.saveTraslado();                  // no valida, pero deja el modelo commiteado
    const d = H.collectTraslado();
    expect(d.camiones[0].tinasOff.sort()).toEqual([7, 8]);
  });

  it('🔴 cambiar de camión NO borra lo tecleado en el anterior', () => {
    altaCamion('GSA-1147'); altaCamion('PBX-0392');
    tina(0, 0, 3, 'o2', '7.77');
    irA(0, 1);                       // se salta al segundo camión
    tina(0, 1, 3, 'o2', '6.11');
    irA(0, 0);                       // y se vuelve al primero
    expect(leerTina(0, 0, 3, 'o2')).toBe('7.77');
    expect(leerTina(0, 1, 3, 'o2')).toBe('6.11');
  });

  it('🔴 cambiar de parada NO borra lo tecleado en la anterior', () => {
    conCamion();
    rev(0, 'hora', '20:30');
    tina(0, 0, 1, 'o2', '7.50');
    irA(2, 0);
    rev(2, 'hora', '23:30');
    tina(2, 0, 1, 'o2', '6.90');
    irA(0, 0);
    expect(leerRev(0, 'hora')).toBe('20:30');
    expect(leerTina(0, 0, 1, 'o2')).toBe('7.50');
    irA(2, 0);
    expect(leerRev(2, 'hora')).toBe('23:30');
    expect(leerTina(2, 0, 1, 'o2')).toBe('6.90');
  });

  it('🔴 lo que nunca se llegó a abrir sigue vacío, no se inventa', () => {
    // El otro lado del commit: rellenar el modelo con paradas fantasma sería tan
    // dañino como borrarlas, porque el payload las mandaría a la hoja.
    viajeCompleto(1);
    H.trasAgregarRevision();          // la 5.ª nace vacía y no se toca
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(0);   // no valida: le falta hora y lugar
    expect(ultimoAviso()).toContain('Revisión 5');
  });

  it('🔴 las fichas dicen qué paradas están llenas y cuáles no', () => {
    viajeCompleto(1);
    // Todas llenas para el camión 1…
    for (let i = 0; i < 4; i += 1) expect(H.trasRevEstado(H.collectTraslado(), i, 0)).toBe('llena');
    // …y vaciar una se refleja en su ficha.
    H.trasLimpiarRevision(2);
    expect(H.trasRevEstado(H.collectTraslado(), 2, 0)).toBe('vacia');
    expect(H.trasRevEstado(H.collectTraslado(), 1, 0)).toBe('llena');
  });

  it('🔴 el aviso de cadencia sigue vivo aunque la parada anterior no esté en pantalla', () => {
    // La hora de la parada anterior se leía del DOM. Desde que sólo se pinta una,
    // esa consulta devolvería "" y el aviso habría desaparecido en silencio: se
    // lee del modelo.
    //
    // ⚠ El SALTO importa. Viniendo de la parada 0 a la 1, el DOM todavía tiene la
    // 0 mientras se construye el HTML nuevo, así que la versión rota también
    // acertaría y la prueba no probaría nada (lo dijo la mutación U05). Hay que
    // llegar a la 1 desde la 3, donde el DOM saliente NO contiene la 0.
    conCamion();
    rev(0, 'hora', '20:30');
    irA(1, 0);
    rev(1, 'hora', '23:40');          // 190 min > 120 de cadencia
    irA(3, 0);                        // se aparca en la última…
    irA(1, 0);                        // …y se salta a la 1 sin pasar por la 0
    expect(panel().querySelector('.tras-rev[data-rev="0"]')).toBeNull();
    expect(panel().textContent).toContain('fuera de cadencia');
  });

  it('un viaje nuevo empieza en blanco y abre en la primera parada', () => {
    viajeCompleto(1);
    irA(3, 0);                        // se termina el viaje mirando la última
    H.saveTraslado();
    H.renderTraslado();               // formulario fresco tras guardar
    // El viaje siguiente arranca sin camiones y sin el alta a medio teclear…
    expect(nCamiones()).toBe(0);
    expect(panel().querySelector('#tras-alta-placa').value).toBe('');
    // …y al dar de alta el primero, abre en la parada 1, no donde quedó el anterior.
    conCamion();
    expect(panel().querySelector('.tras-rev[data-rev="0"]')).toBeTruthy();
    expect(camActivo()).toBe(0);
  });

  it('quitar el camión que se estaba mirando no deja el selector colgado', () => {
    altaCamion('GSA-1147'); altaCamion('PBX-0392');
    irA(0, 1);
    H.trasQuitarCamion(1);
    expect(nCamiones()).toBe(1);
    expect(camActivo()).toBe(0);
    expect(panel().querySelector('.tras-cam-grid[data-cam="0"]')).toBeTruthy();
  });

  it('quitar la revisión que se estaba mirando no deja el selector colgado', () => {
    viajeCompleto(1);
    irA(3, 0);
    H.trasQuitarRevision(3);
    expect(nRevisiones()).toBe(3);
    // se cae a la última que queda, no a un índice inexistente
    expect(panel().querySelector('.tras-rev[data-rev="2"]')).toBeTruthy();
    expect(panel().textContent).not.toMatch(/undefined|NaN/);
  });
});

describe('Traslado · insumos y check compactos', () => {
  it('los dos grupos siguen ahí y marcan de verdad', () => {
    const ins = panel().querySelectorAll('[data-group="insumos"]');
    const chk = panel().querySelectorAll('[data-group="check"]');
    expect(ins).toHaveLength(4);
    expect(chk).toHaveLength(4);
    ins[0].checked = true;
    chk[1].checked = true;
    const d = H.collectTraslado();
    expect(d.insumos).toEqual(['Artemia']);
    expect(d.check).toEqual(['Linterna']);
  });

  it('🔴 la casilla sigue siendo alcanzable, no se oculta con display:none', () => {
    // El chip pinta el estado con su propio relleno, pero si la casilla se
    // ocultara con display:none dejaría de existir para el teclado y para el
    // lector de pantalla. Se tapa con opacity, que sí la conserva.
    const c = panel().querySelector('[data-group="insumos"]');
    expect(c.getAttribute('style')).toContain('opacity:0');
    expect(c.getAttribute('style')).not.toContain('display:none');
  });

  it('sobreviven a un salto de bloque', () => {
    conCamion();
    panel().querySelectorAll('[data-group="check"]').forEach((c) => { c.checked = true; });
    irA(2, 0);
    const d = H.collectTraslado();
    expect(d.check).toHaveLength(4);
  });
});

/* ══════════════════════════════════════════════════════════════
   LO QUE DESTAPÓ LA MUTACIÓN

   Al pasar `mutar-traslado-ui.mjs` sobrevivieron cinco mutaciones. Tres eran
   lagunas de verdad —el verde no probaba nada ahí— y se cierran abajo. Las otras
   dos resultaron ser mutantes EQUIVALENTES; están explicadas en el propio banco,
   porque perseguirlas con pruebas nuevas habría sido perseguir un fantasma.
   ══════════════════════════════════════════════════════════════ */
describe('Traslado · lo que destapó la mutación', () => {
  it('🔴 quitar una parada no deja cola detrás en el payload', () => {
    // Que el modelo se recorte a `_trasRevCount` importa: sin ello la 4.ª parada
    // seguiría viva en memoria aunque el selector ya sólo enseñe tres, y el
    // payload la mandaría a la hoja — 32 filas donde debe haber 24.
    viajeCompleto(1);
    H.trasQuitarRevision(3);
    expect(nRevisiones()).toBe(3);
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(1);
    const { rows } = H.buildTrasPayload(H._trasRaw());
    expect(rows).toHaveLength(24);            // 3 paradas × 8 tinas, no 4 × 8
    expect(H._trasRaw()[0].data.revisiones).toHaveLength(3);
    expect(rows.some((r) => /-r4-/.test(r[H.TRAS_HEADERS.indexOf('ID')]))).toBe(false);
  });

  it('🔴 quitar el camión activo deja el selector señalando al que queda', () => {
    // Sin el recorte del render, `_trasCamActivo` se queda en 1 con un solo
    // camión: el desplegable no señala NADA y el rótulo de tinas miente.
    //
    // ⚠ Hay que mirar el atributo `selected`, no `.value`. Un select sin ninguna
    // opción marcada devuelve igualmente la primera, así que comprobar el valor
    // daba verde con el índice roto — es lo que dijo la mutación U08.
    altaCamion('GSA-1147'); altaCamion('PBX-0392');
    marcarOff(1, 8);                  // el 2.º camión viaja con 7 tinas
    tina(0, 1, 2, 'o2', '6.55');      // se teclea en el SEGUNDO camión
    irA(0, 1);
    H.trasQuitarCamion(0);            // y se borra el PRIMERO, estando en el 2.º
    expect(nCamiones()).toBe(1);
    const marcada = panel().querySelector('#tras-cam-sel option[selected]');
    expect(marcada, 'el desplegable se quedó sin ninguna opción señalada').toBeTruthy();
    expect(marcada.value).toBe('0');
    expect(panel().textContent).toContain('7 de 8 tinas en uso');
    // lo que queda es el camión que sobrevivió, y su medición sigue ahí
    expect(panel().querySelector('.tras-camion[data-cam="0"] [data-k="placa"]').value).toBe('PBX-0392');
    expect(leerTina(0, 0, 2, 'o2')).toBe('6.55');
  });

  it('🔴 quien mute lo que devuelve collectTraslado no corrompe el formulario', () => {
    // `collectTraslado` devuelve una copia justamente porque quien lo llama suele
    // mutarlo (añadir camión, quitar parada) antes de repintar. Si devolviera el
    // modelo vivo, esas mutaciones se aplicarían por referencia.
    //
    // ⚠ Hay que corromper una parada que NO esté en pantalla. La visible se vuelve
    // a leer del DOM en la siguiente recogida, así que se cura sola y la prueba
    // pasaría con el modelo vivo — es lo que dijo la mutación U20.
    viajeCompleto(1);
    irA(0, 0);                        // la 2 queda fuera de pantalla
    const copia = H.collectTraslado();
    copia.revisiones[2].hora = '99:99';
    copia.revisiones[2].camiones[0].tinas[1].o2 = 'DESTRUIDO';
    const otra = H.collectTraslado();
    expect(otra.revisiones[2].hora).toBe('23:30');
    expect(otra.revisiones[2].camiones[0].tinas[1].o2).toBe('7.1');
    expect(leerRev(2, 'hora')).toBe('23:30');
  });
});

/* ══════════════════════════════════════════════════════════════
   LOS CINCO CAMBIOS DEL 2026-08-23 (segunda tanda)
   Corrida y Módulo · el botón junto a la placa · título de los checks ·
   alta explícita de camiones · Guardar junto a Limpiar.
   ══════════════════════════════════════════════════════════════ */
describe('Traslado · Corrida y Módulo', () => {
  it('los dos campos están en la cabecera', () => {
    expect(panel().querySelector('.mad-form > .meta [data-k="corrida"]')).toBeTruthy();
    expect(panel().querySelector('.mad-form > .meta [data-k="modulo"]')).toBeTruthy();
  });

  it('🔴 Módulo despliega M01…M10 y CIO, en la grafía CORTA', () => {
    const sel = panel().querySelector('[data-k="modulo"]');
    expect(sel.tagName).toBe('SELECT');
    const vals = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    expect(vals).toEqual(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'CIO']);
    // ⚠ NO la grafía larga de Registro_Supervisión: dos grafías del mismo valor es
    // el defecto que costó caro con los nombres del analista.
    expect(vals).not.toContain('Módulo 7');
  });

  it('🔴 la Corrida viaja como NÚMERO, no como texto', () => {
    // Es lo que permite ordenar y filtrar por corrida en la hoja. Si pasara por el
    // saneado de texto llegaría como "555" y la hoja la trataría como etiqueta.
    viajeCompleto(1);
    H.saveTraslado();
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    const corrida = rows[0][headers.indexOf('Corrida')];
    expect(corrida).toBe(555);
    expect(typeof corrida).toBe('number');
    expect(rows[0][headers.indexOf('Módulo')]).toBe('M07');
  });

  it('van en TODAS las filas del viaje, no sólo en la primera', () => {
    // Son de grano «viaje»: la hoja es formato largo y cada fila tiene que poder
    // leerse sola, sin reconstruir el traslado.
    viajeCompleto(2);
    H.saveTraslado();
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    const iC = headers.indexOf('Corrida');
    const iM = headers.indexOf('Módulo');
    expect(rows).toHaveLength(64);
    expect(rows.every((r) => r[iC] === 555 && r[iM] === 'M07')).toBe(true);
  });
});

describe('Traslado · el alta de camiones y su sitio', () => {
  it('🔴 el botón «Añadir camión» está junto a la placa, no suelto abajo', () => {
    const alta = panel().querySelector('.tras-alta');
    expect(alta, 'no existe el formulario de alta').toBeTruthy();
    const input = alta.querySelector('#tras-alta-placa');
    const boton = Array.from(alta.querySelectorAll('button'))
      .find((b) => b.textContent.includes('Añadir camión'));
    expect(input).toBeTruthy();
    expect(boton).toBeTruthy();
    // «Junto a» es literal: comparten la misma fila, no sólo el mismo bloque.
    expect(boton.parentElement).toBe(input.closest('.mf').parentElement);
  });

  it('🔴 el alta lleva sus propias casillas de tinas, en POSITIVO', () => {
    const casillas = panel().querySelectorAll('[data-alta][data-tina-on]');
    expect(casillas).toHaveLength(H.TRAS_TINAS);
    // Todas marcadas de inicio: lo normal es que el camión lleve sus ocho.
    expect(Array.from(casillas).every((c) => c.checked)).toBe(true);
    expect(panel().textContent).toContain('Tinas que lleva este camión');
    // Y el rótulo en negativo desapareció: se leía mal con prisa.
    expect(panel().textContent).not.toContain('Tinas que NO viajan');
  });

  it('el alta se vacía después de añadir, lista para el siguiente', () => {
    altaCamion('GSA-1147', [8]);
    expect(panel().querySelector('#tras-alta-placa').value).toBe('');
    const casillas = panel().querySelectorAll('[data-alta][data-tina-on]');
    expect(Array.from(casillas).every((c) => c.checked)).toBe(true);
  });

  it('la placa a medio teclear sobrevive a un repintado', () => {
    // Marcar una tina repinta la ficha entera. Si el alta no se commiteara, la
    // placa recién tecleada se perdería justo antes de pulsar el botón.
    panel().querySelector('#tras-alta-placa').value = 'GSA-1147';
    panel().querySelector('[data-alta][data-tina-on="8"]').checked = false;
    H.trasRefrescar();
    expect(panel().querySelector('#tras-alta-placa').value).toBe('GSA-1147');
    expect(panel().querySelector('[data-alta][data-tina-on="8"]').checked).toBe(false);
  });
});

describe('Traslado · dónde están los botones y los títulos', () => {
  it('🔴 los checks van bajo un título, no colgando del aire', () => {
    const txt = panel().textContent;
    expect(txt).toContain('Insumos y materiales a bordo');
    const i = txt.indexOf('Insumos y materiales a bordo');
    // El título va ANTES de los dos grupos, no después.
    expect(i).toBeGreaterThan(-1);
    expect(txt.indexOf('Oxigenómetro')).toBeGreaterThan(i);
  });

  it('🔴 «Guardar traslado» está en la misma fila que «Limpiar»', () => {
    conCamion();
    const limpiar = Array.from(panel().querySelectorAll('.tras-rev button'))
      .find((b) => b.textContent.includes('Limpiar'));
    const guardar = Array.from(panel().querySelectorAll('.tras-rev button'))
      .find((b) => b.textContent.includes('Guardar traslado'));
    expect(limpiar, 'no está el botón Limpiar').toBeTruthy();
    expect(guardar, 'Guardar no está dentro del bloque de la revisión').toBeTruthy();
    expect(guardar.parentElement).toBe(limpiar.parentElement);
  });

  it('🔴 y ya NO hay un segundo Guardar al pie de la ficha', () => {
    // Dos botones de guardar en la misma pantalla es peor que ninguno: el usuario
    // no sabe si hacen lo mismo.
    conCamion();
    const todos = Array.from(panel().querySelectorAll('button'))
      .filter((b) => b.textContent.includes('Guardar traslado'));
    expect(todos).toHaveLength(1);
  });

  it('el botón dice «Actualizar» cuando se está editando un viaje guardado', () => {
    viajeCompleto(1);
    H.saveTraslado();
    const id = H._trasRaw()[0].id;
    H.trasEditar(id);
    const guardar = Array.from(panel().querySelectorAll('.tras-rev button'))
      .find((b) => b.textContent.includes('Actualizar traslado'));
    expect(guardar).toBeTruthy();
  });
});

/* ── Recorrido completo, columna por columna ────────────────────
   Nació como auditoría del rediseño y se queda: es la única prueba que mira las
   29 columnas A LA VEZ y detecta una que llegue vacía por accidente — un campo
   que se deja de leer no rompe nada, simplemente escribe una celda en blanco. */
describe('Traslado · el viaje entero llega a la hoja', () => {
  it('🔴 con el formulario lleno, NINGUNA columna llega vacía', () => {
    viajeCompleto(1);
    // los tres campos que viajeCompleto no toca
    cab('recepcion', 'María Chuzena');
    cab('salinidad', '31.5');
    panel().querySelectorAll('[data-group="insumos"]').forEach((c) => { c.checked = true; });
    panel().querySelectorAll('[data-group="check"]').forEach((c) => { c.checked = true; });
    for (let i = 0; i < 4; i += 1) {
      irA(i, 0);
      const box = panel().querySelector(`.tras-rev[data-rev="${i}"]`);
      box.querySelector('[data-k="ubicacion"]').value = '-2.213500, -80.979100';
      box.querySelector('[data-k="lat"]').value = '-2.2135';
      box.querySelector('[data-k="lon"]').value = '-80.9791';
      box.querySelector('[data-k="precision"]').value = '12';
      box.querySelector('[data-k="horaRegistro"]').value = '2026-08-18T20:30:07';
      box.querySelector('[data-k="obs"]').value = 'Tracto digestivo vacío.';
    }
    H.saveTraslado();
    expect(H._trasRaw(), 'no guardó: ' + ultimoAviso()).toHaveLength(1);
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    expect(headers).toHaveLength(29);
    const vacias = headers.filter((h, c) => rows[0][c] === '' || rows[0][c] == null);
    expect(vacias, 'columnas que llegaron vacías con el formulario lleno').toEqual([]);
    // ⚠ la longitud NEGATIVA, que es donde esto se rompía
    expect(rows[0][headers.indexOf('Longitud')]).toBe(-80.9791);
  });

  it('🔴 el commit con el panel apagado NO vacía insumos ni check', () => {
    // `goBack()` dispara saveTrasRecovery estando en el módulo AsT. Si el usuario
    // está en otra pestaña, el panel de traslado está vacío: leerlo "commitearía"
    // ausencias y el autoguardado se escribiría ya mutilado. Lo encontró la
    // auditoría del 08-23; las placas ya estaban protegidas y estos dos no.
    conCamion();
    cab('camaronera', 'Taura');
    panel().querySelectorAll('[data-group="insumos"]').forEach((c) => { c.checked = true; });
    expect(H.collectTraslado().insumos).toHaveLength(4);
    panel().innerHTML = '';                       // la pestaña cambió
    const d = H.collectTraslado();
    expect(d.insumos, 'el commit vació los insumos con el panel apagado').toHaveLength(4);
    expect(d.camiones).toHaveLength(1);
    expect(d.camaronera).toBe('Taura');
  });
});

describe('Traslado · editar un viaje que ya no está', () => {
  it('🔴 no lo pierde en silencio: lo reinserta como nuevo y lo dice', () => {
    // Reachable de verdad: el TTL son 48 h y los traslados son NOCTURNOS, así que
    // un viaje puede caducar justo mientras se corrige. Antes esta rama no escribía
    // nada y aun así avisaba «✅ Traslado guardado» — el peor final posible.
    viajeCompleto(1);
    H.saveTraslado();
    const id = H._trasRaw()[0].id;
    H.trasEditar(id);
    localStorage.removeItem('larv4_tras_records');   // el registro se evapora
    toasts.length = 0;
    H.saveTraslado();
    expect(H._trasRaw(), 'el viaje editado se perdió').toHaveLength(1);
    expect(H._trasRaw()[0].id).not.toBe(id);         // es uno nuevo
    expect(ultimoAviso()).toContain('COMO NUEVO');
    // y el contenido es el que había en pantalla, no un viaje vacío
    const { rows } = H.buildTrasPayload(H._trasRaw());
    expect(rows).toHaveLength(32);
  });

  it('editar un viaje que SÍ está lo actualiza en su sitio, sin duplicar', () => {
    viajeCompleto(1);
    H.saveTraslado();
    const id = H._trasRaw()[0].id;
    H.trasEditar(id);
    cab('recepcion', 'María Chuzena');
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(1);
    expect(H._trasRaw()[0].id).toBe(id);
    expect(H._trasRaw()[0].data.recepcion).toBe('María Chuzena');
  });
});

/* ══════════════════════════════════════════════════════════════
   LA TEMPERATURA SE TECLEA UNA VEZ (usuario, 2026-08-23)

   Es la misma agua dentro del camión: se mide una vez y baja a las ocho tinas.
   Lo delicado NO es que se propague —eso es fácil— sino QUÉ NO debe pisar:
   una tina editada a mano, una que no viaja, el otro camión, y el oxígeno.
   ══════════════════════════════════════════════════════════════ */
const temp = (t) => panel().querySelector(`.tras-cam-grid [data-tina="${t}"][data-k="temp"]`);
const oxi = (t) => panel().querySelector(`.tras-cam-grid [data-tina="${t}"][data-k="o2"]`);
/** Teclea una temperatura en la tina `t` y dispara el onchange, como el usuario. */
const ponerTemp = (t, v, i, ci) => { temp(t).value = v; H.trasTempAuto(i || 0, ci || 0, t); };
const temps = () => [1, 2, 3, 4, 5, 6, 7, 8].map((t) => (temp(t) ? temp(t).value : null));

describe('Traslado · la temperatura baja a todas las tinas', () => {
  it('🔴 teclear una la reparte a las otras siete', () => {
    conCamion();
    ponerTemp(1, '26');
    expect(temps()).toEqual(['26', '26', '26', '26', '26', '26', '26', '26']);
  });

  it('🔴 y llega al payload: las 8 tinas van con esa temperatura', () => {
    // ⚠ Se vacía la parada 1 antes de teclear. `viajeCompleto` rellena las ocho
    // tinas UNA A UNA, así que para la regla son valores puestos a mano y están
    // protegidos — no se pisan, y eso es lo correcto. Partir de vacío es lo que
    // reproduce el gesto real: el chequeador llega a la parada y teclea una vez.
    viajeCompleto(1);
    irA(0, 0);
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((t) => { temp(t).value = ''; });
    ponerTemp(3, '24.5');
    H.saveTraslado();
    const { rows, headers } = H.buildTrasPayload(H._trasRaw());
    const iT = headers.indexOf('Temperatura (°C)');
    const iRev = headers.indexOf('Revisión');
    const r1 = rows.filter((r) => r[iRev] === 1);
    expect(r1).toHaveLength(8);
    expect(r1.every((r) => r[iT] === 24.5)).toBe(true);
  });

  it('🔴 lo ya tecleado a mano en las 8 tinas NO se pisa', () => {
    // El reverso de la prueba anterior, y el motivo de su comentario: si alguien
    // "mejorara" la regla a «propagar siempre», ocho mediciones distintas se
    // perderían de golpe al corregir una sola.
    viajeCompleto(1);
    irA(0, 0);
    temp(1).value = '24'; temp(2).value = '25'; temp(3).value = '26';
    ponerTemp(1, '24');
    expect(temp(2).value).toBe('25');
    expect(temp(3).value).toBe('26');
  });

  it('🔴 NO pisa una tina que el usuario editó a mano', () => {
    // Es la mitad de la petición: «pero igual permita editar de ser necesario».
    conCamion();
    ponerTemp(1, '26');
    temp(5).value = '23';            // el usuario corrige esa tina
    ponerTemp(1, '26');              // y vuelve a tocar la de origen
    expect(temp(5).value, 'se pisó una tina editada a mano').toBe('23');
  });

  it('🔴 corregir el valor de origen ACTUALIZA las auto-rellenadas', () => {
    // Sin esto, «rellenar sólo las vacías» dejaría siete tinas con una temperatura
    // que nadie midió: se teclea 26, se corrige a 25, y T2…T8 se quedan en 26.
    conCamion();
    ponerTemp(1, '26');
    expect(temps()).toEqual(Array(8).fill('26'));
    ponerTemp(1, '25');
    expect(temps(), 'la corrección no bajó a las demás').toEqual(Array(8).fill('25'));
  });

  it('🔴 corregir el origen respeta la tina editada a mano', () => {
    // Las dos reglas a la vez, que es el caso real.
    conCamion();
    ponerTemp(1, '26');
    temp(5).value = '23';
    ponerTemp(1, '25');
    expect(temp(5).value).toBe('23');
    expect(temp(2).value).toBe('25');
    expect(temp(8).value).toBe('25');
  });

  it('🔴 no toca las tinas que NO viajan en ese camión', () => {
    altaCamion('GSA-1147', [7, 8]);   // este camión lleva 6
    ponerTemp(1, '26');
    expect(temp(7).disabled).toBe(true);
    expect(temp(7).value, 'se rellenó una tina que no viaja').toBe('');
    expect(temp(8).value).toBe('');
    expect(temp(6).value).toBe('26');
  });

  it('🔴 no se derrama al OTRO camión', () => {
    altaCamion('GSA-1147');
    altaCamion('PBX-0392');
    irA(0, 0);
    ponerTemp(1, '26', 0, 0);
    expect(temps()).toEqual(Array(8).fill('26'));
    irA(0, 1);                        // el segundo camión sigue en blanco
    expect(temps(), 'la temperatura se derramó al otro camión').toEqual(Array(8).fill(''));
  });

  it('🔴 no se derrama a la OTRA parada', () => {
    conCamion();
    ponerTemp(1, '26');
    irA(1, 0);
    expect(temps(), 'la temperatura se derramó a la siguiente parada').toEqual(Array(8).fill(''));
  });

  it('vaciar una tina NO vacía las demás', () => {
    // Borrar es una acción deliberada sobre ESA celda, no una orden para el resto.
    conCamion();
    ponerTemp(1, '26');
    ponerTemp(1, '');
    expect(temp(2).value).toBe('26');
    expect(temp(8).value).toBe('26');
  });

  it('🔴 el OXÍGENO no se reparte: es la medición que de verdad varía', () => {
    conCamion();
    oxi(1).value = '7.5';
    // el oxígeno no lleva el disparo, así que nada debe moverse
    expect(panel().querySelector('.tras-cam-grid [data-tina="1"][data-k="o2"]').getAttribute('onchange')).toBeNull();
    expect(oxi(2).value).toBe('');
  });

  it('🔴 un viaje NUEVO no hereda la memoria del anterior', () => {
    // `_trasTempAuto` es estado de pantalla. Si sobreviviera, en el viaje siguiente
    // una tina con 26 tecleada A MANO se consideraría «auto-rellenada» y se pisaría.
    conCamion();
    ponerTemp(1, '26');
    H.saveTraslado();                 // no valida, pero deja el formulario usado
    H.renderTraslado();               // formulario fresco
    conCamion();
    temp(4).value = '26';             // ahora 26 es un valor TECLEADO a mano
    ponerTemp(1, '25');
    expect(temp(4).value, 'se pisó un 26 tecleado a mano tras heredar la memoria').toBe('26');
  });
});
