// @vitest-environment happy-dom
// Auditoría de cierre · LARVIA. La vista admitía las filas de Larvicultura SIN tanque
// (registros a nivel de MÓDULO) como si fueran del tanque abierto. El laboratorio confirma
// que un análisis LARVIA se registra SIEMPRE con tanque, así que:
//   · hoy el efecto es que las fechas de esas filas de módulo —sin biometría— entran en el
//     eje de los 8 gráficos (`metricSlice` recorta los nulos de los extremos, no los de en
//     medio), y
//   · si alguna vez llegara un análisis sin tanque, se pintaría como propio en TODOS los
//     tanques del módulo a la vez. Medido antes de corregir: la serie PL/g de TQ1 salía
//     [210, 999] y su bitácora incluía «A-MODULO».
// Mismo criterio que omtex.js y que Población/Observaciones de la vista Tanque.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const charts = [];
vi.mock('../../core/charts.js', () => ({
  makeChart: (id, cfg) => { charts.push({ id, cfg }); return null; },
  destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });

// TQ1 con dos análisis propios (PL/g 210 y 180) y, ENTRE ambas fechas, dos filas de módulo:
// una sin biometría (el caso real de hoy) y otra con biometría (el caso hipotético).
function synth() {
  return [
    L({ Tanque: 'TQ1', Fecha: '01/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
    L({ Tanque: 'TQ1', Fecha: '10/06/2026', 'Estadío': 'PL5', 'Población': '900000', 'ID de Análisis': 'A-TQ1a', 'Plg': '210' }),
    L({ Tanque: '', Fecha: '11/06/2026', 'Estadío': 'PL6', '% Actividad': '95' }),                       // módulo, sin biometría
    L({ Tanque: '', Fecha: '12/06/2026', 'Estadío': 'PL7', 'ID de Análisis': 'A-MODULO', 'Plg': '999' }), // módulo, con biometría
    L({ Tanque: 'TQ1', Fecha: '14/06/2026', 'Estadío': 'PL8', 'Población': '800000', 'ID de Análisis': 'A-TQ1b', 'Plg': '180' }),
  ];
}

let errSpy;
beforeEach(() => {
  store.role = 'administrativo'; store.currentView = 'supervisor';
  store.dateFrom = null; store.dateTo = null;
  store.globalData = synth();
  document.body.innerHTML = '';
  charts.length = 0;
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

function abrirLarvia() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  supervisorView(root);
  // `vState` persiste entre pruebas: puede que ya estemos dentro del módulo o del tanque.
  const card = root.querySelector('[data-nav="module"]');
  if (card) click(card);
  const tank = root.querySelector('[data-nav="tank"]');
  if (tank) click(tank);
  const bio = root.querySelector('[data-nav="larvia"]');
  expect(bio, 'debe existir el enlace a LARVIA en la vista de tanque').toBeTruthy();
  click(bio);
  return root;
}
const seriePlg = () => { const c = charts.find((x) => x.id === 'svBio_plg'); return c ? c.cfg.data : null; };

describe('LARVIA · la serie es del TANQUE, no del módulo', () => {
  it('un análisis de módulo no se pinta como propio del tanque', () => {
    abrirLarvia();
    const d = seriePlg();
    expect(d.datasets[0].data).toEqual([210, 180]);
    expect(d.datasets[0].data).not.toContain(999);
  });

  it('las fechas de las filas de módulo no ocupan sitio en el eje', () => {
    abrirLarvia();
    expect(seriePlg().labels).toEqual(['10/06/2026', '14/06/2026']);
  });

  it('la bitácora del tanque no lista el análisis del módulo', () => {
    const root = abrirLarvia();
    expect(root.textContent).toContain('A-TQ1a');
    expect(root.textContent).not.toContain('A-MODULO');
  });

  it('no se pasa de corrección: los análisis propios siguen todos', () => {
    const root = abrirLarvia();
    expect(root.textContent).toContain('A-TQ1b');
    expect(seriePlg().datasets[0].data).toHaveLength(2);
  });
});
