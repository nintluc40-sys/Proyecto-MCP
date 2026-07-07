// @vitest-environment happy-dom
// Test de regresión de navegación integral de Microbiología: renderiza la vista con
// datos sintéticos de la hoja Microbiología y ejercita sub-navegación, filtros en
// cascada (depto/formato/dimensiones), navegación de mes/día, apartados y pestañas
// (Conglomerado/Placa/Matriz/Tendencias), tema de placa, modales y export.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { microbiologiaView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const M = (o) => ({ _SheetOrigin: 'Microbiología', ...o });

function synthData() {
  const rows = [];
  const dates = ['02/06/2026', '05/06/2026', '08/06/2026'];
  // Larvicultura · Muestra (Animal), módulo 1, TQ 1 y 2 — con UFC que dan Moderado/Elevado.
  ['1', '2'].forEach((tq, ti) => {
    dates.forEach((f, di) => {
      rows.push(M({
        'Fecha muestreo': f, Corrida: '573', 'Módulo/Sala': '1', 'TQ/N°': tq,
        'Estadío': ['Z2', 'M1', 'PL2'][di], 'Tipo de muestra': ti ? 'Agua' : 'Animal',
        Formato: 'Larvicultura · Muestra',
        'V.Totales UFC': String(12000 - di * 1000), 'V.Amarillos UFC': String(6000 - di * 500),
        'V.Verdes UFC': String(400 + di * 50), 'Pseudomonas UFC': String(300 + di * 100),
        'V.Luminiscentes': di === 2 && ti === 0 ? 'Presente' : 'Ausente',
      }));
    });
  });
  // Segundo formato de Larvicultura (Reservorios) → habilita el filtro de formato.
  rows.push(M({
    'Fecha muestreo': '05/06/2026', Corrida: '573', 'Tanque/Reservorio': '1',
    Formato: 'Larvicultura · Reservorios', 'Tipo de muestra': 'Agua',
    'V.Totales UFC': '3000', 'V.Amarillos UFC': '1200',
  }));
  // Maduración → habilita el filtro de departamento (≥2 deptos).
  rows.push(M({
    'Fecha muestreo': '06/06/2026', Corrida: '573', 'Módulo/Sala': 'Sala A', Sexo: 'Hembra',
    Formato: 'Maduración · Principal', 'Tipo de muestra': 'Animal',
    'V.Totales UFC': '2000', 'Pseudomonas UFC': '400',
  }));
  // Calidad de Agua (fisicoquímica, hoja propia) → sub-vista Calidad de Agua.
  rows.push({
    _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573',
    Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Tipo de muestra': 'Agua',
    'Módulo': '1', 'Estadío': 'Z2', 'TQ/N°': '3',
    pH: '8.0', 'S‰': '32', Nitrito: '0.5', Alcalinidad: '130', // pH dentro · Nitrito fuera
  });
  rows.push({
    _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '06/06/2026', Corrida: '573',
    Departamento: 'Maduración', Formato: 'Maduración', Sala: 'Sala A', 'TQ/N°': '2',
    pH: '7.0', Calcio: '400', Magnesio: '1500', // pH fuera (<7.5)
  });
  return rows;
}

function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function change(el, value) { if (el) { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); } }

let errSpy, root;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'microbiologia';
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

// vState es singleton de módulo: normaliza a Bacteriología · Conglomerado.
function mount() {
  microbiologiaView(root);
  const bact = root.querySelector('[data-mic-sub="bacteriologia"]');
  if (bact && !bact.classList.contains('is-active')) { click(bact); }
  const cong = root.querySelector('[data-mic-ap="conglomerado"]');
  if (cong && !cong.classList.contains('is-active')) click(cong);
  return root;
}

describe('Microbiología · harness de navegación integral', () => {
  it('render base: Bacteriología con KPIs, filtros y conglomerado', () => {
    mount();
    expect(root.querySelector('.mic-kpis')).toBeTruthy();
    expect(root.querySelector('.mic-apartados')).toBeTruthy();
    expect(root.querySelector('.mic-table')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('sub-navegación entre las 4 sub-vistas y vuelta a Bacteriología', () => {
    mount();
    ['general', 'calidad', 'patologia', 'bacteriologia'].forEach((k) => {
      click(root.querySelector(`[data-mic-sub="${k}"]`));
      expect(root.querySelector(`[data-mic-sub="${k}"]`).classList.contains('is-active')).toBe(true);
    });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('filtros en cascada: departamento → formato → dimensión (TQ)', () => {
    mount();
    const depto = root.querySelector('[data-micfilter="depto"]');
    expect(depto).toBeTruthy();
    change(depto, 'Larvicultura');
    const fmt = root.querySelector('[data-micfilter="formato"]');
    if (fmt) change(fmt, 'larv-muestra');
    const tqDim = root.querySelector('[data-micdim="tq"]');
    if (tqDim) change(tqDim, tqDim.options[1].value);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('apartado Placa Petri: pestañas Placa/Matriz/Tendencias + navegación de día + tema', () => {
    mount();
    click(root.querySelector('[data-mic-ap="petri"]'));
    expect(root.querySelector('.mic-petabs')).toBeTruthy();
    click(root.querySelector('[data-mic-petab="matriz"]'));
    expect(root.querySelector('.mic-mx-table')).toBeTruthy();
    click(root.querySelector('[data-mic-petab="tendencias"]'));
    // Ranking de crecimiento (barras) + detalle con cinética; seleccionar una fila la activa.
    expect(root.querySelector('.mic-tr-rank')).toBeTruthy();
    expect(root.querySelector('.mic-th-detail #micTrendChart')).toBeTruthy();
    const trows = root.querySelectorAll('.mic-tr-bar-row[data-mic-trendsel]');
    expect(trows.length).toBeGreaterThanOrEqual(2);
    expect(root.querySelectorAll('.mic-tr-bar-row.is-sel').length).toBe(1);
    const other = root.querySelector('.mic-tr-bar-row:not(.is-sel)[data-mic-trendsel]');
    const okey = other.dataset.micTrendsel;
    click(other);
    expect(root.querySelector('.mic-tr-bar-row.is-sel').dataset.micTrendsel).toBe(okey);
    // Cambiar el orden del ranking (μ → Σ UFC) mantiene el ranking sin error.
    click(root.querySelector('[data-mic-trendsort="ufc"]'));
    expect(root.querySelector('.mic-tr-sortb.is-on').dataset.micTrendsort).toBe('ufc');
    click(root.querySelector('[data-mic-petab="placa"]'));
    // navegación de día
    const prev = root.querySelector('[data-mic-day="-1"]');
    if (prev && !prev.disabled) click(prev);
    // tema de la placa
    click(root.querySelector('[data-mic-petheme]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('sub-vista Calidad de Agua: KPIs + tarjetas de perfil con chips semaforizados', () => {
    mount();
    click(root.querySelector('[data-mic-sub="calidad"]'));
    expect(root.querySelector('.mic-calagua')).toBeTruthy();
    expect(root.querySelector('.mic-kpis')).toBeTruthy();
    const cards = root.querySelectorAll('.cal-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    // pH 8.0 dentro de 7.5–8.5 · Nitrito 0.5 fuera de ≤0.2 → ambos estados presentes.
    expect(root.querySelector('.cal-chip--dentro')).toBeTruthy();
    expect(root.querySelector('.cal-chip--fuera')).toBeTruthy();
    // Apartado Matriz: tabla muestra × parámetro con celdas semaforizadas.
    click(root.querySelector('[data-cal-ap="matriz"]'));
    expect(root.querySelector('.cal-mx-table')).toBeTruthy();
    expect(root.querySelector('.cal-mx--dentro')).toBeTruthy();
    expect(root.querySelector('.cal-mx--fuera')).toBeTruthy();
    // Cascada: filtrar por departamento (2 deptos: Larvicultura/Maduración) no rompe.
    const dsel = root.querySelector('[data-calfilter="calDepto"]');
    expect(dsel).toBeTruthy();
    change(dsel, 'Larvicultura');
    click(root.querySelector('[data-cal-ap="perfil"]'));
    // Navegación de mes propia de Calidad de Agua no rompe.
    const cnav = root.querySelector('[data-cal-month]');
    if (cnav && !cnav.disabled) click(cnav);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal de alertas: abre desde el KPI y cierra', () => {
    mount();
    const kpi = root.querySelector('[data-mic-alerts]');
    expect(kpi).toBeTruthy();
    click(kpi);
    expect(root.querySelector('#micAlertModal').classList.contains('is-open')).toBe(true);
    expect(root.querySelector('#micAlertBody').textContent.length).toBeGreaterThan(0);
    click(root.querySelector('[data-mic-alert-close]'));
    expect(root.querySelector('#micAlertModal').classList.contains('is-open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Excel: abre, ajusta rango y cierra (sin SheetJS solo alerta)', () => {
    mount();
    click(root.querySelector('[data-mic-ap="petri"]'));
    click(root.querySelector('[data-mic-xlsx]'));
    expect(root.querySelector('#micXlsxModal').classList.contains('is-open')).toBe(true);
    const from = root.querySelector('#micExpFrom');
    if (from) change(from, '2026-06-01');
    click(root.querySelector('[data-mic-xlsx-close]'));
    expect(root.querySelector('#micXlsxModal').classList.contains('is-open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('navegación de mes y toggle de tabla', () => {
    mount();
    const tog = root.querySelector('[data-mic-toggle]');
    if (tog) { click(tog); click(tog); }
    const prev = root.querySelector('[data-mic-month="-1"]');
    if (prev && !prev.disabled) click(prev);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
