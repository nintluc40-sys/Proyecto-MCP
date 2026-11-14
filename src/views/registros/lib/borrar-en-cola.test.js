// @vitest-environment happy-dom
/* ============================================================
   🗑 Y LA COLA (punto 14 de la pauta del 2026-11-12)

   Lo que pasaba (medido en el código el 14-11):
   · Score, Mantenimiento, Auditoría y Traslado: con su envío esperando en la cola, 🗑 invitaba a quitarlo («se enviará desde
     ahí…»): si la hoja lo rechazaba, ya no quedaba otra copia, y con una versión ANTERIOR en la cola lo cambiado después se
     perdía (eso lo vigilan ya sus pruebas B5, puestas al día).
   · 📜 Historial de Maduración: 🗑 borraba un envío que aún espera en la cola diciendo «lo que llegó a la hoja no cambia»; y es
     desde ahí desde donde se ve y se corrige (el formulario se limpió al encolarse).
   · 📋 Desoves pendientes: 🗑 no miraba la cola.
   Decisión del usuario: «No dejar quitarlo» — mientras algo suyo espera en la cola, 🗑 no lo quita y dice por qué.
   · El registro de desoves de 36 h olvidaba lo que seguía en la cola: ✏️ desde el 📜 lo daba por llegado y mandaba sólo lo
     cambiado, que podía llegar ANTES que el original y quedar pisado. Decisión del usuario: «Como el Historial».
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['MAD_MOD', 'MAD_HIST_KEY', 'MAD_HIST_PANEL_PRE', 'SYNCQ_KEY', 'madHistBorrar', 'madHistLeer',
  'MAD_DES_PEND_KEY', 'MAD_DES_LOG_KEY', 'MAD_DES_LOG_TTL', 'madDesPendTablaHTML', 'madDesPendEliminar', 'madDesLocalesLeer',
  'madDesOcultosLeer', 'madDesLlave', 'buildMadDesovePayload', 'madDesLogLeer', '_madDesEntradaLog', '_gasVersionLocal'];
const H = {};
const avisos = [];
let preguntas = [];
let responder = true;

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const m = new Map();
    globalThis.localStorage = {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k), clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; },
    };
  }
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\ntry{ H.setMod=function(m){curMod=m;}; }catch(_){}\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.setMod(H.MAD_MOD);
  window.confirm = (m) => { preguntas.push(String(m)); return responder; };
});

beforeEach(() => {
  globalThis.localStorage.clear();
  avisos.length = 0; preguntas = []; responder = true;
});

const aviso = (re) => avisos.some((a) => re.test(a));
const ENCOLA = /espera en la cola para enviarse: no se puede quitar de este dispositivo/;

describe('📜 Historial de Maduración · 🗑 de un envío que espera en la cola', () => {
  const entrada = (id, envio) => ({ id, ficha: 'fin', envio, ts: Date.now() - 1000, fecha: '2026-11-14', filas: 1, panel: true,
    payload: { sheetName: 'Maduración Fin', headers: ['ID'], rows: [['r-' + id]] } });
  const sembrar = () => {
    localStorage.setItem(H.MAD_HIST_KEY, JSON.stringify([entrada('h1', 'env1'), entrada('h2', 'env2')]));
    localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'h1', '<div>copia</div>');
    localStorage.setItem(H.MAD_HIST_PANEL_PRE + 'h2', '<div>copia</div>');
    localStorage.setItem(H.SYNCQ_KEY, JSON.stringify([{ reqId: 'q1', ts: 1, payload: { sheetName: 'Maduración Fin', headers: ['ID'], rows: [['r-h1']] },
      mark: { kind: 'madlog:fin', keys: ['env1'] } }]));
  };

  it('🔴 no se borra, no se pregunta, y se dice por qué (antes: «lo que llegó a la hoja no cambia»)', () => {
    sembrar();
    H.madHistBorrar('h1');
    expect(preguntas, 'se preguntó').toHaveLength(0);
    expect(aviso(ENCOLA), avisos.join(' | ')).toBe(true);
    expect(H.madHistLeer().map((e) => e.id).sort()).toEqual(['h1', 'h2']);
    expect(localStorage.getItem(H.MAD_HIST_PANEL_PRE + 'h1'), 'su copia para Editar').not.toBeNull();
  });

  it('lo que ya salió de la cola sí se borra, tras preguntar (como antes)', () => {
    sembrar();
    H.madHistBorrar('h2');
    expect(preguntas[0]).toContain('Lo que llegó a la hoja no cambia');
    expect(H.madHistLeer().map((e) => e.id)).toEqual(['h1']);
    expect(localStorage.getItem(H.MAD_HIST_PANEL_PRE + 'h2')).toBeNull();
  });
});

describe('📋 Desoves pendientes · 🗑 de un desove que espera en la cola', () => {
  const D = { fecha: '2026-11-12', lote: 'LP', codigoGenetico: 'CG1', desoves: '5' };
  const preparar = (enCola) => {
    localStorage.setItem(H.MAD_DES_PEND_KEY, JSON.stringify([D]));
    if (enCola) {
      const p = H.buildMadDesovePayload({ fecha: D.fecha, desoves: [{ lote: D.lote, codigoGenetico: D.codigoGenetico, desoves: D.desoves }] });
      localStorage.setItem(H.SYNCQ_KEY, JSON.stringify([{ reqId: 'q1', ts: 1, payload: p, mark: { kind: 'madlog:desoves', keys: ['envD'] } }]));
    }
    H.madDesPendTablaHTML();   // la lista que ve el usuario (y de la que sale el 🗑)
    return H.madDesLlave(D);
  };

  it('🔴 no se quita, no se pregunta, y se dice por qué', () => {
    const k = preparar(true);
    H.madDesPendEliminar(k);
    expect(preguntas, 'se preguntó').toHaveLength(0);
    expect(aviso(ENCOLA), avisos.join(' | ')).toBe(true);
    expect(H.madDesLocalesLeer(), 'se borró del equipo').toHaveLength(1);
    expect(H.madDesOcultosLeer(), 'se ocultó').toEqual([]);
  });

  it('sin nada en la cola, se pregunta y se quita (como antes)', () => {
    const k = preparar(false);
    H.madDesPendEliminar(k);
    expect(preguntas[0]).toContain('¿Quitar de este dispositivo el desove LP · CG1');
    expect(H.madDesLocalesLeer()).toHaveLength(0);
  });

  it('un envío de OTRA hoja con las mismas columnas (Ingreso también lleva fecha, lote y código) no lo impide', () => {
    const k = preparar(false);
    const p = { ...H.buildMadDesovePayload({ fecha: D.fecha, desoves: [{ lote: D.lote, codigoGenetico: D.codigoGenetico, desoves: D.desoves }] }), sheetName: 'Maduración Ingreso' };
    localStorage.setItem(H.SYNCQ_KEY, JSON.stringify([{ reqId: 'q1', ts: 1, payload: p, mark: { kind: 'madlog:ingreso', keys: ['envI'] } }]));
    H.madDesPendEliminar(k);
    expect(preguntas).toHaveLength(1);
    expect(H.madDesLocalesLeer()).toHaveLength(0);
  });

  it('un envío de OTRO desove en la cola no lo impide', () => {
    const k = preparar(false);
    const p = H.buildMadDesovePayload({ fecha: D.fecha, desoves: [{ lote: 'OTRO', codigoGenetico: 'CG9', desoves: '3' }] });
    localStorage.setItem(H.SYNCQ_KEY, JSON.stringify([{ reqId: 'q1', ts: 1, payload: p, mark: { kind: 'madlog:desoves', keys: ['envX'] } }]));
    H.madDesPendEliminar(k);
    expect(preguntas).toHaveLength(1);
    expect(H.madDesLocalesLeer()).toHaveLength(0);
  });
});

describe('🥚 el registro de desoves de 36 h conserva lo que espera en la cola (usuario: «Como el Historial»)', () => {
  const viejo = (id) => ({ id, marca: true, ts: Date.now() - H.MAD_DES_LOG_TTL - 3600000, fecha: '2026-11-12', filas: 1, estado: 'cola',
    desoves: [{ lote: 'LP', codigoGenetico: 'CG1', desoves: '5' }] });
  const k = () => H.madDesLlave({ fecha: '2026-11-12', lote: 'LP', codigoGenetico: 'CG1' });

  it('🔴 un desove de hace más de 36 h que sigue en la cola se queda (y ✏️ lo corrige por el camino de la cola)', () => {
    localStorage.setItem(H.MAD_DES_LOG_KEY, JSON.stringify([viejo('envD')]));
    localStorage.setItem(H.SYNCQ_KEY, JSON.stringify([{ reqId: 'q1', ts: 1, payload: {}, mark: { kind: 'madlog:desoves', keys: ['envD'] } }]));
    expect(H.madDesLogLeer().map((e) => e.id)).toEqual(['envD']);
    expect(H._madDesEntradaLog('envD', k()), 'se daba por llegado').not.toBeNull();
  });

  it('lo viejo que ya salió de la cola se va, como siempre', () => {
    localStorage.setItem(H.MAD_DES_LOG_KEY, JSON.stringify([viejo('envD')]));
    expect(H.madDesLogLeer()).toEqual([]);
    expect(H._madDesEntradaLog('envD', k())).toBeNull();
  });
});
