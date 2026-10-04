// @vitest-environment happy-dom
/* ============================================================
   MADURACIÓN · 📜 HISTORIAL del módulo (usuario, 2026-10-04)

   «En el módulo de registro de las fichas de maduración se debe tener un historial y un blanco similar a
   larvicultura con el objetivo de poder editar, revisar, hacer PDF y demás de las fichas que se llenan.»

   Decidido con el usuario (no re-preguntar): lo enviado desde ESTE equipo, 60 días; las 7 fichas de formulario
   y Salas/Tanques (Broodstock fuera); 📄 PDF y 🗑 Borrar (sólo del equipo) para todo envío; ✏️ Editar abre la
   ficha tal como se envió, en corrección, en los últimos 10 envíos de cada ficha (Alimentación 3); guardar
   reescribe las MISMAS filas (mismo ID) y, si cambió la llave, avisa antes; Desoves usa SU corrección (sólo
   viaja lo cambiado); lo enviado con 💾 queda sin Editar; sin espacio, lo primero que se va son las copias.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MAD_MOD', 'MAD_HIST_KEY', 'MAD_HIST_PANEL_PRE', 'MAD_DES_LOG_KEY', 'MAD_BORR_PRE', '_gasVersionLocal',
  'madHistLeer', '_madHistGuardar', 'renderMadHistorial', 'renderHistorial', 'madHistEditar', 'madHistBorrar', 'madHistPdf',
  '_madHistPdfHTML', 'madHistCorrCancelar', 'madHistGrilla', 'madHistGrillaPdf', '_purgeMadHistPaneles', '_reclaimSpace',
  'madFinReiniciar', 'madFinGuardar', 'madFinGuardarLocal', 'madFinTipoChange',
  'madDesReiniciar', 'madDesGuardar', 'madDesCorregirGuardar', 'selTab', 'madKey', 'madBorrGuardar', 'madBorrLeer'];
const H = {};
const envios = [];
let respuestaVer = null;
let confirmar = true;
const preguntas = [];
let ventana = null;

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
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis,
  );
  H.setToast(() => {});
  H.setGasUrl(() => 'https://script.google.com/macros/s/AKfycbPRUEBA/exec');
  H.setMod(H.MAD_MOD);
  window.confirm = (m) => { preguntas.push(String(m)); return confirmar; };
  window.open = () => {
    ventana = { html: '', document: { write(h) { ventana.html += h; }, close() {} } };
    return ventana;
  };
  globalThis.fetch = async (url) => {
    if (String(url).indexOf('p=rows') !== -1) return { ok: true, status: 200, text: async () => 'null' };
    if (String(url).indexOf('p=ver') === -1) throw new Error('fetch inesperado: ' + url);
    return { ok: true, status: 200, text: async () => JSON.stringify(respuestaVer) };
  };
});

let alPost = null;
beforeEach(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.indexOf('larv4_mad_') === 0 || k === 'larv4_syncqueue' || k === 'larv4_gas_sello_ok')) localStorage.removeItem(k);
  }
  envios.length = 0; preguntas.length = 0; confirmar = true; ventana = null; alPost = null;
  respuestaVer = { ok: true, version: H._gasVersionLocal() };
  H.setPost(async (p, url, t) => { envios.push(p); return alPost ? alPost(p, url, t) : true; });
  H.madFinReiniciar();
  H.madDesReiniciar();
});

const $ = (s) => document.querySelector(s);
const pon = (el, v) => { el.value = v; return el; };
// happy-dom lee mal un <select> pintado con innerHTML (ver reference_happy-dom-select-value): como haría el navegador.
const selectsComoNavegador = (root) => root.querySelectorAll('select').forEach((s) => {
  const o = s.querySelector('option[selected]'); if (o) s.value = o.value;
});
const llenarFin = (lote = 'BP', machos = '5') => {
  const c = document.querySelector('#fp-fin .mf-cierre');
  H.madFinTipoChange(pon(c.querySelector('.mf-tipo'), 'Parcial'));
  pon(c.querySelector('.mf-lote'), lote); pon(c.querySelector('.mf-motivo'), 'Pedido');
  pon(c.querySelector('.mf-sala'), 'Sala 2'); pon(c.querySelector('.mf-machos'), machos);
};
const col = (p, h) => p.headers.indexOf(h);
const hist = () => H.madHistLeer();
const filasLista = () => { H.renderMadHistorial(); return Array.from(document.querySelectorAll('#fp-historial tr.mh-item')); };
const copias = () => { const n = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf(H.MAD_HIST_PANEL_PRE) === 0) n.push(k); } return n; };

describe('📜 Historial · cada envío queda, con sus filas y su ficha', () => {
  it('🔴 un cierre enviado entra con sus filas TAL CUAL y con la copia de la ficha para Editar', async () => {
    llenarFin();
    await H.madFinGuardar();
    expect(envios).toHaveLength(1);
    const l = hist();
    expect(l).toHaveLength(1);
    expect(l[0].ficha).toBe('fin');
    expect(l[0].payload.rows).toEqual(envios[0].rows);
    expect(l[0].payload.headers).toEqual(envios[0].headers);
    expect(l[0].resumen).toContain('Lote BP');
    expect(l[0].panel).toBe(true);
    expect(localStorage.getItem(H.MAD_HIST_PANEL_PRE + l[0].id)).toContain('mf-cierre');
  });

  it('🔴 lo que queda EN COLA también entra (está a salvo y se enviará)', async () => {
    alPost = (p, u, t) => { if (t) t.outcome = 'queued'; return false; };
    llenarFin();
    await H.madFinGuardar();
    expect(hist()).toHaveLength(1);
  });

  it('lo que NO salió (error) no entra', async () => {
    alPost = (p, u, t) => { if (t) t.outcome = 'error'; return false; };
    llenarFin();
    await H.madFinGuardar();
    expect(hist()).toHaveLength(0);
  });

  it('🔴 lo enviado desde 💾 entra con sus filas pero SIN Editar (no hay ficha que guardar)', async () => {
    llenarFin();
    H.madFinGuardarLocal();
    expect(hist()).toHaveLength(0);
    await H.madFinGuardar();   // ☁️ con la pantalla vacía: envía lo guardado
    const l = hist();
    expect(l).toHaveLength(1);
    expect(l[0].panel).toBe(false);
    const tr = filasLista()[0];
    expect(tr.querySelector('.mh-ed')).toBeNull();
    expect(tr.querySelector('.mh-pdf')).not.toBeNull();
    expect(tr.textContent).toContain('sin editar');
  });

  it('🔴 la pestaña está en Maduración y el «Historial» del módulo pinta el suyo', () => {
    expect(document.querySelector('#fp-historial')).not.toBeNull();
    H.renderHistorial();
    expect($('#fp-historial').textContent).toContain('Historial · Maduración');
  });
});

describe('📜 Historial · ✏️ Editar reescribe las MISMAS filas', () => {
  const abrir = async () => {
    llenarFin();
    await H.madFinGuardar();
    const e = hist()[0];
    H.madHistEditar(e.id);
    selectsComoNavegador($('#fp-fin'));
    return e;
  };

  it('🔴 abre la ficha tal como se envió, con el aviso y la fecha FIJA', async () => {
    const e = await abrir();
    expect($('#fp-fin .mh-corr')).not.toBeNull();
    expect($('#fp-fin .mh-corr').getAttribute('data-hist')).toBe(e.id);
    expect($('#mf-fecha').hasAttribute('readonly')).toBe(true);
    expect($('#mf-fecha').value).toBe(e.fecha);
    expect($('#fp-fin .mf-lote').value).toBe('BP');
    expect($('#fp-fin .mf-machos').value).toBe('5');
  });

  it('🔴 guardar envía el MISMO ID y el Historial se queda con la versión corregida (sin duplicar)', async () => {
    const e = await abrir();
    pon($('#fp-fin .mf-machos'), '7');
    await H.madFinGuardar();
    expect(envios).toHaveLength(2);
    const p = envios[1];
    expect(p.rows[0][col(p, 'ID')]).toBe(envios[0].rows[0][col(envios[0], 'ID')]);
    expect(p.rows[0][col(p, 'Machos')]).toBe(7);
    expect(preguntas, 'la llave no cambió: no pregunta').toHaveLength(0);
    const l = hist();
    expect(l).toHaveLength(1);
    expect(l[0].id).toBe(e.id);
    expect(l[0].corregido).toBeGreaterThan(0);
    expect(l[0].payload.rows[0][col(p, 'Machos')]).toBe(7);
    expect(localStorage.getItem(H.MAD_HIST_PANEL_PRE + e.id), 'la copia nueva, sin el aviso (Editar otra vez no lo duplica)').not.toContain('mh-corr');
    expect($('#fp-fin .mh-corr'), 'la ficha vuelve a estar limpia').toBeNull();
    expect($('#mf-fecha').hasAttribute('readonly')).toBe(false);
  });

  it('🔴 si cambió la llave (el lote), AVISA antes; «no» no envía nada', async () => {
    await abrir();
    pon($('#fp-fin .mf-lote'), 'BQ');
    confirmar = false;
    await H.madFinGuardar();
    expect(envios).toHaveLength(1);
    expect(preguntas.join(' ')).toContain('filas NUEVAS');
    expect($('#fp-fin .mh-corr'), 'sigue corrigiendo').not.toBeNull();
  });

  it('«sí» lo envía, y la entrada pasa a decir lo nuevo', async () => {
    const e = await abrir();
    pon($('#fp-fin .mf-lote'), 'BQ');
    await H.madFinGuardar();
    expect(envios).toHaveLength(2);
    const l = hist();
    expect(l).toHaveLength(1);
    expect(l[0].id).toBe(e.id);
    expect(l[0].resumen).toContain('BQ');
  });

  it('🔴 con algo TECLEADO en la ficha, Editar pregunta antes; «no» lo deja como estaba', async () => {
    llenarFin();
    await H.madFinGuardar();
    const e = hist()[0];
    pon($('#fp-fin .mf-lote'), 'BZ').dispatchEvent(new Event('input', { bubbles: true }));
    confirmar = false;
    H.madHistEditar(e.id);
    expect(preguntas.join(' ')).toContain('Se reemplazará lo tecleado');
    expect($('#fp-fin .mh-corr')).toBeNull();
    expect($('#fp-fin .mf-lote').value).toBe('BZ');
  });

  it('🔴 Cancelar sale sin enviar y devuelve el borrador que la ficha tuviera de su día', async () => {
    llenarFin('BX', '3');
    // un borrador propio de hoy, distinto del envío
    H.madBorrGuardar('fin', $('#mf-fecha').value);
    const borr = H.madBorrLeer('fin', $('#mf-fecha').value);
    H.madFinReiniciar();
    llenarFin();
    await H.madFinGuardar();
    localStorage.setItem(H.MAD_BORR_PRE + 'fin', JSON.stringify({ [$('#mf-fecha').value]: borr }));
    H.madHistEditar(hist()[0].id);
    expect(preguntas, 'la ficha estaba limpia: no pregunta').toHaveLength(0);
    H.madHistCorrCancelar('fin');
    expect(envios).toHaveLength(1);
    expect($('#fp-fin .mh-corr')).toBeNull();
    expect($('#fp-fin .mf-lote').value, 'vuelve el borrador del día').toBe('BX');
  });
});

describe('📜 Historial · el cableado en CADA ficha (la lógica se prueba arriba con Fin de Ciclo)', () => {
  const src = readFileSync(ENGINE, 'utf8');
  const cuerpo = (fn) => { const i = src.indexOf('async function ' + fn + '('); const j = src.indexOf('\n}\n', i); return i < 0 ? '' : src.slice(i, j); };
  const FICHAS = [['madIngGuardar', 'ingreso', 2], ['madMovGuardar', 'movimientos', 2], ['madFinGuardar', 'fin', 2],
    ['madTratGuardar', 'tratamientos', 2], ['madMortGuardar', 'mortdes', 2], ['madAlimGuardar', 'alimentacion', 1]];
  it.each(FICHAS)('🔴 %s: avisa del cambio de llave ANTES de enviar y anota lo que sale (llegado y en cola)', (fn, f, n) => {
    const b = cuerpo(fn);
    const aviso = b.indexOf('if(!_madHistCorrConfirma("' + f + '", payload)) return;');
    expect(aviso, 'el aviso de llave').toBeGreaterThan(-1);
    expect(aviso, 'antes del envío').toBeLessThan(b.indexOf('_madLogMarca("' + f + '", _envio)'));
    expect(b.split('_madHistAnota("' + f + '", payload, model.fecha, _envio)').length - 1, 'la captura').toBe(n);
  });
  it('🔴 Desoves anota cada envío (llegado y en cola) y lo enviado con 💾 entra, salvo Broodstock', () => {
    expect(cuerpo('madDesGuardar').split('_madHistAnotaDesoves(payload, model.fecha, _envio)').length - 1).toBe(2);
    expect(cuerpo('_madLocEnviar')).toContain('if(ficha!=="broodstock") _madHistDesdeLoc(ficha, e);');
  });
});

describe('📜 Historial · cuántos se pueden editar, cuánto dura, y el espacio', () => {
  const entrada = (ficha, i, extra = {}) => ({ id: ficha + i, ficha, ts: Date.now() - (100 - i) * 1000, fecha: '2026-10-0' + (1 + (i % 3)),
    filas: 1, panel: true, payload: { sheetName: 'X', headers: ['ID'], rows: [['r' + i]] }, ...extra });

  it('🔴 sólo los ÚLTIMOS 10 de cada ficha guardan copia (Alimentación, 3); las demás se liberan', () => {
    const l = [];
    for (let i = 0; i < 12; i++) { l.push(entrada('fin', i)); localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'fin' + i, '<div>x</div>'); }
    for (let i = 0; i < 5; i++) { l.push(entrada('alimentacion', i)); localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'alimentacion' + i, '<div>x</div>'); }
    H._madHistGuardar(l);
    const vivas = copias().map((k) => k.slice(H.MAD_HIST_PANEL_PRE.length)).sort();
    expect(vivas).toEqual(['alimentacion2', 'alimentacion3', 'alimentacion4', 'fin10', 'fin11', 'fin2', 'fin3', 'fin4', 'fin5', 'fin6', 'fin7', 'fin8', 'fin9']);
    expect(hist().filter((e) => e.panel)).toHaveLength(13);
    expect(hist(), 'la lista no pierde ninguno').toHaveLength(17);
    const ed = filasLista().filter((tr) => tr.querySelector('.mh-ed')).length;
    expect(ed).toBe(13);
  });

  it('🔴 60 días: lo más viejo sale (con su copia)', () => {
    const viejo = entrada('fin', 1, { ts: Date.now() - 61 * 86400000 });
    localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'fin1', '<div>x</div>');
    H._madHistGuardar([viejo, entrada('fin', 2)]);
    expect(hist().map((e) => e.id)).toEqual(['fin2']);
    expect(copias()).toEqual([]);
  });

  it('y al LEER también: lo caducado no se enseña aunque siga guardado', () => {
    localStorage.setItem(H.MAD_HIST_KEY, JSON.stringify([entrada('fin', 1, { ts: Date.now() - 61 * 86400000 }), entrada('fin', 2)]));
    expect(hist().map((e) => e.id)).toEqual(['fin2']);
  });

  it('🔴 sin espacio, lo PRIMERO que se libera son las copias para Editar; la lista sigue, sin Editar', () => {
    localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'fin1', '<div>x</div>');
    H._madHistGuardar([entrada('fin', 1)]);
    expect(filasLista()[0].querySelector('.mh-ed')).not.toBeNull();
    H._reclaimSpace();
    expect(copias()).toEqual([]);
    expect(hist()).toHaveLength(1);
    const tr = filasLista()[0];
    expect(tr.querySelector('.mh-ed')).toBeNull();
    expect(tr.querySelector('.mh-pdf')).not.toBeNull();
  });

  it('🗑 Borrar lo quita SÓLO del equipo, con su copia, tras confirmar', async () => {
    llenarFin();
    await H.madFinGuardar();
    const e = hist()[0];
    confirmar = false;
    H.madHistBorrar(e.id);
    expect(hist()).toHaveLength(1);
    confirmar = true;
    H.madHistBorrar(e.id);
    expect(hist()).toHaveLength(0);
    expect(copias()).toEqual([]);
    expect(envios, 'no envía nada a la hoja').toHaveLength(1);
  });
});

describe('📜 Historial · 📄 PDF', () => {
  it('🔴 las filas del envío en tabla, con su hoja, y el texto ESCAPADO', async () => {
    llenarFin();
    $('#fp-fin .mf-cierre').querySelector('.mf-obs') && pon($('#fp-fin .mf-cierre .mf-obs'), '<b>ojo</b>');
    await H.madFinGuardar();
    const e = hist()[0];
    H.madHistPdf(e.id);
    expect(ventana).not.toBeNull();
    const h = ventana.html;
    expect(h).toContain('Maduración Fin de Ciclo');
    expect(h).toContain('<th>ID</th>');
    expect(h).toContain(envios[0].rows[0][col(envios[0], 'ID')]);
    expect(h).not.toContain('<b>ojo</b>');
  });
});

describe('📜 Historial · Desoves, con SU corrección (sólo viaja lo cambiado)', () => {
  const enviarDesove = async () => {
    pon($('#md-fecha'), '2026-09-14');
    pon($('#fp-desoves .md-lote'), 'BP'); pon($('#fp-desoves .md-cg'), 'OLF5.F2');
    pon($('#fp-desoves .md-desoves'), '64'); pon($('#fp-desoves .md-n2'), '9000');
    await H.madDesGuardar();
  };

  it('🔴 cada desove enviado entra como UNA entrada, con su llave', async () => {
    await enviarDesove();
    const l = hist();
    expect(l).toHaveLength(1);
    expect(l[0].ficha).toBe('desoves');
    expect(l[0].k).toBeTruthy();
    expect(l[0].payload.rows).toHaveLength(1);
  });

  it('🔴 dentro de las 36 h, Editar es la corrección de siempre (sobre su envío)', async () => {
    await enviarDesove();
    const e = hist()[0];
    H.madHistEditar(e.id);
    expect($('#md-edit').getAttribute('data-corrige')).toBe(e.envio);
  });

  it('🔴 más viejo (fuera del registro de 36 h): corrige como «ya llegó» — sólo viaja lo cambiado — y el Historial lo recoge', async () => {
    await enviarDesove();
    localStorage.removeItem(H.MAD_DES_LOG_KEY);
    const e = hist()[0];
    H.madHistEditar(e.id);
    expect($('#md-edit').getAttribute('data-corrige')).toBe('hist:' + e.id);
    expect(document.querySelector('#md-cards button[onclick^="madDesDelCard"]'), 'se corrige UNO: sin «✕ Quitar»').toBeNull();
    pon($('#fp-desoves .md-n2'), '9500');
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(2);
    const p = envios[1];
    expect(p.rows[0][col(p, 'N2')]).toBe(9500000);
    expect(p.rows[0][col(p, 'Desoves')], 'lo que no cambió NO viaja: no pisa lo que otro equipo completó').toBe('');
    const l = hist();
    expect(l).toHaveLength(1);
    expect(l[0].corregido).toBeGreaterThan(0);
    expect(l[0].payload.rows[0][col(p, 'N2')]).toBe(9500000);
    expect(l[0].payload.rows[0][col(p, 'Desoves')], 'la entrada dice el desove COMPLETO corregido').toBe(64);
  });
});

describe('📜 Historial · Salas y Tanques, de sus propios registros', () => {
  const sembrar = () => {
    const hoy = new Date(), d = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    localStorage.setItem(H.madKey('tanques'), JSON.stringify([
      { id: 'a', ts: 1, synced: true, syncedAt: 2, data: { fecha: d, sala: 'Sala 1', tanque: '1' } },
      { id: 'b', ts: 1, synced: true, syncedAt: 3, data: { fecha: d, sala: 'Sala 1', tanque: '2' } },
      { id: 'c', ts: 1, synced: false, data: { fecha: d, sala: 'Sala 2', tanque: '1' } },
      { id: 'd', ts: 1, synced: true, syncedAt: 4, data: { fecha: '2020-01-01', sala: 'Sala 1', tanque: '1' } },
    ]));
    return d;
  };

  it('🔴 una línea por fecha y sala, sólo lo ENVIADO de los últimos 60 días; con Editar y PDF, sin Borrar', () => {
    const d = sembrar();
    const tr = filasLista().filter((x) => x.dataset.ficha === 'tanques');
    expect(tr).toHaveLength(1);
    expect(tr[0].textContent).toContain(d);
    expect(tr[0].textContent).toContain('Sala 1');
    expect(tr[0].querySelector('.mh-ed')).not.toBeNull();
    expect(tr[0].querySelector('.mh-pdf')).not.toBeNull();
    expect(tr[0].querySelector('.mh-del')).toBeNull();
  });

  it('📄 PDF es el de la grilla, para esa fecha y sala', () => {
    const d = sembrar();
    H.madHistGrillaPdf('tanques', d, 'Sala 1');
    expect(ventana).not.toBeNull();
    expect(ventana.html).toContain('Sala 1');
  });
});
