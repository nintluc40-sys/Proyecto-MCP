// @vitest-environment happy-dom
/* ============================================================
   SHELL · los atajos «7 días» y «30 días» siguen a la fecha más reciente (A32, 2026-11-06)

   🔴 LO QUE PASABA. El rango se fijaba UNA vez, al pulsar el botón. Con un día nuevo de datos (el refresco de cada
   5 min), «7 días» seguía siendo la semana anterior, sin el día nuevo, aunque el botón siguiera resaltado.
   🔑 AHORA. Con datos nuevos (EV.DATA), un atajo puesto se re-ancla a la fecha más reciente; «Todo» sigue siendo todo.
   Datos ficticios.
   ============================================================ */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mountShell, MAIN_VIEWS } from './shell.js';
import { registerView, changeView } from './router.js';
import { store, emit, EV } from '../core/store.js';
import { applySheets } from '../core/sheets.js';

const dia = (d) => [d.getDate(), d.getMonth() + 1, d.getFullYear()];
const cargar = (...fechas) => {
  applySheets({ 'Datos Larvicultura - M01': fechas.map((f) => ({ _SheetOrigin: 'Larvicultura', Fecha: f, Tanque: 'T1' })) });
  emit(EV.DATA, { firstLoad: false });
};
let host;
const boton = (id) => host.querySelector(`[data-preset="${id}"]`);

beforeAll(() => {
  store.connected = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  for (const v of MAIN_VIEWS) registerView(v.id, { label: v.label, icon: v.icon, usaBarraFecha: true, render: () => {} });
  mountShell(host);
  changeView('supervisor');
});

beforeEach(() => {
  cargar('01/10/2026', '05/11/2026');
  boton('all').click();
});

describe('A32 · atajos de fecha con un día nuevo', () => {
  it('🔴 «7 días» se re-ancla al día nuevo y sigue resaltado', () => {
    boton('7').click();
    expect(dia(store.dateFrom)).toEqual([30, 10, 2026]);
    expect(dia(store.dateTo)).toEqual([5, 11, 2026]);
    cargar('01/10/2026', '05/11/2026', '06/11/2026');   // llega el día siguiente
    expect(dia(store.dateFrom)).toEqual([31, 10, 2026]);
    expect(dia(store.dateTo)).toEqual([6, 11, 2026]);
    expect(boton('7').classList.contains('is-active')).toBe(true);
  });

  it('🔴 «30 días» también', () => {
    boton('30').click();
    cargar('01/10/2026', '05/11/2026', '08/11/2026');
    expect(dia(store.dateFrom)).toEqual([10, 10, 2026]);
    expect(dia(store.dateTo)).toEqual([8, 11, 2026]);
    expect(boton('30').classList.contains('is-active')).toBe(true);
  });

  it('«Todo» sigue siendo todo con datos nuevos', () => {
    boton('7').click();
    boton('all').click();
    cargar('01/10/2026', '05/11/2026', '06/11/2026');
    expect(store.dateFrom).toBeNull();
    expect(store.dateTo).toBeNull();
  });

  it('sin día nuevo, el rango no se toca', () => {
    boton('7').click();
    const antes = store.dateFrom;
    cargar('01/10/2026', '05/11/2026');
    expect(store.dateFrom).toBe(antes);
  });
});
