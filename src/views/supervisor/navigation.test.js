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
    'V.Totales UFC': '5000', 'V.Amarillos UFC': '1200', 'V.Totales Nivel': 'Leve', 'V.Luminiscentes': 'Presente',
  });
  rows.push({
    _SheetOrigin: 'Microbiología', 'Fecha muestreo': '07/06/2026', Corrida: '573', 'Módulo/Sala': '1',
    Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal', 'TQ/N°': '1', 'Estadío': 'PL5',
    'V.Totales UFC': '8000', 'V.Amarillos UFC': '900', 'V.Totales Nivel': 'Moderado', 'V.Luminiscentes': 'Ausente',
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
  // Marea (hoja propia, referencia de sitio) → modal Mareas. 2 días para navegar.
  rows.push({
    _SheetOrigin: 'Marea', Fecha: '05/06/2026', 'Fase Lunar': 'Luna llena', '%Iluminación': '100', 'Tipo de Marea': 'Viva',
    'Pleamar 1': '04:55', 'Altura P1 (m)': '2.02', 'Bajamar 1': '10:55', 'Altura B1 (m)': '0.71',
    'Pleamar 2': '16:46', 'Altura P2 (m)': '1.92', 'Bajamar 2': '23:03', 'Altura B2 (m)': '0.40', 'Amplitud (m)': '1.62',
  });
  rows.push({
    _SheetOrigin: 'Marea', Fecha: '06/06/2026', 'Fase Lunar': 'Gibosa menguante', '%Iluminación': '98', 'Tipo de Marea': 'Muerta',
    'Pleamar 1': '05:29', 'Altura P1 (m)': '2.03', 'Bajamar 1': '11:30', 'Altura B1 (m)': '0.70',
    'Pleamar 2': '17:22', 'Altura P2 (m)': '1.93', 'Bajamar 2': '23:39', 'Altura B2 (m)': '0.40', 'Amplitud (m)': '1.63',
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
    ['[data-modcmp-open]', '[data-athist-open]', '[data-biomol-open]', '[data-micro-open]', '[data-desinf-open]', '[data-modday-open]', '[data-modmetric="sv"]', '[data-modtrace]']
      .forEach((sel) => { const b = root.querySelector(sel); if (b) click(b); });
    // El modal de métricas debe existir y poder abrirse
    expect(root.querySelector('#svModMetricModal')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal de métrica · botón de proyección en Supervivencia/Población, no en OD/Temp', async () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    const modal = root.querySelector('#svModMetricModal');
    const projBtn = modal.querySelector('#svModMetricProj');
    // Supervivencia: el botón de proyección es visible (draw() corre en rAF → esperamos).
    click(root.querySelector('[data-modmetric="sv"]'));
    await vi.waitFor(() => expect(projBtn.style.display).not.toBe('none'));
    expect(projBtn.getAttribute('aria-pressed')).toBe('false');
    // Al activarlo se calcula la proyección exponencial (nota bajo el gráfico; draw síncrono).
    click(projBtn);
    expect(projBtn.getAttribute('aria-pressed')).toBe('true');
    expect(modal.querySelector('#svModMetricNote').textContent).toContain('Proyección exponencial');
    // Población: mismo botón disponible; el toggle se resetea al reabrir.
    click(root.querySelector('[data-modmetric="pop"]'));
    expect(projBtn.getAttribute('aria-pressed')).toBe('false'); // reset síncrono en open()
    await vi.waitFor(() => expect(projBtn.style.display).not.toBe('none'));
    // OD (perfil horario): el botón de proyección se oculta.
    click(root.querySelector('[data-modmetric="od"]'));
    await vi.waitFor(() => expect(projBtn.style.display).toBe('none'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Resumen del día · KPIs ampliados (cosecha/bajas), deltas y eventos del día', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-modday-open]'));
    const modal = root.querySelector('#svModDayModal');
    expect(modal.classList.contains('sv-open')).toBe(true);
    // KPIs nuevos: Días a cosecha (proyección de módulo) + Bajas acumuladas.
    const kpis = modal.querySelector('#svModDayKpis');
    expect(kpis.textContent).toContain('Días a cosecha');
    expect(kpis.textContent).toContain('Bajas acum.');
    // Fijamos la fecha explícitamente (happy-dom no honra el atributo `selected` del
    // <option> vía innerHTML; en navegador real el modal arranca en la última fecha).
    const dateSel = modal.querySelector('#svModDayDate');
    dateSel.value = '07/06/2026';
    dateSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Deltas vs. día anterior (05→07/06): al menos un Δ visible.
    expect(modal.querySelectorAll('.sv-mday-delta').length).toBeGreaterThanOrEqual(1);
    // Eventos del día (07/06): 4 chips; micro=1, calidad de agua=2.
    const evEls = [...modal.querySelectorAll('.sv-mday-ev')];
    expect(evEls.length).toBe(4);
    expect(evEls[0].querySelector('b').textContent).toBe('1'); // 🔬 Microbiología
    expect(evEls[1].querySelector('b').textContent).toBe('2'); // 💧 Calidad de agua
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('Trazabilidad · tarjeta "Días proceso" abre el modal con las fichas y toggle "Todas"', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    const card = root.querySelector('[data-modtrace]');
    expect(card).toBeTruthy();
    expect(card.getAttribute('role')).toBe('button');
    click(card);
    const modal = root.querySelector('#svTraceModal');
    expect(modal).toBeTruthy();
    expect(modal.classList.contains('sv-open')).toBe(true);
    const types = [...modal.querySelectorAll('[data-trace-fid]')].map((c) => c.dataset.traceFid);
    expect(types).toEqual(['calidad', 'plg', 'poblacion', 'params', 'calagua', 'despacho', 'desinfeccion']);
    // Desde/Hasta se prellenan con el rango de fechas del módulo (ISO yyyy-mm-dd).
    expect(modal.querySelector('[data-trace-from]').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(modal.querySelector('[data-trace-to]').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // "Todas" desmarcado → desmarca todas.
    const all = modal.querySelector('[data-trace-all]');
    all.checked = false; all.dispatchEvent(new Event('change'));
    expect([...modal.querySelectorAll('[data-trace-fid]')].every((c) => !c.checked)).toBe(true);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Mareas · abre (Día: ola/KPIs/tabla), cambia a Mes, navega día y cierra', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    const btn = root.querySelector('[data-mareas-open]');
    expect(btn).toBeTruthy();
    click(btn);
    const modal = root.querySelector('#svMareasModal');
    expect(modal.classList.contains('sv-open')).toBe(true);
    // Vista Día (render síncrono en onOpen): curva de ola + tabla de lecturas + selector.
    click(modal.querySelector('[data-mareamode="dia"]'));
    expect(root.querySelector('.sv-marea-grid')).toBeTruthy();
    expect(root.querySelector('.sv-marea-wave')).toBeTruthy();
    expect(root.querySelector('.sv-marea-table')).toBeTruthy();
    // Ampliación (fullscreen) del perfil de marea: abre y cierra.
    click(root.querySelector('[data-marea-wave-fs]'));
    expect(root.querySelector('#mareaWaveFs').classList.contains('is-open')).toBe(true);
    click(root.querySelector('[data-marea-wave-fsclose]'));
    expect(root.querySelector('#mareaWaveFs').classList.contains('is-open')).toBe(false);
    // Cambiar a Mes → resumen del mes (6 estadísticos + régimen) y hosts de gráficos.
    click(modal.querySelector('[data-mareamode="mes"]'));
    expect(root.querySelectorAll('.sv-marea-stat').length).toBe(6);
    expect(root.querySelector('.sv-marea-vbar')).toBeTruthy(); // el régimen Viva/Muerta vive aquí
    expect(root.querySelector('#mareaTrendChart')).toBeTruthy();
    expect(root.querySelector('#mareaDonutChart')).toBeTruthy();
    // Los estadísticos muestran valores, no NaN ni -Infinity.
    [...root.querySelectorAll('.sv-marea-stat-v')].forEach((el) => {
      expect(el.textContent).not.toMatch(/NaN|Infinity/);
    });
    // Fullscreen de un gráfico del Mes: abre y cierra.
    click(root.querySelector('[data-marea-chart-fs="trend"]'));
    expect(root.querySelector('#mareaChartFs').classList.contains('is-open')).toBe(true);
    click(root.querySelector('[data-marea-chart-fsclose]'));
    expect(root.querySelector('#mareaChartFs').classList.contains('is-open')).toBe(false);
    // Correlación → barra de fuente (Micro/Calidad) y matriz; alternar fuente no rompe.
    click(modal.querySelector('[data-mareamode="corr"]'));
    expect(root.querySelector('[data-corr-kind="micro"]')).toBeTruthy();
    expect(root.querySelector('[data-corr-mod]')).toBeNull(); // ya no hay filtro por módulo
    click(root.querySelector('[data-corr-kind="calagua"]'));
    expect(root.querySelector('[data-corr-kind="calagua"]').classList.contains('is-on')).toBe(true);
    // Volver a Día y navegar al día siguiente con ▶.
    click(modal.querySelector('[data-mareamode="dia"]'));
    const next = root.querySelector('.sv-marea-daynav [data-marea-day]:not([disabled])');
    if (next) click(next);
    // Cerrar.
    click(modal.querySelector('[data-mareas-close]'));
    expect(modal.classList.contains('sv-open')).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Mareas · la matriz de correlación se activa con el teclado (role=button)', () => {
    // La correlación exige ≥5 días emparejados: se amplía el fixture con 6 días de
    // marea + 6 muestras de microbiología para que aparezca al menos una celda con r.
    for (let i = 1; i <= 6; i++) {
      const dd = String(10 + i).padStart(2, '0');
      store.globalData.push({
        _SheetOrigin: 'Marea', Fecha: `${dd}/06/2026`, 'Fase Lunar': 'Luna llena', '%Iluminación': '80', 'Tipo de Marea': 'Viva',
        'Pleamar 1': '05:00', 'Altura P1 (m)': String(2 + i * 0.1), 'Bajamar 1': '11:00', 'Altura B1 (m)': String(0.7 - i * 0.05),
        'Amplitud (m)': String(1.3 + i * 0.15),
      });
      store.globalData.push({
        _SheetOrigin: 'Microbiología', 'Fecha muestreo': `${dd}/06/2026`, Corrida: '573', 'Módulo/Sala': '1',
        Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal', 'TQ/N°': '1', 'Estadío': 'PL2',
        'V.Totales UFC': String(1000 * i), 'V.Totales Nivel': 'Leve',
      });
    }
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-mareas-open]'));
    const modal = root.querySelector('#svMareasModal');
    click(modal.querySelector('[data-mareamode="corr"]'));
    const cell = root.querySelector('[data-corr-cell]');
    expect(cell).toBeTruthy(); // hay al menos una celda con coeficiente
    expect(cell.getAttribute('role')).toBe('button');
    // Enter debe seleccionarla igual que el ratón (antes solo respondía al clic).
    cell.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(root.querySelector('[data-corr-cell].is-sel')).toBeTruthy();
    expect(root.querySelector('#mareaCorrChart')).toBeTruthy(); // se dibuja la dispersión
    click(modal.querySelector('[data-mareas-close]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Mareas · Correlación: "Todo el periodo" amplía de verdad los días emparejados', () => {
    // Dos meses con datos: junio y julio. "Este mes" debe emparejar solo los de un mes;
    // "Todo el periodo", los de ambos. Si el memo de la matriz ignorase el periodo,
    // el segundo N saldría igual que el primero.
    const addDay = (mes, dd, i) => {
      store.globalData.push({
        _SheetOrigin: 'Marea', Fecha: `${dd}/${mes}/2026`, 'Fase Lunar': 'Luna llena', '%Iluminación': '80', 'Tipo de Marea': 'Viva',
        'Pleamar 1': '05:00', 'Altura P1 (m)': String(2 + i * 0.1), 'Bajamar 1': '11:00', 'Altura B1 (m)': String(0.7 - i * 0.05),
        'Amplitud (m)': String(1.3 + i * 0.15),
      });
      store.globalData.push({
        _SheetOrigin: 'Microbiología', 'Fecha muestreo': `${dd}/${mes}/2026`, Corrida: '573', 'Módulo/Sala': '1',
        Formato: 'Larvicultura · Muestra', 'Tipo de muestra': 'Animal', 'TQ/N°': '1', 'Estadío': 'PL2',
        'V.Totales UFC': String(1000 * i), 'V.Totales Nivel': 'Leve',
      });
    };
    for (let i = 1; i <= 6; i++) addDay('06', String(10 + i).padStart(2, '0'), i);
    for (let i = 1; i <= 6; i++) addDay('07', String(10 + i).padStart(2, '0'), i + 6);

    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-mareas-open]'));
    const modal = root.querySelector('#svMareasModal');
    click(modal.querySelector('[data-mareamode="corr"]'));
    // N máximo anunciado en los títulos de las celdas de la matriz.
    const maxN = () => Math.max(...[...root.querySelectorAll('.sv-marea-corr-cell')]
      .map((td) => { const m = /N=(\d+)/.exec(td.getAttribute('title') || ''); return m ? +m[1] : 0; }));

    const nMes = maxN();
    expect(nMes).toBe(6);                      // los 6 días del mes mostrado
    click(root.querySelector('[data-corr-period="all"]'));
    // Junio + julio (≥12; el fixture base aporta algún día suelto más). Si el memo
    // ignorase el periodo, aquí seguiría saliendo 6.
    expect(maxN()).toBeGreaterThanOrEqual(12);
    expect(maxN()).toBeGreaterThan(nMes);
    click(root.querySelector('[data-corr-period="month"]'));
    expect(maxN()).toBe(nMes);                 // y vuelve al mes sin arrastrar la matriz ampliada
    click(modal.querySelector('[data-mareas-close]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Mareas · Correlación: toggle de periodo y pills de mes inertes en "todo el periodo"', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-mareas-open]'));
    const modal = root.querySelector('#svMareasModal');
    click(modal.querySelector('[data-mareamode="corr"]'));
    // Arranca en "Este mes" y los pills de mes siguen operativos.
    expect(root.querySelector('[data-corr-period="month"]').classList.contains('is-on')).toBe(true);
    expect(root.querySelector('[data-marea-month]').disabled).toBe(false);
    // Ya no se anuncia significancia estadística en ninguna parte de la vista.
    expect(root.querySelector('.sv-marea-corr-hint').textContent).not.toContain('p<0.05');
    // "Todo el periodo": el selector de mes deja de aplicar → deshabilitado y atenuado.
    click(root.querySelector('[data-corr-period="all"]'));
    expect(root.querySelector('[data-corr-period="all"]').classList.contains('is-on')).toBe(true);
    const pill = root.querySelector('[data-marea-month]');
    expect(pill.disabled).toBe(true);
    expect(pill.classList.contains('is-inert')).toBe(true);
    // Y al volver a "Este mes" recuperan la interacción.
    click(root.querySelector('[data-corr-period="month"]'));
    expect(root.querySelector('[data-marea-month]').disabled).toBe(false);
    click(modal.querySelector('[data-mareas-close]'));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('modal Microbiología · V. Luminiscentes representado en placa, tabla y heatmap', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-micro-open]'));
    // Tabla: columna propia "V. Lumin." con estado presencia/ausencia.
    click(root.querySelector('[data-micmode="tabla"]'));
    const tabla = root.querySelector('.sv-micro-tablewrap');
    const tablaTxt = tabla.textContent;
    expect(tablaTxt).toContain('V. Lumin.');
    expect(tablaTxt).toContain('Pres.');
    // Columna Estadío junto a Formato (para identificar la muestra) con su valor real.
    const ths = [...tabla.querySelectorAll('thead th')].map((t) => t.textContent);
    expect(ths).toContain('Estadío');
    expect(ths.indexOf('Estadío')).toBe(ths.indexOf('Formato') + 1);   // justo a su lado
    expect(tablaTxt).toContain('PL2');                                  // estadío del fixture
    // Leyenda de semaforización (niveles), como las otras subvistas.
    expect(root.querySelector('.mic-legend')).toBeTruthy();
    expect(root.querySelector('.mic-legend').textContent).toContain('Moderado');
    // Heatmap: fila propia "V. Luminiscentes".
    click(root.querySelector('[data-micmode="heatmap"]'));
    expect(root.querySelector('.sv-micro-hm-lumin')).toBeTruthy();
    expect(root.querySelector('.sv-micro-hm').textContent).toContain('V. Luminiscentes');
    // Placa: chip de V. Luminiscentes en el resumen del día (clic explícito → render
    // síncrono; el render inicial del modal usa requestAnimationFrame).
    click(root.querySelector('[data-micmode="placa"]'));
    const lumChip = root.querySelector('.mic-pe-lumin');
    expect(lumChip).toBeTruthy();
    expect(lumChip.textContent).toContain('V. Luminiscentes');
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
    // Resalte del día más reciente: la fecha máxima (07/06) tiene 2 tanques → 2 filas
    // marcadas con .cw-row-recent + distintivo; las de 05/06 quedan sin marcar.
    const cwBodyRows = root.querySelectorAll('#svCwBody .sv-table tbody tr');
    expect(cwBodyRows.length).toBe(4);
    const recentRows = root.querySelectorAll('#svCwBody .sv-table tbody tr.cw-row-recent');
    expect(recentRows.length).toBe(2);
    expect(root.querySelectorAll('#svCwBody .cw-recent-tag').length).toBe(2);
    // El resalte va en las filas de arriba (orden descendente) y no en las antiguas.
    expect(cwBodyRows[0].classList.contains('cw-row-recent')).toBe(true);
    expect(cwBodyRows[3].classList.contains('cw-row-recent')).toBe(false);
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

  it('OM vs Tex · la tarjeta NOMBRA los tanques de cada marca', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-nav="omtex"]'));
    const chips = [...root.querySelectorAll('.omtex-card-tqs .omtex-tq')];
    // Sin los nombres la tarjeta solo decía "N tanques" y no se sabía cuál caía en cada marca.
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.textContent.trim().length > 0)).toBe(true);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('OM vs Tex · Δ de variables porcentuales en p.p. y cabeceras desambiguadas', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-nav="omtex"]'));
    const head = root.querySelector('.sv-table thead').textContent;
    expect(head).toContain('Δ absoluto');
    expect(head).toContain('Δ % relativo');
    // La fila de Supervivencia (ya es %) rotula su Δ absoluto en puntos porcentuales.
    const fila = [...root.querySelectorAll('.sv-table tbody tr')].find((tr) => /Supervivencia/.test(tr.textContent));
    expect(fila).toBeTruthy();
    expect(fila.children[3].textContent).toMatch(/p\.p\.|^—$/);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('OM vs Tex · el veredicto declara sobre cuántas variables COMPARABLES decide', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-nav="omtex"]'));
    const v = root.querySelector('.omtex-verdict');
    expect(v).toBeTruthy();
    const txt = v.textContent.replace(/\s+/g, ' ');
    const badges = [...v.querySelectorAll('.omtex-badge')];
    const empates = badges.filter((b) => b.classList.contains('tie')).length;
    const sinDato = badges.filter((b) => b.classList.contains('nodata')).length;
    const ganadas = badges.length - empates - sinDato;

    if (/rinde mejor/.test(txt)) {
      // El denominador cuenta los EMPATES (antes decía "gana en 3 de 3" habiendo 3 empates,
      // que se leía como pleno) y excluye las variables sin dato.
      const m = /gana en (\d+) de (\d+) variables? comparables?/.exec(txt);
      expect(m, txt).toBeTruthy();
      expect(Number(m[2])).toBe(ganadas + empates);
      expect(Number(m[2])).toBe(badges.length - sinDato);
    }
    // Guarda estructural: un badge "sin dato" nunca se presenta como empate.
    badges.filter((b) => b.classList.contains('nodata')).forEach((b) => {
      expect(b.textContent).toContain('sin dato');
      expect(b.textContent).not.toContain('empate');
    });
    expect(badges.filter((b) => b.classList.contains('tie')).every((b) => /empate/.test(b.textContent))).toBe(true);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('OM vs Tex · cambiar la variable de tendencia no rompe y reusa las series', () => {
    const root = mount();
    click(root.querySelector('.sv-card[data-nav="module"]'));
    click(root.querySelector('[data-nav="omtex"]'));
    const pills = [...root.querySelectorAll('[data-omtrend]')];
    expect(pills.length).toBeGreaterThan(1);
    // Ida y vuelta sobre la misma variable: la 2ª vez sale del memo.
    click(pills[1]); click(pills[0]); click(pills[1]);
    expect(pills[1].classList.contains('is-active')).toBe(true);
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
