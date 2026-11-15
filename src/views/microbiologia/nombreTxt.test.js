// @vitest-environment happy-dom
/* ============================================================
   Punto 16 de la pauta del 12-11 (usuario: «Sólo las pruebas, como están») · EL NOMBRE DE LOS REPORTES TXT.
   A30 (2026-11-06) arregló que el TXT de Bacteriología usara la fecha UTC (`toISOString`): desde las 19:00 en Ecuador el
   archivo salía con la fecha de MAÑANA. No había prueba que lo vigilara, y tampoco del nombre del de Calidad de Agua.
   ⚠ La CI corre en UTC, donde «local» y UTC coinciden y ese fallo no se ve: aquí se fija la zona de Ecuador
   (America/Guayaquil, UTC−5) para esta prueba y se pone el reloj a las 20:30 locales (01:30 UTC del día siguiente).
   Cifras INVENTADAS.
   ============================================================ */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const datos = () => [
  { _SheetOrigin: 'Microbiología', 'Fecha muestreo': '02/06/2026', Corrida: '573', 'Módulo/Sala': '1', 'TQ/N°': '1', 'Estadío': 'Z2',
    'Tipo de muestra': 'Animal', Formato: 'Larvicultura · Muestra', 'V.Totales UFC': '12000', 'Pseudomonas UFC': '300' },
  { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura',
    'Tipo de muestra': 'Agua', 'Módulo': '1', 'Estadío': 'Z2', 'TQ/N°': '3', pH: '8.0', 'S‰': '32' },
];

let zonaAntes, root, nombres, espias;
const click = (el) => { if (!el) throw new Error('no está el botón'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const abrir = (sub) => {
  store.globalData = datos(); root.innerHTML = ''; microbiologiaView(root); click(root.querySelector(`[data-mic-sub="${sub}"]`));
  if (sub === 'bacteriologia') click(root.querySelector('[data-mic-ap="petri"]'));   // su «⬇ Reporte» vive en la barra de la Placa Petri
};

beforeAll(() => { zonaAntes = process.env.TZ; process.env.TZ = 'America/Guayaquil'; });
afterAll(() => { if (zonaAntes === undefined) delete process.env.TZ; else process.env.TZ = zonaAntes; });
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'microbiologia';
  document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root);
  nombres = [];
  espias = [
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prueba'),
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}),
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { nombres.push(this.download); }),
    vi.spyOn(console, 'error').mockImplementation(() => {}),
  ];
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => { vi.useRealTimers(); espias.forEach((s) => s.mockRestore()); store.globalData = []; });

describe('punto 16 · el nombre del TXT lleva la fecha (y la hora) LOCALES', () => {
  it('control: la zona de la prueba es la de Ecuador (si no, la prueba no podría ver el fallo)', () => {
    vi.setSystemTime(new Date('2026-11-15T01:30:00Z'));
    expect([new Date().getDate(), new Date().getHours()]).toEqual([14, 20]);
  });

  it('🔴 Bacteriología a las 20:30 del 14-11 en Ecuador: «reporte_microbiologia_2026-11-14.txt», no el del 15', () => {
    vi.setSystemTime(new Date('2026-11-15T01:30:00Z'));
    abrir('bacteriologia');
    click(root.querySelector('[data-mic-export="txt"]'));
    expect(nombres).toEqual(['reporte_microbiologia_2026-11-14.txt']);
  });

  it('🔴 Calidad de Agua a las 20:30 del 14-11 en Ecuador: «reporte_calidad_agua_20261114_2030.txt»', () => {
    vi.setSystemTime(new Date('2026-11-15T01:30:00Z'));
    abrir('calidad');
    click(root.querySelector('[data-cal-export]'));
    expect(nombres).toEqual(['reporte_calidad_agua_20261114_2030.txt']);
  });

  it('por la mañana, el día de hoy en los dos (y la hora con dos cifras)', () => {
    vi.setSystemTime(new Date('2026-11-15T13:05:00Z'));   // 08:05 en Ecuador
    abrir('bacteriologia');
    click(root.querySelector('[data-mic-export="txt"]'));
    abrir('calidad');
    click(root.querySelector('[data-cal-export]'));
    expect(nombres).toEqual(['reporte_microbiologia_2026-11-15.txt', 'reporte_calidad_agua_20261115_0805.txt']);
  });

  it('mes, día, hora y minuto de una cifra, con su cero delante', () => {
    vi.setSystemTime(new Date('2026-06-05T14:03:00Z'));   // 09:03 del 05-06 en Ecuador
    abrir('bacteriologia');
    click(root.querySelector('[data-mic-export="txt"]'));
    abrir('calidad');
    click(root.querySelector('[data-cal-export]'));
    expect(nombres).toEqual(['reporte_microbiologia_2026-06-05.txt', 'reporte_calidad_agua_20260605_0903.txt']);
  });
});
