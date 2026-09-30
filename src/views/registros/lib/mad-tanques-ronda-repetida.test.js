// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · TANQUES · AVISO de ronda REPETIDA antes de enviar (usuarios, 2026-09-30)

   LO QUE CUENTAN: «en la hoja de Google, efectivamente, los partes llegan DUPLICADOS».

   LO MEDIDO (2026-09-30, la hoja de producción en sólo lectura, 736 filas): ninguna llave repetida y ninguna fila sin
   Hora ni Parte. El duplicado es OTRO: la misma ronda dada DOS VECES desde DOS dispositivos (o dos apps: index (8) y el
   MCP guardan en sitios distintos). Cada dispositivo numera sus partes con lo que tiene él y no ve lo que dio el otro:
     · 29/09 Sala 5: «21:22 P1» T7 3 ♀ muertas y T9 1 ♀, y dos minutos después «21:24 P3» T7 3 ♀ (+16 cópulas), T9 2 ♀,
       T11 2 ♀. T7 cuenta sus 3 hembras DOS veces y el libro resta 6;
     · 20/09 Sala 1: «00:48 P2» y «00:55 P1» con las mismas bajas en T1 y T11;
     · 10/09 Sala 2 y 5: el P2 de 9 minutos después repite las cópulas y la muda del P1 (sin muertes) en T16 y T11.
   El GAS no puede saber cuál es buena (una ronda real puede repetir cifras) y numerar por la hoja no es posible al
   guardar (sin red). Lo que sí se puede es PREGUNTAR antes de enviar, que es lo que se pide aquí.

   🔑 LA REGLA (afinada con esos datos):
     · se compara cada fila que se va a enviar con las de la HOJA del mismo (Fecha, Sala) y del mismo Tanque, leídas
       FRESCAS al enviar (GAS ?p=rows: la copia del tablero puede tener horas);
     · sólo las de OTRA llave (otra Hora o Parte): la misma llave es el mismo parte, y reenviarlo lo ACTUALIZA;
     · a 60 minutos o menos (las rondas reales van a horas: ~06:30, ~16:00, ~21:00);
     · «la misma ronda» = las cuatro columnas de MUERTES iguales (vacío = 0) y no todas a 0, o las seis cifras —muertes,
       cópulas y muda— iguales y no todas a 0. Todo a 0 no avisa: dos rondas sin bajas son lo normal;
     · UNA pregunta por envío, con los tanques y la hora del parte que ya está. «Cancelar» = no se envía Tanques y lo
       guardado sigue PENDIENTE en el dispositivo (nunca se borra nada solo); «Aceptar» = se envía como hoy;
     · sólo en los envíos MANUALES (☁️ de la grilla y 🔄 global, los dos sólo por clic): la cola que se vacía sola no
       pregunta. Si la hoja no se puede leer, se envía como hoy, sin preguntar.

   El arnés es el de mad-tanques-duplicados.test.js; aquí además se fija la HORA del dispositivo (Date falso), un DÍA
   distinto por prueba: así ni el límite de 15 envíos por minuto ni la huella de 30 s (`_lastSyncFingerprint`) cruzan
   de una prueba a otra. La «hoja» que se lee es la del fixture más lo que el GAS ya recibió (por su llave).
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['renderMadTanques', 'madTanquesSalaChange', 'saveMadTanquesGrid', 'syncMadTanquesGrid', 'syncAll',
  'flushSyncQueue', 'loadMad', '_gasVersionLocal', 'MAD_MOD', 'today'];
const H = {};
const envios = [];
const avisos = [];
const preguntas = [];
let respuesta = true;          // lo que contesta el usuario al confirm
let fixture = [];              // filas de la hoja que dio OTRO dispositivo
let hojaLegible = true;
let selloResponde = true;

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
    const u = String(url);
    if (u.indexOf('p=ver') !== -1) {
      if (!selloResponde) throw new TypeError('sin red');
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    }
    if (u.indexOf('p=rows') !== -1) {
      if (!hojaLegible) throw new TypeError('sin red');
      const hoja = decodeURIComponent((/[?&]sheet=([^&]*)/.exec(u) || [])[1] || '');
      const rows = hoja === 'Maduración Tanques' ? filasDeLaHoja() : [];
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows }) };
    }
    throw new Error('fetch inesperado: ' + u);
  };
});

const CAB = ['Fecha', 'Sala', 'Tanque', 'Machos muertos', 'Hembras muertas', 'Machos muertos por descarte de selección',
  'Hembras muertas por descarte de selección', 'Cópulas', 'Muda', 'Peso promedio machos (g)', 'Peso promedio hembras (g)',
  'Observaciones sanitarias', 'Observaciones operativas', 'Hora', 'Parte'];
/** Una fila como la devuelve ?p=rows (objeto por cabecera; lo vacío, ''). */
const fila = (sala, tanque, hora, parte, c = {}) => {
  const o = {};
  CAB.forEach((k) => { o[k] = ''; });
  return Object.assign(o, { Fecha: H.today(), Sala: sala, Tanque: tanque, Hora: hora, Parte: parte }, c);
};
/** La hoja: lo del otro dispositivo + lo que el GAS ya recibió, una fila por llave [0,1,2,13,14]. */
const filasDeLaHoja = () => {
  const m = new Map();
  fixture.forEach((f) => m.set([f.Fecha, f.Sala, f.Tanque, f.Hora, f.Parte].join('|'), f));
  envios.filter((b) => b.sheetName === 'Maduración Tanques').forEach((b) => b.rows.forEach((r) => {
    const o = {}; b.headers.forEach((h, i) => { o[h] = r[i]; });
    m.set([r[0], r[1], r[2], r[13], r[14]].join('|'), o);
  }));
  return [...m.values()];
};
const poner = (tq, k, v) => {
  const el = document.querySelector('#fp-tanques [name="tg_' + tq + '_' + k + '"]');
  if (!el) throw new Error('sin celda ' + k + ' del tanque ' + tq);
  el.value = String(v);
};
const irASala = (s) => { document.getElementById('mad-tanques-sala').value = s; H.madTanquesSalaChange(); };
const enviadasTq = () => envios.filter((b) => b.sheetName === 'Maduración Tanques');
const pendientes = (sala) => H.loadMad('tanques').filter((r) => !r.synced && r.data && r.data.sala === sala);
const cola = () => JSON.parse(localStorage.getItem('larv4_syncqueue') || '[]');
/** El dispositivo de la prueba da la ronda de las 21:24 en la Sala 5, como el «P3» del 29/09 (aquí será su P1). */
const darRondaSala5 = () => {
  irASala('Sala 5');
  poner(7, 'hembras_muertas', 3); poner(7, 'copulas', 16);
  poner(9, 'hembras_muertas', 2);
  poner(11, 'hembras_muertas', 2);
};
/** Lo que dio el OTRO dispositivo dos minutos antes: «21:22 P1» T7 3 ♀ y T9 1 ♀. */
const OTRO_2122 = () => [
  fila('Sala 5', 7, '21:22', 1, { 'Hembras muertas': 3 }),
  fila('Sala 5', 9, '21:22', 1, { 'Hembras muertas': 1 }),
];

let dia = 0;
beforeEach(() => {
  localStorage.clear();
  envios.length = 0; avisos.length = 0; preguntas.length = 0;
  fixture = []; respuesta = true; hojaLegible = true; selloResponde = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  dia++;
  vi.setSystemTime(new Date(2026, 7, dia, 21, 24, 0));            // agosto: un día por prueba, a las 21:24
  globalThis.confirm = (msg) => { preguntas.push(String(msg)); return respuesta; };
  H.setVista(H.MAD_MOD, 'tanques');
  /* La grilla se pinta con la fecha que YA tiene su campo (la de la prueba anterior): cada prueba, la de SU día, o las
     filas del dispositivo irían con el día de otra prueba y ninguna casaría con la hoja (visto 2026-09-30: aislada pasaba). */
  const fEl = document.getElementById('mad-tanques-fecha');
  if (fEl) fEl.value = H.today();
  H.renderMadTanques();
});
afterEach(() => { vi.useRealTimers(); H.setVista(null, 'calidad'); });

describe('Tanques · la misma ronda ya dada desde otro dispositivo: se PREGUNTA antes de enviarla', () => {
  it('el fixture ejerce algo: sin nada de esa sala en la hoja, ☁️ envía sin preguntar, con la hora del dispositivo', async () => {
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas).toEqual([]);
    expect(enviadasTq()).toHaveLength(1);
    expect(enviadasTq()[0].rows.map((r) => [r[1], r[2], r[4], r[13], r[14]]).sort((a, b) => a[1] - b[1]),
      'la hora del parte es la del dispositivo (el Date falso)').toEqual([
      ['Sala 5', 7, 3, '21:24', 1], ['Sala 5', 9, 2, '21:24', 1], ['Sala 5', 11, 2, '21:24', 1],
    ]);
  });

  it('🔴 el caso del 29/09: T7 con las mismas bajas que el parte de las 21:22 de otro dispositivo → UNA pregunta', async () => {
    fixture = OTRO_2122();
    respuesta = false;
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas, 'se envió sin preguntar: la hoja tendría las 3 ♀ de T7 dos veces').toHaveLength(1);
    expect(preguntas[0]).toMatch(/21:22/);
    expect(preguntas[0]).toMatch(/\bT7\b|[Tt]anque 7\b/);
    expect(preguntas[0], 'T9 no tiene las mismas bajas (1 ♀ frente a 2 ♀): no es la misma ronda').not.toMatch(/\bT9\b|[Tt]anque 9\b/);
  });

  it('🔴 «Cancelar» no envía Tanques y lo guardado sigue PENDIENTE (no se borra nada)', async () => {
    fixture = OTRO_2122();
    respuesta = false;
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas, 'el fixture ejerce algo: hubo pregunta').toHaveLength(1);
    expect(enviadasTq(), 'se envió aunque el usuario dijo que no').toHaveLength(0);
    expect(pendientes('Sala 5').map((r) => r.data.tanque).sort((a, b) => a - b)).toEqual([7, 9, 11]);
  });

  it('🔴 «Aceptar» envía la ronda entera, como hoy', async () => {
    fixture = OTRO_2122();
    respuesta = true;
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas).toHaveLength(1);
    expect(enviadasTq()).toHaveLength(1);
    expect(enviadasTq()[0].rows).toHaveLength(3);
    expect(pendientes('Sala 5')).toHaveLength(0);
  });

  it('🔴 el caso del 10/09: sin muertes, pero las mismas cópulas y muda que un parte de hace 9 minutos → pregunta', async () => {
    fixture = [fila('Sala 2', 16, '21:15', 1, { 'Cópulas': 15, Muda: 18 })];
    respuesta = false;
    irASala('Sala 2');
    poner(16, 'copulas', 15); poner(16, 'muda', 18);
    await H.syncMadTanquesGrid();
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toMatch(/21:15/);
    expect(enviadasTq()).toHaveLength(0);
  });

  it('🔴 el «🔄 Sincronizar» global también pregunta, y «Cancelar» deja Tanques pendiente', async () => {
    fixture = OTRO_2122();
    respuesta = false;
    darRondaSala5();
    H.saveMadTanquesGrid();
    await H.syncAll();
    expect(preguntas).toHaveLength(1);
    expect(enviadasTq()).toHaveLength(0);
    expect(pendientes('Sala 5')).toHaveLength(3);
  });

  it('🔴 y tras «Cancelar» el 🔄 global no termina diciendo que no queda nada pendiente', async () => {
    /* syncAll cierra con su resumen: sin nada más que enviar, «Sin datos nuevos» y «No hay datos pendientes»; con otra
       hoja enviada, «Todo sincronizado» a los 4 s. Con Tanques retenido, las dos cosas son falsas. */
    fixture = OTRO_2122();
    respuesta = false;
    darRondaSala5();
    H.saveMadTanquesGrid();
    await H.syncAll();
    vi.advanceTimersByTime(5000);
    expect(preguntas, 'el fixture ejerce algo: hubo pregunta').toHaveLength(1);
    expect(avisos.map((a) => a.msg).filter((m) => /No hay datos pendientes/.test(m)), 'dice que no hay pendientes con Tanques retenido').toEqual([]);
    expect(document.getElementById('slbl').textContent).not.toMatch(/Sin datos nuevos|Todo sincronizado/);
  });

  it('🔴 y si OTRA hoja sí se envió, a los 4 s tampoco dice «Todo sincronizado»: dice que Tanques quedó pendiente', async () => {
    /* La rama buena del resumen programa «Todo sincronizado» a los 4 s. Una fila de Salas pendiente hace que el 🔄 envíe
       algo (ok = 1) mientras Tanques se retiene. (2026-09-30, sesión del cliente: el caso que la prueba de arriba no cubre.) */
    localStorage.setItem('larv4_mad_salas', JSON.stringify([{ id: 's1', ts: Date.now(), synced: false, syncedAt: null,
      data: { fecha: H.today(), sala: 'Sala 1', estado: 'Operativa', temp_06: 28 } }]));
    fixture = OTRO_2122();
    respuesta = false;
    darRondaSala5();
    H.saveMadTanquesGrid();
    await H.syncAll();
    expect(envios.map((b) => b.sheetName), 'el fixture ejerce algo: Salas sí salió y Tanques no').toEqual(['Maduración Sala']);
    vi.advanceTimersByTime(5000);
    expect(document.getElementById('slbl').textContent).toMatch(/Tanques pendiente/);
  });
});

describe('Tanques · lo que NO es una ronda repetida no pregunta', () => {
  it('dos rondas reales SIN BAJAS (todo a 0) no preguntan', async () => {
    fixture = [fila('Sala 5', 7, '21:00', 1, { 'Machos muertos': 0, 'Hembras muertas': 0 })];
    irASala('Sala 5');
    poner(7, 'machos_muertos', 0); poner(7, 'hembras_muertas', 0);
    await H.syncMadTanquesGrid();
    expect(preguntas).toEqual([]);
    expect(enviadasTq()).toHaveLength(1);
  });

  it('las mismas bajas en una ronda de HACE HORAS (06:31) no preguntan', async () => {
    fixture = [fila('Sala 5', 7, '06:31', 1, { 'Hembras muertas': 3 })];
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas).toEqual([]);
    expect(enviadasTq()).toHaveLength(1);
  });

  it('🔴 a 61 minutos ya no pregunta; a 60, sí', async () => {
    fixture = [fila('Sala 5', 7, '20:23', 1, { 'Hembras muertas': 3 })];
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas, 'a 61 minutos').toEqual([]);
    vi.setSystemTime(new Date(2026, 7, dia, 22, 30, 0));   // otra ronda del mismo dispositivo, 66 min después
    fixture = [fila('Sala 4', 1, '21:30', 1, { 'Hembras muertas': 4 })];
    irASala('Sala 4');
    poner(1, 'hembras_muertas', 4);
    respuesta = false;
    await H.syncMadTanquesGrid();
    expect(preguntas, 'a 60 minutos exactos').toHaveLength(1);
  });

  it('el mismo número de tanque en OTRA sala no es la misma ronda (T1 está en la Sala 1 y en la Sala 4)', async () => {
    fixture = [fila('Sala 1', 1, '21:22', 1, { 'Hembras muertas': 1 })];
    irASala('Sala 4');
    poner(1, 'hembras_muertas', 1);
    await H.syncMadTanquesGrid();
    expect(preguntas).toEqual([]);
  });

  it('reenviar el MISMO parte (su misma llave, corregido) no pregunta: lo actualiza', async () => {
    irASala('Sala 5');
    poner(8, 'machos_muertos', 2);
    irASala('Sala 2');                                   // el autoguardado deja el parte ABIERTO
    await H.syncAll();
    expect(enviadasTq(), 'el fixture ejerce algo: el parte abierto se envió').toHaveLength(1);
    irASala('Sala 5');
    poner(10, 'machos_muertos', 2);                      // otro tanque del MISMO parte con las bajas de T8: la regla es POR TANQUE
    poner(8, 'machos_muertos', 2);
    irASala('Sala 2');
    await H.syncAll();
    expect(preguntas, 'se preguntó por su propio parte').toEqual([]);
  });

  /* 2026-09-30 (sesión del cliente, al escribir el banco) · la prueba de arriba ya no ejerce la exclusión del PROPIO
     parte: desde el arreglo (d), T8 sin cambios no vuelve a pendiente y no llega a compararse. Aquí se corrige una cifra
     que NO es de muertes (las cópulas) de un tanque ya enviado: vuelve a pendiente con su MISMA llave, y sus muertes
     coinciden con las de la hoja… porque la fila de la hoja ES la suya. */
  it('corregir una cifra del MISMO parte ya enviado (su misma llave) no pregunta', async () => {
    irASala('Sala 5');
    poner(8, 'hembras_muertas', 2);
    irASala('Sala 2');                                   // el autoguardado deja el parte ABIERTO
    await H.syncAll();
    expect(enviadasTq(), 'el fixture ejerce algo: el parte abierto se envió').toHaveLength(1);
    irASala('Sala 5');
    poner(8, 'copulas', 4);                              // la corrección: vuelve a pendiente, misma hora y parte
    irASala('Sala 2');
    expect(pendientes('Sala 5').map((r) => r.data.tanque), 'el fixture ejerce algo: T8 vuelve a pendiente').toEqual([8]);
    await H.syncAll();
    expect(preguntas, 'se preguntó por su propio parte').toEqual([]);
    expect(enviadasTq(), 'la corrección no salió').toHaveLength(2);
  });

  it('la misma ronda de OTRO día no pregunta', async () => {
    fixture = OTRO_2122().map((f) => Object.assign(f, { Fecha: '2026-01-02' }));
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas).toEqual([]);
    expect(enviadasTq()).toHaveLength(1);
  });

  it('si la hoja no se puede leer, se envía como hoy, sin preguntar', async () => {
    fixture = OTRO_2122();
    hojaLegible = false;
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(preguntas).toEqual([]);
    expect(enviadasTq()).toHaveLength(1);
  });

  it('la COLA que se vacía sola no pregunta al entregar', async () => {
    fixture = OTRO_2122();
    hojaLegible = false; selloResponde = false;          // sin red: ni se lee la hoja ni se confirma el sello
    darRondaSala5();
    await H.syncMadTanquesGrid();
    expect(cola().map((it) => it.payload && it.payload.sheetName), 'el fixture ejerce algo: fue a la cola').toEqual(['Maduración Tanques']);
    hojaLegible = true; selloResponde = true;            // vuelve la red
    globalThis.confirm = () => { throw new Error('la cola preguntó'); };
    await H.flushSyncQueue();
    expect(enviadasTq()).toHaveLength(1);
  });
});
