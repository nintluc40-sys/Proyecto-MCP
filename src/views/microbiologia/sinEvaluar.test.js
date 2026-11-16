// @vitest-environment happy-dom
/* Revisión 15-11 (B5.1) · SIN NADA EVALUADO NO HAY VERDE. «⚗️ Agua fuera», «⚠️ Fuera de rango» y «⚠️ En alerta» salían en verde
   («✓ todo en rango») sin una sola medición con rango ni una muestra de Micro: el mismo recuadro decía «sin evaluar» abajo. Es el
   punto 8 (semáforo verde sin datos) en otra vista. Cifras INVENTADAS. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const cal = (o) => ({ _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura',
  Formato: 'Larvicultura', 'Tipo de muestra': 'Agua', 'Módulo': '1', 'Estadío': 'Z2', 'TQ/N°': '3', ...o });
let root;
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const caja = (txt) => [...root.querySelectorAll('.cal-inst')].find((b) => b.textContent.includes(txt));
const abrir = (filas, sub) => {
  store.globalData = filas; root.innerHTML = ''; microbiologiaView(root);
  if (sub) click(root.querySelector(`[data-mic-sub="${sub}"]`));
};

beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'microbiologia';
  document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('B5.1 · sin nada evaluado, los recuadros no salen en verde', () => {
  it('Calidad de Agua sin ningún parámetro con rango: «Fuera de rango» sin verde ni «Todo en rango»', () => {
    abrir([cal({ Observaciones: 'sólo una nota' })], 'calidad');
    const b = caja('Fuera de rango');
    expect(b).toBeTruthy();
    expect(b.className).not.toContain('cal-sev--optimo');
    expect(b.textContent).not.toMatch(/todo en rango/i);
    expect(b.textContent).toContain('sin evaluar');
  });

  it('control: con un pH dentro de rango sí sale «Todo en rango» en verde', () => {
    abrir([cal({ pH: '8.0' })], 'calidad');
    const b = caja('Fuera de rango');
    expect(b.className).toContain('cal-sev--optimo');
    expect(b.textContent).toMatch(/todo en rango/i);
  });

  it('General sin muestras de Micro: «En alerta» sin verde', () => {
    abrir([cal({ pH: '8.0' })], 'general');
    const b = caja('En alerta');
    expect(b).toBeTruthy();
    expect(b.className).not.toContain('cal-sev--optimo');
    expect(b.textContent).toContain('sin muestras');
  });
});
