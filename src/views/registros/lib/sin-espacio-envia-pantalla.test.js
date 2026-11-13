// @vitest-environment happy-dom
/* ============================================================
   SIN ESPACIO, ☁️ ENVÍA LO DE PANTALLA (punto 38 de la pauta del 2026-11-12)

   Lo que pasaba (medido en el código el 12-11): con el equipo SIN SITIO para guardar, ☁️ de once fichas no enviaba nada —guarda
   primero y, si no puede, se detiene—, y en cinco el aviso mandaba a pulsar justo ese ☁️. En 🛢 Tanques (A6) y en Larvicultura
   ya se había decidido «enviar lo de pantalla». Decisión del usuario: «Enviar en siete» — 🏠 Salas y 🌡️ Zonas, Biomol, Mareas,
   Microbiología, Calidad, Patología y As Técnico envían lo de pantalla; Traslado, Score, Auditoría y Mantenimiento no (su envío se
   apoya en lo guardado), pero su aviso dice la verdad.

   La regla, la de Tanques: viaja lo de pantalla, sin marca de enviado (no hay registro guardado que marcar); si llega a la hoja, o
   queda en la cola, lo que el equipo guardaba de esos MISMOS registros se retira (si no, un 🔄 posterior escribiría lo viejo
   encima); si no llega, todo se queda como estaba y lo tecleado, en pantalla.

   El almacén es de este archivo y tiene CUPO, como el del navegador (el de mad-espacio.test.js): una clave BLOQUEADA no puede
   crecer —lo que se acorta siempre cabe—. Sin cupo, «no se pudo guardar» no se puede provocar.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MAD_MOD', 'AST_MOD', 'BIO_MOD', 'MAD_SALA_OPTS', 'madKey', 'loadMad', 'renderMadSalas', 'saveMadSalasGrid', 'syncMadSalasGrid',
  'renderMarea', 'saveMareaLocal', 'syncMareaGrid', 'MAREA_DRAFT_KEY', 'MAREA_SHEET', 'MAD_SHEET', '_gasVersionLocal', '_lastSyncFingerprint',
  'renderBiomol', 'saveBioGridLocal', 'syncBioGrid', 'BIO_REC_KEY', 'BIO_SHEET', '_bioRaw', 'bioGridFecha', 'bioSidActivo',
  'renderAst', 'saveAstSync', 'saveAstLocal', 'editAstRecord', 'clearAstForm', 'AST_REC_KEY', 'AST_RECOV_KEY', 'AST_SHEET', '_astRaw',
  'AST_SUPERVISOR_OPTS', 'AST_MODULO_OPTS', 'AST_SIEMBRA_OPTS', 'AST_ESTADIO_OPTS',
  'SIN_ESPACIO_NO_ENVIA', '_micSave', '_calSave', '_patSave', '_trasSave', '_scoreSave', '_mntSave', '_audSave',
  'MIC_REC_KEY', 'CAL_REC_KEY', 'PAT_REC_KEY', 'TRAS_REC_KEY', 'SCORE_REC_KEY', 'MNT_RONDA_KEY', 'AUD_REC_KEY',
  'renderFicha', 'localSave', 'skey', 'MAD_RECOV_KEY'];
const H = {};
const avisos = [];
const envios = [];
let respuesta = 'ok';

/* El almacén, con cupo y contando como el navegador (el de mad-espacio.test.js). */
const almacen = (() => {
  const m = new Map();
  let bloqueadas = new Set();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (bloqueadas.has(k) && (!m.has(k) || s.length > m.get(k).length)) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, s);
    },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); bloqueadas = new Set(); },
    /** Esta clave no puede crecer (ni nacer): lo que se acorta siempre cabe, como en el navegador. */
    bloquear: (k) => { bloqueadas.add(k); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
})();

beforeAll(async () => {
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')),
    // la ficha de Calidad Larvaria se pinta con su módulo de render, como en la app (para el aviso de Larvicultura)
    renderCalidadFicha: (await import('../fichas/calidad.render.js')).renderCalidadFicha,
    resolveCalidadData: (await import('../fichas/calidad.data.js')).resolveCalidadData };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setPostOnce=function(f){_postOnce=f;}; }catch(_){}'
    + '\ntry{ H.setGasUrl=function(f){gasUrl=f;}; }catch(_){}'
    + '\ntry{ H.setRate=function(f){syncRateOk=f;}; }catch(_){}'
    + '\ntry{ H.setVista=function(m,t){ curMod=m; curTab=t; }; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(window, document, almacen, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setPostOnce(async (b) => { envios.push(JSON.parse(JSON.stringify(b))); return respuesta; });
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setRate(() => true);
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=ver') !== -1) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: H._gasVersionLocal() }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) };
  };
});

beforeEach(() => {
  almacen.clear();
  avisos.length = 0;
  envios.length = 0;
  respuesta = 'ok';
  H._lastSyncFingerprint.clear();   // el motor recuerda 30 s el último envío idéntico
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  globalThis.confirm = () => true;
});
afterEach(() => { vi.useRealTimers(); });

const teclear = (el, v) => { expect(el, 'no está la celda').toBeTruthy(); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const de = (hoja) => envios.filter((b) => b.sheetName === hoja);
const filasCon = (hoja, v) => de(hoja).flatMap((b) => b.rows).filter((r) => r.some((c) => String(c) === String(v)));

describe('🏠 Salas y 🌡️ Zonas · sin espacio, ☁️ envía lo de pantalla (como Tanques)', () => {
  const temp = (si) => document.querySelector('#fp-salas input[name^="sg_' + si + '_temp_"]');
  const ztemp = () => document.querySelector('#fp-salas input[name^="zg_0_temp_"]');
  const fecha = () => document.getElementById('mad-salas-fecha').value;
  const viejo = (k, v) => ({ id: 'viejo', ts: Date.now() - 1000, synced: false, syncedAt: null, data: { fecha: fecha(), sala: H.MAD_SALA_OPTS[0], [k]: v } });
  beforeEach(() => { H.setVista(H.MAD_MOD, 'salas'); document.getElementById('fp-salas').innerHTML = ''; H.renderMadSalas(); });

  it('🔴 lo tecleado, sin poder guardarse, llega a la hoja', async () => {
    teclear(temp(0), '28.5');
    almacen.bloquear(H.madKey('salas'));
    await H.syncMadSalasGrid();
    expect(filasCon(H.MAD_SHEET.salas, 28.5), 'no se envió nada: ☁️ se detenía al no poder guardar').toHaveLength(1);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(true);
  });

  it('🔴 si llega, lo que el equipo guardaba de ese día se retira (o un 🔄 mandaría lo viejo encima)', async () => {
    almacen.setItem(H.madKey('salas'), JSON.stringify([viejo(temp(0).name.replace(/^sg_0_/, ''), 26)]));
    H.renderMadSalas();
    expect(temp(0).value).toBe('26');
    teclear(temp(0), '28.5');
    almacen.bloquear(H.madKey('salas'));
    await H.syncMadSalasGrid();
    expect(filasCon(H.MAD_SHEET.salas, 28.5)).toHaveLength(1);
    expect(filasCon(H.MAD_SHEET.salas, 26), 'viajó la copia vieja').toHaveLength(0);
    expect(H.loadMad('salas').map((r) => r.id), 'la copia vieja se quedó').not.toContain('viejo');
  });

  it('🔴 si NO llega, nada se toca: la copia vieja sigue y lo tecleado, en pantalla', async () => {
    almacen.setItem(H.madKey('salas'), JSON.stringify([viejo(temp(0).name.replace(/^sg_0_/, ''), 26)]));
    H.renderMadSalas();
    teclear(temp(0), '28.5');
    almacen.bloquear(H.madKey('salas'));
    respuesta = 'rejected';
    await H.syncMadSalasGrid();
    expect(H.loadMad('salas').map((r) => r.id)).toContain('viejo');
    expect(temp(0).value, 'se repintó desde lo guardado y se borró lo tecleado').toBe('28.5');
  });

  it('🔴 si llega, tampoco queda la copia de «↩ Recuperar» de ese día (traería de vuelta lo ya enviado)', async () => {
    teclear(temp(0), '28.5');
    almacen.setItem(H.MAD_RECOV_KEY, JSON.stringify({ ficha: 'salas', sala: '', fecha: fecha(), ts: Date.now(), rows: [{ fecha: fecha(), sala: H.MAD_SALA_OPTS[0] }] }));
    almacen.bloquear(H.madKey('salas'));
    await H.syncMadSalasGrid();
    expect(filasCon(H.MAD_SHEET.salas, 28.5)).toHaveLength(1);
    expect(almacen.getItem(H.MAD_RECOV_KEY)).toBeNull();
  });

  it('con espacio, lo de siempre: se guarda, se envía y se marca', async () => {
    teclear(temp(0), '27.5');
    await H.syncMadSalasGrid();
    expect(filasCon(H.MAD_SHEET.salas, 27.5)).toHaveLength(1);
    expect(H.loadMad('salas').every((r) => r.synced)).toBe(true);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(false);
  });

  it('una temperatura FUERA DE RANGO sigue sin enviarse (eso no es falta de espacio)', async () => {
    teclear(temp(0), '99');
    await H.syncMadSalasGrid();
    expect(de(H.MAD_SHEET.salas)).toHaveLength(0);
  });

  it('🔴 las zonas, igual: sin espacio llegan a su hoja', async () => {
    teclear(ztemp(), '29.5');
    almacen.bloquear(H.madKey('zonas'));
    await H.syncMadSalasGrid();
    expect(filasCon(H.MAD_SHEET.zonas, 29.5), 'las zonas no salieron').toHaveLength(1);
  });

  it('🔴 el aviso de «no se pudo guardar» ya no manda a anotarlo: ☁️ lo envía', () => {
    teclear(temp(0), '28');
    almacen.bloquear(H.madKey('salas'));
    H.saveMadSalasGrid();
    expect(avisos.some((a) => /☁️ lo envía igual a la hoja/.test(a)), avisos.join(' | ')).toBe(true);
  });
});

describe('🧬 Biomol · sin espacio, ☁️ envía lo de pantalla y 💾 no borra lo pegado', () => {
  const c = (k) => document.querySelector('#fp-biomol input[name="bg_1_' + k + '"]');
  const viejo = (codigo) => ({ id: 'viejo', ts: Date.now() - 1000, synced: false, syncedAt: null,
    data: { fecha: H.bioGridFecha(), fila: 1, sid: H.bioSidActivo(H.bioGridFecha()), codigo } });
  beforeEach(() => { H.setVista(H.BIO_MOD, 'biomol'); H.renderBiomol(); });

  it('🔴 lo tecleado, sin poder guardarse, llega a la hoja', async () => {
    teclear(c('codigo'), 'BM-SIN-SITIO');
    almacen.bloquear(H.BIO_REC_KEY);
    await H.syncBioGrid();
    expect(filasCon(H.BIO_SHEET, 'BM-SIN-SITIO'), 'no se envió nada').toHaveLength(1);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(true);
  });

  it('🔴 si llega, la copia vieja de ese análisis se retira', async () => {
    almacen.setItem(H.BIO_REC_KEY, JSON.stringify([viejo('BM-VIEJO')]));
    H.renderBiomol();
    expect(c('codigo').value).toBe('BM-VIEJO');
    teclear(c('codigo'), 'BM-NUEVO-LARGO');
    almacen.bloquear(H.BIO_REC_KEY);
    await H.syncBioGrid();
    expect(filasCon(H.BIO_SHEET, 'BM-NUEVO-LARGO')).toHaveLength(1);
    expect(H._bioRaw().map((r) => r.id), 'la copia vieja se quedó').not.toContain('viejo');
  });

  it('🔴 si NO llega, nada se toca: la copia vieja sigue y lo tecleado, en pantalla', async () => {
    almacen.setItem(H.BIO_REC_KEY, JSON.stringify([viejo('BM-VIEJO')]));
    H.renderBiomol();
    teclear(c('codigo'), 'BM-NUEVO-LARGO');
    almacen.bloquear(H.BIO_REC_KEY);
    respuesta = 'rejected';
    await H.syncBioGrid();
    expect(H._bioRaw().map((r) => r.id)).toContain('viejo');
    expect(c('codigo').value, 'se repintó desde lo guardado').toBe('BM-NUEVO-LARGO');
  });

  it('🔴 💾 sin espacio deja lo tecleado en pantalla y dice que ☁️ lo envía', () => {
    teclear(c('codigo'), 'BM-DE-PANTALLA');
    almacen.bloquear(H.BIO_REC_KEY);
    H.saveBioGridLocal();
    expect(c('codigo').value, 'se repintaba desde lo guardado y se borraba').toBe('BM-DE-PANTALLA');
    expect(avisos.some((a) => /☁️ lo envía igual a la hoja/.test(a)), avisos.join(' | ')).toBe(true);
  });

  it('con espacio, lo de siempre: se guarda, se envía y se marca', async () => {
    teclear(c('codigo'), 'BM-CON-SITIO');
    await H.syncBioGrid();
    expect(filasCon(H.BIO_SHEET, 'BM-CON-SITIO')).toHaveLength(1);
    expect(H._bioRaw().every((r) => r.synced)).toBe(true);
  });
});

describe('📋 As Técnico · sin espacio, ☁️ envía lo de pantalla', () => {
  const f = (n) => document.querySelector('#fp-ast .mad-form [name="' + n + '"]');
  const llenar = (comentario) => {
    f('supervisor').value = H.AST_SUPERVISOR_OPTS[1]; f('modulo').value = H.AST_MODULO_OPTS[0];
    f('siembra').value = H.AST_SIEMBRA_OPTS[0]; f('estadio').value = H.AST_ESTADIO_OPTS[0];
    teclear(f('comentario'), comentario);
  };
  const ids = () => de(H.AST_SHEET).flatMap((b) => b.rows).map((r) => r[r.length - 1]);
  beforeEach(() => { H.setVista(H.AST_MOD, 'ast'); H.renderAst(); });

  it('🔴 lo tecleado, sin poder guardarse, llega a la hoja; el formulario queda en blanco y sin «↩ Recuperar» de lo enviado', async () => {
    llenar('Supervisión sin sitio');
    almacen.setItem(H.AST_RECOV_KEY, JSON.stringify({ ts: Date.now(), data: { comentario: 'Supervisión sin sitio' } }));
    almacen.bloquear(H.AST_REC_KEY);
    await H.saveAstSync();
    expect(filasCon(H.AST_SHEET, 'Supervisión sin sitio'), 'no se envió nada').toHaveLength(1);
    expect(f('comentario').value, 'el formulario se quedó con lo ya enviado').toBe('');
    expect(almacen.getItem(H.AST_RECOV_KEY), '↩ Recuperar traería lo ya enviado').toBeNull();
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(true);
  });

  it('🔴 si NO llega, lo tecleado se queda, y el reintento corrige SU fila (el mismo ID), no añade otra', async () => {
    llenar('Primer intento');
    almacen.bloquear(H.AST_REC_KEY);
    respuesta = 'rejected';
    await H.saveAstSync();
    expect(f('comentario').value).toBe('Primer intento');
    respuesta = 'ok';
    teclear(f('comentario'), 'Segundo intento');
    await H.saveAstSync();
    const [a, b] = ids();
    expect(a, 'el primer intento no llegó a salir').toBeTruthy();
    expect(b, 'el reintento salió con OTRO ID: la hoja tendría dos filas').toBe(a);
  });

  it('🔴 editando uno guardado: viaja lo de pantalla y la copia vieja se retira', async () => {
    llenar('Versión guardada');
    H.saveAstLocal();
    const [r] = H._astRaw();
    H.editAstRecord(r.id);
    teclear(f('comentario'), 'Versión corregida sin sitio');
    almacen.bloquear(H.AST_REC_KEY);
    await H.saveAstSync();
    expect(filasCon(H.AST_SHEET, 'Versión corregida sin sitio')).toHaveLength(1);
    expect(ids()[0], 'la corrección salió con otro ID').toBe(r.id);
    expect(H._astRaw().map((x) => x.id), 'la copia vieja se quedó').not.toContain(r.id);
  });

  it('🔴 tras enviarse sin copia, el siguiente es OTRO registro (si heredara el ID, pisaría en la hoja al recién enviado)', async () => {
    llenar('El enviado sin copia');
    almacen.bloquear(H.AST_REC_KEY);
    await H.saveAstSync();
    llenar('El siguiente, ya sin cupo tampoco');
    await H.saveAstSync();
    const [a, b] = ids();
    expect(a && b).toBeTruthy();
    expect(b).not.toBe(a);
  });

  it('un formulario vaciado con 🧹 es un registro NUEVO: no hereda el ID del que no se pudo guardar', async () => {
    llenar('El que no cupo');
    almacen.bloquear(H.AST_REC_KEY);
    respuesta = 'rejected';
    await H.saveAstSync();
    H.clearAstForm();
    respuesta = 'ok';
    llenar('Otro distinto');
    await H.saveAstSync();
    const [a, b] = ids();
    expect(b).not.toBe(a);
  });

  it('🔴 💾 sin espacio: lo tecleado se queda y el aviso dice que ☁️ lo envía (antes mandaba a un ☁️ que se detenía)', () => {
    llenar('Para 💾 sin sitio');
    almacen.bloquear(H.AST_REC_KEY);
    H.saveAstLocal();
    expect(f('comentario').value).toBe('Para 💾 sin sitio');
    expect(avisos.some((a) => /☁️ lo envía igual a la hoja/.test(a)), avisos.join(' | ')).toBe(true);
  });

  it('con espacio, lo de siempre: se guarda, se envía y se marca', async () => {
    llenar('Con sitio');
    await H.saveAstSync();
    expect(filasCon(H.AST_SHEET, 'Con sitio')).toHaveLength(1);
    expect(H._astRaw()[0].synced).toBe(true);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(false);
  });
});

describe('Las que SIN espacio no envían: el aviso dice la verdad (Laboratorio, Traslado, Score, Auditoría, Mantenimiento)', () => {
  it.each([
    ['Microbiología', '_micSave', 'MIC_REC_KEY'], ['Calidad de Agua', '_calSave', 'CAL_REC_KEY'], ['Patología', '_patSave', 'PAT_REC_KEY'],
    ['Traslado', '_trasSave', 'TRAS_REC_KEY'], ['Score', '_scoreSave', 'SCORE_REC_KEY'], ['Auditoría', '_audSave', 'AUD_REC_KEY'],
  ])('🔴 %s: «no se guardó ni se envió» y lleva a «🧹 Liberar espacio», sin mandar a ☁️', (_n, fn, key) => {
    almacen.bloquear(H[key]);
    expect(H[fn]([{ id: 'x', ts: Date.now(), data: {} }])).toBe(false);
    expect(avisos[avisos.length - 1]).toBe(H.SIN_ESPACIO_NO_ENVIA);
  });

  it('🔴 Mantenimiento, igual', () => {
    almacen.bloquear(H.MNT_RONDA_KEY);
    expect(H._mntSave(H.MNT_RONDA_KEY, [{ id: 'x', ts: Date.now(), data: {} }])).toBe(false);
    expect(avisos[avisos.length - 1]).toBe(H.SIN_ESPACIO_NO_ENVIA);
  });

  it('el aviso dice lo que pasa y adónde ir, y NO aconseja ☁️', () => {
    expect(H.SIN_ESPACIO_NO_ENVIA).toMatch(/NO se guardó ni se envió/);
    expect(H.SIN_ESPACIO_NO_ENVIA).toMatch(/🧹 Liberar espacio/);
    expect(H.SIN_ESPACIO_NO_ENVIA).not.toMatch(/☁️/);
  });

  it('🔴 Larvicultura: el aviso de 💾 manda al ☁️ de la ficha (que envía lo de pantalla), no al 🔄 de arriba', () => {
    H.setVista(1, 'calidad');
    H.renderFicha('calidad');
    teclear(document.querySelector('#fp-calidad input[type="number"][name]'), '4');
    almacen.bloquear(H.skey(1, 'calidad'));
    H.localSave('calidad');
    expect(avisos.some((a) => /«☁️ Guardar y sincronizar» lo envía igual a la hoja/.test(a)), avisos.join(' | ')).toBe(true);
  });
});

describe('🌊 Mareas · sin espacio, ☁️ envía lo de pantalla y 💾 no borra lo tecleado', () => {
  const c = (k) => document.querySelector('#fp-marea input[name="mg_1_' + k + '"]');
  beforeEach(() => { H.setVista(H.AST_MOD, 'marea'); H.renderMarea(); });

  it('🔴 sin sitio para el borrador, ☁️ envía igual lo de la grilla', async () => {
    teclear(c('fecha'), '12/11/2026');
    teclear(c('p1'), '08:15');
    almacen.bloquear(H.MAREA_DRAFT_KEY);
    await H.syncMareaGrid();
    expect(filasCon(H.MAREA_SHEET, '08:15'), 'se detenía con «Almacenamiento lleno: no se envió»').toHaveLength(1);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(true);
  });

  it('🔴 💾 sin espacio deja lo tecleado en pantalla y dice que ☁️ lo envía', () => {
    teclear(c('fecha'), '12/11/2026');
    almacen.bloquear(H.MAREA_DRAFT_KEY);
    H.saveMareaLocal();
    expect(c('fecha').value, 'se repintaba desde el borrador guardado y se borraba').toBe('12/11/2026');
    expect(avisos.some((a) => /☁️ lo envía igual a la hoja/.test(a))).toBe(true);
  });

  it('con espacio, lo de siempre (sin el aviso de «no guardó copia»)', async () => {
    teclear(c('fecha'), '13/11/2026');
    teclear(c('p1'), '09:40');
    await H.syncMareaGrid();
    expect(filasCon(H.MAREA_SHEET, '09:40')).toHaveLength(1);
    expect(avisos.some((a) => /no guardó copia/.test(a))).toBe(false);
  });
});
