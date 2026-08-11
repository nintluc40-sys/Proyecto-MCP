// @vitest-environment happy-dom
// Regresión del jitter del swarm. Necesita un `scaleBand` FUNCIONAL: con el stub de D3 en
// agujero negro `bandwidth()` vale 0 y todas las coordenadas salen 0, así que no se puede
// distinguir un jitter estable de uno que salta ni de uno inexistente.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// scaleBand mínimo pero REAL: lo justo para que bandwidth() no sea 0.
function scaleBand() {
  let dom = [], rng = [0, 1], pad = 0;
  const step = () => (rng[1] - rng[0]) / (dom.length || 1);
  const f = (v) => rng[0] + dom.indexOf(v) * step() + (step() * pad) / 2;
  f.domain = (d) => (d === undefined ? dom : ((dom = d), f));
  f.range = (r) => (r === undefined ? rng : ((rng = r), f));
  f.padding = (p) => ((pad = p), f);
  f.bandwidth = () => step() * (1 - pad);
  return f;
}

globalThis.window.d3 = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === 'select') return (s) => (s === '#swarm' ? recSel(null) : blackhole);
    if (prop === 'scaleBand') return scaleBand;
    return Reflect.get(blackhole, prop);
  },
  apply: () => blackhole,
});
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

import { store } from '../../core/store.js';
import { biomolecularView } from './index.js';

const B = (o) => ({ _SheetOrigin: 'Biomol', ...o });
const VACIOS = { WSSV: '', BP: '', 'AHPND/EMS': '', NHPB: '', EHP: '' };
const click = (el) => { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const circles = () => REC.nodes.filter((n) => n.tag === 'circle');
// Todas las muestras el MISMO día y en el MISMO lugar: es cuando el jitter actúa.
const mismoDia = (n) => Array.from({ length: n }, (_, i) => B({
  Fecha: '05/06/2026', 'Código': 'L' + i, Lugar: 'Sala A', Tanque: 'T' + i,
  IHHNV: i % 2 ? 'Positivo' : 'Negativo', ...VACIOS,
}));
const abrirSwarm = (root) => click(root.querySelector('#swarm-date-tabs .tab'));

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'biomolecular';
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div'); document.body.appendChild(root);
  REC.nodes.length = 0;
});
afterEach(() => { store.globalData = []; vi.restoreAllMocks(); });

describe('Biomolecular · el swarm no mueve los puntos entre repintados', () => {
  it('tocar un filtro ajeno no reposiciona ningún punto', () => {
    store.globalData = mismoDia(6);
    biomolecularView(root);
    abrirSwarm(root);
    const antes = circles().map((c) => c.attrs.cy);
    expect(antes.length).toBe(6);

    // EHP no tiene una sola medición en el fixture: el swarm no cambia de contenido, solo se
    // vuelve a dibujar. Antes, ese redibujado bastaba para mover los puntos hasta 24 px.
    click([...root.querySelectorAll('#diag-filter .filter-btn')].find((b) => b.dataset.diag === 'EHP'));
    expect(circles().map((c) => c.attrs.cy)).toEqual(antes);
  });

  it('un refresco silencioso con los mismos datos deja cada punto en su sitio', () => {
    store.globalData = mismoDia(6);
    biomolecularView(root);
    abrirSwarm(root);
    const antes = circles().map((c) => c.attrs.cy);

    biomolecularView(root);   // re-render completo: RAW se reconstruye desde el store
    abrirSwarm(root);
    expect(circles().map((c) => c.attrs.cy)).toEqual(antes);
  });

  it('pero SIGUE separando los puntos que comparten X al desbordar el ancho', () => {
    // La X avanza 12 px por muestra hasta toparse en `W - 12`: a partir de ahí se apilan y el
    // desplazamiento vertical es lo único que los distingue. Sin esta comprobación, un jitter
    // eliminado del todo (constante) pasaría los dos tests de estabilidad de arriba.
    store.globalData = mismoDia(40);
    biomolecularView(root);
    abrirSwarm(root);
    const pts = circles();
    const xTope = Math.max(...pts.map((c) => c.attrs.cx));
    const apilados = pts.filter((c) => c.attrs.cx === xTope);
    expect(apilados.length).toBeGreaterThan(1);                       // el apilamiento existe
    expect(new Set(apilados.map((c) => c.attrs.cy)).size).toBe(apilados.length); // y están separados
  });
});
