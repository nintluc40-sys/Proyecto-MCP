// @vitest-environment happy-dom
// Regresión de los dos añadidos sobre el Resumen Operativo del módulo:
//   · C-01 botón «Total de la corrida» en el cuadro de Siembras: despliega el desglose por
//          módulo + la fila agregada de los módulos que comparten la corrida.
//   · C-02 la merma gobierna también esa fila (el desglose sigue sumando al agregado).
//   · C-03 el KPI «PL/g (Larvia)» abre la tendencia del módulo, como el de Supervivencia.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// El mock ANOTA las configuraciones: así se puede comprobar la serie que llega de verdad
// al gráfico, y no solo que el modal se abrió con el título correcto.
const { charts } = vi.hoisted(() => ({ charts: [] }));
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts.push({ id, cfg }); return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';
import { fmtPop } from '../../core/format.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
// Columnas que `isDespachoRow` reconoce como ficha de despacho (core/prodCalendar.js).
const DESP = { 'Densidad cosechada': '25', Biomasa: '120', Destino: 'Piscina 3', 'Cajas/Tinas': '10' };

// Corrida 573 (= Junio) repartida en DOS módulos, cada uno con sus tanques numerados
// desde 1: M01 y M02 tienen ambos un «TQ1» y un «TQ2», que es lo normal en planta.
//
// ⚠ Los dos módulos siembran CANTIDADES DISTINTAS (2 M y 1 M) a propósito. Con siembras
// iguales la supervivencia agregada correcta y el promedio simple de las dos coinciden
// hasta el último decimal, así que el test pasaría igual con la fórmula equivocada y no
// probaría nada. Aquí divergen: 78,3 % (correcta) frente a 75,0 % (promedio).
//   M01 → sembrado 2.000.000 · transferido 1.700.000 · superv 85 %
//   M02 → sembrado 1.000.000 · transferido   650.000 · superv 65 %
//   corrida → sembrado 3.000.000 · transferido 2.350.000 · superv 78,3 %
const SEM = { M01: 1000000, M02: 500000 };
const TANK_DATA = {
  M01: { TQ1: { mid: 950000, trans: 900000, plgA: 60, plgB: 58 }, TQ2: { mid: 850000, trans: 800000, plgA: 50, plgB: 48 } },
  M02: { TQ1: { mid: 380000, trans: 350000, plgA: 70, plgB: 68 }, TQ2: { mid: 320000, trans: 300000, plgA: 80, plgB: 78 } },
};
function synth(mods = ['M01', 'M02']) {
  const rows = [];
  mods.forEach((mod) => {
    Object.entries(TANK_DATA[mod]).forEach(([tq, d]) => {
      const base = { 'Módulo': mod, Corrida: '573', Tanque: tq, 'Técnico': 'Ana Torres' };
      rows.push(L({ ...base, Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': String(SEM[mod]) }));
      rows.push(L({ ...base, Fecha: '10/06/2026', 'Estadío': 'PL6', 'Población': String(d.mid), PLG: String(d.plgA) }));
      // Última lectura previa al despacho → es el Transferido, y su PL/g la 2ª biometría.
      rows.push(L({ ...base, Fecha: '12/06/2026', 'Estadío': 'PL7', 'Población': String(d.trans), PLG: String(d.plgB) }));
      rows.push(L({ ...base, Fecha: '14/06/2026', 'Estadío': 'PL8', 'Población': String(d.trans - 50000), ...DESP }));
    });
  });
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

const gotoModule = () => {
  supervisorView(root);
  const back = root.querySelector('[data-nav="modules"]');
  if (back) click(back);
  click(root.querySelector('.sv-card[data-nav="module"]'));
  return root;
};
const kpi = (txt) => [...root.querySelectorAll('.sv-kpi-glass')].find((k) => k.textContent.includes(txt));
const abrirSiembras = () => { gotoModule(); click(kpi('Estadío')); return root.querySelector('#svSiembrasModal'); };
// Índice de columna por CABECERA (no por posición): el test sobrevive a un reordenado
// de la tabla y falla si la columna deja de existir.
const colIdx = (modal, txt) => [...modal.querySelectorAll('.sv-sie-table thead tr:last-child th')]
  .findIndex((th) => th.textContent.trim().startsWith(txt));
// Celda de una fila de subtotal/total: su etiqueta ocupa 2 columnas (colspan=2).
const celda = (tr, i) => [...tr.querySelectorAll('td')][i - 1].textContent.trim();

describe('C-01 · botón «Total de la corrida»', () => {
  it('aparece junto al selector de merma cuando la corrida tiene otro módulo', () => {
    const modal = abrirSiembras();
    const btn = modal.querySelector('[data-sie-corrida]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    // Convive con la merma en la misma barra de cabecera.
    expect(btn.closest('.sv-modal-kpis')).toBeTruthy();
    expect(modal.querySelector('[data-sie-merma]').closest('.sv-modal-kpis')).toBe(btn.closest('.sv-modal-kpis'));
    // El title dice con qué se va a sumar, sin tener que pulsarlo.
    expect(btn.getAttribute('title')).toContain('M02');
  });

  it('NO se pinta si la corrida tiene un solo módulo (la fila repetiría el total)', () => {
    store.globalData = synth(['M01']);
    expect(abrirSiembras().querySelector('[data-sie-corrida]')).toBeNull();
  });

  it('en reposo no hay ninguna fila de corrida', () => {
    const modal = abrirSiembras();
    expect(modal.querySelector('.sv-sie-cortotal')).toBeNull();
    expect(modal.querySelector('.sv-sie-cormod')).toBeNull();
  });

  it('al pulsarlo salen el desglose por módulo y la fila agregada, bajo el total de módulo', () => {
    const modal = abrirSiembras();
    click(modal.querySelector('[data-sie-corrida]'));

    const desglose = [...modal.querySelectorAll('.sv-sie-cormod')];
    expect(desglose).toHaveLength(2);
    expect(desglose[0].textContent).toContain('Módulo M01');
    expect(desglose[0].textContent).toContain('(este)'); // el que se está viendo
    expect(desglose[1].textContent).toContain('Módulo M02');

    const total = modal.querySelector('.sv-sie-cortotal');
    expect(total).toBeTruthy();
    expect(total.textContent).toContain('Total de la corrida');
    expect(total.textContent).toContain('573');

    // Orden en el pie: total de módulo → desglose → total de corrida.
    const filas = [...modal.querySelectorAll('.sv-sie-table tfoot tr')];
    expect(filas.map((tr) => tr.className)).toEqual(['sv-sie-total', 'sv-sie-cormod', 'sv-sie-cormod', 'sv-sie-cortotal']);
  });

  it('las cifras agregadas son la SUMA de los módulos, con la supervivencia recalculada', () => {
    const modal = abrirSiembras();
    click(modal.querySelector('[data-sie-corrida]'));
    const iSem = colIdx(modal, 'Sembrado');
    const iTra = colIdx(modal, 'Transferido');
    const iSup = colIdx(modal, 'Superv.');
    const total = modal.querySelector('.sv-sie-cortotal');

    expect(celda(total, iSem)).toBe(fmtPop(3000000)); // 2M + 1M
    expect(celda(total, iTra)).toBe(fmtPop(2350000)); // 1,70M + 0,65M
    // 2,35M / 3,00M = 78,3 %. El promedio simple de las supervivencias de los módulos
    // (85 y 65) daría 75,0 %: la cifra que se muestra NO es esa.
    expect(celda(total, iSup)).toBe('78.3%');
    expect(celda(total, iSup)).not.toBe('75.0%');

    // El total de MÓDULO de arriba no se ha movido.
    const mod = modal.querySelector('.sv-sie-total');
    expect(celda(mod, iSem)).toBe(fmtPop(2000000));
    expect(celda(mod, iTra)).toBe(fmtPop(1700000));
    expect(celda(mod, iSup)).toBe('85.0%');
    // Y el otro módulo aporta el suyo, distinto: el agregado no puede salir de uno solo.
    expect(celda([...modal.querySelectorAll('.sv-sie-cormod')][1], iSup)).toBe('65.0%');
  });

  it('la línea del módulo actual reproduce su propio total', () => {
    const modal = abrirSiembras();
    click(modal.querySelector('[data-sie-corrida]'));
    const iTra = colIdx(modal, 'Transferido');
    expect(celda(modal.querySelector('.sv-sie-cormod'), iTra))
      .toBe(celda(modal.querySelector('.sv-sie-total'), iTra));
  });

  it('vuelve a pulsarlo y las filas desaparecen (aria-pressed y rótulo acompañan)', () => {
    const modal = abrirSiembras();
    const btn = modal.querySelector('[data-sie-corrida]');

    click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toContain('Ocultar');

    click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.textContent).not.toContain('Ocultar');
    expect(modal.querySelector('.sv-sie-cortotal')).toBeNull();
    expect(modal.querySelector('.sv-sie-cormod')).toBeNull();
  });

  it('las filas nuevas respetan el ancho de la tabla (no rompen la rejilla)', () => {
    const modal = abrirSiembras();
    click(modal.querySelector('[data-sie-corrida]'));
    const cols = modal.querySelectorAll('.sv-sie-table thead tr:last-child th').length;
    [...modal.querySelectorAll('.sv-sie-cormod, .sv-sie-cortotal')].forEach((tr) => {
      const ancho = [...tr.querySelectorAll('td')]
        .reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0);
      expect(ancho).toBe(cols);
    });
  });
});

describe('C-02 · la merma gobierna también el total de la corrida', () => {
  it('cambiar la merma mueve el «A cosechar» agregado y el desglose sigue sumando', () => {
    const modal = abrirSiembras();
    click(modal.querySelector('[data-sie-corrida]'));
    const iProy = colIdx(modal, 'Proyectado');
    const total = () => modal.querySelector('.sv-sie-cortotal');

    expect(celda(total(), iProy)).toBe(fmtPop(2350000 * 0.9)); // merma por defecto 10 %

    const sel = modal.querySelector('[data-sie-merma]');
    sel.value = '6';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(celda(total(), iProy)).toBe(fmtPop(2350000 * 0.94));
    // Y el desglose por módulo cuadra con el agregado a esa misma merma.
    const partes = [...modal.querySelectorAll('.sv-sie-cormod')]
      .map((tr) => celda(tr, iProy));
    expect(partes).toEqual([fmtPop(1700000 * 0.94), fmtPop(650000 * 0.94)]);
  });

  it('la supervivencia REAL del agregado no la mueve la merma; la proyectada sí', () => {
    const modal = abrirSiembras();
    click(modal.querySelector('[data-sie-corrida]'));
    const iSup = colIdx(modal, 'Superv.');
    const iSupProy = colIdx(modal, 'Superv. proy.');
    const total = () => modal.querySelector('.sv-sie-cortotal');
    const antes = { real: celda(total(), iSup), proy: celda(total(), iSupProy) };

    const sel = modal.querySelector('[data-sie-merma]');
    sel.value = '15';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(celda(total(), iSup)).toBe(antes.real);
    expect(celda(total(), iSupProy)).not.toBe(antes.proy);
    expect(celda(total(), iSupProy)).toBe('66.6%'); // 78,33 × 0,85
  });

  it('la fila sigue visible tras cambiar la merma (el estado no se pierde al repintar)', () => {
    const modal = abrirSiembras();
    click(modal.querySelector('[data-sie-corrida]'));
    const sel = modal.querySelector('[data-sie-merma]');
    sel.value = '12';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(modal.querySelector('.sv-sie-cortotal')).toBeTruthy();
    expect(modal.querySelector('[data-sie-corrida]').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('C-03 · el KPI «PL/g (Larvia)» abre su tendencia', () => {
  it('es pulsable y accesible por teclado, como el de Supervivencia', () => {
    gotoModule();
    const k = kpi('PL/g (Larvia)');
    expect(k.getAttribute('data-modmetric')).toBe('plg');
    expect(k.getAttribute('role')).toBe('button');
    expect(k.getAttribute('tabindex')).toBe('0');
    expect(k.classList.contains('sv-kpi-click')).toBe(true);
  });

  it('al pulsarlo abre el modal de gráfico con el título de PL/g', () => {
    gotoModule();
    click(kpi('PL/g (Larvia)'));
    const modal = root.querySelector('#svModMetricModal');
    expect(modal.classList.contains('sv-open')).toBe(true);
    expect(modal.querySelector('#svModMetricTitle').textContent).toContain('PL/g');
  });

  it('sin botón de proyección ni selector de fecha (es una biometría puntual)', () => {
    gotoModule();
    click(kpi('PL/g (Larvia)'));
    const modal = root.querySelector('#svModMetricModal');
    expect(modal.querySelector('#svModMetricProj').style.display).toBe('none');
    expect(modal.querySelector('#svModMetricControls').style.display).toBe('none');
  });

  it('la nota cuenta solo las fechas con biometría, no todas las del módulo', () => {
    gotoModule();
    click(kpi('PL/g (Larvia)'));
    // El módulo tiene 4 fechas con registro (02, 10, 12 y 14/06) pero solo 2 con PL/g.
    const nota = root.querySelector('#svModMetricNote').textContent;
    expect(nota).toContain('2 fechas con biometría');
    expect(nota).not.toContain('4 fechas');
  });

  it('dibuja un punto por fecha medida, con el promedio ENTRE TANQUES de ese día', () => {
    gotoModule();
    click(kpi('PL/g (Larvia)'));
    const cfg = charts[charts.length - 1].cfg;
    // Solo los días con biometría: la siembra (02/06) y el despacho (14/06) no aparecen.
    expect(cfg.data.labels).toEqual(['10/06/2026', '12/06/2026']);
    expect(cfg.data.datasets[0].data).toEqual([55, 53]); // (60+50)/2 y (58+48)/2
    expect(cfg.data.datasets).toHaveLength(1);           // sin dataset de proyección
  });

  it('el eje no se fuerza a cero: aplanaría un rango de 50-60 PL/g contra el techo', () => {
    gotoModule();
    click(kpi('PL/g (Larvia)'));
    expect(charts[charts.length - 1].cfg.options.scales.y.beginAtZero).toBe(false);
  });

  it('solo grafica el módulo abierto, no el otro de la corrida', () => {
    gotoModule();
    click(kpi('PL/g (Larvia)'));
    // Si colara M02 (PL/g 70/80 y 68/78), los promedios subirían a 65 y 63.
    expect(charts[charts.length - 1].cfg.data.datasets[0].data).toEqual([55, 53]);
  });

  it('el KPI de Supervivencia sigue abriendo lo suyo, con su proyección', () => {
    gotoModule();
    click(kpi('Supervivencia'));
    const modal = root.querySelector('#svModMetricModal');
    expect(modal.querySelector('#svModMetricTitle').textContent).toContain('supervivencia');
    expect(modal.querySelector('#svModMetricProj').style.display).not.toBe('none');
  });
});
