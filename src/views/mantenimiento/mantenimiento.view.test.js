// @vitest-environment happy-dom
/* ============================================================
   🔧 MANTENIMIENTO · la vista pintada (2026-10-28)

   La vista REAL sobre un libro con la forma del de producción (texto, coma decimal, fechas d/m/aaaa): lo que enseña,
   lo que avisa cuando falta una hoja, y que lo que llega del libro se escapa. Los números son los del Excel de Blowers
   al 22/10 (el aceite del BLW-04 vencido, el del BLW-05 próximo). Sin series, ubicaciones reales ni nombres.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../core/charts.js', () => ({ destroyAllCharts: () => {}, makeChart: () => null }));
const { store } = await import('../../core/store.js');
const { mantenimientoView } = await import('./index.js');

const T = (fecha, equipo, tipo, actividad, horo, v = {}) => ({ _SheetOrigin: 'Mantenimiento Trabajos', Fecha: fecha, Equipo: equipo,
  Tipo: tipo, Actividad: actividad, 'Horómetro (h)': horo, Estado: 'Completado', ID: 'MT-' + equipo + '-' + fecha, ...v });
const L = (fecha, equipo, horo, v = {}) => ({ _SheetOrigin: 'Mantenimiento Lecturas', Fecha: fecha, Equipo: equipo, 'Horómetro (h)': horo, ...v });
const E = (codigo, v = {}) => ({ _SheetOrigin: 'Mantenimiento Equipos', 'Código': codigo, Modelo: 'FB 441 C', 'Ubicación': 'Módulo X',
  Estado: 'En servicio', 'Corriente ref (A)': '64', 'Presión ref (psi)': '3,5', 'Temperatura ref (°C)': '70', 'Plena carga (A)': '109', ...v });
const PLAN = { _SheetOrigin: 'Mantenimiento Plan', Actividad: 'Cambio de aceite', 'Intervalo (h)': '3000', 'Primer cambio (h)': '500' };
const LIBRO = [
  T('15/10/2026', 'BLW-02', 'Preventivo', 'Cambio de aceite', '942,54'), T('15/10/2026', 'BLW-01', 'Preventivo', 'Cambio de aceite', '918,4'),
  L('22/10/2026', 'BLW-02', '1028,42'), L('22/10/2026', 'BLW-04', '513,38'), L('22/10/2026', 'BLW-05', '483,35'),
  E('BLW-01', { Estado: 'Stand by' }), E('BLW-02'), E('BLW-04'), E('BLW-05'), PLAN,
];

let root;
const pintar = (rows) => { store.globalData = rows; root.innerHTML = ''; mantenimientoView(root); return root; };
const texto = (sel) => [...root.querySelectorAll(sel)].map((x) => x.textContent.replace(/\s+/g, ' ').trim());

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('Mantenimiento · la vista', () => {
  it('sin el libro todavía, espera', () => {
    pintar([]);
    expect(root.textContent).toContain('Conectando');
  });

  it('🔴 los contadores: 1 vencido (BLW-04) y 1 próximo (BLW-05); el stand by no cuenta', () => {
    pintar(LIBRO);
    const v = texto('.mn-kpi-v'), l = texto('.mn-kpi-l');
    expect([v[0], l[0]]).toEqual(['1', 'Vencidos']);
    expect(v[1]).toBe('1');
    expect(l[1]).toContain('Próximos');
    expect(v[2]).toBe('10 / 11');
    expect(root.querySelector('.mn-aviso'), 'con las cuatro hojas no hay avisos').toBeNull();
  });

  it('🔴 el semáforo: el BLW-04 VENCIDO a −13,38 h, encabezando los próximos cambios', () => {
    pintar(LIBRO);
    const fila = [...root.querySelectorAll('.mn-sem tbody tr')].find((tr) => tr.textContent.includes('Cambio de aceite'));
    const cab = [...root.querySelectorAll('.mn-sem thead th')].map((th) => th.childNodes[0].textContent.trim());
    const celda = fila.children[cab.indexOf('BLW-04')];
    expect(celda.textContent).toContain('VENCIDO');
    expect(celda.textContent).toContain('-13,38 h');
    expect(celda.getAttribute('title')).toContain('Primer cambio');
    const primeras = [...root.querySelectorAll('.mn-card')[1].querySelectorAll('tbody tr')].slice(0, 2).map((tr) => tr.children[0].textContent);
    expect(primeras).toEqual(['BLW-04', 'BLW-05']);
    expect(root.textContent).toContain('Sin intervalo en el plan');
  });

  it('avisa de cada hoja que falta, y del plan sin intervalos', () => {
    pintar([L('22/10/2026', 'BLW-02', '1')]);
    const a = texto('.mn-aviso');
    expect(a.some((x) => x.includes('Falta la hoja «Mantenimiento Equipos»'))).toBe(true);
    expect(a.some((x) => x.includes('Falta la hoja «Mantenimiento Plan»'))).toBe(true);
    pintar([{ _SheetOrigin: 'Larvicultura', Fecha: '1/10/2026' }]);
    expect(texto('.mn-aviso')[0]).toContain('Aún no hay nada en «Mantenimiento Trabajos»');
  });

  it('lo que llega del libro se ESCAPA', () => {
    pintar(LIBRO.concat([E('<img src=x onerror=alert(1)>', { 'Ubicación': '<b>x</b>' })]));
    expect(root.querySelector('img')).toBeNull();
    expect(root.innerHTML).toContain('&lt;img');
  });
});
