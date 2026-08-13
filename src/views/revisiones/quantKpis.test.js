// @vitest-environment happy-dom
/* ============================================================
   REVISIONES · KPIs cuantitativos, gráfico Condición y tendencia por KPI

   El stub de charts.js GRABA cada configuración, así que las pruebas comprueban lo que
   de verdad se dibuja (series, rótulos y datos) y no sólo que no reviente.

   Fixture: dos módulos con valores DISTINTOS por variable. Eso es lo que hace que las
   pruebas de filtros prueben algo — con el mismo valor en todos los módulos, filtrar no
   cambiaría el promedio y el verde no demostraría nada.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const drawn = [];
vi.mock('../../core/charts.js', () => ({
  // Se graba también si el modal de tendencia estaba ABIERTO en el instante del dibujo:
  // `.rv-modal` es display:none, así que crear el gráfico antes de abrirlo le daría un
  // canvas de 0×0. Sin capturarlo aquí, comprobarlo despues del clic pasa siempre.
  makeChart: (id, cfg) => {
    drawn.push({
      id, cfg,
      trendAbierto: !!document.querySelector('#rv-trend-modal')?.classList.contains('rv-open'),
    });
    return null;
  },
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { revisionesView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

const R = (o) => ({ _SheetOrigin: 'Registro_Supervision', ...o });

/** Corrida 573 → mes 5. M1 y M2 con valores distintos y separables. */
function datos({ nuevas = true } = {}) {
  const rows = [];
  [['Módulo 1', 10], ['Módulo 2', 40]].forEach(([mod, base], mi) => {
    ['02/06/2026', '04/06/2026'].forEach((f, di) => {
      rows.push(R({
        Corrida: '573', 'Módulo': mod, Siembra: String(mi + 1), Supervisor: 'Ana', Fecha: f,
        'Estadío_observado': 'M1', 'Tipo_revisión': 'Matutina',
        'Deformidad_%': String(base + di), '% Atraso': String(base + 1), '% Protusión': String(base + 2),
        '% No viables': String(base + 3), 'Semillenas (%)': String(base + 4), 'Vacías (%)': String(base + 5),
        ...(nuevas ? { Flacidez: String(base), Necrosis: String(base + 6), Disparidad: String(base + 7) } : {}),
        Observaciones: 'Continuar', 'Acción': 'Continuar',
      }));
    });
  });
  return rows;
}

const change = (el, v) => { if (el) { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); } };
const click = (el) => { if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };

let root, errSpy;
/** Renderiza y normaliza a Fase 1 (vState es singleton de módulo y persiste). */
function mount() {
  revisionesView(root);
  for (let i = 0; i < 4; i++) {
    const f = ['mod', 'corrida', 'siembra'].map((d) => root.querySelector(`[data-rvfilter="${d}"]`)).find((el) => el && el.value);
    if (!f) break;
    change(f, '');
  }
  return root;
}
const kpiPorRotulo = (txt) => [...root.querySelectorAll('.rv-kpi')].find((k) => k.textContent.includes(txt));
const valorKpi = (txt) => kpiPorRotulo(txt)?.querySelector('.rv-kpi-value')?.textContent;
const chart = (id) => drawn.filter((d) => d.id === id).pop();

beforeEach(() => {
  drawn.length = 0;
  store.role = 'administrativo';
  store.currentView = 'revisiones';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = datos();
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

describe('revisiones · KPIs de las variables nuevas', () => {
  it('aparecen los 3 KPIs nuevos con su promedio', () => {
    mount();
    // Flacidez: M1=10, M2=40 en 2 fechas cada uno → promedio 25.
    expect(valorKpi('Flacidez prom.')).toBe('25.0%');
    expect(valorKpi('Necrosis prom.')).toBe('31.0%');
    expect(valorKpi('Disparidad prom.')).toBe('32.0%');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('los 9 KPIs cuantitativos son clicables', () => {
    mount();
    const ids = [...root.querySelectorAll('[data-rvtrend]')].map((b) => b.dataset.rvtrend);
    expect(ids).toEqual(['deformidad', 'atraso', 'protusion', 'noviables', 'vacias', 'semillenas',
      'flacidez', 'necrosis', 'disparidad']);
    // Son <button> con las clases del KPI interactivo que ya existía (Historial).
    root.querySelectorAll('[data-rvtrend]').forEach((b) => {
      expect(b.tagName).toBe('BUTTON');
      expect(b.classList.contains('rv-kpi-btn')).toBe(true);
    });
  });

  it('sin datos en las columnas nuevas, sus KPIs NO se dibujan', () => {
    store.globalData = datos({ nuevas: false });
    mount();
    expect(kpiPorRotulo('Flacidez prom.')).toBeFalsy();
    expect(kpiPorRotulo('Necrosis prom.')).toBeFalsy();
    expect(kpiPorRotulo('Disparidad prom.')).toBeFalsy();
    // …pero las que siempre se mostraban siguen ahí.
    expect(valorKpi('Deformidad prom.')).toBeTruthy();
    expect(root.querySelectorAll('[data-rvtrend]').length).toBe(6);
  });
});

describe('revisiones · gráfico Condición', () => {
  it('dibuja las 3 series nuevas con sus rótulos', () => {
    mount();
    const c = chart('rvCond');
    expect(c).toBeTruthy();
    expect(c.cfg.data.datasets.map((d) => d.label)).toEqual(['% Flacidez', '% Necrosis', '% Disparidad']);
    expect(c.cfg.type).toBe('bar');
  });

  it('promedia por día sobre los dos módulos', () => {
    mount();
    const c = chart('rvCond');
    // Día 02/06 y 04/06; Flacidez M1=10, M2=40 en ambos → 25 los dos días.
    expect(c.cfg.data.datasets[0].data).toEqual([25, 25]);
  });

  it('los gráficos previos conservan sus series y su orden', () => {
    mount();
    expect(chart('rvMorfNum').cfg.data.datasets.map((d) => d.label))
      .toEqual(['% Atraso', '% Protusión', '% Deformidad', '% No viables']);
    expect(chart('rvAlim').cfg.data.datasets.map((d) => d.label))
      .toEqual(['Semillenas %', 'Vacías %']);
  });

  it('sin datos nuevos no se dibuja el gráfico Condición', () => {
    store.globalData = datos({ nuevas: false });
    mount();
    expect(chart('rvCond')).toBeFalsy();
    expect(root.textContent).toContain('Sin datos de');
  });
});

describe('revisiones · sensibilidad a los filtros', () => {
  it('el filtro de módulo cambia el valor de los KPIs', () => {
    mount();
    expect(valorKpi('Flacidez prom.')).toBe('25.0%');       // M1 y M2
    change(root.querySelector('[data-rvfilter="mod"]'), 'Módulo 1');
    expect(valorKpi('Flacidez prom.')).toBe('10.0%');       // sólo M1
    change(root.querySelector('[data-rvfilter="mod"]'), 'Módulo 2');
    expect(valorKpi('Flacidez prom.')).toBe('40.0%');       // sólo M2
  });

  it('el filtro de siembra cambia el valor de los KPIs', () => {
    mount();
    change(root.querySelector('[data-rvfilter="siembra"]'), '1');   // siembra 1 = M1
    expect(valorKpi('Flacidez prom.')).toBe('10.0%');
  });

  it('el gráfico Condición también sigue al filtro de módulo', () => {
    mount();
    change(root.querySelector('[data-rvfilter="mod"]'), 'Módulo 2');
    expect(chart('rvCond').cfg.data.datasets[0].data).toEqual([40, 40]);
  });
});

describe('revisiones · tendencia al pulsar un KPI', () => {
  it('abre el modal y dibuja la línea de esa variable', () => {
    mount();
    click(root.querySelector('[data-rvtrend="flacidez"]'));
    const ov = root.querySelector('#rv-trend-modal');
    expect(ov.classList.contains('rv-open')).toBe(true);
    expect(root.querySelector('#rv-trend-title').textContent).toContain('Flacidez');
    const c = chart('rvTrendCanvas');
    expect(c.cfg.type).toBe('line');
    expect(c.cfg.data.datasets[0].label).toBe('% Flacidez');
    expect(c.cfg.data.datasets[0].data).toEqual([25, 25]);
    // Eje Y: base en 0 (el área va rellena) y techo AJUSTADO a los datos, no 100.
    // Con la serie en 25 % el techo sale 35: si se quedara en 100, la línea viviría en
    // el cuarto inferior del gráfico y la tendencia sería ilegible.
    expect(c.cfg.options.scales.y.min).toBe(0);
    expect(c.cfg.options.scales.y.max).toBe(35);
    expect(c.cfg.options.scales.y.max).toBeLessThan(100);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('el overlay ya está ABIERTO en el instante de crear el gráfico', () => {
    // `.rv-modal` es display:none: si el gráfico se creara antes de añadir `rv-open`,
    // Chart.js mediría el canvas a 0×0 y quedaría invisible hasta un resize. El stub
    // captura el estado EN ESE INSTANTE — leerlo después del clic pasaría siempre.
    mount();
    click(root.querySelector('[data-rvtrend="necrosis"]'));
    const c = chart('rvTrendCanvas');
    expect(c).toBeTruthy();
    expect(c.trendAbierto).toBe(true);
  });

  it('la tendencia respeta el filtro de módulo activo', () => {
    mount();
    change(root.querySelector('[data-rvfilter="mod"]'), 'Módulo 1');
    click(root.querySelector('[data-rvtrend="flacidez"]'));
    expect(chart('rvTrendCanvas').cfg.data.datasets[0].data).toEqual([10, 10]);
  });

  it('el eje se re-ajusta al filtrar: la misma variable, otra escala', () => {
    // Al acotar a M1 la serie baja de 25 % a 10 %, y el eje debe seguirla. Con un techo
    // fijo esto no cambiaría y el gráfico del módulo con valores bajos quedaría plano.
    mount();
    click(root.querySelector('[data-rvtrend="flacidez"]'));
    const conTodo = chart('rvTrendCanvas').cfg.options.scales.y.max;
    change(root.querySelector('[data-rvfilter="mod"]'), 'Módulo 1');
    click(root.querySelector('[data-rvtrend="flacidez"]'));
    const soloM1 = chart('rvTrendCanvas').cfg.options.scales.y.max;
    expect(soloM1).toBeLessThan(conTodo);
    expect(soloM1).toBe(14);   // serie en 10 % → 10 × 1,25 = 12,5 → paso 2 → 14
  });

  it('cada KPI abre SU variable, no siempre la misma', () => {
    mount();
    click(root.querySelector('[data-rvtrend="disparidad"]'));
    expect(chart('rvTrendCanvas').cfg.data.datasets[0].label).toBe('% Disparidad');
    click(root.querySelector('[data-rvtrend="atraso"]'));
    expect(chart('rvTrendCanvas').cfg.data.datasets[0].label).toBe('% Atraso');
  });

  it('un KPI de las que siempre se muestran también abre su tendencia', () => {
    store.globalData = datos({ nuevas: false });
    mount();
    click(root.querySelector('[data-rvtrend="deformidad"]'));
    expect(chart('rvTrendCanvas').cfg.data.datasets[0].label).toBe('% Deformidad');
  });

  it('el botón de cierre cierra el modal', () => {
    mount();
    click(root.querySelector('[data-rvtrend="flacidez"]'));
    click(root.querySelector('[data-trend-close]'));
    expect(root.querySelector('#rv-trend-modal').classList.contains('rv-open')).toBe(false);
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
