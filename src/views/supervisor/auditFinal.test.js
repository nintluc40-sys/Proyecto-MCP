// @vitest-environment happy-dom
// Regresión de la auditoría integral final (Supervisor · Visitante):
//   · A-06 el gráfico de Población del tanque solo grafica la población DE ESE TANQUE.
//   · A-07 el historial de observaciones del tanque solo lista las suyas.
//   · A-08 «Días proceso» es la edad de la corrida: la tarjeta ejecutiva y el banner del
//          módulo dicen lo MISMO aunque haya un preset de fecha activo.
// Cada regla tiene su propia prueba: una sola que las cubriera todas con un OR no
// discriminaría ninguna por separado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { charts } = vi.hoisted(() => ({ charts: [] }));
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts.push({ id, cfg }); return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));
vi.mock('../../ui/shell.js', () => ({ setDateBarHidden: () => {} }));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// M01/C573 con DOS tanques + una fila de Larvicultura registrada a nivel de MÓDULO
// (sin Tanque). Esa fila trae población y observación propias, que son justo lo que no
// debe atribuirse a ningún tanque concreto.
const POP_MODULO = 999999;
const OBS_MODULO = 'OBSERVACION-DE-MODULO-SIN-TANQUE';
function synth() {
  const rows = [];
  const dates = ['02/06/2026', '06/06/2026', '10/06/2026', '18/06/2026'];
  const est = ['N5', 'Z3', 'PL2', 'PL5'];
  [['TQ1', 1000], ['TQ2', 1200]].forEach(([tq, p0]) => {
    dates.forEach((f, i) => rows.push(L({
      Tanque: tq, Fecha: f, 'Estadío': est[i], 'Población': String(p0 - i * 100),
      Supervivencia: '88', '% Actividad': '90', 'Estrés': '3', Salinidad: '30',
    })));
  });
  // La fila de módulo trae valores EXTREMOS a propósito: si se colara en el cálculo de un
  // tanque, arrastraría visiblemente su ICL (y en A-10 su Deformidad). Sin valores que
  // discriminen, un fixture pasaría igual con la regla correcta y con la equivocada.
  rows.push(L({
    Tanque: '', Fecha: '18/06/2026', 'Estadío': 'PL5',
    'Población': String(POP_MODULO), Observaciones: OBS_MODULO,
    Supervivencia: '0', '% Actividad': '0',
  }));
  return rows;
}

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null; store.globalData = synth();
  charts.length = 0;
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; store.dateFrom = null; store.dateTo = null; vi.restoreAllMocks(); });

const landing = () => { supervisorView(root); const b = root.querySelector('[data-nav="modules"]'); if (b) click(b); return root; };
const gotoModule = () => { landing(); click(root.querySelector('.sv-card[data-nav="module"]')); return root; };
const gotoTank = (tq) => { gotoModule(); click(root.querySelector(`.sv-tank-card[data-tank="${tq}"]`)); return root; };

describe('A-06 · la Población del tanque es solo la del tanque', () => {
  it('el gráfico no grafica la población registrada a nivel de módulo', () => {
    gotoTank('TQ1');
    const c = charts.find((x) => x.id === 'svTankPop');
    expect(c).toBeTruthy();
    const data = c.cfg.data.datasets[0].data;
    expect(data).not.toContain(POP_MODULO);
    // Y el último punto coincide con el KPI «Pob. actual» del banner (700 = 1000 − 3×100).
    expect(data[data.length - 1]).toBe(700);
  });

  it('el KPI del banner y el último punto del gráfico no pueden discrepar', () => {
    gotoTank('TQ1');
    const kpi = [...root.querySelectorAll('.sv-kpi-glass')]
      .find((el) => el.querySelector('.sv-kpi-label')?.textContent.includes('Pob. actual'));
    const data = charts.find((x) => x.id === 'svTankPop').cfg.data.datasets[0].data;
    const ultimo = data[data.length - 1];
    expect(kpi.querySelector('.sv-kpi-value').textContent.replace(/\D/g, '')).toBe(String(ultimo));
  });
});

describe('A-07 · el historial de observaciones del tanque es solo suyo', () => {
  it('una observación sin tanque no se atribuye a TQ1', () => {
    gotoTank('TQ1');
    const btn = root.querySelector('[data-obshist-open]');
    expect(btn.textContent).not.toContain('(1)'); // TQ1 no tiene observaciones propias
    click(btn);
    expect(root.querySelector('[data-obshist-body]').innerHTML).not.toContain(OBS_MODULO);
  });

  it('tampoco se duplica en el resto de tanques del módulo', () => {
    gotoTank('TQ2');
    click(root.querySelector('[data-obshist-open]'));
    expect(root.querySelector('[data-obshist-body]').innerHTML).not.toContain(OBS_MODULO);
  });
});

describe('A-08 · «Días proceso» es la edad de la corrida, no la del filtro', () => {
  it('la tarjeta ejecutiva y el banner del módulo coinciden con un preset activo', () => {
    // Ventana global que deja fuera la siembra (02/06): 10/06 → 18/06.
    store.dateFrom = new Date(2026, 5, 10);
    store.dateTo = new Date(2026, 5, 18, 23, 59);

    landing();
    const tag = root.querySelector('.sv-card .sv-card-tag').textContent;
    const diasTarjeta = Number(tag.match(/·\s*(\d+)\s*día/)[1]);

    click(root.querySelector('.sv-card[data-nav="module"]'));
    const kpi = [...root.querySelectorAll('.sv-kpi-glass')]
      .find((el) => el.querySelector('.sv-kpi-label')?.textContent.includes('Días proceso'));
    const diasBanner = Number(kpi.querySelector('.sv-kpi-value').textContent.trim());

    // Span real de la corrida: 02/06 → 18/06 = 17 días. Antes el banner decía 9.
    expect(diasTarjeta).toBe(17);
    expect(diasBanner).toBe(diasTarjeta);
  });

  it('sin filtro el valor es el mismo (el cambio no altera el caso normal)', () => {
    landing();
    const tag = root.querySelector('.sv-card .sv-card-tag').textContent;
    expect(Number(tag.match(/·\s*(\d+)\s*día/)[1])).toBe(17);
  });
});

describe('A-09 · OM vs Tex: la marca de un tanque sale de SUS lotes', () => {
  // TQ1 = lotes Omarsa ('AB'), TQ2 = lote Texcumar ('L1') con UN solo registro.
  // Además, una fila a nivel de módulo con lote 'AB'. Si esa fila cuenta para todos los
  // tanques, TQ2 queda 1 a 1 y la vista lo aparta como «sin marca clara» — perdiendo la
  // única representación de Texcumar y, con ella, el veredicto entero.
  beforeEach(() => {
    store.globalData = [
      ...['02/06/2026', '06/06/2026', '10/06/2026', '18/06/2026'].map((f, i) => L({
        Tanque: 'TQ1', Lote: 'AB', Fecha: f, 'Estadío': ['N5', 'Z3', 'PL2', 'PL5'][i],
        'Población': String(1000 - i * 100), Deformidad: '2',
      })),
      L({ Tanque: 'TQ2', Lote: 'L1', Fecha: '10/06/2026', 'Estadío': 'PL2', 'Población': '900', Deformidad: '5' }),
      // Deformidad DISPARATADA en la fila de módulo: si contaminara los promedios por marca,
      // la tabla Δ lo delataría de inmediato.
      L({ Tanque: '', Lote: 'AB', Fecha: '18/06/2026', 'Estadío': 'PL5', 'Población': '999999', Deformidad: '50' }),
    ];
  });

  it('TQ2 conserva su marca Texcumar y no cae en «sin marca clara»', () => {
    gotoModule();
    const btn = root.querySelector('[data-nav="omtex"]');
    expect(btn).toBeTruthy();
    click(btn);
    const html = root.innerHTML;
    expect(html).not.toContain('sin marca clara');
    // Ambas marcas presentes ⇒ hay veredicto y NO el aviso de marca ausente.
    expect(html).not.toContain('No hay lotes de');
    expect(root.querySelector('.omtex-verdict')).toBeTruthy();
  });

  it('cada marca reúne exactamente su tanque', () => {
    gotoModule();
    click(root.querySelector('[data-nav="omtex"]'));
    const tqs = [...root.querySelectorAll('.omtex-card')].map(
      (c) => [...c.querySelectorAll('.omtex-tq')].map((s) => s.textContent).join(','),
    );
    expect(tqs).toContain('TQ1');
    expect(tqs).toContain('TQ2');
  });

  it('A-10 · los promedios por marca no incorporan la fila de módulo', () => {
    gotoModule();
    click(root.querySelector('[data-nav="omtex"]'));
    const fila = [...root.querySelectorAll('.sv-table tr')]
      .find((tr) => tr.textContent.includes('Deformidad'));
    expect(fila).toBeTruthy();
    const celdas = [...fila.querySelectorAll('td')].map((td) => td.textContent.trim());
    // Δ = Texcumar − Omarsa: TEX = TQ2 (5.0%), OM = TQ1 (2.0%). Con la fila de módulo
    // (Deformidad 50) contaminando, salían 27.5% y 11.6%.
    expect(celdas[1]).toBe('5.0%');
    expect(celdas[2]).toBe('2.0%');
  });
});

describe('A-11 · el ICL de la comparativa de tanques es el de cada tanque', () => {
  it('la fila de módulo no arrastra el ICL de ningún tanque', () => {
    gotoModule();
    click(root.querySelector('[data-modcmp-open]'));
    const c = charts.find((x) => x.id === 'svModCmp');
    expect(c).toBeTruthy();
    const icl = c.cfg.data.datasets[1].data;
    // Cada día: SV 88 + %Actividad 90 − Estrés 3×10 = 148, igual en los 4 días y en ambos
    // tanques. Con la fila de módulo (SV 0, %Act 0) el día 18/06 caía a 59 y el promedio
    // del tanque bajaba a 126.
    expect(icl).toEqual([148, 148]);
  });
});
