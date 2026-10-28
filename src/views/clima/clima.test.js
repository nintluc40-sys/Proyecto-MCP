// @vitest-environment happy-dom
/* 🌦 Clima · la pastilla y el modal (2026-10-27, Sesión A ronda 9, tarea 1 · F2b). Datos ficticios con la forma del CSV.
   Lo que se guarda: sin hojas de clima no hay ni pastilla ni modal; la pastilla da la hora más reciente y avisa si lo
   último es viejo; el modal abre en HOY (Día: indicadores, curva por horas, franjas, pronóstico y horas con su fuente,
   las que quedan del día marcadas) y pasa a Mes (tendencia y días, con los incompletos); al cerrar se van sus gráficos. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const charts = { creados: [], destruidos: [] };
vi.mock('../../core/charts.js', () => ({
  makeChart: (id) => { charts.creados.push(id); return null; },
  destroyChart: (id) => { charts.destruidos.push(id); },
  destroyAllCharts: () => {},
  Chart: class {},
}));

import { store } from '../../core/store.js';
import { climaPastillaHTML, climaModalHTML, cablearClima } from './clima.js';

const hora = (fecha, h, o = {}) => ({
  _SheetOrigin: 'Clima horas', Fecha: fecha, Hora: String(h), Fuente: 'MET', 'Temperatura (°C)': '25', 'Humedad (%)': '80',
  'Viento (km/h)': '10', 'Lluvia (mm)': '0.1', Actualizado: '27/10/2026 15:00', ...o,
});
const dia = (fecha, o = {}) => ({
  _SheetOrigin: 'Clima', Fecha: fecha, Tipo: 'Registro', 'Temp mín (°C)': '23', 'Temp máx (°C)': '29', 'Temp media (°C)': '25.6',
  'Humedad (%)': '82', 'Lluvia (mm)': '1.2', 'Horas observadas': '13', 'Horas MET': '11', 'Horas NASA': '0', ...o,
});
/** 26/10 entero; el 27/10, de 6 a 15 observado y de 16 a 23 el pronóstico de MET; el 27 aún incompleto; 3 de pronóstico. */
function filas(o = {}) {
  return [
    ...Array.from({ length: 24 }, (_, h) => hora('26/10/2026', h, { Fuente: 'NASA', ...o })),
    ...Array.from({ length: 24 }, (_, h) => hora('27/10/2026', h, h >= 6 && h <= 15 ? { Fuente: 'Observado SESA', 'Temperatura (°C)': '27.5', ...o } : o)),
    dia('26/10/2026'),
    dia('27/10/2026', { 'Temp mín (°C)': '', 'Temp máx (°C)': '', 'Temp media (°C)': '', 'Horas observadas': '10', 'Horas MET': '6' }),
    dia('28/10/2026', { Tipo: 'Pronóstico' }), dia('29/10/2026', { Tipo: 'Pronóstico' }), dia('30/10/2026', { Tipo: 'Pronóstico' }),
    { _SheetOrigin: 'Larvicultura', Fecha: '27/10/2026', Corrida: '600' },
  ];
}

let root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 20, 10)));   // 15:10 en Ecuador
  charts.creados.length = 0; charts.destruidos.length = 0;
  store.globalData = filas();
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => { root.remove(); store.globalData = []; vi.useRealTimers(); document.body.classList.remove('modal-open'); });

const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
function montar() {
  root.innerHTML = `<div class="cab">${climaPastillaHTML()}</div>${climaModalHTML()}`;
  cablearClima(root, root.querySelector('#climaModal'));
  return root.querySelector('[data-clima-open]');
}

describe('sin hojas de clima', () => {
  it('ni pastilla ni modal (y cablear no hace nada)', () => {
    store.globalData = [{ _SheetOrigin: 'Larvicultura', Fecha: '27/10/2026' }];
    expect(climaPastillaHTML()).toBe('');
    expect(climaModalHTML()).toBe('');
    expect(cablearClima(root, null)).toBeNull();
  });
});

describe('la pastilla', () => {
  it('la hora más reciente que ya llegó, con su hora y su fuente en la ayuda', () => {
    const b = montar();
    expect(b.textContent).toBe('🌦 27,5 °C · 80 % · 10 km/h');
    expect(b.getAttribute('title')).toMatch(/^15:00 · Observado SESA · Datos: METAR SESA \(NOAA\) · MET Norway · NASA POWER$/);
    expect(b.classList.contains('clima-pastilla--vieja')).toBe(false);
    expect(climaPastillaHTML({ clase: 'sv-action-btn' })).toMatch(/class="sv-action-btn clima-pastilla"/);
  });

  it('con lo último escrito hace más de 6 h, lo AVISA', () => {
    store.globalData = filas({ Actualizado: '27/10/2026 08:00' });
    const b = montar();
    expect(b.textContent).toBe('🌦 ⚠ sin actualizar desde 27/10 08:00');
    expect(b.classList.contains('clima-pastilla--vieja')).toBe(true);
  });
});

describe('el modal', () => {
  it('abre en HOY: indicadores (con el incompleto), curva por horas, franjas, pronóstico y las horas con su fuente', () => {
    click(montar());
    const m = root.querySelector('#climaModal');
    expect(m.classList.contains('sv-open')).toBe(true);
    expect(m.querySelector('.clima-cab').textContent).toContain('27 de octubre de 2026');
    expect(m.querySelector('[data-clima-diasel]').value).toBe('2026-10-27');
    // hoy aún no tiene sus 24 horas: se dice UNA vez, sin indicadores vacíos
    expect(m.querySelector('.clima-cab').textContent).toContain('incompleto (16 de 24 h)');
    expect(m.querySelector('.clima-kpis')).toBeNull();
    expect(m.querySelector('.clima-nota').textContent).toContain('lleva 16');
    expect(charts.creados).toEqual(['climaDiaChart']);
    expect(m.querySelectorAll('.clima-tabla')[0].querySelectorAll('tbody tr')).toHaveLength(4);   // las franjas
    expect([...m.querySelectorAll('.clima-pron-d')].map((x) => x.querySelector('.clima-pron-f').textContent)).toEqual(['28/10', '29/10', '30/10']);
    const horas = m.querySelectorAll('.clima-horas tbody tr');
    expect(horas).toHaveLength(24);
    expect(m.querySelectorAll('.clima-horas tr.clima-futura')).toHaveLength(8);   // de las 16 a las 23: pronóstico
    expect(horas[15].textContent).toContain('Observado SESA');
    expect(m.querySelector('.clima-aviso')).toBeNull();
    expect(m.querySelector('.clima-cita').textContent).toBe('Datos: METAR SESA (NOAA) · MET Norway · NASA POWER');
  });

  it('◀ y el selector cambian de día; un día pasado no trae pronóstico', () => {
    click(montar());
    const m = root.querySelector('#climaModal');
    click(m.querySelector('[data-clima-dia="2026-10-26"]'));
    expect(m.querySelector('.clima-cab').textContent).toContain('26 de octubre de 2026');
    expect(m.querySelector('.clima-cab').textContent).not.toContain('incompleto');
    // un día completo: sus indicadores; el que no tiene dato, «—» y sin unidad
    const kpis = [...m.querySelectorAll('.clima-kpis .sv-marea-kpi')].map((k) => k.querySelector('.sv-marea-kpi-l').textContent + ' ' + k.querySelector('.sv-marea-kpi-v').textContent);
    expect(kpis[0]).toBe('Temp. media 25,6°C');
    expect(kpis.find((k) => k.startsWith('Radiación'))).toBe('Radiación —');
    expect(m.querySelectorAll('.clima-pron-d')).toHaveLength(0);
    expect(m.querySelectorAll('.clima-horas tr.clima-futura')).toHaveLength(0);
    const sel = m.querySelector('[data-clima-diasel]');
    sel.value = '2026-10-28';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(m.querySelector('.clima-cab').textContent).toContain('Pronóstico');
  });

  it('Mes: la tendencia y los días del mes, con el incompleto; los pronósticos marcados', () => {
    click(montar());
    const m = root.querySelector('#climaModal');
    click(m.querySelector('[data-climamode="mes"]'));
    expect(m.querySelector('[data-climamode="mes"]').classList.contains('is-active')).toBe(true);
    expect(charts.creados).toContain('climaMesChart');
    const filasMes = m.querySelectorAll('.clima-tabla tbody tr');
    expect(filasMes).toHaveLength(5);
    expect(filasMes[1].textContent).toContain('incompleto (16 de 24 h)');
    expect(m.querySelectorAll('.clima-tabla tr.clima-futura')).toHaveLength(3);
    expect(m.querySelector('.sv-marea-mbtn.is-on').textContent).toBe('octubre 2026');
  });

  it('con lo último viejo, el modal lo dice arriba', () => {
    store.globalData = filas({ Actualizado: '27/10/2026 08:00' });
    click(montar());
    expect(root.querySelector('#climaModal .clima-aviso').textContent).toContain('27/10 08:00');
  });

  it('cerrar se lleva sus gráficos, y reabrir vuelve a HOY en Día', () => {
    click(montar());
    const m = root.querySelector('#climaModal');
    click(m.querySelector('[data-climamode="mes"]'));
    charts.destruidos.length = 0;   // cada repintado ya los destruye: aquí cuenta sólo lo que hace CERRAR
    click(m.querySelector('[data-clima-close]'));
    expect(m.classList.contains('sv-open')).toBe(false);
    expect(charts.destruidos).toEqual(expect.arrayContaining(['climaDiaChart', 'climaMesChart']));
    click(root.querySelector('[data-clima-open]'));
    expect(m.querySelector('[data-climamode="dia"]').classList.contains('is-active')).toBe(true);
    expect(m.querySelector('[data-clima-diasel]').value).toBe('2026-10-27');
  });

  it('lo que viene de la hoja se escapa', () => {
    store.globalData = filas({ Fuente: '<img src=x onerror=alert(1)>' });
    click(montar());
    expect(root.querySelector('#climaModal img')).toBeNull();
    expect(root.querySelector('[data-clima-open]').getAttribute('title')).toContain('<img');   // como texto
  });
});
