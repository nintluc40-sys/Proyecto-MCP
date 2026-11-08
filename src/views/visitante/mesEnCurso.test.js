// @vitest-environment happy-dom
// C5 (2026-11-08, usuario: «Decir que está en curso") · Visitante abre en el mes más reciente, y ése suele estar a medias:
// sus corridas no han cosechado. Antes juzgaba la calidad («🟢 Buena») junto a «0 de N» módulos revisados y «Sin
// análisis», y el bloque de Microalgas desaparecía sin aviso. Un mes CERRADO no cambia. Cifras inventadas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { visitanteView } from './index.js';

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });

/** Una corrida de junio (la 573, como en navigation.test.js): 1000 → 800, un 80 % («Buena» en un mes cerrado). */
function datos({ revisiones = true, biomol = true, algas = true } = {}) {
  const rows = [];
  ['TQ1', 'TQ2'].forEach((tq) => {
    rows.push(L({ 'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: '01/06/2026', 'Población': '1000' }));
    rows.push(L({ 'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: '10/06/2026', 'Población': '800' }));
  });
  if (revisiones) rows.push({ _SheetOrigin: 'Registro_Supervision', 'Módulo': 'Módulo 1', Corrida: '573', Fecha: '05/06/2026', Observaciones: 'Continuar' });
  if (biomol) rows.push({ _SheetOrigin: 'Biomol', Corrida: '573', Fecha: '05/06/2026', Lugar: 'Módulo 1', IHHNV: 'Positivo', WSSV: 'Negativo' });
  if (algas) rows.push({ _SheetOrigin: 'Lab_Algas', Corrida_Larv: '573', Modulo_Larv: 'M01', Sistema: 'M1', Fecha: '04/06/2026', Cel_ml: '20000', Protozoarios: '2', Descartado: 'No' });
  return rows;
}

const tarjeta = (root, k) => {
  const c = root.querySelector(`.vt-sum-card[data-sum="${k}"]`);
  return c ? { valor: c.children[1].textContent.replace(/\s+/g, ' ').trim(), ctx: c.children[2].textContent.trim() } : null;
};
const microalgas = (root) => [...root.querySelectorAll('.vt-card')].find((c) => /Microalgas/.test(c.querySelector('.vt-card-title')?.textContent || ''));

let root, errSpy;
const pintar = (filas) => { store.globalData = filas; root.innerHTML = ''; visitanteView(root); };
beforeEach(() => {
  store.role = 'visitante'; store.currentView = 'visitante';
  document.body.innerHTML = '';
  root = document.createElement('div'); document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => { vi.useRealTimers(); store.globalData = []; errSpy.mockRestore(); });

describe('Visitante · C5 · el mes en curso se dice', () => {
  it('🔴 en curso, la calidad no se juzga y la supervivencia es parcial', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 12));   // 15/06/2026: junio sigue en curso
    pintar(datos());
    expect(tarjeta(root, 'calidad')).toEqual({ valor: '⏳ Mes en curso', ctx: 'sus corridas aún no terminan' });
    expect(tarjeta(root, 'superv').valor).toBe('80.0%');
    expect(tarjeta(root, 'superv').ctx).toBe('Parcial: cosecha ÷ siembra hasta hoy');
    expect(tarjeta(root, 'cobertura').ctx).toBe('módulos revisados hasta hoy');
    // lo que ya llegó se sigue juzgando: una revisión y un positivo son información
    expect(tarjeta(root, 'revisiones').valor).toBe('🟡 Con observaciones');   // «Continuar» cuenta como hallazgo
    expect(tarjeta(root, 'sanidad').valor).toBe('🔴 1 detección(es)');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 en curso y sin nada todavía: revisiones, sanidad y Microalgas dicen «todavía»', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    pintar(datos({ revisiones: false, biomol: false, algas: false }));
    expect(tarjeta(root, 'cobertura').valor).toMatch(/^0 de 1/);
    expect(tarjeta(root, 'revisiones')).toEqual({ valor: '⚪ Todavía sin revisiones', ctx: 'el mes sigue en curso' });
    expect(tarjeta(root, 'sanidad')).toEqual({ valor: '⚪ Todavía sin análisis', ctx: 'el mes sigue en curso' });
    const alg = microalgas(root);
    expect(alg, 'la sección sale, con su aviso').toBeTruthy();
    expect(alg.textContent).toContain('Sin registros de algas este mes todavía.');
    expect(alg.querySelector('[data-sum]'), 'sin tarjetas que abrir').toBeNull();
  });

  it('🔴 el mismo mes, ya cerrado: se juzga como siempre, y sin algas no hay sección', () => {
    vi.setSystemTime(new Date(2026, 6, 2, 12));    // 02/07/2026: junio ya terminó
    pintar(datos());
    expect(tarjeta(root, 'calidad')).toEqual({ valor: '🟢 Buena', ctx: 'Según la supervivencia promedio' });
    expect(tarjeta(root, 'superv').ctx).toBe('Cosecha ÷ siembra del mes');
    expect(tarjeta(root, 'cobertura').ctx).toBe('módulos revisados');
    pintar(datos({ revisiones: false, biomol: false, algas: false }));
    expect(tarjeta(root, 'revisiones')).toEqual({ valor: '⚪ Sin datos', ctx: 'Sin revisiones este mes' });
    expect(tarjeta(root, 'sanidad')).toEqual({ valor: '⚪ Sin análisis', ctx: 'Sin muestras de laboratorio' });
    expect(microalgas(root)).toBeUndefined();
  });

  it('🔴 al acabar el mes, con los MISMOS datos, se juzga (el memo no se queda en «en curso»)', () => {
    const filas = datos();
    vi.setSystemTime(new Date(2026, 5, 30, 23, 30));
    pintar(filas);
    expect(tarjeta(root, 'calidad').valor).toBe('⏳ Mes en curso');
    vi.setSystemTime(new Date(2026, 6, 1, 0, 30));   // pasada la medianoche, sin datos nuevos
    pintar(filas);
    expect(tarjeta(root, 'calidad').valor).toBe('🟢 Buena');
  });
});
