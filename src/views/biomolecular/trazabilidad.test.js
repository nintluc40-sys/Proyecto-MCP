// @vitest-environment happy-dom
// Regresión de los DOS modos de trazabilidad del Sankey, de la tabla/exportación y de la
// regla compartida `effDiag`. A diferencia de navigation.test.js —que stubea D3 con un
// agujero negro y solo comprueba que la vista no reviente— aquí el stub GRABA lo dibujado
// (etiquetas, rects y cintas), que es lo único que permite afirmar QUÉ se pintó.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Agujero negro para todo lo que no se mide (escalas, jerarquías, ejes…).
const blackhole = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === Symbol.toPrimitive) return (h) => (h === 'string' ? '' : 0);
    if (prop === 'toString' || prop === Symbol.toStringTag) return () => '';
    if (prop === 'valueOf') return () => 0;
    if (prop === Symbol.iterator) return function* () {};
    return blackhole;
  },
  apply: () => blackhole,
});

// Grabadora: cada `append` cuelga un nodo con sus atributos y su texto.
const REC = {};
const bucket = (sel) => (REC[sel] ||= { viewBox: null, nodes: [] });
function recSel(sel, node) {
  const b = bucket(sel);
  const api = {
    append(tag) { const child = { tag, attrs: {}, text: null, events: {} }; b.nodes.push(child); return recSel(sel, child); },
    attr(k, v) { if (node) node.attrs[k] = v; else if (k === 'viewBox') b.viewBox = v; return api; },
    text(t) { if (node) node.text = t; return api; },
    style() { return api; },
    on(ev, fn) { if (node) node.events[ev] = fn; return api; },
    selectAll() { return { remove() { b.nodes.length = 0; b.viewBox = null; }, each() {}, attr() { return this; } }; },
    node() { return null; }, remove() { return api; }, datum() { return api; }, call() { return api; },
  };
  return api;
}
const RECORDED = ['#sankey', '#treemap'];
globalThis.window.d3 = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === 'select') return (s) => (RECORDED.includes(s) ? recSel(s, null) : blackhole);
    return Reflect.get(blackhole, prop);
  },
  apply: () => blackhole,
});
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

import { store } from '../../core/store.js';
import { biomolecularView } from './index.js';

const B = (o) => ({ _SheetOrigin: 'Biomol', ...o });
// Los 5 diagnósticos que NO se usan en los fixtures van vacíos a propósito.
const VACIOS = { WSSV: '', BP: '', 'AHPND/EMS': '', NHPB: '', EHP: '' };

const click = (el) => { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const texts = (sel) => (REC[sel] ? REC[sel].nodes.filter((n) => n.tag === 'text').map((n) => String(n.text)) : []);
const rects = (sel) => (REC[sel] ? REC[sel].nodes.filter((n) => n.tag === 'rect') : []);
const links = (sel) => (REC[sel] ? REC[sel].nodes.filter((n) => n.tag === 'path') : []);

// El modo del Sankey es estado de módulo y sobrevive al re-render: se deduce del DOM en vez
// de suponerlo, para que el orden de los tests no pueda falsear el modo bajo prueba.
function setMode(target) {
  const o = document.getElementById('sankey-mode-btn'), p = document.getElementById('sankey-psm-btn');
  const cur = o.classList.contains('on') ? 'origen' : p.classList.contains('on') ? 'psm' : 'normal';
  if (cur === target) return;
  click(target === 'normal' ? (cur === 'origen' ? o : p) : (target === 'origen' ? o : p));
}
const deselectDiag = (root, diag) => click([...root.querySelectorAll('#diag-filter .filter-btn')].find((b) => b.dataset.diag === diag));
// `activeDiags` es estado de MÓDULO y solo se reinicia cuando cambia la firma de los datos,
// así que varios tests con el mismo fixture heredarían el filtro del anterior. Se normaliza
// leyendo la píldora, que desde el arreglo de sincronía sí refleja el estado real.
const allDiagsOn = (root) => root.querySelectorAll('#diag-filter .filter-btn').forEach((b) => { if (!b.classList.contains('on')) click(b); });

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'biomolecular';
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div'); document.body.appendChild(root);
  Object.keys(REC).forEach((k) => delete REC[k]);
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

/* ─────────────────────────────────────────────────────────────────────────────
   El filtro global de diagnóstico manda sobre la pestaña propia de cada gráfico.
   Fixture: IHHNV medido en todas las filas y WSSV —el siguiente de DIAGS, o sea
   el sustituto al que se cae— SIN una sola medición. Así "respetar el filtro" y
   "ignorarlo" no pueden dar el mismo dibujo: si se respeta, no queda nada que
   pintar; si se ignora, se siguen viendo los nodos de IHHNV.
   ───────────────────────────────────────────────────────────────────────────── */
function soloIHHNV() {
  return [
    B({ Fecha: '01/06/2026', 'Código': 'L1', Lugar: 'Sala A', Piscina: 'P1', Tanque: 'T1', IHHNV: 'Positivo', ...VACIOS }),
    B({ Fecha: '02/06/2026', 'Código': 'L1', Lugar: 'Sala A', Piscina: 'P1', Tanque: 'T1', IHHNV: 'Negativo', ...VACIOS }),
    B({ Fecha: '03/06/2026', 'Código': 'L1', Lugar: 'Módulo 1', 'Precría': 'PC1', Tanque: 'T2', IHHNV: 'Positivo', ...VACIOS }),
    B({ Fecha: '04/06/2026', 'Código': 'L1', Lugar: 'Módulo 1', 'Precría': 'PC1', Tanque: 'T2', IHHNV: 'Negativo', ...VACIOS }),
  ];
}

describe('Biomolecular · el filtro global de diagnóstico manda sobre la pestaña del gráfico', () => {
  it('Sankey NORMAL: al deseleccionar el diagnóstico deja de dibujarlo', () => {
    store.globalData = soloIHHNV();
    biomolecularView(root);
    allDiagsOn(root);
    setMode('normal');
    expect(texts('#sankey').some((t) => t.startsWith('IHHNV'))).toBe(true);   // punto de partida

    deselectDiag(root, 'IHHNV');
    // Cae a WSSV (el primer diagnóstico que sigue activo), que no tiene mediciones.
    expect(texts('#sankey').some((t) => t.startsWith('IHHNV'))).toBe(false);
    expect(texts('#sankey')).toContain('Lugar');                              // el eje sigue ahí
  });

  it('Sankey ORIGEN: al deseleccionar el diagnóstico se queda sin trazabilidad', () => {
    store.globalData = soloIHHNV();
    biomolecularView(root);
    allDiagsOn(root);
    setMode('origen');
    expect(texts('#sankey')).toContain('Sala A');

    deselectDiag(root, 'IHHNV');
    expect(texts('#sankey')).toEqual(['Sin datos de trazabilidad para el diagnóstico']);
  });

  it('Sankey PSM: al deseleccionar el diagnóstico se queda sin Salas/Módulos', () => {
    store.globalData = soloIHHNV();
    biomolecularView(root);
    allDiagsOn(root);
    setMode('psm');
    expect(texts('#sankey')).toContain('Sala A');

    deselectDiag(root, 'IHHNV');
    expect(texts('#sankey')).toEqual(['Sin datos de Salas/Módulos (Lugares deben iniciar con "Sala" o "Módulo")']);
  });

  it('TREEMAP: al deseleccionar el diagnóstico de su pestaña deja de medir con él', () => {
    store.globalData = soloIHHNV();
    biomolecularView(root);
    allDiagsOn(root);
    // Fija la pestaña del treemap en IHHNV (por defecto está en "Todos").
    click([...root.querySelectorAll('#treemap-diag-tabs .tab')].find((b) => b.dataset.diag === 'IHHNV'));
    expect(texts('#treemap')).not.toContain('Sin muestras evaluadas');

    deselectDiag(root, 'IHHNV');
    expect(texts('#treemap')).toContain('Sin muestras evaluadas');
  });
});

describe('Biomolecular · la píldora de diagnóstico dice la verdad tras un refresco silencioso', () => {
  it('un re-render con los mismos datos no vuelve a encender una píldora apagada', () => {
    store.globalData = soloIHHNV();
    biomolecularView(root);
    allDiagsOn(root);
    setMode('origen');

    deselectDiag(root, 'IHHNV');
    const pill = () => [...root.querySelectorAll('#diag-filter .filter-btn')].find((b) => b.dataset.diag === 'IHHNV');
    expect(pill().classList.contains('on')).toBe(false);
    expect(texts('#sankey')).toEqual(['Sin datos de trazabilidad para el diagnóstico']);

    // Refresco silencioso: MISMOS datos → misma firma → initFilters(reset=false) conserva
    // `activeDiags`, pero shellHTML() re-crea las píldoras encendidas.
    biomolecularView(root);

    // La píldora debe seguir apagada, porque el filtro sigue apagado: si mintiera, pulsarla
    // para "apagarla" la encendería y el usuario no vería cambiar nada.
    expect(pill().classList.contains('on')).toBe(false);
    expect(texts('#sankey')).toEqual(['Sin datos de trazabilidad para el diagnóstico']);

    // Y un solo click la vuelve a encender de verdad, en el mismo sentido que muestra.
    click(pill());
    expect(pill().classList.contains('on')).toBe(true);
    expect(texts('#sankey')).toContain('Sala A');
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Las supresiones del Sankey están separadas por modo (prefijo `psm:`). El vacío
   de cada modo debe mirar SOLO las suyas.
   ───────────────────────────────────────────────────────────────────────────── */
describe('Biomolecular · el vacío del Sankey solo acusa las supresiones de su propio modo', () => {
  it('ocultar en PSM no hace que ORIGEN culpe al usuario de un vacío por falta de datos', () => {
    // Salas y módulos SIN código: ORIGEN exige código, así que está vacío por datos; PSM no.
    store.globalData = [
      B({ Fecha: '01/06/2026', 'Código': '', Lugar: 'Sala A', Piscina: 'P1', Tanque: 'T1', IHHNV: 'Positivo', ...VACIOS }),
      B({ Fecha: '02/06/2026', 'Código': '', Lugar: 'Módulo 1', 'Precría': 'PC1', Tanque: 'T2', IHHNV: 'Negativo', ...VACIOS }),
    ];
    biomolecularView(root);
    setMode('psm');

    // Oculta la Piscina pulsando su nodo: la supresión se guarda con prefijo `psm:`.
    const piscina = rects('#sankey').find((n) => n.attrs.fill === '#0ea5e9');
    expect(piscina).toBeTruthy();
    piscina.events.click();

    const reset = document.getElementById('sankey-reset-btn');
    expect(reset.style.display).toBe('');            // en PSM sí hay algo que restaurar
    expect(reset.textContent).toContain('(1)');

    setMode('origen');
    // En ORIGEN no hay NADA oculto: el mensaje debe ser el de falta de datos, y el botón
    // Restaurar —que se calcula por modo— sigue escondido. Decir "pulsa Restaurar" mandaría
    // al usuario a un botón inexistente.
    expect(texts('#sankey')).toEqual(['Sin datos de trazabilidad para el diagnóstico']);
    expect(reset.style.display).toBe('none');
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   PSM · el nodo de resultado de Sala debe cuadrar con las cintas que emite.
   ───────────────────────────────────────────────────────────────────────────── */
describe('Biomolecular · PSM materializa el flujo que no continúa a ningún módulo', () => {
  // L2 se analiza en Sala pero NUNCA llega a un módulo: sin cinta gris, sus 3 muestras
  // desaparecían del diagrama aunque el nodo "Negativo" siguiera midiéndolas.
  function conFuga() {
    const r = [];
    const add = (f, cod, lugar, extra, v) => r.push(B({ Fecha: f, 'Código': cod, Lugar: lugar, Tanque: 'T', IHHNV: v, ...VACIOS, ...extra }));
    add('01/06/2026', 'L1', 'Sala A', { Piscina: 'P1' }, 'Positivo');
    add('02/06/2026', 'L1', 'Sala A', { Piscina: 'P1' }, 'Positivo');
    add('03/06/2026', 'L1', 'Sala A', { Piscina: 'P1' }, 'Negativo');
    add('04/06/2026', 'L2', 'Sala B', { Piscina: 'P2' }, 'Negativo');
    add('05/06/2026', 'L2', 'Sala B', { Piscina: 'P2' }, 'Negativo');
    add('06/06/2026', 'L2', 'Sala A', { Piscina: 'P1' }, 'Negativo');
    add('07/06/2026', 'L1', 'Módulo 1', { 'Precría': 'PC1' }, 'Positivo');
    add('08/06/2026', 'L1', 'Módulo 1', { 'Precría': 'PC1' }, 'Negativo');
    add('09/06/2026', 'L1', 'Módulo 1', { 'Precría': 'PC1' }, 'Negativo');
    add('10/06/2026', 'L1', 'Módulo 1', { 'Precría': 'PC1' }, 'Negativo');
    add('11/06/2026', 'L1', 'Módulo 2', { 'Precría': 'PC2' }, 'Positivo');
    add('12/06/2026', 'L1', 'Módulo 2', { 'Precría': 'PC2' }, 'Positivo');
    return r;
  }

  it('dibuja el nodo "Sin módulo" y el nodo de resultado emite tanta cinta como mide', () => {
    store.globalData = conFuga();
    biomolecularView(root);
    setMode('psm');

    expect(texts('#sankey')).toContain('Sin módulo');
    const gris = rects('#sankey').find((n) => n.attrs.fill === '#64748b');
    expect(gris).toBeTruthy();

    // Sala mide 2 Positivo (L1) y 4 Negativo (L1×1 + L2×3). Solo L1 llega a módulos, así que
    // lo que NO continúa es exactamente el L2: 3 muestras, todas Negativo. El nodo "Negativo"
    // de Sala mide 4, luego el gris debe medir 3/4 de su altura — la proporción sale de los
    // datos, no de la escala, así que discrimina cualquier otro reparto.
    const verde = rects('#sankey').find((n) => n.attrs.fill === '#22c55e');
    expect(gris.attrs.height / verde.attrs.height).toBeCloseTo(3 / 4, 6);

    // Y la fuga se calcula POR RESULTADO, no en bloque: el Positivo continúa entero (L1), así
    // que solo debe salir UNA cinta gris, la del Negativo. Con un cálculo global saldrían dos.
    const grises = links('#sankey').filter((p) => p.attrs.stroke === 'rgba(100,116,139,.32)');
    expect(grises.length).toBe(1);
  });

  it('sin fuga no inventa el nodo: todo lote de Sala que llega a módulo deja el diagrama limpio', () => {
    store.globalData = conFuga().filter((r) => r['Código'] !== 'L2');
    biomolecularView(root);
    setMode('psm');
    expect(texts('#sankey')).not.toContain('Sin módulo');
    expect(rects('#sankey').some((n) => n.attrs.fill === '#64748b')).toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Registro Detallado y su Excel: fecha descendente, no orden de hoja.
   ───────────────────────────────────────────────────────────────────────────── */
describe('Biomolecular · el Registro Detallado y su Excel salen por fecha descendente', () => {
  // Orden de hoja deliberadamente revuelto y DISTINTO tanto del ascendente como del
  // descendente, para que ninguno de los tres pueda confundirse con otro.
  const revuelto = () => [
    B({ Fecha: '20/06/2026', 'Código': 'L1', Lugar: 'Sala A', Tanque: 'T1', IHHNV: 'Positivo', ...VACIOS }),
    B({ Fecha: '02/06/2026', 'Código': 'L2', Lugar: 'Sala A', Tanque: 'T2', IHHNV: 'Negativo', ...VACIOS }),
    B({ Fecha: '11/06/2026', 'Código': 'L3', Lugar: 'Módulo 1', Tanque: 'T3', IHHNV: 'Positivo', ...VACIOS }),
    B({ Fecha: '05/06/2026', 'Código': 'L4', Lugar: 'Módulo 1', Tanque: 'T4', IHHNV: 'Negativo', ...VACIOS }),
  ];

  it('la tabla ordena por fecha descendente', () => {
    store.globalData = revuelto();
    biomolecularView(root);
    const fechas = [...document.querySelectorAll('#table-body tr')].map((tr) => tr.children[0].textContent);
    expect(fechas).toEqual(['20/06/26', '11/06/26', '05/06/26', '02/06/26']);
  });

  it('la fila sigue casando con su fecha (no se ordenó solo la columna)', () => {
    store.globalData = revuelto();
    biomolecularView(root);
    const filas = [...document.querySelectorAll('#table-body tr')].map((tr) => [...tr.children].map((td) => td.textContent));
    // Cada código viaja con su fecha: L1↔20/06, L3↔11/06, L4↔05/06, L2↔02/06.
    expect(filas.map((f) => [f[0], f[1]])).toEqual([['20/06/26', 'L1'], ['11/06/26', 'L3'], ['05/06/26', 'L4'], ['02/06/26', 'L2']]);
  });

  it('el Excel exportado hereda el mismo orden', () => {
    const aoas = [];
    window.XLSX = {
      utils: { aoa_to_sheet: (aoa) => { aoas.push(aoa); return {}; }, book_new: () => ({}), book_append_sheet: () => {} },
      writeFile: () => {},
    };
    store.globalData = revuelto();
    biomolecularView(root);
    click(document.getElementById('export-xlsx-btn'));
    click(document.getElementById('bm-export-go'));
    delete window.XLSX;

    expect(aoas.length).toBeGreaterThan(0);
    const filas = aoas[0].slice(1); // sin cabecera
    expect(filas.map((f) => f[0])).toEqual(['20/06/2026', '11/06/2026', '05/06/2026', '02/06/2026']);
  });
});
