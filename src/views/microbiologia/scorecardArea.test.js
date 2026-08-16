// @vitest-environment happy-dom
// Auditoría de cierre · Microbiología · panorama General.
// El scorecard por área asignaba el área con DOS reglas distintas en la MISMA fila:
//   · Bacteriología (Muestras/Alerta) → `deptoOfFormato(ctx.formatoKey)`, que sí conoce Algas.
//   · Calidad de Agua (WQI/Cumplim.) → `genAreaOf(ctx.depto)`, que solo reconocía
//     'Larvicultura' y 'Maduración' y mandaba TODO lo demás a 'Otros'.
// Medido antes de corregir, con una muestra de agua de Algas con pH 4,0 (fuera de rango):
//   ÁREA          | Muestras | WQI  | Cumplim.
//   Larvicultura  | 1        | 100  | 100%
//   Algas         | 1        | —    | —      ← ciega a su propia agua
//   Otros         | —        | 0    | 0%     ← fila FANTASMA: 0 muestras, WQI catastrófico ajeno
// Es decir: el problema de agua de Algas se imputaba a un área sin ninguna muestra.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', ...o });
const A = (o) => ({ _SheetOrigin: 'Calidad de Agua', ...o });

let root, errSpy;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

/** Renderiza el panorama General y devuelve el scorecard como mapa área → celdas. */
function scorecard(rows) {
  store.globalData = rows;
  microbiologiaView(root);
  const gen = root.querySelector('[data-mic-sub="general"]');
  if (gen && !gen.classList.contains('is-active')) gen.click();
  const out = {};
  root.querySelectorAll('.gen-sc-row').forEach((r) => {
    const g = (s) => (r.querySelector(s)?.textContent || '').trim();
    out[g('.gen-sc-area')] = { n: g('.gen-sc-n'), alert: g('.gen-sc-alert'), wqi: g('.gen-sc-wqi'), cump: g('.gen-sc-cump') };
  });
  return out;
}

const BACT_LARV = M({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', 'V.Totales UFC': '1000' });
const BACT_ALGAS = M({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Algas', Formato: 'Algas Mensual', 'V.Totales UFC': '50' });
const AGUA_LARV_OK = A({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', 'TQ/N°': '1', pH: '8.0', Alcalinidad: '130' });
const AGUA_ALGAS_MAL = A({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Algas', Formato: 'Algas Mensual', 'Módulo': '9', 'TQ/N°': '9', pH: '4.0', Alcalinidad: '10' });

describe('General · scorecard: un área, UNA regla de agrupación', () => {
  it('el agua de Algas se reporta en la fila Algas, no en «Otros»', () => {
    const sc = scorecard([BACT_LARV, BACT_ALGAS, AGUA_LARV_OK, AGUA_ALGAS_MAL]);
    expect(sc.Algas).toBeDefined();
    expect(sc.Algas.wqi).toBe('0');
    expect(sc.Algas.cump).toBe('0%');
  });

  it('no aparece una fila «Otros» fantasma con el WQI de otra área', () => {
    const sc = scorecard([BACT_LARV, BACT_ALGAS, AGUA_LARV_OK, AGUA_ALGAS_MAL]);
    expect(Object.keys(sc)).not.toContain('Otros');
  });

  it('no se pasa de corrección: Larvicultura conserva su propia agua intacta', () => {
    const sc = scorecard([BACT_LARV, BACT_ALGAS, AGUA_LARV_OK, AGUA_ALGAS_MAL]);
    expect(sc.Larvicultura.n).toBe('1');
    expect(sc.Larvicultura.wqi).toBe('100');
    expect(sc.Larvicultura.cump).toBe('100%');
  });

  it('«Otras» (como lo escribe la hoja) sigue normalizándose a la fila «Otros»', () => {
    const sc = scorecard([
      M({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Otras', Formato: 'Hisopados', 'V.Totales UFC': '30' }),
      A({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Otras', Formato: 'Hisopados', 'Módulo': '3', pH: '8.0' }),
    ]);
    expect(sc.Otros).toBeDefined();
    expect(sc.Otros.wqi).toBe('100');
  });

  it('sin columna Departamento el área se deriva del Formato', () => {
    const sc = scorecard([
      BACT_LARV,
      A({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Formato: 'Larvicultura · Muestra', 'Módulo': '1', 'TQ/N°': '1', pH: '8.0' }),
    ]);
    expect(sc.Larvicultura.wqi).toBe('100');
    expect(Object.keys(sc)).not.toContain('Otros');
  });
});

/* ============================================================
   La OTRA mitad de la misma fila. Arriba se unificó el lado de Calidad de Agua; el de
   Bacteriología se quedó agrupando por `deptoOfFormato(ctx.formatoKey)` —el FORMATO— mientras
   el filtro de la sub-vista y el export usan `deptoOf` —la columna Departamento de la hoja—.
   Medido sobre las 3.146 filas reales: 84 muestras de Larvicultura se reportaban en la fila
   «Otros» (Julio 32, con 32 alertas; Agosto 53, con 50) y 2 filas con un formato no catalogado
   no salían en NINGUNA fila, pese a contarlas el KPI de arriba.
   ============================================================ */
const kpiVal = (which) => {
  const t = root.querySelector(`[data-gen-kpi="${which}"]`);
  return t ? (t.querySelector('.cal-inst-v')?.textContent || '').trim() : null;
};
const sumaMuestras = (sc) => Object.values(sc).reduce((a, r) => a + (r.n === '—' ? 0 : +r.n), 0);

describe('General · scorecard: Bacteriología se ubica por Departamento, no por Formato', () => {
  // Formato REAL de la hoja que no está catalogado (`classifyFormato` devuelve '').
  const HUERFANA = M({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura · EM', 'Módulo/Sala': '2', 'TQ/N°': '4', 'V.Totales UFC': '900000' });

  it('una muestra de formato no catalogado NO desaparece del scorecard', () => {
    const sc = scorecard([BACT_LARV, HUERFANA]);
    expect(sc.Larvicultura.n).toBe('2');
  });

  it('el scorecard cuadra con el KPI de arriba', () => {
    const sc = scorecard([BACT_LARV, HUERFANA]);
    expect(String(sumaMuestras(sc))).toBe(kpiVal('muestras'));
  });

  it('la alerta de esa muestra no se pierde en el camino', () => {
    const sc = scorecard([BACT_LARV, HUERFANA]);
    expect(sc.Larvicultura.alert).toContain('1'); // la fila declara su alerta
    expect(kpiVal('alerta')).toBe('1');
  });

  it('manda la columna Departamento, no el departamento del formato', () => {
    // Formato «Hisopados» → departamento derivado «Otros»; la hoja dice Larvicultura.
    const sc = scorecard([M({ 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Hisopados', 'V.Totales UFC': '900000' })]);
    expect(sc.Larvicultura).toBeDefined();
    expect(Object.keys(sc)).not.toContain('Otros');
  });

  it('el desglose del área incluye esa muestra', () => {
    scorecard([BACT_LARV, HUERFANA]);
    root.querySelector('[data-gen-depto="Larvicultura"]').click();
    expect(root.querySelector('#genDeptoBody').textContent).toContain('2 muestra(s) de Bacteriología');
  });

  it('los chips del modal del KPI hablan el mismo vocabulario', () => {
    scorecard([BACT_LARV, HUERFANA]);
    root.querySelector('[data-gen-kpi="muestras"]').click();
    const chips = root.querySelector('#genKpiBody').textContent;
    expect(chips).toContain('Larvicultura');
    expect(chips).not.toContain('—'); // ya no hay bolsa sin departamento
  });
});
