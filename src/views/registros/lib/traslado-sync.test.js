// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Traslado — SINCRONIZACIÓN (T3, 2026-08-23)

   Banco propio, separado de `traslado-captura.test.js`. No es una manía de orden:
   los dos arrancan el monolito ENTERO (≈16 k líneas) sobre el shell real, y juntos
   pasaban de 78 pruebas en un solo worker — el proceso moría por falta de memoria
   («Ineffective mark-compacts near heap limit») y vitest lo reportaba como 0
   pruebas ejecutadas, que se lee como verde si uno no mira. Partirlo lo arregla y
   además deja el banco de mutaciones más rápido.

   Lo que se vigila aquí NO es «que envíe», sino las tres cosas de las que depende
   que un dato no se pierda en carretera:
     · sólo se marca `synced` si el envío se ENTREGÓ;
     · un envío fallido deja el viaje pendiente, listo para reintentar;
     · re-enviar es inocuo, porque el upsert del GAS es por ID determinista.

   El contrato con el GAS de verdad (allowlist, límites, upsert) vive en
   `traslado-gas.test.js`, que ejecuta el código real de `GAS/Code.gs`.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');

const EXPORTAR = ['renderTraslado', 'collectTraslado', 'saveTraslado', '_trasRaw', '_trasSave',
  'buildTrasPayload', 'trasAgregarCamion', 'trasIrRevision', 'trasCamChange', 'trasEditar',
  'trasCancelarEdicion', 'loadTras', 'syncAllPendingTras', 'syncOneTrasFromList', 'syncAll',
  'buildGrid', '_reconcileMark', 'TRAS_HEADERS',
  // Auditoría 2026-08-24: el reparto en lotes y el motivo que manda el GAS.
  // `postPayload` se captura AQUÍ, que es antes de que `setPost` lo sustituya por el
  // simulador: `H.postPayload` guarda la función REAL y se puede probar con fetch falso.
  'postPayload', '_syncNotOkUI', 'TRAS_MAX_FILAS', '_trasLotes',
  // T4a: el vaciado de la cola cuando el servidor rechaza.
  '_enqueueSync', '_loadSyncQueue', 'flushSyncQueue'];
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
    // El envío se SIMULA: nada sale a la red.
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
  H.__envioOk = true;
  H.setPost(async (payload) => { enviados.push(payload); return H.__envioOk; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/PRUEBA/exec');
  H.setRate(() => true);
  H.setMod(13);          // AST_MOD
  H.setTab('traslado');

  // happy-dom ignora <option selected> al parsear innerHTML: se repara tras cada
  // repintado. Explicado a fondo en `traslado-captura.test.js`.
  ['renderTraslado', 'trasIrRevision', 'trasAgregarCamion', 'saveTraslado', 'trasEditar']
    .forEach((n) => {
      const orig = H[n];
      if (typeof orig !== 'function') throw new Error('no se exportó ' + n);
      H[n] = function envuelta(...a) { const r = orig.apply(null, a); repararSelects(); return r; };
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
const cab = (k, v) => {
  const el = panel().querySelector(`.mad-form > .meta [data-k="${k}"]`);
  if (!el) throw new Error('sin campo de cabecera ' + k);
  el.value = v;
};

/** Un viaje válido de un camión, listo para guardar. */
function viajeGuardable() {
  const alta = panel().querySelector('#tras-alta-placa');
  if (!alta) throw new Error('sin formulario de alta');
  alta.value = 'GSA-1147';
  H.trasAgregarCamion();
  cab('fecha', '2026-08-18');
  cab('corrida', '555');
  panel().querySelector('[data-k="modulo"]').value = 'M07';
  panel().querySelector('[data-k="camaronera"]').value = 'Puná 1';
  const horas = ['20:30', '22:00', '23:30', '01:00'];
  for (let i = 0; i < 4; i += 1) {
    H.trasIrRevision(i);
    const box = panel().querySelector(`.tras-rev[data-rev="${i}"]`);
    box.querySelector('[data-k="hora"]:not([data-cam])').value = horas[i];
    box.querySelector('[data-k="lugar"]').value = 'Peaje';
    for (let t = 1; t <= 8; t += 1) {
      box.querySelector(`[data-tina="${t}"][data-k="o2"]`).value = '7.5';
      box.querySelector(`[data-tina="${t}"][data-k="temp"]`).value = '26';
    }
  }
  H.trasIrRevision(0);
}

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  enviados.length = 0;
  H.__envioOk = true;
  try { H.trasCancelarEdicion(); } catch (_) { /* aún no exportada en el 1.er render */ }
  H.renderTraslado();
});

describe('Traslado · qué se envía', () => {
  it('🔴 va a Registro_Traslado con las 29 cabeceras y 32 filas', async () => {
    viajeGuardable();
    H.saveTraslado();
    await H.syncAllPendingTras();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].sheetName).toBe('Registro_Traslado');
    expect(enviados[0].headers).toHaveLength(29);
    expect(enviados[0].rows).toHaveLength(32);
  });

  it('la Corrida viaja como número y el Módulo con la grafía corta', async () => {
    viajeGuardable();
    H.saveTraslado();
    await H.syncAllPendingTras();
    const { headers, rows } = enviados[0];
    expect(rows[0][headers.indexOf('Corrida')]).toBe(555);
    expect(rows[0][headers.indexOf('Módulo')]).toBe('M07');
  });
});

describe('Traslado · marcar sincronizado sólo si se entregó', () => {
  it('🔴 al entregarse, el viaje deja de estar pendiente', async () => {
    viajeGuardable();
    H.saveTraslado();
    expect(H._trasRaw()[0].synced).toBe(false);
    await H.syncAllPendingTras();
    expect(H._trasRaw()[0].synced).toBe(true);
    expect(H._trasRaw()[0].syncedAt).toBeGreaterThan(0);
  });

  it('🔴 si el envío NO se entrega, el viaje sigue pendiente', async () => {
    // Marcar synced sin entrega haría creer al chequeador que su viaje está en la
    // hoja cuando no ha llegado nada. Es la peor forma de perder un dato.
    viajeGuardable();
    H.saveTraslado();
    H.__envioOk = false;
    await H.syncAllPendingTras();
    expect(enviados).toHaveLength(1);
    expect(H._trasRaw()[0].synced, 'se marcó sincronizado sin haberse entregado').toBe(false);
  });

  it('sin nada pendiente no llama al servidor y lo dice', async () => {
    viajeGuardable();
    H.saveTraslado();
    await H.syncAllPendingTras();
    enviados.length = 0; toasts.length = 0;
    await H.syncAllPendingTras();
    expect(enviados).toHaveLength(0);
    expect(ultimoAviso()).toContain('No hay traslados pendientes');
  });

  it('🔴 editar un viaje ya sincronizado lo devuelve a pendiente', async () => {
    // Si al reeditar se quedara marcado, la corrección no saldría nunca del móvil.
    viajeGuardable();
    H.saveTraslado();
    await H.syncAllPendingTras();
    const id = H._trasRaw()[0].id;
    H.trasEditar(id);
    cab('recepcion', 'María Chuzena');
    H.saveTraslado();
    expect(H._trasRaw()[0].synced).toBe(false);
    expect(H._trasRaw()[0].id).toBe(id);
  });
});

describe('Traslado · enviar un viaje suelto', () => {
  it('🔴 marca ESE viaje y no los demás', async () => {
    viajeGuardable();
    H.saveTraslado();
    const id1 = H._trasRaw()[0].id;
    H.renderTraslado();
    viajeGuardable();
    H.saveTraslado();
    expect(H._trasRaw()).toHaveLength(2);

    await H.syncOneTrasFromList(id1);
    expect(enviados).toHaveLength(1);
    const raw = H._trasRaw();
    expect(raw.find((r) => r.id === id1).synced).toBe(true);
    expect(raw.find((r) => r.id !== id1).synced, 'se marcó el viaje que no era').toBe(false);
  });

  it('🔴 re-enviarlo NO duplica: manda exactamente las mismas llaves', async () => {
    // Es lo que permite sincronizar en cada parada. El GAS hace upsert por ID y la
    // llave es determinista, así que el segundo envío cae sobre las mismas filas.
    viajeGuardable();
    H.saveTraslado();
    const id = H._trasRaw()[0].id;
    await H.syncOneTrasFromList(id);
    await H.syncOneTrasFromList(id);
    expect(enviados).toHaveLength(2);
    const iId = enviados[0].headers.indexOf('ID');
    const a = enviados[0].rows.map((r) => r[iId]).sort();
    const b = enviados[1].rows.map((r) => r[iId]).sort();
    expect(b).toEqual(a);
    expect(new Set(a).size).toBe(32);
  });
});

describe('Traslado · los botones de envío', () => {
  it('🔴 «Enviar todos» aparece sólo si hay pendientes', () => {
    viajeGuardable();
    H.saveTraslado();
    expect(panel().innerHTML).toContain('syncAllPendingTras()');
    expect(panel().textContent).toContain('1 traslado pendiente');
  });

  it('cada fila guardada trae su botón de envío', () => {
    viajeGuardable();
    H.saveTraslado();
    const id = H._trasRaw()[0].id;
    expect(panel().innerHTML).toContain(`syncOneTrasFromList('${id}')`);
  });
});

describe('Traslado · syncAll del módulo AsT', () => {
  it('🔴 también envía el traslado, no sólo la supervisión', async () => {
    // Antes delegaba SÓLO en syncAllPendingAst: pulsar «sincronizar» estando en la
    // pestaña de Traslado no enviaba nada y tampoco avisaba.
    viajeGuardable();
    H.saveTraslado();
    enviados.length = 0;
    await H.syncAll();
    expect(enviados.some((p) => p.sheetName === 'Registro_Traslado'),
      'syncAll ignoró el traslado pendiente').toBe(true);
  });

  it('sin nada pendiente en ninguna de las dos fichas, lo dice', async () => {
    toasts.length = 0; enviados.length = 0;
    await H.syncAll();
    expect(enviados).toHaveLength(0);
    expect(ultimoAviso()).toContain('No hay registros pendientes');
  });
});

describe('Traslado · el aviso en el tablero y la cola sin conexión', () => {
  it('🔴 el punto del módulo AsT se enciende con un traslado pendiente', () => {
    // El chequeador ve el tablero de módulos, no la pestaña. Si el punto sólo
    // mirara Supervisión, un traslado sin enviar no encendería nada.
    viajeGuardable();
    H.saveTraslado();
    expect(H._trasRaw()[0].synced).toBe(false);
    H.buildGrid();
    const tile = document.getElementById('mc13');
    expect(tile, 'no se pintó el tile del módulo AsT').toBeTruthy();
    expect(tile.className, 'el punto no avisa del traslado pendiente').toContain('pend');
  });

  it('el punto pasa a «sincronizado» cuando ya no queda nada pendiente', async () => {
    viajeGuardable();
    H.saveTraslado();
    await H.syncAllPendingTras();
    H.buildGrid();
    const tile = document.getElementById('mc13');
    expect(tile.className).toContain('sync');
    expect(tile.className).not.toContain('pend');
  });

  it('🔴 la cola sin conexión reconcilia los traslados entregados', () => {
    // Sin conexión el envío se ENCOLA. Cuando más tarde se entrega, la marca es lo
    // único que devuelve el registro local a «sincronizado». Sin la rama "tras" el
    // viaje se quedaría pendiente para siempre y el aviso no se apagaría nunca.
    viajeGuardable();
    H.saveTraslado();
    const id = H._trasRaw()[0].id;
    const tocado = H._reconcileMark({ kind: 'tras', keys: [id] });
    expect(tocado, 'la reconciliación no reconoció la marca «tras»').toBe(true);
    expect(H._trasRaw()[0].synced).toBe(true);
    expect(H._trasRaw()[0].syncedAt).toBeGreaterThan(0);
  });

  it('la reconciliación NO toca un viaje que no venía en la marca', () => {
    viajeGuardable();
    H.saveTraslado();
    H.renderTraslado();
    viajeGuardable();
    H.saveTraslado();
    const [a, b] = H._trasRaw();
    H._reconcileMark({ kind: 'tras', keys: [a.id] });
    const raw = H._trasRaw();
    expect(raw.find((r) => r.id === a.id).synced).toBe(true);
    expect(raw.find((r) => r.id === b.id).synced).toBe(false);
  });

  it('una marca de otra vista no toca los traslados', () => {
    viajeGuardable();
    H.saveTraslado();
    const id = H._trasRaw()[0].id;
    H._reconcileMark({ kind: 'ast', keys: [id] });
    expect(H._trasRaw()[0].synced).toBe(false);
  });
});

describe('Traslado · lotes y el motivo del rechazo (auditoría 2026-08-24)', () => {
  /** Clona un viaje REAL —el que produce el formulario— tantas veces como haga falta. */
  function sembrar(n) {
    viajeGuardable();
    H.saveTraslado();
    const base = H._trasRaw()[0];
    expect(base, "el fixture no guardó nada").toBeTruthy();
    const lista = [];
    for (let i = 0; i < n; i += 1) {
      lista.push({ ...JSON.parse(JSON.stringify(base)), id: "tvLOTE" + i, synced: false, ts: Date.now() });
    }
    H._trasSave(lista);
    return lista;
  }
  const restaurarPost = () => H.setPost(async (payload) => { enviados.push(payload); return H.__envioOk; });

  it('🔴 muchos pendientes salen en VARIOS envíos, y ninguno pasa del techo', async () => {
    const lista = sembrar(25);
    const filasPorViaje = H.buildTrasPayload([lista[0]]).rows.length;
    expect(filasPorViaje * lista.length,
      "el fixture no llega al techo: pasaría igual sin trocear").toBeGreaterThan(H.TRAS_MAX_FILAS);

    enviados.length = 0;
    await H.syncAllPendingTras();
    expect(enviados.length, "siguió mandándolo todo en un solo POST").toBeGreaterThan(1);
    enviados.forEach((p, i) => {
      expect(p.rows.length, `el envío ${i + 1} pasa del techo`).toBeLessThanOrEqual(H.TRAS_MAX_FILAS);
    });
    // Y no se pierde ni se repite ninguna fila por el camino.
    const totalFilas = enviados.reduce((a, p) => a + p.rows.length, 0);
    expect(totalFilas).toBe(filasPorViaje * lista.length);
    expect(H.loadTras().filter((r) => !r.synced)).toHaveLength(0);
  });

  it('🔴 si un lote falla, los ANTERIORES quedan sincronizados y el resto pendiente', async () => {
    /* Era el motivo de marcar `synced` al final: un fallo en el último envío devolvía a
       pendiente TODO, y el reintento reescribía en la hoja lo que ya estaba. */
    const lista = sembrar(25);
    let n = 0;
    H.setPost(async (payload) => { enviados.push(payload); n += 1; return n === 1; });
    try {
      enviados.length = 0;
      await H.syncAllPendingTras();
      expect(enviados.length, "no paró en el primer fallo").toBe(2);
      const sincronizados = H.loadTras().filter((r) => r.synced).length;
      const pendientes = H.loadTras().filter((r) => !r.synced).length;
      expect(sincronizados, "se perdió el lote que SÍ entró").toBeGreaterThan(0);
      expect(pendientes, "se dio por bueno el lote que falló").toBeGreaterThan(0);
      expect(sincronizados + pendientes).toBe(lista.length);
      /* El aviso tiene que decir cuántos SÍ entraron. Que el conteo fuera sólo al
         indicador y el aviso dijera «no fue posible sincronizar» era engañoso: el usuario
         creería que no se guardó nada y lo reenviaría todo. */
      expect(ultimoAviso()).toContain("de " + lista.length);
      expect(ultimoAviso()).toContain("sincronizados");
      expect(ultimoAviso()).toContain("pendiente");
    } finally { restaurarPost(); }
  });

  it('🔴 `postPayload` recoge el motivo que manda el GAS', async () => {
    /* La mitad de abajo de la cadena, con el `postPayload` REAL y la red falsa. Hasta el
       2026-08-24 el `message` se parseaba y se tiraba. */
    const fetchOrig = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({ status: 'error', message: 'Hoja no permitida' }),
    });
    try {
      const opts = {};
      const ok = await H.postPayload(
        { sheetName: 'Registro_Traslado', headers: ['a'], rows: [['x']] },
        'https://script.google.com/macros/s/PRUEBA/exec', opts);
      expect(ok).toBe(false);
      expect(opts.outcome).toBe('rejected');
      expect(opts.gasMessage, 'el motivo se volvió a tirar').toBe('Hoja no permitida');
    } finally { globalThis.fetch = fetchOrig; }
  });

  it('🔴 el aviso dice QUÉ pasó y qué hacer, no sólo que falló', () => {
    /* La mitad de arriba. «Hoja no permitida» significa SIEMPRE lo mismo —el GAS
       desplegado es más antiguo que la app— y decirlo aquí ahorra buscar el fallo en el
       cliente, que es donde no está. */
    toasts.length = 0;
    H._syncNotOkUI('rejected', 'x', null, 'Hoja no permitida');
    expect(ultimoAviso()).toContain('Hoja no permitida');
    expect(ultimoAviso().toLowerCase()).toContain('vuelve a desplegarlo');

    toasts.length = 0;
    H._syncNotOkUI('rejected', 'x', null, 'Límite de filas excedido');
    expect(ultimoAviso()).toContain('Límite de filas excedido');
    expect(ultimoAviso().toLowerCase()).toContain('menos registros');
  });

  it('sin motivo, el aviso es el de siempre: no inventa una explicación', () => {
    toasts.length = 0;
    H._syncNotOkUI('rejected', 'x', null, '');
    expect(ultimoAviso()).toBe('No fue posible sincronizar con Google Sheets');
  });
});

describe('Traslado · la cola sin conexión frente a un rechazo del GAS (T4a)', () => {
  /* Medido el 2026-08-24: un traslado capturado SIN SEÑAL se encolaba; al recuperar
     señal el GAS respondía «Hoja no permitida» —lo que responde HOY, sin re-desplegar—,
     el envío se DESCARTABA de la cola y el aviso decía «revisa los datos», acusando al
     dato cuando el problema era el despliegue. El dato local nunca se perdió, pero se
     acababa el reintento automático sin que nada lo dijera. */

  /** Deja un traslado local pendiente y su envío en la cola, como al perder señal. */
  function encolarTraslado() {
    H._trasSave([{ id: 'tvOFF1', ts: Date.now(), synced: false, data: { fecha: '2026-08-24' } }]);
    H._enqueueSync(
      { sheetName: 'Registro_Traslado', headers: ['a'], rows: [['x']] },
      'req-off-1', 'https://script.google.com/macros/s/PRUEBA/exec',
      { kind: 'tras', keys: ['tvOFF1'] },
    );
    expect(H._loadSyncQueue(), "el fixture no encoló nada").toHaveLength(1);
  }
  /** Corre el vaciado con una respuesta fija del servidor. */
  async function vaciarCon(respuesta) {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify(respuesta) });
    try { await H.flushSyncQueue(); } finally { globalThis.fetch = orig; }
  }

  it('🔴 un rechazo por DESPLIEGUE conserva el envío y dice el motivo real', async () => {
    encolarTraslado();
    toasts.length = 0;
    await vaciarCon({ status: 'error', message: 'Hoja no permitida' });

    expect(H._loadSyncQueue(), "se descartó: ya no habría reintento automático").toHaveLength(1);
    expect(H._trasRaw()[0].synced, "se dio por escrito un dato que no llegó").toBe(false);
    const aviso = toasts.join(" | ");
    expect(aviso).toContain("Hoja no permitida");
    expect(aviso.toLowerCase()).toContain("vuelve a desplegarlo");
    expect(aviso, "sigue acusando a los datos, que están bien").not.toContain("revisa los datos");
  });

  it('🔴 un rechazo por los DATOS sí se descarta, para no atascar la cola', async () => {
    /* La otra mitad de la regla. Sin este caso, «conservar siempre» dejaría un envío
       imposible dando vueltas y tapando a los que sí pueden entregarse. */
    encolarTraslado();
    toasts.length = 0;
    await vaciarCon({ status: 'error', message: 'Error en datos' });

    expect(H._loadSyncQueue(), "un envío irrecuperable se quedó atascando la cola").toHaveLength(0);
    expect(H._trasRaw()[0].synced).toBe(false);
    expect(toasts.join(" | ")).toContain("revisa los datos");
  });

  it('🔴 al re-desplegar el GAS, el envío en espera se entrega SOLO', async () => {
    /* Es el sentido de conservarlo: el usuario arregla el despliegue y no tiene que
       acordarse de reenviar nada. Sin esta prueba, «conservar» podría estar guardando un
       envío que nunca se vuelve a intentar, y el verde no lo distinguiría. */
    encolarTraslado();
    await vaciarCon({ status: 'error', message: 'Hoja no permitida' });
    expect(H._loadSyncQueue()).toHaveLength(1);          // control: sigue en espera

    toasts.length = 0;
    await vaciarCon({ status: 'ok' });                    // el GAS ya re-desplegado
    expect(H._loadSyncQueue(), "el envío se quedó en la cola tras entregarse").toHaveLength(0);
    expect(H._trasRaw()[0].synced, "se entregó pero el registro sigue pendiente").toBe(true);
    expect(toasts.join(" | ")).toContain("completados");
  });
});
