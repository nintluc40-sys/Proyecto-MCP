// @vitest-environment happy-dom
/* ============================================================
   PAUTA DEL 24-11 · punto 2, FAMILIA 2 (sin espacio en el equipo) de la revisión del 15-11. Motor REAL; «sin espacio» se simula
   sustituyendo el guardado que toca (o haciendo que setItem lance). Datos FICTICIOS.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'public/registros/engine.js');
const SHELL = join(process.cwd(), 'src/views/registros/shell.html');
const EXPORTAR = ['pruneAlgLog', 'saveCSData', 'madAlimCfgGuardar', '_scoreGuardarBorrador', 'micAddRow', 'calToggleCol', 'micTypeToggle',
  'editAlgHistEntry', 'bioFechaChange', 'selTab', 'bioSesCrear', 'bioSes', 'bioSidActivo', 'madBorrGuardar', 'madBorrTodo',
  '_madBorrSoltarViejos', 'madAlimGuardar', 'madBorrFechaChange', 'MAD_BORR_FICHAS', 'MAD_BORR_MAX', 'today'];
const H = {};
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
  window.__rgLib = { ...(await import('./security.js')), ...(await import('./modules.js')), ...(await import('./reproductivo.data.js')) };
  const host = document.createElement('div');
  host.className = 'registros-app';
  host.innerHTML = readFileSync(SHELL, 'utf8');
  document.body.appendChild(host);
  const epilogo = '\n;(function(){ var H = globalThis.__ENG;\n'
    + EXPORTAR.map((n) => `try{ H[${JSON.stringify(n)}] = ${n}; }catch(_){}`).join('\n')
    + '\ntry{ H.setToast=function(f){toast=f;}; }catch(_){}'
    + '\nH.poner=function(n,v){ eval(n+"=v"); };'
    + '\nH.leer=function(n){ return eval(n); };\n})();';
  globalThis.__ENG = H;
  new Function('window', 'document', 'localStorage', 'globalThis', readFileSync(ENGINE, 'utf8') + epilogo)(
    window, document, globalThis.localStorage, globalThis);
  H.setToast((m) => { avisos.push(String(m)); });
  H.real = { _lsSet: H.leer('_lsSet') };
});
beforeEach(() => { H.poner('_lsSet', H.real._lsSet); globalThis.localStorage.clear(); avisos.length = 0; window.confirm = () => false; globalThis.confirm = window.confirm; });
// «Lleno»: se sustituye el localStorage QUE VE EL MOTOR (es un parámetro de su función): en happy-dom, cambiar setItem en el objeto no alcanza.
const lleno = (f) => {
  const real = H.leer('localStorage');
  H.poner('localStorage', { getItem: (k) => real.getItem(k), setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: (k) => real.removeItem(k), key: (i) => real.key(i), get length() { return real.length; } });
  try { return f(); } finally { H.poner('localStorage', real); }
};

describe('nuevo (B) · la bitácora de Algas no se reescribe al limpiar si no quitó nada', () => {
  it('🔴 sin nada que quitar, con el equipo lleno, no sale el aviso de la bitácora', () => {
    localStorage.setItem(H.leer('ALGLOG_KEY'), JSON.stringify([{ id: 'x', syncedAt: Date.now() }]));
    lleno(() => H.pruneAlgLog());
    expect(avisos.join(' ')).not.toMatch(/bitácora/);
  });
});

describe('T2.3 · Cantidad sembrada: sin espacio no dice «guardada»', () => {
  it('🔴', () => {
    H.poner('saveCS', () => false);
    H.saveCSData();
    expect(avisos.join(' ')).not.toMatch(/Cantidad sembrada guardada/);
  });
});

describe('T4.7 · la agenda de Alimentación dice si no cupo', () => {
  it('🔴 devuelve false y avisa', () => {
    expect(lleno(() => H.madAlimCfgGuardar({ a: 1 }))).toBe(false);
    expect(avisos.join(' ')).toMatch(/la agenda de Alimentación NO se guardó/);
  });
});

describe('T6.9 · el borrador del Score dice si no cupo', () => {
  it('🔴', () => {
    H.poner('_lsSet', () => false);
    H.poner('_scoreActual', () => ({ tanques: {} }));
    H._scoreGuardarBorrador();
    expect(avisos.join(' ')).toMatch(/el borrador del Score NO se guardó/);
  });
});

describe('T7.5 · Laboratorio: sin sitio para el borrador, no se repinta (lo tecleado se queda)', () => {
  it('🔴 ➕ Fila', () => {
    let pinta = 0;
    H.poner('collectMicDraft', () => ({ meta: {}, sections: {}, activeFmt: 'larv-muestra' }));
    H.poner('saveMicDraft', () => false);
    H.poner('renderMicNuevo', () => { pinta++; });
    H.micAddRow('larv-muestra');
    expect(pinta).toBe(0);
    expect(avisos.join(' ')).toMatch(/no se puede hacer eso sin PERDER lo tecleado/);
  });
  it('🔴 ocultar una columna: no cambia nada', () => {
    let oculta = 0;
    H.poner('collectCalDraft', () => ({ meta: {}, sections: {} }));
    H.poner('saveCalDraft', () => false);
    H.poner('saveCalHidden', () => { oculta++; });
    H.calToggleCol('x', 'k');
    expect(oculta).toBe(0);
  });
  it('🔴 cambiar de tipo: no cambia', () => {
    let cambia = 0;
    H.poner('curTab', 'micnuevo');
    H.poner('micTypeGet', () => 'bact');
    H.poner('collectMicDraft', () => ({}));
    H.poner('saveMicDraft', () => false);
    H.poner('micTypeSet', () => { cambia++; });
    H.micTypeToggle('cal');
    expect(cambia).toBe(0);
  });
});

describe('T2.6 · Algas ✏️: sin espacio no entra en «modo edición» con la ficha vacía', () => {
  it('🔴', () => {
    H.poner('curMod', H.leer('LAB_MOD'));
    H.poner('loadAlgHist', () => [{ id: 'h1', data: { cel_ml: '4321' } }]);
    H.poner('_algSinAgregar', () => false);
    H.poner('saveE', () => false);
    H.poner('renderAlgas', () => {});
    H.poner('_algEditingId', null);
    H.editAlgHistEntry('h1');
    expect(H.leer('_algEditingId')).toBeNull();
    expect(avisos.join(' ')).toMatch(/NO se abrió para editar/);
  });
});

describe('T6.4 · Biomol y Mareas: dejar la grilla sin poder guardarla pregunta', () => {
  it('🔴 Biomol, cambiar de día: con «quedarse» no repinta y la fecha vuelve', () => {
    let pinta = 0;
    const el = document.getElementById('bio-grid-fecha') || Object.assign(document.body.appendChild(document.createElement('input')), { id: 'bio-grid-fecha' });
    H.poner('_bioRenderedFecha', '2026-11-20');
    el.value = '2026-11-19';
    H.poner('saveBioGrid', () => -1);
    H.poner('renderBiomol', () => { pinta++; });
    H.bioFechaChange();
    expect(pinta).toBe(0);
    expect(el.value).toBe('2026-11-20');
  });
  it('🔴 Mareas, cambiar de pestaña: con «quedarse» no se cambia', () => {
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return false; }; globalThis.confirm = window.confirm;
    H.poner('curMod', H.leer('AST_MOD')); H.poner('curTab', 'marea');
    H.poner('_collectMareaGrid', () => [{ p1: '1' }]);
    H.poner('saveMareaDraftObj', () => false);
    try { H.selTab('ast'); } catch (_) { /* pintar no importa aquí */ }
    expect(preguntas[0]).toMatch(/guardar lo tecleado en Mareas/);
    expect(H.leer('curTab')).toBe('marea');
  });
});

describe('T6.5 · Biomol: un análisis que no cupo sigue siendo SUYO (no se cae al primero del día)', () => {
  it('🔴', () => {
    const F = '2026-11-20';
    localStorage.setItem(H.leer('BIO_SES_KEY'), JSON.stringify({ s1: { fecha: F, nombre: '', creado: 1 } }));
    H.poner('_lsSet', () => false);
    const sid = H.bioSesCrear(F, '');
    expect(H.bioSes(sid)).toBeTruthy();
    expect(H.bioSidActivo(F)).toBe(sid);
  });
});

describe('T3.2 · borradores de formularios de Maduración', () => {
  const ficha = 'ingreso';
  const panel = () => {
    const id = H.MAD_BORR_FICHAS[ficha].panel;
    let fp = document.getElementById(id);
    if (!fp) { fp = document.createElement('div'); fp.id = id; document.body.appendChild(fp); }
    fp.innerHTML = '<input value="x">';
    return fp;
  };
  const dia = (n) => `2026-${String(Math.floor(n / 28) + 1).padStart(2, '0')}-${String((n % 28) + 1).padStart(2, '0')}`;
  it('🔴 c · con el tope lleno, guardar una fecha MÁS ANTIGUA que todas la guarda de verdad', () => {
    panel();
    const todo = {};
    for (let i = 10; i < 10 + H.MAD_BORR_MAX; i++) todo[dia(i)] = '<p>b</p>';
    localStorage.setItem(H.leer('MAD_BORR_PRE') + ficha, JSON.stringify(todo));
    const r = H.madBorrGuardar(ficha, dia(1));
    expect(r, 'panel ' + H.MAD_BORR_FICHAS[ficha].panel).toBe(true);
    const t = H.madBorrTodo(ficha);
    expect(t[dia(1)]).toBeTruthy();
    expect(Object.keys(t)).toHaveLength(H.MAD_BORR_MAX);
  });
  it('🔴 b · 🧹 suelta los de días pasados, nunca el de hoy ni el de la fecha abierta', () => {
    const hoy = H.today();
    localStorage.setItem(H.leer('MAD_BORR_PRE') + ficha, JSON.stringify({ '2020-01-01': 'a', '2020-01-02': 'b', '2020-01-03': 'c', [hoy]: 'h' }));
    H.leer('_madBorrFecha')[ficha] = '2020-01-03';
    expect(H._madBorrSoltarViejos(true)).toBe(2);
    expect(Object.keys(H.madBorrTodo(ficha)).sort()).toEqual(['2020-01-03', hoy].sort());
  });
  it('b · sin espacio, sólo la mitad más vieja', () => {
    localStorage.setItem(H.leer('MAD_BORR_PRE') + ficha, JSON.stringify({ '2020-01-01': 'a', '2020-01-02': 'b', '2020-01-03': 'c', '2020-01-04': 'd' }));
    H.leer('_madBorrFecha')[ficha] = null;
    expect(H._madBorrSoltarViejos(false)).toBe(2);
    expect(Object.keys(H.madBorrTodo(ficha)).sort()).toEqual(['2020-01-03', '2020-01-04']);
  });
  it('🔴 a · Alimentación olvida su borrador al enviar', async () => {
    let olvida = 0;
    H.poner('_madGridBloqueada', (p, f) => f());
    H.poner('madLocLeer', () => []);
    H.poner('_madAlimPreparar', () => ({ model: { fecha: '2026-11-20', salas: [] }, payload: { rows: [['x']] } }));
    H.poner('_madIngGasAlDia', async () => 'sello');
    H.poner('_madHistCorrConfirma', () => true);
    H.poner('_madPostConSello', async () => true);
    H.poner('_madAlimAgendaEnviada', () => {});
    H.poner('madAlimLogAnota', () => {});
    H.poner('_madHistAnota', () => false);
    H.poner('_madBorrOlvidarPantalla', () => { olvida++; });
    await H.madAlimGuardar();
    expect(olvida).toBe(1);
  });
});

describe('T3.1 · cambiar la fecha de un formulario de Maduración sin poder guardar lo de antes, pregunta', () => {
  it('🔴 con «quedarse», la fecha vuelve y el panel no cambia de día', () => {
    const cfg = H.MAD_BORR_FICHAS.ingreso;
    let fp = document.getElementById(cfg.panel); if (!fp) { fp = document.createElement('div'); fp.id = cfg.panel; document.body.appendChild(fp); }
    fp.innerHTML = '<input id="' + cfg.fecha + '" type="date" value="2026-11-19"><input value="lote tecleado">';
    H.leer('_madBorrFecha').ingreso = '2026-11-20';
    H.leer('_madBorrTocado').ingreso = true;
    H.leer('_madBorrOrigen').ingreso = 'borrador';
    H.poner('madBorrLeer', () => '<p>lo del 19</p>');
    H.poner('madBorrGuardar', () => false);
    let restaura = 0;
    H.poner('_madPanelRestaurar', () => { restaura++; });
    const preguntas = [];
    window.confirm = (m) => { preguntas.push(m); return false; }; globalThis.confirm = window.confirm;
    H.madBorrFechaChange('ingreso');
    expect(preguntas[1]).toMatch(/No hay espacio en este equipo para guardar lo tecleado en esta ficha/);
    expect(document.getElementById(cfg.fecha).value).toBe('2026-11-20');
    expect(restaura).toBe(0);
  });
});
