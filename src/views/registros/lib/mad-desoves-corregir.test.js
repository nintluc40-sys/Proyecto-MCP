// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · DESOVES · ✏️ CORREGIR DESDE EL HISTORIAL DE 36 h (usuario, 2026-09-24, punto 1)

   «En el historial del dispositivo (últimas 36 h) de Desoves, un botón a la izquierda para editar la
   información en caso de que se haya escrito algo mal.» Decisiones del usuario (las cuatro recomendadas):
   · se corrige TODO MENOS LA LLAVE (fecha, lote, código genético), como en ✏️ Completar;
   · si ya llegó a la hoja, sólo viaja LO QUE CAMBIÓ (el MERGE del GAS conserva lo demás, también lo
     que otro dispositivo completara después), y vaciar un campo no lo borra de la hoja: se avisa;
   · si sigue EN COLA, se corrige el envío pendiente EN SU SITIO (el viejo nunca llega después);
   · el historial conserva la MISMA fila, con lo corregido y «✏️ corregido hh:mm».
   Y lo que no llegó (⚠) se envía COMPLETO: es registrarlo de nuevo.
   Los datos son INVENTADOS (lotes ZA/ZB, códigos TST.*): las pruebas no llevan valores reales.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAD_DESOVE_HEADERS } from './ficha-maduracion-desoves.schema.js';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['madDesReiniciar', 'madDesCollect', 'madDesGuardar', 'buildMadDesovePayload', 'madDesFechaNFija',
  'madDesCorregir', 'madDesCorregirGuardar', 'madDesCorregirCancelar', 'madDesCorreccionCambios',
  'madDesLogLeer', 'MAD_DES_LOG_KEY', 'MAD_DES_PEND_KEY', 'MAD_BORR_PRE', 'madBorrGuardarYa', 'madBorrTraerDelDia',
  'renderMadDesoves', 'madDesEditar', '_enqueueSync', '_gasVersionLocal'];
const H = {};
const avisos = [];
const envios = [];
let respuestaVer = null;
let resultadoPost = 'ok';
let respuestaConfirm = true;
let vaciados = 0;
const COLA = 'larv4_syncqueue';

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
    + '\ntry{ H.setPost=function(f){postPayload=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setFlush=function(f){flushSyncQueue=f;}; }catch(_){}'
    + '\ntry{ H.setFlushing=function(v){_flushingQueue=v;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast((msg, tipo) => { avisos.push({ msg: String(msg), tipo: tipo || 'info' }); });
  // El envío directo: lo que devuelva `resultadoPost`. «queued» imita a postPayload, que encola CON la marca.
  H.setPost(async (payload, url, opts) => {
    envios.push({ payload, opts });
    if (opts) opts.outcome = resultadoPost;
    if (resultadoPost === 'queued') H._enqueueSync(payload, 'huella-' + envios.length, url, opts && opts.mark);
    return resultadoPost === 'ok';
  });
  // El vaciado de la cola no sale a la red en estas pruebas: se cuenta.
  H.setFlush(async () => { vaciados++; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  globalThis.confirm = () => respuestaConfirm;
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    return { ok: true, status: 200, text: async () => JSON.stringify(respuestaVer) };
  };
});

beforeEach(() => {
  localStorage.removeItem('larv4_gas_sello_ok');   // C (2026-09-24) · el «sí» del GAS, recordado 30 min, no pasa de una prueba a otra
  avisos.length = 0;
  envios.length = 0;
  vaciados = 0;
  resultadoPost = 'ok';
  respuestaConfirm = true;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };   // el GAS desplegado ES el de esta app
  H.setFlushing(false);
  [H.MAD_DES_LOG_KEY, H.MAD_DES_PEND_KEY, COLA, H.MAD_BORR_PRE + 'desoves'].forEach((k) => localStorage.removeItem(k));
  H.madDesReiniciar();
});

const q = (s) => document.querySelector('#fp-desoves ' + s);
const col = (h) => MAD_DESOVE_HEADERS.indexOf(h);
const hace = (h) => Date.now() - h * 3600e3;
const FECHA = '2026-09-20';
// 2026-10-04 · las fechas de oficio que guarda hoy la ficha: N2 = desove + 1 y N5 = N2 + 1 (antes: el desove y el día siguiente).
const DES_A = { lote: 'ZA', codigoGenetico: 'TST.A1', piscina: 'P9X', desoves: '12', huevos: '6500', hembrasNoViables: '3',
  fechaN2: '2026-09-21', n2: '', fechaN5: '2026-09-22', n5: '', despacho: 'Tabasca', observaciones: 'nota de prueba' };
const DES_B = { lote: 'ZB', codigoGenetico: 'TST.B2', piscina: 'P9Y', desoves: '7', huevos: '4100', hembrasNoViables: '',
  fechaN2: '2026-09-21', n2: '', fechaN5: '2026-09-22', n5: '', despacho: '', observaciones: '' };
const entrada = (id, estado, desoves, extra) => ({ id, marca: true, ts: hace(2), fecha: FECHA, filas: desoves.length, estado,
  desoves: desoves.map((d) => ({ ...d })), ...(extra || {}) });
const sembrar = (lista, cola) => {
  localStorage.setItem(H.MAD_DES_LOG_KEY, JSON.stringify(lista));
  if (cola) localStorage.setItem(COLA, JSON.stringify(cola)); else localStorage.removeItem(COLA);
  H.madDesReiniciar();
};
const cola = () => JSON.parse(localStorage.getItem(COLA) || '[]');
const log = () => H.madDesLogLeer();
const hist = () => [...document.querySelectorAll('#md-log tr.md-hist')];
const lapiz = (i) => hist()[i].cells[0].querySelector('.md-hist-ed');
const abrir = (i) => { const b = lapiz(i); H.madDesCorregir(b.dataset.id, b.dataset.k); };
// Un envío de la cola como los que deja la app: el payload de la ficha y la marca de su entrada del historial.
const envioEnCola = (id, desoves, extra) => ({ payload: H.buildMadDesovePayload({ fecha: FECHA, desoves }), reqId: 'huella-vieja',
  url: 'https://script.google.com/macros/s/AKfycbPRUEBA/exec', ts: hace(1), mark: { kind: 'madlog:desoves', keys: [id] }, ...(extra || {}) });

describe('Desoves · ✏️ en el historial de 36 h', () => {
  it('🔴 cada desove del historial lleva ✏️ en su celda IZQUIERDA, con su entrada y su llave', () => {
    // El historial enseña lo más reciente ARRIBA: la de antes, sin id, se guardó primero y sale la última.
    sembrar([{ ts: hace(3), fecha: FECHA, filas: 1, estado: 'ok', desoves: [{ lote: 'ZC', codigoGenetico: 'TST.C3' }] },
      entrada('e1', 'ok', [DES_A, DES_B])]);
    expect(hist()).toHaveLength(3);
    const b = lapiz(0);
    expect(b, 'el botón va en la PRIMERA celda').not.toBeNull();
    expect(b.textContent).toContain('✏️');
    expect(b.getAttribute('onclick')).toBe('madDesCorregir(this.dataset.id, this.dataset.k)');
    expect([b.dataset.id, b.dataset.k]).toEqual(['e1', '2026-09-20|ZA|TST.A1']);
    expect(lapiz(1).dataset.k).toBe('2026-09-20|ZB|TST.B2');
    expect(lapiz(2), 'sin id no hay a qué entrada volver: sin botón').toBeNull();
    expect(document.querySelector('#md-log thead th').textContent).toBe('');
  });

  it('🔴 una fila sin desove (sin llave) no lleva botón', () => {
    sembrar([entrada('e9', 'ok', [])]);
    expect(hist()).toHaveLength(1);
    expect(lapiz(0)).toBeNull();
  });

  it('🔴 el historial guarda YA la piscina y las observaciones de cada desove', async () => {
    document.getElementById('md-fecha').value = FECHA;
    q('.md-lote').value = 'ZA';
    q('.md-cg').value = 'TST.A1';
    q('.md-piscina').value = 'P9X';
    q('.md-desoves').value = '12';
    q('.md-obs').value = 'nota de prueba';
    await H.madDesGuardar();
    expect(log()[0].desoves[0]).toMatchObject({ lote: 'ZA', piscina: 'P9X', observaciones: 'nota de prueba' });
  });
});

describe('Desoves · ✏️ abre el desove para corregirlo', () => {
  it('🔴 con la LLAVE fija y lo guardado en su sitio', () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    const aviso = document.getElementById('md-edit');
    expect(aviso.getAttribute('data-corrige')).toBe('e1');
    expect(aviso.getAttribute('data-k')).toBe('2026-09-20|ZA|TST.A1');
    expect(aviso.textContent).toContain('Corrigiendo el desove del 2026-09-20');
    expect(document.getElementById('md-fecha').hasAttribute('readonly')).toBe(true);
    expect(document.getElementById('md-fecha').value).toBe(FECHA);
    expect(q('.md-lote').hasAttribute('readonly')).toBe(true);
    expect(q('.md-cg').hasAttribute('readonly')).toBe(true);
    expect([q('.md-lote').value, q('.md-cg').value, q('.md-piscina').value, q('.md-desoves').value, q('.md-huevos').value,
      q('.md-hnoviables').value, q('.md-obs').value]).toEqual(['ZA', 'TST.A1', 'P9X', '12', '6500', '3', 'nota de prueba']);
    expect(q('.md-desp-op[value="Tabasca"]').checked).toBe(true);
  });

  it('🔴 sólo con 🔍, ☁️ Guardar corrección y 🧹 Cancelar: ni ➕, ni 💾, ni 📥', () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    const fp = document.getElementById('fp-desoves');
    expect(fp.querySelector('[onclick="madDesAddCard()"]')).toBeNull();
    expect(fp.querySelector('[onclick="madDesGuardarLocal()"]')).toBeNull();
    expect(fp.querySelector('[onclick="madDesGuardar()"]')).toBeNull();
    expect(fp.querySelector('.md-cargar-btn')).toBeNull();
    expect(fp.querySelector('button[onclick^="madDesDelCard"]'), 'con UN desove, «✕ Quitar» no tiene nada que quitar').toBeNull();
    expect(fp.querySelector('[onclick="madDesCorregirGuardar()"]').textContent).toContain('Guardar corrección');
    expect(fp.querySelector('[onclick="madDesCorregirCancelar()"]').textContent).toContain('Cancelar');
    expect(fp.querySelector('[onclick="madDesRevisar()"]')).not.toBeNull();
  });

  it('🔴 un guardado de antes (sin piscina ni observaciones en el historial) las toma del envío que sigue en la cola', () => {
    const viejo = { ...DES_A };
    delete viejo.piscina;
    delete viejo.observaciones;
    sembrar([entrada('e1', 'cola', [viejo])], [envioEnCola('e1', [DES_A])]);
    abrir(0);
    expect([q('.md-piscina').value, q('.md-obs').value]).toEqual(['P9X', 'nota de prueba']);
  });

  it('🔴 con algo tecleado pregunta antes de reemplazarlo', () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    q('.md-lote').value = 'ZQ';
    respuestaConfirm = false;
    abrir(0);
    expect(document.getElementById('md-edit')).toBeNull();
    expect(q('.md-lote').value).toBe('ZQ');
  });
});

describe('Desoves · corregir lo que YA llegó a la hoja: sólo viaja lo que cambió', () => {
  it('🔴 cambia los huevos → viajan la llave y los huevos, nada más, con la MARCA de su entrada', async () => {
    const ts = hace(2);
    sembrar([entrada('e1', 'ok', [DES_A], { ts })]);
    abrir(0);
    q('.md-huevos').value = '6800';
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(1);
    const fila = envios[0].payload.rows[0];
    expect([fila[col('Fecha')], fila[col('Lote')], fila[col('Código genético')], fila[col('Total de huevos')]]).toEqual([FECHA, 'ZA', 'TST.A1', 6800000]);
    ['Piscina Broodstock', 'Desoves', 'Hembras no viables', 'Fecha N2', 'N2', 'Fecha N5', 'N5', 'Despacho', 'Observaciones']
      .forEach((h) => expect(fila[col(h)], h + ' va VACÍO: la hoja conserva el suyo').toBe(''));
    expect(envios[0].opts.mark).toEqual({ kind: 'madlog:desoves', keys: ['e1'] });
    const e = log()[0];
    expect([e.id, e.ts, e.estado, e.desoves[0].huevos]).toEqual(['e1', ts, 'ok', '6800']);
    expect(typeof e.desoves[0].corregido).toBe('number');
    expect(document.getElementById('md-edit'), 'la ficha vuelve a estar limpia').toBeNull();
    expect(hist()[0].textContent).toContain('✏️ corregido');
    expect(hist()[0].textContent).toContain('6800');
    const ok = avisos.find((a) => a.tipo === 'ok' && a.msg.includes('Total de huevos'));
    expect(ok, 'el aviso dice qué se corrigió').toBeDefined();
    expect(ok.msg.startsWith('✅'), 'el aviso «ok» ya pone su ✅: con otro saldría «✅ ✅»').toBe(false);
  });

  it('🔴 si el desove está en «pendientes» de este dispositivo se pone al día; si no está, no se añade', async () => {
    localStorage.setItem(H.MAD_DES_PEND_KEY, JSON.stringify([{ fecha: FECHA, lote: 'ZA', codigoGenetico: 'TST.A1', huevos: '6500', ts: hace(2) }]));
    sembrar([entrada('e1', 'ok', [DES_A, DES_B])]);
    abrir(0);
    q('.md-huevos').value = '6800';
    await H.madDesCorregirGuardar();
    abrir(1);
    q('.md-desoves').value = '8';
    await H.madDesCorregirGuardar();
    const pend = JSON.parse(localStorage.getItem(H.MAD_DES_PEND_KEY));
    expect(pend.map((p) => [p.lote, p.huevos])).toEqual([['ZA', '6800']]);   // ZB salió de la lista (o nunca estuvo): no vuelve
  });

  it('🔴 corregir el N2 lleva su fecha; corregir sólo la fecha de N2 lleva también su cifra', async () => {
    sembrar([entrada('e1', 'ok', [{ ...DES_A, n2: '3000' }])]);
    abrir(0);
    const f = q('.md-fn2');
    f.value = '2026-09-22';
    H.madDesFechaNFija(f);
    await H.madDesCorregirGuardar();
    const fila = envios[0].payload.rows[0];
    expect([fila[col('N2')], fila[col('Fecha N2')]]).toEqual([3000000, '2026-09-22']);
    expect(fila[col('Total de huevos')]).toBe('');
  });

  it('🔴 vaciar un campo ya enviado NO lo borra: no viaja y se avisa', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    q('.md-obs').value = '';
    q('.md-desoves').value = '13';
    await H.madDesCorregirGuardar();
    const fila = envios[0].payload.rows[0];
    expect([fila[col('Desoves')], fila[col('Observaciones')]]).toEqual([13, '']);
    expect(avisos.some((a) => a.tipo === 'warn' && a.msg.includes('Observaciones') && a.msg.includes('sigue en la hoja'))).toBe(true);
    expect(log()[0].desoves[0].observaciones, 'el historial dice lo que la hoja tiene').toBe('nota de prueba');
  });

  it('🔴 sólo vaciar: no hay nada que enviar, y se dice por qué', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    q('.md-obs').value = '';
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(0);
    expect(avisos.some((a) => a.msg.includes('vaciar un campo no lo borra'))).toBe(true);
    expect(document.getElementById('md-report').textContent).toContain('no lo borra de la hoja');
    expect(document.getElementById('md-edit'), 'la corrección sigue abierta').not.toBeNull();
  });

  it('🔴 sin cambios no se envía nada', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(0);
    expect(avisos.some((a) => a.msg.includes('No cambiaste nada'))).toBe(true);
    expect(log()[0].desoves[0].corregido).toBeUndefined();
  });

  /* 🔴 2026-10-04 · una entrada del historial guardada ANTES del cambio de regla trae las de oficio viejas (N2 = el desove,
     N5 = el día siguiente). Entran tal cual (la N2, fijada): corregirla sin tocar nada sigue sin enviar nada. */
  it('🔴 una entrada de ANTES del cambio de regla, sin cambios, no envía nada', async () => {
    sembrar([entrada('e1', 'ok', [{ ...DES_A, fechaN2: FECHA, fechaN5: '2026-09-21' }])]);
    abrir(0);
    expect([q('.md-fn2').value, q('.md-fn5').value]).toEqual([FECHA, '2026-09-21']);
    expect(q('.md-fn5').hasAttribute('data-fijo'), 'la N5 vieja es la siguiente a su N2: es la de oficio, no una tecleada').toBe(false);
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(0);
    expect(avisos.some((a) => a.msg.includes('No cambiaste nada'))).toBe(true);
  });

  it('🔴 si la corrección se queda EN COLA, su fila lo dice (📶) hasta que llegue', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    q('.md-huevos').value = '6800';
    resultadoPost = 'queued';
    await H.madDesCorregirGuardar();
    expect(log()[0].estado).toBe('cola');
    expect(cola().map((it) => it.mark.keys)).toEqual([['e1']]);
    expect(hist()[0].textContent).toContain('en cola');
  });

  it('🔴 contra un GAS de otra versión no sale nada y lo tecleado sigue', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    q('.md-huevos').value = '6800';
    respuestaVer = { ok: true, version: 'otro000000' };
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(0);
    expect(document.getElementById('md-report').textContent).toContain('No se envió');
    expect(q('.md-huevos').value).toBe('6800');
    expect(log()[0].desoves[0].huevos).toBe('6500');
  });

  it('🔴 si la entrada ya salió del historial (36 h), no se envía', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    q('.md-huevos').value = '6800';
    localStorage.setItem(H.MAD_DES_LOG_KEY, JSON.stringify([entrada('e1', 'ok', [DES_A], { ts: hace(37) })]));
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(0);
    expect(avisos.some((a) => a.msg.includes('salió del historial'))).toBe(true);
  });
});

describe('Desoves · corregir lo que sigue EN COLA: se corrige el envío pendiente', () => {
  it('🔴 en su sitio, con huella nueva, sin mandar otro; el otro desove del envío no se toca', async () => {
    vi.useFakeTimers();
    try {
      const antes = { payload: { sheetName: 'Otra', headers: ['A'], rows: [['x']] }, reqId: 'r0', url: '', ts: hace(1), mark: null };
      const despues = envioEnCola('e2', [{ ...DES_B, n5: '900', n2: '1000' }], { reqId: 'r2' });
      sembrar([entrada('e1', 'cola', [DES_A, DES_B]), entrada('e2', 'cola', [DES_B])], [antes, envioEnCola('e1', [DES_A, DES_B]), despues]);
      abrir(1);   // la fila más reciente arriba: e2 · ZB; luego e1 · ZA (1) y e1 · ZB (2)
      expect(document.getElementById('md-edit').getAttribute('data-k')).toBe('2026-09-20|ZA|TST.A1');
      q('.md-huevos').value = '6800';
      await H.madDesCorregirGuardar();
      expect(envios, 'no sale un envío aparte').toHaveLength(0);
      const c = cola();
      expect(c.map((it) => it.reqId === 'r0' || it.reqId === 'r2' ? it.reqId : (it.mark && it.mark.keys[0]))).toEqual(['r0', 'e1', 'r2']);
      const [filaA, filaB] = c[1].payload.rows;
      expect(filaA[col('Total de huevos')]).toBe(6800000);
      expect([filaA[col('Piscina Broodstock')], filaA[col('Desoves')], filaA[col('Observaciones')]], 'lo demás sigue ENTERO').toEqual(['P9X', 12, 'nota de prueba']);
      expect(filaB).toEqual(H.buildMadDesovePayload({ fecha: FECHA, desoves: [DES_B] }).rows[0]);
      expect(c[1].reqId, 'con la huella vieja el GAS lo daría por ya escrito').not.toBe('huella-vieja');
      expect(c[1].reqId).not.toBe('');
      expect(c[2]).toEqual(despues);
      const e1 = log().find((e) => e.id === 'e1');
      expect([e1.estado, e1.desoves[0].huevos, typeof e1.desoves[0].corregido, e1.desoves[1].corregido]).toEqual(['cola', '6800', 'number', undefined]);
      expect(vaciados).toBe(0);
      vi.advanceTimersByTime(1600);
      expect(vaciados, 'y se intenta entregar enseguida').toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('🔴 en cola, vaciar SÍ lo quita del envío pendiente (aún no ha llegado)', async () => {
    sembrar([entrada('e1', 'cola', [DES_A])], [envioEnCola('e1', [DES_A])]);
    abrir(0);
    q('.md-obs').value = '';
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(0);
    expect(cola()[0].payload.rows[0][col('Observaciones')]).toBe('');
  });

  it('🔴 en cola, añadir el N2 pone también su fecha (la fecha sólo se escribe con su cifra)', async () => {
    sembrar([entrada('e1', 'cola', [DES_A])], [envioEnCola('e1', [DES_A])]);
    abrir(0);
    q('.md-n2').value = '3000';
    await H.madDesCorregirGuardar();
    const fila = cola()[0].payload.rows[0];
    expect([fila[col('N2')], fila[col('Fecha N2')]]).toEqual([3000000, '2026-09-21']);   // el día siguiente al desove
  });

  it('🔴 un envío pendiente de OTRA versión de la app (otras columnas) no se toca: se dice', async () => {
    const viejo = envioEnCola('e1', [DES_A]);
    viejo.payload.headers = viejo.payload.headers.filter((h) => h !== 'Hembras no viables');
    viejo.payload.rows = viejo.payload.rows.map((r) => r.filter((_, j) => j !== col('Hembras no viables')));
    sembrar([entrada('e1', 'cola', [DES_A])], [viejo]);
    abrir(0);
    q('.md-huevos').value = '6800';
    await H.madDesCorregirGuardar();
    expect(cola()[0]).toEqual(viejo);
    expect(envios).toHaveLength(0);
    expect(avisos.some((a) => a.tipo === 'err' && a.msg.includes('otra versión de la app'))).toBe(true);
    expect(document.getElementById('md-edit'), 'lo tecleado sigue').not.toBeNull();
  });

  it('🔴 si en la cola espera OTRA corrección del mismo envío, este desove se AÑADE con sólo lo que cambió', async () => {
    // e1 [ZA, ZB] ya había llegado; su ZA se corrigió sin red y esa corrección (sólo huevos) espera con la marca de e1.
    const parcial = H.buildMadDesovePayload({ fecha: FECHA, desoves: [{ lote: 'ZA', codigoGenetico: 'TST.A1', huevos: '6800' }] });
    sembrar([entrada('e1', 'cola', [{ ...DES_A, huevos: '6800' }, DES_B])],
      [{ payload: parcial, reqId: 'r1', url: '', ts: hace(1), mark: { kind: 'madlog:desoves', keys: ['e1'] } }]);
    abrir(1);   // e1 · ZB
    q('.md-desoves').value = '8';
    await H.madDesCorregirGuardar();
    const filas = cola()[0].payload.rows;
    expect(filas).toHaveLength(2);
    expect(filas[0], 'la corrección de ZA sigue igual').toEqual(parcial.rows[0]);
    expect([filas[1][col('Lote')], filas[1][col('Código genético')], filas[1][col('Desoves')]]).toEqual(['ZB', 'TST.B2', 8]);
    ['Piscina Broodstock', 'Total de huevos', 'Hembras no viables', 'N2', 'N5', 'Despacho', 'Observaciones']
      .forEach((h) => expect(filas[1][col(h)], h + ': ZB ya llegó, así que sólo va lo que cambió').toBe(''));
  });

  it('🔴 con la cola VACIÁNDOSE espera a que termine antes de tocarla', async () => {
    sembrar([entrada('e1', 'cola', [DES_A])], [envioEnCola('e1', [DES_A])]);
    abrir(0);
    q('.md-huevos').value = '6800';
    H.setFlushing(true);
    const hecho = H.madDesCorregirGuardar();
    await new Promise((r) => setTimeout(r, 150));
    expect(cola()[0].payload.rows[0][col('Total de huevos')], 'mientras se vacía, no se toca').toBe(6500000);
    H.setFlushing(false);
    await hecho;
    expect(cola()[0].payload.rows[0][col('Total de huevos')]).toBe(6800000);
  });

  it('🔴 si se entregó mientras tanto, sigue como lo ya llegado: sólo lo que cambió', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);   // la cola ya lo entregó: su fila dice ✅
    abrir(0);
    q('.md-huevos').value = '6800';
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(1);
    expect(envios[0].payload.rows[0][col('Desoves')]).toBe('');
  });
});

describe('Desoves · lo que NO llegó (⚠) se envía completo', () => {
  it('🔴 la fila decía «en cola» pero el envío ya no está en la cola: va entero, con la marca de su entrada', async () => {
    sembrar([entrada('e1', 'cola', [DES_A])], []);
    expect(hist()[0].textContent).toContain('no llegó');
    abrir(0);
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(1);
    const fila = envios[0].payload.rows[0];
    expect(fila).toEqual(H.buildMadDesovePayload({ fecha: FECHA, desoves: [DES_A] }).rows[0]);
    expect(envios[0].opts.mark).toEqual({ kind: 'madlog:desoves', keys: ['e1'] });
    expect(log()[0].estado).toBe('ok');
    const ok = avisos.find((a) => a.tipo === 'ok' && a.msg.includes('enviado de nuevo'));
    expect(ok && !ok.msg.startsWith('✅')).toBe(true);
  });
});

describe('Desoves · la corrección sobrevive al borrador y se puede cancelar', () => {
  it('🔴 recargar con la corrección a medias la trae con su contexto, y ☁️ sigue corrigiendo', async () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    q('.md-huevos').value = '6800';
    q('.md-huevos').dispatchEvent(new Event('input', { bubbles: true }));
    H.madBorrGuardarYa('desoves');
    const fp = document.getElementById('fp-desoves');
    fp.innerHTML = '';
    H.renderMadDesoves();
    H.madBorrTraerDelDia('desoves');
    expect(document.getElementById('md-edit').getAttribute('data-corrige')).toBe('e1');
    expect(q('.md-huevos').value).toBe('6800');
    expect(document.getElementById('md-fecha').value, 'la fecha es la LLAVE: no pasa a la de hoy').toBe(FECHA);
    expect(q('.md-fn2').hasAttribute('data-fijo'), 'la fecha de N2 de oficio no se da por tecleada').toBe(false);
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(1);
    expect(envios[0].payload.rows[0][col('Fecha')]).toBe(FECHA);
    expect(envios[0].payload.rows[0][col('Total de huevos')]).toBe(6800000);
    expect(envios[0].payload.rows[0][col('Desoves')]).toBe('');
  });

  it('🔴 (defecto hallado el 09-24) un ✏️ Completar a medias vuelve al recargar CON SU FECHA, no con la de hoy', async () => {
    localStorage.setItem(H.MAD_DES_PEND_KEY, JSON.stringify([{ fecha: FECHA, lote: 'ZA', codigoGenetico: 'TST.A1', huevos: '6500', n2: '3000', ts: Date.now() }]));
    H.madDesReiniciar();
    H.madDesEditar(document.querySelector('#md-pend .md-pend-ed').dataset.k);
    expect(document.getElementById('md-fecha').value).toBe(FECHA);
    q('.md-n5').value = '2800';
    q('.md-n5').dispatchEvent(new Event('input', { bubbles: true }));
    H.madBorrGuardarYa('desoves');
    document.getElementById('fp-desoves').innerHTML = '';
    H.renderMadDesoves();
    H.madBorrTraerDelDia('desoves');
    expect(document.getElementById('md-fecha').value).toBe(FECHA);
    expect(q('.md-fn5').hasAttribute('data-fijo')).toBe(false);
    await H.madDesGuardar();
    const fila = envios[0].payload.rows[0];
    // 2026-10-04 · N2 = desove + 1 (09-21) y N5 = N2 + 1
    expect([fila[col('Fecha')], fila[col('N5')], fila[col('Fecha N5')]], 'completa SU desove, no uno nuevo de hoy').toEqual([FECHA, 2800000, '2026-09-22']);
  });

  /* 🔴 2026-10-04 · un ✏️ Completar a medias guardado por la app ANTERIOR trae su Fecha N2 —la de la hoja: el día del
     desove, con su recuento— SIN fijar (era su fecha de oficio). Al recargarlo no se «pone al día»: es dato de la hoja, y
     completar el N5 la pisaría con otra. */
  it('🔴 un ✏️ Completar de antes del cambio de regla conserva al recargarlo la Fecha N2 de la hoja', async () => {
    localStorage.setItem(H.MAD_DES_PEND_KEY, JSON.stringify([{ fecha: FECHA, lote: 'ZA', codigoGenetico: 'TST.A1', huevos: '6500', n2: '3000', fechaN2: FECHA, ts: Date.now() }]));
    H.madDesReiniciar();
    H.madDesEditar(document.querySelector('#md-pend .md-pend-ed').dataset.k);
    expect(q('.md-fn2').value).toBe(FECHA);
    q('.md-fn2').removeAttribute('data-fijo');                 // como la pintaba la app anterior
    q('.md-fn5').value = '2026-09-21';
    q('.md-n5').value = '2800';
    q('.md-n5').dispatchEvent(new Event('input', { bubbles: true }));
    H.madBorrGuardarYa('desoves');
    document.getElementById('fp-desoves').innerHTML = '';
    H.renderMadDesoves();
    H.madBorrTraerDelDia('desoves');
    expect(q('.md-fn2').value, 'se puso al día la fecha que venía de la hoja').toBe(FECHA);
    await H.madDesGuardar();
    const fila = envios[0].payload.rows[0];
    expect([fila[col('Fecha N2')], fila[col('N5')], fila[col('Fecha N5')]]).toEqual([FECHA, 2800000, '2026-09-21']);
  });

  it('🔴 🧹 Cancelar sale sin guardar ni enviar', () => {
    sembrar([entrada('e1', 'ok', [DES_A])]);
    abrir(0);
    q('.md-huevos').value = '6800';
    H.madDesCorregirCancelar();
    expect(document.getElementById('md-edit')).toBeNull();
    expect(envios).toHaveLength(0);
    expect(log()[0].desoves[0].huevos).toBe('6500');
  });
});

describe('Desoves · qué cuenta como cambio (madDesCorreccionCambios)', () => {
  it('🔴 números como número, el despacho como lista, y lo vaciado aparte', () => {
    const r = H.madDesCorreccionCambios(
      { huevos: '6500', desoves: '12', despacho: 'Tabasca, Incamar', observaciones: 'nota', piscina: 'P9X', n2: '' },
      { huevos: '06500', desoves: '13', despacho: ['Incamar', 'Tabasca'], observaciones: '', piscina: ' P9X ', n2: '0' },
    );
    expect(r.campos.sort()).toEqual(['desoves', 'n2']);
    expect(r.vaciados).toEqual(['observaciones']);
  });
});
