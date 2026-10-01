// @vitest-environment happy-dom
/* ============================================================
   AUTO-REFRESCO · política del 2026-09-24 (P2 del plan de carga y refresco)

   🔴 LO QUE PASABA. Cada 60 s se descargaba el libro entero y, si había cambios, se repintaba la
   vista en el acto: aunque el usuario estuviera tecleando (perdía el foco), con la pestaña oculta
   (gastando datos) y con ⟳ pudiendo lanzar una segunda descarga encima de la primera.

   🔑 AHORA (decisiones del usuario): cada 5 min · con la pestaña oculta no descarga y al volver
   comprueba si ya tocaba · los datos nuevos se APLICAN sólo en reposo (sin interacción reciente,
   sin modal, sin un campo de texto con el foco) y hasta entonces quedan pendientes —el más nuevo
   sustituye al anterior— · ⟳ nunca lanza dos descargas, descarta el pendiente y aplica ya.

   La descarga se simula (descargarLibro / connectSheets / lecturaEnSegundoPlano); el resto de
   sheets.js —huellas, guarda de degradado, aplicarDescarga— es el REAL. Datos ficticios.
   P1 (2026-10-01): con el libro leído en un Worker, el ciclo descarga aunque se esté trabajando.
   ============================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./sheets.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, descargarLibro: vi.fn(), connectSheets: vi.fn(), lecturaEnSegundoPlano: vi.fn(() => false) };
});

import {
  descargarLibro, connectSheets, lecturaEnSegundoPlano, aplicarDescarga, huellasPorHoja, dataFingerprint,
  getLastFingerprint,
} from './sheets.js';
import { startAutoRefresh, stopAutoRefresh, refrescoManual, asegurarLibro } from './refresh.js';
import { store, on, EV } from './store.js';
import { REFRESH_INTERVAL_S } from '../config.js';

const MIN = 60 * 1000;
/** Un set de DOS hojas (uno de una sola hoja sería «degradado») con un valor que distingue cada versión. */
const set = (v) => ({
  'Larvicultura M01': [{ Fecha: '01/09/2026', Tanque: 'T1', Valor: v }],
  'Larvicultura M02': [{ Fecha: '01/09/2026', Tanque: 'T2', Valor: 1 }],
});
/** Lo que devuelve descargarLibro para un set leído entero. */
const descarga = (sheets) => ({ sheets, huellas: huellasPorHoja(sheets), fp: dataFingerprint(sheets) });
const valor = () => (store.globalData.find((r) => r.Tanque === 'T1') || {}).Valor;

let oculto = false;
let datos = 0;
let etiquetas = [];
let offs = [];
const visibilidad = (o) => { oculto = o; document.dispatchEvent(new Event('visibilitychange')); };
const campo = (tipo = 'text') => {
  const el = document.createElement(tipo === 'select' ? 'select' : tipo === 'textarea' ? 'textarea' : 'input');
  if (el.tagName === 'INPUT') el.type = tipo;
  document.body.appendChild(el);
  el.focus();
  return el;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 1, 10, 0, 0));
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto });
  oculto = false;
  descargarLibro.mockReset();
  connectSheets.mockReset();
  lecturaEnSegundoPlano.mockReset();
  lecturaEnSegundoPlano.mockReturnValue(false);
  // Lo que deja la carga inicial: el set 1 aplicado y su huella (sobre filas recién descargadas).
  store.connected = true;
  store.refreshing = false;
  aplicarDescarga(descarga(set(1)));
  datos = 0;
  etiquetas = [];
  offs = [on(EV.DATA, () => { datos++; }), on(EV.CONN, (e) => etiquetas.push(e.label))];
  startAutoRefresh();
});

afterEach(() => {
  stopAutoRefresh();
  offs.forEach((f) => f());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('auto-refresco · intervalo', () => {
  it('comprueba cada 5 minutos, no cada 60 s', async () => {
    expect(REFRESH_INTERVAL_S).toBe(300);
    descargarLibro.mockResolvedValue(descarga(set(1)));
    await vi.advanceTimersByTimeAsync(5 * MIN - 1000);
    expect(descargarLibro).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(descargarLibro).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(descargarLibro).toHaveBeenCalledTimes(2);
  });

  it('sin cambios no emite EV.DATA y la píldora lo dice', async () => {
    descargarLibro.mockResolvedValue(descarga(set(1)));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(0);
    expect(etiquetas.at(-1)).toMatch(/sin cambios/);
  });

  it('con cambios y en reposo los aplica UNA vez y fija la huella de lo aplicado', async () => {
    descargarLibro.mockResolvedValue(descarga(set(2)));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(1);
    expect(valor()).toBe(2);
    expect(getLastFingerprint()).toBe(dataFingerprint(set(2)));
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(datos).toBe(1);
  });

  it('SIN Worker, si el usuario está trabajando al tocar, salta el ciclo (leer aquí congela)', async () => {
    descargarLibro.mockResolvedValue(descarga(set(1)));
    await vi.advanceTimersByTimeAsync(5 * MIN - 1000);
    document.dispatchEvent(new Event('keydown'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(descargarLibro).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(descargarLibro).toHaveBeenCalledTimes(1);
  });
});

describe('auto-refresco · con el libro leído en un Worker (P1)', () => {
  it('descarga aunque el usuario esté trabajando, y aplica al quedar en reposo', async () => {
    lecturaEnSegundoPlano.mockReturnValue(true);
    descargarLibro.mockResolvedValue(descarga(set(2)));
    await vi.advanceTimersByTimeAsync(5 * MIN - 1000);
    document.dispatchEvent(new Event('keydown'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(descargarLibro).toHaveBeenCalledTimes(1);
    expect(datos).toBe(0);
    expect(etiquetas.at(-1)).toMatch(/datos nuevos en espera/);
    await vi.advanceTimersByTimeAsync(12 * 1000);
    expect(datos).toBe(1);
    expect(valor()).toBe(2);
  });

  it('si la descarga falla, conserva los datos y la píldora lo dice', async () => {
    descargarLibro.mockRejectedValue(new Error('No se pudo leer el libro en segundo plano.'));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(0);
    expect(valor()).toBe(1);
    expect(etiquetas.at(-1)).toMatch(/sin actualizar/);
    expect(store.refreshing).toBe(false);
    descargarLibro.mockResolvedValue(descarga(set(3)));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(1); // se reintenta en el siguiente ciclo
  });
});

describe('auto-refresco · pestaña oculta', () => {
  it('oculta no descarga; al volver tras ≥ 5 min comprueba en ese momento', async () => {
    descargarLibro.mockResolvedValue(descarga(set(1)));
    visibilidad(true);
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(descargarLibro).not.toHaveBeenCalled();
    visibilidad(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(descargarLibro).toHaveBeenCalledTimes(1);
  });

  it('al volver ANTES de que toque no adelanta la comprobación', async () => {
    descargarLibro.mockResolvedValue(descarga(set(1)));
    await vi.advanceTimersByTimeAsync(1 * MIN);
    visibilidad(true);
    await vi.advanceTimersByTimeAsync(1 * MIN);
    visibilidad(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(descargarLibro).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(descargarLibro).toHaveBeenCalledTimes(1);
  });

  it('lo pendiente no se aplica con la pestaña oculta, sino al volver', async () => {
    const el = campo();
    descargarLibro.mockResolvedValue(descarga(set(2)));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(0);
    visibilidad(true);
    el.blur();
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(datos).toBe(0);
    visibilidad(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(datos).toBe(1);
  });
});

describe('auto-refresco · aplicar sólo en reposo', () => {
  it('si el usuario trabaja DURANTE la descarga, queda pendiente y se aplica al quedar en reposo (un solo EV.DATA)', async () => {
    let entregar;
    descargarLibro.mockImplementation(() => new Promise((r) => { entregar = r; }));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(descargarLibro).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('click'));
    entregar(descarga(set(2)));
    await vi.advanceTimersByTimeAsync(0);
    expect(datos).toBe(0);
    expect(etiquetas.at(-1)).toMatch(/datos nuevos en espera/);
    await vi.advanceTimersByTimeAsync(10 * 1000);
    expect(datos).toBe(0);
    await vi.advanceTimersByTimeAsync(4 * 1000);
    expect(datos).toBe(1);
    expect(valor()).toBe(2);
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(datos).toBe(1);
  });

  it('un campo de texto con el foco lo retiene; al soltarlo se aplica', async () => {
    const el = campo('text');
    descargarLibro.mockResolvedValue(descarga(set(2)));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(datos).toBe(0);
    expect(valor()).toBe(1);
    el.blur();
    await vi.advanceTimersByTimeAsync(2000);
    expect(datos).toBe(1);
  });

  it('también retienen un textarea y un campo numérico; un desplegable NO (conserva el foco tras elegir)', async () => {
    descargarLibro.mockResolvedValueOnce(descarga(set(2))).mockResolvedValueOnce(descarga(set(3))).mockResolvedValueOnce(descarga(set(4)));
    const ta = campo('textarea');
    await vi.advanceTimersByTimeAsync(5 * MIN + 10 * 1000); // ciclo de las 5:00 → pendiente
    expect(datos).toBe(0);
    ta.blur();
    await vi.advanceTimersByTimeAsync(2000);
    expect(datos).toBe(1);
    const num = campo('number');
    await vi.advanceTimersByTimeAsync(5 * MIN); // ciclo de las 10:00 → pendiente
    expect(descargarLibro).toHaveBeenCalledTimes(2);
    expect(datos).toBe(1);
    num.blur();
    await vi.advanceTimersByTimeAsync(2000);
    expect(datos).toBe(2);
    campo('select');
    await vi.advanceTimersByTimeAsync(5 * MIN); // ciclo de las 15:00 → se aplica con el desplegable enfocado
    expect(descargarLibro).toHaveBeenCalledTimes(3);
    expect(datos).toBe(3);
    expect(valor()).toBe(4);
  });

  it('un pendiente más nuevo sustituye al anterior: se aplica sólo el último', async () => {
    const el = campo();
    descargarLibro.mockResolvedValueOnce(descarga(set(2))).mockResolvedValueOnce(descarga(set(3)));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(descargarLibro).toHaveBeenCalledTimes(2);
    expect(datos).toBe(0);
    el.blur();
    await vi.advanceTimersByTimeAsync(2000);
    expect(datos).toBe(1);
    expect(valor()).toBe(3);
  });

  it('si la hoja vuelve a lo que ya está aplicado, el pendiente se descarta', async () => {
    const el = campo();
    descargarLibro.mockResolvedValueOnce(descarga(set(2))).mockResolvedValueOnce(descarga(set(1)));
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(etiquetas.at(-1)).toMatch(/sin cambios/);
    el.blur();
    await vi.advanceTimersByTimeAsync(1 * MIN);
    visibilidad(true);
    visibilidad(false); // volver a la pestaña reintenta lo pendiente: no debe quedar nada
    await vi.advanceTimersByTimeAsync(0);
    expect(datos).toBe(0);
    expect(valor()).toBe(1);
  });

  it('un libro vacío no aplica nada ni deja la píldora diciendo «en espera»', async () => {
    descargarLibro.mockResolvedValue(descarga({}));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(0);
    expect(valor()).toBe(1);
    expect(etiquetas.some((e) => /en espera/.test(e))).toBe(false);
  });

  it('una descarga degradada (menos hojas) no aplica ni toca la huella', async () => {
    const huella = getLastFingerprint();
    descargarLibro.mockResolvedValue(descarga({ 'Larvicultura M01': [{ Fecha: '01/09/2026', Tanque: 'T1', Valor: 7 }] }));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(0);
    expect(valor()).toBe(1);
    expect(getLastFingerprint()).toBe(huella);
  });
});

describe('asegurarLibro (P3: la primera descarga, al entrar en una vista que lo necesita)', () => {
  it('con el libro ya cargado no hace nada', async () => {
    expect(asegurarLibro()).toBeNull();
    expect(connectSheets).not.toHaveBeenCalled();
  });

  it('sin libro lo pide UNA vez aunque se entre en varias vistas mientras baja', async () => {
    store.connected = false;
    let terminar;
    connectSheets.mockImplementation(() => new Promise((r) => { terminar = r; }));
    const p = asegurarLibro();
    expect(p).not.toBeNull();
    expect(asegurarLibro()).toBeNull();
    expect(await refrescoManual()).toBeNull(); // ⟳ tampoco lanza otra
    expect(connectSheets).toHaveBeenCalledTimes(1);
    terminar(true);
    expect(await p).toBe(true);
    expect(store.refreshing).toBe(false);
  });
});

describe('auto-refresco · ⟳ (refrescoManual)', () => {
  it('con una descarga en curso no lanza otra', async () => {
    descargarLibro.mockImplementation(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(store.refreshing).toBe(true);
    expect(await refrescoManual()).toBeNull();
    expect(connectSheets).not.toHaveBeenCalled();
  });

  it('descarta el pendiente, descarga YA aunque haya foco y reprograma el ciclo', async () => {
    const el = campo();
    descargarLibro.mockResolvedValue(descarga(set(2)));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(datos).toBe(0);
    connectSheets.mockResolvedValue(true);
    expect(await refrescoManual()).toBe(true);
    expect(connectSheets).toHaveBeenCalledTimes(1);
    expect(store.refreshing).toBe(false);
    el.blur();
    await vi.advanceTimersByTimeAsync(1 * MIN);
    visibilidad(true);
    visibilidad(false); // volver a la pestaña reintenta lo pendiente: no debe quedar nada
    await vi.advanceTimersByTimeAsync(0);
    expect(datos).toBe(0); // el pendiente (set 2) se descartó: lo manual manda
    const antes = descargarLibro.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4 * MIN - 1000);
    expect(descargarLibro.mock.calls.length).toBe(antes);
    await vi.advanceTimersByTimeAsync(1000);
    expect(descargarLibro.mock.calls.length).toBe(antes + 1);
  });

  it('mientras corre lo manual, el ciclo automático no descarga', async () => {
    let terminar;
    connectSheets.mockImplementation(() => new Promise((r) => { terminar = r; }));
    descargarLibro.mockResolvedValue(descarga(set(1)));
    await vi.advanceTimersByTimeAsync(4 * MIN);
    const p = refrescoManual();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(descargarLibro).not.toHaveBeenCalled();
    terminar(true);
    await p;
    expect(store.refreshing).toBe(false);
  });
});
