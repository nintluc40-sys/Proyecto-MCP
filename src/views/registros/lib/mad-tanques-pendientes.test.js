// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · un parte YA ENVIADO y sin cambios no vuelve a quedar pendiente (usuarios, 2026-09-30)

   LO QUE CUENTAN: «guardan local y sincronizan, pasan a otra sala y hacen lo mismo, y les salen MÁS pendientes que los
   de la sala que acaban de dar».

   UNA DE SUS CAUSAS (leída en engine.js, 2026-09-30): el «🔄 Sincronizar» global manda también el parte ABIERTO —el que
   el autoguardado de la navegación guarda sin cerrar— y lo marca enviado. Pero un parte abierto se sigue pintando en la
   grilla, y al salir de la sala el autoguardado lo vuelve a guardar TAL CUAL: `_madMergeRow` lo marca `synced=false`
   aunque no haya cambiado nada. La sala que se acaba de dar vuelve a tener pendientes, y el ☁️ de la sala siguiente los
   manda otra vez (con la MISMA llave, así que la hoja no gana filas: el daño es el recuento, que ya no se cree nadie, y
   un envío de más en cada vuelta).

   🔑 Lo que NO puede romper el arreglo: si SÍ se cambia una cifra del parte enviado, vuelve a pendiente y se reenvía
   con su misma llave (misma hora, mismo parte), que es como se corrige una ronda.

   El arnés es el de mad-tanques-duplicados.test.js (engine.js entero en happy-dom; la cola, el sello y la
   reconciliación, reales; sólo se sustituye el POST de un intento). La «hoja» se simula con la llave del GAS.
   ⚠ Cada prueba usa cifras PROPIAS: el motor omite un envío idéntico a otro de hace menos de 30 s (`_lastSyncFingerprint`).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', '_collectTanquesGrid', 'saveMadTanquesGrid', 'syncMadTanquesGrid',
  'syncAll', 'loadMad', 'madTqObsBaja', '_gasVersionLocal', 'MAD_MOD', 'today'];
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
  /* El sello de esta app contesta; la hoja, VACÍA (por si el arreglo de la ronda repetida la lee antes de enviar). */
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    if (u.indexOf('p=rows') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
    throw new Error('fetch inesperado: ' + u);
  };
});

const poner = (tq, k, v) => {
  const el = document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
  if (!el) throw new Error('sin celda ' + k + ' del tanque ' + tq);
  el.value = String(v);
};
/** Marcar una observación como lo haría el usuario: tocar la casilla y disparar su asa. */
const marcar = (tq, k, valorObs) => {
  const c = [...document.querySelectorAll('#fp-tanques .tg-ms[data-k="' + k + '"][data-tq="' + tq + '"] .tg-ms-op')].find((x) => x.value === valorObs);
  if (!c) throw new Error('sin la opción «' + valorObs + '» en ' + k + ' del tanque ' + tq);
  c.checked = true; H.madTqObsBaja(c);
};
const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
const valor = (tq, k) => document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]').value;
const pendientes = (sala) => H.loadMad('tanques').filter((r) => !r.synced && r.data && r.data.sala === sala);
/** La HOJA como la deja el GAS: una fila por llave ([0,1,2,13,14] = Fecha, Sala, Tanque, Hora, Parte). */
const hoja = () => {
  const filas = new Map();
  envios.filter((b) => b.sheetName === 'Maduración Tanques').forEach((b) => {
    b.rows.forEach((r) => filas.set([r[0], r[1], r[2], r[13], r[14]].join('|'),
      { fecha: r[0], sala: r[1], tanque: r[2], hora: r[13], parte: r[14], machos: r[3] }));
  });
  return [...filas.values()];
};
const deHoja = (sala, tq) => hoja().filter((f) => f.sala === sala && String(f.tanque) === String(tq));
/** Teclear en una sala y SALIR de ella (el autoguardado abre el parte sin cerrarlo), y mandarlo con el 🔄 global. */
const darAbiertoYSincronizar = async (sala, teclear) => {
  irASala(sala);
  teclear();
  irASala('Sala 2');
  await H.syncAll();
};

beforeEach(() => {
  localStorage.clear();
  envios.length = 0; avisos.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });   // el vaciado de la cola a los 8 s no se cuela en otra prueba
  globalThis.confirm = () => true;
  H.setVista(H.MAD_MOD, 'tanques');
  H.renderMadTanques();
});
afterEach(() => { vi.useRealTimers(); H.setVista(null, 'calidad'); });

describe('Tanques · un parte ABIERTO ya enviado no vuelve a pendiente si nadie lo cambia', () => {
  it('el fixture ejerce algo: el autoguardado deja el parte ABIERTO y el 🔄 global lo envía', async () => {
    irASala('Sala 5');
    poner(7, 'machos_muertos', 2);
    irASala('Sala 2');
    const r = H.loadMad('tanques').filter((x) => x.data.sala === 'Sala 5');
    expect(r, 'el autoguardado de la navegación guardó el tanque').toHaveLength(1);
    expect(r[0].data.cerrado, 'el parte tiene que seguir ABIERTO: es el caso').toBeFalsy();
    expect(r[0].synced).toBe(false);
    await H.syncAll();
    expect(deHoja('Sala 5', 7).map((f) => [f.machos, f.parte])).toEqual([[2, 1]]);
    expect(pendientes('Sala 5')).toHaveLength(0);
  });

  it('🔴 el caso de los usuarios: volver a la sala y salir SIN TOCAR NADA no la deja otra vez pendiente', async () => {
    await darAbiertoYSincronizar('Sala 5', () => poner(7, 'machos_muertos', 3));
    irASala('Sala 5');
    expect(valor(7, 'machos_muertos'), 'el fixture ejerce algo: el parte abierto se vuelve a pintar').toBe('3');
    irASala('Sala 2');
    expect(pendientes('Sala 5'), 'lo ya enviado volvió a pendiente sin que nadie lo cambiara').toHaveLength(0);
  });

  it('🔴 y el ☁️ de la sala siguiente manda SÓLO lo de esa sala', async () => {
    await darAbiertoYSincronizar('Sala 5', () => poner(7, 'machos_muertos', 4));
    irASala('Sala 5');
    irASala('Sala 2');
    poner(16, 'hembras_muertas', 1);
    envios.length = 0;
    await H.syncMadTanquesGrid();
    const tq = envios.filter((b) => b.sheetName === 'Maduración Tanques');
    expect(tq).toHaveLength(1);
    expect(tq[0].rows.map((r) => r[1] + ' · T' + r[2]), 'se reenvió la sala anterior').toEqual(['Sala 2 · T16']);
  });

  it('🔴 «sin cambios» vale para TODAS las columnas: pesos con decimales y observaciones marcadas incluidos', async () => {
    await darAbiertoYSincronizar('Sala 5', () => {
      poner(8, 'hembras_muertas', 2);
      poner(8, 'peso_machos', '52.5');
      poner(8, 'peso_hembras', '64');
      marcar(8, 'obs_sanitarias', 'Animales en muda');
    });
    expect(deHoja('Sala 5', 8), 'el fixture ejerce algo: se envió').toHaveLength(1);
    irASala('Sala 5');
    expect(valor(8, 'peso_machos'), 'el fixture ejerce algo: el peso se repinta').toBe('52.5');
    irASala('Sala 2');
    expect(pendientes('Sala 5'), 'un tipo de columna distinto hizo creer que había cambios').toHaveLength(0);
  });

  it('el fixture ejerce algo: si SÍ se cambia una cifra, vuelve a pendiente y se reenvía con la MISMA llave', async () => {
    await darAbiertoYSincronizar('Sala 5', () => poner(9, 'machos_muertos', 5));
    const antes = deHoja('Sala 5', 9);
    expect(antes).toHaveLength(1);
    irASala('Sala 5');
    poner(9, 'machos_muertos', 6);
    irASala('Sala 2');
    expect(pendientes('Sala 5'), 'una corrección tiene que volver a enviarse').toHaveLength(1);
    await H.syncAll();
    const despues = deHoja('Sala 5', 9);
    expect(despues, 'la corrección llegó con OTRA llave: sería un duplicado').toHaveLength(1);
    expect([despues[0].machos, despues[0].hora, despues[0].parte]).toEqual([6, antes[0].hora, antes[0].parte]);
    expect(pendientes('Sala 5')).toHaveLength(0);
  });
});
