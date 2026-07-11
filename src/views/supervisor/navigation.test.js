// @vitest-environment happy-dom
// Test de regresión de navegación integral del Supervisor: renderiza la vista con
// datos sintéticos y recorre ejecutiva → módulo → tanque → LARVIA → despacho → OM/Tex,
// abriendo todos los modales, verificando que no se produzca ningún error de runtime.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Charts mockeados: happy-dom no da contexto 2D. Aislamos bugs de plantilla/navegación.
vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const T = (o) => ({ _SheetOrigin: 'Control_Tanque M01', ...o });

function synthData() {
  const rows = [];
  const dates = ['01/06/2026', '03/06/2026', '05/06/2026', '07/06/2026'];
  const estad = ['N5', 'Z3', 'PL2', 'PL5'];
  // TQ1 lote OM ('AB'), TQ2 lote TEX ('TEX1')
  [['TQ1', 'AB', 1000], ['TQ2', 'TEX1', 1200]].forEach(([tq, lote, pop0]) => {
    dates.forEach((f, i) => {
      rows.push(L({
        'Módulo': 'M01', Corrida: '573', Tanque: tq, Lote: lote, Fecha: f,
        'Estadío': estad[i], 'Población': String(pop0 - i * 120),
        'Intestino_Lleno': String(92 - i), 'Lípidos': String(96 - i), 'Deformidad': String(2 + i),
        '% Actividad': String(90 - i), '% Espuma': '8', '% Suciedad': '5', '% Recambio': '40',
        Color: 'Café claro', Salinidad: '30', 'Estrés': '3',
        'PL/g': String(210 - i * 3), 'Peso promedio (mg)': String((1.2 + i * 0.3).toFixed(2)),
        'Longitud promedio (mm)': String((9 + i).toFixed(1)),
        'ID de Análisis': `AN-${tq}-${i}`, Técnico: 'John Muñoz',
        Observaciones: i === 3 ? 'muestreo final' : '',
      }));
    });
    // Registro de despacho en el último día
    rows.push(L({
      'Módulo': 'M01', Corrida: '573', Tanque: tq, Lote: lote, Fecha: '08/06/2026',
      'Estadío': 'PL11', 'Densidad cosechada': '25', Biomasa: '120', Destino: 'Piscina 3',
      'Cajas/Tinas': '10', 'Plg (manual)': '150', Piscina: 'P3',
    }));
  });
  // Control_Tanque: tomas horarias TQ1/TQ2
  ['TQ1', 'TQ2'].forEach((tq) => {
    ['2:00:00', '8:00:00', '14:00:00', '20:00:00'].forEach((h, i) => {
      rows.push(T({
        'Módulo': 'M01', Corrida: '573', Tanque: tq, Fecha: '07/06/2026', Hora: h,
        OD: String(6 + i * 0.2), Temperatura: String(31 + i * 0.3), Salinidad: '30',
      }));
    });
  });
  // Registro_Supervisión (comentarios AT)
  rows.push({
    _SheetOrigin: 'Registro_Supervision', 'Módulo': 'Módulo 1', Corrida: '573', Fecha: '05/06/2026',
    Supervisor: 'Ana', Siembra: '1', 'Comentario (matutino)': 'Todo normal', 'Tipo_revision': 'x', 'Condición': 'ok', 'Acción': 'ninguna',
  });
  // Biomol
  rows.push({
    _SheetOrigin: 'Biomol', Fecha: '05/06/2026', 'Código': 'BM1', Corrida: '573', Lugar: 'Módulo 1',
    Tanque: 'TQ1', 'Estadío': 'PL2', IHHNV: 'Negativo', WSSV: 'Positivo', 'AHPND/EMS': 'Negativo',
  });
  // Microbiología (2 días → la pestaña Tendencias tiene serie temporal por patógeno)
  rows.push({
    _SheetOrigin: 'Microbiología', 'Fecha muestreo': '05/06/2026', Corrida: '573', 'Módulo/Sala': '1',
    Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal', 'TQ/N°': '1', 'Estadío': 'PL2',
    'V.Totales UFC': '5000', 'V.Amarillos UFC': '1200', 'V.Totales Nivel': 'Leve',
  });
  rows.push({
    _SheetOrigin: 'Microbiología', 'Fecha muestreo': '07/06/2026', Corrida: '573', 'Módulo/Sala': '1',
    Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal', 'TQ/N°': '1', 'Estadío': 'PL5',
    'V.Totales UFC': '8000', 'V.Amarillos UFC': '900', 'V.Totales Nivel': 'Moderado',
  });
  // Calidad de Agua (hoja propia) del módulo 1 → modal Calidad de Agua (Tabla/Matriz/Tendencias).
  // 2 tanques × 2 fechas con pH/S‰/Alcalinidad/Nitrito (Alcalinidad de TQ2 cae fuera de rango).
  ['1', '2'].forEach((tq, ti) => {
    ['05/06/2026', '07/06/2026'].forEach((f, di) => {
      rows.push({
        _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': f, Corrida: '573',
        Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Tipo de muestra': 'Agua',
        'Módulo': '1', 'TQ/N°': tq, 'Estadío': ['PL2', 'PL5'][di],
        pH: String((8.0 + di * 0.1).toFixed(1)), 'S‰': '32',
        Alcalinidad: String(130 - ti * 15), Nitrito: String((0.1 + di * 0.05).toFixed(2)),
      });
    });
  });
  // Registro_Desinfección (detalle del módulo)
  rows.push({
    _SheetOrigin: 'Registro_Desinfección', 'Módulo': 'M01', Corrida: '573', Fecha: '20/05/2026',
    'Tipo de Registro': 'Desinfección de módulo larvicultura', 'Categoría': 'Paredes', Elemento: 'Muro', Estado: 'Sí', Observaciones: '',
  });
  return rows;
}

function click(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

let errSpy;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  // vState es singleton de módulo (persiste entre tests como en una sesión real):
  // normalizamos a la vista ejecutiva para aislar cada caso.
  if (!root.querySelector('#execMonth')) {
    const back = root.querySelector('[data-nav="modules"]');
    if (back) click(back);
  }
  return root;
}

describe('Supervisor · harness de navegación integral', () => {
  it('vista ejecutiva renderiza tabla y tarjeta de módulo', () => {
    const root = mount();
    expect(root.querySelector('.prod-table')).toBeTruthy();
    const card = root.querySelector('.sv-card[data-nav="module"]');
    expect(card).toBeTruthy();
    expect(card.getAttribute('data-mod')).toBe('M01');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('navega ejecutiva → módulo y muestra el resumen operativo', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    expect(root.querySelector('.sv-banner')).toBeTruthy();
    expect(root.textContent).toContain('RESUMEN OPERATIVO');
    // Botones de acción esperados (Tex presente → OM vs Tex; biomol/micro/desinf)
    expect(root.querySelector('[data-nav="despacho"]')).toBeTruthy();
    expect(root.querySelector('[data-nav="omtex"]')).toBeTruthy();
    expect(root.querySelector('[data-biomol-open]')).toBeTruthy();
    expect(root.querySelector('[data-micro-open]')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('abre cada modal del módulo sin error', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    ['[data-modcmp-open]', '[data-athist-open]', '[data-biomol-open]', '[data-micro-open]', '[data-desinf-open]', '[data-modday-open]', '[data-modmetric="sv"]']
      .forEach((sel) => { const b = root.querySelector(sel); if (b) click(b); });
    // El modal de métricas debe existir y poder abrirse
    expect(root.querySelector('#svModMetricModal')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Microbiología · pestaña Tendencias (píldoras) selecciona patógeno y cambia con clic', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-micro-open]'));
    click(root.querySelector('[data-micmode="tendencias"]'));
    // Fila de píldoras + filtro de tanque + al menos 2 patógenos (Totales/Amarillas).
    expect(root.querySelector('.sv-mtrend-pills')).toBeTruthy();
    expect(root.querySelector('[data-mtrend-tank]')).toBeTruthy();
    const pills = root.querySelectorAll('.sv-mtrend-pill[data-mtrend-open]');
    expect(pills.length).toBeGreaterThanOrEqual(2);
    // Exactamente una píldora activa + un solo gráfico grande en el detalle.
    expect(root.querySelectorAll('.sv-mtrend-pill.is-on').length).toBe(1);
    expect(root.querySelector('.sv-mtrend-detail #svMicTrendChart')).toBeTruthy();
    // Clic en una píldora inactiva → esa pasa a ser la única activa.
    const off = root.querySelector('.sv-mtrend-pill:not(.is-on)[data-mtrend-open]');
    const key = off.dataset.mtrendOpen;
    click(off);
    expect(root.querySelectorAll('.sv-mtrend-pill.is-on').length).toBe(1);
    expect(root.querySelector('.sv-mtrend-pill.is-on').dataset.mtrendOpen).toBe(key);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Calidad de Agua · Tabla / Matriz / Tendencias (por parámetro con banda)', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    const open = root.querySelector('[data-cw-open]');
    expect(open).toBeTruthy();
    click(open);
    expect(root.querySelector('#svCalAguaModal').classList.contains('sv-open')).toBe(true);
    // Panel de diagnóstico + WQI (siempre visible sobre las vistas).
    expect(root.querySelector('#svCwPanel .cw-panel')).toBeTruthy();
    expect(root.querySelector('#svCwPanel .cw-gauge-v')).toBeTruthy();
    // Tabla (muestra × parámetro); clic en la pestaña fuerza el render síncrono.
    click(root.querySelector('[data-cw-mode="tabla"]'));
    expect(root.querySelector('#svCwBody .sv-table')).toBeTruthy();
    // Tanques: tarjetas-instrumento (una por tanque, con escala/aguja por parámetro).
    click(root.querySelector('[data-cw-mode="fichas"]'));
    expect(root.querySelector('#svCwBody .cw-fichas')).toBeTruthy();
    expect(root.querySelectorAll('#svCwBody .cw-card').length).toBeGreaterThanOrEqual(1);
    expect(root.querySelector('#svCwBody .cw-scale-needle')).toBeTruthy();
    // Matriz (parámetro × tanque).
    click(root.querySelector('[data-cw-mode="matriz"]'));
    expect(root.querySelector('#svCwBody .sv-micro-hm')).toBeTruthy();
    // Tendencias: píldoras de parámetro + gráfico + selección.
    click(root.querySelector('[data-cw-mode="tendencias"]'));
    expect(root.querySelector('.sv-mtrend-pills')).toBeTruthy();
    expect(root.querySelector('[data-cw-tank]')).toBeTruthy();
    const pills = root.querySelectorAll('.sv-mtrend-pill[data-cw-param]');
    expect(pills.length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector('.sv-mtrend-detail #svCwTrendChart')).toBeTruthy();
    const off = root.querySelector('.sv-mtrend-pill:not(.is-on)[data-cw-param]');
    const key = off.dataset.cwParam;
    click(off);
    expect(root.querySelector('.sv-mtrend-pill.is-on').dataset.cwParam).toBe(key);
    // Filtro de tanque no rompe.
    const tsel = root.querySelector('[data-cw-tank]');
    tsel.value = tsel.options[1].value;
    tsel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('navega módulo → tanque → LARVIA y abre modales del tanque', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('.sv-tank-card[data-nav="tank"]'));
    expect(root.textContent).toContain('VISUALIZACIÓN DEL TANQUE');
    ['[data-alerts-open]', '[data-obshist-open]', '[data-morphmap-open]', '[data-forecast-open]', '[data-iclopen]', '[data-tankmetric="od"]']
      .forEach((sel) => { const b = root.querySelector(sel); if (b) click(b); });
    expect(errSpy).not.toHaveBeenCalled();
    // LARVIA
    click(root.querySelector('[data-nav="larvia"]'));
    expect(root.textContent).toContain('ANÁLISIS BIOMÉTRICO LARVIA');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('navega módulo → despacho y módulo → OM vs Tex', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-nav="despacho"]'));
    expect(root.textContent).toContain('REGISTRO DE DESPACHO');
    expect(errSpy).not.toHaveBeenCalled();
    // volver al módulo por breadcrumb
    click([...root.querySelectorAll('.sv-crumb')].find((b) => /M01/.test(b.textContent)));
    click(root.querySelector('[data-nav="omtex"]'));
    expect(root.textContent).toContain('COMPARATIVA OM vs TEX');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Comparar Tanques (ejecutiva) se abre y genera comparación', () => {
    const root = mount();
    const openBtn = root.querySelector('[data-ctt-open]');
    expect(openBtn).toBeTruthy();
    click(openBtn);
    const gen = root.querySelector('[data-ct-generate]');
    expect(gen).toBeTruthy();
    click(gen); // sin selección → mensaje de ayuda, sin throw
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('filtro de fecha global no rompe el módulo', () => {
    store.dateFrom = new Date('2026-06-04'); store.dateTo = new Date('2026-06-09');
    const root = mount();
    const card = root.querySelector('.sv-card[data-nav="module"]');
    if (card) { click(card); expect(root.querySelector('.sv-banner')).toBeTruthy(); }
    expect(errSpy).not.toHaveBeenCalled();
  });
});
