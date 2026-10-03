// @vitest-environment happy-dom
/* ============================================================
   Microbiología · Bacteriología · auditoría del 2026-09-25, BLOQUE A (aprobado 2026-10-03)

   · H-002 · el KPI «Σ UFC total» de Bacteriología sumaba «Bact. Totales» (un conteo AGREGADO) y salía
     ×2,5–3,9 más alto que la Placa y que «Carga total por patógeno», que ya lo excluían con la MISMA
     constante (`AGGREGATE_KEYS`). Las tres cifras de «carga» tienen que decir lo mismo.
   · H-009 · la lista de alertas componía `'M' + modulo`: «MCIO» para CIO y «M—» para las filas de Sala.
     Usa `modSalaLabel`, la etiqueta que ya da `rowContext` (y la columna Módulo/Sala).
   · H-015 · el % de muestras «En alerta» con sus cotas en `config.js` (`THRESHOLDS.alertaMicro`).
   (H-016, la luminiscencia, está en data.test.js, junto a `luminPresence`.)
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { THRESHOLDS } from '../../config.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', Corrida: '573', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', ...o });
const es = (n) => n.toLocaleString('es-EC');

let root, errSpy;
beforeEach(() => {
  const s0 = {};
  globalThis.localStorage = {
    getItem: (k) => (k in s0 ? s0[k] : null),
    setItem: (k, v) => { s0[k] = String(v); },
    removeItem: (k) => { delete s0[k]; },
  };
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); delete globalThis.localStorage; });

function bacteriologia(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  root.querySelector('[data-mic-sub="bacteriologia"]').click();
  const cong = root.querySelector('[data-mic-ap="conglomerado"]');
  if (cong && !cong.classList.contains('is-active')) cong.click();
}
/** Valor del KPI de Bacteriología cuya etiqueta contiene `label`. */
function kpi(label) {
  const k = [...root.querySelectorAll('.mic-kpis .mic-kpi')].find((n) => n.querySelector('.mic-kpi-label').textContent.includes(label));
  return k ? k.querySelector('.mic-kpi-value').textContent.trim() : null;
}

describe('H-002 · Bacteriología · «Σ UFC total» no suma los conteos AGREGADOS', () => {
  // Dos específicos y los dos agregados: el total correcto es 150 y el inflado 10 300.
  const DIA = [M({
    'Fecha muestreo': '05/06/2026',
    'V.Amarillos UFC': '100', 'V.Verdes UFC': '50',   // específicos
    'V.Totales UFC': '150', 'Bact.Totales UFC': '10000', // agregados
  })];

  it('«Bact. Totales» queda fuera, igual que «C. Totales»', () => {
    bacteriologia(DIA);
    expect(kpi('Σ UFC total')).toBe(es(150));
    expect(kpi('Σ UFC total'), 'el valor inflado de antes (con Bact. Totales)').not.toBe(es(10150));
  });

  it('dice lo mismo que la Placa del mismo día (la misma constante)', () => {
    bacteriologia(DIA);
    const kpiBact = kpi('Σ UFC total');
    root.querySelector('[data-mic-ap="petri"]').click();
    root.querySelector('[data-mic-petab="placa"]').click();
    const st = [...root.querySelectorAll('.mic-pe-st')].find((n) => n.textContent.includes('Σ UFC total'));
    expect(st.querySelector('.mic-pe-st-v').textContent.trim()).toBe(kpiBact);
  });
});

describe('H-009 · la lista de alertas usa la etiqueta de Módulo/Sala, no «M» + módulo', () => {
  const ALERTAS = [
    M({ 'Fecha muestreo': '05/06/2026', 'Módulo/Sala': 'CIO', 'V.Amarillos UFC': '9000000' }),
    M({ 'Fecha muestreo': '05/06/2026', 'Módulo/Sala': '3', 'V.Amarillos UFC': '9000000' }),
    M({ 'Fecha muestreo': '05/06/2026', 'Módulo/Sala': 'Sala 2', Formato: 'Maduración · Despacho', 'V.Luminiscentes': 'Presencia' }),
  ];

  it('CIO sale «CIO», el 3 sale «M3» y una sala sale con su nombre (ni «MCIO» ni «M—»)', () => {
    bacteriologia(ALERTAS);
    root.querySelector('[data-mic-alerts]').click();
    const txt = root.querySelector('#micAlertModal').textContent;
    expect(txt).not.toContain('MCIO');
    expect(txt).not.toContain('M—');
    expect(txt).toContain('· CIO');
    expect(txt).toContain('· M3');
    expect(txt).toContain('· Sala 2');
  });
});

describe('H-015 · las cotas del % «En alerta» viven en config.js', () => {
  it('15 % Crítico y 5 % Fuera, como estaban escritas en la vista', () => {
    expect(THRESHOLDS.alertaMicro).toEqual({ critico: 15, fuera: 5 });
  });
});
