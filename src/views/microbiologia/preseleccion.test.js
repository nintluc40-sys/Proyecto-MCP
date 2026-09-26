// @vitest-environment happy-dom
/* ============================================================
   MICROBIOLOGÍA · abrir la vista YA filtrada desde otra (0f · 8, 2026-09-26)

   El modal «🦠 Micro y agua» del tablero de Maduración tiene «Abrir en 🦠 Microbiología»: la vista tiene que llegar
   con la sub-vista y el DEPARTAMENTO puestos —en Bacteriología y en Calidad de Agua— y sin el formato ni los filtros
   de contexto de antes, que podían ser de otro departamento.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { microbiologiaView, microPreseleccion } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const M = (o) => ({ _SheetOrigin: 'Microbiología', 'Fecha muestreo': '05/06/2026', ...o });
const FILAS = [
  M({ Departamento: 'Larvicultura', Formato: 'Larvicultura · Muestra', 'Módulo/Sala': '1', 'TQ/N°': '1', 'Tipo de muestra': 'Animal', 'V.Totales UFC': '2000' }),
  M({ Departamento: 'Larvicultura', Formato: 'Larvicultura · Reservorios', 'Tanque/Reservorio': '1', 'V.Totales UFC': '2000' }),
  M({ Departamento: 'Maduración', Formato: 'Maduración · Principal', 'Módulo/Sala': 'Sala 1', Sexo: 'Hembras', 'V.Totales UFC': '2000' }),
  M({ Departamento: 'Maduración', Formato: 'Maduración · RAS', Componente: 'Colector', 'V.Totales UFC': '2000' }),
  { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', pH: '8' },
  { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Departamento: 'Maduración', Formato: 'Maduración · RAS', Componente: 'Colector', pH: '9' },
];
const elegido = (sel) => { const s = root.querySelector(sel); return s ? (s.querySelector('option[selected]') || { value: '' }).value : null; };

let root, errSpy;
beforeEach(() => {
  store.globalData = FILAS;
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('Microbiología · microPreseleccion', () => {
  it('🔴 llega en Bacteriología con Maduración elegido (y su filtro de formato a la vista)', () => {
    microPreseleccion({ sub: 'bacteriologia', depto: 'Maduración' });
    microbiologiaView(root);
    expect(root.querySelector('[data-mic-sub="bacteriologia"]').classList.contains('is-active')).toBe(true);
    expect(elegido('[data-micfilter="depto"]')).toBe('Maduración');
    expect(root.querySelector('[data-micfilter="formato"]'), 'con departamento, el sub-filtro de formato').not.toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 y Calidad de Agua también queda en Maduración', () => {
    microPreseleccion({ sub: 'calidad', depto: 'Maduración' });
    microbiologiaView(root);
    expect(root.querySelector('[data-mic-sub="calidad"]').classList.contains('is-active')).toBe(true);
    expect(elegido('[data-calfilter="calDepto"]')).toBe('Maduración');
  });

  it('🔴 suelta el formato de antes: se llega a TODO el departamento', () => {
    microPreseleccion({ sub: 'bacteriologia', depto: 'Maduración' });
    microbiologiaView(root);
    const f = root.querySelector('[data-micfilter="formato"]');
    f.value = 'Maduración · RAS';
    f.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(elegido('[data-micfilter="formato"]'), 'control: el formato quedó puesto').toBe('Maduración · RAS');
    microPreseleccion({ sub: 'bacteriologia', depto: 'Maduración' });
    microbiologiaView(root);
    expect(elegido('[data-micfilter="formato"]')).toBe('');
  });
});
