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
  'buildGrid', '_reconcileMark', 'TRAS_HEADERS'];
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
