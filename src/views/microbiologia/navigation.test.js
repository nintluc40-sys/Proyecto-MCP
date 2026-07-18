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
  // Segundo módulo de Larvicultura (Calidad de Agua) → habilita el filtro de Módulo por chips
  // y un 2.º estadío ('N5 (MB)') para probar el orden biológico del filtro.
  rows.push({
    _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573',
    Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Tipo de muestra': 'Agua',
    'Módulo': '2', 'Estadío': 'N5 (MB)', 'TQ/N°': '1',
    pH: '8.1', 'S‰': '31', Alcalinidad: '135', // todo dentro de rango
  });
  // Maduración · Ensayo → habilita el apartado Ensayo (parejas antes/después).
  rows.push({
    _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '07/06/2026', Corrida: '573',
    Departamento: 'Maduración', Formato: 'Maduración · Ensayo', Sala: 'Sala A', 'TQ/N°': '5',
    'S‰ antes': '30', 'S‰ después': '33', 'Calcio antes': '380', 'Calcio después': '420',
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

  it('sub-vista General: tablero de estado (instrumentos + scorecard por área + desglose + accesos)', () => {
    mount();
    click(root.querySelector('[data-mic-sub="general"]'));
    expect(root.querySelector('.mic-general')).toBeTruthy();
    // KPIs con estilo de instrumentos (5 tarjetas .cal-inst, igual que Calidad de Agua).
    expect(root.querySelectorAll('.mic-general .cal-inst-strip .cal-inst').length).toBe(5);
    // Scorecard por área (≥2: Larvicultura y Maduración presentes) con WQI numérico.
    const rows = root.querySelectorAll('.gen-sc-row[data-gen-depto]');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector('.gen-sc-wqi')).toBeTruthy();
    // Barra de mes propia del panorama.
    expect(root.querySelector('[data-gen-month]')).toBeTruthy();
    // Tocar una fila abre el DESGLOSE (modal), NO navega.
    const larv = [...rows].find((r) => r.dataset.genDepto === 'Larvicultura');
    expect(larv).toBeTruthy();
    click(larv);
    expect(root.querySelector('#genDeptoModal').classList.contains('is-open')).toBe(true);
    expect(root.querySelector('#genDeptoBody').textContent.length).toBeGreaterThan(0);
    // Sigue en General (no navegó).
    expect(root.querySelector('[data-mic-sub="general"]').classList.contains('is-active')).toBe(true);
    click(root.querySelector('[data-gen-depto-close]'));
    expect(root.querySelector('#genDeptoModal').classList.contains('is-open')).toBe(false);
    // Tocar un instrumento (KPI) abre su modal de RESUMEN, NO navega.
    const kpi = root.querySelector('.mic-general .cal-inst[data-gen-kpi="muestras"]');
    expect(kpi).toBeTruthy();
    click(kpi);
    expect(root.querySelector('#genKpiModal').classList.contains('is-open')).toBe(true);
    expect(root.querySelector('#genKpiBody').textContent.length).toBeGreaterThan(0);
    expect(root.querySelector('[data-mic-sub="general"]').classList.contains('is-active')).toBe(true);
    click(root.querySelector('[data-gen-kpi-close]'));
    expect(root.querySelector('#genKpiModal').classList.contains('is-open')).toBe(false);
    // Acceso directo al detalle: el botón sí navega a Bacteriología.
    click(root.querySelector('[data-gen-goto="bacteriologia"]'));
    expect(root.querySelector('[data-mic-sub="bacteriologia"]').classList.contains('is-active')).toBe(true);
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

  it('sub-vista Calidad de Agua: Panel del Analista + doble lente (Analizador/Por ubicación/Ensayo)', () => {
    mount();
    click(root.querySelector('[data-mic-sub="calidad"]'));
    expect(root.querySelector('.mic-calagua')).toBeTruthy();
    // Franja de instrumentos (KPIs con identidad + micro-viz): 4 tarjetas + barra de severidad.
    expect(root.querySelectorAll('.cal-inst-strip .cal-inst').length).toBe(4);
    expect(root.querySelector('.cal-inst-seg')).toBeTruthy();
    // Panel del Analista: WQI global + diagnóstico automático (hay Nitrito fuera).
    const analyst = root.querySelector('.cal-analyst');
    expect(analyst).toBeTruthy();
    expect(root.querySelector('.cal-an-wqi').textContent).toMatch(/\d/);
    expect(analyst.querySelector('.cal-an-text').textContent.length).toBeGreaterThan(0);
    // Landing = Analizador (por parámetro): pantalla + banco de cartuchos + gráfico con banda.
    expect(root.querySelector('.cal-analyzer')).toBeTruthy();
    expect(root.querySelector('.cal-anz-screen')).toBeTruthy();
    expect(root.querySelector('.cal-anz-val').textContent.length).toBeGreaterThan(0);
    expect(root.querySelector('#calTrendChart')).toBeTruthy();
    const carts = root.querySelectorAll('.cal-cart[data-cal-param]');
    expect(carts.length).toBeGreaterThanOrEqual(1);
    const otherC = [...carts].find((p) => !p.classList.contains('is-on'));
    if (otherC) { const pk = otherC.dataset.calParam; click(otherC); expect(root.querySelector('.cal-cart.is-on').dataset.calParam).toBe(pk); }
    // Modos de gráfico: Control (Shewhart, mismo canvas) y Distribución (boxplot SVG).
    click(root.querySelector('[data-cal-chartmode="control"]'));
    expect(root.querySelector('.cal-anz-mode.is-on').dataset.calChartmode).toBe('control');
    expect(root.querySelector('#calTrendChart')).toBeTruthy();
    click(root.querySelector('[data-cal-chartmode="distribucion"]'));
    expect(root.querySelector('.cal-bx-svg')).toBeTruthy();
    expect(root.querySelector('#calTrendChart')).toBeFalsy(); // distribución no usa canvas
    click(root.querySelector('[data-cal-chartmode="tendencia"]'));
    expect(root.querySelector('#calTrendChart')).toBeTruthy();
    // Botones de export presentes; el KPI de alertas abre y cierra su modal.
    expect(root.querySelector('[data-cal-export]')).toBeTruthy();
    expect(root.querySelector('[data-cal-xlsx]')).toBeTruthy();
    const alertKpi = root.querySelector('[data-cal-alerts]');
    expect(alertKpi).toBeTruthy(); // hay Nitrito fuera de rango
    click(alertKpi);
    expect(root.querySelector('#calAlertModal').classList.contains('is-open')).toBe(true);
    expect(root.querySelector('#calAlertBody').textContent.length).toBeGreaterThan(0);
    click(root.querySelector('[data-cal-alert-close]'));
    expect(root.querySelector('#calAlertModal').classList.contains('is-open')).toBe(false);
    // Por ubicación: mapa de riesgo Módulo×Tanque + fichas técnicas.
    click(root.querySelector('[data-cal-ap="ubicacion"]'));
    expect(root.querySelector('.cal-riskmap')).toBeTruthy();
    const cell = root.querySelector('.cal-rm-cell[data-cal-tank]');
    expect(cell).toBeTruthy();
    // Comparador de coordenadas paralelas (2 tanques · varios ejes con rango).
    const pc = root.querySelector('.cal-parallel');
    expect(pc).toBeTruthy();
    expect(pc.querySelectorAll('.cal-pc-tank[data-cal-tank]').length).toBeGreaterThanOrEqual(2);
    // Celda del mapa → modal de tanque (detalle-foto).
    click(cell);
    expect(root.querySelector('#calTankModal').classList.contains('is-open')).toBe(true);
    expect(root.querySelector('#calTankBody').textContent.length).toBeGreaterThan(0);
    click(root.querySelector('[data-cal-tank-close]'));
    expect(root.querySelector('#calTankModal').classList.contains('is-open')).toBe(false);
    // Ficha técnica → modal DISTINTO: perfil temporal (evolución).
    const ficha = root.querySelector('.cal-ficha[data-cal-ficha]');
    expect(ficha).toBeTruthy();
    click(ficha);
    expect(root.querySelector('#calFichaModal').classList.contains('is-open')).toBe(true);
    expect(root.querySelector('#calFichaBody .cal-ft-row')).toBeTruthy();
    click(root.querySelector('[data-cal-ficha-close]'));
    expect(root.querySelector('#calFichaModal').classList.contains('is-open')).toBe(false);
    // Comparador · estilo alternativo Small multiples.
    click(root.querySelector('[data-cal-cmpview="multiples"]'));
    expect(root.querySelector('.cal-smult')).toBeTruthy();
    expect(root.querySelectorAll('.cal-sm-row[data-cal-tank]').length).toBeGreaterThanOrEqual(2);
    // Restaurar estilo por defecto (vState es de módulo: evita fugas a otros tests).
    click(root.querySelector('[data-cal-cmpview="paralelas"]'));
    expect(root.querySelector('.cal-riskmap')).toBeTruthy();
    // Colapsar/expandir un módulo de las fichas no rompe.
    const modHead = root.querySelector('[data-cal-mod]');
    if (modHead) click(modHead);
    // Apartado Ensayo (Maduración·Ensayo presente): dumbbell + tabla antes/después.
    const enBtn = root.querySelector('[data-cal-ap="ensayo"]');
    expect(enBtn).toBeTruthy();
    click(enBtn);
    expect(root.querySelector('#calEnsayoChart')).toBeTruthy();
    expect(root.querySelector('.cal-en-table')).toBeTruthy();
    click(root.querySelector('[data-cal-ap="analizador"]'));
    // Cascada: filtrar por departamento (2 deptos: Larvicultura/Maduración) no rompe.
    const dsel = root.querySelector('[data-calfilter="calDepto"]');
    expect(dsel).toBeTruthy();
    change(dsel, 'Larvicultura');
    click(root.querySelector('[data-cal-ap="ubicacion"]'));
    // Navegación de mes propia de Calidad de Agua no rompe.
    const cnav = root.querySelector('[data-cal-month]');
    if (cnav && !cnav.disabled) click(cnav);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('Calidad de Agua · filtro Módulo por chips (multi), orden de estadío, franja WQI y modales de KPI', () => {
    mount();
    click(root.querySelector('[data-mic-sub="calidad"]'));
    // Filtro de Módulo = chips (≥2 módulos: 1 y 2).
    const chips = root.querySelectorAll('.cal-mchip[data-caldim-chip="modulo"]');
    expect(chips.length).toBeGreaterThanOrEqual(2);
    click(chips[0]);
    expect(root.querySelector('.cal-mchip.is-on')).toBeTruthy();
    click(root.querySelector('.cal-mchip.is-on')); // re-query tras re-render → desmarcar, vuelve a todos
    // Orden de estadío: 'N5 (MB)' antes que 'Z2'.
    const estSel = root.querySelector('[data-caldim="estadio"]');
    expect(estSel).toBeTruthy();
    const opts = [...estSel.options].map((o) => o.value).filter(Boolean);
    expect(opts.indexOf('N5 (MB)')).toBeGreaterThanOrEqual(0);
    expect(opts.indexOf('N5 (MB)')).toBeLessThan(opts.indexOf('Z2'));
    // Franja de clasificación del WQI presente en el Panel del Analista.
    expect(root.querySelector('.cal-wqisc')).toBeTruthy();
    // Modales de detalle de KPI: Muestras / Cumplimiento / Perfil abren y cierran.
    ['muestras', 'cumplimiento', 'perfil'].forEach((which) => {
      click(root.querySelector(`[data-cal-kpi="${which}"]`));
      expect(root.querySelector('#calKpiModal').classList.contains('is-open')).toBe(true);
      expect(root.querySelector('#calKpiBody').textContent.length).toBeGreaterThan(0);
      click(root.querySelector('[data-cal-kpi-close]'));
      expect(root.querySelector('#calKpiModal').classList.contains('is-open')).toBe(false);
    });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('sub-vista Calidad de Agua · editor de rangos (Factores): abre, pre-rellena, guarda y restablece', () => {
    mount();
    click(root.querySelector('[data-mic-sub="calidad"]'));
    const isOpen = () => root.querySelector('#calFactModal').classList.contains('is-open');
    // Abrir + pre-relleno con el rango efectivo (base).
    click(root.querySelector('[data-cal-factors]'));
    expect(isOpen()).toBe(true);
    const phMin = root.querySelector('[data-cal-rmin="ph"]');
    expect(phMin).toBeTruthy();
    expect(phMin.value).toBe('7.5');
    // Cerrar con ✕ (no depende de almacenamiento).
    click(root.querySelector('[data-cal-fact-close]'));
    expect(isOpen()).toBe(false);
    // Editar + guardar no lanza error (si no hay localStorage, avisa y no persiste).
    click(root.querySelector('[data-cal-factors]'));
    root.querySelector('[data-cal-rmin="ph"]').value = '7';
    click(root.querySelector('[data-cal-fact-save]'));
    // Restablecer deja el estado limpio (reabrir si el guardado cerró el modal).
    if (!isOpen()) click(root.querySelector('[data-cal-factors]'));
    click(root.querySelector('[data-cal-fact-reset]'));
    expect(isOpen()).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('sub-vista Calidad de Agua · editor de rangos: un rango invertido (mín > máx) aborta el guardado', () => {
    mount();
    click(root.querySelector('[data-mic-sub="calidad"]'));
    const isOpen = () => root.querySelector('#calFactModal').classList.contains('is-open');
    click(root.querySelector('[data-cal-factors]'));
    expect(isOpen()).toBe(true);
    // pH base = 7.5–8.5; fuerzo mín 9 > máx 8.5 → guardado inválido.
    root.querySelector('[data-cal-rmin="ph"]').value = '9';
    click(root.querySelector('[data-cal-fact-save]'));
    expect(isOpen()).toBe(true); // el modal NO se cerró: el guardado se abortó
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

  it('Calidad de Agua: el Cumplimiento NO se infla con muestras sin parámetros evaluables', () => {
    // Muestras que solo miden parámetros SIN rango objetivo (Temperatura/Salinidad):
    // no hay nada que evaluar → el cumplimiento debe ser "—", no un falso 100%.
    store.globalData = [
      { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '05/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', 'TQ/N°': '1', 'Temperatura': '30', 'S‰': '32' },
      { _SheetOrigin: 'Calidad de Agua', 'Fecha muestreo': '06/06/2026', Corrida: '573', Departamento: 'Larvicultura', Formato: 'Larvicultura', 'Módulo': '1', 'TQ/N°': '2', 'Temperatura': '31', 'S‰': '33' },
    ];
    microbiologiaView(root);
    click(root.querySelector('[data-mic-sub="calidad"]'));
    const insts = [...root.querySelectorAll('.cal-inst-strip .cal-inst')];
    const cumpl = insts.find((el) => /Cumplimiento/.test(el.textContent));
    expect(cumpl.querySelector('.cal-inst-v').textContent).toBe('—');
    expect(errSpy).not.toHaveBeenCalled();
  });
});
