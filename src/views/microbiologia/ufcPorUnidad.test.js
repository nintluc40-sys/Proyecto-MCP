// @vitest-environment happy-dom
/* Punto 29 de la pauta del 24-11 (B5.2 de la revisión del 15-11; usuario 25-11: «Un total por unidad») · «Σ UFC total»
   (el KPI de Bacteriología y el resumen del día de la Placa) sumaba UFC/mL, UFC/g y UFC/placa en una sola cifra. Ahora
   da una suma POR UNIDAD, sólo de las unidades con datos y sin los agregados. Cifras INVENTADAS. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from '../../core/store.js';
import { ufcPorUnidad, pathogenRecords, AGGREGATE_KEYS } from './data.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', Corrida: '573', 'Módulo/Sala': '1', 'TQ/N°': '1', 'Fecha muestreo': '05/06/2026', ...o });
const es = (n) => n.toLocaleString('es-EC');
// El mismo día: agua (mL), animal (g) y superficie (placa); más un agregado que no entra.
const DIA = [
  M({ Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Agua', 'V.Amarillos UFC': '300', 'Bact.Totales UFC': '90000' }),
  M({ Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal', 'V.Amarillos UFC': '20', 'V.Verdes UFC': '5' }),
  M({ Formato: 'Hisopados', 'V.Verdes UFC': '7' }),
];

describe('ufcPorUnidad (pura)', () => {
  it('una suma por unidad, en orden mL · g · placa, sin los agregados', () => {
    expect(ufcPorUnidad(pathogenRecords(DIA), AGGREGATE_KEYS)).toEqual([
      { unidad: 'UFC/mL', ufc: 300 }, { unidad: 'UFC/g', ufc: 25 }, { unidad: 'UFC/placa', ufc: 7 },
    ]);
  });
  it('sólo las unidades con datos; sin nada, lista vacía', () => {
    expect(ufcPorUnidad(pathogenRecords([DIA[1]]), AGGREGATE_KEYS)).toEqual([{ unidad: 'UFC/g', ufc: 25 }]);
    expect(ufcPorUnidad([], AGGREGATE_KEYS)).toEqual([]);
    expect(ufcPorUnidad(null, AGGREGATE_KEYS)).toEqual([]);
  });
});

let root, errSpy;
beforeEach(() => {
  const s0 = {};
  globalThis.localStorage = { getItem: (k) => (k in s0 ? s0[k] : null), setItem: (k, v) => { s0[k] = String(v); }, removeItem: (k) => { delete s0[k]; } };
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); delete globalThis.localStorage; });

function abrir(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  root.querySelector('[data-mic-sub="bacteriologia"]').click();
  const cong = root.querySelector('[data-mic-ap="conglomerado"]');
  if (cong && !cong.classList.contains('is-active')) cong.click();
}
const lineas = (el) => [...el.querySelectorAll('.mic-ufc-u')].map((n) => n.textContent.trim());
const ESPERADO = [es(300) + ' UFC/mL', es(25) + ' UFC/g', es(7) + ' UFC/placa'];

describe('Bacteriología · «Σ UFC por unidad»', () => {
  it('🔴 el KPI da una línea por unidad, no la suma mezclada', () => {
    abrir(DIA);
    const k = [...root.querySelectorAll('.mic-kpis .mic-kpi')].find((n) => n.textContent.includes('Σ UFC por unidad'));
    expect(k).toBeTruthy();
    expect(lineas(k)).toEqual(ESPERADO);
    expect(k.textContent).not.toContain(es(332));   // 300 + 25 + 7: la cifra mezclada de antes
    expect(root.querySelector('.mic-kpis').textContent).not.toContain('Σ UFC total');
  });
  it('🔴 el resumen del día de la Placa dice lo mismo', () => {
    abrir(DIA);
    root.querySelector('[data-mic-ap="petri"]').click();
    root.querySelector('[data-mic-petab="placa"]').click();
    const st = [...root.querySelectorAll('.mic-pe-st')].find((n) => n.textContent.includes('Σ UFC por unidad'));
    expect(st).toBeTruthy();
    expect(lineas(st)).toEqual(ESPERADO);
  });
});
