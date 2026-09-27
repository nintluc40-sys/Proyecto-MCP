// @vitest-environment happy-dom
/* ============================================================
   BIOLOGÍA MOLECULAR · el TIPO DE MUESTRA (tejido) · 2026-09-26, usuario

   Matriz tejido × diagnóstico (el % de positivos de cada cruce, con su n) y franja semanal (muestras y positivas por
   tipo y semana). El tipo sale de «Otros»: Heces, Branquias, Pleópodo («Pleopodos» y «Pleópodo» son lo mismo), Agua e
   Hisopado; los alimentos y las algas que también van en «Otros» NO son un tejido. Sigue los filtros de la vista.
   El dibujo se comprueba con un D3 que GRABA lo que se pinta (como swarm.test.js). Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tipoDeMuestra, matrizTejidos, franjaTejidos, lunesDe, TIPOS_MUESTRA } from './tejidos.js';

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
const REC = { nodes: [] };
function recSel(node) {
  const api = {
    append(tag) { const c = { tag, attrs: {}, text: null }; REC.nodes.push(c); return recSel(c); },
    attr(k, v) { if (node) node.attrs[k] = v; return api; },
    text(t) { if (node) node.text = t; return api; },
    style() { return api; }, on() { return api; },
    selectAll() { return { remove() { REC.nodes.length = 0; }, each() {}, attr() { return this; } }; },
    node() { return null; }, remove() { return api; }, datum() { return api; }, call() { return api; },
  };
  return api;
}
globalThis.window.d3 = new Proxy(function () {}, {
  get: (_t, prop) => (prop === 'select' ? (s) => (s === '#tejidos' ? recSel(null) : blackhole) : Reflect.get(blackhole, prop)),
  apply: () => blackhole,
});
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const { store } = await import('../../core/store.js');
const { biomolecularView } = await import('./index.js');

const DX = ['IHHNV', 'WSSV', 'BP', 'EHP'];
const F = (f, otros, res = {}) => ({ f, otros, ...res });

describe('Biomol · el tipo de muestra', () => {
  it('🔴 sale de «Otros» por su principio, sin tildes ni mayúsculas; los alimentos y las algas no son tejido', () => {
    expect(['Heces', 'BRANQUIAS', 'Branquia', 'Pleopodos', 'Pleópodo', 'Agua', 'Hisopado', 'Hisopados'].map(tipoDeMuestra))
      .toEqual(['heces', 'branquias', 'branquias', 'pleopodo', 'pleopodo', 'agua', 'hisopado', 'hisopado']);
    expect(['Calamar (Funda en uso)', 'Alimento-Poliqueto', 'Thalassiosira Br 1 (3d)', 'Aguacate', '', null].map(tipoDeMuestra))
      .toEqual(['', '', '', '', '', '']);
    expect(TIPOS_MUESTRA.map((t) => t.etiqueta)).toEqual(['Heces', 'Branquias', 'Pleópodo', 'Agua', 'Hisopado']);
  });

  it('🔴 la matriz: por tipo y diagnóstico, analizadas, positivos y %; sin analizar, null', () => {
    const M = matrizTejidos([
      F('2026-09-18', 'Heces', { BP: 'Positivo', EHP: 'Positivo' }), F('2026-09-18', 'Heces', { BP: 'Negativo', EHP: 'Positivo' }),
      F('2026-09-23', 'Pleopodos', { IHHNV: 'Positivo', WSSV: 'Negativo' }), F('2026-09-24', 'Pleópodo', { IHHNV: 'Negativo', WSSV: 'Negativo' }),
      F('2026-09-23', 'Calamar (Funda en uso)', { IHHNV: 'Positivo' }),
    ], DX);
    const tipo = (k) => M.find((t) => t.clave === k);
    expect(tipo('heces').muestras).toBe(2);
    expect(tipo('heces').celdas.find((c) => c.diag === 'BP')).toEqual({ diag: 'BP', analizadas: 2, positivos: 1, pct: 50 });
    expect(tipo('heces').celdas.find((c) => c.diag === 'IHHNV')).toEqual({ diag: 'IHHNV', analizadas: 0, positivos: 0, pct: null });
    expect(tipo('pleopodo').celdas.find((c) => c.diag === 'IHHNV'), 'las dos grafías, juntas').toEqual({ diag: 'IHHNV', analizadas: 2, positivos: 1, pct: 50 });
    expect(M.reduce((a, t) => a + t.muestras, 0), 'el alimento no cuenta').toBe(4);
    expect(tipo('agua').muestras).toBe(0);
  });

  it('🔴 la franja: semanas continuas (lunes), muestras y positivas a ALGUNO de los diagnósticos activos', () => {
    const filas = [F('2026-09-02', 'Branquias', { IHHNV: 'Negativo' }), F('2026-09-18', 'Heces', { BP: 'Positivo' }), F('2026-09-19', 'Heces', { BP: 'Negativo' })];
    const S = franjaTejidos(filas, DX);
    expect(S.semanas).toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
    const heces = S.filas.find((f) => f.clave === 'heces').porSemana;
    expect(heces[2]).toEqual({ muestras: 2, positivas: 1 });
    expect(franjaTejidos(filas, ['IHHNV']).filas.find((f) => f.clave === 'heces').porSemana[2], 'con BP apagado, ese positivo no cuenta').toEqual({ muestras: 2, positivas: 0 });
    expect(franjaTejidos(filas, DX, 2).semanas, 'como mucho las últimas `tope`').toEqual(['2026-09-07', '2026-09-14']);
    expect(franjaTejidos([F('2026-09-02', 'Calamar')], DX).semanas).toEqual([]);
    expect(lunesDe('2026-09-20')).toBe('2026-09-14');
  });
});

/* La vista: 3 heces (Sala 4) y 2 branquias (Chongón), más un alimento que no debe contar. */
const B = (o) => ({ _SheetOrigin: 'Biomol', 'Estadío': 'Reproductores', Piscina: 'P556', Sexo: 'Hembra', ...o });
const VIS = [
  B({ Fecha: '18/09/2026', Lugar: 'Sala 4', Otros: 'Heces', BP: 'Positivo', EHP: 'Positivo' }),
  B({ Fecha: '18/09/2026', Lugar: 'Sala 4', Otros: 'Heces', BP: 'Positivo', EHP: 'Negativo' }),
  B({ Fecha: '18/09/2026', Lugar: 'Sala 4', Otros: 'Heces', BP: 'Negativo', EHP: 'Negativo' }),
  B({ Fecha: '23/09/2026', Lugar: 'Chongón', Otros: 'Branquias', IHHNV: 'Positivo', WSSV: 'Negativo' }),
  B({ Fecha: '23/09/2026', Lugar: 'Chongón', Otros: 'Branquias', IHHNV: 'Negativo', WSSV: 'Negativo' }),
  B({ Fecha: '23/09/2026', Lugar: 'Maduración', Otros: 'Calamar (Funda en uso)', IHHNV: 'Negativo' }),
];
const nodos = (cls) => REC.nodes.filter((n) => n.attrs.class === cls);
let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'biomolecular';
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div'); document.body.appendChild(root);
  REC.nodes.length = 0;
  store.globalData = VIS;
  biomolecularView(root);
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

describe('Biomol · la tarjeta «Tipo de muestra»', () => {
  it('🔴 la tarjeta está, con su pantalla completa, y dice cuántas muestras de tejido hay', () => {
    expect(root.querySelector('#c-tejidos svg#tejidos')).not.toBeNull();
    expect(root.querySelector('#c-tejidos .fs-btn').dataset.target).toBe('c-tejidos');
    expect(root.querySelector('#tejidos-sub').textContent).toBe('5 muestras de tejido en lo filtrado');
  });

  it('🔴 la matriz pinta cada cruce con su % y su n, y los tipos sin muestras lo dicen', () => {
    const celda = (tipo, diag) => nodos('tj-celda').find((n) => n.attrs['data-tipo'] === tipo && n.attrs['data-diag'] === diag);
    expect(celda('heces', 'BP')).toBeTruthy();
    const textos = nodos('hm-val').map((n) => n.text);
    expect(textos).toContain('67% · 3');   // BP en heces: 2 de 3
    expect(textos).toContain('33% · 3');   // EHP en heces: 1 de 3
    expect(textos).toContain('50% · 2');   // IHHNV en branquias
    expect(nodos('tj-celda').filter((n) => n.attrs['data-tipo'] === 'agua')).toEqual([]);
    expect(nodos('tj-vacio').map((n) => n.text)).toEqual(['sin muestras aún', 'sin muestras aún', 'sin muestras aún']);   // pleópodo, agua, hisopado
  });

  it('🔴 la franja: una celda por tipo y semana con muestras, y cuántas salieron positivas', () => {
    const sem = nodos('tj-semana').map((n) => n.attrs['data-tipo'] + '@' + n.attrs['data-semana']);
    expect(sem).toEqual(['heces@2026-09-14', 'branquias@2026-09-21']);
    const textos = nodos('hm-val').map((n) => n.text);
    expect(textos).toContain('3 (2+)');
    expect(textos).toContain('2 (1+)');
  });

  it('🔴 sigue los filtros de la vista: sin el diagnóstico BP ni EHP, las heces se quedan sin nada analizado', () => {
    const boton = (d) => [...root.querySelectorAll('#diag-filter .filter-btn')].find((b) => b.dataset.diag === d);
    boton('BP').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    boton('EHP').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(nodos('tj-celda').some((n) => n.attrs['data-diag'] === 'BP')).toBe(false);
    expect(nodos('hm-val').map((n) => n.text)).toContain('2 (1+)');     // las branquias siguen
    expect(nodos('hm-val').map((n) => n.text)).toContain('3');          // las heces, sin positivos a lo activo
  });
});

describe('Biomol · la tarjeta «Tipo de muestra» sigue el filtro de lugar y tiene su estilo', () => {
  it('🔴 sin «Sala 4» en el filtro de lugar, las heces desaparecen', () => {
    const cb = root.querySelector('#lugar-check-list input[data-lugar="Sala 4"]');
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(root.querySelector('#tejidos-sub').textContent).toBe('2 muestras de tejido en lo filtrado');
    expect(nodos('tj-celda').some((n) => n.attrs['data-tipo'] === 'heces')).toBe(false);
  });

  it('🔑 su subtítulo tiene estilo en biomolecular.css', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/views/biomolecular/biomolecular.css', 'utf8')).toContain('.biomol .tj-sub {');
  });
});
