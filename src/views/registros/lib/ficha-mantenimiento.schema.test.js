/* ============================================================
   REGISTROS · 🔧 Mantenimiento · las reglas de sus dos fichas (2026-10-28, usuario)

   Lo que el modelo puro tiene que decir: las listas del Excel de Blowers, las dos cabeceras (con el ID el último), cómo
   lee un número tecleado, la parada de un trabajo, qué falta o está mal, las filas de la hoja y el aviso «el horómetro
   baja». El monolito lleva su copia; la ata ficha-mantenimiento.paridad.test.js. Valores FICTICIOS.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  MNT_TRAB_SHEET, MNT_LECT_SHEET, MNT_EQUIPOS, MNT_TIPOS, MNT_ACTIVIDADES, MNT_ESTADOS, MNT_TRAB_HEADERS, MNT_LECT_HEADERS,
  mntNum, mntParadaHoras, mntParada, mntNuevoId, mntValidarTrabajo, mntValidarRonda, mntLecturaVacia, mntFilaTrabajo,
  mntFilasRonda, buildMntTrabajoPayload, buildMntRondaPayload, mntHorometros, mntHorometroBaja, mntAvisosRonda,
  mntAvisosTrabajo,
} from './ficha-mantenimiento.schema.js';

const trabajo = (v = {}) => ({ id: 'MT-2026-10-21-abc', fecha: '2026-10-21', equipo: 'BLW-03', tipo: 'Preventivo',
  actividad: 'Cambio de aceite', horometro: '927,30', estado: 'Completado', ...v });
const ronda = (equipos, v = {}) => ({ id: 'MR-2026-10-22-xyz', fecha: '2026-10-22', hora: '12:04', tecnico: 'Técnico A', equipos, ...v });
const col = (h) => MNT_TRAB_HEADERS.indexOf(h);

describe('Mantenimiento · las listas y las hojas', () => {
  it('los 11 blowers del Excel: diez FB 441 C y el BLW-11, FB 621 C', () => {
    expect(MNT_EQUIPOS.map((q) => q.codigo)).toEqual(Array.from({ length: 11 }, (_, i) => 'BLW-' + String(i + 1).padStart(2, '0')));
    expect(MNT_EQUIPOS.filter((q) => q.modelo === 'FB 441 C')).toHaveLength(10);
    expect(MNT_EQUIPOS[10].modelo).toBe('FB 621 C');
  });

  it('el plan de 10 actividades, los 4 tipos y los 3 estados del diccionario', () => {
    expect(MNT_ACTIVIDADES).toHaveLength(10);
    expect(MNT_ACTIVIDADES[0]).toBe('Cambio de aceite');
    expect(MNT_TIPOS).toEqual(['Preventivo', 'Correctivo', 'Predictivo', 'Inspección']);
    expect(MNT_ESTADOS).toEqual(['Completado', 'Pendiente', 'En proceso']);
  });

  it('las dos hojas, con el ID el ÚLTIMO (la lección del AsT) y sin las columnas calculadas del Excel', () => {
    expect(MNT_TRAB_SHEET).toBe('Mantenimiento Trabajos');
    expect(MNT_LECT_SHEET).toBe('Mantenimiento Lecturas');
    expect(MNT_TRAB_HEADERS).toHaveLength(17);
    expect(MNT_TRAB_HEADERS.at(-1)).toBe('ID');
    expect(MNT_TRAB_HEADERS).not.toContain('Próximo por horas (h)');
    expect(MNT_LECT_HEADERS).toEqual(['Fecha', 'Hora', 'Equipo', 'Horómetro (h)', 'Corriente (A)', 'Presión (psi)',
      'Temperatura (°C)', 'Técnico', 'Observaciones', 'ID']);
  });
});

describe('Mantenimiento · números y parada', () => {
  it.each([
    ['534,51', 534.51], ['534.51', 534.51], ['1,028.42', 1028.42], ['1.028,42', 1028.42], [' 64 ', 64], [0, 0],
    ['', ''], [null, ''], ['abc', NaN], ['1,2,3', NaN],
  ])('mntNum(%j) → %j', (v, r) => {
    if (Number.isNaN(r)) expect(mntNum(v)).toBeNaN();
    else expect(mntNum(v)).toBe(r);
  });

  it('la parada sale de las dos horas, cruza la medianoche y no se inventa si falta una', () => {
    expect(mntParadaHoras('08:00', '09:30')).toBe(1.5);
    expect(mntParadaHoras('22:00', '02:00')).toBe(4);
    expect(mntParadaHoras('08:00', '08:20')).toBe(0.33);
    expect(mntParadaHoras('08:00', '')).toBe('');
    expect(mntParadaHoras('8:00', '09:00'), 'una hora mal escrita no es una hora').toBe('');
  });

  it('una parada escrita a mano (más de un día) manda sobre las horas', () => {
    expect(mntParada({ horaInicio: '08:00', horaFin: '10:00' })).toBe(2);
    expect(mntParada({ horaInicio: '08:00', horaFin: '10:00', parada: '36,5' })).toBe(36.5);
    expect(mntParada({})).toBe('');
  });

  it('el ID nace con el registro: prefijo, día e instante', () => {
    expect(mntNuevoId('MT', '2026-10-28', 36 ** 3)).toBe('MT-2026-10-28-1000');
  });
});

describe('Mantenimiento · un trabajo: qué falta o está mal', () => {
  it('uno completo se puede guardar', () => {
    expect(mntValidarTrabajo(trabajo())).toEqual([]);
  });

  it('dice TODO lo que falta de una vez', () => {
    expect(mntValidarTrabajo({})).toEqual(['falta la fecha, el equipo, el tipo, la actividad, el horómetro, el estado']);
  });

  it('un equipo, una actividad o un estado que no están en las listas no valen', () => {
    expect(mntValidarTrabajo(trabajo({ equipo: 'BLW-12' }))[0]).toBe('falta el equipo');
    expect(mntValidarTrabajo(trabajo({ actividad: 'Pintura' }))[0]).toBe('falta la actividad');
  });

  it('números imposibles, no numéricos o con decimales donde no van', () => {
    expect(mntValidarTrabajo(trabajo({ horometro: 'abc' }))).toEqual(['el horómetro no es un número']);
    expect(mntValidarTrabajo(trabajo({ horometro: '250000' }))).toEqual(['el horómetro está fuera de lo posible (0 a 200000)']);
    expect(mntValidarTrabajo(trabajo({ cantidad: '2,5' }))).toEqual(['la cantidad tiene que ser un número entero']);
    expect(mntValidarTrabajo(trabajo({ costo: '-1' }))).toEqual(['el costo está fuera de lo posible (0 a 1000000)']);
  });

  it('una hora mal escrita se dice', () => {
    expect(mntValidarTrabajo(trabajo({ horaInicio: '25:00' }))).toEqual(['la hora de inicio no es una hora (HH:MM)']);
  });

  it('🔴 un correctivo COMPLETADO necesita su parada; pendiente, todavía no', () => {
    const c = trabajo({ tipo: 'Correctivo', actividad: 'Reparación / correctivo' });
    expect(mntValidarTrabajo(c)).toEqual(['un correctivo completado necesita su parada: la hora de inicio y la de fin, o las horas']);
    expect(mntValidarTrabajo({ ...c, horaInicio: '08:00', horaFin: '11:15' })).toEqual([]);
    expect(mntValidarTrabajo({ ...c, parada: '30' })).toEqual([]);
    expect(mntValidarTrabajo({ ...c, estado: 'Pendiente' })).toEqual([]);
  });
});

describe('Mantenimiento · una ronda: qué falta o está mal', () => {
  it('sin ningún equipo anotado no se guarda', () => {
    expect(mntValidarRonda(ronda({}))).toEqual(['anota al menos un equipo']);
    expect(mntValidarRonda(ronda({ 'BLW-01': { horometro: '  ' } }))).toEqual(['anota al menos un equipo']);
  });

  it('un equipo con sólo su observación cuenta (un blower parado se anota así)', () => {
    expect(mntLecturaVacia({ obs: 'STAND BY' })).toBe(false);
    expect(mntValidarRonda(ronda({ 'BLW-01': { obs: 'STAND BY' } }))).toEqual([]);
  });

  it('cada lectura imposible se dice con su equipo', () => {
    expect(mntValidarRonda(ronda({ 'BLW-02': { horometro: '1028,42', presion: '40' }, 'BLW-03': { corriente: 'x' } }))).toEqual([
      'BLW-02: Presión (psi) fuera de lo posible (0 a 15)', 'BLW-03: Corriente (A) no es un número']);
  });

  it('la fecha hace falta y la hora, si se pone, tiene que ser una hora', () => {
    expect(mntValidarRonda(ronda({ 'BLW-01': { horometro: '1' } }, { fecha: '', hora: '7' }))).toEqual([
      'falta la fecha', 'la hora no es una hora (HH:MM)']);
  });
});

describe('Mantenimiento · las filas de la hoja', () => {
  it('un trabajo es UNA fila con sus números como números, la parada calculada y el texto saneado', () => {
    const f = mntFilaTrabajo(trabajo({ cantidad: '4', costo: '120,50', horaInicio: '08:00', horaFin: '09:30',
      descripcion: '=Primer cambio', aceite: '5' }));
    expect(f).toHaveLength(17);
    expect(f[col('Horómetro (h)')]).toBe(927.3);
    expect(f[col('Costo (USD)')]).toBe(120.5);
    expect(f[col('Parada (h)')]).toBe(1.5);
    expect(f[col('Descripción')], 'sin el «=» de una fórmula').toBe('Primer cambio');
    expect(f[col('Aceite usado (L)')]).toBe(5);
    expect(f[col('ID')]).toBe('MT-2026-10-21-abc');
  });

  it('una ronda es una fila por equipo ANOTADO, en el orden de los equipos, con el ID de la ronda + el equipo', () => {
    const filas = mntFilasRonda(ronda({ 'BLW-09': { horometro: '534,51', corriente: '61', obs: 'tablero atrasado' },
      'BLW-02': { horometro: '1028,42', presion: '4' }, 'BLW-05': {} }));
    expect(filas.map((r) => r[2])).toEqual(['BLW-02', 'BLW-09']);
    expect(filas[0]).toEqual(['2026-10-22', '12:04', 'BLW-02', 1028.42, '', 4, '', 'Técnico A', '', 'MR-2026-10-22-xyz-BLW-02']);
    expect(filas[1][MNT_LECT_HEADERS.indexOf('Observaciones')]).toBe('tablero atrasado');
  });

  it('los envíos llevan su hoja y su cabecera', () => {
    const t = buildMntTrabajoPayload([{ data: trabajo() }, null, { data: trabajo({ id: 'MT-2' }) }]);
    expect(t.sheetName).toBe(MNT_TRAB_SHEET);
    expect(t.headers).toEqual(MNT_TRAB_HEADERS);
    expect(t.rows).toHaveLength(2);
    const r = buildMntRondaPayload([{ data: ronda({ 'BLW-01': { horometro: '1' }, 'BLW-04': { horometro: '2' } }) }]);
    expect(r.sheetName).toBe(MNT_LECT_SHEET);
    expect(r.rows).toHaveLength(2);
  });
});

describe('Mantenimiento · «el horómetro no baja»', () => {
  const lista = mntHorometros(
    [{ data: ronda({ 'BLW-03': { horometro: '927,30' }, 'BLW-04': { horometro: '513,38' } }) }],
    [{ data: trabajo({ id: 'MT-x', fecha: '2026-10-25', horometro: '1000' }) }],
  );

  it('junta las lecturas de rondas y trabajos', () => {
    expect(lista).toEqual([
      { equipo: 'BLW-03', fecha: '2026-10-22', h: 927.3, id: 'MR-2026-10-22-xyz' },
      { equipo: 'BLW-04', fecha: '2026-10-22', h: 513.38, id: 'MR-2026-10-22-xyz' },
      { equipo: 'BLW-03', fecha: '2026-10-25', h: 1000, id: 'MT-x' },
    ]);
  });

  it('🔴 avisa si baja respecto a lo leído hasta ese día, y no si sube', () => {
    expect(mntHorometroBaja(lista, 'BLW-04', '2026-10-23', '500', 'otro')).toEqual({ fecha: '2026-10-22', h: 513.38 });
    expect(mntHorometroBaja(lista, 'BLW-04', '2026-10-23', '520', 'otro')).toBeNull();
  });

  it('lo leído DESPUÉS no cuenta, otro equipo tampoco, y el registro que se corrige no se compara consigo mismo', () => {
    expect(mntHorometroBaja(lista, 'BLW-03', '2026-10-23', '950', 'otro'), 'el 1000 es del 25').toBeNull();
    expect(mntHorometroBaja(lista, 'BLW-05', '2026-10-23', '1', 'otro')).toBeNull();
    expect(mntHorometroBaja(lista, 'BLW-03', '2026-10-25', '990', 'MT-x'), 'sin el propio, manda el 927,30').toBeNull();
    expect(mntHorometroBaja(lista, 'BLW-03', '2026-10-25', '990', 'otro')).toEqual({ fecha: '2026-10-25', h: 1000 });
  });

  it('los avisos se dicen con el equipo, lo nuevo y lo que ya marcaba', () => {
    expect(mntAvisosRonda(lista, ronda({ 'BLW-04': { horometro: '500' }, 'BLW-03': { horometro: '930' } }, { id: 'MR-n', fecha: '2026-10-23' })))
      .toEqual(['BLW-04: 500 h, y el 22/10 ya marcaba 513.38 h']);
    expect(mntAvisosTrabajo(lista, trabajo({ id: 'MT-n', equipo: 'BLW-04', fecha: '2026-10-23', horometro: '500' })))
      .toEqual(['BLW-04: 500 h, y el 22/10 ya marcaba 513.38 h']);
    expect(mntAvisosTrabajo(lista, trabajo({ id: 'MT-n', equipo: 'BLW-04', fecha: '2026-10-23', horometro: '' }))).toEqual([]);
  });
});
