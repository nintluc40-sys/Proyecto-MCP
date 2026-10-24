// @vitest-environment happy-dom
/* ============================================================
   VISITANTE · el bloque 🥚 Maduración cuando su código NO llega (bloque 4, tarea 5, 2026-10-23, usuario)

   El bloque se baja con import() al pintar Visitante. Si el archivo no llega —sin señal la primera vez, o tras un
   despliegue que lo renombró—, antes el panel salía sin el bloque y nada lo explicaba (sólo la consola). Ahora el hueco
   lo DICE, con el texto de las vistas diferidas, y el resto del panel sale igual. Aquí el archivo se simula roto para
   todo este archivo de pruebas (por eso va aparte de maduracion.test.js).
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));
vi.mock('./maduracion.produccion.js', () => {
  throw new Error('Failed to fetch dynamically imported module: /assets/maduracion.produccion-roto.js');
});

import { store } from '../../core/store.js';
import { visitanteView } from './index.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };

const L = (cor, fecha) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Tanque: 'TQ1', 'Población': '1000', Corrida: cor, Fecha: fecha });
const DES = { _SheetOrigin: 'Maduracion', Fecha: '05/09/2026', Lote: 'LA', 'Código genético': 'CA', Desoves: 10,
  'Total de huevos': 1000000, N2: 450000, N5: 400000 };

let root, errSpy;
beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  store.globalData = [];
  errSpy.mockRestore();
  root.remove();
  delete navigator.onLine;   // quita el «sin señal» propio que pone una prueba; vuelve el del navegador
});
const cargada = async () => { await vi.dynamicImportSettled(); await new Promise((r) => setTimeout(r, 0)); };
const aviso = () => root.querySelector('[data-vt-mad] [role="alert"]');

describe('Visitante · 🥚 Maduración que no llega (bloque 4, tarea 5)', () => {
  /* ⚠ Va PRIMERA: el fallo se recuerda en el módulo (como `vtState`), y sólo en la primera pintada del archivo el hueco
     sale vacío y lo rellena la carga diferida al fallar, que es el camino que esta prueba vigila. */
  it('🔴 con datos de Maduración y su archivo sin llegar, el hueco LO DICE y el resto del panel sale', async () => {
    store.globalData = [L('591', '05/09/2026'), DES];
    visitanteView(root);
    await cargada();
    expect(aviso(), 'el hueco 🥚 no dice nada').not.toBeNull();
    expect(aviso().textContent).toContain('🥚 Maduración');
    expect(root.querySelector('[data-vtmonthlbl]')).not.toBeNull();       // el navegador de mes, el resto del panel
    expect(errSpy).toHaveBeenCalled();                                      // y en la consola, como antes
  });

  it('🔴 sin señal, dice que necesita señal y cómo reintentar', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    store.globalData = [L('591', '05/09/2026'), DES];
    visitanteView(root);
    await cargada();
    expect(aviso().textContent).toContain('necesita señal');
    expect(aviso().textContent).toContain('cambia de mes');
  });

  it('sin datos de Maduración no se intenta ni se avisa, aunque una carga anterior fallara', async () => {
    store.globalData = [L('591', '05/09/2026'), DES];
    visitanteView(root);
    await cargada();
    expect(aviso()).not.toBeNull();                                         // la carga falló…
    root.innerHTML = '';
    store.globalData = [L('591', '05/09/2026')];                            // …y ahora no hay Maduración
    visitanteView(root);
    await cargada();
    expect(root.querySelector('[data-vt-mad]').textContent.trim()).toBe('');
  });
});
