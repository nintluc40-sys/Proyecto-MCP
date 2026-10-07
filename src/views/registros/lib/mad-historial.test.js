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
/* Un almacenamiento PROPIO, como en cola-sin-espacio.test.js, y es el que recibe el monolito: las pruebas de «sin espacio»
   parchean su setItem. Con el de happy-dom (Node 24, el de la CI) el monolito escribe sin pasar por el método que se parchea
   desde aquí, y la falta de espacio simulada no llegaba a ocurrir (medido el 2026-10-04). */
const localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };
})();
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MAD_MOD', 'MAD_HIST_KEY', 'MAD_HIST_PANEL_PRE', 'MAD_DES_LOG_KEY', 'MAD_BORR_PRE', '_gasVersionLocal',
  'madHistLeer', '_madHistGuardar', 'renderMadHistorial', 'renderHistorial', 'madHistEditar', 'madHistBorrar', 'madHistPdf',
  '_lsSet', '_purgeMadHistViejo', 'safeSetItem',   // auditoría 2026-10-04 · sin espacio
  '_madHistPdfHTML', 'madHistCorrCancelar', 'madHistGrilla', 'madHistGrillaPdf', '_purgeMadHistPaneles', '_reclaimSpace',
  'madFinReiniciar', 'madFinGuardar', 'madFinGuardarLocal', 'madFinTipoChange',
  'madDesReiniciar', 'madDesGuardar', 'madDesCorregirGuardar', 'selTab', 'madKey', 'madBorrGuardar', 'madBorrLeer',
  'madHistDia', 'madHistSel', 'madHistSelTodas', 'madHistPdfDia', 'madHistFiltrar'];   // 🖨 PDF de lo elegido (2026-10-07)
const H = {};
const envios = [];
let respuestaVer = null;
let confirmar = true;
const preguntas = [];
let ventana = null;

beforeAll(async () => {
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
    window, document, localStorage, globalThis,
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
  // Desde el 2026-10-07 la lista arranca en el día de HOY (🖨 PDF de lo elegido); estas entradas son de otros días.
  beforeEach(() => { H.madHistDia(''); });

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

  it('🔴 el tope de 200 es POR FICHA: los desoves (uno por entrada, ~3 al día) no echan a las demás antes de los 60 días', () => {
    const l = [entrada('fin', 0, { ts: Date.now() - 30 * 86400000, panel: false })];
    for (let i = 0; i < 205; i++) l.push(entrada('desoves', i, { ts: Date.now() - (205 - i) * 1000, panel: false }));
    H._madHistGuardar(l);
    const h = hist();
    expect(h.filter((e) => e.ficha === 'desoves')).toHaveLength(200);
    expect(h.filter((e) => e.ficha === 'desoves').map((e) => e.id)).not.toContain('desoves0');   // fuera los más viejos
    expect(h.some((e) => e.id === 'fin0'), 'el cierre de hace 30 días sigue').toBe(true);
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

/* Auditoría (2026-10-04, usuario) · un reenvío con las MISMAS filas (mismo ID) sustituye a su entrada: el Historial dice lo
   que hay en la hoja, y Editar la vieja no podría devolverle datos viejos. Con otras filas, entrada nueva. */
describe('📜 Historial · los reenvíos con las mismas filas', () => {
  it('🔴 el mismo cierre reenviado desde la ficha: UNA entrada, con lo último y «reenviado»; otro cierre, otra entrada', async () => {
    llenarFin('BP', '5');
    await H.madFinGuardar();
    const primero = hist()[0];
    llenarFin('BP', '7');                       // mismo lote, motivo y sala → mismo ID; otro dato
    await H.madFinGuardar();
    let l = hist();
    expect(l).toHaveLength(1);
    expect(l[0].id).toBe(primero.id);
    expect(l[0].reenviado).toBeGreaterThan(0);
    expect(l[0].primero).toBe(primero.ts);
    expect(l[0].payload.rows[0][col(l[0].payload, 'Machos')]).toBe(7);
    expect(filasLista()[0].textContent).toContain('🔁 reenviado');
    H.madHistEditar(l[0].id);
    expect($('#fp-fin .mf-machos').value, 'Editar abre lo ÚLTIMO enviado').toBe('7');
    H.madFinReiniciar();
    llenarFin('BQ', '2');
    await H.madFinGuardar();
    l = hist();
    expect(l).toHaveLength(2);
  });

  it('🔴 el mismo desove reenviado: una entrada; otro código, otra', async () => {
    const enviar = async (cg, n2) => {
      pon($('#md-fecha'), '2026-09-14');
      pon($('#fp-desoves .md-lote'), 'BP'); pon($('#fp-desoves .md-cg'), cg); pon($('#fp-desoves .md-desoves'), '64'); pon($('#fp-desoves .md-n2'), n2);
      await H.madDesGuardar();
    };
    await enviar('CG1', '9000');
    await enviar('CG1', '9100');
    expect(hist()).toHaveLength(1);
    expect(hist()[0].payload.rows[0][col(hist()[0].payload, 'N2')]).toBe(9100000);
    expect(hist()[0].envio, 'Editar en 36 h va al envío ÚLTIMO').toBe(JSON.parse(localStorage.getItem(H.MAD_DES_LOG_KEY)).slice(-1)[0].id);
    await enviar('CG2', '8000');
    expect(hist()).toHaveLength(2);
  });
});

/* Auditoría (2026-10-04, usuario) · sin espacio: primero las copias para Editar (arriba); si aún falta, la mitad MÁS VIEJA del
   Historial. Lo que espera envío nunca se toca: aquí la escritura que lo pide es la de la COLA. */
describe('📜 Historial · sin espacio, también la mitad más vieja del historial', () => {
  const entrada = (i) => ({ id: 'h' + i, ficha: 'fin', ts: Date.now() - (100 - i) * 1000, fecha: '2026-10-01', filas: 1, panel: true,
    payload: { sheetName: 'X', headers: ['ID'], rows: [['r' + i]] } });
  /* «Lleno» para la clave `k` mientras el historial tenga más de 2 entradas. ⚠ Se parchea el método DONDE VIVE: en el
     almacenamiento de las pruebas es propio, pero en el de happy-dom (Node 24, el de la CI) está en el prototipo, y asignar
     `localStorage.setItem = …` a un Storage de verdad GUARDA un elemento llamado «setItem» en vez de cambiar el método. */
  const lleno = (k, fn) => {
    const dueno = Object.prototype.hasOwnProperty.call(localStorage, 'setItem') ? localStorage : Object.getPrototypeOf(localStorage);
    const original = dueno.setItem;
    dueno.setItem = function (clave, v) {
      if (clave === k && hist().length > 2) throw new Error('QuotaExceededError');
      return original.call(this, clave, v);
    };
    try { return fn(); } finally { dueno.setItem = original; }
  };

  it('🔴 _purgeMadHistViejo deja la mitad más reciente, con sus copias, y dice cuánto liberó', () => {
    const l = [];
    for (let i = 0; i < 6; i++) { l.push(entrada(i)); localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'h' + i, '<div>x</div>'); }
    localStorage.setItem(H.MAD_HIST_KEY, JSON.stringify(l));
    expect(H._purgeMadHistViejo()).toContain('3 envío(s)');
    expect(hist().map((e) => e.id).sort()).toEqual(['h3', 'h4', 'h5']);
    expect(copias().sort()).toEqual(['h3', 'h4', 'h5'].map((x) => H.MAD_HIST_PANEL_PRE + x));
    localStorage.removeItem(H.MAD_HIST_KEY);
    expect(H._purgeMadHistViejo(), 'nada que liberar').toBeNull();
  });

  it('🔴 la cola no se pierde por el historial: _lsSet libera el historial viejo y la escritura llega', () => {
    const l = [];
    for (let i = 0; i < 8; i++) l.push(entrada(i));
    localStorage.setItem(H.MAD_HIST_KEY, JSON.stringify(l));
    expect(lleno('larv4_syncqueue', () => H._lsSet('larv4_syncqueue', '[{"x":1}]'))).toBe(true);
    expect(localStorage.getItem('larv4_syncqueue')).toBe('[{"x":1}]');
    expect(hist().length, 'liberó la mitad más vieja (dos veces)').toBe(2);
    expect(hist().map((e) => e.id).sort()).toEqual(['h6', 'h7']);
  });

  it('y safeSetItem lo tiene como ÚLTIMA estrategia: tras las seguras, libera el historial viejo y la escritura llega', () => {
    const l = [];
    for (let i = 0; i < 4; i++) l.push(entrada(i));
    localStorage.setItem(H.MAD_HIST_KEY, JSON.stringify(l));
    expect(lleno('larv4_prueba_safe', () => H.safeSetItem('larv4_prueba_safe', 'v', { silent: true }))).toBe(true);
    expect(hist()).toHaveLength(2);
    localStorage.removeItem('larv4_prueba_safe');
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
    pon($('#fp-desoves .md-lote'), 'BP'); pon($('#fp-desoves .md-cg'), 'CG1');
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

describe('📜 Historial · auditoría: un desove COMPLETO, corregido pasadas las 36 h', () => {
  it('🔴 sólo viajan el N2 y su fecha: lo que la hoja trae de vuelta (unidades, fechas, piscina, notas) no cuenta como cambio', async () => {
    pon($('#md-fecha'), '2026-09-14');
    pon($('#fp-desoves .md-lote'), 'BP'); pon($('#fp-desoves .md-cg'), 'CG1');
    pon($('#fp-desoves .md-desoves'), '64'); pon($('#fp-desoves .md-huevos'), '14440'); pon($('#fp-desoves .md-hnoviables'), '9');
    pon($('#fp-desoves .md-n2'), '9000'); pon($('#fp-desoves .md-n5'), '7000');
    if ($('#fp-desoves .md-piscina')) pon($('#fp-desoves .md-piscina'), 'P3');
    pon($('#fp-desoves .md-obs'), 'Revisado');
    await H.madDesGuardar();
    expect(envios).toHaveLength(1);
    localStorage.removeItem(H.MAD_DES_LOG_KEY);
    H.madHistEditar(hist()[0].id);
    selectsComoNavegador($('#fp-desoves'));
    pon($('#fp-desoves .md-n2'), '9500');
    await H.madDesCorregirGuardar();
    expect(envios).toHaveLength(2);
    const p = envios[1];
    const llenas = p.headers.filter((h, j) => String(p.rows[0][j] ?? '') !== '');
    expect(llenas.sort()).toEqual(['Código genético', 'Fecha', 'Fecha N2', 'Lote', 'N2'].concat(p.headers.includes('ID') ? ['ID'] : []).sort());
    expect(p.rows[0][col(p, 'N2')]).toBe(9500000);
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

/* 🖨 PDF CONGLOMERADO DEL DÍA (usuario, 2026-10-07): «escoger de los registros que están en el Historial cuáles quiero que
   salgan en el PDF». Decidido: casillas en la lista + «Día» (por defecto hoy; vacío = todos), el día es la FECHA del
   registro, el PDF va seguido y agrupado por ficha en el orden de las pestañas (y por hora de envío), y Salas/Tanques entran
   como la tabla de lo enviado (buildMadPayload). Datos FICTICIOS. */
describe('📜 Historial · 🖨 PDF de lo elegido', () => {
  const hoy = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
  const entrada = (id, ficha, fecha, ts, dato) => ({ id, ficha, fecha, ts, filas: 1, resumen: 'Lote ZZ',
    payload: { sheetName: 'Hoja de ' + ficha, headers: ['Fecha', 'Lote', 'Dato'], rows: [[fecha, 'ZZ', dato]] } });
  const sembrar = () => {
    const d = hoy(), ahora = Date.now();
    H._madHistGuardar([
      entrada('a', 'alimentacion', d, ahora - 1000, 'alim-uno'),
      entrada('b', 'ingreso', d, ahora - 5000, 'ing-<b>uno</b>'),
      entrada('c', 'movimientos', '2026-01-02', ahora - 9000, 'mov-otro-dia'),
    ]);
    localStorage.setItem(H.madKey('tanques'), JSON.stringify([
      { id: 't2', ts: 1, synced: true, syncedAt: ahora - 3000, data: { fecha: d, sala: 'Sala 9', tanque: '2', hembras_muertas: '3', parte: '1' } },
      { id: 't1', ts: 1, synced: true, syncedAt: ahora - 4000, data: { fecha: d, sala: 'Sala 9', tanque: '1', hembras_muertas: '7', parte: '1' } },
      { id: 'tx', ts: 1, synced: false, data: { fecha: d, sala: 'Sala 9', tanque: '3', hembras_muertas: '99' } },
    ]));
    return d;
  };
  const cajas = () => Array.from(document.querySelectorAll('#fp-historial .mh-sel'));
  const caja = (pred) => cajas().find((c) => pred(c.closest('tr')));
  const marca = (c) => { c.checked = true; H.madHistSel(c.dataset.k, true); };
  beforeEach(() => { H.madHistFiltrar(''); H.madHistDia(hoy()); });

  it('🔴 «Día» (hoy por defecto) deja sólo los registros de esa FECHA; vacío, todos', () => {
    sembrar();
    H.madHistDia(hoy());
    const d = filasLista();
    expect(d.map((tr) => tr.dataset.ficha).sort()).toEqual(['alimentacion', 'ingreso', 'tanques']);
    expect($('#fp-historial .mh-dia').value).toBe(hoy());
    H.madHistDia('');
    expect(filasLista().map((tr) => tr.dataset.ficha).sort()).toEqual(['alimentacion', 'ingreso', 'movimientos', 'tanques']);
    H.madHistDia('2026-01-02');
    expect(filasLista().map((tr) => tr.dataset.ficha)).toEqual(['movimientos']);
  });

  it('🔴 marcar una casilla NO repinta la lista: sólo cambia el contador del botón', () => {
    sembrar(); H.renderMadHistorial();
    const tabla = $('#fp-historial table');
    marca(caja((tr) => tr.dataset.ficha === 'ingreso'));
    expect($('#fp-historial table')).toBe(tabla);
    expect($('#fp-historial .mh-pdfsel').textContent).toContain('(1)');
  });

  it('🔴 el PDF lleva SÓLO lo elegido, agrupado por ficha en el orden de las pestañas, con índice y el texto escapado', () => {
    sembrar(); H.renderMadHistorial();
    marca(caja((tr) => tr.dataset.ficha === 'alimentacion'));
    marca(caja((tr) => tr.dataset.ficha === 'ingreso'));
    H.madHistPdfDia();
    expect(ventana).not.toBeNull();
    const html = ventana.html;
    expect(html).toContain('Maduración · Historial · ' + hoy());
    expect(html).toContain('2 registro(s)');
    expect(html.indexOf('ing-&lt;b&gt;uno')).toBeGreaterThan(-1);
    expect(html).not.toContain('ing-<b>uno');
    expect(html.indexOf('ing-&lt;b&gt;uno')).toBeLessThan(html.indexOf('alim-uno'));   // Ingreso va antes que Alimentación
    expect(html).not.toContain('Hoja de tanques');
    expect(html).not.toContain('mov-otro-dia');
    expect((html.match(/<section>/g) || []).length).toBe(2);
  });

  it('🔴 Salas y Tanques entran como la tabla de lo ENVIADO, por tanque, sin lo que no salió', () => {
    sembrar(); H.renderMadHistorial();
    marca(caja((tr) => tr.dataset.ficha === 'tanques'));
    H.madHistPdfDia();
    const html = ventana.html;
    expect(html).toContain('Sala 9');
    expect(html).toContain('«Maduración Tanques»');
    expect(html).toContain('2 fila(s)');
    const filas = html.slice(html.indexOf('<tbody>')).match(/<tr>.*?<\/tr>/g);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toContain('<td>7</td>');   // el tanque 1 antes que el 2
    expect(filas[1]).toContain('<td>3</td>');
    expect(html).not.toContain('<td>99</td>');  // el registro sin enviar no entra
  });

  it('sin nada marcado no abre nada y lo dice', () => {
    sembrar(); H.renderMadHistorial();
    const avisos = []; H.setToast((m) => avisos.push(String(m)));
    H.madHistPdfDia();
    H.setToast(() => {});
    expect(ventana).toBeNull();
    expect(avisos.join(' ')).toContain('Marca');
  });

  it('«☑ Todas / ninguna» marca las VISIBLES y, pulsado otra vez, las desmarca', () => {
    sembrar(); H.renderMadHistorial();
    H.madHistSelTodas();
    expect(cajas().every((c) => c.checked)).toBe(true);
    expect($('#fp-historial .mh-pdfsel').textContent).toContain('(3)');
    H.madHistSelTodas();
    expect(cajas().some((c) => c.checked)).toBe(false);
    expect($('#fp-historial .mh-pdfsel').textContent).toContain('(0)');
  });

  it('🔴 cambiar de día VACÍA la elección; cambiar de ficha la CONSERVA', () => {
    sembrar(); H.renderMadHistorial();
    marca(caja((tr) => tr.dataset.ficha === 'ingreso'));
    H.madHistFiltrar('alimentacion');
    expect($('#fp-historial .mh-pdfsel').textContent).toContain('(1)');
    H.madHistFiltrar('');
    expect(caja((tr) => tr.dataset.ficha === 'ingreso').checked).toBe(true);
    H.madHistDia('2026-01-02'); H.madHistDia(hoy());
    expect($('#fp-historial .mh-pdfsel').textContent).toContain('(0)');
  });

  it('lo borrado deja de contar en la elección', () => {
    sembrar(); H.renderMadHistorial();
    marca(caja((tr) => tr.dataset.ficha === 'ingreso'));
    H.madHistBorrar('b');
    expect($('#fp-historial .mh-pdfsel').textContent).toContain('(0)');
  });
});
