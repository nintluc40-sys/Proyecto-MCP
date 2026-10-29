/* PLANTA · blowers.js (F3, 2026-10-29): el blower de cada módulo, de las hojas de 🔧 Mantenimiento. Filas con la forma
   del libro (las cabeceras de los .tsv de la importación) y los horómetros del Excel del 22-10. */
import { describe, it, expect } from 'vitest';
import { blowersPlanta, horometroNoAvanza, moduloDeUbicacion, UMBRAL_NO_AVANZA } from './blowers.js';
import { MNT_ESTADO } from '../mantenimiento/mantenimiento.data.js';

const HOY = '2026-10-29';
const equipo = (codigo, modelo, ubicacion, estado = 'En servicio') => ({ _SheetOrigin: 'Mantenimiento Equipos', 'Código': codigo, Modelo: modelo, 'Ubicación': ubicacion, Estado: estado });
const lectura = (fecha, hora, eq, h) => ({ _SheetOrigin: 'Mantenimiento Lecturas', Fecha: fecha, Hora: hora, Equipo: eq, 'Horómetro (h)': h });
const PLAN = [
  { _SheetOrigin: 'Mantenimiento Plan', Actividad: 'Cambio de aceite', 'Intervalo (h)': '3000', 'Primer cambio (h)': '500' },
  { _SheetOrigin: 'Mantenimiento Plan', Actividad: 'Cambio de bandas' },
];
const LIBRO = [
  equipo('BLW-01', 'FB 441 C', '—', 'Stand by'), equipo('BLW-02', 'FB 441 C', 'Módulo 2', 'Stand by'),
  equipo('BLW-04', 'FB 441 C', 'Módulo 4'), equipo('BLW-05', 'FB 441 C', 'Módulo 5'),
  equipo('BLW-07', 'FB 441 C', 'Bodega'), equipo('BLW-11', 'FB 621 C', 'Módulo 1 (Base 1 Larvicultura)'),
  ...PLAN,
  lectura('2026-10-22', '08:00', 'BLW-01', '918,4'), lectura('2026-10-22', '08:00', 'BLW-04', '513,38'),
  lectura('2026-10-22', '08:00', 'BLW-05', '483,35'), lectura('2026-10-22', '08:00', 'BLW-11', '164'),
];

describe('moduloDeUbicacion: el módulo que nombra la «Ubicación» de la hoja de Equipos', () => {
  it('«Módulo 4», sin tilde, con cero, abreviado, en mayúsculas y con lo que siga; lo demás, null', () => {
    expect(['Módulo 4', 'Modulo 04', 'M4', 'M10', 'MÓDULO 3', 'Módulo 1 (Base 1 Larvicultura)'].map(moduloDeUbicacion)).toEqual([4, 4, 4, 10, 3, 1]);
    expect(['—', '', null, 'Bodega', 'Mantenimiento', 'Sala 5'].map(moduloDeUbicacion)).toEqual([null, null, null, null, null, null]);
  });
});

describe('blowersPlanta: el blower de cada módulo con el semáforo de la vista 🔧 Mantenimiento', () => {
  it('lo del Excel del 22-10: BLW-04 vencido (−13,38 h) y BLW-05 próximo (16,65 h); el BLW-11 es del Módulo 1', () => {
    const B = blowersPlanta(LIBRO, null, HOY);
    expect(Object.keys(B.porModulo)).toEqual(['M4', 'M5', 'M1']);
    const [b4] = B.porModulo.M4, [b5] = B.porModulo.M5, [b11] = B.porModulo.M1;
    expect(b4).toMatchObject({ codigo: 'BLW-04', modelo: 'FB 441 C', horometro: { h: 513.38, fecha: '2026-10-22' }, noAvanza: null });
    expect(b4.proximo).toMatchObject({ actividad: 'Cambio de aceite', estado: MNT_ESTADO.VENCIDO, faltanH: -13.38 });
    expect(b4.vencidos.map((p) => p.actividad)).toEqual(['Cambio de aceite']);
    expect(b5.proximo).toMatchObject({ estado: MNT_ESTADO.PROXIMO, faltanH: 16.65 });
    expect(b5.vencidos).toEqual([]);
    expect(b11.proximo).toMatchObject({ estado: MNT_ESTADO.AL_DIA, faltanH: 336 });
    // una actividad sin intervalo («—») nunca es «el próximo cambio»
    expect([b4, b5, b11].every((b) => b.proximo.actividad === 'Cambio de aceite')).toBe(true);
  });
  it('el de stand by (aunque su «Ubicación» nombre un módulo) y el que no está en un módulo del plano no salen en Planta', () => {
    const codigos = Object.values(blowersPlanta(LIBRO, null, HOY).porModulo).flat().map((b) => b.codigo);
    expect(codigos).toEqual(['BLW-04', 'BLW-05', 'BLW-11']);
    expect(blowersPlanta(LIBRO, null, HOY).porModulo.M2, 'BLW-02, en stand by en el Módulo 2').toBeUndefined();
  });
  it('sin las hojas de Mantenimiento (o sin ubicaciones), nada: Planta no inventa blowers', () => {
    expect(blowersPlanta([], null, HOY)).toEqual({ porModulo: {} });
    expect(blowersPlanta([{ _SheetOrigin: 'Larvicultura', Fecha: '2026-10-22' }], { modulos: {} }, HOY)).toEqual({ porModulo: {} });
  });
  it('sin horómetro: el blower sale igual, con su próximo cambio «sin datos»', () => {
    const [b] = blowersPlanta([equipo('BLW-04', 'FB 441 C', 'Módulo 4'), ...PLAN], null, HOY).porModulo.M4;
    expect(b.horometro).toBe(null);
    expect(b.proximo.estado).toBe(MNT_ESTADO.SIN_DATOS);
  });
});

describe('horómetro que no avanza con el módulo en cultivo (umbral del usuario: el 80 % de 24 h por día)', () => {
  const CULTIVO = { modulos: { M4: { tipo: 'cultivo', inicio: '2026-10-15' } } };
  const libro = (...lecturas) => [equipo('BLW-04', 'FB 441 C', 'Módulo 4'), ...PLAN, ...lecturas];
  const aviso = (rows, crono = CULTIVO) => blowersPlanta(rows, crono, HOY).porModulo.M4[0].noAvanza;

  it('5 días en cultivo y sumó 50 h (esperadas 120): avisa, con lo que sumó y desde cuándo', () => {
    expect(aviso(libro(lectura('2026-10-17', '08:00', 'BLW-04', '400'), lectura('2026-10-22', '08:00', 'BLW-04', '450'))))
      .toEqual({ desde: '2026-10-17', hasta: '2026-10-22', sumo: 50, esperadas: 120, dias: 5 });
  });
  it('el borde: con el 80 % justo no avisa; con un poco menos, sí', () => {
    expect(UMBRAL_NO_AVANZA).toBe(0.8);
    expect(aviso(libro(lectura('2026-10-17', '08:00', 'BLW-04', '400'), lectura('2026-10-22', '08:00', 'BLW-04', '496')))).toBe(null);
    expect(aviso(libro(lectura('2026-10-17', '08:00', 'BLW-04', '400'), lectura('2026-10-22', '08:00', 'BLW-04', '495,9')))).not.toBe(null);
  });
  it('usa las DOS ÚLTIMAS lecturas del cultivo, con su hora (y de día a día si a una le falta)', () => {
    // la del 17 sumó bien desde la del 16; la última (22, 20:00) sólo 10 h en 5 d 12 h → avisa por ESE tramo
    const r = aviso(libro(lectura('2026-10-16', '08:00', 'BLW-04', '376'), lectura('2026-10-17', '08:00', 'BLW-04', '400'),
      lectura('2026-10-22', '20:00', 'BLW-04', '410')));
    expect(r).toMatchObject({ desde: '2026-10-17', hasta: '2026-10-22', sumo: 10, esperadas: 132, dias: 5.5 });
    expect(aviso(libro(lectura('2026-10-17', '', 'BLW-04', '400'), lectura('2026-10-22', '20:00', 'BLW-04', '410')))).toMatchObject({ esperadas: 120 });
  });
  it('no se juzga: una sola lectura dentro del cultivo, las de antes de la siembra, el módulo sin cultivo o sin cronograma', () => {
    const dos = libro(lectura('2026-10-10', '08:00', 'BLW-04', '300'), lectura('2026-10-22', '08:00', 'BLW-04', '310'));
    expect(aviso(dos), 'la del 10 es de antes del cultivo (15-10): queda una').toBe(null);
    const parado = libro(lectura('2026-10-17', '08:00', 'BLW-04', '400'), lectura('2026-10-22', '08:00', 'BLW-04', '400'));
    expect(aviso(parado), 'control: en cultivo, avisa').not.toBe(null);
    expect(aviso(parado, { modulos: { M4: { tipo: 'despachado', inicio: '2026-10-15' } } })).toBe(null);
    expect(aviso(parado, { modulos: {} })).toBe(null);
    expect(aviso(parado, null)).toBe(null);
  });
  it('horometroNoAvanza: dos lecturas a la misma hora no dan un tramo', () => {
    const lista = [{ equipo: 'X', fecha: '2026-10-22', hora: '08:00', h: 10 }, { equipo: 'X', fecha: '2026-10-22', hora: '08:00', h: 10 }];
    expect(horometroNoAvanza(lista, 'X', { tipo: 'cultivo', inicio: '2026-10-01' }, HOY)).toBe(null);
  });
});
