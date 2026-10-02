// @vitest-environment happy-dom
// 2026-10-01 (usuario: «en la vista visitante, de manera similar a los demás departamentos, añadir algo que represente
// a la producción sala y lote de Maduración»). Diseño aprobado: por lote y por sala con la regla del tablero (un desove
// cuenta en las salas donde estaba su lote la víspera o ese día; un lote que se mudó cuenta en las dos y se DICE),
// cifras «desoves y N5» y barras de N5 en el detalle. 2026-10-02 (usuario): y la FERTILIDAD, que hasta ese día quedaba
// fuera porque salía >100 % (corregido el 01-10, 12d9d6b): columna en los dos detalles y el total del mes con su cobertura.
// El mes: la fecha del desove (Maduración no tiene corrida), el criterio aprobado para Microbiología.
// Datos FICTICIOS: cada regla EQUIVOCADA da otra cifra.
//   · LA — Sala 1, ingreso 01/08. Desova el 20/08 (10, N5 400 000), el 05/09 (20, N5 800 000) y el 20/09 (5, SIN N5).
//     Nauplios por hembra en septiembre: 800 000 ÷ 20 = 40 000 (con el pendiente dentro saldría 32 000).
//   · LB — Sala 2, ingreso 01/08; el 10/09 se muda ENTERO a la Sala 3. Desova el 10/09 (30, N5 900 000) —el día de la
//     mudanza: cuenta en la 2 y en la 3— y el 15/09 (40, N5 1 200 000), sólo en la 3. Con la sala de ingreso, todo
//     sería de la Sala 2.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/charts.js', () => ({ makeChart: () => null, destroyChart: () => {}, destroyAllCharts: () => {}, Chart: class {} }));

import { store } from '../../core/store.js';
import { visitanteView } from './index.js';
import { calendarRangeOfMonth } from '../../core/prodCalendar.js';

globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

const L = (cor, fecha) => ({ _SheetOrigin: 'Larvicultura', 'Módulo': 'M01', Tanque: 'TQ1', 'Población': '1000', Corrida: cor, Fecha: fecha });
const O = 'Maduracion';
const ING = (fecha, lote, sala, tanque) => ({ _SheetOrigin: O, 'Camaronera origen': 'CX', Fecha: fecha, Lote: lote,
  'Código genético': 'CA', 'Piscina Broodstock': 'P1', Sala: sala, Tanque: tanque, Machos: 10, Hembras: 20 });
const MOV = (fecha, so, to, sd, td) => ({ _SheetOrigin: O, 'Agua destino': 'RAS', Fecha: fecha,
  'Sala origen': so, 'Tanque origen': to, 'Sala destino': sd, 'Tanque destino': td, Machos: 10, Hembras: 20 });
const DES = (fecha, lote, desoves, n5) => ({ _SheetOrigin: O, Fecha: fecha, Lote: lote, 'Código genético': 'CA',
  Desoves: desoves, 'Total de huevos': desoves * 100000, N2: n5 === '' ? '' : n5 + 50000, N5: n5 });

// Julio = corridas 579–584, Agosto = 585–590, Septiembre = 591–596 (calendario de producción).
const LARV = () => [L('579', '05/07/2026'), L('585', '05/08/2026'), L('591', '05/09/2026')];
const PLANTA = () => [
  ING('01/08/2026', 'LA', 'Sala 1', 1),
  ING('01/08/2026', 'LB', 'Sala 2', 5),
  MOV('10/09/2026', 'Sala 2', 5, 'Sala 3', 7),
  DES('20/08/2026', 'LA', 10, 400000),
  DES('05/09/2026', 'LA', 20, 800000),
  DES('20/09/2026', 'LA', 5, ''),
  DES('10/09/2026', 'LB', 30, 900000),
  DES('15/09/2026', 'LB', 40, 1200000),
];

let root, errSpy;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { store.globalData = []; errSpy.mockRestore(); });

// El bloque llega DIFERIDO (import() de las reglas del tablero): se espera a que la carga termine y se pinte.
const cargada = async () => { await vi.dynamicImportSettled(); await new Promise((r) => setTimeout(r, 0)); };
const mes = () => root.querySelector('[data-vtmonthlbl]').textContent;
// La vista RECUERDA el mes entre pruebas: se abre y se lleva al último (Septiembre), el que abre por defecto.
const abrir = async (rows) => {
  store.globalData = rows;
  visitanteView(root);
  while (!root.querySelector('[data-vtnext]').disabled) click(root.querySelector('[data-vtnext]'));
  await cargada();
};
const atras = async () => { click(root.querySelector('[data-vtprev]')); await cargada(); };
const tarjeta = (k) => root.querySelector(`[data-sum="${k}"]`);
const detalle = (k) => { click(tarjeta(k)); return document.getElementById('vtSumBody'); };
const filas = (body) => [...body.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));

describe('Visitante · 🥚 Maduración por mes (la fecha del desove)', () => {
  it('🔴 septiembre: nauplios N5 y desoves SÓLO de septiembre (el de agosto no se cuela)', async () => {
    await abrir([...LARV(), ...PLANTA()]);
    expect(mes()).toBe('Septiembre');
    const t = tarjeta('madLotes').textContent;
    expect(t).toContain('2.9M');
    expect(t).toContain('95 desoves · 2 lote(s)');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('🔴 agosto: sólo el desove de agosto', async () => {
    await abrir([...LARV(), ...PLANTA()]);
    await atras();
    expect(mes()).toBe('Agosto');
    expect(tarjeta('madLotes').textContent).toContain('400K');
    expect(tarjeta('madLotes').textContent).toContain('10 desoves · 1 lote(s)');
  });

  it('un mes sin desoves no muestra el bloque; sin hoja de Maduración, tampoco', async () => {
    await abrir([...LARV(), ...PLANTA()]);
    await atras(); await atras();
    expect(mes()).toBe('Julio');
    expect(tarjeta('madLotes')).toBeNull();
    await abrir(LARV());
    expect(tarjeta('madLotes')).toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe('Visitante · 🥚 detalle por lote y por sala', () => {
  it('🔴 por lote: nauplios por hembra SIN el desove pendiente', async () => {
    await abrir([...LARV(), ...PLANTA()]);
    const body = detalle('madLotes');
    expect(filas(body).map((f) => f.slice(0, 4))).toEqual([
      ['LA', '25', '800.000', '40.000'],
      ['LB', '70', '2.100.000', '30.000'],
    ]);
    expect(body.textContent).toContain('1 desove(s) aún sin su conteo de N5');
    expect(body.textContent).toContain('del 01/09 al 30/09');
    expect(body.querySelector('canvas#vtMadChart')).not.toBeNull();
  });

  it('🔴 por sala: el lote que se mudó cuenta en las dos salas el día de la mudanza, y se avisa', async () => {
    await abrir([...LARV(), ...PLANTA()]);
    expect(tarjeta('madSalas').textContent).toContain('3 sala(s)');
    expect(tarjeta('madSalas').textContent).toContain('más nauplios: Sala 3');
    const body = detalle('madSalas');
    expect(filas(body)).toEqual([
      ['Sala 1', '25', '800.000', '42,5 %', 'LA'],
      ['Sala 2', '30', '900.000', '31,7 %', 'LB'],
      ['Sala 3', '70', '2.100.000', '31,4 %', 'LB'],
    ]);
    expect(body.textContent).toContain('las salas no suman el total del mes (95 desoves)');
    expect(body.querySelector('canvas#vtMadChart')).not.toBeNull();
  });

  it('sin mudanzas las salas sí suman el total: no se avisa de lo que no pasa', async () => {
    await abrir([...LARV(), ...PLANTA().filter((r) => !('Agua destino' in r) && !(r.Lote === 'LB' && r.Fecha === '10/09/2026' && 'Desoves' in r))]);
    const body = detalle('madSalas');
    expect(filas(body)).toEqual([
      ['Sala 1', '25', '800.000', '42,5 %', 'LA'],
      ['Sala 2', '40', '1.200.000', '31,3 %', 'LB'],
    ]);
    expect(body.textContent).not.toContain('no suman');
  });
});

/* 2026-10-02 (usuario) · LA FERTILIDAD, con la regla del tablero: N2 ÷ huevos, sólo de los desoves que traen LOS DOS.
   Dos filas más, como las reales (casi ningún desove trae sus huevos): LB el 25/09 (10 desoves, N2 600 000, SIN huevos
   ni N5) y LZ el 22/09 (7, N2 300 000, sin huevos ni N5, de un lote sin sala).
   · LA: 850 000 ÷ 2 000 000 = 42,5 % (con los huevos del pendiente del 20/09 —sin N2— saldría 34 %).
   · LB: (950 000 + 1 250 000) ÷ (3 000 000 + 4 000 000) = 31,4 % (con el N2 sin huevos del 25/09 saldría 40 %).
   · LZ: ningún desove con los dos → «—» (no 0 %, ni el N2 entero sobre nada).
   · El mes: 3 050 000 ÷ 9 000 000 = 33,9 %, de 90 de los 112 desoves (20 + 30 + 40).
   · Por sala: la 1 = LA (42,5 %); la 2 = LB del 10/09 (950 000 ÷ 3 000 000 = 31,7 %); la 3 = LB entero (31,4 %). */
const SIN_HUEVOS = () => [
  { ...DES('25/09/2026', 'LB', 10, ''), 'Total de huevos': '', N2: 600000 },
  { ...DES('22/09/2026', 'LZ', 7, ''), 'Total de huevos': '', N2: 300000 },
];

describe('Visitante · 🥚 la fertilidad (sólo de los desoves con N2 y huevos contados)', () => {
  it('🔴 por lote: columna «Fertilidad», «—» si el lote no trae ninguno con los dos', async () => {
    await abrir([...LARV(), ...PLANTA(), ...SIN_HUEVOS()]);
    const body = detalle('madLotes');
    expect(filas(body).map((f) => [f[0], f[4]])).toEqual([['LA', '42,5 %'], ['LB', '31,4 %'], ['LZ', '—']]);
    expect([...body.querySelectorAll('thead th')].map((th) => th.textContent.trim())).toContain('Fertilidad');
  });

  it('🔴 el total del mes, con su cobertura: de cuántos desoves sale', async () => {
    await abrir([...LARV(), ...PLANTA(), ...SIN_HUEVOS()]);
    const t = detalle('madLotes').textContent;
    expect(t).toContain('Fertilidad del mes: 33,9 %');
    expect(t).toContain('de 90 de los 112 desoves');
  });

  it('🔴 por sala: columna «Fertilidad» con los desoves que cuentan en esa sala', async () => {
    await abrir([...LARV(), ...PLANTA(), ...SIN_HUEVOS()]);
    const body = detalle('madSalas');
    expect(filas(body).map((f) => [f[0], f[3]])).toEqual([['Sala 1', '42,5 %'], ['Sala 2', '31,7 %'], ['Sala 3', '31,4 %']]);
  });

  it('un mes sin ningún desove con los dos lo DICE (no 0 %)', async () => {
    const { produccionDelMes } = await import('./maduracion.produccion.js');
    const s = produccionDelMes([ING('01/08/2026', 'LB', 'Sala 2', 5), ...SIN_HUEVOS()], { desde: '2026-09-01', hasta: '2026-09-30' }, '2026-10-01');
    expect(s.total.fertilidad).toBe('');
    expect(s.total.desovesConFertilidad).toBe(0);
    await abrir([...LARV(), ING('01/08/2026', 'LB', 'Sala 2', 5), ...SIN_HUEVOS()]);
    expect(detalle('madLotes').textContent).toContain('Fertilidad del mes: sin dato');
  });

  it('🔑 el total es el del tablero: el KPI de 🥚 Reproducción y la regla de 📉 Tendencias dan lo mismo', async () => {
    const { produccionDelMes } = await import('./maduracion.produccion.js');
    const { totalesDeReproduccion } = await import('../maduracion/operativo.reproduccion.js');
    const { acumularDesoves } = await import('../maduracion/operativo.tendencias.js');
    const { fuentesDesdeFilas } = await import('../maduracion/operativo.fuentes.js');
    const { normalizarFiltro } = await import('../maduracion/operativo.tablero.js');
    const { fechaDeFila } = await import('../maduracion/operativo.data.js');
    const SEP = { desde: '2026-09-01', hasta: '2026-09-30' };
    const filasMad = [...PLANTA(), ...SIN_HUEVOS()];
    const s = produccionDelMes(filasMad, SEP, '2026-10-01');
    const { fuentes } = fuentesDesdeFilas(filasMad);
    const T = totalesDeReproduccion({ fuentes, fecha: SEP.hasta }, SEP, normalizarFiltro({}));
    expect(s.total.fertilidad).toBe(T.fertilidad);
    expect(acumularDesoves(fuentes.desoves.filter((r) => fechaDeFila('desoves', r).startsWith('2026-09'))).fertilidad).toBe(T.fertilidad);
    expect(Math.round(s.total.fertilidad * 10) / 10).toBe(33.9);
  });
});

describe('Visitante · 🥚 la PRIMERA carga (módulos frescos)', () => {
  it('🔴 las tarjetas que llegan diferidas abren su detalle (se cablean al llegar, no sólo al repintar)', async () => {
    vi.resetModules();
    const { store: st } = await import('../../core/store.js');
    const { visitanteView: vista } = await import('./index.js');
    st.globalData = [...LARV(), ...PLANTA()];
    vista(root);
    while (!root.querySelector('[data-vtnext]').disabled) click(root.querySelector('[data-vtnext]'));
    expect(tarjeta('madLotes'), 'antes de llegar el módulo, el bloque no está').toBeNull();
    await cargada();
    expect(filas(detalle('madLotes'))).toHaveLength(2);
    st.globalData = [];
  });
});

describe('produccionDelMes · los bordes', () => {
  const SEP = { desde: '2026-09-01', hasta: '2026-09-30' };
  it('un desove con fecha posterior a HOY es una errata: no entra (la foto del tablero tampoco lo incluye)', async () => {
    const { produccionDelMes } = await import('./maduracion.produccion.js');
    const s = produccionDelMes(PLANTA(), SEP, '2026-09-12');
    expect(s.periodo).toEqual({ desde: '2026-09-01', hasta: '2026-09-12' });
    expect(s.total.desoves, 'el 05/09 de LA y el 10/09 de LB; no el 15/09 ni el 20/09').toBe(50);
    expect(produccionDelMes(PLANTA(), SEP, '2026-08-31'), 'un mes que aún no empieza').toBeNull();
  });

  it('el desove de un lote que no estaba en ninguna sala se cuenta en el total y se declara aparte', async () => {
    const { produccionDelMes } = await import('./maduracion.produccion.js');
    const s = produccionDelMes([...PLANTA(), DES('12/09/2026', 'LZ', 7, 100000)], SEP, '2026-10-01');
    expect(s.total.desoves).toBe(102);
    expect(s.sinSala).toBe(1);
    expect(s.salas.flatMap((x) => x.lotes)).not.toContain('LZ');
  });
});

describe('calendarRangeOfMonth · el mes de calendario de un mes interno', () => {
  it('inverso de monthIndexOfDate, con el último día real del mes', () => {
    store.globalData = LARV();
    expect(calendarRangeOfMonth(8)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(calendarRangeOfMonth(1)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(calendarRangeOfMonth(13)).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' });
    expect(calendarRangeOfMonth(-1)).toBeNull();
    store.globalData = [];
    expect(calendarRangeOfMonth(8), 'sin año base no hay mes de calendario').toBeNull();
  });
});
