/* PARIDAD · 🔧 Mantenimiento (2026-10-28). El modelo de sus dos fichas vive en el módulo y como bloque en línea en
   engine.js (index (8) no tiene módulos, y su bloque es el mismo texto: lo vigila verificar-3copias-v3). Se extrae el
   bloque REAL del motor y se le exige lo mismo que al módulo: las listas, las cabeceras y la respuesta de cada regla
   sobre los mismos casos. Valores FICTICIOS. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { sanitizeStr } from '../../../core/trovan.js';
import * as M from './ficha-mantenimiento.schema.js';

const src = readFileSync(new URL('../../../../public/registros/engine.js', import.meta.url), 'utf8').split('\r\n').join('\n');
const DESDE = 'const MNT_TRAB_SHEET = "Mantenimiento Trabajos";';
const HASTA = '/* ── fin del modelo de Mantenimiento ── */';
function bloque() {
  const i = src.indexOf(DESDE);
  if (i < 0) throw new Error('Ancla de inicio no encontrada: ' + DESDE);
  const j = src.indexOf(HASTA, i);
  if (j < 0) throw new Error('Ancla de fin no encontrada: ' + HASTA);
  return src.slice(i, j);
}
const NOMBRES = ['MNT_TRAB_SHEET', 'MNT_LECT_SHEET', 'MNT_EQUIPOS', 'MNT_TIPOS', 'MNT_ACTIVIDADES', 'MNT_ESTADOS', 'MNT_RANGOS',
  'MNT_TRAB_COLUMNS', 'MNT_TRAB_HEADERS', 'MNT_LECTURAS', 'MNT_LECT_HEADERS', 'mntEsHora', 'mntEquipo', 'mntNum',
  'mntParadaHoras', 'mntParada', 'mntNuevoId', 'mntValidarTrabajo', 'mntLecturaVacia', 'mntValidarRonda', 'mntFilaTrabajo',
  'mntFilasRonda', 'buildMntTrabajoPayload', 'buildMntRondaPayload', 'mntHorometros', 'mntHorometroBaja', 'mntAvisosRonda',
  'mntAvisosTrabajo'];
const ctx = { String, Number, Object, Array, JSON, Math, Date, isNaN, isFinite, sanitizeStr };
ctx.globalThis = ctx;
createContext(ctx);
new Script(bloque() + '\n;globalThis.__api = {' + NOMBRES.join(', ') + '};').runInContext(ctx);
const E = ctx.__api;
/* Lo que sale del reino del vm se compara por su JSON (un array de allí no es `instanceof Array` de aquí); NaN se
   escribe aparte, porque JSON lo convierte en null. */
const J = (x) => JSON.stringify(x, (k, v) => (typeof v === 'number' && Number.isNaN(v) ? 'NaN' : v));

const trabajo = (v = {}) => ({ id: 'MT-1', fecha: '2026-10-21', equipo: 'BLW-03', tipo: 'Preventivo',
  actividad: 'Cambio de aceite', horometro: '927,30', estado: 'Completado', ...v });
const ronda = (equipos, v = {}) => ({ id: 'MR-1', fecha: '2026-10-22', hora: '12:04', tecnico: 'Técnico A', equipos, ...v });
const TRABAJOS = [
  {}, null, trabajo(), trabajo({ equipo: 'BLW-12', actividad: 'Pintura', estado: 'Hecho' }),
  trabajo({ horometro: 'abc' }), trabajo({ horometro: '250000', cantidad: '2,5', costo: '-1', aceite: '300', parada: 'x' }),
  trabajo({ horaInicio: '25:00', horaFin: '9:00' }), trabajo({ tipo: 'Correctivo', actividad: 'Reparación / correctivo' }),
  trabajo({ tipo: 'Correctivo', horaInicio: '22:00', horaFin: '01:30', repuestos: 'Bandas', cantidad: '4', costo: '1.028,42' }),
  trabajo({ tipo: 'Correctivo', parada: '36,5', descripcion: '=SUMA(A1)', observaciones: '+x', tecnico: '@y' }),
  trabajo({ fecha: '21/10/2026', horometro: '', estado: '' }),
];
const RONDAS = [
  {}, null, ronda({}), ronda({ 'BLW-01': { horometro: '  ' } }), ronda({ 'BLW-01': { obs: 'STAND BY' } }),
  ronda({ 'BLW-09': { horometro: '534,51', corriente: '61', obs: 'tablero atrasado' }, 'BLW-02': { horometro: '1028,42', presion: '4' } }),
  ronda({ 'BLW-02': { horometro: '1,028.42', presion: '40', temperatura: '-1' }, 'BLW-03': { corriente: 'x' } }),
  ronda({ 'BLW-11': { horometro: '164' }, 'BLW-99': { horometro: '1' } }, { fecha: '', hora: '7' }),
];
const LISTA = [{ data: ronda({ 'BLW-03': { horometro: '927,30' }, 'BLW-04': { horometro: '513,38' } }) }];
const TRAB_LISTA = [{ data: trabajo({ id: 'MT-x', fecha: '2026-10-25', horometro: '1000' }) }, { data: trabajo({ fecha: 'x' }) }];

describe('PARIDAD · Mantenimiento · el bloque de engine.js dice lo mismo que el módulo', () => {
  it('el fixture sirve: el bloque existe y trae todo lo que se compara', () => {
    NOMBRES.forEach((n) => expect(E[n], n + ' falta en el bloque del motor').toBeDefined());
    expect(E.MNT_EQUIPOS.length).toBe(11);
  });

  it.each(['MNT_TRAB_SHEET', 'MNT_LECT_SHEET', 'MNT_EQUIPOS', 'MNT_TIPOS', 'MNT_ACTIVIDADES', 'MNT_ESTADOS', 'MNT_RANGOS',
    'MNT_TRAB_COLUMNS', 'MNT_TRAB_HEADERS', 'MNT_LECTURAS', 'MNT_LECT_HEADERS'])('%s', (n) => {
    expect(J(E[n])).toBe(J(M[n]));
  });

  it('mntNum, mntEsHora, mntParadaHoras, mntEquipo y mntNuevoId', () => {
    ['534,51', '534.51', '1,028.42', '1.028,42', ' 64 ', 0, '', null, undefined, 'abc', '1,2,3', '1e3', '-5', '0x10']
      .forEach((v) => expect(J(E.mntNum(v)), J(v)).toBe(J(M.mntNum(v))));
    ['08:00', '8:00', '23:59', '24:00', '', null, '12:60'].forEach((h) => expect(E.mntEsHora(h)).toBe(M.mntEsHora(h)));
    [['08:00', '09:30'], ['22:00', '02:00'], ['08:00', '08:00'], ['08:00', ''], ['x', '09:00']]
      .forEach(([a, b]) => expect(J(E.mntParadaHoras(a, b))).toBe(J(M.mntParadaHoras(a, b))));
    ['BLW-01', 'BLW-11', 'BLW-12', '', null].forEach((c) => expect(J(E.mntEquipo(c))).toBe(J(M.mntEquipo(c))));
    expect(E.mntNuevoId('MT', '2026-10-28', 123456789)).toBe(M.mntNuevoId('MT', '2026-10-28', 123456789));
  });

  it.each(TRABAJOS.map((t, i) => [i, t]))('trabajo %i: validación, parada y fila', (_i, t) => {
    expect(J(E.mntValidarTrabajo(t))).toBe(J(M.mntValidarTrabajo(t)));
    expect(J(E.mntParada(t))).toBe(J(M.mntParada(t)));
    expect(J(E.mntFilaTrabajo(t))).toBe(J(M.mntFilaTrabajo(t)));
  });

  it.each(RONDAS.map((r, i) => [i, r]))('ronda %i: validación y filas', (_i, r) => {
    expect(J(E.mntValidarRonda(r))).toBe(J(M.mntValidarRonda(r)));
    expect(J(E.mntFilasRonda(r))).toBe(J(M.mntFilasRonda(r)));
    expect(E.mntLecturaVacia(r && r.equipos && r.equipos['BLW-01'])).toBe(M.mntLecturaVacia(r && r.equipos && r.equipos['BLW-01']));
  });

  it('los envíos', () => {
    const recs = TRABAJOS.map((data) => ({ data })).concat([null]);
    expect(J(E.buildMntTrabajoPayload(recs))).toBe(J(M.buildMntTrabajoPayload(recs)));
    const rs = RONDAS.map((data) => ({ data }));
    expect(J(E.buildMntRondaPayload(rs))).toBe(J(M.buildMntRondaPayload(rs)));
  });

  it('«el horómetro no baja»: la lista, la comparación y los avisos', () => {
    const le = E.mntHorometros(LISTA, TRAB_LISTA), lm = M.mntHorometros(LISTA, TRAB_LISTA);
    expect(J(le)).toBe(J(lm));
    [['BLW-04', '2026-10-23', '500', 'o'], ['BLW-04', '2026-10-23', '520', 'o'], ['BLW-03', '2026-10-23', '950', 'o'],
      ['BLW-03', '2026-10-25', '990', 'MT-x'], ['BLW-03', '2026-10-25', '990', 'o'], ['BLW-03', 'x', '1', 'o'], ['BLW-03', '2026-10-25', '', 'o']]
      .forEach((a) => expect(J(E.mntHorometroBaja(lm, ...a)), J(a)).toBe(J(M.mntHorometroBaja(lm, ...a))));
    RONDAS.concat([ronda({ 'BLW-04': { horometro: '500' } }, { id: 'MR-n', fecha: '2026-10-23' })])
      .forEach((r) => expect(J(E.mntAvisosRonda(lm, r))).toBe(J(M.mntAvisosRonda(lm, r))));
    TRABAJOS.concat([trabajo({ id: 'MT-n', equipo: 'BLW-04', fecha: '2026-10-23', horometro: '500' })])
      .forEach((t) => expect(J(E.mntAvisosTrabajo(lm, t))).toBe(J(M.mntAvisosTrabajo(lm, t))));
  });
});
