/* 🌦 Clima · la capa de datos (2026-10-27, Sesión A ronda 9, tarea 1 · F2b).
   Filas con la forma que da el CSV de las hojas «Clima horas» y «Clima» (los números ya pasados a punto por
   core/sheets.js · valorDeCsv) y, aparte, la de la lectura por XLSX (Date). Datos ficticios.
   Lo que se guarda: las horas de Ecuador como instantes (UTC − 5), la hora de la pastilla (la más reciente que ya
   llegó), el aviso de «viejo» por «Actualizado» —no por la hora del dato—, las franjas, los incompletos y el mes. */
import { describe, it, expect } from 'vitest';
import {
  climaHoras, climaDias, ahoraEcuador, estadoHoy, horasDelDia, franjas, incompleto, pronostico, mesesDe, resumenMes,
  fmt, fmtInstante, textoPastilla, ATRIBUCION, HORAS_VIEJO,
} from './clima.data.js';

const H = 3600000;
const hora = (fecha, h, o = {}) => ({
  _SheetOrigin: 'Clima horas', Fecha: fecha, Hora: String(h), Fuente: 'MET', 'Temperatura (°C)': '25', 'Humedad (%)': '80',
  'Viento (km/h)': '10', 'Lluvia (mm)': '0', 'Nubosidad (%)': '50', Actualizado: '27/10/2026 15:00', ...o,
});
const dia = (fecha, o = {}) => ({
  _SheetOrigin: 'Clima', Fecha: fecha, Tipo: 'Registro', 'Temp mín (°C)': '23', 'Temp máx (°C)': '29', 'Temp media (°C)': '25.6',
  'Humedad (%)': '82', 'Lluvia (mm)': '1.2', 'Horas observadas': '13', 'Horas MET': '11', 'Horas NASA': '0', Actualizado: '27/10/2026 15:00', ...o,
});
/** Las 15:10 del 27/10 en Ecuador. */
const AHORA = Date.UTC(2026, 9, 27, 20, 10);

describe('las horas y los días de las dos hojas', () => {
  it('cada hora de Ecuador es un instante UTC + 5 h; sólo las de su hoja, ordenadas, y las ilegibles fuera', () => {
    const hs = climaHoras([
      hora('27/10/2026', 15, { 'Temperatura (°C)': '27.5', Fuente: 'Observado SESA' }), hora('27/10/2026', 0),
      { _SheetOrigin: 'Marea', Fecha: '27/10/2026', Hora: '1' }, hora('27/10/2026', 24), hora('', 3), hora('27/10/2026', ''),
    ]);
    expect(hs.map((h) => h.key + ' ' + h.hora)).toEqual(['2026-10-27 0', '2026-10-27 15']);
    expect(new Date(hs[1].ms).toISOString()).toBe('2026-10-27T20:00:00.000Z');
    expect(hs[1]).toMatchObject({ t: 27.5, hr: 80, v: 10, fuente: 'Observado SESA', lluvia: 0, nube: 50 });
    expect(new Date(hs[1].act).toISOString()).toBe('2026-10-27T20:00:00.000Z');   // «Actualizado», hora de Ecuador
  });

  it('la lectura por XLSX (fechas como Date, con la hora de pared) da lo mismo', () => {
    const [h] = climaHoras([hora(new Date(2026, 9, 27), 15, { Actualizado: new Date(2026, 9, 27, 15, 0) })]);
    expect(h.key).toBe('2026-10-27');
    expect(h.ms).toBe(Date.UTC(2026, 9, 27, 20));
    expect(h.act).toBe(Date.UTC(2026, 9, 27, 20));
  });

  it('una celda vacía es «sin dato», no un cero; y la coma decimal también se lee', () => {
    const [h] = climaHoras([hora('27/10/2026', 3, { 'Temperatura (°C)': '', 'Lluvia (mm)': '0,4' })]);
    expect(h.t).toBeNull();
    expect(h.lluvia).toBe(0.4);
  });

  it('los días, ordenados, con su tipo y sus horas por fuente', () => {
    const ds = climaDias([dia('28/10/2026', { Tipo: 'Pronóstico', 'Horas observadas': '0', 'Horas MET': '24' }), dia('26/10/2026'), hora('26/10/2026', 1)]);
    expect(ds.map((d) => d.key + ' ' + d.tipo)).toEqual(['2026-10-26 Registro', '2026-10-28 Pronóstico']);
    expect(ds[0]).toMatchObject({ tMin: 23, tMax: 29, tMed: 25.6, hr: 82, lluvia: 1.2, hSesa: 13, hMet: 11, hNasa: 0, horas: 24 });
  });
});

describe('«ahora» en Ecuador', () => {
  it('es UTC − 5, sin depender de la zona del equipo', () => {
    expect(ahoraEcuador(AHORA)).toEqual({ key: '2026-10-27', hora: 15 });
    expect(ahoraEcuador(Date.UTC(2026, 9, 28, 3, 30))).toEqual({ key: '2026-10-27', hora: 22 });   // las 03:30 UTC
  });
});

describe('la pastilla', () => {
  const horas = climaHoras([
    ...Array.from({ length: 24 }, (_, h) => hora('27/10/2026', h, h >= 6 && h <= 15 ? { Fuente: 'Observado SESA', 'Temperatura (°C)': String(20 + h / 2) } : {})),
  ]);

  it('da la hora más reciente que YA llegó: las que quedan del día (pronóstico de MET) no cuentan', () => {
    const e = estadoHoy(horas, AHORA);
    expect(e.hora).toMatchObject({ hora: 15, t: 27.5, fuente: 'Observado SESA' });
    expect(e.viejo).toBe(false);
  });

  it('una hora sin temperatura no es la de la pastilla: se queda la anterior', () => {
    const hs = climaHoras([hora('27/10/2026', 14, { 'Temperatura (°C)': '26' }), hora('27/10/2026', 15, { 'Temperatura (°C)': '' })]);
    expect(estadoHoy(hs, AHORA).hora.hora).toBe(14);
  });

  it(`«viejo» se mide por «Actualizado»: con el script parado, las horas de hoy siguen ahí y parecerían al día`, () => {
    // la última pasada escribió a las 08:00: el dato de las 15:00 es el pronóstico de esa pasada
    const paradas = climaHoras(Array.from({ length: 24 }, (_, h) => hora('27/10/2026', h, { Actualizado: '27/10/2026 08:00' })));
    const e = estadoHoy(paradas, AHORA);
    expect(e.hora.hora).toBe(15);
    expect(e.viejo).toBe(true);
    expect(fmtInstante(e.act)).toBe('27/10 08:00');
    // justo en el límite de las 6 h, todavía no
    expect(estadoHoy(paradas, Date.UTC(2026, 9, 27, 13) + HORAS_VIEJO * H).viejo).toBe(false);
    expect(estadoHoy(paradas, Date.UTC(2026, 9, 27, 13) + HORAS_VIEJO * H + 1).viejo).toBe(true);
  });

  it('manda la escritura MÁS reciente de todas las filas, no la de la hora elegida', () => {
    const hs = climaHoras([hora('27/10/2026', 15, { Actualizado: '27/10/2026 06:00' }), hora('27/10/2026', 16, { Actualizado: '27/10/2026 15:00' })]);
    expect(estadoHoy(hs, AHORA)).toMatchObject({ viejo: false, act: Date.UTC(2026, 9, 27, 20) });
  });

  it('sin «Actualizado», cuenta la hora del dato', () => {
    const hs = climaHoras([hora('27/10/2026', 3, { Actualizado: '' })]);
    expect(estadoHoy(hs, AHORA)).toMatchObject({ viejo: true, act: Date.UTC(2026, 9, 27, 8) });
  });

  it('sin horas de clima no hay pastilla', () => {
    expect(estadoHoy([], AHORA)).toBeNull();
    expect(textoPastilla(null)).toBeNull();
  });

  it('el texto: temperatura · humedad · viento, a la española; la hora y la fuente en la ayuda; y el aviso', () => {
    const t = textoPastilla(estadoHoy(horas, AHORA));
    expect(t.texto).toBe('🌦 27,5 °C · 80 % · 10 km/h');
    expect(t.ayuda).toBe('15:00 · Observado SESA · ' + ATRIBUCION);
    const v = textoPastilla({ hora: null, act: Date.UTC(2026, 9, 27, 13), viejo: true });
    expect(v).toMatchObject({ texto: '🌦 ⚠ sin actualizar desde 27/10 08:00', viejo: true });
    expect(textoPastilla({ hora: { hora: 4, t: 24, hr: null, v: null, fuente: 'NASA' }, act: 0, viejo: false }).texto).toBe('🌦 24 °C');
  });
});

describe('el día: franjas, incompletos y pronóstico', () => {
  it('cuatro franjas de 6 h: medias, extremos, la lluvia SUMADA y cuántas horas tienen dato', () => {
    const hs = horasDelDia(climaHoras([
      hora('27/10/2026', 0, { 'Temperatura (°C)': '22', 'Lluvia (mm)': '0.5' }), hora('27/10/2026', 5, { 'Temperatura (°C)': '24', 'Lluvia (mm)': '1' }),
      hora('27/10/2026', 6, { 'Temperatura (°C)': '26', 'Viento (km/h)': '14', 'Lluvia (mm)': '' }), hora('26/10/2026', 1),
    ]), '2026-10-27');
    const f = franjas(hs);
    expect(f.map((x) => x.desde + '-' + x.hasta)).toEqual(['0-6', '6-12', '12-18', '18-24']);
    expect(f[0]).toMatchObject({ n: 2, tMed: 23, tMin: 22, tMax: 24, lluvia: 1.5 });
    expect(f[1]).toMatchObject({ n: 1, tMed: 26, v: 14, vMax: 14, lluvia: null });
    expect(f[3]).toMatchObject({ n: 0, tMed: null, lluvia: null });
  });

  it('un «Registro» sin cifras dice cuántas horas tuvo; un pronóstico, no', () => {
    const [reg, pron] = climaDias([dia('27/10/2026', { 'Temp media (°C)': '', 'Horas observadas': '10', 'Horas MET': '5' }), dia('28/10/2026', { Tipo: 'Pronóstico', 'Temp media (°C)': '' })]);
    expect(incompleto(reg)).toBe('incompleto (15 de 24 h)');
    expect(incompleto(pron)).toBe('');
    expect(incompleto(climaDias([dia('26/10/2026')])[0])).toBe('');
  });

  it('el pronóstico, sólo de los días POSTERIORES a hoy', () => {
    const ds = climaDias([dia('27/10/2026', { Tipo: 'Pronóstico' }), dia('28/10/2026', { Tipo: 'Pronóstico' }), dia('29/10/2026', { Tipo: 'Pronóstico' }), dia('26/10/2026')]);
    expect(pronostico(ds, '2026-10-27').map((d) => d.key)).toEqual(['2026-10-28', '2026-10-29']);
  });
});

describe('el mes', () => {
  const ds = climaDias([
    dia('30/09/2026'), dia('01/10/2026', { 'Temp media (°C)': '24', 'Lluvia (mm)': '3' }), dia('02/10/2026', { 'Temp media (°C)': '26', 'Temp mín (°C)': '21', 'Lluvia (mm)': '0.4' }),
    dia('03/10/2026', { 'Temp media (°C)': '', 'Temp mín (°C)': '', 'Temp máx (°C)': '', 'Lluvia (mm)': '' }), dia('04/10/2026', { Tipo: 'Pronóstico', 'Lluvia (mm)': '9' }),
  ]);
  it('los meses con días, en orden', () => {
    expect(mesesDe(ds)).toEqual(['2026-09', '2026-10']);
  });
  it('el resumen sale de los «Registro» con cifra: medias, extremos, la lluvia y los días incompletos (el pronóstico no cuenta)', () => {
    const r = resumenMes(ds.filter((d) => d.key.startsWith('2026-10')));
    expect(r).toMatchObject({ dias: 3, tMed: 25, tMin: 21, tMax: 29, lluvia: 3.4, diasLluvia: 1, incompletos: 1 });
  });
});

describe('los números, a la española', () => {
  it('coma decimal, hasta los decimales pedidos, y «—» sin dato', () => {
    expect(fmt(27.46)).toBe('27,5');
    expect(fmt(80, 0)).toBe('80');
    expect(fmt(1012.4)).toBe('1012,4');
    expect(fmt(null)).toBe('—');
    expect(fmt(NaN)).toBe('—');
  });
});
