// @vitest-environment happy-dom
/* ============================================================
   🔧 MANTENIMIENTO · la vista pintada (2026-10-28)

   La vista REAL sobre un libro con la forma del de producción (texto, coma decimal, fechas d/m/aaaa): lo que enseña,
   lo que avisa cuando falta una hoja, y que lo que llega del libro se escapa. Los números son los del Excel de Blowers
   al 22/10 (el aceite del BLW-04 vencido, el del BLW-05 próximo). Sin series, ubicaciones reales ni nombres.
   ============================================================ */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const graf = vi.hoisted(() => ({ makeChart: vi.fn(() => null) }));
vi.mock('../../core/charts.js', () => ({ destroyAllCharts: () => {}, makeChart: graf.makeChart }));
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
  L('6/10/2026', 'BLW-02', '726,54', { 'Corriente (A)': '67,2', 'Presión (psi)': '4', 'Temperatura (°C)': '60' }),
  L('23/10/2026', 'BLW-02', '1040', { 'Corriente (A)': '72', 'Presión (psi)': '4', 'Temperatura (°C)': '61' }),
  L('6/10/2026', 'BLW-01', '702,4', { 'Corriente (A)': '57,9', 'Presión (psi)': '4', 'Temperatura (°C)': '60' }),
  E('BLW-01', { Estado: 'Stand by' }), E('BLW-02'), E('BLW-04'), E('BLW-05'), PLAN,
];

let root;
const pintar = (rows) => { store.globalData = rows; root.innerHTML = ''; mantenimientoView(root); return root; };
const texto = (sel) => [...root.querySelectorAll(sel)].map((x) => x.textContent.replace(/\s+/g, ' ').trim());

beforeEach(() => {
  graf.makeChart.mockClear();
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

describe('Mantenimiento · 📈 Lecturas', () => {
  const abrir = () => { pintar(LIBRO); root.querySelector('[data-mn-tab="lecturas"]').click(); };

  it('🔴 la tabla: la última lectura de cada equipo contra su referencia; la corriente del BLW-02 (72 A > 70,4) se marca', () => {
    abrir();
    expect(root.querySelector('[data-mn-tab="lecturas"]').classList.contains('is-on')).toBe(true);
    const fila = [...root.querySelectorAll('.mn-tabla tbody tr')].find((tr) => tr.children[0].textContent.startsWith('BLW-02'));
    expect(fila.textContent).toContain('REVISAR');
    expect(fila.querySelector('.mn-fuera').textContent).toBe('72 A');
    expect(fila.textContent).toContain('66 %');
    const b4 = [...root.querySelectorAll('.mn-tabla tbody tr')].find((tr) => tr.children[0].textContent.startsWith('BLW-04'));
    expect(b4.textContent, 'sólo el horómetro no es una lectura de operación').toContain('SIN LECTURA');
    expect(root.querySelectorAll('.mn-kpi-v')[3].textContent, 'el contador de lecturas a revisar').toBe('1');
  });

  it('🔴 la curva del primer equipo con lecturas, con la línea de alerta; cambiar el equipo la rehace', () => {
    abrir();
    expect(graf.makeChart).toHaveBeenCalled();
    const cfg = graf.makeChart.mock.calls.at(-1)[1];
    expect(cfg.data.labels, 'el BLW-02, el primero EN SERVICIO con lecturas (el BLW-01 está en stand by); la ronda sin corriente no cuenta').toEqual(['06/10', '23/10']);
    expect(cfg.data.datasets[0].data).toEqual([67.2, 72]);
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['Corriente (A)', 'Alerta (70,4 A)']);
    const sel = root.querySelector('[data-mn-sel="lecEquipo"]');
    expect([...sel.options].map((o) => o.value)).toEqual(['BLW-01', 'BLW-02', 'BLW-04', 'BLW-05']);
    sel.value = 'BLW-01';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const p = root.querySelector('[data-mn-sel="lecParam"]');
    p.value = 'temperatura';
    p.dispatchEvent(new Event('change', { bubbles: true }));
    const cfg2 = graf.makeChart.mock.calls.at(-1)[1];
    expect(cfg2.data.labels).toEqual(['06/10']);
    expect(cfg2.data.datasets[0].data).toEqual([60]);
    expect(cfg2.data.datasets[1].label).toBe('Alerta (80 °C)');
  });
});

describe('Mantenimiento · 📊 Indicadores', () => {
  const FALLAS = [T('24/10/2026', 'BLW-02', 'Correctivo', 'Reparación / correctivo', '1050', { 'Parada (h)': '5', 'Costo (USD)': '120,5' }),
    T('26/10/2026', 'BLW-02', 'Correctivo', 'Reparación / correctivo', '1100', { 'Parada (h)': '3' })];
  const abrir = (rows) => { pintar(rows); root.querySelector('[data-mn-tab="indicadores"]').click(); };
  const kpi = (l) => { const k = [...root.querySelectorAll('.mn-kpi')].find((x) => x.querySelector('.mn-kpi-l').textContent.startsWith(l)); return k && k.querySelector('.mn-kpi-v').textContent; };

  it('sin fallas: MTBF y MTTR en blanco, disponibilidad 100 %', () => {
    abrir(LIBRO);
    expect(kpi('Intervenciones')).toBe('2');
    expect(kpi('Correctivos')).toBe('0');
    expect(kpi('MTBF')).toBe('—');
    expect(kpi('Disponibilidad')).toBe('100 %');
  });

  it('🔴 con fallas: el BLW-02 con MTBF 550 h, MTTR 4 h y 99,28 %; la flota, sus horas ÷ sus fallas', () => {
    abrir(LIBRO.concat(FALLAS));
    expect(kpi('MTBF'), '(918,4 + 1100 + 513,38 + 483,35) ÷ 2').toBe('1.507,57 h');
    expect(kpi('MTTR')).toBe('4 h');
    expect(kpi('Equipo con más fallas')).toBe('BLW-02');
    expect(kpi('Costo total')).toBe('$120,50');
    expect(kpi('% preventivo'), '2 preventivos y 2 correctivos: por debajo de la meta de 80 %').toBe('50 %');
    const fila = [...root.querySelectorAll('.mn-tabla tbody tr')].find((tr) => tr.children[0].textContent.startsWith('BLW-02'));
    expect(fila.textContent).toContain('99,28 %');
    expect([...fila.children].slice(9, 11).map((td) => td.textContent)).toEqual(['550', '4']);
  });

  it('mes a mes: el año del último trabajo, su tabla y su gráfico', () => {
    abrir(LIBRO.concat(FALLAS));
    expect(root.querySelector('[data-mn-sel="anio"]').value).toBe('2026');
    const oct = [...root.querySelectorAll('.mn-tabla tbody tr')].find((tr) => tr.children[0].textContent === 'Octubre');
    expect([...oct.children].slice(1, 4).map((td) => td.textContent)).toEqual(['2', '2', '4']);
    const cfg = graf.makeChart.mock.calls.at(-1)[1];
    expect(cfg.type).toBe('bar');
    expect(cfg.data.datasets.map((d) => d.data[9])).toEqual([2, 2, 0]);
  });
});
