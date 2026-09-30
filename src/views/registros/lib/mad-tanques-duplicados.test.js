// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · un parte ya guardado no vuelve a la hoja con OTRA llave (usuarios, 2026-09-30)

   LO QUE CUENTAN: «guardan local y sincronizan, pasan a otra sala y hacen lo mismo, y les salen más pendientes de los
   de la sala que acaban de dar; en la hoja, efectivamente, se envían por duplicado».

   LO MEDIDO (2026-09-30, sobre la hoja de producción): ninguna llave repetida —el GAS funde por (Fecha, Sala, Tanque,
   Hora, Parte) y un reenvío del MISMO parte actualiza su fila—; los duplicados son las MISMAS cifras guardadas otra vez
   como un parte NUEVO, con la hora del momento (P1 14:09 = P2 14:18; P2 00:48 = P1 00:55). Para eso la grilla tiene que
   volver a enseñar cifras ya guardadas, y lo hace «↩ Recuperar»: su autoguardado (periódico, y al salir) recoge la
   grilla SIN parte ni hora; un guardado deja la grilla vacía pero NO lo borra, y durante una hora el botón sigue en
   CUALQUIER sala, vuelve a la sala de entonces y funde esas filas sin parte, que no casan con ninguna: quedan abiertas y
   pendientes, se repintan tras cada guardado y cada 💾/☁️ las manda otra vez como parte nuevo.

   El arnés es el de mad-tanques-observaciones.test.js (engine.js entero en happy-dom; la cola, el sello y la
   reconciliación, reales; sólo se sustituye el POST de un intento). La «hoja» se simula con la llave del GAS.
   ⚠ Cada prueba usa cifras PROPIAS: el motor omite un envío idéntico a otro de hace menos de 30 s (`_lastSyncFingerprint`),
   y con las mismas cifras la prueba de al lado le «robaba» el primer envío.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', '_collectTanquesGrid', 'saveMadTanquesGrid', 'syncMadTanquesGrid',
  'syncAll', 'loadMad', 'saveMadRecovery', 'loadMadRecovery', 'recoverMadGrid', '_gasVersionLocal', 'MAD_MOD', 'today'];
const H = {};
const envios = [];
const avisos = [];

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
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  H.setPostOnce(async (body) => { envios.push(body); return 'ok'; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
  };
});

const poner = (tq, k, v) => {
  const el = document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
  if (!el) throw new Error('sin celda ' + k + ' del tanque ' + tq);
  el.value = String(v);
};
const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
const valor = (tq, k) => document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]').value;
/** La HOJA como la deja el GAS: una fila por llave; un reenvío de la misma llave la actualiza. La llave va POR POSICIÓN,
 *  como `madKeyCols` del GAS ([0,1,2,13,14] = Fecha, Sala, Tanque, Hora, Parte), no por el nombre de la cabecera. */
const hoja = () => {
  const filas = new Map();
  envios.filter((b) => b.sheetName === 'Maduración Tanques').forEach((b) => {
    b.rows.forEach((r) => filas.set([r[0], r[1], r[2], r[13], r[14]].join('|'),
      { fecha: r[0], sala: r[1], tanque: r[2], hora: r[13], parte: r[14], machos: r[3] }));
  });
  return [...filas.values()];
};
const deHoja = (sala, tq) => hoja().filter((f) => f.sala === sala && String(f.tanque) === String(tq));
/** El autoguardado en el almacenamiento (su clave acaba en «madgrid»), para leerlo o retocarlo como lo dejaría el tiempo. */
const claveRec = () => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/madgrid$/.test(k)) return k; } return null; };
const retocarRec = (f) => { const k = claveRec(); const o = JSON.parse(localStorage.getItem(k)); f(o); localStorage.setItem(k, JSON.stringify(o)); return o; };
const hhmm = (ts) => { const t = new Date(ts); return ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2); };

beforeEach(() => {
  localStorage.clear();
  envios.length = 0; avisos.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });   // el vaciado de la cola a los 8 s no se cuela en otra prueba
  globalThis.confirm = () => true;                                 // «¿Recuperar…?» y demás, aceptados
  H.setVista(H.MAD_MOD, 'tanques');                                // el autoguardado sólo corre en la grilla de Maduración
  H.renderMadTanques();
});
afterEach(() => { vi.useRealTimers(); H.setVista(null, 'calidad'); });

describe('Tanques · lo ya guardado no se vuelve a ofrecer para «↩ Recuperar»', () => {
  it('el fixture ejerce algo: guardar y sincronizar deja UNA fila en la hoja, con su hora y su parte', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 3);
    H.saveMadRecovery();                        // el autoguardado periódico, con la ronda tecleada
    expect(H.loadMadRecovery(), 'el autoguardado se tomó').not.toBeNull();
    await H.syncMadTanquesGrid();
    expect([envios[0].headers[13], envios[0].headers[14]], 'la «hoja» de esta prueba llavea por posición: tienen que ser éstas')
      .toEqual(['Hora', 'Parte']);
    const f = deHoja('Sala 5', 7);
    expect(f).toHaveLength(1);
    expect([f[0].machos, f[0].parte]).toEqual([3, 1]);
    expect(f[0].hora).toMatch(/^\d{2}:\d{2}$/);
  });

  it('🔴 el caso de los usuarios: guardar y sincronizar una sala y pasar a otra no deja «↩ Recuperar» con lo ya enviado', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 6);
    H.saveMadRecovery();
    await H.syncMadTanquesGrid();
    irASala('Sala 2');
    expect(H.loadMadRecovery(), 'lo guardado sigue ofrecido para recuperar: al pulsarlo se reenvía con otra llave').toBeNull();
    expect(document.querySelector('#fp-tanques .brec'), 'el botón «↩ Recuperar» sigue a la vista en la otra sala').toBeNull();
  });

  it('🔴 y si se recupera algo YA guardado, la hoja no gana otra fila con las mismas cifras', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 5);
    H.saveMadRecovery();
    await H.syncMadTanquesGrid();              // parte 1, enviado
    irASala('Sala 2');
    H.recoverMadGrid();                        // «↩ Recuperar», pulsado en otra sala
    await H.syncMadTanquesGrid();
    const f = deHoja('Sala 5', 7);
    expect(f.map((x) => x.hora + ' P' + x.parte), 'las mismas cifras llegaron con otra llave').toHaveLength(1);
  });

  it('🔴 pero el autoguardado de OTRA sala, o de otra fecha, sobrevive: sigue siendo lo no guardado', async () => {
    irASala('Sala 1');
    poner(3, 'machos_muertos', 2);
    H.saveMadRecovery();                      // Sala 1, tecleado y sin guardar…
    H.renderMadTanques();                     // …y la pantalla se va
    irASala('Sala 5');
    poner(7, 'machos_muertos', 8);
    await H.syncMadTanquesGrid();             // otra sala, guardada y enviada
    expect(H.loadMadRecovery() && H.loadMadRecovery().sala, 'guardar la Sala 5 tiró el autoguardado de la Sala 1').toBe('Sala 1');
    // el de la MISMA sala pero de otro día, tampoco
    retocarRec((o) => { o.sala = 'Sala 5'; o.fecha = '2026-01-02'; o.rows.forEach((r) => { r.sala = 'Sala 5'; r.fecha = '2026-01-02'; }); });
    poner(8, 'machos_muertos', 1);
    await H.syncMadTanquesGrid();
    expect(H.loadMadRecovery() && H.loadMadRecovery().fecha, 'guardar hoy tiró el autoguardado de otro día').toBe('2026-01-02');
  });
});

describe('Tanques · un autoguardado VIEJO (de antes del arreglo) de algo ya enviado no vuelve a la hoja', () => {
  /* Los móviles que ya tienen un autoguardado de antes de 2026-09-30 lo conservan hasta una hora: se simula guardándolo
     aparte antes del ☁️ y devolviéndolo después, como si el guardado no lo hubiera descartado. */

  it('🔴 recuperarlo no mete filas: sus cifras ya están guardadas en ese tanque, y se dice', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 2);
    poner(8, 'hembras_muertas', 1);
    H.saveMadRecovery();
    const k = claveRec();
    expect(k, 'el fixture ejerce algo: hay autoguardado').toBeTruthy();
    const viejo = localStorage.getItem(k);
    /* El autoguardado es PERIÓDICO: casi siempre es más viejo que lo que se acaba guardando. Lo guardado lleva además
       las cópulas; el autoguardado, no. Sigue estando «ya guardado». */
    poner(7, 'copulas', 5);
    await H.syncMadTanquesGrid();              // parte 1, enviado
    localStorage.setItem(k, viejo);            // el autoguardado de antes del arreglo, aún vivo
    irASala('Sala 2');
    H.recoverMadGrid();
    await H.syncMadTanquesGrid();
    expect(deHoja('Sala 5', 7), 'T7 llegó otra vez con otra llave').toHaveLength(1);
    expect(deHoja('Sala 5', 8), 'T8 llegó otra vez con otra llave').toHaveLength(1);
    expect(H.loadMad('tanques').filter((r) => !r.data.parte), 'quedó una fila SIN parte en el dispositivo').toHaveLength(0);
    expect(avisos.some((a) => a.msg.includes('ya estaba guardado')), 'no se dijo por qué no se recuperó nada').toBe(true);
  });

  it('🔴 y si trae cifras NUEVAS de un tanque, sólo ésas entran, en la ronda abierta', async () => {
    irASala('Sala 5');
    poner(9, 'machos_muertos', 1);
    H.saveMadTanquesGrid({ silent: true, noRender: true });   // la ronda abierta (auto-guardado), aún sin enviar
    poner(10, 'machos_muertos', 7);                            // tecleado después y no guardado…
    H.saveMadRecovery();                                       // …que sólo está en el autoguardado
    retocarRec((o) => { o.ts -= 20 * 60000; });                // de hace 20 min: su hora NO es la de la ronda abierta
    H.renderMadTanques();                                      // se pierde la pantalla
    expect(valor(10, 'machos_muertos'), 'el fixture ejerce algo: T10 se perdió').toBe('');
    H.recoverMadGrid();
    const abiertas = H.loadMad('tanques').filter((r) => r.data.sala === 'Sala 5' && !r.data.cerrado);
    expect(abiertas.map((r) => [r.data.tanque, r.data.parte]).sort(), 'T10 no entró en la ronda abierta (o entró T9 dos veces)')
      .toEqual([[10, 1], [9, 1]]);
    expect(new Set(abiertas.map((r) => r.data.hora)).size, 'la ronda abierta tiene UNA hora').toBe(1);
  });
});

describe('Tanques · una recuperación LEGÍTIMA (lo tecleado y no guardado) vuelve como la ronda abierta', () => {
  /* Lo que «↩ Recuperar» existe para salvar: se tecleó, no se guardó, y la página se fue. */
  const perderLaPantalla = () => H.renderMadTanques();   // repintar desde lo guardado: lo tecleado se va

  it('🔴 se envía UNA vez, con su parte y su hora, y la grilla queda limpia', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 4);
    H.saveMadRecovery();
    const { ts } = retocarRec((o) => { o.ts -= 20 * 60000; });   // tecleado hace 20 min
    perderLaPantalla();
    expect(valor(7, 'machos_muertos'), 'el fixture ejerce algo: lo tecleado se perdió').toBe('');
    H.recoverMadGrid();
    expect(valor(7, 'machos_muertos'), 'la recuperación lo devuelve a la grilla').toBe('4');
    await H.syncMadTanquesGrid();
    const f = deHoja('Sala 5', 7);
    expect(f.map((x) => (x.hora || '(sin hora)') + ' P' + (x.parte || '(sin parte)')), 'una ronda, una fila').toHaveLength(1);
    expect(f[0].parte, 'sin parte, la fila no casa con nada y no se puede corregir').toBe(1);
    expect(f[0].hora, 'la hora de la ronda es la de cuando se tecleó (el autoguardado), no la de recuperarla').toBe(hhmm(ts));
    expect(valor(7, 'machos_muertos'), 'la grilla no queda limpia: el siguiente guardado la vuelve a mandar').toBe('');
  });

  it('🔴 y un segundo ☁️ no manda nada más', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 9);
    H.saveMadRecovery();
    perderLaPantalla();
    H.recoverMadGrid();
    await H.syncMadTanquesGrid();
    await H.syncMadTanquesGrid();
    expect(deHoja('Sala 5', 7), 'cada ☁️ volvió a mandar la ronda recuperada').toHaveLength(1);
    expect(H.loadMad('tanques').filter((r) => !r.synced), 'quedan pendientes que ya están en la hoja').toHaveLength(0);
  });
});

describe('Tanques · cerrar un parte ya enviado sin cambiar nada no lo vuelve pendiente (arreglo d)', () => {
  /* `cerrado` es del dispositivo (deja la grilla limpia) y no viaja a la hoja: cerrar con 💾 un parte abierto que el 🔄 ya
     envió no cambia nada de lo que la hoja tiene, y no tiene por qué contarse ni mandarse otra vez. */
  it('🔴 el 🔄 envía el parte abierto; 💾 lo cierra; no queda nada pendiente', async () => {
    irASala('Sala 5');
    poner(11, 'machos_muertos', 4);
    H.saveMadTanquesGrid({ silent: true, noRender: true });   // el autoguardado: el parte ABIERTO
    await H.syncAll();
    expect(deHoja('Sala 5', 11), 'el fixture ejerce algo: el parte abierto se envió').toHaveLength(1);
    H.renderMadTanques();
    expect(valor(11, 'machos_muertos'), 'el fixture ejerce algo: el parte sigue abierto en la grilla').toBe('4');
    H.saveMadTanquesGrid();                                   // 💾 lo cierra, sin tocar ninguna cifra
    const r = H.loadMad('tanques').find((x) => x.data.tanque === 11);
    expect(r.data.cerrado, 'el fixture ejerce algo: quedó cerrado').toBe(1);
    expect(r.synced, 'cerrarlo lo volvió pendiente sin que cambiara nada de la hoja').toBe(true);
  });
});
