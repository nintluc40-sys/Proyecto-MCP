// @vitest-environment happy-dom
// Regresiones de la auditoría adversarial 2026-07-17 de la vista Microbiología.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const makeChartSpy = vi.fn(() => null);
vi.mock('../../core/charts.js', () => ({
  makeChart: (...a) => makeChartSpy(...a),
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { fmtShort, parseAnyDate } from '../../core/dates.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function change(el, value) { if (el) { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); } }

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'microbiologia';
  document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root);
  makeChartSpy.mockClear();
});
afterEach(() => { store.globalData = []; });

describe('Microbiología · regresiones adversariales', () => {
  // D1 · El apartado Ensayo desaparece por un cambio de filtro → el Analizador debe
  // renderizarse Y dibujar su gráfico (el dispatch post-render usaba un calApartado obsoleto).
  it('D1 · tras perder el apartado Ensayo, el gráfico del Analizador SÍ se dibuja', () => {
    store.globalData = [
      { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', 'TQ/N°': '1', pH: '8.0', Alcalinidad: '130' },
      { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '06/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', 'TQ/N°': '1', pH: '8.2', Alcalinidad: '128' },
      { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '07/06/2026', Corrida: '573', Departamento: 'Maduración', Formato: 'Maduración · Ensayo', Sala: 'Sala A', 'TQ/N°': '5', 'S‰ antes': '30', 'S‰ después': '33', 'Calcio antes': '380', 'Calcio después': '420' },
    ];
    microbiologiaView(root);
    click(root.querySelector('[data-mic-sub="calidad"]'));
    click(root.querySelector('[data-cal-ap="ensayo"]'));
    expect(root.querySelector('#calEnsayoChart')).toBeTruthy();

    makeChartSpy.mockClear();
    change(root.querySelector('[data-calfilter="calDepto"]'), 'Larvicultura'); // quita las parejas de Ensayo

    expect(root.querySelector('[data-cal-ap="ensayo"]')).toBeFalsy();
    expect(root.querySelector('#calTrendChart')).toBeTruthy();
    expect(makeChartSpy.mock.calls.some((c) => c[0] === 'calTrendChart')).toBe(true);
  });

  // D2 · Las tablas "por fecha" (modal de KPI · Cumplimiento) reconstruyen el día desde
  // un bucket entero; la fecha mostrada debe coincidir con la fecha real de la muestra
  // (sin desfase de un día en husos negativos). Comprobación correct-by-construction.
  it('D2 · la fecha "por día" del modal de Cumplimiento coincide con la fecha real', () => {
    store.globalData = [
      { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', 'TQ/N°': '1', pH: '8.0', Alcalinidad: '130' },
    ];
    microbiologiaView(root);
    click(root.querySelector('[data-mic-sub="calidad"]'));
    click(root.querySelector('[data-cal-kpi="cumplimiento"]'));
    const body = root.querySelector('#calKpiBody');
    expect(body).toBeTruthy();
    const expected = fmtShort(parseAnyDate('05/06/2026')); // "05 jun 26"
    expect(body.textContent).toContain(expected);
  });
});

// Cambio 2026-07-20: el departamento Algas estrena factores (colonias ×5, Pseudomonas/
// Aeromonas/B.totales ×20) y umbrales escalados. Como el editor de rangos persiste una
// copia COMPLETA de la base, sin migración los valores viejos quedarían congelados.
describe('migración de factores · área Algas', () => {
  it('descarta los overrides antiguos de "algas" y conserva los ajustes de otras áreas', async () => {
    // El entorno de test no trae localStorage: se instala un doble en memoria.
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
      clear: () => mem.clear(),
    };
    localStorage.setItem('larv4_mic_factors', JSON.stringify({
      algas: { vamar: { f: 1, l: 1, m: 2, e: 10 }, pseudo: { f: 1, l: 1, m: 2, e: 10 } },
      'larv-animal': { vamar: { l: 999 } }, // ajuste deliberado del usuario en otra área
    }));
    vi.resetModules();
    const mod = await import('./data.js');
    const thr = mod.loadMicThresholds();
    // Algas vuelve a los NUEVOS valores base (umbrales escalados por el factor).
    expect(thr.algas.vamar.l).toBe(5);
    expect(thr.algas.pseudo.l).toBe(20);
    expect(thr.algas.btot.e).toBe(10000);
    // Lo que el usuario ajustó en otra área NO se toca.
    expect(thr['larv-animal'].vamar.l).toBe(999);
    // El override obsoleto desaparece del almacenamiento y queda marcada la versión.
    expect(JSON.parse(localStorage.getItem('larv4_mic_factors')).algas).toBeUndefined();
    // El sello pasó de ser UNA cadena a la LISTA de migraciones aplicadas, para que añadir
    // una nueva no vuelva a disparar ésta sobre ajustes que el usuario ya haya rehecho.
    expect(JSON.parse(localStorage.getItem('larv4_mic_factors_ver'))).toContain('2026-07-20-algas');
  });
});

describe('migración de factores · el área «mad-agua» pasó a llamarse «mad-despacho»', () => {
  // El área que se llamaba 'mad-agua' gobernaba en realidad «Maduración · Despacho» (medido:
  // 452 filas, frente a 24 de Maduración · Agua, que iban por 'larv-agua'). Al separarlas, un
  // override guardado con el nombre viejo se ajustó pensando en Despacho: tiene que MOVERSE
  // con él, no quedarse aplicándose a otro formato.
  const instalarLS = () => {
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
      clear: () => mem.clear(),
    };
    return mem;
  };

  it('mueve el override viejo a «mad-despacho», que es a quien afectaba', async () => {
    instalarLS();
    localStorage.setItem('larv4_mic_factors', JSON.stringify({
      'mad-agua': { vamar: { l: 7 } },
      'larv-animal': { vamar: { l: 999 } },
    }));
    vi.resetModules();
    const thr = (await import('./data.js')).loadMicThresholds();
    expect(thr['mad-despacho'].vamar.l).toBe(7);       // sigue rigiendo las muestras de Despacho
    expect(thr['mad-agua'].vamar.l).toBe(1000);        // Maduración · Agua queda en su base
    expect(thr['larv-animal'].vamar.l).toBe(999);      // lo ajustado en otra área no se toca
    const guardado = JSON.parse(localStorage.getItem('larv4_mic_factors'));
    expect(guardado['mad-agua']).toBeUndefined();
    expect(guardado['mad-despacho']).toEqual({ vamar: { l: 7 } });
  });

  it('no vuelve a correr si ya se aplicó (un ajuste NUEVO de Maduración · Agua se respeta)', async () => {
    instalarLS();
    localStorage.setItem('larv4_mic_factors_ver', JSON.stringify(['2026-07-20-algas', '2026-08-16-mad-despacho']));
    localStorage.setItem('larv4_mic_factors', JSON.stringify({ 'mad-agua': { vamar: { l: 42 } } }));
    vi.resetModules();
    const thr = (await import('./data.js')).loadMicThresholds();
    expect(thr['mad-agua'].vamar.l).toBe(42);          // se queda donde el usuario lo puso
    expect(thr['mad-despacho'].vamar.l).toBe(100);     // base, sin contaminar
  });

  it('el sello ANTIGUO (una sola cadena) no impide aplicar la migración nueva', async () => {
    instalarLS();
    localStorage.setItem('larv4_mic_factors_ver', '2026-07-20-algas'); // formato viejo, sin JSON
    localStorage.setItem('larv4_mic_factors', JSON.stringify({
      'mad-agua': { vamar: { l: 7 } },
      algas: { vamar: { l: 1 } }, // ya migrada: NO debe volver a borrarse por sorpresa
    }));
    vi.resetModules();
    const thr = (await import('./data.js')).loadMicThresholds();
    expect(thr['mad-despacho'].vamar.l).toBe(7);   // la nueva SÍ corre
    expect(thr.algas.vamar.l).toBe(1);             // la vieja NO se repite
  });
});
