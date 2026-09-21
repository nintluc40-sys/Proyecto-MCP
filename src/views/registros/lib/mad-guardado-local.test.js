// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · 💾 GUARDAR LOCAL, SEPARADO DE ☁️ GUARDAR Y SINCRONIZAR (PE1.4, 2026-09-16)

   PEDIDO del usuario: «guardado local y "guardar y sincronizar" por separado en Movimientos, Ingreso, Desoves,
   Inf. Supervisor, Fin de Ciclo, Tratamientos y Alimentación, como en Salas y Tanques: los usuarios se sienten más
   seguros con eso».
   · 💾 guarda el envío YA CONSTRUIDO en este dispositivo, sin tocar la red, y deja la ficha limpia.
   · ☁️ envía PRIMERO lo guardado (lo más viejo antes, cada uno con su marca) y después lo de pantalla, por el
     camino de siempre. Si lo guardado falla de verdad, se para: lo de pantalla no sale y sigue ahí.
   · «Sincronizar todo», el punto de la pestaña y el contador de pendientes lo cuentan.
   · Y lo que destapó el análisis en el mismo camino: el borrador por fecha de lo guardado, enviado o vaciado se
     OLVIDA (madBorrOlvidar existía y no lo llamaba nadie), o volver a ese día lo resucitaba.
   Se ejerce con Tratamientos (con portón del sello) y Movimientos (sin él) arrancando el monolito entero; lo
   propio de Alimentación y Desoves, con un envío guardado sembrado; el cableado de las siete, con su fuente.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madTratReiniciar', 'madTratGuardar', 'madTratGuardarLocal', 'madTratVaciar', 'madTratEstadoChange', 'MAD_TRAT_SHEET',
  'madTratLogLeer', 'MAD_TRAT_LOG_KEY', 'flushSyncQueue', '_gasVersionLocal',
  'madMovReiniciar', 'madMovGuardar', 'madMovGuardarLocal', 'madMovSalaChange', 'madMovLogLeer', 'MAD_MOV_LOG_KEY',
  'madLocLeer', 'madLocTotal', 'madLocDescartar', '_madLocEnviar', '_madLocCfg', 'MAD_LOC_FICHAS', 'MAD_LOC_PRE', 'MAD_LOC_MAX',
  'madBorrFechaChange', 'MAD_BORR_PRE', 'syncAll', 'updateDots', 'updateSyncUI', 'buildGrid',
  'madAlimCfgLeer', 'madAlimCfgGuardar', 'madAlimLogLeer', 'MAD_ALIM_LOG_KEY', 'MAD_ALIM_SHEET',
  'madDesLocalesLeer', 'MAD_DES_PEND_KEY', 'madDesLogLeer', 'MAD_DES_LOG_KEY', 'MAD_DESOVE_SHEET'];
const H = {};
const envios = [];
const avisos = [];
let respuestaVer = null;
let respuestaPost = () => 'ok';
let pideVer = 0;

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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  /* Se sustituye el POST de UN intento: la marca viaja por la cañería real (encolar, vaciar, reconciliar). */
  H.setPostOnce(async (body, url, info) => {
    envios.push(body);
    const r = await respuestaPost(body);
    if (info && r === 'rejected') info.message = 'Error en datos';
    return r;
  });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    pideVer++;
    if (respuestaVer === 'red') throw new Error('sin red');
    const cuerpo = typeof respuestaVer === 'string' ? respuestaVer : JSON.stringify(respuestaVer);
    return { ok: true, status: 200, text: async () => cuerpo };
  };
  globalThis.confirm = () => true;
});

const cola = () => JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]');
const guardado = (f = 'tratamientos') => H.madLocLeer(f);
const q = (s) => document.querySelector('#fp-tratamientos ' + s);
const pon = (el, v) => { el.value = v; return el; };
const llenarTrat = (fecha = '2026-09-15', lotes = 'BP') => {
  pon(q('#mt-fecha'), fecha);
  pon(q('#mt-sala'), 'Sala 4');
  H.madTratEstadoChange(pon(q('#mt-estado'), 'Producción'));
  pon(q('#mt-prevs .mt-lotes'), lotes);
};
const lotesEnPantalla = () => { const el = q('#mt-prevs .mt-lotes'); return el ? el.value : ''; };
const llenarMov = () => {
  const f = document.querySelector('#fp-movimientos #mv-tramos tr.mv-tramo');
  H.madMovSalaChange(pon(f.querySelector('.mv-so'), 'Sala 1')); pon(f.querySelector('.mv-to'), '1');
  H.madMovSalaChange(pon(f.querySelector('.mv-sd'), 'Sala 2')); pon(f.querySelector('.mv-td'), '16');
  pon(f.querySelector('.mv-machos'), '5'); pon(f.querySelector('.mv-hembras'), '5');
};
const sembrar = (ficha, e) => localStorage.setItem(H.MAD_LOC_PRE + ficha, JSON.stringify([{ id: 'sem1', ts: Date.now(), huella: 'h-sem1', ...e }]));
const deError = () => avisos.filter((a) => a.tipo === 'err').map((a) => a.msg);

beforeEach(() => {
  envios.length = 0;
  avisos.length = 0;
  pideVer = 0;
  respuestaPost = () => 'ok';
  respuestaVer = { ok: true, version: H._gasVersionLocal() };
  localStorage.removeItem('larv4_syncqueue');
  for (const f of H.MAD_LOC_FICHAS) localStorage.removeItem(H.MAD_LOC_PRE + f);
  for (const k of [H.MAD_TRAT_LOG_KEY, H.MAD_MOV_LOG_KEY, H.MAD_ALIM_LOG_KEY, H.MAD_DES_LOG_KEY, H.MAD_DES_PEND_KEY, H.MAD_BORR_PRE + 'tratamientos']) localStorage.removeItem(k);
  H.setVista(null, 'calidad');
  H.madTratReiniciar();
  H.madMovReiniciar();
});

describe('💾 Guardar local · guarda en el dispositivo y no toca la red', () => {
  it('🔴 no sale nada ni se pregunta al GAS; la ficha queda limpia y lo guardado se ve «sin enviar»', () => {
    llenarTrat();
    H.madTratGuardarLocal();
    expect(envios, 'salió a la red').toHaveLength(0);
    expect(pideVer, 'preguntó al GAS para guardar en local').toBe(0);
    expect(cola()).toHaveLength(0);
    const [e] = guardado();
    expect(e.payload.sheetName).toBe(H.MAD_TRAT_SHEET);
    expect([e.fecha, e.filas]).toEqual(['2026-09-15', e.payload.rows.length]);
    expect(e.filas).toBeGreaterThan(0);
    expect(lotesEnPantalla(), 'la ficha no se limpió').toBe('');
    expect(document.getElementById('mt-loc').textContent).toContain('Guardado en este dispositivo, sin enviar (1)');
    expect(H.madTratLogLeer(), 'lo guardado sin enviar no es un envío del registro').toEqual([]);
    expect(avisos.some((a) => a.tipo === 'ok' && /Guardado en este dispositivo, sin enviar/.test(a.msg))).toBe(true);
  });

  it('con errores no guarda nada', () => {
    H.madTratGuardarLocal();                        // ficha vacía de salida: sin sala ni estado
    expect(guardado()).toEqual([]);
    expect(avisos.some((a) => a.tipo === 'err' || a.tipo === 'warn')).toBe(true);
  });

  it('🔴 guardar dos veces LO MISMO no lo duplica', () => {
    llenarTrat();
    H.madTratGuardarLocal();
    llenarTrat();
    H.madTratGuardarLocal();
    expect(guardado()).toHaveLength(1);
    expect(avisos.some((a) => /ya estaba guardado/.test(a.msg))).toBe(true);
  });

  it('🔴 con el TOPE de envíos sin enviar, 💾 se niega y lo dice (no expulsa el más viejo)', () => {
    const llenos = Array.from({ length: H.MAD_LOC_MAX }, (_, i) => ({ id: 'v' + i, ts: i, huella: 'h' + i, fecha: '2026-09-01', filas: 1, payload: { sheetName: 'x', headers: [], rows: [[i]] }, info: {} }));
    localStorage.setItem(H.MAD_LOC_PRE + 'tratamientos', JSON.stringify(llenos));
    llenarTrat();
    H.madTratGuardarLocal();
    expect(guardado().map((e) => e.id)).toEqual(llenos.map((e) => e.id));
    expect(deError().some((m) => /envíalos con ☁️ o descarta alguno/.test(m))).toBe(true);
    expect(lotesEnPantalla(), 'se limpió la ficha sin haber guardado').toBe('BP');
  });

  it('🔴 si el navegador NO guarda, lo dice y la ficha NO se limpia (lo tecleado no se pierde)', () => {
    /* ⚠ Dónde vive `setItem` depende del ENTORNO, y equivocarse no da error: el espía no intercepta y la prueba cree
       que el navegador «no guardó». Con un sustituto de objeto plano es PROPIO; con un Storage normal, del PROTOTIPO;
       y con el de happy-dom (en la CI, entonces con Node 20) es un Proxy que, la primera vez que se lee un método, lo ATA como
       propiedad propia del objeto de detrás y la esconde: espiar el prototipo no intercepta nada. Pasó el 2026-09-18,
       en el primer push de esta prueba: verde aquí (Node 26) y rojo en la CI. Por eso se COMPRUEBA que el espía
       intercepta antes de fiarse de él; si en el prototipo no, se espía el propio objeto (tinyspy restaura
       redefiniendo, y el Proxy lo admite). */
    const sonda = H.MAD_LOC_PRE + '__sonda';
    const intercepta = () => { try { localStorage.setItem(sonda, '1'); } catch (_) { return true; } localStorage.removeItem(sonda); return false; };
    const dueños = Object.prototype.hasOwnProperty.call(localStorage, 'setItem') ? [localStorage] : [Object.getPrototypeOf(localStorage), localStorage];
    let espia = null;
    for (const dueño of dueños) {
      const original = dueño.setItem;
      espia = vi.spyOn(dueño, 'setItem').mockImplementation(function (k, v) {
        if (String(k).indexOf(H.MAD_LOC_PRE) === 0) throw new Error('almacenamiento lleno');
        return original.call(this, k, v);
      });
      if (intercepta()) break;
      espia.mockRestore();
      espia = null;
    }
    expect(espia, 'el arnés no consigue simular un navegador que no guarda: la prueba no probaría nada').not.toBe(null);
    try {
      llenarTrat('2026-09-15', 'LLENO');
      H.madTratGuardarLocal();
    } finally { espia.mockRestore(); }
    expect(guardado()).toEqual([]);
    expect(lotesEnPantalla(), 'se limpió la ficha sin haberla guardado').toBe('LLENO');
    expect(deError().some((m) => /NO está guardando/.test(m))).toBe(true);
  });

  it('🗑 descarta lo guardado sin enviarlo', () => {
    llenarTrat();
    H.madTratGuardarLocal();
    H.madLocDescartar('tratamientos', guardado()[0].id);
    expect(guardado()).toEqual([]);
    expect(document.getElementById('mt-loc').textContent).toBe('');
    expect(envios).toHaveLength(0);
  });
});

describe('☁️ Guardar y sincronizar · primero lo guardado, luego lo de pantalla', () => {
  it('🔴 salen los dos, lo guardado ANTES, cada uno con su entrada en el registro', async () => {
    llenarTrat('2026-09-15', 'VIEJO');
    H.madTratGuardarLocal();
    const [viejo] = guardado();
    llenarTrat('2026-09-16', 'NUEVO');
    await H.madTratGuardar();
    expect(envios.map((b) => JSON.stringify(b.rows).indexOf('VIEJO') !== -1 ? 'guardado' : 'pantalla')).toEqual(['guardado', 'pantalla']);
    expect(guardado()).toEqual([]);
    const log = H.madTratLogLeer();
    expect(log.map((e) => [e.fecha, e.estado])).toEqual([['2026-09-15', 'ok'], ['2026-09-16', 'ok']]);
    expect(log[0].id, 'la entrada del registro no es la del envío guardado').toBe(viejo.id);
    expect(pideVer, 'se preguntó al GAS más de una vez').toBe(1);
  });

  it('🔴 con la ficha VACÍA envía lo guardado y no dice «no hay nada que guardar»', async () => {
    llenarTrat('2026-09-15', 'VACIA');   // lote propio: postPayload deduplica 30 s por contenido
    H.madTratGuardarLocal();
    await H.madTratGuardar();
    expect(envios).toHaveLength(1);
    expect(guardado()).toEqual([]);
    expect(avisos.some((a) => /No hay ningún tratamiento/.test(a.msg))).toBe(false);
    // Una ficha vacía da errores de validación («falta la sala»): con algo guardado no pueden frenar el envío.
    expect(avisos.some((a) => /Corrige los errores/.test(a.msg)), 'la ficha vacía frenó el envío de lo guardado').toBe(false);
  });

  it('sin nada guardado ni en pantalla, sigue diciendo que no hay nada', async () => {
    llenarTrat();
    pon(q('#mt-prevs .mt-lotes'), '');
    avisos.length = 0;
    H.madTratReiniciar();
    await H.madTratGuardar();
    expect(envios).toHaveLength(0);
  });

  it('🔴 si lo guardado FALLA se para: lo de pantalla no sale y sigue ahí, y lo guardado sigue guardado', async () => {
    llenarTrat('2026-09-15', 'VIEJO');
    H.madTratGuardarLocal();
    llenarTrat('2026-09-16', 'NUEVO');
    respuestaPost = () => 'rejected';
    await H.madTratGuardar();
    expect(envios).toHaveLength(1);
    expect(guardado()).toHaveLength(1);
    expect(lotesEnPantalla(), 'se perdió lo de pantalla').toBe('NUEVO');
    expect(H.madTratLogLeer()).toEqual([]);
  });

  it('🔴 con un GAS que NO es el de esta app no sale nada y lo guardado sigue guardado', async () => {
    llenarTrat('2026-09-15', 'VIEJOGAS');   // lote propio: postPayload deduplica 30 s por contenido
    H.madTratGuardarLocal();
    respuestaVer = 'FichasLarv-OK';
    await H.madTratGuardar();
    expect(envios).toHaveLength(0);
    expect(cola()).toHaveLength(0);
    expect(guardado()).toHaveLength(1);
    expect(deError().some((m) => /no es el de esta app/.test(m))).toBe(true);
  });

  it('🔴 con ?p=ver mudo lo guardado va a la COLA con su marca, deja de estar «sin enviar» y se entrega después', async () => {
    llenarTrat('2026-09-15', 'MUDO');   // lote propio: postPayload deduplica 30 s por contenido
    H.madTratGuardarLocal();
    const [e] = guardado();
    respuestaVer = 'red';
    await H.madTratGuardar();
    expect(envios).toHaveLength(0);
    expect(guardado()).toEqual([]);
    expect(cola().map((it) => it.mark)).toEqual([{ kind: 'madlog:tratamientos', keys: [e.id] }]);
    expect(H.madTratLogLeer().map((x) => [x.id, x.estado])).toEqual([[e.id, 'cola']]);
    respuestaVer = { ok: true, version: H._gasVersionLocal() };
    await H.flushSyncQueue();
    expect(H.madTratLogLeer().map((x) => x.estado)).toEqual(['ok']);
  });

  it('🔴 dos guardados salen en el ORDEN en que se guardaron', async () => {
    llenarTrat('2026-09-15', 'UNO'); H.madTratGuardarLocal();
    llenarTrat('2026-09-15', 'DOS'); H.madTratGuardarLocal();
    await H.madTratGuardar();
    expect(envios.map((b) => (JSON.stringify(b.rows).indexOf('UNO') !== -1 ? 'UNO' : 'DOS'))).toEqual(['UNO', 'DOS']);
  });

  it('🔴 con dos guardados, si el primero FALLA no se intenta el segundo y los dos siguen guardados', async () => {
    llenarTrat('2026-09-15', 'PRIMERO'); H.madTratGuardarLocal();
    llenarTrat('2026-09-15', 'SEGUNDO'); H.madTratGuardarLocal();
    respuestaPost = () => 'rejected';
    await H.madTratGuardar();
    expect(envios).toHaveLength(1);
    expect(guardado()).toHaveLength(2);
  });

  it('🔴 con ?p=ver mudo y varios guardados, «en cola, sin enviar» se avisa UNA vez, no una por envío', async () => {
    llenarTrat('2026-09-15', 'AVISO1'); H.madTratGuardarLocal();
    llenarTrat('2026-09-15', 'AVISO2'); H.madTratGuardarLocal();
    respuestaVer = 'red';
    avisos.length = 0;
    await H.madTratGuardar();
    expect(cola()).toHaveLength(2);
    expect(avisos.filter((a) => /En cola, sin enviar/.test(a.msg))).toHaveLength(1);
  });

  it('🔴 dos envíos a la vez de lo guardado no lo mandan dos veces', async () => {
    llenarTrat('2026-09-15', 'VUELO');   // lote propio: postPayload deduplica 30 s por contenido
    H.madTratGuardarLocal();
    let soltar;
    const espera = new Promise((r) => { soltar = r; });
    respuestaPost = async () => { await espera; return 'ok'; };
    const primero = H._madLocEnviar('tratamientos');
    const segundo = await H._madLocEnviar('tratamientos');
    expect(segundo.enVuelo).toBe(true);
    soltar();
    expect((await primero).enviados).toBe(1);
    expect(envios).toHaveLength(1);
  });

  it('🔴 Movimientos, SIN portón del sello: 💾 guarda y ☁️ lo envía igual', async () => {
    llenarMov();
    H.madMovGuardarLocal();
    expect(guardado('movimientos')).toHaveLength(1);
    expect(envios).toHaveLength(0);
    await H.madMovGuardar();
    expect(pideVer, 'Movimientos no pide el GAS de esta app').toBe(0);
    expect(envios).toHaveLength(1);
    expect(guardado('movimientos')).toEqual([]);
    expect(H.madMovLogLeer().map((e) => e.estado)).toEqual(['ok']);
  });
});

describe('Lo propio de cada ficha al salir lo guardado', () => {
  it('🔴 Alimentación: la agenda de esas salas deja de estar «sin guardar»', async () => {
    H.madAlimCfgGuardar({ 'Sala 1': { pendiente: true }, 'Sala 2': { pendiente: true } });
    sembrar('alimentacion', { fecha: '2026-09-15', filas: 1, payload: { sheetName: H.MAD_ALIM_SHEET, headers: ['Fecha'], rows: [['2026-09-15']] }, info: { salas: ['Sala 1'] } });
    const r = await H._madLocEnviar('alimentacion');
    expect(r.enviados).toBe(1);
    expect([H.madAlimCfgLeer()['Sala 1'].pendiente, H.madAlimCfgLeer()['Sala 2'].pendiente]).toEqual([false, true]);
    expect(H.madAlimLogLeer().map((e) => [e.id, e.estado])).toEqual([['sem1', 'ok']]);
  });

  it('🔴 Desoves: el desove pasa a los «pendientes» de este dispositivo y al historial con sus cifras', async () => {
    sembrar('desoves', { fecha: '2026-09-15', filas: 1, payload: { sheetName: H.MAD_DESOVE_SHEET, headers: ['Fecha'], rows: [['2026-09-15']] },
      info: { desoves: [{ lote: 'bp', codigoGenetico: 'cg1', huevos: '100' }] } });
    await H._madLocEnviar('desoves');
    expect(H.madDesLocalesLeer().map((d) => [d.fecha, d.lote, d.codigoGenetico, d.huevos])).toEqual([['2026-09-15', 'BP', 'CG1', '100']]);
    expect(H.madDesLogLeer().map((e) => [e.id, e.estado, e.desoves[0].lote])).toEqual([['sem1', 'ok', 'BP']]);
  });
});

describe('El borrador por fecha ya no resucita lo guardado, enviado o vaciado', () => {
  const D = '2026-09-10', E = '2026-09-11';
  const irA = (fecha) => { pon(q('#mt-fecha'), fecha); H.madBorrFechaChange('tratamientos'); };
  /* El borrador de un día se escribe al DEJARLO: por eso se va a E y se vuelve a D, que es cuando existe. */
  const conBorradorEnD = () => { irA(D); llenarTrat(D, 'BORRADOR'); irA(E); irA(D); };

  it('el fixture ejerce algo: volver a D trae lo tecleado', () => {
    conBorradorEnD();
    expect(lotesEnPantalla()).toBe('BORRADOR');
  });

  it('🔴 💾', () => {
    conBorradorEnD();
    H.madTratGuardarLocal();
    irA(E); irA(D);
    expect(lotesEnPantalla(), 'volver a D resucitó lo ya guardado').toBe('');
  });

  it('🔴 ☁️ entregado', async () => {
    conBorradorEnD();
    await H.madTratGuardar();
    expect(envios).toHaveLength(1);
    irA(E); irA(D);
    expect(lotesEnPantalla(), 'volver a D resucitó lo ya enviado').toBe('');
  });

  it('🔴 🧹 Vaciar', () => {
    conBorradorEnD();
    H.madTratVaciar();
    irA(E); irA(D);
    expect(lotesEnPantalla(), 'volver a D resucitó lo que se tiró').toBe('');
  });
});

describe('Lo guardado cuenta en el módulo: el punto, el contador y «Sincronizar todo»', () => {
  const MAD = 12;
  it('🔴 el punto de la pestaña y el contador lo cuentan, y «Sincronizar todo» lo envía', async () => {
    if (!document.getElementById('dot-tratamientos')) {
      const d = document.createElement('span'); d.id = 'dot-tratamientos'; d.className = 'fdot mt'; document.body.appendChild(d);
    }
    H.setVista(MAD, 'tratamientos');
    llenarTrat('2026-09-15', 'TODO');   // lote propio: postPayload deduplica 30 s por contenido
    H.madTratGuardarLocal();
    expect(document.getElementById('dot-tratamientos').className).toBe('fdot pend');
    expect(document.getElementById('slbl').textContent).toBe('1 registro(s) pendiente(s)');
    expect(H.madLocTotal()).toBe(1);
    await H.syncAll();
    expect(envios.map((b) => b.sheetName)).toEqual([H.MAD_TRAT_SHEET]);
    expect(guardado()).toEqual([]);
    H.updateDots();
    expect(document.getElementById('dot-tratamientos').className).toBe('fdot mt');
  });

  it('🔴 «Sincronizar todo» con un GAS que NO es el de esta app no manda lo guardado (el portón vale también ahí)', async () => {
    H.setVista(MAD, 'tratamientos');
    llenarTrat('2026-09-15', 'SYNCVIEJO');
    H.madTratGuardarLocal();
    respuestaVer = 'FichasLarv-OK';
    await H.syncAll();
    expect(envios).toHaveLength(0);
    expect(cola()).toHaveLength(0);
    expect(guardado()).toHaveLength(1);
  });

  it('🔴 «Sincronizar todo» con ?p=ver mudo lo deja en cola y lo DICE: no presume de «sincronizado» (H1)', async () => {
    H.setVista(MAD, 'tratamientos');
    llenarTrat('2026-09-15', 'SYNCMUDO');
    H.madTratGuardarLocal();
    respuestaVer = 'red';
    await H.syncAll();
    expect(cola()).toHaveLength(1);
    expect(document.getElementById('slbl').textContent).toContain('en cola');
  });

  /* 🔴 2026-09-17 · «Sincronizar todo» pasaba `undefined` y CADA ficha preguntaba el portón por su cuenta: seis
     viajes a ?p=ver para una sola pulsación. Medido contra producción, ?p=ver tarda de verdad y el portón corta a
     los 6 s, así que no era sólo lentitud: cada espera agotada devuelve «sin confirmar», y lo que con UNA consulta
     buena se habría entregado acababa en la cola, ficha por ficha. */
  it('🔴 «Sincronizar todo» pregunta el portón del sello UNA sola vez para todas las fichas', async () => {
    /* ⚠ Las cabeceras se sacan de la propia ficha: con unas inventadas, la guarda del esquema desfasado (más abajo)
       se salta el envío y la prueba mediría otra cosa. */
    const semilla = (ficha, lote) => {
      const c = H._madLocCfg(ficha), cab = c.cab();
      localStorage.setItem(H.MAD_LOC_PRE + ficha, JSON.stringify([{
        id: 'x' + ficha, ts: Date.now(), fecha: '2026-09-15', filas: 1, huella: 'h' + ficha, info: {},
        payload: { sheetName: c.hoja, headers: cab, rows: [cab.map((_, i) => (i === 0 ? '2026-09-15' : lote + i))] },
      }]));
    };
    semilla('tratamientos', 'UNAVEZ1');
    semilla('fin', 'UNAVEZ2');
    semilla('mortdes', 'UNAVEZ3');
    H.setVista(MAD, 'tratamientos');
    pideVer = 0;
    await H.syncAll();
    expect(pideVer, 'una consulta por ficha en vez de una para todas').toBe(1);
    // y el fixture ejerce algo: esa respuesta única SE USA, las tres salen de verdad
    expect(envios).toHaveLength(3);
    expect(H.madLocTotal()).toBe(0);
  });

  /* 🔴 2026-09-17 · EL PRESUPUESTO DEL PORTÓN. Era 6000: el MÁS CORTO de toda la app, y es el de la pregunta que
     decide si las fichas selladas escriben en producción. Más corto que «Probar conexión» (8000), que consulta ESTE
     MISMO ?p=ver, y que la verificación de la cola (12000). Medido contra el GAS desplegado: 2,5–4,9 s en caliente
     y 10,8 s en la primera llamada (arranque en frío de Apps Script), así que la primera sincronización de cada
     sesión se pasaba de plazo y todo iba a la cola en vez de entregarse.
     🔑 Se vigila la RELACIÓN, no el número: fijar «12000» aquí caducaría al primer ajuste. Lo que no puede volver
     a pasar es que la pregunta que MANDA tenga menos plazo que la que sólo informa. */
  describe('el plazo de ?p=ver', () => {
    const src = readFileSync(ENGINE, 'utf8');
    const ms = (re, que) => {
      const m = re.exec(src);
      expect(m, 'no se encontró el plazo de ' + que).not.toBeNull();
      return Number(m[1]);
    };
    const portero = () => ms(/const MAD_GAS_VER_MS = (\d+);/, 'el portón');

    it('🔴 el portón NO espera menos que «Probar conexión», que pregunta lo mismo', () => {
      const probar = ms(/toast\("Probando conexión…[\s\S]{0,200}?ctrl\.abort\(\), (\d+)\)/, '«Probar conexión»');
      expect(portero()).toBeGreaterThanOrEqual(probar);
    });

    it('🔴 y sigue MUY por debajo del POST, que espera al candado del GAS', () => {
      const post = ms(/ctrl\.abort\(\), (\d+)\); \/\/ 40 s/, 'el POST');
      expect(portero()).toBeLessThan(post);
    });
  });

  /* Movimientos es la única de las siete que NO pide sello: si sólo hay guardado suyo, el portón no se pregunta.
     Preguntarlo «por si acaso» costaría un viaje a ?p=ver —y hasta 6 s de espera— para nada. */
  it('🔴 y NO lo pregunta si ninguna ficha con envíos guardados pide sello', async () => {
    expect(H._madLocCfg('movimientos').sello, 'el fixture ejerce algo: ésta no pide sello').toBe(false);
    const c = H._madLocCfg('movimientos'), cab = c.cab();
    localStorage.setItem(H.MAD_LOC_PRE + 'movimientos', JSON.stringify([{
      id: 'xmov', ts: Date.now(), fecha: '2026-09-15', filas: 1, huella: 'hmov', info: { tipo: 'Traslado' },
      payload: { sheetName: c.hoja, headers: cab, rows: [cab.map((_, i) => (i === 0 ? '2026-09-15' : 'M' + i))] },
    }]));
    H.setVista(MAD, 'movimientos');
    pideVer = 0;
    await H.syncAll();
    expect(pideVer, 'se preguntó el portón sin que nadie lo necesitara').toBe(0);
    expect(envios, 'y aun así tiene que haber salido').toHaveLength(1);
  });

  /* 🔴 2026-09-17 · 💾 congela el PAYLOAD con SUS cabeceras, y la hoja puede ganar una columna después: a Inf.
     Supervisor le pasó con PE1.5 (de 15 a 17, insertando). Ese guardado ya no se puede enviar. El GAS lo rechaza
     —bien—, pero con un mensaje que manda «actualiza la app», que aquí ya está al día. Se detecta en el cliente. */
  describe('💾 guardado con un esquema ANTERIOR', () => {
    const conCab = (ficha, cab) => {
      const c = H._madLocCfg(ficha);
      localStorage.setItem(H.MAD_LOC_PRE + ficha, JSON.stringify([{
        id: 'viejo', ts: Date.now(), fecha: '2026-09-15', filas: 1, huella: 'hv', info: {},
        payload: { sheetName: c.hoja, headers: cab, rows: [cab.map((_, i) => (i === 0 ? '2026-09-15' : 'V' + i))] },
      }]));
    };

    it('🔴 no se envía, se explica lo que pasa de verdad y sigue guardado para apuntarlo', async () => {
      const cab = H._madLocCfg('mortdes').cab().slice();
      cab.splice(10, 1);                       // como el cliente de antes de PE1.5: una columna MENOS en medio
      conCab('mortdes', cab);
      const r = await H._madLocEnviar('mortdes');
      expect(envios, 'un esquema corrido no puede llegar a la hoja').toHaveLength(0);
      expect(cola(), 'ni a la cola: reintentarlo no lo arregla').toHaveLength(0);
      expect(r.desfasados).toBe(1);
      expect(H.madLocLeer('mortdes'), 'se borró lo que el usuario tiene que volver a registrar').toHaveLength(1);
      expect(deError().some((m) => /versi.n ANTERIOR de la app/.test(m)), 'no se dijo por qué').toBe(true);
      expect(deError().some((m) => /[Aa]ctualiza el GAS/.test(m)), 'culpó al GAS, que no tiene nada que ver').toBe(false);
    });

    it('🔴 añadir una columna AL FINAL no lo invalida: eso la hoja lo absorbe', async () => {
      conCab('mortdes', H._madLocCfg('mortdes').cab().slice(0, -1));   // una menos, pero al final
      const r = await H._madLocEnviar('mortdes');
      expect(r.desfasados, 'un sufijo más corto NO es un desfase: ensureHeaders alarga la cabecera').toBe(0);
      expect(envios).toHaveLength(1);
    });

    it('la lista lo marca, para que 🗑 sea lo evidente antes de pulsar ☁️', () => {
      const cab = H._madLocCfg('tratamientos').cab().slice();
      cab.splice(2, 1);
      conCab('tratamientos', cab);
      H.setVista(MAD, 'tratamientos');
      H.madTratReiniciar();
      const caja = document.getElementById('mt-loc');
      expect(caja.querySelectorAll('.mad-loc-viejo')).toHaveLength(1);
      expect(caja.textContent).toContain('ya no se puede enviar');
    });
  });

  it('🔴 la tarjeta del módulo se enciende con lo guardado sin enviar', () => {
    H.buildGrid();
    expect(document.getElementById('mc12').className, 'el fixture ejerce algo: sin nada guardado está apagada').not.toContain('pend');
    llenarTrat('2026-09-15', 'TARJETA');
    H.madTratGuardarLocal();
    H.buildGrid();
    expect(document.getElementById('mc12').className).toContain('pend');
  });
});

/* V1 (2026-09-18) · entra la OCTAVA: el Control Broodstock. Con una diferencia que se fija aquí en vez de disimularla:
   es una carga de ARCHIVO, no un formulario, así que no tiene borrador de pantalla que su 🧹 deba olvidar (el Excel
   sigue en el equipo de quien lo sube). Lo demás —💾, su caja, ☁️ que envía antes lo guardado, el sello— igual. */
describe('Las ocho fichas, cableadas', () => {
  const src = readFileSync(ENGINE, 'utf8');
  const OCHO = [['ingreso', 'Ing', 'mi-loc', true, true], ['movimientos', 'Mov', 'mv-loc', false, true], ['desoves', 'Des', 'md-loc', true, true],
    ['mortdes', 'Mort', 'mm-loc', true, true], ['fin', 'Fin', 'mf-loc', true, true], ['tratamientos', 'Trat', 'mt-loc', true, true],
    ['alimentacion', 'Alim', 'ma-loc', true, true], ['broodstock', 'Bs', 'mb-loc', true, false]];

  it('son exactamente las ocho, y ninguna es una grilla de MAD_FICHAS', () => {
    expect([...H.MAD_LOC_FICHAS].sort()).toEqual(OCHO.map((s) => s[0]).sort());
    expect(src).toContain('const MAD_FICHAS    = ["salas","tanques"];');
  });

  it.each(OCHO)('%s · botón 💾, su caja, ☁️ envía antes lo guardado, 🧹 olvida el borrador (si lo tiene) y su portón', (ficha, pre, loc, sello, borrador) => {
    expect(src.split('onclick="mad' + pre + 'GuardarLocal()"')).toHaveLength(2);
    expect(src).toContain("'<div id=\"" + loc + "\">'+_madLocHTML(\"" + ficha + "\")+'</div>'");
    const ini = src.indexOf('async function mad' + pre + 'Guardar(){');
    const guardar = src.slice(ini, src.indexOf('\n}\n', ini));   // la función ENTERA: la de Ingreso pasa de 900 caracteres antes del envío
    expect(guardar).toContain('_loc=madLocLeer("' + ficha + '").length');
    expect(guardar).toContain('(await _madLocEnviar("' + ficha + '"');
    const i = src.indexOf('function mad' + pre + 'Vaciar(){');
    expect(i, 'tiene 🧹 Vaciar').toBeGreaterThan(-1);
    if (borrador) expect(src.slice(i, i + 300)).toContain('_madBorrOlvidarPantalla("' + ficha + '")');
    const c = H._madLocCfg(ficha);
    expect([c.loc, c.sello, typeof c.anota]).toEqual([loc, sello, 'function']);
  });
});
