// @vitest-environment happy-dom
/* ============================================================
   ALGAS · los descartes por CLASE (2026-09-26, usuario)

   «Por bueno» (la observación «Descartado por bueno», o su nombre viejo «Descartado nm») · «Por no uso» («Tanque
   pasado del día de uso») · «Por calidad / otros» (el resto). La TASA de descarte sigue siendo la de todos; su reparto
   por clase sale al lado en la tarjeta de la subvista, en la del mes, en su modal (barras APILADAS por día y por
   categoría, y el detalle), en la tabla por técnico, en el resumen del día y en su tabla. Datos ficticios.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: vi.fn(() => null),
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { makeChart } from '../../core/charts.js';
import { algasView } from './index.js';
import { claseDescarte, conteoDescartes, desgloseTexto, DESCARTE_CLASES, esDescartado } from './descartes.js';

if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

describe('Algas · la clase de un descarte', () => {
  it('🔴 por bueno · por no uso · por calidad, por sus observaciones; sin descartar, ninguna', () => {
    expect(claseDescarte('Si', 'Células llenas, Descartado por bueno')).toBe('bueno');
    expect(claseDescarte('Sí', 'Descartado nm'), 'el nombre VIEJO del chip').toBe('bueno');
    expect(claseDescarte('si', 'Tanque pasado del día de uso, Grumos')).toBe('nouso');
    expect(claseDescarte('Si', 'TANQUE PASADO DEL DIA DE USO'), 'sin tildes ni mayúsculas').toBe('nouso');
    expect(claseDescarte('Si', 'Tanque pasado del día de uso, Descartado por bueno'), 'por bueno manda').toBe('bueno');
    expect(claseDescarte('Si', 'Grumos, Filamentosas')).toBe('calidad');
    expect(claseDescarte('Si', '')).toBe('calidad');
    expect(claseDescarte('Si', 'Descartado por buenos'), 'la frase ENTERA, no un trozo').toBe('calidad');
    expect(claseDescarte('No', 'Descartado por bueno'), 'sin «Sí» no hay descarte').toBe('');
    expect(claseDescarte('', 'Tanque pasado del día de uso')).toBe('');
    expect([esDescartado('Sí'), esDescartado(' si '), esDescartado('No'), esDescartado('')]).toEqual([true, true, false, false]);
  });

  it('el conteo y el reparto en una línea', () => {
    const c = conteoDescartes(['bueno', 'nouso', 'nouso', '', 'calidad', 'x']);
    expect(c).toEqual({ total: 4, bueno: 1, nouso: 2, calidad: 1 });
    expect(desgloseTexto(c)).toBe('bueno 1 · no uso 2 · calidad 1');
    expect(desgloseTexto(conteoDescartes([]))).toBe('');
    expect(DESCARTE_CLASES.map((x) => x.clave)).toEqual(['bueno', 'nouso', 'calidad']);
  });
});

/* La vista: junio con 8 registros de Masivos (2 días × 4 sistemas): uno descartado de cada clase y uno sin descartar
   que lleva la observación «Descartado por bueno» (no cuenta: no está descartado). */
const A = (o) => ({ _SheetOrigin: 'Lab_Algas', Corrida_Larv: '573', Modulo_Larv: 'M01', 'Área_Algas': 'A1', Especie: 'TW', Cel_ml: '1500', Protozoarios: '1', 'Técnico': 'Ana', Descartado: 'No', ...o });
const FILAS = [
  A({ Fecha: '02/06/2026', Sistema: 'M1', Dia_Proceso: '1', Descartado: 'Si', Observaciones: 'Células llenas, Descartado por bueno' }),
  A({ Fecha: '02/06/2026', Sistema: 'M2', Dia_Proceso: '1', Descartado: 'Si', Observaciones: 'Tanque pasado del día de uso' }),
  A({ Fecha: '02/06/2026', Sistema: 'M3', Dia_Proceso: '1' }),
  A({ Fecha: '02/06/2026', Sistema: 'M4', Dia_Proceso: '1', Observaciones: 'Descartado por bueno' }),
  A({ Fecha: '04/06/2026', Sistema: 'M1', Dia_Proceso: '2', Descartado: 'Si', Observaciones: 'Grumos', 'Técnico': 'Beto' }),
  A({ Fecha: '04/06/2026', Sistema: 'M2', Dia_Proceso: '2' }),
  A({ Fecha: '04/06/2026', Sistema: 'M3', Dia_Proceso: '2' }),
  A({ Fecha: '04/06/2026', Sistema: 'M4', Dia_Proceso: '2' }),
];
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
let root, errSpy;
beforeEach(() => {
  store.role = 'administrativo';
  store.globalData = FILAS;
  document.body.innerHTML = '';
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
  makeChart.mockClear();
  algasView(root);
  const m = root.querySelector('[data-alg-sub="Masivos"]');
  if (m && !m.classList.contains('is-active')) click(m);
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });
const ultimo = (id) => { const l = makeChart.mock.calls.filter(([c]) => c === id); return l.length ? l[l.length - 1][1] : null; };

describe('Algas · la vista enseña el reparto de los descartes', () => {
  it('🔴 la tarjeta «Descartados» de la subvista: el total y su reparto', () => {
    const t = [...root.querySelectorAll('.alg-kpi')].find((k) => k.textContent.includes('Descartados'));
    expect(t.querySelector('.alg-kpi-value').textContent).toBe('3');
    expect(t.querySelector('.alg-kpi-sub').textContent).toBe('bueno 1 · no uso 1 · calidad 1');
  });

  it('🔴 la tarjeta del mes: la tasa de siempre (3 de 8) y su reparto', () => {
    const c = root.querySelector('[data-alg-open="desc"]');
    expect(c.querySelector('.alg-mind-val').textContent).toBe('37.5%');
    expect(c.querySelector('.alg-mind-sub').textContent).toBe('bueno 1 · no uso 1 · calidad 1');
  });

  it('🔴 el modal: barras APILADAS por clase (por día y por categoría) cuya suma es la tasa, y el detalle', async () => {
    click(root.querySelector('[data-alg-open="desc"]'));
    await new Promise((r) => requestAnimationFrame(() => r()));   // el modal dibuja sus gráficos en el siguiente cuadro
    const dia = ultimo('algDescLine');
    expect(dia.data.datasets.map((d) => d.label)).toEqual(['Por bueno', 'Por no uso', 'Por calidad / otros']);
    expect(dia.options.scales.y.stacked).toBe(true);
    const suma = (cfg, i) => cfg.data.datasets.reduce((a, d) => a + d.data[i], 0);
    expect([suma(dia, 0), suma(dia, 1)], 'cada día, su tasa: 2 de 4 y 1 de 4').toEqual([50, 25]);
    expect(dia.data.datasets[0].data[0]).toBe(25);
    const cat = ultimo('algDescBars');
    expect(cat.data.labels).toEqual(['Masivos']);
    expect(suma(cat, 0)).toBe(37.5);
    const body = root.querySelector('#algDescModalBody');
    expect(body.querySelector('.alg-desc-clases').textContent.replace(/\s+/g, ' ')).toBe('Por bueno 1Por no uso 1Por calidad / otros 1');
    const fila = [...body.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Masivos'));
    expect([...fila.cells].map((c) => c.textContent)).toEqual(['Masivos', '3', '1', '1', '1', '8', '37.5%']);
  });

  it('🔴 la tabla por técnico: el % y su reparto', () => {
    click(root.querySelector('[data-alg-indices]'));
    const t = [...root.querySelectorAll('.alg-table')].find((x) => x.textContent.includes('Técnico') && x.textContent.includes('% descarte'));
    const ana = [...t.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Ana'));
    expect(ana.textContent).toContain('bueno 1 · no uso 1 · calidad 0');
  });

  it('🔴 el resumen del día: los descartados de ESE día y su reparto (el último, 04/06: uno de calidad)', () => {
    click(root.querySelector('[data-alg-daysum]'));
    const p = [...root.querySelectorAll('#algDayModal .alg-day-kpi')].find((x) => x.textContent.includes('descartados'));
    expect(p.textContent.replace(/\s+/g, ' ')).toBe('1descartados bueno 0 · no uso 0 · calidad 1');
  });

  it('🔴 la tabla de registros de un día: la papelera dice su clase', () => {
    click(root.querySelector('[data-alg-open="cov"]'));
    click(root.querySelector('[data-cov-day="2026-06-02"]'));
    const t = root.querySelector('#algCovDayDetail').textContent;
    expect(t).toContain('🗑️ bueno');
    expect(t).toContain('🗑️ no uso');
    expect(t).not.toContain('🗑️ calidad');   // el de calidad es del 04/06
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe('Algas · el reparto tiene su estilo', () => {
  it('🔑 las clases que pinta están DEFINIDAS en algas.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/algas/algas.css', 'utf8');
    for (const c of ['alg-kpi-sub', 'alg-mind-sub', 'alg-desc-clases', 'alg-desc-clase', 'alg-desc-mini']) expect(css.includes('.' + c + ' '), c).toBe(true);
  });
});
