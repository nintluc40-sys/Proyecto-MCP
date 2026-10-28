// @vitest-environment happy-dom
/* 🌦 Clima · la pastilla en las CUATRO vistas que decidió el usuario (2026-10-27): 👁️ Supervisor (junto a 🌊 Mareas, en
   el módulo), 🦐 Larvicultura (sus controles), 🌿 Algas (la cabecera) y 🥚 Maduración (la barra Operativo/Microchips, la
   ven las dos familias). En cada una: con hojas de clima, la pastilla en su sitio y abre el modal; sin ellas, ni pastilla
   ni modal. Datos ficticios. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null,
  destroyChart: () => {},
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { supervisorView } from '../supervisor/index.js';
import { larviculturaView } from '../larvicultura/index.js';
import { algasView } from '../algas/index.js';
import { maduracionEntrada } from '../maduracion/entrada.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const CLIMA = Array.from({ length: 16 }, (_, h) => ({
  _SheetOrigin: 'Clima horas', Fecha: '27/10/2026', Hora: String(h), Fuente: 'Observado SESA', 'Temperatura (°C)': '27.5',
  'Humedad (%)': '80', 'Viento (km/h)': '10', Actualizado: '27/10/2026 15:00',
})).concat([{ _SheetOrigin: 'Clima', Fecha: '27/10/2026', Tipo: 'Registro', 'Horas observadas': '16' }]);

const L = (o) => ({ _SheetOrigin: 'Larvicultura', ...o });
const T = (o) => ({ _SheetOrigin: 'Control_Tanque', ...o });
function base() {
  const rows = [];
  ['01/06/2026', '05/06/2026'].forEach((f, i) => {
    rows.push(L({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', Fecha: f, Lote: 'AB', 'Población': String(1000000 - i * 100000), 'Estadío': 'Z3', Salinidad: '30' }));
    rows.push(T({ 'Módulo': 'M01', Corrida: '573', Tanque: 'TQ1', Fecha: f, Hora: '8:00:00', OD: '6.2', Temperatura: '31' }));
  });
  rows.push({ _SheetOrigin: 'Lab_Algas', Fecha: '02/06/2026', Corrida_Larv: '573', Modulo_Larv: 'M01', Sistema: 'M1', Dia_Proceso: '1', Cel_ml: '1000', Especie: 'TW' });
  rows.push({ _SheetOrigin: 'Maduracion', 'Camaronera origen': 'X', Fecha: '01/09/2026', Lote: 'QA', 'Código genético': 'CA', Sala: 'Sala 1', Tanque: '1', Machos: '5', Hembras: '5' });
  return rows;
}

const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
let root, errSpy;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 20, 10)));
  store.role = 'administrativo'; store.currentView = 'supervisor'; store.dateFrom = null; store.dateTo = null;
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); vi.useRealTimers(); document.body.classList.remove('modal-open'); });

const VISTAS = [
  // (Supervisor recuerda el módulo abierto entre pintadas: la tarjeta sólo está la primera vez)
  ['👁️ Supervisor, junto a 🌊 Mareas', '.sv-actions', (r) => { supervisorView(r); const c = r.querySelector('[data-nav="module"]'); if (c) click(c); }],
  ['🦐 Larvicultura, en sus controles', '.lq-controls', (r) => larviculturaView(r)],
  ['🌿 Algas, en la cabecera', '.alg-head', (r) => algasView(r)],
  ['🥚 Maduración, en la barra de las dos familias', '.clima-con', (r) => maduracionEntrada(r)],
];

describe.each(VISTAS)('%s', (_, sitio, pintar) => {
  it('con hojas de clima: la pastilla en su sitio, y abre el modal', async () => {
    store.globalData = base().concat(CLIMA);
    await pintar(root);
    const b = root.querySelector(`${sitio} [data-clima-open]`);
    expect(b, 'la pastilla en ' + sitio).toBeTruthy();
    expect(b.textContent).toBe('🌦 27,5 °C · 80 % · 10 km/h');
    expect(root.querySelectorAll('#climaModal')).toHaveLength(1);
    click(b);
    expect(root.querySelector('#climaModal').classList.contains('sv-open')).toBe(true);
    expect(root.querySelector('#climaBody .clima-cab').textContent).toContain('27 de octubre de 2026');
  });

  it('sin hojas de clima: ni pastilla ni modal', async () => {
    store.globalData = base();
    await pintar(root);
    expect(root.querySelector(sitio), 'la vista se pintó').toBeTruthy();
    expect(root.querySelector('[data-clima-open]')).toBeNull();
    expect(root.querySelector('#climaModal')).toBeNull();
  });
});

it('🦐 Larvicultura y 🌿 Algas: la pastilla sobrevive al repintado (cambiar de mes o de filtro vuelve a pintar todo)', async () => {
  store.globalData = base().concat(CLIMA);
  larviculturaView(root);
  // con el MÓDULO elegido, el tablero entero: el otro camino del render (lleva su modal de fisicoquímicos)
  const mod = root.querySelector('[data-filter="modulo"]');
  mod.value = 'M01';
  mod.dispatchEvent(new Event('change', { bubbles: true }));
  expect(root.querySelector('#lqEnvModal'), 'el tablero con módulo').toBeTruthy();
  click(root.querySelector('[data-clima-open]'));
  expect(root.querySelector('#climaModal').classList.contains('sv-open')).toBe(true);
  const r2 = document.createElement('div');
  document.body.appendChild(r2);
  algasView(r2);
  algasView(r2);   // su `bind` corta la delegación al repintar: el clima se cablea antes
  click(r2.querySelector('[data-clima-open]'));
  expect(r2.querySelector('#climaModal').classList.contains('sv-open')).toBe(true);
});
