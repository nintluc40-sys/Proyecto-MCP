// @vitest-environment happy-dom
/* ============================================================
   SUPERVISOR · «🚨 N/M tanques en alerta» de la tarjeta de la Vista Ejecutiva y su regla, `enAlerta` (etapas.js)
   2026-10-29 (Sesión B, ronda 12, tarea 12·10): `enAlerta` no la usaba nadie y la tarjeta (executive.js) llevaba su
   regla copiada a mano; por decisión del usuario («usarla») la tarjeta la llama. Ninguna prueba vigilaba ese recuento:
   éstas fijan la regla (OD o temperatura en «malo» o «grave»; la supervivencia, sólo «grave») y que la tarjeta la use.
   ============================================================ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({
  makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {},
}));

import { store } from '../../core/store.js';
import { THRESHOLDS } from '../../config.js';
import { enAlerta } from './etapas.js';
import { supervisorView } from './index.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
}

describe('enAlerta: la regla del tanque en alerta', () => {
  const OD_OK = THRESHOLDS.od.optimo[0], TMP_OK = THRESHOLDS.tmp.optimo[0];
  it('con todo en rango, no; con la supervivencia «malo» (40–70 %), tampoco: es común a mitad de ciclo', () => {
    expect(enAlerta({ od: OD_OK, tmp: TMP_OK, sv: 95 })).toBe(false);
    expect(enAlerta({ od: OD_OK, tmp: TMP_OK, sv: (THRESHOLDS.sv.malo + THRESHOLDS.sv.bueno) / 2 })).toBe(false);
    expect(enAlerta({ od: null, tmp: null, sv: null }), 'sin datos no es alerta').toBe(false);
  });
  it('sí: la supervivencia grave, o el OD o la temperatura fuera de rango', () => {
    expect(enAlerta({ od: OD_OK, tmp: TMP_OK, sv: THRESHOLDS.sv.malo - 1 })).toBe(true);
    expect(enAlerta({ od: 0.5, tmp: TMP_OK, sv: 95 })).toBe(true);
    expect(enAlerta({ od: OD_OK, tmp: 45, sv: 95 })).toBe(true);
  });
});

describe('Vista Ejecutiva · la tarjeta cuenta los tanques en alerta con enAlerta', () => {
  const L = (o) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Corrida: '573', ...o });
  let errSpy;
  beforeEach(() => {
    store.role = 'administrativo'; store.currentView = 'supervisor';
    store.dateFrom = null; store.dateTo = null;
    document.body.innerHTML = '';
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

  it('🔴 TQ1 cae al 30 % (grave) y TQ2 sigue al 95 %: «🚨 1/2 tanque en alerta»', () => {
    store.globalData = [
      L({ Tanque: 'TQ1', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
      L({ Tanque: 'TQ1', Fecha: '10/06/2026', 'Estadío': 'PL2', 'Población': '300000' }),
      L({ Tanque: 'TQ2', Fecha: '02/06/2026', 'Estadío': 'N5', 'Población': '1000000' }),
      L({ Tanque: 'TQ2', Fecha: '10/06/2026', 'Estadío': 'PL2', 'Población': '950000' }),
    ];
    const root = document.createElement('div');
    document.body.appendChild(root);
    supervisorView(root);
    expect(root.textContent).toContain('🚨 1/2 tanque en alerta');
  });
});
