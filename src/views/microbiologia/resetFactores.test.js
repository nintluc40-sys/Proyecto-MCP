// @vitest-environment happy-dom
// Auditoría de cierre · Microbiología · editor «⚙️ Rangos» de Bacteriología.
// El modal está SCOPEADO a un área (desplegable + tabla por área) y `saveMicFactors`
// se toma el trabajo explícito de preservar el Factor (×) que la APP DE CAPTURA escribe
// bajo la MISMA clave `larv4_mic_factors` («evita pérdida silenciosa», dice el comentario).
// `resetMicFactors`, seis líneas más abajo, hacía `removeItem` de la clave ENTERA.
// Medido antes de corregir, con el editor abierto en «larv-animal» (área SIN overrides):
//   ANTES  : {"larv-agua":{"vtot":{"f":25,"l":5000},"vamar":{"f":25}},"mad-reprod":{"vtot":{"f":10}}}
//   DESPUÉS: null
// Es decir: restablecer un área que no tenía nada que restablecer borraba los umbrales de
// OTRA área y todos los Factores (×) de la app de captura.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const KEY = 'larv4_mic_factors';
const M = (o) => ({ _SheetOrigin: 'Microbiología', ...o });

// Estado tal como lo deja la app de captura: Factor (×) en dos áreas + un umbral propio.
const PREVIO = {
  'larv-agua': { vtot: { f: 25, l: 5000 }, vamar: { f: 25 } },
  'mad-reprod': { vtot: { f: 10 } },
};

let root, errSpy, ls;
beforeEach(() => {
  ls = {};
  globalThis.localStorage = {
    getItem: (k) => (k in ls ? ls[k] : null),
    setItem: (k, v) => { ls[k] = String(v); },
    removeItem: (k) => { delete ls[k]; },
  };
  localStorage.setItem(KEY, JSON.stringify(PREVIO));
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  store.globalData = [
    M({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'Módulo/Sala': '1', 'TQ/N°': '1', 'V.Totales UFC': '9000' }),
  ];
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); delete globalThis.localStorage; });

/** Abre el editor de rangos en `area` y pulsa «Restablecer». Devuelve la clave resultante. */
function restablecer(area) {
  microbiologiaView(root);
  const bact = root.querySelector('[data-mic-sub="bacteriologia"]');
  if (bact && !bact.classList.contains('is-active')) bact.click();
  root.querySelector('[data-mic-factors]').click();
  if (area) {
    const sel = root.querySelector('[data-mic-fact-area]');
    sel.value = area;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  root.querySelector('[data-mic-fact-reset]').click();
  const raw = localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe('Bacteriología · «Restablecer» rangos es POR ÁREA', () => {
  it('restablecer un área sin overrides no toca nada de las demás', () => {
    expect(restablecer('larv-animal')).toEqual(PREVIO);
  });

  it('restablecer un área descarta sus umbrales pero CONSERVA el Factor (×) de la app de captura', () => {
    const out = restablecer('larv-agua');
    expect(out['larv-agua'].vtot).toEqual({ f: 25 }); // se fue el l:5000, sobrevive el f:25
    expect(out['larv-agua'].vamar).toEqual({ f: 25 });
  });

  it('restablecer un área no arrastra a las otras áreas', () => {
    const out = restablecer('larv-agua');
    expect(out['mad-reprod']).toEqual({ vtot: { f: 10 } });
  });

  it('si no queda nada que conservar, la clave sí se elimina', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'larv-agua': { vtot: { l: 5000 } } }));
    expect(restablecer('larv-agua')).toBeNull();
  });
});
