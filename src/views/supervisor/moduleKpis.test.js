// @vitest-environment happy-dom
// Regresión de los ajustes de KPI/rótulo pedidos sobre la vista Supervisor:
//   · P-01 la tarjeta de la Ejecutiva rotula «Téc.:» (el emoji se perdía sobre el azul).
//   · P-02 tarjeta y KPI del Resumen Operativo listan LOS MISMOS técnicos, con o sin
//          filtro de fecha, porque ambos se derivan de la corrida completa.
//   · P-03 el cuadro Siembras y Cosecha se abre desde el KPI Estadío; el KPI Técnico
//          recupera su despliegue de nombres.
//   · P-04 la tabla del cuadro trae Superv. (real) y Superv. proy. (con merma).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { buildContext, modStats } from './stats.js';
import { supervisorView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// Dos técnicos: uno registra solo al principio de la corrida, el otro solo al final.
// Con un preset de fecha, la ventana ve a uno y la corrida completa a los dos.
function synth() {
  const rows = [];
  ['TQ1', 'TQ2'].forEach((tq) => {
    for (let i = 0; i < 20; i++) {
      rows.push(L({
        'Módulo': 'M01', Corrida: '573', Tanque: tq,
        Fecha: `${String(i + 1).padStart(2, '0')}/06/2026`,
        'Estadío': i === 0 ? 'N5' : 'PL8',
        'Población': String(1000000 - i * 10000),
        'Técnico': i < 10 ? 'Ana Torres' : 'Beto Ruiz',
      }));
    }
  });
  return rows;
}

let root;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null; store.globalData = synth();
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { store.globalData = []; store.dateFrom = null; store.dateTo = null; vi.restoreAllMocks(); });

const gotoLanding = () => {
  supervisorView(root);
  const back = root.querySelector('[data-nav="modules"]');
  if (back) click(back);
  return root;
};
const gotoModule = () => { gotoLanding(); click(root.querySelector('.sv-card[data-nav="module"]')); return root; };

describe('P-01 · rótulo del técnico en la tarjeta de la Vista Ejecutiva', () => {
  it('usa «Téc.:» y ya no el emoji 👤, que se perdía sobre el fondo de etapa', () => {
    const sub = [...gotoLanding().querySelectorAll('.sv-card-sub')].find((d) => d.textContent.includes('Téc.'));
    expect(sub).toBeTruthy();
    expect(sub.textContent).toContain('Téc.:');
    expect(sub.textContent).not.toContain('👤');
  });

  it('conserva la lista completa en el title', () => {
    const sub = [...gotoLanding().querySelectorAll('.sv-card-sub')].find((d) => d.textContent.includes('Téc.'));
    expect(sub.getAttribute('title')).toContain('Ana Torres');
    expect(sub.getAttribute('title')).toContain('Beto Ruiz');
  });
});

describe('P-02 · los técnicos salen de la corrida completa en ambas pantallas', () => {
  it('el filtro de fecha ya no recorta la lista de técnicos', () => {
    const todos = modStats(buildContext({ corrida: null }), 'M01', '573').tecnicos;
    expect(todos).toEqual(['Ana Torres', 'Beto Ruiz']);

    // Ventana que solo cubre los días de Beto: la lista NO debe encogerse.
    store.dateFrom = new Date(2026, 5, 15);
    store.dateTo = new Date(2026, 5, 20);
    const conFiltro = modStats(buildContext({ corrida: null }), 'M01', '573').tecnicos;
    expect(conFiltro).toEqual(todos);
  });

  it('la tarjeta de la Ejecutiva y el KPI del Resumen Operativo coinciden', () => {
    store.dateFrom = new Date(2026, 5, 15);
    store.dateTo = new Date(2026, 5, 20);

    const sub = [...gotoLanding().querySelectorAll('.sv-card-sub')].find((d) => d.textContent.includes('Téc.'));
    const tarjeta = sub.getAttribute('title');

    const kpi = [...gotoModule().querySelectorAll('.sv-kpi-glass')].find((k) => k.textContent.includes('Técnico'));
    ['Ana Torres', 'Beto Ruiz'].forEach((t) => {
      expect(tarjeta).toContain(t);
      expect(kpi.textContent).toContain(t);
    });
  });
});

describe('P-03 · Siembras en el KPI Estadío, nombres en el KPI Técnico', () => {
  it('el KPI Estadío abre el cuadro de Siembras y Cosecha', () => {
    gotoModule();
    const estadio = [...root.querySelectorAll('.sv-kpi-glass')].find((k) => k.textContent.includes('Estadío'));
    expect(estadio.getAttribute('data-siembras-open')).not.toBeNull();

    click(estadio);
    const modal = root.querySelector('#svSiembrasModal');
    expect(modal.classList.contains('sv-open')).toBe(true);
    expect(modal.querySelector('.sv-sie-table')).toBeTruthy();
  });

  it('el KPI Técnico ya NO abre el cuadro: despliega los nombres', () => {
    gotoModule();
    const tec = root.querySelector('[data-tec-toggle]');
    expect(tec).toBeTruthy();
    expect(tec.getAttribute('data-siembras-open')).toBeNull();

    const lista = tec.querySelector('.sv-tec-list');
    expect(lista.hidden).toBe(true);
    expect(tec.getAttribute('aria-expanded')).toBe('false');

    click(tec);
    expect(lista.hidden).toBe(false);
    expect(tec.getAttribute('aria-expanded')).toBe('true');
    expect([...lista.querySelectorAll('.sv-tec-item')].map((s) => s.textContent))
      .toEqual(['Ana Torres', 'Beto Ruiz']);
    expect(root.querySelector('#svSiembrasModal').classList.contains('sv-open')).toBe(false);

    click(tec); // vuelve a plegarse
    expect(lista.hidden).toBe(true);
  });

  it('responde también a Enter', () => {
    gotoModule();
    const tec = root.querySelector('[data-tec-toggle]');
    tec.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(tec.querySelector('.sv-tec-list').hidden).toBe(false);
  });
});

describe('P-04 · Superv. real y Superv. proy. en la tabla del cuadro', () => {
  const abrir = () => {
    gotoModule();
    click([...root.querySelectorAll('.sv-kpi-glass')].find((k) => k.textContent.includes('Estadío')));
    return root.querySelector('#svSiembrasModal');
  };

  it('la cabecera trae ambas columnas y la proyectada lleva el % de merma', () => {
    const ths = [...abrir().querySelectorAll('.sv-sie-table thead th')].map((t) => t.textContent.trim());
    expect(ths).toContain('Superv.');
    expect(ths.some((t) => t.startsWith('Superv. proy.') && t.includes('10%'))).toBe(true);
  });

  it('cambiar la merma mueve la proyectada y deja quieta la real', () => {
    const modal = abrir();
    // Se localizan por CABECERA, no por posición: así el test sigue siendo válido si
    // vuelve a reordenarse la tabla, y falla si una columna deja de existir.
    const colIdx = (txt) => [...modal.querySelectorAll('.sv-sie-table thead tr:last-child th')]
      .findIndex((th) => th.textContent.trim().startsWith(txt));
    const iReal = colIdx('Superv.');
    const iProy = colIdx('Superv. proy.');
    expect(iReal).toBeGreaterThanOrEqual(0);
    expect(iProy).toBeGreaterThan(iReal);

    // La fila del total abre con una celda de etiqueta que ocupa 2 columnas.
    const celda = (i) => {
      const tds = [...modal.querySelectorAll('.sv-sie-total td')];
      return tds[i - 1].textContent.trim(); // −1 por el colspan=2 de la etiqueta
    };
    const antes = { real: celda(iReal), proy: celda(iProy) };

    const sel = modal.querySelector('[data-sie-merma]');
    sel.value = '15';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(celda(iProy)).not.toBe(antes.proy); // la proyectada se mueve
    expect(celda(iReal)).toBe(antes.real);     // la real no
  });

  it('las bandas de siembra siguen abarcando toda la fila', () => {
    const modal = abrir();
    const cols = modal.querySelectorAll('.sv-sie-table thead tr:last-child th').length;
    modal.querySelectorAll('.sv-sie-band td').forEach((td) => {
      expect(Number(td.getAttribute('colspan'))).toBe(cols);
    });
  });
});
