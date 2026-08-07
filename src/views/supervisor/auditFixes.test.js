// @vitest-environment happy-dom
// Regresión de los defectos hallados en la auditoría de la vista Supervisor:
//   · T-01 el historial de observaciones rotula cada entrada con el estadío de SU día.
//   · T-02 el pronóstico del tanque no proyecta supervivencia creciente.
//   · T-03 el objetivo del gráfico de SV es el del semáforo del sistema, no un 60 % suelto.
//   · D-03 la barra de fecha no se muestra donde no filtra (Despacho).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { charts } = vi.hoisted(() => ({ charts: [] }));
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts.push({ id, cfg }); return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));
const { bar } = vi.hoisted(() => ({ bar: { hidden: null } }));
vi.mock('../../ui/shell.js', () => ({ setDateBarHidden: (h) => { bar.hidden = h; } }));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';
import { THRESHOLDS } from '../../config.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// Tanque con recuentos manuales que REPUNTAN (justo el ruido del que advierte la vista).
//
// ⚠ La serie tiene que dar pendiente POSITIVA de verdad o el clamp de T-02 no llega a
// activarse y el test pasaría sin probar nada. Con una caída fuerte al principio la recta
// sale negativa aunque el final suba: la siembra siempre vale el 100 % y arrastra el ajuste.
// SV = [100, 95, 96, 98, 100] → pendiente +0,30 (comprobado). Población → +3.000/paso.
// Además, observaciones en tres estadíos distintos para T-01.
function synth() {
  return [
    L({ Tanque: 'TQ1', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '1000000', Observaciones: 'Siembra sin novedad' }),
    L({ Tanque: 'TQ1', Fecha: '06/06/2026', 'Estadío': 'Z3', 'Población': '950000', Observaciones: 'Agua turbia' }),
    L({ Tanque: 'TQ1', Fecha: '10/06/2026', 'Estadío': 'PL2', 'Población': '960000' }),
    L({ Tanque: 'TQ1', Fecha: '14/06/2026', 'Estadío': 'PL5', 'Población': '980000' }),
    L({ Tanque: 'TQ1', Fecha: '18/06/2026', 'Estadío': 'PL8', 'Población': '1000000', Observaciones: 'Recuento corregido' }),
  ];
}

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null; store.globalData = synth();
  charts.length = 0; bar.hidden = null;
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; store.dateFrom = null; store.dateTo = null; vi.restoreAllMocks(); });

const landing = () => { supervisorView(root); const b = root.querySelector('[data-nav="modules"]'); if (b) click(b); return root; };
const gotoModule = () => { landing(); click(root.querySelector('.sv-card[data-nav="module"]')); return root; };
const gotoTank = () => { gotoModule(); click(root.querySelector('.sv-tank-card')); return root; };

describe('T-01 · estadío de cada observación', () => {
  it('cada entrada lleva el estadío de SU fecha, no el más reciente del tanque', () => {
    gotoTank();
    click(root.querySelector('[data-obshist-open]'));
    const metas = [...root.querySelectorAll('#svObsModal .sv-hist-meta')].map((d) => d.textContent);
    expect(metas).toHaveLength(3);
    // Más recientes primero: PL8 (14/06), Z3 (06/06), N5 (02/06).
    expect(metas[0]).toContain('PL8');
    expect(metas[1]).toContain('Z3');
    expect(metas[2]).toContain('N5');
    // Antes las tres decían «PL8», el estadío actual del tanque.
    expect(metas.filter((m) => m.includes('PL8'))).toHaveLength(1);
  });
});

describe('T-02 · el pronóstico no proyecta supervivencia creciente', () => {
  const forecast = () => {
    gotoTank();
    click(root.querySelector('[data-forecast-open]'));
    return charts.filter((c) => c.id === 'svForecastChart').pop().cfg;
  };

  it('con una tendencia al alza la proyección de SV sale PLANA, no subiendo', () => {
    const cfg = forecast();
    const proy = cfg.data.datasets.find((d) => d.label === 'SV proyección').data.filter((v) => v != null);
    expect(proy.length).toBeGreaterThan(1);
    // Ningún punto por encima del anterior.
    proy.forEach((v, i) => { if (i) expect(v).toBeLessThanOrEqual(proy[i - 1] + 1e-9); });
  });

  it('la proyección plana se ancla en el último dato REAL de supervivencia', () => {
    const cfg = forecast();
    const hist = cfg.data.datasets.find((d) => d.label === 'SV histórico (%)').data.filter((v) => v != null);
    const proy = cfg.data.datasets.find((d) => d.label === 'SV proyección').data.filter((v) => v != null);
    expect(proy[proy.length - 1]).toBeCloseTo(hist[hist.length - 1], 6);
  });

  it('el KPI de tendencia deja de anunciar «subiendo»', () => {
    gotoTank();
    click(root.querySelector('[data-forecast-open]'));
    const kpis = root.querySelector('#svForecastKpis').textContent;
    expect(kpis).not.toContain('subiendo');
    expect(kpis).toContain('estable');
  });

  it('la POBLACIÓN conserva su recta (es estimación manual, un repunte es plausible)', () => {
    const cfg = forecast();
    const pobProy = cfg.data.datasets.find((d) => d.label === 'Pob. proyección').data.filter((v) => v != null);
    expect(pobProy.length).toBeGreaterThan(1);
    // No se le impone monotonía: con estos datos la recta sube.
    expect(pobProy[pobProy.length - 1]).toBeGreaterThan(pobProy[0]);
  });
});

describe('T-03 · el objetivo del gráfico es el del semáforo', () => {
  it('el tooltip cita THRESHOLDS.sv.bueno y ya no un 60 % suelto', () => {
    gotoTank();
    const cfg = charts.find((c) => c.id === 'svTankSv').cfg;
    const txt = cfg.options.plugins.tooltip.callbacks.afterLabel({ parsed: { y: 65 }, dataIndex: 0 });
    expect(THRESHOLDS.sv.bueno).toBe(70);
    expect(txt).toContain('70%');
    expect(txt).not.toContain('60%');
    // 65 % está por DEBAJO del objetivo, igual que dice el semáforo del banner.
    expect(txt.startsWith('!')).toBe(true);
  });
});

describe('O-02 · OM vs Tex usa UNA sola definición de supervivencia', () => {
  // TQ1 lote «AB» (dos letras → Omarsa) · TQ2 lote «L1» (letra+dígito → Texcumar).
  // La columna CRUDA «Supervivencia» de la hoja trae valores que NO cuadran con la
  // población: es justo lo que separa las dos definiciones y hace visible el defecto.
  //   TQ1: 1.000.000 → 800.000  ⇒ SV real 80 %  (la hoja dice 95)
  //   TQ2: 1.000.000 → 500.000  ⇒ SV real 50 %  (la hoja dice 92)
  const omtexRows = () => [
    L({ Tanque: 'TQ1', Lote: 'AB', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '1000000', Supervivencia: '100' }),
    L({ Tanque: 'TQ1', Lote: 'AB', Fecha: '10/06/2026', 'Estadío': 'PL6', 'Población': '800000', Supervivencia: '95' }),
    L({ Tanque: 'TQ2', Lote: 'L1', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '1000000', Supervivencia: '100' }),
    L({ Tanque: 'TQ2', Lote: 'L1', Fecha: '10/06/2026', 'Estadío': 'PL6', 'Población': '500000', Supervivencia: '92' }),
  ];

  const trendCfg = () => {
    store.globalData = omtexRows();
    gotoModule();
    const btn = root.querySelector('[data-nav="omtex"]');
    expect(btn).toBeTruthy(); // sin lotes Texcumar el botón no existe y el test no probaría nada
    click(btn);
    return charts.filter((c) => c.id === 'omtexTrend').pop().cfg;
  };

  it('la tendencia deriva la SV de la población, no de la columna cruda de la hoja', () => {
    const cfg = trendCfg();
    const serie = (marca) => cfg.data.datasets.find((d) => d.label === marca).data;
    const i = cfg.data.labels.indexOf('10/06/2026');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(serie('Omarsa')[i]).toBeCloseTo(80, 6);   // 800k/1M — la hoja decía 95
    expect(serie('Texcumar')[i]).toBeCloseTo(50, 6); // 500k/1M — la hoja decía 92
  });

  it('la tendencia coincide con la supervivencia de la tabla que tiene encima', () => {
    const cfg = trendCfg();
    const serie = (marca) => cfg.data.datasets.find((d) => d.label === marca).data.filter((v) => v != null);
    const ultimo = (marca) => serie(marca)[serie(marca).length - 1];
    // La tabla Δ imprime la SV media por marca; con un tanque por marca es su propia SV.
    const tabla = root.querySelector('.omtex-cards').parentElement.textContent;
    expect(tabla).toContain('80.0%');
    expect(tabla).toContain('50.0%');
    expect(ultimo('Omarsa')).toBeCloseTo(80, 6);
    expect(ultimo('Texcumar')).toBeCloseTo(50, 6);
  });
});

describe('D-03 · la barra de fecha solo se muestra donde filtra', () => {
  it('oculta en la landing ejecutiva', () => {
    landing();
    expect(bar.hidden).toBe(true);
  });

  it('visible en el módulo y en el tanque', () => {
    gotoModule();
    expect(bar.hidden).toBe(false);
    gotoTank();
    expect(bar.hidden).toBe(false);
  });

  it('oculta en Despacho, que lee la corrida completa y no filtra por fecha', () => {
    gotoModule();
    click(root.querySelector('[data-nav="despacho"]'));
    expect(root.querySelector('.sv-banner').textContent).toContain('DESPACHO');
    expect(bar.hidden).toBe(true);
  });
});
