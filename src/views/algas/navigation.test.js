// @vitest-environment happy-dom
// Test de regresión de navegación integral de Algas: renderiza la vista con datos
// sintéticos de Lab_Algas y ejercita sub-vistas por categoría, filtros, modos de la
// curva de crecimiento, fullscreen, Resumen del día, los indicadores del mes
// (Biomasa/Descarte/Cobertura), Índices, export y navegación de mes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { algasView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const A = (o) => ({ _SheetOrigin: 'Lab_Algas', ...o });

function synthData() {
  const rows = [];
  // Sistemas de varias categorías, con series diarias para curvas.
  const sysList = [
    ['M1', 'Masivos'], ['M2', 'Masivos'], ['PM1', 'Premasivos'],
    ['C1', 'Carboys'], ['PBR1', 'PBR'],
  ];
  const dates = ['02/06/2026', '04/06/2026', '06/06/2026'];
  sysList.forEach(([sis], si) => {
    dates.forEach((f, di) => {
      rows.push(A({
        Fecha: f, Corrida_Larv: '573', Modulo_Larv: 'M0' + ((si % 3) + 1), 'Área_Algas': 'A1',
        Sistema: sis, Dia_Proceso: String(di + 1), Cel_ml: String(1000 + di * 800 + si * 200),
        Protozoarios: String(di === 2 ? 6 : 2), Ciliados: String(1), Filamentosos: String(0),
        Especie: ['TW', 'IS', 'TT'][si % 3], Salinidad_ppt: '30', pH: '8.0', Temperatura_C: '26',
        'Intensidad_Luz_%': '80', Descartado: di === 2 && si === 0 ? 'Sí' : 'No',
        Observaciones: di === 2 ? 'revisar densidad' : '', 'Técnico': 'Ana',
      }));
    });
  });
  // Fundas (categoría de barras, con Lote) — dos lotes.
  ['A', 'B'].forEach((lote, li) => {
    ['02/06/2026', '04/06/2026'].forEach((f, di) => {
      rows.push(A({
        Fecha: f, Corrida_Larv: '573', Modulo_Larv: 'M01', 'Área_Algas': 'A2',
        Sistema: 'FP', Lote: lote, Dia_Proceso: String(di + 1), Cel_ml: String(500 + di * 300 + li * 100),
        Protozoarios: '1', Especie: 'CH', Salinidad_ppt: '31', pH: '8.1', Temperatura_C: '25', 'Técnico': 'Beto',
      }));
    });
  });
  // Mes anterior (mayo, corrida 567) para deltas vs mes previo.
  rows.push(A({ Fecha: '10/05/2026', Corrida_Larv: '567', Modulo_Larv: 'M02', Sistema: 'M1', Dia_Proceso: '1', Cel_ml: '900', Protozoarios: '2', Descartado: 'No', 'Técnico': 'Ana' }));
  return rows;
}

function click(el) { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function change(el, value) { if (el) { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); } }

let errSpy, root;
beforeEach(() => {
  store.role = 'administrativo';
  store.currentView = 'algas';
  store.globalData = synthData();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

// vState es singleton de módulo: normaliza a la categoría Masivos y modo Líneas.
function mount() {
  algasView(root);
  const masivos = root.querySelector('[data-alg-sub="Masivos"]');
  if (masivos && !masivos.classList.contains('is-active')) click(masivos);
  const gv = root.querySelector('[data-algfilter="growthView"]');
  if (gv && gv.value !== 'lines') change(gv, 'lines');
  return root;
}

describe('Algas · harness de navegación integral', () => {
  it('render base con KPIs, subnav por categoría y análisis del mes', () => {
    mount();
    expect(root.querySelector('.alg-kpis')).toBeTruthy();
    expect(root.querySelector('.alg-subnav')).toBeTruthy();
    expect(root.querySelector('.alg-mind-row')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('cambia de subvista de categoría (Masivos→Fundas→PBR)', () => {
    mount();
    ['Fundas', 'PBR', 'Masivos'].forEach((cat) => {
      const pill = root.querySelector(`[data-alg-sub="${cat}"]`);
      if (pill) {
        click(pill);
        // el clic re-renderiza toda la vista → re-consultar el pill actualizado
        const active = root.querySelector(`[data-alg-sub="${cat}"]`);
        expect(active && active.classList.contains('is-active')).toBe(true);
      }
    });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modos de la curva de crecimiento + selector de sistema', () => {
    mount();
    const gv = root.querySelector('[data-algfilter="growthView"]');
    if (gv) ['norm', 'smult', 'heatmap', 'lines'].forEach((m) => change(gv, m));
    const sysSel = root.querySelector('[data-algfilter="sysSel"]');
    if (sysSel && sysSel.options.length > 1) change(sysSel, sysSel.options[1].value);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('fullscreen de un gráfico (⛶) abre y cierra', () => {
    mount();
    const fs = root.querySelector('[data-alg-fs]');
    expect(fs).toBeTruthy();
    click(fs);
    expect(root.querySelector('#algFsModal').classList.contains('sv-open')).toBe(true);
    click(root.querySelector('[data-alg-fs-close]'));
    expect(root.querySelector('#algFsModal').classList.contains('sv-open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('Resumen del día: abre, navega y cierra', () => {
    mount();
    click(root.querySelector('[data-alg-daysum]'));
    expect(root.querySelector('#algDayModal').classList.contains('sv-open')).toBe(true);
    const prev = root.querySelector('[data-alg-day-nav="-1"]');
    if (prev && !prev.disabled) click(prev);
    click(root.querySelector('[data-alg-day-close]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('indicadores del mes: Biomasa, Descarte, Cobertura (con clic de día) e Índices', () => {
    mount();
    click(root.querySelector('[data-alg-open="bio"]'));
    expect(root.querySelector('#algBioModal').classList.contains('sv-open')).toBe(true);
    click(root.querySelector('[data-alg-open="desc"]'));
    expect(root.querySelector('#algDescModal').classList.contains('sv-open')).toBe(true);
    click(root.querySelector('[data-alg-open="cov"]'));
    expect(root.querySelector('#algCovModal').classList.contains('sv-open')).toBe(true);
    const covDay = root.querySelector('[data-cov-day]');
    // El día del calendario lleva la FECHA COMPLETA (no el nº de día): el detalle la muestra.
    if (covDay) {
      expect(covDay.dataset.covDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      click(covDay);
      expect(root.querySelector('#algCovDayDetail').textContent).toContain(covDay.dataset.covDay);
    }
    click(root.querySelector('[data-alg-indices]'));
    expect(root.querySelector('#algIndicesModal').classList.contains('sv-open')).toBe(true);
    expect(root.querySelector('#algIndicesModalBody').textContent).toContain('contaminación');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('Control sanitario sin datos de micro: abre y muestra el vacío, sin error', () => {
    mount();
    const btn = root.querySelector('[data-alg-sanit]');
    expect(btn).toBeTruthy();
    click(btn);
    expect(root.querySelector('#algSanitModal').classList.contains('sv-open')).toBe(true);
    // synthData no trae micro ni cloro de algas → estado vacío explicativo, no un crash.
    expect(root.querySelector('#algSanitModalBody').textContent).toContain('Sin control sanitario de algas');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('Control sanitario con micro y cloro: pinta semáforo, sistemas, tendencia y cloro', () => {
    // Las muestras de algas NO traen corrida (dato real): se vinculan al mes por FECHA
    // dentro de la ventana del mes activo. synthData tiene junio 2026 (corrida 573), así
    // que las fechas de junio caen dentro. El sistema es texto en "Tipo de muestra"
    // (micro) y en "Muestras" (calidad de agua). Área 'algas': V.Totales UFC ≥ 50 = Elevado.
    const mrow = (sistema, ufc, fecha) => ({
      _SheetOrigin: 'Microbiología', Formato: 'Algas Fundas y Masivos', 'Fecha muestreo': fecha,
      'Tipo de muestra': sistema, 'V.Totales UFC': String(ufc), Responsable: 'Ana',
    });
    const crow = (muestra, libre, fecha) => ({
      _SheetOrigin: 'Calidad de Agua', Departamento: 'Algas', Formato: 'Algas',
      'Fecha muestreo': fecha, Muestras: muestra, 'Cloro libre (mg/L)': String(libre),
    });
    store.globalData = synthData().concat([
      mrow('Masivo 1', 100, '02/06/2026'),           // Masivos · Elevado → alerta
      mrow('Masivo 1', 2, '02/06/2026'),             // Masivos · Mínimo
      mrow('Fundas producción 2', 20, '05/06/2026'), // Fundas · Moderado → alerta
      crow('Masivo 6 Mod 1', '0,02', '03/06/2026'),  // cloro detectable
      crow('Funda matriz', '0', '04/06/2026'),
    ]);
    mount();
    click(root.querySelector('[data-alg-sanit]'));
    const body = root.querySelector('#algSanitModalBody');
    expect(body.textContent).toContain('Semáforo sanitario');
    expect(body.textContent).toContain('Patógenos por sistema');
    expect(body.textContent).toContain('Masivos');
    expect(body.textContent).toContain('Fundas');
    // Matriz Sistema × Patógeno (heatmap): existe la tabla y una celda con dato.
    expect(body.querySelector('.alg-sanit-mat')).toBeTruthy();
    const flip = body.querySelector('[data-sanit-flip]');
    expect(flip).toBeTruthy();
    // La celda tiene las dos caras: nivel (frente) y valor (dorso).
    expect(flip.querySelector('.alg-flip-f')).toBeTruthy();
    expect(flip.querySelector('.alg-flip-b')).toBeTruthy();
    // Al hacer clic se voltea; otro clic la devuelve.
    expect(flip.classList.contains('is-flipped')).toBe(false);
    click(flip);
    expect(flip.classList.contains('is-flipped')).toBe(true);
    click(flip);
    expect(flip.classList.contains('is-flipped')).toBe(false);
    // Barras por patógeno (reemplazo de la tendencia): canvas presente.
    expect(body.querySelector('#algSanitBars')).toBeTruthy();
    // Sección de calidad de agua (cloro).
    expect(body.textContent).toContain('Cloro');
    expect(body.textContent).toContain('cloro libre presente');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('export Excel: abre modal, ajusta rango y cierra', () => {
    mount();
    const expBtn = root.querySelector('[data-alg-export]');
    if (expBtn) {
      click(expBtn);
      expect(root.querySelector('#algExportModal').classList.contains('sv-open')).toBe(true);
      const from = root.querySelector('#algExpFrom');
      if (from) change(from, '2026-06-01');
      click(root.querySelector('[data-alg-exp-close]'));
    }
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('toggles de tablas y navegación de mes', () => {
    mount();
    root.querySelectorAll('[data-alg-toggle]').forEach((t) => { click(t); click(t); });
    const prev = root.querySelector('[data-month-nav="-1"]');
    if (prev && !prev.disabled) click(prev);
    expect(errSpy).not.toHaveBeenCalled();
  });

  // `vState.month` es singleton de módulo y otros tests navegan hacia atrás: situarse
  // siempre en el mes MÁS RECIENTE para no depender del orden de ejecución.
  const gotoLastMonth = () => {
    for (let i = 0; i < 24; i++) {
      const next = root.querySelector('[data-month-nav="1"]');
      if (!next || next.disabled) break;
      click(next);
    }
  };
  const covCard = () => root.querySelector('[data-alg-open="cov"]');

  it('cobertura normal: la tarjeta muestra la fracción días-con-dato / días del eje', () => {
    mount();
    gotoLastMonth();
    expect(covCard().querySelector('.alg-mind-val').textContent.trim()).toMatch(/^\d+\/\d+ días$/);
    expect(covCard().querySelector('.alg-mind-warn')).toBeFalsy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('con una fecha mal capturada la tarjeta NO anuncia cobertura perfecta', () => {
    // Un año mal tecleado dentro de la MISMA corrida estira el eje por encima de
    // COV_MAX_SPAN (120 días) → covSpan entra en modo `sparse` y su eje pasa a ser SOLO
    // los días CON dato. La fracción quedaba entonces en "N/N días", es decir 100 % de
    // cobertura justo cuando el dato es más sospechoso (antes de covSpan mostraba una
    // fracción parcial contra los días del mes calendario, que al menos no mentía a favor).
    store.globalData = synthData().concat([A({
      Fecha: '02/06/2062', Corrida_Larv: '573', Modulo_Larv: 'M01', Sistema: 'M1',
      Dia_Proceso: '1', Cel_ml: '1000', Protozoarios: '1', 'Técnico': 'Ana',
    })]);
    mount();
    gotoLastMonth();
    const val = covCard().querySelector('.alg-mind-val').textContent.trim();
    expect(val).not.toMatch(/^(\d+)\/\1 días$/);   // nada de "4/4 días"
    expect(covCard().querySelector('.alg-mind-warn')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
