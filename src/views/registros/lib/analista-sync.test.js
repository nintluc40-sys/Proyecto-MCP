// @vitest-environment happy-dom
/* ============================================================
   REGISTROS · Microbiología — el Analista (Responsable) y la sincronización

   Guarda la corrección del 2026-08-17. El defecto, reportado por el usuario y reproducido
   aquí antes de tocar nada: **después de seleccionar al analista, la app seguía negándose a
   sincronizar**, y refrescar la página no lo arreglaba.

   LA RAÍZ, en una frase: `_pendingLacksAnalista()` valida TODOS los registros pendientes,
   pero `save{Mic,Cal,Pat}Local` solo reescribe los de la sesión ACTIVA, cuya clave es
   `Fecha muestreo | Corrida | Departamento | Formato | sid`. En cuanto cambiaba uno de esos
   cinco —cambiar de formato, corregir la corrida— los registros guardados antes quedaban con
   otra clave: el formulario ya no podía alcanzarlos y bloqueaban el envío de todo lo demás,
   para siempre. El aviso, además, señalaba el campo del panel activo, que ya estaba relleno.

   LAS TRES PIEZAS QUE ESTAS PRUEBAS SOSTIENEN
   1. El Analista es obligatorio para GUARDAR, no solo para sincronizar → cierra la fuente:
      no puede volver a nacer un registro huérfano.
   2. Rescate de lo ya atascado: al sincronizar se completa el Analista en lo pendiente que no
      lo tenga, con el del análisis en curso. Es decisión del usuario y viene de un hecho de
      laboratorio: es siempre el mismo analista quien manda una tanda repartida en varios
      formatos. Queda acotado por (1) — solo alcanza a lo guardado antes de esta corrección.
      Si NO hay analista con el que completar, el aviso NOMBRA las sesiones que faltan.
   3. `syncAll()` guarda el análisis en pantalla ANTES de decidir qué está pendiente. Sin eso,
      lo capturado y no guardado no contaba como pendiente y su sync ni se ejecutaba: el
      trabajo en curso no se enviaba y no se avisaba de nada.

   ⚠ TRAMPA DEL ENTORNO (no es un defecto del código): happy-dom IGNORA el atributo `selected`
   de un `<option>` dentro del SEGUNDO `<optgroup>` y devuelve la última opción del primero.
   Por eso `elegirFormato()` fija el `.value` a mano — en navegador el select ya lo lleva,
   porque `calFmtChange` es su propio `onchange`. Sin esto, el caso del cambio de formato
   pasaba en verde SIN PROBAR NADA (guardaba 0 filas). Ver `feedback_fixtures-que-no-prueban-nada`.

   Verificado por mutación M45–M48: anular el requisito al guardar, el autorrelleno, el
   guardado previo de `syncAll` o el detalle del aviso deja roja UNA prueba, la suya.
   ============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');

// El motor es un script clásico de 14.800 líneas: se arranca ENTERO sobre el shell real y se
// maneja como lo haría el analista. `new Function` no deja nada en globalThis (las funciones
// quedan en su ámbito), así que se le añade un epílogo que exporta lo necesario; los `function`
// son enlaces mutables, y eso permite sustituir la red y los avisos sin tocar el fuente.
const EXPORTAR = ['syncCal', 'syncAll', 'saveCalLocal', 'saveMicLocal', '_calRaw', '_calSave',
  '_micRaw', 'loadCalDraft', 'renderCalNuevo', 'renderMicNuevo', 'micTypeSet', 'calFmtChange'];
const H = {};
const toasts = [];

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
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}'
    + '\ntry{ H.setTab=function(t){curTab=t;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );

  H.setPost(async () => { H.__enviados = (H.__enviados || 0) + 1; return true; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/PRUEBA/exec');
  H.setToast((msg) => { toasts.push(String(msg)); });
  H.setRate(() => true);
  H.setMod(14);          // MIC_MOD
  H.setTab('micnuevo');
});

const campo = (id, v) => { const e = document.getElementById(id); if (!e) throw new Error('sin #' + id); e.value = v; };
const celda = (n, v) => { const e = document.querySelector(`[name="${n}"]`); if (!e) throw new Error('sin ' + n); e.value = v; };
const ultimoAviso = () => (toasts.length ? toasts[toasts.length - 1] : '');
const avisos = (re) => toasts.filter((t) => re.test(t));
const pendientes = () => H._calRaw().filter((r) => !r.synced).length;
const sinAnalista = () => H._calRaw().filter((r) => !((r.data || {}).responsable || '').trim()).length;
// Ver la trampa del entorno en la cabecera: en navegador el select ya lleva el valor elegido.
const elegirFormato = (k) => { H.calFmtChange(k); document.getElementById('cal-fmt-sel').value = k; };
const analisisNuevo = () => {
  localStorage.clear(); toasts.length = 0; H.__enviados = 0;
  H.micTypeSet('cal'); H.renderCalNuevo();
};

describe('1 · el Analista es obligatorio para GUARDAR', () => {
  it('sin Analista no se crea el registro (antes nacía huérfano y bloqueaba todo)', () => {
    analisisNuevo();
    campo('cal-fm', '2026-08-17'); campo('cal-corr', '585'); celda('cal_larv_1_sal', '30');
    expect(H.saveCalLocal()).toBe(-1);
    expect(H._calRaw().length).toBe(0);
    expect(ultimoAviso()).toMatch(/Analista/);
  });

  it('con Analista guarda con normalidad', () => {
    analisisNuevo();
    campo('cal-fm', '2026-08-17'); campo('cal-corr', '585'); campo('cal-resp', 'Macías');
    celda('cal_larv_1_sal', '30');
    expect(H.saveCalLocal()).toBe(1);
    expect(sinAnalista()).toBe(0);
  });

  it('un análisis vacío NO reclama el Analista (no molesta al que aún no ha escrito nada)', () => {
    analisisNuevo();
    campo('cal-fm', '2026-08-17');
    expect(H.saveCalLocal()).toBe(0);
  });
});

describe('2 · las dos secuencias que bloqueaban para siempre', () => {
  it('cambiar de FORMATO entre guardar y sincronizar', async () => {
    analisisNuevo();
    campo('cal-fm', '2026-08-17'); campo('cal-corr', '585'); celda('cal_larv_1_sal', '30');
    H.saveCalLocal();                                   // rechazado: aún sin Analista
    elegirFormato('algas'); campo('cal-resp', 'Ramírez');
    celda('cal_algas_1_cl_libre', '0.5');
    H.saveCalLocal();
    await H.syncCal();
    expect(H.__enviados).toBe(1);
    expect(pendientes()).toBe(0);
  });

  it('corregir la CORRIDA después de guardar', async () => {
    analisisNuevo();
    campo('cal-fm', '2026-08-17'); campo('cal-corr', '585'); celda('cal_larv_1_sal', '30');
    H.saveCalLocal();
    campo('cal-corr', '586'); campo('cal-resp', 'Espinoza');
    H.saveCalLocal();
    await H.syncCal();
    expect(H.__enviados).toBe(1);
    expect(pendientes()).toBe(0);
  });
});

describe('3 · rescate de lo que ya estaba atascado', () => {
  it('completa el Analista en un pendiente heredado y lo envía', async () => {
    analisisNuevo();
    H._calSave([{ id: 'heredado', ts: Date.now() - 86400000, synced: false, syncedAt: null,
      data: { fechaMuestreo: '2026-08-10', fechaResultados: '', corrida: '580', responsable: '',
        departamento: 'Larvicultura', formato: 'larv', fila: 1, sal: '30' } }]);
    campo('cal-fm', '2026-08-17'); campo('cal-corr', '585'); campo('cal-resp', 'Chumo');
    celda('cal_larv_1_sal', '31');
    await H.syncCal();
    expect(H.__enviados).toBe(1);
    expect(sinAnalista()).toBe(0);
    expect(H._calRaw().find((r) => r.id === 'heredado').data.responsable).toBe('Chumo');
    // Nunca en silencio: el autorrelleno se anuncia con el nombre y el número de muestras.
    expect(avisos(/Se completó el Analista/).length).toBe(1);
    expect(avisos(/Se completó el Analista/)[0]).toMatch(/Chumo/);
  });

  it('si no hay Analista con el que completar, el aviso NOMBRA las sesiones que faltan', async () => {
    analisisNuevo();
    H._calSave([{ id: 'v1', ts: Date.now(), synced: false, syncedAt: null,
      data: { fechaMuestreo: '2026-08-10', corrida: '580', responsable: '',
        departamento: 'Larvicultura', formato: 'larv', fila: 1, sal: '30' } }]);
    await H.syncCal();
    expect(H.__enviados).toBe(0);
    // Antes decía sólo "el Analista es obligatorio" y enfocaba un campo ya relleno.
    expect(ultimoAviso()).toMatch(/2026-08-10/);
    expect(ultimoAviso()).toMatch(/corrida 580/);
  });
});

describe('4 · «Sincronizar todo» guarda lo que está en pantalla antes de decidir', () => {
  it('envía el análisis en curso de Calidad de Agua aunque no se haya pulsado Guardar', async () => {
    localStorage.clear(); toasts.length = 0; H.__enviados = 0;
    // Bacteriología ya guardada y pendiente
    H.micTypeSet('bact'); H.renderMicNuevo();
    campo('mic-fm', '2026-08-17'); campo('mic-corr', '585'); campo('mic-resp', 'Macías');
    const celdas = Array.from(document.querySelectorAll('[name^="mic_larv-muestra_1_"]')).map((e) => e.name);
    celda(celdas.find((x) => /vamar/.test(x)) || celdas[celdas.length - 1], '5');
    expect(H.saveMicLocal()).toBe(1);
    // Calidad de Agua EN CURSO, sin guardar todavía
    H.micTypeSet('cal'); H.renderCalNuevo();
    campo('cal-fm', '2026-08-17'); campo('cal-corr', '585'); campo('cal-resp', 'Macías');
    celda('cal_larv_1_sal', '30');
    expect(H._calRaw().length).toBe(0);          // aún no está en el historial
    await H.syncAll();
    expect(H.__enviados).toBe(2);                // una tanda por hoja: Micro y Calidad de Agua
    expect(pendientes()).toBe(0);
    expect(H._micRaw().filter((r) => !r.synced).length).toBe(0);
  });
});
