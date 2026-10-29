/* ============================================================
   🔧 MANTENIMIENTO · la capa de datos de la vista (2026-10-28)

   Las filas tienen la forma que el libro da por su exportación CSV (texto, coma decimal, fechas d/m/aaaa). Los
   resultados que se exigen son LOS DEL EXCEL de Blowers con esos mismos datos (sus hojas «Próximos Cambios»,
   «Lecturas» y «Estadísticas» al 22/10): el aceite del BLW-04 vencido a −13,38 h, el del BLW-05 próximo a 16,65 h, la
   carga de 62 / 53 / 54 %, 13 intervenciones de las que 8 son preventivas. Sin series, ubicaciones reales ni nombres.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  MNT_EQUIPOS_SHEET, MNT_PLAN_SHEET, MNT_ESTADO, leerTrabajos, leerLecturas, leerEquipos, leerPlan, horasReales, horometros,
  horometroActual, proximos, porUrgencia, resumenLecturas, serie, indicadores, mensual, porActividad, anios, historial, diaIso,
  horaHM, numero, hojasExcel,
} from './mantenimiento.data.js';

const T = (fecha, equipo, tipo, actividad, horo, v = {}) => ({ _SheetOrigin: 'Mantenimiento Trabajos', Fecha: fecha, Equipo: equipo,
  Tipo: tipo, Actividad: actividad, 'Horómetro (h)': horo, Estado: 'Completado', ID: 'MT-' + equipo + '-' + fecha, ...v });
const L = (fecha, equipo, horo, v = {}) => ({ _SheetOrigin: 'Mantenimiento Lecturas', Fecha: fecha, Hora: '', Equipo: equipo,
  'Horómetro (h)': horo, ID: 'MR-' + equipo + '-' + fecha, ...v });
const E = (codigo, modelo, v = {}) => ({ _SheetOrigin: MNT_EQUIPOS_SHEET, 'Código': codigo, Modelo: modelo, 'Ubicación': 'Módulo X',
  Estado: 'En servicio', 'Corriente ref (A)': modelo === 'FB 441 C' ? '64' : '', 'Presión ref (psi)': '3,5', 'Temperatura ref (°C)': '70',
  'Plena carga (A)': modelo === 'FB 441 C' ? '109' : '163', ...v });
/* Los 13 trabajos del Excel (06/10 → 22/10), los horómetros del 22/10 y sus 3 lecturas de línea base. */
const TRABAJOS = [
  T('6/10/2026', 'BLW-03', 'Inspección', 'Otro', '573,53'), T('6/10/2026', 'BLW-02', 'Inspección', 'Otro', '726,54'),
  T('6/10/2026', 'BLW-01', 'Inspección', 'Otro', '702,4'), T('9/10/2026', 'BLW-06', 'Preventivo', 'Cambio de aceite', '676,05'),
  T('9/10/2026', 'BLW-07', 'Preventivo', 'Cambio de aceite', '652,08'), T('15/10/2026', 'BLW-01', 'Preventivo', 'Cambio de aceite', '918,4'),
  T('15/10/2026', 'BLW-02', 'Preventivo', 'Cambio de aceite', '942,54'), T('15/10/2026', 'BLW-11', 'Inspección', 'Otro', '0'),
  T('21/10/2026', 'BLW-08', 'Preventivo', 'Cambio de aceite', '486,21'), T('21/10/2026', 'BLW-09', 'Preventivo', 'Cambio de aceite', '486,01'),
  T('21/10/2026', 'BLW-03', 'Preventivo', 'Cambio de aceite', '927,3', { ID: 'MT-a' }),
  T('21/10/2026', 'BLW-03', 'Preventivo', 'Cambio de bandas', '927,3', { 'Repuestos / materiales': 'Bandas', Cantidad: '4', ID: 'MT-b' }),
  T('22/10/2026', 'BLW-09', 'Inspección', 'Otro', '534,51'),
];
const LECTURAS = [
  L('6/10/2026', 'BLW-03', '573,53', { 'Corriente (A)': '58,8', 'Presión (psi)': '4', 'Temperatura (°C)': '60' }),
  L('6/10/2026', 'BLW-02', '726,54', { 'Corriente (A)': '67,2', 'Presión (psi)': '4', 'Temperatura (°C)': '60' }),
  L('6/10/2026', 'BLW-01', '702,4', { 'Corriente (A)': '57,9', 'Presión (psi)': '4', 'Temperatura (°C)': '60' }),
  ...[['BLW-02', '1028,42'], ['BLW-03', '927,3'], ['BLW-04', '513,38'], ['BLW-05', '483,35'], ['BLW-06', '839,46'], ['BLW-07', '815,44'],
    ['BLW-08', '534,51'], ['BLW-09', '534,51'], ['BLW-10', '312,58'], ['BLW-11', '164']].map(([q, h]) => L('22/10/2026', q, h, { Hora: '11:48' })),
];
const EQUIPOS = [E('BLW-01', 'FB 441 C', { Estado: 'Stand by', 'Ubicación': '—' })]
  .concat(['02', '03', '04', '05', '06', '07', '08', '10'].map((n) => E('BLW-' + n, 'FB 441 C')))
  .concat([E('BLW-09', 'FB 441 C', { 'Ajuste horómetro (h)': '333,51', 'Ajuste desde': '23/10/2026' }), E('BLW-11', 'FB 621 C')]);
const PLAN = [{ _SheetOrigin: MNT_PLAN_SHEET, Actividad: 'Cambio de aceite', 'Intervalo (h)': '3000', 'Intervalo (días)': '', 'Primer cambio (h)': '500' },
  { _SheetOrigin: MNT_PLAN_SHEET, Actividad: 'Cambio de bandas', 'Intervalo (h)': '', 'Intervalo (días)': '' }];
const OTRAS = [{ _SheetOrigin: 'Larvicultura', Fecha: '22/10/2026', Equipo: 'BLW-02', 'Horómetro (h)': '1' }];
const LIBRO = [...TRABAJOS, ...LECTURAS, ...EQUIPOS, ...PLAN, ...OTRAS];

function modelo(rows = LIBRO) {
  const trabajos = leerTrabajos(rows), lecturas = leerLecturas(rows), equipos = leerEquipos(rows), plan = leerPlan(rows);
  const lista = horometros(lecturas, trabajos, equipos);
  return { trabajos, lecturas, equipos, plan, lista };
}
const uno = (l, equipo, actividad = 'Cambio de aceite') => l.find((x) => x.equipo === equipo && x.actividad === actividad);

describe('Mantenimiento · leer las hojas', () => {
  it('sólo las filas de SUS hojas, con números de coma decimal, fechas d/m/aaaa y horas en cualquier forma', () => {
    const m = modelo();
    expect(m.trabajos).toHaveLength(13);
    expect(m.lecturas).toHaveLength(13);
    expect(m.trabajos[5]).toMatchObject({ fecha: '2026-10-15', equipo: 'BLW-01', horometro: 918.4, estado: 'Completado' });
    expect(numero('1.028,42')).toBe(1028.42);
    expect(numero('1,028.42'), 'parseNum de core/fields daría 1,028').toBe(1028.42);
    expect(numero('')).toBeNull();
    expect(diaIso('22/10/2026')).toBe('2026-10-22');
    expect(horaHM('8:05:00')).toBe('08:05');
    expect(horaHM(new Date(2026, 9, 22, 7, 30))).toBe('07:30');
    expect(horaHM('25:00')).toBe('');
  });

  it('los equipos: los de la hoja con su ficha y, sin ella, los de la ficha de Registros', () => {
    const eq = leerEquipos([E('BLW-03', 'FB 441 C'), E('BLW-12', 'FB 999')]);
    expect(eq.map((e) => e.codigo)).toEqual(['BLW-01', 'BLW-02', 'BLW-03', 'BLW-04', 'BLW-05', 'BLW-06', 'BLW-07', 'BLW-08', 'BLW-09',
      'BLW-10', 'BLW-11', 'BLW-12']);
    expect(eq.find((e) => e.codigo === 'BLW-03')).toMatchObject({ sinFicha: false, ref: { corriente: 64, presion: 3.5, temperatura: 70 } });
    expect(eq.find((e) => e.codigo === 'BLW-04').sinFicha).toBe(true);
    expect(modelo().equipos[0]).toMatchObject({ codigo: 'BLW-01', standBy: true });
  });

  it('el plan: las 10 actividades, con lo que diga la hoja', () => {
    const p = leerPlan(PLAN);
    expect(p).toHaveLength(10);
    expect(p[0]).toMatchObject({ actividad: 'Cambio de aceite', horas: 3000, dias: null, primer: 500 });
    expect(p[1]).toMatchObject({ actividad: 'Cambio de bandas', horas: null });
  });
});

describe('Mantenimiento · el horómetro (lo del tablero + el ajuste)', () => {
  it('🔴 el ajuste del BLW-09 se suma a lo leído DESDE su fecha (incluida), no antes', () => {
    const e = { ajuste: 333.51, ajusteDesde: '2026-10-23' };
    expect(horasReales(210, e, '2026-10-22'), 'lo importado ya son horas reales').toBe(210);
    expect(horasReales(210, e, '2026-10-23')).toBe(543.51);
    expect(horasReales(210, {}, '2026-10-30')).toBe(210);
  });

  it('el actual es el MAYOR conocido entre rondas y trabajos, ya ajustado', () => {
    const m = modelo(LIBRO.concat([L('24/10/2026', 'BLW-09', '210')]));
    expect(horometroActual(m.lista, 'BLW-09')).toMatchObject({ h: 543.51, tablero: 210, fecha: '2026-10-24', origen: 'Ronda' });
    expect(horometroActual(modelo().lista, 'BLW-01')).toMatchObject({ h: 918.4, origen: 'Trabajo' });
    expect(horometroActual(modelo().lista, 'BLW-99')).toBeNull();
  });
});

describe('Mantenimiento · 🚦 próximos cambios (lo que decía el Excel al 22/10)', () => {
  const m = modelo();
  const l = proximos({ ...m, hoy: '2026-10-22' });

  it('🔴 el aceite del BLW-04 está VENCIDO (−13,38 h: pasó el primer cambio de 500 h) y el del BLW-05, PRÓXIMO (16,65 h)', () => {
    expect(uno(l, 'BLW-04')).toMatchObject({ estado: MNT_ESTADO.VENCIDO, faltanH: -13.38, proxH: 500, base: 'Primer cambio' });
    expect(uno(l, 'BLW-05')).toMatchObject({ estado: MNT_ESTADO.PROXIMO, faltanH: 16.65 });
  });

  it('con un cambio hecho, el próximo es ese horómetro + 3000 h', () => {
    expect(uno(l, 'BLW-02')).toMatchObject({ estado: MNT_ESTADO.AL_DIA, ultimoFecha: '2026-10-15', ultimoH: 942.54, proxH: 3942.54,
      actualH: 1028.42, faltanH: 2914.12, base: 'Último registro' });
    expect(uno(l, 'BLW-01')).toMatchObject({ proxH: 3918.4, faltanH: 3000, standBy: true });
    expect(uno(l, 'BLW-09')).toMatchObject({ proxH: 3486.01, faltanH: 2951.5 });
  });

  it('sin intervalo en el plan no se juzga («—»), y un pendiente no cuenta como cambio hecho', () => {
    expect(uno(l, 'BLW-03', 'Cambio de bandas')).toMatchObject({ estado: MNT_ESTADO.SIN_PLAN, ultimoFecha: '2026-10-21' });
    const p = proximos({ ...modelo(LIBRO.concat([T('25/10/2026', 'BLW-04', 'Preventivo', 'Cambio de aceite', '520', { Estado: 'Pendiente' })])), hoy: '2026-10-25' });
    expect(uno(p, 'BLW-04').estado).toBe(MNT_ESTADO.VENCIDO);
  });

  it('un intervalo en DÍAS cuenta desde el último cambio; sin cambio ni horas, no hay con qué (SIN DATOS)', () => {
    const plan = [{ actividad: 'Limpieza general', horas: null, dias: 30, primer: null }];
    const t = [{ equipo: 'BLW-02', actividad: 'Limpieza general', estado: 'Completado', fecha: '2026-10-01', horometro: 700 }];
    const r = proximos({ equipos: m.equipos, plan, trabajos: t, lista: m.lista, hoy: '2026-10-25' });
    expect(uno(r, 'BLW-02', 'Limpieza general')).toMatchObject({ proxF: '2026-10-31', faltanD: 6, estado: MNT_ESTADO.PROXIMO });
    expect(uno(r, 'BLW-03', 'Limpieza general').estado).toBe(MNT_ESTADO.SIN_DATOS);
    expect(uno(proximos({ equipos: m.equipos, plan, trabajos: t, lista: m.lista, hoy: '2026-11-02' }), 'BLW-02', 'Limpieza general').estado)
      .toBe(MNT_ESTADO.VENCIDO);
  });

  it('por urgencia: vencidos, luego próximos; los stand by al final', () => {
    const u = porUrgencia(l.filter((x) => x.actividad === 'Cambio de aceite'));
    expect(u.slice(0, 2).map((x) => x.equipo)).toEqual(['BLW-04', 'BLW-05']);
    expect(u[u.length - 1].equipo).toBe('BLW-01');
  });
});

describe('Mantenimiento · 📈 lecturas', () => {
  const m = modelo();
  const r = resumenLecturas(m.lecturas, m.equipos);
  const de = (q) => r.find((x) => x.equipo === q);

  it('el % de carga de la última corriente sobre la plena carga: 62 %, 53 % y 54 %, como el Excel', () => {
    expect([de('BLW-02').carga, de('BLW-01').carga, de('BLW-03').carga]).toEqual([62, 53, 54]);
    expect(de('BLW-02')).toMatchObject({ estado: 'NORMAL', n: 1 });
    const u = de('BLW-02').umbrales;
    expect([u.corriente, u.presion, u.temperatura].map((x) => Math.round(x * 1000) / 1000)).toEqual([70.4, 4.025, 80]);
  });

  it('las rondas que sólo traen el horómetro no son lecturas de operación', () => {
    expect(de('BLW-04')).toMatchObject({ estado: 'SIN LECTURA', n: 0, ultima: null });
  });

  it('🔴 REVISAR si la ÚLTIMA pasa su umbral; la corriente del FB 621 C no se juzga (sin referencia)', () => {
    const extra = [L('23/10/2026', 'BLW-02', '1040', { 'Corriente (A)': '72', 'Presión (psi)': '4' }),
      L('23/10/2026', 'BLW-11', '170', { 'Corriente (A)': '150' })];
    const r2 = resumenLecturas(leerLecturas(LIBRO.concat(extra)), m.equipos);
    expect(r2.find((x) => x.equipo === 'BLW-02')).toMatchObject({ estado: 'REVISAR', fuera: ['corriente'], n: 2 });
    expect(r2.find((x) => x.equipo === 'BLW-02').promedio.corriente).toBe(69.6);
    expect(r2.find((x) => x.equipo === 'BLW-11').estado).toBe('NORMAL');
    const justo = resumenLecturas(leerLecturas([L('23/10/2026', 'BLW-02', '1', { 'Presión (psi)': '4,025', 'Corriente (A)': '70,4' })]), m.equipos);
    expect(justo.find((x) => x.equipo === 'BLW-02').estado, 'justo EN el umbral no lo pasa').toBe('NORMAL');
  });

  it('la serie de un equipo, en orden y con el horómetro ajustado', () => {
    const s = serie(leerLecturas(LIBRO.concat([L('24/10/2026', 'BLW-09', '210')])), m.equipos, 'BLW-09', 'horometro');
    expect(s.map((x) => x.v)).toEqual([534.51, 543.51]);
  });

  /* 2026-10-28 (usuario: «Anularla en la hoja») · la ficha reenvía la fila de un equipo vaciado al corregir una ronda: mismo
     ID, sin lecturas y «Anulada en la ficha». Ni el horómetro ni las lecturas la cuentan; el historial la enseña. */
  it('🔴 una fila ANULADA por la ficha no cuenta para el horómetro ni para las lecturas; el historial la enseña', () => {
    const anulada = L('23/10/2026', 'BLW-02', '', { Observaciones: 'Anulada en la ficha' });
    const lec = leerLecturas(LIBRO.concat([anulada]));
    const lista = horometros(lec, m.trabajos, m.equipos);
    expect(horometroActual(lista, 'BLW-02').h).toBe(1028.42);
    expect(lista.filter((x) => x.equipo === 'BLW-02' && x.fecha === '2026-10-23')).toEqual([]);
    expect(resumenLecturas(lec, m.equipos).find((x) => x.equipo === 'BLW-02')).toMatchObject({ n: 1, estado: 'NORMAL' });
    expect(historial({ trabajos: [], lecturas: lec, equipo: 'BLW-02' }).lecturas[0].observaciones).toBe('Anulada en la ficha');
  });
});

describe('Mantenimiento · 📊 indicadores (la hoja «Estadísticas» del Excel)', () => {
  const m = modelo();
  const ind = indicadores(m);

  it('13 intervenciones, 8 preventivas, ninguna falla: 100 % preventivo y disponibilidad 100 %', () => {
    expect(ind.flota).toMatchObject({ total: 13, preventivos: 8, correctivos: 0, pctPreventivo: 100, mtbf: null, disponibilidad: 100, masFallas: '' });
    expect(ind.porEquipo.find((x) => x.equipo === 'BLW-03')).toMatchObject({ total: 3, preventivos: 2, horas: 927.3 });
    expect(ind.porEquipo.find((x) => x.equipo === 'BLW-04')).toMatchObject({ total: 0, pctPreventivo: null, horas: 513.38 });
  });

  it('🔴 con fallas: MTBF = horas ÷ correctivos, MTTR = parada por fallas ÷ correctivos, disponibilidad = MTBF ÷ (MTBF + MTTR)', () => {
    const fallas = [T('24/10/2026', 'BLW-02', 'Correctivo', 'Reparación / correctivo', '1050', { 'Parada (h)': '5', 'Costo (USD)': '120,5' }),
      T('26/10/2026', 'BLW-02', 'Correctivo', 'Reparación / correctivo', '1100', { 'Parada (h)': '3' })];
    const i = indicadores(modelo(LIBRO.concat(fallas)));
    const b = i.porEquipo.find((x) => x.equipo === 'BLW-02');
    expect(b).toMatchObject({ horas: 1100, correctivos: 2, mtbf: 550, mttr: 4, paradaFallas: 8, costo: 120.5, pctPreventivo: 33 });
    expect(b.disponibilidad).toBe(99.28);
    expect(i.flota).toMatchObject({ correctivos: 2, masFallas: 'BLW-02', mttr: 4 });
  });

  it('mes a mes y por actividad', () => {
    expect(anios(m.trabajos)).toEqual([2026]);
    const oct = mensual(m.trabajos, 2026)[9];
    expect(oct).toMatchObject({ mes: 10, preventivos: 8, correctivos: 0, total: 13 });
    const a = porActividad(m.trabajos, m.plan);
    expect(a.find((x) => x.actividad === 'Cambio de aceite').veces).toBe(7);
    expect(a.find((x) => x.actividad === 'Cambio de bandas').veces).toBe(1);
    expect(a.find((x) => x.actividad === 'Otro').veces).toBe(5);
  });
});

describe('Mantenimiento · 📜 historial', () => {
  it('de un equipo, del más reciente al más viejo', () => {
    const h = historial({ ...modelo(), equipo: 'BLW-03' });
    expect(h.trabajos.map((t) => t.fecha)).toEqual(['2026-10-21', '2026-10-21', '2026-10-06']);
    expect(h.lecturas.map((x) => x.fecha)).toEqual(['2026-10-22', '2026-10-06']);
    expect(historial(modelo()).trabajos).toHaveLength(13);
  });
});

describe('Mantenimiento · ⬇ el Excel', () => {
  it('cinco hojas, cada una con su cabecera; los trabajos con el horómetro real y el del tablero', () => {
    const m = modelo(LIBRO.concat([T('24/10/2026', 'BLW-09', 'Preventivo', 'Limpieza general', '210')]));
    const ind = indicadores(m);
    const h = hojasExcel({ ...m, prox: proximos({ ...m, hoy: '2026-10-24' }), lec: resumenLecturas(m.lecturas, m.equipos), ind });
    expect(h.map(([n]) => n)).toEqual(['Próximos cambios', 'Lecturas por equipo', 'Indicadores', 'Trabajos', 'Lecturas']);
    expect(h[0][1][1].slice(0, 2), 'lo más urgente primero').toEqual(['BLW-04', 'Cambio de aceite']);
    const trab = h[3][1];
    expect(trab).toHaveLength(15);
    const cab = trab[0];
    expect(trab[1][cab.indexOf('Equipo')]).toBe('BLW-09');
    expect([trab[1][cab.indexOf('Horómetro real (h)')], trab[1][cab.indexOf('Horómetro del tablero (h)')]]).toEqual([543.51, 210]);
    expect(h[4][1]).toHaveLength(14);
    expect(h[2][1][0]).toContain('MTBF (h)');
  });
});
